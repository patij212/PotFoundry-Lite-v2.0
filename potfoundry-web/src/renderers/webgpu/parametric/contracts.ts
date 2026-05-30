/**
 * contracts.ts — Stable stage contracts for modular pipeline evolution.
 *
 * Defines explicit interfaces for each pipeline stage so that new algorithms
 * can be swapped without touching unrelated modules. Each stage receives
 * immutable input and returns immutable output plus diagnostics/metrics.
 *
 * The contracts are intentionally decoupled from GPU specifics. GPU access
 * is provided through callback functions (e.g., EvaluateMidpointsFn)
 * rather than direct device references.
 *
 * ## Stage Architecture
 *
 * ```
 * ┌─────────────┐   ┌──────────────────┐   ┌──────────────────┐   ┌────────────────┐
 * │ Feature      │──▶│ Tessellation     │──▶│ Refinement       │──▶│ Validation     │
 * │ Constraint   │   │ (grid + tri)     │   │ (adaptive split) │   │ (QA gates)     │
 * └─────────────┘   └──────────────────┘   └──────────────────┘   └────────────────┘
 *       ▲                                          │
 *       │              EvaluateMidpointsFn         │
 *       └──────────────────────────────────────────┘
 * ```
 *
 * ## Feature Flags
 *
 * Pipeline feature flags control adoption of advanced paths. Defaults
 * preserve existing behavior unless explicitly opted in.
 *
 * @module contracts
 * @see AdaptiveRefinement.ts for the RefinementStage implementation
 * @see MeshValidator.ts for the ValidationStage implementation
 * @see FeatureDetection.ts for the FeatureConstraintStage implementation
 * @see OuterWallTessellator.ts for the TessellationStage implementation
 */

import type { ExportTolerances, QualityProfileName } from './types';
import type { EvaluateMidpointsFn } from './MeshSubdivision';

// ============================================================================
// Shared Types
// ============================================================================

/**
 * Immutable mesh data passed between pipeline stages.
 *
 * All arrays are treated as readonly to prevent accidental mutation.
 * Stages that need to modify mesh data must return new arrays.
 */
export interface StageMeshData {
    /** Packed [x,y,z,...] vertex positions. */
    readonly positions: Float32Array;
    /** Packed [u,v,surfaceId,...] UV coordinates. */
    readonly uvs: Float32Array;
    /** Triangle index buffer. */
    readonly indices: Uint32Array;
    /** Number of indices belonging to the outer wall surface. */
    readonly outerIdxCount: number;
    /** Total vertex count (positions.length / 3). */
    readonly vertexCount: number;
}

/**
 * Performance and diagnostic metrics common to all stages.
 */
export interface StageMetrics {
    /** Stage name for logging. */
    readonly stageName: string;
    /** Wall-clock time for the stage in milliseconds. */
    readonly timeMs: number;
    /** Optional additional key-value diagnostics. */
    readonly diagnostics?: Readonly<Record<string, string | number | boolean>>;
}

// ============================================================================
// Feature Constraint Stage
// ============================================================================

/**
 * Input contract for the feature constraint detection stage.
 *
 * Receives raw curvature data and produces feature edges, chains,
 * and constraint graphs that guide subsequent tessellation.
 */
export interface FeatureConstraintInput {
    /** Raw surface positions for curvature analysis (3D, packed). */
    readonly positions3D: Float32Array;
    /** Number of samples in the curvature profile. */
    readonly numSamples: number;
    /** Quality profile controlling detection sensitivity. */
    readonly profileName: QualityProfileName;
    /** Optional GPU evaluator for multi-row probing. */
    readonly evaluate?: EvaluateMidpointsFn;
}

/**
 * Output contract from the feature constraint detection stage.
 */
