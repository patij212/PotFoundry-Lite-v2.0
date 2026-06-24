/**
 * curvatureRidge.ts — Curvature-ridge detector for the feature-graph pipeline.
 *
 * Detects smooth crests and valleys of the max-principal-curvature field κ by
 * finding nodes where κ is a LOCAL MAXIMUM in the direction of the κ-gradient
 * (the standard "1-ring ridge test"). This catches profile ridges on superformula,
 * Fourier, harmonic, and spiral surfaces without any per-style knowledge.
 *
 * ## Algorithm
 *
 * 1. For every INTERIOR grid node (i,j) (skipping the t-boundary rows):
 *    a. Estimate the κ-gradient vector ∇κ via central differences:
 *         gU = (κ[i+1,j] − κ[i−1,j]) / 2   (u is periodic)
 *         gT = (κ[i,j+1] − κ[i,j−1]) / 2   (t is interior → no clamping needed)
 *    b. PRIMARY GATE — dominant-axis strict local maximum: compare |gU|² vs |gT|²
 *       to find which axis carries the gradient, then require κ[i,j] to be a
 *       strict maximum along that axis:
 *         if |gU|² ≥ |gT|²  (ridge runs along t): κ[i,j] > κ[i−1,j] AND κ[i,j] > κ[i+1,j]
 *         if |gT|² > |gU|²  (ridge runs along u): κ[i,j] > κ[i,j−1] AND κ[i,j] > κ[i,j+1]
 *       This is the primary discriminator. Without it, the entire concave-down
 *       half-period of a cosine κ field would be marked as ridge.
 *    c. SECONDARY GATE — second directional derivative D²κ < 0 (concave-down
 *       crest confirmation, redundant but cheap):
 *         D²κ = gU²·(κ[i+1,j] + κ[i−1,j] − 2·κ[i,j])
 *             + gT²·(κ[i,j+1] + κ[i,j−1] − 2·κ[i,j])
 *             + 2·gU·gT·(κ[i+1,j+1] − κ[i+1,j−1] − κ[i−1,j+1] + κ[i−1,j−1]) / 4
 *       Mark the node as a RIDGE only if D²κ < 0 AND κ[i,j] > minStrength.
 *
 * 2. Emit segments between adjacent ridge-marked nodes in the same grid row or
 *    column. Two ridge nodes that share a grid edge produce one segment connecting
 *    their (u,t) positions. Per-segment strength = the average κ of the two
 *    endpoints.
 *
 * The detector is style-agnostic: it only reads the `Fields` struct produced by
 * {@link sampleFeatureFields}.
 *
 * @module conforming/featureGraph/curvatureRidge
 */

import type { Fields } from './types';
import type { RawSegments, RawSegment } from './componentBoundary';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for {@link detectCurvatureRidge}. */
export interface CurvatureRidgeOptions {
  /**
   * Minimum κ (mm⁻¹) for a node to be considered a ridge candidate. Nodes
   * with κ ≤ minStrength are never marked, even if they are local κ-maxima.
   * Set to a value well below the expected feature κ (e.g. 0.05) so that
   * the smooth baseline (hoop curvature ≈ 1/R₀ for a plain cylinder) is
   * filtered out when it has no ridges.
   */
  minStrength: number;
}

/**
 * Detect curvature ridges in a pre-sampled field grid.
 *
 * A ridge is a curve on which κ is locally maximum in the direction of ∇κ
 * (concave-down crest of the curvature field). The detector uses a standard
 * 1-ring second-directional-difference test.
 *
 * @param fields  Sampled surface-normal + max-principal-curvature grid from
 *                {@link sampleFeatureFields}.
 * @param opts    Detection options — at minimum, `minStrength`.
 * @returns       {@link RawSegments} with `type: 'curvature-ridge'` and
 *                per-segment `strength = κ` at the ridge.
 */
