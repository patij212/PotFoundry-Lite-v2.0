/**
 * AdaptiveRefinement — Iterative error-driven mesh refinement to tolerance.
 *
 * Implements a refinement loop that:
 * 1. Estimates per-triangle position and normal error against the analytic surface
 * 2. Marks triangles exceeding profile tolerances
 * 3. Splits the worst triangles by inserting midpoints on their longest edges
 * 4. Reprojects new vertices to the analytic surface via GPU evaluator
 * 5. Preserves constrained feature edges from the FeatureEdgeGraph
 * 6. Repeats until tolerances pass, budget exhausted, or max iterations reached
 *
 * Error metrics:
 * - **Position error (chord error)**: distance from edge midpoint to analytic surface.
 *   Estimated by comparing the linear 3D midpoint with the GPU-evaluated on-surface point.
 * - **Normal error**: angle between the flat triangle normal and the averaged analytic
 *   normals at the triangle's vertices.
 *
 * @module AdaptiveRefinement
 * @see QualityProfiles.ts for tolerance definitions
 * @see FeatureEdgeGraph.ts for constraint preservation
 * @see MeshSubdivision.ts for the single-pass subdivision predecessor
 */

import type { ExportTolerances, QualityProfile } from './types';
import { SEAM_PROXIMITY_THRESHOLD, SEAM_WRAP_ZONE } from './types';
import type { FeatureEdgeGraph } from './FeatureEdgeGraph';
import { isFeatureEdge } from './FeatureEdgeGraph';
import type { EvaluateMidpointsFn } from './MeshSubdivision';
import { collapseOverBudgetEdges } from './EdgeCollapser';
import { edgeKey } from './ChainStripOptimizer';
import {
    anisotropicSplitPriority,
    computeVertexMetrics,
    estimateSurfaceArea,
    metricEdgeLengthSq,
    RunningStats,
    targetEdgeLength,
} from './SurfaceMetric';
import type { ConvergenceState } from './contracts';
import { isConverged } from './contracts';

/**
 * Per-vertex metric tensor data from SurfaceMetric.computeVertexMetrics().
 */
export type VertexMetrics = { E: Float32Array; F: Float32Array; G: Float32Array; vertexCount: number };

/**
 * Compute per-iteration metric statistics from vertex metrics + mesh.
 * Returns anisotropy ratios, mean metric edge length, and CV.
 */
function computeMetricStats(
    metrics: VertexMetrics,
    indices: Uint32Array,
    outerIdxCount: number,
    uvs: Float32Array,
): RefinementIterationStats['metricStats'] {
    const outerTriCount = Math.floor(outerIdxCount / 3);
    if (outerTriCount === 0) return undefined;

    // ── Anisotropy: eigenvalue ratio per vertex ────────────────────
    let anisoSum = 0, anisoMax = 0, anisoCount = 0;
    for (let v = 0; v < metrics.vertexCount; v++) {
        const E = metrics.E[v], F = metrics.F[v], G = metrics.G[v];
        if (E === 0 && G === 0) continue;
        // Eigenvalues of [[E, F], [F, G]]
        const trace = E + G;
        const det = E * G - F * F;
        const disc = Math.max(0, trace * trace - 4 * det);
        const sqrtDisc = Math.sqrt(disc);
        const lam1 = (trace + sqrtDisc) * 0.5;
        const lam2 = (trace - sqrtDisc) * 0.5;
        const ratio = lam2 > 1e-12 ? lam1 / lam2 : 1;
        anisoSum += ratio;
        if (ratio > anisoMax) anisoMax = ratio;
        anisoCount++;
    }
    const meanAnisotropy = anisoCount > 0 ? anisoSum / anisoCount : 1;

    // ── Metric edge lengths (Phase 11.3: RunningStats streaming) ───
    const edgeStats = new RunningStats();
    for (let t = 0; t < outerTriCount; t++) {
        const base = t * 3;
        const i0 = indices[base], i1 = indices[base + 1], i2 = indices[base + 2];
        const pairs: [number, number][] = [[i0, i1], [i1, i2], [i2, i0]];
        for (const [a, b] of pairs) {
            const lenSq = metricEdgeLengthSq(metrics, uvs, a, b);
            edgeStats.push(Math.sqrt(Math.max(0, lenSq)));
        }
    }

    return {
        meanAnisotropy,
        maxAnisotropy: anisoMax,
        meanMetricEdgeLen: edgeStats.mean,
        edgeLengthCV: edgeStats.cv,
    };
}

/**
 * Per-triangle error measurement.
 */
export interface TriangleError {
    /** Triangle offset in the index buffer (byte offset = triIdx * 3). */
    triIdx: number;
    /** Maximum chord error (mm) for this triangle's edges. */
    posErrorMm: number;
    /** Normal deviation (degrees) between flat normal and analytic normal. */
    normalErrorDeg: number;
    /** Index of the longest edge (0, 1, or 2 within the triangle). */
    longestEdgeIdx: number;
    /** Squared length of the longest edge in 3D. */
    longestEdgeLenSq: number;
}

/**
 * Per-edge error measurement (Phase 8.2 — A2).
 *
 * Each edge stores its own chord error + the max normal error from adjacent
 * triangles. This replaces the per-triangle "longest edge" heuristic with
 * direct per-edge measurement. Shared edges between two triangles receive
 * the maximum adjacent normal error.
 */
export interface EdgeError {
    /** First vertex of the edge. */
    v0: number;
    /** Second vertex of the edge. */
    v1: number;
    /** Chord error (mm) — distance from linear midpoint to surface. */
    chordErrorMm: number;
    /** Maximum normal error (degrees) from adjacent triangles. */
    maxAdjacentNormalErrorDeg: number;
    /** Metric-weighted edge length (mm). Falls back to Euclidean if no metrics. */
    metricLength: number;
    /** Canonical edge key (bigint from edgeKey() function). */
    edgeKey: bigint;
    /** Predicted error reduction if this edge is split (Phase 8.3 — A5). */
    predictedReduction: number;
}

/**
 * Predict the chord error reduction from splitting an edge.
 *
 * For a circular arc of curvature κ and chord length L, the sagitta
 * (maximum deviation) is: s ≈ κL²/8 for small κL.
 * After splitting into two chords of length L/2:
 *   new sagitta ≈ κ(L/2)²/8 = κL²/32 = s/4
 * So the expected reduction is ~75% of the original sagitta.
 *
 * If curvature is not available, assume the reduction is proportional
 * to the original error (heuristic: ~75% reduction).
 *
 * @param chordError - Current chord error for this edge (mm).
 * @param edgeLengthMm - Euclidean 3D edge length (mm).
 * @param principalCurvature - Estimated principal curvature (1/mm). Use 0 for unknown.
 * @returns Predicted chord error after splitting (mm).
 */
export function predictSplitReduction(
    chordError: number,
    edgeLengthMm: number,
    principalCurvature: number = 0,
): number {
    if (principalCurvature > 1e-12) {
        // Analytic prediction: new sagitta ≈ κ(L/2)²/8
        const halfLenError = principalCurvature * (edgeLengthMm / 2) ** 2 / 8;
        return Math.max(0, chordError - halfLenError);
    }
    // Heuristic: splitting halves the chord, reducing sagitta by ~75%
    return chordError * 0.25;
}

/**
 * Configuration for the adaptive refinement loop.
 */
export interface RefinementConfig {
    /** Quality profile controlling tolerance thresholds and iteration cap. */
    profile: QualityProfile;
    /** Effective tolerances (may include user overrides). */
    tolerances: ExportTolerances;
    /** Maximum total triangles allowed (safety budget cap). */
    maxTriangles: number;
    /** Feature-edge graph (edges that must not be split). */
    featureGraph: FeatureEdgeGraph;
    /** Number of outer-wall indices (only outer-wall triangles are refined). */
    outerIdxCount: number;
    /**
     * Per-vertex metric tensor data for metric-aware edge scoring.
     * When provided, edge-split priority uses anisotropic metric lengths
     * instead of Euclidean 3D edge lengths. This concentrates refinement
     * where the UV→3D mapping is most distorted.
     */
    vertexMetrics?: VertexMetrics;
    /**
     * Optional GPU-accelerated error estimation callback.
     * When provided, this is used instead of estimateErrorsGPU/estimateErrorsCPU.
     * The callback receives the current mesh state and returns per-triangle errors.
     */
    gpuEstimateErrors?: (
        positions: Float32Array,
        uvs: Float32Array,
        indices: Uint32Array,
        outerIdxCount: number,
    ) => Promise<TriangleError[]>;
    /**
     * Enable QEM edge collapse to remove over-tessellated edges.
     * When true, the refinement loop will collapse short edges after each
     * split+cleanup pass to keep triangle count under budget.
     */
    edgeCollapseEnabled?: boolean;
    /**
     * Enable per-edge error estimation instead of per-triangle.
     * When true, chord error is measured on every edge directly and the
     * highest-error edges are split, rather than splitting the longest
     * edge of the highest-error triangle.
     */
    perEdgeErrorEstimation?: boolean;
}

/**
 * Per-iteration snapshot for diagnostics.
 */
export interface RefinementIterationStats {
    /** Iteration number (0-based). */
    iteration: number;
    /** Number of triangles above position tolerance. */
    overPositionCount: number;
    /** Number of triangles above normal tolerance. */
    overNormalCount: number;
    /** Maximum position error across all triangles (mm). */
    maxPosErrorMm: number;
    /** Maximum normal error across all triangles (degrees). */
    maxNormalErrorDeg: number;
    /** p95 position error (mm). */
    p95PosErrorMm: number;
    /** p95 normal error (degrees). */
    p95NormalErrorDeg: number;
    /** Number of edges actually split this iteration. */
    splitCount: number;
    /** Total triangle count after this iteration. */
    totalTriangles: number;
    /** Time for this iteration (ms). */
    timeMs: number;
    /** Metric-aware stats (only when vertexMetrics provided). */
    metricStats?: {
        /** Mean anisotropy ratio across triangles. */
        meanAnisotropy: number;
        /** Max anisotropy ratio across triangles. */
        maxAnisotropy: number;
        /** Mean metric-weighted edge length (mm). */
        meanMetricEdgeLen: number;
        /** Coefficient of variation of metric edge lengths. */
        edgeLengthCV: number;
    };
}

/**
 * Result of the adaptive refinement loop.
 */
export interface RefinementResult {
    /** Final vertex positions (may be a grown copy). */
    positions: Float32Array;
    /** Final UV data (may be a grown copy). */
    uvs: Float32Array;
    /** Final triangle index buffer (may be a grown copy). */
    indices: Uint32Array;
    /** Whether all tolerances are satisfied. */
    tolerancesPassed: boolean;
    /** Number of refinement iterations performed. */
    iterationsPerformed: number;
    /** Per-iteration diagnostics. */
    iterationStats: RefinementIterationStats[];
    /** Overall maximum position error (mm). */
    maxPosErrorMm: number;
    /** Overall maximum normal error (degrees). */
    maxNormalErrorDeg: number;
    /** Overall p95 position error (mm). */
    p95PosErrorMm: number;
    /** Overall p95 normal error (degrees). */
    p95NormalErrorDeg: number;
    /** Reason refinement stopped. */
    stopReason: 'tolerances_passed' | 'max_iterations' | 'budget_exhausted' | 'no_improvement' | 'zero_iterations' | 'diminishing_returns';
}

// ============================================================================
// Seam-Safe UV Utility
// ============================================================================

/**
 * Compute the midpoint of two U coordinates handling seam wrapping at u=0/1.
 *
 * When the two U values span the periodic seam boundary (difference > 0.5),
 * the shorter arc through the boundary is used instead of the naive average
 * which would place the midpoint at u≈0.5.
 *
 * @param u0 - First U coordinate in [0, 1].
 * @param u1 - Second U coordinate in [0, 1].
 * @returns Midpoint U value in [0, 1].
 */
export function seamSafeMidpointU(u0: number, u1: number): number {
    const gap = Math.abs(u1 - u0);
    // Only apply seam wrapping when both endpoints are near opposite seam
    // boundaries (one near 0, one near 1). SEAM_WRAP_ZONE defines how close
    // to the boundary a vertex must be to qualify as seam-adjacent.
    // This prevents false positives for UVs that span the full [0,1] range
    // in non-cylindrical parametrizations (e.g., flat test meshes).
    const SEAM_ZONE = SEAM_WRAP_ZONE;
    if (gap > 0.5) {
        const lo = Math.min(u0, u1);
        const hi = Math.max(u0, u1);
        if (lo < SEAM_ZONE && hi > 1 - SEAM_ZONE && lo > 0 && hi < 1) {
            // True seam crossing: wrap the smaller value by +1, average, then normalize
            let mid: number;
            if (u0 < u1) {
                mid = ((u0 + 1) + u1) * 0.5;
            } else {
                mid = (u0 + (u1 + 1)) * 0.5;
            }
            if (mid >= 1) mid -= 1;
            return mid;
        }
    }
    return (u0 + u1) * 0.5;
}

