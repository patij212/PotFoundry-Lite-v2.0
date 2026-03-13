/**
 * parametric/SurfaceEvaluator.ts — GPU UV→XYZ evaluation wrapper.
 *
 * Owns the WebGPU compute pipeline for `evaluate_vertices`. Provides a simple
 * `evaluateBatch()` method that sends UV points to the GPU and reads back 3D
 * positions. All GPU resource management (bind groups, staging buffers) is
 * encapsulated here.
 *
 * The shader reads (u, t, surfaceId) from the vertex buffer and writes
 * (x, y, z) back in-place. See adaptive_mesh.wgsl `evaluate_vertices`.
 */

import type { PotDimensions, StyleId, StyleOptions } from '../../../geometry/types';
import { buildStyleParamPayload } from '../../../utils/styleParams';

export class SurfaceEvaluator {
    private device: GPUDevice;
    private evaluatePipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipelineLayout: GPUPipelineLayout | null = null;
    private initialized = false;

    /** Shared GPU buffers created once per compute() call */
    private uniformBuffer: GPUBuffer | null = null;
    private styleParamBuffer: GPUBuffer | null = null;
    private dummyBuffers: GPUBuffer[] = [];

    constructor(device: GPUDevice) {
        this.device = device;
    }

    async init(shaderSource: string): Promise<void> {
        if (this.initialized) return;

        const shaderModule = this.device.createShaderModule({
            label: 'parametric_eval_compute',
            code: shaderSource,
        });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'parametric_bind_group_layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
            ],
        });

        this.pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout],
        });

        this.evaluatePipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_evaluate_vertices',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'evaluate_vertices' },
        });

        this.initialized = true;
    }

    isReady(): boolean {
        return this.initialized;
    }

    /**
     * Configure the uniform and style param buffers for a specific export.
     * Must be called before evaluateBatch().
     */
    configureForExport(
        dimensions: PotDimensions,
        styleId: StyleId,
        styleOpts: StyleOptions,
        styleIndex: number,
    ): void {
        this.destroySharedBuffers();

        this.uniformBuffer = this.device.createBuffer({
            size: 80,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'Parametric_Uniforms',
        });

        this.styleParamBuffer = this.device.createBuffer({
            size: 48 * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'Parametric_StyleParams',
        });

        // Dummy buffers for unused bind group slots
        const makeDummy = (usage: number, label: string) => {
            const buf = this.device.createBuffer({ size: 16, usage, label });
            this.dummyBuffers.push(buf);
            return buf;
        };
        // We need 7 dummies for slots 3,4,5,6,7,8,9,10
        for (let i = 0; i < 7; i++) {
            const isReadOnly = (i === 2 || i === 3 || i === 5); // slots 5,6,8
            makeDummy(
                GPUBufferUsage.STORAGE | (isReadOnly ? GPUBufferUsage.COPY_DST : 0),
                `Parametric_Dummy${i}`,
            );
        }

        // Write uniforms
        const uniformData = new Float32Array([
            dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
            dimensions.tBottom, dimensions.rDrain, dimensions.expn, styleIndex,
            styleOpts.spinTurns ?? 0,
            ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180,
            styleOpts.spinCurveExp ?? 1,
            styleOpts.seamAngle ?? 0,
            styleOpts.bellAmp ?? 0, styleOpts.bellCenter ?? 0.5, styleOpts.bellWidth ?? 0.22, 0,
            0, 0, 0, 0,
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData.buffer);

        const [, packedStyleParams] = buildStyleParamPayload(
            styleId,
            styleOpts as Record<string, unknown>,
        );
        const styleData = new Float32Array(48);
        styleData.set(packedStyleParams.slice(0, Math.min(48, packedStyleParams.length)));
        this.device.queue.writeBuffer(this.styleParamBuffer, 0, styleData.buffer);
    }

    /**
     * Write the outer wall grid width to the uniform buffer.
     * Used by the relax shader for neighbor addressing (offset 76 = 19th float).
     */
    writeGridWidth(width: number): void {
        if (!this.uniformBuffer) return;
        const widthData = new Float32Array([width]);
        this.device.queue.writeBuffer(this.uniformBuffer, 76, widthData.buffer);
    }

    /**
     * Evaluate a batch of UV points on the GPU.
     *
     * @param uvVertices Float32Array of (u, t, surfaceId) triples
     * @returns Float32Array of (x, y, z) triples (same length)
     */
    async evaluateBatch(uvVertices: Float32Array): Promise<Float32Array> {
        if (!this.initialized || !this.uniformBuffer || !this.styleParamBuffer) {
            throw new Error('[SurfaceEvaluator] Not configured — call configureForExport() first');
        }

        const vertexBytes = uvVertices.byteLength;
        const vertexCount = uvVertices.length / 3;

        const vertexBuffer = this.device.createBuffer({
            size: vertexBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            label: 'Parametric_EvalVerts',
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, uvVertices.buffer);

        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.styleParamBuffer } },
                { binding: 2, resource: { buffer: vertexBuffer } },
                { binding: 3, resource: { buffer: this.dummyBuffers[0] } },
                { binding: 4, resource: { buffer: this.dummyBuffers[1] } },
                { binding: 5, resource: { buffer: this.dummyBuffers[2] } },
                { binding: 6, resource: { buffer: this.dummyBuffers[3] } },
                { binding: 7, resource: { buffer: this.dummyBuffers[4] } },
                { binding: 8, resource: { buffer: this.dummyBuffers[5] } },
                { binding: 9, resource: { buffer: this.dummyBuffers[6] } },
                { binding: 10, resource: { buffer: this.dummyBuffers[6] } }, // reuse last dummy
            ],
        });

        const workgroups = Math.ceil(vertexCount / 64);
        if (workgroups > 65535) {
            console.error(`[SurfaceEvaluator] Workgroup count ${workgroups} exceeds 65535 limit`);
        }

        const encoder = this.device.createCommandEncoder({ label: 'Parametric_Eval' });
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.evaluatePipeline!);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.min(workgroups, 65535));
        pass.end();
        this.device.queue.submit([encoder.finish()]);

        // Read back
        const stagingBuffer = this.device.createBuffer({
            size: vertexBytes,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label: 'Parametric_EvalStaging',
        });

        const readEncoder = this.device.createCommandEncoder();
        readEncoder.copyBufferToBuffer(vertexBuffer, 0, stagingBuffer, 0, vertexBytes);
        this.device.queue.submit([readEncoder.finish()]);

        await stagingBuffer.mapAsync(GPUMapMode.READ);
        const resultData = new Float32Array(stagingBuffer.getMappedRange().slice(0));
        stagingBuffer.unmap();

        vertexBuffer.destroy();
        stagingBuffer.destroy();

        return resultData;
    }

    private destroySharedBuffers(): void {
        this.uniformBuffer?.destroy();
        this.styleParamBuffer?.destroy();
        this.uniformBuffer = null;
        this.styleParamBuffer = null;
        for (const buf of this.dummyBuffers) buf.destroy();
        this.dummyBuffers = [];
    }

    destroy(): void {
        this.destroySharedBuffers();
        this.initialized = false;
    }
}
