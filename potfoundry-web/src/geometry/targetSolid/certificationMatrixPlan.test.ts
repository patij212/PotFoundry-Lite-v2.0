import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY, GEOMETRY_BOUNDS } from '../../state/types';
import { STYLE_CERTIFICATION_SCHEMA_SNAPSHOT } from '../../styles/certificationSchemaSnapshot';
import { STYLE_REGISTRY } from '../../styles/registry';
import {
  STYLE_PARAMETER_LAYOUT_CONTROL_COUNT,
  STYLE_PARAMETER_LAYOUT_STYLE_COUNT,
} from '../../styles/styleParameterLayoutSpec';
import { parseCanonicalCertificationJson } from './canonicalCertificationJson';
import {
  buildCertificationMatrixPlan,
  CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON,
  CERTIFICATION_MATRIX_COVERAGE_SPEC_SHA256,
} from './certificationMatrixPlan';
import { CERTIFIED_GEOMETRY_DOMAIN_ENTRIES } from './targetSolidSpecification';

function expectedCaseIds(): Set<string> {
  const expected = new Set<string>();
  const styles = Object.entries(STYLE_CERTIFICATION_SCHEMA_SNAPSHOT).sort(
    ([leftId, left], [rightId, right]) =>
      left.id - right.id || (leftId < rightId ? -1 : leftId > rightId ? 1 : 0)
  );
  for (const [styleId, schema] of styles) {
    expected.add(`${styleId}/default`);
    expected.add(`${styleId}/target-control/superformulaSeamBlendDegrees/minimum`);
    expected.add(`${styleId}/target-control/superformulaSeamBlendDegrees/maximum`);
    expected.add(
      `${styleId}/target-control/superformulaSeamBlendDegrees/positive-binary32-collapse`
    );
    if (styleId === 'SuperformulaBlossom') {
      expected.add(`${styleId}/target-control/zero-blend/active-open-seam-refusal`);
      expected.add(`${styleId}/target-control/zero-blend/active-integral-symmetry-valid`);
    }
    const parameters = [
      ...Object.keys(schema.params),
      ...Object.keys(schema.advancedParams),
    ].sort();
    for (const parameter of parameters) {
      expected.add(`${styleId}/style/${parameter}/minimum`);
      expected.add(`${styleId}/style/${parameter}/maximum`);
    }
    for (let leftIndex = 0; leftIndex < parameters.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < parameters.length; rightIndex += 1) {
        for (const leftEndpoint of ['minimum', 'maximum']) {
          for (const rightEndpoint of ['minimum', 'maximum']) {
            expected.add(
              `${styleId}/style-pair/${parameters[leftIndex]}/${leftEndpoint}/${parameters[rightIndex]}/${rightEndpoint}`
            );
          }
        }
      }
    }
    for (const { key } of CERTIFIED_GEOMETRY_DOMAIN_ENTRIES) {
      expected.add(`${styleId}/geometry/${key}/minimum`);
      expected.add(`${styleId}/geometry/${key}/maximum`);
    }
    for (const scenario of [
      'geometry-relation/height/minimum-clearance-valid',
      'geometry-relation/height/raw-valid-f32-invalid-refusal',
      'geometry-relation/height/below-next-float-refusal',
      'geometry-relation/wall/previous-f32-strict-valid',
      'geometry-relation/wall/previous-f64-representation-refusal',
      'geometry-relation/wall/equality-refusal',
      'geometry-relation/drain/previous-f32-strict-valid',
      'geometry-relation/drain/previous-f64-representation-refusal',
      'geometry-relation/drain/equality-refusal',
      'geometry-relation/drain/topology-absent',
      'geometry-relation/drain/topology-present-next-float',
      'geometry-relation/drain/topology-present-supported-positive',
      'geometry-interaction/phase/nontrivial-180',
      'geometry-interaction/twist-phase/positive-1.25-at-180',
    ]) {
      expected.add(`${styleId}/${scenario}`);
    }
  }
  return expected;
}

const plan = buildCertificationMatrixPlan();

