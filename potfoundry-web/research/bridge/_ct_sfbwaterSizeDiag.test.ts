import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildScaleColMesh, findBirths } from './_scaleColDriver';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import type { StyleId } from '../../src/geometry/types';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 }; const H = 120;
describe('sizeDiag', () => {
  it.skipIf(process.env.PF_CT_SFBWATER !== '1')('committed vs rows', () => {
    const rA = buildRadiusFn('SuperformulaBlossom' as StyleId, {}, DIMS);
    for (const h of [0.3]) {
      const c = buildScaleColMesh(rA, H, { hRowMm: h });
      const births = findBirths(rA, H, 4096);
      const ts = msquareRows(rA, H, h, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: h * 6 });
      const g = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
      const rows = rasterizeColumnsSquare(g, rA, H, 0.03, 2, 0.03, 0.6);
      let mx = 0, mn = 1e9, sum = 0; for (const r of rows) { mx = Math.max(mx, r.u.length); mn = Math.min(mn, r.u.length); sum += r.u.length; }
      console.log(`h=${h} committedTris=${c.mesh.nF} rows=${rows.length} colsMin=${mn} colsMax=${mx} colsMean=${(sum/rows.length).toFixed(0)}`);
    }
    expect(1).toBe(1);
  }, 300000);
});
