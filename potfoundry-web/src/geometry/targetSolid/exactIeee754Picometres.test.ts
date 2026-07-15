import { describe, expect, it } from 'vitest';

import {
  binary32MillimetresToPicometres,
  binary64MillimetresToPicometres,
  exactIntervalAbsoluteUpper,
  exactIntervalDifference,
} from './exactIeee754Picometres';

describe('exact IEEE-754 millimetre to picometre intervals', () => {
  it('is exact for integral-picometre binary values and canonicalizes signed zero', () => {
    expect(binary32MillimetresToPicometres(1)).toEqual({
      lowerPm: 1_000_000_000n,
      upperPm: 1_000_000_000n,
      exactIntegralPicometres: true,
    });
    expect(binary32MillimetresToPicometres(-0)).toEqual({
      lowerPm: 0n,
      upperPm: 0n,
      exactIntegralPicometres: true,
    });
  });

  it('rounds nonintegral positive and negative values in opposite outward directions', () => {
    expect(binary32MillimetresToPicometres(Math.fround(0.1))).toEqual({
      lowerPm: 100_000_001n,
      upperPm: 100_000_002n,
      exactIntegralPicometres: false,
    });
    expect(binary32MillimetresToPicometres(Math.fround(-0.1))).toEqual({
      lowerPm: -100_000_002n,
      upperPm: -100_000_001n,
      exactIntegralPicometres: false,
    });
  });

  it('retains subnormal values instead of rounding them to mathematical zero', () => {
    const leastBinary32 = Math.fround(2 ** -149);
    expect(binary32MillimetresToPicometres(leastBinary32)).toEqual({
      lowerPm: 0n,
      upperPm: 1n,
      exactIntegralPicometres: false,
    });
    expect(binary64MillimetresToPicometres(Number.MIN_VALUE)).toEqual({
      lowerPm: 0n,
      upperPm: 1n,
      exactIntegralPicometres: false,
    });
  });

  it('computes conservative interval differences and absolute upper bounds', () => {
    const artifact = binary32MillimetresToPicometres(Math.fround(99.995));
    const target = binary64MillimetresToPicometres(100);
    const difference = exactIntervalDifference(artifact, target);
    expect(difference.lowerPm).toBeLessThanOrEqual(-4_997_000n);
    expect(difference.upperPm).toBeGreaterThanOrEqual(-5_003_000n);
    expect(exactIntervalAbsoluteUpper(difference)).toBeLessThan(10_000_000n);
  });

  it('refuses values that are not exact finite binary32 inputs', () => {
    expect(() => binary32MillimetresToPicometres(0.1)).toThrow(/binary32/i);
    expect(() => binary32MillimetresToPicometres(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => binary64MillimetresToPicometres(Number.NaN)).toThrow();
  });
});
