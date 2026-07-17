import {
  domainSeparatedCanonicalJsonSha256,
  parseCanonicalCertificationJson,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  certifyContinuousMappedPatchDistance,
  CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_EVALUATOR_WORK_UNITS,
  CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_WORK_CELLS,
  CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS,
  CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS,
  ContinuousMappedPatchDistanceError,
  type ContinuousMappedPatchDistanceOptions,
  type ContinuousMappedPatchDistanceResult,
  type RegisteredValidatedResidualEvaluator,
} from './continuousMappedPatchDistance';
import {
  DEFAULT_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
  DEFAULT_DYADIC_PARTITION_MAX_BUILD_WORK,
  DEFAULT_DYADIC_PARTITION_MAX_BVH_NODES,
  DEFAULT_DYADIC_PARTITION_MAX_PAIR_CHECKS,
  DEFAULT_DYADIC_PARTITION_MAX_TRIANGLES,
  DEFAULT_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
  ExactDyadicDomainPartitionError,
  HARD_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
  HARD_DYADIC_PARTITION_MAX_BUILD_WORK,
  HARD_DYADIC_PARTITION_MAX_BVH_NODES,
  HARD_DYADIC_PARTITION_MAX_ELAPSED_MILLISECONDS,
  HARD_DYADIC_PARTITION_MAX_PAIR_CHECKS,
  HARD_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
  HARD_DYADIC_PARTITION_MAX_TRIANGLES,
  snapshotExactDyadicDomainPartitionInputForProof,
  type ExactDyadicDomainPartitionInput,
} from './exactDyadicDomainPartition';
import { COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION } from './completeMappedGeometryTargetDefinition';
import { sha256Utf8 } from './incrementalSha256';
import {
  parsedMappedArtifactForProofSession,
  type MappedArtifactProofSession,
  type ParsedMappedArtifact,
} from './mappedArtifactProofSession';
import { TARGET_SOLID_SPECIFICATION_SHA256 } from './targetSolidSpecification';
import {
  completeMappedTargetDefinitionJsonForSurfaceComplex,
  targetSurfaceComplexForProof,
  type TargetSurfaceComplexBinding,
} from './targetSurfaceComplex';
import { registeredValidatedResidualEvaluatorForProof } from './validatedResidualEvaluatorRegistry';

export { COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION } from './completeMappedGeometryTargetDefinition';

export const COMPLETE_MAPPED_ARTIFACT_GEOMETRY_VERSION =
  'potfoundry.complete-mapped-artifact-geometry/v10' as const;
export const COMPLETE_MAPPED_ARTIFACT_GEOMETRY_PROOF_SHA256 = sha256Utf8(
  [
    COMPLETE_MAPPED_ARTIFACT_GEOMETRY_VERSION,
    'target hash and the complete sorted patch manifest are derived together from one strict canonical number-free target definition',
    'the target definition commits the authenticated canonical geometry/style input and the exact G0 target-solid specification hash',
    'the immutable target handle is WeakMap-authenticated and rederived from registry-held canonical source before proof',
    'target origin is explicit: raw caller definition or an independently reauthenticated target-surface-complex capability',
    'raw caller definitions support low-level distance proofs but cannot satisfy a canonical-target provenance gate',
    'each target patch is defined by one validated target x/y/z program SHA-256; residual subtraction is compiler-derived and every executed evaluator must match it',
    'final binary-STL, 3MF, or OBJ artifact session and every evaluator are authenticated capabilities; structural copies refuse',
    'one executed continuous mapped-patch proof is required for every expected target patch',
    'every parsed final-artifact triangle index is assigned to exactly one patch; duplicates and omissions refuse',
    'global geometric upper = exact maximum of all executed two-sided patch bounds',
    'all jobs/options are snapshotted and every child proof binding is rechecked before success',
    'assignment memory, patch proof, evaluator mismatch, cancellation, or resource exhaustion refuses',
    'assignment memory has an absolute ceiling and aggregate subdivision cells plus authenticated evaluator node executions are capped across every patch',
    'job-count mismatch and evaluator/target mismatch refuse before any partition mapping copy',
    'one authenticated immutable partition snapshot is reused through all proof layers; aggregate mappings cannot exceed the parsed artifact triangle count or the hard browser envelope',
    'partition construction and pair-audit work, subdivision cells, and authenticated evaluator node executions are capped across every patch',
    'one non-raiseable wall-clock deadline is shared across snapshots and every child proof',
    'scope = continuous two-sided geometry only; no topology, feature, thickness, numerical-budget, or full-certificate claim',
  ].join('\n')
);

declare const completeMappedGeometryTargetBindingBrand: unique symbol;

export interface CompleteMappedGeometryTargetBinding {
  readonly targetSha256: string;
  readonly targetPatchManifestSha256: string;
  readonly targetDefinitionVersion: typeof COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION;
  readonly canonicalInputSha256: string;
  readonly targetSolidSpecificationSha256: string;
  readonly expectedPatchIds: readonly string[];
  readonly expectedEvaluatorProgramSha256s: readonly string[];
  readonly targetDefinitionOrigin:
    | 'caller-supplied-canonical-definition'
    | 'authenticated-target-surface-complex';
  readonly authenticatedSurfaceComplexProvenance: boolean;
  readonly targetSurfaceComplexSha256?: string;
  readonly [completeMappedGeometryTargetBindingBrand]: true;
}

export interface MappedPatchProofJob {
  readonly partition: ExactDyadicDomainPartitionInput;
  readonly evaluator: RegisteredValidatedResidualEvaluator;
}

/** One worker-computed patch outcome: exactly one of proof / refusal. */
export interface ParallelPatchProofOutcome {
  readonly proof?: ContinuousMappedPatchDistanceResult;
  readonly refusal?: {
    readonly code: 'CANCELLED' | 'RESOURCE_LIMIT' | 'REFUSED';
    readonly message: string;
    readonly artifactTriangleIndex?: number;
  };
}

export const PARALLEL_PATCH_PROOFS_VERSION =
  'potfoundry.parallel-patch-proofs/v1' as const;

/**
 * Unforgeable in-process container of worker-computed patch outcomes. The
 * sequential prover replays these through its canonical budget arithmetic, so
 * aggregation and refusal ordering stay byte-identical to sequential runs.
 * Structural lookalikes that were not minted by the proof kernel refuse.
 */
export interface MintedParallelPatchProofs {
  readonly version: typeof PARALLEL_PATCH_PROOFS_VERSION;
  readonly patchCount: number;
}

const mintedParallelPatchProofs = new WeakMap<
  MintedParallelPatchProofs,
  ReadonlyMap<string, ParallelPatchProofOutcome>
>();

/** Internal proof-kernel bridge: outcomes MUST come from the parallel patch-proof pool. */
export function mintParallelPatchProofsForProofKernel(
  outcomes: ReadonlyMap<string, ParallelPatchProofOutcome>
): MintedParallelPatchProofs {
  const token = Object.freeze({
    version: PARALLEL_PATCH_PROOFS_VERSION,
    patchCount: outcomes.size,
  });
  mintedParallelPatchProofs.set(token, outcomes);
  return token;
}

function parallelPatchProofsForProof(
  value: unknown
): ReadonlyMap<string, ParallelPatchProofOutcome> {
  if (typeof value !== 'object' || value === null) {
    fail('INVALID_INPUT', 'parallelPatchProofs container is invalid');
  }
  const outcomes = mintedParallelPatchProofs.get(value as MintedParallelPatchProofs);
  if (outcomes === undefined) {
    fail(
      'INVALID_INPUT',
      'parallelPatchProofs was not minted by the parallel patch-proof kernel'
    );
  }
  return outcomes;
}

export interface CompleteMappedArtifactGeometryOptions {
  readonly maximumGeometricUpperPm: bigint;
  readonly maxAssignmentBytes?: number;
  readonly maxTotalWorkCells?: number;
  readonly maxTotalEvaluatorWorkUnits?: number;
  readonly maxTotalPartitionWorkUnits?: number;
  readonly maxElapsedMilliseconds?: number;
  readonly patchProof?: Omit<
    ContinuousMappedPatchDistanceOptions,
    | 'maximumGeometricUpperPm'
    | 'cancellationFlag'
    | 'progressCounter'
    | 'deadlineEpochMilliseconds'
  >;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
  /**
   * Worker-computed per-patch outcomes minted by the parallel patch-proof
   * pool. When present, the prover REPLAYS them through the identical
   * sequential budget arithmetic instead of re-running the per-patch proofs;
   * every binding and aggregate check still runs. Omit for the sequential
   * path (bit-identical legacy behaviour).
   */
  readonly parallelPatchProofs?: MintedParallelPatchProofs;
}

