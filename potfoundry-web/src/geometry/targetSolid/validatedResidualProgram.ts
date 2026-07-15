import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  parseCanonicalCertificationJson,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import {
  DECIMAL_INTERVAL_PROOF_SHA256,
  decimalAbsolute,
  decimalAdd,
  decimalAtan2,
  decimalCeil,
  decimalCos,
  decimalDivide,
  decimalExp,
  decimalFloor,
  decimalFract,
  decimalHull,
  decimalLn,
  decimalMaximum,
  decimalMinimum,
  decimalMultiply,
  decimalNegate,
  decimalPoint,
  decimalPi,
  decimalPow,
  decimalRoundTiesToEven,
  decimalSign,
  decimalSin,
  decimalSqrt,
  decimalSquare,
  decimalSubtract,
  decimalStep,
  decimalToOutwardFloat64,
  exactFloat64Decimal,
  type DecimalInterval,
} from './decimalInterval';
import { sha256Utf8 } from './incrementalSha256';
import {
  decimalIntegerPcg2dUnitHash,
  integerPcg2dUnitHash,
  integerPcg2dUnitHashWgslSource,
  INTEGER_PCG2D_HASH_PROOF_SHA256,
} from './integerPcg2dHash';
import {
  nextFloat64Down,
  nextFloat64Up,
  outwardAdd,
  outwardDivide,
  outwardHull,
  outwardInterval,
  outwardMultiply,
  outwardSqrt,
  outwardSquare,
  outwardSubtract,
  OUTWARD_FLOAT64_INTERVAL_PROOF_SHA256,
  type OutwardInterval,
} from './outwardFloat64Interval';
import type {
  ValidatedResidualEnclosure,
  ValidatedResidualEnclosureRequest,
} from './continuousMappedPatchDistance';

export const VALIDATED_RESIDUAL_PROGRAM_VERSION =
  'potfoundry.validated-target-program/v2' as const;
export const VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION =
  'potfoundry.validated-target-ssa-program/v3' as const;
export const VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION =
  'potfoundry.validated-target-program-compiler/v10' as const;
export const VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256 = sha256Utf8(
  [
    VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
    `decimal-interval-proof=${DECIMAL_INTERVAL_PROOF_SHA256}`,
    `integer-pcg2d-proof=${INTEGER_PCG2D_HASH_PROOF_SHA256}`,
    `outward-float64-interval-proof=${OUTWARD_FLOAT64_INTERVAL_PROOF_SHA256}`,
    'a centered mean-value screen may enclose non-affine residual cells in outward float64 intervals: residual(cell) is contained in residual(centre) plus the box interval Jacobian of target-minus-affine-artifact times the centred cell offsets',
    'the screen Jacobian is forward-mode interval differentiation of the same compiled instructions over the axis-aligned cell hull; kinked minimum/maximum/absolute nodes use the Clarke subgradient hull, which the Lebourg mean-value theorem admits',
    'screen arithmetic widens every node result by a pure relative 4*2^-52 (libm-backed nodes 8*2^-52, assuming platform libm within one unit in the last place per call), which preserves exact zeros; soundness of relative-only widening is enforced by refusing any nonzero computed bound below 1e-150 in magnitude, above which a rounded result is exactly zero only when truly zero; add/subtract results additionally keep exactness proven by an error-free round-trip check; trig ranges include every critical point conservatively located with outward pi',
    'the screen refuses (returns unavailable, never a bound) on floor, ceiling, round, fractional-part, sign, step, atan2, pcg2d nodes, non-positive sqrt/ln/power/divide domains, degenerate cell Jacobian systems, and any nonfinite value; refused cells fall back to the validated decimal enclosure',
    'program input is strict bounded canonical number-free JSON; arbitrary callbacks and closure state are impossible',
    'legacy v2 expression trees remain accepted; production v3 programs are forward-only SSA arrays with canonical string indices',
    'SSA references may address only earlier nodes, making cycles and forward references impossible; target references must address declared nodes',
    'program describes target x/y/z only; artifact-coordinate leaves and direct residual expressions are forbidden',
    'supported leaves = exact decimal constant, exact mathematical pi enclosure, and exact dyadic u/v hull',
    'supported unary ops = negate, absolute, square, sqrt, exp, ln, sin, cos, floor, ceiling, round-to-nearest-ties-even, fractional-part, sign',
    'supported binary ops = add, subtract, multiply, divide, minimum, maximum, power, step(edge,value), atan2(y,x), pcg2d-unit-x/y(cellX,cellY)',
    'PCG2D operands must be compiler-proven integer-valued by forward structural dataflow; runtime and interval evaluation additionally enforce the exact binary32 coordinate envelope',
    'target parameter triangle is conservatively enclosed by the axis-aligned hull of its three exact dyadic vertices',
    'artifact affine image is exactly enclosed by the coordinate hull of its three exact dyadic barycentric cell vertices',
    'artifact vertices may arrive as exact parsed binary32 values or canonical signed integer picometres; integer picometres are converted to exact base-10 millimetres without binary64 rounding',
    'when a target coordinate is compiler-proven affine in u/v, target-minus-artifact is affine over the shared barycentric cell and its coordinate extrema are enclosed from all three exact paired vertices',
    'affine coefficients remain outward decimal intervals, so constant-folding uncertainty is preserved rather than sampled away',
    'residual target-minus-artifact is derived inside the pinned compiler and cannot be supplied by target data',
    'every arithmetic/transcendental node uses the pinned outward decimal interval kernel',
    'invalid syntax, domain uncertainty, nonfinite conversion, resource excess, or inconsistent barycentric data refuses',
  ].join('\n')
);
export const GENERATED_TARGET_PROGRAM_BACKENDS_VERSION =
  'potfoundry.generated-target-program-backends/v7' as const;
export const GENERATED_TARGET_PROGRAM_BACKENDS_SCOPE =
  'shared-ir-cpu-f64-wgsl-f32-reference-and-validated-interval-no-device-conformance-proof' as const;
export const WGSL_TARGET_BUILTIN_SEMANTICS_REVISION =
  'W3C-CRD-WGSL-20260310' as const;
export const GENERATED_TARGET_PROGRAM_BACKENDS_PROOF_SHA256 = sha256Utf8(
  [
    GENERATED_TARGET_PROGRAM_BACKENDS_VERSION,
    `scope=${GENERATED_TARGET_PROGRAM_BACKENDS_SCOPE}`,
    `validated-compiler=${VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION}`,
    `validated-compiler-proof=${VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256}`,
    `wgsl-builtin-semantics=${WGSL_TARGET_BUILTIN_SEMANTICS_REVISION}`,
    'one strict canonical target-only program is compiled once into immutable SSA instructions',
    'CPU Float64 and deterministic Float32 reference evaluation execute those same instructions with no callbacks',
    'WGSL source is emitted from those same instructions with deterministic f32-rounded constant literals and one typed let per node',
    'validated interval residual evaluation continues to execute the same compiled instruction graph through the pinned decimal interval kernel',
    'all intermediate CPU/reference values and all generated f32 constants must remain finite or compilation/evaluation refuses',
    'round is nearest with halfway cases to even; fract is x-floor(x); step(edge,x) is one exactly when edge<=x',
    'atan2(y,x) uses the principal two-argument arctangent after canonicalizing signed-zero operands to positive mathematical zero in generated backends',
    'paired PCG2D unit lanes share one cached integer hash in CPU evaluation and one hash-scoped vec2 WGSL let binding per identical operand pair',
    'pi denotes exact mathematical pi for validated intervals; CPU uses Math.PI and WGSL uses its f32 rounding as explicitly approximate generated backends',
    'backend handles are WeakMap-authenticated and rederived from registry-held canonical program source',
    'this proves shared generated semantics and provenance, not GPU implementation conformance, transcendental correctly-rounded parity, target regularity, or artifact tolerance',
  ].join('\n')
);

export interface CompiledValidatedResidualProgram {
  readonly schemaVersion:
    | typeof VALIDATED_RESIDUAL_PROGRAM_VERSION
    | typeof VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION;
  readonly patchId: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly programSha256: string;
  readonly nodeCount: number;
}

export interface GeneratedTargetProgramBackends {
  readonly schemaVersion: typeof GENERATED_TARGET_PROGRAM_BACKENDS_VERSION;
  readonly implementationScope: typeof GENERATED_TARGET_PROGRAM_BACKENDS_SCOPE;
  readonly proofMethodSha256: string;
  readonly backendSha256: string;
  readonly backendCanonicalJson: string;
  readonly programSha256: string;
  readonly patchId: string;
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly nodeCount: number;
  readonly wgslFunctionName: string;
  readonly wgslSource: string;
  readonly wgslSourceSha256: string;
  readonly evaluateFloat64: (u: number, v: number) => readonly [number, number, number];
  readonly evaluateFloat32Reference: (
    u: number,
    v: number
  ) => readonly [number, number, number];
  readonly [generatedTargetProgramBackendsBrand]: true;
}

declare const generatedTargetProgramBackendsBrand: unique symbol;

type LeafOperation = 'constant' | 'u' | 'v' | 'pi';
type UnaryOperation =
  | 'negate'
  | 'absolute'
  | 'square'
  | 'sqrt'
  | 'exp'
  | 'ln'
  | 'sin'
  | 'cos'
  | 'floor'
  | 'ceiling'
  | 'round'
  | 'fractional-part'
  | 'sign';
type BinaryOperation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'minimum'
  | 'maximum'
  | 'power'
  | 'step'
  | 'atan2'
  | 'pcg2d-unit-x'
  | 'pcg2d-unit-y';

type Instruction =
  | Readonly<{ op: Exclude<LeafOperation, 'constant'> }>
  | Readonly<{ op: 'constant'; value: string }>
  | Readonly<{ op: UnaryOperation; arg: number }>
  | Readonly<{ op: BinaryOperation; left: number; right: number }>;

interface InternalCompiledProgram extends CompiledValidatedResidualProgram {
  readonly instructions: readonly Instruction[];
  readonly targetX: number;
  readonly targetY: number;
  readonly targetZ: number;
  readonly affineX: AffineForm | null;
  readonly affineY: AffineForm | null;
  readonly affineZ: AffineForm | null;
}

interface RegisteredGeneratedTargetProgramBackends {
  readonly binding: GeneratedTargetProgramBackends;
  readonly canonicalProgramJson: string;
}

interface AffineForm {
  readonly constant: DecimalInterval;
  readonly u: DecimalInterval;
  readonly v: DecimalInterval;
}

interface EvaluationEnvironment {
  readonly u: DecimalInterval;
  readonly v: DecimalInterval;
  readonly artifactX: DecimalInterval;
  readonly artifactY: DecimalInterval;
  readonly artifactZ: DecimalInterval;
}

const ID_RE = /^[a-z0-9](?:[a-z0-9._:/-]{0,127})$/;
const INTEGER_RE = /^(?:0|-?[1-9][0-9]*)$/;
const NODE_INDEX_RE = /^(?:0|[1-9][0-9]{0,7})$/;
export const VALIDATED_RESIDUAL_PROGRAM_MAX_NODES = 8_192;
const MAX_EXPRESSION_DEPTH = 64;
const MAX_DYADIC_BITS = 96;
const generatedTargetProgramBackendsRegistry = new WeakMap<
  object,
  RegisteredGeneratedTargetProgramBackends
>();

function refuse(message: string): never {
  throw new TypeError(`Validated residual program refused: ${message}`);
}

function record(
  value: CanonicalJsonValue,
  label: string
): { readonly [key: string]: CanonicalJsonValue } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    refuse(`${label} must be an object`);
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
    refuse(`${label} has unknown or missing fields`);
  }
}

