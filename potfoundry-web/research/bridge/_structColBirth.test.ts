// _structColBirth.test.ts — DEV-ONLY. E-2026-07-02-STRUCTCOL: diagnose the BIRTH region. Dump the columns of
// the two rows straddling the 4th birth (t~0.8287) + the local key-merge triangulation, and measure the own-sag
// of ONLY the facets near a birth vs the clean bands. Isolates whether the 0.53mm worst is a builder-fan bug
// (bad triangles) or a genuine under-resolved newborn-petal flank (needs local density).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, projectPointToRadialSurface } from './labkit';
import { buildRidgeGraph, rasterizeColumns, buildStructWall, rowExtrema } from './_structColLib';
import { trustedWorstAnalytic } from './_sfbPushLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol');
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

describe('STRUCTCOL BIRTH — diagnose birth-region triangulation', () => {
  it.skipIf(process.env.PF_STRUCTCOL_BIRTH !== '1')('dumps columns + local sag around each birth', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const scanN = 16000; const uToMm = TAU * DIMS.Rt;
    const dthMm = 0.08, tipArcMm = 0.02, nSh = 6;
    // tight rows around each birth to see the peel-off
    const tset = new Set<number>();
    for (let i = 0; i <= 200; i++) tset.add(+(i / 200).toFixed(8));
    for (const tb of BIRTHS) for (let k = -6; k <= 6; k++) tset.add(+Math.max(0, Math.min(1, tb + k * 5e-4)).toFixed(8));
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumns(g, uToMm, dthMm, tipArcMm, nSh);

    // find the two rows straddling the 4th birth
    const tb = BIRTHS[3];
    let below = -1, above = -1;
    for (let r = 0; r + 1 < ts.length; r++) { if (ts[r] < tb && ts[r + 1] >= tb) { below = r; above = r + 1; break; } }
    const summarize = (r: number): { t: number; nCol: number; keys: string[]; uNearSeam: number[] } => {
      const near: number[] = []; const ks: string[] = [];
      for (let k = 0; k < rows[r].u.length; k++) { const u = rows[r].u[k]; if (u < 0.06 || u > 0.94) { near.push(+u.toFixed(4)); ks.push(rows[r].key[k]); } }
      return { t: +ts[r].toFixed(5), nCol: rows[r].u.length, keys: ks, uNearSeam: near };
    };
    const belowInfo = summarize(below), aboveInfo = summarize(above);

    // build full mesh, measure own-sag restricted to facets with t in a birth window vs a clean band.
    const mesh = buildStructWall(rA, DIMS.H, rows);
    const own = perFaceChordSag(mesh.ut, mesh.idx, rA, DIMS.H);
    const idxA = mesh.idx; const ut = mesh.ut; const nF = mesh.nF;
    const faceT = (f: number): number => (ut[2 * idxA[3 * f] + 1] + ut[2 * idxA[3 * f + 1] + 1] + ut[2 * idxA[3 * f + 2] + 1]) / 3;
    const bandStats = (tlo: number, thi: number): { n: number; worst: number; nOver01: number } => {
      let n = 0, worst = 0, o = 0; for (let f = 0; f < nF; f++) { const t = faceT(f); if (t >= tlo && t < thi) { n++; if (own.faceErr[f] > worst) worst = own.faceErr[f]; if (own.faceErr[f] > 0.01) o++; } } return { n, worst: +worst.toFixed(4), nOver01: o };
    };
    const birthBands = BIRTHS.map((b, i) => ({ birth: i, t: b, stat: bandStats(b - 0.005, b + 0.005) }));
    const cleanBand = bandStats(0.15, 0.25);
    // trusted worst on the birth window of the 4th birth
    const xyzF = Float32Array.from(mesh.xyz);
    const tw = trustedWorstAnalytic(ut, xyzF, idxA, own.faceErr, (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 300, 0.01);

    // sanity: extrema at rows straddling birth (raw feature u's)
    const featBelow = rowExtrema(rA, ts[below] * DIMS.H, 1, scanN);
    const featAbove = rowExtrema(rA, ts[above] * DIMS.H, 1, scanN);

    const rec = { birth4_t: tb, belowInfo, aboveInfo, featBelow: featBelow.map((u) => +u.toFixed(4)), featAbove: featAbove.map((u) => +u.toFixed(4)), birthBands, cleanBand, trustedWorstMm: tw.worstMm, trustedNOver01: tw.nOverTol };
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'birth_diag.json'), JSON.stringify(rec, null, 2));
    console.log('BELOW', JSON.stringify(belowInfo));
    console.log('ABOVE', JSON.stringify(aboveInfo));
    console.log('BIRTH BANDS', JSON.stringify(birthBands.map((b) => ({ b: b.birth, worst: b.stat.worst, nOver: b.stat.nOver01, n: b.stat.n }))));
    console.log('CLEAN BAND', JSON.stringify(cleanBand));
    console.log('trustedWorst', tw.worstMm.toFixed(4), 'nOver', tw.nOverTol);
    expect(mesh.nF).toBeGreaterThan(0);
  }, 900_000);
});
