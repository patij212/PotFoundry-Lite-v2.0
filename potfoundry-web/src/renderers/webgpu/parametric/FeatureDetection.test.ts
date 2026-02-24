import { describe, it, expect } from 'vitest';
import {
    circularDistance,
    detectFeatureEdges,
    detectRowFeaturesV16,
    detectRowFeatures,
    detectAllRowFeatures,
    detectColumnFeaturesV16,
    detectColumnFeatures,
    detectAndMergeColumnFeatures,
} from './FeatureDetection';

// ============================================================================
// Helpers
// ============================================================================

/** Build a Gaussian curvature profile centered at `center` with given amplitude. */
function gaussianCurvature(n: number, center: number, amplitude: number, sigma: number = 5): Float32Array {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const d = i - center;
        c[i] = amplitude * Math.exp(-(d * d) / (2 * sigma * sigma));
    }
    return c;
}

/** Build positions for a sinusoidal cylinder: r = baseR + amp * sin(freq * theta) */
function sinusoidalPositions(n: number, baseR: number, amp: number, freq: number): Float32Array {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const theta = (i / n) * 2 * Math.PI;
        const r = baseR + amp * Math.sin(freq * theta);
        pos[i * 3] = r * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(theta);
        pos[i * 3 + 2] = 0;
    }
    return pos;
}

// ============================================================================
// circularDistance
// ============================================================================

describe('circularDistance', () => {
    it('returns 0 for same position', () => {
        expect(circularDistance(0.3, 0.3)).toBe(0);
    });

    it('returns correct value for small gap', () => {
        expect(circularDistance(0.1, 0.3)).toBeCloseTo(0.2);
    });

    it('wraps around [0,1) boundary', () => {
        expect(circularDistance(0.9, 0.1)).toBeCloseTo(0.2);
    });
});

// ============================================================================
// detectFeatureEdges
// ============================================================================

