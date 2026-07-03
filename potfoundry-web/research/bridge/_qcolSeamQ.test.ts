// _qcolSeamQ.test.ts — DEV-ONLY. E-STRUCTCOL2: split the seam-square %<20 into CLIFF-LADDER cells (touch a ladder
// vertex, ut u==0.5 marker or the r1/r0 endpoints at theta=0 y==0) vs BODY cells. Tells us if the new slivers are
// the ladder (fixable by ladder aspect) or the body. Also aspect of ladder cells (radial span vs row height).
import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraph } from './_structColLib';
import { msquareRows, rasterizeColumnsSquare, buildStructWallSeamSquare } from './_qcolMsquare';
import type { StyleDims } from './runStyle';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];
describe('QCOL SEAM Q', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('splits seam-square slivers into ladder vs body', () => {
    const rA = buildRadiusFn('SuperformulaBlossom', {}, DIMS);
    const h = Number(process.env.PF_QCOL_HROW ?? '0.25');
    const ts = msquareRows(rA, DIMS.H, h, BIRTHS, { hRowCapMm: h * 6, seamBand: 0.02 });
    const g = buildRidgeGraph(rA, DIMS.H, ts, 12000);
    const rows = rasterizeColumnsSquare(g, rA, DIMS.H, 0.03, 0, 0.03, 0.6);
    const mesh = buildStructWallSeamSquare(rA, DIMS.H, rows);
    const idxA = mesh.idx, nF = mesh.nF, xyz = mesh.xyz;
    // a ladder vertex sits at theta=0 => y≈0 AND is NOT on the wall (its x=radius, y=0). Body seam cols are also
    // near y≈0 but on-surface. Distinguish by |y|<1e-6 (ladder verts set y exactly 0).
    const isLadder = (v: number): boolean => Math.abs(xyz[3 * v + 1]) < 1e-9;
    let ladderLt20 = 0, bodyLt20 = 0, ladderN = 0, ladN20 = 0;
    let ladAspSum = 0, ladCnt = 0, ladAspMax = 0;
    const cl = (x: number): number => Math.max(-1, Math.min(1, x));
    const e = (p: number, q: number): number => Math.hypot(xyz[3 * p] - xyz[3 * q], xyz[3 * p + 1] - xyz[3 * q + 1], xyz[3 * p + 2] - xyz[3 * q + 2]);
    for (let f = 0; f < nF; f++) {
      const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
      const A = e(b, c), B = e(c, a), C = e(a, b);
      const aa = Math.acos(cl((B * B + C * C - A * A) / (2 * B * C || 1e-30))); const ab = Math.acos(cl((A * A + C * C - B * B) / (2 * A * C || 1e-30)));
      const mn = Math.min(aa, ab, Math.PI - aa - ab) * 180 / Math.PI;
      const lad = isLadder(a) || isLadder(b) || isLadder(c);
      if (lad) { ladderN++; const lmax = Math.max(A, B, C), lmin = Math.min(A, B, C); const asp = lmax / (lmin || 1e-30); ladAspSum += asp; ladCnt++; if (asp > ladAspMax) ladAspMax = asp; }
      if (mn < 20) { if (lad) { ladderLt20++; ladN20++; } else bodyLt20++; }
    }
    console.log(`SEAMQ h=${h} nF ${nF} | <20 total ${ladderLt20 + bodyLt20} = ladder ${ladderLt20} + body ${bodyLt20} | ladderTris ${ladderN} ladderAspMean ${(ladAspSum / Math.max(1, ladCnt)).toFixed(2)} aspMax ${ladAspMax.toFixed(1)}`);
    expect(nF).toBeGreaterThan(0);
  }, 600_000);
});
