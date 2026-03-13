/**
 * FeatureDetection — Pure CPU functions for detecting, classifying, and
 * merging geometric features (ridges, valleys) from 3D position data.
 *
 * Extracted from ParametricExportComputer.ts.
 * These are stateless utility functions with no GPU or DOM dependencies.
 * All detection is based on cylindrical radius analysis from GPU probe data.
 */

import { FeatureKind, FeaturePoint, TDirectionFeature, FEATURE_PROMINENCE_THRESHOLD } from './types';

// ============================================================================
// Utility: Circular distance on [0, 1)
// ============================================================================

/**
 * Compute the shortest distance between two U positions on [0, 1),
 * accounting for wraparound.
 *
 * @param u0 - First U position in [0, 1)
 * @param u1 - Second U position in [0, 1)
 * @returns Distance in [0, 0.5]
 */
export function circularDistance(u0: number, u1: number): number {
    let d = Math.abs(u0 - u1);
    if (d > 0.5) d = 1 - d;
    return d;
}

// ============================================================================
// Curvature-Based Feature Edge Detection
// ============================================================================

/**
 * Detect feature edges (ridges and valleys) in a curvature profile.
 *
 * Uses TWO complementary detection strategies:
 * 1. Curvature peaks: Local maxima in |d²r/dp²| with prominence filtering.
 *    These mark positions of maximum bending (where the surface curves most).
 * 2. Gradient zero-crossings: Sign changes in dr/dp (first derivative).
 *    These are the ACTUAL ridge peaks and valley bottoms — the extrema of
 *    the radius function itself, which is where grid lines matter most.
 *
 * Both types are merged and deduplicated. This dual approach ensures we
 * catch both sharp cusps (high curvature) and gentle hills (gradient zero
 * but low curvature).
 *
 * @param curvature - Raw (unnormalized) curvature profile (|d²r/dp²|)
 * @param numSamples - Length of the profile
 * @param positions3D - Optional: the 3D positions used to compute curvature.
 *   If provided, also detects gradient zero-crossings (radius extrema).
 * @returns Array of feature positions in [0, 1) normalized coordinates
 */
