/**
 * parametric/types.ts — Shared types and constants for the parametric export pipeline.
 *
 * Extracted from ParametricExportComputer.ts to enable modular architecture.
 */

import type { MeshData, PotDimensions, StyleOptions, StyleId } from '../../../geometry/types';
import type { PipelineFeatureFlags } from './contracts';

// ============================================================================
// Chain-Strip Triangulation
// ============================================================================

/** Chain-strip triangulation strategy. */
export type ChainStripMode = 'sweep' | 'cdt' | 'sweep-repair';

// ============================================================================
// Quality Profiles & Tolerances
// ============================================================================

/** Quality profile names (ordered lowest → highest fidelity). */
export type QualityProfileName = 'draft' | 'standard' | 'high' | 'ultra';

/**
 * Export tolerances — hard pass/fail thresholds for geometric fidelity.
 *
 * These are measured against the analytic surface and linked feature graph.
 * Triangle budget is retained as a safety cap, not a quality proxy.
 */
export interface ExportTolerances {
    /** Maximum acceptable surface position error in mm (chord error). */
    epsPosMm: number;
    /** Maximum acceptable surface normal deviation in degrees. */
    epsNormalDeg: number;
    /** Maximum acceptable feature ridge/valley drift in mm (from chain graph). */
    epsFeatureMm: number;
    /** Minimum acceptable triangle interior angle in degrees. */
    minTriangleAngleDeg: number;
    /** Maximum acceptable triangle aspect ratio. */
    maxAspectRatio: number;
}

/**
 * A named quality profile bundles tolerances with budget and refinement caps.
 */
export interface QualityProfile {
    /** Profile identifier. */
    name: QualityProfileName;
    /** Tolerance thresholds for this profile. */
    tolerances: ExportTolerances;
    /** Maximum triangle budget (safety cap, not quality target). */
    maxTriangleBudget: number;
    /** Maximum adaptive refinement iterations (0 = no refinement). */
    maxRefineIterations: number;
    /**
     * Number of post-refinement quality optimization iterations
     * (edge flips + vertex smoothing). Defaults to 2 if omitted.
     */
    qualityIterations?: number;
    /** Human-readable description. */
    description: string;
}

// ============================================================================
// Pipeline Parameters & Results
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
    /** Named quality profile (default: 'standard'). */
    qualityProfile?: QualityProfileName;
    /** Explicit tolerance overrides (take precedence over profile defaults). */
    toleranceOverrides?: Partial<ExportTolerances>;
    /** Optional feature-flag overrides for advanced pipeline paths. */
    pipelineFeatureFlags?: Partial<PipelineFeatureFlags>;
    /** Pipeline-stage constants overrides (advanced — default values are tuned). */
    pipelineConfig?: Partial<PipelineStageConfig>;
}

/**
 * Overridable pipeline-stage constants.
 * All fields are optional — unset fields use their hardcoded defaults.
 */
export interface PipelineStageConfig {
    /** Phase 01: Number of curvature sampling strips (default: 16). */
    numStrips: number;
    /** Phase 01: Curvature samples per strip (default: 4096). */
    curvatureSamples: number;
    /** Phase 02: Enable horizontal (T-direction) feature detection (default: false). */
    detectHorizontalFeatures: boolean;
    /** Phase 2.5: Samples per row probe (default: 8192). */
    rowProbeSamples: number;
    /** Phase 2.5: Enable GPU re-snap of chain vertices (default: true). */
    gpuResnap: boolean;
    /** Phase 2.5: Number of re-snap candidate positions (default: 32). */
    resnapCandidates: number;
    /**
     * Phase 2.5/3: Extra feature-only budget in MB (default: 0).
     * This augments row/column feature refinement budgets without changing
     * base mesh sizing logic.
     */
    featureBudgetMB: number;
    /** Phase 03: Chain-strip triangulation mode (default: 'cdt'). */
    chainStripMode: 'sweep' | 'cdt' | 'sweep-repair';
    /** Phase 03: Chain-strip vertex density multiplier 1-12 (default: 4). */
    chainStripDensity: number;
    /** Phase 03: Extra columns to pad on each side of chain strip 0-4 (default: 1). */
    chainStripExpansion: number;
    /** Phase 03: Enable adaptive refinement in chain strips (default: true). */
    chainStripAdaptiveRefine: boolean;
    /** Phase 03: Number of adjacent bands to merge per CDT segment (1=disabled, 2+=multi-band). */
    bandMergeFactor: number;
    /** Phase 03: Enable chain-directed diagonal flipping (default: true). */
    chainDirectedFlip: boolean;
    /** Phase 03: Enable 3D edge flipping (default: true). */
    edgeFlip3D: boolean;
    /** Phase 04: Enable chain-strip optimizer (default: true). */
    chainStripOptimizer: boolean;
    /** Phase 04: Enable boundary diagonal optimization (default: true). */
    boundaryDiagOpt: boolean;
    /** Phase 04: Enable GPU subdivision of long edges (default: true). */
    gpuSubdivision: boolean;
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
    /** Quality profile used for this export (if resolved). */
    qualityProfile?: QualityProfileName;
    /** Effective tolerances used (after profile + overrides resolution). */
    effectiveTolerances?: ExportTolerances;
    /** Whether the export passed all tolerance gates. */
    tolerancesPassed?: boolean;
    /** If the profile was downgraded due to resource limits, the original profile. */
    requestedProfile?: QualityProfileName;
    /** If downgraded, the reason string. */
    downgradeReason?: string;
    /** Mesh validation summary (present when validator ran). */
    validationSummary?: ValidationSummary;
    /** Adaptive refinement summary (present when refinement ran). */
    refinementSummary?: RefinementSummary;
    /** Per-phase pipeline diagnostics for the ExportDialog debug tab. */
    pipelineDiagnostics?: PipelineDiagnostics;
}

