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
    detectTDirectionFeatures,
    computeTaperProfile,
    filterByColumnConsensus,
    crossValidateAndMergeColumnFeatures,
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

// ============================================================================
// detectTDirectionFeatures (v17.0 GPU column probing)
// ============================================================================

/** Build 3D positions for a T-column with sinusoidal radius variation. */
function sinusoidalTColumnPositions(
    n: number, baseR: number, amp: number, freq: number, theta: number = 0
): Float32Array {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = baseR + amp * Math.sin(freq * Math.PI * t);
        pos[i * 3] = r * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(theta);
        pos[i * 3 + 2] = t * 100; // height in mm
    }
    return pos;
}

describe('detectTDirectionFeatures', () => {
    it('returns empty for too-few samples', () => {
        const pos = new Float32Array(6 * 3);
        const result = detectTDirectionFeatures(pos, 6);
        expect(result.features).toEqual([]);
    });

    it('detects peaks and valleys on sinusoidal T-profile', () => {
        const n = 4096;
        const freq = 4; // 4 half-periods = 2 full periods → 2 peaks + 2 valleys
        const positions = sinusoidalTColumnPositions(n, 20, 2, freq);
        const result = detectTDirectionFeatures(positions, n, null, 0.001);

        expect(result.features.length).toBeGreaterThanOrEqual(2);
        const peaks = result.features.filter(f => f.kind === 'peak');
        const valleys = result.features.filter(f => f.kind === 'valley');
        expect(peaks.length).toBeGreaterThanOrEqual(1);
        expect(valleys.length).toBeGreaterThanOrEqual(1);
    });

    it('returns features with explicit .t field in [0, 1]', () => {
        const n = 1024;
        const positions = sinusoidalTColumnPositions(n, 20, 2, 6);
        const result = detectTDirectionFeatures(positions, n, null, 0.001);

        for (const f of result.features) {
            expect(f.t).toBeGreaterThanOrEqual(0);
            expect(f.t).toBeLessThanOrEqual(1);
            expect(f.confidence).toBeGreaterThan(0);
            expect(f.prominence).toBeGreaterThan(0);
            expect(['peak', 'valley']).toContain(f.kind);
        }
    });

    it('classifies peaks and valleys correctly on known profile', () => {
        const n = 4096;
        // 3 full periods: r = 20 + 2*sin(6π*t) → 3 peaks + 3 valleys
        const positions = sinusoidalTColumnPositions(n, 20, 2, 6);
        const result = detectTDirectionFeatures(positions, n, null, 0.001);

        // Should find peaks
        const peaks = result.features.filter(f => f.kind === 'peak');
        expect(peaks.length).toBeGreaterThanOrEqual(1);
        // And valleys
        const valleys = result.features.filter(f => f.kind === 'valley');
        expect(valleys.length).toBeGreaterThanOrEqual(1);
        // All features in valid T range
        for (const f of result.features) {
            expect(f.t).toBeGreaterThanOrEqual(0);
            expect(f.t).toBeLessThanOrEqual(1);
        }
    });

    it('rejects noise below prominence threshold', () => {
        const n = 1024;
        // Tiny bumps: amp = 0.001 mm, prominence threshold = 0.003
        const positions = sinusoidalTColumnPositions(n, 20, 0.001, 8);
        const result = detectTDirectionFeatures(positions, n, null, 0.003);
        expect(result.features.length).toBe(0);
        expect(result.rejected).toBeGreaterThan(0);
    });

    it('handles high-frequency T-features (40× resolution)', () => {
        const n = 4096;
        // 10 full periods in [0,1] → 10 peaks + 10 valleys = 20 features
        const positions = sinusoidalTColumnPositions(n, 20, 1.5, 20);
        const result = detectTDirectionFeatures(positions, n, null, 0.001);

        // With 4096 samples and 10 periods, should detect most features
        expect(result.features.length).toBeGreaterThanOrEqual(10);
    });
});

// ============================================================================
// crossValidateAndMergeColumnFeatures (v17.0)
// ============================================================================

