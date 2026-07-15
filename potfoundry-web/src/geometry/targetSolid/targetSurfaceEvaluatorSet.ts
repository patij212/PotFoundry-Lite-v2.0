import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type CompleteMappedGeometryTargetBinding,
} from './completeMappedArtifactGeometry';
import { sha256Utf8 } from './incrementalSha256';
import {
  targetSurfaceComplexForProof,
  type TargetSurfaceComplexBinding,
} from './targetSurfaceComplex';
import {
  registeredValidatedResidualEvaluatorForProof,
  type RegisteredValidatedResidualEvaluator,
} from './validatedResidualEvaluatorRegistry';
import {
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
} from './validatedResidualProgram';

export const TARGET_SURFACE_EVALUATOR_SET_VERSION =
  'potfoundry.target-surface-evaluator-set/v1' as const;
export const TARGET_SURFACE_EVALUATOR_SET_SCOPE =
  'authenticated-validated-target-programs-only-no-cpu-wgsl-parity-or-geometric-regularity' as const;
export const TARGET_SURFACE_EVALUATOR_SET_PROOF_SHA256 = sha256Utf8(
  [
    TARGET_SURFACE_EVALUATOR_SET_VERSION,
    `scope=${TARGET_SURFACE_EVALUATOR_SET_SCOPE}`,
    'surface complex is a WeakMap-authenticated and rederived abstract-complex capability',
    'complete mapped geometry target is derived only from that authenticated surface complex',
    'evaluator input is an exact ordinary dense data array with no accessors or extra properties',
    'one WeakMap-authenticated validated residual evaluator is required in exact sorted patch order',
    'every evaluator patch id and compiled program hash equals its surface-complex declaration',
    'every evaluator target hash equals the derived complete mapped geometry target hash',
    'compiler version and proof hash equal the pinned validated target-program compiler',
    'structural copies, omissions, duplicates, stale targets, arbitrary callbacks, and mismatches refuse',
    'this binding proves executable validated-program provenance only; it does not prove CPU/WGSL parity, target regularity, distance, topology of the geometric image, or artifact certification',
  ].join('\n')
);

declare const targetSurfaceEvaluatorSetBrand: unique symbol;

export interface TargetSurfaceEvaluatorSetBinding {
  readonly schemaVersion: typeof TARGET_SURFACE_EVALUATOR_SET_VERSION;
  readonly implementationScope: typeof TARGET_SURFACE_EVALUATOR_SET_SCOPE;
  readonly proofMethodSha256: string;
  readonly evaluatorSetSha256: string;
  readonly evaluatorSetCanonicalJson: string;
  readonly targetSurfaceComplexSha256: string;
  readonly completeMappedTargetSha256: string;
  readonly targetPatchManifestSha256: string;
  readonly canonicalInputSha256: string;
  readonly surfaceComplex: TargetSurfaceComplexBinding;
  readonly geometryTarget: CompleteMappedGeometryTargetBinding;
  readonly evaluators: readonly RegisteredValidatedResidualEvaluator[];
  readonly [targetSurfaceEvaluatorSetBrand]: true;
}

export type TargetSurfaceEvaluatorSetErrorCode =
  | 'INVALID_INPUT'
  | 'PATCH_SET_MISMATCH'
  | 'PROGRAM_MISMATCH'
  | 'TARGET_MISMATCH'
  | 'COMPILER_MISMATCH'
  | 'BINDING_INVALID';

export class TargetSurfaceEvaluatorSetError extends Error {
  readonly code: TargetSurfaceEvaluatorSetErrorCode;
  readonly patchId?: string;

  constructor(
    code: TargetSurfaceEvaluatorSetErrorCode,
    message: string,
    patchId?: string
  ) {
    super(message);
    this.name = 'TargetSurfaceEvaluatorSetError';
    this.code = code;
    this.patchId = patchId;
  }
}

interface DerivedEvaluatorSet {
  readonly surfaceComplex: TargetSurfaceComplexBinding;
  readonly geometryTarget: CompleteMappedGeometryTargetBinding;
  readonly evaluators: readonly RegisteredValidatedResidualEvaluator[];
  readonly evaluatorSetSha256: string;
  readonly evaluatorSetCanonicalJson: string;
}

