// creaseAlignedMesh.ts — mesh UNDER the crease-aligned anisotropic metric (the kernel integration of
// creaseAlignedMetric). Connectivity is the ANISOTROPIC-metric Delaunay: the flip criterion is a metric
// in-circle (Euclidean in-circle after a Cholesky whitening by the local metric M), so triangles come out
// long-along-crease / short-across-crease. Refinement sizes by the same metric (short across the crease, long
// along). Net: the steep crease is resolved by INTENTIONAL aligned anisotropy at FEWER triangles, instead of
// the isotropic surface metric's stretched "slivers". Dev-only lab module.
import Delaunator from 'delaunator';
import { buildCreaseAlignedMetric } from './creaseAlignedMetric';
import { flipHE } from './inhouseMetricMesh';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const nextHE = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);
const EMPTY = new Float64Array(0); // flipHE ignores xyz when a shouldFlip criterion is supplied

function inCircle(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, px: number, py: number): number {
  const dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx - px, fy = cy - py;
  const ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx);
}

export interface CreaseMeshOpts {
  tolMm: number; hMin: number; hMax: number;
  sizeRes?: number; seedN?: number; maxPoints?: number; splitThresh?: number; maxRounds?: number; dedupeEps?: number;
}
export interface CreaseMesh { ut: number[]; indices: Uint32Array; points: number; rounds: number; hitBudget: boolean; }

export function buildCreaseAlignedMesh(rA: AnalyticRadiusFn, H: number, opts: CreaseMeshOpts): CreaseMesh {
  const sizeRes = opts.sizeRes ?? 160;
  const seedN = opts.seedN ?? 12;
  const maxPoints = opts.maxPoints ?? 5_000_000;
  const splitThresh2 = (opts.splitThresh ?? 1.5) ** 2;
  const maxRounds = opts.maxRounds ?? 60;
  const dedupeEps = opts.dedupeEps ?? 1e-6;

  const mf = buildCreaseAlignedMetric(rA, H, { resU: sizeRes, resT: sizeRes, tolMm: opts.tolMm, hMin: opts.hMin, hMax: opts.hMax });
  const RU = mf.resU, RT = mf.resT, M = mf.m;
  const metricAt = (u: number, t: number): [number, number, number] => {
    const fu = Math.min(Math.max(u, 0), 1) * (RU - 1), ft = Math.min(Math.max(t, 0), 1) * (RT - 1);
    const iu = Math.min(Math.floor(fu), RU - 2), it = Math.min(Math.floor(ft), RT - 2);
    const au = fu - iu, bt = ft - it;
    const c00 = (it * RU + iu) * 3, c10 = c00 + 3, c01 = ((it + 1) * RU + iu) * 3, c11 = c01 + 3;
    const w00 = (1 - au) * (1 - bt), w10 = au * (1 - bt), w01 = (1 - au) * bt, w11 = au * bt;
    return [
      M[c00] * w00 + M[c10] * w10 + M[c01] * w01 + M[c11] * w11,
      M[c00 + 1] * w00 + M[c10 + 1] * w10 + M[c01 + 1] * w01 + M[c11 + 1] * w11,
      M[c00 + 2] * w00 + M[c10 + 2] * w10 + M[c01 + 2] * w01 + M[c11 + 2] * w11,
    ];
  };
  const metricLen2 = (u0: number, t0: number, u1: number, t1: number): number => {
    const [m00, m01, m11] = metricAt((u0 + u1) / 2, (t0 + t1) / 2);
    const du = u1 - u0, dt = t1 - t0;
    return m00 * du * du + 2 * m01 * du * dt + m11 * dt * dt;
  };

  const uv: number[] = [];
  // metric in-circle flip: whiten the 4 (u,t) points by Cholesky Lᵀ of M (at the current diagonal's midpoint),
  // then Euclidean in-circle. M = L·Lᵀ ⇒ Lᵀ=[[√m00, m01/√m00],[0,√(m11−·)]] maps params to metric-orthonormal.
  const shouldFlip = (pr: number, pl: number, p0: number, p1: number): boolean => {
    const [m00, m01, m11] = metricAt((uv[pr * 2] + uv[pl * 2]) / 2, (uv[pr * 2 + 1] + uv[pl * 2 + 1]) / 2);
    const l00 = Math.sqrt(Math.max(m00, 1e-30)), l10 = m01 / l00, l11 = Math.sqrt(Math.max(m11 - l10 * l10, 1e-30));
    const tx = (i: number): number => l00 * uv[i * 2] + l10 * uv[i * 2 + 1];
    const ty = (i: number): number => l11 * uv[i * 2 + 1];
    return inCircle(tx(p0), ty(p0), tx(pr), ty(pr), tx(pl), ty(pl), tx(p1), ty(p1)) < 0;
  };

  // global anisotropy scale for the initial Euclidean Delaunay (metric flips fix the local residual)
  const ratios: number[] = [];
  for (let i = 0; i < RU * RT; i++) { const a = M[i * 3], c = M[i * 3 + 2]; if (a > 0 && c > 0) ratios.push(Math.sqrt(a / c)); }
  ratios.sort((x, y) => x - y);
  const s = ratios[Math.floor(ratios.length / 2)] || 1;

  const seen = new Set<number>();
  const addPoint = (u: number, t: number): boolean => { const k = Math.round(u / dedupeEps) * 1_500_000 + Math.round(t / dedupeEps); if (seen.has(k)) return false; seen.add(k); uv.push(u, t); return true; };
  const seedNt = Math.max(2, seedN), seedNu = Math.max(2, Math.round(seedN * s));
  for (let i = 0; i <= seedNu; i++) for (let j = 0; j <= seedNt; j++) addPoint(i / seedNu, j / seedNt);
  const scaledCoords = (): Float64Array => { const c = new Float64Array(uv.length); for (let k = 0; k < uv.length; k += 2) { c[k] = uv[k] * s; c[k + 1] = uv[k + 1]; } return c; };

  let tris = new Uint32Array(0); let rounds = 0; let hitBudget = false;
  for (; rounds < maxRounds; rounds++) {
    const d = new Delaunator(scaledCoords()); tris = d.triangles; const he = d.halfedges;
    flipHE(tris, he, EMPTY, uv, 4, shouldFlip);                    // anisotropic-metric Delaunay
    let added = 0;
    for (let ti = 0; ti < tris.length; ti += 3) {
      const a = tris[ti] * 2, b = tris[ti + 1] * 2, c = tris[ti + 2] * 2;
      if (metricLen2(uv[a], uv[a + 1], uv[b], uv[b + 1]) > splitThresh2 && addPoint((uv[a] + uv[b]) / 2, (uv[a + 1] + uv[b + 1]) / 2)) added++;
      if (metricLen2(uv[b], uv[b + 1], uv[c], uv[c + 1]) > splitThresh2 && addPoint((uv[b] + uv[c]) / 2, (uv[b + 1] + uv[c + 1]) / 2)) added++;
      if (metricLen2(uv[c], uv[c + 1], uv[a], uv[a + 1]) > splitThresh2 && addPoint((uv[c] + uv[a]) / 2, (uv[c + 1] + uv[a + 1]) / 2)) added++;
      if (uv.length / 2 > maxPoints) { hitBudget = true; break; }
    }
    if (hitBudget || added === 0) { rounds++; break; }
  }
  const d = new Delaunator(scaledCoords()); tris = d.triangles; const he = d.halfedges;
  flipHE(tris, he, EMPTY, uv, 8, shouldFlip);

  const ut: number[] = new Array(uv.length);
  for (let i = 0; i < uv.length; i++) ut[i] = uv[i];
  return { ut, indices: Uint32Array.from(tris), points: uv.length / 2, rounds, hitBudget };
}