export function detectFeatureEdges(
    curvature: Float32Array,
    numSamples: number,
    positions3D?: Float32Array
): number[] {
    const features: number[] = [];
    if (numSamples < 5) return features;

    // --- Strategy 1: Curvature peaks (high |d²r/dp²|) ---
    let maxCurv = 0;
    for (let i = 0; i < numSamples; i++) {
        maxCurv = Math.max(maxCurv, curvature[i]);
    }

    if (maxCurv > 1e-8) {
        const prominenceThreshold = maxCurv * FEATURE_PROMINENCE_THRESHOLD;

        for (let i = 2; i < numSamples - 2; i++) {
            const c = curvature[i];
            if (c <= curvature[i - 1] || c <= curvature[i + 1]) continue;

            // Prominence: height above the higher of the two flanking minima
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

    // --- Strategy 2: Gradient zero-crossings (radius extrema) ---
    // These are the actual ridge tops and valley bottoms.
    // Even gentle hills with low curvature create zero-crossings.
    if (positions3D && positions3D.length >= numSamples * 3) {
        // Compute cylindrical radius at each sample
        const radii = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
            const x = positions3D[i * 3];
            const y = positions3D[i * 3 + 1];
            radii[i] = Math.sqrt(x * x + y * y);
        }

        // Compute first derivative (gradient) via central differences
        const gradient = new Float32Array(numSamples);
        for (let i = 1; i < numSamples - 1; i++) {
            gradient[i] = radii[i + 1] - radii[i - 1]; // proportional to dr/dp
        }
        gradient[0] = gradient[1];
        gradient[numSamples - 1] = gradient[numSamples - 2];

        // Find zero-crossings with minimum curvature gate
        // (only add if curvature at zero-crossing exceeds noise floor)
        const noiseFloor = maxCurv * 0.02; // 2% of max = very sensitive
        for (let i = 1; i < numSamples - 1; i++) {
            if (gradient[i - 1] * gradient[i] < 0 || // Sign change
                (gradient[i] === 0 && gradient[i - 1] !== 0)) { // Exact zero
                // Linear interpolation for sub-sample zero-crossing position
                const g0 = gradient[i - 1];
                const g1 = gradient[i];
                const frac = Math.abs(g0) / (Math.abs(g0) + Math.abs(g1) + 1e-12);
                const pos = (i - 1 + frac) / numSamples;

                // Gate: must have non-trivial curvature nearby
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

    // Deduplicate features that are too close together (within 0.5 sample)
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

// ============================================================================
// v16.0 — Row-Direction Feature Detection (Verified Peak/Valley)
// ============================================================================

/**
 * v16.0: COMPLETELY REWRITTEN peak/valley detection with separate logic for
 * peaks (radius local maxima) and valleys (radius local minima).
 *
 * KEY CHANGES from v10/v13/v15:
 *   1. TYPED features: each detection carries kind (peak/valley), radius,
 *      prominence, and confidence score.
 *   2. SEPARATE peak and valley detection: peaks search for local maxima,
 *      valleys search for local minima. No shared code path that could
 *      confuse the two.
 *   3. VERIFICATION: every candidate is verified by checking that the
 *      refined position is still an extremum of the correct type.
 *      Parabolic fit is checked for consistency (curvature sign must
 *      match the extremum type).
 *   4. CONFIDENCE scoring: based on prominence relative to neighbourhood,
 *      curvature sharpness, and consistency of surrounding gradient.
 *   5. NO inflection points: Strategy 3 is REMOVED. Inflections are not
 *      features — they're curvature sign changes that create noise in the
 *      point cloud without corresponding to visible edges.
 *   6. Strategy 2 (curvature) is REWORKED: only emits a feature if the
 *      curvature peak corresponds to a VERIFIED radius extremum. No more
 *      blind redirection to "nearest extremum within ±3 samples".
 *
 * Detection Pipeline:
 *   1. Compute cylindrical radii from GPU probe data
 *   2. Find all gradient sign changes (candidate extrema)
 *   3. Classify each as peak or valley based on gradient direction
 *   4. Parabolic refinement for sub-sample position
 *   5. VERIFY: check that refined position is consistent with extremum type
 *   6. Compute prominence, confidence, and local radius
 *   7. Apply prominence gate to reject noise
 *   8. Curvature-shoulder detection: find high-curvature points that are
 *      ALSO verified as radius extrema within a 5-sample window
 *   9. Deduplicate, keeping highest-confidence detection at each location
 *
 * @param positions3D   Interleaved [x,y,z, ...] from GPU evaluate
 * @param numSamples    Number of samples (= positions3D.length / 3)
 * @param minProminence Min peak-to-valley radius change (mm) to keep
 * @returns Object with:
 *   - features: FeaturePoint[] (classified, verified)
 *   - uPositions: number[] (sorted U values, backward-compatible)
 *   - rejected: number (candidates that failed verification)
 */
export function detectRowFeaturesV16(
    positions3D: Float32Array,
    numSamples: number,
    minProminence: number = 0.005
): { features: FeaturePoint[]; uPositions: number[]; rejected: number } {
    if (numSamples < 7) return { features: [], uPositions: [], rejected: 0 };

    // 1. Cylindrical radius at each sample — GROUND TRUTH from GPU
    const radii = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        const x = positions3D[i * 3];
        const y = positions3D[i * 3 + 1];
        radii[i] = Math.sqrt(x * x + y * y);
    }

    const wrap = (idx: number) => ((idx % numSamples) + numSamples) % numSamples;
    const prominenceWindow = Math.max(5, Math.floor(numSamples * 0.008));

    // Pre-compute 5-point stencil second derivative (sign-preserving)
    // Negative = concave down (peak), Positive = concave up (valley)
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
    // This is the PRIMARY and most reliable detection strategy.
    // A gradient sign change means dr/du went from positive to negative (peak)
    // or negative to positive (valley).
    for (let i = 0; i < numSamples; i++) {
        const prev = wrap(i - 1);
        const next = wrap(i + 1);
        const dLeft = radii[i] - radii[prev];
        const dRight = radii[next] - radii[i];

        // Gradient must change sign for this to be an extremum
        if (dLeft * dRight >= 0) continue;

        // Classify: peak (rising then falling) vs valley (falling then rising)
        const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

        // ── Parabolic refinement ──
        // 3-point fit: optimal for smooth peaks, safe for cusps
        const L = radii[prev];
        const C = radii[i];
        const R = radii[next];
        const denom = L - 2 * C + R;
        let delta = 0;
        if (Math.abs(denom) > 1e-14) {
            delta = 0.5 * (L - R) / denom;
            delta = Math.max(-0.5, Math.min(0.5, delta));
        }

        // ── VERIFICATION: parabolic curvature must agree with extremum type ──
        // For a peak: denom (= d²r) must be NEGATIVE (concave down)
        // For a valley: denom (= d²r) must be POSITIVE (concave up)
        // If they disagree, this is likely noise or an inflection, not a real extremum
        const curvatureCorrect = kind === 'peak' ? (denom < 0) : (denom > 0);
        if (!curvatureCorrect && Math.abs(denom) > 1e-10) {
            // Curvature disagrees with extremum type — likely a saddle or noise
            rejected++;
            continue;
        }

        // ── VERIFICATION: the refined position must still be an extremum ──
        // Check that the value at the refined position is indeed a local max/min
        // compared to its immediate neighbours
        const refinedIdx = i + delta;
        const refinedU = ((refinedIdx / numSamples) % 1 + 1) % 1;

        // Interpolate radius at refined position for verification
        const fracIdx = ((refinedIdx % numSamples) + numSamples) % numSamples;
        const iLo = Math.floor(fracIdx);
        const frac = fracIdx - iLo;
        const iHi = wrap(iLo + 1);
        const refinedRadius = radii[iLo] * (1 - frac) + radii[iHi] * frac;

        // Check: is the refined position still an extremum vs its ±1 neighbours?
        const rMinus1 = radii[prev];
        const rPlus1 = radii[next];
        const isStillExtremum = kind === 'peak'
            ? (refinedRadius >= rMinus1 - 1e-10 && refinedRadius >= rPlus1 - 1e-10)
            : (refinedRadius <= rMinus1 + 1e-10 && refinedRadius <= rPlus1 + 1e-10);

        if (!isStillExtremum) {
            rejected++;
            continue;
        }

        // ── Prominence: peak-to-valley range in local window ──
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

        // ── Confidence scoring ──
        // Higher confidence for: sharp curvature, strong gradient change, isolated peaks
        const gradientStrength = Math.abs(dLeft) + Math.abs(dRight);
        const curvatureStrength = Math.abs(d2r[i]);

        // Compute max gradient and curvature in neighbourhood for normalization
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

        candidates.push({
            u: refinedU,
            kind,
            radius: refinedRadius,
            prominence,
            confidence,
        });
    }

    // ── Strategy 2: Curvature Shoulders (Verified) ──
    // Find positions where |d²r/du²| is high AND the position is a VERIFIED
    // radius extremum (peak or valley) within a tight window.
    // This catches features that Strategy 1 misses when the gradient sign
    // change falls exactly between two samples.
    const absCurv = new Float32Array(numSamples);
    let maxCurvGlobal = 0;
    for (let i = 0; i < numSamples; i++) {
        absCurv[i] = Math.abs(d2r[i]);
        maxCurvGlobal = Math.max(maxCurvGlobal, absCurv[i]);
    }

    if (maxCurvGlobal > 1e-10) {
        const curvThreshold = maxCurvGlobal * 0.20; // top 20% curvature

        for (let i = 0; i < numSamples; i++) {
            // Must be a local maximum of |curvature|
            if (absCurv[i] <= absCurv[wrap(i - 1)] ||
                absCurv[i] <= absCurv[wrap(i + 1)]
            ) continue;
            if (absCurv[i] < curvThreshold) continue;

            // Determine expected extremum type from curvature sign
            // Negative d²r = concave down = PEAK
            // Positive d²r = concave up = VALLEY
            const expectedKind: FeatureKind = d2r[i] < 0 ? 'peak' : 'valley';

            // ── VERIFICATION: Find and verify the actual radius extremum ──
            // Search within ±2 samples for the actual extremum
            let bestIdx = i;
            let bestVal = radii[i];
            for (let k = -2; k <= 2; k++) {
                const idx = wrap(i + k);
                if (expectedKind === 'peak' ? (radii[idx] > bestVal) : (radii[idx] < bestVal)) {
                    bestVal = radii[idx];
                    bestIdx = idx;
                }
            }

            // Verify: the best sample must actually be a local extremum
            const bPrev = radii[wrap(bestIdx - 1)];
            const bNext = radii[wrap(bestIdx + 1)];
            const bCur = radii[bestIdx];
            const isExtremum = expectedKind === 'peak'
                ? (bCur >= bPrev && bCur >= bNext)
                : (bCur <= bPrev && bCur <= bNext);
            if (!isExtremum) {
                rejected++;
                continue;
            }

            // Parabolic refinement at the verified extremum
            const eL = radii[wrap(bestIdx - 1)];
            const eC = radii[bestIdx];
            const eR = radii[wrap(bestIdx + 1)];
            const eDenom = eL - 2 * eC + eR;
            let eDelta = 0;
            if (Math.abs(eDenom) > 1e-14) {
                eDelta = 0.5 * (eL - eR) / eDenom;
                eDelta = Math.max(-0.5, Math.min(0.5, eDelta));
            }

            // Verify curvature sign agrees with expected kind
            if (expectedKind === 'peak' && eDenom > 0) { rejected++; continue; }
            if (expectedKind === 'valley' && eDenom < 0) { rejected++; continue; }

            const curvPeakU = ((bestIdx + eDelta) / numSamples + 1) % 1;

            // Prominence
            let localMax = -Infinity, localMin = Infinity;
            for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
                const idx = wrap(bestIdx + k);
                localMax = Math.max(localMax, radii[idx]);
                localMin = Math.min(localMin, radii[idx]);
            }
            const prominence = localMax - localMin;
            if (prominence < minProminence) { rejected++; continue; }

            // Interpolate radius at refined position
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

    // ── Deduplicate: keep highest-confidence feature at each location ──
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
            // Far enough from any existing feature — add
            features.push(cand);
        } else {
            // Too close: keep the one with higher confidence
            if (cand.confidence > last.confidence) {
                features[features.length - 1] = cand;
            }
            // Otherwise keep the existing one
        }
    }

    // Extract sorted U positions for backward compatibility
    const uPositions = features.map(f => f.u);
    uPositions.sort((a, b) => a - b);

    return { features, uPositions, rejected };
}

/**
 * Backward-compatible wrapper: returns just the U positions.
 * Used by the existing pipeline that expects number[].
 */
export function detectRowFeatures(
    positions3D: Float32Array,
    numSamples: number,
    minProminence: number = 0.005
): number[] {
    return detectRowFeaturesV16(positions3D, numSamples, minProminence).uPositions;
}

/**
 * v16.0: Detect features for all rows. Returns per-row U positions (backward
 * compatible) plus typed feature data and total rejection count.
 *
 * @returns Object with:
 *   - allRowFeatures: number[][] (sorted U positions per row)
 *   - allRowTypedFeatures: FeaturePoint[][] (classified features per row)
 *   - totalRejected: number (total candidates that failed verification)
 */
export function detectAllRowFeatures(
    rowProbeData: Float32Array[],
    probeSamples: number
): { allRowFeatures: number[][]; allRowTypedFeatures: FeaturePoint[][]; totalRejected: number } {
    const allRowFeatures: number[][] = [];
    const allRowTypedFeatures: FeaturePoint[][] = [];
    let totalRejected = 0;

    for (let j = 0; j < rowProbeData.length; j++) {
        if (rowProbeData[j].length >= probeSamples * 3) {
            const result = detectRowFeaturesV16(rowProbeData[j], probeSamples);
            allRowFeatures.push(result.uPositions);
            allRowTypedFeatures.push(result.features);
            totalRejected += result.rejected;
        } else {
            allRowFeatures.push([]);
            allRowTypedFeatures.push([]);
        }
    }
    return { allRowFeatures, allRowTypedFeatures, totalRejected };
}

// ============================================================================
// v16.0 — Column-Direction Feature Detection (Verified Peak/Valley)
// ============================================================================

/**
 * v16.0: Detect VERIFIED features along a column (T-direction) at a fixed U.
 *
 * Same verification pipeline as detectRowFeaturesV16 but adapted for
 * non-periodic T domain. Every detected feature is classified as peak
 * or valley, verified for consistency, and scored for confidence.
 *
 * @param radiiAlongT   Cylindrical radius at each T sample
 * @param numSamples    Number of T-direction samples
 * @param tPositions    The T values corresponding to each sample
 * @param minProminence Minimum peak-to-valley range to qualify
 * @returns Object with T positions and feature details
 */
export function detectColumnFeaturesV16(
    radiiAlongT: Float32Array,
    numSamples: number,
    tPositions: Float32Array | number[],
    minProminence: number = 0.003
): { tPositions: number[]; features: FeaturePoint[]; rejected: number } {
    if (numSamples < 5) return { tPositions: [], features: [], rejected: 0 };

    const prominenceWindow = Math.max(3, Math.floor(numSamples * 0.02));
    const clamp = (idx: number) => Math.max(0, Math.min(numSamples - 1, idx));

    // Pre-compute second derivative (non-periodic)
    const d2r = new Float32Array(numSamples);
    for (let i = 2; i < numSamples - 2; i++) {
        d2r[i] = (
            -radiiAlongT[i - 2] + 16 * radiiAlongT[i - 1]
            - 30 * radiiAlongT[i]
            + 16 * radiiAlongT[i + 1] - radiiAlongT[i + 2]
        ) / 12;
    }
    // Edge: 3-point stencil
    if (numSamples > 2) {
        d2r[1] = radiiAlongT[0] - 2 * radiiAlongT[1] + radiiAlongT[2];
        d2r[numSamples - 2] = radiiAlongT[numSamples - 3] - 2 * radiiAlongT[numSamples - 2] + radiiAlongT[numSamples - 1];
    }

    const candidates: FeaturePoint[] = [];
    let rejected = 0;

    // Helper: interpolate T position from fractional index
    const interpT = (refinedIdx: number): number => {
        const iLo = Math.max(0, Math.min(numSamples - 2, Math.floor(refinedIdx)));
        const iFrac = refinedIdx - iLo;
        const iHi = Math.min(iLo + 1, numSamples - 1);
        return (tPositions[iLo] as number) * (1 - iFrac) + (tPositions[iHi] as number) * iFrac;
    };

    // ── Strategy 1: Gradient sign changes ──
    for (let i = 1; i < numSamples - 1; i++) {
        const dLeft = radiiAlongT[i] - radiiAlongT[i - 1];
        const dRight = radiiAlongT[i + 1] - radiiAlongT[i];

        if (dLeft * dRight >= 0) continue;

        const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

        // Parabolic refinement
        const L = radiiAlongT[i - 1];
        const C = radiiAlongT[i];
        const R = radiiAlongT[i + 1];
        const denom = L - 2 * C + R;
        let delta = 0;
        if (Math.abs(denom) > 1e-14) {
            delta = 0.5 * (L - R) / denom;
            delta = Math.max(-0.5, Math.min(0.5, delta));
        }

        // VERIFY: curvature sign must match extremum type
        const curvatureCorrect = kind === 'peak' ? (denom < 0) : (denom > 0);
        if (!curvatureCorrect && Math.abs(denom) > 1e-10) {
            rejected++;
            continue;
        }

        // VERIFY: refined position still an extremum
        const refinedRadius = C + delta * (R - L) / 2 + delta * delta * denom / 2;
        const isStillExtremum = kind === 'peak'
            ? (refinedRadius >= L - 1e-10 && refinedRadius >= R - 1e-10)
            : (refinedRadius <= L + 1e-10 && refinedRadius <= R + 1e-10);
        if (!isStillExtremum) { rejected++; continue; }

        // Prominence
        let localMax = -Infinity, localMin = Infinity;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = clamp(i + k);
            localMax = Math.max(localMax, radiiAlongT[idx]);
            localMin = Math.min(localMin, radiiAlongT[idx]);
        }
        const prominence = localMax - localMin;
        if (prominence < minProminence) { rejected++; continue; }

        const peakT = interpT(i + delta);

        // Confidence
        const gradStrength = Math.abs(dLeft) + Math.abs(dRight);
        const curvStrength = Math.abs(d2r[i]);
        let maxGrad = 0, maxCurv = 0;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = clamp(i + k);
            const nIdx = clamp(idx + 1);
            maxGrad = Math.max(maxGrad, Math.abs(radiiAlongT[nIdx] - radiiAlongT[idx]));
            maxCurv = Math.max(maxCurv, Math.abs(d2r[idx]));
        }
        const confidence = 0.4 * (maxGrad > 1e-12 ? Math.min(1, gradStrength / (2 * maxGrad)) : 0.5)
            + 0.3 * (maxCurv > 1e-12 ? Math.min(1, curvStrength / maxCurv) : 0.5)
            + 0.3 * Math.min(1, prominence / (minProminence * 5));

        candidates.push({ u: peakT, kind, radius: refinedRadius, prominence, confidence });
    }

    // ── Strategy 2: Curvature shoulders (verified) ──
    const absCurv = new Float32Array(numSamples);
    let maxCurvGlobal = 0;
    for (let i = 0; i < numSamples; i++) {
        absCurv[i] = Math.abs(d2r[i]);
        maxCurvGlobal = Math.max(maxCurvGlobal, absCurv[i]);
    }

    if (maxCurvGlobal > 1e-10) {
        const curvThreshold = maxCurvGlobal * 0.20;
        for (let i = 1; i < numSamples - 1; i++) {
            if (absCurv[i] <= absCurv[clamp(i - 1)] ||
                absCurv[i] <= absCurv[clamp(i + 1)]) continue;
            if (absCurv[i] < curvThreshold) continue;

            const expectedKind: FeatureKind = d2r[i] < 0 ? 'peak' : 'valley';

            // Find and verify the actual extremum within ±2 samples
            let bestIdx = i;
            let bestVal = radiiAlongT[i];
            for (let k = -2; k <= 2; k++) {
                const idx = clamp(i + k);
                if (expectedKind === 'peak' ? (radiiAlongT[idx] > bestVal) : (radiiAlongT[idx] < bestVal)) {
                    bestVal = radiiAlongT[idx];
                    bestIdx = idx;
                }
            }

            // Verify extremum
            if (bestIdx > 0 && bestIdx < numSamples - 1) {
                const bP = radiiAlongT[bestIdx - 1];
                const bC = radiiAlongT[bestIdx];
                const bN = radiiAlongT[bestIdx + 1];
                const isExtremum = expectedKind === 'peak'
                    ? (bC >= bP && bC >= bN)
                    : (bC <= bP && bC <= bN);
                if (!isExtremum) { rejected++; continue; }

                // Verify curvature sign
                const eDenom = bP - 2 * bC + bN;
                if (expectedKind === 'peak' && eDenom > 0) { rejected++; continue; }
                if (expectedKind === 'valley' && eDenom < 0) { rejected++; continue; }

                let eDelta = 0;
                if (Math.abs(eDenom) > 1e-14) {
                    eDelta = 0.5 * (bP - bN) / eDenom;
                    eDelta = Math.max(-0.5, Math.min(0.5, eDelta));
                }

                // Prominence
                let localMax = -Infinity, localMin = Infinity;
                for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
                    const idx = clamp(bestIdx + k);
                    localMax = Math.max(localMax, radiiAlongT[idx]);
                    localMin = Math.min(localMin, radiiAlongT[idx]);
                }
                const prominence = localMax - localMin;
                if (prominence < minProminence) { rejected++; continue; }

                const peakT = interpT(bestIdx + eDelta);
                const refinedRadius = bC + eDelta * (bN - bP) / 2;

                candidates.push({
                    u: peakT, kind: expectedKind, radius: refinedRadius, prominence,
                    confidence: 0.5 * Math.min(1, absCurv[i] / maxCurvGlobal)
                        + 0.5 * Math.min(1, prominence / (minProminence * 5)),
                });
            } else {
                rejected++;
            }
        }
    }

    // Deduplicate by T proximity, keeping highest confidence
    candidates.sort((a, b) => a.u - b.u);
    const tSpacing = numSamples > 1
        ? (Math.abs((tPositions[numSamples - 1] as number) - (tPositions[0] as number)) / (numSamples - 1))
        : 0.01;
    const minSepT = tSpacing * 1.5;
    const features: FeaturePoint[] = [];
    for (const cand of candidates) {
        if (features.length === 0 || cand.u - features[features.length - 1].u > minSepT) {
            features.push(cand);
        } else if (cand.confidence > features[features.length - 1].confidence) {
            features[features.length - 1] = cand;
        }
    }

    const resultT = features.map(f => f.u);
    return { tPositions: resultT, features, rejected };
}

