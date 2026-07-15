import { sha256Utf8 } from './incrementalSha256';
import type {
  ValidatedResidualEnclosure,
  ValidatedResidualEnclosureRequest,
} from './continuousMappedPatchDistance';
import {
  compileValidatedResidualProgram,
  evaluateCompiledValidatedResidualProgram,
  fastEncloseCompiledValidatedResidualProgram,
  fastEncloseCompiledValidatedResidualProgramNumeric,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
  VALIDATED_RESIDUAL_PROGRAM_MAX_NODES,
  type CompiledValidatedResidualProgram,
} from './validatedResidualProgram';

export const VALIDATED_RESIDUAL_EVALUATOR_REGISTRY_VERSION =
  'potfoundry.validated-residual-evaluator-registry/v8' as const;

declare const registeredValidatedResidualEvaluatorBrand: unique symbol;

/** Opaque runtime capability. Structural lookalikes are rejected by a private WeakMap. */
export interface RegisteredValidatedResidualEvaluator {
  readonly patchId: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly evaluatorSourceSha256: string;
  readonly evaluatorProofSha256: string;
  readonly evaluatorProgramSha256: string;
  /** Authenticated conservative evaluator work charge per residual cell. */
  readonly evaluatorWorkUnitsPerCell: number;
  readonly evaluatorCompilerVersion: typeof VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION;
  readonly evaluatorCompilerProofSha256: string;
  readonly targetSha256: string;
  readonly encloseResidual: (
    request: ValidatedResidualEnclosureRequest
  ) => ValidatedResidualEnclosure;
  /**
   * Centered mean-value screen over the same compiled program in outward
   * float64 intervals. A non-null enclosure is sound for acceptance; `null`
   * means unavailable and the validated `encloseResidual` remains authority.
   */
  readonly encloseResidualFast: (
    request: ValidatedResidualEnclosureRequest
  ) => ValidatedResidualEnclosure | null;
  /**
   * Exact numeric variant of the screen for hot proof loops: integer dyadic
   * numerators (within 2^52), exact dyadic barycentric numerators, exact
   * parsed binary32 STL coordinates. Same enclosures as the string entry.
   */
  readonly encloseResidualFastNumeric: (
    uNumerators: Float64Array,
    vNumerators: Float64Array,
    fractionBits: number,
    barycentricNumerators: Float64Array,
    barycentricFractionBits: number,
    artifactVerticesMm: Float64Array
  ) => ValidatedResidualEnclosure | null;
  readonly [registeredValidatedResidualEvaluatorBrand]: true;
}

export interface ValidatedResidualEvaluatorCompilation {
  readonly targetSha256: string;
  /** Strict canonical number-free validated-residual program definition. */
  readonly programCanonicalJson: string;
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const registry = new WeakMap<object, RegisteredValidatedResidualEvaluator>();

function registrationError(message: string): never {
  throw new TypeError(`Validated residual evaluator compilation refused: ${message}`);
}

/**
 * Compile the only evaluator capability accepted by the proof kernel. The
 * public boundary accepts no JavaScript callback: executable closure state is
 * derived solely from the hashed canonical expression program and the pinned
 * outward interval compiler.
 */
export function compileValidatedResidualEvaluator(
  compilation: ValidatedResidualEvaluatorCompilation
): RegisteredValidatedResidualEvaluator {
  if (typeof compilation !== 'object' || compilation === null) {
    registrationError('compilation must be a record');
  }
  if (Object.getPrototypeOf(compilation) !== Object.prototype) {
    registrationError('compilation must be an ordinary data record');
  }
  const ownKeys = Reflect.ownKeys(compilation);
  if (
    ownKeys.length !== 2 ||
    !ownKeys.includes('programCanonicalJson') ||
    !ownKeys.includes('targetSha256')
  ) {
    registrationError('compilation has unknown or missing fields');
  }
  let targetSha256: unknown;
  let programCanonicalJson: unknown;
  for (const key of ownKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(compilation, key);
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      registrationError('compilation must contain only enumerable data properties');
    }
    if (key === 'targetSha256') targetSha256 = descriptor.value;
    if (key === 'programCanonicalJson') programCanonicalJson = descriptor.value;
  }
  if (
    typeof targetSha256 !== 'string' ||
    !SHA256_RE.test(targetSha256) ||
    typeof programCanonicalJson !== 'string'
  ) {
    registrationError('target hash or canonical program is invalid');
  }
  let program: CompiledValidatedResidualProgram;
  try {
    program = compileValidatedResidualProgram(programCanonicalJson);
  } catch (error) {
    registrationError(error instanceof Error ? error.message : 'program compiler refused');
  }

