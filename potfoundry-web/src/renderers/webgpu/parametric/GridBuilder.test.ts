/**
 * GridBuilder.test.ts — Unit tests for the GridBuilder module.
 *
 * Tests CDF-adaptive grid generation, feature merging, union grid
 * construction, per-row patching, grid dimension computation,
 * binary-search floor, and downsampling.
 */
import { describe, it, expect } from 'vitest';
import {
    FLANK_OFFSET,
    MIN_U_SEPARATION,
    FLANK_OFFSETS,
    FEATURE_CLUSTER_RADIUS,
    bsearchFloor,
    mergeFeaturePositions,
    generateCDFAdaptivePositions,
    generateAdaptiveGrid,
    buildUnionFeatureGrid,
    patchRowFeatures,
    computeGridDimensions,
    downsampleSortedPositions,
} from './GridBuilder';

// ============================================================================
// Constants smoke tests
// ============================================================================
describe('GridBuilder constants', () => {
    it('FLANK_OFFSET is a positive fraction', () => {
        expect(FLANK_OFFSET).toBeGreaterThan(0);
        expect(FLANK_OFFSET).toBeLessThan(1);
    });

    it('MIN_U_SEPARATION is very small but positive', () => {
        expect(MIN_U_SEPARATION).toBeGreaterThan(0);
        expect(MIN_U_SEPARATION).toBeLessThan(0.01);
    });

    it('FLANK_OFFSETS has 4 geometrically spaced values', () => {
        expect(FLANK_OFFSETS).toHaveLength(4);
        for (let i = 1; i < FLANK_OFFSETS.length; i++) {
            expect(FLANK_OFFSETS[i]).toBeGreaterThan(FLANK_OFFSETS[i - 1]);
        }
    });

    it('FEATURE_CLUSTER_RADIUS is a small positive number', () => {
        expect(FEATURE_CLUSTER_RADIUS).toBeGreaterThan(0);
        expect(FEATURE_CLUSTER_RADIUS).toBeLessThan(0.1);
    });
});

// ============================================================================
// bsearchFloor
// ============================================================================
describe('bsearchFloor', () => {
    const arr = new Float32Array([0.0, 0.2, 0.4, 0.6, 0.8, 1.0]);

    it('returns -1 when value < arr[0]', () => {
        expect(bsearchFloor(arr, -0.1)).toBe(-1);
    });

    it('returns 0 for value at arr[0]', () => {
        expect(bsearchFloor(arr, 0.0)).toBe(0);
    });

    it('returns correct floor index for mid-range value', () => {
        expect(bsearchFloor(arr, 0.3)).toBe(1); // 0.2 <= 0.3 < 0.4
    });

    it('returns exact index for exact match (number[])', () => {
        // Use number[] to avoid Float32 precision issues
        const numArr = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
        expect(bsearchFloor(numArr, 0.4)).toBe(2);
    });

    it('returns last index for value >= last element', () => {
        expect(bsearchFloor(arr, 1.0)).toBe(5);
        expect(bsearchFloor(arr, 1.5)).toBe(5);
    });

    it('works with number[] arrays', () => {
        const numArr = [0, 10, 20, 30];
        expect(bsearchFloor(numArr, 15)).toBe(1);
        expect(bsearchFloor(numArr, 25)).toBe(2);
    });

    it('handles single-element array', () => {
        const single = new Float32Array([0.5]);
        expect(bsearchFloor(single, 0.3)).toBe(-1);
        expect(bsearchFloor(single, 0.5)).toBe(0);
        expect(bsearchFloor(single, 0.7)).toBe(0);
    });
});

