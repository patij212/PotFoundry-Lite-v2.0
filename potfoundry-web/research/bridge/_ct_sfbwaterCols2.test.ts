import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { findBirths } from './_scaleColDriver';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import type { StyleId } from '../../src/geometry/types';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 }; const H = 120;
describe('cols2', () => {
  it.skipIf(process.env.PF_CT_SFBWATER !== '1')('any body columns at u~1.0 or u~0?', () => {
    const rA = buildRadiusFn('SuperformulaBlossom' as StyleId, {}, DIMS);
    const h = 0.5; const births = findBirths(rA, H, 4096);
    const ts = msquareRows(rA, H, h, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: h * 6 });
    const g = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
    const rows = rasterizeColumnsSquare(g, rA, H, 0.03, 2, 0.03, 0.6);
    let near1 = 0, near0 = 0, totalRowsWith = 0;
    const ex: string[] = [];
    for (let r = 0; r < rows.length; r++) {
      const u = rows[r].u; let hit = false;
      for (let k = 0; k < u.length; k++) { const uu = ((u[k]%1)+1)%1; if (uu > 0.98) { near1++; hit = true; if (ex.length < 8) ex.push(`t=${rows[r].t.toFixed(3)} u=${uu.toFixed(4)} key=${rows[r].key[k]}`); } if (uu < 0.02) near0++; }
      if (hit) totalRowsWith++;
    }
    console.log(`cols u>0.98: ${near1} | u<0.02: ${near0} | rowsWith(u>0.98)=${totalRowsWith}/${rows.length}`);
    for (const e of ex) console.log('  ' + e);
    expect(1).toBe(1);
  }, 300000);
});
