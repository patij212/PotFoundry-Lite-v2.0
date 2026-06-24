/**
 * sampleFields.ts — Two-D field sampler: surface normal + max principal curvature
 * over a (u,t) grid.
 *
 * {@link sampleFeatureFields} is the single entry point consumed by all three
 * detectors (curvature-ridge tracer, normal-discontinuity detector,
 * component-boundary detector). It takes only a {@link SurfaceSampler} and a
 * resolution — no style id, no per-style branches.
 *
 * Implementation notes:
 * - Normal: cross product of central-difference tangents Pu × Pt, normalised.
 * - Curvature: reuses {@link principalCurvatureMax} from SurfaceMetricTensor
 *   with grid-scaled steps (hu = 1/resU, ht = 1/(resT-1)) so the stencil spans
 *   approximately one grid cell and de-noises any quantization from discrete
 *   samplers (see SurfaceMetricTensor.ts for the rationale).
 *
 * @module conforming/featureGraph/sampleFields
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import { principalCurvatureMax } from '../SurfaceMetricTensor';
import type { Fields } from './types';

/** Options for {@link sampleFeatureFields}. */
export interface SampleFieldsOptions {
  /** Number of distinct u columns (u ∈ [0,1), periodic). Must be ≥ 2. */
  resU: number;
  /** Number of distinct t rows (t ∈ [0,1], clamped). Must be ≥ 2. */
  resT: number;
}

/**
 * Sample the surface normal and max principal curvature over a resU × resT grid.
 *
 * Grid layout: row-major, node (i,j) at u = i/resU, t = j/(resT-1),
 * linear index = j*resU + i.
 *
 * Finite-difference steps: hu = 1/resU (one u-cell), ht = 1/(resT-1) (one t-cell).
 * These grid-scaled steps recover the true smooth-surface curvature even when the
 * sampler interpolates a discrete pre-evaluated grid.
 */
export function sampleFeatureFields(
  sampler: SurfaceSampler,
  opts: SampleFieldsOptions,
): Fields {
  const { resU, resT } = opts;
  const n = resU * resT;

  const kappa = new Float64Array(n);
  const nx = new Float64Array(n);
  const ny = new Float64Array(n);
  const nz = new Float64Array(n);

  // Grid-scaled finite-difference steps (one cell in each axis).
  const hu = 1 / resU;
  const ht = 1 / (resT - 1);

  for (let j = 0; j < resT; j++) {
    const t = j / (resT - 1);
    for (let i = 0; i < resU; i++) {
      const u = i / resU;
      const idx = j * resU + i;

      // --- Surface normal via central-difference tangents ---
      // u is periodic, so u+hu and u-hu always wrap correctly.
      const Pup = sampler.position(u + hu, t);
      const Pum = sampler.position(u - hu, t);

      // t is clamped: shrink the step near the poles so we don't read outside [0,1].
      const htc = clampStepT(t, ht);
      const Ptp = sampler.position(u, t + htc);
      const Ptm = sampler.position(u, t - htc);

      // Pu = (P(u+hu,t) - P(u-hu,t)) / (2*hu)  — we only need direction, skip /2hu.
      const puX = Pup[0] - Pum[0];
      const puY = Pup[1] - Pum[1];
      const puZ = Pup[2] - Pum[2];

      // Pt = (P(u,t+htc) - P(u,t-htc)) / (2*htc)
      const ptX = Ptp[0] - Ptm[0];
      const ptY = Ptp[1] - Ptm[1];
      const ptZ = Ptp[2] - Ptm[2];

      // n = Pu × Pt (cross product, then normalize).
      const cnX = puY * ptZ - puZ * ptY;
      const cnY = puZ * ptX - puX * ptZ;
      const cnZ = puX * ptY - puY * ptX;
      const len = Math.hypot(cnX, cnY, cnZ);

      if (len > 1e-30) {
        nx[idx] = cnX / len;
        ny[idx] = cnY / len;
        nz[idx] = cnZ / len;
      }
      // (else leave as zero — degenerate point; detectors treat |n|=0 as masked)

      // --- Max principal curvature ---
      kappa[idx] = principalCurvatureMax(sampler, u, t, hu, ht);
    }
  }

  return {
    resU,
    resT,
    kappa,
    nx,
    ny,
    nz,
    uOf: (i: number) => i / resU,
    tOf: (j: number) => j / (resT - 1),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clamp a t-evaluation step so the sample stays inside [0,1]. Returns the
 * effective step (central differences shrink near the caps rather than reading
 * outside the domain). Mirrors the same helper in SurfaceMetricTensor.ts so
 * the normal and curvature stencils use identical step sizes.
 */
function clampStepT(t: number, h: number): number {
  const hi = 1 - t;
  const lo = t;
  return Math.max(1e-9, Math.min(h, hi, lo));
}
