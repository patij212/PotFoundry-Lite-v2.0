/**
 * unify.ts — the ensemble UNIFIER for the style-agnostic feature detector.
 *
 * Merges the three detectors' raw segment soups (curvature-ridge,
 * normal-discontinuity, component-boundary) into ONE topology-rich
 * {@link FeatureGraph}: welded nodes, polyline edges split at junctions and
 * closed into loops, cross-detector duplicates merged, weak edges dropped, and
 * a deterministic stable ordering.
 *
 * ## Why a unifier is non-trivial
 *
 * The three detectors emit `strength` in INCOMPATIBLE units:
 *
 * | detector              | strength unit         | threshold |
 * | --------------------- | --------------------- | --------- |
 * | curvature-ridge       | κ (mm⁻¹)              | minStrength (κ) |
 * | normal-discontinuity  | normal-angle (deg)    | minAngleDeg     |
 * | component-boundary    | constant 1            | 1               |
 *
 * A naïve `max(strength)` across detectors (60° crease ≫ 0.15 mm⁻¹ ridge ≫ 1)
 * is MEANINGLESS — the degree value trivially dominates by unit. The unifier
 * therefore NORMALIZES each detector's raw strength to a dimensionless
 * **saliency** before any cross-detector comparison:
 *
 *     saliency = rawStrength / thatDetector'sThreshold        (≥ 1 for emitted segs)
 *
 * Each {@link RawSegments} carries the `threshold` it used (κ-floor, angle-floor,
 * or 1). After dividing, a saliency of 3 means "3× this detector's threshold"
 * regardless of detector — directly comparable. All merge / drop / sort
 * decisions use saliency, NEVER raw strength, and saliency is what gets stored
 * on {@link FeatureEdge.strength}.
 *
 * ## Pipeline
 *
 * 1. NORMALIZE — divide each raw strength by its detector threshold → saliency.
 * 2. WELD — quantize every endpoint (u,t) into a shared node table. u is
 *    PERIODIC: u and u±1 weld to the same column. A canonical (u,t) is stored
 *    per node.
 * 3. POLYLINES — build a per-edge-typed adjacency over the welded nodes, then
 *    walk it into polylines, splitting at degree≥3 junctions and closing loops
 *    (the {@link segmentsToPolylines} pattern, extended to carry type+saliency).
 * 4. DEDUP — where two polylines from DIFFERENT detectors run within `weldTol`
 *    for most of their length, merge into ONE edge keeping `max(saliency)` and
 *    the UNION of `types`.
 * 5. DROP — discard edges whose saliency < `minStrength` (a MIN-SALIENCY, i.e.
 *    a multiple-of-threshold, NOT a raw strength).
 * 6. STABLE SORT — order nodes and edges deterministically so the same input
 *    yields byte-identical output (the downstream mesher shares vertices by
 *    node identity and must not see a reordering across runs).
 *
 * @module conforming/featureGraph/unify
 */

import type {
  Vec2,
  FeatureType,
  FeatureGraph,
  FeatureEdge,
  RawSegments,
} from './types';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for {@link unifyToGraph}. */
export interface UnifyOptions {
  /**
   * Endpoints (and parallel polylines) within this (u,t) distance are treated
   * as the same locus. Drives both endpoint welding and cross-detector dedup.
   * Distances are measured in (u,t) parameter space scaled to mm via
   * {@link UnifyOptions.uToMm} / {@link UnifyOptions.tToMm} so a single
   * physical tolerance behaves consistently across the anisotropic u/t axes.
   */
  weldTol: number;
  /**
   * Minimum normalized SALIENCY (multiple-of-detector-threshold) for an edge to
   * survive. Edges whose merged saliency is below this are dropped. NOTE: this
   * is a saliency floor, not a raw strength — raw strengths are never compared
   * here (see the module header on unit heterogeneity).
   */
  minStrength: number;
  /** Scale factor: 1 unit of u ≈ uToMm millimetres (for distance metric). */
  uToMm: number;
  /** Scale factor: 1 unit of t ≈ tToMm millimetres (for distance metric). */
  tToMm: number;
}

// ---------------------------------------------------------------------------
// Internal structures
// ---------------------------------------------------------------------------

