import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { baseRadius } from '../profile';
import {
  rOuterCrystalline,
  rOuterGeometricStar,
  rOuterGothicArches,
  rOuterGyroidManifold,
  rOuterRippleInterference,
  rOuterWaveInterference,
} from '../styles';
import type { StyleId, StyleOptions } from '../types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createGeneratedContinuousFeatureStyleOuterWallTargetBinding,
  generatedContinuousFeatureStyleOuterWallTargetForProof,
  type GeneratedContinuousFeatureStyleOuterWallTargetBinding,
} from './generatedContinuousFeatureStyleOuterWallTargets';

const legacy = {
  GothicArches: rOuterGothicArches,
  WaveInterference: rOuterWaveInterference,
  Crystalline: rOuterCrystalline,
  GyroidManifold: rOuterGyroidManifold,
  RippleInterference: rOuterRippleInterference,
  GeometricStar: rOuterGeometricStar,
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

describe('generated continuous-feature style outer-wall targets', () => {
  it.each([
    'GothicArches',
    'WaveInterference',
    'Crystalline',
    'GyroidManifold',
    'RippleInterference',
    'GeometricStar',
  ] as const)(
    'matches the legacy Float64 radius for %s where shared profile semantics agree',
    (styleId) => {
      const canonicalInput = input(styleId);
      const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(canonicalInput);
      for (const [u, v] of [
        [0, 0],
        [0.013, 0.07],
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
        expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
        expect(point[2]).toBeCloseTo(z, 13);
      }
      expect(binding.nodeCount).toBeLessThan(350);
    }
  );

  it.each([
    'GothicArches',
    'WaveInterference',
    'Crystalline',
    'GyroidManifold',
    'RippleInterference',
    'GeometricStar',
  ] as const)(
    'authenticates symbolic seam periodicity for %s',
    (styleId) => {
      const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(input(styleId));
      expect(binding.periodicIdentificationAdmissible).toBe(true);
      expect(binding.seamSemantics).toBe('periodic-identification-symbolically-admissible');
      for (const v of [0, 0.13, 0.57, 1]) {
        const left = binding.backends.evaluateFloat64(0, v);
        const right = binding.backends.evaluateFloat64(1, v);
        expect(Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]))
          .toBeLessThan(1e-10);
      }
    }
  );

  it('declares Gothic parameter and implicit feature-partition obligations', () => {
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('GothicArches', { gaCounts: 7 })
    );
    expect(binding.boundaryFamilyCount).toBeGreaterThanOrEqual(12);
    expect(binding.boundaryFamilies.some((family) => family.id === 'gothic-bay-centres')).toBe(true);
    expect(binding.boundaryFamilies.some((family) => family.boundaryClass === 'implicit-program-level-set'))
      .toBe(true);
    expect(binding.boundaryManifestCanonicalJson).toContain('root isolation');
  });

  it('declares Wave clamp/floor boundaries and only active edge-fade joins', () => {
    const active = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('WaveInterference')
    );
    expect(active.boundaryFamilies.map((family) => family.id)).toEqual([
      'wave-normalization-clamp',
      'wave-radius-floor-contact',
      'wave-edge-fade-joins',
    ]);

    const inactive = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('WaveInterference', { wi_edge_fade: 0 })
    );
    expect(inactive.boundaryFamilies.map((family) => family.id)).toEqual([
      'wave-normalization-clamp',
      'wave-radius-floor-contact',
    ]);
  });

  it('declares Crystalline facet wraps, support floors, and modulation clamp contacts', () => {
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('Crystalline')
    );
    expect(binding.boundaryFamilies.map((family) => family.id)).toEqual([
      'crystalline-primary-facet-wraps',
      'crystalline-primary-facet-floor',
      'crystalline-subfacet-wraps',
      'crystalline-subfacet-floor',
      'crystalline-modulation-clamp',
    ]);
  });

  it('keeps arbitrary Gyroid scale periodic and declares only active edge-fade joins', () => {
    const active = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('GyroidManifold', { gm_scale: 4.3 })
    );
    expect(active.boundaryFamilies.map((family) => family.id)).toEqual([
      'gyroid-relief-band-transitions',
      'gyroid-edge-fade-transitions',
    ]);
    const inactive = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('GyroidManifold', { gm_edge_fade: 0 })
    );
    expect(inactive.boundaryFamilies.map((family) => family.id)).toEqual([
      'gyroid-relief-band-transitions',
    ]);
  });

  it('unrolls Ripple sources and declares antipode, centre, and radius-floor obligations', () => {
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('RippleInterference', { ri_source_count: 8 })
    );
    expect(binding.boundaryFamilies.map((family) => family.id)).toEqual([
      'ripple-source-antipodes',
      'ripple-source-centres',
      'ripple-radius-floor-contact',
    ]);
    expect(binding.nodeCount).toBeGreaterThan(100);
    expect(binding.nodeCount).toBeLessThan(350);
  });

  it('declares Geometric Star row, sector, line, and strap transitions without curtains', () => {
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('GeometricStar')
    );
    expect(binding.boundaryFamilies.map((family) => family.id)).toEqual([
      'star-vertical-row-boundaries',
      'star-angular-sector-boundaries-and-folds',
      'star-line-absolute-zero',
      'star-strap-smoothstep-transitions',
    ]);
  });

  it('reauthenticates bindings and refuses structural copies or unsupported styles', () => {
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('GothicArches')
    );
    expect(generatedContinuousFeatureStyleOuterWallTargetForProof(binding)).toBe(binding);
    expect(() =>
      generatedContinuousFeatureStyleOuterWallTargetForProof(
        Object.freeze({ ...binding }) as GeneratedContinuousFeatureStyleOuterWallTargetBinding
      )
    ).toThrow(/authenticated capability/i);
    expect(() =>
      createGeneratedContinuousFeatureStyleOuterWallTargetBinding(input('HarmonicRipple'))
    ).toThrow(/not supported/i);
  });
});
