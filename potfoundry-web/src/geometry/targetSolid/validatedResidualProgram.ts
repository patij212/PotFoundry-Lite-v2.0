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

export const VALIDATED_RESIDUAL_PROGRAM_VERSION = 'potfoundry.validated-target-program/v2' as const;
export const VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION =
  'potfoundry.validated-target-ssa-program/v3' as const;
export const VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION =
  'potfoundry.validated-target-program-compiler/v14' as const;
export const VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256 = sha256Utf8(
  [
    VALIDATED_RESIDUAL_PROGRAM_COMPILER_VERSION,
    `decimal-interval-proof=${DECIMAL_INTERVAL_PROOF_SHA256}`,
    `integer-pcg2d-proof=${INTEGER_PCG2D_HASH_PROOF_SHA256}`,
    `outward-float64-interval-proof=${OUTWARD_FLOAT64_INTERVAL_PROOF_SHA256}`,
    'a centered mean-value screen may enclose non-affine residual cells in outward float64 intervals: residual(cell) is contained in residual(centre) plus the box interval Jacobian of target-minus-affine-artifact times the centred cell offsets, hulled over the three exact cell-vertex offsets (every cell point is a convex combination of the vertices and the term is linear in the offset for each fixed Jacobian selection, so the vertex hull contains the triangle range and is pointwise contained in the axis-aligned-box hull it replaces)',
    'the screen Jacobian is forward-mode interval differentiation of the same compiled instructions over the axis-aligned cell hull; kinked minimum/maximum/absolute nodes use the Clarke subgradient hull, which the Lebourg mean-value theorem admits',
    'screen arithmetic widens every node result by a pure relative 4*2^-52 (libm-backed nodes 8*2^-52, assuming platform libm within one unit in the last place per call), which preserves exact zeros; soundness of relative-only widening is enforced by refusing any nonzero computed bound below 1e-150 in magnitude, above which a rounded result is exactly zero only when truly zero; add/subtract results additionally keep exactness proven by an error-free round-trip check; products and quotients by a power-of-two point factor are exponent shifts and stay exact unwidened; trig ranges include every critical point conservatively located with outward pi',
    'piecewise/branch-cut nodes (floor, ceiling, round, fractional-part, sign, step, atan2, pcg2d) are jump-guarded: cells whose argument enclosures exclude every jump take exact locally-constant or smooth paths (pcg2d resolves proven single-integer operands to its exact dyadic constant), and straddling cells downgrade the whole run to a plain value-hull residual over the cell — still a sound enclosure, only first-order wide',
    'fractional-part and floor nodes whose argument is compiler-proven point-exact affine in u/v additionally band-resolve per cell: exact integer arithmetic on the cell rational vertex numerators must prove the argument range lies inside one closed unit band [k, k+1], and the node then evaluates as the error-free-checked smooth shift argument-minus-k or the exact constant k with no hull downgrade; cells whose exact argument range spans a jump keep the hull fallback, and both interval kernels apply the same per-cell band',
    'sign nodes with a point-exact affine argument and step nodes whose combined argument x-minus-edge is point-exact affine band-resolve by the same exact per-cell check against their single zero jump: a cell provably on one closed side evaluates that side closure constant (sign minus-one/plus-one, step zero/one with the right-closed branch carrying the true equality value), and mixed-sign cells keep the hull fallback in every kernel',
    'band-resolved enclosures bound distance to the closed graph of the program: on a jump line the resolved branch evaluates its one-sided closure limit, which distance-to-set claims admit because closure points are infima of graph points; any solid-boundary curtain at a value-discontinuous jump remains a surface-complex obligation outside this program proof',
    'power additionally supports a varying exponent y >= 1 with base >= 0: value and base-derivative factors by monotone corner bounds, exponent-derivative factor a^y*ln(a) bounded below by -1/(e*yLo) on (0,1] and corner-monotone for base >= 1',
    'power with base >= 0 and a positive exponent below one (a clamp-boundary cusp with unbounded derivative) keeps its monotone corner VALUE enclosure and downgrades the run to the value-hull residual, so cusp neighborhoods refine by subdivision instead of refusing to the decimal kernel',
    'the screen refuses (returns unavailable, never a bound) on non-positive sqrt/ln/divide domains, power bases that may be negative, atan2 argument rectangles touching the origin outside the hull path, degenerate cell Jacobian systems, and any nonfinite value; refused cells fall back to the validated decimal enclosure',
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
// Prepared proof text for the optional second-order (Hessian-interval) screen.
// It is NOT part of VALIDATED_RESIDUAL_PROGRAM_COMPILER_PROOF_SHA256 above: the
// second-order pass is flag-gated OFF by default, so the certified first-order
// method text and its hash are unchanged and every existing certificate stays
// valid. Productionizing the pass (enabling it inside a certification run) is a
// deliberate step: append these sentences to the compiler proof array, bump the
// compiler version, and re-derive the certificate roster.
export const VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_TEXT = [
  'the optional second-order (Hessian-interval) screen encloses a twice-differentiable residual cell by Taylor expansion with the second-order Lagrange remainder: for the cell centroid c and offset delta = x - c, r(x) = r(c) + grad r(c) . delta + 1/2 delta^T H_r(xi) delta for some xi on the segment from c to x, which lies in the cell, so r(x) is contained in r(c) + { grad r(c) . delta : x in the cell } + 1/2 { delta^T H delta : delta in the axis-aligned cell offset box, H in H_r(cell) }',
  'the residual value and gradient at the centroid are enclosed as thin intervals over the same compiled instructions, and the linear term is hulled over the three exact cell-vertex offsets exactly as the first-order mean-value form, so it is a sound outward superset by convexity',
  'the affine artifact has identically zero curvature, so the residual Hessian equals the target Hessian, which is enclosed over the whole axis-aligned cell box by forward-mode interval second differentiation of the compiled instructions; the quadratic remainder is that interval Hessian contracted with the box offset interval and halved, a sound outward superset of every 1/2 delta^T H(xi) delta',
  'per-op second-derivative rules propagate outward interval Hessian channels: the chain rule y_ij = f(2)(g) g_i g_j + f(1)(g) g_ij for unary nodes (negate, square, sqrt, exp, ln, sin, cos) and the product rule y_ij = a_ij b + a_i b_j + a_j b_i + a b_ij for multiply, with the same relative-only widening and error-free-checked additions that keep the first-order channels sound and exact zeros exact',
  'kinked nodes whose Clarke subgradient branch fires (a straddling minimum, maximum, or absolute value), jump and branch-cut nodes, and any operation whose bounded second-derivative rule is not yet implemented mark the cell second-order-invalid; the screen then falls back to the sound first-order mean-value enclosure for that cell, so soundness never depends on second-order coverage',
  'the second-order pass is an acceptance-only accelerator with the same one-sided authority as the first-order screen: a returned enclosure is a sound bound usable for acceptance and it never rejects a cell on its own',
].join('\n');

export const VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_SHA256 = sha256Utf8(
  VALIDATED_RESIDUAL_PROGRAM_SECOND_ORDER_METHOD_TEXT
);

export const GENERATED_TARGET_PROGRAM_BACKENDS_VERSION =
  'potfoundry.generated-target-program-backends/v7' as const;
export const GENERATED_TARGET_PROGRAM_BACKENDS_SCOPE =
  'shared-ir-cpu-f64-wgsl-f32-reference-and-validated-interval-no-device-conformance-proof' as const;
export const WGSL_TARGET_BUILTIN_SEMANTICS_REVISION = 'W3C-CRD-WGSL-20260310' as const;
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
  readonly evaluateFloat32Reference: (u: number, v: number) => readonly [number, number, number];
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
  readonly bandedJumpNodes: readonly BandedJumpNode[] | null;
}

/**
 * A fractional-part/floor node whose argument is compiler-proven affine in
 * u/v with point-exact decimal coefficients. The argument over a cell equals
 * (uScaled*uNumerator + vScaled*vNumerator + constantScaled*cellDenominator)
 * / (cellDenominator * powerOfTenScale) exactly, so exact integer arithmetic
 * on the cell's rational vertex numerators decides whether the whole cell
 * lies inside one closed unit band [k, k+1] of the argument.
 */
interface BandedJumpNode {
  readonly nodeIndex: number;
  readonly operation: 'fractional-part' | 'floor' | 'sign' | 'step';
  readonly uScaled: bigint;
  readonly vScaled: bigint;
  readonly constantScaled: bigint;
  readonly powerOfTenScale: bigint;
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
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
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
    if (typeof expression.value !== 'string')
      refuse('constant value must be an exact decimal string');
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
  if (operation === 'u' || operation === 'v' || operation === 'pi') {
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
    if (typeof node.value !== 'string')
      refuse('SSA constant value must be an exact decimal string');
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
        isInteger = integerValued[instruction.left] && integerValued[instruction.right];
        break;
      case 'pcg2d-unit-x':
      case 'pcg2d-unit-y':
        if (!integerValued[instruction.left] || !integerValued[instruction.right]) {
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
  const programSha256 = domainSeparatedCanonicalJsonSha256(hashDomain, parsed.value);
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
    bandedJumpNodes: deriveBandedJumpNodes(instructions, affineForms),
  });
}

export function computeValidatedResidualProgramSha256(canonicalProgramJson: unknown): string {
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
    case 'constant':
      return Number(instruction.value);
    case 'u':
      return u;
    case 'v':
      return v;
    case 'pi':
      return Math.PI;
    case 'negate':
      return -values[instruction.arg];
    case 'absolute':
      return Math.abs(values[instruction.arg]);
    case 'square':
      return values[instruction.arg] * values[instruction.arg];
    case 'sqrt':
      return Math.sqrt(values[instruction.arg]);
    case 'exp':
      return Math.exp(values[instruction.arg]);
    case 'ln':
      return Math.log(values[instruction.arg]);
    case 'sin':
      return Math.sin(values[instruction.arg]);
    case 'cos':
      return Math.cos(values[instruction.arg]);
    case 'floor':
      return Math.floor(values[instruction.arg]);
    case 'ceiling':
      return Math.ceil(values[instruction.arg]);
    case 'round':
      return roundTiesToEven(values[instruction.arg]);
    case 'fractional-part':
      return values[instruction.arg] - Math.floor(values[instruction.arg]);
    case 'sign':
      return Math.sign(values[instruction.arg]);
    case 'add':
      return values[instruction.left] + values[instruction.right];
    case 'subtract':
      return values[instruction.left] - values[instruction.right];
    case 'multiply':
      return values[instruction.left] * values[instruction.right];
    case 'divide':
      return values[instruction.left] / values[instruction.right];
    case 'minimum':
      return Math.min(values[instruction.left], values[instruction.right]);
    case 'maximum':
      return Math.max(values[instruction.left], values[instruction.right]);
    case 'power':
      return Math.pow(values[instruction.left], values[instruction.right]);
    case 'step':
      return values[instruction.left] <= values[instruction.right] ? 1 : 0;
    case 'atan2':
      return Math.atan2(values[instruction.left], values[instruction.right]);
    case 'pcg2d-unit-x':
    case 'pcg2d-unit-y': {
      const key = `${instruction.left}:${instruction.right}`;
      let pair = pcg2dCache.get(key);
      if (pair === undefined) {
        pair = integerPcg2dUnitHash(values[instruction.left], values[instruction.right]);
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
      generatedBackendRefuse(
        `node ${index} produced a non-finite ${float32 ? 'f32' : 'f64'} value`
      );
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
    case 'constant':
      return wgslFloat32Literal(instruction.value);
    case 'u':
      return 'u';
    case 'v':
      return 'v';
    case 'pi':
      return wgslFloat32Literal(exactFloat64Decimal(Math.PI));
    case 'negate':
      return `-${node(instruction.arg)}`;
    case 'absolute':
      return `abs(${node(instruction.arg)})`;
    case 'square':
      return `(${node(instruction.arg)} * ${node(instruction.arg)})`;
    case 'sqrt':
      return `sqrt(${node(instruction.arg)})`;
    case 'exp':
      return `exp(${node(instruction.arg)})`;
    case 'ln':
      return `log(${node(instruction.arg)})`;
    case 'sin':
      return `sin(${node(instruction.arg)})`;
    case 'cos':
      return `cos(${node(instruction.arg)})`;
    case 'floor':
      return `floor(${node(instruction.arg)})`;
    case 'ceiling':
      return `ceil(${node(instruction.arg)})`;
    case 'round':
      return `round(${node(instruction.arg)})`;
    case 'fractional-part':
      return `fract(${node(instruction.arg)})`;
    case 'sign':
      return `sign(${node(instruction.arg)})`;
    case 'add':
      return `(${node(instruction.left)} + ${node(instruction.right)})`;
    case 'subtract':
      return `(${node(instruction.left)} - ${node(instruction.right)})`;
    case 'multiply':
      return `(${node(instruction.left)} * ${node(instruction.right)})`;
    case 'divide':
      return `(${node(instruction.left)} / ${node(instruction.right)})`;
    case 'minimum':
      return `min(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'maximum':
      return `max(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'power':
      return `pow(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'step':
      return `step(${node(instruction.left)}, ${node(instruction.right)})`;
    case 'atan2':
      return `atan2(select(${node(instruction.left)}, 0.0, ${node(instruction.left)} == 0.0), select(${node(instruction.right)}, 0.0, ${node(instruction.right)} == 0.0))`;
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
    (instruction) => instruction.op === 'pcg2d-unit-x' || instruction.op === 'pcg2d-unit-y'
  );
  const pcg2dFunctionName = `pf_pcg2d_${program.programSha256.slice(0, 16)}`;
  const lines = usesPcg2d
    ? [
        integerPcg2dUnitHashWgslSource(pcg2dFunctionName).trimEnd(),
        '',
        `fn ${functionName}(u: f32, v: f32) -> vec3<f32> {`,
      ]
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
    lines.push(`  let n${index}: f32 = ${wgslInstructionExpression(instruction)};`);
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
  const evaluateFloat64 = Object.freeze((u: number, v: number): readonly [number, number, number] =>
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

// 2^52 - 1 (odd) — matches the exact partition kernel's declarable envelope.
const MAX_ODD_DENOMINATOR_FACTOR = 4_503_599_627_370_495n;
// Directed-rounding guard digits for rational cell coordinates: interval
// width 10^-45 relative to the coordinate, far below every geometric budget.
const RATIONAL_DECIMAL_GUARD_DIGITS = 45;

/**
 * Optional odd denominator factor of the cell coordinate system (coordinate
 * = numerator / (oddDenominatorFactor * 2^fractionBits)). Dyadic cells omit
 * the field; a present field must be a canonical odd integer >= 3, so every
 * cell has exactly one encoding.
 */
function requestOddFactor(request: ValidatedResidualEnclosureRequest): bigint {
  const raw = (request.cell as { readonly oddDenominatorFactor?: unknown }).oddDenominatorFactor;
  if (raw === undefined) return 1n;
  if (typeof raw !== 'string' || raw.length > 16 || !INTEGER_RE.test(raw)) {
    refuse('cell oddDenominatorFactor must be a canonical bounded integer string');
  }
  const parsed = BigInt(raw);
  if (parsed < 3n || (parsed & 1n) !== 1n || parsed > MAX_ODD_DENOMINATOR_FACTOR) {
    refuse(
      'cell oddDenominatorFactor must be an odd integer >= 3 within the exact envelope; dyadic cells omit it'
    );
  }
  return parsed;
}

function scaledDecimalString(scaled: bigint, fractionalDigits: number): string {
  if (scaled === 0n) return '0';
  const digits = scaled.toString().padStart(fractionalDigits + 1, '0');
  const split = digits.length - fractionalDigits;
  return `${digits.slice(0, split)}.${digits.slice(split)}`.replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * Outward decimal enclosure of numerator / (oddFactor * 2^fractionBits).
 * Exact (a point) whenever the odd factor divides the numerator, or when the
 * remaining factor divides a power of ten (e.g. 5); otherwise a directed
 * floor/ceil pair with RATIONAL_DECIMAL_GUARD_DIGITS guard digits. Sound for
 * enclosure: the true rational always lies inside the returned interval.
 */
function rationalDecimalInterval(
  numerator: bigint,
  oddFactor: bigint,
  fractionBits: number
): DecimalInterval {
  if (numerator % oddFactor === 0n) {
    return decimalPoint(exactDyadicDecimal(numerator / oddFactor, fractionBits));
  }
  if (!Number.isSafeInteger(fractionBits) || fractionBits < 0 || fractionBits > MAX_DYADIC_BITS) {
    refuse('dyadic fraction bits exceed the evaluator envelope');
  }
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const fractionalDigits = fractionBits + RATIONAL_DECIMAL_GUARD_DIGITS;
  const scaled =
    magnitude * 5n ** BigInt(fractionBits) * 10n ** BigInt(RATIONAL_DECIMAL_GUARD_DIGITS);
  const flooredQuotient = scaled / oddFactor;
  const remainder = scaled % oddFactor;
  const lowMagnitude = scaledDecimalString(flooredQuotient, fractionalDigits);
  if (remainder === 0n) {
    return decimalPoint(negative ? `-${lowMagnitude}` : lowMagnitude);
  }
  const highMagnitude = scaledDecimalString(flooredQuotient + 1n, fractionalDigits);
  return decimalHull(
    decimalPoint(negative ? `-${highMagnitude}` : lowMagnitude),
    decimalPoint(negative ? `-${lowMagnitude}` : highMagnitude)
  );
}

function cellCoordinateInterval(
  request: ValidatedResidualEnclosureRequest,
  cellVertex: number,
  coordinate: 'uNumerator' | 'vNumerator'
): DecimalInterval {
  const numerator = parseInteger(
    request.cell.vertices[cellVertex][coordinate],
    `cell vertex ${coordinate}`
  );
  const oddFactor = requestOddFactor(request);
  if (oddFactor === 1n) {
    return decimalPoint(exactDyadicDecimal(numerator, request.cell.fractionBits));
  }
  return rationalDecimalInterval(numerator, oddFactor, request.cell.fractionBits);
}

function exactPicometresToMillimetresDecimal(value: unknown, label: string): string {
  const picometres = parseInteger(value, label);
  if (picometres === 0n) return '0';
  const negative = picometres < 0n;
  const digits = (negative ? -picometres : picometres).toString().padStart(10, '0');
  const split = digits.length - 9;
  const fractional = digits.slice(split).replace(/0+$/, '');
  const magnitude =
    fractional.length === 0 ? digits.slice(0, split) : `${digits.slice(0, split)}.${fractional}`;
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
    const value = cellCoordinateInterval(request, index, coordinate);
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
  return cellCoordinateInterval(request, cellVertex, coordinate);
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
  return (
    form.u.lower === '0' && form.u.upper === '0' && form.v.lower === '0' && form.v.upper === '0'
  );
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
    case 'constant':
      return decimalPoint(instruction.value);
    case 'pi':
      return decimalPi();
    case 'negate':
      return decimalNegate(values[instruction.arg]);
    case 'absolute':
      return decimalAbsolute(values[instruction.arg]);
    case 'square':
      return decimalSquare(values[instruction.arg]);
    case 'sqrt':
      return decimalSqrt(values[instruction.arg]);
    case 'exp':
      return decimalExp(values[instruction.arg]);
    case 'ln':
      return decimalLn(values[instruction.arg]);
    case 'sin':
      return decimalSin(values[instruction.arg]);
    case 'cos':
      return decimalCos(values[instruction.arg]);
    case 'floor':
      return decimalFloor(values[instruction.arg]);
    case 'ceiling':
      return decimalCeil(values[instruction.arg]);
    case 'round':
      return decimalRoundTiesToEven(values[instruction.arg]);
    case 'fractional-part':
      return decimalFract(values[instruction.arg]);
    case 'sign':
      return decimalSign(values[instruction.arg]);
    case 'add':
      return decimalAdd(values[instruction.left], values[instruction.right]);
    case 'subtract':
      return decimalSubtract(values[instruction.left], values[instruction.right]);
    case 'multiply':
      return decimalMultiply(values[instruction.left], values[instruction.right]);
    case 'divide':
      return decimalDivide(values[instruction.left], values[instruction.right]);
    case 'minimum':
      return decimalMinimum(values[instruction.left], values[instruction.right]);
    case 'maximum':
      return decimalMaximum(values[instruction.left], values[instruction.right]);
    case 'power':
      return decimalPow(values[instruction.left], values[instruction.right]);
    case 'step':
      return decimalStep(values[instruction.left], values[instruction.right]);
    case 'atan2':
      return decimalAtan2(values[instruction.left], values[instruction.right]);
    case 'pcg2d-unit-x':
    case 'pcg2d-unit-y': {
      const pair = decimalIntegerPcg2dUnitHash(values[instruction.left], values[instruction.right]);
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
      forms.push(
        Object.freeze({ constant: zeroInterval(), u: decimalPoint('1'), v: zeroInterval() })
      );
      continue;
    }
    if (instruction.op === 'v') {
      forms.push(
        Object.freeze({ constant: zeroInterval(), u: zeroInterval(), v: decimalPoint('1') })
      );
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

    const argumentIndices =
      'arg' in instruction
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

const CANONICAL_POINT_DECIMAL_RE = /^(-?)([0-9]+)(?:\.([0-9]+))?$/;
const MAX_BAND_COEFFICIENT_FRACTION_DIGITS = 120;
const BAND_INDEX_LIMIT = 1_099_511_627_776; // 2^40: band indices stay exact float64 integers.

interface ParsedPointDecimal {
  readonly mantissa: bigint;
  readonly fractionDigits: number;
}

function parsePointDecimal(interval: DecimalInterval): ParsedPointDecimal | null {
  if (interval.lower !== interval.upper) return null;
  const match = CANONICAL_POINT_DECIMAL_RE.exec(interval.lower);
  if (match === null) return null;
  const fraction = match[3] ?? '';
  if (fraction.length > MAX_BAND_COEFFICIENT_FRACTION_DIGITS) return null;
  const magnitude = BigInt(`${match[2]}${fraction}`);
  return {
    mantissa: match[1] === '-' ? -magnitude : magnitude,
    fractionDigits: fraction.length,
  };
}

/**
 * Collect piecewise-jump nodes whose (combined) argument affine form has
 * point-exact coefficients (an interval pi coefficient, a rounded product,
 * or any non-affine argument disqualifies the node — fail closed to the
 * jump-guard behavior). fractional-part/floor key off their argument; sign
 * keys off its argument's single jump at zero; step(edge, x) keys off the
 * combined affine x - edge with its single jump at zero. Coefficients are
 * normalized to one shared power-of-ten scale so per-cell band checks are
 * single BigInt comparisons.
 */
function deriveBandedJumpNodes(
  instructions: readonly Instruction[],
  forms: readonly (AffineForm | null)[]
): readonly BandedJumpNode[] | null {
  const banded: BandedJumpNode[] = [];
  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    let form: AffineForm | null = null;
    if (
      instruction.op === 'fractional-part' ||
      instruction.op === 'floor' ||
      instruction.op === 'sign'
    ) {
      form = forms[instruction.arg];
    } else if (instruction.op === 'step') {
      const edge = forms[instruction.left];
      const argument = forms[instruction.right];
      form = edge === null || argument === null ? null : affineAdd(argument, affineNegate(edge));
    } else {
      continue;
    }
    if (form === null) continue;
    const uCoefficient = parsePointDecimal(form.u);
    const vCoefficient = parsePointDecimal(form.v);
    const constant = parsePointDecimal(form.constant);
    if (uCoefficient === null || vCoefficient === null || constant === null) continue;
    // A fully constant argument already folds through the affine constant
    // path; banding it would be redundant.
    if (uCoefficient.mantissa === 0n && vCoefficient.mantissa === 0n) continue;
    const exponent = Math.max(
      uCoefficient.fractionDigits,
      vCoefficient.fractionDigits,
      constant.fractionDigits
    );
    banded.push(
      Object.freeze({
        nodeIndex: index,
        operation: instruction.op,
        uScaled: uCoefficient.mantissa * 10n ** BigInt(exponent - uCoefficient.fractionDigits),
        vScaled: vCoefficient.mantissa * 10n ** BigInt(exponent - vCoefficient.fractionDigits),
        constantScaled: constant.mantissa * 10n ** BigInt(exponent - constant.fractionDigits),
        powerOfTenScale: 10n ** BigInt(exponent),
      })
    );
  }
  return banded.length === 0 ? null : Object.freeze(banded);
}

/**
 * Exact per-cell band resolution. Writes the resolved band k (an exact
 * float64 integer) into `bands[node.nodeIndex]` when the argument range over
 * the cell provably lies inside [k, k+1]; writes NaN otherwise. All
 * arithmetic is exact BigInt on the cell's rational vertex numerators
 * (numerator / (oddFactor * 2^fractionBits)), so a jump strictly inside the
 * cell can never be resolved away.
 */
function resolveJumpBandsInto(
  bands: Float64Array,
  banded: readonly BandedJumpNode[],
  uNumerators: readonly bigint[],
  vNumerators: readonly bigint[],
  fractionBits: number,
  oddFactor: bigint
): void {
  const cellDenominator = oddFactor << BigInt(fractionBits);
  for (const node of banded) {
    let minimum: bigint | undefined;
    let maximum: bigint | undefined;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const value =
        node.uScaled * uNumerators[vertex] +
        node.vScaled * vNumerators[vertex] +
        node.constantScaled * cellDenominator;
      if (minimum === undefined || value < minimum) minimum = value;
      if (maximum === undefined || value > maximum) maximum = value;
    }
    if (minimum === undefined || maximum === undefined) {
      bands[node.nodeIndex] = Number.NaN;
      continue;
    }
    if (node.operation === 'sign' || node.operation === 'step') {
      // Single value jump at argument zero. A cell provably on one closed
      // side resolves to that side's constant (its one-sided closure limit
      // on the jump line itself); the right-closed step branch carries the
      // true edge <= x equality value. Mixed signs keep the hull.
      if (maximum <= 0n) {
        bands[node.nodeIndex] = node.operation === 'sign' ? -1 : 0;
      } else if (minimum >= 0n) {
        bands[node.nodeIndex] = 1;
      } else {
        bands[node.nodeIndex] = Number.NaN;
      }
      continue;
    }
    const bandDenominator = cellDenominator * node.powerOfTenScale;
    let band = minimum / bandDenominator;
    if (minimum % bandDenominator !== 0n && minimum < 0n) band -= 1n;
    if (
      maximum <= (band + 1n) * bandDenominator &&
      band > BigInt(-BAND_INDEX_LIMIT) &&
      band < BigInt(BAND_INDEX_LIMIT)
    ) {
      bands[node.nodeIndex] = Number(band);
    } else {
      bands[node.nodeIndex] = Number.NaN;
    }
  }
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
    const residual = decimalSubtract(target, affineArtifactPoint(request, coordinate, cellVertex));
    hull = hull === undefined ? residual : decimalHull(hull, residual);
  }
  if (hull === undefined) refuse('affine residual cell has no vertices');
  return hull;
}

function evaluateInstruction(
  instruction: Instruction,
  instructionIndex: number,
  values: readonly DecimalInterval[],
  environment: EvaluationEnvironment,
  pcg2dCache: Map<string, readonly [DecimalInterval, DecimalInterval]>,
  bands: Float64Array | null
): DecimalInterval {
  switch (instruction.op) {
    case 'constant':
      return decimalPoint(instruction.value);
    case 'pi':
      return decimalPi();
    case 'u':
      return environment.u;
    case 'v':
      return environment.v;
    case 'negate':
      return decimalNegate(values[instruction.arg]);
    case 'absolute':
      return decimalAbsolute(values[instruction.arg]);
    case 'square':
      return decimalSquare(values[instruction.arg]);
    case 'sqrt':
      return decimalSqrt(values[instruction.arg]);
    case 'exp':
      return decimalExp(values[instruction.arg]);
    case 'ln':
      return decimalLn(values[instruction.arg]);
    case 'sin':
      return decimalSin(values[instruction.arg]);
    case 'cos':
      return decimalCos(values[instruction.arg]);
    case 'floor': {
      if (bands !== null) {
        const band = bands[instructionIndex];
        // Exact-band cell: floor is the band constant on the closed band's
        // left-closed branch (closed-graph semantics at the right edge).
        if (band === band) return decimalPoint(band.toString());
      }
      return decimalFloor(values[instruction.arg]);
    }
    case 'ceiling':
      return decimalCeil(values[instruction.arg]);
    case 'round':
      return decimalRoundTiesToEven(values[instruction.arg]);
    case 'fractional-part': {
      if (bands !== null) {
        const band = bands[instructionIndex];
        // Exact-band cell: fract(x) = x - k over the whole closed band; the
        // outward argument enclosure may overhang the band by its rounding
        // guard, which only widens the (still sound) shifted enclosure.
        if (band === band) {
          return decimalSubtract(values[instruction.arg], decimalPoint(band.toString()));
        }
      }
      return decimalFract(values[instruction.arg]);
    }
    case 'sign': {
      if (bands !== null) {
        const band = bands[instructionIndex];
        // Exact-band cell: the argument range provably sits on one closed
        // side of zero; sign is that side's closure constant.
        if (band === band) return decimalPoint(band.toString());
      }
      return decimalSign(values[instruction.arg]);
    }
    case 'add':
      return decimalAdd(values[instruction.left], values[instruction.right]);
    case 'subtract':
      return decimalSubtract(values[instruction.left], values[instruction.right]);
    case 'multiply':
      return decimalMultiply(values[instruction.left], values[instruction.right]);
    case 'divide':
      return decimalDivide(values[instruction.left], values[instruction.right]);
    case 'minimum':
      return decimalMinimum(values[instruction.left], values[instruction.right]);
    case 'maximum':
      return decimalMaximum(values[instruction.left], values[instruction.right]);
    case 'power':
      return decimalPow(values[instruction.left], values[instruction.right]);
    case 'step': {
      if (bands !== null) {
        const band = bands[instructionIndex];
        // Exact-band cell: the combined argument x - edge provably sits on
        // one closed side of zero; step is that side's closure constant
        // (the right-closed branch carries the true equality value).
        if (band === band) return decimalPoint(band.toString());
      }
      return decimalStep(values[instruction.left], values[instruction.right]);
    }
    case 'atan2':
      return decimalAtan2(values[instruction.left], values[instruction.right]);
    case 'pcg2d-unit-x':
    case 'pcg2d-unit-y': {
      const key = `${instruction.left}:${instruction.right}`;
      let pair = pcg2dCache.get(key);
      if (pair === undefined) {
        pair = decimalIntegerPcg2dUnitHash(values[instruction.left], values[instruction.right]);
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
  let bands: Float64Array | null = null;
  if (internal.bandedJumpNodes !== null) {
    const fractionBits = request.cell.fractionBits;
    if (!Number.isSafeInteger(fractionBits) || fractionBits < 0 || fractionBits > MAX_DYADIC_BITS) {
      refuse('dyadic fraction bits exceed the evaluator envelope');
    }
    const uNumerators: bigint[] = [];
    const vNumerators: bigint[] = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      uNumerators.push(
        parseInteger(request.cell.vertices[vertex].uNumerator, 'cell vertex uNumerator')
      );
      vNumerators.push(
        parseInteger(request.cell.vertices[vertex].vNumerator, 'cell vertex vNumerator')
      );
    }
    bands = new Float64Array(internal.instructions.length).fill(Number.NaN);
    resolveJumpBandsInto(
      bands,
      internal.bandedJumpNodes,
      uNumerators,
      vNumerators,
      fractionBits,
      requestOddFactor(request)
    );
  }
  const values: DecimalInterval[] = [];
  const pcg2dCache = new Map<string, readonly [DecimalInterval, DecimalInterval]>();
  for (let index = 0; index < internal.instructions.length; index += 1) {
    values.push(
      evaluateInstruction(
        internal.instructions[index],
        index,
        values,
        environment,
        pcg2dCache,
        bands
      )
    );
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
const FAST_OP_FLOOR = 19;
const FAST_OP_CEIL = 20;
const FAST_OP_ROUND = 21;
const FAST_OP_FRACT = 22;
const FAST_OP_SIGN = 23;
const FAST_OP_STEP = 24;
const FAST_OP_ATAN2 = 25;
const FAST_OP_PCG2D_X = 26;
const FAST_OP_PCG2D_Y = 27;

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

/**
 * Second-derivative channels for the optional Hessian-interval (second-order)
 * screen pass. Allocated lazily on first second-order use and cached per
 * compiled program, so the default first-order path allocates nothing new and
 * stays byte-identical.
 */
interface FastHessianChannels {
  readonly duuLo: Float64Array;
  readonly duuHi: Float64Array;
  readonly duvLo: Float64Array;
  readonly duvHi: Float64Array;
  readonly dvvLo: Float64Array;
  readonly dvvHi: Float64Array;
}

const fastHessianCache = new WeakMap<FastCompiledScreenProgram, FastHessianChannels>();

function fastHessianChannels(program: FastCompiledScreenProgram): FastHessianChannels {
  let channels = fastHessianCache.get(program);
  if (channels === undefined) {
    const count = program.ops.length;
    channels = {
      duuLo: new Float64Array(count),
      duuHi: new Float64Array(count),
      duvLo: new Float64Array(count),
      duvHi: new Float64Array(count),
      dvvLo: new Float64Array(count),
      dvvHi: new Float64Array(count),
    };
    fastHessianCache.set(program, channels);
  }
  return channels;
}

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

/**
 * A point interval whose magnitude is an exact power of two: multiplying or
 * dividing by it only shifts the float64 exponent, so those products are
 * EXACT and must not be widened — exactness matters because clamped-at-zero
 * expressions (0.5 + 0.5*sin, 1 - cos, ...) must reach 0 exactly for the
 * pow/sqrt domain guards to stay decidable.
 */
function fastIsPowerOfTwoPoint(lower: number, upper: number): boolean {
  if (lower !== upper || lower === 0 || !Number.isFinite(lower)) return false;
  const magnitude = Math.abs(lower);
  if (magnitude < 2 ** -500 || magnitude > 2 ** 500) return false;
  return magnitude === 2 ** Math.round(Math.log2(magnitude));
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
      case 'pi':
        ops[index] = FAST_OP_PI;
        break;
      case 'u':
        ops[index] = FAST_OP_U;
        break;
      case 'v':
        ops[index] = FAST_OP_V;
        break;
      case 'negate':
        ops[index] = FAST_OP_NEG;
        argA[index] = instruction.arg;
        break;
      case 'absolute':
        ops[index] = FAST_OP_ABS;
        argA[index] = instruction.arg;
        break;
      case 'square':
        ops[index] = FAST_OP_SQUARE;
        argA[index] = instruction.arg;
        break;
      case 'sqrt':
        ops[index] = FAST_OP_SQRT;
        argA[index] = instruction.arg;
        break;
      case 'exp':
        ops[index] = FAST_OP_EXP;
        argA[index] = instruction.arg;
        break;
      case 'ln':
        ops[index] = FAST_OP_LN;
        argA[index] = instruction.arg;
        break;
      case 'sin':
        ops[index] = FAST_OP_SIN;
        argA[index] = instruction.arg;
        break;
      case 'cos':
        ops[index] = FAST_OP_COS;
        argA[index] = instruction.arg;
        break;
      case 'add':
        ops[index] = FAST_OP_ADD;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'subtract':
        ops[index] = FAST_OP_SUB;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'multiply':
        ops[index] = FAST_OP_MUL;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'divide':
        ops[index] = FAST_OP_DIV;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'minimum':
        ops[index] = FAST_OP_MIN;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'maximum':
        ops[index] = FAST_OP_MAX;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'power':
        ops[index] = FAST_OP_POW;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      // Piecewise / branch-cut operations compile to jump-guarded opcodes:
      // cells whose argument enclosure excludes every jump take a tight
      // (often exactly constant) path; straddling cells downgrade the whole
      // run to a value-hull enclosure (see fastRunTapeHullOnly).
      case 'floor':
        ops[index] = FAST_OP_FLOOR;
        argA[index] = instruction.arg;
        break;
      case 'ceiling':
        ops[index] = FAST_OP_CEIL;
        argA[index] = instruction.arg;
        break;
      case 'round':
        ops[index] = FAST_OP_ROUND;
        argA[index] = instruction.arg;
        break;
      case 'fractional-part':
        ops[index] = FAST_OP_FRACT;
        argA[index] = instruction.arg;
        break;
      case 'sign':
        ops[index] = FAST_OP_SIGN;
        argA[index] = instruction.arg;
        break;
      case 'step':
        ops[index] = FAST_OP_STEP;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'atan2':
        ops[index] = FAST_OP_ATAN2;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'pcg2d-unit-x':
        ops[index] = FAST_OP_PCG2D_X;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
        break;
      case 'pcg2d-unit-y':
        ops[index] = FAST_OP_PCG2D_Y;
        argA[index] = instruction.left;
        argB[index] = instruction.right;
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
 * Set when a jump-guarded node straddled a discontinuity during the last
 * fastRunTape run: value channels remain sound enclosures, derivative
 * channels are meaningless, and the caller must fall back to the plain
 * value-hull residual instead of the centered mean-value form.
 */
let fastRunTapeHullOnly = false;
// Observational only (never read by the bound math): set when a min/max/abs node
// takes its Clarke subgradient branch during a tape run. Lets slack audits split
// genuine-kink cells from smooth cells. Does not affect the enclosure/soundness.
let fastRunTapeClarkeFired = false;
let fastLastScreenClarkeFired = false;
/**
 * Set true during a Hessian-tape run (fastRunTape called with a non-null
 * `hess`) when a node has no sound bounded second-derivative over the cell: a
 * straddling kink (abs/min/max Clarke branch), a jump / hull-only node, or an
 * operation whose per-op second-order rule is not yet implemented. The centered
 * second-order form is then invalid for the run and the caller must fall back
 * to the first-order mean-value screen. Never affects the first-order bound.
 */
let fastRunTapeSecondOrderInvalid = false;
let fastLastScreenSecondOrderUsed = false;
// Diagnostic only (never read by any bound decision): the integer opcode of the
// node that first made the last Hessian-tape run second-order-invalid, or -1 if
// none did (the run stayed second-order-valid, or fell back via hull-only).
let fastRunTapeSecondOrderInvalidOp = -1;

export function getLastScreenClarkeFired(): boolean {
  return fastLastScreenClarkeFired;
}

/**
 * Observational: whether the last screened cell was enclosed by the second-order
 * Hessian-interval form (true) or fell back to the first-order mean-value form
 * (false). Never read by any bound or soundness decision.
 */
export function getLastScreenSecondOrderUsed(): boolean {
  return fastLastScreenSecondOrderUsed;
}

/** Diagnostic: integer opcode of the node that first invalidated the second-order
 * pass on the last Hessian-tape run (-1 = none). Never read by proof decisions. */
export function getLastSecondOrderInvalidOp(): number {
  return fastRunTapeSecondOrderInvalidOp;
}

/**
 * Per-cell exact band assignments for the current fastEncloseCore run,
 * indexed by instruction: NaN everywhere except banded fractional-part/floor
 * nodes the exact integer check resolved for this cell. Null when the
 * program has no banded nodes.
 */
let fastRunTapeBands: Float64Array | null = null;

const fastBandScratchCache = new WeakMap<object, Float64Array>();

function fastBandScratch(internal: InternalCompiledProgram): Float64Array {
  let scratch = fastBandScratchCache.get(internal);
  if (scratch === undefined) {
    scratch = new Float64Array(internal.instructions.length).fill(Number.NaN);
    fastBandScratchCache.set(internal, scratch);
  }
  return scratch;
}

/**
 * Execute the compiled tape with dual-number interval forward differentiation
 * over u in [uLo, uHi], v in [vLo, vHi]. When `seedDerivatives` is false both
 * derivative channels stay zero (pure value pass). Returns false (with a
 * refusal recorded) when any node leaves the screen's supported domain.
 *
 * When `hess` is non-null the run additionally propagates outward interval
 * second-derivative channels (duu, duv, dvv) by the per-op chain/product rule
 * for the Hessian-interval (second-order) screen; `seedDerivatives` must be true
 * in that case. Nodes with no sound bounded second derivative over the cell set
 * `fastRunTapeSecondOrderInvalid` (the value and first-derivative channels stay
 * sound, so the caller can still use the first-order form).
 */
function fastRunTape(
  program: FastCompiledScreenProgram,
  uLo: number,
  uHi: number,
  vLo: number,
  vHi: number,
  seedDerivatives: boolean,
  hess: FastHessianChannels | null = null
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
  fastRunTapeHullOnly = false;
  fastRunTapeClarkeFired = false;
  if (hess !== null) {
    fastRunTapeSecondOrderInvalid = false;
    fastRunTapeSecondOrderInvalidOp = -1;
  }
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
          fastRunTapeClarkeFired = true;
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
        // Skipped entirely on unseeded (pure value) passes — the derivative
        // channels are exactly zero, so the factor multiplies to zero anyway.
        if (!seedDerivatives) break;
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
        const aExact = fastIsPowerOfTwoPoint(aLo, aHi);
        const bExact = fastIsPowerOfTwoPoint(bLo, bHi);
        const valueExact = aExact || bExact;
        const m0 = aLo * bLo;
        const m1 = aLo * bHi;
        const m2 = aHi * bLo;
        const m3 = aHi * bHi;
        const mMin = Math.min(Math.min(m0, m1), Math.min(m2, m3));
        const mMax = Math.max(Math.max(m0, m1), Math.max(m2, m3));
        rLo = valueExact ? mMin : fastWidenLo(mMin);
        rHi = valueExact ? mMax : fastWidenHi(mMax);
        const p0 = duLo[a] * bLo;
        const p1 = duLo[a] * bHi;
        const p2 = duHi[a] * bLo;
        const p3 = duHi[a] * bHi;
        const p4 = aLo * duLo[b];
        const p5 = aLo * duHi[b];
        const p6 = aHi * duLo[b];
        const p7 = aHi * duHi[b];
        const duGroup1Lo = Math.min(Math.min(p0, p1), Math.min(p2, p3));
        const duGroup1Hi = Math.max(Math.max(p0, p1), Math.max(p2, p3));
        const duGroup2Lo = Math.min(Math.min(p4, p5), Math.min(p6, p7));
        const duGroup2Hi = Math.max(Math.max(p4, p5), Math.max(p6, p7));
        rDuLo = fastCheckedAddLo(
          bExact ? duGroup1Lo : fastWidenLo(duGroup1Lo),
          aExact ? duGroup2Lo : fastWidenLo(duGroup2Lo)
        );
        rDuHi = fastCheckedAddHi(
          bExact ? duGroup1Hi : fastWidenHi(duGroup1Hi),
          aExact ? duGroup2Hi : fastWidenHi(duGroup2Hi)
        );
        const q0 = dvLo[a] * bLo;
        const q1 = dvLo[a] * bHi;
        const q2 = dvHi[a] * bLo;
        const q3 = dvHi[a] * bHi;
        const q4 = aLo * dvLo[b];
        const q5 = aLo * dvHi[b];
        const q6 = aHi * dvLo[b];
        const q7 = aHi * dvHi[b];
        const dvGroup1Lo = Math.min(Math.min(q0, q1), Math.min(q2, q3));
        const dvGroup1Hi = Math.max(Math.max(q0, q1), Math.max(q2, q3));
        const dvGroup2Lo = Math.min(Math.min(q4, q5), Math.min(q6, q7));
        const dvGroup2Hi = Math.max(Math.max(q4, q5), Math.max(q6, q7));
        rDvLo = fastCheckedAddLo(
          bExact ? dvGroup1Lo : fastWidenLo(dvGroup1Lo),
          aExact ? dvGroup2Lo : fastWidenLo(dvGroup2Lo)
        );
        rDvHi = fastCheckedAddHi(
          bExact ? dvGroup1Hi : fastWidenHi(dvGroup1Hi),
          aExact ? dvGroup2Hi : fastWidenHi(dvGroup2Hi)
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
        const divisorExact = fastIsPowerOfTwoPoint(bLo, bHi);
        const dMin = Math.min(Math.min(d0, d1), Math.min(d2, d3));
        const dMax = Math.max(Math.max(d0, d1), Math.max(d2, d3));
        rLo = divisorExact ? dMin : fastWidenLo(dMin);
        rHi = divisorExact ? dMax : fastWidenHi(dMax);
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
          fastRunTapeClarkeFired = true;
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
          duLo[b] === 0 && duHi[b] === 0 && dvLo[b] === 0 && dvHi[b] === 0 && expHi - expLo < 1e-9;
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
          if (!seedDerivatives) break;
          if (!fastPowCornersRaw(baseLo, baseHi, Math.max(0, expLo - 1), Math.max(0, expHi - 1))) {
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
        if (!exponentIsConstant && expLo >= 1 && baseLo >= 0 && Number.isFinite(baseHi)) {
          // Nonnegative base with a VARYING exponent y >= 1 (e.g. a Lame
          // power morphing along v): pow stays monotone per argument, the
          // base-derivative factor y*a^(y-1) stays finite (y-1 >= 0), and
          // the exponent-derivative factor g = a^y*ln(a) is globally bounded
          // below by -1/(e*yLo) on a in [0,1] and corner-monotone on a >= 1.
          if (!fastPowCornersRaw(baseLo, baseHi, expLo, expHi)) {
            return recordFastRefusalBoolean('power-corners');
          }
          rLo = fastPowScratch[0];
          rHi = fastPowScratch[1];
          if (!fastPowCornersRaw(baseLo, baseHi, Math.max(0, expLo - 1), Math.max(0, expHi - 1))) {
            return recordFastRefusalBoolean('power-corners');
          }
          const bf0 = expLo * fastPowScratch[0];
          const bf1 = expLo * fastPowScratch[1];
          const bf2 = expHi * fastPowScratch[0];
          const bf3 = expHi * fastPowScratch[1];
          const baseFactorLo = fastWidenLo(Math.min(Math.min(bf0, bf1), Math.min(bf2, bf3)));
          const baseFactorHi = fastWidenHi(Math.max(Math.max(bf0, bf1), Math.max(bf2, bf3)));
          // g(a, y) = a^y * ln(a): for fixed y it decreases to a global
          // minimum at a* = e^(-1/y) and increases beyond; for fixed a it is
          // monotone in y. Cell-local bounds therefore come from the four
          // (a, y) corners plus g(a*, y) for each y endpoint whose a* lies
          // inside the cell's base interval — keeping the enclosure width
          // proportional to the cell, which preserves the screen's
          // second-order convergence (a constant-width global floor here
          // previously destroyed it and blew the work-cell budget).
          const gCandidates: number[] = [];
          const pushG = (baseValue: number, exponentValue: number): boolean => {
            if (baseValue <= 0) {
              gCandidates.push(0); // a -> 0 limit of a^y ln a for y >= 1
              return true;
            }
            const candidate = Math.pow(baseValue, exponentValue) * Math.log(baseValue);
            if (!Number.isFinite(candidate)) return false;
            gCandidates.push(candidate);
            return true;
          };
          let gOk = true;
          gOk = gOk && pushG(baseLo, expLo) && pushG(baseLo, expHi);
          gOk = gOk && pushG(baseHi, expLo) && pushG(baseHi, expHi);
          for (const exponentEnd of [expLo, expHi]) {
            const interior = Math.exp(-1 / exponentEnd);
            if (interior > baseLo && interior < baseHi) {
              // Widen the analytic minimum location outward via both y ends.
              gCandidates.push(-Math.exp(-1) / exponentEnd);
            }
          }
          if (!gOk) return recordFastRefusalBoolean('power-overflow');
          let gMin = gCandidates[0];
          let gMax = gCandidates[0];
          for (const candidate of gCandidates) {
            if (candidate < gMin) gMin = candidate;
            if (candidate > gMax) gMax = candidate;
          }
          const gLo = fastWidenLoLibm(gMin);
          const gHi = fastWidenHiLibm(gMax);
          const du0 = baseFactorLo * duLo[a];
          const du1 = baseFactorLo * duHi[a];
          const du2 = baseFactorHi * duLo[a];
          const du3 = baseFactorHi * duHi[a];
          const gu0 = gLo * duLo[b];
          const gu1 = gLo * duHi[b];
          const gu2 = gHi * duLo[b];
          const gu3 = gHi * duHi[b];
          rDuLo = fastWidenLo(
            Math.min(Math.min(du0, du1), Math.min(du2, du3)) +
              Math.min(Math.min(gu0, gu1), Math.min(gu2, gu3))
          );
          rDuHi = fastWidenHi(
            Math.max(Math.max(du0, du1), Math.max(du2, du3)) +
              Math.max(Math.max(gu0, gu1), Math.max(gu2, gu3))
          );
          const dv0 = baseFactorLo * dvLo[a];
          const dv1 = baseFactorLo * dvHi[a];
          const dv2 = baseFactorHi * dvLo[a];
          const dv3 = baseFactorHi * dvHi[a];
          const gv0 = gLo * dvLo[b];
          const gv1 = gLo * dvHi[b];
          const gv2 = gHi * dvLo[b];
          const gv3 = gHi * dvHi[b];
          rDvLo = fastWidenLo(
            Math.min(Math.min(dv0, dv1), Math.min(dv2, dv3)) +
              Math.min(Math.min(gv0, gv1), Math.min(gv2, gv3))
          );
          rDvHi = fastWidenHi(
            Math.max(Math.max(dv0, dv1), Math.max(dv2, dv3)) +
              Math.max(Math.max(gv0, gv1), Math.max(gv2, gv3))
          );
          break;
        }
        if (baseLo >= 0 && expLo > 0 && Number.isFinite(baseHi)) {
          // Nonnegative base with a positive exponent that neither >=1
          // branch accepted (typically a constant p < 1: a clamp-boundary
          // CUSP with unbounded derivative, e.g. max(0, 1-t)^(5/6) arch
          // outlines). The VALUE stays enclosed by monotone corners —
          // pow(0, p) = 0 is finite — but no mean-value form exists, so the
          // run downgrades to the value-hull residual and the
          // branch-and-bound refines the cusp neighborhood geometrically.
          if (!fastPowCornersRaw(baseLo, baseHi, expLo, expHi)) {
            return recordFastRefusalBoolean('power-corners');
          }
          rLo = fastPowScratch[0];
          rHi = fastPowScratch[1];
          fastRunTapeHullOnly = true;
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
      case FAST_OP_FLOOR:
      case FAST_OP_CEIL:
      case FAST_OP_ROUND: {
        const lo = valueLo[a];
        const hi = valueHi[a];
        if (ops[index] === FAST_OP_FLOOR && fastRunTapeBands !== null) {
          const band = fastRunTapeBands[index];
          if (band === band) {
            // Exact-band cell: floor is the band constant on the closed
            // band's left-closed branch (closed-graph semantics at the
            // right edge). Derivatives stay zero.
            rLo = band;
            rHi = band;
            break;
          }
        }
        // Monotone integer-valued maps: applying them to the enclosure
        // bounds encloses the truth exactly.
        if (ops[index] === FAST_OP_FLOOR) {
          rLo = Math.floor(lo);
          rHi = Math.floor(hi);
        } else if (ops[index] === FAST_OP_CEIL) {
          rLo = Math.ceil(lo);
          rHi = Math.ceil(hi);
        } else {
          rLo = roundTiesToEven(lo);
          rHi = roundTiesToEven(hi);
        }
        // Jump-free cell: the map is locally constant; derivative is zero.
        // Straddling cell: value hull stays sound, derivatives do not.
        if (rLo !== rHi) fastRunTapeHullOnly = true;
        break;
      }
      case FAST_OP_FRACT: {
        const lo = valueLo[a];
        const hi = valueHi[a];
        if (fastRunTapeBands !== null) {
          const band = fastRunTapeBands[index];
          if (band === band) {
            // Exact-band cell: fract(x) = x - k over the whole closed band.
            // The float argument enclosure may overhang the band by ulps;
            // the shift keeps a sound superset. Error-free-checked like
            // add/subtract, widened otherwise.
            const shiftLo = lo - band;
            const shiftHi = hi - band;
            rLo = shiftLo + band === lo ? shiftLo : fastWidenLo(shiftLo);
            rHi = shiftHi + band === hi ? shiftHi : fastWidenHi(shiftHi);
            rDuLo = duLo[a];
            rDuHi = duHi[a];
            rDvLo = dvLo[a];
            rDvHi = dvHi[a];
            break;
          }
        }
        const floorLo = Math.floor(lo);
        if (floorLo === Math.floor(hi)) {
          // fract(x) = x - k on the whole cell: exact shift, smooth.
          rLo = lo - floorLo;
          rHi = hi - floorLo;
          rDuLo = duLo[a];
          rDuHi = duHi[a];
          rDvLo = dvLo[a];
          rDvHi = dvHi[a];
        } else {
          rLo = 0;
          rHi = 1;
          fastRunTapeHullOnly = true;
        }
        break;
      }
      case FAST_OP_SIGN: {
        if (fastRunTapeBands !== null) {
          const band = fastRunTapeBands[index];
          if (band === band) {
            // Exact-band cell: the argument range provably sits on one
            // closed side of zero; sign is that side's closure constant.
            // Derivatives stay zero.
            rLo = band;
            rHi = band;
            break;
          }
        }
        const lo = valueLo[a];
        const hi = valueHi[a];
        if (lo > 0) {
          rLo = 1;
          rHi = 1;
        } else if (hi < 0) {
          rLo = -1;
          rHi = -1;
        } else {
          rLo = -1;
          rHi = 1;
          fastRunTapeHullOnly = true;
        }
        break;
      }
      case FAST_OP_STEP: {
        if (fastRunTapeBands !== null) {
          const band = fastRunTapeBands[index];
          if (band === band) {
            // Exact-band cell: the combined argument x - edge provably sits
            // on one closed side of zero; step is that side's closure
            // constant (the right-closed branch carries the true equality
            // value). Derivatives stay zero.
            rLo = band;
            rHi = band;
            break;
          }
        }
        // step(edge, x) is one exactly when edge <= x.
        const edgeLo = valueLo[a];
        const edgeHi = valueHi[a];
        const xLo = valueLo[b];
        const xHi = valueHi[b];
        if (edgeHi <= xLo) {
          rLo = 1;
          rHi = 1;
        } else if (edgeLo > xHi) {
          rLo = 0;
          rHi = 0;
        } else {
          rLo = 0;
          rHi = 1;
          fastRunTapeHullOnly = true;
        }
        break;
      }
      case FAST_OP_ATAN2: {
        // atan2(y = left, x = right): continuous away from the branch cut
        // (y = 0, x <= 0); over a rectangle in the continuous region the
        // angle is monotone along every edge, so corner values bound it.
        const yLo = valueLo[a];
        const yHi = valueHi[a];
        const xLo = valueLo[b];
        const xHi = valueHi[b];
        if (yLo <= 0 && yHi >= 0 && xLo <= 0) {
          rLo = -FAST_PI_HI;
          rHi = FAST_PI_HI;
          fastRunTapeHullOnly = true;
          break;
        }
        const c0 = Math.atan2(yLo, xLo);
        const c1 = Math.atan2(yLo, xHi);
        const c2 = Math.atan2(yHi, xLo);
        const c3 = Math.atan2(yHi, xHi);
        rLo = fastWidenLoLibm(Math.min(Math.min(c0, c1), Math.min(c2, c3)));
        rHi = fastWidenHiLibm(Math.max(Math.max(c0, c1), Math.max(c2, c3)));
        // d(atan2) = (x*dy - y*dx) / (x^2 + y^2); the guarded region
        // excludes the origin so the denominator is strictly positive.
        const sq0 = xLo * xLo;
        const sq1 = xHi * xHi;
        const sq2 = yLo * yLo;
        const sq3 = yHi * yHi;
        const xSqLo = xLo <= 0 && xHi >= 0 ? 0 : fastWidenLo(Math.min(sq0, sq1));
        const xSqHi = fastWidenHi(Math.max(sq0, sq1));
        const ySqLo = yLo <= 0 && yHi >= 0 ? 0 : fastWidenLo(Math.min(sq2, sq3));
        const ySqHi = fastWidenHi(Math.max(sq2, sq3));
        const rSqLo = fastCheckedAddLo(xSqLo, ySqLo);
        const rSqHi = fastCheckedAddHi(xSqHi, ySqHi);
        if (!(rSqLo > 0)) return recordFastRefusalBoolean('atan2-origin');
        const n0 = xLo * duLo[a];
        const n1 = xLo * duHi[a];
        const n2 = xHi * duLo[a];
        const n3 = xHi * duHi[a];
        const m0 = yLo * duLo[b];
        const m1 = yLo * duHi[b];
        const m2 = yHi * duLo[b];
        const m3 = yHi * duHi[b];
        const numDuLo =
          Math.min(Math.min(n0, n1), Math.min(n2, n3)) -
          Math.max(Math.max(m0, m1), Math.max(m2, m3));
        const numDuHi =
          Math.max(Math.max(n0, n1), Math.max(n2, n3)) -
          Math.min(Math.min(m0, m1), Math.min(m2, m3));
        const e0 = numDuLo / rSqLo;
        const e1 = numDuLo / rSqHi;
        const e2 = numDuHi / rSqLo;
        const e3 = numDuHi / rSqHi;
        rDuLo = fastWidenLo(Math.min(Math.min(e0, e1), Math.min(e2, e3)));
        rDuHi = fastWidenHi(Math.max(Math.max(e0, e1), Math.max(e2, e3)));
        const p0 = xLo * dvLo[a];
        const p1 = xLo * dvHi[a];
        const p2 = xHi * dvLo[a];
        const p3 = xHi * dvHi[a];
        const q0 = yLo * dvLo[b];
        const q1 = yLo * dvHi[b];
        const q2 = yHi * dvLo[b];
        const q3 = yHi * dvHi[b];
        const numDvLo =
          Math.min(Math.min(p0, p1), Math.min(p2, p3)) -
          Math.max(Math.max(q0, q1), Math.max(q2, q3));
        const numDvHi =
          Math.max(Math.max(p0, p1), Math.max(p2, p3)) -
          Math.min(Math.min(q0, q1), Math.min(q2, q3));
        const f0 = numDvLo / rSqLo;
        const f1 = numDvLo / rSqHi;
        const f2 = numDvHi / rSqLo;
        const f3 = numDvHi / rSqHi;
        rDvLo = fastWidenLo(Math.min(Math.min(f0, f1), Math.min(f2, f3)));
        rDvHi = fastWidenHi(Math.max(Math.max(f0, f1), Math.max(f2, f3)));
        break;
      }
      case FAST_OP_PCG2D_X:
      case FAST_OP_PCG2D_Y: {
        const aLo = valueLo[a];
        const bLo = valueLo[b];
        if (
          aLo === valueHi[a] &&
          bLo === valueHi[b] &&
          Number.isInteger(aLo) &&
          Number.isInteger(bLo)
        ) {
          // Compiler-proven integer operands resolved to single integers:
          // the hash is an exact dyadic constant ((hash >>> 8) * 2^-24).
          try {
            const pair = integerPcg2dUnitHash(aLo, bLo);
            rLo = ops[index] === FAST_OP_PCG2D_X ? pair[0] : pair[1];
            rHi = rLo;
            break;
          } catch {
            // Outside the hash coordinate envelope: sound unit hull below.
          }
        }
        rLo = 0;
        rHi = 1;
        fastRunTapeHullOnly = true;
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
    if (hess !== null) {
      // Per-op second-derivative (Hessian-interval) rules. Each unary rule is
      // the chain rule y'' = f''(g)·g'⊗g' + f'(g)·g''; leaves are constant or
      // linear (zero). Operations without a sound bounded second-derivative rule
      // over this cell — every op not handled here yet, plus straddling kinks
      // and jumps handled inline above — mark the run second-order-invalid so
      // the caller falls back to the first-order mean-value form.
      const wasInvalid = fastRunTapeSecondOrderInvalid;
      let hDuuLo = 0;
      let hDuuHi = 0;
      let hDuvLo = 0;
      let hDuvHi = 0;
      let hDvvLo = 0;
      let hDvvHi = 0;
      switch (ops[index]) {
        case FAST_OP_CONST:
        case FAST_OP_PI:
        case FAST_OP_U:
        case FAST_OP_V:
          break; // constant or linear leaf: all second derivatives are zero
        case FAST_OP_SQUARE: {
          // y = g^2 => f'(g) = 2g, f''(g) = 2 (constant).
          const gLo = valueLo[a];
          const gHi = valueHi[a];
          const guLo = duLo[a];
          const guHi = duHi[a];
          const gvLo = dvLo[a];
          const gvHi = dvHi[a];
          const g2Lo = 2 * gLo; // multiply by two is an exact exponent shift
          const g2Hi = 2 * gHi;
          // yuu = 2*gu^2 + 2g*guu
          hDuuLo = fastCheckedAddLo(
            2 * fastIntSquareLo(guLo, guHi),
            fastIntProdLo(g2Lo, g2Hi, hess.duuLo[a], hess.duuHi[a])
          );
          hDuuHi = fastCheckedAddHi(
            2 * fastIntSquareHi(guLo, guHi),
            fastIntProdHi(g2Lo, g2Hi, hess.duuLo[a], hess.duuHi[a])
          );
          // yuv = 2*gu*gv + 2g*guv
          hDuvLo = fastCheckedAddLo(
            2 * fastIntProdLo(guLo, guHi, gvLo, gvHi),
            fastIntProdLo(g2Lo, g2Hi, hess.duvLo[a], hess.duvHi[a])
          );
          hDuvHi = fastCheckedAddHi(
            2 * fastIntProdHi(guLo, guHi, gvLo, gvHi),
            fastIntProdHi(g2Lo, g2Hi, hess.duvLo[a], hess.duvHi[a])
          );
          // yvv = 2*gv^2 + 2g*gvv
          hDvvLo = fastCheckedAddLo(
            2 * fastIntSquareLo(gvLo, gvHi),
            fastIntProdLo(g2Lo, g2Hi, hess.dvvLo[a], hess.dvvHi[a])
          );
          hDvvHi = fastCheckedAddHi(
            2 * fastIntSquareHi(gvLo, gvHi),
            fastIntProdHi(g2Lo, g2Hi, hess.dvvLo[a], hess.dvvHi[a])
          );
          break;
        }
        case FAST_OP_NEG:
          // y = -g: every second derivative negates.
          hDuuLo = -hess.duuHi[a];
          hDuuHi = -hess.duuLo[a];
          hDuvLo = -hess.duvHi[a];
          hDuvHi = -hess.duvLo[a];
          hDvvLo = -hess.dvvHi[a];
          hDvvHi = -hess.dvvLo[a];
          break;
        case FAST_OP_ADD:
          // y = a + b: second derivatives add component-wise.
          hDuuLo = fastCheckedAddLo(hess.duuLo[a], hess.duuLo[b]);
          hDuuHi = fastCheckedAddHi(hess.duuHi[a], hess.duuHi[b]);
          hDuvLo = fastCheckedAddLo(hess.duvLo[a], hess.duvLo[b]);
          hDuvHi = fastCheckedAddHi(hess.duvHi[a], hess.duvHi[b]);
          hDvvLo = fastCheckedAddLo(hess.dvvLo[a], hess.dvvLo[b]);
          hDvvHi = fastCheckedAddHi(hess.dvvHi[a], hess.dvvHi[b]);
          break;
        case FAST_OP_SUB:
          // y = a - b: subtract b's second derivatives component-wise.
          hDuuLo = fastCheckedAddLo(hess.duuLo[a], -hess.duuHi[b]);
          hDuuHi = fastCheckedAddHi(hess.duuHi[a], -hess.duuLo[b]);
          hDuvLo = fastCheckedAddLo(hess.duvLo[a], -hess.duvHi[b]);
          hDuvHi = fastCheckedAddHi(hess.duvHi[a], -hess.duvLo[b]);
          hDvvLo = fastCheckedAddLo(hess.dvvLo[a], -hess.dvvHi[b]);
          hDvvHi = fastCheckedAddHi(hess.dvvHi[a], -hess.dvvLo[b]);
          break;
        case FAST_OP_MUL: {
          // y = a*b. Product rule for the Hessian:
          //   yuu = auu*b + 2*au*bu + a*buu
          //   yuv = auv*b + au*bv + av*bu + a*buv
          //   yvv = avv*b + 2*av*bv + a*bvv
          const aVLo = valueLo[a];
          const aVHi = valueHi[a];
          const bVLo = valueLo[b];
          const bVHi = valueHi[b];
          const aDuLo = duLo[a];
          const aDuHi = duHi[a];
          const aDvLo = dvLo[a];
          const aDvHi = dvHi[a];
          const bDuLo = duLo[b];
          const bDuHi = duHi[b];
          const bDvLo = dvLo[b];
          const bDvHi = dvHi[b];
          // yuu = auu*b + 2*(au*bu) + a*buu
          hDuuLo = fastCheckedAddLo(
            fastCheckedAddLo(
              fastIntProdLo(hess.duuLo[a], hess.duuHi[a], bVLo, bVHi),
              2 * fastIntProdLo(aDuLo, aDuHi, bDuLo, bDuHi)
            ),
            fastIntProdLo(aVLo, aVHi, hess.duuLo[b], hess.duuHi[b])
          );
          hDuuHi = fastCheckedAddHi(
            fastCheckedAddHi(
              fastIntProdHi(hess.duuLo[a], hess.duuHi[a], bVLo, bVHi),
              2 * fastIntProdHi(aDuLo, aDuHi, bDuLo, bDuHi)
            ),
            fastIntProdHi(aVLo, aVHi, hess.duuLo[b], hess.duuHi[b])
          );
          // yuv = auv*b + au*bv + av*bu + a*buv
          hDuvLo = fastCheckedAddLo(
            fastCheckedAddLo(
              fastIntProdLo(hess.duvLo[a], hess.duvHi[a], bVLo, bVHi),
              fastIntProdLo(aDuLo, aDuHi, bDvLo, bDvHi)
            ),
            fastCheckedAddLo(
              fastIntProdLo(aDvLo, aDvHi, bDuLo, bDuHi),
              fastIntProdLo(aVLo, aVHi, hess.duvLo[b], hess.duvHi[b])
            )
          );
          hDuvHi = fastCheckedAddHi(
            fastCheckedAddHi(
              fastIntProdHi(hess.duvLo[a], hess.duvHi[a], bVLo, bVHi),
              fastIntProdHi(aDuLo, aDuHi, bDvLo, bDvHi)
            ),
            fastCheckedAddHi(
              fastIntProdHi(aDvLo, aDvHi, bDuLo, bDuHi),
              fastIntProdHi(aVLo, aVHi, hess.duvLo[b], hess.duvHi[b])
            )
          );
          // yvv = avv*b + 2*(av*bv) + a*bvv
          hDvvLo = fastCheckedAddLo(
            fastCheckedAddLo(
              fastIntProdLo(hess.dvvLo[a], hess.dvvHi[a], bVLo, bVHi),
              2 * fastIntProdLo(aDvLo, aDvHi, bDvLo, bDvHi)
            ),
            fastIntProdLo(aVLo, aVHi, hess.dvvLo[b], hess.dvvHi[b])
          );
          hDvvHi = fastCheckedAddHi(
            fastCheckedAddHi(
              fastIntProdHi(hess.dvvLo[a], hess.dvvHi[a], bVLo, bVHi),
              2 * fastIntProdHi(aDvLo, aDvHi, bDvLo, bDvHi)
            ),
            fastIntProdHi(aVLo, aVHi, hess.dvvLo[b], hess.dvvHi[b])
          );
          break;
        }
        case FAST_OP_SIN:
        case FAST_OP_COS: {
          // f''(g) = -f(g) (the negated node value) for both sin and cos; f'(g)
          // = cos(g) for sin, -sin(g) for cos, from the sound trig range.
          const isSin = ops[index] === FAST_OP_SIN;
          if (!fastTrigRangeRaw(valueLo[a], valueHi[a], !isSin)) {
            fastRunTapeSecondOrderInvalid = true;
            break;
          }
          let fpLo = fastTrigScratch[0];
          let fpHi = fastTrigScratch[1];
          if (!isSin) {
            const swap = fpLo;
            fpLo = -fpHi;
            fpHi = -swap;
          }
          fastUnaryChainHessianInto(
            fpLo,
            fpHi,
            -valueHi[index],
            -valueLo[index],
            duLo[a],
            duHi[a],
            dvLo[a],
            dvHi[a],
            hess.duuLo[a],
            hess.duuHi[a],
            hess.duvLo[a],
            hess.duvHi[a],
            hess.dvvLo[a],
            hess.dvvHi[a]
          );
          hDuuLo = fastUnaryHessScratch[0];
          hDuuHi = fastUnaryHessScratch[1];
          hDuvLo = fastUnaryHessScratch[2];
          hDuvHi = fastUnaryHessScratch[3];
          hDvvLo = fastUnaryHessScratch[4];
          hDvvHi = fastUnaryHessScratch[5];
          break;
        }
        case FAST_OP_SQRT: {
          // y = sqrt(g), g > 0: f'(g) = 1/(2 sqrt g), f''(g) = -1/(4 g^(3/2)).
          const gLo = valueLo[a];
          const gHi = valueHi[a];
          if (!(gLo > 0)) {
            fastRunTapeSecondOrderInvalid = true;
            break;
          }
          const rootLo = fastWidenLo(Math.sqrt(gLo));
          const rootHi = fastWidenHi(Math.sqrt(gHi));
          const fpLo = fastWidenLo(1 / (2 * rootHi));
          const fpHi = fastWidenHi(1 / (2 * rootLo));
          // -1/(4 g^(3/2)) is negative and increasing in g (most negative at gLo).
          const fppLo = -fastWidenHi(1 / (4 * gLo * rootLo));
          const fppHi = -fastWidenLo(1 / (4 * gHi * rootHi));
          fastUnaryChainHessianInto(
            fpLo,
            fpHi,
            fppLo,
            fppHi,
            duLo[a],
            duHi[a],
            dvLo[a],
            dvHi[a],
            hess.duuLo[a],
            hess.duuHi[a],
            hess.duvLo[a],
            hess.duvHi[a],
            hess.dvvLo[a],
            hess.dvvHi[a]
          );
          hDuuLo = fastUnaryHessScratch[0];
          hDuuHi = fastUnaryHessScratch[1];
          hDuvLo = fastUnaryHessScratch[2];
          hDuvHi = fastUnaryHessScratch[3];
          hDvvLo = fastUnaryHessScratch[4];
          hDvvHi = fastUnaryHessScratch[5];
          break;
        }
        case FAST_OP_EXP: {
          // y = exp(g): f'(g) = f''(g) = e^g = the node value.
          const fLo = valueLo[index];
          const fHi = valueHi[index];
          fastUnaryChainHessianInto(
            fLo,
            fHi,
            fLo,
            fHi,
            duLo[a],
            duHi[a],
            dvLo[a],
            dvHi[a],
            hess.duuLo[a],
            hess.duuHi[a],
            hess.duvLo[a],
            hess.duvHi[a],
            hess.dvvLo[a],
            hess.dvvHi[a]
          );
          hDuuLo = fastUnaryHessScratch[0];
          hDuuHi = fastUnaryHessScratch[1];
          hDuvLo = fastUnaryHessScratch[2];
          hDuvHi = fastUnaryHessScratch[3];
          hDvvLo = fastUnaryHessScratch[4];
          hDvvHi = fastUnaryHessScratch[5];
          break;
        }
        case FAST_OP_LN: {
          // y = ln(g), g > 0: f'(g) = 1/g, f''(g) = -1/g^2.
          const gLo = valueLo[a];
          const gHi = valueHi[a];
          if (!(gLo > 0)) {
            fastRunTapeSecondOrderInvalid = true;
            break;
          }
          const fpLo = fastWidenLo(1 / gHi);
          const fpHi = fastWidenHi(1 / gLo);
          const fppLo = -fastWidenHi(1 / (gLo * gLo));
          const fppHi = -fastWidenLo(1 / (gHi * gHi));
          fastUnaryChainHessianInto(
            fpLo,
            fpHi,
            fppLo,
            fppHi,
            duLo[a],
            duHi[a],
            dvLo[a],
            dvHi[a],
            hess.duuLo[a],
            hess.duuHi[a],
            hess.duvLo[a],
            hess.duvHi[a],
            hess.dvvLo[a],
            hess.dvvHi[a]
          );
          hDuuLo = fastUnaryHessScratch[0];
          hDuuHi = fastUnaryHessScratch[1];
          hDuvLo = fastUnaryHessScratch[2];
          hDuvHi = fastUnaryHessScratch[3];
          hDvvLo = fastUnaryHessScratch[4];
          hDvvHi = fastUnaryHessScratch[5];
          break;
        }
        case FAST_OP_DIV: {
          // y = a/b (b guarded non-straddling by the value pass). Quotient rule:
          //   y_ij = a_ij/b - (a_i b_j + a_j b_i)/b^2 - a b_ij/b^2 + 2 a b_i b_j/b^3.
          const bLo = valueLo[b];
          const bHi = valueHi[b];
          if (bLo <= 0 && bHi >= 0) {
            fastRunTapeSecondOrderInvalid = true;
            break;
          }
          const aVLo = valueLo[a];
          const aVHi = valueHi[a];
          const aDuLo = duLo[a];
          const aDuHi = duHi[a];
          const aDvLo = dvLo[a];
          const aDvHi = dvHi[a];
          const bDuLo = duLo[b];
          const bDuHi = duHi[b];
          const bDvLo = dvLo[b];
          const bDvHi = dvHi[b];
          // 1/b, 1/b^2, 1/b^3 as outward intervals (b is single-signed here).
          const invBLo = fastWidenLo(1 / bHi);
          const invBHi = fastWidenHi(1 / bLo);
          const invB2Lo = fastIntSquareLo(invBLo, invBHi);
          const invB2Hi = fastIntSquareHi(invBLo, invBHi);
          const invB3Lo = fastIntProdLo(invB2Lo, invB2Hi, invBLo, invBHi);
          const invB3Hi = fastIntProdHi(invB2Lo, invB2Hi, invBLo, invBHi);
          const aInvB2Lo = fastIntProdLo(aVLo, aVHi, invB2Lo, invB2Hi);
          const aInvB2Hi = fastIntProdHi(aVLo, aVHi, invB2Lo, invB2Hi);
          const aInvB3x2Lo = 2 * fastIntProdLo(aVLo, aVHi, invB3Lo, invB3Hi);
          const aInvB3x2Hi = 2 * fastIntProdHi(aVLo, aVHi, invB3Lo, invB3Hi);
          // uu
          {
            const t1Lo = fastIntProdLo(hess.duuLo[a], hess.duuHi[a], invBLo, invBHi);
            const t1Hi = fastIntProdHi(hess.duuLo[a], hess.duuHi[a], invBLo, invBHi);
            const crossLo = 2 * fastIntProdLo(aDuLo, aDuHi, bDuLo, bDuHi);
            const crossHi = 2 * fastIntProdHi(aDuLo, aDuHi, bDuLo, bDuHi);
            const t2Lo = -fastIntProdHi(crossLo, crossHi, invB2Lo, invB2Hi);
            const t2Hi = -fastIntProdLo(crossLo, crossHi, invB2Lo, invB2Hi);
            const t3Lo = -fastIntProdHi(aInvB2Lo, aInvB2Hi, hess.duuLo[b], hess.duuHi[b]);
            const t3Hi = -fastIntProdLo(aInvB2Lo, aInvB2Hi, hess.duuLo[b], hess.duuHi[b]);
            const bu2Lo = fastIntSquareLo(bDuLo, bDuHi);
            const bu2Hi = fastIntSquareHi(bDuLo, bDuHi);
            const t4Lo = fastIntProdLo(aInvB3x2Lo, aInvB3x2Hi, bu2Lo, bu2Hi);
            const t4Hi = fastIntProdHi(aInvB3x2Lo, aInvB3x2Hi, bu2Lo, bu2Hi);
            hDuuLo = fastCheckedAddLo(fastCheckedAddLo(t1Lo, t2Lo), fastCheckedAddLo(t3Lo, t4Lo));
            hDuuHi = fastCheckedAddHi(fastCheckedAddHi(t1Hi, t2Hi), fastCheckedAddHi(t3Hi, t4Hi));
          }
          // uv
          {
            const t1Lo = fastIntProdLo(hess.duvLo[a], hess.duvHi[a], invBLo, invBHi);
            const t1Hi = fastIntProdHi(hess.duvLo[a], hess.duvHi[a], invBLo, invBHi);
            const c1Lo = fastIntProdLo(aDuLo, aDuHi, bDvLo, bDvHi);
            const c1Hi = fastIntProdHi(aDuLo, aDuHi, bDvLo, bDvHi);
            const c2Lo = fastIntProdLo(aDvLo, aDvHi, bDuLo, bDuHi);
            const c2Hi = fastIntProdHi(aDvLo, aDvHi, bDuLo, bDuHi);
            const crossLo = fastCheckedAddLo(c1Lo, c2Lo);
            const crossHi = fastCheckedAddHi(c1Hi, c2Hi);
            const t2Lo = -fastIntProdHi(crossLo, crossHi, invB2Lo, invB2Hi);
            const t2Hi = -fastIntProdLo(crossLo, crossHi, invB2Lo, invB2Hi);
            const t3Lo = -fastIntProdHi(aInvB2Lo, aInvB2Hi, hess.duvLo[b], hess.duvHi[b]);
            const t3Hi = -fastIntProdLo(aInvB2Lo, aInvB2Hi, hess.duvLo[b], hess.duvHi[b]);
            const bubvLo = fastIntProdLo(bDuLo, bDuHi, bDvLo, bDvHi);
            const bubvHi = fastIntProdHi(bDuLo, bDuHi, bDvLo, bDvHi);
            const t4Lo = fastIntProdLo(aInvB3x2Lo, aInvB3x2Hi, bubvLo, bubvHi);
            const t4Hi = fastIntProdHi(aInvB3x2Lo, aInvB3x2Hi, bubvLo, bubvHi);
            hDuvLo = fastCheckedAddLo(fastCheckedAddLo(t1Lo, t2Lo), fastCheckedAddLo(t3Lo, t4Lo));
            hDuvHi = fastCheckedAddHi(fastCheckedAddHi(t1Hi, t2Hi), fastCheckedAddHi(t3Hi, t4Hi));
          }
          // vv
          {
            const t1Lo = fastIntProdLo(hess.dvvLo[a], hess.dvvHi[a], invBLo, invBHi);
            const t1Hi = fastIntProdHi(hess.dvvLo[a], hess.dvvHi[a], invBLo, invBHi);
            const crossLo = 2 * fastIntProdLo(aDvLo, aDvHi, bDvLo, bDvHi);
            const crossHi = 2 * fastIntProdHi(aDvLo, aDvHi, bDvLo, bDvHi);
            const t2Lo = -fastIntProdHi(crossLo, crossHi, invB2Lo, invB2Hi);
            const t2Hi = -fastIntProdLo(crossLo, crossHi, invB2Lo, invB2Hi);
            const t3Lo = -fastIntProdHi(aInvB2Lo, aInvB2Hi, hess.dvvLo[b], hess.dvvHi[b]);
            const t3Hi = -fastIntProdLo(aInvB2Lo, aInvB2Hi, hess.dvvLo[b], hess.dvvHi[b]);
            const bv2Lo = fastIntSquareLo(bDvLo, bDvHi);
            const bv2Hi = fastIntSquareHi(bDvLo, bDvHi);
            const t4Lo = fastIntProdLo(aInvB3x2Lo, aInvB3x2Hi, bv2Lo, bv2Hi);
            const t4Hi = fastIntProdHi(aInvB3x2Lo, aInvB3x2Hi, bv2Lo, bv2Hi);
            hDvvLo = fastCheckedAddLo(fastCheckedAddLo(t1Lo, t2Lo), fastCheckedAddLo(t3Lo, t4Lo));
            hDvvHi = fastCheckedAddHi(fastCheckedAddHi(t1Hi, t2Hi), fastCheckedAddHi(t3Hi, t4Hi));
          }
          break;
        }
        case FAST_OP_POW: {
          // Constant exponent p, nonnegative base: y = a^p is unary in a, with
          // f'(a) = p a^(p-1), f''(a) = p(p-1) a^(p-2). p = 1 is linear (f'' = 0).
          // f'' stays finite as a -> 0 when p >= 2; for 1 < p < 2 it blows up, so
          // a base that can touch zero there falls back. A varying exponent falls
          // back. (fastPowCornersRaw also returns false on any nonfinite corner.)
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
          if (!exponentIsConstant || !(baseLo >= 0) || !Number.isFinite(baseHi)) {
            fastRunTapeSecondOrderInvalid = true;
            break;
          }
          let powFpLo = 1;
          let powFpHi = 1;
          let powFppLo = 0;
          let powFppHi = 0;
          if (Math.abs(expLo - 1) < 1e-9 && Math.abs(expHi - 1) < 1e-9) {
            // y = a: f' = 1, f'' = 0 (values above are already correct).
          } else {
            if (baseLo <= 0 && expLo < 2) {
              // p(p-1) a^(p-2) is unbounded as a -> 0 for 1 < p < 2.
              fastRunTapeSecondOrderInvalid = true;
              break;
            }
            if (!fastPowCornersRaw(baseLo, baseHi, expLo - 1, expHi - 1)) {
              fastRunTapeSecondOrderInvalid = true;
              break;
            }
            const apm1Lo = fastPowScratch[0];
            const apm1Hi = fastPowScratch[1];
            if (!fastPowCornersRaw(baseLo, baseHi, expLo - 2, expHi - 2)) {
              fastRunTapeSecondOrderInvalid = true;
              break;
            }
            const apm2Lo = fastPowScratch[0];
            const apm2Hi = fastPowScratch[1];
            // f'(a) = p a^(p-1)
            powFpLo = fastIntProdLo(expLo, expHi, apm1Lo, apm1Hi);
            powFpHi = fastIntProdHi(expLo, expHi, apm1Lo, apm1Hi);
            // f''(a) = p(p-1) a^(p-2)
            const pp1Lo = fastIntProdLo(expLo, expHi, expLo - 1, expHi - 1);
            const pp1Hi = fastIntProdHi(expLo, expHi, expLo - 1, expHi - 1);
            powFppLo = fastIntProdLo(pp1Lo, pp1Hi, apm2Lo, apm2Hi);
            powFppHi = fastIntProdHi(pp1Lo, pp1Hi, apm2Lo, apm2Hi);
          }
          fastUnaryChainHessianInto(
            powFpLo,
            powFpHi,
            powFppLo,
            powFppHi,
            duLo[a],
            duHi[a],
            dvLo[a],
            dvHi[a],
            hess.duuLo[a],
            hess.duuHi[a],
            hess.duvLo[a],
            hess.duvHi[a],
            hess.dvvLo[a],
            hess.dvvHi[a]
          );
          hDuuLo = fastUnaryHessScratch[0];
          hDuuHi = fastUnaryHessScratch[1];
          hDuvLo = fastUnaryHessScratch[2];
          hDuvHi = fastUnaryHessScratch[3];
          hDvvLo = fastUnaryHessScratch[4];
          hDvvHi = fastUnaryHessScratch[5];
          break;
        }
        case FAST_OP_ABS: {
          // A provably one-sided abs is the smooth +g or -g branch over the whole
          // cell (C2), so its Hessian is the argument's, possibly negated. A cell
          // straddling zero has a kink (no bounded second derivative) and falls
          // back. The branch test matches the value/first-derivative pass exactly.
          const lo = valueLo[a];
          const hi = valueHi[a];
          if (lo >= 0) {
            hDuuLo = hess.duuLo[a];
            hDuuHi = hess.duuHi[a];
            hDuvLo = hess.duvLo[a];
            hDuvHi = hess.duvHi[a];
            hDvvLo = hess.dvvLo[a];
            hDvvHi = hess.dvvHi[a];
          } else if (hi <= 0) {
            hDuuLo = -hess.duuHi[a];
            hDuuHi = -hess.duuLo[a];
            hDuvLo = -hess.duvHi[a];
            hDuvHi = -hess.duvLo[a];
            hDvvLo = -hess.dvvHi[a];
            hDvvHi = -hess.dvvLo[a];
          } else {
            fastRunTapeSecondOrderInvalid = true;
          }
          break;
        }
        case FAST_OP_MIN:
        case FAST_OP_MAX: {
          // A provably one-sided min/max is exactly the selected argument over the
          // whole cell, so its Hessian is that argument's. An overlapping cell may
          // contain a kink and falls back. Branch test matches the value pass.
          const takeMin = ops[index] === FAST_OP_MIN;
          const aLo = valueLo[a];
          const aHi = valueHi[a];
          const bLo = valueLo[b];
          const bHi = valueHi[b];
          const leftOnly = takeMin ? aHi < bLo : aLo > bHi;
          const rightOnly = takeMin ? bHi < aLo : bLo > aHi;
          if (leftOnly) {
            hDuuLo = hess.duuLo[a];
            hDuuHi = hess.duuHi[a];
            hDuvLo = hess.duvLo[a];
            hDuvHi = hess.duvHi[a];
            hDvvLo = hess.dvvLo[a];
            hDvvHi = hess.dvvHi[a];
          } else if (rightOnly) {
            hDuuLo = hess.duuLo[b];
            hDuuHi = hess.duuHi[b];
            hDuvLo = hess.duvLo[b];
            hDuvHi = hess.duvHi[b];
            hDvvLo = hess.dvvLo[b];
            hDvvHi = hess.dvvHi[b];
          } else {
            fastRunTapeSecondOrderInvalid = true;
          }
          break;
        }
        default:
          fastRunTapeSecondOrderInvalid = true;
      }
      if (
        !(hDuuLo <= hDuuHi) ||
        !Number.isFinite(hDuuLo) ||
        !Number.isFinite(hDuuHi) ||
        !(hDuvLo <= hDuvHi) ||
        !Number.isFinite(hDuvLo) ||
        !Number.isFinite(hDuvHi) ||
        !(hDvvLo <= hDvvHi) ||
        !Number.isFinite(hDvvLo) ||
        !Number.isFinite(hDvvHi)
      ) {
        fastRunTapeSecondOrderInvalid = true;
        hDuuLo = 0;
        hDuuHi = 0;
        hDuvLo = 0;
        hDuvHi = 0;
        hDvvLo = 0;
        hDvvHi = 0;
      }
      if (!wasInvalid && fastRunTapeSecondOrderInvalid && fastRunTapeSecondOrderInvalidOp < 0) {
        fastRunTapeSecondOrderInvalidOp = ops[index];
      }
      hess.duuLo[index] = hDuuLo;
      hess.duuHi[index] = hDuuHi;
      hess.duvLo[index] = hDuvLo;
      hess.duvHi[index] = hDuvHi;
      hess.dvvLo[index] = hDvvLo;
      hess.dvvHi[index] = hDvvHi;
    }
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

/** Fast-channel mirror of requestOddFactor: null (screen unavailable) on doubt. */
function fastCellOddFactor(cell: ValidatedResidualEnclosureRequest['cell']): number | null {
  const raw = (cell as { readonly oddDenominatorFactor?: unknown }).oddDenominatorFactor;
  if (raw === undefined) return 1;
  if (typeof raw !== 'string' || raw.length > 16 || !INTEGER_RE.test(raw)) return null;
  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 3 ||
    parsed % 2 !== 1 ||
    parsed > 4_503_599_627_370_495
  ) {
    return null;
  }
  return parsed;
}

/**
 * Cell coordinate numerator / (oddFactor * 2^fractionBits) as an outward
 * float64 interval. For an ODD factor the quotient is exactly representable
 * iff the factor divides the numerator (an odd q dividing a dyadic k/2^j
 * forces q | k), and `%` on exact integer operands <= 2^53 is exact — so the
 * exactness test is itself exact, and coordinates like 0 and 1 stay EXACT
 * points (power/sqrt domain guards remain decidable at patch edges). All
 * other coordinates get correctly-rounded division (<= 0.5 ulp) followed by
 * an exact power-of-two scale, covered by pure relative widening.
 */
function fastCellCoordinate(
  numerator: string,
  fractionBits: number,
  oddFactor: number
): OutwardInterval | null {
  if (oddFactor === 1) return fastDyadic(numerator, fractionBits);
  if (!INTEGER_RE.test(numerator) || numerator.length > 64) return null;
  const parsed = Number(numerator);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 9_007_199_254_740_992) return null;
  const value = (parsed / oddFactor) * 2 ** -fractionBits;
  if (!Number.isFinite(value)) return null;
  if (parsed % oddFactor === 0 && fractionBits <= 900) {
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

  const oddFactor = fastCellOddFactor(cell);
  if (oddFactor === null) return null;

  const cellU: OutwardInterval[] = [];
  const cellV: OutwardInterval[] = [];
  for (let vertex = 0; vertex < 3; vertex += 1) {
    const u = fastCellCoordinate(cell.vertices[vertex].uNumerator, fractionBits, oddFactor);
    const v = fastCellCoordinate(cell.vertices[vertex].vNumerator, fractionBits, oddFactor);
    if (u === null || v === null) return null;
    cellU.push(u);
    cellV.push(v);
  }

  let bands: Float64Array | null = null;
  if (internal.bandedJumpNodes !== null) {
    const uNumerators: bigint[] = [];
    const vNumerators: bigint[] = [];
    try {
      for (let vertex = 0; vertex < 3; vertex += 1) {
        uNumerators.push(BigInt(cell.vertices[vertex].uNumerator));
        vNumerators.push(BigInt(cell.vertices[vertex].vNumerator));
      }
    } catch {
      return null;
    }
    bands = fastBandScratch(internal);
    resolveJumpBandsInto(
      bands,
      internal.bandedJumpNodes,
      uNumerators,
      vNumerators,
      fractionBits,
      BigInt(oddFactor)
    );
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
  for (let artifactVertex = 0; artifactVertex < 3; artifactVertex += 1) {
    for (const coordinate of [0, 1, 2] as const) {
      const value = fastArtifactCoordinate(request, artifactVertex, coordinate);
      if (value === null) return null;
      fastWrapperArtifactLo[artifactVertex * 3 + coordinate] = value.lower;
      fastWrapperArtifactHi[artifactVertex * 3 + coordinate] = value.upper;
    }
  }
  for (let vertex = 0; vertex < 3; vertex += 1) {
    fastWrapperULo[vertex] = cellU[vertex].lower;
    fastWrapperUHi[vertex] = cellU[vertex].upper;
    fastWrapperVLo[vertex] = cellV[vertex].lower;
    fastWrapperVHi[vertex] = cellV[vertex].upper;
  }
  for (let weight = 0; weight < 9; weight += 1) {
    fastWrapperWeightLo[weight] = weights[weight].lower;
    fastWrapperWeightHi[weight] = weights[weight].upper;
  }
  return fastEncloseCore(
    internal,
    fastWrapperULo,
    fastWrapperUHi,
    fastWrapperVLo,
    fastWrapperVHi,
    fastWrapperWeightLo,
    fastWrapperWeightHi,
    fastWrapperArtifactLo,
    fastWrapperArtifactHi,
    bands
  );
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
  artifactVerticesMm: Float64Array,
  oddDenominatorFactor = 1
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
  if (
    oddDenominatorFactor !== 1 &&
    (!Number.isSafeInteger(oddDenominatorFactor) ||
      oddDenominatorFactor < 3 ||
      oddDenominatorFactor % 2 !== 1 ||
      oddDenominatorFactor > 4_503_599_627_370_495)
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
    if (oddDenominatorFactor === 1) {
      // Integer numerator times an exact power of two is exact in float64.
      cellU.push(outwardInterval(uNumerator * scale, uNumerator * scale));
      cellV.push(outwardInterval(vNumerator * scale, vNumerator * scale));
      continue;
    }
    // Same exactness rule as fastCellCoordinate: exact iff the odd factor
    // divides the numerator; otherwise <= 0.5 ulp covered by relative widening.
    const uValue = (uNumerator / oddDenominatorFactor) * scale;
    const vValue = (vNumerator / oddDenominatorFactor) * scale;
    if (!Number.isFinite(uValue) || !Number.isFinite(vValue)) return null;
    cellU.push(
      uNumerator % oddDenominatorFactor === 0
        ? outwardInterval(uValue, uValue)
        : outwardInterval(fastWidenLo(uValue), fastWidenHi(uValue))
    );
    cellV.push(
      vNumerator % oddDenominatorFactor === 0
        ? outwardInterval(vValue, vValue)
        : outwardInterval(fastWidenLo(vValue), fastWidenHi(vValue))
    );
  }
  let bands: Float64Array | null = null;
  if (internal.bandedJumpNodes !== null) {
    const uExact: bigint[] = [];
    const vExact: bigint[] = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      uExact.push(BigInt(uNumerators[vertex]));
      vExact.push(BigInt(vNumerators[vertex]));
    }
    bands = fastBandScratch(internal);
    resolveJumpBandsInto(
      bands,
      internal.bandedJumpNodes,
      uExact,
      vExact,
      fractionBits,
      BigInt(oddDenominatorFactor)
    );
  }
  const denominator = 2 ** barycentricFractionBits;
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    let numeratorSum = 0;
    for (let weight = 0; weight < 3; weight += 1) {
      const numerator = barycentricNumerators[cellVertex * 3 + weight];
      if (!Number.isInteger(numerator) || numerator < 0) return null;
      numeratorSum += numerator;
      const exactWeight = numerator / denominator;
      fastWrapperWeightLo[cellVertex * 3 + weight] = exactWeight;
      fastWrapperWeightHi[cellVertex * 3 + weight] = exactWeight;
    }
    if (numeratorSum !== denominator) return null;
  }
  for (let value = 0; value < 9; value += 1) {
    const coordinate = artifactVerticesMm[value];
    if (!Number.isFinite(coordinate)) return null;
    fastWrapperArtifactLo[value] = coordinate;
    fastWrapperArtifactHi[value] = coordinate;
  }
  for (let vertex = 0; vertex < 3; vertex += 1) {
    fastWrapperULo[vertex] = cellU[vertex].lower;
    fastWrapperUHi[vertex] = cellU[vertex].upper;
    fastWrapperVLo[vertex] = cellV[vertex].lower;
    fastWrapperVHi[vertex] = cellV[vertex].upper;
  }
  return fastEncloseCore(
    internal,
    fastWrapperULo,
    fastWrapperUHi,
    fastWrapperVLo,
    fastWrapperVHi,
    fastWrapperWeightLo,
    fastWrapperWeightHi,
    fastWrapperArtifactLo,
    fastWrapperArtifactHi,
    bands
  );
}

/**
 * Shared centered mean-value core. `cellU`/`cellV` are the three exact cell
 * vertex coordinates, `weights` the nine exact barycentric weights (vertex-
 * major a,b,c), `artifact` the nine artifact coordinate enclosures
 * (vertex-major x,y,z).
 */
function fastCheckedAddLo(left: number, right: number): number {
  const sum = left + right;
  if (sum - left === right && sum - right === left) return sum;
  return fastWidenLo(sum);
}

function fastCheckedAddHi(left: number, right: number): number {
  const sum = left + right;
  if (sum - left === right && sum - right === left) return sum;
  return fastWidenHi(sum);
}

// ---------------------------------------------------------------------------
// Interval helpers for the Hessian-interval (second-order) screen pass. Each
// returns one outward bound with the same pure-relative widening the tape uses
// (a square of a zero-straddling interval keeps an exact zero lower bound; a
// four-corner product is widened outward). Second order is flag-gated OFF by
// default, so these never run on the certified first-order path.
// ---------------------------------------------------------------------------

function fastIntSquareLo(lo: number, hi: number): number {
  if (lo <= 0 && hi >= 0) return 0;
  const a = lo * lo;
  const b = hi * hi;
  return fastWidenLo(Math.min(a, b));
}

function fastIntSquareHi(lo: number, hi: number): number {
  const a = lo * lo;
  const b = hi * hi;
  return fastWidenHi(Math.max(a, b));
}

function fastIntProdLo(aLo: number, aHi: number, bLo: number, bHi: number): number {
  const p0 = aLo * bLo;
  const p1 = aLo * bHi;
  const p2 = aHi * bLo;
  const p3 = aHi * bHi;
  return fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3)));
}

function fastIntProdHi(aLo: number, aHi: number, bLo: number, bHi: number): number {
  const p0 = aLo * bLo;
  const p1 = aLo * bHi;
  const p2 = aHi * bLo;
  const p3 = aHi * bHi;
  return fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3)));
}

// Outward bound of the Lagrange quadratic remainder 1/2 * deltaᵀ H delta over
// the cell box offset [duLo,duHi] x [dvLo,dvHi] with the interval Hessian H =
// [[Huu,Huv],[Huv,Hvv]]. Written into `fastQuadRemainderScratch` = [lo, hi].
// (1/2 and the doubled cross term are exact power-of-two scalings.)
const fastQuadRemainderScratch = new Float64Array(2);

function fastQuadraticRemainderInto(
  huuLo: number,
  huuHi: number,
  huvLo: number,
  huvHi: number,
  hvvLo: number,
  hvvHi: number,
  duLo: number,
  duHi: number,
  dvLo: number,
  dvHi: number
): void {
  const du2Lo = fastIntSquareLo(duLo, duHi);
  const du2Hi = fastIntSquareHi(duLo, duHi);
  const dv2Lo = fastIntSquareLo(dvLo, dvHi);
  const dv2Hi = fastIntSquareHi(dvLo, dvHi);
  const duvLo = fastIntProdLo(duLo, duHi, dvLo, dvHi);
  const duvHi = fastIntProdHi(duLo, duHi, dvLo, dvHi);
  const uuLo = fastIntProdLo(huuLo, huuHi, du2Lo, du2Hi);
  const uuHi = fastIntProdHi(huuLo, huuHi, du2Lo, du2Hi);
  const uvLo = 2 * fastIntProdLo(huvLo, huvHi, duvLo, duvHi);
  const uvHi = 2 * fastIntProdHi(huvLo, huvHi, duvLo, duvHi);
  const vvLo = fastIntProdLo(hvvLo, hvvHi, dv2Lo, dv2Hi);
  const vvHi = fastIntProdHi(hvvLo, hvvHi, dv2Lo, dv2Hi);
  const sumLo = fastCheckedAddLo(fastCheckedAddLo(uuLo, uvLo), vvLo);
  const sumHi = fastCheckedAddHi(fastCheckedAddHi(uuHi, uvHi), vvHi);
  fastQuadRemainderScratch[0] = 0.5 * sumLo;
  fastQuadRemainderScratch[1] = 0.5 * sumHi;
}

// Chain rule for a unary node y = f(g): the Hessian is
//   y_ij = f''(g)*g_i*g_j + f'(g)*g_ij.
// Written into `fastUnaryHessScratch` = [duuLo, duuHi, duvLo, duvHi, dvvLo, dvvHi].
// fp = f'(g) and fpp = f''(g) are outward intervals supplied by the caller; the
// g first/second derivatives are the argument node's channels.
const fastUnaryHessScratch = new Float64Array(6);

function fastUnaryChainHessianInto(
  fpLo: number,
  fpHi: number,
  fppLo: number,
  fppHi: number,
  guLo: number,
  guHi: number,
  gvLo: number,
  gvHi: number,
  guuLo: number,
  guuHi: number,
  guvLo: number,
  guvHi: number,
  gvvLo: number,
  gvvHi: number
): void {
  const gu2Lo = fastIntSquareLo(guLo, guHi);
  const gu2Hi = fastIntSquareHi(guLo, guHi);
  const gv2Lo = fastIntSquareLo(gvLo, gvHi);
  const gv2Hi = fastIntSquareHi(gvLo, gvHi);
  const guvProdLo = fastIntProdLo(guLo, guHi, gvLo, gvHi);
  const guvProdHi = fastIntProdHi(guLo, guHi, gvLo, gvHi);
  fastUnaryHessScratch[0] = fastCheckedAddLo(
    fastIntProdLo(fppLo, fppHi, gu2Lo, gu2Hi),
    fastIntProdLo(fpLo, fpHi, guuLo, guuHi)
  );
  fastUnaryHessScratch[1] = fastCheckedAddHi(
    fastIntProdHi(fppLo, fppHi, gu2Lo, gu2Hi),
    fastIntProdHi(fpLo, fpHi, guuLo, guuHi)
  );
  fastUnaryHessScratch[2] = fastCheckedAddLo(
    fastIntProdLo(fppLo, fppHi, guvProdLo, guvProdHi),
    fastIntProdLo(fpLo, fpHi, guvLo, guvHi)
  );
  fastUnaryHessScratch[3] = fastCheckedAddHi(
    fastIntProdHi(fppLo, fppHi, guvProdLo, guvProdHi),
    fastIntProdHi(fpLo, fpHi, guvLo, guvHi)
  );
  fastUnaryHessScratch[4] = fastCheckedAddLo(
    fastIntProdLo(fppLo, fppHi, gv2Lo, gv2Hi),
    fastIntProdLo(fpLo, fpHi, gvvLo, gvvHi)
  );
  fastUnaryHessScratch[5] = fastCheckedAddHi(
    fastIntProdHi(fppLo, fppHi, gv2Lo, gv2Hi),
    fastIntProdHi(fpLo, fpHi, gvvLo, gvvHi)
  );
}

// Constant affine gradient and centroid value of the affine artifact for one
// coordinate, written into `fastAffineCoordScratch` = [gradientULo, gradientUHi,
// gradientVLo, gradientVHi, artifactCentreLo, artifactCentreHi]. Extracted
// verbatim from the first-order assembly so both the first- and second-order
// paths share one proven computation.
const fastAffineCoordScratch = new Float64Array(6);

function fastArtifactAffineCoord(
  coordinate: number,
  artifactAtLo: Float64Array,
  artifactAtHi: Float64Array,
  edge1VLo: number,
  edge1VHi: number,
  edge2VLo: number,
  edge2VHi: number,
  edge1ULo: number,
  edge1UHi: number,
  edge2ULo: number,
  edge2UHi: number,
  determinantLo: number,
  determinantHi: number
): void {
  const a0Lo = artifactAtLo[coordinate];
  const a0Hi = artifactAtHi[coordinate];
  const a1Lo = artifactAtLo[3 + coordinate];
  const a1Hi = artifactAtHi[3 + coordinate];
  const a2Lo = artifactAtLo[6 + coordinate];
  const a2Hi = artifactAtHi[6 + coordinate];
  const delta1Lo = fastCheckedAddLo(a1Lo, -a0Hi);
  const delta1Hi = fastCheckedAddHi(a1Hi, -a0Lo);
  const delta2Lo = fastCheckedAddLo(a2Lo, -a0Hi);
  const delta2Hi = fastCheckedAddHi(a2Hi, -a0Lo);
  // gradientU = (delta1*edge2V - delta2*edge1V) / det
  const gu00 = delta1Lo * edge2VLo;
  const gu01 = delta1Lo * edge2VHi;
  const gu02 = delta1Hi * edge2VLo;
  const gu03 = delta1Hi * edge2VHi;
  const gu10 = delta2Lo * edge1VLo;
  const gu11 = delta2Lo * edge1VHi;
  const gu12 = delta2Hi * edge1VLo;
  const gu13 = delta2Hi * edge1VHi;
  const gradientUNumLo = fastCheckedAddLo(
    fastWidenLo(Math.min(Math.min(gu00, gu01), Math.min(gu02, gu03))),
    -fastWidenHi(Math.max(Math.max(gu10, gu11), Math.max(gu12, gu13)))
  );
  const gradientUNumHi = fastCheckedAddHi(
    fastWidenHi(Math.max(Math.max(gu00, gu01), Math.max(gu02, gu03))),
    -fastWidenLo(Math.min(Math.min(gu10, gu11), Math.min(gu12, gu13)))
  );
  const du0 = gradientUNumLo / determinantLo;
  const du1 = gradientUNumLo / determinantHi;
  const du2 = gradientUNumHi / determinantLo;
  const du3 = gradientUNumHi / determinantHi;
  fastAffineCoordScratch[0] = fastWidenLo(Math.min(Math.min(du0, du1), Math.min(du2, du3)));
  fastAffineCoordScratch[1] = fastWidenHi(Math.max(Math.max(du0, du1), Math.max(du2, du3)));
  // gradientV = (delta2*edge1U - delta1*edge2U) / det
  const gv00 = delta2Lo * edge1ULo;
  const gv01 = delta2Lo * edge1UHi;
  const gv02 = delta2Hi * edge1ULo;
  const gv03 = delta2Hi * edge1UHi;
  const gv10 = delta1Lo * edge2ULo;
  const gv11 = delta1Lo * edge2UHi;
  const gv12 = delta1Hi * edge2ULo;
  const gv13 = delta1Hi * edge2UHi;
  const gradientVNumLo = fastCheckedAddLo(
    fastWidenLo(Math.min(Math.min(gv00, gv01), Math.min(gv02, gv03))),
    -fastWidenHi(Math.max(Math.max(gv10, gv11), Math.max(gv12, gv13)))
  );
  const gradientVNumHi = fastCheckedAddHi(
    fastWidenHi(Math.max(Math.max(gv00, gv01), Math.max(gv02, gv03))),
    -fastWidenLo(Math.min(Math.min(gv10, gv11), Math.min(gv12, gv13)))
  );
  const dv0 = gradientVNumLo / determinantLo;
  const dv1 = gradientVNumLo / determinantHi;
  const dv2 = gradientVNumHi / determinantLo;
  const dv3 = gradientVNumHi / determinantHi;
  fastAffineCoordScratch[2] = fastWidenLo(Math.min(Math.min(dv0, dv1), Math.min(dv2, dv3)));
  fastAffineCoordScratch[3] = fastWidenHi(Math.max(Math.max(dv0, dv1), Math.max(dv2, dv3)));
  // Affine artifact centroid value = exact mean of the three vertex values.
  fastAffineCoordScratch[4] = fastWidenLo(fastCheckedAddLo(fastCheckedAddLo(a0Lo, a1Lo), a2Lo) / 3);
  fastAffineCoordScratch[5] = fastWidenHi(fastCheckedAddHi(fastCheckedAddHi(a0Hi, a1Hi), a2Hi) / 3);
}

/**
 * Shared centered mean-value core on raw widened float64 bounds (the same
 * soundness patterns as the tape: error-free-checked adds, four-corner
 * products with pure relative widening that preserves exact zeros).
 * Inputs: three cell vertex bounds per axis, nine barycentric weight bounds
 * (vertex-major a,b,c), nine artifact coordinate bounds (vertex-major x,y,z).
 */
function fastEncloseCore(
  internal: InternalCompiledProgram,
  uLo: Float64Array,
  uHi: Float64Array,
  vLo: Float64Array,
  vHi: Float64Array,
  weightLo: Float64Array,
  weightHi: Float64Array,
  artifactLo: Float64Array,
  artifactHi: Float64Array,
  bands: Float64Array | null = null
): ValidatedResidualEnclosure | null {
  // Per-cell band assignments stay live for both tape passes (hull pass and
  // centroid pass): the centroid lies inside the same cell, so the same
  // exact band applies. Cleared before returning.
  fastRunTapeBands = bands;
  try {
    return fastEncloseCoreInner(
      internal,
      uLo,
      uHi,
      vLo,
      vHi,
      weightLo,
      weightHi,
      artifactLo,
      artifactHi
    );
  } finally {
    fastRunTapeBands = null;
  }
}

// Flag-gated tighter Jacobian (measurement instrument; 0 => OFF => byte-
// identical to the single-box pass). When > 1, Pass 1 partitions the cell's
// axis-aligned box into a K x K sub-box grid, runs the interval-Jacobian tape
// over each sub-box NOT provably disjoint from the exact cell triangle, and
// hulls the target Jacobian channels. Kept sub-boxes cover the triangle, so
// hulling sound per-sub-box Jacobians is a sound enclosure and lies inside the
// single-box hull it replaces; a jump straddling any covering sub-box forces a
// fall back to the single box. Non-dyadic (interval-vertex) cells fall back for
// soundness. The default (OFF) certificate and its proof hash are unchanged;
// productionizing this pass would require updating the compiler proof text.
let screenJacobianPartition = 0;

export function setScreenJacobianPartition(partition: number): void {
  screenJacobianPartition = Number.isSafeInteger(partition) && partition > 1 ? partition : 0;
}

// Flag-gated second-order (Hessian-interval) screen (measurement instrument;
// false => OFF => byte-identical enclosures to the first-order mean-value screen,
// so the default certificate and its compiler proof hash are unchanged). When
// true, fastEncloseCore attempts the centered second-order form per cell and
// falls back to the first-order form on any invalid cell. Productionizing this
// pass would require extending the compiler proof text (a deliberate re-proof).
let screenSecondOrder = false;

export function setScreenSecondOrder(enabled: boolean): void {
  screenSecondOrder = enabled === true;
}

// Provably-disjoint test: true iff every corner of [su0,su1]x[sv0,sv1] lies
// strictly on the outer side of one triangle edge. Excluding only such boxes
// preserves coverage of the triangle (and of any jump line crossing it).
function fastBoxOutsideTriangle(
  su0: number,
  su1: number,
  sv0: number,
  sv1: number,
  pu: readonly [number, number, number],
  pv: readonly [number, number, number]
): boolean {
  for (let e = 0; e < 3; e += 1) {
    const i = e;
    const j = (e + 1) % 3;
    const k = (e + 2) % 3;
    const ex = pu[j] - pu[i];
    const ey = pv[j] - pv[i];
    const sideK = ex * (pv[k] - pv[i]) - ey * (pu[k] - pu[i]);
    if (sideK === 0) continue;
    const c00 = ex * (sv0 - pv[i]) - ey * (su0 - pu[i]);
    const c01 = ex * (sv1 - pv[i]) - ey * (su0 - pu[i]);
    const c10 = ex * (sv0 - pv[i]) - ey * (su1 - pu[i]);
    const c11 = ex * (sv1 - pv[i]) - ey * (su1 - pu[i]);
    if (sideK > 0) {
      if (c00 < 0 && c01 < 0 && c10 < 0 && c11 < 0) return true;
    } else if (c00 > 0 && c01 > 0 && c10 > 0 && c11 > 0) {
      return true;
    }
  }
  return false;
}

const fastPartitionDuLo = new Float64Array(3);
const fastPartitionDuHi = new Float64Array(3);
const fastPartitionDvLo = new Float64Array(3);
const fastPartitionDvHi = new Float64Array(3);

// Hull the target Jacobian over the triangle-covering sub-boxes into the
// fastPartition* scratch. Returns false (caller keeps the single-box pass) on
// tape failure, a hull-only straddle in any covering sub-box, non-dyadic
// vertices, or empty coverage.
function fastRunPartitionedJacobian(
  screenProgram: FastCompiledScreenProgram,
  targets: readonly [number, number, number],
  partition: number,
  uLo: Float64Array,
  uHi: Float64Array,
  vLo: Float64Array,
  vHi: Float64Array
): boolean {
  for (let i = 0; i < 3; i += 1) {
    if (uLo[i] !== uHi[i] || vLo[i] !== vHi[i]) return false;
  }
  const pu: readonly [number, number, number] = [uLo[0], uLo[1], uLo[2]];
  const pv: readonly [number, number, number] = [vLo[0], vLo[1], vLo[2]];
  const boxULo = Math.min(pu[0], pu[1], pu[2]);
  const boxUHi = Math.max(pu[0], pu[1], pu[2]);
  const boxVLo = Math.min(pv[0], pv[1], pv[2]);
  const boxVHi = Math.max(pv[0], pv[1], pv[2]);
  const stepU = (boxUHi - boxULo) / partition;
  const stepV = (boxVHi - boxVLo) / partition;
  for (let c = 0; c < 3; c += 1) {
    fastPartitionDuLo[c] = Number.POSITIVE_INFINITY;
    fastPartitionDuHi[c] = Number.NEGATIVE_INFINITY;
    fastPartitionDvLo[c] = Number.POSITIVE_INFINITY;
    fastPartitionDvHi[c] = Number.NEGATIVE_INFINITY;
  }
  let covered = false;
  let clarke = false;
  for (let i = 0; i < partition; i += 1) {
    const su0 = i === 0 ? boxULo : boxULo + stepU * i;
    const su1 = i === partition - 1 ? boxUHi : boxULo + stepU * (i + 1);
    for (let j = 0; j < partition; j += 1) {
      const sv0 = j === 0 ? boxVLo : boxVLo + stepV * j;
      const sv1 = j === partition - 1 ? boxVHi : boxVLo + stepV * (j + 1);
      if (fastBoxOutsideTriangle(su0, su1, sv0, sv1, pu, pv)) continue;
      if (!fastRunTape(screenProgram, su0, su1, sv0, sv1, true)) return false;
      if (fastRunTapeHullOnly) return false;
      covered = true;
      if (fastRunTapeClarkeFired) clarke = true;
      for (let c = 0; c < 3; c += 1) {
        const t = targets[c];
        if (screenProgram.duLo[t] < fastPartitionDuLo[c])
          fastPartitionDuLo[c] = screenProgram.duLo[t];
        if (screenProgram.duHi[t] > fastPartitionDuHi[c])
          fastPartitionDuHi[c] = screenProgram.duHi[t];
        if (screenProgram.dvLo[t] < fastPartitionDvLo[c])
          fastPartitionDvLo[c] = screenProgram.dvLo[t];
        if (screenProgram.dvHi[t] > fastPartitionDvHi[c])
          fastPartitionDvHi[c] = screenProgram.dvHi[t];
      }
    }
  }
  fastLastScreenClarkeFired = clarke;
  return covered;
}

// Attempt the centered second-order (Hessian-interval) enclosure of the residual
// over one cell. Returns null (caller falls back to the first-order mean-value
// screen) on any invalidity: a straddling kink or jump node, an operation whose
// per-op second-derivative rule is not yet implemented, or a nonfinite bound.
//
// Soundness (Taylor with the second-order Lagrange remainder): for a C² residual
// r over the cell with centroid c and offset delta = x - c,
//   r(x) = r(c) + grad r(c)·delta + 1/2 delta^T H_r(xi) delta,   xi in [c,x] ⊆ cell,
// so r(x) is contained in  r(c) + { grad r(c)·delta : x in triangle }
//                                + 1/2 { delta^T H delta : delta in box offset, H in H_r(cell) }.
// The linear term uses the THIN centroid gradient hulled over the exact vertex
// offsets (convexity, as in the first-order form). The affine artifact has zero
// curvature, so H_r = H_target, enclosed over the whole cell box by the Hessian
// tape. Each part is a sound outward superset, so their sum encloses r(x). The
// win over the first-order form: the linear term no longer pays the cell-wide
// Jacobian variation (the curvature tax), only the genuine quadratic sag.
function fastSecondOrderEnclose(
  screenProgram: FastCompiledScreenProgram,
  targets: readonly [number, number, number],
  uBoxLo: number,
  uBoxHi: number,
  vBoxLo: number,
  vBoxHi: number,
  uCentreLo: number,
  uCentreHi: number,
  vCentreLo: number,
  vCentreHi: number,
  offsetULo: Float64Array,
  offsetUHi: Float64Array,
  offsetVLo: Float64Array,
  offsetVHi: Float64Array,
  artifactAtLo: Float64Array,
  artifactAtHi: Float64Array,
  edge1ULo: number,
  edge1UHi: number,
  edge1VLo: number,
  edge1VHi: number,
  edge2ULo: number,
  edge2UHi: number,
  edge2VLo: number,
  edge2VHi: number,
  determinantLo: number,
  determinantHi: number
): ValidatedResidualEnclosure | null {
  const hess = fastHessianChannels(screenProgram);
  // Pass H: value + Jacobian + Hessian over the whole cell box.
  if (!fastRunTape(screenProgram, uBoxLo, uBoxHi, vBoxLo, vBoxHi, true, hess)) return null;
  if (fastRunTapeHullOnly || fastRunTapeSecondOrderInvalid) return null;
  // Pass C: value + gradient at the centroid POINT (thin, first derivatives
  // seeded, no Hessian). This overwrites the value/derivative channels with the
  // narrow centroid gradient; the separate Hessian channels keep the box bounds.
  if (!fastRunTape(screenProgram, uCentreLo, uCentreHi, vCentreLo, vCentreHi, true)) return null;
  if (fastRunTapeHullOnly) return null;
  // Cell box offset about the centroid interval (contains x - c for every cell x).
  const duBoxLo = fastCheckedAddLo(uBoxLo, -uCentreHi);
  const duBoxHi = fastCheckedAddHi(uBoxHi, -uCentreLo);
  const dvBoxLo = fastCheckedAddLo(vBoxLo, -vCentreHi);
  const dvBoxHi = fastCheckedAddHi(vBoxHi, -vCentreLo);
  const residuals: OutwardInterval[] = [];
  for (let coordinate = 0; coordinate < 3; coordinate += 1) {
    const targetIndex = targets[coordinate];
    fastArtifactAffineCoord(
      coordinate,
      artifactAtLo,
      artifactAtHi,
      edge1VLo,
      edge1VHi,
      edge2VLo,
      edge2VHi,
      edge1ULo,
      edge1UHi,
      edge2ULo,
      edge2UHi,
      determinantLo,
      determinantHi
    );
    const gradientULo = fastAffineCoordScratch[0];
    const gradientUHi = fastAffineCoordScratch[1];
    const gradientVLo = fastAffineCoordScratch[2];
    const gradientVHi = fastAffineCoordScratch[3];
    const artifactCentreLo = fastAffineCoordScratch[4];
    const artifactCentreHi = fastAffineCoordScratch[5];
    // r(c) = target(centroid) - affine artifact(centroid).
    const residualCentreLo = fastCheckedAddLo(screenProgram.vLo[targetIndex], -artifactCentreHi);
    const residualCentreHi = fastCheckedAddHi(screenProgram.vHi[targetIndex], -artifactCentreLo);
    // grad r(c) = target gradient at the centroid point (thin) - affine artifact gradient.
    const residualGradientULo = fastCheckedAddLo(screenProgram.duLo[targetIndex], -gradientUHi);
    const residualGradientUHi = fastCheckedAddHi(screenProgram.duHi[targetIndex], -gradientULo);
    const residualGradientVLo = fastCheckedAddLo(screenProgram.dvLo[targetIndex], -gradientVHi);
    const residualGradientVHi = fastCheckedAddHi(screenProgram.dvHi[targetIndex], -gradientVLo);
    // Linear term hulled over the three exact vertex offsets (convexity).
    let termLo = Number.POSITIVE_INFINITY;
    let termHi = Number.NEGATIVE_INFINITY;
    for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
      const ouLo = offsetULo[cellVertex];
      const ouHi = offsetUHi[cellVertex];
      const ovLo = offsetVLo[cellVertex];
      const ovHi = offsetVHi[cellVertex];
      const ru0 = residualGradientULo * ouLo;
      const ru1 = residualGradientULo * ouHi;
      const ru2 = residualGradientUHi * ouLo;
      const ru3 = residualGradientUHi * ouHi;
      const rv0 = residualGradientVLo * ovLo;
      const rv1 = residualGradientVLo * ovHi;
      const rv2 = residualGradientVHi * ovLo;
      const rv3 = residualGradientVHi * ovHi;
      const vertexLo = fastCheckedAddLo(
        fastWidenLo(Math.min(Math.min(ru0, ru1), Math.min(ru2, ru3))),
        fastWidenLo(Math.min(Math.min(rv0, rv1), Math.min(rv2, rv3)))
      );
      const vertexHi = fastCheckedAddHi(
        fastWidenHi(Math.max(Math.max(ru0, ru1), Math.max(ru2, ru3))),
        fastWidenHi(Math.max(Math.max(rv0, rv1), Math.max(rv2, rv3)))
      );
      if (vertexLo < termLo) termLo = vertexLo;
      if (vertexHi > termHi) termHi = vertexHi;
    }
    // Lagrange quadratic remainder 1/2 delta^T H(box) delta; residual Hessian =
    // target Hessian because the affine artifact has zero curvature.
    fastQuadraticRemainderInto(
      hess.duuLo[targetIndex],
      hess.duuHi[targetIndex],
      hess.duvLo[targetIndex],
      hess.duvHi[targetIndex],
      hess.dvvLo[targetIndex],
      hess.dvvHi[targetIndex],
      duBoxLo,
      duBoxHi,
      dvBoxLo,
      dvBoxHi
    );
    const residualLo = fastCheckedAddLo(
      fastCheckedAddLo(residualCentreLo, termLo),
      fastQuadRemainderScratch[0]
    );
    const residualHi = fastCheckedAddHi(
      fastCheckedAddHi(residualCentreHi, termHi),
      fastQuadRemainderScratch[1]
    );
    if (!Number.isFinite(residualLo) || !Number.isFinite(residualHi) || residualLo > residualHi) {
      return null;
    }
    residuals.push(outwardInterval(residualLo, residualHi));
  }
  fastLastScreenClarkeFired = false;
  return Object.freeze({ xMm: residuals[0], yMm: residuals[1], zMm: residuals[2] });
}

function fastEncloseCoreInner(
  internal: InternalCompiledProgram,
  uLo: Float64Array,
  uHi: Float64Array,
  vLo: Float64Array,
  vHi: Float64Array,
  weightLo: Float64Array,
  weightHi: Float64Array,
  artifactLo: Float64Array,
  artifactHi: Float64Array
): ValidatedResidualEnclosure | null {
  fastLastScreenSecondOrderUsed = false;
  const uBoxLo = Math.min(uLo[0], uLo[1], uLo[2]);
  const uBoxHi = Math.max(uHi[0], uHi[1], uHi[2]);
  const vBoxLo = Math.min(vLo[0], vLo[1], vLo[2]);
  const vBoxHi = Math.max(vHi[0], vHi[1], vHi[2]);
  const uCentreLo = fastWidenLo(fastCheckedAddLo(fastCheckedAddLo(uLo[0], uLo[1]), uLo[2]) / 3);
  const uCentreHi = fastWidenHi(fastCheckedAddHi(fastCheckedAddHi(uHi[0], uHi[1]), uHi[2]) / 3);
  const vCentreLo = fastWidenLo(fastCheckedAddLo(fastCheckedAddLo(vLo[0], vLo[1]), vLo[2]) / 3);
  const vCentreHi = fastWidenHi(fastCheckedAddHi(fastCheckedAddHi(vHi[0], vHi[1]), vHi[2]) / 3);
  // Centred offsets PER CELL VERTEX (each interval is only rounding-wide).
  // The mean-value term is hulled over these three offsets rather than the
  // axis-aligned box: every cell point is a convex combination of the
  // vertices, and for each fixed Jacobian selection the term is linear in
  // the offset, so its range over the triangle lies inside the convex hull
  // of the vertex values — while the box's mixed-sign corner, which the
  // triangle cannot reach, would pay up to min(|Ju|·du, |Jv|·dv) extra.
  const offsetULo = fastCoreOffsetULo;
  const offsetUHi = fastCoreOffsetUHi;
  const offsetVLo = fastCoreOffsetVLo;
  const offsetVHi = fastCoreOffsetVHi;
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    offsetULo[cellVertex] = fastCheckedAddLo(uLo[cellVertex], -uCentreHi);
    offsetUHi[cellVertex] = fastCheckedAddHi(uHi[cellVertex], -uCentreLo);
    offsetVLo[cellVertex] = fastCheckedAddLo(vLo[cellVertex], -vCentreHi);
    offsetVHi[cellVertex] = fastCheckedAddHi(vHi[cellVertex], -vCentreLo);
  }

  // Affine artifact values at the three cell vertices via the exact dyadic
  // barycentric weights (the same combination the decimal path uses).
  // Vertex-major x,y,z bounds.
  const artifactAtLo = fastCoreArtifactAtLo;
  const artifactAtHi = fastCoreArtifactAtHi;
  for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      let sumLo = 0;
      let sumHi = 0;
      for (let artifactVertex = 0; artifactVertex < 3; artifactVertex += 1) {
        const wLo = weightLo[cellVertex * 3 + artifactVertex];
        const wHi = weightHi[cellVertex * 3 + artifactVertex];
        const aLo = artifactLo[artifactVertex * 3 + coordinate];
        const aHi = artifactHi[artifactVertex * 3 + coordinate];
        const p0 = wLo * aLo;
        const p1 = wLo * aHi;
        const p2 = wHi * aLo;
        const p3 = wHi * aHi;
        sumLo = fastCheckedAddLo(sumLo, fastWidenLo(Math.min(Math.min(p0, p1), Math.min(p2, p3))));
        sumHi = fastCheckedAddHi(sumHi, fastWidenHi(Math.max(Math.max(p0, p1), Math.max(p2, p3))));
      }
      artifactAtLo[cellVertex * 3 + coordinate] = sumLo;
      artifactAtHi[cellVertex * 3 + coordinate] = sumHi;
    }
  }

  // Constant affine gradient of the artifact over the cell triangle.
  const edge1ULo = fastCheckedAddLo(uLo[1], -uHi[0]);
  const edge1UHi = fastCheckedAddHi(uHi[1], -uLo[0]);
  const edge1VLo = fastCheckedAddLo(vLo[1], -vHi[0]);
  const edge1VHi = fastCheckedAddHi(vHi[1], -vLo[0]);
  const edge2ULo = fastCheckedAddLo(uLo[2], -uHi[0]);
  const edge2UHi = fastCheckedAddHi(uHi[2], -uLo[0]);
  const edge2VLo = fastCheckedAddLo(vLo[2], -vHi[0]);
  const edge2VHi = fastCheckedAddHi(vHi[2], -vLo[0]);
  const det00 = edge1ULo * edge2VLo;
  const det01 = edge1ULo * edge2VHi;
  const det02 = edge1UHi * edge2VLo;
  const det03 = edge1UHi * edge2VHi;
  const det10 = edge2ULo * edge1VLo;
  const det11 = edge2ULo * edge1VHi;
  const det12 = edge2UHi * edge1VLo;
  const det13 = edge2UHi * edge1VHi;
  const determinantLo = fastCheckedAddLo(
    fastWidenLo(Math.min(Math.min(det00, det01), Math.min(det02, det03))),
    -fastWidenHi(Math.max(Math.max(det10, det11), Math.max(det12, det13)))
  );
  const determinantHi = fastCheckedAddHi(
    fastWidenHi(Math.max(Math.max(det00, det01), Math.max(det02, det03))),
    -fastWidenLo(Math.min(Math.min(det10, det11), Math.min(det12, det13)))
  );
  if (determinantLo <= 0 && determinantHi >= 0) return null;

  const screenProgram = fastCompileScreenProgram(internal);
  if (!screenProgram.supported) return recordFastRefusal(screenProgram.unsupportedReason);
  const targets = [internal.targetX, internal.targetY, internal.targetZ] as const;
  // Optional second-order (Hessian-interval) pass. Flag-gated OFF by default so
  // the certified first-order path below is byte-identical. On any invalidity it
  // returns null and the first-order mean-value screen runs unchanged.
  if (screenSecondOrder) {
    const secondOrder = fastSecondOrderEnclose(
      screenProgram,
      targets,
      uBoxLo,
      uBoxHi,
      vBoxLo,
      vBoxHi,
      uCentreLo,
      uCentreHi,
      vCentreLo,
      vCentreHi,
      offsetULo,
      offsetUHi,
      offsetVLo,
      offsetVHi,
      artifactAtLo,
      artifactAtHi,
      edge1ULo,
      edge1UHi,
      edge1VLo,
      edge1VHi,
      edge2ULo,
      edge2UHi,
      edge2VLo,
      edge2VHi,
      determinantLo,
      determinantHi
    );
    if (secondOrder !== null) {
      fastLastScreenSecondOrderUsed = true;
      return secondOrder;
    }
  }
  const jacobianDuLo = fastCoreJacobianDuLo;
  const jacobianDuHi = fastCoreJacobianDuHi;
  const jacobianDvLo = fastCoreJacobianDvLo;
  const jacobianDvHi = fastCoreJacobianDvHi;
  // Pass 1: interval Jacobian over the cell domain, captured before Pass 2
  // reuses the channels. The optional sub-box partition tightens it over the
  // exact triangle; any fallback reverts to the single axis-aligned box.
  if (
    screenJacobianPartition > 0 &&
    fastRunPartitionedJacobian(screenProgram, targets, screenJacobianPartition, uLo, uHi, vLo, vHi)
  ) {
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      jacobianDuLo[coordinate] = fastPartitionDuLo[coordinate];
      jacobianDuHi[coordinate] = fastPartitionDuHi[coordinate];
      jacobianDvLo[coordinate] = fastPartitionDvLo[coordinate];
      jacobianDvHi[coordinate] = fastPartitionDvHi[coordinate];
    }
  } else {
    if (!fastRunTape(screenProgram, uBoxLo, uBoxHi, vBoxLo, vBoxHi, true)) {
      return null;
    }
    fastLastScreenClarkeFired = fastRunTapeClarkeFired;
    if (fastRunTapeHullOnly) {
      // A jump-guarded node straddled its discontinuity: the centered
      // mean-value form is invalid, but the tape's value channels are still
      // sound enclosures. Fall back to the plain hull residual —
      // target(cell) minus the artifact triangle hull — which is first-order
      // wide but cheap, so the branch-and-bound can subdivide toward
      // jump-free children on it.
      const hullResiduals: OutwardInterval[] = [];
      for (let coordinate = 0; coordinate < 3; coordinate += 1) {
        const targetIndex = targets[coordinate];
        const a0Lo = artifactLo[coordinate];
        const a1Lo = artifactLo[3 + coordinate];
        const a2Lo = artifactLo[6 + coordinate];
        const a0Hi = artifactHi[coordinate];
        const a1Hi = artifactHi[3 + coordinate];
        const a2Hi = artifactHi[6 + coordinate];
        const artifactMin = Math.min(a0Lo, Math.min(a1Lo, a2Lo));
        const artifactMax = Math.max(a0Hi, Math.max(a1Hi, a2Hi));
        const residualLo = fastCheckedAddLo(screenProgram.vLo[targetIndex], -artifactMax);
        const residualHi = fastCheckedAddHi(screenProgram.vHi[targetIndex], -artifactMin);
        if (
          !Number.isFinite(residualLo) ||
          !Number.isFinite(residualHi) ||
          residualLo > residualHi
        ) {
          return null;
        }
        hullResiduals.push(outwardInterval(residualLo, residualHi));
      }
      return Object.freeze({
        xMm: hullResiduals[0],
        yMm: hullResiduals[1],
        zMm: hullResiduals[2],
      });
    }
    for (let coordinate = 0; coordinate < 3; coordinate += 1) {
      const targetIndex = targets[coordinate];
      jacobianDuLo[coordinate] = screenProgram.duLo[targetIndex];
      jacobianDuHi[coordinate] = screenProgram.duHi[targetIndex];
      jacobianDvLo[coordinate] = screenProgram.dvLo[targetIndex];
      jacobianDvHi[coordinate] = screenProgram.dvHi[targetIndex];
    }
  }
  // Pass 2: target value at the cell centroid (derivative channels unseeded).
  if (!fastRunTape(screenProgram, uCentreLo, uCentreHi, vCentreLo, vCentreHi, false)) {
    return null;
  }

  const residuals: OutwardInterval[] = [];
  for (let coordinate = 0; coordinate < 3; coordinate += 1) {
    const a0Lo = artifactAtLo[coordinate];
    const a0Hi = artifactAtHi[coordinate];
    const a1Lo = artifactAtLo[3 + coordinate];
    const a1Hi = artifactAtHi[3 + coordinate];
    const a2Lo = artifactAtLo[6 + coordinate];
    const a2Hi = artifactAtHi[6 + coordinate];
    const delta1Lo = fastCheckedAddLo(a1Lo, -a0Hi);
    const delta1Hi = fastCheckedAddHi(a1Hi, -a0Lo);
    const delta2Lo = fastCheckedAddLo(a2Lo, -a0Hi);
    const delta2Hi = fastCheckedAddHi(a2Hi, -a0Lo);
    // gradientU = (delta1*edge2V - delta2*edge1V) / det
    const gu00 = delta1Lo * edge2VLo;
    const gu01 = delta1Lo * edge2VHi;
    const gu02 = delta1Hi * edge2VLo;
    const gu03 = delta1Hi * edge2VHi;
    const gu10 = delta2Lo * edge1VLo;
    const gu11 = delta2Lo * edge1VHi;
    const gu12 = delta2Hi * edge1VLo;
    const gu13 = delta2Hi * edge1VHi;
    const gradientUNumLo = fastCheckedAddLo(
      fastWidenLo(Math.min(Math.min(gu00, gu01), Math.min(gu02, gu03))),
      -fastWidenHi(Math.max(Math.max(gu10, gu11), Math.max(gu12, gu13)))
    );
    const gradientUNumHi = fastCheckedAddHi(
      fastWidenHi(Math.max(Math.max(gu00, gu01), Math.max(gu02, gu03))),
      -fastWidenLo(Math.min(Math.min(gu10, gu11), Math.min(gu12, gu13)))
    );
    const du0 = gradientUNumLo / determinantLo;
    const du1 = gradientUNumLo / determinantHi;
    const du2 = gradientUNumHi / determinantLo;
    const du3 = gradientUNumHi / determinantHi;
    const gradientULo = fastWidenLo(Math.min(Math.min(du0, du1), Math.min(du2, du3)));
    const gradientUHi = fastWidenHi(Math.max(Math.max(du0, du1), Math.max(du2, du3)));
    // gradientV = (delta2*edge1U - delta1*edge2U) / det
    const gv00 = delta2Lo * edge1ULo;
    const gv01 = delta2Lo * edge1UHi;
    const gv02 = delta2Hi * edge1ULo;
    const gv03 = delta2Hi * edge1UHi;
    const gv10 = delta1Lo * edge2ULo;
    const gv11 = delta1Lo * edge2UHi;
    const gv12 = delta1Hi * edge2ULo;
    const gv13 = delta1Hi * edge2UHi;
    const gradientVNumLo = fastCheckedAddLo(
      fastWidenLo(Math.min(Math.min(gv00, gv01), Math.min(gv02, gv03))),
      -fastWidenHi(Math.max(Math.max(gv10, gv11), Math.max(gv12, gv13)))
    );
    const gradientVNumHi = fastCheckedAddHi(
      fastWidenHi(Math.max(Math.max(gv00, gv01), Math.max(gv02, gv03))),
      -fastWidenLo(Math.min(Math.min(gv10, gv11), Math.min(gv12, gv13)))
    );
    const dv0 = gradientVNumLo / determinantLo;
    const dv1 = gradientVNumLo / determinantHi;
    const dv2 = gradientVNumHi / determinantLo;
    const dv3 = gradientVNumHi / determinantHi;
    const gradientVLo = fastWidenLo(Math.min(Math.min(dv0, dv1), Math.min(dv2, dv3)));
    const gradientVHi = fastWidenHi(Math.max(Math.max(dv0, dv1), Math.max(dv2, dv3)));
    // The artifact is affine, so its centroid value is the exact mean of the
    // three cell-vertex values.
    const artifactCentreLo = fastWidenLo(fastCheckedAddLo(fastCheckedAddLo(a0Lo, a1Lo), a2Lo) / 3);
    const artifactCentreHi = fastWidenHi(fastCheckedAddHi(fastCheckedAddHi(a0Hi, a1Hi), a2Hi) / 3);
    const targetIndex = targets[coordinate];
    const residualCentreLo = fastCheckedAddLo(screenProgram.vLo[targetIndex], -artifactCentreHi);
    const residualCentreHi = fastCheckedAddHi(screenProgram.vHi[targetIndex], -artifactCentreLo);
    const residualGradientULo = fastCheckedAddLo(jacobianDuLo[coordinate], -gradientUHi);
    const residualGradientUHi = fastCheckedAddHi(jacobianDuHi[coordinate], -gradientULo);
    const residualGradientVLo = fastCheckedAddLo(jacobianDvLo[coordinate], -gradientVHi);
    const residualGradientVHi = fastCheckedAddHi(jacobianDvHi[coordinate], -gradientVLo);
    // Mean-value term hulled over the three exact vertex offsets: per vertex
    // the u- and v-parts hull the four Jacobian-endpoint products (the
    // per-vertex offset intervals are rounding-wide only), then the term
    // hulls over the vertices. Sound by convexity (see the offset comment)
    // and pointwise contained in the axis-aligned-box form it replaces.
    let termLo = Number.POSITIVE_INFINITY;
    let termHi = Number.NEGATIVE_INFINITY;
    for (let cellVertex = 0; cellVertex < 3; cellVertex += 1) {
      const ouLo = offsetULo[cellVertex];
      const ouHi = offsetUHi[cellVertex];
      const ovLo = offsetVLo[cellVertex];
      const ovHi = offsetVHi[cellVertex];
      const ru0 = residualGradientULo * ouLo;
      const ru1 = residualGradientULo * ouHi;
      const ru2 = residualGradientUHi * ouLo;
      const ru3 = residualGradientUHi * ouHi;
      const rv0 = residualGradientVLo * ovLo;
      const rv1 = residualGradientVLo * ovHi;
      const rv2 = residualGradientVHi * ovLo;
      const rv3 = residualGradientVHi * ovHi;
      const vertexLo = fastCheckedAddLo(
        fastWidenLo(Math.min(Math.min(ru0, ru1), Math.min(ru2, ru3))),
        fastWidenLo(Math.min(Math.min(rv0, rv1), Math.min(rv2, rv3)))
      );
      const vertexHi = fastCheckedAddHi(
        fastWidenHi(Math.max(Math.max(ru0, ru1), Math.max(ru2, ru3))),
        fastWidenHi(Math.max(Math.max(rv0, rv1), Math.max(rv2, rv3)))
      );
      if (vertexLo < termLo) termLo = vertexLo;
      if (vertexHi > termHi) termHi = vertexHi;
    }
    const residualLo = fastCheckedAddLo(residualCentreLo, termLo);
    const residualHi = fastCheckedAddHi(residualCentreHi, termHi);
    if (!Number.isFinite(residualLo) || !Number.isFinite(residualHi) || residualLo > residualHi) {
      return null;
    }
    residuals.push(outwardInterval(residualLo, residualHi));
  }
  return Object.freeze({ xMm: residuals[0], yMm: residuals[1], zMm: residuals[2] });
}

// Reusable core scratch (single-threaded proof kernel).
const fastCoreArtifactAtLo = new Float64Array(9);
const fastCoreArtifactAtHi = new Float64Array(9);
const fastCoreOffsetULo = new Float64Array(3);
const fastCoreOffsetUHi = new Float64Array(3);
const fastCoreOffsetVLo = new Float64Array(3);
const fastCoreOffsetVHi = new Float64Array(3);
const fastCoreJacobianDuLo = new Float64Array(3);
const fastCoreJacobianDuHi = new Float64Array(3);
const fastCoreJacobianDvLo = new Float64Array(3);
const fastCoreJacobianDvHi = new Float64Array(3);
const fastWrapperULo = new Float64Array(3);
const fastWrapperUHi = new Float64Array(3);
const fastWrapperVLo = new Float64Array(3);
const fastWrapperVHi = new Float64Array(3);
const fastWrapperWeightLo = new Float64Array(9);
const fastWrapperWeightHi = new Float64Array(9);
const fastWrapperArtifactLo = new Float64Array(9);
const fastWrapperArtifactHi = new Float64Array(9);