function compileExpression(
  value: CanonicalJsonValue,
  instructions: Instruction[],
  depth: number
): number {
  if (depth > MAX_EXPRESSION_DEPTH) refuse('expression depth exceeds the compiler limit');
  if (instructions.length >= VALIDATED_RESIDUAL_PROGRAM_MAX_NODES) {
    refuse('expression node count exceeds the compiler limit');
  }
  const expression = record(value, 'expression');
  const operation = expression.op;
  if (typeof operation !== 'string') refuse('expression op must be a string');

  if (operation === 'constant') {
    exactKeys(expression, ['op', 'value'], 'constant expression');
    if (typeof expression.value !== 'string') refuse('constant value must be an exact decimal string');
    try {
      decimalPoint(expression.value);
    } catch (error) {
      refuse(
        error instanceof Error
          ? `constant value refused: ${error.message}`
          : 'constant value must be a bounded finite decimal literal'
      );
    }
    instructions.push(Object.freeze({ op: operation, value: expression.value }));
    return instructions.length - 1;
  }
  if (
    operation === 'u' ||
    operation === 'v' ||
    operation === 'pi'
  ) {
    exactKeys(expression, ['op'], `${operation} expression`);
    instructions.push(Object.freeze({ op: operation }));
    return instructions.length - 1;
  }
  if (
    operation === 'negate' ||
    operation === 'absolute' ||
    operation === 'square' ||
    operation === 'sqrt' ||
    operation === 'exp' ||
    operation === 'ln' ||
    operation === 'sin' ||
    operation === 'cos' ||
    operation === 'floor' ||
    operation === 'ceiling' ||
    operation === 'round' ||
    operation === 'fractional-part' ||
    operation === 'sign'
  ) {
    exactKeys(expression, ['arg', 'op'], `${operation} expression`);
    const arg = compileExpression(expression.arg, instructions, depth + 1);
    instructions.push(Object.freeze({ op: operation, arg }));
    return instructions.length - 1;
  }
  if (
    operation === 'add' ||
    operation === 'subtract' ||
    operation === 'multiply' ||
    operation === 'divide' ||
    operation === 'minimum' ||
    operation === 'maximum' ||
    operation === 'power' ||
    operation === 'step' ||
    operation === 'atan2' ||
    operation === 'pcg2d-unit-x' ||
    operation === 'pcg2d-unit-y'
  ) {
    exactKeys(expression, ['left', 'op', 'right'], `${operation} expression`);
    const left = compileExpression(expression.left, instructions, depth + 1);
    const right = compileExpression(expression.right, instructions, depth + 1);
    instructions.push(Object.freeze({ op: operation, left, right }));
    return instructions.length - 1;
  }
  refuse(`unsupported expression op '${operation}'`);
}

function ssaNodeIndex(value: CanonicalJsonValue, exclusiveUpper: number, label: string): number {
  if (typeof value !== 'string' || !NODE_INDEX_RE.test(value)) {
    refuse(`${label} must be a canonical nonnegative node-index string`);
  }
  const index = Number(value);
  if (!Number.isSafeInteger(index) || index < 0 || index >= exclusiveUpper) {
    refuse(`${label} must reference an earlier declared node`);
  }
  return index;
}

function compileSsaNode(value: CanonicalJsonValue, nodeIndex: number): Instruction {
  const node = record(value, `SSA node ${nodeIndex}`);
  const operation = node.op;
  if (typeof operation !== 'string') refuse(`SSA node ${nodeIndex} op must be a string`);
  if (operation === 'constant') {
    exactKeys(node, ['op', 'value'], `SSA constant node ${nodeIndex}`);
    if (typeof node.value !== 'string') refuse('SSA constant value must be an exact decimal string');
    try {
      decimalPoint(node.value);
    } catch (error) {
      refuse(
        error instanceof Error
          ? `SSA constant value refused: ${error.message}`
          : 'SSA constant value must be a bounded finite decimal literal'
      );
    }
    return Object.freeze({ op: operation, value: node.value });
  }
  if (operation === 'u' || operation === 'v' || operation === 'pi') {
    exactKeys(node, ['op'], `SSA ${operation} node ${nodeIndex}`);
    return Object.freeze({ op: operation });
  }
  if (
    operation === 'negate' ||
    operation === 'absolute' ||
    operation === 'square' ||
    operation === 'sqrt' ||
    operation === 'exp' ||
    operation === 'ln' ||
    operation === 'sin' ||
    operation === 'cos' ||
    operation === 'floor' ||
    operation === 'ceiling' ||
    operation === 'round' ||
    operation === 'fractional-part' ||
    operation === 'sign'
  ) {
    exactKeys(node, ['arg', 'op'], `SSA ${operation} node ${nodeIndex}`);
    return Object.freeze({
      op: operation,
      arg: ssaNodeIndex(node.arg, nodeIndex, `SSA node ${nodeIndex} arg`),
    });
  }
  if (
    operation === 'add' ||
    operation === 'subtract' ||
    operation === 'multiply' ||
    operation === 'divide' ||
    operation === 'minimum' ||
    operation === 'maximum' ||
    operation === 'power' ||
    operation === 'step' ||
    operation === 'atan2' ||
    operation === 'pcg2d-unit-x' ||
    operation === 'pcg2d-unit-y'
  ) {
    exactKeys(node, ['left', 'op', 'right'], `SSA ${operation} node ${nodeIndex}`);
    return Object.freeze({
      op: operation,
      left: ssaNodeIndex(node.left, nodeIndex, `SSA node ${nodeIndex} left`),
      right: ssaNodeIndex(node.right, nodeIndex, `SSA node ${nodeIndex} right`),
    });
  }
  refuse(`unsupported SSA node op '${operation}'`);
}

function identityField(root: { readonly [key: string]: CanonicalJsonValue }, key: string): string {
  const value = root[key];
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    refuse('patch/evaluator identity is invalid');
  }
  return value;
}

function constantIsInteger(value: string): boolean {
  const point = decimalPoint(value);
  const difference = decimalSubtract(point, decimalFloor(point));
  return difference.lower === '0' && difference.upper === '0';
}

function validateIntegerHashOperands(instructions: readonly Instruction[]): void {
  const integerValued: boolean[] = [];
  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    let isInteger = false;
    switch (instruction.op) {
      case 'constant':
        isInteger = constantIsInteger(instruction.value);
        break;
      case 'floor':
      case 'ceiling':
      case 'round':
      case 'sign':
      case 'step':
        isInteger = true;
        break;
      case 'negate':
      case 'absolute':
      case 'square':
        isInteger = integerValued[instruction.arg];
        break;
      case 'fractional-part':
        isInteger = integerValued[instruction.arg];
        break;
      case 'add':
      case 'subtract':
      case 'multiply':
      case 'minimum':
      case 'maximum':
        isInteger =
          integerValued[instruction.left] && integerValued[instruction.right];
        break;
      case 'pcg2d-unit-x':
      case 'pcg2d-unit-y':
        if (
          !integerValued[instruction.left] ||
          !integerValued[instruction.right]
        ) {
          refuse(`SSA node ${index} PCG2D operands are not structurally integer-valued`);
        }
        break;
      default:
        break;
    }
    integerValued.push(isInteger);
  }
}

function compileProgram(canonicalProgramJson: unknown): InternalCompiledProgram {
  const parsed = parseCanonicalCertificationJson(canonicalProgramJson);
  if (!parsed.ok) refuse(parsed.reason);
  const root = record(parsed.value, 'program');
  if (
    root.schemaVersion !== VALIDATED_RESIDUAL_PROGRAM_VERSION &&
    root.schemaVersion !== VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION
  ) {
    refuse('schemaVersion is unsupported');
  }
  const patchId = identityField(root, 'patchId');
  const evaluatorId = identityField(root, 'evaluatorId');
  const evaluatorVersion = identityField(root, 'evaluatorVersion');
  const target = record(root.target, 'target');
  exactKeys(target, ['x', 'y', 'z'], 'target');
  let instructions: Instruction[];
  let targetX: number;
  let targetY: number;
  let targetZ: number;
  let hashDomain: string;
  if (root.schemaVersion === VALIDATED_RESIDUAL_PROGRAM_VERSION) {
    exactKeys(
      root,
      ['evaluatorId', 'evaluatorVersion', 'patchId', 'schemaVersion', 'target'],
      'legacy expression-tree program'
    );
    instructions = [];
    targetX = compileExpression(target.x, instructions, 0);
    targetY = compileExpression(target.y, instructions, 0);
    targetZ = compileExpression(target.z, instructions, 0);
    hashDomain = 'potfoundry.validated-target-program/definition/v2';
  } else {
    exactKeys(
      root,
      ['evaluatorId', 'evaluatorVersion', 'nodes', 'patchId', 'schemaVersion', 'target'],
      'SSA program'
    );
    if (!Array.isArray(root.nodes) || root.nodes.length === 0) {
      refuse('SSA nodes must be a nonempty array');
    }
    if (root.nodes.length > VALIDATED_RESIDUAL_PROGRAM_MAX_NODES) {
      refuse('SSA node count exceeds the compiler limit');
    }
    instructions = root.nodes.map((node, index) => compileSsaNode(node, index));
    targetX = ssaNodeIndex(target.x, instructions.length, 'target x');
    targetY = ssaNodeIndex(target.y, instructions.length, 'target y');
    targetZ = ssaNodeIndex(target.z, instructions.length, 'target z');
    hashDomain = 'potfoundry.validated-target-ssa-program/definition/v3';
  }
  const programSha256 = domainSeparatedCanonicalJsonSha256(
    hashDomain,
    parsed.value
  );
  validateIntegerHashOperands(instructions);
  const affineForms = deriveAffineForms(instructions);
  return Object.freeze({
    schemaVersion: VALIDATED_RESIDUAL_PROGRAM_VERSION,
    patchId,
    evaluatorId,
    evaluatorVersion,
    programSha256,
    nodeCount: instructions.length,
    instructions: Object.freeze(instructions),
    targetX,
    targetY,
    targetZ,
    affineX: affineForms[targetX],
    affineY: affineForms[targetY],
    affineZ: affineForms[targetZ],
  });
}

export function computeValidatedResidualProgramSha256(
  canonicalProgramJson: unknown
): string {
  return compileProgram(canonicalProgramJson).programSha256;
}

export function compileValidatedResidualProgram(
  canonicalProgramJson: unknown
): CompiledValidatedResidualProgram {
  return compileProgram(canonicalProgramJson);
}

function generatedBackendRefuse(message: string): never {
  throw new TypeError(`Generated target program backends refused: ${message}`);
}

function unitCoordinate(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    generatedBackendRefuse(`${label} must be finite and inside the closed unit interval`);
  }
  return value === 0 ? 0 : value;
}

function numericInstructionValue(
  instruction: Instruction,
  values: readonly number[],
  u: number,
  v: number,
  pcg2dCache: Map<string, readonly [number, number]>
): number {
  switch (instruction.op) {
    case 'constant': return Number(instruction.value);
    case 'u': return u;
    case 'v': return v;
    case 'pi': return Math.PI;
    case 'negate': return -values[instruction.arg];
    case 'absolute': return Math.abs(values[instruction.arg]);
    case 'square': return values[instruction.arg] * values[instruction.arg];
    case 'sqrt': return Math.sqrt(values[instruction.arg]);
    case 'exp': return Math.exp(values[instruction.arg]);
    case 'ln': return Math.log(values[instruction.arg]);
    case 'sin': return Math.sin(values[instruction.arg]);
    case 'cos': return Math.cos(values[instruction.arg]);
    case 'floor': return Math.floor(values[instruction.arg]);
    case 'ceiling': return Math.ceil(values[instruction.arg]);
    case 'round': return roundTiesToEven(values[instruction.arg]);
    case 'fractional-part': return values[instruction.arg] - Math.floor(values[instruction.arg]);
    case 'sign': return Math.sign(values[instruction.arg]);
    case 'add': return values[instruction.left] + values[instruction.right];
    case 'subtract': return values[instruction.left] - values[instruction.right];
    case 'multiply': return values[instruction.left] * values[instruction.right];
    case 'divide': return values[instruction.left] / values[instruction.right];
    case 'minimum': return Math.min(values[instruction.left], values[instruction.right]);
    case 'maximum': return Math.max(values[instruction.left], values[instruction.right]);
    case 'power': return Math.pow(values[instruction.left], values[instruction.right]);
    case 'step': return values[instruction.left] <= values[instruction.right] ? 1 : 0;
    case 'atan2': return Math.atan2(values[instruction.left], values[instruction.right]);
    case 'pcg2d-unit-x':
    case 'pcg2d-unit-y': {
      const key = `${instruction.left}:${instruction.right}`;
      let pair = pcg2dCache.get(key);
      if (pair === undefined) {
        pair = integerPcg2dUnitHash(
          values[instruction.left],
          values[instruction.right]
        );
        pcg2dCache.set(key, pair);
      }
      return pair[instruction.op === 'pcg2d-unit-x' ? 0 : 1];
    }
  }
}

function roundTiesToEven(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) >= 2 ** 52) return value;
  const below = Math.floor(value);
  const fraction = value - below;
  if (fraction < 0.5) return below;
  if (fraction > 0.5) return below + 1;
  return below % 2 === 0 ? below : below + 1;
}

