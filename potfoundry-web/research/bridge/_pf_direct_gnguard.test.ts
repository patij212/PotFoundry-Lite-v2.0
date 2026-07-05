// _pf_direct_gnguard.test.ts — DEV-ONLY (PF_GNGUARD=1). FAST honest whole-mesh outlier count on the persisted
// direct-strip mesh using the two-stage utBound->GN ruler (GN is honest on the SINGLE-VALUED Gothic/GeoStar radius
// field per the labkit note; the full-azimuth brute is only needed for TANGLED LATTICES). 45-pt denseBary per
// facet, EVERY free facet. Gives the (outliers, max) direction in seconds while the trusted brute finishes.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectPointToRadialSurface } from './labkit';
import { makeGothicPatch, lift, denseBary } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

const TAU = 2 * Math.PI;
function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path); const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const uv: number[] = new Array(nV * 2), tris: number[] = new Array(nT * 3);
  let o = 8; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

describe('direct-gnguard', () => {
  it.skipIf(process.env.PF_GNGUARD !== '1')('fast GN whole-mesh outliers', () => {
    const style = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
    const patch = style === 'geostar' ? makeGeoStarPatch(Number(process.env.PF_BAYS ?? 2), Number(process.env.PF_ZBAND ?? 8)) : makeGothicPatch(Number(process.env.PF_BAYS ?? 2), Number(process.env.PF_ZBAND ?? 8));
    const { rA, H } = patch;
    const dir = join(process.cwd(), 'research', 'exchange', `_pf_creststrip_direct_${style}${process.env.PF_SMOKE === '1' ? '_smoke' : ''}`);
    const bin = loadBin(join(dir, 'direct_mesh.bin'));
    if (!bin) { /* eslint-disable-next-line no-console */ console.log('no mesh'); expect(false).toBe(false); return; }
    const { uv, tris } = bin;
    const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    const nF = tris.length / 3; const TOL = 0.01; const preFilter = 0.006;
    const BARY = denseBary(8);
    const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => { const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z); return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz); };
    let maxMm = 0, nOut = 0; const devs: number[] = [];
    for (let f = 0; f < nF; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
      while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
      let mx = 0;
      for (const [wa, wb, wc] of BARY) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
        const bound = utBound(px, py, pz, um, tm);
        if (bound <= preFilter) { if (bound > mx) mx = bound; continue; }
        const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
        if (gn > mx) mx = gn;
      }
      devs.push(mx); if (mx > maxMm) maxMm = mx; if (mx > TOL) nOut++;
    }
    devs.sort((x, y) => x - y);
    const p = (q: number): number => devs[Math.min(devs.length - 1, Math.floor(q * devs.length))];
    /* eslint-disable-next-line no-console */
    console.log(`[GNGUARD ${style}] nF=${nF} outliers(GN,>0.01)=${nOut} max=${maxMm.toFixed(5)} p50=${p(0.5).toFixed(5)} p90=${p(0.9).toFixed(5)} p99=${p(0.99).toFixed(5)}`);
    expect(nF).toBeGreaterThan(0);
  }, 1200000);
});
