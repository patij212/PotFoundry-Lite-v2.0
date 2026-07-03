// _qcolSize.test.ts — DEV-ONLY. E-2026-07-03-STRUCTCOL2 SIZE ESTIMATE. The first M-square build OVERFLOWED
// (Invalid array length): rows-by-max-speed at h=0.15 -> too many verts. This probe COUNTS rows/cols/tris for a
// sweep of h WITHOUT building the mesh (cheap), so we pick an h in the feasible budget (~few-M to ~50M tris) and
// understand the row/col explosion before committing a multi-minute build.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraph } from './_structColLib';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import type { StyleDims } from './runStyle';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol2');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

describe('QCOL SIZE — M-square tri budget vs h (E-STRUCTCOL2)', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('counts rows/cols/tris for an h sweep without building', () => {
    const sub = process.env.PF_QCOL_SUB ?? 'size1';
    const name = `size_${sub}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const hs = (process.env.PF_QCOL_HS ?? '0.5,0.35,0.25,0.18,0.12').split(',').map(Number);
    const wFloorMm = Number(process.env.PF_QCOL_WFLOOR ?? '0.04');
    const wCapMm = Number(process.env.PF_QCOL_WCAP ?? '0.6');
    const out: unknown[] = [];
    for (const h of hs) {
      const hCap = h * Number(process.env.PF_QCOL_CAPMULT ?? '6');
      const ts = msquareRows(rA, DIMS.H, h, BIRTHS, { hRowCapMm: hCap, seamBand: 0.02 });
      const g = buildRidgeGraph(rA, DIMS.H, ts, 8000);
      const rows = rasterizeColumnsSquare(g, rA, DIMS.H, 0.03, 0, wFloorMm, wCapMm);
      let totalCols = 0, maxCols = 0, minCols = 1e9; for (const r of rows) { totalCols += r.u.length; if (r.u.length > maxCols) maxCols = r.u.length; if (r.u.length < minCols) minCols = r.u.length; }
      // tris ~ 2 * (rows-1) * avgCols  (structured strips). verts = totalCols.
      const approxTris = 2 * (rows.length - 1) * (totalCols / rows.length);
      const rec = { h, hCap, rows: ts.length, verts: totalCols, avgCols: +(totalCols / rows.length).toFixed(1), maxCols, minCols, approxTris: Math.round(approxTris) };
      out.push(rec);
      console.log(`SIZE h=${h} | rows ${ts.length} avgCols ${(totalCols / rows.length).toFixed(0)} verts ${(totalCols / 1e6).toFixed(2)}M ~tris ${(approxTris / 1e6).toFixed(1)}M (max/min cols ${maxCols}/${minCols})`);
    }
    ckpt(name, { style: STYLE, wFloorMm, wCapMm, results: out });
    expect(out.length).toBeGreaterThan(0);
  }, 3_600_000);
});