function evaluateGeneratedTargetPoint(
  program: InternalCompiledProgram,
  rawU: number,
  rawV: number,
  float32: boolean
): readonly [number, number, number] {
  const inputU = unitCoordinate(rawU, 'u');
  const inputV = unitCoordinate(rawV, 'v');
  const u = float32 ? Math.fround(inputU) : inputU;
  const v = float32 ? Math.fround(inputV) : inputV;
  const values: number[] = [];
  const pcg2dCache = new Map<string, readonly [number, number]>();
  for (let index = 0; index < program.instructions.length; index += 1) {
    const unrounded = numericInstructionValue(
      program.instructions[index],
      values,
      u,
      v,
      pcg2dCache
    );
    const value = float32 ? Math.fround(unrounded) : unrounded;
    if (!Number.isFinite(value)) {
      generatedBackendRefuse(`node ${index} produced a non-finite ${float32 ? 'f32' : 'f64'} value`);
    }
    values.push(value === 0 ? 0 : value);
  }
  return Object.freeze([
    values[program.targetX],
    values[program.targetY],
    values[program.targetZ],
  ]) as readonly [number, number, number];
}

function wgslFloat32Literal(decimal: string): string {
  const value = Math.fround(Number(decimal));
  if (!Number.isFinite(value)) {
    generatedBackendRefuse('a constant is outside the finite f32 WGSL envelope');
  }
  if (Object.is(value, -0)) return '-0.0';
  const text = value.toString();
  return /^[+-]?[0-9]+$/.test(text) ? `${text}.0` : text;
}

function wgslInstructionExpression(instruction: Instruction): string {
  const node = (index: number): string => `n${index}`;
  switch (instruction.op) {
    case 'constant': return wgslFloat32Literal(instruction.value);
    case 'u': return 'u';
    case 'v': return 'v';
    case 'pi': return wgslFloat32Literal(exactFloat64Decimal(Math.PI));
    case 'negate': return `-${node(instruction.arg)}`;
    case 'absolute': return `abs(${node(instruction.arg)})`;
    case 'square': return `(${node(instruction.arg)} * ${node(instruction.arg)})`;
    case 'sqrt': return `sqrt(${node(instruction.arg)})`;
    case 'exp': return `exp(${node(instruction.arg)})`;
    case 'ln': return `log(${node(instruction.arg)})`;
    case 'sin': return `sin(${node(instruction.arg)})`;
    case 'cos': return `cos(${node(instruction.arg)})`;
    case 'floor': return `floor(${node(instruction.arg)})`;
    case 'ceiling': return `ceil(${node(instruction.arg)})`;
    case 'round': return `round(${node(instruction.arg)})`;
    case 'fractional-part': return `fract(${node(instruction.arg)})`;
    case 'sign': return `sign(${node(instruction.arg)})`;
    case 'add': return `(${node(instruction.left)} + ${node(instruction.right)})`;
    case 'subtract': return `(${node(instruction.left)} - ${node(instruction.right)})`;
    case 'multiply': return `(${node(instruction.left)} * ${node(instruction.right)})`;
    case 'divide': return `(${node(instruction.left)} / ${node(instruction.right)})`;
    case 'minimum': return `min(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'maximum': return `max(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'power': return `pow(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'step': return `step(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'atan2': return `atan2(select(${node(instruction.left)}, 0.0, ${node(instruction.left)} == 0.0), select(${node(instruction.right)}, 0.0, ${node(instruction.right)} == 0.0))`;
    case 'pcg2d-unit-x':
    case 'pcg2d-unit-y':
      generatedBackendRefuse('PCG2D instructions require paired WGSL emission');
  }
}

function generatedWgslSource(program: InternalCompiledProgram): {
  readonly functionName: string;
  readonly source: string;
} {
  const functionName = `pf_target_${program.programSha256.slice(0, 16)}`;
  const usesPcg2d = program.instructions.some(
    (instruction) =>
      instruction.op === 'pcg2d-unit-x' || instruction.op === 'pcg2d-unit-y'
  );
  const pcg2dFunctionName = `pf_pcg2d_${program.programSha256.slice(0, 16)}`;
  const lines = usesPcg2d
    ? [integerPcg2dUnitHashWgslSource(pcg2dFunctionName).trimEnd(), '', `fn ${functionName}(u: f32, v: f32) -> vec3<f32> {`]
    : [`fn ${functionName}(u: f32, v: f32) -> vec3<f32> {`];
  const pcg2dBindings = new Map<string, string>();
  for (let index = 0; index < program.instructions.length; index += 1) {
    const instruction = program.instructions[index];
    if (instruction.op === 'pcg2d-unit-x' || instruction.op === 'pcg2d-unit-y') {
      const key = `${instruction.left}:${instruction.right}`;
      let binding = pcg2dBindings.get(key);
      if (binding === undefined) {
        binding = `h${index}`;
        pcg2dBindings.set(key, binding);
        lines.push(
          `  let ${binding}: vec2<f32> = ${pcg2dFunctionName}(n${instruction.left}, n${instruction.right});`
        );
      }
      lines.push(
        `  let n${index}: f32 = ${binding}.${instruction.op === 'pcg2d-unit-x' ? 'x' : 'y'};`
      );
      continue;
    }
    lines.push(
      `  let n${index}: f32 = ${wgslInstructionExpression(instruction)};`
    );
  }
  lines.push(
    `  return vec3<f32>(n${program.targetX}, n${program.targetY}, n${program.targetZ});`,
    '}'
  );
  return Object.freeze({ functionName, source: `${lines.join('\n')}\n` });
}

function deriveGeneratedTargetProgramBackends(
  canonicalProgramJson: string
): GeneratedTargetProgramBackends {
  const program = compileProgram(canonicalProgramJson);
  const wgsl = generatedWgslSource(program);
  const wgslSourceSha256 = sha256Utf8(wgsl.source);
  const bindingValue = {
    evaluatorId: program.evaluatorId,
    evaluatorVersion: program.evaluatorVersion,
    implementationScope: GENERATED_TARGET_PROGRAM_BACKENDS_SCOPE,
    nodeCount: program.nodeCount.toString(),
    patchId: program.patchId,
    programSha256: program.programSha256,
    proofMethodSha256: GENERATED_TARGET_PROGRAM_BACKENDS_PROOF_SHA256,
    schemaVersion: GENERATED_TARGET_PROGRAM_BACKENDS_VERSION,
    validatedCompilerProofSha256: VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256,
    validatedCompilerVersion: VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
    wgslFunctionName: wgsl.functionName,
    wgslSourceSha256,
  } satisfies CanonicalJsonValue;
  const backendCanonicalJson = canonicalizeCertificationJson(bindingValue);
  const backendSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.generated-target-program-backends/binding/v6',
    bindingValue
  );
  const evaluateFloat64 = Object.freeze(
    (u: number, v: number): readonly [number, number, number] =>
      evaluateGeneratedTargetPoint(program, u, v, false)
  );
  const evaluateFloat32Reference = Object.freeze(
    (u: number, v: number): readonly [number, number, number] =>
      evaluateGeneratedTargetPoint(program, u, v, true)
  );
  return Object.freeze({
    schemaVersion: GENERATED_TARGET_PROGRAM_BACKENDS_VERSION,
    implementationScope: GENERATED_TARGET_PROGRAM_BACKENDS_SCOPE,
    proofMethodSha256: GENERATED_TARGET_PROGRAM_BACKENDS_PROOF_SHA256,
    backendSha256,
    backendCanonicalJson,
    programSha256: program.programSha256,
    patchId: program.patchId,
    evaluatorId: program.evaluatorId,
    evaluatorVersion: program.evaluatorVersion,
    nodeCount: program.nodeCount,
    wgslFunctionName: wgsl.functionName,
    wgslSource: wgsl.source,
    wgslSourceSha256,
    evaluateFloat64,
    evaluateFloat32Reference,
  }) as GeneratedTargetProgramBackends;
}

/** Generate CPU Float64, deterministic Float32-reference, and WGSL from one target IR. */
export function compileGeneratedTargetProgramBackends(
  canonicalProgramJson: string
): GeneratedTargetProgramBackends {
  const binding = deriveGeneratedTargetProgramBackends(canonicalProgramJson);
  generatedTargetProgramBackendsRegistry.set(
    binding,
    Object.freeze({ binding, canonicalProgramJson })
  );
  return binding;
}

/** Internal generated-backend proof boundary; structural copies refuse. */
export function generatedTargetProgramBackendsForProof(
  value: GeneratedTargetProgramBackends
): GeneratedTargetProgramBackends {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    generatedBackendRefuse('backend handle is not an authenticated capability');
  }
  const registered = generatedTargetProgramBackendsRegistry.get(value);
  if (registered === undefined || registered.binding !== value) {
    generatedBackendRefuse('backend handle is not an authenticated capability');
  }
  const derived = deriveGeneratedTargetProgramBackends(registered.canonicalProgramJson);
  const binding = registered.binding;
  if (
    binding.schemaVersion !== derived.schemaVersion ||
    binding.implementationScope !== derived.implementationScope ||
    binding.proofMethodSha256 !== derived.proofMethodSha256 ||
    binding.backendSha256 !== derived.backendSha256 ||
    binding.backendCanonicalJson !== derived.backendCanonicalJson ||
    binding.programSha256 !== derived.programSha256 ||
    binding.patchId !== derived.patchId ||
    binding.evaluatorId !== derived.evaluatorId ||
    binding.evaluatorVersion !== derived.evaluatorVersion ||
    binding.nodeCount !== derived.nodeCount ||
    binding.wgslFunctionName !== derived.wgslFunctionName ||
    binding.wgslSource !== derived.wgslSource ||
    binding.wgslSourceSha256 !== derived.wgslSourceSha256
  ) {
    generatedBackendRefuse('backend capability fields are inconsistent');
  }
  return binding;
}

function exactDyadicDecimal(numerator: bigint, fractionBits: number): string {
  if (!Number.isSafeInteger(fractionBits) || fractionBits < 0 || fractionBits > MAX_DYADIC_BITS) {
    refuse('dyadic fraction bits exceed the evaluator envelope');
  }
  if (numerator === 0n) return '0';
  if (fractionBits === 0) return numerator.toString();
  const negative = numerator < 0n;
  const scaled = (negative ? -numerator : numerator) * 5n ** BigInt(fractionBits);
  const digits = scaled.toString().padStart(fractionBits + 1, '0');
  const split = digits.length - fractionBits;
  const magnitude = `${digits.slice(0, split)}.${digits.slice(split)}`
    .replace(/0+$/, '')
    .replace(/\.$/, '');
  return `${negative ? '-' : ''}${magnitude}`;
}

function parseInteger(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || value.length > 64 || !INTEGER_RE.test(value)) {
    refuse(`${label} must be a bounded canonical integer string`);
  }
  return BigInt(value);
}

function exactPicometresToMillimetresDecimal(value: unknown, label: string): string {
  const picometres = parseInteger(value, label);
  if (picometres === 0n) return '0';
  const negative = picometres < 0n;
  const digits = (negative ? -picometres : picometres).toString().padStart(10, '0');
  const split = digits.length - 9;
  const fractional = digits.slice(split).replace(/0+$/, '');
  const magnitude = fractional.length === 0
    ? digits.slice(0, split)
    : `${digits.slice(0, split)}.${fractional}`;
  return `${negative ? '-' : ''}${magnitude}`;
}

function artifactCoordinate(
  request: ValidatedResidualEnclosureRequest,
  artifactVertex: number,
  coordinate: 0 | 1 | 2
): DecimalInterval {
  const exactPicometres = request.artifactTriangleVerticesPm;
  if (exactPicometres !== undefined) {
    if (!Array.isArray(exactPicometres) || exactPicometres.length !== 3) {
      refuse('artifactTriangleVerticesPm must contain exactly three vertices');
    }
    const vertex = exactPicometres[artifactVertex];
    if (!Array.isArray(vertex) || vertex.length !== 3) {
      refuse(`artifactTriangleVerticesPm[${artifactVertex}] must contain three coordinates`);
    }
    return decimalPoint(
      exactPicometresToMillimetresDecimal(
        vertex[coordinate],
        `artifact picometre vertex ${artifactVertex} coordinate ${coordinate}`
      )
    );
  }
  const vertex = request.artifactTriangleVerticesMm[artifactVertex];
  if (!Array.isArray(vertex) || vertex.length !== 3) {
    refuse(`artifactTriangleVerticesMm[${artifactVertex}] must contain three coordinates`);
  }
  const value = vertex[coordinate];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    refuse(`artifact millimetre vertex ${artifactVertex} coordinate ${coordinate} is not finite`);
  }
  return decimalPoint(exactFloat64Decimal(value));
}

