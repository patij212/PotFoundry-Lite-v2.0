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

export const SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_VERSION =
  'potfoundry.superformula-blossom-outer-wall-target/v1' as const;
export const SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_SCOPE =
  'authenticated-generated-superformula-outer-wall-with-target-identity-seam-blend-and-declared-piecewise-boundaries-only-no-full-solid-regularity-artifact-distance-or-device-conformance-proof' as const;

export type SuperformulaSeamRegularity =
  | 'style-inactive-base-wall'
  | 'positive-blend-position-and-first-derivative-closed'
  | 'constant-integral-symmetry-position-closed-crease-possible';

export interface SuperformulaPiecewiseBoundaryFamily {
  readonly id: string;
  readonly exactCondition: string;
  readonly regularityReason: string;
  readonly requiredHandling: 'isolate-or-prove-inactive-before-certified-distance-subdivision';
}

export const SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_PROOF_SHA256 = sha256Utf8(
  [
    SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_VERSION,
    `scope=${SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_SCOPE}`,
    `radial-semantics=${CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256}`,
    `radial-generator-proof=${RADIAL_OUTER_WALL_PROGRAM_GENERATOR_PROOF_SHA256}`,
    'the authenticated target control superformulaSeamBlendDegrees is part of target identity rather than an unauthenticated mesh hint',
    'active nonperiodic zero-blend inputs have already been refused by the canonical target-input boundary',
    'positive seam blend is emitted as smoothstep(0,spread,min(theta,2*pi-theta)) and exactly closes the endpoint trace with zero first radial derivative',
    'zero-blend constant integral symmetry is positionally periodic; a seam crease remains an explicit regularity possibility',
    'the denominator <= epsilon branch is emitted without unsafe division by combining a safeguarded reciprocal with a strict-positive sign gate',
    'absolute-trigonometric zeros, denominator switching, reciprocal cap, and seam-blend transition lines are declared as partition obligations',
    'the generated target intentionally does not claim parity with the current production WGSL, which removed seam blending',
    'this layer does not prove positive radius, injectivity, Jacobian regularity, clearance, full-solid closure, artifact distance, or device conformance',
  ].join('\n')
);

declare const superformulaBlossomOuterWallTargetBrand: unique symbol;

export interface SuperformulaBlossomOuterWallTargetBinding {
  readonly schemaVersion: typeof SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_VERSION;
  readonly implementationScope: typeof SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_SCOPE;
  readonly proofMethodSha256: string;
  readonly bindingSha256: string;
  readonly bindingCanonicalJson: string;
  readonly canonicalInputSha256: string;
  readonly radialSemanticsSha256: string;
  readonly patchId: 'outer-wall';
  readonly styleId: 'SuperformulaBlossom';
  readonly seamRegularity: SuperformulaSeamRegularity;
  readonly periodicIdentificationAdmissible: true;
  readonly seamProofSha256: string;
  readonly boundaryManifestCanonicalJson: string;
  readonly boundaryManifestSha256: string;
  readonly boundaryFamilies: readonly SuperformulaPiecewiseBoundaryFamily[];
  readonly programCanonicalJson: string;
  readonly programSha256: string;
  readonly nodeCount: number;
  readonly backends: GeneratedTargetProgramBackends;
  readonly [superformulaBlossomOuterWallTargetBrand]: true;
}

interface RegisteredBinding {
  readonly binding: SuperformulaBlossomOuterWallTargetBinding;
  readonly input: CanonicalTargetInputBinding;
}

const registry = new WeakMap<object, RegisteredBinding>();
const EPSILON = 1e-6;

function fail(message: string): never {
  throw new TypeError(`Superformula Blossom outer-wall target refused: ${message}`);
}

function styleNumber(input: CanonicalTargetInputBinding, key: string): number {
  const value = input.style.cpuOptions[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`normalized style value '${key}' is unavailable`);
  }
  return value;
}

function seamRegularity(input: CanonicalTargetInputBinding): SuperformulaSeamRegularity {
  const strength = styleNumber(input, 'sfStrength');
  if (strength === 0) return 'style-inactive-base-wall';
  if (input.targetControls.controls.superformulaSeamBlendDegrees > 0) {
    return 'positive-blend-position-and-first-derivative-closed';
  }
  const mBase = styleNumber(input, 'sfMBase');
  const mTop = styleNumber(input, 'sfMTop');
  if (mBase === mTop && Number.isInteger(mBase)) {
    return 'constant-integral-symmetry-position-closed-crease-possible';
  }
  return fail('canonical input admitted an active open seam');
}