/** A normalized segment: endpoints + dimensionless saliency + originating type. */
interface NormSegment {
  a: Vec2;
  b: Vec2;
  saliency: number;
  type: FeatureType;
}

/** A typed adjacency entry: the neighbour node + the edge's type & saliency. */
interface AdjEntry {
  to: number;
  type: FeatureType;
  saliency: number;
}

/** An intermediate polyline before cross-detector dedup. */
interface Polyline {
  /** Welded node ids in order. */
  nodeIds: number[];
  /** (u,t) positions in order (canonical, from the node table). */
  pts: Vec2[];
  type: FeatureType;
  saliency: number;
  kind: 'open' | 'loop';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge the three detectors' raw segments into one topology-rich feature graph.
 *
 * @param raw   The detectors' outputs. Order is irrelevant — the result is
 *              deterministic regardless of detector order or segment order.
 * @param opts  Weld tolerance, min saliency, and u/t→mm scale factors.
 * @returns     A {@link FeatureGraph} with welded nodes and merged, sorted edges.
 */
export function unifyToGraph(raw: RawSegments[], opts: UnifyOptions): FeatureGraph {
  const { weldTol, minStrength, uToMm, tToMm } = opts;

  // -------------------------------------------------------------------------
  // Step 1 — NORMALIZE raw strength → dimensionless saliency.
  // -------------------------------------------------------------------------
  const norm: NormSegment[] = [];
  for (const det of raw) {
    // threshold defaults to 1 (→ saliency = raw strength) for back-compat.
    const thr = det.threshold !== undefined && det.threshold > 0 ? det.threshold : 1;
    for (const s of det.segs) {
      norm.push({ a: s.a, b: s.b, saliency: s.strength / thr, type: det.type });
    }
  }
  if (norm.length === 0) return { nodes: [], edges: [] };

  // -------------------------------------------------------------------------
  // Step 2 — WELD endpoints into a shared node table (periodic u).
  // -------------------------------------------------------------------------
  const weld = new NodeWelder(weldTol);
  // Pre-register all endpoints so the canonical node positions are stable
  // regardless of which segment is visited first.
  const nodeOf: Array<[number, number]> = []; // [a-id, b-id] per norm segment
  for (const s of norm) {
    const ai = weld.idOf(s.a);
    const bi = weld.idOf(s.b);
    nodeOf.push([ai, bi]);
  }

  // -------------------------------------------------------------------------
  // Step 3 — Build typed adjacency, then walk into polylines.
  // -------------------------------------------------------------------------
  const adj = new Map<number, AdjEntry[]>();
  const addAdj = (from: number, e: AdjEntry): void => {
    let arr = adj.get(from);
    if (!arr) {
      arr = [];
      adj.set(from, arr);
    }
    arr.push(e);
  };
  // Per-edge identity is keyed by (nodePair, type): two detectors firing on the
  // SAME welded node pair are kept as SEPARATE typed edges here so the dedup
  // step (4) sees them as parallel polylines and merges their type sets. Self
  // loops (a-id === b-id, a sub-weldTol segment) are dropped.
  const edgeSeen = new Set<string>();
  for (let k = 0; k < norm.length; k++) {
    const [ai, bi] = nodeOf[k];
    if (ai === bi) continue;
    const s = norm[k];
    const ekey = edgeKey(ai, bi, s.type);
    if (edgeSeen.has(ekey)) continue; // collapse exact duplicates within a detector
    edgeSeen.add(ekey);
    addAdj(ai, { to: bi, type: s.type, saliency: s.saliency });
    addAdj(bi, { to: ai, type: s.type, saliency: s.saliency });
  }

  const polylines = walkPolylines(adj, weld);

  // -------------------------------------------------------------------------
  // Step 4 — Cross-detector spatial DEDUP / merge.
  // -------------------------------------------------------------------------
  const merged = dedupPolylines(polylines, weldTol, uToMm, tToMm);

  // -------------------------------------------------------------------------
  // Step 5 — DROP weak edges (saliency below the min-saliency floor).
  // -------------------------------------------------------------------------
  const kept = merged.filter((m) => m.saliency >= minStrength);

  // -------------------------------------------------------------------------
  // Step 6 — Assemble + STABLE deterministic ordering.
  // -------------------------------------------------------------------------
  return assembleGraph(kept);
}

// ---------------------------------------------------------------------------
// Node welding (periodic u)
// ---------------------------------------------------------------------------

/**
 * Welds (u,t) points into integer node ids by quantizing to a `weldTol` lattice.
 *
 * u is PERIODIC: u is reduced mod 1 before quantizing, and the quantized u
 * column wraps so the bucket at u≈1 equals the bucket at u≈0 (a feature
 * crossing the seam welds correctly). The canonical position kept for a node is
 * the FIRST point welded into it, so the table is deterministic given a fixed
 * insertion order (which the caller controls by visiting `norm` in array order).
 */
class NodeWelder {
  private readonly tol: number;
  private readonly nCols: number;
  private readonly map = new Map<string, number>();
  readonly pos: Vec2[] = [];

