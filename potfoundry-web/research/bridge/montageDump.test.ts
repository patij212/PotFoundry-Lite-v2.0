// montageDump.test.ts — low-density iso meshes (one per style) just for the 20-style montage render.
// (PF_MONTAGE=1.) The full-density meshes + STLs are produced by allTwentyExport; these are small for embedding.
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple', 'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave', 'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet'] as StyleId[];
const OUT = join('research', 'exchange', '_all20', 'montage');

describe('montage dumps (low density)', () => {
  it.skipIf(!process.env.PF_MONTAGE)('build + dump 20 low-density iso meshes', () => {
    mkdirSync(OUT, { recursive: true });
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.08, hMin: 0.08, hMax: 8, sizeRes: 96, gradeBeta: 0.2, seedN: 10, maxPoints: 20_000, splitThresh: 1.5, optimizeSweeps: 2 });
      const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
      writeFileSync(join(OUT, `${String(style)}.json`), JSON.stringify({ style: String(style), triCount: mesh.indices.length / 3, xyz: Array.from(lifted.vertices), tris: Array.from(mesh.indices) }));
    }
    expect(STYLES.length).toBe(20);
  }, 20 * 60 * 1000);
});