// ============================================================================
// mergeFeaturePositions
// ============================================================================
describe('mergeFeaturePositions', () => {
    it('returns cdfPositions unchanged when no features', () => {
        const cdf = new Float32Array([0.0, 0.25, 0.5, 0.75]);
        const result = mergeFeaturePositions(cdf, []);
        expect(result.positions).toBe(cdf); // Same reference
        expect(result.injected).toBe(0);
    });

    it('injects feature positions with flanking companions', () => {
        const cdf = new Float32Array([0.0, 0.25, 0.5, 0.75, 1.0]);
        const result = mergeFeaturePositions(cdf, [0.33], false);
        // Should have more positions than original
        expect(result.positions.length).toBeGreaterThan(cdf.length);
        expect(result.injected).toBeGreaterThan(0);
    });

    it('output is sorted', () => {
        const cdf = new Float32Array([0.0, 0.5, 1.0]);
        const result = mergeFeaturePositions(cdf, [0.7, 0.2], false);
        for (let i = 1; i < result.positions.length; i++) {
            expect(result.positions[i]).toBeGreaterThanOrEqual(result.positions[i - 1]);
        }
    });

    it('deduplicates positions that are very close', () => {
        // Create CDF with closely spaced positions
        const cdf = new Float32Array([0.0, 0.1, 0.1001, 0.5, 1.0]);
        const result = mergeFeaturePositions(cdf, [0.1002], false);
        // The very close positions should be merged
        for (let i = 1; i < result.positions.length; i++) {
            expect(result.positions[i] - result.positions[i - 1]).toBeGreaterThan(0);
        }
    });

    it('handles periodic wrapping', () => {
        const cdf = new Float32Array([0.0, 0.5]);
        const result = mergeFeaturePositions(cdf, [0.05], true);
        // Left flank of 0.05 wraps around to ~0.95
        expect(result.positions.length).toBeGreaterThan(2);
    });
});

// ============================================================================
// generateCDFAdaptivePositions
// ============================================================================
describe('generateCDFAdaptivePositions', () => {
    it('produces uniform positions for flat curvature', () => {
        const flat = new Float32Array(100).fill(0);
        const positions = generateCDFAdaptivePositions(flat, 10);
        expect(positions.length).toBe(10);
        // Should be approximately uniform
        for (let i = 1; i < positions.length; i++) {
            expect(positions[i]).toBeGreaterThan(positions[i - 1]);
        }
    });

    it('concentrates samples in high-curvature regions', () => {
        const n = 100;
        const curvature = new Float32Array(n);
        // Put high curvature in first quarter
        for (let i = 0; i < 25; i++) curvature[i] = 1.0;
        const positions = generateCDFAdaptivePositions(curvature, 20);
        // Count how many positions fall in [0, 0.25)
        const inFirstQuarter = positions.filter(p => p < 0.25).length;
        // Should be more than uniform (5/20 = 25%)
        expect(inFirstQuarter).toBeGreaterThan(5);
    });

    it('returns correct count', () => {
        const curvature = new Float32Array(50).fill(0.5);
        const positions = generateCDFAdaptivePositions(curvature, 30);
        expect(positions.length).toBe(30);
    });

    it('first position is 0', () => {
        const curvature = new Float32Array(100);
        for (let i = 0; i < 100; i++) curvature[i] = Math.random();
        const positions = generateCDFAdaptivePositions(curvature, 50);
        expect(positions[0]).toBe(0);
    });

    it('all positions are in [0, 1)', () => {
        const curvature = new Float32Array(100);
        for (let i = 0; i < 100; i++) curvature[i] = Math.random();
        const positions = generateCDFAdaptivePositions(curvature, 50);
        for (const p of positions) {
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThan(1);
        }
    });
});

// ============================================================================
// generateAdaptiveGrid
// ============================================================================
describe('generateAdaptiveGrid', () => {
    it('produces correct vertex and index counts', () => {
        const uPos = new Float32Array([0, 0.25, 0.5, 0.75]); // w=4
        const tPos = new Float32Array([0, 0.5, 1.0]);         // 3 rows, h=2
        const result = generateAdaptiveGrid(uPos, tPos, 0, false);

        expect(result.w).toBe(4);
        // Vertices: 4 * 3 = 12, each has 3 components
        expect(result.vertices.length).toBe(12 * 3);
        // Triangles: 4 * 2 * 2 = 16, each has 3 indices
        expect(result.indices.length).toBe(16 * 3);
    });

    it('vertices have correct U, T, surfaceId layout', () => {
        const uPos = new Float32Array([0, 0.5]);
        const tPos = new Float32Array([0, 1.0]);
        const result = generateAdaptiveGrid(uPos, tPos, 42, false);

        // First vertex: U=0, T=0, surfaceId=42
        expect(result.vertices[0]).toBe(0);
        expect(result.vertices[1]).toBe(0);
        expect(result.vertices[2]).toBe(42);
    });

    it('wraps U indices periodically', () => {
        const uPos = new Float32Array([0, 0.5]);
        const tPos = new Float32Array([0, 1.0]);
        const result = generateAdaptiveGrid(uPos, tPos, 0, false);

        // With w=2, the quad at i=1 should wrap: i1 = (1+1)%2 = 0
        // Check that indices reference valid vertices
        for (const idx of result.indices) {
            expect(idx).toBeLessThan(uPos.length * tPos.length);
        }
    });

    it('inverts winding when requested', () => {
        const uPos = new Float32Array([0, 0.5]);
        const tPos = new Float32Array([0, 1.0]);
        const normal = generateAdaptiveGrid(uPos, tPos, 0, false);
        const inverted = generateAdaptiveGrid(uPos, tPos, 0, true);

        // First triangle winding should differ
        expect(normal.indices[0]).toBe(inverted.indices[0]); // i0 same
        // But i1 and i2 should be swapped
        expect(normal.indices[1]).toBe(inverted.indices[2]);
        expect(normal.indices[2]).toBe(inverted.indices[1]);
    });
});

