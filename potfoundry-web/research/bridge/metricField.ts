// potfoundry-web/research/bridge/metricField.ts
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];

/** Per-node symmetric 2x2 chord-control metric, packed [M00, M01, M11] per (u,t) grid node. */
export interface AnisotropicMetricField { resU: number; resT: number; m: Float64Array; }

export function buildAnisotropicMetricField(
  rA: AnalyticRadiusFn, H: number,
  opts: { resU: number; resT: number; tolMm: number; hMin: number; hMax: number },
): AnisotropicMetricField {
  const { resU, resT, tolMm, hMin, hMax } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const m = new Float64Array(resU * resT * 3);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  const muMin = 1 / (hMax * hMax), muMax = 1 / (hMin * hMin);
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
    let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
    if (nl < 1e-30) { m[base] = muMin; m[base + 1] = 0; m[base + 2] = muMin; continue; }
    n = [n[0] / nl, n[1] / nl, n[2] / nl];
    const L = dot(Suu, n), Mm = dot(Sut, n), N = dot(Stt, n);              // II = [[L,Mm],[Mm,N]]
    const tr = L + N, disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (L * N - Mm * Mm)));
    const l1 = tr / 2 + disc, l2 = tr / 2 - disc;                          // eigenvalues of II
    const evec = (lam: number): [number, number] => {                     // unit eigenvector
      let ex = Mm, ey = lam - L; let el = Math.hypot(ex, ey);
      if (el < 1e-20) { ex = lam - N; ey = Mm; el = Math.hypot(ex, ey); if (el < 1e-20) return [1, 0]; }
      return [ex / el, ey / el];
    };
    const e1 = evec(l1), e2: [number, number] = [-e1[1], e1[0]];
    const mu1 = Math.min(Math.max(Math.abs(l1) / (8 * tolMm), muMin), muMax);
    const mu2 = Math.min(Math.max(Math.abs(l2) / (8 * tolMm), muMin), muMax);
    m[base] = mu1 * e1[0] * e1[0] + mu2 * e2[0] * e2[0];                   // M00
    m[base + 1] = mu1 * e1[0] * e1[1] + mu2 * e2[0] * e2[1];              // M01
    m[base + 2] = mu1 * e1[1] * e1[1] + mu2 * e2[1] * e2[1];             // M11
  }
  return { resU, resT, m };
}
