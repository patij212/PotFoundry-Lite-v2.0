import {
  domainSeparatedCanonicalJsonSha256,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import { sha256Utf8 } from './incrementalSha256';
import type { ValidatedResidualEnclosureRequest } from './continuousMappedPatchDistance';
import {
  compileValidatedResidualProgram,
  evaluateCompiledValidatedResidualProgram,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
  VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
  type CompiledValidatedResidualProgram,
} from './validatedResidualProgram';

export const VALIDATED_TARGET_SCALAR_POSITIVITY_VERSION =
  'potfoundry.validated-target-scalar-positivity/v2' as const;
export const VALIDATED_TARGET_SCALAR_POSITIVITY_SCOPE =
  'continuous-strict-positivity-of-target-x-over-unit-square-only' as const;
export const VALIDATED_TARGET_SCALAR_POSITIVITY_PROOF_SHA256 = sha256Utf8(
  [
    VALIDATED_TARGET_SCALAR_POSITIVITY_VERSION,
    `scope=${VALIDATED_TARGET_SCALAR_POSITIVITY_SCOPE}`,
    `validated-compiler=${VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION}`,
    `validated-compiler-proof=${VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256}`,
    'the target-only canonical SSA program is compiled by the pinned validated residual compiler',
    'the closed unit square is covered by exact dyadic rectangles with no sampling acceptance path',
    'each rectangle is covered by two exact dyadic triangles so affine and nonlinear target programs are both enclosed',
    'artifact coordinates are exact zero, therefore the validated x residual enclosure is the target x enclosure',
    'a rectangle is accepted only when its outward lower x bound is strictly positive',
    'nonpositive upper bounds reject; straddling bounds subdivide or refuse at a declared depth/work cap',
    'interval-domain uncertainty from the evaluator is subdivided and may never be accepted without a successful enclosure',
    'minimum accepted lower bounds are converted to integer picometres by exact IEEE-754 significand arithmetic with floor rounding',
    'cancellation, numeric uncertainty, invalid programs, and resource exhaustion refuse',
    'this proves scalar positivity only; program provenance, geometric regularity, topology, device conformance, and artifact tolerance remain separate obligations',
  ].join('\n')
);

export interface ValidatedTargetScalarPositivityOptions {
  readonly maxDepth?: number;
  readonly maxWorkCells?: number;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export type ValidatedTargetScalarPositivityErrorCode =
  | 'INVALID_INPUT'
  | 'NON_POSITIVE'
  | 'INCONCLUSIVE'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED'
  | 'EVALUATOR_REFUSED';

export class ValidatedTargetScalarPositivityError extends Error {
  readonly code: ValidatedTargetScalarPositivityErrorCode;
  readonly depth?: number;

  constructor(
    code: ValidatedTargetScalarPositivityErrorCode,
    message: string,
    depth?: number
  ) {
    super(message);
    this.name = 'ValidatedTargetScalarPositivityError';
    this.code = code;
    this.depth = depth;
  }
}

export interface ValidatedTargetScalarPositivityResult {
  readonly proofVersion: typeof VALIDATED_TARGET_SCALAR_POSITIVITY_VERSION;
  readonly proofMethodSha256: string;
  readonly implementationScope: typeof VALIDATED_TARGET_SCALAR_POSITIVITY_SCOPE;
  readonly evidenceSha256: string;
  readonly programSha256: string;
  readonly patchId: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly minimumTargetXLowerMm: number;
  readonly minimumTargetXLowerPm: string;
  readonly workCellCount: number;
  readonly evaluatorCallCount: number;
  readonly acceptedLeafCellCount: number;
  readonly maximumDepthReached: number;
  readonly unitSquareCovered: true;
  readonly strictPositive: true;
}

interface DyadicRectangle {
  readonly depth: number;
  readonly u0: bigint;
  readonly u1: bigint;
  readonly v0: bigint;
  readonly v1: bigint;
}

const DEFAULT_MAX_DEPTH = 18;
const DEFAULT_MAX_WORK_CELLS = 1_000_000;
const MAX_DEPTH = 30;
const MAX_WORK_CELLS = 4_000_000;
const PICOMETRES_PER_MILLIMETRE = 1_000_000_000n;
const MAX_CERTIFICATION_PM = 1_000_000_000_000_000_000n;
const floatScratch = new ArrayBuffer(8);
const floatValues = new Float64Array(floatScratch);
const floatBits = new BigUint64Array(floatScratch);
const FRACTION_MASK = (1n << 52n) - 1n;
const EXPONENT_MASK = 0x7ffn;

function invalid(message: string): never {
  throw new ValidatedTargetScalarPositivityError('INVALID_INPUT', message);
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0 || resolved > maximum) {
    invalid(`${label} must be a positive safe integer no greater than ${maximum}`);
  }
  return resolved;
}

function sharedInt32(value: Int32Array | undefined, label: string): void {
  if (value === undefined) return;
  const isInt32 =
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === '[object Int32Array]';
  const bufferTag = Object.prototype.toString.call(value.buffer);
  if (!isInt32 || value.length < 1 || bufferTag !== '[object SharedArrayBuffer]') {
    invalid(`${label} must contain index 0 and be backed by SharedArrayBuffer`);
  }
}

function checkCancelled(flag: Int32Array | undefined): void {
  if (flag !== undefined && Atomics.load(flag, 0) !== 0) {
    throw new ValidatedTargetScalarPositivityError(
      'CANCELLED',
      'Validated scalar positivity proof cancelled'
    );
  }
}

function dyadicPoint(
  u: bigint,
  v: bigint
): Readonly<{ uNumerator: string; vNumerator: string }> {
  return Object.freeze({ uNumerator: u.toString(), vNumerator: v.toString() });
}

const ZERO_TRIANGLE = Object.freeze([
  Object.freeze([0, 0, 0] as const),
  Object.freeze([0, 0, 0] as const),
  Object.freeze([0, 0, 0] as const),
] as const);

const IDENTITY_BARYCENTRIC = Object.freeze([
  Object.freeze({ aNumerator: '1', bNumerator: '0', cNumerator: '0' }),
  Object.freeze({ aNumerator: '0', bNumerator: '1', cNumerator: '0' }),
  Object.freeze({ aNumerator: '0', bNumerator: '0', cNumerator: '1' }),
] as const);

function triangleRequest(
  program: CompiledValidatedResidualProgram,
  rectangle: DyadicRectangle,
  triangleIndex: 0 | 1
): ValidatedResidualEnclosureRequest {
  const { u0, u1, v0, v1 } = rectangle;
  const vertices = triangleIndex === 0
    ? Object.freeze([
        dyadicPoint(u0, v0),
        dyadicPoint(u1, v0),
        dyadicPoint(u1, v1),
      ] as const)
    : Object.freeze([
        dyadicPoint(u0, v0),
        dyadicPoint(u1, v1),
        dyadicPoint(u0, v1),
      ] as const);
  return Object.freeze({
    patchId: program.patchId,
    artifactTriangleIndex: triangleIndex,
    artifactTriangleVerticesMm: ZERO_TRIANGLE,
    originalDomainTriangle: vertices,
    cell: Object.freeze({
      fractionBits: rectangle.depth,
      barycentricFractionBits: 0,
      vertices,
      barycentricVertices: IDENTITY_BARYCENTRIC,
    }),
  });
}

function encloseRectangleX(
  program: CompiledValidatedResidualProgram,
  rectangle: DyadicRectangle
): Readonly<{ lower: number; upper: number }> {
  try {
    const first = evaluateCompiledValidatedResidualProgram(
      program,
      triangleRequest(program, rectangle, 0)
    ).xMm;
    const second = evaluateCompiledValidatedResidualProgram(
      program,
      triangleRequest(program, rectangle, 1)
    ).xMm;
    return Object.freeze({
      lower: Math.min(first.lower, second.lower),
      upper: Math.max(first.upper, second.upper),
    });
  } catch (error) {
    if (error instanceof ValidatedTargetScalarPositivityError) throw error;
    throw new ValidatedTargetScalarPositivityError(
      'EVALUATOR_REFUSED',
      `Validated scalar evaluator refused at depth ${rectangle.depth}: ${
        error instanceof Error ? error.message : 'unknown evaluator failure'
      }`,
      rectangle.depth
    );
  }
}

function subdivide(rectangle: DyadicRectangle): readonly DyadicRectangle[] {
  const depth = rectangle.depth + 1;
  const u0 = rectangle.u0 * 2n;
  const u1 = rectangle.u1 * 2n;
  const v0 = rectangle.v0 * 2n;
  const v1 = rectangle.v1 * 2n;
  const um = rectangle.u0 + rectangle.u1;
  const vm = rectangle.v0 + rectangle.v1;
  return rectangle.depth % 2 === 0
    ? Object.freeze([
        Object.freeze({ depth, u0, u1: um, v0, v1 }),
        Object.freeze({ depth, u0: um, u1, v0, v1 }),
      ])
    : Object.freeze([
        Object.freeze({ depth, u0, u1, v0, v1: vm }),
        Object.freeze({ depth, u0, u1, v0: vm, v1 }),
      ]);
}

/** Exact floor(binary64 millimetres * 1e9) for a nonnegative lower bound. */
function lowerMillimetresToPicometres(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Scalar lower bound must be finite and nonnegative');
  }
  if (value === 0) return 0n;
  floatValues[0] = value;
  const bits = floatBits[0];
  const exponentBits = (bits >> 52n) & EXPONENT_MASK;
  const fraction = bits & FRACTION_MASK;
  const significand = exponentBits === 0n ? fraction : (1n << 52n) | fraction;
  const binaryExponent =
    exponentBits === 0n ? -1074 : Number(exponentBits) - 1023 - 52;
  const numerator = significand * PICOMETRES_PER_MILLIMETRE;
  const result = binaryExponent >= 0
    ? numerator << BigInt(binaryExponent)
    : numerator / (1n << BigInt(-binaryExponent));
  if (result > MAX_CERTIFICATION_PM) {
    throw new RangeError('Scalar lower bound exceeds the certification envelope');
  }
  return result;
}

