import { sha256Utf8 } from './incrementalSha256';

export const OUTWARD_FLOAT64_INTERVAL_VERSION =
  'potfoundry.outward-float64-interval/v2' as const;
export const OUTWARD_FLOAT64_INTERVAL_PROOF_SHA256 = sha256Utf8(
  [
    OUTWARD_FLOAT64_INTERVAL_VERSION,
    'nextUp and nextDown step one IEEE-754 binary64 encoding with explicit signed-zero and infinity handling',
    'basic-operation endpoints are widened by one representable value after each binary64 operation',
    'multiplication evaluates all four endpoint products before outward min/max selection',
    'square and Euclidean-norm bounds use nonnegative monotonic branches with outward multiplication and addition',
    'every square-root endpoint is accepted only after an exact BigInt dyadic postcondition proves candidate^2 is on the required outward side',
    'square-root correction is bounded and refuses if the runtime seed cannot be certified within the declared step cap',
    'picometre conversion decomposes the exact binary64 significand and exponent and applies exact BigInt ceiling after multiplying by 1000000000',
    'NaN, invalid intervals, division through zero, nonfinite proof bounds, and out-of-envelope conversion refuse',
  ].join('\n')
);

export interface OutwardInterval {
  readonly lower: number;
  readonly upper: number;
}

const scratch = new ArrayBuffer(8);
const scratchFloat = new Float64Array(scratch);
const scratchBits = new BigUint64Array(scratch);
const SIGN_MASK = 1n << 63n;
const FRACTION_MASK = (1n << 52n) - 1n;
const EXPONENT_MASK = 0x7ffn;
const PICOMETRES_PER_MILLIMETRE = 1_000_000_000n;
const MAX_CERTIFICATION_PM = 1_000_000_000_000_000_000n;
const MAX_SQRT_CORRECTION_STEPS = 8;

function assertNotNaN(value: number, label: string): void {
  if (Number.isNaN(value)) throw new RangeError(`${label} must not be NaN`);
}

function finiteInterval(lower: number, upper: number): OutwardInterval {
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) {
    throw new RangeError('Certification intervals require finite ordered endpoints');
  }
  return { lower, upper };
}

export function nextFloat64Up(value: number): number {
  assertNotNaN(value, 'value');
  if (value === Number.POSITIVE_INFINITY) return value;
  if (value === Number.NEGATIVE_INFINITY) return -Number.MAX_VALUE;
  if (value === 0) return Number.MIN_VALUE;
  scratchFloat[0] = value;
  scratchBits[0] += value > 0 ? 1n : -1n;
  return scratchFloat[0];
}

export function nextFloat64Down(value: number): number {
  assertNotNaN(value, 'value');
  if (value === Number.NEGATIVE_INFINITY) return value;
  if (value === Number.POSITIVE_INFINITY) return Number.MAX_VALUE;
  if (value === 0) return -Number.MIN_VALUE;
  scratchFloat[0] = value;
  scratchBits[0] += value > 0 ? -1n : 1n;
  return scratchFloat[0];
}

export function outwardInterval(lower: number, upper = lower): OutwardInterval {
  return finiteInterval(lower, upper);
}

export function outwardAdd(left: OutwardInterval, right: OutwardInterval): OutwardInterval {
  return finiteInterval(
    nextFloat64Down(left.lower + right.lower),
    nextFloat64Up(left.upper + right.upper)
  );
}

export function outwardSubtract(left: OutwardInterval, right: OutwardInterval): OutwardInterval {
  return finiteInterval(
    nextFloat64Down(left.lower - right.upper),
    nextFloat64Up(left.upper - right.lower)
  );
}

export function outwardMultiply(left: OutwardInterval, right: OutwardInterval): OutwardInterval {
  const products = [
    left.lower * right.lower,
    left.lower * right.upper,
    left.upper * right.lower,
    left.upper * right.upper,
  ];
  if (products.some((value) => Number.isNaN(value))) {
    throw new RangeError('Interval multiplication produced NaN');
  }
  return finiteInterval(
    nextFloat64Down(Math.min(...products)),
    nextFloat64Up(Math.max(...products))
  );
}

export function outwardDivide(left: OutwardInterval, right: OutwardInterval): OutwardInterval {
  if (right.lower <= 0 && right.upper >= 0) {
    throw new RangeError('Interval division through zero is not certifiable');
  }
  return outwardMultiply(
    left,
    finiteInterval(nextFloat64Down(1 / right.upper), nextFloat64Up(1 / right.lower))
  );
}

export function outwardHull(left: OutwardInterval, right: OutwardInterval): OutwardInterval {
  return finiteInterval(Math.min(left.lower, right.lower), Math.max(left.upper, right.upper));
}

export function outwardSquare(value: OutwardInterval): OutwardInterval {
  const maximumAbsolute = Math.max(Math.abs(value.lower), Math.abs(value.upper));
  const upper = nextFloat64Up(maximumAbsolute * maximumAbsolute);
  if (value.lower <= 0 && value.upper >= 0) return finiteInterval(0, upper);
  const minimumAbsolute = Math.min(Math.abs(value.lower), Math.abs(value.upper));
  return finiteInterval(Math.max(0, nextFloat64Down(minimumAbsolute * minimumAbsolute)), upper);
}

