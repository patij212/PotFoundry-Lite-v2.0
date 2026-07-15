import { domainSeparatedCanonicalJsonSha256 } from './canonicalCertificationJson';
import {
  DEFAULT_DYADIC_PARTITION_MAX_TRIANGLES,
  ExactDyadicDomainPartitionError,
  HARD_DYADIC_PARTITION_MAX_ELAPSED_MILLISECONDS,
  HARD_DYADIC_PARTITION_MAX_TRIANGLES,
  snapshotExactDyadicDomainPartitionInputForProof,
  verifyExactDyadicRectanglePartition,
  type ExactDyadicDomainPartitionInput,
  type ExactDyadicDomainPartitionOptions,
  type ExactDyadicMappedTriangle,
  type ExactDyadicPoint2,
} from './exactDyadicDomainPartition';
import { IncrementalSha256, sha256Utf8 } from './incrementalSha256';
import {
  float64UpperMillimetresToPicometres,
  outwardInterval,
  outwardVectorNormUpper,
  type OutwardInterval,
  OUTWARD_FLOAT64_INTERVAL_PROOF_SHA256,
} from './outwardFloat64Interval';
import {
  parsedMappedArtifactForProofSession,
  type MappedArtifactProofSession,
  type ParsedMappedArtifact,
} from './mappedArtifactProofSession';
import {
  registeredValidatedResidualEvaluatorForProof,
  type RegisteredValidatedResidualEvaluator,
  VALIDATED_RESIDUAL_EVALUATOR_REGISTRY_VERSION,
} from './validatedResidualEvaluatorRegistry';
import {
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
  VALIDATED_RESIDUAL_PROGRAM_MAX_NODES,
} from './validatedResidualProgram';

