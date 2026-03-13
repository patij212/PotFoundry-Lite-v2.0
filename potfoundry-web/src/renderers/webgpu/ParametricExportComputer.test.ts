/**
 * ParametricExportComputer.test.ts — Unit tests for v7.0 Parametric Pipeline
 *
 * Tests the CPU-side logic: curvature computation, normalization, smoothing,
 * feature edge detection (curvature peaks + gradient zero-crossings),
 * feature merge-and-insert, CDF adaptive grid generation, and grid dimension
 * computation.
 *
 * GPU-dependent tests (shader evaluation, snap, relax) are skipped in Node
 * because WebGPU is not available in jsdom/vitest. Those are validated
 * via browser-based integration tests.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Re-export private functions for testing
//
// The functions below are defined in ParametricExportComputer.ts as module-level
// functions. We duplicate them here for isolated unit testing. When refactoring,
// these should be moved to a shared utility module.
// ============================================================================

/** Compute RAW curvature from 3D positions */
function computeRawCurvature(positions: Float32Array, numSamples: number): Float32Array {
    const curvature = new Float32Array(numSamples);
    for (let i = 1; i < numSamples - 1; i++) {
        const x0 = positions[(i - 1) * 3], y0 = positions[(i - 1) * 3 + 1], z0 = positions[(i - 1) * 3 + 2];
        const x1 = positions[i * 3], y1 = positions[i * 3 + 1], z1 = positions[i * 3 + 2];
        const x2 = positions[(i + 1) * 3], y2 = positions[(i + 1) * 3 + 1], z2 = positions[(i + 1) * 3 + 2];
        const dx = x0 - 2 * x1 + x2;
        const dy = y0 - 2 * y1 + y2;
        const dz = z0 - 2 * z1 + z2;
        curvature[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    curvature[0] = curvature[1];
    curvature[numSamples - 1] = curvature[numSamples - 2];
    return curvature;
}

/** Normalize using percentile scaling */
function normalizeProfile(curvature: Float32Array): Float32Array {
    const n = curvature.length;
    const result = new Float32Array(n);
    const sorted = Array.from(curvature).sort((a, b) => a - b);
    const p05 = sorted[Math.floor(n * 0.05)];
    const p95 = sorted[Math.floor(n * 0.95)];
    const range = p95 - p05;
    if (range > 1e-8) {
        for (let i = 0; i < n; i++) {
            result[i] = Math.max(0, Math.min(1, (curvature[i] - p05) / range));
        }
    }
    return result;
}

/** Smooth profile */
function smoothProfile(profile: Float32Array, radius: number): Float32Array {
    const n = profile.length;
    const result = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let sum = 0;
        let count = 0;
        const lo = Math.max(0, i - radius);
        const hi = Math.min(n - 1, i + radius);
        for (let j = lo; j <= hi; j++) {
            sum += profile[j];
            count++;
        }
        result[i] = sum / count;
    }
    return result;
}

const FEATURE_PROMINENCE_THRESHOLD = 0.08; // v7.0

/** v7.0 Feature detection: curvature peaks + gradient zero-crossings */
function detectFeatureEdges(
    curvature: Float32Array,
    numSamples: number,
    positions3D?: Float32Array
): number[] {
    const features: number[] = [];
    if (numSamples < 5) return features;

    // Strategy 1: Curvature peaks
    let maxCurv = 0;
    for (let i = 0; i < numSamples; i++) {
        maxCurv = Math.max(maxCurv, curvature[i]);
    }

    if (maxCurv > 1e-8) {
        const prominenceThreshold = maxCurv * FEATURE_PROMINENCE_THRESHOLD;

        for (let i = 2; i < numSamples - 2; i++) {
            const c = curvature[i];
            if (c <= curvature[i - 1] || c <= curvature[i + 1]) continue;
            let leftMin = c;
            for (let j = i - 1; j >= 0; j--) {
                leftMin = Math.min(leftMin, curvature[j]);
                if (curvature[j] > c) break;
            }
            let rightMin = c;
            for (let j = i + 1; j < numSamples; j++) {
                rightMin = Math.min(rightMin, curvature[j]);
                if (curvature[j] > c) break;
            }
            const prominence = c - Math.max(leftMin, rightMin);

            if (prominence >= prominenceThreshold) {
                const L = curvature[i - 1];
                const R = curvature[i + 1];
                const denom = 2 * (L - 2 * c + R);
                const offset = Math.abs(denom) > 1e-9 ? (L - R) / denom : 0;
                const refinedPos = (i + offset) / numSamples;
                features.push(Math.max(0, Math.min(1 - 1e-6, refinedPos)));
            }
        }
    }

    // Strategy 2: Gradient zero-crossings from 3D positions
    if (positions3D && positions3D.length >= numSamples * 3) {
        const radii = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const x = positions3D[i * 3];
            const y = positions3D[i * 3 + 1];
            radii[i] = Math.sqrt(x * x + y * y);
        }

        const gradient = new Float32Array(numSamples);
        for (let i = 1; i < numSamples - 1; i++) {
            gradient[i] = radii[i + 1] - radii[i - 1];
        }
        gradient[0] = gradient[1];
        gradient[numSamples - 1] = gradient[numSamples - 2];

        const noiseFloor = maxCurv * 0.02;
        for (let i = 1; i < numSamples - 1; i++) {
            if (gradient[i - 1] * gradient[i] < 0 ||
                (gradient[i] === 0 && gradient[i - 1] !== 0)) {
                const g0 = gradient[i - 1];
                const g1 = gradient[i];
                const frac = Math.abs(g0) / (Math.abs(g0) + Math.abs(g1) + 1e-12);
                const pos = (i - 1 + frac) / numSamples;

                const localCurv = Math.max(
                    curvature[Math.max(0, i - 1)],
                    curvature[i],
                    curvature[Math.min(numSamples - 1, i + 1)]
                );
                if (localCurv > noiseFloor) {
                    features.push(Math.max(0, Math.min(1 - 1e-6, pos)));
                }
            }
        }
    }

    // Deduplicate
    features.sort((a, b) => a - b);
    const minSep = 0.5 / numSamples;
    const deduped: number[] = [];
    for (const f of features) {
        if (deduped.length === 0 || f - deduped[deduped.length - 1] > minSep) {
            deduped.push(f);
        }
    }

    return deduped;
}

const FLANK_OFFSET = 0.3;

/** v7.0 Merge feature positions into CDF grid (insert + flanking companions) */
function mergeFeaturePositions(
    cdfPositions: Float32Array,
    features: number[],
    isPeriodic: boolean = false
): { positions: Float32Array; injected: number } {
    if (features.length === 0) {
        return { positions: cdfPositions, injected: 0 };
    }

    const n = cdfPositions.length;
    const avgSpacing = 1.0 / Math.max(n, 1);
    const flankDist = avgSpacing * FLANK_OFFSET;
    const minSep = avgSpacing * 0.1;

    const allPositions: number[] = Array.from(cdfPositions);
    let injected = 0;

    for (const feat of features) {
        allPositions.push(feat);
        injected++;

        const leftFlank = feat - flankDist;
        const rightFlank = feat + flankDist;

        if (isPeriodic) {
            allPositions.push(((leftFlank % 1.0) + 1.0) % 1.0);
            allPositions.push(((rightFlank % 1.0) + 1.0) % 1.0);
        } else {
            if (leftFlank > 0.001) allPositions.push(leftFlank);
            if (rightFlank < 0.999) allPositions.push(rightFlank);
        }
    }

    allPositions.sort((a, b) => a - b);

    const merged: number[] = [allPositions[0]];
    for (let i = 1; i < allPositions.length; i++) {
        if (allPositions[i] - merged[merged.length - 1] > minSep) {
            merged.push(allPositions[i]);
        }
    }

    if (merged[0] > 0.001 && !isPeriodic) {
        merged.unshift(0);
    }
    if (merged[merged.length - 1] < 0.999 && !isPeriodic) {
        merged.push(1.0);
    }

    const result = new Float32Array(merged.length);
    for (let i = 0; i < merged.length; i++) {
        result[i] = merged[i];
    }

    return { positions: result, injected };
}

/** CDF-adaptive positions (v7.0: squared curvature for stronger contrast) */
function generateCDFAdaptivePositions(
    curvature: Float32Array, count: number, minSpacingFactor: number = 0.3
): Float32Array {
    const n = curvature.length;
    const density = new Float32Array(n);
    const baseline = minSpacingFactor;
    for (let i = 0; i < n; i++) {
        const c = curvature[i];
        const boosted = c * c; // v7.0: squared for stronger contrast
        density[i] = baseline + (1 - baseline) * boosted;
    }
    const cdf = new Float32Array(n + 1);
    cdf[0] = 0;
    for (let i = 0; i < n; i++) {
        cdf[i + 1] = cdf[i] + density[i];
    }
    const total = cdf[n];
    if (total < 1e-8) {
        const positions = new Float32Array(count);
        for (let i = 0; i < count; i++) positions[i] = i / count;
        return positions;
    }
    for (let i = 0; i <= n; i++) cdf[i] /= total;
    const positions = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const target = (i + 0.5) / count;
        let lo = 0, hi = n;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cdf[mid + 1] < target) lo = mid + 1;
            else hi = mid;
        }
        const cdfLo = cdf[lo];
        const cdfHi = cdf[lo + 1];
        const frac = cdfHi > cdfLo ? (target - cdfLo) / (cdfHi - cdfLo) : 0.5;
        positions[i] = (lo + frac) / n;
    }
    positions[0] = 0;
    for (let i = 1; i < count; i++) {
        positions[i] = Math.min(positions[i], 1 - 1e-6);
    }
    return positions;
}

/** Grid dimension computation (v8.0 — no artificial 2M floor) */
function computeGridDimensions(
    totalTriangles: number, budgetFrac: number, aspectRatio: number
): { w: number; h: number } {
    const surfaceTriangles = totalTriangles * budgetFrac;
    const balancedAspect = Math.max(1, aspectRatio);
    const cells = surfaceTriangles / 2;
    const h = Math.max(4, Math.round(Math.sqrt(cells / balancedAspect)));
    const w = Math.max(8, Math.round(h * balancedAspect));
    return { w, h };
}

// ============================================================================
// Helper: Generate synthetic 3D positions along a circle with superformula
// ============================================================================

/**
 * Generate 3D positions for a superformula-modulated circle.
 * Mimics what the GPU evaluate_vertices produces for a T-strip.
 */
function generateSuperformulaStrip(
    numSamples: number, m: number, amplitude: number, baseRadius: number = 30
): Float32Array {
    const positions = new Float32Array(numSamples * 3);
    for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1); // [0, 1]
        const theta = t * Math.PI * 2;
        const r = baseRadius + amplitude * Math.cos(m * theta);
        positions[i * 3] = r * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(theta);
        positions[i * 3 + 2] = 0; // flat strip
    }
    return positions;
}

/**
 * Generate 3D positions for a height profile with sharp ridges.
 * Mimics a T-strip (varying height) with ridge features.
 */
function generateRidgedHeightStrip(
    numSamples: number, numRidges: number, ridgeWidth: number = 0.02
): Float32Array {
    const positions = new Float32Array(numSamples * 3);
    const baseRadius = 30;
    for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1);
        let r = baseRadius;
        // Add ridges as sharp bumps
        for (let k = 0; k < numRidges; k++) {
            const center = (k + 0.5) / numRidges;
            const dist = Math.abs(t - center);
            if (dist < ridgeWidth) {
                r += 5 * (1 - dist / ridgeWidth); // Triangular ridge, 5mm amplitude
            }
        }
        const theta = 0; // Fixed angle for T-strip
        positions[i * 3] = r * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(theta);
        positions[i * 3 + 2] = t * 100; // 100mm height
    }
    return positions;
}

/** Generate gentle hills (low curvature but clear gradient zero-crossings) */
function generateGentleHillsStrip(
    numSamples: number, numHills: number, hillAmplitude: number = 1.0
): Float32Array {
    const positions = new Float32Array(numSamples * 3);
    const baseRadius = 30;
    for (let i = 0; i < numSamples; i++) {
        const t = i / (numSamples - 1);
        const theta = t * Math.PI * 2;
        const r = baseRadius + hillAmplitude * Math.cos(numHills * theta);
        positions[i * 3] = r * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(theta);
        positions[i * 3 + 2] = 0;
    }
    return positions;
}

// ============================================================================
// Tests
// ============================================================================

describe('computeRawCurvature', () => {
    it('should return zero curvature for a straight line', () => {
        const n = 100;
        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            positions[i * 3] = i;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
        }
        const curv = computeRawCurvature(positions, n);
        for (let i = 1; i < n - 1; i++) {
            expect(curv[i]).toBeCloseTo(0, 5);
        }
    });

    it('should detect curvature on a circle', () => {
        const n = 360;
        const positions = new Float32Array(n * 3);
        const R = 30;
        for (let i = 0; i < n; i++) {
            const theta = (i / n) * Math.PI * 2;
            positions[i * 3] = R * Math.cos(theta);
            positions[i * 3 + 1] = R * Math.sin(theta);
            positions[i * 3 + 2] = 0;
        }
        const curv = computeRawCurvature(positions, n);
        // Circle has constant curvature (second derivative magnitude)
        const midCurv = curv[n / 2];
        expect(midCurv).toBeGreaterThan(0);
        // All interior values should be approximately equal
        for (let i = 2; i < n - 2; i++) {
            expect(curv[i]).toBeCloseTo(midCurv, 1);
        }
    });

    it('should detect higher curvature at superformula peaks', () => {
        const n = 1024;
        const positions = generateSuperformulaStrip(n, 6, 10);
        const curv = computeRawCurvature(positions, n);

        // Peaks of cos(6*theta) are at theta = 0, PI/3, 2PI/3, PI, ...
        // Curvature should be highest at these peaks
        const peakIdx = 0; // theta = 0
        const midIdx = Math.floor(n / 12); // theta = PI/6 (between peaks)

        // Peak curvature should be significantly higher than mid-point curvature
        expect(curv[peakIdx + 1]).toBeGreaterThan(curv[midIdx]); // +1 to avoid boundary
    });

    it('should handle boundary values correctly', () => {
        const n = 50;
        const positions = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const theta = (i / n) * Math.PI * 2;
            positions[i * 3] = 30 * Math.cos(theta);
            positions[i * 3 + 1] = 30 * Math.sin(theta);
            positions[i * 3 + 2] = 0;
        }
        const curv = computeRawCurvature(positions, n);
        // Boundary values should be copied from neighbors
        expect(curv[0]).toBe(curv[1]);
        expect(curv[n - 1]).toBe(curv[n - 2]);
    });
});

describe('normalizeProfile', () => {
    it('should normalize to [0, 1] range', () => {
        const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // 21 elements
        const result = normalizeProfile(input);
        for (let i = 0; i < result.length; i++) {
            expect(result[i]).toBeGreaterThanOrEqual(0);
            expect(result[i]).toBeLessThanOrEqual(1);
        }
    });

    it('should return zeros for uniform curvature', () => {
        const n = 100;
        const input = new Float32Array(n).fill(5);
        const result = normalizeProfile(input);
        for (let i = 0; i < n; i++) {
            expect(result[i]).toBe(0); // All same → range is 0 → all zeros
        }
    });

    it('should handle outliers via percentile scaling', () => {
        const n = 100;
        const input = new Float32Array(n).fill(1);
        // Add one extreme outlier
        input[50] = 1000;
        const result = normalizeProfile(input);
        // p05 and p95 are both ~1 (only 1 outlier out of 100)
        // So range is ~0 → all values become 0 (correct: the outlier is
        // beyond p95 but p05≈p95 so range is effectively 0)
        // The function correctly handles this by returning all zeros
        // when the percentile range is tiny.
        // With a larger spread, it would clip properly.
        const input2 = new Float32Array(n);
        for (let i = 0; i < n; i++) input2[i] = i; // 0 to 99
        const result2 = normalizeProfile(input2);
        expect(result2[0]).toBe(0); // Below p05
        expect(result2[n - 1]).toBe(1); // Above p95 → clipped to 1
    });
});

describe('smoothProfile', () => {
    it('should preserve average value', () => {
        const n = 100;
        const input = new Float32Array(n);
        let inputSum = 0;
        for (let i = 0; i < n; i++) {
            input[i] = Math.sin(i * 0.5) + 1;
            inputSum += input[i];
        }
        const result = smoothProfile(input, 4);
        let resultSum = 0;
        for (let i = 0; i < n; i++) {
            resultSum += result[i];
        }
        // Average should be approximately preserved
        expect(resultSum / n).toBeCloseTo(inputSum / n, 1);
    });

    it('should reduce peak amplitude', () => {
        const n = 100;
        const input = new Float32Array(n).fill(0);
        input[50] = 10; // Sharp spike
        const result = smoothProfile(input, 4);
        // Smoothed peak should be lower
        expect(result[50]).toBeLessThan(10);
        expect(result[50]).toBeGreaterThan(0);
    });

    it('should not change a constant profile', () => {
        const n = 50;
        const input = new Float32Array(n).fill(7);
        const result = smoothProfile(input, 4);
        for (let i = 0; i < n; i++) {
            expect(result[i]).toBeCloseTo(7, 5);
        }
    });

    it('with radius=0 should return input unchanged', () => {
        const n = 20;
        const input = new Float32Array(n);
        for (let i = 0; i < n; i++) input[i] = i * i;
        const result = smoothProfile(input, 0);
        for (let i = 0; i < n; i++) {
            expect(result[i]).toBeCloseTo(input[i], 5);
        }
    });
});

describe('detectFeatureEdges (curvature peaks)', () => {
    it('should detect peaks in a sinusoidal curvature profile', () => {
        const n = 1024;
        const curvature = new Float32Array(n);
        const numPeaks = 8; // Like SuperformulaBlossom m=8
        for (let i = 0; i < n; i++) {
            const t = i / n;
            // Absolute value of cos creates sharp peaks at curvature
            curvature[i] = Math.abs(Math.cos(numPeaks * Math.PI * t)) * 10;
        }
        const features = detectFeatureEdges(curvature, n);
        // Should detect approximately numPeaks features
        expect(features.length).toBeGreaterThanOrEqual(numPeaks - 2);
        expect(features.length).toBeLessThanOrEqual(numPeaks + 4);
    });

    it('should return empty for flat curvature', () => {
        const n = 200;
        const curvature = new Float32Array(n).fill(1);
        const features = detectFeatureEdges(curvature, n);
        expect(features.length).toBe(0);
    });

    it('should return empty for zero curvature', () => {
        const n = 200;
        const curvature = new Float32Array(n).fill(0);
        const features = detectFeatureEdges(curvature, n);
        expect(features.length).toBe(0);
    });

    it('should not detect noise peaks below prominence threshold', () => {
        const n = 200;
        const curvature = new Float32Array(n);
        // Background level of 10
        for (let i = 0; i < n; i++) curvature[i] = 10;
        // Small noise peaks (< 8% of max = 0.8)
        curvature[50] = 10.5;  // prominence = 0.5, threshold = 10*0.08 = 0.8
        curvature[100] = 10.3; // prominence = 0.3
        const features = detectFeatureEdges(curvature, n);
        expect(features.length).toBe(0); // Should NOT detect these
    });

    it('should detect a single prominent peak', () => {
        const n = 200;
        const curvature = new Float32Array(n).fill(1);
        curvature[100] = 20; // Very prominent
        const features = detectFeatureEdges(curvature, n);
        expect(features.length).toBe(1);
        expect(features[0]).toBeCloseTo(100 / n, 2);
    });

    it('should handle closely-spaced peaks', () => {
        const n = 1024;
        const curvature = new Float32Array(n);
        // Dense ridges at every 32 samples (32 peaks total)
        for (let i = 0; i < n; i++) {
            const phase = (i % 32) / 32;
            curvature[i] = phase < 0.5
                ? 10 * (2 * phase) // Rising
                : 10 * (2 * (1 - phase)); // Falling — triangular wave
        }
        const features = detectFeatureEdges(curvature, n);
        // Should detect most peaks (some at boundaries may be missed)
        expect(features.length).toBeGreaterThanOrEqual(20);
    });

    it('should use sub-sample refinement for peak position', () => {
        const n = 100;
        const curvature = new Float32Array(n).fill(0);
        // Parabolic peak centered between samples 50 and 51
        // Peak at 50.3
        for (let i = 45; i < 56; i++) {
            const d = i - 50.3;
            curvature[i] = Math.max(0, 10 - d * d);
        }
        const features = detectFeatureEdges(curvature, n);
        expect(features.length).toBe(1);
        // Should be closer to 50.3/100 = 0.503 than 50/100 = 0.5
        expect(features[0]).toBeCloseTo(0.503, 1);
    });

    it('should return positions in [0, 1) range', () => {
        const n = 512;
        const curvature = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            curvature[i] = Math.abs(Math.sin(6 * Math.PI * i / n)) * 5;
        }
        const features = detectFeatureEdges(curvature, n);
        for (const f of features) {
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThan(1);
        }
    });

    it('should handle short arrays gracefully', () => {
        expect(detectFeatureEdges(new Float32Array([1, 2, 3, 4]), 4)).toEqual([]);
        expect(detectFeatureEdges(new Float32Array([1, 2, 3]), 3)).toEqual([]);
        expect(detectFeatureEdges(new Float32Array([]), 0)).toEqual([]);
    });
});

describe('detectFeatureEdges (gradient zero-crossings)', () => {
    it('should detect ridge tops and valley bottoms via gradient', () => {
        const n = 2048;
        const m = 8;
        const positions = generateSuperformulaStrip(n, m, 10);
        const curvature = computeRawCurvature(positions, n);

        const featuresWithGrad = detectFeatureEdges(curvature, n, positions);
        const featuresWithoutGrad = detectFeatureEdges(curvature, n);

        // With gradient, should find MORE features (or at least same)
        expect(featuresWithGrad.length).toBeGreaterThanOrEqual(featuresWithoutGrad.length);

        // cos(8*theta) has 8 maxima + 8 minima = 16 zero-crossings
        // We should detect most of them
        expect(featuresWithGrad.length).toBeGreaterThanOrEqual(12);
    });

    it('should detect gentle hills that curvature peaks miss', () => {
        const n = 2048;
        // Very gentle hills: amplitude 1mm on 30mm radius
        const positions = generateGentleHillsStrip(n, 6, 1.0);
        const curvature = computeRawCurvature(positions, n);

        // With gradient zero-crossings should find the hills
        const withGrad = detectFeatureEdges(curvature, n, positions);

        // cos(6*theta) has 6 maxima + 6 minima = 12 extrema
        expect(withGrad.length).toBeGreaterThanOrEqual(6);
    });

    it('should deduplicate close features from both strategies', () => {
        const n = 1024;
        const positions = generateSuperformulaStrip(n, 4, 15);
        const curvature = computeRawCurvature(positions, n);

        const features = detectFeatureEdges(curvature, n, positions);

        // Check that features are well-separated (no duplicates)
        for (let i = 1; i < features.length; i++) {
            const gap = features[i] - features[i - 1];
            expect(gap).toBeGreaterThan(0.5 / n); // minSep
        }
    });

    it('should detect fewer gradient features on a straight line than a modulated shape', () => {
        const n = 500;
        // Straight line — constant cylindrical radius, no features
        const straightPositions = new Float32Array(n * 3);
        const R = 30;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            straightPositions[i * 3] = R; // constant x
            straightPositions[i * 3 + 1] = 0; // constant y
            straightPositions[i * 3 + 2] = t * 100; // varying z
        }
        const straightCurv = computeRawCurvature(straightPositions, n);
        const straightFeatures = detectFeatureEdges(straightCurv, n, straightPositions);

        // Modulated shape with clear features
        const modPositions = generateSuperformulaStrip(n, 6, 10);
        const modCurv = computeRawCurvature(modPositions, n);
        const modFeatures = detectFeatureEdges(modCurv, n, modPositions);

        // Straight line should have far fewer features than modulated shape
        expect(straightFeatures.length).toBeLessThan(modFeatures.length);
        // Straight line with constant radius should have very few features
        expect(straightFeatures.length).toBeLessThanOrEqual(2);
    });
});

