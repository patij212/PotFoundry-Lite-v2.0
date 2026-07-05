// _pf_best20_gothgeo_stl.test.ts — DEV-ONLY (PF_BEST20GG=1). RENDER/EXPORT job, not a new experiment.
//
// Produces the STL + true-3D heatmap deliverable for GothicArches + GeometricStar into
// research/exchange/_best20_renders/, using the ALREADY-CONVERGED perfect-mesher whole-mesh-kernel
// meshes (literal 0-outlier, E-2026-07-05-PERFECT-MESHER-*) instead of the _best20 CDT-under-M
// meshes (which floor at true3dP99 0.058/0.065 on the designed cusp). Reads the persisted
// `refined_mesh.bin` (u,t + idx) from research/exchange/_pf_perfect_{gothic,geostar}_wholemesh/,
// lifts to 3D via buildMeshUt (identical to _pf_wholemesh_render.test.ts / _pf_geostar_wholemesh_render.test.ts),
// writes a binary STL + a true-3D heatmap (dumpHeatmap) directly into the deliverable dir. NO src/ edit,
// NO new mesher levers — pure read+lift+dump of an existing converged mesh.
//
// NOTE ON SCOPE: refined_mesh.bin is a LOCAL PATCH (a few u-bays x a z-band around the worst junction),
// not a whole-pot tessellation — that is the literal artifact the perfect-mesher wholemesh probes produced
// and is what "the perfect-mesher whole-mesh kernel meshes" refers to per the task brief. Documented in the
// README rather than silently implying a full pot.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMeshUt, dumpHeatmap, writeBinarySTL } from './labkit';
import { makeGothicPatch } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

const OUT = join(process.cwd(), 'research', 'exchange', '_best20_renders');
const PROG = join(OUT, 'progress.log');
const plog = (m: string): void => { mkdirSync(OUT, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };

interface KernelSpec {
  style: string;
  dir: string;
  patch: () => { rA: (th: number, z: number) => number; H: number };
  scorecard: string; // key field name inside the per-style ndjson scorecard for wholeMeshMaxMm/outliers
}

function loadRefinedMesh(path: string): { uv: number[]; idx: number[]; nV: number; nT: number } {
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const uv: number[] = new Array(nV * 2);
  const idx: number[] = new Array(nT * 3);
  let o = 16;
  for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { idx[i] = buf.readInt32LE(o); o += 4; }
  return { uv, idx, nV, nT };
}

function readScorecardRow(dir: string, keyField: string): Record<string, unknown> | null {
  const p = join(dir, 'scorecard.ndjson');
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
  for (const l of lines) { try { const o = JSON.parse(l); if (o[keyField] !== undefined) return o; } catch { /* skip */ } }
  return null;
}

describe('best20-renders: GothicArches + GeometricStar from the perfect-mesher whole-mesh kernel', () => {
  it.skipIf(process.env.PF_BEST20GG !== '1')('build STL + true-3D heatmap for Gothic + GeoStar kernel meshes', () => {
    const specs: KernelSpec[] = [
      {
        style: 'GothicArches',
        dir: join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_wholemesh'),
        patch: () => makeGothicPatch(Number(process.env.PF_BAYS ?? 2), Number(process.env.PF_ZBAND ?? 8)),
        scorecard: 'wholeMeshOutliers',
      },
      {
        style: 'GeometricStar',
        dir: join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh'),
        patch: () => makeGeoStarPatch(Number(process.env.PF_BAYS ?? 5), Number(process.env.PF_ZBAND ?? 10), Number(process.env.PF_TCENTER ?? 0.08)),
        scorecard: 'wholeMeshOutliers',
      },
    ];

    for (const spec of specs) {
      const meshBin = join(spec.dir, 'refined_mesh.bin');
      if (!existsSync(meshBin)) { plog(`[MISSING] ${spec.style} refined_mesh.bin at ${spec.dir} — SKIPPED`); continue; }
      const { uv, idx, nV, nT } = loadRefinedMesh(meshBin);
      const { rA, H } = spec.patch();
      const idxI32 = Int32Array.from(idx);
      const m = buildMeshUt(uv, idxI32, rA, H);
      plog(`[${spec.style}] loaded refined_mesh.bin nV=${nV} nT=${nT} (perfect-mesher whole-mesh kernel patch)`);

      // true-3D heatmap directly into the deliverable dir (name = <Style>_heatmap so it matches the other 18)
      const sag = dumpHeatmap(OUT, `${spec.style}_heatmap`, m.xyz, uv, idxI32, rA, H, {
        stl: false,
        meta: { source: 'perfect-mesher-wholemesh-kernel', primitiveNote: 'local patch (FGJ Morse graph + no-bridge CDT + brute-driven edge refine), NOT a full-pot tessellation' },
      });
      plog(`[${spec.style}] heatmap dumped worstMm=${sag.worstMm.toFixed(5)} (bins: ${spec.style}_heatmap.xyz/idx/col.bin + .meta.json)`);

      // binary STL of the SAME mesh, named per the deliverable convention <Style>.stl
      const stlPath = join(OUT, `${spec.style}.stl`);
      writeBinarySTL(stlPath, m.xyz, idxI32);
      plog(`[${spec.style}] STL written -> ${stlPath} tris=${nT}`);

      const row = readScorecardRow(spec.dir, spec.scorecard);
      plog(`[${spec.style}] source scorecard row: ${JSON.stringify(row)}`);
    }

    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
