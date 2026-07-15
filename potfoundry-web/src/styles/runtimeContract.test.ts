import { describe, expect, it } from 'vitest';
import { buildAnalyticRadiusFn } from '../geometry/analyticRadius';
import { parseCanonicalCertificationJson } from '../geometry/targetSolid/canonicalCertificationJson';
import { buildStyleParamPayload, STYLE_PARAM_CAPACITY } from '../utils/styleParams';
import { STYLE_REGISTRY } from './registry';
import {
  materializeSharedStyleOptions,
  normalizeStylePayload,
  requireNormalizedStylePayload,
  resolveStyleId,
  StyleRuntimeContractError,
  STYLE_RUNTIME_SPEC_VERSION,
} from './runtimeContract';

function allSchemaEntries(styleName: string) {
  const config = STYLE_REGISTRY[styleName];
  return [...Object.entries(config.params), ...Object.entries(config.advancedParams ?? {})];
}

describe('strict style runtime contract', () => {
  it('covers all 20 styles and all 174 registered controls without fallback', () => {
    const styles = Object.keys(STYLE_REGISTRY);
    const controlCount = styles.reduce(
      (sum, styleName) => sum + allSchemaEntries(styleName).length,
      0
    );
    expect(styles).toHaveLength(20);
    expect(controlCount).toBe(174);

    for (const styleName of styles) {
      const result = normalizeStylePayload(styleName, {});
      expect(result.ok, styleName).toBe(true);
      if (!result.ok) continue;

      expect(result.value.specVersion).toBe(STYLE_RUNTIME_SPEC_VERSION);
      expect(Object.keys(result.value.wireOptions)).toHaveLength(
        allSchemaEntries(styleName).length
      );
      expect(result.value.gpuParams).toHaveLength(STYLE_PARAM_CAPACITY);
      expect(result.value.gpuParams.every(Number.isFinite)).toBe(true);
      expect(result.value.gpuParams[STYLE_PARAM_CAPACITY - 1]).toBe(result.value.styleIndex + 1);
      expect(result.value.certificationSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(parseCanonicalCertificationJson(result.value.certificationCanonicalJson).ok).toBe(
        true
      );

      for (const [wireKey, schema] of allSchemaEntries(styleName)) {
        expect(result.value.wireOptions[wireKey], `${styleName}.${wireKey}`).toBe(
          Number(schema.default)
        );
      }
    }
  });

  it('accepts every declared minimum/default/maximum and enforces integer types', () => {
    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      for (const [wireKey, schema] of allSchemaEntries(styleName)) {
        const values = [schema.min, schema.default, schema.max].filter(
          (value) => value !== undefined
        );
        for (const value of values) {
          const result = normalizeStylePayload(styleName, { [wireKey]: value });
          expect(result.ok, `${styleName}.${wireKey}=${String(value)}`).toBe(true);
        }

        if (schema.type === 'int') {
          const result = normalizeStylePayload(styleName, {
            [wireKey]: Number(schema.default) + 0.25,
          });
          expect(result.ok, `${styleName}.${wireKey} fractional`).toBe(false);
          if (!result.ok) {
            expect(
              result.errors.some((error) => error.code === 'INTEGER_PARAMETER_NON_INTEGRAL')
            ).toBe(true);
          }
        }
      }
    }
  });

  it('normalizes snake_case and camelCase aliases to byte-identical CPU/GPU payloads', () => {
    const snake = normalizeStylePayload('WaveInterference', {
      wi_feature_count: 1,
      wi_domain_warp: 0.65,
    });
    const camel = normalizeStylePayload('WaveInterference', {
      wiFeatureCount: 1,
      wiDomainWarp: 0.65,
    });
    expect(snake.ok).toBe(true);
    expect(camel.ok).toBe(true);
    if (!snake.ok || !camel.ok) return;

    expect(camel.value.wireOptions).toEqual(snake.value.wireOptions);
    expect(camel.value.cpuOptions).toEqual(snake.value.cpuOptions);
    expect(camel.value.gpuParams).toEqual(snake.value.gpuParams);
    expect(camel.value.canonicalJson).toBe(snake.value.canonicalJson);
    expect(camel.value.certificationCanonicalJson).toBe(
      snake.value.certificationCanonicalJson
    );
    expect(camel.value.certificationSha256).toBe(snake.value.certificationSha256);
    expect(camel.value.cpuOptions.wiFeatureCount).toBe(1);
    expect(camel.value.cpuOptions.wiDomainWarp).toBe(0.65);
  });

  it('materializes one validated object for GPU packing and continuous CPU truth', () => {
    const normalized = normalizeStylePayload('WaveInterference', {
      wi_feature_count: 2.25,
      wi_relief_depth: 7.5,
      wi_phase: 0.375,
    });
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;

    const shared = materializeSharedStyleOptions(normalized.value, {
      spinTurns: 0.25,
      bellAmp: 0.1,
    });
    expect(shared.wi_feature_count).toBe(2.25);
    expect(shared.wiFeatureCount).toBe(2.25);
    expect(shared.wi_relief_depth).toBe(7.5);
    expect(shared.wiReliefDepth).toBe(7.5);
    expect(shared.spinTurns).toBe(0.25);
    expect(shared.bellAmp).toBe(0.1);

    const [styleIndex, packed] = buildStyleParamPayload('WaveInterference', shared);
    expect(styleIndex).toBe(normalized.value.styleIndex);
    expect(packed.map(Math.fround)).toEqual(normalized.value.gpuParams);

    const sharedRadius = buildAnalyticRadiusFn('WaveInterference', shared, {
      H: 64,
      Rb: 40,
      Rt: 40,
    });
    const canonicalRadius = buildAnalyticRadiusFn(
      'WaveInterference',
      {
        ...normalized.value.cpuOptions,
        spinTurns: 0.25,
        bellAmp: 0.1,
      },
      { H: 64, Rb: 40, Rt: 40 }
    );
    expect(sharedRadius(1.234, 27)).toBe(canonicalRadius(1.234, 27));
  });

  it('proves every registered control reaches at least one GPU payload slot', () => {
    for (const styleName of Object.keys(STYLE_REGISTRY)) {
      const baseline = normalizeStylePayload(styleName, {});
      expect(baseline.ok, `${styleName} baseline`).toBe(true);
      if (!baseline.ok) continue;

      for (const [wireKey, schema] of allSchemaEntries(styleName)) {
        const defaultValue = Number(schema.default);
        const alternate =
          schema.type === 'bool'
            ? !Boolean(schema.default)
            : schema.max !== undefined && schema.max !== defaultValue
              ? schema.max
              : schema.min;
        expect(alternate, `${styleName}.${wireKey} needs two legal values`).not.toBeUndefined();

        const changed = normalizeStylePayload(styleName, { [wireKey]: alternate });
        expect(changed.ok, `${styleName}.${wireKey} alternate`).toBe(true);
        if (!changed.ok) continue;

        expect(
          changed.value.gpuParams.slice(0, STYLE_PARAM_CAPACITY - 1),
          `${styleName}.${wireKey} is declared but ignored by its GPU packer`
        ).not.toEqual(baseline.value.gpuParams.slice(0, STYLE_PARAM_CAPACITY - 1));
        expect(
          changed.value.certificationSha256,
          `${styleName}.${wireKey} must alter exact certification material`
        ).not.toBe(baseline.value.certificationSha256);
      }
    }
  });

  it('accepts equal dual aliases and rejects conflicting aliases', () => {
    const equal = normalizeStylePayload('DragonScales', {
      ds_scale_rows: 9,
      dsScaleRows: 9,
    });
    expect(equal.ok).toBe(true);

    const conflict = normalizeStylePayload('DragonScales', {
      ds_scale_rows: 9,
      dsScaleRows: 10,
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.errors.map((error) => error.code)).toContain('PARAMETER_ALIAS_CONFLICT');
    }
  });

  it.each([
    ['unknown style', 'NotAStyle', {}, 'UNKNOWN_STYLE'],
    ['unknown parameter', 'WaveInterference', { typo: 1 }, 'UNKNOWN_PARAMETER'],
    ['string value', 'WaveInterference', { wi_feature_count: '1' }, 'PARAMETER_TYPE'],
    [
      'non-finite value',
      'WaveInterference',
      { wi_feature_count: Number.NaN },
      'PARAMETER_NON_FINITE',
    ],
    ['out-of-range value', 'WaveInterference', { wi_feature_count: 999 }, 'PARAMETER_OUT_OF_RANGE'],
    ['inherited style name', 'toString', {}, 'UNKNOWN_STYLE'],
    ['constructor style name', 'constructor', {}, 'UNKNOWN_STYLE'],
    ['prototype style name', '__proto__', {}, 'UNKNOWN_STYLE'],
  ])('rejects %s', (_name, styleName, raw, code) => {
    const result = normalizeStylePayload(styleName, raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain(code);
  });

  it('produces stable canonical material independent of input key order', () => {
    const first = normalizeStylePayload('WaveInterference', {
      wi_phase: 0.25,
      wi_feature_count: 2,
    });
    const second = normalizeStylePayload('WaveInterference', {
      wiFeatureCount: 2,
      wiPhase: 0.25,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value.canonicalJson).toBe(second.value.canonicalJson);
    if (first.ok && second.ok) {
      expect(first.value.certificationCanonicalJson).toBe(
        second.value.certificationCanonicalJson
      );
      expect(first.value.certificationSha256).toBe(second.value.certificationSha256);
    }
  });

  it('canonicalizes signed zero and hashes the exact Float32 GPU payload', () => {
    const negativeZero = normalizeStylePayload('WaveInterference', { wi_phase: -0 });
    const positiveZero = normalizeStylePayload('WaveInterference', { wi_phase: 0 });
    expect(negativeZero.ok).toBe(true);
    expect(positiveZero.ok).toBe(true);
    if (!negativeZero.ok || !positiveZero.ok) return;

    expect(Object.is(negativeZero.value.wireOptions.wi_phase, -0)).toBe(false);
    expect(negativeZero.value.canonicalJson).toBe(positiveZero.value.canonicalJson);
    expect(negativeZero.value.certificationCanonicalJson).toBe(
      positiveZero.value.certificationCanonicalJson
    );
    expect(
      negativeZero.value.gpuParams.every((value) => Object.is(value, Math.fround(value)))
    ).toBe(true);
    expect(negativeZero.value.canonicalJson).toContain('potfoundry.style-params-48/v1');
    expect(negativeZero.value.canonicalJson).toContain(
      JSON.stringify(negativeZero.value.gpuParams)
    );
  });

  it('rejects arrays and custom-prototype payload objects', () => {
    const arrayResult = normalizeStylePayload(
      'WaveInterference',
      [] as unknown as Record<string, unknown>
    );
    const custom = Object.create({ wi_phase: 0.2 }) as Record<string, unknown>;
    const customResult = normalizeStylePayload('WaveInterference', custom);
    expect(arrayResult.ok).toBe(false);
    expect(customResult.ok).toBe(false);
    if (!arrayResult.ok) expect(arrayResult.errors[0].code).toBe('INVALID_PAYLOAD');
    if (!customResult.ok) expect(customResult.errors[0].code).toBe('INVALID_PAYLOAD');
  });

  it('throws a structured deterministic error for exception-based production callers', () => {
    expect(() =>
      requireNormalizedStylePayload('WaveInterference', {
        typo: 1,
        wi_feature_count: 999,
      })
    ).toThrowError(StyleRuntimeContractError);

    try {
      requireNormalizedStylePayload('WaveInterference', {
        typo: 1,
        wi_feature_count: 999,
      });
      throw new Error('expected strict normalization to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(StyleRuntimeContractError);
      const contractError = error as StyleRuntimeContractError;
      expect(contractError.styleName).toBe('WaveInterference');
      expect(contractError.errors.map((entry) => entry.code)).toEqual([
        'UNKNOWN_PARAMETER',
        'PARAMETER_OUT_OF_RANGE',
      ]);
      expect(contractError.message).toContain('wi_feature_count=999 is outside [0, 3]');
      expect(contractError.message).toContain("Parameter 'typo' is not declared");
    }
  });

  it('resolves canonical, display, and legacy snake style names without fallback', () => {
    expect(resolveStyleId('WaveInterference')).toBe('WaveInterference');
    expect(resolveStyleId('Wave Interference')).toBe('WaveInterference');
    expect(resolveStyleId('wave_interference')).toBe('WaveInterference');
    expect(resolveStyleId('toString')).toBeUndefined();
    expect(resolveStyleId('__proto__')).toBeUndefined();

    const canonical = requireNormalizedStylePayload('WaveInterference', { wi_phase: 0.25 });
    const display = requireNormalizedStylePayload('Wave Interference', { wi_phase: 0.25 });
    const legacy = requireNormalizedStylePayload('wave_interference', { wi_phase: 0.25 });
    expect(display.canonicalJson).toBe(canonical.canonicalJson);
    expect(legacy.canonicalJson).toBe(canonical.canonicalJson);
    expect(display.aliasesUsed).toContain('Wave Interference');
    expect(legacy.aliasesUsed).toContain('wave_interference');
  });

  it('rejects symbol, non-enumerable, and accessor option keys without invoking getters', () => {
    const symbolPayload = { wi_phase: 0.2, [Symbol('hidden')]: 1 };
    const nonEnumerablePayload = { wi_phase: 0.2 };
    Object.defineProperty(nonEnumerablePayload, 'hidden', { value: 1, enumerable: false });
    const accessorPayload = {};
    Object.defineProperty(accessorPayload, 'wi_phase', {
      enumerable: true,
      get: () => {
        throw new Error('normalization must not invoke accessors');
      },
    });

    for (const payload of [symbolPayload, nonEnumerablePayload, accessorPayload]) {
      expect(() =>
        normalizeStylePayload('WaveInterference', payload as Record<string, unknown>)
      ).not.toThrow();
      const result = normalizeStylePayload('WaveInterference', payload as Record<string, unknown>);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe('INVALID_PAYLOAD');
    }
  });

  it('snapshots data descriptors once and never rereads option values through a Proxy', () => {
    let valueReadCount = 0;
    const payload = new Proxy(
      { wi_phase: 0.2 },
      {
        get() {
          valueReadCount += 1;
          throw new Error('style normalization must use the snapshotted descriptor value');
        },
      }
    );

    const result = normalizeStylePayload('WaveInterference', payload);
    expect(result.ok).toBe(true);
    expect(valueReadCount).toBe(0);
    if (result.ok) expect(result.value.wireOptions.wi_phase).toBe(0.2);
  });
});
