// refineLoci.ts — DEV-ONLY. Snap feature-line points onto the TRUE radial extremum (crest / valley) of rA,
// searching perpendicular to the local ridge tangent. The featureGraph loci come from a bilinear sampler and sit
// OFF the sharp crest (the Bet 2 aliasing finding); embedding/conforming to them under-shoots. Refining lands them
// ON the true ridge so the embedded skeleton is faithful. research/ only; imported by nothing in src/.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
export interface LinePt { u: number; t: number; }
export interface Poly { points: LinePt[]; label?: string; }

/**
 * Refine each polyline point to the local radial extremum perpendicular to the ridge tangent (golden-section on rA).
 * seekMax = crest (r ≥ row mean) → search the max; else valley → the min. Returns refined polylines (same shape).
 */
export function refineLinesToExtremum(
  lines: ReadonlyArray<{ points: ReadonlyArray<LinePt>; label?: string }>,
  rA: AnalyticRadiusFn, H: number, uToMm: number, tToMm: number, searchHalfMm = 0.6,
): Poly[] {
  const rowMeanCache = new Map<number, number>();
  const rowMean = (t: number): number => {
    const key = Math.round(t * 4096); const c = rowMeanCache.get(key); if (c !== undefined) return c;
    const z = t * H; let s = 0; const N = 256; for (let i = 0; i < N; i++) s += rA(TAU * (i / N), z); const m = s / N; rowMeanCache.set(key, m); return m;
  };
  const radAt = (u: number, t: number): number => rA(TAU * u, t * H);
  const out: Poly[] = [];
  for (const line of lines) {
    const pl = line.points; const pts: LinePt[] = [];
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i];
      const a = pl[Math.max(0, i - 1)], b = pl[Math.min(pl.length - 1, i + 1)];
      let du = b.u - a.u; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1; const dt = b.t - a.t;
      const txMm = du * uToMm, tyMm = dt * tToMm; const L = Math.hypot(txMm, tyMm) || 1;
      const perpU = (-tyMm / L) / uToMm, perpT = (txMm / L) / tToMm; // (u,t) delta per 1mm perpendicular move
      const sgn = radAt(p.u, p.t) >= rowMean(p.t) ? 1 : -1; // +1 seek max (crest), -1 seek min (valley)
      const f = (s: number): number => { let u = p.u + s * perpU; u -= Math.floor(u); const t = Math.min(1, Math.max(0, p.t + s * perpT)); return sgn * radAt(u, t); };
      // golden-section maximize sgn*r over [-searchHalfMm, +searchHalfMm]
      let lo = -searchHalfMm, hi = searchHalfMm; const gr = (Math.sqrt(5) - 1) / 2;
      let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
      for (let it = 0; it < 60 && hi - lo > 1e-5; it++) {
        if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); }
        else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); }
      }
      const s = (lo + hi) / 2;
      let u = p.u + s * perpU; u -= Math.floor(u); const t = Math.min(1, Math.max(0, p.t + s * perpT));
      pts.push({ u, t });
    }
    out.push({ points: pts, label: line.label });
  }
  return out;
}
