// _qcolSeamDbg.test.ts — DEV-ONLY. E-STRUCTCOL2 tiny debug: print the rasterizer's first/last column u per row
// (to understand the seam flank gap size that exploded addSeamColumns to 9M tris) + the seam flank arc.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraph } from './_structColLib';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import type { StyleDims } from './runStyle';
const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
describe('QCOL SEAM DBG', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('prints seam flank geometry', () => {
    const rA = buildRadiusFn('SuperformulaBlossom', {}, DIMS);
    const ts = msquareRows(rA, DIMS.H, 0.25, [0.00045, 0.33825, 0.56132, 0.82872], { hRowCapMm: 1.5, seamBand: 0.02 });
    const g = buildRidgeGraph(rA, DIMS.H, ts, 8000);
    const rows = rasterizeColumnsSquare(g, rA, DIMS.H, 0.03, 0, 0.03, 0.6);
    const flank3d = (z: number, uA: number, uB: number): number => { let L = 0, px = 0, py = 0; for (let i = 0; i <= 16; i++) { const u = uA + (uB - uA) * i / 16; const rr = rA(u * TAU, z); const x = rr * Math.cos(u * TAU), y = rr * Math.sin(u * TAU); if (i > 0) L += Math.hypot(x - px, y - py); px = x; py = y; } return L; };
    for (const ri of [0, 100, 400, 800, rows.length - 1]) {
      const r = rows[ri]; const z = r.t * DIMS.H; const n = r.u.length;
      const c0 = ((r.u[0] % 1) + 1) % 1; const last = ((r.u[n - 1] % 1) + 1) % 1;
      console.log(`row ${ri} t=${r.t.toFixed(3)} ncols=${n} col0U=${c0.toFixed(4)} lastU=${last.toFixed(4)} | flank[0..col0]=${flank3d(z, 0, c0).toFixed(2)}mm flank[last..1]=${flank3d(z, last, 1).toFixed(2)}mm | r0=${rA(0, z).toFixed(2)} r1=${rA((1 - 1e-9) * TAU, z).toFixed(2)} step=${Math.abs(rA(0, z) - rA((1 - 1e-9) * TAU, z)).toFixed(2)}`);
    }
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);
});
