import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree, type QuadLeaf } from './PeriodicBalancedQuadtree';

/** A constant-target sizing field, bypassing curvature, for deterministic levels. */
function constantField(s: SyntheticCylinderSampler, target: number): MetricSizingField {
  const opts: SizingOptions = {
    maxSagMm: 0.1,
    minEdgeMm: target,
    maxEdgeMm: target,
    gradeRatio: 2,
    resU: 9,
    resT: 9,
  };
  // min=max=target ⇒ every node clamps to exactly `target`.
  return new MetricSizingField(s, opts);
}

describe('PeriodicBalancedQuadtree — uniform field', () => {
  it('flat cylinder + constant target ⇒ all leaves same level, count = (2^level)^2', () => {
    // Plain cylinder: sqrt(E)=2πR0≈314.16 wide, sqrt(G)=H=120 tall.
    // With target=45: level L splits while 314.16/2^L > 45 ⇒ 2^L≥6.98 ⇒ 2^3=8.
    const s = new SyntheticCylinderSampler(50, 120);
    const field = constantField(s, 45);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 8 });
    const leaves = qt.leaves();
    const level = leaves[0].level;
    expect(leaves.every((l) => l.level === level)).toBe(true);
    expect(leaves.length).toBe((2 ** level) ** 2);
    expect(level).toBe(3);
  });
});

describe('PeriodicBalancedQuadtree — 2:1 balance invariant', () => {
  it('every edge-adjacent leaf pair (incl. u-wrap) differs by ≤ 1 level', () => {
    // Localized ripple (small k, weak grading) → target ranges ~5.5..11.8mm →
    // genuinely mixed refinement levels (5,6,7), exercising 2:1 balance.
    const s = new SyntheticCylinderSampler(50, 120, 8, 2);
    const opts: SizingOptions = {
      maxSagMm: 0.1,
      minEdgeMm: 0.5,
      maxEdgeMm: 120,
      gradeRatio: 4,
      resU: 65,
      resT: 9,
    };
    const field = new MetricSizingField(s, opts);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 7 });
    const leaves = qt.leaves();
    // Mixed levels actually occurred (otherwise the test is vacuous).
    const levels = new Set(leaves.map((l) => l.level));
    expect(levels.size).toBeGreaterThan(1);
    for (const leaf of leaves) {
      for (const { leaf: nb } of qt.neighbors(leaf)) {
        expect(Math.abs(leaf.level - nb.level)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('PeriodicBalancedQuadtree — periodic neighbour', () => {
  it('a leaf at u0 = 1 - size has a uPlus neighbour at u0 = 0', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const field = constantField(s, 45);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 8 });
    const leaves = qt.leaves();
    const size = 1 / 2 ** leaves[0].level;
    const lastCol: QuadLeaf | undefined = leaves.find(
      (l) => Math.abs(l.u0 - (1 - size)) < 1e-9 && Math.abs(l.t0) < 1e-9,
    );
    expect(lastCol).toBeDefined();
    const nb = qt.neighbors(lastCol as QuadLeaf);
    const uPlus = nb.filter((n) => n.side === 'uPlus');
    expect(uPlus.length).toBeGreaterThan(0);
    expect(uPlus.some((n) => Math.abs(n.leaf.u0) < 1e-9)).toBe(true);
  });
});
