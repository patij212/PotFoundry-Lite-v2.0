import { describe, expect, it } from 'vitest';

import adaptiveMeshWgsl from '../assets/shaders/adaptive_mesh.wgsl?raw';
import stylesWgsl from '../assets/shaders/styles.wgsl?raw';
import profileSource from '../geometry/profile.ts?raw';
import stylesSource from '../geometry/styles.ts?raw';
import { parseCanonicalCertificationJson } from '../geometry/targetSolid/canonicalCertificationJson';
import { sha256Utf8 } from '../geometry/targetSolid/incrementalSha256';
import surfaceEvaluatorSource from '../renderers/webgpu/parametric/SurfaceEvaluator.ts?raw';
import styleParamsSource from '../utils/styleParams.ts?raw';
import { normalizeStylePayload } from './runtimeContract';
import {
  STYLE_EVALUATOR_SOURCE_CONTRACT_CANONICAL_JSON,
  STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256,
  STYLE_EVALUATOR_SOURCE_SHA256,
} from './styleEvaluatorSourceContract';

describe('style evaluator source contract', () => {
  it('pins every production source that participates in CPU/GPU style surface truth', () => {
    expect(sha256Utf8(stylesSource)).toBe(STYLE_EVALUATOR_SOURCE_SHA256.cpuStyles);
    expect(sha256Utf8(stylesWgsl)).toBe(STYLE_EVALUATOR_SOURCE_SHA256.gpuStylesWgsl);
    expect(sha256Utf8(styleParamsSource)).toBe(
      STYLE_EVALUATOR_SOURCE_SHA256.styleParameterPacker
    );
    expect(sha256Utf8(profileSource)).toBe(STYLE_EVALUATOR_SOURCE_SHA256.cpuProfile);
    expect(sha256Utf8(adaptiveMeshWgsl)).toBe(
      STYLE_EVALUATOR_SOURCE_SHA256.adaptiveMeshWgsl
    );
    expect(sha256Utf8(surfaceEvaluatorSource)).toBe(
      STYLE_EVALUATOR_SOURCE_SHA256.gpuSurfaceEvaluator
    );
    expect(parseCanonicalCertificationJson(STYLE_EVALUATOR_SOURCE_CONTRACT_CANONICAL_JSON).ok).toBe(
      true
    );
    expect(STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('binds normalized style evidence to the exact reviewed evaluator sources', () => {
    const normalized = normalizeStylePayload('WaveInterference', {});
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.value.certificationCanonicalJson).toContain(
      STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256
    );
  });
});