export interface FeatureConstraintOutput {
    /** Detected feature edge indices (indices into the curvature profile). */
    readonly featureIndices: readonly number[];
    /** Number of feature edges detected. */
    readonly featureCount: number;
    /** Linked feature chains (if chain linking was performed). */
    readonly chains?: readonly FeatureChainRef[];
    /** Stage performance metrics. */
    readonly metrics: StageMetrics;
}

/**
 * Minimal reference to a feature chain (avoids importing full chain types
 * into the contract layer).
 */
export interface FeatureChainRef {
    /** Chain identifier. */
    readonly id: number;
    /** Number of points in the chain. */
    readonly pointCount: number;
    /** Chain kind: 'peak' or 'valley'. */
    readonly kind: 'peak' | 'valley';
}

/**
 * Feature constraint stage contract.
 *
 * Implementations detect feature edges from curvature data and produce
 * constraint graphs for tessellation.
 */
export interface FeatureConstraintStage {
    /** Stage identifier. */
    readonly name: string;
    /** Execute the feature constraint detection. */
    execute(input: FeatureConstraintInput): Promise<FeatureConstraintOutput>;
}

// ============================================================================
// Tessellation Stage
// ============================================================================

/**
 * Input contract for the tessellation stage.
 *
 * Takes grid parameters and feature constraints, produces the initial
 * triangle mesh.
 */
export interface TessellationInput {
    /** Target triangle budget for the outer wall. */
    readonly triangleBudget: number;
    /** Budget fraction for the outer wall (0-1). */
    readonly budgetFraction: number;
    /** Aspect ratio hint for grid dimensions. */
    readonly aspectRatio: number;
    /** Feature chains to respect during tessellation. */
    readonly chains: readonly FeatureChainRef[];
    /** Row mapping for structured grid generation. */
    readonly rowMapping: readonly number[];
    /** T-axis positions for grid rows. */
    readonly tPositions: Float32Array;
    /** U-axis union grid positions. */
    readonly unionU: Float32Array;
}

/**
 * Output contract from the tessellation stage.
 */
export interface TessellationOutput {
    /** Initial mesh data. */
    readonly mesh: StageMeshData;
    /** Grid dimensions used: number of U columns. */
    readonly gridU: number;
    /** Grid dimensions used: number of T rows. */
    readonly gridT: number;
    /** Number of triangles produced. */
    readonly triangleCount: number;
    /** Stage performance metrics. */
    readonly metrics: StageMetrics;
}

/**
 * Tessellation stage contract.
 *
 * Implementations generate the initial triangle mesh from grid
 * parameters and feature constraints.
 */
export interface TessellationStage {
    /** Stage identifier. */
    readonly name: string;
    /** Execute the tessellation. */
    execute(input: TessellationInput): Promise<TessellationOutput>;
}

// ============================================================================
// Refinement Stage
// ============================================================================

/**
 * Input contract for the adaptive refinement stage.
 *
 * Receives the initial mesh and quality tolerances, iteratively refines
 * until tolerances are met or budget is exhausted.
 */
export interface RefinementInput {
    /** Current mesh data to refine. */
    readonly mesh: StageMeshData;
    /** Tolerance thresholds for pass/fail. */
    readonly tolerances: ExportTolerances;
    /** Quality profile name (controls iteration limits). */
    readonly profileName: QualityProfileName;
    /** Maximum total triangles allowed (safety cap). */
    readonly maxTriangles: number;
    /** GPU evaluator for surface reprojection (null = CPU-only). */
    readonly evaluate: EvaluateMidpointsFn | null;
}

/**
 * Output contract from the adaptive refinement stage.
 */
export interface RefinementOutput {
    /** Refined mesh data. */
    readonly mesh: StageMeshData;
    /** Whether all tolerances are satisfied. */
    readonly tolerancesPassed: boolean;
    /** Number of refinement iterations performed. */
    readonly iterationsPerformed: number;
    /** Reason refinement stopped. */
    readonly stopReason: 'tolerances_passed' | 'max_iterations' | 'budget_exhausted' | 'no_improvement' | 'zero_iterations' | 'diminishing_returns';
    /** Maximum position error after refinement (mm). */
    readonly maxPosErrorMm: number;
    /** Maximum normal error after refinement (degrees). */
    readonly maxNormalErrorDeg: number;
    /** Stage performance metrics. */
    readonly metrics: StageMetrics;
}

