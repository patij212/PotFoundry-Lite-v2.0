// inhouseRender.test.ts — build a renderable in-house mesh and dump xyz+idx. (PF_INRENDER=1.)
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;
const DUMPS = join('research', 'exchange', '_inrender');

describe('in-house renderable dump', () => {
  it.skipIf(!process.env.PF_INRENDER)('build + dump', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.007, hMin: 0.02, hMax: 8, sizeRes: 192, gradeBeta: 0.2, seedN: 12, maxPoints: 330_000, splitThresh: 1.5, optimizeSweeps: 5 });
    const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
    const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: mesh.indices });
    const tris = mesh.indices.length / 3;
    writeFileSync(join(DUMPS, 'inhouse.json'), JSON.stringify({ style: String(STYLE), arm: 'in-house', triCount: tris, minAngleDeg: q.minAngleDeg, xyz: Array.from(lifted.vertices), idx: Array.from(mesh.indices), tris: Array.from(mesh.indices), config: `in-house ${(tris / 1000).toFixed(0)}k` }));
    // eslint-disable-next-line no-console
    console.log(`dumped in-house tris=${tris} mean=${q.meanMinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(2)}`);
    expect(tris).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
