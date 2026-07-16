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
import type { ValidatedResidualEnclosureRequest } from './continuousMappedPatchDistance';
import {
  createGeneratedContinuousFeatureStyleOuterWallTargetBinding,
  generatedContinuousFeatureStyleOuterWallTargetForProof,
  type GeneratedContinuousFeatureStyleOuterWallTargetBinding,
} from './generatedContinuousFeatureStyleOuterWallTargets';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

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

// U3b slice 6: GeometricStar sector cycles must be emitted as point-affine
// expressions of the unit angular parameter (pointCount*u, plus the
// row-coupled rowParity*shift term only when shift != 0) with tau cancelled
// symbolically at authoring time. The old tau-roundtrip emission
// (theta/(tau/pointCount) with INTERVAL tau) makes every cell that touches a
// sector station u = k/pointCount overhang the integer, so its sector floor
// hulls one full band wide at every subdivision depth — the measured
// GeometricStar mechanism block.
describe('GeometricStar band-resolvable sector emission (U3b)', () => {
  type Corner = readonly [number, number];

  function residualRequestFor(
    binding: GeneratedContinuousFeatureStyleOuterWallTargetBinding,
    corners: readonly [Corner, Corner, Corner],
    fractionBits: number
  ): ValidatedResidualEnclosureRequest {
    const denominator = 2 ** fractionBits;
    const vertices = corners.map(([cu, cv]) => ({
      uNumerator: cu.toString(),
      vNumerator: cv.toString(),
    })) as unknown as ValidatedResidualEnclosureRequest['cell']['vertices'];
    const verticesMm = corners.map(([cu, cv]) => {
      const point = binding.backends.evaluateFloat64(cu / denominator, cv / denominator);
      return [Math.fround(point[0]), Math.fround(point[1]), Math.fround(point[2])] as const;
    }) as unknown as ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'];
    return {
      patchId: 'outer-wall',
      artifactTriangleIndex: 0,
      artifactTriangleVerticesMm: verticesMm,
      originalDomainTriangle: vertices,
      cell: {
        fractionBits,
        barycentricFractionBits: 0,
        vertices,
        barycentricVertices: [
          { aNumerator: '1', bNumerator: '0', cNumerator: '0' },
          { aNumerator: '0', bNumerator: '1', cNumerator: '0' },
          { aNumerator: '0', bNumerator: '0', cNumerator: '1' },
        ],
      },
    };
  }

  function maxEnclosureWidthMm(enclosure: {
    xMm: { lower: number; upper: number };
    yMm: { lower: number; upper: number };
    zMm: { lower: number; upper: number };
  }): number {
    return Math.max(
      enclosure.xMm.upper - enclosure.xMm.lower,
      enclosure.yMm.upper - enclosure.yMm.lower,
      enclosure.zMm.upper - enclosure.zMm.lower
    );
  }

  function evaluatorFor(binding: GeneratedContinuousFeatureStyleOuterWallTargetBinding) {
    return compileValidatedResidualEvaluator({
      targetSha256: binding.bindingSha256,
      programCanonicalJson: binding.programCanonicalJson,
    });
  }

  it('band-resolves a sector-station-adjacent cell at gsShift 0 (defaults)', () => {
    // Registry defaults: pointCount 8, layers 4, zoom 1, shift 0. Cell with
    // its LEFT edge exactly ON the sector station u = 1/8 (= 64/512) and v
    // strictly inside row 2 (vRaw in [2.5, 2.508]). Both floors must
    // band-resolve; the strap there is inactive (shape identically 0), so
    // the resolved residual is just the base-profile curvature sag of the
    // 1/512 cell (~5 um on this 140 mm pot) while the old tau-roundtrip
    // emission hulled the sector floor one full band wide — measured
    // 7.33 mm on this exact cell — at every subdivision depth.
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('GeometricStar')
    );
    const evaluator = evaluatorFor(binding);
    const request = residualRequestFor(
      binding,
      [
        [64, 320],
        [65, 320],
        [65, 321],
      ],
      9
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expect(maxEnclosureWidthMm(enclosure)).toBeLessThan(0.01);
  });

  it('keeps the sound hull when a nonzero gsShift jump crosses a cell interior', () => {
    // With shift != 0 the sector argument pointCount*u + rowParity*shift is
    // NOT affine in u/v (rowParity chains through the row floor), so it can
    // never band-resolve; and a non-dyadic shift (0.37) moves the odd-row
    // jump lines to u = (k - 0.37)/8, strictly inside every dyadic cell.
    // The cell around u = 0.63/8 = 0.07875 in row 1 must keep a hull at
    // least as wide as the sector ambiguity — banding never invents a
    // branch.
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(
      input('GeometricStar', { gs_shift: 0.37 })
    );
    const evaluator = evaluatorFor(binding);
    const request = residualRequestFor(
      binding,
      [
        [2, 10],
        [3, 10],
        [3, 11],
      ],
      5
    );
    const enclosure = evaluator.encloseResidualFast(request);
    expect(enclosure).not.toBeNull();
    if (enclosure === null) return;
    expect(maxEnclosureWidthMm(enclosure)).toBeGreaterThan(0.5);
  });

  it('matches the legacy radius at gsShift != 0 across both row parities', () => {
    // The re-emitted sector cycles use the exact identity
    // (theta + rowOffset)/(tau/pointCount) = pointCount*u + rowParity*shift;
    // pin float parity against the legacy CPU evaluator on both parities so
    // the symbolic cancellation cannot drift the real semantics.
    const canonicalInput = input('GeometricStar', { gs_shift: 0.37 });
    const binding = createGeneratedContinuousFeatureStyleOuterWallTargetBinding(canonicalInput);
    for (const [u, v] of [
      [0.013, 0.07],
      [0.49, 0.3],
      [0.83, 0.55],
      [0.17, 0.8],
      [0.61, 0.95],
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
        DEFAULT_GEOMETRY as unknown as StyleOptions
      );
      const expected = rOuterGeometricStar(
        theta,
        z,
        r0,
        DEFAULT_GEOMETRY.H,
        canonicalInput.style.cpuOptions as StyleOptions
      );
      expect(Math.hypot(point[0], point[1])).toBeCloseTo(expected, 9);
    }
  });
});
