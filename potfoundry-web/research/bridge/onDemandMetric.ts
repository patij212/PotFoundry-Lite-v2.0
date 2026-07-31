// onDemandMetric.ts — metric evaluated ON DEMAND at the query point with a FINE finite-difference step,
// decoupled from any storage grid. The grid metrics (surfaceMetricField / creaseAlignedMetric) sample curvature
// at sizeRes nodes (central-diff step ≈ 1/res ≈ 0.004) then bilinearly interpolate — both band-limit sharp
// (sub-cell) curvature, so on Gyroid's fine creases the metric under-sizes and the chord lags. Here the
// derivatives use a small fdStep (≪ grid cell) at the EXACT (u,t), so there is no grid band-limit — this is the
// practical "analytic-grade" curvature (true symbolic derivatives would need per-style differentiation ×20).
// Dev-only lab module. Returns the packed symmetric metric [M00, M01, M11].
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];
type Sym2 = [number, number, number];

export interface OnDemandMetricOpts { tolMm: number; hMin: number; hMax: number; fdStep?: number }

/** Sample S and its 1st/2nd derivatives at (u,t) by fine central differences (step h). */
function derivs(rA: AnalyticRadiusFn, H: number, u: number, t: number, h: number): { E: number; F: number; G: number; L: number; M: number; N: number; ok: boolean } {
  const S = (uu: number, tt: number): V3 => { const th = TAU * uu, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const uu = Math.min(Math.max(u, h), 1 - h), tt = Math.min(Math.max(t, h), 1 - h);
  const c = S(uu, tt);
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const Su = sub(S(uu + h, tt), S(uu - h, tt)).map((v) => v / (2 * h)) as V3;
  const St = sub(S(uu, tt + h), S(uu, tt - h)).map((v) => v / (2 * h)) as V3;
  const Suu = sub(sub(S(uu + h, tt), c), sub(c, S(uu - h, tt))).map((v) => v / (h * h)) as V3;
  const Stt = sub(sub(S(uu, tt + h), c), sub(c, S(uu, tt - h))).map((v) => v / (h * h)) as V3;
  const pp = S(uu + h, tt + h), pm = S(uu + h, tt - h), mp = S(uu - h, tt + h), mm_ = S(uu - h, tt - h);
  const Sut = [0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * h * h)) as V3;
  let n: V3 = [Su[1] * St[2] - Su[2] * St[1], Su[2] * St[0] - Su[0] * St[2], Su[0] * St[1] - Su[1] * St[0]];
  const nl = Math.hypot(n[0], n[1], n[2]);
  if (nl < 1e-30) return { E: 0, F: 0, G: 0, L: 0, M: 0, N: 0, ok: false };
  n = [n[0] / nl, n[1] / nl, n[2] / nl];
  return { E: dot(Su, Su), F: dot(Su, St), G: dot(St, St), L: dot(Suu, n), M: dot(Sut, n), N: dot(Stt, n), ok: true };
}

/** ISOTROPIC-in-3D surface metric M = g/h₃D² (h₃D = √(8·tol/κ_max)) at (u,t), on-demand. */
export function surfaceMetricAt(rA: AnalyticRadiusFn, H: number, u: number, t: number, o: OnDemandMetricOpts): Sym2 {
  const h = o.fdStep ?? 1e-3;
  const d = derivs(rA, H, u, t, h);
  if (!d.ok) { const mu = 1 / (o.hMax * o.hMax); return [mu, 0, mu]; }
  const a = d.E * d.G - d.F * d.F, b = -(d.E * d.N + d.G * d.L - 2 * d.F * d.M), cc = d.L * d.N - d.M * d.M;
  let kappaMax = 0;
  if (Math.abs(a) > 1e-30) { const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc)); kappaMax = Math.max(Math.abs((-b + disc) / (2 * a)), Math.abs((-b - disc) / (2 * a))); }
  const hRaw = kappaMax > 1e-9 ? Math.sqrt(8 * o.tolMm / kappaMax) : o.hMax;
  const h3D = Math.min(Math.max(hRaw, o.hMin), o.hMax);
  const inv = 1 / (h3D * h3D);
  return [d.E * inv, d.F * inv, d.G * inv];
}