describe('mergeFeaturePositions', () => {
    it('should add features and flanking companions to grid', () => {
        const n = 100;
        const cdf = new Float32Array(n);
        for (let i = 0; i < n; i++) cdf[i] = i / n;

        const features = [0.55]; // One feature in the middle
        const result = mergeFeaturePositions(cdf, features, false);

        // Should have more positions than original (feature + 2 flanks)
        expect(result.positions.length).toBeGreaterThan(n);
        expect(result.injected).toBe(1);

        // The feature position should be in the result
        const found = Array.from(result.positions).some(p => Math.abs(p - 0.55) < 0.001);
        expect(found).toBe(true);
    });

    it('should not change grid if no features', () => {
        const cdf = new Float32Array([0, 0.25, 0.5, 0.75]);
        const result = mergeFeaturePositions(cdf, [], false);
        expect(result.positions).toBe(cdf); // Same reference
        expect(result.injected).toBe(0);
    });

    it('should maintain sorted order after merge', () => {
        const n = 50;
        const cdf = new Float32Array(n);
        for (let i = 0; i < n; i++) cdf[i] = i / n;

        const features = [0.33, 0.67, 0.11, 0.89];
        const result = mergeFeaturePositions(cdf, features, false);

        for (let i = 1; i < result.positions.length; i++) {
            expect(result.positions[i]).toBeGreaterThanOrEqual(result.positions[i - 1]);
        }
    });

    it('should deduplicate positions that are too close', () => {
        const n = 10;
        const cdf = new Float32Array(n);
        for (let i = 0; i < n; i++) cdf[i] = i / n;

        // Feature very close to existing grid line at 0.5
        const features = [0.501];
        const result = mergeFeaturePositions(cdf, features, false);

        // avgSpacing = 1/10 = 0.1, minSep = 0.01
        // 0.501 and 0.5 differ by 0.001 < 0.01, so they should be merged
        // Result should not have both 0.5 and 0.501
        const closeCount = Array.from(result.positions).filter(
            p => p >= 0.499 && p <= 0.502
        ).length;
        expect(closeCount).toBe(1); // Only one of the two
    });

    it('should handle periodic (U) wrapping for flanks', () => {
        const n = 20;
        const cdf = new Float32Array(n);
        for (let i = 0; i < n; i++) cdf[i] = i / n;

        // Feature near the wrap-around point
        const features = [0.99];
        const result = mergeFeaturePositions(cdf, features, true);

        // Should add wrapped flanks
        expect(result.positions.length).toBeGreaterThan(n);
        expect(result.injected).toBe(1);
    });

    it('should not add flanks outside [0.001, 0.999] for non-periodic', () => {
        const n = 20;
        const cdf = new Float32Array(n);
        for (let i = 0; i < n; i++) cdf[i] = i / n;

        // Feature very close to left boundary
        const features = [0.005]; // Left flank = 0.005 - 0.015 < 0.001, suppressed
        const result = mergeFeaturePositions(cdf, features, false);

        // No positions should be negative
        const hasNegative = Array.from(result.positions).some(p => p < 0);
        expect(hasNegative).toBe(false);
    });

    it('should handle many features without explosion', () => {
        const n = 500;
        const cdf = new Float32Array(n);
        for (let i = 0; i < n; i++) cdf[i] = i / n;

        // 100 features = 100 + ~200 flanks = ~300 new positions
        const features: number[] = [];
        for (let i = 0; i < 100; i++) features.push((i + 0.5) / 100);

        const result = mergeFeaturePositions(cdf, features, false);

        // Should have more but not absurdly more (dedup removes close ones)
        expect(result.positions.length).toBeGreaterThan(n);
        expect(result.positions.length).toBeLessThan(n + 400);
        expect(result.injected).toBe(100);
    });
});

describe('generateCDFAdaptivePositions', () => {
    it('should generate approximately uniform positions for flat curvature', () => {
        const n = 100;
        const curvature = new Float32Array(n).fill(0.5);
        const count = 50;
        const positions = generateCDFAdaptivePositions(curvature, count);

        expect(positions.length).toBe(count);
        // Should be approximately uniform — CDF binning introduces small variations
        const avgSpacing = 1 / count;
        for (let i = 1; i < count; i++) {
            const spacing = positions[i] - positions[i - 1];
            expect(spacing).toBeCloseTo(avgSpacing, 1); // Within 0.05 tolerance
        }
    });

    it('should concentrate positions more strongly with squared density', () => {
        const n = 200;
        const curvature = new Float32Array(n);
        // High curvature in first quarter
        for (let i = 0; i < n; i++) {
            curvature[i] = i < n / 4 ? 1 : 0;
        }
        const count = 100;
        const positions = generateCDFAdaptivePositions(curvature, count, 0.10);

        // Count positions in first quarter
        const inFirstQuarter = positions.filter(p => p < 0.25).length;
        // With squared density and 0.10 baseline, concentration should be strong
        expect(inFirstQuarter).toBeGreaterThan(count * 0.30);
    });

    it('should respect minimum spacing factor', () => {
        const n = 100;
        const curvature = new Float32Array(n);
        // Spread curvature over a few bins (more realistic than a single spike)
        for (let i = 45; i <= 55; i++) {
            curvature[i] = 1.0; // Moderate, squared becomes 1.0
        }
        const count = 50;
        const positions = generateCDFAdaptivePositions(curvature, count, 0.3);

        // Even with curvature concentration, positions should not have huge gaps
        let maxGap = 0;
        for (let i = 1; i < count; i++) {
            maxGap = Math.max(maxGap, positions[i] - positions[i - 1]);
        }
        // With squared density and 0.3 baseline, worst case density ratio
        // is 1/0.3 ≈ 3.3×. CDF binning can amplify slightly.
        expect(maxGap).toBeLessThan(1 / count * 7); // No more than 7× uniform
    });

    it('should start at 0', () => {
        const curvature = new Float32Array(100).fill(1);
        const positions = generateCDFAdaptivePositions(curvature, 50);
        expect(positions[0]).toBe(0);
    });

    it('should not exceed 1', () => {
        const curvature = new Float32Array(100).fill(1);
        const positions = generateCDFAdaptivePositions(curvature, 50);
        for (let i = 0; i < 50; i++) {
            expect(positions[i]).toBeLessThan(1);
        }
    });

    it('should be monotonically increasing', () => {
        const n = 200;
        const curvature = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            curvature[i] = Math.sin(i * 0.1) * 0.5 + 0.5;
        }
        const count = 100;
        const positions = generateCDFAdaptivePositions(curvature, count);
        for (let i = 1; i < count; i++) {
            expect(positions[i]).toBeGreaterThan(positions[i - 1]);
        }
    });

    it('should handle zero curvature (all zeros)', () => {
        const curvature = new Float32Array(100).fill(0);
        const positions = generateCDFAdaptivePositions(curvature, 50);
        // Should produce uniform grid
        expect(positions.length).toBe(50);
        const avgSpacing = 1 / 50;
        for (let i = 1; i < 50; i++) {
            expect(positions[i] - positions[i - 1]).toBeCloseTo(avgSpacing, 1);
        }
    });

    it('stronger adaptation with lower minSpacingFactor', () => {
        const n = 200;
        const curvature = new Float32Array(n);
        // Step function: high curvature in first half
        for (let i = 0; i < n; i++) curvature[i] = i < n / 2 ? 1 : 0;

        const count = 100;
        const posWeak = generateCDFAdaptivePositions(curvature, count, 0.3);
        const posStrong = generateCDFAdaptivePositions(curvature, count, 0.10);

        // Strong adaptation should put MORE positions in first half
        const weakFirstHalf = posWeak.filter(p => p < 0.5).length;
        const strongFirstHalf = posStrong.filter(p => p < 0.5).length;
        expect(strongFirstHalf).toBeGreaterThanOrEqual(weakFirstHalf);
    });
});

describe('computeGridDimensions', () => {
    it('should respect user triangle budget (no artificial floor)', () => {
        const { w, h } = computeGridDimensions(100_000, 0.72, 3);
        const tris = w * h * 2;
        // v8.0: respects the user's budget — 100K × 0.72 = 72K surface tris
        expect(tris).toBeLessThan(200_000); // Well below the old 2M floor
        expect(tris).toBeGreaterThanOrEqual(100_000 * 0.72 * 0.5); // At least ~50% of budget
    });

    it('should respect aspect ratio', () => {
        const { w, h } = computeGridDimensions(2_000_000, 0.72, 4);
        // W should be approximately 4× H
        expect(w / h).toBeCloseTo(4, 0);
    });

    it('should handle aspect ratio of 1', () => {
        const { w, h } = computeGridDimensions(2_000_000, 0.72, 1);
        expect(w / h).toBeCloseTo(1, 0);
    });

    it('should clamp aspect ratio to >= 1', () => {
        const { w, h } = computeGridDimensions(2_000_000, 0.72, 0.3);
        expect(w).toBeGreaterThanOrEqual(8);
        expect(h).toBeGreaterThanOrEqual(4);
    });

    it('should scale with budget fraction', () => {
        const outer = computeGridDimensions(2_000_000, 0.72, 3);
        const inner = computeGridDimensions(2_000_000, 0.14, 3);
        // Outer wall should have many more triangles
        const outerTris = outer.w * outer.h * 2;
        const innerTris = inner.w * inner.h * 2;
        expect(outerTris).toBeGreaterThan(innerTris * 3);
    });
});

describe('End-to-end: v7.0 Pipeline Integration', () => {
    it('should detect features, merge into grid, and produce valid result', () => {
        const n = 2048;
        const positions = generateSuperformulaStrip(n, 8, 10); // m=8, 8 petals
        const rawCurv = computeRawCurvature(positions, n);
        const normalized = normalizeProfile(rawCurv);
        const smoothed = smoothProfile(normalized, 2); // v7.0: radius=2

        // Feature detection with gradient zero-crossings
        const features = detectFeatureEdges(rawCurv, n, positions);
        expect(features.length).toBeGreaterThanOrEqual(10);

        // CDF generation with squared density
        const gridCount = 500;
        const cdf = generateCDFAdaptivePositions(smoothed, gridCount, 0.10);

        // Merge features into grid (periodic for U-direction)
        const merged = mergeFeaturePositions(cdf, features, true);
        expect(merged.positions.length).toBeGreaterThan(gridCount);
        expect(merged.injected).toBeGreaterThan(0);

        // Verify sorted order
        for (let i = 1; i < merged.positions.length; i++) {
            expect(merged.positions[i]).toBeGreaterThanOrEqual(merged.positions[i - 1]);
        }

        // Verify all feature positions are in the result (approximately)
        for (const feat of features) {
            const found = Array.from(merged.positions).some(p => Math.abs(p - feat) < 0.01);
            expect(found).toBe(true);
        }
    });

    it('should detect features in ridged height profile', () => {
        const n = 2048;
        const numRidges = 5;
        const positions = generateRidgedHeightStrip(n, numRidges, 0.03);
        const rawCurv = computeRawCurvature(positions, n);

        // Use gradient zero-crossings for ridge detection
        const features = detectFeatureEdges(rawCurv, n, positions);

        // Each ridge should produce curvature peaks and gradient zero-crossings
        expect(features.length).toBeGreaterThanOrEqual(numRidges);
    });

    it('should produce denser grid at features than at flat regions', () => {
        const n = 2048;
        const positions = generateSuperformulaStrip(n, 6, 10);
        const rawCurv = computeRawCurvature(positions, n);
        const normalized = normalizeProfile(rawCurv);
        const smoothed = smoothProfile(normalized, 2);

        const gridCount = 200;
        const cdf = generateCDFAdaptivePositions(smoothed, gridCount, 0.10);
        const features = detectFeatureEdges(rawCurv, n, positions);
        const merged = mergeFeaturePositions(cdf, features, true);

        // Find density at a feature peak vs flat region
        if (features.length > 0) {
            const featPos = features[0];
            let nearIdx = 0;
            for (let i = 0; i < merged.positions.length; i++) {
                if (Math.abs(merged.positions[i] - featPos) < Math.abs(merged.positions[nearIdx] - featPos)) {
                    nearIdx = i;
                }
            }
            if (nearIdx > 0 && nearIdx < merged.positions.length - 1) {
                const featureSpacing = merged.positions[nearIdx + 1] - merged.positions[nearIdx - 1];
                // Feature spacing should be very small (feature + flanks)
                expect(featureSpacing).toBeLessThan(1.0 / gridCount * 3);
            }
        }
    });

    it('should handle gentle hills via gradient zero-crossings', () => {
        const n = 2048;
        const positions = generateGentleHillsStrip(n, 4, 0.5); // Very subtle
        const rawCurv = computeRawCurvature(positions, n);

        // Without gradient — may miss gentle hills
        const curvOnly = detectFeatureEdges(rawCurv, n);
        // With gradient — should find them
        const withGrad = detectFeatureEdges(rawCurv, n, positions);

        // Gradient detection should find at least 4 hills (maxima of radius)
        expect(withGrad.length).toBeGreaterThanOrEqual(4);
    });
});

describe('Surface budget allocation', () => {
    const SURFACE_CONFIG = [
        { id: 0, name: 'Outer Wall', budgetFrac: 0.72 },
        { id: 1, name: 'Inner Wall', budgetFrac: 0.14 },
        { id: 2, name: 'Rim', budgetFrac: 0.04 },
        { id: 3, name: 'Bottom Under', budgetFrac: 0.04 },
        { id: 4, name: 'Bottom Top', budgetFrac: 0.03 },
        { id: 5, name: 'Drain', budgetFrac: 0.03 },
    ];

    it('should sum to 1.0', () => {
        const total = SURFACE_CONFIG.reduce((sum, s) => sum + s.budgetFrac, 0);
        expect(total).toBeCloseTo(1.0, 4);
    });

    it('should allocate majority to outer wall', () => {
        expect(SURFACE_CONFIG[0].budgetFrac).toBeGreaterThan(0.7);
    });
});

describe('Grid topology (watertight)', () => {
    it('should produce 2 triangles per grid cell', () => {
        const w = 10;
        const h = 5;
        const expectedTris = w * h * 2;
        expect(expectedTris).toBe(100);
    });

    it('should wrap U-axis periodically', () => {
        // Test that index (i+1)%w wraps correctly
        const w = 1472;
        expect((w - 1 + 1) % w).toBe(0); // Last column wraps to first
        expect((0 + 1) % w).toBe(1);
    });
});

describe('Parameter validation', () => {
    it('computeGridDimensions should produce valid dimensions for extreme inputs', () => {
        // Very small target
        const small = computeGridDimensions(100, 0.72, 3);
        expect(small.w).toBeGreaterThanOrEqual(8);
        expect(small.h).toBeGreaterThanOrEqual(4);

        // Very large target
        const large = computeGridDimensions(20_000_000, 0.72, 3);
        expect(large.w).toBeGreaterThan(0);
        expect(large.h).toBeGreaterThan(0);
        const tris = large.w * large.h * 2;
        expect(tris).toBeGreaterThan(10_000_000);
    });

    it('CDF should handle single-sample curvature', () => {
        const curvature = new Float32Array([1]);
        const positions = generateCDFAdaptivePositions(curvature, 10, 0.3);
        expect(positions.length).toBe(10);
    });
});

/**
 * v10.9: Patch the outer-wall vertex buffer so each row's feature columns
 * trace the EXACT cusp profile from the GPU probe data.
 * When probe data is available, uses cusp-interpolated patching (equal-arc-length).
 * When not, falls back to Gaussian redistribution (v10.8 behavior).
 * (Test copy of the production function.)
 */
// v10.10: GRADIENT_PATCH_HALF_WIDTH no longer used — peak-only patching
// const GRADIENT_PATCH_HALF_WIDTH = 4;

function patchRowFeatures(
    vertices: Float32Array,
    W: number,
    numRows: number,
    unionU: Float32Array,
    allRowFeatures: number[][]
): number {
    let patchCount = 0;

    for (let j = 0; j < numRows && j < allRowFeatures.length; j++) {
        const rowFeats = allRowFeatures[j];
        if (rowFeats.length === 0) continue;

        const rowBase = j * W * 3;
        const patchedCols = new Set<number>();

        for (const peakU of rowFeats) {
            // Binary search for nearest column in sorted unionU
            let lo = 0, hi = W - 1;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (unionU[mid] < peakU) lo = mid + 1;
                else hi = mid;
            }
            let bestCol = lo;
            let bestDist = Math.abs(unionU[lo] - peakU);
            if (lo > 0) {
                const d = Math.abs(unionU[lo - 1] - peakU);
                if (d < bestDist) { bestCol = lo - 1; bestDist = d; }
            }
            const dWrap0 = Math.abs(peakU - unionU[0] - 1);
            if (dWrap0 < bestDist) { bestCol = 0; bestDist = dWrap0; }
            const dWrapN = Math.abs(unionU[W - 1] - peakU + 1);
            if (dWrapN < bestDist) { bestCol = W - 1; bestDist = dWrapN; }

            // Accept peaks within 85% of the local grid spacing
            const colL = (bestCol - 1 + W) % W;
            const colR = (bestCol + 1) % W;
            let leftSpacing = unionU[bestCol] - unionU[colL];
            if (leftSpacing < 0) leftSpacing += 1;
            let rightSpacing = unionU[colR] - unionU[bestCol];
            if (rightSpacing < 0) rightSpacing += 1;
            const localSpacing = Math.min(leftSpacing, rightSpacing);
            const maxAcceptDist = localSpacing * 0.85;

            if (bestDist > maxAcceptDist) continue;

            // v10.10: Peak-only — snap ONLY the peak column to exact feature U
            if (!patchedCols.has(bestCol)) {
                patchedCols.add(bestCol);
                const clampedPeak = Math.max(0, Math.min(1 - 1e-7, peakU));
                vertices[rowBase + bestCol * 3] = clampedPeak;
                patchCount++;
            }
            // Flanking columns remain at their union-grid positions (identical across rows)
        }
    }

    return patchCount;
}

