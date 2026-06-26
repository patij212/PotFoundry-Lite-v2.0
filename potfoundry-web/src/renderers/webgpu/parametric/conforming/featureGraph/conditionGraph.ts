/**
 * conditionGraph.ts — feature-graph conditioning (the perfected mesh base).
 *
 * Turns the validated detector's NOISY raw {@link FeatureGraph} (≈2000 dangling
 * spurs, junctions packed at the weld lattice, ~⅓ degenerate) into a clean,
 * stable junction skeleton — WITHOUT losing a real feature. See
 * `docs/superpowers/specs/2026-06-26-feature-graph-conditioning-design.md`.
 *
 * Governing principle: FIDELITY is the hard constraint (the conditioned graph must
 * still pass the dense-truth recall/precision gate); cleanliness is maximized
 * subject to it. Operations, in order, each independently toggle-able:
 *
 *   1. prune spurs          — drop dangling open edges shorter than minFeatureMm,
 *                             dissolving the degree-2 through-points they expose.
 *   2. simplify polylines    — Douglas–Peucker per edge (endpoints preserved).
 *   3. merge junction clusters — collapse degree≥3 nodes within junctionMergeMm.
 *   4. type nodes           — classify endpoint / regular / triple / reflex /
 *                             highDegree from degree + wedge angles.
 *
 * Pure + deterministic: distances use the shared (u,t)→mm periodic metric
 * ({@link ./graphMetric}); output uses a canonical ordering so the same input
 * (in any node/edge order) yields the same graph.
 *
 * @module conforming/featureGraph/conditionGraph
 */

import type { FeatureGraph, FeatureEdge, FeatureType, Vec2 } from './types';
import { pointDistMm, segDistMm, polyLengthMm, signedGap, cmpVec } from './graphMetric';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Classification of a conditioned node. */
export type NodeType = 'endpoint' | 'regular' | 'triple' | 'reflex' | 'highDegree';

/** Options for {@link conditionGraph}. */
export interface ConditionGraphOptions {
  /** u→mm scale (circumference). */
  uToMm: number;
  /** t→mm scale (height). */
  tToMm: number;
  /** Dangling open edges shorter than this (mm) are pruned as spurs. */
  minFeatureMm: number;
  /** Douglas–Peucker tolerance (mm) for polyline simplification. */
  simplifyTolMm: number;
  /** Degree≥3 nodes within this distance (mm) merge into one junction. */
  junctionMergeMm: number;
  /** Run spur pruning (default true). */
  prune?: boolean;
  /** Run polyline simplification (default true). */
  simplify?: boolean;
  /** Run junction-cluster merging (default true). */
  mergeJunctions?: boolean;
  /** Compute node types (default true; output always carries `nodeTypes`). */
  typeNodes?: boolean;
  /** Split degree≥4 nodes into triples (default false — gated, see spec §4.3). */
  splitHighDegree?: boolean;
}

/** Diagnostic counts from a conditioning run. */
export interface ConditionStats {
  prunedSpurs: number;
  mergedClusters: number;
  droppedEdges: number;
  simplifiedPoints: number;
  nodeKindCounts: Record<NodeType, number>;
}

/** Result of {@link conditionGraph}: a clean graph + per-node types + stats. */
export interface ConditionedGraph extends FeatureGraph {
  /** One {@link NodeType} per entry in `nodes`. */
  nodeTypes: NodeType[];
  stats: ConditionStats;
}

/**
 * Condition a raw feature graph into a clean junction skeleton.
 *
 * @param graph Raw {@link FeatureGraph} from `detectFeatures`/`unifyToGraph`.
 * @param opts  Physical scales, thresholds, and per-operation toggles.
 */