export type CompleteMappedArtifactGeometryErrorCode =
  | 'INVALID_INPUT'
  | 'PATCH_SET_INVALID'
  | 'DUPLICATE_ASSIGNMENT'
  | 'UNASSIGNED_TRIANGLE'
  | 'PATCH_PROOF_REFUSED'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED';

export class CompleteMappedArtifactGeometryError extends Error {
  readonly code: CompleteMappedArtifactGeometryErrorCode;
  readonly patchId?: string;
  readonly artifactTriangleIndex?: number;

  constructor(
    code: CompleteMappedArtifactGeometryErrorCode,
    message: string,
    patchId?: string,
    artifactTriangleIndex?: number
  ) {
    super(message);
    this.name = 'CompleteMappedArtifactGeometryError';
    this.code = code;
    this.patchId = patchId;
    this.artifactTriangleIndex = artifactTriangleIndex;
  }
}

export interface CompleteMappedArtifactGeometryResult {
  readonly proofVersion: typeof COMPLETE_MAPPED_ARTIFACT_GEOMETRY_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly targetSha256: string;
  readonly targetPatchManifestSha256: string;
  readonly targetDefinitionVersion: typeof COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION;
  readonly canonicalInputSha256: string;
  readonly targetSolidSpecificationSha256: string;
  readonly targetDefinitionOrigin:
    | 'caller-supplied-canonical-definition'
    | 'authenticated-target-surface-complex';
  readonly authenticatedSurfaceComplexProvenance: boolean;
  readonly targetSurfaceComplexSha256?: string;
  readonly artifactFormat: 'stl' | '3mf' | 'obj';
  readonly artifactByteSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly artifactTriangleCount: number;
  readonly patchCount: number;
  readonly assignedTriangleCount: number;
  readonly totalWorkCellCount: number;
  readonly totalEvaluatorWorkUnitCount: number;
  readonly totalPartitionWorkUnitCount: number;
  readonly geometricTwoSidedUpperPm: string;
  readonly patchProofs: readonly ContinuousMappedPatchDistanceResult[];
  readonly scanComplete: true;
  readonly continuousTwoSidedGeometryProven: true;
  readonly implementationScope: 'geometry-only-no-solid-certificate';
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[a-z0-9](?:[a-z0-9._:/-]{0,127})$/;
const DEFAULT_MAX_ASSIGNMENT_BYTES = 64 * 1024 * 1024;
const HARD_MAX_ASSIGNMENT_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_WORK_CELLS = 4_000_000;
// Envelope v4 (2026-07-17): aggregate hard ceiling 8M -> 16M — two Gothic
// chain-config walls at ~4M each plus ~165k small-patch cells measure ~8.4M
// total; 16M leaves the same ~2x headroom the per-patch raise carries.
// The DEFAULT is unchanged.
const HARD_MAX_TOTAL_WORK_CELLS = 16_000_000;
const DEFAULT_MAX_TOTAL_EVALUATOR_WORK_UNITS = 100_000_000;
const HARD_MAX_TOTAL_EVALUATOR_WORK_UNITS = 250_000_000;
const DEFAULT_MAX_TOTAL_PARTITION_WORK_UNITS = 160_000_000;
const HARD_MAX_TOTAL_PARTITION_WORK_UNITS = 400_000_000;
const DEFAULT_MAX_ELAPSED_MILLISECONDS = 15_000;
const HARD_MAX_ELAPSED_MILLISECONDS =
  HARD_DYADIC_PARTITION_MAX_ELAPSED_MILLISECONDS;
const HARD_MAX_TOTAL_MAPPED_TRIANGLES = 1_048_576;
const MAX_CERTIFICATION_PM = 1_000_000_000_000_000_000n;
const MAX_TARGET_PATCHES = 4_096;

interface RegisteredTargetBinding {
  readonly binding: CompleteMappedGeometryTargetBinding;
  readonly canonicalTargetDefinitionJson: string;
  readonly surfaceComplex?: TargetSurfaceComplexBinding;
}

interface DerivedTargetDefinition {
  readonly targetSha256: string;
  readonly canonicalInputSha256: string;
  readonly targetSolidSpecificationSha256: string;
  readonly expectedPatchIds: readonly string[];
  readonly expectedEvaluatorProgramSha256s: readonly string[];
}

const targetBindingRegistry = new WeakMap<object, RegisteredTargetBinding>();

function fail(
  code: CompleteMappedArtifactGeometryErrorCode,
  message: string,
  patchId?: string,
  triangleIndex?: number
): never {
  throw new CompleteMappedArtifactGeometryError(code, message, patchId, triangleIndex);
}

function validateAtomicCounter(counter: Int32Array | undefined, label: string): void {
  if (counter === undefined) return;
  if (
    counter.length < 1 ||
    typeof SharedArrayBuffer === 'undefined' ||
    !(counter.buffer instanceof SharedArrayBuffer)
  ) {
    fail('INVALID_INPUT', `${label} must contain index 0 and be backed by SharedArrayBuffer`);
  }
}

function checkCancelled(flag: Int32Array | undefined, deadlineEpochMilliseconds?: number): void {
  if (flag !== undefined && Atomics.load(flag, 0) !== 0) {
    fail('CANCELLED', 'Complete mapped-artifact proof cancelled');
  }
  if (
    deadlineEpochMilliseconds !== undefined &&
    Date.now() > deadlineEpochMilliseconds
  ) {
    fail('RESOURCE_LIMIT', 'Complete mapped-artifact proof exceeded its elapsed-time deadline');
  }
}

function boundedPositiveOption(
  value: number | undefined,
  fallback: number,
  hardMaximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    fail('INVALID_INPUT', `${label} must be a positive safe integer`);
  }
  if (resolved > hardMaximum) {
    fail('RESOURCE_LIMIT', `${label} exceeds hard limit ${hardMaximum}`);
  }
  return resolved;
}

function sortedUniqueIds(ids: readonly string[]): boolean {
  return ids.every(
    (id, index) =>
      typeof id === 'string' &&
      ID_RE.test(id) &&
      (index === 0 || (typeof ids[index - 1] === 'string' && ids[index - 1] < id))
  );
}

export function computeCompleteMappedTargetPatchManifestSha256(
  targetSha256: string,
  expectedPatchIds: readonly string[]
): string {
  if (
    typeof targetSha256 !== 'string' ||
    !SHA256_RE.test(targetSha256) ||
    !Array.isArray(expectedPatchIds)
  ) {
    fail('INVALID_INPUT', 'Target patch manifest inputs are invalid');
  }
  const ids = Object.freeze([...expectedPatchIds]);
  if (ids.length === 0 || !sortedUniqueIds(ids)) {
    fail('INVALID_INPUT', 'Target patch ids must be non-empty, unique, and sorted');
  }
  return domainSeparatedCanonicalJsonSha256(
    'potfoundry.complete-mapped-artifact-geometry/target-patch-manifest/v1',
    { expectedPatchIds: ids, targetSha256 }
  );
}

function canonicalRecord(
  value: CanonicalJsonValue,
  label: string
): { readonly [key: string]: CanonicalJsonValue } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_INPUT', `${label} must be a canonical JSON object`);
  }
  return value as { readonly [key: string]: CanonicalJsonValue };
}

function exactKeys(
  value: { readonly [key: string]: CanonicalJsonValue },
  expected: readonly string[],
  label: string
): void {
  const actual = Object.keys(value).sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail('INVALID_INPUT', `${label} has unknown or missing fields`);
  }
}