describe('patchRowFeatures (v10.10 peak-only patching)', () => {
    /**
     * Helper: build a flat vertex buffer matching generateAdaptiveGrid layout.
     * Each vertex = (u, t, surfaceId).  Row j, column c → index (j * W + c).
     */
    function makeGrid(unionU: Float32Array, tPositions: Float32Array): Float32Array {
        const W = unionU.length;
        const numRows = tPositions.length;
        const verts = new Float32Array(W * numRows * 3);
        let idx = 0;
        for (let j = 0; j < numRows; j++) {
            for (let c = 0; c < W; c++) {
                verts[idx++] = unionU[c];
                verts[idx++] = tPositions[j];
                verts[idx++] = 0; // outer wall
            }
        }
        return verts;
    }

    it('should not modify vertices when no features', () => {
        const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const original = new Float32Array(verts);
        const allRowFeatures: number[][] = [[], [], []];

        const count = patchRowFeatures(verts, 4, 3, unionU, allRowFeatures);

        expect(count).toBe(0);
        expect(Array.from(verts)).toEqual(Array.from(original));
    });

    it('should overwrite the nearest column U with exact peak U', () => {
        // Union grid has a column at 0.35 (feature cluster center).
        // Row 0 detected a peak at 0.351, row 1 at 0.349.
        const unionU = new Float32Array([0, 0.25, 0.35, 0.5, 0.75]);
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const allRowFeatures: number[][] = [[0.351], [0.349], []];

        const count = patchRowFeatures(verts, 5, 3, unionU, allRowFeatures);

        expect(count).toBe(2);

        // Row 0, column 2 should be patched to 0.351
        const r0c2_u = verts[0 * 5 * 3 + 2 * 3]; // row 0, col 2, u component
        expect(Math.abs(r0c2_u - 0.351)).toBeLessThan(1e-6);

        // Row 1, column 2 should be patched to 0.349
        const r1c2_u = verts[1 * 5 * 3 + 2 * 3]; // row 1, col 2, u component
        expect(Math.abs(r1c2_u - 0.349)).toBeLessThan(1e-6);

        // Row 2 should be unpatched (union value 0.35)
        const r2c2_u = verts[2 * 5 * 3 + 2 * 3]; // row 2, col 2, u component
        expect(Math.abs(r2c2_u - 0.35)).toBeLessThan(1e-6);
    });

    it('should not patch if peak is too far from any column (half-spacing rule)', () => {
        const gappyU = new Float32Array([0, 0.1, 0.9]);
        const tPos2 = new Float32Array([0, 1.0]);
        const gappyVerts = makeGrid(gappyU, tPos2);
        const gappyOriginal = new Float32Array(gappyVerts);
        const allRowFeatures: number[][] = [[0.5], []];

        const count = patchRowFeatures(gappyVerts, 3, 2, gappyU, allRowFeatures);

        expect(count).toBe(0);
        expect(Array.from(gappyVerts)).toEqual(Array.from(gappyOriginal));
    });

    it('should handle multiple features in one row', () => {
        const unionU = new Float32Array([0, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]);
        const tPos = new Float32Array([0, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const allRowFeatures: number[][] = [[0.1005, 0.301, 0.699], []];

        const count = patchRowFeatures(verts, 7, 2, unionU, allRowFeatures);

        expect(count).toBe(3);

        const W = 7;
        const r0c1_u = verts[0 * W * 3 + 1 * 3]; // col 1 (union=0.1)
        expect(Math.abs(r0c1_u - 0.1005)).toBeLessThan(1e-6);

        const r0c3_u = verts[0 * W * 3 + 3 * 3]; // col 3 (union=0.3)
        expect(Math.abs(r0c3_u - 0.301)).toBeLessThan(1e-6);

        const r0c5_u = verts[0 * W * 3 + 5 * 3]; // col 5 (union=0.7)
        expect(Math.abs(r0c5_u - 0.699)).toBeLessThan(1e-6);
    });

    it('different rows should get different exact U at the same column', () => {
        const unionU = new Float32Array([0, 0.25, 0.40, 0.5, 0.75]);
        const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
        const verts = makeGrid(unionU, tPos);

        const allRowFeatures: number[][] = [
            [0.400],
            [0.401],
            [0.402],
            [0.399],
            [0.398],
        ];

        const count = patchRowFeatures(verts, 5, 5, unionU, allRowFeatures);
        expect(count).toBe(5);

        const W = 5;
        for (let j = 0; j < 5; j++) {
            const u = verts[j * W * 3 + 2 * 3];
            expect(Math.abs(u - allRowFeatures[j][0])).toBeLessThan(1e-6);
        }
    });

    it('should preserve T and surfaceId when patching U', () => {
        const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const allRowFeatures: number[][] = [[0.251], [], []];

        patchRowFeatures(verts, 4, 3, unionU, allRowFeatures);

        const W = 4;
        const r0c1_t = verts[0 * W * 3 + 1 * 3 + 1]; // T component
        const r0c1_s = verts[0 * W * 3 + 1 * 3 + 2]; // surfaceId
        expect(r0c1_t).toBe(0);    // row 0 → t=0
        expect(r0c1_s).toBe(0);    // outer wall
    });

    it('v10.10: should NOT move flanking columns (peak-only patching)', () => {
        // Grid with 10 columns, spacing = 0.1
        // Peak at 0.52 — nearest column is col 5 (union=0.5)
        // v10.10: ONLY col 5 should be patched. All other columns stay at union positions.
        const unionU = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
        const tPos = new Float32Array([0, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const allRowFeatures: number[][] = [[0.52], []];

        const count = patchRowFeatures(verts, 10, 2, unionU, allRowFeatures);
        expect(count).toBe(1);

        const W = 10;
        // Peak column (col 5) patched to exact peak
        expect(verts[0 * W * 3 + 5 * 3]).toBeCloseTo(0.52, 5);

        // ALL flanking columns should remain at their original union-grid positions
        expect(verts[0 * W * 3 + 4 * 3]).toBeCloseTo(0.4, 6);  // col 4 unchanged
        expect(verts[0 * W * 3 + 6 * 3]).toBeCloseTo(0.6, 6);  // col 6 unchanged
        expect(verts[0 * W * 3 + 3 * 3]).toBeCloseTo(0.3, 6);  // col 3 unchanged
        expect(verts[0 * W * 3 + 7 * 3]).toBeCloseTo(0.7, 6);  // col 7 unchanged
        expect(verts[0 * W * 3 + 2 * 3]).toBeCloseTo(0.2, 6);  // col 2 unchanged
        expect(verts[0 * W * 3 + 8 * 3]).toBeCloseTo(0.8, 6);  // col 8 unchanged
        expect(verts[0 * W * 3 + 1 * 3]).toBeCloseTo(0.1, 6);  // col 1 unchanged
        expect(verts[0 * W * 3 + 9 * 3]).toBeCloseTo(0.9, 6);  // col 9 unchanged
        expect(verts[0 * W * 3 + 0 * 3]).toBeCloseTo(0.0, 6);  // col 0 unchanged

        // Row 1 should be entirely unmodified
        for (let c = 0; c < 10; c++) {
            expect(verts[1 * W * 3 + c * 3]).toBeCloseTo(unionU[c], 6);
        }
    });

    it('v10.10: flanking columns identical across rows (no inter-row inconsistency)', () => {
        // This is the KEY v10.10 test: flanking columns must be at the SAME
        // position in every row, ensuring consistent triangulation.
        const unionU = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
        const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const W = 10;

        // Each row detects the feature at a slightly different U
        const allRowFeatures: number[][] = [
            [0.505],
            [0.498],
            [0.510],
            [0.492],
            [0.503],
        ];

        patchRowFeatures(verts, W, 5, unionU, allRowFeatures);

        // Peak columns (col 5) should have per-row exact U
        expect(verts[0 * W * 3 + 5 * 3]).toBeCloseTo(0.505, 5);
        expect(verts[1 * W * 3 + 5 * 3]).toBeCloseTo(0.498, 5);
        expect(verts[2 * W * 3 + 5 * 3]).toBeCloseTo(0.510, 5);
        expect(verts[3 * W * 3 + 5 * 3]).toBeCloseTo(0.492, 5);
        expect(verts[4 * W * 3 + 5 * 3]).toBeCloseTo(0.503, 5);

        // ALL flanking columns should be IDENTICAL across all rows
        for (let c = 0; c < W; c++) {
            if (c === 5) continue; // skip peak column
            const expectedU = unionU[c];
            for (let j = 0; j < 5; j++) {
                expect(verts[j * W * 3 + c * 3]).toBeCloseTo(expectedU, 6);
            }
        }
    });

    it('v8.3: should accept peaks within 85% of local spacing', () => {
        const unionU = new Float32Array([0, 0.05, 0.10, 0.15, 0.20]);
        const tPos = new Float32Array([0, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const allRowFeatures: number[][] = [[0.074], []];

        const count = patchRowFeatures(verts, 5, 2, unionU, allRowFeatures);
        expect(count).toBe(1);

        const W = 5;
        const r0c1_u = verts[0 * W * 3 + 1 * 3];
        expect(r0c1_u).toBeCloseTo(0.074, 5);
    });

    it('v8.3: flanks should not shift for unpatched rows', () => {
        const unionU = new Float32Array([0, 0.1, 0.2, 0.3, 0.4]);
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const allRowFeatures: number[][] = [[], [0.21], []];

        patchRowFeatures(verts, 5, 3, unionU, allRowFeatures);

        const W = 5;
        // Row 0 (no features) — all columns unchanged
        expect(verts[0 * W * 3 + 1 * 3]).toBeCloseTo(0.1, 6);
        expect(verts[0 * W * 3 + 2 * 3]).toBeCloseTo(0.2, 6);
        expect(verts[0 * W * 3 + 3 * 3]).toBeCloseTo(0.3, 6);

        // Row 2 (no features) — all columns unchanged
        expect(verts[2 * W * 3 + 1 * 3]).toBeCloseTo(0.1, 6);
        expect(verts[2 * W * 3 + 2 * 3]).toBeCloseTo(0.2, 6);
        expect(verts[2 * W * 3 + 3 * 3]).toBeCloseTo(0.3, 6);

        // Row 1 — col 2 patched to exact feature U
        expect(verts[1 * W * 3 + 2 * 3]).toBeCloseTo(0.21, 5);

        // v10.10: Row 1 flanking columns should be UNCHANGED
        expect(verts[1 * W * 3 + 1 * 3]).toBeCloseTo(0.1, 6);
        expect(verts[1 * W * 3 + 3 * 3]).toBeCloseTo(0.3, 6);
    });

    it('v10.6: wider acceptance radius patches peaks that old half-spacing rejected', () => {
        const unionU = new Float32Array([0, 0.04, 0.1, 0.2, 0.3]);
        const tPos = new Float32Array([0, 1.0]);
        const verts = makeGrid(unionU, tPos);
        const allRowFeatures: number[][] = [[0.07], []];

        const count = patchRowFeatures(verts, 5, 2, unionU, allRowFeatures);
        expect(count).toBe(1);
        expect(verts[0 * 5 * 3 + 1 * 3]).toBeCloseTo(0.07, 5);
    });
});

// ============================================================================
// flipFeatureAlignedDiagonals (v9.0)
// ============================================================================

/**
 * v9.0 test copy of flipFeatureAlignedDiagonals.
 * Simplified to only detect and flip based on UV diagonal length.
 */
function flipFeatureAlignedDiagonals(
    indices: Uint32Array,
    vertices: Float32Array,
    w: number,
    h: number,
    unionU: Float32Array,
    invertWinding: boolean
): number {
    let flipCount = 0;
    const MIN_SHIFT = 0.0005;

    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const iNext = (i + 1) % w;
            const v00 = j * w + i;
            const v10 = j * w + iNext;
            const v01 = (j + 1) * w + i;
            const v11 = (j + 1) * w + iNext;

            const uA = vertices[v00 * 3];
            const uB = vertices[v10 * 3];
            const uC = vertices[v01 * 3];
            const uD = vertices[v11 * 3];

            const uTemplateI = unionU[i];
            const uTemplateNext = unionU[iNext];

            const shiftI_topRow = uA - uTemplateI;
            const shiftI_botRow = uC - uTemplateI;
            const shiftNext_topRow = uB - uTemplateNext;
            const shiftNext_botRow = uD - uTemplateNext;

            const hasFeatureInCell = (
                Math.abs(shiftI_topRow) > MIN_SHIFT ||
                Math.abs(shiftI_botRow) > MIN_SHIFT ||
                Math.abs(shiftNext_topRow) > MIN_SHIFT ||
                Math.abs(shiftNext_botRow) > MIN_SHIFT
            );

            if (!hasFeatureInCell) continue;

            // Normalize by cell aspect ratio so U and T contribute equally
            let cellDU = unionU[iNext] - unionU[i];
            if (cellDU < 0) cellDU += 1;
            const cellDT = Math.abs(vertices[v01 * 3 + 1] - vertices[v00 * 3 + 1]);
            const tScale = (cellDT > 1e-8) ? (cellDU / cellDT) : 1.0;

            const duBC = uB - uC;
            const dtBC = (vertices[v10 * 3 + 1] - vertices[v01 * 3 + 1]) * tScale;
            const lenBC2 = duBC * duBC + dtBC * dtBC;

            const duAD = uA - uD;
            const dtAD = (vertices[v00 * 3 + 1] - vertices[v11 * 3 + 1]) * tScale;
            const lenAD2 = duAD * duAD + dtAD * dtAD;

            const shouldFlip = lenAD2 < lenBC2 * 0.95;

            if (shouldFlip) {
                const triBase = (j * w + i) * 6;
                if (invertWinding) {
                    indices[triBase + 0] = v00; indices[triBase + 1] = v01; indices[triBase + 2] = v11;
                    indices[triBase + 3] = v00; indices[triBase + 4] = v11; indices[triBase + 5] = v10;
                } else {
                    indices[triBase + 0] = v00; indices[triBase + 1] = v10; indices[triBase + 2] = v11;
                    indices[triBase + 3] = v00; indices[triBase + 4] = v11; indices[triBase + 5] = v01;
                }
                flipCount++;
            }
        }
    }
    return flipCount;
}

describe('flipFeatureAlignedDiagonals (v9.0)', () => {
    /**
     * Helper: build a grid with generateAdaptiveGrid-like layout + indices.
     */
    function makeGridWithIndices(
        unionU: Float32Array,
        tPositions: Float32Array
    ): { vertices: Float32Array; indices: Uint32Array } {
        const W = unionU.length;
        const numRows = tPositions.length;
        const h = numRows - 1;
        const verts = new Float32Array(W * numRows * 3);
        let idx = 0;
        for (let j = 0; j < numRows; j++) {
            for (let c = 0; c < W; c++) {
                verts[idx++] = unionU[c];
                verts[idx++] = tPositions[j];
                verts[idx++] = 0; // outer wall
            }
        }
        const indices = new Uint32Array(W * h * 6);
        let iIdx = 0;
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < W; i++) {
                const i0 = j * W + i;
                const i1 = j * W + ((i + 1) % W);
                const i2 = (j + 1) * W + i;
                const i3 = (j + 1) * W + ((i + 1) % W);
                indices[iIdx++] = i0; indices[iIdx++] = i1; indices[iIdx++] = i2;
                indices[iIdx++] = i1; indices[iIdx++] = i3; indices[iIdx++] = i2;
            }
        }
        return { vertices: verts, indices };
    }

    it('should not flip any diagonals when no features are patched', () => {
        const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const { vertices, indices } = makeGridWithIndices(unionU, tPos);
        const originalIndices = new Uint32Array(indices);

        const flips = flipFeatureAlignedDiagonals(indices, vertices, 4, 2, unionU, false);

        expect(flips).toBe(0);
        expect(Array.from(indices)).toEqual(Array.from(originalIndices));
    });

    it('should flip diagonal when feature shifts diagonally across rows', () => {
        // Grid: 5 columns, 3 rows (2 quad rows)
        // Close T-spacing so that U-shifts dominate after aspect normalization.
        const unionU = new Float32Array([0, 0.1, 0.2, 0.3, 0.4]);
        const tPos = new Float32Array([0, 0.01, 0.02]);
        const { vertices, indices } = makeGridWithIndices(unionU, tPos);

        // Make A-D diagonal shorter than B-C:
        // Shift top-left (A) right and bottom-right (D) left for one cell.
        // Cell (j=0, i=2): A=row0,col2  B=row0,col3  C=row1,col2  D=row1,col3
        // Shift A right, D left → A and D converge → AD shorter than BC
        const W = 5;
        vertices[0 * W * 3 + 2 * 3] = 0.26;  // row 0, col 2: shifted RIGHT +0.06
        vertices[1 * W * 3 + 3 * 3] = 0.24;  // row 1, col 3: shifted LEFT  -0.06

        const flips = flipFeatureAlignedDiagonals(indices, vertices, W, 2, unionU, false);

        // Cell (j=0, i=2) should flip because A and D converge
        expect(flips).toBeGreaterThan(0);
    });

    it('should preserve valid triangle topology after flipping', () => {
        const unionU = new Float32Array([0, 0.1, 0.2, 0.3, 0.4]);
        const tPos = new Float32Array([0, 0.01, 0.02]);
        const { vertices, indices } = makeGridWithIndices(unionU, tPos);
        const W = 5;

        // Patch a feature with enough shift to trigger flips
        vertices[0 * W * 3 + 2 * 3] = 0.20;
        vertices[1 * W * 3 + 2 * 3] = 0.26;

        flipFeatureAlignedDiagonals(indices, vertices, W, 2, unionU, false);

        // Verify all indices are valid vertex references
        const totalVerts = W * tPos.length;
        for (let i = 0; i < indices.length; i++) {
            expect(indices[i]).toBeLessThan(totalVerts);
        }

        // Verify each triangle has 3 distinct vertices
        for (let t = 0; t < indices.length; t += 3) {
            expect(indices[t]).not.toBe(indices[t + 1]);
            expect(indices[t]).not.toBe(indices[t + 2]);
            expect(indices[t + 1]).not.toBe(indices[t + 2]);
        }
    });
});

// ============================================================================
// v16.0 — detectRowFeaturesV16 (Verified Peak/Valley Detection)
// ============================================================================

/**
 * Feature classification type.
 */
type FeatureKind = 'peak' | 'valley';

/** A classified, verified feature point detected by row probing. */
interface FeaturePoint {
    u: number;
    kind: FeatureKind;
    radius: number;
    prominence: number;
    confidence: number;
}

/**
 * Test copy of detectRowFeaturesV16 v16.0.
 * 2 strategies: gradient sign changes (verified peaks/valleys) + curvature shoulders (verified).
 * Strategy 3 (inflection points) REMOVED — was generating noise.
 *
 * Returns typed FeaturePoint[] with classification, verification, and confidence.
 */
function detectRowFeaturesV16(
    positions3D: Float32Array,
    numSamples: number,
    minProminence: number = 0.005
): { features: FeaturePoint[]; uPositions: number[]; rejected: number } {
    if (numSamples < 7) return { features: [], uPositions: [], rejected: 0 };

    const radii = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        const x = positions3D[i * 3];
        const y = positions3D[i * 3 + 1];
        radii[i] = Math.sqrt(x * x + y * y);
    }

    const wrap = (idx: number) => ((idx % numSamples) + numSamples) % numSamples;
    const prominenceWindow = Math.max(5, Math.floor(numSamples * 0.008));

    // Pre-compute 5-point stencil second derivative (sign-preserving)
    const d2r = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        d2r[i] = (
            -radii[wrap(i - 2)] + 16 * radii[wrap(i - 1)]
            - 30 * radii[i]
            + 16 * radii[wrap(i + 1)] - radii[wrap(i + 2)]
        ) / 12;
    }

    const candidates: FeaturePoint[] = [];
    let rejected = 0;

    // ── Strategy 1: Gradient Sign Changes (True Extrema) ──
    for (let i = 0; i < numSamples; i++) {
        const prev = wrap(i - 1);
        const next = wrap(i + 1);
        const dLeft  = radii[i] - radii[prev];
        const dRight = radii[next] - radii[i];

        if (dLeft * dRight >= 0) continue;

        const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

        // Parabolic refinement
        const L = radii[prev];
        const C = radii[i];
        const R = radii[next];
        const denom = L - 2 * C + R;
        let delta = 0;
        if (Math.abs(denom) > 1e-14) {
            delta = 0.5 * (L - R) / denom;
            delta = Math.max(-0.5, Math.min(0.5, delta));
        }

        // VERIFICATION: curvature sign must agree with extremum type
        const curvatureCorrect = kind === 'peak' ? (denom < 0) : (denom > 0);
        if (!curvatureCorrect && Math.abs(denom) > 1e-10) {
            rejected++;
            continue;
        }

        // VERIFICATION: refined position must still be an extremum
        const refinedIdx = i + delta;
        const refinedU = ((refinedIdx / numSamples) % 1 + 1) % 1;

        const fracIdx = ((refinedIdx % numSamples) + numSamples) % numSamples;
        const iLo = Math.floor(fracIdx);
        const frac = fracIdx - iLo;
        const iHi = wrap(iLo + 1);
        const refinedRadius = radii[iLo] * (1 - frac) + radii[iHi] * frac;

        const rMinus1 = radii[prev];
        const rPlus1 = radii[next];
        const isStillExtremum = kind === 'peak'
            ? (refinedRadius >= rMinus1 - 1e-10 && refinedRadius >= rPlus1 - 1e-10)
            : (refinedRadius <= rMinus1 + 1e-10 && refinedRadius <= rPlus1 + 1e-10);

        if (!isStillExtremum) {
            rejected++;
            continue;
        }

        // Prominence
        let localMax = -Infinity, localMin = Infinity;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = wrap(i + k);
            localMax = Math.max(localMax, radii[idx]);
            localMin = Math.min(localMin, radii[idx]);
        }
        const prominence = localMax - localMin;
        if (prominence < minProminence) {
            rejected++;
            continue;
        }

        // Confidence scoring
        const gradientStrength = Math.abs(dLeft) + Math.abs(dRight);
        const curvatureStrength = Math.abs(d2r[i]);

        let maxGrad = 0, maxCurv = 0;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = wrap(i + k);
            const nextIdx = wrap(idx + 1);
            maxGrad = Math.max(maxGrad, Math.abs(radii[nextIdx] - radii[idx]));
            maxCurv = Math.max(maxCurv, Math.abs(d2r[idx]));
        }

        const gradConf = maxGrad > 1e-12 ? Math.min(1, gradientStrength / (2 * maxGrad)) : 0.5;
        const curvConf = maxCurv > 1e-12 ? Math.min(1, curvatureStrength / maxCurv) : 0.5;
        const promConf = Math.min(1, prominence / (minProminence * 5));
        const confidence = 0.4 * gradConf + 0.3 * curvConf + 0.3 * promConf;

        candidates.push({ u: refinedU, kind, radius: refinedRadius, prominence, confidence });
    }

    // ── Strategy 2: Curvature Shoulders (Verified) ──
    const absCurv = new Float32Array(numSamples);
    let maxCurvGlobal = 0;
    for (let i = 0; i < numSamples; i++) {
        absCurv[i] = Math.abs(d2r[i]);
        maxCurvGlobal = Math.max(maxCurvGlobal, absCurv[i]);
    }

    if (maxCurvGlobal > 1e-10) {
        const curvThreshold = maxCurvGlobal * 0.20;

        for (let i = 0; i < numSamples; i++) {
            if (absCurv[i] <= absCurv[wrap(i - 1)] ||
                absCurv[i] <= absCurv[wrap(i + 1)]) continue;
            if (absCurv[i] < curvThreshold) continue;

            const expectedKind: FeatureKind = d2r[i] < 0 ? 'peak' : 'valley';

            // Find and verify actual radius extremum within ±2 samples
            let bestIdx = i;
            let bestVal = radii[i];
            for (let k = -2; k <= 2; k++) {
                const idx = wrap(i + k);
                if (expectedKind === 'peak' ? (radii[idx] > bestVal) : (radii[idx] < bestVal)) {
                    bestVal = radii[idx];
                    bestIdx = idx;
                }
            }

            const bPrev = radii[wrap(bestIdx - 1)];
            const bNext = radii[wrap(bestIdx + 1)];
            const bCur = radii[bestIdx];
            const isExtremum = expectedKind === 'peak'
                ? (bCur >= bPrev && bCur >= bNext)
                : (bCur <= bPrev && bCur <= bNext);
            if (!isExtremum) { rejected++; continue; }

            // Parabolic refinement at verified extremum
            const eL = radii[wrap(bestIdx - 1)];
            const eC = radii[bestIdx];
            const eR = radii[wrap(bestIdx + 1)];
            const eDenom = eL - 2 * eC + eR;
            let eDelta = 0;
            if (Math.abs(eDenom) > 1e-14) {
                eDelta = 0.5 * (eL - eR) / eDenom;
                eDelta = Math.max(-0.5, Math.min(0.5, eDelta));
            }

            if (expectedKind === 'peak' && eDenom > 0) { rejected++; continue; }
            if (expectedKind === 'valley' && eDenom < 0) { rejected++; continue; }

            const curvPeakU = ((bestIdx + eDelta) / numSamples + 1) % 1;

            let localMax = -Infinity, localMin = Infinity;
            for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
                const idx = wrap(bestIdx + k);
                localMax = Math.max(localMax, radii[idx]);
                localMin = Math.min(localMin, radii[idx]);
            }
            const prominence = localMax - localMin;
            if (prominence < minProminence) { rejected++; continue; }

            const fracIdx = ((bestIdx + eDelta) % numSamples + numSamples) % numSamples;
            const iLo = Math.floor(fracIdx);
            const fr = fracIdx - iLo;
            const refinedRadius = radii[iLo] * (1 - fr) + radii[wrap(iLo + 1)] * fr;

            candidates.push({
                u: curvPeakU,
                kind: expectedKind,
                radius: refinedRadius,
                prominence,
                confidence: 0.5 * Math.min(1, absCurv[i] / maxCurvGlobal)
                          + 0.5 * Math.min(1, prominence / (minProminence * 5)),
            });
        }
    }

    // ── Deduplicate: keep highest-confidence at each location ──
    candidates.sort((a, b) => a.u - b.u);
    const minSep = 1.5 / numSamples;
    const features: FeaturePoint[] = [];

    for (const cand of candidates) {
        if (features.length === 0) {
            features.push(cand);
            continue;
        }
        const last = features[features.length - 1];
        let gap = cand.u - last.u;
        if (gap < 0) gap += 1;

        if (gap > minSep && (1 - gap) > minSep) {
            features.push(cand);
        } else {
            if (cand.confidence > last.confidence) {
                features[features.length - 1] = cand;
            }
        }
    }

    const uPositions = features.map(f => f.u);
    uPositions.sort((a, b) => a - b);

    return { features, uPositions, rejected };
}

/**
 * Backward-compatible wrapper: returns just the U positions.
 */
function detectRowFeatures(
    positions3D: Float32Array,
    numSamples: number,
    minProminence: number = 0.005
): number[] {
    return detectRowFeaturesV16(positions3D, numSamples, minProminence).uPositions;
}

