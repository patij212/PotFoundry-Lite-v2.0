// _pf_msq_render.test.ts — DEV-ONLY (PF_MSQRENDER=1). Dump true-3D heatmap + flat-shade of the 1-bay before/after
// meshes so the sliver state is VISIBLE (a metric says 58% <20°; the render shows WHERE).
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dumpHeatmap, dumpRenderBins } from './labkit';
import { makeGothicPatch, liftMesh, type PatchDef } from './_pf_perfectMesherLib';

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

describe('pf-msq-render: visual sliver evidence', () => {
  it.skipIf(process.env.PF_MSQRENDER !== '1')('dump before/after heatmap + flat', () => {
    const patch: PatchDef = makeGothicPatch(Number(process.env.PF_BAYS ?? 1), Number(process.env.PF_ZBAND ?? 5));
    for (const which of ['after', 'before']) {
      const m = loadBin(join(DIR, `${which}_mesh.bin`));
      if (!m) { /* eslint-disable-next-line no-console */ console.log(`[render] ${which}_mesh.bin missing`); continue; }
      const xyz = liftMesh(patch, m.uv);
      const idx = Int32Array.from(m.tris);
      dumpHeatmap(DIR, `msq_${which}_true3d`, xyz, m.uv, idx, patch.rA, patch.H);
      dumpRenderBins(DIR, `msq_${which}_flat`, xyz, idx, { stl: false });
      /* eslint-disable-next-line no-console */
      console.log(`[render] dumped msq_${which}_true3d + msq_${which}_flat (${m.tris.length / 3} tris)`);
    }
    expect(true).toBe(true);
  }, 10 * 60 * 1000);
});