function deriveCanonicalTargetDefinition(
  canonicalTargetDefinitionJson: unknown
): DerivedTargetDefinition {
  const parsed = parseCanonicalCertificationJson(canonicalTargetDefinitionJson);
  if (!parsed.ok) {
    fail('INVALID_INPUT', `Target definition refused: ${parsed.reason}`);
  }
  const definition = canonicalRecord(parsed.value, 'Target definition');
  exactKeys(definition, ['patches', 'schemaVersion', 'targetPayload'], 'Target definition');
  if (definition.schemaVersion !== COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION) {
    fail('INVALID_INPUT', 'Target definition schemaVersion is unsupported');
  }
  if (!Array.isArray(definition.patches)) {
    fail('INVALID_INPUT', 'Target definition patches must be an array');
  }
  if (definition.patches.length === 0 || definition.patches.length > MAX_TARGET_PATCHES) {
    fail('INVALID_INPUT', `Target definition must contain 1..${MAX_TARGET_PATCHES} patches`);
  }
  const targetPayload = canonicalRecord(definition.targetPayload, 'Target payload');
  exactKeys(
    targetPayload,
    ['canonicalInputSha256', 'targetSolidSpecificationSha256'],
    'Target payload'
  );
  if (
    typeof targetPayload.canonicalInputSha256 !== 'string' ||
    !SHA256_RE.test(targetPayload.canonicalInputSha256) ||
    targetPayload.targetSolidSpecificationSha256 !== TARGET_SOLID_SPECIFICATION_SHA256
  ) {
    fail('INVALID_INPUT', 'Target payload input/specification binding is invalid');
  }
  const expectedPatchIds: string[] = [];
  const expectedEvaluatorProgramSha256s: string[] = [];
  for (let index = 0; index < definition.patches.length; index += 1) {
    const patch = canonicalRecord(definition.patches[index], `Target patch ${index}`);
    exactKeys(patch, ['patchId', 'targetPatchPayload'], `Target patch ${index}`);
    if (typeof patch.patchId !== 'string' || !ID_RE.test(patch.patchId)) {
      fail('INVALID_INPUT', `Target patch ${index} has an invalid patchId`);
    }
    const targetPatchPayload = canonicalRecord(
      patch.targetPatchPayload,
      `Target patch ${index} payload`
    );
    exactKeys(
      targetPatchPayload,
      ['validatedEvaluatorProgramSha256'],
      `Target patch ${index} payload`
    );
    if (
      typeof targetPatchPayload.validatedEvaluatorProgramSha256 !== 'string' ||
      !SHA256_RE.test(targetPatchPayload.validatedEvaluatorProgramSha256)
    ) {
      fail('INVALID_INPUT', `Target patch ${index} evaluator program hash is invalid`);
    }
    expectedPatchIds.push(patch.patchId);
    expectedEvaluatorProgramSha256s.push(
      targetPatchPayload.validatedEvaluatorProgramSha256
    );
  }
  const frozenIds = Object.freeze(expectedPatchIds);
  if (!sortedUniqueIds(frozenIds)) {
    fail('INVALID_INPUT', 'Target definition patch ids must be unique and sorted');
  }
  return Object.freeze({
    targetSha256: domainSeparatedCanonicalJsonSha256(
      'potfoundry.complete-mapped-artifact-geometry/target-definition/v1',
      parsed.value
    ),
    canonicalInputSha256: targetPayload.canonicalInputSha256,
    targetSolidSpecificationSha256: targetPayload.targetSolidSpecificationSha256,
    expectedPatchIds: frozenIds,
    expectedEvaluatorProgramSha256s: Object.freeze(expectedEvaluatorProgramSha256s),
  });
}

function mintCompleteMappedGeometryTargetBinding(
  canonicalTargetDefinitionJson: string,
  provenance:
    | Readonly<{ origin: 'caller-supplied-canonical-definition' }>
    | Readonly<{
        origin: 'authenticated-target-surface-complex';
        surfaceComplex: TargetSurfaceComplexBinding;
      }>
): CompleteMappedGeometryTargetBinding {
  const derived = deriveCanonicalTargetDefinition(canonicalTargetDefinitionJson);
  const targetPatchManifestSha256 = computeCompleteMappedTargetPatchManifestSha256(
    derived.targetSha256,
    derived.expectedPatchIds
  );
  const handle = Object.freeze({
    targetSha256: derived.targetSha256,
    targetPatchManifestSha256,
    targetDefinitionVersion: COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION,
    canonicalInputSha256: derived.canonicalInputSha256,
    targetSolidSpecificationSha256: derived.targetSolidSpecificationSha256,
    expectedPatchIds: derived.expectedPatchIds,
    expectedEvaluatorProgramSha256s: derived.expectedEvaluatorProgramSha256s,
    targetDefinitionOrigin: provenance.origin,
    authenticatedSurfaceComplexProvenance:
      provenance.origin === 'authenticated-target-surface-complex',
    ...(provenance.origin === 'authenticated-target-surface-complex'
      ? { targetSurfaceComplexSha256: provenance.surfaceComplex.targetSurfaceComplexSha256 }
      : {}),
  }) as CompleteMappedGeometryTargetBinding;
  targetBindingRegistry.set(
    handle,
    Object.freeze({
      binding: handle,
      canonicalTargetDefinitionJson,
      ...(provenance.origin === 'authenticated-target-surface-complex'
        ? { surfaceComplex: provenance.surfaceComplex }
        : {}),
    })
  );
  return handle;
}

/**
 * Mint a low-level target from caller-supplied canonical JSON. This binds the
 * manifest and runtime object identity, but does not prove that the target is
 * PotFoundry's target for the declared canonical input.
 */
export function createCompleteMappedGeometryTargetBinding(
  canonicalTargetDefinitionJson: string
): CompleteMappedGeometryTargetBinding {
  return mintCompleteMappedGeometryTargetBinding(canonicalTargetDefinitionJson, {
    origin: 'caller-supplied-canonical-definition',
  });
}

/** Mint a geometry target while retaining an authenticated abstract-complex source. */
export function createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
  value: TargetSurfaceComplexBinding
): CompleteMappedGeometryTargetBinding {
  const surfaceComplex = targetSurfaceComplexForProof(value);
  return mintCompleteMappedGeometryTargetBinding(
    completeMappedTargetDefinitionJsonForSurfaceComplex(surfaceComplex),
    { origin: 'authenticated-target-surface-complex', surfaceComplex }
  );
}

/** Reauthenticate target origin and rederive every manifest field. */
export function completeMappedGeometryTargetBindingForProof(
  value: unknown
): CompleteMappedGeometryTargetBinding {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    fail('INVALID_INPUT', 'Target binding must be an authenticated immutable handle');
  }
  const registered = targetBindingRegistry.get(value);
  if (registered === undefined) {
    fail('INVALID_INPUT', 'Target binding must be an authenticated immutable handle');
  }
  const binding = registered.binding;
  let canonicalTargetDefinitionJson = registered.canonicalTargetDefinitionJson;
  if (registered.surfaceComplex !== undefined) {
    const surfaceComplex = targetSurfaceComplexForProof(registered.surfaceComplex);
    canonicalTargetDefinitionJson =
      completeMappedTargetDefinitionJsonForSurfaceComplex(surfaceComplex);
    if (
      binding.targetDefinitionOrigin !== 'authenticated-target-surface-complex' ||
      binding.authenticatedSurfaceComplexProvenance !== true ||
      binding.targetSurfaceComplexSha256 !== surfaceComplex.targetSurfaceComplexSha256 ||
      canonicalTargetDefinitionJson !== registered.canonicalTargetDefinitionJson
    ) {
      fail('INVALID_INPUT', 'Authenticated target-surface-complex provenance is inconsistent');
    }
  } else if (
    binding.targetDefinitionOrigin !== 'caller-supplied-canonical-definition' ||
    binding.authenticatedSurfaceComplexProvenance !== false ||
    binding.targetSurfaceComplexSha256 !== undefined
  ) {
    fail('INVALID_INPUT', 'Caller-supplied target provenance is inconsistent');
  }
  const derived = deriveCanonicalTargetDefinition(canonicalTargetDefinitionJson);
  const recomputed = computeCompleteMappedTargetPatchManifestSha256(
    derived.targetSha256,
    derived.expectedPatchIds
  );
  if (
    binding.targetDefinitionVersion !== COMPLETE_MAPPED_GEOMETRY_TARGET_DEFINITION_VERSION ||
    derived.targetSha256 !== binding.targetSha256 ||
    derived.canonicalInputSha256 !== binding.canonicalInputSha256 ||
    derived.targetSolidSpecificationSha256 !== binding.targetSolidSpecificationSha256 ||
    derived.expectedPatchIds.length !== binding.expectedPatchIds.length ||
    derived.expectedPatchIds.some((patchId, index) => patchId !== binding.expectedPatchIds[index]) ||
    derived.expectedEvaluatorProgramSha256s.length !==
      binding.expectedEvaluatorProgramSha256s.length ||
    derived.expectedEvaluatorProgramSha256s.some(
      (programSha256, index) =>
        programSha256 !== binding.expectedEvaluatorProgramSha256s[index]
    ) ||
    recomputed !== binding.targetPatchManifestSha256
  ) {
    fail('INVALID_INPUT', 'Target patch manifest binding is inconsistent');
  }
  return binding;
}

