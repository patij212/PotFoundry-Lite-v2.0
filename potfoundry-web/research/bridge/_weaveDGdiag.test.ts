// _weaveDGdiag.test.ts — DEV-ONLY. Diagnose the doubled-grid SLIVER source. Rebuild buildWeaveDoubledGrid and
// classify each low-min-angle triangle by region: cliff-wall (all verts on a cliff col/row), cell-interior, or
// cliff-to-cell TRANSITION. Also report the chord worst location. This tells us whether to fix triangulation or
// sizing. Env PF_WEAVE=1.

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { buildWeaveDoubledGrid, basketWeaveGrid } from './_weaveLib';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

function triMinAngle(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number {
  const ab = Math.hypot(bx - ax, by - ay, bz - az), bc = Math.hypot(cx - bx, cy - by, cz - bz), ca = Math.hypot(ax - cx, ay - cy, az - cz);
  const ang = (o: number, p: number, q: number): number => { const c = (o * o + p * p - q * q) / (2 * o * p); return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI; };
  if (ab < 1e-12 || bc < 1e-12 || ca < 1e-12) return 0;
  return Math.min(ang(ab, ca, bc), ang(ab, bc, ca), ang(bc, ca, ab));
}

describe.skipIf(!RUN)('WEAVE DG diag — sliver region classifier', () => {
  it('classify low-min-angle tris by region + chord worst location', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const strands = DEFAULT_BASKET_WEAVE.bwStrands, layers = DEFAULT_BASKET_WEAVE.bwLayers;
    const grid = basketWeaveGrid(strands, layers, DEFAULT_BASKET_WEAVE.bwPhase);
    const build = buildWeaveDoubledGrid(rA, H, grid, { hRowMm: 0.15, wTargetMm: 0.15, cliffChordMm: 0.15, seamMode: 'cliff' });
    const m = build.mesh; const idx = m.idx; const nF = m.nF; const ut = m.ut; const xyz = m.xyz;
    // a vertex is "on a u-cliff" iff its u is within 1e-4 of a strand boundary m/16; "on a t-cliff" iff t within
    // 1e-4 of a ring k/10. (cliff rungs are placed exactly at the boundary u / ring t.)
    const onUCliff = (u: number): boolean => { for (let mm = 0; mm < strands; mm++) { let d = Math.abs(u - mm / strands); if (d > 0.5) d = 1 - d; if (d < 5e-4) return true; } return Math.abs(u) < 5e-4 || Math.abs(u - 1) < 5e-4; };
    const onTCliff = (t: number): boolean => { for (let k = 1; k < layers; k++) if (Math.abs(t - k / layers) < 5e-4) return true; return false; };
    const buckets: Record<string, { count: number; minA: number }> = {
      cliffWall: { count: 0, minA: 999 }, cellInterior: { count: 0, minA: 999 }, transition: { count: 0, minA: 999 },
    };
    let below10 = 0, below20 = 0, total = 0;
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ma = triMinAngle(xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2], xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2], xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]);
      total++; if (ma < 10) below10++; if (ma < 20) below20++;
      const vs = [a, b, c];
      const uCliffN = vs.filter((v) => onUCliff(ut[2 * v])).length;
      const tCliffN = vs.filter((v) => onTCliff(ut[2 * v + 1])).length;
      let bucket: string;
      if (uCliffN === 3 || tCliffN === 3) bucket = 'cliffWall';
      else if (uCliffN === 0 && tCliffN === 0) bucket = 'cellInterior';
      else bucket = 'transition';
      buckets[bucket].count++; if (ma < buckets[bucket].minA) buckets[bucket].minA = ma;
    }
    // slivers by bucket
    const slivBy: Record<string, number> = { cliffWall: 0, cellInterior: 0, transition: 0 };
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ma = triMinAngle(xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2], xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2], xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]);
      if (ma >= 20) continue;
      const vs = [a, b, c]; const uc = vs.filter((v) => onUCliff(ut[2 * v])).length; const tc = vs.filter((v) => onTCliff(ut[2 * v + 1])).length;
      if (uc === 3 || tc === 3) slivBy.cliffWall++; else if (uc === 0 && tc === 0) slivBy.cellInterior++; else slivBy.transition++;
    }
    ck('dgdiag', { tris: nF, below10, below20, pctBelow20: +(100 * below20 / total).toFixed(2), buckets, sliversBelow20By: slivBy });
    console.log('DG SLIVER REGIONS:', JSON.stringify({ pctBelow20: +(100 * below20 / total).toFixed(2), buckets, sliversBelow20By: slivBy }, null, 1));
  });
});
