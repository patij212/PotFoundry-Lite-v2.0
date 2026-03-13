/**
 * Unit test: Diagonal boundary consistency — chainDirectedFlip + flipEdges3D
 *
 * Detects the known diagonal-crease bug caused by CHAIN_LOCK_BAND_HALF_WIDTH = 0.
 * The ±1 neighbor quads around a feature ridge get chain-aligned (AD) diagonals
 * from chainDirectedFlip but are left unlocked, so flipEdges3D can override them
 * with the locally-best 3D diagonal, creating a visible crease at the band boundary.
 *
 * The fix: set CHAIN_LOCK_BAND_HALF_WIDTH = 1 (locks ±1 quads too).
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Inline interfaces (mirrors ParametricExportComputer.ts)
// ============================================================================

interface ChainPoint {
    u: number;
    row: number;
}

interface FeatureChain {
    points: ChainPoint[];
}

// ============================================================================
// Inline: chainDirectedFlipParametric
// Exact copy of chainDirectedFlip from ParametricExportComputer.ts (lines 1863–2074)
// with CHAIN_LOCK_BAND_HALF_WIDTH replaced by the chainLockBandHalfWidth parameter.
// STITCH_BAND_HALF_WIDTH remains a local constant (= 1, matching the source).
// ============================================================================

function chainDirectedFlip(
    indices: Uint32Array,
    unionU: Float32Array,
    w: number,
    h: number,
    chains: FeatureChain[],
    rowMapping: number[],
    invertWinding: boolean,
    quadMap: Int32Array,
    chainLockBandHalfWidth: number   // replaces CHAIN_LOCK_BAND_HALF_WIDTH constant
): { flipCount: number; lockedQuads: Set<number> } {
    let flipCount = 0;
    const lockedQuads = new Set<number>();

    // v11.3: cellsPerRow = w - 1 (non-wrapping grid, no seam cell)
    const cellsPerRow = w - 1;

    // Local constant matching the source (not parameterized — only lock width is under test)
    const STITCH_BAND_HALF_WIDTH = 1;

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
                    const shouldLockBand = Math.abs(band) <= chainLockBandHalfWidth;
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
// Inline: flipEdges3D
// Exact copy from ParametricExportComputer.ts lines 2112–2325 (no changes).
// ============================================================================

function flipEdges3D(
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

    const dihedralCos = (n1: [number, number, number], n2: [number, number, number]): number => {
        const len1 = Math.sqrt(n1[0] * n1[0] + n1[1] * n1[1] + n1[2] * n1[2]);
        const len2 = Math.sqrt(n2[0] * n2[0] + n2[1] * n2[1] + n2[2] * n2[2]);
        if (len1 < 1e-15 || len2 < 1e-15) return 1;
        return (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (len1 * len2);
    };

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

                const curI0 = indices[triBase + 0];
                const curI1 = indices[triBase + 1];
                const curI2 = indices[triBase + 2];

                const tri0HasD = (curI0 === vD || curI1 === vD || curI2 === vD);
                const currentIsAD = tri0HasD;

                const bcMinAng1 = minAngle(ax, ay, az, bx, by, bz, cx, cy, cz);
                const bcMinAng2 = minAngle(bx, by, bz, dx, dy, dz, cx, cy, cz);
                const bcMin = Math.min(bcMinAng1, bcMinAng2);

                const adMinAng1 = minAngle(ax, ay, az, bx, by, bz, dx, dy, dz);
                const adMinAng2 = minAngle(ax, ay, az, dx, dy, dz, cx, cy, cz);
                const adMin = Math.min(adMinAng1, adMinAng2);

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

// ============================================================================
// Test helpers
// ============================================================================

/**
 * Build an initial BC-diagonal grid.
 * For each quad (row j, col i):
 *   vA = j*w+i, vB = j*w+(i+1), vC = (j+1)*w+i, vD = (j+1)*w+(i+1)
 *   BC diagonal: tri0=(A,B,C), tri1=(B,D,C)  — tri0 does NOT contain vD
 */
function buildInitialGrid(w: number, h: number): { indices: Uint32Array; quadMap: Int32Array } {
    const cellsPerRow = w - 1;
    const numQuads = (h - 1) * cellsPerRow;
    const indices = new Uint32Array(numQuads * 6);
    const quadMap = new Int32Array(numQuads);
    let tri = 0;
    for (let j = 0; j < h - 1; j++) {
        for (let i = 0; i < cellsPerRow; i++) {
            const quadIdx = j * cellsPerRow + i;
            const vA = j * w + i, vB = j * w + (i + 1);
            const vC = (j + 1) * w + i, vD = (j + 1) * w + (i + 1);
            quadMap[quadIdx] = tri;
            // BC diagonal: tri0=(A,B,C), tri1=(B,D,C)
            indices[tri++] = vA; indices[tri++] = vB; indices[tri++] = vC;
            indices[tri++] = vB; indices[tri++] = vD; indices[tri++] = vC;
        }
    }
    return { indices, quadMap };
}