describe('detectFeatureEdges', () => {
    it('returns empty for flat curvature', () => {
        const n = 100;
        const curvature = new Float32Array(n).fill(0.5);
        expect(detectFeatureEdges(curvature, n)).toEqual([]);
    });

    it('returns empty for short input (<5 samples)', () => {
        expect(detectFeatureEdges(new Float32Array([1, 2, 3, 4]), 4)).toEqual([]);
        expect(detectFeatureEdges(new Float32Array([1, 2, 3]), 3)).toEqual([]);
        expect(detectFeatureEdges(new Float32Array([]), 0)).toEqual([]);
    });

    it('detects a single prominent Gaussian peak', () => {
        const n = 100;
        const curvature = gaussianCurvature(n, 50, 1.0, 5);
        const features = detectFeatureEdges(curvature, n);
        expect(features.length).toBeGreaterThanOrEqual(1);
        // Peak should be near 0.50
        const nearCenter = features.some(f => f >= 0.45 && f <= 0.55);
        expect(nearCenter).toBe(true);
    });

    it('detects multiple well-separated peaks', () => {
        const n = 200;
        const c1 = gaussianCurvature(n, 50, 1.0, 5);
        const c2 = gaussianCurvature(n, 150, 1.0, 5);
        const curvature = new Float32Array(n);
        for (let i = 0; i < n; i++) curvature[i] = c1[i] + c2[i];

        const features = detectFeatureEdges(curvature, n);
        expect(features.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores low-prominence bumps', () => {
        const n = 200;
        // Main peak at 50 with amplitude 1.0
        const main = gaussianCurvature(n, 50, 1.0, 5);
        // Tiny bump at 120 with amplitude 0.01 (below 8% threshold)
        const tiny = gaussianCurvature(n, 120, 0.01, 5);
        const curvature = new Float32Array(n);
        for (let i = 0; i < n; i++) curvature[i] = main[i] + tiny[i];

        const features = detectFeatureEdges(curvature, n);
        // Should detect the main peak
        expect(features.length).toBeGreaterThanOrEqual(1);
        // No feature should be near the tiny bump (0.55-0.65)
        const nearTiny = features.some(f => f >= 0.55 && f <= 0.65);
        expect(nearTiny).toBe(false);
    });
});

// ============================================================================
// detectRowFeaturesV16
// ============================================================================

describe('detectRowFeaturesV16', () => {
    it('returns empty for too-few samples', () => {
        const pos = new Float32Array(6 * 3); // 6 samples, but < 7 threshold
        const result = detectRowFeaturesV16(pos, 6);
        expect(result.features).toEqual([]);
        expect(result.uPositions).toEqual([]);
    });

    it('detects peaks and valleys on sinusoidal cylinder', () => {
        const n = 512;
        const freq = 6; // 6 ridges
        const positions = sinusoidalPositions(n, 20, 2, freq);
        const result = detectRowFeaturesV16(positions, n, 0.001);

        // Should detect 6 peaks and 6 valleys = 12 features
        expect(result.features.length).toBeGreaterThanOrEqual(6);
        const peaks = result.features.filter(f => f.kind === 'peak');
        const valleys = result.features.filter(f => f.kind === 'valley');
        expect(peaks.length).toBeGreaterThanOrEqual(3);
        expect(valleys.length).toBeGreaterThanOrEqual(3);
    });

    it('classifies features with confidence > 0', () => {
        const n = 256;
        const positions = sinusoidalPositions(n, 20, 2, 4);
        const result = detectRowFeaturesV16(positions, n, 0.001);
        for (const f of result.features) {
            expect(f.confidence).toBeGreaterThan(0);
            expect(f.prominence).toBeGreaterThan(0);
            expect(['peak', 'valley']).toContain(f.kind);
        }
    });
});

// ============================================================================
// detectRowFeatures (wrapper)
// ============================================================================

describe('detectRowFeatures', () => {
    it('returns number[] of U positions', () => {
        const n = 256;
        const positions = sinusoidalPositions(n, 20, 2, 4);
        const result = detectRowFeatures(positions, n, 0.001);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        for (const u of result) {
            expect(typeof u).toBe('number');
            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(1);
        }
    });
});

// ============================================================================
// detectAllRowFeatures
// ============================================================================

describe('detectAllRowFeatures', () => {
    it('processes multiple rows', () => {
        const n = 256;
        const row1 = sinusoidalPositions(n, 20, 2, 4);
        const row2 = sinusoidalPositions(n, 20, 1.5, 4);
        const result = detectAllRowFeatures([row1, row2], n);
        expect(result.allRowFeatures.length).toBe(2);
        expect(result.allRowTypedFeatures.length).toBe(2);
        expect(result.allRowFeatures[0].length).toBeGreaterThan(0);
    });

    it('handles short row data gracefully', () => {
        const n = 256;
        const shortRow = new Float32Array(10); // way too short
        const result = detectAllRowFeatures([shortRow], n);
        expect(result.allRowFeatures[0]).toEqual([]);
    });
});

// ============================================================================
// detectColumnFeaturesV16
// ============================================================================

describe('detectColumnFeaturesV16', () => {
    it('returns empty for too-few samples', () => {
        const result = detectColumnFeaturesV16(
            new Float32Array([1, 2, 3, 4]),
            4,
            [0, 0.33, 0.67, 1.0]
        );
        expect(result.features).toEqual([]);
    });

    it('detects features in sinusoidal T-profile', () => {
        const n = 64;
        const radii = new Float32Array(n);
        const tPos = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            tPos[i] = t;
            radii[i] = 20 + 2 * Math.sin(4 * Math.PI * t);
        }
        const result = detectColumnFeaturesV16(radii, n, tPos, 0.001);
        expect(result.features.length).toBeGreaterThan(0);
        // T positions should be within [0, 1]
        for (const t of result.tPositions) {
            expect(t).toBeGreaterThanOrEqual(0);
            expect(t).toBeLessThanOrEqual(1);
        }
    });
});

// ============================================================================
// detectColumnFeatures (wrapper)
// ============================================================================

describe('detectColumnFeatures', () => {
    it('returns number[] of T positions', () => {
        const n = 64;
        const radii = new Float32Array(n);
        const tPos = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            tPos[i] = t;
            radii[i] = 20 + 2 * Math.sin(4 * Math.PI * t);
        }
        const result = detectColumnFeatures(radii, n, tPos, 0.001);
        expect(Array.isArray(result)).toBe(true);
        for (const t of result) {
            expect(typeof t).toBe('number');
        }
    });
});

// ============================================================================
// detectAndMergeColumnFeatures
// ============================================================================

describe('detectAndMergeColumnFeatures', () => {
    it('returns early for insufficient data', () => {
        const result = detectAndMergeColumnFeatures([], 0, new Float32Array(), 0, [], []);
        expect(result.addedCount).toBe(0);
        expect(result.rejectedCount).toBe(0);
    });

    it('returns early for too-few rows', () => {
        const result = detectAndMergeColumnFeatures(
            [new Float32Array(100), new Float32Array(100)],
            32,
            new Float32Array([0, 1]),
            4,
            [[], []],
            [[], []]
        );
        expect(result.addedCount).toBe(0);
    });
});
