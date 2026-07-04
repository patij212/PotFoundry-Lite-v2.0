// _pf_race_sn_time.test.ts — DEV-ONLY (PF_SN_TIME=1). Calibrate a CHEAP brute variant against the trusted
// full-azimuth 4096x600 brute on the Gothic cusp window interior points, and time it. The single-cusp interior points
// (flat facets bridging the apex) have their nearest foot potentially a FEW bays away in azimuth, so a narrow local
// window overstates; only a full-azimuth (or wide) scan is trustworthy. We find the cheapest full-2pi grid that still
// AGREES with 4096x600 to << tol, to size the sweep ruler.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, type StyleDims, bruteNearestOnRadialSurface } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { findSharpestCrest, buildFlatUvGrid, lift, type CuspWindow } from './_pf_race_surfnativeLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H; const STYLE = 'GothicArches' as StyleId; const R_MEAN = 48;

describe('sn-time', () => {
  it.skipIf(process.env.PF_SN_TIME !== '1')('calibrate cheap brute variants', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const tMid = 0.62; const { uApex, nCrests } = findSharpestCrest(rA, tMid, H, R_MEAN);
    const bayDu = 1 / nCrests; const dt = 0.6 / H;
    const win: CuspWindow = { uApex, halfDu: bayDu * 0.55, t0: tMid - dt, t1: tMid + dt, rMean: R_MEAN, H };
    const flat = buildFlatUvGrid(win, 48, 32);
    const pts: Array<[number, number, number]> = [];
    const { verts, tris } = flat; const nF = tris.length / 3;
    for (let f = 0; f < nF; f += Math.max(1, Math.floor(nF / 80))) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const [ax, ay, az] = lift(rA, verts[2 * a], verts[2 * a + 1], H);
      const [bx, by, bz] = lift(rA, verts[2 * b], verts[2 * b + 1], H);
      const [cx, cy, cz] = lift(rA, verts[2 * c], verts[2 * c + 1], H);
      pts.push([(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3]);
    }
    const ref = pts.map(([x, y, z]) => bruteNearestOnRadialSurface(x, y, z, rA, H, { nTheta: 4096, nZ: 600, zBandMm: 6, refineIters: 60 }).dist);
    const variants: Array<{ name: string; o: { nTheta: number; nZ: number; zBandMm: number; refineIters: number } }> = [
      { name: 'b2048x120x3', o: { nTheta: 2048, nZ: 120, zBandMm: 3, refineIters: 60 } },
      { name: 'b3072x160x3', o: { nTheta: 3072, nZ: 160, zBandMm: 3, refineIters: 60 } },
      { name: 'b4096x200x3', o: { nTheta: 4096, nZ: 200, zBandMm: 3, refineIters: 60 } },
    ];
    for (const v of variants) {
      const t0 = Date.now();
      let maxD = 0, lw = 0, bw = 0;
      for (let i = 0; i < pts.length; i++) { const d = bruteNearestOnRadialSurface(pts[i][0], pts[i][1], pts[i][2], rA, H, v.o).dist; const e = Math.abs(d - ref[i]); if (e > maxD) { maxD = e; lw = d; bw = ref[i]; } }
      const ms = (Date.now() - t0) / pts.length;
      // eslint-disable-next-line no-console
      console.log(`[SN-TIME] ${v.name}: ${ms.toFixed(1)}ms/call maxAbsDiff=${maxD.toFixed(5)} (v=${lw.toFixed(4)} ref=${bw.toFixed(4)})`);
    }
    expect(pts.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
