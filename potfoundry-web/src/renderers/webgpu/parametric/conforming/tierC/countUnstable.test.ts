import { describe, it, expect } from 'vitest';
import type {
  FeatureEdge,
  FeatureGraph,
} from '../featureGraph/types';
import { countJunctionNodes, isCountUnstableStyle } from './countUnstable';

function edge(
  endpoints: [number, number],
  kind: 'open' | 'loop',
): FeatureEdge {
  return {
    polyline: [
      { u: 0, t: 0 },
      { u: 0.1, t: 0.1 },
    ],
    strength: 5,
    types: ['curvature-ridge'],
    kind,
    endpoints,
  };
}

describe('count-unstable dispatch predicate', () => {
  it('true when the feature graph has a junction (degree ≥3) node', () => {
    // Three open edges all meeting at node 0 — a birth/merge junction, the
    // count-unstable signature (Gothic rib net, GeoStar chevron 6→32).
    const graph: FeatureGraph = {
      nodes: [
        { u: 0.5, t: 0.5 },
        { u: 0.2, t: 0.2 },
        { u: 0.8, t: 0.2 },
        { u: 0.5, t: 0.9 },
      ],
      edges: [edge([0, 1], 'open'), edge([0, 2], 'open'), edge([0, 3], 'open')],
    };
    expect(countJunctionNodes(graph)).toBe(1);
    expect(isCountUnstableStyle('GothicArches', graph)).toBe(true);
  });

  it('false for a loops-only graph (count-stable crest families, Tier-B)', () => {
    // Independent closed crest loops: every loop endpoint node has degree 2
    // (loop endpoints count twice, same convention as conditionGraph).
    const graph: FeatureGraph = {
      nodes: [
        { u: 0, t: 0.3 },
        { u: 0, t: 0.7 },
      ],
      edges: [edge([0, 0], 'loop'), edge([1, 1], 'loop')],
    };
    expect(countJunctionNodes(graph)).toBe(0);
    expect(isCountUnstableStyle('BambooSegments', graph)).toBe(false);
  });

  it('false for an empty graph (smooth Tier-A)', () => {
    const graph: FeatureGraph = { nodes: [], edges: [] };
    expect(countJunctionNodes(graph)).toBe(0);
    expect(isCountUnstableStyle('HarmonicRipple', graph)).toBe(false);
  });

  it('false for open chains meeting pairwise (degree 2 through-points)', () => {
    // Two open edges sharing one endpoint: a continuation, not a birth/merge.
    const graph: FeatureGraph = {
      nodes: [
        { u: 0.1, t: 0.1 },
        { u: 0.5, t: 0.5 },
        { u: 0.9, t: 0.9 },
      ],
      edges: [edge([0, 1], 'open'), edge([1, 2], 'open')],
    };
    expect(countJunctionNodes(graph)).toBe(0);
    expect(isCountUnstableStyle('ArtDeco', graph)).toBe(false);
  });
});
