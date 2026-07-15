import type { ParamSchema } from '../state/types';
import {
  STYLE_GPU_DISPATCH_MANIFEST,
  STYLE_GPU_LAYOUT_MANIFEST,
} from './gpuLayoutContract';
import { STYLE_REGISTRY } from './registry';

export interface CertificationParamSchema {
  readonly type: ParamSchema['type'];
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly default: number | boolean;
  readonly unit?: string;
}

export interface CertificationStyleSchema {
  readonly id: number;
  readonly shaderName: string;
  readonly params: Readonly<Record<string, CertificationParamSchema>>;
  readonly advancedParams: Readonly<Record<string, CertificationParamSchema>>;
}

function snapshotParameter(schema: ParamSchema): CertificationParamSchema {
  return Object.freeze({
    type: schema.type,
    ...(schema.min === undefined ? {} : { min: schema.min }),
    ...(schema.max === undefined ? {} : { max: schema.max }),
    ...(schema.step === undefined ? {} : { step: schema.step }),
    default: schema.default,
    ...(schema.unit === undefined ? {} : { unit: schema.unit }),
  });
}

function snapshotParameters(
  schemas: Readonly<Record<string, ParamSchema>> | undefined
): Readonly<Record<string, CertificationParamSchema>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(schemas ?? {})
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, schema]) => [key, snapshotParameter(schema)])
    )
  );
}

function sortedKeys(record: Readonly<Record<string, unknown>>): string[] {
  return Object.keys(record).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function requireEqualKeys(label: string, left: readonly string[], right: readonly string[]): void {
  if (left.length !== right.length || left.some((key, index) => key !== right[index])) {
    throw new Error(
      `[style-certification-schema] ${label} key-set mismatch: ${left.join(',')} != ${right.join(',')}`
    );
  }
}

const dispatchStyleIds = sortedKeys(STYLE_GPU_DISPATCH_MANIFEST);
requireEqualKeys('registry/dispatch', sortedKeys(STYLE_REGISTRY), dispatchStyleIds);
requireEqualKeys('layout/dispatch', sortedKeys(STYLE_GPU_LAYOUT_MANIFEST), dispatchStyleIds);

/**
 * Deep-frozen, one-time certification view of the public UI registry. Every
 * certification hash and validator reads this exact object, so later mutation
 * of the UI registry cannot splice new rules beneath an old certificate hash.
 */
export const STYLE_CERTIFICATION_SCHEMA_SNAPSHOT: Readonly<
  Record<string, CertificationStyleSchema>
> = Object.freeze(
  Object.fromEntries(
    dispatchStyleIds.map((styleId) => {
      const config = STYLE_REGISTRY[styleId];
      const expectedDispatchIndex =
        STYLE_GPU_DISPATCH_MANIFEST[styleId as keyof typeof STYLE_GPU_DISPATCH_MANIFEST];
      if (config.id !== expectedDispatchIndex) {
        throw new Error(
          `[style-certification-schema] ${styleId} registry id ${config.id} does not match committed dispatch ${expectedDispatchIndex}`
        );
      }
      const primaryKeys = sortedKeys(config.params);
      const advancedKeys = sortedKeys(config.advancedParams ?? {});
      const combinedKeys = [...primaryKeys, ...advancedKeys].sort();
      if (new Set(combinedKeys).size !== combinedKeys.length) {
        throw new Error(
          `[style-certification-schema] ${styleId} repeats a key across primary and advanced parameters`
        );
      }
      requireEqualKeys(
        `${styleId} registry/layout`,
        combinedKeys,
        sortedKeys(STYLE_GPU_LAYOUT_MANIFEST[styleId as keyof typeof STYLE_GPU_LAYOUT_MANIFEST])
      );
      return [
        styleId,
        Object.freeze({
          id: expectedDispatchIndex,
          shaderName: config.shaderName,
          params: snapshotParameters(config.params),
          advancedParams: snapshotParameters(config.advancedParams),
        }),
      ];
    })
  )
);