/**
 * CREASE-ALIGNED anisotropic metric (II,I generalized eigenproblem) at (u,t), on-demand.
 *
 * STABLE ASSEMBLY (2026-08-01): M = Σ_i μ_i (I v_i)(I v_i)ᵀ / (v_iᵀ I v_i) with II·v_i = κ_i·I·v_i solved
 * directly — κ_i from the cancellation-free characteristic quadratic, v_i from the better-conditioned column
 * of (II − κ_i·I) — the same port as tierC/surfaceMetricField.anisoCurvatureMetric. The former
 * I^{1/2}·(R·diag(μ)·Rᵀ)·I^{1/2} route went through an eigSym2 whose (b, l1−a) eigenvector is cancellation
 * noise on near-diagonal forms and exchanged/rotated principal directions (registry
 * E-2026-07-19-DS-CONVERGE-B-FLANK amendment). NOTE: this function is the metric-min-angle RULER of
 * _dsFlankAniso/_dsAnisoRing — metricPct20/metricMinAng rows recorded BEFORE this port used the legacy route.
 */
export function creaseMetricAt(rA: AnalyticRadiusFn, H: number, u: number, t: number, o: OnDemandMetricOpts): Sym2 {
  const h = o.fdStep ?? 1e-3;
  const muMin = 1 / (o.hMax * o.hMax), muMax = 1 / (o.hMin * o.hMin);
  const d = derivs(rA, H, u, t, h);
  if (!d.ok || !(d.E * d.G - d.F * d.F > 1e-30)) return [muMin, 0, muMin];
  const qa = d.E * d.G - d.F * d.F;
  const qb = -(d.E * d.N + d.G * d.L - 2 * d.F * d.M);
  const qc = d.L * d.N - d.M * d.M;
  const disc = Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc));
  const qq = -0.5 * (qb + (qb >= 0 ? disc : -disc));
  const k1 = qq !== 0 ? qq / qa : -qb / (2 * qa);
  const k2 = qq !== 0 ? qc / qq : -qb / (2 * qa);
  const mu1 = Math.min(Math.max(Math.abs(k1) / (8 * o.tolMm), muMin), muMax);
  const mu2 = Math.min(Math.max(Math.abs(k2) / (8 * o.tolMm), muMin), muMax);
  // UMBILIC: equal principal curvatures ⇒ M = μ·g exactly (the g/h² reduction, taken not approximated).
  if (Math.abs(k1 - k2) <= 1e-12 * (Math.abs(k1) + Math.abs(k2) + 1e-300)) return [mu1 * d.E, mu1 * d.F, mu1 * d.G];
  const out: Sym2 = [0, 0, 0];
  for (const [kk, mu] of [[k1, mu1], [k2, mu2]] as Array<[number, number]>) {
    const p = d.L - kk * d.E, q = d.M - kk * d.F, r = d.N - kk * d.G;
    let v0: number, v1: number;
    if (Math.hypot(p, q) >= Math.hypot(q, r)) { v0 = -q; v1 = p; } else { v0 = -r; v1 = q; }
    const vl = Math.hypot(v0, v1);
    if (!(vl > 0)) { v0 = 1; v1 = 0; } else { v0 /= vl; v1 /= vl; }
    const iv0 = d.E * v0 + d.F * v1, iv1 = d.F * v0 + d.G * v1;
    const den = d.E * v0 * v0 + 2 * d.F * v0 * v1 + d.G * v1 * v1;
    if (!(den > 0)) continue;
    out[0] += (mu * iv0 * iv0) / den; out[1] += (mu * iv0 * iv1) / den; out[2] += (mu * iv1 * iv1) / den;
  }
  return out;
}
