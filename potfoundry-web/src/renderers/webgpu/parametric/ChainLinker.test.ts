/**
 * ChainLinker.test.ts — Unit tests for the ChainLinker module.
 *
 * Tests cover circular helpers, chain unwrapping/roughness, chain deduplication,
 * re-snapping, core linking algorithm, kind-separated linking, and row insertion.
 */

import { describe, it, expect } from 'vitest';
import {
    circularSignedDelta,
    liftUToReference,
    unwrapChain,
    chainRoughness,
    suppressDuplicateChains,
    resnapChainToMeasuredPeaks,
    postProcessFeatureChains,
    linkFeatureChainsCore,
    linkFeatureChains,
    linkFeatureChainsByKind,
    insertChainGuidedRows,
    CHAIN_LINK_RADIUS,
} from './ChainLinker';
import type { FeatureChain, FeaturePoint } from './types';

// ============================================================================
// circularSignedDelta
// ============================================================================

describe('circularSignedDelta', () => {
    it('should return 0 for identical positions', () => {
        expect(circularSignedDelta(0.5, 0.5)).toBeCloseTo(0);
    });

    it('should return positive for forward movement', () => {
        expect(circularSignedDelta(0.2, 0.3)).toBeCloseTo(0.1);
    });

    it('should return negative for backward movement', () => {
        expect(circularSignedDelta(0.3, 0.2)).toBeCloseTo(-0.1);
    });

    it('should wrap across the 0/1 boundary (forward)', () => {
        // 0.9 → 0.1 = forward by 0.2 (shortest path)
        expect(circularSignedDelta(0.9, 0.1)).toBeCloseTo(0.2);
    });

    it('should wrap across the 0/1 boundary (backward)', () => {
        // 0.1 → 0.9 = backward by -0.2 (shortest path)
        expect(circularSignedDelta(0.1, 0.9)).toBeCloseTo(-0.2);
    });

    it('should return value in [-0.5, 0.5]', () => {
        for (let i = 0; i < 100; i++) {
            const from = Math.random();
            const to = Math.random();
            const d = circularSignedDelta(from, to);
            expect(d).toBeGreaterThanOrEqual(-0.5);
            expect(d).toBeLessThanOrEqual(0.5);
        }
    });
});

// ============================================================================
// liftUToReference
// ============================================================================

describe('liftUToReference', () => {
    it('should return the input when reference is in [0, 1)', () => {
        expect(liftUToReference(0.3, 0.4)).toBeCloseTo(0.3);
    });

    it('should lift to the neighbourhood of a positive unwrapped reference', () => {
        // uWrapped=0.1, reference=1.1 → lifted should be 1.1
        expect(liftUToReference(0.1, 1.1)).toBeCloseTo(1.1);
    });

    it('should lift to the neighbourhood of a negative unwrapped reference', () => {
        // uWrapped=0.9, reference=-0.1 → lifted should be -0.1
        expect(liftUToReference(0.9, -0.1)).toBeCloseTo(-0.1);
    });
});

// ============================================================================
// unwrapChain
// ============================================================================

describe('unwrapChain', () => {
    it('should return empty array for empty chain', () => {
        expect(unwrapChain({ points: [] })).toEqual([]);
    });

    it('should return single value for single-point chain', () => {
        expect(unwrapChain({ points: [{ u: 0.5, row: 0 }] })).toEqual([0.5]);
    });

    it('should unwrap a chain that crosses the 0/1 boundary', () => {
        const chain: FeatureChain = {
            points: [
                { u: 0.9, row: 0 },
                { u: 0.95, row: 1 },
                { u: 0.02, row: 2 },  // wraps past 1.0
                { u: 0.07, row: 3 },
            ],
        };
        const unwrapped = unwrapChain(chain);
        expect(unwrapped[0]).toBeCloseTo(0.9);
        expect(unwrapped[1]).toBeCloseTo(0.95);
        expect(unwrapped[2]).toBeCloseTo(1.02); // 0.02 + 1.0
        expect(unwrapped[3]).toBeCloseTo(1.07);
    });

    it('should produce monotone steps for a straight vertical chain', () => {
        const chain: FeatureChain = {
            points: [
                { u: 0.5, row: 0 },
                { u: 0.5, row: 1 },
                { u: 0.5, row: 2 },
            ],
        };
        const unwrapped = unwrapChain(chain);
        expect(unwrapped).toEqual([0.5, 0.5, 0.5]);
    });
});

// ============================================================================
// chainRoughness
// ============================================================================

