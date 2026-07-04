// _cu_dslip_topbvh.test.ts — DEV-ONLY. Isolated. Settle whether the pinned 1.27mm sheet-chord max (all at
// z≈119.94, top rim band) is a RADIAL-RULER ARTIFACT (true nearest is on an adjacent facet → BVH small) or a
// REAL chord gap (BVH large). BVH-measures ONLY the top-band sheet facets (z>118) against the fine closed-object
// reference — fast because it is a tiny subset. If BVH ≪ radial for these facets ⇒ radial artifact at the rim.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_cu_dslip');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'topbvh.log'), `${new Date().toISOString()} ${m}\n`); console.log(m); };
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }
function buildRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number): RowSpec[] {
  const zEps = 5e-4; const lipRows = 4, lipBand = 0.6;
  const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    for (let i = lipRows; i >= 1; i--) { const z = ring.z - lipBand * (i / (lipRows + 1)); if (z > cursor + 1e-6) rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arc = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(24, Math.round(span / Math.max(arc, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    for (let i = 1; i <= lipRows; i++) { const z = ring.z + lipBand * (i / (lipRows + 1)); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

describe('CU-DSLIP-TOPBVH', () => {
  it.skipIf(process.env.PF_CU_DSLIP_TOPBVH !== '1')('BVH vs radial on the top-rim sheet facets', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    const t0 = Date.now();
    // Fine ref WITH extra top-band z-rows so the reference itself resolves the top rim (nZperBand 48).
    const ref = buildStepReference(rA, H, rings, { nTheta: 3840, nZperBand: 48, zEps: 5e-4 });
    const loc = buildRefLocator(ref, 2.0);
    plog(`ref nF=${ref.nF} (${Date.now() - t0}ms)`);
    const rows = buildRows(rA, rings, 1800, 80);
    const mesh = buildStructuredWall(rA, H, rows);
    const ro = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) ro[v] = r;
    const { xyz, idx } = mesh;
    let bvhMax = 0, radMax = 0, n = 0; const bvhVals: number[] = [];
    for (let f = 0; f < mesh.nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ka = rows[ro[a]].kind, kb = rows[ro[b]].kind, kc = rows[ro[c]].kind;
      if ([ka, kb, kc].some(k => k === 'ringBelow' || k === 'ringAbove' || k === 'tread')) continue;
      const az = xyz[3 * a + 2], bz = xyz[3 * b + 2], cz = xyz[3 * c + 2]; const zc = (az + bz + cz) / 3;
      if (zc < 118) continue; // top band only
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], bx = xyz[3 * b], by = xyz[3 * b + 1], cx = xyz[3 * c], cy = xyz[3 * c + 1];
      let bvh = 0, rad = 0;
      for (const [w0, w1, w2] of BARY) {
        const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
        const db = loc.dist(px, py, pz); if (db > bvh) bvh = db;
        const th = Math.atan2(py, px); const rTrue = rA(th < 0 ? th + TAU : th, pz); const dr = Math.hypot(px - rTrue * Math.cos(th), py - rTrue * Math.sin(th)); if (dr > rad) rad = dr;
      }
      bvhVals.push(bvh); if (bvh > bvhMax) bvhMax = bvh; if (rad > radMax) radMax = rad; n++;
    }
    bvhVals.sort((x, y) => x - y);
    const bvhP99 = bvhVals[Math.floor(0.99 * bvhVals.length)];
    let bo01 = 0; for (const v of bvhVals) if (v > 0.01) bo01++;
    plog(`TOP-BAND (z>118) sheet facets=${n}: BVH max=${bvhMax.toFixed(5)} p99=${bvhP99.toFixed(5)} over0.01=${bo01} | RADIAL max=${radMax.toFixed(5)}`);
    plog(bvhMax < 0.05 && radMax > 0.5 ? 'VERDICT: 1.27mm radial = RIM ARTIFACT (BVH tiny)' : 'VERDICT: real gap or mixed');
    expect(true).toBe(true);
  }, 600_000);
});
