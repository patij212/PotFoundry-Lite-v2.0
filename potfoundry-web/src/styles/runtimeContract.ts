import type { StyleId, StyleOptions } from '../geometry/types';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
} from '../geometry/targetSolid/canonicalCertificationJson';
import { buildStyleParamPayload, STYLE_PARAM_CAPACITY } from '../utils/styleParams';
import {
  STYLE_CERTIFICATION_SCHEMA_SNAPSHOT,
  type CertificationParamSchema,
} from './certificationSchemaSnapshot';
import { STYLE_GPU_DISPATCH_MANIFEST } from './gpuLayoutContract';
import { STYLE_REGISTRY } from './registry';
import { STYLE_GPU_LAYOUT_VERSION, STYLE_RUNTIME_SPEC_VERSION } from './styleContractVersions';
import { STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256 } from './styleEvaluatorSourceContract';
import { STYLE_PARAMETER_LAYOUT_SPEC_SHA256 } from './styleParameterLayoutSpec';

export { STYLE_GPU_LAYOUT_VERSION, STYLE_RUNTIME_SPEC_VERSION } from './styleContractVersions';

export const STYLE_CERTIFICATION_PAYLOAD_VERSION =
  'potfoundry.style-certification-payload/v1' as const;

/**
 * Versioned, strict boundary between user/state style values and every geometry
 * evaluator. This is additive until the production callers can be migrated
 * after their CRITICAL GitNexus impact review.
 */
export type StyleRuntimeErrorCode =
  | 'INVALID_PAYLOAD'
  | 'UNKNOWN_STYLE'
  | 'UNKNOWN_PARAMETER'
  | 'REGISTRY_ALIAS_COLLISION'
  | 'PARAMETER_ALIAS_CONFLICT'
  | 'PARAMETER_TYPE'
  | 'PARAMETER_NON_FINITE'
  | 'PARAMETER_OUT_OF_RANGE'
  | 'INTEGER_PARAMETER_NON_INTEGRAL'
  | 'PACKED_PAYLOAD_INVALID';

export interface StyleRuntimeError {
  code: StyleRuntimeErrorCode;
  message: string;
  key?: string;
}

export interface NormalizedStylePayload {
  specVersion: typeof STYLE_RUNTIME_SPEC_VERSION;
  styleId: StyleId;
  styleIndex: number;
  /** Registry/state names. These are the only keys sent to the GPU packer. */
  wireOptions: Readonly<Record<string, number>>;
  /** Canonical CPU evaluator names (snake_case converted to camelCase). */
  cpuOptions: Readonly<Record<string, number>>;
  /** Exact 48-slot WGSL payload, including the active-style sentinel. */
  gpuParams: readonly number[];
  /** Deterministic material that a certificate producer must SHA-256. */
  canonicalJson: string;
  /** Number-free exact IEEE payload for certificate and target hashing. */
  certificationCanonicalJson: string;
  /** Domain-separated SHA-256 of certificationCanonicalJson semantics. */
  certificationSha256: string;
  aliasesUsed: readonly string[];
}

export type NormalizeStylePayloadResult =
  | { ok: true; value: NormalizedStylePayload }
  | { ok: false; errors: readonly StyleRuntimeError[] };

/**
 * Materialize the one option object still required by the mixed production
 * pipeline. GPU packers read registry/wire keys while continuous CPU truth
 * evaluators read camelCase keys; both views come from the same validated
 * payload so they cannot silently diverge.
 */
export function materializeSharedStyleOptions(
  normalized: NormalizedStylePayload,
  globalOptions: Readonly<StyleOptions> = {}
): StyleOptions {
  return {
    ...globalOptions,
    ...normalized.wireOptions,
    ...normalized.cpuOptions,
  };
}

export class StyleRuntimeContractError extends Error {
  readonly styleName: string;
  readonly errors: readonly StyleRuntimeError[];

  constructor(styleName: string, errors: readonly StyleRuntimeError[]) {
    const details = errors.map((error) => `${error.code}: ${error.message}`).join('; ');
    super(`[style-runtime] ${styleName} options rejected: ${details}`);
    this.name = 'StyleRuntimeContractError';
    this.styleName = styleName;
    this.errors = Object.freeze([...errors]);
  }
}

