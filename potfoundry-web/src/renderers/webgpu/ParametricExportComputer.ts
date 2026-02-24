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

import { MeshData, PotDimensions, StyleOptions, StyleId } from '../../geometry/types';
import { buildStyleParamPayload } from '../../utils/styleParams';
import { computeRawCurvature, normalizeProfile } from './parametric/CurvatureAnalysis';
import {
    circularDistance,
    detectFeatureEdges,
    detectAllRowFeatures,
    detectAndMergeColumnFeatures,
} from './parametric/FeatureDetection';
import {
    CHAIN_LINK_RADIUS,
    linkFeatureChainsByKind,
    insertChainGuidedRows,
} from './parametric/ChainLinker';
import {
    bsearchFloor,
    mergeFeaturePositions,
    generateAdaptiveGrid,
    buildUnionFeatureGrid,
    computeGridDimensions,
    downsampleSortedPositions,
} from './parametric/GridBuilder';
import { buildCDTOuterWall } from './parametric/OuterWallTessellator';
import { chainDirectedFlip, flipEdges3D, STITCH_BAND_HALF_WIDTH, CHAIN_LOCK_BAND_HALF_WIDTH } from './parametric/MeshOptimizer';
import type { FeatureChain } from './parametric/types';
// NOTE: cdt2d import removed in v11.1 â€” no longer needed on the hot path.
// The grid-native approach eliminates the O(nÂ²) CDT library dependency.

// ============================================================================
// Types
// ============================================================================

export interface ParametricExportParams {
    dimensions: PotDimensions;
    styleId: StyleId;
    styleOpts: StyleOptions;
    styleIndex: number;
    /** Target triangle count (default: 2M = ~100MB STL) */
    targetTriangles?: number;
    /** Number of anisotropic relaxation steps (v5.3). Default: 20 */
    relaxIterations?: number;
}

export interface ParametricExportResult {
    mesh: MeshData;
    computeTimeMs: number;
    gridDimensions: { nu: number; nt: number };
    adaptiveStats: {
        densityRatio: number;
        featurePeaksSnapped: number;
        tCurvatureRange: [number, number];
        uCurvatureRange: [number, number];
    };
}

export interface ChainDebugLine {
    points: Array<[number, number]>; // [u, t]
}

export interface ChainDebugData {
    createdAt: number;
    chainCount: number;
    lineCount: number;
    lines: ChainDebugLine[];
}

/** Feature kind: ridge peak (local max radius) or valley (local min radius). */
export type FeatureKind = 'peak' | 'valley';

/** A classified, verified feature point detected by row/column probing. */
export interface FeaturePoint {
    /** U position in [0, 1) */
    u: number;
    /** Feature classification */
    kind: FeatureKind;
    /** Cylindrical radius at the feature position */
    radius: number;
    /** Peak-to-valley prominence in the local neighbourhood (mm) */
    prominence: number;
    /** Confidence score in [0, 1]: 1 = strong isolated extremum, 0 = marginal */
    confidence: number;
}

/** Raw per-row (and per-column) peak positions for debug visualization. */
export interface PeakDebugData {
    createdAt: number;
    /** Total number of raw peak points */
    totalPeaks: number;
    /** Peak positions as [u, t, kind] triples (flattened: [u0,t0,k0, u1,t1,k1, ...])
     *  k=0 for peak, k=1 for valley */
    points: Float32Array;
    /** Number of row-detected peaks */
    rowPeaks: number;
    /** Number of column-detected peaks */
    colPeaks: number;
    /** Breakdown: peaks vs valleys */
    peakCount: number;
    valleyCount: number;
    /** Number of candidates that failed verification */
    rejected: number;
}

let LAST_CHAIN_DEBUG_DATA: ChainDebugData | null = null;
let LAST_PEAK_DEBUG_DATA: PeakDebugData | null = null;

export function getLastChainDebugData(): ChainDebugData | null {
    return LAST_CHAIN_DEBUG_DATA;
}

export function getLastPeakDebugData(): PeakDebugData | null {
    return LAST_PEAK_DEBUG_DATA;
}

// ============================================================================
// Surface Grid Definitions
// ============================================================================

const SURFACE_CONFIG = [
    { id: 0, name: 'Outer Wall', budgetFrac: 0.72, invertWinding: false },
    { id: 1, name: 'Inner Wall', budgetFrac: 0.14, invertWinding: true },
    { id: 2, name: 'Rim', budgetFrac: 0.04, invertWinding: false },
    { id: 3, name: 'Bottom Under', budgetFrac: 0.04, invertWinding: true },
    { id: 4, name: 'Bottom Top', budgetFrac: 0.03, invertWinding: true },
    { id: 5, name: 'Drain', budgetFrac: 0.03, invertWinding: true },
] as const;

/** Samples per strip for curvature probing.
 * 4096 gives ~0.088Â° resolution for feature detection. */
const CURVATURE_SAMPLES = 4096;

/** Number of parallel strips for multi-angle curvature detection */
const NUM_STRIPS = 16;

// ============================================================================
// Curvature Computation â€” imported from ./parametric/CurvatureAnalysis.ts
// (computeRawCurvature, normalizeProfile, smoothProfile)
// ============================================================================

/** v10.7: Number of columns on EACH side of the ridge to include in the
 * stitch band.  Total band width = 2 * STITCH_BAND_HALF_WIDTH + 1 quads.
 * Wider band u2192 more quads get 4-tri fan subdivision u2192 smoother transition
 * increasing stitch coverage from ~3% to ~10%.
 * Performance impact: each extra band column adds 2 tris per quad row per
 * chain segment.  At 500K with 93 chains u00d7 73 avg pts u2192 +27K extra tris
 * per extra column, well within budget. */

/** v16.6 LOCAL-ONLY OUTER ADAPTATION MODE:
 *  Feature-guided mesh refinement is done ONLY through per-row vertex
 *  patching and chain-constrained stitch topology. No global grid changes:
 *  - No global T-row insertion
 *  - No global U-column insertion from per-row features
 *
 * Feature fidelity is driven by per-row vertex patching + stitch fan topology,
 * avoiding global grid reshaping that can hurt surrounding smoothness.
 */
const LOCAL_ONLY_OUTER_ADAPTATION = true;

/** v10.8: Number of columns on EACH side of the peak to receive gradient-based
 * U redistribution.  Total redistribution band = 2 * GRADIENT_PATCH_HALF_WIDTH + 1.
 * v10.10: NO LONGER USED u2014 peak-only patching eliminates flanking column movement.
 * Retained as documentation of the historical value. */
// const GRADIENT_PATCH_HALF_WIDTH = 4;
// [Extracted] buildCDTOuterWall -> parametric/OuterWallTessellator.ts

// [Extracted] chainDirectedFlip, flipEdges3D -> parametric/MeshOptimizer.ts

