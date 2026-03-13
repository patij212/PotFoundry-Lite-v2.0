/**
 * GPUErrorEstimator — GPU compute pipeline for per-triangle error estimation.
 *
 * Computes chord error and normal error entirely on GPU using style functions,
 * eliminating the CPU roundtrip of the existing `estimateErrorsGPU()` path.
 *
 * @module GPUErrorEstimator
 */

import type { TriangleError } from './AdaptiveRefinement';

/** Configuration for a single error estimation dispatch. */
interface ErrorEstimationConfig {
    /** Finite-difference step size for FD normal computation. */
    fdEpsilon: number;
}

const DEFAULT_CONFIG: ErrorEstimationConfig = {
    fdEpsilon: 1e-4,
};

/**
 * Ensure data uploaded with queue.writeBuffer is backed by ArrayBuffer.
 * This avoids TS mismatch on typed arrays whose buffer type is ArrayBufferLike.
 */
function toGPUBufferSource(data: Float32Array | Uint32Array): GPUAllowSharedBufferSource {
    if (data.buffer instanceof ArrayBuffer) {
        return data as unknown as GPUAllowSharedBufferSource;
    }
    return data.slice() as unknown as GPUAllowSharedBufferSource;
}

/**
 * GPU-accelerated per-triangle error estimator.
 *
 * Manages a compute pipeline that evaluates chord error and normal error
 * for each outer-wall triangle in a single GPU dispatch, without readback
 * of intermediate midpoint positions.
 *
 * Phase 11.1 — Buffer Pooling (P2): Reuses GPU buffers across iterations.
 * Buffers are created at 1.5× current capacity and only recreated when the
 * mesh grows beyond them. This eliminates per-frame buffer churn.
 */
export class GPUErrorEstimator {
    private device: GPUDevice;
    private pipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipelineLayout: GPUPipelineLayout | null = null;
    private initialized = false;

