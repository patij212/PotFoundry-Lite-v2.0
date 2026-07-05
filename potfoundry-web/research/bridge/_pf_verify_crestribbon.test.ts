// _pf_verify_crestribbon.test.ts — SKEPTIC re-audit of E-2026-07-04-RACE-CRESTRIBBON.
// Independently re-measures the emit-flatten leaf sub-facets with DENSE interior barycentric sampling
// (not 3 edge-mids + centroid), and cross-checks the LOCAL projector against the FULL-2pi brute on the
// worst leaf points. If dense sampling finds interior sag the coarse ruler missed, "0 outliers" is an artifact.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, bruteNearestOnRadialSurface, type AnalyticRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H, TAU = 2 * Math.PI, STYLE = 'GothicArches' as StyleId, R_MEAN = 48;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_race_crestribbon');
const EXCACHE = join(process.cwd(), 'research', 'exchange', '_gd_gothic', 'extract.cache.json');
const FACET_ARC_MM = 0.181, FACET_Z_MM = 0.095;

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
function lift(rA: AnalyticRadiusFn, u: number, t: number): V3 { const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; }

function true3dFull(rA: AnalyticRadiusFn, p: V3): number {
  // full-2pi sweep (the aliasing-immune ruler); moderate grid + deep refine converges on smooth flanks.
  return bruteNearestOnRadialSurface(p[0], p[1], p[2], rA, H, { nTheta: 2048, nZ: 400, zBandMm: 6, refineIters: 90 }).dist;
}
function true3dLocal(rA: AnalyticRadiusFn, p: V3, thetaWin = 0.08, zBandMm = 5): number {
  const th0 = Math.atan2(p[1], p[0]); const nTh = 220, nZ = 180, refineIters = 80;
  const zLo = Math.max(0, p[2] - zBandMm), zHi = Math.min(H, p[2] + zBandMm);
  const d2 = (th: number, z: number): number => { const r = rA(th, z); const ex = p[0] - r * Math.cos(th), ey = p[1] - r * Math.sin(th), ez = p[2] - z; return ex * ex + ey * ey + ez * ez; };
  let best = Infinity, bth = th0, bz = p[2];
  for (let i = 0; i <= nTh; i++) { const th = th0 - thetaWin + (2 * thetaWin) * (i / nTh); for (let j = 0; j <= nZ; j++) { const z = zLo + (zHi - zLo) * (j / nZ); const f = d2(th, z); if (f < best) { best = f; bth = th; bz = z; } } }
  let hTh = (2 * thetaWin) / nTh, hZ = (zHi - zLo) / nZ;
  for (let it = 0; it < refineIters; it++) { let improved = false; for (const dth of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) { const f = d2(bth + dth, bz + dz); if (f < best) { best = f; bth += dth; bz += dz; improved = true; } } if (!improved) { hTh *= 0.5; hZ *= 0.5; } if (hTh < 1e-11 && hZ < 1e-11) break; }
  return Math.sqrt(best);
}