  constructor(weldTol: number) {
    this.tol = weldTol;
    // Number of u buckets around the periodic circle. Quantizing u·nCols and
    // taking mod nCols makes the seam (u≈1 ≡ u≈0) share a bucket.
    this.nCols = Math.max(1, Math.round(1 / weldTol));
  }

  /** Map a (u,t) point to its welded node id, registering it on first sight. */
  idOf(p: Vec2): number {
    const uMod = ((p.u % 1) + 1) % 1; // reduce to [0,1)
    let ci = Math.round(uMod * this.nCols) % this.nCols;
    if (ci < 0) ci += this.nCols;
    const tj = Math.round(p.t / this.tol);
    const key = `${ci}:${tj}`;
    let id = this.map.get(key);
    if (id === undefined) {
      id = this.pos.length;
      // Canonical position: keep u in [0,1) (the periodic representative).
      this.pos.push({ u: uMod, t: p.t });
      this.map.set(key, id);
    } else {
      // ORDER-INDEPENDENT canonical position: keep the lexicographically
      // SMALLEST (u,t) ever welded into this bucket. "First point wins" would
      // leak the insertion order (e.g. an un-jittered ridge vs a jittered
      // crease landing in the same bucket) into the node coordinates, breaking
      // determinism under detector reordering. The min is a pure function of
      // the point SET, so reordering the inputs cannot change it.
      const cur = this.pos[id];
      const cand: Vec2 = { u: uMod, t: p.t };
      if (cmpVec(cand, cur) < 0) this.pos[id] = cand;
    }
    return id;
  }
}

// ---------------------------------------------------------------------------
// Polyline walking (split at degree≥3 junctions, close loops)
// ---------------------------------------------------------------------------

/** Stable edge key (unordered node pair + type). */
function edgeKey(a: number, b: number, type: FeatureType): string {
  return a < b ? `${a}:${b}:${type}` : `${b}:${a}:${type}`;
}

/** Stable undirected key for a (node pair, type) edge during the walk. */
function walkKey(a: number, b: number, type: FeatureType): string {
  return edgeKey(a, b, type);
}

/**
 * Walk the typed adjacency into polylines. A walk stops at any node whose
 * degree-within-its-own-type ≠ 2 (i.e. an endpoint or a degree≥3 junction),
 * which splits chains at junctions. Closed cycles come back as `kind:'loop'`.
 *
 * The walk is TYPE-SCOPED: only same-type adjacency entries continue a polyline,
 * so a curvature-ridge chain and a coincident normal-discontinuity chain on the
 * same welded nodes produce two separate polylines (merged later by dedup). This
 * keeps each polyline single-typed with a single detector's saliency.
 *
 * Determinism: neighbours are sorted by (node id, type) before walking, and the
 * walk visits start nodes in ascending id order, so the output order is a pure
 * function of the welded node ids.
 */
function walkPolylines(adj: Map<number, AdjEntry[]>, weld: NodeWelder): Polyline[] {
  // Sort each adjacency list deterministically.
  for (const arr of adj.values()) {
    arr.sort((x, y) => (x.to - y.to) || cmpType(x.type, y.type));
  }

  // Per-type degree of a node (how many same-type edges touch it).
  const typeDegree = (node: number, type: FeatureType): number => {
    const arr = adj.get(node);
    if (!arr) return 0;
    let d = 0;
    for (const e of arr) if (e.type === type) d++;
    return d;
  };

  const used = new Set<string>();
  const out: Polyline[] = [];
  const nodeIds = [...adj.keys()].sort((a, b) => a - b);

  // Walk a single chain starting at (node → first.to) of `type`, extending
  // through degree-2 same-type nodes until a junction/endpoint or loop close.
  const walkFrom = (start: number, type: FeatureType): void => {
    const neigh = adj.get(start) ?? [];
    for (const first of neigh) {
      if (first.type !== type) continue;
      if (used.has(walkKey(start, first.to, type))) continue;

      const path: number[] = [start];
      let prev = start;
      let curr = first.to;
      let sal = first.saliency;
      used.add(walkKey(prev, curr, type));
      path.push(curr);

      for (;;) {
        // Stop extending once we re-enter a junction/endpoint, OR once the
        // current node is a junction (degree≥3) — junctions terminate a chain.
        if (curr === start) break; // closed the loop back to the start
        if (typeDegree(curr, type) !== 2) break; // endpoint or junction

        const ns = adj.get(curr) ?? [];
        let next = -1;
        let nextSal = 0;
        for (const cand of ns) {
          if (cand.type !== type) continue;
          if (cand.to === prev) continue;
          if (used.has(walkKey(curr, cand.to, type))) continue;
          next = cand.to;
          nextSal = cand.saliency;
          break;
        }
        if (next < 0) break;
        used.add(walkKey(curr, next, type));
        path.push(next);
        if (nextSal > sal) sal = nextSal;
        prev = curr;
        curr = next;
      }

      const closed = path.length > 2 && path[0] === path[path.length - 1];
      out.push(makePolyline(path, type, sal, closed, weld));
    }
  };

  // Pass 1: start at junctions/endpoints (degree ≠ 2) so open chains split at
  // junctions. Pass 2: sweep any remaining edges (pure closed loops with all
  // degree-2 nodes have no natural start, so we pick the lowest id).
  for (const node of nodeIds) {
    const arr = adj.get(node) ?? [];
    const types = new Set(arr.map((e) => e.type));
    for (const type of [...types].sort(cmpType)) {
      if (typeDegree(node, type) !== 2) walkFrom(node, type);
    }
  }
  for (const node of nodeIds) {
    const arr = adj.get(node) ?? [];
    const types = new Set(arr.map((e) => e.type));
    for (const type of [...types].sort(cmpType)) {
      walkFrom(node, type);
    }
  }

  return out;
}

/** Build a {@link Polyline} from a welded node-id path. */
function makePolyline(
  path: number[],
  type: FeatureType,
  saliency: number,
  closed: boolean,
  weld: NodeWelder,
): Polyline {
  const pts = path.map((id) => weld.pos[id]);
  return {
    nodeIds: path,
    pts,
    type,
    saliency,
    kind: closed ? 'loop' : 'open',
  };
}

// ---------------------------------------------------------------------------
// Cross-detector dedup / merge
// ---------------------------------------------------------------------------

/**
 * Merge polylines from DIFFERENT detectors that run within `weldTol` for most
 * of their length into one polyline carrying the union of types and the max
 * saliency.
 *
 * Two polylines are "coincident" when ≥ {@link COVERAGE_FRACTION} of one's
 * sample points lie within `weldTol` (in mm) of the other's nearest segment,
 * AND vice-versa for the shorter one (mutual coverage — guards against a short
 * spur lying along a long edge being absorbed). Coincidence is transitive
 * (union-find): the all-three-fire locus folds three polylines into one group.
 *
 * The merged polyline KEEPS the geometry of the highest-saliency member (so the
 * sharpest detector's trace wins the vertex positions) but carries every
 * member's type.
 */
function dedupPolylines(
  polys: Polyline[],
  weldTol: number,
  uToMm: number,
  tToMm: number,
): MergedEdge[] {
  const n = polys.length;
  const parent = new Array<number>(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (parent[r] !== r) r = parent[r];
    while (parent[x] !== r) {
      const nx = parent[x];
      parent[x] = r;
      x = nx;
    }
    return r;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  // O(n²) coincidence test — n is the polyline count (a handful per surface),
  // not the sample count, so this is cheap.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (polys[i].type === polys[j].type) continue; // dedup is CROSS-detector
      if (
        coincident(polys[i], polys[j], weldTol, uToMm, tToMm) &&
        coincident(polys[j], polys[i], weldTol, uToMm, tToMm)
      ) {
        union(i, j);
      }
    }
  }