/**
 * Per-phase pipeline diagnostics collected during export.
 * Surfaced to ExportDialog debug tab for live readout.
 */
export interface PipelineDiagnostics {
    phases: Array<{ name: string; timeMs: number; details?: string[] }>;
    chainCount: number;
    chainPoints: number;
    chainFlips: number;
    genericFlips3D: number;
    subdivSplits: number;
    valenceLow: number;
    valenceIdeal: number;
    valenceHigh: number;
    crossRowTris: number;
    aspectOver5: number;
    refinement?: RefinementSummary;
}

// ============================================================================
// Validation & Refinement Summaries (circular-import-safe)
// ============================================================================

/**
 * Simplified validation summary included in the export result.
 *
 * This is a flattened projection of MeshValidator's `ValidationReport`
 * designed to live in types.ts without importing from MeshValidator.ts
 * (which imports from types.ts, creating a circular dependency).
 */
export interface ValidationSummary {
    /** Overall pass: all enabled checks passed. */
    valid: boolean;
    /** Individual check pass/fail flags. */
    manifoldOk: boolean;
    degeneratesOk: boolean;
    normalsOk: boolean;
    triangleQualityOk: boolean;
    /** Fidelity check (only present when GPU evaluator was available). */
    fidelityOk?: boolean;
    /** Seam continuity check (only present when grid dims were provided). */
    seamOk?: boolean;
    /** UV distortion check (only present when distortion gating was enabled). */
    distortionOk?: boolean;
    /** Human-readable warnings. */
    warnings: string[];
    /** Key metrics for the UI. */
    minAngleDeg: number;
    maxAspectRatio: number;
    p95PosErrorMm?: number;
    p999PosErrorMm?: number;
    maxFeatureDriftMm?: number;
    seamMaxGapMm?: number;
    p95StretchRatio?: number;
}

/**
 * Summary of the adaptive refinement pass.
 */
export interface RefinementSummary {
    /** Whether all tolerances are satisfied after refinement. */
    tolerancesPassed: boolean;
    /** Number of refinement iterations performed. */
    iterationsPerformed: number;
    /** Why refinement stopped. */
    stopReason: string;
    /** Final maximum position error (mm). */
    maxPosErrorMm: number;
    /** Final maximum normal error (degrees). */
    maxNormalErrorDeg: number;
    /** Final p95 position error (mm). */
    p95PosErrorMm: number;
    /** Final p95 normal error (degrees). */
    p95NormalErrorDeg: number;
    /** Total refinement time (ms). */
    totalTimeMs?: number;
    /** Final triangle count after refinement. */
    finalTriangleCount?: number;
    /** Total edges split across all iterations. */
    totalSplits?: number;
    /** Final minimum interior angle (degrees). */
    minAngleDeg?: number;
    /** Final maximum aspect ratio (R/r metric). */
    maxAspectRatio?: number;
    /** Angle histogram: 7 bins [0,10), [10,20), ..., [60,∞). */
    angleHistogram?: readonly [number, number, number, number, number, number, number];
}

// ============================================================================
// Feature Detection Types
// ============================================================================

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

/**
 * A T-direction feature detected from dedicated GPU column probing.
 * Uses an explicit `.t` field instead of overloading `.u` (which was a
 * semantic trap in the legacy `detectColumnFeaturesV16` path).
 */
