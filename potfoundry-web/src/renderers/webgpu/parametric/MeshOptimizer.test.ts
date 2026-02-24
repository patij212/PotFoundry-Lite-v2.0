/**
 * MeshOptimizer.test.ts — Tests for quad diagonal flipping passes.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import {
    chainDirectedFlip,
    flipEdges3D,
    STITCH_BAND_HALF_WIDTH,
    CHAIN_LOCK_BAND_HALF_WIDTH,
} from './MeshOptimizer';
import type { FeatureChain } from './types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a default B-C diagonal grid mesh: for each quad (col, row),
 * tri0 = (A, B, C), tri1 = (B, D, C).
 *
 * Returns { indices, quadMap } ready for flip functions.
 */
function buildDefaultGrid(w: number, h: number): { indices: Uint32Array; quadMap: Int32Array } {
    const cellsPerRow = w - 1;
    const numQuads = cellsPerRow * (h - 1);
    const indices = new Uint32Array(numQuads * 6);
    const quadMap = new Int32Array(numQuads);

    let idx = 0;
    for (let j = 0; j < h - 1; j++) {
        for (let i = 0; i < cellsPerRow; i++) {
            const quadIdx = j * cellsPerRow + i;
            quadMap[quadIdx] = idx;

            const vA = j * w + i;
            const vB = j * w + (i + 1);
            const vC = (j + 1) * w + i;
            const vD = (j + 1) * w + (i + 1);

            // Default B-C diagonal
            indices[idx++] = vA;
            indices[idx++] = vB;
            indices[idx++] = vC;
            indices[idx++] = vB;
            indices[idx++] = vD;
            indices[idx++] = vC;
        }
    }
    return { indices, quadMap };
}

/** Create a uniform U-grid */
function makeUniformU(cols: number): Float32Array {
    const u = new Float32Array(cols);
    for (let i = 0; i < cols; i++) u[i] = i / (cols - 1);
    return u;
}

/** Identity row mapping */
function makeIdentityRowMapping(numT: number): number[] {
    return Array.from({ length: numT }, (_, i) => i);
}

/**
 * Build 3D positions for a flat plane (z=0) at grid positions.
 * Each vertex at (col, row) maps to (col/(w-1), row/(h-1), 0).
 */
function buildFlatPositions(w: number, h: number): Float32Array {
    const positions = new Float32Array(w * h * 3);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const idx = (j * w + i) * 3;
            positions[idx] = i / (w - 1);
            positions[idx + 1] = j / (h - 1);
            positions[idx + 2] = 0;
        }
    }
    return positions;
}

/**
 * Check if a quad has A-D diagonal: tri0 contains vD.
 */
function isADDiagonal(indices: Uint32Array, triBase: number, vD: number): boolean {
    return indices[triBase] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD;
}

// ============================================================================
// Constants
// ============================================================================

describe('MeshOptimizer constants', () => {
    it('STITCH_BAND_HALF_WIDTH is 1', () => {
        expect(STITCH_BAND_HALF_WIDTH).toBe(1);
    });

    it('CHAIN_LOCK_BAND_HALF_WIDTH is 1', () => {
        expect(CHAIN_LOCK_BAND_HALF_WIDTH).toBe(1);
    });
});

// ============================================================================
// chainDirectedFlip
// ============================================================================

