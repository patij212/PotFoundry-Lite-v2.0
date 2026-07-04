// _gf_gothic_render.test.ts — DEV-ONLY (PF_GF_GOTHIC=1). E-2026-07-04-GF-GOTHIC visual evidence.
//
// Render the WITH-flank-strips mesh (finest u-pitch 0.10) with the HONEST true-3D heatmap so the finding ships with a
// picture: the residual red is concentrated ON the near-vertical rib-crest KNIFE-EDGES (56% of the worst-200 facets
// have flank half-span ~0 = a zero-width cusp a flat facet cannot follow), NOT on the panels — confirming the
// flank-pitch lever cannot close it (density-INVARIANT floor ~0.080, steep-EXCLUDE). Moderate budget for speed.
//
// ISOLATION: NEW file. Reuses labkit + _cu_gothicsegLib + _gf_gothicFlankLib READ-ONLY. Writes ONLY _gf_gothic/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts,
  buildMeshUt, dumpHeatmap, type AnalyticRadiusFn,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { type CrestExtractResult } from './_cu_gothicsegLib';
import { buildFlankPoints, type FlankPitchOpts } from './_gf_gothicFlankLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const STYLE = 'GothicArches' as StyleId;
const R_MEAN = 48;
const DIR = join(process.cwd(), 'research', 'exchange', '_gf_gothic');
const EXCACHE = join(process.cwd(), 'research', 'exchange', '_gd_gothic', 'extract.cache.json');

describe('gf-gothic render: flank-strip mesh true-3D heatmap', () => {
  it.skipIf(process.env.PF_GF_GOTHIC !== '1')('render-flank-true3d', () => {
    if (existsSync(join(DIR, 'gf_flank.col.bin'))) { /* eslint-disable-next-line no-console */ console.log('render bins exist, skip'); return; }
    const rA: AnalyticRadiusFn = buildRadiusFn(STYLE, {}, DIMS);
    const ex = JSON.parse(readFileSync(EXCACHE, 'utf8')) as CrestExtractResult;
    const flankOpts: FlankPitchOpts = { uPitchMmArc: 0.10, tPitchMmZ: 0.09, rMean: R_MEAN, H, maxDu: (1 / 72) / 2 * 1.2, maxDt: 0.05, minGradU: 6, minGradT: 0.4 };
    const flank = buildFlankPoints(rA, ex.crestUt, flankOpts);
    const injected = ex.points.concat(flank.points);
    const opts: InhouseMeshOpts = {
      tolMm: 0.006, hMin: 0.010, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
      maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
      chordTolMm: 0.010, chordSteiner: true,
      guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
      injectedPoints: injected, pinInjected: true, constraintEdges: ex.constraints,
    };
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, H, opts);
    /* eslint-disable-next-line no-console */
    console.log(`render mesh ${(mesh.indices.length / 3 / 1e6).toFixed(2)}M in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);
    mkdirSync(DIR, { recursive: true });
    // HONEST true-3D heatmap (default ruler) — the red should localize to the knife-edge rib crests.
    dumpHeatmap(DIR, 'gf_flank', m.xyz, mesh.ut, mesh.indices, rA, H);
    expect(mesh.indices.length).toBeGreaterThan(0);
  }, 120 * 60 * 1000);
});
