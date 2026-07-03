// _scaleColRender.test.ts — DEV-ONLY. E-SCALECOL heatmap dump for a class representative: build via the driver and
// dump the TRUE-3D chord heatmap (dumpHeatmap, honest ruler; anchorSteep for tangled lattices). One style per run.
import { describe, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, dumpHeatmap } from './labkit';
import { buildScaleColMesh } from './_scaleColDriver';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SCALECOL === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OUT = join('research', 'exchange', '_scalecol');

describe.skipIf(!RUN)('E-SCALECOL render', () => {
  it('dump true-3D heatmap for a class rep', () => {
    mkdirSync(OUT, { recursive: true });
    const STYLE = (process.env.PF_SCALECOL_STYLE ?? 'HarmonicRipple') as StyleId;
    const hRowMm = Number(process.env.PF_SCALECOL_HROW ?? '0.25');
    const forcePath = process.env.PF_SCALECOL_PATH as ('ridge-graph' | 'uniform-smooth' | undefined);
    const anchor = process.env.PF_SCALECOL_ANCHOR === '1';
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const build = buildScaleColMesh(rA, DIMS.H, { hRowMm, scanN: 6000, ...(forcePath ? { forcePath } : {}) });
    const name = `hm_${STYLE}_${build.path}_h${String(hRowMm).replace('.', 'p')}`;
    const sag = dumpHeatmap(OUT, name, Float32Array.from(build.mesh.xyz), build.mesh.ut, build.mesh.idx, rA, DIMS.H, {
      scaleMm: 0.05, stl: false,
      ...(anchor ? { anchorSteep: { redMm: 0.1, topK: 200 } } : {}),
      meta: { style: STYLE, path: build.path, builder: build.builder, tris: build.mesh.nF, hRowMm },
    });
    console.log(`${name}: worst=${sag.worstMm.toFixed(4)} tris=${build.mesh.nF} path=${build.path}`);
  }, 3_600_000);
});
