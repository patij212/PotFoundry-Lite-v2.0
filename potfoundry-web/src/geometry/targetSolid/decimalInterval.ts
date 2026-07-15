import Decimal from 'decimal.js';
import { sha256Utf8 } from './incrementalSha256';
import {
  nextFloat64Down,
  nextFloat64Up,
  outwardInterval,
  type OutwardInterval,
} from './outwardFloat64Interval';

export const DECIMAL_INTERVAL_VERSION = 'potfoundry.decimal-interval/v6' as const;
export const DECIMAL_INTERVAL_DEPENDENCY_VERSION = '10.6.0' as const;
export const DECIMAL_INTERVAL_NPM_INTEGRITY =
  'sha512-YpgQiITW3JXGntzdUmyUR1V812Hn8T1YVXhCu+wO3OpS4eU9l4YdD3qjyiKdV6mvV29zapkMeD390UVEf2lkUg==' as const;
export const DECIMAL_INTERVAL_BUNDLED_SOURCE_SHA256 =
  '45e6ecc0a500fee6439acdf67ee2e9322aab57e6ea0409ef52993dedbba8cf19' as const;

const PRECISION = 100;
const MIN_ADMITTED_ADJUSTED_EXPONENT = -100_000;
const MAX_ADMITTED_ADJUSTED_EXPONENT = 100_000;
const MIN_INTERNAL_ADJUSTED_EXPONENT = -1_000_000;
const MAX_INTERNAL_ADJUSTED_EXPONENT = 1_000_000;
const MAX_EXP_ARGUMENT = new Decimal('230000');
const MAX_TRIG_ARGUMENT = new Decimal('1000000');
const DECIMAL_CONFIG = Object.freeze({
  precision: PRECISION,
  minE: MIN_INTERNAL_ADJUSTED_EXPONENT,
  maxE: MAX_INTERNAL_ADJUSTED_EXPONENT,
  modulo: Decimal.ROUND_DOWN,
  toExpNeg: -100,
  toExpPos: 100,
});

const LowerDecimal = Decimal.clone({
  ...DECIMAL_CONFIG,
  rounding: Decimal.ROUND_FLOOR,
});
const UpperDecimal = Decimal.clone({
  ...DECIMAL_CONFIG,
  rounding: Decimal.ROUND_CEIL,
});

export const DECIMAL_INTERVAL_PROOF_SHA256 = sha256Utf8(
  [
    DECIMAL_INTERVAL_VERSION,
    `decimal.js=${DECIMAL_INTERVAL_DEPENDENCY_VERSION}`,
    `decimal.js-source-sha256=${DECIMAL_INTERVAL_BUNDLED_SOURCE_SHA256}`,
    `precision=${PRECISION}`,
    `admitted-adjusted-exponent=[${MIN_ADMITTED_ADJUSTED_EXPONENT},${MAX_ADMITTED_ADJUSTED_EXPONENT}]`,
    `internal-adjusted-exponent=[${MIN_INTERNAL_ADJUSTED_EXPONENT},${MAX_INTERNAL_ADJUSTED_EXPONENT}]`,
    `exp-argument=[-${MAX_EXP_ARGUMENT.toString()},${MAX_EXP_ARGUMENT.toString()}]`,
    `trig-absolute-argument<=${MAX_TRIG_ARGUMENT.toString()}`,
    'lower operations use ROUND_FLOOR and upper operations use ROUND_CEIL on separately cloned constructors',
    'binary64 inputs are converted to exact decimal literals with BigInt significand-times-power-of-two arithmetic',
    'add/subtract/multiply/divide/square/sqrt/exp/ln/power/absolute/minimum/maximum use inclusion-monotone interval extensions',
    'signed transcendental endpoint images hull both directed clone results because sign restoration inside decimal.js may reverse their numeric ordering',
    'floor/ceiling/round-to-nearest-ties-even/sign use monotone endpoint images; step uses an all-pairs comparison enclosure',
    'fractional-part returns its endpoint image only within one floor cell and otherwise returns the closed hull [0,1]',
    'real power admits a zero lower base only when the exponent interval is strictly positive and includes the continuous value zero',
    'the mathematical constant pi is enclosed by directed inverse-cosine of exact negative one',
    'sine/cosine evaluate both endpoints and conservatively include exact extrema whenever an interval critical-point test may contain an integer period index',
    'atan2(y,x) normalizes signed zero to mathematical zero, evaluates every rectangle corner with directed rounding, and returns [-pi,pi] when the principal-angle branch cut is reached from below',
    'conversion back to binary64 compares the exact binary64 candidate with each decimal endpoint and steps outward when necessary',
    'nonfinite values, invalid domains, overlong literals, division through zero, and exponent overflow refuse',
    'the internal exponent range strictly contains every admitted binary-operation result; out-of-envelope results refuse before reuse',
  ].join('\n')
);

