// _pf_race_sn_diag.test.ts — DEV-ONLY (PF_SN_DIAG=1). LOCATE the surface-native no-bridge outliers at a fine level:
// are they (a) NEAR-CREST FLANK facets (steepest part of the flank — proxy uniform strip under-resolves), (b) the
// CREST-POLYLINE t-chord (crest edge itself bridging the apex ridge's z-curvature), or (c) apex-straddle (should be 0)?
// This decides whether the residual is a PROXY artifact (uniform flank) or a genuine mechanism floor.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, bruteNearestOnRadialSurface, type AnalyticRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { findSharpestCrest, buildSurfaceNativeNoBridge, lift, refineCrestU, type CuspWindow } from './_pf_race_surfnativeLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H; const STYLE = 'GothicArches' as StyleId; const R_MEAN = 48; const TAU = 2 * Math.PI;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_race_surfnative');

describe('sn-diag', () => {
  it.skipIf(process.env.PF_SN_DIAG !== '1')('locate SN outliers at K=48', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS) as AnalyticRadiusFn;
    const tMid = 0.62; const { uApex, nCrests } = findSharpestCrest(rA, tMid, H, R_MEAN);
    const bayDu = 1 / nCrests; const dt = 0.6 / H;
    const win: CuspWindow = { uApex, halfDu: bayDu * 0.55, t0: tMid - dt, t1: tMid + dt, rMean: R_MEAN, H };
    const sn = buildSurfaceNativeNoBridge(rA, win, 32, 48);
    const { verts, tris } = sn; const nV = verts.length / 2;
    const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, verts[2 * i], verts[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const bary: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
    // per-facet: max interior dev + how far each vertex's u sits from the local crest (0 = ON crest) + facet u-span
    const rows: Array<{ dev: number; minCrestDu: number; maxCrestDu: number; uSpanArc: number; tSpanMm: number }> = [];
    const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => {
      const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z);
      return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
    };
    for (let f = 0; f < tris.length / 3; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      let mx = 0;
      for (const [wa, wb, wc] of bary) {
        const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
        const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
        const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
        const um = wa * verts[2 * a] + wb * verts[2 * b] + wc * verts[2 * c];
        const tm = wa * verts[2 * a + 1] + wb * verts[2 * b + 1] + wc * verts[2 * c + 1];
        const bound = utBound(px, py, pz, um, tm);
        const d = bound <= 0.006 ? bound : bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 2048, nZ: 120, zBandMm: 3, refineIters: 60 }).dist;
        if (d > mx) mx = d;
      }
      // crest-du for each vertex (distance in u from the row's true crest)
      const vs = [a, b, c];
      let minCd = Infinity, maxCd = 0, uMin = Infinity, uMax = -Infinity, tMin = Infinity, tMax = -Infinity;
      for (const v of vs) {
        const u = verts[2 * v], t = verts[2 * v + 1];
        const uc = refineCrestU(rA, uApex, t, win.halfDu * 0.5, H);
        const cd = Math.abs(u - uc); if (cd < minCd) minCd = cd; if (cd > maxCd) maxCd = cd;
        if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (t < tMin) tMin = t; if (t > tMax) tMax = t;
      }
      rows.push({ dev: mx, minCrestDu: minCd, maxCrestDu: maxCd, uSpanArc: (uMax - uMin) * TAU * R_MEAN, tSpanMm: (tMax - tMin) * H });
    }
    rows.sort((x, y) => y.dev - x.dev);
    const worst = rows.slice(0, 40);
    // classify worst-40: onCrest (both crest-du tiny => a crest-polyline t-edge facet) vs flank (spans valley->crest)
    let nCrestEdge = 0, nFlankNearCrest = 0, nFlankMid = 0;
    for (const r of worst) {
      if (r.maxCrestDu < 1e-4) nCrestEdge++;         // all 3 verts on the crest polyline => crest t-chord facet
      else if (r.minCrestDu < bayDu * 0.15) nFlankNearCrest++; // touches crest, spans onto steep near-crest flank
      else nFlankMid++;
    }
    const med = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const out = {
      K: 48, nFlank: 32, nTris: tris.length / 3,
      worst40_devP50: +med(worst.map((r) => r.dev)).toFixed(4), worst40_devMax: +worst[0].dev.toFixed(4),
      class_crestEdge: nCrestEdge, class_flankNearCrest: nFlankNearCrest, class_flankMid: nFlankMid,
      worst40_uSpanArcMed: +med(worst.map((r) => r.uSpanArc)).toFixed(4), worst40_tSpanMmMed: +med(worst.map((r) => r.tSpanMm)).toFixed(4),
      worst40_minCrestDuMed: +med(worst.map((r) => r.minCrestDu)).toFixed(6),
      sample: worst.slice(0, 12).map((r) => ({ dev: +r.dev.toFixed(4), minCd: +r.minCrestDu.toFixed(5), maxCd: +r.maxCrestDu.toFixed(5), uArc: +r.uSpanArc.toFixed(3), tMm: +r.tSpanMm.toFixed(3) })),
    };
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, 'sn_diag_K48.json'), JSON.stringify(out, null, 1));
    // eslint-disable-next-line no-console
    console.log(`[SN-DIAG] worst40 devP50=${out.worst40_devP50} max=${out.worst40_devMax} | crestEdge=${nCrestEdge} flankNearCrest=${nFlankNearCrest} flankMid=${nFlankMid} | uSpanArcMed=${out.worst40_uSpanArcMed}mm tSpanMmed=${out.worst40_tSpanMmMed}mm`);
    expect(worst.length).toBe(40);
  }, 30 * 60 * 1000);
});