function boundary(
  id: string,
  exactCondition: string,
  regularityReason: string
): SuperformulaPiecewiseBoundaryFamily {
  return Object.freeze({
    id,
    exactCondition,
    regularityReason,
    requiredHandling: 'isolate-or-prove-inactive-before-certified-distance-subdivision',
  });
}

function buildBoundaryFamilies(
  input: CanonicalTargetInputBinding
): readonly SuperformulaPiecewiseBoundaryFamily[] {
  const families: SuperformulaPiecewiseBoundaryFamily[] = [
    boundary(
      'superformula-absolute-trigonometric-zeros',
      'cos(m*(thetaMaterial+pi/max(m,1))/4)=0 or sin(m*(thetaMaterial+pi/max(m,1))/4)=0',
      'absolute-value powers may be nonsmooth or have unbounded derivative for exponents below one'
    ),
    boundary(
      'superformula-denominator-switch',
      'power(cosineTerm+sineTerm,1/max(n1,epsilon))=epsilon',
      'strict denominator guard switches the legacy result between zero and reciprocal evaluation'
    ),
    boundary(
      'superformula-reciprocal-cap',
      'power(cosineTerm+sineTerm,1/max(n1,epsilon))=0.25',
      'minimum caps the reciprocal superformula factor at four'
    ),
  ];
  if (input.targetControls.controls.superformulaSeamBlendDegrees > 0) {
    families.push(
      boundary(
        'superformula-seam-blend-transitions',
        'thetaMaterial=seamSpread or thetaMaterial=2*pi-seamSpread',
        'smoothstep reaches its unit branch; first derivative is continuous but higher derivatives change'
      )
    );
  }
  return Object.freeze(families);
}

function buildProgram(input: CanonicalTargetInputBinding): string {
  const seamBlendDegrees = input.targetControls.controls.superformulaSeamBlendDegrees;
  return buildRadialOuterWallProgram(
    input,
    'SuperformulaBlossom',
    {
      evaluatorId: 'potfoundry.superformula-blossom.outer-wall',
      evaluatorVersion: 'v1',
      patchId: 'outer-wall',
    },
    ({ builder, baseRadius, thetaMaterial, t, tau, one, constant, styleValue }) => {
      const zero = constant(0);
      const four = constant(4);
      const m = builder.add(
        constant(styleValue('sfMBase')),
        builder.multiply(
          builder.subtract(
            constant(styleValue('sfMTop')),
            constant(styleValue('sfMBase'))
          ),
          builder.power(t, constant(styleValue('sfMCurveExp')))
        )
      );
      const n1 = builder.add(
        constant(styleValue('sfN1')),
        builder.multiply(
          builder.subtract(constant(styleValue('sfN1Top')), constant(styleValue('sfN1'))),
          t
        )
      );
      const n2 = builder.add(
        constant(styleValue('sfN2')),
        builder.multiply(
          builder.subtract(constant(styleValue('sfN2Top')), constant(styleValue('sfN2'))),
          t
        )
      );
      const n3 = builder.add(
        constant(styleValue('sfN3')),
        builder.multiply(
          builder.subtract(constant(styleValue('sfN3Top')), constant(styleValue('sfN3'))),
          t
        )
      );
      const pi = builder.divide(tau, constant(2));
      const seamOffset = builder.divide(pi, builder.maximum(m, one));
      const thetaAdjusted = builder.add(thetaMaterial, seamOffset);
      const superformulaPhase = builder.divide(
        builder.multiply(m, thetaAdjusted),
        four
      );
      const cosineTerm = builder.power(
        builder.absolute(
          builder.divide(
            builder.cos(superformulaPhase),
            builder.maximum(constant(styleValue('sfA')), constant(EPSILON))
          )
        ),
        n2
      );
      const sineTerm = builder.power(
        builder.absolute(
          builder.divide(
            builder.sin(superformulaPhase),
            builder.maximum(constant(styleValue('sfB')), constant(EPSILON))
          )
        ),
        n3
      );
      const denominator = builder.power(
        builder.add(cosineTerm, sineTerm),
        builder.divide(one, builder.maximum(n1, constant(EPSILON)))
      );
      const denominatorActive = builder.sign(
        builder.maximum(zero, builder.subtract(denominator, constant(EPSILON)))
      );
      const safeguardedReciprocal = builder.divide(
        one,
        builder.maximum(denominator, constant(EPSILON))
      );
      let radialFactor = builder.multiply(
        denominatorActive,
        builder.minimum(safeguardedReciprocal, four)
      );
      if (seamBlendDegrees > 0) {
        const seamSpread = builder.multiply(
          pi,
          constant(seamBlendDegrees / 180)
        );
        const distanceFromSeam = builder.minimum(
          thetaMaterial,
          builder.subtract(tau, thetaMaterial)
        );
        const alpha = builder.smoothstep(zero, seamSpread, distanceFromSeam);
        radialFactor = builder.multiply(radialFactor, alpha);
      }
      const styledRadius = builder.multiply(
        baseRadius,
        builder.add(constant(0.9), builder.multiply(constant(0.35), radialFactor))
      );
      return builder.add(
        baseRadius,
        builder.multiply(
          builder.subtract(styledRadius, baseRadius),
          constant(styleValue('sfStrength'))
        )
      );
    }
  );
}