/**
 * Refinement stage contract.
 *
 * Implementations iteratively refine the mesh to meet tolerance bounds.
 */
export interface RefinementStage {
    /** Stage identifier. */
    readonly name: string;
    /** Execute the adaptive refinement loop. */
    execute(input: RefinementInput): Promise<RefinementOutput>;
}

// ============================================================================
// Validation Stage
// ============================================================================

/**
 * Input contract for the validation stage.
 *
 * Receives the final mesh and runs all quality-assurance checks.
 */
export interface ValidationInput {
    /** Mesh to validate. */
    readonly mesh: StageMeshData;
    /** Tolerance thresholds for gating. */
    readonly tolerances: ExportTolerances;
    /** Quality profile name (controls distortion gates). */
    readonly profileName: QualityProfileName;
    /** Optional GPU evaluator for high-accuracy fidelity checks. */
    readonly evaluate?: EvaluateMidpointsFn;
}

/**
 * Output contract from the validation stage.
 */
export interface ValidationOutput {
    /** Overall pass: all enabled checks passed. */
    readonly valid: boolean;
    /** Manifold check passed. */
    readonly manifoldOk: boolean;
    /** No degenerate elements. */
    readonly degeneratesOk: boolean;
    /** Normals consistent. */
    readonly normalsOk: boolean;
    /** Triangle quality within bounds. */
    readonly triangleQualityOk: boolean;
    /** Fidelity within tolerance. */
    readonly fidelityOk: boolean;
    /** Distortion within gates (if UVs available). */
    readonly distortionOk: boolean;
    /** Human-readable warnings. */
    readonly warnings: readonly string[];
    /** Stage performance metrics. */
    readonly metrics: StageMetrics;
}

/**
 * Validation stage contract.
 *
 * Implementations run comprehensive geometric QA on the mesh.
 */
export interface ValidationStage {
    /** Stage identifier. */
    readonly name: string;
    /** Execute the validation suite. */
    execute(input: ValidationInput): Promise<ValidationOutput>;
}

// ============================================================================
// Pipeline Feature Flags
// ============================================================================

/**
 * Feature flags for controlled adoption of advanced pipeline paths.
 *
 * All flags default to `false` (existing behavior preserved). Set to
 * `true` to opt in to new algorithms. Invalid flag combinations are
 * caught at runtime by the orchestrator.
 */
export interface PipelineFeatureFlags {
    /**
     * Enable metric-aware anisotropic refinement (SurfaceMetric module).
     * When true, edge split priority uses the UV metric tensor instead of
     * 3D Euclidean edge length. Default: false.
     */
    readonly metricAwareRefinement?: boolean;

    /**
     * Enable distortion quality gates in validation.
     * When true, high/ultra profiles enforce p95/p999 stretch ratio thresholds.
     * Default: false.
     */
    readonly distortionGating?: boolean;

    /**
     * Enable GPU-accelerated fidelity checking in validation.
     * Requires a valid EvaluateMidpointsFn. Default: false.
     */
    readonly gpuFidelityCheck?: boolean;

    /**
     * Enable advanced seam topology healing.
     * When true, seam gaps are auto-repaired using ghost segment insertion.
     * Default: false.
     */
    readonly seamHealing?: boolean;

    /**
     * Reserved for future MDC-style isosurface controls.
     * Not implemented — flag existence documents the planned extension point.
     * Default: false.
     */
    readonly mdcIsosurface?: boolean;

    /**
     * Enable QEM edge collapse to remove over-tessellated edges.
     * When true, the refinement loop can both split AND collapse edges.
     * Default: false.
     */
    readonly edgeCollapseEnabled?: boolean;

