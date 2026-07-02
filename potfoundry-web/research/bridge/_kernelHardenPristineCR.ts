// constraintRecovery.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// Constrained-Delaunay EDGE RECOVERY by locked Lawson flips, over Delaunator's halfedge structure (the same
// connectivity the in-house kernel uses). Stage B of the feature-conforming spike: make each feature locus an
// actual mesh EDGE so the triangulation interpolates ALONG a thin ridge instead of cutting a Delaunay diagonal
// ACROSS it (the residual that vertex-injection alone, Stage A, cannot fix on thin wandering ridges —
// MEASURED: GothicArches true-3D p99 only −44% from injection; density-along-line made it WORSE).
//
// Approach (textbook CROSSING-CHAIN segment-constraint insertion — Sloan 1993 / de Berg ch.9 / Shewchuk):
//   For each constraint (p,q):
//     if the edge p–q already exists → lock it.
//     else (1) WALK the triangle strip from p toward q, collecting the ORDERED list of all triangle edges the
//     segment p–q crosses; (2) resolve the crossings by Lawson flips — repeatedly pick a CROSSING edge whose
//     two adjacent triangles form a strictly convex quad and flip it; the flipped diagonal either no longer
//     crosses p–q (drop it) or still crosses (re-queue it). Edges whose quad is momentarily non-convex are
//     deferred — a convex flip of a neighbour eventually makes them convex (the classic worklist). When the
//     list empties, p–q exists → lock it.
//   This is the upgrade over the prior GREEDY single-direction walk (which only ever flipped edges in p's
//   immediate fan and GAVE UP — recoveryFailed — the moment the next crossing was deep in the strip, not
//   incident to p; MEASURED 83% recovery on GothicArches). The crossing-chain walk reaches the whole chain
//   ⇒ ~100% (E-2026-06-30-FEAT-CONFORM-ALL20). Edges already LOCKED are never flipped (they would un-recover
//   a previously inserted constraint); a crossing chain blocked by a locked edge or a collinear vertex ON the
//   segment is the only remaining give-up (manifold-safe).
//
// Periodic u: the mesh wraps at the u-seam. We operate in a per-segment LOCAL u-frame: both endpoints and any
// candidate vertex are shifted into the segment's [umin-0.5, umin+0.5] band (shortest-image) so the 2D
// orientation predicates are well-defined across the seam. This mirrors the locator's straddle normalization.
//
// HONEST limitation: a crossing chain that is blocked by a LOCKED edge, or by a vertex lying exactly ON the
// segment (collinear), is LEFT un-recovered and counted (recoveryFailed). The kernel proceeds with whatever
// was recovered — a partial constraint set still pins most of the ridge. We report the recovery rate so the
// measurement stays honest. The walk NEVER corrupts the mesh: every flip is convexity-checked and the
// give-up path simply stops.

const TAU = 2 * Math.PI;

/** next/prev halfedge within a triangle (Delaunator winding: 3 halfedges per triangle). */
const nextHE = (e: number): number => (e % 3 === 2 ? e - 2 : e + 1);
const prevHE = (e: number): number => (e % 3 === 0 ? e + 2 : e - 1);

/** Shortest-image u of `u` relative to reference `uRef` (periodic in 1). */
function wrapU(u: number, uRef: number): number {
  let d = u - uRef;
  while (d > 0.5) d -= 1;
  while (d < -0.5) d += 1;
  return uRef + d;
}

