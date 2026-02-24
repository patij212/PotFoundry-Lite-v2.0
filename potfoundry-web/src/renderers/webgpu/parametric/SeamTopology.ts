/**
 * SeamTopology — Periodic seam enforcement and continuity validation.
 *
 * The outer wall grid uses an open topology where U ranges from 0 to (W-1)/W.
 * This module treats the seam (U=0 ↔ U≈1) as a first-class topological
 * invariant, providing:
 *
 * 1. **Seam pair identification**: maps vertex indices at column 0 to their
 *    periodic partners at column W-1 (the geometric closing pair).
 * 2. **Continuity metrics**: measures position and normal discontinuity
 *    across the seam boundary.
 * 3. **Validation**: verifies seam periodicity within tolerance gates.
 * 4. **Seam edge enumeration**: identifies mesh edges that span the seam gap,
 *    useful for future seam stitching and for the MeshValidator.
 *
 * The pot surface has rotational periodicity: the analytic surface at U=0
 * and U=1 is identical. Therefore, column 0 and column W-1 vertices at the
 * same row should be geometrically close (within the grid cell arc length).
 *
 * @module SeamTopology
 * @see OuterWallTessellator.ts for current seam-gap behavior
 * @see MeshOptimizer.ts for the "no seam cell" limitation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A pair of vertex indices across the seam boundary.
 *
 * - `col0Vertex`: vertex index at column 0 (U ≈ 0)
 * - `colLastVertex`: vertex index at column W-1 (U ≈ (W-1)/W)
 * - `row`: the row index these vertices share
 */
export interface SeamPair {
    /** Vertex index at column 0 (left side of seam). */
    col0Vertex: number;
    /** Vertex index at column W-1 (right side of seam). */
    colLastVertex: number;
    /** Row index shared by both vertices. */
    row: number;
}

/**
 * Per-pair continuity measurement.
 */
export interface SeamPairMetrics {
    /** The seam pair being measured. */
    pair: SeamPair;
    /** 3D position distance (mm) between the two vertices. */
    positionGapMm: number;
    /** Angle (degrees) between the analytic surface normals at U=0 and U≈1. */
    normalGapDeg: number;
}

/**
 * Aggregate seam continuity report.
 */
export interface SeamContinuityReport {
    /** Number of seam vertex pairs. */
    pairCount: number;
    /** Maximum position gap across all pairs (mm). */
    maxPositionGapMm: number;
    /** Mean position gap across all pairs (mm). */
    meanPositionGapMm: number;
    /** Maximum normal discontinuity across all pairs (degrees). */
    maxNormalGapDeg: number;
    /** Mean normal discontinuity across all pairs (degrees). */
    meanNormalGapDeg: number;
    /** Whether the seam passes position continuity within the given tolerance. */
    positionPassed: boolean;
    /** Whether the seam passes normal continuity within the given tolerance. */
    normalPassed: boolean;
    /** Overall pass: both position and normal within tolerance. */
    passed: boolean;
    /** Per-pair measurements (sorted by worst-first). */
    pairMetrics: SeamPairMetrics[];
}

/**
 * Configuration for seam validation.
 */
export interface SeamValidationConfig {
    /** Maximum acceptable position gap at the seam (mm). */
    maxPositionGapMm: number;
    /** Maximum acceptable normal gap at the seam (degrees). */
    maxNormalGapDeg: number;
}

/**
 * Identifies a seam-adjacent triangle (triangle that has at least one
 * vertex on column 0 or column W-1).
 */
export interface SeamTriangle {
    /** Triangle offset in the index buffer. */
    triOffset: number;
    /** Set of vertex indices in this triangle that are on the seam boundary. */
    seamVertices: number[];
    /** Which side: 'left' (col 0), 'right' (col W-1), or 'both'. */
    side: 'left' | 'right' | 'both';
}

// ============================================================================
// Seam Pair Identification
// ============================================================================

/**
 * Identify seam vertex pairs: column 0 ↔ column W-1 at each row.
 *
 * In the outer wall grid, vertices are indexed as `row * numU + col`.
 * The seam pair for row `r` is: (r * numU + 0, r * numU + numU - 1).
 *
 * @param numU - Number of U columns in the grid.
 * @param numT - Number of T rows in the grid.
 * @returns Array of seam pairs, one per row.
 */
