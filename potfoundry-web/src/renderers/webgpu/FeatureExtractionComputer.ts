
/**
 * FeatureExtractionComputer.ts
 *
 * Runs the GPU compute pass to detect surface features (ridges, valleys, creases).
 * This is the first stage of the "Peak" Adaptive Meshing pipeline.
 * 
 * ROBUSTNESS UPGRADES:
 * - Strict Resource Scope (RAII-like pattern) for buffer cleanup.
 * - Explicit device validity checks.
 * - Comprehensive shader input validation.
 * - Defensive mapping/unmapping.
 */

import { buildStyleParamPayload } from '../../utils/styleParams';
import { StyleId, StyleOptions } from '../../geometry/types';

// ============================================================================
// Types
// ============================================================================

export interface FeaturePoint {
    theta: number;
    t: number;
    type: number; // 1=Ridge, 2=Valley, 3=Crease
    strength: number;
}

export interface FeatureExtractionParams {
    styleId: StyleId;
    styleOpts: StyleOptions;
    styleIndex: number;
    gridSizeX?: number; // Default 2048
    gridSizeY?: number; // Default 1024
    threshold?: number; // Curvature threshold (default 5.0)

    // Geometry params needed for style evaluation (twist, bell, etc)
    dimensions: {
        H: number;
        Rt: number;
        Rb: number;
        tWall: number;
        tBottom: number;
        rDrain: number;
        expn: number;
    };
}

const FEATURE_STRUCT_SIZE = 16; // 4 floats (4*4 bytes)
const MAX_FEATURES = 100_000;   // Buffer size for sparse features

/**
 * Helper class to track GPU resources and ensure cleanup
 */
class ResourceScope {
    private resources: { destroy: () => void }[] = [];

    track<T extends { destroy: () => void }>(resource: T): T {
        this.resources.push(resource);
        return resource;
    }

    dispose() {
        // Destroy in reverse order of creation (good practice)
        for (let i = this.resources.length - 1; i >= 0; i--) {
            try {
                this.resources[i].destroy();
            } catch (e) {
                console.warn('[ResourceScope] Error destroying resource:', e);
            }
        }
        this.resources = [];
    }
}

