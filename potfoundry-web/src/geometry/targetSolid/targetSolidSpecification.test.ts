import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY, GEOMETRY_BOUNDS } from '../../state/types';
import { parseCanonicalCertificationJson } from './canonicalCertificationJson';
import {
  normalizeCertifiedGeometryPayload,
  normalizeCertifiedTargetControlPayload,
  TARGET_SOLID_SPECIFICATION_CANONICAL_JSON,
  TARGET_SOLID_SPECIFICATION_SHA256,
} from './targetSolidSpecification';

function previousFloat64(value: number): number {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, false);
  view.setBigUint64(0, view.getBigUint64(0, false) - 1n, false);
  return view.getFloat64(0, false);
}

function previousFloat32(value: number): number {
  const bytes = new ArrayBuffer(4);
  const view = new DataView(bytes);
  view.setFloat32(0, value, false);
  view.setUint32(0, view.getUint32(0, false) - 1, false);
  return view.getFloat32(0, false);
}

describe('G0 target-solid specification', () => {
  it('binds all 13 geometry inputs and their GPU conversions without JSON numbers', () => {
    const result = normalizeCertifiedGeometryPayload({ ...DEFAULT_GEOMETRY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed = parseCanonicalCertificationJson(result.value.canonicalJson);
    expect(parsed.ok).toBe(true);
    expect(result.value.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.value.canonicalJson).toContain('ieee754-binary64:');
    expect(result.value.canonicalJson).toContain('ieee754-binary32:');
    expect(result.value.canonicalJson).toContain(TARGET_SOLID_SPECIFICATION_SHA256);
    expect(Object.isFrozen(result.value.geometry)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  it('changes the target input identity even below one binary32 step', () => {
    const base = normalizeCertifiedGeometryPayload({ ...DEFAULT_GEOMETRY });
    const changed = normalizeCertifiedGeometryPayload({
      ...DEFAULT_GEOMETRY,
      bellAmp: Number.MIN_VALUE,
    });
    expect(base.ok && changed.ok).toBe(true);
    if (!base.ok || !changed.ok) return;
    expect(base.value.sha256).not.toBe(changed.value.sha256);
  });

  it('binds the Superformula seam blend as geometry-affecting target data', () => {
    const base = normalizeCertifiedTargetControlPayload({
      superformulaSeamBlendDegrees: 30,
    });
    const changed = normalizeCertifiedTargetControlPayload({
      superformulaSeamBlendDegrees: 30 + Number.EPSILON * 16,
    });
    expect(base.ok && changed.ok).toBe(true);
    if (!base.ok || !changed.ok) return;
    expect(base.value.sha256).not.toBe(changed.value.sha256);
    expect(base.value.canonicalJson).toContain('ieee754-binary64:');
    expect(base.value.canonicalJson).toContain('ieee754-binary32:');
    expect(base.value.canonicalJson).toContain(TARGET_SOLID_SPECIFICATION_SHA256);
    expect(Object.isFrozen(base.value.controls)).toBe(true);
  });

  it.each([
    [{}, 'MISSING_PARAMETER'],
    [{ superformulaSeamBlendDegrees: 30, typo: 1 }, 'UNKNOWN_PARAMETER'],
    [{ superformulaSeamBlendDegrees: Number.NaN }, 'PARAMETER_NON_FINITE'],
    [{ superformulaSeamBlendDegrees: 61 }, 'PARAMETER_OUT_OF_RANGE'],
    [{ superformulaSeamBlendDegrees: Number.MIN_VALUE }, 'REPRESENTATION_VALIDITY_CHANGE'],
  ])('refuses invalid target controls without fallback: %o', (value, code) => {
    const result = normalizeCertifiedTargetControlPayload(value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain(code);
  });

  it('refuses target-control accessors without invoking them', () => {
    let invoked = false;
    const value: Record<string, unknown> = {};
    Object.defineProperty(value, 'superformulaSeamBlendDegrees', {
      enumerable: true,
      get() {
        invoked = true;
        return 30;
      },
    });
    const result = normalizeCertifiedTargetControlPayload(value);
    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
  });

  it.each([
    ['missing', (() => {
      const value = { ...DEFAULT_GEOMETRY } as Record<string, unknown>;
      delete value.spinCurve;
      return value;
    })(), 'MISSING_PARAMETER'],
    ['unknown', { ...DEFAULT_GEOMETRY, secretDefault: 1 }, 'UNKNOWN_PARAMETER'],
    ['nonfinite', { ...DEFAULT_GEOMETRY, H: Number.POSITIVE_INFINITY }, 'PARAMETER_NON_FINITE'],
    ['out-of-range', { ...DEFAULT_GEOMETRY, spinTurns: 4 }, 'PARAMETER_OUT_OF_RANGE'],
    [
      'topology-changing binary32 conversion',
      { ...DEFAULT_GEOMETRY, r_drain: Number.MIN_VALUE },
      'REPRESENTATION_TOPOLOGY_CHANGE',
    ],
    [
      'wall relation changed by binary32 conversion',
      {
        ...DEFAULT_GEOMETRY,
        top_od: 40,
        bottom_od: 40,
        t_wall: previousFloat64(20),
        r_drain: 0,
      },
      'REPRESENTATION_VALIDITY_CHANGE',
    ],
    [
      'drain relation changed by binary32 conversion',
      {
        ...DEFAULT_GEOMETRY,
        bottom_od: 100,
        t_wall: 20,
        r_drain: previousFloat64(30),
      },
      'REPRESENTATION_VALIDITY_CHANGE',
    ],
    ['relation', { ...DEFAULT_GEOMETRY, bottom_od: 30, t_wall: 15 }, 'RELATION_INVALID'],
  ])('refuses %s geometry instead of clamping or defaulting', (_label, value, code) => {
    const result = normalizeCertifiedGeometryPayload(value);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain(code);
  });

  it('refuses accessors without invoking them', () => {
    let invoked = false;
    const value = { ...DEFAULT_GEOMETRY } as Record<string, unknown>;
    Object.defineProperty(value, 'H', {
      enumerable: true,
      get() {
        invoked = true;
        return 120;
      },
    });
    const result = normalizeCertifiedGeometryPayload(value);
    expect(result.ok).toBe(false);
    expect(invoked).toBe(false);
  });

  it('accepts the nearest binary32 values on the valid side of wall and drain limits', () => {
    const wall = normalizeCertifiedGeometryPayload({
      ...DEFAULT_GEOMETRY,
      top_od: 40,
      bottom_od: 40,
      t_wall: previousFloat32(20),
      r_drain: 0,
    });
    const drain = normalizeCertifiedGeometryPayload({
      ...DEFAULT_GEOMETRY,
      bottom_od: 100,
      t_wall: 20,
      r_drain: previousFloat32(30),
    });
    expect(wall.ok).toBe(true);
    expect(drain.ok).toBe(true);
  });

  it('refuses raw-valid height equality when binary32 clearance becomes invalid', () => {
    const tBottom = 10.000002384185793;
    const H = tBottom + 10;
    expect(H).toBe(tBottom + 10);
    expect(Math.fround(H)).toBeLessThan(
      Math.fround(Math.fround(tBottom) + Math.fround(10))
    );
    const result = normalizeCertifiedGeometryPayload({ ...DEFAULT_GEOMETRY, H, t_bottom: tBottom });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.code)).toContain(
      'REPRESENTATION_VALIDITY_CHANGE'
    );
  });

  it('cannot splice mutated public geometry bounds beneath the original policy hash', () => {
    const mutableBounds = GEOMETRY_BOUNDS as unknown as { H: { max: number } };
    const originalMaximum = mutableBounds.H.max;
    const policySha256 = TARGET_SOLID_SPECIFICATION_SHA256;
    try {
      mutableBounds.H.max = 1000;
      const result = normalizeCertifiedGeometryPayload({ ...DEFAULT_GEOMETRY, H: 600 });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.map((error) => error.code)).toContain('PARAMETER_OUT_OF_RANGE');
      expect(TARGET_SOLID_SPECIFICATION_SHA256).toBe(policySha256);
    } finally {
      mutableBounds.H.max = originalMaximum;
    }
  });

  it('publishes a number-free hashed policy with explicit curtains and fail-closed resources', () => {
    const parsed = parseCanonicalCertificationJson(TARGET_SOLID_SPECIFICATION_CANONICAL_JSON);
    expect(parsed.ok).toBe(true);
    expect(TARGET_SOLID_SPECIFICATION_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(TARGET_SOLID_SPECIFICATION_CANONICAL_JSON).toContain(
      'explicit-feature-curtain-or-side-patches'
    );
    expect(TARGET_SOLID_SPECIFICATION_CANONICAL_JSON).toContain(
      'triangleBudgetMayRelaxTolerance'
    );
    expect(TARGET_SOLID_SPECIFICATION_CANONICAL_JSON).toContain('geometryInputValidation');
    expect(TARGET_SOLID_SPECIFICATION_CANONICAL_JSON).toContain(
      'targetControlInputValidation'
    );
    expect(TARGET_SOLID_SPECIFICATION_CANONICAL_JSON).toContain(
      't_wall<min(top_od,bottom_od)/2'
    );
    expect(TARGET_SOLID_SPECIFICATION_CANONICAL_JSON).toContain('representationValidity');
  });
});
