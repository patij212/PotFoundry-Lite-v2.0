import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from '../geometry/targetSolid/canonicalCertificationJson';
import {
  STYLE_GPU_DISPATCH_MANIFEST,
  STYLE_GPU_LAYOUT_MANIFEST,
  STYLE_GPU_SENTINEL_SPEC,
  STYLE_GPU_TRANSFORM_SPEC,
  type GpuParameterBinding,
} from './gpuLayoutContract';
import {
  STYLE_CERTIFICATION_SCHEMA_SNAPSHOT,
  type CertificationParamSchema,
} from './certificationSchemaSnapshot';
import {
  STYLE_DEFAULT_MIGRATION_VERSION,
  STYLE_GPU_LAYOUT_VERSION,
  STYLE_RUNTIME_SPEC_VERSION,
} from './styleContractVersions';

export const STYLE_PARAMETER_LAYOUT_SPEC_VERSION =
  'potfoundry.style-parameter-layout-spec/v1' as const;
export const STYLE_PARAMETER_LAYOUT_STYLE_COUNT = '20' as const;
export const STYLE_PARAMETER_LAYOUT_CONTROL_COUNT = '174' as const;

const float64Bytes = new Uint8Array(8);
const float64View = new DataView(float64Bytes.buffer);

function exactFloat64Hex(value: number): string {
  float64View.setFloat64(0, value, false);
  return `ieee754-binary64:${Array.from(float64Bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')}`;
}

function cpuKey(wireKey: string): string {
  return wireKey.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function exactOptional(value: number | undefined): string | null {
  return value === undefined ? null : exactFloat64Hex(value);
}

function exactDefault(schema: CertificationParamSchema): string | boolean {
  return typeof schema.default === 'boolean'
    ? schema.default
    : exactFloat64Hex(Object.is(schema.default, -0) ? 0 : schema.default);
}

const orderedStyles = Object.entries(STYLE_GPU_DISPATCH_MANIFEST)
  .sort((left, right) => left[1] - right[1])
  .map(([styleId, dispatchIndex]) => {
    const config = STYLE_CERTIFICATION_SCHEMA_SNAPSHOT[styleId];
    const layout = STYLE_GPU_LAYOUT_MANIFEST[
      styleId as keyof typeof STYLE_GPU_LAYOUT_MANIFEST
    ] as Readonly<Record<string, GpuParameterBinding>>;
    const entries = [
      ...Object.entries(config.params),
      ...Object.entries(config.advancedParams ?? {}),
    ].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return {
      dispatchIndex: dispatchIndex.toString(),
      parameters: entries.map(([wireKey, schema]) => ({
        cpuKey: cpuKey(wireKey),
        defaultExact: exactDefault(schema),
        gpuSlot: layout[wireKey as keyof typeof layout].slot.toString(),
        gpuTransform: layout[wireKey as keyof typeof layout].transform,
        maximumExact: exactOptional(schema.max),
        minimumExact: exactOptional(schema.min),
        stepExact: exactOptional(schema.step),
        type: schema.type,
        unit: schema.unit ?? null,
        wireKey,
      })),
      shaderName: config.shaderName,
      styleId,
    };
  });

const orderedControlCount = orderedStyles.reduce(
  (count, style) => count + style.parameters.length,
  0
);
if (
  orderedStyles.length.toString() !== STYLE_PARAMETER_LAYOUT_STYLE_COUNT ||
  orderedControlCount.toString() !== STYLE_PARAMETER_LAYOUT_CONTROL_COUNT
) {
  throw new Error(
    `[style-parameter-layout-spec] immutable schema count mismatch: ${orderedStyles.length} styles, ${orderedControlCount} controls`
  );
}

const specification = {
  controlCount: STYLE_PARAMETER_LAYOUT_CONTROL_COUNT,
  defaultMigrationVersion: STYLE_DEFAULT_MIGRATION_VERSION,
  gpuLayoutVersion: STYLE_GPU_LAYOUT_VERSION,
  gpuSentinel: {
    encoding: STYLE_GPU_SENTINEL_SPEC.encoding,
    slot: STYLE_GPU_SENTINEL_SPEC.slot.toString(),
  },
  gpuTransformSemantics: STYLE_GPU_TRANSFORM_SPEC,
  runtimeSpecVersion: STYLE_RUNTIME_SPEC_VERSION,
  schemaVersion: STYLE_PARAMETER_LAYOUT_SPEC_VERSION,
  styleCount: STYLE_PARAMETER_LAYOUT_STYLE_COUNT,
  styles: orderedStyles,
} satisfies CanonicalJsonValue;

/** Exact parameter/default/alias/dispatch/slot contract; not an evaluator-formula proof. */
export const STYLE_PARAMETER_LAYOUT_SPEC_CANONICAL_JSON =
  canonicalizeCertificationJson(specification);
export const STYLE_PARAMETER_LAYOUT_SPEC_SHA256 = domainSeparatedCanonicalJsonSha256(
  'potfoundry.style-parameter-layout-spec/definition/v1',
  specification
);