export interface DecimalInterval {
  readonly lower: string;
  readonly upper: string;
}

const MAX_LITERAL_LENGTH = 4096;
const FINITE_DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const floatScratch = new ArrayBuffer(8);
const floatView = new Float64Array(floatScratch);
const bitsView = new BigUint64Array(floatScratch);
const SIGN_MASK = 1n << 63n;
const FRACTION_MASK = (1n << 52n) - 1n;
const EXPONENT_MASK = 0x7ffn;

function assertFiniteLiteral(value: string, label: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_LITERAL_LENGTH ||
    !FINITE_DECIMAL_RE.test(value)
  ) {
    throw new RangeError(`${label} must be a bounded finite decimal literal`);
  }
  const parsed = new Decimal(value);
  if (!parsed.isFinite()) throw new RangeError(`${label} must be finite`);
  if (
    !parsed.isZero() &&
    (parsed.e < MIN_ADMITTED_ADJUSTED_EXPONENT ||
      parsed.e > MAX_ADMITTED_ADJUSTED_EXPONENT)
  ) {
    throw new RangeError(
      `${label} adjusted exponent must be in [${MIN_ADMITTED_ADJUSTED_EXPONENT}, ${MAX_ADMITTED_ADJUSTED_EXPONENT}]`
    );
  }
}

function exactInterval(lower: string, upper: string): DecimalInterval {
  assertFiniteLiteral(lower, 'lower');
  assertFiniteLiteral(upper, 'upper');
  if (new Decimal(lower).greaterThan(upper)) {
    throw new RangeError('Decimal interval endpoints must be ordered');
  }
  return Object.freeze({ lower, upper });
}

function lower(value: string): InstanceType<typeof LowerDecimal> {
  return new LowerDecimal(value);
}

function upper(value: string): InstanceType<typeof UpperDecimal> {
  return new UpperDecimal(value);
}

function lowerString(value: InstanceType<typeof LowerDecimal>): string {
  if (!value.isFinite()) throw new RangeError('Decimal lower operation was nonfinite');
  return value.toString();
}

function upperString(value: InstanceType<typeof UpperDecimal>): string {
  if (!value.isFinite()) throw new RangeError('Decimal upper operation was nonfinite');
  return value.toString();
}

/** Exact decimal spelling of a finite IEEE-754 binary64 value. */
export function exactFloat64Decimal(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('Binary64 value must be finite');
  if (value === 0) return '0';
  floatView[0] = value;
  const bits = bitsView[0];
  const negative = (bits & SIGN_MASK) !== 0n;
  const exponentBits = (bits >> 52n) & EXPONENT_MASK;
  const fraction = bits & FRACTION_MASK;
  const significand = exponentBits === 0n ? fraction : (1n << 52n) | fraction;
  const binaryExponent = exponentBits === 0n ? -1074 : Number(exponentBits) - 1023 - 52;
  let magnitude: string;
  if (binaryExponent >= 0) {
    magnitude = (significand << BigInt(binaryExponent)).toString();
  } else {
    const decimalPlaces = -binaryExponent;
    const numerator = significand * 5n ** BigInt(decimalPlaces);
    const digits = numerator.toString().padStart(decimalPlaces + 1, '0');
    const split = digits.length - decimalPlaces;
    magnitude = `${digits.slice(0, split)}.${digits.slice(split)}`
      .replace(/0+$/, '')
      .replace(/\.$/, '');
  }
  return `${negative ? '-' : ''}${magnitude}`;
}