// ============================================================================
// Error Estimation
// ============================================================================

/**
 * Compute a flat triangle normal from three vertex positions.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param i0 - First vertex index.
 * @param i1 - Second vertex index.
 * @param i2 - Third vertex index.
 * @returns Unit normal [nx, ny, nz], or [0,0,0] for degenerate triangles.
 */
export function triangleNormal(
    positions: Float32Array,
    i0: number,
    i1: number,
    i2: number,
): [number, number, number] {
    const ax = positions[i1 * 3] - positions[i0 * 3];
    const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
    const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
    const bx = positions[i2 * 3] - positions[i0 * 3];
    const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
    const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) return [0, 0, 0];
    return [nx / len, ny / len, nz / len];
}

/**
 * Estimate the chord error for a triangle edge.
 *
 * The chord error is the distance between the linear 3D midpoint of
 * the edge and the GPU-evaluated on-surface point at the UV midpoint.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param surfacePositions - GPU-evaluated 3D positions at edge UV midpoints.
 * @param edgeIndex - Index into the surfacePositions buffer (which edge).
 * @param v0 - First vertex index.
 * @param v1 - Second vertex index.
 * @returns Chord error in mm.
 */
export function computeChordError(
    positions: Float32Array,
    surfacePositions: Float32Array,
    edgeIndex: number,
    v0: number,
    v1: number,
): number {
    // Linear midpoint in 3D
    const mx = (positions[v0 * 3] + positions[v1 * 3]) * 0.5;
    const my = (positions[v0 * 3 + 1] + positions[v1 * 3 + 1]) * 0.5;
    const mz = (positions[v0 * 3 + 2] + positions[v1 * 3 + 2]) * 0.5;

    // GPU-evaluated on-surface point
    const sx = surfacePositions[edgeIndex * 3];
    const sy = surfacePositions[edgeIndex * 3 + 1];
    const sz = surfacePositions[edgeIndex * 3 + 2];

    const dx = mx - sx;
    const dy = my - sy;
    const dz = mz - sz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Estimate the angle between a flat triangle normal and the analytic surface
 * normal at the triangle centroid.
 *
 * @param flatNormal - Pre-computed flat normal [nx, ny, nz].
 * @param surfaceNormals - GPU-evaluated normals at centroids, packed [nx, ny, nz, ...].
 * @param centroidIndex - Index into the surfaceNormals array.
 * @returns Angle in degrees between the two normals.
 */
export function computeNormalError(
    flatNormal: [number, number, number],
    surfaceNormals: Float32Array,
    centroidIndex: number,
): number {
    const snx = surfaceNormals[centroidIndex * 3];
    const sny = surfaceNormals[centroidIndex * 3 + 1];
    const snz = surfaceNormals[centroidIndex * 3 + 2];
    const snLen = Math.sqrt(snx * snx + sny * sny + snz * snz);

    if (snLen < 1e-12) return 0;

    // Dot product of unit vectors
    const dot = flatNormal[0] * (snx / snLen) +
        flatNormal[1] * (sny / snLen) +
        flatNormal[2] * (snz / snLen);

    // Clamp to avoid NaN from floating point noise
    const clampedDot = Math.max(-1, Math.min(1, Math.abs(dot)));
    return Math.acos(clampedDot) * (180 / Math.PI);
}

/**
 * Compute the squared 3D length of a mesh edge.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param v0 - First vertex index.
 * @param v1 - Second vertex index.
 * @returns Squared edge length.
 */
export function edgeLengthSq(
    positions: Float32Array,
    v0: number,
    v1: number,
): number {
    const dx = positions[v0 * 3] - positions[v1 * 3];
    const dy = positions[v0 * 3 + 1] - positions[v1 * 3 + 1];
    const dz = positions[v0 * 3 + 2] - positions[v1 * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Compute the percentile value for a sorted array.
 *
 * @param sorted - Values sorted ascending.
 * @param p - Percentile (0-100).
 * @returns The value at the given percentile.
 */
export function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ============================================================================
// Quickselect Partial Sort (Phase 11.2 — P3)
// ============================================================================

/**
 * In-place quickselect: partially sorts the array so that elements
 * [0..k-1] are the k largest, in no particular internal order.
 *
 * Uses Hoare's quickselect with median-of-three pivot selection.
 * Average O(n), worst case O(n²), but worst case is rare with MoT.
 *
 * @param arr - Array to partition (mutated in place).
 * @param k - Number of top elements to select.
 * @param compareFn - Comparator returning negative if a should come before b
 *                    (descending order: return b - a for largest first).
 * @returns The first k elements of arr (same array reference, sliced to k).
 */
export function topK<T>(arr: T[], k: number, compareFn: (a: T, b: T) => number): T[] {
    if (k <= 0 || arr.length === 0) return [];
    if (k >= arr.length) {
        arr.sort(compareFn);
        return arr;
    }

    // Quickselect to partition the k smallest (by compareFn order) to front
    quickselect(arr, 0, arr.length - 1, k, compareFn);
    // Sort only the first k elements for stable output
    const result = arr.slice(0, k);
    result.sort(compareFn);
    return result;
}

/**
 * Quickselect algorithm (in-place). After execution, the k-th element
 * (0-based) is in its final sorted position, and all elements before it
 * are ≤ it according to compareFn.
 */
function quickselect<T>(arr: T[], lo: number, hi: number, k: number, cmp: (a: T, b: T) => number): void {
    while (lo < hi) {
        // Median-of-three pivot
        const mid = (lo + hi) >>> 1;
        if (cmp(arr[lo], arr[mid]) > 0) swap(arr, lo, mid);
        if (cmp(arr[lo], arr[hi]) > 0) swap(arr, lo, hi);
        if (cmp(arr[mid], arr[hi]) > 0) swap(arr, mid, hi);
        swap(arr, mid, lo + 1);
        const pivot = arr[lo + 1];

        let i = lo + 1;
        let j = hi;
        for (; ;) {
            while (cmp(arr[++i], pivot) < 0);
            while (cmp(arr[--j], pivot) > 0);
            if (i >= j) break;
            swap(arr, i, j);
        }
        swap(arr, lo + 1, j);

        if (j >= k) hi = j - 1;
        if (j <= k) lo = j + 1;
    }
}

function swap<T>(arr: T[], i: number, j: number): void {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}

// ============================================================================
// Edge-to-Triangle Adjacency
// ============================================================================

// Edge key function imported from ChainStripOptimizer for consistency

/**
 * Build edge→triangle adjacency for the outer-wall region.
 *
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of indices in the outer wall.
 * @returns Map from edge key to array of triangle offsets (typically 1-2).
 */
export function buildEdgeAdjacency(
    indices: Uint32Array,
    outerIdxCount: number,
): Map<bigint, number[]> {
    const adj = new Map<bigint, number[]>();
    for (let t = 0; t < outerIdxCount; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) continue;
        for (const key of [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]) {
            const list = adj.get(key);
            if (list) list.push(t);
            else adj.set(key, [t]);
        }
    }
    return adj;
}

// ============================================================================
// Single-Pass Error Estimation (CPU-only, no GPU round-trip)
// ============================================================================

/**
 * Estimate per-triangle errors using CPU-only heuristics when GPU
 * evaluation is not available (used in tests and as a fast pre-filter).
 *
 * Position error is estimated as: longest_edge_length * curvature_proxy / 8.
 * This is the second-order chord error bound for a circular arc.
 *
 * Normal error is estimated from the dihedral angle to adjacent triangles.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param tolerances - Tolerance thresholds.
 * @returns Array of TriangleError for all outer-wall triangles.
 */
export function estimateErrorsCPU(
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    _tolerances: ExportTolerances,
    uvs?: Float32Array,
    vertexMetrics?: VertexMetrics,
): TriangleError[] {
    const errors: TriangleError[] = [];
    const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);

    for (let t = 0; t < outerIdxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        // Edge lengths (squared) — use metric length when available
        const useMetric = !!(vertexMetrics && uvs);
        const edges: Array<{ v0: number; v1: number; lenSq: number }> = [
            { v0: i0, v1: i1, lenSq: useMetric ? metricEdgeLengthSq(vertexMetrics!, uvs!, i0, i1) : edgeLengthSq(positions, i0, i1) },
            { v0: i1, v1: i2, lenSq: useMetric ? metricEdgeLengthSq(vertexMetrics!, uvs!, i1, i2) : edgeLengthSq(positions, i1, i2) },
            { v0: i2, v1: i0, lenSq: useMetric ? metricEdgeLengthSq(vertexMetrics!, uvs!, i2, i0) : edgeLengthSq(positions, i2, i0) },
        ];

        // Longest edge (by metric or Euclidean, depending on availability)
        let longestIdx = 0;
        if (edges[1].lenSq > edges[longestIdx].lenSq) longestIdx = 1;
        if (edges[2].lenSq > edges[longestIdx].lenSq) longestIdx = 2;

        const longestLen = Math.sqrt(edges[longestIdx].lenSq);

        // Chord error estimate: L²/(8R) ≈ L * θ / 8
        // Use dihedral angle as curvature proxy
        const flatN = triangleNormal(positions, i0, i1, i2);
        let maxDihedralDeg = 0;

        for (const edge of edges) {
            const key = edgeKey(edge.v0, edge.v1);
            const tris = edgeAdj.get(key);
            if (!tris || tris.length < 2) continue;

            for (const nt of tris) {
                if (nt === t) continue;
                const ni0 = indices[nt], ni1 = indices[nt + 1], ni2 = indices[nt + 2];
                const neighborN = triangleNormal(positions, ni0, ni1, ni2);
                const dot = flatN[0] * neighborN[0] + flatN[1] * neighborN[1] + flatN[2] * neighborN[2];
                const clampedDot = Math.max(-1, Math.min(1, dot));
                const angDeg = Math.acos(clampedDot) * (180 / Math.PI);
                if (angDeg > maxDihedralDeg) maxDihedralDeg = angDeg;
            }
        }

        // Position error estimate: second-order chord error bound
        // For a circular arc of chord length L, the sagitta = L²θ/(8), where θ is the turning angle.
        const thetaRad = maxDihedralDeg * (Math.PI / 180);
        const posErrorMm = longestLen * thetaRad / 8;

        errors.push({
            triIdx: t,
            posErrorMm,
            normalErrorDeg: maxDihedralDeg,
            longestEdgeIdx: longestIdx,
            longestEdgeLenSq: edges[longestIdx].lenSq,
        });
    }

    return errors;
}

// ============================================================================
// GPU-Assisted Error Estimation
// ============================================================================

/**
 * Estimate per-triangle errors using GPU surface evaluation.
 *
 * For each outer-wall triangle:
 * 1. Computes the UV midpoint of the longest edge
 * 2. Batches all midpoints for GPU evaluation
 * 3. Measures chord error (linear midpoint vs on-surface point)
 * 4. Estimates normal error from the dihedral angle heuristic
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,t,surfaceId,...] UV data.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param evaluateMidpoints - GPU callback: UV → 3D surface positions.
 * @param tolerances - Tolerance thresholds (for context, not filtering).
 * @returns Array of TriangleError for all outer-wall triangles.
 */
/**
 * Triangle info collected during error estimation batch setup.
 * @internal Shared between buildErrorEstimationBatch and computeTriangleErrors.
 */
interface TriInfo {
    triOffset: number;
    i0: number; i1: number; i2: number;
    longestEdgeIdx: number;
    longestEdgeLenSq: number;
    edge: { v0: number; v1: number };
}

/**
 * Build the UV batch and triangle info needed for GPU error estimation.
 *
 * This is the synchronous "setup" phase of error estimation. It collects
 * triangle metadata and builds a Float32Array of UV sample points to
 * evaluate on the surface.
 *
 * @param positions - Vertex positions (3 floats per vertex).
 * @param uvs - Vertex UVs (3 floats per vertex: u, t, surfaceId).
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of indices belonging to the outer wall.
 * @param vertexMetrics - Optional vertex metrics for metric-aware edge selection.
 * @returns Object with triInfos array and uvBatch Float32Array, or null if no triangles to process.
 */
export function buildErrorEstimationBatch(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    vertexMetrics?: VertexMetrics,
): { triInfos: TriInfo[]; uvBatch: Float32Array } | null {
    const triInfos: TriInfo[] = [];

    for (let t = 0; t < outerIdxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        // Edge lengths — use metric length when vertexMetrics available
        let e0Sq: number, e1Sq: number, e2Sq: number;
        if (vertexMetrics) {
            e0Sq = metricEdgeLengthSq(vertexMetrics, uvs, i0, i1);
            e1Sq = metricEdgeLengthSq(vertexMetrics, uvs, i1, i2);
            e2Sq = metricEdgeLengthSq(vertexMetrics, uvs, i2, i0);
        } else {
            e0Sq = edgeLengthSq(positions, i0, i1);
            e1Sq = edgeLengthSq(positions, i1, i2);
            e2Sq = edgeLengthSq(positions, i2, i0);
        }

        let longestIdx = 0;
        let longestSq = e0Sq;
        if (e1Sq > longestSq) { longestIdx = 1; longestSq = e1Sq; }
        if (e2Sq > longestSq) { longestIdx = 2; longestSq = e2Sq; }

        const edgeVerts = longestIdx === 0 ? { v0: i0, v1: i1 }
            : longestIdx === 1 ? { v0: i1, v1: i2 }
                : { v0: i2, v1: i0 };

        triInfos.push({
            triOffset: t,
            i0, i1, i2,
            longestEdgeIdx: longestIdx,
            longestEdgeLenSq: longestSq,
            edge: edgeVerts,
        });
    }

    if (triInfos.length === 0) return null;

    const N = triInfos.length;
    const edgeBatchSize = N * 3;
    const normalBatchSize = N * 3 * 3;
    const uvBatch = new Float32Array(edgeBatchSize + normalBatchSize);

    const epsilon = 1e-4;

    for (let i = 0; i < N; i++) {
        const { edge, i0, i1, i2 } = triInfos[i];

        // Edge midpoint (for chord error) — seam-safe U wrapping (Task 7.1)
        uvBatch[i * 3] = seamSafeMidpointU(uvs[edge.v0 * 3], uvs[edge.v1 * 3]);
        uvBatch[i * 3 + 1] = (uvs[edge.v0 * 3 + 1] + uvs[edge.v1 * 3 + 1]) * 0.5;
        uvBatch[i * 3 + 2] = uvs[edge.v0 * 3 + 2];

        // Triangle centroid UV — seam-safe U via circular mean only when needed (Task 7.1)
        const u0_ = uvs[i0 * 3], u1_ = uvs[i1 * 3], u2_ = uvs[i2 * 3];
        const uMin = Math.min(u0_, u1_, u2_);
        const uMax = Math.max(u0_, u1_, u2_);
        let cu: number;
        if (uMax - uMin > 0.5 && uMin > 0 && uMax < 1) {
            const sinSum = Math.sin(u0_ * 2 * Math.PI) + Math.sin(u1_ * 2 * Math.PI) + Math.sin(u2_ * 2 * Math.PI);
            const cosSum = Math.cos(u0_ * 2 * Math.PI) + Math.cos(u1_ * 2 * Math.PI) + Math.cos(u2_ * 2 * Math.PI);
            cu = Math.atan2(sinSum, cosSum) / (2 * Math.PI);
            if (cu < 0) cu += 1;
        } else {
            cu = (u0_ + u1_ + u2_) / 3;
        }
        const ct = (uvs[i0 * 3 + 1] + uvs[i1 * 3 + 1] + uvs[i2 * 3 + 1]) / 3;
        const surfId = uvs[i0 * 3 + 2];

        const baseIdx = edgeBatchSize + i * 9;

        uvBatch[baseIdx] = cu;
        uvBatch[baseIdx + 1] = ct;
        uvBatch[baseIdx + 2] = surfId;

        uvBatch[baseIdx + 3] = cu + epsilon;
        uvBatch[baseIdx + 4] = ct;
        uvBatch[baseIdx + 5] = surfId;

        uvBatch[baseIdx + 6] = cu;
        uvBatch[baseIdx + 7] = ct + epsilon;
        uvBatch[baseIdx + 8] = surfId;
    }

    return { triInfos, uvBatch };
}

/**
 * Compute triangle errors from pre-evaluated surface positions.
 *
 * This is the synchronous "computation" phase of error estimation.
 * It takes the GPU-evaluated positions and computes chord error and
 * normal deviation for each triangle.
 *
 * @param positions - Vertex positions (3 floats per vertex).
 * @param allPositions - GPU-evaluated positions from evaluateMidpoints.
 * @param triInfos - Triangle info from buildErrorEstimationBatch.
 * @returns Array of TriangleError for each triangle.
 */
export function computeTriangleErrors(
    positions: Float32Array,
    allPositions: Float32Array,
    triInfos: TriInfo[],
): TriangleError[] {
    const errors: TriangleError[] = [];
    const N = triInfos.length;

    for (let i = 0; i < N; i++) {
        const info = triInfos[i];
        const { triOffset, i0, i1, i2, edge } = info;

        // Chord error from edge midpoint (first N entries in batch)
        const posErr = computeChordError(positions, allPositions, i, edge.v0, edge.v1);

        // Analytic surface normal via finite-difference (Task 2.1 + 2.2)
        const fdBase = N + i * 3;
        const p0x = allPositions[fdBase * 3], p0y = allPositions[fdBase * 3 + 1], p0z = allPositions[fdBase * 3 + 2];
        const p1x = allPositions[(fdBase + 1) * 3], p1y = allPositions[(fdBase + 1) * 3 + 1], p1z = allPositions[(fdBase + 1) * 3 + 2];
        const p2x = allPositions[(fdBase + 2) * 3], p2y = allPositions[(fdBase + 2) * 3 + 1], p2z = allPositions[(fdBase + 2) * 3 + 2];

        const dPdu_x = p1x - p0x, dPdu_y = p1y - p0y, dPdu_z = p1z - p0z;
        const dPdt_x = p2x - p0x, dPdt_y = p2y - p0y, dPdt_z = p2z - p0z;

        const anx = dPdu_y * dPdt_z - dPdu_z * dPdt_y;
        const any_ = dPdu_z * dPdt_x - dPdu_x * dPdt_z;
        const anz = dPdu_x * dPdt_y - dPdu_y * dPdt_x;
        const anLen = Math.sqrt(anx * anx + any_ * any_ + anz * anz);

        let normalErrorDeg = 0;
        if (anLen > 1e-12) {
            const anNx = anx / anLen, anNy = any_ / anLen, anNz = anz / anLen;
            const flatN = triangleNormal(positions, i0, i1, i2);
            const dot = flatN[0] * anNx + flatN[1] * anNy + flatN[2] * anNz;
            const clampedDot = Math.max(-1, Math.min(1, Math.abs(dot)));
            normalErrorDeg = Math.acos(clampedDot) * (180 / Math.PI);
        }

        errors.push({
            triIdx: triOffset,
            posErrorMm: posErr,
            normalErrorDeg,
            longestEdgeIdx: info.longestEdgeIdx,
            longestEdgeLenSq: info.longestEdgeLenSq,
        });
    }

    return errors;
}

/**
 * Estimate per-triangle errors using GPU-evaluated surface positions.
 *
 * Convenience wrapper that combines buildErrorEstimationBatch, evaluateMidpoints,
 * and computeTriangleErrors. For use in contexts where a single async call is
 * preferred (e.g., standalone error estimation). The adaptiveRefine loop uses
 * the split helpers directly to avoid nested promise chains.
 *
 * @param positions - Vertex positions (3 floats per vertex).
 * @param uvs - Vertex UVs (3 floats per vertex).
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param evaluateMidpoints - GPU callback for surface evaluation.
 * @param _tolerances - Export tolerances (used for threshold checks).
 * @param vertexMetrics - Optional vertex metrics for metric-aware selection.
 * @returns Promise resolving to array of TriangleError.
 */
export async function estimateErrorsGPU(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    evaluateMidpoints: EvaluateMidpointsFn,
    _tolerances: ExportTolerances,
    vertexMetrics?: VertexMetrics,
): Promise<TriangleError[]> {
    const batch = buildErrorEstimationBatch(positions, uvs, indices, outerIdxCount, vertexMetrics);
    if (!batch) return [];

    const allPositions = await evaluateMidpoints(batch.uvBatch);
    return computeTriangleErrors(positions, allPositions, batch.triInfos);
}

// ============================================================================
// Per-Edge Error Estimation (Phase 8.1 + 8.2 — A1, A2)
// ============================================================================

/**
 * Estimate per-edge chord error by evaluating ALL edge midpoints via GPU.
 *
 * Unlike `estimateErrorsGPU` (which only evaluates the longest edge per
 * triangle), this function evaluates every unique edge. Each edge's chord
 * error is the distance from its linear 3D midpoint to the GPU-evaluated
 * on-surface point at the UV midpoint. Normal error is taken as the max
 * from the edge's two adjacent triangles.
 *
 * @param positions - Packed vertex positions [x,y,z,...].
 * @param uvs - Packed UV data [u,t,surfaceId,...].
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param evaluateMidpoints - GPU callback for surface evaluation.
 * @param tolerances - Tolerance thresholds.
 * @param vertexMetrics - Optional metric tensor data for metric-aware lengths.
 * @returns Array of per-edge error measurements, sorted by priority descending.
 */
export async function estimateEdgeErrors(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    evaluateMidpoints: EvaluateMidpointsFn,
    tolerances: ExportTolerances,
    vertexMetrics?: VertexMetrics,
): Promise<EdgeError[]> {
    // ── 1. Collect unique edges + adjacency ──────────────────────────
    const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);

    interface EdgeInfo {
        v0: number; v1: number; key: bigint;
        adjTris: number[];
        metricLen: number;
    }
    const edgeList: EdgeInfo[] = [];

    for (const [key, tris] of edgeAdj) {
        // Decode bigint key: key = min(v0,v1) * 0x200000 + max(v0,v1)
        const v0 = Number(key / 0x200000n);
        const v1 = Number(key % 0x200000n);

        let mLen: number;
        if (vertexMetrics) {
            mLen = Math.sqrt(Math.max(0, metricEdgeLengthSq(vertexMetrics, uvs, v0, v1)));
        } else {
            mLen = Math.sqrt(edgeLengthSq(positions, v0, v1));
        }

        edgeList.push({ v0, v1, key, adjTris: tris, metricLen: mLen });
    }

    if (edgeList.length === 0) return [];

    // ── 2. Build UV batch for GPU evaluation ─────────────────────────
    //   For each edge: 1 midpoint for chord error
    //   For each edge: 3 centroid FD points per adjacent triangle (for normal error)
    //   Total per edge: 1 + 3×adjTris points
    //   Optimization: compute centroid normals per-triangle once, map to edges later.

    // Build UV batch for all edge midpoints + all triangle centroids with FD
    const epsilon = 1e-4;
    const numEdges = edgeList.length;
    // Edge midpoints
    const edgeMidpointBatch = new Float32Array(numEdges * 3);
    for (let i = 0; i < numEdges; i++) {
        const { v0, v1 } = edgeList[i];
        edgeMidpointBatch[i * 3] = seamSafeMidpointU(uvs[v0 * 3], uvs[v1 * 3]);
        edgeMidpointBatch[i * 3 + 1] = (uvs[v0 * 3 + 1] + uvs[v1 * 3 + 1]) * 0.5;
        edgeMidpointBatch[i * 3 + 2] = uvs[v0 * 3 + 2];
    }

    // Triangle centroid + FD batch (3 points per unique triangle)
    const triProcessed = new Map<number, number>(); // triOffset → triIndex
    for (let t = 0; t < outerIdxCount; t += 3) {
        if (indices[t] === indices[t + 1]) continue; // skip degenerate
        triProcessed.set(t, triProcessed.size);
    }
    const numTris = triProcessed.size;
    const centroidBatch = new Float32Array(numTris * 3 * 3);
    for (const [triOff, triIdx] of triProcessed) {
        const i0 = indices[triOff], i1 = indices[triOff + 1], i2 = indices[triOff + 2];
        const u0_ = uvs[i0 * 3], u1_ = uvs[i1 * 3], u2_ = uvs[i2 * 3];
        const uMin = Math.min(u0_, u1_, u2_);
        const uMax = Math.max(u0_, u1_, u2_);
        let cu: number;
        if (uMax - uMin > 0.5 && uMin > 0 && uMax < 1) {
            const sinSum = Math.sin(u0_ * 2 * Math.PI) + Math.sin(u1_ * 2 * Math.PI) + Math.sin(u2_ * 2 * Math.PI);
            const cosSum = Math.cos(u0_ * 2 * Math.PI) + Math.cos(u1_ * 2 * Math.PI) + Math.cos(u2_ * 2 * Math.PI);
            cu = Math.atan2(sinSum, cosSum) / (2 * Math.PI);
            if (cu < 0) cu += 1;
        } else {
            cu = (u0_ + u1_ + u2_) / 3;
        }
        const ct = (uvs[i0 * 3 + 1] + uvs[i1 * 3 + 1] + uvs[i2 * 3 + 1]) / 3;
        const surfId = uvs[i0 * 3 + 2];
        const base = triIdx * 9;
        centroidBatch[base] = cu; centroidBatch[base + 1] = ct; centroidBatch[base + 2] = surfId;
        centroidBatch[base + 3] = cu + epsilon; centroidBatch[base + 4] = ct; centroidBatch[base + 5] = surfId;
        centroidBatch[base + 6] = cu; centroidBatch[base + 7] = ct + epsilon; centroidBatch[base + 8] = surfId;
    }

    // Combined batch: edge midpoints then centroid FD points
    const combinedBatch = new Float32Array(edgeMidpointBatch.length + centroidBatch.length);
    combinedBatch.set(edgeMidpointBatch);
    combinedBatch.set(centroidBatch, edgeMidpointBatch.length);

    // ── 3. GPU evaluate all points in a single dispatch ──────────────
    const allPositions = await evaluateMidpoints(combinedBatch);

    // ── 4. Compute per-triangle analytic normals ─────────────────────
    const triNormalErrors = new Map<number, number>(); // triOffset → normalErrorDeg
    for (const [triOff, triIdx] of triProcessed) {
        const i0 = indices[triOff], i1 = indices[triOff + 1], i2 = indices[triOff + 2];
        const flatN = triangleNormal(positions, i0, i1, i2);

        const fdBase = numEdges + triIdx * 3;
        const p0x = allPositions[fdBase * 3], p0y = allPositions[fdBase * 3 + 1], p0z = allPositions[fdBase * 3 + 2];
        const p1x = allPositions[(fdBase + 1) * 3], p1y = allPositions[(fdBase + 1) * 3 + 1], p1z = allPositions[(fdBase + 1) * 3 + 2];
        const p2x = allPositions[(fdBase + 2) * 3], p2y = allPositions[(fdBase + 2) * 3 + 1], p2z = allPositions[(fdBase + 2) * 3 + 2];

        const dPdu_x = p1x - p0x, dPdu_y = p1y - p0y, dPdu_z = p1z - p0z;
        const dPdt_x = p2x - p0x, dPdt_y = p2y - p0y, dPdt_z = p2z - p0z;

        const anx = dPdu_y * dPdt_z - dPdu_z * dPdt_y;
        const any_ = dPdu_z * dPdt_x - dPdu_x * dPdt_z;
        const anz = dPdu_x * dPdt_y - dPdu_y * dPdt_x;
        const anLen = Math.sqrt(anx * anx + any_ * any_ + anz * anz);

        let normalErr = 0;
        if (anLen > 1e-12) {
            const anNx = anx / anLen, anNy = any_ / anLen, anNz = anz / anLen;
            const dot = flatN[0] * anNx + flatN[1] * anNy + flatN[2] * anNz;
            const clampedDot = Math.max(-1, Math.min(1, Math.abs(dot)));
            normalErr = Math.acos(clampedDot) * (180 / Math.PI);
        }
        triNormalErrors.set(triOff, normalErr);
    }

    // ── 5. Build per-edge errors ─────────────────────────────────────
    const edgeErrors: EdgeError[] = [];
    for (let i = 0; i < numEdges; i++) {
        const info = edgeList[i];

        // Chord error from edge midpoint
        const chordErr = computeChordError(positions, allPositions, i, info.v0, info.v1);

        // Max adjacent normal error
        let maxNormalErr = 0;
        for (const triOff of info.adjTris) {
            const ne = triNormalErrors.get(triOff) ?? 0;
            if (ne > maxNormalErr) maxNormalErr = ne;
        }

        // Predict split reduction (Phase 8.3 — A5)
        const euclideanLen = Math.sqrt(edgeLengthSq(positions, info.v0, info.v1));
        const reduction = predictSplitReduction(chordErr, euclideanLen);

        edgeErrors.push({
            v0: info.v0,
            v1: info.v1,
            chordErrorMm: chordErr,
            maxAdjacentNormalErrorDeg: maxNormalErr,
            metricLength: info.metricLen,
            edgeKey: info.key,
            predictedReduction: reduction,
        });
    }

    // Sort by priority: edges with highest error-to-tolerance ratio first
    edgeErrors.sort((a, b) => {
        const aRatio = Math.max(a.chordErrorMm / tolerances.epsPosMm, a.maxAdjacentNormalErrorDeg / tolerances.epsNormalDeg);
        const bRatio = Math.max(b.chordErrorMm / tolerances.epsPosMm, b.maxAdjacentNormalErrorDeg / tolerances.epsNormalDeg);
        return bRatio - aRatio;
    });

    return edgeErrors;
}