    // ── Buffer Pool (Phase 11.1 — P2) ──────────────────────────────
    private pooledPosBuffer: GPUBuffer | null = null;
    private pooledPosCapacity = 0;       // in bytes
    private pooledUvBuffer: GPUBuffer | null = null;
    private pooledUvCapacity = 0;
    private pooledIdxBuffer: GPUBuffer | null = null;
    private pooledIdxCapacity = 0;
    private pooledErrorBuffer: GPUBuffer | null = null;
    private pooledErrorCapacity = 0;     // in bytes
    private pooledStagingBuffer: GPUBuffer | null = null;
    private pooledStagingCapacity = 0;
    /** Headroom factor: allocate 1.5× current need for growth. */
    private static readonly POOL_HEADROOM = 1.5;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    /**
     * Initialize the compute pipeline with the assembled shader source.
     *
     * @param shaderSource - Assembled WGSL: style environment + error_estimation.wgsl
     */
    async init(shaderSource: string): Promise<void> {
        if (this.initialized) return;

        const shaderModule = this.device.createShaderModule({
            label: 'error_estimation_compute',
            code: shaderSource,
        });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'error_estimation_bind_group_layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },          // uniforms
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // style_params
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // positions
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // uvs
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // indices
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },           // errors (output)
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // config
            ],
        });

        this.pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout],
        });

        this.pipeline = await this.device.createComputePipelineAsync({
            label: 'error_estimation_pipeline',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'estimate_triangle_errors' },
        });

        this.initialized = true;
        console.log('[GPUErrorEstimator] Pipeline initialized.');
    }

    /**
     * Ensure a pooled buffer exists with at least the required capacity.
     * If the existing buffer is too small, destroy it and create a new one
     * with headroom.
     */
    private ensureBuffer(
        current: GPUBuffer | null,
        currentCapacity: number,
        requiredBytes: number,
        usage: GPUBufferUsageFlags,
        label: string,
    ): { buffer: GPUBuffer; capacity: number } {
        if (current && currentCapacity >= requiredBytes) {
            return { buffer: current, capacity: currentCapacity };
        }
        if (current) current.destroy();
        const capacity = Math.ceil(requiredBytes * GPUErrorEstimator.POOL_HEADROOM);
        const buffer = this.device.createBuffer({ size: capacity, usage, label });
        return { buffer, capacity };
    }

    /**
     * Estimate per-triangle errors using the GPU compute shader.
     *
     * Uses pooled buffers to avoid per-call allocation overhead.
     * Buffers are created with 1.5× headroom and reused until the mesh
     * outgrows them.
     *
     * @param positions - Packed [x,y,z,...] 3D vertex positions.
     * @param uvs - Packed [u,t,surfId,...] UV data.
     * @param indices - Triangle index buffer.
     * @param outerIdxCount - Number of outer-wall indices (must be multiple of 3).
     * @param uniformBuffer - GPU uniform buffer (same as used by ParametricExportComputer).
     * @param styleParamBuffer - GPU style params buffer.
     * @param config - Optional configuration overrides.
     * @returns Array of TriangleError for all outer-wall triangles.
     */
    async estimateErrors(
        positions: Float32Array,
        uvs: Float32Array,
        indices: Uint32Array,
        outerIdxCount: number,
        uniformBuffer: GPUBuffer,
        styleParamBuffer: GPUBuffer,
        config: ErrorEstimationConfig = DEFAULT_CONFIG,
    ): Promise<TriangleError[]> {
        if (!this.initialized || !this.pipeline || !this.bindGroupLayout) {
            throw new Error('[GPUErrorEstimator] Not initialized. Call init() first.');
        }

        const outerTriCount = Math.floor(outerIdxCount / 3);
        if (outerTriCount === 0) return [];

        const startMs = performance.now();

        // ── Ensure pooled buffers (Phase 11.1 — P2) ─────────────────
        const posUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        const posResult = this.ensureBuffer(
            this.pooledPosBuffer, this.pooledPosCapacity,
            positions.byteLength, posUsage, 'EE_Positions_Pooled',
        );
        this.pooledPosBuffer = posResult.buffer;
        this.pooledPosCapacity = posResult.capacity;
        this.device.queue.writeBuffer(this.pooledPosBuffer, 0, toGPUBufferSource(positions));

        const uvResult = this.ensureBuffer(
            this.pooledUvBuffer, this.pooledUvCapacity,
            uvs.byteLength, posUsage, 'EE_UVs_Pooled',
        );
        this.pooledUvBuffer = uvResult.buffer;
        this.pooledUvCapacity = uvResult.capacity;
        this.device.queue.writeBuffer(this.pooledUvBuffer, 0, toGPUBufferSource(uvs));

        const idxResult = this.ensureBuffer(
            this.pooledIdxBuffer, this.pooledIdxCapacity,
            indices.byteLength, posUsage, 'EE_Indices_Pooled',
        );
        this.pooledIdxBuffer = idxResult.buffer;
        this.pooledIdxCapacity = idxResult.capacity;
        this.device.queue.writeBuffer(this.pooledIdxBuffer, 0, toGPUBufferSource(indices));

        // Output: 4 floats per triangle
        const errorBufferSize = outerTriCount * 4 * 4; // 4 floats × 4 bytes
        const errResult = this.ensureBuffer(
            this.pooledErrorBuffer, this.pooledErrorCapacity,
            errorBufferSize, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, 'EE_Errors_Pooled',
        );
        this.pooledErrorBuffer = errResult.buffer;
        this.pooledErrorCapacity = errResult.capacity;

        // Staging buffer for readback
        const stagingResult = this.ensureBuffer(
            this.pooledStagingBuffer, this.pooledStagingCapacity,
            errorBufferSize, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, 'EE_Staging_Pooled',
        );
        this.pooledStagingBuffer = stagingResult.buffer;
        this.pooledStagingCapacity = stagingResult.capacity;

        // Config buffer: small, recreate each time (4 floats = 16 bytes)
        const configData = new Float32Array([outerTriCount, config.fdEpsilon, 0, 0]);
        const configBuffer = this.device.createBuffer({
            size: configData.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'EE_Config',
        });
        this.device.queue.writeBuffer(configBuffer, 0, configData);

        // ── Create bind group ───────────────────────────────────────
        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: styleParamBuffer } },
                { binding: 2, resource: { buffer: this.pooledPosBuffer } },
                { binding: 3, resource: { buffer: this.pooledUvBuffer } },
                { binding: 4, resource: { buffer: this.pooledIdxBuffer } },
                { binding: 5, resource: { buffer: this.pooledErrorBuffer } },
                { binding: 6, resource: { buffer: configBuffer } },
            ],
        });

        // ── Dispatch (2D grid when workgroups > 65535) ──────────────
        const totalWorkgroups = Math.ceil(outerTriCount / 64);
        let dispatchX: number;
        let dispatchY: number;
        if (totalWorkgroups <= 65535) {
            dispatchX = totalWorkgroups;
            dispatchY = 1;
        } else {
            dispatchX = 65535;
            dispatchY = Math.ceil(totalWorkgroups / 65535);
        }
        const encoder = this.device.createCommandEncoder({ label: 'EE_Dispatch' });
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(dispatchX, dispatchY);
        pass.end();

        // ── Readback ────────────────────────────────────────────────
        encoder.copyBufferToBuffer(this.pooledErrorBuffer, 0, this.pooledStagingBuffer, 0, errorBufferSize);
        this.device.queue.submit([encoder.finish()]);

        await this.pooledStagingBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(this.pooledStagingBuffer.getMappedRange().slice(0));
        this.pooledStagingBuffer.unmap();

        // ── Parse results ───────────────────────────────────────────
        const errors: TriangleError[] = [];
        for (let i = 0; i < outerTriCount; i++) {
            const base = i * 4;
            const posErrorMm = resultData[base];
            const normalErrorDeg = resultData[base + 1];
            const longestEdgeLenSq = resultData[base + 2];
            const longestEdgeIdx = Math.round(resultData[base + 3]);

            // Skip degenerate (all zeros)
            if (posErrorMm === 0 && normalErrorDeg === 0 && longestEdgeLenSq === 0) continue;

            errors.push({
                triIdx: i * 3, // index into the index buffer (offset, not triangle number)
                posErrorMm,
                normalErrorDeg,
                longestEdgeIdx,
                longestEdgeLenSq,
            });
        }

        // ── Cleanup (only config buffer, pooled buffers persist) ────
        configBuffer.destroy();

        const totalMs = performance.now() - startMs;
        console.log(`[GPUErrorEstimator] ${outerTriCount} triangles → ${errors.length} with errors (${totalMs.toFixed(1)}ms)`);

        return errors;
    }

    /** Release GPU resources including pooled buffers. */
    destroy(): void {
        this.pipeline = null;
        this.bindGroupLayout = null;
        this.pipelineLayout = null;
        this.initialized = false;
        // Destroy pooled buffers
        if (this.pooledPosBuffer) { this.pooledPosBuffer.destroy(); this.pooledPosBuffer = null; this.pooledPosCapacity = 0; }
        if (this.pooledUvBuffer) { this.pooledUvBuffer.destroy(); this.pooledUvBuffer = null; this.pooledUvCapacity = 0; }
        if (this.pooledIdxBuffer) { this.pooledIdxBuffer.destroy(); this.pooledIdxBuffer = null; this.pooledIdxCapacity = 0; }
        if (this.pooledErrorBuffer) { this.pooledErrorBuffer.destroy(); this.pooledErrorBuffer = null; this.pooledErrorCapacity = 0; }
        if (this.pooledStagingBuffer) { this.pooledStagingBuffer.destroy(); this.pooledStagingBuffer = null; this.pooledStagingCapacity = 0; }
    }

    /** Check if the estimator is ready. */
    isReady(): boolean {
        return this.initialized;
    }
}
