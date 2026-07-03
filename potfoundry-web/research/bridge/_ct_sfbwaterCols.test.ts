import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { findBirths } from './_scaleColDriver';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import type { StyleId } from '../../src/geometry/types';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 }; const H = 120;
describe('cols', () => {
  it.skipIf(process.env.PF_CT_SFBWATER !== '1')('seam-adjacent body columns', () => {
    const rA = buildRadiusFn('SuperformulaBlossom' as StyleId, {}, DIMS);
    const h = 0.5; const births = findBirths(rA, H, 4096);
    const ts = msquareRows(rA, H, h, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: h * 6 });
    const g = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
    const rows = rasterizeColumnsSquare(g, rA, H, 0.03, 2, 0.03, 0.6);
    // find a row NEAR t=0.9 (a birth region) and a normal row
    for (const targetT of [0.1, 0.34, 0.56, 0.83, 0.9]) {
      let ri = 0; for (let r = 0; r < rows.length; r++) if (Math.abs(rows[r].t - targetT) < Math.abs(rows[ri].t - targetT)) ri = r;
      const u = rows[ri].u; const k = rows[ri].key; const n = u.length;
      const head = [], tail = [];
      for (let i = 0; i < 3; i++) head.push(`${(((u[i]%1)+1)%1).toFixed(4)}:${k[i]}`);
      for (let i = n - 3; i < n; i++) tail.push(`${(((u[i]%1)+1)%1).toFixed(4)}:${k[i]}`);
      console.log(`t=${rows[ri].t.toFixed(3)} nCols=${n} FIRST3=[${head.join(' ')}] LAST3=[${tail.join(' ')}]`);
    }
    expect(1).toBe(1);
  }, 300000);
});
