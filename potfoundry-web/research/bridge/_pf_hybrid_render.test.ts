// _pf_hybrid_render.test.ts — DEV-ONLY (PF_HYRENDER=1). Load the persisted hybrid mesh (clean direct strip +
// localized red-green apex refine) and dump a true-3D perpendicular heatmap for visual confirmation that the whole
// patch is GREEN (fidelity) while the flank stays structured. PF_STYLE=gothic|geostar. No src/ edit.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMeshUt, dumpHeatmap } from './labkit';
import { makeGothicPatch } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

const STYLE = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', `_pf_hybrid_apex_${STYLE}${SMOKE ? '_smoke' : ''}`);
const MESHBIN = join(DIR, 'hybrid_mesh.bin');

describe('hybrid-render', () => {
  it.skipIf(process.env.PF_HYRENDER !== '1')('true-3d heatmap of the hybrid mesh', () => {
    if (!existsSync(MESHBIN)) { /* eslint-disable-next-line no-console */ console.log('no mesh'); expect(true).toBe(true); return; }
    const buf = readFileSync(MESHBIN);
    const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
    const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
    let o = 8; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; } // 8-byte header (this probe's persistMesh)
    for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
    const BAYS = Number(process.env.PF_BAYS ?? 1);
    const ZBAND = Number(process.env.PF_ZBAND ?? 4);
    const patch = STYLE === 'geostar' ? makeGeoStarPatch(BAYS, ZBAND) : makeGothicPatch(BAYS, ZBAND);
    const { rA, H } = patch;
    const idx = Int32Array.from(tris);
    const m = buildMeshUt(uv, idx, rA, H);
    dumpHeatmap(DIR, `hybrid_${STYLE}_true3d`, m.xyz, uv, idx, rA, H);
    /* eslint-disable-next-line no-console */
    console.log(`dumped heatmap: nV=${nV} nT=${nT} dir=${DIR}`);
    expect(nT).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
