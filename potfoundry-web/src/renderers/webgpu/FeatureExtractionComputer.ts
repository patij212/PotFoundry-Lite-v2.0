
/**
 * FeatureExtractionComputer.ts
 *
 * Runs the GPU compute pass to detect surface features (ridges, valleys, creases).
 * This is the first stage of the "Peak" Adaptive Meshing pipeline.
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
    // We reuse the packing logic from AdaptiveExportComputer, but we need the raw values
    dimensions: {
        H: number, Rt: number, Rb: number, tWall: number,
        tBottom: number, rDrain: number, expn: number
    };
}

const FEATURE_STRUCT_SIZE = 16; // 4 floats (4*4 bytes)
const MAX_FEATURES = 100_000;   // Buffer size for sparse features

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

        const module = this.device.createShaderModule({
            label: 'feature_extract_module',
            code: shaderSource
        });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'feature_extract_bind_layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, // ExtractUniforms
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // style_params
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // feature_points
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // counter
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } }, // StyleUniforms (chunk0..3)
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
    }

    async compute(params: FeatureExtractionParams): Promise<FeaturePoint[]> {
        if (!this.initialized || !this.pipeline || !this.bindGroupLayout) {
            throw new Error('FeatureExtractionComputer not initialized');
        }

        const width = params.gridSizeX ?? 2048;
        const height = params.gridSizeY ?? 1024;
        const threshold = params.threshold ?? 20.0; // Higher default for 2nd derivative

        // 1. Create Buffers
        // ExtractUniforms: sizeX (u32), sizeY (u32), threshold (f32), minLen (f32)
        const extractUniformData = new ArrayBuffer(16);
        new Uint32Array(extractUniformData, 0, 2).set([width, height]);
        new Float32Array(extractUniformData, 8, 2).set([threshold, 0.0]);

        // Pass as Uint32Array to helper (it just copies bits)
        const extractUniformBuffer = this.createBuffer(new Uint32Array(extractUniformData), GPUBufferUsage.UNIFORM);

        // Style Params Buffer
        const [_, paramArray] = buildStyleParamPayload(params.styleId, params.styleOpts as Record<string, unknown>);
        const styleParamBuffer = this.createBuffer(new Float32Array(paramArray), GPUBufferUsage.STORAGE);

        // Feature Output Buffer
        const featureBufferSize = MAX_FEATURES * FEATURE_STRUCT_SIZE;
        const featureBuffer = this.device.createBuffer({
            size: featureBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        // Atomic Counter
        const counterBuffer = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(counterBuffer, 0, new Uint32Array([0]));

        // Style Uniforms (Chunks)
        // We reuse the packing layout: 
        // chunk0: H, Rt, Rb, reserved
        // chunk1: ..., ..., expn, styleId
        // chunk2: spinTurns, spinPhase, spinCurve, seamAngle
        // chunk3: bellAmp, bellCenter, bellWidth, reserved
        const { dimensions: dim, styleOpts } = params;
        const styleUniformData = new Float32Array([
            // Chunk 0
            dim.H, dim.Rt, dim.Rb, 0.0,
            // Chunk 1
            0.0, 0.0, dim.expn, params.styleIndex, // w=styleId
            // Chunk 2
            styleOpts.spinTurns ?? 0,
            ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180,
            styleOpts.spinCurveExp ?? 1,
            styleOpts.seamAngle ?? 0,
            // Chunk 3
            styleOpts.bellAmp ?? 0,
            styleOpts.bellCenter ?? 0.5,
            styleOpts.bellWidth ?? 0.22,
            0.0
        ]);
        const styleUniformBuffer = this.createBuffer(styleUniformData, GPUBufferUsage.UNIFORM);

        // 2. Bind Group
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

        // 3. Dispatch
        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);

        // Dispatch 1 thread per grid cell
        const totalThreads = width * height;
        const workgroups = Math.ceil(totalThreads / 64);
        pass.dispatchWorkgroups(workgroups);
        pass.end();

        // 4. Readback
        const counterStaging = this.createStagingBuffer(4);
        encoder.copyBufferToBuffer(counterBuffer, 0, counterStaging, 0, 4);

        // We can't copy the whole feature buffer blindly if it's huge, 
        // but 100k features * 16 bytes = 1.6MB is fine.
        const featureStaging = this.createStagingBuffer(featureBufferSize);
        encoder.copyBufferToBuffer(featureBuffer, 0, featureStaging, 0, featureBufferSize);

        this.device.queue.submit([encoder.finish()]);

        // Map and Read
        await counterStaging.mapAsync(GPUMapMode.READ);
        const count = new Uint32Array(counterStaging.getMappedRange())[0];
        counterStaging.unmap();

        console.log(`[FeatureExtraction] Found ${count} potential feature points`);

        if (count === 0) {
            return [];
        }

        const clampedCount = Math.min(count, MAX_FEATURES);
        const readSize = clampedCount * FEATURE_STRUCT_SIZE;

        await featureStaging.mapAsync(GPUMapMode.READ);
        // Single getMappedRange call
        const mappedRange = featureStaging.getMappedRange(0, readSize);
        const featureData = new Float32Array(mappedRange);
        const uintView = new Uint32Array(mappedRange);

        // Unpack
        const features: FeaturePoint[] = [];
        for (let i = 0; i < clampedCount; i++) {
            const base = i * 4;
            features.push({
                theta: featureData[base],
                t: featureData[base + 1],
                type: uintView[base + 2], // Read directly from uint view
                strength: featureData[base + 3]
            });
        }
        // No need for second loop or second getMappedRange

        featureStaging.unmap();

        // Cleanup
        extractUniformBuffer.destroy();
        styleParamBuffer.destroy();
        featureBuffer.destroy();
        counterBuffer.destroy();
        styleUniformBuffer.destroy();
        featureStaging.destroy();
        counterStaging.destroy();

        return features;
    }

    private createBuffer(data: Float32Array | Uint32Array, usage: number): GPUBuffer {
        const buffer = this.device.createBuffer({
            size: data.byteLength,
            usage: usage | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        if (data instanceof Float32Array) {
            new Float32Array(buffer.getMappedRange()).set(data);
        } else {
            new Uint32Array(buffer.getMappedRange()).set(data);
        }
        buffer.unmap();
        return buffer;
    }

    private createStagingBuffer(size: number): GPUBuffer {
        return this.device.createBuffer({
            size,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });
    }

    destroy(): void {
        this.initialized = false;
    }
}
