// _cu_dslip_max.test.ts — DEV-ONLY. Isolated. Localize the density-INVARIANT sheet-chord max=1.27mm.
// The radial-chord sweep showed sheetChordP99 is density-responsive (→0.004) BUT max=1.27137 is PINNED across
// all densities. This probe finds the worst sheet facets and reports their (θ,z, θ-span, scale-θ-boundary
// proximity) to classify: (a) a scale-θ-crease STRADDLE (radial ruler overstates an azimuthal C0 crease — a
// serration/conforming matter, NOT a z-density matter), or (b) a real facet defect. Uses the z80 mesh.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_cu_dslip');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'max.log'), `${new Date().toISOString()} ${m}\n`); console.log(m); };
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

describe('CU-DSLIP-MAX', () => {
  it.skipIf(process.env.PF_CU_DSLIP_MAX !== '1')('localize the pinned 1.27mm sheet-chord max', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    const rows = buildRows(rA, rings, 1800, 80);
    const mesh = buildStructuredWall(rA, H, rows);
    const ro = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) ro[v] = r;
    const { xyz, idx } = mesh;
    // scale-θ-boundary loci: scalePhase=(theta+stagger)*16 % TAU; crease at scaleLocal=0 i.e. theta*16 ≡ 0 (or stagger).
    const scalesPerRow = 16;
    const err: number[] = []; const meta: { e: number; z: number; thspan: number; dCrease: number; kinds: string }[] = [];
    for (let f = 0; f < mesh.nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ka = rows[ro[a]].kind, kb = rows[ro[b]].kind, kc = rows[ro[c]].kind;
      if ([ka, kb, kc].some(k => k === 'ringBelow' || k === 'ringAbove' || k === 'tread')) continue;
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      let mx = 0;
      for (const [w0, w1, w2] of BARY) { const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz; const th = Math.atan2(py, px); const rTrue = rA(th < 0 ? th + TAU : th, pz); const d = Math.hypot(px - rTrue * Math.cos(th), py - rTrue * Math.sin(th)); if (d > mx) mx = d; }
      err.push(mx);
      // θ of the 3 verts and θ-span
      const tha = Math.atan2(ay, ax), thb = Math.atan2(by, bx), thc = Math.atan2(cy, cx);
      const norm = (t: number): number => t < 0 ? t + TAU : t;
      const t3 = [norm(tha), norm(thb), norm(thc)];
      const thspan = Math.max(...t3) - Math.min(...t3);
      const zc = (az + bz + cz) / 3;
      // distance to nearest scale-θ-crease (period TAU/scalesPerRow); stagger depends on row parity of z.
      const row = Math.floor((zc / H) * 8); const stagger = (row % 2 === 1) ? 0.5 * TAU / scalesPerRow : 0;
      const thc0 = norm(tha + stagger); const period = TAU / scalesPerRow; const loc = (thc0 % period) / period; const dCrease = Math.min(loc, 1 - loc);
      meta.push({ e: mx, z: zc, thspan, dCrease, kinds: `${ka[0]}${kb[0]}${kc[0]}` });
    }
    const order = meta.map((_, i) => i).sort((i, j) => meta[j].e - meta[i].e);
    plog(`sheet facets=${err.length}`);
    plog('WORST-15 sheet facets (e, z, thspan(rad), dCreaseFrac, kinds):');
    for (let i = 0; i < 15; i++) { const m = meta[order[i]]; plog(`  e=${m.e.toFixed(4)} z=${m.z.toFixed(3)} thspan=${m.thspan.toExponential(2)} dCrease=${m.dCrease.toFixed(4)} k=${m.kinds}`); }
    // how many sheet facets over 0.01, 0.05, 0.1?
    let o01 = 0, o05 = 0, o1 = 0; for (const e of err) { if (e > 0.01) o01++; if (e > 0.05) o05++; if (e > 0.1) o1++; }
    plog(`sheet over: >0.01=${o01} >0.05=${o05} >0.1=${o1} (of ${err.length})`);
    expect(true).toBe(true);
  }, 300_000);
});
