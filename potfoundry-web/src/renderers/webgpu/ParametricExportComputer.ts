/**
 * ParametricExportComputer.ts â€” v11.3 Gap-Free Index Layout + Budget Cap
 *
 * COMPLETELY SEPARATE pipeline from AdaptiveExportComputer (CDT+GPU subdivision).
 *
 * Architecture:
 *   1. GPU: Multi-strip curvature sampling (16 strips Ã— 4096 samples) â†’ gradient + curvature profiles
 *   2. CPU: Feature detection via gradient zero-crossings + dÂ²r/duÂ² curvature peaks
 *   3. CPU: CDF-adaptive base grid sized to respect the user's triangle budget
 *   4. GPU: Per-row probing (4096 samples/row) â†’ 5-point stencil + GSS sub-sample peak detection
 *   5. CPU: Feature CHAIN LINKING â€” connect per-row peaks across adjacent rows into
 *          continuous polylines through (u,t) space.
 *   6. CPU: Chain-guided T-row insertion â€” subdivide grid rows at T positions where
 *          chains cross row boundaries.
 *   7. CPU: PER-ROW FEATURE PATCHING â€” union grid provides representative feature
 *          columns; each row's vertices are snapped to the chain's exact U position.
 *          Chain edges become mesh edges via diagonal alignment.
 *   8. GPU: Evaluate full mesh â†’ 3D positions
 *
 * v11.2 DENSITY FIX:
 *   v11.1 merged ALL chain vertex U-positions into the global grid as full-height
 *   columns. With 70 chains Ã— ~97 points = ~6800 chain U-values â†’ 5593 new columns
 *   spanning ALL rows. This created a near-uniform 6331Ã—279 mesh with 3.5M tris
 *   instead of the target ~360K (10Ã— over budget).
 *
 *   v11.2 fixes this by using the UNION GRID (which clusters features into
 *   representative columns with flanking companions, ~200-400 extra columns)
 *   as the global grid topology. Per-row vertex patching then snaps each row's
 *   feature-column vertices to the chain's exact U position at that row.
 *   Diagonal alignment ensures chain edges are mesh edges.
 *
 *   Result: Grid stays at ~1900 columns (union grid) instead of 6331.
 *   Features are mesh edges via per-row patching + diagonal alignment.
 *   Triangle count respects the user's budget.
 *
 * Key Properties (v11.2):
 *   - FEATURE-EDGE MESH: per-row patching places vertices exactly on chain positions
 *   - DIAGONAL ALIGNMENT: cells containing chain edges use aligned diagonals
 *   - BUDGET-RESPECTING: union grid density controlled by CDF + clustering
 *   - O(n) COMPLEXITY: grid triangulation is linear in cell count
 *   - Watertight by construction (shared boundary vertices with other surfaces)
 *   - No external CDT library dependency for the hot path
 */

import { buildStyleParamPayload } from '../../utils/styleParams';
import { computeRawCurvature, normalizeProfile } from './parametric/CurvatureAnalysis';
import {
    circularDistance,
    detectFeatureEdges,
    detectAllRowFeatures,
    detectAndMergeColumnFeatures,
} from './parametric/FeatureDetection';
import {
    linkFeatureChainsByKind,
    insertChainGuidedRows,
} from './parametric/ChainLinker';
import {
    mergeFeaturePositions,
    generateAdaptiveGrid,
    buildUnionFeatureGrid,
    computeGridDimensions,
    downsampleSortedPositions,
} from './parametric/GridBuilder';
import { buildCDTOuterWall } from './parametric/OuterWallTessellator';
import { chainDirectedFlip, flipEdges3D } from './parametric/MeshOptimizer';
import { subdivideLongEdges } from './parametric/MeshSubdivision';
import {
    buildConstraintEdgeSet,
    optimizeChainStrips,
    optimizeBoundaryDiagonals,
    computeBoundaryDiagnostic,
    computeMeshDiagnostics,
} from './parametric/ChainStripOptimizer';
import {
    SURFACE_CONFIG,
    CURVATURE_SAMPLES,
    NUM_STRIPS,
} from './parametric/types';

// Re-export types for backward compatibility (used by useParametricExport.ts)
// Re-export types for backward compatibility (used by useParametricExport.ts)
export type { ParametricExportParams, ParametricExportResult } from './parametric/types';
export type { FeaturePoint, FeatureKind, ChainDebugLine, ChainDebugData, PeakDebugData } from './parametric/types';
import type {
    ParametricExportParams,
    ParametricExportResult,
    ChainDebugData,
    ChainDebugLine,
    PeakDebugData,
} from './parametric/types';

// ============================================================================
// Debug State
// ============================================================================

let LAST_CHAIN_DEBUG_DATA: ChainDebugData | null = null;
let LAST_PEAK_DEBUG_DATA: PeakDebugData | null = null;

export function getLastChainDebugData(): ChainDebugData | null {
    return LAST_CHAIN_DEBUG_DATA;
}

export function getLastPeakDebugData(): PeakDebugData | null {
    return LAST_PEAK_DEBUG_DATA;
}

// ============================================================================
// Local Constants
// ============================================================================

/** v16.6 LOCAL-ONLY OUTER ADAPTATION MODE:
 *  Feature-guided mesh refinement is done ONLY through per-row vertex
 *  patching and chain-constrained stitch topology. No global grid changes. */
const LOCAL_ONLY_OUTER_ADAPTATION = true;

// ============================================================================
// GPU Compute Pipeline
// ============================================================================

