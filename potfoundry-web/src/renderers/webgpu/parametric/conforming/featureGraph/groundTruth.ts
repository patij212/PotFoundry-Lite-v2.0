/**
 * groundTruth.ts — Dense brute-force relief-wall truth extractor.
 *
 * Produces a ground-truth relief-wall locus by running {@link marchingSquaresZero}
 * on a uniform high-res grid — NO fired-cell logic, NO connected-component grouping,
 * NO unifier. This is the GLOBAL, brute-force version of what the detector's
 * component-boundary tracer does only inside fired components, making it a fully
 * independent reference the validation gate can score the detector against.
 *
 * The relief indicator used here is IDENTICAL (formula copied verbatim) to the one
 * in {@link ./validation.test.ts} so the gate measures the MACHINERY (two-scale
 * fired-cell pipeline vs. brute-force uniform pass), not the feature definition.
 *
 * Correctness is load-bearing — keep this module SIMPLE and obviously correct.
 *
 * @module conforming/featureGraph/groundTruth
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import { marchingSquaresZero } from '../SampledFeatureExtractor';
import type { FeatureLine } from '../FeatureLineGraph';

// ---------------------------------------------------------------------------
// Relief indicator — VERBATIM copy of the formula in validation.test.ts.
// (Copied rather than re-exported to keep the truth self-contained and
//  obviously using the same definition — any divergence is a test compile error.)
// ---------------------------------------------------------------------------

/** u-samples for the per-t-row mean radius + RMS. */
const RELIEF_MEAN_SAMPLES = 256;

/**
 * Fraction of the row's relief RMS below which |relief| is treated as noise.
 * 0.5 ≈ "wall = at least half-an-RMS of radial relief"; GLOBAL for all styles.
 */
const RELIEF_ALPHA = 0.5;

/**
 * Absolute mm noise floor so a perfectly flat row (RMS≈0, pure float jitter)
 * yields a strictly negative indicator (no spurious zero crossing). GLOBAL.
 */
const RELIEF_ABS_FLOOR_MM = 1e-3;

/** Radius the sampler encodes at (u,t): r = hypot(x, y). */
function samplerRadius(sampler: SurfaceSampler, u: number, t: number): number {
  const [x, y] = sampler.position(u, t);
  return Math.hypot(x, y);
}

interface RowStats {
  mean: number;
  floor: number;
}

/**
 * Build the ONE GLOBAL relief indicator for a sampler (IDENTICAL formula to
 * {@link ./validation.test.ts} `makeReliefIndicator`):
 *   indicator(u,t) = |r(u,t) − meanOverU(r(·,t))| − floor(t),
 *   floor(t) = max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA · rmsOverU(relief)).
 * Per-t-row stats are memoized (the marching-squares grid samples each row's
 * indicator at many u for one t). No styleId, no per-style params.
 */
export function makeReliefIndicator(sampler: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, RowStats>();
  const statsAtT = (t: number): RowStats => {
    const cached = rowStats.get(t);
    if (cached !== undefined) return cached;
    let sum = 0;
    const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) {
      const r = samplerRadius(sampler, i / RELIEF_MEAN_SAMPLES, t);
      rs[i] = r;
      sum += r;
    }
    const mean = sum / RELIEF_MEAN_SAMPLES;
    let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) {
      const d = rs[i] - mean;
      sq += d * d;
    }
    const rms = Math.sqrt(sq / RELIEF_MEAN_SAMPLES);
    const stats: RowStats = {
      mean,
      floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * rms),
    };
    rowStats.set(t, stats);
    return stats;
  };
  return (u: number, t: number): number => {
    const { mean, floor } = statsAtT(t);
    return Math.abs(samplerRadius(sampler, u, t) - mean) - floor;
  };
}

// ---------------------------------------------------------------------------
// Dense relief-wall truth extractor
// ---------------------------------------------------------------------------

/**
 * Brute-force relief-wall locus at uniform high resolution.
 *
 * Runs {@link marchingSquaresZero} on the given relief indicator at `res × res`
 * with `periodicU = true`, then maps each {@link ContourSegment} to a 2-point
 * {@link FeatureLine} at safe defaults for the required fields.
 *
 * This is INDEPENDENT of the detector's fired-cell / connected-component /
 * unifier machinery — the independence is in the GLOBAL brute-force strategy,
 * not in the low-level marching-squares primitive (which is a shared utility).
 *
 * @param reliefIndicator  A `(u,t)=>number` scalar field whose zero set is the
 *                         relief-wall locus (positive inside the wall, negative
 *                         in smooth regions). Build with {@link makeReliefIndicator}.
 * @param res              Uniform grid resolution (both u and t axes). Use ≥ 256
 *                         for synthetic tests; ≥ 384 for the validate-the-validator
 *                         cross-check.
 * @returns                Unassembled 2-point {@link FeatureLine}s — one per
 *                         marching-squares contour segment. Assembling into polylines
 *                         is not required for the coverage metric.
 */
export function denseReliefWallTruth(
  reliefIndicator: (u: number, t: number) => number,
  res: number,
): FeatureLine[] {
  const segs = marchingSquaresZero(reliefIndicator, res, res, /*periodicU*/ true);
  return segs.map((seg) => ({
    kind: 'general-curve' as const,
    points: [seg.a, seg.b],
    label: 'relief-wall-truth',
  }));
}