interface NonnegativeDyadic {
  readonly significand: bigint;
  readonly binaryExponent: number;
}

function exactNonnegativeDyadic(value: number): NonnegativeDyadic {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Exact dyadic decomposition requires a finite nonnegative value');
  }
  if (value === 0) return { significand: 0n, binaryExponent: 0 };
  scratchFloat[0] = value;
  const bits = scratchBits[0];
  const exponentBits = (bits >> 52n) & EXPONENT_MASK;
  const fraction = bits & FRACTION_MASK;
  return {
    significand: exponentBits === 0n ? fraction : (1n << 52n) | fraction,
    binaryExponent: exponentBits === 0n ? -1074 : Number(exponentBits) - 1023 - 52,
  };
}

function compareNonnegativeDyadics(
  leftSignificand: bigint,
  leftExponent: number,
  rightSignificand: bigint,
  rightExponent: number
): -1 | 0 | 1 {
  if (leftSignificand === 0n || rightSignificand === 0n) {
    return leftSignificand === rightSignificand ? 0 : leftSignificand === 0n ? -1 : 1;
  }
  const commonExponent = Math.min(leftExponent, rightExponent);
  const left = leftSignificand << BigInt(leftExponent - commonExponent);
  const right = rightSignificand << BigInt(rightExponent - commonExponent);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Exact sign of candidate^2 - radicand for finite nonnegative binary64 values. */
function compareExactSquareToRadicand(candidate: number, radicand: number): -1 | 0 | 1 {
  const root = exactNonnegativeDyadic(candidate);
  const value = exactNonnegativeDyadic(radicand);
  return compareNonnegativeDyadics(
    root.significand * root.significand,
    root.binaryExponent * 2,
    value.significand,
    value.binaryExponent
  );
}

function verifiedSqrtLower(radicand: number): number {
  if (radicand === 0) return 0;
  let candidate = Math.sqrt(radicand);
  for (let step = 0; step <= MAX_SQRT_CORRECTION_STEPS; step += 1) {
    if (Number.isFinite(candidate) && candidate >= 0) {
      if (compareExactSquareToRadicand(candidate, radicand) <= 0) return candidate;
      candidate = nextFloat64Down(candidate);
    } else {
      break;
    }
  }
  throw new RangeError('Runtime square-root seed could not prove a lower enclosure');
}

function verifiedSqrtUpper(radicand: number): number {
  if (radicand === 0) return 0;
  let candidate = Math.sqrt(radicand);
  for (let step = 0; step <= MAX_SQRT_CORRECTION_STEPS; step += 1) {
    if (Number.isFinite(candidate) && candidate >= 0) {
      if (compareExactSquareToRadicand(candidate, radicand) >= 0) return candidate;
      candidate = nextFloat64Up(candidate);
    } else {
      break;
    }
  }
  throw new RangeError('Runtime square-root seed could not prove an upper enclosure');
}

export function outwardSqrt(value: OutwardInterval): OutwardInterval {
  if (value.lower < 0) throw new RangeError('Square root interval must be nonnegative');
  return finiteInterval(verifiedSqrtLower(value.lower), verifiedSqrtUpper(value.upper));
}

export function outwardVectorNormUpper(
  x: OutwardInterval,
  y: OutwardInterval,
  z: OutwardInterval
): number {
  const xSquaredUpper = outwardSquare(x).upper;
  const ySquaredUpper = outwardSquare(y).upper;
  const zSquaredUpper = outwardSquare(z).upper;
  const xyUpper = nextFloat64Up(xSquaredUpper + ySquaredUpper);
  const sumUpper = nextFloat64Up(xyUpper + zSquaredUpper);
  return verifiedSqrtUpper(sumUpper);
}

/** Exact ceil(binary64 millimetres * 1e9) using integer significand arithmetic. */
export function float64UpperMillimetresToPicometres(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Millimetre upper bound must be finite and nonnegative');
  }
  if (value === 0) return 0n;
  scratchFloat[0] = value;
  const bits = scratchBits[0];
  if ((bits & SIGN_MASK) !== 0n) {
    throw new RangeError('Millimetre upper bound must be nonnegative');
  }
  const exponentBits = (bits >> 52n) & EXPONENT_MASK;
  const fraction = bits & FRACTION_MASK;
  const significand = exponentBits === 0n ? fraction : (1n << 52n) | fraction;
  const binaryExponent =
    exponentBits === 0n ? -1074 : Number(exponentBits) - 1023 - 52;
  let numerator = significand * PICOMETRES_PER_MILLIMETRE;
  let result: bigint;
  if (binaryExponent >= 0) {
    result = numerator << BigInt(binaryExponent);
  } else {
    const denominator = 1n << BigInt(-binaryExponent);
    result = (numerator + denominator - 1n) / denominator;
  }
  if (result > MAX_CERTIFICATION_PM) {
    throw new RangeError('Picometre upper bound exceeds the certification envelope');
  }
  return result;
}
