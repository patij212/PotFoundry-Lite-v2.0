import type { StyleId } from '../types';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  canonicalTargetInputForProof,
  type CanonicalTargetInputBinding,
} from './canonicalTargetInput';
import { sha256Utf8 } from './incrementalSha256';
import {
  VALIDATED_TARGET_PROGRAM_BUILDER_PROOF_SHA256,
  VALIDATED_TARGET_PROGRAM_BUILDER_VERSION,
  ValidatedTargetProgramBuilder,
  type TargetExpressionReference,
  type ValidatedTargetCoordinates,
  type ValidatedTargetProgramMetadata,
} from './validatedTargetProgramBuilder';

export const CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_VERSION =
  'potfoundry.certified-radial-outer-wall-semantics/v2' as const;
export const RADIAL_OUTER_WALL_PROGRAM_GENERATOR_VERSION =
  'potfoundry.radial-outer-wall-program-generator/v3' as const;

const radialSemanticsValue = {
  baseProfile:
    'flare=(bottomRadius+(topRadius-bottomRadius)*power(v,expn)); bell=flare*(1+bellAmp*exp(-(v-bellCenter)^2/(2*bellWidth^2)))',
  bellWidthSemantics: 'exact-validated-input-no-hidden-clamp',
  coordinateSystem: 'right-handed-millimeter-x-y-z',
  materialAngle: 'thetaMaterial=2*exact-mathematical-pi*u',
  outerRadiusFloor: 'none-invalid-nonpositive-or-nonregular-images-must-refuse',
  placementAngle:
    'thetaPlacement=thetaMaterial+spinPhaseRadians+binary64(2*pi)*spinTurns*power(v,spinCurve)',
  schemaVersion: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_VERSION,
  styleEvaluationAngle: 'thetaMaterial-before-placement-twist',
  unitDomain: 'closed-unit-square-with-u0-u1-periodic-identification',
  zCoordinate: 'H*v',
} satisfies CanonicalJsonValue;

export const CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_CANONICAL_JSON =
  canonicalizeCertificationJson(radialSemanticsValue);
export const CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256 =
  domainSeparatedCanonicalJsonSha256(
    'potfoundry.certified-radial-outer-wall-semantics/definition/v2',
    radialSemanticsValue
  );
export const RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256 = sha256Utf8(
  [
    RADIAL_OUTER_WALL_PROGRAM_GENERATOR_VERSION,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `builder=${VALIDATED_TARGET_PROGRAM_BUILDER_VERSION}`,
    `builder-proof=${VALIDATED_TARGET_PROGRAM_BUILDER_PROOF_SHA256}`,
    'input is an authenticated canonical target capability and must have the exact expected style id',
    'base profile, global bell, material angle, positive placement twist, Cartesian projection, and height are emitted once here for every radial style patch',
    'the patch author may map local unit coordinates to material u and height t, evaluate one-sided band limits, and interpolate radial curtains without copying profile or placement semantics',
    'a statically supplied style-radius author receives only authenticated normalized constants and builder-owned SSA references',
    'the callback output must be a reference owned by the same builder; the validated SSA compiler remains the executable proof boundary',
  ].join('\n')
);

export interface RadialOuterWallStyleContext {
  readonly builder: ValidatedTargetProgramBuilder;
  readonly input: CanonicalTargetInputBinding;
  readonly baseRadius: TargetExpressionReference;
  readonly thetaMaterial: TargetExpressionReference;
  readonly t: TargetExpressionReference;
  readonly tau: TargetExpressionReference;
  readonly one: TargetExpressionReference;
  readonly constant: (value: number) => TargetExpressionReference;
  readonly styleValue: (key: string) => number;
}

export type RadialStyleRadiusAuthor = (
  context: RadialOuterWallStyleContext
) => TargetExpressionReference;

export interface RadialTargetPatchContext {
  readonly builder: ValidatedTargetProgramBuilder;
  readonly input: CanonicalTargetInputBinding;
  readonly localU: TargetExpressionReference;
  readonly localV: TargetExpressionReference;
  readonly tau: TargetExpressionReference;
  readonly one: TargetExpressionReference;
  readonly constant: (value: number) => TargetExpressionReference;
  readonly styleValue: (key: string) => number;
  readonly thetaMaterialAt: (
    materialU: TargetExpressionReference
  ) => TargetExpressionReference;
  readonly baseRadiusAt: (t: TargetExpressionReference) => TargetExpressionReference;
  readonly placementAngleAt: (
    materialU: TargetExpressionReference,
    t: TargetExpressionReference
  ) => TargetExpressionReference;
  readonly radialPointAt: (
    radius: TargetExpressionReference,
    materialU: TargetExpressionReference,
    t: TargetExpressionReference
  ) => ValidatedTargetCoordinates;
}

