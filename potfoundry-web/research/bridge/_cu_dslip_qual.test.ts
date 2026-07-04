// _cu_dslip_qual.test.ts — DEV-ONLY. Isolated. FAST quality (%<20) localization (no BVH). The final_lean recipe
// reached true-3D 0.0045 + serration 9.96e-4 + rawNM 0 but %<20=11.4 (just over 10). Classify WHICH facets are
// the slivers (sheet vs tread vs ring) and test whether square-tread sizing / dropping the fine near-lip band /
// tuning treadSub drives %<20 <10 while holding the sheet density that gives true-3D ≤0.01. Milliseconds/config.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, triangleQualityDistribution } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_cu_dslip');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'qual.log'), `${new Date().toISOString()} ${m}\n`); console.log(m); };
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }
function buildRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number, opts: { lipRows?: number; lipBandMm?: number; treadCap?: number }): RowSpec[] {
  const zEps = 5e-4; const lipRows = opts.lipRows ?? 4, lipBand = opts.lipBandMm ?? 0.6; const treadCap = opts.treadCap ?? 24;
  const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    for (let i = lipRows; i >= 1; i--) { const z = ring.z - lipBand * (i / (lipRows + 1)); if (z > cursor + 1e-6) rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arc = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(treadCap, Math.round(span / Math.max(arc, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    for (let i = 1; i <= lipRows; i++) { const z = ring.z + lipBand * (i / (lipRows + 1)); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband); rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}
function minAng(mesh: BuiltMesh, f: number): number {
  const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
  const ax = mesh.xyz[3 * a], ay = mesh.xyz[3 * a + 1], az = mesh.xyz[3 * a + 2], bx = mesh.xyz[3 * b], by = mesh.xyz[3 * b + 1], bz = mesh.xyz[3 * b + 2], cx = mesh.xyz[3 * c], cy = mesh.xyz[3 * c + 1], cz = mesh.xyz[3 * c + 2];
  const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
  if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
  const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
  const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
  return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
}

describe('CU-DSLIP-QUAL', () => {
  it.skipIf(process.env.PF_CU_DSLIP_QUAL !== '1')('localize slivers + tune to %<20<10 (fast)', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    // baseline final_lean; then variants that attack the tread sliver source
    const cfgs: { name: string; nTh: number; nZ: number; lipRows: number; treadCap: number }[] = [
      { name: 'lean_base', nTh: 2100, nZ: 50, lipRows: 4, treadCap: 24 },
      { name: 'lean_noLipBand', nTh: 2100, nZ: 50, lipRows: 0, treadCap: 24 },
      { name: 'lean_treadCap6', nTh: 2100, nZ: 50, lipRows: 0, treadCap: 6 },
      { name: 'lean_treadCap4', nTh: 2100, nZ: 50, lipRows: 0, treadCap: 4 },
      { name: 'lean_z70_tc4', nTh: 2100, nZ: 70, lipRows: 0, treadCap: 4 },
      { name: 'hd_z80_tc4', nTh: 2400, nZ: 80, lipRows: 0, treadCap: 4 },
    ];
    for (const cfg of cfgs) {
      const rows = buildRows(rA, rings, cfg.nTh, cfg.nZ, { lipRows: cfg.lipRows, treadCap: cfg.treadCap });
      const mesh = buildStructuredWall(rA, H, rows);
      const ro = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) ro[v] = r;
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      // partition slivers (<20deg) by whether facet touches a tread/ring row
      let sTread = 0, sSheet = 0, tot = 0;
      for (let f = 0; f < mesh.nF; f++) { if (minAng(mesh, f) < 20) { const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2]; const isLip = [a, b, c].some(v => { const k = rows[ro[v]].kind; return k === 'ringBelow' || k === 'ringAbove' || k === 'tread'; }); if (isLip) sTread++; else sSheet++; tot++; } }
      plog(`${cfg.name} tris=${mesh.nF} %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)} slivers: tread=${sTread} sheet=${sSheet} (tread%=${(100 * sTread / Math.max(1, tot)).toFixed(0)})`);
    }
    expect(true).toBe(true);
  }, 300_000);
});
