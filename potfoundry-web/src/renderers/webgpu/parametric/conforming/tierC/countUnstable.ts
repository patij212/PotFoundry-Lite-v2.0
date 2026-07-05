/**
 * countUnstable.ts — the Tier-C dispatch predicate.
 *
 * A style is COUNT-UNSTABLE when its feature network births/merges crest
 * families (Gothic rib 2D diagonal net, GeoStar chevron 6→32): there is no
 * fixed edge-chain set for the structured Tier-B primitives to embed, so the
 * perfect-mesher Tier-C closer is the only path to whole-mesh 0-outlier. In
 * the feature graph, births/merges are exactly the JUNCTION nodes — nodes of
 * degree ≥3 (loop endpoints count twice, the conditionGraph convention), where
 * a crest family splits or joins. Count-stable graphs (independent loops,
 * pairwise-continued open chains) have only degree-≤2 nodes.
 *
 * Graph-driven, zero per-style code: the styleId is accepted only for future
 * explicit overrides (spec §1 Tier-C definition).
 */

import type { FeatureGraph } from '../featureGraph/types';

/**
 * Number of junction (degree ≥3) nodes in the graph, counting each edge
 * endpoint once and each loop's shared endpoint twice.
 */
export function countJunctionNodes(graph: FeatureGraph): number {
  const degree = new Array<number>(graph.nodes.length).fill(0);
  for (const e of graph.edges) {
    degree[e.endpoints[0]] += 1;
    degree[e.endpoints[1]] += 1;
  }
  let junctions = 0;
  for (const d of degree) {
    if (d >= 3) junctions++;
  }
  return junctions;
}

/** True iff the style's feature network is count-unstable (≥1 birth/merge). */
export function isCountUnstableStyle(
  _styleId: string,
  graph: FeatureGraph,
): boolean {
  return countJunctionNodes(graph) > 0;
}