export function decimalPoint(value: string): DecimalInterval {
  assertFiniteLiteral(value, 'value');
  return exactInterval(value, value);
}

export function decimalInterval(lowerEndpoint: string, upperEndpoint: string): DecimalInterval {
  return exactInterval(lowerEndpoint, upperEndpoint);
}

export function decimalIntervalFromFloat64(value: number): DecimalInterval {
  const exact = exactFloat64Decimal(value);
  return exactInterval(exact, exact);
}

export function decimalHull(left: DecimalInterval, right: DecimalInterval): DecimalInterval {
  const lo = new Decimal(left.lower).lessThan(right.lower) ? left.lower : right.lower;
  const hi = new Decimal(left.upper).greaterThan(right.upper) ? left.upper : right.upper;
  return exactInterval(lo, hi);
}

export function decimalAdd(left: DecimalInterval, right: DecimalInterval): DecimalInterval {
  return exactInterval(
    lowerString(lower(left.lower).plus(lower(right.lower))),
    upperString(upper(left.upper).plus(upper(right.upper)))
  );
}

export function decimalSubtract(left: DecimalInterval, right: DecimalInterval): DecimalInterval {
  return exactInterval(
    lowerString(lower(left.lower).minus(lower(right.upper))),
    upperString(upper(left.upper).minus(upper(right.lower)))
  );
}

export function decimalNegate(value: DecimalInterval): DecimalInterval {
  return exactInterval(lowerString(lower(value.upper).negated()), upperString(upper(value.lower).negated()));
}

export function decimalAbsolute(value: DecimalInterval): DecimalInterval {
  const lowerEndpoint = new Decimal(value.lower);
  const upperEndpoint = new Decimal(value.upper);
  if (lowerEndpoint.greaterThanOrEqualTo(0)) return exactInterval(value.lower, value.upper);
  if (upperEndpoint.lessThanOrEqualTo(0)) return decimalNegate(value);
  const magnitude = Decimal.max(lowerEndpoint.abs(), upperEndpoint.abs()).toString();
  return exactInterval('0', magnitude);
}

export function decimalMinimum(
  left: DecimalInterval,
  right: DecimalInterval
): DecimalInterval {
  return exactInterval(
    Decimal.min(left.lower, right.lower).toString(),
    Decimal.min(left.upper, right.upper).toString()
  );
}

export function decimalMaximum(
  left: DecimalInterval,
  right: DecimalInterval
): DecimalInterval {
  return exactInterval(
    Decimal.max(left.lower, right.lower).toString(),
    Decimal.max(left.upper, right.upper).toString()
  );
}

/** Monotone real floor, returned as an exact integer-valued interval. */
export function decimalFloor(value: DecimalInterval): DecimalInterval {
  return exactInterval(
    new Decimal(value.lower).floor().toString(),
    new Decimal(value.upper).floor().toString()
  );
}

/** Monotone real ceiling, returned as an exact integer-valued interval. */
export function decimalCeil(value: DecimalInterval): DecimalInterval {
  return exactInterval(
    new Decimal(value.lower).ceil().toString(),
    new Decimal(value.upper).ceil().toString()
  );
}

/** WGSL round semantics: nearest integer with exact halfway cases resolved to even. */
export function decimalRoundTiesToEven(value: DecimalInterval): DecimalInterval {
  return exactInterval(
    new Decimal(value.lower).toNearest(1, Decimal.ROUND_HALF_EVEN).toString(),
    new Decimal(value.upper).toNearest(1, Decimal.ROUND_HALF_EVEN).toString()
  );
}

/** WGSL-style fractional part x-floor(x), enclosed over the complete input interval. */
export function decimalFract(value: DecimalInterval): DecimalInterval {
  const lowerFloor = new Decimal(value.lower).floor();
  const upperFloor = new Decimal(value.upper).floor();
  if (!lowerFloor.equals(upperFloor)) return exactInterval('0', '1');
  return exactInterval(
    lowerString(lower(value.lower).minus(lower(lowerFloor.toString()))),
    upperString(upper(value.upper).minus(upper(upperFloor.toString())))
  );
}

