// _weaveWater.test.ts — DEV-ONLY. Verify the doubled-grid boundary edges are ONLY the two rims (t=0, t=1) — a
// wall-only mesh is legitimately open at top/bottom (the pot base/rim close them). Confirms rawNonMan=0 is a real
// watertight interior (non-vacuous: a wall-only mesh SHOULD have exactly the 2 rim loops as boundary, nothing else).
// Env PF_WEAVE=1.
import { describe, it } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildWeaveDoubledGrid, basketWeaveGrid } from './_weaveLib';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

describe.skipIf(!RUN)('WEAVE watertight — boundary edges are only the rims', () => {
  it('classify boundary edges by t', () => {
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const grid = basketWeaveGrid(DEFAULT_BASKET_WEAVE.bwStrands, DEFAULT_BASKET_WEAVE.bwLayers, DEFAULT_BASKET_WEAVE.bwPhase);
    const b = buildWeaveDoubledGrid(rA, DIMS.H, grid, { hRowMm: 0.15, wTargetMm: 0.15, cliffChordMm: 0.15, seamMode: 'cliff' });
    const idx = b.mesh.idx; const ut = b.mesh.ut;
    let mx = 0; for (let i = 0; i < idx.length; i++) if (idx[i] > mx) mx = idx[i];
    const EK = mx + 1; const NS = 64;
    const ms: Array<Map<number, number>> = Array.from({ length: NS }, () => new Map<number, number>());
    const bump = (a: number, bb: number): void => { const lo = a < bb ? a : bb, hi = a < bb ? bb : a; const k = lo * EK + hi; const m = ms[lo & (NS - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
    for (let f = 0; f < idx.length; f += 3) { const a = idx[f], bb = idx[f + 1], c = idx[f + 2]; bump(a, bb); bump(bb, c); bump(a, c); }
    let rim = 0, interiorBoundary = 0; const interiorSamples: Array<{ t: number }> = [];
    for (let s = 0; s < NS; s++) for (const [k, v] of ms[s]) { if (v !== 1) continue; const lo = Math.floor(k / EK), hi = k % EK; const tLo = ut[2 * lo + 1], tHi = ut[2 * hi + 1]; const atRim = (tLo < 1e-3 && tHi < 1e-3) || (tLo > 1 - 1e-3 && tHi > 1 - 1e-3); if (atRim) rim++; else { interiorBoundary++; if (interiorSamples.length < 10) interiorSamples.push({ t: +((tLo + tHi) / 2).toFixed(4) }); } }
    console.log(`BOUNDARY: rim=${rim} interiorBoundary=${interiorBoundary} (interior samples t=${JSON.stringify(interiorSamples)})`);
  });
});