/** Backward-compatible wrapper returning just T positions. */
export function detectColumnFeatures(
    radiiAlongT: Float32Array,
    numSamples: number,
    tPositions: Float32Array | number[],
    minProminence: number = 0.003
): number[] {
    return detectColumnFeaturesV16(radiiAlongT, numSamples, tPositions, minProminence).tPositions;
}

/**
 * v16.1: Detect VERIFIED column-direction features and merge into row data.
 *
 * CRITICAL FIX from v16.0: Column detection now SNAPS to the nearest
 * verified peak/valley in the row's 8k U-probe data, instead of placing
 * features at the column's grid U position. This eliminates:
 *   1. "Horizontal lines" in UV debug (points at grid-aligned U positions)
 *   2. Points that miss the actual peak (placed at column U, not peak U)
 *   3. Misclassified peaks/valleys (column features now carry typed data)
 *
 * Algorithm:
 *   1. For each U column, extract T-direction radius profile from row data
 *   2. Detect T-direction extrema using verified pipeline
 *   3. For each detected T-feature, find the closest row
 *   4. In that row's 8k U-probe data, search for the nearest VERIFIED
 *      radius extremum within a tight U window around the column position
 *   5. Only add the feature if a verified extremum is found — at the
 *      EXACT peak U position from the 8k data, not the column grid U
 *
 * @param rowProbeData       Per-row GPU probe results (8k samples each)
 * @param probeSamples       Number of U samples per row (8192)
 * @param tPositions         T values for each row
 * @param numColProbes       Number of U columns to probe
 * @param allRowFeatures     Existing per-row feature U positions (MUTATED)
 * @param allRowTypedFeatures Existing per-row typed features (MUTATED)
 * @returns Object with addedCount and rejectedCount
 */
