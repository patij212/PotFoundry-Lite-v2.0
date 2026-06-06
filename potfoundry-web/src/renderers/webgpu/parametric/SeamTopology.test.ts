/**
 * SeamTopology.test.ts — Tests for periodic seam topology and continuity validation.
 *
 * Tests cover:
 * - Seam pair identification
 * - Seam vertex identification (left/right/all sets)
 * - Position gap measurement
 * - Normal gap estimation from face normals
 * - Full continuity report (CPU path)
 * - GPU-assisted continuity report with finite-difference normals
 * - Seam triangle identification
 * - Expected seam gap calculation
 * - Seam gap acceptability check
 * - Profile-specific seam configs
 */
import { describe, it, expect } from 'vitest';
import {
    identifySeamPairs,
    identifySeamPairsByUV,
    identifySeamVertices,
    measurePositionGap,
    estimateNormalGapFromFaces,
    measureSeamContinuity,
    measureSeamContinuityWithNormals,
    identifySeamTriangles,
    expectedSeamGap,
    isSeamGapAcceptable,
    seamConfigForProfile,
    healSeam,
    healConfigForProfile,
} from './SeamTopology';
import type {
    SeamPair,
    SeamValidationConfig,
} from './SeamTopology';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Build a simple cylindrical grid mesh.
 *
 * Vertices at column c, row r:
 *   x = R * cos(2π * c / numU)
 *   y = R * sin(2π * c / numU)
 *   z = r * height / (numT - 1)
 *
 * UV: u = c / numU, t = r / (numT - 1), surfaceId = 0
 *
 * Triangulated as standard quad grid (no seam stitching).
 */
function makeCylinderGrid(
    numU: number,
    numT: number,
    radius: number = 25,
    height: number = 50,
): {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    outerIdxCount: number;
} {
    const vertCount = numU * numT;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 3);

    for (let r = 0; r < numT; r++) {
        for (let c = 0; c < numU; c++) {
            const idx = r * numU + c;
            const angle = (2 * Math.PI * c) / numU;
            positions[idx * 3] = radius * Math.cos(angle);
            positions[idx * 3 + 1] = radius * Math.sin(angle);
            positions[idx * 3 + 2] = r * height / (numT - 1);
            uvs[idx * 3] = c / numU;
            uvs[idx * 3 + 1] = r / (numT - 1);
            uvs[idx * 3 + 2] = 0;
        }
    }

    // Triangulate (standard grid, NO seam stitching)
    const cellsPerRow = numU - 1; // open topology: skip seam cell
    const triCount = cellsPerRow * (numT - 1) * 2;
    const indices = new Uint32Array(triCount * 3);
    let idx = 0;
    for (let r = 0; r < numT - 1; r++) {
        for (let c = 0; c < cellsPerRow; c++) {
            const v0 = r * numU + c;
            const v1 = r * numU + c + 1;
            const v2 = (r + 1) * numU + c + 1;
            const v3 = (r + 1) * numU + c;
            indices[idx++] = v0; indices[idx++] = v1; indices[idx++] = v2;
            indices[idx++] = v0; indices[idx++] = v2; indices[idx++] = v3;
        }
    }

    return { positions, uvs, indices, outerIdxCount: indices.length };
}

/**
 * Build a planar "cylinder" where the seam gap is exactly 0 (col 0 = col W-1 in position).
 * Used to test zero-gap scenarios.
 */