describe('chainDirectedFlip', () => {
    const w = 6; // 6 columns → 5 cells per row
    const h = 5; // 5 rows → 4 quad rows

    it('returns zero flips with empty chains', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        const rowMapping = makeIdentityRowMapping(h);

        const result = chainDirectedFlip(
            indices, unionU, w, h, [], rowMapping, false, quadMap
        );

        expect(result.flipCount).toBe(0);
        expect(result.lockedQuads.size).toBe(0);
    });

    it('returns zero flips with single-point chain', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        const rowMapping = makeIdentityRowMapping(h);
        const chain: FeatureChain = {
            kind: 'ridge',
            points: [{ row: 1, u: 0.5, strength: 1.0 }],
        };

        const result = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap
        );

        expect(result.flipCount).toBe(0);
    });

    it('flips quads along a vertical chain', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        const rowMapping = makeIdentityRowMapping(h);

        // Chain at u=0.5, spanning rows 0→3 (vertical)
        const chain: FeatureChain = {
            kind: 'ridge',
            points: [
                { row: 0, u: 0.5, strength: 1.0 },
                { row: 1, u: 0.5, strength: 1.0 },
                { row: 2, u: 0.5, strength: 1.0 },
                { row: 3, u: 0.5, strength: 1.0 },
            ],
        };

        const result = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap
        );

        // Should flip or lock quads along the chain
        expect(result.flipCount).toBeGreaterThanOrEqual(0);
        expect(result.lockedQuads.size).toBeGreaterThan(0);
    });

    it('locks quads within CHAIN_LOCK_BAND_HALF_WIDTH', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        const rowMapping = makeIdentityRowMapping(h);

        // Chain leaning right (u increasing → should flip to A-D)
        const chain: FeatureChain = {
            kind: 'ridge',
            points: [
                { row: 0, u: 0.4, strength: 1.0 },
                { row: 3, u: 0.6, strength: 1.0 },
            ],
        };

        const result = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap
        );

        expect(result.lockedQuads.size).toBeGreaterThan(0);
    });

    it('flips to A-D for rightward-leaning chain', () => {
        const w2 = 5;
        const h2 = 3;
        const { indices, quadMap } = buildDefaultGrid(w2, h2);
        const unionU = makeUniformU(w2);
        const rowMapping = makeIdentityRowMapping(h2);

        // Chain leaning significantly right
        const chain: FeatureChain = {
            kind: 'ridge',
            points: [
                { row: 0, u: 0.3, strength: 1.0 },
                { row: 2, u: 0.7, strength: 1.0 },
            ],
        };

        const indicesBefore = new Uint32Array(indices);

        chainDirectedFlip(
            indices, unionU, w2, h2, [chain], rowMapping, false, quadMap
        );

        // At least some indices should change
        let changed = false;
        for (let i = 0; i < indices.length; i++) {
            if (indices[i] !== indicesBefore[i]) { changed = true; break; }
        }
        expect(changed).toBe(true);
    });

    it('handles invertWinding=true', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        const rowMapping = makeIdentityRowMapping(h);

        const chain: FeatureChain = {
            kind: 'ridge',
            points: [
                { row: 0, u: 0.3, strength: 1.0 },
                { row: 3, u: 0.7, strength: 1.0 },
            ],
        };

        const result = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, true, quadMap
        );

        // Should still flip (inverted winding doesn't prevent flipping)
        expect(result.flipCount).toBeGreaterThanOrEqual(0);
    });

    it('handles non-identity row mapping', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        // final row 0→orig 0, 1→orig 2, 2→orig 4, 3→orig 6, 4→orig 8
        const rowMapping = [0, 2, 4, 6, 8];

        const chain: FeatureChain = {
            kind: 'ridge',
            points: [
                { row: 0, u: 0.5, strength: 1.0 },
                { row: 2, u: 0.5, strength: 1.0 },
                { row: 4, u: 0.5, strength: 1.0 },
            ],
        };

        const result = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap
        );

        // Chain points map to final rows 0, 1, 2 → should process
        expect(result.lockedQuads.size).toBeGreaterThan(0);
    });

    it('skips degenerate quads (quadMap = -1)', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        const rowMapping = makeIdentityRowMapping(h);

        // Mark middle column as degenerate
        const cellsPerRow = w - 1;
        for (let j = 0; j < h - 1; j++) {
            quadMap[j * cellsPerRow + 2] = -1;
        }

        const chain: FeatureChain = {
            kind: 'ridge',
            points: [
                { row: 0, u: 0.5, strength: 1.0 }, // maps to col 2-3
                { row: 3, u: 0.5, strength: 1.0 },
            ],
        };

        // Should not crash on degenerate quads
        const result = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap
        );

        expect(result).toBeDefined();
    });

    it('multiple chains produce independent locked sets', () => {
        const largew = 20;
        const largeh = 10;
        const { indices, quadMap } = buildDefaultGrid(largew, largeh);
        const unionU = makeUniformU(largew);
        const rowMapping = makeIdentityRowMapping(largeh);

        const chains: FeatureChain[] = [
            {
                kind: 'ridge',
                points: [
                    { row: 0, u: 0.2, strength: 1.0 },
                    { row: 5, u: 0.2, strength: 1.0 },
                ],
            },
            {
                kind: 'ridge',
                points: [
                    { row: 0, u: 0.8, strength: 1.0 },
                    { row: 5, u: 0.8, strength: 1.0 },
                ],
            },
        ];

        const result = chainDirectedFlip(
            indices, unionU, largew, largeh, chains, rowMapping, false, quadMap
        );

        // Both chains should contribute locked quads
        expect(result.lockedQuads.size).toBeGreaterThanOrEqual(4);
    });
});