export class ParametricExportComputer {
    private device: GPUDevice;
    private initialized = false;
    private evaluatePipeline: GPUComputePipeline | null = null;
    private snapPipeline: GPUComputePipeline | null = null;
    private metricPipeline: GPUComputePipeline | null = null;
    private relaxPipeline: GPUComputePipeline | null = null;
    private bindGroupLayout: GPUBindGroupLayout | null = null;
    private pipelineLayout: GPUPipelineLayout | null = null;

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
                { binding: 9, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Metric Tensor
                { binding: 10, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }, // Ping-Pong Vertices
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

        this.snapPipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_snap_to_features',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'snap_to_feature_ridges' },
        });

        // Pipeline for Metric Field Computation (v5.3)
        this.metricPipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_compute_metric',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'compute_metric_field' },
        });

        // Pipeline for Anisotropic Relaxation (v5.3)
        this.relaxPipeline = await this.device.createComputePipelineAsync({
            label: 'parametric_relax_vertices',
            layout: this.pipelineLayout,
            compute: { module: shaderModule, entryPoint: 'relax_vertices' },
        });

        this.initialized = true;
        console.log('[ParametricExport] GPU pipelines initialized (Eval, Snap, Metric, Relax).');
    }

    isReady(): boolean { return this.initialized; }
    destroy(): void { this.initialized = false; }

    /**
     * Run evaluate_vertices on a set of UV points and read back 3D positions.
     * If snapToFeatures is true, runs snap_to_feature_ridges first to align
     * vertices to feature ridges/valleys using Newton's method on GPU.
     */
    private async evaluatePoints(
        uvVertices: Float32Array,
        uniformBuffer: GPUBuffer,
        styleParamBuffer: GPUBuffer,
        dummyWrite3: GPUBuffer,
        dummyWrite4: GPUBuffer,
        dummyWrite7: GPUBuffer,
        dummyWrite9: GPUBuffer,
        dummyWrite10: GPUBuffer,
        dummyReadOnly: GPUBuffer,
        snapToFeatures: boolean = false,
        relaxIterations: number = 0,
    ): Promise<Float32Array> {
        console.log(`[ParametricExport] Eval: relax=${relaxIterations}, snap=${snapToFeatures}`);
        console.log(`[ParametricExport]   Bind3=${dummyWrite3.label}, Bind9=${dummyWrite9.label}`);

        const vertexBytes = uvVertices.byteLength;
        const vertexCount = uvVertices.length / 3;

        const vertexBuffer = this.device.createBuffer({
            size: vertexBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            label: 'Parametric_EvalVerts'
        });
        this.device.queue.writeBuffer(vertexBuffer, 0, uvVertices.buffer);

        // Buffers for Relaxation (created only if needed)
        let metricBuffer: GPUBuffer | null = null;
        let pingPongBuffer: GPUBuffer | null = null;

        if (relaxIterations > 0) {
            metricBuffer = this.device.createBuffer({
                size: vertexBytes, // 3 floats per vertex (m11, m12, m22) matches UVT size
                usage: GPUBufferUsage.STORAGE,
                label: 'Parametric_MetricTensor'
            });
            pingPongBuffer = this.device.createBuffer({
                size: vertexBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
                label: 'Parametric_PingPong'
            });
        }

        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout!,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: styleParamBuffer } },
                { binding: 2, resource: { buffer: vertexBuffer } },
                { binding: 3, resource: { buffer: dummyWrite3 } },
                { binding: 4, resource: { buffer: dummyWrite4 } },
                { binding: 5, resource: { buffer: dummyReadOnly } },
                { binding: 6, resource: { buffer: dummyReadOnly } },
                { binding: 7, resource: { buffer: dummyWrite7 } },
                { binding: 8, resource: { buffer: dummyReadOnly } },
                { binding: 9, resource: { buffer: metricBuffer || dummyWrite9 } },
                { binding: 10, resource: { buffer: pingPongBuffer || dummyWrite10 } },
            ],
        });

        const encoder = this.device.createCommandEncoder();
        const workgroups = Math.ceil(vertexCount / 64);
        // Safety check: WebGPU limits dispatch to 65535 per dimension.
        // With original W (~1568) this is ~13K workgroups â€” well under limit.
        if (workgroups > 65535) {
            console.error(`[ParametricExport] Workgroup count ${workgroups} exceeds WebGPU limit 65535. Reduce grid resolution.`);
        }

        // Pass 1 (optional): Snap outer-wall vertices to feature ridges/valleys
        if (snapToFeatures && this.snapPipeline) {
            const snapPass = encoder.beginComputePass();
            snapPass.setPipeline(this.snapPipeline);
            snapPass.setBindGroup(0, bindGroup);
            snapPass.dispatchWorkgroups(workgroups);
            snapPass.end();
        }

        // Pass 1.5 (optional): Anisotropic Relaxation (v5.3)
        // BATCHED DISPATCH to prevent Windows TDR (timeout) with high iterations (8000+)
        if (relaxIterations > 0 && this.metricPipeline && this.relaxPipeline && metricBuffer && pingPongBuffer) {

            // Batched Relaxation with periodic metric recomputation
            // The metric field depends on vertex positions, so it must be
            // recomputed as vertices move during relaxation.
            const BATCH_SIZE = 500; // 500 iters per batch (safe for 2s TDR)
            const METRIC_RECOMPUTE_INTERVAL = 500; // Recompute metric every 500 steps
            let remaining = relaxIterations;
            let stepsSinceMetric = METRIC_RECOMPUTE_INTERVAL; // Force initial computation

            while (remaining > 0) {
                // Recompute metric field if stale
                if (stepsSinceMetric >= METRIC_RECOMPUTE_INTERVAL) {
                    const metricEncoder = this.device.createCommandEncoder({ label: 'Parametric_MetricRecompute' });
                    const metricPass = metricEncoder.beginComputePass();
                    metricPass.setPipeline(this.metricPipeline);
                    metricPass.setBindGroup(0, bindGroup);
                    metricPass.dispatchWorkgroups(workgroups);
                    metricPass.end();
                    this.device.queue.submit([metricEncoder.finish()]);
                    stepsSinceMetric = 0;
                }

                const currentBatch = Math.min(remaining, BATCH_SIZE);
                const batchEncoder = this.device.createCommandEncoder({ label: `Parametric_RelaxBatch_${currentBatch}` });

                for (let i = 0; i < currentBatch; i++) {
                    const relaxPass = batchEncoder.beginComputePass();
                    relaxPass.setPipeline(this.relaxPipeline);
                    relaxPass.setBindGroup(0, bindGroup);
                    relaxPass.dispatchWorkgroups(workgroups);
                    relaxPass.end();

                    // Copy PingPong -> VertexBuffer (Vertex is input for next step)
                    batchEncoder.copyBufferToBuffer(pingPongBuffer, 0, vertexBuffer, 0, vertexBytes);
                }

                // Submit batch immediately to yield to OS watchdog
                this.device.queue.submit([batchEncoder.finish()]);
                remaining -= currentBatch;
                stepsSinceMetric += currentBatch;
            }
        }

        // Pass 2: Evaluate UV â†’ 3D positions (New Encoder for final step)
        const finalEncoder = this.device.createCommandEncoder({ label: 'Parametric_FinalEval' });
        const evalPass = finalEncoder.beginComputePass();
        evalPass.setPipeline(this.evaluatePipeline!);
        evalPass.setBindGroup(0, bindGroup);
        evalPass.dispatchWorkgroups(workgroups);
        evalPass.end();

        this.device.queue.submit([finalEncoder.finish()]);

        // Cleanup temp buffers immediately
        if (metricBuffer) metricBuffer.destroy();
        if (pingPongBuffer) pingPongBuffer.destroy();

        // Read back
        const stagingBuffer = this.device.createBuffer({
            size: vertexBytes,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
            label: 'Parametric_EvalStaging'
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

    /**
     * Main compute entry point.
     *
     * Phase 1: GPU curvature sampling (evaluate strips along T and U)
     * Phase 2: CPU adaptive grid via CDF inversion
     * Phase 3: GPU full mesh evaluation
     */
    async compute(params: ParametricExportParams): Promise<ParametricExportResult> {
        if (!this.initialized) throw new Error('[ParametricExport] Not initialized');
        const startTime = performance.now();

        const targetTris = params.targetTriangles ?? 2_000_000;
        console.log(`[ParametricExport] Target: ${targetTris.toLocaleString()} triangles`);

        // â”€â”€ Shared GPU resources â”€â”€
        const buffers: GPUBuffer[] = [];
        const track = (b: GPUBuffer) => { buffers.push(b); return b; };

        try {
            const uniformBuffer = track(this.device.createBuffer({
                size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: 'Parametric_Uniforms'
            }));

            const styleParamBuffer = track(this.device.createBuffer({
                size: 48 * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: 'Parametric_StyleParams'
            }));

            const dummyWrite3 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW3'
            }));
            const dummyWrite4 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW4'
            }));
            const dummyWrite7 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW7'
            }));
            const dummyWrite9 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW9'
            }));
            const dummyWrite10 = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE, label: 'Parametric_DummyW10'
            }));
            const dummyReadOnly = track(this.device.createBuffer({
                size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, label: 'Parametric_DummyRO'
            }));

            console.log('[ParametricExport] Buffers created:', {
                w3: dummyWrite3.label,
                w9: dummyWrite9.label
            });

            // Write uniforms
            const { dimensions, styleOpts } = params;
            const uniformData = new Float32Array([
                dimensions.H, dimensions.Rt, dimensions.Rb, dimensions.tWall,
                dimensions.tBottom, dimensions.rDrain, dimensions.expn, params.styleIndex,
                styleOpts.spinTurns ?? 0,
                ((styleOpts.spinPhaseDeg ?? 0) * Math.PI) / 180,
                styleOpts.spinCurveExp ?? 1,
                styleOpts.seamAngle ?? 0,
                styleOpts.bellAmp ?? 0, styleOpts.bellCenter ?? 0.5, styleOpts.bellWidth ?? 0.22, 0,
                0, 0, 0, 0,
            ]);
            this.device.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer);

            const [, packedStyleParams] = buildStyleParamPayload(
                params.styleId,
                params.styleOpts as Record<string, unknown>
            );
            const styleData = new Float32Array(48);
            styleData.set(packedStyleParams.slice(0, Math.min(48, packedStyleParams.length)));
            this.device.queue.writeBuffer(styleParamBuffer, 0, styleData.buffer);

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PHASE 1: Multi-Strip Curvature Sampling (GPU â†’ CPU)
            //
            // Sample NUM_STRIPS T-strips (at different U values) and
            // NUM_STRIPS U-strips (at different T values).
            // Take MAX curvature across all strips at each position.
            // This captures features regardless of angular/height position.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const curvStart = performance.now();
            const N = CURVATURE_SAMPLES;
            const S = NUM_STRIPS;
            const totalSamples = S * N * 2; // S T-strips + S U-strips

            const sampleVertices = new Float32Array(totalSamples * 3);
            let writeIdx = 0;

            // T-strips: vary T from 0 to 1 at S different U positions
            for (let s = 0; s < S; s++) {
                const uVal = s / S; // u = 0, 0.125, 0.25, ..., 0.875
                for (let i = 0; i < N; i++) {
                    sampleVertices[writeIdx++] = uVal;
                    sampleVertices[writeIdx++] = i / (N - 1);  // t âˆˆ [0, 1]
                    sampleVertices[writeIdx++] = 0;             // surface_id = 0
                }
            }

            // U-strips: vary U from 0 to 1 at S different T positions
            for (let s = 0; s < S; s++) {
                const tVal = (s + 0.5) / S; // t = 0.0625, 0.1875, ..., 0.9375
                for (let i = 0; i < N; i++) {
                    sampleVertices[writeIdx++] = i / N;  // u âˆˆ [0, 1) periodic
                    sampleVertices[writeIdx++] = tVal;
                    sampleVertices[writeIdx++] = 0;      // surface_id = 0
                }
            }

            // Evaluate ALL strips in a single GPU dispatch
            const samplePositions = await this.evaluatePoints(
                sampleVertices, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
            );

            // â”€â”€ Aggregate T-curvature: MAX across all T-strips â”€â”€
            const tRawCurvatures: Float32Array[] = [];
            for (let s = 0; s < S; s++) {
                const offset = s * N * 3;
                const stripPos = samplePositions.subarray(offset, offset + N * 3);
                tRawCurvatures.push(computeRawCurvature(stripPos, N));
            }
            // Take element-wise MAX across all strips
            const tMaxCurvature = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                let maxVal = 0;
                for (let s = 0; s < S; s++) {
                    maxVal = Math.max(maxVal, tRawCurvatures[s][i]);
                }
                tMaxCurvature[i] = maxVal;
            }

            // â”€â”€ Aggregate U-curvature: MAX across all U-strips â”€â”€
            const uRawCurvatures: Float32Array[] = [];
            for (let s = 0; s < S; s++) {
                const offset = (S + s) * N * 3; // U-strips start after T-strips
                const stripPos = samplePositions.subarray(offset, offset + N * 3);
                uRawCurvatures.push(computeRawCurvature(stripPos, N));
            }
            const uMaxCurvature = new Float32Array(N);
            for (let i = 0; i < N; i++) {
                let maxVal = 0;
                for (let s = 0; s < S; s++) {
                    maxVal = Math.max(maxVal, uRawCurvatures[s][i]);
                }
                uMaxCurvature[i] = maxVal;
            }

            // Normalize AFTER aggregation
            const tCurvature = normalizeProfile(tMaxCurvature);
            const uCurvature = normalizeProfile(uMaxCurvature);

            const curvMs = performance.now() - curvStart;

            // Log curvature statistics
            const tMin = Math.min(...Array.from(tCurvature));
            const tMax = Math.max(...Array.from(tCurvature));
            const uMin = Math.min(...Array.from(uCurvature));
            const uMax = Math.max(...Array.from(uCurvature));
            console.log(`[ParametricExport] Curvature sampling: ${curvMs.toFixed(1)}ms (${S} strips Ã— ${N} samples)`);
            console.log(`[ParametricExport]   T-curvature: min=${tMin.toFixed(4)}, max=${tMax.toFixed(4)}`);
            console.log(`[ParametricExport]   U-curvature: min=${uMin.toFixed(4)}, max=${uMax.toFixed(4)}`);

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PHASE 2: Build Adaptive Grid (CPU)
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const gridStart = performance.now();

            const { H, Rt, Rb } = dimensions;
            const avgCircumference = Math.PI * (Rt + Rb);
            const aspectRatios: Record<number, number> = {
                0: avgCircumference / H,
                1: avgCircumference / H,
                2: avgCircumference / (dimensions.tWall || 3),
                3: avgCircumference / (Rb || 10),
                4: avgCircumference / (Rb || 10),
                5: avgCircumference / (dimensions.tBottom || 3),
            };
            for (const key of Object.keys(aspectRatios)) {
                aspectRatios[Number(key)] = Math.max(1, Math.min(20, aspectRatios[Number(key)]));
            }

            const outerDims = computeGridDimensions(
                targetTris, SURFACE_CONFIG[0].budgetFrac, aspectRatios[0]
            );
            const sharedW = outerDims.w;

            // NOTE: Grid Width uniform written AFTER feature merge (below)

            // v16.10: Smoothed profiles no longer used for grid generation.
            // CDF-adaptive spacing has been replaced by uniform spacing.
            // Curvature data is still used for feature detection (detectFeatureEdges).

            // â”€â”€ Feature Edge Detection (v7.0) â”€â”€
            // Detect ridges/valleys using BOTH curvature peaks AND gradient zero-crossings.
            // Pass 3D positions from the BEST strip (highest total curvature) for
            // gradient zero-crossing detection (actual ridge/valley positions).

            // Find best T-strip (highest total curvature) for gradient analysis
            let bestTStrip = 0;
            let bestTSum = 0;
            for (let s = 0; s < S; s++) {
                let sum = 0;
                for (let i = 0; i < N; i++) sum += tRawCurvatures[s][i];
                if (sum > bestTSum) { bestTSum = sum; bestTStrip = s; }
            }
            const bestTPositions = samplePositions.subarray(bestTStrip * N * 3, (bestTStrip + 1) * N * 3);

            // Find best U-strip for gradient analysis
            let bestUStrip = 0;
            let bestUSum = 0;
            for (let s = 0; s < S; s++) {
                let sum = 0;
                for (let i = 0; i < N; i++) sum += uRawCurvatures[s][i];
                if (sum > bestUSum) { bestUSum = sum; bestUStrip = s; }
            }
            const bestUPositions = samplePositions.subarray((S + bestUStrip) * N * 3, (S + bestUStrip + 1) * N * 3);

            const tFeatures = detectFeatureEdges(tMaxCurvature, N, bestTPositions);
            const uFeatures = detectFeatureEdges(uMaxCurvature, N, bestUPositions);
            console.log(`[ParametricExport]   Feature edges detected: ${uFeatures.length} (U) + ${tFeatures.length} (T)`);

            // v16.10: UNIFORM grid spacing.
            //
            // CDF-adaptive spacing (v8.0) concentrated grid lines near high-curvature
            // areas, creating visible density banding on the exported mesh surface.
            // With per-row vertex patching achieving 100% patch rate and 0 collisions,
            // feature fidelity is fully handled by:
            //   1. Per-row vertex patching (exact chain positions on grid vertices)
            //   2. Chain-directed diagonal flip (edges follow ridges)
            //   3. 3D quality edge flip (optimizes surrounding triangles)
            //
            // A uniform grid eliminates density bands and gives the smoothest
            // possible base surface. Features emerge from patching, not from
            // grid concentration.
            //
            // v16.11: Generate U grid at final budget-aware width directly.
            // Previously, computeGridDimensions returned w=738 columns, then a
            // later downsample step trimmed to 735 (desiredBaseCols). The
            // downsampleSortedPositions picks evenly-spaced indices which creates
            // a handful of wider gaps in the otherwise uniform grid â€” visible as
            // "thicker columns." Fix: pre-compute the budget-constrained column
            // count and generate the uniform grid at that exact size, eliminating
            // the downsample step entirely.
            const tCount = outerDims.h + 1;
            const numOuterRowsEarly = tCount; // In local-only mode, no T-rows are injected
            const targetOuterBudgetEarly = Math.floor(targetTris * SURFACE_CONFIG[0].budgetFrac);
            const maxColsEarly = Math.floor(targetOuterBudgetEarly / (2 * Math.max(1, numOuterRowsEarly - 1))) + 1;
            const finalUCols = LOCAL_ONLY_OUTER_ADAPTATION
                ? Math.min(sharedW, maxColsEarly)
                : sharedW;
            const cdfU = new Float32Array(finalUCols);
            for (let i = 0; i < finalUCols; i++) cdfU[i] = i / finalUCols;
            const cdfT = new Float32Array(tCount);
            for (let i = 0; i < tCount; i++) cdfT[i] = i / (tCount - 1);
            // t=0 and t=1 are already exact from uniform generation
            if (finalUCols !== sharedW) {
                console.log(`[ParametricExport]   v16.11 Budget-aware U grid: ${sharedW} â†’ ${finalUCols} columns (no downsample needed)`);
            }

            console.log(`[ParametricExport]   v16.6 mode: LOCAL_ONLY_OUTER_ADAPTATION=${LOCAL_ONLY_OUTER_ADAPTATION}`);

            // â”€â”€ Merge Feature Edges into T Grid (v7.0) â”€â”€
            // v16.6 local-only mode: disable global T-row insertion and keep
            // feature handling local to per-row point-cloud constraints.
            const tMerged = LOCAL_ONLY_OUTER_ADAPTATION
                ? { positions: cdfT, injected: 0 }
                : mergeFeaturePositions(cdfT, tFeatures, false);
            const tPositions = tMerged.positions;

            // For U, the CDF base grid is used as-is â€” per-row features are inserted later.
            const uBasePositions = cdfU;
            const featurePeaksSnapped = tMerged.injected;

            console.log(`[ParametricExport]   T-feature edges merged: ${tMerged.injected} (localOnly=${LOCAL_ONLY_OUTER_ADAPTATION})`);
            console.log(`[ParametricExport]   Base grid: ${uBasePositions.length} U Ã— ${tPositions.length} T`);

            // Compute density ratio diagnostics
            const computeDensityRatio = (pos: Float32Array): number => {
                let minSp = 1, maxSp = 0;
                for (let i = 1; i < pos.length; i++) {
                    const sp = pos[i] - pos[i - 1];
                    if (sp > 0) {
                        minSp = Math.min(minSp, sp);
                        maxSp = Math.max(maxSp, sp);
                    }
                }
                return maxSp / Math.max(minSp, 1e-8);
            };
            const densityRatioT = computeDensityRatio(tPositions);
            const densityRatioU = computeDensityRatio(uBasePositions);

            console.log(`[ParametricExport]   Density ratio: T=${densityRatioT.toFixed(1)}Ã—, U=${densityRatioU.toFixed(1)}Ã—`);
            console.log(`[ParametricExport]   Features: ${featurePeaksSnapped} T merged, ${uFeatures.length} U detected (injected per-row in Phase 2.5)`);

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PHASE 2.5: Per-Row Feature Probing, Chain Linking & T-Subdivision (v10.0)
            //
            // 1. GPU-probe each T-row at 4096 U samples
            // 2. Detect per-row peaks with 5-point stencil + dÂ²r/duÂ² + inflections
            // 3. LINK features across rows into continuous chains (polylines in u,t space)
            // 4. INSERT additional T-rows where chains cross row boundaries diagonally
            // 5. GPU-probe INSERTED rows and detect their features
            // 6. Build union grid (determines column topology)
            // 7. Generate regular-grid mesh (index buffer)
            // 8. Patch each row's feature columns with EXACT peak U
            // 9. Flip diagonals to follow chain direction
            //
            // Result: chain-following topology with vertices ON feature curves.
            // Features are arbitrary â€” they run at ANY angle through (u,t) space.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const probeStart = performance.now();
            // v12.0 high-fidelity mode: denser row probing to reduce sub-sample
            // aliasing before chain linking. User requested spending more compute
            // to improve chain curvature quality.
            const ROW_PROBE_SAMPLES = 8192;
            const numOuterRows = tPositions.length;

            // â”€â”€ Step 1: GPU-probe all original T-rows â”€â”€
            const probeVerts = new Float32Array(numOuterRows * ROW_PROBE_SAMPLES * 3);
            let pIdx = 0;
            for (let j = 0; j < numOuterRows; j++) {
                const tVal = tPositions[j];
                for (let i = 0; i < ROW_PROBE_SAMPLES; i++) {
                    probeVerts[pIdx++] = i / ROW_PROBE_SAMPLES; // u âˆˆ [0, 1)
                    probeVerts[pIdx++] = tVal;
                    probeVerts[pIdx++] = 0; // outer wall
                }
            }

            const probePositions = await this.evaluatePoints(
                probeVerts, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
            );

            const rowProbeData: Float32Array[] = [];
            for (let j = 0; j < numOuterRows; j++) {
                const offset = j * ROW_PROBE_SAMPLES * 3;
                rowProbeData.push(probePositions.subarray(offset, offset + ROW_PROBE_SAMPLES * 3));
            }

            // â”€â”€ Step 2: Detect features for all original rows (v16.0 verified) â”€â”€
            const {
                allRowFeatures,
                allRowTypedFeatures,
                totalRejected: rowRejected
            } = detectAllRowFeatures(rowProbeData, ROW_PROBE_SAMPLES);

            const rowsWithFeatures = allRowFeatures.filter(f => f.length > 0).length;
            const totalRowPeaks = allRowFeatures.reduce((sum, f) => sum + f.length, 0);

            // Count peaks vs valleys from typed data
            let rowPeakCount = 0, rowValleyCount = 0;
            for (const rowFeats of allRowTypedFeatures) {
                for (const f of rowFeats) {
                    if (f.kind === 'peak') rowPeakCount++;
                    else rowValleyCount++;
                }
            }

            console.log(`[ParametricExport] Per-row probing: ${(performance.now() - probeStart).toFixed(1)}ms (${numOuterRows} rows Ã— ${ROW_PROBE_SAMPLES} samples)`);
            console.log(`[ParametricExport]   Rows with features: ${rowsWithFeatures}/${numOuterRows}`);
            console.log(`[ParametricExport]   v16.0 VERIFIED per-row: ${totalRowPeaks} features (${rowPeakCount} peaks, ${rowValleyCount} valleys, ${rowRejected} rejected)`);
            console.log(`[ParametricExport]   Avg features/row: ${(totalRowPeaks / numOuterRows).toFixed(1)}, rejection rate: ${(100 * rowRejected / Math.max(1, totalRowPeaks + rowRejected)).toFixed(1)}%`);

            // â”€â”€ Step 2.5: v16.0 Column-direction probing (verified) â”€â”€
            // v16.6 local-only mode: disabled. Rely on per-row point-cloud
            // constraints only to avoid global feature insertion side effects.
            let colPeaksAdded = 0;
            let colRejected = 0;
            if (!LOCAL_ONLY_OUTER_ADAPTATION) {
                const COL_PROBE_COUNT = 512;
                const colProbeStart = performance.now();
                const colResult = detectAndMergeColumnFeatures(
                    rowProbeData, ROW_PROBE_SAMPLES, tPositions, COL_PROBE_COUNT, allRowFeatures, allRowTypedFeatures
                );
                colPeaksAdded = colResult.addedCount;
                colRejected = colResult.rejectedCount;
                console.log(`[ParametricExport]   v16.0 Column probing: ${colPeaksAdded} verified peaks from ${COL_PROBE_COUNT} columns (${colRejected} rejected, ${(performance.now() - colProbeStart).toFixed(1)}ms)`);
            } else {
                console.log('[ParametricExport]   v16.6 Column probing: disabled (localOnly=true)');
            }
            const totalPeaks = allRowFeatures.reduce((sum, f) => sum + f.length, 0);
            const totalRejected = rowRejected + colRejected;
            console.log(`[ParametricExport]   Total verified peaks: ${totalPeaks} (row=${totalRowPeaks}, col=${colPeaksAdded}), total rejected: ${totalRejected}`);

            // â”€â”€ Build raw peak debug data for green point cloud overlay â”€â”€
            // v16.0: Now includes feature kind (peak=0, valley=1) as third value
            {
                const peakPoints: number[] = [];
                let finalPeakCount = 0, finalValleyCount = 0;
                for (let j = 0; j < allRowFeatures.length; j++) {
                    const tVal = tPositions[j];
                    const typed = j < allRowTypedFeatures.length ? allRowTypedFeatures[j] : [];
                    for (let fi = 0; fi < allRowFeatures[j].length; fi++) {
                        const u = allRowFeatures[j][fi];
                        // Try to find typed info for this feature
                        // v16.1: Use wider tolerance to match column-snapped features
                        const typedMatch = typed.find(t => Math.abs(t.u - u) < 1e-6);
                        const kind = typedMatch ? (typedMatch.kind === 'peak' ? 0 : 1) : 0;
                        peakPoints.push(u, tVal, kind);
                        if (kind === 0) finalPeakCount++; else finalValleyCount++;
                    }
                }
                LAST_PEAK_DEBUG_DATA = {
                    createdAt: Date.now(),
                    totalPeaks: peakPoints.length / 3,
                    points: new Float32Array(peakPoints),
                    rowPeaks: totalRowPeaks,
                    colPeaks: colPeaksAdded,
                    peakCount: finalPeakCount,
                    valleyCount: finalValleyCount,
                    rejected: totalRejected,
                };
            }

            // â”€â”€ Step 3: Link features into chains (v16.3: separated by kind) â”€â”€
            const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, numOuterRows);
            console.log(`[ParametricExport]   v16.3 feature chains: ${chains.length} chains linked`);

            // Chain diagnostics
            if (chains.length > 0) {
                const chainLengths = chains.map(c => c.points.length);
                const avgLen = chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length;
                const maxLen = Math.max(...chainLengths);
                console.log(`[ParametricExport]     Chain lengths: avg=${avgLen.toFixed(1)}, max=${maxLen}, total points=${chainLengths.reduce((a, b) => a + b, 0)}`);
            }

            // â”€â”€ Step 3.5: GPU RE-SNAP â€” find the EXACT mathematical peak for each chain point â”€â”€
            // The per-row probe gives 8192 uniformly-spaced samples. The detected
            // peaks are within Â±1/(2*8192) â‰ˆ Â±0.00006 of the true peak. This is
            // good, but for sharp cusps the true peak can be BETWEEN samples.
            //
            // Re-snap evaluates a tight window of 32 candidates around each chain
            // point on the GPU, finds the one with max/min radius, then does a
            // final parabolic refinement. This gives ~20Ã— better precision than
            // the initial 8192-sample probe.
            if (chains.length > 0) {
                const RESNAP_CANDIDATES = 32;
                const RESNAP_HALFWIDTH = 2.0 / ROW_PROBE_SAMPLES; // Â±2 sample widths
                const RESNAP_STEP = (2 * RESNAP_HALFWIDTH) / (RESNAP_CANDIDATES - 1);

                // Collect all chain points
                const allChainPoints: Array<{ chainIdx: number; ptIdx: number; u: number; row: number }> = [];
                for (let ci = 0; ci < chains.length; ci++) {
                    for (let pi = 0; pi < chains[ci].points.length; pi++) {
                        const pt = chains[ci].points[pi];
                        allChainPoints.push({ chainIdx: ci, ptIdx: pi, u: pt.u, row: pt.row });
                    }
                }

                // Build GPU probe vertices: for each chain point, RESNAP_CANDIDATES positions
                const totalProbes = allChainPoints.length * RESNAP_CANDIDATES;
                const resnapVerts = new Float32Array(totalProbes * 3);
                let rIdx = 0;
                for (const cp of allChainPoints) {
                    const tVal = tPositions[Math.min(cp.row, tPositions.length - 1)];
                    for (let k = 0; k < RESNAP_CANDIDATES; k++) {
                        let uCandidate = cp.u - RESNAP_HALFWIDTH + k * RESNAP_STEP;
                        // Wrap to [0, 1)
                        uCandidate = ((uCandidate % 1) + 1) % 1;
                        resnapVerts[rIdx++] = uCandidate;
                        resnapVerts[rIdx++] = tVal;
                        resnapVerts[rIdx++] = 0; // outer wall
                    }
                }

                // GPU evaluate all resnap candidates
                const resnapPositions = await this.evaluatePoints(
                    resnapVerts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
                );

                // For each chain point, find the candidate with the highest/lowest radius
                let resnapCount = 0;
                for (let cpIdx = 0; cpIdx < allChainPoints.length; cpIdx++) {
                    const cp = allChainPoints[cpIdx];
                    const baseOffset = cpIdx * RESNAP_CANDIDATES * 3;

                    // Determine if this is a peak (maximum) or valley (minimum).
                    // Use the original probe data: check if radius at this u is a local max or min.
                    const origRowData = rowProbeData[Math.min(cp.row, rowProbeData.length - 1)];
                    const sampleIdx = Math.round(cp.u * ROW_PROBE_SAMPLES) % ROW_PROBE_SAMPLES;
                    const rCenter = Math.sqrt(
                        origRowData[sampleIdx * 3] ** 2 +
                        origRowData[sampleIdx * 3 + 1] ** 2
                    );
                    const prevSampleIdx = (sampleIdx - 1 + ROW_PROBE_SAMPLES) % ROW_PROBE_SAMPLES;
                    const nextSampleIdx = (sampleIdx + 1) % ROW_PROBE_SAMPLES;
                    const rPrev = Math.sqrt(
                        origRowData[prevSampleIdx * 3] ** 2 +
                        origRowData[prevSampleIdx * 3 + 1] ** 2
                    );
                    const rNext = Math.sqrt(
                        origRowData[nextSampleIdx * 3] ** 2 +
                        origRowData[nextSampleIdx * 3 + 1] ** 2
                    );
                    const isMax = (rCenter >= rPrev && rCenter >= rNext);

                    // Extract radii from resnap candidates
                    const candidateRadii = new Float32Array(RESNAP_CANDIDATES);
                    for (let k = 0; k < RESNAP_CANDIDATES; k++) {
                        const off = baseOffset + k * 3;
                        const x = resnapPositions[off];
                        const y = resnapPositions[off + 1];
                        candidateRadii[k] = Math.sqrt(x * x + y * y);
                    }

                    // Find the best candidate
                    let bestK = 0;
                    let bestR = candidateRadii[0];
                    for (let k = 1; k < RESNAP_CANDIDATES; k++) {
                        if (isMax ? (candidateRadii[k] > bestR) : (candidateRadii[k] < bestR)) {
                            bestR = candidateRadii[k];
                            bestK = k;
                        }
                    }

                    // Parabolic refinement on the resnap candidates
                    let finalU: number;
                    if (bestK > 0 && bestK < RESNAP_CANDIDATES - 1) {
                        const L = candidateRadii[bestK - 1];
                        const C = candidateRadii[bestK];
                        const R = candidateRadii[bestK + 1];
                        const denom = L - 2 * C + R;
                        let delta = 0;
                        if (Math.abs(denom) > 1e-14) {
                            delta = 0.5 * (L - R) / denom;
                            delta = Math.max(-0.5, Math.min(0.5, delta));
                        }
                        const refinedK = bestK + delta;
                        finalU = cp.u - RESNAP_HALFWIDTH + refinedK * RESNAP_STEP;
                    } else {
                        finalU = cp.u - RESNAP_HALFWIDTH + bestK * RESNAP_STEP;
                    }

                    // Wrap to [0, 1)
                    finalU = ((finalU % 1) + 1) % 1;

                    // Only apply if the resnap moved the point (avoid noise)
                    const moved = circularDistance(cp.u, finalU);
                    if (moved > 1e-7 && moved < RESNAP_HALFWIDTH * 1.5) {
                        chains[cp.chainIdx].points[cp.ptIdx] = { row: cp.row, u: finalU };
                        resnapCount++;
                    }
                }

                console.log(`[ParametricExport]   v13.0 GPU re-snap: ${resnapCount}/${allChainPoints.length} points refined (${RESNAP_CANDIDATES} candidates/point, Â±${(RESNAP_HALFWIDTH * ROW_PROBE_SAMPLES).toFixed(1)} samples)`);
            }

            // â”€â”€ Step 4: Insert additional T-rows where chains cross diagonally â”€â”€
            // v16.4: Make row insertion budget-aware to avoid exploding outer-wall
            // triangle count (and visual over-tessellation) on high-feature styles.
            const targetOuterBudget = Math.floor(targetTris * SURFACE_CONFIG[0].budgetFrac);

            // v16.11: In local-only mode, the U grid was already generated at the
            // budget-constrained width (finalUCols), so no downsample is needed.
            // In non-local mode, optionally slim the outer-wall base U set before
            // insertion so there is room for feature columns in the later union grid.
            const maxColsAtCurrentRows = Math.floor(targetOuterBudget / (2 * Math.max(1, numOuterRows - 1))) + 1;
            const desiredBaseCols = LOCAL_ONLY_OUTER_ADAPTATION
                ? maxColsAtCurrentRows
                : Math.max(160, Math.floor(maxColsAtCurrentRows * 0.82));
            const outerBaseU = (LOCAL_ONLY_OUTER_ADAPTATION && uBasePositions.length <= desiredBaseCols)
                ? uBasePositions // Already at correct size from v16.11 pre-computation
                : downsampleSortedPositions(uBasePositions, Math.min(uBasePositions.length, desiredBaseCols));
            if (outerBaseU.length !== uBasePositions.length) {
                console.log(`[ParametricExport]   v16.4 Outer base downsample: ${uBasePositions.length} â†’ ${outerBaseU.length} columns (pre-union)`);
            }

            // Maximum rows allowed by targetOuterBudget for this base width.
            const maxRowsForBudget = Math.floor(targetOuterBudget / (2 * Math.max(1, outerBaseU.length - 1))) + 1;
            const budgetInsertionCap = Math.max(0, maxRowsForBudget - numOuterRows);
            const maxRowInsertions = LOCAL_ONLY_OUTER_ADAPTATION
                ? 0
                : Math.min(200, Math.floor(numOuterRows * 0.5), budgetInsertionCap);
            // v11.5: adaptive insertion threshold improves ridge coverage on both
            // sharp and smooth features by adding intermediate rows when per-step
            // U-shifts are smaller than legacy 0.005 but still significant.
            const adaptiveInsertThreshold = Math.max(0.0035, 2.0 / Math.max(1, outerBaseU.length));
            const insertion = insertChainGuidedRows(tPositions, chains, maxRowInsertions, adaptiveInsertThreshold);
            let finalT = insertion.tPositions;
            const rowMapping = insertion.rowMapping;
            console.log(`[ParametricExport]   v16.6 T-row insertion: ${insertion.insertedCount} rows added (${numOuterRows} â†’ ${finalT.length}, minUShift=${adaptiveInsertThreshold.toFixed(4)}, cap=${maxRowInsertions}, localOnly=${LOCAL_ONLY_OUTER_ADAPTATION})`);

            // â”€â”€ Step 5: GPU-probe inserted rows and detect their features â”€â”€
            let finalRowFeatures: number[][];
            let insertedRowProbeData: Float32Array[] = []; // used for inserted-row feature detection
            if (insertion.insertedCount > 0) {
                // Find which rows are inserted (negative rowMapping)
                const insertedRowIndices: number[] = [];
                for (let j = 0; j < rowMapping.length; j++) {
                    if (rowMapping[j] < 0) insertedRowIndices.push(j);
                }

                // GPU-probe the inserted rows
                const insertProbeVerts = new Float32Array(insertedRowIndices.length * ROW_PROBE_SAMPLES * 3);
                let ipIdx = 0;
                for (const j of insertedRowIndices) {
                    const tVal = finalT[j];
                    for (let i = 0; i < ROW_PROBE_SAMPLES; i++) {
                        insertProbeVerts[ipIdx++] = i / ROW_PROBE_SAMPLES;
                        insertProbeVerts[ipIdx++] = tVal;
                        insertProbeVerts[ipIdx++] = 0;
                    }
                }

                const insertProbePositions = await this.evaluatePoints(
                    insertProbeVerts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
                );

                // Detect features on inserted rows
                insertedRowProbeData = [];
                for (let k = 0; k < insertedRowIndices.length; k++) {
                    const offset = k * ROW_PROBE_SAMPLES * 3;
                    insertedRowProbeData.push(insertProbePositions.subarray(offset, offset + ROW_PROBE_SAMPLES * 3));
                }
                const insertedResult = detectAllRowFeatures(insertedRowProbeData, ROW_PROBE_SAMPLES);
                const insertedFeatures = insertedResult.allRowFeatures;

                // Build final feature array: original rows keep their features,
                // inserted rows get GPU-detected features (not just interpolated)
                finalRowFeatures = [];
                let insertIdx = 0;
                for (let j = 0; j < rowMapping.length; j++) {
                    if (rowMapping[j] >= 0) {
                        // Original row
                        const origRow = rowMapping[j];
                        finalRowFeatures.push(
                            origRow < allRowFeatures.length ? [...allRowFeatures[origRow]] : []
                        );
                    } else {
                        // Inserted row â€” use GPU-detected features
                        finalRowFeatures.push(
                            insertIdx < insertedFeatures.length ? insertedFeatures[insertIdx] : []
                        );
                        insertIdx++;
                    }
                }

                const insertedPeaks = insertedFeatures.reduce((sum: number, f: number[]) => sum + f.length, 0);
                console.log(`[ParametricExport]   Inserted rows detected ${insertedPeaks} additional peaks`);
            } else {
                finalRowFeatures = allRowFeatures;
            }

            // Build UV-space chain debug lines for preview overlay visualization.
            // This lets users verify where chain continuity breaks after export.
            const origToFinalRow = new Map<number, number>();
            for (let f = 0; f < rowMapping.length; f++) {
                if (rowMapping[f] >= 0) origToFinalRow.set(rowMapping[f], f);
            }

            const debugLines: ChainDebugLine[] = [];
            for (const chain of chains) {
                if (chain.points.length < 2) continue;
                const remapped: Array<[number, number]> = [];
                for (const pt of chain.points) {
                    const fr = origToFinalRow.get(pt.row);
                    if (fr === undefined || fr < 0 || fr >= finalT.length) continue;
                    remapped.push([pt.u, finalT[fr]]);
                }
                if (remapped.length >= 2) debugLines.push({ points: remapped });
            }

            LAST_CHAIN_DEBUG_DATA = {
                createdAt: Date.now(),
                chainCount: chains.length,
                lineCount: debugLines.length,
                lines: debugLines,
            };

            // â”€â”€ Step 6: Build UNION feature grid from ALL rows (original + inserted) â”€â”€
            // v11.3: Union grid used for ALL surfaces including outer wall.
            // Budget cap: compute max columns from targetTris and T-row count.
            // Formula: maxTris = 2 * (numU-1) * (numT-1) â†’ numU = maxTris/(2*(numT-1)) + 1
            const numTRows = finalT.length;
            const maxOuterColumns = Math.floor(targetOuterBudget / (2 * Math.max(1, numTRows - 1))) + 1;
            let unionU: Float32Array;
            if (LOCAL_ONLY_OUTER_ADAPTATION) {
                // v20.0: Use base grid directly (no global corridor columns).
                // v17.0 corridor columns doubled grid size (735â†’1395, +660 cols).
                // v18.0 tried GPU-surface subdivision but dihedral stayed at 0.04 â€”
                // bridge triangles (chain_r, chain_r+1, grid_vertex) are topologically
                // broken and can't be fixed by post-processing.
                // v19.0: chain vertices removed â†’ features imprecise (Â±0.5 grid cell).
                // v20.0: per-row UV snapping â€” nearest grid vertex snapped to chain U.
                // No extra vertices, no chain-strip boundary, exact ridge positions.
                unionU = outerBaseU;
            } else {
                unionU = buildUnionFeatureGrid(outerBaseU, finalRowFeatures, maxOuterColumns);
            }
            const featureColumnsAdded = unionU.length - outerBaseU.length;
            console.log(`[ParametricExport]   Union grid: ${unionU.length} U (base=${outerBaseU.length} + ${featureColumnsAdded} feature columns, budget max=${maxOuterColumns}, localOnly=${LOCAL_ONLY_OUTER_ADAPTATION})`);

            // â”€â”€ Step 7-9: Generate surfaces â”€â”€
            // v11.2: Outer wall uses union grid + per-row patching (no column explosion).
            // Other surfaces use the regular adaptive grid (no features).
            const surfaceStats: string[] = [];
            const allVertArrays: Float32Array[] = [];
            const allIdxArrays: Uint32Array[] = [];
            let vertexOffset = 0;

            // v11.3: Per-row feature patching replaces global column merging
            let outerW = unionU.length; // kept for diagnostics
            let outerQuadMap: Int32Array | null = null; // v11.3: gap-free quadâ†’index mapping
            let outerGridVertexCount = 0; // v16.27: grid vertex count for chain-strip detection
            let outerChainEdges: Array<[number, number]> = []; // v16.28: constraint edges for flip protection

            for (const surf of SURFACE_CONFIG) {
                if (surf.id === 0) {
                    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                    // v11.3: PER-ROW PATCHED OUTER WALL â€” union grid + chain vertex patching
                    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                    const targetOuterTris = Math.floor(targetTris * surf.budgetFrac);
                    const cdtResult = buildCDTOuterWall(
                        chains, rowMapping, finalT, unionU,
                        targetOuterTris, surf.id
                    );

                    // v16.9: Stitch vertices REMOVED.
                    // With 100% patch rate, 0 collisions, chain-directed flip,
                    // and 3D quality flip, the stitch fan pass is redundant.
                    // Feature fidelity comes from:
                    //   1. Per-row vertex patching (exact chain positions)
                    //   2. Chain-directed diagonal flip (edges follow ridges)
                    //   3. 3D quality edge flip (optimizes surrounding triangles)
                    // Removing stitch vertices eliminates density banding artifacts
                    // and frees ~4-5% of triangle budget for uniform base density.

                    outerGridVertexCount = cdtResult.gridVertexCount;
                    outerChainEdges = cdtResult.chainEdges;
                    allVertArrays.push(cdtResult.vertices);

                    if (vertexOffset > 0) {
                        const offsetIndices = new Uint32Array(cdtResult.indices.length);
                        for (let i = 0; i < cdtResult.indices.length; i++) {
                            offsetIndices[i] = cdtResult.indices[i] + vertexOffset;
                        }
                        allIdxArrays.push(offsetIndices);
                    } else {
                        allIdxArrays.push(cdtResult.indices);
                    }

                    const outerVerts = cdtResult.vertices.length / 3;
                    const outerTris = cdtResult.indices.length / 3;
                    vertexOffset += outerVerts;
                    outerW = unionU.length; // grid width = number of columns in union grid
                    outerQuadMap = cdtResult.quadMap; // v11.3: quadâ†’index mapping
                    surfaceStats.push(`  ${surf.name}: ${outerW}Ã—${finalT.length} grid = ${outerTris.toLocaleString()} tris (chains=${chains.length})`);
                } else {
                    // Other surfaces: uniform grid with base U positions
                    const surfBudget = targetTris * surf.budgetFrac;
                    const nonOuterW = uBasePositions.length;
                    const h = Math.max(2, Math.round(surfBudget / (2 * nonOuterW)));
                    const surfT = new Float32Array(h + 1);
                    for (let j = 0; j <= h; j++) surfT[j] = j / h;
                    const grid = generateAdaptiveGrid(uBasePositions, surfT, surf.id, surf.invertWinding);

                    allVertArrays.push(grid.vertices);

                    if (vertexOffset > 0) {
                        const offsetIndices = new Uint32Array(grid.indices.length);
                        for (let i = 0; i < grid.indices.length; i++) {
                            offsetIndices[i] = grid.indices[i] + vertexOffset;
                        }
                        allIdxArrays.push(offsetIndices);
                    } else {
                        allIdxArrays.push(grid.indices);
                    }

                    vertexOffset += grid.vertices.length / 3;
                    const tris = grid.indices.length / 3;
                    const w = grid.w;
                    const h2 = (grid.vertices.length / 3 / w) - 1;
                    surfaceStats.push(`  ${surf.name}: ${w}Ã—${h2} grid = ${tris.toLocaleString()} tris`);
                }
            }

            // Combine all surfaces
            const totalVerts = allVertArrays.reduce((sum, a) => sum + a.length, 0);
            const totalIdxs = allIdxArrays.reduce((sum, a) => sum + a.length, 0);
            const combinedVerts = new Float32Array(totalVerts);
            const combinedIdxs = new Uint32Array(totalIdxs);
            let vOff = 0, iOff = 0;
            for (const v of allVertArrays) { combinedVerts.set(v, vOff); vOff += v.length; }
            for (const ix of allIdxArrays) { combinedIdxs.set(ix, iOff); iOff += ix.length; }

            const vertexCount = combinedVerts.length / 3;
            const triangleCount = combinedIdxs.length / 3;
            const gridMs = performance.now() - gridStart;

            console.log(`[ParametricExport] Grid generation: ${gridMs.toFixed(1)}ms`);
            console.log(`[ParametricExport] Total: ${vertexCount.toLocaleString()} verts, ${triangleCount.toLocaleString()} tris`);
            for (const stat of surfaceStats) console.log(`[ParametricExport] ${stat}`);

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PHASE 3: Evaluate Full Mesh (GPU)
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const gpuStart = performance.now();

            // Write Grid Width (W) to Uniforms â€” used by relax_vertices shader
            // for row/col neighbor addressing.  chunk4.w is at offset 76 (19 * 4 bytes).
            // v8.2: outerW = union grid width (same topology for all rows)
            const widthUniform = new Float32Array([outerW]);
            this.device.queue.writeBuffer(uniformBuffer, 76, widthUniform.buffer);

            // v8.2: Relaxation DISABLED.  Per-row feature patching writes
            // different U values into the same column across rows.  The
            // relax shader assumes column c has the same U in every row
            // (it averages with left/right neighbors at colÂ±1).  With
            // patched vertices, relaxation would smear the exact feature
            // positions back toward the union-grid median â€” destroying the
            // per-row precision we just established.
            const resultData = await this.evaluatePoints(
                combinedVerts, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                false, // Snap disabled â€” union grid has dedicated feature columns
                0      // v8.2: relax=0 â€” patched per-row U would be smeared by Laplacian
            );

            const gpuMs = performance.now() - gpuStart;

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PHASE 4: Post-GPU Quality Improvement (v11.3)
            //
            // v11.3 FIX: chainDirectedFlip and flipEdges3D now use the quadMap
            // from buildCDTOuterWall instead of the broken `quadIdx * 6` formula.
            // The old formula assumed a gap-free index buffer, but seam-guard
            // cells produce gaps, causing index corruption ("tons of bad triangles").
            //
            // v11.2: Per-row patching places vertices at exact chain positions
            // but UV-space diagonal alignment may not be optimal in 3D.
            // After GPU evaluation provides actual XYZ positions, we run:
            //   Stage 1: chainDirectedFlip â€” forces diagonals along chain edges
            //   Stage 2: flipEdges3D â€” generic dihedral+angle quality improvement
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const flip3DStart = performance.now();

            // The outer wall occupies the first outerW Ã— finalT.length vertices
            // in the combined buffer. Its indices are at the start of combinedIdxs.
            const outerH = finalT.length;

            // Stage 1: Chain-directed flip â€” uses chain topology to force
            // diagonals along ridge lines (v11.3: with quadMap)
            const { flipCount: chainFlips, lockedQuads } = chainDirectedFlip(
                combinedIdxs,    // indices (outer wall at start, mutated in-place)
                unionU,          // column U positions
                outerW,          // grid width (number of columns)
                outerH,          // grid height (number of rows)
                chains,          // feature chains from Phase 2.5
                rowMapping,      // row mapping (final â†’ original)
                false,           // invertWinding = false for outer wall
                outerQuadMap!    // v11.3: quadâ†’index mapping from buildCDTOuterWall
            );
            console.log(`[ParametricExport]   v14.0 chain-directed flip: ${chainFlips} diagonals along ridges (${lockedQuads.size} quads locked)`);

            // Stage 2: Generic 3D edge flip â€” improves triangle quality using
            // dihedral angle + min-angle criterion on actual 3D positions (v10.2)
            // Skips quads locked by chain-directed flip.
            const genericFlips = flipEdges3D(
                combinedIdxs,    // indices (mutated in-place)
                resultData,      // 3D positions from GPU
                outerW,          // grid width
                outerH,          // grid height
                false,           // invertWinding = false for outer wall
                lockedQuads,     // locked quads from chain-directed flip
                outerQuadMap!    // v11.3: quadâ†’index mapping
            );

            const flip3DMs = performance.now() - flip3DStart;
            console.log(`[ParametricExport]   v11.3 3D edge flip: ${genericFlips} quality flips (${flip3DMs.toFixed(1)}ms)`);


            //
            // v16.28f + v16.34: Chain-strip 3D edge flip + boundary diagonal
            // [Extracted to parametric/ChainStripOptimizer.ts]
            //
            const outerIdxCount = allIdxArrays[0].length;
            const constraintEdgeSet = buildConstraintEdgeSet(outerChainEdges);

            const csResult = optimizeChainStrips({
                combinedIdxs,
                positions: resultData,
                combinedVerts,
                constraintEdgeSet,
                outerGridVertexCount,
                outerIdxCount,
                finalT,
            });
            console.log(`[ParametricExport]   v16.31 chain-strip 3D edge flip: ${csResult.phaseAFlips}+${csResult.phaseBFlips}+${csResult.phaseCFlips} flips (angle+valence+shortDiag) on ${csResult.chainStripTriCount} chain-strip tris (${csResult.timeMs.toFixed(1)}ms)`);
            console.log(`[ParametricExport]     rejects: rowSpan=${csResult.rowSpanRejects}, edgeLen=${csResult.edgeLenRejects}, aspect=${csResult.aspectRejects}, valenceBonus=${csResult.valenceBonusFlips}`);
            console.log(`[ParametricExport]     valence before: ${csResult.valenceStats.before.total} verts, ${csResult.valenceStats.before.low} low(<5), ${csResult.valenceStats.before.ideal} ideal(6), ${csResult.valenceStats.before.high} high(>7)`);
            console.log(`[ParametricExport]     valence after:  ${csResult.valenceStats.after.total} verts, ${csResult.valenceStats.after.low} low(<5), ${csResult.valenceStats.after.ideal} ideal(6), ${csResult.valenceStats.after.high} high(>7)`);

            const bdResult = optimizeBoundaryDiagonals({
                combinedIdxs,
                positions: resultData,
                outerW,
                outerH,
                outerQuadMap: outerQuadMap!,
                outerIdxCount,
                outerGridVertexCount,
            });
            console.log(`[ParametricExport]   v16.34 boundary diagonal optimization: ${bdResult.flips} cell diag flips on ${bdResult.checked} boundary cells (${bdResult.timeMs.toFixed(1)}ms)`);

            // 
            // v16.29 / v18.0: Chain-strip midpoint subdivision
            // [Extracted to parametric/MeshSubdivision.ts]
            // 
            const subdivResult = await subdivideLongEdges(
                {
                    combinedIdxs,
                    resultData,
                    combinedVerts,
                    outerIdxCount: allIdxArrays[0].length,
                    outerGridVertexCount,
                    constraintEdgeSet,
                    outerW,
                    outerH,
                },
                (uvBatch) => this.evaluatePoints(
                    uvBatch, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                    false, 0
                ),
            );
            const finalResultData = subdivResult.resultData;
            const finalCombinedIdxs = subdivResult.indices;
            const splitCount = subdivResult.splitCount;
            console.log(`[ParametricExport]   v18.0 GPU-surface subdivision: ${splitCount} edges split → ${splitCount * 2} new tris (${subdivResult.stats.timeMs.toFixed(1)}ms)`);
            console.log(`[ParametricExport]     avg grid edge: ${subdivResult.stats.avgGridEdge.toFixed(3)}mm, interior threshold: ${Math.sqrt(subdivResult.stats.interiorThreshold).toFixed(3)}mm, boundary threshold: ${Math.sqrt(subdivResult.stats.boundaryThreshold).toFixed(3)}mm, candidates: ${subdivResult.stats.candidates}, boundary neighbor tris: ${subdivResult.stats.boundaryTrisAdded}`);


            //
            // v16.33 + v16.31: Boundary diagnostic + mesh diagnostics
            // [Extracted to parametric/ChainStripOptimizer.ts]
            //
            const bndDiag = computeBoundaryDiagnostic({
                indices: finalCombinedIdxs,
                positions: finalResultData,
                outerIdxCount,
                outerGridVertexCount,
            });
            console.log(`[ParametricExport]   v16.33 boundary diagnostic: ${bndDiag.boundaryEdgeCount} boundary edges`);
            console.log(`[ParametricExport]     dihedral dot(n0,n1): avg=${bndDiag.dihedralAvg.toFixed(4)}, min=${bndDiag.dihedralMin.toFixed(4)}, max=${bndDiag.dihedralMax.toFixed(4)}`);

            const meshDiag = computeMeshDiagnostics({
                finalIndices: finalCombinedIdxs,
                finalPositions: finalResultData,
                combinedVerts,
                outerIdxCountAfterSubdiv: allIdxArrays[0].length + (finalCombinedIdxs.length - combinedIdxs.length),
                origVertCount: vertexCount,
                maxSingleRowTSpan: csResult.maxSingleRowTSpan,
            });
            console.log(`[ParametricExport]   v16.31 diagnostics:`);
            console.log(`[ParametricExport]     cross-row tris: 2-row=${meshDiag.crossRow1}, 3-row=${meshDiag.crossRow2}, 4+row=${meshDiag.crossRow3plus}`);
            console.log(`[ParametricExport]     aspect ratios: >5=${meshDiag.aspectOver5}, >10=${meshDiag.aspectOver10}, >20=${meshDiag.aspectOver20}`);
            console.log(`[ParametricExport]     low valence: val=3: ${meshDiag.val3}, val=4: ${meshDiag.val4}, val=5: ${meshDiag.val5} (outer wall only)`);


            const finalVertexCount = finalResultData.length / 3;
            const finalTriangleCount = finalCombinedIdxs.length / 3;

            // NaN guard
            let nanCount = 0;
            for (let i = 0; i < finalResultData.length; i++) {
                if (!Number.isFinite(finalResultData[i])) {
                    finalResultData[i] = 0;
                    nanCount++;
                }
            }
            if (nanCount > 0) {
                console.warn(`[ParametricExport] Stripped ${nanCount} NaN/Inf values.`);
            }

            const totalMs = performance.now() - startTime;
            console.log(`[ParametricExport] Complete: ${totalMs.toFixed(0)}ms (curvature: ${curvMs.toFixed(0)}ms, grid: ${gridMs.toFixed(0)}ms, GPU: ${gpuMs.toFixed(0)}ms)`);

            return {
                mesh: {
                    vertices: finalResultData,
                    indices: finalCombinedIdxs,
                    vertexCount: finalVertexCount,
                    triangleCount: finalTriangleCount,
                },
                computeTimeMs: totalMs,
                gridDimensions: { nu: outerW, nt: finalT.length - 1 },
                adaptiveStats: {
                    densityRatio: densityRatioT,
                    featurePeaksSnapped,
                    tCurvatureRange: [tMin, tMax],
                    uCurvatureRange: [uMin, uMax],
                },
            };

        } finally {
            buffers.forEach(b => b.destroy());
        }
    }
}