    /**
     * Enable per-edge error estimation instead of per-triangle.
     * When true, the refinement loop measures chord error on every edge
     * directly (via GPU midpoint evaluation) and splits the highest-error
     * edges. More targeted than the per-triangle → longest-edge heuristic.
     * Default: false.
     */
    readonly perEdgeErrorEstimation?: boolean;

    /**
     * Enable dry-run outer-wall corridor planning.
     * When true, the outer-wall tessellator computes corridor candidates and
     * future ownership diagnostics without changing emitted geometry.
     * Default: false.
     */
    readonly outerWallCorridorPlanning?: boolean;

    /**
     * Emit outer-wall corridor planning diagnostics.
     * Requires outerWallCorridorPlanning to be true. Default: false.
     */
    readonly outerWallCorridorDiagnostics?: boolean;
}

/**
 * Default feature flags (all advanced features disabled).
 */
export const DEFAULT_FEATURE_FLAGS: Readonly<PipelineFeatureFlags> = Object.freeze({
    metricAwareRefinement: false,
    distortionGating: false,
    gpuFidelityCheck: false,
    seamHealing: true,
    mdcIsosurface: false,
    edgeCollapseEnabled: false,
    perEdgeErrorEstimation: false,
    outerWallCorridorPlanning: false,
    outerWallCorridorDiagnostics: false,
});

/**
 * Resolve feature flags by merging user overrides with defaults.
 *
 * @param overrides - User-provided flag overrides.
 * @returns Complete feature flags with defaults for unspecified flags.
 */
export function resolveFeatureFlags(
    overrides?: Partial<PipelineFeatureFlags>,
): Readonly<PipelineFeatureFlags> {
    if (!overrides) return DEFAULT_FEATURE_FLAGS;
    return Object.freeze({
        ...DEFAULT_FEATURE_FLAGS,
        ...overrides,
    });
}

/**
 * Validate feature flag combinations and throw on incompatible settings.
 *
 * @param flags - Resolved feature flags.
 * @throws Error if flags contain incompatible combinations.
 */
export function validateFeatureFlags(flags: PipelineFeatureFlags): void {
    if (flags.mdcIsosurface) {
        throw new Error(
            'mdcIsosurface is a reserved flag and cannot be enabled yet. ' +
            'See contracts.ts for the planned extension point.',
        );
    }
    if (flags.outerWallCorridorDiagnostics && !flags.outerWallCorridorPlanning) {
        throw new Error(
            'outerWallCorridorDiagnostics requires outerWallCorridorPlanning to be enabled first.',
        );
    }
    // Note: gpuFidelityCheck without distortionGating is valid but unusual.
}

// ============================================================================
// Pipeline Composition
// ============================================================================

/**
 * Complete pipeline configuration including all stage contracts and flags.
 *
 * The orchestrator (`ParametricExportComputer`) reads this to decide
 * which stages to invoke and in what order.
 */
export interface PipelineConfig {
    /** Quality profile name. */
    readonly profileName: QualityProfileName;
    /** Tolerance thresholds. */
    readonly tolerances: ExportTolerances;
    /** Total triangle budget across all surfaces. */
    readonly totalBudget: number;
    /** Feature flags for advanced path adoption. */
    readonly flags: Readonly<PipelineFeatureFlags>;
}

/**
 * Full pipeline result aggregating outputs from all stages.
 */
export interface PipelineResult {
    /** Final validated mesh. */
    readonly mesh: StageMeshData;
    /** Whether validation passed. */
    readonly valid: boolean;
    /** Per-stage metrics for diagnostics. */
    readonly stageMetrics: readonly StageMetrics[];
    /** Total pipeline time in ms. */
    readonly totalTimeMs: number;
    /** Stop reason from refinement. */
    readonly refinementStopReason: RefinementOutput['stopReason'];
    /** Warnings from all stages. */
    readonly warnings: readonly string[];
}