  // Group by representative; choose the highest-saliency member as the keeper.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) {
      g = [];
      groups.set(r, g);
    }
    g.push(i);
  }

  const out: MergedEdge[] = [];
  for (const members of groups.values()) {
    // Keeper = max saliency, tie-broken by CANONICAL GEOMETRY (not array index).
    // Index-based tiebreaks leak the input/detector order into the kept vertex
    // positions (the all-three-fire case has equal saliency on all members, so
    // the keeper — and its jittered geometry — would flip when detectors are
    // reordered). Comparing geometry instead makes the result order-invariant.
    let keeper = members[0];
    for (const m of members) {
      if (
        polys[m].saliency > polys[keeper].saliency ||
        (polys[m].saliency === polys[keeper].saliency &&
          comparePolyGeom(polys[m], polys[keeper]) < 0)
      ) {
        keeper = m;
      }
    }
    const types = new Set<FeatureType>();
    let maxSal = -Infinity;
    for (const m of members) {
      types.add(polys[m].type);
      if (polys[m].saliency > maxSal) maxSal = polys[m].saliency;
    }
    out.push({
      pts: polys[keeper].pts,
      nodeIds: polys[keeper].nodeIds,
      kind: polys[keeper].kind,
      types: [...types].sort(cmpType),
      saliency: maxSal,
    });
  }
  return out;
}