function canonicalStyleSnakeAlias(styleId: string): string {
  return styleId.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** Resolve only the canonical key, registry display name, or deterministic legacy snake alias. */
export function resolveStyleId(styleName: string): StyleId | undefined {
  if (Object.prototype.hasOwnProperty.call(STYLE_REGISTRY, styleName)) {
    return styleName as StyleId;
  }
  for (const [candidate, config] of Object.entries(STYLE_REGISTRY)) {
    if (styleName === config.name || styleName === canonicalStyleSnakeAlias(candidate)) {
      return candidate as StyleId;
    }
  }
  return undefined;
}

/** Strict throwing adapter for production paths that already report failures through exceptions. */
export function requireNormalizedStylePayload(
  styleName: string,
  raw: Readonly<Record<string, unknown>> | null | undefined
): NormalizedStylePayload {
  const styleId = resolveStyleId(styleName) ?? styleName;
  const result = normalizeStylePayload(styleId, raw);
  if (result.ok) {
    if (styleId === styleName) return result.value;
    return {
      ...result.value,
      aliasesUsed: Object.freeze([...new Set([styleName, ...result.value.aliasesUsed])].sort()),
    };
  }
  throw new StyleRuntimeContractError(styleName, result.errors);
}

interface SchemaEntry {
  wireKey: string;
  cpuKey: string;
  schema: CertificationParamSchema;
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function parameterEntries(styleName: string): SchemaEntry[] {
  const config = Object.prototype.hasOwnProperty.call(
    STYLE_CERTIFICATION_SCHEMA_SNAPSHOT,
    styleName
  )
    ? STYLE_CERTIFICATION_SCHEMA_SNAPSHOT[styleName]
    : undefined;
  if (!config) return [];

  const entries = [
    ...Object.entries(config.params),
    ...Object.entries(config.advancedParams),
  ] as Array<[string, CertificationParamSchema]>;

  return entries.map(([wireKey, schema]) => ({
    wireKey,
    cpuKey: snakeToCamel(wireKey),
    schema,
  }));
}

function comparableNumber(schema: CertificationParamSchema, value: unknown): number | null {
  if (schema.type === 'bool') {
    return typeof value === 'boolean' ? (value ? 1 : 0) : null;
  }
  return typeof value === 'number' ? value : null;
}

function sortErrors(errors: StyleRuntimeError[]): StyleRuntimeError[] {
  return errors.sort(
    (a, b) =>
      compareCodeUnits(a.key ?? '', b.key ?? '') ||
      compareCodeUnits(a.code, b.code) ||
      compareCodeUnits(a.message, b.message)
  );
}

/** Locale-independent ordering for certificate material. */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const float64Bytes = new Uint8Array(8);
const float64View = new DataView(float64Bytes.buffer);
const float32Bytes = new Uint8Array(4);
const float32View = new DataView(float32Bytes.buffer);

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function exactFloat64Hex(value: number): string {
  float64View.setFloat64(0, value, false);
  return `ieee754-binary64:${bytesToHex(float64Bytes)}`;
}

function exactFloat32Hex(value: number): string {
  float32View.setFloat32(0, value, false);
  return `ieee754-binary32:${bytesToHex(float32Bytes)}`;
}

/**
 * Normalize and validate one style payload without fallback, clamping, or
 * substitution. Registry keys define the serialized/wire contract; camelCase
 * aliases exist only so the CPU evaluator can consume the identical values.
 */
export function normalizeStylePayload(
  styleName: string,
  raw: Readonly<Record<string, unknown>> | null | undefined
): NormalizeStylePayloadResult {
  const config = Object.prototype.hasOwnProperty.call(
    STYLE_CERTIFICATION_SCHEMA_SNAPSHOT,
    styleName
  )
    ? STYLE_CERTIFICATION_SCHEMA_SNAPSHOT[styleName]
    : undefined;
  if (!config) {
    return {
      ok: false,
      errors: [
        {
          code: 'UNKNOWN_STYLE',
          key: styleName,
          message: `Unknown style '${styleName}'; strict geometry evaluation never falls back`,
        },
      ],
    };
  }

  if (raw !== null && raw !== undefined && (typeof raw !== 'object' || Array.isArray(raw))) {
    return {
      ok: false,
      errors: [
        { code: 'INVALID_PAYLOAD', message: 'Style options must be a plain key/value object' },
      ],
    };
  }
  const rawSnapshot: Record<string, unknown> = {};
  if (raw !== null && raw !== undefined) {
    let prototype: object | null;
    let ownKeys: readonly PropertyKey[];
    try {
      prototype = Object.getPrototypeOf(raw);
      ownKeys = Reflect.ownKeys(raw);
    } catch {
      return {
        ok: false,
        errors: [
          { code: 'INVALID_PAYLOAD', message: 'Style options could not be inspected safely' },
        ],
      };
    }
    if (prototype !== Object.prototype && prototype !== null) {
      return {
        ok: false,
        errors: [
          { code: 'INVALID_PAYLOAD', message: 'Style options must not have a custom prototype' },
        ],
      };
    }
    for (const key of ownKeys) {
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(raw, key);
      } catch {
        return {
          ok: false,
          errors: [
            { code: 'INVALID_PAYLOAD', message: 'Style option could not be inspected safely' },
          ],
        };
      }
      if (typeof key !== 'string' || descriptor?.enumerable !== true || !('value' in descriptor)) {
        return {
          ok: false,
          errors: [
            {
              code: 'INVALID_PAYLOAD',
              message: 'Style options must contain only enumerable string-valued data properties',
            },
          ],
        };
      }
      rawSnapshot[key] = descriptor.value;
    }
  }

  const entries = parameterEntries(styleName);
  const errors: StyleRuntimeError[] = [];
  const aliasToWire = new Map<string, string>();
  const entryByWire = new Map(entries.map((entry) => [entry.wireKey, entry]));

  for (const entry of entries) {
    for (const alias of new Set([entry.wireKey, entry.cpuKey])) {
      const existing = aliasToWire.get(alias);
      if (existing && existing !== entry.wireKey) {
        errors.push({
          code: 'REGISTRY_ALIAS_COLLISION',
          key: alias,
          message: `Alias '${alias}' maps to both '${existing}' and '${entry.wireKey}'`,
        });
      } else {
        aliasToWire.set(alias, entry.wireKey);
      }
    }
  }

  const provided = new Map<string, Array<{ alias: string; value: unknown }>>();
  for (const key of Object.keys(rawSnapshot).sort()) {
    const wireKey = aliasToWire.get(key);
    if (!wireKey) {
      errors.push({
        code: 'UNKNOWN_PARAMETER',
        key,
        message: `Parameter '${key}' is not declared by ${styleName}`,
      });
      continue;
    }
    const bucket = provided.get(wireKey) ?? [];
    bucket.push({ alias: key, value: rawSnapshot[key] });
    provided.set(wireKey, bucket);
  }

  const wireOptions: Record<string, number> = {};
  const cpuOptions: Record<string, number> = {};
  const aliasesUsed: string[] = [];

  for (const entry of entries) {
    const candidates = provided.get(entry.wireKey) ?? [];
    const sourceValues =
      candidates.length > 0 ? candidates : [{ alias: entry.wireKey, value: entry.schema.default }];
    const normalized: number[] = [];

    for (const source of sourceValues) {
      const value = comparableNumber(entry.schema, source.value);
      if (value === null) {
        errors.push({
          code: 'PARAMETER_TYPE',
          key: source.alias,
          message: `${source.alias} must be ${entry.schema.type === 'bool' ? 'boolean' : 'numeric'}`,
        });
        continue;
      }
      if (!Number.isFinite(value)) {
        errors.push({
          code: 'PARAMETER_NON_FINITE',
          key: source.alias,
          message: `${source.alias} must be finite`,
        });
        continue;
      }
      if (entry.schema.type === 'int' && !Number.isInteger(value)) {
        errors.push({
          code: 'INTEGER_PARAMETER_NON_INTEGRAL',
          key: source.alias,
          message: `${source.alias} must be an integer`,
        });
      }
      if (
        (entry.schema.min !== undefined && value < entry.schema.min) ||
        (entry.schema.max !== undefined && value > entry.schema.max)
      ) {
        errors.push({
          code: 'PARAMETER_OUT_OF_RANGE',
          key: source.alias,
          message: `${source.alias}=${value} is outside [${entry.schema.min ?? '-inf'}, ${entry.schema.max ?? 'inf'}]`,
        });
      }
      normalized.push(Object.is(value, -0) ? 0 : value);
      if (source.alias !== entry.wireKey) aliasesUsed.push(source.alias);
    }

    if (normalized.length > 1 && normalized.some((value) => !Object.is(value, normalized[0]))) {
      errors.push({
        code: 'PARAMETER_ALIAS_CONFLICT',
        key: entry.wireKey,
        message: `Conflicting aliases were supplied for '${entry.wireKey}'`,
      });
    }

    if (normalized.length > 0) {
      wireOptions[entry.wireKey] = normalized[0];
      cpuOptions[entry.cpuKey] = normalized[0];
    }
  }

  if (errors.length > 0) return { ok: false, errors: sortErrors(errors) };

  // The strict boundary materializes EVERY declared option before invoking the
  // legacy packer. Independent packer defaults therefore cannot alter truth.
  const [styleIndex, packedParams] = buildStyleParamPayload(styleName, wireOptions);
  const gpuParams = packedParams.map(Math.fround);
  const expectedStyleIndex =
    STYLE_GPU_DISPATCH_MANIFEST[styleName as keyof typeof STYLE_GPU_DISPATCH_MANIFEST];
  const packedValid =
    config.id === expectedStyleIndex &&
    styleIndex === expectedStyleIndex &&
    gpuParams.length === STYLE_PARAM_CAPACITY &&
    gpuParams.every(Number.isFinite) &&
    gpuParams[STYLE_PARAM_CAPACITY - 1] === expectedStyleIndex + 1;
  if (!packedValid) {
    return {
      ok: false,
      errors: [
        {
          code: 'PACKED_PAYLOAD_INVALID',
          message: `${styleName} did not produce committed dispatch ${expectedStyleIndex} with a finite ${STYLE_PARAM_CAPACITY}-slot payload and expected sentinel`,
        },
      ],
    };
  }

  // Assert the registry did not change under us between extraction and packing.
  for (const wireKey of Object.keys(wireOptions)) {
    if (!entryByWire.has(wireKey)) {
      return {
        ok: false,
        errors: [
          {
            code: 'PACKED_PAYLOAD_INVALID',
            key: wireKey,
            message: 'Registry changed during normalization',
          },
        ],
      };
    }
  }

  const sortedWireOptions = Object.fromEntries(
    Object.entries(wireOptions).sort(([a], [b]) => compareCodeUnits(a, b))
  );
  const sortedCpuOptions = Object.fromEntries(
    Object.entries(cpuOptions).sort(([a], [b]) => compareCodeUnits(a, b))
  );
  const styleId = styleName as StyleId;
  const canonicalJson = JSON.stringify({
    specVersion: STYLE_RUNTIME_SPEC_VERSION,
    gpuLayoutVersion: STYLE_GPU_LAYOUT_VERSION,
    styleId,
    wireOptions: sortedWireOptions,
    gpuParams,
  });
  const certificationCanonicalJson = canonicalizeCertificationJson({
    gpuLayoutVersion: STYLE_GPU_LAYOUT_VERSION,
    gpuParamsExact: gpuParams.map(exactFloat32Hex),
    payloadVersion: STYLE_CERTIFICATION_PAYLOAD_VERSION,
    specVersion: STYLE_RUNTIME_SPEC_VERSION,
    styleEvaluatorSourceContractSha256: STYLE_EVALUATOR_SOURCE_CONTRACT_SHA256,
    styleParameterLayoutSpecSha256: STYLE_PARAMETER_LAYOUT_SPEC_SHA256,
    styleId,
    styleIndex: styleIndex.toString(),
    wireOptionsExact: Object.fromEntries(
      Object.entries(sortedWireOptions).map(([key, value]) => [key, exactFloat64Hex(value)])
    ),
  });
  const certificationSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.style-runtime/certification-payload/v1',
    JSON.parse(certificationCanonicalJson) as unknown
  );

  return {
    ok: true,
    value: {
      specVersion: STYLE_RUNTIME_SPEC_VERSION,
      styleId,
      styleIndex,
      wireOptions: Object.freeze(sortedWireOptions),
      cpuOptions: Object.freeze(sortedCpuOptions),
      gpuParams: Object.freeze([...gpuParams]),
      canonicalJson,
      certificationCanonicalJson,
      certificationSha256,
      aliasesUsed: Object.freeze([...new Set(aliasesUsed)].sort()),
    },
  };
}