function snapshotJobs(
  jobs: readonly MappedPatchProofJob[],
  maxTrianglesPerPatch: number,
  maximumAggregateTriangles: number,
  cancellationFlag: Int32Array | undefined,
  deadlineEpochMilliseconds: number,
  expectedPatchIds: readonly string[],
  expectedEvaluatorProgramSha256s: readonly string[],
  expectedTargetSha256: string,
  expectedArtifactTriangleCount: number
): readonly MappedPatchProofJob[] {
  if (!Array.isArray(jobs) || Object.getPrototypeOf(jobs) !== Array.prototype) {
    throw new TypeError('Patch jobs must be an ordinary dense array');
  }
  const length = jobs.length;
  if (!Number.isSafeInteger(length) || length < 0 || length > MAX_TARGET_PATCHES) {
    throw new TypeError('Patch job array length is invalid');
  }
  if (length !== expectedPatchIds.length) {
    throw new CompleteMappedArtifactGeometryError(
      'PATCH_SET_INVALID',
      'Patch job count does not match the expected target patch count'
    );
  }
  const ownKeys = Reflect.ownKeys(jobs);
  if (
    ownKeys.length !== length + 1 ||
    !ownKeys.includes('length') ||
    ownKeys.some(
      (key) =>
        typeof key !== 'string' ||
        (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key))
    )
  ) {
    throw new TypeError('Patch job array must not contain holes or extra properties');
  }
  const snapshots: MappedPatchProofJob[] = [];
  let aggregateTriangleCount = 0;
  for (let index = 0; index < length; index += 1) {
    if ((index & 255) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
    const jobDescriptor = Object.getOwnPropertyDescriptor(jobs, index.toString());
    if (jobDescriptor?.enumerable !== true || !('value' in jobDescriptor)) {
      throw new TypeError(`Patch job ${index} must be an enumerable data property`);
    }
    const job = jobDescriptor.value as unknown;
    if (
      typeof job !== 'object' ||
      job === null ||
      Array.isArray(job) ||
      (Object.getPrototypeOf(job) !== Object.prototype && Object.getPrototypeOf(job) !== null)
    ) {
      throw new TypeError(`Patch job ${index} must be an ordinary data record`);
    }
    const jobKeys = Reflect.ownKeys(job);
    if (
      jobKeys.length !== 2 ||
      !jobKeys.includes('partition') ||
      !jobKeys.includes('evaluator')
    ) {
      throw new TypeError(`Patch job ${index} has unknown or missing fields`);
    }
    const partitionDescriptor = Object.getOwnPropertyDescriptor(job, 'partition');
    const evaluatorDescriptor = Object.getOwnPropertyDescriptor(job, 'evaluator');
    if (
      partitionDescriptor?.enumerable !== true ||
      !('value' in partitionDescriptor) ||
      evaluatorDescriptor?.enumerable !== true ||
      !('value' in evaluatorDescriptor)
    ) {
      throw new TypeError(`Patch job ${index} fields must be enumerable data properties`);
    }
    const evaluator = registeredValidatedResidualEvaluatorForProof(
      evaluatorDescriptor.value
    );
    if (
      evaluator.patchId !== expectedPatchIds[index] ||
      evaluator.targetSha256 !== expectedTargetSha256 ||
      evaluator.evaluatorProgramSha256 !== expectedEvaluatorProgramSha256s[index]
    ) {
      throw new CompleteMappedArtifactGeometryError(
        'PATCH_SET_INVALID',
        'Patch evaluator does not match the expected target manifest',
        expectedPatchIds[index]
      );
    }
    const remainingArtifactAssignments =
      maximumAggregateTriangles - aggregateTriangleCount;
    if (remainingArtifactAssignments <= 0) {
      throw new CompleteMappedArtifactGeometryError(
        'DUPLICATE_ASSIGNMENT',
        'Patch mapping record count exceeds the parsed artifact triangle domain',
        expectedPatchIds[index]
      );
    }
    const rawPartition = partitionDescriptor.value;
    if (typeof rawPartition !== 'object' || rawPartition === null) {
      throw new TypeError(`Patch job ${index} partition must be a data record`);
    }
    const rawTrianglesDescriptor = Object.getOwnPropertyDescriptor(rawPartition, 'triangles');
    const rawTriangles =
      rawTrianglesDescriptor !== undefined && 'value' in rawTrianglesDescriptor
        ? rawTrianglesDescriptor.value
        : undefined;
    if (
      Array.isArray(rawTriangles) &&
      rawTriangles.length > remainingArtifactAssignments
    ) {
      throw new CompleteMappedArtifactGeometryError(
        'DUPLICATE_ASSIGNMENT',
        'Patch mapping record count exceeds the remaining parsed artifact triangle domain',
        expectedPatchIds[index]
      );
    }
    const partition = snapshotExactDyadicDomainPartitionInputForProof(
      partitionDescriptor.value as ExactDyadicDomainPartitionInput,
      Math.min(maxTrianglesPerPatch, remainingArtifactAssignments),
      cancellationFlag,
      deadlineEpochMilliseconds
    );
    aggregateTriangleCount += partition.triangles.length;
    if (aggregateTriangleCount > maximumAggregateTriangles) {
      throw new ExactDyadicDomainPartitionError(
        'RESOURCE_LIMIT',
        `Patch mappings exceed aggregate artifact triangle count ${maximumAggregateTriangles}`
      );
    }
    if (
      partition.patchId !== expectedPatchIds[index] ||
      partition.artifactTriangleCount !== expectedArtifactTriangleCount
    ) {
      throw new CompleteMappedArtifactGeometryError(
        'PATCH_SET_INVALID',
        'Patch partition does not match the expected target or artifact',
        expectedPatchIds[index]
      );
    }
    snapshots.push(Object.freeze({ partition, evaluator }));
  }
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  if (aggregateTriangleCount !== maximumAggregateTriangles) {
    throw new CompleteMappedArtifactGeometryError(
      'UNASSIGNED_TRIANGLE',
      'Patch mappings do not account for every parsed artifact triangle'
    );
  }
  return Object.freeze(snapshots);
}

function snapshotDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an ordinary data record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have an ordinary prototype`);
  }
  const allowed = new Set(allowedKeys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string' || !allowed.has(key))) {
    throw new TypeError(`${label} has unknown fields`);
  }
  for (const key of requiredKeys) {
    if (!ownKeys.includes(key)) throw new TypeError(`${label}.${key} is required`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of ownKeys) {
    if (typeof key !== 'string') throw new TypeError(`${label} has a symbol field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function snapshotOptions(
  options: CompleteMappedArtifactGeometryOptions
): CompleteMappedArtifactGeometryOptions {
  const top = snapshotDataRecord(
    options,
    [
      'cancellationFlag',
      'maxElapsedMilliseconds',
      'maximumGeometricUpperPm',
      'maxAssignmentBytes',
      'maxTotalEvaluatorWorkUnits',
      'maxTotalPartitionWorkUnits',
      'maxTotalWorkCells',
      'parallelPatchProofs',
      'patchProof',
      'progressCounter',
    ],
    ['maximumGeometricUpperPm'],
    'complete mapped geometry options'
  );
  const patchProofValue = top.patchProof === undefined
    ? undefined
    : snapshotDataRecord(
        top.patchProof,
        ['maxDepth', 'maxEvaluatorWorkUnits', 'maxWorkCells', 'partition'],
        [],
        'patchProof'
      );
  const partitionValue = patchProofValue?.partition === undefined
    ? undefined
    : snapshotDataRecord(
        patchProofValue.partition,
        [
          'cancellationFlag',
          'deadlineEpochMilliseconds',
          'maxBroadPhasePairChecks',
          'maxBuildWork',
          'maxBvhNodes',
          'maxPairChecks',
          'maxTraversalVisits',
          'maxTriangles',
          'progressCounter',
        ],
        [],
        'patchProof.partition'
      );
  const partition = partitionValue === undefined
    ? undefined
    : Object.freeze({
        maxTriangles: partitionValue.maxTriangles as number | undefined,
        maxBuildWork: partitionValue.maxBuildWork as number | undefined,
        maxBvhNodes: partitionValue.maxBvhNodes as number | undefined,
        maxTraversalVisits: partitionValue.maxTraversalVisits as number | undefined,
        maxBroadPhasePairChecks:
          partitionValue.maxBroadPhasePairChecks as number | undefined,
        maxPairChecks: partitionValue.maxPairChecks as number | undefined,
        deadlineEpochMilliseconds:
          partitionValue.deadlineEpochMilliseconds as number | undefined,
        cancellationFlag: partitionValue.cancellationFlag as Int32Array | undefined,
        progressCounter: partitionValue.progressCounter as Int32Array | undefined,
      });
  const patchProof = patchProofValue === undefined
    ? undefined
    : Object.freeze({
        maxDepth: patchProofValue.maxDepth as number | undefined,
        maxEvaluatorWorkUnits: patchProofValue.maxEvaluatorWorkUnits as number | undefined,
        maxWorkCells: patchProofValue.maxWorkCells as number | undefined,
        partition,
      });
  return Object.freeze({
    maximumGeometricUpperPm: top.maximumGeometricUpperPm as bigint,
    maxAssignmentBytes: top.maxAssignmentBytes as number | undefined,
    maxTotalWorkCells: top.maxTotalWorkCells as number | undefined,
    maxTotalEvaluatorWorkUnits: top.maxTotalEvaluatorWorkUnits as number | undefined,
    maxTotalPartitionWorkUnits: top.maxTotalPartitionWorkUnits as number | undefined,
    maxElapsedMilliseconds: top.maxElapsedMilliseconds as number | undefined,
    patchProof,
    cancellationFlag: top.cancellationFlag as Int32Array | undefined,
    progressCounter: top.progressCounter as Int32Array | undefined,
    parallelPatchProofs: top.parallelPatchProofs as
      | MintedParallelPatchProofs
      | undefined,
  });
}