export type { RegisteredValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

export const CONTINUOUS_MAPPED_PATCH_DISTANCE_VERSION =
  'potfoundry.continuous-mapped-patch-distance/v14' as const;
export const CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_WORK_CELLS = 1_000_000;
export const CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS = 2_000_000;
export const CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_EVALUATOR_WORK_UNITS =
  25_000_000;
export const CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS =
  100_000_000;
export const CONTINUOUS_MAPPED_PATCH_DISTANCE_PROOF_SHA256 = sha256Utf8(
  [
    CONTINUOUS_MAPPED_PATCH_DISTANCE_VERSION,
    'artifact geometry = immutable exact triangle snapshot parsed from authenticated final binary-STL, 3MF, or OBJ bytes',
    'binary STL coordinates retain exact binary32 values; 3MF and OBJ coordinates retain exact signed integer picometres through residual evaluation',
    'target/mesh correspondence = exact complete dyadic rectangle partition proof',
    'each work cell is one exact barycentric midpoint subdivision of its assigned artifact triangle and target parameter triangle',
    'each evaluator request carries exact dyadic barycentric numerators for auditable affine-artifact enclosure',
    `validated evaluator = WeakMap-authenticated immutable registry capability (${VALIDATED_RESIDUAL_EVALUATOR_REGISTRY_VERSION})`,
    'evaluator executable state is compiled only from a target-committed canonical target x/y/z program; compiler-derived residuals admit no artifact-coordinate leaves or arbitrary callbacks',
    'registered evaluator encloses target-minus-affine-artifact residual continuously over the complete triangular cell',
    'compiler-proven affine target coordinates use a complete three-vertex residual hull over the shared exact barycentric cell; nonlinear coordinates retain outward interval enclosure',
    'a cell may be accepted by the registered centered mean-value float64 screen when its outward enclosure already meets the budget; an over-budget screen enclosure below maximum depth subdivides directly; screen-unavailable cells and every maximum-depth decision consult the validated decimal enclosure, so no cell is refused on screen evidence alone',
    'screen consultations may travel an exact numeric cell channel - integer dyadic numerators kept within 2^52 so weighted midpoint combinations stay exact, plus exact parsed binary32 STL coordinates - bypassing canonical request construction; the validated decimal enclosure always receives the canonical exact request',
    `outward binary64 norm and exact-picometre ceiling=${OUTWARD_FLOAT64_INTERVAL_PROOF_SHA256}`,
    'the accepted exact-picometre geometric budget is snapshotted once and bound into result evidence',
    'a shared complete parametrization bounds both target-to-mesh and mesh-to-target directed distances by the same residual supremum',
    `per-patch work is hard-capped at ${CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS} cells regardless of caller options`,
    `each consulted cell is charged one screen unit and each validated-decimal consultation is additionally charged the authenticated program node count, with a hard ceiling of ${CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS} units`,
    `partition snapshots refuse before allocation above ${HARD_DYADIC_PARTITION_MAX_TRIANGLES} triangles and poll shared cancellation`,
    'authenticated partition snapshots are reused without recopying; partition build and audit work is exposed for aggregate composition',
    'an absolute deadline is polled throughout partition, hashing, and residual-cell work and refuses fail-closed',
    'depth, work, partition, evaluator, cancellation, or numeric uncertainty refuses; no finite sampling acceptance path exists',
  ].join('\n')
);

export interface ExactDyadicTriangleCell {
  readonly fractionBits: number;
  readonly barycentricFractionBits: number;
  readonly vertices: readonly [ExactDyadicPoint2, ExactDyadicPoint2, ExactDyadicPoint2];
  readonly barycentricVertices: readonly [
    Readonly<{ aNumerator: string; bNumerator: string; cNumerator: string }>,
    Readonly<{ aNumerator: string; bNumerator: string; cNumerator: string }>,
    Readonly<{ aNumerator: string; bNumerator: string; cNumerator: string }>,
  ];
}

export interface ValidatedResidualEnclosureRequest {
  readonly patchId: string;
  readonly artifactTriangleIndex: number;
  readonly artifactTriangleVerticesMm: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
  /** Present for exact-picometre 3MF/OBJ artifacts; takes precedence over the binary64 view. */
  readonly artifactTriangleVerticesPm?: readonly [
    readonly [string, string, string],
    readonly [string, string, string],
    readonly [string, string, string],
  ];
  readonly originalDomainTriangle: readonly [
    ExactDyadicPoint2,
    ExactDyadicPoint2,
    ExactDyadicPoint2,
  ];
  readonly cell: ExactDyadicTriangleCell;
}

export interface ValidatedResidualEnclosure {
  readonly xMm: OutwardInterval;
  readonly yMm: OutwardInterval;
  readonly zMm: OutwardInterval;
}

export interface ContinuousMappedPatchDistanceOptions {
  readonly maximumGeometricUpperPm: bigint;
  readonly maxDepth?: number;
  readonly maxWorkCells?: number;
  readonly maxEvaluatorWorkUnits?: number;
  readonly partition?: ExactDyadicDomainPartitionOptions;
  /** Internal/shared absolute deadline; direct callers cannot raise the partition hard horizon. */
  readonly deadlineEpochMilliseconds?: number;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export type ContinuousMappedPatchDistanceErrorCode =
  | 'INVALID_INPUT'
  | 'EVALUATOR_REFUSED'
  | 'INCONCLUSIVE'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED';

export class ContinuousMappedPatchDistanceError extends Error {
  readonly code: ContinuousMappedPatchDistanceErrorCode;
  readonly artifactTriangleIndex?: number;
  readonly depth?: number;

  constructor(
    code: ContinuousMappedPatchDistanceErrorCode,
    message: string,
    artifactTriangleIndex?: number,
    depth?: number
  ) {
    super(message);
    this.name = 'ContinuousMappedPatchDistanceError';
    this.code = code;
    this.artifactTriangleIndex = artifactTriangleIndex;
    this.depth = depth;
  }
}

export interface ContinuousMappedPatchDistanceResult {
  readonly proofVersion: typeof CONTINUOUS_MAPPED_PATCH_DISTANCE_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly artifactFormat: 'stl' | '3mf' | 'obj';
  readonly artifactCoordinateEncoding: 'exact-binary32-mm' | 'exact-integer-pm';
  readonly artifactByteSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly targetSha256: string;
  readonly patchId: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly evaluatorSourceSha256: string;
  readonly evaluatorProofSha256: string;
  readonly evaluatorProgramSha256: string;
  readonly evaluatorWorkUnitsPerCell: number;
  readonly evaluatorCompilerVersion: typeof VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION;
  readonly evaluatorCompilerProofSha256: string;
  readonly partitionEvidenceSha256: string;
  readonly artifactTriangleSubsetSha256: string;
  readonly artifactTriangleSubsetCount: number;
  readonly partitionWorkUnitCount: number;
  readonly workCellCount: number;
  readonly evaluatorWorkUnitCount: number;
  readonly acceptedLeafCellCount: number;
  readonly fastScreenAcceptedCellCount: number;
  readonly maximumDepthReached: number;
  readonly certifiedMaximumGeometricUpperPm: string;
  readonly targetToMeshUpperPm: string;
  readonly meshToTargetUpperPm: string;
  readonly scanComplete: true;
  readonly continuousCorrespondenceProven: true;
}

interface BarycentricPoint {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

interface WorkCell {
  readonly depth: number;
  readonly vertices: readonly [BarycentricPoint, BarycentricPoint, BarycentricPoint];
}

interface ArtifactTriangleSnapshot {
  readonly verticesMm: ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'];
  readonly verticesPm?: NonNullable<
    ValidatedResidualEnclosureRequest['artifactTriangleVerticesPm']
  >;
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const ID_RE = /^[a-z0-9](?:[a-z0-9._:/-]{0,127})$/;
const DEFAULT_MAX_DEPTH = 24;
const MAX_SUBDIVISION_DEPTH = 30;
const MAX_CERTIFICATION_PM = 1_000_000_000_000_000_000n;

function invalid(message: string): never {
  throw new ContinuousMappedPatchDistanceError('INVALID_INPUT', message);
}

function positiveSafeInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) invalid(`${label} must be positive`);
  return resolved;
}

function validateAtomicCounter(counter: Int32Array | undefined, label: string): void {
  if (counter === undefined) return;
  if (
    counter.length < 1 ||
    typeof SharedArrayBuffer === 'undefined' ||
    !(counter.buffer instanceof SharedArrayBuffer)
  ) {
    invalid(`${label} must contain index 0 and be backed by SharedArrayBuffer`);
  }
}

function checkCancelled(flag: Int32Array | undefined, deadlineEpochMilliseconds?: number): void {
  if (flag !== undefined && Atomics.load(flag, 0) !== 0) {
    throw new ContinuousMappedPatchDistanceError('CANCELLED', 'Continuous proof cancelled');
  }
  if (
    deadlineEpochMilliseconds !== undefined &&
    Date.now() > deadlineEpochMilliseconds
  ) {
    throw new ContinuousMappedPatchDistanceError(
      'RESOURCE_LIMIT',
      'Continuous proof exceeded its elapsed-time deadline'
    );
  }
}

function doublePoint(point: BarycentricPoint): BarycentricPoint {
  return { a: point.a * 2, b: point.b * 2, c: point.c * 2 };
}

function midpoint(left: BarycentricPoint, right: BarycentricPoint): BarycentricPoint {
  return { a: left.a + right.a, b: left.b + right.b, c: left.c + right.c };
}

function subdivide(cell: WorkCell): readonly [WorkCell, WorkCell, WorkCell, WorkCell] {
  const [a, b, c] = cell.vertices;
  const aa = doublePoint(a);
  const bb = doublePoint(b);
  const cc = doublePoint(c);
  const ab = midpoint(a, b);
  const bc = midpoint(b, c);
  const ca = midpoint(c, a);
  const depth = cell.depth + 1;
  return [
    { depth, vertices: [aa, ab, ca] },
    { depth, vertices: [ab, bb, bc] },
    { depth, vertices: [ca, bc, cc] },
    { depth, vertices: [ab, bc, ca] },
  ];
}

function exactCellPoint(
  original: ExactDyadicMappedTriangle['vertices'],
  weight: BarycentricPoint
): ExactDyadicPoint2 {
  const a = BigInt(weight.a);
  const b = BigInt(weight.b);
  const c = BigInt(weight.c);
  return {
    uNumerator: (
      a * BigInt(original[0].uNumerator) +
      b * BigInt(original[1].uNumerator) +
      c * BigInt(original[2].uNumerator)
    ).toString(),
    vNumerator: (
      a * BigInt(original[0].vNumerator) +
      b * BigInt(original[1].vNumerator) +
      c * BigInt(original[2].vNumerator)
    ).toString(),
  };
}

function requestForCell(
  mapping: ExactDyadicMappedTriangle,
  patchId: string,
  originalFractionBits: number,
  artifactTriangle: ArtifactTriangleSnapshot,
  cell: WorkCell
): ValidatedResidualEnclosureRequest {
  const fractionBits = originalFractionBits + cell.depth;
  const vertices = cell.vertices.map((weight) =>
    exactCellPoint(mapping.vertices, weight)
  ) as [ExactDyadicPoint2, ExactDyadicPoint2, ExactDyadicPoint2];
  const barycentricVertices = cell.vertices.map((weight) =>
    Object.freeze({
      aNumerator: weight.a.toString(),
      bNumerator: weight.b.toString(),
      cNumerator: weight.c.toString(),
    })
  ) as unknown as ExactDyadicTriangleCell['barycentricVertices'];
  const frozenCell = Object.freeze({
    fractionBits,
    barycentricFractionBits: cell.depth,
    vertices: Object.freeze(vertices.map((point) => Object.freeze(point))) as unknown as readonly [
      ExactDyadicPoint2,
      ExactDyadicPoint2,
      ExactDyadicPoint2,
    ],
    barycentricVertices: Object.freeze(barycentricVertices),
  });
  return Object.freeze({
    patchId,
    artifactTriangleIndex: mapping.artifactTriangleIndex,
    artifactTriangleVerticesMm: artifactTriangle.verticesMm,
    ...(artifactTriangle.verticesPm === undefined
      ? {}
      : { artifactTriangleVerticesPm: artifactTriangle.verticesPm }),
    originalDomainTriangle: mapping.vertices,
    cell: frozenCell,
  });
}

function validatedResidualUpperMm(enclosure: ValidatedResidualEnclosure): number {
  if (typeof enclosure !== 'object' || enclosure === null) {
    throw new RangeError('Evaluator result must be a residual enclosure record');
  }
  const x = outwardInterval(enclosure.xMm.lower, enclosure.xMm.upper);
  const y = outwardInterval(enclosure.yMm.lower, enclosure.yMm.upper);
  const z = outwardInterval(enclosure.zMm.lower, enclosure.zMm.upper);
  return outwardVectorNormUpper(x, y, z);
}

function triangleSnapshot(
  artifact: ParsedMappedArtifact,
  triangleIndex: number,
  floatScratch: Float64Array,
  picometreScratch: BigInt64Array
): ArtifactTriangleSnapshot {
  if (artifact.format === 'stl') {
    artifact.readTriangle(triangleIndex, floatScratch);
    return Object.freeze({
      verticesMm: Object.freeze([
        Object.freeze([floatScratch[0], floatScratch[1], floatScratch[2]]),
        Object.freeze([floatScratch[3], floatScratch[4], floatScratch[5]]),
        Object.freeze([floatScratch[6], floatScratch[7], floatScratch[8]]),
      ]) as ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'],
    });
  }
  artifact.readTrianglePicometres(triangleIndex, picometreScratch);
  const verticesPm = Object.freeze([
    Object.freeze([
      picometreScratch[0].toString(),
      picometreScratch[1].toString(),
      picometreScratch[2].toString(),
    ]),
    Object.freeze([
      picometreScratch[3].toString(),
      picometreScratch[4].toString(),
      picometreScratch[5].toString(),
    ]),
    Object.freeze([
      picometreScratch[6].toString(),
      picometreScratch[7].toString(),
      picometreScratch[8].toString(),
    ]),
  ]) as NonNullable<ValidatedResidualEnclosureRequest['artifactTriangleVerticesPm']>;
  const verticesMm = Object.freeze(
    verticesPm.map((vertex) =>
      Object.freeze(vertex.map((coordinate) => Number(BigInt(coordinate)) / 1_000_000_000))
    )
  ) as unknown as ValidatedResidualEnclosureRequest['artifactTriangleVerticesMm'];
  return Object.freeze({ verticesMm, verticesPm });
}

function artifactSubsetSha256(
  artifact: ParsedMappedArtifact,
  mappings: readonly ExactDyadicMappedTriangle[],
  cancellationFlag: Int32Array | undefined,
  deadlineEpochMilliseconds?: number
): string {
  const encoder = new TextEncoder();
  const hasher = new IncrementalSha256()
    .update(encoder.encode('potfoundry.continuous-mapped-patch/artifact-subset/v2\0'))
    .update(encoder.encode(artifact.format))
    .update(Uint8Array.of(0))
    .update(encoder.encode(artifact.parsedTriangleSetSha256));
  if (artifact.format === 'stl') {
    const record = new Uint8Array(40);
    const view = new DataView(record.buffer);
    const triangle = new Float64Array(9);
    for (let mappingIndex = 0; mappingIndex < mappings.length; mappingIndex += 1) {
      if ((mappingIndex & 1023) === 0) {
        checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
      }
      const mapping = mappings[mappingIndex];
      artifact.readTriangle(mapping.artifactTriangleIndex, triangle);
      view.setUint32(0, mapping.artifactTriangleIndex, true);
      for (let coordinate = 0; coordinate < 9; coordinate += 1) {
        view.setFloat32(4 + coordinate * 4, triangle[coordinate], true);
      }
      hasher.update(record);
    }
  } else {
    const record = new Uint8Array(76);
    const view = new DataView(record.buffer);
    const triangle = new BigInt64Array(9);
    for (let mappingIndex = 0; mappingIndex < mappings.length; mappingIndex += 1) {
      if ((mappingIndex & 1023) === 0) {
        checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
      }
      const mapping = mappings[mappingIndex];
      artifact.readTrianglePicometres(mapping.artifactTriangleIndex, triangle);
      view.setUint32(0, mapping.artifactTriangleIndex, true);
      for (let coordinate = 0; coordinate < 9; coordinate += 1) {
        view.setBigInt64(4 + coordinate * 8, triangle[coordinate], true);
      }
      hasher.update(record);
    }
  }
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  return hasher.digestHex();
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

function snapshotContinuousOptions(
  untrusted: ContinuousMappedPatchDistanceOptions
): ContinuousMappedPatchDistanceOptions {
  const top = snapshotDataRecord(
    untrusted,
    [
      'cancellationFlag',
      'deadlineEpochMilliseconds',
      'maximumGeometricUpperPm',
      'maxDepth',
      'maxEvaluatorWorkUnits',
      'maxWorkCells',
      'partition',
      'progressCounter',
    ],
    ['maximumGeometricUpperPm'],
    'options'
  );
  const partitionValue = top.partition;
  const partitionSnapshot = partitionValue === undefined
    ? undefined
    : snapshotDataRecord(
        partitionValue,
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
        'options.partition'
      );
  const partition = partitionValue === undefined
    ? undefined
    : Object.freeze({
        maxTriangles: partitionSnapshot?.maxTriangles as number | undefined,
        maxBuildWork: partitionSnapshot?.maxBuildWork as number | undefined,
        maxBvhNodes: partitionSnapshot?.maxBvhNodes as number | undefined,
        maxTraversalVisits: partitionSnapshot?.maxTraversalVisits as number | undefined,
        maxBroadPhasePairChecks:
          partitionSnapshot?.maxBroadPhasePairChecks as number | undefined,
        maxPairChecks: partitionSnapshot?.maxPairChecks as number | undefined,
        deadlineEpochMilliseconds:
          partitionSnapshot?.deadlineEpochMilliseconds as number | undefined,
        cancellationFlag: partitionSnapshot?.cancellationFlag as Int32Array | undefined,
        progressCounter: partitionSnapshot?.progressCounter as Int32Array | undefined,
      });
  return Object.freeze({
    maximumGeometricUpperPm: top.maximumGeometricUpperPm as bigint,
    maxDepth: top.maxDepth as number | undefined,
    maxEvaluatorWorkUnits: top.maxEvaluatorWorkUnits as number | undefined,
    maxWorkCells: top.maxWorkCells as number | undefined,
    partition,
    deadlineEpochMilliseconds: top.deadlineEpochMilliseconds as number | undefined,
    cancellationFlag: top.cancellationFlag as Int32Array | undefined,
    progressCounter: top.progressCounter as Int32Array | undefined,
  });
}

/**
 * Execute a continuous shared-parameter residual proof for one target patch.
 * A successful result is a real patch-distance proof, not a complete solid
 * certificate; global coverage, topology, thickness, and budgets remain gates.
 */
export function certifyContinuousMappedPatchDistance(
  session: MappedArtifactProofSession,
  partitionInput: ExactDyadicDomainPartitionInput,
  evaluator: RegisteredValidatedResidualEvaluator,
  options: ContinuousMappedPatchDistanceOptions
): ContinuousMappedPatchDistanceResult {
  let artifact: ParsedMappedArtifact;
  try {
    artifact = parsedMappedArtifactForProofSession(session);
  } catch {
    invalid('artifact proof session must be minted by the exact final-byte parser');
  }
  if (typeof partitionInput !== 'object' || partitionInput === null) {
    invalid('partition input must be a record');
  }
  let optionsSnapshot: ContinuousMappedPatchDistanceOptions;
  try {
    optionsSnapshot = snapshotContinuousOptions(options);
  } catch (error) {
    invalid(
      error instanceof Error
        ? `continuous proof options could not be snapshotted safely: ${error.message}`
        : 'continuous proof options could not be snapshotted safely'
    );
  }
  if (
    typeof optionsSnapshot.maximumGeometricUpperPm !== 'bigint' ||
    optionsSnapshot.maximumGeometricUpperPm <= 0n ||
    optionsSnapshot.maximumGeometricUpperPm > MAX_CERTIFICATION_PM
  ) {
    invalid('maximumGeometricUpperPm must be a positive bounded bigint');
  }
  const maxDepth = optionsSnapshot.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 0 ||
    maxDepth > MAX_SUBDIVISION_DEPTH
  ) {
    invalid(`maxDepth must be an integer in [0, ${MAX_SUBDIVISION_DEPTH}]`);
  }
  const maxWorkCells = positiveSafeInteger(
    optionsSnapshot.maxWorkCells,
    CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_WORK_CELLS,
    'maxWorkCells'
  );
  if (maxWorkCells > CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS) {
    throw new ContinuousMappedPatchDistanceError(
      'RESOURCE_LIMIT',
      `maxWorkCells exceeds hard limit ${CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_WORK_CELLS}`
    );
  }
  const maxEvaluatorWorkUnits = positiveSafeInteger(
    optionsSnapshot.maxEvaluatorWorkUnits,
    CONTINUOUS_MAPPED_PATCH_DISTANCE_DEFAULT_MAX_EVALUATOR_WORK_UNITS,
    'maxEvaluatorWorkUnits'
  );
  if (
    maxEvaluatorWorkUnits >
    CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS
  ) {
    throw new ContinuousMappedPatchDistanceError(
      'RESOURCE_LIMIT',
      `maxEvaluatorWorkUnits exceeds hard limit ${CONTINUOUS_MAPPED_PATCH_DISTANCE_HARD_MAX_EVALUATOR_WORK_UNITS}`
    );
  }
  const maxPartitionTriangles = positiveSafeInteger(
    optionsSnapshot.partition?.maxTriangles,
    DEFAULT_DYADIC_PARTITION_MAX_TRIANGLES,
    'partition.maxTriangles'
  );
  if (maxPartitionTriangles > HARD_DYADIC_PARTITION_MAX_TRIANGLES) {
    throw new ContinuousMappedPatchDistanceError(
      'RESOURCE_LIMIT',
      `partition.maxTriangles exceeds hard limit ${HARD_DYADIC_PARTITION_MAX_TRIANGLES}`
    );
  }
  validateAtomicCounter(optionsSnapshot.cancellationFlag, 'cancellationFlag');
  validateAtomicCounter(optionsSnapshot.progressCounter, 'progressCounter');
  const requestedDeadline = optionsSnapshot.deadlineEpochMilliseconds;
  if (
    requestedDeadline !== undefined &&
    (!Number.isSafeInteger(requestedDeadline) || !Number.isFinite(requestedDeadline))
  ) {
    invalid('deadlineEpochMilliseconds must be a finite safe integer');
  }
  const deadlineEpochMilliseconds = Math.min(
    requestedDeadline ?? Number.MAX_SAFE_INTEGER,
    Date.now() + HARD_DYADIC_PARTITION_MAX_ELAPSED_MILLISECONDS
  );
  checkCancelled(optionsSnapshot.cancellationFlag, deadlineEpochMilliseconds);
  let evaluatorSnapshot: RegisteredValidatedResidualEvaluator;
  try {
    evaluatorSnapshot = registeredValidatedResidualEvaluatorForProof(evaluator);
  } catch {
    invalid('evaluator must be an authenticated registry handle');
  }
  let partitionSnapshot: ExactDyadicDomainPartitionInput;
  try {
    partitionSnapshot = snapshotExactDyadicDomainPartitionInputForProof(
      partitionInput,
      maxPartitionTriangles,
      optionsSnapshot.cancellationFlag,
      deadlineEpochMilliseconds
    );
  } catch (error) {
    if (error instanceof ExactDyadicDomainPartitionError) {
      if (error.code === 'CANCELLED') {
        throw new ContinuousMappedPatchDistanceError('CANCELLED', error.message);
      }
      if (error.code === 'RESOURCE_LIMIT') {
        throw new ContinuousMappedPatchDistanceError('RESOURCE_LIMIT', error.message);
      }
    }
    invalid(
      error instanceof Error
        ? `partition input could not be snapshotted safely: ${error.message}`
        : 'partition input could not be snapshotted safely'
    );
  }
  if (
    evaluatorSnapshot.patchId !== partitionSnapshot.patchId ||
    typeof evaluatorSnapshot.evaluatorId !== 'string' ||
    !ID_RE.test(evaluatorSnapshot.evaluatorId) ||
    typeof evaluatorSnapshot.evaluatorVersion !== 'string' ||
    !ID_RE.test(evaluatorSnapshot.evaluatorVersion) ||
    typeof evaluatorSnapshot.evaluatorSourceSha256 !== 'string' ||
    !SHA256_RE.test(evaluatorSnapshot.evaluatorSourceSha256) ||
    typeof evaluatorSnapshot.evaluatorProofSha256 !== 'string' ||
    !SHA256_RE.test(evaluatorSnapshot.evaluatorProofSha256) ||
    typeof evaluatorSnapshot.evaluatorProgramSha256 !== 'string' ||
    !SHA256_RE.test(evaluatorSnapshot.evaluatorProgramSha256) ||
    !Number.isSafeInteger(evaluatorSnapshot.evaluatorWorkUnitsPerCell) ||
    evaluatorSnapshot.evaluatorWorkUnitsPerCell <= 0 ||
    evaluatorSnapshot.evaluatorWorkUnitsPerCell > VALIDATED_RESIDUAL_PROGRAM_MAX_NODES ||
    evaluatorSnapshot.evaluatorCompilerVersion !==
      VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION ||
    evaluatorSnapshot.evaluatorCompilerProofSha256 !==
      VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256 ||
    typeof evaluatorSnapshot.targetSha256 !== 'string' ||
    !SHA256_RE.test(evaluatorSnapshot.targetSha256) ||
    typeof evaluatorSnapshot.encloseResidual !== 'function' ||
    typeof evaluatorSnapshot.encloseResidualFast !== 'function' ||
    typeof evaluatorSnapshot.encloseResidualFastNumeric !== 'function'
  ) {
    invalid('Evaluator identity, target binding, patch binding, or implementation is invalid');
  }
  if (partitionSnapshot.artifactTriangleCount !== artifact.triangleCount) {
    invalid('Partition artifact triangle count does not match the parsed final artifact');
  }
  const partition = verifyExactDyadicRectanglePartition(partitionSnapshot, {
    ...optionsSnapshot.partition,
    cancellationFlag: optionsSnapshot.cancellationFlag,
    deadlineEpochMilliseconds,
  });
  const subsetSha256 = artifactSubsetSha256(
    artifact,
    partitionSnapshot.triangles,
    optionsSnapshot.cancellationFlag,
    deadlineEpochMilliseconds
  );
  const partitionWorkUnitCount =
    partition.triangleCount +
    partition.buildWorkCount +
    partition.bvhNodeCount +
    partition.traversalVisitCount +
    partition.broadPhasePairCheckCount +
    partition.pairCheckCount;
  const floatTriangleScratch = new Float64Array(9);
  const picometreTriangleScratch = new BigInt64Array(9);
  // Numeric screen scratch (reused across every cell of the proof).
  const numericOriginalU = new Float64Array(3);
  const numericOriginalV = new Float64Array(3);
  const numericArtifact = new Float64Array(9);
  const numericCellU = new Float64Array(3);
  const numericCellV = new Float64Array(3);
  const numericBarycentric = new Float64Array(9);
  let workCellCount = 0;
  let evaluatorWorkUnitCount = 0;
  let acceptedLeafCellCount = 0;
  let fastScreenAcceptedCellCount = 0;
  let maximumDepthReached = 0;
  let maximumResidualUpperPm = 0n;

  for (const mapping of partitionSnapshot.triangles) {
    const artifactVertices = triangleSnapshot(
      artifact,
      mapping.artifactTriangleIndex,
      floatTriangleScratch,
      picometreTriangleScratch
    );
    // The numeric screen channel needs exact float64 encodings: original
    // triangle numerators that stay integers, and binary32 STL coordinates
    // (already exact in the snapshot). Picometre formats keep the canonical
    // string channel.
    let numericAvailable = artifact.format === 'stl';
    let numericMaxNumerator = 0;
    for (let vertex = 0; vertex < 3 && numericAvailable; vertex += 1) {
      const uNumerator = Number(mapping.vertices[vertex].uNumerator);
      const vNumerator = Number(mapping.vertices[vertex].vNumerator);
      if (
        !Number.isSafeInteger(uNumerator) ||
        !Number.isSafeInteger(vNumerator) ||
        uNumerator < 0 ||
        vNumerator < 0
      ) {
        numericAvailable = false;
        break;
      }
      numericOriginalU[vertex] = uNumerator;
      numericOriginalV[vertex] = vNumerator;
      numericMaxNumerator = Math.max(numericMaxNumerator, uNumerator, vNumerator);
    }
    if (numericAvailable) {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        for (let coordinate = 0; coordinate < 3; coordinate += 1) {
          numericArtifact[vertex * 3 + coordinate] =
            artifactVertices.verticesMm[vertex][coordinate];
        }
      }
    }
    const stack: WorkCell[] = [
      {
        depth: 0,
        vertices: [
          { a: 1, b: 0, c: 0 },
          { a: 0, b: 1, c: 0 },
          { a: 0, b: 0, c: 1 },
        ],
      },
    ];
    while (stack.length > 0) {
      checkCancelled(optionsSnapshot.cancellationFlag, deadlineEpochMilliseconds);
      const cell = stack.pop();
      if (cell === undefined) break;
      workCellCount += 1;
      if (workCellCount > maxWorkCells) {
        throw new ContinuousMappedPatchDistanceError(
          'RESOURCE_LIMIT',
          `Continuous proof exceeds maxWorkCells=${maxWorkCells}`,
          mapping.artifactTriangleIndex,
          cell.depth
        );
      }
      // Differentiated work charge: every consulted cell costs one unit for
      // the float64 screen; only cells the validated decimal enclosure
      // actually decides additionally cost the authenticated program node
      // count. The pre-check reserves the screen unit; the decimal charge is
      // levied (and checked) at the consult site below.
      if (evaluatorWorkUnitCount > maxEvaluatorWorkUnits - 1) {
        throw new ContinuousMappedPatchDistanceError(
          'RESOURCE_LIMIT',
          `Continuous proof exceeds maxEvaluatorWorkUnits=${maxEvaluatorWorkUnits}`,
          mapping.artifactTriangleIndex,
          cell.depth
        );
      }
      evaluatorWorkUnitCount += 1;
      maximumDepthReached = Math.max(maximumDepthReached, cell.depth);
      let residualUpperPm: bigint;
      let acceptedByFastScreen = false;
      try {
        // Acceptance-only screen: a non-null centered mean-value enclosure
        // that already meets the budget accepts the cell without the decimal
        // kernel. When the screen answers over budget below maximum depth,
        // subdividing directly is both sound and far cheaper than consulting
        // the decimal kernel — the screen tightens quadratically with cell
        // size, so it re-decides the children. The validated decimal
        // enclosure remains the deciding authority whenever the screen is
        // unavailable and as the last consult at maximum depth before an
        // INCONCLUSIVE refusal.
        //
        // The screen is consulted over the exact numeric channel when every
        // weighted numerator combination stays an exact float64 integer;
        // canonical request construction (BigInt exact points) then happens
        // only for cells the decimal kernel actually decides.
        let fastUpperPm: bigint | null = null;
        let screenConsulted = false;
        const weightScale = 2 ** cell.depth;
        if (
          numericAvailable &&
          numericMaxNumerator * weightScale <= 4_503_599_627_370_496
        ) {
          for (let vertex = 0; vertex < 3; vertex += 1) {
            const weight = cell.vertices[vertex];
            numericCellU[vertex] =
              weight.a * numericOriginalU[0] +
              weight.b * numericOriginalU[1] +
              weight.c * numericOriginalU[2];
            numericCellV[vertex] =
              weight.a * numericOriginalV[0] +
              weight.b * numericOriginalV[1] +
              weight.c * numericOriginalV[2];
            numericBarycentric[vertex * 3] = weight.a;
            numericBarycentric[vertex * 3 + 1] = weight.b;
            numericBarycentric[vertex * 3 + 2] = weight.c;
          }
          screenConsulted = true;
          const numericEnclosure = evaluatorSnapshot.encloseResidualFastNumeric(
            numericCellU,
            numericCellV,
            partitionSnapshot.fractionBits + cell.depth,
            numericBarycentric,
            cell.depth,
            numericArtifact
          );
          if (numericEnclosure !== null) {
            fastUpperPm = float64UpperMillimetresToPicometres(
              validatedResidualUpperMm(numericEnclosure)
            );
          }
        }
        let request: ValidatedResidualEnclosureRequest | null = null;
        if (!screenConsulted) {
          request = requestForCell(
            mapping,
            partitionSnapshot.patchId,
            partitionSnapshot.fractionBits,
            artifactVertices,
            cell
          );
          const fastEnclosure = evaluatorSnapshot.encloseResidualFast(request);
          if (fastEnclosure !== null) {
            fastUpperPm = float64UpperMillimetresToPicometres(
              validatedResidualUpperMm(fastEnclosure)
            );
          }
        }
        if (fastUpperPm !== null && fastUpperPm <= optionsSnapshot.maximumGeometricUpperPm) {
          residualUpperPm = fastUpperPm;
          acceptedByFastScreen = true;
        } else if (fastUpperPm !== null && cell.depth < maxDepth) {
          residualUpperPm = fastUpperPm;
        } else {
          if (request === null) {
            request = requestForCell(
              mapping,
              partitionSnapshot.patchId,
              partitionSnapshot.fractionBits,
              artifactVertices,
              cell
            );
          }
          if (
            evaluatorWorkUnitCount >
            maxEvaluatorWorkUnits - evaluatorSnapshot.evaluatorWorkUnitsPerCell
          ) {
            throw new ContinuousMappedPatchDistanceError(
              'RESOURCE_LIMIT',
              `Continuous proof exceeds maxEvaluatorWorkUnits=${maxEvaluatorWorkUnits}`,
              mapping.artifactTriangleIndex,
              cell.depth
            );
          }
          evaluatorWorkUnitCount += evaluatorSnapshot.evaluatorWorkUnitsPerCell;
          residualUpperPm = float64UpperMillimetresToPicometres(
            validatedResidualUpperMm(evaluatorSnapshot.encloseResidual(request))
          );
        }
      } catch (error) {
        throw new ContinuousMappedPatchDistanceError(
          'EVALUATOR_REFUSED',
          error instanceof Error
            ? `Validated evaluator refused: ${error.message}`
            : 'Validated evaluator refused',
          mapping.artifactTriangleIndex,
          cell.depth
        );
      }
      if (residualUpperPm <= optionsSnapshot.maximumGeometricUpperPm) {
        acceptedLeafCellCount += 1;
        if (acceptedByFastScreen) fastScreenAcceptedCellCount += 1;
        if (residualUpperPm > maximumResidualUpperPm) {
          maximumResidualUpperPm = residualUpperPm;
        }
      } else if (cell.depth >= maxDepth) {
        throw new ContinuousMappedPatchDistanceError(
          'INCONCLUSIVE',
          `Residual upper ${residualUpperPm} pm exceeds ${optionsSnapshot.maximumGeometricUpperPm} pm at maximum depth`,
          mapping.artifactTriangleIndex,
          cell.depth
        );
      } else {
        const children = subdivide(cell);
        for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
          stack.push(children[childIndex]);
        }
      }
      if (optionsSnapshot.progressCounter !== undefined) {
        Atomics.store(optionsSnapshot.progressCounter, 0, workCellCount);
      }
    }
  }

  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.continuous-mapped-patch/distance-evidence/v1',
    {
      acceptedLeafCellCount: acceptedLeafCellCount.toString(),
      fastScreenAcceptedCellCount: fastScreenAcceptedCellCount.toString(),
      artifactByteSha256: artifact.byteSha256,
      artifactCoordinateEncoding:
        artifact.format === 'stl' ? 'exact-binary32-mm' : 'exact-integer-pm',
      artifactFormat: artifact.format,
      artifactTriangleSubsetCount: partitionSnapshot.triangles.length.toString(),
      artifactTriangleSubsetSha256: subsetSha256,
      evaluatorId: evaluatorSnapshot.evaluatorId,
      evaluatorProofSha256: evaluatorSnapshot.evaluatorProofSha256,
      evaluatorProgramSha256: evaluatorSnapshot.evaluatorProgramSha256,
      evaluatorWorkUnitCount: evaluatorWorkUnitCount.toString(),
      evaluatorWorkUnitsPerCell: evaluatorSnapshot.evaluatorWorkUnitsPerCell.toString(),
      evaluatorCompilerVersion: evaluatorSnapshot.evaluatorCompilerVersion,
      evaluatorCompilerProofSha256: evaluatorSnapshot.evaluatorCompilerProofSha256,
      evaluatorSourceSha256: evaluatorSnapshot.evaluatorSourceSha256,
      evaluatorVersion: evaluatorSnapshot.evaluatorVersion,
      maximumDepthReached: maximumDepthReached.toString(),
      certifiedMaximumGeometricUpperPm:
        optionsSnapshot.maximumGeometricUpperPm.toString(),
      maximumResidualUpperPm: maximumResidualUpperPm.toString(),
      parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
      partitionEvidenceSha256: partition.evidenceSha256,
      partitionWorkUnitCount: partitionWorkUnitCount.toString(),
      patchId: partitionSnapshot.patchId,
      proofMethodSha256: CONTINUOUS_MAPPED_PATCH_DISTANCE_PROOF_SHA256,
      proofVersion: CONTINUOUS_MAPPED_PATCH_DISTANCE_VERSION,
      targetSha256: evaluatorSnapshot.targetSha256,
      workCellCount: workCellCount.toString(),
    }
  );

  return Object.freeze({
    proofVersion: CONTINUOUS_MAPPED_PATCH_DISTANCE_VERSION,
    proofMethodSha256: CONTINUOUS_MAPPED_PATCH_DISTANCE_PROOF_SHA256,
    evidenceSha256,
    artifactFormat: artifact.format,
    artifactCoordinateEncoding:
      artifact.format === 'stl' ? 'exact-binary32-mm' : 'exact-integer-pm',
    artifactByteSha256: artifact.byteSha256,
    parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
    targetSha256: evaluatorSnapshot.targetSha256,
    patchId: partitionSnapshot.patchId,
    evaluatorId: evaluatorSnapshot.evaluatorId,
    evaluatorVersion: evaluatorSnapshot.evaluatorVersion,
    evaluatorSourceSha256: evaluatorSnapshot.evaluatorSourceSha256,
    evaluatorProofSha256: evaluatorSnapshot.evaluatorProofSha256,
    evaluatorProgramSha256: evaluatorSnapshot.evaluatorProgramSha256,
    evaluatorWorkUnitsPerCell: evaluatorSnapshot.evaluatorWorkUnitsPerCell,
    evaluatorCompilerVersion: evaluatorSnapshot.evaluatorCompilerVersion,
    evaluatorCompilerProofSha256: evaluatorSnapshot.evaluatorCompilerProofSha256,
    partitionEvidenceSha256: partition.evidenceSha256,
    artifactTriangleSubsetSha256: subsetSha256,
    artifactTriangleSubsetCount: partitionSnapshot.triangles.length,
    partitionWorkUnitCount,
    workCellCount,
    evaluatorWorkUnitCount,
    acceptedLeafCellCount,
    fastScreenAcceptedCellCount,
    maximumDepthReached,
    certifiedMaximumGeometricUpperPm:
      optionsSnapshot.maximumGeometricUpperPm.toString(),
    targetToMeshUpperPm: maximumResidualUpperPm.toString(),
    meshToTargetUpperPm: maximumResidualUpperPm.toString(),
    scanComplete: true,
    continuousCorrespondenceProven: true,
  });
}