describe('chainRoughness', () => {
    it('should return 0 for chains with fewer than 3 points', () => {
        expect(chainRoughness({ points: [] })).toBe(0);
        expect(chainRoughness({ points: [{ u: 0.1, row: 0 }] })).toBe(0);
        expect(chainRoughness({ points: [{ u: 0.1, row: 0 }, { u: 0.2, row: 1 }] })).toBe(0);
    });

    it('should return 0 for a perfectly straight chain', () => {
        const chain: FeatureChain = {
            points: [
                { u: 0.1, row: 0 },
                { u: 0.15, row: 1 },
                { u: 0.2, row: 2 },
                { u: 0.25, row: 3 },
            ],
        };
        expect(chainRoughness(chain)).toBeCloseTo(0, 10);
    });

    it('should return positive value for a zigzag chain', () => {
        const chain: FeatureChain = {
            points: [
                { u: 0.1, row: 0 },
                { u: 0.2, row: 1 },
                { u: 0.1, row: 2 },
                { u: 0.2, row: 3 },
            ],
        };
        expect(chainRoughness(chain)).toBeGreaterThan(0);
    });
});

// ============================================================================
// suppressDuplicateChains
// ============================================================================

describe('suppressDuplicateChains', () => {
    it('should return all chains when none are duplicates', () => {
        const chains: FeatureChain[] = [
            { points: Array.from({ length: 30 }, (_, i) => ({ u: 0.1, row: i })) },
            { points: Array.from({ length: 30 }, (_, i) => ({ u: 0.5, row: i })) },
        ];
        const result = suppressDuplicateChains(chains);
        expect(result).toHaveLength(2);
    });

    it('should remove a duplicate chain tracking the same ridge', () => {
        // Two chains at nearly identical U, sharing many rows
        const basePoints = Array.from({ length: 40 }, (_, i) => ({ u: 0.3, row: i }));
        const dupePoints = Array.from({ length: 40 }, (_, i) => ({ u: 0.3001, row: i }));
        const chains: FeatureChain[] = [
            { points: basePoints },
            { points: dupePoints },
        ];
        const result = suppressDuplicateChains(chains);
        expect(result).toHaveLength(1);
    });
});

// ============================================================================
// resnapChainToMeasuredPeaks
// ============================================================================

describe('resnapChainToMeasuredPeaks', () => {
    it('should snap chain points to nearest measured peak', () => {
        const chain: FeatureChain = {
            points: [
                { u: 0.101, row: 0 },
                { u: 0.202, row: 1 },
            ],
        };
        const allRowFeatures = [
            [0.1, 0.5],  // row 0: peaks at 0.1 and 0.5
            [0.2, 0.7],  // row 1: peaks at 0.2 and 0.7
        ];
        const result = resnapChainToMeasuredPeaks(chain, allRowFeatures);
        expect(result.points[0].u).toBeCloseTo(0.1);
        expect(result.points[1].u).toBeCloseTo(0.2);
    });

    it('should keep original position when no peak is within snap radius', () => {
        const chain: FeatureChain = {
            points: [{ u: 0.5, row: 0 }],
        };
        const allRowFeatures = [[0.1, 0.9]]; // far away
        const result = resnapChainToMeasuredPeaks(chain, allRowFeatures);
        expect(result.points[0].u).toBeCloseTo(0.5);
    });
});

// ============================================================================
// postProcessFeatureChains
// ============================================================================

describe('postProcessFeatureChains', () => {
    it('should return empty array for empty input', () => {
        expect(postProcessFeatureChains([], [])).toEqual([]);
    });

    it('should deduplicate and resnap chains', () => {
        // Two near-duplicate chains + allRowFeatures for snapping
        const chain1: FeatureChain = {
            points: Array.from({ length: 40 }, (_, i) => ({ u: 0.301, row: i })),
        };
        const chain2: FeatureChain = {
            points: Array.from({ length: 40 }, (_, i) => ({ u: 0.3005, row: i })),
        };
        const allRowFeatures = Array.from({ length: 40 }, () => [0.3, 0.6]);
        const result = postProcessFeatureChains([chain1, chain2], allRowFeatures);
        // Should deduplicate to 1 chain
        expect(result).toHaveLength(1);
        // Should snap to 0.3
        expect(result[0].points[0].u).toBeCloseTo(0.3);
    });
});

// ============================================================================
// linkFeatureChainsCore
// ============================================================================

