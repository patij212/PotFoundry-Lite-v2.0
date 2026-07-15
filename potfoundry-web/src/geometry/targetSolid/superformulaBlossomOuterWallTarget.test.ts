import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import { rOuterSuperformulaBlossom } from '../styles';
import type { StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createSuperformulaBlossomOuterWallTargetBinding,
  superformulaBlossomOuterWallTargetForProof,
  type SuperformulaBlossomOuterWallTargetBinding,
} from './superformulaBlossomOuterWallTarget';

function input(
  style: Readonly<Record<string, number>> = { sf_strength: 1 },
  seamBlendDegrees = 30
) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    'SuperformulaBlossom',
    style,
    { superformulaSeamBlendDegrees: seamBlendDegrees }
  );
}

describe('Superformula Blossom generated outer-wall target', () => {
  it('matches the legacy Float64 radius including the authenticated seam blend', () => {
    const canonicalInput = input();
    const binding = createSuperformulaBlossomOuterWallTargetBinding(canonicalInput);
    for (const [u, v] of [
      [0, 0],
      [0.01, 0.17],
      [0.06, 0.5],
      [0.17, 0.25],
      [0.49, 0.5],
      [0.83, 1],
      [0.99, 0.72],
      [1, 1],
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
        DEFAULT_GEOMETRY
      );
      const expected = rOuterSuperformulaBlossom(
        theta,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        {
          ...(canonicalInput.style.cpuOptions as StyleOptions),
          seamAngle: 30,
        }
      );
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
      expect(point[2]).toBeCloseTo(z, 13);
    }
    expect(binding.nodeCount).toBeLessThan(180);
  });

  it('closes the positive-blend seam and declares its transition lines', () => {
    const binding = createSuperformulaBlossomOuterWallTargetBinding(input());
    expect(binding.seamRegularity).toBe(
      'positive-blend-position-and-first-derivative-closed'
    );
    expect(binding.boundaryFamilies.map((family) => family.id)).toContain(
      'superformula-seam-blend-transitions'
    );
    for (const v of [0, 0.1, 0.5, 1]) {
      const left = binding.backends.evaluateFloat64(0, v);
      const right = binding.backends.evaluateFloat64(1, v);
      expect(Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]))
        .toBeLessThan(1e-10);
    }
  });

  it('accepts a positionally closed constant-integral zero-blend input as a possible seam crease', () => {
    const canonicalInput = input(
      { sf_strength: 1, sf_m_base: 8, sf_m_top: 8 },
      0
    );
    const binding = createSuperformulaBlossomOuterWallTargetBinding(canonicalInput);
    expect(binding.seamRegularity).toBe(
      'constant-integral-symmetry-position-closed-crease-possible'
    );
    expect(binding.boundaryFamilies.map((family) => family.id)).not.toContain(
      'superformula-seam-blend-transitions'
    );
    const left = binding.backends.evaluateFloat64(0, 0.37);
    const right = binding.backends.evaluateFloat64(1, 0.37);
    expect(Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]))
      .toBeLessThan(1e-10);
  });

  it('classifies zero strength as the base wall independently of the seam blend', () => {
    const binding = createSuperformulaBlossomOuterWallTargetBinding(
      input({ sf_strength: 0 }, 0)
    );
    expect(binding.seamRegularity).toBe('style-inactive-base-wall');
    for (const u of [0, 0.19, 0.53, 1]) {
      const point = binding.backends.evaluateFloat64(u, 0.43);
      const z = DEFAULT_GEOMETRY.H * 0.43;
      const expected = baseRadius(
        z,
        DEFAULT_GEOMETRY.H,
        DEFAULT_GEOMETRY.bottom_od / 2,
        DEFAULT_GEOMETRY.top_od / 2,
        DEFAULT_GEOMETRY.expn,
        DEFAULT_GEOMETRY
      );
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 10);
    }
  });

  it('reauthenticates the binding and refuses copies or the wrong style', () => {
    const binding = createSuperformulaBlossomOuterWallTargetBinding(input());
    expect(superformulaBlossomOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      superformulaBlossomOuterWallTargetForProof(
        Object.freeze({ ...binding }) as SuperformulaBlossomOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createSuperformulaBlossomOuterWallTargetBinding(
        createCanonicalTargetInputBinding(
          DEFAULT_GEOMETRY,
          'HarmonicRipple',
          {},
          { superformulaSeamBlendDegrees: 30 }
        )
      )
    ).toThrow(/expected SuperformulaBlossom/i);
  });
});