function coordinateHull(
  request: ValidatedResidualEnclosureRequest,
  coordinate: 'uNumerator' | 'vNumerator'
): DecimalInterval {
  let result: DecimalInterval | undefined;
  for (let index = 0; index < 3; index += 1) {
    const value = decimalPoint(
      exactDyadicDecimal(
        parseInteger(request.cell.vertices[index][coordinate], `cell vertex ${coordinate}`),
        request.cell.fractionBits
      )
    );
    result = result === undefined ? value : decimalHull(result, value);
  }
  if (result === undefined) refuse('cell has no vertices');
  return result;
}

function coordinatePoint(
  request: ValidatedResidualEnclosureRequest,
  cellVertex: number,
  coordinate: 'uNumerator' | 'vNumerator'
): DecimalInterval {
  return decimalPoint(
    exactDyadicDecimal(
      parseInteger(request.cell.vertices[cellVertex][coordinate], `cell vertex ${coordinate}`),
      request.cell.fractionBits
    )
  );
}

function affineArtifactPoint(
  request: ValidatedResidualEnclosureRequest,
  coordinate: 0 | 1 | 2,
  cellVertex: number
): DecimalInterval {
  const fractionBits = request.cell.barycentricFractionBits;
  if (!Number.isSafeInteger(fractionBits) || fractionBits < 0 || fractionBits > 30) {
    refuse('barycentric fraction bits are invalid');
  }
  const denominator = 1n << BigInt(fractionBits);
  const weights = request.cell.barycentricVertices[cellVertex];
  const numerators = [
    parseInteger(weights.aNumerator, 'barycentric a'),
    parseInteger(weights.bNumerator, 'barycentric b'),
    parseInteger(weights.cNumerator, 'barycentric c'),
  ] as const;
  if (
    numerators.some((value) => value < 0n) ||
    numerators[0] + numerators[1] + numerators[2] !== denominator
  ) {
    refuse('barycentric weights are not a nonnegative exact partition of one');
  }
  let point = decimalPoint('0');
  for (let artifactVertex = 0; artifactVertex < 3; artifactVertex += 1) {
    const weight = decimalPoint(exactDyadicDecimal(numerators[artifactVertex], fractionBits));
    const coordinateValue = artifactCoordinate(request, artifactVertex, coordinate);
    point = decimalAdd(point, decimalMultiply(weight, coordinateValue));
  }
  return point;
}

function affineArtifactHull(
  request: ValidatedResidualEnclosureRequest,
  coordinate: 0 | 1 | 2
): DecimalInterval {
  let hull: DecimalInterval | undefined;
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    const point = affineArtifactPoint(request, coordinate, cellVertex);
    hull = hull === undefined ? point : decimalHull(hull, point);
  }
  if (hull === undefined) refuse('artifact cell has no vertices');
  return hull;
}

function zeroInterval(): DecimalInterval {
  return decimalPoint('0');
}

function isConstantAffine(form: AffineForm): boolean {
  return form.u.lower === '0' && form.u.upper === '0' && form.v.lower === '0' && form.v.upper === '0';
}

function affineConstant(value: DecimalInterval): AffineForm {
  return Object.freeze({ constant: value, u: zeroInterval(), v: zeroInterval() });
}

function affineAdd(left: AffineForm, right: AffineForm): AffineForm {
  return Object.freeze({
    constant: decimalAdd(left.constant, right.constant),
    u: decimalAdd(left.u, right.u),
    v: decimalAdd(left.v, right.v),
  });
}

function affineNegate(value: AffineForm): AffineForm {
  return Object.freeze({
    constant: decimalNegate(value.constant),
    u: decimalNegate(value.u),
    v: decimalNegate(value.v),
  });
}

function affineScale(value: AffineForm, scalar: DecimalInterval): AffineForm {
  return Object.freeze({
    constant: decimalMultiply(value.constant, scalar),
    u: decimalMultiply(value.u, scalar),
    v: decimalMultiply(value.v, scalar),
  });
}

function evaluateConstantInstruction(
  instruction: Instruction,
  values: readonly DecimalInterval[]
): DecimalInterval | null {
  switch (instruction.op) {
    case 'constant': return decimalPoint(instruction.value);
    case 'pi': return decimalPi();
    case 'negate': return decimalNegate(values[instruction.arg]);
    case 'absolute': return decimalAbsolute(values[instruction.arg]);
    case 'square': return decimalSquare(values[instruction.arg]);
    case 'sqrt': return decimalSqrt(values[instruction.arg]);
    case 'exp': return decimalExp(values[instruction.arg]);
    case 'ln': return decimalLn(values[instruction.arg]);
    case 'sin': return decimalSin(values[instruction.arg]);
    case 'cos': return decimalCos(values[instruction.arg]);
    case 'floor': return decimalFloor(values[instruction.arg]);
    case 'ceiling': return decimalCeil(values[instruction.arg]);
    case 'round': return decimalRoundTiesToEven(values[instruction.arg]);
    case 'fractional-part': return decimalFract(values[instruction.arg]);
    case 'sign': return decimalSign(values[instruction.arg]);
    case 'add': return decimalAdd(values[instruction.left], values[instruction.right]);
    case 'subtract': return decimalSubtract(values[instruction.left], values[instruction.right]);
    case 'multiply': return decimalMultiply(values[instruction.left], values[instruction.right]);
    case 'divide': return decimalDivide(values[instruction.left], values[instruction.right]);
    case 'minimum': return decimalMinimum(values[instruction.left], values[instruction.right]);
    case 'maximum': return decimalMaximum(values[instruction.left], values[instruction.right]);
    case 'power': return decimalPow(values[instruction.left], values[instruction.right]);
    case 'step': return decimalStep(values[instruction.left], values[instruction.right]);
    case 'atan2': return decimalAtan2(values[instruction.left], values[instruction.right]);
    case 'pcg2d-unit-x':
    case 'pcg2d-unit-y': {
      const pair = decimalIntegerPcg2dUnitHash(
        values[instruction.left],
        values[instruction.right]
      );
      return pair[instruction.op === 'pcg2d-unit-x' ? 0 : 1];
    }
    case 'u':
    case 'v':
      return null;
  }
}

function deriveAffineForms(instructions: readonly Instruction[]): readonly (AffineForm | null)[] {
  const forms: Array<AffineForm | null> = [];
  for (const instruction of instructions) {
    if (instruction.op === 'constant') {
      forms.push(affineConstant(decimalPoint(instruction.value)));
      continue;
    }
    if (instruction.op === 'u') {
      forms.push(Object.freeze({ constant: zeroInterval(), u: decimalPoint('1'), v: zeroInterval() }));
      continue;
    }
    if (instruction.op === 'v') {
      forms.push(Object.freeze({ constant: zeroInterval(), u: zeroInterval(), v: decimalPoint('1') }));
      continue;
    }
    if (instruction.op === 'pi') {
      forms.push(affineConstant(decimalPi()));
      continue;
    }
    if (instruction.op === 'negate') {
      const arg = forms[instruction.arg];
      forms.push(arg === null ? null : affineNegate(arg));
      continue;
    }
    if (instruction.op === 'add' || instruction.op === 'subtract') {
      const left = forms[instruction.left];
      const right = forms[instruction.right];
      forms.push(
        left === null || right === null
          ? null
          : instruction.op === 'add'
            ? affineAdd(left, right)
            : affineAdd(left, affineNegate(right))
      );
      continue;
    }
    if (instruction.op === 'multiply' || instruction.op === 'divide') {
      const left = forms[instruction.left];
      const right = forms[instruction.right];
      if (left === null || right === null) {
        forms.push(null);
      } else if (instruction.op === 'multiply' && isConstantAffine(left)) {
        forms.push(affineScale(right, left.constant));
      } else if (isConstantAffine(right)) {
        forms.push(
          instruction.op === 'multiply'
            ? affineScale(left, right.constant)
            : affineScale(left, decimalDivide(decimalPoint('1'), right.constant))
        );
      } else {
        forms.push(null);
      }
      continue;
    }

    const argumentIndices = 'arg' in instruction
      ? [instruction.arg]
      : 'left' in instruction
        ? [instruction.left, instruction.right]
        : [];
    const argumentForms = argumentIndices.map((index) => forms[index]);
    if (argumentForms.some((form) => form === null || !isConstantAffine(form))) {
      forms.push(null);
      continue;
    }
    const constantValues = forms.map((form) => form?.constant ?? zeroInterval());
    const value = evaluateConstantInstruction(instruction, constantValues);
    forms.push(value === null ? null : affineConstant(value));
  }
  return Object.freeze(forms);
}

function evaluateAffineAt(
  form: AffineForm,
  u: DecimalInterval,
  v: DecimalInterval
): DecimalInterval {
  return decimalAdd(
    form.constant,
    decimalAdd(decimalMultiply(form.u, u), decimalMultiply(form.v, v))
  );
}

function affineResidualHull(
  form: AffineForm,
  request: ValidatedResidualEnclosureRequest,
  coordinate: 0 | 1 | 2
): DecimalInterval {
  let hull: DecimalInterval | undefined;
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    const target = evaluateAffineAt(
      form,
      coordinatePoint(request, cellVertex, 'uNumerator'),
      coordinatePoint(request, cellVertex, 'vNumerator')
    );
    const residual = decimalSubtract(
      target,
      affineArtifactPoint(request, coordinate, cellVertex)
    );
    hull = hull === undefined ? residual : decimalHull(hull, residual);
  }
  if (hull === undefined) refuse('affine residual cell has no vertices');
  return hull;
}

function evaluateInstruction(
  instruction: Instruction,
  values: readonly DecimalInterval[],
  environment: EvaluationEnvironment,
  pcg2dCache: Map<string, readonly [DecimalInterval, DecimalInterval]>
): DecimalInterval {
  switch (instruction.op) {
    case 'constant': return decimalPoint(instruction.value);
    case 'pi': return decimalPi();
    case 'u': return environment.u;
    case 'v': return environment.v;
    case 'negate': return decimalNegate(values[instruction.arg]);
    case 'absolute': return decimalAbsolute(values[instruction.arg]);
    case 'square': return decimalSquare(values[instruction.arg]);
    case 'sqrt': return decimalSqrt(values[instruction.arg]);
    case 'exp': return decimalExp(values[instruction.arg]);
    case 'ln': return decimalLn(values[instruction.arg]);
    case 'sin': return decimalSin(values[instruction.arg]);
    case 'cos': return decimalCos(values[instruction.arg]);
    case 'floor': return decimalFloor(values[instruction.arg]);
    case 'ceiling': return decimalCeil(values[instruction.arg]);
    case 'round': return decimalRoundTiesToEven(values[instruction.arg]);
    case 'fractional-part': return decimalFract(values[instruction.arg]);
    case 'sign': return decimalSign(values[instruction.arg]);
    case 'add': return decimalAdd(values[instruction.left], values[instruction.right]);
    case 'subtract': return decimalSubtract(values[instruction.left], values[instruction.right]);
    case 'multiply': return decimalMultiply(values[instruction.left], values[instruction.right]);
    case 'divide': return decimalDivide(values[instruction.left], values[instruction.right]);
    case 'minimum': return decimalMinimum(values[instruction.left], values[instruction.right]);
    case 'maximum': return decimalMaximum(values[instruction.left], values[instruction.right]);
    case 'power': return decimalPow(values[instruction.left], values[instruction.right]);
    case 'step': return decimalStep(values[instruction.left], values[instruction.right]);
    case 'atan2': return decimalAtan2(values[instruction.left], values[instruction.right]);
    case 'pcg2d-unit-x':
    case 'pcg2d-unit-y': {
      const key = `${instruction.left}:${instruction.right}`;
      let pair = pcg2dCache.get(key);
      if (pair === undefined) {
        pair = decimalIntegerPcg2dUnitHash(
          values[instruction.left],
          values[instruction.right]
        );
        pcg2dCache.set(key, pair);
      }
      return pair[instruction.op === 'pcg2d-unit-x' ? 0 : 1];
    }
  }
}