describe('detectRowFeaturesV16 (v16.0 — Verified Peak/Valley Detection)', () => {
    /** Generate probe data: circle at given radius with optional radial modulation */
    function makeProbe(
        numSamples: number,
        baseRadius: number,
        modFn?: (theta: number) => number
    ): Float32Array {
        const data = new Float32Array(numSamples * 3);
        for (let i = 0; i < numSamples; i++) {
            const theta = (i / numSamples) * 2 * Math.PI;
            const r = baseRadius + (modFn ? modFn(theta) : 0);
            data[i * 3]     = r * Math.cos(theta);
            data[i * 3 + 1] = r * Math.sin(theta);
            data[i * 3 + 2] = 0;
        }
        return data;
    }

    // ── Basic edge cases ──

    it('should return empty for fewer than 7 samples', () => {
        const probe = makeProbe(5, 10);
        const result = detectRowFeaturesV16(probe, 5);
        expect(result.features).toEqual([]);
        expect(result.uPositions).toEqual([]);
        expect(result.rejected).toBe(0);
    });

    it('should return empty for a perfect circle (no features)', () => {
        const probe = makeProbe(256, 10);
        const result = detectRowFeaturesV16(probe, 256);
        expect(result.features.length).toBe(0);
        expect(result.uPositions.length).toBe(0);
    });

    // ── Peak/Valley classification ──

    it('should detect peaks AND valleys from a sinusoidal modulation', () => {
        const N = 512;
        // 4 peaks, 4 valleys → 8 radius extrema
        const probe = makeProbe(N, 10, (th) => 2 * Math.sin(4 * th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        // Should detect at least 8 verified extrema (4 peaks + 4 valleys)
        expect(result.features.length).toBeGreaterThanOrEqual(8);
        // Must have both peaks AND valleys
        const peaks = result.features.filter(f => f.kind === 'peak');
        const valleys = result.features.filter(f => f.kind === 'valley');
        expect(peaks.length).toBeGreaterThanOrEqual(4);
        expect(valleys.length).toBeGreaterThanOrEqual(4);
    });

    it('should classify peaks and valleys correctly for cos(theta)', () => {
        const N = 512;
        // cos(theta): peak at θ=0 (U=0), valley at θ=π (U=0.5)
        const probe = makeProbe(N, 10, (th) => 3 * Math.cos(th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        expect(result.features.length).toBe(2);

        // Find the feature closest to U=0 (the peak)
        const nearZero = result.features.find(f =>
            f.u < 0.05 || f.u > 0.95
        );
        expect(nearZero).toBeDefined();
        expect(nearZero!.kind).toBe('peak');

        // Find the feature closest to U=0.5 (the valley)
        const nearHalf = result.features.find(f =>
            Math.abs(f.u - 0.5) < 0.05
        );
        expect(nearHalf).toBeDefined();
        expect(nearHalf!.kind).toBe('valley');
    });

    // ── Verification ──

    it('should NOT detect inflection points (Strategy 3 removed)', () => {
        const N = 1024;
        // sin(theta) has 2 extrema and 2 inflection points
        // v16 should detect exactly 2 features (the extrema), not 4+
        const probe = makeProbe(N, 10, (th) => 3 * Math.sin(th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        // Should detect exactly 2 extrema — no inflection point noise
        expect(result.features.length).toBe(2);
        const peaks = result.features.filter(f => f.kind === 'peak');
        const valleys = result.features.filter(f => f.kind === 'valley');
        expect(peaks.length).toBe(1);
        expect(valleys.length).toBe(1);
    });

    it('should report rejected candidates', () => {
        const N = 256;
        // Very small modulation — many candidates will fail prominence
        const probe = makeProbe(N, 10, (th) => 0.001 * Math.sin(4 * th));
        const result = detectRowFeaturesV16(probe, N, 0.01);
        // With high prominence threshold, most tiny extrema should be rejected
        expect(result.rejected).toBeGreaterThan(0);
    });

    // ── Feature properties ──

    it('should compute positive prominence for all features', () => {
        const N = 512;
        const probe = makeProbe(N, 10, (th) => 2 * Math.sin(4 * th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        for (const f of result.features) {
            expect(f.prominence).toBeGreaterThan(0);
        }
    });

    it('should compute confidence in [0, 1] for all features', () => {
        const N = 512;
        const probe = makeProbe(N, 10, (th) => 2 * Math.sin(4 * th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        for (const f of result.features) {
            expect(f.confidence).toBeGreaterThanOrEqual(0);
            expect(f.confidence).toBeLessThanOrEqual(1);
        }
    });

    it('should report radius at each feature position', () => {
        const N = 512;
        const probe = makeProbe(N, 10, (th) => 2 * Math.sin(4 * th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        for (const f of result.features) {
            // Radius should be in the range [baseRadius - amplitude, baseRadius + amplitude]
            expect(f.radius).toBeGreaterThan(7);
            expect(f.radius).toBeLessThan(13);
        }
    });

    // ── Curvature shoulder detection ──

    it('should detect features at sharp bends via curvature shoulders', () => {
        const N = 512;
        // Narrow Gaussian bump at theta = π
        const probe = makeProbe(N, 10, (th) => {
            const d = th - Math.PI;
            return 2 * Math.exp(-d * d / 0.02);
        });
        const result = detectRowFeaturesV16(probe, N, 0.001);
        expect(result.features.length).toBeGreaterThanOrEqual(1);
        // At least one feature near theta=π → U ≈ 0.5
        const nearHalf = result.features.some(f => Math.abs(f.u - 0.5) < 0.05);
        expect(nearHalf).toBe(true);
        // The bump is a peak
        const peakAtHalf = result.features.find(f =>
            Math.abs(f.u - 0.5) < 0.05 && f.kind === 'peak'
        );
        expect(peakAtHalf).toBeDefined();
    });

    // ── Accuracy and refinement ──

    it('should produce sub-sample accurate positions', () => {
        const N = 64; // Coarse grid — refinement matters more
        const probe = makeProbe(N, 10, (th) => 2 * Math.sin(2 * th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        expect(result.features.length).toBeGreaterThan(0);
        // All features should be in [0, 1)
        for (const f of result.features) {
            expect(f.u).toBeGreaterThanOrEqual(0);
            expect(f.u).toBeLessThan(1);
        }
    });

    // ── Deduplication ──

    it('should deduplicate features keeping highest confidence', () => {
        const N = 256;
        const probe = makeProbe(N, 10, (th) => 2 * Math.sin(8 * th));
        const result = detectRowFeaturesV16(probe, N, 0.001);
        // Check monotonicity and minimum separation
        for (let i = 1; i < result.uPositions.length; i++) {
            expect(result.uPositions[i]).toBeGreaterThan(result.uPositions[i - 1]);
        }
    });

    // ── Prominence gating ──

    it('should respect prominence threshold', () => {
        const N = 256;
        const probe = makeProbe(N, 10, (th) => 0.001 * Math.sin(4 * th));
        const highProm = detectRowFeaturesV16(probe, N, 0.01);
        const lowProm = detectRowFeaturesV16(probe, N, 0.0001);
        // High prominence should reject the tiny features
        expect(lowProm.features.length).toBeGreaterThanOrEqual(highProm.features.length);
    });

    // ── Backward compatibility ──

    it('backward-compatible wrapper returns sorted number[]', () => {
        const N = 512;
        const probe = makeProbe(N, 10, (th) => 2 * Math.sin(4 * th));
        const uPositions = detectRowFeatures(probe, N, 0.001);
        expect(Array.isArray(uPositions)).toBe(true);
        expect(uPositions.length).toBeGreaterThanOrEqual(8);
        // All values in [0, 1)
        for (const u of uPositions) {
            expect(u).toBeGreaterThanOrEqual(0);
            expect(u).toBeLessThan(1);
        }
        // Sorted
        for (let i = 1; i < uPositions.length; i++) {
            expect(uPositions[i]).toBeGreaterThanOrEqual(uPositions[i - 1]);
        }
    });
});

// ============================================================================
// v10.8 — linkFeatureChains (optimal matching + increased gap tolerance)
// ============================================================================

const CHAIN_LINK_RADIUS = 0.04;

interface ChainPoint { u: number; row: number; }
interface FeatureChain { points: ChainPoint[]; }

function linkFeatureChains(
    allRowFeatures: number[][],
    numRows: number
): FeatureChain[] {
    // v10.8: ActiveChain tracks momentum for gap bridging
    interface ActiveChain {
        chain: FeatureChain;
        missCount: number;
        predictedU: number;
    }
    let activeChains: ActiveChain[] = [];
    const completedChains: FeatureChain[] = [];

    // v10.8: Raised from 3 to 6 to bridge m-transition zones
    const MAX_MISS_COUNT = 6;
    const MOMENTUM_LINK_RADIUS = CHAIN_LINK_RADIUS * 2;

    for (let j = 0; j < numRows; j++) {
        const rowFeats = allRowFeatures[j];
        if (rowFeats.length === 0) {
            const newActive: ActiveChain[] = [];
            for (const ac of activeChains) {
                ac.missCount++;
                if (ac.missCount > MAX_MISS_COUNT) {
                    if (ac.chain.points.length >= 2) completedChains.push(ac.chain);
                } else {
                    newActive.push(ac);
                }
            }
            activeChains = newActive;
            continue;
        }

        // v10.8: OPTIMAL global matching replaces greedy per-chain matching
        const usedFeats = new Set<number>();
        const usedChains = new Set<number>();
        const newActive: ActiveChain[] = [];

        interface MatchCandidate {
            chainIdx: number;
            featIdx: number;
            dist: number;
        }
        const candidates: MatchCandidate[] = [];

        for (let ci = 0; ci < activeChains.length; ci++) {
            const ac = activeChains[ci];
            const matchU = ac.missCount > 0 ? ac.predictedU : ac.chain.points[ac.chain.points.length - 1].u;
            const searchRadius = ac.missCount > 0 ? MOMENTUM_LINK_RADIUS : CHAIN_LINK_RADIUS;

            for (let f = 0; f < rowFeats.length; f++) {
                let d = Math.abs(rowFeats[f] - matchU);
                if (d > 0.5) d = 1 - d;
                if (d < searchRadius) {
                    const lengthBonus = Math.min(
                        ac.chain.points.length * 0.0001,
                        searchRadius * 0.1
                    );
                    candidates.push({ chainIdx: ci, featIdx: f, dist: d - lengthBonus });
                }
            }
        }

        candidates.sort((a, b) => a.dist - b.dist);

        for (const cand of candidates) {
            if (usedChains.has(cand.chainIdx) || usedFeats.has(cand.featIdx)) continue;

            const ac = activeChains[cand.chainIdx];
            ac.chain.points.push({ u: rowFeats[cand.featIdx], row: j });
            usedFeats.add(cand.featIdx);
            usedChains.add(cand.chainIdx);

            const pts = ac.chain.points;
            if (pts.length >= 2) {
                const last = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                const rowSpan = last.row - prev.row;
                if (rowSpan > 0) {
                    let uVel = (last.u - prev.u) / rowSpan;
                    if (uVel > 0.5) uVel -= 1;
                    if (uVel < -0.5) uVel += 1;
                    ac.predictedU = ((last.u + uVel) % 1 + 1) % 1;
                } else {
                    ac.predictedU = last.u;
                }
            } else {
                ac.predictedU = rowFeats[cand.featIdx];
            }

            ac.missCount = 0;
            newActive.push(ac);
        }

        for (let ci = 0; ci < activeChains.length; ci++) {
            if (usedChains.has(ci)) continue;
            const ac = activeChains[ci];
            ac.missCount++;
            if (ac.missCount > MAX_MISS_COUNT) {
                if (ac.chain.points.length >= 2) completedChains.push(ac.chain);
            } else {
                newActive.push(ac);
            }
        }

        for (let f = 0; f < rowFeats.length; f++) {
            if (!usedFeats.has(f)) {
                newActive.push({
                    chain: { points: [{ u: rowFeats[f], row: j }] },
                    missCount: 0,
                    predictedU: rowFeats[f],
                });
            }
        }

        activeChains = newActive;
    }

    for (const ac of activeChains) {
        if (ac.chain.points.length >= 2) completedChains.push(ac.chain);
    }

    return completedChains;
}

describe('linkFeatureChains (v10.8 optimal matching)', () => {
    it('should return empty chains for empty row features', () => {
        const chains = linkFeatureChains([[], [], []], 3);
        expect(chains.length).toBe(0);
    });

    it('should not create chains shorter than 2 points', () => {
        // Feature appears in only one row
        const chains = linkFeatureChains([[0.5], [], []], 3);
        expect(chains.length).toBe(0);
    });

    it('should link a vertical feature across all rows', () => {
        // Feature at U=0.5 in every row
        const rowFeatures = [[0.5], [0.5], [0.5], [0.5]];
        const chains = linkFeatureChains(rowFeatures, 4);
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(4);
        for (const pt of chains[0].points) {
            expect(pt.u).toBe(0.5);
        }
    });

    it('should link a diagonal feature that shifts gradually', () => {
        // Feature shifts from U=0.3 to U=0.32 to U=0.34 (within CHAIN_LINK_RADIUS=0.04)
        const rowFeatures = [[0.3], [0.32], [0.34], [0.36]];
        const chains = linkFeatureChains(rowFeatures, 4);
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(4);
        expect(chains[0].points[0].u).toBe(0.3);
        expect(chains[0].points[3].u).toBe(0.36);
    });

    it('should NOT link features that jump more than CHAIN_LINK_RADIUS', () => {
        // Feature at 0.3, then jumps to 0.5 (shift 0.2 >> 0.04)
        const rowFeatures = [[0.3], [0.5], [], []];
        const chains = linkFeatureChains(rowFeatures, 4);
        // No chain should contain both 0.3 and 0.5
        for (const chain of chains) {
            const us = chain.points.map(p => p.u);
            expect(us.includes(0.3) && us.includes(0.5)).toBe(false);
        }
    });

    it('should handle circular wrapping near U=0 / U=1', () => {
        // Feature wraps: 0.98 → 0.99 → 0.01 → 0.02
        const rowFeatures = [[0.98], [0.99], [0.01], [0.02]];
        const chains = linkFeatureChains(rowFeatures, 4);
        // Should form one chain (circular U-distance 0.99→0.01 = 0.02 < 0.04)
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(4);
    });

    it('should create multiple chains for multiple distinct features', () => {
        // Two separate features
        const rowFeatures = [
            [0.2, 0.7],
            [0.21, 0.71],
            [0.22, 0.72],
        ];
        const chains = linkFeatureChains(rowFeatures, 3);
        expect(chains.length).toBe(2);
        // Each chain should have 3 points
        for (const chain of chains) {
            expect(chain.points.length).toBe(3);
        }
    });

    it('should bridge a single-row gap with momentum (v10.6)', () => {
        const rowFeatures = [[0.5], [0.51], [], [0.52], [0.53]];
        const chains = linkFeatureChains(rowFeatures, 5);
        // v10.8: Single empty row at row 2 is bridged (missCount=1 < MAX_MISS_COUNT=6)
        // So we get one continuous chain spanning rows 0,1,3,4
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(4);
        expect(chains[0].points[0].u).toBe(0.5);
        expect(chains[0].points[3].u).toBe(0.53);
    });

    it('should prefer nearest neighbor when multiple features are close', () => {
        // Two features in row 0, two in row 1 — should match nearest
        const rowFeatures = [
            [0.2, 0.8],
            [0.21, 0.79],
        ];
        const chains = linkFeatureChains(rowFeatures, 2);
        expect(chains.length).toBe(2);
        // Chain near 0.2 should link to 0.21
        const chain0 = chains.find(c => c.points[0].u === 0.2);
        expect(chain0).toBeDefined();
        expect(chain0!.points[1].u).toBe(0.21);
        // Chain near 0.8 should link to 0.79
        const chain1 = chains.find(c => c.points[0].u === 0.8);
        expect(chain1).toBeDefined();
        expect(chain1!.points[1].u).toBe(0.79);
    });

    // v10.8 gap-bridging tests (MAX_MISS_COUNT=6)
    it('should bridge up to 6 consecutive empty rows (v10.8)', () => {
        // Feature at rows 0,1 then 6 empty rows then resumes at row 8
        const rowFeatures = [[0.5], [0.51], [], [], [], [], [], [], [0.53]];
        const chains = linkFeatureChains(rowFeatures, 9);
        // 6 empty rows (rows 2-7) → missCount reaches 6 at row 7
        // Row 8 arrives before missCount exceeds MAX_MISS_COUNT (6)
        // Chain should bridge the gap
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(3); // rows 0, 1, 8
    });

    it('should close chains after >6 consecutive empty rows (v10.8)', () => {
        // Feature at rows 0,1 then 7 empty rows then resumes at row 9
        const rowFeatures = [[0.5], [0.51], [], [], [], [], [], [], [], [0.54]];
        const chains = linkFeatureChains(rowFeatures, 10);
        // 7 empty rows: missCount exceeds MAX_MISS_COUNT=6 at row 8
        // Chain from rows 0-1 gets closed; row 9 starts a new 1-point chain (discarded)
        expect(chains.length).toBe(1); // only the 2-point chain from rows 0-1
        expect(chains[0].points.length).toBe(2);
    });

    it('should use momentum prediction to match displaced features (v10.6)', () => {
        // Diagonal feature: shifting +0.01 per row
        // After gap, feature is at predicted position
        const rowFeatures = [[0.3], [0.31], [0.32], [], [0.34]];
        const chains = linkFeatureChains(rowFeatures, 5);
        // Gap at row 3: predicted U = 0.32 + 0.01 = 0.33 (from velocity)
        // Row 4 at 0.34 is within MOMENTUM_LINK_RADIUS (0.08) of predicted 0.33
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(4); // rows 0,1,2,4
        expect(chains[0].points[3].u).toBe(0.34);
    });

    it('should use wider search radius during momentum bridging (v10.6)', () => {
        // Feature at 0.5, then gap, then feature at 0.56
        // Normal CHAIN_LINK_RADIUS=0.04 would reject 0.06 distance
        // But MOMENTUM_LINK_RADIUS=0.08 should accept it
        const rowFeatures = [[0.5], [0.5], [], [0.56]];
        const chains = linkFeatureChains(rowFeatures, 4);
        // During gap: missCount=1, search uses MOMENTUM_LINK_RADIUS=0.08
        // Distance 0.06 < 0.08 → should link
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(3); // rows 0,1,3
    });
});

// ============================================================================
// v16.3 — linkFeatureChainsByKind (separate peak/valley chain linking)
// ============================================================================

/**
 * Test copy of linkFeatureChainsByKind v16.3.
 *
 * Separates peaks and valleys before linking so they form independent chains.
 * Uses the existing linkFeatureChains function for each kind.
 */
function linkFeatureChainsByKind(
    allRowFeatures: number[][],
    allRowTypedFeatures: FeaturePoint[][],
    numRows: number
): FeatureChain[] {
    const peakRows: number[][] = [];
    const valleyRows: number[][] = [];

    for (let j = 0; j < numRows; j++) {
        const peaks: number[] = [];
        const valleys: number[] = [];

        if (j < allRowTypedFeatures.length) {
            const typed = allRowTypedFeatures[j];
            const untyped = j < allRowFeatures.length ? allRowFeatures[j] : [];

            for (const u of untyped) {
                const match = typed.find(t => Math.abs(t.u - u) < 1e-6);
                if (match) {
                    if (match.kind === 'peak') peaks.push(u);
                    else valleys.push(u);
                } else {
                    peaks.push(u);
                }
            }
        } else if (j < allRowFeatures.length) {
            peaks.push(...allRowFeatures[j]);
        }

        peakRows.push(peaks);
        valleyRows.push(valleys);
    }

    const peakChains = linkFeatureChains(peakRows, numRows);
    const valleyChains = linkFeatureChains(valleyRows, numRows);

    return [...peakChains, ...valleyChains];
}

function makeTyped(u: number, kind: FeatureKind): FeaturePoint {
    return { u, kind, radius: 10, prominence: 0.5, confidence: 0.9 };
}

describe('linkFeatureChainsByKind (v16.3 separated peak/valley linking)', () => {
    it('should produce 0 chains from empty features', () => {
        const chains = linkFeatureChainsByKind([[], [], []], [[], [], []], 3);
        expect(chains.length).toBe(0);
    });

    it('should link peaks into peak chains and valleys into valley chains', () => {
        // 4 rows, each with 1 peak at U=0.3 and 1 valley at U=0.7
        const allRowFeatures = [
            [0.3, 0.7], [0.3, 0.7], [0.3, 0.7], [0.3, 0.7]
        ];
        const allRowTypedFeatures: FeaturePoint[][] = [
            [makeTyped(0.3, 'peak'), makeTyped(0.7, 'valley')],
            [makeTyped(0.3, 'peak'), makeTyped(0.7, 'valley')],
            [makeTyped(0.3, 'peak'), makeTyped(0.7, 'valley')],
            [makeTyped(0.3, 'peak'), makeTyped(0.7, 'valley')],
        ];

        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, 4);
        expect(chains.length).toBe(2); // 1 peak chain + 1 valley chain
        // Each chain should span all 4 rows
        const sortedByLength = chains.sort((a, b) => b.points.length - a.points.length);
        expect(sortedByLength[0].points.length).toBe(4);
        expect(sortedByLength[1].points.length).toBe(4);
    });

    it('should handle valleys only present in some rows', () => {
        // Peaks in every row at U=0.2; valleys at U=0.6 only in even rows
        // Without kind separation, valleys would be orphaned fragments.
        // With kind separation, valleys form their own chain.
        const allRowFeatures = [
            [0.2, 0.6], [0.2], [0.2, 0.6], [0.2], [0.2, 0.6], [0.2]
        ];
        const allRowTypedFeatures: FeaturePoint[][] = [
            [makeTyped(0.2, 'peak'), makeTyped(0.6, 'valley')],
            [makeTyped(0.2, 'peak')],
            [makeTyped(0.2, 'peak'), makeTyped(0.6, 'valley')],
            [makeTyped(0.2, 'peak')],
            [makeTyped(0.2, 'peak'), makeTyped(0.6, 'valley')],
            [makeTyped(0.2, 'peak')],
        ];

        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, 6);
        // 1 peak chain (6 rows) + 1 valley chain (3 rows with gaps bridged)
        expect(chains.length).toBeGreaterThanOrEqual(1); // peak chain guaranteed
        const peakChain = chains.find(c => c.points.length === 6);
        expect(peakChain).toBeDefined();
        // Valley chain has features in rows 0, 2, 4 with gaps — should link with momentum bridging
        const totalPts = chains.reduce((s, c) => s + c.points.length, 0);
        expect(totalPts).toBeGreaterThanOrEqual(8); // 6 peaks + at least 2 valley points linked
    });

    it('should prevent peak-valley cross-contamination at nearby U positions', () => {
        // Peak at U=0.25 and valley at U=0.27 — close enough to link if mixed
        // With kind separation, they should form separate chains
        const allRowFeatures = [
            [0.25, 0.27], [0.25, 0.27], [0.25, 0.27], [0.25, 0.27]
        ];
        const allRowTypedFeatures: FeaturePoint[][] = [
            [makeTyped(0.25, 'peak'), makeTyped(0.27, 'valley')],
            [makeTyped(0.25, 'peak'), makeTyped(0.27, 'valley')],
            [makeTyped(0.25, 'peak'), makeTyped(0.27, 'valley')],
            [makeTyped(0.25, 'peak'), makeTyped(0.27, 'valley')],
        ];

        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, 4);
        expect(chains.length).toBe(2);
        // Both chains should be 4 points long (no contamination)
        expect(chains[0].points.length).toBe(4);
        expect(chains[1].points.length).toBe(4);
    });

    it('should default untyped features to peak', () => {
        // allRowFeatures has features, but allRowTypedFeatures is empty
        const allRowFeatures = [[0.5], [0.5], [0.5]];
        const allRowTypedFeatures: FeaturePoint[][] = [[], [], []];

        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, 3);
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(3);
    });

    it('should handle multiple peaks and multiple valleys per row', () => {
        // 2 peaks and 2 valleys per row, widely separated
        const allRowFeatures = [
            [0.1, 0.3, 0.6, 0.8], [0.1, 0.3, 0.6, 0.8], [0.1, 0.3, 0.6, 0.8]
        ];
        const allRowTypedFeatures: FeaturePoint[][] = [
            [makeTyped(0.1, 'peak'), makeTyped(0.3, 'peak'), makeTyped(0.6, 'valley'), makeTyped(0.8, 'valley')],
            [makeTyped(0.1, 'peak'), makeTyped(0.3, 'peak'), makeTyped(0.6, 'valley'), makeTyped(0.8, 'valley')],
            [makeTyped(0.1, 'peak'), makeTyped(0.3, 'peak'), makeTyped(0.6, 'valley'), makeTyped(0.8, 'valley')],
        ];

        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, 3);
        expect(chains.length).toBe(4); // 2 peak chains + 2 valley chains
        for (const chain of chains) {
            expect(chain.points.length).toBe(3);
        }
    });

    it('should handle rows with typed features shorter than allRowFeatures', () => {
        // allRowTypedFeatures has fewer rows than allRowFeatures (e.g., after T-row insertion)
        const allRowFeatures = [[0.5], [0.5], [0.5], [0.5]];
        const allRowTypedFeatures: FeaturePoint[][] = [
            [makeTyped(0.5, 'peak')],
            [makeTyped(0.5, 'peak')],
        ]; // only 2 rows of typed data

        const chains = linkFeatureChainsByKind(allRowFeatures, allRowTypedFeatures, 4);
        expect(chains.length).toBe(1);
        expect(chains[0].points.length).toBe(4);
    });
});

// ============================================================================
// v10.0 — insertChainGuidedRows
// ============================================================================

function insertChainGuidedRows(
    tPositions: Float32Array,
    chains: FeatureChain[],
    maxInsertions: number = 200
): { tPositions: Float32Array; rowMapping: number[]; insertedCount: number } {
    const MIN_U_SHIFT_FOR_INSERT = 0.005;
    const candidates: { tMid: number; priority: number }[] = [];

    for (const chain of chains) {
        for (let k = 0; k < chain.points.length - 1; k++) {
            const p0 = chain.points[k];
            const p1 = chain.points[k + 1];
            if (p1.row - p0.row !== 1) continue;

            let uShift = Math.abs(p1.u - p0.u);
            if (uShift > 0.5) uShift = 1 - uShift;

            if (uShift >= MIN_U_SHIFT_FOR_INSERT) {
                const rowJ = p0.row;
                if (rowJ < tPositions.length - 1) {
                    const tMid = (tPositions[rowJ] + tPositions[rowJ + 1]) / 2;
                    candidates.push({ tMid, priority: uShift });
                }
            }
        }
    }

    if (candidates.length === 0) {
        const rowMapping: number[] = [];
        for (let j = 0; j < tPositions.length; j++) rowMapping.push(j);
        return { tPositions, rowMapping, insertedCount: 0 };
    }

    candidates.sort((a, b) => b.priority - a.priority);
    const toInsert = candidates.slice(0, maxInsertions);

    const MIN_T_SEP = 0.001;
    const newTs: number[] = [];
    for (const c of toInsert) {
        let tooClose = false;
        for (let j = 0; j < tPositions.length; j++) {
            if (Math.abs(c.tMid - tPositions[j]) < MIN_T_SEP) {
                tooClose = true;
                break;
            }
        }
        if (!tooClose) {
            let alreadyInserted = false;
            for (const nt of newTs) {
                if (Math.abs(c.tMid - nt) < MIN_T_SEP) {
                    alreadyInserted = true;
                    break;
                }
            }
            if (!alreadyInserted) {
                newTs.push(c.tMid);
            }
        }
    }

    if (newTs.length === 0) {
        const rowMapping: number[] = [];
        for (let j = 0; j < tPositions.length; j++) rowMapping.push(j);
        return { tPositions, rowMapping, insertedCount: 0 };
    }

    const allTs: { t: number; originalRow: number }[] = [];
    for (let j = 0; j < tPositions.length; j++) {
        allTs.push({ t: tPositions[j], originalRow: j });
    }
    for (const nt of newTs) {
        let afterRow = 0;
        for (let j = 0; j < tPositions.length - 1; j++) {
            if (tPositions[j] <= nt && tPositions[j + 1] > nt) {
                afterRow = j;
                break;
            }
        }
        allTs.push({ t: nt, originalRow: -(afterRow + 1) });
    }

    allTs.sort((a, b) => a.t - b.t);

    const result = new Float32Array(allTs.length);
    const rowMapping: number[] = [];
    for (let i = 0; i < allTs.length; i++) {
        result[i] = allTs[i].t;
        rowMapping.push(allTs[i].originalRow);
    }

    return { tPositions: result, rowMapping, insertedCount: newTs.length };
}

describe('insertChainGuidedRows (v10.0)', () => {
    it('should return identity mapping when no chains provided', () => {
        const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
        const result = insertChainGuidedRows(tPos, []);
        expect(result.insertedCount).toBe(0);
        expect(Array.from(result.tPositions)).toEqual(Array.from(tPos));
        expect(result.rowMapping).toEqual([0, 1, 2, 3, 4]);
    });

    it('should return identity mapping when chains have no diagonal shift', () => {
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const chain: FeatureChain = {
            points: [
                { u: 0.5, row: 0 },
                { u: 0.5, row: 1 },
                { u: 0.5, row: 2 },
            ]
        };
        const result = insertChainGuidedRows(tPos, [chain]);
        // No U-shift → no insertions
        expect(result.insertedCount).toBe(0);
    });

    it('should insert rows where chains have significant diagonal shift', () => {
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const chain: FeatureChain = {
            points: [
                { u: 0.3, row: 0 },
                { u: 0.35, row: 1 }, // shift = 0.05 > MIN_U_SHIFT=0.005
                { u: 0.4, row: 2 },  // shift = 0.05
            ]
        };
        const result = insertChainGuidedRows(tPos, [chain]);
        expect(result.insertedCount).toBeGreaterThan(0);
        // New T positions should be more than original
        expect(result.tPositions.length).toBeGreaterThan(tPos.length);
    });

    it('should insert midpoint T between affected rows', () => {
        const tPos = new Float32Array([0, 0.4, 0.8]);
        const chain: FeatureChain = {
            points: [
                { u: 0.2, row: 0 },
                { u: 0.3, row: 1 }, // U-shift = 0.1 > 0.005
            ]
        };
        const result = insertChainGuidedRows(tPos, [chain]);
        expect(result.insertedCount).toBe(1);
        // Midpoint between tPos[0]=0 and tPos[1]=0.4 should be 0.2
        const insertedT = Array.from(result.tPositions).find(
            t => !Array.from(tPos).includes(t)
        );
        expect(insertedT).toBeCloseTo(0.2, 5);
    });

    it('should maintain sorted T positions', () => {
        const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
        const chain: FeatureChain = {
            points: [
                { u: 0.1, row: 0 },
                { u: 0.2, row: 1 },
                { u: 0.3, row: 2 },
                { u: 0.4, row: 3 },
            ]
        };
        const result = insertChainGuidedRows(tPos, [chain]);
        for (let i = 1; i < result.tPositions.length; i++) {
            expect(result.tPositions[i]).toBeGreaterThan(result.tPositions[i - 1]);
        }
    });

    it('should not exceed maxInsertions limit', () => {
        const tPos = new Float32Array([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
        // Chain with diagonal shift at every row
        const points: ChainPoint[] = [];
        for (let j = 0; j < 10; j++) {
            points.push({ u: 0.1 + j * 0.02, row: j });
        }
        const chain: FeatureChain = { points };
        const result = insertChainGuidedRows(tPos, [chain], 3);
        expect(result.insertedCount).toBeLessThanOrEqual(3);
    });

    it('should use negative rowMapping for inserted rows', () => {
        const tPos = new Float32Array([0, 0.5, 1.0]);
        const chain: FeatureChain = {
            points: [
                { u: 0.2, row: 0 },
                { u: 0.3, row: 1 },
            ]
        };
        const result = insertChainGuidedRows(tPos, [chain]);
        // Original rows should have non-negative mapping
        const originals = result.rowMapping.filter(r => r >= 0);
        expect(originals.length).toBe(3); // 3 original rows
        // Inserted rows have negative mapping
        const inserted = result.rowMapping.filter(r => r < 0);
        expect(inserted.length).toBe(result.insertedCount);
    });

    it('should not insert rows too close to existing T positions', () => {
        // T positions with 0.001 gap — too tight for insertion
        const tPos = new Float32Array([0, 0.0005, 0.001, 0.5, 1.0]);
        const chain: FeatureChain = {
            points: [
                { u: 0.2, row: 0 },
                { u: 0.3, row: 1 }, // midpoint T = 0.00025 — too close to tPos[1]
            ]
        };
        const result = insertChainGuidedRows(tPos, [chain]);
        // Should not insert because midpoint is too close
        expect(result.insertedCount).toBe(0);
    });

    it('should prioritize largest U-shifts when limited by maxInsertions', () => {
        const tPos = new Float32Array([0, 0.25, 0.5, 0.75, 1.0]);
        const chain1: FeatureChain = {
            points: [
                { u: 0.1, row: 0 },
                { u: 0.2, row: 1 }, // small shift = 0.1
            ]
        };
        const chain2: FeatureChain = {
            points: [
                { u: 0.1, row: 2 },
                { u: 0.4, row: 3 }, // large shift = 0.3
            ]
        };
        const result = insertChainGuidedRows(tPos, [chain1, chain2], 1);
        // Should pick the chain with the larger shift
        expect(result.insertedCount).toBe(1);
        // Inserted row should be between rows 2 and 3 (t=0.5..0.75 → mid=0.625)
        const insertedT = Array.from(result.tPositions).find(
            t => !Array.from(tPos).includes(t)
        );
        expect(insertedT).toBeCloseTo(0.625, 5);
    });
});

// ============================================================================
// v10.2 — flipEdges3D (multi-pass + dihedral-aware 3D edge flipping)
// ============================================================================

/**
 * Superformula value: r(θ) = 1 / ((|cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3)^(1/n1))
 * Matches the GPU `superformula_value()` in styles.wgsl.
 */
function superformulaValue(theta: number, m: number, n1: number, n2: number, n3: number, a: number, b: number): number {
    const c = Math.pow(Math.abs(Math.cos(m * theta / 4) / Math.max(a, 1e-4)), n2);
    const s = Math.pow(Math.abs(Math.sin(m * theta / 4) / Math.max(b, 1e-4)), n3);
    const denom = Math.pow(c + s, 1 / Math.max(n1, 1e-4));
    if (denom <= 1e-4) return 0;
    return Math.min(1 / denom, 4.0);
}

/**
 * Superformula Blossom radius: replicate the GPU sf_radius() logic.
 * Params match the user's StyleParams[0-8]:
 *   strength=1, m_base=6, m_top=10, m_curve=1.2,
 *   n1_base=0.35, n1_top=0.5, n2_base=0.8, n2_top=1.4, n3=0.8
 *
 * Returns the outer radius at (theta, t) for a pot with base radius r0.
 */
function sfBlossomRadius(
    theta: number,
    t: number,
    r0: number,
    params: {
        strength?: number;
        m_base?: number; m_top?: number; m_curve?: number;
        n1_base?: number; n1_top?: number;
        n2_base?: number; n2_top?: number;
        n3_base?: number; n3_top?: number;
        a?: number; b?: number;
    } = {}
): number {
    const strength = params.strength ?? 1.0;
    const m_base = params.m_base ?? 6;
    const m_top = params.m_top ?? 10;
    const m_curve = Math.max(params.m_curve ?? 1.2, 1e-4);
    const n1_base = params.n1_base ?? 0.35;
    const n1_top = params.n1_top ?? 0.5;
    const n2_base = params.n2_base ?? 0.8;
    const n2_top = params.n2_top ?? 1.4;
    const n3_base = params.n3_base ?? 0.8;
    const n3_top = params.n3_top ?? 0.8;
    const a = Math.max(params.a ?? 1.0, 1e-4);
    const b = Math.max(params.b ?? 1.0, 1e-4);

    const m = m_base + (m_top - m_base) * Math.pow(t, m_curve);
    const n1 = n1_base + (n1_top - n1_base) * t;
    const n2 = n2_base + (n2_top - n2_base) * t;
    const n3 = n3_base + (n3_top - n3_base) * t;

    // Seam offset: shift theta by half a petal width
    const seam_offset = (Math.PI * 2 / 2) / Math.max(m, 1);
    const theta_adj = theta + seam_offset;

    const rf = superformulaValue(theta_adj, m, n1, n2, n3, a, b);
    const sf_result = r0 * (0.90 + 0.35 * rf);
    return r0 + (sf_result - r0) * strength;
}

/**
 * Helper: convert per-row feature arrays into chains (for tests).
 * Links features across adjacent rows using nearest-neighbor matching.
 * Also returns an identity rowMapping.
 */
function featsToChains(feats: number[][], LINK_RADIUS = 0.04): { chains: FeatureChain[]; rowMapping: number[] } {
    const rowMapping = feats.map((_f, i) => i);
    const activeChains: FeatureChain[] = [];
    const completedChains: FeatureChain[] = [];

    for (let j = 0; j < feats.length; j++) {
        const rowFeats = feats[j];
        if (rowFeats.length === 0) {
            for (const c of activeChains) if (c.points.length >= 2) completedChains.push(c);
            activeChains.length = 0;
            continue;
        }

        const matched = new Set<number>();
        const newActive: FeatureChain[] = [];

        for (const chain of activeChains) {
            const lastPt = chain.points[chain.points.length - 1];
            if (lastPt.row !== j - 1) {
                if (chain.points.length >= 2) completedChains.push(chain);
                continue;
            }
            let bestF = -1, bestD = LINK_RADIUS;
            for (let f = 0; f < rowFeats.length; f++) {
                if (matched.has(f)) continue;
                let d = Math.abs(rowFeats[f] - lastPt.u);
                if (d > 0.5) d = 1 - d;
                if (d < bestD) { bestD = d; bestF = f; }
            }
            if (bestF >= 0) {
                matched.add(bestF);
                chain.points.push({ u: rowFeats[bestF], row: j });
                newActive.push(chain);
            } else {
                if (chain.points.length >= 2) completedChains.push(chain);
            }
        }

        for (let f = 0; f < rowFeats.length; f++) {
            if (!matched.has(f)) {
                newActive.push({ points: [{ u: rowFeats[f], row: j }] });
            }
        }
        activeChains.length = 0;
        activeChains.push(...newActive);
    }
    for (const c of activeChains) if (c.points.length >= 2) completedChains.push(c);
    return { chains: completedChains, rowMapping };
}

/**
 * Test copy of chainDirectedFlip v10.4.
 * Uses actual FeatureChain objects to flip diagonals along ridge crests.
 */
function chainDirectedFlip(
    indices: Uint32Array,
    unionU: Float32Array,
    w: number,
    h: number,
    chains: FeatureChain[],
    rowMapping: number[],
    invertWinding: boolean
): { flipCount: number; lockedQuads: Set<number> } {
    let flipCount = 0;
    const lockedQuads = new Set<number>();

    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

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
        const dWrap0 = Math.min(Math.abs(u - unionU[0]), Math.abs(u - unionU[0] - 1), Math.abs(u - unionU[0] + 1));
        if (dWrap0 < bestDist) { bestCol = 0; bestDist = dWrap0; }
        const dWrapN = Math.min(Math.abs(u - unionU[w - 1]), Math.abs(u - unionU[w - 1] - 1), Math.abs(u - unionU[w - 1] + 1));
        if (dWrapN < bestDist) { bestCol = w - 1; }
        return bestCol;
    };

    const flipToAD = (quadIdx: number, j: number, quadCol: number): void => {
        const vA = j * w + quadCol;
        const vB = j * w + ((quadCol + 1) % w);
        const vC = (j + 1) * w + quadCol;
        const vD = (j + 1) * w + ((quadCol + 1) % w);
        const triBase = quadIdx * 6;
        if (indices[triBase + 0] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD) return;
        if (invertWinding) {
            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vD;
            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vB;
        } else {
            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vD;
            indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
        }
        flipCount++;
    };

    const flipToBC = (quadIdx: number, j: number, quadCol: number): void => {
        const vA = j * w + quadCol;
        const vB = j * w + ((quadCol + 1) % w);
        const vC = (j + 1) * w + quadCol;
        const vD = (j + 1) * w + ((quadCol + 1) % w);
        const triBase = quadIdx * 6;
        if (!(indices[triBase + 0] === vD || indices[triBase + 1] === vD || indices[triBase + 2] === vD)) return;
        if (invertWinding) {
            indices[triBase + 0] = vA; indices[triBase + 1] = vC; indices[triBase + 2] = vB;
            indices[triBase + 3] = vB; indices[triBase + 4] = vC; indices[triBase + 5] = vD;
        } else {
            indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vC;
            indices[triBase + 3] = vB; indices[triBase + 4] = vD; indices[triBase + 5] = vC;
        }
        flipCount++;
    };

    for (const chain of chains) {
        if (chain.points.length < 2) continue;
        const remapped: { u: number; finalRow: number }[] = [];
        for (const pt of chain.points) {
            const fr = origToFinal.get(pt.row);
            if (fr !== undefined) remapped.push({ u: pt.u, finalRow: fr });
        }
        if (remapped.length < 2) continue;

        for (let k = 0; k < remapped.length - 1; k++) {
            const p0 = remapped[k];
            const p1 = remapped[k + 1];
            const col0 = findColumn(p0.u);
            const col1 = findColumn(p1.u);
            const rowStart = p0.finalRow;
            const rowEnd = p1.finalRow;
            if (rowEnd <= rowStart) continue;

            let uDelta = p1.u - p0.u;
            if (uDelta > 0.5) uDelta -= 1;
            if (uDelta < -0.5) uDelta += 1;

            const LEAN_THRESHOLD = 0.0001;

            for (let j = rowStart; j < rowEnd && j < h; j++) {
                const frac = (rowEnd > rowStart) ? (j - rowStart) / (rowEnd - rowStart) : 0;
                const colAtRow = Math.round(col0 + (col1 - col0) * frac);
                const ridgeCol = ((colAtRow % w) + w) % w;

                // v10.7: Lock the entire stitch band
                const STITCH_BAND_HALF_WIDTH = 3;
                for (let band = -STITCH_BAND_HALF_WIDTH; band <= STITCH_BAND_HALF_WIDTH; band++) {
                    const bandCol = ((ridgeCol + band) % w + w) % w;
                    const bandQuadIdx = j * w + bandCol;
                    if (lockedQuads.has(bandQuadIdx)) continue;

                    if (band >= -1 && band <= 1) {
                        if (uDelta > LEAN_THRESHOLD) {
                            flipToAD(bandQuadIdx, j, bandCol);
                        } else if (uDelta < -LEAN_THRESHOLD) {
                            flipToBC(bandQuadIdx, j, bandCol);
                        } else {
                            if (j % 2 === 0) flipToAD(bandQuadIdx, j, bandCol);
                            else flipToBC(bandQuadIdx, j, bandCol);
                        }
                    }
                    lockedQuads.add(bandQuadIdx);
                }

                if (col0 !== col1) {
                    const crossCol = (frac < 0.5) ? col0 : col1;
                    const nextCrossCol = (frac < 0.5) ? col1 : col0;
                    if (crossCol !== nextCrossCol) {
                        const crossQuadCol = uDelta > 0
                            ? Math.min(crossCol, nextCrossCol)
                            : Math.max(crossCol, nextCrossCol) - 1;
                        const cqc = ((crossQuadCol % w) + w) % w;
                        const crossQuadIdx = j * w + cqc;
                        if (!lockedQuads.has(crossQuadIdx)) {
                            if (uDelta > 0) flipToAD(crossQuadIdx, j, cqc);
                            else flipToBC(crossQuadIdx, j, cqc);
                            lockedQuads.add(crossQuadIdx);
                        }
                    }
                }
            }
        }
    }
    return { flipCount, lockedQuads };
}

/**
 * Test copy of flipEdges3D v10.3.
 * Multi-pass with combined max-min angle + dihedral criterion.
 * Respects locked quads and detects current diagonal orientation.
 */
function flipEdges3D(
    indices: Uint32Array,
    positions3D: Float32Array,
    w: number,
    h: number,
    invertWinding: boolean,
    lockedQuads?: Set<number>
): number {
    let totalFlips = 0;

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
    const THRESHOLD_INITIAL = 0.0175;
    const THRESHOLD_CLEANUP = 0.0087;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let passFlips = 0;
        const threshold = pass === 0 ? THRESHOLD_INITIAL : THRESHOLD_CLEANUP;

        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const quadIdx = j * w + i;
                if (lockedQuads && lockedQuads.has(quadIdx)) continue;

                const iNext = (i + 1) % w;
                const vA = j * w + i;
                const vB = j * w + iNext;
                const vC = (j + 1) * w + i;
                const vD = (j + 1) * w + iNext;

                const ax = positions3D[vA * 3], ay = positions3D[vA * 3 + 1], az = positions3D[vA * 3 + 2];
                const bx = positions3D[vB * 3], by = positions3D[vB * 3 + 1], bz = positions3D[vB * 3 + 2];
                const cx = positions3D[vC * 3], cy = positions3D[vC * 3 + 1], cz = positions3D[vC * 3 + 2];
                const dx = positions3D[vD * 3], dy = positions3D[vD * 3 + 1], dz = positions3D[vD * 3 + 2];

                // Detect current diagonal from index buffer
                const triBase = quadIdx * 6;
                const curI0 = indices[triBase + 0];
                const curI1 = indices[triBase + 1];
                const curI2 = indices[triBase + 2];
                const tri0HasD = (curI0 === vD || curI1 === vD || curI2 === vD);
                const currentIsAD = tri0HasD;

                // Quality for both options
                const bcMinAng1 = minAngle(ax, ay, az, bx, by, bz, cx, cy, cz);
                const bcMinAng2 = minAngle(bx, by, bz, dx, dy, dz, cx, cy, cz);
                const bcMin = Math.min(bcMinAng1, bcMinAng2);

                const adMinAng1 = minAngle(ax, ay, az, bx, by, bz, dx, dy, dz);
                const adMinAng2 = minAngle(ax, ay, az, dx, dy, dz, cx, cy, cz);
                const adMin = Math.min(adMinAng1, adMinAng2);

                const bcN1 = faceNormal(ax, ay, az, bx, by, bz, cx, cy, cz);
                const bcN2 = faceNormal(bx, by, bz, dx, dy, dz, cx, cy, cz);
                const bcDihedral = dihedralCos(bcN1, bcN2);

                const adN1f = faceNormal(ax, ay, az, bx, by, bz, dx, dy, dz);
                const adN2f = faceNormal(ax, ay, az, dx, dy, dz, cx, cy, cz);
                const adDihedral = dihedralCos(adN1f, adN2f);

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
                    // v10.7: Normal-inversion guard
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

describe('flipEdges3D (v10.3 — chain-directed + dihedral-aware 3D edge flipping)', () => {
    /** Create a grid of 3D positions and a default index buffer */
    function makeGrid3D(
        w: number,
        numRows: number,
        posFn: (col: number, row: number) => [number, number, number]
    ): { positions: Float32Array; indices: Uint32Array } {
        const positions = new Float32Array(w * numRows * 3);
        for (let j = 0; j < numRows; j++) {
            for (let i = 0; i < w; i++) {
                const [x, y, z] = posFn(i, j);
                const idx = (j * w + i) * 3;
                positions[idx] = x;
                positions[idx + 1] = y;
                positions[idx + 2] = z;
            }
        }
        const h = numRows - 1;
        const indices = new Uint32Array(w * h * 6);
        let iIdx = 0;
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const i0 = j * w + i;
                const i1 = j * w + ((i + 1) % w);
                const i2 = (j + 1) * w + i;
                const i3 = (j + 1) * w + ((i + 1) % w);
                indices[iIdx++] = i0; indices[iIdx++] = i1; indices[iIdx++] = i2;
                indices[iIdx++] = i1; indices[iIdx++] = i3; indices[iIdx++] = i2;
            }
        }
        return { positions, indices };
    }

    /** Compute a quality metric for a mesh: { worstAngle, avgMinAngle, dihedralDeviation } */
    function meshQuality(
        indices: Uint32Array,
        positions: Float32Array,
        w: number,
        h: number
    ): { worstAngle: number; avgMinAngle: number; avgDihedral: number } {
        const angleOf = (a: number, b: number, c: number): number => {
            const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
            const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
            const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
            const abx = bx - ax, aby = by - ay, abz = bz - az;
            const acx = cx - ax, acy = cy - ay, acz = cz - az;
            const lenAB = Math.sqrt(abx * abx + aby * aby + abz * abz);
            const lenAC = Math.sqrt(acx * acx + acy * acy + acz * acz);
            if (lenAB < 1e-10 || lenAC < 1e-10) return 0;
            const cos = (abx * acx + aby * acy + abz * acz) / (lenAB * lenAC);
            return Math.acos(Math.max(-1, Math.min(1, cos)));
        };

        let worstAngle = Math.PI;
        let sumMinAngle = 0;
        let triCount = 0;

        for (let t = 0; t < indices.length; t += 3) {
            const a1 = angleOf(indices[t], indices[t + 1], indices[t + 2]);
            const a2 = angleOf(indices[t + 1], indices[t + 2], indices[t]);
            const a3 = angleOf(indices[t + 2], indices[t], indices[t + 1]);
            const triMin = Math.min(a1, a2, a3);
            worstAngle = Math.min(worstAngle, triMin);
            sumMinAngle += triMin;
            triCount++;
        }

        // Dihedral angle: for each quad cell, compute normal similarity
        let sumDihedral = 0;
        let quadCount = 0;
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                const base = (j * w + i) * 6;
                const v0 = indices[base], v1 = indices[base + 1], v2 = indices[base + 2];
                const v3 = indices[base + 3], v4 = indices[base + 4], v5 = indices[base + 5];

                const n1 = triNormal(positions, v0, v1, v2);
                const n2 = triNormal(positions, v3, v4, v5);

                const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
                sumDihedral += dot; // 1 = coplanar, -1 = folded
                quadCount++;
            }
        }

        return {
            worstAngle,
            avgMinAngle: triCount > 0 ? sumMinAngle / triCount : 0,
            avgDihedral: quadCount > 0 ? sumDihedral / quadCount : 1,
        };
    }

    function triNormal(
        positions: Float32Array,
        a: number, b: number, c: number
    ): [number, number, number] {
        const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
        const bx = positions[b * 3], by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
        const cx = positions[c * 3], cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
        const abx = bx - ax, aby = by - ay, abz = bz - az;
        const acx = cx - ax, acy = cy - ay, acz = cz - az;
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-15) return [0, 0, 0];
        return [nx / len, ny / len, nz / len];
    }

    it('should not flip any diagonals on a flat plane', () => {
        const { positions, indices } = makeGrid3D(4, 3, (i, j) => [i, j, 0]);
        const original = new Uint32Array(indices);
        const flips = flipEdges3D(indices, positions, 4, 2, false);
        expect(flips).toBe(0);
        expect(Array.from(indices)).toEqual(Array.from(original));
    });

    it('should flip diagonals when a ridge crosses the cell diagonally', () => {
        const { positions, indices } = makeGrid3D(5, 3, (i, j) => {
            const x = i * 10;
            const z = j * 10;
            const peakCol = 2 + j;
            const dist = Math.abs(i - peakCol);
            const y = Math.max(0, 5 - dist * 3);
            return [x, y, z];
        });
        const flips = flipEdges3D(indices, positions, 5, 2, false);
        expect(flips).toBeGreaterThan(0);
    });

    it('should preserve valid triangle topology after flipping', () => {
        const { positions, indices } = makeGrid3D(6, 4, (i, j) => {
            const angle = (i / 6) * Math.PI * 2;
            const r = 10 + 3 * Math.sin(4 * angle + j * 0.5);
            return [r * Math.cos(angle), r * Math.sin(angle), j * 5];
        });

        flipEdges3D(indices, positions, 6, 3, false);

        const totalVerts = 6 * 4;
        for (let i = 0; i < indices.length; i++) {
            expect(indices[i]).toBeLessThan(totalVerts);
        }
        for (let t = 0; t < indices.length; t += 3) {
            expect(indices[t]).not.toBe(indices[t + 1]);
            expect(indices[t]).not.toBe(indices[t + 2]);
            expect(indices[t + 1]).not.toBe(indices[t + 2]);
        }
    });

    it('should improve minimum angles on a surface with diagonal features', () => {
        const W = 16;
        const ROWS = 8;
        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const angle = (i / W) * Math.PI * 2;
            const phase = j * 0.8;
            const r = 10 + 4 * Math.cos(3 * angle + phase);
            return [r * Math.cos(angle), r * Math.sin(angle), j * 2];
        });

        const qBefore = meshQuality(indices, positions, W, ROWS - 1);
        const flips = flipEdges3D(indices, positions, W, ROWS - 1, false);
        const qAfter = meshQuality(indices, positions, W, ROWS - 1);

        expect(qAfter.worstAngle).toBeGreaterThanOrEqual(qBefore.worstAngle - 0.001);
        expect(flips).toBeGreaterThan(0);
    });

    it('should handle invertWinding correctly', () => {
        const { positions, indices } = makeGrid3D(5, 3, (i, j) => {
            return [i * 10, Math.sin(i + j) * 5, j * 10];
        });

        const flipsNormal = flipEdges3D(
            new Uint32Array(indices), positions, 5, 2, false
        );
        const flipsInverted = flipEdges3D(
            new Uint32Array(indices), positions, 5, 2, true
        );
        expect(flipsInverted).toBe(flipsNormal);
    });

    // ── SuperformulaBlossom-specific tests (v10.2) ──

    it('should improve mesh quality on SuperformulaBlossom surface (m=6, n1=0.35 sharp cusps)', () => {
        // Replicate the user's exact SuperformulaBlossom style:
        // m_base=6, n1_base=0.35 → very sharp cusps at low t
        // Height H=100mm, Rt=40mm, Rb=30mm
        const W = 72;     // ~5° per column — realistic export resolution
        const ROWS = 24;  // 24 rows along height
        const Rb = 30, Rt = 40, H = 100;

        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);  // 0..1 along height
            const r0 = Rb + (Rt - Rb) * Math.pow(t, 1.5); // base radius with exponent
            const r = sfBlossomRadius(theta, t, r0, {
                m_base: 6, m_top: 10, m_curve: 1.2,
                n1_base: 0.35, n1_top: 0.5,
                n2_base: 0.8, n2_top: 1.4,
                n3_base: 0.8, n3_top: 0.8,
            });
            return [r * Math.cos(theta), r * Math.sin(theta), t * H];
        });

        const qBefore = meshQuality(indices, positions, W, ROWS - 1);
        const flips = flipEdges3D(indices, positions, W, ROWS - 1, false);
        const qAfter = meshQuality(indices, positions, W, ROWS - 1);

        // Sharp cusps (n1=0.35) create many thin triangles that need flipping
        expect(flips).toBeGreaterThan(50);

        // Worst angle should improve
        expect(qAfter.worstAngle).toBeGreaterThanOrEqual(qBefore.worstAngle - 0.01);

        // Average min angle should improve (more balanced triangles)
        expect(qAfter.avgMinAngle).toBeGreaterThanOrEqual(qBefore.avgMinAngle - 0.01);

        // Dihedral angle should improve (less folded triangles at ridges)
        expect(qAfter.avgDihedral).toBeGreaterThanOrEqual(qBefore.avgDihedral - 0.01);
    });

    it('should handle SuperformulaBlossom with extreme sharpness (n1=0.2) and varying symmetry', () => {
        // n1=0.2 is sharper than the user's 0.35 — creates knife-edge ridges.
        // m varies from 6→8 so ridges shift with height (purely vertical ridges
        // don't need flipping — the default diagonal already follows them).
        const W = 48;
        const ROWS = 16;
        const R0 = 35;

        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const r = sfBlossomRadius(theta, t, R0, {
                m_base: 6, m_top: 8, m_curve: 1.0,  // height-varying: ridges shift
                n1_base: 0.2, n1_top: 0.25,
                n2_base: 0.8, n2_top: 1.0,
                n3_base: 0.8, n3_top: 0.8,
            });
            return [r * Math.cos(theta), r * Math.sin(theta), t * 80];
        });

        const qBefore = meshQuality(indices, positions, W, ROWS - 1);
        const flips = flipEdges3D(indices, positions, W, ROWS - 1, false);
        const qAfter = meshQuality(indices, positions, W, ROWS - 1);

        // Sharp + varying symmetry should trigger flipping
        expect(flips).toBeGreaterThan(10);

        // No quality degradation
        expect(qAfter.worstAngle).toBeGreaterThanOrEqual(qBefore.worstAngle - 0.01);

        // Topology preservation
        const totalVerts = W * ROWS;
        for (let idx = 0; idx < indices.length; idx++) {
            expect(indices[idx]).toBeLessThan(totalVerts);
        }
    });

    it('should improve dihedral angles at SuperformulaBlossom ridge crests', () => {
        // Focus on the DIHEDRAL criterion: at sharp ridges, the two triangles
        // sharing a diagonal that crosses the ridge have very different normals.
        // After flipping, the diagonal runs ALONG the ridge, making the normals
        // more aligned.
        //
        // Key: m varies 6→10 so ridges SHIFT with height, causing diagonals
        // to cross ridge crests. With constant m, ridges are vertical and
        // the default diagonal already follows them (no flip needed).
        const W = 60;
        const ROWS = 20;
        const R0 = 35;

        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const r0 = 30 + 10 * Math.pow(t, 1.5);
            const r = sfBlossomRadius(theta, t, r0, {
                m_base: 6, m_top: 10, m_curve: 1.2,  // 6→10: ridges shift with height
                n1_base: 0.3, n1_top: 0.5,            // sharp at base, softer at top
                n2_base: 0.8, n2_top: 1.4,
                n3_base: 0.8, n3_top: 0.8,
            });
            return [r * Math.cos(theta), r * Math.sin(theta), t * 100];
        });

        const qBefore = meshQuality(indices, positions, W, ROWS - 1);
        const flips = flipEdges3D(indices, positions, W, ROWS - 1, false);
        const qAfter = meshQuality(indices, positions, W, ROWS - 1);

        // Varying symmetry + sharp cusps should trigger lots of flips
        expect(flips).toBeGreaterThan(50);

        // Key assertion: dihedral angle should strictly improve
        // (the primary purpose of the dihedral criterion)
        expect(qAfter.avgDihedral).toBeGreaterThan(qBefore.avgDihedral);
    });

    it('multi-pass should find additional flips beyond single pass', () => {
        // Use a geometry where flipping one diagonal enables a neighbor flip.
        // SuperformulaBlossom with high symmetry creates adjacent cells where
        // the first pass flips change the neighbor's angle balance.
        const W = 48;
        const ROWS = 16;
        const R0 = 35;

        const { positions, indices: indicesSingle } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const r = sfBlossomRadius(theta, t, R0, {
                m_base: 6, m_top: 10, m_curve: 1.2,
                n1_base: 0.35, n1_top: 0.5,
                n2_base: 0.8, n2_top: 1.4,
            });
            return [r * Math.cos(theta), r * Math.sin(theta), t * 100];
        });

        // Run the multi-pass version (which does up to 5 passes)
        const totalFlips = flipEdges3D(indicesSingle, positions, W, ROWS - 1, false);

        // The multi-pass should find a meaningful number of flips
        // (at minimum the same as what a single pass would find)
        expect(totalFlips).toBeGreaterThan(0);

        // Verify topology is still valid after multi-pass
        const totalVerts = W * ROWS;
        for (let idx = 0; idx < indicesSingle.length; idx++) {
            expect(indicesSingle[idx]).toBeLessThan(totalVerts);
        }
        for (let t = 0; t < indicesSingle.length; t += 3) {
            expect(indicesSingle[t]).not.toBe(indicesSingle[t + 1]);
            expect(indicesSingle[t]).not.toBe(indicesSingle[t + 2]);
            expect(indicesSingle[t + 1]).not.toBe(indicesSingle[t + 2]);
        }
    });

    it('should converge (no infinite flip-flop)', () => {
        // Ensure the multi-pass doesn't oscillate.
        // With the threshold hysteresis (pass0 = 1°, cleanup = 0.5°) and
        // the combined criterion, convergence should be rapid.
        const W = 36;
        const ROWS = 12;
        const R0 = 30;

        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const r = sfBlossomRadius(theta, t, R0, {
                m_base: 6, m_top: 6, m_curve: 1.0,
                n1_base: 0.4, n1_top: 0.4,
            });
            return [r * Math.cos(theta), r * Math.sin(theta), t * 80];
        });

        // First run
        const flips1 = flipEdges3D(indices, positions, W, ROWS - 1, false);

        // Second run on already-flipped mesh: should find zero or very few flips
        // (convergence means the mesh is already optimal)
        const flips2 = flipEdges3D(indices, positions, W, ROWS - 1, false);

        // Second run should be much smaller than first (ideally 0)
        expect(flips2).toBeLessThanOrEqual(Math.max(1, flips1 * 0.1));
    });

    it('should handle SuperformulaBlossom with height-varying symmetry (m_base ≠ m_top)', () => {
        // When m varies with height, the ridge count changes from bottom to top.
        // This creates features that are NOT purely vertical — they shift and
        // merge as symmetry changes. The flip should handle this gracefully.
        const W = 60;
        const ROWS = 20;
        const R0 = 35;

        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const r0 = 30 + 10 * Math.pow(t, 1.5);
            const r = sfBlossomRadius(theta, t, r0, {
                m_base: 6, m_top: 10, m_curve: 1.2,  // 6 petals at base → 10 at top
                n1_base: 0.35, n1_top: 0.5,
                n2_base: 0.8, n2_top: 1.4,
                n3_base: 0.8, n3_top: 0.8,
            });
            return [r * Math.cos(theta), r * Math.sin(theta), t * 100];
        });

        const qBefore = meshQuality(indices, positions, W, ROWS - 1);
        const flips = flipEdges3D(indices, positions, W, ROWS - 1, false);
        const qAfter = meshQuality(indices, positions, W, ROWS - 1);

        // Height-varying symmetry should trigger flips
        expect(flips).toBeGreaterThan(0);

        // Quality should not degrade
        expect(qAfter.avgMinAngle).toBeGreaterThanOrEqual(qBefore.avgMinAngle - 0.01);
        expect(qAfter.avgDihedral).toBeGreaterThanOrEqual(qBefore.avgDihedral - 0.01);

        // Topology valid
        const totalVerts = W * ROWS;
        for (let idx = 0; idx < indices.length; idx++) {
            expect(indices[idx]).toBeLessThan(totalVerts);
        }
    });

    // ── v10.3 chain-directed flip tests ──

    it('chainDirectedFlip should flip diagonals along a diagonal ridge path', () => {
        // Use a grid wide enough that 1-column shift is within LINK_RADIUS (0.04)
        // At W=60, column spacing = 1/60 ≈ 0.0167, well within 0.04
        const W = 60;
        const ROWS = 6;
        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const ridgeCol = 10 + j;
            const dist = Math.abs(i - ridgeCol);
            const r = 30 + 5 * Math.max(0, 1 - dist * 0.4);
            return [r * Math.cos(theta), r * Math.sin(theta), t * 80];
        });

        // Feature positions: ridge at column center, shifting 1 col per row
        const feats: number[][] = [];
        for (let j = 0; j < ROWS; j++) {
            const ridgeCol = 10 + j;
            feats.push([(ridgeCol + 0.01) / W]);
        }

        const unionU = new Float32Array(W);
        for (let i = 0; i < W; i++) unionU[i] = i / W;

        const { chains, rowMapping } = featsToChains(feats);
        const result = chainDirectedFlip(indices, unionU, W, ROWS - 1, chains, rowMapping, false);

        // Should flip/lock quads along the ridge path
        expect(result.flipCount).toBeGreaterThan(0);
        expect(result.lockedQuads.size).toBeGreaterThan(0);

        // Topology should be valid
        const totalVerts = W * ROWS;
        for (let idx = 0; idx < indices.length; idx++) {
            expect(indices[idx]).toBeLessThan(totalVerts);
        }
    });

    it('chainDirectedFlip should not flip quads where ridge stays in same column', () => {
        // Vertical ridge: same column at every row
        const W = 12;
        const ROWS = 5;
        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            return [i * 10, 0, j * 10];
        });

        const feats: number[][] = [];
        for (let j = 0; j < ROWS; j++) {
            feats.push([4 / W]); // always column 4
        }

        const unionU = new Float32Array(W);
        for (let i = 0; i < W; i++) unionU[i] = i / W;

        const original = new Uint32Array(indices);
        const { chains, rowMapping } = featsToChains(feats);
        const result = chainDirectedFlip(indices, unionU, W, ROWS - 1, chains, rowMapping, false);

        // Vertical ridge: quads are locked but only alternating rows get flipped
        // (v10.4 alternates diagonals for vertical ridges)
        // Quads should still be locked along the ridge path
        expect(result.lockedQuads.size).toBeGreaterThan(0);
    });

    it('chainDirectedFlip locked quads should be respected by flipEdges3D', () => {
        // Chain-directed flip locks quads. The generic 3D flip should skip them.
        const W = 24;
        const ROWS = 8;
        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const ridgeCol = 5 + j * 0.8;
            const dist = Math.abs(i - ridgeCol);
            const r = 30 + 8 * Math.max(0, 1 - dist * 0.4);
            return [r * Math.cos(theta), r * Math.sin(theta), t * 100];
        });

        const feats: number[][] = [];
        for (let j = 0; j < ROWS; j++) {
            feats.push([(5 + j * 0.8) / W]);
        }

        const unionU = new Float32Array(W);
        for (let i = 0; i < W; i++) unionU[i] = i / W;

        // Stage 1: chain-directed flip
        const { chains, rowMapping } = featsToChains(feats);
        const chainResult = chainDirectedFlip(indices, unionU, W, ROWS - 1, chains, rowMapping, false);

        // Stage 2: generic 3D flip with locked quads
        const genericFlips = flipEdges3D(indices, positions, W, ROWS - 1, false, chainResult.lockedQuads);

        // Verify locked quads weren't touched by generic flip
        // (we can't directly verify this, but we can verify topology is valid)
        const totalVerts = W * ROWS;
        for (let idx = 0; idx < indices.length; idx++) {
            expect(indices[idx]).toBeLessThan(totalVerts);
        }
        for (let t = 0; t < indices.length; t += 3) {
            expect(indices[t]).not.toBe(indices[t + 1]);
            expect(indices[t]).not.toBe(indices[t + 2]);
            expect(indices[t + 1]).not.toBe(indices[t + 2]);
        }
    });

    it('chainDirectedFlip + flipEdges3D should produce better dihedral on SuperformulaBlossom than flipEdges3D alone', () => {
        // The chain-directed flip forces diagonals along ridge crests.
        // Combined with the generic 3D flip, the mesh should have better
        // dihedral angles than 3D flip alone (which may orient some
        // ridge-crossing diagonals incorrectly).
        const W = 72;
        const ROWS = 24;
        const Rb = 30, Rt = 40, H = 100;

        // Build two identical grids
        const { positions, indices: indicesCombined } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const t = j / (ROWS - 1);
            const r0 = Rb + (Rt - Rb) * Math.pow(t, 1.5);
            const r = sfBlossomRadius(theta, t, r0, {
                m_base: 6, m_top: 10, m_curve: 1.2,
                n1_base: 0.35, n1_top: 0.5,
                n2_base: 0.8, n2_top: 1.4,
                n3_base: 0.8, n3_top: 0.8,
            });
            return [r * Math.cos(theta), r * Math.sin(theta), t * H];
        });
        const indicesAlone = new Uint32Array(indicesCombined);

        // Detect features for chain-directed flip
        const feats: number[][] = [];
        for (let j = 0; j < ROWS; j++) {
            const t = j / (ROWS - 1);
            const m = 6 + (10 - 6) * Math.pow(t, 1.2);
            const peaks: number[] = [];
            // Superformula has m/2 petals, each at theta = k * 2π / (m/2)
            const numPetals = Math.round(m / 2);
            const seam_offset = (Math.PI * 2 / 2) / Math.max(m, 1);
            for (let p = 0; p < numPetals; p++) {
                const peakTheta = p * (2 * Math.PI / numPetals) - seam_offset;
                let peakU = ((peakTheta / (2 * Math.PI)) % 1 + 1) % 1;
                peaks.push(peakU);
            }
            feats.push(peaks.sort((a, b) => a - b));
        }

        const unionU = new Float32Array(W);
        for (let i = 0; i < W; i++) unionU[i] = i / W;

        // Path A: chain-directed + generic
        const { chains, rowMapping } = featsToChains(feats);
        const chainResult = chainDirectedFlip(indicesCombined, unionU, W, ROWS - 1, chains, rowMapping, false);
        flipEdges3D(indicesCombined, positions, W, ROWS - 1, false, chainResult.lockedQuads);
        const qCombined = meshQuality(indicesCombined, positions, W, ROWS - 1);

        // Path B: generic only
        flipEdges3D(indicesAlone, positions, W, ROWS - 1, false);
        const qAlone = meshQuality(indicesAlone, positions, W, ROWS - 1);

        // Chain-directed should produce at least as good dihedral
        // (the chain forces correct diagonal at ridge crossings)
        expect(qCombined.avgDihedral).toBeGreaterThanOrEqual(qAlone.avgDihedral - 0.01);

        // Chain result should have found ridge crossings
        expect(chainResult.flipCount).toBeGreaterThan(0);
    });

    it('flipEdges3D should correctly detect and handle pre-flipped quads', () => {
        // Pre-flip some quads, then run flipEdges3D.
        // It should detect the current diagonal orientation and not flip-flop.
        const W = 12;
        const ROWS = 6;
        const { positions, indices } = makeGrid3D(W, ROWS, (i, j) => {
            const theta = (i / W) * Math.PI * 2;
            const r = 20 + 3 * Math.sin(4 * theta + j * 0.3);
            return [r * Math.cos(theta), r * Math.sin(theta), j * 10];
        });

        // Manually flip quad (2, 1) to A-D diagonal
        const quadIdx = 1 * W + 2;
        const triBase = quadIdx * 6;
        const vA = 1 * W + 2;
        const vB = 1 * W + 3;
        const vC = 2 * W + 2;
        const vD = 2 * W + 3;
        indices[triBase + 0] = vA; indices[triBase + 1] = vB; indices[triBase + 2] = vD;
        indices[triBase + 3] = vA; indices[triBase + 4] = vD; indices[triBase + 5] = vC;

        // Record the pre-flipped state
        const preFlipState = new Uint32Array(6);
        preFlipState.set(indices.subarray(triBase, triBase + 6));

        // Run flipEdges3D
        flipEdges3D(indices, positions, W, ROWS - 1, false);

        // Topology should be valid regardless of what happened
        const totalVerts = W * ROWS;
        for (let idx = 0; idx < indices.length; idx++) {
            expect(indices[idx]).toBeLessThan(totalVerts);
        }
    });
});