/** Pointwise sign enclosure with sign(0)=0. */
export function decimalSign(value: DecimalInterval): DecimalInterval {
  const lo = new Decimal(value.lower);
  const hi = new Decimal(value.upper);
  if (lo.greaterThan(0)) return exactInterval('1', '1');
  if (hi.lessThan(0)) return exactInterval('-1', '-1');
  if (lo.isZero() && hi.isZero()) return exactInterval('0', '0');
  return exactInterval(lo.lessThan(0) ? '-1' : '0', hi.greaterThan(0) ? '1' : '0');
}

/** WGSL step(edge,x): one iff edge <= x, conservatively enclosed for two intervals. */
export function decimalStep(
  edge: DecimalInterval,
  value: DecimalInterval
): DecimalInterval {
  if (new Decimal(value.upper).lessThan(edge.lower)) return exactInterval('0', '0');
  if (new Decimal(value.lower).greaterThanOrEqualTo(edge.upper)) {
    return exactInterval('1', '1');
  }
  return exactInterval('0', '1');
}

export function decimalMultiply(left: DecimalInterval, right: DecimalInterval): DecimalInterval {
  const lowerProducts = [
    lower(left.lower).times(lower(right.lower)),
    lower(left.lower).times(lower(right.upper)),
    lower(left.upper).times(lower(right.lower)),
    lower(left.upper).times(lower(right.upper)),
  ];
  const upperProducts = [
    upper(left.lower).times(upper(right.lower)),
    upper(left.lower).times(upper(right.upper)),
    upper(left.upper).times(upper(right.lower)),
    upper(left.upper).times(upper(right.upper)),
  ];
  const lo = lowerProducts.reduce((best, candidate) =>
    candidate.lessThan(best) ? candidate : best
  );
  const hi = upperProducts.reduce((best, candidate) =>
    candidate.greaterThan(best) ? candidate : best
  );
  return exactInterval(lowerString(lo), upperString(hi));
}

export function decimalReciprocal(value: DecimalInterval): DecimalInterval {
  if (new Decimal(value.lower).lessThanOrEqualTo(0) && new Decimal(value.upper).greaterThanOrEqualTo(0)) {
    throw new RangeError('Decimal interval division through zero is not certifiable');
  }
  return exactInterval(
    lowerString(lower('1').dividedBy(lower(value.upper))),
    upperString(upper('1').dividedBy(upper(value.lower)))
  );
}

export function decimalDivide(left: DecimalInterval, right: DecimalInterval): DecimalInterval {
  return decimalMultiply(left, decimalReciprocal(right));
}

export function decimalSquare(value: DecimalInterval): DecimalInterval {
  const containsZero =
    new Decimal(value.lower).lessThanOrEqualTo(0) &&
    new Decimal(value.upper).greaterThanOrEqualTo(0);
  const lowerMagnitude = Decimal.min(new Decimal(value.lower).abs(), new Decimal(value.upper).abs());
  const upperMagnitude = Decimal.max(new Decimal(value.lower).abs(), new Decimal(value.upper).abs());
  return exactInterval(
    containsZero ? '0' : lowerString(lower(lowerMagnitude.toString()).times(lower(lowerMagnitude.toString()))),
    upperString(upper(upperMagnitude.toString()).times(upper(upperMagnitude.toString())))
  );
}

export function decimalSqrt(value: DecimalInterval): DecimalInterval {
  if (new Decimal(value.lower).isNegative()) {
    throw new RangeError('Decimal square root interval must be nonnegative');
  }
  return exactInterval(
    lowerString(lower(value.lower).squareRoot()),
    upperString(upper(value.upper).squareRoot())
  );
}

export function decimalExp(value: DecimalInterval): DecimalInterval {
  if (
    new Decimal(value.lower).lessThan(MAX_EXP_ARGUMENT.negated()) ||
    new Decimal(value.upper).greaterThan(MAX_EXP_ARGUMENT)
  ) {
    throw new RangeError('Decimal exponential argument exceeds the certified envelope');
  }
  return exactInterval(
    lowerString(lower(value.lower).exp()),
    upperString(upper(value.upper).exp())
  );
}

