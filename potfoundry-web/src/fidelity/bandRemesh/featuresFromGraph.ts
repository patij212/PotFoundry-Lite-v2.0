/**
 * featuresFromGraph — map a style-agnostic detector FeatureGraph to the corridor
 * mesher's MultiFeatureSpec[]. Open edges → open chains; loop edges → closed loops;
 * an endpoint shared by ≥3 edges is a JUNCTION (every edge there anchors to the SAME
 * junctionKey so corridorPaveMulti welds them to one shared interior id). Pure CPU.
 * @module fidelity/bandRemesh/featuresFromGraph
 */
import type { FeatureGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';
import type { MultiFeatureSpec } from './realCorridor';
import type { ChainAnchor } from './corridorPave';

export function featuresFromGraph(graph: FeatureGraph): MultiFeatureSpec[] {
  const degree = new Map<number, number>();
  for (const e of graph.edges) for (const n of e.endpoints) degree.set(n, (degree.get(n) ?? 0) + 1);
  const anchorFor = (node: number): ChainAnchor =>
    (degree.get(node) ?? 0) >= 3
      ? { kind: 'junction', junctionKey: `node-${node}` }
      : { kind: 'snap-boundary' };
  return graph.edges.map((e): MultiFeatureSpec => {
    const polyline = e.polyline.map((p) => ({ u: p.u, t: p.t }));
    if (e.kind === 'loop') return { polyline, closed: true };
    return { polyline, closed: false, start: anchorFor(e.endpoints[0]), end: anchorFor(e.endpoints[1]) };
  });
}
