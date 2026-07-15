import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { STYLE_REGISTRY } from '../../styles/registry';
import {
  canonicalTargetInputForProof,
  CanonicalTargetInputError,
  createCanonicalTargetInputBinding,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

describe('canonical target input binding', () => {
  it('binds defaults for every registered style to exact geometry and style payloads', () => {
    const bindings = Object.keys(STYLE_REGISTRY).map((styleName) =>
      createCanonicalTargetInputBinding(
        { ...DEFAULT_GEOMETRY },
        styleName,
        {},
        TARGET_CONTROLS
      )
    );

    expect(bindings).toHaveLength(20);
    expect(new Set(bindings.map((binding) => binding.canonicalInputSha256)).size).toBe(20);
    for (const binding of bindings) {
      expect(binding.canonicalInputSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(binding.styleCertificationPayloadSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(binding.certifiedGeometryPayloadSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.isFrozen(binding)).toBe(true);
      expect(canonicalTargetInputForProof(binding).canonicalInputSha256).toBe(
        binding.canonicalInputSha256
      );
    }
  });

  it('changes identity for exact geometry or style changes', () => {
    const base = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'WaveInterference',
      {},
      TARGET_CONTROLS
    );
    const geometryChanged = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY, bellAmp: Number.MIN_VALUE },
      'WaveInterference',
      {},
      TARGET_CONTROLS
    );
    const styleChanged = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'WaveInterference',
      { wi_phase: 0.31 },
      TARGET_CONTROLS
    );

    expect(geometryChanged.canonicalInputSha256).not.toBe(base.canonicalInputSha256);
    expect(styleChanged.canonicalInputSha256).not.toBe(base.canonicalInputSha256);
  });

  it('accepts deterministic style aliases but commits the canonical style id', () => {
    const canonical = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'WaveInterference',
      {},
      TARGET_CONTROLS
    );
    const legacy = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'wave_interference',
      {},
      TARGET_CONTROLS
    );
    expect(legacy.canonicalInputSha256).toBe(canonical.canonicalInputSha256);
    expect(legacy.style.styleId).toBe('WaveInterference');
  });

  it('rejects structural copies at the proof boundary', () => {
    const genuine = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'WaveInterference',
      {},
      TARGET_CONTROLS
    );
    const copy = Object.freeze({ ...genuine }) as CanonicalTargetInputBinding;
    expect(() => canonicalTargetInputForProof(copy)).toThrow(CanonicalTargetInputError);
  });

  it('fails closed on either invalid component', () => {
    expect(() =>
      createCanonicalTargetInputBinding(
        { ...DEFAULT_GEOMETRY, H: Number.NaN },
        'WaveInterference',
        {},
        TARGET_CONTROLS
      )
    ).toThrow(/geometry refused/i);
    expect(() =>
      createCanonicalTargetInputBinding(
        { ...DEFAULT_GEOMETRY },
        'WaveInterference',
        { typo: 1 },
        TARGET_CONTROLS
      )
    ).toThrow(/style refused/i);
    expect(() =>
      createCanonicalTargetInputBinding(
        { ...DEFAULT_GEOMETRY },
        'WaveInterference',
        {},
        { superformulaSeamBlendDegrees: Number.NaN }
      )
    ).toThrow(/target-controls refused/i);
  });

  it('binds geometry-affecting target controls and rejects an open active Superformula seam', () => {
    const base = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'SuperformulaBlossom',
      { sf_strength: 1 },
      TARGET_CONTROLS
    );
    const changed = createCanonicalTargetInputBinding(
      { ...DEFAULT_GEOMETRY },
      'SuperformulaBlossom',
      { sf_strength: 1 },
      { superformulaSeamBlendDegrees: 20 }
    );
    expect(changed.canonicalInputSha256).not.toBe(base.canonicalInputSha256);
    expect(base.certifiedTargetControlPayloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(() =>
      createCanonicalTargetInputBinding(
        { ...DEFAULT_GEOMETRY },
        'SuperformulaBlossom',
        { sf_strength: 1 },
        { superformulaSeamBlendDegrees: 0 }
      )
    ).toThrow(/open_seam/i);
    expect(() =>
      createCanonicalTargetInputBinding(
        { ...DEFAULT_GEOMETRY },
        'SuperformulaBlossom',
        { sf_strength: 1, sf_m_base: 8, sf_m_top: 8 },
        { superformulaSeamBlendDegrees: 0 }
      )
    ).not.toThrow();
  });
});
