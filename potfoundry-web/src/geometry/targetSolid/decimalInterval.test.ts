import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  decimalAdd,
  decimalAbsolute,
  decimalAtan2,
  decimalCos,
  decimalDivide,
  decimalExp,
  decimalCeil,
  decimalFloor,
  decimalFract,
  decimalInterval,
  decimalIntervalFromFloat64,
  decimalLn,
  decimalMaximum,
  decimalMinimum,
  decimalMultiply,
  decimalPoint,
  decimalPow,
  decimalRoundTiesToEven,
  decimalSign,
  decimalSin,
  decimalSqrt,
  decimalSubtract,
  decimalStep,
  decimalToOutwardFloat64,
  exactFloat64Decimal,
} from './decimalInterval';

const ReferenceDecimal = Decimal.clone({ precision: 500, rounding: Decimal.ROUND_HALF_EVEN });

function contains(interval: { readonly lower: string; readonly upper: string }, value: string): boolean {
  return (
    new Decimal(interval.lower).lessThanOrEqualTo(value) &&
    new Decimal(interval.upper).greaterThanOrEqualTo(value)
  );
}

describe('decimal directed interval kernel', () => {
  it('imports each binary64 input through its exact value, not its short decimal rendering', () => {
    const exact = exactFloat64Decimal(0.1);
    expect(exact).toBe('0.1000000000000000055511151231257827021181583404541015625');
    expect(decimalIntervalFromFloat64(0.1)).toEqual({ lower: exact, upper: exact });
    const minimum = new ReferenceDecimal(exactFloat64Decimal(Number.MIN_VALUE));
    expect(minimum.times(new ReferenceDecimal(2).pow(1074)).equals(1)).toBe(true);
  });

  it('contains exact results through cancellation, multiplication, and division', () => {
    const a = decimalInterval('0.1', '0.2');
    const b = decimalInterval('0.3', '0.4');
    expect(decimalAdd(a, b)).toEqual({ lower: '0.4', upper: '0.6' });
    expect(decimalSubtract(a, b)).toEqual({ lower: '-0.3', upper: '-0.1' });
    expect(decimalMultiply(a, b)).toEqual({ lower: '0.03', upper: '0.08' });
    const quotient = decimalDivide(decimalPoint('1'), decimalPoint('3'));
    const oneThird = new ReferenceDecimal(1).div(3);
    expect(new ReferenceDecimal(quotient.lower).lessThanOrEqualTo(oneThird)).toBe(true);
    expect(new ReferenceDecimal(quotient.upper).greaterThanOrEqualTo(oneThird)).toBe(true);
  });

  it('encloses absolute, pointwise minimum, and pointwise maximum branches', () => {
    expect(decimalAbsolute(decimalInterval('-3', '2'))).toEqual({ lower: '0', upper: '3' });
    expect(decimalAbsolute(decimalInterval('-3', '-2'))).toEqual({ lower: '2', upper: '3' });
    expect(decimalMinimum(decimalInterval('-2', '4'), decimalInterval('1', '3'))).toEqual({
      lower: '-2',
      upper: '3',
    });
    expect(decimalMaximum(decimalInterval('-2', '4'), decimalInterval('1', '3'))).toEqual({
      lower: '1',
      upper: '4',
    });
  });

  it('encloses WGSL integer, fractional, sign, and step operations at discontinuities', () => {
    expect(decimalFloor(decimalInterval('-1.2', '2.8'))).toEqual({ lower: '-2', upper: '2' });
    expect(decimalCeil(decimalInterval('-1.2', '2.8'))).toEqual({ lower: '-1', upper: '3' });
    expect(decimalRoundTiesToEven(decimalInterval('-2.5', '3.5'))).toEqual({
      lower: '-2',
      upper: '4',
    });
    expect(decimalFract(decimalInterval('2.25', '2.75'))).toEqual({
      lower: '0.25',
      upper: '0.75',
    });
    expect(decimalFract(decimalInterval('-0.25', '0'))).toEqual({ lower: '0', upper: '1' });
    expect(decimalSign(decimalInterval('-0.1', '0'))).toEqual({ lower: '-1', upper: '0' });
    expect(decimalSign(decimalInterval('0', '0.1'))).toEqual({ lower: '0', upper: '1' });
    expect(decimalStep(decimalInterval('2', '3'), decimalInterval('0', '1'))).toEqual({
      lower: '0',
      upper: '0',
    });
    expect(decimalStep(decimalInterval('2', '3'), decimalInterval('3', '4'))).toEqual({
      lower: '1',
      upper: '1',
    });
    expect(decimalStep(decimalInterval('2', '3'), decimalInterval('2.5', '3.5'))).toEqual({
      lower: '0',
      upper: '1',
    });
  });

  it('refuses invalid order, nonfinite literals, and division through zero', () => {
    expect(() => decimalInterval('2', '1')).toThrow(/ordered/);
    expect(() => decimalPoint('Infinity')).toThrow(/finite decimal literal/);
    expect(() => decimalDivide(decimalPoint('1'), decimalInterval('-1', '1'))).toThrow(
      /through zero/
    );
  });

  it('refuses values that could be flushed outside the directed exponent envelope', () => {
    expect(() => decimalPoint('1e-100001')).toThrow(/adjusted exponent/);
    expect(() => decimalPoint('1e100001')).toThrow(/adjusted exponent/);
    expect(() => decimalExp(decimalPoint('-230259'))).toThrow(/certified envelope/);
    expect(() =>
      decimalMultiply(decimalPoint('1e-100000'), decimalPoint('1e-100000'))
    ).toThrow(/adjusted exponent/);
  });

  it('contains monotone elementary functions and nonnegative-base real powers', () => {
    const sqrt = decimalSqrt(decimalInterval('2', '3'));
    expect(contains(sqrt, new ReferenceDecimal(2).sqrt().toString())).toBe(true);
    expect(contains(sqrt, new ReferenceDecimal(3).sqrt().toString())).toBe(true);

    const exponential = decimalExp(decimalInterval('-1', '1'));
    expect(contains(exponential, new ReferenceDecimal(-1).exp().toString())).toBe(true);
    expect(contains(exponential, new ReferenceDecimal(1).exp().toString())).toBe(true);

    const logarithm = decimalLn(decimalInterval('0.5', '2'));
    expect(contains(logarithm, new ReferenceDecimal('0.5').ln().toString())).toBe(true);
    expect(contains(logarithm, new ReferenceDecimal(2).ln().toString())).toBe(true);

    const power = decimalPow(decimalInterval('0.5', '2'), decimalInterval('-3', '4'));
    expect(contains(power, '0.0625')).toBe(true);
    expect(contains(power, '16')).toBe(true);

    const fromZeroBelowOne = decimalPow(decimalInterval('0', '0.5'), decimalInterval('2', '3'));
    expect(fromZeroBelowOne.lower).toBe('0');
    expect(contains(fromZeroBelowOne, '0.25')).toBe(true);
    const fromZeroAboveOne = decimalPow(decimalInterval('0', '2'), decimalInterval('2', '3'));
    expect(fromZeroAboveOne.lower).toBe('0');
    expect(contains(fromZeroAboveOne, '8')).toBe(true);
    expect(() => decimalPow(decimalInterval('0', '1'), decimalInterval('0', '2'))).toThrow(
      /strictly positive/
    );
  });

  it('includes sine extrema hidden between endpoint samples', () => {
    const aroundMaximum = decimalSin(decimalInterval('1.5', '1.6'));
    expect(aroundMaximum.upper).toBe('1');
    const aroundMinimum = decimalSin(decimalInterval('-1.6', '-1.5'));
    expect(aroundMinimum.lower).toBe('-1');
  });

  it('orders negative transcendental point enclosures despite signed result restoration', () => {
    const negativeLog = decimalLn(decimalPoint('0.5'));
    const negativeSin = decimalSin(decimalPoint('-0.25'));
    const negativeCos = decimalCos(decimalPoint('2'));
    expect(contains(negativeLog, ReferenceDecimal.ln('0.5').toString())).toBe(true);
    expect(contains(negativeSin, ReferenceDecimal.sin('-0.25').toString())).toBe(true);
    expect(contains(negativeCos, ReferenceDecimal.cos('2').toString())).toBe(true);
  });

  it('includes cosine extrema and remains bounded over many periods', () => {
    expect(decimalCos(decimalInterval('-0.1', '0.1')).upper).toBe('1');
    expect(decimalCos(decimalInterval('3.1', '3.2')).lower).toBe('-1');
    expect(decimalSin(decimalInterval('-100', '100'))).toEqual({ lower: '-1', upper: '1' });
  });

  it('encloses principal atan2 in all quadrants and on coordinate axes', () => {
    for (const [y, x] of [
      ['1', '1'],
      ['1', '-1'],
      ['-1', '-1'],
      ['-1', '1'],
      ['0', '-1'],
      ['1', '0'],
      ['0', '0'],
    ] as const) {
      const enclosure = decimalAtan2(decimalPoint(y), decimalPoint(x));
      const reference = ReferenceDecimal.atan2(y, x).toString();
      expect(contains(enclosure, reference), `atan2(${y}, ${x})`).toBe(true);
    }
  });

  it('encloses atan2 rectangles by corners away from the branch cut', () => {
    const enclosure = decimalAtan2(
      decimalInterval('1', '2'),
      decimalInterval('3', '5')
    );
    for (const y of ['1', '1.5', '2']) {
      for (const x of ['3', '4', '5']) {
        expect(contains(enclosure, ReferenceDecimal.atan2(y, x).toString())).toBe(true);
      }
    }
    expect(new Decimal(enclosure.lower).greaterThan(0)).toBe(true);
    expect(new Decimal(enclosure.upper).lessThan(1)).toBe(true);
  });

  it('returns the complete principal range when a rectangle reaches the branch cut from below', () => {
    const enclosure = decimalAtan2(
      decimalInterval('-0.1', '0'),
      decimalInterval('-2', '-1')
    );
    const pi = ReferenceDecimal.acos(-1);
    expect(new Decimal(enclosure.lower).lessThanOrEqualTo(pi.negated().toString())).toBe(true);
    expect(new Decimal(enclosure.upper).greaterThanOrEqualTo(pi.toString())).toBe(true);
  });

  it('converts decimal endpoints to binary64 only in the outward direction', () => {
    const result = decimalToOutwardFloat64(
      decimalInterval('0.0999999999999999999999999999999999999999', '0.1')
    );
    expect(new Decimal(exactFloat64Decimal(result.lower)).lessThanOrEqualTo(
      '0.0999999999999999999999999999999999999999'
    )).toBe(true);
    expect(new Decimal(exactFloat64Decimal(result.upper)).greaterThanOrEqualTo('0.1')).toBe(true);

    const exact = decimalToOutwardFloat64(decimalIntervalFromFloat64(0.25));
    expect(exact).toEqual({ lower: 0.25, upper: 0.25 });
  });
});