export function evaluateCompiledValidatedResidualProgram(
  compiled: CompiledValidatedResidualProgram,
  request: ValidatedResidualEnclosureRequest
): ValidatedResidualEnclosure {
  const internal = compiled as InternalCompiledProgram;
  if (!Array.isArray(internal.instructions)) refuse('compiled program is not executable');
  const environment: EvaluationEnvironment = {
    u: coordinateHull(request, 'uNumerator'),
    v: coordinateHull(request, 'vNumerator'),
    artifactX: affineArtifactHull(request, 0),
    artifactY: affineArtifactHull(request, 1),
    artifactZ: affineArtifactHull(request, 2),
  };
  const values: DecimalInterval[] = [];
  const pcg2dCache = new Map<
    string,
    readonly [DecimalInterval, DecimalInterval]
  >();
  for (const instruction of internal.instructions) {
    values.push(evaluateInstruction(instruction, values, environment, pcg2dCache));
  }
  return Object.freeze({
    xMm: decimalToOutwardFloat64(
      internal.affineX === null
        ? decimalSubtract(values[internal.targetX], environment.artifactX)
        : affineResidualHull(internal.affineX, request, 0)
    ),
    yMm: decimalToOutwardFloat64(
      internal.affineY === null
        ? decimalSubtract(values[internal.targetY], environment.artifactY)
        : affineResidualHull(internal.affineY, request, 1)
    ),
    zMm: decimalToOutwardFloat64(
      internal.affineZ === null
        ? decimalSubtract(values[internal.targetZ], environment.artifactZ)
        : affineResidualHull(internal.affineZ, request, 2)
    ),
  });
}

// ---------------------------------------------------------------------------
// Centered mean-value screen (outward float64).
//
// The hull-subtract decimal enclosure above is first-order in cell size: its
// width is dominated by the surface's variation across the cell, so a curved
// target can only accept after subdividing every cell down to tolerance
// scale. The screen below encloses the SAME residual with a centered
// mean-value form — residual(centre) plus the interval Jacobian of
// (target - affine artifact) over the cell hull times the centred offsets —
// whose width is second-order (sag-order) in cell size, so smooth cells
// accept at coarse depth. It is an accelerator with one-sided authority: a
// returned enclosure is a sound bound usable for ACCEPTANCE; `null` means
// "screen unavailable" and the caller must consult the validated decimal
// enclosure. It never rejects anything on its own.
// ---------------------------------------------------------------------------

const fastRefusalHistogram = new Map<string, number>();

function recordFastRefusal(reason: string): null {
  fastRefusalHistogram.set(reason, (fastRefusalHistogram.get(reason) ?? 0) + 1);
  return null;
}

/**
 * Diagnostic coverage counter: which operations/conditions made the screen
 * return `null` since process start. Purely observational — never consulted
 * by any proof decision.
 */
export function fastResidualScreenRefusalHistogram(): ReadonlyMap<string, number> {
  return new Map(fastRefusalHistogram);
}

// Flat compiled screen engine. The screen runs on every work cell, so it
// avoids object allocation: one integer-opcode tape per compiled program
// (WeakMap-cached) plus reusable Float64Array value/derivative channels.
// Outward soundness comes from multiplicative widening — every arithmetic
// node inflates both bounds by 4*2^-52 relative + 1e-300 absolute (>= 2 ulps
// beyond round-to-nearest error), libm-backed nodes by 8*2^-52 — except
// add/subtract results proven EXACT by an error-free round-trip check, which
// are kept exact so domain guards (a power base at an exact zero) stay
// decidable.

const FAST_OP_CONST = 0;
const FAST_OP_PI = 1;
const FAST_OP_U = 2;
const FAST_OP_V = 3;
const FAST_OP_NEG = 4;
const FAST_OP_ABS = 5;
const FAST_OP_SQUARE = 6;
const FAST_OP_SQRT = 7;
const FAST_OP_EXP = 8;
const FAST_OP_LN = 9;
const FAST_OP_SIN = 10;
const FAST_OP_COS = 11;
const FAST_OP_ADD = 12;
const FAST_OP_SUB = 13;
const FAST_OP_MUL = 14;
const FAST_OP_DIV = 15;
const FAST_OP_MIN = 16;
const FAST_OP_MAX = 17;
const FAST_OP_POW = 18;

const FAST_REL = 8.881784197001252e-16; // 4 * 2^-52
const FAST_REL_LIBM = 1.7763568394002505e-15; // 8 * 2^-52
// Any nonzero computed bound below this magnitude refuses the screen. Above
// this floor a rounded result can never be exactly zero unless it is truly
// zero (a zero factor, an error-free-checked exact sum, or an exact libm
// zero), so pure RELATIVE widening — which preserves exact zeros — is sound.
const FAST_MIN_MAGNITUDE = 1e-150;

interface FastCompiledScreenProgram {
  readonly supported: boolean;
  readonly unsupportedReason: string;
  readonly ops: Int32Array;
  readonly argA: Int32Array;
  readonly argB: Int32Array;
  readonly constLo: Float64Array;
  readonly constHi: Float64Array;
  // Reusable per-run channels (single-threaded proof kernel).
  readonly vLo: Float64Array;
  readonly vHi: Float64Array;
  readonly duLo: Float64Array;
  readonly duHi: Float64Array;
  readonly dvLo: Float64Array;
  readonly dvHi: Float64Array;
}

const fastCompiledCache = new WeakMap<object, FastCompiledScreenProgram>();

function fastWidenLo(value: number): number {
  return value - Math.abs(value) * FAST_REL;
}

function fastWidenHi(value: number): number {
  return value + Math.abs(value) * FAST_REL;
}

function fastWidenLoLibm(value: number): number {
  return value - Math.abs(value) * FAST_REL_LIBM;
}

function fastWidenHiLibm(value: number): number {
  return value + Math.abs(value) * FAST_REL_LIBM;
}

function fastBelowMagnitudeFloor(value: number): boolean {
  return value !== 0 && Math.abs(value) < FAST_MIN_MAGNITUDE;
}

function fastConstantBounds(decimalValue: string): readonly [number, number] | null {
  const value = Number(decimalValue);
  if (!Number.isFinite(value)) return null;
  // Canonical integers up to 2^53 convert exactly — keep them exact points
  // so domain guards (a power base >= 0 at an exact 0) stay decidable.
  if (INTEGER_RE.test(decimalValue) && Math.abs(value) <= 9_007_199_254_740_992) {
    return [value, value];
  }
  return [fastWidenLo(value), fastWidenHi(value)];
}

function fastCompileScreenProgram(internal: InternalCompiledProgram): FastCompiledScreenProgram {
  const cached = fastCompiledCache.get(internal);
  if (cached !== undefined) return cached;
  const count = internal.instructions.length;
  const ops = new Int32Array(count);
  const argA = new Int32Array(count);
  const argB = new Int32Array(count);
  const constLo = new Float64Array(count);
  const constHi = new Float64Array(count);
  let supported = true;
  let unsupportedReason = '';
  for (let index = 0; index < count && supported; index += 1) {
    const instruction = internal.instructions[index];
    switch (instruction.op) {
      case 'constant': {
        const bounds = fastConstantBounds(instruction.value);
        if (bounds === null) {
          supported = false;
          unsupportedReason = 'constant-parse';
          break;
        }
        ops[index] = FAST_OP_CONST;
        constLo[index] = bounds[0];
        constHi[index] = bounds[1];
        break;
      }
      case 'pi': ops[index] = FAST_OP_PI; break;
      case 'u': ops[index] = FAST_OP_U; break;
      case 'v': ops[index] = FAST_OP_V; break;
      case 'negate': ops[index] = FAST_OP_NEG; argA[index] = instruction.arg; break;
      case 'absolute': ops[index] = FAST_OP_ABS; argA[index] = instruction.arg; break;
      case 'square': ops[index] = FAST_OP_SQUARE; argA[index] = instruction.arg; break;
      case 'sqrt': ops[index] = FAST_OP_SQRT; argA[index] = instruction.arg; break;
      case 'exp': ops[index] = FAST_OP_EXP; argA[index] = instruction.arg; break;
      case 'ln': ops[index] = FAST_OP_LN; argA[index] = instruction.arg; break;
      case 'sin': ops[index] = FAST_OP_SIN; argA[index] = instruction.arg; break;
      case 'cos': ops[index] = FAST_OP_COS; argA[index] = instruction.arg; break;
      case 'add': ops[index] = FAST_OP_ADD; argA[index] = instruction.left; argB[index] = instruction.right; break;
      case 'subtract': ops[index] = FAST_OP_SUB; argA[index] = instruction.left; argB[index] = instruction.right; break;
      case 'multiply': ops[index] = FAST_OP_MUL; argA[index] = instruction.left; argB[index] = instruction.right; break;
      case 'divide': ops[index] = FAST_OP_DIV; argA[index] = instruction.left; argB[index] = instruction.right; break;
      case 'minimum': ops[index] = FAST_OP_MIN; argA[index] = instruction.left; argB[index] = instruction.right; break;
      case 'maximum': ops[index] = FAST_OP_MAX; argA[index] = instruction.left; argB[index] = instruction.right; break;
      case 'power': ops[index] = FAST_OP_POW; argA[index] = instruction.left; argB[index] = instruction.right; break;
      // Piecewise-constant / branch-cut operations: the mean-value form is
      // invalid across their jumps, so the screen refuses the whole program
      // rather than guess.
      case 'floor':
      case 'ceiling':
      case 'round':
      case 'fractional-part':
      case 'sign':
      case 'step':
      case 'atan2':
      case 'pcg2d-unit-x':
      case 'pcg2d-unit-y':
        supported = false;
        unsupportedReason = `op-${instruction.op}`;
        break;
    }
  }
  const compiled: FastCompiledScreenProgram = {
    supported,
    unsupportedReason,
    ops,
    argA,
    argB,
    constLo,
    constHi,
    vLo: new Float64Array(count),
    vHi: new Float64Array(count),
    duLo: new Float64Array(count),
    duHi: new Float64Array(count),
    dvLo: new Float64Array(count),
    dvHi: new Float64Array(count),
  };
  fastCompiledCache.set(internal, compiled);
  return compiled;
}

const FAST_MAX_TRIG_MAGNITUDE = 1e12;
const FAST_PI_LO = Math.PI - Math.abs(Math.PI) * FAST_REL;
const FAST_PI_HI = Math.PI + Math.abs(Math.PI) * FAST_REL;
// Scratch pair for raw trig-range results: [lower, upper].
const fastTrigScratch = new Float64Array(2);

/**
 * Raw sound range of sin/cos over [lower, upper] written into
 * `fastTrigScratch`. Endpoint libm evaluations are widened by 8*2^-52 and
 * every critical point is located with outward pi. Returns false when the
 * argument magnitude exceeds the supported envelope.
 */
function fastTrigRangeRaw(lower: number, upper: number, isSin: boolean): boolean {
  if (
    !(Math.abs(lower) <= FAST_MAX_TRIG_MAGNITUDE) ||
    !(Math.abs(upper) <= FAST_MAX_TRIG_MAGNITUDE)
  ) {
    return false;
  }
  if (upper - lower >= 2 * FAST_PI_LO) {
    fastTrigScratch[0] = -1;
    fastTrigScratch[1] = 1;
    return true;
  }
  const atLower = isSin ? Math.sin(lower) : Math.cos(lower);
  const atUpper = isSin ? Math.sin(upper) : Math.cos(upper);
  let rangeLower = fastWidenLoLibm(Math.min(atLower, atUpper));
  let rangeUpper = fastWidenHiLibm(Math.max(atLower, atUpper));
  // Extrema: sin at (2k+1)*(pi/2) with sign (-1)^k, cos at k*pi with (-1)^k.
  const kFrom = Math.floor(lower / FAST_PI_HI) - 2;
  const kTo = Math.ceil(upper / FAST_PI_HI) + 2;
  for (let k = kFrom; k <= kTo; k += 1) {
    const m = isSin ? 2 * k + 1 : 2 * k;
    const lowFactor = m >= 0 ? FAST_PI_LO : FAST_PI_HI;
    const highFactor = m >= 0 ? FAST_PI_HI : FAST_PI_LO;
    const criticalLo = fastWidenLo((m * lowFactor) / 2);
    const criticalHi = fastWidenHi((m * highFactor) / 2);
    if (criticalHi < lower || criticalLo > upper) continue;
    if (((k % 2) + 2) % 2 === 0) rangeUpper = Math.max(rangeUpper, 1);
    else rangeLower = Math.min(rangeLower, -1);
  }
  fastTrigScratch[0] = Math.max(rangeLower, -1);
  fastTrigScratch[1] = Math.min(rangeUpper, 1);
  return true;
}

// Scratch pair for raw pow-corner results: [lower, upper].
const fastPowScratch = new Float64Array(2);

function fastPowCornersRaw(
  baseLo: number,
  baseHi: number,
  exponentLo: number,
  exponentHi: number
): boolean {
  const c0 = Math.pow(baseLo, exponentLo);
  const c1 = Math.pow(baseLo, exponentHi);
  const c2 = Math.pow(baseHi, exponentLo);
  const c3 = Math.pow(baseHi, exponentHi);
  const minimum = Math.min(c0, c1, c2, c3);
  const maximum = Math.max(c0, c1, c2, c3);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return false;
  fastPowScratch[0] = fastWidenLoLibm(minimum);
  fastPowScratch[1] = fastWidenHiLibm(maximum);
  return true;
}