export function decimalLn(value: DecimalInterval): DecimalInterval {
  if (new Decimal(value.lower).lessThanOrEqualTo(0)) {
    throw new RangeError('Decimal logarithm interval must be strictly positive');
  }
  const lowerCandidates = [
    lower(value.lower).naturalLogarithm(),
    upper(value.lower).naturalLogarithm(),
  ];
  const upperCandidates = [
    lower(value.upper).naturalLogarithm(),
    upper(value.upper).naturalLogarithm(),
  ];
  const lowerBound = lowerCandidates.reduce((best, candidate) =>
    candidate.lessThan(best) ? candidate : best
  );
  const upperBound = upperCandidates.reduce((best, candidate) =>
    candidate.greaterThan(best) ? candidate : best
  );
  return exactInterval(lowerBound.toString(), upperBound.toString());
}

/** Nonnegative-base real power interval; a zero base requires a strictly positive exponent. */
export function decimalPow(base: DecimalInterval, exponent: DecimalInterval): DecimalInterval {
  const baseLower = new Decimal(base.lower);
  const baseUpper = new Decimal(base.upper);
  if (baseLower.isNegative()) {
    throw new RangeError('Decimal real-power base interval must be nonnegative');
  }
  if (baseLower.isZero()) {
    const exponentLower = new Decimal(exponent.lower);
    if (exponentLower.lessThanOrEqualTo(0)) {
      throw new RangeError(
        'Decimal real-power exponent interval must be strictly positive when the base may be zero'
      );
    }
    if (baseUpper.isZero()) return exactInterval('0', '0');
    const exponentEndpoint = baseUpper.lessThanOrEqualTo(1)
      ? decimalPoint(exponent.lower)
      : decimalPoint(exponent.upper);
    const upperBound = decimalExp(
      decimalMultiply(exponentEndpoint, decimalLn(decimalPoint(base.upper)))
    );
    return exactInterval('0', upperBound.upper);
  }
  return decimalExp(decimalMultiply(exponent, decimalLn(base)));
}

function integerMayExist(value: DecimalInterval): boolean {
  const firstInteger = new Decimal(value.lower).ceil();
  const lastInteger = new Decimal(value.upper).floor();
  return firstInteger.lessThanOrEqualTo(lastInteger);
}

function criticalIndexInterval(
  value: DecimalInterval,
  offset: DecimalInterval,
  period: DecimalInterval
): DecimalInterval {
  return decimalDivide(decimalSubtract(value, offset), period);
}

export function decimalPi(): DecimalInterval {
  return exactInterval(
    lowerString(lower('-1').inverseCosine()),
    upperString(upper('-1').inverseCosine())
  );
}

function endpointTrigHull(
  value: DecimalInterval,
  operation: 'sin' | 'cos'
): DecimalInterval {
  const candidates = [
    operation === 'sin' ? lower(value.lower).sine() : lower(value.lower).cosine(),
    operation === 'sin' ? lower(value.upper).sine() : lower(value.upper).cosine(),
    operation === 'sin' ? upper(value.lower).sine() : upper(value.lower).cosine(),
    operation === 'sin' ? upper(value.upper).sine() : upper(value.upper).cosine(),
  ];
  const lowerBound = candidates.reduce((best, candidate) =>
    candidate.lessThan(best) ? candidate : best
  );
  const upperBound = candidates.reduce((best, candidate) =>
    candidate.greaterThan(best) ? candidate : best
  );
  return exactInterval(
    lowerBound.toString(),
    upperBound.toString()
  );
}