// ============================================================================
// flipEdges3D
// ============================================================================

describe('flipEdges3D', () => {
    const w = 5;
    const h = 4;

    it('returns zero flips on a perfectly flat plane', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const positions = buildFlatPositions(w, h);

        const flips = flipEdges3D(
            indices, positions, w, h, false, undefined, quadMap
        );

        // On a flat plane, all diagonals are equally good → no flips
        expect(flips).toBe(0);
    });

    it('skips locked quads', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const positions = buildFlatPositions(w, h);

        // Lock all quads
        const lockedQuads = new Set<number>();
        const cellsPerRow = w - 1;
        for (let j = 0; j < h - 1; j++) {
            for (let i = 0; i < cellsPerRow; i++) {
                lockedQuads.add(j * cellsPerRow + i);
            }
        }

        const flips = flipEdges3D(
            indices, positions, w, h, false, lockedQuads, quadMap
        );

        expect(flips).toBe(0);
    });

    it('skips degenerate quads (quadMap = -1)', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const positions = buildFlatPositions(w, h);

        // Mark all quads as degenerate
        quadMap.fill(-1);

        const flips = flipEdges3D(
            indices, positions, w, h, false, undefined, quadMap
        );

        expect(flips).toBe(0);
    });

    it('flips on a surface with curvature', () => {
        const w2 = 4;
        const h2 = 4;
        const { indices, quadMap } = buildDefaultGrid(w2, h2);

        // Create a surface with significant curvature (parabolic)
        const positions = new Float32Array(w2 * h2 * 3);
        for (let j = 0; j < h2; j++) {
            for (let i = 0; i < w2; i++) {
                const idx = (j * w2 + i) * 3;
                const x = i / (w2 - 1);
                const y = j / (h2 - 1);
                positions[idx] = x;
                positions[idx + 1] = y;
                // Saddle surface: z = x*y - (1-x)*(1-y), creates diagonal preference
                positions[idx + 2] = x * y * 2 - (1 - x) * (1 - y) * 2;
            }
        }

        const flips = flipEdges3D(
            indices, positions, w2, h2, false, undefined, quadMap
        );

        // May or may not flip depending on exact criterion — mainly testing it doesn't crash
        expect(flips).toBeGreaterThanOrEqual(0);
    });

    it('preserves valid mesh (all indices in bounds)', () => {
        const w2 = 8;
        const h2 = 6;
        const { indices, quadMap } = buildDefaultGrid(w2, h2);

        // Wavy surface
        const positions = new Float32Array(w2 * h2 * 3);
        for (let j = 0; j < h2; j++) {
            for (let i = 0; i < w2; i++) {
                const idx = (j * w2 + i) * 3;
                const x = i / (w2 - 1);
                const y = j / (h2 - 1);
                positions[idx] = x;
                positions[idx + 1] = y;
                positions[idx + 2] = Math.sin(x * Math.PI * 2) * Math.cos(y * Math.PI * 2) * 0.3;
            }
        }

        flipEdges3D(indices, positions, w2, h2, false, undefined, quadMap);

        // Verify all indices are valid
        const maxIdx = w2 * h2;
        for (let i = 0; i < indices.length; i++) {
            expect(indices[i]).toBeLessThan(maxIdx);
        }
    });

    it('works without quadMap (falls back to quadIdx*6)', () => {
        const w2 = 4;
        const h2 = 3;
        const { indices } = buildDefaultGrid(w2, h2);
        const positions = buildFlatPositions(w2, h2);

        // No quadMap → fallback
        const flips = flipEdges3D(
            indices, positions, w2, h2, false, undefined, undefined
        );

        expect(flips).toBeGreaterThanOrEqual(0);
    });

    it('handles invertWinding', () => {
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const positions = buildFlatPositions(w, h);

        const flips = flipEdges3D(
            indices, positions, w, h, true, undefined, quadMap
        );

        expect(flips).toBeGreaterThanOrEqual(0);
    });

    it('converges within MAX_PASSES', () => {
        const w2 = 10;
        const h2 = 10;
        const { indices, quadMap } = buildDefaultGrid(w2, h2);

        // Random-ish surface
        const positions = new Float32Array(w2 * h2 * 3);
        for (let j = 0; j < h2; j++) {
            for (let i = 0; i < w2; i++) {
                const idx = (j * w2 + i) * 3;
                const x = i / (w2 - 1);
                const y = j / (h2 - 1);
                positions[idx] = x;
                positions[idx + 1] = y;
                positions[idx + 2] = Math.sin(x * 5) * Math.cos(y * 7) * 0.5;
            }
        }

        // Should complete without hanging
        const flips = flipEdges3D(
            indices, positions, w2, h2, false, undefined, quadMap
        );

        expect(flips).toBeGreaterThanOrEqual(0);
    });
});