// ============================================================================
// Split Quality Guard (Task 1.4)
// ============================================================================

/**
 * Compute the minimum interior angle (degrees) of a single triangle
 * defined by three 3D positions.
 */
function triangleMinAngle(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
): number {
    // Edge vectors
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;

    const lenAB = Math.sqrt(abx * abx + aby * aby + abz * abz);
    const lenAC = Math.sqrt(acx * acx + acy * acy + acz * acz);
    const lenBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);

    if (lenAB < 1e-12 || lenAC < 1e-12 || lenBC < 1e-12) return 0;

    // Angle at A: between AB and AC
    const dotA = abx * acx + aby * acy + abz * acz;
    const angA = Math.acos(Math.max(-1, Math.min(1, dotA / (lenAB * lenAC))));

    // Angle at B: between BA and BC
    const dotB = -abx * bcx + -aby * bcy + -abz * bcz;
    const angB = Math.acos(Math.max(-1, Math.min(1, dotB / (lenAB * lenBC))));

    // Angle at C = π - angA - angB
    const angC = Math.PI - angA - angB;

    return Math.min(angA, angB, angC) * (180 / Math.PI);
}

/**
 * Check whether a 2-to-4 split produces acceptable triangle quality.
 *
 * The split replaces two triangles sharing edge (v0, v1) with four:
 *   (opp0, v0, M), (opp0, M, v1), (opp1, v1, M), (opp1, M, v0)
 *
 * @param positions - Existing vertex positions.
 * @param midPos - 3D position of the new midpoint vertex.
 * @param v0 - First edge vertex index.
 * @param v1 - Second edge vertex index.
 * @param opp0 - Opposite vertex in triangle 0.
 * @param opp1 - Opposite vertex in triangle 1.
 * @param minAngleDeg - Minimum acceptable angle in degrees.
 * @returns true if all 4 replacement triangles have min angle ≥ threshold.
 */