/** Min interior angle (deg) of triangle (a,b,c) measured IN THE METRIC M (at its centroid) — the honest
 * quality for an anisotropic mesh (isotropic 3D min-angle mislabels correct crease-aligned triangles). */
export function metricMinAngleDeg(ut: number[], a: number, b: number, c: number, metricAt: (u: number, t: number) => [number, number, number]): number {
  const cu = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, ct = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
  const [m00, m01, m11] = metricAt(cu, ct);
  const l00 = Math.sqrt(Math.max(m00, 1e-30)), l10 = m01 / l00, l11 = Math.sqrt(Math.max(m11 - l10 * l10, 1e-30));
  const X = (i: number): number => l00 * ut[2 * i] + l10 * ut[2 * i + 1], Y = (i: number): number => l11 * ut[2 * i + 1];
  const ax = X(a), ay = Y(a), bx = X(b), by = Y(b), cx = X(c), cy = Y(c);
  const la2 = (bx - cx) ** 2 + (by - cy) ** 2, lb2 = (cx - ax) ** 2 + (cy - ay) ** 2, lc2 = (ax - bx) ** 2 + (ay - by) ** 2;
  if (la2 < 1e-30 || lb2 < 1e-30 || lc2 < 1e-30) return 0;
  const ang = (j: number, k: number, o: number): number => Math.acos(Math.max(-1, Math.min(1, (j + k - o) / (2 * Math.sqrt(j * k))))) * 180 / Math.PI;
  return Math.min(ang(lb2, lc2, la2), ang(la2, lc2, lb2), ang(la2, lb2, lc2));
}
