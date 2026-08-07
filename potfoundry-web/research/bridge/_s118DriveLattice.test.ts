// _s118DriveLattice.test.ts — pin the ONE piece of pure mathematics the S118 DRIVE verdict rests on.
//
// The drive tool refines until its key is under the bar at every point of the order-K_VER barycentric
// lattice, and then claims that s118Score — which measures at order 8 — must therefore find ZERO facets
// over the bar. That claim is ONLY true if the order-8 lattice is a SUBSET of the order-K_VER lattice.
// It is easy to believe and easy to get wrong (it holds for K_VER = 16, 24, 32; it does NOT hold for
// K_VER = 12 or 20, which are not multiples of 8). If someone later sets PF_S118D_KVER=12 the verdict
// silently stops meaning what it says, so the property is pinned here rather than asserted in a comment.
import { describe, it, expect } from 'vitest';
import { latticePts } from '../tools/s118ScoreLib';

const key = (a: number, b: number, c: number): string => `${a.toFixed(12)}|${b.toFixed(12)}|${c.toFixed(12)}`;
const setOf = (k: number): Set<string> => {
  const L = latticePts(k); const s = new Set<string>();
  for (let p = 0; p < L.length / 3; p += 1) s.add(key(L[p * 3], L[p * 3 + 1], L[p * 3 + 2]));
  return s;
};

describe('s118 drive — barycentric lattice containment', () => {
  it('has the closed-form point count (k+1)(k+2)/2', () => {
    for (const k of [4, 8, 16, 24, 32]) expect(latticePts(k).length / 3).toBe(((k + 1) * (k + 2)) / 2);
  });

  it('weights sum to 1 and are all non-negative', () => {
    const L = latticePts(16);
    for (let p = 0; p < L.length / 3; p += 1) {
      const a = L[p * 3], b = L[p * 3 + 1], c = L[p * 3 + 2];
      expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeGreaterThanOrEqual(0); expect(c).toBeGreaterThanOrEqual(0);
      expect(a + b + c).toBeCloseTo(1, 12);
    }
  });

  it('order 8 is a SUBSET of order 16, 24 and 32 — the verdicts quoted at k=8 are certified at K_VER', () => {
    const s8 = setOf(8);
    for (const k of [16, 24, 32]) {
      const sk = setOf(k);
      const missing = [...s8].filter((p) => !sk.has(p));
      expect(missing, `order 8 point(s) absent from order ${k}`).toEqual([]);
    }
  });

  it('NEGATIVE CONTROL: order 8 is NOT a subset of order 12 or 20 — non-multiples do not certify', () => {
    const s8 = setOf(8);
    for (const k of [12, 20]) {
      const sk = setOf(k);
      const missing = [...s8].filter((p) => !sk.has(p));
      expect(missing.length, `order ${k} unexpectedly contains all of order 8`).toBeGreaterThan(0);
    }
  });

  it('the three corners and the centroid-free edge midpoints are present at every order used', () => {
    for (const k of [8, 16, 24]) {
      const s = setOf(k);
      expect(s.has(key(1, 0, 0))).toBe(true);
      expect(s.has(key(0, 1, 0))).toBe(true);
      expect(s.has(key(0, 0, 1))).toBe(true);
      expect(s.has(key(0.5, 0.5, 0))).toBe(true);
    }
  });
});
