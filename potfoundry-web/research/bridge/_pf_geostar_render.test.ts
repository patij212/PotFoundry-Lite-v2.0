// _pf_geostar_render.test.ts — DEV-ONLY (PF_GSRENDER=1). Load the persisted GeoStar brute-refined mesh and dump a
// true-3D heatmap for visual confirmation of the E-2026-07-05 perfect-mesher-geostar finding. No src/ edit.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMeshUt, dumpHeatmap } from './labkit';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

const DIR = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_brute');
const MESHBIN = join(DIR, 'refined_mesh.bin');

describe('geostar-render', () => {
  it.skipIf(process.env.PF_GSRENDER !== '1')('true-3d heatmap of the refined mesh', () => {
    if (!existsSync(MESHBIN)) { /* eslint-disable-next-line no-console */ console.log('no mesh'); expect(true).toBe(true); return; }
    const buf = readFileSync(MESHBIN);
    const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
    const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
    let o = 16; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
    for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
    const patch = makeGeoStarPatch(Number(process.env.PF_BAYS ?? 5), Number(process.env.PF_ZBAND ?? 10), Number(process.env.PF_TCENTER ?? 0.08));
    const { rA, H } = patch;
    const idx = Int32Array.from(tris);
    const m = buildMeshUt(uv, idx, rA, H);
    dumpHeatmap(DIR, 'geostar_true3d', m.xyz, uv, idx, rA, H);
    /* eslint-disable-next-line no-console */
    console.log(`dumped heatmap: nV=${nV} nT=${nT}`);
    expect(nT).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