export function checkSplitQuality(
    positions: Float32Array,
    midPos: [number, number, number],
    v0: number, v1: number,
    opp0: number, opp1: number,
    minAngleDeg: number,
): boolean {
    const mx = midPos[0], my = midPos[1], mz = midPos[2];
    const p = positions;

    // 4 replacement triangles:
    const angles = [
        // (opp0, v0, M)
        triangleMinAngle(
            p[opp0 * 3], p[opp0 * 3 + 1], p[opp0 * 3 + 2],
            p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2],
            mx, my, mz,
        ),
        // (opp0, M, v1)
        triangleMinAngle(
            p[opp0 * 3], p[opp0 * 3 + 1], p[opp0 * 3 + 2],
            mx, my, mz,
            p[v1 * 3], p[v1 * 3 + 1], p[v1 * 3 + 2],
        ),
        // (opp1, v1, M)
        triangleMinAngle(
            p[opp1 * 3], p[opp1 * 3 + 1], p[opp1 * 3 + 2],
            p[v1 * 3], p[v1 * 3 + 1], p[v1 * 3 + 2],
            mx, my, mz,
        ),
        // (opp1, M, v0)
        triangleMinAngle(
            p[opp1 * 3], p[opp1 * 3 + 1], p[opp1 * 3 + 2],
            mx, my, mz,
            p[v0 * 3], p[v0 * 3 + 1], p[v0 * 3 + 2],
        ),
    ];

    return angles.every(a => a >= minAngleDeg);
}

// ============================================================================
// Triangle Splitting
// ============================================================================

/**
 * Split a set of triangles by inserting midpoints on their longest edges.
 *
 * Each split converts two adjacent triangles sharing the split edge into
 * four triangles (2-to-4 split). Feature edges from the FeatureEdgeGraph
 * are never selected for splitting.
 *
 * @param positions - Current vertex positions (will not be mutated).
 * @param uvs - Current UV data (will not be mutated).
 * @param indices - Current triangle indices (will not be mutated).
 * @param outerIdxCount - Number of outer-wall indices.
 * @param errors - Per-triangle error measurements, pre-sorted by score descending.
 * @param tolerances - Tolerance thresholds for filtering.
 * @param featureGraph - Feature edges to preserve.
 * @param maxSplits - Maximum number of edges to split.
 * @param evaluateMidpoints - GPU callback for surface reprojection.
 * @returns New positions, uvs, indices, and count of splits applied.
 */
export async function splitOverThresholdTriangles(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    errors: TriangleError[],
    tolerances: ExportTolerances,
    featureGraph: FeatureEdgeGraph,
    maxSplits: number,
    evaluateMidpoints: EvaluateMidpointsFn,
): Promise<{
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    splitCount: number;
}> {
    // ── 1. Build edge adjacency ──────────────────────────────────────
    const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);

    // ── 2. Select edges to split ─────────────────────────────────────
    //       Filter: over-threshold, not a feature edge, shared by exactly 2 tris.
    interface SplitCandidate {
        edgeKey: bigint;
        v0: number;
        v1: number;
        tri0: number;
        tri1: number;
    }
    const candidates: SplitCandidate[] = [];
    const touchedTris = new Set<number>();
    const touchedEdges = new Set<bigint>();

    for (const err of errors) {
        if (candidates.length >= maxSplits) break;
        if (err.posErrorMm <= tolerances.epsPosMm && err.normalErrorDeg <= tolerances.epsNormalDeg) continue;

        const t = err.triIdx;
        if (touchedTris.has(t)) continue;

        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];

        // Get the longest edge vertices
        const edgeVerts = err.longestEdgeIdx === 0 ? [i0, i1]
            : err.longestEdgeIdx === 1 ? [i1, i2]
                : [i2, i0];
        const [eV0, eV1] = edgeVerts;

        // Skip feature edges
        if (isFeatureEdge(featureGraph, eV0, eV1)) continue;

        const key = edgeKey(eV0, eV1);
        if (touchedEdges.has(key)) continue;

        // Must be shared by exactly 2 triangles
        const adjTris = edgeAdj.get(key);
        if (!adjTris || adjTris.length !== 2) continue;

        const tri1 = adjTris[0] === t ? adjTris[1] : adjTris[0];
        if (touchedTris.has(tri1)) continue;

        candidates.push({ edgeKey: key, v0: eV0, v1: eV1, tri0: t, tri1 });
        touchedTris.add(t);
        touchedTris.add(tri1);
        touchedEdges.add(key);
    }

    if (candidates.length === 0) {
        return { positions, uvs, indices, splitCount: 0 };
    }

    // ── 3. GPU evaluate midpoints ────────────────────────────────────
    const uvBatch = new Float32Array(candidates.length * 3);
    for (let i = 0; i < candidates.length; i++) {
        const { v0, v1 } = candidates[i];
        // Seam-safe UV midpoint (Task 7.1 — I2)
        uvBatch[i * 3] = seamSafeMidpointU(uvs[v0 * 3], uvs[v1 * 3]);
        uvBatch[i * 3 + 1] = (uvs[v0 * 3 + 1] + uvs[v1 * 3 + 1]) * 0.5;
        uvBatch[i * 3 + 2] = uvs[v0 * 3 + 2]; // surfaceId
    }

    const mid3D = await evaluateMidpoints(uvBatch);

    // ── 4. Apply splits ──────────────────────────────────────────────
    //       Each 2-to-4 split: replace 2 tris, add 2 new tris.
    //       With quality guard: skip splits that produce sliver triangles.
    const newPositions: number[] = [];
    const newUVs: number[] = [];
    const newTriangles: number[] = [];
    const baseVertCount = positions.length / 3;
    const minAngleThreshold = (tolerances.minTriangleAngleDeg || 18) / 2; // half the profile min
    let actualSplitCount = 0;

    // Copy indices to mutable array
    const mutableIdx = new Uint32Array(indices);

    for (let i = 0; i < candidates.length; i++) {
        const { v0, v1, tri0, tri1 } = candidates[i];

        // Find opposite vertices
        const t0a = mutableIdx[tri0], t0b = mutableIdx[tri0 + 1], t0c = mutableIdx[tri0 + 2];
        let opp0 = -1;
        for (const v of [t0a, t0b, t0c]) {
            if (v !== v0 && v !== v1) { opp0 = v; break; }
        }

        const t1a = mutableIdx[tri1], t1b = mutableIdx[tri1 + 1], t1c = mutableIdx[tri1 + 2];
        let opp1 = -1;
        for (const v of [t1a, t1b, t1c]) {
            if (v !== v0 && v !== v1) { opp1 = v; break; }
        }

        if (opp0 < 0 || opp1 < 0) continue;

        // ── Split-quality guard (Task 1.4): check that the 4 replacement
        //    triangles won't have degenerate minimum angles ──────────────
        const midPos: [number, number, number] = [
            mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2],
        ];
        if (!checkSplitQuality(positions, midPos, v0, v1, opp0, opp1, minAngleThreshold)) {
            continue; // skip this candidate — would create slivers
        }

        // Only allocate vertex AFTER quality check passes
        const midIdx = baseVertCount + actualSplitCount;
        actualSplitCount++;

        // Add midpoint vertex
        newPositions.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);
        newUVs.push(uvBatch[i * 3], uvBatch[i * 3 + 1], uvBatch[i * 3 + 2]);

        // Preserve winding order for tri0
        if ((t0a === v0 && t0b === v1) || (t0a === v1 && t0b === v0)) {
            mutableIdx[tri0] = t0a; mutableIdx[tri0 + 1] = midIdx; mutableIdx[tri0 + 2] = t0c;
            newTriangles.push(midIdx, t0b, t0c);
        } else if ((t0b === v0 && t0c === v1) || (t0b === v1 && t0c === v0)) {
            mutableIdx[tri0] = t0a; mutableIdx[tri0 + 1] = t0b; mutableIdx[tri0 + 2] = midIdx;
            newTriangles.push(t0a, midIdx, t0c);
        } else {
            mutableIdx[tri0] = midIdx; mutableIdx[tri0 + 1] = t0b; mutableIdx[tri0 + 2] = t0c;
            newTriangles.push(t0a, t0b, midIdx);
        }

        // Preserve winding order for tri1
        if ((t1a === v0 && t1b === v1) || (t1a === v1 && t1b === v0)) {
            mutableIdx[tri1] = t1a; mutableIdx[tri1 + 1] = midIdx; mutableIdx[tri1 + 2] = t1c;
            newTriangles.push(midIdx, t1b, t1c);
        } else if ((t1b === v0 && t1c === v1) || (t1b === v1 && t1c === v0)) {
            mutableIdx[tri1] = t1a; mutableIdx[tri1 + 1] = t1b; mutableIdx[tri1 + 2] = midIdx;
            newTriangles.push(t1a, midIdx, t1c);
        } else {
            mutableIdx[tri1] = midIdx; mutableIdx[tri1 + 1] = t1b; mutableIdx[tri1 + 2] = t1c;
            newTriangles.push(t1a, t1b, midIdx);
        }
    }

    // ── 5. Grow arrays ───────────────────────────────────────────────
    const finalPositions = new Float32Array(positions.length + newPositions.length);
    finalPositions.set(positions);
    for (let i = 0; i < newPositions.length; i++) {
        finalPositions[positions.length + i] = newPositions[i];
    }

    const finalUVs = new Float32Array(uvs.length + newUVs.length);
    finalUVs.set(uvs);
    for (let i = 0; i < newUVs.length; i++) {
        finalUVs[uvs.length + i] = newUVs[i];
    }

    const finalIndices = new Uint32Array(indices.length + newTriangles.length);
    finalIndices.set(mutableIdx);
    for (let i = 0; i < newTriangles.length; i++) {
        finalIndices[indices.length + i] = newTriangles[i];
    }

    return {
        positions: finalPositions,
        uvs: finalUVs,
        indices: finalIndices,
        splitCount: actualSplitCount,
    };
}