function recordFastRefusalBoolean(reason: string): false {
  recordFastRefusal(reason);
  return false;
}

/**
 * Execute the compiled tape with dual-number interval forward differentiation
 * over u in [uLo, uHi], v in [vLo, vHi]. When `seedDerivatives` is false both
 * derivative channels stay zero (pure value pass). Returns false (with a
 * refusal recorded) when any node leaves the screen's supported domain.
 */
function fastRunTape(
  program: FastCompiledScreenProgram,
  uLo: number,
  uHi: number,
  vLo: number,
  vHi: number,
  seedDerivatives: boolean
): boolean {
  const ops = program.ops;
  const argA = program.argA;
  const argB = program.argB;
  const constLo = program.constLo;
  const constHi = program.constHi;
  const valueLo = program.vLo;
  const valueHi = program.vHi;
  const duLo = program.duLo;
  const duHi = program.duHi;
  const dvLo = program.dvLo;
  const dvHi = program.dvHi;
  const count = ops.length;
  for (let index = 0; index < count; index += 1) {
    let rLo = 0;
    let rHi = 0;
    let rDuLo = 0;
    let rDuHi = 0;
    let rDvLo = 0;
    let rDvHi = 0;
    const a = argA[index];
    const b = argB[index];
    switch (ops[index]) {
      case FAST_OP_CONST:
        rLo = constLo[index];
        rHi = constHi[index];
        break;
      case FAST_OP_PI:
        rLo = FAST_PI_LO;
        rHi = FAST_PI_HI;
        break;
      case FAST_OP_U:
        rLo = uLo;
        rHi = uHi;
        if (seedDerivatives) {
          rDuLo = 1;
          rDuHi = 1;
        }
        break;
      case FAST_OP_V:
        rLo = vLo;
        rHi = vHi;
        if (seedDerivatives) {
          rDvLo = 1;
          rDvHi = 1;
        }
        break;
      case FAST_OP_NEG:
        rLo = -valueHi[a];
        rHi = -valueLo[a];
        rDuLo = -duHi[a];
        rDuHi = -duLo[a];
        rDvLo = -dvHi[a];
        rDvHi = -dvLo[a];
        break;
      case FAST_OP_ABS: {
        const lo = valueLo[a];
        const hi = valueHi[a];
        if (lo >= 0) {
          rLo = lo;
          rHi = hi;
          rDuLo = duLo[a];
          rDuHi = duHi[a];
          rDvLo = dvLo[a];
          rDvHi = dvHi[a];
        } else if (hi <= 0) {
          rLo = -hi;
          rHi = -lo;
          rDuLo = -duHi[a];
          rDuHi = -duLo[a];
          rDvLo = -dvHi[a];
          rDvHi = -dvLo[a];
        } else {
          // Kinked across zero: Clarke subgradient hull of {+d, -d}.
          rLo = 0;
          rHi = Math.max(-lo, hi);
          rDuLo = Math.min(duLo[a], -duHi[a]);
          rDuHi = Math.max(duHi[a], -duLo[a]);
          rDvLo = Math.min(dvLo[a], -dvHi[a]);
          rDvHi = Math.max(dvHi[a], -dvLo[a]);
        }
        break;
      }
      case FAST_OP_SQUARE: {
        const lo = valueLo[a];
        const hi = valueHi[a];
        const s0 = lo * lo;
        const s1 = hi * hi;
        rLo = lo <= 0 && hi >= 0 ? 0 : fastWidenLo(Math.min(s0, s1));
        rHi = fastWidenHi(Math.max(s0, s1));
        const t0 = 2 * lo;
        const t1 = 2 * hi;
        const p0 = t0 * duLo[a];
        const p1 = t0 * duHi[a];
        const p2 = t1 * duLo[a];
        const p3 = t1 * duHi[a];
        rDuLo = fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3)));
        rDuHi = fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3)));
        const q0 = t0 * dvLo[a];
        const q1 = t0 * dvHi[a];
        const q2 = t1 * dvLo[a];
        const q3 = t1 * dvHi[a];
        rDvLo = fastWidenLo(Math.min(Math.min(q0, q1), Math.min(q2, q3)));
        rDvHi = fastWidenHi(Math.max(Math.max(q0, q1), Math.max(q2, q3)));
        break;
      }
      case FAST_OP_SQRT: {
        const lo = valueLo[a];
        const hi = valueHi[a];
        if (!(lo > 0)) return recordFastRefusalBoolean('sqrt-domain');
        const rootLo = fastWidenLo(Math.sqrt(lo));
        const rootHi = fastWidenHi(Math.sqrt(hi));
        rLo = rootLo;
        rHi = rootHi;
        const factorLo = fastWidenLo(1 / (2 * rootHi));
        const factorHi = fastWidenHi(1 / (2 * rootLo));
        const p0 = factorLo * duLo[a];
        const p1 = factorLo * duHi[a];
        const p2 = factorHi * duLo[a];
        const p3 = factorHi * duHi[a];
        rDuLo = fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3)));
        rDuHi = fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3)));
        const q0 = factorLo * dvLo[a];
        const q1 = factorLo * dvHi[a];
        const q2 = factorHi * dvLo[a];
        const q3 = factorHi * dvHi[a];
        rDvLo = fastWidenLo(Math.min(Math.min(q0, q1), Math.min(q2, q3)));
        rDvHi = fastWidenHi(Math.max(Math.max(q0, q1), Math.max(q2, q3)));
        break;
      }
      case FAST_OP_EXP: {
        const hiIn = valueHi[a];
        if (!(hiIn <= 700)) return recordFastRefusalBoolean('exp-domain');
        const eLo = Math.max(0, fastWidenLoLibm(Math.exp(valueLo[a])));
        const eHi = fastWidenHiLibm(Math.exp(hiIn));
        rLo = eLo;
        rHi = eHi;
        const p0 = eLo * duLo[a];
        const p1 = eLo * duHi[a];
        const p2 = eHi * duLo[a];
        const p3 = eHi * duHi[a];
        rDuLo = fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3)));
        rDuHi = fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3)));
        const q0 = eLo * dvLo[a];
        const q1 = eLo * dvHi[a];
        const q2 = eHi * dvLo[a];
        const q3 = eHi * dvHi[a];
        rDvLo = fastWidenLo(Math.min(Math.min(q0, q1), Math.min(q2, q3)));
        rDvHi = fastWidenHi(Math.max(Math.max(q0, q1), Math.max(q2, q3)));
        break;
      }
      case FAST_OP_LN: {
        const lo = valueLo[a];
        if (!(lo > 0)) return recordFastRefusalBoolean('ln-domain');
        rLo = fastWidenLoLibm(Math.log(lo));
        rHi = fastWidenHiLibm(Math.log(valueHi[a]));
        const factorLo = fastWidenLo(1 / valueHi[a]);
        const factorHi = fastWidenHi(1 / lo);
        const p0 = factorLo * duLo[a];
        const p1 = factorLo * duHi[a];
        const p2 = factorHi * duLo[a];
        const p3 = factorHi * duHi[a];
        rDuLo = fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3)));
        rDuHi = fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3)));
        const q0 = factorLo * dvLo[a];
        const q1 = factorLo * dvHi[a];
        const q2 = factorHi * dvLo[a];
        const q3 = factorHi * dvHi[a];
        rDvLo = fastWidenLo(Math.min(Math.min(q0, q1), Math.min(q2, q3)));
        rDvHi = fastWidenHi(Math.max(Math.max(q0, q1), Math.max(q2, q3)));
        break;
      }
      case FAST_OP_SIN:
      case FAST_OP_COS: {
        const isSin = ops[index] === FAST_OP_SIN;
        if (!fastTrigRangeRaw(valueLo[a], valueHi[a], isSin)) {
          return recordFastRefusalBoolean(isSin ? 'sin-range' : 'cos-range');
        }
        rLo = fastTrigScratch[0];
        rHi = fastTrigScratch[1];
        // Derivative factor: sin' = cos, cos' = -sin over the same argument.
        if (!fastTrigRangeRaw(valueLo[a], valueHi[a], !isSin)) {
          return recordFastRefusalBoolean(isSin ? 'sin-range' : 'cos-range');
        }
        let factorLo = fastTrigScratch[0];
        let factorHi = fastTrigScratch[1];
        if (!isSin) {
          const swap = factorLo;
          factorLo = -factorHi;
          factorHi = -swap;
        }
        const p0 = factorLo * duLo[a];
        const p1 = factorLo * duHi[a];
        const p2 = factorHi * duLo[a];
        const p3 = factorHi * duHi[a];
        rDuLo = fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3)));
        rDuHi = fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3)));
        const q0 = factorLo * dvLo[a];
        const q1 = factorLo * dvHi[a];
        const q2 = factorHi * dvLo[a];
        const q3 = factorHi * dvHi[a];
        rDvLo = fastWidenLo(Math.min(Math.min(q0, q1), Math.min(q2, q3)));
        rDvHi = fastWidenHi(Math.max(Math.max(q0, q1), Math.max(q2, q3)));
        break;
      }
      case FAST_OP_ADD:
      case FAST_OP_SUB: {
        const subtract = ops[index] === FAST_OP_SUB;
        const bLoRaw = subtract ? -valueHi[b] : valueLo[b];
        const bHiRaw = subtract ? -valueLo[b] : valueHi[b];
        const aLo = valueLo[a];
        const aHi = valueHi[a];
        const sumLo = aLo + bLoRaw;
        const sumHi = aHi + bHiRaw;
        // Error-free exactness check: keep exact sums exact so zero-touching
        // domain guards stay decidable at patch edges.
        rLo = sumLo - aLo === bLoRaw && sumLo - bLoRaw === aLo ? sumLo : fastWidenLo(sumLo);
        rHi = sumHi - aHi === bHiRaw && sumHi - bHiRaw === aHi ? sumHi : fastWidenHi(sumHi);
        const bDuLo = subtract ? -duHi[b] : duLo[b];
        const bDuHi = subtract ? -duLo[b] : duHi[b];
        rDuLo = fastWidenLo(duLo[a] + bDuLo);
        rDuHi = fastWidenHi(duHi[a] + bDuHi);
        const bDvLo = subtract ? -dvHi[b] : dvLo[b];
        const bDvHi = subtract ? -dvLo[b] : dvHi[b];
        rDvLo = fastWidenLo(dvLo[a] + bDvLo);
        rDvHi = fastWidenHi(dvHi[a] + bDvHi);
        break;
      }
      case FAST_OP_MUL: {
        const aLo = valueLo[a];
        const aHi = valueHi[a];
        const bLo = valueLo[b];
        const bHi = valueHi[b];
        const m0 = aLo * bLo;
        const m1 = aLo * bHi;
        const m2 = aHi * bLo;
        const m3 = aHi * bHi;
        rLo = fastWidenLo(Math.min(Math.min(m0, m1), Math.min(m2, m3)));
        rHi = fastWidenHi(Math.max(Math.max(m0, m1), Math.max(m2, m3)));
        const p0 = duLo[a] * bLo;
        const p1 = duLo[a] * bHi;
        const p2 = duHi[a] * bLo;
        const p3 = duHi[a] * bHi;
        const p4 = aLo * duLo[b];
        const p5 = aLo * duHi[b];
        const p6 = aHi * duLo[b];
        const p7 = aHi * duHi[b];
        rDuLo = fastWidenLo(
          Math.min(Math.min(p0, p1), Math.min(p2, p3)) +
            Math.min(Math.min(p4, p5), Math.min(p6, p7))
        );
        rDuHi = fastWidenHi(
          Math.max(Math.max(p0, p1), Math.max(p2, p3)) +
            Math.max(Math.max(p4, p5), Math.max(p6, p7))
        );
        const q0 = dvLo[a] * bLo;
        const q1 = dvLo[a] * bHi;
        const q2 = dvHi[a] * bLo;
        const q3 = dvHi[a] * bHi;
        const q4 = aLo * dvLo[b];
        const q5 = aLo * dvHi[b];
        const q6 = aHi * dvLo[b];
        const q7 = aHi * dvHi[b];
        rDvLo = fastWidenLo(
          Math.min(Math.min(q0, q1), Math.min(q2, q3)) +
            Math.min(Math.min(q4, q5), Math.min(q6, q7))
        );
        rDvHi = fastWidenHi(
          Math.max(Math.max(q0, q1), Math.max(q2, q3)) +
            Math.max(Math.max(q4, q5), Math.max(q6, q7))
        );
        break;
      }
      case FAST_OP_DIV: {
        const bLo = valueLo[b];
        const bHi = valueHi[b];
        if (bLo <= 0 && bHi >= 0) return recordFastRefusalBoolean('divide-zero');
        const aLo = valueLo[a];
        const aHi = valueHi[a];
        const d0 = aLo / bLo;
        const d1 = aLo / bHi;
        const d2 = aHi / bLo;
        const d3 = aHi / bHi;
        rLo = fastWidenLo(Math.min(Math.min(d0, d1), Math.min(d2, d3)));
        rHi = fastWidenHi(Math.max(Math.max(d0, d1), Math.max(d2, d3)));
        const bSq0 = bLo * bLo;
        const bSq1 = bHi * bHi;
        const bSqLo = fastWidenLo(Math.min(bSq0, bSq1));
        const bSqHi = fastWidenHi(Math.max(bSq0, bSq1));
        const n0 = duLo[a] * bLo;
        const n1 = duLo[a] * bHi;
        const n2 = duHi[a] * bLo;
        const n3 = duHi[a] * bHi;
        const n4 = aLo * duLo[b];
        const n5 = aLo * duHi[b];
        const n6 = aHi * duLo[b];
        const n7 = aHi * duHi[b];
        const numDuLo =
          Math.min(Math.min(n0, n1), Math.min(n2, n3)) -
          Math.max(Math.max(n4, n5), Math.max(n6, n7));
        const numDuHi =
          Math.max(Math.max(n0, n1), Math.max(n2, n3)) -
          Math.min(Math.min(n4, n5), Math.min(n6, n7));
        const e0 = numDuLo / bSqLo;
        const e1 = numDuLo / bSqHi;
        const e2 = numDuHi / bSqLo;
        const e3 = numDuHi / bSqHi;
        rDuLo = fastWidenLo(Math.min(Math.min(e0, e1), Math.min(e2, e3)));
        rDuHi = fastWidenHi(Math.max(Math.max(e0, e1), Math.max(e2, e3)));
        const o0 = dvLo[a] * bLo;
        const o1 = dvLo[a] * bHi;
        const o2 = dvHi[a] * bLo;
        const o3 = dvHi[a] * bHi;
        const o4 = aLo * dvLo[b];
        const o5 = aLo * dvHi[b];
        const o6 = aHi * dvLo[b];
        const o7 = aHi * dvHi[b];
        const numDvLo =
          Math.min(Math.min(o0, o1), Math.min(o2, o3)) -
          Math.max(Math.max(o4, o5), Math.max(o6, o7));
        const numDvHi =
          Math.max(Math.max(o0, o1), Math.max(o2, o3)) -
          Math.min(Math.min(o4, o5), Math.min(o6, o7));
        const f0 = numDvLo / bSqLo;
        const f1 = numDvLo / bSqHi;
        const f2 = numDvHi / bSqLo;
        const f3 = numDvHi / bSqHi;
        rDvLo = fastWidenLo(Math.min(Math.min(f0, f1), Math.min(f2, f3)));
        rDvHi = fastWidenHi(Math.max(Math.max(f0, f1), Math.max(f2, f3)));
        break;
      }
      case FAST_OP_MIN:
      case FAST_OP_MAX: {
        const takeMin = ops[index] === FAST_OP_MIN;
        const aLo = valueLo[a];
        const aHi = valueHi[a];
        const bLo = valueLo[b];
        const bHi = valueHi[b];
        rLo = takeMin ? Math.min(aLo, bLo) : Math.max(aLo, bLo);
        rHi = takeMin ? Math.min(aHi, bHi) : Math.max(aHi, bHi);
        const leftOnly = takeMin ? aHi < bLo : aLo > bHi;
        const rightOnly = takeMin ? bHi < aLo : bLo > aHi;
        if (leftOnly) {
          rDuLo = duLo[a];
          rDuHi = duHi[a];
          rDvLo = dvLo[a];
          rDvHi = dvHi[a];
        } else if (rightOnly) {
          rDuLo = duLo[b];
          rDuHi = duHi[b];
          rDvLo = dvLo[b];
          rDvHi = dvHi[b];
        } else {
          // Possibly kinked inside the cell: Clarke subgradient hull.
          rDuLo = Math.min(duLo[a], duLo[b]);
          rDuHi = Math.max(duHi[a], duHi[b]);
          rDvLo = Math.min(dvLo[a], dvLo[b]);
          rDvHi = Math.max(dvHi[a], dvHi[b]);
        }
        break;
      }
      case FAST_OP_POW: {
        const baseLo = valueLo[a];
        const baseHi = valueHi[a];
        const expLo = valueLo[b];
        const expHi = valueHi[b];
        const exponentIsConstant =
          duLo[b] === 0 &&
          duHi[b] === 0 &&
          dvLo[b] === 0 &&
          dvHi[b] === 0 &&
          expHi - expLo < 1e-9;
        if (exponentIsConstant && expLo >= 1 && baseLo >= 0 && Number.isFinite(baseHi)) {
          // Nonnegative base with an effectively constant exponent p >= 1:
          // pow is monotone in each argument separately on base >= 0, so the
          // widened corner hull is a sound enclosure, and the derivative
          // factor p * base^(p-1) stays finite down to base = 0 because the
          // TRUE p - 1 is >= 0 (clamping the outward slack below zero keeps
          // containment and avoids pow(0, -ulp) = Infinity).
          if (!fastPowCornersRaw(baseLo, baseHi, expLo, expHi)) {
            return recordFastRefusalBoolean('power-corners');
          }
          rLo = fastPowScratch[0];
          rHi = fastPowScratch[1];
          if (
            !fastPowCornersRaw(baseLo, baseHi, Math.max(0, expLo - 1), Math.max(0, expHi - 1))
          ) {
            return recordFastRefusalBoolean('power-corners');
          }
          const g0 = expLo * fastPowScratch[0];
          const g1 = expLo * fastPowScratch[1];
          const g2 = expHi * fastPowScratch[0];
          const g3 = expHi * fastPowScratch[1];
          const factorLo = fastWidenLo(Math.min(Math.min(g0, g1), Math.min(g2, g3)));
          const factorHi = fastWidenHi(Math.max(Math.max(g0, g1), Math.max(g2, g3)));
          const p0 = factorLo * duLo[a];
          const p1 = factorLo * duHi[a];
          const p2 = factorHi * duLo[a];
          const p3 = factorHi * duHi[a];
          rDuLo = fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3)));
          rDuHi = fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3)));
          const q0 = factorLo * dvLo[a];
          const q1 = factorLo * dvHi[a];
          const q2 = factorHi * dvLo[a];
          const q3 = factorHi * dvHi[a];
          rDvLo = fastWidenLo(Math.min(Math.min(q0, q1), Math.min(q2, q3)));
          rDvHi = fastWidenHi(Math.max(Math.max(q0, q1), Math.max(q2, q3)));
          break;
        }
        if (!(baseLo > 0)) return recordFastRefusalBoolean('power-domain');
        // General positive base: a^b = exp(b * ln a) with widened libm calls;
        // d(a^b) = a^b * (b' * ln a + b * a'/a).
        const lnLo = fastWidenLoLibm(Math.log(baseLo));
        const lnHi = fastWidenHiLibm(Math.log(baseHi));
        const m0 = expLo * lnLo;
        const m1 = expLo * lnHi;
        const m2 = expHi * lnLo;
        const m3 = expHi * lnHi;
        const productLo = fastWidenLo(Math.min(Math.min(m0, m1), Math.min(m2, m3)));
        const productHi = fastWidenHi(Math.max(Math.max(m0, m1), Math.max(m2, m3)));
        if (!(productHi <= 700)) return recordFastRefusalBoolean('power-overflow');
        rLo = Math.max(0, fastWidenLoLibm(Math.exp(productLo)));
        rHi = fastWidenHiLibm(Math.exp(productHi));
        const r0 = duLo[a] / baseLo;
        const r1 = duLo[a] / baseHi;
        const r2 = duHi[a] / baseLo;
        const r3 = duHi[a] / baseHi;
        const ratioDuLo = fastWidenLo(Math.min(Math.min(r0, r1), Math.min(r2, r3)));
        const ratioDuHi = fastWidenHi(Math.max(Math.max(r0, r1), Math.max(r2, r3)));
        const s0 = dvLo[a] / baseLo;
        const s1 = dvLo[a] / baseHi;
        const s2 = dvHi[a] / baseLo;
        const s3 = dvHi[a] / baseHi;
        const ratioDvLo = fastWidenLo(Math.min(Math.min(s0, s1), Math.min(s2, s3)));
        const ratioDvHi = fastWidenHi(Math.max(Math.max(s0, s1), Math.max(s2, s3)));
        const t0 = duLo[b] * lnLo;
        const t1 = duLo[b] * lnHi;
        const t2 = duHi[b] * lnLo;
        const t3 = duHi[b] * lnHi;
        const t4 = expLo * ratioDuLo;
        const t5 = expLo * ratioDuHi;
        const t6 = expHi * ratioDuLo;
        const t7 = expHi * ratioDuHi;
        const innerDuLo =
          Math.min(Math.min(t0, t1), Math.min(t2, t3)) +
          Math.min(Math.min(t4, t5), Math.min(t6, t7));
        const innerDuHi =
          Math.max(Math.max(t0, t1), Math.max(t2, t3)) +
          Math.max(Math.max(t4, t5), Math.max(t6, t7));
        const w0 = dvLo[b] * lnLo;
        const w1 = dvLo[b] * lnHi;
        const w2 = dvHi[b] * lnLo;
        const w3 = dvHi[b] * lnHi;
        const w4 = expLo * ratioDvLo;
        const w5 = expLo * ratioDvHi;
        const w6 = expHi * ratioDvLo;
        const w7 = expHi * ratioDvHi;
        const innerDvLo =
          Math.min(Math.min(w0, w1), Math.min(w2, w3)) +
          Math.min(Math.min(w4, w5), Math.min(w6, w7));
        const innerDvHi =
          Math.max(Math.max(w0, w1), Math.max(w2, w3)) +
          Math.max(Math.max(w4, w5), Math.max(w6, w7));
        const h0 = rLo * innerDuLo;
        const h1 = rLo * innerDuHi;
        const h2 = rHi * innerDuLo;
        const h3 = rHi * innerDuHi;
        rDuLo = fastWidenLo(Math.min(Math.min(h0, h1), Math.min(h2, h3)));
        rDuHi = fastWidenHi(Math.max(Math.max(h0, h1), Math.max(h2, h3)));
        const i0 = rLo * innerDvLo;
        const i1 = rLo * innerDvHi;
        const i2 = rHi * innerDvLo;
        const i3 = rHi * innerDvHi;
        rDvLo = fastWidenLo(Math.min(Math.min(i0, i1), Math.min(i2, i3)));
        rDvHi = fastWidenHi(Math.max(Math.max(i0, i1), Math.max(i2, i3)));
        break;
      }
      default:
        return recordFastRefusalBoolean('unsupported-op');
    }
    if (
      !(rLo <= rHi) ||
      !Number.isFinite(rLo) ||
      !Number.isFinite(rHi) ||
      !(rDuLo <= rDuHi) ||
      !Number.isFinite(rDuLo) ||
      !Number.isFinite(rDuHi) ||
      !(rDvLo <= rDvHi) ||
      !Number.isFinite(rDvLo) ||
      !Number.isFinite(rDvHi)
    ) {
      return recordFastRefusalBoolean('nonfinite-node');
    }
    if (
      fastBelowMagnitudeFloor(rLo) ||
      fastBelowMagnitudeFloor(rHi) ||
      fastBelowMagnitudeFloor(rDuLo) ||
      fastBelowMagnitudeFloor(rDuHi) ||
      fastBelowMagnitudeFloor(rDvLo) ||
      fastBelowMagnitudeFloor(rDvHi)
    ) {
      return recordFastRefusalBoolean('tiny-magnitude');
    }
    valueLo[index] = rLo;
    valueHi[index] = rHi;
    duLo[index] = rDuLo;
    duHi[index] = rDuHi;
    dvLo[index] = rDvLo;
    dvHi[index] = rDvHi;
  }
  return true;
}

