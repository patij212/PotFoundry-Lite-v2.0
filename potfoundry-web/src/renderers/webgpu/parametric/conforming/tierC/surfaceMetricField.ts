// surfaceMetricField.ts — SRC region-layer kernel dep (ported verbatim from research/bridge/surfaceMetricField.ts
// for the PROD-TIERC region kernel; the ONLY change from the research copy is the AnalyticRadiusFn import path).
//
// SURFACE-INTRINSIC (first-fundamental-form) metric over the (u,t) square.
//
// Plain (Euclidean) (u,t) Delaunay maximizes the min angle in the FLAT parameter rectangle — but the map
// S(u,t)=(r·cosθ, r·sinθ, z) (θ=u·TAU, z=t·H) distorts that rectangle on the way to 3D, so a (u,t)-equilateral
// triangle is a stretched sliver on the surface. The fix that stays in UV: mesh under the first fundamental
// form g = [[E,F],[F,G]] (E=Su·Su, F=Su·St, G=St·St). A parameter-vector d has 3D length √(dᵀ g d), so the
// metric
//                                   M = g / h₃D²
// gives unit metric-length to exactly the parameter-vectors of 3D length h₃D, in EVERY direction. Meshing to
// unit metric edges (gmsh BAMG) therefore yields triangles that are even ON THE 3D SURFACE.
//
// Two sizing modes for h₃D (the target 3D edge length):
//   • UNIFORM  (opts.h3DMm)          → even 3D triangles of one global size.
//   • CHORD    (opts.tolMm/hMin/hMax) → curvature-adaptive: h₃D = √(8·tol/κ_max), κ_max = max |principal
//     curvature| (eigenvalue of the shape operator I⁻¹·II). Even 3D SHAPE (isotropic from g) with SIZE that
//     tightens on the relief.
//
// GRADATION (opts.gradeBeta): chord sizing creates a SIZE GRADIENT (tiny cells on creases, big in smooth
// zones) and BAMG grows slivers where the size changes too fast — and it worsens with density (measured: %<20°
// climbs 1.5%→8% as tris 32k→189k). Gradation caps the growth rate: h(i) ≤ min_neighbour(h)·(1+β) per cell,
// swept to convergence. This PRESERVES crease fineness (small h stays small; only the coarse side is pulled in)
// while forcing gentle transitions ⇒ fewer transition slivers at no chord cost on the creases.
//
// g is positive-definite for a regular radial surface, so M is PD and needs no eigen-clamp. Packed
// [M00, M01, M11] per (u,t) node, identical layout to metricField.ts so the gmsh BAMG adapter consumes it.
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];

/** Per-node symmetric 2x2 surface metric M = g/h₃D², packed [M00, M01, M11] per (u,t) grid node. */
export interface SurfaceMetricField { resU: number; resT: number; m: Float64Array; }

/**
 * One CREST-AWARE SIZING overlay sample: at (u,t) the local target 3D edge length is h3DMm. Rasterized into the
 * sizing field's h3D grid as a min-overlay (see `crestSizeOverlay` on ChordOpts) — a locus point (a KNOWN sharp
 * crest) forces the cells it passes through to be fine, so mesh density FOLLOWS the loci instead of the sizing
 * grid corners (which alias sub-cell crests at grid fractions 0.35/0.65 — E-2026-07-01-FRONTIER-BET2).
 */
export interface CrestSizeSample { u: number; t: number; h3DMm: number; }

