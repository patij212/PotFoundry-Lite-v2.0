// PeriodicBalancedQuadtree.verdictReach.test.ts — T1 of the Gyroid-knee ship plan.
//
// `belowFeatureFloorTest` (PeriodicBalancedQuadtree.ts) short-circuited on
// `!hitTest()` BEFORE ever consulting `featureRefine.levelAt`, so an off-contour
// cell (one the cheap `intersects` predicate misses) could never reach a
// per-cell `levelAt` escalation — only cells that first passed the `intersects`
// gate got a shot at a deeper commanded level. Research (P2.5c) proved the
// GyroidManifold knee closes once the off-contour cell containing it is allowed
// to reach its `levelAt` command directly. This file pins three properties of
// the fix:
//   1. an off-contour cell (intersects() === false) still reaches a `levelAt`
//      escalation commanded for it (the new behaviour).
//   2. a `levelAt` that returns 0 for every cell produces a tree BYTE-IDENTICAL
//      to a build with `levelAt: undefined` — the load-bearing non-regression
//      proof that the flag-off / no-op path is unchanged.
//   3. the `levelAt === undefined` legacy branch itself is untouched: on-contour
//      cells still reach the uniform `featureRefine.level` floor, off-contour
//      cells stay at the metric-driven baseline.
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';

/**
 * A sizing field whose target is far larger than the cylinder's physical
 * extent (≈314mm circumference, 120mm height), so `shouldRefine` never fires
 * on its own — any refinement observed in these tests comes ONLY from
 * `featureRefine` (uniform floor and/or `levelAt` escalation), isolating the
 * behaviour under test from ordinary curvature/size-driven splitting.
 */
function flatField(s: SyntheticCylinderSampler): MetricSizingField {
  const opts: SizingOptions = {
    maxSagMm: 0.1,
    minEdgeMm: 100000,
    maxEdgeMm: 100000,
    gradeRatio: 2,
    resU: 9,
    resT: 9,
  };
  return new MetricSizingField(s, opts);
}

/** Canonical, sorted (level,u0,t0) fingerprint of a tree — leaf-set identity. */
function fingerprint(qt: PeriodicBalancedQuadtree): string[] {
  return qt
    .leaves()
    .map((l) => `${l.level}:${l.u0.toFixed(12)}:${l.t0.toFixed(12)}`)
    .sort();
}

/** Leaf whose (u0,t0]×[t0,t0+size) box contains the given point. */
function leafAt(qt: PeriodicBalancedQuadtree, u: number, t: number) {
  return qt.leaves().find((l) => {
    const size = 1 / 2 ** l.level;
    return l.u0 <= u && u < l.u0 + size && l.t0 <= t && t < l.t0 + size;
  });
}

describe('PeriodicBalancedQuadtree — belowFeatureFloorTest levelAt reach (T1)', () => {
  it('1) off-contour cell (intersects always FALSE) still reaches its levelAt-commanded level', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const field = flatField(s);
    const TARGET_U = 0.37;
    const TARGET_T = 0.61;
    const COMMANDED = 5;
    const qt = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 6,
      featureRefine: {
        level: 2, // never consulted here — intersects is always false ⇒ off-contour
        intersects: () => false,
        levelAt: (u0: number, t0: number, size: number) =>
          u0 <= TARGET_U && TARGET_U < u0 + size && t0 <= TARGET_T && TARGET_T < t0 + size
            ? COMMANDED
            : 0,
      },
    });
    const hit = leafAt(qt, TARGET_U, TARGET_T);
    expect(hit).toBeDefined();
    expect(hit?.level).toBe(COMMANDED);
    // Non-vacuous: this is NOT a uniform level-5 refinement — only the target
    // cell and its 2:1-balance-graded neighbourhood were driven that deep; most
    // of the periodic domain stayed coarser (levelAt commands 0 elsewhere), so
    // the leaf count is far below a full level-5 grid and levels are mixed.
    const leaves = qt.leaves();
    expect(leaves.length).toBeLessThan(2 ** COMMANDED * 2 ** COMMANDED);
    const levels = new Set(leaves.map((l) => l.level));
    expect(levels.size).toBeGreaterThan(1);
    expect(leaves.every((l) => l.level === COMMANDED)).toBe(false);
  });

  it('2) LOAD-BEARING: levelAt returning 0 everywhere ⇒ tree BYTE-IDENTICAL to levelAt: undefined', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const field = flatField(s);
    // A real geometric contour (half the t-domain) so featureRefine actually
    // fires and the comparison isn't vacuous.
    const intersects = (_u0: number, t0: number, _size: number): boolean => t0 < 0.5;
    const FEATURE_LEVEL = 6;

    const qtLegacy = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 6,
      featureRefine: { level: FEATURE_LEVEL, intersects },
    });
    const qtZeroLevelAt = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 6,
      featureRefine: { level: FEATURE_LEVEL, intersects, levelAt: () => 0 },
    });

    const fpLegacy = fingerprint(qtLegacy);
    const fpZero = fingerprint(qtZeroLevelAt);

    // Non-vacuous: featureRefine actually drove refinement to its floor deep
    // inside the contour region (away from the 2:1-balance transition band).
    const deepInside = leafAt(qtLegacy, 0.1, 0.1);
    expect(deepInside).toBeDefined();
    expect(deepInside?.level).toBe(FEATURE_LEVEL);
    expect(fpLegacy.length).toBeGreaterThan(0);
    expect(new Set(qtLegacy.leaves().map((l) => l.level)).size).toBeGreaterThan(1);

    // The byte-identity tripwire itself.
    expect(fpZero).toEqual(fpLegacy);
  });

  it('3) legacy branch (levelAt undefined) untouched: on-contour reaches the floor, off-contour never does', () => {
    // NOTE on the "off-contour" assertion: the quadtree root always spans the
    // FULL domain, so any non-empty contour forces at least one split at the
    // root — the false-side subtree is never a level-0 LEAF in this construction
    // (2:1 balance against the deeply-refined true side then splits it further
    // still). "Off-contour never reaches the feature floor" is therefore the
    // precise, achievable statement of the legacy `!hitTest() ⇒ return false`
    // short-circuit: off-contour cells are exempt from the uniform floor and
    // only ever reach whatever level pure 2:1 balancing forces — strictly below
    // `featureRefine.level` — never the floor itself.
    const s = new SyntheticCylinderSampler(50, 120);
    const field = flatField(s);
    const intersects = (_u0: number, t0: number, _size: number): boolean => t0 < 0.5;
    const FEATURE_LEVEL = 6;
    const qt = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 6,
      featureRefine: { level: FEATURE_LEVEL, intersects },
    });
    // Deep inside the contour (t=0.1, well clear of the t=0.5 balance-transition
    // band): reaches the uniform feature floor exactly.
    const inside = leafAt(qt, 0.1, 0.1);
    expect(inside).toBeDefined();
    expect(inside?.level).toBe(FEATURE_LEVEL);
    // Deep outside the contour (t=0.9, in the large balance-settled tail):
    // never escalated to the feature floor.
    const outside = leafAt(qt, 0.1, 0.9);
    expect(outside).toBeDefined();
    expect(outside?.level).toBeLessThan(FEATURE_LEVEL);
  });
});