function fastFinite(interval: OutwardInterval): boolean {
  return Number.isFinite(interval.lower) && Number.isFinite(interval.upper);
}

function fastZero(): OutwardInterval {
  return outwardInterval(0, 0);
}

function fastDyadic(numerator: string, fractionBits: number): OutwardInterval | null {
  if (!INTEGER_RE.test(numerator) || numerator.length > 64) return null;
  const parsed = Number(numerator);
  const value = parsed * 2 ** -fractionBits;
  if (!Number.isFinite(value)) return null;
  // Numerators within 2^53 parse exactly and multiplying by an exact power
  // of two only shifts the exponent, so the dyadic value is EXACT (fraction
  // bits stay far below the subnormal boundary). Exactness matters: an exact
  // v = 0 keeps power/sqrt domain guards decidable at patch edges.
  if (Math.abs(parsed) <= 9_007_199_254_740_992 && fractionBits <= 900) {
    return outwardInterval(value, value);
  }
  return outwardInterval(fastWidenLo(value), fastWidenHi(value));
}

function fastArtifactCoordinate(
  request: ValidatedResidualEnclosureRequest,
  artifactVertex: number,
  coordinate: 0 | 1 | 2
): OutwardInterval | null {
  const exactPicometres = request.artifactTriangleVerticesPm;
  if (exactPicometres !== undefined) {
    const vertex = exactPicometres[artifactVertex];
    if (!Array.isArray(vertex) || vertex.length !== 3) return null;
    const raw = vertex[coordinate];
    if (typeof raw !== 'string' || !INTEGER_RE.test(raw) || raw.length > 64) return null;
    const millimetres = Number(raw) / 1_000_000_000;
    if (!Number.isFinite(millimetres)) return null;
    return outwardInterval(fastWidenLo(millimetres), fastWidenHi(millimetres));
  }
  const vertex = request.artifactTriangleVerticesMm[artifactVertex];
  if (!Array.isArray(vertex) || vertex.length !== 3) return null;
  const value = vertex[coordinate];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return outwardInterval(value, value);
}