// ============================================================================
// Per-Edge Splitting (Phase 8.2 — A2)
// ============================================================================

/**
 * Split edges that exceed tolerance, using per-edge error data.
 *
 * This is the Phase 8 replacement for `splitOverThresholdTriangles`.
 * Instead of selecting the longest edge per triangle, it directly
 * considers every edge that exceeds tolerance and filters by predicted
 * reduction (Phase 8.3 — A5). Feature edges are protected.
 *
 * @param positions - Current vertex positions.
 * @param uvs - Current UV data.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param edgeErrors - Per-edge error measurements (sorted by priority).
 * @param tolerances - Tolerance thresholds.
 * @param featureGraph - Feature edges to preserve.
 * @param maxSplits - Maximum number of edges to split.
 * @param evaluateMidpoints - GPU callback for surface reprojection.
 * @returns New mesh data and split count.
 */
export async function splitEdgesOverThreshold(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    edgeErrors: EdgeError[],
    tolerances: ExportTolerances,
    featureGraph: FeatureEdgeGraph,
    maxSplits: number,
    evaluateMidpoints: EvaluateMidpointsFn,
): Promise<{
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    splitCount: number;
}> {
    const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);
    const MIN_REDUCTION_FRACTION = 0.25; // Only split if predicted reduction > 25%

    interface SplitCandidate {
        edgeKey: bigint;
        v0: number;
        v1: number;
        tri0: number;
        tri1: number;
    }
    const candidates: SplitCandidate[] = [];
    const touchedTris = new Set<number>();
    const touchedEdges = new Set<bigint>();

    for (const err of edgeErrors) {
        if (candidates.length >= maxSplits) break;

        // Must exceed at least one tolerance
        if (err.chordErrorMm <= tolerances.epsPosMm &&
            err.maxAdjacentNormalErrorDeg <= tolerances.epsNormalDeg) continue;

        // Phase 8.3: Only split if predicted reduction is worthwhile
        const originalErr = err.chordErrorMm;
        if (originalErr > 0 && err.predictedReduction > originalErr * (1 - MIN_REDUCTION_FRACTION)) continue;

        if (touchedEdges.has(err.edgeKey)) continue;

        // Skip feature edges
        if (isFeatureEdge(featureGraph, err.v0, err.v1)) continue;

        // Must be shared by exactly 2 triangles
        const adjTris = edgeAdj.get(err.edgeKey);
        if (!adjTris || adjTris.length !== 2) continue;

        const [tri0, tri1] = adjTris;
        if (touchedTris.has(tri0) || touchedTris.has(tri1)) continue;

        candidates.push({ edgeKey: err.edgeKey, v0: err.v0, v1: err.v1, tri0, tri1 });
        touchedTris.add(tri0);
        touchedTris.add(tri1);
        touchedEdges.add(err.edgeKey);
    }

    if (candidates.length === 0) {
        return { positions, uvs, indices, splitCount: 0 };
    }

    // GPU evaluate midpoints
    const uvBatch = new Float32Array(candidates.length * 3);
    for (let i = 0; i < candidates.length; i++) {
        const { v0, v1 } = candidates[i];
        uvBatch[i * 3] = seamSafeMidpointU(uvs[v0 * 3], uvs[v1 * 3]);
        uvBatch[i * 3 + 1] = (uvs[v0 * 3 + 1] + uvs[v1 * 3 + 1]) * 0.5;
        uvBatch[i * 3 + 2] = uvs[v0 * 3 + 2];
    }

    const mid3D = await evaluateMidpoints(uvBatch);

    // Apply splits (same 2-to-4 logic as splitOverThresholdTriangles)
    const newPositions: number[] = [];
    const newUVs: number[] = [];
    const newTriangles: number[] = [];
    const baseVertCount = positions.length / 3;
    const minAngleThreshold = (tolerances.minTriangleAngleDeg || 18) / 2;
    let actualSplitCount = 0;

    const mutableIdx = new Uint32Array(indices);

    for (let i = 0; i < candidates.length; i++) {
        const { v0, v1, tri0, tri1 } = candidates[i];

        // Find opposite vertices
        let opp0 = -1, opp1 = -1;
        for (let k = 0; k < 3; k++) {
            const v = mutableIdx[tri0 + k];
            if (v !== v0 && v !== v1) { opp0 = v; break; }
        }
        for (let k = 0; k < 3; k++) {
            const v = mutableIdx[tri1 + k];
            if (v !== v0 && v !== v1) { opp1 = v; break; }
        }
        if (opp0 < 0 || opp1 < 0) continue;

        const midPos: [number, number, number] = [
            mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2],
        ];
        if (!checkSplitQuality(positions, midPos, v0, v1, opp0, opp1, minAngleThreshold)) continue;

        const midIdx = baseVertCount + actualSplitCount;
        actualSplitCount++;

        newPositions.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);
        newUVs.push(uvBatch[i * 3], uvBatch[i * 3 + 1], uvBatch[i * 3 + 2]);

        // Preserve winding order for tri0
        const t0a = mutableIdx[tri0], t0b = mutableIdx[tri0 + 1], t0c = mutableIdx[tri0 + 2];
        if ((t0a === v0 && t0b === v1) || (t0a === v1 && t0b === v0)) {
            mutableIdx[tri0] = t0a; mutableIdx[tri0 + 1] = midIdx; mutableIdx[tri0 + 2] = t0c;
            newTriangles.push(midIdx, t0b, t0c);
        } else if ((t0b === v0 && t0c === v1) || (t0b === v1 && t0c === v0)) {
            mutableIdx[tri0] = t0a; mutableIdx[tri0 + 1] = t0b; mutableIdx[tri0 + 2] = midIdx;
            newTriangles.push(t0a, midIdx, t0c);
        } else {
            mutableIdx[tri0] = midIdx; mutableIdx[tri0 + 1] = t0b; mutableIdx[tri0 + 2] = t0c;
            newTriangles.push(t0a, t0b, midIdx);
        }

        // Preserve winding order for tri1
        const t1a = mutableIdx[tri1], t1b = mutableIdx[tri1 + 1], t1c = mutableIdx[tri1 + 2];
        if ((t1a === v0 && t1b === v1) || (t1a === v1 && t1b === v0)) {
            mutableIdx[tri1] = t1a; mutableIdx[tri1 + 1] = midIdx; mutableIdx[tri1 + 2] = t1c;
            newTriangles.push(midIdx, t1b, t1c);
        } else if ((t1b === v0 && t1c === v1) || (t1b === v1 && t1c === v0)) {
            mutableIdx[tri1] = t1a; mutableIdx[tri1 + 1] = t1b; mutableIdx[tri1 + 2] = midIdx;
            newTriangles.push(t1a, midIdx, t1c);
        } else {
            mutableIdx[tri1] = midIdx; mutableIdx[tri1 + 1] = t1b; mutableIdx[tri1 + 2] = t1c;
            newTriangles.push(t1a, t1b, midIdx);
        }
    }

    const finalPositions = new Float32Array(positions.length + newPositions.length);
    finalPositions.set(positions);
    for (let i = 0; i < newPositions.length; i++) finalPositions[positions.length + i] = newPositions[i];

    const finalUVs = new Float32Array(uvs.length + newUVs.length);
    finalUVs.set(uvs);
    for (let i = 0; i < newUVs.length; i++) finalUVs[uvs.length + i] = newUVs[i];

    const finalIndices = new Uint32Array(indices.length + newTriangles.length);
    finalIndices.set(mutableIdx);
    for (let i = 0; i < newTriangles.length; i++) finalIndices[indices.length + i] = newTriangles[i];

    return {
        positions: finalPositions,
        uvs: finalUVs,
        indices: finalIndices,
        splitCount: actualSplitCount,
    };
}

// ============================================================================
// Local Edge-Flip Cleanup (Task 3.1)
// ============================================================================

/**
 * Run a local edge-flip pass over the neighborhood of affected vertices.
 *
 * For each non-feature, non-boundary edge shared by two triangles in the
 * affected region, flip it if the flip improves the minimum angle of the
 * two-triangle quad. This is the standard Delaunay maintenance step.
 *
 * @param indices - Mutable triangle index buffer.
 * @param positions - Vertex positions.
 * @param affectedVertices - Set of vertex indices that were recently inserted.
 * @param featureGraph - Feature edges that must not be flipped.
 * @param outerIdxCount - Number of outer-wall indices.
 * @returns Number of edges flipped.
 */
export function localEdgeFlip(
    indices: Uint32Array,
    positions: Float32Array,
    affectedVertices: Set<number>,
    featureGraph: FeatureEdgeGraph,
    outerIdxCount: number,
    maxPasses: number = 3,
): number {
    let totalFlips = 0;

    for (let pass = 0; pass < maxPasses; pass++) {
        // Rebuild adjacency fresh each pass to avoid stale references
        const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);
        let passFlips = 0;

        for (const [key, tris] of edgeAdj) {
            if (tris.length !== 2) continue;

            // Decode bigint key: key = min(eA,eB) * 0x200000 + max(eA,eB)
            const eA = Number(key / 0x200000n);
            const eB = Number(key % 0x200000n);

            // Only process edges touching affected vertices
            if (!affectedVertices.has(eA) && !affectedVertices.has(eB)) continue;

            // Skip feature edges
            if (isFeatureEdge(featureGraph, eA, eB)) continue;

            const t0 = tris[0], t1 = tris[1];

            // Find opposite vertices
            let opp0 = -1, opp1 = -1;
            for (let k = 0; k < 3; k++) {
                const v = indices[t0 + k];
                if (v !== eA && v !== eB) opp0 = v;
            }
            for (let k = 0; k < 3; k++) {
                const v = indices[t1 + k];
                if (v !== eA && v !== eB) opp1 = v;
            }
            if (opp0 < 0 || opp1 < 0 || opp0 === opp1) continue;

            // Compute min angle before flip
            const minBefore = Math.min(
                triangleMinAngle(
                    positions[eA * 3], positions[eA * 3 + 1], positions[eA * 3 + 2],
                    positions[eB * 3], positions[eB * 3 + 1], positions[eB * 3 + 2],
                    positions[opp0 * 3], positions[opp0 * 3 + 1], positions[opp0 * 3 + 2],
                ),
                triangleMinAngle(
                    positions[eA * 3], positions[eA * 3 + 1], positions[eA * 3 + 2],
                    positions[eB * 3], positions[eB * 3 + 1], positions[eB * 3 + 2],
                    positions[opp1 * 3], positions[opp1 * 3 + 1], positions[opp1 * 3 + 2],
                ),
            );

            // Compute min angle after flip (edge becomes opp0-opp1)
            const minAfter = Math.min(
                triangleMinAngle(
                    positions[opp0 * 3], positions[opp0 * 3 + 1], positions[opp0 * 3 + 2],
                    positions[opp1 * 3], positions[opp1 * 3 + 1], positions[opp1 * 3 + 2],
                    positions[eA * 3], positions[eA * 3 + 1], positions[eA * 3 + 2],
                ),
                triangleMinAngle(
                    positions[opp0 * 3], positions[opp0 * 3 + 1], positions[opp0 * 3 + 2],
                    positions[opp1 * 3], positions[opp1 * 3 + 1], positions[opp1 * 3 + 2],
                    positions[eB * 3], positions[eB * 3 + 1], positions[eB * 3 + 2],
                ),
            );

            if (minAfter > minBefore + 0.5) { // require at least 0.5° improvement
                // Apply flip: replace (eA, eB, opp0) + (eA, eB, opp1) → (opp0, opp1, eA) + (opp0, opp1, eB)
                indices[t0] = opp0; indices[t0 + 1] = opp1; indices[t0 + 2] = eA;
                indices[t1] = opp0; indices[t1 + 1] = opp1; indices[t1 + 2] = eB;
                passFlips++;
            }
        }

        totalFlips += passFlips;
        if (passFlips === 0) break; // No further improvement possible
    }

    return totalFlips;
}

