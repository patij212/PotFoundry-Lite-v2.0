// _breadthHeatmap.test.ts — DEV-ONLY (PF_BREADTH_HM=1 + per-style sub-gate). Dump anchored true-3D heatmap bins
// for the 3 smooth/crease styles (the full _breadth run's inline dump was interrupted by kills). Rebuilds the
// dense mesh + colours by perFaceTrue3DSagAnchored vs the ANALYTIC surface, scale 0.01mm. Resumable (skips if bins
// exist). Writes ONLY to research/exchange/_breadth/<style>/<tag>/.
import { describe, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, perFaceTrue3DSagAnchored, perFaceChordSag, vertErrColors, dumpRenderBins } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec } from './_sharp3dMesh';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_breadth');

function dumpFor(style: string, nTh: number, nZ: number, tag: string): void {
  const dir = join(ROOT, style, tag);
  if (existsSync(join(dir, `${style}_heatmap.col.bin`))) return; // resumable
  const rA = buildRadiusFn(style as StyleId, {}, DIMS);
  const rows: RowSpec[] = [];
  for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
  const mesh = buildStructuredWall(rA, DIMS.H, rows);
  const anSag = perFaceTrue3DSagAnchored(mesh.ut, mesh.idx, rA, DIMS.H, { preFilterMm: 0.005, redMm: 0.01, topK: 300, coarse: { nTheta: 4096, nZ: 800 }, fine: { nTheta: 12288, nZ: 2400 } });
  const sorted = Float64Array.from(anSag.faceErr).sort();
  const p99 = sorted[Math.floor(0.99 * sorted.length)];
  let over01 = 0; for (let f = 0; f < mesh.nF; f++) if (anSag.faceErr[f] > 0.01) over01++;
  dumpRenderBins(dir, `${style}_heatmap`, mesh.xyz, mesh.idx, {
    colors: vertErrColors(anSag.vertErr, 0.01),
    meta: { ruler: 'true3d-anchored', label: `${style} dense structured — true-3D vs analytic surface (anchored, scale 0.01mm)`, worstMm: anSag.worstMm, p99Mm: p99, pctOver0_01: 100 * over01 / mesh.nF, scaleMm: 0.01 }, stl: false,
  });
  // eslint-disable-next-line no-console
  console.log(`[hm ${style} ${tag}] dumped tris=${mesh.nF} anchoredWorst=${anSag.worstMm.toFixed(4)} p99=${p99.toFixed(4)} over01=${over01}`);
}

// RADIAL heatmap (the FAITHFUL visual for on-surface meshes — anchored-perp over-colours azimuthal creases/edges).
// Distinct name `<style>_radialheat` so it NEVER races the anchored `<style>_heatmap` dump.
function dumpRadialFor(style: string, nTh: number, nZ: number, tag: string): void {
  const dir = join(ROOT, style, tag);
  if (existsSync(join(dir, `${style}_radialheat.col.bin`))) return;
  const rA = buildRadiusFn(style as StyleId, {}, DIMS);
  const rows: RowSpec[] = [];
  for (let j = 0; j <= nZ; j++) { const z = DIMS.H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
  const mesh = buildStructuredWall(rA, DIMS.H, rows);
  const rad = perFaceChordSag(mesh.ut, mesh.idx, rA, DIMS.H);
  const sorted = Float64Array.from(rad.faceErr).sort();
  const p99 = sorted[Math.floor(0.99 * sorted.length)];
  dumpRenderBins(dir, `${style}_radialheat`, mesh.xyz, mesh.idx, {
    colors: vertErrColors(rad.vertErr, 0.01),
    meta: { ruler: 'radial (facet-own-region, FAITHFUL for on-surface mesh)', label: `${style} dense structured — RADIAL chord vs own (u,t) region (scale 0.01mm)`, worstMm: rad.worstMm, p99Mm: p99, pctOver0_01: 100 * rad.fracOver(0.01), scaleMm: 0.01 }, stl: false,
  });
  // eslint-disable-next-line no-console
  console.log(`[hm-radial ${style} ${tag}] dumped tris=${mesh.nF} radialWorst=${rad.worstMm.toFixed(4)} p99=${p99.toFixed(4)}`);
}

describe('BREADTH-HEATMAP', () => {
  it.skipIf(process.env.PF_BREADTH_HM !== '1' || process.env.PF_HM_BS !== '1')('BambooSegments heatmap', () => { dumpFor('BambooSegments', 2160, 700, 'bs_c2160_z700'); dumpRadialFor('BambooSegments', 2160, 700, 'bs_c2160_z700'); }, 900_000);
  it.skipIf(process.env.PF_BREADTH_HM !== '1' || process.env.PF_HM_GS !== '1')('GeometricStar heatmap', () => { dumpFor('GeometricStar', 3600, 1100, 'gs_c3600_z1100'); dumpRadialFor('GeometricStar', 3600, 1100, 'gs_c3600_z1100'); }, 1_200_000);
  it.skipIf(process.env.PF_BREADTH_HM !== '1' || process.env.PF_HM_LP !== '1')('LowPolyFacet heatmap', () => { dumpFor('LowPolyFacet', 2160, 700, 'lp_c2160_z700'); dumpRadialFor('LowPolyFacet', 2160, 700, 'lp_c2160_z700'); }, 900_000);
});
