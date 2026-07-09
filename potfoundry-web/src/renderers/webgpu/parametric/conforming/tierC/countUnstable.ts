/**
 * countUnstable.ts — the Tier-C dispatch predicate.
 *
 * A style is COUNT-UNSTABLE when its feature network births/merges crest
 * families (Gothic rib 2D diagonal net, GeoStar chevron 6→32): there is no
 * fixed edge-chain set for the structured Tier-B primitives to embed, so the
 * perfect-mesher Tier-C closer is the only path to whole-mesh 0-outlier.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY AN ALLOW-LIST AND NOT A GRAPH SIGNAL (E-2026-07-09-DISPATCH-PREDICATE)
 * ═══════════════════════════════════════════════════════════════════════════
 * The ORIGINAL predicate was `countJunctionNodes(graph) > 0` — the theory being
 * that births/merges are exactly the degree≥3 JUNCTION nodes. That predicate
 * OVER-TRIGGERED: it selected 17 of 20 styles (E-2026-07-09-REBASELINE20 §V12),
 * because at production res the detector emits SPURIOUS junctions from the
 * weld-lattice crossings of smooth/relief styles (Wave j=219, ArtDeco j=349,
 * Voronoi j=263) — and the intended pair (Gothic 163, GeoStar 230) sits IN THE
 * MIDDLE of that noise range, so no raw junction-count threshold separates them.
 *
 * E-2026-07-09-DISPATCH-PREDICATE then measured FOUR structural replacement
 * signals on all 20 styles (data: research/exchange/_dispatch_predicate/
 * signals.ndjson; probe `_dispatchSignals.test.ts`):
 *   (a) junction DENSITY = junctions / total feature arc-length (mm)
 *   (b) count-INSTABILITY across two detector scales (junctions@fineRes 120 vs 240)
 *   (c) CHAIN-WEIGHTED junction score (fraction of junctions on long connected chains)
 *   (d) CONDITIONED-graph residual junctions (after prune + weld-lattice merge)
 * RESULT: NONE separates cleanly. No single signal admits a threshold isolating
 * exactly {Gothic, GeoStar}; the only 2-signal boxes that fit are KNIFE-EDGES —
 * the tightest face has a 0.5% margin (longFrac 0.847 vs GyroidManifold 0.851)
 * and the density face a 2.5% margin (0.0158 vs HexagonalHive 0.0154) — pure
 * 4-parameter overfits of 2 targets among 20, NOT the structural / order-of-
 * magnitude separation the pre-registration required. The kill criterion fired.
 *
 * Per the pre-registered protocol, we ship the HONEST per-style ALLOW-LIST as
 * the interim: an explicit list beats a fragile threshold that a res change, a
 * parameter tweak, or a new style would silently break (mis-routing a smooth
 * style through the intractable full-pot Tier-C path). The general
 * count-instability predicate remains OPEN RESEARCH (spec §V12b). This is
 * production-safe because the flag `__pfPerfectMesher` is default-OFF and the
 * flag-off path never reaches this predicate (pure delegation in index.ts).
 * ═══════════════════════════════════════════════════════════════════════════
 */

import type { FeatureGraph } from '../featureGraph/types';
import type { StyleId } from '../../../../../geometry/types';

/**
 * The styles whose feature network is count-unstable (birth/merge crest
 * families) and therefore REQUIRE the Tier-C perfect-mesher closer. This is an
 * explicit interim allow-list — see the module header for why no measured graph
 * signal separates these two from smooth/relief junction noise with a
 * defensible margin.
 */
export const COUNT_UNSTABLE_STYLES: ReadonlySet<StyleId> = new Set<StyleId>([
  'GothicArches', // rib 2D diagonal net — families birth/merge across t
  'GeometricStar', // chevron 6→32 — sector count multiplies up the wall
]);

/**
 * Number of junction (degree ≥3) nodes in the graph, counting each edge
 * endpoint once and each loop's shared endpoint twice.
 *
 * RETAINED for diagnostics (`_dispatchDiag`, `_dispatchSignals`) and as the
 * measured evidence behind the allow-list decision. It is NO LONGER the
 * dispatch predicate (it over-triggered 17/20 — see the module header).
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

/**
 * True iff the style's feature network is count-unstable and must take the
 * Tier-C perfect-mesher path.
 *
 * INTERIM: an explicit per-style allow-list (see the module header for the
 * measured refutation of every graph-signal alternative). The `graph` argument
 * is kept in the signature for the eventual general predicate and for callers
 * that already build it; it is intentionally UNUSED today.
 *
 * @param styleId The style being meshed. An empty / unknown id ⇒ false (safe
 *                fallback to the byte-identical conforming path).
 */
export function isCountUnstableStyle(
  styleId: string,
  _graph: FeatureGraph,
): boolean {
  return COUNT_UNSTABLE_STYLES.has(styleId as StyleId);
}