export interface TDirectionFeature {
    /** T position in [0, 1] */
    t: number;
    /** Feature classification */
    kind: FeatureKind;
    /** Cylindrical radius at the feature position */
    radius: number;
    /** Peak-to-valley prominence in the local neighbourhood (mm) */
    prominence: number;
    /** Confidence score in [0, 1] */
    confidence: number;
}

/** A single point on a feature chain (row index + U position). */
export interface ChainPoint {
    u: number;
    row: number;
}

/** A feature chain is a polyline through (u, t) space. */
export interface FeatureChain {
    points: ChainPoint[];
    kind?: FeatureKind;
}

// ============================================================================
// Debug Overlay Types
// ============================================================================

export interface ChainDebugLine {
    points: Array<[number, number]>; // [u, t]
}

export interface ChainDebugData {
    createdAt: number;
    chainCount: number;
    lineCount: number;
    lines: ChainDebugLine[];
}

/** Raw per-row (and per-column) peak positions for debug visualization. */
export interface PeakDebugData {
    createdAt: number;
    totalPeaks: number;
    /** Peak positions as [u, t, kind] triples (flattened)
     *  k=0 for peak, k=1 for valley */
    points: Float32Array;
    rowPeaks: number;
    colPeaks: number;
    peakCount: number;
    valleyCount: number;
    rejected: number;
}

// ============================================================================
// Importance Field (NEW — for anisotropic Poisson disk sampling)
// ============================================================================

/** 2D scalar field over the UV domain, used to guide sampling density. */
export interface ImportanceField {
    /** Field values in row-major order [resT][resU] */
    data: Float32Array;
    /** Number of U samples */
    resU: number;
    /** Number of T samples */
    resT: number;
}

// ============================================================================
// Surface Configuration
// ============================================================================

export interface SurfaceConfig {
    readonly id: number;
    readonly name: string;
    readonly budgetFrac: number;
    readonly invertWinding: boolean;
}

export const SURFACE_CONFIG: readonly SurfaceConfig[] = [
    { id: 0, name: 'Outer Wall', budgetFrac: 0.72, invertWinding: false },
    { id: 1, name: 'Inner Wall', budgetFrac: 0.14, invertWinding: true },
    { id: 2, name: 'Rim', budgetFrac: 0.04, invertWinding: false },
    { id: 3, name: 'Bottom Under', budgetFrac: 0.04, invertWinding: true },
    { id: 4, name: 'Bottom Top', budgetFrac: 0.03, invertWinding: true },
    { id: 5, name: 'Drain', budgetFrac: 0.03, invertWinding: true },
] as const;

// ============================================================================
// Sampling Constants
// ============================================================================

/** Samples per strip for curvature probing.
 * 4096 gives ~0.088° resolution for feature detection. */
export const CURVATURE_SAMPLES = 4096;

/** Number of parallel strips for multi-angle curvature detection */
export const NUM_STRIPS = 16;

/** Samples per row for per-row feature probing (Phase 2.5).
 * 8192 = ~0.044° resolution, sufficient for cos(38θ) features. */
export const ROW_PROBE_SAMPLES = 8192;

/** Number of evenly-spaced U columns for GPU T-direction probing (Phase 2.5). */
export const COL_PROBE_COUNT = 128;

/** Samples per column for T-direction GPU probing.
 * 4096 gives ~0.024% T resolution — 40× better than row-derived column data. */
export const COL_PROBE_T_SAMPLES = 4096;

/** GPU re-snap: candidates per chain point for parabolic refinement */
export const RESNAP_CANDIDATES = 32;

/** Minimum prominence for a feature peak (fraction of max curvature) */
export const FEATURE_PROMINENCE_THRESHOLD = 0.08;

// ============================================================================
// Seam Constants
// ============================================================================

/**
 * Seam proximity threshold: vertices with u < this or u > (1 - this)
 * are classified as seam vertices and protected from smoothing/collapse.
 * Used by globalSmoothing, EdgeCollapser.identifySeamVertices.
 */
export const SEAM_PROXIMITY_THRESHOLD = 0.02;

/**
 * Seam zone for circular midpoint computation: when one u-value is below
 * this threshold and the other is above (1 - this), the midpoint wraps
 * around the seam. Used by seamSafeMidpointU.
 */
export const SEAM_WRAP_ZONE = 0.15;

// ============================================================================
// Progress Reporting
// ============================================================================

export type ProgressCallback = (phase: string, fraction: number) => void;
