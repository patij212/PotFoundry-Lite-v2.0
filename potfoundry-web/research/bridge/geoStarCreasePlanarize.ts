// geoStarCreasePlanarize.ts — turn the GeometricStar chevron feature graph (two dStrap level curves)
// into a PLANAR PSLG suitable as CREASE constraints for the double-valued mesher's constrained-CDT-BY-
// CONSTRUCTION path (doubleValuedMesh.ts). DEV/LAB ONLY (research/); src/ must never import this.
//
// WHY: the double-valued mesher inserts each crease as a cdt2d CONSTRAINT EDGE between consecutive
// `at(s)` samples. cdt2d CRASHES / drops triangles on a NON-planar PSLG (crossing constraints) AND on
// COINCIDENT duplicate points (measured: two coincident points at a shared endpoint drop the incident
// triangles). So the crease set fed to the mesher must be (a) crossing-free and (b) a set of
// vertex-DISJOINT simple polylines — no two creases may share (or self-touch) a vertex.
//
// `planarizeCreaseGraph` is the general guarantee of (a): weld near-duplicate vertices, then iteratively
// split every proper segment crossing at a shared inserted vertex until none remain. (For the DEFAULT
// GeometricStar graph this is a validated NO-OP — the raw graph is already 16 disjoint simple chains with
// 0 crossings / 0 near-dupes; the splitter is exercised non-vacuously by the injected-crossing control in
// the test.) `creasesFromGraph` then decomposes the planar PSLG into maximal simple chains and wraps each
// as an arc-length-parameterized CreaseLike (b).

import type { FeatureGraph } from './geoStarFeatureEdges';
import type { CreaseLike } from '../../src/geometry/doubleValued/types';

export interface PlanarizeStats {
  /** vertices removed by the near-duplicate weld. */ welded: number;
  /** crossing points inserted (each splits two edges). */ crossingsSplit: number;
  /** split iterations performed (0 ⇒ input already planar). */ iterations: number;
}
export interface PlanarGraph extends FeatureGraph {
  stats: PlanarizeStats;
}

/** 2D orientation sign of (a,b,c). */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** PROPER segment crossing: interiors strictly intersect (opposite orientations both ways). Endpoint
 *  touching / collinear overlap is NOT a proper crossing (handled by the disjoint-chain invariant). */
function properCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Intersection point of two properly-crossing segments (parametric on AB). */
function intersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): { u: number; t: number } {
  const r1x = bx - ax, r1y = by - ay, r2x = dx - cx, r2y = dy - cy;
  const den = r1x * r2y - r1y * r2x;
  const s = ((cx - ax) * r2y - (cy - ay) * r2x) / den;
  return { u: ax + s * r1x, t: ay + s * r1y };
}

/** Count PROPER (interior) crossings among all edge pairs (AABB-swept). The planarity witness. */
export function countProperCrossings(pts: number[], edges: number[]): number {
  const nE = edges.length / 2;
  const x0 = new Float64Array(nE), y0 = new Float64Array(nE), x1 = new Float64Array(nE), y1 = new Float64Array(nE);
  const ea = new Int32Array(nE), eb = new Int32Array(nE);
  for (let e = 0; e < nE; e++) {
    const a = edges[2 * e], b = edges[2 * e + 1];
    ea[e] = a; eb[e] = b;
    x0[e] = pts[2 * a]; y0[e] = pts[2 * a + 1]; x1[e] = pts[2 * b]; y1[e] = pts[2 * b + 1];
  }
  const order = Array.from({ length: nE }, (_, i) => i).sort((i, j) => Math.min(x0[i], x1[i]) - Math.min(x0[j], x1[j]));
  let n = 0;
  for (let ii = 0; ii < nE; ii++) {
    const i = order[ii];
    const iMaxU = Math.max(x0[i], x1[i]), iMinT = Math.min(y0[i], y1[i]), iMaxT = Math.max(y0[i], y1[i]);
    for (let jj = ii + 1; jj < nE; jj++) {
      const j = order[jj];
      if (Math.min(x0[j], x1[j]) > iMaxU) break;
      if (Math.max(y0[j], y1[j]) < iMinT || Math.min(y0[j], y1[j]) > iMaxT) continue;
      if (ea[i] === ea[j] || ea[i] === eb[j] || eb[i] === ea[j] || eb[i] === eb[j]) continue;
      if (properCross(x0[i], y0[i], x1[i], y1[i], x0[j], y0[j], x1[j], y1[j])) n++;
    }
  }
  return n;
}