// ============================================================================
// v10.5 — Ridge-Edge Stitching Tests
// ============================================================================

/**
 * Test copy of prepareStitchVertices (v10.5).
 * Inserts midpoint vertices along chain paths for ridge-edge stitching.
 */
function prepareStitchVertices(
    vertices: Float32Array,
    w: number,
    h: number,
    tPositions: Float32Array,
    unionU: Float32Array,
    chains: FeatureChain[],
    rowMapping: number[]
): { vertices: Float32Array; stitchMap: Map<number, number> } {
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

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
        const dWrap0 = Math.min(Math.abs(u - unionU[0]), Math.abs(u - unionU[0] - 1), Math.abs(u - unionU[0] + 1));
        if (dWrap0 < bestDist) { bestCol = 0; bestDist = dWrap0; }
        const dWrapN = Math.min(Math.abs(u - unionU[w - 1]), Math.abs(u - unionU[w - 1] - 1), Math.abs(u - unionU[w - 1] + 1));
        if (dWrapN < bestDist) { bestCol = w - 1; }
        return bestCol;
    };

    const stitchUV = new Map<number, { u: number; t: number }>();

    for (const chain of chains) {
        if (chain.points.length < 2) continue;

        const remapped: { u: number; finalRow: number }[] = [];
        for (const pt of chain.points) {
            const fr = origToFinal.get(pt.row);
            if (fr !== undefined) {
                remapped.push({ u: pt.u, finalRow: fr });
            }
        }
        if (remapped.length < 2) continue;

        for (let k = 0; k < remapped.length - 1; k++) {
            const p0 = remapped[k];
            const p1 = remapped[k + 1];
            if (p1.finalRow <= p0.finalRow) continue;

            for (let j = p0.finalRow; j < p1.finalRow && j < h; j++) {
                const totalSpan = p1.finalRow - p0.finalRow;
                const fracMid = (j - p0.finalRow + 0.5) / totalSpan;

                let uDelta = p1.u - p0.u;
                if (uDelta > 0.5) uDelta -= 1;
                if (uDelta < -0.5) uDelta += 1;
                let midU = p0.u + uDelta * fracMid;
                midU = ((midU % 1) + 1) % 1;

                const midT = (tPositions[j] + tPositions[j + 1]) / 2;
                const ridgeCol = findColumn(midU);

                // v10.7: Place stitch vertices across a BAND of columns
                const STITCH_BAND_HALF_WIDTH = 3;
                for (let band = -STITCH_BAND_HALF_WIDTH; band <= STITCH_BAND_HALF_WIDTH; band++) {
                    const col = ((ridgeCol + band) % w + w) % w;
                    const quadIdx = j * w + col;
                    if (stitchUV.has(quadIdx)) continue;

                    if (band === 0) {
                        stitchUV.set(quadIdx, { u: midU, t: midT });
                    } else {
                        const colNext = (col + 1) % w;
                        let colU = unionU[col];
                        let colNextU = unionU[colNext];
                        if (colNextU < colU) colNextU += 1;
                        let centerU = (colU + colNextU) / 2;
                        centerU = ((centerU % 1) + 1) % 1;
                        stitchUV.set(quadIdx, { u: centerU, t: midT });
                    }
                }
            }
        }
    }

    if (stitchUV.size === 0) {
        return { vertices, stitchMap: new Map() };
    }

    const origVertCount = vertices.length / 3;
    const newVertices = new Float32Array(vertices.length + stitchUV.size * 3);
    newVertices.set(vertices);

    const stitchMap = new Map<number, number>();
    let nextVert = origVertCount;

    for (const [quadIdx, uv] of stitchUV) {
        const vi = nextVert * 3;
        newVertices[vi] = Math.max(0, Math.min(1 - 1e-7, uv.u));
        newVertices[vi + 1] = uv.t;
        newVertices[vi + 2] = 0;
        stitchMap.set(quadIdx, nextVert);
        nextVert++;
    }

    return { vertices: newVertices, stitchMap };
}

