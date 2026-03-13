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
    computeChainDiagnostics,
    postProcessFeatureChains,
    linkFeatureChainsCore,
    linkFeatureChains,
    linkFeatureChainsByKind,
    insertChainGuidedRows,
    whittakerSmooth,
    blendTowardSmoothedChain,
    repairChainsZigzags,
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
// computeChainDiagnostics
// ============================================================================

describe('computeChainDiagnostics', () => {
    it('should compute zero deviation for a straight chain', () => {
        const chain: FeatureChain = {
            points: Array.from({ length: 10 }, (_, i) => ({ u: 0.1 + i * 0.01, row: i })),
        };
        const diag = computeChainDiagnostics([chain], []);
        expect(diag.perChain).toHaveLength(1);
        expect(diag.perChain[0].maxLinearDeviation).toBeCloseTo(0, 8);
        expect(diag.perChain[0].maxConsecutiveDelta).toBeCloseTo(0.01, 8);
    });

    it('should detect zigzag deviation', () => {
        const chain: FeatureChain = {
            points: [
                { u: 0.10, row: 0 },
                { u: 0.12, row: 1 },
                { u: 0.08, row: 2 },  // zigzag
                { u: 0.12, row: 3 },
                { u: 0.10, row: 4 },
            ],
        };
        const diag = computeChainDiagnostics([chain], []);
        expect(diag.perChain[0].maxLinearDeviation).toBeGreaterThan(0.01);
    });

    it('should compute min same-kind spacing', () => {
        const allRowFeatures = [[0.1, 0.2, 0.8]]; // spacing: 0.1, 0.6, 0.3(wrap)
        const diag = computeChainDiagnostics([], allRowFeatures);
        expect(diag.minSameKindSpacing).toBeCloseTo(0.1, 8);
    });
});

// ============================================================================
// postProcessFeatureChains
// ============================================================================

