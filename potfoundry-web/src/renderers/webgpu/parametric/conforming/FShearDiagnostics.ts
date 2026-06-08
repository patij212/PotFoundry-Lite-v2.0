/**
 * FShearDiagnostics.ts — classify WHY a surface produces sliver cells, so the
 * GAP-1 short-wide residual fix targets the right mechanism (measurement-first).
 *
 * BACKGROUND. The conforming mesher refines in (u,t) cells. A cell of param
 * extent (Δu,Δt) maps to a 3D parallelogram with edge vectors `Pu·Δu`, `Pt·Δt`,
 * whose triangle aspect (the production sliver metric `longest²·√3/(4·area)`)
 * depends ONLY on the first fundamental form `[[E,F],[F,G]]` and the ratio
 * Δu/Δt — it is INDEPENDENT of refinement level (proven in
 * Gap1FoundationAspect.test.ts for the F=0 case). A cell is an irreducible
 * sliver wherever NO admissible cell shape brings the aspect under ASPECT_MAX.
 *
 * There are two distinct sliver mechanisms, with DIFFERENT fixes:
 *
 *  (A) ANISOTROPY — `√E/√G` far from 1 with the parameter directions still
 *      roughly ORTHOGONAL in 3D (`|F|/√(EG)` small). A SQUARE cell slivers, but
 *      an axis-aligned RECTANGLE (Δu/Δt ≈ √G/√E) restores a near-square 3D cell.
 *      Fix: anisotropic axis refinement (split the long axis) — cheap, the
 *      existing quadtree already splits both axes; it only needs to refine the
 *      long axis harder / a global or local uBias. This is GAP-1 §uBias.
 *
 *  (B) AREA-COLLAPSE SHEAR — the parameter directions become near-PARALLEL in
 *      3D (`|F|/√(EG) → 1`, equivalently `EG−F² → 0`). The 3D parallelogram is a
 *      thin blade for EVERY axis-aligned Δu/Δt (scaling the axes cannot change
 *      the ANGLE between Pu and Pt). The ONLY fix is a cell ROTATED to the
 *      eigenvectors of `[[E,F],[F,G]]` (metric-aligned), which maps to a 3D
 *      RECTANGLE; scaled to the eigenvalues it is a 3D square (aspect √3). This
 *      is the same tool the twisted styles need.
 *
 * This module samples the metric on a (u,t) lattice and, for the cells that
 * SQUARE-sliver (what the current mesher emits), reports how many are still
 * slivers under the BEST axis-aligned rectangle (`bestAxis`) — i.e. how many are
 * mechanism (B) and need rotation — versus how many mechanism (A) axis
 * refinement alone would fix. It returns only a small summary (no per-point
 * data), so it is cheap to ship across the dev fidelity bridge.
 *
 * NOTE on faithfulness: the lattice aspect is the level-INDEPENDENT cell aspect
 * at each (u,t); it predicts where the adaptive mesher's cells are irreducible
 * slivers without running the mesher. The classifier therefore characterises the
 * SURFACE, not a particular mesh — exactly the level-independence Gap-1 relies on.
 *
 * @module conforming/FShearDiagnostics
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { firstFundamentalForm, metricStepsForSampler } from './SurfaceMetricTensor';

/** Sliver aspect threshold — mirrors fidelity `ASPECT_MAX` so lattice slivers
 *  correspond to the real-mesh `sliverCount`. */
export const SHEAR_ASPECT_MAX = 100;

export interface ShearClassifyOptions {
  /** Lattice columns (u). Default 192. */
  resU?: number;
  /** Lattice rows (t). Default 192. */
  resT?: number;
  /** Sliver aspect threshold. Default {@link SHEAR_ASPECT_MAX}. */
  aspectMax?: number;
  /**
   * Skip rows within this t-margin of the caps. The t finite-difference step
   * shrinks at t→0/1 (clamped axis), and the boundary rings are pinned, so the
   * interior is the faithful sliver field. Default 0.02.
   */
  tMargin?: number;
  /** Log-scan resolution for the best-axis Δu/Δt minimisation. Default 240. */
  axisScanSteps?: number;
}