export function identifySeamPairs(numU: number, numT: number): SeamPair[] {
    if (numU < 2 || numT < 1) return [];

    const pairs: SeamPair[] = [];
    for (let row = 0; row < numT; row++) {
        pairs.push({
            col0Vertex: row * numU,
            colLastVertex: row * numU + numU - 1,
            row,
        });
    }
    return pairs;
}

/**
 * Identify all vertex indices on the seam boundary.
 *
 * @param numU - Number of U columns in the grid.
 * @param numT - Number of T rows in the grid.
 * @returns Object with sets for left (col 0) and right (col W-1) vertices.
 */
export function identifySeamVertices(
    numU: number,
    numT: number,
): { left: Set<number>; right: Set<number>; all: Set<number> } {
    const left = new Set<number>();
    const right = new Set<number>();
    const all = new Set<number>();

    if (numU < 2) return { left, right, all };

    for (let row = 0; row < numT; row++) {
        const leftIdx = row * numU;
        const rightIdx = row * numU + numU - 1;
        left.add(leftIdx);
        right.add(rightIdx);
        all.add(leftIdx);
        all.add(rightIdx);
    }

    return { left, right, all };
}

// ============================================================================
// Continuity Measurement
// ============================================================================

/**
 * Measure the 3D position gap between a seam pair.
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param pair - The seam pair to measure.
 * @returns Position gap in mm (Euclidean distance).
 */
export function measurePositionGap(
    positions: Float32Array,
    pair: SeamPair,
): number {
    const a = pair.col0Vertex;
    const b = pair.colLastVertex;
    const dx = positions[a * 3] - positions[b * 3];
    const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
    const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Estimate the normal discontinuity across a seam pair.
 *
 * Since we don't have analytic normals available, we estimate using
 * face normals of adjacent triangles. If no adjacent triangles are
 * available, returns 0.
 *
 * For proper normal comparison with analytic surface, the caller should
 * use the GPU evaluator version ({@link measureSeamContinuityWithNormals}).
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param pair - The seam pair to measure.
 * @returns Estimated normal gap in degrees.
 */
export function estimateNormalGapFromFaces(
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    pair: SeamPair,
): number {
    // Find the average face normal for triangles adjacent to each seam vertex
    const normA = averageVertexNormal(positions, indices, outerIdxCount, pair.col0Vertex);
    const normB = averageVertexNormal(positions, indices, outerIdxCount, pair.colLastVertex);

    if (!normA || !normB) return 0;

    const dot = normA[0] * normB[0] + normA[1] * normB[1] + normA[2] * normB[2];
    const clamped = Math.max(-1, Math.min(1, dot));
    return Math.acos(clamped) * (180 / Math.PI);
}

/**
 * Compute the average normal of all triangles incident on a vertex.
 *
 * @returns Unit normal [nx, ny, nz], or null if no adjacent triangles.
 */
function averageVertexNormal(
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    vertex: number,
): [number, number, number] | null {
    let nx = 0, ny = 0, nz = 0;
    let count = 0;

    for (let t = 0; t < outerIdxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        if (i0 !== vertex && i1 !== vertex && i2 !== vertex) continue;

        // Cross product
        const ax = positions[i1 * 3] - positions[i0 * 3];
        const ay = positions[i1 * 3 + 1] - positions[i0 * 3 + 1];
        const az = positions[i1 * 3 + 2] - positions[i0 * 3 + 2];
        const bx = positions[i2 * 3] - positions[i0 * 3];
        const by = positions[i2 * 3 + 1] - positions[i0 * 3 + 1];
        const bz = positions[i2 * 3 + 2] - positions[i0 * 3 + 2];
        const cx = ay * bz - az * by;
        const cy = az * bx - ax * bz;
        const cz = ax * by - ay * bx;
        const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
        if (len < 1e-12) continue;

        nx += cx / len;
        ny += cy / len;
        nz += cz / len;
        count++;
    }

    if (count === 0) return null;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) return null;

    return [nx / len, ny / len, nz / len];
}

