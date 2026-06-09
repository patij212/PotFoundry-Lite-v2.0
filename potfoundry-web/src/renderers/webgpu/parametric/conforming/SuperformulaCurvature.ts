/**
 * SuperformulaCurvature.ts — analytic angular-curvature FLOOR for the
 * SuperformulaBlossom outer wall (STAGE-4 serration fix).
 *
 * The metric sizing field derives its target edge length from the local
 * principal curvature, FD-estimated on the 256² bilinear `GpuSurfaceSampler`.
 * That estimate is BAND-LIMITED: a sub-cell finite-difference step reads inside a
 * single planar bilinear patch, so the second derivative — hence κ — is capped at
 * the sampler scale. On steep Gielis petal flanks the true κ is far higher, so
 * the field under-refines and the export serrates (measured: crestBandRms 0.33mm
 * at full strength; only a finer sampler — 16× GPU cost — reduces it).
 *
 * This module supplies an ACCURATE angular curvature cheaply, by differentiating
 * the ANALYTIC radius mirror `sfRf` (a smooth closed-form function — FD on it has
 * no band-limit and no GPU round-trip). It is used as a per-style LOWER BOUND
 * (`max`) on the sizing field's κ, so the field refines the flanks correctly
 * while smooth regions (where the analytic and sampled κ agree) are unchanged.
 *
 * Geometry: the outer radius is R(θ,z) = r0(z)·g(u,z) with
 *   g = mix(1, 0.9 + 0.35·rf, strength)   (styles.wgsl; rf = sfRf)
 * swept around θ = 2π·u. The curvature of the polar curve R(θ) at fixed height is
 *   κ = |R² + 2R'² − R·R''| / (R² + R'²)^1.5
 *     = |1 + 2ρ'² − ρ''| / (R·(1 + ρ'²)^1.5),   ρ' = R'/R, ρ'' = R''/R,
 * and because r0 is a constant factor at fixed z it CANCELS in ρ'/ρ'' — so the
 * ratios come purely from g (i.e. from sfRf), and only the scalar R needs the
 * physical radius (taken from the sampler, so the floor matches the GPU surface).
 *
 * @module conforming/SuperformulaCurvature
 */

import { sfRf } from './FeatureLineGraph';

const TWO_PI = 2 * Math.PI;

/**
 * Polar-curve curvature (mm⁻¹) from the physical radius `R` (mm) and the
 * dimensionless logarithmic-radius ratios `rhoP = R'/R`, `rhoPP = R''/R`
 * (derivatives w.r.t. the angle θ). A circle (rhoP=rhoPP=0) gives 1/R.
 */
export function polarCurvature(R: number, rhoP: number, rhoPP: number): number {
  if (!(R > 0)) return 0;
  const num = Math.abs(1 + 2 * rhoP * rhoP - rhoPP);
  const den = R * Math.pow(1 + rhoP * rhoP, 1.5);
  return den > 0 ? num / den : 0;
}

/** The SuperformulaBlossom radius modulation g(u,t) = mix(1, 0.9+0.35·rf, strength). */
function gMod(u: number, t: number, p: Float32Array): number {
  const strength = p.length > 0 ? p[0] : 1;
  const rf = sfRf(u, t, p);
  return 1 - 0.1 * strength + 0.35 * strength * rf;
}

/**
 * Accurate ANGULAR curvature (mm⁻¹) of the SuperformulaBlossom outer wall at
 * (u,t), given the physical radius `R` there (from the sampler). Differentiates
 * the analytic `g` (= sfRf modulation) in θ by central finite differences — the
 * step is in `u` (θ=2π·u), small because `g` is a smooth analytic function (no
 * bilinear band-limit). Returns ≈1/R on a plain pot (g≡1) and ≫1/R on steep
 * flanks; the n1<1 tip is a cusp (large but finite — cap it downstream).
 */
export function superformulaAngularKappa(u: number, t: number, p: Float32Array, R: number): number {
  if (!(R > 0)) return 0;
  // Central-difference g in u; convert u-derivatives to θ-derivatives (θ=2π·u).
  const h = 1e-4;
  const g0 = gMod(u, t, p);
  if (!(g0 > 0)) return 1 / R; // degenerate modulation → fall back to the circle term
  const gp = gMod(u + h, t, p);
  const gm = gMod(u - h, t, p);
  const dgdu = (gp - gm) / (2 * h);
  const d2gdu2 = (gp - 2 * g0 + gm) / (h * h);
  // ρ' = R'/R = g_θ/g = (1/2π)·g_u/g ; ρ'' = R''/R = g_θθ/g = (1/2π)²·g_uu/g.
  const rhoP = dgdu / (TWO_PI * g0);
  const rhoPP = d2gdu2 / (TWO_PI * TWO_PI * g0);
  return polarCurvature(R, rhoP, rhoPP);
}