export class FeatureExtractionComputer {
    private device: GPUDevice;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private initialized = false;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    async init(shaderSource: string): Promise<void> {
        if (this.initialized) return;

        // Validation
        if (!this.device) throw new Error('Device is lost or undefined');

        try {
            const module = this.device.createShaderModule({
                label: 'feature_extract_module',
                code: shaderSource
            });

            // Compilation info check (optional, but good for debugging)
            const info = await module.getCompilationInfo();
            if (info.messages.some(m => m.type === 'error')) {
                const errs = info.messages.filter(m => m.type === 'error').map(m => m.message).join('\n');
                throw new Error(`Shader compilation failed:\n${errs}`);
            }

            this.bindGroupLayout = this.device.createBindGroupLayout({
                label: 'feature_extract_bind_layout',
                entries: [
                    { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // ExtractUniforms
                    { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // style_params
                    { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // feature_points
                    { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // counter
                    { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },           // StyleUniforms (chunk0..3)
                ]
            });

            const layout = this.device.createPipelineLayout({
                bindGroupLayouts: [this.bindGroupLayout]
            });

            this.pipeline = await this.device.createComputePipelineAsync({
                label: 'feature_extract_pipeline',
                layout,
                compute: { module, entryPoint: 'detect_features' }
            });

            this.initialized = true;
        } catch (error) {
            console.error('[FeatureExtractionComputer] Init failed:', error);
            // Ensure we don't leave half-initialized state
            this.destroy();
            throw error;
        }
    }

    async compute(params: FeatureExtractionParams): Promise<FeaturePoint[]> {
        if (!this.initialized || !this.pipeline || !this.bindGroupLayout) {
            throw new Error('FeatureExtractionComputer not initialized');
        }

        const width = params.gridSizeX ?? 2048;
        const height = params.gridSizeY ?? 1024;
        const threshold = params.threshold ?? 20.0;

        // Resource Scope for this execution
        const scope = new ResourceScope();

        try {
            // =========================================================
            // 1. Prepare Data & Buffers
            // =========================================================

            // ExtractUniforms: sizeX (u32), sizeY (u32), threshold (f32), minLen (f32)
            // Alignment check: u32, u32 (4+4=8), f32 (4), f32 (4) -> 16 bytes.
            const extractUniformData = new ArrayBuffer(16);
            const uniformView = new DataView(extractUniformData);
            uniformView.setUint32(0, width, true);
            uniformView.setUint32(4, height, true);
            uniformView.setFloat32(8, threshold, true);
            uniformView.setFloat32(12, 0.0, true); // minFeatureLen (unused currently)

            const extractUniformBuffer = scope.track(
                this.createBuffer(extractUniformData, GPUBufferUsage.UNIFORM, 'ExtractUniforms')
            );

            // Style Params Buffer (Read-Only Storage)
            // buildStyleParamPayload returns a float array of variable length
            const [_, paramArray] = buildStyleParamPayload(params.styleId, params.styleOpts as Record<string, unknown>);
            const styleParamBuffer = scope.track(
                this.createBuffer(new Float32Array(paramArray).buffer, GPUBufferUsage.STORAGE, 'StyleParams')
            );

            // Output Buffers
            const featureBufferSize = MAX_FEATURES * FEATURE_STRUCT_SIZE;
            const featureBuffer = scope.track(this.device.createBuffer({
                size: featureBufferSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                label: 'FeaturesOutput'
            }));

            // Atomic Counter
            const counterBuffer = scope.track(this.device.createBuffer({
                size: 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                label: 'FeatureCounter'
            }));
            // Init counter to 0
            this.device.queue.writeBuffer(counterBuffer, 0, new Uint32Array([0]));

            // Style Uniforms (16 floats / 64 bytes)
            // Must strictly match correct 'getf' mapping in shader
            const { dimensions: dim, styleOpts } = params;
            const styleUniformData = new Float32Array([
                // Chunk 0 (0-3)
                dim.H, dim.Rt, dim.Rb, 0.0,
                // Chunk 1 (4-7)
                0.0, 0.0, dim.expn, params.styleIndex,
                // Chunk 2 (8-11)
                styleOpts.spinTurns ?? 0,
                ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180, // Radians
                styleOpts.spinCurveExp ?? 1,
                styleOpts.seamAngle ?? 0,
                // Chunk 3 (12-15)
                styleOpts.bellAmp ?? 0,
                styleOpts.bellCenter ?? 0.5,
                styleOpts.bellWidth ?? 0.22,
                0.0
            ]);
            const styleUniformBuffer = scope.track(
                this.createBuffer(styleUniformData.buffer, GPUBufferUsage.UNIFORM, 'StyleUniforms')
            );

            // =========================================================
            // 2. Bind Group & Dispatch
            // =========================================================

            const bindGroup = this.device.createBindGroup({
                layout: this.bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: extractUniformBuffer } },
                    { binding: 1, resource: { buffer: styleParamBuffer } },
                    { binding: 2, resource: { buffer: featureBuffer } },
                    { binding: 3, resource: { buffer: counterBuffer } },
                    { binding: 4, resource: { buffer: styleUniformBuffer } },
                ]
            });

            const encoder = this.device.createCommandEncoder({ label: 'FeatureExtractEncoder' });
            const pass = encoder.beginComputePass({ label: 'FeatureExtractPass' });
            pass.setPipeline(this.pipeline);
            pass.setBindGroup(0, bindGroup);

            const totalThreads = width * height;
            const workgroups = Math.ceil(totalThreads / 64);
            pass.dispatchWorkgroups(workgroups);
            pass.end();

            // =========================================================
            // 3. Readback
            // =========================================================

            // Staging buffers for readback
            const counterStaging = scope.track(this.createStagingBuffer(4, 'CounterStaging'));
            const featureStaging = scope.track(this.createStagingBuffer(featureBufferSize, 'FeatureStaging'));

            encoder.copyBufferToBuffer(counterBuffer, 0, counterStaging, 0, 4);
            // We blindly copy the whole feature buffer. Usually faster than dependent copy on GPU side for small buffers.
            encoder.copyBufferToBuffer(featureBuffer, 0, featureStaging, 0, featureBufferSize);

            // Submit
            this.device.queue.submit([encoder.finish()]);

            // =========================================================
            // 4. Map & Parse
            // =========================================================

            // Read Count
            await counterStaging.mapAsync(GPUMapMode.READ);
            const countRange = counterStaging.getMappedRange();
            const count = new Uint32Array(countRange)[0];
            counterStaging.unmap();

            if (count === 0) {
                return [];
            }

            // Clamp count to safety limit
            const clampedCount = Math.min(count, MAX_FEATURES);
            if (count > MAX_FEATURES) {
                console.warn(`[FeatureExtraction] Output truncated: ${count} features found, limit ${MAX_FEATURES}`);
            }

            // Read Features
            // Only map what we need? No, map whole staging buffer usually safer/simpler
            await featureStaging.mapAsync(GPUMapMode.READ);
            const featureRange = featureStaging.getMappedRange(0, clampedCount * FEATURE_STRUCT_SIZE);

            // Views
            const featureFloats = new Float32Array(featureRange);
            const featureUints = new Uint32Array(featureRange);

            const features: FeaturePoint[] = new Array(clampedCount);

            // struct FeaturePoint { theta: f32, t: f32, featureType: u32, strength: f32 }
            for (let i = 0; i < clampedCount; i++) {
                const base = i * 4;
                features[i] = {
                    theta: featureFloats[base + 0],
                    t: featureFloats[base + 1],
                    type: featureUints[base + 2],
                    strength: featureFloats[base + 3]
                };
            }

            featureStaging.unmap();

            return features;

        } catch (error) {
            console.error('[FeatureExtractionComputer] Compute failed:', error);
            throw error;
        } finally {
            // Always clean up resources
            scope.dispose();
        }
    }

    /**
     * Helper to create initialized buffers
     */
    private createBuffer(data: ArrayBuffer, usage: number, label: string): GPUBuffer {
        // MappedAtCreation is most efficient for init
        const buffer = this.device.createBuffer({
            size: (data.byteLength + 3) & ~3, // Align to 4 bytes if needed
            usage: usage | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
            label
        });

        // Copy data in
        const writeArray = new Uint8Array(buffer.getMappedRange());
        writeArray.set(new Uint8Array(data)); // Robust byte-level copy
        buffer.unmap();

        return buffer;
    }

    private createStagingBuffer(size: number, label: string): GPUBuffer {
        return this.device.createBuffer({
            size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label
        });
    }

    destroy(): void {
        this.initialized = false;
        // BindGroups/Pipelines are managed by device mainly, but we clear refs
        this.pipeline = null;
        this.bindGroupLayout = null;
    }
}
