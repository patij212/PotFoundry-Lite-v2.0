/**
 * ParametricExportComputer.ts â€" v11.3 Gap-Free Index Layout + Budget Cap
 *
 * COMPLETELY SEPARATE pipeline from AdaptiveExportComputer (CDT+GPU subdivision).
 *
 * Architecture:
 *   1. GPU: Multi-strip curvature sampling (16 strips Ã— 4096 samples) â†' gradient + curvature profiles
 *   2. CPU: Feature detection via gradient zero-crossings + dÂ²r/duÂ² curvature peaks
 *   3. CPU: CDF-adaptive base grid sized to respect the user's triangle budget
 *   4. GPU: Per-row probing (4096 samples/row) â†' 5-point stencil + GSS sub-sample peak detection
 *   5. CPU: Feature CHAIN LINKING â€" connect per-row peaks across adjacent rows into
 *          continuous polylines through (u,t) space.
 *   6. CPU: Chain-guided T-row insertion â€" subdivide grid rows at T positions where
 *          chains cross row boundaries.
 *   7. CPU: PER-ROW FEATURE PATCHING â€" union grid provides representative feature
 *          columns; each row's vertices are snapped to the chain's exact U position.
 *          Chain edges become mesh edges via diagonal alignment.
 *   8. GPU: Evaluate full mesh â†' 3D positions
 *
 * v11.2 DENSITY FIX:
 *   v11.1 merged ALL chain vertex U-positions into the global grid as full-height
 *   columns. With 70 chains Ã— ~97 points = ~6800 chain U-values â†' 5593 new columns
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
    detectTDirectionFeatures,
    computeTaperProfile,
    filterByColumnConsensus,
    crossValidateAndMergeColumnFeatures,
} from './parametric/FeatureDetection';
import {
    linkFeatureChainsByKind,
    insertChainGuidedRows,
    whittakerSmooth,
    blendTowardSmoothedChain,
    filterLowConfidenceChains,
    computeChainDiagnostics,
    repairChainsZigzags,
    validateAndRepairChains,
} from './parametric/ChainLinker';
import {
    mergeFeaturePositions,
    generateAdaptiveGrid,
    generateCDFAdaptivePositions,
    buildDensityProfile,
    computeGridDimensions,
    downsampleSortedPositions,
} from './parametric/GridBuilder';
import { buildCDTOuterWall } from './parametric/OuterWallTessellator';
import { DEFAULT_CHAIN_STRIP_CONFIG } from './parametric/OuterWallTessellator';
import { chainDirectedFlip, flipEdges3D } from './parametric/MeshOptimizer';
import { subdivideLongEdges } from './parametric/MeshSubdivision';
import {
    buildConstraintEdgeSet,
    edgeKey,
    optimizeChainStrips,
    optimizeBoundaryDiagonals,
    computeBoundaryDiagnostic,
    computeMeshDiagnostics,
    computeChainStrip3DQuality,
} from './parametric/ChainStripOptimizer';
import {
    SURFACE_CONFIG,
    CURVATURE_SAMPLES,
    NUM_STRIPS,
    COL_PROBE_COUNT,
    COL_PROBE_T_SAMPLES,
    type QualityProfileName,
} from './parametric/types';
import {
    getQualityProfile,
    resolveTriangleBudget,
    resolveTolerances,
    profileForAttempt,
} from './parametric/QualityProfiles';
import {
    resolveFeatureFlags,
    validateFeatureFlags,
} from './parametric/contracts';
import {
    buildFeatureEdgeGraphFromChainEdges,
    emptyFeatureEdgeGraph,
} from './parametric/FeatureEdgeGraph';
import {
    adaptiveRefine,
    type RefinementConfig,
} from './parametric/AdaptiveRefinement';
import { GPUErrorEstimator } from './parametric/GPUErrorEstimator';
import { ShaderManager } from './ShaderManager';
import {
    computeVertexMetrics,
} from './parametric/SurfaceMetric';
import {
    validateMesh,
    validateMeshGPU,
    distortionGatesForProfile,
    type ValidateConfig,
    type ValidationReport,
} from './parametric/MeshValidator';
import {
    healSeam,
    healConfigForProfile,
} from './parametric/SeamTopology';
import type { EvaluateMidpointsFn } from './parametric/MeshSubdivision';
import type { ValidationSummary, RefinementSummary, TDirectionFeature } from './parametric/types';

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
        // With original W (~1568) this is ~13K workgroups â€" well under limit.
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

        // Pass 2: Evaluate UV â†' 3D positions (New Encoder for final step)
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

        const requestedProfile: QualityProfileName = params.qualityProfile ?? 'standard';
        const effectiveProfileName = profileForAttempt(requestedProfile, 0);
        const effectiveProfile = getQualityProfile(effectiveProfileName);
        const effectiveTolerances = resolveTolerances({
            qualityProfile: effectiveProfileName,
            toleranceOverrides: params.toleranceOverrides,
        });
        const targetTris = resolveTriangleBudget(params.targetTriangles, effectiveProfile);
        const flags = resolveFeatureFlags(params.pipelineFeatureFlags);
        validateFeatureFlags(flags);

        // Resolve pipeline-stage config (UI overrides → hardcoded defaults)
        const pc = params.pipelineConfig;
        const cfgNumStrips = pc?.numStrips ?? NUM_STRIPS;
        const cfgCurvatureSamples = pc?.curvatureSamples ?? CURVATURE_SAMPLES;
        const cfgDetectHorizontalFeatures = pc?.detectHorizontalFeatures ?? false;
        const cfgRowProbeSamples = pc?.rowProbeSamples ?? 8192;
        const cfgGpuResnap = pc?.gpuResnap ?? true;
        const cfgResnapCandidates = pc?.resnapCandidates ?? 32;
        const cfgFeatureBudgetMB = pc?.featureBudgetMB ?? 0;
        const cfgChainStripMode = pc?.chainStripMode ?? DEFAULT_CHAIN_STRIP_CONFIG.mode;
        const cfgChainStripDensity = pc?.chainStripDensity ?? DEFAULT_CHAIN_STRIP_CONFIG.densityMultiplier;
        const cfgChainStripExpansion = pc?.chainStripExpansion ?? DEFAULT_CHAIN_STRIP_CONFIG.expansion;
        const cfgChainStripAdaptiveRefine = pc?.chainStripAdaptiveRefine ?? DEFAULT_CHAIN_STRIP_CONFIG.adaptiveRefine;
        const cfgBandMergeFactor = pc?.bandMergeFactor ?? 2;  // Default to 2 for production
        const cfgChainFlip = pc?.chainDirectedFlip ?? true;
        const cfgEdgeFlip3D = pc?.edgeFlip3D ?? true;
        const cfgStripOptimizer = pc?.chainStripOptimizer ?? true;
        const cfgBoundaryDiag = pc?.boundaryDiagOpt ?? true;
        const cfgGpuSubdiv = pc?.gpuSubdivision ?? true;

        console.log(`[ParametricExport] Target: ${targetTris.toLocaleString()} triangles`);
        console.log(`[ParametricExport] Quality profile: requested=${requestedProfile}, effective=${effectiveProfileName}`);
        console.log(`[ParametricExport] Feature flags: metric=${Boolean(flags.metricAwareRefinement)}, distortion=${Boolean(flags.distortionGating)}, gpuFidelity=${Boolean(flags.gpuFidelityCheck)}, seamHealing=${Boolean(flags.seamHealing)}, edgeCollapse=${Boolean(flags.edgeCollapseEnabled)}, perEdgeError=${Boolean(flags.perEdgeErrorEstimation)}, corridorPlan=${Boolean(flags.outerWallCorridorPlanning)}, corridorDiag=${Boolean(flags.outerWallCorridorDiagnostics)}`);
        console.log(`[ParametricExport] Pipeline config: strips=${cfgNumStrips}, curvSamples=${cfgCurvatureSamples}, detectHorizontal=${cfgDetectHorizontalFeatures}, rowProbe=${cfgRowProbeSamples}, featureBudget=${cfgFeatureBudgetMB}MB, resnap=${cfgGpuResnap}/${cfgResnapCandidates}, chainStrip=${cfgChainStripMode}/d${cfgChainStripDensity}/e${cfgChainStripExpansion}/r${cfgChainStripAdaptiveRefine}/m${cfgBandMergeFactor}, chainFlip=${cfgChainFlip}, edgeFlip3D=${cfgEdgeFlip3D}, stripOpt=${cfgStripOptimizer}, boundaryDiag=${cfgBoundaryDiag}, gpuSubdiv=${cfgGpuSubdiv}`);

        // â"€â"€ Shared GPU resources â"€â"€
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
            // PHASE 1: Multi-Strip Curvature Sampling (GPU â†' CPU)
            //
            // Sample NUM_STRIPS T-strips (at different U values) and
            // NUM_STRIPS U-strips (at different T values).
            // Take MAX curvature across all strips at each position.
            // This captures features regardless of angular/height position.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const curvStart = performance.now();
            const N = cfgCurvatureSamples;
            const S = cfgNumStrips;
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

            // â"€â"€ Aggregate T-curvature: MAX across all T-strips â"€â"€
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

            // â"€â"€ Aggregate U-curvature: MAX across all U-strips â"€â"€
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
            const maxCircumference = 2 * Math.PI * Math.max(Rt, Rb);
            const aspectRatios: Record<number, number> = {
                0: maxCircumference / H,
                1: maxCircumference / H,
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

            // â"€â"€ Feature Edge Detection (v7.0) â"€â"€
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
            // a handful of wider gaps in the otherwise uniform grid â€" visible as
            // "thicker columns." Fix: pre-compute the budget-constrained column
            // count and generate the uniform grid at that exact size, eliminating
            // the downsample step entirely.
            const tCount = outerDims.h + 1;
            const finalUCols = sharedW;
            const cdfU = new Float32Array(finalUCols);
            for (let i = 0; i < finalUCols; i++) cdfU[i] = i / finalUCols;
            const cdfT = new Float32Array(tCount);
            for (let i = 0; i < tCount; i++) cdfT[i] = i / (tCount - 1);
            // t=0 and t=1 are already exact from uniform generation
            if (finalUCols !== sharedW) {
                console.log(`[ParametricExport]   v16.11 Budget-aware U grid: ${sharedW} â†' ${finalUCols} columns (no downsample needed)`);
            }

            console.log(`[ParametricExport]   v16.6 mode: CAG (curvature-adaptive grid)`);

            // â"€â"€ Merge Feature Edges into T Grid (v7.0) â"€â"€
            // v16.6 local-only mode: disable global T-row insertion and keep
            // feature handling local to per-row point-cloud constraints.
            const tMerged = mergeFeaturePositions(cdfT, tFeatures, false);
            const tPositions = tMerged.positions;

            // For U, the CDF base grid is used as-is â€" per-row features are inserted later.
            const uBasePositions = cdfU;
            const featurePeaksSnapped = tMerged.injected;

            console.log(`[ParametricExport]   T-feature edges merged: ${tMerged.injected}`);
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
            // Features are arbitrary â€" they run at ANY angle through (u,t) space.
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const probeStart = performance.now();
            // v12.0 high-fidelity mode: denser row probing to reduce sub-sample
            // aliasing before chain linking. User requested spending more compute
            // to improve chain curvature quality.
            const ROW_PROBE_SAMPLES = cfgRowProbeSamples;
            const numOuterRows = tPositions.length;

            // â"€â"€ Step 1: GPU-probe all original T-rows â"€â"€
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

            // â"€â"€ Step 2: Detect features for all original rows (v16.0 verified) â"€â"€
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

            // ── Step 2.5: v17.1 GPU Column-Direction Probing + Taper-Relative Detection ──
            // Dedicated high-resolution T-direction probing with taper subtraction
            // eliminates false horizontal feature lines caused by taper inflections.
            let colPeaksAdded = 0;
            let colRejected = 0;
            if (cfgDetectHorizontalFeatures) {
                const colProbeStart = performance.now();

                // GPU-probe dedicated T-direction strips at high resolution
                const colProbeVerts = new Float32Array(COL_PROBE_COUNT * COL_PROBE_T_SAMPLES * 3);
                let cpIdx = 0;
                const colUPositions: number[] = [];
                for (let c = 0; c < COL_PROBE_COUNT; c++) {
                    const uVal = c / COL_PROBE_COUNT;
                    colUPositions.push(uVal);
                    for (let i = 0; i < COL_PROBE_T_SAMPLES; i++) {
                        colProbeVerts[cpIdx++] = uVal;
                        colProbeVerts[cpIdx++] = i / (COL_PROBE_T_SAMPLES - 1);
                        colProbeVerts[cpIdx++] = 0; // outer wall
                    }
                }

                const colProbePositions = await this.evaluatePoints(
                    colProbeVerts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
                );

                // v17.1: Compute taper profile (mean radius across all columns at each T)
                const taperProfile = computeTaperProfile(
                    colProbePositions, COL_PROBE_COUNT, COL_PROBE_T_SAMPLES
                );

                // Detect T-direction features per column using taper-relative deviation
                const columnFeatures: TDirectionFeature[][] = [];
                let totalColDetected = 0;
                let totalColPreRejected = 0;
                for (let c = 0; c < COL_PROBE_COUNT; c++) {
                    const offset = c * COL_PROBE_T_SAMPLES * 3;
                    const colData = colProbePositions.subarray(offset, offset + COL_PROBE_T_SAMPLES * 3);
                    const result = detectTDirectionFeatures(colData, COL_PROBE_T_SAMPLES, taperProfile);
                    columnFeatures.push(result.features);
                    totalColDetected += result.features.length;
                    totalColPreRejected += result.rejected;
                }

                // v17.1: Consensus filter — reject global taper artifacts and noise
                const consensus = filterByColumnConsensus(
                    columnFeatures, COL_PROBE_COUNT, COL_PROBE_T_SAMPLES
                );
                const totalConsensusRejected = consensus.globalRejected + consensus.noiseRejected;
                const filteredColDetected = consensus.filtered.reduce((s, c) => s + c.length, 0);

                // Cross-validate against row probe data and merge (kind-aware)
                const mergeResult = crossValidateAndMergeColumnFeatures(
                    consensus.filtered, colUPositions, rowProbeData, cfgRowProbeSamples,
                    tPositions, allRowFeatures, allRowTypedFeatures
                );
                colPeaksAdded = mergeResult.addedCount;
                colRejected = mergeResult.rejectedCount + totalColPreRejected + totalConsensusRejected;

                console.log(`[ParametricExport]   v17.1 GPU Column probing: ${totalColDetected} T-features from ${COL_PROBE_COUNT} columns × ${COL_PROBE_T_SAMPLES} samples (taper-relative)`);
                console.log(`[ParametricExport]   v17.1 Consensus filter: ${filteredColDetected} kept, ${consensus.globalRejected} global rejected, ${consensus.noiseRejected} noise rejected`);
                console.log(`[ParametricExport]   v17.1 Cross-validated: ${colPeaksAdded} merged, ${mergeResult.rejectedCount} rejected, ${totalColPreRejected} pre-rejected (${(performance.now() - colProbeStart).toFixed(1)}ms)`);
            } else {
                console.log('[ParametricExport]   Column probing: disabled (detectHorizontalFeatures=false)');
            }
            const totalPeaks = allRowFeatures.reduce((sum, f) => sum + f.length, 0);
            const totalRejected = rowRejected + colRejected;
            console.log(`[ParametricExport]   Total verified peaks: ${totalPeaks} (row=${totalRowPeaks}, col=${colPeaksAdded}), total rejected: ${totalRejected}`);

            // â"€â"€ Build raw peak debug data for green point cloud overlay â"€â"€
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

            // â"€â"€ Step 3: Link features into chains (v16.3: separated by kind) â"€â"€
            let chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, numOuterRows);
            console.log(`[ParametricExport]   v16.3 feature chains: ${chains.length} chains linked`);

            // R51: Post-linking chain validation — truncate tails tracking wrong features
            const preValidateCount = chains.length;
            chains = validateAndRepairChains(chains, allRowTypedFeatures);
            if (chains.length !== preValidateCount) {
                console.log(`[ParametricExport]   R51 chain validation: ${preValidateCount} → ${chains.length} chains`);
            }

            // Chain diagnostics
            if (chains.length > 0) {
                const chainLengths = chains.map(c => c.points.length);
                const avgLen = chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length;
                const maxLen = Math.max(...chainLengths);
                console.log(`[ParametricExport]     Chain lengths: avg=${avgLen.toFixed(1)}, max=${maxLen}, total points=${chainLengths.reduce((a, b) => a + b, 0)}`);

                // v21.1 Chain jaggedness diagnostics
                const diag = computeChainDiagnostics(chains, allRowFeatures);
                const maxDevAll = Math.max(...diag.perChain.map(d => d.maxLinearDeviation));
                const maxDeltaAll = Math.max(...diag.perChain.map(d => d.maxConsecutiveDelta));
                console.log(`[ParametricExport]     Chain quality: maxLinearDev=${maxDevAll.toFixed(6)}, maxConsecDelta=${maxDeltaAll.toFixed(6)}, minSameKindSpacing=${diag.minSameKindSpacing.toFixed(6)}`);

                // v25 diagnostic: identify the worst zigzag location
                for (let ci = 0; ci < chains.length; ci++) {
                    const pts = chains[ci].points;
                    let worstDelta = 0, worstRow = -1, worstU = 0, prevU = 0, nextU = 0;
                    for (let pi = 1; pi < pts.length; pi++) {
                        let d = Math.abs(pts[pi].u - pts[pi - 1].u);
                        if (d > 0.5) d = 1 - d;
                        if (d > worstDelta) {
                            worstDelta = d;
                            worstRow = pts[pi].row;
                            worstU = pts[pi].u;
                            prevU = pts[pi - 1].u;
                            nextU = pi < pts.length - 1 ? pts[pi + 1].u : -1;
                        }
                    }
                    if (worstDelta > 0.005) {
                        console.log(`[ParametricExport]     chain${ci} (kind=${chains[ci].kind}, len=${pts.length}) worst delta=${worstDelta.toFixed(6)} at row=${worstRow}: prev=${prevU.toFixed(6)} → curr=${worstU.toFixed(6)} → next=${nextU >= 0 ? nextU.toFixed(6) : 'end'}`);
                    }
                }
            }

            // ── Step 3.5: GPU RE-SNAP – Two-Stage Adaptive Wide Search ──
            // R49 P1: The original ±2 sample-width window (±0.000244 U) was too
            // narrow to correct chain-linking noise (up to ±0.008 U).
            //
            // Stage 1: Wide adaptive search (64 candidates) finds the approximate
            //          extremum within ±min(nearestSameKind/3, 0.005) U.
            // Stage 2: Narrow refinement (32 candidates) around Stage 1's best
            //          candidate preserves original sub-sample precision (~0.0008mm).
            if (chains.length > 0 && cfgGpuResnap) {
                const STAGE1_CANDIDATES = 64;
                const STAGE2_CANDIDATES = 32;
                const NARROW_HW = 2.0 / ROW_PROBE_SAMPLES; // ±2 sample widths
                // BUG A fix: raised from 0.005 to 0.015 to match the R48 ridge-diagnostic
                // window. Boundary chains (few same-kind neighbors) saturated the old cap
                // and were placed 3.9-6.4mm off-ridge. The diagnostic at L2111 uses
                // RIDGE_DIAG_HW = 0.015 — re-snap must search at least that wide to find
                // ridges the diagnostic measures.
                const MAX_RESNAP_HW = 0.015;

                // Collect all chain points with kind info
                const allChainPoints: Array<{
                    chainIdx: number; ptIdx: number; u: number; row: number; kind: string;
                }> = [];
                for (let ci = 0; ci < chains.length; ci++) {
                    for (let pi = 0; pi < chains[ci].points.length; pi++) {
                        const pt = chains[ci].points[pi];
                        allChainPoints.push({
                            chainIdx: ci, ptIdx: pi, u: pt.u, row: pt.row,
                            kind: chains[ci].kind ?? 'peak',
                        });
                    }
                }

                // Compute per-point adaptive halfwidth based on nearest same-kind feature
                const perPointHW: number[] = [];
                let wideSearchCount = 0;
                for (const cp of allChainPoints) {
                    const rowFeatures = allRowTypedFeatures[Math.min(cp.row, allRowTypedFeatures.length - 1)];
                    let nearestDist = Infinity;
                    if (rowFeatures) {
                        for (const feat of rowFeatures) {
                            if (feat.kind !== cp.kind) continue; // same kind only
                            const dist = circularDistance(cp.u, feat.u);
                            if (dist > 1e-6 && dist < nearestDist) { // exclude self
                                nearestDist = dist;
                            }
                        }
                    }
                    const hw = Math.max(
                        NARROW_HW, // floor: original narrow width
                        Math.min(nearestDist / 3.0, MAX_RESNAP_HW), // adaptive, capped
                    );
                    if (hw > NARROW_HW + 1e-8) wideSearchCount++;
                    perPointHW.push(hw);
                }

                // ── Stage 1: Wide search to find approximate extremum ──
                const totalStage1Probes = allChainPoints.length * STAGE1_CANDIDATES;
                const stage1Verts = new Float32Array(totalStage1Probes * 3);
                let s1Idx = 0;
                for (let cpIdx = 0; cpIdx < allChainPoints.length; cpIdx++) {
                    const cp = allChainPoints[cpIdx];
                    const hw = perPointHW[cpIdx];
                    const tVal = tPositions[Math.min(cp.row, tPositions.length - 1)];
                    const step = (2 * hw) / (STAGE1_CANDIDATES - 1);
                    for (let k = 0; k < STAGE1_CANDIDATES; k++) {
                        let uCandidate = cp.u - hw + k * step;
                        uCandidate = ((uCandidate % 1) + 1) % 1;
                        stage1Verts[s1Idx++] = uCandidate;
                        stage1Verts[s1Idx++] = tVal;
                        stage1Verts[s1Idx++] = 0; // outer wall
                    }
                }

                const stage1Positions = await this.evaluatePoints(
                    stage1Verts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
                );

                // Find per-point best candidate from Stage 1
                const stage1BestU: number[] = [];
                for (let cpIdx = 0; cpIdx < allChainPoints.length; cpIdx++) {
                    const cp = allChainPoints[cpIdx];
                    const hw = perPointHW[cpIdx];
                    const baseOffset = cpIdx * STAGE1_CANDIDATES * 3;
                    const step = (2 * hw) / (STAGE1_CANDIDATES - 1);

                    // R50-B P1: Use chain kind instead of probe-data heuristic
                    const isMax = cp.kind === 'peak';

                    let bestK = 0;
                    let bestR = isMax ? -Infinity : Infinity;
                    for (let k = 0; k < STAGE1_CANDIDATES; k++) {
                        const off = baseOffset + k * 3;
                        const x = stage1Positions[off];
                        const y = stage1Positions[off + 1];
                        const r = Math.sqrt(x * x + y * y);
                        if (isMax ? (r > bestR) : (r < bestR)) {
                            bestR = r;
                            bestK = k;
                        }
                    }

                    let bestU = cp.u - hw + bestK * step;
                    bestU = ((bestU % 1) + 1) % 1;
                    stage1BestU.push(bestU);
                }

                // ── Stage 2: Narrow refinement around Stage 1 winner ──
                const totalStage2Probes = allChainPoints.length * STAGE2_CANDIDATES;
                const stage2Verts = new Float32Array(totalStage2Probes * 3);
                let s2Idx = 0;
                const stage2Step = (2 * NARROW_HW) / (STAGE2_CANDIDATES - 1);
                for (let cpIdx = 0; cpIdx < allChainPoints.length; cpIdx++) {
                    const cp = allChainPoints[cpIdx];
                    const centerU = stage1BestU[cpIdx];
                    const tVal = tPositions[Math.min(cp.row, tPositions.length - 1)];
                    for (let k = 0; k < STAGE2_CANDIDATES; k++) {
                        let uCandidate = centerU - NARROW_HW + k * stage2Step;
                        uCandidate = ((uCandidate % 1) + 1) % 1;
                        stage2Verts[s2Idx++] = uCandidate;
                        stage2Verts[s2Idx++] = tVal;
                        stage2Verts[s2Idx++] = 0;
                    }
                }

                const stage2Positions = await this.evaluatePoints(
                    stage2Verts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly
                );

                // Stage 2: find best + parabolic refinement
                let resnapCount = 0;
                let wideDifferentCount = 0;
                const perChainWideDiff: number[] = new Array(chains.length).fill(0);
                for (let cpIdx = 0; cpIdx < allChainPoints.length; cpIdx++) {
                    const cp = allChainPoints[cpIdx];
                    const hw = perPointHW[cpIdx];
                    const baseOffset = cpIdx * STAGE2_CANDIDATES * 3;

                    // R50-B P1: Use chain kind instead of probe-data heuristic
                    const isMax = cp.kind === 'peak';

                    // Extract Stage 2 radii
                    const candidateRadii = new Float32Array(STAGE2_CANDIDATES);
                    for (let k = 0; k < STAGE2_CANDIDATES; k++) {
                        const off = baseOffset + k * 3;
                        const x = stage2Positions[off];
                        const y = stage2Positions[off + 1];
                        candidateRadii[k] = Math.sqrt(x * x + y * y);
                    }

                    // Find best candidate
                    let bestK = 0;
                    let bestR = candidateRadii[0];
                    for (let k = 1; k < STAGE2_CANDIDATES; k++) {
                        if (isMax ? (candidateRadii[k] > bestR) : (candidateRadii[k] < bestR)) {
                            bestR = candidateRadii[k];
                            bestK = k;
                        }
                    }

                    // Parabolic refinement
                    let finalU: number;
                    if (bestK > 0 && bestK < STAGE2_CANDIDATES - 1) {
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
                        finalU = stage1BestU[cpIdx] - NARROW_HW + refinedK * stage2Step;
                    } else {
                        finalU = stage1BestU[cpIdx] - NARROW_HW + bestK * stage2Step;
                    }

                    // Wrap to [0, 1)
                    finalU = ((finalU % 1) + 1) % 1;

                    // Guard: don't overshoot the adaptive window
                    const moved = circularDistance(cp.u, finalU);
                    if (moved > 1e-7 && moved < hw) {
                        chains[cp.chainIdx].points[cp.ptIdx] = { row: cp.row, u: finalU };
                        resnapCount++;
                    }

                    // Diagnostic: did wide search find a different extremum?
                    // "Different" = Stage 1 best is > 2 sample widths from original U
                    const stage1Shift = circularDistance(cp.u, stage1BestU[cpIdx]);
                    if (stage1Shift > NARROW_HW) {
                        wideDifferentCount++;
                        perChainWideDiff[cp.chainIdx]++;
                    }
                }

                // Diagnostic summary
                console.log(`[ParametricExport]   R49 two-stage GPU re-snap: ${resnapCount}/${allChainPoints.length} points refined`);
                console.log(`[ParametricExport]     Stage 1: ${STAGE1_CANDIDATES} candidates/point, ${wideSearchCount} points used wide window (>${(NARROW_HW * ROW_PROBE_SAMPLES).toFixed(1)} samples)`);
                console.log(`[ParametricExport]     Stage 2: ${STAGE2_CANDIDATES} candidates/point, \u00b1${(NARROW_HW * ROW_PROBE_SAMPLES).toFixed(1)} samples around Stage 1 best`);
                console.log(`[ParametricExport]     Wide search found different extremum: ${wideDifferentCount}/${allChainPoints.length} points`);
                if (wideDifferentCount > 0) {
                    const chainSummaries: string[] = [];
                    for (let ci = 0; ci < chains.length; ci++) {
                        if (perChainWideDiff[ci] > 0) {
                            chainSummaries.push(`chain${ci}=${perChainWideDiff[ci]}/${chains[ci].points.length}`);
                        }
                    }
                    console.log(`[ParametricExport]       Per-chain: ${chainSummaries.join(', ')}`);
                }
            }

            // Post-resnap diagnostic: measure chain quality after GPU refinement but before smoothing
            if (chains.length > 0) {
                const postResnapDiag = computeChainDiagnostics(chains, allRowFeatures);
                const postResnapMaxDelta = Math.max(...postResnapDiag.perChain.map(d => d.maxConsecutiveDelta));
                const postResnapMaxDev = Math.max(...postResnapDiag.perChain.map(d => d.maxLinearDeviation));
                console.log(`[ParametricExport]     Post-resnap quality: maxConsecDelta=${postResnapMaxDelta.toFixed(6)}, maxLinearDev=${postResnapMaxDev.toFixed(6)}`);
            }

            // v24.0 Post-linker zigzag repair: detect and fix chain swaps
            chains = repairChainsZigzags(chains, allRowFeatures, allRowTypedFeatures);

            // Post-repair diagnostic: measure chain quality after zigzag repair
            if (chains.length > 0) {
                const postRepairDiag = computeChainDiagnostics(chains, allRowFeatures);
                const postRepairMaxDelta = Math.max(...postRepairDiag.perChain.map(d => d.maxConsecutiveDelta));
                const postRepairMaxDev = Math.max(...postRepairDiag.perChain.map(d => d.maxLinearDeviation));
                console.log(`[ParametricExport]     Post-repair quality: maxConsecDelta=${postRepairMaxDelta.toFixed(6)}, maxLinearDev=${postRepairMaxDev.toFixed(6)}`);
            }

            // ── Step 3.6: Smooth chain paths + filter low-confidence chains ──
            // After GPU re-snap gives the best per-point positions, apply
            // Whittaker-Henderson smoothing to remove remaining sampling jitter.
            // Then filter out short/noisy chains that are likely noise artifacts.
            const chainsBeforeSmooth = chains.length;
            const pointsBeforeSmooth = chains.reduce((s, c) => s + c.points.length, 0);

            // v26 Save pre-smooth chain positions for debug visualization.
            // Debug dots show raw feature detections, so debug lines should show
            // pre-smooth chain positions (which pass through those dots) rather
            // than smoothed positions (which are displaced by WH smoothing).
            const preSmoothChains = chains.map(c => ({
                ...c,
                points: c.points.map(p => ({ ...p })),
            }));

            // Whittaker-Henderson smooth each chain's U path (single-pass, optimal L2 + penalty)
            const smoothedChains = chains.map(chain => whittakerSmooth(chain));
            const meshGuideChains = preSmoothChains.map((chain, ci) =>
                blendTowardSmoothedChain(chain, smoothedChains[ci] ?? chain)
            );
            chains = smoothedChains;

            // Filter out low-confidence chains (too short or too noisy)
            chains = filterLowConfidenceChains(chains);

            const pointsAfterSmooth = chains.reduce((s, c) => s + c.points.length, 0);
            console.log(`[ParametricExport]   v22.0 Chain smoothing: ${chainsBeforeSmooth} → ${chains.length} chains, ${pointsBeforeSmooth} → ${pointsAfterSmooth} points`);

            // R45: Use pre-smooth chains (raw GPU re-snapped positions) for mesh.
            // The mesh MUST place edges at true mathematical feature positions.
            // Any smoothing (WH or blend) displaces vertices from ground truth.
            // GPU re-snap precision is ~±0.00006 U ≈ 0.03mm — acceptable.
            const meshChains = filterLowConfidenceChains(preSmoothChains);

            let maxMeshGuideShift = 0;
            let sumMeshGuideShift = 0;
            let meshGuidePointCount = 0;
            for (let ci = 0; ci < Math.min(preSmoothChains.length, meshGuideChains.length); ci++) {
                const rawPts = preSmoothChains[ci].points;
                const guidePts = meshGuideChains[ci].points;
                for (let pi = 0; pi < Math.min(rawPts.length, guidePts.length); pi++) {
                    const shift = circularDistance(rawPts[pi].u, guidePts[pi].u);
                    if (shift > maxMeshGuideShift) maxMeshGuideShift = shift;
                    sumMeshGuideShift += shift;
                    meshGuidePointCount++;
                }
            }
            if (meshGuidePointCount > 0) {
                console.log(`[ParametricExport]     Mesh-guide blend (diagnostic only): maxShift=${maxMeshGuideShift.toFixed(6)}, avgShift=${(sumMeshGuideShift / meshGuidePointCount).toFixed(6)}`);
            }

            // Post-smooth diagnostic: measure chain quality after smoothing
            if (chains.length > 0) {
                const postDiag = computeChainDiagnostics(chains, allRowFeatures);
                const postMaxDelta = Math.max(...postDiag.perChain.map(d => d.maxConsecutiveDelta));
                const postMaxDev = Math.max(...postDiag.perChain.map(d => d.maxLinearDeviation));
                console.log(`[ParametricExport]     Post-smooth quality: maxConsecDelta=${postMaxDelta.toFixed(6)}, maxLinearDev=${postMaxDev.toFixed(6)}`);
            }

            // R43: Mesh-chain quality diagnostic — validates what actually enters tessellation
            if (meshChains.length > 0) {
                const meshDiag = computeChainDiagnostics(meshChains, allRowFeatures);
                const meshMaxDelta = Math.max(...meshDiag.perChain.map(d => d.maxConsecutiveDelta));
                console.log(`[ParametricExport]     Mesh-chain quality: maxConsecDelta=${meshMaxDelta.toFixed(6)}`);
            }

            // v21.0 CAG: Extract chain vertex U positions for density profile + dead zones
            const chainVertexUs = meshChains.flatMap(c => c.points.map(p => p.u));

            // â"€â"€ Step 4: Insert additional T-rows where chains cross diagonally â"€â"€
            // v16.4: Make row insertion budget-aware to avoid exploding outer-wall
            // triangle count (and visual over-tessellation) on high-feature styles.
            const targetOuterBudget = Math.floor(targetTris * SURFACE_CONFIG[0].budgetFrac);
            const featureBudgetTriangles = Math.max(0, Math.floor((cfgFeatureBudgetMB * 1_000_000 - 84) / 50));
            const targetOuterBudgetWithFeatures = targetOuterBudget + featureBudgetTriangles;

            // v21.0 CAG: Slim the outer-wall base U set before insertion
            // so there is room for feature columns in the later CDF-adaptive grid.
            const maxColsAtCurrentRows = Math.floor(targetOuterBudget / (2 * Math.max(1, numOuterRows - 1))) + 1;
            const desiredBaseCols = Math.max(160, Math.floor(maxColsAtCurrentRows * 0.82));
            let outerBaseU = downsampleSortedPositions(uBasePositions, Math.min(uBasePositions.length, desiredBaseCols));
            if (outerBaseU.length !== uBasePositions.length) {
                console.log(`[ParametricExport]   v16.4 Outer base downsample: ${uBasePositions.length} â†' ${outerBaseU.length} columns (pre-union)`);
            }

            // Maximum rows allowed by targetOuterBudget for this base width.
            const maxRowsForBudget = Math.floor(targetOuterBudget / (2 * Math.max(1, outerBaseU.length - 1))) + 1;
            const maxRowsForFeatureBudget = Math.floor(targetOuterBudgetWithFeatures / (2 * Math.max(1, outerBaseU.length - 1))) + 1;
            const budgetInsertionCap = Math.max(0, maxRowsForFeatureBudget - numOuterRows);
            
            // II-5 Fix: Proportional feature budget based on detected feature density.
            // Count total chain crossing points (chain vertices per row) as density metric.
            // High-feature styles (spirals, voronoi) get higher insertion caps; low-feature
            // styles (smooth, minimal) get lower caps to avoid wasted tessellation.
            const chainPointCount = meshChains.reduce((acc, c) => acc + c.points.length, 0);
            const featureDensity = chainPointCount / Math.max(1, numOuterRows); // avg chain points/row
            // Scale: density 0 → base 50, density 10+ → base 400 (clamped)
            const densityScaledBase = Math.min(400, Math.max(50, Math.floor(featureDensity * 40)));
            const maxRowInsertions = Math.min(densityScaledBase, Math.floor(numOuterRows * 0.5), budgetInsertionCap);
            // v11.5: adaptive insertion threshold improves ridge coverage on both
            // sharp and smooth features by adding intermediate rows when per-step
            // U-shifts are smaller than legacy 0.005 but still significant.
            const adaptiveInsertThreshold = Math.max(0.0035, 2.0 / Math.max(1, outerBaseU.length));
            const insertion = insertChainGuidedRows(tPositions, meshChains, maxRowInsertions, adaptiveInsertThreshold);
            let finalT = insertion.tPositions;
            const rowMapping = insertion.rowMapping;
            console.log(`[ParametricExport]   v16.6 T-row insertion: ${insertion.insertedCount} rows added (${numOuterRows} → ${finalT.length}, minUShift=${adaptiveInsertThreshold.toFixed(4)}, cap=${maxRowInsertions} [density=${featureDensity.toFixed(2)}, densityCap=${densityScaledBase}], baseRowsCap=${maxRowsForBudget}, featureRowsCap=${maxRowsForFeatureBudget})`);

            // â"€â"€ Step 5: GPU-probe inserted rows and detect their features â"€â"€
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
                        // Inserted row â€" use GPU-detected features
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
            let totalChainPoints = 0;
            let droppedPoints = 0;
            let largeUJumps = 0;
            // R45: Use meshChains (pre-smooth, GPU re-snapped positions) for debug
            // lines — matches actual mesh edge positions at true feature locations.
            for (const chain of meshChains) {
                if (chain.points.length < 2) continue;
                const remapped: Array<[number, number]> = [];
                for (const pt of chain.points) {
                    totalChainPoints++;
                    const fr = origToFinalRow.get(pt.row);
                    if (fr === undefined || fr < 0 || fr >= finalT.length) {
                        droppedPoints++;
                        continue;
                    }
                    remapped.push([pt.u, finalT[fr]]);
                }
                // Break polyline at seam crossings (raw |Δu| > 0.4) to avoid
                // horizontal lines spanning the entire UV space.
                let segment: Array<[number, number]> = [];
                for (let ri = 0; ri < remapped.length; ri++) {
                    if (segment.length > 0) {
                        const rawDu = Math.abs(remapped[ri][0] - segment[segment.length - 1][0]);
                        // Count large U-jumps (wrap-adjusted |Δu| > 0.1) for diagnostics
                        let wrapDu = rawDu;
                        if (wrapDu > 0.5) wrapDu = 1 - wrapDu;
                        if (wrapDu > 0.1) largeUJumps++;
                        // Break the polyline at seam crossings
                        if (rawDu > 0.4) {
                            if (segment.length >= 2) debugLines.push({ points: segment });
                            segment = [];
                        }
                    }
                    segment.push(remapped[ri]);
                }
                if (segment.length >= 2) debugLines.push({ points: segment });
            }
            console.log(`[ParametricExport] Debug line diagnostics: ${totalChainPoints} total chain points, ${droppedPoints} dropped (${(100 * droppedPoints / Math.max(1, totalChainPoints)).toFixed(1)}%), ${largeUJumps} large-Δu jumps (|Δu|>0.1)`);

            LAST_CHAIN_DEBUG_DATA = {
                createdAt: Date.now(),
                chainCount: meshChains.length,
                lineCount: debugLines.length,
                lines: debugLines,
            };

            // â"€â"€ Step 6: Build curvature-adaptive outer-wall grid â"€â"€
            // v21.0 CAG: CDF-adaptive columns from curvature envelope + Gaussian feature floor.
            // Budget: use targetOuterBudget (not the inflated featureBudget, which was
            // designed for the old union grid's per-feature column injection).
            const numTRows = finalT.length;
            const maxOuterColumns = Math.floor(targetOuterBudget / (2 * Math.max(1, numTRows - 1))) + 1;

            // v21.0 CAG: Re-downsample base U if row insertion shrank the column budget.
            if (outerBaseU.length > Math.floor(maxOuterColumns * 0.75)) {
                const postInsertDesiredBase = Math.max(160, Math.floor(maxOuterColumns * 0.75));
                if (outerBaseU.length > postInsertDesiredBase) {
                    outerBaseU = downsampleSortedPositions(outerBaseU, postInsertDesiredBase);
                    console.log(`[ParametricExport]   v17.1 Post-insertion base re-downsample: ${desiredBaseCols} → ${outerBaseU.length} columns (post-insert max=${maxOuterColumns})`);
                }
            }

            // v21.0 CAG: Build curvature-adaptive U grid with Gaussian feature floor.
            // Dead zones are NOT applied: with drifting chains (U-drift ~0.094 per chain
            // over 313 rows) and shared columns, global dead zones destroy the CDF
            // structure — chain points spaced ~0.0004 apart create continuous exclusion
            // bands that tile ~100% of U-space. The CDT + vertex dedup handles
            // near-coincident grid/chain vertices naturally.
            const densityProfile = buildDensityProfile(uCurvature, chainVertexUs, 0.6, 0.004);
            const unionU = generateCDFAdaptivePositions(densityProfile, maxOuterColumns, 0.3, true);
            console.log(`[ParametricExport]   v21.0 CAG grid: ${unionU.length} U columns (density profile + CDF-adaptive, budget max=${maxOuterColumns})`);

            // â"€â"€ Step 7-9: Generate surfaces â"€â"€
            // v11.2: Outer wall uses union grid + per-row patching (no column explosion).
            // Other surfaces use the regular adaptive grid (no features).
            const surfaceStats: string[] = [];
            const allVertArrays: Float32Array[] = [];
            const allIdxArrays: Uint32Array[] = [];
            let vertexOffset = 0;

            // v11.3: Per-row feature patching replaces global column merging
            let outerW = unionU.length; // kept for diagnostics
            let outerQuadMap: Int32Array | null = null; // v11.3: gap-free quadâ†'index mapping
            let outerOrigToFinal!: Map<number, number>;
            let outerGridVertexCount = 0; // v16.27: grid vertex count for chain-strip detection
            let outerChainEdges: Array<[number, number]> = []; // v16.28: constraint edges for flip protection
            let outerChainVertexChainIds: Map<number, number> = new Map(); // CAG: for feature edge graph
            let outerChainAdjacentVertices: Set<number> | undefined; // R36: grid verts adjacent to chain/super-cells
            let outerProtectedStripVertices: Set<number> | undefined; // R38: preserve repaired phantom corridor
            let outerFanDiagonalEdges: Array<[number, number]> = []; // R46: fan diagonal edges for constraint protection
            let outerInterpolatedChainVertices: Array<{ vertexIdx: number; chainId: number; rowIdx: number; gapSize: number }> = []; // R46 Phase 2
            // Bug #1 fix: phantom chain anchors created at column-boundary crossings.
            // Their UV positions are linear interpolation between chain endpoints, so
            // they drift off the feature ridge for curved features. GPU re-snap below.
            let outerPhantomChainAnchors: Array<{ vertexIdx: number; chainId: number; tCross: number }> = [];

            for (const surf of SURFACE_CONFIG) {
                if (surf.id === 0) {
                    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                    // v11.3: PER-ROW PATCHED OUTER WALL â€" union grid + chain vertex patching
                    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
                    const targetOuterTris = Math.floor(targetTris * surf.budgetFrac);
                    // Bug #5 fix: compute metric aspect for the outer-wall sweep diagonal selector.
                    // U maps to circumference at mean radius, T maps to pot height. Clamped to
                    // [0.25, 10] to avoid pathological scaling on degenerate dimensions.
                    const meanRadius = 0.5 * (dimensions.Rb + dimensions.Rt);
                    const circumference = 2 * Math.PI * Math.max(1e-3, meanRadius);
                    const rawMetricAspect = circumference / Math.max(1e-3, dimensions.H);
                    const outerMetricAspect = Math.max(0.25, Math.min(10.0, rawMetricAspect));
                    const cdtResult = buildCDTOuterWall(
                        meshChains, rowMapping, finalT, unionU,
                        targetOuterTris, surf.id,
                        {
                            mode: cfgChainStripMode as 'sweep' | 'cdt' | 'sweep-repair',
                            densityMultiplier: cfgChainStripDensity,
                            adaptiveRefine: cfgChainStripAdaptiveRefine,
                            expansion: cfgChainStripExpansion,
                            bandMergeFactor: cfgBandMergeFactor,
                        },
                        { Rb: dimensions.Rb, Rt: dimensions.Rt, expn: dimensions.expn, H: dimensions.H },
                        {
                            corridorPlanning: Boolean(flags.outerWallCorridorPlanning),
                            corridorDiagnostics: Boolean(flags.outerWallCorridorDiagnostics),
                            metricAspect: outerMetricAspect,
                        },
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
                    outerChainVertexChainIds = cdtResult.chainVertexChainIds;
                    outerChainAdjacentVertices = cdtResult.chainAdjacentVertices;
                    outerProtectedStripVertices = cdtResult.protectedStripVertices;
                    outerFanDiagonalEdges = cdtResult.fanDiagonalEdges;
                    outerInterpolatedChainVertices = cdtResult.interpolatedChainVertices;
                    outerPhantomChainAnchors = cdtResult.phantomChainAnchors;
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
                    outerGridVertexCount = cdtResult.gridVertexCount;
                    outerChainEdges = cdtResult.chainEdges;
                    outerOrigToFinal = cdtResult.origToFinal;
                    outerW = unionU.length; // grid width = number of columns in union grid
                    outerQuadMap = cdtResult.quadMap; // v11.3: quadâ†'index mapping
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
            let combinedVerts = new Float32Array(totalVerts);
            let combinedIdxs = new Uint32Array(totalIdxs);
            let vOff = 0, iOff = 0;
            for (const v of allVertArrays) { combinedVerts.set(v, vOff); vOff += v.length; }
            for (const ix of allIdxArrays) { combinedIdxs.set(ix, iOff); iOff += ix.length; }

            const vertexCount = combinedVerts.length / 3;
            const triangleCount = combinedIdxs.length / 3;
            const gridMs = performance.now() - gridStart;

            // ── Build FeatureEdgeGraph from actual chain edges (CAG v1.0) ──
            // Uses the tessellator's real vertex indices instead of re-computing
            // via grid-column snapping (which produces stale indices after CAG).
            // Seam guard: filter out edges that cross the 0°/360° seam boundary
            // using |u0 - u1| > 0.5 wrap-around detection.
            let seamFilteredChainEdges = outerChainEdges;
            if (meshChains.length > 0 && outerChainEdges.length > 0) {
                const outerVerts = allVertArrays[0]; // outer wall vertices (u, t, surfaceId)
                seamFilteredChainEdges = outerChainEdges.filter(([v0, v1]) => {
                    const u0 = outerVerts[v0 * 3];
                    const u1 = outerVerts[v1 * 3];
                    return Math.abs(u0 - u1) <= 0.5;
                });
            }
            const featureGraph = meshChains.length > 0
                ? buildFeatureEdgeGraphFromChainEdges(
                    meshChains, seamFilteredChainEdges, outerChainVertexChainIds,
                )
                : emptyFeatureEdgeGraph();

            console.log(`[ParametricExport] Grid generation: ${gridMs.toFixed(1)}ms`);
            console.log(`[ParametricExport] Total: ${vertexCount.toLocaleString()} verts, ${triangleCount.toLocaleString()} tris`);
            for (const stat of surfaceStats) console.log(`[ParametricExport] ${stat}`);

            // ── R46 Phase 2: Post-OWT GPU re-snap for interpolated chain vertices ──
            if (outerInterpolatedChainVertices.length > 0 && cfgGpuResnap) {
                const SAMPLE_WIDTH = 1.0 / ROW_PROBE_SAMPLES;
                const BASE_HALFWIDTH = 2.0 * SAMPLE_WIDTH; // ±2 sample widths (same as Step 3.5)
                const MAX_INTERP_DELTA = 0.08; // max allowable U shift

                const interpVertCount = outerInterpolatedChainVertices.length;
                // Pre-compute per-vertex adaptive window and candidate count
                const perVertexHW: number[] = [];
                const perVertexCands: number[] = [];
                let totalProbes = 0;
                for (const iv of outerInterpolatedChainVertices) {
                    // C1 amendment: adaptive window scales with gapSize² × 0.001
                    const gapAdaptive = iv.gapSize * iv.gapSize * 0.001;
                    const hw = Math.min(0.01, Math.max(BASE_HALFWIDTH, gapAdaptive));
                    const cands = hw > 4 * SAMPLE_WIDTH ? 64 : 32;
                    perVertexHW.push(hw);
                    perVertexCands.push(cands);
                    totalProbes += cands;
                }

                const resnapVerts = new Float32Array(totalProbes * 3);
                let rIdx = 0;
                for (let i = 0; i < interpVertCount; i++) {
                    const iv = outerInterpolatedChainVertices[i];
                    const currentU = combinedVerts[iv.vertexIdx * 3];
                    const tVal = combinedVerts[iv.vertexIdx * 3 + 1];
                    const hw = perVertexHW[i];
                    const cands = perVertexCands[i];
                    const step = (2 * hw) / (cands - 1);
                    for (let k = 0; k < cands; k++) {
                        let uCandidate = currentU - hw + k * step;
                        uCandidate = ((uCandidate % 1) + 1) % 1;
                        resnapVerts[rIdx++] = uCandidate;
                        resnapVerts[rIdx++] = tVal;
                        resnapVerts[rIdx++] = 0; // outer wall surface
                    }
                }

                const resnapPositions = await this.evaluatePoints(
                    resnapVerts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                );

                let interpResnapCount = 0;
                let interpAlreadyCorrect = 0;
                let interpOvershoot = 0;
                let maxOvershootMoved = 0;
                let maxWindowUsed = 0;
                let totalWindowUsed = 0;
                let probeOffset = 0;
                for (let i = 0; i < interpVertCount; i++) {
                    const iv = outerInterpolatedChainVertices[i];
                    const hw = perVertexHW[i];
                    const cands = perVertexCands[i];
                    const currentU = combinedVerts[iv.vertexIdx * 3];

                    if (hw > maxWindowUsed) maxWindowUsed = hw;
                    totalWindowUsed += hw;

                    // Determine peak vs valley from parent chain kind
                    const parentChain = meshChains[iv.chainId];
                    const isMax = !parentChain?.kind || parentChain.kind === 'peak';

                    // Extract radii from resnap candidates
                    const candidateRadii = new Float32Array(cands);
                    for (let k = 0; k < cands; k++) {
                        const off = (probeOffset + k) * 3;
                        const x = resnapPositions[off];
                        const y = resnapPositions[off + 1];
                        candidateRadii[k] = Math.sqrt(x * x + y * y);
                    }

                    // Find best candidate (max radius for peaks, min for valleys)
                    let bestK = 0;
                    let bestR = candidateRadii[0];
                    for (let k = 1; k < cands; k++) {
                        if (isMax ? (candidateRadii[k] > bestR) : (candidateRadii[k] < bestR)) {
                            bestR = candidateRadii[k];
                            bestK = k;
                        }
                    }

                    // Parabolic refinement for sub-sample accuracy
                    const step = (2 * hw) / (cands - 1);
                    let finalU: number;
                    if (bestK > 0 && bestK < cands - 1) {
                        const L = candidateRadii[bestK - 1];
                        const C = candidateRadii[bestK];
                        const R_val = candidateRadii[bestK + 1];
                        const denom = L - 2 * C + R_val;
                        let delta = 0;
                        if (Math.abs(denom) > 1e-14) {
                            delta = 0.5 * (L - R_val) / denom;
                            delta = Math.max(-0.5, Math.min(0.5, delta));
                        }
                        finalU = currentU - hw + (bestK + delta) * step;
                    } else {
                        finalU = currentU - hw + bestK * step;
                    }
                    finalU = ((finalU % 1) + 1) % 1;

                    const moved = circularDistance(currentU, finalU);
                    if (moved > 1e-7 && moved < MAX_INTERP_DELTA) {
                        combinedVerts[iv.vertexIdx * 3] = finalU;
                        interpResnapCount++;
                    } else if (moved <= 1e-7) {
                        interpAlreadyCorrect++;
                    } else {
                        interpOvershoot++;
                        if (moved > maxOvershootMoved) maxOvershootMoved = moved;
                    }

                    probeOffset += cands;
                }

                const avgWindow = interpVertCount > 0 ? (totalWindowUsed / interpVertCount) : 0;
                console.log(`[ParametricExport]   R46 interp re-snap: ${interpResnapCount}/${interpVertCount} refined, already-correct=${interpAlreadyCorrect}, overshoot=${interpOvershoot} (max=${maxOvershootMoved.toFixed(6)}) (avg window=${avgWindow.toFixed(6)}, max window=${maxWindowUsed.toFixed(6)})`);
            }

            // ── Bug #1 fix: GPU re-snap R37 phantom chain anchors ──
            // R37 creates phantom vertices at column-boundary crossings via linear UV
            // interpolation between chain edge endpoints. For curved features the
            // linear interpolation drifts off the feature ridge, producing visible
            // bumps/dips at every chain-column crossing in the STL. We re-snap each
            // anchor to the local peak/valley at its own T value.
            if (outerPhantomChainAnchors.length > 0 && cfgGpuResnap) {
                const SAMPLE_WIDTH = 1.0 / ROW_PROBE_SAMPLES;
                const BASE_HALFWIDTH = 2.0 * SAMPLE_WIDTH;
                const PHANTOM_HALFWIDTH = Math.max(BASE_HALFWIDTH, 0.004);
                const PHANTOM_CANDIDATES = 32;
                const MAX_PHANTOM_DELTA = 0.04;

                const phCount = outerPhantomChainAnchors.length;
                const phProbeVerts = new Float32Array(phCount * PHANTOM_CANDIDATES * 3);
                let phWriteIdx = 0;
                for (const pa of outerPhantomChainAnchors) {
                    const currentU = combinedVerts[pa.vertexIdx * 3];
                    const step = (2 * PHANTOM_HALFWIDTH) / (PHANTOM_CANDIDATES - 1);
                    for (let k = 0; k < PHANTOM_CANDIDATES; k++) {
                        let uC = currentU - PHANTOM_HALFWIDTH + k * step;
                        uC = ((uC % 1) + 1) % 1;
                        phProbeVerts[phWriteIdx++] = uC;
                        phProbeVerts[phWriteIdx++] = pa.tCross;
                        phProbeVerts[phWriteIdx++] = 0;
                    }
                }

                const phPositions = await this.evaluatePoints(
                    phProbeVerts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                );

                let phResnapCount = 0;
                let phAlreadyCorrect = 0;
                let phOvershoot = 0;
                let phMaxMoved = 0;
                let phProbeOffset = 0;
                for (const pa of outerPhantomChainAnchors) {
                    const currentU = combinedVerts[pa.vertexIdx * 3];
                    const parentChain = meshChains[pa.chainId];
                    const isMax = !parentChain?.kind || parentChain.kind === 'peak';

                    const radii = new Float32Array(PHANTOM_CANDIDATES);
                    for (let k = 0; k < PHANTOM_CANDIDATES; k++) {
                        const off = (phProbeOffset + k) * 3;
                        const x = phPositions[off];
                        const y = phPositions[off + 1];
                        radii[k] = Math.sqrt(x * x + y * y);
                    }

                    let bestK = 0;
                    let bestR = radii[0];
                    for (let k = 1; k < PHANTOM_CANDIDATES; k++) {
                        if (isMax ? (radii[k] > bestR) : (radii[k] < bestR)) {
                            bestR = radii[k];
                            bestK = k;
                        }
                    }

                    const step = (2 * PHANTOM_HALFWIDTH) / (PHANTOM_CANDIDATES - 1);
                    let finalU: number;
                    if (bestK > 0 && bestK < PHANTOM_CANDIDATES - 1) {
                        const L = radii[bestK - 1];
                        const C = radii[bestK];
                        const R_val = radii[bestK + 1];
                        const denom = L - 2 * C + R_val;
                        let delta = 0;
                        if (Math.abs(denom) > 1e-14) {
                            delta = 0.5 * (L - R_val) / denom;
                            delta = Math.max(-0.5, Math.min(0.5, delta));
                        }
                        finalU = currentU - PHANTOM_HALFWIDTH + (bestK + delta) * step;
                    } else {
                        finalU = currentU - PHANTOM_HALFWIDTH + bestK * step;
                    }
                    finalU = ((finalU % 1) + 1) % 1;

                    const moved = circularDistance(currentU, finalU);
                    if (moved > 1e-7 && moved < MAX_PHANTOM_DELTA) {
                        combinedVerts[pa.vertexIdx * 3] = finalU;
                        phResnapCount++;
                        if (moved > phMaxMoved) phMaxMoved = moved;
                    } else if (moved <= 1e-7) {
                        phAlreadyCorrect++;
                    } else {
                        phOvershoot++;
                    }

                    phProbeOffset += PHANTOM_CANDIDATES;
                }

                console.log(`[ParametricExport]   Bug#1 phantom re-snap: ${phResnapCount}/${phCount} refined, already-correct=${phAlreadyCorrect}, overshoot=${phOvershoot}, max moved=${phMaxMoved.toFixed(6)}`);
            }



            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            // PHASE 3: Evaluate Full Mesh (GPU)
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const gpuStart = performance.now();

            // Write Grid Width (W) to Uniforms â€" used by relax_vertices shader
            // for row/col neighbor addressing.  chunk4.w is at offset 76 (19 * 4 bytes).
            // v8.2: outerW = union grid width (same topology for all rows)
            const widthUniform = new Float32Array([outerW]);
            this.device.queue.writeBuffer(uniformBuffer, 76, widthUniform.buffer);

            // BUG E mitigation: WGSL relaxation has no Jacobian inversion check —
            // production logs at relax=200 show dihedral dot min=-1.0 (inverted
            // faces) and aspect 4.9e9. Until the shader adds per-step validity
            // guards, clamp to a safe ceiling and warn. FULL fix (deferred):
            // add inversion-aware line search inside relax.wgsl.
            const SAFE_RELAX_MAX = 50;
            const requestedRelax = Math.max(0, Math.floor(params.relaxIterations ?? 0));
            const relaxIterations = Math.min(requestedRelax, SAFE_RELAX_MAX);
            if (requestedRelax > SAFE_RELAX_MAX) {
                console.warn(`[ParametricExport]   BUG E: relaxIterations=${requestedRelax} clamped to ${SAFE_RELAX_MAX} (shader lacks inversion guard; higher values produce non-manifold output)`);
            }
            if (relaxIterations > 0) {
                // Write outerGridVertexCount to chunk4.z (byte offset 72) so the
                // relaxation shader can skip chain vertices (appended after grid).
                // Chain vertices don't follow row*W+col topology — relaxing them
                // reads neighbors from unrelated surfaces (inner wall, rim, etc.).
                const gridVertCountUniform = new Float32Array([outerGridVertexCount]);
                this.device.queue.writeBuffer(uniformBuffer, 72, gridVertCountUniform.buffer);
                console.log(`[ParametricExport]   v21.0 metric relaxation enabled: ${relaxIterations} iterations (gridVertCount=${outerGridVertexCount})`);
            }

            // Relaxation now uses metric-aware diffusion (bounded step + crossover
            // guards in shader) to improve physical triangle regularity while
            // preserving feature-constrained topology.
            let resultData = await this.evaluatePoints(
                combinedVerts, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                false, // Snap disabled â€" union grid has dedicated feature columns
                relaxIterations
            );

            const gpuMs = performance.now() - gpuStart;

            const outerIdxCount = allIdxArrays[0].length;

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
            //   Stage 1: chainDirectedFlip â€" forces diagonals along chain edges
            //   Stage 2: flipEdges3D â€" generic dihedral+angle quality improvement
            // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
            const flip3DStart = performance.now();

            // The outer wall occupies the first outerW Ã— finalT.length vertices
            // in the combined buffer. Its indices are at the start of combinedIdxs.
            const outerH = Math.round(outerGridVertexCount / outerW);

            // Stage 1: Chain-directed flip â€" uses chain topology to force
            // diagonals along ridge lines (v11.3: with quadMap)
            let chainFlips = 0;
            let lockedQuads = new Set<number>();
            if (cfgChainFlip) {
                const cdResult = chainDirectedFlip(
                    combinedIdxs,    // indices (outer wall at start, mutated in-place)
                    unionU,          // column U positions
                    outerW,          // grid width (number of columns)
                    outerH,          // grid height (number of rows)
                    meshChains,      // R43: WH-smoothed chains (was: blend-capped meshGuideChains)
                    outerOrigToFinal, // map from original row index to actual grid row
                    false,           // invertWinding = false for outer wall
                    outerQuadMap!    // v11.3: quadâ†'index mapping from buildCDTOuterWall
                );
                chainFlips = cdResult.flipCount;
                lockedQuads = cdResult.lockedQuads;
            }
            console.log(`[ParametricExport]   v14.0 chain-directed flip: ${chainFlips} diagonals along ridges (${lockedQuads.size} quads locked)${!cfgChainFlip ? ' [DISABLED]' : ''}`);

            // Stage 2: Generic 3D edge flip â€" improves triangle quality using
            // dihedral angle + min-angle criterion on actual 3D positions (v10.2)
            // Skips quads locked by chain-directed flip.
            let genericFlips = 0;
            if (cfgEdgeFlip3D) {
                genericFlips = flipEdges3D(
                    combinedIdxs,    // indices (mutated in-place)
                    resultData,      // 3D positions from GPU
                    outerW,          // grid width
                    outerH,          // grid height
                    false,           // invertWinding = false for outer wall
                    lockedQuads,     // locked quads from chain-directed flip
                    outerQuadMap!    // v11.3: quadâ†'index mapping
                );
            }

            const flip3DMs = performance.now() - flip3DStart;
            console.log(`[ParametricExport]   v11.3 3D edge flip: ${genericFlips} quality flips (${flip3DMs.toFixed(1)}ms)${!cfgEdgeFlip3D ? ' [DISABLED]' : ''}`);


            //
            // v16.28f + v16.34: Chain-strip 3D edge flip + boundary diagonal
            // [Extracted to parametric/ChainStripOptimizer.ts]
            //
            const constraintEdgeSet = buildConstraintEdgeSet(outerChainEdges);

            // R46: Protect fan diagonal edges from CSO flips
            for (const [v0, v1] of outerFanDiagonalEdges) {
                constraintEdgeSet.add(edgeKey(v0, v1));
            }

            let csResult = { phaseAFlips: 0, phaseBFlips: 0, phaseCFlips: 0, chainStripTriCount: 0, timeMs: 0, rowSpanRejects: 0, edgeLenRejects: 0, aspectRejects: 0, valenceBonusFlips: 0, maxSingleRowTSpan: 0, chainGridFlips: 0, chainGridFlipsAllowed: 0, valenceStats: { before: { total: 0, low: 0, ideal: 0, high: 0 }, after: { total: 0, low: 0, ideal: 0, high: 0 } } };
            if (cfgStripOptimizer) {
                csResult = optimizeChainStrips({
                    combinedIdxs,
                    positions: resultData,
                    combinedVerts,
                    constraintEdgeSet,
                    outerGridVertexCount,
                    outerIdxCount,
                    finalT,
                    chainAdjacentVertices: outerChainAdjacentVertices,
                    protectedVertices: outerProtectedStripVertices,
                });
                console.log(`[ParametricExport]   v16.31 chain-strip 3D edge flip: ${csResult.phaseAFlips}+${csResult.phaseBFlips}+${csResult.phaseCFlips} flips (angle+valence+shortDiag) on ${csResult.chainStripTriCount} chain-strip tris (${csResult.timeMs.toFixed(1)}ms)`);
                console.log(`[ParametricExport]     rejects: rowSpan=${csResult.rowSpanRejects}, edgeLen=${csResult.edgeLenRejects}, aspect=${csResult.aspectRejects}, valenceBonus=${csResult.valenceBonusFlips}, chainGridSkips=${csResult.chainGridFlips}, chainGridFlipsAllowed=${csResult.chainGridFlipsAllowed}`);
                console.log(`[ParametricExport]     valence before: ${csResult.valenceStats.before.total} verts, ${csResult.valenceStats.before.low} low(<5), ${csResult.valenceStats.before.ideal} ideal(6), ${csResult.valenceStats.before.high} high(>7)`);
                console.log(`[ParametricExport]     valence after:  ${csResult.valenceStats.after.total} verts, ${csResult.valenceStats.after.low} low(<5), ${csResult.valenceStats.after.ideal} ideal(6), ${csResult.valenceStats.after.high} high(>7)`);
            } else {
                console.log(`[ParametricExport]   v16.31 chain-strip optimizer [DISABLED]`);
            }

            let bdResult = { flips: 0, checked: 0, timeMs: 0 };
            if (cfgBoundaryDiag) {
                bdResult = optimizeBoundaryDiagonals({
                    combinedIdxs,
                    positions: resultData,
                    outerW,
                    outerH,
                    outerQuadMap: outerQuadMap!,
                    outerIdxCount,
                    outerGridVertexCount,
                    chainAdjacentVertices: outerChainAdjacentVertices,
                    protectedVertices: outerProtectedStripVertices,
                });
            }
            console.log(`[ParametricExport]   v16.34 boundary diagonal optimization: ${bdResult.flips} cell diag flips on ${bdResult.checked} boundary cells (${bdResult.timeMs.toFixed(1)}ms)${!cfgBoundaryDiag ? ' [DISABLED]' : ''}`);

            // v24.0: 3D winding safety net REMOVED.
            // The radially-outward assumption (dot(face_normal, radial) < 0 → flip)
            // is invalid for concave sections (vase necks, valleys) and style features
            // where the surface normal legitimately points toward the axis.
            // Winding correctness is ensured upstream via UV cross-product checks in
            // the tessellator (sweepRepair, emitWindingSafe, CDT filter).

            // 
            // v16.29 / v18.0: Chain-strip midpoint subdivision
            // [Extracted to parametric/MeshSubdivision.ts]
            // 
            let finalResultData: Float32Array;
            let finalCombinedIdxs: Uint32Array;
            let splitCount = 0;
            if (cfgGpuSubdiv) {
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
                        chains: meshChains,
                        finalT,
                        protectedVertices: outerProtectedStripVertices,
                    },
                    (uvBatch) => this.evaluatePoints(
                        uvBatch, uniformBuffer, styleParamBuffer,
                        dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                        false, 0
                    ),
                );
                finalResultData = subdivResult.resultData;
                finalCombinedIdxs = subdivResult.indices;
                splitCount = subdivResult.splitCount;
                console.log(`[ParametricExport]   v18.0 GPU-surface subdivision: ${splitCount} edges split → ${splitCount * 2} new tris (${subdivResult.stats.timeMs.toFixed(1)}ms)`);
                console.log(`[ParametricExport]     avg grid edge: ${subdivResult.stats.avgGridEdge.toFixed(3)}mm, interior threshold: ${Math.sqrt(subdivResult.stats.interiorThreshold).toFixed(3)}mm, boundary threshold: ${Math.sqrt(subdivResult.stats.boundaryThreshold).toFixed(3)}mm, feature threshold: ${Math.sqrt(subdivResult.stats.featureThreshold).toFixed(3)}mm, candidates: ${subdivResult.stats.candidates}, protected rejects: ${subdivResult.stats.protectedRejects}, boundary neighbor tris: ${subdivResult.stats.boundaryTrisAdded}`);

                // ── R46 Phase 3: Subdivision midpoint re-snap ──────────────
                // Chain-edge midpoints use UV-average U, which drifts off-ridge
                // for curved features. Re-snap to the true extremum using the
                // same discrete candidate pattern as Phase 2 interp re-snap.
                if (subdivResult.chainMidpoints.length > 0 && cfgGpuResnap) {
                    const subdivResnapStart = performance.now();
                    const SAMPLE_WIDTH = 1.0 / ROW_PROBE_SAMPLES;
                    const BASE_HALFWIDTH = 2.0 * SAMPLE_WIDTH;

                    const allMidpoints = subdivResult.chainMidpoints;

                    // Pre-compute per-midpoint adaptive window and candidate count
                    const eligibleIndices: number[] = [];
                    const perMidpointHW: number[] = [];
                    const perMidpointCands: number[] = [];
                    let totalProbes = 0;

                    for (let i = 0; i < allMidpoints.length; i++) {
                        const cm = allMidpoints[i];
                        const uDrift = circularDistance(cm.u0, cm.u1);
                        // Endpoints close enough — midpoint is already at the ridge
                        if (uDrift < 2 * SAMPLE_WIDTH) continue;

                        // C1 amendment: adaptive window scales with endpoint U drift
                        const hw = Math.max(BASE_HALFWIDTH, Math.min(0.01, uDrift * 0.5 + BASE_HALFWIDTH));
                        const cands = hw > 4 * SAMPLE_WIDTH ? 64 : 32;
                        eligibleIndices.push(i);
                        perMidpointHW.push(hw);
                        perMidpointCands.push(cands);
                        totalProbes += cands;
                    }

                    const eligibleCount = eligibleIndices.length;
                    let subdivResnapCount = 0;
                    let skippedNoChainId = 0;

                    if (totalProbes > 0) {
                        // Build candidate UV batch with prefix-sum allocation
                        const resnapVerts = new Float32Array(totalProbes * 3);
                        let rIdx = 0;
                        for (let ei = 0; ei < eligibleCount; ei++) {
                            const cm = allMidpoints[eligibleIndices[ei]];
                            const hw = perMidpointHW[ei];
                            const cands = perMidpointCands[ei];
                            const step = (2 * hw) / (cands - 1);
                            for (let k = 0; k < cands; k++) {
                                let uCandidate = cm.u - hw + k * step;
                                uCandidate = ((uCandidate % 1) + 1) % 1;
                                resnapVerts[rIdx++] = uCandidate;
                                resnapVerts[rIdx++] = cm.t;
                                resnapVerts[rIdx++] = 0; // outer wall surface
                            }
                        }

                        // GPU evaluate all candidates in one call
                        const resnapPositions = await this.evaluatePoints(
                            resnapVerts, uniformBuffer, styleParamBuffer,
                            dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                        );

                        // For each eligible midpoint: find best discrete candidate
                        let probeOffset = 0;
                        for (let ei = 0; ei < eligibleCount; ei++) {
                            const cm = allMidpoints[eligibleIndices[ei]];
                            const hw = perMidpointHW[ei];
                            const cands = perMidpointCands[ei];

                            // Look up chain ID from endpoints — skip if unknown
                            const chainId = outerChainVertexChainIds.get(cm.v0) ?? outerChainVertexChainIds.get(cm.v1);
                            if (chainId === undefined) {
                                skippedNoChainId++;
                                probeOffset += cands;
                                continue;
                            }

                            const parentChain = meshChains[chainId];
                            const isMax = !parentChain?.kind || parentChain.kind === 'peak';

                            // Extract radii from resnap candidates
                            const candidateRadii = new Float32Array(cands);
                            for (let k = 0; k < cands; k++) {
                                const off = (probeOffset + k) * 3;
                                const x = resnapPositions[off];
                                const y = resnapPositions[off + 1];
                                candidateRadii[k] = Math.sqrt(x * x + y * y);
                            }

                            // Find best discrete candidate (max radius for peaks, min for valleys)
                            let bestK = 0;
                            let bestR = candidateRadii[0];
                            for (let k = 1; k < cands; k++) {
                                if (isMax ? (candidateRadii[k] > bestR) : (candidateRadii[k] < bestR)) {
                                    bestR = candidateRadii[k];
                                    bestK = k;
                                }
                            }

                            // Best candidate's 3D position replaces the midpoint directly
                            const step = (2 * hw) / (cands - 1);
                            let bestU = cm.u - hw + bestK * step;
                            bestU = ((bestU % 1) + 1) % 1;
                            const moved = circularDistance(cm.u, bestU);
                            if (moved > 1e-7 && moved < 0.08) {
                                const off = (probeOffset + bestK) * 3;
                                finalResultData[cm.vertexIdx * 3] = resnapPositions[off];
                                finalResultData[cm.vertexIdx * 3 + 1] = resnapPositions[off + 1];
                                finalResultData[cm.vertexIdx * 3 + 2] = resnapPositions[off + 2];
                                subdivResnapCount++;
                            }

                            probeOffset += cands;
                        }
                    }

                    console.log(`[ParametricExport]   R46 subdiv re-snap: ${subdivResnapCount}/${eligibleCount} refined, ${skippedNoChainId} skipped (no chainId) (${(performance.now() - subdivResnapStart).toFixed(1)}ms)`);
                }
            } else {
                finalResultData = resultData;
                finalCombinedIdxs = combinedIdxs;
                console.log(`[ParametricExport]   v18.0 GPU-surface subdivision [DISABLED]`);
            }

            // ── R48 H': Ridge-distance diagnostic ──
            if (meshChains.length > 0 && outerChainVertexChainIds.size > 0) {
                const RIDGE_DIAG_HW = 0.015; // ±0.015 U half-width
                const RIDGE_DIAG_CANDS = 64;

                // Collect chain vertex info
                const chainVtxList: Array<{ vertexIdx: number; chainId: number; isPrimary: boolean }> = [];
                const interpIdxSetH = new Set<number>();
                for (const iv of outerInterpolatedChainVertices) {
                    interpIdxSetH.add(iv.vertexIdx);
                }
                for (const [vtxIdx, chainId] of outerChainVertexChainIds) {
                    chainVtxList.push({ vertexIdx: vtxIdx, chainId, isPrimary: !interpIdxSetH.has(vtxIdx) });
                }

                if (chainVtxList.length > 0) {
                    // Build probe UV batch
                    const probeUVs = new Float32Array(chainVtxList.length * RIDGE_DIAG_CANDS * 3);
                    let pIdx = 0;
                    for (const cv of chainVtxList) {
                        const currentU = combinedVerts[cv.vertexIdx * 3];
                        const currentT = combinedVerts[cv.vertexIdx * 3 + 1];
                        const step = (2 * RIDGE_DIAG_HW) / (RIDGE_DIAG_CANDS - 1);
                        for (let k = 0; k < RIDGE_DIAG_CANDS; k++) {
                            let u = currentU - RIDGE_DIAG_HW + k * step;
                            u = ((u % 1) + 1) % 1;
                            probeUVs[pIdx++] = u;
                            probeUVs[pIdx++] = currentT;
                            probeUVs[pIdx++] = 0; // outer wall
                        }
                    }

                    const probePositions = await this.evaluatePoints(
                        probeUVs, uniformBuffer, styleParamBuffer,
                        dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                    );

                    // For each chain vertex, find true extremum and compute 3D distance
                    let totalDist = 0, maxDist = 0, count = 0;
                    let primaryTotal = 0, primaryMax = 0, primaryCount = 0;
                    let interpTotal = 0, interpMax = 0, interpCount = 0;
                    let worstVtx = { chainId: -1, vertexIdx: -1, dist: 0, uError: 0 };
                    // R50-B D1: Per-chain R48 error breakdown
                    const chainR48Stats = new Map<number, { sumDist: number; count: number; maxDist: number; sumUErr: number; maxUErr: number }>();

                    for (let i = 0; i < chainVtxList.length; i++) {
                        const cv = chainVtxList[i];
                        const parentChain = meshChains[cv.chainId];
                        const isMax = !parentChain?.kind || parentChain.kind === 'peak';

                        const base = i * RIDGE_DIAG_CANDS;
                        let bestK = 0;
                        let bestR = 0;
                        { // Find radius at first candidate
                            const off = base * 3;
                            bestR = Math.sqrt(probePositions[off] ** 2 + probePositions[off + 1] ** 2);
                        }
                        for (let k = 1; k < RIDGE_DIAG_CANDS; k++) {
                            const off = (base + k) * 3;
                            const r = Math.sqrt(probePositions[off] ** 2 + probePositions[off + 1] ** 2);
                            if (isMax ? (r > bestR) : (r < bestR)) {
                                bestR = r; bestK = k;
                            }
                        }

                        // R50-B D3: Parabolic refinement of R48 extremum U position
                        const step = (2 * RIDGE_DIAG_HW) / (RIDGE_DIAG_CANDS - 1);
                        let refinedTrueU = combinedVerts[cv.vertexIdx * 3] - RIDGE_DIAG_HW + bestK * step;
                        let clampedDelta = 0;
                        if (bestK > 0 && bestK < RIDGE_DIAG_CANDS - 1) {
                            const rL = Math.sqrt(probePositions[(base + bestK - 1) * 3] ** 2 + probePositions[(base + bestK - 1) * 3 + 1] ** 2);
                            const rC = bestR;
                            const rR = Math.sqrt(probePositions[(base + bestK + 1) * 3] ** 2 + probePositions[(base + bestK + 1) * 3 + 1] ** 2);
                            const denom = rL - 2 * rC + rR;
                            if (Math.abs(denom) > 1e-12) {
                                const delta = 0.5 * (rL - rR) / denom;
                                clampedDelta = Math.max(-0.5, Math.min(0.5, delta));
                                refinedTrueU = combinedVerts[cv.vertexIdx * 3] - RIDGE_DIAG_HW + (bestK + clampedDelta) * step;
                            }
                        }
                        const refinedUError = circularDistance(((refinedTrueU % 1) + 1) % 1, combinedVerts[cv.vertexIdx * 3]);

                        // True ridge 3D position (discrete best candidate)
                        const trueOff = (base + bestK) * 3;
                        const tx = probePositions[trueOff], ty = probePositions[trueOff + 1], tz = probePositions[trueOff + 2];

                        // Current chain vertex 3D position (from final result data)
                        const cx = finalResultData[cv.vertexIdx * 3];
                        const cy = finalResultData[cv.vertexIdx * 3 + 1];
                        const cz = finalResultData[cv.vertexIdx * 3 + 2];

                        const dist = Math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2 + (tz - cz) ** 2);
                        totalDist += dist; count++;
                        if (dist > maxDist) maxDist = dist;

                        if (cv.isPrimary) {
                            primaryTotal += dist; primaryCount++;
                            if (dist > primaryMax) primaryMax = dist;
                        } else {
                            interpTotal += dist; interpCount++;
                            if (dist > interpMax) interpMax = dist;
                        }

                        // R50-B D1: Accumulate per-chain stats
                        let cs = chainR48Stats.get(cv.chainId);
                        if (!cs) {
                            cs = { sumDist: 0, count: 0, maxDist: 0, sumUErr: 0, maxUErr: 0 };
                            chainR48Stats.set(cv.chainId, cs);
                        }
                        cs.sumDist += dist; cs.count++;
                        if (dist > cs.maxDist) cs.maxDist = dist;
                        cs.sumUErr += refinedUError;
                        if (refinedUError > cs.maxUErr) cs.maxUErr = refinedUError;

                        // Track worst vertex
                        if (dist > worstVtx.dist) {
                            const trueU = combinedVerts[cv.vertexIdx * 3] - RIDGE_DIAG_HW + bestK * step;
                            worstVtx = { chainId: cv.chainId, vertexIdx: cv.vertexIdx, dist, uError: Math.abs(trueU - combinedVerts[cv.vertexIdx * 3]) };
                        }
                    }

                    console.log(`[ParametricExport]   R48 ridge-distance diagnostic:`);
                    console.log(`[ParametricExport]     all: avg=${(totalDist / count).toFixed(4)}mm, max=${maxDist.toFixed(4)}mm (n=${count})`);
                    if (primaryCount > 0) console.log(`[ParametricExport]     primary: avg=${(primaryTotal / primaryCount).toFixed(4)}mm, max=${primaryMax.toFixed(4)}mm (n=${primaryCount})`);
                    if (interpCount > 0) console.log(`[ParametricExport]     interpolated: avg=${(interpTotal / interpCount).toFixed(4)}mm, max=${interpMax.toFixed(4)}mm (n=${interpCount})`);
                    console.log(`[ParametricExport]     worst: chain${worstVtx.chainId} vtx${worstVtx.vertexIdx} dist=${worstVtx.dist.toFixed(4)}mm uErr=${worstVtx.uError.toFixed(6)}`);
                    // R50-B D1: Per-chain R48 error breakdown
                    for (const [chainId, cs] of chainR48Stats) {
                        const kind = meshChains[chainId]?.kind ?? 'peak';
                        console.log(`[ParametricExport]     R48 chain${chainId} (${kind}, len=${cs.count}): avgDist=${(cs.sumDist / cs.count).toFixed(4)}mm, maxDist=${cs.maxDist.toFixed(4)}mm, avgUErr=${(cs.sumUErr / cs.count).toFixed(6)}, maxUErr=${cs.maxUErr.toFixed(6)}`);
                    }
                }
            }


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
                numU: outerW,
                numT: outerH,
                gridVertexCount: outerGridVertexCount,
            });
            console.log(`[ParametricExport]   v16.31 diagnostics:`);
            console.log(`[ParametricExport]     cross-row tris: 2-row=${meshDiag.crossRow1}, 3-row=${meshDiag.crossRow2}, 4+row=${meshDiag.crossRow3plus}`);
            console.log(`[ParametricExport]     aspect ratios: >5=${meshDiag.aspectOver5}, >10=${meshDiag.aspectOver10}, >20=${meshDiag.aspectOver20}`);
            console.log(`[ParametricExport]     low valence: val=3: ${meshDiag.val3} (boundary=${meshDiag.val3Boundary}, interior=${meshDiag.val3Interior}, chain=${meshDiag.val3Chain}), val=4: ${meshDiag.val4}, val=5: ${meshDiag.val5}`);

            // B5: Chain-strip-specific 3D quality report (post-GPU)
            const cs3D = computeChainStrip3DQuality({
                indices: finalCombinedIdxs,
                positions: finalResultData,
                outerGridVertexCount,
                outerIdxCount,
            });
            if (cs3D.triCount > 0) {
                const minAngleDeg = (cs3D.minAngle * 180 / Math.PI).toFixed(1);
                const violationPct = (100 * cs3D.aspectOver4 / cs3D.triCount).toFixed(1);
                console.log(`[ParametricExport]   v25.0 chain-strip 3D quality: ${cs3D.triCount} tris, min_angle=${minAngleDeg}°, max_aspect=${cs3D.maxAspect.toFixed(1)}:1, avg_aspect=${cs3D.avgAspect.toFixed(1)}:1, violations(>4:1)=${cs3D.aspectOver4}/${cs3D.triCount} (${violationPct}%)`);
                console.log(`[ParametricExport]     grading: max_area_ratio=${cs3D.maxAreaRatio.toFixed(1)}:1, grading_violations(>2:1)=${cs3D.gradingViolations}`);
            }

            // ═══════════════════════════════════════════════════════
            // PHASE 5: Adaptive Refinement (flag-gated)
            //
            // When the quality profile requests refinement iterations > 0,
            // run error-driven adaptive triangle splitting to bring
            // chord error and normal error within profile tolerances.
            // ═══════════════════════════════════════════════════════
            let refinementSummary: RefinementSummary | undefined;
            let outerIdxCountAfterSubdiv = allIdxArrays[0].length + (finalCombinedIdxs.length - combinedIdxs.length);

            if (effectiveProfile.maxRefineIterations > 0) {
                const refineStart = performance.now();

                // Build the GPU evaluator callback for surface reprojection
                const evaluateMidpointsFn: EvaluateMidpointsFn = (uvBatch: Float32Array) =>
                    this.evaluatePoints(
                        uvBatch, uniformBuffer, styleParamBuffer,
                        dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                        false, 0,
                    );

                // ── Extract outer-wall-only slices for refinement ──
                // The combined buffer has [outer | inner | rim | base | ...].
                // AdaptiveRefinement appends new triangles/vertices at the END
                // of its arrays. If we pass the combined buffer, appended indices
                // land after all surfaces, and curOuterIdxCount extends into
                // inner-wall territory — causing cross-surface triangle linkage.
                //
                // Fix: pass only outer-wall positions/uvs/indices to refinement,
                // then stitch the refined outer wall back into the combined buffer.
                const outerPositions = finalResultData;  // positions are shared (all surfaces reference same pool)
                const outerUVs = combinedVerts;          // UVs are shared
                const outerIndices = new Uint32Array(finalCombinedIdxs.buffer, finalCombinedIdxs.byteOffset, outerIdxCountAfterSubdiv);
                const nonOuterIndices = finalCombinedIdxs.slice(outerIdxCountAfterSubdiv);

                // Optionally compute vertex metrics for metric-aware edge scoring
                // when the metricAwareRefinement flag is enabled.
                let vertexMetrics: ReturnType<typeof computeVertexMetrics> | undefined;
                if (flags.metricAwareRefinement) {
                    vertexMetrics = computeVertexMetrics(
                        outerPositions, outerUVs, outerIndices,
                        outerIdxCountAfterSubdiv,
                    );
                    console.log(`[ParametricExport]   Metric-aware refinement: computed ${vertexMetrics.vertexCount} vertex metrics`);
                }

                const refinementConfig: RefinementConfig = {
                    profile: effectiveProfile,
                    tolerances: effectiveTolerances,
                    maxTriangles: targetTris,
                    featureGraph,
                    outerIdxCount: outerIdxCountAfterSubdiv,
                    vertexMetrics,
                    edgeCollapseEnabled: Boolean(flags.edgeCollapseEnabled),
                    perEdgeErrorEstimation: Boolean(flags.perEdgeErrorEstimation),
                };

                // Phase 5: GPU error estimation (gated behind gpuFidelityCheck flag)
                let gpuErrorEstimator: GPUErrorEstimator | undefined;
                if (flags.gpuFidelityCheck) {
                    try {
                        const sm = ShaderManager.getInstance();
                        const eeShaderSource = sm.getErrorEstimationWGSL(Number(params.styleId));
                        gpuErrorEstimator = new GPUErrorEstimator(this.device);
                        await gpuErrorEstimator.init(eeShaderSource);

                        refinementConfig.gpuEstimateErrors = (
                            positions: Float32Array,
                            uvs: Float32Array,
                            indices: Uint32Array,
                            outerIdxCount: number,
                        ) => gpuErrorEstimator!.estimateErrors(
                            positions, uvs, indices, outerIdxCount,
                            uniformBuffer, styleParamBuffer,
                        );
                        console.log('[ParametricExport]   GPU error estimator enabled for refinement');
                    } catch (err) {
                        console.warn('[ParametricExport]   GPU error estimator init failed, falling back to CPU:', err);
                        gpuErrorEstimator = undefined;
                    }
                }

                const refineResult = await adaptiveRefine(
                    outerPositions,
                    outerUVs,
                    outerIndices,
                    refinementConfig,
                    evaluateMidpointsFn,
                );

                // ── Stitch refined outer wall back into combined buffers ──
                // Refinement may have grown positions/uvs (appended midpoints)
                // and indices (appended split triangles). Non-outer indices
                // reference the original vertex pool which is a prefix of the
                // refined positions array, so they remain valid.
                finalResultData = refineResult.positions;
                combinedVerts = new Float32Array(refineResult.uvs);
                // Concatenate: refined outer indices + original non-outer indices
                const stitchedIndices = new Uint32Array(refineResult.indices.length + nonOuterIndices.length);
                stitchedIndices.set(refineResult.indices);
                stitchedIndices.set(nonOuterIndices, refineResult.indices.length);
                finalCombinedIdxs = stitchedIndices;

                // Cleanup GPU error estimator
                if (gpuErrorEstimator) {
                    gpuErrorEstimator.destroy();
                }

                const refineMs = performance.now() - refineStart;
                const finalTriCount = finalCombinedIdxs.length / 3;
                const totalSplits = refineResult.iterationStats.reduce((sum, s) => sum + s.splitCount, 0);

                // Compute final quality with histogram for telemetry
                const { computeMeshQuality: mqFn } = await import('./parametric/AdaptiveRefinement');
                const finalQuality = mqFn(finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv, true);

                refinementSummary = {
                    tolerancesPassed: refineResult.tolerancesPassed,
                    iterationsPerformed: refineResult.iterationsPerformed,
                    stopReason: refineResult.stopReason,
                    maxPosErrorMm: refineResult.maxPosErrorMm,
                    maxNormalErrorDeg: refineResult.maxNormalErrorDeg,
                    p95PosErrorMm: refineResult.p95PosErrorMm,
                    p95NormalErrorDeg: refineResult.p95NormalErrorDeg,
                    totalTimeMs: refineMs,
                    finalTriangleCount: finalTriCount,
                    totalSplits,
                    minAngleDeg: finalQuality.minAngleDeg,
                    maxAspectRatio: finalQuality.maxAspectRatio,
                    angleHistogram: finalQuality.angleHistogram?.bins,
                };

                console.log(`[ParametricExport]   Adaptive refinement: ${refineResult.iterationsPerformed} iterations, ` +
                    `stop=${refineResult.stopReason}, maxPos=${refineResult.maxPosErrorMm.toFixed(4)}mm, ` +
                    `maxNorm=${refineResult.maxNormalErrorDeg.toFixed(2)}°, tris=${finalTriCount.toLocaleString()} (${refineMs.toFixed(0)}ms)`);
                if (finalQuality.angleHistogram) {
                    const h = finalQuality.angleHistogram.bins;
                    console.log(`[ParametricExport]   Angle histogram: [0-10)=${h[0]} [10-20)=${h[1]} [20-30)=${h[2]} [30-40)=${h[3]} [40-50)=${h[4]} [50-60)=${h[5]} [60+)=${h[6]}`);
                }
            }

            // ═══════════════════════════════════════════════════════
            // PHASE 5b: Seam Healing (flag-gated)
            //
            // When seamHealing flag is enabled, average col0/colLast
            // vertex positions to close the periodic seam gap.
            // ═══════════════════════════════════════════════════════
            if (flags.seamHealing) {
                const healStart = performance.now();
                const healConfig = healConfigForProfile(effectiveProfileName);
                const healResult = healSeam(
                    finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv,
                    outerW, finalT.length, healConfig,
                    // BUG F fix: pass UV data so seam pairing finds chain vertices,
                    // phantom vertices, and subdivision midpoints — not just base
                    // grid vertices. The outer-wall vertex range is [0, totalVerts/3).
                    combinedVerts, Math.floor(finalResultData.length / 3),
                );
                finalCombinedIdxs = healResult.indices;
                const healMs = performance.now() - healStart;
                console.log(`[ParametricExport]   Seam healing: ${healResult.pairsAveraged} pairs averaged, ` +
                    `${healResult.ghostStripsInserted} ghost strips, residual=${healResult.maxResidualGapMm.toFixed(4)}mm (${healMs.toFixed(1)}ms)`);
            }

            // ═══════════════════════════════════════════════════════
            // PHASE 5c: Strip degenerate placeholder triangles
            //
            // Multiple earlier stages emit (0,0,0) placeholder triangles
            // for degenerate cases: UV-collinear standard cells, Batch 6
            // dedup collapses, sweepRepair nullification. Strip them now
            // so validation and STL export see only real geometry.
            // ═══════════════════════════════════════════════════════
            {
                let outerDegen = 0;
                let totalDegen = 0;
                const idxLen = finalCombinedIdxs.length;

                for (let t = 0; t < idxLen; t += 3) {
                    const a = finalCombinedIdxs[t], b = finalCombinedIdxs[t + 1], c = finalCombinedIdxs[t + 2];
                    if (a === b || b === c || a === c) {
                        totalDegen++;
                        if (t < outerIdxCountAfterSubdiv) outerDegen++;
                    }
                }

                if (totalDegen > 0) {
                    const compacted = new Uint32Array(idxLen - totalDegen * 3);
                    let w = 0;
                    for (let t = 0; t < idxLen; t += 3) {
                        const a = finalCombinedIdxs[t], b = finalCombinedIdxs[t + 1], c = finalCombinedIdxs[t + 2];
                        if (a === b || b === c || a === c) continue;
                        compacted[w++] = a;
                        compacted[w++] = b;
                        compacted[w++] = c;
                    }
                    finalCombinedIdxs = compacted;
                    outerIdxCountAfterSubdiv -= outerDegen * 3;
                    console.log(`[ParametricExport]   Stripped ${totalDegen} degenerate triangles (${outerDegen} outer wall)`);
                }
            }

            // ═══════════════════════════════════════════════════════
            // PHASE 6: Mesh Validation (always runs)
            //
            // Runs the full MeshValidator as a QA gate.
            // Optional GPU-enhanced fidelity check when gpuFidelityCheck
            // flag is enabled. Distortion gating uses profile-specific
            // thresholds when the distortionGating flag is set.
            // ═══════════════════════════════════════════════════════
            let validationSummary: ValidationSummary | undefined;
            {
                const validateStart = performance.now();
                const valConfig: ValidateConfig = {
                    tolerances: effectiveTolerances,
                    profileName: effectiveProfileName,
                    numU: outerW,
                    numT: finalT.length,
                    outerIdxCount: outerIdxCountAfterSubdiv,
                    uvs: combinedVerts,
                    distortionGates: flags.distortionGating
                        ? distortionGatesForProfile(effectiveProfileName)
                        : undefined,
                };

                let report: ValidationReport;
                if (flags.gpuFidelityCheck) {
                    const gpuEvalFn = (uvBatch: Float32Array) =>
                        this.evaluatePoints(
                            uvBatch, uniformBuffer, styleParamBuffer,
                            dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                            false, 0,
                        );
                    report = await validateMeshGPU(
                        finalResultData, combinedVerts, finalCombinedIdxs,
                        outerIdxCountAfterSubdiv, valConfig, gpuEvalFn,
                    );
                } else {
                    report = validateMesh(
                        finalResultData, finalCombinedIdxs,
                        outerIdxCountAfterSubdiv, valConfig,
                    );
                }

                // Map full ValidationReport → lightweight ValidationSummary
                validationSummary = {
                    valid: report.valid,
                    manifoldOk: report.manifold.ok,
                    degeneratesOk: report.degenerates.ok,
                    normalsOk: report.normals.ok,
                    triangleQualityOk: report.triangleQuality.ok,
                    fidelityOk: report.fidelity?.ok,
                    seamOk: report.seam?.ok,
                    distortionOk: report.distortion?.ok,
                    warnings: report.warnings,
                    minAngleDeg: report.triangleQuality.minAngleDeg,
                    maxAspectRatio: report.triangleQuality.maxAspectRatio,
                    p95PosErrorMm: report.fidelity?.p95PosErrorMm,
                    p999PosErrorMm: report.fidelity?.p999PosErrorMm,
                    maxFeatureDriftMm: report.fidelity?.maxFeatureDriftMm,
                    seamMaxGapMm: report.seam?.maxPositionDiscontinuityMm,
                    p95StretchRatio: report.distortion?.p95StretchRatio,
                };

                const validateMs = performance.now() - validateStart;
                const passStr = report.valid ? 'PASS' : 'FAIL';
                console.log(`[ParametricExport]   Validation: ${passStr} (${validateMs.toFixed(1)}ms) — ` +
                    `manifold=${report.manifold.ok}, degenerates=${report.degenerates.ok}, ` +
                    `normals=${report.normals.ok}, quality=${report.triangleQuality.ok}` +
                    (report.fidelity ? `, fidelity=${report.fidelity.ok}` : '') +
                    (report.seam ? `, seam=${report.seam.ok}` : '') +
                    (report.distortion ? `, distortion=${report.distortion.ok}` : ''));
                // v26: Log the actual mesh quality metric prominently
                if (report.normals) {
                    console.log(`[ParametricExport]   Normal check: ${report.normals.inconsistentPairs} inconsistent pairs (mesh defects), ${report.normals.invertedTriangles} inverted (includes inner wall — expected for closed solids)`);
                }
                if (report.warnings.length > 0) {
                    console.log(`[ParametricExport]   Validation warnings: ${report.warnings.join('; ')}`);
                }
            }

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

            // Build pipeline diagnostics for ExportDialog debug tab
            const pipelineDiagnostics = {
                phases: [
                    { name: 'Curvature Sampling', timeMs: curvMs },
                    { name: 'Grid Generation', timeMs: gridMs },
                    { name: 'GPU Evaluation', timeMs: gpuMs },
                    { name: '3D Edge Flip', timeMs: flip3DMs },
                    { name: 'Chain Strip Opt', timeMs: csResult.timeMs },
                    { name: 'Boundary Diag', timeMs: bdResult.timeMs },
                ],
                chainCount: chains.length,
                chainPoints: chains.reduce((sum, c) => sum + c.points.length, 0),
                chainFlips,
                genericFlips3D: genericFlips,
                subdivSplits: splitCount,
                valenceLow: csResult.valenceStats.after.low,
                valenceIdeal: csResult.valenceStats.after.ideal,
                valenceHigh: csResult.valenceStats.after.high,
                crossRowTris: meshDiag.crossRow1 + meshDiag.crossRow2 + meshDiag.crossRow3plus,
                aspectOver5: meshDiag.aspectOver5,
                refinement: refinementSummary,
            };

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
                qualityProfile: effectiveProfileName,
                effectiveTolerances,
                tolerancesPassed: validationSummary?.valid ?? refinementSummary?.tolerancesPassed,
                requestedProfile,
                validationSummary,
                refinementSummary,
                pipelineDiagnostics,
            };

        } finally {
            buffers.forEach(b => b.destroy());
        }
    }
}