export interface ShearSummary {
  latticePoints: number;
  aspectMax: number;
  // ── What the current SQUARE mesher produces ──────────────────────────────
  /** Worst square-cell aspect over the lattice. */
  maxSquareAspect: number;
  /** Lattice points whose SQUARE cell slivers (aspect > aspectMax). */
  sliverCountSquare: number;
  /** Fraction of the lattice that square-slivers. */
  sliverFracSquare: number;
  // ── Ceiling of axis-aligned (directional/uBias) refinement ───────────────
  /** Worst best-axis-aligned aspect over the lattice. */
  maxBestAxisAspect: number;
  /**
   * Of the SQUARE-sliver points, the fraction still slivering under the BEST
   * axis-aligned rectangle. These are mechanism (B): irreducible by ANY Δu/Δt,
   * they need a ROTATED (metric-aligned) cell. ~0 ⇒ pure anisotropy (axis
   * refinement alone fixes everything); ~1 ⇒ pure shear (rotation required).
   */
  irreducibleByAxisFrac: number;
  /** Absolute count behind {@link irreducibleByAxisFrac}. */
  irreducibleByAxisCount: number;
  // ── Rotation ceiling (sanity) ────────────────────────────────────────────
  /** Worst metric-aligned (rotated, eigenvalue-scaled) aspect — should be ≈√3. */
  maxRotatedAspect: number;
  // ── Mechanism descriptors over the SQUARE-sliver set ─────────────────────
  /** Mean `|F|/√(EG)` over square slivers (→1 = area-collapse shear). */
  meanCosAlphaSliver: number;
  /** Max `|F|/√(EG)` over the WHOLE lattice. */
  maxCosAlpha: number;
  /** Mean `max(√E/√G, √G/√E)` over square slivers. */
  meanRatioEGSliver: number;
  /** Max anisotropy ratio over the whole lattice. */
  maxRatioEG: number;
  /** Of square slivers, fraction whose long axis is u (√E>√G). */
  uLongFracSliver: number;
}

/** Right-triangle aspect `longest²·√3/(4·area)` for a cell whose two edge
 *  vectors have the metric `[[E,F],[F,G]]` and param extents (du, dt). Matches
 *  the production sliver metric (fidelity/metrics.ts). */
function cellAspect(E: number, F: number, G: number, du: number, dt: number): number {
  const det = E * G - F * F;
  if (det <= 0) return Number.POSITIVE_INFINITY; // degenerate (parallel edges)
  const e1 = E * du * du; // |Pu·du|²
  const e2 = G * dt * dt; // |Pt·dt|²
  const e12 = E * du * du - 2 * F * du * dt + G * dt * dt; // |Pu·du − Pt·dt|²
  const longest2 = Math.max(e1, e2, e12);
  const area = 0.5 * du * dt * Math.sqrt(det); // ½|Pu×Pt|·du·dt
  return (longest2 * Math.sqrt(3)) / (4 * area);
}

/** Aspect of a SQUARE param cell (Δu=Δt) — scale-invariant, so use unit extent. */
function squareAspect(E: number, F: number, G: number): number {
  return cellAspect(E, F, G, 1, 1);
}

/** Minimum aspect over ALL axis-aligned rectangles (Δu/Δt free) — the best any
 *  anisotropic u/t refinement (directional refine / uBias) can achieve. Only the
 *  RATIO ρ=Δu/Δt matters (aspect is scale-invariant), so scan ρ in log space. */
function bestAxisAspect(E: number, F: number, G: number, scanSteps: number): number {
  let best = Number.POSITIVE_INFINITY;
  // ρ from 1e-3 to 1e3 covers extreme anisotropy in both directions.
  for (let i = 0; i <= scanSteps; i++) {
    const rho = Math.pow(10, -3 + (6 * i) / scanSteps);
    const a = cellAspect(E, F, G, rho, 1);
    if (a < best) best = a;
  }
  return best;
}

/** Aspect of the metric-ALIGNED (rotated) cell: edges along the eigenvectors of
 *  `[[E,F],[F,G]]`, scaled to equalise the two 3D edge lengths. The eigenvectors
 *  are M-orthogonal, so their 3D images are orthogonal → a 3D rectangle; equal
 *  lengths → a 3D square → aspect √3. Returns √3 when non-degenerate, ∞ if the
 *  smaller eigenvalue collapses (a genuine surface degeneracy rotation can't fix). */