// ============================================================================
// Seam Continuity Reporting
// ============================================================================

/**
 * Measure seam continuity for all pairs and produce a report.
 *
 * Uses face normals for normal estimation (CPU-only path).
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param numU - Number of U columns.
 * @param numT - Number of T rows.
 * @param config - Tolerance thresholds for pass/fail.
 * @returns Complete seam continuity report.
 */
export function measureSeamContinuity(
    positions: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    numU: number,
    numT: number,
    config: SeamValidationConfig,
): SeamContinuityReport {
    const pairs = identifySeamPairs(numU, numT);

    if (pairs.length === 0) {
        return {
            pairCount: 0,
            maxPositionGapMm: 0,
            meanPositionGapMm: 0,
            maxNormalGapDeg: 0,
            meanNormalGapDeg: 0,
            positionPassed: true,
            normalPassed: true,
            passed: true,
            pairMetrics: [],
        };
    }

    const metrics: SeamPairMetrics[] = [];
    let sumPos = 0, sumNorm = 0;
    let maxPos = 0, maxNorm = 0;

    for (const pair of pairs) {
        const posGap = measurePositionGap(positions, pair);
        const normGap = estimateNormalGapFromFaces(positions, indices, outerIdxCount, pair);

        metrics.push({ pair, positionGapMm: posGap, normalGapDeg: normGap });
        sumPos += posGap;
        sumNorm += normGap;
        if (posGap > maxPos) maxPos = posGap;
        if (normGap > maxNorm) maxNorm = normGap;
    }

    // Sort by position gap descending (worst first)
    metrics.sort((a, b) => b.positionGapMm - a.positionGapMm);

    const positionPassed = maxPos <= config.maxPositionGapMm;
    const normalPassed = maxNorm <= config.maxNormalGapDeg;

    return {
        pairCount: pairs.length,
        maxPositionGapMm: maxPos,
        meanPositionGapMm: sumPos / pairs.length,
        maxNormalGapDeg: maxNorm,
        meanNormalGapDeg: sumNorm / pairs.length,
        positionPassed,
        normalPassed,
        passed: positionPassed && normalPassed,
        pairMetrics: metrics,
    };
}

/**
 * Measure seam continuity using GPU-evaluated surface normals.
 *
 * Produces more accurate normal gap measurements by comparing the
 * analytic surface normals at U=0 and U≈1 (computed via finite
 * differences of the GPU evaluator).
 *
 * @param positions - Packed [x,y,z,...] vertex positions.
 * @param uvs - Packed [u,t,surfaceId,...] UV data.
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param numU - Number of U columns.
 * @param numT - Number of T rows.
 * @param config - Tolerance thresholds.
 * @param evaluatePoints - GPU callback to evaluate surface positions.
 * @returns Complete seam continuity report with GPU-based normal estimation.
 */