export function conditionGraph(graph: FeatureGraph, opts: ConditionGraphOptions): ConditionedGraph {
  const { uToMm, tToMm } = opts;
  const wg = buildWorking(graph);

  const stats: ConditionStats = {
    prunedSpurs: 0,
    mergedClusters: 0,
    droppedEdges: 0,
    simplifiedPoints: 0,
    nodeKindCounts: { endpoint: 0, regular: 0, triple: 0, reflex: 0, highDegree: 0 },
  };

  if (opts.prune !== false) pruneSpurs(wg, opts.minFeatureMm, uToMm, tToMm, stats);
  if (opts.simplify !== false) simplifyEdges(wg, opts.simplifyTolMm, uToMm, tToMm, stats);
  if (opts.mergeJunctions !== false) mergeJunctions(wg, opts.junctionMergeMm, uToMm, tToMm, stats);

  return emit(wg, uToMm, tToMm, stats);
}

// ---------------------------------------------------------------------------
// Mutable working graph
// ---------------------------------------------------------------------------

interface WEdge {
  a: number;
  b: number;
  pts: Vec2[];
  types: FeatureType[];
  strength: number;
  kind: 'open' | 'loop';
  alive: boolean;
}

interface Working {
  pos: Vec2[];
  alive: boolean[];
  edges: WEdge[];
}

function buildWorking(graph: FeatureGraph): Working {
  const pos = graph.nodes.map((n) => ({ u: n.u, t: n.t }));
  const alive = pos.map(() => true);
  const edges: WEdge[] = graph.edges.map((e) => ({
    a: e.endpoints[0],
    b: e.endpoints[1],
    pts: e.polyline.map((p) => ({ u: p.u, t: p.t })),
    types: [...e.types],
    strength: e.strength,
    kind: e.kind,
    alive: true,
  }));
  return { pos, alive, edges };
}

/** Degree of every node (loop endpoints count twice), over alive edges. */
function computeDegree(wg: Working): number[] {
  const deg = new Array<number>(wg.pos.length).fill(0);
  for (const e of wg.edges) {
    if (!e.alive) continue;
    deg[e.a]++;
    deg[e.b]++;
  }
  return deg;
}