function rotatedAspect(E: number, F: number, G: number): number {
  const tr = E + G;
  const det = E * G - F * F;
  const disc = Math.max(0, (tr / 2) * (tr / 2) - det);
  const root = Math.sqrt(disc);
  const lam2 = tr / 2 - root; // smaller eigenvalue
  if (lam2 <= 1e-12) return Number.POSITIVE_INFINITY;
  // After aligning + equalising lengths the cell is a unit 3D square.
  return cellAspect(1, 0, 1, 1, 1); // = √3
}

/**
 * Classify the sliver mechanism of a surface by sampling its first fundamental
 * form on a (u,t) lattice. See the module doc for the (A) anisotropy vs (B)
 * area-collapse-shear distinction this resolves.
 */
export function classifySurfaceShear(
  sampler: SurfaceSampler,
  opts: ShearClassifyOptions = {},
): ShearSummary {
  const resU = opts.resU ?? 192;
  const resT = opts.resT ?? 192;
  const aspectMax = opts.aspectMax ?? SHEAR_ASPECT_MAX;
  const tMargin = opts.tMargin ?? 0.02;
  const axisScanSteps = opts.axisScanSteps ?? 240;
  const steps = metricStepsForSampler(sampler);

  let latticePoints = 0;
  let maxSquareAspect = 0;
  let sliverCountSquare = 0;
  let maxBestAxisAspect = 0;
  let irreducibleByAxisCount = 0;
  let maxRotatedAspect = 0;
  let maxCosAlpha = 0;
  let maxRatioEG = 1;
  let sumCosAlphaSliver = 0;
  let sumRatioEGSliver = 0;
  let uLongCountSliver = 0;

  for (let it = 0; it < resT; it++) {
    const t = it / (resT - 1);
    if (t < tMargin || t > 1 - tMargin) continue;
    for (let iu = 0; iu < resU; iu++) {
      const u = iu / resU; // periodic
      const { E, F, G } = firstFundamentalForm(sampler, u, t, steps.hu, steps.ht);
      if (!(E > 0) || !(G > 0)) continue;
      latticePoints++;

      const sE = Math.sqrt(E);
      const sG = Math.sqrt(G);
      const cosAlpha = Math.min(1, Math.abs(F) / Math.max(sE * sG, 1e-30));
      const ratioEG = Math.max(sE / sG, sG / sE);
      if (cosAlpha > maxCosAlpha) maxCosAlpha = cosAlpha;
      if (ratioEG > maxRatioEG) maxRatioEG = ratioEG;

      const sq = squareAspect(E, F, G);
      if (sq > maxSquareAspect) maxSquareAspect = sq;
      const rot = rotatedAspect(E, F, G);
      if (rot > maxRotatedAspect) maxRotatedAspect = rot;

      if (sq > aspectMax) {
        sliverCountSquare++;
        sumCosAlphaSliver += cosAlpha;
        sumRatioEGSliver += ratioEG;
        if (sE > sG) uLongCountSliver++;
        const best = bestAxisAspect(E, F, G, axisScanSteps);
        if (best > maxBestAxisAspect) maxBestAxisAspect = best;
        if (best > aspectMax) irreducibleByAxisCount++;
      }
    }
  }

  const sc = Math.max(sliverCountSquare, 1);
  return {
    latticePoints,
    aspectMax,
    maxSquareAspect,
    sliverCountSquare,
    sliverFracSquare: latticePoints > 0 ? sliverCountSquare / latticePoints : 0,
    maxBestAxisAspect,
    irreducibleByAxisFrac: sliverCountSquare > 0 ? irreducibleByAxisCount / sc : 0,
    irreducibleByAxisCount,
    maxRotatedAspect,
    meanCosAlphaSliver: sliverCountSquare > 0 ? sumCosAlphaSliver / sc : 0,
    maxCosAlpha,
    meanRatioEGSliver: sliverCountSquare > 0 ? sumRatioEGSliver / sc : 0,
    maxRatioEG,
    uLongFracSliver: sliverCountSquare > 0 ? uLongCountSliver / sc : 0,
  };
}