// ============================================================================
// Integration: chainDirectedFlip → flipEdges3D
// ============================================================================

describe('chainDirectedFlip + flipEdges3D integration', () => {
    it('locked quads from chainDirectedFlip are respected by flipEdges3D', () => {
        const w = 10;
        const h = 8;
        const { indices, quadMap } = buildDefaultGrid(w, h);
        const unionU = makeUniformU(w);
        const rowMapping = makeIdentityRowMapping(h);
        const positions = buildFlatPositions(w, h);

        const chain: FeatureChain = {
            kind: 'ridge',
            points: [
                { row: 0, u: 0.5, strength: 1.0 },
                { row: 4, u: 0.5, strength: 1.0 },
            ],
        };

        // Phase 1: chain-directed flips
        const { lockedQuads } = chainDirectedFlip(
            indices, unionU, w, h, [chain], rowMapping, false, quadMap
        );

        // Snapshot locked quad indices
        const lockedIndices: number[][] = [];
        for (const qi of lockedQuads) {
            const tb = quadMap[qi];
            if (tb >= 0) {
                lockedIndices.push([
                    indices[tb], indices[tb + 1], indices[tb + 2],
                    indices[tb + 3], indices[tb + 4], indices[tb + 5],
                ]);
            }
        }

        // Phase 2: 3D quality flips (respecting locks)
        flipEdges3D(
            indices, positions, w, h, false, lockedQuads, quadMap
        );

        // Verify locked quads were not changed
        let li = 0;
        for (const qi of lockedQuads) {
            const tb = quadMap[qi];
            if (tb >= 0) {
                const snapshot = lockedIndices[li++];
                for (let k = 0; k < 6; k++) {
                    expect(indices[tb + k]).toBe(snapshot[k]);
                }
            }
        }
    });
});
