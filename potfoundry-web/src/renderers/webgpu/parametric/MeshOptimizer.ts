/**
 * parametric/MeshOptimizer.ts — Quad diagonal flipping for mesh quality.
 *
 * Contains two complementary optimization passes:
 *   1. chainDirectedFlip — UV-based diagonal alignment along feature chains
 *   2. flipEdges3D — 3D Delaunay-like quality improvement using GPU positions
 *
 * Both functions operate in-place on a Uint32Array index buffer.
 *
 * Extracted from ParametricExportComputer.ts for modularity and testability.
 *
 * @module MeshOptimizer
 */

import type { FeatureChain } from './types';

// ============================================================================
// Constants
// ============================================================================

/**
 * v16.8: Number of columns on EACH side of the ridge column to be
 * included in the chain-directed stitch band.
 * Total stitch band = 2 * STITCH_BAND_HALF_WIDTH + 1 columns.
 */
export const STITCH_BAND_HALF_WIDTH = 1;

/**
 * v16.5: Number of columns on EACH side of the ridge column to LOCK
 * from the generic 3D quality flipper. A narrower lock band than the
 * stitch band lets flipEdges3D optimize the fringe while preserving
 * the chain-directed core.
 */
export const CHAIN_LOCK_BAND_HALF_WIDTH = 1;

// ============================================================================
// v10.4 — Chain-Directed Ridge Flipping (uses actual chains)
// ============================================================================

/**
 * Walk feature chains and flip quad diagonals so that ridge crests become
 * contiguous edges in the mesh with consistent diagonal orientation.
 *
 * v10.4: Rewritten to use the actual FeatureChain objects from Phase 2.5
 * instead of re-linking features row-by-row. Flips quads along EVERY chain
 * segment (not just column crossings) and also orients flanking quads for
 * smooth normal transitions.
 *
 * For each consecutive pair of chain points, we:
 *   1. Find which column each point maps to in the union grid
 *   2. Determine the chain's local U-direction (tangent)
 *   3. Flip the quad AT the ridge column and its neighbors so diagonals
 *      follow the ridge direction
 *   4. Lock all affected quads from the generic 3D flip
 *
 * @param indices        Triangle index buffer (modified in-place)
 * @param unionU         Union grid U positions (sorted ascending)
 * @param w              Grid width (columns per row)
 * @param h              Grid height (number of quad rows = T positions - 1)
 * @param chains         Linked feature chains from Phase 2.5
 * @param rowMapping     Maps final row index → original row index (negative = inserted)
 * @param invertWinding  Whether this surface uses inverted winding
 * @param quadMap        Maps logical quad index → index buffer offset (or -1 for degenerate)
 * @returns Object with flipCount and a Set of locked quad indices
 */
