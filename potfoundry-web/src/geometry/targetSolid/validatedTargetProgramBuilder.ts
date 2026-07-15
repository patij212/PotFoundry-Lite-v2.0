import {
  canonicalizeCertificationJson,
  type CanonicalJsonValue,
} from './canonicalCertificationJson';
import { decimalPoint, exactFloat64Decimal } from './decimalInterval';
import { sha256Utf8 } from './incrementalSha256';
import { VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION } from './validatedResidualProgram';

export const VALIDATED_TARGET_PROGRAM_BUILDER_VERSION =
  'potfoundry.validated-target-program-builder/v3' as const;
export const VALIDATED_TARGET_PROGRAM_BUILDER_PROOF_SHA256 = sha256Utf8(
  [
    VALIDATED_TARGET_PROGRAM_BUILDER_VERSION,
    `output-schema=${VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION}`,
    'every expression is an opaque builder-owned reference to a previously emitted SSA node',
    'structurally identical operations are common-subexpression eliminated without algebraic reassociation',
    'constants are bounded exact decimal strings; finite binary64 constants use exact dyadic decimal expansion',
    'pi is emitted as a semantic leaf denoting exact mathematical pi rather than a decimal approximation',
    'clamp expands to min(max(value,low),high)',
    'mix expands to left*(1-amount)+right*amount in WGSL-specified evaluation order',
    'smoothstep expands to t*t*(3-2*t) with t=clamp((x-edge0)/(edge1-edge0),0,1)',
    'atan2(y,x) is emitted as an ordered binary operation without argument reordering',
    'PCG2D unit-lane operations retain the ordered integer cell-x/cell-y operand pair for compiler validation and backend caching',
    'the validated SSA compiler independently rejects malformed nodes, cycles, forward references, and invalid targets',
  ].join('\n')
);

export type TargetUnaryOperation =
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

export type TargetBinaryOperation =
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

declare const targetExpressionReferenceBrand: unique symbol;

export interface TargetExpressionReference {
  readonly [targetExpressionReferenceBrand]: true;
}

export interface ValidatedTargetProgramMetadata {
  readonly evaluatorId: string;
  readonly evaluatorVersion: string;
  readonly patchId: string;
}

export interface ValidatedTargetCoordinates {
  readonly x: TargetExpressionReference;
  readonly y: TargetExpressionReference;
  readonly z: TargetExpressionReference;
}

interface RegisteredReference {
  readonly builder: ValidatedTargetProgramBuilder;
  readonly index: number;
}

const referenceRegistry = new WeakMap<object, RegisteredReference>();

function builderError(message: string): never {
  throw new TypeError(`Validated target program builder refused: ${message}`);
}

/**
 * Deterministic SSA authoring layer. This is a convenience and performance
 * boundary, not a proof boundary: the canonical result is always recompiled
 * and validated by validatedResidualProgram.ts.
 */
export class ValidatedTargetProgramBuilder {
  private readonly nodes: CanonicalJsonValue[] = [];
  private readonly commonSubexpressions = new Map<string, TargetExpressionReference>();

  get nodeCount(): number {
    return this.nodes.length;
  }

  private reference(index: number): TargetExpressionReference {
    const value = Object.freeze({}) as TargetExpressionReference;
    referenceRegistry.set(value, Object.freeze({ builder: this, index }));
    return value;
  }

