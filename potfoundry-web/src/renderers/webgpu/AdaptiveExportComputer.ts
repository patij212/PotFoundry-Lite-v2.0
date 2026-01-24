
/**
 * AdaptiveExportComputer.ts
 * 
 * GPU-based Adaptive Refinement.
 * Now accepts an explicit "Base Mesh" from the host.
 */

import { MeshData, PotDimensions, StyleOptions, StyleId } from '../../geometry/types';
import { buildStyleParamPayload } from '../../utils/styleParams';

export interface AdaptiveExportParams {
    dimensions: PotDimensions;
    styleId: StyleId;
    styleOpts: StyleOptions;
    styleIndex: number;
    targetTriangles?: number;
    subdivThreshold?: number;
    maxDepth?: number;
    // Base Mesh Injection for Feature-Constrained Mode
    baseMesh?: { vertices: Float32Array, indices: Uint32Array };
}

export interface AdaptiveExportResult {
    mesh: MeshData;
    computeTimeMs: number;
    finalTriangleCount: number;
    subdivisionStats: {
        initialQuads: number;
        finalQuads: number;
        maxDepthReached: number;
    };
}

const WORKGROUP_SIZE = 64;
const INITIAL_GRID_SIZE = 360; // Matches Shader (High Res Uniform)
const NUM_SURFACES = 6;
const MAX_QUADS = 2_000_000; // Hard limit to prevent memory explosion (was 8M)
const MAX_VERTICES = 100_000_000;
const MAX_INDICES = 300_000_000;
const MAX_DISPATCH_X = 65535;

function packStyleParams(opts: StyleOptions, styleId: string): Float32Array {
    const [_, paramArray] = buildStyleParamPayload(styleId, opts as Record<string, unknown>);
    return new Float32Array(paramArray);
}

function dispatchWorkgroups2D(pass: GPUComputePassEncoder, totalItems: number) {
    const totalWorkgroups = Math.ceil(totalItems / WORKGROUP_SIZE);
    if (totalWorkgroups <= MAX_DISPATCH_X) {
        pass.dispatchWorkgroups(totalWorkgroups, 1, 1);
    } else {
        const x = MAX_DISPATCH_X;
        const y = Math.ceil(totalWorkgroups / MAX_DISPATCH_X);
        pass.dispatchWorkgroups(x, y, 1);
    }
}

export class AdaptiveExportComputer {
    private device: GPUDevice;
    private initialized = false;

    private initGridPipeline: GPUComputePipeline | null = null;
    private subdividePipeline: GPUComputePipeline | null = null;
    private emitPipeline: GPUComputePipeline | null = null;
    private evaluatePipeline: GPUComputePipeline | null = null;

    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipelineLayout: GPUPipelineLayout | null = null;

    constructor(device: GPUDevice) {
        this.device = device;
    }