export type RadialTargetPatchAuthor = (
  context: RadialTargetPatchContext
) => ValidatedTargetCoordinates;

function fail(message: string): never {
  throw new TypeError(`Radial outer-wall program refused: ${message}`);
}

/**
 * Build any radial target patch without duplicating authoritative profile,
 * material-angle, placement-twist, Cartesian, or height semantics.
 */
export function buildRadialTargetPatchProgram(
  input: CanonicalTargetInputBinding,
  expectedStyleId: StyleId,
  metadata: ValidatedTargetProgramMetadata,
  authorPatch: RadialTargetPatchAuthor
): string {
  canonicalTargetInputForProof(input);
  if (input.style.styleId !== expectedStyleId) {
    fail(`expected ${expectedStyleId} but received '${input.style.styleId}'`);
  }
  const geometry = input.geometry.geometry;
  const builder = new ValidatedTargetProgramBuilder();
  const constant = (value: number): TargetExpressionReference => builder.constantFloat64(value);
  const styleValue = (key: string): number => {
    const value = input.style.cpuOptions[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      fail(`normalized style value '${key}' is unavailable`);
    }
    return value;
  };
  const one = builder.constantDecimal('1');
  const two = builder.constantDecimal('2');
  const localU = builder.u();
  const localV = builder.v();
  const tau = builder.tau();
  const thetaMaterialAt = (
    materialU: TargetExpressionReference
  ): TargetExpressionReference => builder.multiply(tau, materialU);
  const baseRadiusAt = (t: TargetExpressionReference): TargetExpressionReference => {
    const bottomRadius = constant(geometry.bottom_od / 2);
    const topRadius = constant(geometry.top_od / 2);
    const flare = builder.add(
      bottomRadius,
      builder.multiply(
        builder.subtract(topRadius, bottomRadius),
        builder.power(t, constant(geometry.expn))
      )
    );
    const globalBellDistance = builder.subtract(t, constant(geometry.bellCenter));
    const globalBellExponent = builder.negate(
      builder.divide(
        builder.square(globalBellDistance),
        builder.multiply(two, builder.square(constant(geometry.bellWidth)))
      )
    );
    return builder.multiply(
      flare,
      builder.add(
        one,
        builder.multiply(constant(geometry.bellAmp), builder.exp(globalBellExponent))
      )
    );
  };
  const placementAngleAt = (
    materialU: TargetExpressionReference,
    t: TargetExpressionReference
  ): TargetExpressionReference => builder.add(
    builder.add(
      thetaMaterialAt(materialU),
      constant((geometry.spinPhase * Math.PI) / 180)
    ),
    builder.multiply(
      builder.multiply(tau, constant(geometry.spinTurns)),
      builder.power(t, constant(geometry.spinCurve))
    )
  );
  const radialPointAt = (
    radius: TargetExpressionReference,
    materialU: TargetExpressionReference,
    t: TargetExpressionReference
  ): ValidatedTargetCoordinates => {
    const placementAngle = placementAngleAt(materialU, t);
    return Object.freeze({
      x: builder.multiply(radius, builder.cos(placementAngle)),
      y: builder.multiply(radius, builder.sin(placementAngle)),
      z: builder.multiply(constant(geometry.H), t),
    });
  };
  const target = authorPatch(
    Object.freeze({
      builder,
      input,
      localU,
      localV,
      tau,
      one,
      constant,
      styleValue,
      thetaMaterialAt,
      baseRadiusAt,
      placementAngleAt,
      radialPointAt,
    })
  );
  return builder.buildCanonicalProgram(metadata, target);
}

/** Build one canonical full Cartesian outer-wall SSA program around a style radius expression. */
export function buildRadialOuterWallProgram(
  input: CanonicalTargetInputBinding,
  expectedStyleId: StyleId,
  metadata: ValidatedTargetProgramMetadata,
  authorStyleRadius: RadialStyleRadiusAuthor
): string {
  return buildRadialTargetPatchProgram(
    input,
    expectedStyleId,
    metadata,
    (patch) => {
      const t = patch.localV;
      const thetaMaterial = patch.thetaMaterialAt(patch.localU);
      const baseRadius = patch.baseRadiusAt(t);
      const radius = authorStyleRadius(
        Object.freeze({
          builder: patch.builder,
          input: patch.input,
          baseRadius,
          thetaMaterial,
          t,
          tau: patch.tau,
          one: patch.one,
          constant: patch.constant,
          styleValue: patch.styleValue,
        })
      );
      return patch.radialPointAt(radius, patch.localU, t);
    }
  );
}