export function detectCurvatureRidge(
  fields: Fields,
  opts: CurvatureRidgeOptions,
): RawSegments {
  const { resU, resT, kappa, uOf, tOf } = fields;
  const { minStrength } = opts;

  // -------------------------------------------------------------------------
  // Step 1 — Mark ridge nodes
  // -------------------------------------------------------------------------
  // ridge[j * resU + i] = true when node (i,j) is on a ridge.
  const ridge = new Uint8Array(resU * resT);

  // Skip j=0 and j=resT-1 (t-boundary rows): clamped finite differences
  // there would require special-cased stencils and produce unreliable gradients.
  for (let j = 1; j < resT - 1; j++) {
    for (let i = 0; i < resU; i++) {
      const idx = j * resU + i;
      const k0 = kappa[idx];

      // Fast gate: skip nodes below the strength threshold.
      if (k0 <= minStrength) continue;

      // Periodic neighbours in u.
      const im = (i - 1 + resU) % resU;
      const ip = (i + 1) % resU;

      // Neighbour κ values.
      const kU0 = kappa[j * resU + im]; // κ[i-1, j]
      const kU2 = kappa[j * resU + ip]; // κ[i+1, j]
      const kT0 = kappa[(j - 1) * resU + i]; // κ[i, j-1]
      const kT2 = kappa[(j + 1) * resU + i]; // κ[i, j+1]

      // Strict local-maximum gate in the direction of the κ-gradient.
      //
      // D²κ < 0 alone is necessary but not sufficient: for a cosine κ field
      // the entire concave-down half-period satisfies D²κ < 0, so without
      // this gate we would mark ±(period/4) columns around each extremum.
      //
      // We require k0 to be a strict local max along whichever axis carries
      // more of the gradient (dominant-axis check). For ridges running along t
      // (e.g. profile crests on a rippled cylinder), the gradient is in u —
      // we require k0 > kU0 && k0 > kU2. For ridges running along u, the
      // gradient is in t — we require k0 > kT0 && k0 > kT2. Using only the
      // dominant axis avoids false rejections when the perpendicular κ
      // variation (which is near-zero on a pure u-ridge) causes one t-neighbor
      // to exceed k0 by a floating-point rounding difference.
      {
        const gUSq = (kU2 - kU0) * (kU2 - kU0);
        const gTSq = (kT2 - kT0) * (kT2 - kT0);
        if (gUSq >= gTSq) {
          // Gradient is primarily in u: require local max along u.
          if (k0 <= kU0 || k0 <= kU2) continue;
        } else {
          // Gradient is primarily in t: require local max along t.
          if (k0 <= kT0 || k0 <= kT2) continue;
        }
      }

      // κ-gradient components (unnormalized, central differences, /2 omitted
      // because the sign of D²κ is all that matters).
      const gU = kU2 - kU0;
      const gT = kT2 - kT0;

      // Second directional derivative of κ along ∇κ (Hessian contracted with
      // the gradient direction, i.e. g^T · H · g up to a positive scalar).
      //
      //  H_uu = κ[i+1,j] + κ[i-1,j] − 2·κ[i,j]
      //  H_tt = κ[i,j+1] + κ[i,j-1] − 2·κ[i,j]
      //  H_ut = (κ[i+1,j+1] − κ[i+1,j-1] − κ[i-1,j+1] + κ[i-1,j-1]) / 4
      //
      //  D²κ ∝ gU²·H_uu + 2·gU·gT·H_ut + gT²·H_tt
      //
      const hUU = kU2 + kU0 - 2 * k0;
      const hTT = kT2 + kT0 - 2 * k0;

      // Mixed partial — needs diagonal neighbours.
      const kPP = kappa[(j + 1) * resU + ip]; // [i+1, j+1]
      const kPM = kappa[(j - 1) * resU + ip]; // [i+1, j-1]
      const kMP = kappa[(j + 1) * resU + im]; // [i-1, j+1]
      const kMM = kappa[(j - 1) * resU + im]; // [i-1, j-1]
      const hUT = (kPP - kPM - kMP + kMM) * 0.25;

      const d2 = gU * gU * hUU + 2 * gU * gT * hUT + gT * gT * hTT;

      // Ridge = concave-down crest (D²κ < 0) with sufficient strength.
      if (d2 < 0) {
        ridge[idx] = 1;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 2 — Emit segments between adjacent ridge-marked nodes
  // -------------------------------------------------------------------------
  // Two ridge nodes connected by a grid edge produce one segment. We iterate
  // over all horizontal (same j) and vertical (same i) grid edges.

  const segs: RawSegment[] = [];

  for (let j = 0; j < resT; j++) {
    for (let i = 0; i < resU; i++) {
      const idxA = j * resU + i;
      if (!ridge[idxA]) continue;

      const kA = kappa[idxA];
      const uA = uOf(i);
      const tA = tOf(j);

      // Horizontal neighbour (i+1). Skip the seam-wrap edge (i = resU-1 →
      // ip = 0): the midpoint (uOf(resU-1) + uOf(0))/2 ≈ 0.5 which is far
      // from the actual seam position at u≈1 and would fail proximity tests.
      // The seam ridge is captured by the vertical segments that run along it.
      if (i + 1 < resU) {
        const ip = i + 1;
        const idxB_h = j * resU + ip;
        if (ridge[idxB_h]) {
          const kB = kappa[idxB_h];
          segs.push({
            a: { u: uA, t: tA },
            b: { u: uOf(ip), t: tA },
            strength: (kA + kB) * 0.5,
          });
        }
      }

      // Vertical neighbour (j+1), skip at the last row.
      if (j + 1 < resT) {
        const idxB_v = (j + 1) * resU + i;
        if (ridge[idxB_v]) {
          const kB = kappa[idxB_v];
          segs.push({
            a: { u: uA, t: tA },
            b: { u: uA, t: tOf(j + 1) },
            strength: (kA + kB) * 0.5,
          });
        }
      }
    }
  }

  return { segs, type: 'curvature-ridge' };
}
