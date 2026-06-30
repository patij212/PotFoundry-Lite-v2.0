// featureSharpnessGate.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// SHARP-FEATURE GATE for the feature-conforming pass (Task 2 of E-2026-06-30-FEAT-CONFORM-ALL20).
//
// MOTIVATION: the ungated feature-conforming injection REGRESSES smooth styles badly (E-2026-06-30-FEAT-
// CONFORM-SPIKE: HarmonicRipple crest under-shoot 0.023→3.56mm when its dense "extrema" loci were pinned).
// The in-house metric mesher ALREADY resolves smooth/curvature-resolvable ridges (R2 accept-class: crest
// under-shoot < 0.06mm on the 9 smooth/wavy styles). Conforming must fire ONLY where the mesher is BLIND —
// the sharp, sub-cell C0 ridges/creases the band-limited grid-curvature metric aliases (GothicArches V-grooves,
// BasketWeave over/under creases) — and be a NO-OP elsewhere.
//
// THE GATE (per-locus, ONE global threshold):
//   A locus segment is conformed iff its LOCAL PERPENDICULAR SHARPNESS exceeds a threshold. Sharpness is the
//   radial "peakiness" of the relief ACROSS the locus, measured directly on the raw analytic rA:
//
//     sharpness(point) = | r_crest − r(perp ± wMm) | / wMm        [mm of radial drop per mm of cross-distance]
//
//   evaluated at a fixed small cross-offset wMm (≈ a few grid cells). A SHARP rib (GothicArches apex
//   half-width 0.17mm) drops ~the full relief amplitude over wMm → high sharpness. A SMOOTH ripple
//   (HarmonicRipple, sinusoid with mm-scale wavelength) barely changes over wMm → low sharpness. This is the
//   discrete analog of the perpendicular curvature κ⊥·amplitude — the quantity the chord-sag ½κL² blindness
//   is governed by (tessellation-knowledge: a band-limited metric under-sizes exactly the high-κ⊥ features).
//
//   Normal-discontinuity creases (label 'crease-truth') are ALWAYS sharp by definition (the detector's
//   28° normal-jump threshold already selected them) — they pass the gate unconditionally. Curvature ridges
//   ('ridge-truth') and relief walls ('relief-wall-truth') pass only above the sharpness threshold.
//
// The gate runs at the SAME refiner used for injection (perpendicular scan of rA), so it adds no new surface
// machinery. It returns a per-line predicate consumed by buildFeatureConformingMeshB's locusFilter.
//
// Reuses: buildFeatureTruth (loci), runStyle buildRadiusFn (rA). Does NOT touch src/ or the kernel.

