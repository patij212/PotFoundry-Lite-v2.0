// featuresFromGraph.test.ts
import { describe, it, expect } from 'vitest';
import { featuresFromGraph } from './featuresFromGraph';
import type { FeatureGraph, FeatureType } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';

function edge(poly: Array<[number, number]>, kind: 'open' | 'loop', ends: [number, number]) {
  return {
    polyline: poly.map(([u, t]) => ({ u, t })),
    strength: 2,
    types: ['curvature-ridge'] as FeatureType[], // mutable — FeatureType[] (NOT `as const`)
    kind,
    endpoints: ends,
  };
}

describe('featuresFromGraph', () => {
  it('maps an open edge to an open chain with snap-boundary anchors', () => {
    const graph: FeatureGraph = {
      nodes: [{ u: 0.2, t: 0.3 }, { u: 0.5, t: 0.6 }],
      edges: [edge([[0.2, 0.3], [0.35, 0.45], [0.5, 0.6]], 'open', [0, 1])],
    };
    const out = featuresFromGraph(graph);
    expect(out).toHaveLength(1);
    expect(out[0].closed).toBe(false);
    expect(out[0].polyline).toHaveLength(3);
    expect(out[0].start).toEqual({ kind: 'snap-boundary' });
    expect(out[0].end).toEqual({ kind: 'snap-boundary' });
  });

  it('maps a loop edge to a closed chain (no anchors)', () => {
    const graph: FeatureGraph = {
      nodes: [{ u: 0.4, t: 0.5 }],
      edges: [edge([[0.4, 0.5], [0.5, 0.5], [0.5, 0.6], [0.4, 0.5]], 'loop', [0, 0])],
    };
    const out = featuresFromGraph(graph);
    expect(out[0].closed).toBe(true);
    expect(out[0].start).toBeUndefined();
    expect(out[0].end).toBeUndefined();
  });

  it('anchors a degree-3 junction node to one shared junctionKey across all its edges', () => {
    const graph: FeatureGraph = {
      nodes: [{ u: 0.4, t: 0.5 }, { u: 0.2, t: 0.5 }, { u: 0.6, t: 0.5 }, { u: 0.4, t: 0.8 }],
      edges: [
        edge([[0.4, 0.5], [0.2, 0.5]], 'open', [0, 1]),
        edge([[0.4, 0.5], [0.6, 0.5]], 'open', [0, 2]),
        edge([[0.4, 0.5], [0.4, 0.8]], 'open', [0, 3]),
      ],
    };
    const out = featuresFromGraph(graph);
    for (const f of out) expect(f.start).toEqual({ kind: 'junction', junctionKey: 'node-0' });
    for (const f of out) expect(f.end).toEqual({ kind: 'snap-boundary' });
  });
});
