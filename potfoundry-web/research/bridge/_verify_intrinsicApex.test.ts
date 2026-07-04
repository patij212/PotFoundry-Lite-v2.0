// _verify_intrinsicApex.test.ts — DEV-ONLY (PF_VERIFY_IA=1). ADVERSARIAL re-check of E-2026-07-04-RACE-INTRINSIC-APEX
// reconcile CONFIRM. Skeptic questions:
//  (Q1) POPULATION: the reconcile block selects cusps by UNIFORM STRIDE + flankDrop>=0.02 filter (113 cusps),
//       NOT the top-400 gradU-sorted worst zero-width cusps the REFUTED sweeps used. Re-run the EXACT flatten
//       recursion on the WORST-400 gradU population. If it still reaches ~0 outliers, the CONFIRM survives; if
//       the worst cusps leak, the CONFIRM was on an easier subset.
//  (Q2) SAMPLER: the reconcile leaf ruler is 10-pt barycentric with a self<=0.01 early-stop. Re-measure every
//       ACCEPTED leaf with a 36-pt dense sampler. If accepted leaves leak >0.01 under 36-pt, the early-stop
//       under-reported (the "0-outlier" is a sampling artifact).
//  (Q3) CAP HONESTY: count leaves that terminate at level 0 (cap) with self>0.01 — those are UNCONVERGED, not
//       converged 0-outliers.
// Reuses labkit + the cached extract READ-ONLY. Writes ONLY research/exchange/_verify_intrinsicApex/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, type AnalyticRadiusFn, bruteNearestOnRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { CrestExtractResult } from './_cu_gothicsegLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const R_MEAN = 48;
const DIR = join(process.cwd(), 'research', 'exchange', '_verify_intrinsicApex');
const NDJSON = join(DIR, 'scorecard.ndjson');
const EXCACHE = join(process.cwd(), 'research', 'exchange', '_gd_gothic', 'extract.cache.json');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(DIR, 'progress.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (r: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(r) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${r.key}] ${JSON.stringify(r)}`); };

function lift(rA: AnalyticRadiusFn, u: number, t: number): [number, number, number] { const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; }
function truePerpLocal(rA: AnalyticRadiusFn, p: [number, number, number], thWin = 0.06, zWin = 3.0): number {
  const px = p[0], py = p[1], pz = p[2]; const th0 = Math.atan2(py, px);
  const d2 = (th: number, z: number): number => { const r = rA(th < 0 ? th + TAU : th >= TAU ? th - TAU : th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; return ex * ex + ey * ey + ez * ez; };
  const nTh = 96, nZ = 96; const zLo = Math.max(0, pz - zWin), zHi = Math.min(H, pz + zWin);
  let best = Infinity, bth = th0, bz = pz;
  for (let i = 0; i <= nTh; i++) { const th = th0 - thWin + (2 * thWin) * (i / nTh); for (let j = 0; j <= nZ; j++) { const z = zLo + (zHi - zLo) * (j / nZ); const f = d2(th, z); if (f < best) { best = f; bth = th; bz = z; } } }
  let hTh = (2 * thWin) / nTh, hZ = (zHi - zLo) / nZ;
  for (let it = 0; it < 80; it++) { let improved = false; for (const dth of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) { const f = d2(bth + dth, bz + dz); if (f < best) { best = f; bth += dth; bz += dz; improved = true; } } if (!improved) { hTh *= 0.5; hZ *= 0.5; } if (hTh < 1e-11 && hZ < 1e-11) break; }
  return Math.sqrt(best);
}
function apexU(rA: AnalyticRadiusFn, uSeed: number, t: number): { u: number; r: number } {
  const z = t * H; const W = (1 / 72) / 4; let a = uSeed - W, b = uSeed + W; const GR = (Math.sqrt(5) - 1) / 2;
  const f = (u: number): number => rA(TAU * (u - Math.floor(u)), z); let c = b - GR * (b - a), d = a + GR * (b - a); let fc = f(c), fd = f(d);
  for (let it = 0; it < 60; it++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); } if (b - a < 1e-9) break; }
  const u = (a + b) / 2; return { u, r: f(u) };
}
function loadExtract(): CrestExtractResult { return JSON.parse(readFileSync(EXCACHE, 'utf8')) as CrestExtractResult; }

