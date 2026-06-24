/**
 * unify.test.ts — TDD tests for unifyToGraph (the ensemble unifier).
 *
 * The unifier merges the three detectors' raw segments into ONE topology-rich
 * feature graph. The hard cases under test:
 *
 * (a) ALL-THREE-FIRE MERGE (the de-risk): a single locus where curvature-ridge,
 *     normal-discontinuity AND component-boundary all emit a near-coincident
 *     polyline (jittered < weldTol) collapses to ONE edge carrying all three
 *     types — not three near-duplicates.
 * (b) Y-junction: three arms meeting at a point → one degree-3 node + 3 open edges.
 * (c) Closed square: a ring of segments → one `kind:'loop'` edge.
 * (d) Determinism: identical input twice → byte-identical node/edge output.
 * (e) Saliency normalization: a high-degree normal crease and a high-κ ridge are
 *     comparable after normalization — neither trivially dominates by raw unit.
 * (f) Weak (below-min-saliency) edges dropped.
 *
 * @module conforming/featureGraph/unify.test
 */

import { describe, it, expect } from 'vitest';
import { unifyToGraph } from './unify';
import type { RawSegments, RawSegment, FeatureType } from './types';

// ---------------------------------------------------------------------------
// Helpers — build a straight chain of segments along a constant-t line.
// ---------------------------------------------------------------------------

/** Build a horizontal (constant-t) chain of n segments from u0..u1. */
function chain(
  u0: number,
  u1: number,
  t: number,
  n: number,
  strength: number,
  jitter = 0,
): RawSegment[] {
  const segs: RawSegment[] = [];
  for (let k = 0; k < n; k++) {
    const ua = u0 + ((u1 - u0) * k) / n;
    const ub = u0 + ((u1 - u0) * (k + 1)) / n;
    const j = jitter;
    segs.push({
      a: { u: ua, t: t + (k % 2 === 0 ? j : -j) },
      b: { u: ub, t: t + (k % 2 === 0 ? -j : j) },
      strength,
    });
  }
  return segs;
}

function rawSet(
  segs: RawSegment[],
  type: FeatureType,
  threshold: number,
): RawSegments {
  return { segs, type, threshold };
}

const OPTS = { weldTol: 1e-3, minStrength: 1, uToMm: 100, tToMm: 100 };

// ---------------------------------------------------------------------------
// (a) ALL-THREE-FIRE MERGE — the de-risk
// ---------------------------------------------------------------------------

describe('unifyToGraph — all-three-fire merge (de-risk)', () => {
  // Same locus, three detectors, jitter < weldTol. Each carries strength at
  // exactly 3× its own threshold so saliency = 3 for all three.
  const t = 0.5;
  const j = 2e-4; // < weldTol (1e-3)
  const ridge = rawSet(chain(0.2, 0.6, t, 8, 0.15, j), 'curvature-ridge', 0.05);
  const crease = rawSet(chain(0.2, 0.6, t, 8, 60, j), 'normal-discontinuity', 20);
  const bound = rawSet(chain(0.2, 0.6, t, 8, 1, j), 'component-boundary', 1);

  const g = unifyToGraph([ridge, crease, bound], OPTS);

  it('collapses three coincident polylines into ONE edge', () => {
    expect(g.edges.length).toBe(1);
  });

  it('the merged edge carries ALL THREE feature types', () => {
    const types = new Set(g.edges[0].types);
    expect(types.has('curvature-ridge')).toBe(true);
    expect(types.has('normal-discontinuity')).toBe(true);
    expect(types.has('component-boundary')).toBe(true);
    expect(types.size).toBe(3);
  });

  it('the merged edge keeps the max saliency (all three = 3.0)', () => {
    expect(g.edges[0].strength).toBeCloseTo(3, 5);
  });
});

// ---------------------------------------------------------------------------
// (b) Y-junction — degree-3 node + 3 open edges
// ---------------------------------------------------------------------------

describe('unifyToGraph — Y junction', () => {
  // Three arms meeting at the centre (0.5, 0.5).
  const c = { u: 0.5, t: 0.5 };
  const armSegs: RawSegment[] = [
    // arm 1 → up
    { a: c, b: { u: 0.5, t: 0.7 }, strength: 60 },
    { a: { u: 0.5, t: 0.7 }, b: { u: 0.5, t: 0.9 }, strength: 60 },
    // arm 2 → down-left
    { a: c, b: { u: 0.3, t: 0.3 }, strength: 60 },
    { a: { u: 0.3, t: 0.3 }, b: { u: 0.1, t: 0.1 }, strength: 60 },
    // arm 3 → down-right
    { a: c, b: { u: 0.7, t: 0.3 }, strength: 60 },
    { a: { u: 0.7, t: 0.3 }, b: { u: 0.9, t: 0.1 }, strength: 60 },
  ];
  const g = unifyToGraph(
    [rawSet(armSegs, 'normal-discontinuity', 20)],
    OPTS,
  );

  it('produces exactly 3 open edges', () => {
    expect(g.edges.length).toBe(3);
    for (const e of g.edges) expect(e.kind).toBe('open');
  });

  it('has a degree-3 junction node shared by all three edges', () => {
    // Count how many edge-endpoints reference each node.
    const deg = new Array<number>(g.nodes.length).fill(0);
    for (const e of g.edges) {
      deg[e.endpoints[0]]++;
      deg[e.endpoints[1]]++;
    }
    const maxDeg = Math.max(...deg);
    expect(maxDeg).toBe(3);
    // The degree-3 node is the centre (0.5, 0.5).
    const junctionId = deg.indexOf(3);
    expect(g.nodes[junctionId].u).toBeCloseTo(0.5, 3);
    expect(g.nodes[junctionId].t).toBeCloseTo(0.5, 3);
  });
});