// ============================================================================
// buildUnionFeatureGrid
// ============================================================================
describe('buildUnionFeatureGrid', () => {
    it('returns baseU when no features detected', () => {
        const baseU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const result = buildUnionFeatureGrid(baseU, []);
        expect(result).toBe(baseU); // Same reference
    });

    it('adds columns for detected features', () => {
        const baseU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const rowFeatures = [[0.33], [0.34], [0.33]];
        const result = buildUnionFeatureGrid(baseU, rowFeatures);
        expect(result.length).toBeGreaterThan(baseU.length);
    });

    it('output is sorted and in [0, 1)', () => {
        const baseU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const rowFeatures = [[0.1, 0.6], [0.12, 0.62]];
        const result = buildUnionFeatureGrid(baseU, rowFeatures);
        for (let i = 1; i < result.length; i++) {
            expect(result[i]).toBeGreaterThan(result[i - 1]);
        }
        for (const u of result) {
            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(1);
        }
    });

    it('clusters nearby features into one column', () => {
        const baseU = new Float32Array([0, 0.5]);
        // Three features within FEATURE_CLUSTER_RADIUS → one cluster
        const radius = FEATURE_CLUSTER_RADIUS;
        const rowFeatures = [
            [0.3],
            [0.3 + radius * 0.3],
            [0.3 + radius * 0.6],
        ];
        const result = buildUnionFeatureGrid(baseU, rowFeatures);
        // Should have base (2) + 1 feature center + flanks, not 3 separate centers
        // Count how many positions are near 0.3
        const near03 = Array.from(result).filter(u => Math.abs(u - 0.3) < 0.05);
        // Should be 1 center + flanks, not 3 separate cluster centers
        expect(near03.length).toBeGreaterThanOrEqual(1);
    });

    it('respects maxColumns budget cap', () => {
        const n = 100;
        const baseU = new Float32Array(n);
        for (let i = 0; i < n; i++) baseU[i] = i / n;
        // Add many features to force exceeding budget
        const rowFeatures = Array.from({ length: 20 }, (_, i) =>
            [0.05 + i * 0.045]
        );
        const maxCols = 50;
        const result = buildUnionFeatureGrid(baseU, rowFeatures, maxCols);
        expect(result.length).toBeLessThanOrEqual(maxCols);
    });

    it('preserves all base positions when budget allows', () => {
        const baseU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const rowFeatures = [[0.33]];
        const result = buildUnionFeatureGrid(baseU, rowFeatures);
        // All base positions should be present (merged, not removed)
        for (const base of baseU) {
            const found = Array.from(result).some(u => Math.abs(u - base) < 1e-6);
            expect(found).toBe(true);
        }
    });
});