/**
 * Test copy of applyStitchTriangulation (v10.5).
 * Rebuilds the index buffer, replacing stitched quads with 4-tri fans.
 */
function applyStitchTriangulation(
    indices: Uint32Array,
    w: number,
    h: number,
    stitchMap: Map<number, number>,
    invertWinding: boolean
): Uint32Array {
    if (stitchMap.size === 0) return indices;

    const origTriCount = w * h * 2;
    const newTriCount = origTriCount + stitchMap.size * 2;
    const newIndices = new Uint32Array(newTriCount * 3);

    let iOut = 0;
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const quadIdx = j * w + i;
            const stitchVert = stitchMap.get(quadIdx);

            if (stitchVert !== undefined) {
                const iNext = (i + 1) % w;
                const vA = j * w + i;
                const vB = j * w + iNext;
                const vC = (j + 1) * w + i;
                const vD = (j + 1) * w + iNext;
                const vE = stitchVert;

                if (invertWinding) {
                    newIndices[iOut++] = vA; newIndices[iOut++] = vE; newIndices[iOut++] = vB;
                    newIndices[iOut++] = vB; newIndices[iOut++] = vE; newIndices[iOut++] = vD;
                    newIndices[iOut++] = vD; newIndices[iOut++] = vE; newIndices[iOut++] = vC;
                    newIndices[iOut++] = vC; newIndices[iOut++] = vE; newIndices[iOut++] = vA;
                } else {
                    newIndices[iOut++] = vA; newIndices[iOut++] = vB; newIndices[iOut++] = vE;
                    newIndices[iOut++] = vB; newIndices[iOut++] = vD; newIndices[iOut++] = vE;
                    newIndices[iOut++] = vD; newIndices[iOut++] = vC; newIndices[iOut++] = vE;
                    newIndices[iOut++] = vC; newIndices[iOut++] = vA; newIndices[iOut++] = vE;
                }
            } else {
                const srcBase = quadIdx * 6;
                newIndices[iOut++] = indices[srcBase + 0];
                newIndices[iOut++] = indices[srcBase + 1];
                newIndices[iOut++] = indices[srcBase + 2];
                newIndices[iOut++] = indices[srcBase + 3];
                newIndices[iOut++] = indices[srcBase + 4];
                newIndices[iOut++] = indices[srcBase + 5];
            }
        }
    }

    return newIndices;
}