// dense 36-pt barycentric sampler (vs the reconcile's 10-pt): all i/8,j/8 interior lattice + edge mids + centroid.
const BARY36: Array<[number, number, number]> = (() => { const b: Array<[number, number, number]> = []; for (let i = 1; i < 8; i++) for (let j = 1; j + i < 8; j++) b.push([i / 8, j / 8, (8 - i - j) / 8]); b.push([0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]); return b; })();
function leafDintDense36(rA: AnalyticRadiusFn, p0: [number, number, number], p1: [number, number, number], p2: [number, number, number]): number {
  let mx = 0; for (const [b0, b1, b2] of BARY36) { const pt: [number, number, number] = [b0 * p0[0] + b1 * p1[0] + b2 * p2[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1], b0 * p0[2] + b1 * p1[2] + b2 * p2[2]]; const d = truePerpLocal(rA, pt); if (d > mx) mx = d; } return mx;
}
// the reconcile's 10-pt sampler (its early-stop uses this).
const BARY10: Array<[number, number, number]> = (() => { const b: Array<[number, number, number]> = []; for (let i = 1; i < 5; i++) for (let j = 1; j + i < 5; j++) b.push([i / 5, j / 5, (5 - i - j) / 5]); b.push([0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]); return b; })();
function leafDint10(rA: AnalyticRadiusFn, p0: [number, number, number], p1: [number, number, number], p2: [number, number, number]): number {
  let mx = 0; for (const [b0, b1, b2] of BARY10) { const pt: [number, number, number] = [b0 * p0[0] + b1 * p1[0] + b2 * p2[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1], b0 * p0[2] + b1 * p1[2] + b2 * p2[2]]; const d = truePerpLocal(rA, pt); if (d > mx) mx = d; } return mx;
}

const med = (a: number[]): number => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const p99f = (a: number[]): number => { if (!a.length) return 0; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))]; };

