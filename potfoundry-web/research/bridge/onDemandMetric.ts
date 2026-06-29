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

// --- 2x2 symmetric helpers (same construction as creaseAlignedMetric, inlined to stay self-contained) ---
function eigSym2(a: number, b: number, c: number): { l1: number; l2: number; e1: [number, number]; e2: [number, number] } {
  const tr = a + c, det = a * c - b * b, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  let ex: number, ey: number;
  if (Math.abs(b) > 1e-300) { ex = b; ey = l1 - a; const el = Math.hypot(ex, ey); if (el > 1e-300) { ex /= el; ey /= el; } else { ex = 1; ey = 0; } }
  else if (a >= c) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
  return { l1, l2, e1: [ex, ey], e2: [-ey, ex] };
}
function reconstruct(l1: number, l2: number, e1: [number, number], e2: [number, number]): Sym2 {
  return [l1 * e1[0] * e1[0] + l2 * e2[0] * e2[0], l1 * e1[0] * e1[1] + l2 * e2[0] * e2[1], l1 * e1[1] * e1[1] + l2 * e2[1] * e2[1]];
}
function powSym2(a: number, b: number, c: number, sign: 0.5 | -0.5): Sym2 {
  const { l1, l2, e1, e2 } = eigSym2(a, b, c);
  const p1 = sign === 0.5 ? Math.sqrt(l1) : 1 / Math.sqrt(l1), p2 = sign === 0.5 ? Math.sqrt(l2) : 1 / Math.sqrt(l2);
  return reconstruct(p1, p2, e1, e2);
}
function congruence(s: Sym2, x: Sym2): Sym2 {
  const [s0, s1, s2] = s, [x0, x1, x2] = x;
  const t00 = s0 * x0 + s1 * x1, t01 = s0 * x1 + s1 * x2, t10 = s1 * x0 + s2 * x1, t11 = s1 * x1 + s2 * x2;
  return [t00 * s0 + t01 * s1, t00 * s1 + t01 * s2, t10 * s1 + t11 * s2];
}

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

/** CREASE-ALIGNED anisotropic metric (II,I generalized eigenproblem) at (u,t), on-demand. */
export function creaseMetricAt(rA: AnalyticRadiusFn, H: number, u: number, t: number, o: OnDemandMetricOpts): Sym2 {
  const h = o.fdStep ?? 1e-3;
  const muMin = 1 / (o.hMax * o.hMax), muMax = 1 / (o.hMin * o.hMin);
  const d = derivs(rA, H, u, t, h);
  if (!d.ok || !(d.E * d.G - d.F * d.F > 1e-30)) return [muMin, 0, muMin];
  const Ihalf = powSym2(d.E, d.F, d.G, 0.5), Iinvhalf = powSym2(d.E, d.F, d.G, -0.5);
  const B = congruence(Iinvhalf, [d.L, d.M, d.N]);
  const eb = eigSym2(B[0], B[1], B[2]);
  const mu1 = Math.min(Math.max(Math.abs(eb.l1) / (8 * o.tolMm), muMin), muMax);
  const mu2 = Math.min(Math.max(Math.abs(eb.l2) / (8 * o.tolMm), muMin), muMax);
  return congruence(Ihalf, reconstruct(mu1, mu2, eb.e1, eb.e2));
}