/**
 * Prove that target x is strictly positive everywhere on the closed unit square.
 * An uncertain or nonpositive cell never returns a successful result.
 */
export function proveValidatedTargetScalarPositive(
  canonicalProgramJson: string,
  options: ValidatedTargetScalarPositivityOptions = {}
): ValidatedTargetScalarPositivityResult {
  if (typeof canonicalProgramJson !== 'string') invalid('program must be canonical JSON text');
  const maxDepth = boundedInteger(options.maxDepth, DEFAULT_MAX_DEPTH, MAX_DEPTH, 'maxDepth');
  const maxWorkCells = boundedInteger(
    options.maxWorkCells,
    DEFAULT_MAX_WORK_CELLS,
    MAX_WORK_CELLS,
    'maxWorkCells'
  );
  sharedInt32(options.cancellationFlag, 'cancellationFlag');
  sharedInt32(options.progressCounter, 'progressCounter');

  let program: CompiledValidatedResidualProgram;
  try {
    program = compileValidatedResidualProgram(canonicalProgramJson);
  } catch (error) {
    throw new ValidatedTargetScalarPositivityError(
      'INVALID_INPUT',
      `Validated scalar program refused: ${error instanceof Error ? error.message : 'unknown compiler failure'}`
    );
  }

  const stack: DyadicRectangle[] = [
    Object.freeze({ depth: 0, u0: 0n, u1: 1n, v0: 0n, v1: 1n }),
  ];
  let workCellCount = 0;
  let acceptedLeafCellCount = 0;
  let maximumDepthReached = 0;
  let minimumTargetXLowerMm = Number.POSITIVE_INFINITY;

  while (stack.length > 0) {
    checkCancelled(options.cancellationFlag);
    if (workCellCount >= maxWorkCells) {
      throw new ValidatedTargetScalarPositivityError(
        'RESOURCE_LIMIT',
        `Validated scalar positivity exceeded maxWorkCells=${maxWorkCells}`
      );
    }
    const rectangle = stack.pop();
    if (rectangle === undefined) invalid('internal work stack underflow');
    workCellCount += 1;
    maximumDepthReached = Math.max(maximumDepthReached, rectangle.depth);
    if (options.progressCounter !== undefined) Atomics.add(options.progressCounter, 0, 1);

    let enclosure: Readonly<{ lower: number; upper: number }>;
    try {
      enclosure = encloseRectangleX(program, rectangle);
    } catch (error) {
      if (
        !(error instanceof ValidatedTargetScalarPositivityError) ||
        error.code !== 'EVALUATOR_REFUSED' ||
        rectangle.depth >= maxDepth
      ) {
        throw error;
      }
      const children = subdivide(rectangle);
      if (workCellCount + stack.length + children.length > maxWorkCells) {
        throw new ValidatedTargetScalarPositivityError(
          'RESOURCE_LIMIT',
          `Validated scalar positivity would exceed maxWorkCells=${maxWorkCells}`,
          rectangle.depth
        );
      }
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
      continue;
    }
    if (enclosure.lower > 0) {
      minimumTargetXLowerMm = Math.min(minimumTargetXLowerMm, enclosure.lower);
      acceptedLeafCellCount += 1;
      continue;
    }
    if (enclosure.upper <= 0) {
      throw new ValidatedTargetScalarPositivityError(
        'NON_POSITIVE',
        `Target x is not strictly positive in a validated cell at depth ${rectangle.depth}`,
        rectangle.depth
      );
    }
    if (rectangle.depth >= maxDepth) {
      throw new ValidatedTargetScalarPositivityError(
        'INCONCLUSIVE',
        `Target x positivity remains uncertain at maxDepth=${maxDepth}`,
        rectangle.depth
      );
    }
    const children = subdivide(rectangle);
    if (workCellCount + stack.length + children.length > maxWorkCells) {
      throw new ValidatedTargetScalarPositivityError(
        'RESOURCE_LIMIT',
        `Validated scalar positivity would exceed maxWorkCells=${maxWorkCells}`,
        rectangle.depth
      );
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }

  if (!Number.isFinite(minimumTargetXLowerMm) || acceptedLeafCellCount === 0) {
    invalid('unit-square coverage produced no accepted leaves');
  }
  const minimumTargetXLowerPm = lowerMillimetresToPicometres(
    minimumTargetXLowerMm
  );
  const evidenceValue = {
    acceptedLeafCellCount: acceptedLeafCellCount.toString(),
    evaluatorCallCount: (workCellCount * 2).toString(),
    evaluatorId: program.evaluatorId,
    evaluatorVersion: program.evaluatorVersion,
    implementationScope: VALIDATED_TARGET_SCALAR_POSITIVITY_SCOPE,
    maximumDepthReached: maximumDepthReached.toString(),
    minimumTargetXLowerPm: minimumTargetXLowerPm.toString(),
    patchId: program.patchId,
    programSha256: program.programSha256,
    proofMethodSha256: VALIDATED_TARGET_SCALAR_POSITIVITY_PROOF_SHA256,
    proofVersion: VALIDATED_TARGET_SCALAR_POSITIVITY_VERSION,
    strictPositive: true,
    unitSquareCovered: true,
    workCellCount: workCellCount.toString(),
  } satisfies CanonicalJsonValue;
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.validated-target-scalar-positivity/evidence/v2',
    evidenceValue
  );
  return Object.freeze({
    proofVersion: VALIDATED_TARGET_SCALAR_POSITIVITY_VERSION,
    proofMethodSha256: VALIDATED_TARGET_SCALAR_POSITIVITY_PROOF_SHA256,
    implementationScope: VALIDATED_TARGET_SCALAR_POSITIVITY_SCOPE,
    evidenceSha256,
    programSha256: program.programSha256,
    patchId: program.patchId,
    evaluatorId: program.evaluatorId,
    evaluatorVersion: program.evaluatorVersion,
    minimumTargetXLowerMm,
    minimumTargetXLowerPm: minimumTargetXLowerPm.toString(),
    workCellCount,
    evaluatorCallCount: workCellCount * 2,
    acceptedLeafCellCount,
    maximumDepthReached,
    unitSquareCovered: true,
    strictPositive: true,
  });
}
