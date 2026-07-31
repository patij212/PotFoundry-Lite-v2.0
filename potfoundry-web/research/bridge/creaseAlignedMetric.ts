// potfoundry-web/research/bridge/creaseAlignedMetric.ts
//
// GEOMETRICALLY-CORRECT anisotropic chord-control metric over the (u,t) square.
//
// The facet→surface chord error of a parameter edge d=(du,dt) is governed by the SECOND fundamental form II,
// but II lives in the (u,t) cotangent basis whose lengths/angles are set by the FIRST fundamental form I. The
// principal curvatures/directions are therefore the GENERALIZED eigenpairs of (II, I) — eigenvectors of the
// shape operator I⁻¹·II — NOT the eigenvectors of II alone (the bug in metricField.ts: it eigendecomposes II in
// the raw frame, so on a skewed surface, F≠0, its sizes don't map to true 3D chord).
//
// The construction: a chord tolerance tol caps a facet of physical size h spanning a direction of curvature
// |k| at h ≈ √(8·tol/|k|), i.e. the per-direction physical metric eigenvalue is μ = |k|/(8·tol), clamped to
// [1/hMax², 1/hMin²] (flat → coarse hMax, very curved → fine hMin). STABLE ASSEMBLY (2026-08-01): with the
// generalized eigenpairs II·v_i = k_i·I·v_i taken directly — k_i from the cancellation-free characteristic
// quadratic (EG−F²)k² − (EN+GL−2FM)k + (LN−M²) = 0, v_i from the better-conditioned column of (II − k_i·I) —
// the metric is, identically,
//                       M_uv = Σ_i μ_i (I v_i)(I v_i)ᵀ / (v_iᵀ I v_i)
// with no matrix square root and no nested eigen-decomposition. The former route (whiten by I^{±1/2}, then
// eigSym2 with the (b, l1−a) eigenvector) exchanged/rotated the principal directions on NEAR-DIAGONAL forms —
// F at the f64 rounding floor, most of a near-cylindrical pot wall — because both eigenvector components sit
// at cancellation noise (registry E-2026-07-19-DS-CONVERGE-B-FLANK amendment 2026-08-01; the same port as
// tierC/surfaceMetricField.anisoCurvatureMetric). A unit-M_uv edge has 3D chord ≈ tol in EVERY direction
// (long-along-crease, short-across-crease).
//
// Packed [M00, M01, M11] per (u,t) node, identical layout to surfaceMetricField.ts / metricField.ts so the gmsh
// BAMG adapter consumes it. Dev-only research module — nothing here ships.
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];
/** Symmetric 2x2 as [a, b, c] = [[a,b],[b,c]]. */
type Sym2 = [number, number, number];

/** Per-node symmetric 2x2 crease-aligned chord metric, packed [M00, M01, M11] per (u,t) grid node. */
export interface CreaseAlignedMetricField { resU: number; resT: number; m: Float64Array; }

export function buildCreaseAlignedMetric(
  rA: AnalyticRadiusFn, H: number,
  opts: { resU: number; resT: number; tolMm: number; hMin: number; hMax: number },
): CreaseAlignedMetricField {
  const { resU, resT, tolMm, hMin, hMax } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const m = new Float64Array(resU * resT * 3);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  const muMin = 1 / (hMax * hMax), muMax = 1 / (hMin * hMin);
  const isoFallback = (base: number): void => { m[base] = muMin; m[base + 1] = 0; m[base + 2] = muMin; };

  for (let it = 0; it < resT; it++) for (let iu = 0; iu < resU; iu++) {
    const uu = Math.min(Math.max(iu * du, du), 1 - du), tt = Math.min(Math.max(it * dt, dt), 1 - dt);
    const c = S(uu, tt);
    const Su = (sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du)) as V3);
    const St = (sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt)) as V3);
    const Suu = (sub(sub(S(uu + du, tt), c), sub(c, S(uu - du, tt))).map((v) => v / (du * du)) as V3);
    const Stt = (sub(sub(S(uu, tt + dt), c), sub(c, S(uu, tt - dt))).map((v) => v / (dt * dt)) as V3);
    const pp = S(uu + du, tt + dt), pm = S(uu + du, tt - dt), mp = S(uu - du, tt + dt), mm_ = S(uu - du, tt - dt);
    const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * du * dt)) as V3);
    const base = (it * resU + iu) * 3;

    // First fundamental form I = [[E,F],[F,G]].
    const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
    const detI = E * G - F * F;
    if (!(detI > 1e-30)) { isoFallback(base); continue; } // degenerate I → isotropic coarse

    // Unit normal + second fundamental form II = [[L,Mn],[Mn,N]].
    let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
    if (nl < 1e-30) { isoFallback(base); continue; }
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);

    // Principal curvatures k_i: roots of det(II − k·I) = 0, cancellation-free quadratic (qq carries qb's sign
    // so the subtractive root is qc/qq, never qb−disc). detI > 1e-30 by the guard above.
    const qa = detI;
    const qb = -(E * N + G * L - 2 * F * Mn);
    const qc = L * N - Mn * Mn;
    const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
    const qq = -0.5 * (qb + (qb >= 0 ? disc : -disc));
    const k1 = qq !== 0 ? qq / qa : -qb / (2 * qa);
    const k2 = qq !== 0 ? qc / qq : -qb / (2 * qa);
    const mu1 = Math.min(Math.max(Math.abs(k1) / (8 * tolMm), muMin), muMax);
    const mu2 = Math.min(Math.max(Math.abs(k2) / (8 * tolMm), muMin), muMax);
    // UMBILIC: equal principal curvatures ⇒ M = μ·g exactly (the isotropic reduction, taken not approximated).
    if (Math.abs(k1 - k2) <= 1e-12 * (Math.abs(k1) + Math.abs(k2) + 1e-300)) {
      m[base] = mu1 * E; m[base + 1] = mu1 * F; m[base + 2] = mu1 * G;
      continue;
    }
    let o0 = 0, o1 = 0, o2 = 0;
    for (const [kk, mu] of [[k1, mu1], [k2, mu2]] as Array<[number, number]>) {
      // v_i ⟂ both columns of (II − k_i·I); take the better-conditioned column (rank-1 at an exact eigenvalue).
      const p = L - kk * E, q = Mn - kk * F, r = N - kk * G;
      let v0: number, v1: number;
      if (Math.hypot(p, q) >= Math.hypot(q, r)) { v0 = -q; v1 = p; } else { v0 = -r; v1 = q; }
      const vl = Math.hypot(v0, v1);
      if (!(vl > 0)) { v0 = 1; v1 = 0; } else { v0 /= vl; v1 /= vl; }
      const iv0 = E * v0 + F * v1, iv1 = F * v0 + G * v1;
      const den = E * v0 * v0 + 2 * F * v0 * v1 + G * v1 * v1;
      if (!(den > 0)) continue;
      o0 += (mu * iv0 * iv0) / den; o1 += (mu * iv0 * iv1) / den; o2 += (mu * iv1 * iv1) / den;
    }
    m[base] = o0; m[base + 1] = o1; m[base + 2] = o2;
  }
  return { resU, resT, m };
}
