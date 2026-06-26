// potfoundry-web/research/bridge/runStyle.test.ts
import { describe, it, expect } from 'vitest';
import { runStyle, buildRadiusFn, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
// SMOOTH: sinusoidal ripple — clean chord, no creases, CAD-grade in baseline
const SMOOTH = 'HarmonicRipple' as StyleId;
// TANGLED: smooth-relief Gyroid lattice — the H1 headline style, no crease exclusion
const TANGLED = 'GyroidManifold' as StyleId;

describe('runStyle — 2-style end-to-end spike', () => {
  it('buildRadiusFn returns finite, positive radii on the (u,t) domain', () => {
    const rA = buildRadiusFn(SMOOTH, {}, DIMS);
    for (const [th, z] of [[0, 0], [Math.PI, 60], [6.2, 119]] as const) {
      expect(Number.isFinite(rA(th, z))).toBe(true);
      expect(rA(th, z)).toBeGreaterThan(0);
    }
  });

  for (const s of [SMOOTH, TANGLED]) {
    it(`${s}: triangle + gmsh each produce a measurable ScoreRow`, () => {
      const rows = runStyle(s, DIMS, ['triangle', 'gmsh'],
        { tolMm: 0.1, sizeRes: 24, hMin: 0.003, hMax: 0.08 });
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.tris).toBeGreaterThan(0);
        expect(Number.isFinite(r.chordP99Mm)).toBe(true);
        expect(Number.isFinite(r.minAngleDeg)).toBe(true);
        expect(r.vertexMaxMm).toBeLessThan(0.05); // analytic lift ⇒ vertices on-surface
      }
    }, 180000); // gmsh + triangle + dense measurement; generous timeout
  }
});