function apexU(rA: AnalyticRadiusFn, uSeed: number, t: number, win: number): number {
  const z = t * H; const GR = (Math.sqrt(5) - 1) / 2; let a = uSeed - win, b = uSeed + win;
  const f = (u: number): number => rA(TAU * (u - Math.floor(u)), z);
  let c = b - GR * (b - a), d = a + GR * (b - a); let fc = f(c), fd = f(d);
  for (let it = 0; it < 40; it++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); } if (b - a < 1e-8) break; }
  return (a + b) / 2;
}
function median(arr: number[]): number { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function pctile(arr: number[], p: number): number { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

/** DENSE interior barycentric sample of a flat (u,t) leaf triangle: NB points per bary-edge (>> 3 mids). */
function denseLeafWorst(rA: AnalyticRadiusFn, p0: V3, p1: V3, p2: V3, NB: number): number {
  let worst = 0;
  for (let i = 0; i <= NB; i++) for (let j = 0; j <= NB - i; j++) {
    const b0 = i / NB, b1 = j / NB, b2 = 1 - b0 - b1;
    // skip the 3 exact corners (they are on-surface by construction; we want INTERIOR)
    if ((b0 === 1) || (b1 === 1) || (b2 === 1)) continue;
    const q = add(add(scl(p0, b0), scl(p1, b1)), scl(p2, b2));
    const d = true3dLocal(rA, q); if (d > worst) worst = d;
  }
  return worst;
}

interface CrestCache { crestUt: number[]; }

describe('SKEPTIC verify crest-ribbon: dense interior sampling + full-2pi cross-check', () => {
  // SECOND probe: re-measure the WORST leaf sub-facets' dense interior points with the FULL-2pi brute (not local),
  // to rule out the local projector UNDER-reporting leaf interior sag (xMaxFullMinusLocal=0.1122 showed local CAN
  // understate on some points). If full-brute leaf worst still <=0.01, "0 outliers" is robust to ruler choice.
  it.skipIf(process.env.PF_VERIFY_RIBBON2 !== '1')('full-brute re-audit of worst leaf interiors', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const cache = JSON.parse(readFileSync(EXCACHE, 'utf8')) as CrestCache;
    const crestUt = cache.crestUt; const nCrest = crestUt.length / 2;
    const duBase = FACET_ARC_MM / (R_MEAN * TAU), dtApex = FACET_Z_MM / H;
    const stride = Math.max(1, Math.floor(nCrest / 120));
    const NB = 10;
    // Focus on the WORST band: high-t + high-flankDrop cusps (from cusp_diag the worst pnWorst were t~0.95).
    const fullLeafWorst: number[] = []; const localLeafWorst: number[] = [];
    function coarseSelf(p0: V3, p1: V3, p2: V3): number { const fp = (b0: number, b1: number, b2: number): V3 => add(add(scl(p0, b0), scl(p1, b1)), scl(p2, b2)); let w = 0; for (const [b0, b1, b2] of [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]] as const) { const d = true3dLocal(rA, fp(b0, b1, b2)); if (d > w) w = d; } return w; }
    function denseLeafBoth(p0: V3, p1: V3, p2: V3): { loc: number; full: number } {
      let loc = 0, full = 0;
      for (let i = 0; i <= NB; i++) for (let j = 0; j <= NB - i; j++) { const b0 = i / NB, b1 = j / NB, b2 = 1 - b0 - b1; if (b0 === 1 || b1 === 1 || b2 === 1) continue; const q = add(add(scl(p0, b0), scl(p1, b1)), scl(p2, b2)); const dl = true3dLocal(rA, q); if (dl > loc) loc = dl; const df = true3dFull(rA, q); if (df > full) full = df; }
      return { loc, full };
    }
    function recur(u0: number, t0: number, u1: number, t1: number, u2: number, t2: number, level: number): void {
      const p0 = lift(rA, u0, t0), p1 = lift(rA, u1, t1), p2 = lift(rA, u2, t2);
      const cw = coarseSelf(p0, p1, p2);
      if (level <= 0 || cw <= 0.01) { const b = denseLeafBoth(p0, p1, p2); localLeafWorst.push(b.loc); fullLeafWorst.push(b.full); return; }
      const m01u = (u0 + u1) / 2, m01t = (t0 + t1) / 2, m12u = (u1 + u2) / 2, m12t = (t1 + t2) / 2, m20u = (u2 + u0) / 2, m20t = (t2 + t0) / 2;
      recur(u0, t0, m01u, m01t, m20u, m20t, level - 1); recur(m01u, m01t, u1, t1, m12u, m12t, level - 1); recur(m20u, m20t, m12u, m12t, u2, t2, level - 1); recur(m01u, m01t, m12u, m12t, m20u, m20t, level - 1);
    }
    let nUsed = 0; let elig = 0; const t0 = Date.now();
    for (let ci = 0; ci < nCrest && nUsed < 12; ci += stride) {
      const uc0 = crestUt[2 * ci], tc = crestUt[2 * ci + 1];
      if (tc < 0.90 || tc > 0.97) continue; // WORST band only (high-t steep cusps)
      const uc = apexU(rA, uc0, tc, duBase * 1.5); const zc = tc * H; const rApex = rA(TAU * uc, zc);
      const flankDrop = Math.min(rApex - rA(TAU * (uc - duBase - Math.floor(uc - duBase)), zc), rApex - rA(TAU * (uc + duBase - Math.floor(uc + duBase)), zc));
      if (flankDrop < 0.02) continue; elig++;
      const ucHi = apexU(rA, uc, Math.min(0.999, tc + dtApex), duBase * 1.5);
      recur(uc - duBase, tc, uc, tc, ucHi, tc + dtApex, 4); nUsed++;
      console.log(`[verify2] nUsed=${nUsed} tc=${tc.toFixed(3)} fullLeafMax=${Math.max(...fullLeafWorst).toFixed(4)} locLeafMax=${Math.max(...localLeafWorst).toFixed(4)} elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    const row = { key: 'VERIFY2-fullbrute', nUsed, NB, fullLeafMax: +Math.max(...fullLeafWorst).toFixed(4), fullLeafP99: +pctile(fullLeafWorst, 0.99).toFixed(4), localLeafMax: +Math.max(...localLeafWorst).toFixed(4), fullFindsOutliers: Math.max(...fullLeafWorst) > 0.01, nLeaves: fullLeafWorst.length };
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, 'verify2_fullbrute.json'), JSON.stringify(row, null, 0));
    console.log(`[VERIFY2] ${JSON.stringify(row)}`);
    expect(nUsed).toBeGreaterThan(0);
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_VERIFY_RIBBON !== '1')('dense-audit of emit-flatten leaf sub-facets', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const cache = JSON.parse(readFileSync(EXCACHE, 'utf8')) as CrestCache;
    const crestUt = cache.crestUt; const nCrest = crestUt.length / 2;
    const duBase = FACET_ARC_MM / (R_MEAN * TAU), dtApex = FACET_Z_MM / H;
    // Take the SAME stride the emit test used (120 target) but only audit a subset densely for cost.
    const stride = Math.max(1, Math.floor(nCrest / 120));
    const NB = 12; // dense: 12 sub-divisions => ~78 interior bary points per leaf (vs 4 in the probe)

    // Replicate the emit-flatten recursion but at each LEAF (self<=0.01 or level cap 4) measure with DENSE sampling.
    const leafWorstCoarse: number[] = []; // probe's ruler (3 mids + centroid)
    const leafWorstDense: number[] = [];  // my dense ruler
    const cuspWorstCoarse: number[] = []; // per-cusp worst leaf, coarse
    const cuspWorstDense: number[] = [];  // per-cusp worst leaf, dense
    const xLocal: number[] = [], xFull: number[] = []; // full-2pi cross-check on worst dense points

    function coarseSelf(p0: V3, p1: V3, p2: V3): number {
      const flatPt = (b0: number, b1: number, b2: number): V3 => add(add(scl(p0, b0), scl(p1, b1)), scl(p2, b2));
      let w = 0; for (const [b0, b1, b2] of [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]] as const) { const d = true3dLocal(rA, flatPt(b0, b1, b2)); if (d > w) w = d; } return w;
    }
    let cuspCoarse = 0, cuspDense = 0;
    function recur(u0: number, t0: number, u1: number, t1: number, u2: number, t2: number, level: number): void {
      const p0 = lift(rA, u0, t0), p1 = lift(rA, u1, t1), p2 = lift(rA, u2, t2);
      const cw = coarseSelf(p0, p1, p2);
      if (level <= 0 || cw <= 0.01) {
        // LEAF. Measure dense.
        const dw = denseLeafWorst(rA, p0, p1, p2, NB);
        leafWorstCoarse.push(cw); leafWorstDense.push(dw);
        if (cw > cuspCoarse) cuspCoarse = cw; if (dw > cuspDense) cuspDense = dw;
        return;
      }
      const m01u = (u0 + u1) / 2, m01t = (t0 + t1) / 2, m12u = (u1 + u2) / 2, m12t = (t1 + t2) / 2, m20u = (u2 + u0) / 2, m20t = (t2 + t0) / 2;
      recur(u0, t0, m01u, m01t, m20u, m20t, level - 1);
      recur(m01u, m01t, u1, t1, m12u, m12t, level - 1);
      recur(m20u, m20t, m12u, m12t, u2, t2, level - 1);
      recur(m01u, m01t, m12u, m12t, m20u, m20t, level - 1);
    }

    let nUsed = 0; const t0 = Date.now();
    // audit every 4th eligible cusp (cost control) — still spans the whole surface, incl the worst high-t band.
    let elig = 0;
    for (let ci = 0; ci < nCrest; ci += stride) {
      const uc0 = crestUt[2 * ci], tc = crestUt[2 * ci + 1];
      if (tc < 0.03 || tc > 0.97) continue;
      const uc = apexU(rA, uc0, tc, duBase * 1.5); const zc = tc * H; const rApex = rA(TAU * uc, zc);
      const flankDrop = Math.min(rApex - rA(TAU * (uc - duBase - Math.floor(uc - duBase)), zc), rApex - rA(TAU * (uc + duBase - Math.floor(uc + duBase)), zc));
      if (flankDrop < 0.02) continue;
      elig++;
      if (elig % 4 !== 0) continue; // dense audit is ~78x per-leaf cost => sample 1-in-4 eligible
      nUsed++;
      const ucHi = apexU(rA, uc, Math.min(0.999, tc + dtApex), duBase * 1.5);
      cuspCoarse = 0; cuspDense = 0;
      // one flank sub-triangle, same as emit test
      recur(uc - duBase, tc, uc, tc, ucHi, tc + dtApex, 4);
      cuspWorstCoarse.push(cuspCoarse); cuspWorstDense.push(cuspDense);
      // full-2pi cross-check: on this cusp's flank centroid + the current worst-dense representative
      if (xLocal.length < 30) {
        const c = lift(rA, (uc - duBase + uc + ucHi) / 3, (tc + tc + tc + dtApex) / 3);
        xLocal.push(true3dLocal(rA, c)); xFull.push(true3dFull(rA, c));
      }
      if (nUsed % 5 === 0) { const line = `[verify] nUsed=${nUsed} elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s cuspDenseWorstSoFar=${Math.max(...cuspWorstDense).toFixed(4)}`; console.log(line); }
    }
    const stat = (arr: number[]): Record<string, number> => ({ p50: +median(arr).toFixed(4), p99: +pctile(arr, 0.99).toFixed(4), max: +(arr.length ? Math.max(...arr) : 0).toFixed(4), n: arr.length, fracGt01: +(arr.filter((x) => x > 0.01).length / Math.max(1, arr.length)).toFixed(3) });
    const row = {
      key: 'VERIFY-dense', nUsed, NB,
      leafCoarse: stat(leafWorstCoarse), leafDense: stat(leafWorstDense),
      cuspCoarse: stat(cuspWorstCoarse), cuspDense: stat(cuspWorstDense),
      // the decisive number: does DENSE sampling of leaves find outliers (>0.01) the coarse ruler missed?
      denseFindsOutliers: pctile(cuspWorstDense, 0.99) > 0.01 || Math.max(...cuspWorstDense) > 0.01,
      denseMaxCusp: +Math.max(...cuspWorstDense).toFixed(4),
      coarseMaxCusp: +Math.max(...cuspWorstCoarse).toFixed(4),
      // ruler trust: local vs full-2pi brute (max local-full; positive+large => local aliased LOW => under-reports)
      xN: xLocal.length,
      xMaxLocalMinusFull: +(xLocal.length ? Math.max(...xLocal.map((v, i) => v - xFull[i])) : 0).toFixed(4),
      xMaxFullMinusLocal: +(xLocal.length ? Math.max(...xFull.map((v, i) => v - xLocal[i])) : 0).toFixed(4),
      xMeanAbsDiff: +(xLocal.length ? xLocal.map((v, i) => Math.abs(v - xFull[i])).reduce((a, b) => a + b, 0) / xLocal.length : 0).toFixed(4),
    };
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, 'verify_dense.json'), JSON.stringify(row, null, 0));
    console.log(`[VERIFY] ${JSON.stringify(row)}`);
    expect(nUsed).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
