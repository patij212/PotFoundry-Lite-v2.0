
/**
 * AdaptiveExportComputer.ts
 * 
 * GPU-based Adaptive Refinement.
 * Now accepts an explicit "Base Mesh" from the host.
 */

import { MeshData, PotDimensions, StyleOptions, StyleId } from '../../geometry/types';
import { buildStyleParamPayload } from '../../utils/styleParams';
import { FeaturePoint } from './FeatureExtractionComputer';

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
    features?: FeaturePoint[];
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
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // quads_current
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // quads_next
                { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // features
                { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // triangles_current (vec4<u32>)
                { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // triangles_next (vec4<u32>)
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

        // NEW: Triangle Pipelines
        // Remove try-catch to expose shader errors
        this.subdivideTrianglesPipeline = await this.device.createComputePipelineAsync({
            label: 'subdivide_triangles',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'subdivide_triangles' },
        });

        this.emitFinalTrianglesPipeline = await this.device.createComputePipelineAsync({
            label: 'emit_final_triangles',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'emit_final_triangles' },
        });

        this.initialized = true;
    }

    private subdivideTrianglesPipeline: GPUComputePipeline | null = null;
    private emitFinalTrianglesPipeline: GPUComputePipeline | null = null;

    async compute(params: AdaptiveExportParams): Promise<AdaptiveExportResult> {
        if (!this.initialized) throw new Error('Not initialized');
        const startTime = performance.now();
        console.log('[AdaptiveExport] Compute started. BaseMesh:', !!params.baseMesh, 'Features:', params.features?.length);

        const maxQuadBytes = MAX_QUADS * 16;
        const maxVertexBytes = MAX_VERTICES * 12; // vec3<f32>
        const maxIndexBytes = MAX_INDICES * 4;   // u32

        // Triangle Buffers (Indices + SurfaceID)
        // 4M Triangles max? 4M * 16 bytes = 64MB. Reasonable.
        const MAX_TRIANGLES = 4_000_000;
        const maxTriangleBytes = MAX_TRIANGLES * 16; // vec4<u32>

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
            size: 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, // Enlarged for Triangle Counters
        });
        const quadsCurrentBuffer = this.device.createBuffer({
            size: maxQuadBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        const quadsNextBuffer = this.device.createBuffer({
            size: maxQuadBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
        const trianglesCurrentBuffer = this.device.createBuffer({
            size: maxTriangleBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
        const trianglesNextBuffer = this.device.createBuffer({
            size: maxTriangleBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });


        // Write Uniforms & Style Params
        const { dimensions, styleOpts, maxDepth = 6, subdivThreshold = 0.05, targetTriangles = 4_000_000 } = params;
        const uniformData = new Float32Array([
            dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
            dimensions.tBottom, dimensions.rDrain, dimensions.expn, params.styleIndex,
            styleOpts.spinTurns ?? 0, ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180, styleOpts.spinCurveExp ?? 1, styleOpts.seamAngle ?? 0,
            styleOpts.bellAmp ?? 0, styleOpts.bellCenter ?? 0.5, styleOpts.bellWidth ?? 0.22, maxDepth,
            subdivThreshold, 0.0000001, targetTriangles, 0,
        ]);
        this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as any);
        this.device.queue.writeBuffer(styleParamBuffer, 0, packStyleParams(styleOpts, params.styleId) as any);

        // Feature Buffer
        // If features provided, upload them. Else dummy.
        let featureBuffer: GPUBuffer;
        if (params.features && params.features.length > 0) {
            const fCount = params.features.length;
            // Mixed Types! use ArrayBuffer
            const fBytes = new ArrayBuffer(fCount * 16);
            const fFloats = new Float32Array(fBytes);
            const fUints = new Uint32Array(fBytes);

            for (let i = 0; i < fCount; i++) {
                fFloats[i * 4] = params.features[i].theta;
                fFloats[i * 4 + 1] = params.features[i].t;
                fUints[i * 4 + 2] = params.features[i].type; // Type
                fFloats[i * 4 + 3] = params.features[i].strength;
            }

            featureBuffer = this.device.createBuffer({
                size: fBytes.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                mappedAtCreation: true
            });
            new Uint8Array(featureBuffer.getMappedRange()).set(new Uint8Array(fBytes));
            featureBuffer.unmap();

        } else {
            featureBuffer = this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE,
            });
        }

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
                { binding: 7, resource: { buffer: featureBuffer } },
                { binding: 8, resource: { buffer: trianglesCurrentBuffer } },
                { binding: 9, resource: { buffer: trianglesNextBuffer } },
            ]
        });

        let currentQuadCount = 0;
        let currentTriCount = 0;
        let depth = 0;

        // Mode Switching
        if (params.baseMesh && this.subdivideTrianglesPipeline) {
            console.log('[AdaptiveExport] Base Mesh Mode Active. Uploading topology...');
            // --- TRIANGLE SUBDIVISION MODE ---
            const { vertices: baseVerts, indices: baseIndices } = params.baseMesh;
            const vertexCount = baseVerts.length / 3;
            const triCount = baseIndices.length / 3;
            console.log(`[AdaptiveExport] Base Params: ${vertexCount} verts, ${triCount} tris`);

            // 1. Pack Initial Triangles (v0, v1, v2, surface)
            const packedTriangles = new Uint32Array(triCount * 4);
            for (let i = 0; i < triCount; i++) {
                const v0 = baseIndices[i * 3];
                const v1 = baseIndices[i * 3 + 1];
                const v2 = baseIndices[i * 3 + 2];
                // Surface stored in Z of vertex (index 2)
                const surf = Math.round(baseVerts[v0 * 3 + 2]);
                packedTriangles[i * 4] = v0;
                packedTriangles[i * 4 + 1] = v1;
                packedTriangles[i * 4 + 2] = v2;
                packedTriangles[i * 4 + 3] = surf;
            }

            // 2. Upload
            this.device.queue.writeBuffer(vertexBuffer, 0, baseVerts as any);
            this.device.queue.writeBuffer(trianglesCurrentBuffer, 0, packedTriangles as any);

            // 3. Init Counters: [vertexCount, indexCount, quadCount, quadNext, TRI_CURRENT, TRI_NEXT]
            // We use indices 4 and 5 for triangles.
            const initialCounters = new Uint32Array([vertexCount, 0, 0, 0, triCount, 0]);
            this.device.queue.writeBuffer(countersBuffer, 0, initialCounters as any);

            currentTriCount = triCount;

            // 4. Subdivision Loop
            for (let d = 0; d < maxDepth; d++) {
                // Reset Next Counter
                this.device.queue.writeBuffer(countersBuffer, 20, new Uint32Array([0])); // Index 5 * 4 bytes = 20

                const encoder = this.device.createCommandEncoder();
                const pass = encoder.beginComputePass();
                pass.setPipeline(this.subdivideTrianglesPipeline);
                pass.setBindGroup(0, bindGroup);
                dispatchWorkgroups2D(pass, currentTriCount);
                pass.end();

                // Copy Next -> Current for next iteration
                // Readback count first?
                // Efficiency: We can copy buffer blindly, but we need the count for dispatch.
                // We MUST readback count to know if we are done or overflowing.
                // Actually, just copy the buffer. For count, we can do a small readback.
                encoder.copyBufferToBuffer(trianglesNextBuffer, 0, trianglesCurrentBuffer, 0, maxTriangleBytes);
                // Copy Next Counter -> Current Counter
                encoder.copyBufferToBuffer(countersBuffer, 20, countersBuffer, 16, 4); // Index 5 -> 4

                this.device.queue.submit([encoder.finish()]);

                // Readback count (blocking for loop control?)
                // To keep it fully GPU, we would need indirect dispatch.
                // For simplicity/safety, let's await count to prevent runaway or empty dispatches.
                const countStaging = this.device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
                const countEncoder = this.device.createCommandEncoder();
                countEncoder.copyBufferToBuffer(countersBuffer, 16, countStaging, 0, 4); // Read Index 4 (Current)
                this.device.queue.submit([countEncoder.finish()]);

                await countStaging.mapAsync(GPUMapMode.READ);
                const nextCount = new Uint32Array(countStaging.getMappedRange())[0];
                countStaging.unmap();
                countStaging.destroy();

                if (nextCount === currentTriCount) {
                    // No new triangles created, convergence reached.
                    break;
                }
                currentTriCount = nextCount;
                depth = d + 1;

                if (currentTriCount >= MAX_TRIANGLES * 0.95) {
                    console.warn('[AdaptiveExport] Max triangles reached during subdivision.');
                    break;
                }
            }

            // 5. Final Emission
            const finalEncoder = this.device.createCommandEncoder();
            const finalPass = finalEncoder.beginComputePass();
            finalPass.setPipeline(this.emitFinalTrianglesPipeline!);
            finalPass.setBindGroup(0, bindGroup);
            dispatchWorkgroups2D(finalPass, currentTriCount);
            finalPass.end();
            this.device.queue.submit([finalEncoder.finish()]);

            // 6. Evaluate Vertices (Transform from Parametric to World)
            // Dispatched for ALL vertices (Base + Subdivided)
            const vCountStaging = this.device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
            const vCountEncoder = this.device.createCommandEncoder();
            vCountEncoder.copyBufferToBuffer(countersBuffer, 0, vCountStaging, 0, 4); // Index 0: Total Vertices
            this.device.queue.submit([vCountEncoder.finish()]);
            await vCountStaging.mapAsync(GPUMapMode.READ);
            const totalVertices = new Uint32Array(vCountStaging.getMappedRange())[0];
            vCountStaging.unmap();
            vCountStaging.destroy();

            if (this.evaluatePipeline && totalVertices > 0) {
                const evalEncoder = this.device.createCommandEncoder();
                const evalPass = evalEncoder.beginComputePass();
                evalPass.setPipeline(this.evaluatePipeline);
                evalPass.setBindGroup(0, bindGroup);
                const workgroups = Math.ceil(totalVertices / 64);
                evalPass.dispatchWorkgroups(workgroups);
                evalPass.end();
                this.device.queue.submit([evalEncoder.finish()]);
            }

        } else {
            // --- LEGACY QUAD MODE (Fallback) ---
            const initialQuadCount = INITIAL_GRID_SIZE * INITIAL_GRID_SIZE * NUM_SURFACES;
            const initialCounters = new Uint32Array([0, 0, initialQuadCount, 0]);
            this.device.queue.writeBuffer(countersBuffer, 0, initialCounters as any);

            currentQuadCount = initialQuadCount;

            const encoder = this.device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.initGridPipeline!);
            pass.setBindGroup(0, bindGroup);
            dispatchWorkgroups2D(pass, initialQuadCount);
            pass.end();
            this.device.queue.submit([encoder.finish()]);

            // Loop for Quads? (Implementation skipped as we focus on Triangles, but keeping emit)
            if (currentQuadCount > 0) {
                // this.device.queue.writeBuffer(countersBuffer, 8, new Uint32Array([currentQuadCount]) as any);
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
        const countStaging = this.device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

        const readEncoder = this.device.createCommandEncoder();
        readEncoder.copyBufferToBuffer(vertexBuffer, 0, vertexStaging, 0, maxVertexBytes);
        readEncoder.copyBufferToBuffer(indexBuffer, 0, indexStaging, 0, maxIndexBytes);
        readEncoder.copyBufferToBuffer(countersBuffer, 0, countStaging, 0, 32);
        this.device.queue.submit([readEncoder.finish()]);

        await Promise.all([
            vertexStaging.mapAsync(GPUMapMode.READ),
            indexStaging.mapAsync(GPUMapMode.READ),
            countStaging.mapAsync(GPUMapMode.READ),
        ]);

        const counts = new Uint32Array(countStaging.getMappedRange());
        const vertexCount = counts[0];
        const indexCount = counts[1]; // Indices generated by emit

        const vertices = new Float32Array(vertexStaging.getMappedRange().slice(0, vertexCount * 12)); // * 4 bytes * 3 floats ? No, slice size is in BYTES. 
        // vertexCount is number of vertices. Each is 3 floats (12 bytes).
        // slice(start, end). end is byte index.

        const indices = new Uint32Array(indexStaging.getMappedRange().slice(0, indexCount * 4));

        vertexStaging.unmap(); indexStaging.unmap(); countStaging.unmap();

        uniformBuffer.destroy(); styleParamBuffer.destroy(); vertexBuffer.destroy(); indexBuffer.destroy();
        countersBuffer.destroy(); quadsCurrentBuffer.destroy(); quadsNextBuffer.destroy();
        trianglesCurrentBuffer.destroy(); trianglesNextBuffer.destroy();
        vertexStaging.destroy(); indexStaging.destroy(); countStaging.destroy();
        if (featureBuffer) featureBuffer.destroy();

        return {
            mesh: { vertices, indices, vertexCount, triangleCount: indexCount / 3 },
            computeTimeMs: performance.now() - startTime,
            finalTriangleCount: indexCount / 3,
            subdivisionStats: { initialQuads: currentQuadCount, finalQuads: currentTriCount, maxDepthReached: depth },
        };
    }

    isReady(): boolean { return this.initialized; }
    destroy(): void { this.initialized = false; }
}
