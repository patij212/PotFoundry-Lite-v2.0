// inhouseProfile.test.ts — phase breakdown of the in-house mesher to target the perf optimization. (PF_PROF=1.)
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

describe('in-house mesher profile', () => {
  it.skipIf(!process.env.PF_PROF)('phase timings', () => {
    const rA = buildRadiusFn('GyroidManifold' as StyleId, {}, DIMS);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.01, hMin: 0.03, hMax: 8, sizeRes: 192, gradeBeta: 0.2, seedN: 12, maxPoints: 180_000, splitThresh: 1.5, optimizeSweeps: 6, profile: true });
    // eslint-disable-next-line no-console
    console.log(`TOTAL tris=${mesh.indices.length / 3} pts=${mesh.points} rounds=${mesh.rounds} time=${((Date.now() - t0) / 1000).toFixed(1)}s`);
    expect(mesh.indices.length).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