/**
 * Centered mean-value screen over one residual cell. Returns a sound outward
 * enclosure of target-minus-affine-artifact over the complete cell, or `null`
 * when the screen cannot answer (unsupported operation, domain uncertainty,
 * degenerate cell, nonfinite value). `null` carries no geometric information.
 */
export function fastEncloseCompiledValidatedResidualProgram(
  compiled: CompiledValidatedResidualProgram,
  request: ValidatedResidualEnclosureRequest
): ValidatedResidualEnclosure | null {
  const internal = compiled as InternalCompiledProgram;
  if (!Array.isArray(internal.instructions)) return null;
  const cell = request.cell;
  const fractionBits = cell.fractionBits;
  if (!Number.isSafeInteger(fractionBits) || fractionBits < 0 || fractionBits > MAX_DYADIC_BITS) {
    return null;
  }
  const barycentricFractionBits = cell.barycentricFractionBits;
  if (
    !Number.isSafeInteger(barycentricFractionBits) ||
    barycentricFractionBits < 0 ||
    barycentricFractionBits > 30
  ) {
    return null;
  }

  const cellU: OutwardInterval[] = [];
  const cellV: OutwardInterval[] = [];
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const u = fastDyadic(cell.vertices[vertex].uNumerator, fractionBits);
    const v = fastDyadic(cell.vertices[vertex].vNumerator, fractionBits);
    if (u === null || v === null) return null;
    cellU.push(u);
    cellV.push(v);
  }

  // Affine artifact values at the three cell vertices via the exact dyadic
  // barycentric weights (the same combination the decimal path uses).
  const denominator = 2 ** barycentricFractionBits;
  const weights: OutwardInterval[] = [];
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    const vertexWeights = cell.barycentricVertices[cellVertex];
    const numerators = [
      vertexWeights.aNumerator,
      vertexWeights.bNumerator,
      vertexWeights.cNumerator,
    ];
    let numeratorSum = 0;
    for (const numerator of numerators) {
      if (!INTEGER_RE.test(numerator) || numerator.length > 16) return null;
      const parsed = Number(numerator);
      if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
      numeratorSum += parsed;
      // Weight = numerator / 2^bits with both parts exact in float64.
      weights.push(outwardInterval(parsed / denominator, parsed / denominator));
    }
    if (numeratorSum !== denominator) return null;
  }
  const artifact: OutwardInterval[] = [];
  for (let artifactVertex = 0; artifactVertex < 3; artifactVertex += 1) {
    for (const coordinate of [0, 1, 2] as const) {
      const value = fastArtifactCoordinate(request, artifactVertex, coordinate);
      if (value === null) return null;
      artifact.push(value);
    }
  }
  return fastEncloseCore(internal, cellU, cellV, weights, artifact);
}

/**
 * Exact numeric screen entry: the caller supplies the cell as raw numbers —
 * integer dyadic numerators (exact within 2^52), exact dyadic barycentric
 * numerators, and exact parsed binary32 STL coordinates. Identical
 * enclosures to the canonical string entry; `null` on any validation doubt.
 */
export function fastEncloseCompiledValidatedResidualProgramNumeric(
  compiled: CompiledValidatedResidualProgram,
  uNumerators: Float64Array,
  vNumerators: Float64Array,
  fractionBits: number,
  barycentricNumerators: Float64Array,
  barycentricFractionBits: number,
  artifactVerticesMm: Float64Array
): ValidatedResidualEnclosure | null {
  const internal = compiled as InternalCompiledProgram;
  if (!Array.isArray(internal.instructions)) return null;
  if (
    !Number.isSafeInteger(fractionBits) ||
    fractionBits < 0 ||
    fractionBits > 52 ||
    !Number.isSafeInteger(barycentricFractionBits) ||
    barycentricFractionBits < 0 ||
    barycentricFractionBits > 30 ||
    uNumerators.length !== 3 ||
    vNumerators.length !== 3 ||
    barycentricNumerators.length !== 9 ||
    artifactVerticesMm.length !== 9
  ) {
    return null;
  }
  const scale = 2 ** -fractionBits;
  const cellU: OutwardInterval[] = [];
  const cellV: OutwardInterval[] = [];
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const uNumerator = uNumerators[vertex];
    const vNumerator = vNumerators[vertex];
    if (
      !Number.isInteger(uNumerator) ||
      !Number.isInteger(vNumerator) ||
      Math.abs(uNumerator) > 4_503_599_627_370_496 ||
      Math.abs(vNumerator) > 4_503_599_627_370_496
    ) {
      return null;
    }
    // Integer numerator times an exact power of two is exact in float64.
    cellU.push(outwardInterval(uNumerator * scale, uNumerator * scale));
    cellV.push(outwardInterval(vNumerator * scale, vNumerator * scale));
  }
  const denominator = 2 ** barycentricFractionBits;
  const weights: OutwardInterval[] = [];
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    let numeratorSum = 0;
    for (let weight = 0; weight < 3; weight += 1) {
      const numerator = barycentricNumerators[cellVertex * 3 + weight];
      if (!Number.isInteger(numerator) || numerator < 0) return null;
      numeratorSum += numerator;
      weights.push(outwardInterval(numerator / denominator, numerator / denominator));
    }
    if (numeratorSum !== denominator) return null;
  }
  const artifact: OutwardInterval[] = [];
  for (let value = 0; value < 9; value += 1) {
    const coordinate = artifactVerticesMm[value];
    if (!Number.isFinite(coordinate)) return null;
    artifact.push(outwardInterval(coordinate, coordinate));
  }
  return fastEncloseCore(internal, cellU, cellV, weights, artifact);
}

/**
 * Shared centered mean-value core. `cellU`/`cellV` are the three exact cell
 * vertex coordinates, `weights` the nine exact barycentric weights (vertex-
 * major a,b,c), `artifact` the nine artifact coordinate enclosures
 * (vertex-major x,y,z).
 */
function fastEncloseCore(
  internal: InternalCompiledProgram,
  cellU: readonly OutwardInterval[],
  cellV: readonly OutwardInterval[],
  weights: readonly OutwardInterval[],
  artifact: readonly OutwardInterval[]
): ValidatedResidualEnclosure | null {
  const three = outwardInterval(3, 3);
  const uBox = outwardHull(outwardHull(cellU[0], cellU[1]), cellU[2]);
  const vBox = outwardHull(outwardHull(cellV[0], cellV[1]), cellV[2]);
  const uCentre = outwardDivide(outwardAdd(outwardAdd(cellU[0], cellU[1]), cellU[2]), three);
  const vCentre = outwardDivide(outwardAdd(outwardAdd(cellV[0], cellV[1]), cellV[2]), three);
  const uOffset = outwardSubtract(uBox, uCentre);
  const vOffset = outwardSubtract(vBox, vCentre);

  // Affine artifact values at the three cell vertices via the exact dyadic
  // barycentric weights (the same combination the decimal path uses).
  const artifactAtCellVertex: OutwardInterval[][] = [];
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    const coordinates: OutwardInterval[] = [];
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      let combination = fastZero();
      for (let artifactVertex = 0; artifactVertex < 3; artifactVertex += 1) {
        combination = outwardAdd(
          combination,
          outwardMultiply(
            weights[cellVertex * 3 + artifactVertex],
            artifact[artifactVertex * 3 + coordinate]
          )
        );
      }
      coordinates.push(combination);
    }
    artifactAtCellVertex.push(coordinates);
  }

  // Constant affine gradient of the artifact over the cell triangle.
  const edge1U = outwardSubtract(cellU[1], cellU[0]);
  const edge1V = outwardSubtract(cellV[1], cellV[0]);
  const edge2U = outwardSubtract(cellU[2], cellU[0]);
  const edge2V = outwardSubtract(cellV[2], cellV[0]);
  const determinant = outwardSubtract(
    outwardMultiply(edge1U, edge2V),
    outwardMultiply(edge2U, edge1V)
  );
  if (determinant.lower <= 0 && determinant.upper >= 0) return null;

  const screenProgram = fastCompileScreenProgram(internal);
  if (!screenProgram.supported) return recordFastRefusal(screenProgram.unsupportedReason);
  const targets = [internal.targetX, internal.targetY, internal.targetZ] as const;
  // Pass 1: interval Jacobian over the cell hull. Capture the three target
  // slots before the second run reuses the same channel buffers.
  if (!fastRunTape(screenProgram, uBox.lower, uBox.upper, vBox.lower, vBox.upper, true)) {
    return null;
  }
  const jacobianDu: OutwardInterval[] = [];
  const jacobianDv: OutwardInterval[] = [];
  for (const targetIndex of targets) {
    jacobianDu.push(
      outwardInterval(screenProgram.duLo[targetIndex], screenProgram.duHi[targetIndex])
    );
    jacobianDv.push(
      outwardInterval(screenProgram.dvLo[targetIndex], screenProgram.dvHi[targetIndex])
    );
  }
  // Pass 2: target value at the cell centroid (derivative channels unseeded).
  if (
    !fastRunTape(
      screenProgram,
      uCentre.lower,
      uCentre.upper,
      vCentre.lower,
      vCentre.upper,
      false
    )
  ) {
    return null;
  }
  const centreValue: OutwardInterval[] = [];
  for (const targetIndex of targets) {
    centreValue.push(
      outwardInterval(screenProgram.vLo[targetIndex], screenProgram.vHi[targetIndex])
    );
  }

  const residuals: OutwardInterval[] = [];
  for (let coordinate = 0; coordinate < 3; coordinate += 1) {
    const delta1 = outwardSubtract(
      artifactAtCellVertex[1][coordinate],
      artifactAtCellVertex[0][coordinate]
    );
    const delta2 = outwardSubtract(
      artifactAtCellVertex[2][coordinate],
      artifactAtCellVertex[0][coordinate]
    );
    const gradientU = outwardDivide(
      outwardSubtract(outwardMultiply(delta1, edge2V), outwardMultiply(delta2, edge1V)),
      determinant
    );
    const gradientV = outwardDivide(
      outwardSubtract(outwardMultiply(delta2, edge1U), outwardMultiply(delta1, edge2U)),
      determinant
    );
    // The artifact is affine, so its value at the centroid is the exact mean
    // of its three cell-vertex values.
    const artifactCentre = outwardDivide(
      outwardAdd(
        outwardAdd(artifactAtCellVertex[0][coordinate], artifactAtCellVertex[1][coordinate]),
        artifactAtCellVertex[2][coordinate]
      ),
      three
    );
    const residualCentre = outwardSubtract(centreValue[coordinate], artifactCentre);
    const residualGradientU = outwardSubtract(jacobianDu[coordinate], gradientU);
    const residualGradientV = outwardSubtract(jacobianDv[coordinate], gradientV);
    const residual = outwardAdd(
      residualCentre,
      outwardAdd(
        outwardMultiply(residualGradientU, uOffset),
        outwardMultiply(residualGradientV, vOffset)
      )
    );
    if (!fastFinite(residual)) return null;
    residuals.push(residual);
  }
  return Object.freeze({ xMm: residuals[0], yMm: residuals[1], zMm: residuals[2] });
}
