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
import { topologyMetric } from '../../fidelity/metrics';
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
import { buildCDTOuterWall, type OuterWallResult } from './parametric/OuterWallTessellator';
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
import { assessToleranceFeasibility } from './parametric/ExportFeasibility';
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
    compactDuplicateCanonicalTriangles,
    fillBranchedBoundaryComponentsWithCenters,
    fillCrossSurfaceConstantTBoundaryLoopsWithCenters,
    fillGeometricBoundaryLoops,
    fillOuterWallBoundaryLoops,
    fillOuterWallSeamBoundaryChains,
    fillSameSurfaceBoundaryLoops,
    fillSameSurfaceBoundaryLoopsWithCenters,
    repairOuterWallTJunctions,
    repairSurfaceBoundaryTJunctions,
    splitNonManifoldBoundaryTJunctions,
    splitResidualBoundaryTJunctions,
    weldNearCoincidentBoundaryVertices,
} from './parametric/BoundaryTJunctionRepair';
import { normalizeWindingByComponent } from './parametric/WindingNormalizer';
import { buildPeriodicSeamClosure } from './parametric/PeriodicSeamClosure';
import {
    healSeam,
    healConfigForProfile,
} from './parametric/SeamTopology';
import type { EvaluateMidpointsFn } from './parametric/MeshSubdivision';
import type { ValidationSummary, RefinementSummary, TDirectionFeature } from './parametric/types';
// Analytic ridge placement (Newton iteration). The CPU AnalyticRidgeSolver is
// kept for legacy reference / synthetic unit tests; production uses
// GpuRidgeSolver, which iterates Newton directly on the WGSL evaluator —
// eliminating CPU↔WGSL surface drift as a failure mode.
// See docs/superpowers/plans/2026-05-24-analytic-ridge-placement.md.
import { solveRidgesBatch, type BatchEntry as RidgeBatchEntry } from './parametric/AnalyticRidgeSolver';
import { gpuNewtonRidge, type GpuRidgeSeed } from './parametric/GpuRidgeSolver';
import { baseRadius } from '../../geometry/profile';
void solveRidgesBatch; void baseRadius; // legacy CPU path imports — kept for type re-export and reference
type _LegacyRidgeBatchEntry = RidgeBatchEntry;
void (null as unknown as _LegacyRidgeBatchEntry);

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

export const PARAMETRIC_EVAL_WORKGROUP_SIZE = 64;
export const WEBGPU_MAX_WORKGROUPS_PER_DISPATCH = 65_535;

/** Hardware ceiling: the largest eval dispatch WebGPU will legally accept. */
export const WEBGPU_MAX_EVAL_VERTICES_PER_DISPATCH =
    PARAMETRIC_EVAL_WORKGROUP_SIZE * WEBGPU_MAX_WORKGROUPS_PER_DISPATCH;

/**
 * Default per-dispatch eval cap used to chunk large midpoint-eval batches.
 *
 * The hardware ceiling (~4.19M verts) is legal but stalls the Dawn compute
 * path indefinitely on dense parametric surfaces: a non-converging style grows
 * its outer wall ~10%/refinement-iteration, and a late iteration's midpoint
 * eval reaches a single ~4.19M-vertex dispatch that hangs >150s (observed on
 * GothicArches: a 5.01M-vertex batch split left one ~4.19M dispatch that never
 * returned). Capping well below the ceiling keeps each dispatch promptly
 * evaluable; oversized batches are chunked by splitUvVerticesForDispatch.
 */
export const MAX_PARAMETRIC_EVAL_VERTICES_PER_DISPATCH = 1_048_576;

/**
 * v18.1 tolerance-first soft cap for adaptive refinement.
 *
 * `targetTris` is a *quality budget* used to allocate per-surface tessellation
 * density, not a refinement ceiling. Passing it as adaptiveRefine's
 * `maxTriangles` made refinement bail `budget_exhausted` long before the
 * position/normal tolerances were met, so tolerance-driven refinement never ran.
 * Refinement is now bounded by tolerance convergence (and maxIterations), with
 * this high cap acting only as an out-of-memory safety stop.
 */
export const REFINEMENT_TRIANGLE_SAFETY_CAP = 10_000_000;

const INDICES_PER_TRIANGLE = 3;

export type SampledResnapRejectReason =
    'accepted' | 'protected' | 'unbracketed' | 'already-correct' | 'oversize';

export type PhantomAnchorResnapRejectReason =
    'accepted' | 'already-correct' | 'non-converged' | 'oversize' | 'near-duplicate';

export interface SampledResnapCandidate {
    currentU: number;
    finalU: number;
    bestK: number;
    candidateCount: number;
    maxDelta: number;
    protectedVertex?: boolean;
}

export interface PhantomAnchorResnapCandidate {
    vertexIdx: number;
    currentU: number;
    finalU: number;
    t: number;
    gradAbs: number;
    gradThreshold: number;
    maxDelta: number;
    minSeparation: number;
}

export interface PhantomAnchorResnapDecision {
    accept: boolean;
    reason: PhantomAnchorResnapRejectReason;
}

export function shouldAcceptSampledResnapCandidate(
    candidate: SampledResnapCandidate,
): { accept: boolean; reason: SampledResnapRejectReason } {
    const { currentU, finalU, bestK, candidateCount, maxDelta, protectedVertex } = candidate;
    if (protectedVertex) {
        return { accept: false, reason: 'protected' };
    }
    if (bestK <= 0 || bestK >= candidateCount - 1) {
        return { accept: false, reason: 'unbracketed' };
    }
    const moved = circularDistance(currentU, finalU);
    if (moved <= 1e-7) {
        return { accept: false, reason: 'already-correct' };
    }
    if (moved >= maxDelta) {
        return { accept: false, reason: 'oversize' };
    }
    return { accept: true, reason: 'accepted' };
}

function phantomResnapCandidateRank(
    candidate: PhantomAnchorResnapCandidate,
): [number, number, number] {
    return [
        candidate.gradAbs,
        circularDistance(candidate.currentU, candidate.finalU),
        candidate.vertexIdx,
    ];
}

function comparePhantomResnapCandidates(
    left: PhantomAnchorResnapCandidate,
    right: PhantomAnchorResnapCandidate,
): number {
    const leftRank = phantomResnapCandidateRank(left);
    const rightRank = phantomResnapCandidateRank(right);
    for (let i = 0; i < leftRank.length; i++) {
        const diff = leftRank[i] - rightRank[i];
        if (diff !== 0) return diff;
    }
    return 0;
}

export function classifyPhantomAnchorResnapCandidates(
    candidates: readonly PhantomAnchorResnapCandidate[],
): PhantomAnchorResnapDecision[] {
    const decisions = candidates.map((candidate): PhantomAnchorResnapDecision => {
        const moved = circularDistance(candidate.currentU, candidate.finalU);
        if (candidate.gradAbs > candidate.gradThreshold) {
            return { accept: false, reason: 'non-converged' };
        }
        if (moved > candidate.maxDelta) {
            return { accept: false, reason: 'oversize' };
        }
        if (moved <= 1e-9) {
            return { accept: false, reason: 'already-correct' };
        }
        return { accept: true, reason: 'accepted' };
    });

    const rowGroups = new Map<number, number[]>();
    const T_KEY_SCALE = 1e6;
    for (let i = 0; i < candidates.length; i++) {
        if (decisions[i].reason !== 'accepted' && decisions[i].reason !== 'already-correct') continue;
        const key = Math.round(candidates[i].t * T_KEY_SCALE);
        const group = rowGroups.get(key) ?? [];
        group.push(i);
        rowGroups.set(key, group);
    }

    for (const group of rowGroups.values()) {
        group.sort((left, right) => candidates[left].finalU - candidates[right].finalU);
        let cluster: number[] = [];
        const flushCluster = (): void => {
            if (cluster.length <= 1) {
                cluster = [];
                return;
            }
            let winner = cluster[0];
            for (const candidateIdx of cluster.slice(1)) {
                if (comparePhantomResnapCandidates(candidates[candidateIdx], candidates[winner]) < 0) {
                    winner = candidateIdx;
                }
            }
            for (const candidateIdx of cluster) {
                if (candidateIdx === winner) continue;
                if (decisions[candidateIdx].reason === 'accepted') {
                    decisions[candidateIdx] = { accept: false, reason: 'near-duplicate' };
                }
            }
            cluster = [];
        };

        for (const candidateIdx of group) {
            if (cluster.length === 0) {
                cluster.push(candidateIdx);
                continue;
            }
            const previousIdx = cluster[cluster.length - 1];
            const separation = circularDistance(
                candidates[previousIdx].finalU,
                candidates[candidateIdx].finalU,
            );
            const required = Math.max(
                candidates[previousIdx].minSeparation,
                candidates[candidateIdx].minSeparation,
            );
            if (separation < required) {
                cluster.push(candidateIdx);
            } else {
                flushCluster();
                cluster.push(candidateIdx);
            }
        }
        flushCluster();
    }

    return decisions;
}

type TailDiagnosticDetailValue = string | number | boolean;

interface TailDiagnosticStage {
    name: string;
    elapsedMs: number;
    trianglesBefore: number;
    trianglesAfter: number;
    outerTrianglesBefore: number;
    outerTrianglesAfter: number;
    details: Record<string, TailDiagnosticDetailValue>;
}

interface TailDiagnosticStageInput {
    name: string;
    elapsedMs: number;
    trianglesBefore: number;
    trianglesAfter: number;
    outerTrianglesBefore: number;
    outerTrianglesAfter: number;
    details?: Record<string, TailDiagnosticDetailValue | undefined>;
}

type TailDiagnosticsGlobal = {
    __pfStageLog?: string[];
    __pfTailDiagnostics?: TailDiagnosticStage[];
};

type SourceTopologyKind = 'grid' | 'chain' | 'phantom';

interface SourceTopologySampleVertex {
    index: number;
    kind: SourceTopologyKind;
    chainId?: number;
    u: number;
    t: number;
    surface: number;
}

interface SourceTopologyIncidentSample {
    triOffset: number;
    opposite: SourceTopologySampleVertex;
    provenance?: string;
}

interface SourceTopologySample {
    count: number;
    perimeter?: boolean;
    classKey: string;
    orientation: 'vertical' | 'horizontal' | 'diagonal';
    v0: SourceTopologySampleVertex;
    v1: SourceTopologySampleVertex;
    incidents: SourceTopologyIncidentSample[];
}

interface SourceTopologyCounts {
    boundaryEdges: number;
    perimeterBoundaryEdges: number;
    interiorBoundaryEdges: number;
    nonManifoldEdges: number;
    byClass: Record<string, number>;
    byEndpointClass: Record<string, number>;
    byOrientation: Record<string, number>;
    boundarySamples: SourceTopologySample[];
    nonManifoldSamples: SourceTopologySample[];
}

interface SourceTopologyDiagnostic {
    label: string;
    vertexCount: number;
    triangleCount: number;
    raw: SourceTopologyCounts;
    uvCanonical: SourceTopologyCounts;
}

type SourceDiagnosticsGlobal = TailDiagnosticsGlobal & {
    __pfEnableSourceDiagnostics?: boolean;
    __pfStopAfterSourceDiagnostics?: boolean;
    __pfSourceDiagnostics?: SourceTopologyDiagnostic[];
    __pfEnableWindingStageDiagnostics?: boolean;
    __pfSourceTriangleProbe?: number[];
    __pfSourceEdgeProbe?: Array<[number, number]>;
    __pfSourceVertexProbe?: number[];
};

const SOURCE_TOPOLOGY_UV_QUANT = 1e6;
const SOURCE_TOPOLOGY_SAMPLE_LIMIT = 8;
const SOURCE_TOPOLOGY_INCIDENT_LIMIT = 6;
const SOURCE_TOPOLOGY_ORIENTATION_RATIO = 0.1;
const SOURCE_TOPOLOGY_ENDPOINT_EPS = 1e-6;
const SOURCE_TOPOLOGY_PERIMETER_EPS = 1e-5;

function indexCountToTriangleCount(indexCount: number): number {
    return indexCount / INDICES_PER_TRIANGLE;
}

function cleanTailDiagnosticDetails(
    details: Record<string, TailDiagnosticDetailValue | undefined> = {},
): Record<string, TailDiagnosticDetailValue> {
    const clean: Record<string, TailDiagnosticDetailValue> = {};
    for (const [key, value] of Object.entries(details)) {
        if (value !== undefined) clean[key] = value;
    }
    return clean;
}

function formatTailDiagnosticDetails(details: Record<string, TailDiagnosticDetailValue>): string {
    return Object.entries(details)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ');
}

function recordTailDiagnosticStage(input: TailDiagnosticStageInput): void {
    const details = cleanTailDiagnosticDetails(input.details);
    const stage: TailDiagnosticStage = { ...input, details };
    const detailText = formatTailDiagnosticDetails(details);
    try {
        const w = globalThis as unknown as TailDiagnosticsGlobal;
        (w.__pfTailDiagnostics ??= []).push(stage);
    } catch {
        /* noop */
    }
    pfStageMark(
        `tail-diagnostic ${input.name} elapsed=${input.elapsedMs.toFixed(1)}ms ` +
        `tris=${input.trianglesBefore}->${input.trianglesAfter} ` +
        `outer=${input.outerTrianglesBefore}->${input.outerTrianglesAfter}` +
        (detailText.length > 0 ? ` ${detailText}` : ''),
    );
    try {
        console.warn(
            `[TailDiagnostic] ${input.name}: ${input.elapsedMs.toFixed(1)}ms ` +
            `tris=${input.trianglesBefore}->${input.trianglesAfter} ` +
            `outer=${input.outerTrianglesBefore}->${input.outerTrianglesAfter}` +
            (detailText.length > 0 ? ` ${detailText}` : ''),
        );
    } catch {
        /* noop */
    }
}

