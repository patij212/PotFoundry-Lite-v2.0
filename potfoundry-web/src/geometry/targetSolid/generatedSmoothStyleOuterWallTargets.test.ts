import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import {
  rOuterFourierBloom,
  rOuterSpiralRidges,
  rOuterSuperellipseMorph,
} from '../styles';
import type { StyleId, StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createGeneratedSmoothStyleOuterWallTargetBinding,
  generatedSmoothStyleOuterWallTargetForProof,
  type GeneratedSmoothStyleOuterWallTargetBinding,
} from './generatedSmoothStyleOuterWallTargets';

const legacy = {
  FourierBloom: rOuterFourierBloom,
  SpiralRidges: rOuterSpiralRidges,
  SuperellipseMorph: rOuterSuperellipseMorph,
} as const;
const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

function input(styleId: StyleId, style: Readonly<Record<string, number>> = {}) {
  return createCanonicalTargetInputBinding(
    DEFAULT_GEOMETRY,
    styleId,
    style,
    TARGET_CONTROLS
  );
}

describe('generated smooth-style outer-wall targets', () => {
  it.each(['FourierBloom', 'SpiralRidges', 'SuperellipseMorph'] as const)(
    'matches the legacy Float64 radius for %s where shared profile semantics agree',
    (styleId) => {
      const canonicalInput = input(styleId);
      const binding = createGeneratedSmoothStyleOuterWallTargetBinding(canonicalInput);
      for (const [u, v] of [
        [0, 0],
        [0.17, 0.25],
        [0.49, 0.5],
        [0.83, 1],
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
        const expected = legacy[styleId](
          theta,
          z,
          r0,
          DEFAULT_GEOMETRY.H,
          canonicalInput.style.cpuOptions as StyleOptions
        );
        expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 10);
        expect(point[2]).toBeCloseTo(z, 13);
      }
      expect(binding.nodeCount).toBeLessThan(120);
    }
  );

  it('classifies nonintegral active Spiral groove frequency as a physical seam closure', () => {
    const discontinuous = createGeneratedSmoothStyleOuterWallTargetBinding(
      input('SpiralRidges', { spiral_groove_mult: 1.1 })
    );
    expect(discontinuous.periodicIdentificationAdmissible).toBe(false);
    expect(discontinuous.seamSemantics).toContain('physical-feature-closure');
    const seam0 = discontinuous.backends.evaluateFloat64(0, 0.37);
    const seam1 = discontinuous.backends.evaluateFloat64(1, 0.37);
    expect(Math.hypot(seam0[0] - seam1[0], seam0[1] - seam1[1])).toBeGreaterThan(1e-3);

    const inactiveGroove = createGeneratedSmoothStyleOuterWallTargetBinding(
      input('SpiralRidges', { spiral_groove_amp: 0, spiral_groove_mult: 1.1 })
    );
    expect(inactiveGroove.periodicIdentificationAdmissible).toBe(true);
  });

  it('reauthenticates bindings and refuses structural copies or unsupported styles', () => {
    const binding = createGeneratedSmoothStyleOuterWallTargetBinding(input('FourierBloom'));
    expect(generatedSmoothStyleOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      generatedSmoothStyleOuterWallTargetForProof(
        Object.freeze({ ...binding }) as GeneratedSmoothStyleOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createGeneratedSmoothStyleOuterWallTargetBinding(input('HarmonicRipple'))
    ).toThrow(/not supported/i);
  });
});