interface RegisteredEvaluatorSet {
  readonly binding: TargetSurfaceEvaluatorSetBinding;
  readonly surfaceComplex: TargetSurfaceComplexBinding;
  readonly evaluators: readonly RegisteredValidatedResidualEvaluator[];
}

const evaluatorSetRegistry = new WeakMap<object, RegisteredEvaluatorSet>();

function fail(
  code: TargetSurfaceEvaluatorSetErrorCode,
  message: string,
  patchId?: string
): never {
  throw new TargetSurfaceEvaluatorSetError(code, message, patchId);
}

function snapshotDenseEvaluatorArray(
  value: readonly RegisteredValidatedResidualEvaluator[]
): readonly RegisteredValidatedResidualEvaluator[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    fail('INVALID_INPUT', 'Evaluator set must be an ordinary dense data array');
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== value.length + 1 ||
    !ownKeys.includes('length') ||
    ownKeys.some(
      (key) =>
        typeof key !== 'string' ||
        (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key))
    )
  ) {
    fail('INVALID_INPUT', 'Evaluator array must not contain holes or extra properties');
  }
  const snapshot: RegisteredValidatedResidualEvaluator[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index.toString());
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      fail('INVALID_INPUT', `Evaluator array index ${index} must be an enumerable data property`);
    }
    snapshot.push(registeredValidatedResidualEvaluatorForProof(descriptor.value));
  }
  return Object.freeze(snapshot);
}

function deriveEvaluatorSet(
  surfaceValue: TargetSurfaceComplexBinding,
  evaluatorValues: readonly RegisteredValidatedResidualEvaluator[]
): DerivedEvaluatorSet {
  const surfaceComplex = targetSurfaceComplexForProof(surfaceValue);
  const evaluators = snapshotDenseEvaluatorArray(evaluatorValues);
  const geometryTarget =
    createCompleteMappedGeometryTargetBindingFromSurfaceComplex(surfaceComplex);
  if (evaluators.length !== surfaceComplex.patches.length) {
    fail(
      'PATCH_SET_MISMATCH',
      `Expected ${surfaceComplex.patches.length} evaluators but received ${evaluators.length}`
    );
  }
  const evaluatorManifest: CanonicalJsonValue[] = [];
  for (let index = 0; index < evaluators.length; index += 1) {
    const evaluator = evaluators[index];
    const patch = surfaceComplex.patches[index];
    if (evaluator.patchId !== patch.patchId) {
      fail(
        'PATCH_SET_MISMATCH',
        `Evaluator ${index} patch '${evaluator.patchId}' does not equal '${patch.patchId}'`,
        patch.patchId
      );
    }
    if (evaluator.evaluatorProgramSha256 !== patch.declaredEvaluatorProgramSha256) {
      fail('PROGRAM_MISMATCH', 'Evaluator program does not match the declared patch program', patch.patchId);
    }
    if (evaluator.targetSha256 !== geometryTarget.targetSha256) {
      fail('TARGET_MISMATCH', 'Evaluator was compiled for a different complete target', patch.patchId);
    }
    if (
      evaluator.evaluatorCompilerVersion !== VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION ||
      evaluator.evaluatorCompilerProofSha256 !==
        VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256
    ) {
      fail('COMPILER_MISMATCH', 'Evaluator does not use the pinned validated compiler', patch.patchId);
    }
    evaluatorManifest.push({
      evaluatorCompilerProofSha256: evaluator.evaluatorCompilerProofSha256,
      evaluatorCompilerVersion: evaluator.evaluatorCompilerVersion,
      evaluatorId: evaluator.evaluatorId,
      evaluatorWorkUnitsPerCell: evaluator.evaluatorWorkUnitsPerCell.toString(),
      evaluatorProgramSha256: evaluator.evaluatorProgramSha256,
      evaluatorProofSha256: evaluator.evaluatorProofSha256,
      evaluatorSourceSha256: evaluator.evaluatorSourceSha256,
      evaluatorVersion: evaluator.evaluatorVersion,
      patchId: evaluator.patchId,
      targetSha256: evaluator.targetSha256,
    });
  }
  const bindingValue = {
    canonicalInputSha256: surfaceComplex.canonicalInputSha256,
    completeMappedTargetSha256: geometryTarget.targetSha256,
    evaluatorManifest,
    implementationScope: TARGET_SURFACE_EVALUATOR_SET_SCOPE,
    proofMethodSha256: TARGET_SURFACE_EVALUATOR_SET_PROOF_SHA256,
    schemaVersion: TARGET_SURFACE_EVALUATOR_SET_VERSION,
    targetPatchManifestSha256: geometryTarget.targetPatchManifestSha256,
    targetSurfaceComplexSha256: surfaceComplex.targetSurfaceComplexSha256,
  } satisfies CanonicalJsonValue;
  const evaluatorSetCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const evaluatorSetSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.target-surface-evaluator-set/binding/v1',
    bindingValue
  );
  return Object.freeze({
    surfaceComplex,
    geometryTarget,
    evaluators,
    evaluatorSetSha256,
    evaluatorSetCanonicalJson,
  });
}