/** Weld vertices within `eps` (grid-hash + 9-neighbor exact check); remaps edges, drops a==b. */
function weldVertices(
  pts: number[], edges: number[], eps: number,
  snap?: (u: number, t: number) => { u: number; t: number },
): { pts: number[]; edges: number[]; welded: number } {
  const n = pts.length / 2;
  const cell = new Map<string, number[]>();
  const outPts: number[] = [];
  const remap = new Int32Array(n);
  const key = (cu: number, ct: number): string => `${cu}_${ct}`;
  let welded = 0;
  for (let i = 0; i < n; i++) {
    let u = pts[2 * i], t = pts[2 * i + 1];
    if (snap) { const s = snap(u, t); u = s.u; t = s.t; }
    const cu = Math.round(u / eps), ct = Math.round(t / eps);
    let found = -1;
    for (let du = -1; du <= 1 && found < 0; du++) for (let dt = -1; dt <= 1 && found < 0; dt++) {
      const bucket = cell.get(key(cu + du, ct + dt));
      if (bucket) for (const q of bucket) { if (Math.hypot(outPts[2 * q] - u, outPts[2 * q + 1] - t) <= eps) { found = q; break; } }
    }
    if (found >= 0) { remap[i] = found; welded++; }
    else {
      const id = outPts.length / 2;
      outPts.push(u, t);
      const k = key(cu, ct); const bk = cell.get(k); if (bk) bk.push(id); else cell.set(k, [id]);
      remap[i] = id;
    }
  }
  const seen = new Set<string>();
  const outEdges: number[] = [];
  for (let e = 0; e < edges.length / 2; e++) {
    const a = remap[edges[2 * e]], b = remap[edges[2 * e + 1]];
    if (a === b) continue;
    const ek = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (seen.has(ek)) continue;
    seen.add(ek);
    outEdges.push(a, b);
  }
  return { pts: outPts, edges: outEdges, welded };
}

/**
 * PLANARIZE a crease FeatureGraph: weld near-duplicate vertices within `mergeEps`, then iteratively split
 * every proper segment crossing at a shared inserted vertex (optionally snapped back onto a level curve)
 * until no interior crossings remain. Returns the planar {pts, edges} PSLG + stats.
 *
 * `mergeEps` (default 1e-7) must be « the ~0.0019 (u,t) spacing of the two dStrap level curves so the two
 * loci are never merged. `snap` (optional) projects an inserted crossing vertex exactly back onto its level
 * curve (a same-level self-crossing then stays on-level); omit for a synthetic graph with no field.
 */
export function planarizeCreaseGraph(
  graph: FeatureGraph,
  opts: { mergeEps?: number; snap?: (u: number, t: number) => { u: number; t: number }; maxIters?: number } = {},
): PlanarGraph {
  const eps = opts.mergeEps ?? 1e-7;
  const maxIters = opts.maxIters ?? 50;
  const w0 = weldVertices(graph.pts.slice(), graph.edges.slice(), eps);
  let pts = w0.pts, edges = w0.edges;
  let crossingsSplit = 0, iterations = 0;
  for (; iterations < maxIters; iterations++) {
    const nE = edges.length / 2;
    // gather one crossing point per crossing edge-pair (batch), then split all affected edges at once.
    const splitsOn = new Map<number, Array<{ u: number; t: number }>>(); // edge index -> insertion points
    let found = 0;
    for (let i = 0; i < nE; i++) {
      const ai = edges[2 * i], bi = edges[2 * i + 1];
      const ax = pts[2 * ai], ay = pts[2 * ai + 1], bx = pts[2 * bi], by = pts[2 * bi + 1];
      for (let j = i + 1; j < nE; j++) {
        const aj = edges[2 * j], bj = edges[2 * j + 1];
        if (ai === aj || ai === bj || bi === aj || bi === bj) continue;
        const cx = pts[2 * aj], cy = pts[2 * aj + 1], dx = pts[2 * bj], dy = pts[2 * bj + 1];
        if (!properCross(ax, ay, bx, by, cx, cy, dx, dy)) continue;
        let p = intersect(ax, ay, bx, by, cx, cy, dx, dy);
        if (opts.snap) p = opts.snap(p.u, p.t);
        if (!splitsOn.has(i)) splitsOn.set(i, []);
        if (!splitsOn.has(j)) splitsOn.set(j, []);
        splitsOn.get(i)!.push(p);
        splitsOn.get(j)!.push(p);
        found++;
      }
    }
    if (found === 0) break;
    // rebuild edge list, splitting each edge through its insertion points (sorted along the edge).
    const outEdges: number[] = [];
    for (let e = 0; e < nE; e++) {
      const a = edges[2 * e], b = edges[2 * e + 1];
      const ins = splitsOn.get(e);
      if (!ins || ins.length === 0) { outEdges.push(a, b); continue; }
      const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
      const dirx = bx - ax, diry = by - ay, len2 = dirx * dirx + diry * diry || 1;
      const nodes = ins
        .map((p) => ({ id: (pts.push(p.u, p.t) / 2) - 1, s: ((p.u - ax) * dirx + (p.t - ay) * diry) / len2 }))
        .sort((x, y) => x.s - y.s);
      let prev = a;
      for (const nd of nodes) { outEdges.push(prev, nd.id); prev = nd.id; }
      outEdges.push(prev, b);
    }
    crossingsSplit += found;
    // re-weld (coincident crossing points from the two split edges collapse to one shared vertex).
    const w = weldVertices(pts, outEdges, eps, opts.snap);
    pts = w.pts; edges = w.edges;
  }
  return { pts, edges, stats: { welded: w0.welded, crossingsSplit, iterations } };
}

