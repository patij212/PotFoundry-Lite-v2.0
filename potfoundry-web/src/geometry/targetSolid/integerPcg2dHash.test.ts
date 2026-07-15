import { describe, expect, it } from 'vitest';

import { decimalInterval, decimalPoint } from './decimalInterval';
import {
  decimalIntegerPcg2dUnitHash,
  integerPcg2dUnitHash,
  integerPcg2dUnitHashWgslSource,
  INTEGER_PCG2D_HASH_UNIT_UPPER,
} from './integerPcg2dHash';

describe('integer PCG2D unit hash', () => {
  it.each([
    [0, 0, 0.9844945669174194, 0.33099067211151123],
    [1, 0, 0.5357983112335205, 0.9440409541130066],
    [-1, 1, 0.19684511423110962, 0.18615704774856567],
    [31, -17, 0.18682295083999634, 0.25426554679870605],
  ])('matches the pinned vector for cell (%i,%i)', (cellX, cellY, x, y) => {
    expect(integerPcg2dUnitHash(cellX, cellY)).toEqual([x, y]);
  });

  it('is exactly representable after binary32 rounding', () => {
    for (let cellY = -8; cellY <= 8; cellY += 1) {
      for (let cellX = -8; cellX <= 8; cellX += 1) {
        const [x, y] = integerPcg2dUnitHash(cellX, cellY);
        expect(Math.fround(x)).toBe(x);
        expect(Math.fround(y)).toBe(y);
      }
    }
  });

  it('evaluates exact integer points and widens non-point cells to the complete range', () => {
    const point = decimalIntegerPcg2dUnitHash(decimalPoint('0'), decimalPoint('0'));
    expect(point[0].lower).toBe(point[0].upper);
    expect(point[1].lower).toBe(point[1].upper);
    expect(
      decimalIntegerPcg2dUnitHash(decimalInterval('0', '1'), decimalPoint('0'))
    ).toEqual([
      { lower: '0', upper: INTEGER_PCG2D_HASH_UNIT_UPPER },
      { lower: '0', upper: INTEGER_PCG2D_HASH_UNIT_UPPER },
    ]);
  });

  it('refuses noninteger or out-of-envelope point execution', () => {
    expect(() => integerPcg2dUnitHash(0.5, 0)).toThrow(/integer/i);
    expect(() => integerPcg2dUnitHash(16_777_217, 0)).toThrow(/envelope/i);
    expect(() =>
      decimalIntegerPcg2dUnitHash(decimalInterval('-20000000', '0'), decimalPoint('0'))
    ).toThrow(/envelope/i);
  });

  it('emits the exact ordered u32 WGSL helper with injection-safe naming', () => {
    const source = integerPcg2dUnitHashWgslSource('pf_pcg2d_0123456789abcdef');
    expect(source).toContain('x = x + y * 1664525u;');
    expect(source).toContain('f32(x >> 8u) * 5.9604644775390625e-08');
    expect(() => integerPcg2dUnitHashWgslSource('bad()')).toThrow(/name/i);
  });
});
