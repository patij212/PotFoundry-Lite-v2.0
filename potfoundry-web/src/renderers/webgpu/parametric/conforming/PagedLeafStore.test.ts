import { describe, expect, it } from 'vitest';
import { PagedLeafStore } from './PagedLeafStore';

function expectSame(actual: PagedLeafStore, expected: Set<number>): void {
  expect(actual.size).toBe(expected.size);
  expect(Array.from(actual)).toEqual(Array.from(expected));
  expect(Array.from(expected, (key) => actual.has(key)).every(Boolean)).toBe(true);
}

describe('PagedLeafStore', () => {
  it('matches Set add/delete/re-add insertion order across sparse pages', () => {
    const actual = new PagedLeafStore();
    const expected = new Set<number>();
    const keys = [0, 1, 255, 256, 257, 65_535, 2 ** 32 + 17, Number.MAX_SAFE_INTEGER - 1];
    for (const key of keys) {
      actual.add(key);
      expected.add(key);
    }
    actual.add(256);
    expected.add(256);
    actual.delete(1);
    expected.delete(1);
    actual.add(1);
    expected.add(1);
    actual.delete(65_535);
    expected.delete(65_535);
    expectSame(actual, expected);
  });

  it('matches live Set iterator mutation semantics', () => {
    const actual = new PagedLeafStore();
    const expected = new Set([1, 2, 3]);
    actual.add(1).add(2).add(3);
    const actualSeen: number[] = [];
    for (const key of actual) {
      actualSeen.push(key);
      if (key === 1) {
        actual.delete(2);
        actual.add(4);
      }
      if (key === 3) actual.add(2);
    }
    const expectedSeen: number[] = [];
    for (const key of expected) {
      expectedSeen.push(key);
      if (key === 1) {
        expected.delete(2);
        expected.add(4);
      }
      if (key === 3) expected.add(2);
    }
    expect(actualSeen).toEqual(expectedSeen);
    expectSame(actual, expected);
  });

  it('matches Set through deterministic randomized churn', () => {
    const actual = new PagedLeafStore();
    const expected = new Set<number>();
    let state = 0x6d2b_79f5;
    const random = (): number => {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      return (state ^ (state >>> 14)) >>> 0;
    };
    for (let i = 0; i < 50_000; i++) {
      const key = ((random() % 4096) * 1024) + (random() % 32);
      if ((random() & 3) === 0) {
        expect(actual.delete(key)).toBe(expected.delete(key));
      } else {
        actual.add(key);
        expected.add(key);
      }
      if (i % 997 === 0) expectSame(actual, expected);
    }
    expectSame(actual, expected);
  });

  it('clears membership and insertion history', () => {
    const actual = new PagedLeafStore();
    actual.add(7).add(263);
    actual.clear();
    actual.add(263).add(7);
    expect(actual.size).toBe(2);
    expect(Array.from(actual.values())).toEqual([263, 7]);
  });

  it('rejects keys outside the packed-key domain', () => {
    const actual = new PagedLeafStore();
    expect(() => actual.add(-1)).toThrow(RangeError);
    expect(() => actual.add(1.5)).toThrow(RangeError);
    expect(() => actual.add(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(actual.has(-1)).toBe(false);
    expect(actual.delete(Number.NaN)).toBe(false);
  });
});
