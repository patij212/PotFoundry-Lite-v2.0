import { describe, it, expect } from 'vitest';
import type { FeatureGraph } from '../featureGraph/types';
import type { StyleId } from '../../../../../geometry/types';
import { STYLE_FUNCTIONS } from '../../../../../geometry/styles';
import {
  countJunctionNodes,
  isCountUnstableStyle,
  COUNT_UNSTABLE_STYLES,
} from './countUnstable';

// The dispatch predicate is a per-style ALLOW-LIST (E-2026-07-09-DISPATCH-
// PREDICATE): the graph-junction signal over-triggered 17/20 and no measured
// graph signal separates the intended pair with a defensible margin (see
// countUnstable.ts header). The predicate now keys on styleId.

const EMPTY: FeatureGraph = { nodes: [], edges: [] };

describe('count-unstable dispatch predicate (allow-list)', () => {
  // ── The 20-style CONFUSION MATRIX: every style asserts its expected dispatch.
  // Gothic + GeoStar IN (count-unstable → Tier-C); the other 18 OUT (byte-
  // identical conforming fallback).
  const styleIds = Object.keys(STYLE_FUNCTIONS) as StyleId[];
  const EXPECT_IN: readonly StyleId[] = ['GothicArches', 'GeometricStar'];

  it('covers all 20 styles', () => {
    expect(styleIds.length).toBe(20);
  });

  for (const styleId of styleIds) {
    const expectedIn = EXPECT_IN.includes(styleId);
    it(`${styleId} dispatches ${expectedIn ? 'IN (Tier-C)' : 'OUT (fallback)'}`, () => {
      // The graph argument is intentionally unused by the allow-list; pass empty.
      expect(isCountUnstableStyle(styleId, EMPTY)).toBe(expectedIn);
    });
  }

  it('the allow-list is exactly {GothicArches, GeometricStar}', () => {
    expect([...COUNT_UNSTABLE_STYLES].sort()).toEqual(
      [...EXPECT_IN].sort(),
    );
    const dispatched = styleIds.filter((s) =>
      isCountUnstableStyle(s, EMPTY),
    );
    expect(dispatched.sort()).toEqual([...EXPECT_IN].sort());
  });

  it('an empty / unknown styleId is a safe OUT fallback', () => {
    expect(isCountUnstableStyle('', EMPTY)).toBe(false);
    expect(isCountUnstableStyle('NotAStyle', EMPTY)).toBe(false);
  });

  // countJunctionNodes is retained as a diagnostic (the evidence behind the
  // allow-list). Guard its degree convention so the diagnostic stays honest.
  describe('countJunctionNodes (retained diagnostic)', () => {
    const edge = (
      endpoints: [number, number],
      kind: 'open' | 'loop',
    ): FeatureGraph['edges'][number] => ({
      polyline: [
        { u: 0, t: 0 },
        { u: 0.1, t: 0.1 },
      ],
      strength: 5,
      types: ['curvature-ridge'],
      kind,
      endpoints,
    });

    it('counts degree≥3 nodes (three edges at one node = 1 junction)', () => {
      const graph: FeatureGraph = {
        nodes: [
          { u: 0.5, t: 0.5 },
          { u: 0.2, t: 0.2 },
          { u: 0.8, t: 0.2 },
          { u: 0.5, t: 0.9 },
        ],
        edges: [
          edge([0, 1], 'open'),
          edge([0, 2], 'open'),
          edge([0, 3], 'open'),
        ],
      };
      expect(countJunctionNodes(graph)).toBe(1);
    });

    it('loops-only graph has 0 junctions (loop endpoints count twice)', () => {
      const graph: FeatureGraph = {
        nodes: [
          { u: 0, t: 0.3 },
          { u: 0, t: 0.7 },
        ],
        edges: [edge([0, 0], 'loop'), edge([1, 1], 'loop')],
      };
      expect(countJunctionNodes(graph)).toBe(0);
    });

    it('empty graph has 0 junctions', () => {
      expect(countJunctionNodes(EMPTY)).toBe(0);
    });
  });
});