export function detectAndMergeColumnFeatures(
    rowProbeData: Float32Array[],
    probeSamples: number,
    tPositions: Float32Array,
    numColProbes: number,
    allRowFeatures: number[][],
    allRowTypedFeatures: FeaturePoint[][]
): { addedCount: number; rejectedCount: number } {
    const numRows = rowProbeData.length;
    if (numRows < 5 || probeSamples < 16) return { addedCount: 0, rejectedCount: 0 };

    let addedCount = 0;
    let rejectedCount = 0;
    const colStep = Math.max(1, Math.floor(probeSamples / numColProbes));

    // v16.1: Search window in the row's U-probe data to find the actual peak.
    // ±SNAP_WINDOW samples around the column position. At 8192 samples,
    // ±16 samples = ±0.002 U, which is ~0.7° — tight enough to avoid
    // snapping to a different feature.
    const SNAP_WINDOW = 16;
    const MIN_SEP = 1.5 / probeSamples;

    for (let ci = 0; ci < probeSamples; ci += colStep) {
        const uPos = ci / probeSamples;

        // Extract radius profile along T at this U position
        const radiiAlongT = new Float32Array(numRows);
        for (let j = 0; j < numRows; j++) {
            const x = rowProbeData[j][ci * 3];
            const y = rowProbeData[j][ci * 3 + 1];
            radiiAlongT[j] = Math.sqrt(x * x + y * y);
        }

        // v16.0: Use verified detection — only genuine peaks/valleys pass
        const colResult = detectColumnFeaturesV16(radiiAlongT, numRows, tPositions);
        rejectedCount += colResult.rejected;

        // For each verified T-direction feature, snap to nearest U-peak in the row
        for (const feat of colResult.features) {
            // Find the row closest to this T position
            let bestRow = 0;
            let bestDist = Math.abs(tPositions[0] - feat.u);
            for (let j = 1; j < numRows; j++) {
                const d = Math.abs(tPositions[j] - feat.u);
                if (d < bestDist) {
                    bestDist = d;
                    bestRow = j;
                }
            }

            // v16.1: Search for a VERIFIED radius extremum in the row's 8k data
            // near the column position. This gives us the EXACT peak U at 8k resolution.
            const rowData = rowProbeData[bestRow];
            const wrap = (idx: number) => ((idx % probeSamples) + probeSamples) % probeSamples;

            // Compute radii in the search window
            const lo = ci - SNAP_WINDOW;
            const hi = ci + SNAP_WINDOW;

            // Find the best extremum (matching the column feature's kind) in the window
            let foundPeakU = -1;
            let foundKind: FeatureKind = feat.kind; // Inherit T-direction classification as hint
            let foundRadius = 0;
            let foundProminence = 0;
            let foundConfidence = 0;

            // Scan for gradient sign changes in the window — actual U-peaks/valleys
            for (let si = lo + 1; si < hi; si++) {
                const i = wrap(si);
                const prev = wrap(si - 1);
                const next = wrap(si + 1);

                const x_i = rowData[i * 3], y_i = rowData[i * 3 + 1];
                const x_p = rowData[prev * 3], y_p = rowData[prev * 3 + 1];
                const x_n = rowData[next * 3], y_n = rowData[next * 3 + 1];
                const r_i = Math.sqrt(x_i * x_i + y_i * y_i);
                const r_p = Math.sqrt(x_p * x_p + y_p * y_p);
                const r_n = Math.sqrt(x_n * x_n + y_n * y_n);

                const dLeft = r_i - r_p;
                const dRight = r_n - r_i;
                if (dLeft * dRight >= 0) continue; // Not an extremum

                const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

                // Parabolic refinement
                const denom = r_p - 2 * r_i + r_n;
                let delta = 0;
                if (Math.abs(denom) > 1e-14) {
                    delta = 0.5 * (r_p - r_n) / denom;
                    delta = Math.max(-0.5, Math.min(0.5, delta));
                }

                // Verify curvature sign
                const curvOk = kind === 'peak' ? (denom < 0) : (denom > 0);
                if (!curvOk && Math.abs(denom) > 1e-10) continue;

                // Verify refined position is still extremum
                const fracIdx = ((si + delta) % probeSamples + probeSamples) % probeSamples;
                const iLo = Math.floor(fracIdx);
                const frac = fracIdx - iLo;
                const iHi = wrap(iLo + 1);
                const x_lo = rowData[iLo * 3], y_lo = rowData[iLo * 3 + 1];
                const x_hi = rowData[iHi * 3], y_hi = rowData[iHi * 3 + 1];
                const r_refined = Math.sqrt(
                    (x_lo * (1 - frac) + x_hi * frac) ** 2 +
                    (y_lo * (1 - frac) + y_hi * frac) ** 2
                );

                const isStillExtremum = kind === 'peak'
                    ? (r_refined >= r_p - 1e-6 && r_refined >= r_n - 1e-6)
                    : (r_refined <= r_p + 1e-6 && r_refined <= r_n + 1e-6);
                if (!isStillExtremum) continue;

                // Prominence in local window
                const promWin = Math.max(5, Math.floor(probeSamples * 0.008));
                let localMax = -Infinity, localMin = Infinity;
                for (let k = -promWin; k <= promWin; k++) {
                    const idx = wrap(si + k);
                    const xk = rowData[idx * 3], yk = rowData[idx * 3 + 1];
                    const rk = Math.sqrt(xk * xk + yk * yk);
                    localMax = Math.max(localMax, rk);
                    localMin = Math.min(localMin, rk);
                }
                const prominence = localMax - localMin;
                if (prominence < 0.005) continue; // Same threshold as row detection

                const peakU = (((si + delta) / probeSamples) % 1 + 1) % 1;

                // Pick the closest verified extremum to the column position
                const distToCol = Math.min(
                    Math.abs(peakU - uPos),
                    Math.abs(peakU - uPos + 1),
                    Math.abs(peakU - uPos - 1)
                );

                if (foundPeakU < 0 || distToCol < Math.min(
                    Math.abs(foundPeakU - uPos),
                    Math.abs(foundPeakU - uPos + 1),
                    Math.abs(foundPeakU - uPos - 1)
                )) {
                    foundPeakU = peakU;
                    foundKind = kind;
                    foundRadius = r_refined;
                    foundProminence = prominence;
                    // Confidence: based on gradient strength and prominence
                    const gradStrength = Math.abs(dLeft) + Math.abs(dRight);
                    foundConfidence = 0.5 * Math.min(1, gradStrength * probeSamples)
                        + 0.5 * Math.min(1, prominence / 0.025);
                }
            }

            // If no verified extremum found in the U-window, skip this column feature
            if (foundPeakU < 0) {
                rejectedCount++;
                continue;
            }

            // Dedup: don't add if an existing row feature is too close
            const existingFeats = allRowFeatures[bestRow];
            let isDuplicate = false;
            for (const ef of existingFeats) {
                if (circularDistance(ef, foundPeakU) < MIN_SEP) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                allRowFeatures[bestRow].push(foundPeakU);
                allRowFeatures[bestRow].sort((a, b) => a - b);

                // v16.1: Also add typed feature data for correct peak/valley visualization
                if (bestRow < allRowTypedFeatures.length) {
                    allRowTypedFeatures[bestRow].push({
                        u: foundPeakU,
                        kind: foundKind,
                        radius: foundRadius,
                        prominence: foundProminence,
                        confidence: foundConfidence,
                    });
                }
                addedCount++;
            }
        }
    }

    return { addedCount, rejectedCount };
}

