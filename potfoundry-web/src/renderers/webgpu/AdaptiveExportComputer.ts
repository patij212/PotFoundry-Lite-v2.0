
/**
 * AdaptiveExportComputer.ts
 * 
 * GPU-based Adaptive Refinement.
 * Now exclusively uses "Base Mesh" mode with robust triangle-based feature-preserving subdivision.
 * Legacy Quad mode has been removed.
 */

import { MeshData, PotDimensions, StyleOptions, StyleId } from '../../geometry/types';
import { buildStyleParamPayload } from '../../utils/styleParams';
import { FeaturePoint } from './FeatureExtractionComputer';
import { weldMesh } from '../../utils/geometry/weldMesh';

export interface AdaptiveExportParams {
    dimensions: PotDimensions;
    styleId: StyleId;
    styleOpts: StyleOptions;
    styleIndex: number;
    targetTriangles?: number;
    subdivThreshold?: number;
    maxDepth?: number;
    // Base Mesh Injection is now REQUIRED for Feature-Constrained Mode
    baseMesh: { vertices: Float32Array, indices: Uint32Array };
    features?: FeaturePoint[]; // Legacy: For CPU viz if needed
    featureSegments?: Float32Array; // Flattened [p1x, p1y, p2x, p2y]
    featureGridOffsets?: Uint32Array; // Spatial Grid Offsets
}



export interface AdaptiveExportResult {
    mesh: MeshData;
    computeTimeMs: number;
    finalTriangleCount: number;
    subdivisionStats: {
        initialTriangles: number;
        finalTriangles: number;
        maxDepthReached: number;
        overflowDetected: boolean;
    };
}

function packStyleParams(opts: StyleOptions, id: StyleId): Float32Array {
    const [_, data] = buildStyleParamPayload(id, opts as any);
    return new Float32Array(data);
}

const STATUS_OK = 0;
const STATUS_VERTEX_OVERFLOW = 1;
const STATUS_TRIANGLE_OVERFLOW = 2;

function getStatusName(status: number): string {
    switch (status) {
        case STATUS_OK: return 'OK';
        case STATUS_VERTEX_OVERFLOW: return 'VERTEX_OVERFLOW';
        case STATUS_TRIANGLE_OVERFLOW: return 'TRIANGLE_OVERFLOW';
        default: return `UNKNOWN_ERROR(${status})`;
    }
}

function dispatchWorkgroups2D(pass: GPUComputePassEncoder, count: number) {
    const workgroupSize = 64;
    const totalWorkgroups = Math.ceil(count / workgroupSize);
    const maxDim = 65535;
    if (totalWorkgroups <= maxDim) {
        pass.dispatchWorkgroups(totalWorkgroups, 1);
    } else {
        pass.dispatchWorkgroups(maxDim, Math.ceil(totalWorkgroups / maxDim));
    }
}

export class AdaptiveExportComputer {
    private device: GPUDevice;
    private initialized = false;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipelineLayout: GPUPipelineLayout | null = null;

    // Pipelines
    private evaluatePipeline: GPUComputePipeline | null = null;
    private subdivideTrianglesPipeline: GPUComputePipeline | null = null;
    private emitFinalTrianglesPipeline: GPUComputePipeline | null = null;

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
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Vertices
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Indices
                { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Counters
                // { binding: 5, ... } Removed legacy Quads buffers
                // { binding: 6, ... }
                { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // Features/Segments
                { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // Triangles Current (was 8)
                { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Triangles Next (was 9)
                { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } }, // Grid Offsets
            ],
        });

