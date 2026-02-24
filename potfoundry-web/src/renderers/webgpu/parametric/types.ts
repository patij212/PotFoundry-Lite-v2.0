/**
 * parametric/types.ts — Shared types and constants for the parametric export pipeline.
 *
 * Extracted from ParametricExportComputer.ts to enable modular architecture.
 */

import type { MeshData, PotDimensions, StyleOptions, StyleId } from '../../../geometry/types';

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

/** GPU re-snap: candidates per chain point for parabolic refinement */
export const RESNAP_CANDIDATES = 32;

/** Minimum prominence for a feature peak (fraction of max curvature) */
export const FEATURE_PROMINENCE_THRESHOLD = 0.08;

// ============================================================================
// Progress Reporting
// ============================================================================

export type ProgressCallback = (phase: string, fraction: number) => void;