// ============================================================================
// v17.0 — GPU Column Probing: High-Resolution T-Direction Feature Detection
// ============================================================================

/**
 * v17.1: Compute the mean taper profile across all column probes.
 *
 * For a surface of revolution r(u,t) = R(t) * styleModulation(u,t), the
 * taper profile R(t) dominates the T-direction signal. By averaging cylindrical
 * radius across all U columns at each T position, the style modulation cancels
 * out, leaving the pure taper shape.
 *
 * The result is smoothed with a moving-average window to remove any residual
 * style texture that doesn't fully cancel at 128 columns.
 *
 * @param allColumnPositions  GPU probe results: interleaved [x,y,z,...] for all columns concatenated
 * @param numColumns          Number of U-direction columns (typically 128)
 * @param numTSamples         Number of T-direction samples per column (typically 4096)
 * @param smoothWindow        Moving-average half-window for smoothing (default: 7)
 * @returns Float32Array of length numTSamples with the mean radius at each T position
 */
export function computeTaperProfile(
    allColumnPositions: Float32Array,
    numColumns: number,
    numTSamples: number,
    smoothWindow: number = 7
): Float32Array {
    const rawProfile = new Float32Array(numTSamples);

    // Accumulate cylindrical radius across all columns for each T sample
    for (let c = 0; c < numColumns; c++) {
        const colOffset = c * numTSamples * 3;
        for (let i = 0; i < numTSamples; i++) {
            const x = allColumnPositions[colOffset + i * 3];
            const y = allColumnPositions[colOffset + i * 3 + 1];
            rawProfile[i] += Math.sqrt(x * x + y * y);
        }
    }

    // Divide by column count to get mean
    for (let i = 0; i < numTSamples; i++) {
        rawProfile[i] /= numColumns;
    }

    // Smooth with symmetric moving-average (clamped at boundaries)
    if (smoothWindow <= 0) return rawProfile;
    const smoothed = new Float32Array(numTSamples);
    for (let i = 0; i < numTSamples; i++) {
        const lo = Math.max(0, i - smoothWindow);
        const hi = Math.min(numTSamples - 1, i + smoothWindow);
        let sum = 0;
        for (let k = lo; k <= hi; k++) sum += rawProfile[k];
        smoothed[i] = sum / (hi - lo + 1);
    }

    return smoothed;
}

// ============================================================================

/**
 * v17.1: Detect VERIFIED T-direction features from dedicated GPU column probes.
 *
 * Takes high-resolution (4096+) 3D positions from a GPU T-direction column
 * probe and detects radius extrema along the height axis. Uses the same
 * dual-strategy pipeline as detectRowFeaturesV16 but adapted for the
 * non-periodic T domain.
 *
 * v17.1 CRITICAL FIX: When a taperProfile is provided, detection operates on
 * the **taper-relative deviation** `deviation[i] = r[i] - taperProfile[i]`
 * instead of raw radius. This eliminates false positives at taper inflection
 * points (where the pot's silhouette curves from inward to outward) which
 * are the root cause of spurious horizontal feature lines.
 *
 * @param positions3D   Interleaved [x,y,z, ...] from GPU column probe
 * @param numSamples    Number of T-direction samples (= positions3D.length / 3)
 * @param taperProfile  Mean radius at each T-sample (from computeTaperProfile). If null, uses raw radius.
 * @param minProminence Minimum peak-to-valley radius change (mm) to keep
 * @returns Object with:
 *   - features: TDirectionFeature[] (classified, verified, with explicit .t)
 *   - rejected: number (candidates that failed verification)
 */