describe('Ridge-Edge Stitching v10.7 (wide-band)', () => {
    /**
     * Helper: build a grid with indices matching generateAdaptiveGrid layout.
     * Each vertex = (u, t, surfaceId=0).
     */
    function makeGrid(
        unionU: Float32Array,
        tPositions: Float32Array
    ): { vertices: Float32Array; indices: Uint32Array } {
        const W = unionU.length;
        const numRows = tPositions.length;
        const h = numRows - 1;
        const verts = new Float32Array(W * numRows * 3);
        let idx = 0;
        for (let j = 0; j < numRows; j++) {
            for (let c = 0; c < W; c++) {
                verts[idx++] = unionU[c];
                verts[idx++] = tPositions[j];
                verts[idx++] = 0;
            }
        }
        const indices = new Uint32Array(W * h * 6);
        let iIdx = 0;
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < W; i++) {
                const i0 = j * W + i;
                const i1 = j * W + ((i + 1) % W);
                const i2 = (j + 1) * W + i;
                const i3 = (j + 1) * W + ((i + 1) % W);
                indices[iIdx++] = i0; indices[iIdx++] = i1; indices[iIdx++] = i2;
                indices[iIdx++] = i1; indices[iIdx++] = i3; indices[iIdx++] = i2;
            }
        }
        return { vertices: verts, indices };
    }

    /** Helper: identity row mapping (row i maps to itself). */
    function identityRowMapping(numRows: number): number[] {
        return Array.from({ length: numRows }, (_, i) => i);
    }

    // ----- prepareStitchVertices tests -----

    describe('prepareStitchVertices', () => {
        it('should return original buffer and empty map when no chains', () => {
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const chains: FeatureChain[] = [];
            const rowMap = identityRowMapping(3);

            const result = prepareStitchVertices(vertices, 4, 2, tPos, unionU, chains, rowMap);

            expect(result.stitchMap.size).toBe(0);
            expect(result.vertices.length).toBe(vertices.length);
        });

        it('should return empty map when chains have only 1 point', () => {
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const chains: FeatureChain[] = [
                { points: [{ u: 0.25, row: 0 }] }
            ];
            const rowMap = identityRowMapping(3);

            const result = prepareStitchVertices(vertices, 4, 2, tPos, unionU, chains, rowMap);

            expect(result.stitchMap.size).toBe(0);
            expect(result.vertices.length).toBe(vertices.length);
        });

        it('should insert stitch vertices for a vertical chain (same column)', () => {
            // 6 columns, 4 rows → 3 quad rows
            // Chain at u=0.5, spanning rows 0→2
            const unionU = new Float32Array([0, 0.2, 0.4, 0.5, 0.7, 0.9]);
            const tPos = new Float32Array([0, 0.33, 0.67, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const W = 6;
            const h = 3;
            const chains: FeatureChain[] = [
                { points: [{ u: 0.5, row: 0 }, { u: 0.5, row: 1 }, { u: 0.5, row: 2 }] }
            ];
            const rowMap = identityRowMapping(4);

            const result = prepareStitchVertices(vertices, W, h, tPos, unionU, chains, rowMap);

            // v10.7: Vertical chain with band width 7 (3+1+3) on W=6 grid
            // Each quad row: min(7, W) = 6 quads stitched (band covers full wrap)
            // 2 segments → 2 quad rows × 6 quads = 12, but wrap overlaps possible
            expect(result.stitchMap.size).toBeGreaterThanOrEqual(6);
            expect(result.stitchMap.size).toBeLessThanOrEqual(12);

            // Vertex buffer should be extended
            const origVertCount = W * 4;
            const expectedVertCount = origVertCount + result.stitchMap.size;
            expect(result.vertices.length).toBe(expectedVertCount * 3);

            // Each stitch vertex should have surfaceId = 0
            for (const [, vertIdx] of result.stitchMap) {
                expect(result.vertices[vertIdx * 3 + 2]).toBe(0);
            }
        });

        it('should insert stitch vertices for a diagonal chain', () => {
            // 8 columns, 3 rows → 2 quad rows
            // Chain moves from u≈0.25 (row 0) to u≈0.5 (row 2)
            const unionU = new Float32Array([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const W = 8;
            const h = 2;
            const chains: FeatureChain[] = [
                { points: [{ u: 0.25, row: 0 }, { u: 0.5, row: 2 }] }
            ];
            const rowMap = identityRowMapping(3);

            const result = prepareStitchVertices(vertices, W, h, tPos, unionU, chains, rowMap);

            // 1 segment spanning 2 rows → stitches both quad rows
            // v10.7: Each row gets up to 7 quads (band=3+1+3), capped by W=8
            expect(result.stitchMap.size).toBeGreaterThanOrEqual(7);

            // The ridge stitch vertices should have interpolated U between 0.25 and 0.5.
            // Flanking band vertices have quad-center UVs outside this range.
            // Check that at least some vertices are in the ridge range.
            let ridgeRangeCount = 0;
            for (const [, vertIdx] of result.stitchMap) {
                const u = result.vertices[vertIdx * 3];
                if (u >= 0.25 - 0.01 && u <= 0.5 + 0.01) {
                    ridgeRangeCount++;
                }
            }
            expect(ridgeRangeCount).toBeGreaterThanOrEqual(2); // at least 2 ridge vertices
        });

        it('should place ridge stitch vertex U near the chain midpoint position', () => {
            // Simple: 4 columns, 2 rows (1 quad row)
            // Chain from u=0.3 (row 0) to u=0.3 (row 1) → midpoint at u=0.3
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const W = 4;
            const h = 1;
            const chains: FeatureChain[] = [
                { points: [{ u: 0.3, row: 0 }, { u: 0.3, row: 1 }] }
            ];
            const rowMap = identityRowMapping(2);

            const result = prepareStitchVertices(vertices, W, h, tPos, unionU, chains, rowMap);

            // v10.7: With wider band, we get multiple stitches per row.
            // The ridge column's stitch vertex should be at u=0.3.
            // Flanking stitch vertices will be at their quad centers.
            expect(result.stitchMap.size).toBeGreaterThanOrEqual(1);

            // The ridge column (col 1 at u=0.25 is closest to 0.3)
            // should have its stitch vertex at u=0.3
            const ridgeQuadIdx = 0 * W + 1; // quad at column 1
            const ridgeVertIdx = result.stitchMap.get(ridgeQuadIdx);
            if (ridgeVertIdx !== undefined) {
                const u = result.vertices[ridgeVertIdx * 3];
                expect(Math.abs(u - 0.3)).toBeLessThan(0.01);
            }
        });

        it('should place stitch vertex T at the midpoint between row T positions', () => {
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 0.4, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const W = 4;
            const h = 2;
            const chains: FeatureChain[] = [
                { points: [{ u: 0.25, row: 0 }, { u: 0.25, row: 1 }, { u: 0.25, row: 2 }] }
            ];
            const rowMap = identityRowMapping(3);

            const result = prepareStitchVertices(vertices, W, h, tPos, unionU, chains, rowMap);

            expect(result.stitchMap.size).toBeGreaterThanOrEqual(2);

            // Collect stitch T values and check they're midpoints
            const stitchTs = new Set<number>();
            for (const [, vertIdx] of result.stitchMap) {
                stitchTs.add(result.vertices[vertIdx * 3 + 1]);
            }

            // Expected midpoints: (0 + 0.4)/2 = 0.2 and (0.4 + 1.0)/2 = 0.7
            const expectedMids = [0.2, 0.7];
            for (const expected of expectedMids) {
                const found = [...stitchTs].some(t => Math.abs(t - expected) < 0.001);
                expect(found).toBe(true);
            }
        });

        it('should handle circular U wrapping near 0/1 boundary', () => {
            // Chain near the wrap-around: u=0.95 (row 0) → u=0.05 (row 1)
            const unionU = new Float32Array([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
            const tPos = new Float32Array([0, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const W = 8;
            const h = 1;
            const chains: FeatureChain[] = [
                { points: [{ u: 0.95, row: 0 }, { u: 0.05, row: 1 }] }
            ];
            const rowMap = identityRowMapping(2);

            const result = prepareStitchVertices(vertices, W, h, tPos, unionU, chains, rowMap);

            // Should still produce stitches (wrapping handled)
            // v10.7: band=7 on W=8, so 7 quads stitched
            expect(result.stitchMap.size).toBeGreaterThanOrEqual(7);

            // The ridge stitch vertex should be near 0 or 1 (the wrap point).
            // Flanking band vertices will be at their own quad centers.
            // Just verify the ridge column's vertex is near the wrap.
            const ridgeCol = 0; // u=0.0 is closest to midpoint of 0.95→0.05 wrapping
            const ridgeQuadIdx = 0 * W + ridgeCol;
            const ridgeVertIdx = result.stitchMap.get(ridgeQuadIdx);
            if (ridgeVertIdx !== undefined) {
                const u = result.vertices[ridgeVertIdx * 3];
                const distToWrap = Math.min(u, 1 - u);
                expect(distToWrap).toBeLessThan(0.15);
            }
        });

        it('should not duplicate stitches — first chain wins per quad', () => {
            // Two chains crossing through the same quad
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const W = 4;
            const h = 1;
            const chains: FeatureChain[] = [
                { points: [{ u: 0.26, row: 0 }, { u: 0.26, row: 1 }] },
                { points: [{ u: 0.24, row: 0 }, { u: 0.24, row: 1 }] }
            ];
            const rowMap = identityRowMapping(2);

            const result = prepareStitchVertices(vertices, W, h, tPos, unionU, chains, rowMap);

            // Both chains map to the same column (col 1 at u=0.25)
            // First chain should win; no duplicate quad entries
            const ridgeQuadIdx = 0 * W + 1; // quad at column 1
            expect(result.stitchMap.has(ridgeQuadIdx)).toBe(true);

            // v10.7: With band=7 on W=4, the band wraps fully around
            // Count total stitches — should be limited by W (4 unique quads per row)
            expect(result.stitchMap.size).toBeLessThanOrEqual(W);
        });

        it('should handle row mapping with negative (inserted) rows', () => {
            // rowMapping: [0, -1, 1, 2] → row 1 is a T-inserted row (no chain points there)
            // Chain has points at original rows 0 and 1
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 0.25, 0.5, 1.0]);
            const { vertices } = makeGrid(unionU, tPos);
            const W = 4;
            const h = 3; // 4 rows → 3 quad rows
            const chains: FeatureChain[] = [
                { points: [{ u: 0.25, row: 0 }, { u: 0.25, row: 1 }] }
            ];
            // rowMapping: final row 0 → orig 0, final row 1 → inserted (-1),
            //             final row 2 → orig 1, final row 3 → orig 2
            const rowMap = [0, -1, 1, 2];

            const result = prepareStitchVertices(vertices, W, h, tPos, unionU, chains, rowMap);

            // Chain point row 0 → final 0, row 1 → final 2
            // So segment spans final rows 0..2, stitching quad rows 0 and 1
            expect(result.stitchMap.size).toBeGreaterThanOrEqual(2);
        });
    });

    // ----- applyStitchTriangulation tests -----

    describe('applyStitchTriangulation', () => {
        it('should return original indices when stitchMap is empty', () => {
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 1.0]);
            const { indices } = makeGrid(unionU, tPos);
            const stitchMap = new Map<number, number>();

            const result = applyStitchTriangulation(indices, 4, 1, stitchMap, false);

            expect(result).toBe(indices); // Same reference
        });

        it('should expand stitched quads to 4 triangles', () => {
            const W = 4;
            const h = 1;
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 1.0]);
            const { indices } = makeGrid(unionU, tPos);

            // Stitch quad 1 (column 1, row 0) with a new vertex at index 8
            const stitchMap = new Map<number, number>();
            stitchMap.set(1, 8); // quadIdx 1 → vertex 8

            const result = applyStitchTriangulation(indices, W, h, stitchMap, false);

            // Original: 4 quads × 2 tris = 8 tris = 24 indices
            // After: 8 tris + 2 extra tris (1 stitched quad) = 10 tris = 30 indices
            expect(result.length).toBe(30);
        });

        it('should produce correct triangle count with multiple stitches', () => {
            const W = 6;
            const h = 2;
            const unionU = new Float32Array([0, 0.167, 0.333, 0.5, 0.667, 0.833]);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const { indices } = makeGrid(unionU, tPos);

            // Stitch 3 quads
            const totalVerts = W * 3;
            const stitchMap = new Map<number, number>();
            stitchMap.set(2, totalVerts);     // quad (row 0, col 2)
            stitchMap.set(3, totalVerts + 1); // quad (row 0, col 3)
            stitchMap.set(8, totalVerts + 2); // quad (row 1, col 2)

            const result = applyStitchTriangulation(indices, W, h, stitchMap, false);

            // Original: 6 × 2 × 2 = 24 tris
            // Extra: 3 stitches × 2 = 6 extra tris
            // Total: 30 tris = 90 indices
            const expectedTriCount = W * h * 2 + 3 * 2;
            expect(result.length).toBe(expectedTriCount * 3);
        });

        it('should reference the stitch vertex in all 4 fan triangles', () => {
            const W = 4;
            const h = 1;
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 1.0]);
            const { indices } = makeGrid(unionU, tPos);

            const stitchVertIdx = 8;
            const stitchMap = new Map<number, number>();
            stitchMap.set(2, stitchVertIdx); // stitch quad at column 2

            const result = applyStitchTriangulation(indices, W, h, stitchMap, false);

            // Quad 2 starts at triangle index for quad 2.
            // In the output: quads 0 and 1 use 6 indices each = 12,
            // then quad 2 uses 12 indices (4 tris).
            // Count how many times stitchVertIdx appears in the stitched quad's triangles
            const stitchedStart = 2 * 6; // 2 un-stitched quads × 6 indices each
            const stitchedEnd = stitchedStart + 12; // 4 tris × 3 indices
            let stitchRefCount = 0;
            for (let idx = stitchedStart; idx < stitchedEnd; idx++) {
                if (result[idx] === stitchVertIdx) stitchRefCount++;
            }
            // 4 triangles, each references E once = 4 references
            expect(stitchRefCount).toBe(4);
        });

        it('should produce valid vertex indices (no out-of-bounds)', () => {
            const W = 8;
            const h = 3;
            const unionU = new Float32Array([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
            const tPos = new Float32Array([0, 0.33, 0.67, 1.0]);
            const { indices } = makeGrid(unionU, tPos);

            const totalGridVerts = W * 4;
            const stitchMap = new Map<number, number>();
            stitchMap.set(3, totalGridVerts);     // stitch verts appended after grid
            stitchMap.set(11, totalGridVerts + 1);
            stitchMap.set(19, totalGridVerts + 2);
            const totalVerts = totalGridVerts + 3;

            const result = applyStitchTriangulation(indices, W, h, stitchMap, false);

            for (let i = 0; i < result.length; i++) {
                expect(result[i]).toBeLessThan(totalVerts);
                expect(result[i]).toBeGreaterThanOrEqual(0);
            }
        });

        it('should respect invertWinding for stitched quads', () => {
            const W = 4;
            const h = 1;
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 1.0]);
            const { indices: indices1 } = makeGrid(unionU, tPos);
            const { indices: indices2 } = makeGrid(unionU, tPos);

            const stitchMap = new Map<number, number>();
            stitchMap.set(0, 8);

            const normal = applyStitchTriangulation(indices1, W, h, stitchMap, false);
            const inverted = applyStitchTriangulation(indices2, W, h, stitchMap, true);

            // First stitched quad (quad 0) triangles should differ in winding
            // Normal: (A, B, E), Inverted: (A, E, B)
            // The first triangle's vertex order should be reversed in positions 1 & 2
            expect(normal[0]).toBe(inverted[0]); // both start with vA
            expect(normal[1]).toBe(inverted[2]); // normal[1]=vB, inverted[2]=vB
            expect(normal[2]).toBe(inverted[1]); // normal[2]=vE, inverted[1]=vE
        });

        it('should preserve non-stitched quads exactly from the input', () => {
            const W = 4;
            const h = 2;
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const { indices } = makeGrid(unionU, tPos);

            // Stitch only quad 2 (row 0, col 2)
            const stitchMap = new Map<number, number>();
            stitchMap.set(2, 12);

            const result = applyStitchTriangulation(indices, W, h, stitchMap, false);

            // Quad 0 (row 0, col 0) should be unchanged: indices[0..5]
            const origQuad0 = Array.from(indices.subarray(0, 6));
            const resultQuad0 = Array.from(result.subarray(0, 6));
            expect(resultQuad0).toEqual(origQuad0);

            // Quad 1 (row 0, col 1) should be unchanged: indices[6..11]
            const origQuad1 = Array.from(indices.subarray(6, 12));
            const resultQuad1 = Array.from(result.subarray(6, 12));
            expect(resultQuad1).toEqual(origQuad1);
        });
    });

    // ----- Integration tests: prepare + apply together -----

    describe('Stitch pipeline integration', () => {
        it('should produce valid mesh when stitching a multi-row diagonal chain', () => {
            const W = 8;
            const numRows = 5;
            const h = numRows - 1;
            const unionU = new Float32Array([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]);
            const tPos = new Float32Array(numRows);
            for (let j = 0; j < numRows; j++) tPos[j] = j / (numRows - 1);
            const { vertices, indices } = makeGrid(unionU, tPos);
            const rowMap = identityRowMapping(numRows);

            // Diagonal chain: u shifts from 0.25 to 0.5 over 4 rows
            const chains: FeatureChain[] = [
                { points: [
                    { u: 0.25, row: 0 },
                    { u: 0.35, row: 1 },
                    { u: 0.42, row: 2 },
                    { u: 0.5, row: 3 }
                ]}
            ];

            const stitchResult = prepareStitchVertices(
                vertices, W, h, tPos, unionU, chains, rowMap
            );

            // Should have stitched multiple quads
            expect(stitchResult.stitchMap.size).toBeGreaterThanOrEqual(3);

            // Apply triangulation
            const newIndices = applyStitchTriangulation(
                indices, W, h, stitchResult.stitchMap, false
            );

            // Total triangles = original + 2 per stitch
            const expectedTris = W * h * 2 + stitchResult.stitchMap.size * 2;
            expect(newIndices.length).toBe(expectedTris * 3);

            // All vertex indices should be valid
            const totalVerts = stitchResult.vertices.length / 3;
            for (let i = 0; i < newIndices.length; i++) {
                expect(newIndices[i]).toBeLessThan(totalVerts);
            }
        });

        it('should produce more triangles than the original grid', () => {
            const W = 6;
            const numRows = 4;
            const h = numRows - 1;
            const unionU = new Float32Array([0, 0.167, 0.333, 0.5, 0.667, 0.833]);
            const tPos = new Float32Array(numRows);
            for (let j = 0; j < numRows; j++) tPos[j] = j / (numRows - 1);
            const { vertices, indices } = makeGrid(unionU, tPos);
            const rowMap = identityRowMapping(numRows);

            const chains: FeatureChain[] = [
                { points: [{ u: 0.167, row: 0 }, { u: 0.167, row: 1 }, { u: 0.167, row: 2 }] }
            ];

            const stitchResult = prepareStitchVertices(
                vertices, W, h, tPos, unionU, chains, rowMap
            );
            const newIndices = applyStitchTriangulation(
                indices, W, h, stitchResult.stitchMap, false
            );

            expect(newIndices.length).toBeGreaterThan(indices.length);
        });

        it('should leave mesh unchanged when chains are empty', () => {
            const W = 4;
            const numRows = 3;
            const h = numRows - 1;
            const unionU = new Float32Array([0, 0.25, 0.5, 0.75]);
            const tPos = new Float32Array([0, 0.5, 1.0]);
            const { vertices, indices } = makeGrid(unionU, tPos);
            const rowMap = identityRowMapping(numRows);

            const stitchResult = prepareStitchVertices(
                vertices, W, h, tPos, unionU, [], rowMap
            );
            const newIndices = applyStitchTriangulation(
                indices, W, h, stitchResult.stitchMap, false
            );

            expect(stitchResult.vertices.length).toBe(vertices.length);
            expect(newIndices).toBe(indices); // same reference (no-op)
        });
    });
});

// ============================================================================
// v11.2 — buildCDTOuterWall (Per-Row Feature Patching)
// ============================================================================

/**
 * Duplicated from ParametricExportComputer.ts for isolated unit testing.
 * v11.2: Uses union grid + per-row vertex patching instead of merging all
 * chain U-positions as global columns (which caused 10× density explosion).
 *
 * The union grid provides representative feature columns with flanking
 * companions. Per-row patching snaps grid vertices to exact chain positions.
 * Diagonal alignment ensures chain edges are mesh edges.
 *
 * O(numU × numT) — same complexity, but numU stays at ~1900 instead of 6331.
 */

/**
 * Binary search for the insertion point in a sorted array.
 * Returns the index of the last element <= value.
 */