/**
 * Per-patch cMPD dispatch options exactly as the sequential prover's FIRST
 * iteration would compute them (zero prior consumption). The parallel
 * patch-proof pool hands these to its workers so worker proofs are
 * input-identical to sequential ones whenever the aggregate pools never
 * bind (they do not bind in certified runs); the replay in
 * certifyCompleteMappedArtifactGeometry re-applies the shrinking-pool
 * arithmetic canonically afterwards.
 */
export interface ParallelPatchProofDispatch {
  readonly maximumGeometricUpperPm: bigint;
  readonly maxDepth?: number;
  readonly maxWorkCells: number;
  readonly maxEvaluatorWorkUnits: number;
  readonly partition: {
    readonly maxTriangles: number;
    readonly maxBuildWork: number;
    readonly maxBvhNodes: number;
    readonly maxTraversalVisits: number;
    readonly maxBroadPhasePairChecks: number;
    readonly maxPairChecks: number;
  };
}

/** Resolve first-iteration per-patch dispatches (canonical job order). */
export function resolveParallelPatchProofDispatches(
  options: CompleteMappedArtifactGeometryOptions,
  partitionTriangleCounts: readonly number[]
): ParallelPatchProofDispatch[] {
  const optionsSnapshot = snapshotOptions(options);
  const maxTotalWorkCells =
    optionsSnapshot.maxTotalWorkCells ?? DEFAULT_MAX_TOTAL_WORK_CELLS;
  const maxTotalEvaluatorWorkUnits =
    optionsSnapshot.maxTotalEvaluatorWorkUnits ??
    DEFAULT_MAX_TOTAL_EVALUATOR_WORK_UNITS;
  const maxTotalPartitionWorkUnits =
    optionsSnapshot.maxTotalPartitionWorkUnits ??
    DEFAULT_MAX_TOTAL_PARTITION_WORK_UNITS;
  const requestedPatchWorkCells = boundedPositiveOption(
    optionsSnapshot.patchProof?.maxWorkCells,
    CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_WORK_CELLS,
    CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS,
    'patchProof.maxWorkCells'
  );
  const requestedPatchEvaluatorWorkUnits = boundedPositiveOption(
    optionsSnapshot.patchProof?.maxEvaluatorWorkUnits,
    CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_EVALUATOR_WORK_UNITS,
    CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS,
    'patchProof.maxEvaluatorWorkUnits'
  );
  const maxTrianglesPerPatch = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxTriangles,
    DEFAULT_DYADIC_PARTITION_MAX_TRIANGLES,
    HARD_DYADIC_PARTITION_MAX_TRIANGLES,
    'patchProof.partition.maxTriangles'
  );
  const requestedPartitionBuildWork = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxBuildWork,
    DEFAULT_DYADIC_PARTITION_MAX_BUILD_WORK,
    HARD_DYADIC_PARTITION_MAX_BUILD_WORK,
    'patchProof.partition.maxBuildWork'
  );
  const requestedPartitionBvhNodes = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxBvhNodes,
    DEFAULT_DYADIC_PARTITION_MAX_BVH_NODES,
    HARD_DYADIC_PARTITION_MAX_BVH_NODES,
    'patchProof.partition.maxBvhNodes'
  );
  const requestedPartitionTraversalVisits = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxTraversalVisits,
    DEFAULT_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
    HARD_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
    'patchProof.partition.maxTraversalVisits'
  );
  const requestedPartitionBroadPhasePairChecks = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxBroadPhasePairChecks,
    DEFAULT_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
    HARD_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
    'patchProof.partition.maxBroadPhasePairChecks'
  );
  const requestedPartitionPairChecks = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxPairChecks,
    DEFAULT_DYADIC_PARTITION_MAX_PAIR_CHECKS,
    HARD_DYADIC_PARTITION_MAX_PAIR_CHECKS,
    'patchProof.partition.maxPairChecks'
  );
  return partitionTriangleCounts.map((triangleCount) => {
    if (!Number.isSafeInteger(triangleCount) || triangleCount <= 0) {
      fail('INVALID_INPUT', 'partitionTriangleCounts must be positive safe integers');
    }
    const distributablePartitionWork = maxTotalPartitionWorkUnits - triangleCount;
    if (distributablePartitionWork < 5) {
      fail(
        'RESOURCE_LIMIT',
        `Complete mapped-artifact proof exhausted maxTotalPartitionWorkUnits=${maxTotalPartitionWorkUnits}`
      );
    }
    const partitionCounterShare = Math.floor(distributablePartitionWork / 5);
    return Object.freeze({
      maximumGeometricUpperPm: optionsSnapshot.maximumGeometricUpperPm,
      maxDepth: optionsSnapshot.patchProof?.maxDepth,
      maxWorkCells: Math.min(requestedPatchWorkCells, maxTotalWorkCells),
      maxEvaluatorWorkUnits: Math.min(
        requestedPatchEvaluatorWorkUnits,
        maxTotalEvaluatorWorkUnits
      ),
      partition: Object.freeze({
        maxTriangles: Math.min(maxTrianglesPerPatch, triangleCount),
        maxBuildWork: Math.min(requestedPartitionBuildWork, partitionCounterShare),
        maxBvhNodes: Math.min(requestedPartitionBvhNodes, partitionCounterShare),
        maxTraversalVisits: Math.min(
          requestedPartitionTraversalVisits,
          partitionCounterShare
        ),
        maxBroadPhasePairChecks: Math.min(
          requestedPartitionBroadPhasePairChecks,
          partitionCounterShare
        ),
        maxPairChecks: Math.min(requestedPartitionPairChecks, partitionCounterShare),
      }),
    });
  });
}