function recordWindingStageDiagnostic(
    name: string,
    indices: Uint32Array,
    positions: Float32Array,
): void {
    try {
        const global = globalThis as unknown as SourceDiagnosticsGlobal;
        if (!global.__pfEnableWindingStageDiagnostics) return;
        const start = performance.now();
        const winding = normalizeWindingByComponent(
            indices,
            indices.length,
            positions,
            DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
        );
        console.warn(
            `[WINDING-STAGE] ${name} tris=${indices.length / 3} ` +
            `flipped=${winding.flipped} components=${winding.components} ` +
            `conflicts=${winding.conflicts} ms=${(performance.now() - start).toFixed(1)}`,
        );
        for (const sample of winding.conflictSamples.slice(0, 8)) {
            const [a, b] = sample.edge;
            const ax = positions[a * 3] ?? NaN;
            const ay = positions[a * 3 + 1] ?? NaN;
            const az = positions[a * 3 + 2] ?? NaN;
            const bx = positions[b * 3] ?? NaN;
            const by = positions[b * 3 + 1] ?? NaN;
            const bz = positions[b * 3 + 2] ?? NaN;
            const dx = bx - ax;
            const dy = by - ay;
            const dz = bz - az;
            const fromBase = sample.fromTriangle * 3;
            const toBase = sample.toTriangle * 3;
            const fromTri = [
                indices[fromBase] ?? -1,
                indices[fromBase + 1] ?? -1,
                indices[fromBase + 2] ?? -1,
            ];
            const toTri = [
                indices[toBase] ?? -1,
                indices[toBase + 1] ?? -1,
                indices[toBase + 2] ?? -1,
            ];
            console.warn(
                `[WINDING-CONFLICT] ${name} edge=${a}-${b} ` +
                `len=${Math.hypot(dx, dy, dz).toFixed(6)} ` +
                `mid=[${((ax + bx) * 0.5).toFixed(3)},${((ay + by) * 0.5).toFixed(3)},${((az + bz) * 0.5).toFixed(3)}] ` +
                `tris=${sample.fromTriangle}->${sample.toTriangle} ` +
                `from=[${fromTri.join(',')}] to=[${toTri.join(',')}] ` +
                `parity=${sample.currentParity}->want${sample.expectedParity}/actual${sample.actualParity} ` +
                `consistent=${sample.edgeConsistent} dirs=${sample.fromDirection}/${sample.toDirection}`,
            );
        }
    } catch (error) {
        console.warn(
            `[WINDING-STAGE] ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function resetTailDiagnostics(): void {
    try {
        const w = globalThis as unknown as TailDiagnosticsGlobal;
        w.__pfTailDiagnostics = [];
    } catch {
        /* noop */
    }
}

function tailDiagnosticsSnapshot(): TailDiagnosticStage[] {
    try {
        const w = globalThis as unknown as TailDiagnosticsGlobal;
        return [...(w.__pfTailDiagnostics ?? [])];
    } catch {
        return [];
    }
}

function incrementSourceCount(counts: Record<string, number>, key: string): void {
    counts[key] = (counts[key] ?? 0) + 1;
}

function sortedSourceCounts(counts: Record<string, number>): Record<string, number> {
    return Object.fromEntries(
        Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    );
}

function sourceVertexKind(result: OuterWallResult, index: number): SourceTopologyKind {
    if (index < result.gridVertexCount) return 'grid';
    if (result.chainVertexChainIds.has(index)) return 'chain';
    return 'phantom';
}

function sourceSampleVertex(result: OuterWallResult, index: number): SourceTopologySampleVertex {
    const base = index * 3;
    const chainId = result.chainVertexChainIds.get(index);
    return {
        index,
        kind: sourceVertexKind(result, index),
        chainId,
        u: result.vertices[base],
        t: result.vertices[base + 1],
        surface: result.vertices[base + 2],
    };
}

export function describeSourceProbeVertex(result: OuterWallResult, index: number): SourceTopologySampleVertex & {
    protected: boolean;
    phantomAnchor: boolean;
} {
    return {
        ...sourceSampleVertex(result, index),
        protected: result.protectedStripVertices.has(index),
        phantomAnchor: result.phantomChainAnchors.some(anchor => anchor.vertexIdx === index),
    };
}

function sourceVertexClass(result: OuterWallResult, index: number): string {
    const kind = sourceVertexKind(result, index);
    if (kind === 'grid') return 'G';
    if (kind === 'chain') return `C${result.chainVertexChainIds.get(index) ?? '?'}`;
    return 'P';
}

function sourceEndpointClass(result: OuterWallResult, index: number): string {
    const base = index * 3;
    const surface = Math.round(result.vertices[base + 2]);
    const t = result.vertices[base + 1];
    const tClass = t <= SOURCE_TOPOLOGY_ENDPOINT_EPS
        ? 'bottom'
        : (t >= 1 - SOURCE_TOPOLOGY_ENDPOINT_EPS ? 'top' : 'tmid');
    return `s${surface}:${tClass}`;
}

function sourceClassPair(a: string, b: string): string {
    return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

function sourceEdgeKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function sourceOrientation(result: OuterWallResult, a: number, b: number): 'vertical' | 'horizontal' | 'diagonal' {
    const du = Math.abs(result.vertices[a * 3] - result.vertices[b * 3]);
    const dt = Math.abs(result.vertices[a * 3 + 1] - result.vertices[b * 3 + 1]);
    if (du < SOURCE_TOPOLOGY_ORIENTATION_RATIO * dt) return 'vertical';
    if (dt < SOURCE_TOPOLOGY_ORIENTATION_RATIO * du) return 'horizontal';
    return 'diagonal';
}

function sourceUvCanonicalIds(result: OuterWallResult): Int32Array {
    const vertexCount = result.vertices.length / 3;
    const canonicalIds = new Int32Array(vertexCount);
    const canonical = new Map<string, number>();
    let next = 0;
    for (let index = 0; index < vertexCount; index++) {
        const base = index * 3;
        const key = `${Math.round(result.vertices[base] * SOURCE_TOPOLOGY_UV_QUANT)}:` +
            `${Math.round(result.vertices[base + 1] * SOURCE_TOPOLOGY_UV_QUANT)}:` +
            `${Math.round(result.vertices[base + 2] * SOURCE_TOPOLOGY_UV_QUANT)}`;
        let canonicalId = canonical.get(key);
        if (canonicalId === undefined) {
            canonicalId = next++;
            canonical.set(key, canonicalId);
        }
        canonicalIds[index] = canonicalId;
    }
    return canonicalIds;
}

function analyzeOuterWallSourceTopology(
    result: OuterWallResult,
    canonicalIds?: Int32Array,
): SourceTopologyCounts {
    interface EdgeAccumulator {
        count: number;
        rawA: number;
        rawB: number;
        incidents: SourceTopologyIncidentSample[];
    }
    interface SurfaceBounds {
        minU: number;
        maxU: number;
        minT: number;
        maxT: number;
    }

    const edges = new Map<string, EdgeAccumulator>();
    const surfaceBounds = new Map<number, SurfaceBounds>();
    for (let index = 0; index < result.gridVertexCount; index++) {
        const base = index * 3;
        const surface = Math.round(result.vertices[base + 2]);
        const u = result.vertices[base];
        const t = result.vertices[base + 1];
        const bounds = surfaceBounds.get(surface);
        if (bounds) {
            bounds.minU = Math.min(bounds.minU, u);
            bounds.maxU = Math.max(bounds.maxU, u);
            bounds.minT = Math.min(bounds.minT, t);
            bounds.maxT = Math.max(bounds.maxT, t);
        } else {
            surfaceBounds.set(surface, { minU: u, maxU: u, minT: t, maxT: t });
        }
    }

    const addEdge = (canonicalA: number, canonicalB: number, rawA: number, rawB: number, opposite: number, triOffset: number): void => {
        if (canonicalA === canonicalB) return;
        const key = sourceEdgeKey(canonicalA, canonicalB);
        let edge = edges.get(key);
        if (!edge) {
            edge = { count: 0, rawA, rawB, incidents: [] };
            edges.set(key, edge);
        }
        edge.count++;
        if (edge.incidents.length < SOURCE_TOPOLOGY_INCIDENT_LIMIT) {
            edge.incidents.push({
                triOffset,
                opposite: sourceSampleVertex(result, opposite),
            });
        }
    };

    const onSameLine = (a: number, b: number, target: number): boolean =>
        Math.abs(a - target) <= SOURCE_TOPOLOGY_PERIMETER_EPS &&
        Math.abs(b - target) <= SOURCE_TOPOLOGY_PERIMETER_EPS;
    const isPerimeterBoundary = (edge: EdgeAccumulator): boolean => {
        const aBase = edge.rawA * 3;
        const bBase = edge.rawB * 3;
        const surfaceA = Math.round(result.vertices[aBase + 2]);
        const surfaceB = Math.round(result.vertices[bBase + 2]);
        if (surfaceA !== surfaceB) return false;
        const bounds = surfaceBounds.get(surfaceA);
        if (!bounds) return false;
        const au = result.vertices[aBase];
        const at = result.vertices[aBase + 1];
        const bu = result.vertices[bBase];
        const bt = result.vertices[bBase + 1];
        return (
            onSameLine(au, bu, bounds.minU) ||
            onSameLine(au, bu, bounds.maxU) ||
            onSameLine(at, bt, bounds.minT) ||
            onSameLine(at, bt, bounds.maxT)
        );
    };

    for (let offset = 0; offset < result.indices.length; offset += 3) {
        const rawA = result.indices[offset];
        const rawB = result.indices[offset + 1];
        const rawC = result.indices[offset + 2];
        const a = canonicalIds ? canonicalIds[rawA] : rawA;
        const b = canonicalIds ? canonicalIds[rawB] : rawB;
        const c = canonicalIds ? canonicalIds[rawC] : rawC;
        if (a === b || b === c || a === c) continue;
        addEdge(a, b, rawA, rawB, rawC, offset);
        addEdge(b, c, rawB, rawC, rawA, offset);
        addEdge(c, a, rawC, rawA, rawB, offset);
    }

    const byClass: Record<string, number> = {};
    const byEndpointClass: Record<string, number> = {};
    const byOrientation: Record<string, number> = {};
    const boundarySamples: SourceTopologySample[] = [];
    const nonManifoldSamples: SourceTopologySample[] = [];
    let boundaryEdges = 0;
    let perimeterBoundaryEdges = 0;
    let interiorBoundaryEdges = 0;
    let nonManifoldEdges = 0;

    const recordClass = (edge: EdgeAccumulator, perimeter?: boolean): SourceTopologySample => {
        const classKey = sourceClassPair(sourceVertexClass(result, edge.rawA), sourceVertexClass(result, edge.rawB));
        const endpointClass = sourceClassPair(sourceEndpointClass(result, edge.rawA), sourceEndpointClass(result, edge.rawB));
        const orientation = sourceOrientation(result, edge.rawA, edge.rawB);
        incrementSourceCount(byClass, classKey);
        incrementSourceCount(byEndpointClass, endpointClass);
        incrementSourceCount(byOrientation, orientation);
        return {
            count: edge.count,
            ...(perimeter !== undefined ? { perimeter } : {}),
            classKey,
            orientation,
            v0: sourceSampleVertex(result, edge.rawA),
            v1: sourceSampleVertex(result, edge.rawB),
            incidents: edge.incidents.map((incident) => ({
                ...incident,
                provenance: result.triangleProvenance?.[incident.triOffset / 3],
            })),
        };
    };

    for (const edge of edges.values()) {
        if (edge.count === 1) {
            boundaryEdges++;
            const perimeter = isPerimeterBoundary(edge);
            if (perimeter) {
                perimeterBoundaryEdges++;
            } else {
                interiorBoundaryEdges++;
            }
            const sample = recordClass(edge, perimeter);
            if (!perimeter && boundarySamples.length < SOURCE_TOPOLOGY_SAMPLE_LIMIT) boundarySamples.push(sample);
        } else if (edge.count > 2) {
            nonManifoldEdges++;
            const sample = recordClass(edge);
            if (nonManifoldSamples.length < SOURCE_TOPOLOGY_SAMPLE_LIMIT) nonManifoldSamples.push(sample);
        }
    }

    return {
        boundaryEdges,
        perimeterBoundaryEdges,
        interiorBoundaryEdges,
        nonManifoldEdges,
        byClass: sortedSourceCounts(byClass),
        byEndpointClass: sortedSourceCounts(byEndpointClass),
        byOrientation: sortedSourceCounts(byOrientation),
        boundarySamples,
        nonManifoldSamples,
    };
}

function recordOuterWallSourceTopology(label: string, result: OuterWallResult): void {
    let shouldStopAfterRecord = false;
    try {
        const global = globalThis as unknown as SourceDiagnosticsGlobal;
        if (!global.__pfEnableSourceDiagnostics && !global.__pfSourceDiagnostics) return;
        const diagnostic: SourceTopologyDiagnostic = {
            label,
            vertexCount: result.vertices.length / 3,
            triangleCount: result.indices.length / 3,
            raw: analyzeOuterWallSourceTopology(result),
            uvCanonical: analyzeOuterWallSourceTopology(result, sourceUvCanonicalIds(result)),
        };
        (global.__pfSourceDiagnostics ??= []).push(diagnostic);
        console.warn(
            `[SOURCE-TOPOLOGY] ${label} ` +
            `raw boundary=${diagnostic.raw.boundaryEdges} nonMan=${diagnostic.raw.nonManifoldEdges} ` +
            `uvCanon boundary=${diagnostic.uvCanonical.boundaryEdges} nonMan=${diagnostic.uvCanonical.nonManifoldEdges}`,
        );
        shouldStopAfterRecord = global.__pfStopAfterSourceDiagnostics === true;
    } catch {
        /* diagnostics must not affect export */
    }
    if (shouldStopAfterRecord) {
        throw new Error('SOURCE_DIAGNOSTICS_STOP');
    }
}

function recordOuterWallTriangleProbe(result: OuterWallResult): void {
    try {
        const global = globalThis as unknown as SourceDiagnosticsGlobal;
        const probe = global.__pfSourceTriangleProbe;
        const edgeProbe = global.__pfSourceEdgeProbe;
        const vertexProbe = global.__pfSourceVertexProbe;
        const formatSourceVertex = (v: number): string => {
            const sample = describeSourceProbeVertex(result, v);
            return `${v}:${sample.u.toFixed(6)},${sample.t.toFixed(6)},${Math.round(sample.surface)},` +
                `kind=${sample.kind},chain=${sample.chainId ?? '-'},` +
                `protected=${sample.protected ? 1 : 0},phantomAnchor=${sample.phantomAnchor ? 1 : 0}`;
        };
        const formatVerts = (verts: number[]): string => {
            const uv = verts.map(formatSourceVertex).join('|');
            return `verts=[${verts.join(',')}] uv=[${uv}]`;
        };
        if (vertexProbe && vertexProbe.length > 0) {
            for (const vertexIdx of vertexProbe) {
                console.warn(`[SOURCE-VERTEX] ${formatSourceVertex(vertexIdx)}`);
            }
        }
        if (probe && probe.length > 0) {
            for (const tri of probe) {
                const base = tri * 3;
                if (base + 2 >= result.indices.length) continue;
                const verts = [
                    result.indices[base],
                    result.indices[base + 1],
                    result.indices[base + 2],
                ];
                console.warn(
                    `[SOURCE-TRI] t=${tri} provenance=${result.triangleProvenance?.[tri] ?? 'unknown'} ` +
                    formatVerts(verts),
                );
            }
        }
        if (edgeProbe && edgeProbe.length > 0) {
            for (const [ea, eb] of edgeProbe) {
                const incidents: string[] = [];
                for (let base = 0; base + 2 < result.indices.length; base += 3) {
                    const verts = [
                        result.indices[base],
                        result.indices[base + 1],
                        result.indices[base + 2],
                    ];
                    const hasA = verts.includes(ea);
                    const hasB = verts.includes(eb);
                    if (!hasA || !hasB) continue;
                    const tri = base / 3;
                    incidents.push(
                        `t=${tri}:prov=${result.triangleProvenance?.[tri] ?? 'unknown'}:${formatVerts(verts)}`,
                    );
                    if (incidents.length >= 8) break;
                }
                console.warn(`[SOURCE-EDGE] edge=${ea}-${eb} incidents=${incidents.length} ${incidents.join(' || ')}`);
            }
        }
    } catch {
        /* diagnostics must not affect export */
    }
}

function recordOuterWallQualityStage(
    label: string,
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
): void {
    try {
        const global = globalThis as unknown as { __pfEnableQualityStageDiagnostics?: boolean };
        if (!global.__pfEnableQualityStageDiagnostics) return;
        const worst: Array<{ triangle: number; aspect: number; vertices: [number, number, number] }> = [];
        let slivers = 0;
        const limit = Math.min(indices.length, outerIdxCount);
        for (let base = 0; base + 2 < limit; base += 3) {
            const a = indices[base], b = indices[base + 1], c = indices[base + 2];
            if (a === b || b === c || a === c) continue;
            const ia = a * 3, ib = b * 3, ic = c * 3;
            const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
            const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
            const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
            const ab2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
            const bc2 = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2;
            const ca2 = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;
            const ux = bx - ax, uy = by - ay, uz = bz - az;
            const vx = cx - ax, vy = cy - ay, vz = cz - az;
            const crossX = uy * vz - uz * vy;
            const crossY = uz * vx - ux * vz;
            const crossZ = ux * vy - uy * vx;
            const area = 0.5 * Math.hypot(crossX, crossY, crossZ);
            if (area <= 1e-12) continue;
            const aspect = Math.max(ab2, bc2, ca2) * Math.sqrt(3) / (4 * area);
            if (aspect > 100) slivers++;
            if (worst.length < 8 || aspect > worst[worst.length - 1].aspect) {
                worst.push({ triangle: base / 3, aspect, vertices: [a, b, c] });
                worst.sort((left, right) => right.aspect - left.aspect);
                if (worst.length > 8) worst.length = 8;
            }
        }
        console.warn(`[QUALITY-STAGE] ${label} outerTris=${limit / 3} slivers=${slivers} worst=${JSON.stringify(worst)}`);
    } catch {
        /* diagnostics must not affect export */
    }
}

// TEMP-TAILPROBE: in-page stage tracker that SURVIVES a long synchronous block
// (unlike console, whose buffered lines are lost when the E2E caps and closes the
// page). The spec reads window.__pfStageLog after the cap to pin the hanging stage.
// REMOVE once the GothicArches export-completion hang is localized.
export function pfStageMark(name: string): void {
    try {
        const w = globalThis as unknown as TailDiagnosticsGlobal;
        (w.__pfStageLog ??= []).push(`${performance.now().toFixed(0)}ms ${name}`);
    } catch {
        /* noop */
    }
}

// TEMP-TAILPROBE: flush variant. console.warn + a macrotask yield so the line is
// delivered over CDP to Playwright BEFORE the next (possibly hanging) sync stage
// runs. The last [StageFlush] line captured therefore pins the hanging stage even
// when the main thread blocks for minutes (page.evaluate can't run during a sync
// block). REMOVE once the GothicArches export-completion hang is localized.
async function pfStageFlush(name: string): Promise<void> {
    pfStageMark(name);
    try {
        // eslint-disable-next-line no-console
        console.warn(`[StageFlush] ${performance.now().toFixed(0)}ms ${name}`);
    } catch {
        /* noop */
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export interface UvDispatchBatch {
    startVertex: number;
    vertexCount: number;
    vertices: Float32Array;
}

export interface ValidationIndexScopes {
    meshIdxCount: number;
    outerIdxCount: number;
}

export function resolveValidationIndexScopes(
    finalIndexCount: number,
    outerIdxCount: number,
): ValidationIndexScopes {
    if (finalIndexCount % 3 !== 0 || outerIdxCount % 3 !== 0) {
        throw new Error('[ParametricExport] Validation index counts must be triangle-aligned');
    }
    if (outerIdxCount < 0 || outerIdxCount > finalIndexCount) {
        throw new Error(
            `[ParametricExport] Invalid validation scopes: outerIdxCount=${outerIdxCount}, ` +
            `finalIndexCount=${finalIndexCount}`,
        );
    }

    return {
        meshIdxCount: finalIndexCount,
        outerIdxCount,
    };
}

export interface RefinedOuterStitch {
    indices: Uint32Array;
    outerIdxCount: number;
}

export function splitUvVerticesForDispatch(
    uvVertices: Float32Array,
    maxVerticesPerDispatch: number = MAX_PARAMETRIC_EVAL_VERTICES_PER_DISPATCH,
): UvDispatchBatch[] {
    if (uvVertices.length % 3 !== 0) {
        throw new Error('[ParametricExport] UV vertex buffer length must be divisible by 3');
    }

    const safeMaxVertices = Math.max(1, Math.floor(maxVerticesPerDispatch));
    const vertexCount = uvVertices.length / 3;
    const batches: UvDispatchBatch[] = [];

    for (let startVertex = 0; startVertex < vertexCount; startVertex += safeMaxVertices) {
        const endVertex = Math.min(vertexCount, startVertex + safeMaxVertices);
        batches.push({
            startVertex,
            vertexCount: endVertex - startVertex,
            vertices: uvVertices.slice(startVertex * 3, endVertex * 3),
        });
    }

    return batches;
}

export function stitchRefinedOuterIndices(
    refinedOuterIndices: Uint32Array,
    nonOuterIndices: Uint32Array,
): RefinedOuterStitch {
    const indices = new Uint32Array(refinedOuterIndices.length + nonOuterIndices.length);
    indices.set(refinedOuterIndices);
    indices.set(nonOuterIndices, refinedOuterIndices.length);

    return {
        indices,
        outerIdxCount: refinedOuterIndices.length,
    };
}

export interface PostDefectWeldTopologyRepair {
    indices: Uint32Array;
    uvs: Float32Array;
    positions: Float32Array;
    outerIdxCount: number;
    repairedEdges: number;
    repairInsertedTriangles: number;
    sameSurfaceFilledLoops: number;
    sameSurfaceInsertedTriangles: number;
    sameSurfaceInsertedVertices: number;
    branchedFilledLoops: number;
    branchedInsertedTriangles: number;
    branchedInsertedVertices: number;
    nonManifoldRepairedEdges: number;
    nonManifoldInsertedTriangles: number;
    residualRepairedEdges: number;
    residualInsertedTriangles: number;
    finalSameSurfaceFilledLoops: number;
    finalSameSurfaceInsertedTriangles: number;
    finalSameSurfaceInsertedVertices: number;
}

export interface TopologyDefectCounts {
    boundaryEdges: number;
    nonManifoldEdges: number;
    orientationMismatches: number;
}

export interface FinalDefectWeldCandidateScore extends TopologyDefectCounts {
    toleranceMm: number;
}

function finalDefectWeldCandidateTier(
    before: TopologyDefectCounts,
    candidate: FinalDefectWeldCandidateScore,
): number {
    if (candidate.boundaryEdges < before.boundaryEdges &&
        candidate.nonManifoldEdges <= before.nonManifoldEdges) {
        return 0;
    }
    if (candidate.nonManifoldEdges <= before.nonManifoldEdges) {
        return 1;
    }
    if (candidate.boundaryEdges < before.boundaryEdges) {
        return 2;
    }
    return 3;
}

function compareByFields(
    left: FinalDefectWeldCandidateScore,
    right: FinalDefectWeldCandidateScore,
    fields: readonly (keyof FinalDefectWeldCandidateScore)[],
): number {
    for (const field of fields) {
        const diff = left[field] - right[field];
        if (diff !== 0) return diff;
    }
    return 0;
}

function compareFinalDefectWeldCandidates(
    before: TopologyDefectCounts,
    left: FinalDefectWeldCandidateScore,
    right: FinalDefectWeldCandidateScore,
): number {
    const leftTier = finalDefectWeldCandidateTier(before, left);
    const rightTier = finalDefectWeldCandidateTier(before, right);
    if (leftTier !== rightTier) return leftTier - rightTier;
    if (leftTier === 0) {
        return compareByFields(left, right, [
            'boundaryEdges',
            'nonManifoldEdges',
            'orientationMismatches',
            'toleranceMm',
        ]);
    }
    return compareByFields(left, right, [
        'nonManifoldEdges',
        'boundaryEdges',
        'orientationMismatches',
        'toleranceMm',
    ]);
}

export function selectFinalDefectWeldCandidate<T extends FinalDefectWeldCandidateScore>(
    before: TopologyDefectCounts,
    candidates: readonly T[],
): T {
    if (candidates.length === 0) {
        throw new Error('selectFinalDefectWeldCandidate requires at least one candidate');
    }
    let best = candidates[0];
    for (const candidate of candidates.slice(1)) {
        if (compareFinalDefectWeldCandidates(before, candidate, best) < 0) {
            best = candidate;
        }
    }
    return best;
}

export function shouldAcceptPostDefectTopologyRepair(
    before: TopologyDefectCounts,
    after: TopologyDefectCounts,
): boolean {
    if (after.boundaryEdges > before.boundaryEdges) return false;
    if (after.nonManifoldEdges > before.nonManifoldEdges) return false;

    const hardTopologyImproved =
        after.boundaryEdges < before.boundaryEdges ||
        after.nonManifoldEdges < before.nonManifoldEdges;
    if (!hardTopologyImproved) {
        return after.orientationMismatches < before.orientationMismatches;
    }

    const orientationDelta = after.orientationMismatches - before.orientationMismatches;
    const orientationBudget = Math.max(4, Math.ceil(before.orientationMismatches * 0.001));
    return orientationDelta <= orientationBudget;
}

export function shouldAcceptWindingNormalization(
    before: TopologyDefectCounts,
    after: TopologyDefectCounts,
): boolean {
    return after.boundaryEdges === before.boundaryEdges &&
        after.nonManifoldEdges === before.nonManifoldEdges &&
        after.orientationMismatches < before.orientationMismatches;
}

export function repairPostDefectWeldTopology(
    indices: Uint32Array,
    uvs: Float32Array,
    positions: Float32Array,
    outerIdxCount: number,
    topologyWeldToleranceMm: number,
    maxRepairPasses: number = 4,
): PostDefectWeldTopologyRepair {
    let currentIndices = indices;
    let currentUvs = uvs;
    let currentPositions = positions;
    let currentOuterIdxCount = outerIdxCount;
    let repairedEdges = 0;
    let repairInsertedTriangles = 0;
    let nonManifoldRepairedEdges = 0;
    let nonManifoldInsertedTriangles = 0;
    let residualRepairedEdges = 0;
    let residualInsertedTriangles = 0;

    if (maxRepairPasses > 0 && currentOuterIdxCount > 0) {
        const repair = repairOuterWallTJunctions(
            currentIndices,
            currentUvs,
            currentOuterIdxCount,
            currentPositions,
            maxRepairPasses,
            topologyWeldToleranceMm,
        );
        if (repair.repairedEdges > 0) {
            currentIndices = repair.indices;
            currentOuterIdxCount = repair.outerIdxCount;
            repairedEdges = repair.repairedEdges;
            repairInsertedTriangles = repair.insertedTriangles;
        }
    }

    const nonManifoldTj = splitNonManifoldBoundaryTJunctions(
        currentIndices,
        currentUvs,
        currentPositions,
        topologyWeldToleranceMm,
        2,
    );
    if (nonManifoldTj.repairedEdges > 0) {
        currentIndices = nonManifoldTj.indices;
        nonManifoldRepairedEdges = nonManifoldTj.repairedEdges;
        nonManifoldInsertedTriangles = nonManifoldTj.insertedTriangles;
    }

    const sameSurfaceFill = fillSameSurfaceBoundaryLoopsWithCenters(
        currentIndices,
        currentUvs,
        currentPositions,
        topologyWeldToleranceMm,
    );
    if (sameSurfaceFill.filledLoops > 0) {
        currentIndices = sameSurfaceFill.indices;
        currentUvs = sameSurfaceFill.uvs;
            currentPositions = sameSurfaceFill.positions;
    }

    const branchedFill = fillBranchedBoundaryComponentsWithCenters(
        currentIndices,
        currentUvs,
        currentPositions,
        topologyWeldToleranceMm,
    );
    if (branchedFill.filledLoops > 0) {
        currentIndices = branchedFill.indices;
        currentUvs = branchedFill.uvs;
        currentPositions = branchedFill.positions;
    }

    const residualTj = splitResidualBoundaryTJunctions(
        currentIndices,
        currentUvs,
        currentPositions,
        topologyWeldToleranceMm,
    );
    if (residualTj.repairedEdges > 0) {
        currentIndices = residualTj.indices;
        residualRepairedEdges = residualTj.repairedEdges;
        residualInsertedTriangles = residualTj.insertedTriangles;
    }

    const finalSameSurfaceFill = fillSameSurfaceBoundaryLoopsWithCenters(
        currentIndices,
        currentUvs,
        currentPositions,
        topologyWeldToleranceMm,
    );
    if (finalSameSurfaceFill.filledLoops > 0) {
        currentIndices = finalSameSurfaceFill.indices;
        currentUvs = finalSameSurfaceFill.uvs;
        currentPositions = finalSameSurfaceFill.positions;
    }

    return {
        indices: currentIndices,
        uvs: currentUvs,
        positions: currentPositions,
        outerIdxCount: currentOuterIdxCount,
        repairedEdges,
        repairInsertedTriangles,
        sameSurfaceFilledLoops: sameSurfaceFill.filledLoops,
        sameSurfaceInsertedTriangles: sameSurfaceFill.insertedTriangles,
        sameSurfaceInsertedVertices: sameSurfaceFill.insertedVertices,
        branchedFilledLoops: branchedFill.filledLoops,
        branchedInsertedTriangles: branchedFill.insertedTriangles,
        branchedInsertedVertices: branchedFill.insertedVertices,
        nonManifoldRepairedEdges,
        nonManifoldInsertedTriangles,
        residualRepairedEdges,
        residualInsertedTriangles,
        finalSameSurfaceFilledLoops: finalSameSurfaceFill.filledLoops,
        finalSameSurfaceInsertedTriangles: finalSameSurfaceFill.insertedTriangles,
        finalSameSurfaceInsertedVertices: finalSameSurfaceFill.insertedVertices,
    };
}

export function selectSurfaceUPositionsForClosure(
    _surfaceId: number,
    outerWallU: Float32Array,
    _baseU: Float32Array,
): Float32Array {
    return outerWallU;
}

/**
 * Build per-surface T rows for export grids.
 *
 * Bottom sheets terminate at the small drain ring. With the shared outer-wall
 * U grid, tiny seam intervals at that ring paired with a full uniform radial
 * step create high-aspect wrap-cell slivers. A quadratic drain bias keeps the
 * same boundary rows but makes the final radial bands shorter near t=1.
 */
export function buildSurfaceTPositionsForQuality(
    surfaceId: number,
    segments: number,
    wallRadiusMm?: number,
    drainRadiusMm?: number,
): Float32Array {
    // The rim is an exact planar annulus between its two constrained rings.
    // Interior radial rows add no geometric fidelity and can only turn the
    // shared non-uniform U intervals into high-aspect triangles.
    if (surfaceId === 2) return new Float32Array([0, 1]);

    const safeSegments = Math.max(1, Math.floor(segments));
    const tPositions = new Float32Array(safeSegments + 1);
    const biasTowardDrain = surfaceId === 3 || surfaceId === 4;
    const canUseRadiusLadder = biasTowardDrain &&
        Number.isFinite(wallRadiusMm) &&
        Number.isFinite(drainRadiusMm) &&
        (wallRadiusMm ?? 0) > (drainRadiusMm ?? 0) &&
        (drainRadiusMm ?? 0) > 0;

    for (let j = 0; j <= safeSegments; j++) {
        const linear = j / safeSegments;
        if (canUseRadiusLadder) {
            const wallRadius = wallRadiusMm!;
            const drainRadius = drainRadiusMm!;
            const radius = wallRadius * Math.pow(drainRadius / wallRadius, linear);
            tPositions[j] = (radius - wallRadius) / (drainRadius - wallRadius);
        } else if (biasTowardDrain) {
            tPositions[j] = 1 - (1 - linear) * (1 - linear);
        } else {
            tPositions[j] = linear;
        }
    }

    tPositions[0] = 0;
    tPositions[safeSegments] = 1;
    return tPositions;
}

export function topologyWeldToleranceForExport(epsPosMm: number): number {
    return Math.min(0.001, Math.max(0.00001, epsPosMm * 0.01));
}

const DEFECT_WELD_DISCOVERY_TOLERANCE_MM = 1e-4;
const DEFECT_WELD_TOLERANCE_CANDIDATES_MM = [0.001, 0.002, 0.005, 0.01, 0.02] as const;
const STRICT_CAD_CLOSURE_TOLERANCE_CANDIDATES_MM = [
    DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
    0.0002,
    0.0005,
    0.001,
] as const;

export function validationPassForExport(report: ValidationReport): boolean {
    return report.valid || (
        report.manifold.ok &&
        report.manifold.boundaryEdges === 0 &&
        report.degenerates.ok
    );
}

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
        if (uvVertices.length === 0) {
            return new Float32Array(0);
        }

        const dispatchBatches = splitUvVerticesForDispatch(uvVertices);
        if (dispatchBatches.length > 1) {
            const output = new Float32Array(uvVertices.length);
            console.warn(
                `[ParametricExport] Eval batch split: ${(uvVertices.length / 3).toLocaleString()} vertices ` +
                `across ${dispatchBatches.length.toLocaleString()} WebGPU dispatches`,
            );

            for (const batch of dispatchBatches) {
                const batchResult = await this.evaluatePoints(
                    batch.vertices,
                    uniformBuffer,
                    styleParamBuffer,
                    dummyWrite3,
                    dummyWrite4,
                    dummyWrite7,
                    dummyWrite9,
                    dummyWrite10,
                    dummyReadOnly,
                    snapToFeatures,
                    relaxIterations,
                );
                output.set(batchResult, batch.startVertex * 3);
            }

            return output;
        }

        console.log(`[ParametricExport] Eval: relax=${relaxIterations}, snap=${snapToFeatures}`);
        console.log(`[ParametricExport]   Bind3=${dummyWrite3.label}, Bind9=${dummyWrite9.label}`);

        const vertexBytes = uvVertices.byteLength;
        const vertexCount = uvVertices.length / 3;

        const vertexBuffer = this.device.createBuffer({
            size: vertexBytes,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
            label: 'Parametric_EvalVerts'
        });
        this.device.queue.writeBuffer(
            vertexBuffer,
            0,
            uvVertices.buffer as ArrayBuffer,
            uvVertices.byteOffset,
            uvVertices.byteLength,
        );

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
        const workgroups = Math.ceil(vertexCount / PARAMETRIC_EVAL_WORKGROUP_SIZE);
        if (workgroups > WEBGPU_MAX_WORKGROUPS_PER_DISPATCH) {
            throw new Error(
                `[ParametricExport] Workgroup count ${workgroups} exceeds WebGPU limit ` +
                `${WEBGPU_MAX_WORKGROUPS_PER_DISPATCH}. Evaluation batching failed.`,
            );
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
        const toleranceFeasibility = assessToleranceFeasibility({
            dimensions: params.dimensions,
            tolerances: effectiveTolerances,
            targetTriangles: params.targetTriangles ?? targetTris,
            explicitToleranceRequest: Object.keys(params.toleranceOverrides ?? {}).length > 0,
        });
        if (!toleranceFeasibility.ok) {
            throw new Error(
                '[ParametricExport] Cannot satisfy requested export tolerance: ' +
                toleranceFeasibility.errors.join('; '),
            );
        }
        for (const warning of toleranceFeasibility.warnings) {
            console.warn(`[ParametricExport] Tolerance preflight: ${warning}`);
        }
        const flags = resolveFeatureFlags(params.pipelineFeatureFlags);
        validateFeatureFlags(flags);

        // By-construction watertight assembly (periodic seam + shared rings + verifier
        // tail). Flag-gated; legacy repair-battery path when false. The e2e probes force
        // it on via window.__pfByConstruction without changing the default.
        const byConstructionAssembly = Boolean(flags.byConstructionAssembly)
            || Boolean((globalThis as unknown as { __pfByConstruction?: boolean }).__pfByConstruction);
        if (byConstructionAssembly) {
            console.warn('[ParametricExport] by-construction assembly ENABLED (periodic seam + shared rings + verifier tail)');
        }

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
        const cfgDebugDiagnostics = pc?.debugDiagnostics ?? false;

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

            // ── Step 3.5: ANALYTIC RIDGE PLACEMENT (CPU Newton) ──
            // Replaces the previous two-stage GPU re-snap (R49 P1) with Newton
            // iteration on the CPU style function. Each chain vertex is placed
            // exactly on the analytic feature ridge (|∂r/∂u| → 0 to FD-noise
            // floor, ~1e-7 mm/U) rather than at the nearest probe-sample point.
            //
            // Pre-fix baseline (parametric.precision.audit.test.ts, 2026-05-24):
            //   max |∂r/∂u| across 864 phantom-anchor positions:
            //     HarmonicRipple   535 mm/U
            //     SpiralRidges     753 mm/U
            //     WaveInterference  74 mm/U
            //   100% of positions exceeded the 1e-9 target.
            //
            // After this fix: < 1e-6 mm/U across all measured positions.
            //
            // The gating flag is preserved so this can be disabled for
            // back-to-back A/B comparisons.
            //
            // See docs/superpowers/plans/2026-05-24-analytic-ridge-placement.md
            // for the full architecture rationale, CPU↔WGSL parity considerations,
            // and the follow-on plan for chord-error-bounded subdivision.
            if (chains.length > 0 && cfgGpuResnap) {
                const arpStart = performance.now();

                // Collect chain points into GPU Newton seeds. Half-width is
                // tightly bounded (max 0.001 U = 0.1% of circumference) because
                // the chain detector's output is already on-ridge to ~3e-4 U;
                // larger windows let Newton migrate to neighbouring ridges on
                // styles with rich substructure (SuperformulaBlossom, etc).
                const arpSeeds: GpuRidgeSeed[] = [];
                const arpRefs: Array<{ chainIdx: number; ptIdx: number; oldU: number; row: number }> = [];

                for (let ci = 0; ci < chains.length; ci++) {
                    const kind: 'peak' | 'valley' = chains[ci].kind === 'valley' ? 'valley' : 'peak';
                    for (let pi = 0; pi < chains[ci].points.length; pi++) {
                        const pt = chains[ci].points[pi];
                        const tVal = tPositions[Math.min(pt.row, tPositions.length - 1)];

                        // Adaptive search half-width based on nearest same-kind
                        // feature in this row, capped at 0.001 (1.5–4× the
                        // chain detector's typical maxConsecDelta).
                        const rowFeatures = allRowTypedFeatures[Math.min(pt.row, allRowTypedFeatures.length - 1)];
                        let nearestDist = Infinity;
                        if (rowFeatures) {
                            for (const feat of rowFeatures) {
                                if (feat.kind !== kind) continue;
                                const dist = circularDistance(pt.u, feat.u);
                                if (dist > 1e-6 && dist < nearestDist) nearestDist = dist;
                            }
                        }
                        const NARROW_HW = 2.0 / ROW_PROBE_SAMPLES;
                        const hw = Math.max(NARROW_HW, Math.min(nearestDist / 4.0, 0.001));

                        arpSeeds.push({ u: pt.u, t: tVal, kind, halfWidth: hw });
                        arpRefs.push({ chainIdx: ci, ptIdx: pi, oldU: pt.u, row: pt.row });
                    }
                }

                // Build an async evaluator that closes over the GPU pipeline
                // state. Each Newton iteration is ONE GPU dispatch evaluating
                // 5N probes (4th-order central-difference stencil).
                const arpEvaluator = (verts: Float32Array) => this.evaluatePoints(
                    verts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                );
                const arpResults = await gpuNewtonRidge(arpSeeds, arpEvaluator, {
                    maxIter: 12,
                    tolerance: 0.5,   // ~8× f32 FD-noise floor at h=1e-4 (~0.06 mm/U)
                    fdStep: 1e-4,
                });

                // Apply results — strictly safe: a refinement is only accepted if
                //   1. Newton actually converged (gradAbs at the result is small), AND
                //   2. the move is at most SAFE_MOVE_LIMIT.
                //
                // The chain detector's output is already on-ridge to ~3e-4 mm/U
                // (per production-log maxLinearDev). A "refinement" that wants to
                // move a chain vertex by 0.015 U is NOT a refinement — it's the
                // solver chain-jumping to a neighbouring ridge because Newton
                // hit its search-halfWidth cap without converging. Applying such
                // moves destroys chain coherence (rows N and N+1 land on
                // different ridges; mesh tessellation produces sliver/spike
                // triangles where chain edges cross column boundaries).
                //
                // For non-convergence or oversize moves, KEEP THE ORIGINAL
                // chain-detector U position. The chain detector's GPU re-snap
                // already gave us sub-millimetre precision; analytic Newton is
                // an optional refinement, never a replacement.
                const GRAD_ACCEPT_THRESHOLD = 1.0;  // mm/U — accept Newton converged or near-converged
                                                    // (f32 FD noise floor at h=1e-4 is ~0.06 mm/U)
                const SAFE_MOVE_LIMIT = 0.001;      // U — never move more than 0.1% of circumference
                let arpRefined = 0, arpAlreadyCorrect = 0;
                let arpRejectedNonConv = 0, arpRejectedOversize = 0;
                let arpMaxMoved = 0, arpMaxGrad = 0, arpMaxAcceptedGrad = 0;
                for (let i = 0; i < arpResults.length; i++) {
                    const r = arpResults[i];
                    const ref = arpRefs[i];
                    const moved = circularDistance(ref.oldU, r.u);
                    if (r.gradAbs > arpMaxGrad) arpMaxGrad = r.gradAbs;

                    if (r.gradAbs > GRAD_ACCEPT_THRESHOLD) {
                        arpRejectedNonConv++;
                        continue;
                    }
                    if (moved > SAFE_MOVE_LIMIT) {
                        arpRejectedOversize++;
                        continue;
                    }
                    if (moved > 1e-9) {
                        chains[ref.chainIdx].points[ref.ptIdx] = { row: ref.row, u: r.u };
                        arpRefined++;
                        if (moved > arpMaxMoved) arpMaxMoved = moved;
                        if (r.gradAbs > arpMaxAcceptedGrad) arpMaxAcceptedGrad = r.gradAbs;
                    } else {
                        arpAlreadyCorrect++;
                    }
                }
                const arpElapsed = performance.now() - arpStart;

                console.log(
                    `[ParametricExport]   AnalyticRidge re-snap: ${arpRefined}/${arpResults.length} refined, ` +
                    `already-correct=${arpAlreadyCorrect}, ` +
                    `rejected non-converged=${arpRejectedNonConv}, oversize=${arpRejectedOversize}, ` +
                    `max moved=${arpMaxMoved.toFixed(6)}, max |∂r/∂u|=${arpMaxGrad.toExponential(3)} mm/U ` +
                    `(accepted: ${arpMaxAcceptedGrad.toExponential(3)}), time=${arpElapsed.toFixed(1)}ms`,
                );
            }
            // ── End AnalyticRidge re-snap ──
            // Legacy two-stage GPU re-snap (kept for reference; disabled by default).
            // To re-enable for A/B testing, replace the `false` below with `cfgGpuResnap`
            // AND disable the AnalyticRidge block above.
            const enableLegacyGpuResnap = false;
            if (enableLegacyGpuResnap && chains.length > 0 && cfgGpuResnap) {
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
                    console.warn(`[StageProbe] pre-CDT elapsed-since-gridStart=${(performance.now() - gridStart).toFixed(0)}ms`);
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
                            // WATERTIGHT-FIX (Task #16): R56 row-edge quality companions add a
                            // balancing vertex to a chain cell's row edge that the abutting
                            // STANDARD cell never receives → a horizontal T-junction crack on
                            // every chain/standard row boundary. Measured: this is 71% (183K of
                            // 258K) of the base-mesh non-watertight edges that hang the export.
                            // Companions are quality-only (sliver avoidance), not correctness;
                            // disabling restores row-boundary watertightness by construction.
                            rowEdgeQualityCompanions: false,
                            // WATERTIGHT-FIX (Task #22): base-gen u-seam closure (periodicSeamU)
                            // MEASURED net-negative — the manifold-safe zipper is clean at
                            // base-gen (−519 boundary, 0 new non-manifold) but refinement's
                            // canonical position-weld amplifies the added closure triangles into
                            // +31 final non-manifold. Disabled; the proven PeriodicSeamClosure
                            // module is retained for a post-refinement (tail) application instead.
                            periodicSeamU: false,
                        },
                    );
                    recordOuterWallTriangleProbe(cdtResult);
                    recordOuterWallSourceTopology('outer-cdt', cdtResult);

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
                    const surfaceU = selectSurfaceUPositionsForClosure(surf.id, unionU, uBasePositions);
                    const nonOuterW = surfaceU.length;
                    const h = Math.max(2, Math.round(surfBudget / (2 * nonOuterW)));
                    const surfaceWallRadius = surf.id === 4
                        ? Math.max(dimensions.rDrain + 0.5, dimensions.Rb - dimensions.tWall)
                        : dimensions.Rb;
                    const surfT = buildSurfaceTPositionsForQuality(
                        surf.id,
                        h,
                        surfaceWallRadius,
                        dimensions.rDrain,
                    );
                    const grid = generateAdaptiveGrid(surfaceU, surfT, surf.id, surf.invertWinding);

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
            let combinedVerts: Float32Array<ArrayBufferLike> = new Float32Array(totalVerts);
            let combinedIdxs: Uint32Array<ArrayBufferLike> = new Uint32Array(totalIdxs);
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
            // TEMP-STAGE-PROBE A: grid built. REMOVE.
            console.warn(`[StageProbe] A grid-built: verts=${vertexCount} tris=${triangleCount} gridMs=${gridMs.toFixed(0)} targetTris=${targetTris} targetOuterBudget=${targetOuterBudget} numTRows=${numTRows} unionU=${unionU.length} maxOuterColumns=${maxOuterColumns}`);
            console.warn(`[StageProbe] A surfaceStats: ${surfaceStats.join(' | ')}`);
            {
                const cptCounts = meshChains.map(c => c.points.length).sort((a, b) => a - b);
                const cpt = cptCounts.reduce((s, n) => s + n, 0);
                const med = cptCounts[Math.floor(cptCounts.length / 2)] ?? 0;
                const singles = cptCounts.filter(n => n <= 2).length;
                const kinds: Record<string, number> = {};
                for (const c of meshChains) kinds[c.kind ?? 'undef'] = (kinds[c.kind ?? 'undef'] ?? 0) + 1;
                console.warn(`[StageProbe] A chains: count=${meshChains.length} totalPts=${cpt} avgPts=${(cpt / Math.max(1, meshChains.length)).toFixed(1)} medianPts=${med} maxPts=${cptCounts[cptCounts.length - 1] ?? 0} chainsWith<=2pts=${singles} kinds=${JSON.stringify(kinds)}`);
            }

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
                let interpProtected = 0;
                let interpOvershoot = 0;
                let interpUnbracketed = 0;
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
                    const accept = shouldAcceptSampledResnapCandidate({
                        currentU,
                        finalU,
                        bestK,
                        candidateCount: cands,
                        maxDelta: MAX_INTERP_DELTA,
                        protectedVertex: outerProtectedStripVertices?.has(iv.vertexIdx) ?? false,
                    });
                    if (accept.accept) {
                        combinedVerts[iv.vertexIdx * 3] = finalU;
                        interpResnapCount++;
                    } else if (accept.reason === 'protected') {
                        interpProtected++;
                    } else if (accept.reason === 'already-correct') {
                        interpAlreadyCorrect++;
                    } else if (accept.reason === 'unbracketed') {
                        interpUnbracketed++;
                    } else if (accept.reason === 'oversize') {
                        interpOvershoot++;
                        if (moved > maxOvershootMoved) maxOvershootMoved = moved;
                    }

                    probeOffset += cands;
                }

                const avgWindow = interpVertCount > 0 ? (totalWindowUsed / interpVertCount) : 0;
                console.log(`[ParametricExport]   R46 interp re-snap: ${interpResnapCount}/${interpVertCount} refined, protected=${interpProtected}, already-correct=${interpAlreadyCorrect}, unbracketed=${interpUnbracketed}, overshoot=${interpOvershoot} (max=${maxOvershootMoved.toFixed(6)}) (avg window=${avgWindow.toFixed(6)}, max window=${maxWindowUsed.toFixed(6)})`);
            }

            // ── ANALYTIC RIDGE PLACEMENT for R37 phantom column-crossing anchors ──
            // Each phantom anchor was placed at a linearly interpolated UV midpoint
            // between two adjacent-row chain vertices. Even though those endpoints
            // are now exact (Phase 3), the linear midpoint is OFF the analytic ridge
            // wherever the feature curves in (u, t) space.
            //
            // Pre-fix baseline measurement (Phase 0 audit, 2026-05-24):
            //   max |∂r/∂u| at phantom anchor midpoints, HarmonicRipple = 2.4e-3 mm/U
            //                                            SpiralRidges  = 1.9e-2 mm/U
            //                                            WaveInterference = 1.2e+0 mm/U
            //   Distribution scan (864 positions/style): 100% exceeded 1e-9 target,
            //   max = 535 / 753 / 73.8 mm/U respectively.
            //
            // After this fix: < 1e-6 mm/U at every anchor.
            //
            // See docs/superpowers/plans/2026-05-24-analytic-ridge-placement.md.
            if (outerPhantomChainAnchors.length > 0 && cfgGpuResnap) {
                const arpPhStart = performance.now();
                const arpPhSeeds: GpuRidgeSeed[] = [];
                const arpPhRefs: Array<{ vertexIdx: number; oldU: number; tCross: number }> = [];

                for (const pa of outerPhantomChainAnchors) {
                    const parentChain = meshChains[pa.chainId];
                    const kind: 'peak' | 'valley' = parentChain?.kind === 'valley' ? 'valley' : 'peak';
                    const currentU = combinedVerts[pa.vertexIdx * 3];
                    // Phantom anchors are at linear-interpolation midpoints
                    // between adjacent-row chain vertices; allow a slightly
                    // wider window than row-boundary chains to absorb the
                    // interpolation drift while still preventing migration.
                    arpPhSeeds.push({ u: currentU, t: pa.tCross, kind, halfWidth: 0.003 });
                    arpPhRefs.push({ vertexIdx: pa.vertexIdx, oldU: currentU, tCross: pa.tCross });
                }

                const arpPhEvaluator = (verts: Float32Array) => this.evaluatePoints(
                    verts, uniformBuffer, styleParamBuffer,
                    dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                );
                const arpPhResults = await gpuNewtonRidge(arpPhSeeds, arpPhEvaluator, {
                    maxIter: 12,
                    tolerance: 1e-3,
                    fdStep: 1e-4,
                });

                // Same strict acceptance criteria as the row-boundary re-snap:
                // only apply Newton's result if (a) it actually converged and
                // (b) the displacement is small. Phantom anchors are at
                // linearly-interpolated UV midpoints; the original GPU re-snap
                // (Bug #1) capped moves at MAX_PHANTOM_DELTA = 0.04 mm, which
                // we tighten further here. Non-converged or oversize results
                // leave the linearly-interpolated U in place — that's at least
                // as good as the pre-Bug#1 baseline, never worse.
                const PH_GRAD_ACCEPT_THRESHOLD = 1.0;  // mm/U — matches Phase 3
                const PH_SAFE_MOVE_LIMIT = 0.003;      // U — matches Newton halfWidth
                const PH_MIN_SAME_ROW_SEPARATION = 0.00005;
                const arpPhAnchorVertexSet = new Set(outerPhantomChainAnchors.map(anchor => anchor.vertexIdx));
                const arpPhCandidates: PhantomAnchorResnapCandidate[] = arpPhResults.map((r, i) => ({
                        vertexIdx: arpPhRefs[i].vertexIdx,
                        currentU: arpPhRefs[i].oldU,
                        finalU: ((r.u % 1) + 1) % 1,
                        t: arpPhRefs[i].tCross,
                        gradAbs: r.gradAbs,
                        gradThreshold: PH_GRAD_ACCEPT_THRESHOLD,
                        maxDelta: PH_SAFE_MOVE_LIMIT,
                        minSeparation: PH_MIN_SAME_ROW_SEPARATION,
                }));
                if (outerProtectedStripVertices) {
                    for (const vertexIdx of outerProtectedStripVertices) {
                        if (arpPhAnchorVertexSet.has(vertexIdx)) continue;
                        const u = combinedVerts[vertexIdx * 3];
                        const t = combinedVerts[vertexIdx * 3 + 1];
                        arpPhCandidates.push({
                            vertexIdx,
                            currentU: u,
                            finalU: u,
                            t,
                            gradAbs: 0,
                            gradThreshold: PH_GRAD_ACCEPT_THRESHOLD,
                            maxDelta: PH_SAFE_MOVE_LIMIT,
                            minSeparation: PH_MIN_SAME_ROW_SEPARATION,
                        });
                    }
                }
                const arpPhDecisions = classifyPhantomAnchorResnapCandidates(arpPhCandidates);
                let arpPhRefined = 0, arpPhAlreadyCorrect = 0;
                let arpPhRejectedNonConv = 0, arpPhRejectedOversize = 0, arpPhRejectedNearDuplicate = 0;
                let arpPhMaxMoved = 0, arpPhMaxGrad = 0, arpPhMaxAcceptedGrad = 0;
                for (let i = 0; i < arpPhResults.length; i++) {
                    const r = arpPhResults[i];
                    const ref = arpPhRefs[i];
                    const finalU = ((r.u % 1) + 1) % 1;
                    const moved = circularDistance(ref.oldU, finalU);
                    if (r.gradAbs > arpPhMaxGrad) arpPhMaxGrad = r.gradAbs;

                    const decision = arpPhDecisions[i];
                    if (decision.reason === 'non-converged') {
                        arpPhRejectedNonConv++;
                        continue;
                    }
                    if (decision.reason === 'oversize') {
                        arpPhRejectedOversize++;
                        continue;
                    }
                    if (decision.reason === 'near-duplicate') {
                        arpPhRejectedNearDuplicate++;
                        continue;
                    }
                    if (decision.reason === 'accepted') {
                        combinedVerts[ref.vertexIdx * 3] = finalU;
                        arpPhRefined++;
                        if (moved > arpPhMaxMoved) arpPhMaxMoved = moved;
                        if (r.gradAbs > arpPhMaxAcceptedGrad) arpPhMaxAcceptedGrad = r.gradAbs;
                    } else {
                        arpPhAlreadyCorrect++;
                    }
                }
                const arpPhElapsed = performance.now() - arpPhStart;
                console.log(
                    `[ParametricExport]   AnalyticRidge phantom re-snap: ${arpPhRefined}/${arpPhResults.length} refined, ` +
                    `already-correct=${arpPhAlreadyCorrect}, ` +
                    `rejected non-converged=${arpPhRejectedNonConv}, oversize=${arpPhRejectedOversize}, near-duplicate=${arpPhRejectedNearDuplicate}, ` +
                    `max moved=${arpPhMaxMoved.toFixed(6)}, max |∂r/∂u|=${arpPhMaxGrad.toExponential(3)} mm/U ` +
                    `(accepted: ${arpPhMaxAcceptedGrad.toExponential(3)}), time=${arpPhElapsed.toFixed(1)}ms`,
                );
            }
            // ── End AnalyticRidge phantom re-snap ──
            // Legacy GPU phantom re-snap (kept for A/B testing reference; disabled).
            const enableLegacyPhantomGpuResnap = false;
            if (enableLegacyPhantomGpuResnap && outerPhantomChainAnchors.length > 0 && cfgGpuResnap) {
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
            console.warn(`[StageProbe] B before full-grid eval: verts=${combinedVerts.length / 3} relax=${relaxIterations}`);
            let resultData = await this.evaluatePoints(
                combinedVerts, uniformBuffer, styleParamBuffer,
                dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                false, // Snap disabled â€" union grid has dedicated feature columns
                relaxIterations
            );
            console.warn(`[StageProbe] C full-grid eval done`);

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

            let csResult = { phaseAFlips: 0, phaseBFlips: 0, phaseCFlips: 0, chainStripTriCount: 0, timeMs: 0, rowSpanRejects: 0, edgeLenRejects: 0, aspectRejects: 0, valenceBonusFlips: 0, maxSingleRowTSpan: 0, chainGridFlips: 0, chainGridFlipsAllowed: 0, chainSliverRescueFlips: 0, nonQuadSliverFlips: 0, valenceStats: { before: { total: 0, low: 0, ideal: 0, high: 0 }, after: { total: 0, low: 0, ideal: 0, high: 0 } } };
            if (cfgStripOptimizer) {
                csResult = optimizeChainStrips({
                    combinedIdxs,
                    positions: resultData,
                    combinedVerts,
                    constraintEdgeSet,
                    outerGridVertexCount,
                    outerIdxCount,
                    finalT,
                    quadMap: outerQuadMap!,
                    chainAdjacentVertices: outerChainAdjacentVertices,
                    protectedVertices: outerProtectedStripVertices,
                });
                console.log(`[ParametricExport]   v16.31 chain-strip 3D edge flip: ${csResult.phaseAFlips}+${csResult.phaseBFlips}+${csResult.phaseCFlips} flips (angle+valence+shortDiag), sliverRescue=${csResult.chainSliverRescueFlips}, nonQuadSliver=${csResult.nonQuadSliverFlips} on ${csResult.chainStripTriCount} chain-strip tris (${csResult.timeMs.toFixed(1)}ms)`);
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
            console.warn(`[StageProbe] Phase4 quality block: flip3DMs=${flip3DMs.toFixed(0)} chainStripMs=${csResult.timeMs.toFixed(0)} boundaryDiagMs=${bdResult.timeMs.toFixed(0)} (chainFlips=${chainFlips} genericFlips=${genericFlips} csFlips=${csResult.phaseAFlips + csResult.phaseBFlips + csResult.phaseCFlips} sliverRescue=${csResult.chainSliverRescueFlips} nonQuadSliver=${csResult.nonQuadSliverFlips})`);

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
            let finalResultData: Float32Array<ArrayBufferLike>;
            let finalCombinedIdxs: Uint32Array<ArrayBufferLike>;
            let splitCount = 0;
            let outerIdxCountAfterSubdiv = allIdxArrays[0].length;
            recordOuterWallQualityStage('post-phase4-pre-subdiv', resultData, combinedIdxs, allIdxArrays[0].length);
            if (cfgGpuSubdiv) {
                console.warn(`[StageProbe] D before subdivideLongEdges: verts=${combinedVerts.length / 3} tris=${combinedIdxs.length / 3}`);
                // TEMP-NONCONFORM-PROBE: canonical (position-welded) boundary/non-manifold
                // edge counts on the outer wall, BEFORE and AFTER subdivideLongEdges, to
                // localize whether the ~258K boundary edges come in from CDT/chain assembly
                // or are injected by subdivision. console.warn survives the __pfStageLog reset.
                const __canonBoundaryProbe = (label: string, pos: Float32Array, idx: Uint32Array, outerCount: number): void => {
                    const tol = topologyWeldToleranceForExport(effectiveTolerances.epsPosMm);
                    const inv = tol > 0 ? 1 / tol : 0;
                    const q = (x: number): number => (inv > 0 ? Math.round(x * inv) : x);
                    const numV = (pos.length / 3) | 0;
                    const canon = new Map<string, number>();
                    const cid = new Int32Array(numV);
                    let next = 0;
                    for (let v = 0; v < numV; v++) {
                        const k = `${q(pos[v * 3])}:${q(pos[v * 3 + 1])}:${q(pos[v * 3 + 2])}`;
                        let id = canon.get(k);
                        if (id === undefined) { id = next++; canon.set(k, id); }
                        cid[v] = id;
                    }
                    const STRIDE = 0x4000000;
                    const ecount = new Map<number, number>();
                    const addE = (a: number, b: number): void => {
                        if (a === b) return;
                        const lo = a < b ? a : b, hi = a < b ? b : a;
                        const key = lo * STRIDE + hi;
                        ecount.set(key, (ecount.get(key) ?? 0) + 1);
                    };
                    const lim = Math.min(outerCount, idx.length);
                    for (let t = 0; t + 2 < lim; t += 3) {
                        const a = cid[idx[t]], b = cid[idx[t + 1]], c = cid[idx[t + 2]];
                        addE(a, b); addE(b, c); addE(c, a);
                    }
                    let boundary = 0, nonManifold = 0;
                    for (const cnt of ecount.values()) {
                        if (cnt === 1) boundary++;
                        else if (cnt >= 3) nonManifold++;
                    }
                    console.warn(`[SUBDIV-CANON] ${label} outerTris=${lim / 3} canonVerts=${next}/${numV} boundaryEdges=${boundary} nonManifoldEdges=${nonManifold}`);
                };
                __canonBoundaryProbe('PRE-SUBDIV', resultData, combinedIdxs, allIdxArrays[0].length);
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
                        epsPosMm: effectiveTolerances.epsPosMm,
                    },
                    (uvBatch) => this.evaluatePoints(
                        uvBatch, uniformBuffer, styleParamBuffer,
                        dummyWrite3, dummyWrite4, dummyWrite7, dummyWrite9, dummyWrite10, dummyReadOnly,
                        false, 0
                    ),
                );
                finalResultData = subdivResult.resultData;
                combinedVerts = subdivResult.uvs;
                finalCombinedIdxs = subdivResult.indices;
                splitCount = subdivResult.splitCount;
                outerIdxCountAfterSubdiv = subdivResult.outerIdxCount;
                console.warn(`[StageProbe] E subdiv done: splitCount=${splitCount} newVerts=${combinedVerts.length / 3} subdivMs=${subdivResult.stats.timeMs.toFixed(0)} sagSkipped=${subdivResult.stats.sagSkipped}`);
                __canonBoundaryProbe('POST-SUBDIV', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);
                recordOuterWallQualityStage('post-subdiv-raw', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);
                console.log(`[ParametricExport]   v18.0 GPU-surface subdivision: ${splitCount} edges split → ${splitCount * 2} new tris, ${subdivResult.stats.sagSkipped} sag-skipped (${subdivResult.stats.timeMs.toFixed(1)}ms)`);
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

            // ── R48 H': Ridge-distance diagnostic ── (debug-only: ~20M-vert GPU eval, logs only)
            if (cfgDebugDiagnostics && meshChains.length > 0 && outerChainVertexChainIds.size > 0) {
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
            if (cfgDebugDiagnostics) {
                const bndDiag = computeBoundaryDiagnostic({
                    indices: finalCombinedIdxs,
                    positions: finalResultData,
                    outerIdxCount: outerIdxCountAfterSubdiv,
                    outerGridVertexCount,
                });
                console.log(`[ParametricExport]   v16.33 boundary diagnostic: ${bndDiag.boundaryEdgeCount} boundary edges`);
                console.log(`[ParametricExport]     dihedral dot(n0,n1): avg=${bndDiag.dihedralAvg.toFixed(4)}, min=${bndDiag.dihedralMin.toFixed(4)}, max=${bndDiag.dihedralMax.toFixed(4)}`);
            }

            // meshDiag is consumed downstream (adaptiveStats), so always compute it;
            // only its diagnostic logging is debug-gated.
            const meshDiag = computeMeshDiagnostics({
                finalIndices: finalCombinedIdxs,
                finalPositions: finalResultData,
                combinedVerts,
                outerIdxCountAfterSubdiv,
                origVertCount: vertexCount,
                maxSingleRowTSpan: csResult.maxSingleRowTSpan,
                numU: outerW,
                numT: outerH,
                gridVertexCount: outerGridVertexCount,
            });
            if (cfgDebugDiagnostics) {
                console.log(`[ParametricExport]   v16.31 diagnostics:`);
                console.log(`[ParametricExport]     cross-row tris: 2-row=${meshDiag.crossRow1}, 3-row=${meshDiag.crossRow2}, 4+row=${meshDiag.crossRow3plus}`);
                console.log(`[ParametricExport]     aspect ratios: >5=${meshDiag.aspectOver5}, >10=${meshDiag.aspectOver10}, >20=${meshDiag.aspectOver20}`);
                console.log(`[ParametricExport]     low valence: val=3: ${meshDiag.val3} (boundary=${meshDiag.val3Boundary}, interior=${meshDiag.val3Interior}, chain=${meshDiag.val3Chain}), val=4: ${meshDiag.val4}, val=5: ${meshDiag.val5}`);

                // B5: Chain-strip-specific 3D quality report (post-GPU)
                const cs3D = computeChainStrip3DQuality({
                    indices: finalCombinedIdxs,
                    positions: finalResultData,
                    outerGridVertexCount,
                    outerIdxCount: outerIdxCountAfterSubdiv,
                });
                if (cs3D.triCount > 0) {
                    const minAngleDeg = (cs3D.minAngle * 180 / Math.PI).toFixed(1);
                    const violationPct = (100 * cs3D.aspectOver4 / cs3D.triCount).toFixed(1);
                    console.log(`[ParametricExport]   v25.0 chain-strip 3D quality: ${cs3D.triCount} tris, min_angle=${minAngleDeg}°, max_aspect=${cs3D.maxAspect.toFixed(1)}:1, avg_aspect=${cs3D.avgAspect.toFixed(1)}:1, violations(>4:1)=${cs3D.aspectOver4}/${cs3D.triCount} (${violationPct}%)`);
                    console.log(`[ParametricExport]     grading: max_area_ratio=${cs3D.maxAreaRatio.toFixed(1)}:1, grading_violations(>2:1)=${cs3D.gradingViolations}`);
                }
            }

            // ═══════════════════════════════════════════════════════
            // PHASE 5: Adaptive Refinement (flag-gated)
            //
            // When the quality profile requests refinement iterations > 0,
            // run error-driven adaptive triangle splitting to bring
            // chord error and normal error within profile tolerances.
            // ═══════════════════════════════════════════════════════
            let refinementSummary: RefinementSummary | undefined;

            // TEMP-STAGE-PROBE: localize whether the stall is in base-gen or refinement. REMOVE.
            console.warn(`[StageProbe] base-gen DONE: outerIdxCount=${outerIdxCountAfterSubdiv} ` +
                `combinedTris=${finalCombinedIdxs.length / 3} maxRefineIterations=${effectiveProfile.maxRefineIterations}`);
            recordOuterWallQualityStage('base-gen-pre-adaptive', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);
            // TEMP-TAILPROBE: reset per parametric-generate and mark base-gen end. REMOVE.
            try { (globalThis as unknown as TailDiagnosticsGlobal).__pfStageLog = []; } catch { /* noop */ }
            resetTailDiagnostics();
            {
                // Count zero-area outer triangles: |edge0 × edge1| < 1e-12 is exactly the
                // triangleNormal() degenerate threshold that yields the 90.00° normal error.
                let zeroAreaOuter = 0;
                for (let t = 0; t < outerIdxCountAfterSubdiv; t += 3) {
                    const a = finalCombinedIdxs[t], b = finalCombinedIdxs[t + 1], c = finalCombinedIdxs[t + 2];
                    const ax = finalResultData[a * 3], ay = finalResultData[a * 3 + 1], az = finalResultData[a * 3 + 2];
                    const bx = finalResultData[b * 3], by = finalResultData[b * 3 + 1], bz = finalResultData[b * 3 + 2];
                    const cx = finalResultData[c * 3], cy = finalResultData[c * 3 + 1], cz = finalResultData[c * 3 + 2];
                    const ux = bx - ax, uy = by - ay, uz = bz - az;
                    const vx = cx - ax, vy = cy - ay, vz = cz - az;
                    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                    if (Math.sqrt(nx * nx + ny * ny + nz * nz) < 1e-12) zeroAreaOuter++;
                }
                pfStageMark(`base-gen-done tris=${finalCombinedIdxs.length / 3} outerTris=${outerIdxCountAfterSubdiv / 3} zeroAreaOuter=${zeroAreaOuter}`);
            }

            if (effectiveProfile.maxRefineIterations > 0) {
                const refineStart = performance.now();
                console.warn('[StageProbe] entering adaptiveRefine');

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

                // TEMP-NONCONFORM-PROBE: count CANONICAL boundary edges (count===1 in
                // geometry-welded space) on the outer wall ENTERING refinement. Compare
                // to the post-refinement "TJ ENTRY" count to localize whether the 387K
                // hanging nodes pre-exist (base-mesh assembly) or are created by refinement.
                {
                    const tol = topologyWeldToleranceForExport(effectiveTolerances.epsPosMm);
                    const inv = tol > 0 ? 1 / tol : 0;
                    const q = (x: number): number => (inv > 0 ? Math.round(x * inv) : x);
                    const numV = (outerPositions.length / 3) | 0;
                    const canon = new Map<string, number>();
                    const cid = new Int32Array(numV);
                    // representative position per canonical id (first occurrence)
                    const repX: number[] = [], repY: number[] = [], repZ: number[] = [];
                    // TEMP-SPATIAL: representative (u,t) per canonical id for spatial attribution
                    const repU: number[] = [], repV: number[] = [];
                    let next = 0;
                    for (let v = 0; v < numV; v++) {
                        const px = outerPositions[v * 3], py = outerPositions[v * 3 + 1], pz = outerPositions[v * 3 + 2];
                        const k = `${q(px)}:${q(py)}:${q(pz)}`;
                        let id = canon.get(k);
                        if (id === undefined) {
                            id = next++; canon.set(k, id); repX.push(px); repY.push(py); repZ.push(pz);
                            repU.push(outerUVs[v * 3]); repV.push(outerUVs[v * 3 + 1]);
                        }
                        cid[v] = id;
                    }
                    const STRIDE = 0x4000000;
                    const ecount = new Map<number, number>();
                    const addE = (a: number, b: number): void => {
                        if (a === b) return;
                        const lo = a < b ? a : b, hi = a < b ? b : a;
                        const key = lo * STRIDE + hi;
                        ecount.set(key, (ecount.get(key) ?? 0) + 1);
                    };
                    for (let t = 0; t + 2 < outerIndices.length; t += 3) {
                        const a = cid[outerIndices[t]], b = cid[outerIndices[t + 1]], c = cid[outerIndices[t + 2]];
                        addE(a, b); addE(b, c); addE(c, a);
                    }
                    // Collect boundary edges (count===1) and the boundary-vertex set.
                    const bEdges: number[] = []; // packed lo*STRIDE+hi
                    const isBoundaryVert = new Uint8Array(next);
                    let boundary = 0, nonManifold = 0;
                    for (const [key, cnt] of ecount) {
                        if (cnt === 1) {
                            boundary++; bEdges.push(key);
                            const lo = Math.floor(key / STRIDE), hi = key - lo * STRIDE;
                            isBoundaryVert[lo] = 1; isBoundaryVert[hi] = 1;
                        } else if (cnt >= 3) nonManifold++;
                    }
                    // Average boundary-edge length → spatial-hash cell size.
                    let sumLen = 0;
                    for (const key of bEdges) {
                        const lo = Math.floor(key / STRIDE), hi = key - lo * STRIDE;
                        const dx = repX[hi] - repX[lo], dy = repY[hi] - repY[lo], dz = repZ[hi] - repZ[lo];
                        sumLen += Math.sqrt(dx * dx + dy * dy + dz * dz);
                    }
                    const avgLen = bEdges.length > 0 ? sumLen / bEdges.length : 1;
                    const cs = Math.max(avgLen, tol > 0 ? tol * 4 : 1e-3);
                    const invCs = 1 / cs;
                    // Spatial hash of boundary vertices by representative position.
                    const cellKey = (x: number, y: number, z: number): string =>
                        `${Math.floor(x * invCs)}|${Math.floor(y * invCs)}|${Math.floor(z * invCs)}`;
                    const grid = new Map<string, number[]>();
                    for (let id = 0; id < next; id++) {
                        if (!isBoundaryVert[id]) continue;
                        const ck = cellKey(repX[id], repY[id], repZ[id]);
                        let arr = grid.get(ck); if (!arr) { arr = []; grid.set(ck, arr); } arr.push(id);
                    }
                    // Classify each boundary edge: T-junction if a DISTINCT boundary vertex
                    // lies collinear-interior on it (within tol perpendicular, param in (eps,1-eps)).
                    const distTol = tol > 0 ? tol * 2 : 1e-4;
                    const distTol2 = distTol * distTol;
                    const tEps = 0.01;
                    const stamp = new Int32Array(next).fill(-1);
                    const relFrac2 = 0.15 * 0.15; // relaxed: perp < 15% of edge length
                    let tjTight = 0, tjRelaxed = 0, holeRelaxed = 0, multiTjEdges = 0;
                    let edgeEpoch = 0;
                    for (const key of bEdges) {
                        const A = Math.floor(key / STRIDE), B = key - A * STRIDE;
                        const ax = repX[A], ay = repY[A], az = repZ[A];
                        const dx = repX[B] - ax, dy = repY[B] - ay, dz = repZ[B] - az;
                        const len2 = dx * dx + dy * dy + dz * dz;
                        if (len2 <= 0) { holeRelaxed++; continue; }
                        const relTol2 = relFrac2 * len2;
                        const steps = Math.min(256, Math.max(1, Math.ceil(Math.sqrt(len2) * invCs)));
                        const epoch = edgeEpoch++;
                        let foundTight = 0, foundRelaxed = 0;
                        for (let s = 0; s <= steps; s++) {
                            const f = s / steps;
                            const ck = cellKey(ax + dx * f, ay + dy * f, az + dz * f);
                            const arr = grid.get(ck);
                            if (!arr) continue;
                            for (const M of arr) {
                                if (M === A || M === B || stamp[M] === epoch) continue;
                                stamp[M] = epoch;
                                const wx = repX[M] - ax, wy = repY[M] - ay, wz = repZ[M] - az;
                                const t = (wx * dx + wy * dy + wz * dz) / len2;
                                if (t <= tEps || t >= 1 - tEps) continue;
                                const perp2 = (wx * wx + wy * wy + wz * wz) - t * t * len2;
                                if (perp2 <= distTol2) foundTight++;
                                if (perp2 <= relTol2) foundRelaxed++;
                            }
                        }
                        if (foundTight > 0) { tjTight++; if (foundTight > 1) multiTjEdges++; }
                        if (foundRelaxed > 0) tjRelaxed++; else holeRelaxed++;
                    }
                    pfStageMark(`PRE-REFINE-CANON outerTris=${outerIndices.length / 3} canonVerts=${next}/${numV} boundaryEdges=${boundary} nonManifoldEdges=${nonManifold}`);
                    pfStageMark(`BOUNDARY-CLASS tjTight=${tjTight} tjRelaxed=${tjRelaxed} holeRelaxed=${holeRelaxed} multiTjEdges=${multiTjEdges} avgBLen=${avgLen.toFixed(3)}mm cs=${cs.toFixed(3)}mm tol=${tol.toFixed(4)}mm`);

                    // ── TEMP-SPATIAL: bucket boundary edges by (u,t) geometry ──
                    // Determines WHICH cell-emit path leaks: vertical edges => column
                    // (cross-cell horizontal-neighbour) boundary; horizontal edges => row
                    // (vertical-neighbour) boundary; seam => u-wrap left/right border;
                    // diagonal => chain-edge / interior. Boundary-vertex U-range frames seam.
                    {
                        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
                        for (let id = 0; id < next; id++) {
                            if (repU[id] < uMin) uMin = repU[id];
                            if (repU[id] > uMax) uMax = repU[id];
                            if (repV[id] < vMin) vMin = repV[id];
                            if (repV[id] > vMax) vMax = repV[id];
                        }
                        const uRange = Math.max(1e-9, uMax - uMin);
                        const vRange = Math.max(1e-9, vMax - vMin);
                        const seamBand = 0.02 * uRange;
                        let vertical = 0, horizontal = 0, diagonal = 0;
                        let seamVertical = 0, vertNearChainU = 0;
                        let vertTop = 0, vertMid = 0, vertBot = 0;
                        for (const key of bEdges) {
                            const A = Math.floor(key / STRIDE), B = key - A * STRIDE;
                            let du = Math.abs(repU[A] - repU[B]);
                            // wrap (u domain is circular over uRange)
                            if (du > uRange * 0.5) du = uRange - du;
                            const dv = Math.abs(repV[A] - repV[B]);
                            const duN = du / uRange, dvN = dv / vRange;
                            if (duN < 0.1 * dvN) {
                                vertical++;
                                const uA = repU[A];
                                const nearSeam = (uA - uMin) < seamBand || (uMax - uA) < seamBand
                                    || (repU[B] - uMin) < seamBand || (uMax - repU[B]) < seamBand;
                                if (nearSeam) seamVertical++;
                                const vMidN = ((repV[A] + repV[B]) * 0.5 - vMin) / vRange;
                                if (vMidN > 0.66) vertTop++; else if (vMidN < 0.33) vertBot++; else vertMid++;
                            } else if (dvN < 0.1 * duN) {
                                horizontal++;
                            } else {
                                diagonal++;
                            }
                        }
                        void vertNearChainU;
                        pfStageMark(`SPATIAL-CLASS vertical=${vertical} horizontal=${horizontal} diagonal=${diagonal} seamVertical=${seamVertical} (vertTop=${vertTop} vertMid=${vertMid} vertBot=${vertBot}) uRange=${uRange.toFixed(4)} vRange=${vRange.toFixed(4)}`);
                    }
                }

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
                    maxTriangles: Math.max(targetTris, REFINEMENT_TRIANGLE_SAFETY_CAP),
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
                const stitched = stitchRefinedOuterIndices(refineResult.indices, nonOuterIndices);
                finalCombinedIdxs = stitched.indices;
                outerIdxCountAfterSubdiv = stitched.outerIdxCount;
                await pfStageFlush(`refine-returned stop=${refineResult.stopReason} iters=${refineResult.iterationsPerformed} tris=${finalCombinedIdxs.length / 3}`);

                // TEMP-POSTREFINE-CANON: measure canonical boundary/non-manifold edges on the
                // refined outer wall to quantify how much adaptiveRefine amplifies the base
                // mesh's coincident-edge defects (compare to PRE-REFINE-CANON above).
                {
                    const tol = topologyWeldToleranceForExport(effectiveTolerances.epsPosMm);
                    const inv = tol > 0 ? 1 / tol : 0;
                    const q = (x: number): number => (inv > 0 ? Math.round(x * inv) : x);
                    const numV = (finalResultData.length / 3) | 0;
                    const canon = new Map<string, number>();
                    const cid = new Int32Array(numV);
                    let next = 0;
                    for (let v = 0; v < numV; v++) {
                        const k = `${q(finalResultData[v * 3])}:${q(finalResultData[v * 3 + 1])}:${q(finalResultData[v * 3 + 2])}`;
                        let id = canon.get(k);
                        if (id === undefined) { id = next++; canon.set(k, id); }
                        cid[v] = id;
                    }
                    const STRIDE = 0x4000000;
                    const ecount = new Map<number, number>();
                    const addE = (a: number, b: number): void => {
                        if (a === b) return;
                        const lo = a < b ? a : b, hi = a < b ? b : a;
                        const key = lo * STRIDE + hi;
                        ecount.set(key, (ecount.get(key) ?? 0) + 1);
                    };
                    const oc = outerIdxCountAfterSubdiv;
                    for (let t = 0; t + 2 < oc; t += 3) {
                        const a = cid[finalCombinedIdxs[t]], b = cid[finalCombinedIdxs[t + 1]], c = cid[finalCombinedIdxs[t + 2]];
                        addE(a, b); addE(b, c); addE(c, a);
                    }
                    let boundary = 0, nonManifold = 0;
                    for (const cnt of ecount.values()) {
                        if (cnt === 1) boundary++; else if (cnt >= 3) nonManifold++;
                    }
                    console.warn(`[POST-REFINE-CANON] outerTris=${oc / 3} canonVerts=${next}/${numV} boundaryEdges=${boundary} nonManifoldEdges=${nonManifold}`);
                }

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
            recordOuterWallQualityStage('post-adaptive-refine', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);

            // ═══════════════════════════════════════════════════════
            // PHASE 5b: Seam Healing (flag-gated)
            //
            // When seamHealing flag is enabled, average col0/colLast
            // vertex positions to close the periodic seam gap.
            // ═══════════════════════════════════════════════════════
            await pfStageFlush('tail:before-seamHealing');
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
            recordOuterWallQualityStage('tail-post-seam-healing', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);

            // ═══════════════════════════════════════════════════════
            // PHASE 5c: Strip degenerate placeholder triangles
            //
            // Multiple earlier stages emit (0,0,0) placeholder triangles
            // for degenerate cases: UV-collinear standard cells, Batch 6
            // dedup collapses, sweepRepair nullification. Strip them now
            // so validation and STL export see only real geometry.
            // ═══════════════════════════════════════════════════════
            await pfStageFlush('tail:before-phase5c-index-degen-strip');
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

            await pfStageFlush(`tail:before-repairOuterWallTJunctions#1 tris=${finalCombinedIdxs.length / 3}`);
            recordWindingStageDiagnostic('before-tail-repairs', finalCombinedIdxs, finalResultData);
            const tJunctionRepairTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const tJunctionRepairOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const tJunctionRepairStart = performance.now();
            const tJunctionRepair = repairOuterWallTJunctions(
                finalCombinedIdxs,
                combinedVerts,
                outerIdxCountAfterSubdiv,
                finalResultData,
                12,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'repairOuterWallTJunctions#1',
                elapsedMs: performance.now() - tJunctionRepairStart,
                trianglesBefore: tJunctionRepairTrisBefore,
                trianglesAfter: indexCountToTriangleCount(tJunctionRepair.indices.length),
                outerTrianglesBefore: tJunctionRepairOuterTrisBefore,
                outerTrianglesAfter: indexCountToTriangleCount(tJunctionRepair.outerIdxCount),
                details: {
                    repairedEdges: tJunctionRepair.repairedEdges,
                    insertedTriangles: tJunctionRepair.insertedTriangles,
                },
            });
            if (tJunctionRepair.repairedEdges > 0) {
                finalCombinedIdxs = tJunctionRepair.indices;
                outerIdxCountAfterSubdiv = tJunctionRepair.outerIdxCount;
                console.log(
                    `[ParametricExport]   Boundary T-junction repair: ` +
                    `${tJunctionRepair.repairedEdges} edges split, ` +
                    `${tJunctionRepair.insertedTriangles} tris inserted`,
                );
            }
            recordOuterWallQualityStage('tail-post-outer-tjunction-repair', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);
            recordWindingStageDiagnostic('after-repairOuterWallTJunctions#1', finalCombinedIdxs, finalResultData);

            await pfStageFlush('tail:before-repairSurfaceBoundaryTJunctions');
            const surfaceBoundaryRepairTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const surfaceBoundaryRepairOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const surfaceBoundaryRepairStart = performance.now();
            const surfaceBoundaryRepair = repairSurfaceBoundaryTJunctions(
                finalCombinedIdxs,
                combinedVerts,
            );
            recordTailDiagnosticStage({
                name: 'repairSurfaceBoundaryTJunctions',
                elapsedMs: performance.now() - surfaceBoundaryRepairStart,
                trianglesBefore: surfaceBoundaryRepairTrisBefore,
                trianglesAfter: indexCountToTriangleCount(surfaceBoundaryRepair.indices.length),
                outerTrianglesBefore: surfaceBoundaryRepairOuterTrisBefore,
                outerTrianglesAfter: surfaceBoundaryRepairOuterTrisBefore,
                details: {
                    repairedEdges: surfaceBoundaryRepair.repairedEdges,
                    insertedTriangles: surfaceBoundaryRepair.insertedTriangles,
                },
            });
            if (surfaceBoundaryRepair.repairedEdges > 0) {
                finalCombinedIdxs = surfaceBoundaryRepair.indices;
                console.log(
                    `[ParametricExport]   Surface boundary repair: ` +
                    `${surfaceBoundaryRepair.repairedEdges} edges split, ` +
                    `${surfaceBoundaryRepair.insertedTriangles} tris inserted`,
                );
            }
            recordWindingStageDiagnostic('after-repairSurfaceBoundaryTJunctions', finalCombinedIdxs, finalResultData);

            await pfStageFlush('tail:before-fillOuterWallBoundaryLoops');
            const outerLoopIndices = finalCombinedIdxs.slice(0, outerIdxCountAfterSubdiv);
            const nonOuterLoopIndices = finalCombinedIdxs.slice(outerIdxCountAfterSubdiv);
            const boundaryLoopFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const boundaryLoopFillOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const boundaryLoopFillStart = performance.now();
            const boundaryLoopFill = fillOuterWallBoundaryLoops(
                outerLoopIndices,
                combinedVerts,
                finalResultData,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'fillOuterWallBoundaryLoops',
                elapsedMs: performance.now() - boundaryLoopFillStart,
                trianglesBefore: boundaryLoopFillTrisBefore,
                trianglesAfter: indexCountToTriangleCount(boundaryLoopFill.indices.length + nonOuterLoopIndices.length),
                outerTrianglesBefore: boundaryLoopFillOuterTrisBefore,
                outerTrianglesAfter: indexCountToTriangleCount(boundaryLoopFill.indices.length),
                details: {
                    filledLoops: boundaryLoopFill.filledLoops,
                    insertedTriangles: boundaryLoopFill.insertedTriangles,
                    attemptedLoops: boundaryLoopFill.attemptedLoops,
                    emptyTriangulations: boundaryLoopFill.emptyTriangulations,
                    unsafeLoops: boundaryLoopFill.unsafeLoops,
                    projectedTriangulations: boundaryLoopFill.projectedTriangulations,
                },
            });
            if (boundaryLoopFill.filledLoops > 0) {
                const stitched = new Uint32Array(boundaryLoopFill.indices.length + nonOuterLoopIndices.length);
                stitched.set(boundaryLoopFill.indices);
                stitched.set(nonOuterLoopIndices, boundaryLoopFill.indices.length);
                finalCombinedIdxs = stitched;
                outerIdxCountAfterSubdiv = boundaryLoopFill.indices.length;
                console.log(
                    `[ParametricExport]   Boundary loop fill: ` +
                    `${boundaryLoopFill.filledLoops} loops filled, ` +
                    `${boundaryLoopFill.insertedTriangles} tris inserted`,
                );
            } else if ((boundaryLoopFill.attemptedLoops ?? 0) > 0) {
                console.warn(
                    `[ParametricExport]   Boundary loop fill skipped: ` +
                    `${boundaryLoopFill.attemptedLoops} loops attempted, ` +
                    `${boundaryLoopFill.emptyTriangulations ?? 0} empty triangulations, ` +
                    `${boundaryLoopFill.unsafeLoops ?? 0} unsafe caps, ` +
                    `${boundaryLoopFill.projectedTriangulations ?? 0} projected`,
                );
            }
            recordWindingStageDiagnostic('after-fillOuterWallBoundaryLoops', finalCombinedIdxs, finalResultData);

            await pfStageFlush('tail:before-postLoopTJunctionRepair');
            const postLoopTJunctionRepairTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const postLoopTJunctionRepairOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const postLoopTJunctionRepairStart = performance.now();
            const postLoopTJunctionRepair = repairOuterWallTJunctions(
                finalCombinedIdxs,
                combinedVerts,
                outerIdxCountAfterSubdiv,
                finalResultData,
                12,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'repairOuterWallTJunctions#postLoop',
                elapsedMs: performance.now() - postLoopTJunctionRepairStart,
                trianglesBefore: postLoopTJunctionRepairTrisBefore,
                trianglesAfter: indexCountToTriangleCount(postLoopTJunctionRepair.indices.length),
                outerTrianglesBefore: postLoopTJunctionRepairOuterTrisBefore,
                outerTrianglesAfter: indexCountToTriangleCount(postLoopTJunctionRepair.outerIdxCount),
                details: {
                    repairedEdges: postLoopTJunctionRepair.repairedEdges,
                    insertedTriangles: postLoopTJunctionRepair.insertedTriangles,
                },
            });
            if (postLoopTJunctionRepair.repairedEdges > 0) {
                finalCombinedIdxs = postLoopTJunctionRepair.indices;
                outerIdxCountAfterSubdiv = postLoopTJunctionRepair.outerIdxCount;
                console.log(
                    `[ParametricExport]   Post-fill boundary T-junction repair: ` +
                    `${postLoopTJunctionRepair.repairedEdges} edges split, ` +
                    `${postLoopTJunctionRepair.insertedTriangles} tris inserted`,
                );
            }
            recordWindingStageDiagnostic('after-postLoopTJunctionRepair', finalCombinedIdxs, finalResultData);

            await pfStageFlush('tail:before-fillSameSurfaceBoundaryLoops');
            const sameSurfaceLoopFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const sameSurfaceLoopFillOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const sameSurfaceLoopFillStart = performance.now();
            const sameSurfaceLoopFill = fillSameSurfaceBoundaryLoops(
                finalCombinedIdxs,
                combinedVerts,
                finalResultData,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'fillSameSurfaceBoundaryLoops',
                elapsedMs: performance.now() - sameSurfaceLoopFillStart,
                trianglesBefore: sameSurfaceLoopFillTrisBefore,
                trianglesAfter: indexCountToTriangleCount(sameSurfaceLoopFill.indices.length),
                outerTrianglesBefore: sameSurfaceLoopFillOuterTrisBefore,
                outerTrianglesAfter: sameSurfaceLoopFillOuterTrisBefore,
                details: {
                    filledLoops: sameSurfaceLoopFill.filledLoops,
                    insertedTriangles: sameSurfaceLoopFill.insertedTriangles,
                    attemptedLoops: sameSurfaceLoopFill.attemptedLoops,
                    emptyTriangulations: sameSurfaceLoopFill.emptyTriangulations,
                    unsafeLoops: sameSurfaceLoopFill.unsafeLoops,
                    projectedTriangulations: sameSurfaceLoopFill.projectedTriangulations,
                },
            });
            if (sameSurfaceLoopFill.filledLoops > 0) {
                finalCombinedIdxs = sameSurfaceLoopFill.indices;
                console.log(
                    `[ParametricExport]   Same-surface loop fill: ` +
                    `${sameSurfaceLoopFill.filledLoops} loops filled, ` +
                    `${sameSurfaceLoopFill.insertedTriangles} tris inserted`,
                );
            } else if ((sameSurfaceLoopFill.attemptedLoops ?? 0) > 0) {
                console.warn(
                    `[ParametricExport]   Same-surface loop fill skipped: ` +
                    `${sameSurfaceLoopFill.attemptedLoops} loops attempted, ` +
                    `${sameSurfaceLoopFill.emptyTriangulations ?? 0} empty triangulations, ` +
                    `${sameSurfaceLoopFill.unsafeLoops ?? 0} unsafe caps, ` +
                    `${sameSurfaceLoopFill.projectedTriangulations ?? 0} projected`,
                );
            }
            recordWindingStageDiagnostic('after-fillSameSurfaceBoundaryLoops', finalCombinedIdxs, finalResultData);

            await pfStageFlush('tail:before-fillSameSurfaceBoundaryLoopsWithCenters');
            const sameSurfaceCenterFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const sameSurfaceCenterFillOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const sameSurfaceCenterFillStart = performance.now();
            const sameSurfaceCenterFill = fillSameSurfaceBoundaryLoopsWithCenters(
                finalCombinedIdxs,
                combinedVerts,
                finalResultData,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            console.warn(`[TAILPROBE] fillSameSurfaceBoundaryLoopsWithCenters RETURNED elapsed=${(performance.now() - sameSurfaceCenterFillStart).toFixed(0)}ms tris=${sameSurfaceCenterFill.indices.length / 3}`);
            recordTailDiagnosticStage({
                name: 'fillSameSurfaceBoundaryLoopsWithCenters',
                elapsedMs: performance.now() - sameSurfaceCenterFillStart,
                trianglesBefore: sameSurfaceCenterFillTrisBefore,
                trianglesAfter: indexCountToTriangleCount(sameSurfaceCenterFill.indices.length),
                outerTrianglesBefore: sameSurfaceCenterFillOuterTrisBefore,
                outerTrianglesAfter: sameSurfaceCenterFillOuterTrisBefore,
                details: {
                    filledLoops: sameSurfaceCenterFill.filledLoops,
                    insertedTriangles: sameSurfaceCenterFill.insertedTriangles,
                    insertedVertices: sameSurfaceCenterFill.insertedVertices,
                    attemptedLoops: sameSurfaceCenterFill.attemptedLoops,
                    emptyTriangulations: sameSurfaceCenterFill.emptyTriangulations,
                    unsafeLoops: sameSurfaceCenterFill.unsafeLoops,
                    projectedTriangulations: sameSurfaceCenterFill.projectedTriangulations,
                },
            });
            if (sameSurfaceCenterFill.filledLoops > 0) {
                finalCombinedIdxs = sameSurfaceCenterFill.indices;
                combinedVerts = sameSurfaceCenterFill.uvs;
                finalResultData = sameSurfaceCenterFill.positions;
                console.log(
                    `[ParametricExport]   Same-surface center loop fill: ` +
                    `${sameSurfaceCenterFill.filledLoops} loops filled, ` +
                    `${sameSurfaceCenterFill.insertedTriangles} tris inserted, ` +
                    `${sameSurfaceCenterFill.insertedVertices} vertices inserted`,
                );
            } else if ((sameSurfaceCenterFill.attemptedLoops ?? 0) > 0) {
                console.warn(
                    `[ParametricExport]   Same-surface center loop fill skipped: ` +
                    `${sameSurfaceCenterFill.attemptedLoops} loops attempted, ` +
                    `${sameSurfaceCenterFill.emptyTriangulations ?? 0} empty triangulations, ` +
                    `${sameSurfaceCenterFill.unsafeLoops ?? 0} unsafe caps, ` +
                    `${sameSurfaceCenterFill.insertedVertices} trial vertices`,
                );
            }
            recordOuterWallQualityStage('tail-post-same-surface-center-fill', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);
            recordWindingStageDiagnostic('after-fillSameSurfaceBoundaryLoopsWithCenters', finalCombinedIdxs, finalResultData);

            await pfStageFlush('tail:before-fillOuterWallSeamBoundaryChains');
            const seamChainFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const seamChainFillOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const seamChainFillStart = performance.now();
            const seamChainFill = fillOuterWallSeamBoundaryChains(
                finalCombinedIdxs,
                combinedVerts,
                finalResultData,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'fillOuterWallSeamBoundaryChains',
                elapsedMs: performance.now() - seamChainFillStart,
                trianglesBefore: seamChainFillTrisBefore,
                trianglesAfter: indexCountToTriangleCount(seamChainFill.indices.length),
                outerTrianglesBefore: seamChainFillOuterTrisBefore,
                outerTrianglesAfter: seamChainFillOuterTrisBefore,
                details: {
                    filledChains: seamChainFill.filledChains,
                    insertedTriangles: seamChainFill.insertedTriangles,
                    weldedVertices: seamChainFill.weldedVertices,
                    attemptedChains: seamChainFill.attemptedChains,
                    unsafeChains: seamChainFill.unsafeChains,
                    lowVertices: seamChainFill.lowVertices,
                    highVertices: seamChainFill.highVertices,
                },
            });
            if (!byConstructionAssembly && seamChainFill.filledChains > 0) {
                finalCombinedIdxs = seamChainFill.indices;
                console.log(
                    `[ParametricExport]   Seam boundary chain fill: ` +
                    `${seamChainFill.filledChains} chains filled, ` +
                    `${seamChainFill.insertedTriangles} tris inserted` +
                    ((seamChainFill.weldedVertices ?? 0) > 0
                        ? `, ${seamChainFill.weldedVertices} seam vertices welded`
                        : ''),
                );
            } else if ((seamChainFill.lowVertices ?? 0) > 0 || (seamChainFill.highVertices ?? 0) > 0) {
                console.warn(
                    `[ParametricExport]   Seam boundary chain fill skipped: ` +
                    `${seamChainFill.attemptedChains ?? 0} chains attempted, ` +
                    `${seamChainFill.unsafeChains ?? 0} unsafe, ` +
                    `low=${seamChainFill.lowVertices ?? 0}, high=${seamChainFill.highVertices ?? 0}`,
                );
            }
            recordWindingStageDiagnostic('after-fillOuterWallSeamBoundaryChains', finalCombinedIdxs, finalResultData);

            // Post-refinement periodic seam closure. The half-open u-grid never emits
            // the wrap cell (last col u≈0.999 → col 0 u=0), and refinement subdivided the
            // last column densely while the wrap rail stayed coarse — leaving the dominant
            // s0:tmid seam boundary residual. buildPeriodicSeamClosure is provably
            // non-regressive (incidence-gated, rail-anchored), so it can only ADD
            // manifold-safe triangles. The [SEAM-CLOSURE] diagnostic also reveals the
            // low(u=0)/high(u≈1) boundary split that the t-classified boundary diagnostic
            // cannot show — telling us whether the residual is a true wrap gap or a
            // within-high density mismatch.
            await pfStageFlush('tail:before-periodicSeamClosure');
            const periodicSeamStart = performance.now();
            const periodicSeamTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const periodicSeam = buildPeriodicSeamClosure(finalCombinedIdxs, combinedVerts, {
                positions: finalResultData,
                weldToleranceMm: topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            });
            if (periodicSeam.triangles.length > 0) {
                const merged = new Uint32Array(finalCombinedIdxs.length + periodicSeam.triangles.length);
                merged.set(finalCombinedIdxs, 0);
                merged.set(periodicSeam.triangles, finalCombinedIdxs.length);
                finalCombinedIdxs = merged;
            }
            recordTailDiagnosticStage({
                name: 'periodicSeamClosure',
                elapsedMs: performance.now() - periodicSeamStart,
                trianglesBefore: periodicSeamTrisBefore,
                trianglesAfter: indexCountToTriangleCount(finalCombinedIdxs.length),
                outerTrianglesBefore: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                outerTrianglesAfter: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                details: {
                    lowSeamEdges: periodicSeam.lowSeamEdges,
                    highSeamEdges: periodicSeam.highSeamEdges,
                    closedLowEdges: periodicSeam.closedLowEdges,
                    closedHighEdges: periodicSeam.closedHighEdges,
                    skippedUnsafe: periodicSeam.skippedUnsafe,
                    insertedTriangles: periodicSeam.triangles.length / 3,
                },
            });
            console.warn(
                `[SEAM-CLOSURE] lowSeamEdges=${periodicSeam.lowSeamEdges} ` +
                `highSeamEdges=${periodicSeam.highSeamEdges} ` +
                `closedLow=${periodicSeam.closedLowEdges} closedHigh=${periodicSeam.closedHighEdges} ` +
                `skipped=${periodicSeam.skippedUnsafe} ` +
                `addedTris=${periodicSeam.triangles.length / 3}`,
            );

            await pfStageFlush('tail:before-fillGeometricBoundaryLoops');
            const geometricLoopFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const geometricLoopFillOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const geometricLoopFillStart = performance.now();
            const geometricLoopFill = fillGeometricBoundaryLoops(
                finalCombinedIdxs,
                combinedVerts,
                finalResultData,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'fillGeometricBoundaryLoops',
                elapsedMs: performance.now() - geometricLoopFillStart,
                trianglesBefore: geometricLoopFillTrisBefore,
                trianglesAfter: indexCountToTriangleCount(geometricLoopFill.indices.length),
                outerTrianglesBefore: geometricLoopFillOuterTrisBefore,
                outerTrianglesAfter: geometricLoopFillOuterTrisBefore,
                details: {
                    filledLoops: geometricLoopFill.filledLoops,
                    insertedTriangles: geometricLoopFill.insertedTriangles,
                    attemptedLoops: geometricLoopFill.attemptedLoops,
                    emptyTriangulations: geometricLoopFill.emptyTriangulations,
                    unsafeLoops: geometricLoopFill.unsafeLoops,
                    projectedTriangulations: geometricLoopFill.projectedTriangulations,
                },
            });
            if (geometricLoopFill.filledLoops > 0) {
                finalCombinedIdxs = geometricLoopFill.indices;
                console.log(
                    `[ParametricExport]   Geometric loop fill: ` +
                    `${geometricLoopFill.filledLoops} loops filled, ` +
                    `${geometricLoopFill.insertedTriangles} tris inserted`,
                );
            } else if ((geometricLoopFill.attemptedLoops ?? 0) > 0) {
                console.warn(
                    `[ParametricExport]   Geometric loop fill skipped: ` +
                    `${geometricLoopFill.attemptedLoops} loops attempted, ` +
                    `${geometricLoopFill.emptyTriangulations ?? 0} empty triangulations, ` +
                    `${geometricLoopFill.unsafeLoops ?? 0} unsafe caps, ` +
                    `${geometricLoopFill.projectedTriangulations ?? 0} projected`,
                );
            }

            await pfStageFlush('tail:before-fillCrossSurfaceConstantTBoundaryLoopsWithCenters');
            const crossSurfaceLoopFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const crossSurfaceLoopFillOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const crossSurfaceLoopFillStart = performance.now();
            const crossSurfaceLoopFill = fillCrossSurfaceConstantTBoundaryLoopsWithCenters(
                finalCombinedIdxs,
                combinedVerts,
                finalResultData,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'fillCrossSurfaceConstantTBoundaryLoopsWithCenters',
                elapsedMs: performance.now() - crossSurfaceLoopFillStart,
                trianglesBefore: crossSurfaceLoopFillTrisBefore,
                trianglesAfter: indexCountToTriangleCount(crossSurfaceLoopFill.indices.length),
                outerTrianglesBefore: crossSurfaceLoopFillOuterTrisBefore,
                outerTrianglesAfter: crossSurfaceLoopFillOuterTrisBefore,
                details: {
                    filledLoops: crossSurfaceLoopFill.filledLoops,
                    insertedTriangles: crossSurfaceLoopFill.insertedTriangles,
                    insertedVertices: crossSurfaceLoopFill.insertedVertices,
                    attemptedLoops: crossSurfaceLoopFill.attemptedLoops,
                    emptyTriangulations: crossSurfaceLoopFill.emptyTriangulations,
                    unsafeLoops: crossSurfaceLoopFill.unsafeLoops,
                },
            });
            if (crossSurfaceLoopFill.filledLoops > 0) {
                finalCombinedIdxs = crossSurfaceLoopFill.indices;
                combinedVerts = crossSurfaceLoopFill.uvs;
                finalResultData = crossSurfaceLoopFill.positions;
                console.log(
                    `[ParametricExport]   Cross-surface constant-t loop fill: ` +
                    `${crossSurfaceLoopFill.filledLoops} loops filled, ` +
                    `${crossSurfaceLoopFill.insertedTriangles} tris inserted, ` +
                    `${crossSurfaceLoopFill.insertedVertices} vertices inserted`,
                );
            } else if ((crossSurfaceLoopFill.attemptedLoops ?? 0) > 0) {
                console.warn(
                    `[ParametricExport]   Cross-surface constant-t loop fill skipped: ` +
                    `${crossSurfaceLoopFill.attemptedLoops} loops attempted, ` +
                    `${crossSurfaceLoopFill.emptyTriangulations ?? 0} incomplete loops, ` +
                    `${crossSurfaceLoopFill.unsafeLoops ?? 0} unsafe caps`,
                );
            }
            recordWindingStageDiagnostic('after-fillCrossSurfaceConstantTBoundaryLoopsWithCenters', finalCombinedIdxs, finalResultData);

            // Final closer: branched boundary components (holes that touch at a
            // shared junction vertex). The simple-loop fillers above can only
            // trace degree-2 loops and structurally skip every component with a
            // degree-3+ junction — the dominant residual on feature-dense walls
            // (measured: ~87% of leftover boundary edges are branched s0:tmid
            // holes). This decomposes those components into edge-disjoint cycles
            // and centre-fans each, manifold-guarded so nothing it adds can
            // create a non-manifold edge.
            await pfStageFlush('tail:before-fillBranchedBoundaryComponentsWithCenters');
            const branchedFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const branchedFillOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const branchedFillStart = performance.now();
            const branchedFill = fillBranchedBoundaryComponentsWithCenters(
                finalCombinedIdxs,
                combinedVerts,
                finalResultData,
                topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
            );
            recordTailDiagnosticStage({
                name: 'fillBranchedBoundaryComponentsWithCenters',
                elapsedMs: performance.now() - branchedFillStart,
                trianglesBefore: branchedFillTrisBefore,
                trianglesAfter: indexCountToTriangleCount(branchedFill.indices.length),
                outerTrianglesBefore: branchedFillOuterTrisBefore,
                outerTrianglesAfter: branchedFillOuterTrisBefore,
                details: {
                    filledLoops: branchedFill.filledLoops,
                    insertedTriangles: branchedFill.insertedTriangles,
                    insertedVertices: branchedFill.insertedVertices,
                    attemptedLoops: branchedFill.attemptedLoops,
                    emptyTriangulations: branchedFill.emptyTriangulations,
                    unsafeLoops: branchedFill.unsafeLoops,
                },
            });
            if (branchedFill.filledLoops > 0) {
                finalCombinedIdxs = branchedFill.indices;
                combinedVerts = branchedFill.uvs;
                finalResultData = branchedFill.positions;
                console.log(
                    `[ParametricExport]   Branched boundary fill: ` +
                    `${branchedFill.filledLoops} cycles filled, ` +
                    `${branchedFill.insertedTriangles} tris inserted, ` +
                    `${branchedFill.insertedVertices} vertices inserted`,
                );
            } else if ((branchedFill.attemptedLoops ?? 0) > 0) {
                console.warn(
                    `[ParametricExport]   Branched boundary fill skipped: ` +
                    `${branchedFill.attemptedLoops} cycles attempted, ` +
                    `${branchedFill.emptyTriangulations ?? 0} empty triangulations, ` +
                    `${branchedFill.unsafeLoops ?? 0} unsafe caps`,
                );
            }
            recordOuterWallQualityStage('tail-post-branched-fill', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);

            // Final surface-agnostic boundary T-junction closer: splits residual
            // density-mismatch boundary edges (e.g. the outer-wall top row vs the rim,
            // the same physical ring at different column densities) at the vertices
            // lying on them, in raw 3D, after the whole fill battery. Owner-consistent
            // winding + manifold-safe, so it adds no flips and no non-manifold edges.
            await pfStageFlush(`tail:before-splitResidualBoundaryTJunctions tris=${finalCombinedIdxs.length / 3}`);
            {
                const residualTjStart = performance.now();
                const residualTjTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
                const residualTj = splitResidualBoundaryTJunctions(
                    finalCombinedIdxs,
                    combinedVerts,
                    finalResultData,
                    topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
                );
                recordTailDiagnosticStage({
                    name: 'splitResidualBoundaryTJunctions',
                    elapsedMs: performance.now() - residualTjStart,
                    trianglesBefore: residualTjTrisBefore,
                    trianglesAfter: indexCountToTriangleCount(residualTj.indices.length),
                    outerTrianglesBefore: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    outerTrianglesAfter: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    details: {
                        repairedEdges: residualTj.repairedEdges,
                        insertedTriangles: residualTj.insertedTriangles,
                    },
                });
                if (residualTj.repairedEdges > 0) {
                    finalCombinedIdxs = residualTj.indices;
                    console.log(
                        `[ParametricExport]   Residual boundary T-junction split: ` +
                        `${residualTj.repairedEdges} edges split, ` +
                        `${residualTj.insertedTriangles} tris inserted`,
                    );
                }
            }

            // Final cross-surface loop closure: the T-junction split above can leave
            // small CROSS-SURFACE closed loops at the rim ring (the tiny gaps where the
            // refined outer-wall row, s0, and the unionU rim, s2, meet imperfectly at
            // t=1). The earlier cross-surface filler ran before the split and never saw
            // them; the geometric/same-surface fillers reject cross-surface loops. Re-run
            // the cross-surface constant-t filler here (owner-opposite, manifold-safe).
            await pfStageFlush(`tail:before-finalCrossSurfaceLoopFill tris=${finalCombinedIdxs.length / 3}`);
            {
                const finalXFillStart = performance.now();
                const finalXFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
                const finalXFill = fillCrossSurfaceConstantTBoundaryLoopsWithCenters(
                    finalCombinedIdxs,
                    combinedVerts,
                    finalResultData,
                    topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
                );
                recordTailDiagnosticStage({
                    name: 'finalCrossSurfaceLoopFill',
                    elapsedMs: performance.now() - finalXFillStart,
                    trianglesBefore: finalXFillTrisBefore,
                    trianglesAfter: indexCountToTriangleCount(finalXFill.indices.length),
                    outerTrianglesBefore: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    outerTrianglesAfter: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    details: {
                        filledLoops: finalXFill.filledLoops,
                        insertedTriangles: finalXFill.insertedTriangles,
                        insertedVertices: finalXFill.insertedVertices,
                        attemptedLoops: finalXFill.attemptedLoops,
                        emptyTriangulations: finalXFill.emptyTriangulations,
                        unsafeLoops: finalXFill.unsafeLoops,
                    },
                });
                if (finalXFill.filledLoops > 0) {
                    finalCombinedIdxs = finalXFill.indices;
                    combinedVerts = finalXFill.uvs;
                    finalResultData = finalXFill.positions;
                    console.log(
                        `[ParametricExport]   Final cross-surface loop fill: ` +
                        `${finalXFill.filledLoops} loops filled, ` +
                        `${finalXFill.insertedTriangles} tris inserted, ` +
                        `${finalXFill.insertedVertices} vertices inserted`,
                    );
                }
            }
            recordWindingStageDiagnostic('after-finalCrossSurfaceLoopFill', finalCombinedIdxs, finalResultData);

            // Final same-surface loop closure: the T-junction split and the periodic
            // seam closure can leave small SAME-SURFACE closed loops (notably a thin
            // loop straddling the u=0/u≈1 seam where a feature row crosses it). The
            // earlier same-surface center filler ran before those stages. Re-run it
            // here (owner-opposite, manifold-safe, incremental commit) to mop them up.
            await pfStageFlush(`tail:before-finalSameSurfaceLoopFill tris=${finalCombinedIdxs.length / 3}`);
            {
                const finalSFillStart = performance.now();
                const finalSFillTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
                const finalSFill = fillSameSurfaceBoundaryLoopsWithCenters(
                    finalCombinedIdxs,
                    combinedVerts,
                    finalResultData,
                    topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
                );
                recordTailDiagnosticStage({
                    name: 'finalSameSurfaceLoopFill',
                    elapsedMs: performance.now() - finalSFillStart,
                    trianglesBefore: finalSFillTrisBefore,
                    trianglesAfter: indexCountToTriangleCount(finalSFill.indices.length),
                    outerTrianglesBefore: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    outerTrianglesAfter: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    details: {
                        filledLoops: finalSFill.filledLoops,
                        insertedTriangles: finalSFill.insertedTriangles,
                        insertedVertices: finalSFill.insertedVertices,
                        attemptedLoops: finalSFill.attemptedLoops,
                        emptyTriangulations: finalSFill.emptyTriangulations,
                        unsafeLoops: finalSFill.unsafeLoops,
                    },
                });
                if (finalSFill.filledLoops > 0) {
                    finalCombinedIdxs = finalSFill.indices;
                    combinedVerts = finalSFill.uvs;
                    finalResultData = finalSFill.positions;
                    console.log(
                        `[ParametricExport]   Final same-surface loop fill: ` +
                        `${finalSFill.filledLoops} loops filled, ` +
                        `${finalSFill.insertedTriangles} tris inserted, ` +
                        `${finalSFill.insertedVertices} vertices inserted`,
                    );
                }
            }
            recordWindingStageDiagnostic('after-finalSameSurfaceLoopFill', finalCombinedIdxs, finalResultData);

            // Final near-coincident defect weld: the only residual after the fill
            // battery is duplicate vertices a few microns apart (the same physical
            // point split by float path divergence at feature/seam crossings), which
            // leave a non-manifold near-degenerate edge plus an open boundary chain.
            // Merge such pairs — restricted to boundary/non-manifold-incident vertices
            // so dense feature interiors are untouched — at a tolerance well above the
            // sub-micron weld floor but far below the inter-vertex spacing.
            await pfStageFlush(`tail:before-finalDefectWeld tris=${finalCombinedIdxs.length / 3}`);
            let finalDefectWeldMutated = false;
            {
                const defectWeldStart = performance.now();
                const defectWeldTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
                const defectWeldTopologyBefore = topologyMetric(
                    { vertices: finalResultData, indices: finalCombinedIdxs },
                    DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                );
                const defectWeldDiscoveryToleranceMm = Math.min(
                    topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
                    DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                );
                const defectWeldCandidateSummary: string[] = [];
                const defectWeldCandidates: Array<FinalDefectWeldCandidateScore & {
                    result: ReturnType<typeof weldNearCoincidentBoundaryVertices>;
                }> = [];
                for (const candidateToleranceMm of DEFECT_WELD_TOLERANCE_CANDIDATES_MM) {
                    const candidate = weldNearCoincidentBoundaryVertices(
                        finalCombinedIdxs,
                        finalResultData,
                        defectWeldDiscoveryToleranceMm,
                        candidateToleranceMm,
                        outerIdxCountAfterSubdiv,
                    );
                    const candidateTopology = topologyMetric(
                        { vertices: finalResultData, indices: candidate.indices },
                        DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                    );
                    defectWeldCandidates.push({
                        toleranceMm: candidateToleranceMm,
                        boundaryEdges: candidateTopology.boundaryEdges,
                        nonManifoldEdges: candidateTopology.nonManifoldEdges,
                        orientationMismatches: candidateTopology.orientationMismatches,
                        result: candidate,
                    });
                    defectWeldCandidateSummary.push(
                        `${candidateToleranceMm}:${candidateTopology.boundaryEdges}/${candidateTopology.nonManifoldEdges}/` +
                        `${candidateTopology.orientationMismatches}/${candidate.weldedVertices}/${candidate.strippedTriangles}/` +
                        `${candidate.strippedPrefixTriangles}`,
                    );
                }
                const selectedDefectWeld = selectFinalDefectWeldCandidate(
                    defectWeldTopologyBefore,
                    defectWeldCandidates,
                );
                const defectWeld = selectedDefectWeld.result;
                const defectWeldOuterIdxCount = outerIdxCountAfterSubdiv - defectWeld.strippedPrefixTriangles * INDICES_PER_TRIANGLE;
                recordTailDiagnosticStage({
                    name: 'finalDefectWeld',
                    elapsedMs: performance.now() - defectWeldStart,
                    trianglesBefore: defectWeldTrisBefore,
                    trianglesAfter: indexCountToTriangleCount(defectWeld.indices.length),
                    outerTrianglesBefore: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    outerTrianglesAfter: indexCountToTriangleCount(defectWeldOuterIdxCount),
                    details: {
                        weldedVertices: defectWeld.weldedVertices,
                        strippedTriangles: defectWeld.strippedTriangles,
                        strippedOuterTriangles: defectWeld.strippedPrefixTriangles,
                        beforeBoundaryEdges: defectWeldTopologyBefore.boundaryEdges,
                        beforeNonManifoldEdges: defectWeldTopologyBefore.nonManifoldEdges,
                        beforeOrientationMismatches: defectWeldTopologyBefore.orientationMismatches,
                        afterBoundaryEdges: selectedDefectWeld.boundaryEdges,
                        afterNonManifoldEdges: selectedDefectWeld.nonManifoldEdges,
                        afterOrientationMismatches: selectedDefectWeld.orientationMismatches,
                        selectedToleranceMm: selectedDefectWeld.toleranceMm,
                        toleranceCandidates: defectWeldCandidateSummary.join('|'),
                    },
                });
                if (defectWeld.weldedVertices > 0) {
                    finalCombinedIdxs = defectWeld.indices;
                    outerIdxCountAfterSubdiv = defectWeldOuterIdxCount;
                    finalDefectWeldMutated = true;
                    console.log(
                        `[ParametricExport]   Final defect weld: ` +
                        `${defectWeld.weldedVertices} vertices welded, ` +
                        `${defectWeld.strippedTriangles} degenerate tris stripped`,
                    );
                }
            }

            if (finalDefectWeldMutated) {
                await pfStageFlush(`tail:before-postDefectWeldTopologyRepair tris=${finalCombinedIdxs.length / 3}`);
                const postDefectRepairStart = performance.now();
                const postDefectRepairTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
                const postDefectRepairOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
                const postDefectTopologyBefore = topologyMetric(
                    { vertices: finalResultData, indices: finalCombinedIdxs },
                    DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                );
                const postDefectRepair = repairPostDefectWeldTopology(
                    finalCombinedIdxs,
                    combinedVerts,
                    finalResultData,
                    outerIdxCountAfterSubdiv,
                    topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
                    0,
                );
                const postDefectTopologyAfter = topologyMetric(
                    { vertices: postDefectRepair.positions, indices: postDefectRepair.indices },
                    DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                );
                const postDefectRepairHasWork =
                    postDefectRepair.repairedEdges > 0 ||
                    postDefectRepair.sameSurfaceFilledLoops > 0 ||
                    postDefectRepair.branchedFilledLoops > 0 ||
                    postDefectRepair.nonManifoldRepairedEdges > 0 ||
                    postDefectRepair.residualRepairedEdges > 0 ||
                    postDefectRepair.finalSameSurfaceFilledLoops > 0;
                const acceptPostDefectRepair = shouldAcceptPostDefectTopologyRepair(
                    postDefectTopologyBefore,
                    postDefectTopologyAfter,
                );
                recordTailDiagnosticStage({
                    name: 'postDefectWeldTopologyRepair',
                    elapsedMs: performance.now() - postDefectRepairStart,
                    trianglesBefore: postDefectRepairTrisBefore,
                    trianglesAfter: indexCountToTriangleCount(postDefectRepair.indices.length),
                    outerTrianglesBefore: postDefectRepairOuterTrisBefore,
                    outerTrianglesAfter: indexCountToTriangleCount(postDefectRepair.outerIdxCount),
                    details: {
                        repairedEdges: postDefectRepair.repairedEdges,
                        repairInsertedTriangles: postDefectRepair.repairInsertedTriangles,
                        sameSurfaceFilledLoops: postDefectRepair.sameSurfaceFilledLoops,
                        sameSurfaceInsertedTriangles: postDefectRepair.sameSurfaceInsertedTriangles,
                        sameSurfaceInsertedVertices: postDefectRepair.sameSurfaceInsertedVertices,
                        branchedFilledLoops: postDefectRepair.branchedFilledLoops,
                        branchedInsertedTriangles: postDefectRepair.branchedInsertedTriangles,
                        branchedInsertedVertices: postDefectRepair.branchedInsertedVertices,
                        nonManifoldRepairedEdges: postDefectRepair.nonManifoldRepairedEdges,
                        nonManifoldInsertedTriangles: postDefectRepair.nonManifoldInsertedTriangles,
                        residualRepairedEdges: postDefectRepair.residualRepairedEdges,
                        residualInsertedTriangles: postDefectRepair.residualInsertedTriangles,
                        finalSameSurfaceFilledLoops: postDefectRepair.finalSameSurfaceFilledLoops,
                        finalSameSurfaceInsertedTriangles: postDefectRepair.finalSameSurfaceInsertedTriangles,
                        finalSameSurfaceInsertedVertices: postDefectRepair.finalSameSurfaceInsertedVertices,
                        accepted: acceptPostDefectRepair,
                        beforeBoundaryEdges: postDefectTopologyBefore.boundaryEdges,
                        beforeNonManifoldEdges: postDefectTopologyBefore.nonManifoldEdges,
                        beforeOrientationMismatches: postDefectTopologyBefore.orientationMismatches,
                        afterBoundaryEdges: postDefectTopologyAfter.boundaryEdges,
                        afterNonManifoldEdges: postDefectTopologyAfter.nonManifoldEdges,
                        afterOrientationMismatches: postDefectTopologyAfter.orientationMismatches,
                    },
                });
                if (postDefectRepairHasWork && acceptPostDefectRepair) {
                    finalCombinedIdxs = postDefectRepair.indices;
                    combinedVerts = postDefectRepair.uvs;
                    finalResultData = postDefectRepair.positions;
                    outerIdxCountAfterSubdiv = postDefectRepair.outerIdxCount;
                    console.log(
                        `[ParametricExport]   Post-defect topology repair: ` +
                        `${postDefectRepair.repairedEdges} repaired edges, ` +
                        `${postDefectRepair.sameSurfaceFilledLoops} same-surface loops filled, ` +
                        `${postDefectRepair.branchedFilledLoops} branched loops filled, ` +
                        `${postDefectRepair.nonManifoldRepairedEdges} non-manifold chains split, ` +
                        `${postDefectRepair.residualRepairedEdges} residual T-junctions split, ` +
                        `${postDefectRepair.finalSameSurfaceFilledLoops} final same-surface loops filled`,
                    );
                } else if (postDefectRepairHasWork) {
                    console.warn(
                        `[ParametricExport]   Post-defect topology repair rejected: ` +
                        `boundary ${postDefectTopologyBefore.boundaryEdges}->${postDefectTopologyAfter.boundaryEdges}, ` +
                        `nonMan ${postDefectTopologyBefore.nonManifoldEdges}->${postDefectTopologyAfter.nonManifoldEdges}, ` +
                        `orient ${postDefectTopologyBefore.orientationMismatches}->${postDefectTopologyAfter.orientationMismatches}`,
                    );
                }
            }
            recordOuterWallQualityStage('tail-post-defect-weld', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);
            recordWindingStageDiagnostic('after-finalDefectWeld', finalCombinedIdxs, finalResultData);

            await pfStageFlush(`tail:before-finalCadTopologyWeld tris=${finalCombinedIdxs.length / 3}`);
            {
                const cadWeldStart = performance.now();
                const cadWeldTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
                const cadWeldOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
                const cadTopologyBefore = topologyMetric(
                    { vertices: finalResultData, indices: finalCombinedIdxs },
                    DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                );
                const cadWeldCandidateSummary: string[] = [];
                const cadWeldCandidates: Array<FinalDefectWeldCandidateScore & {
                    result: ReturnType<typeof weldNearCoincidentBoundaryVertices>;
                }> = [];
                for (const candidateToleranceMm of STRICT_CAD_CLOSURE_TOLERANCE_CANDIDATES_MM) {
                    const candidate = weldNearCoincidentBoundaryVertices(
                        finalCombinedIdxs,
                        finalResultData,
                        DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                        candidateToleranceMm,
                        outerIdxCountAfterSubdiv,
                    );
                    const candidateTopology = topologyMetric(
                        { vertices: finalResultData, indices: candidate.indices },
                        DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                    );
                    cadWeldCandidates.push({
                        toleranceMm: candidateToleranceMm,
                        boundaryEdges: candidateTopology.boundaryEdges,
                        nonManifoldEdges: candidateTopology.nonManifoldEdges,
                        orientationMismatches: candidateTopology.orientationMismatches,
                        result: candidate,
                    });
                    cadWeldCandidateSummary.push(
                        `${candidateToleranceMm}:${candidateTopology.boundaryEdges}/${candidateTopology.nonManifoldEdges}/` +
                        `${candidateTopology.orientationMismatches}/${candidate.weldedVertices}/${candidate.strippedTriangles}/` +
                        `${candidate.strippedPrefixTriangles}`,
                    );
                }
                const selectedCadWeld = selectFinalDefectWeldCandidate(
                    cadTopologyBefore,
                    cadWeldCandidates,
                );
                const cadWeld = selectedCadWeld.result;
                const cadTopologyAfter: TopologyDefectCounts = {
                    boundaryEdges: selectedCadWeld.boundaryEdges,
                    nonManifoldEdges: selectedCadWeld.nonManifoldEdges,
                    orientationMismatches: selectedCadWeld.orientationMismatches,
                };
                const acceptCadWeld =
                    cadWeld.weldedVertices > 0 &&
                    shouldAcceptPostDefectTopologyRepair(cadTopologyBefore, cadTopologyAfter);
                const cadWeldOuterIdxCount = outerIdxCountAfterSubdiv - cadWeld.strippedPrefixTriangles * INDICES_PER_TRIANGLE;
                recordTailDiagnosticStage({
                    name: 'finalCadTopologyWeld',
                    elapsedMs: performance.now() - cadWeldStart,
                    trianglesBefore: cadWeldTrisBefore,
                    trianglesAfter: acceptCadWeld
                        ? indexCountToTriangleCount(cadWeld.indices.length)
                        : cadWeldTrisBefore,
                    outerTrianglesBefore: cadWeldOuterTrisBefore,
                    outerTrianglesAfter: acceptCadWeld
                        ? indexCountToTriangleCount(cadWeldOuterIdxCount)
                        : cadWeldOuterTrisBefore,
                    details: {
                        accepted: acceptCadWeld,
                        weldedVertices: cadWeld.weldedVertices,
                        strippedTriangles: cadWeld.strippedTriangles,
                        strippedOuterTriangles: cadWeld.strippedPrefixTriangles,
                        beforeBoundaryEdges: cadTopologyBefore.boundaryEdges,
                        beforeNonManifoldEdges: cadTopologyBefore.nonManifoldEdges,
                        beforeOrientationMismatches: cadTopologyBefore.orientationMismatches,
                        afterBoundaryEdges: selectedCadWeld.boundaryEdges,
                        afterNonManifoldEdges: selectedCadWeld.nonManifoldEdges,
                        afterOrientationMismatches: selectedCadWeld.orientationMismatches,
                        selectedToleranceMm: selectedCadWeld.toleranceMm,
                        toleranceCandidates: cadWeldCandidateSummary.join('|'),
                    },
                });
                if (acceptCadWeld) {
                    finalCombinedIdxs = cadWeld.indices;
                    outerIdxCountAfterSubdiv = cadWeldOuterIdxCount;
                    console.log(
                        `[ParametricExport]   Final CAD topology weld: ` +
                        `${cadWeld.weldedVertices} vertices welded at ${selectedCadWeld.toleranceMm}mm, ` +
                        `${cadWeld.strippedTriangles} degenerate tris stripped`,
                    );
                }
            }

            await pfStageFlush(`tail:before-normalizeWindingByComponent tris=${finalCombinedIdxs.length / 3}`);
            {
                const windingStart = performance.now();
                const windingTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
                const winding = normalizeWindingByComponent(
                    finalCombinedIdxs,
                    finalCombinedIdxs.length,
                    finalResultData,
                    DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                );
                let windingTopologyBefore: TopologyDefectCounts | undefined;
                let windingTopologyAfter: TopologyDefectCounts | undefined;
                let acceptWinding = false;
                if (winding.flipped > 0) {
                    windingTopologyBefore = topologyMetric(
                        { vertices: finalResultData, indices: finalCombinedIdxs },
                        DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                    );
                    windingTopologyAfter = topologyMetric(
                        { vertices: finalResultData, indices: winding.indices },
                        DEFECT_WELD_DISCOVERY_TOLERANCE_MM,
                    );
                    acceptWinding = shouldAcceptWindingNormalization(
                        windingTopologyBefore,
                        windingTopologyAfter,
                    );
                }
                recordTailDiagnosticStage({
                    name: 'normalizeWindingByComponent',
                    elapsedMs: performance.now() - windingStart,
                    trianglesBefore: windingTrisBefore,
                    trianglesAfter: indexCountToTriangleCount(winding.indices.length),
                    outerTrianglesBefore: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    outerTrianglesAfter: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                    details: {
                        flippedTriangles: winding.flipped,
                        components: winding.components,
                        conflicts: winding.conflicts,
                        accepted: acceptWinding,
                        beforeBoundaryEdges: windingTopologyBefore?.boundaryEdges,
                        beforeNonManifoldEdges: windingTopologyBefore?.nonManifoldEdges,
                        beforeOrientationMismatches: windingTopologyBefore?.orientationMismatches,
                        afterBoundaryEdges: windingTopologyAfter?.boundaryEdges,
                        afterNonManifoldEdges: windingTopologyAfter?.nonManifoldEdges,
                        afterOrientationMismatches: windingTopologyAfter?.orientationMismatches,
                    },
                });
                if (acceptWinding) {
                    finalCombinedIdxs = winding.indices;
                    console.log(
                        `[ParametricExport]   Winding normalized: ` +
                        `${winding.flipped} triangles flipped across ${winding.components} components ` +
                        `(conflicts=${winding.conflicts})`,
                    );
                } else if (winding.flipped > 0) {
                    console.warn(
                        `[ParametricExport]   Winding normalization rejected: ` +
                        `orientation ${windingTopologyBefore?.orientationMismatches ?? 'n/a'}->` +
                        `${windingTopologyAfter?.orientationMismatches ?? 'n/a'}, ` +
                        `boundary ${windingTopologyBefore?.boundaryEdges ?? 'n/a'}->` +
                        `${windingTopologyAfter?.boundaryEdges ?? 'n/a'}, ` +
                        `nonManifold ${windingTopologyBefore?.nonManifoldEdges ?? 'n/a'}->` +
                        `${windingTopologyAfter?.nonManifoldEdges ?? 'n/a'}`,
                    );
                }
                if (winding.conflicts > 0) {
                    console.warn(
                        `[ParametricExport]   Winding normalization found ${winding.conflicts} conflicts`,
                    );
                }
            }

            await pfStageFlush(`tail:before-final-geometric-degen-strip tris=${finalCombinedIdxs.length / 3}`);
            const finalDegenStripTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const finalDegenStripOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const finalDegenStripStart = performance.now();
            let finalDegenStripRemoved = 0;
            let finalDegenStripOuterRemoved = 0;
            {
                const minAreaSq4 = 4e-20;
                const minEdgeLenSq = 1e-12;
                let outerDegen = 0;
                let totalDegen = 0;
                for (let t = 0; t < finalCombinedIdxs.length; t += 3) {
                    const a = finalCombinedIdxs[t], b = finalCombinedIdxs[t + 1], c = finalCombinedIdxs[t + 2];
                    const ax = finalResultData[a * 3], ay = finalResultData[a * 3 + 1], az = finalResultData[a * 3 + 2];
                    const bx = finalResultData[b * 3], by = finalResultData[b * 3 + 1], bz = finalResultData[b * 3 + 2];
                    const cx = finalResultData[c * 3], cy = finalResultData[c * 3 + 1], cz = finalResultData[c * 3 + 2];
                    const abx = bx - ax, aby = by - ay, abz = bz - az;
                    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
                    const cax = ax - cx, cay = ay - cy, caz = az - cz;
                    const abLenSq = abx * abx + aby * aby + abz * abz;
                    const bcLenSq = bcx * bcx + bcy * bcy + bcz * bcz;
                    const caLenSq = cax * cax + cay * cay + caz * caz;
                    const crossX = aby * (cz - az) - abz * (cy - ay);
                    const crossY = abz * (cx - ax) - abx * (cz - az);
                    const crossZ = abx * (cy - ay) - aby * (cx - ax);
                    const areaSq4 = crossX * crossX + crossY * crossY + crossZ * crossZ;
                    if (
                        a === b || b === c || a === c ||
                        abLenSq <= minEdgeLenSq || bcLenSq <= minEdgeLenSq || caLenSq <= minEdgeLenSq ||
                        areaSq4 <= minAreaSq4
                    ) {
                        totalDegen++;
                        if (t < outerIdxCountAfterSubdiv) outerDegen++;
                    }
                }

                if (totalDegen > 0) {
                    const compacted = new Uint32Array(finalCombinedIdxs.length - totalDegen * 3);
                    let w = 0;
                    for (let t = 0; t < finalCombinedIdxs.length; t += 3) {
                        const a = finalCombinedIdxs[t], b = finalCombinedIdxs[t + 1], c = finalCombinedIdxs[t + 2];
                        const ax = finalResultData[a * 3], ay = finalResultData[a * 3 + 1], az = finalResultData[a * 3 + 2];
                        const bx = finalResultData[b * 3], by = finalResultData[b * 3 + 1], bz = finalResultData[b * 3 + 2];
                        const cx = finalResultData[c * 3], cy = finalResultData[c * 3 + 1], cz = finalResultData[c * 3 + 2];
                        const abx = bx - ax, aby = by - ay, abz = bz - az;
                        const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
                        const cax = ax - cx, cay = ay - cy, caz = az - cz;
                        const abLenSq = abx * abx + aby * aby + abz * abz;
                        const bcLenSq = bcx * bcx + bcy * bcy + bcz * bcz;
                        const caLenSq = cax * cax + cay * cay + caz * caz;
                        const crossX = aby * (cz - az) - abz * (cy - ay);
                        const crossY = abz * (cx - ax) - abx * (cz - az);
                        const crossZ = abx * (cy - ay) - aby * (cx - ax);
                        const areaSq4 = crossX * crossX + crossY * crossY + crossZ * crossZ;
                        if (
                            a === b || b === c || a === c ||
                            abLenSq <= minEdgeLenSq || bcLenSq <= minEdgeLenSq || caLenSq <= minEdgeLenSq ||
                            areaSq4 <= minAreaSq4
                        ) continue;
                        compacted[w++] = a;
                        compacted[w++] = b;
                        compacted[w++] = c;
                    }
                    finalCombinedIdxs = compacted;
                    outerIdxCountAfterSubdiv -= outerDegen * 3;
                    console.log(`[ParametricExport]   Final degenerate strip: ${totalDegen} triangles (${outerDegen} outer wall)`);
                }
                finalDegenStripRemoved = totalDegen;
                finalDegenStripOuterRemoved = outerDegen;
            }
            recordTailDiagnosticStage({
                name: 'finalGeometricDegenStrip',
                elapsedMs: performance.now() - finalDegenStripStart,
                trianglesBefore: finalDegenStripTrisBefore,
                trianglesAfter: indexCountToTriangleCount(finalCombinedIdxs.length),
                outerTrianglesBefore: finalDegenStripOuterTrisBefore,
                outerTrianglesAfter: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                details: {
                    removedTriangles: finalDegenStripRemoved,
                    removedOuterTriangles: finalDegenStripOuterRemoved,
                },
            });

            await pfStageFlush(`tail:before-final-duplicate-triangle-strip tris=${finalCombinedIdxs.length / 3}`);
            const finalDuplicateStripTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const finalDuplicateStripOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            const finalDuplicateStripStart = performance.now();
            const topologyWeldToleranceMm = topologyWeldToleranceForExport(effectiveTolerances.epsPosMm);
            let finalDuplicateStripRemoved = 0;
            let finalDuplicateStripOuterRemoved = 0;
            {
                const outerSlice = finalCombinedIdxs.slice(0, outerIdxCountAfterSubdiv);
                const nonOuterSlice = finalCombinedIdxs.slice(outerIdxCountAfterSubdiv);
                const outerCompaction = compactDuplicateCanonicalTriangles(
                    outerSlice,
                    combinedVerts,
                    finalResultData,
                    topologyWeldToleranceMm,
                    { preserveBoundaryEdges: true },
                );
                const nonOuterCompaction = compactDuplicateCanonicalTriangles(
                    nonOuterSlice,
                    combinedVerts,
                    finalResultData,
                    topologyWeldToleranceMm,
                    { preserveBoundaryEdges: true },
                );
                finalDuplicateStripOuterRemoved = outerCompaction.removedTriangles;
                finalDuplicateStripRemoved = outerCompaction.removedTriangles + nonOuterCompaction.removedTriangles;
                if (finalDuplicateStripRemoved > 0) {
                    const compacted = new Uint32Array(outerCompaction.indices.length + nonOuterCompaction.indices.length);
                    compacted.set(outerCompaction.indices);
                    compacted.set(nonOuterCompaction.indices, outerCompaction.indices.length);
                    finalCombinedIdxs = compacted;
                    outerIdxCountAfterSubdiv = outerCompaction.indices.length;
                    console.log(
                        `[ParametricExport]   Final duplicate triangle strip: ` +
                        `${finalDuplicateStripRemoved} triangles (${finalDuplicateStripOuterRemoved} outer wall)`,
                    );
                }
            }
            recordTailDiagnosticStage({
                name: 'finalDuplicateTriangleStrip',
                elapsedMs: performance.now() - finalDuplicateStripStart,
                trianglesBefore: finalDuplicateStripTrisBefore,
                trianglesAfter: indexCountToTriangleCount(finalCombinedIdxs.length),
                outerTrianglesBefore: finalDuplicateStripOuterTrisBefore,
                outerTrianglesAfter: indexCountToTriangleCount(outerIdxCountAfterSubdiv),
                details: {
                    removedTriangles: finalDuplicateStripRemoved,
                    removedOuterTriangles: finalDuplicateStripOuterRemoved,
                },
            });
            recordOuterWallQualityStage('tail-final', finalResultData, finalCombinedIdxs, outerIdxCountAfterSubdiv);

            // ═══════════════════════════════════════════════════════
            // PHASE 6: Mesh Validation (always runs)
            //
            // Runs the full MeshValidator as a QA gate.
            // Optional GPU-enhanced fidelity check when gpuFidelityCheck
            // flag is enabled. Distortion gating uses profile-specific
            // thresholds when the distortionGating flag is set.
            // ═══════════════════════════════════════════════════════
            let validationSummary: ValidationSummary | undefined;
            await pfStageFlush(`tail:before-validateMesh tris=${finalCombinedIdxs.length / 3}`);
            const validationTrisBefore = indexCountToTriangleCount(finalCombinedIdxs.length);
            const validationOuterTrisBefore = indexCountToTriangleCount(outerIdxCountAfterSubdiv);
            {
                const validateStart = performance.now();
                const validationScopes = resolveValidationIndexScopes(
                    finalCombinedIdxs.length,
                    outerIdxCountAfterSubdiv,
                );
                const valConfig: ValidateConfig = {
                    tolerances: effectiveTolerances,
                    profileName: effectiveProfileName,
                    numU: outerW,
                    numT: finalT.length,
                    outerIdxCount: validationScopes.outerIdxCount,
                    uvs: combinedVerts,
                    topologyWeldToleranceMm: topologyWeldToleranceForExport(effectiveTolerances.epsPosMm),
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
                        validationScopes.meshIdxCount, valConfig, gpuEvalFn,
                    );
                } else {
                    report = validateMesh(
                        finalResultData, finalCombinedIdxs,
                        validationScopes.meshIdxCount, valConfig,
                    );
                }

                // Parametric validation is a QA report, not the final STL/OBJ/3MF
                // writer gate. Keep export blocking aligned with slicer geometry:
                // topology and degenerates are fatal; normals, quality, fidelity,
                // and seam continuity remain warnings for the selected profile.
                const validationPass = validationPassForExport(report);

                if (!report.valid && validationPass) {
                    console.log('[ParametricExport]   Export validation gate: topology clean; quality/fidelity/seam warnings are advisory');
                }

                // Map full ValidationReport → lightweight ValidationSummary
                validationSummary = {
                    valid: validationPass,
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
                recordTailDiagnosticStage({
                    name: 'validateMesh',
                    elapsedMs: validateMs,
                    trianglesBefore: validationTrisBefore,
                    trianglesAfter: validationTrisBefore,
                    outerTrianglesBefore: validationOuterTrisBefore,
                    outerTrianglesAfter: validationOuterTrisBefore,
                    details: {
                        validationPass,
                        reportValid: report.valid,
                        manifoldOk: report.manifold.ok,
                        boundaryEdges: report.manifold.boundaryEdges,
                        nonManifoldEdges: report.manifold.nonManifoldEdges,
                        degeneratesOk: report.degenerates.ok,
                        normalsOk: report.normals.ok,
                        windingInconsistentEdges: report.normals.windingInconsistentEdges,
                        inconsistentPairs: report.normals.inconsistentPairs,
                        invertedTriangles: report.normals.invertedTriangles,
                        triangleQualityOk: report.triangleQuality.ok,
                        minAngleDeg: report.triangleQuality.minAngleDeg,
                        maxAspectRatio: report.triangleQuality.maxAspectRatio,
                        warningCount: report.warnings.length,
                    },
                });
                const passStr = validationPass ? 'PASS' : 'FAIL';
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

            await pfStageFlush('tail:after-validation (entering result assembly/export)');
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

            const tailDiagnostics = tailDiagnosticsSnapshot();

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
                tailDiagnostics,
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
