import {
  domainSeparatedCanonicalJsonSha256,
  parseCanonicalCertificationJson,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import { sha256Utf8 } from './incrementalSha256';
import {
  compileGeneratedTargetProgramBackends,
  type GeneratedTargetProgramBackends,
} from './validatedResidualProgram';

export const VALIDATED_PROGRAM_BOUNDARY_IDENTITY_VERSION =
  'potfoundry.validated-program-boundary-identity/v2' as const;
export const VALIDATED_PROGRAM_BOUNDARY_IDENTITY_PROOF_SHA256 = sha256Utf8(
  [
    VALIDATED_PROGRAM_BOUNDARY_IDENTITY_VERSION,
    'both inputs are accepted first by the pinned canonical validated-target SSA compiler',
    'one exact free boundary parameter is substituted for the varying unit-square coordinate',
    'the free parameter may be mapped to s or exact 1-s independently on each incident patch',
    'fixed boundary coordinates are substituted as exact zero or one',
    'the comparison may apply partial-algebra zero/one identities whose operands are not proven total on the complete boundary',
    'a coordinate-root radial projection x*(r/r) or y*(r/r) may be conditionally cancelled against an opaque caller-declared nonzero-evidence hash',
    'the hash is intentionally not treated as an authenticated proof capability',
    'a pass records only conditional structural alignment; exact boundary-image identity remains false',
    'total definedness, nonzero denominators, periodicity, arbitrary algebraic equivalence, Jacobian regularity, and injectivity are all outside this check',
  ].join('\n')
);

export type TargetProgramBoundarySide = 'u0' | 'u1' | 'v0' | 'v1';

export interface TargetProgramBoundaryTrace {
  readonly programCanonicalJson: string;
  readonly side: TargetProgramBoundarySide;
  readonly reverseFreeParameter?: boolean;
}

export interface ValidatedProgramBoundaryIdentityOptions {
  /**
   * Opaque caller declaration associated with coordinate-root r/r
   * cancellation. A syntactically valid hash is not authenticated evidence,
   * so this value can support diagnostics but cannot discharge a proof gate.
   */
  readonly radialProjectionNonzeroEvidenceSha256: string;
}

export interface ValidatedProgramBoundaryIdentityResult {
  readonly proofVersion: typeof VALIDATED_PROGRAM_BOUNDARY_IDENTITY_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly leftProgramSha256: string;
  readonly rightProgramSha256: string;
  readonly leftSide: TargetProgramBoundarySide;
  readonly rightSide: TargetProgramBoundarySide;
  readonly leftFreeParameterReversed: boolean;
  readonly rightFreeParameterReversed: boolean;
  readonly radialProjectionNonzeroEvidenceSha256: string;
  readonly radialProjectionNonzeroEvidenceAuthenticated: false;
  readonly totalDefinednessProven: false;
  readonly rootProjectionCancellationCount: number;
  readonly coordinateTermSha256s: readonly [string, string, string];
  readonly structuralBoundaryTermsIdenticalUnderDeclaredAssumptions: true;
  readonly exactBoundaryImageIdentityProven: false;
  readonly proofScope: 'conditional-structural-ssa-alignment-not-boundary-image-proof';
}

export type ValidatedProgramBoundaryIdentityErrorCode =
  | 'INVALID_INPUT'
  | 'BOUNDARY_MISMATCH';

export class ValidatedProgramBoundaryIdentityError extends Error {
  readonly code: ValidatedProgramBoundaryIdentityErrorCode;

  constructor(code: ValidatedProgramBoundaryIdentityErrorCode, message: string) {
    super(message);
    this.name = 'ValidatedProgramBoundaryIdentityError';
    this.code = code;
  }
}

type CanonicalRecord = { readonly [key: string]: CanonicalJsonValue };

interface SymbolicTerm {
  readonly id: number;
  readonly op: string;
  readonly value?: string;
  readonly args: readonly number[];
  readonly sha256: string;
}

interface ParsedProgram {
  readonly programSha256: string;
  readonly nodes: readonly CanonicalJsonValue[];
  readonly targetIndices: readonly [number, number, number];
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const INDEX_RE = /^(?:0|[1-9][0-9]*)$/;
const UNARY_OPERATIONS = new Set([
  'negate',
  'absolute',
  'square',
  'sqrt',
  'exp',
  'ln',
  'sin',
  'cos',
  'floor',
  'ceiling',
  'round',
  'fractional-part',
  'sign',
]);
const BINARY_OPERATIONS = new Set([
  'add',
  'subtract',
  'multiply',
  'divide',
  'minimum',
  'maximum',
  'power',
  'step',
  'atan2',
  'pcg2d-unit-x',
  'pcg2d-unit-y',
]);

function fail(
  code: ValidatedProgramBoundaryIdentityErrorCode,
  message: string
): never {
  throw new ValidatedProgramBoundaryIdentityError(code, message);
}

function canonicalRecord(value: CanonicalJsonValue, label: string): CanonicalRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_INPUT', `${label} must be a canonical object`);
  }
  return value as CanonicalRecord;
}

