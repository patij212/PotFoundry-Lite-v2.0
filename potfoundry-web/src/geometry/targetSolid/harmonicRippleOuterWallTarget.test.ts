import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterHarmonicRipple } from '../styles';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createHarmonicRippleOuterWallTargetBinding,
  harmonicRippleOuterWallTargetForProof,
  type HarmonicRippleOuterWallTargetBinding,
} from './harmonicRippleOuterWallTarget';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

function input(overrides: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    { ...DEFAULT_GEOMETRY, ...overrides },
    'HarmonicRipple',
    {},
    TARGET_CONTROLS
  );
}

describe('generated Harmonic Ripple outer-wall target', () => {
  it('matches the smooth legacy Float64 radius where the newly pinned base semantics agree', () => {
    const canonicalInput = input({ bellAmp: 0.2, bellWidth: 0.22 });
    const binding = createHarmonicRippleOuterWallTargetBinding(canonicalInput);
    for (const [u, v] of [
      [0, 0],
      [0.125, 0.25],
      [0.47, 0.5],
      [0.9, 1],
    ] as const) {
      const point = binding.backends.evaluateFloat64(u, v);
      const theta = 2 * Math.PI * u;
      const z = DEFAULT_GEOMETRY.H * v;
      const r0 = baseRadius(
        z,
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.bottom_od / 2,
        DEFAULT_GEOMETRY.top_od / 2,
        DEFAULT_GEOMETRY.expn,
        { bellAmp: 0.2, bellCenter: DEFAULT_GEOMETRY.bellCenter, bellWidth: 0.22 }
      );
      const expectedRadius = rOuterHarmonicRipple(
        theta,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions
      );
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expectedRadius, 11);
      expect(point[2]).toBeCloseTo(z, 13);
    }
    expect(binding.nodeCount).toBeLessThan(80);
    expect(binding.implementationScope).toContain('outer-wall-only');
  });

  it('pins positive placement twist independently of material-angle style evaluation', () => {
    const binding = createHarmonicRippleOuterWallTargetBinding(
      input({ spinTurns: 0.25, spinPhase: 30, spinCurve: 1 })
    );
    const point = binding.backends.evaluateFloat64(0, 0.5);
    const placement = (30 * Math.PI) / 180 + 2 * Math.PI * 0.25 * 0.5;
    expect(Math.atan2(point[1], point[0])).toBeCloseTo(placement, 13);
  });

  it('is periodic at the authenticated seam to floating evaluation precision', () => {
    const binding = createHarmonicRippleOuterWallTargetBinding(input());
    const start = binding.backends.evaluateFloat64(0, 0.37);
    const end = binding.backends.evaluateFloat64(1, 0.37);
    expect(Math.hypot(start[0] - end[0], start[1] - end[1], start[2] - end[2])).toBeLessThan(
      1e-11
    );
  });

  it('reauthenticates the binding and refuses structural copies or another style', () => {
    const binding = createHarmonicRippleOuterWallTargetBinding(input());
    expect(harmonicRippleOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      harmonicRippleOuterWallTargetForProof(
        Object.freeze({ ...binding }) as HarmonicRippleOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createHarmonicRippleOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'FourierBloom',
          {},
          TARGET_CONTROLS
        )
      )
    ).toThrow(/expected HarmonicRipple/i);
  });
});