  private indexOf(value: TargetExpressionReference, label: string): number {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
      builderError(`${label} is not an expression reference`);
    }
    const registered = referenceRegistry.get(value);
    if (registered === undefined || registered.builder !== this) {
      builderError(`${label} does not belong to this builder`);
    }
    return registered.index;
  }

  private emit(key: string, node: CanonicalJsonValue): TargetExpressionReference {
    const existing = this.commonSubexpressions.get(key);
    if (existing !== undefined) return existing;
    const reference = this.reference(this.nodes.length);
    this.nodes.push(Object.freeze(node as object) as CanonicalJsonValue);
    this.commonSubexpressions.set(key, reference);
    return reference;
  }

  u(): TargetExpressionReference {
    return this.emit('leaf:u', { op: 'u' });
  }

  v(): TargetExpressionReference {
    return this.emit('leaf:v', { op: 'v' });
  }

  pi(): TargetExpressionReference {
    return this.emit('leaf:pi', { op: 'pi' });
  }

  tau(): TargetExpressionReference {
    return this.multiply(this.constantDecimal('2'), this.pi());
  }

  constantDecimal(value: string): TargetExpressionReference {
    let exact: string;
    try {
      exact = decimalPoint(value).lower;
    } catch (error) {
      builderError(
        error instanceof Error ? `constant refused: ${error.message}` : 'constant is invalid'
      );
    }
    return this.emit(`constant:${exact}`, { op: 'constant', value: exact });
  }

  constantFloat64(value: number): TargetExpressionReference {
    return this.constantDecimal(exactFloat64Decimal(value));
  }

  unary(
    operation: TargetUnaryOperation,
    argument: TargetExpressionReference
  ): TargetExpressionReference {
    const arg = this.indexOf(argument, `${operation} argument`);
    return this.emit(`${operation}:${arg}`, { arg: arg.toString(), op: operation });
  }

  binary(
    operation: TargetBinaryOperation,
    leftValue: TargetExpressionReference,
    rightValue: TargetExpressionReference
  ): TargetExpressionReference {
    const left = this.indexOf(leftValue, `${operation} left operand`);
    const right = this.indexOf(rightValue, `${operation} right operand`);
    return this.emit(`${operation}:${left}:${right}`, {
      left: left.toString(),
      op: operation,
      right: right.toString(),
    });
  }

  negate(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('negate', value);
  }

  absolute(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('absolute', value);
  }

  square(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('square', value);
  }

  sqrt(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('sqrt', value);
  }

  exp(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('exp', value);
  }

  ln(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('ln', value);
  }

  sin(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('sin', value);
  }

  cos(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('cos', value);
  }

  floor(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('floor', value);
  }

  ceiling(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('ceiling', value);
  }

  round(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('round', value);
  }

  fractionalPart(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('fractional-part', value);
  }

  sign(value: TargetExpressionReference): TargetExpressionReference {
    return this.unary('sign', value);
  }

  add(left: TargetExpressionReference, right: TargetExpressionReference): TargetExpressionReference {
    return this.binary('add', left, right);
  }

  subtract(left: TargetExpressionReference, right: TargetExpressionReference): TargetExpressionReference {
    return this.binary('subtract', left, right);
  }

  multiply(left: TargetExpressionReference, right: TargetExpressionReference): TargetExpressionReference {
    return this.binary('multiply', left, right);
  }

  divide(left: TargetExpressionReference, right: TargetExpressionReference): TargetExpressionReference {
    return this.binary('divide', left, right);
  }

  minimum(left: TargetExpressionReference, right: TargetExpressionReference): TargetExpressionReference {
    return this.binary('minimum', left, right);
  }

  maximum(left: TargetExpressionReference, right: TargetExpressionReference): TargetExpressionReference {
    return this.binary('maximum', left, right);
  }

  power(base: TargetExpressionReference, exponent: TargetExpressionReference): TargetExpressionReference {
    return this.binary('power', base, exponent);
  }

  step(edge: TargetExpressionReference, value: TargetExpressionReference): TargetExpressionReference {
    return this.binary('step', edge, value);
  }

  atan2(y: TargetExpressionReference, x: TargetExpressionReference): TargetExpressionReference {
    return this.binary('atan2', y, x);
  }

  pcg2dUnitX(
    cellX: TargetExpressionReference,
    cellY: TargetExpressionReference
  ): TargetExpressionReference {
    return this.binary('pcg2d-unit-x', cellX, cellY);
  }

  pcg2dUnitY(
    cellX: TargetExpressionReference,
    cellY: TargetExpressionReference
  ): TargetExpressionReference {
    return this.binary('pcg2d-unit-y', cellX, cellY);
  }

  clamp(
    value: TargetExpressionReference,
    low: TargetExpressionReference,
    high: TargetExpressionReference
  ): TargetExpressionReference {
    return this.minimum(this.maximum(value, low), high);
  }

  mix(
    left: TargetExpressionReference,
    right: TargetExpressionReference,
    amount: TargetExpressionReference
  ): TargetExpressionReference {
    const one = this.constantDecimal('1');
    return this.add(
      this.multiply(left, this.subtract(one, amount)),
      this.multiply(right, amount)
    );
  }

  smoothstep(
    edge0: TargetExpressionReference,
    edge1: TargetExpressionReference,
    value: TargetExpressionReference
  ): TargetExpressionReference {
    const zero = this.constantDecimal('0');
    const one = this.constantDecimal('1');
    const two = this.constantDecimal('2');
    const three = this.constantDecimal('3');
    const t = this.clamp(
      this.divide(this.subtract(value, edge0), this.subtract(edge1, edge0)),
      zero,
      one
    );
    return this.multiply(this.square(t), this.subtract(three, this.multiply(two, t)));
  }

  length2(x: TargetExpressionReference, y: TargetExpressionReference): TargetExpressionReference {
    return this.sqrt(this.add(this.square(x), this.square(y)));
  }

  buildCanonicalProgram(
    metadata: ValidatedTargetProgramMetadata,
    target: ValidatedTargetCoordinates
  ): string {
    if (this.nodes.length === 0) builderError('program has no nodes');
    const x = this.indexOf(target.x, 'target x');
    const y = this.indexOf(target.y, 'target y');
    const z = this.indexOf(target.z, 'target z');
    return canonicalizeCertificationJson({
      evaluatorId: metadata.evaluatorId,
      evaluatorVersion: metadata.evaluatorVersion,
      nodes: this.nodes,
      patchId: metadata.patchId,
      schemaVersion: VALIDATED_RESIDUAL_SSA_PROGRAM_VERSION,
      target: { x: x.toString(), y: y.toString(), z: z.toString() },
    });
  }
}