function makeClosedCylinderGrid(
    numU: number,
    numT: number,
    radius: number = 25,
    height: number = 50,
): {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;
    outerIdxCount: number;
} {
    // Same as regular cylinder but with numU+1 columns where last = first
    const actualU = numU + 1;
    const vertCount = actualU * numT;
    const positions = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 3);

    for (let r = 0; r < numT; r++) {
        for (let c = 0; c < actualU; c++) {
            const idx = r * actualU + c;
            const angle = (2 * Math.PI * c) / numU; // Last col wraps to 0
            positions[idx * 3] = radius * Math.cos(angle);
            positions[idx * 3 + 1] = radius * Math.sin(angle);
            positions[idx * 3 + 2] = r * height / (numT - 1);
            uvs[idx * 3] = c / numU;
            uvs[idx * 3 + 1] = r / (numT - 1);
            uvs[idx * 3 + 2] = 0;
        }
    }

    const cellsPerRow = actualU - 1;
    const triCount = cellsPerRow * (numT - 1) * 2;
    const indices = new Uint32Array(triCount * 3);
    let idx = 0;
    for (let r = 0; r < numT - 1; r++) {
        for (let c = 0; c < cellsPerRow; c++) {
            const v0 = r * actualU + c;
            const v1 = r * actualU + c + 1;
            const v2 = (r + 1) * actualU + c + 1;
            const v3 = (r + 1) * actualU + c;
            indices[idx++] = v0; indices[idx++] = v1; indices[idx++] = v2;
            indices[idx++] = v0; indices[idx++] = v2; indices[idx++] = v3;
        }
    }

    return { positions, uvs, indices, outerIdxCount: indices.length };
}

const defaultConfig: SeamValidationConfig = {
    maxPositionGapMm: 5.0, // generous for cylinder tests
    maxNormalGapDeg: 30,
};

// ============================================================================
// Tests: Seam Pair Identification
// ============================================================================

describe('identifySeamPairs', () => {
    it('returns one pair per row', () => {
        const pairs = identifySeamPairs(10, 5);
        expect(pairs).toHaveLength(5);
    });

    it('maps col 0 and col W-1 correctly', () => {
        const numU = 8, numT = 3;
        const pairs = identifySeamPairs(numU, numT);

        // Row 0: col0 = 0, colLast = 7
        expect(pairs[0].col0Vertex).toBe(0);
        expect(pairs[0].colLastVertex).toBe(7);
        expect(pairs[0].row).toBe(0);

        // Row 1: col0 = 8, colLast = 15
        expect(pairs[1].col0Vertex).toBe(8);
        expect(pairs[1].colLastVertex).toBe(15);
        expect(pairs[1].row).toBe(1);

        // Row 2: col0 = 16, colLast = 23
        expect(pairs[2].col0Vertex).toBe(16);
        expect(pairs[2].colLastVertex).toBe(23);
        expect(pairs[2].row).toBe(2);
    });

    it('returns empty for degenerate grids', () => {
        expect(identifySeamPairs(1, 5)).toHaveLength(0); // numU < 2
        expect(identifySeamPairs(10, 0)).toHaveLength(0); // numT < 1
    });
});

describe('identifySeamPairsByUV', () => {
    it('pairs the maximum available outer-wall U column even when it is below 1.0', () => {
        const uvs = new Float32Array([
            0.0, 0.0, 0,
            0.25, 0.0, 0,
            0.9974, 0.0, 0,
            0.0, 0.5, 0,
            0.25, 0.5, 0,
            0.9974, 0.5, 0,
        ]);

        const pairs = identifySeamPairsByUV(uvs, 6);

        expect(pairs).toHaveLength(2);
        expect(pairs[0]).toMatchObject({ col0Vertex: 0, colLastVertex: 2 });
        expect(pairs[1]).toMatchObject({ col0Vertex: 3, colLastVertex: 5 });
    });

    it('ignores non-outer surfaces when detecting UV seam pairs', () => {
        const uvs = new Float32Array([
            0.0, 0.0, 0,
            0.9974, 0.0, 0,
            0.0, 0.0, 2,
            1.0, 0.0, 2,
        ]);

        const pairs = identifySeamPairsByUV(uvs, 4);

        expect(pairs).toHaveLength(1);
        expect(pairs[0]).toMatchObject({ col0Vertex: 0, colLastVertex: 1 });
    });
});

describe('identifySeamVertices', () => {
    it('returns correct left and right sets', () => {
        const { left, right, all } = identifySeamVertices(4, 3);
        // 3 rows × 4 cols = 12 vertices
        // Left: 0, 4, 8. Right: 3, 7, 11
        expect(left).toEqual(new Set([0, 4, 8]));
        expect(right).toEqual(new Set([3, 7, 11]));
        expect(all).toEqual(new Set([0, 3, 4, 7, 8, 11]));
    });

    it('returns empty sets for degenerate grid', () => {
        const { left, right, all } = identifySeamVertices(1, 3);
        expect(left.size).toBe(0);
        expect(right.size).toBe(0);
        expect(all.size).toBe(0);
    });
});