export async function measureSeamContinuityWithNormals(
    positions: Float32Array,
    uvs: Float32Array,
    indices: Uint32Array,
    outerIdxCount: number,
    numU: number,
    numT: number,
    config: SeamValidationConfig,
    evaluatePoints: (uvBatch: Float32Array) => Promise<Float32Array>,
): Promise<SeamContinuityReport> {
    const pairs = identifySeamPairs(numU, numT);

    if (pairs.length === 0) {
        return {
            pairCount: 0,
            maxPositionGapMm: 0,
            meanPositionGapMm: 0,
            maxNormalGapDeg: 0,
            meanNormalGapDeg: 0,
            positionPassed: true,
            normalPassed: true,
            passed: true,
            pairMetrics: [],
        };
    }

    // Evaluate surface normals via finite differences at each seam pair
    // For each pair, we evaluate 4 points for normal estimation:
    //   col0:     (u, t), (u+ε, t), (u, t+ε)
    //   colLast:  (u, t), (u-ε, t), (u, t+ε)
    const EPSILON = 1e-4;
    const pointsPerPair = 6; // 3 per side
    const uvBatch = new Float32Array(pairs.length * pointsPerPair * 3);

    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const u0 = uvs[pair.col0Vertex * 3];
        const t0 = uvs[pair.col0Vertex * 3 + 1];
        const sid0 = uvs[pair.col0Vertex * 3 + 2];
        const uL = uvs[pair.colLastVertex * 3];
        const tL = uvs[pair.colLastVertex * 3 + 1];
        const sidL = uvs[pair.colLastVertex * 3 + 2];

        const base = i * pointsPerPair * 3;
        // Col 0: base, +du, +dt
        uvBatch[base + 0] = u0; uvBatch[base + 1] = t0; uvBatch[base + 2] = sid0;
        uvBatch[base + 3] = u0 + EPSILON; uvBatch[base + 4] = t0; uvBatch[base + 5] = sid0;
        uvBatch[base + 6] = u0; uvBatch[base + 7] = t0 + EPSILON; uvBatch[base + 8] = sid0;
        // Col last: base, +du, +dt (use +EPSILON to get same-sign tangent as col 0)
        uvBatch[base + 9] = uL; uvBatch[base + 10] = tL; uvBatch[base + 11] = sidL;
        uvBatch[base + 12] = uL + EPSILON; uvBatch[base + 13] = tL; uvBatch[base + 14] = sidL;
        uvBatch[base + 15] = uL; uvBatch[base + 16] = tL + EPSILON; uvBatch[base + 17] = sidL;
    }

    const evalPositions = await evaluatePoints(uvBatch);

    const metrics: SeamPairMetrics[] = [];
    let sumPos = 0, sumNorm = 0;
    let maxPos = 0, maxNorm = 0;

    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const posGap = measurePositionGap(positions, pair);

        // Compute normals via cross product of tangent vectors
        const base = i * pointsPerPair * 3;
        const normA = computeNormalFromFiniteDiff(evalPositions, base);
        const normB = computeNormalFromFiniteDiff(evalPositions, base + 9);

        let normGap = 0;
        if (normA && normB) {
            const dot = normA[0] * normB[0] + normA[1] * normB[1] + normA[2] * normB[2];
            normGap = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
        }

        metrics.push({ pair, positionGapMm: posGap, normalGapDeg: normGap });
        sumPos += posGap;
        sumNorm += normGap;
        if (posGap > maxPos) maxPos = posGap;
        if (normGap > maxNorm) maxNorm = normGap;
    }

    metrics.sort((a, b) => b.positionGapMm - a.positionGapMm);

    const positionPassed = maxPos <= config.maxPositionGapMm;
    const normalPassed = maxNorm <= config.maxNormalGapDeg;

    return {
        pairCount: pairs.length,
        maxPositionGapMm: maxPos,
        meanPositionGapMm: sumPos / pairs.length,
        maxNormalGapDeg: maxNorm,
        meanNormalGapDeg: sumNorm / pairs.length,
        positionPassed,
        normalPassed,
        passed: positionPassed && normalPassed,
        pairMetrics: metrics,
    };
}

/**
 * Compute a surface normal from 3 evaluated points using finite differences.
 *
 * Points are: p0 (base), p1 (base + du), p2 (base + dt).
 * Normal = normalize(cross(p1 - p0, p2 - p0)).
 *
 * @param evalPositions - GPU-evaluated positions, packed [x,y,z,...].
 * @param baseOffset - Byte offset to the first point (base).
 * @returns Unit normal [nx, ny, nz], or null if degenerate.
 */
function computeNormalFromFiniteDiff(
    evalPositions: Float32Array,
    baseOffset: number,
): [number, number, number] | null {
    const p0x = evalPositions[baseOffset], p0y = evalPositions[baseOffset + 1], p0z = evalPositions[baseOffset + 2];
    const p1x = evalPositions[baseOffset + 3], p1y = evalPositions[baseOffset + 4], p1z = evalPositions[baseOffset + 5];
    const p2x = evalPositions[baseOffset + 6], p2y = evalPositions[baseOffset + 7], p2z = evalPositions[baseOffset + 8];

    const ax = p1x - p0x, ay = p1y - p0y, az = p1z - p0z;
    const bx = p2x - p0x, by = p2y - p0y, bz = p2z - p0z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) return null;
    return [nx / len, ny / len, nz / len];
}

