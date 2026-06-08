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

describe('PeriodicBalancedQuadtree — pinned boundary rows', () => {
  // Localized ripple → genuinely mixed interior levels, so the pinned boundary
  // rows must coexist with a refined interior under 2:1 balance.
  const s = new SyntheticCylinderSampler(50, 120, 8, 2);
  const opts: SizingOptions = {
    maxSagMm: 0.1,
    minEdgeMm: 0.5,
    maxEdgeMm: 120,
    gradeRatio: 4,
    resU: 65,
    resT: 9,
  };
  const PIN = 4;
  const field = new MetricSizingField(s, opts);
  const qt = new PeriodicBalancedQuadtree(field, s, {
    maxLevel: 7,
    pinBoundaryLevel: PIN,
  });
  const leaves = qt.leaves();
  const EPS = 1e-9;

  /** Leaves whose lower edge sits on t=0 (the bottom boundary row). */
  const bottom = leaves.filter((l) => Math.abs(l.t0) < EPS);
  /** Leaves whose UPPER edge sits on t=1 (the top boundary row). */
  const top = leaves.filter(
    (l) => Math.abs(l.t0 + 1 / 2 ** l.level - 1) < EPS,
  );

  it('every bottom-row (t=0) leaf is exactly at the pin level; count = 2^pin', () => {
    expect(bottom.length).toBeGreaterThan(0);
    expect(bottom.every((l) => l.level === PIN)).toBe(true);
    expect(bottom.length).toBe(2 ** PIN);
    // U coverage is uniform: u0 = i/2^pin for i=0..2^pin-1.
    const us = bottom.map((l) => l.u0).sort((a, b) => a - b);
    for (let i = 0; i < us.length; i++) {
      expect(Math.abs(us[i] - i / 2 ** PIN)).toBeLessThan(EPS);
    }
  });

  it('every top-row (t=1) leaf is exactly at the pin level; count = 2^pin', () => {
    expect(top.length).toBeGreaterThan(0);
    expect(top.every((l) => l.level === PIN)).toBe(true);
    expect(top.length).toBe(2 ** PIN);
    const us = top.map((l) => l.u0).sort((a, b) => a - b);
    for (let i = 0; i < us.length; i++) {
      expect(Math.abs(us[i] - i / 2 ** PIN)).toBeLessThan(EPS);
    }
  });

  it('interior still refines beyond the pin level (not a uniform grid)', () => {
    const levels = new Set(leaves.map((l) => l.level));
    expect(levels.size).toBeGreaterThan(1);
    expect(Math.max(...levels)).toBeGreaterThan(PIN);
  });

  it('2:1 balance still holds across every edge (incl. u-wrap)', () => {
    for (const leaf of leaves) {
      for (const { leaf: nb } of qt.neighbors(leaf)) {
        expect(Math.abs(leaf.level - nb.level)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('periodic seam closed: a last-column bottom leaf wraps to u0=0', () => {
    const size = 1 / 2 ** PIN;
    const last = bottom.find((l) => Math.abs(l.u0 - (1 - size)) < EPS);
    expect(last).toBeDefined();
    const uPlus = qt
      .neighbors(last as QuadLeaf)
      .filter((n) => n.side === 'uPlus');
    expect(uPlus.some((n) => Math.abs(n.leaf.u0) < EPS)).toBe(true);
  });
});

describe('PeriodicBalancedQuadtree — minUniformLevel floor', () => {
  it('forces a uniform full refinement to at least minUniformLevel everywhere', () => {
    // A coarse constant target would otherwise yield level 3; the floor forces 5.
    const s = new SyntheticCylinderSampler(50, 120);
    const field = constantField(s, 45); // sag-driven level would be 3
    const qt = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 8,
      minUniformLevel: 5,
    });
    const leaves = qt.leaves();
    // Every leaf is at least the floor level, and the floor produced a full grid.
    expect(leaves.every((l) => l.level >= 5)).toBe(true);
    // A uniform level-5 grid has 2^5 distinct full-height columns at i/2^5.
    const cols = new Set(leaves.map((l) => Math.round(l.u0 * 2 ** l.level) / 2 ** l.level));
    for (let i = 0; i < 32; i++) expect(cols.has(i / 32)).toBe(true);
  });

  it('full-height columns exist at every i/2^minUniformLevel (spanning all t)', () => {
    const s = new SyntheticCylinderSampler(50, 120, 8, 2);
    const opts: SizingOptions = {
      maxSagMm: 0.1,
      minEdgeMm: 0.5,
      maxEdgeMm: 120,
      gradeRatio: 4,
      resU: 65,
      resT: 9,
    };
    const L = 4;
    const field = new MetricSizingField(s, opts);
    const qt = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 7,
      pinBoundaryLevel: 8,
      minUniformLevel: L,
    });
    const leaves = qt.leaves();
    // For each coarse column i/2^L, some leaf's left OR right edge lies on it at
    // every t-band — i.e. a vertical grid line at u=i/2^L runs the full height.
    // It suffices that every leaf edge u-coordinate is a multiple of 1/2^L on the
    // coarse columns; check the column lattice is present by edge coverage in t.
    const colEps = 1e-9;
    for (let i = 0; i < 2 ** L; i++) {
      const uCol = i / 2 ** L;
      // leaves whose left edge sits exactly on this column
      const onCol = leaves.filter((l) => Math.abs(l.u0 - uCol) < colEps);
      // their t-bands must tile [0,1] with no gap (full height)
      onCol.sort((a, b) => a.t0 - b.t0);
      let covered = 0;
      for (const l of onCol) {
        const sz = 1 / 2 ** l.level;
        if (Math.abs(l.t0 - covered) < 1e-9) covered = l.t0 + sz;
      }
      expect(covered).toBeGreaterThan(1 - 1e-9);
    }
  });

  it('2:1 balance still holds with a uniform floor present', () => {
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
    const qt = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 7,
      pinBoundaryLevel: 8,
      minUniformLevel: 4,
    });
    for (const leaf of qt.leaves()) {
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