// ============================================================================
// Tests: Position Gap
// ============================================================================

describe('measurePositionGap', () => {
    it('returns zero for coincident vertices', () => {
        const positions = new Float32Array([1, 2, 3, 1, 2, 3]); // v0 = v1
        const pair: SeamPair = { col0Vertex: 0, colLastVertex: 1, row: 0 };
        expect(measurePositionGap(positions, pair)).toBeCloseTo(0, 8);
    });

    it('returns correct distance for known gap', () => {
        const positions = new Float32Array([0, 0, 0, 3, 4, 0]);
        const pair: SeamPair = { col0Vertex: 0, colLastVertex: 1, row: 0 };
        expect(measurePositionGap(positions, pair)).toBeCloseTo(5, 8);
    });

    it('measures realistic cylinder seam gap', () => {
        const { positions } = makeCylinderGrid(32, 4, 25);
        const pairs = identifySeamPairs(32, 4);
        const gap = measurePositionGap(positions, pairs[0]);
        // Expected gap ≈ 2π*25/32 ≈ 4.91 mm
        const expected = (2 * Math.PI * 25) / 32;
        expect(gap).toBeCloseTo(expected, 1);
    });
});

// ============================================================================
// Tests: Normal Gap
// ============================================================================

describe('estimateNormalGapFromFaces', () => {
    it('returns 0 when no adjacent triangles exist', () => {
        const positions = new Float32Array([0, 0, 0, 1, 0, 0]);
        const indices = new Uint32Array([]);
        const pair: SeamPair = { col0Vertex: 0, colLastVertex: 1, row: 0 };
        expect(estimateNormalGapFromFaces(positions, indices, 0, pair)).toBe(0);
    });

    it('returns small normal gap for smooth cylinder', () => {
        const { positions, indices, outerIdxCount } = makeCylinderGrid(32, 4, 25);
        const pairs = identifySeamPairs(32, 4);

        // The normals at col 0 and col 31 on a smooth cylinder should differ
        // by approximately 360/32 ≈ 11.25 degrees
        const normGap = estimateNormalGapFromFaces(positions, indices, outerIdxCount, pairs[1]);
        // With face-averaged normals, the gap should be modest
        expect(normGap).toBeGreaterThanOrEqual(0);
        expect(normGap).toBeLessThan(30); // reasonable bound for 32-column cylinder
    });
});

// ============================================================================
// Tests: Continuity Report
// ============================================================================

describe('measureSeamContinuity', () => {
    it('produces valid report for cylinder grid', () => {
        const { positions, indices, outerIdxCount } = makeCylinderGrid(16, 4, 25);
        const report = measureSeamContinuity(
            positions, indices, outerIdxCount, 16, 4, defaultConfig,
        );

        expect(report.pairCount).toBe(4);
        expect(report.maxPositionGapMm).toBeGreaterThan(0);
        expect(report.meanPositionGapMm).toBeGreaterThan(0);
        expect(report.pairMetrics).toHaveLength(4);
        // Check sorted order (worst first)
        for (let i = 1; i < report.pairMetrics.length; i++) {
            expect(report.pairMetrics[i].positionGapMm).toBeLessThanOrEqual(
                report.pairMetrics[i - 1].positionGapMm,
            );
        }
    });

    it('passes with generous thresholds', () => {
        const { positions, indices, outerIdxCount } = makeCylinderGrid(32, 4, 25);
        const report = measureSeamContinuity(
            positions, indices, outerIdxCount, 32, 4,
            { maxPositionGapMm: 50, maxNormalGapDeg: 90 }, // very generous
        );

        expect(report.passed).toBe(true);
        expect(report.positionPassed).toBe(true);
        expect(report.normalPassed).toBe(true);
    });

    it('fails with tight thresholds', () => {
        const { positions, indices, outerIdxCount } = makeCylinderGrid(16, 4, 25);
        const report = measureSeamContinuity(
            positions, indices, outerIdxCount, 16, 4,
            { maxPositionGapMm: 0.01, maxNormalGapDeg: 0.01 }, // impossibly tight
        );

        expect(report.positionPassed).toBe(false);
    });

    it('returns passed=true for empty grid', () => {
        const positions = new Float32Array(0);
        const indices = new Uint32Array(0);
        const report = measureSeamContinuity(positions, indices, 0, 0, 0, defaultConfig);
        expect(report.passed).toBe(true);
        expect(report.pairCount).toBe(0);
    });

    it('measures consistent gaps across rows for uniform cylinder', () => {
        const { positions, indices, outerIdxCount } = makeCylinderGrid(32, 6, 25);
        const report = measureSeamContinuity(
            positions, indices, outerIdxCount, 32, 6, defaultConfig,
        );

        // All rows should have identical gaps (uniform cylinder)
        const gaps = report.pairMetrics.map(m => m.positionGapMm);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        for (const g of gaps) {
            expect(g).toBeCloseTo(mean, 3);
        }
    });
});