export function chainDirectedFlip(
    indices: Uint32Array,
    unionU: Float32Array,
    w: number,
    h: number,
    chains: FeatureChain[],
    rowMapping: number[],
    invertWinding: boolean,
    quadMap: Int32Array
): { flipCount: number; lockedQuads: Set<number> } {
    let flipCount = 0;
    const lockedQuads = new Set<number>();

    // v11.3: cellsPerRow = w - 1 (non-wrapping grid, no seam cell)
    const cellsPerRow = w - 1;

    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    // Binary search for nearest column in unionU, with circular wrap handling
    const findColumn = (u: number): number => {
        let lo = 0, hi = w - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (unionU[mid] < u) lo = mid + 1;
            else hi = mid;
        }
        let bestCol = lo;
        let bestDist = Math.abs(unionU[lo] - u);
        if (lo > 0) {
            const d = Math.abs(unionU[lo - 1] - u);
            if (d < bestDist) { bestCol = lo - 1; bestDist = d; }
        }
        // Circular wrap checks
        const dWrap0 = Math.min(Math.abs(u - unionU[0]), Math.abs(u - unionU[0] - 1), Math.abs(u - unionU[0] + 1));
        if (dWrap0 < bestDist) { bestCol = 0; bestDist = dWrap0; }
        const dWrapN = Math.min(Math.abs(u - unionU[w - 1]), Math.abs(u - unionU[w - 1] - 1), Math.abs(u - unionU[w - 1] + 1));
        if (dWrapN < bestDist) { bestCol = w - 1; }
        return bestCol;
    };

    // Flip a quad to A-D diagonal (if not already)
    // v11.3: quadIdx is now j * cellsPerRow + quadCol (non-wrapping layout)
    const flipToAD = (quadIdx: number, j: number, quadCol: number): void => {
        if (quadCol >= cellsPerRow || j >= h - 1) return;

        const triBase = quadMap[quadIdx];
        if (triBase < 0) return;

        const vA = j * w + quadCol;
        const vB = j * w + (quadCol + 1);
        const vC = (j + 1) * w + quadCol;
        const vD = (j + 1) * w + (quadCol + 1);

        if (indices[triBase + 0] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD) {
            return; // Already A-D
        }

        if (invertWinding) {
            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vD;
            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vB;
        } else {
            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vD;
            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
        }
        flipCount++;
    };

    // Flip a quad to B-C diagonal (default, if not already)
    const flipToBC = (quadIdx: number, j: number, quadCol: number): void => {
        if (quadCol >= cellsPerRow || j >= h - 1) return;

        const triBase = quadMap[quadIdx];
        if (triBase < 0) return;

        const vA = j * w + quadCol;
        const vB = j * w + (quadCol + 1);
        const vC = (j + 1) * w + quadCol;
        const vD = (j + 1) * w + (quadCol + 1);

        if (!(indices[triBase + 0] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD)) {
            return; // Already B-C
        }

        if (invertWinding) {
            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vB;
            indices[triBase + 3] = vB; indices[triBase + 4] = vC; indices[triBase + 5] = vD;
        } else {
            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vC;
            indices[triBase + 3] = vB; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
        }
        flipCount++;
    };

    // Process each chain
    for (const chain of chains) {
        if (chain.points.length < 2) continue;

        // Remap chain points to final grid rows
        const remapped: { u: number; finalRow: number }[] = [];
        for (const pt of chain.points) {
            const fr = origToFinal.get(pt.row);
            if (fr !== undefined) {
                remapped.push({ u: pt.u, finalRow: fr });
            }
        }
        if (remapped.length < 2) continue;

        // Walk consecutive pairs of remapped chain points
        for (let k = 0; k < remapped.length - 1; k++) {
            const p0 = remapped[k];
            const p1 = remapped[k + 1];

            const rowStart = p0.finalRow;
            const rowEnd = p1.finalRow;
            if (rowEnd <= rowStart) continue;

            // v14.0: Use the chain's EXACT U for diagonal direction at each row
            let uDelta = p1.u - p0.u;
            if (uDelta > 0.5) uDelta -= 1;
            if (uDelta < -0.5) uDelta += 1;

            for (let j = rowStart; j < rowEnd && j < h - 1; j++) {
                const frac = (rowEnd > rowStart) ? (j - rowStart) / (rowEnd - rowStart) : 0;
                let uAtRow = p0.u + uDelta * frac;
                uAtRow = ((uAtRow % 1) + 1) % 1;

                const ridgeCol = findColumn(uAtRow);

                const fracNext = (rowEnd > rowStart) ? (j + 1 - rowStart) / (rowEnd - rowStart) : 1;
                let uAtNextRow = p0.u + uDelta * fracNext;
                uAtNextRow = ((uAtNextRow % 1) + 1) % 1;
                let localUDelta = uAtNextRow - uAtRow;
                if (localUDelta > 0.5) localUDelta -= 1;
                if (localUDelta < -0.5) localUDelta += 1;

                const LEAN_THRESHOLD = 0.0001;

                // v16.5: Traverse the full stitch band, but only LOCK a narrow core.
                for (let band = -STITCH_BAND_HALF_WIDTH; band <= STITCH_BAND_HALF_WIDTH; band++) {
                    const bandCol = ridgeCol + band;
                    if (bandCol < 0 || bandCol >= cellsPerRow) continue;

                    const bandQuadIdx = j * cellsPerRow + bandCol;
                    const shouldLockBand = Math.abs(band) <= CHAIN_LOCK_BAND_HALF_WIDTH;
                    if (shouldLockBand && lockedQuads.has(bandQuadIdx)) continue;

                    if (band >= -1 && band <= 1) {
                        if (localUDelta > LEAN_THRESHOLD) {
                            flipToAD(bandQuadIdx, j, bandCol);
                        } else if (localUDelta < -LEAN_THRESHOLD) {
                            flipToBC(bandQuadIdx, j, bandCol);
                        } else {
                            if (j % 2 === 0) {
                                flipToAD(bandQuadIdx, j, bandCol);
                            } else {
                                flipToBC(bandQuadIdx, j, bandCol);
                            }
                        }
                    }
                    if (shouldLockBand) {
                        lockedQuads.add(bandQuadIdx);
                    }
                }

                // v14.0: If ridge column changes between this row and next row,
                // also flip the crossing quad between the two columns
                const nextRidgeCol = findColumn(uAtNextRow);
                if (ridgeCol !== nextRidgeCol) {
                    const crossQuadCol = localUDelta > 0
                        ? Math.min(ridgeCol, nextRidgeCol)
                        : Math.max(ridgeCol, nextRidgeCol) - 1;
                    if (crossQuadCol >= 0 && crossQuadCol < cellsPerRow) {
                        const crossQuadIdx = j * cellsPerRow + crossQuadCol;
                        if (!lockedQuads.has(crossQuadIdx)) {
                            if (localUDelta > 0) {
                                flipToAD(crossQuadIdx, j, crossQuadCol);
                            } else {
                                flipToBC(crossQuadIdx, j, crossQuadCol);
                            }
                            lockedQuads.add(crossQuadIdx);
                        }
                    }
                }
            }
        }
    }

    return { flipCount, lockedQuads };
}

