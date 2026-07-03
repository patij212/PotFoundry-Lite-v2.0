// _weaveDGdiag2.test.ts — DEV-ONLY. Find a DEGENERATE (minA~0) cliff-wall triangle in buildWeaveDoubledGrid and
// print its 3 vertex coords + (u,t) + radius, to see WHY it is degenerate (coincident verts / zero-area). Env PF_WEAVE=1.
import { describe, it } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildWeaveDoubledGrid, basketWeaveGrid } from './_weaveLib';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

function triMinAngle(P: number[][]): number {
  const [a, b, c] = P;
  const L = (p: number[], q: number[]): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const ab = L(a, b), bc = L(b, c), ca = L(c, a);
  const ang = (o: number, p: number, q: number): number => Math.acos(Math.max(-1, Math.min(1, (o * o + p * p - q * q) / (2 * o * p)))) * 180 / Math.PI;
  if (ab < 1e-12 || bc < 1e-12 || ca < 1e-12) return 0;
  return Math.min(ang(ab, ca, bc), ang(ab, bc, ca), ang(bc, ca, ab));
}

describe.skipIf(!RUN)('WEAVE DG diag2 — degenerate cliff triangle', () => {
  it('print a few worst cliff-wall triangles', () => {
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const grid = basketWeaveGrid(DEFAULT_BASKET_WEAVE.bwStrands, DEFAULT_BASKET_WEAVE.bwLayers, DEFAULT_BASKET_WEAVE.bwPhase);
    const build = buildWeaveDoubledGrid(rA, DIMS.H, grid, { hRowMm: 0.3, wTargetMm: 0.3, cliffChordMm: 0.05, seamMode: 'cliff' });
    const m = build.mesh; const idx = m.idx; const nF = m.nF; const ut = m.ut; const xyz = m.xyz;
    const bad: Array<{ f: number; minA: number; verts: unknown[] }> = [];
    for (let f = 0; f < nF && bad.length < 6; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const P = [[xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]], [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]], [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]]];
      const ma = triMinAngle(P);
      if (ma < 0.5) {
        const desc = [a, b, c].map((v) => ({ v, u: +ut[2 * v].toFixed(6), t: +ut[2 * v + 1].toFixed(6), r: +Math.hypot(xyz[3 * v], xyz[3 * v + 1]).toFixed(4), z: +xyz[3 * v + 2].toFixed(4) }));
        bad.push({ f, minA: +ma.toFixed(3), verts: desc });
      }
    }
    console.log('DEGENERATE CLIFF TRIS:', JSON.stringify(bad, null, 1));
  });
});
