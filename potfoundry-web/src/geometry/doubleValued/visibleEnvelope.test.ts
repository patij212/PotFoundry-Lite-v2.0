// visibleEnvelope.test.ts — P3b Task 1: pure visible-envelope clipping.
//
// Proves clipCliffsToVisibleEnvelope splits every declared ribbon<->background cliff
// into its visible (non-occluded) sub-arcs at a real 3-strand crossing config, and that
// every reported occlusion boundary is a genuine over/under pair strictly inside the band.

import { describe, it, expect } from 'vitest';
import { clipCliffsToVisibleEnvelope, occludedAt } from './visibleEnvelope';

// CelticKnot defaults (derived as celticKnotOuterWallTarget.parameters()); 1 column, 3 strands ⇒ real crossings.
const PARAMS = { columnCount: 1, strandWidth: 0.15 * 0.15, strandCount: 3, tightness: 0.5, relief: 2.0, gap: 0.02, roundness: 0.5 };
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };

describe('visible-envelope clipping', () => {
  it('clips each ribbon-background cliff to non-occluded sub-arcs and reports occlusion boundaries', () => {
    const env = clipCliffsToVisibleEnvelope(PARAMS, DIMS);
    // every declared full-band cliff (col×strand×side = 1×3×2 = 6) yields ≥1 visible sub-arc
    const cliffKeys = new Set(env.visibleCliffs.map((c) => `${c.column}:${c.strand}:${c.side}`));
    expect(cliffKeys.size).toBe(6);
    // crossings exist ⇒ at least one cliff is split (its visible arcs do not cover the full [0.02,0.98] band)
    const someClipped = env.visibleCliffs.some(
      (c) => c.tRange[0] > 0.02 + 1e-6 || c.tRange[1] < 0.98 - 1e-6
    );
    expect(someClipped).toBe(true);
    expect(env.occlusionBoundaries.length).toBeGreaterThan(0);
    // no visible sub-arc is actually occluded at its midpoint (the core, load-bearing invariant)
    for (const c of env.visibleCliffs) {
      const tm = 0.5 * (c.tRange[0] + c.tRange[1]);
      expect(occludedAt(PARAMS, c.column, c.strand, c.side, tm)).toBe(false);
    }
    // boundaries lie strictly inside the band and pair a real over/under
    for (const b of env.occlusionBoundaries) {
      expect(b.t).toBeGreaterThan(0.02);
      expect(b.t).toBeLessThan(0.98);
      expect(b.overStrand).not.toBe(b.strand);
    }
  });
});
