// _pf_wholemesh_render.test.ts — DEV-ONLY (PF_WMRENDER=1). Load the persisted whole-mesh-converged Gothic mesh and
// dump a true-3D perpendicular heatmap for visual confirmation of the GATE-1 (E-2026-07-05-WHOLEMESH) finding: the
// whole mesh is GREEN under the honest true-3D ruler (wholeMeshOutliers=0). No src/ edit.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMeshUt, dumpHeatmap } from './labkit';
import { makeGothicPatch } from './_pf_perfectMesherLib';

const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_perfect_gothic_wholemesh_smoke' : '_pf_perfect_gothic_wholemesh');
const MESHBIN = join(DIR, 'refined_mesh.bin');

describe('wholemesh-render', () => {
  it.skipIf(process.env.PF_WMRENDER !== '1')('true-3d heatmap of the whole-mesh-converged Gothic mesh', () => {
    if (!existsSync(MESHBIN)) { /* eslint-disable-next-line no-console */ console.log('no mesh'); expect(true).toBe(true); return; }
    const buf = readFileSync(MESHBIN);
    const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
    const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
    let o = 16; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
    for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
    const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 2 : 2));
    const ZBAND = Number(process.env.PF_ZBAND ?? (SMOKE ? 6 : 8));
    const patch = makeGothicPatch(BAYS, ZBAND);
    const { rA, H } = patch;
    const idx = Int32Array.from(tris);
    const m = buildMeshUt(uv, idx, rA, H);
    dumpHeatmap(DIR, 'gothic_wholemesh_true3d', m.xyz, uv, idx, rA, H);
    /* eslint-disable-next-line no-console */
    console.log(`dumped heatmap: nV=${nV} nT=${nT} dir=${DIR}`);
    expect(nT).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