type Grade = { gradeBeta?: number; gradePasses?: number };
type UniformOpts = { resU: number; resT: number; h3DMm: number } & Grade;
type ChordOpts = {
  resU: number; resT: number; tolMm: number; hMin: number; hMax: number;
  /** OPT-IN: compute the sizing curvature κ_max with this FINE central-difference step (in (u,t)) instead of the
   *  sizing-grid step, sampled at `curvatureSubsamples`² sub-cell points (window-max). Resolves sharp sub-cell
   *  ridges the grid-step 2nd-difference aliases 5-10× (the crest-straddle root cause). Absent ⇒ byte-identical. */
  curvatureFineStep?: number;
  /** sub-cell samples per axis for the fine-curvature window-max (default 3). Only used with curvatureFineStep. */
  curvatureSubsamples?: number;
  /**
   * OPT-IN CREST-AWARE SIZING overlay (E-2026-07-01-CRESTAWARE). A list of KNOWN crest/valley loci samples, each
   * with a pre-computed local target 3D size h3DMm. AFTER the grid h3D pass (and BEFORE gradation), each sample is
   * rasterized into the h3D grid as a MIN-overlay: the grid cell it lands in (+ a NARROW `crestBandCells`-cell
   * neighbourhood, default 1) is set to min(current, h3DMm). This makes fineness FOLLOW the loci — defeating the
   * grid-fraction aliasing where a sub-cell crest at fracU 0.35/0.65 is sampled off-center and under-sized. STRICT
   * NO-OP when absent/empty (the h3D grid is untouched ⇒ M byte-identical). Only meaningful in chord mode.
   */
  crestSizeOverlay?: ReadonlyArray<CrestSizeSample>;
  /** MIN-overlay neighbourhood half-width in grid cells for crestSizeOverlay (default 1 = a 3×3 stamp). Keep
   *  NARROW so the overlay does not balloon triangle count away from the loci. Only used with crestSizeOverlay. */
  crestBandCells?: number;
  /**
   * OPT-IN ANISOTROPIC (II,I) CURVATURE metric (E-2026-07-19-DS-CONVERGE-B / project_msurf_accelerator). Instead of
   * the isotropic M = g/h₃D² (h₃D sized by the MAX principal curvature and applied EQUALLY in every direction — even
   * 3D SHAPE), assemble the crease-aligned metric that sizes EACH principal direction by ITS OWN |κ_i|: fine ACROSS
   * the steep flank (high κ), long ALONG it (low κ). M = I^{1/2}·(R·diag(μ₁,μ₂)·Rᵀ)·I^{1/2}, μ_i =
   * clamp(|κ_i|/(8·tol), 1/hMax², 1/hMin²), where (κ_i, R) are the eigenpairs of the SYMMETRIC shape operator
   * B = I^{-1/2}·II·I^{-1/2} (the (II,I) generalized eigenproblem). Reduces EXACTLY to g/h² when κ₁=κ₂ ⇒ isotropic
   * zones are untouched; only anisotropic-curvature zones (the DragonScales near-ring flank, GeometricStar chevron)
   * get the directional coarsening — the SAME chord-sag guarantee at far fewer points across the sag axis. The shape
   * operator uses the {@link ChordOpts.curvatureFineStep} FD step when set (sub-cell relief), else a grid-scale step.
   * Scalar h-gradation + {@link ChordOpts.crestSizeOverlay} are SKIPPED in aniso mode (they operate on a scalar h
   * field; anisotropic metric gradation is a follow-up). STRICT NO-OP when absent/false ⇒ the isotropic g/h² path
   * runs unchanged (byte-identical — verified by the no-op fingerprint + the region flag-off byte-identical suite).
   */
  aniso?: boolean;
} & Grade;
export type SurfaceMetricOpts = UniformOpts | ChordOpts;

/**
 * κ_max (max |principal curvature|, 1/mm) of the radial surface S(u,t)=(r·cosθ, r·sinθ, z) at (cu,ct) via central
 * differences with FD step h (in (u,t)). Exported so the crest-aware sizing overlay (featureConformingMesh.ts) sizes
 * loci with the SAME curvature math the grid sizing uses. Clamps the sample away from the [0,1] borders by h.
 */