describe('postProcessFeatureChains', () => {
    it('should return empty array for empty input', () => {
        expect(postProcessFeatureChains([])).toEqual([]);
    });

    it('should deduplicate chains', () => {
        // Two near-duplicate chains
        const chain1: FeatureChain = {
            points: Array.from({ length: 40 }, (_, i) => ({ u: 0.301, row: i })),
        };
        const chain2: FeatureChain = {
            points: Array.from({ length: 40 }, (_, i) => ({ u: 0.3005, row: i })),
        };
        const result = postProcessFeatureChains([chain1, chain2]);
        // Should deduplicate to 1 chain
        expect(result).toHaveLength(1);
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
        expect(CHAIN_LINK_RADIUS).toBe(0.02);
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
        // Feature wraps across seam with steps within CHAIN_LINK_RADIUS (0.02)
        const numRows = 3;
        const allRowFeatures: number[][] = [
            [0.98],
            [0.995],
            [0.01],
        ];

        const chains = linkFeatureChainsCore(
            allRowFeatures, numRows, CHAIN_LINK_RADIUS, 6, 2.0
        );

        // Circular distance 0.995→0.01 = 0.015, well within radius
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

        // Should be separate short chains or no chains (features are 0.5 apart)
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

// ============================================================================
// whittakerSmooth
// ============================================================================

describe('whittakerSmooth', () => {
    it('preserves a linear chain exactly', () => {
        const n = 20;
        const points = Array.from({ length: n }, (_, i) => ({
            row: i,
            u: 0.1 + i * 0.01,
        }));
        const chain: FeatureChain = { points };
        const smoothed = whittakerSmooth(chain);
        for (let i = 0; i < n; i++) {
            expect(smoothed.points[i].u).toBeCloseTo(points[i].u, 10);
        }
    });

    it('preserves a constant chain exactly', () => {
        const n = 20;
        const points = Array.from({ length: n }, (_, i) => ({
            row: i,
            u: 0.5,
        }));
        const chain: FeatureChain = { points };
        const smoothed = whittakerSmooth(chain);
        for (let i = 0; i < n; i++) {
            expect(smoothed.points[i].u).toBeCloseTo(0.5, 10);
        }
    });

    it('attenuates a sinusoidal perturbation', () => {
        const n = 40;
        const period = 10;
        const amplitude = 0.01;
        const points = Array.from({ length: n }, (_, i) => ({
            row: i,
            u: 0.5 + amplitude * Math.sin((2 * Math.PI * i) / period),
        }));
        const chain: FeatureChain = { points };
        const smoothed = whittakerSmooth(chain, 50);

        // Measure output amplitude in the interior (avoid boundaries)
        let maxDev = 0;
        for (let i = 10; i < n - 10; i++) {
            maxDev = Math.max(maxDev, Math.abs(smoothed.points[i].u - 0.5));
        }

        // At λ=50, period=10, expected attenuation factor ≈ 0.121
        // Allow some tolerance for boundary effects
        const ratio = maxDev / amplitude;
        expect(ratio).toBeLessThan(0.25);
        expect(ratio).toBeGreaterThan(0.02);
    });

    it('handles short chains (n < 3) without crashing', () => {
        const chain3: FeatureChain = {
            points: [{ row: 0, u: 0.1 }, { row: 1, u: 0.2 }, { row: 2, u: 0.3 }],
        };
        // n=3 is minimum for smoothing; should not crash
        const result3 = whittakerSmooth(chain3);
        expect(result3.points).toHaveLength(3);

        const chain2: FeatureChain = {
            points: [{ row: 0, u: 0.1 }, { row: 1, u: 0.2 }],
        };
        // n=2 → returned unchanged
        const result2 = whittakerSmooth(chain2);
        expect(result2.points).toHaveLength(2);
        expect(result2.points[0].u).toBe(0.1);

        const chain1: FeatureChain = { points: [{ row: 0, u: 0.5 }] };
        const result1 = whittakerSmooth(chain1);
        expect(result1.points).toHaveLength(1);
    });

    it('produces valid [0,1) output for seam-crossing chains', () => {
        const n = 20;
        // Chain crosses from u≈0.98 upward past the seam
        const points = Array.from({ length: n }, (_, i) => ({
            row: i,
            u: ((0.98 + i * 0.005) % 1.0 + 1.0) % 1.0,
        }));
        const chain: FeatureChain = { points };
        const smoothed = whittakerSmooth(chain);

        for (let i = 0; i < n; i++) {
            expect(smoothed.points[i].u).toBeGreaterThanOrEqual(0);
            expect(smoothed.points[i].u).toBeLessThan(1);
        }

        // Check no wild jumps (no cross-pot artifacts)
        for (let i = 1; i < n; i++) {
            const du = Math.abs(smoothed.points[i].u - smoothed.points[i - 1].u);
            const circDu = du > 0.5 ? 1 - du : du;
            expect(circDu).toBeLessThan(0.05);
        }
    });
});

// ============================================================================
// blendTowardSmoothedChain
// ============================================================================

describe('blendTowardSmoothedChain', () => {
    it('preserves an identical chain exactly', () => {
        const chain: FeatureChain = {
            points: Array.from({ length: 6 }, (_, i) => ({ row: i, u: 0.2 + i * 0.01 })),
        };

        const blended = blendTowardSmoothedChain(chain, chain);

        expect(blended.points).toHaveLength(chain.points.length);
        for (let i = 0; i < chain.points.length; i++) {
            expect(blended.points[i].row).toBe(chain.points[i].row);
            expect(blended.points[i].u).toBeCloseTo(chain.points[i].u, 10);
        }
    });

    it('caps seam-safe displacement per point', () => {
        const raw: FeatureChain = {
            points: [
                { row: 0, u: 0.98 },
                { row: 1, u: 0.99 },
                { row: 2, u: 0.00 },
                { row: 3, u: 0.01 },
            ],
        };
        const smoothed: FeatureChain = {
            points: [
                { row: 0, u: 0.995 },
                { row: 1, u: 0.005 },
                { row: 2, u: 0.015 },
                { row: 3, u: 0.025 },
            ],
        };

        const blended = blendTowardSmoothedChain(raw, smoothed, 1.0, 0.0015);

        for (let i = 0; i < raw.points.length; i++) {
            expect(blended.points[i].u).toBeGreaterThanOrEqual(0);
            expect(blended.points[i].u).toBeLessThan(1);
            expect(Math.abs(circularSignedDelta(raw.points[i].u, blended.points[i].u))).toBeLessThanOrEqual(0.0015 + 1e-9);
        }

        for (let i = 1; i < blended.points.length; i++) {
            expect(Math.abs(circularSignedDelta(blended.points[i - 1].u, blended.points[i].u))).toBeLessThan(0.05);
        }
    });

    it('moves a jagged interior point harder than smoother neighbors', () => {
        const raw: FeatureChain = {
            points: [
                { row: 0, u: 0.20 },
                { row: 1, u: 0.21 },
                { row: 2, u: 0.24 },
                { row: 3, u: 0.215 },
                { row: 4, u: 0.22 },
            ],
        };
        const smoothed: FeatureChain = {
            points: [
                { row: 0, u: 0.20 },
                    { row: 1, u: 0.2085 },
                { row: 2, u: 0.214 },
                    { row: 3, u: 0.217 },
                { row: 4, u: 0.22 },
            ],
        };

        const blended = blendTowardSmoothedChain(raw, smoothed);
        const centerShift = Math.abs(circularSignedDelta(raw.points[2].u, blended.points[2].u));
        const neighborShift = Math.abs(circularSignedDelta(raw.points[1].u, blended.points[1].u));

        expect(centerShift).toBeGreaterThan(0.002);
        expect(centerShift).toBeGreaterThan(neighborShift);
        expect(centerShift).toBeLessThanOrEqual(0.005 + 1e-9);  // R42: MAX_POINT_SHIFT raised to 0.005
    });
});

// ============================================================================
// repairChainsZigzags
// ============================================================================

describe('repairChainsZigzags', () => {
    it('repairs a known zigzag pattern', () => {
        // Chain at u=0.50 with one point swapped to u=0.53 (zigzag)
        const chain: FeatureChain = {
            points: [
                { row: 0, u: 0.50 },
                { row: 1, u: 0.50 },
                { row: 2, u: 0.50 },
                { row: 3, u: 0.53 },  // zigzag: should be ~0.50
                { row: 4, u: 0.50 },
                { row: 5, u: 0.50 },
            ],
        };

        // allRowFeatures: every row has features at 0.50 and 0.53
        const allRowFeatures: number[][] = Array.from({ length: 6 }, () => [0.50, 0.53]);

        const repaired = repairChainsZigzags([chain], allRowFeatures, undefined, 0.003);
        expect(repaired).toHaveLength(1);
        // The zigzag point at row 3 should be repaired back to 0.50
        expect(repaired[0].points[3].u).toBeCloseTo(0.50, 4);
    });

    it('converges within maxPasses', () => {
        // Two adjacent zigzags
        const chain: FeatureChain = {
            points: [
                { row: 0, u: 0.30 },
                { row: 1, u: 0.30 },
                { row: 2, u: 0.34 },  // zigzag
                { row: 3, u: 0.30 },
                { row: 4, u: 0.34 },  // zigzag
                { row: 5, u: 0.30 },
                { row: 6, u: 0.30 },
            ],
        };
        const allRowFeatures: number[][] = Array.from({ length: 7 }, () => [0.30, 0.34]);

        const repaired = repairChainsZigzags([chain], allRowFeatures, undefined, 0.003, 3);
        // Both zigzag points should converge to 0.30
        expect(repaired[0].points[2].u).toBeCloseTo(0.30, 4);
        expect(repaired[0].points[4].u).toBeCloseTo(0.30, 4);
    });

    it('is a no-op for smooth chains', () => {
        // Perfectly smooth chain: linear progression
        const chain: FeatureChain = {
            points: Array.from({ length: 10 }, (_, i) => ({
                row: i,
                u: 0.10 + i * 0.005,
            })),
        };
        const allRowFeatures: number[][] = chain.points.map(p => [p.u]);

        const repaired = repairChainsZigzags([chain], allRowFeatures, undefined, 0.003);
        // All points should remain unchanged
        for (let i = 0; i < chain.points.length; i++) {
            expect(repaired[0].points[i].u).toBeCloseTo(chain.points[i].u, 10);
        }
    });

    it('handles seam-crossing zigzag', () => {
        // Chain crossing the 0/1 seam with a zigzag
        const chain: FeatureChain = {
            points: [
                { row: 0, u: 0.98 },
                { row: 1, u: 0.99 },
                { row: 2, u: 0.95 },  // zigzag: should be ~0.00
                { row: 3, u: 0.01 },
                { row: 4, u: 0.02 },
            ],
        };
        // Features at both the "correct" seam-crossing position and the zigzag position
        const allRowFeatures: number[][] = [
            [0.98],
            [0.99],
            [0.95, 0.00],  // 0.00 is the correct position near seam
            [0.01],
            [0.02],
        ];

        const repaired = repairChainsZigzags([chain], allRowFeatures, undefined, 0.003);
        // The zigzag at row 2 should be repaired to 0.00 (closer to predicted seam crossing)
        expect(repaired[0].points[2].u).toBeCloseTo(0.00, 4);
    });
});

// ============================================================================
// Non-crossing DP matching (v25)
// ============================================================================

describe('linkFeatureChainsCore — non-crossing DP matching', () => {
    it('does not produce zigzag when close features alternate positions', () => {
        // Two vertical features at U≈0.170 and U≈0.172, alternating positions:
        // Even rows: [0.170, 0.172], Odd rows: [0.169, 0.173].
        // The greedy algorithm could swap chain assignments causing zigzag.
        // The non-crossing DP ensures chains maintain left/right ordering.
        const numRows = 10;
        const allRowFeatures: number[][] = [];
        for (let r = 0; r < numRows; r++) {
            if (r % 2 === 0) {
                allRowFeatures.push([0.170, 0.172]);
            } else {
                allRowFeatures.push([0.169, 0.173]);
            }
        }

        const chains = linkFeatureChainsCore(allRowFeatures, numRows, CHAIN_LINK_RADIUS, 6, 1.5);
        // Both features should form chains — check no zigzag
        for (const chain of chains) {
            if (chain.points.length < 3) continue;
            const u = unwrapChain(chain);
            for (let i = 1; i < u.length - 1; i++) {
                const accel = Math.abs(u[i - 1] - 2 * u[i] + u[i + 1]);
                // Feature drift per row is ~0.001-0.003; accel should be tiny
                expect(accel).toBeLessThan(0.005);
            }
        }
    });

    it('handles non-crossing across circular seam (U=0.99 and U=0.01)', () => {
        // Two chains near the seam: one at U≈0.99, one at U≈0.01.
        // Features drift slowly: 0.99+r*0.001 and 0.01+r*0.001.
        const numRows = 10;
        const allRowFeatures: number[][] = [];
        for (let r = 0; r < numRows; r++) {
            const u1 = ((0.99 + r * 0.001) % 1 + 1) % 1;
            const u2 = ((0.01 + r * 0.001) % 1 + 1) % 1;
            allRowFeatures.push([u1, u2]);
        }

        const chains = linkFeatureChainsCore(allRowFeatures, numRows, CHAIN_LINK_RADIUS, 6, 1.5);
        // Should produce two non-crossing chains
        expect(chains.length).toBe(2);
        for (const chain of chains) {
            expect(chain.points.length).toBe(numRows);
        }
        // Verify no zigzag in either chain
        for (const chain of chains) {
            const u = unwrapChain(chain);
            for (let i = 1; i < u.length - 1; i++) {
                const accel = Math.abs(u[i - 1] - 2 * u[i] + u[i + 1]);
                expect(accel).toBeLessThan(0.005);
            }
        }
    });

    it('starts new chains for unmatched features when K < M', () => {
        // 2 features in rows 0-4, then 4 features appear from row 5 onward
        const numRows = 10;
        const allRowFeatures: number[][] = [];
        for (let r = 0; r < numRows; r++) {
            if (r < 5) {
                allRowFeatures.push([0.1, 0.5]);
            } else {
                allRowFeatures.push([0.1, 0.3, 0.5, 0.7]);
            }
        }

        const chains = linkFeatureChainsCore(allRowFeatures, numRows, CHAIN_LINK_RADIUS, 6, 1.5);

        // Should have at least 4 chains (2 original + 2 new from unmatched features)
        expect(chains.length).toBeGreaterThanOrEqual(4);
        // The two original chains should span all 10 rows
        const longChains = chains.filter(c => c.points.length >= 8);
        expect(longChains.length).toBe(2);
        // The two new chains should span rows 5-9 (5 points each)
        const shortChains = chains.filter(c => c.points.length >= 4 && c.points.length <= 6);
        expect(shortChains.length).toBe(2);
    });
});
