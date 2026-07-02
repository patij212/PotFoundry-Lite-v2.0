// _structColHot.test.ts — DEV-ONLY. E-2026-07-02-STRUCTCOL: pinpoint the single hottest facet. Build a wall,
// find the max own-radial-sag facet, dump its 3 vertices (u,t,xyz,r) + its neighborhood, + the own vs analytic-
// brute at its centroid. Decides: real spanning/fold facet (bug) vs wrong-azimuth artifact (faithful=radial) vs
// steep-flank under-resolution (density).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, projectPointToRadialSurface } from './labkit';
import { buildRidgeGraph, rasterizeColumns, buildStructWall } from './_structColLib';
import { analyticBruteDist } from './_sfbPushLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol');

describe('STRUCTCOL HOT — pinpoint the hottest facet', () => {
  it.skipIf(process.env.PF_STRUCTCOL_HOT !== '1')('dumps the max-sag facet + classifies it', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const scanN = 16000; const uToMm = TAU * DIMS.Rt;
    const dthMm = Number(process.env.PF_STRUCTCOL_DTH ?? '0.15');
    const nSh = Number(process.env.PF_STRUCTCOL_NSH ?? '4');
    const dz = Number(process.env.PF_STRUCTCOL_DZ ?? '0.5');
    const tset = new Set<number>();
    for (let z = 0; z <= DIMS.H + 1e-9; z += dz) tset.add(+(Math.min(DIMS.H, z) / DIMS.H).toFixed(8));
    for (const tb of [0.00045, 0.33825, 0.56132, 0.82872]) { tset.add(+Math.max(0, tb - 3e-4).toFixed(8)); tset.add(+Math.min(1, tb + 3e-4).toFixed(8)); }
    tset.add(1);
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumns(g, uToMm, dthMm, 0.02, nSh, rA, DIMS.H);
    const mesh = buildStructWall(rA, DIMS.H, rows);
    const own = perFaceChordSag(mesh.ut, mesh.idx, rA, DIMS.H);
    const idxA = mesh.idx, ut = mesh.ut, xyz = mesh.xyz, nF = mesh.nF;
    // hottest by own radial
    let hf = -1, hv = -1;
    for (let f = 0; f < nF; f++) if (own.faceErr[f] > hv) { hv = own.faceErr[f]; hf = f; }
    const vinfo = (v: number): object => ({ u: +ut[2 * v].toFixed(6), t: +ut[2 * v + 1].toFixed(6), x: +xyz[3 * v].toFixed(4), y: +xyz[3 * v + 1].toFixed(4), z: +xyz[3 * v + 2].toFixed(4), r: +Math.hypot(xyz[3 * v], xyz[3 * v + 1]).toFixed(4) });
    const va = idxA[3 * hf], vb = idxA[3 * hf + 1], vc = idxA[3 * hf + 2];
    // centroid own vs GN vs brute
    const cx = (xyz[3 * va] + xyz[3 * vb] + xyz[3 * vc]) / 3, cy = (xyz[3 * va + 1] + xyz[3 * vb + 1] + xyz[3 * vc + 1]) / 3, cz = (xyz[3 * va + 2] + xyz[3 * vb + 2] + xyz[3 * vc + 2]) / 3;
    const gn = projectPointToRadialSurface(cx, cy, cz, rA).dist;
    const br = analyticBruteDist(cx, cy, cz, rA, DIMS.H);
    // radial-own at centroid: nearest r at the centroid's own (u,t)
    const cu = Math.atan2(cy, cx); const cth = cu < 0 ? cu + TAU : cu;
    const ownR = rA(cth, cz); const ownDist = Math.abs(Math.hypot(cx, cy) - ownR);
    // top-10 hottest facet t/u
    const order = Array.from({ length: nF }, (_, f) => f).sort((a, b) => own.faceErr[b] - own.faceErr[a]).slice(0, 10);
    const top = order.map((f) => ({ sag: +own.faceErr[f].toFixed(4), t: +((ut[2 * idxA[3 * f] + 1] + ut[2 * idxA[3 * f + 1] + 1] + ut[2 * idxA[3 * f + 2] + 1]) / 3).toFixed(4) }));
    const rec = { tris: nF, hottestFace: hf, hottestSagRadial: +hv.toFixed(4), verts: [vinfo(va), vinfo(vb), vinfo(vc)], centroid: { ownRadialDist: +ownDist.toFixed(4), gn: +gn.toFixed(4), analyticBrute: +br.toFixed(4) }, top10: top };
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'hot_diag.json'), JSON.stringify(rec, null, 2));
    console.log('HOTTEST sag', hv.toFixed(4), 'verts', JSON.stringify([vinfo(va), vinfo(vb), vinfo(vc)]));
    console.log('centroid ownRadial', ownDist.toFixed(4), 'GN', gn.toFixed(4), 'brute', br.toFixed(4));
    console.log('TOP10', JSON.stringify(top));
    expect(nF).toBeGreaterThan(0);
  }, 900_000);
});
