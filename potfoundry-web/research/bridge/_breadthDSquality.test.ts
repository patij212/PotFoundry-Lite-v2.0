// _breadthDSquality.test.ts — DEV-ONLY (PF_BREADTH_DSQ=1). DragonScales minAngle 0.1° / %<20=29% — WHERE are the
// slivers? Hypothesis: the constant-z tread SUB-RINGS (thin radial strips) + ring merge-strips, exactly the sliver
// class ArtDeco fixed by sizing tread sub-rings ~square. Measure minAngle & %<20 for SHEET-only facets (exclude
// tread/ring rows) vs the whole mesh: if sheet-only is clean, the quality gap is TREAD tessellation (tunable), not
// the sheet. Uses the same DragonScales tread-conforming builder as _breadth.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_diag');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

function dragonRings(H: number): Array<{ z: number }> { const r = []; for (let k = 1; k < 8; k++) r.push({ z: (k / 8) * H }); return r; }
function minAng(mesh: BuiltMesh, f: number): number {
  const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
  const ax = mesh.xyz[3 * a], ay = mesh.xyz[3 * a + 1], az = mesh.xyz[3 * a + 2];
  const bx = mesh.xyz[3 * b], by = mesh.xyz[3 * b + 1], bz = mesh.xyz[3 * b + 2];
  const cx = mesh.xyz[3 * c], cy = mesh.xyz[3 * c + 1], cz = mesh.xyz[3 * c + 2];
  const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
  if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
  const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
  const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
  return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
}

describe('BREADTH-DS-QUALITY', () => {
  it.skipIf(process.env.PF_BREADTH_DSQ !== '1')('DragonScales: are the slivers on the tread rows (tunable) or the sheet?', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings(DIMS.H);
    const zEps = 5e-4, nTh = 1440, nZband = 30, treadSub = 9;
    const rows: RowSpec[] = [];
    const th = (): Float64Array => evenThetas(nTh);
    const pushSheet = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
    rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' });
    let cursor = 0;
    for (const ring of rings) { pushSheet(cursor, ring.z, nZband); const rzIn = ring.z - zEps, rzOut = ring.z + zEps; rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' }); for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } }); rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' }); cursor = ring.z; }
    pushSheet(cursor, DIMS.H, nZband); rows.push({ z: DIMS.H, rz: DIMS.H - zEps, thetas: th(), kind: 'sheet' });
    const mesh = buildStructuredWall(rA, DIMS.H, rows);
    const rowOf = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;

    let allMin = 180, sheetMin = 180, allBelow20 = 0, sheetBelow20 = 0, sheetN = 0, treadBelow20 = 0, treadN = 0;
    for (let f = 0; f < mesh.nF; f++) {
      const ang = minAng(mesh, f);
      if (ang < allMin) allMin = ang; if (ang < 20) allBelow20++;
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const kinds = [rows[rowOf[a]].kind, rows[rowOf[b]].kind, rows[rowOf[c]].kind];
      const touchesTreadRing = kinds.some(k => k === 'tread' || k === 'ringBelow' || k === 'ringAbove');
      if (touchesTreadRing) { treadN++; if (ang < 20) treadBelow20++; }
      else { sheetN++; if (ang < sheetMin) sheetMin = ang; if (ang < 20) sheetBelow20++; }
    }
    const rec = { tris: mesh.nF, allMinAngle: allMin, allPctBelow20: 100 * allBelow20 / mesh.nF,
      sheetMinAngle: sheetMin, sheetPctBelow20: 100 * sheetBelow20 / sheetN, sheetN,
      treadPctBelow20: 100 * treadBelow20 / treadN, treadN };
    save('ds_quality_split', rec);
    // eslint-disable-next-line no-console
    console.log(`[dsq] ALL minAng=${allMin.toFixed(2)} %<20=${rec.allPctBelow20.toFixed(1)} | SHEET minAng=${sheetMin.toFixed(2)} %<20=${rec.sheetPctBelow20.toFixed(1)} (n=${sheetN}) | TREAD/RING %<20=${rec.treadPctBelow20.toFixed(1)} (n=${treadN})`);
  }, 600_000);
});