// ============================================================================
// Vertex Smoothing (Task 3.2)
// ============================================================================

/**
 * Apply Laplacian smoothing to newly inserted midpoint vertices.
 *
 * Moves each new vertex's UV to the average of its neighbor UVs, then
 * re-evaluates the surface position via the GPU evaluator.
 * Only operates on vertices with index ≥ newVertexStart.
 * Feature vertices are not moved.
 *
 * @param positions - Current positions (will be mutated with re-projected values).
 * @param uvs - Current UVs (will be mutated with smoothed values).
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param newVertexStart - Index of the first new vertex.
 * @param featureGraph - Feature edges (vertices on feature edges don't move).
 * @param evaluateMidpoints - GPU callback for surface re-projection.
 * @param smoothIterations - Number of smoothing passes (default: 1).
 * @returns Updated positions after re-projection.
 */
export async function smoothNewVertices(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    newVertexStart: number,
    featureGraph: FeatureEdgeGraph,
    evaluateMidpoints: EvaluateMidpointsFn,
    smoothIterations: number = 1,
): Promise<void> {
    if (newVertexStart >= positions.length / 3) return;

    // Build vertex adjacency for new vertices
    const newVertexCount = (positions.length / 3) - newVertexStart;
    if (newVertexCount <= 0) return;

    // Identify feature-adjacent vertices (don't smooth them)
    const featureVerts = new Set<number>();
    if (featureGraph.edges.length > 0) {
        for (const edge of featureGraph.edges) {
            featureVerts.add(edge.v0);
            featureVerts.add(edge.v1);
        }
    }

    for (let pass = 0; pass < smoothIterations; pass++) {
        // Build neighbor lists for new vertices
        const neighbors = new Map<number, Set<number>>();
        for (let t = 0; t < outerIdxCount; t += 3) {
            const tri = [indices[t], indices[t + 1], indices[t + 2]];
            for (let j = 0; j < 3; j++) {
                const v = tri[j];
                if (v < newVertexStart) continue;
                if (featureVerts.has(v)) continue;
                if (!neighbors.has(v)) neighbors.set(v, new Set());
                const nbrs = neighbors.get(v)!;
                nbrs.add(tri[(j + 1) % 3]);
                nbrs.add(tri[(j + 2) % 3]);
            }
        }

        // Smooth UV positions
        const smoothedUVs: Array<{ idx: number; u: number; t: number; surfId: number }> = [];
        for (const [vIdx, nbrs] of neighbors) {
            if (nbrs.size === 0) continue;
            // Circular mean for U coordinate (handles seam wrapping at u=0/1)
            let sinSum = 0, cosSum = 0, sumT = 0;
            for (const n of nbrs) {
                const nu = uvs[n * 3];
                const angle = nu * 2 * Math.PI;
                sinSum += Math.sin(angle);
                cosSum += Math.cos(angle);
                sumT += uvs[n * 3 + 1];
            }
            let meanU = Math.atan2(sinSum, cosSum) / (2 * Math.PI);
            if (meanU < 0) meanU += 1;
            smoothedUVs.push({
                idx: vIdx,
                u: meanU,
                t: sumT / nbrs.size,
                surfId: uvs[vIdx * 3 + 2],
            });
        }

        if (smoothedUVs.length === 0) continue;

        // Update UVs
        for (const sv of smoothedUVs) {
            uvs[sv.idx * 3] = sv.u;
            uvs[sv.idx * 3 + 1] = sv.t;
        }

        // Build GPU batch to re-project smoothed UVs
        const uvBatch = new Float32Array(smoothedUVs.length * 3);
        for (let i = 0; i < smoothedUVs.length; i++) {
            uvBatch[i * 3] = smoothedUVs[i].u;
            uvBatch[i * 3 + 1] = smoothedUVs[i].t;
            uvBatch[i * 3 + 2] = smoothedUVs[i].surfId;
        }

        const newPos = await evaluateMidpoints(uvBatch);

        // Update positions
        for (let i = 0; i < smoothedUVs.length; i++) {
            const vIdx = smoothedUVs[i].idx;
            positions[vIdx * 3] = newPos[i * 3];
            positions[vIdx * 3 + 1] = newPos[i * 3 + 1];
            positions[vIdx * 3 + 2] = newPos[i * 3 + 2];
        }
    }
}

// ============================================================================
// Mesh Quality Computation (Phase 9.3 / 10)
// ============================================================================

/**
 * Angle histogram bins: [0,10), [10,20), [20,30), [30,40), [40,50), [50,60), [60+]
 */
export interface AngleHistogram {
    /** Bin counts: bins[0] = count of min-angles in [0,10), ..., bins[6] = [60,∞) */
    bins: readonly [number, number, number, number, number, number, number];
    /** Bin edges in degrees. */
    readonly binEdges: readonly [0, 10, 20, 30, 40, 50, 60];
}

/** Result of computeMeshQuality. */
export interface MeshQualityResult {
    minAngleDeg: number;
    maxAspectRatio: number;
    /** Angle histogram (7 bins). Only present when `histogram` param is true. */
    angleHistogram?: AngleHistogram;
}

/**
 * Compute min angle, max aspect ratio, and optional angle histogram.
 *
 * Used for ConvergenceState and quality optimization passes.
 *
 * @param positions - Packed vertex positions.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param histogram - If true, compute the 7-bin angle histogram.
 * @returns Object with minAngleDeg, maxAspectRatio, and optional angleHistogram.
 */
export function computeMeshQuality(
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    histogram: boolean = false,
): MeshQualityResult {
    let globalMinAngle = 180;
    let globalMaxAR = 1;
    const bins: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];

    for (let t = 0; t < outerIdxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const minA = triangleMinAngle(
            positions[i0 * 3], positions[i0 * 3 + 1], positions[i0 * 3 + 2],
            positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2],
            positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2],
        );
        if (minA < globalMinAngle) globalMinAngle = minA;

        if (histogram) {
            const binIdx = Math.min(6, Math.floor(minA / 10));
            bins[binIdx]++;
        }

        // Aspect ratio: circumradius / inradius (standard mesh quality metric).
        // For equilateral triangle: R/r = 2. For slivers: R/r → ∞.
        // R = abc / (4A), r = 2A / (a+b+c), so R/r = abc(a+b+c) / (8A²).
        const a = Math.sqrt(edgeLengthSq(positions, i0, i1));
        const b = Math.sqrt(edgeLengthSq(positions, i1, i2));
        const c = Math.sqrt(edgeLengthSq(positions, i2, i0));
        const s = (a + b + c) * 0.5; // semi-perimeter
        const areaSq = s * (s - a) * (s - b) * (s - c); // Heron's formula squared
        if (areaSq > 1e-24) {
            const area = Math.sqrt(areaSq);
            const ar = (a * b * c) / (8 * area * area) * (a + b + c);
            if (ar > globalMaxAR) globalMaxAR = ar;
        }
    }

    const result: MeshQualityResult = { minAngleDeg: globalMinAngle, maxAspectRatio: globalMaxAR };
    if (histogram) {
        result.angleHistogram = {
            bins,
            binEdges: [0, 10, 20, 30, 40, 50, 60] as const,
        };
    }
    return result;
}

// ============================================================================
// Global Smoothing (Phase 10.1)
// ============================================================================

/**
 * Global area-weighted Laplacian smoothing with quality constraints.
 *
 * Operates on ALL non-feature, non-seam vertices (not just newly inserted
 * ones). Rejects any move that worsens the minimum angle of incident
 * triangles below the quality threshold.
 *
 * @param positions - Mutable vertex positions.
 * @param uvs - Mutable UV coordinates.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param featureGraph - Feature edges to protect.
 * @param evaluateMidpoints - GPU callback for surface reprojection.
 * @param iterations - Number of smoothing passes.
 * @param qualityThreshold - Minimum angle floor (degrees). Moves that
 *                           create triangles below this are rejected.
 * @returns Number of vertices actually moved.
 */
export async function globalSmoothing(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    featureGraph: FeatureEdgeGraph,
    evaluateMidpoints: EvaluateMidpointsFn,
    iterations: number = 3,
    qualityThreshold: number = 15,
): Promise<number> {
    const vertCount = positions.length / 3;
    // Identify protected vertices (feature) and classify seam vertices
    const protectedVerts = new Set<number>();
    const seamInteriorVerts = new Set<number>(); // Can slide along T, U fixed at 0 or 1
    const CORNER_T_THRESHOLD = 0.02; // t near 0 or 1 → corner → fully locked

    for (const edge of featureGraph.edges) {
        protectedVerts.add(edge.v0);
        protectedVerts.add(edge.v1);
    }
    for (let v = 0; v < vertCount; v++) {
        const u = uvs[v * 3];
        if (u < SEAM_PROXIMITY_THRESHOLD || u > 1 - SEAM_PROXIMITY_THRESHOLD) {
            const t = uvs[v * 3 + 1];
            if (t < CORNER_T_THRESHOLD || t > 1 - CORNER_T_THRESHOLD) {
                // Corner vertex: fully locked
                protectedVerts.add(v);
            } else {
                // Seam-interior vertex: can slide along T
                seamInteriorVerts.add(v);
            }
        }
    }

    // Build vertex-to-triangle adjacency
    const vtMap = new Map<number, number[]>();
    for (let t = 0; t < outerIdxCount; t += 3) {
        for (let k = 0; k < 3; k++) {
            const v = indices[t + k];
            let tris = vtMap.get(v);
            if (!tris) { tris = []; vtMap.set(v, tris); }
            tris.push(t);
        }
    }

    let totalMoved = 0;

    for (let pass = 0; pass < iterations; pass++) {
        // Build neighbor lists with area weighting
        const smoothCandidates: Array<{
            vIdx: number;
            newU: number;
            newT: number;
            surfId: number;
        }> = [];

        for (let v = 0; v < vertCount; v++) {
            if (protectedVerts.has(v)) continue;
            const isSeamInterior = seamInteriorVerts.has(v);
            const tris = vtMap.get(v);
            if (!tris || tris.length === 0) continue;

            // Area-weighted neighbor UV average
            let weightedSinU = 0, weightedCosU = 0, weightedT = 0, totalWeight = 0;

            for (const t of tris) {
                const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
                // Triangle area (for weighting)
                const ax = positions[i1 * 3] - positions[i0 * 3];
                const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
                const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
                const bx = positions[i2 * 3] - positions[i0 * 3];
                const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
                const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
                const cx = ay * bz - az * by;
                const cy = az * bx - ax * bz;
                const cz = ax * by - ay * bx;
                const area = Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5;
                if (area < 1e-12) continue;

                // Neighbor UVs (vertices of this triangle that aren't v)
                for (let k = 0; k < 3; k++) {
                    const neighbor = indices[t + k];
                    if (neighbor === v) continue;
                    const nu = uvs[neighbor * 3];
                    const nt = uvs[neighbor * 3 + 1];
                    if (!isSeamInterior) {
                        const angle = nu * 2 * Math.PI;
                        weightedSinU += Math.sin(angle) * area;
                        weightedCosU += Math.cos(angle) * area;
                    }
                    weightedT += nt * area;
                    totalWeight += area;
                }
            }

            if (totalWeight < 1e-12) continue;

            const oldU = uvs[v * 3], oldT = uvs[v * 3 + 1];
            let blendU: number;
            if (isSeamInterior) {
                // Seam-interior: keep U fixed at exactly 0 or 1
                blendU = oldU < 0.5 ? 0 : 1;
            } else {
                let newU = Math.atan2(weightedSinU, weightedCosU) / (2 * Math.PI);
                if (newU < 0) newU += 1;
                blendU = (oldU + newU) * 0.5;
            }
            const newT = weightedT / totalWeight;
            const blendT = (oldT + newT) * 0.5;

            smoothCandidates.push({
                vIdx: v,
                newU: blendU,
                newT: blendT,
                surfId: uvs[v * 3 + 2],
            });
        }

        if (smoothCandidates.length === 0) break;

        // Evaluate new surface positions via GPU
        const uvBatch = new Float32Array(smoothCandidates.length * 3);
        for (let i = 0; i < smoothCandidates.length; i++) {
            uvBatch[i * 3] = smoothCandidates[i].newU;
            uvBatch[i * 3 + 1] = smoothCandidates[i].newT;
            uvBatch[i * 3 + 2] = smoothCandidates[i].surfId;
        }
        const newPos = await evaluateMidpoints(uvBatch);

        // Apply moves with quality constraint check
        let passMoved = 0;
        for (let i = 0; i < smoothCandidates.length; i++) {
            const { vIdx, newU, newT } = smoothCandidates[i];
            const tris = vtMap.get(vIdx);
            if (!tris) continue;

            // Save old state
            const oldPx = positions[vIdx * 3], oldPy = positions[vIdx * 3 + 1], oldPz = positions[vIdx * 3 + 2];
            const oldU = uvs[vIdx * 3], oldT = uvs[vIdx * 3 + 1];

            // Compute old min angle for incident triangles
            let oldMinAngle = 180;
            for (const t of tris) {
                const a = triangleMinAngle(
                    positions[indices[t] * 3], positions[indices[t] * 3 + 1], positions[indices[t] * 3 + 2],
                    positions[indices[t + 1] * 3], positions[indices[t + 1] * 3 + 1], positions[indices[t + 1] * 3 + 2],
                    positions[indices[t + 2] * 3], positions[indices[t + 2] * 3 + 1], positions[indices[t + 2] * 3 + 2],
                );
                if (a < oldMinAngle) oldMinAngle = a;
            }

            // Apply move
            positions[vIdx * 3] = newPos[i * 3];
            positions[vIdx * 3 + 1] = newPos[i * 3 + 1];
            positions[vIdx * 3 + 2] = newPos[i * 3 + 2];
            uvs[vIdx * 3] = newU;
            uvs[vIdx * 3 + 1] = newT;

            // Check new min angle
            let newMinAngle = 180;
            for (const t of tris) {
                const a = triangleMinAngle(
                    positions[indices[t] * 3], positions[indices[t] * 3 + 1], positions[indices[t] * 3 + 2],
                    positions[indices[t + 1] * 3], positions[indices[t + 1] * 3 + 1], positions[indices[t + 1] * 3 + 2],
                    positions[indices[t + 2] * 3], positions[indices[t + 2] * 3 + 1], positions[indices[t + 2] * 3 + 2],
                );
                if (a < newMinAngle) newMinAngle = a;
            }

            // Reject if quality worsened below threshold
            if (newMinAngle < qualityThreshold && newMinAngle < oldMinAngle) {
                // Revert
                positions[vIdx * 3] = oldPx;
                positions[vIdx * 3 + 1] = oldPy;
                positions[vIdx * 3 + 2] = oldPz;
                uvs[vIdx * 3] = oldU;
                uvs[vIdx * 3 + 1] = oldT;
            } else {
                passMoved++;
            }
        }

        totalMoved += passMoved;
        if (passMoved === 0) break; // No improvement possible
    }

    return totalMoved;
}