describe('measureSeamContinuityWithNormals', () => {
    /** Simple GPU evaluator that returns cylinder positions. */
    const cylinderEvaluator = async (uvBatch: Float32Array): Promise<Float32Array> => {
        const count = uvBatch.length / 3;
        const result = new Float32Array(count * 3);
        const R = 25;
        const H = 50;
        for (let i = 0; i < count; i++) {
            const u = uvBatch[i * 3];
            const t = uvBatch[i * 3 + 1];
            const angle = 2 * Math.PI * u;
            result[i * 3] = R * Math.cos(angle);
            result[i * 3 + 1] = R * Math.sin(angle);
            result[i * 3 + 2] = t * H;
        }
        return result;
    };

    it('produces valid report with GPU normals', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeCylinderGrid(16, 4, 25, 50);
        const report = await measureSeamContinuityWithNormals(
            positions, uvs, indices, outerIdxCount, 16, 4,
            { maxPositionGapMm: 50, maxNormalGapDeg: 90 },
            cylinderEvaluator,
        );

        expect(report.pairCount).toBe(4);
        expect(report.passed).toBe(true);
    });

    it('detects normal gap for cylinder', async () => {
        const { positions, uvs, indices, outerIdxCount } = makeCylinderGrid(8, 4, 25, 50);
        const report = await measureSeamContinuityWithNormals(
            positions, uvs, indices, outerIdxCount, 8, 4,
            { maxPositionGapMm: 50, maxNormalGapDeg: 90 },
            cylinderEvaluator,
        );

        // With 8 columns, the normal gap at the seam should be ≈ 360/8 = 45°
        // But the finite-difference normals at U=0 and U=(W-1)/W should show
        // the angular gap consistent with the cylinder geometry
        expect(report.maxNormalGapDeg).toBeGreaterThan(0);
    });

    it('returns passed=true for empty grid', async () => {
        const positions = new Float32Array(0);
        const uvs = new Float32Array(0);
        const indices = new Uint32Array(0);
        const report = await measureSeamContinuityWithNormals(
            positions, uvs, indices, 0, 0, 0,
            defaultConfig, cylinderEvaluator,
        );
        expect(report.passed).toBe(true);
    });
});

// ============================================================================
// Tests: Seam Triangle Identification
// ============================================================================

describe('identifySeamTriangles', () => {
    it('identifies triangles touching col 0 and col W-1', () => {
        const { indices, outerIdxCount } = makeCylinderGrid(8, 4);
        const seamTris = identifySeamTriangles(indices, outerIdxCount, 8, 4);

        // There should be triangles on both left and right sides
        const leftTris = seamTris.filter(t => t.side === 'left');
        const rightTris = seamTris.filter(t => t.side === 'right');
        expect(leftTris.length).toBeGreaterThan(0);
        expect(rightTris.length).toBeGreaterThan(0);
    });

    it('returns empty for no outer-wall triangles', () => {
        const indices = new Uint32Array(0);
        const seamTris = identifySeamTriangles(indices, 0, 8, 4);
        expect(seamTris).toHaveLength(0);
    });

    it('all seam triangles have valid seamVertices', () => {
        const { indices, outerIdxCount } = makeCylinderGrid(16, 4);
        const { all } = identifySeamVertices(16, 4);
        const seamTris = identifySeamTriangles(indices, outerIdxCount, 16, 4);

        for (const st of seamTris) {
            expect(st.seamVertices.length).toBeGreaterThan(0);
            for (const sv of st.seamVertices) {
                expect(all.has(sv)).toBe(true);
            }
        }
    });
});

