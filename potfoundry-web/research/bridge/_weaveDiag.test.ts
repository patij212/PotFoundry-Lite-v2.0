// _weaveDiag.test.ts — DEV-ONLY. Diagnose WHERE the BasketWeave crease-conforming residual lives. The validate run
// showed worst facets AT the layer rings (t=k/10) — a t-direction V-groove crease. This probe examines the RADIAL
// PROFILE across a layer ring in t (fine) at several theta, to size the M-square rows correctly (the groove is a
// C0 kink in t; the flanks are steep and need dense rows AROUND the ring, not just one row ON it).
//
// Also: is the 0.59 true-3D worst a GN centroid overstatement (steep-flank wrong-well)? Compare GN vs analyticBrute
// at the worst facet centroids. Env PF_WEAVE=1.

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, projectPointToRadialSurface } from './labkit';
import { analyticBruteDist } from './_sfbPushLib';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const TAU = 2 * Math.PI;
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe.skipIf(!RUN)('WEAVE diag — layer-ring t-groove profile + GN-vs-brute', () => {
  it('profile the t-direction crease at a layer ring; measure groove sharpness', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const layers = DEFAULT_BASKET_WEAVE.bwLayers; // 10
    const strands = DEFAULT_BASKET_WEAVE.bwStrands; // 16

    // t-profile across the layer ring at t=0.1 (v=1.0), at 3 theta: strand-cell CENTER (u=0.5/16), strand BOUNDARY
    // (u=1/16), and quarter (u=0.25/16). Fine t sweep +-0.06 around t=0.1.
    const ringT = 0.1; const halfT = 0.06; const nT = 600;
    const thetas = { center: 0.5 / strands, boundary: 1.0 / strands, quarter: 0.25 / strands };
    const profiles: Record<string, Array<[number, number]>> = {};
    const grooveInfo: Record<string, unknown> = {};
    for (const [nm, uu] of Object.entries(thetas)) {
      const th = uu * TAU; const prof: Array<[number, number]> = [];
      let minR = Infinity, minT = ringT;
      for (let i = 0; i <= nT; i++) { const tt = ringT - halfT + (2 * halfT) * (i / nT); const r = rA(th, tt * H); prof.push([+tt.toFixed(6), +r.toFixed(5)]); if (r < minR) { minR = r; minT = tt; } }
      profiles[nm] = prof.filter((_, i) => i % 6 === 0); // downsample for the json
      // groove depth: r at ring center vs r at +-halfT
      const rAtEdge = (rA(th, (ringT - halfT) * H) + rA(th, (ringT + halfT) * H)) / 2;
      grooveInfo[nm] = { minR: +minR.toFixed(4), minT: +minT.toFixed(5), rAtEdge: +rAtEdge.toFixed(4), grooveDepthMm: +(rAtEdge - minR).toFixed(4) };
    }

    // vertical speed |dP/dt| AT the ring vs BETWEEN rings (to show the speed spike the average-speed M-square misses)
    const vSpeedAt = (uu: number, tt: number): number => { const dt = 5e-4; const p = (t2: number): [number, number, number] => { const th = uu * TAU, z = t2 * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; }; const a = p(Math.max(0, tt - dt)), b = p(Math.min(1, tt + dt)); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (2 * dt); };
    const speedProfile: Array<[number, number]> = [];
    for (let i = 0; i <= 120; i++) { const tt = ringT - halfT + (2 * halfT) * (i / 120); speedProfile.push([+tt.toFixed(5), +vSpeedAt(0.5 / strands, tt).toFixed(3)]); }

    ck('diag_ringprofile', { ringT, grooveInfo, speedProfile, profiles });
    console.log('LAYER-RING GROOVE:', JSON.stringify(grooveInfo, null, 1));
    const sp = speedProfile.map((x) => x[1]);
    console.log(`vSpeed at ring range: min=${Math.min(...sp).toFixed(2)} max=${Math.max(...sp).toFixed(2)} (ratio ${(Math.max(...sp) / Math.max(0.01, Math.min(...sp))).toFixed(1)}x)`);

    // GN vs brute at a worst-facet-like point: centroid of a facet spanning the ring flank at u=0.0638, t=0.098
    const pts = [[0.0638, 0.098], [0.5638, 0.0984], [0.6867, 0.1985]];
    const gnbr: Array<Record<string, number>> = [];
    for (const [uu, tt] of pts) {
      const th = uu * TAU, z = tt * H, r = rA(th, z);
      // simulate a facet centroid slightly off-surface toward the chord (use the surface point; GN/brute measure to surface = 0, so instead offset radially inward by a small chord-like amount to see the wrong-well behavior). Use the SURFACE point; both should be ~0.
      const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
      const gn = projectPointToRadialSurface(px, py, pz, rA).dist;
      const br = analyticBruteDist(px, py, pz, rA, H);
      gnbr.push({ u: +uu.toFixed(4), t: +tt.toFixed(4), gn: +gn.toFixed(5), brute: +br.toFixed(5) });
    }
    console.log('GN-vs-brute at surface pts (should be ~0):', JSON.stringify(gnbr));
  });
});