/** A polyline after cross-detector merge — ready for graph assembly. */
interface MergedEdge {
  pts: Vec2[];
  nodeIds: number[];
  kind: 'open' | 'loop';
  types: FeatureType[];
  saliency: number;
}

const COVERAGE_FRACTION = 0.7;

/**
 * Direction-invariant geometric comparison of two polylines, used to pick the
 * dedup keeper deterministically when saliencies tie. Compares the
 * lexicographically-ordered endpoint pair, then length, then point count, then
 * the full vertex list — so two coincident-but-jittered traces resolve to a
 * single, input-order-independent winner.
 */
function comparePolyGeom(a: Polyline, b: Polyline): number {
  const ea = canonEnds(a.pts);
  const eb = canonEnds(b.pts);
  let c = cmpVec(ea[0], eb[0]);
  if (c !== 0) return c;
  c = cmpVec(ea[1], eb[1]);
  if (c !== 0) return c;
  const la = polyLength(a.pts);
  const lb = polyLength(b.pts);
  if (la !== lb) return la - lb;
  if (a.pts.length !== b.pts.length) return a.pts.length - b.pts.length;
  // Full vertex tiebreak in canonical direction.
  const pa = canonDir(a.pts);
  const pb = canonDir(b.pts);
  for (let i = 0; i < pa.length; i++) {
    const cv = cmpVec(pa[i], pb[i]);
    if (cv !== 0) return cv;
  }
  return 0;
}

/** The two endpoints of a polyline, lexicographically ordered. */
function canonEnds(pts: Vec2[]): [Vec2, Vec2] {
  const h = pts[0];
  const tl = pts[pts.length - 1];
  return cmpVec(h, tl) <= 0 ? [h, tl] : [tl, h];
}

/** Polyline vertices in canonical direction (reversed if tail < head). */
function canonDir(pts: Vec2[]): Vec2[] {
  return cmpVec(pts[pts.length - 1], pts[0]) < 0 ? [...pts].reverse() : pts;
}

/**
 * True when ≥ {@link COVERAGE_FRACTION} of `a`'s sample points lie within
 * `weldTol` (in mm) of polyline `b`. Distance is measured in mm by scaling the
 * (u,t) gap with uToMm/tToMm, and u uses the PERIODIC gap (so a seam-straddling
 * feature is not spuriously far from its wrapped twin).
 */
