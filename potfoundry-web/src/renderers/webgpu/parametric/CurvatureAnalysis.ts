/**
 * CurvatureAnalysis — Pure math functions for computing, normalizing,
 * and smoothing curvature profiles from 3D position data.
 *
 * Extracted from ParametricExportComputer.ts (lines 163-226).
 * These are stateless utility functions with no GPU or DOM dependencies.
 */

/**
 * Compute RAW (unnormalized) curvature from 3D positions along a parameter.
 * Uses absolute second-derivative magnitudes via central differences.
 *
 * @param positions - Interleaved xyz Float32Array (length = numSamples * 3)
 * @param numSamples - Number of sample points
 * @returns Float32Array of curvature magnitudes (length = numSamples)
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
 * Uses p05/p95 to avoid outlier sensitivity.
 * Applied AFTER max-aggregation across all strips.
 *
 * @param curvature - Raw curvature profile
 * @returns Normalized profile in [0, 1] (zeros if constant input)
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
    // else: all curvatures are similar → keep zeros → uniform grid (correct!)

    return result;
}

/**
 * Smooth a curvature profile using a moving average window.
 * Prevents CDF from creating excessively sharp density transitions.
 *
 * @param profile - Input curvature profile
 * @param radius - Half-width of the averaging window
 * @returns Smoothed profile (same length as input)
 */
export function smoothProfile(profile: Float32Array, radius: number): Float32Array {
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