// ============================================================================
// Global ODT Edge Flip (Phase 10.2)
// ============================================================================

/**
 * Run a global Optimal Delaunay Triangulation (ODT) edge flip pass.
 *
 * Unlike `localEdgeFlip` which only operates on the 2-ring of affected
 * vertices, this iterates over ALL non-feature, non-boundary edges and
 * flips any edge that improves the minimum angle. Multi-pass until
 * convergence or max passes reached.
 *
 * @param indices - Mutable triangle index buffer.
 * @param positions - Vertex positions.
 * @param featureGraph - Feature edges that must not be flipped.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param maxPasses - Maximum number of full passes.
 * @param qualityFloor - Never flip if it creates a triangle below this angle.
 * @returns Number of edges flipped.
 */
export function globalEdgeFlip(
    indices: Uint32Array,
    positions: Float32Array,
    featureGraph: FeatureEdgeGraph,
    outerIdxCount: number,
    maxPasses: number = 5,
    qualityFloor: number = 9,
): number {
    let totalFlips = 0;

    for (let pass = 0; pass < maxPasses; pass++) {
        const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);
        let passFlips = 0;

        for (const [key, tris] of edgeAdj) {
            if (tris.length !== 2) continue;

            // Decode bigint key: key = min(eA,eB) * 0x200000 + max(eA,eB)
            const eA = Number(key / 0x200000n);
            const eB = Number(key % 0x200000n);

            if (isFeatureEdge(featureGraph, eA, eB)) continue;

            const t0 = tris[0], t1 = tris[1];
            let opp0 = -1, opp1 = -1;
            for (let k = 0; k < 3; k++) {
                if (indices[t0 + k] !== eA && indices[t0 + k] !== eB) opp0 = indices[t0 + k];
                if (indices[t1 + k] !== eA && indices[t1 + k] !== eB) opp1 = indices[t1 + k];
            }
            if (opp0 < 0 || opp1 < 0 || opp0 === opp1) continue;

            const minBefore = Math.min(
                triangleMinAngle(
                    positions[eA * 3], positions[eA * 3 + 1], positions[eA * 3 + 2],
                    positions[eB * 3], positions[eB * 3 + 1], positions[eB * 3 + 2],
                    positions[opp0 * 3], positions[opp0 * 3 + 1], positions[opp0 * 3 + 2],
                ),
                triangleMinAngle(
                    positions[eA * 3], positions[eA * 3 + 1], positions[eA * 3 + 2],
                    positions[eB * 3], positions[eB * 3 + 1], positions[eB * 3 + 2],
                    positions[opp1 * 3], positions[opp1 * 3 + 1], positions[opp1 * 3 + 2],
                ),
            );

            const minAfter = Math.min(
                triangleMinAngle(
                    positions[opp0 * 3], positions[opp0 * 3 + 1], positions[opp0 * 3 + 2],
                    positions[opp1 * 3], positions[opp1 * 3 + 1], positions[opp1 * 3 + 2],
                    positions[eA * 3], positions[eA * 3 + 1], positions[eA * 3 + 2],
                ),
                triangleMinAngle(
                    positions[opp0 * 3], positions[opp0 * 3 + 1], positions[opp0 * 3 + 2],
                    positions[opp1 * 3], positions[opp1 * 3 + 1], positions[opp1 * 3 + 2],
                    positions[eB * 3], positions[eB * 3 + 1], positions[eB * 3 + 2],
                ),
            );

            // Quality floor: never create triangles below the floor
            if (minAfter < qualityFloor) continue;

            if (minAfter > minBefore + 0.5) {
                indices[t0] = opp0; indices[t0 + 1] = opp1; indices[t0 + 2] = eA;
                indices[t1] = opp0; indices[t1 + 1] = opp1; indices[t1 + 2] = eB;
                passFlips++;
            }
        }

        totalFlips += passFlips;
        if (passFlips === 0) break;
    }

    return totalFlips;
}

// ============================================================================
// Main Refinement Loop
// ============================================================================

/**
 * Run the iterative adaptive refinement loop.
 *
 * Repeatedly estimates per-triangle error, splits the worst violations,
 * and re-evaluates until tolerances pass, iteration cap is hit, or
 * triangle budget is exhausted.
 *
 * If `profile.maxRefineIterations === 0`, returns immediately with
 * the input mesh unchanged and `stopReason: 'zero_iterations'`.
 *
 * @param positions - Initial vertex positions (packed [x,y,z,...]).
 * @param uvs - Initial UV data (packed [u,t,surfaceId,...]).
 * @param indices - Initial triangle index buffer.
 * @param config - Refinement configuration.
 * @param evaluateMidpoints - GPU callback for surface evaluation. If null,
 *                            CPU-only error estimation is used (no splitting).
 * @returns Refinement result with diagnostics.
 */