function coincident(
  a: Polyline,
  b: Polyline,
  weldTol: number,
  uToMm: number,
  tToMm: number,
): boolean {
  const tolMm = weldTol * Math.max(uToMm, tToMm);
  let near = 0;
  for (const p of a.pts) {
    if (pointNearPolyline(p, b.pts, tolMm, uToMm, tToMm)) near++;
  }
  return near / a.pts.length >= COVERAGE_FRACTION;
}

/** Min mm-distance from point `p` to any segment of polyline `pts` ≤ tolMm? */
function pointNearPolyline(
  p: Vec2,
  pts: Vec2[],
  tolMm: number,
  uToMm: number,
  tToMm: number,
): boolean {
  if (pts.length === 1) return pointDistMm(p, pts[0], uToMm, tToMm) <= tolMm;
  for (let i = 0; i + 1 < pts.length; i++) {
    if (segDistMm(p, pts[i], pts[i + 1], uToMm, tToMm) <= tolMm) return true;
  }
  return false;
}

/** Periodic-u (u,t)→mm gap between two points. */
function pointDistMm(p: Vec2, q: Vec2, uToMm: number, tToMm: number): number {
  const du = periodicGap(p.u, q.u) * uToMm;
  const dt = (p.t - q.t) * tToMm;
  return Math.hypot(du, dt);
}

/** mm-distance from point p to segment ab (periodic in u). */
function segDistMm(
  p: Vec2,
  a: Vec2,
  b: Vec2,
  uToMm: number,
  tToMm: number,
): number {
  // Work in a local mm frame anchored at `a`, with u un-wrapped relative to a.
  const ax = 0;
  const ay = 0;
  const bx = signedGap(a.u, b.u) * uToMm;
  const by = (b.t - a.t) * tToMm;
  const px = signedGap(a.u, p.u) * uToMm;
  const py = (p.t - a.t) * tToMm;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-300) return Math.hypot(px - ax, py - ay);
  let s = ((px - ax) * dx + (py - ay) * dy) / len2;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const cx = ax + s * dx;
  const cy = ay + s * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Shortest periodic gap |u1−u2| on the unit circle, in [0, 0.5]. */