export function kappaMaxAt(rA: AnalyticRadiusFn, H: number, cu: number, ct: number, h: number): number {
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const uu = Math.min(Math.max(cu, h), 1 - h), tt = Math.min(Math.max(ct, h), 1 - h);
  const Su = (sub(S(uu + h, tt), S(uu - h, tt)).map((v) => v / (2 * h)) as V3);
  const St = (sub(S(uu, tt + h), S(uu, tt - h)).map((v) => v / (2 * h)) as V3);
  const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
  const c = S(uu, tt);
  const Suu = (sub(sub(S(uu + h, tt), c), sub(c, S(uu - h, tt))).map((v) => v / (h * h)) as V3);
  const Stt = (sub(sub(S(uu, tt + h), c), sub(c, S(uu, tt - h))).map((v) => v / (h * h)) as V3);
  const pp = S(uu + h, tt + h), pm = S(uu + h, tt - h), mp = S(uu - h, tt + h), mm_ = S(uu - h, tt - h);
  const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * h * h)) as V3);
  let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
  if (nl <= 1e-30) return 0;
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);
  const a = E * G - F * F, b = -(E * N + G * L - 2 * F * Mn), cc = L * N - Mn * Mn;
  if (Math.abs(a) <= 1e-30) return 0;
  const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc));
  return Math.max(Math.abs((-b + disc) / (2 * a)), Math.abs((-b - disc) / (2 * a)));
}

function isChord(o: SurfaceMetricOpts): o is ChordOpts {
  return (o as ChordOpts).tolMm !== undefined;
}

/** Cap each node's size to (1+β)× its smallest 4-neighbour, swept to convergence — standard h-gradation. */
export function gradeSizeField(h: Float64Array, resU: number, resT: number, beta: number, passes: number): void {
  const at = (iu: number, it: number): number => it * resU + iu;
  for (let p = 0; p < passes; p++) {
    let changed = false;
    // forward + backward sweeps so fineness propagates both directions per pass
    for (let pass = 0; pass < 2; pass++) {
      const uOrder = (k: number): number => (pass === 0 ? k : resU - 1 - k);
      const tOrder = (k: number): number => (pass === 0 ? k : resT - 1 - k);
      for (let kt = 0; kt < resT; kt++) for (let ku = 0; ku < resU; ku++) {
        const iu = uOrder(ku), it = tOrder(kt), i = at(iu, it);
        let mn = h[i];
        if (iu > 0) mn = Math.min(mn, h[at(iu - 1, it)]);
        if (iu < resU - 1) mn = Math.min(mn, h[at(iu + 1, it)]);
        if (it > 0) mn = Math.min(mn, h[at(iu, it - 1)]);
        if (it < resT - 1) mn = Math.min(mn, h[at(iu, it + 1)]);
        const cap = mn * (1 + beta);
        if (h[i] > cap) { h[i] = cap; changed = true; }
      }
    }
    if (!changed) break;
  }
}

// ── 2×2 symmetric-matrix helpers for the ANISOTROPIC (II,I) metric (packed [s00, s01, s11]) ─────────────
// Ported verbatim from the proven research onDemandMetric.creaseMetricAt (E-2026-07-13-MSURF-ACCELERATOR): the
// crease-aligned metric that reduces EXACTLY to g/h² in the isotropic-curvature case (unit-test-guarded).
type Sym2 = [number, number, number];
/** Eigen-decomposition of the symmetric 2×2 [[a,b],[b,c]] → eigenvalues l1≥l2 + orthonormal eigenvectors. */
function eigSym2(a: number, b: number, c: number): { l1: number; l2: number; e1: [number, number]; e2: [number, number] } {
  const tr = a + c, det = a * c - b * b, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  let ex: number, ey: number;
  if (Math.abs(b) > 1e-300) { ex = b; ey = l1 - a; const el = Math.hypot(ex, ey); if (el > 1e-300) { ex /= el; ey /= el; } else { ex = 1; ey = 0; } }
  else if (a >= c) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
  return { l1, l2, e1: [ex, ey], e2: [-ey, ex] };
}
/** Reassemble a symmetric 2×2 from eigenvalues + orthonormal eigenvectors. */
function reconstructSym2(l1: number, l2: number, e1: [number, number], e2: [number, number]): Sym2 {
  return [l1 * e1[0] * e1[0] + l2 * e2[0] * e2[0], l1 * e1[0] * e1[1] + l2 * e2[0] * e2[1], l1 * e1[1] * e1[1] + l2 * e2[1] * e2[1]];
}
/** Symmetric-matrix power (±1/2) of [[a,b],[b,c]] via its eigen-decomposition. */
function powSym2(a: number, b: number, c: number, sign: 0.5 | -0.5): Sym2 {
  const { l1, l2, e1, e2 } = eigSym2(a, b, c);
  const p1 = sign === 0.5 ? Math.sqrt(l1) : 1 / Math.sqrt(l1), p2 = sign === 0.5 ? Math.sqrt(l2) : 1 / Math.sqrt(l2);
  return reconstructSym2(p1, p2, e1, e2);
}
/** Congruence s·x·s for symmetric s,x (s symmetric ⇒ s = sᵀ). */
function congruenceSym2(s: Sym2, x: Sym2): Sym2 {
  const [s0, s1, s2] = s, [x0, x1, x2] = x;
  const t00 = s0 * x0 + s1 * x1, t01 = s0 * x1 + s1 * x2, t10 = s1 * x0 + s2 * x1, t11 = s1 * x1 + s2 * x2;
  return [t00 * s0 + t01 * s1, t00 * s1 + t01 * s2, t10 * s1 + t11 * s2];
}

