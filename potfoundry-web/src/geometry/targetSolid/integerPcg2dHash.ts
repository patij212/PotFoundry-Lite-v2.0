import Decimal from 'decimal.js';

import {
  decimalInterval,
  decimalPoint,
  exactFloat64Decimal,
  type DecimalInterval,
} from './decimalInterval';
import { sha256Utf8 } from './incrementalSha256';

export const INTEGER_PCG2D_HASH_VERSION =
  'potfoundry.integer-pcg2d-unit-hash/v1' as const;
export const INTEGER_PCG2D_HASH_COORDINATE_LIMIT = 16_777_216;
export const INTEGER_PCG2D_HASH_UNIT_UPPER =
  '0.999999940395355224609375' as const;
export const INTEGER_PCG2D_HASH_PROOF_SHA256 = sha256Utf8(
  [
    INTEGER_PCG2D_HASH_VERSION,
    `coordinate-envelope=[-${INTEGER_PCG2D_HASH_COORDINATE_LIMIT},${INTEGER_PCG2D_HASH_COORDINATE_LIMIT}]`,
    'cell coordinates must be mathematical integers exactly representable by binary32',
    'coordinate conversion to u32 is two-complement modulo 2^32 and fixed biases are 0x9e3779b1/0x85ebca77',
    'every multiply, add, xor, and right shift follows the production PCG2D statement order with modulo-2^32 wrapping',
    'each output is (lane>>8)*2^-24, an exact dyadic in [0,(2^24-1)/2^24]',
    'a point-valued integer interval evaluates exactly; every non-point interval returns the complete exact output range',
    'the generated WGSL helper mirrors the same u32 statements and is only called for compiler-proven integer-valued operands',
  ].join('\n')
);

const WGSL_FUNCTION_NAME_RE = /^pf_pcg2d_[0-9a-f]{16}$/;

function coordinate(value: number, label: string): number {
  if (
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    Math.abs(value) > INTEGER_PCG2D_HASH_COORDINATE_LIMIT
  ) {
    throw new RangeError(
      `${label} must be an integer in the exact binary32 coordinate envelope`
    );
  }
  return value === 0 ? 0 : value;
}

function pcg2d(cellX: number, cellY: number): readonly [number, number] {
  let x = (cellX + 0x9e3779b1) >>> 0;
  let y = (cellY + 0x85ebca77) >>> 0;

  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  return Object.freeze([x, y]);
}

/** Exact production hash22 integer-cell semantics, returned as two binary-exact dyadics. */
export function integerPcg2dUnitHash(
  rawCellX: number,
  rawCellY: number
): readonly [number, number] {
  const cellX = coordinate(rawCellX, 'PCG2D cell x');
  const cellY = coordinate(rawCellY, 'PCG2D cell y');
  const [x, y] = pcg2d(cellX, cellY);
  return Object.freeze([(x >>> 8) * 2 ** -24, (y >>> 8) * 2 ** -24]);
}

function intervalInsideCoordinateEnvelope(value: DecimalInterval): boolean {
  const limit = new Decimal(INTEGER_PCG2D_HASH_COORDINATE_LIMIT);
  return (
    new Decimal(value.lower).greaterThanOrEqualTo(limit.negated()) &&
    new Decimal(value.upper).lessThanOrEqualTo(limit)
  );
}

function exactIntegerPoint(value: DecimalInterval): number | null {
  const lower = new Decimal(value.lower);
  if (!lower.equals(value.upper) || !lower.isInteger()) return null;
  return lower.toNumber();
}

/** Sound interval extension for the discontinuous integer hash. */
export function decimalIntegerPcg2dUnitHash(
  cellX: DecimalInterval,
  cellY: DecimalInterval
): readonly [DecimalInterval, DecimalInterval] {
  if (!intervalInsideCoordinateEnvelope(cellX) || !intervalInsideCoordinateEnvelope(cellY)) {
    throw new RangeError('PCG2D interval leaves the exact binary32 coordinate envelope');
  }
  const pointX = exactIntegerPoint(cellX);
  const pointY = exactIntegerPoint(cellY);
  if (pointX === null || pointY === null) {
    const completeRange = decimalInterval('0', INTEGER_PCG2D_HASH_UNIT_UPPER);
    return Object.freeze([completeRange, completeRange]);
  }
  const [x, y] = integerPcg2dUnitHash(pointX, pointY);
  return Object.freeze([
    decimalPoint(exactFloat64Decimal(x)),
    decimalPoint(exactFloat64Decimal(y)),
  ]);
}

/** Hash-scoped WGSL helper; callers must prove integer-valued coordinates. */
export function integerPcg2dUnitHashWgslSource(functionName: string): string {
  if (!WGSL_FUNCTION_NAME_RE.test(functionName)) {
    throw new TypeError('PCG2D WGSL helper name is invalid');
  }
  return [
    `fn ${functionName}(cell_x: f32, cell_y: f32) -> vec2<f32> {`,
    '  var x = u32(i32(cell_x)) + 0x9e3779b1u;',
    '  var y = u32(i32(cell_y)) + 0x85ebca77u;',
    '  x = x * 1664525u + 1013904223u;',
    '  y = y * 1664525u + 1013904223u;',
    '  x = x + y * 1664525u;',
    '  y = y + x * 1664525u;',
    '  x = x ^ (x >> 16u);',
    '  y = y ^ (y >> 16u);',
    '  x = x + y * 1664525u;',
    '  y = y + x * 1664525u;',
    '  x = x ^ (x >> 16u);',
    '  y = y ^ (y >> 16u);',
    '  return vec2<f32>(',
    '    f32(x >> 8u) * 5.9604644775390625e-08,',
    '    f32(y >> 8u) * 5.9604644775390625e-08',
    '  );',
    '}',
    '',
  ].join('\n');
}
