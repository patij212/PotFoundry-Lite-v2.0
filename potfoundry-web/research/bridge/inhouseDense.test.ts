// inhouseDense.test.ts — push the in-house per-node-metric mesher PAST gmsh BAMG's ~1.8M cap to chase rms 0.01.
// (PF_DENSE=1.) gmsh pinned at 1.796M; the in-house kernel has no such cap. Single dense run on Gyroid.
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;
const ROOT = join('research', 'exchange', '_indense');

describe('in-house mesher past the gmsh cap → rms 0.01', () => {
  it.skipIf(!process.env.PF_DENSE)('dense Gyroid', () => {
    mkdirSync(ROOT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.0015, hMin: 0.004, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 3 });
    const buildSecs = (Date.now() - t0) / 1000;
    const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
    const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: mesh.indices });
    const tris = mesh.indices.length / 3;
    const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: mesh.indices }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.0015, seamExclU: 0, denseN: 2 });
    const result = { tris, points: mesh.points, rounds: mesh.rounds, hitBudget: mesh.hitBudget, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, rmsMm: dev.rmsDevMm, p99Mm: dev.p99DevMm, buildSecs, exceedsGmshCap: tris > 1_800_000 };
    writeFileSync(join(ROOT, 'result.json'), JSON.stringify(result, null, 2));
    // eslint-disable-next-line no-console
    console.log(`tris=${tris} (>1.8M gmsh cap: ${result.exceedsGmshCap}) rounds=${mesh.rounds} | worst=${q.minAngleDeg.toFixed(1)} p5=${q.p5MinAngleDeg.toFixed(1)} mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(2)} | rms=${dev.rmsDevMm.toFixed(4)} p99=${dev.p99DevMm.toFixed(4)} | build ${buildSecs.toFixed(0)}s`);
    expect(tris).toBeGreaterThan(0);
  }, 40 * 60 * 1000);
});