/** Bind every declared target patch to one authenticated validated-program evaluator. */
export function createTargetSurfaceEvaluatorSetBinding(
  surfaceComplex: TargetSurfaceComplexBinding,
  evaluators: readonly RegisteredValidatedResidualEvaluator[]
): TargetSurfaceEvaluatorSetBinding {
  const derived = deriveEvaluatorSet(surfaceComplex, evaluators);
  const binding = Object.freeze({
    schemaVersion: TARGET_SURFACE_EVALUATOR_SET_VERSION,
    implementationScope: TARGET_SURFACE_EVALUATOR_SET_SCOPE,
    proofMethodSha256: TARGET_SURFACE_EVALUATOR_SET_PROOF_SHA256,
    evaluatorSetSha256: derived.evaluatorSetSha256,
    evaluatorSetCanonicalJson: derived.evaluatorSetCanonicalJson,
    targetSurfaceComplexSha256: derived.surfaceComplex.targetSurfaceComplexSha256,
    completeMappedTargetSha256: derived.geometryTarget.targetSha256,
    targetPatchManifestSha256: derived.geometryTarget.targetPatchManifestSha256,
    canonicalInputSha256: derived.surfaceComplex.canonicalInputSha256,
    surfaceComplex: derived.surfaceComplex,
    geometryTarget: derived.geometryTarget,
    evaluators: derived.evaluators,
  }) as TargetSurfaceEvaluatorSetBinding;
  evaluatorSetRegistry.set(
    binding,
    Object.freeze({
      binding,
      surfaceComplex: derived.surfaceComplex,
      evaluators: derived.evaluators,
    })
  );
  return binding;
}

/** Internal proof boundary; reauthenticates and rederives the full evaluator set. */
export function targetSurfaceEvaluatorSetForProof(
  value: TargetSurfaceEvaluatorSetBinding
): TargetSurfaceEvaluatorSetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('BINDING_INVALID', 'Evaluator-set binding must be an authenticated capability');
  }
  const registered = evaluatorSetRegistry.get(value);
  if (registered === undefined || registered.binding !== value) {
    fail('BINDING_INVALID', 'Evaluator-set binding must be an authenticated capability');
  }
  const derived = deriveEvaluatorSet(registered.surfaceComplex, registered.evaluators);
  const binding = registered.binding;
  if (
    binding.schemaVersion !== TARGET_SURFACE_EVALUATOR_SET_VERSION ||
    binding.implementationScope !== TARGET_SURFACE_EVALUATOR_SET_SCOPE ||
    binding.proofMethodSha256 !== TARGET_SURFACE_EVALUATOR_SET_PROOF_SHA256 ||
    binding.evaluatorSetSha256 !== derived.evaluatorSetSha256 ||
    binding.evaluatorSetCanonicalJson !== derived.evaluatorSetCanonicalJson ||
    binding.targetSurfaceComplexSha256 !== derived.surfaceComplex.targetSurfaceComplexSha256 ||
    binding.completeMappedTargetSha256 !== derived.geometryTarget.targetSha256 ||
    binding.targetPatchManifestSha256 !== derived.geometryTarget.targetPatchManifestSha256 ||
    binding.canonicalInputSha256 !== derived.surfaceComplex.canonicalInputSha256 ||
    binding.surfaceComplex !== registered.surfaceComplex ||
    binding.geometryTarget.targetSha256 !== derived.geometryTarget.targetSha256 ||
    binding.evaluators.length !== derived.evaluators.length ||
    binding.evaluators.some((evaluator, index) => evaluator !== derived.evaluators[index])
  ) {
    fail('BINDING_INVALID', 'Evaluator-set capability fields are inconsistent');
  }
  return binding;
}