/** Execute every mapped target patch and prove exact global artifact coverage. */
export function certifyCompleteMappedArtifactGeometry(
  session: MappedArtifactProofSession,
  target: CompleteMappedGeometryTargetBinding,
  jobs: readonly MappedPatchProofJob[],
  options: CompleteMappedArtifactGeometryOptions
): CompleteMappedArtifactGeometryResult {
  let artifact: ParsedMappedArtifact;
  try {
    artifact = parsedMappedArtifactForProofSession(session);
  } catch {
    fail('INVALID_INPUT', 'Artifact session must be minted from exact final bytes');
  }
  const targetSnapshot = completeMappedGeometryTargetBindingForProof(target);
  if (typeof options !== 'object' || options === null || !Array.isArray(jobs)) {
    fail('INVALID_INPUT', 'Complete mapped geometry inputs are invalid');
  }
  let optionsSnapshot: CompleteMappedArtifactGeometryOptions;
  try {
    optionsSnapshot = snapshotOptions(options);
  } catch {
    fail('INVALID_INPUT', 'Complete mapped geometry options could not be snapshotted');
  }
  if (
    typeof optionsSnapshot.maximumGeometricUpperPm !== 'bigint' ||
    optionsSnapshot.maximumGeometricUpperPm <= 0n ||
    optionsSnapshot.maximumGeometricUpperPm > MAX_CERTIFICATION_PM
  ) {
    fail('INVALID_INPUT', 'Complete mapped geometry inputs are invalid');
  }
  const maxAssignmentBytes = optionsSnapshot.maxAssignmentBytes ?? DEFAULT_MAX_ASSIGNMENT_BYTES;
  if (!Number.isSafeInteger(maxAssignmentBytes) || maxAssignmentBytes <= 0) {
    fail('INVALID_INPUT', 'maxAssignmentBytes must be a positive safe integer');
  }
  if (maxAssignmentBytes > HARD_MAX_ASSIGNMENT_BYTES) {
    fail(
      'RESOURCE_LIMIT',
      `maxAssignmentBytes exceeds hard limit ${HARD_MAX_ASSIGNMENT_BYTES}`
    );
  }
  if (artifact.triangleCount > maxAssignmentBytes) {
    fail(
      'RESOURCE_LIMIT',
      `Triangle assignment table needs ${artifact.triangleCount} bytes; limit is ${maxAssignmentBytes}`
    );
  }
  const maxTotalWorkCells =
    optionsSnapshot.maxTotalWorkCells ?? DEFAULT_MAX_TOTAL_WORK_CELLS;
  if (!Number.isSafeInteger(maxTotalWorkCells) || maxTotalWorkCells <= 0) {
    fail('INVALID_INPUT', 'maxTotalWorkCells must be a positive safe integer');
  }
  if (maxTotalWorkCells > HARD_MAX_TOTAL_WORK_CELLS) {
    fail(
      'RESOURCE_LIMIT',
      `maxTotalWorkCells exceeds hard limit ${HARD_MAX_TOTAL_WORK_CELLS}`
    );
  }
  const maxTotalEvaluatorWorkUnits =
    optionsSnapshot.maxTotalEvaluatorWorkUnits ??
    DEFAULT_MAX_TOTAL_EVALUATOR_WORK_UNITS;
  if (
    !Number.isSafeInteger(maxTotalEvaluatorWorkUnits) ||
    maxTotalEvaluatorWorkUnits <= 0
  ) {
    fail('INVALID_INPUT', 'maxTotalEvaluatorWorkUnits must be a positive safe integer');
  }
  if (maxTotalEvaluatorWorkUnits > HARD_MAX_TOTAL_EVALUATOR_WORK_UNITS) {
    fail(
      'RESOURCE_LIMIT',
      `maxTotalEvaluatorWorkUnits exceeds hard limit ${HARD_MAX_TOTAL_EVALUATOR_WORK_UNITS}`
    );
  }
  const maxTotalPartitionWorkUnits =
    optionsSnapshot.maxTotalPartitionWorkUnits ??
    DEFAULT_MAX_TOTAL_PARTITION_WORK_UNITS;
  if (
    !Number.isSafeInteger(maxTotalPartitionWorkUnits) ||
    maxTotalPartitionWorkUnits <= 0
  ) {
    fail('INVALID_INPUT', 'maxTotalPartitionWorkUnits must be a positive safe integer');
  }
  if (maxTotalPartitionWorkUnits > HARD_MAX_TOTAL_PARTITION_WORK_UNITS) {
    fail(
      'RESOURCE_LIMIT',
      `maxTotalPartitionWorkUnits exceeds hard limit ${HARD_MAX_TOTAL_PARTITION_WORK_UNITS}`
    );
  }
  const maxElapsedMilliseconds =
    optionsSnapshot.maxElapsedMilliseconds ?? DEFAULT_MAX_ELAPSED_MILLISECONDS;
  if (!Number.isSafeInteger(maxElapsedMilliseconds) || maxElapsedMilliseconds <= 0) {
    fail('INVALID_INPUT', 'maxElapsedMilliseconds must be a positive safe integer');
  }
  if (maxElapsedMilliseconds > HARD_MAX_ELAPSED_MILLISECONDS) {
    fail(
      'RESOURCE_LIMIT',
      `maxElapsedMilliseconds exceeds hard limit ${HARD_MAX_ELAPSED_MILLISECONDS}`
    );
  }
  const deadlineEpochMilliseconds = Date.now() + maxElapsedMilliseconds;
  if (artifact.triangleCount > HARD_MAX_TOTAL_MAPPED_TRIANGLES) {
    fail(
      'RESOURCE_LIMIT',
      `Parsed artifact has ${artifact.triangleCount} triangles; mapped-proof hard limit is ${HARD_MAX_TOTAL_MAPPED_TRIANGLES}`
    );
  }
  const requestedPatchWorkCells =
    optionsSnapshot.patchProof?.maxWorkCells ??
    CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_WORK_CELLS;
  if (!Number.isSafeInteger(requestedPatchWorkCells) || requestedPatchWorkCells <= 0) {
    fail('INVALID_INPUT', 'patchProof.maxWorkCells must be a positive safe integer');
  }
  if (requestedPatchWorkCells > CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS) {
    fail(
      'RESOURCE_LIMIT',
      `patchProof.maxWorkCells exceeds hard limit ${CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS}`
    );
  }
  const requestedPatchEvaluatorWorkUnits =
    optionsSnapshot.patchProof?.maxEvaluatorWorkUnits ??
    CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_EVALUATOR_WORK_UNITS;
  if (
    !Number.isSafeInteger(requestedPatchEvaluatorWorkUnits) ||
    requestedPatchEvaluatorWorkUnits <= 0
  ) {
    fail('INVALID_INPUT', 'patchProof.maxEvaluatorWorkUnits must be a positive safe integer');
  }
  if (
    requestedPatchEvaluatorWorkUnits >
    CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS
  ) {
    fail(
      'RESOURCE_LIMIT',
      `patchProof.maxEvaluatorWorkUnits exceeds hard limit ${CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS}`
    );
  }
  const maxTrianglesPerPatch =
    optionsSnapshot.patchProof?.partition?.maxTriangles ??
    DEFAULT_DYADIC_PARTITION_MAX_TRIANGLES;
  if (!Number.isSafeInteger(maxTrianglesPerPatch) || maxTrianglesPerPatch <= 0) {
    fail('INVALID_INPUT', 'patchProof.partition.maxTriangles must be a positive safe integer');
  }
  if (maxTrianglesPerPatch > HARD_DYADIC_PARTITION_MAX_TRIANGLES) {
    fail(
      'RESOURCE_LIMIT',
      `patchProof.partition.maxTriangles exceeds hard limit ${HARD_DYADIC_PARTITION_MAX_TRIANGLES}`
    );
  }
  const requestedPartitionBuildWork = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxBuildWork,
    DEFAULT_DYADIC_PARTITION_MAX_BUILD_WORK,
    HARD_DYADIC_PARTITION_MAX_BUILD_WORK,
    'patchProof.partition.maxBuildWork'
  );
  const requestedPartitionBvhNodes = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxBvhNodes,
    DEFAULT_DYADIC_PARTITION_MAX_BVH_NODES,
    HARD_DYADIC_PARTITION_MAX_BVH_NODES,
    'patchProof.partition.maxBvhNodes'
  );
  const requestedPartitionTraversalVisits = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxTraversalVisits,
    DEFAULT_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
    HARD_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
    'patchProof.partition.maxTraversalVisits'
  );
  const requestedPartitionBroadPhasePairChecks = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxBroadPhasePairChecks,
    DEFAULT_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
    HARD_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
    'patchProof.partition.maxBroadPhasePairChecks'
  );
  const requestedPartitionPairChecks = boundedPositiveOption(
    optionsSnapshot.patchProof?.partition?.maxPairChecks,
    DEFAULT_DYADIC_PARTITION_MAX_PAIR_CHECKS,
    HARD_DYADIC_PARTITION_MAX_PAIR_CHECKS,
    'patchProof.partition.maxPairChecks'
  );
  validateAtomicCounter(optionsSnapshot.cancellationFlag, 'cancellationFlag');
  validateAtomicCounter(optionsSnapshot.progressCounter, 'progressCounter');
  checkCancelled(optionsSnapshot.cancellationFlag, deadlineEpochMilliseconds);

  let jobSnapshots: readonly MappedPatchProofJob[];
  try {
    jobSnapshots = snapshotJobs(
      jobs,
      maxTrianglesPerPatch,
      artifact.triangleCount,
      optionsSnapshot.cancellationFlag,
      deadlineEpochMilliseconds,
      targetSnapshot.expectedPatchIds,
      targetSnapshot.expectedEvaluatorProgramSha256s,
      targetSnapshot.targetSha256,
      artifact.triangleCount
    );
  } catch (error) {
    if (error instanceof CompleteMappedArtifactGeometryError) throw error;
    if (error instanceof ExactDyadicDomainPartitionError) {
      if (error.code === 'CANCELLED') fail('CANCELLED', error.message);
      if (error.code === 'RESOURCE_LIMIT') fail('RESOURCE_LIMIT', error.message);
    }
    fail('INVALID_INPUT', 'Patch jobs could not be snapshotted safely');
  }
  const jobPatchIds = jobSnapshots.map((job) => job.partition.patchId);
  if (
    !sortedUniqueIds(jobPatchIds) ||
    jobPatchIds.some((patchId, index) => patchId !== targetSnapshot.expectedPatchIds[index])
  ) {
    fail('PATCH_SET_INVALID', 'Patch jobs do not exactly match the expected target patch set');
  }
  for (let jobIndex = 0; jobIndex < jobSnapshots.length; jobIndex += 1) {
    const job = jobSnapshots[jobIndex];
    if (
      job.evaluator.patchId !== job.partition.patchId ||
      job.evaluator.targetSha256 !== targetSnapshot.targetSha256 ||
      job.evaluator.evaluatorProgramSha256 !==
        targetSnapshot.expectedEvaluatorProgramSha256s[jobIndex] ||
      job.partition.artifactTriangleCount !== artifact.triangleCount
    ) {
      fail('PATCH_SET_INVALID', 'Patch evaluator, target, or artifact binding is inconsistent', job.partition.patchId);
    }
  }

  const assignments = new Uint8Array(artifact.triangleCount);
  let assignedTriangleCount = 0;
  for (const job of jobSnapshots) {
    for (const triangle of job.partition.triangles) {
      if ((assignedTriangleCount & 1023) === 0) {
        checkCancelled(optionsSnapshot.cancellationFlag, deadlineEpochMilliseconds);
      }
      const triangleIndex = triangle.artifactTriangleIndex;
      if (
        !Number.isSafeInteger(triangleIndex) ||
        triangleIndex < 0 ||
        triangleIndex >= artifact.triangleCount
      ) {
        fail('PATCH_SET_INVALID', 'Patch assignment leaves the parsed artifact', job.partition.patchId);
      }
      if (assignments[triangleIndex] !== 0) {
        fail(
          'DUPLICATE_ASSIGNMENT',
          'Parsed artifact triangle is assigned to more than one target patch',
          job.partition.patchId,
          triangleIndex
        );
      }
      assignments[triangleIndex] = 1;
      assignedTriangleCount += 1;
    }
  }
  checkCancelled(optionsSnapshot.cancellationFlag, deadlineEpochMilliseconds);
  if (assignedTriangleCount !== artifact.triangleCount) {
    const firstUnassigned = assignments.findIndex((assignment) => assignment === 0);
    fail(
      'UNASSIGNED_TRIANGLE',
      'At least one parsed artifact triangle has no target-patch correspondence',
      undefined,
      firstUnassigned
    );
  }

  const parallelOutcomes =
    optionsSnapshot.parallelPatchProofs === undefined
      ? undefined
      : parallelPatchProofsForProof(optionsSnapshot.parallelPatchProofs);
  if (parallelOutcomes !== undefined) {
    for (const job of jobSnapshots) {
      if (!parallelOutcomes.has(job.partition.patchId)) {
        fail(
          'INVALID_INPUT',
          'parallelPatchProofs is missing an outcome for a target patch',
          job.partition.patchId
        );
      }
    }
  }
  const patchProofs: ContinuousMappedPatchDistanceResult[] = [];
  let geometricUpperPm = 0n;
  let totalWorkCellCount = 0;
  let totalEvaluatorWorkUnitCount = 0;
  let totalPartitionWorkUnitCount = 0;
  for (let jobIndex = 0; jobIndex < jobSnapshots.length; jobIndex += 1) {
    checkCancelled(optionsSnapshot.cancellationFlag, deadlineEpochMilliseconds);
    const job = jobSnapshots[jobIndex];
    const remainingWorkCells = maxTotalWorkCells - totalWorkCellCount;
    if (remainingWorkCells <= 0) {
      fail(
        'RESOURCE_LIMIT',
        `Complete mapped-artifact proof exhausted maxTotalWorkCells=${maxTotalWorkCells}`,
        job.partition.patchId
      );
    }
    const remainingEvaluatorWorkUnits =
      maxTotalEvaluatorWorkUnits - totalEvaluatorWorkUnitCount;
    if (remainingEvaluatorWorkUnits <= 0) {
      fail(
        'RESOURCE_LIMIT',
        `Complete mapped-artifact proof exhausted maxTotalEvaluatorWorkUnits=${maxTotalEvaluatorWorkUnits}`,
        job.partition.patchId
      );
    }
    const remainingPartitionWorkUnits =
      maxTotalPartitionWorkUnits - totalPartitionWorkUnitCount;
    const fixedPartitionTriangleWork = job.partition.triangles.length;
    const distributablePartitionWork =
      remainingPartitionWorkUnits - fixedPartitionTriangleWork;
    if (distributablePartitionWork < 5) {
      fail(
        'RESOURCE_LIMIT',
        `Complete mapped-artifact proof exhausted maxTotalPartitionWorkUnits=${maxTotalPartitionWorkUnits}`,
        job.partition.patchId
      );
    }
    // Five independently checked counters share the remaining aggregate budget.
    // This conservative split guarantees a child cannot overspend before returning.
    const partitionCounterShare = Math.floor(distributablePartitionWork / 5);
    const sequentialMaxWorkCells = Math.min(requestedPatchWorkCells, remainingWorkCells);
    const sequentialMaxEvaluatorWorkUnits = Math.min(
      requestedPatchEvaluatorWorkUnits,
      remainingEvaluatorWorkUnits
    );
    const replayOutcome = parallelOutcomes?.get(job.partition.patchId);
    let proof: ContinuousMappedPatchDistanceResult;
    if (replayOutcome !== undefined) {
      // CANONICAL REPLAY of a worker-computed outcome: the identical budget
      // arithmetic and fail() mapping as the in-process call below. Workers
      // run at first-iteration caps; when the aggregate pools would have
      // shrunk this patch's cap below its actual consumption, synthesize the
      // exact refusal the shrunk in-process run would have produced (the
      // refusal's triangle-index detail is absent in this synthesized path).
      if (replayOutcome.refusal !== undefined) {
        const refusal = replayOutcome.refusal;
        if (refusal.code === 'CANCELLED') {
          fail('CANCELLED', refusal.message, job.partition.patchId, refusal.artifactTriangleIndex);
        }
        if (refusal.code === 'RESOURCE_LIMIT') {
          // A worker that hit its STATIC first-iteration cap would have hit
          // the (never larger) shrunk sequential cap even earlier: rewrite
          // the two per-patch cap messages to the sequential cap so the
          // refusal text is order-arithmetic-identical. The in-flight
          // triangle index is not reproducible in this path and is omitted.
          if (/^Continuous proof exceeds maxWorkCells=\d+$/.test(refusal.message)) {
            fail(
              'RESOURCE_LIMIT',
              `Continuous proof exceeds maxWorkCells=${sequentialMaxWorkCells}`,
              job.partition.patchId
            );
          }
          if (
            /^Continuous proof exceeds maxEvaluatorWorkUnits=\d+$/.test(refusal.message)
          ) {
            fail(
              'RESOURCE_LIMIT',
              `Continuous proof exceeds maxEvaluatorWorkUnits=${sequentialMaxEvaluatorWorkUnits}`,
              job.partition.patchId
            );
          }
          fail(
            'RESOURCE_LIMIT',
            refusal.message,
            job.partition.patchId,
            refusal.artifactTriangleIndex
          );
        }
        fail('PATCH_PROOF_REFUSED', refusal.message, job.partition.patchId);
      }
      if (replayOutcome.proof === undefined) {
        fail(
          'INVALID_INPUT',
          'parallelPatchProofs outcome carries neither proof nor refusal',
          job.partition.patchId
        );
      }
      proof = replayOutcome.proof;
      if (proof.workCellCount > sequentialMaxWorkCells) {
        fail(
          'RESOURCE_LIMIT',
          `Continuous proof exceeds maxWorkCells=${sequentialMaxWorkCells}`,
          job.partition.patchId
        );
      }
      if (proof.evaluatorWorkUnitCount > sequentialMaxEvaluatorWorkUnits) {
        fail(
          'RESOURCE_LIMIT',
          `Continuous proof exceeds maxEvaluatorWorkUnits=${sequentialMaxEvaluatorWorkUnits}`,
          job.partition.patchId
        );
      }
    } else {
      try {
        proof = certifyContinuousMappedPatchDistance(session, job.partition, job.evaluator, {
          ...optionsSnapshot.patchProof,
          partition: {
            ...optionsSnapshot.patchProof?.partition,
            maxBuildWork: Math.min(requestedPartitionBuildWork, partitionCounterShare),
            maxBvhNodes: Math.min(requestedPartitionBvhNodes, partitionCounterShare),
            maxTraversalVisits: Math.min(
              requestedPartitionTraversalVisits,
              partitionCounterShare
            ),
            maxBroadPhasePairChecks: Math.min(
              requestedPartitionBroadPhasePairChecks,
              partitionCounterShare
            ),
            maxPairChecks: Math.min(requestedPartitionPairChecks, partitionCounterShare),
            maxTriangles: Math.min(maxTrianglesPerPatch, job.partition.triangles.length),
            deadlineEpochMilliseconds,
          },
          maxEvaluatorWorkUnits: sequentialMaxEvaluatorWorkUnits,
          maxWorkCells: sequentialMaxWorkCells,
          maximumGeometricUpperPm: optionsSnapshot.maximumGeometricUpperPm,
          cancellationFlag: optionsSnapshot.cancellationFlag,
          deadlineEpochMilliseconds,
        });
      } catch (error) {
        if (error instanceof ContinuousMappedPatchDistanceError && error.code === 'CANCELLED') {
          fail('CANCELLED', error.message, job.partition.patchId, error.artifactTriangleIndex);
        }
        if (
          error instanceof ContinuousMappedPatchDistanceError &&
          error.code === 'RESOURCE_LIMIT'
        ) {
          fail('RESOURCE_LIMIT', error.message, job.partition.patchId, error.artifactTriangleIndex);
        }
        fail(
          'PATCH_PROOF_REFUSED',
          error instanceof Error ? error.message : 'Patch proof refused',
          job.partition.patchId
        );
      }
    }
    if (
      proof.targetSha256 !== targetSnapshot.targetSha256 ||
      proof.patchId !== job.partition.patchId ||
      proof.evaluatorId !== job.evaluator.evaluatorId ||
      proof.evaluatorVersion !== job.evaluator.evaluatorVersion ||
      proof.evaluatorSourceSha256 !== job.evaluator.evaluatorSourceSha256 ||
      proof.evaluatorProofSha256 !== job.evaluator.evaluatorProofSha256 ||
      proof.evaluatorProgramSha256 !== job.evaluator.evaluatorProgramSha256 ||
      proof.evaluatorWorkUnitsPerCell !== job.evaluator.evaluatorWorkUnitsPerCell ||
      proof.evaluatorCompilerVersion !== job.evaluator.evaluatorCompilerVersion ||
      proof.evaluatorCompilerProofSha256 !==
        job.evaluator.evaluatorCompilerProofSha256 ||
      proof.artifactByteSha256 !== artifact.byteSha256 ||
      proof.parsedTriangleSetSha256 !== artifact.parsedTriangleSetSha256
    ) {
      fail('PATCH_PROOF_REFUSED', 'Child patch proof binding is inconsistent', job.partition.patchId);
    }
    const patchUpper = BigInt(proof.targetToMeshUpperPm);
    if (patchUpper > geometricUpperPm) geometricUpperPm = patchUpper;
    totalWorkCellCount += proof.workCellCount;
    if (totalWorkCellCount > maxTotalWorkCells) {
      fail('RESOURCE_LIMIT', 'Child proofs exceeded the aggregate work-cell limit');
    }
    totalEvaluatorWorkUnitCount += proof.evaluatorWorkUnitCount;
    if (totalEvaluatorWorkUnitCount > maxTotalEvaluatorWorkUnits) {
      fail('RESOURCE_LIMIT', 'Child proofs exceeded the aggregate evaluator-work limit');
    }
    totalPartitionWorkUnitCount += proof.partitionWorkUnitCount;
    if (totalPartitionWorkUnitCount > maxTotalPartitionWorkUnits) {
      fail('RESOURCE_LIMIT', 'Child proofs exceeded the aggregate partition-work limit');
    }
    patchProofs.push(proof);
    if (optionsSnapshot.progressCounter !== undefined) {
      Atomics.store(optionsSnapshot.progressCounter, 0, jobIndex + 1);
    }
  }

  const frozenPatchProofs = Object.freeze([...patchProofs]);
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.complete-mapped-artifact-geometry/evidence/v2',
    {
      artifactByteSha256: artifact.byteSha256,
      artifactFormat: artifact.format,
      artifactTriangleCount: artifact.triangleCount.toString(),
      assignedTriangleCount: assignedTriangleCount.toString(),
      canonicalInputSha256: targetSnapshot.canonicalInputSha256,
      geometricTwoSidedUpperPm: geometricUpperPm.toString(),
      maxElapsedMilliseconds: maxElapsedMilliseconds.toString(),
      maxTotalEvaluatorWorkUnits: maxTotalEvaluatorWorkUnits.toString(),
      maxTotalPartitionWorkUnits: maxTotalPartitionWorkUnits.toString(),
      maxTotalWorkCells: maxTotalWorkCells.toString(),
      parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
      patchProofs: frozenPatchProofs.map((proof) => ({
        artifactTriangleSubsetCount: proof.artifactTriangleSubsetCount.toString(),
        artifactTriangleSubsetSha256: proof.artifactTriangleSubsetSha256,
        evidenceSha256: proof.evidenceSha256,
        patchId: proof.patchId,
      })),
      proofMethodSha256: COMPLETE_MAPPED_ARTIFACT_GEOMETRY_PROOF_SHA256,
      proofVersion: COMPLETE_MAPPED_ARTIFACT_GEOMETRY_VERSION,
      expectedPatchIds: targetSnapshot.expectedPatchIds,
      expectedEvaluatorProgramSha256s:
        targetSnapshot.expectedEvaluatorProgramSha256s,
      authenticatedSurfaceComplexProvenance:
        targetSnapshot.authenticatedSurfaceComplexProvenance,
      targetPatchManifestSha256: targetSnapshot.targetPatchManifestSha256,
      targetDefinitionOrigin: targetSnapshot.targetDefinitionOrigin,
      targetDefinitionVersion: targetSnapshot.targetDefinitionVersion,
      targetSha256: targetSnapshot.targetSha256,
      targetSolidSpecificationSha256: targetSnapshot.targetSolidSpecificationSha256,
      totalWorkCellCount: totalWorkCellCount.toString(),
      totalEvaluatorWorkUnitCount: totalEvaluatorWorkUnitCount.toString(),
      totalPartitionWorkUnitCount: totalPartitionWorkUnitCount.toString(),
      ...(targetSnapshot.targetSurfaceComplexSha256 === undefined
        ? {}
        : { targetSurfaceComplexSha256: targetSnapshot.targetSurfaceComplexSha256 }),
    }
  );

  return Object.freeze({
    proofVersion: COMPLETE_MAPPED_ARTIFACT_GEOMETRY_VERSION,
    proofMethodSha256: COMPLETE_MAPPED_ARTIFACT_GEOMETRY_PROOF_SHA256,
    evidenceSha256,
    targetSha256: targetSnapshot.targetSha256,
    targetPatchManifestSha256: targetSnapshot.targetPatchManifestSha256,
    targetDefinitionVersion: targetSnapshot.targetDefinitionVersion,
    canonicalInputSha256: targetSnapshot.canonicalInputSha256,
    targetSolidSpecificationSha256: targetSnapshot.targetSolidSpecificationSha256,
    targetDefinitionOrigin: targetSnapshot.targetDefinitionOrigin,
    authenticatedSurfaceComplexProvenance:
      targetSnapshot.authenticatedSurfaceComplexProvenance,
    ...(targetSnapshot.targetSurfaceComplexSha256 === undefined
      ? {}
      : { targetSurfaceComplexSha256: targetSnapshot.targetSurfaceComplexSha256 }),
    artifactFormat: artifact.format,
    artifactByteSha256: artifact.byteSha256,
    parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
    artifactTriangleCount: artifact.triangleCount,
    patchCount: frozenPatchProofs.length,
    assignedTriangleCount,
    totalWorkCellCount,
    totalEvaluatorWorkUnitCount,
    totalPartitionWorkUnitCount,
    geometricTwoSidedUpperPm: geometricUpperPm.toString(),
    patchProofs: frozenPatchProofs,
    scanComplete: true,
    continuousTwoSidedGeometryProven: true,
    implementationScope: 'geometry-only-no-solid-certificate',
  });
}