/**
 * ANISOTROPIC crease-aligned (II,I) curvature metric at (u,t), packed [M00, M01, M11]. Sizes EACH principal
 * direction by its OWN principal curvature: μ_i = clamp(|κ_i|/(8·tol), 1/hMax², 1/hMin²) — fine ACROSS the steep
 * flank, long ALONG it — vs the isotropic g/h²'s single MAX-curvature size in every direction. hFD is the central-
 * difference step for the shape operator (small ⇒ resolves sub-cell relief). Reduces to the g/h² metric when the two
 * principal curvatures are equal (isotropic zones untouched). Byte-faithful to research onDemandMetric.creaseMetricAt.
 */
export function anisoCurvatureMetric(
  rA: AnalyticRadiusFn, H: number, u: number, t: number, tol: number, hMin: number, hMax: number, hFD: number,
): Sym2 {
  const muMin = 1 / (hMax * hMax), muMax = 1 / (hMin * hMin);
  const S = (uu: number, tt: number): V3 => { const th = TAU * uu, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const uu = Math.min(Math.max(u, hFD), 1 - hFD), tt = Math.min(Math.max(t, hFD), 1 - hFD);
  const c = S(uu, tt);
  const Su = (sub(S(uu + hFD, tt), S(uu - hFD, tt)).map((v) => v / (2 * hFD)) as V3);
  const St = (sub(S(uu, tt + hFD), S(uu, tt - hFD)).map((v) => v / (2 * hFD)) as V3);
  const Suu = (sub(sub(S(uu + hFD, tt), c), sub(c, S(uu - hFD, tt))).map((v) => v / (hFD * hFD)) as V3);
  const Stt = (sub(sub(S(uu, tt + hFD), c), sub(c, S(uu, tt - hFD))).map((v) => v / (hFD * hFD)) as V3);
  const pp = S(uu + hFD, tt + hFD), pm = S(uu + hFD, tt - hFD), mp = S(uu - hFD, tt + hFD), mm_ = S(uu - hFD, tt - hFD);
  const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * hFD * hFD)) as V3);
  let n: V3 = [Su[1] * St[2] - Su[2] * St[1], Su[2] * St[0] - Su[0] * St[2], Su[0] * St[1] - Su[1] * St[0]];
  const nl = Math.hypot(n[0], n[1], n[2]);
  const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
  if (nl < 1e-30 || !(E * G - F * F > 1e-30)) return [muMin, 0, muMin];
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);
  const Ihalf = powSym2(E, F, G, 0.5), Iinvhalf = powSym2(E, F, G, -0.5);
  const B = congruenceSym2(Iinvhalf, [L, Mn, N]);   // symmetric shape operator; eigenvalues = principal curvatures
  const eb = eigSym2(B[0], B[1], B[2]);
  const mu1 = Math.min(Math.max(Math.abs(eb.l1) / (8 * tol), muMin), muMax);
  const mu2 = Math.min(Math.max(Math.abs(eb.l2) / (8 * tol), muMin), muMax);
  return congruenceSym2(Ihalf, reconstructSym2(mu1, mu2, eb.e1, eb.e2));
}