  const evaluatorSourceSha256 = sha256Utf8(
    [
      VALIDATED_RESIDUAL_EVALUATOR_REGISTRY_VERSION,
      VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
      VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
      program.programSha256,
      targetSha256,
    ].join('\n')
  );
  const evaluatorProofSha256 = sha256Utf8(
    [
      VALIDATED_RESIDUAL_EVALUATOR_REGISTRY_VERSION,
      evaluatorSourceSha256,
      'no-callback canonical-target-program compilation with compiler-derived residual',
      'acceptance-only centered mean-value float64 screen derived from the same compiled program; refusals defer to the validated decimal enclosure',
      'the screen additionally accepts an exact numeric cell encoding (integer dyadic numerators within 2^52, exact parsed binary32 STL coordinates) that yields identical enclosures to the canonical string encoding',
      `node-count=${program.nodeCount}`,
    ].join('\n')
  );
  const encloseResidual = Object.freeze(
    (request: ValidatedResidualEnclosureRequest): ValidatedResidualEnclosure =>
      evaluateCompiledValidatedResidualProgram(program, request)
  );
  const encloseResidualFast = Object.freeze(
    (request: ValidatedResidualEnclosureRequest): ValidatedResidualEnclosure | null =>
      fastEncloseCompiledValidatedResidualProgram(program, request)
  );
  const encloseResidualFastNumeric = Object.freeze(
    (
      uNumerators: Float64Array,
      vNumerators: Float64Array,
      fractionBits: number,
      barycentricNumerators: Float64Array,
      barycentricFractionBits: number,
      artifactVerticesMm: Float64Array
    ): ValidatedResidualEnclosure | null =>
      fastEncloseCompiledValidatedResidualProgramNumeric(
        program,
        uNumerators,
        vNumerators,
        fractionBits,
        barycentricNumerators,
        barycentricFractionBits,
        artifactVerticesMm
      )
  );
  const handle = Object.freeze({
    patchId: program.patchId,
    evaluatorId: program.evaluatorId,
    evaluatorVersion: program.evaluatorVersion,
    evaluatorSourceSha256,
    evaluatorProofSha256,
    evaluatorProgramSha256: program.programSha256,
    evaluatorWorkUnitsPerCell: program.nodeCount,
    evaluatorCompilerVersion: VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
    evaluatorCompilerProofSha256: VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
    targetSha256,
    encloseResidual,
    encloseResidualFast,
    encloseResidualFastNumeric,
  }) as RegisteredValidatedResidualEvaluator;
  registry.set(handle, handle);
  return handle;
}

/** Internal proof-kernel resolver; rejects frozen structural copies and deserialized records. */
export function registeredValidatedResidualEvaluatorForProof(
  value: unknown
): RegisteredValidatedResidualEvaluator {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    registrationError('evaluator handle is not registered');
  }
  const registered = registry.get(value);
  if (registered === undefined) registrationError('evaluator handle is not registered');
  if (
    !Number.isSafeInteger(registered.evaluatorWorkUnitsPerCell) ||
    registered.evaluatorWorkUnitsPerCell <= 0 ||
    registered.evaluatorWorkUnitsPerCell > VALIDATED_RESIDUAL_PROGRAM_MAX_NODES
  ) {
    registrationError('registered evaluator work charge is invalid');
  }
  return registered;
}