function periodicGap(u1: number, u2: number): number {
  let d = Math.abs(u1 - u2) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/** Signed periodic gap (u2 − u1) wrapped to [−0.5, 0.5]. */
function signedGap(u1: number, u2: number): number {
  let d = (u2 - u1) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

// ---------------------------------------------------------------------------
// Graph assembly + deterministic ordering
// ---------------------------------------------------------------------------

/**
 * Assemble the kept merged edges into a {@link FeatureGraph} with a fresh,
 * compact node table and a STABLE deterministic ordering:
 *
 * - Edges are oriented canonically (so a forward and reversed walk of the same
 *   chain compare equal) then sorted by (start u, start t, end u, end t,
 *   length, types).
 * - Nodes are emitted in first-touch order along the sorted edges, then the
 *   edge endpoints reference the compacted node ids.
 *
 * Result: identical input → byte-identical nodes + edges, independent of
 * detector order or internal walk order.
 */
function assembleGraph(edges: MergedEdge[]): FeatureGraph {
  // 1. Canonical orientation per edge: pick the lexicographically smaller end
  //    as the head so direction does not affect the sort key (loops keep their
  //    cyclic order but start at the lexicographically smallest vertex).
  const oriented = edges.map((e) => orientEdge(e));

  // 2. Sort edges by a fully-specified deterministic key.
  oriented.sort(compareEdges);

  // 3. Compact nodes in first-touch order along the sorted, oriented edges.
  const nodeRemap = new Map<number, number>(); // old welded id → new compact id
  const nodes: Vec2[] = [];
  const idFor = (oldId: number, pos: Vec2): number => {
    let nid = nodeRemap.get(oldId);
    if (nid === undefined) {
      nid = nodes.length;
      nodes.push({ u: pos.u, t: pos.t });
      nodeRemap.set(oldId, nid);
    }
    return nid;
  };

  const outEdges: FeatureEdge[] = [];
  for (const e of oriented) {
    const startOld = e.nodeIds[0];
    const endOld = e.nodeIds[e.nodeIds.length - 1];
    const startId = idFor(startOld, e.pts[0]);
    const endId = idFor(endOld, e.pts[e.pts.length - 1]);
    outEdges.push({
      polyline: e.pts.map((p) => ({ u: p.u, t: p.t })),
      strength: e.saliency,
      types: [...e.types],
      kind: e.kind,
      endpoints: e.kind === 'loop' ? [startId, startId] : [startId, endId],
    });
  }

  return { nodes, edges: outEdges };
}

/**
 * Canonically orient a merged edge so its sort key is direction-invariant.
 * Open chains: reverse if the tail vertex is lexicographically smaller than the
 * head. Loops: rotate so the cyclic walk begins at the lexicographically
 * smallest vertex (and pick the rotation direction with the smaller second
 * vertex), so the same ring traced either way compares equal.
 */
function orientEdge(e: MergedEdge): MergedEdge {
  if (e.kind === 'loop') return canonicalizeLoop(e);
  const head = e.pts[0];
  const tail = e.pts[e.pts.length - 1];
  if (cmpVec(tail, head) < 0) {
    return { ...e, pts: [...e.pts].reverse(), nodeIds: [...e.nodeIds].reverse() };
  }
  return e;
}

/** Rotate a loop to start at its lexicographically smallest vertex. */
function canonicalizeLoop(e: MergedEdge): MergedEdge {
  // The walk closed with path[0] === path[last]; drop the duplicate tail, find
  // the smallest vertex, rotate, then re-append the closing vertex.
  const ids = e.nodeIds.slice(0, e.nodeIds.length - 1);
  const pts = e.pts.slice(0, e.pts.length - 1);
  const m = ids.length;
  if (m === 0) return e;
  // Find rotation start = index of lexicographically-smallest position.
  let best = 0;
  for (let i = 1; i < m; i++) if (cmpVec(pts[i], pts[best]) < 0) best = i;

  // Two candidate rotations: forward and reversed; pick the smaller by 2nd vtx.
  const fwdPts: Vec2[] = [];
  const fwdIds: number[] = [];
  for (let k = 0; k < m; k++) {
    const idx = (best + k) % m;
    fwdPts.push(pts[idx]);
    fwdIds.push(ids[idx]);
  }
  const revPts: Vec2[] = [];
  const revIds: number[] = [];
  for (let k = 0; k < m; k++) {
    const idx = (best - k + m) % m;
    revPts.push(pts[idx]);
    revIds.push(ids[idx]);
  }
  const useRev =
    m > 1 && cmpVec(revPts[1], fwdPts[1]) < 0;
  const cPts = useRev ? revPts : fwdPts;
  const cIds = useRev ? revIds : fwdIds;
  // Re-close.
  cPts.push({ u: cPts[0].u, t: cPts[0].t });
  cIds.push(cIds[0]);
  return { ...e, pts: cPts, nodeIds: cIds };
}

/** Polyline length in (u,t) space (periodic u), for the sort tiebreak. */
function polyLength(pts: Vec2[]): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    len += Math.hypot(periodicGap(pts[i].u, pts[i + 1].u), pts[i].t - pts[i + 1].t);
  }
  return len;
}

/** Deterministic total order over oriented edges. */
function compareEdges(a: MergedEdge, b: MergedEdge): number {
  // Sort by (u,t) of first vertex, then last vertex, then length, then types.
  const c0 = cmpVec(a.pts[0], b.pts[0]);
  if (c0 !== 0) return c0;
  const c1 = cmpVec(a.pts[a.pts.length - 1], b.pts[b.pts.length - 1]);
  if (c1 !== 0) return c1;
  const la = polyLength(a.pts);
  const lb = polyLength(b.pts);
  if (la !== lb) return la - lb;
  return a.types.join(',').localeCompare(b.types.join(','));
}

/** Lexicographic (u,t) comparison with a small tolerance fold for stability. */
function cmpVec(a: Vec2, b: Vec2): number {
  if (a.u !== b.u) return a.u - b.u;
  if (a.t !== b.t) return a.t - b.t;
  return 0;
}

/** Stable {@link FeatureType} ordering for deterministic type-set output. */
function cmpType(a: FeatureType, b: FeatureType): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