export function detectTDirectionFeatures(
    positions3D: Float32Array,
    numSamples: number,
    taperProfile: Float32Array | null = null,
    minProminence: number = 0.003
): { features: TDirectionFeature[]; rejected: number } {
    if (numSamples < 7) return { features: [], rejected: 0 };

    // 1. Cylindrical radius at each T-sample
    const radii = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        const x = positions3D[i * 3];
        const y = positions3D[i * 3 + 1];
        radii[i] = Math.sqrt(x * x + y * y);
    }

    // 2. Compute analysis signal: taper-relative deviation if taper provided,
    //    otherwise raw radius (backward-compatible)
    const signal = new Float32Array(numSamples);
    if (taperProfile && taperProfile.length === numSamples) {
        for (let i = 0; i < numSamples; i++) {
            signal[i] = radii[i] - taperProfile[i];
        }
    } else {
        signal.set(radii);
    }

    const clamp = (idx: number) => Math.max(0, Math.min(numSamples - 1, idx));
    const prominenceWindow = Math.max(5, Math.floor(numSamples * 0.008));

    // T position from sample index (uniform spacing [0, 1])
    const sampleToT = (idx: number): number =>
        Math.max(0, Math.min(1, idx / (numSamples - 1)));

    // Pre-compute 5-point stencil second derivative on the analysis signal
    // (non-periodic, clamped at boundaries)
    const d2s = new Float32Array(numSamples);
    for (let i = 2; i < numSamples - 2; i++) {
        d2s[i] = (
            -signal[i - 2] + 16 * signal[i - 1]
            - 30 * signal[i]
            + 16 * signal[i + 1] - signal[i + 2]
        ) / 12;
    }
    if (numSamples > 2) {
        d2s[1] = signal[0] - 2 * signal[1] + signal[2];
        d2s[numSamples - 2] = signal[numSamples - 3] - 2 * signal[numSamples - 2] + signal[numSamples - 1];
    }

    const candidates: TDirectionFeature[] = [];
    let rejected = 0;

    // ── Strategy 1: Gradient Sign Changes (True Extrema) ──
    // Operates on `signal` (taper-subtracted deviation when taper provided)
    for (let i = 1; i < numSamples - 1; i++) {
        const dLeft = signal[i] - signal[i - 1];
        const dRight = signal[i + 1] - signal[i];

        if (dLeft * dRight >= 0) continue;

        const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

        // Parabolic refinement on the analysis signal
        const L = signal[i - 1];
        const C = signal[i];
        const R = signal[i + 1];
        const denom = L - 2 * C + R;
        let delta = 0;
        if (Math.abs(denom) > 1e-14) {
            delta = 0.5 * (L - R) / denom;
            delta = Math.max(-0.5, Math.min(0.5, delta));
        }

        // VERIFY: curvature sign must match extremum type
        const curvatureCorrect = kind === 'peak' ? (denom < 0) : (denom > 0);
        if (!curvatureCorrect && Math.abs(denom) > 1e-10) {
            rejected++;
            continue;
        }

        // VERIFY: refined position still an extremum (on signal)
        const refinedSignal = C + delta * (R - L) / 2 + delta * delta * denom / 2;
        const isStillExtremum = kind === 'peak'
            ? (refinedSignal >= L - 1e-10 && refinedSignal >= R - 1e-10)
            : (refinedSignal <= L + 1e-10 && refinedSignal <= R + 1e-10);
        if (!isStillExtremum) { rejected++; continue; }

        // Prominence check (on signal, not raw radius)
        let localMax = -Infinity, localMin = Infinity;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = clamp(i + k);
            localMax = Math.max(localMax, signal[idx]);
            localMin = Math.min(localMin, signal[idx]);
        }
        const prominence = localMax - localMin;
        if (prominence < minProminence) { rejected++; continue; }

        const t = sampleToT(i + delta);

        // Report actual radius (not deviation) for the output
        const actualRadius = radii[i];

        // Confidence scoring (on signal)
        const gradStrength = Math.abs(dLeft) + Math.abs(dRight);
        const curvStrength = Math.abs(d2s[i]);
        let maxGrad = 0, maxCurv = 0;
        for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
            const idx = clamp(i + k);
            const nIdx = clamp(idx + 1);
            maxGrad = Math.max(maxGrad, Math.abs(signal[nIdx] - signal[idx]));
            maxCurv = Math.max(maxCurv, Math.abs(d2s[idx]));
        }
        const confidence = 0.4 * (maxGrad > 1e-12 ? Math.min(1, gradStrength / (2 * maxGrad)) : 0.5)
            + 0.3 * (maxCurv > 1e-12 ? Math.min(1, curvStrength / maxCurv) : 0.5)
            + 0.3 * Math.min(1, prominence / (minProminence * 5));

        candidates.push({ t, kind, radius: actualRadius, prominence, confidence });
    }

    // ── Strategy 2: Curvature Shoulders (Verified) ──
    // Also operates on `signal`
    const absCurv = new Float32Array(numSamples);
    let maxCurvGlobal = 0;
    for (let i = 0; i < numSamples; i++) {
        absCurv[i] = Math.abs(d2s[i]);
        maxCurvGlobal = Math.max(maxCurvGlobal, absCurv[i]);
    }

    if (maxCurvGlobal > 1e-10) {
        const curvThreshold = maxCurvGlobal * 0.20;
        for (let i = 1; i < numSamples - 1; i++) {
            if (absCurv[i] <= absCurv[clamp(i - 1)] ||
                absCurv[i] <= absCurv[clamp(i + 1)]
            ) continue;
            if (absCurv[i] < curvThreshold) continue;

            const expectedKind: FeatureKind = d2s[i] < 0 ? 'peak' : 'valley';

            // Find and verify actual extremum in signal within ±2 samples
            let bestIdx = i;
            let bestVal = signal[i];
            for (let k = -2; k <= 2; k++) {
                const idx = clamp(i + k);
                if (expectedKind === 'peak' ? (signal[idx] > bestVal) : (signal[idx] < bestVal)) {
                    bestVal = signal[idx];
                    bestIdx = idx;
                }
            }

            if (bestIdx > 0 && bestIdx < numSamples - 1) {
                const bP = signal[bestIdx - 1];
                const bC = signal[bestIdx];
                const bN = signal[bestIdx + 1];
                const isExtremum = expectedKind === 'peak'
                    ? (bC >= bP && bC >= bN)
                    : (bC <= bP && bC <= bN);
                if (!isExtremum) { rejected++; continue; }

                const eDenom = bP - 2 * bC + bN;
                if (expectedKind === 'peak' && eDenom > 0) { rejected++; continue; }
                if (expectedKind === 'valley' && eDenom < 0) { rejected++; continue; }

                let eDelta = 0;
                if (Math.abs(eDenom) > 1e-14) {
                    eDelta = 0.5 * (bP - bN) / eDenom;
                    eDelta = Math.max(-0.5, Math.min(0.5, eDelta));
                }

                let localMax = -Infinity, localMin = Infinity;
                for (let k = -prominenceWindow; k <= prominenceWindow; k++) {
                    const idx = clamp(bestIdx + k);
                    localMax = Math.max(localMax, signal[idx]);
                    localMin = Math.min(localMin, signal[idx]);
                }
                const prominence = localMax - localMin;
                if (prominence < minProminence) { rejected++; continue; }

                const t = sampleToT(bestIdx + eDelta);
                const actualRadius = radii[bestIdx];

                candidates.push({
                    t, kind: expectedKind, radius: actualRadius, prominence,
                    confidence: 0.5 * Math.min(1, absCurv[i] / maxCurvGlobal)
                        + 0.5 * Math.min(1, prominence / (minProminence * 5)),
                });
            } else {
                rejected++;
            }
        }
    }

    // Deduplicate by T proximity, keeping highest confidence
    candidates.sort((a, b) => a.t - b.t);
    const minSepT = 1.5 / numSamples;
    const features: TDirectionFeature[] = [];
    for (const cand of candidates) {
        if (features.length === 0 || cand.t - features[features.length - 1].t > minSepT) {
            features.push(cand);
        } else if (cand.confidence > features[features.length - 1].confidence) {
            features[features.length - 1] = cand;
        }
    }

    return { features, rejected };
}