describe('linkFeatureChainsCore', () => {
    it('should produce no chains from empty row features', () => {
        const chains = linkFeatureChainsCore([], 0, 0.04, 6, 2.0);
        expect(chains).toEqual([]);
    });

    it('should link a vertical feature across rows', () => {
        // Feature at u=0.3 in every row for 10 rows
        const allRowFeatures = Array.from({ length: 10 }, () => [0.3]);
        const chains = linkFeatureChainsCore(allRowFeatures, 10, 0.04, 6, 2.0);
        expect(chains.length).toBeGreaterThanOrEqual(1);
        // Should have one chain spanning all rows
        const longest = chains.reduce((a, b) => a.points.length > b.points.length ? a : b);
        expect(longest.points.length).toBe(10);
    });

    it('should link a diagonal feature (drifting U)', () => {
        // Feature drifts from u=0.1 to u=0.19 over 10 rows (within link radius)
        const allRowFeatures = Array.from({ length: 10 }, (_, i) => [0.1 + i * 0.01]);
        const chains = linkFeatureChainsCore(allRowFeatures, 10, 0.04, 6, 2.0);
        expect(chains.length).toBeGreaterThanOrEqual(1);
        const longest = chains.reduce((a, b) => a.points.length > b.points.length ? a : b);
        expect(longest.points.length).toBe(10);
    });

    it('should bridge gaps using momentum when missCount < maxMissCount', () => {
        // Feature at u=0.3, but rows 4-5 are empty (gap)
        const allRowFeatures: number[][] = [];
        for (let i = 0; i < 10; i++) {
            if (i === 4 || i === 5) {
                allRowFeatures.push([]);  // gap
            } else {
                allRowFeatures.push([0.3]);
            }
        }
        const chains = linkFeatureChainsCore(allRowFeatures, 10, 0.04, 6, 2.0);
        // Should bridge the 2-row gap into one chain
        const longest = chains.reduce((a, b) => a.points.length > b.points.length ? a : b);
        expect(longest.points.length).toBe(8); // 10 rows - 2 empty = 8 points
    });

    it('should not link features too far apart', () => {
        // Two features far apart: u=0.1 and u=0.6
        const allRowFeatures = Array.from({ length: 5 }, () => [0.1, 0.6]);
        const chains = linkFeatureChainsCore(allRowFeatures, 5, 0.04, 6, 2.0);
        // Should produce 2 separate chains
        expect(chains).toHaveLength(2);
    });
});

// ============================================================================
// linkFeatureChains (two-pass)
// ============================================================================

describe('linkFeatureChains', () => {
    it('should perform primary + secondary pass', () => {
        // Simple vertical feature
        const allRowFeatures = Array.from({ length: 10 }, () => [0.25]);
        const chains = linkFeatureChains(allRowFeatures, 10);
        expect(chains.length).toBeGreaterThanOrEqual(1);
    });
});

// ============================================================================
// linkFeatureChainsByKind
// ============================================================================

describe('linkFeatureChainsByKind', () => {
    it('should separate peaks and valleys into independent chains', () => {
        const numRows = 10;
        const allRowFeatures: number[][] = [];
        const allRowTypedFeatures: FeaturePoint[][] = [];

        for (let j = 0; j < numRows; j++) {
            allRowFeatures.push([0.2, 0.7]);
            allRowTypedFeatures.push([
                { u: 0.2, kind: 'peak', radius: 10, prominence: 0.5, confidence: 0.9 },
                { u: 0.7, kind: 'valley', radius: 8, prominence: 0.3, confidence: 0.8 },
            ]);
        }

        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, numRows);
        // Should produce at least 2 chains: one peak, one valley
        expect(chains.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle rows with only peaks', () => {
        const numRows = 5;
        const allRowFeatures = Array.from({ length: numRows }, () => [0.3]);
        const allRowTypedFeatures: FeaturePoint[][] = Array.from({ length: numRows }, () => [
            { u: 0.3, kind: 'peak' as const, radius: 10, prominence: 0.5, confidence: 0.9 },
        ]);
        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, numRows);
        expect(chains.length).toBeGreaterThanOrEqual(1);
    });
});

// ============================================================================
// insertChainGuidedRows
// ============================================================================

describe('insertChainGuidedRows', () => {
    it('should return identity when no chains', () => {
        const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
        const result = insertChainGuidedRows(tPos, []);
        expect(result.insertedCount).toBe(0);
        expect(result.tPositions.length).toBe(5);
        expect(result.rowMapping).toEqual([0, 1, 2, 3, 4]);
    });

    it('should insert rows for diagonal chain segments', () => {
        const tPos = new Float32Array([0, 0.5, 1.0]);
        // Chain going diagonal from u=0.1 at row 0 to u=0.3 at row 1 (shift=0.2 >> 0.005)
        const chains: FeatureChain[] = [{
            points: [
                { u: 0.1, row: 0 },
                { u: 0.3, row: 1 },
            ],
        }];
        const result = insertChainGuidedRows(tPos, chains);
        expect(result.insertedCount).toBeGreaterThanOrEqual(1);
        expect(result.tPositions.length).toBeGreaterThan(3);
    });

    it('should not insert rows when U-shift is below threshold', () => {
        const tPos = new Float32Array([0, 0.5, 1.0]);
        // Chain with tiny U-shift (0.001 << 0.005)
        const chains: FeatureChain[] = [{
            points: [
                { u: 0.5, row: 0 },
                { u: 0.501, row: 1 },
            ],
        }];
        const result = insertChainGuidedRows(tPos, chains);
        expect(result.insertedCount).toBe(0);
    });

    it('should respect maxInsertions budget', () => {
        const tPos = new Float32Array(Array.from({ length: 50 }, (_, i) => i / 49));
        // Many diagonal chain segments
        const chains: FeatureChain[] = [{
            points: Array.from({ length: 49 }, (_, i) => ({
                u: (i * 0.02) % 1.0,
                row: i,
            })),
        }];
        const result = insertChainGuidedRows(tPos, chains, 5);
        expect(result.insertedCount).toBeLessThanOrEqual(5);
    });
});