export function buildSurfaceMetricField(rA: AnalyticRadiusFn, H: number, opts: SurfaceMetricOpts): SurfaceMetricField {
  const { resU, resT } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  const chord = isChord(opts);

  // OPT-IN ANISOTROPIC (II,I) CURVATURE metric (E-2026-07-19-DS-CONVERGE-B). Assemble the crease-aligned metric
  // per grid node (fine ACROSS the high-κ flank, long ALONG it) INSTEAD of the isotropic g/h² Pass-1/Pass-2 below.
  // Early return ⇒ the isotropic path is untouched when aniso is absent/false (byte-identical). Chord mode only
  // (needs tolMm/hMin/hMax). Uses curvatureFineStep as the shape-operator FD step when set, else a grid-scale step.
  if (chord && (opts as ChordOpts).aniso === true) {
    const o = opts as ChordOpts;
    const hFD = o.curvatureFineStep ?? Math.min(du, dt);
    const m = new Float64Array(resU * resT * 3);
    for (let it = 0; it < resT; it++) {
      for (let iu = 0; iu < resU; iu++) {
        const packed = anisoCurvatureMetric(rA, H, iu * du, it * dt, o.tolMm, o.hMin, o.hMax, hFD);
        const idx = (it * resU + iu) * 3;
        m[idx] = packed[0]; m[idx + 1] = packed[1]; m[idx + 2] = packed[2];
      }
    }
    return { resU, resT, m };
  }

  // κ_max (max |principal curvature|) at (cu,ct) via central differences with FD step h. Powers the OPT-IN
  // fine-curvature sizing path — a small h resolves a sharp sub-cell ridge that the grid-step FD averages away.
  const kappaAt = (cu: number, ct: number, h: number): number => {
    const uu = Math.min(Math.max(cu, h), 1 - h), tt = Math.min(Math.max(ct, h), 1 - h);
    const Su = (sub(S(uu + h, tt), S(uu - h, tt)).map((v) => v / (2 * h)) as V3);
    const St = (sub(S(uu, tt + h), S(uu, tt - h)).map((v) => v / (2 * h)) as V3);
    const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
    const c = S(uu, tt);
    const Suu = (sub(sub(S(uu + h, tt), c), sub(c, S(uu - h, tt))).map((v) => v / (h * h)) as V3);
    const Stt = (sub(sub(S(uu, tt + h), c), sub(c, S(uu, tt - h))).map((v) => v / (h * h)) as V3);
    const pp = S(uu + h, tt + h), pm = S(uu + h, tt - h), mp = S(uu - h, tt + h), mm_ = S(uu - h, tt - h);
    const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * h * h)) as V3);
    let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
    if (nl <= 1e-30) return 0;
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);
    const a = E * G - F * F, b = -(E * N + G * L - 2 * F * Mn), cc = L * N - Mn * Mn;
    if (Math.abs(a) <= 1e-30) return 0;
    const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc));
    return Math.max(Math.abs((-b + disc) / (2 * a)), Math.abs((-b - disc) / (2 * a)));
  };

  // Pass 1 — first fundamental form (E,F,G) and target 3D size h₃D per node.
  const Eg = new Float64Array(resU * resT), Fg = new Float64Array(resU * resT), Gg = new Float64Array(resU * resT);
  const h3D = new Float64Array(resU * resT);
  for (let it = 0; it < resT; it++) {
    for (let iu = 0; iu < resU; iu++) {
      const uu = Math.min(Math.max(iu * du, du), 1 - du);
      const tt = Math.min(Math.max(it * dt, dt), 1 - dt);
      const Su = (sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du)) as V3);
      const St = (sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt)) as V3);
      const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
      const idx = it * resU + iu;
      Eg[idx] = E; Fg[idx] = F; Gg[idx] = G;

      if (chord) {
        const o = opts as ChordOpts;
        let kappaMax = 0;
        if (o.curvatureFineStep !== undefined) {
          // OPT-IN fine-curvature window-max: κ at sub-cell points via a FINE FD step, take the max → catches a
          // sharp ridge anywhere in the cell that the grid-step 2nd-difference below would average away.
          const fs = o.curvatureFineStep;
          const ns = Math.max(1, o.curvatureSubsamples ?? 3);
          for (let su = 0; su < ns; su++) for (let sv = 0; sv < ns; sv++) {
            const ou = ns === 1 ? 0 : (su / (ns - 1) - 0.5) * du;
            const ov = ns === 1 ? 0 : (sv / (ns - 1) - 0.5) * dt;
            const k = kappaAt(uu + ou, tt + ov, fs);
            if (k > kappaMax) kappaMax = k;
          }
        } else {
          const c = S(uu, tt);
          const Suu = (sub(sub(S(uu + du, tt), c), sub(c, S(uu - du, tt))).map((v) => v / (du * du)) as V3);
          const Stt = (sub(sub(S(uu, tt + dt), c), sub(c, S(uu, tt - dt))).map((v) => v / (dt * dt)) as V3);
          const pp = S(uu + du, tt + dt), pm = S(uu + du, tt - dt), mp = S(uu - du, tt + dt), mm_ = S(uu - du, tt - dt);
          const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * du * dt)) as V3);
          let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
          if (nl > 1e-30) {
            n = [n[0] / nl, n[1] / nl, n[2] / nl];
            const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);
            const a = E * G - F * F, b = -(E * N + G * L - 2 * F * Mn), cc = L * N - Mn * Mn;
            if (Math.abs(a) > 1e-30) {
              const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc));
              kappaMax = Math.max(Math.abs((-b + disc) / (2 * a)), Math.abs((-b - disc) / (2 * a)));
            }
          }
        }
        const hRaw = kappaMax > 1e-9 ? Math.sqrt((8 * o.tolMm) / kappaMax) : o.hMax;
        h3D[idx] = Math.min(Math.max(hRaw, o.hMin), o.hMax);
      } else {
        h3D[idx] = (opts as UniformOpts).h3DMm;
      }
    }
  }

  // CREST-AWARE SIZING overlay (E-2026-07-01-CRESTAWARE): rasterize the KNOWN crest loci into h3D as a MIN-overlay
  // BEFORE gradation, so the fine crest size PROPAGATES outward through gradation (rather than being smoothed away)
  // and the metric follows the loci, not the grid corners. Each sample stamps a NARROW (2·band+1)² neighbourhood in
  // grid-cell space around its (u,t) cell (periodic in u; clamped in t). STRICT NO-OP when the overlay is empty.
  if (chord) {
    const o = opts as ChordOpts;
    const ov = o.crestSizeOverlay;
    if (ov !== undefined && ov.length > 0) {
      const band = Math.max(0, Math.round(o.crestBandCells ?? 1));
      const idxOf = (iu: number, it: number): number => it * resU + iu;
      for (const s of ov) {
        // clamp the target into the same [hMin,hMax] the grid path used (a locus κ can push h below hMin).
        const hT = Math.min(Math.max(s.h3DMm, o.hMin), o.hMax);
        let uu = s.u - Math.floor(s.u); if (uu < 0) uu += 1; // periodic u
        const tc = s.t < 0 ? 0 : s.t > 1 ? 1 : s.t;
        const cu = Math.round(uu * (resU - 1)), ct = Math.round(tc * (resT - 1));
        for (let dtC = -band; dtC <= band; dtC++) {
          const it = ct + dtC; if (it < 0 || it > resT - 1) continue;
          for (let duC = -band; duC <= band; duC++) {
            const iu = ((cu + duC) % resU + resU) % resU; // wrap u
            const i = idxOf(iu, it);
            if (hT < h3D[i]) h3D[i] = hT;
          }
        }
      }
    }
  }

  // Optional gradation (chord mode only — uniform h has no gradient).
  if (chord && opts.gradeBeta && opts.gradeBeta > 0) {
    gradeSizeField(h3D, resU, resT, opts.gradeBeta, opts.gradePasses ?? 32);
  }

  // Pass 2 — assemble M = g / h₃D².
  const m = new Float64Array(resU * resT * 3);
  for (let i = 0; i < resU * resT; i++) {
    const inv = 1 / (h3D[i] * h3D[i]);
    m[i * 3] = Eg[i] * inv; m[i * 3 + 1] = Fg[i] * inv; m[i * 3 + 2] = Gg[i] * inv;
  }
  return { resU, resT, m };
}
