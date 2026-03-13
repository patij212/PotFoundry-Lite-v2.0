/**
 * parametric/CurvatureSampler.ts — GPU curvature sampling + CPU analysis.
 *
 * Phase 1 of the parametric pipeline: samples the surface along multiple
 * T-strips (at different U positions) and U-strips (at different T positions),
 * computes second-derivative curvature, and returns normalized profiles.
 *
 * The multi-strip approach (16 strips per direction) ensures features are
 * detected regardless of their angular/height position — we take the
 * element-wise MAX across all strips.
 */

import type { SurfaceEvaluator } from './SurfaceEvaluator';
import { CURVATURE_SAMPLES, NUM_STRIPS } from './types';

export interface CurvatureProfiles {
    /** Normalized T-curvature profile [0,1], length = CURVATURE_SAMPLES */
    tCurvature: Float32Array;
    /** Normalized U-curvature profile [0,1], length = CURVATURE_SAMPLES */
    uCurvature: Float32Array;
    /** Raw (unnormalized) T-curvature per strip */
    tRawPerStrip: Float32Array[];
    /** Raw (unnormalized) U-curvature per strip */
    uRawPerStrip: Float32Array[];
    /** 3D positions from the best T-strip (for gradient zero-crossing detection) */
    bestTStripPositions: Float32Array;
    /** 3D positions from the best U-strip */
    bestUStripPositions: Float32Array;
    /** All sample positions (for reuse in feature detection) */
    allSamplePositions: Float32Array;
    /** Timing */
    timeMs: number;
}

/**
 * Sample curvature across the surface using GPU evaluation.
 *
 * Dispatches NUM_STRIPS T-strips and NUM_STRIPS U-strips in a single
 * GPU batch (2 × 16 × 4096 = 131072 samples), then computes curvature
 * from the returned 3D positions.
 */
export async function sampleCurvature(
    evaluator: SurfaceEvaluator,
): Promise<CurvatureProfiles> {
    const start = performance.now();
    const N = CURVATURE_SAMPLES;
    const S = NUM_STRIPS;
    const totalSamples = S * N * 2;

    // Build UV sample points: S T-strips + S U-strips
    const sampleVertices = new Float32Array(totalSamples * 3);
    let writeIdx = 0;

    // T-strips: vary T from 0 to 1 at S different U positions
    for (let s = 0; s < S; s++) {
        const uVal = s / S;
        for (let i = 0; i < N; i++) {
            sampleVertices[writeIdx++] = uVal;
            sampleVertices[writeIdx++] = i / (N - 1); // t ∈ [0, 1]
            sampleVertices[writeIdx++] = 0;            // surface_id = 0 (outer wall)
        }
    }

    // U-strips: vary U from 0 to 1 at S different T positions
    for (let s = 0; s < S; s++) {
        const tVal = (s + 0.5) / S;
        for (let i = 0; i < N; i++) {
            sampleVertices[writeIdx++] = i / N; // u ∈ [0, 1) periodic
            sampleVertices[writeIdx++] = tVal;
            sampleVertices[writeIdx++] = 0;
        }
    }

    // Single GPU dispatch for all strips
    const allPositions = await evaluator.evaluateBatch(sampleVertices);

    // Compute curvature per strip, then take element-wise MAX
    const tRawPerStrip: Float32Array[] = [];
    const uRawPerStrip: Float32Array[] = [];

    for (let s = 0; s < S; s++) {
        const offset = s * N * 3;
        tRawPerStrip.push(computeRawCurvature(allPositions.subarray(offset, offset + N * 3), N));
    }

    for (let s = 0; s < S; s++) {
        const offset = (S + s) * N * 3;
        uRawPerStrip.push(computeRawCurvature(allPositions.subarray(offset, offset + N * 3), N));
    }

    // Element-wise MAX aggregation
    const tMaxCurvature = maxAcrossStrips(tRawPerStrip, N);
    const uMaxCurvature = maxAcrossStrips(uRawPerStrip, N);

    // Normalize after aggregation
    const tCurvature = normalizeProfile(tMaxCurvature);
    const uCurvature = normalizeProfile(uMaxCurvature);

    // Find best strips (highest total curvature) for gradient analysis
    const bestTStripIdx = findBestStrip(tRawPerStrip, N);
    const bestUStripIdx = findBestStrip(uRawPerStrip, N);

    const bestTStripPositions = allPositions.subarray(
        bestTStripIdx * N * 3,
        (bestTStripIdx + 1) * N * 3,
    );
    const bestUStripPositions = allPositions.subarray(
        (S + bestUStripIdx) * N * 3,
        (S + bestUStripIdx + 1) * N * 3,
    );

    const timeMs = performance.now() - start;
    console.log(`[CurvatureSampler] ${timeMs.toFixed(1)}ms (${S} strips × ${N} samples)`);

    return {
        tCurvature,
        uCurvature,
        tRawPerStrip,
        uRawPerStrip,
        bestTStripPositions,
        bestUStripPositions,
        allSamplePositions: allPositions,
        timeMs,
    };
}

// ============================================================================
// Curvature Math (extracted verbatim from ParametricExportComputer.ts)
// ============================================================================

/**
 * Compute RAW (unnormalized) curvature from 3D positions along a parameter.
 * Returns absolute second-derivative magnitudes.
 */
export function computeRawCurvature(positions: Float32Array, numSamples: number): Float32Array {
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

/**
 * Normalize a curvature profile to [0, 1] using percentile scaling.
 * Uses 5th/95th percentile to be robust against outliers.
 */
export function normalizeProfile(curvature: Float32Array): Float32Array {
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
    // else: all curvatures similar → keep zeros → uniform grid (correct)

    return result;
}

function maxAcrossStrips(strips: Float32Array[], n: number): Float32Array {
    const result = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        let maxVal = 0;
        for (const strip of strips) {
            if (strip[i] > maxVal) maxVal = strip[i];
        }
        result[i] = maxVal;
    }
    return result;
}

function findBestStrip(strips: Float32Array[], n: number): number {
    let bestIdx = 0;
    let bestSum = 0;
    for (let s = 0; s < strips.length; s++) {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += strips[s][i];
        if (sum > bestSum) { bestSum = sum; bestIdx = s; }
    }
    return bestIdx;
}