// ============================================================================
// CHAIN_LINK_RADIUS constant
// ============================================================================

describe('CHAIN_LINK_RADIUS', () => {
    it('should be a positive number', () => {
        expect(CHAIN_LINK_RADIUS).toBeGreaterThan(0);
        expect(CHAIN_LINK_RADIUS).toBe(0.04);
    });
});

// ============================================================================
// Seam-crossing chain linking
// ============================================================================

describe('linkFeatureChainsCore — seam crossing', () => {
    it('links features across the U=0/1 seam boundary', () => {
        // Feature wraps from u~0.99 to u~0.01 across 5 rows
        const numRows = 5;
        const allRowFeatures: number[][] = [];
        for (let row = 0; row < numRows; row++) {
            // U wraps: 0.98, 0.99, 0.00, 0.01, 0.02
            const u = ((0.98 + row * 0.01) % 1.0 + 1.0) % 1.0;
            allRowFeatures.push([u]);
        }

        const chains = linkFeatureChainsCore(
            allRowFeatures, numRows, CHAIN_LINK_RADIUS, 6, 2.0
        );

        // Should produce ONE chain spanning the seam (not two broken chains)
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(numRows);
        // Should have points on both sides of the seam
        const hasHighU = chains[0].points.some(p => p.u > 0.9);
        const hasLowU = chains[0].points.some(p => p.u < 0.1);
        expect(hasHighU).toBe(true);
        expect(hasLowU).toBe(true);
    });

    it('links features with larger seam crossing gap within link radius', () => {
        // Feature jumps from u=0.97 to u=0.01 (gap of 0.04 = CHAIN_LINK_RADIUS)
        const numRows = 3;
        const allRowFeatures: number[][] = [
            [0.97],
            [0.99],
            [0.01],
        ];

        const chains = linkFeatureChainsCore(
            allRowFeatures, numRows, CHAIN_LINK_RADIUS, 6, 2.0
        );

        // Circular distance 0.99→0.01 = 0.02, well within radius
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(3);
    });

    it('does NOT link features too far apart even circularly', () => {
        // Features on opposite sides of the circle, far apart
        const numRows = 3;
        const allRowFeatures: number[][] = [
            [0.1],
            [0.6], // circular distance 0.5 — way beyond CHAIN_LINK_RADIUS
            [0.1],
        ];

        const chains = linkFeatureChainsCore(
            allRowFeatures, numRows, CHAIN_LINK_RADIUS, 6, 2.0
        );

        // Should be separate short chains or no chains (link radius is 0.04)
        for (const chain of chains) {
            // No single chain should contain both u=0.1 and u=0.6
            const hasLow = chain.points.some(p => Math.abs(p.u - 0.1) < 0.01);
            const hasHigh = chain.points.some(p => Math.abs(p.u - 0.6) < 0.01);
            expect(hasLow && hasHigh).toBe(false);
        }
    });
});

describe('linkFeatureChainsByKind — seam crossing', () => {
    it('handles seam-crossing chains with kind separation', () => {
        const numRows = 5;
        const allRowFeatures: number[][] = [];
        const allRowTypedFeatures: FeaturePoint[][] = [];

        for (let row = 0; row < numRows; row++) {
            const u = ((0.98 + row * 0.01) % 1.0 + 1.0) % 1.0;
            allRowFeatures.push([u]);
            allRowTypedFeatures.push([
                { u, kind: 'peak', radius: 1, prominence: 0.5, confidence: 0.9 },
            ]);
        }

        const chains = linkFeatureChainsByKind(
            allRowFeatures, allRowTypedFeatures, numRows
        );

        // Should have at least one chain spanning the seam
        expect(chains.length).toBeGreaterThanOrEqual(1);
        const seamChain = chains.find(c =>
            c.points.some(p => p.u > 0.9) && c.points.some(p => p.u < 0.1)
        );
        expect(seamChain).toBeDefined();
    });
});
