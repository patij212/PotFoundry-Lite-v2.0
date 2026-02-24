/**
 * OuterWallTessellator.test.ts â€” Tests for chain-constrained outer wall mesh generation.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { buildCDTOuterWall, insertMicroRowsForSteepCrossings } from './OuterWallTessellator';
import type { FeatureChain } from './types';

// ============================================================================
// Helpers
// ============================================================================

/** Create a simple uniform U-grid */
function makeUniformU(cols: number): Float32Array {
    const u = new Float32Array(cols);
    for (let i = 0; i < cols; i++) u[i] = i / (cols - 1);
    return u;
}

/** Create uniform T positions */
function makeUniformT(rows: number): Float32Array {
    const t = new Float32Array(rows);
    for (let i = 0; i < rows; i++) t[i] = i / (rows - 1);
    return t;
}

/** Create identity row mapping (row i -> original row i) */
function makeIdentityRowMapping(numT: number): number[] {
    return Array.from({ length: numT }, (_, i) => i);
}

// ============================================================================
// Basic grid tests (no chains)
// ============================================================================

describe('OuterWallTessellator', () => {
    describe('buildCDTOuterWall â€” empty chains', () => {
        const numU = 5;
        const numT = 4;
        const unionU = makeUniformU(numU);
        const tPositions = makeUniformT(numT);
        const rowMapping = makeIdentityRowMapping(numT);
        const chains: FeatureChain[] = [];

        const result = buildCDTOuterWall(
            chains, rowMapping, tPositions, unionU, 100, 0
        );

        it('returns correct number of vertex components', () => {
            // gridVertexCount = numU * numT = 20
            // Each vertex has 3 components (u, t, surfaceId)
            expect(result.vertices.length).toBe(numU * numT * 3);
        });

        it('gridVertexCount matches numU Ã— numT', () => {
            expect(result.gridVertexCount).toBe(numU * numT);
        });

        it('produces valid triangle indices', () => {
            const maxIdx = result.gridVertexCount;
            for (let i = 0; i < result.indices.length; i++) {
                expect(result.indices[i]).toBeLessThan(maxIdx);
            }
        });

        it('indices length is divisible by 3', () => {
            expect(result.indices.length % 3).toBe(0);
        });

        it('quadMap length matches (numU-1) Ã— (numT-1)', () => {
            expect(result.quadMap.length).toBe((numU - 1) * (numT - 1));
        });

        it('chainEdges is empty with no chains', () => {
            expect(result.chainEdges.length).toBe(0);
        });

        it('produces correct vertex U values', () => {
            for (let j = 0; j < numT; j++) {
                for (let i = 0; i < numU; i++) {
                    const idx = (j * numU + i) * 3;
                    expect(result.vertices[idx]).toBeCloseTo(unionU[i], 5);
                }
            }
        });

        it('produces correct vertex T values', () => {
            for (let j = 0; j < numT; j++) {
                for (let i = 0; i < numU; i++) {
                    const idx = (j * numU + i) * 3 + 1;
                    expect(result.vertices[idx]).toBeCloseTo(tPositions[j], 5);
                }
            }
        });

        it('produces correct surfaceId values', () => {
            for (let j = 0; j < numT; j++) {
                for (let i = 0; i < numU; i++) {
                    const idx = (j * numU + i) * 3 + 2;
                    expect(result.vertices[idx]).toBe(0);
                }
            }
        });

        it('produces non-degenerate triangles', () => {
            for (let i = 0; i < result.indices.length; i += 3) {
                const a = result.indices[i], b = result.indices[i + 1], c = result.indices[i + 2];
                expect(a).not.toBe(b);
                expect(b).not.toBe(c);
                expect(a).not.toBe(c);
            }
        });

        it('standard cells have valid quadMap entries', () => {
            let standardCount = 0;
            for (let q = 0; q < result.quadMap.length; q++) {
                if (result.quadMap[q] >= 0) {
                    standardCount++;
                    const triOffset = result.quadMap[q];
                    // Each standard quad produces 6 index entries (2 triangles)
                    expect(triOffset).toBeGreaterThanOrEqual(0);
                    expect(triOffset).toBeLessThan(result.indices.length);
                }
            }
            expect(standardCount).toBeGreaterThan(0);
        });
    });

    describe('buildCDTOuterWall â€” minimal grid', () => {
        it('handles 2Ã—2 grid (single cell)', () => {
            const unionU = new Float32Array([0, 0.5]);
            const tPositions = new Float32Array([0, 1]);
            const rowMapping = [0, 1];
            const chains: FeatureChain[] = [];

            const result = buildCDTOuterWall(
                chains, rowMapping, tPositions, unionU, 10, 0
            );

            expect(result.gridVertexCount).toBe(4);
            expect(result.vertices.length).toBe(12); // 4 Ã— 3
            // 1 cell â†’ 2 triangles â†’ 6 indices
            expect(result.indices.length).toBe(6);
        });

        it('handles 3Ã—2 grid (two cells in a row)', () => {
            const unionU = new Float32Array([0, 0.25, 0.5]);
            const tPositions = new Float32Array([0, 1]);
            const rowMapping = [0, 1];
            const chains: FeatureChain[] = [];

            const result = buildCDTOuterWall(
                chains, rowMapping, tPositions, unionU, 10, 0
            );

            expect(result.gridVertexCount).toBe(6);
            // 2 cells â†’ 4 triangles â†’ 12 indices
            expect(result.indices.length).toBe(12);
        });
    });

    describe('buildCDTOuterWall â€” surfaceId', () => {
        it('stamps correct surfaceId', () => {
            const unionU = new Float32Array([0, 0.5]);
            const tPositions = new Float32Array([0, 1]);
            const rowMapping = [0, 1];
            const chains: FeatureChain[] = [];

            const result = buildCDTOuterWall(
                chains, rowMapping, tPositions, unionU, 10, 2
            );

            for (let v = 0; v < result.gridVertexCount; v++) {
                expect(result.vertices[v * 3 + 2]).toBe(2);
            }
        });
    });

    describe('buildCDTOuterWall â€” seam handling', () => {
        it('skips cells that span more than SEAM_GUARD', () => {
            // Create a U grid where the last cell wraps (gap > 0.3)
            const unionU = new Float32Array([0, 0.1, 0.2, 0.3, 0.7]);
            const tPositions = new Float32Array([0, 0.5, 1.0]);
            const rowMapping = [0, 1, 2];
            const chains: FeatureChain[] = [];

            const result = buildCDTOuterWall(
                chains, rowMapping, tPositions, unionU, 100, 0
            );

            // The last cell (0.3â†’0.7 = span 0.4) exceeds SEAM_GUARD (0.3)
            // So it should be marked -1 in quadMap
            const cellsPerRow = unionU.length - 1; // 4
            for (let j = 0; j < tPositions.length - 1; j++) {
                const lastCellIdx = j * cellsPerRow + (cellsPerRow - 1);
                expect(result.quadMap[lastCellIdx]).toBe(-1);
            }
        });
    });

    describe('buildCDTOuterWall â€” with chains', () => {
        it('snaps grid vertex to chain U position', () => {
            const numU = 10;
            const numT = 5;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = makeIdentityRowMapping(numT);

            // Create a chain with 2 points that should snap nearby grid vertices
            const chainU = 0.15; // between column 1 (0.111) and 2 (0.222)
            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 1, u: chainU },
                    { row: 2, u: chainU },
                ],
            };

            const result = buildCDTOuterWall(
                [chain], rowMapping, tPositions, unionU, 200, 0
            );

            // v20.0 snaps the nearest grid column to the chain U.
            // Column 1 at u=0.111 is nearest to 0.15.
            // Check that vertex at row=1, col=1 has its U snapped to chainU.
            const vIdx = (1 * numU + 1) * 3;
            expect(result.vertices[vIdx]).toBeCloseTo(chainU, 5);
        });

        it('does not add extra vertices beyond grid in v20.0 mode', () => {
            const numU = 6;
            const numT = 4;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = makeIdentityRowMapping(numT);

            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.3 },
                    { row: 1, u: 0.3 },
                    { row: 2, u: 0.3 },
                ],
            };

            const result = buildCDTOuterWall(
                [chain], rowMapping, tPositions, unionU, 100, 0
            );

            // v20.0 clears chainVertices/chainEdges â†’ total vertices = grid only
            expect(result.gridVertexCount).toBe(numU * numT);
            expect(result.vertices.length).toBe(numU * numT * 3);
            expect(result.chainEdges.length).toBe(0);
        });

        it('chain with single point is skipped', () => {
            const numU = 5;
            const numT = 3;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = makeIdentityRowMapping(numT);

            const chain: FeatureChain = {
                kind: 'peak',
                points: [{ row: 1, u: 0.5 }],
            };

            const result = buildCDTOuterWall(
                [chain], rowMapping, tPositions, unionU, 50, 0
            );

            // Single-point chain skipped â†’ same as no chains
            expect(result.chainEdges.length).toBe(0);
            expect(result.gridVertexCount).toBe(numU * numT);
        });
    });

    describe('buildCDTOuterWall â€” row mapping', () => {
        it('handles non-identity row mapping', () => {
            const numU = 4;
            const numT = 3;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            // Final rows 0,1,2 map to original rows 0,2,4
            const rowMapping = [0, 2, 4];

            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.25 },
                    { row: 2, u: 0.25 },
                ],
            };

            const result = buildCDTOuterWall(
                [chain], rowMapping, tPositions, unionU, 50, 0
            );

            // Both chain points should map to final rows 0 and 1
            expect(result.gridVertexCount).toBe(numU * numT);
            expect(result.vertices.length).toBe(numU * numT * 3);
        });

        it('chain point with unmapped row is ignored', () => {
            const numU = 4;
            const numT = 3;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = [0, 2, 4]; // only originals 0, 2, 4 mapped

            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 1, u: 0.25 }, // orig row 1 NOT mapped
                    { row: 2, u: 0.25 },
                ],
            };

            const result = buildCDTOuterWall(
                [chain], rowMapping, tPositions, unionU, 50, 0
            );

            // Chain effectively has 1 point (row 1 unmapped) â†’ skipped
            expect(result.chainEdges.length).toBe(0);
        });
    });

    describe('buildCDTOuterWall â€” return types', () => {
        it('vertices is Float32Array', () => {
            const result = buildCDTOuterWall(
                [], [0, 1], new Float32Array([0, 1]), new Float32Array([0, 0.5]), 10, 0
            );
            expect(result.vertices).toBeInstanceOf(Float32Array);
        });

        it('indices is Uint32Array', () => {
            const result = buildCDTOuterWall(
                [], [0, 1], new Float32Array([0, 1]), new Float32Array([0, 0.5]), 10, 0
            );
            expect(result.indices).toBeInstanceOf(Uint32Array);
        });

        it('quadMap is Int32Array', () => {
            const result = buildCDTOuterWall(
                [], [0, 1], new Float32Array([0, 1]), new Float32Array([0, 0.5]), 10, 0
            );
            expect(result.quadMap).toBeInstanceOf(Int32Array);
        });
    });

    describe('buildCDTOuterWall â€” edge cases', () => {
        it('handles large grid without crashing', () => {
            const numU = 100;
            const numT = 50;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = makeIdentityRowMapping(numT);

            const result = buildCDTOuterWall(
                [], rowMapping, tPositions, unionU, 10000, 0
            );

            expect(result.gridVertexCount).toBe(numU * numT);
            expect(result.indices.length).toBeGreaterThan(0);
        });

        it('multiple chains with different kinds', () => {
            const numU = 8;
            const numT = 6;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = makeIdentityRowMapping(numT);

            const chains: FeatureChain[] = [
                {
                    kind: 'peak',
                    points: [
                        { row: 1, u: 0.2 },
                        { row: 2, u: 0.2 },
                        { row: 3, u: 0.2 },
                    ],
                },
                {
                    kind: 'valley',
                    points: [
                        { row: 1, u: 0.7 },
                        { row: 2, u: 0.7 },
                    ],
                },
            ];

            const result = buildCDTOuterWall(
                chains, rowMapping, tPositions, unionU, 200, 0
            );

            expect(result.gridVertexCount).toBe(numU * numT);
            expect(result.indices.length).toBeGreaterThan(0);
        });
    });

    // ========================================================================
    // insertMicroRowsForSteepCrossings tests
    // ========================================================================

    describe('insertMicroRowsForSteepCrossings', () => {
        it('returns unchanged data when no chains are provided', () => {
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const unionU = makeUniformU(8);
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2]]);

            const result = insertMicroRowsForSteepCrossings(tPos, [], origMap, unionU);

            expect(result.microRowCount).toBe(0);
            expect(result.tPositions).toBe(tPos); // same reference (no-op)
        });

        it('returns unchanged data for gentle chains (≤1 col per row)', () => {
            const numU = 10;
            const unionU = makeUniformU(numU);
            const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);

            // Chain moves ≤1 column per row → no steep crossings
            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.1 },
                    { row: 1, u: 0.15 },
                    { row: 2, u: 0.2 },
                    { row: 3, u: 0.25 },
                ],
            };

            const result = insertMicroRowsForSteepCrossings(tPos, [chain], origMap, unionU);
            expect(result.microRowCount).toBe(0);
        });

        it('inserts micro-rows for steep chain crossings', () => {
            const numU = 10;
            const unionU = makeUniformU(numU); // cols at 0, 0.111, 0.222, ...
            const tPos = new Float32Array([0, 0.5, 1.0]); // 3 rows
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2]]);

            // Chain jumps from col ~1 (u=0.111) to col ~5 (u=0.556) in one row step
            // That's ~4 columns in one row → steep crossing
            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.111 },
                    { row: 1, u: 0.556 },
                ],
            };

            const result = insertMicroRowsForSteepCrossings(tPos, [chain], origMap, unionU);

            expect(result.microRowCount).toBeGreaterThan(0);
            expect(result.tPositions.length).toBeGreaterThan(tPos.length);
            // Original rows should still be mapped
            expect(result.origToFinal.has(0)).toBe(true);
            expect(result.origToFinal.has(1)).toBe(true);
            expect(result.origToFinal.has(2)).toBe(true);
        });

        it('preserves sorted T order in expanded positions', () => {
            const numU = 10;
            const unionU = makeUniformU(numU);
            const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);

            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 1, u: 0.1 },
                    { row: 2, u: 0.6 }, // jumps ~5 cols
                ],
            };

            const result = insertMicroRowsForSteepCrossings(tPos, [chain], origMap, unionU);

            // Verify T values are monotonically increasing
            for (let i = 1; i < result.tPositions.length; i++) {
                expect(result.tPositions[i]).toBeGreaterThan(result.tPositions[i - 1]);
            }
        });

        it('origToFinal maps are consistent with expanded positions', () => {
            const numU = 10;
            const unionU = makeUniformU(numU);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2]]);

            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.1 },
                    { row: 1, u: 0.7 }, // ~6 col jump → steep
                ],
            };

            const result = insertMicroRowsForSteepCrossings(tPos, [chain], origMap, unionU);

            // Each original row maps to the correct T value in expanded array
            for (const [origRow] of origMap) {
                const mappedFinal = result.origToFinal.get(origRow);
                expect(mappedFinal).toBeDefined();
                expect(result.tPositions[mappedFinal!]).toBeCloseTo(tPos[origRow], 5);
            }
        });

        it('handles circular U wrapping for steep crossings', () => {
            const numU = 10;
            const unionU = makeUniformU(numU);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2]]);

            // Chain near seam: u wraps from 0.88 (col 8) to 0.99 (col 8 or 9-ish)
            // Without wrapping: |col9 - col8| = 1 → not steep
            // This verifies the wrapping logic doesn't false-positive
            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.88 },
                    { row: 1, u: 0.99 }, // same or adjacent column → not steep
                ],
            };

            const result = insertMicroRowsForSteepCrossings(tPos, [chain], origMap, unionU);

            // Gap is ≤1 column → no micro-rows
            expect(result.microRowCount).toBe(0);
        });

        it('multiple chains create micro-rows independently', () => {
            const numU = 10;
            const unionU = makeUniformU(numU);
            const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);

            const chains: FeatureChain[] = [
                {
                    kind: 'peak',
                    points: [
                        { row: 0, u: 0.1 },
                        { row: 1, u: 0.6 }, // ~5 col jump
                    ],
                },
                {
                    kind: 'valley',
                    points: [
                        { row: 2, u: 0.8 },
                        { row: 3, u: 0.2 }, // ~6 col jump with wrapping? No — 0.8→0.2 gap=6, wrapping makes it 4? Let's check
                    ],
                },
            ];

            const result = insertMicroRowsForSteepCrossings(tPos, chains, origMap, unionU);

            // At least the first chain has a steep crossing
            expect(result.microRowCount).toBeGreaterThan(0);
            expect(result.tPositions.length).toBeGreaterThan(tPos.length);
        });

        it('does not insert micro-rows for single-point chains', () => {
            const numU = 10;
            const unionU = makeUniformU(numU);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const origMap = new Map<number, number>([[0, 0], [1, 1], [2, 2]]);

            const chain: FeatureChain = {
                kind: 'peak',
                points: [{ row: 1, u: 0.5 }],
            };

            const result = insertMicroRowsForSteepCrossings(tPos, [chain], origMap, unionU);
            expect(result.microRowCount).toBe(0);
        });
    });

    // ========================================================================
    // Integration: buildCDTOuterWall with steep chains
    // ========================================================================

    describe('buildCDTOuterWall — steep chain integration', () => {
        it('produces more grid vertices when steep chains cause micro-row insertion', () => {
            const numU = 10;
            const numT = 5;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = makeIdentityRowMapping(numT);

            // Steep chain: jumps ~5 columns in one row
            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 1, u: 0.1 },
                    { row: 2, u: 0.6 },
                ],
            };

            const resultWithChain = buildCDTOuterWall(
                [chain], rowMapping, tPositions, unionU, 200, 0
            );
            const resultNoChain = buildCDTOuterWall(
                [], rowMapping, tPositions, unionU, 200, 0
            );

            // Micro-rows mean more total grid vertices
            expect(resultWithChain.gridVertexCount).toBeGreaterThan(resultNoChain.gridVertexCount);
        });

        it('all triangle indices remain valid after micro-row expansion', () => {
            const numU = 8;
            const numT = 4;
            const unionU = makeUniformU(numU);
            const tPositions = makeUniformT(numT);
            const rowMapping = makeIdentityRowMapping(numT);

            const chain: FeatureChain = {
                kind: 'peak',
                points: [
                    { row: 0, u: 0.05 },
                    { row: 1, u: 0.7 }, // ~5 col jump
                ],
            };

            const result = buildCDTOuterWall(
                [chain], rowMapping, tPositions, unionU, 200, 0
            );

            // All indices must be < gridVertexCount
            for (let i = 0; i < result.indices.length; i++) {
                expect(result.indices[i]).toBeLessThan(result.gridVertexCount);
            }
            // All triangles non-degenerate
            for (let i = 0; i < result.indices.length; i += 3) {
                const a = result.indices[i], b = result.indices[i + 1], c = result.indices[i + 2];
                expect(a).not.toBe(b);
                expect(b).not.toBe(c);
                expect(a).not.toBe(c);
            }
        });
    });
});