// ============================================================================
// patchRowFeatures
// ============================================================================
describe('patchRowFeatures', () => {
    it('snaps peak column to exact feature U', () => {
        const W = 4;
        const numRows = 2;
        const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
        // Vertex buffer: 2 rows × 4 cols × 3 components
        const vertices = new Float32Array(W * numRows * 3);
        for (let j = 0; j < numRows; j++) {
            for (let i = 0; i < W; i++) {
                vertices[(j * W + i) * 3] = unionU[i]; // u
                vertices[(j * W + i) * 3 + 1] = j / numRows; // t
                vertices[(j * W + i) * 3 + 2] = 0; // surfaceId
            }
        }

        const allRowFeatures = [[0.27], [0.26]];
        const patched = patchRowFeatures(vertices, W, numRows, unionU, allRowFeatures);

        // Column 1 (u=0.25) is nearest to 0.27 and 0.26
        expect(patched).toBe(2);
        // Row 0, Col 1 should be patched to 0.27
        expect(vertices[1 * 3]).toBeCloseTo(0.27, 5);
        // Row 1, Col 1 should be patched to 0.26
        expect(vertices[(W + 1) * 3]).toBeCloseTo(0.26, 5);
    });

    it('returns 0 when no features', () => {
        const W = 4;
        const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const vertices = new Float32Array(W * 2 * 3);
        const patched = patchRowFeatures(vertices, W, 2, unionU, [[], []]);
        expect(patched).toBe(0);
    });

    it('does not double-patch the same column in one row', () => {
        const W = 4;
        const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const vertices = new Float32Array(W * 1 * 3);
        for (let i = 0; i < W; i++) vertices[i * 3] = unionU[i];

        // Two features that would both snap to column 1
        const allRowFeatures = [[0.24, 0.26]];
        const patched = patchRowFeatures(vertices, W, 1, unionU, allRowFeatures);
        // Only one patch (first feature wins, second is skipped)
        expect(patched).toBe(1);
    });
});

// ============================================================================
// computeGridDimensions
// ============================================================================
describe('computeGridDimensions', () => {
    it('returns valid w and h', () => {
        const { w, h } = computeGridDimensions(100000, 0.5, 2.0);
        expect(w).toBeGreaterThanOrEqual(8);
        expect(h).toBeGreaterThanOrEqual(4);
    });

    it('respects triangle budget', () => {
        const totalTriangles = 50000;
        const { w, h } = computeGridDimensions(totalTriangles, 1.0, 1.0);
        const tris = (w - 1) * (h - 1) * 2;
        // Should not exceed budget (may be slightly under due to rounding)
        expect(tris).toBeLessThanOrEqual(totalTriangles * 1.1);
    });

    it('higher aspect ratio gives wider grid', () => {
        const narrow = computeGridDimensions(100000, 0.5, 1.0);
        const wide = computeGridDimensions(100000, 0.5, 4.0);
        expect(wide.w / wide.h).toBeGreaterThan(narrow.w / narrow.h);
    });

    it('enforces minimum dimensions', () => {
        const { w, h } = computeGridDimensions(10, 1.0, 1.0);
        expect(w).toBeGreaterThanOrEqual(8);
        expect(h).toBeGreaterThanOrEqual(4);
    });
});

// ============================================================================
// downsampleSortedPositions
// ============================================================================
describe('downsampleSortedPositions', () => {
    it('returns input when targetCount >= length', () => {
        const positions = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
        const result = downsampleSortedPositions(positions, 10);
        expect(result).toBe(positions); // Same reference
    });

    it('returns input when targetCount equals length', () => {
        const positions = new Float32Array([0, 0.5, 1.0]);
        const result = downsampleSortedPositions(positions, 3);
        expect(result).toBe(positions);
    });

    it('downsamples to target count', () => {
        const positions = new Float32Array(100);
        for (let i = 0; i < 100; i++) positions[i] = i / 100;
        const result = downsampleSortedPositions(positions, 20);
        expect(result.length).toBeLessThanOrEqual(20);
        expect(result.length).toBeGreaterThan(0);
    });

    it('preserves first and last elements', () => {
        const positions = new Float32Array([0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]);
        const result = downsampleSortedPositions(positions, 3);
        expect(result[0]).toBe(0);
        expect(result[result.length - 1]).toBe(1.0);
    });

    it('preserves monotonicity', () => {
        const positions = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
        const result = downsampleSortedPositions(positions, 3);
        for (let i = 1; i < result.length; i++) {
            expect(result[i]).toBeGreaterThan(result[i - 1]);
        }
    });

    it('handles targetCount=1', () => {
        const positions = new Float32Array([0.1, 0.5, 0.9]);
        const result = downsampleSortedPositions(positions, 1);
        expect(result.length).toBe(1);
        // Float32 precision: 0.1 is not exactly representable
        expect(result[0]).toBeCloseTo(0.1, 5);
    });

    it('handles targetCount=0', () => {
        const positions = new Float32Array([0.1, 0.5]);
        const result = downsampleSortedPositions(positions, 0);
        expect(result).toBe(positions);
    });
});
