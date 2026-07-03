// _qcolNmLoc.test.ts — DEV-ONLY. E-STRUCTCOL2: locate the 54 non-manifold edges in buildStructWallSeamSquare.
// Hypothesis: they're at the BIRTH rows (birth at u~1.0 = the straddle, colliding with the cliff insertion). If
// so, special-case births to fall back to the wrap quad there. Prints the (u,t) of each non-manifold edge.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraph } from './_structColLib';
import { msquareRows, rasterizeColumnsSquare, buildStructWallSeamSquare } from './_qcolMsquare';
import type { StyleDims } from './runStyle';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];
describe('QCOL NM LOC', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('locates non-manifold edges of the seam-square builder', () => {
    const rA = buildRadiusFn('SuperformulaBlossom', {}, DIMS);
    const h = Number(process.env.PF_QCOL_HROW ?? '0.35'); // coarse for speed
    const ts = msquareRows(rA, DIMS.H, h, BIRTHS, { hRowCapMm: h * 6, seamBand: 0.02 });
    const g = buildRidgeGraph(rA, DIMS.H, ts, 8000);
    const rows = rasterizeColumnsSquare(g, rA, DIMS.H, 0.03, 0, 0.03, 0.6);
    const mesh = buildStructWallSeamSquare(rA, DIMS.H, rows);
    const idxA = mesh.idx, ut = mesh.ut;
    // count edge multiplicity
    const emap = new Map<number, number>(); const EK = mesh.nV + 1;
    for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; for (const [x, y] of [[a, b], [b, c], [a, c]] as [number, number][]) { const lo = Math.min(x, y), hi = Math.max(x, y); const k = lo * EK + hi; emap.set(k, (emap.get(k) ?? 0) + 1); } }
    const nm: Array<{ u: number; t: number; mult: number; nearBirth: boolean }> = [];
    for (const [k, m] of emap) { if (m > 2) { const lo = Math.floor(k / EK); const t = ut[2 * lo + 1]; const u = ut[2 * lo]; nm.push({ u: +u.toFixed(4), t: +t.toFixed(4), mult: m, nearBirth: BIRTHS.some((bb) => Math.abs(t - bb) < 0.02) }); } }
    const births = nm.filter((x) => x.nearBirth).length;
    console.log(`NMLOC nonMan edges ${nm.length} | nearBirth ${births} other ${nm.length - births}`);
    for (const x of nm.slice(0, 20)) console.log('  ', x);
    expect(mesh.nF).toBeGreaterThan(0);
  }, 600_000);
});