// ============================================================================
// Seam Triangle Identification
// ============================================================================

/**
 * Identify triangles adjacent to the seam boundary.
 *
 * @param indices - Triangle index buffer.
 * @param outerIdxCount - Number of outer-wall indices.
 * @param numU - Number of U columns.
 * @param numT - Number of T rows.
 * @returns Array of seam-adjacent triangles.
 */
export function identifySeamTriangles(
    indices: Uint32Array,
    outerIdxCount: number,
    numU: number,
    numT: number,
): SeamTriangle[] {
    const { left, right } = identifySeamVertices(numU, numT);
    const result: SeamTriangle[] = [];

    for (let t = 0; t < outerIdxCount; t += 3) {
        const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
        if (i0 === i1 || i1 === i2 || i0 === i2) continue;

        const verts = [i0, i1, i2];
        const seamVerts: number[] = [];
        let hasLeft = false, hasRight = false;

        for (const v of verts) {
            if (left.has(v)) { seamVerts.push(v); hasLeft = true; }
            else if (right.has(v)) { seamVerts.push(v); hasRight = true; }
        }

        if (seamVerts.length > 0) {
            const side = hasLeft && hasRight ? 'both' : hasLeft ? 'left' : 'right';
            result.push({ triOffset: t, seamVertices: seamVerts, side });
        }
    }

    return result;
}

// ============================================================================
// Seam Periodicity Enforcement Helpers
// ============================================================================

/**
 * Compute the expected angular gap in radians between column 0 and column W-1.
 *
 * For a grid of W columns uniformly distributed from U=0 to U=(W-1)/W,
 * the angular gap between column 0 (U=0) and column W-1 (U=(W-1)/W) is
 * 2π/W (one cell width). For a pot of radius R at a given row,
 * the expected position gap is approximately R * sin(2π/W) ≈ R * 2π/W.
 *
 * @param numU - Number of U columns.
 * @param radius - Pot radius at the given row (mm).
 * @returns Expected seam gap in mm.
 */
export function expectedSeamGap(numU: number, radius: number): number {
    if (numU < 2) return 0;
    // The seam gap spans from U = (W-1)/W to U = 1 (which wraps to 0)
    // This is 1/W of the circumference
    const circumference = 2 * Math.PI * radius;
    return circumference / numU;
}

/**
 * Check whether a measured seam gap is within the expected geometric range.
 *
 * The seam gap should be approximately `expectedSeamGap` ± tolerance.
 * Gaps much smaller indicate over-compression; gaps much larger indicate
 * visible seam artifacts.
 *
 * @param measuredGapMm - Measured position gap in mm.
 * @param expectedGapMm - Expected gap from `expectedSeamGap`.
 * @param maxDeviationFraction - Maximum allowed deviation as a fraction of expected
 *                                (default: 0.5 = 50% deviation allowed).
 * @returns True if the gap is within acceptable range.
 */
export function isSeamGapAcceptable(
    measuredGapMm: number,
    expectedGapMm: number,
    maxDeviationFraction: number = 0.5,
): boolean {
    if (expectedGapMm < 1e-6) return measuredGapMm < 1e-4;
    const deviation = Math.abs(measuredGapMm - expectedGapMm) / expectedGapMm;
    return deviation <= maxDeviationFraction;
}

/**
 * Default seam validation thresholds per quality profile.
 *
 * @param profileName - Quality profile name.
 * @returns SeamValidationConfig with appropriate thresholds.
 */
export function seamConfigForProfile(
    profileName: 'draft' | 'standard' | 'high' | 'ultra',
): SeamValidationConfig {
    switch (profileName) {
        case 'draft':
            return { maxPositionGapMm: 1.0, maxNormalGapDeg: 15 };
        case 'standard':
            return { maxPositionGapMm: 0.5, maxNormalGapDeg: 10 };
        case 'high':
            return { maxPositionGapMm: 0.1, maxNormalGapDeg: 5 };
        case 'ultra':
            return { maxPositionGapMm: 0.02, maxNormalGapDeg: 2 };
    }
}