// ============================================================================
// Feature Detection â€” imported from ./parametric/FeatureDetection.ts
// (detectRowFeaturesV16, detectRowFeatures, detectAllRowFeatures,
//  detectColumnFeaturesV16, detectColumnFeatures, detectAndMergeColumnFeatures,
//  circularDistance)
// ============================================================================
// ============================================================================
// Chain Linking  imported from ./parametric/ChainLinker.ts
// (circularSignedDelta, liftUToReference, unwrapChain, chainRoughness,
//  suppressDuplicateChains, resnapChainToMeasuredPeaks, postProcessFeatureChains,
//  linkFeatureChainsCore, linkFeatureChains, linkFeatureChainsByKind,
//  insertChainGuidedRows, CHAIN_LINK_RADIUS)
// ============================================================================
// ============================================================================
// ============================================================================
// Grid Building  imported from ./parametric/GridBuilder.ts
// (bsearchFloor, mergeFeaturePositions, generateCDFAdaptivePositions,
//  generateAdaptiveGrid, buildUnionFeatureGrid, patchRowFeatures,
//  computeGridDimensions, downsampleSortedPositions, FLANK_OFFSET,
//  MIN_U_SEPARATION, FLANK_OFFSETS, FEATURE_CLUSTER_RADIUS)
// ============================================================================

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

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // v16.28f: Chain-strip 3D edge flip (ANGLE + VALENCE)
            //
            // Chain-strip triangles are produced by sweepRegion() with a
            // consistent `nextBotU <= nextTopU` diagonal bias. This creates
            // a visible sawtooth on one side of feature ridges â€” especially
            // on ridges that run at a more vertical angle (small U-shift).
            //
            // TWO-PHASE approach:
            //   Phase A: Angle-based Delaunay flips (max-min-angle improvement)
            //            with valence bonus â€” flips that also improve valence
            //            toward 6 get a reduced threshold.
            //   Phase B: Valence-only flips â€” for edges where the angle doesn't
            //            improve much but the 4 involved vertices have irregular
            //            valence (<5 or >7). Flipping such edges redistributes
            //            connectivity, eliminating "pinch points" where 3-4
            //            edges meet a vertex and "star points" with 8+ edges.
            //
            // Guards (both phases):
            //   1. Convexity: only flip convex quads
            //   2. Normal consistency: both new tris must face same way as originals
            //   3. Row-span: new tris must not exceed the original pair's T-extent
            //   4. Edge length: new edge â‰¤ 2Ã— longest perimeter edge
            //   5. Aspect ratio: reject only extreme slivers (aspect > 12)
            //   6. Constraint protection: never flip chain edges
            //   7. Chain-strip only: no boundary flips into grid-managed quads
            //   8. Angle floor: flipped result must not have min-angle < 0.05 rad
            //
            // v16.28f improvements over v16.28e:
            //   - Added valence tracking (vertex â†’ edge count) for chain-strip region
            //   - Phase A: valence-improving flips use threshold 0.001 instead of 0.005
            //   - Phase B: pure valence flips (no angle requirement) with angle floor
            //   - Diagnostic: reports valence stats + phase B flip count
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const csFlipStart = performance.now();

            // Build set of constraint edges (canonical keys)
            const constraintEdgeSet = new Set<bigint>();
            for (const [v0, v1] of outerChainEdges) {
                const lo = v0 < v1 ? v0 : v1;
                const hi = v0 < v1 ? v1 : v0;
                constraintEdgeSet.add(BigInt(lo) * BigInt(0x100000) + BigInt(hi));
            }

            // Identify chain-strip triangles in the outer wall
            const outerIdxCount = allIdxArrays[0].length;
            const chainStripTriSet = new Set<number>(); // index offsets (t) of chain-strip tris
            for (let t = 0; t < outerIdxCount; t += 3) {
                const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                if (a === b || b === c || a === c) continue; // degenerate
                if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
                    chainStripTriSet.add(t);
                }
            }

            // v16.28c: Build vertexâ†’T lookup for row-span checking.
            // Each vertex's T-coordinate tells us which row band it lives in.
            // Grid vertex v has T at combinedVerts[v*3+1].
            // Chain vertex v (>= outerGridVertexCount) also has T there.
            // We use this to prevent flips that would span multiple row bands.
            const vtxT = (v: number): number => combinedVerts[v * 3 + 1];

            // Build edgeâ†’triangle adjacency for chain-strip triangles ONLY.
            // We do NOT include boundary triangles â€” flipping at the boundary
            // between chain-strip and standard grid quads creates inconsistencies
            // because the grid quad side is managed by flipEdges3D via quadMap.
            const edgeToTris = new Map<bigint, number[]>();
            const edgeKey = (a: number, b: number): bigint => {
                const lo = a < b ? a : b;
                const hi = a < b ? b : a;
                return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
            };

            for (const t of chainStripTriSet) {
                const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                const eAB = edgeKey(a, b), eBC = edgeKey(b, c), eCA = edgeKey(c, a);
                if (!edgeToTris.has(eAB)) edgeToTris.set(eAB, []);
                edgeToTris.get(eAB)!.push(t);
                if (!edgeToTris.has(eBC)) edgeToTris.set(eBC, []);
                edgeToTris.get(eBC)!.push(t);
                if (!edgeToTris.has(eCA)) edgeToTris.set(eCA, []);
                edgeToTris.get(eCA)!.push(t);
            }

            // 3D helpers
            const pos3 = (v: number): [number, number, number] => [
                resultData[v * 3], resultData[v * 3 + 1], resultData[v * 3 + 2]
            ];
            const cross3 = (ax: number, ay: number, az: number,
                bx: number, by: number, bz: number): [number, number, number] => [
                    ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx
                ];
            const dot3 = (a: [number, number, number], b: [number, number, number]): number =>
                a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
            const len3 = (a: [number, number, number]): number =>
                Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
            const dist3sq = (p: [number, number, number], q: [number, number, number]): number =>
                (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
            const triNormal = (p0: [number, number, number], p1: [number, number, number], p2: [number, number, number]): [number, number, number] =>
                cross3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2],
                    p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);

            // Min-angle of a 3D triangle given vertex indices
            const minAngle3D = (i0: number, i1: number, i2: number): number => {
                const p0 = pos3(i0), p1 = pos3(i1), p2 = pos3(i2);
                const e01 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]] as [number, number, number];
                const e02 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]] as [number, number, number];
                const e12 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]] as [number, number, number];
                const d01 = len3(e01), d02 = len3(e02), d12 = len3(e12);
                if (d01 < 1e-12 || d02 < 1e-12 || d12 < 1e-12) return 0;
                const cos0 = dot3(e01, e02) / (d01 * d02);
                const ne01: [number, number, number] = [-e01[0], -e01[1], -e01[2]];
                const cos1 = dot3(ne01, e12) / (d01 * d12);
                const ne02: [number, number, number] = [-e02[0], -e02[1], -e02[2]];
                const cos2 = dot3(e12, ne02) / (d12 * d02);
                return Math.min(
                    Math.acos(Math.max(-1, Math.min(1, cos0))),
                    Math.acos(Math.max(-1, Math.min(1, cos1))),
                    Math.acos(Math.max(-1, Math.min(1, cos2)))
                );
            };

            // Aspect ratio of a 3D triangle: longest edge / shortest altitude.
            // Returns ratio >= 1. High values = elongated slivers.
            const triAspect3D = (i0: number, i1: number, i2: number): number => {
                const p0 = pos3(i0), p1 = pos3(i1), p2 = pos3(i2);
                const a2 = dist3sq(p1, p2), b2 = dist3sq(p0, p2), c2 = dist3sq(p0, p1);
                const longest2 = Math.max(a2, b2, c2);
                const longest = Math.sqrt(longest2);
                // Area via cross product
                const n = triNormal(p0, p1, p2);
                const area2 = len3(n); // 2Ã— area
                if (area2 < 1e-15) return 1e6; // degenerate
                // shortest altitude = 2*area / longest edge
                const shortAlt = area2 / longest;
                return longest / Math.max(shortAlt, 1e-15);
            };

            // Convexity check in 3D: the quadrilateral (A, B, C, D) must be convex.
            // Check by verifying all 4 cross products at corners point the same way.
            const isConvexQuad3D = (vA: number, vB: number, vC: number, vD: number): boolean => {
                // Quad vertices in order: A, B, C, D (forming a ring)
                const pA = pos3(vA), pB = pos3(vB), pC = pos3(vC), pD = pos3(vD);
                const n0 = cross3(pB[0] - pA[0], pB[1] - pA[1], pB[2] - pA[2], pD[0] - pA[0], pD[1] - pA[1], pD[2] - pA[2]);
                const n1 = cross3(pC[0] - pB[0], pC[1] - pB[1], pC[2] - pB[2], pA[0] - pB[0], pA[1] - pB[1], pA[2] - pB[2]);
                const n2 = cross3(pD[0] - pC[0], pD[1] - pC[1], pD[2] - pC[2], pB[0] - pC[0], pB[1] - pC[1], pB[2] - pC[2]);
                const n3 = cross3(pA[0] - pD[0], pA[1] - pD[1], pA[2] - pD[2], pC[0] - pD[0], pC[1] - pD[1], pC[2] - pD[2]);
                // All cross products should point the same direction
                const d01 = dot3(n0, n1), d02 = dot3(n0, n2), d03 = dot3(n0, n3);
                return d01 > 0 && d02 > 0 && d03 > 0;
            };

            // v16.28e: Row-span guard uses "no-worse" policy instead of absolute limit.
            // We still pre-compute max row span as a last-resort absolute cap (3Ã—).
            const rowTSpans: number[] = [];
            for (let j = 0; j < finalT.length - 1; j++) {
                rowTSpans.push(finalT[j + 1] - finalT[j]);
            }
            const maxSingleRowTSpan = Math.max(...rowTSpans);

            // v16.28f: Build vertex valence map for chain-strip vertices.
            // Valence = number of distinct edges incident on a vertex within the
            // chain-strip region. Ideal valence for interior surface vertices is 6.
            // Vertices with valence < 5 create "pinch points"; valence > 7 creates
            // "star points" â€” both cause triangle flow irregularity.
            const csValence = new Map<number, number>();
            const addValenceEdge = (a: number, b: number) => {
                // We track valence per-vertex as the number of unique neighbors
                // Since we're iterating all edges, each neighbor is counted once
                csValence.set(a, (csValence.get(a) || 0) + 1);
                csValence.set(b, (csValence.get(b) || 0) + 1);
            };
            // Count valence from all chain-strip triangle edges (unique edges only)
            const countedEdges = new Set<bigint>();
            for (const t of chainStripTriSet) {
                const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                const eAB = edgeKey(a, b), eBC = edgeKey(b, c), eCA = edgeKey(c, a);
                if (!countedEdges.has(eAB)) { countedEdges.add(eAB); addValenceEdge(a, b); }
                if (!countedEdges.has(eBC)) { countedEdges.add(eBC); addValenceEdge(b, c); }
                if (!countedEdges.has(eCA)) { countedEdges.add(eCA); addValenceEdge(c, a); }
            }

            // Valence deviation from ideal (6). Lower is better.
            const valenceDeviation = (v: number): number => Math.abs((csValence.get(v) || 6) - 6);

            // Compute total valence cost for the 4 vertices of a quad.
            // A flip changes the valence of all 4 vertices:
            //   shared edge endpoints (shLo, shHi): lose 1 edge each
            //   opposite vertices (opp0, opp1): gain 1 edge each
            const valenceCost4 = (shLo: number, shHi: number, opp0: number, opp1: number): number =>
                valenceDeviation(shLo) + valenceDeviation(shHi) + valenceDeviation(opp0) + valenceDeviation(opp1);

            const valenceCostAfterFlip = (shLo: number, shHi: number, opp0: number, opp1: number): number => {
                // After flip: shLo and shHi lose one neighbor, opp0 and opp1 gain one
                const vShLo = (csValence.get(shLo) || 6) - 1;
                const vShHi = (csValence.get(shHi) || 6) - 1;
                const vOpp0 = (csValence.get(opp0) || 6) + 1;
                const vOpp1 = (csValence.get(opp1) || 6) + 1;
                return Math.abs(vShLo - 6) + Math.abs(vShHi - 6) + Math.abs(vOpp0 - 6) + Math.abs(vOpp1 - 6);
            };

            // Helper: update valence after a flip is applied
            const applyValenceFlip = (shLo: number, shHi: number, opp0: number, opp1: number) => {
                csValence.set(shLo, (csValence.get(shLo) || 6) - 1);
                csValence.set(shHi, (csValence.get(shHi) || 6) - 1);
                csValence.set(opp0, (csValence.get(opp0) || 6) + 1);
                csValence.set(opp1, (csValence.get(opp1) || 6) + 1);
            };

            // Log valence stats before flipping
            {
                let lo = 0, hi = 0, ideal = 0;
                for (const [, v] of csValence) {
                    if (v < 5) lo++;
                    else if (v > 7) hi++;
                    else if (v === 6) ideal++;
                }
                console.log(`[ParametricExport]     valence before: ${csValence.size} verts, ${lo} low(<5), ${ideal} ideal(6), ${hi} high(>7)`);
            }

            // Iterative edge flip â€” Phase A: angle-based with valence bonus
            let totalCSFlips = 0;
            let csRowSpanRejects = 0, csEdgeLenRejects = 0, csAspectRejects = 0;
            let csValenceBonus = 0; // flips enabled by valence bonus
            const MIN_ANGLE_IMPROVEMENT = 0.005; // ~0.29Â° â€” allow subtle improvements
            const MIN_ANGLE_VALENCE_BONUS = 0.0005; // ~0.03Â° â€” nearly free if valence improves
            const MIN_ANGLE_FLOOR = 0.04; // ~2.3Â° â€” never create triangles worse than this
            const MAX_CS_PASSES = 8;
            for (let pass = 0; pass < MAX_CS_PASSES; pass++) {
                let passFlips = 0;

                // Snapshot edge keys to iterate (since we modify the map)
                const edgeKeys = Array.from(edgeToTris.keys());

                for (const ek of edgeKeys) {
                    const tris = edgeToTris.get(ek);
                    if (!tris || tris.length !== 2) continue; // boundary or non-manifold
                    if (constraintEdgeSet.has(ek)) continue; // never flip constraints

                    const t0 = tris[0], t1 = tris[1];
                    const a0 = combinedIdxs[t0], b0 = combinedIdxs[t0 + 1], c0 = combinedIdxs[t0 + 2];
                    const a1 = combinedIdxs[t1], b1 = combinedIdxs[t1 + 1], c1 = combinedIdxs[t1 + 2];

                    // Decode shared edge: ek = lo * 0x100000 + hi
                    const shLo = Number(ek / BigInt(0x100000));
                    const shHi = Number(ek % BigInt(0x100000));

                    // Verify the shared edge actually appears in both triangles
                    const set0 = new Set([a0, b0, c0]);
                    const set1 = new Set([a1, b1, c1]);
                    if (!set0.has(shLo) || !set0.has(shHi) || !set1.has(shLo) || !set1.has(shHi)) continue;

                    // Find opposite vertices
                    let opp0 = -1, opp1 = -1;
                    for (const v of [a0, b0, c0]) { if (v !== shLo && v !== shHi) { opp0 = v; break; } }
                    for (const v of [a1, b1, c1]) { if (v !== shLo && v !== shHi) { opp1 = v; break; } }
                    if (opp0 < 0 || opp1 < 0 || opp0 === opp1) continue;

                    // Don't create a constraint edge
                    if (constraintEdgeSet.has(edgeKey(opp0, opp1))) continue;

                    // Convexity check: the quad must be convex to flip safely
                    // Quad order: shLo â†’ opp0 â†’ shHi â†’ opp1 (ring around the quad)
                    if (!isConvexQuad3D(shLo, opp0, shHi, opp1)) continue;

                    // v16.31: Per-triangle row-span guard.
                    // Each new triangle must fit within a single row band.
                    // Use "no-worse" policy: the flipped pair can span up to
                    // the original pair's T-extent + 10% tolerance, but never
                    // exceed 2Ã— a single row band (prevents multi-row creep).
                    {
                        const t_shLo = vtxT(shLo), t_shHi = vtxT(shHi);
                        const t_opp0 = vtxT(opp0), t_opp1 = vtxT(opp1);
                        // Original pair's combined T-extent
                        const allT_arr = [t_shLo, t_shHi, t_opp0, t_opp1];
                        const origTExtent = Math.max(...allT_arr) - Math.min(...allT_arr);
                        // After flip, new tri A = (shLo, opp0, opp1), tri B = (shHi, opp1, opp0)
                        const newTriATSpan = Math.max(t_shLo, t_opp0, t_opp1) - Math.min(t_shLo, t_opp0, t_opp1);
                        const newTriBTSpan = Math.max(t_shHi, t_opp0, t_opp1) - Math.min(t_shHi, t_opp0, t_opp1);
                        const maxNewTSpan = Math.max(newTriATSpan, newTriBTSpan);
                        // "No-worse" + absolute cap at 2 row bands
                        const tSpanLimit = Math.min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.0);
                        if (maxNewTSpan > tSpanLimit) {
                            csRowSpanRejects++;
                            continue;
                        }
                    }

                    // v16.28d: Edge length guard â€” the new edge (opp0â†”opp1) must not be
                    // excessively longer than the existing perimeter edges.
                    const pShLo = pos3(shLo), pOpp0 = pos3(opp0), pShHi = pos3(shHi), pOpp1 = pos3(opp1);
                    {
                        // Perimeter edges: shLoâ†”opp0, opp0â†”shHi, shHiâ†”opp1, opp1â†”shLo
                        const maxPerim2 = Math.max(
                            dist3sq(pShLo, pOpp0), dist3sq(pOpp0, pShHi),
                            dist3sq(pShHi, pOpp1), dist3sq(pOpp1, pShLo)
                        );
                        // New edge: opp0â†”opp1
                        const newEdge2 = dist3sq(pOpp0, pOpp1);
                        // Reject if new edge is >2Ã— the longest perimeter edge
                        if (newEdge2 > maxPerim2 * 4.0) { // 2.0Â² = 4.0
                            csEdgeLenRejects++;
                            continue;
                        }
                    }

                    // Current quality
                    const curMin = Math.min(minAngle3D(a0, b0, c0), minAngle3D(a1, b1, c1));

                    // Determine winding from original normals.
                    // We check BOTH original triangle normals and require the
                    // new triangles to be consistent with their respective originals.
                    const origNormal0 = triNormal(pos3(a0), pos3(b0), pos3(c0));
                    const origNormal1 = triNormal(pos3(a1), pos3(b1), pos3(c1));

                    // Try primary winding: tri0=(shLo,opp0,opp1), tri1=(shHi,opp1,opp0)
                    const newNA = triNormal(pShLo, pOpp0, pOpp1);
                    const newNB = triNormal(pShHi, pOpp1, pOpp0);

                    // For normal consistency, check against the AVERAGE of original normals.
                    // This is more robust than checking against just one original â€” the
                    // two originals might have slightly different normals near a ridge.
                    const avgNormal: [number, number, number] = [
                        origNormal0[0] + origNormal1[0],
                        origNormal0[1] + origNormal1[1],
                        origNormal0[2] + origNormal1[2]
                    ];
                    const avgLen = len3(avgNormal);
                    if (avgLen < 1e-12) continue; // degenerate normals

                    let flipI0: number, flipI1: number, flipI2: number;
                    let flipJ0: number, flipJ1: number, flipJ2: number;

                    if (dot3(avgNormal, newNA) > 0 && dot3(avgNormal, newNB) > 0) {
                        // Primary winding works
                        flipI0 = shLo; flipI1 = opp0; flipI2 = opp1;
                        flipJ0 = shHi; flipJ1 = opp1; flipJ2 = opp0;
                    } else {
                        // Try reversed winding: tri0=(shLo,opp1,opp0), tri1=(shHi,opp0,opp1)
                        const altNA = triNormal(pShLo, pOpp1, pOpp0);
                        const altNB = triNormal(pShHi, pOpp0, pOpp1);
                        if (dot3(avgNormal, altNA) <= 0 || dot3(avgNormal, altNB) <= 0) continue;
                        flipI0 = shLo; flipI1 = opp1; flipI2 = opp0;
                        flipJ0 = shHi; flipJ1 = opp0; flipJ2 = opp1;
                    }

                    // Quality check: min angle must improve.
                    // v16.28f: If the flip also improves valence, use a much lower threshold.
                    const flipMin = Math.min(minAngle3D(flipI0, flipI1, flipI2), minAngle3D(flipJ0, flipJ1, flipJ2));
                    const curValCost = valenceCost4(shLo, shHi, opp0, opp1);
                    const newValCost = valenceCostAfterFlip(shLo, shHi, opp0, opp1);
                    const valenceImproves = newValCost < curValCost;
                    const threshold = valenceImproves ? MIN_ANGLE_VALENCE_BONUS : MIN_ANGLE_IMPROVEMENT;
                    if (flipMin <= curMin + threshold) continue;
                    // Floor check: never create very bad triangles
                    if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin) continue;
                    if (valenceImproves && flipMin > curMin + MIN_ANGLE_VALENCE_BONUS && flipMin <= curMin + MIN_ANGLE_IMPROVEMENT) {
                        csValenceBonus++;
                    }

                    // v16.28e: Aspect ratio guard â€” only reject extreme slivers.
                    // Thin triangles are acceptable along ridges; only block truly
                    // degenerate slivers (aspect > 12) that would also be worse.
                    const newAspect = Math.max(triAspect3D(flipI0, flipI1, flipI2), triAspect3D(flipJ0, flipJ1, flipJ2));
                    const curAspect = Math.max(triAspect3D(a0, b0, c0), triAspect3D(a1, b1, c1));
                    if (newAspect > 12.0 && newAspect > curAspect) {
                        csAspectRejects++;
                        continue;
                    }

                    // Apply flip
                    combinedIdxs[t0] = flipI0; combinedIdxs[t0 + 1] = flipI1; combinedIdxs[t0 + 2] = flipI2;
                    combinedIdxs[t1] = flipJ0; combinedIdxs[t1 + 1] = flipJ1; combinedIdxs[t1 + 2] = flipJ2;

                    // Update valence: shared endpoints lose 1, opposites gain 1
                    applyValenceFlip(shLo, shHi, opp0, opp1);

                    // Update adjacency: remove old edge, add new
                    const newEk = edgeKey(opp0, opp1);
                    edgeToTris.delete(ek);
                    edgeToTris.set(newEk, [t0, t1]);

                    // Update perimeter edges:
                    // Before: tri0 had edges {shLoâ†”shHi}, {shHiâ†”opp0}, {opp0â†”shLo}
                    //         tri1 had edges {shLoâ†”shHi}, {shHiâ†”opp1}, {opp1â†”shLo}
                    // After:  tri0 has edges {opp0â†”opp1}, {opp1â†”shLo}, {shLoâ†”opp0}  [shLo side]
                    //         tri1 has edges {opp0â†”opp1}, {shHiâ†”opp1}, {opp0â†”shHi}  [shHi side]
                    // Changed: {shHiâ†”opp0} moved from t0 â†’ t1
                    //          {opp1â†”shLo} moved from t1 â†’ t0
                    const ek1 = edgeKey(shHi, opp0);
                    const adj1 = edgeToTris.get(ek1);
                    if (adj1) {
                        const idx = adj1.indexOf(t0);
                        if (idx >= 0) adj1[idx] = t1;
                    }
                    const ek2 = edgeKey(opp1, shLo);
                    const adj2 = edgeToTris.get(ek2);
                    if (adj2) {
                        const idx = adj2.indexOf(t1);
                        if (idx >= 0) adj2[idx] = t0;
                    }

                    passFlips++;
                }
                totalCSFlips += passFlips;
                if (passFlips === 0) break;
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // Phase B: Valence-only flips
            //
            // After Phase A has exhausted angle-based improvements, some edges
            // still have vertices with bad valence (3-4 or 8+). These create
            // "pinch points" or "star patterns" where triangle flow converges
            // or diverges irregularly.
            //
            // Phase B flips edges that improve the total valence deviation of
            // their 4 vertices, subject to the same safety guards PLUS:
            //   - The flip must not DECREASE min-angle below the floor (0.04 rad)
            //   - The flip must strictly improve total valence cost
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            let phaseB_flips = 0;
            const MAX_VALENCE_PASSES = 4;
            for (let pass = 0; pass < MAX_VALENCE_PASSES; pass++) {
                let passFlips = 0;
                const edgeKeys2 = Array.from(edgeToTris.keys());

                for (const ek of edgeKeys2) {
                    const tris = edgeToTris.get(ek);
                    if (!tris || tris.length !== 2) continue;
                    if (constraintEdgeSet.has(ek)) continue;

                    const t0 = tris[0], t1 = tris[1];
                    const a0 = combinedIdxs[t0], b0 = combinedIdxs[t0 + 1], c0 = combinedIdxs[t0 + 2];
                    const a1 = combinedIdxs[t1], b1 = combinedIdxs[t1 + 1], c1 = combinedIdxs[t1 + 2];

                    const shLo = Number(ek / BigInt(0x100000));
                    const shHi = Number(ek % BigInt(0x100000));

                    const set0 = new Set([a0, b0, c0]);
                    const set1 = new Set([a1, b1, c1]);
                    if (!set0.has(shLo) || !set0.has(shHi) || !set1.has(shLo) || !set1.has(shHi)) continue;

                    let opp0 = -1, opp1 = -1;
                    for (const v of [a0, b0, c0]) { if (v !== shLo && v !== shHi) { opp0 = v; break; } }
                    for (const v of [a1, b1, c1]) { if (v !== shLo && v !== shHi) { opp1 = v; break; } }
                    if (opp0 < 0 || opp1 < 0 || opp0 === opp1) continue;

                    // Skip if valence doesn't improve
                    const curValCost = valenceCost4(shLo, shHi, opp0, opp1);
                    const newValCost = valenceCostAfterFlip(shLo, shHi, opp0, opp1);
                    if (newValCost >= curValCost) continue;

                    if (constraintEdgeSet.has(edgeKey(opp0, opp1))) continue;
                    if (!isConvexQuad3D(shLo, opp0, shHi, opp1)) continue;

                    // Row-span guard (same no-worse policy as Phase A)
                    {
                        const t_shLo = vtxT(shLo), t_shHi = vtxT(shHi);
                        const t_opp0 = vtxT(opp0), t_opp1 = vtxT(opp1);
                        const allT_arr = [t_shLo, t_shHi, t_opp0, t_opp1];
                        const origTExtent = Math.max(...allT_arr) - Math.min(...allT_arr);
                        const newTriATSpan = Math.max(t_shLo, t_opp0, t_opp1) - Math.min(t_shLo, t_opp0, t_opp1);
                        const newTriBTSpan = Math.max(t_shHi, t_opp0, t_opp1) - Math.min(t_shHi, t_opp0, t_opp1);
                        const maxNewTSpan = Math.max(newTriATSpan, newTriBTSpan);
                        const tSpanLimit = Math.min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.0);
                        if (maxNewTSpan > tSpanLimit) continue;
                    }

                    // Edge length guard
                    const pShLo = pos3(shLo), pOpp0 = pos3(opp0), pShHi = pos3(shHi), pOpp1 = pos3(opp1);
                    {
                        const maxPerim2 = Math.max(
                            dist3sq(pShLo, pOpp0), dist3sq(pOpp0, pShHi),
                            dist3sq(pShHi, pOpp1), dist3sq(pOpp1, pShLo)
                        );
                        const newEdge2 = dist3sq(pOpp0, pOpp1);
                        if (newEdge2 > maxPerim2 * 4.0) continue;
                    }

                    // Normal consistency
                    const origNormal0 = triNormal(pos3(a0), pos3(b0), pos3(c0));
                    const origNormal1 = triNormal(pos3(a1), pos3(b1), pos3(c1));
                    const avgNormal: [number, number, number] = [
                        origNormal0[0] + origNormal1[0],
                        origNormal0[1] + origNormal1[1],
                        origNormal0[2] + origNormal1[2]
                    ];
                    if (len3(avgNormal) < 1e-12) continue;

                    let flipI0: number, flipI1: number, flipI2: number;
                    let flipJ0: number, flipJ1: number, flipJ2: number;

                    const newNA = triNormal(pShLo, pOpp0, pOpp1);
                    const newNB = triNormal(pShHi, pOpp1, pOpp0);
                    if (dot3(avgNormal, newNA) > 0 && dot3(avgNormal, newNB) > 0) {
                        flipI0 = shLo; flipI1 = opp0; flipI2 = opp1;
                        flipJ0 = shHi; flipJ1 = opp1; flipJ2 = opp0;
                    } else {
                        const altNA = triNormal(pShLo, pOpp1, pOpp0);
                        const altNB = triNormal(pShHi, pOpp0, pOpp1);
                        if (dot3(avgNormal, altNA) <= 0 || dot3(avgNormal, altNB) <= 0) continue;
                        flipI0 = shLo; flipI1 = opp1; flipI2 = opp0;
                        flipJ0 = shHi; flipJ1 = opp0; flipJ2 = opp1;
                    }

                    // Angle floor: flipped result must not have terrible min-angle
                    const curMin = Math.min(minAngle3D(a0, b0, c0), minAngle3D(a1, b1, c1));
                    const flipMin = Math.min(minAngle3D(flipI0, flipI1, flipI2), minAngle3D(flipJ0, flipJ1, flipJ2));
                    if (flipMin < MIN_ANGLE_FLOOR && flipMin < curMin) continue;
                    // Don't allow angle to degrade more than 0.01 rad (~0.57Â°) even for valence
                    if (flipMin < curMin - 0.01) continue;

                    // Aspect ratio guard
                    const newAspect = Math.max(triAspect3D(flipI0, flipI1, flipI2), triAspect3D(flipJ0, flipJ1, flipJ2));
                    const curAspect = Math.max(triAspect3D(a0, b0, c0), triAspect3D(a1, b1, c1));
                    if (newAspect > 12.0 && newAspect > curAspect) continue;

                    // Apply flip
                    combinedIdxs[t0] = flipI0; combinedIdxs[t0 + 1] = flipI1; combinedIdxs[t0 + 2] = flipI2;
                    combinedIdxs[t1] = flipJ0; combinedIdxs[t1 + 1] = flipJ1; combinedIdxs[t1 + 2] = flipJ2;
                    applyValenceFlip(shLo, shHi, opp0, opp1);

                    // Update adjacency
                    const newEk = edgeKey(opp0, opp1);
                    edgeToTris.delete(ek);
                    edgeToTris.set(newEk, [t0, t1]);
                    const ek1 = edgeKey(shHi, opp0);
                    const adj1 = edgeToTris.get(ek1);
                    if (adj1) { const idx = adj1.indexOf(t0); if (idx >= 0) adj1[idx] = t1; }
                    const ek2 = edgeKey(opp1, shLo);
                    const adj2 = edgeToTris.get(ek2);
                    if (adj2) { const idx = adj2.indexOf(t1); if (idx >= 0) adj2[idx] = t0; }

                    passFlips++;
                }
                phaseB_flips += passFlips;
                if (passFlips === 0) break;
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // Phase C: Short-diagonal flips (Delaunay tie-breaker)
            //
            // On gentle features, both diagonal orientations produce nearly
            // identical min-angles, so Phase A's 0.005 rad threshold blocks
            // the flip. But the sweep's consistent `<=` tie-break creates
            // a visible \\\\ bias in the diagonal pattern.
            //
            // Phase C uses the Delaunay criterion: when the angle difference
            // is negligible (< MIN_ANGLE_IMPROVEMENT), flip to the SHORTER
            // diagonal. The shorter diagonal produces more equilateral
            // triangles, which is the optimal choice for near-planar quads.
            //
            // Safety: same guards as Phase A (row-span, edge-length, normal
            // consistency, convexity), plus the angle must not degrade beyond
            // a small tolerance (0.002 rad â‰ˆ 0.11Â°).
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            let phaseC_flips = 0;
            {
                const ANGLE_DEGRADE_TOLERANCE = 0.002; // Allow up to 0.11Â° angle loss for shorter diagonal
                const edgeKeys3 = Array.from(edgeToTris.keys());

                for (const ek of edgeKeys3) {
                    const tris = edgeToTris.get(ek);
                    if (!tris || tris.length !== 2) continue;
                    if (constraintEdgeSet.has(ek)) continue;

                    const t0 = tris[0], t1 = tris[1];
                    const a0 = combinedIdxs[t0], b0 = combinedIdxs[t0 + 1], c0 = combinedIdxs[t0 + 2];
                    const a1 = combinedIdxs[t1], b1 = combinedIdxs[t1 + 1], c1 = combinedIdxs[t1 + 2];

                    const shLo = Number(ek / BigInt(0x100000));
                    const shHi = Number(ek % BigInt(0x100000));

                    const set0 = new Set([a0, b0, c0]);
                    const set1 = new Set([a1, b1, c1]);
                    if (!set0.has(shLo) || !set0.has(shHi) || !set1.has(shLo) || !set1.has(shHi)) continue;

                    let opp0 = -1, opp1 = -1;
                    for (const v of [a0, b0, c0]) { if (v !== shLo && v !== shHi) { opp0 = v; break; } }
                    for (const v of [a1, b1, c1]) { if (v !== shLo && v !== shHi) { opp1 = v; break; } }
                    if (opp0 < 0 || opp1 < 0 || opp0 === opp1) continue;

                    // Don't create a constraint edge
                    if (constraintEdgeSet.has(edgeKey(opp0, opp1))) continue;

                    // Check if the alternative diagonal is actually shorter
                    const pShLo = pos3(shLo), pOpp0 = pos3(opp0), pShHi = pos3(shHi), pOpp1 = pos3(opp1);
                    const curDiag2 = dist3sq(pShLo, pShHi);
                    const altDiag2 = dist3sq(pOpp0, pOpp1);
                    // Only flip if alternative diagonal is at least 5% shorter
                    // (avoid churn on nearly-equal diagonals)
                    if (altDiag2 >= curDiag2 * 0.9025) continue; // 0.95Â² = 0.9025

                    if (!isConvexQuad3D(shLo, opp0, shHi, opp1)) continue;

                    // Row-span guard (same as Phase A)
                    {
                        const t_shLo = vtxT(shLo), t_shHi = vtxT(shHi);
                        const t_opp0 = vtxT(opp0), t_opp1 = vtxT(opp1);
                        const allT_arr = [t_shLo, t_shHi, t_opp0, t_opp1];
                        const origTExtent = Math.max(...allT_arr) - Math.min(...allT_arr);
                        const newTriATSpan = Math.max(t_shLo, t_opp0, t_opp1) - Math.min(t_shLo, t_opp0, t_opp1);
                        const newTriBTSpan = Math.max(t_shHi, t_opp0, t_opp1) - Math.min(t_shHi, t_opp0, t_opp1);
                        const maxNewTSpan = Math.max(newTriATSpan, newTriBTSpan);
                        const tSpanLimit = Math.min(origTExtent * 1.1 + maxSingleRowTSpan * 0.1, maxSingleRowTSpan * 2.0);
                        if (maxNewTSpan > tSpanLimit) continue;
                    }

                    // Edge length guard
                    {
                        const maxPerim2 = Math.max(
                            dist3sq(pShLo, pOpp0), dist3sq(pOpp0, pShHi),
                            dist3sq(pShHi, pOpp1), dist3sq(pOpp1, pShLo)
                        );
                        if (altDiag2 > maxPerim2 * 4.0) continue;
                    }

                    // Angle quality: the flip must not degrade min-angle too much
                    const curMin = Math.min(minAngle3D(a0, b0, c0), minAngle3D(a1, b1, c1));

                    // Normal consistency
                    const origNormal0 = triNormal(pos3(a0), pos3(b0), pos3(c0));
                    const origNormal1 = triNormal(pos3(a1), pos3(b1), pos3(c1));
                    const avgNormal: [number, number, number] = [
                        origNormal0[0] + origNormal1[0],
                        origNormal0[1] + origNormal1[1],
                        origNormal0[2] + origNormal1[2]
                    ];
                    if (len3(avgNormal) < 1e-12) continue;

                    let flipI0: number, flipI1: number, flipI2: number;
                    let flipJ0: number, flipJ1: number, flipJ2: number;

                    const newNA = triNormal(pShLo, pOpp0, pOpp1);
                    const newNB = triNormal(pShHi, pOpp1, pOpp0);
                    if (dot3(avgNormal, newNA) > 0 && dot3(avgNormal, newNB) > 0) {
                        flipI0 = shLo; flipI1 = opp0; flipI2 = opp1;
                        flipJ0 = shHi; flipJ1 = opp1; flipJ2 = opp0;
                    } else {
                        const altNA = triNormal(pShLo, pOpp1, pOpp0);
                        const altNB = triNormal(pShHi, pOpp0, pOpp1);
                        if (dot3(avgNormal, altNA) <= 0 || dot3(avgNormal, altNB) <= 0) continue;
                        flipI0 = shLo; flipI1 = opp1; flipI2 = opp0;
                        flipJ0 = shHi; flipJ1 = opp0; flipJ2 = opp1;
                    }

                    const flipMin = Math.min(minAngle3D(flipI0, flipI1, flipI2), minAngle3D(flipJ0, flipJ1, flipJ2));
                    // Allow small angle degradation for shorter diagonal
                    if (flipMin < curMin - ANGLE_DEGRADE_TOLERANCE) continue;
                    // Never create very bad triangles
                    if (flipMin < MIN_ANGLE_FLOOR) continue;

                    // Aspect ratio guard
                    const newAspect = Math.max(triAspect3D(flipI0, flipI1, flipI2), triAspect3D(flipJ0, flipJ1, flipJ2));
                    if (newAspect > 12.0) continue;

                    // Apply flip
                    combinedIdxs[t0] = flipI0; combinedIdxs[t0 + 1] = flipI1; combinedIdxs[t0 + 2] = flipI2;
                    combinedIdxs[t1] = flipJ0; combinedIdxs[t1 + 1] = flipJ1; combinedIdxs[t1 + 2] = flipJ2;
                    applyValenceFlip(shLo, shHi, opp0, opp1);

                    const newEk = edgeKey(opp0, opp1);
                    edgeToTris.delete(ek);
                    edgeToTris.set(newEk, [t0, t1]);

                    // Update perimeter adjacency
                    for (const perimEk of [edgeKey(shHi, opp0), edgeKey(opp1, shLo)]) {
                        const perimTris = edgeToTris.get(perimEk);
                        if (perimTris) {
                            const idx0 = perimTris.indexOf(t0);
                            const idx1 = perimTris.indexOf(t1);
                            if (idx0 >= 0) perimTris[idx0] = t1;
                            if (idx1 >= 0) perimTris[idx1] = t0;
                        }
                    }

                    phaseC_flips++;
                }
            }

            const csFlipMs = performance.now() - csFlipStart;
            console.log(`[ParametricExport]   v16.31 chain-strip 3D edge flip: ${totalCSFlips}+${phaseB_flips}+${phaseC_flips} flips (angle+valence+shortDiag) on ${chainStripTriSet.size} chain-strip tris (${csFlipMs.toFixed(1)}ms)`);
            console.log(`[ParametricExport]     rejects: rowSpan=${csRowSpanRejects}, edgeLen=${csEdgeLenRejects}, aspect=${csAspectRejects}, valenceBonus=${csValenceBonus}`);
            // Log valence stats after flipping
            {
                let lo = 0, hi = 0, ideal = 0;
                for (const [, v] of csValence) {
                    if (v < 5) lo++;
                    else if (v > 7) hi++;
                    else if (v === 6) ideal++;
                }
                console.log(`[ParametricExport]     valence after:  ${csValence.size} verts, ${lo} low(<5), ${ideal} ideal(6), ${hi} high(>7)`);
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // v16.34: Boundary diagonal optimization
            //
            // Standard cells adjacent to chain strips have their diagonal
            // chosen by chainDirectedFlip (UV-based chain direction) and
            // potentially locked against flipEdges3D. But this UV-based
            // choice doesn't consider the 3D geometry at the boundary.
            //
            // This pass examines each standard cell bordering a chain strip,
            // tries both diagonal options (AD and BC), and picks the one that
            // minimizes the dihedral angle at the boundary edge with the
            // adjacent chain-strip triangle.
            //
            // Unlike the failed v16.33 boundary reconciliation (which flipped
            // boundary EDGES across cell boundaries), this pass only changes
            // the INTERNAL DIAGONAL of standard cells â€” a safe operation that
            // rearranges two triangles within one cell.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            {
                const bndDiagStart = performance.now();
                const cellsPerRow = outerW - 1;

                // Build edgeâ†’tri adjacency for all outer wall tris
                const bdEdge2Tri = new Map<bigint, number[]>();
                const bdEK = (a: number, b: number): bigint => {
                    const lo = a < b ? a : b;
                    const hi = a < b ? b : a;
                    return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
                };
                for (let t = 0; t < outerIdxCount; t += 3) {
                    const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                    if (a === b || b === c || a === c) continue;
                    for (const ek of [bdEK(a, b), bdEK(b, c), bdEK(c, a)]) {
                        let arr = bdEdge2Tri.get(ek);
                        if (!arr) { arr = []; bdEdge2Tri.set(ek, arr); }
                        arr.push(t);
                    }
                }

                // 3D normal of a triangle (unnormalized)
                const bdNorm = (v0: number, v1: number, v2: number): [number, number, number] => {
                    const ax = resultData[v1 * 3] - resultData[v0 * 3];
                    const ay = resultData[v1 * 3 + 1] - resultData[v0 * 3 + 1];
                    const az = resultData[v1 * 3 + 2] - resultData[v0 * 3 + 2];
                    const bx = resultData[v2 * 3] - resultData[v0 * 3];
                    const by = resultData[v2 * 3 + 1] - resultData[v0 * 3 + 1];
                    const bz = resultData[v2 * 3 + 2] - resultData[v0 * 3 + 2];
                    return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
                };
                const bdDotN = (a: [number, number, number], b: [number, number, number]): number => {
                    const la = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
                    const lb = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
                    if (la < 1e-12 || lb < 1e-12) return 1; // degenerate â†’ treat as smooth
                    return (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
                };

                let bdFlips = 0;
                let bdChecked = 0;

                for (let j = 0; j < outerH - 1; j++) {
                    for (let col = 0; col < cellsPerRow; col++) {
                        const qIdx = j * cellsPerRow + col;
                        const triBase = outerQuadMap![qIdx];
                        if (triBase < 0) continue; // chain-strip cell, skip

                        // Cell vertices
                        const vBL = j * outerW + col;
                        const vBR = j * outerW + col + 1;
                        const vTL = (j + 1) * outerW + col;
                        const vTR = (j + 1) * outerW + col + 1;

                        // Check boundary edges: right edge (vBRâ†’vTR) and left edge (vBLâ†’vTL)
                        // A boundary edge is one shared with a chain-strip tri
                        const checkEdge = (v0: number, v1: number): number => {
                            // Returns the chain-strip tri offset, or -1 if not a boundary edge
                            const ek = bdEK(v0, v1);
                            const tris = bdEdge2Tri.get(ek);
                            if (!tris || tris.length !== 2) return -1;
                            for (const t of tris) {
                                const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                                if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
                                    return t; // this is a chain-strip tri
                                }
                            }
                            return -1;
                        };

                        const csTriRight = checkEdge(vBR, vTR);
                        const csTriLeft = checkEdge(vBL, vTL);
                        if (csTriRight < 0 && csTriLeft < 0) continue; // no boundary

                        bdChecked++;

                        // Compute boundary dihedral for BOTH diagonal options
                        // AD diagonal: tri0 = (vBL, vBR, vTR), tri1 = (vBL, vTR, vTL)
                        //   - Right boundary (vBRâ†’vTR) is in tri0, normal from (vBL, vBR, vTR)
                        //   - Left boundary (vBLâ†’vTL) is in tri1, normal from (vBL, vTR, vTL)
                        // BC diagonal: tri0 = (vBL, vBR, vTL), tri1 = (vBR, vTR, vTL)
                        //   - Right boundary (vBRâ†’vTR) is in tri1, normal from (vBR, vTR, vTL)
                        //   - Left boundary (vBLâ†’vTL) is in tri0, normal from (vBL, vBR, vTL)

                        let adScore = 0; // sum of dihedral dots (higher = smoother)
                        let bcScore = 0;
                        let edgeCount = 0;

                        if (csTriRight >= 0) {
                            const ca = combinedIdxs[csTriRight], cb = combinedIdxs[csTriRight + 1], cc = combinedIdxs[csTriRight + 2];
                            const csNorm = bdNorm(ca, cb, cc);
                            // AD: boundary tri = (vBL, vBR, vTR)
                            adScore += bdDotN(bdNorm(vBL, vBR, vTR), csNorm);
                            // BC: boundary tri = (vBR, vTR, vTL)
                            bcScore += bdDotN(bdNorm(vBR, vTR, vTL), csNorm);
                            edgeCount++;
                        }
                        if (csTriLeft >= 0) {
                            const ca = combinedIdxs[csTriLeft], cb = combinedIdxs[csTriLeft + 1], cc = combinedIdxs[csTriLeft + 2];
                            const csNorm = bdNorm(ca, cb, cc);
                            // AD: boundary tri = (vBL, vTR, vTL)
                            adScore += bdDotN(bdNorm(vBL, vTR, vTL), csNorm);
                            // BC: boundary tri = (vBL, vBR, vTL)
                            bcScore += bdDotN(bdNorm(vBL, vBR, vTL), csNorm);
                            edgeCount++;
                        }

                        if (edgeCount === 0) continue;

                        // Determine current diagonal from index buffer
                        const curI0 = combinedIdxs[triBase], curI1 = combinedIdxs[triBase + 1], curI2 = combinedIdxs[triBase + 2];
                        const curIsAD = (curI0 === vTR || curI1 === vTR || curI2 === vTR);
                        const curScore = curIsAD ? adScore : bcScore;
                        const altScore = curIsAD ? bcScore : adScore;

                        // Only flip if alternative is meaningfully better
                        if (altScore <= curScore + 0.001) continue;

                        // Apply the flip (override chainDirectedFlip's choice)
                        if (curIsAD) {
                            // Currently AD, switch to BC
                            combinedIdxs[triBase + 0] = vBL;
                            combinedIdxs[triBase + 1] = vBR;
                            combinedIdxs[triBase + 2] = vTL;
                            combinedIdxs[triBase + 3] = vBR;
                            combinedIdxs[triBase + 4] = vTR;
                            combinedIdxs[triBase + 5] = vTL;
                        } else {
                            // Currently BC, switch to AD
                            combinedIdxs[triBase + 0] = vBL;
                            combinedIdxs[triBase + 1] = vBR;
                            combinedIdxs[triBase + 2] = vTR;
                            combinedIdxs[triBase + 3] = vBL;
                            combinedIdxs[triBase + 4] = vTR;
                            combinedIdxs[triBase + 5] = vTL;
                        }
                        bdFlips++;
                    }
                }

                const bndDiagMs = performance.now() - bndDiagStart;
                console.log(`[ParametricExport]   v16.34 boundary diagonal optimization: ${bdFlips} cell diag flips on ${bdChecked} boundary cells (${bndDiagMs.toFixed(1)}ms)`);
            }

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // v16.29: Chain-strip midpoint subdivision
            //
            // After flipping, chain-strip triangles can still be stretched
            // because a chain vertex sits inside a grid cell, far from the
            // cell's corners. Instead of trying to fix topology, ADD more
            // vertices at the midpoints of long edges, splitting stretched
            // triangles into well-shaped smaller ones.
            //
            // For each non-constraint interior edge shared by two chain-strip
            // triangles: if the 3D edge length exceeds a threshold (based on
            // the average grid edge length), insert a midpoint vertex and
            // split both adjacent triangles.
            //
            // The midpoint's 3D position is linearly interpolated from the
            // two endpoints. At this mesh resolution (~0.5mm spacing), linear
            // interpolation on a smooth parametric surface introduces < 0.01mm
            // error â€” well below 3D printing tolerance.
            //
            // Each split turns 2 triangles into 4:
            //   Before: tri0=(A,B,C), tri1=(B,D,C)  [shared edge Bâ†”C]
            //   After:  tri0=(A,B,M), tri0b=(A,M,C), tri1=(B,D,M), tri1b=(M,D,C)
            //   where M = midpoint of Bâ†”C
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const subdivStart = performance.now();

            // Compute average grid edge length (from first few hundred grid edges)
            // to set the subdivision threshold.
            let gridEdgeLenSum = 0;
            let gridEdgeCount = 0;
            {
                const sampleRows = Math.min(10, outerH - 1);
                for (let j = 0; j < sampleRows; j++) {
                    for (let i = 0; i < outerW - 1 && i < 50; i++) {
                        const v0 = j * outerW + i;
                        const v1 = j * outerW + i + 1;
                        const dx = resultData[v0 * 3] - resultData[v1 * 3];
                        const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
                        const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
                        gridEdgeLenSum += Math.sqrt(dx * dx + dy * dy + dz * dz);
                        gridEdgeCount++;
                    }
                }
            }
            const avgGridEdge = gridEdgeCount > 0 ? gridEdgeLenSum / gridEdgeCount : 1.0;
            // Subdivide edges longer than 1.8Ã— average grid edge
            const subdivThreshold2 = (avgGridEdge * 1.8) ** 2;

            // Re-identify chain-strip triangles (indices may have changed from flips)
            const csTriSetNow = new Set<number>();
            for (let t = 0; t < allIdxArrays[0].length; t += 3) {
                const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                if (a === b || b === c || a === c) continue;
                if (a >= outerGridVertexCount || b >= outerGridVertexCount || c >= outerGridVertexCount) {
                    csTriSetNow.add(t);
                }
            }

            // Build edgeâ†’triangle adjacency for chain-strip tris AND their
            // boundary neighbors. Previously, only chain-strip tris were indexed,
            // so boundary edges (shared between a chain-strip tri and a standard-
            // grid tri) had only 1 entry and were skipped by the `tris.length !== 2`
            // filter. This left the worst stretched triangles unsubdivided.
            //
            // v17.0: Also index standard-grid tris that share an edge with any
            // chain-strip tri. This allows boundary edges to be split.
            const subEdgeToTris = new Map<bigint, number[]>();
            const subEdgeKey = (a: number, b: number): bigint => {
                const lo = a < b ? a : b;
                const hi = a < b ? b : a;
                return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
            };

            // First pass: index chain-strip tris
            const csEdgeSet = new Set<bigint>();
            for (const t of csTriSetNow) {
                const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                for (const ek of [subEdgeKey(a, b), subEdgeKey(b, c), subEdgeKey(c, a)]) {
                    if (!subEdgeToTris.has(ek)) subEdgeToTris.set(ek, []);
                    subEdgeToTris.get(ek)!.push(t);
                    csEdgeSet.add(ek);
                }
            }

            // Second pass: index standard-grid tris that share edges with chain-strip tris
            let boundaryTrisAdded = 0;
            for (let t = 0; t < outerIdxCount; t += 3) {
                if (csTriSetNow.has(t)) continue; // already indexed
                const a = combinedIdxs[t], b = combinedIdxs[t + 1], c = combinedIdxs[t + 2];
                if (a === b || b === c || a === c) continue;
                // Check if any edge is shared with a chain-strip tri
                let isBoundary = false;
                for (const ek of [subEdgeKey(a, b), subEdgeKey(b, c), subEdgeKey(c, a)]) {
                    if (csEdgeSet.has(ek)) { isBoundary = true; break; }
                }
                if (isBoundary) {
                    for (const ek of [subEdgeKey(a, b), subEdgeKey(b, c), subEdgeKey(c, a)]) {
                        if (!subEdgeToTris.has(ek)) subEdgeToTris.set(ek, []);
                        subEdgeToTris.get(ek)!.push(t);
                    }
                    boundaryTrisAdded++;
                }
            }

            // Collect edges to split: interior, non-constraint, long edges
            interface SplitEdge {
                ek: bigint;
                v0: number;
                v1: number;
                len2: number;
                tris: number[]; // the 2 tri offsets
            }
            const edgesToSplit: SplitEdge[] = [];
            const edgesScheduled = new Set<bigint>();

            // v17.0: Use a more aggressive threshold for boundary edges
            // (edges where one tri is chain-strip and the other is standard-grid).
            // These are the edges that create the visible "serrated ridge" artifact.
            const boundarySubdivThreshold2 = (avgGridEdge * 1.2) ** 2;

            for (const [ek, tris] of subEdgeToTris) {
                if (tris.length !== 2) continue; // true boundary (mesh edge) or non-manifold
                if (constraintEdgeSet.has(ek)) continue; // never split chain edges

                const v0 = Number(ek / BigInt(0x100000));
                const v1 = Number(ek % BigInt(0x100000));

                const dx = resultData[v0 * 3] - resultData[v1 * 3];
                const dy = resultData[v0 * 3 + 1] - resultData[v1 * 3 + 1];
                const dz = resultData[v0 * 3 + 2] - resultData[v1 * 3 + 2];
                const len2 = dx * dx + dy * dy + dz * dz;

                // Use tighter threshold for boundary edges (one chain-strip + one standard tri)
                const isBoundaryEdge = (csTriSetNow.has(tris[0]) !== csTriSetNow.has(tris[1]));
                const threshold = isBoundaryEdge ? boundarySubdivThreshold2 : subdivThreshold2;

                if (len2 > threshold) {
                    edgesToSplit.push({ ek, v0, v1, len2, tris: [tris[0], tris[1]] });
                    edgesScheduled.add(ek);
                }
            }

            // Sort by length descending â€” split longest edges first
            edgesToSplit.sort((a, b) => b.len2 - a.len2);

            // Apply splits. We need to grow the vertex and index arrays.
            // Strategy: collect all new vertices and new triangles, then
            // rebuild the arrays at the end.
            //
            // For each split edge (shared by tri0 and tri1):
            //   tri0 has vertices containing v0 and v1 plus opp0
            //   tri1 has vertices containing v0 and v1 plus opp1
            //   Insert M = midpoint(v0, v1)
            //   Replace: tri0 â†’ (opp0, v0, M), new tri â†’ (opp0, M, v1)
            //            tri1 â†’ (opp1, v1, M), new tri â†’ (opp1, M, v0)

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // v18.0: GPU-surface subdivision.
            //
            // Root cause of v17.0 oscillation: midpoints were the 3D chord
            // midpoint (average of two XYZ surface points). On a curved surface,
            // this chord lies INSIDE the surface, producing a "divot" vertex.
            // The normal at the divot points inward; adjacent triangles point
            // outward â†’ alternating inward/outward normals = slicer oscillations.
            //
            // Fix: compute midpoints in UV (parametric) space, then GPU-evaluate
            // them to get exact on-surface 3D positions. A UV midpoint evaluates
            // to a point ON the mathematical surface, not on the chord.
            //
            // Phase A: Determine which splits apply (respecting modifiedTris).
            // Phase B: Batch GPU-evaluate UV midpoints â†’ exact on-surface XYZ.
            // Phase C: Apply splits using GPU-evaluated positions.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

            // Phase A: Collect splits to apply (dry run â€” no index modifications)
            const splitsToApply: Array<{ se: SplitEdge; opp0: number; opp1: number }> = [];
            const modifiedTris = new Set<number>();
            const maxSplits = Math.floor((csTriSetNow.size + boundaryTrisAdded) * 0.5);

            for (const se of edgesToSplit) {
                if (splitsToApply.length >= maxSplits) break;
                if (modifiedTris.has(se.tris[0]) || modifiedTris.has(se.tris[1])) continue;

                const t0off = se.tris[0], t1off = se.tris[1];
                const a0 = combinedIdxs[t0off], b0 = combinedIdxs[t0off + 1], c0 = combinedIdxs[t0off + 2];
                const a1 = combinedIdxs[t1off], b1 = combinedIdxs[t1off + 1], c1 = combinedIdxs[t1off + 2];

                let opp0 = -1;
                for (const v of [a0, b0, c0]) { if (v !== se.v0 && v !== se.v1) { opp0 = v; break; } }
                let opp1 = -1;
                for (const v of [a1, b1, c1]) { if (v !== se.v0 && v !== se.v1) { opp1 = v; break; } }
                if (opp0 < 0 || opp1 < 0) continue;

                splitsToApply.push({ se, opp0, opp1 });
                modifiedTris.add(t0off);
                modifiedTris.add(t1off);
            }

            // Phase B + C: GPU-evaluate UV midpoints, then apply splits
            let finalResultData = resultData;
            let finalCombinedIdxs = combinedIdxs;

            if (splitsToApply.length > 0) {
                // Build UV batch: [u_mid, t_mid, surfaceId] per split
                const midUVBatch = new Float32Array(splitsToApply.length * 3);
                for (let i = 0; i < splitsToApply.length; i++) {
                    const { se } = splitsToApply[i];
                    // Average UV coordinates â€” evaluates to exact on-surface position
                    midUVBatch[i * 3] = (combinedVerts[se.v0 * 3] + combinedVerts[se.v1 * 3]) * 0.5;
                    midUVBatch[i * 3 + 1] = (combinedVerts[se.v0 * 3 + 1] + combinedVerts[se.v1 * 3 + 1]) * 0.5;
                    midUVBatch[i * 3 + 2] = combinedVerts[se.v0 * 3 + 2]; // surfaceId (same for both endpoints)
                }

                // GPU evaluate: UV midpoints â†’ exact 3D surface positions
                const mid3D = await this.evaluatePoints(
                    midUVBatch, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                    false, 0
                );

                // Phase C: Apply splits with GPU-evaluated on-surface midpoints
                const newVerts: number[] = [];
                const newTris: number[] = [];
                let nextNewIdx = resultData.length / 3;

                for (let i = 0; i < splitsToApply.length; i++) {
                    const { se, opp0, opp1 } = splitsToApply[i];
                    const t0off = se.tris[0], t1off = se.tris[1];

                    const midIdx = nextNewIdx++;
                    newVerts.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);

                    // Replace tri0: (opp0, v0, M)
                    combinedIdxs[t0off] = opp0;
                    combinedIdxs[t0off + 1] = se.v0;
                    combinedIdxs[t0off + 2] = midIdx;
                    // New tri: (opp0, M, v1)
                    newTris.push(opp0, midIdx, se.v1);

                    // Replace tri1: (opp1, v1, M)
                    combinedIdxs[t1off] = opp1;
                    combinedIdxs[t1off + 1] = se.v1;
                    combinedIdxs[t1off + 2] = midIdx;
                    // New tri: (opp1, M, v0)
                    newTris.push(opp1, midIdx, se.v0);
                }

                // Grow vertex array
                const newResultData = new Float32Array(resultData.length + newVerts.length);
                newResultData.set(resultData);
                for (let i = 0; i < newVerts.length; i++) {
                    newResultData[resultData.length + i] = newVerts[i];
                }
                finalResultData = newResultData;

                // Grow index array
                const newCombinedIdxs = new Uint32Array(combinedIdxs.length + newTris.length);
                newCombinedIdxs.set(combinedIdxs);
                for (let i = 0; i < newTris.length; i++) {
                    newCombinedIdxs[combinedIdxs.length + i] = newTris[i];
                }
                finalCombinedIdxs = newCombinedIdxs;
            }

            const splitCount = splitsToApply.length;
            const subdivMs = performance.now() - subdivStart;
            console.log(`[ParametricExport]   v18.0 GPU-surface subdivision: ${splitCount} edges split â†’ ${splitCount * 2} new tris (${subdivMs.toFixed(1)}ms)`);
            console.log(`[ParametricExport]     avg grid edge: ${avgGridEdge.toFixed(3)}mm, interior threshold: ${Math.sqrt(subdivThreshold2).toFixed(3)}mm, boundary threshold: ${Math.sqrt(boundarySubdivThreshold2).toFixed(3)}mm, candidates: ${edgesToSplit.length}, boundary neighbor tris: ${boundaryTrisAdded}`);

            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // v16.33 REVERTED â€” boundary edge flipping made artifacts worse.
            // Flipping edges at chain-strip/standard boundary on a curved
            // surface near ridges creates triangles that overshoot the ridge.
            // The dihedral criterion tries to flatten the surface, but ridges
            // are SUPPOSED to be non-flat. 3023 flips â†’ visible protrusions.
            //
            // Boundary diagnostic: count boundary edges + dihedral stats
            // without modifying any geometry.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            {
                const bndEdgeKey2 = (a: number, b: number): bigint => {
                    const lo = a < b ? a : b;
                    const hi = a < b ? b : a;
                    return BigInt(lo) * BigInt(0x100000) + BigInt(hi);
                };
                // Build edgeâ†’tri for outer wall
                const bndE2T = new Map<bigint, number[]>();
                for (let t = 0; t < outerIdxCount; t += 3) {
                    const a = finalCombinedIdxs[t], b = finalCombinedIdxs[t + 1], c = finalCombinedIdxs[t + 2];
                    if (a === b || b === c || a === c) continue;
                    for (const ek of [bndEdgeKey2(a, b), bndEdgeKey2(b, c), bndEdgeKey2(c, a)]) {
                        let arr = bndE2T.get(ek);
                        if (!arr) { arr = []; bndE2T.set(ek, arr); }
                        arr.push(t);
                    }
                }
                let bndEdgeCount = 0;
                let dihedralSum = 0, dihedralMin = 2, dihedralMax = -2;
                for (const [, tris] of bndE2T) {
                    if (tris.length !== 2) continue;
                    const [t0, t1] = tris;
                    const a0 = finalCombinedIdxs[t0], b0 = finalCombinedIdxs[t0 + 1], c0 = finalCombinedIdxs[t0 + 2];
                    const a1 = finalCombinedIdxs[t1], b1 = finalCombinedIdxs[t1 + 1], c1 = finalCombinedIdxs[t1 + 2];
                    const cs0 = a0 >= outerGridVertexCount || b0 >= outerGridVertexCount || c0 >= outerGridVertexCount;
                    const cs1 = a1 >= outerGridVertexCount || b1 >= outerGridVertexCount || c1 >= outerGridVertexCount;
                    if (cs0 === cs1) continue; // not a boundary edge
                    bndEdgeCount++;
                    // Compute dihedral (dot of triangle normals)
                    const px = (v: number) => finalResultData[v * 3];
                    const py = (v: number) => finalResultData[v * 3 + 1];
                    const pz = (v: number) => finalResultData[v * 3 + 2];
                    const nx0 = (py(b0) - py(a0)) * (pz(c0) - pz(a0)) - (pz(b0) - pz(a0)) * (py(c0) - py(a0));
                    const ny0 = (pz(b0) - pz(a0)) * (px(c0) - px(a0)) - (px(b0) - px(a0)) * (pz(c0) - pz(a0));
                    const nz0 = (px(b0) - px(a0)) * (py(c0) - py(a0)) - (py(b0) - py(a0)) * (px(c0) - px(a0));
                    const nx1 = (py(b1) - py(a1)) * (pz(c1) - pz(a1)) - (pz(b1) - pz(a1)) * (py(c1) - py(a1));
                    const ny1 = (pz(b1) - pz(a1)) * (px(c1) - px(a1)) - (px(b1) - px(a1)) * (pz(c1) - pz(a1));
                    const nz1 = (px(b1) - px(a1)) * (py(c1) - py(a1)) - (py(b1) - py(a1)) * (px(c1) - px(a1));
                    const len0 = Math.sqrt(nx0 * nx0 + ny0 * ny0 + nz0 * nz0);
                    const len1 = Math.sqrt(nx1 * nx1 + ny1 * ny1 + nz1 * nz1);
                    if (len0 > 1e-10 && len1 > 1e-10) {
                        const d = (nx0 * nx1 + ny0 * ny1 + nz0 * nz1) / (len0 * len1);
                        dihedralSum += d;
                        if (d < dihedralMin) dihedralMin = d;
                        if (d > dihedralMax) dihedralMax = d;
                    }
                }
                const dihedralAvg = bndEdgeCount > 0 ? dihedralSum / bndEdgeCount : 0;
                console.log(`[ParametricExport]   v16.33 boundary diagnostic: ${bndEdgeCount} boundary edges`);
                console.log(`[ParametricExport]     dihedral dot(n0,n1): avg=${dihedralAvg.toFixed(4)}, min=${dihedralMin.toFixed(4)}, max=${dihedralMax.toFixed(4)}`);
            }

            // v16.31: Diagnostic â€” count cross-row tris and aspect ratios
            {
                const origVertCount = vertexCount; // grid + chain verts (before subdivision)
                let crossRow1 = 0, crossRow2 = 0, crossRow3plus = 0;
                let aspectOver5 = 0, aspectOver10 = 0, aspectOver20 = 0;
                let val3 = 0, val4 = 0, val5 = 0;
                // Rebuild valence for final mesh
                const finalVal = new Map<number, number>();
                for (let t = 0; t < finalCombinedIdxs.length; t += 3) {
                    const a = finalCombinedIdxs[t], b = finalCombinedIdxs[t + 1], c = finalCombinedIdxs[t + 2];
                    if (a === b || b === c || a === c) continue;
                    // Only count outer wall tris (first surface)
                    if (t >= allIdxArrays[0].length + (finalCombinedIdxs.length - combinedIdxs.length)) continue;
                    finalVal.set(a, (finalVal.get(a) || 0) + 1);
                    finalVal.set(b, (finalVal.get(b) || 0) + 1);
                    finalVal.set(c, (finalVal.get(c) || 0) + 1);
                    // T-span check: use combinedVerts for grid+chain verts, midpoint for subdiv verts
                    const tOf = (v: number): number => {
                        if (v < origVertCount) return combinedVerts[v * 3 + 1];
                        // Subdivision vertex: approximate from 3D Y if available
                        return NaN;
                    };
                    const tA = tOf(a), tB = tOf(b), tC = tOf(c);
                    const validTs: number[] = [];
                    if (!isNaN(tA)) validTs.push(tA);
                    if (!isNaN(tB)) validTs.push(tB);
                    if (!isNaN(tC)) validTs.push(tC);
                    if (validTs.length >= 2) {
                        const tSpan = Math.max(...validTs) - Math.min(...validTs);
                        const rowBands = tSpan / maxSingleRowTSpan;
                        if (rowBands > 1.5 && rowBands <= 2.5) crossRow1++;
                        else if (rowBands > 2.5 && rowBands <= 3.5) crossRow2++;
                        else if (rowBands > 3.5) crossRow3plus++;
                    }
                    // Aspect ratio check (3D)
                    const px = (v: number) => finalResultData[v * 3];
                    const py = (v: number) => finalResultData[v * 3 + 1];
                    const pz = (v: number) => finalResultData[v * 3 + 2];
                    const e1 = Math.sqrt((px(b) - px(a)) ** 2 + (py(b) - py(a)) ** 2 + (pz(b) - pz(a)) ** 2);
                    const e2 = Math.sqrt((px(c) - px(b)) ** 2 + (py(c) - py(b)) ** 2 + (pz(c) - pz(b)) ** 2);
                    const e3 = Math.sqrt((px(a) - px(c)) ** 2 + (py(a) - py(c)) ** 2 + (pz(a) - pz(c)) ** 2);
                    const maxE = Math.max(e1, e2, e3);
                    const s = (e1 + e2 + e3) / 2;
                    const area = Math.sqrt(Math.max(0, s * (s - e1) * (s - e2) * (s - e3)));
                    const aspect = area > 1e-10 ? (maxE * maxE) / (4 * area * 1.7320508) : 999;
                    if (aspect > 5) aspectOver5++;
                    if (aspect > 10) aspectOver10++;
                    if (aspect > 20) aspectOver20++;
                }
                for (const [, v] of finalVal) {
                    if (v === 3) val3++;
                    else if (v === 4) val4++;
                    else if (v === 5) val5++;
                }
                console.log(`[ParametricExport]   v16.31 diagnostics:`);
                console.log(`[ParametricExport]     cross-row tris: 2-row=${crossRow1}, 3-row=${crossRow2}, 4+row=${crossRow3plus}`);
                console.log(`[ParametricExport]     aspect ratios: >5=${aspectOver5}, >10=${aspectOver10}, >20=${aspectOver20}`);
                console.log(`[ParametricExport]     low valence: val=3: ${val3}, val=4: ${val4}, val=5: ${val5} (outer wall only)`);
            }
            // It was incorrectly detecting normal chain-strip triangles as
            // "cross-row" (141K false positives) due to the getT() returning
            // NaN for new subdivision vertices. The repair inflated the mesh
            // from 508K to 2.3M triangles. The real fix for diagonal
            // directionality is the alternating sweep in sweepRegion().

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