function canonicalIndex(
  value: CanonicalJsonValue | undefined,
  upperExclusive: number,
  label: string
): number {
  if (typeof value !== 'string' || !INDEX_RE.test(value)) {
    fail('INVALID_INPUT', `${label} is not a canonical node index`);
  }
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0 || index >= upperExclusive) {
    fail('INVALID_INPUT', `${label} is outside the node array`);
  }
  return index;
}

function parseProgram(programCanonicalJson: string): ParsedProgram {
  if (typeof programCanonicalJson !== 'string') {
    fail('INVALID_INPUT', 'programCanonicalJson must be a string');
  }
  let backends: GeneratedTargetProgramBackends;
  try {
    backends = compileGeneratedTargetProgramBackends(programCanonicalJson);
  } catch (error) {
    fail(
      'INVALID_INPUT',
      `validated target program refused: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
  const parsed = parseCanonicalCertificationJson(programCanonicalJson);
  if (!parsed.ok) fail('INVALID_INPUT', `program JSON refused: ${parsed.reason}`);
  const root = canonicalRecord(parsed.value, 'program');
  if (!Array.isArray(root.nodes)) fail('INVALID_INPUT', 'program nodes are unavailable');
  const nodes = root.nodes;
  const target = canonicalRecord(root.target, 'program target');
  return Object.freeze({
    programSha256: backends.programSha256,
    nodes,
    targetIndices: Object.freeze([
      canonicalIndex(target.x, nodes.length, 'target.x'),
      canonicalIndex(target.y, nodes.length, 'target.y'),
      canonicalIndex(target.z, nodes.length, 'target.z'),
    ] as const),
  });
}

class StructuralNormalizer {
  private readonly terms: SymbolicTerm[] = [];
  private readonly interned = new Map<string, SymbolicTerm>();
  readonly zero: SymbolicTerm;
  readonly one: SymbolicTerm;
  readonly freeParameter: SymbolicTerm;

  constructor() {
    this.zero = this.constant('0');
    this.one = this.constant('1');
    this.freeParameter = this.leaf('s');
  }

  term(id: number): SymbolicTerm {
    const term = this.terms[id];
    if (term === undefined) fail('INVALID_INPUT', 'internal symbolic term is unavailable');
    return term;
  }

  private intern(key: string, op: string, args: readonly number[], value?: string): SymbolicTerm {
    const existing = this.interned.get(key);
    if (existing !== undefined) return existing;
    const sha256 = sha256Utf8(
      [op, value ?? '', ...args.map((argument) => this.term(argument).sha256)].join('\0')
    );
    const term = Object.freeze({
      id: this.terms.length,
      op,
      ...(value === undefined ? {} : { value }),
      args: Object.freeze([...args]),
      sha256,
    });
    this.terms.push(term);
    this.interned.set(key, term);
    return term;
  }

  leaf(name: string): SymbolicTerm {
    return this.intern(`leaf\0${name}`, name, []);
  }

  constant(value: string): SymbolicTerm {
    return this.intern(`constant\0${value}`, 'constant', [], value);
  }

  unary(operation: string, argument: SymbolicTerm): SymbolicTerm {
    if (argument === this.zero) {
      if (
        operation === 'negate' ||
        operation === 'absolute' ||
        operation === 'square' ||
        operation === 'sqrt' ||
        operation === 'sin' ||
        operation === 'floor' ||
        operation === 'ceiling' ||
        operation === 'round' ||
        operation === 'fractional-part' ||
        operation === 'sign'
      ) {
        return this.zero;
      }
      if (operation === 'cos' || operation === 'exp') return this.one;
    }
    return this.intern(`unary\0${operation}\0${argument.id}`, operation, [argument.id]);
  }

  binary(operation: string, left: SymbolicTerm, right: SymbolicTerm): SymbolicTerm {
    if (operation === 'add') {
      if (left === this.zero) return right;
      if (right === this.zero) return left;
      if (right.op === 'subtract' && right.args.length === 2) {
        if (this.term(right.args[1]) === left) return this.term(right.args[0]);
      }
      if (left.op === 'subtract' && left.args.length === 2) {
        if (this.term(left.args[1]) === right) return this.term(left.args[0]);
      }
    } else if (operation === 'subtract') {
      if (left === right) return this.zero;
      if (right === this.zero) return left;
      if (left === this.one && right.op === 'subtract' && right.args.length === 2) {
        const nestedLeft = this.term(right.args[0]);
        if (nestedLeft === this.one) return this.term(right.args[1]);
      }
    } else if (operation === 'multiply') {
      if (left === this.zero || right === this.zero) return this.zero;
      if (left === this.one) return right;
      if (right === this.one) return left;
    } else if (operation === 'divide') {
      if (right === this.one) return left;
    } else if (operation === 'minimum' || operation === 'maximum') {
      if (left === right) return left;
    } else if (operation === 'power' && right === this.one) {
      return left;
    }
    return this.intern(
      `binary\0${operation}\0${left.id}\0${right.id}`,
      operation,
      [left.id, right.id]
    );
  }
}

function boundaryInputs(
  normalizer: StructuralNormalizer,
  side: TargetProgramBoundarySide,
  reverseFreeParameter: boolean
): readonly [SymbolicTerm, SymbolicTerm] {
  const parameter = reverseFreeParameter
    ? normalizer.binary('subtract', normalizer.one, normalizer.freeParameter)
    : normalizer.freeParameter;
  if (side === 'u0') return Object.freeze([normalizer.zero, parameter] as const);
  if (side === 'u1') return Object.freeze([normalizer.one, parameter] as const);
  if (side === 'v0') return Object.freeze([parameter, normalizer.zero] as const);
  if (side === 'v1') return Object.freeze([parameter, normalizer.one] as const);
  fail('INVALID_INPUT', 'boundary side is unsupported');
}

function normalizeProgramBoundary(
  program: ParsedProgram,
  normalizer: StructuralNormalizer,
  side: TargetProgramBoundarySide,
  reverseFreeParameter: boolean
): readonly [SymbolicTerm, SymbolicTerm, SymbolicTerm] {
  const [u, v] = boundaryInputs(normalizer, side, reverseFreeParameter);
  const references: SymbolicTerm[] = [];
  for (let index = 0; index < program.nodes.length; index += 1) {
    const node = canonicalRecord(program.nodes[index], `node ${index}`);
    const operation = node.op;
    if (typeof operation !== 'string') fail('INVALID_INPUT', `node ${index} has no operation`);
    let term: SymbolicTerm;
    if (operation === 'constant') {
      if (typeof node.value !== 'string') fail('INVALID_INPUT', `node ${index} constant is invalid`);
      term = normalizer.constant(node.value);
    } else if (operation === 'u') {
      term = u;
    } else if (operation === 'v') {
      term = v;
    } else if (operation === 'pi') {
      term = normalizer.leaf('pi');
    } else if (UNARY_OPERATIONS.has(operation)) {
      term = normalizer.unary(
        operation,
        references[canonicalIndex(node.arg, index, `node ${index}.arg`)]
      );
    } else if (BINARY_OPERATIONS.has(operation)) {
      term = normalizer.binary(
        operation,
        references[canonicalIndex(node.left, index, `node ${index}.left`)],
        references[canonicalIndex(node.right, index, `node ${index}.right`)]
      );
    } else {
      fail('INVALID_INPUT', `node ${index} operation '${operation}' is unsupported`);
    }
    references.push(term);
  }
  return Object.freeze([
    references[program.targetIndices[0]],
    references[program.targetIndices[1]],
    references[program.targetIndices[2]],
  ] as const);
}

function simplifyCoordinateRootProjection(
  value: SymbolicTerm,
  normalizer: StructuralNormalizer
): Readonly<{ term: SymbolicTerm; cancellationUsed: boolean }> {
  if (value.op !== 'multiply' || value.args.length !== 2) {
    return Object.freeze({ term: value, cancellationUsed: false });
  }
  for (let divisionSide = 0; divisionSide < 2; divisionSide += 1) {
    const division = normalizer.term(value.args[divisionSide]);
    if (
      division.op === 'divide' &&
      division.args.length === 2 &&
      division.args[0] === division.args[1]
    ) {
      return Object.freeze({
        term: normalizer.term(value.args[1 - divisionSide]),
        cancellationUsed: true,
      });
    }
  }
  return Object.freeze({ term: value, cancellationUsed: false });
}

function snapshotTrace(value: TargetProgramBoundaryTrace, label: string): Readonly<{
  programCanonicalJson: string;
  side: TargetProgramBoundarySide;
  reverseFreeParameter: boolean;
}> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail('INVALID_INPUT', `${label} must be a record`);
  }
  if (!['u0', 'u1', 'v0', 'v1'].includes(value.side)) {
    fail('INVALID_INPUT', `${label}.side is unsupported`);
  }
  if (
    value.reverseFreeParameter !== undefined &&
    typeof value.reverseFreeParameter !== 'boolean'
  ) {
    fail('INVALID_INPUT', `${label}.reverseFreeParameter must be boolean`);
  }
  return Object.freeze({
    programCanonicalJson: value.programCanonicalJson,
    side: value.side,
    reverseFreeParameter: value.reverseFreeParameter ?? false,
  });
}

/**
 * Compare two non-periodic target-program boundaries structurally under
 * explicitly unauthenticated nonzero and definedness assumptions. This is a
 * useful construction regression, but it is not an exact boundary-image proof.
 */
export function proveValidatedProgramBoundaryIdentity(
  leftValue: TargetProgramBoundaryTrace,
  rightValue: TargetProgramBoundaryTrace,
  options: ValidatedProgramBoundaryIdentityOptions
): ValidatedProgramBoundaryIdentityResult {
  const left = snapshotTrace(leftValue, 'left trace');
  const right = snapshotTrace(rightValue, 'right trace');
  if (
    typeof options !== 'object' ||
    options === null ||
    !SHA256_RE.test(options.radialProjectionNonzeroEvidenceSha256)
  ) {
    fail('INVALID_INPUT', 'a radial nonzero evidence SHA-256 is required');
  }
  const leftProgram = parseProgram(left.programCanonicalJson);
  const rightProgram = parseProgram(right.programCanonicalJson);
  const normalizer = new StructuralNormalizer();
  const leftRaw = normalizeProgramBoundary(
    leftProgram,
    normalizer,
    left.side,
    left.reverseFreeParameter
  );
  const rightRaw = normalizeProgramBoundary(
    rightProgram,
    normalizer,
    right.side,
    right.reverseFreeParameter
  );
  const leftCoordinates = leftRaw.map((coordinate) =>
    simplifyCoordinateRootProjection(coordinate, normalizer)
  );
  const rightCoordinates = rightRaw.map((coordinate) =>
    simplifyCoordinateRootProjection(coordinate, normalizer)
  );
  for (let coordinate = 0; coordinate < 3; coordinate += 1) {
    if (leftCoordinates[coordinate].term !== rightCoordinates[coordinate].term) {
      fail(
        'BOUNDARY_MISMATCH',
        `boundary coordinate ${'xyz'[coordinate]} is not structurally identical ` +
          `(${leftProgram.programSha256.slice(0, 12)}:${left.side} -> ` +
          `${rightProgram.programSha256.slice(0, 12)}:${right.side})`
      );
    }
  }
  const cancellationCount = [...leftCoordinates, ...rightCoordinates].filter(
    (coordinate) => coordinate.cancellationUsed
  ).length;
  const coordinateTermSha256s = Object.freeze([
    leftCoordinates[0].term.sha256,
    leftCoordinates[1].term.sha256,
    leftCoordinates[2].term.sha256,
  ] as const);
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.validated-program-boundary-identity/evidence/v1',
    {
      coordinateTermSha256s,
      exactBoundaryImageIdentityProven: false,
      leftFreeParameterReversed: left.reverseFreeParameter,
      leftProgramSha256: leftProgram.programSha256,
      leftSide: left.side,
      proofMethodSha256: VALIDATED_PROGRAM_BOUNDARY_IDENTITY_PROOF_SHA256,
      proofVersion: VALIDATED_PROGRAM_BOUNDARY_IDENTITY_VERSION,
      radialProjectionNonzeroEvidenceSha256:
        options.radialProjectionNonzeroEvidenceSha256,
      radialProjectionNonzeroEvidenceAuthenticated: false,
      rightFreeParameterReversed: right.reverseFreeParameter,
      rightProgramSha256: rightProgram.programSha256,
      rightSide: right.side,
      rootProjectionCancellationCount: cancellationCount.toString(),
      structuralBoundaryTermsIdenticalUnderDeclaredAssumptions: true,
      totalDefinednessProven: false,
    }
  );
  return Object.freeze({
    proofVersion: VALIDATED_PROGRAM_BOUNDARY_IDENTITY_VERSION,
    proofMethodSha256: VALIDATED_PROGRAM_BOUNDARY_IDENTITY_PROOF_SHA256,
    evidenceSha256,
    leftProgramSha256: leftProgram.programSha256,
    rightProgramSha256: rightProgram.programSha256,
    leftSide: left.side,
    rightSide: right.side,
    leftFreeParameterReversed: left.reverseFreeParameter,
    rightFreeParameterReversed: right.reverseFreeParameter,
    radialProjectionNonzeroEvidenceSha256:
      options.radialProjectionNonzeroEvidenceSha256,
    radialProjectionNonzeroEvidenceAuthenticated: false,
    totalDefinednessProven: false,
    rootProjectionCancellationCount: cancellationCount,
    coordinateTermSha256s,
    structuralBoundaryTermsIdenticalUnderDeclaredAssumptions: true,
    exactBoundaryImageIdentityProven: false,
    proofScope: 'conditional-structural-ssa-alignment-not-boundary-image-proof',
  });
}
