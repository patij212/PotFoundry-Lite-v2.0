// _weaveCreaseMap.test.ts — DEV-ONLY. FRONTIER weave STEP 1 recon: characterize the BasketWeave crease GRID
// PRECISELY so the crease-conforming primitive lands mesh lines exactly on the discontinuities.
//
// From STEP 0: BasketWeave (twist=0) has an ORTHOGONAL crease grid — 16 vertical strand boundaries at
// theta=m*TAU/16 (each a GROOVE with 2 flanks) + layer rings at t=k/10. This probe examines:
//  (C1) the radial profile ACROSS a vertical strand boundary (theta sweep at fixed t): where exactly is the C0
//       kink? Is the strand boundary a single C0 line or a groove (min) between two cells?
//  (C2) the radial profile ACROSS a layer ring (t sweep at fixed theta): where is the horizontal C0 kink?
//  (C3) the CHECKER structure: within one grid cell (u in [m,m+1], v in [k,k+1]) is the surface smooth? The
//       over/under max() switchover — is there an INTERIOR crease (diagonal) within a cell, or only on the grid?
//  (C4) confirm the crease loci from analyticSurfaceGate.basketWeaveCreaseLoci match the measured grid.
//
// This tells us: conform to (a) the 16 constant-theta lines + 10 layer rings (grid), and whether (b) any
// intra-cell diagonal crease also needs an edge. Env PF_WEAVE=1.

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { basketWeaveCreaseLoci } from '../../src/fidelity/analyticSurfaceGate';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const TAU = 2 * Math.PI;
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe.skipIf(!RUN)('WEAVE crease-map recon (BasketWeave orthogonal grid)', () => {
  it('characterize the strand-boundary grid + intra-cell structure', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const strands = DEFAULT_BASKET_WEAVE.bwStrands; // 16
    const layers = DEFAULT_BASKET_WEAVE.bwLayers; // 10

    // (C1) theta sweep across the strand boundary at theta=1*TAU/16 (m=1), at t=0.5 (mid layer cell k=5, so v=5.0
    // is a ring — pick t=0.55 -> v=5.5, mid-cell). Fine sweep +-0.5 strand-width around the boundary.
    const t1 = 0.55; const z1 = t1 * H;
    const uB = 1 / strands; // theta/TAU of boundary m=1
    const halfWin = 1.2 / strands;
    const nS = 400;
    const c1: Array<[number, number]> = [];
    for (let i = 0; i <= nS; i++) {
      const uu = uB - halfWin + (2 * halfWin) * (i / nS);
      c1.push([+uu.toFixed(6), +rA(uu * TAU, z1).toFixed(5)]);
    }
    // locate the min (groove bottom) & the kink location
    let minR = Infinity, minU = uB;
    for (const [uu, rr] of c1) if (rr < minR) { minR = rr; minU = uu; }

    // (C2) t sweep across a layer ring at t=0.4 (v=4.0 ring), at theta mid-strand (u=0.5/16).
    const thC = TAU * (0.5 / strands);
    const tRing = 0.4; const halfT = 1.2 / layers; const nT = 400;
    const c2: Array<[number, number]> = [];
    for (let i = 0; i <= nT; i++) {
      const tt = tRing - halfT + (2 * halfT) * (i / nT);
      c2.push([+tt.toFixed(6), +rA(thC, tt * H).toFixed(5)]);
    }
    let minR2 = Infinity, minT = tRing;
    for (const [tt, rr] of c2) if (rr < minR2) { minR2 = rr; minT = tt; }

    // (C3) intra-cell scan: within cell (u in [0,1], v in [5,6]) i.e. theta/TAU in [0,1/16], t in [0.5,0.6], scan a
    // fine 2D grid and compute the max theta-2nd-diff and t-2nd-diff INTERIOR (away from the 4 boundary grid lines).
    // If interior is smooth (~0) the only creases are the grid lines; if there's an interior ridge, we need it too.
    const nc = 60;
    let interiorD2 = 0; let interiorLoc: [number, number] = [0, 0];
    const uLo = 0.12 / strands, uHi = 0.88 / strands; // interior in u (away from the two vertical grid boundaries)
    const tLo = 0.512, tHi = 0.588; // interior in t (away from the two rings v=5,6 at t=0.5,0.6)
    for (let iu = 1; iu < nc; iu++) {
      const uu = uLo + (uHi - uLo) * (iu / nc);
      for (let it = 1; it < nc; it++) {
        const tt = tLo + (tHi - tLo) * (it / nc);
        const du = 0.3 / strands / nc, dt = 0.06 / nc;
        const rC = rA(uu * TAU, tt * H);
        const d2u = Math.abs(rA((uu - du) * TAU, tt * H) - 2 * rC + rA((uu + du) * TAU, tt * H));
        const d2t = Math.abs(rA(uu * TAU, (tt - dt) * H) - 2 * rC + rA(uu * TAU, (tt + dt) * H));
        const d2 = Math.max(d2u, d2t);
        if (d2 > interiorD2) { interiorD2 = d2; interiorLoc = [+uu.toFixed(4), +tt.toFixed(4)]; }
      }
    }

    // (C4) reference crease loci from src
    const loci = basketWeaveCreaseLoci(strands, layers, DEFAULT_BASKET_WEAVE.bwPhase);

    const report = {
      strands, layers,
      c1_boundaryU: +uB.toFixed(6), c1_grooveMinU: +minU.toFixed(6), c1_grooveMinR: +minR.toFixed(5),
      c1_grooveOffsetFromBoundary: +(minU - uB).toFixed(6),
      c2_ringT: tRing, c2_grooveMinT: +minT.toFixed(6), c2_grooveMinR: +minR2.toFixed(5),
      c3_interiorMaxD2: +interiorD2.toFixed(5), c3_interiorLoc: interiorLoc,
      c4_creaseU_count: loci.creaseU.length, c4_creaseU: loci.creaseU.map((x) => +x.toFixed(4)),
      c4_creaseT_count: loci.creaseT.length, c4_creaseT: loci.creaseT.map((x) => +x.toFixed(4)),
    };
    ck('creasemap', report);
    console.log('CREASE MAP:', JSON.stringify(report, null, 1));
    // profiles for eyeballing
    ck('creasemap_profiles', { c1_thetaSweep: c1, c2_tSweep: c2 });
  });
});
