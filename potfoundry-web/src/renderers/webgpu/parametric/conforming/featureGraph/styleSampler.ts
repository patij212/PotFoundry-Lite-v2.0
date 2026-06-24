/**
 * styleSampler.ts — VALIDATION-ONLY CPU SurfaceSampler bridge.
 *
 * ⚠️ THIS FILE IS NOT PART OF THE DETECTOR. ⚠️
 *
 * The style-agnostic feature detector ({@link detectFeatures}) only ever sees a
 * {@link SurfaceSampler} — it never knows which style produced the surface and
 * carries NO per-style code. This module exists solely so the validation harness
 * ({@link ./validation.test.ts}) can feed the detector a real procedural surface
 * for each of the 20 styles and compare its output to the per-style analytic
 * reference loci ({@link extractAnalyticFeatures}).
 *
 * The styleId→radiusFn table below ({@link STYLE_FUNCTIONS} from
 * `src/geometry/styles.ts`) is therefore VALIDATION SCAFFOLDING ONLY. It is the
 * inverse of the deliverable's premise: the whole point of the detector is that
 * it does NOT need this table. The harness uses it only to synthesize ground-truth
 * surfaces whose features land exactly where the reference says they should.
 *
 * ## Why this is consistent with the reference extractor
 *
 * `extractAnalyticFeatures(styleId, packedParams, dims)` derives its loci from the
 * WGSL radius math, parameterized by a packed `Float32Array` (WGSL `style_param()`
 * slot order). The CPU `rOuter*` radius functions in `src/geometry/styles.ts` are a
 * literal port of that SAME WGSL math, parameterized by the named camelCase
 * {@link StyleOptions} struct. Both sides read identical numeric DEFAULTS
 * (`DEFAULT_STYLE_PARAMS`, verified equal to the snake_case packer defaults in
 * `src/utils/styleParams.ts`), so a surface built here and a reference built from
 * `buildStyleParamPayload(styleId, {})` describe the SAME geometry. The harness
 * drives both from one place to keep them in lockstep.
 *
 * ## Parameter-space convention (shared with the detector and the reference)
 *
 *   u ∈ [0,1) periodic, t ∈ [0,1] clamped.
 *   theta = 2π·u,  z = t·H.
 *   position(u,t) = [ r·cos(theta), r·sin(theta), z ]
 * where r = rOuter_style(theta, z, r0(z), H, opts) and r0(z) is the smooth base
 * flare profile. No spin/twist (defaults give spinTurns=0), so the detector's
 * (u,t) and the reference's (u,t) are the SAME space — no convention conversion.
 *
 * ## Why a PRE-EVALUATED grid (GpuSurfaceSampler), not the raw analytic function
 *
 * In production the detector consumes a {@link GpuSurfaceSampler}: a dense grid of
 * 3D positions evaluated ONCE, then bilinearly interpolated. The curvature
 * estimator ({@link principalCurvatureMax}) deliberately uses one-grid-cell-sized
 * finite-difference steps so the stencil spans a whole bilinear patch and recovers
 * the true, BOUNDED smooth-surface curvature (see SurfaceMetricTensor.ts).
 *
 * Feeding the RAW analytic radius function instead would let those same one-cell
 * steps straddle a sharp C0 crease, producing spurious ~10⁶ (and NaN) curvature —
 * an artifact of evaluating a discontinuous function at sub-cell precision that the
 * production sampler never exhibits. To produce EXACTLY the SurfaceSampler shape
 * the detector consumes in production, this builder pre-evaluates the dense grid
 * and returns a {@link GpuSurfaceSampler} — the same discretize-then-interpolate
 * contract, just CPU-evaluated. (This mirrors `gridResolution()`, which the
 * curvature estimator reads to size its steps.)
 *
 * @module conforming/featureGraph/styleSampler
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { STYLE_FUNCTIONS } from '../../../../../geometry/styles';
import { baseRadius } from '../../../../../geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../../../../../geometry/types';
import type { StyleId, StyleOptions } from '../../../../../geometry/types';

/** Pot dimensions for the synthesized surface (mm). */
export interface StyleSamplerDims {
  /** Total height (mm). */
  H: number;
  /** Top radius (mm). */
  Rt: number;
  /** Bottom radius (mm). */
  Rb: number;
  /** Flare exponent for the base profile (1 = linear flare). Default 1. */
  expn?: number;
  /**
   * Pre-evaluation grid resolution (u columns × t rows). Higher = sharper crease
   * placement (a feature lands within ~1 grid cell of its true locus). Defaults
   * mirror a dense production export grid. Same value for every style.
   */
  gridResU?: number;
  gridResT?: number;
}

/** Default pre-evaluation grid (u columns × t rows). */
const DEFAULT_GRID_U = 512;
const DEFAULT_GRID_T = 512;

/**
 * Build a CPU {@link SurfaceSampler} for one style by pre-evaluating its `rOuter*`
 * radius function on a dense grid and wrapping it in a {@link GpuSurfaceSampler}
 * (the SAME discretize-then-bilinear-interpolate contract production uses).
 *
 * @param styleId  One of the 20 {@link StyleId} keys.
 * @param params   Named camelCase style options. Pass `{}` to use the style's
 *                 defaults (`DEFAULT_STYLE_PARAMS[styleId]`), which is what the
 *                 harness uses so the surface matches `buildStyleParamPayload(id,{})`.
 * @param dims     Pot dimensions (H, Rt, Rb, optional expn + grid resolution).
 */
export function styleSampler(
  styleId: StyleId,
  params: StyleOptions,
  dims: StyleSamplerDims,
): SurfaceSampler {
  const radiusFn = STYLE_FUNCTIONS[styleId];
  const { H, Rt, Rb } = dims;
  const expn = dims.expn ?? 1;
  const resU = dims.gridResU ?? DEFAULT_GRID_U;
  const resT = dims.gridResT ?? DEFAULT_GRID_T;

  // Merge the style's defaults with any explicit overrides so callers that pass
  // {} get the canonical default surface (matching the reference's default loci).
  const opts: StyleOptions = { ...DEFAULT_STYLE_PARAMS[styleId], ...params };

  // Pre-evaluate the dense grid, row-major: positions[(row*resU + col)*3].
  const positions = new Float32Array(resU * resT * 3);
  for (let row = 0; row < resT; row++) {
    const t = row / (resT - 1);
    const z = t * H;
    const r0 = baseRadius(z, H, Rb, Rt, expn, opts);
    for (let col = 0; col < resU; col++) {
      const u = col / resU;
      const theta = 2 * Math.PI * u;
      const r = radiusFn(theta, z, r0, H, opts);
      const base = (row * resU + col) * 3;
      positions[base] = r * Math.cos(theta);
      positions[base + 1] = r * Math.sin(theta);
      positions[base + 2] = z;
    }
  }

  return new GpuSurfaceSampler(positions, resU, resT);
}
