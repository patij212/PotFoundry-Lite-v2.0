import { describe, expect, it } from 'vitest';

import {
  float64UpperMillimetresToPicometres,
  nextFloat64Down,
  nextFloat64Up,
  outwardAdd,
  outwardDivide,
  outwardInterval,
  outwardMultiply,
  outwardSubtract,
  outwardVectorNormUpper,
} from './outwardFloat64Interval';

describe('outward Float64 interval primitives', () => {
  it('steps adjacent IEEE-754 values across signs and signed zero', () => {
    expect(nextFloat64Up(0)).toBe(Number.MIN_VALUE);
    expect(nextFloat64Up(-0)).toBe(Number.MIN_VALUE);
    expect(nextFloat64Down(0)).toBe(-Number.MIN_VALUE);
    expect(nextFloat64Down(-0)).toBe(-Number.MIN_VALUE);
    expect(nextFloat64Up(-Number.MIN_VALUE)).toBe(-0);
    expect(nextFloat64Down(Number.MIN_VALUE)).toBe(0);
    expect(nextFloat64Up(1)).toBeGreaterThan(1);
    expect(nextFloat64Down(1)).toBeLessThan(1);
  });

  it('outwardly encloses chained arithmetic instead of trusting rounded centres', () => {
    const sum = outwardAdd(outwardInterval(0.1), outwardInterval(0.2));
    expect(sum.lower).toBeLessThanOrEqual(0.3);
    expect(sum.upper).toBeGreaterThanOrEqual(0.3);

    const restored = outwardSubtract(sum, outwardInterval(0.2));
    expect(restored.lower).toBeLessThanOrEqual(0.1);
    expect(restored.upper).toBeGreaterThanOrEqual(0.1);

    const product = outwardMultiply(outwardInterval(-2, 3), outwardInterval(4, 5));
    expect(product.lower).toBeLessThanOrEqual(-10);
    expect(product.upper).toBeGreaterThanOrEqual(15);
  });

  it('refuses division through a denominator interval containing zero', () => {
    expect(() => outwardDivide(outwardInterval(1), outwardInterval(-1, 1))).toThrow(
      /through zero/
    );
  });

  it('computes a conservative three-dimensional norm upper bound', () => {
    const upper = outwardVectorNormUpper(
      outwardInterval(-3, 3),
      outwardInterval(-4, 4),
      outwardInterval(0)
    );
    expect(upper).toBeGreaterThanOrEqual(5);
    expect(upper).toBeLessThan(5.00000000000001);
  });

  it('converts binary64 millimetres to picometres by exact rational ceiling', () => {
    expect(float64UpperMillimetresToPicometres(0)).toBe(0n);
    expect(float64UpperMillimetresToPicometres(0.01)).toBe(10_000_001n);
    expect(float64UpperMillimetresToPicometres(0.5)).toBe(500_000_000n);
    expect(float64UpperMillimetresToPicometres(Number.MIN_VALUE)).toBe(1n);
  });

  it('keeps a one-picometre-above-threshold value above the threshold', () => {
    const above = 0.010000001;
    expect(float64UpperMillimetresToPicometres(above)).toBeGreaterThan(10_000_000n);
  });

  it('refuses NaN, nonfinite, negative, and inverted bounds', () => {
    expect(() => nextFloat64Up(Number.NaN)).toThrow(/NaN/);
    expect(() => outwardInterval(2, 1)).toThrow(/finite ordered/);
    expect(() => float64UpperMillimetresToPicometres(-1)).toThrow(/nonnegative/);
    expect(() => float64UpperMillimetresToPicometres(Number.POSITIVE_INFINITY)).toThrow(
      /finite/
    );
  });
});
