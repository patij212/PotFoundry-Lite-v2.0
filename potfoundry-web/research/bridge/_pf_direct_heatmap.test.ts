// _pf_direct_heatmap.test.ts — DEV-ONLY (PF_HEAT=1). Dump a true-3D heatmap of the persisted direct-strip mesh.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dumpHeatmap } from './labkit';
import { makeGothicPatch, liftMesh } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path); const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const uv: number[] = new Array(nV * 2), tris: number[] = new Array(nT * 3);
  let o = 8; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

describe('direct-heatmap', () => {
  it.skipIf(process.env.PF_HEAT !== '1')('true3d heatmap', () => {
    const style = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
    const patch = style === 'geostar' ? makeGeoStarPatch(Number(process.env.PF_BAYS ?? 2), Number(process.env.PF_ZBAND ?? 8)) : makeGothicPatch(Number(process.env.PF_BAYS ?? 2), Number(process.env.PF_ZBAND ?? 8));
    const dir = join(process.cwd(), 'research', 'exchange', `_pf_creststrip_direct_${style}`);
    const bin = loadBin(join(dir, 'direct_mesh.bin'));
    if (!bin) { /* eslint-disable-next-line no-console */ console.log('no mesh'); expect(false).toBe(false); return; }
    const xyz = liftMesh(patch, bin.uv);
    dumpHeatmap(dir, `${style}_direct_true3d`, xyz, bin.uv, Int32Array.from(bin.tris), patch.rA, patch.H);
    /* eslint-disable-next-line no-console */
    console.log(`[heat ${style}] wrote ${style}_direct_true3d in ${dir}`);
    expect(true).toBe(true);
  }, 1800000);
});
