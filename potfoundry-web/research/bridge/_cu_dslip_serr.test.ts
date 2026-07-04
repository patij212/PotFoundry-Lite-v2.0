// _cu_dslip_serr.test.ts — DEV-ONLY. Isolated. FAST serration-vs-nTh scan (no BVH). Serration = lip feature-edge
// curve → its own mesh-edge-chain distance (crest must be a mesh edge). Depends only on θ-density (nTh), not z.
// z30 gave serP99=1.35e-3 at nTh=1800; find the minimum nTh that crosses ≤0.001 so the winning recipe hits the bar.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_cu_dslip');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'serr.log'), `${new Date().toISOString()} ${m}\n`); console.log(m); };
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
function segPtDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}
function lipSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): { p99: number; max: number } {
  const vals: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 4; s++) {
      const th = TAU * (s / (n * 4)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      const c0 = Math.floor((th / TAU) * n); let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn; const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      vals.push(best);
    }
  }
  vals.sort((a, b) => a - b);
  return { p99: vals[Math.floor(0.99 * vals.length)], max: vals[vals.length - 1] };
}

describe('CU-DSLIP-SERR', () => {
  it.skipIf(process.env.PF_CU_DSLIP_SERR !== '1')('serration vs nTh (fast, no BVH)', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    for (const nTh of [1800, 2100, 2400, 2700, 3000]) {
      const rows = buildRows(rA, rings, nTh, 50);
      const mesh = buildStructuredWall(rA, H, rows);
      const s = lipSerration(rA, mesh, rows);
      plog(`nTh=${nTh} tris=${mesh.nF} serP99=${s.p99.toExponential(3)} serMax=${s.max.toExponential(3)} reaches=${s.p99 <= 0.001}`);
    }
    expect(true).toBe(true);
  }, 300_000);
});