// ---------------------------------------------------------------------------
// (c) Closed square → one loop edge
// ---------------------------------------------------------------------------

describe('unifyToGraph — closed square loop', () => {
  const corners = [
    { u: 0.3, t: 0.3 },
    { u: 0.6, t: 0.3 },
    { u: 0.6, t: 0.6 },
    { u: 0.3, t: 0.6 },
  ];
  const sq: RawSegment[] = [];
  for (let k = 0; k < 4; k++) {
    sq.push({ a: corners[k], b: corners[(k + 1) % 4], strength: 60 });
  }
  const g = unifyToGraph(
    [rawSet(sq, 'normal-discontinuity', 20)],
    OPTS,
  );

  it('produces exactly one loop edge', () => {
    expect(g.edges.length).toBe(1);
    expect(g.edges[0].kind).toBe('loop');
  });

  it('the loop polyline closes on itself (first ≈ last)', () => {
    const pl = g.edges[0].polyline;
    expect(pl[0].u).toBeCloseTo(pl[pl.length - 1].u, 6);
    expect(pl[0].t).toBeCloseTo(pl[pl.length - 1].t, 6);
  });

  it('a loop has identical endpoints', () => {
    expect(g.edges[0].endpoints[0]).toBe(g.edges[0].endpoints[1]);
  });
});

// ---------------------------------------------------------------------------
// (d) Determinism — identical input twice → identical output
// ---------------------------------------------------------------------------

describe('unifyToGraph — determinism', () => {
  // A mixed input: a square loop + a Y + an all-three locus.
  function buildInput(): RawSegments[] {
    const loopSegs: RawSegment[] = [];
    const corners = [
      { u: 0.1, t: 0.1 },
      { u: 0.2, t: 0.1 },
      { u: 0.2, t: 0.2 },
      { u: 0.1, t: 0.2 },
    ];
    for (let k = 0; k < 4; k++) {
      loopSegs.push({ a: corners[k], b: corners[(k + 1) % 4], strength: 60 });
    }
    const ridge = rawSet(chain(0.5, 0.8, 0.5, 6, 0.15), 'curvature-ridge', 0.05);
    const crease = rawSet(
      [...chain(0.5, 0.8, 0.5, 6, 60, 1e-4), ...loopSegs],
      'normal-discontinuity',
      20,
    );
    const bound = rawSet(chain(0.5, 0.8, 0.5, 6, 1, 1e-4), 'component-boundary', 1);
    return [ridge, crease, bound];
  }

  it('two runs produce byte-identical JSON', () => {
    const a = unifyToGraph(buildInput(), OPTS);
    const b = unifyToGraph(buildInput(), OPTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('reversed detector order produces the same graph', () => {
    const input = buildInput();
    const a = unifyToGraph(input, OPTS);
    const b = unifyToGraph([...input].reverse(), OPTS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// (e) Saliency normalization — cross-unit comparability
// ---------------------------------------------------------------------------

describe('unifyToGraph — saliency normalization', () => {
  // A normal crease at 40° (threshold 20 → saliency 2.0) and a curvature ridge
  // at κ=0.10 (threshold 0.05 → saliency 2.0). Despite raw strengths differing
  // by 400× (40 vs 0.10), normalized saliency is EQUAL. Both must survive a
  // minStrength (min-saliency) of 1.5, and neither dominates by unit.
  const crease = rawSet(
    chain(0.1, 0.4, 0.3, 6, 40, 0),
    'normal-discontinuity',
    20,
  );
  const ridge = rawSet(chain(0.6, 0.9, 0.7, 6, 0.1, 0), 'curvature-ridge', 0.05);

  const g = unifyToGraph([crease, ridge], {
    ...OPTS,
    minStrength: 1.5,
  });

  it('keeps BOTH edges (both saliency 2.0 > min 1.5)', () => {
    expect(g.edges.length).toBe(2);
  });

  it('both edges have equal normalized saliency despite 400× raw gap', () => {
    const sals = g.edges.map((e) => e.strength).sort((x, y) => x - y);
    expect(sals[0]).toBeCloseTo(2, 5);
    expect(sals[1]).toBeCloseTo(2, 5);
  });

  it('raw strength does NOT leak through — a 40° crease is not 40-strong', () => {
    for (const e of g.edges) expect(e.strength).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// (f) Weak edges dropped (below min saliency)
// ---------------------------------------------------------------------------

describe('unifyToGraph — weak-edge drop', () => {
  // One STRONG ridge (κ=0.5 → saliency 10) and one WEAK ridge (κ=0.051 →
  // saliency 1.02). With minStrength (min-saliency) = 2.0 the weak one is dropped.
  const strong = rawSet(chain(0.1, 0.4, 0.3, 6, 0.5, 0), 'curvature-ridge', 0.05);
  const weak = rawSet(chain(0.6, 0.9, 0.7, 6, 0.051, 0), 'curvature-ridge', 0.05);

  const g = unifyToGraph([strong, weak], { ...OPTS, minStrength: 2.0 });

  it('drops the below-min-saliency edge', () => {
    expect(g.edges.length).toBe(1);
  });

  it('the surviving edge is the strong one (saliency 10)', () => {
    expect(g.edges[0].strength).toBeCloseTo(10, 5);
  });
});

// ---------------------------------------------------------------------------
// Sanity — empty input
// ---------------------------------------------------------------------------

describe('unifyToGraph — empty input', () => {
  it('returns an empty graph', () => {
    const g = unifyToGraph([], OPTS);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });
});