export function decimalSin(value: DecimalInterval): DecimalInterval {
  if (
    new Decimal(value.lower).abs().greaterThan(MAX_TRIG_ARGUMENT) ||
    new Decimal(value.upper).abs().greaterThan(MAX_TRIG_ARGUMENT)
  ) {
    throw new RangeError('Decimal sine argument exceeds the certified envelope');
  }
  const pi = decimalPi();
  const halfPi = decimalDivide(pi, decimalPoint('2'));
  const twoPi = decimalMultiply(pi, decimalPoint('2'));
  const maximumIndices = criticalIndexInterval(value, halfPi, twoPi);
  const minimumIndices = criticalIndexInterval(value, decimalNegate(halfPi), twoPi);
  const endpoints = endpointTrigHull(value, 'sin');
  return exactInterval(
    integerMayExist(minimumIndices) ? '-1' : endpoints.lower,
    integerMayExist(maximumIndices) ? '1' : endpoints.upper
  );
}

export function decimalCos(value: DecimalInterval): DecimalInterval {
  if (
    new Decimal(value.lower).abs().greaterThan(MAX_TRIG_ARGUMENT) ||
    new Decimal(value.upper).abs().greaterThan(MAX_TRIG_ARGUMENT)
  ) {
    throw new RangeError('Decimal cosine argument exceeds the certified envelope');
  }
  const pi = decimalPi();
  const twoPi = decimalMultiply(pi, decimalPoint('2'));
  const maximumIndices = criticalIndexInterval(value, decimalPoint('0'), twoPi);
  const minimumIndices = criticalIndexInterval(value, pi, twoPi);
  const endpoints = endpointTrigHull(value, 'cos');
  return exactInterval(
    integerMayExist(minimumIndices) ? '-1' : endpoints.lower,
    integerMayExist(maximumIndices) ? '1' : endpoints.upper
  );
}

function mathematicalZero(value: string): string {
  return new Decimal(value).isZero() ? '0' : value;
}

/**
 * Principal atan2(y,x) over a closed rectangle, with range [-pi, pi].
 *
 * Away from the negative-x branch cut, each partial derivative has constant
 * sign along an axis-parallel edge, so every extrema is attained at a corner.
 * Reaching the branch cut from negative y additionally includes both limiting
 * angles and therefore requires the complete principal range.
 */
export function decimalAtan2(
  y: DecimalInterval,
  x: DecimalInterval
): DecimalInterval {
  const xLower = new Decimal(x.lower);
  const yLower = new Decimal(y.lower);
  const yUpper = new Decimal(y.upper);
  if (
    xLower.lessThan(0) &&
    yLower.lessThan(0) &&
    yUpper.greaterThanOrEqualTo(0)
  ) {
    const pi = decimalPi();
    return exactInterval(decimalNegate(pi).lower, pi.upper);
  }

  const corners = [
    [mathematicalZero(y.lower), mathematicalZero(x.lower)],
    [mathematicalZero(y.lower), mathematicalZero(x.upper)],
    [mathematicalZero(y.upper), mathematicalZero(x.lower)],
    [mathematicalZero(y.upper), mathematicalZero(x.upper)],
  ] as const;
  const angleCandidates = corners.flatMap(([yEndpoint, xEndpoint]) => [
    LowerDecimal.atan2(yEndpoint, xEndpoint),
    UpperDecimal.atan2(yEndpoint, xEndpoint),
  ]);
  const lowerBound = angleCandidates.reduce((best, candidate) =>
    candidate.lessThan(best) ? candidate : best
  );
  const upperBound = angleCandidates.reduce((best, candidate) =>
    candidate.greaterThan(best) ? candidate : best
  );
  return exactInterval(lowerBound.toString(), upperBound.toString());
}

function exactCandidate(value: number): Decimal {
  return new Decimal(exactFloat64Decimal(value));
}

/** Convert a decimal enclosure to a finite binary64 enclosure without inward rounding. */
export function decimalToOutwardFloat64(value: DecimalInterval): OutwardInterval {
  let lo = Number(value.lower);
  let hi = Number(value.upper);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new RangeError('Decimal interval is outside the finite binary64 envelope');
  }
  if (exactCandidate(lo).greaterThan(value.lower)) lo = nextFloat64Down(lo);
  if (exactCandidate(hi).lessThan(value.upper)) hi = nextFloat64Up(hi);
  return outwardInterval(lo, hi);
}
