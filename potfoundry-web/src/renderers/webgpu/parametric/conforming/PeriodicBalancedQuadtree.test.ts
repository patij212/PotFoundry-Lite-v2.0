import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler, type SurfaceSampler } from './SurfaceSampler';
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

// ── Stage-1 Task 2: per-leaf efg population from an injected efgSampler ──────
//
// The shaped-template gate (QuadtreeTriangulator.shapedTemplate) fires only
// when a leaf carries `efg` — production never populated it before this. The
// quadtree now accepts an OPTIONAL `efgSampler` (the WARP-COMPOSED wall map,
// PullbackMetric.composedWallSampler) and tags each leaf in `leaves()` with the
// first fundamental form at its cell centre. Sizing/refinement stay on the
// PLAIN `metric` arg — only the leaf tags read the composed map.

/**
 * Sheared-plane sampler (cribbed from QuadtreeTriangulator.test.ts):
 * position(u,t) = (SX·u + SH·t, SY·t, 0). Constant first fundamental form
 * E = SX², F = SX·SH, G = SH² + SY² — FD is exact on a linear map, so leaf efg
 * values can be pinned tightly.
 */
class ShearedPlaneSampler implements SurfaceSampler {
  constructor(
    private readonly sx: number,
    private readonly sy: number,
    private readonly shear: number,
  ) {}
  position(u: number, t: number): readonly [number, number, number] {
    return [this.sx * u + this.shear * t, this.sy * t, 0];
  }
}

describe('PeriodicBalancedQuadtree — per-leaf efg population (efgSampler)', () => {
  const R0 = 50;
  const H = 120;

  it('(a) with efgSampler set, every leaf carries the closed-form cylinder efg', () => {
    // Plain cylinder: E = (2πR0)², F = 0, G = H² everywhere (closed form).
    const s = new SyntheticCylinderSampler(R0, H);
    const field = constantField(s, 45);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 8, efgSampler: s });
    const leaves = qt.leaves();
    expect(leaves.length).toBeGreaterThan(0);
    const E_EXPECT = (2 * Math.PI * R0) ** 2;
    const G_EXPECT = H * H;
    for (const leaf of leaves) {
      expect(leaf.efg).toBeDefined();
      const { E, F, G } = leaf.efg as { E: number; F: number; G: number };
      expect(Math.abs(E - E_EXPECT) / E_EXPECT).toBeLessThan(0.02);
      expect(Math.abs(F)).toBeLessThan(0.02 * E);
      expect(Math.abs(G - G_EXPECT) / G_EXPECT).toBeLessThan(0.02);
    }
  });

  it('(b) WITHOUT efgSampler, leaves carry NO efg field (legacy byte-identity)', () => {
    // The downstream byte-identity tests (QuadtreeTriangulator.test.ts) depend
    // on absent-efg leaves taking the legacy template path verbatim.
    const s = new SyntheticCylinderSampler(R0, H);
    const field = constantField(s, 45);
    const qt = new PeriodicBalancedQuadtree(field, s, { maxLevel: 8 });
    const leaves = qt.leaves();
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) {
      expect(Object.prototype.hasOwnProperty.call(leaf, 'efg')).toBe(false);
      expect(leaf.efg).toBeUndefined();
    }
  });

  it('(c) leaf efg reflects the EFG SAMPLER, not the sizing metric (F = SX·SH)', () => {
    // Sizing metric = plain cylinder (F=0 everywhere); efgSampler = sheared
    // plane (F = SX·SH ≠ 0). If leaves carried the SIZING metric's form, F
    // would be ~0 — the nonzero shear proves the separation (sizing plain,
    // diagonal choice composed).
    const SX = 6;
    const SY = 2;
    const SH = 8;
    const sheared = new ShearedPlaneSampler(SX, SY, SH);
    const plain = new SyntheticCylinderSampler(R0, H);
    const field = constantField(plain, 45);
    const qt = new PeriodicBalancedQuadtree(field, plain, { maxLevel: 8, efgSampler: sheared });
    const leaves = qt.leaves();
    expect(leaves.length).toBeGreaterThan(0);
    for (const leaf of leaves) {
      expect(leaf.efg).toBeDefined();
      const { E, F, G } = leaf.efg as { E: number; F: number; G: number };
      // FD is exact on the linear map (up to float rounding).
      expect(E).toBeCloseTo(SX * SX, 6);
      expect(F).toBeCloseTo(SX * SH, 6);
      expect(G).toBeCloseTo(SH * SH + SY * SY, 6);
    }
  });

  it('(d) metric-RELIABILITY guard: a fold inside the cell suppresses efg (legacy fallback)', () => {
    // MEASURED epoch-1 regression (LowPolyFacet 0→7.8, GothicArches 0.7→4.4
    // band sub-15°, all in the DP tag): on facet/crease styles the surface
    // bends INSIDE a cell, the constant cell-center efg misrepresents it, and
    // the DP optimizes against the lie. Guard: when efg varies strongly across
    // the cell (center vs inset corners), do NOT attach efg — the existing
    // shapedTemplate gate then falls back to the legacy fan, which the
    // measurement showed handles intra-cell relief better.
    /** A fold at u=FOLD (non-dyadic, so coarse cells straddle it): E jumps 1 → 1+SLOPE². */
    const FOLD = 0.3;
    const SLOPE = 4;
    const folded: SurfaceSampler = {
      position: (u: number, t: number): readonly [number, number, number] => {
        const uu = u - Math.floor(u);
        return [uu, t * 2, uu < FOLD ? 0 : (uu - FOLD) * SLOPE];
      },
    };
    const plain = new SyntheticCylinderSampler(R0, H);
    const field = constantField(plain, 45);
    const qt = new PeriodicBalancedQuadtree(field, plain, { maxLevel: 8, efgSampler: folded });
    const leaves = qt.leaves();
    expect(leaves.length).toBeGreaterThan(0);
    let straddling = 0;
    let away = 0;
    for (const leaf of leaves) {
      const uSpan = 1 / 2 ** (leaf.level + (leaf.uExtra ?? 0));
      const u1 = leaf.u0 + uSpan;
      if (leaf.u0 < FOLD && FOLD < u1) {
        // The fold runs through this cell — the constant-metric assumption is
        // violated; efg must be suppressed so the legacy template fires.
        straddling++;
        expect(leaf.efg).toBeUndefined();
      } else if (u1 < FOLD - uSpan || leaf.u0 > FOLD + uSpan) {
        // Comfortably away from the fold (one full cell of clearance): the
        // metric is locally constant — efg must be attached.
        away++;
        expect(leaf.efg).toBeDefined();
      }
    }
    expect(straddling).toBeGreaterThan(0);
    expect(away).toBeGreaterThan(0);
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
