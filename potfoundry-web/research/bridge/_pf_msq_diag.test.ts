// _pf_msq_diag.test.ts — DEV-ONLY (PF_MSQDIAG=1). Diagnostic: WHERE are the residual M-square slivers?
// Reads the persisted after_mesh.bin + before_mesh.bin, buckets min-angle, and localizes the worst slivers by
// gradU (near-vertical apex) vs off-crest. Answers: is minAngle=0 a FEW apex facets or a broad floor?
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeGothicPatch, liftMesh, type PatchDef } from './_pf_perfectMesherLib';

const TAU = 2 * Math.PI;
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_perfect_gothic_msquare_smoke' : '_pf_perfect_gothic_msquare');

function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const off = buf.length === 8 + nV * 16 + nT * 12 ? 8 : (buf.length === 16 + nV * 16 + nT * 12 ? 16 : -1);
  if (off < 0) return null;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

function minAngleDeg(xyz: Float64Array, a: number, b: number, c: number): number {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2], cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
  if (la < 1e-12 || lb < 1e-12 || lc < 1e-12) return 0;
  const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
  const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
  const C = Math.PI - A - B;
  return Math.min(A, B, C) * 180 / Math.PI;
}

describe('pf-msq-diag: localize the residual M-square slivers', () => {
  it.skipIf(process.env.PF_MSQDIAG !== '1')('bucket min-angle by gradU (apex vs off-crest)', () => {
    const patch: PatchDef = makeGothicPatch(Number(process.env.PF_BAYS ?? 1), Number(process.env.PF_ZBAND ?? 5));
    for (const which of ['after', 'before']) {
      const m = loadBin(join(DIR, `${which}_mesh.bin`));
      if (!m) { /* eslint-disable-next-line no-console */ console.log(`[diag] ${which}_mesh.bin missing`); continue; }
      const xyz = liftMesh(patch, m.uv);
      const nF = m.tris.length / 3;
      const du = 1 / 8192;
      // per-facet minAngle + centroid gradU
      const rows: Array<{ minA: number; gradU: number }> = [];
      for (let f = 0; f < nF; f++) {
        const a = m.tris[3 * f], b = m.tris[3 * f + 1], c = m.tris[3 * f + 2];
        const minA = minAngleDeg(xyz, a, b, c);
        const um = (m.uv[2 * a] + m.uv[2 * b] + m.uv[2 * c]) / 3, tm = (m.uv[2 * a + 1] + m.uv[2 * b + 1] + m.uv[2 * c + 1]) / 3;
        const z = tm * patch.H;
        const gradU = Math.abs(patch.rA(TAU * ((um + du) - Math.floor(um + du)), z) - patch.rA(TAU * ((um - du) - Math.floor(um - du)), z)) / (2 * du * TAU);
        rows.push({ minA, gradU });
      }
      // buckets
      const bel10 = rows.filter((r) => r.minA < 10).length, bel20 = rows.filter((r) => r.minA < 20).length;
      const bel20hi = rows.filter((r) => r.minA < 20 && r.gradU > 100).length; // slivers on the near-vertical flank
      const bel20lo = rows.filter((r) => r.minA < 20 && r.gradU <= 100).length; // slivers on the smooth panel
      // gradU sorted: are the WORST-angle facets the high-gradU (apex) ones?
      const sorted = rows.slice().sort((x, y) => x.minA - y.minA);
      const worst20 = sorted.slice(0, 20);
      const worstMeanGradU = worst20.reduce((s, r) => s + r.gradU, 0) / worst20.length;
      const row = {
        which, nF, pctBelow10: +(100 * bel10 / nF).toFixed(1), pctBelow20: +(100 * bel20 / nF).toFixed(1),
        below20_highGradU: bel20hi, below20_lowGradU: bel20lo,
        worst20meanGradU: +worstMeanGradU.toFixed(1), worst20minA: +worst20[0].minA.toFixed(3),
        fracSliversOnFlank: +(bel20hi / Math.max(1, bel20)).toFixed(3),
      };
      mkdirSync(DIR, { recursive: true });
      writeFileSync(join(DIR, `diag_${which}.json`), JSON.stringify(row, null, 2));
      /* eslint-disable-next-line no-console */
      console.log(`[diag ${which}] ${JSON.stringify(row)}`);
    }
    expect(true).toBe(true);
  }, 10 * 60 * 1000);
});
