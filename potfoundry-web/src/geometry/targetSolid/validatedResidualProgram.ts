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
import type {
  ValidatedResidualEnclosure,
  ValidatedResidualEnclosureRequest,
} from './continuousMappedPatchDistance';

export const VALIDATED_RESIDUAL_PROGRAM_VERSION =
  'potfoundry.validated-target-program/v2' as const;
export const VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION =
  'potfoundry.validated-target-ssa-program/v3' as const;
export const VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION =
  'potfoundry.validated-target-program-compiler/v9' as const;
export const VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256 = sha256Utf8(
  [
    VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
    `decimal-interval-proof=${DECIMAL_INTERVAL_PROOF_SHA256}`,
    `integer-pcg2d-proof=${INTEGER_PCG2D_HASH_PROOF_SHA256}`,
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