// ============================================================================
// v10.2 — Post-GPU 3D Edge Flipping (with dihedral awareness)
// ============================================================================

/**
 * Flip quad diagonals using actual 3D vertex positions from GPU evaluation.
 *
 * After the GPU evaluates UV→XYZ, we have the true 3D surface positions.
 * For each quad cell on the outer wall, compare the two possible diagonal
 * splits and choose the one that produces triangles whose normals better
 * match the true surface. This is the classic "Delaunay-like" edge flip
 * criterion adapted for surface meshes.
 *
 * v10.3: Respects locked quads from chain-directed pre-flip. Also detects
 * the CURRENT diagonal orientation instead of always assuming default B-C.
 *
 * The criterion: for quad ABCD with two possible splits:
 *   Default:     tri(A,B,C) + tri(B,D,C)   — diagonal B-C
 *   Alternative: tri(A,B,D) + tri(A,D,C)   — diagonal A-D
 *
 * We flip if the alternative diagonal produces a LARGER minimum interior
 * angle (Delaunay criterion) OR if the alternative produces more co-planar
 * triangle normals (valence-based criterion).
 *
 * For surface mesh quality, we use the "max-min angle" criterion:
 * flip if the minimum angle across both triangles improves.
 *
 * @param indices       Triangle index buffer (modified in-place)
 * @param positions3D   3D vertex positions (x,y,z interleaved) from GPU
 * @param w             Grid width (columns per row)
 * @param h             Grid height (total rows, NOT quad rows)
 * @param invertWinding Whether this surface uses inverted winding
 * @param lockedQuads   Set of quad indices locked by chain-directed flip
 * @param quadMap       v11.3: Maps logical quad index → index buffer offset (or -1 for degenerate)
 * @returns Number of quads flipped
 */