// ============================================================================
// Tests: Expected Seam Gap
// ============================================================================

describe('expectedSeamGap', () => {
    it('computes correct gap for standard cylinder', () => {
        const gap = expectedSeamGap(32, 25);
        // circumference / numU = 2π*25/32 ≈ 4.91 mm
        expect(gap).toBeCloseTo((2 * Math.PI * 25) / 32, 3);
    });

    it('returns 0 for degenerate grid', () => {
        expect(expectedSeamGap(1, 25)).toBe(0);
    });

    it('scales linearly with radius', () => {
        const gap1 = expectedSeamGap(32, 25);
        const gap2 = expectedSeamGap(32, 50);
        expect(gap2).toBeCloseTo(gap1 * 2, 5);
    });

    it('inversely proportional to numU', () => {
        const gap1 = expectedSeamGap(32, 25);
        const gap2 = expectedSeamGap(64, 25);
        expect(gap2).toBeCloseTo(gap1 / 2, 5);
    });
});

describe('isSeamGapAcceptable', () => {
    it('accepts gap within default 50% deviation', () => {
        expect(isSeamGapAcceptable(5.0, 4.91)).toBe(true);
    });

    it('rejects gap way outside expected', () => {
        expect(isSeamGapAcceptable(20.0, 4.91)).toBe(false);
    });

    it('accepts exact match', () => {
        expect(isSeamGapAcceptable(4.91, 4.91)).toBe(true);
    });

    it('handles zero expected gap', () => {
        expect(isSeamGapAcceptable(0.0001, 0)).toBe(false);
        expect(isSeamGapAcceptable(0, 0)).toBe(true);
    });

    it('respects custom deviation fraction', () => {
        expect(isSeamGapAcceptable(6.0, 5.0, 0.3)).toBe(true); // 20% deviation within 30% tolerance
        expect(isSeamGapAcceptable(6.0, 5.0, 0.2)).toBe(true); // exactly 20%
        expect(isSeamGapAcceptable(6.0, 5.0, 0.1)).toBe(false); // 20% > 10%
    });
});

// ============================================================================
// Tests: Profile-Specific Configs
// ============================================================================

describe('seamConfigForProfile', () => {
    it('returns valid configs for all profiles', () => {
        for (const name of ['draft', 'standard', 'high', 'ultra'] as const) {
            const cfg = seamConfigForProfile(name);
            expect(cfg.maxPositionGapMm).toBeGreaterThan(0);
            expect(cfg.maxNormalGapDeg).toBeGreaterThan(0);
        }
    });

    it('has decreasing thresholds from draft to ultra', () => {
        const draft = seamConfigForProfile('draft');
        const standard = seamConfigForProfile('standard');
        const high = seamConfigForProfile('high');
        const ultra = seamConfigForProfile('ultra');

        expect(draft.maxPositionGapMm).toBeGreaterThan(standard.maxPositionGapMm);
        expect(standard.maxPositionGapMm).toBeGreaterThan(high.maxPositionGapMm);
        expect(high.maxPositionGapMm).toBeGreaterThan(ultra.maxPositionGapMm);

        expect(draft.maxNormalGapDeg).toBeGreaterThan(standard.maxNormalGapDeg);
        expect(standard.maxNormalGapDeg).toBeGreaterThan(high.maxNormalGapDeg);
        expect(high.maxNormalGapDeg).toBeGreaterThan(ultra.maxNormalGapDeg);
    });

    it('ultra thresholds match plan requirements', () => {
        const ultra = seamConfigForProfile('ultra');
        // Plan: seam continuity error < 0.02mm position, <2° normal
        expect(ultra.maxPositionGapMm).toBe(0.02);
        expect(ultra.maxNormalGapDeg).toBe(2);
    });
});