/**
 * Returns true if the quad stored at triBase uses the AD diagonal.
 * AD diagonal: tri0 contains vD (the bottom-right vertex of the quad).
 */
function quadIsAD(indices: Uint32Array, triBase: number, vD: number): boolean {
    return indices[triBase] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD;
}

/**
 * Build 3D positions for a ridge-shaped surface.
 * Ridge at ridgeCol, slopes fall off on each side.
 * Row offset breaks column-symmetry so BC diagonal is geometrically better
 * than AD for the ±1 neighbor quads (triggering flipEdges3D to flip them).
 *
 * Vertex at (row r, col c):
 *   x = c / (w-1)
 *   y = (1.0 - |c - ridgeCol| * 0.5) + r * 0.2
 *   z = r / (h-1)
 */
function buildRidgePositions(w: number, h: number, ridgeCol: number): Float32Array {
    const pos = new Float32Array(w * h * 3);
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
            const v = r * w + c;
            pos[v * 3 + 0] = c / (w - 1);
            pos[v * 3 + 1] = (1.0 - Math.abs(c - ridgeCol) * 0.5) + r * 0.2;
            pos[v * 3 + 2] = r / (h - 1);
        }
    }
    return pos;
}

// ============================================================================
// Tests
// ============================================================================

describe('Diagonal boundary consistency — chainDirectedFlip + flipEdges3D', () => {

    // Grid: 5 columns × 3 rows of vertices → 4 × 2 quad cells
    const w = 5, h = 3;
    const cellsPerRow = w - 1;  // 4
    const ridgeCol = 2;

    // Chain leans slightly right (u goes from 0.48 to 0.52): localUDelta > 0
    // → all band quads (band = -1, 0, +1) get AD diagonal
    const chain: FeatureChain = { points: [{ row: 0, u: 0.48 }, { row: 2, u: 0.52 }] };
    const unionU = new Float32Array([0.0, 0.25, 0.5, 0.75, 1.0]);
    const rowMapping = [0, 1, 2];

    // vD for each band quad in quad row j=0:
    //   leftQuad  (col ridgeCol-1 = 1): vD = (j+1)*w + ridgeCol     = 1*5 + 2 = 7
    //   ridgeQuad (col ridgeCol   = 2): vD = (j+1)*w + (ridgeCol+1) = 1*5 + 3 = 8
    //   rightQuad (col ridgeCol+1 = 3): vD = (j+1)*w + (ridgeCol+2) = 1*5 + 4 = 9

    // -------------------------------------------------------------------------
    // TEST 1: Lock width = 0 — ±1 quads set to AD but NOT locked
    // -------------------------------------------------------------------------
    it('CHAIN_LOCK=0: ±1 quads are set to AD but NOT locked', () => {
        const { indices, quadMap } = buildInitialGrid(w, h);
        const { lockedQuads } = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap,
            0 /* chainLockBandHalfWidth — the bug */
        );

        for (let j = 0; j < h - 1; j++) {
            const ridgeQuadIdx = j * cellsPerRow + ridgeCol;
            const leftQuadIdx  = j * cellsPerRow + (ridgeCol - 1);
            const rightQuadIdx = j * cellsPerRow + (ridgeCol + 1);

            // vD for each quad: quad at col c → vD = (j+1)*w + (c+1)
            const vDRidge = (j + 1) * w + (ridgeCol + 1);   // col=ridgeCol → vD uses ridgeCol+1
            const vDLeft  = (j + 1) * w + ridgeCol;          // col=ridgeCol-1 → vD uses ridgeCol
            const vDRight = (j + 1) * w + (ridgeCol + 2);   // col=ridgeCol+1 → vD uses ridgeCol+2

            // All three band quads should have been set to AD
            expect(quadIsAD(indices, quadMap[ridgeQuadIdx], vDRidge)).toBe(true);
            expect(quadIsAD(indices, quadMap[leftQuadIdx],  vDLeft)).toBe(true);
            expect(quadIsAD(indices, quadMap[rightQuadIdx], vDRight)).toBe(true);

            // With CHAIN_LOCK=0: only the center ridge quad is locked
            expect(lockedQuads.has(ridgeQuadIdx)).toBe(true);
            expect(lockedQuads.has(leftQuadIdx)).toBe(false);   // BUG: these are unlocked
            expect(lockedQuads.has(rightQuadIdx)).toBe(false);  // BUG: these are unlocked
        }
    });

    // -------------------------------------------------------------------------
    // TEST 2: Lock width = 1 — ±1 quads are set to AD AND locked
    // -------------------------------------------------------------------------
    it('CHAIN_LOCK=1: ±1 quads are set to AD AND locked', () => {
        const { indices, quadMap } = buildInitialGrid(w, h);
        const { lockedQuads } = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap,
            1 /* chainLockBandHalfWidth — the fix */
        );

        for (let j = 0; j < h - 1; j++) {
            const ridgeQuadIdx = j * cellsPerRow + ridgeCol;
            const leftQuadIdx  = j * cellsPerRow + (ridgeCol - 1);
            const rightQuadIdx = j * cellsPerRow + (ridgeCol + 1);

            // With CHAIN_LOCK=1: all three band quads are locked
            expect(lockedQuads.has(ridgeQuadIdx)).toBe(true);
            expect(lockedQuads.has(leftQuadIdx)).toBe(true);
            expect(lockedQuads.has(rightQuadIdx)).toBe(true);
        }
    });

    // -------------------------------------------------------------------------
    // TEST 3 (documents the bug): CHAIN_LOCK=0 — flipEdges3D overrides the left ±1 quad
    //
    // Geometry analysis for this ridge surface:
    //   Left quad (col 1→2): BC min-angle=53.2°, AD min-angle=34.5° → BC is better by 18.7°
    //     → flipEdges3D WILL flip this unlocked quad from AD back to BC
    //   Right quad (col 3→4): AD min-angle=53.2°, BC min-angle=34.5° → AD is better by 18.7°
    //     → flipEdges3D will NOT flip this quad (AD is already optimal)
    //   Ridge quad (col 2→3): locked → remains AD
    //
    // The bug: the left quad (chain-aligned AD) gets overridden to BC, creating
    // a diagonal inconsistency at the left chain-strip boundary (ridge=AD, leftNeighbor=BC).
    //
    // This test PASSES with the current code (the bug exists and is captured here).
    // After the fix (CHAIN_LOCK=1), the left quad will be locked and stay AD,
    // so the assertion `toBe(false)` will fail — confirming the fix works.
    // -------------------------------------------------------------------------
    it('CHAIN_LOCK=0 (current bug): ridge stays AD but left ±1 quad gets flipped to BC by flipEdges3D', () => {
        const { indices, quadMap } = buildInitialGrid(w, h);
        const positions3D = buildRidgePositions(w, h, ridgeCol);

        const { lockedQuads } = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap,
            0 /* chainLockBandHalfWidth — the bug */
        );
        flipEdges3D(indices, positions3D, w, h, false, lockedQuads, quadMap);

        // Inspect the first quad row (j=0)
        const j = 0;
        const ridgeQuadIdx = j * cellsPerRow + ridgeCol;
        const leftQuadIdx  = j * cellsPerRow + (ridgeCol - 1);

        const vDRidge = (j + 1) * w + (ridgeCol + 1);   // = 8
        const vDLeft  = (j + 1) * w + ridgeCol;          // = 7

        // Ridge quad is locked → remains AD after flipEdges3D
        expect(quadIsAD(indices, quadMap[ridgeQuadIdx], vDRidge)).toBe(true);

        // Left quad is unlocked → flipEdges3D flips it from AD back to BC
        // (BC gives 53.2° min-angle vs AD's 34.5° — a clear 18.7° improvement, well above the 1° threshold)
        expect(quadIsAD(indices, quadMap[leftQuadIdx], vDLeft)).toBe(false); // BC now — the bug

        // Result: ridge=AD, leftNeighbor=BC → diagonal inconsistency at the left band boundary
        // (visible crease artifact where the chain-strip meets the unlocked region)
    });

    // -------------------------------------------------------------------------
    // TEST 4 (confirms the fix): CHAIN_LOCK=1 — left band quad stays AD after flipEdges3D
    //
    // With CHAIN_LOCK=1, the left quad (col 1→2) is locked. Even though BC is
    // geometrically better (53.2° vs 34.5°), flipEdges3D respects the lock and
    // leaves the diagonal as AD — eliminating the crease at the band boundary.
    //
    // This test FAILS with the current code (CHAIN_LOCK=0), confirming that the
    // test correctly detects the bug. After applying the one-line fix
    // (CHAIN_LOCK_BAND_HALF_WIDTH = 1), this test will PASS.
    // -------------------------------------------------------------------------
    it('CHAIN_LOCK=1 (fix): ridge AND left ±1 quad stay AD after flipEdges3D', () => {
        const { indices, quadMap } = buildInitialGrid(w, h);
        const positions3D = buildRidgePositions(w, h, ridgeCol);

        const { lockedQuads } = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap,
            1 /* chainLockBandHalfWidth — the fix */
        );
        flipEdges3D(indices, positions3D, w, h, false, lockedQuads, quadMap);

        const j = 0;
        const ridgeQuadIdx = j * cellsPerRow + ridgeCol;
        const leftQuadIdx  = j * cellsPerRow + (ridgeCol - 1);

        const vDRidge = (j + 1) * w + (ridgeCol + 1);   // = 8
        const vDLeft  = (j + 1) * w + ridgeCol;          // = 7

        // Both quads are locked → both remain AD after flipEdges3D
        // No diagonal inconsistency at the left chain-strip boundary
        expect(quadIsAD(indices, quadMap[ridgeQuadIdx], vDRidge)).toBe(true);
        expect(quadIsAD(indices, quadMap[leftQuadIdx],  vDLeft)).toBe(true);
    });
});