// ============================================================================
// v17.1 — Cross-Column Consensus Filter
// ============================================================================

/**
 * Filter column features by cross-column consensus.
 *
 * After running detectTDirectionFeatures() on all columns, this function
 * checks how many columns agree on each T-position. This catches residual
 * global artifacts (taper inflection remnants) even after taper subtraction:
 *
 *   - If >80% of columns detect a feature at the same T → global taper artifact → REJECT
 *   - If <15% of columns detect it → likely noise → REJECT
 *   - Features detected by 15-80% of columns are localized style features → KEEP
 *
 * @param columnFeatures     Per-column detected T-direction features
 * @param numColumns         Total number of columns probed
 * @param numTSamples        Number of T samples per column (for proximity threshold)
 * @param highConsensus      Fraction threshold above which features are global artifacts (default 0.80)
 * @param lowConsensus       Fraction threshold below which features are noise (default 0.15)
 * @returns Filtered columnFeatures (same structure, some features removed) and rejection counts
 */
export function filterByColumnConsensus(
    columnFeatures: TDirectionFeature[][],
    numColumns: number,
    numTSamples: number,
    highConsensus: number = 0.80,
    lowConsensus: number = 0.15
): { filtered: TDirectionFeature[][]; globalRejected: number; noiseRejected: number } {
    // Collect all T-positions across all columns into a histogram
    const tProximity = 3.0 / numTSamples; // ±3 T-samples
    const allTPositions: { t: number; col: number; featIdx: number }[] = [];

    for (let c = 0; c < columnFeatures.length; c++) {
        for (let f = 0; f < columnFeatures[c].length; f++) {
            allTPositions.push({ t: columnFeatures[c][f].t, col: c, featIdx: f });
        }
    }

    if (allTPositions.length === 0) {
        return { filtered: columnFeatures.map(c => [...c]), globalRejected: 0, noiseRejected: 0 };
    }

    // Cluster T-positions by proximity
    allTPositions.sort((a, b) => a.t - b.t);
    const clusters: { tCenter: number; members: typeof allTPositions }[] = [];

    for (const tp of allTPositions) {
        // Find existing cluster within proximity
        let added = false;
        for (const cluster of clusters) {
            if (Math.abs(tp.t - cluster.tCenter) <= tProximity) {
                cluster.members.push(tp);
                // Update center as running average
                cluster.tCenter = cluster.members.reduce((s, m) => s + m.t, 0) / cluster.members.length;
                added = true;
                break;
            }
        }
        if (!added) {
            clusters.push({ tCenter: tp.t, members: [tp] });
        }
    }

    // Determine which features to reject
    const rejectSet = new Set<string>(); // "col:featIdx"
    let globalRejected = 0;
    let noiseRejected = 0;

    for (const cluster of clusters) {
        // Count unique columns in this cluster
        const uniqueCols = new Set(cluster.members.map(m => m.col));
        const fraction = uniqueCols.size / numColumns;

        if (fraction >= highConsensus) {
            // Global artifact — reject all members
            for (const m of cluster.members) {
                rejectSet.add(`${m.col}:${m.featIdx}`);
                globalRejected++;
            }
        } else if (fraction < lowConsensus) {
            // Noise — reject all members
            for (const m of cluster.members) {
                rejectSet.add(`${m.col}:${m.featIdx}`);
                noiseRejected++;
            }
        }
    }

    // Build filtered output
    const filtered: TDirectionFeature[][] = [];
    for (let c = 0; c < columnFeatures.length; c++) {
        const kept: TDirectionFeature[] = [];
        for (let f = 0; f < columnFeatures[c].length; f++) {
            if (!rejectSet.has(`${c}:${f}`)) {
                kept.push(columnFeatures[c][f]);
            }
        }
        filtered.push(kept);
    }

    return { filtered, globalRejected, noiseRejected };
}

// ============================================================================
// v17.1 — Cross-Validation: Verify Column Features Against Row Probe Data
// ============================================================================

/**
 * Search a single row's 8K U-probe data for a verified radius extremum
 * near a given U position.
 *
 * @param rowData       The row's interleaved [x,y,z,...] from GPU
 * @param probeSamples  Number of U samples in the row (8192)
 * @param colIdx        Column index in the row (U position × probeSamples)
 * @param snapWindow    Search window ±samples around colIdx
 * @returns Verified peak info, or null if no extremum found in the window
 */
