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
  buildRadialOuterWallProgram,
  CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
  RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256,
} from './radialOuterWallProgram';
import {
  compileGeneratedTargetProgramBackends,
  generatedTargetProgramBackendsForProof,
  type GeneratedTargetProgramBackends,
} from './validatedResidualProgram';

export const GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_VERSION =
  'potfoundry.generated-smooth-style-outer-wall-target/v1' as const;
export const GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-fourier-spiral-superellipse-outer-wall-only-no-full-solid-regularity-or-device-conformance-proof' as const;

export type GeneratedSmoothStyleId =
  | 'FourierBloom'
  | 'SpiralRidges'
  | 'SuperellipseMorph';
export type OuterWallSeamSemantics =
  | 'periodic-identification-symbolically-admissible'
  | 'one-sided-discontinuity-requires-physical-feature-closure';

export const GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_VERSION,
    `scope=${GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'FourierBloom is a finite sum/product of integer-frequency trigonometric harmonics and is symbolically periodic',
    'SpiralRidges primary frequency is integral; its groove seam is periodic exactly when groove amplitude is zero or binary64(grooveMultiplier*ridgeCount) is an integer',
    'SuperellipseMorph uses absolute sine/cosine powers and integer 4/8 harmonics and is symbolically periodic',
    'nonperiodic SpiralRidges inputs are retained as valid one-sided outer-wall programs but require an explicit discontinuity closure in the target surface complex',
    'all programs use the shared exact-pi radial profile/twist/Cartesian generator and forward-only SSA compiler',
    'this layer does not prove positive radius, injectivity, Jacobian regularity, clearance, full-solid closure, artifact distance, or device conformance',
  ].join('\n')
);

declare const generatedSmoothStyleOuterWallTargetBrand: unique symbol;

export interface GeneratedSmoothStyleOuterWallTargetBinding {
  readonly schemaVersion: typeof GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly patchId: 'outer-wall';
  readonly styleId: GeneratedSmoothStyleId;
  readonly seamSemantics: OuterWallSeamSemantics;
  readonly periodicIdentificationAdmissible: boolean;
  readonly seamProofSha256: string;
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
  readonly [generatedSmoothStyleOuterWallTargetBrand]: true;
}

interface ProgramAndSeam {
  readonly programCanonicalJson: string;
  readonly seamSemantics: OuterWallSeamSemantics;
  readonly seamReason: string;
}

interface RegisteredBinding {
  readonly binding: GeneratedSmoothStyleOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();
const supportedStyles = new Set<StyleId>([
  'FourierBloom',
  'SpiralRidges',
  'SuperellipseMorph',
]);

function fail(message: string): never {
  throw new TypeError(`Generated smooth-style outer-wall target refused: ${message}`);
}

function evaluatorId(styleId: GeneratedSmoothStyleId): string {
  switch (styleId) {
    case 'FourierBloom': return 'potfoundry.fourier-bloom.outer-wall';
    case 'SpiralRidges': return 'potfoundry.spiral-ridges.outer-wall';
    case 'SuperellipseMorph': return 'potfoundry.superellipse-morph.outer-wall';
  }
}

function buildFourier(input: CanonicalTargetInputBinding): ProgramAndSeam {
  return Object.freeze({
    programCanonicalJson: buildRadialOuterWallProgram(
      input,
      'FourierBloom',
      { evaluatorId: evaluatorId('FourierBloom'), evaluatorVersion: 'v1', patchId: 'outer-wall' },
      ({ builder, baseRadius, thetaMaterial, t, tau, one, constant, styleValue }) => {
        const harmonic = (
          operation: 'sin' | 'cos',
          frequency: number,
          amplitudeKey: string,
          phaseKey: string
        ) => {
          const argument = builder.add(
            builder.multiply(constant(frequency), thetaMaterial),
            constant(styleValue(phaseKey))
          );
          const wave = operation === 'sin' ? builder.sin(argument) : builder.cos(argument);
          return builder.multiply(constant(styleValue(amplitudeKey)), wave);
        };
        const base = builder.add(
          builder.add(
            builder.add(one, harmonic('cos', 8, 'fbBaseCos8Amp', 'fbBaseCos8Phase')),
            harmonic('sin', 4, 'fbBaseSin4Amp', 'fbBaseSin4Phase')
          ),
          harmonic('cos', 12, 'fbBaseCos12Amp', 'fbBaseCos12Phase')
        );
        const top = builder.add(
          builder.add(
            builder.add(one, harmonic('cos', 11, 'fbTopCos11Amp', 'fbTopCos11Phase')),
            harmonic('sin', 7, 'fbTopSin7Amp', 'fbTopSin7Phase')
          ),
          harmonic('cos', 22, 'fbTopCos22Amp', 'fbTopCos22Phase')
        );
        const blended = builder.mix(base, top, t);
        const wobbleArgument = builder.add(
          builder.multiply(constant(styleValue('fbWobbleFreq')), thetaMaterial),
          builder.multiply(builder.multiply(tau, constant(styleValue('fbWobbleZgain'))), t)
        );
        const withWobble = builder.multiply(
          blended,
          builder.add(
            one,
            builder.multiply(
              constant(styleValue('fbWobbleAmp')),
              builder.sin(wobbleArgument)
            )
          )
        );
        return builder.multiply(
          baseRadius,
          builder.add(
            one,
            builder.multiply(
              builder.subtract(withWobble, one),
              constant(styleValue('fbStrength'))
            )
          )
        );
      }
    ),
    seamSemantics: 'periodic-identification-symbolically-admissible',
    seamReason: 'all active angular frequencies are integers',
  });
}

function buildSpiral(input: CanonicalTargetInputBinding): ProgramAndSeam {
  const style = input.style.cpuOptions;
  const k = style.spiralK;
  const grooveMultiplier = style.spiralGrooveMult;
  const grooveAmplitude = style.spiralGrooveAmp;
  if (
    typeof k !== 'number' ||
    typeof grooveMultiplier !== 'number' ||
    typeof grooveAmplitude !== 'number'
  ) {
    fail('normalized SpiralRidges seam parameters are unavailable');
  }
  const grooveFrequency = grooveMultiplier * k;
  const periodic = grooveAmplitude === 0 || Number.isInteger(grooveFrequency);
  return Object.freeze({
    programCanonicalJson: buildRadialOuterWallProgram(
      input,
      'SpiralRidges',
      { evaluatorId: evaluatorId('SpiralRidges'), evaluatorVersion: 'v1', patchId: 'outer-wall' },
      ({ builder, baseRadius, thetaMaterial, t, tau, one, constant, styleValue }) => {
        const phase = builder.multiply(
          builder.multiply(tau, constant(styleValue('spiralTurns'))),
          t
        );
        const amplitude = builder.add(
          constant(styleValue('spiralAmpMin')),
          builder.multiply(
            builder.subtract(
              constant(styleValue('spiralAmpMax')),
              constant(styleValue('spiralAmpMin'))
            ),
            builder.power(t, constant(styleValue('spiralAmpCurve')))
          )
        );
        const primary = builder.add(
          one,
          builder.multiply(
            amplitude,
            builder.sin(
              builder.add(
                builder.multiply(constant(styleValue('spiralK')), thetaMaterial),
                phase
              )
            )
          )
        );
        const grooveArgument = builder.add(
          builder.multiply(
            builder.multiply(
              constant(styleValue('spiralGrooveMult')),
              constant(styleValue('spiralK'))
            ),
            thetaMaterial
          ),
          builder.multiply(constant(styleValue('spiralPhaseMult')), phase)
        );
        const factor = builder.add(
          primary,
          builder.multiply(
            constant(styleValue('spiralGrooveAmp')),
            builder.sin(grooveArgument)
          )
        );
        return builder.multiply(baseRadius, factor);
      }
    ),
    seamSemantics: periodic
      ? 'periodic-identification-symbolically-admissible'
      : 'one-sided-discontinuity-requires-physical-feature-closure',
    seamReason: periodic
      ? 'groove amplitude is zero or grooveMultiplier*ridgeCount is an integer'
      : 'active grooveMultiplier*ridgeCount is nonintegral',
  });
}

function buildSuperellipse(input: CanonicalTargetInputBinding): ProgramAndSeam {
  return Object.freeze({
    programCanonicalJson: buildRadialOuterWallProgram(
      input,
      'SuperellipseMorph',
      {
        evaluatorId: evaluatorId('SuperellipseMorph'),
        evaluatorVersion: 'v1',
        patchId: 'outer-wall',
      },
      ({ builder, baseRadius, thetaMaterial, t, one, constant, styleValue }) => {
        const exponent = builder.add(
          constant(styleValue('seMBase')),
          builder.multiply(
            builder.subtract(constant(styleValue('seMTop')), constant(styleValue('seMBase'))),
            builder.power(t, constant(styleValue('seMCurveExp')))
          )
        );
        const cosinePower = builder.power(
          builder.absolute(builder.cos(thetaMaterial)),
          exponent
        );
        const sinePower = builder.power(
          builder.absolute(builder.sin(thetaMaterial)),
          exponent
        );
        const superellipse = builder.power(
          builder.add(cosinePower, sinePower),
          builder.negate(builder.divide(one, exponent))
        );
        const c4 = builder.multiply(
          constant(styleValue('seC4Amp')),
          builder.cos(
            builder.add(
              builder.multiply(constant(4), thetaMaterial),
              constant((styleValue('seC4PhaseDeg') * Math.PI) / 180)
            )
          )
        );
        const c8 = builder.multiply(
          constant(styleValue('seC8Amp')),
          builder.cos(
            builder.add(
              builder.multiply(constant(8), thetaMaterial),
              constant((styleValue('seC8PhaseDeg') * Math.PI) / 180)
            )
          )
        );
        return builder.multiply(
          baseRadius,
          builder.multiply(superellipse, builder.add(builder.add(one, c4), c8))
        );
      }
    ),
    seamSemantics: 'periodic-identification-symbolically-admissible',
    seamReason: 'absolute sine/cosine powers and 4/8 harmonics are periodic',
  });
}

function buildProgramAndSeam(input: CanonicalTargetInputBinding): ProgramAndSeam {
  canonicalTargetInputForProof(input);
  if (!supportedStyles.has(input.style.styleId)) {
    fail(`style '${input.style.styleId}' is not supported by this target set`);
  }
  switch (input.style.styleId) {
    case 'FourierBloom': return buildFourier(input);
    case 'SpiralRidges': return buildSpiral(input);
    case 'SuperellipseMorph': return buildSuperellipse(input);
    default: return fail(`style '${input.style.styleId}' has no static author`);
  }
}

function derive(input: CanonicalTargetInputBinding): GeneratedSmoothStyleOuterWallTargetBinding {
  const proof = canonicalTargetInputForProof(input);
  const styleId = input.style.styleId as GeneratedSmoothStyleId;
  const built = buildProgramAndSeam(input);
  const backends = compileGeneratedTargetProgramBackends(built.programCanonicalJson);
  const seamProofSha256 = sha256Utf8(
    [styleId, backends.programSha256, built.seamSemantics, built.seamReason].join('\n')
  );
  const periodicIdentificationAdmissible =
    built.seamSemantics === 'periodic-identification-symbolically-admissible';
  const bindingValue = {
    backendSha256: backends.backendSha256,
    canonicalInputSha256: proof.canonicalInputSha256,
    implementationScope: GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_SCOPE,
    nodeCount: backends.nodeCount.toString(),
    patchId: 'outer-wall',
    periodicIdentificationAdmissible,
    programSha256: backends.programSha256,
    proofMethodSha256: GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    schemaVersion: GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_VERSION,
    seamProofSha256,
    seamSemantics: built.seamSemantics,
    styleId,
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.generated-smooth-style-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_VERSION,
    implementationScope: GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: GENERATED_SMOOTH_STYLE_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: proof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    patchId: 'outer-wall',
    styleId,
    seamSemantics: built.seamSemantics,
    periodicIdentificationAdmissible,
    seamProofSha256,
    programCanonicalJson: built.programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  }) as GeneratedSmoothStyleOuterWallTargetBinding;
}

export function createGeneratedSmoothStyleOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): GeneratedSmoothStyleOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function generatedSmoothStyleOuterWallTargetForProof(
  value: GeneratedSmoothStyleOuterWallTargetBinding
): GeneratedSmoothStyleOuterWallTargetBinding {
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
    value.seamSemantics !== derived.seamSemantics ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.seamProofSha256 !== derived.seamProofSha256 ||
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
