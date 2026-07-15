import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterVoronoi } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createVoronoiOuterWallTargetBinding,
  voronoiOuterWallTargetForProof,
  type VoronoiOuterWallTargetBinding,
  type VoronoiOuterWallPatch,
} from './voronoiOuterWallTarget';

function input(style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'Voronoi',
    style,
    { superformulaSeamBlendDegrees: 30 }
  );
}

function distance(
  left: readonly [number, number, number],
  right: readonly [number, number, number]
): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function outer(binding: VoronoiOuterWallTargetBinding): VoronoiOuterWallPatch {
  const patch = binding.patches.find(
    (candidate): candidate is VoronoiOuterWallPatch => candidate.kind === 'outer-wall'
  );
  if (patch === undefined) throw new Error('missing outer wall');
  return patch;
}

describe('Voronoi generated outer-wall target', () => {
  it('matches the production CPU radius away from declared partition loci', () => {
    const canonicalInput = input();
    const binding = createVoronoiOuterWallTargetBinding(canonicalInput);
    const patch = outer(binding);
    for (const [u, t] of [
      [0.137, 0.213],
      [0.421, 0.537],
      [0.783, 0.819],
    ] as const) {
      const z = DEFAULT_GEOMETRY.H * t;
      const r0 = baseRadius(
        z,
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.bottom_od / 2,
        DEFAULT_GEOMETRY.top_od / 2,
        DEFAULT_GEOMETRY.expn,
        DEFAULT_GEOMETRY
      );
      const expected = rOuterVoronoi(
        2 * Math.PI * u,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      const point = patch.backends.evaluateFloat64(u, t);
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
      expect(point[2]).toBeCloseTo(z, 12);
    }
  });

  it('uses one exact PCG2D calculation per neighbor for both hash lanes', () => {
    const patch = outer(createVoronoiOuterWallTargetBinding(input()));
    expect(patch.backends.wgslSource.match(/let h\d+: vec2<f32>/g)).toHaveLength(9);
    expect(patch.backends.wgslSource).toContain('0x9e3779b1u');
    expect(patch.backends.wgslSource).toContain('0x85ebca77u');
  });

  it('admits periodic identification for active integer scale', () => {
    const binding = createVoronoiOuterWallTargetBinding(input());
    expect(binding.cpuPeriodX).toBe(8);
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    expect(binding.patchCount).toBe(1);
    const patch = outer(binding);
    for (const t of [0, 0.17, 0.53, 1]) {
      expect(distance(
        patch.backends.evaluateFloat64(0, t),
        patch.backends.evaluateFloat64(1, t)
      )).toBeLessThan(1e-10);
    }
  });

  it('closes a valid noninteger-scale seam with an explicit physical curtain', () => {
    const binding = createVoronoiOuterWallTargetBinding(
      input({ v_scale: 7.5, v_morph: 0 })
    );
    const wall = outer(binding);
    const curtain = binding.patches.find((patch) => patch.kind === 'seam-curtain');
    expect(binding.cpuPeriodX).toBe(8);
    expect(binding.seamCurtainActive).toBe(true);
    expect(binding.periodicIdentificationAdmissible).toBe(false);
    expect(binding.patchCount).toBe(2);
    expect(curtain).toBeDefined();
    expect(distance(
      wall.backends.evaluateFloat64(0, 0.43),
      wall.backends.evaluateFloat64(1, 0.43)
    )).toBeGreaterThan(1e-6);
    if (curtain === undefined || curtain.kind !== 'seam-curtain') return;
    for (const t of [0, 0.19, 0.43, 0.81, 1]) {
      expect(distance(
        curtain.backends.evaluateFloat64(t, 0),
        wall.backends.evaluateFloat64(0, t)
      )).toBeLessThan(1e-9);
      expect(distance(
        curtain.backends.evaluateFloat64(t, 1),
        wall.backends.evaluateFloat64(1, t)
      )).toBeLessThan(1e-9);
    }
  });

  it('proves the cellular field position-dead at zero relief and omits its seam curtain', () => {
    const binding = createVoronoiOuterWallTargetBinding(
      input({ v_scale: 7.5, v_relief: 0 })
    );
    expect(binding.seamCurtainActive).toBe(false);
    expect(binding.periodicIdentificationAdmissible).toBe(true);
    expect(binding.patchCount).toBe(1);
    const patch = outer(binding);
    expect(distance(
      patch.backends.evaluateFloat64(0, 0.43),
      patch.backends.evaluateFloat64(1, 0.43)
    )).toBeLessThan(1e-10);
  });

  it('authenticates the current CPU versus WGSL half-tie period mismatch', () => {
    const mismatch = createVoronoiOuterWallTargetBinding(input({ v_scale: 8.5 }));
    expect(mismatch.cpuPeriodX).toBe(9);
    expect(mismatch.wgslRoundPeriodX).toBe(8);
    expect(mismatch.currentCpuWgslPeriodMismatch).toBe(true);

    const agreement = createVoronoiOuterWallTargetBinding(input({ v_scale: 7.5 }));
    expect(agreement.cpuPeriodX).toBe(8);
    expect(agreement.wgslRoundPeriodX).toBe(8);
    expect(agreement.currentCpuWgslPeriodMismatch).toBe(false);
  });

  it('reauthenticates the patch set and refuses copies or the wrong style', () => {
    const binding = createVoronoiOuterWallTargetBinding(input());
    expect(voronoiOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      voronoiOuterWallTargetForProof(
        Object.freeze({ ...binding }) as VoronoiOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createVoronoiOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'Crystalline',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected Voronoi/i);
  });
});