import { buildFeatureTruth, liftTrue, type FeatureTruth } from './featureLocalizedFidelity';
import { buildRadiusFn, type StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import type { StyleId, StyleOptions } from '../../src/geometry/types';

/** Minimal locator surface the measured gate needs (a subset of featureLocalizedFidelity's PointLocator). */
interface RadiusLocator {
  query(u: number, t: number): { P: [number, number, number]; radius: number } | null;
  neighborTriangles(u: number, t: number, cellR?: number): number[];
}
interface MeshXyz { xyz: Float64Array; indices: ArrayLike<number>; }

const TAU = 2 * Math.PI;

export interface SharpnessGateOpts {
  /** Cross-offset (mm) at which the radial drop is sampled. Default 0.3mm (~ a few truth cells). */
  wMm?: number;
  /** Sharpness threshold (mm radial drop / mm cross-distance). A segment passes iff sharpness > this. Default 0.6. */
  threshold?: number;
  /** Dense-truth marching grid resolution (feature LOCATIONS). Default 384 (matches the harness). */
  truthRes?: number;
  /** Crease family ('crease-truth') always passes (true) or is subject to the same threshold (false). Default true. */
  creasesAlwaysSharp?: boolean;
}

export interface SharpnessGateResult {
  /** Per-line keep flag (parallel to truth.lines), true = conform this locus. */
  keep: boolean[];
  /** The truth (loci) so the caller can reuse it without re-extracting. */
  lines: FeatureLine[];
  uToMm: number; tToMm: number;
  /** Diagnostics. */
  total: number; kept: number;
  byLabel: Record<string, { total: number; kept: number }>;
  /** Max sharpness seen across all admitted segments (for tuning). */
  maxSharpness: number;
  /** The sharpness threshold actually used. */
  threshold: number; wMm: number;
}

/** Shortest periodic du in [-0.5,0.5). */
function periodicDu(u1: number, u0: number): number {
  let du = u1 - u0;
  if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
  return du;
}

/**
 * Compute the per-locus sharpness keep-mask for a style. For each 2-point line, sample the midpoint, build the
 * mm-perpendicular to the line's tangent, and measure the radial drop |r_mid − min(r(+w), r(−w))| / wMm. The
 * line is kept iff (it is a crease and creasesAlwaysSharp) OR sharpness > threshold.
 *
 * The midpoint radius is taken as the crest reference (the dense-truth places the locus ON the feature); for a
 * crest the perpendicular neighbours are LOWER (drop > 0); for a valley they are HIGHER, and |·| still gives the
 * cross-amplitude per unit width — both are "sharp" if the relief turns fast across the locus.
 */
export function computeSharpnessGate(
  styleId: StyleId, params: StyleOptions, dims: StyleDims, opts: SharpnessGateOpts = {},
): SharpnessGateResult {
  const rA = buildRadiusFn(styleId, params, dims);
  const H = dims.H;
  const wMm = opts.wMm ?? 0.3;
  const threshold = opts.threshold ?? 0.6;
  const truthRes = opts.truthRes ?? 384;
  const creasesAlwaysSharp = opts.creasesAlwaysSharp ?? true;

  const truth = buildFeatureTruth(styleId, params, dims, truthRes);
  const uToMm = truth.uToMm, tToMm = H;

  const radAt = (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    return rA(TAU * uu, tc * H);
  };

  const keep: boolean[] = new Array(truth.lines.length).fill(false);
  const byLabel: Record<string, { total: number; kept: number }> = {};
  let kept = 0, maxSharpness = 0;

  truth.lines.forEach((line, li) => {
    const label = String(line.label ?? 'unknown');
    if (byLabel[label] === undefined) byLabel[label] = { total: 0, kept: 0 };
    byLabel[label].total++;

    const pts = line.points;
    if (pts.length < 2) return;
    // crease family is sharp by definition (28° normal jump already selected it).
    if (creasesAlwaysSharp && label === 'crease-truth') { keep[li] = true; kept++; byLabel[label].kept++; return; }

    // midpoint + mm-perpendicular to the segment tangent.
    const u0 = pts[0].u, u1 = pts[1].u, t0 = pts[0].t, t1 = pts[1].t;
    const du = periodicDu(u1, u0), dt = t1 - t0;
    let um = u0 + du * 0.5; um -= Math.floor(um);
    const tm = t0 + dt * 0.5;
    const txMm = du * uToMm, tyMm = dt * tToMm;
    const tl = Math.hypot(txMm, tyMm);
    if (tl < 1e-9) return;
    // perpendicular unit in mm → back to (u,t) per-mm.
    const perpUperMm = (-tyMm / tl) / uToMm, perpTperMm = (txMm / tl) / tToMm;

    const rMid = radAt(um, tm);
    const rPlus = radAt(um + perpUperMm * wMm, tm + perpTperMm * wMm);
    const rMinus = radAt(um - perpUperMm * wMm, tm - perpTperMm * wMm);
    // cross-amplitude: how far the relief turns away from the locus over wMm, in EITHER direction. Use the
    // larger deviation (a one-sided cliff turns fast on one side only) → sharpness per unit cross-distance.
    const drop = Math.max(Math.abs(rMid - rPlus), Math.abs(rMid - rMinus));
    const sharpness = drop / wMm;
    if (sharpness > maxSharpness) maxSharpness = sharpness;
    if (sharpness > threshold) { keep[li] = true; kept++; byLabel[label].kept++; }
  });

  return {
    keep, lines: truth.lines, uToMm, tToMm,
    total: truth.lines.length, kept, byLabel, maxSharpness, threshold, wMm,
  };
}

// ===========================================================================
// MEASURED GATE (the chosen gate — Task 2 pivot).
//
// The geometric-sharpness gate above was REFUTED by its own count-probe (it kept 47k+ loci on Crystalline /
// Voronoi, both ACCEPT — geometric sharpness measures relief DEPTH, not whether the mesher under-resolves the
// locus; E-2026-06-30-FEAT-CONFORM-ALL20). The HONEST gate measures the actual failure: build a BASELINE
// metric mesh, then conform ONLY the loci where the baseline mesh's TRUE-3D distance to the surface exceeds a
// floor. On the 9 accept styles the baseline is already faithful (R2: true-3D p99 < 0.02mm) ⇒ ~0 loci exceed
// the floor ⇒ ~0 conforming ⇒ NO REGRESSION BY CONSTRUCTION. On a riser whose feature is already 3D-faithful
// (ArtDeco true-3D p99 0.039) the TRUE-3D signal stays low ⇒ the gate does not conform it ⇒ the riser stays
// EXCLUDE automatically (the radial crest-under-shoot, which overstates risers, is NOT used as the gate).
// ===========================================================================

/** Exact 3D distance from point P to the closest point on triangle (A,B,C). Eberly (2003). */
function pointToTriDist3D(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  const e0x = bx - ax, e0y = by - ay, e0z = bz - az;
  const e1x = cx - ax, e1y = cy - ay, e1z = cz - az;
  const dx = ax - px, dy = ay - py, dz = az - pz;
  const a = e0x * e0x + e0y * e0y + e0z * e0z, b = e0x * e1x + e0y * e1y + e0z * e1z, c = e1x * e1x + e1y * e1y + e1z * e1z;
  const d = e0x * dx + e0y * dy + e0z * dz, e = e1x * dx + e1y * dy + e1z * dz;
  const det = a * c - b * b; let s = b * e - c * d, tt = b * d - a * e;
  if (s + tt <= det) {
    if (s < 0) { if (tt < 0) { if (d < 0) { tt = 0; s = Math.min(-d / a, 1); } else { s = 0; tt = e >= 0 ? 0 : Math.min(-e / c, 1); } } else { s = 0; tt = e >= 0 ? 0 : Math.min(-e / c, 1); } }
    else if (tt < 0) { tt = 0; s = d >= 0 ? 0 : Math.min(-d / a, 1); }
    else { const inv = det > 1e-30 ? 1 / det : 0; s *= inv; tt *= inv; }
  } else {
    if (s < 0) { const t0 = b + d, t1 = c + e; if (t1 > t0) { const num = t1 - t0, den = a - 2 * b + c; s = Math.min(num / den, 1); tt = 1 - s; } else { s = 0; tt = t1 <= 0 ? 1 : e >= 0 ? 0 : Math.min(-e / c, 1); } }
    else if (tt < 0) { const t0 = b + e, t1 = a + d; if (t1 > t0) { const num = t1 - t0, den = a - 2 * b + c; tt = Math.min(num / den, 1); s = 1 - tt; } else { tt = 0; s = t1 <= 0 ? 1 : d >= 0 ? 0 : Math.min(-d / a, 1); } }
    else { const num = c + e - b - d; if (num <= 0) { s = 0; } else { const den = a - 2 * b + c; s = Math.min(num / den, 1); } tt = 1 - s; }
  }
  const qx = ax + s * e0x + tt * e1x, qy = ay + s * e0y + tt * e1y, qz = az + s * e0z + tt * e1z;
  return Math.hypot(px - qx, py - qy, pz - qz);
}

export interface MeasuredGateOpts {
  /** Arc-length sample step (mm) along each locus for the gate probe. Default 0.1mm. */
  stepMm?: number;
  /** TRUE-3D distance floor (mm): a line is conformed iff its worst sampled true-3D gap exceeds this. Default 0.1. */
  trueFloorMm?: number;
  /** Cell radius for the neighbour-triangle search (same units as the locator's grid). Default 4. */
  cellR?: number;
}

export interface MeasuredGateResult {
  keep: boolean[];
  total: number; kept: number;
  byLabel: Record<string, { total: number; kept: number }>;
  /** Worst true-3D gap seen over ALL loci (mm) — diagnostic. */
  worstGapMm: number;
  trueFloorMm: number;
}

/**
 * MEASURED gate: per-line keep-mask from a BASELINE metric mesh. For each truth line, sample it at stepMm and
 * compute the TRUE-3D distance from each sampled true-surface point to the nearest baseline-mesh triangle.
 * The line is conformed iff its WORST sampled true-3D gap exceeds trueFloorMm. This is exactly the failure the
 * conforming pass fixes; on faithful styles/loci the gap is ~f32 floor ⇒ no conforming.
 */
export function computeMeasuredGate(
  truth: FeatureTruth, locator: RadiusLocator, mesh: MeshXyz, rA: AnalyticRadiusFn, H: number,
  opts: MeasuredGateOpts = {},
): MeasuredGateResult {
  const stepMm = opts.stepMm ?? 0.1;
  const trueFloorMm = opts.trueFloorMm ?? 0.1;
  const cellR = opts.cellR ?? 4;
  const { xyz, indices } = mesh;
  const uToMm = truth.uToMm, tToMm = truth.tToMm;

  const keep: boolean[] = new Array(truth.lines.length).fill(false);
  const byLabel: Record<string, { total: number; kept: number }> = {};
  let kept = 0, worstGapMm = 0;

  truth.lines.forEach((line, li) => {
    const label = String(line.label ?? 'unknown');
    if (byLabel[label] === undefined) byLabel[label] = { total: 0, kept: 0 };
    byLabel[label].total++;
    const pts = line.points;
    if (pts.length < 2) return;

    // sample the segment at stepMm and take the worst true-3D gap.
    const u0 = pts[0].u, u1 = pts[1].u, t0 = pts[0].t, t1 = pts[1].t;
    let du = u1 - u0; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
    const dt = t1 - t0;
    const lenMm = Math.hypot(du * uToMm, dt * tToMm);
    const n = Math.max(1, Math.ceil(lenMm / stepMm));
    let worst = 0;
    for (let k = 0; k <= n; k++) {
      const ff = k / n;
      let u = u0 + du * ff; u -= Math.floor(u);
      const t = t0 + dt * ff;
      const [px, py, pz] = liftTrue(u, t, rA, H);
      const cands = locator.neighborTriangles(u, t, cellR);
      if (cands.length === 0) continue;
      let minD = Infinity;
      for (const ti of cands) {
        const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
        const dd = pointToTriDist3D(px, py, pz,
          xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2],
          xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2],
          xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]);
        if (dd < minD) minD = dd;
      }
      if (isFinite(minD) && minD > worst) worst = minD;
    }
    if (worst > worstGapMm) worstGapMm = worst;
    if (worst > trueFloorMm) { keep[li] = true; kept++; byLabel[label].kept++; }
  });

  return { keep, total: truth.lines.length, kept, byLabel, worstGapMm, trueFloorMm };
}
