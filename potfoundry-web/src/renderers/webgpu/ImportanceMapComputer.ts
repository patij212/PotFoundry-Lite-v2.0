/**
 * ImportanceMapComputer.ts
 * 
 * GPU-based Pre-computation of Importance Map for Adaptive Triangulation
 * 
 * This class computes a 2D texture of importance values by sampling style displacement
 * curvature across the UV domain. The CPU triangulator uses this map to place points
 * proportionally to importance, creating dense triangles near features and sparse
 * triangles in flat areas.
 * 
 * Key insight: This shader samples the ACTUAL style functions (not just base geometry)
 * to detect where style features create curvature that needs subdivision.
 */

import { PotDimensions, StyleOptions, StyleId } from '../../geometry/types';
import { buildStyleParamPayload } from '../../utils/styleParams';

/**
 * Parameters for importance map computation
 */
export interface ImportanceMapParams {
    dimensions: PotDimensions;
    styleId: StyleId;
    styleOpts: StyleOptions;
    styleIndex: number;
    gridSize?: number; // Default: 64x64
    featureSegments?: Float32Array; // Optional: boost importance near feature lines
    featureGridOffsets?: Uint32Array;
}

/**
 * Result of importance map computation
 */
export interface ImportanceMapResult {
    importanceMap: Float32Array;  // gridSize * gridSize values in [0, 1]
    gridSize: number;
    computeTimeMs: number;
}

/**
 * GPU Compute class for importance map generation
 */
export class ImportanceMapComputer {
    private device: GPUDevice;
    private initialized = false;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    /**
     * Initialize the compute pipeline with shader source
     */
    async init(shaderSource: string): Promise<void> {
        // Create bind group layout
        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'ImportanceMap BindGroupLayout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
            ]
        });

        const pipelineLayout = this.device.createPipelineLayout({
            label: 'ImportanceMap PipelineLayout',
            bindGroupLayouts: [this.bindGroupLayout]
        });

        const shaderModule = this.device.createShaderModule({
            label: 'ImportanceMap Shader',
            code: shaderSource
        });

        // Check for compilation errors
        const compilationInfo = await shaderModule.getCompilationInfo();
        if (compilationInfo.messages.length > 0) {
            for (const msg of compilationInfo.messages) {
                const type = msg.type === 'error' ? 'ERROR' : msg.type.toUpperCase();
                console.error(`[ImportanceMap Shader ${type}] Line ${msg.lineNum}:${msg.linePos}: ${msg.message}`);
            }
            if (compilationInfo.messages.some(m => m.type === 'error')) {
                throw new Error('ImportanceMap shader compilation failed');
            }
        }

        this.pipeline = this.device.createComputePipeline({
            label: 'ImportanceMap Pipeline',
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: 'main'
            }
        });

        this.initialized = true;
        console.log('[ImportanceMapComputer] Initialized');
    }

    /**
     * Compute the importance map
     */
    async compute(params: ImportanceMapParams): Promise<ImportanceMapResult> {
        if (!this.initialized || !this.pipeline || !this.bindGroupLayout) {
            throw new Error('ImportanceMapComputer not initialized');
        }

        const startTime = performance.now();
        const gridSize = params.gridSize || 64;
        const totalCells = gridSize * gridSize;

        // Create buffers
        const uniformBuffer = this.device.createBuffer({
            size: 64, // 16 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'ImportanceMap Uniforms'
        });

        const styleParamsBuffer = this.device.createBuffer({
            size: 192, // 48 floats
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'ImportanceMap StyleParams'
        });

        const outputBuffer = this.device.createBuffer({
            size: totalCells * 4, // Float32 per cell
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            label: 'ImportanceMap Output'
        });

        const readbackBuffer = this.device.createBuffer({
            size: totalCells * 4,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label: 'ImportanceMap Readback'
        });

        // Feature segments (optional, empty if not provided)
        const featureSegments = params.featureSegments || new Float32Array(0);
        const featureSegmentsBuffer = this.device.createBuffer({
            size: Math.max(4, featureSegments.byteLength),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'ImportanceMap FeatureSegments'
        });

        const featureGridOffsets = params.featureGridOffsets || new Uint32Array(65); // 64 bins + 1
        const featureGridOffsetsBuffer = this.device.createBuffer({
            size: Math.max(4, featureGridOffsets.byteLength),
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'ImportanceMap FeatureGridOffsets'
        });

        // Write uniform data
        const { dimensions, styleOpts } = params;
        const uniformData = new Float32Array([
            dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
            dimensions.tBottom, dimensions.rDrain, dimensions.expn, params.styleIndex,
            styleOpts.spinTurns ?? 0, ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180,
            styleOpts.spinCurveExp ?? 1, styleOpts.seamAngle ?? 0,
            gridSize, 0, 0, 0 // gridSize in uniform, rest reserved
        ]);
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData);

        // Write style params
        // buildStyleParamPayload takes (styleName, options) and returns [styleId, params]
        const [, styleParamsArray] = buildStyleParamPayload(params.styleId, styleOpts as Record<string, unknown>);
        if (styleParamsArray && styleParamsArray.length > 0) {
            this.device.queue.writeBuffer(styleParamsBuffer, 0, new Float32Array(styleParamsArray));
        }

        // Write feature data
        if (featureSegments.length > 0) {
            // Ensure ArrayBuffer compatibility with WebGPU types
            this.device.queue.writeBuffer(featureSegmentsBuffer, 0, new Float32Array(featureSegments));
        }
        this.device.queue.writeBuffer(featureGridOffsetsBuffer, 0, new Uint32Array(featureGridOffsets));

        // Create bind group
        const bindGroup = this.device.createBindGroup({
            label: 'ImportanceMap BindGroup',
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: styleParamsBuffer } },
                { binding: 2, resource: { buffer: outputBuffer } },
                { binding: 3, resource: { buffer: featureSegmentsBuffer } },
                { binding: 4, resource: { buffer: featureGridOffsetsBuffer } },
            ]
        });

        // Run compute pass
        const encoder = this.device.createCommandEncoder({ label: 'ImportanceMap Encoder' });
        const pass = encoder.beginComputePass({ label: 'ImportanceMap Pass' });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);

        // Dispatch: one thread per cell, workgroup size 8x8
        const workgroupsX = Math.ceil(gridSize / 8);
        const workgroupsY = Math.ceil(gridSize / 8);
        pass.dispatchWorkgroups(workgroupsX, workgroupsY);
        pass.end();

        // Copy to readback buffer
        encoder.copyBufferToBuffer(outputBuffer, 0, readbackBuffer, 0, totalCells * 4);
        this.device.queue.submit([encoder.finish()]);

        // Read back results
        await readbackBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(readbackBuffer.getMappedRange().slice(0));
        readbackBuffer.unmap();

        // Cleanup
        uniformBuffer.destroy();
        styleParamsBuffer.destroy();
        outputBuffer.destroy();
        readbackBuffer.destroy();
        featureSegmentsBuffer.destroy();
        featureGridOffsetsBuffer.destroy();

        const computeTimeMs = performance.now() - startTime;
        console.log(`[ImportanceMapComputer] Computed ${gridSize}x${gridSize} map in ${computeTimeMs.toFixed(1)}ms`);

        return {
            importanceMap: resultData,
            gridSize,
            computeTimeMs
        };
    }

    /**
     * Check if initialized
     */
    isReady(): boolean {
        return this.initialized;
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.pipeline = null;
        this.bindGroupLayout = null;
        this.initialized = false;
    }
}
