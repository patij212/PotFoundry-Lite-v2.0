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
  buildRadialOuterWallProgram,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_CANONICAL_JSON,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_VERSION,
} from './radialOuterWallProgram';
import {
  compileGeneratedTargetProgramBackends,
  generatedTargetProgramBackendsForProof,
  type GeneratedTargetProgramBackends,
} from './validatedResidualProgram';
import {
  VALIDATED_TARGET_PROGRAM_BUILDER_PROOF_SHA256,
  VALIDATED_TARGET_PROGRAM_BUILDER_VERSION,
} from './validatedTargetProgramBuilder';

export {
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_CANONICAL_JSON,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_VERSION,
};
export const HARMONIC_RIPPLE_OUTER_WALL_TARGET_VERSION =
  'potfoundry.harmonic-ripple-outer-wall-target/v2' as const;
export const HARMONIC_RIPPLE_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-harmonic-ripple-outer-wall-only-no-full-solid-regularity-or-device-conformance-proof' as const;

export const HARMONIC_RIPPLE_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    HARMONIC_RIPPLE_OUTER_WALL_TARGET_VERSION,
    `scope=${HARMONIC_RIPPLE_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `builder=${VALIDATED_TARGET_PROGRAM_BUILDER_VERSION}`,
    `builder-proof=${VALIDATED_TARGET_PROGRAM_BUILDER_PROOF_SHA256}`,
    'input must be an authenticated canonical target input whose exact style id is HarmonicRipple',
    'all thirteen geometry values and all nine normalized style values are already finite, range-checked, explicit data',
    'style radius is baseRadius*(1+petalAmp*cos(petals*theta+petalPhase+tau*petalZgain*v))*(1+rippleAmp*sin(rippleFrequency*theta+ripplePhase+tau*rippleZgain*v))*(1+styleBell*exp(-(v-0.5)^2/0.04))',
    'the shared radius and placement expressions are emitted once into forward-only SSA and consumed by both Cartesian coordinates',
    'the resulting canonical program is independently compiled into CPU Float64, Float32 reference, WGSL, and validated interval execution',
    'this binds one smooth outer-wall evaluator only; it does not prove target regularity, inner/closure surfaces, artifact distance, or GPU device conformance',
  ].join('\n')
);

declare const harmonicRippleOuterWallTargetBrand: unique symbol;

export interface HarmonicRippleOuterWallTargetBinding {
  readonly schemaVersion: typeof HARMONIC_RIPPLE_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof HARMONIC_RIPPLE_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly patchId: 'outer-wall';
  readonly styleId: 'HarmonicRipple';
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
  readonly [harmonicRippleOuterWallTargetBrand]: true;
}

interface RegisteredBinding {
  readonly binding: HarmonicRippleOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();

function fail(message: string): never {
  throw new TypeError(`Harmonic Ripple outer-wall target refused: ${message}`);
}

function buildProgram(input: CanonicalTargetInputBinding): string {
  return buildRadialOuterWallProgram(
    input,
    'HarmonicRipple',
    {
      evaluatorId: 'potfoundry.harmonic-ripple.outer-wall',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    ({ builder, baseRadius, thetaMaterial, t, tau, one, constant, styleValue }) => {
      const half = builder.constantDecimal('0.5');
      const styleBellDenominator = builder.constantDecimal('0.04');
      const petalArgument = builder.add(
        builder.add(
          builder.multiply(constant(styleValue('hrPetals')), thetaMaterial),
          constant((styleValue('hrPetalPhaseDeg') * Math.PI) / 180)
        ),
        builder.multiply(builder.multiply(tau, constant(styleValue('hrPetalZgain'))), t)
      );
      const petalFactor = builder.add(
        one,
        builder.multiply(constant(styleValue('hrPetalAmp')), builder.cos(petalArgument))
      );
      const rippleArgument = builder.add(
        builder.add(
          builder.multiply(constant(styleValue('hrRippleFreq')), thetaMaterial),
          constant((styleValue('hrRipplePhaseDeg') * Math.PI) / 180)
        ),
        builder.multiply(builder.multiply(tau, constant(styleValue('hrRippleZgain'))), t)
      );
      const rippleFactor = builder.add(
        one,
        builder.multiply(constant(styleValue('hrRippleAmp')), builder.sin(rippleArgument))
      );
      const styleBellExponent = builder.negate(
        builder.divide(builder.square(builder.subtract(t, half)), styleBellDenominator)
      );
      const styleBellFactor = builder.add(
        one,
        builder.multiply(constant(styleValue('hrBell')), builder.exp(styleBellExponent))
      );
      return builder.multiply(
        builder.multiply(builder.multiply(baseRadius, petalFactor), rippleFactor),
        styleBellFactor
      );
    }
  );
}

function derive(input: CanonicalTargetInputBinding): HarmonicRippleOuterWallTargetBinding {
  const proof = canonicalTargetInputForProof(input);
  const programCanonicalJson = buildProgram(input);
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  const bindingValue = {
    backendSha256: backends.backendSha256,
    canonicalInputSha256: proof.canonicalInputSha256,
    implementationScope: HARMONIC_RIPPLE_OUTER_WALL_TARGET_SCOPE,
    nodeCount: backends.nodeCount.toString(),
    patchId: 'outer-wall',
    programSha256: backends.programSha256,
    proofMethodSha256: HARMONIC_RIPPLE_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    schemaVersion: HARMONIC_RIPPLE_OUTER_WALL_TARGET_VERSION,
    styleId: 'HarmonicRipple',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.harmonic-ripple-outer-wall-target/binding/v2',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: HARMONIC_RIPPLE_OUTER_WALL_TARGET_VERSION,
    implementationScope: HARMONIC_RIPPLE_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: HARMONIC_RIPPLE_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: proof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    patchId: 'outer-wall',
    styleId: 'HarmonicRipple',
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  }) as HarmonicRippleOuterWallTargetBinding;
}

export function createHarmonicRippleOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): HarmonicRippleOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function harmonicRippleOuterWallTargetForProof(
  value: HarmonicRippleOuterWallTargetBinding
): HarmonicRippleOuterWallTargetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('binding is not an authenticated capability');
  }
  const registered = registry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('binding is not an authenticated capability');
  }
  generatedTargetProgramBackendsForProof(value.backends);
  const derived = derive(registered.input);
  if (
    value.schemaVersion !== derived.schemaVersion ||
    value.implementationScope !== derived.implementationScope ||
    value.proofMethodSha256 !== derived.proofMethodSha256 ||
    value.bindingSha256 !== derived.bindingSha256 ||
    value.bindingCanonicalJson !== derived.bindingCanonicalJson ||
    value.canonicalInputSha256 !== derived.canonicalInputSha256 ||
    value.radialSemanticsSha256 !== derived.radialSemanticsSha256 ||
    value.patchId !== derived.patchId ||
    value.styleId !== derived.styleId ||
    value.programCanonicalJson !== derived.programCanonicalJson ||
    value.programSha256 !== derived.programSha256 ||
    value.nodeCount !== derived.nodeCount ||
    value.backends.programSha256 !== derived.backends.programSha256 ||
    value.backends.backendSha256 !== derived.backends.backendSha256
  ) {
    fail('binding capability fields are inconsistent');
  }
  return value;
}
