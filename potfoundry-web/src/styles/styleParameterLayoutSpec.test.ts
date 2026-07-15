import { describe, expect, it } from 'vitest';

import { parseCanonicalCertificationJson } from '../geometry/targetSolid/canonicalCertificationJson';
import { STYLE_REGISTRY } from './registry';
import { normalizeStylePayload } from './runtimeContract';
import {
  STYLE_PARAMETER_LAYOUT_CONTROL_COUNT,
  STYLE_PARAMETER_LAYOUT_SPEC_CANONICAL_JSON,
  STYLE_PARAMETER_LAYOUT_SPEC_SHA256,
  STYLE_PARAMETER_LAYOUT_STYLE_COUNT,
} from './styleParameterLayoutSpec';

describe('style parameter/layout specification', () => {
  it('publishes one number-free hash for all styles, controls, aliases, and GPU slots', () => {
    expect(parseCanonicalCertificationJson(STYLE_PARAMETER_LAYOUT_SPEC_CANONICAL_JSON).ok).toBe(
      true
    );
    expect(STYLE_PARAMETER_LAYOUT_SPEC_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(STYLE_PARAMETER_LAYOUT_SPEC_CANONICAL_JSON).toContain(
      `"controlCount":"${STYLE_PARAMETER_LAYOUT_CONTROL_COUNT}"`
    );
    expect(STYLE_PARAMETER_LAYOUT_SPEC_CANONICAL_JSON).toContain(
      `"styleCount":"${STYLE_PARAMETER_LAYOUT_STYLE_COUNT}"`
    );
    expect(STYLE_PARAMETER_LAYOUT_SPEC_CANONICAL_JSON).toContain(
      'ieee754-binary64:'
    );
  });

  it('binds every normalized style payload to the exact layout specification', () => {
    const normalized = normalizeStylePayload('WaveInterference', {});
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.value.certificationCanonicalJson).toContain(
      STYLE_PARAMETER_LAYOUT_SPEC_SHA256
    );
  });

  it('cannot splice a mutated public style range beneath the original layout hash', () => {
    const schema = STYLE_REGISTRY.SuperformulaBlossom.params.sf_strength;
    const originalMaximum = schema.max;
    const layoutSha256 = STYLE_PARAMETER_LAYOUT_SPEC_SHA256;
    try {
      schema.max = 1000;
      const normalized = normalizeStylePayload('SuperformulaBlossom', {
        sf_strength: 100,
      });
      expect(normalized.ok).toBe(false);
      if (normalized.ok) return;
      expect(normalized.errors.map((error) => error.code)).toContain('PARAMETER_OUT_OF_RANGE');
      expect(STYLE_PARAMETER_LAYOUT_SPEC_SHA256).toBe(layoutSha256);
    } finally {
      schema.max = originalMaximum;
    }
  });
});
