// _pf_race_sn_verify.test.ts — DEV-ONLY (PF_SN_VERIFY=1). Adversarial check on the GRADED surface-native G-K4 win:
// (1) the graded flank produces NON-degenerate, non-inverted triangles (min-angle > 0, no zero-area), so the 0-outlier
//     result is not hiding collapsed facets that the interior ruler under-samples;
// (2) the crest polyline is a chain of MESH EDGES (every consecutive crest-node pair is a triangle edge) — the
//     no-bridge property is real, not an accident of the ruler;
// (3) re-score the WHOLE graded mesh with the DENSE 15-pt interior stencil (not the 4-pt) + the TRUSTED 4096x600
//     brute on pre-filtered facets, to confirm 0 outliers is not a 4-pt-sampler artifact.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, triangleQualityDistribution, bruteNearestOnRadialSurface, type AnalyticRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { findSharpestCrest, buildSurfaceNativeGraded, refineCrestU, lift, type CuspWindow } from './_pf_race_surfnativeLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H; const STYLE = 'GothicArches' as StyleId; const R_MEAN = 48; const TAU = 2 * Math.PI;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_race_surfnative');

describe('sn-verify', () => {
  it.skipIf(process.env.PF_SN_VERIFY !== '1')('adversarial check of graded G-K4', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS) as AnalyticRadiusFn;
    const tMid = 0.62; const { uApex } = findSharpestCrest(rA, tMid, H, R_MEAN);
    const bayDu = 1 / 72; const dt = 0.6 / H;
    const win: CuspWindow = { uApex, halfDu: bayDu * 0.55, t0: tMid - dt, t1: tMid + dt, rMean: R_MEAN, H };
    const g = buildSurfaceNativeGraded(rA, win, 32, 48);
    const { verts, tris } = g; const nV = verts.length / 2;
    const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, verts[2 * i], verts[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
    // (1) triangle quality (min angle) + degenerate count
    const q = triangleQualityDistribution({ vertices: xyz, indices: tris });
    let nDegen = 0;
    for (let f = 0; f < tris.length / 3; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const abx = xyz[3 * b] - xyz[3 * a], aby = xyz[3 * b + 1] - xyz[3 * a + 1], abz = xyz[3 * b + 2] - xyz[3 * a + 2];
      const acx = xyz[3 * c] - xyz[3 * a], acy = xyz[3 * c + 1] - xyz[3 * a + 1], acz = xyz[3 * c + 2] - xyz[3 * a + 2];
      const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
      if (Math.hypot(cx, cy, cz) * 0.5 < 1e-9) nDegen++;
    }
    // (2) crest-chain-as-edges: build edge set, check each consecutive crest-node pair is an edge
    const eset = new Set<number>();
    const ek = (p: number, r: number): number => (p < r ? p * nV + r : r * nV + p);
    for (let f = 0; f < tris.length / 3; f++) { const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; eset.add(ek(a, b)); eset.add(ek(b, c)); eset.add(ek(c, a)); }
    // crest nodes are the first 48 vertices (K=48) by construction (buildSurfaceNativeGraded pushes crest first)
    let crestEdgesPresent = 0; const K = 48;
    for (let k = 0; k < K - 1; k++) if (eset.has(ek(k, k + 1))) crestEdgesPresent++;
    // (3) dense re-score with 15-pt stencil + trusted 4096x600 brute (pre-filtered)
    const bary: Array<[number, number, number]> = [];
    const G = 5; for (let i = 1; i < G; i++) for (let j = 1; j < G - i; j++) { const a = i / G, b = j / G, cc = 1 - a - b; if (cc > 0) bary.push([a, b, cc]); }
    bary.push([0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]);
    let worst = 0, nOut = 0;
    for (let f = 0; f < tris.length / 3; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      let mx = 0;
      for (const [wa, wb, wc] of bary) {
        const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
        const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
        const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
        const um = wa * verts[2 * a] + wb * verts[2 * b] + wc * verts[2 * c];
        const tm = wa * verts[2 * a + 1] + wb * verts[2 * b + 1] + wc * verts[2 * c + 1];
        const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z);
        const bound = Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
        const d = bound <= 0.006 ? bound : bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 4096, nZ: 600, zBandMm: 4, refineIters: 60 }).dist;
        if (d > mx) mx = d;
      }
      if (mx > worst) worst = mx; if (mx > 0.01) nOut++;
    }
    const out = {
      tris: tris.length / 3, minAngleDeg: +q.minAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2), nDegen,
      crestEdgesPresent, crestEdgesExpected: K - 1,
      denseStencil15_nOutliers: nOut, denseStencil15_worst: +worst.toFixed(4),
    };
    mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, 'sn_verify_GK4.json'), JSON.stringify(out, null, 1));
    // eslint-disable-next-line no-console
    console.log(`[SN-VERIFY] tris=${out.tris} minAngle=${out.minAngleDeg} %<20=${out.pctBelow20} nDegen=${nDegen} crestEdges=${crestEdgesPresent}/${K - 1} | DENSE15: nOut=${nOut} worst=${out.denseStencil15_worst}`);
    expect(nDegen).toBe(0);
    expect(crestEdgesPresent).toBe(K - 1);
  }, 30 * 60 * 1000);
});