describe('crossValidateAndMergeColumnFeatures', () => {
    it('returns early for insufficient data', () => {
        const result = crossValidateAndMergeColumnFeatures([], [], [], 0, new Float32Array(), [], []);
        expect(result.addedCount).toBe(0);
        expect(result.rejectedCount).toBe(0);
    });

    it('returns early for too-few rows', () => {
        const result = crossValidateAndMergeColumnFeatures(
            [[]],
            [0.5],
            [new Float32Array(100)],
            32,
            new Float32Array([0.5]),
            [[]],
            [[]]
        );
        expect(result.addedCount).toBe(0);
    });

    it('rejects column features when no matching row peak exists', () => {
        const n = 256;
        const numRows = 10;
        // Flat rows: no U-direction features at all
        const rowProbeData: Float32Array[] = [];
        const tPositions = new Float32Array(numRows);
        const allRowFeatures: number[][] = [];
        const allRowTypedFeatures: import('./types').FeaturePoint[][] = [];
        for (let j = 0; j < numRows; j++) {
            tPositions[j] = j / (numRows - 1);
            const row = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const theta = (i / n) * 2 * Math.PI;
                // Flat cylinder: r = 20mm, no variation
                row[i * 3] = 20 * Math.cos(theta);
                row[i * 3 + 1] = 20 * Math.sin(theta);
                row[i * 3 + 2] = tPositions[j] * 100;
            }
            rowProbeData.push(row);
            allRowFeatures.push([]);
            allRowTypedFeatures.push([]);
        }

        // Fabricate a column feature (should be rejected since rows are flat)
        const columnFeatures = [[{ t: 0.5, kind: 'peak' as const, radius: 20, prominence: 1, confidence: 0.8 }]];
        const columnUPositions = [0.25];

        const result = crossValidateAndMergeColumnFeatures(
            columnFeatures, columnUPositions, rowProbeData, n,
            tPositions, allRowFeatures, allRowTypedFeatures
        );

        expect(result.rejectedCount).toBe(1);
        expect(result.addedCount).toBe(0);
    });

    it('accepts column features when matching row peak exists', () => {
        const n = 8192;
        const numRows = 10;
        const freq = 6;
        // Rows with sinusoidal features: r = 20 + 2*sin(6θ)
        const rowProbeData: Float32Array[] = [];
        const tPositions = new Float32Array(numRows);
        const allRowFeatures: number[][] = [];
        const allRowTypedFeatures: import('./types').FeaturePoint[][] = [];
        for (let j = 0; j < numRows; j++) {
            tPositions[j] = j / (numRows - 1);
            const row = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const theta = (i / n) * 2 * Math.PI;
                const r = 20 + 2 * Math.sin(freq * theta);
                row[i * 3] = r * Math.cos(theta);
                row[i * 3 + 1] = r * Math.sin(theta);
                row[i * 3 + 2] = tPositions[j] * 100;
            }
            rowProbeData.push(row);
            allRowFeatures.push([]);
            allRowTypedFeatures.push([]);
        }

        // Column feature near a known peak U position (first peak of sin(6θ) at θ = π/12 → u ≈ 0.0417)
        const peakU = 1 / (4 * freq);
        const columnFeatures = [[{ t: 0.5, kind: 'peak' as const, radius: 22, prominence: 2, confidence: 0.9 }]];
        const columnUPositions = [peakU];

        const result = crossValidateAndMergeColumnFeatures(
            columnFeatures, columnUPositions, rowProbeData, n,
            tPositions, allRowFeatures, allRowTypedFeatures
        );

        expect(result.addedCount).toBe(1);
        // The merged feature should appear in the closest row's feature list (row 4, t=0.444)
        const anyRowHasFeature = allRowFeatures.some(row => row.length > 0);
        expect(anyRowHasFeature).toBe(true);
    });

    it('rejects column features when kind does not match row extremum', () => {
        const n = 8192;
        const numRows = 10;
        const freq = 6;
        const rowProbeData: Float32Array[] = [];
        const tPositions = new Float32Array(numRows);
        const allRowFeatures: number[][] = [];
        const allRowTypedFeatures: import('./types').FeaturePoint[][] = [];
        for (let j = 0; j < numRows; j++) {
            tPositions[j] = j / (numRows - 1);
            const row = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const theta = (i / n) * 2 * Math.PI;
                const r = 20 + 2 * Math.sin(freq * theta);
                row[i * 3] = r * Math.cos(theta);
                row[i * 3 + 1] = r * Math.sin(theta);
                row[i * 3 + 2] = tPositions[j] * 100;
            }
            rowProbeData.push(row);
            allRowFeatures.push([]);
            allRowTypedFeatures.push([]);
        }

        // Column claims 'valley' at a U position where rows have a PEAK
        const peakU = 1 / (4 * freq);
        const columnFeatures = [[{ t: 0.5, kind: 'valley' as const, radius: 18, prominence: 2, confidence: 0.9 }]];
        const columnUPositions = [peakU];

        const result = crossValidateAndMergeColumnFeatures(
            columnFeatures, columnUPositions, rowProbeData, n,
            tPositions, allRowFeatures, allRowTypedFeatures
        );

        expect(result.rejectedCount).toBe(1);
        expect(result.addedCount).toBe(0);
    });
});