// ============================================================================
// Stage Registry (for runtime composition)
// ============================================================================

/**
 * Registry of stage implementations for runtime pipeline assembly.
 *
 * Allows the orchestrator to swap implementations at runtime
 * (e.g., for testing, profiling, or A/B comparison).
 */
export interface StageRegistry {
    /** Feature constraint detection. */
    readonly featureConstraint: FeatureConstraintStage;
    /** Initial tessellation (grid + triangulation). */
    readonly tessellation: TessellationStage;
    /** Adaptive mesh refinement. */
    readonly refinement: RefinementStage;
    /** QA validation. */
    readonly validation: ValidationStage;
}

/**
 * Type guard: checks if an object satisfies the StageRegistry interface.
 *
 * @param obj - Object to check.
 * @returns True if obj has all required stage fields.
 */
export function isValidStageRegistry(obj: unknown): obj is StageRegistry {
    if (!obj || typeof obj !== 'object') return false;
    const reg = obj as Record<string, unknown>;
    return (
        hasStageShape(reg['featureConstraint']) &&
        hasStageShape(reg['tessellation']) &&
        hasStageShape(reg['refinement']) &&
        hasStageShape(reg['validation'])
    );
}

/** Check minimal stage interface shape (has name + execute). */
function hasStageShape(val: unknown): boolean {
    if (!val || typeof val !== 'object') return false;
    const s = val as Record<string, unknown>;
    return typeof s['name'] === 'string' && typeof s['execute'] === 'function';
}

// ============================================================================
// Convergence State (Phase 9.3 — A3, C6)
// ============================================================================

/**
 * Complete convergence snapshot including quality metrics.
 *
 * Replaces the simple 5% improvement check with comprehensive convergence
 * criteria that include triangle quality as first-class constraints.
 */
export interface ConvergenceState {
    /** Maximum chord error across all triangles/edges (mm). */
    readonly maxPosError: number;
    /** 95th percentile position error (mm). */
    readonly p95PosError: number;
    /** Maximum normal deviation (degrees). */
    readonly maxNormalError: number;
    /** 95th percentile normal error (degrees). */
    readonly p95NormalError: number;
    /** Minimum interior angle across all triangles (degrees). */
    readonly minAngleDeg: number;
    /** Maximum aspect ratio across all triangles. */
    readonly maxAspectRatio: number;
    /** Current triangle count. */
    readonly triangleCount: number;
}

/**
 * Result of a convergence check.
 */
export interface ConvergenceCheckResult {
    /** Whether all convergence criteria are met. */
    readonly converged: boolean;
    /** The criterion that prevented convergence, or 'all_passed'. */
    readonly reason: 'pos_error' | 'normal_error' | 'min_angle' | 'aspect_ratio' | 'all_passed';
}

/**
 * Check whether the mesh has converged to meet all tolerance + quality criteria.
 *
 * Quality metrics (minAngleDeg, maxAspectRatio) are first-class convergence
 * criteria, not just diagnostic values. This addresses review issues A3 and C6.
 *
 * @param current - Current convergence state snapshot.
 * @param tolerances - Tolerance thresholds to meet.
 * @returns Convergence result with the blocking reason (if any).
 */
export function isConverged(
    current: ConvergenceState,
    tolerances: ExportTolerances,
): ConvergenceCheckResult {
    if (current.maxPosError > tolerances.epsPosMm) {
        return { converged: false, reason: 'pos_error' };
    }
    if (current.maxNormalError > tolerances.epsNormalDeg) {
        return { converged: false, reason: 'normal_error' };
    }
    if (current.minAngleDeg < (tolerances.minTriangleAngleDeg ?? 18)) {
        return { converged: false, reason: 'min_angle' };
    }
    if (current.maxAspectRatio > (tolerances.maxAspectRatio ?? 20)) {
        return { converged: false, reason: 'aspect_ratio' };
    }
    return { converged: true, reason: 'all_passed' };
}