describe('verify intrinsic-apex reconcile CONFIRM (adversarial)', () => {
  it.skipIf(process.env.PF_VERIFY_IA !== '1')('worst-400-population + dense36 leaf + cap-honesty', () => {
    if (rowExists('verify')) { plog('verify exists, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const ex = loadExtract();
    const crestUt = ex.crestUt;
    // WORST-400 gradU population (EXACT selection the REFUTED sweeps used) — NOT uniform stride.
    const du = 1 / 8192;
    const cand: Array<{ u: number; t: number; gradU: number }> = [];
    for (let i = 0; i + 1 < crestUt.length; i += 2) {
      const u = crestUt[i], t = crestUt[i + 1]; const z = t * H;
      const gU = Math.abs(rA(TAU * ((u + du) - Math.floor(u + du)), z) - rA(TAU * ((u - du) - Math.floor(u - du)), z)) / (2 * du * TAU);
      cand.push({ u, t, gradU: gU });
    }
    cand.sort((a, b) => b.gradU - a.gradU);
    const cusps = cand.slice(0, 400);
    plog(`worst-400 gradU ${cusps[399].gradU.toFixed(1)}..${cusps[0].gradU.toFixed(1)}`);

    const FACET_ARC_MM = 0.181, FACET_Z_MM = 0.095;
    const duBase = FACET_ARC_MM / (R_MEAN * TAU), dtApex = FACET_Z_MM / H;

    // flatten w/ 10-pt early-stop (EXACTLY the reconcile), but RECORD each accepted leaf's geometry for dense36 re-measure
    // + count level-0 caps with self>0.01.
    interface Leaf { d10: number; verts: [[number, number, number], [number, number, number], [number, number, number]]; capped: boolean; }
    function flatten(u0: number, t0: number, u1: number, t1: number, u2: number, t2: number, level: number, out: Leaf[]): void {
      const p0 = lift(rA, u0, t0), p1 = lift(rA, u1, t1), p2 = lift(rA, u2, t2);
      const self = leafDint10(rA, p0, p1, p2);
      if (level <= 0 || self <= 0.01) { out.push({ d10: self, verts: [p0, p1, p2], capped: level <= 0 && self > 0.01 }); return; }
      const m01u = (u0 + u1) / 2, m01t = (t0 + t1) / 2, m12u = (u1 + u2) / 2, m12t = (t1 + t2) / 2, m20u = (u2 + u0) / 2, m20t = (t2 + t0) / 2;
      flatten(u0, t0, m01u, m01t, m20u, m20t, level - 1, out);
      flatten(m01u, m01t, u1, t1, m12u, m12t, level - 1, out);
      flatten(m20u, m20t, m12u, m12t, u2, t2, level - 1, out);
      flatten(m01u, m01t, m12u, m12t, m20u, m20t, level - 1, out);
    }

    const worstLeaf10: number[] = [], worstLeaf36: number[] = [], leafCounts: number[] = [];
    let cuspsOutlier10 = 0, cuspsOutlier36 = 0, cappedLeavesTotal = 0, cuspsWithCappedLeaf = 0;
    let dense36LeaksInAcceptedLeaf = 0; // accepted (self10<=0.01) leaves whose dense36 > 0.01
    for (const s of cusps) {
      const apex = apexU(rA, s.u, s.t);
      const zc = s.t * H; const rApex = rA(TAU * (apex.u - Math.floor(apex.u)), zc);
      const flankDrop = Math.min(rApex - rA(TAU * ((apex.u - duBase) - Math.floor(apex.u - duBase)), zc), rApex - rA(TAU * ((apex.u + duBase) - Math.floor(apex.u + duBase)), zc));
      const apexHi = apexU(rA, apex.u, Math.min(0.999, s.t + dtApex));
      const leaves: Leaf[] = [];
      // BOTH flanks (the reconcile only seeded the valley-minus side; the worst cusp may be asymmetric — do both).
      flatten(apex.u - duBase, s.t, apex.u, s.t, apexHi.u, s.t + dtApex, 5, leaves);
      flatten(apex.u, s.t, apex.u + duBase, s.t, apexHi.u, s.t + dtApex, 5, leaves);
      let capped = false, w10 = 0, w36 = 0;
      for (const lf of leaves) {
        if (lf.d10 > w10) w10 = lf.d10;
        const d36 = leafDintDense36(rA, lf.verts[0], lf.verts[1], lf.verts[2]);
        if (d36 > w36) w36 = d36;
        if (lf.capped) { cappedLeavesTotal++; capped = true; }
        if (lf.d10 <= 0.01 && d36 > 0.01) dense36LeaksInAcceptedLeaf++;
      }
      worstLeaf10.push(w10); worstLeaf36.push(w36); leafCounts.push(leaves.length);
      if (w10 > 0.01) cuspsOutlier10++;
      if (w36 > 0.01) cuspsOutlier36++;
      if (capped) cuspsWithCappedLeaf++;
      void flankDrop;
    }
    const row = {
      key: 'verify', nCusp: cusps.length, capLevel: 5, note: 'worst-400 gradU pop, BOTH flanks',
      worstLeaf10_p50: +med(worstLeaf10).toFixed(4), worstLeaf10_p99: +p99f(worstLeaf10).toFixed(4), worstLeaf10_max: +Math.max(...worstLeaf10).toFixed(4),
      worstLeaf36_p50: +med(worstLeaf36).toFixed(4), worstLeaf36_p99: +p99f(worstLeaf36).toFixed(4), worstLeaf36_max: +Math.max(...worstLeaf36).toFixed(4),
      cuspsOutlier10, cuspsOutlier36, outlierFrac10: +(cuspsOutlier10 / cusps.length).toFixed(3), outlierFrac36: +(cuspsOutlier36 / cusps.length).toFixed(3),
      cappedLeavesTotal, cuspsWithCappedLeaf, dense36LeaksInAcceptedLeaf,
      leavesPerCuspP50: +med(leafCounts).toFixed(0), leavesPerCuspP99: +p99f(leafCounts).toFixed(0), leavesPerCuspMax: Math.max(...leafCounts),
    };
    checkpoint(row);
    plog(`[VERIFY] out10=${cuspsOutlier10}/${cusps.length} out36=${cuspsOutlier36}/${cusps.length} leaf36 p99=${row.worstLeaf36_p99} max=${row.worstLeaf36_max} capped=${cappedLeavesTotal} dense36Leaks=${dense36LeaksInAcceptedLeaf} leaves/cusp max=${row.leavesPerCuspMax}`);
    expect(cusps.length).toBe(400);
  }, 60 * 60 * 1000);

  // ruler independence: cross-check truePerpLocal vs full-azimuth brute on 30 near-apex leaf-interior points
  it.skipIf(process.env.PF_VERIFY_IA !== '1')('ruler-independent-xcheck', () => {
    if (rowExists('ruler-ind')) { plog('ruler-ind exists, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const ex = loadExtract(); const crestUt = ex.crestUt;
    let maxDiff = 0;
    for (let k = 0; k < 30; k++) {
      const i = 2 * Math.floor((k / 30) * (crestUt.length / 2));
      const u = crestUt[i], t = crestUt[i + 1];
      const apex = apexU(rA, u, t);
      // an apex-adjacent interior point (halfway apex->foot, slightly off-row) — the reddest kind
      const foot = apex.u + 0.02 / (R_MEAN * TAU);
      const pu = (apex.u + foot) / 2, pt = t + 0.0004;
      const p = lift(rA, pu, pt);
      const dLoc = truePerpLocal(rA, p);
      const dBr = bruteNearestOnRadialSurface(p[0], p[1], p[2], rA, H, { nTheta: 4096, nZ: 800, zBandMm: 8 }).dist;
      const df = Math.abs(dLoc - dBr); if (df > maxDiff) maxDiff = df;
    }
    checkpoint({ key: 'ruler-ind', nTest: 30, maxDiffMm: +maxDiff.toFixed(6) });
    plog(`[RULER-IND] maxDiff=${maxDiff.toFixed(6)} (must be small vs full-azimuth brute)`);
    expect(maxDiff).toBeLessThan(1e-3);
  }, 30 * 60 * 1000);
});