// ============================================================================
// computeTaperProfile (v17.1)
// ============================================================================

describe('computeTaperProfile', () => {
    it('computes mean radius across columns at each T position', () => {
        const numCols = 4;
        const numT = 100;
        const positions = new Float32Array(numCols * numT * 3);
        for (let c = 0; c < numCols; c++) {
            const theta = (c / numCols) * 2 * Math.PI;
            for (let i = 0; i < numT; i++) {
                const idx = (c * numT + i) * 3;
                positions[idx] = 20 * Math.cos(theta);
                positions[idx + 1] = 20 * Math.sin(theta);
                positions[idx + 2] = (i / (numT - 1)) * 100;
            }
        }

        const profile = computeTaperProfile(positions, numCols, numT, 0);
        for (let i = 0; i < numT; i++) {
            expect(profile[i]).toBeCloseTo(20, 1);
        }
    });

    it('averages out style modulation across columns', () => {
        const numCols = 64;
        const numT = 256;
        const baseR = 20;
        const positions = new Float32Array(numCols * numT * 3);
        for (let c = 0; c < numCols; c++) {
            const theta = (c / numCols) * 2 * Math.PI;
            const styleAmp = 2 * Math.sin(6 * theta);
            for (let i = 0; i < numT; i++) {
                const t = i / (numT - 1);
                const r = baseR + styleAmp * 0.1;
                const idx = (c * numT + i) * 3;
                positions[idx] = r * Math.cos(theta);
                positions[idx + 1] = r * Math.sin(theta);
                positions[idx + 2] = t * 100;
            }
        }

        const profile = computeTaperProfile(positions, numCols, numT, 0);
        for (let i = 0; i < numT; i++) {
            expect(Math.abs(profile[i] - baseR)).toBeLessThan(0.5);
        }
    });

    it('captures taper shape when radius varies with T', () => {
        const numCols = 32;
        const numT = 200;
        const positions = new Float32Array(numCols * numT * 3);
        for (let c = 0; c < numCols; c++) {
            const theta = (c / numCols) * 2 * Math.PI;
            for (let i = 0; i < numT; i++) {
                const t = i / (numT - 1);
                const r = 10 + 20 * t;
                const idx = (c * numT + i) * 3;
                positions[idx] = r * Math.cos(theta);
                positions[idx + 1] = r * Math.sin(theta);
                positions[idx + 2] = t * 100;
            }
        }

        const profile = computeTaperProfile(positions, numCols, numT, 0);
        expect(profile[0]).toBeCloseTo(10, 0);
        expect(profile[numT - 1]).toBeCloseTo(30, 0);
        const mid = Math.floor(numT / 2);
        expect(profile[mid]).toBeCloseTo(20, 0);
    });
});

// ============================================================================
// detectTDirectionFeatures with taper subtraction (v17.1)
// ============================================================================