/** Decompose a planar PSLG into MAXIMAL simple chains (arrays of vertex indices). Splits at every vertex
 *  of degree ≠ 2 (endpoints/junctions); pure degree-2 cycles are emitted as closed loops. Each edge is
 *  used exactly once. For the DEFAULT GeometricStar graph this yields the 16 native disjoint chains. */
export function decomposeChains(pts: number[], edges: number[]): number[][] {
  const nV = pts.length / 2, nE = edges.length / 2;
  const adj: number[][] = Array.from({ length: nV }, () => []);
  const edgeAt: Array<Map<number, number>> = Array.from({ length: nV }, () => new Map());
  for (let e = 0; e < nE; e++) {
    const a = edges[2 * e], b = edges[2 * e + 1];
    adj[a].push(b); adj[b].push(a);
    edgeAt[a].set(b, e); edgeAt[b].set(a, e);
  }
  const used = new Uint8Array(nE);
  const chains: number[][] = [];
  const walk = (start: number, first: number): void => {
    const chain = [start];
    let prev = start, cur = first;
    for (;;) {
      const e = edgeAt[prev].get(cur)!;
      if (used[e]) break;
      used[e] = 1;
      chain.push(cur);
      if (adj[cur].length !== 2) break;             // hit a junction/endpoint ⇒ chain ends
      const nxt = adj[cur][0] === prev ? adj[cur][1] : adj[cur][0];
      if (nxt === start && used[edgeAt[cur].get(nxt)!]) break;
      prev = cur; cur = nxt;
    }
    if (chain.length >= 2) chains.push(chain);
  };
  // open chains from degree≠2 vertices first
  for (let v = 0; v < nV; v++) if (adj[v].length !== 2) for (const nb of adj[v]) { const e = edgeAt[v].get(nb)!; if (!used[e]) walk(v, nb); }
  // remaining pure cycles (all degree-2)
  for (let v = 0; v < nV; v++) if (adj[v].length === 2) for (const nb of adj[v]) { const e = edgeAt[v].get(nb)!; if (!used[e]) walk(v, nb); }
  return chains;
}

/**
 * Wrap one chain (vertex-index list) as an arc-length-parameterized CreaseLike.
 *
 * `at(s)` is a faithful ARC-LENGTH parameterization of the polyline (so evenly-spaced s samples are evenly
 * spaced along the true chevron curve). `tRange` here ENCODES the chain's ARC LENGTH (capped at 1), NOT its
 * t-extent: the double-valued mesher sizes a crease's base sample count as `ceil(baseGridT·min(1,|ΔtRange|))`
 * (doubleValuedMesh.ts:199) and uses tRange for NOTHING else on a crease (creases carry no lipsAt / wall).
 * A GeometricStar chevron chain winds in u (arc length ≈1.84) inside a thin t-band (t-extent ≈0.097), so
 * sizing by t-extent would emit ~13 samples over arc-length 1.84 and chord straight across the V's; sizing
 * by arc length emits `baseGridT` samples per chain (arcLen≥1 ⇒ min caps at 1) at ≈ native spacing, which
 * refineCreases then densifies. This is a benign use of a crease sizing-hint field, documented for honesty.
 */
function chainToCrease(chain: number[], pts: number[]): CreaseLike | null {
  const uu = chain.map((v) => pts[2 * v]);
  const tt = chain.map((v) => pts[2 * v + 1]);
  const n = uu.length;
  if (n < 2) return null;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(uu[i] - uu[i - 1], tt[i] - tt[i - 1]);
  const total = cum[n - 1];
  const at = (s: number): { u: number; t: number } => {
    if (total < 1e-15) return { u: uu[0], t: tt[0] };
    const target = Math.max(0, Math.min(1, s)) * total;
    let lo = 0, hi = n - 1;
    while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= target) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo];
    const w = seg > 1e-15 ? (target - cum[lo]) / seg : 0;
    return { u: uu[lo] + (uu[hi] - uu[lo]) * w, t: tt[lo] + (tt[hi] - tt[lo]) * w };
  };
  const arcSpan = Math.min(1, total); // ENCODE arc length (capped) so the mesher sizes samples by it
  return { at, tRange: [0, arcSpan] as const };
}

/** Planarize (if needed) + decompose + wrap: FeatureGraph → vertex-disjoint arc-length CreaseLike[]. */
export function creasesFromGraph(
  graph: FeatureGraph,
  opts: { mergeEps?: number; snap?: (u: number, t: number) => { u: number; t: number } } = {},
): { creases: CreaseLike[]; planar: PlanarGraph; chains: number[][] } {
  const planar = planarizeCreaseGraph(graph, opts);
  const chains = decomposeChains(planar.pts, planar.edges);
  const creases = chains.map((c) => chainToCrease(c, planar.pts)).filter((c): c is CreaseLike => c !== null);
  return { creases, planar, chains };
}
