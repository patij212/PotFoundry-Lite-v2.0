// _structColGraph.test.ts — DEV-ONLY. E-2026-07-02-STRUCTCOL: validate the ridge-GRAPH tracker BEFORE any
// mesh build (cheapest discriminator). CONFIRM: 10 crest + 10 valley slots, each a CONTINUOUS chain (small
// per-row u-drift, 0 discontinuities) from its birth row to the top; births at the 4 known transitions at the
// seam. If the graph is discontinuous, the mesh will be too — kill here cheaply.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraph, validateRidgeGraph } from './_structColLib';
import type { StyleDims } from './runStyle';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol');

describe('STRUCTCOL GRAPH — ridge-graph tracker validation', () => {
  it.skipIf(process.env.PF_STRUCTCOL_GRAPH !== '1')('tracks 10+10 continuous ridge chains through births + seam', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const nRows = Number(process.env.PF_STRUCTCOL_ROWS ?? '600');
    const scanN = Number(process.env.PF_STRUCTCOL_SCANN ?? '16000');
    // z-rows: dense at the base (exp-0.86 tip cusp) + at each birth t, else uniform.
    const births = [0.00045, 0.33825, 0.56132, 0.82872];
    const tset = new Set<number>();
    for (let i = 0; i <= nRows; i++) tset.add(+(i / nRows).toFixed(8));
    for (const tb of births) { tset.add(+Math.max(0, tb - 1e-3).toFixed(8)); tset.add(+Math.min(1, tb + 1e-3).toFixed(8)); }
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);

    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const v = validateRidgeGraph(g);
    const rec = {
      style: STYLE, nRows: ts.length, scanN,
      nCrest: v.nCrest, nValley: v.nValley,
      maxDriftU: v.maxDriftU, maxDriftMm: v.maxDriftMm, discontinuities: v.discontinuities,
      births: v.births,
    };
    mkdirSync(ROOT, { recursive: true });
    writeFileSync(join(ROOT, 'graph_validate.json'), JSON.stringify(rec, null, 2));
    console.log(`GRAPH nCrest ${v.nCrest} nValley ${v.nValley} maxDrift ${v.maxDriftMm.toFixed(3)}mm disc ${v.discontinuities}`);
    console.log('BIRTHS', JSON.stringify(v.births.filter((b) => b.t > 1e-4)));
    expect(v.nCrest).toBe(10);
    expect(v.nValley).toBe(10);
    expect(v.discontinuities).toBe(0);
  }, 600_000);
});