describe('detectTDirectionFeatures with taper', () => {
    it('rejects taper-induced peaks when taper profile is provided', () => {
        const n = 4096;
        const positions = new Float32Array(n * 3);
        const taperProfile = new Float32Array(n);
        // Taper with a bump: radius = 20 + 3*sin(2πt) → peak at t≈0.25, valley at t≈0.75
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const r = 20 + 3 * Math.sin(2 * Math.PI * t);
            const theta = 0.5;
            positions[i * 3] = r * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(theta);
            positions[i * 3 + 2] = t * 100;
            taperProfile[i] = r;
        }

        // With taper subtraction: deviation is ~0 → no features
        const withTaper = detectTDirectionFeatures(positions, n, taperProfile, 0.001);
        expect(withTaper.features.length).toBe(0);

        // Without taper subtraction: should detect peak/valley from the taper sinusoid
        const withoutTaper = detectTDirectionFeatures(positions, n, null, 0.001);
        expect(withoutTaper.features.length).toBeGreaterThanOrEqual(1);
    });

    it('detects real style features after taper subtraction', () => {
        const n = 4096;
        const positions = new Float32Array(n * 3);
        const taperProfile = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const rBase = 15 + 10 * t;
            const styleBump = 3 * Math.exp(-((t - 0.5) ** 2) / (2 * 0.01 ** 2));
            const r = rBase + styleBump;
            const theta = 0.5;
            positions[i * 3] = r * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(theta);
            positions[i * 3 + 2] = t * 100;
            taperProfile[i] = rBase;
        }

        const result = detectTDirectionFeatures(positions, n, taperProfile, 0.001);
        const peaks = result.features.filter(f => f.kind === 'peak');
        expect(peaks.length).toBeGreaterThanOrEqual(1);
        const nearCenter = peaks.filter(p => Math.abs(p.t - 0.5) < 0.05);
        expect(nearCenter.length).toBeGreaterThanOrEqual(1);
    });
});

// ============================================================================
// filterByColumnConsensus (v17.1)
// ============================================================================

describe('filterByColumnConsensus', () => {
    it('passes through empty features', () => {
        const result = filterByColumnConsensus([], 128, 4096);
        expect(result.filtered).toEqual([]);
        expect(result.globalRejected).toBe(0);
    });

    it('rejects features detected by >80% of columns (global artifact)', () => {
        const numCols = 100;
        const numT = 4096;
        const colFeatures: import('./types').TDirectionFeature[][] = [];
        for (let c = 0; c < numCols; c++) {
            if (c < 90) {
                colFeatures.push([{ t: 0.5, kind: 'peak', radius: 20, prominence: 1, confidence: 0.8 }]);
            } else {
                colFeatures.push([]);
            }
        }

        const result = filterByColumnConsensus(colFeatures, numCols, numT);
        expect(result.globalRejected).toBe(90);
        const totalKept = result.filtered.reduce((s, c) => s + c.length, 0);
        expect(totalKept).toBe(0);
    });

    it('rejects features detected by <15% of columns (noise)', () => {
        const numCols = 100;
        const numT = 4096;
        const colFeatures: import('./types').TDirectionFeature[][] = [];
        for (let c = 0; c < numCols; c++) {
            if (c < 5) {
                colFeatures.push([{ t: 0.3, kind: 'valley', radius: 19, prominence: 0.5, confidence: 0.4 }]);
            } else {
                colFeatures.push([]);
            }
        }

        const result = filterByColumnConsensus(colFeatures, numCols, numT);
        expect(result.noiseRejected).toBe(5);
        const totalKept = result.filtered.reduce((s, c) => s + c.length, 0);
        expect(totalKept).toBe(0);
    });

    it('keeps features detected by 20-80% of columns (localized style)', () => {
        const numCols = 100;
        const numT = 4096;
        const colFeatures: import('./types').TDirectionFeature[][] = [];
        for (let c = 0; c < numCols; c++) {
            if (c < 40) {
                colFeatures.push([{ t: 0.7, kind: 'peak', radius: 22, prominence: 2, confidence: 0.9 }]);
            } else {
                colFeatures.push([]);
            }
        }

        const result = filterByColumnConsensus(colFeatures, numCols, numT);
        expect(result.globalRejected).toBe(0);
        expect(result.noiseRejected).toBe(0);
        const totalKept = result.filtered.reduce((s, c) => s + c.length, 0);
        expect(totalKept).toBe(40);
    });
});
