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
import { sampleFeatureFields } from './sampleFields';
import type { Fields } from './types';

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

// ---------------------------------------------------------------------------
// Dense ridge truth — brute-force curvature-ridge extractor
// ---------------------------------------------------------------------------

/**
 * Brute-force curvature-ridge ground truth.
 *
 * A node (i,j) is a ridge point iff:
 *   1. kappa[idx] >= kappaFloor  (above the scale-invariant floor), AND
 *   2. kappa is a 1D local maximum across u  (compare i-1 and i+1, periodic wrap)
 *      OR across t  (compare j-1 and j+1, clamped at the t-boundaries).
 *
 * Each marked node is then connected to its marked 4-neighbours (right u, up t)
 * as 2-point FeatureLines in global (u,t) parameter space.
 *
 * This is INDEPENDENT of curvatureRidge.ts — plain loops over the Fields grid.
 *
 * @param fields     The sampled field grid from {@link sampleFeatureFields}.
 * @param kappaFloor Minimum curvature threshold (mm⁻¹). Use the detector's
 *                   scale-invariant floor: RIDGE_KAPPA_FACTOR / Rchar.
 */
export function denseRidgeTruth(fields: Fields, kappaFloor: number): FeatureLine[] {
  const { resU, resT, kappa, uOf, tOf } = fields;

  // Build the boolean mark grid.
  const marked = new Uint8Array(resU * resT);

  for (let j = 0; j < resT; j++) {
    for (let i = 0; i < resU; i++) {
      const idx = j * resU + i;
      const k = kappa[idx];
      if (k < kappaFloor) continue;

      // Periodic u neighbours.
      const iPrev = (i - 1 + resU) % resU;
      const iNext = (i + 1) % resU;
      const localMaxU = k >= kappa[j * resU + iPrev] && k >= kappa[j * resU + iNext];

      // Clamped t neighbours.
      const jPrev = Math.max(j - 1, 0);
      const jNext = Math.min(j + 1, resT - 1);
      const localMaxT = k >= kappa[jPrev * resU + i] && k >= kappa[jNext * resU + i];

      if (localMaxU || localMaxT) {
        marked[idx] = 1;
      }
    }
  }

  // Connect each marked node to its marked 4-neighbours (right u, up t) as 2-point lines.
  const lines: FeatureLine[] = [];

  for (let j = 0; j < resT; j++) {
    for (let i = 0; i < resU; i++) {
      const idx = j * resU + i;
      if (!marked[idx]) continue;

      const u0 = uOf(i);
      const t0 = tOf(j);

      // Right u neighbour (periodic).
      const iRight = (i + 1) % resU;
      if (marked[j * resU + iRight]) {
        lines.push({
          kind: 'general-curve',
          points: [{ u: u0, t: t0 }, { u: uOf(iRight), t: t0 }],
          label: 'ridge-truth',
        });
      }

      // Up t neighbour (clamped: j+1 only if in range).
      if (j + 1 < resT && marked[(j + 1) * resU + i]) {
        lines.push({
          kind: 'general-curve',
          points: [{ u: u0, t: t0 }, { u: u0, t: tOf(j + 1) }],
          label: 'ridge-truth',
        });
      }
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Dense crease truth — brute-force normal-discontinuity extractor
// ---------------------------------------------------------------------------

/**
 * Brute-force normal-discontinuity ground truth.
 *
 * For each grid edge between two adjacent nodes, computes the angle (degrees)
 * between the unit surface normals at the two endpoints. If the angle exceeds
 * `minAngleDeg`, the edge is emitted as a 2-point FeatureLine.
 *
 * Two types of edges are checked:
 *   - Horizontal u-edges: node (i,j) ↔ (i+1,j) with periodic u wrap.
 *   - Vertical t-edges:   node (i,j) ↔ (i,j+1) with clamped t (only within range).
 *
 * This is INDEPENDENT of normalDiscontinuity.ts — plain loops over the Fields grid.
 *
 * @param fields      The sampled field grid from {@link sampleFeatureFields}.
 * @param minAngleDeg Minimum angle (degrees) between normals to count as a crease.
 */
export function denseCreaseTruth(fields: Fields, minAngleDeg: number): FeatureLine[] {
  const { resU, resT, nx, ny, nz, uOf, tOf } = fields;
  const minCos = Math.cos(minAngleDeg * (Math.PI / 180));

  const lines: FeatureLine[] = [];

  for (let j = 0; j < resT; j++) {
    for (let i = 0; i < resU; i++) {
      const idxA = j * resU + i;

      // --- Horizontal edge: (i,j) ↔ (i+1,j), periodic u ---
      const iRight = (i + 1) % resU;
      const idxRight = j * resU + iRight;
      const dotRight = nx[idxA] * nx[idxRight] + ny[idxA] * ny[idxRight] + nz[idxA] * nz[idxRight];
      if (dotRight < minCos) {
        lines.push({
          kind: 'general-curve',
          points: [{ u: uOf(i), t: tOf(j) }, { u: uOf(iRight), t: tOf(j) }],
          label: 'crease-truth',
        });
      }

      // --- Vertical edge: (i,j) ↔ (i,j+1), clamped t ---
      if (j + 1 < resT) {
        const idxUp = (j + 1) * resU + i;
        const dotUp = nx[idxA] * nx[idxUp] + ny[idxA] * ny[idxUp] + nz[idxA] * nz[idxUp];
        if (dotUp < minCos) {
          lines.push({
            kind: 'general-curve',
            points: [{ u: uOf(i), t: tOf(j) }, { u: uOf(i), t: tOf(j + 1) }],
            label: 'crease-truth',
          });
        }
      }
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Combined dense-truth entry point — detector-matched config, union of all families
// ---------------------------------------------------------------------------

/**
 * Number of chord segments used to measure the u-circumference for kappaFloor.
 * MUST match the MEASURE_N constant in detectFeatures.ts so the derived
 * kappaFloor is identical to the detector's.
 */
const MEASURE_N_GT = 128;

/**
 * Dimensionless scale factor for the curvature floor.
 * MUST match RIDGE_KAPPA_FACTOR in detectFeatures.ts.
 */
const RIDGE_KAPPA_FACTOR_GT = 2;

/**
 * Minimum normal-angle discontinuity (degrees) for the crease detector.
 * MUST match GLOBAL_OPTS.minAngleDeg in detectFeatures.ts.
 */
const MIN_ANGLE_DEG_GT = 28;

/**
 * Measure the 3D chord length of the u-ring at t=0.5 (IDENTICAL to
 * measureUCircumference in detectFeatures.ts — verbatim copy for independence).
 */
function measureUCircumferenceGT(sampler: SurfaceSampler): number {
  let total = 0;
  const [px0, py0, pz0] = sampler.position(0, 0.5);
  let prevX = px0, prevY = py0, prevZ = pz0;
  for (let i = 1; i <= MEASURE_N_GT; i++) {
    const u = i / MEASURE_N_GT; // at i===MEASURE_N_GT wraps to u=1 = u=0 (periodic close)
    const [cx, cy, cz] = sampler.position(u % 1, 0.5);
    const dx = cx - prevX, dy = cy - prevY, dz = cz - prevZ;
    total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    prevX = cx; prevY = cy; prevZ = cz;
  }
  return total;
}

/**
 * Options for {@link denseFeatureGroundTruth}.
 */
export interface DenseFeatureGroundTruthOptions {
  /** Grid resolution for sampling (both u and t axes). Use ≥ 192. */
  res: number;
  /**
   * u→mm scale factor (circumference). Accepted for forward-compatibility but
   * NOT used internally — the function derives its own scale from the sampler
   * to stay detector-matched. Reserved for future metric use by the caller.
   */
  uToMm: number;
  /**
   * t→mm scale factor (height). Accepted for forward-compatibility but NOT used
   * internally — see uToMm note above.
   */
  tToMm: number;
}

/**
 * Dense brute-force ground-truth entry point: union of the three truth families.
 *
 * Returns the CONCATENATION of:
 *   - {@link denseRidgeTruth}   — curvature ridges (label `'ridge-truth'`)
 *   - {@link denseCreaseTruth}  — normal-discontinuity creases (label `'crease-truth'`)
 *   - {@link denseReliefWallTruth} — relief-wall locus (label `'relief-wall-truth'`)
 *
 * The detector-matched configuration is derived from the sampler:
 *   - `kappaFloor = RIDGE_KAPPA_FACTOR / Rchar` where
 *     `Rchar = uCircumference / (2π)`, `uCircumference` measured identically to
 *     `detectFeatures.ts`'s `measureUCircumference`.
 *   - `minAngleDeg = 28` (the detector's GLOBAL_OPTS value).
 *   - `reliefIndicator = makeReliefIndicator(sampler)`.
 *
 * Coincident loci across families are NOT deduped — the arclength-coverage
 * metric is robust to overlap; keeping it simple preserves correctness.
 *
 * Independence: does NOT import any detector tracers/unifier/fired-cell logic.
 * Only the shared primitives + Tasks 1–2 functions above.
 *
 * @param sampler  The surface sampler (analytic CPU sampler).
 * @param opts     Resolution + scale factors (see {@link DenseFeatureGroundTruthOptions}).
 * @returns        Concatenated ground-truth FeatureLines (all three families).
 */
export function denseFeatureGroundTruth(
  sampler: SurfaceSampler,
  opts: DenseFeatureGroundTruthOptions,
): FeatureLine[] {
  const { res } = opts;

  // 1. Sample fields ONCE at res × res.
  const fields = sampleFeatureFields(sampler, { resU: res, resT: res });

  // 2. Derive detector-matched config.
  const uCircumference = measureUCircumferenceGT(sampler);
  const Rchar = uCircumference / (2 * Math.PI);
  const kappaFloor = RIDGE_KAPPA_FACTOR_GT / Rchar;
  const reliefIndicator = makeReliefIndicator(sampler);

  // 3. Union of the three families (no dedup — overlap is harmless).
  return [
    ...denseRidgeTruth(fields, kappaFloor),
    ...denseCreaseTruth(fields, MIN_ANGLE_DEG_GT),
    ...denseReliefWallTruth(reliefIndicator, res),
  ];
}

// Re-export Fields type for test convenience.
export type { Fields };
