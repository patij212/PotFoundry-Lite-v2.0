import type { GeometryParams } from '../../state/types';
import {
  normalizeStylePayload,
  resolveStyleId,
  type NormalizedStylePayload,
} from '../../styles/runtimeContract';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  normalizeCertifiedGeometryPayload,
  normalizeCertifiedTargetControlPayload,
  TARGET_SOLID_SPECIFICATION_SHA256,
  type CertifiedGeometryPayload,
  type CertifiedTargetControlPayload,
} from './targetSolidSpecification';

export const CANONICAL_TARGET_INPUT_VERSION =
  'potfoundry.canonical-target-input/v2' as const;

declare const canonicalTargetInputBindingBrand: unique symbol;

export interface CanonicalTargetInputBinding {
  readonly schemaVersion: typeof CANONICAL_TARGET_INPUT_VERSION;
  readonly targetSolidSpecificationSha256: string;
  readonly certifiedGeometryPayloadSha256: string;
  readonly certifiedTargetControlPayloadSha256: string;
  readonly styleCertificationPayloadSha256: string;
  readonly canonicalInputCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly geometry: CertifiedGeometryPayload;
  readonly targetControls: CertifiedTargetControlPayload;
  readonly style: NormalizedStylePayload;
  readonly [canonicalTargetInputBindingBrand]: true;
}

interface CanonicalTargetInputSnapshot {
  readonly canonicalInputCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly certifiedGeometryPayloadSha256: string;
  readonly certifiedTargetControlPayloadSha256: string;
  readonly styleCertificationPayloadSha256: string;
}

const registry = new WeakMap<object, CanonicalTargetInputSnapshot>();

export class CanonicalTargetInputError extends Error {
  readonly component: 'geometry' | 'style' | 'target-controls' | 'binding';
  readonly details: readonly string[];

  constructor(component: CanonicalTargetInputError['component'], details: readonly string[]) {
    super(`Canonical target input ${component} refused: ${details.join('; ')}`);
    this.name = 'CanonicalTargetInputError';
    this.component = component;
    this.details = Object.freeze([...details]);
  }
}

/**
 * Build the only G0 canonical input capability from raw user/state data. Both
 * component normalizers snapshot inert data properties and refuse defaults,
 * clamping, nonfinite values, alias conflicts, or relational invalidity.
 */
export function createCanonicalTargetInputBinding(
  geometryRaw: Readonly<Record<string, unknown>>,
  styleName: string,
  styleRaw: Readonly<Record<string, unknown>> | null | undefined,
  targetControlsRaw: Readonly<Record<string, unknown>> | null | undefined
): CanonicalTargetInputBinding {
  const geometryResult = normalizeCertifiedGeometryPayload(geometryRaw);
  if (!geometryResult.ok) {
    throw new CanonicalTargetInputError(
      'geometry',
      geometryResult.errors.map((error) => `${error.code}:${error.key ?? '-'}:${error.message}`)
    );
  }

  const styleId = resolveStyleId(styleName);
  if (styleId === undefined) {
    throw new CanonicalTargetInputError('style', [`UNKNOWN_STYLE:${styleName}`]);
  }
  const styleResult = normalizeStylePayload(styleId, styleRaw);
  if (!styleResult.ok) {
    throw new CanonicalTargetInputError(
      'style',
      styleResult.errors.map((error) => `${error.code}:${error.key ?? '-'}:${error.message}`)
    );
  }

  const targetControlsResult = normalizeCertifiedTargetControlPayload(targetControlsRaw);
  if (!targetControlsResult.ok) {
    throw new CanonicalTargetInputError(
      'target-controls',
      targetControlsResult.errors.map(
        (error) => `${error.code}:${error.key ?? '-'}:${error.message}`
      )
    );
  }
  if (styleId === 'SuperformulaBlossom') {
    const strength = styleResult.value.cpuOptions.sfStrength;
    const mBase = styleResult.value.cpuOptions.sfMBase;
    const mTop = styleResult.value.cpuOptions.sfMTop;
    const seamBlendDegrees =
      targetControlsResult.value.controls.superformulaSeamBlendDegrees;
    const unblendedSeamIsPositionallyClosed =
      typeof mBase === 'number' &&
      typeof mTop === 'number' &&
      mBase === mTop &&
      Number.isInteger(mBase);
    if (
      typeof strength !== 'number' ||
      (strength !== 0 && seamBlendDegrees === 0 && !unblendedSeamIsPositionallyClosed)
    ) {
      throw new CanonicalTargetInputError('target-controls', [
        'SUPERFORMULA_OPEN_SEAM:superformulaSeamBlendDegrees:active nonperiodic SuperformulaBlossom requires a positive authenticated seam blend or a constant integral symmetry count',
      ]);
    }
  }

  const canonicalInputCanonicalJson = canonicalizeCertificationJson({
    certifiedGeometryPayloadSha256: geometryResult.value.sha256,
    certifiedTargetControlPayloadSha256: targetControlsResult.value.sha256,
    schemaVersion: CANONICAL_TARGET_INPUT_VERSION,
    styleCertificationPayloadSha256: styleResult.value.certificationSha256,
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
  });
  const canonicalInputSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.canonical-target-input/definition/v2',
    JSON.parse(canonicalInputCanonicalJson) as CanonicalJsonValue
  );
  const frozenStyle = Object.freeze({ ...styleResult.value });
  const binding = Object.freeze({
    schemaVersion: CANONICAL_TARGET_INPUT_VERSION,
    targetSolidSpecificationSha256: TARGET_SOLID_SPECIFICATION_SHA256,
    certifiedGeometryPayloadSha256: geometryResult.value.sha256,
    certifiedTargetControlPayloadSha256: targetControlsResult.value.sha256,
    styleCertificationPayloadSha256: styleResult.value.certificationSha256,
    canonicalInputCanonicalJson,
    canonicalInputSha256,
    geometry: geometryResult.value,
    targetControls: targetControlsResult.value,
    style: frozenStyle,
  }) as CanonicalTargetInputBinding;
  registry.set(
    binding,
    Object.freeze({
      canonicalInputCanonicalJson,
      canonicalInputSha256,
      certifiedGeometryPayloadSha256: geometryResult.value.sha256,
      certifiedTargetControlPayloadSha256: targetControlsResult.value.sha256,
      styleCertificationPayloadSha256: styleResult.value.certificationSha256,
    })
  );
  return binding;
}

/** Internal proof boundary: structural copies and deserialized lookalikes refuse. */
export function canonicalTargetInputForProof(
  binding: CanonicalTargetInputBinding
): CanonicalTargetInputSnapshot {
  const snapshot = registry.get(binding);
  if (snapshot === undefined) {
    throw new CanonicalTargetInputError('binding', ['runtime capability is not registered']);
  }
  if (
    binding.canonicalInputCanonicalJson !== snapshot.canonicalInputCanonicalJson ||
    binding.canonicalInputSha256 !== snapshot.canonicalInputSha256 ||
    binding.certifiedGeometryPayloadSha256 !== snapshot.certifiedGeometryPayloadSha256 ||
    binding.certifiedTargetControlPayloadSha256 !==
      snapshot.certifiedTargetControlPayloadSha256 ||
    binding.styleCertificationPayloadSha256 !== snapshot.styleCertificationPayloadSha256 ||
    binding.targetSolidSpecificationSha256 !== TARGET_SOLID_SPECIFICATION_SHA256
  ) {
    throw new CanonicalTargetInputError('binding', ['runtime capability fields are inconsistent']);
  }
  return snapshot;
}

export type CanonicalGeometryParams = Readonly<GeometryParams>;