/** Alive edge indices incident to node `x`. */
function incidentEdges(wg: Working, x: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < wg.edges.length; i++) {
    const e = wg.edges[i];
    if (e.alive && (e.a === x || e.b === x)) out.push(i);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Op 1 — prune spurs (+ dissolve the degree-2 nodes pruning exposes)
// ---------------------------------------------------------------------------

function pruneSpurs(
  wg: Working,
  minFeatureMm: number,
  uToMm: number,
  tToMm: number,
  stats: ConditionStats,
): void {
  for (let guard = 0; guard < 1000; guard++) {
    const deg = computeDegree(wg);
    let changed = false;
    for (const e of wg.edges) {
      if (!e.alive || e.kind === 'loop') continue; // loops are features, not spurs
      const dangling = deg[e.a] === 1 || deg[e.b] === 1;
      if (dangling && polyLengthMm(e.pts, uToMm, tToMm) < minFeatureMm) {
        e.alive = false;
        stats.prunedSpurs++;
        changed = true;
      }
    }
    const dissolved = dissolveDegree2(wg);
    if (!changed && dissolved === 0) break;
  }
}

/**
 * Merge the two edges at every degree-2 node into one (the feature continues
 * through), removing the node. A degree-2 node has exactly one feature passing
 * through it (a third edge would make it a junction), so this is loss-free.
 * Returns the number of nodes dissolved.
 */
function dissolveDegree2(wg: Working): number {
  let dissolved = 0;
  for (let pass = 0; pass < 1000; pass++) {
    const deg = computeDegree(wg);
    let did = false;
    for (let x = 0; x < wg.pos.length; x++) {
      if (!wg.alive[x] || deg[x] !== 2) continue;
      const inc = incidentEdges(wg, x);
      if (inc.length !== 2) continue; // (a loop at x reads as degree 2 but inc===1)
      const e1 = wg.edges[inc[0]];
      const e2 = wg.edges[inc[1]];
      if (e1.kind === 'loop' || e2.kind === 'loop') continue;

      // Orient e1 to END at x (far1 → x); e2 to START at x (x → far2).
      const p1 = e1.b === x ? e1.pts : [...e1.pts].reverse();
      const far1 = e1.b === x ? e1.a : e1.b;
      const p2 = e2.a === x ? e2.pts : [...e2.pts].reverse();
      const far2 = e2.a === x ? e2.b : e2.a;

      const mergedPts = [...p1, ...p2.slice(1)]; // drop the duplicate x
      const merged: WEdge = {
        a: far1,
        b: far2,
        pts: mergedPts,
        types: unionTypes(e1.types, e2.types),
        strength: Math.max(e1.strength, e2.strength),
        kind: far1 === far2 ? 'loop' : 'open',
        alive: true,
      };
      e1.alive = false;
      e2.alive = false;
      wg.alive[x] = false;
      wg.edges.push(merged);
      dissolved++;
      did = true;
      break; // degree map is now stale — recompute next pass
    }
    if (!did) break;
  }
  return dissolved;
}

// ---------------------------------------------------------------------------
// Op 2 — simplify polylines (Douglas–Peucker under the (u,t)→mm metric)
// ---------------------------------------------------------------------------

function simplifyEdges(
  wg: Working,
  tolMm: number,
  uToMm: number,
  tToMm: number,
  stats: ConditionStats,
): void {
  for (const e of wg.edges) {
    if (!e.alive || e.pts.length <= 2) continue;
    const before = e.pts.length;
    if (e.kind === 'loop') {
      // Simplify the ring with the seam vertices (first & duplicated-last) fixed.
      const ring = e.pts.slice(0, e.pts.length - 1); // drop duplicate closing pt
      if (ring.length > 2) {
        const simp = douglasPeucker(ring, tolMm, uToMm, tToMm);
        simp.push({ u: simp[0].u, t: simp[0].t }); // re-close
        e.pts = simp;
      }
    } else {
      e.pts = douglasPeucker(e.pts, tolMm, uToMm, tToMm);
    }
    stats.simplifiedPoints += before - e.pts.length;
  }
}

/** Recursive Douglas–Peucker; endpoints always preserved. */
function douglasPeucker(pts: Vec2[], tolMm: number, uToMm: number, tToMm: number): Vec2[] {
  if (pts.length <= 2) return pts.map((p) => ({ u: p.u, t: p.t }));
  let maxD = -1;
  let idx = -1;
  const a = pts[0];
  const b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segDistMm(pts[i], a, b, uToMm, tToMm);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > tolMm && idx > 0) {
    const left = douglasPeucker(pts.slice(0, idx + 1), tolMm, uToMm, tToMm);
    const right = douglasPeucker(pts.slice(idx), tolMm, uToMm, tToMm);
    return [...left, ...right.slice(1)];
  }
  return [{ u: a.u, t: a.t }, { u: b.u, t: b.t }];
}

// ---------------------------------------------------------------------------
// Op 3 — merge junction clusters
// ---------------------------------------------------------------------------