export function flipEdges3D(
    indices: Uint32Array,
    positions3D: Float32Array,
    w: number,
    h: number,
    invertWinding: boolean,
    lockedQuads?: Set<number>,
    quadMap?: Int32Array
): number {
    let totalFlips = 0;

    const cellsPerRow = w - 1;

    // Helper: compute minimum angle of a triangle given 3D positions
    const minAngle = (ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number): number => {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;

        const lenAB = Math.sqrt(abx * abx + aby * aby + abz * abz);
        const lenAC = Math.sqrt(acx * acx + acy * acy + acz * acz);
        const lenBC = Math.sqrt(bcx * bcx + bcy * bcy + bcz * bcz);

        if (lenAB < 1e-10 || lenAC < 1e-10 || lenBC < 1e-10) return 0;

        const cosA = (abx * acx + aby * acy + abz * acz) / (lenAB * lenAC);
        const cosB = (-abx * bcx - aby * bcy - abz * bcz) / (lenAB * lenBC);
        const cosC = (-acx * (-bcx) + (-acy) * (-bcy) + (-acz) * (-bcz)) / (lenAC * lenBC);

        const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
        const angB = Math.acos(Math.max(-1, Math.min(1, cosB)));
        const angC = Math.acos(Math.max(-1, Math.min(1, cosC)));

        return Math.min(angA, angB, angC);
    };

    // Helper: compute triangle face normal (unnormalized)
    const faceNormal = (ax: number, ay: number, az: number,
        bx: number, by: number, bz: number,
        cx: number, cy: number, cz: number): [number, number, number] => {
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        return [
            aby * acz - abz * acy,
            abz * acx - abx * acz,
            abx * acy - aby * acx
        ];
    };

    // Helper: dihedral angle cosine between two triangle normals
    const dihedralCos = (n1: [number, number, number], n2: [number, number, number]): number => {
        const len1 = Math.sqrt(n1[0] * n1[0] + n1[1] * n1[1] + n1[2] * n1[2]);
        const len2 = Math.sqrt(n2[0] * n2[0] + n2[1] * n2[1] + n2[2] * n2[2]);
        if (len1 < 1e-15 || len2 < 1e-15) return 1;
        return (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (len1 * len2);
    };

    // Multi-pass iteration: flipping one diagonal can make a neighbor's
    // flip criterion newly satisfied.
    const MAX_PASSES = 5;
    const THRESHOLD_INITIAL = 0.0175;  // ~1° in radians
    const THRESHOLD_CLEANUP = 0.0087;  // ~0.5° in radians

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let passFlips = 0;
        const threshold = pass === 0 ? THRESHOLD_INITIAL : THRESHOLD_CLEANUP;

        for (let j = 0; j < h - 1; j++) {
            for (let i = 0; i < cellsPerRow; i++) {
                const quadIdx = j * cellsPerRow + i;

                if (lockedQuads && lockedQuads.has(quadIdx)) continue;

                const triBase = quadMap ? quadMap[quadIdx] : quadIdx * 6;
                if (triBase < 0) continue;

                const vA = j * w + i;
                const vB = j * w + (i + 1);
                const vC = (j + 1) * w + i;
                const vD = (j + 1) * w + (i + 1);

                const ax = positions3D[vA * 3], ay = positions3D[vA * 3 + 1], az = positions3D[vA * 3 + 2];
                const bx = positions3D[vB * 3], by = positions3D[vB * 3 + 1], bz = positions3D[vB * 3 + 2];
                const cx = positions3D[vC * 3], cy = positions3D[vC * 3 + 1], cz = positions3D[vC * 3 + 2];
                const dx = positions3D[vD * 3], dy = positions3D[vD * 3 + 1], dz = positions3D[vD * 3 + 2];

                // Detect current diagonal orientation
                const curI0 = indices[triBase + 0];
                const curI1 = indices[triBase + 1];
                const curI2 = indices[triBase + 2];
                const tri0HasD = (curI0 === vD || curI1 === vD || curI2 === vD);
                const currentIsAD = tri0HasD;

                // Option BC: tri(A,B,C) + tri(B,D,C)
                const bcMinAng1 = minAngle(ax, ay, az, bx, by, bz, cx, cy, cz);
                const bcMinAng2 = minAngle(bx, by, bz, dx, dy, dz, cx, cy, cz);
                const bcMin = Math.min(bcMinAng1, bcMinAng2);

                // Option AD: tri(A,B,D) + tri(A,D,C)
                const adMinAng1 = minAngle(ax, ay, az, bx, by, bz, dx, dy, dz);
                const adMinAng2 = minAngle(ax, ay, az, dx, dy, dz, cx, cy, cz);
                const adMin = Math.min(adMinAng1, adMinAng2);

                // Dihedral for both options
                const bcN1 = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
                const bcN2 = faceNormal(bx, by, bz, dx, dy, dz, cx, cy, cz);
                const bcDihedral = dihedralCos(bcN1, bcN2);

                const adN1 = faceNormal(ax, ay, az, bx, by, bz, dx, dy, dz);
                const adN2 = faceNormal(ax, ay, az, dx, dy, dz, cx, cy, cz);
                const adDihedral = dihedralCos(adN1, adN2);

                let angleBenefit: number;
                let dihedralBenefit: number;
                let targetIsAD: boolean;

                if (currentIsAD) {
                    angleBenefit = bcMin - adMin;
                    dihedralBenefit = bcDihedral - adDihedral;
                    targetIsAD = false;
                } else {
                    angleBenefit = adMin - bcMin;
                    dihedralBenefit = adDihedral - bcDihedral;
                    targetIsAD = true;
                }

                const shouldFlip =
                    angleBenefit > threshold ||
                    (dihedralBenefit > 0.05 && angleBenefit > -threshold) ||
                    (angleBenefit > threshold * 0.5 && dihedralBenefit > 0.02);

                if (shouldFlip) {
                    // Normal-inversion guard
                    let invertionSafe = true;
                    if (targetIsAD) {
                        const curN = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
                        const newN1 = faceNormal(ax, ay, az, bx, by, bz, dx, dy, dz);
                        const newN2 = faceNormal(ax, ay, az, dx, dy, dz, cx, cy, cz);
                        const dot1 = curN[0] * newN1[0] + curN[1] * newN1[1] + curN[2] * newN1[2];
                        const dot2 = curN[0] * newN2[0] + curN[1] * newN2[1] + curN[2] * newN2[2];
                        if (dot1 < 0 || dot2 < 0) invertionSafe = false;
                    } else {
                        const curN = faceNormal(ax, ay, az, bx, by, bz, dx, dy, dz);
                        const newN1 = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
                        const newN2 = faceNormal(bx, by, bz, dx, dy, dz, cx, cy, cz);
                        const dot1 = curN[0] * newN1[0] + curN[1] * newN1[1] + curN[2] * newN1[2];
                        const dot2 = curN[0] * newN2[0] + curN[1] * newN2[1] + curN[2] * newN2[2];
                        if (dot1 < 0 || dot2 < 0) invertionSafe = false;
                    }

                    if (!invertionSafe) continue;

                    if (targetIsAD) {
                        if (invertWinding) {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vD;
                            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vB;
                        } else {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vD;
                            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
                        }
                    } else {
                        if (invertWinding) {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vB;
                            indices[triBase + 3] = vB; indices[triBase + 4] = vC; indices[triBase + 5] = vD;
                        } else {
                            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vC;
                            indices[triBase + 3] = vB; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
                        }
                    }

                    passFlips++;
                }
            }
        }

        totalFlips += passFlips;
        if (passFlips === 0) break;
    }

    return totalFlips;
}