// ============================================================================
// healSeam Tests
// ============================================================================

describe('healSeam', () => {
    /**
     * Build a cylindrical grid where col0 and colLast occupy the SAME
     * angular position (0 rad) separated only by `extraGapMm` in the
     * x-direction.  Interior columns (1 .. numU-2) are evenly spaced
     * around the rest of the circle.
     *
     * This mimics the real open-grid seam where the first and last
     * columns should meet at the same physical location.
     */
    function buildSeamGrid(numU: number, numT: number, radius: number, extraGapMm: number): {
        positions: Float32Array;
        indices: Uint32Array;
    } {
        const vertCount = numU * numT;
        const positions = new Float32Array(vertCount * 3);

        for (let row = 0; row < numT; row++) {
            const y = row * 10; // height spacing
            for (let col = 0; col < numU; col++) {
                const idx = (row * numU + col) * 3;
                if (col === 0) {
                    // col0: at angle 0, shifted +x by half the gap
                    positions[idx]     = radius + extraGapMm * 0.5;
                    positions[idx + 1] = y;
                    positions[idx + 2] = 0;
                } else if (col === numU - 1) {
                    // colLast: at angle 0, shifted -x by half the gap
                    positions[idx]     = radius - extraGapMm * 0.5;
                    positions[idx + 1] = y;
                    positions[idx + 2] = 0;
                } else {
                    // Interior columns span the circle
                    const angle = (col / (numU - 1)) * 2 * Math.PI;
                    positions[idx]     = radius * Math.cos(angle);
                    positions[idx + 1] = y;
                    positions[idx + 2] = radius * Math.sin(angle);
                }
            }
        }

        // Build triangle indices for the grid
        const triCount = (numU - 1) * (numT - 1) * 2;
        const indices = new Uint32Array(triCount * 3);
        let iOff = 0;
        for (let row = 0; row < numT - 1; row++) {
            for (let col = 0; col < numU - 1; col++) {
                const tl = row * numU + col;
                const tr = row * numU + col + 1;
                const bl = (row + 1) * numU + col;
                const br = (row + 1) * numU + col + 1;
                indices[iOff++] = tl;
                indices[iOff++] = bl;
                indices[iOff++] = tr;
                indices[iOff++] = tr;
                indices[iOff++] = bl;
                indices[iOff++] = br;
            }
        }

        return { positions, indices };
    }

    it('returns identity when no seam pairs exist (degenerate grid)', () => {
        const positions = new Float32Array([0, 0, 0]);
        const indices = new Uint32Array([]);
        const config = healConfigForProfile('standard');
        const result = healSeam(positions, indices, 0, 1, 1, config);
        expect(result.pairsAveraged).toBe(0);
        expect(result.ghostStripsInserted).toBe(0);
    });

    it('averages seam vertex positions for small gaps', () => {
        const numU = 8, numT = 4, radius = 20;
        const gapMm = 0.3; // below standard ghostTriangleThresholdMm
        const { positions, indices } = buildSeamGrid(numU, numT, radius, gapMm);
        const config = healConfigForProfile('standard');

        const result = healSeam(positions, indices, indices.length, numU, numT, config);

        expect(result.pairsAveraged).toBe(numT);
        // After averaging, col0 and colLast should be at same position
        for (let row = 0; row < numT; row++) {
            const col0 = row * numU;
            const colLast = row * numU + numU - 1;
            const gap = measurePositionGap(result.positions, {
                col0Vertex: col0,
                colLastVertex: colLast,
                row,
            });
            expect(gap).toBeLessThan(0.001);
        }
        expect(result.maxResidualGapMm).toBeLessThan(0.001);
    });

    it('leaves intermediate seam gaps on-surface instead of averaging them', () => {
        const numU = 8, numT = 4, radius = 20;
        const gapMm = 0.3;
        const { positions, indices } = buildSeamGrid(numU, numT, radius, gapMm);
        const originalPositions = positions.slice();
        const config = healConfigForProfile('ultra');

        const result = healSeam(positions, indices, indices.length, numU, numT, config);

        expect(gapMm).toBeGreaterThan(config.averageOnlyThresholdMm);
        expect(gapMm).toBeLessThan(config.ghostTriangleThresholdMm);
        expect(result.pairsAveraged).toBe(0);
        expect(result.ghostStripsInserted).toBe(0);
        expect(result.positions).toEqual(originalPositions);
        expect(result.maxResidualGapMm).toBeCloseTo(gapMm, 4);
    });

    it('does not grow index buffer when all gaps are healable by averaging', () => {
        const numU = 8, numT = 4, radius = 20;
        const { positions, indices } = buildSeamGrid(numU, numT, radius, 0.3);
        const config = healConfigForProfile('standard');
        const origLen = indices.length;

        const result = healSeam(positions, indices, indices.length, numU, numT, config);
        expect(result.indices.length).toBe(origLen);
        expect(result.ghostStripsInserted).toBe(0);
    });

    it('keeps base-grid seam pairs when UV extras have a larger U than the grid seam column', () => {
        const numU = 8, numT = 4, radius = 20;
        const { positions, indices } = buildSeamGrid(numU, numT, radius, 0.3);
        const positionsWithExtra = new Float32Array(positions.length + 3);
        positionsWithExtra.set(positions);
        positionsWithExtra.set([radius, 999, 0], positions.length);

        const uvs = new Float32Array((numU * numT + 1) * 3);
        for (let row = 0; row < numT; row++) {
            for (let col = 0; col < numU; col++) {
                const base = (row * numU + col) * 3;
                uvs[base] = col === numU - 1 ? 0.9974 : col / numU;
                uvs[base + 1] = row / (numT - 1);
                uvs[base + 2] = 0;
            }
        }
        uvs[numU * numT * 3] = 0.9999;
        uvs[numU * numT * 3 + 1] = 0.1234;
        uvs[numU * numT * 3 + 2] = 0;

        const result = healSeam(
            positionsWithExtra,
            indices,
            indices.length,
            numU,
            numT,
            healConfigForProfile('standard'),
            uvs,
            numU * numT + 1,
        );

        expect(result.pairsAveraged).toBeGreaterThanOrEqual(numT);
        for (let row = 0; row < numT; row++) {
            expect(measurePositionGap(result.positions, {
                col0Vertex: row * numU,
                colLastVertex: row * numU + numU - 1,
                row,
            })).toBeLessThan(0.001);
        }
    });

    it('inserts ghost triangles for large gaps', () => {
        const numU = 8, numT = 4, radius = 20;
        const gapMm = 10; // way above ghostTriangleThresholdMm (5.0)
        const { positions, indices } = buildSeamGrid(numU, numT, radius, gapMm);
        const config = { averageOnlyThresholdMm: 0.5, ghostTriangleThresholdMm: 5.0 };

        const result = healSeam(positions, indices, indices.length, numU, numT, config);

        // All pairs should get ghost triangles (gap > ghostTriangleThresholdMm)
        expect(result.pairsAveraged).toBe(0);
        // Ghost strips = consecutive ghost-candidate row pairs = numT - 1
        expect(result.ghostStripsInserted).toBe(numT - 1);
        // Index buffer should grow by ghostStripsInserted * 6 (2 tris per strip)
        expect(result.indices.length).toBe(indices.length + (numT - 1) * 6);
    });

    it('healConfigForProfile returns tighter thresholds for higher profiles', () => {
        const draft = healConfigForProfile('draft');
        const standard = healConfigForProfile('standard');
        const high = healConfigForProfile('high');
        const ultra = healConfigForProfile('ultra');

        expect(draft.averageOnlyThresholdMm).toBeGreaterThan(standard.averageOnlyThresholdMm);
        expect(standard.averageOnlyThresholdMm).toBeGreaterThan(high.averageOnlyThresholdMm);
        expect(high.averageOnlyThresholdMm).toBeGreaterThan(ultra.averageOnlyThresholdMm);
    });
});