describe('G3 certification matrix plan', () => {
  it('enumerates every style default, control endpoint, within-style endpoint pair, and geometry endpoint', () => {
    const expected = expectedCaseIds();
    expect(new Set(plan.cases.map((matrixCase) => matrixCase.caseId))).toEqual(expected);
    expect(plan.cases).toHaveLength(expected.size);
    expect(STYLE_PARAMETER_LAYOUT_STYLE_COUNT).toBe('20');
    expect(STYLE_PARAMETER_LAYOUT_CONTROL_COUNT).toBe('174');
    expect(CERTIFIED_GEOMETRY_DOMAIN_ENTRIES).toHaveLength(13);
    expect(new Set(plan.cases.map((matrixCase) => matrixCase.sha256)).size).toBe(
      plan.cases.length
    );
  });

  it('records every relationally invalid boundary as an explicit preflight refusal', () => {
    const refusals = plan.cases.filter(
      (matrixCase) => matrixCase.preflight.kind === 'preflight-refusal'
    );
    const expectedRefusals = Object.keys(STYLE_CERTIFICATION_SCHEMA_SNAPSHOT)
      .flatMap((styleId) => [
        `${styleId}/geometry/r_drain/maximum`,
        `${styleId}/geometry-relation/height/raw-valid-f32-invalid-refusal`,
        `${styleId}/geometry-relation/height/below-next-float-refusal`,
        `${styleId}/geometry-relation/wall/previous-f64-representation-refusal`,
        `${styleId}/geometry-relation/wall/equality-refusal`,
        `${styleId}/geometry-relation/drain/previous-f64-representation-refusal`,
        `${styleId}/geometry-relation/drain/equality-refusal`,
        `${styleId}/geometry-relation/drain/topology-present-next-float`,
        `${styleId}/target-control/superformulaSeamBlendDegrees/positive-binary32-collapse`,
        ...(styleId === 'SuperformulaBlossom'
          ? [`${styleId}/target-control/zero-blend/active-open-seam-refusal`]
          : []),
      ])
      .sort();
    expect(refusals.map((matrixCase) => matrixCase.caseId).sort()).toEqual(expectedRefusals);
    for (const matrixCase of refusals) {
      expect(matrixCase.preflight.kind).toBe('preflight-refusal');
      if (matrixCase.preflight.kind !== 'preflight-refusal') continue;
      if (matrixCase.caseId.includes('/target-control/')) {
        expect(matrixCase.preflight.component).toBe('target-controls');
        expect(matrixCase.preflight.details.join(';')).toMatch(
          /(?:REPRESENTATION_VALIDITY_CHANGE|SUPERFORMULA_OPEN_SEAM):/
        );
      } else {
        expect(matrixCase.preflight.component).toBe('geometry');
        expect(matrixCase.preflight.details.join(';')).toMatch(
          /(?:RELATION_INVALID|REPRESENTATION_TOPOLOGY_CHANGE|REPRESENTATION_VALIDITY_CHANGE):/
        );
      }
    }
  });

  it('covers target-control endpoints, representation collapse, and Superformula seam regimes', () => {
    const byId = new Map(plan.cases.map((matrixCase) => [matrixCase.caseId, matrixCase]));
    for (const styleId of Object.keys(STYLE_CERTIFICATION_SCHEMA_SNAPSHOT)) {
      const minimum = byId.get(
        `${styleId}/target-control/superformulaSeamBlendDegrees/minimum`
      );
      const maximum = byId.get(
        `${styleId}/target-control/superformulaSeamBlendDegrees/maximum`
      );
      const collapse = byId.get(
        `${styleId}/target-control/superformulaSeamBlendDegrees/positive-binary32-collapse`
      );
      expect(minimum?.targetControls.superformulaSeamBlendDegrees).toBe(0);
      expect(maximum?.targetControls.superformulaSeamBlendDegrees).toBe(60);
      expect(minimum?.preflight.kind).toBe('canonical-input');
      expect(maximum?.preflight.kind).toBe('canonical-input');
      expect(collapse?.preflight.kind).toBe('preflight-refusal');
    }
    expect(
      byId.get('SuperformulaBlossom/target-control/zero-blend/active-open-seam-refusal')
        ?.preflight.kind
    ).toBe('preflight-refusal');
    expect(
      byId.get('SuperformulaBlossom/target-control/zero-blend/active-integral-symmetry-valid')
        ?.preflight.kind
    ).toBe('canonical-input');
  });

  it('hits coupled valid-envelope limits, their refusal side, drain topology, and twist-phase', () => {
    const byId = new Map(plan.cases.map((matrixCase) => [matrixCase.caseId, matrixCase]));
    const styleId = 'SuperformulaBlossom';
    const get = (suffix: string) => {
      const matrixCase = byId.get(`${styleId}/${suffix}`);
      expect(matrixCase).toBeDefined();
      if (matrixCase === undefined) throw new Error(`missing matrix case ${suffix}`);
      return matrixCase;
    };

    const heightValid = get('geometry-relation/height/minimum-clearance-valid');
    const heightRepresentationRefusal = get(
      'geometry-relation/height/raw-valid-f32-invalid-refusal'
    );
    const heightRefusal = get('geometry-relation/height/below-next-float-refusal');
    expect(heightValid.geometry.H).toBe(heightValid.geometry.t_bottom + 10);
    expect(heightValid.preflight.kind).toBe('canonical-input');
    expect(heightRepresentationRefusal.geometry.H).toBe(
      heightRepresentationRefusal.geometry.t_bottom + 10
    );
    expect(Math.fround(heightRepresentationRefusal.geometry.H)).toBeLessThan(
      Math.fround(Math.fround(heightRepresentationRefusal.geometry.t_bottom) + Math.fround(10))
    );
    expect(heightRepresentationRefusal.preflight.kind).toBe('preflight-refusal');
    expect(heightRefusal.geometry.H).toBeLessThan(heightRefusal.geometry.t_bottom + 10);
    expect(heightRefusal.preflight.kind).toBe('preflight-refusal');

    const wallValid = get('geometry-relation/wall/previous-f32-strict-valid');
    const wallRepresentationRefusal = get(
      'geometry-relation/wall/previous-f64-representation-refusal'
    );
    const wallRefusal = get('geometry-relation/wall/equality-refusal');
    const wallLimit = Math.min(wallValid.geometry.top_od, wallValid.geometry.bottom_od) / 2;
    expect(wallValid.geometry.t_wall).toBeLessThan(wallLimit);
    expect(Math.fround(wallValid.geometry.t_wall)).toBeLessThan(Math.fround(wallLimit));
    expect(wallValid.preflight.kind).toBe('canonical-input');
    expect(wallRepresentationRefusal.geometry.t_wall).toBeLessThan(wallLimit);
    expect(Math.fround(wallRepresentationRefusal.geometry.t_wall)).toBe(Math.fround(wallLimit));
    expect(wallRepresentationRefusal.preflight.kind).toBe('preflight-refusal');
    expect(wallRefusal.geometry.t_wall).toBe(
      Math.min(wallRefusal.geometry.top_od, wallRefusal.geometry.bottom_od) / 2
    );
    expect(wallRefusal.preflight.kind).toBe('preflight-refusal');

    const drainValid = get('geometry-relation/drain/previous-f32-strict-valid');
    const drainRepresentationRefusal = get(
      'geometry-relation/drain/previous-f64-representation-refusal'
    );
    const drainRefusal = get('geometry-relation/drain/equality-refusal');
    const drainLimit = drainValid.geometry.bottom_od / 2 - drainValid.geometry.t_wall;
    expect(drainValid.geometry.r_drain).toBeLessThan(drainLimit);
    expect(Math.fround(drainValid.geometry.r_drain)).toBeLessThan(Math.fround(drainLimit));
    expect(drainValid.preflight.kind).toBe('canonical-input');
    expect(drainRepresentationRefusal.geometry.r_drain).toBeLessThan(drainLimit);
    expect(Math.fround(drainRepresentationRefusal.geometry.r_drain)).toBe(
      Math.fround(drainLimit)
    );
    expect(drainRepresentationRefusal.preflight.kind).toBe('preflight-refusal');
    expect(drainRefusal.geometry.r_drain).toBe(
      drainRefusal.geometry.bottom_od / 2 - drainRefusal.geometry.t_wall
    );
    expect(drainRefusal.preflight.kind).toBe('preflight-refusal');

    const drainAbsent = get('geometry-relation/drain/topology-absent');
    const drainPresent = get('geometry-relation/drain/topology-present-next-float');
    const drainSupported = get(
      'geometry-relation/drain/topology-present-supported-positive'
    );
    expect(drainAbsent.geometry.r_drain).toBe(0);
    expect(drainPresent.geometry.r_drain).toBe(Number.MIN_VALUE);
    expect(drainPresent.geometry.r_drain).toBeGreaterThan(0);
    expect(Math.fround(drainPresent.geometry.r_drain)).toBe(0);
    expect(drainAbsent.preflight.kind).toBe('canonical-input');
    expect(drainPresent.preflight.kind).toBe('preflight-refusal');
    expect(drainSupported.geometry.r_drain).toBe(0.5);
    expect(Math.fround(drainSupported.geometry.r_drain)).toBeGreaterThan(0);
    expect(drainSupported.preflight.kind).toBe('canonical-input');

    const phase = get('geometry-interaction/phase/nontrivial-180');
    const twistPhase = get('geometry-interaction/twist-phase/positive-1.25-at-180');
    expect(phase.geometry.spinPhase).toBe(180);
    expect(phase.geometry.spinTurns).toBe(0);
    expect(twistPhase.geometry.spinPhase).toBe(180);
    expect(twistPhase.geometry.spinTurns).toBe(1.25);
  });

  it('is number-free, deterministic, immutable, and explicitly not execution evidence', { timeout: 30_000 }, () => {
    const rebuilt = buildCertificationMatrixPlan();
    expect(rebuilt.caseSequenceSha256).toBe(plan.caseSequenceSha256);
    expect(rebuilt.manifestSha256).toBe(plan.manifestSha256);
    expect(parseCanonicalCertificationJson(plan.manifestCanonicalJson).ok).toBe(true);
    expect(parseCanonicalCertificationJson(CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON).ok).toBe(
      true
    );
    expect(plan.certificationAllowed).toBe(false);
    expect(plan.status).toBe('plan-only-not-artifact-evidence');
    expect(plan.manifestCanonicalJson).toContain('"executionEvidenceSha256":null');
    expect(plan.manifestCanonicalJson).toContain(CERTIFICATION_MATRIX_COVERAGE_SPEC_SHA256);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.cases)).toBe(true);
    expect(Object.isFrozen(plan.cases[0])).toBe(true);
    for (const matrixCase of plan.cases) {
      expect(matrixCase.certificationAllowed).toBe(false);
      expect(matrixCase.status).toBe('plan-case-only-not-artifact-evidence');
      expect(parseCanonicalCertificationJson(matrixCase.canonicalJson).ok).toBe(true);
    }
  });

  it('commits seam proof stations and every base, drain, and feature-closure surface role', () => {
    for (const station of [
      'theta=0-one-sided',
      'theta=2pi-one-sided',
      'theta=0-minus',
      'theta=0-plus',
      'final-artifact-seam-edges',
    ]) {
      expect(CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON).toContain(station);
    }
    for (const role of [
      'outer-wall',
      'inner-wall',
      'top-rim',
      'bottom-top',
      'bottom-under',
      'drain-wall',
      'feature-curtain',
      'feature-side',
    ]) {
      expect(CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON).toContain(`"role":"${role}"`);
    }
    expect(CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON).toContain(
      'finiteMatrixImpliesInteriorCorrectness":false'
    );
    expect(CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON).toContain(
      'certified-preflight-must-refuse-binary32-topology-quantization'
    );
    expect(CERTIFICATION_MATRIX_COVERAGE_SPEC_CANONICAL_JSON).toContain(
      'nonzero-twist-times-phase-interaction'
    );
  });

  it('does not drift when mutable public defaults and schemas change after import', { timeout: 30_000 }, () => {
    const mutableBounds = GEOMETRY_BOUNDS as unknown as { H: { max: number } };
    const publicStyleMaximum = STYLE_REGISTRY.SuperformulaBlossom.params.sf_strength;
    const originalGeometryMaximum = mutableBounds.H.max;
    const originalDefaultHeight = DEFAULT_GEOMETRY.H;
    const originalStyleMaximum = publicStyleMaximum.max;
    try {
      mutableBounds.H.max = 1000;
      DEFAULT_GEOMETRY.H = 333;
      publicStyleMaximum.max = 1000;
      const rebuilt = buildCertificationMatrixPlan();
      expect(rebuilt.caseSequenceSha256).toBe(plan.caseSequenceSha256);
      expect(rebuilt.manifestSha256).toBe(plan.manifestSha256);
    } finally {
      mutableBounds.H.max = originalGeometryMaximum;
      DEFAULT_GEOMETRY.H = originalDefaultHeight;
      publicStyleMaximum.max = originalStyleMaximum;
    }
  });
});