function mergeJunctions(
  wg: Working,
  mergeMm: number,
  uToMm: number,
  tToMm: number,
  stats: ConditionStats,
): void {
  const deg = computeDegree(wg);
  const junctions: number[] = [];
  for (let x = 0; x < wg.pos.length; x++) {
    if (wg.alive[x] && deg[x] >= 3) junctions.push(x);
  }
  if (junctions.length < 2) return;

  // Union-find clusters of junctions within mergeMm (min-root for determinism).
  const parent = new Map<number, number>();
  for (const j of junctions) parent.set(j, j);
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as number;
    let cur = x;
    while (parent.get(cur) !== r) {
      const nx = parent.get(cur) as number;
      parent.set(cur, r);
      cur = nx;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb));
  };
  for (let i = 0; i < junctions.length; i++) {
    for (let k = i + 1; k < junctions.length; k++) {
      if (pointDistMm(wg.pos[junctions[i]], wg.pos[junctions[k]], uToMm, tToMm) < mergeMm) {
        union(junctions[i], junctions[k]);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (const j of junctions) {
    const r = find(j);
    const arr = clusters.get(r) ?? [];
    arr.push(j);
    clusters.set(r, arr);
  }

  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    members.sort((a, b) => a - b);
    const centroid = periodicCentroid(members.map((m) => wg.pos[m]));
    const mergedId = wg.pos.length;
    wg.pos.push(centroid);
    wg.alive.push(true);
    const memberSet = new Set(members);
    for (const m of members) wg.alive[m] = false;

    // Rewire every edge touching a member onto the merged node, snapping the
    // incident polyline endpoint to the centroid.
    for (const e of wg.edges) {
      if (!e.alive) continue;
      if (memberSet.has(e.a)) {
        e.a = mergedId;
        e.pts[0] = { u: centroid.u, t: centroid.t };
      }
      if (memberSet.has(e.b)) {
        e.b = mergedId;
        e.pts[e.pts.length - 1] = { u: centroid.u, t: centroid.t };
      }
    }
    // Drop intra-cluster connectors (both ends now the merged node) that were
    // short — those are the spurious inter-detection edges. A long loop through
    // the junction (rare) is kept as a loop.
    for (const e of wg.edges) {
      if (!e.alive || e.a !== mergedId || e.b !== mergedId) continue;
      if (polyLengthMm(e.pts, uToMm, tToMm) < mergeMm) {
        e.alive = false;
        stats.droppedEdges++;
      } else {
        e.kind = 'loop';
      }
    }
    stats.mergedClusters++;
  }

  // A merge can expose a degree-2 merged node (rare) — clean it up.
  dissolveDegree2(wg);
}

/** Periodic-u, anchored average of a set of (u,t) points. */
function periodicCentroid(pts: Vec2[]): Vec2 {
  const anchor = pts[0];
  let su = 0;
  let st = 0;
  for (const p of pts) {
    su += signedGap(anchor.u, p.u);
    st += p.t;
  }
  let u = anchor.u + su / pts.length;
  u = ((u % 1) + 1) % 1;
  return { u, t: st / pts.length };
}

// ---------------------------------------------------------------------------
// Op 4 — node typing
// ---------------------------------------------------------------------------

/** Outgoing (u,t)→mm direction azimuth (rad) of edge `ei` away from node `x`. */
function edgeAzimuth(wg: Working, ei: number, x: number, uToMm: number, tToMm: number): number {
  const e = wg.edges[ei];
  // The polyline vertex adjacent to x.
  const adj = e.a === x ? e.pts[1] : e.pts[e.pts.length - 2];
  const du = signedGap(wg.pos[x].u, adj.u) * uToMm;
  const dt = (adj.t - wg.pos[x].t) * tToMm;
  return Math.atan2(dt, du);
}

function classifyNode(wg: Working, x: number, deg: number, uToMm: number, tToMm: number): NodeType {
  if (deg <= 1) return 'endpoint';
  if (deg === 2) return 'regular';
  if (deg >= 4) return 'highDegree';
  // degree 3: reflex if one sector exceeds 180°.
  const inc = incidentEdges(wg, x);
  if (inc.length !== 3) return 'triple'; // a loop-at-x edge case; treat as triple
  const az = inc.map((ei) => edgeAzimuth(wg, ei, x, uToMm, tToMm)).sort((p, q) => p - q);
  let maxW = 0;
  for (let i = 0; i < 3; i++) {
    let gap = az[(i + 1) % 3] - az[i];
    if (gap <= 0) gap += 2 * Math.PI;
    maxW = Math.max(maxW, (gap * 180) / Math.PI);
  }
  return maxW > 180 ? 'reflex' : 'triple';
}

// ---------------------------------------------------------------------------
// Emit — compact + canonical deterministic ordering
// ---------------------------------------------------------------------------

function emit(wg: Working, uToMm: number, tToMm: number, stats: ConditionStats): ConditionedGraph {
  // 1. Canonically orient each alive edge (direction-invariant sort key).
  const live = wg.edges.filter((e) => e.alive && e.a < wg.pos.length && e.b < wg.pos.length);
  const oriented = live.map((e) => orient(e));

  // 2. Deterministic edge order.
  oriented.sort((a, b) => {
    const c0 = cmpVec(a.pts[0], b.pts[0]);
    if (c0 !== 0) return c0;
    const c1 = cmpVec(a.pts[a.pts.length - 1], b.pts[b.pts.length - 1]);
    if (c1 !== 0) return c1;
    const la = polyLengthMm(a.pts, uToMm, tToMm);
    const lb = polyLengthMm(b.pts, uToMm, tToMm);
    if (la !== lb) return la - lb;
    return a.types.join(',').localeCompare(b.types.join(','));
  });

  // 3. Compact nodes in first-touch order along the sorted edges.
  const remap = new Map<number, number>();
  const nodes: Vec2[] = [];
  const idFor = (oldId: number, p: Vec2): number => {
    let nid = remap.get(oldId);
    if (nid === undefined) {
      nid = nodes.length;
      nodes.push({ u: p.u, t: p.t });
      remap.set(oldId, nid);
    }
    return nid;
  };

  const edges: FeatureEdge[] = [];
  for (const e of oriented) {
    const aId = idFor(e.a, e.pts[0]);
    const bId = idFor(e.b, e.pts[e.pts.length - 1]);
    edges.push({
      polyline: e.pts.map((p) => ({ u: p.u, t: p.t })),
      strength: e.strength,
      types: [...e.types],
      kind: e.kind,
      endpoints: e.kind === 'loop' ? [aId, aId] : [aId, bId],
    });
  }

  // 4. Type the compacted nodes from the final edge topology.
  const out: ConditionedGraph = { nodes, edges, nodeTypes: [], stats };
  const wgFinal: Working = {
    pos: nodes,
    alive: nodes.map(() => true),
    edges: edges.map((e) => ({
      a: e.endpoints[0],
      b: e.endpoints[1],
      pts: e.polyline,
      types: e.types,
      strength: e.strength,
      kind: e.kind,
      alive: true,
    })),
  };
  const deg = computeDegree(wgFinal);
  out.nodeTypes = nodes.map((_, i) => {
    const k = classifyNode(wgFinal, i, deg[i], uToMm, tToMm);
    stats.nodeKindCounts[k]++;
    return k;
  });
  return out;
}

/** Canonically orient an edge so its sort key is direction-invariant. */
function orient(e: WEdge): WEdge {
  if (e.kind === 'loop') return canonicalizeLoop(e);
  const head = e.pts[0];
  const tail = e.pts[e.pts.length - 1];
  if (cmpVec(tail, head) < 0) {
    return { ...e, a: e.b, b: e.a, pts: [...e.pts].reverse() };
  }
  return { ...e, pts: e.pts.map((p) => ({ u: p.u, t: p.t })) };
}

/** Rotate a loop to begin at its lexicographically-smallest vertex. */
function canonicalizeLoop(e: WEdge): WEdge {
  const pts = e.pts.slice(0, e.pts.length - 1); // drop duplicate closing pt
  const m = pts.length;
  if (m <= 1) return { ...e, pts: e.pts.map((p) => ({ u: p.u, t: p.t })) };
  let best = 0;
  for (let i = 1; i < m; i++) if (cmpVec(pts[i], pts[best]) < 0) best = i;
  const fwd: Vec2[] = [];
  const rev: Vec2[] = [];
  for (let k = 0; k < m; k++) {
    fwd.push(pts[(best + k) % m]);
    rev.push(pts[(best - k + m) % m]);
  }
  const useRev = m > 1 && cmpVec(rev[1], fwd[1]) < 0;
  const cyc = useRev ? rev : fwd;
  cyc.push({ u: cyc[0].u, t: cyc[0].t });
  return { ...e, pts: cyc };
}

/** Union of two type lists, sorted, deduplicated. */
function unionTypes(a: FeatureType[], b: FeatureType[]): FeatureType[] {
  const s = new Set<FeatureType>([...a, ...b]);
  return [...s].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}