export async function adaptiveRefine(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    config: RefinementConfig,
    evaluateMidpoints: EvaluateMidpointsFn | null,
): Promise<RefinementResult> {
    const { profile, tolerances, maxTriangles, featureGraph, outerIdxCount } = config;
    let curVertexMetrics = config.vertexMetrics;
    const maxIter = profile.maxRefineIterations;

    // ── Outer-only invariant assertion (Task 1.5) ─────────────────────
    if (outerIdxCount !== indices.length) {
        console.error(
            '[AdaptiveRefinement] INVARIANT VIOLATION: outerIdxCount !== indices.length. ' +
            'Refinement must receive outer-wall-only data. Got outerIdxCount=' + outerIdxCount +
            ', indices.length=' + indices.length,
        );
    }

    let curPositions = positions;
    let curUVs = uvs;
    let curIndices = indices;
    let curOuterIdxCount = outerIdxCount;

    const iterationStats: RefinementIterationStats[] = [];

    // ── Early exit: zero iterations ──────────────────────────────────
    if (maxIter === 0) {
        const cpuErrors = estimateErrorsCPU(curPositions, curIndices, curOuterIdxCount, tolerances);
        const posErrors = cpuErrors.map(e => e.posErrorMm).sort((a, b) => a - b);
        const normErrors = cpuErrors.map(e => e.normalErrorDeg).sort((a, b) => a - b);
        const maxPos = posErrors.length > 0 ? posErrors[posErrors.length - 1] : 0;
        const maxNorm = normErrors.length > 0 ? normErrors[normErrors.length - 1] : 0;
        const p95Pos = percentile(posErrors, 95);
        const p95Norm = percentile(normErrors, 95);

        return {
            positions: curPositions,
            uvs: curUVs,
            indices: curIndices,
            tolerancesPassed: maxPos <= tolerances.epsPosMm && maxNorm <= tolerances.epsNormalDeg,
            iterationsPerformed: 0,
            iterationStats: [],
            maxPosErrorMm: maxPos,
            maxNormalErrorDeg: maxNorm,
            p95PosErrorMm: p95Pos,
            p95NormalErrorDeg: p95Norm,
            stopReason: 'zero_iterations',
        };
    }

    // ── Iteration loop ───────────────────────────────────────────────
    let prevMaxPos = Infinity;
    let prevMaxNorm = Infinity;
    let prevSplitCount = 0;

    for (let iter = 0; iter < maxIter; iter++) {
        const iterStart = performance.now();
        const totalTriangles = curIndices.length / 3;

        // Budget check
        if (totalTriangles >= maxTriangles) {
            iterationStats.push({
                iteration: iter,
                overPositionCount: 0,
                overNormalCount: 0,
                maxPosErrorMm: prevMaxPos,
                maxNormalErrorDeg: prevMaxNorm,
                p95PosErrorMm: 0,
                p95NormalErrorDeg: 0,
                splitCount: 0,
                totalTriangles,
                timeMs: performance.now() - iterStart,
            });
            return buildResult(curPositions, curUVs, curIndices, iterationStats, 'budget_exhausted');
        }

        // Estimate errors — pass vertexMetrics for metric-aware edge selection (Task 1.2)
        let errors: TriangleError[];
        if (config.gpuEstimateErrors) {
            // Phase 5: GPU compute error estimation (single dispatch, no roundtrip)
            errors = await config.gpuEstimateErrors(
                curPositions, curUVs, curIndices, curOuterIdxCount,
            );
        } else if (evaluateMidpoints) {
            // Use split helpers: sync batch setup, direct await on evaluateMidpoints, sync error computation
            const batch = buildErrorEstimationBatch(
                curPositions, curUVs, curIndices, curOuterIdxCount, curVertexMetrics,
            );
            if (batch) {
                const allPositions = await evaluateMidpoints(batch.uvBatch);
                errors = computeTriangleErrors(curPositions, allPositions, batch.triInfos);
            } else {
                errors = [];
            }
        } else {
            errors = estimateErrorsCPU(
                curPositions, curIndices, curOuterIdxCount, tolerances,
                curUVs, curVertexMetrics,
            );
        }

        // Compute aggregate metrics
        const posErrors = errors.map(e => e.posErrorMm).sort((a, b) => a - b);
        const normErrors = errors.map(e => e.normalErrorDeg).sort((a, b) => a - b);
        const maxPos = posErrors.length > 0 ? posErrors[posErrors.length - 1] : 0;
        const maxNorm = normErrors.length > 0 ? normErrors[normErrors.length - 1] : 0;
        const p95Pos = percentile(posErrors, 95);
        const p95Norm = percentile(normErrors, 95);
        const overPosCount = posErrors.filter(e => e > tolerances.epsPosMm).length;
        const overNormCount = normErrors.filter(e => e > tolerances.epsNormalDeg).length;

        // Tolerance check — Phase 9: use isConverged with quality metrics (A3, C6)
        const quality = computeMeshQuality(curPositions, curIndices, curOuterIdxCount);
        const convergenceState: ConvergenceState = {
            maxPosError: maxPos,
            p95PosError: p95Pos,
            maxNormalError: maxNorm,
            p95NormalError: p95Norm,
            minAngleDeg: quality.minAngleDeg,
            maxAspectRatio: quality.maxAspectRatio,
            triangleCount: totalTriangles,
        };
        const convergenceResult = isConverged(convergenceState, tolerances);
        if (convergenceResult.converged) {
            iterationStats.push({
                iteration: iter,
                overPositionCount: overPosCount,
                overNormalCount: overNormCount,
                maxPosErrorMm: maxPos,
                maxNormalErrorDeg: maxNorm,
                p95PosErrorMm: p95Pos,
                p95NormalErrorDeg: p95Norm,
                splitCount: 0,
                totalTriangles,
                timeMs: performance.now() - iterStart,
            });
            return buildResult(curPositions, curUVs, curIndices, iterationStats, 'tolerances_passed');
        }

        // No-improvement check: if max errors didn't decrease by at least 5%
        if (iter > 0 && maxPos >= prevMaxPos * 0.95 && maxNorm >= prevMaxNorm * 0.95) {
            iterationStats.push({
                iteration: iter,
                overPositionCount: overPosCount,
                overNormalCount: overNormCount,
                maxPosErrorMm: maxPos,
                maxNormalErrorDeg: maxNorm,
                p95PosErrorMm: p95Pos,
                p95NormalErrorDeg: p95Norm,
                splitCount: 0,
                totalTriangles,
                timeMs: performance.now() - iterStart,
            });
            return buildResult(curPositions, curUVs, curIndices, iterationStats, 'no_improvement');
        }

        // Task 4.1: Convergence efficiency check
        // If the error reduction per split is negligible, stop early.
        if (iter > 0 && prevSplitCount > 0) {
            const improvement = prevMaxPos - maxPos;
            const efficiency = improvement / prevSplitCount;
            if (improvement > 0 && efficiency < tolerances.epsPosMm * 0.01) {
                iterationStats.push({
                    iteration: iter,
                    overPositionCount: overPosCount,
                    overNormalCount: overNormCount,
                    maxPosErrorMm: maxPos,
                    maxNormalErrorDeg: maxNorm,
                    p95PosErrorMm: p95Pos,
                    p95NormalErrorDeg: p95Norm,
                    splitCount: 0,
                    totalTriangles,
                    timeMs: performance.now() - iterStart,
                });
                return buildResult(curPositions, curUVs, curIndices, iterationStats, 'diminishing_returns');
            }
        }

        prevMaxPos = maxPos;
        prevMaxNorm = maxNorm;

        // Cap splits per iteration: min(overCount, 10% of current triangles, remaining budget)
        const overCount = overPosCount + overNormCount;
        const budgetRemaining = maxTriangles - totalTriangles;
        const maxSplitsPerIter = Math.min(
            overCount,
            Math.ceil(totalTriangles * 0.1),
            Math.floor(budgetRemaining / 2), // each split adds 2 triangles
        );

        if (maxSplitsPerIter <= 0) {
            iterationStats.push({
                iteration: iter,
                overPositionCount: overPosCount,
                overNormalCount: overNormCount,
                maxPosErrorMm: maxPos,
                maxNormalErrorDeg: maxNorm,
                p95PosErrorMm: p95Pos,
                p95NormalErrorDeg: p95Norm,
                splitCount: 0,
                totalTriangles,
                timeMs: performance.now() - iterStart,
            });
            return buildResult(curPositions, curUVs, curIndices, iterationStats, 'budget_exhausted');
        }

        // ── Phase 14: Per-edge vs per-triangle split path ─────────────
        let splitCount = 0;
        if (config.perEdgeErrorEstimation && evaluateMidpoints) {
            // Per-edge path: measure chord error on every edge directly
            const edgeErrors = await estimateEdgeErrors(
                curPositions, curUVs, curIndices, curOuterIdxCount,
                evaluateMidpoints, tolerances, curVertexMetrics,
            );
            const edgeSplitResult = await splitEdgesOverThreshold(
                curPositions, curUVs, curIndices, curOuterIdxCount,
                edgeErrors, tolerances, featureGraph, maxSplitsPerIter,
                evaluateMidpoints,
            );
            curOuterIdxCount = edgeSplitResult.indices.length;
            curPositions = edgeSplitResult.positions;
            curUVs = edgeSplitResult.uvs;
            curIndices = edgeSplitResult.indices;
            splitCount = edgeSplitResult.splitCount;
        } else if (evaluateMidpoints) {
            // Per-triangle path: estimate error at triangle centroids,
            // then split the longest edge of the highest-error triangles.
            let metricTargetLen = 0;
            if (curVertexMetrics) {
                const area = estimateSurfaceArea(curPositions, curUVs, curIndices, curOuterIdxCount);
                metricTargetLen = targetEdgeLength(area, maxTriangles);
            }
            const errorScorer = (e: TriangleError): number => {
                let score = (e.posErrorMm / tolerances.epsPosMm) + (e.normalErrorDeg / tolerances.epsNormalDeg);
                if (curVertexMetrics && metricTargetLen > 0) {
                    const idx = e.triIdx;
                    const ev = e.longestEdgeIdx === 0 ? [curIndices[idx], curIndices[idx + 1]]
                        : e.longestEdgeIdx === 1 ? [curIndices[idx + 1], curIndices[idx + 2]]
                            : [curIndices[idx + 2], curIndices[idx]];
                    const prio = Math.max(0.5, Math.min(2.0,
                        anisotropicSplitPriority(curVertexMetrics, curUVs, ev[0], ev[1], metricTargetLen)));
                    score *= prio;
                }
                return score;
            };
            const compareFn = (a: TriangleError, b: TriangleError) => errorScorer(b) - errorScorer(a);
            // Phase 11.2: topK selects the k worst elements efficiently (O(n) average)
            const sortedErrors = topK([...errors], maxSplitsPerIter * 2, compareFn);

            const splitResult = await splitOverThresholdTriangles(
                curPositions, curUVs, curIndices, curOuterIdxCount,
                sortedErrors, tolerances, featureGraph, maxSplitsPerIter,
                evaluateMidpoints,
            );
            curOuterIdxCount = splitResult.indices.length;
            curPositions = splitResult.positions;
            curUVs = splitResult.uvs;
            curIndices = splitResult.indices;
            splitCount = splitResult.splitCount;
        }

        // Task 1.1: Recompute vertex metrics for the updated mesh
        if (curVertexMetrics && splitCount > 0) {
            curVertexMetrics = computeVertexMetrics(
                curPositions, curUVs, curIndices, curOuterIdxCount,
            );
        }

        // Task 3.1 & 3.2: Cleanup passes (re-enabled after fixing stale
        // adjacency bug in localEdgeFlip and seam UV wrapping in smoothNewVertices)
        if (splitCount > 0 && evaluateMidpoints) {
            const prevVertCount = curPositions.length / 3 - splitCount;
            // C5: Build 2-ring affected set — new midpoints + 1-ring + 2-ring
            const affectedVertices = new Set<number>();
            for (let v = prevVertCount; v < curPositions.length / 3; v++) {
                affectedVertices.add(v);
            }
            // 1-ring: vertices in triangles touching new midpoints
            const ring1 = new Set<number>();
            for (let t = 0; t < curOuterIdxCount; t += 3) {
                const v0 = curIndices[t], v1 = curIndices[t + 1], v2 = curIndices[t + 2];
                if (affectedVertices.has(v0) || affectedVertices.has(v1) || affectedVertices.has(v2)) {
                    ring1.add(v0); ring1.add(v1); ring1.add(v2);
                }
            }
            for (const v of ring1) affectedVertices.add(v);
            // 2-ring: vertices in triangles touching 1-ring vertices
            for (let t = 0; t < curOuterIdxCount; t += 3) {
                const v0 = curIndices[t], v1 = curIndices[t + 1], v2 = curIndices[t + 2];
                if (ring1.has(v0) || ring1.has(v1) || ring1.has(v2)) {
                    affectedVertices.add(v0); affectedVertices.add(v1); affectedVertices.add(v2);
                }
            }
            const flipCount = localEdgeFlip(curIndices, curPositions, affectedVertices, featureGraph, curOuterIdxCount);
            if (flipCount > 0) {
                console.log(`[AdaptiveRefinement] iter ${iter}: ${flipCount} edge flips`);
            }

            await smoothNewVertices(
                curPositions, curUVs, curIndices, curOuterIdxCount,
                prevVertCount, featureGraph, evaluateMidpoints, 1,
            );
        }

        // Task 6.6: Edge collapse — remove over-tessellated edges
        if (config.edgeCollapseEnabled && curIndices.length / 3 > maxTriangles) {
            const collapseResult = await collapseOverBudgetEdges(
                curPositions, curUVs, curIndices, curOuterIdxCount,
                featureGraph, maxTriangles, curVertexMetrics,
            );
            if (collapseResult.collapseCount > 0) {
                curPositions = collapseResult.positions;
                curUVs = collapseResult.uvs;
                curIndices = collapseResult.indices;
                curOuterIdxCount = collapseResult.outerIdxCount;
                console.log(`[AdaptiveRefinement] iter ${iter}: ${collapseResult.collapseCount} edge collapses`);

                // Re-compute metrics after topology change
                if (curVertexMetrics) {
                    curVertexMetrics = computeVertexMetrics(
                        curPositions, curUVs, curIndices, curOuterIdxCount,
                    );
                }
            }
        }

        if (evaluateMidpoints) {
            iterationStats.push({
                iteration: iter,
                overPositionCount: overPosCount,
                overNormalCount: overNormCount,
                maxPosErrorMm: maxPos,
                maxNormalErrorDeg: maxNorm,
                p95PosErrorMm: p95Pos,
                p95NormalErrorDeg: p95Norm,
                splitCount,
                totalTriangles: curIndices.length / 3,
                timeMs: performance.now() - iterStart,
                metricStats: curVertexMetrics
                    ? computeMetricStats(curVertexMetrics, curIndices, curOuterIdxCount, curUVs)
                    : undefined,
            });
            prevSplitCount = splitCount;
        } else {
            // CPU-only path: no splitting, just report
            iterationStats.push({
                iteration: iter,
                overPositionCount: overPosCount,
                overNormalCount: overNormCount,
                maxPosErrorMm: maxPos,
                maxNormalErrorDeg: maxNorm,
                p95PosErrorMm: p95Pos,
                p95NormalErrorDeg: p95Norm,
                splitCount: 0,
                totalTriangles,
                timeMs: performance.now() - iterStart,
                metricStats: curVertexMetrics
                    ? computeMetricStats(curVertexMetrics, curIndices, curOuterIdxCount, curUVs)
                    : undefined,
            });
            // Without GPU, can't actually split, so exit
            return buildResult(curPositions, curUVs, curIndices, iterationStats, 'no_improvement');
        }
    }

    // ── Phase 10: Post-loop global quality optimization ──────────────
    // After the main refinement loop exhausts iterations, run a final
    // quality pass (edge flips + smoothing) to improve triangle quality
    // without adding geometry. Only when GPU evaluation is available.
    if (evaluateMidpoints && featureGraph) {
        const qualityIterations = profile.qualityIterations ?? 2;
        const flipCount = globalEdgeFlip(
            curIndices, curPositions, featureGraph, curOuterIdxCount,
            qualityIterations, /* qualityFloor */ 9,
        );
        const smoothMoved = await globalSmoothing(
            curPositions, curUVs, curIndices, curOuterIdxCount,
            featureGraph, evaluateMidpoints,
            qualityIterations, /* qualityThreshold */ 15,
        );
        if (flipCount > 0 || smoothMoved > 0) {
            // Log quality optimization results in the last iteration stats
            const lastStat = iterationStats.length > 0
                ? iterationStats[iterationStats.length - 1]
                : null;
            if (lastStat) {
                (lastStat as unknown as Record<string, unknown>).qualityFlips = flipCount;
                (lastStat as unknown as Record<string, unknown>).qualitySmoothMoved = smoothMoved;
            }
        }
    }

    return buildResult(curPositions, curUVs, curIndices, iterationStats, 'max_iterations');
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Build the final RefinementResult from the iteration snapshots.
 */
function buildResult(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    stats: RefinementIterationStats[],
    stopReason: RefinementResult['stopReason'],
): RefinementResult {
    const last = stats.length > 0 ? stats[stats.length - 1] : null;
    return {
        positions,
        uvs,
        indices,
        tolerancesPassed: stopReason === 'tolerances_passed',
        iterationsPerformed: stats.length,
        iterationStats: stats,
        maxPosErrorMm: last?.maxPosErrorMm ?? 0,
        maxNormalErrorDeg: last?.maxNormalErrorDeg ?? 0,
        p95PosErrorMm: last?.p95PosErrorMm ?? 0,
        p95NormalErrorDeg: last?.p95NormalErrorDeg ?? 0,
        stopReason,
    };
}
