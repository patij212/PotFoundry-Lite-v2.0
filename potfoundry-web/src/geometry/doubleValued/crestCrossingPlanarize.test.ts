// crestCrossingPlanarize.test.ts — CCP Task 2: pure crest × inner-edge crossing computation.
//
// Proves planarizeCrestCrossings finds, per overlap-diamond corner, the (u,t) where an
// over-strand CREST crease crosses an emerging under-strand INNER-edge cliff — the point
// that has no mesh vertex today, so a flat facet bridges the ~0.6mm step. Grounded in the
// measured worst crossing (u≈0.3944, t≈0.837) at the CelticKnot default single-column config.
// Pure and deterministic (like the P3b T1 visibleEnvelope test): no meshing, no I/O.

import { describe, it, expect } from 'vitest';
import {
  planarizeCrestCrossings,
  crestUAt,
  innerEdgeUAt,
} from './crestCrossingPlanarize';

// CelticKnot defaults (derived as celticKnotOuterWallTarget.parameters()); 1 column, 3 strands ⇒ real crossings.
const PARAMS = { columnCount: 1, strandWidth: 0.15 * 0.15, strandCount: 3, tightness: 0.5, relief: 2.0, gap: 0.02, roundness: 0.5 };
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1.1 };
const DOMAIN = { tLo: 0.02, tHi: 0.98 };

describe('crest × inner-edge crossing planarization (pure)', () => {
  it('finds a shared crossing for each diamond corner where over-crest crosses an emerging inner-edge', () => {
    const p = planarizeCrestCrossings(PARAMS, DIMS, DOMAIN);
    // 3-strand single column has real crossings ⇒ at least one crest×inner-edge crossing
    expect(p.crossings.length).toBeGreaterThan(0);
    for (const c of p.crossings) {
      expect(c.overStrand).not.toBe(c.underStrand);
      expect(c.t).toBeGreaterThan(DOMAIN.tLo);
      expect(c.t).toBeLessThan(DOMAIN.tHi);
      // the crossing lies on the over-crest: its u equals the over strand centreline u at t
      expect(Math.abs(c.u - crestUAt(PARAMS, c.column, c.overStrand, c.t))).toBeLessThan(1e-9);
      // and on the under inner-edge: its u equals the under (centre ± w) inner-edge u at t
      expect(Math.abs(c.u - innerEdgeUAt(PARAMS, c.column, c.underStrand, c.underSide, c.t))).toBeLessThan(1e-6);
      // circumferential fraction stays inside the ring
      expect(c.u).toBeGreaterThan(0);
      expect(c.u).toBeLessThan(1);
    }
    // every crossing produces a split on BOTH the over-crest and the under inner-edge at that t
    for (const c of p.crossings) {
      const crestKey = `${c.column}:${c.overStrand}`;
      const edgeKey = `${c.column}:${c.underStrand}:${c.underSide}`;
      expect((p.crestSplitsByStrand.get(crestKey) ?? []).some((t) => Math.abs(t - c.t) < 1e-4)).toBe(true);
      expect((p.innerEdgeSplitsBySeg.get(edgeKey) ?? []).some((t) => Math.abs(t - c.t) < 1e-4)).toBe(true);
    }
    // both near-edges (the crest sweeps across the under ribbon: entering +1 and exiting −1 sides) are crossed
    const sides = new Set(p.crossings.map((c) => c.underSide));
    expect(sides.has(1)).toBe(true);
    expect(sides.has(-1)).toBe(true);
    // grounded in reality: the measured worst diamond-corner crossing at (u≈0.3944, t≈0.837),
    // overStrand 1 × underStrand 2, inner side −1 (the edge of strand 2 toward the over strand 1).
    const baseline = p.crossings.find(
      (c) => c.overStrand === 1 && c.underStrand === 2 && c.underSide === -1 && Math.abs(c.t - 0.837) < 0.005
    );
    expect(baseline).toBeDefined();
    expect(baseline?.u).toBeCloseTo(0.3944, 3);
  });
});