function manifestValue(
  seam: SuperformulaSeamRegularity,
  families: readonly SuperformulaPiecewiseBoundaryFamily[]
): CanonicalJsonValue {
  return {
    declarationSemantics:
      'candidate complete program-level piecewise-boundary declaration requiring independent root isolation and completeness verification',
    families: families.map((family) => ({
      exactCondition: family.exactCondition,
      id: family.id,
      regularityReason: family.regularityReason,
      requiredHandling: family.requiredHandling,
    })),
    seamRegularity: seam,
    styleId: 'SuperformulaBlossom',
  };
}

function derive(input: CanonicalTargetInputBinding): SuperformulaBlossomOuterWallTargetBinding {
  const inputProof = canonicalTargetInputForProof(input);
  if (input.style.styleId !== 'SuperformulaBlossom') {
    fail(`expected SuperformulaBlossom but received '${input.style.styleId}'`);
  }
  const seam = seamRegularity(input);
  const boundaryFamilies = buildBoundaryFamilies(input);
  const programCanonicalJson = buildProgram(input);
  const backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  const seamProofSha256 = sha256Utf8(
    [inputProof.canonicalInputSha256, backends.programSha256, seam].join('\n')
  );
  const boundaryValue = manifestValue(seam, boundaryFamilies);
  const boundaryManifestCanonicalJson = canonicalizeCertificationJson(boundaryValue);
  const boundaryManifestSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.superformula-blossom-outer-wall-target/boundary-manifest/v1',
    boundaryValue
  );
  const bindingValue = {
    backendSha256: backends.backendSha256,
    boundaryFamilyCount: boundaryFamilies.length.toString(),
    boundaryManifestSha256,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    implementationScope: SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_SCOPE,
    nodeCount: backends.nodeCount.toString(),
    patchId: 'outer-wall',
    periodicIdentificationAdmissible: true,
    programSha256: backends.programSha256,
    proofMethodSha256: SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_PROOF_SHA256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    schemaVersion: SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_VERSION,
    seamProofSha256,
    seamRegularity: seam,
    styleId: 'SuperformulaBlossom',
  } satisfies CanonicalJsonValue;
  const bindingCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const bindingSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.superformula-blossom-outer-wall-target/binding/v1',
    bindingValue
  );
  return Object.freeze({
    schemaVersion: SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_VERSION,
    implementationScope: SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_SCOPE,
    proofMethodSha256: SUPERFORMULA_BLOSSOM_OUTER_WALL_TARGET_PROOF_SHA256,
    bindingSha256,
    bindingCanonicalJson,
    canonicalInputSha256: inputProof.canonicalInputSha256,
    radialSemanticsSha256: CERTIFIED_RADIAL_OUTER_WALL_SEMANTICS_SHA256,
    patchId: 'outer-wall',
    styleId: 'SuperformulaBlossom',
    seamRegularity: seam,
    periodicIdentificationAdmissible: true,
    seamProofSha256,
    boundaryManifestCanonicalJson,
    boundaryManifestSha256,
    boundaryFamilies,
    programCanonicalJson,
    programSha256: backends.programSha256,
    nodeCount: backends.nodeCount,
    backends,
  }) as SuperformulaBlossomOuterWallTargetBinding;
}

export function createSuperformulaBlossomOuterWallTargetBinding(
  input: CanonicalTargetInputBinding
): SuperformulaBlossomOuterWallTargetBinding {
  const binding = derive(input);
  registry.set(binding, Object.freeze({ binding, input }));
  return binding;
}

export function superformulaBlossomOuterWallTargetForProof(
  value: SuperformulaBlossomOuterWallTargetBinding
): SuperformulaBlossomOuterWallTargetBinding {
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
    value.seamRegularity !== derived.seamRegularity ||
    value.periodicIdentificationAdmissible !== derived.periodicIdentificationAdmissible ||
    value.seamProofSha256 !== derived.seamProofSha256 ||
    value.boundaryManifestCanonicalJson !== derived.boundaryManifestCanonicalJson ||
    value.boundaryManifestSha256 !== derived.boundaryManifestSha256 ||
    value.boundaryFamilies !== registered.binding.boundaryFamilies ||
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
