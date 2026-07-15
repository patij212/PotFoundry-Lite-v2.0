import { sha256Utf8 } from './incrementalSha256';

export const EXACT_IEEE754_PICOMETRE_INTERVAL_VERSION =
  'potfoundry.exact-ieee754-picometre-interval/v1' as const;
export const EXACT_IEEE754_PICOMETRE_INTERVAL_PROOF_SHA256 = sha256Utf8(
  [
    EXACT_IEEE754_PICOMETRE_INTERVAL_VERSION,
    'millimeter input must be one finite exact IEEE-754 binary32 or binary64 value',
    'sign, biased exponent, and significand are decoded from the exact bit pattern',
    'the exact dyadic rational is multiplied by exactly 1000000000 picometres per millimetre using bigint arithmetic',
    'integer division rounds independently toward negative and positive infinity',
    'signed zero is canonical mathematical zero and subnormal values remain exact dyadic rationals',
    'result width is zero for integral picometres and at most one picometre otherwise',
  ].join('\n')
);

export interface ExactPicometreInterval {
  readonly lowerPm: bigint;
  readonly upperPm: bigint;
  readonly exactIntegralPicometres: boolean;
}

const PICOMETRES_PER_MILLIMETRE = 1_000_000_000n;
const float32Bytes = new ArrayBuffer(4);
const float32View = new DataView(float32Bytes);
const float64Bytes = new ArrayBuffer(8);
const float64View = new DataView(float64Bytes);

function floorDividePositive(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator;
}

function ceilingDividePositive(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function dyadicPicometreInterval(
  negative: boolean,
  significand: bigint,
  binaryExponent: number
): ExactPicometreInterval {
  if (significand === 0n) {
    return Object.freeze({ lowerPm: 0n, upperPm: 0n, exactIntegralPicometres: true });
  }
  const scaledSignificand = significand * PICOMETRES_PER_MILLIMETRE;
  let absoluteFloor: bigint;
  let absoluteCeiling: bigint;
  if (binaryExponent >= 0) {
    absoluteFloor = scaledSignificand << BigInt(binaryExponent);
    absoluteCeiling = absoluteFloor;
  } else {
    const denominator = 1n << BigInt(-binaryExponent);
    absoluteFloor = floorDividePositive(scaledSignificand, denominator);
    absoluteCeiling = ceilingDividePositive(scaledSignificand, denominator);
  }
  return Object.freeze(
    negative
      ? {
          lowerPm: -absoluteCeiling,
          upperPm: -absoluteFloor,
          exactIntegralPicometres: absoluteFloor === absoluteCeiling,
        }
      : {
          lowerPm: absoluteFloor,
          upperPm: absoluteCeiling,
          exactIntegralPicometres: absoluteFloor === absoluteCeiling,
        }
  );
}

/** Exact outward integer-picometre enclosure of one binary32 millimetre value. */
export function binary32MillimetresToPicometres(
  value: number
): ExactPicometreInterval {
  if (!Number.isFinite(value) || Math.fround(value) !== value) {
    throw new TypeError('Value must be one finite exact IEEE-754 binary32 number');
  }
  float32View.setFloat32(0, value, false);
  const bits = float32View.getUint32(0, false);
  const negative = (bits >>> 31) !== 0;
  const biasedExponent = (bits >>> 23) & 0xff;
  const fraction = bits & 0x7fffff;
  if (biasedExponent === 0xff) {
    throw new TypeError('Value must be finite');
  }
  const significand = BigInt(
    biasedExponent === 0 ? fraction : 0x800000 + fraction
  );
  const binaryExponent = biasedExponent === 0 ? -149 : biasedExponent - 127 - 23;
  return dyadicPicometreInterval(negative, significand, binaryExponent);
}

/** Exact outward integer-picometre enclosure of one binary64 millimetre value. */
export function binary64MillimetresToPicometres(
  value: number
): ExactPicometreInterval {
  if (!Number.isFinite(value)) {
    throw new TypeError('Value must be one finite IEEE-754 binary64 number');
  }
  float64View.setFloat64(0, value, false);
  const bits = float64View.getBigUint64(0, false);
  const negative = (bits >> 63n) !== 0n;
  const biasedExponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  if (biasedExponent === 0x7ff) {
    throw new TypeError('Value must be finite');
  }
  const significand = biasedExponent === 0 ? fraction : (1n << 52n) + fraction;
  const binaryExponent = biasedExponent === 0 ? -1074 : biasedExponent - 1023 - 52;
  return dyadicPicometreInterval(negative, significand, binaryExponent);
}

export function exactIntervalDifference(
  left: ExactPicometreInterval,
  right: ExactPicometreInterval
): ExactPicometreInterval {
  const lowerPm = left.lowerPm - right.upperPm;
  const upperPm = left.upperPm - right.lowerPm;
  return Object.freeze({
    lowerPm,
    upperPm,
    exactIntegralPicometres: lowerPm === upperPm,
  });
}

export function exactIntervalAbsoluteUpper(interval: ExactPicometreInterval): bigint {
  const lowerMagnitude = interval.lowerPm < 0n ? -interval.lowerPm : interval.lowerPm;
  const upperMagnitude = interval.upperPm < 0n ? -interval.upperPm : interval.upperPm;
  return lowerMagnitude > upperMagnitude ? lowerMagnitude : upperMagnitude;
}
