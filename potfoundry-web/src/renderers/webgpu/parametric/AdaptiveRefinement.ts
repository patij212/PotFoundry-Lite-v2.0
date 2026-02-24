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
import type { FeatureEdgeGraph } from './FeatureEdgeGraph';
import { isFeatureEdge, edgeKey as featureEdgeKey } from './FeatureEdgeGraph';
import type { EvaluateMidpointsFn } from './MeshSubdivision';

// ============================================================================
// Types
// ============================================================================

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
    stopReason: 'tolerances_passed' | 'max_iterations' | 'budget_exhausted' | 'no_improvement' | 'zero_iterations';
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
// Edge-to-Triangle Adjacency
// ============================================================================

/**
 * Canonical edge key as a string for Map lookups during refinement.
 */
function refEdgeKey(a: number, b: number): string {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
}

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
): Map<string, number[]> {
    const adj = new Map<string, number[]>();
    for (let t = 0; t < outerIdxCount; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b || b === c || a === c) continue;
        for (const key of [refEdgeKey(a, b), refEdgeKey(b, c), refEdgeKey(c, a)]) {
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
    tolerances: ExportTolerances,
): TriangleError[] {
    const errors: TriangleError[] = [];
    const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);

    for (let t = 0; t < outerIdxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        // Edge lengths (squared)
        const edges: Array<{ v0: number; v1: number; lenSq: number }> = [
            { v0: i0, v1: i1, lenSq: edgeLengthSq(positions, i0, i1) },
            { v0: i1, v1: i2, lenSq: edgeLengthSq(positions, i1, i2) },
            { v0: i2, v1: i0, lenSq: edgeLengthSq(positions, i2, i0) },
        ];

        // Longest edge
        let longestIdx = 0;
        if (edges[1].lenSq > edges[longestIdx].lenSq) longestIdx = 1;
        if (edges[2].lenSq > edges[longestIdx].lenSq) longestIdx = 2;

        const longestLen = Math.sqrt(edges[longestIdx].lenSq);

        // Chord error estimate: L²/(8R) ≈ L * θ / 8
        // Use dihedral angle as curvature proxy
        const flatN = triangleNormal(positions, i0, i1, i2);
        let maxDihedralDeg = 0;

        for (const edge of edges) {
            const key = refEdgeKey(edge.v0, edge.v1);
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
export async function estimateErrorsGPU(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    evaluateMidpoints: EvaluateMidpointsFn,
    tolerances: ExportTolerances,
): Promise<TriangleError[]> {
    const errors: TriangleError[] = [];
    const edgeAdj = buildEdgeAdjacency(indices, outerIdxCount);

    // ── Pass 1: Collect edge midpoints for GPU evaluation ────────────
    interface TriInfo {
        triOffset: number;
        i0: number; i1: number; i2: number;
        longestEdgeIdx: number;
        longestEdgeLenSq: number;
        edge: { v0: number; v1: number };
    }
    const triInfos: TriInfo[] = [];

    for (let t = 0; t < outerIdxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const e0Sq = edgeLengthSq(positions, i0, i1);
        const e1Sq = edgeLengthSq(positions, i1, i2);
        const e2Sq = edgeLengthSq(positions, i2, i0);

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

    if (triInfos.length === 0) return errors;

    // Build UV batch for GPU evaluation: one midpoint per triangle's longest edge
    const uvBatch = new Float32Array(triInfos.length * 3);
    for (let i = 0; i < triInfos.length; i++) {
        const { edge } = triInfos[i];
        uvBatch[i * 3] = (uvs[edge.v0 * 3] + uvs[edge.v1 * 3]) * 0.5;
        uvBatch[i * 3 + 1] = (uvs[edge.v0 * 3 + 1] + uvs[edge.v1 * 3 + 1]) * 0.5;
        uvBatch[i * 3 + 2] = uvs[edge.v0 * 3 + 2]; // surfaceId
    }

    // ── Pass 2: GPU evaluate midpoints ───────────────────────────────
    const surfacePositions = await evaluateMidpoints(uvBatch);

    // ── Pass 3: Compute errors ───────────────────────────────────────
    for (let i = 0; i < triInfos.length; i++) {
        const info = triInfos[i];
        const { triOffset, i0, i1, i2, edge } = info;

        // Chord error
        const posErr = computeChordError(positions, surfacePositions, i, edge.v0, edge.v1);

        // Normal error (dihedral heuristic)
        const flatN = triangleNormal(positions, i0, i1, i2);
        let maxDihedralDeg = 0;

        const triEdges = [
            { v0: i0, v1: i1 },
            { v0: i1, v1: i2 },
            { v0: i2, v1: i0 },
        ];
        for (const te of triEdges) {
            const key = refEdgeKey(te.v0, te.v1);
            const tris = edgeAdj.get(key);
            if (!tris || tris.length < 2) continue;
            for (const nt of tris) {
                if (nt === triOffset) continue;
                const ni0 = indices[nt], ni1 = indices[nt + 1], ni2 = indices[nt + 2];
                const neighborN = triangleNormal(positions, ni0, ni1, ni2);
                const dot = flatN[0] * neighborN[0] + flatN[1] * neighborN[1] + flatN[2] * neighborN[2];
                const clampedDot = Math.max(-1, Math.min(1, dot));
                const angDeg = Math.acos(clampedDot) * (180 / Math.PI);
                if (angDeg > maxDihedralDeg) maxDihedralDeg = angDeg;
            }
        }

        errors.push({
            triIdx: triOffset,
            posErrorMm: posErr,
            normalErrorDeg: maxDihedralDeg,
            longestEdgeIdx: info.longestEdgeIdx,
            longestEdgeLenSq: info.longestEdgeLenSq,
        });
    }

    return errors;
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
        edgeKey: string;
        v0: number;
        v1: number;
        tri0: number;
        tri1: number;
    }
    const candidates: SplitCandidate[] = [];
    const touchedTris = new Set<number>();
    const touchedEdges = new Set<string>();

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

        const key = refEdgeKey(eV0, eV1);
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
        uvBatch[i * 3] = (uvs[v0 * 3] + uvs[v1 * 3]) * 0.5;
        uvBatch[i * 3 + 1] = (uvs[v0 * 3 + 1] + uvs[v1 * 3 + 1]) * 0.5;
        uvBatch[i * 3 + 2] = uvs[v0 * 3 + 2]; // surfaceId
    }

    const mid3D = await evaluateMidpoints(uvBatch);

    // ── 4. Apply splits ──────────────────────────────────────────────
    //       Each 2-to-4 split: replace 2 tris, add 2 new tris.
    const newPositions: number[] = [];
    const newUVs: number[] = [];
    const newTriangles: number[] = [];
    const baseVertCount = positions.length / 3;

    // Copy indices to mutable array
    const mutableIdx = new Uint32Array(indices);

    for (let i = 0; i < candidates.length; i++) {
        const { v0, v1, tri0, tri1 } = candidates[i];
        const midIdx = baseVertCount + i;

        // Add midpoint vertex
        newPositions.push(mid3D[i * 3], mid3D[i * 3 + 1], mid3D[i * 3 + 2]);
        newUVs.push(uvBatch[i * 3], uvBatch[i * 3 + 1], uvBatch[i * 3 + 2]);

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

        // Replace tri0 → (opp0, v0, M)
        mutableIdx[tri0] = opp0;
        mutableIdx[tri0 + 1] = v0;
        mutableIdx[tri0 + 2] = midIdx;
        // New tri: (opp0, M, v1)
        newTriangles.push(opp0, midIdx, v1);

        // Replace tri1 → (opp1, v1, M)
        mutableIdx[tri1] = opp1;
        mutableIdx[tri1 + 1] = v1;
        mutableIdx[tri1 + 2] = midIdx;
        // New tri: (opp1, M, v0)
        newTriangles.push(opp1, midIdx, v0);
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
        splitCount: candidates.length,
    };
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
    const maxIter = profile.maxRefineIterations;

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

        // Estimate errors
        let errors: TriangleError[];
        if (evaluateMidpoints) {
            errors = await estimateErrorsGPU(
                curPositions, curUVs, curIndices, curOuterIdxCount,
                evaluateMidpoints, tolerances,
            );
        } else {
            errors = estimateErrorsCPU(curPositions, curIndices, curOuterIdxCount, tolerances);
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

        // Tolerance check
        if (maxPos <= tolerances.epsPosMm && maxNorm <= tolerances.epsNormalDeg) {
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

        prevMaxPos = maxPos;
        prevMaxNorm = maxNorm;

        // Sort errors by a combined score: position error (normalized) + normal error (normalized)
        const sortedErrors = [...errors].sort((a, b) => {
            const scoreA = (a.posErrorMm / tolerances.epsPosMm) + (a.normalErrorDeg / tolerances.epsNormalDeg);
            const scoreB = (b.posErrorMm / tolerances.epsPosMm) + (b.normalErrorDeg / tolerances.epsNormalDeg);
            return scoreB - scoreA; // descending: worst first
        });

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

        // Split
        if (evaluateMidpoints) {
            const splitResult = await splitOverThresholdTriangles(
                curPositions, curUVs, curIndices, curOuterIdxCount,
                sortedErrors, tolerances, featureGraph, maxSplitsPerIter,
                evaluateMidpoints,
            );
            // Update outer idx count: new triangles appended after all surfaces
            const newOuterTris = splitResult.splitCount * 2; // 2 new tris per split
            curOuterIdxCount = curOuterIdxCount + newOuterTris * 3;
            curPositions = splitResult.positions;
            curUVs = splitResult.uvs;
            curIndices = splitResult.indices;

            iterationStats.push({
                iteration: iter,
                overPositionCount: overPosCount,
                overNormalCount: overNormCount,
                maxPosErrorMm: maxPos,
                maxNormalErrorDeg: maxNorm,
                p95PosErrorMm: p95Pos,
                p95NormalErrorDeg: p95Norm,
                splitCount: splitResult.splitCount,
                totalTriangles: curIndices.length / 3,
                timeMs: performance.now() - iterStart,
            });
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
            });
            // Without GPU, can't actually split, so exit
            return buildResult(curPositions, curUVs, curIndices, iterationStats, 'no_improvement');
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
