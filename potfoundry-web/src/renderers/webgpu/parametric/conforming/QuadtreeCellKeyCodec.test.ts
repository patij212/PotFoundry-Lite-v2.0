/**
 * QuadtreeCellKeyCodec.test.ts — the correctness contract for the numeric
 * cell-key encoding that replaces the per-leaf template-literal string keys in
 * PeriodicBalancedQuadtree / the two triangulators (the E-2026-07-10-EMIT-CPU-
 * PROFILE hotspot: `hasLeaf`/`cellKey` string alloc + Set<string> was 56% of a
 * production export's CPU). The ONLY thing that makes this optimization safe is
 * that the packed-integer key is COLLISION-FREE over the exact same
 * (level, it, uExtra, iu) domain the string key covered — a collision would
 * silently merge two distinct quadtree leaves and corrupt the mesh. These tests
 * pin that invariant.
 */
import { describe, it, expect } from 'vitest';
import { makeQuadtreeCellKeyCodec, MAX_U_EXTRA_FOR_CODEC } from './QuadtreeCellKeyCodec';

/** All valid (level, it, uExtra, iu) tuples at the given bounds, sampled densely
 *  at field boundaries (0, 1, mid, max-1, max) + a stride, plus EXHAUSTIVE over
 *  low levels — the collision-prone region is field adjacency, which boundaries
 *  exercise directly. */
function* sampleCells(maxLevel: number, uBiasLevel: number): Generator<[number, number, number, number]> {
  const sampleAxis = (max: number): number[] => {
    if (max <= 0) return [0];
    const s = new Set<number>([0, 1, Math.floor(max / 2), max - 1, max]);
    for (let v = 0; v <= max; v += Math.max(1, Math.floor(max / 7))) s.add(v);
    return [...s].filter((v) => v >= 0 && v <= max);
  };
  for (let level = 0; level <= maxLevel; level++) {
    const itMax = (1 << level) - 1;
    for (let uExtra = 0; uExtra <= MAX_U_EXTRA_FOR_CODEC; uExtra++) {
      const eUL = level + uBiasLevel + uExtra;
      const iuMax = (1 << eUL) - 1;
      // Exhaustive it×iu at genuinely-small levels (cheap); boundary+strided
      // sampled higher up — field-adjacency collisions surface at the boundaries.
      const its = level <= 4 ? Array.from({ length: itMax + 1 }, (_, i) => i) : sampleAxis(itMax);
      const ius = eUL <= 6 ? Array.from({ length: iuMax + 1 }, (_, i) => i) : sampleAxis(iuMax);
      for (const itv of its) for (const iuv of ius) yield [level, itv, uExtra, iuv];
    }
  }
}

describe('QuadtreeCellKeyCodec — cell key round-trip + collision-free', () => {
  // Production CAD-floor config (maxLevel 16, no bias) + a stress config with bias.
  for (const [maxLevel, uBiasLevel] of [[16, 0], [16, 2], [12, 1], [18, 2]] as const) {
    it(`round-trips every sampled cell exactly (maxLevel=${maxLevel}, uBias=${uBiasLevel})`, () => {
      const codec = makeQuadtreeCellKeyCodec(maxLevel, uBiasLevel);
      for (const [level, itv, uExtra, iuv] of sampleCells(maxLevel, uBiasLevel)) {
        const key = codec.packCell(level, itv, uExtra, iuv);
        const back = codec.unpackCell(key);
        expect(back).toEqual({ level, it: itv, uExtra, iu: iuv });
      }
    });

    it(`assigns a DISTINCT key to every distinct cell (maxLevel=${maxLevel}, uBias=${uBiasLevel})`, () => {
      const codec = makeQuadtreeCellKeyCodec(maxLevel, uBiasLevel);
      const seen = new Map<number, string>();
      for (const [level, itv, uExtra, iuv] of sampleCells(maxLevel, uBiasLevel)) {
        const key = codec.packCell(level, itv, uExtra, iuv);
        const tuple = `${level}:${itv}:${uExtra}:${iuv}`;
        const prior = seen.get(key);
        if (prior !== undefined && prior !== tuple) {
          throw new Error(`COLLISION: ${prior} and ${tuple} both packed to ${key}`);
        }
        seen.set(key, tuple);
      }
    });

    it(`every key is a non-negative safe integer (maxLevel=${maxLevel}, uBias=${uBiasLevel})`, () => {
      const codec = makeQuadtreeCellKeyCodec(maxLevel, uBiasLevel);
      for (const [level, itv, uExtra, iuv] of sampleCells(maxLevel, uBiasLevel)) {
        const key = codec.packCell(level, itv, uExtra, iuv);
        expect(Number.isSafeInteger(key)).toBe(true);
        expect(key).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

describe('QuadtreeCellKeyCodec — uEff key collision classes match the string key', () => {
  it('collides iff (eUL, it, iu) are equal', () => {
    const maxLevel = 16;
    const uBiasLevel = 0;
    const codec = makeQuadtreeCellKeyCodec(maxLevel, uBiasLevel);
    const maxEUL = maxLevel + uBiasLevel + MAX_U_EXTRA_FOR_CODEC;
    const seen = new Map<number, string>();
    for (let eUL = 0; eUL <= maxEUL; eUL++) {
      const itMax = (1 << Math.min(eUL, maxLevel)) - 1;
      const iuMax = (1 << eUL) - 1;
      for (const itv of [0, 1, itMax >> 1, itMax].filter((v) => v >= 0)) {
        for (const iuv of [0, 1, iuMax >> 1, iuMax].filter((v) => v >= 0)) {
          const key = codec.packUEff(eUL, itv, iuv);
          const tuple = `${eUL}:${itv}:${iuv}`;
          const prior = seen.get(key);
          if (prior !== undefined && prior !== tuple) {
            throw new Error(`uEff COLLISION: ${prior} and ${tuple} both packed to ${key}`);
          }
          seen.set(key, tuple);
          expect(Number.isSafeInteger(key)).toBe(true);
        }
      }
    }
  });
});

describe('QuadtreeCellKeyCodec — safe-range guard', () => {
  it('accepts every realistic production/sweep config', () => {
    // maxLevel ≤ 18 with uBias ≤ 4, and maxLevel ≤ 20 with uBias 0, all fit.
    for (const [maxLevel, uBiasLevel] of [[16, 0], [16, 4], [18, 2], [20, 0]] as const) {
      expect(() => makeQuadtreeCellKeyCodec(maxLevel, uBiasLevel)).not.toThrow();
    }
  });

  it('throws (never silently overflows) for a pathological out-of-range config', () => {
    // maxLevel 40 would need > 53 bits — must fail loudly, not collide silently.
    expect(() => makeQuadtreeCellKeyCodec(40, 4)).toThrow(/safe integer|bits|range/i);
  });
});