function findVerifiedUPeakInRow(
    rowData: Float32Array,
    probeSamples: number,
    colIdx: number,
    snapWindow: number
): { peakU: number; kind: FeatureKind; radius: number; prominence: number; confidence: number } | null {
    const wrap = (idx: number) => ((idx % probeSamples) + probeSamples) % probeSamples;
    const colU = colIdx / probeSamples;
    const lo = colIdx - snapWindow;
    const hi = colIdx + snapWindow;

    let foundPeakU = -1;
    let foundKind: FeatureKind = 'peak';
    let foundRadius = 0;
    let foundProminence = 0;
    let foundConfidence = 0;

    for (let si = lo + 1; si < hi; si++) {
        const i = wrap(si);
        const prev = wrap(si - 1);
        const next = wrap(si + 1);

        const x_i = rowData[i * 3], y_i = rowData[i * 3 + 1];
        const x_p = rowData[prev * 3], y_p = rowData[prev * 3 + 1];
        const x_n = rowData[next * 3], y_n = rowData[next * 3 + 1];
        const r_i = Math.sqrt(x_i * x_i + y_i * y_i);
        const r_p = Math.sqrt(x_p * x_p + y_p * y_p);
        const r_n = Math.sqrt(x_n * x_n + y_n * y_n);

        const dLeft = r_i - r_p;
        const dRight = r_n - r_i;
        if (dLeft * dRight >= 0) continue;

        const kind: FeatureKind = dLeft > 0 ? 'peak' : 'valley';

        const denom = r_p - 2 * r_i + r_n;
        let delta = 0;
        if (Math.abs(denom) > 1e-14) {
            delta = 0.5 * (r_p - r_n) / denom;
            delta = Math.max(-0.5, Math.min(0.5, delta));
        }

        const curvOk = kind === 'peak' ? (denom < 0) : (denom > 0);
        if (!curvOk && Math.abs(denom) > 1e-10) continue;

        // Verify refined position
        const fracIdx = ((si + delta) % probeSamples + probeSamples) % probeSamples;
        const iLo = Math.floor(fracIdx);
        const frac = fracIdx - iLo;
        const iHi = wrap(iLo + 1);
        const x_lo = rowData[iLo * 3], y_lo = rowData[iLo * 3 + 1];
        const x_hi = rowData[iHi * 3], y_hi = rowData[iHi * 3 + 1];
        const r_refined = Math.sqrt(
            (x_lo * (1 - frac) + x_hi * frac) ** 2 +
            (y_lo * (1 - frac) + y_hi * frac) ** 2
        );

        // Verify refined position is consistent with extremum type.
        // Tolerance is 1e-6 mm (not 1e-10) because Cartesian interpolation
        // of (x,y) followed by sqrt(x²+y²) is systematically lower than
        // polar interpolation due to the chord-vs-arc effect.
        const isStillExtremum = kind === 'peak'
            ? (r_refined >= r_p - 1e-6 && r_refined >= r_n - 1e-6)
            : (r_refined <= r_p + 1e-6 && r_refined <= r_n + 1e-6);
        if (!isStillExtremum) continue;

        const promWin = Math.max(5, Math.floor(probeSamples * 0.008));
        let localMax = -Infinity, localMin = Infinity;
        for (let k = -promWin; k <= promWin; k++) {
            const idx = wrap(si + k);
            const xk = rowData[idx * 3], yk = rowData[idx * 3 + 1];
            const rk = Math.sqrt(xk * xk + yk * yk);
            localMax = Math.max(localMax, rk);
            localMin = Math.min(localMin, rk);
        }
        const prominence = localMax - localMin;
        if (prominence < 0.005) continue;

        const peakU = (((si + delta) / probeSamples) % 1 + 1) % 1;

        // Pick the closest verified extremum to the column position
        const distToCol = Math.min(
            Math.abs(peakU - colU),
            Math.abs(peakU - colU + 1),
            Math.abs(peakU - colU - 1)
        );

        if (foundPeakU < 0 || distToCol < Math.min(
            Math.abs(foundPeakU - colU),
            Math.abs(foundPeakU - colU + 1),
            Math.abs(foundPeakU - colU - 1)
        )) {
            foundPeakU = peakU;
            foundKind = kind;
            foundRadius = r_refined;
            foundProminence = prominence;
            const gradStrength = Math.abs(dLeft) + Math.abs(dRight);
            foundConfidence = 0.5 * Math.min(1, gradStrength * probeSamples)
                + 0.5 * Math.min(1, prominence / 0.025);
        }
    }

    return foundPeakU >= 0 ? {
        peakU: foundPeakU,
        kind: foundKind,
        radius: foundRadius,
        prominence: foundProminence,
        confidence: foundConfidence
    } : null;
}

/**
 * v17.1: Cross-validate GPU-probed column features against row probe data
 * and merge verified features into per-row feature arrays.
 *
 * For each column feature detected at (columnU, t):
 *   1. Find the two nearest T-rows that bracket this T position
 *   2. In those rows' 8K U-probe data, search for a verified radius
 *      extremum within ±SNAP_WINDOW samples of the column's U position
 *   3. v17.1: Require the row extremum to match the SAME KIND (peak/valley)
 *      as the column feature — prevents cross-contamination
 *   4. v17.1: Require the row extremum prominence to exceed MIN_PROMINENCE
 *   5. Accept only features corroborated by at least one bracketing row
 *   6. Use the EXACT peak U from the row's 8K data (not the column grid U)
 *
 * @param columnFeatures        Per-column detected T-direction features
 * @param columnUPositions      U position [0,1) for each column
 * @param rowProbeData          Per-row GPU probe results (8K samples each)
 * @param probeSamples          Number of U samples per row (8192)
 * @param tPositions            T values for each row
 * @param allRowFeatures        Existing per-row feature U positions (MUTATED)
 * @param allRowTypedFeatures   Existing per-row typed features (MUTATED)
 * @returns Object with addedCount and rejectedCount
 */
export function crossValidateAndMergeColumnFeatures(
    columnFeatures: TDirectionFeature[][],
    columnUPositions: number[],
    rowProbeData: Float32Array[],
    probeSamples: number,
    tPositions: Float32Array,
    allRowFeatures: number[][],
    allRowTypedFeatures: FeaturePoint[][]
): { addedCount: number; rejectedCount: number } {
    const numRows = rowProbeData.length;
    if (numRows < 3 || probeSamples < 16) return { addedCount: 0, rejectedCount: 0 };

    let addedCount = 0;
    let rejectedCount = 0;

    const SNAP_WINDOW = 16; // ±16 samples (~0.7° at 8192 resolution)
    const MIN_SEP = 1.5 / probeSamples;
    const MIN_ROW_PROMINENCE = 0.005; // Must match row detection threshold

    for (let c = 0; c < columnFeatures.length; c++) {
        const colU = columnUPositions[c];
        const colIdx = Math.round(colU * probeSamples);

        for (const feat of columnFeatures[c]) {
            // Find the two nearest T-rows that bracket this T position
            let bestRow = 0;
            let bestDist = Math.abs(tPositions[0] - feat.t);
            for (let j = 1; j < numRows; j++) {
                const d = Math.abs(tPositions[j] - feat.t);
                if (d < bestDist) {
                    bestDist = d;
                    bestRow = j;
                }
            }

            // Determine second bracketing row
            let secondRow = -1;
            if (feat.t < tPositions[bestRow] && bestRow > 0) {
                secondRow = bestRow - 1;
            } else if (feat.t > tPositions[bestRow] && bestRow < numRows - 1) {
                secondRow = bestRow + 1;
            }

            // Try nearest row first, then secondary row as fallback
            let result = findVerifiedUPeakInRow(
                rowProbeData[bestRow], probeSamples, colIdx, SNAP_WINDOW
            );
            let targetRow = bestRow;

            // v17.1: Kind-aware validation — row extremum must match column feature kind
            if (result && result.kind !== feat.kind) {
                result = null; // Kind mismatch → try second row
            }
            // v17.1: Prominence gate — row extremum must be significant
            if (result && result.prominence < MIN_ROW_PROMINENCE) {
                result = null;
            }

            if (!result && secondRow >= 0) {
                result = findVerifiedUPeakInRow(
                    rowProbeData[secondRow], probeSamples, colIdx, SNAP_WINDOW
                );
                targetRow = secondRow;

                // v17.1: Same kind + prominence checks on fallback row
                if (result && result.kind !== feat.kind) {
                    result = null;
                }
                if (result && result.prominence < MIN_ROW_PROMINENCE) {
                    result = null;
                }
            }

            if (!result) {
                rejectedCount++;
                continue;
            }

            // Dedup: don't add if existing row feature is too close
            const existingFeats = allRowFeatures[targetRow];
            let isDuplicate = false;
            for (const ef of existingFeats) {
                if (circularDistance(ef, result.peakU) < MIN_SEP) {
                    isDuplicate = true;
                    break;
                }
            }

            if (!isDuplicate) {
                allRowFeatures[targetRow].push(result.peakU);
                allRowFeatures[targetRow].sort((a, b) => a - b);

                if (targetRow < allRowTypedFeatures.length) {
                    allRowTypedFeatures[targetRow].push({
                        u: result.peakU,
                        kind: result.kind,
                        radius: result.radius,
                        prominence: result.prominence,
                        confidence: result.confidence,
                    });
                }
                addedCount++;
            }
        }
    }

    return { addedCount, rejectedCount };
}