    async init(shaderSource: string): Promise<void> {
        if (this.initialized) return;

        const shaderModule = this.device.createShaderModule({
            label: 'adaptive_mesh_compute',
            code: shaderSource,
        });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            label: 'adaptive_bind_group_layout',
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // quads_current (Input/Output)
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // quads_next
                { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // features (optional, but we bind a dummy if null)
            ],
        });

        this.pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout!],
        });

        this.initGridPipeline = await this.device.createComputePipelineAsync({
            label: 'init_coarse_grid',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'init_coarse_grid' },
        });

        this.subdividePipeline = await this.device.createComputePipelineAsync({
            label: 'evaluate_and_subdivide',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'evaluate_and_subdivide' },
        });

        this.emitPipeline = await this.device.createComputePipelineAsync({
            label: 'emit_remaining_quads',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'emit_remaining_quads' },
        });

        this.evaluatePipeline = await this.device.createComputePipelineAsync({
            label: 'evaluate_vertices',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'evaluate_vertices' },
        });

        this.initialized = true;
    }

    async compute(params: AdaptiveExportParams): Promise<AdaptiveExportResult> {
        if (!this.initialized) throw new Error('Not initialized');
        const startTime = performance.now();

        const maxQuadBytes = MAX_QUADS * 16;
        const maxVertexBytes = MAX_VERTICES * 12;
        const maxIndexBytes = MAX_INDICES * 4;

        // Buffers
        const uniformBuffer = this.device.createBuffer({
            size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const styleParamBuffer = this.device.createBuffer({
            size: 48 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const vertexBuffer = this.device.createBuffer({
            size: maxVertexBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        const indexBuffer = this.device.createBuffer({
            size: maxIndexBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        const countersBuffer = this.device.createBuffer({
            size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        const quadsCurrentBuffer = this.device.createBuffer({
            size: maxQuadBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        const quadsNextBuffer = this.device.createBuffer({
            size: maxQuadBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        // Write Uniforms & Style Params
        const { dimensions, styleOpts, maxDepth = 6, subdivThreshold = 1.0, targetTriangles = 20_000_000 } = params;
        const uniformData = new Float32Array([
            dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
            dimensions.tBottom, dimensions.rDrain, dimensions.expn, params.styleIndex,
            styleOpts.spinTurns ?? 0, ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180, styleOpts.spinCurveExp ?? 1, styleOpts.seamAngle ?? 0,
            styleOpts.bellAmp ?? 0, styleOpts.bellCenter ?? 0.5, styleOpts.bellWidth ?? 0.22, maxDepth,
            subdivThreshold, 0.0000001, targetTriangles, 0,
        ]);
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as any);
        this.device.queue.writeBuffer(styleParamBuffer, 0, packStyleParams(styleOpts, params.styleId) as any);

        // Initialize counters
        const initialQuadCount = INITIAL_GRID_SIZE * INITIAL_GRID_SIZE * NUM_SURFACES;
        const initialCounters = new Uint32Array([0, 0, initialQuadCount, 0]);
        this.device.queue.writeBuffer(countersBuffer, 0, initialCounters as any);

        // Dummy Feature Buffer (Not used in BaseMesh mode, but required by BindGroup)
        const tempFeatureBuffer = this.device.createBuffer({
            size: 16, usage: GPUBufferUsage.STORAGE,
        });

        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: styleParamBuffer } },
                { binding: 2, resource: { buffer: vertexBuffer } },
                { binding: 3, resource: { buffer: indexBuffer } },
                { binding: 4, resource: { buffer: countersBuffer } },
                { binding: 5, resource: { buffer: quadsCurrentBuffer } },
                { binding: 6, resource: { buffer: quadsNextBuffer } },
                { binding: 7, resource: { buffer: tempFeatureBuffer } },
            ]
        });

        let currentQuadCount = 0;
        let depth = 0;

        // Mode Switching
        if (params.baseMesh) {
            const { vertices: baseVerts, indices: baseIndices } = params.baseMesh;
            const vertexCount = baseVerts.length / 3;
            const indexCount = baseIndices.length;

            // 1. Upload Topology
            this.device.queue.writeBuffer(vertexBuffer, 0, baseVerts as any);
            this.device.queue.writeBuffer(indexBuffer, 0, baseIndices as any);

            // 2. Run Vertex Evaluation Kernel
            if (this.evaluatePipeline) {
                const evalEncoder = this.device.createCommandEncoder();
                const evalPass = evalEncoder.beginComputePass();
                evalPass.setPipeline(this.evaluatePipeline);
                evalPass.setBindGroup(0, bindGroup);

                const totalThreads = vertexCount;
                const workgroups = Math.ceil(totalThreads / 64);
                evalPass.dispatchWorkgroups(workgroups);
                evalPass.end();
                this.device.queue.submit([evalEncoder.finish()]);
            }

            // Set counters for readback
            this.device.queue.writeBuffer(countersBuffer, 0, new Uint32Array([vertexCount, indexCount]) as any);

        } else {
            // Standard Adaptive Loop (Legacy / Uniform)
            currentQuadCount = initialQuadCount;

            const encoder = this.device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.initGridPipeline!);
            pass.setBindGroup(0, bindGroup);
            dispatchWorkgroups2D(pass, initialQuadCount);
            pass.end();
            this.device.queue.submit([encoder.finish()]);

            // Emit Remaining/Uniform
            if (currentQuadCount > 0) {
                this.device.queue.writeBuffer(countersBuffer, 8, new Uint32Array([currentQuadCount]) as any);
                const finalEncoder = this.device.createCommandEncoder();
                const finalPass = finalEncoder.beginComputePass();
                finalPass.setPipeline(this.emitPipeline!);
                finalPass.setBindGroup(0, bindGroup);
                dispatchWorkgroups2D(finalPass, currentQuadCount);
                finalPass.end();
                this.device.queue.submit([finalEncoder.finish()]);
            }
        }


        // Readback
        const vertexStaging = this.device.createBuffer({ size: maxVertexBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const indexStaging = this.device.createBuffer({ size: maxIndexBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
        const countStaging = this.device.createBuffer({ size: 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

        const readEncoder = this.device.createCommandEncoder();
        readEncoder.copyBufferToBuffer(vertexBuffer, 0, vertexStaging, 0, maxVertexBytes);
        readEncoder.copyBufferToBuffer(indexBuffer, 0, indexStaging, 0, maxIndexBytes);
        readEncoder.copyBufferToBuffer(countersBuffer, 0, countStaging, 0, 8);
        this.device.queue.submit([readEncoder.finish()]);

        await Promise.all([
            vertexStaging.mapAsync(GPUMapMode.READ),
            indexStaging.mapAsync(GPUMapMode.READ),
            countStaging.mapAsync(GPUMapMode.READ),
        ]);

        const counts = new Uint32Array(countStaging.getMappedRange());
        const vertexCount = counts[0];
        const indexCount = counts[1];

        const vertices = new Float32Array(vertexStaging.getMappedRange().slice(0, vertexCount * 12));
        const indices = new Uint32Array(indexStaging.getMappedRange().slice(0, indexCount * 4));

        vertexStaging.unmap(); indexStaging.unmap(); countStaging.unmap();

        uniformBuffer.destroy(); styleParamBuffer.destroy(); vertexBuffer.destroy(); indexBuffer.destroy();
        countersBuffer.destroy(); quadsCurrentBuffer.destroy(); quadsNextBuffer.destroy();
        vertexStaging.destroy(); indexStaging.destroy(); countStaging.destroy();
        if (tempFeatureBuffer) tempFeatureBuffer.destroy();

        return {
            mesh: { vertices, indices, vertexCount, triangleCount: indexCount / 3 },
            computeTimeMs: performance.now() - startTime,
            finalTriangleCount: indexCount / 3,
            subdivisionStats: { initialQuads: initialQuadCount, finalQuads: currentQuadCount, maxDepthReached: depth },
        };
    }

    isReady(): boolean { return this.initialized; }
    destroy(): void { this.initialized = false; }
}