/** 2D orientation sign of (a,b,c): >0 ccw, <0 cw, 0 collinear. */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Do segments (p0,p1) and (q0,q1) strictly cross? (proper intersection, endpoints excluded.) */
function segCross(
  p0x: number, p0y: number, p1x: number, p1y: number,
  q0x: number, q0y: number, q1x: number, q1y: number,
): boolean {
  const d1 = orient(p0x, p0y, p1x, p1y, q0x, q0y);
  const d2 = orient(p0x, p0y, p1x, p1y, q1x, q1y);
  const d3 = orient(q0x, q0y, q1x, q1y, p0x, p0y);
  const d4 = orient(q0x, q0y, q1x, q1y, p1x, p1y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const linkHE = (halfedges: Int32Array, a: number, b: number): void => { halfedges[a] = b; if (b !== -1) halfedges[b] = a; };

export interface RecoveryResult {
  /** Locked edges as a Set of canonical keys min*N+max (consumed by the kernel's flip guard). */
  locked: Set<number>;
  /** number of constraints that were already present (no flip needed). */
  alreadyPresent: number;
  /** number of constraints recovered via flips. */
  recovered: number;
  /** number of constraints that could NOT be recovered (left un-locked). */
  recoveryFailed: number;
  /** total flips performed. */
  flips: number;
}

/**
 * Recover + lock each constraint edge in-place on (triangles, halfedges). `constraints` is a flat list of
 * vertex-index pairs [p0,q0, p1,q1, ...]. Returns the locked-edge set + recovery stats.
 *
 * @param maxFlipsPerEdge cap on the flip walk per constraint (guards a pathological non-convex chain).
 */
export function recoverAndLockEdges(
  triangles: Uint32Array, halfedges: Int32Array, uv: number[], constraints: number[],
  maxFlipsPerEdge = 64,
  guardManifold = false,
): RecoveryResult {
  const nVerts = uv.length / 2;
  const N = nVerts + 1;
  const locked = new Set<number>();
  const lockKey = (a: number, b: number): number => (a < b ? a * N + b : b * N + a);
  let alreadyPresent = 0, recovered = 0, recoveryFailed = 0, totalFlips = 0;

  // OPT-IN manifold guard (E-2026-07-01-PUREGREEN): a crossing-edge flip (pr,pl)→(ap0,ap1) creates a
  // NON-MANIFOLD edge if the new diagonal (ap0,ap1) already exists elsewhere. On a dense PLANARIZED graph the
  // T-junction fans make this possible; MEASURED nonMan=2 on GothicArches when planarizing. When on we
  // maintain an undirected-edge multiset and reject any flip that would duplicate an existing edge. STRICT
  // NO-OP when off (the edgeSet is never built → the existing recovery path is byte-identical; the shipped
  // ALL20/SHOWCASE conforming numbers are unchanged). Because a flip removes (pr,pl) and adds (ap0,ap1), the
  // set is maintained exactly across flips.
  const EKm = nVerts + 1;
  const mkey = (a: number, b: number): number => (a < b ? a * EKm + b : b * EKm + a);
  // SHARDED edge multiset (a single JS Map caps at 2^24 entries, which a dense planarized mesh exceeds).
  const MSHARD = 64;
  const mshard = (a: number, b: number): number => ((a < b ? a : b) & (MSHARD - 1));
  let medges: Map<number, number>[] | undefined;
  const mget = (a: number, b: number): number => medges![mshard(a, b)].get(mkey(a, b)) ?? 0;
  const mset = (a: number, b: number, val: number): void => { medges![mshard(a, b)].set(mkey(a, b), val); };
  if (guardManifold) {
    medges = Array.from({ length: MSHARD }, () => new Map<number, number>());
    for (let e = 0; e < triangles.length; e++) { const u = triangles[e], v = triangles[nextHE(e)]; mset(u, v, mget(u, v) + 1); }
  }

  // vhe[v] = ONE halfedge whose ORIGIN is v (i.e. triangles[vhe[v]] === v). Updated incrementally on flips.
  const vhe = new Int32Array(nVerts).fill(-1);
  for (let e = 0; e < triangles.length; e++) { const v = triangles[e]; if (vhe[v] < 0) vhe[v] = e; }
  const setVhe = (e: number): void => { vhe[triangles[e]] = e; };

  // Iterate the halfedges whose origin is v (the outgoing fan). Rotate via twin∘next. Robust to a non-closed
  // fan (boundary): we rotate both directions from the seed until we return or hit a boundary.
  const forEachOutgoing = (v: number, fn: (e: number) => boolean): void => {
    const start = vhe[v]; if (start < 0) return;
    // clockwise: e -> halfedges[prev(e)]
    let e = start;
    for (let guard = 0; guard < 1000; guard++) {
      if (triangles[e] !== v) break;
      if (fn(e)) return;
      const pe = prevHE(e); const tw = halfedges[pe];
      if (tw < 0) break; // boundary — stop this direction
      e = tw; if (e === start) return;
    }
    // counter-clockwise from start (catch the other half if we hit a boundary): e -> next(halfedges[e])
    e = start;
    for (let guard = 0; guard < 1000; guard++) {
      const tw = halfedges[e]; if (tw < 0) break;
      const ne = nextHE(tw);
      if (triangles[ne] !== v) break;
      if (ne === start) return;
      if (fn(ne)) return;
      e = ne;
    }
  };

  /** Does an edge v→w exist? (scan v's outgoing fan.) */
  const edgeExists = (v: number, w: number): boolean => {
    let found = false;
    forEachOutgoing(v, (e) => { if (triangles[nextHE(e)] === w) { found = true; return true; } return false; });
    return found;
  };

  // --- Geometry helpers in a per-segment LOCAL u-frame (anchored at p; shortest-image across the seam). ---
  // Does segment p→q strictly cross the far-edge (b,c) of a triangle? (proper crossing, q-corner excluded.)
  const wx = (v: number, uRef: number): number => wrapU(uv[2 * v], uRef);
  const wy = (v: number): number => uv[2 * v + 1];

  // Flip the shared edge of halfedge `e` iff the quad of its two triangles is strictly CONVEX (the textbook
  // CDT crossing-edge flip — Sloan 1993 / Shewchuk). Flipping the diagonal of a convex crossing quad can
  // never invert a triangle; the new diagonal connects the two apexes. We do NOT require the new diagonal to
  // clear p→q (that over-strict condition stalled on long chains): a convex crossing edge always exists while
  // crossings remain, and the resolution loop's strict crossing-count-decrease guard (below) guarantees
  // termination. Returns true on flip. Maintains halfedges + vhe exactly like the kernel's flipHE.
  const flipConvexCrossing = (e: number, uRef: number): boolean => {
    const tw = halfedges[e];
    if (tw < 0) return false;
    if (locked.has(lockKey(triangles[e], triangles[nextHE(e)]))) return false; // never break a locked constraint
    const eNext = nextHE(e), ePrev = prevHE(e), twPrev = prevHE(tw);
    const pr = triangles[e], pl = triangles[eNext], ap0 = triangles[ePrev], ap1 = triangles[twPrev];
    // convexity: the new diagonal ap0-ap1 must strictly separate pr and pl (and the old diagonal pr-pl must
    // separate ap0 and ap1 — both hold iff the quad (pr,ap0,pl,ap1) is strictly convex).
    const a0x = wx(ap0, uRef), a0y = wy(ap0), a1x = wx(ap1, uRef), a1y = wy(ap1);
    const prx = wx(pr, uRef), pry = wy(pr), plx = wx(pl, uRef), ply = wy(pl);
    const s0 = orient(a0x, a0y, a1x, a1y, prx, pry);
    const s1 = orient(a0x, a0y, a1x, a1y, plx, ply);
    if (s0 * s1 >= 0) return false; // ap0-ap1 does not separate pr,pl → not convex
    const r0 = orient(prx, pry, plx, ply, a0x, a0y);
    const r1 = orient(prx, pry, plx, ply, a1x, a1y);
    if (r0 * r1 >= 0) return false; // pr-pl does not separate ap0,ap1 → not convex (reflex quad)
    // OPT-IN manifold guard: reject the flip if the new diagonal (ap0,ap1) already exists elsewhere in the
    // mesh (a T-junction fan on a planarized graph can make this happen → non-manifold). No-op when off.
    if (medges !== undefined && mget(ap0, ap1) > 0) return false;
    if (medges !== undefined) { mset(pr, pl, Math.max(0, mget(pr, pl) - 1)); mset(ap0, ap1, mget(ap0, ap1) + 1); }
    triangles[e] = ap1; triangles[tw] = ap0;
    const hbl = halfedges[twPrev], har = halfedges[ePrev];
    linkHE(halfedges, e, hbl);
    linkHE(halfedges, tw, har);
    linkHE(halfedges, ePrev, twPrev);
    const t0 = e - (e % 3), t1 = tw - (tw % 3);
    setVhe(t0); setVhe(t0 + 1); setVhe(t0 + 2);
    setVhe(t1); setVhe(t1 + 1); setVhe(t1 + 2);
    return true;
  };

  // Collect the ORDERED chain of halfedges (each the LOWER-id representative of an undirected edge) that the
  // segment p→q crosses, by walking the triangle strip from p toward q. Returns null if the walk is blocked
  // by a vertex lying ON the segment (collinear) or runs off a boundary (manifold-safe give-up).
  const collectCrossings = (p: number, q: number, uRef: number): number[] | null => {
    const px = wx(p, uRef), py = wy(p), qx = wx(q, uRef), qy = wy(q);
    // 1) starting triangle: the one in p's fan whose FAR edge (b,c) the segment p→q crosses.
    let startFar = -1;
    forEachOutgoing(p, (e) => {
      const farE = nextHE(e);
      const b = triangles[farE], c = triangles[nextHE(farE)];
      if (b === q || c === q) return false; // q is an immediate neighbour — edge would already exist
      if (segCross(px, py, qx, qy, wx(b, uRef), wy(b), wx(c, uRef), wy(c))) { startFar = farE; return true; }
      return false;
    });
    if (startFar < 0) return null; // q collinear with a fan edge, or no clean entry → give up
    const chain: number[] = [];
    let cur = startFar;
    for (let guard = 0; guard < maxFlipsPerEdge * 4; guard++) {
      chain.push(cur);
      const tw = halfedges[cur];
      if (tw < 0) return null; // ran off the boundary before reaching q (shouldn't happen for interior q)
      // The triangle across `cur` has apex = the vertex opposite the shared edge.
      const apexE = prevHE(tw); // halfedge whose origin is the apex of the far triangle
      const apex = triangles[apexE];
      if (apex === q) return chain; // reached q — the strip ends at this triangle
      // The far triangle's three edges are: the entry edge (== `tw`, undirected) and the two edges incident to
      // the apex. The exit is whichever apex-incident edge the segment p→q crosses next. apexE's origin is the
      // apex, so apexE (apex→next) and prevHE(apexE) (prev→apex) are the two candidates; the entry edge is the
      // third (nextHE(apexE)) and is never re-crossed.
      const exitA = apexE;             // apex → next
      const va = triangles[exitA], vb = triangles[nextHE(exitA)];
      if (segCross(px, py, qx, qy, wx(va, uRef), wy(va), wx(vb, uRef), wy(vb))) { cur = exitA; continue; }
      const exitC = prevHE(apexE);     // prev → apex
      const vc = triangles[exitC], vd = triangles[nextHE(exitC)];
      if (segCross(px, py, qx, qy, wx(vc, uRef), wy(vc), wx(vd, uRef), wy(vd))) { cur = exitC; continue; }
      return null; // segment passes through the apex vertex (collinear) → give up, manifold-safe
    }
    return null; // guard tripped (degenerate) → give up
  };

  for (let ci = 0; ci + 1 < constraints.length; ci += 2) {
    const p = constraints[ci], q = constraints[ci + 1];
    if (p === q || p < 0 || q < 0 || p >= nVerts || q >= nVerts) continue;
    if (edgeExists(p, q)) { locked.add(lockKey(p, q)); alreadyPresent++; continue; }

    const uRef = uv[2 * p]; // local u-frame anchored at p (shortest-image across the seam)

    // CROSSING-CHAIN recovery (Sloan): re-collect the crossing chain, flip ONE convex crossing edge, repeat.
    // We scan the live chain and flip the first CONVEX crossing edge; flipping any convex crossing edge is
    // always safe (no inversion). To guarantee termination we require the crossing COUNT to make net
    // progress: we allow a flip that does not immediately shrink the chain (a convex flip whose new diagonal
    // still crosses), but if the chain length fails to reach a new minimum within `stallCap` flips we give up
    // (manifold-safe). On a convex crossing region the chain provably drains to 0; the guard only trips on a
    // pathological/degenerate locus (e.g. a vertex ON the segment), which is left un-recovered + counted.
    let ok = edgeExists(p, q);
    let bestLen = Infinity, sinceImprove = 0;
    const stallCap = 4;
    for (let outer = 0; outer < maxFlipsPerEdge * 8 && !ok; outer++) {
      const chain = collectCrossings(p, q, uRef);
      if (chain === null || chain.length === 0) break; // blocked / collinear / done → give up cleanly
      if (chain.length < bestLen) { bestLen = chain.length; sinceImprove = 0; } else if (++sinceImprove > stallCap) break;
      let flippedAny = false;
      for (const e of chain) {
        if (flipConvexCrossing(e, uRef)) { totalFlips++; flippedAny = true; break; } // re-collect on the mutated mesh
      }
      if (edgeExists(p, q)) { ok = true; break; }
      if (!flippedAny) break; // no convex crossing edge anywhere → give up cleanly (degenerate)
    }

    if (ok || edgeExists(p, q)) { locked.add(lockKey(p, q)); recovered++; }
    else recoveryFailed++;
  }

  return { locked, alreadyPresent, recovered, recoveryFailed, flips: totalFlips };
}

/** Helper to convert a locked-edge Set into the isLocked predicate flipHE expects. */
export function lockedPredicate(locked: Set<number>, nVerts: number): (a: number, b: number) => boolean {
  const N = nVerts + 1;
  return (a: number, b: number): boolean => locked.has(a < b ? a * N + b : b * N + a);
}

export { TAU };