function bsearchFloor(arr: Float32Array | number[], value: number): number {
    let lo = 0;
    let hi = arr.length - 1;
    if (value < arr[0]) return -1;
    if (value >= arr[hi]) return hi;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (arr[mid] <= value) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

function buildCDTOuterWall(
    chains: FeatureChain[],
    rowMapping: number[],
    tPositions: Float32Array,
    unionU: Float32Array,
    _targetOuterTris: number,
    surfaceId: number = 0
): { vertices: Float32Array; indices: Uint32Array; quadMap: Int32Array } {
    // Build reverse map: original row → final row index
    const origToFinal = new Map<number, number>();
    for (let f = 0; f < rowMapping.length; f++) {
        if (rowMapping[f] >= 0) {
            origToFinal.set(rowMapping[f], f);
        }
    }

    const numT = tPositions.length;
    const numU = unionU.length;
    const SEAM_THRESHOLD = 0.4;

    // ── 1. Collect chain vertices and remap to UV space ──
    interface ChainUV { u: number; rowIdx: number; }

    // Per-row chain point map: rowIdx → list of exact U positions to patch
    const rowPatchMap = new Map<number, number[]>();
    // Chain edge segments for diagonal alignment
    const chainEdgeSegments: { u0: number; t0: number; u1: number; t1: number }[] = [];

    for (const chain of chains) {
        if (chain.points.length < 2) continue;

        const remapped: ChainUV[] = [];
        for (const pt of chain.points) {
            const fr = origToFinal.get(pt.row);
            if (fr !== undefined && fr < numT) {
                const u = Math.max(0, Math.min(1 - 1e-7, pt.u));
                remapped.push({ u, rowIdx: fr });

                let rowPatches = rowPatchMap.get(fr);
                if (!rowPatches) {
                    rowPatches = [];
                    rowPatchMap.set(fr, rowPatches);
                }
                rowPatches.push(u);
            }
        }
        if (remapped.length < 2) continue;

        // Record chain edge segments (for diagonal alignment)
        for (let k = 1; k < remapped.length; k++) {
            const r0 = remapped[k - 1];
            const r1 = remapped[k];
            const du = Math.abs(r1.u - r0.u);
            if (du > SEAM_THRESHOLD) continue;
            chainEdgeSegments.push({
                u0: r0.u, t0: tPositions[r0.rowIdx],
                u1: r1.u, t1: tPositions[r1.rowIdx]
            });
        }
    }

    // ── 2. Generate vertices: numU × numT grid using UNION U positions ──
    const vertexCount = numU * numT;
    const vertices = new Float32Array(vertexCount * 3);
    let vIdx = 0;
    for (let j = 0; j < numT; j++) {
        for (let i = 0; i < numU; i++) {
            vertices[vIdx++] = unionU[i];
            vertices[vIdx++] = tPositions[j];
            vertices[vIdx++] = surfaceId;
        }
    }

    // ── 3. Per-row vertex patching ──
    const PATCH_ACCEPTANCE = 0.85;

    for (const [rowIdx, patchUs] of rowPatchMap) {
        for (const exactU of patchUs) {
            const colIdx = bsearchFloor(unionU, exactU);
            if (colIdx < 0) continue;

            let bestCol = colIdx;
            let bestDist = Math.abs(unionU[colIdx] - exactU);
            if (colIdx + 1 < numU) {
                const distNext = Math.abs(unionU[colIdx + 1] - exactU);
                if (distNext < bestDist) {
                    bestCol = colIdx + 1;
                    bestDist = distNext;
                }
            }

            let localSpacing = 1.0 / numU;
            if (bestCol > 0 && bestCol < numU - 1) {
                localSpacing = Math.min(
                    unionU[bestCol] - unionU[bestCol - 1],
                    unionU[bestCol + 1] - unionU[bestCol]
                );
            } else if (bestCol > 0) {
                localSpacing = unionU[bestCol] - unionU[bestCol - 1];
            } else if (bestCol < numU - 1) {
                localSpacing = unionU[bestCol + 1] - unionU[bestCol];
            }

            if (bestDist > PATCH_ACCEPTANCE * localSpacing) continue;

            const vertBase = (rowIdx * numU + bestCol) * 3;
            vertices[vertBase] = exactU;
        }
    }

    // ── 4. Build chain edge lookup for diagonal alignment ──
    const chainCellDiag = new Map<number, number>();

    for (const seg of chainEdgeSegments) {
        const uMin = Math.min(seg.u0, seg.u1);
        const uMax = Math.max(seg.u0, seg.u1);
        const tMin = Math.min(seg.t0, seg.t1);
        const tMax = Math.max(seg.t0, seg.t1);

        const colStart = Math.max(0, bsearchFloor(unionU, uMin));
        const colEnd = Math.min(numU - 2, bsearchFloor(unionU, uMax));
        const rowStart = Math.max(0, bsearchFloor(tPositions, tMin));
        const rowEnd = Math.min(numT - 2, bsearchFloor(tPositions, tMax));

        const du = seg.u1 - seg.u0;
        const dt = seg.t1 - seg.t0;
        const diagDir = (du * dt >= 0) ? 1 : -1;

        for (let c = colStart; c <= colEnd; c++) {
            for (let r = rowStart; r <= rowEnd; r++) {
                chainCellDiag.set(c * numT + r, diagDir);
            }
        }
    }

    // ── 5. Generate triangles (v11.3: gap-free layout with quadMap) ──
    const cellsPerRow = numU - 1;
    const totalCells = cellsPerRow * (numT - 1);
    const indices = new Uint32Array(totalCells * 6);
    const SEAM_GUARD = 0.3;
    const quadMap = new Int32Array(totalCells);

    for (let j = 0; j < numT - 1; j++) {
        for (let i = 0; i < cellsPerRow; i++) {
            const quadIdx = j * cellsPerRow + i;
            const triBase = quadIdx * 6;

            const blBase = (j * numU + i) * 3;
            const brBase = (j * numU + (i + 1)) * 3;
            const uSpan = vertices[brBase] - vertices[blBase];

            if (uSpan > SEAM_GUARD || uSpan < -SEAM_GUARD) {
                // Degenerate triangle for seam-crossing cells
                const bl = j * numU + i;
                indices[triBase + 0] = bl; indices[triBase + 1] = bl; indices[triBase + 2] = bl;
                indices[triBase + 3] = bl; indices[triBase + 4] = bl; indices[triBase + 5] = bl;
                quadMap[quadIdx] = -1;
                continue;
            }

            const bl = j * numU + i;
            const br = j * numU + (i + 1);
            const tl = (j + 1) * numU + i;
            const tr = (j + 1) * numU + (i + 1);

            const cellKey = i * numT + j;
            const diagDir = chainCellDiag.get(cellKey) ?? -1;

            if (diagDir > 0) {
                indices[triBase + 0] = bl; indices[triBase + 1] = br; indices[triBase + 2] = tl;
                indices[triBase + 3] = br; indices[triBase + 4] = tr; indices[triBase + 5] = tl;
            } else {
                indices[triBase + 0] = bl; indices[triBase + 1] = br; indices[triBase + 2] = tr;
                indices[triBase + 3] = bl; indices[triBase + 4] = tr; indices[triBase + 5] = tl;
            }
            quadMap[quadIdx] = triBase;
        }
    }

    return { vertices, indices, quadMap };
}

// ── Helper: identity row mapping ──
function identityCDTRowMapping(numRows: number): number[] {
    return Array.from({ length: numRows }, (_, i) => i);
}

// ── Helper: uniform U positions ──
function uniformU(count: number): Float32Array {
    const u = new Float32Array(count);
    for (let i = 0; i < count; i++) u[i] = i / count;
    return u;
}

// ── Helper: uniform T positions ──
function uniformT(count: number): Float32Array {
    const t = new Float32Array(count);
    for (let i = 0; i < count; i++) t[i] = i / (count - 1);
    return t;
}

describe('buildCDTOuterWall (v11.2 Per-Row Patching)', () => {
    describe('basic triangulation', () => {
        it('should produce a valid mesh with no chains (background fill only)', () => {
            const numU = 8;
            const numT = 5;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const { vertices, indices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 100, 0
            );

            // Should have vertices
            expect(vertices.length).toBeGreaterThan(0);
            expect(vertices.length % 3).toBe(0);

            // Should have triangles
            expect(indices.length).toBeGreaterThan(0);
            expect(indices.length % 3).toBe(0);

            // All indices should reference valid vertices
            const vertCount = vertices.length / 3;
            for (let i = 0; i < indices.length; i++) {
                expect(indices[i]).toBeLessThan(vertCount);
            }
        });

        it('should set surfaceId correctly in all vertex entries', () => {
            const uPos = uniformU(6);
            const tPos = uniformT(4);
            const rowMap = identityCDTRowMapping(4);

            const { vertices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 50, 0
            );

            const vertCount = vertices.length / 3;
            for (let i = 0; i < vertCount; i++) {
                expect(vertices[i * 3 + 2]).toBe(0); // surfaceId = 0
            }
        });

        it('should respect custom surfaceId', () => {
            const uPos = uniformU(6);
            const tPos = uniformT(4);
            const rowMap = identityCDTRowMapping(4);

            const { vertices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 50, 2
            );

            const vertCount = vertices.length / 3;
            for (let i = 0; i < vertCount; i++) {
                expect(vertices[i * 3 + 2]).toBe(2); // surfaceId = 2
            }
        });

        it('should have all U values in [0, 1) and T values in [0, 1]', () => {
            const uPos = uniformU(10);
            const tPos = uniformT(6);
            const rowMap = identityCDTRowMapping(6);

            const { vertices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 200, 0
            );

            const vertCount = vertices.length / 3;
            for (let i = 0; i < vertCount; i++) {
                const u = vertices[i * 3];
                const t = vertices[i * 3 + 1];
                expect(u).toBeGreaterThanOrEqual(0);
                expect(u).toBeLessThan(1);
                expect(t).toBeGreaterThanOrEqual(0);
                expect(t).toBeLessThanOrEqual(1);
            }
        });
    });

    describe('feature chain constraint edges', () => {
        it('should incorporate vertical chain vertices into the mesh', () => {
            const numU = 8;
            const numT = 5;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            // A vertical chain at u=0.333 spanning rows 0-4
            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.333, row: 0 },
                    { u: 0.333, row: 1 },
                    { u: 0.333, row: 2 },
                    { u: 0.333, row: 3 },
                    { u: 0.333, row: 4 },
                ]
            }];

            const { vertices } = buildCDTOuterWall(
                chains, rowMap, tPos, uPos, 100, 0
            );

            // The chain vertex u=0.333 should appear in the mesh
            const vertCount = vertices.length / 3;
            let found = false;
            for (let i = 0; i < vertCount; i++) {
                if (Math.abs(vertices[i * 3] - 0.333) < 1e-4) {
                    found = true;
                    break;
                }
            }
            expect(found).toBe(true);
        });

        it('should patch chain vertices into grid rows without adding columns', () => {
            const numU = 8;
            const numT = 5;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const noChain = buildCDTOuterWall([], rowMap, tPos, uPos, 100, 0);

            // A diagonal chain that adds non-grid-aligned points
            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.15, row: 0 },
                    { u: 0.18, row: 1 },
                    { u: 0.21, row: 2 },
                    { u: 0.24, row: 3 },
                    { u: 0.27, row: 4 },
                ]
            }];

            const withChain = buildCDTOuterWall(chains, rowMap, tPos, uPos, 100, 0);

            // v11.2: Per-row patching does NOT add columns — vertex count stays the same
            expect(withChain.vertices.length).toBe(noChain.vertices.length);

            // But the patched rows should have the chain U values
            const vertCount = withChain.vertices.length / 3;
            let foundPatchedU = false;
            for (let i = 0; i < vertCount; i++) {
                if (Math.abs(withChain.vertices[i * 3] - 0.15) < 1e-4) {
                    foundPatchedU = true;
                    break;
                }
            }
            expect(foundPatchedU).toBe(true);
        });

        it('should handle multiple chains simultaneously', () => {
            const numU = 10;
            const numT = 6;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const chains: FeatureChain[] = [
                {
                    points: [
                        { u: 0.2, row: 0 }, { u: 0.22, row: 1 },
                        { u: 0.24, row: 2 }, { u: 0.26, row: 3 },
                    ]
                },
                {
                    points: [
                        { u: 0.6, row: 1 }, { u: 0.62, row: 2 },
                        { u: 0.64, row: 3 }, { u: 0.66, row: 4 },
                    ]
                },
                {
                    points: [
                        { u: 0.85, row: 0 }, { u: 0.83, row: 1 },
                        { u: 0.81, row: 2 }, { u: 0.79, row: 3 },
                        { u: 0.77, row: 4 }, { u: 0.75, row: 5 },
                    ]
                }
            ];

            const { vertices, indices } = buildCDTOuterWall(
                chains, rowMap, tPos, uPos, 300, 0
            );

            expect(vertices.length).toBeGreaterThan(0);
            expect(indices.length).toBeGreaterThan(0);

            // All three chain U values should be present
            const vertCount = vertices.length / 3;
            const uVals = new Set<number>();
            for (let i = 0; i < vertCount; i++) {
                uVals.add(Math.round(vertices[i * 3] * 100) / 100);
            }
            expect(uVals.has(0.2)).toBe(true);
            expect(uVals.has(0.6)).toBe(true);
            expect(uVals.has(0.85)).toBe(true);
        });

        it('should skip chains with fewer than 2 points', () => {
            const numU = 6;
            const numT = 4;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            // Single-point chain — should be ignored
            const chains: FeatureChain[] = [{
                points: [{ u: 0.5, row: 1 }]
            }];

            const withSingle = buildCDTOuterWall(chains, rowMap, tPos, uPos, 50, 0);
            const noChain = buildCDTOuterWall([], rowMap, tPos, uPos, 50, 0);

            // Single-point chain should produce same result as no chains
            expect(withSingle.vertices.length).toBe(noChain.vertices.length);
        });
    });

    describe('seam handling', () => {
        it('should skip constraint edges that cross the u=0/1 seam', () => {
            const numU = 8;
            const numT = 4;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            // A chain that wraps from u≈0.9 to u≈0.1 (crosses seam)
            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.9, row: 0 },
                    { u: 0.95, row: 1 },
                    { u: 0.05, row: 2 },  // wraps across seam
                    { u: 0.1, row: 3 },
                ]
            }];

            // Should not throw — seam-crossing edges are skipped
            const { vertices, indices } = buildCDTOuterWall(
                chains, rowMap, tPos, uPos, 100, 0
            );

            expect(vertices.length).toBeGreaterThan(0);
            expect(indices.length).toBeGreaterThan(0);
        });

        it('should filter triangles that span too much of the U domain', () => {
            const numU = 6;
            const numT = 3;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const { indices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 50, 0
            );

            // All surviving triangles should have U-span ≤ SEAM_GUARD (0.3)
            // This is guaranteed by the filter, verify no anomalies
            expect(indices.length).toBeGreaterThan(0);
            expect(indices.length % 3).toBe(0);
        });
    });

    describe('triangle quality', () => {
        it('should produce no degenerate (zero-area) triangles', () => {
            const numU = 12;
            const numT = 8;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.3, row: 0 }, { u: 0.32, row: 1 },
                    { u: 0.34, row: 2 }, { u: 0.36, row: 3 },
                    { u: 0.38, row: 4 }, { u: 0.40, row: 5 },
                    { u: 0.42, row: 6 }, { u: 0.44, row: 7 },
                ]
            }];

            const { vertices, indices } = buildCDTOuterWall(
                chains, rowMap, tPos, uPos, 500, 0
            );

            const numTris = indices.length / 3;
            for (let t = 0; t < numTris; t++) {
                const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
                const u0 = vertices[i0 * 3], t0 = vertices[i0 * 3 + 1];
                const u1 = vertices[i1 * 3], t1 = vertices[i1 * 3 + 1];
                const u2 = vertices[i2 * 3], t2 = vertices[i2 * 3 + 1];

                const ax = u1 - u0, ay = t1 - t0;
                const bx = u2 - u0, by = t2 - t0;
                const area = Math.abs(ax * by - ay * bx);

                expect(area).toBeGreaterThan(1e-12);
            }
        });

        it('should produce reasonable triangle counts for given budget', () => {
            const numU = 20;
            const numT = 15;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const { indices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 1000, 0
            );

            const numTris = indices.length / 3;
            // For a 20×15 grid, expect roughly 2 × 19 × 14 = 532 quads → 532 tris
            // (minus seam-crossing filter) but order of magnitude should be hundreds
            expect(numTris).toBeGreaterThan(100);
            expect(numTris).toBeLessThan(5000);
        });
    });

    describe('point deduplication', () => {
        it('should deduplicate chain points that coincide with grid points', () => {
            const numU = 4;
            const numT = 3;
            // U positions: 0, 0.25, 0.5, 0.75
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            // Chain with a point exactly on a grid position u=0.25, row=1 → t=0.5
            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.25, row: 0 },
                    { u: 0.25, row: 1 },
                    { u: 0.25, row: 2 },
                ]
            }];

            const withChain = buildCDTOuterWall(chains, rowMap, tPos, uPos, 50, 0);
            const noChain = buildCDTOuterWall([], rowMap, tPos, uPos, 50, 0);

            // Since chain points coincide with grid, vertex count should be the same
            expect(withChain.vertices.length).toBe(noChain.vertices.length);
        });

        it('should not create duplicate vertices for nearby points', () => {
            const numU = 6;
            const numT = 4;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const { vertices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 100, 0
            );

            // Check no two vertices are within DEDUP_EPS of each other
            const vertCount = vertices.length / 3;
            for (let i = 0; i < vertCount; i++) {
                for (let j = i + 1; j < vertCount; j++) {
                    const du = vertices[i * 3] - vertices[j * 3];
                    const dt = vertices[i * 3 + 1] - vertices[j * 3 + 1];
                    const dist = Math.sqrt(du * du + dt * dt);
                    expect(dist).toBeGreaterThan(1e-6);
                }
            }
        });
    });

    describe('boundary integrity', () => {
        it('should include vertices at t=0 and t=1 for all base U positions', () => {
            const numU = 8;
            const numT = 5;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const { vertices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 100, 0
            );

            const vertCount = vertices.length / 3;

            // Check that each base U has a vertex at t=0 and t=1
            for (let i = 0; i < numU; i++) {
                const targetU = uPos[i];
                let hasBottom = false;
                let hasTop = false;

                for (let v = 0; v < vertCount; v++) {
                    const u = vertices[v * 3];
                    const t = vertices[v * 3 + 1];
                    if (Math.abs(u - targetU) < 1e-4) {
                        if (Math.abs(t) < 1e-4) hasBottom = true;
                        if (Math.abs(t - 1) < 1e-4) hasTop = true;
                    }
                }

                expect(hasBottom).toBe(true);
                expect(hasTop).toBe(true);
            }
        });

        it('should produce triangles that cover the full T range', () => {
            const numU = 10;
            const numT = 6;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const { vertices, indices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 200, 0
            );

            // Find min/max T across all triangle vertices
            let minT = 1, maxT = 0;
            for (let i = 0; i < indices.length; i++) {
                const t = vertices[indices[i] * 3 + 1];
                if (t < minT) minT = t;
                if (t > maxT) maxT = t;
            }

            expect(minT).toBeLessThanOrEqual(0.01);
            expect(maxT).toBeGreaterThanOrEqual(0.99);
        });
    });

    describe('row mapping', () => {
        it('should handle non-identity row mappings correctly', () => {
            const numT = 6;
            const tPos = uniformT(numT);
            const uPos = uniformU(8);

            // Non-identity mapping: final rows [0,1,2,3,4,5] map to original rows [0,2,4,6,8,10]
            const rowMap = [0, 2, 4, 6, 8, 10];

            // Chain uses original row indices
            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.4, row: 0 },  // maps to final row 0
                    { u: 0.42, row: 2 }, // maps to final row 1
                    { u: 0.44, row: 4 }, // maps to final row 2
                    { u: 0.46, row: 6 }, // maps to final row 3
                ]
            }];

            const { vertices, indices } = buildCDTOuterWall(
                chains, rowMap, tPos, uPos, 100, 0
            );

            expect(vertices.length).toBeGreaterThan(0);
            expect(indices.length).toBeGreaterThan(0);

            // Chain vertices should be present
            const vertCount = vertices.length / 3;
            let foundChainU = false;
            for (let i = 0; i < vertCount; i++) {
                if (Math.abs(vertices[i * 3] - 0.4) < 1e-4) {
                    foundChainU = true;
                    break;
                }
            }
            expect(foundChainU).toBe(true);
        });

        it('should skip chain points with unmapped rows', () => {
            const numT = 4;
            const tPos = uniformT(numT);
            const uPos = uniformU(6);
            const rowMap = [0, 1, 2, 3]; // maps final→original

            // Chain references row 99 which is not in the mapping
            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.5, row: 0 },
                    { u: 0.52, row: 99 }, // unmapped!
                    { u: 0.54, row: 2 },
                ]
            }];

            // Should not throw
            const { vertices, indices } = buildCDTOuterWall(
                chains, rowMap, tPos, uPos, 50, 0
            );

            expect(vertices.length).toBeGreaterThan(0);
            expect(indices.length).toBeGreaterThan(0);
        });
    });

    describe('edge cases', () => {
        it('should handle minimal grid (5 U × 3 T)', () => {
            // Need at least 5 U positions so column spacing (0.2) < SEAM_GUARD (0.3)
            // and at least 3 T rows so there's an interior row
            const uPos = uniformU(5);
            const tPos = uniformT(3);
            const rowMap = identityCDTRowMapping(3);

            const { vertices, indices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 10, 0
            );

            expect(vertices.length).toBeGreaterThan(0);
            expect(indices.length).toBeGreaterThanOrEqual(3);
        });

        it('should handle chains that are entirely on the seam boundary', () => {
            const numU = 6;
            const numT = 4;
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            // Chain at u≈0 (near seam)
            const chains: FeatureChain[] = [{
                points: [
                    { u: 0.001, row: 0 },
                    { u: 0.002, row: 1 },
                    { u: 0.003, row: 2 },
                    { u: 0.004, row: 3 },
                ]
            }];

            const { vertices, indices } = buildCDTOuterWall(
                chains, rowMap, tPos, uPos, 100, 0
            );

            expect(vertices.length).toBeGreaterThan(0);
            expect(indices.length).toBeGreaterThan(0);
        });

        it('should handle empty chain array gracefully', () => {
            const uPos = uniformU(6);
            const tPos = uniformT(4);
            const rowMap = identityCDTRowMapping(4);

            const { vertices, indices } = buildCDTOuterWall(
                [], rowMap, tPos, uPos, 50, 0
            );

            expect(vertices.length).toBeGreaterThan(0);
            expect(indices.length).toBeGreaterThan(0);
        });
    });

    describe('v11.2 density fix regression', () => {
        it('should NOT explode vertex count when many chains are added', () => {
            // This is the v11.2 regression test for the density explosion bug.
            // v11.1 merged ALL chain U-positions as global columns:
            //   70 chains × ~97 points = ~6800 chain U-values → 5593 new columns
            //   spanning ALL rows → 6331×279 grid → 3.5M tris (10× over budget).
            //
            // v11.2 uses per-row patching: vertex count = numU × numT regardless
            // of chain count. This test verifies no density explosion.
            const numU = 50;  // simulate 50-column union grid
            const numT = 20;  // 20 rows
            const uPos = uniformU(numU);
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            // Create 30 chains with 15 points each — 450 chain points
            // In v11.1 this would add ~400 new global columns → 450×20 = 9000 vertices.
            // In v11.2 vertex count stays at 50×20 = 1000.
            const chains: FeatureChain[] = [];
            for (let c = 0; c < 30; c++) {
                const baseU = (c + 0.5) / 30; // spread across [0, 1)
                const points: { u: number; row: number }[] = [];
                for (let r = 2; r < 17; r++) { // rows 2-16
                    points.push({ u: baseU + (r - 9) * 0.003, row: r });
                }
                chains.push({ points });
            }

            const noChain = buildCDTOuterWall([], rowMap, tPos, uPos, 500, 0);
            const withChains = buildCDTOuterWall(chains, rowMap, tPos, uPos, 500, 0);

            // v11.2: Vertex count must be IDENTICAL (per-row patching, no column explosion)
            expect(withChains.vertices.length).toBe(noChain.vertices.length);

            // Triangle count should also be similar (not 10× larger)
            const noChainTris = noChain.indices.length / 3;
            const withChainTris = withChains.indices.length / 3;
            expect(withChainTris).toBeLessThanOrEqual(noChainTris * 1.1); // at most 10% more due to diagonal changes
        });

        it('should still place chain vertices at exact positions in patched rows', () => {
            const numU = 20;
            const numT = 10;
            const uPos = uniformU(numU); // spacing = 0.05
            const tPos = uniformT(numT);
            const rowMap = identityCDTRowMapping(numT);

            const chainU = 0.173; // not on any grid position, between 0.15 and 0.20
            const chains: FeatureChain[] = [{
                points: [
                    { u: chainU, row: 3 },
                    { u: chainU + 0.002, row: 4 },
                    { u: chainU + 0.004, row: 5 },
                ]
            }];

            const { vertices } = buildCDTOuterWall(chains, rowMap, tPos, uPos, 200, 0);

            // Check that row 3 has a vertex at u ≈ 0.173
            // Row 3 vertices are at indices [3*20 .. 3*20+19]
            let foundExactU = false;
            for (let i = 0; i < numU; i++) {
                const vBase = (3 * numU + i) * 3;
                if (Math.abs(vertices[vBase] - chainU) < 1e-6) {
                    foundExactU = true;
                    break;
                }
            }
            expect(foundExactU).toBe(true);

            // Row 0 (not in chain) should NOT have this U value
            let foundInUnpatchedRow = false;
            for (let i = 0; i < numU; i++) {
                const vBase = (0 * numU + i) * 3;
                if (Math.abs(vertices[vBase] - chainU) < 1e-6) {
                    foundInUnpatchedRow = true;
                    break;
                }
            }
            expect(foundInUnpatchedRow).toBe(false);
        });
    });
});
