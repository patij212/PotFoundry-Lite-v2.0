// _heatmapDefaultSmoke.test.ts — DEV-ONLY (env PF_HEATSMOKE=1). CANONICAL USAGE of the default lab heatmap view:
// `dumpHeatmap` colours by the TRUE-3D ruler (honest) by default; pass `ruler:'radial'` only for an A/B against the
// legacy same-(u,t) chord (which overstates near-vertical relief). Build a small GothicArches mesh, dump both, and
// render side-by-side with the reusable renderer:
//   NODE_PATH="$(pwd)/node_modules" node research/render/meshRender.cjs out.png research/exchange/_heatsmoke 2 smoke_true3d smoke_radial
// Isolated: CALLS the kernel; edits nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, dumpHeatmap, type StyleDims,
} from './labkit';
import { planarizeSegments, segmentsFromLines } from './planarizeSkeleton';
import { refineLinesToExtremum } from './refineLoci';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const DIR = join('research', 'exchange', '_heatsmoke');

describe('default lab heatmap view (dumpHeatmap → true-3D)', () => {
  it.skipIf(process.env.PF_HEATSMOKE !== '1')('dumps a true-3D (default) + radial (A/B) heatmap', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const refined = refineLinesToExtremum(truth.lines, rA, DIMS.H, truth.uToMm, truth.tToMm, 0.6);
    const pslg = planarizeSegments(segmentsFromLines(refined, 0.01));
    // small/fast mesh — enough to show the ribs (hMin 0.02, ~150k pts)
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 192, gradeBeta: 0.2, seedN: 12, maxPoints: 400_000, splitThresh: 1.5, optimizeSweeps: 2, guardManifoldAlways: true, injectedPoints: pslg.points, pinInjected: true });
    const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
    const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
    // THE default view — one call, honest ruler:
    const t3 = dumpHeatmap(DIR, 'smoke_true3d', meshUt.xyz, ut, idx, rA, DIMS.H, { stl: false });
    // legacy ruler for A/B:
    const rad = dumpHeatmap(DIR, 'smoke_radial', meshUt.xyz, ut, idx, rA, DIMS.H, { ruler: 'radial' });
    // eslint-disable-next-line no-console
    console.log(`HEATSMOKE tris=${idx.length / 3} | true-3D worst=${t3.worstMm.toFixed(3)} %>0.03=${(100 * t3.fracOver(0.03)).toFixed(2)} | radial worst=${rad.worstMm.toFixed(3)} %>0.03=${(100 * rad.fracOver(0.03)).toFixed(2)} | overstatement ${(rad.worstMm / Math.max(1e-9, t3.worstMm)).toFixed(1)}×`);
    expect(t3.worstMm).toBeLessThan(rad.worstMm); // honest ruler is smaller than the overstating radial one on steep ribs
  }, 20 * 60 * 1000);
});
