// _qcolLoc.test.ts — DEV-ONLY. E-2026-07-03-STRUCTCOL2 LOCALIZATION. The M-square wall killed the bulk sliver
// tail (%<20 67%->2.7%) but left (a) a %<10 ~1.3% residual (minAngle worst still 0) and (b) serration jumped to
// 0.195mm. Before pushing density, LOCALIZE both: WHERE do the <10-deg slivers live (u,t histogram) and WHERE do
// the worst serration feature-points land (are they at births / seam / base / top rim?). This decides whether the
// residual is a fixable structural site (births/seam/rim) or genuine steep-flank crowding.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraph } from './_structColLib';
import { msquareRows, rasterizeColumnsSquare, buildStructWall } from './_qcolMsquare';
import { tracePetalLoci } from './_sfbPushLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol2');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

describe('QCOL LOC — sliver + serration localization (E-STRUCTCOL2)', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('localizes <10-deg slivers and worst serration feature-points', () => {
    const sub = process.env.PF_QCOL_SUB ?? 'loc25';
    const name = `loc_${sub}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const hRowMm = Number(process.env.PF_QCOL_HROW ?? '0.25');
    const noBirthRows = process.env.PF_QCOL_NOBIRTH === '1';
    const ts = msquareRows(rA, DIMS.H, hRowMm, noBirthRows ? [] : BIRTHS, { hRowCapMm: hRowMm * 6, seamBand: 0.02 });
    const g = buildRidgeGraph(rA, DIMS.H, ts, 12000);
    const rows = rasterizeColumnsSquare(g, rA, DIMS.H, 0.03, 0, 0.03, 0.6);
    const mesh = buildStructWall(rA, DIMS.H, rows);
    const idxA = mesh.idx, nF = mesh.nF, xyz = mesh.xyz, ut = mesh.ut;

    // --- (1) <10-deg sliver histogram by (u,t) 30x30 + by z-band (base/mid/top) + seam-adjacency flag.
    const UB = 30, TB = 30; const sHist = new Int32Array(UB * TB);
    let nlt10 = 0, nlt5 = 0, nlt1 = 0, seamAdj10 = 0, birthAdj10 = 0, rimAdj10 = 0;
    const cl = (x: number): number => Math.max(-1, Math.min(1, x));
    const e = (p: number, q: number): number => Math.hypot(xyz[3 * p] - xyz[3 * q], xyz[3 * p + 1] - xyz[3 * q + 1], xyz[3 * p + 2] - xyz[3 * q + 2]);
    const worst10: Array<{ u: number; t: number; ang: number; seam: boolean; rim: boolean; birth: boolean }> = [];
    const nearBirth = (t: number): boolean => BIRTHS.some((b) => Math.abs(t - b) < 0.004);
    // interior-only quality tally at TWO seam bands (0.012 and 0.03) + rim excluded: does the M-square BODY
    // reach %<20 ~ 0 once the seam wrap strip (u~0.97-1.0) is excluded?
    let intN = 0, intLt20 = 0, intLt10 = 0;
    const seamBandWide = Number(process.env.PF_QCOL_WIDEBAND ?? '0.03'); let intWN = 0, intWLt20 = 0, intWLt10 = 0;
    for (let f = 0; f < nF; f++) {
      const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
      const A = e(b, c), B = e(c, a), C = e(a, b);
      const aa = Math.acos(cl((B * B + C * C - A * A) / (2 * B * C || 1e-30))); const ab = Math.acos(cl((A * A + C * C - B * B) / (2 * A * C || 1e-30)));
      const mn = Math.min(aa, ab, Math.PI - aa - ab) * 180 / Math.PI;
      const isSeam = [a, b, c].some((v) => ut[2 * v] < 0.012 || ut[2 * v] > 0.988);
      const isSeamW = [a, b, c].some((v) => ut[2 * v] < seamBandWide || ut[2 * v] > 1 - seamBandWide);
      const isRim = [a, b, c].some((v) => ut[2 * v + 1] < 0.004 || ut[2 * v + 1] > 0.996);
      if (!isSeam && !isRim) { intN++; if (mn < 20) intLt20++; if (mn < 10) intLt10++; }
      if (!isSeamW && !isRim) { intWN++; if (mn < 20) intWLt20++; if (mn < 10) intWLt10++; }
      if (mn >= 10) continue;
      nlt10++; if (mn < 5) nlt5++; if (mn < 1) nlt1++;
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      let uC = (ua + ub + uc) / 3; uC -= Math.floor(uC);
      const tC = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const seam = [a, b, c].some((v) => ut[2 * v] < 0.01 || ut[2 * v] > 0.99);
      const rim = [a, b, c].some((v) => ut[2 * v + 1] < 0.003 || ut[2 * v + 1] > 0.997);
      const birth = nearBirth(tC);
      if (seam) seamAdj10++; if (rim) rimAdj10++; if (birth) birthAdj10++;
      const ib = Math.min(UB - 1, Math.max(0, Math.floor(uC * UB))), jb = Math.min(TB - 1, Math.max(0, Math.floor(tC * TB)));
      sHist[jb * UB + ib]++;
      if (worst10.length < 30 && mn < 3) worst10.push({ u: +uC.toFixed(4), t: +tC.toFixed(4), ang: +mn.toFixed(3), seam, rim, birth });
    }
    const cells: Array<{ u: number; t: number; n: number }> = [];
    for (let j = 0; j < TB; j++) for (let i = 0; i < UB; i++) { const s = sHist[j * UB + i]; if (s > 0) cells.push({ u: +((i + 0.5) / UB).toFixed(3), t: +((j + 0.5) / TB).toFixed(3), n: s }); }
    cells.sort((x, y) => y.n - x.n);

    // --- (2) worst serration feature-points: recompute nearest mesh edge for the traced loci, keep the worst 30
    // with their (u,t) + whether near seam/birth/rim. Reuse a simple brute over a hashed edge grid is heavy; here
    // we just re-derive from loci sampling density: report the loci points whose LOCAL row spacing (nearest ts gap)
    // is largest (coarse-z ridge sampling => serration). This tells us if serration is a coarse-row artifact.
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    // for each loci point, the nearest two ts rows and the 3D distance between them AT that u (the local ridge
    // z-segment length the point must sit on) — a proxy for serration (point sits mid-segment => up to half that).
    const segAtRidge = (u: number, t: number): number => {
      let lo = 0, hi = ts.length - 1; for (let i = 0; i < ts.length; i++) { if (ts[i] <= t) lo = i; }
      hi = Math.min(ts.length - 1, lo + 1);
      const p = (tt: number): [number, number, number] => { const th = u * TAU, z = tt * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
      const a = p(ts[lo]), b = p(ts[hi]); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    };
    let maxSeg = 0; const worstSeg: Array<{ u: number; t: number; segMm: number }> = [];
    const segs: number[] = [];
    for (const ln of loci) for (const pt of ln.points) { const s = segAtRidge(pt.u, pt.t); segs.push(s); if (s > maxSeg) maxSeg = s; }
    segs.sort((a, b) => b - a);
    for (const ln of loci) for (const pt of ln.points) { const s = segAtRidge(pt.u, pt.t); if (s > 0.35 && worstSeg.length < 30) worstSeg.push({ u: +pt.u.toFixed(4), t: +pt.t.toFixed(4), segMm: +s.toFixed(3) }); }

    const rec = {
      name, hRowMm, noBirthRows, rows: ts.length, tris: nF,
      interiorQuality: { seamBand: 0.012, n: intN, lt20: intLt20, lt10: intLt10, pctLt20: +(100 * intLt20 / Math.max(1, intN)).toFixed(4), pctLt10: +(100 * intLt10 / Math.max(1, intN)).toFixed(4) },
      interiorQualityWide: { seamBand: seamBandWide, n: intWN, lt20: intWLt20, lt10: intWLt10, pctLt20: +(100 * intWLt20 / Math.max(1, intWN)).toFixed(4), pctLt10: +(100 * intWLt10 / Math.max(1, intWN)).toFixed(4) },
      sliverLt10: { nlt10, nlt5, nlt1, pct: +(100 * nlt10 / nF).toFixed(3), seamAdj: seamAdj10, rimAdj: rimAdj10, birthAdj: birthAdj10, otherInterior: nlt10 - seamAdj10 - rimAdj10 - birthAdj10, topCells: cells.slice(0, 20), worstSamples: worst10 },
      serrationProxy: { maxRidgeSegMm: +maxSeg.toFixed(3), p99SegMm: +segs[Math.floor(0.01 * segs.length)].toFixed(3), worstSegPoints: worstSeg },
    };
    ckpt(name, rec);
    console.log(`QCOLLOC ${name} | INTERIOR(0.012) %<20 ${(100 * intLt20 / Math.max(1, intN)).toFixed(3)} %<10 ${(100 * intLt10 / Math.max(1, intN)).toFixed(3)} | INTERIOR(0.03) %<20 ${(100 * intWLt20 / Math.max(1, intWN)).toFixed(3)} %<10 ${(100 * intWLt10 / Math.max(1, intWN)).toFixed(3)} | ALL <10: ${nlt10} (${(100 * nlt10 / nF).toFixed(2)}%) seam ${seamAdj10} rim ${rimAdj10} birth ${birthAdj10} other ${nlt10 - seamAdj10 - rimAdj10 - birthAdj10} | maxRidgeSeg ${maxSeg.toFixed(3)}mm`);
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