        this.pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout!],
        });

        // Initialize pipelines in parallel
        [
            this.evaluatePipeline,
            this.subdivideTrianglesPipeline,
            this.emitFinalTrianglesPipeline
        ] = await Promise.all([
            this.device.createComputePipelineAsync({
                label: 'evaluate_vertices',
                layout: this.pipelineLayout,
                compute: { module: shaderModule, entryPoint: 'evaluate_vertices' },
            }),
            this.device.createComputePipelineAsync({
                label: 'subdivide_triangles',
                layout: this.pipelineLayout,
                compute: { module: shaderModule, entryPoint: 'subdivide_triangles' },
            }),
            this.device.createComputePipelineAsync({
                label: 'emit_final_triangles',
                layout: this.pipelineLayout,
                compute: { module: shaderModule, entryPoint: 'emit_final_triangles' },
            })
        ]);

        this.initialized = true;
    }

    async compute(params: AdaptiveExportParams): Promise<AdaptiveExportResult> {
        if (!this.initialized) throw new Error('Not initialized');
        if (!params.baseMesh) throw new Error("Base Mesh is required for robust execution.");

        const startTime = performance.now();
        console.log('[AdaptiveExport] Compute started. BaseMesh:', params.baseMesh.vertices.length / 3, 'verts, Features:', params.features?.length);

        // --- 1. Dynamic Buffer Sizing ---
        const maxStorageSize = this.device.limits.maxStorageBufferBindingSize || 134217728; // Default 128MB

        // Strategy: Maximize available GPU memory
        // 12 bytes per vertex (3x float32)
        const MAX_VERTICES = Math.floor((maxStorageSize * 0.8) / 12);
        // 4 bytes per index (1x uint32)
        const MAX_INDICES = Math.floor((maxStorageSize * 0.8) / 4);

        // Triangle State: 16 bytes per triangle (4x uint32)
        // We need 2 buffers (Ping-Pong), so each gets half of the remaining budget? 
        // Or we limit based on target triangles.
        const targetTris = params.targetTriangles || 4_000_000;
        const TRIANGLE_HEADROOM = 4.0; // Allow 4x overshoot (worst case 1->4 split) to prevent overflow before check
        // Limit max triangles effectively by buffer size or target
        const MAX_TRIANGLES = Math.min(
            Math.floor(targetTris * TRIANGLE_HEADROOM),
            Math.floor((maxStorageSize * 0.9) / 16)
        );

        console.log(`[AdaptiveExport] Buffers: MaxVerts=${MAX_VERTICES.toLocaleString()}, MaxTris=${MAX_TRIANGLES.toLocaleString()}`);
        console.log(`[AdaptiveExport] Enforcing Physical Limit: ${MAX_TRIANGLES} (Target: ${targetTris})`);

        const maxVertexBytes = MAX_VERTICES * 12;
        const maxIndexBytes = MAX_INDICES * 4;
        const maxTriangleBytes = MAX_TRIANGLES * 16;
        console.log(`[AdaptiveExport] v3.7 (Feature-Only Subdivision)`);

        // --- 2. Create Buffers ---
        const buffers: GPUBuffer[] = [];
        const track = (b: GPUBuffer) => { buffers.push(b); return b; };

        try {
            const uniformBuffer = track(this.device.createBuffer({
                size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Uniforms'
            }));
            const styleParamBuffer = track(this.device.createBuffer({
                size: 48 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'StyleParams'
            }));
            const vertexBuffer = track(this.device.createBuffer({
                size: maxVertexBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                label: 'Vertices'
            }));
            const indexBuffer = track(this.device.createBuffer({
                size: maxIndexBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                label: 'Indices'
            }));
            // Counters: [VertexCount, IndexCount, TriCount_Current, TriCount_Next, Status, Padding...]
            const countersBuffer = track(this.device.createBuffer({
                size: 64, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                label: 'Counters'
            }));

            const trianglesCurrentBuffer = track(this.device.createBuffer({
                size: maxTriangleBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                label: 'TrisCurr'
            }));
            const trianglesNextBuffer = track(this.device.createBuffer({
                size: maxTriangleBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                label: 'TrisNext'
            }));

            // Write Uniforms & Style Params
            const { dimensions, styleOpts, maxDepth = 6, subdivThreshold = 0.05 } = params;
            // Uniform Layout Match:
            // chunk0: H, Rt, Rb, tWall
            // chunk1: tBottom, rDrain, expn, styleId
            // chunk2: spinTurns, spinPhase, spinCurve, seamAngle
            // chunk3: bellAmp, bellCenter, bellWidth, maxDepth
            // chunk4: subdivThreshold, minQuadSize (unused), targetTris, reserved
            const uniformData = new Float32Array([
                dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
                dimensions.tBottom, dimensions.rDrain, dimensions.expn, params.styleIndex,
                styleOpts.spinTurns ?? 0, ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180, styleOpts.spinCurveExp ?? 1, styleOpts.seamAngle ?? 0,
                styleOpts.bellAmp ?? 0, styleOpts.bellCenter ?? 0.5, styleOpts.bellWidth ?? 0.22, maxDepth,
                0.03, 0.0000001, 2000000, 0, // Threshold 0.03, Budget 2M (Features need high density)
            ]);
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData as any);
            const packedStyleParams = packStyleParams(styleOpts, params.styleId);
            console.log(`[AdaptiveExport] StyleId: ${params.styleId}, Index: ${params.styleIndex}`);
            console.log(`[AdaptiveExport] StyleParams[0-8]:`, packedStyleParams.slice(0, 8));
            this.device.queue.writeBuffer(styleParamBuffer, 0, packedStyleParams as any);

            // ... (Lines 234-670 skipped, assuming no changes there except earlier chunks)
            // Wait, I need to replace the weldMesh call at line 680 too.
            // I should split this into two edits if I can't reach.
            // I cannot reach line 680 from 214.
            // So I will only do the Uniforms here.

            // Feature Segments Buffer (Binding 5)
            let featureBuffer: GPUBuffer;
            if (params.featureSegments && params.featureSegments.length > 0) {
                featureBuffer = track(this.device.createBuffer({
                    size: params.featureSegments.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    mappedAtCreation: true,
                    label: 'FeatureSegments'
                }));
                new Float32Array(featureBuffer.getMappedRange()).set(params.featureSegments);
                featureBuffer.unmap();
            } else {
                featureBuffer = track(this.device.createBuffer({
                    size: 16, usage: GPUBufferUsage.STORAGE,
                    label: 'FeaturesDummy'
                }));
            }

            // Grid Offsets Buffer (Binding 8)
            let gridOffsetsBuffer: GPUBuffer;
            if (params.featureGridOffsets && params.featureGridOffsets.length > 0) {
                gridOffsetsBuffer = track(this.device.createBuffer({
                    size: params.featureGridOffsets.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                    mappedAtCreation: true,
                    label: 'GridOffsets'
                }));
                new Uint32Array(gridOffsetsBuffer.getMappedRange()).set(params.featureGridOffsets);
                gridOffsetsBuffer.unmap();
            } else {
                gridOffsetsBuffer = track(this.device.createBuffer({
                    size: 16, usage: GPUBufferUsage.STORAGE,
                    label: 'GridOffsetsDummy'
                }));
            }

            // Create Bind Groups (We swap binding 6 and 7 for Ping-Pong)
            const createBindGroup = (trisCurr: GPUBuffer, trisNext: GPUBuffer) => {
                return this.device.createBindGroup({
                    layout: this.bindGroupLayout!,
                    entries: [
                        { binding: 0, resource: { buffer: uniformBuffer } },
                        { binding: 1, resource: { buffer: styleParamBuffer } },
                        { binding: 2, resource: { buffer: vertexBuffer } },
                        { binding: 3, resource: { buffer: indexBuffer } },
                        { binding: 4, resource: { buffer: countersBuffer } },
                        { binding: 5, resource: { buffer: featureBuffer } },
                        { binding: 6, resource: { buffer: trisCurr } },
                        { binding: 7, resource: { buffer: trisNext } },
                        { binding: 8, resource: { buffer: gridOffsetsBuffer } },
                    ]
                });
            };

            const bgA = createBindGroup(trianglesCurrentBuffer, trianglesNextBuffer);
            const bgB = createBindGroup(trianglesNextBuffer, trianglesCurrentBuffer);

            // --- 3. Initial State Setup ---
            const { vertices: baseVerts, indices: baseIndices } = params.baseMesh;
            const vertexCount = baseVerts.length / 3;
            const triCount = baseIndices.length / 3;

            // Validate inputs
            if (vertexCount > MAX_VERTICES) throw new Error(`Base mesh too large: ${vertexCount} > ${MAX_VERTICES} vertices`);
            if (triCount > MAX_TRIANGLES) throw new Error(`Base mesh too large: ${triCount} > ${MAX_TRIANGLES} triangles`);

            // Pack Initial Triangles (v0, v1, v2, surfaceID)
            const packedTriangles = new Uint32Array(triCount * 4);
            for (let i = 0; i < triCount; i++) {
                const v0 = baseIndices[i * 3];
                const v1 = baseIndices[i * 3 + 1];
                const v2 = baseIndices[i * 3 + 2];
                // Detect surface from Z if encoded, else 0
                const surf = Math.round(baseVerts[v0 * 3 + 2]);

                packedTriangles[i * 4] = v0;
                packedTriangles[i * 4 + 1] = v1;
                packedTriangles[i * 4 + 2] = v2;
                packedTriangles[i * 4 + 3] = surf;
            }

            this.device.queue.writeBuffer(vertexBuffer, 0, baseVerts as any);
            this.device.queue.writeBuffer(trianglesCurrentBuffer, 0, packedTriangles as any);

            // Counters: [VertexCount, IndexCount, TriCount_Current, TriCount_Next, STATUS, ...]
            const initialCounters = new Uint32Array([vertexCount, 0, triCount, 0, STATUS_OK, 0]);
            this.device.queue.writeBuffer(countersBuffer, 0, initialCounters as any);

            let currentTriCount = triCount;
            let depth = 0;
            let overflow = false;

            // --- DEBUG: Skip GPU Subdivision Entirely ---
            const DEBUG_BYPASS_GPU = false; // DISABLED: GPU fix applied
            if (DEBUG_BYPASS_GPU) {
                console.log('[AdaptiveExport] DEBUG: Bypassing GPU subdivision! Emitting base mesh directly.');
                // Evaluate vertices on CPU
                // const TAU = Math.PI * 2;
                const H = dimensions.H;
                const Rt = dimensions.Rt;
                const Rb = dimensions.Rb;
                const tWall = dimensions.tWall;
                const tBottom = dimensions.tBottom;
                const rDrain = dimensions.rDrain;
                const n = dimensions.expn;

                const evalVerts = new Float32Array(vertexCount * 3);
                for (let i = 0; i < vertexCount; i++) {
                    const theta = baseVerts[i * 3];
                    const t = baseVerts[i * 3 + 1];
                    const surface = Math.round(baseVerts[i * 3 + 2]);

                    let x = 0, y = 0, z = 0;

                    // Basic radius function (no style for debug)
                    const r_base = (t_param: number) => Rb + (Rt - Rb) * Math.pow(t_param, n);
                    const r_inner = (t_param: number) => Math.max(r_base(t_param) - tWall, 0.5);

                    if (surface === 0) { // OUTER
                        const r = r_base(t);
                        z = t * H;
                        x = r * Math.cos(theta);
                        y = r * Math.sin(theta);
                    } else if (surface === 1) { // INNER
                        const z_height = tBottom + t * (H - tBottom);
                        const t_radius = z_height / H;
                        const r = r_inner(t_radius);
                        z = z_height;
                        x = r * Math.cos(theta);
                        y = r * Math.sin(theta);
                    } else if (surface === 2) { // RIM
                        const r_i = r_inner(1.0);
                        const r_o = r_base(1.0);
                        const r = r_i + (r_o - r_i) * t;
                        z = H;
                        x = r * Math.cos(theta);
                        y = r * Math.sin(theta);
                    } else if (surface === 3) { // BOTTOM UNDER
                        const r_o = r_base(0);
                        const r = r_o + (rDrain - r_o) * t;
                        z = 0;
                        x = r * Math.cos(theta);
                        y = r * Math.sin(theta);
                    } else if (surface === 4) { // BOTTOM TOP
                        const t_radius_bot = tBottom / H;
                        const r_i = r_inner(t_radius_bot);
                        const r = r_i + (rDrain - r_i) * t;
                        z = tBottom;
                        x = r * Math.cos(theta);
                        y = r * Math.sin(theta);
                    } else if (surface === 5) { // DRAIN
                        const r = rDrain;
                        z = t * tBottom;
                        x = r * Math.cos(theta);
                        y = r * Math.sin(theta);
                    }

                    evalVerts[i * 3] = x;
                    evalVerts[i * 3 + 1] = y;
                    evalVerts[i * 3 + 2] = z;
                }

                console.log(`[AdaptiveExport] DEBUG: Emitting ${vertexCount} vertices, ${triCount} triangles (no subdivision)`);

                return {
                    mesh: {
                        vertices: evalVerts,
                        indices: new Uint32Array(baseIndices),
                        vertexCount: vertexCount,
                        triangleCount: triCount
                    },
                    computeTimeMs: 0,
                    finalTriangleCount: triCount,
                    subdivisionStats: {
                        initialTriangles: triCount,
                        finalTriangles: triCount,
                        maxDepthReached: 0,
                        overflowDetected: false
                    }
                };
            }

            // --- PRE-SNAP PASS: DISABLED for CDT ---
            // The ConstrainedTriangulator already places vertices exactly on features.
            // Running Pre-Snap risks collapsing the explicit buffer ribbons (0.003 offset) 
            // onto the features, creating degenerate geometry and "stripes".
            /*
            if (params.featureSegments && params.featureSegments.length > 0) {
                console.log(`[AdaptiveExport] Running Pre-Snap Pass. Vertices: ${vertexCount}, Features: ${params.featureSegments.length / 4} segments`);
                console.log(`[AdaptiveExport] Dispatching ${Math.ceil(vertexCount / 64)} workgroups for Pre-Snap.`);
                const preSnapEncoder = this.device.createCommandEncoder();
                const preSnapPass = preSnapEncoder.beginComputePass();
                preSnapPass.setPipeline(this.snapInitialVerticesPipeline!);
                preSnapPass.setBindGroup(0, bgA); // Use bind group A (current)
                dispatchWorkgroups2D(preSnapPass, vertexCount);
                preSnapPass.end();
                this.device.queue.submit([preSnapEncoder.finish()]);
                await this.device.queue.onSubmittedWorkDone();
                console.log('[AdaptiveExport] Pre-Snap Pass complete.');
            }
            */

            // --- 4. Subdivision Loop ---
            for (let d = 0; d < maxDepth; d++) {
                // Reset Next Counter (index 3)
                this.device.queue.writeBuffer(countersBuffer, 12, new Uint32Array([0]));

                const encoder = this.device.createCommandEncoder();
                const pass = encoder.beginComputePass();
                pass.setPipeline(this.subdivideTrianglesPipeline!);
                // Swap bind groups based on depth even/odd
                // d=0: Read Curr, Write Next.
                pass.setBindGroup(0, d % 2 === 0 ? bgA : bgB);
                dispatchWorkgroups2D(pass, currentTriCount);
                pass.end();

                // Submit compute
                this.device.queue.submit([encoder.finish()]);

                // Readback Next Count & Status
                const readStaging = track(this.device.createBuffer({ size: 32, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
                const readEncoder = this.device.createCommandEncoder();
                readEncoder.copyBufferToBuffer(countersBuffer, 0, readStaging, 0, 32);
                this.device.queue.submit([readEncoder.finish()]);

                await readStaging.mapAsync(GPUMapMode.READ);
                const readData = new Uint32Array(readStaging.getMappedRange());
                const nextCount = readData[3]; // TriCount_Next
                const status = readData[4];    // Status

                readStaging.unmap();
                const idx = buffers.indexOf(readStaging);
                if (idx > -1) buffers.splice(idx, 1);
                readStaging.destroy();

                if (status !== STATUS_OK) {
                    console.warn(`[AdaptiveExport] GPU Status Error: ${getStatusName(status)}. Stopping subdivision.`);
                    overflow = true;
                    break;
                }

                if (nextCount > targetTris) {
                    console.log(`[AdaptiveExport] Budget reached: ${nextCount} > ${targetTris}.`);
                    // If we exceeded budget, we typically accept the result if it fits in buffer, 
                    // or we revert to previous level. 
                    // Since we already wrote to 'Next', let's use it but stop.
                    currentTriCount = nextCount;
                    depth = d + 1;
                    break;
                }

                // If no new triangles were created (all kept), count stays same?
                // Actually if all kept, nextCount == currentTriCount.
                if (nextCount === currentTriCount) {
                    // Converged
                    break;
                }

                currentTriCount = nextCount;
                depth = d + 1;

                // Move Next -> Current for next iteration
                // We physically swap usage by swapping bind groups.
                // But we must update 'Current' counter (index 2) with 'Next' count for the next pass.
                // So: counters[2] = counters[3].
                const updateEncoder = this.device.createCommandEncoder();
                const scratch = track(this.device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST }));
                // Copy Next(3) -> Scratch
                updateEncoder.copyBufferToBuffer(countersBuffer, 12, scratch, 0, 4);
                // Copy Scratch -> Current(2)
                updateEncoder.copyBufferToBuffer(scratch, 0, countersBuffer, 8, 4);
                this.device.queue.submit([updateEncoder.finish()]);

                // Note: On next loop, we use bgB which reads from 'Next' buffer (now acting as current source)
                // and writes to 'Current' buffer (now acting as next destination).
            }

            // --- 5. Final Emission ---
            // We need to perform emit from the buffer that holds the FINAL triangles.
            // If depth is even (0, 2...), the result is in 'Next' (bgA wrote to Next).
            // If depth is odd (1, 3...), the result is in 'Current' (bgB wrote to Current).
            // Actually, wait. 
            // d=0: In=Curr, Out=Next. End of loop, we set depth=1.
            // If we break, result is in Out.
            // So if `depth % 2 !== 0`, result is in NextBuffer.
            // If `depth % 2 === 0`, result is in CurrentBuffer.

            // Correction:
            // Loop d=0: BgA. Read Curr, Write Next. Result in Next. Depth becomes 1.
            // Loop d=1: BgB. Read Next, Write Curr. Result in Curr. Depth becomes 2.
            // So if depth is ODD, result is in Next.
            // If depth is EVEN, result is in Curr.

            const finalBindGroup = (depth % 2 !== 0) ?
                createBindGroup(trianglesNextBuffer, trianglesCurrentBuffer) : // Read Next
                createBindGroup(trianglesCurrentBuffer, trianglesNextBuffer);  // Read Curr

            // We also need to ensure COUNTER_TRI_CURRENT (index 2) matches the count in the buffer we are reading.
            // If result is in Next, we need index 2 to hold NextCount? 
            // The shader 'emit_final_triangles' reads counters[2] (TriCount_Current).
            // But if we are reading from NextBuffer (via binding 6 alias), we need the count to be correct.
            // Logic above: `counters[2] = counters[3]` was done at end of loop.
            // So counters[2] always holds the count of the 'input' for the NEXT pass.
            // Since we finished the loop, counters[2] holds the count of the most recently generated triangles.
            // So we just need to bind the Correct Buffer to Slot 6 (Triangles Current).

            // If depth is ODD (1), last pass was d=0 (BgA). Result in Next. 
            // We moved NextCount -> CountCurrent.
            // We need to bind NextBuffer to Slot 6.
            // createBindGroup(trisCurr, trisNext) binds trisCurr to Slot 6.
            // So if depth is ODD, we use createBindGroup(trianglesNextBuffer, ...). Correct.

            // If depth is ODD, we use createBindGroup(trianglesNextBuffer, ...). Correct.

            // CRITICAL FIX: Ensure counters[2] (TRI_CURRENT) held by the GPU matches the actual count 
            // of the buffer we are about to read from.
            // If we broke early (budget reached), counters[2] might still hold the OLD count.
            // We tracked the real count in `currentTriCount`.

            // SECURITY: Clamp to MAX_TRIANGLES. 
            // The atomic counter 'nextCount' continues to increment even if we run out of buffer space.
            // If we tell the emit shader to read 'nextCount' triangles, it will read uninitialized 
            // memory (zeros) for the indices beyond MAX_TRIANGLES, creating garbage geometry (spikes to v0).
            const safeEmitCount = Math.min(currentTriCount, MAX_TRIANGLES);

            this.device.queue.writeBuffer(countersBuffer, 8, new Uint32Array([safeEmitCount]));

            const finalEncoder = this.device.createCommandEncoder();
            const finalPass = finalEncoder.beginComputePass();
            finalPass.setPipeline(this.emitFinalTrianglesPipeline!);
            finalPass.setBindGroup(0, finalBindGroup);
            dispatchWorkgroups2D(finalPass, safeEmitCount);
            finalPass.end();
            this.device.queue.submit([finalEncoder.finish()]);

            // --- 6. Vertex Evaluation ---
            // Now we have Final Indices in `indexBuffer`. 
            // Vertices are still parametric. Run `evaluate_vertices`.
            // --- 6. Vertex Evaluation ---
            // --- 6. Vertex Evaluation ---
            const vCountStaging = track(this.device.createBuffer({ size: 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
            const vEncoder = this.device.createCommandEncoder();
            vEncoder.copyBufferToBuffer(countersBuffer, 0, vCountStaging, 0, 4);
            this.device.queue.submit([vEncoder.finish()]);

            await vCountStaging.mapAsync(GPUMapMode.READ);
            const vCount = new Uint32Array(vCountStaging.getMappedRange())[0];
            vCountStaging.unmap();
            vCountStaging.destroy();

            if (this.evaluatePipeline && vCount > 0) {
                const evalEncoder = this.device.createCommandEncoder();
                const evalPass = evalEncoder.beginComputePass();
                evalPass.setPipeline(this.evaluatePipeline);
                // We reuse the bindgroup logic for bindings 0-2 (Uniforms, Styles, Vertices)
                // Note: 'bgA' is not in scope, but we can recreate a compatible one.
                const evalBg = createBindGroup(trianglesCurrentBuffer, trianglesNextBuffer);
                evalPass.setBindGroup(0, evalBg);
                dispatchWorkgroups2D(evalPass, vCount);
                evalPass.end();
                this.device.queue.submit([evalEncoder.finish()]);
            }

            // --- 7. Readback ---
            const vertexStaging = track(this.device.createBuffer({ size: maxVertexBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, label: 'StagingVert' }));
            const indexStaging = track(this.device.createBuffer({ size: maxIndexBytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, label: 'StagingIdx' }));
            const countStaging = track(this.device.createBuffer({ size: 64, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, label: 'StagingCnt' }));

            const readBackEncoder = this.device.createCommandEncoder();
            readBackEncoder.copyBufferToBuffer(vertexBuffer, 0, vertexStaging, 0, maxVertexBytes);
            readBackEncoder.copyBufferToBuffer(indexBuffer, 0, indexStaging, 0, maxIndexBytes);
            readBackEncoder.copyBufferToBuffer(countersBuffer, 0, countStaging, 0, 64);
            this.device.queue.submit([readBackEncoder.finish()]);

            await Promise.all([
                vertexStaging.mapAsync(GPUMapMode.READ),
                indexStaging.mapAsync(GPUMapMode.READ),
                countStaging.mapAsync(GPUMapMode.READ),
            ]);

            const finalCounts = new Uint32Array(countStaging.getMappedRange());
            const finalVCount = finalCounts[0];
            const finalICount = finalCounts[1];

            const vBytes = vertexStaging.getMappedRange().slice(0, finalVCount * 12);
            const iBytes = indexStaging.getMappedRange().slice(0, finalICount * 4);

            vertexStaging.unmap(); indexStaging.unmap(); countStaging.unmap();

            const rawVerts = new Float32Array(vBytes);
            const rawIdxs = new Uint32Array(iBytes);

            // NAN GUARD: Sanitize vertices
            let nanCount = 0;
            for (let i = 0; i < rawVerts.length; i++) {
                if (!Number.isFinite(rawVerts[i])) {
                    rawVerts[i] = 0;
                    nanCount++;
                }
            }
            if (nanCount > 0) {
                console.warn(`[AdaptiveExport] Stripped ${nanCount} NaN/Inf vertices!`);
            }

            // --- 9. Weld & Clean ---
            const welded = weldMesh(
                rawVerts,
                rawIdxs,
                0.01
            );

            const rawV = welded.vertices;
            const rawI = welded.indices;

            return {
                mesh: {
                    vertices: rawV,
                    indices: rawI,
                    vertexCount: rawV.length / 3,
                    triangleCount: rawI.length / 3
                },
                computeTimeMs: performance.now() - startTime,
                finalTriangleCount: finalICount / 3,
                subdivisionStats: {
                    initialTriangles: triCount,
                    finalTriangles: currentTriCount,
                    maxDepthReached: depth,
                    overflowDetected: overflow
                },
            };

        } finally {
            buffers.forEach(b => b.destroy());
        }
    }

    isReady(): boolean { return this.initialized; }
    destroy(): void { this.initialized = false; }
}
