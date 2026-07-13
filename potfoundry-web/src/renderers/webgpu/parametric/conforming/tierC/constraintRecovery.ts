// constraintRecovery.ts — SRC region-layer kernel dep (ported verbatim from research/bridge/constraintRecovery.ts
// for the PROD-TIERC region kernel; zero imports, so this is a byte-faithful copy). Reachable only via the
// region kernel's OPT-IN constraintEdges path (unused by the default buildMetricOuterWall dispatch).
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
  /** ROBUST-only diagnostics (0 when robust is off): flips rejected by the sliver guard / drift-free manifold guard. */
  robustSliverRejects?: number;
  robustManifoldRejects?: number;
  /** SUBDIVIDE-COLLINEAR-only diagnostics (0 when subdivideCollinear is off): number of constraints that were
   *  split at an on-segment vertex, and total sub-segments emitted by those splits. subdivFailNonCollinear =
   *  sub-segments that failed for a NON-collinear reason (a genuine crossing-chain give-up, not an on-segment
   *  block); subdivFailBudget = blocked sub-segments abandoned because the per-constraint split budget ran out. */
  subdivSplits?: number;
  subdivSubSegments?: number;
  subdivFailNonCollinear?: number;
  subdivFailBudget?: number;
}

/** OPT-IN robustness for DENSE near-collinear pickets (E-2026-07-02-KERNEL-HARDEN). See recoverAndLockEdges. */
export interface RecoveryRobustOpts {
  /** Master switch. When absent/false the recovery path is BYTE-IDENTICAL to the pre-hardening behavior. */
  robust?: boolean;
  /** |signed area| threshold (local u-frame units) below which a resulting triangle is a SLIVER and the flip is
   *  rejected. Default 0 (OFF): MEASURED (E-2026-07-02-KERNEL-HARDEN SFB A/B) that sliver-rejection STARVES
   *  recovery (a crossing chain legitimately drains through near-collinear quads) and REGRESSES the chord, and
   *  the mesh is already index-manifold, so slivers are NOT the fold source. Set >0 only to probe a specific
   *  sliver-attributed fold. Only used when robust is true. */
  sliverEps?: number;
  /**
   * OPT-IN SUBDIVIDE-COLLINEAR recovery (E-2026-07-04-COL-SUBDIV). The DOMINANT Gothic recovery failure
   * (E-2026-07-04-CU-GOTHICSEG: 90.1%@3M → 65.7%@5.87M, true-3D floored 0.058) is NOT a crossing-chain block —
   * it is a kernel interior/Steiner vertex `v` lying (near-)collinear ON a constraint segment a→b, strictly
   * between a and b. The crossing-chain walk `collectCrossings` hits `v` as the apex it "passes through" and
   * returns null (manifold-safe give-up) → the whole a→b is counted failed. That is the TEXTBOOK constrained-
   * Delaunay case: `v` is a legitimate point ON the constraint, so the constraint must be SUBDIVIDED at `v` into
   * a→v and v→b (recursively — several collinear vertices may lie on a→b), each of which recovers as an ordinary
   * segment (the edges a–v and v–b are what the CDT actually wants). This lifts recovery toward ~100% regardless
   * of density (finer sizing inserts MORE on-segment vertices, which used to make recovery WORSE — this turns each
   * into a legitimate shared endpoint instead of a block). STRICT NO-OP when absent/false: `collectCrossings`
   * never reports its blocker, the subdivide branch never runs, and the recovery path is byte-identical (verified
   * by the no-op fingerprint). Independent of `robust` — may be combined with it. */
  subdivideCollinear?: boolean;
  /** |perp distance| in local u-frame units under which a vertex counts as ON the constraint segment (collinear).
   *  Only used when subdivideCollinear is true. Default 1e-9 (tight — the kernel's Steiner/interior vertices that
   *  BLOCK the walk are EXACTLY collinear by construction of the give-up test, so a tight eps is correct and avoids
   *  false-splitting a merely-nearby vertex). */
  collinearEps?: number;
  /** cap on subdivision recursion depth per original constraint (guards a pathological pile-up of on-segment
   *  vertices). Default 64. Only used when subdivideCollinear is true. */
  maxSubdiv?: number;
}

/**
 * Recover + lock each constraint edge in-place on (triangles, halfedges). `constraints` is a flat list of
 * vertex-index pairs [p0,q0, p1,q1, ...]. Returns the locked-edge set + recovery stats.
 *
 * @param maxFlipsPerEdge cap on the flip walk per constraint (guards a pathological non-convex chain).
 * @param guardManifold LEGACY incremental-multiset guard (rejects a flip whose new diagonal appears present in
 *   the multiset). MEASURED to DRIFT on dense pickets (the initial multiset counts each interior undirected edge
 *   TWICE — both halfedges, line ~115 — but each flip only ±1, so removed edges leave a STALE POSITIVE and new
 *   interior diagonals are UNDERSTATED 1-vs-2; E-2026-07-02-KERNEL-HARDEN PROOF 1). Kept for the shipped
 *   ALL20/SHOWCASE/green-push numbers which were tuned against it.
 * @param robustOpts OPT-IN hardening for DENSE near-collinear constraint pickets (SFB@1 petal-tip ladders at
 *   step ≤0.03; Crystalline-class). When `robust` is true, each convex crossing flip is additionally rejected if
 *   (a) either resulting triangle is a SLIVER (|signed area| < sliverEps in the local u-frame — the near-collinear
 *   picket produces these, the tolerance-free convex predicate misses them) OR (b) the new diagonal (ap0,ap1)
 *   ALREADY EXISTS as a LIVE mesh edge (a DRIFT-FREE non-manifold test that reads the halfedge structure directly,
 *   replacing the drifting multiset for the robust path). Both are pure rejections — the flip never mutates on
 *   failure — so the mesh stays MANIFOLD-SAFE BY CONSTRUCTION. STRICT NO-OP when robust is absent/false: the extra
 *   checks never run and the recovery path is byte-identical (verified by the no-op fingerprint).
 */
export function recoverAndLockEdges(
  triangles: Uint32Array, halfedges: Int32Array, uv: number[], constraints: number[],
  maxFlipsPerEdge = 64,
  guardManifold = false,
  robustOpts?: RecoveryRobustOpts,
): RecoveryResult {
  const robust = robustOpts?.robust === true;
  const sliverEps = robustOpts?.sliverEps ?? 0; // default OFF (sliver-rejection starves recovery — see A/B)
  const subdivideCollinear = robustOpts?.subdivideCollinear === true; // default OFF → byte-identical recovery
  const collinearEps = robustOpts?.collinearEps ?? 1e-9; // local u-frame perp distance for on-segment test
  const maxSubdiv = robustOpts?.maxSubdiv ?? 64;
  let robustSliverRejects = 0, robustManifoldRejects = 0; // diagnostics (returned in stats; 0 when off)
  let subdivSplits = 0, subdivSubSegments = 0; // subdivideCollinear diagnostics (0 when off)
  let subdivFailNonCollinear = 0, subdivFailBudget = 0; // classified remaining failures (0 when off)
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
    // OPT-IN ROBUST guards (E-2026-07-02-KERNEL-HARDEN) — for DENSE near-collinear pickets. Pure rejections
    // (no mutation), so the mesh is MANIFOLD-SAFE BY CONSTRUCTION. STRICT NO-OP when robust is off.
    if (robust) {
      // (b) DRIFT-FREE manifold guard: reject if the new diagonal (ap0,ap1) ALREADY exists as a LIVE mesh edge
      // (T-junction fan → non-manifold). Reads the halfedge structure directly (edgeExists), so it CANNOT drift
      // like the incremental multiset (PROOF 1: the drifting multiset understates new interior diagonals 1-vs-2
      // and leaves stale positives on removed edges → FALSE-REJECTS legit flips → recovery stalls). This
      // REPLACES the legacy medges check when robust is on (see below — the medges check is skipped for robust),
      // so recovery gets the CORRECT manifold test WITHOUT the drift's false rejects.
      if (edgeExists(ap0, ap1)) { robustManifoldRejects++; return false; }
      // (a) OPTIONAL SLIVER guard (only when sliverEps>0). The two new triangles are (ap0,ap1,pl)/(ap0,ap1,pr).
      // A near-collinear picket makes the strict-convex predicate PASS even when they are near-zero area. NOTE
      // (MEASURED, E-2026-07-02-KERNEL-HARDEN SFB A/B): rejecting these STARVES recovery (failed 86→2082, chord
      // WORSE) because a crossing chain legitimately drains THROUGH near-collinear quads — slivers are NOT the
      // fold source (the mesh is already index-manifold). Default OFF (sliverEps 0); enable only if a real fold
      // is later attributed to a specific sliver flip.
      if (sliverEps > 0) {
        const area2A = Math.abs(orient(a0x, a0y, a1x, a1y, plx, ply)); // = 2·area(ap0,ap1,pl)
        const area2B = Math.abs(orient(a0x, a0y, a1x, a1y, prx, pry)); // = 2·area(ap0,ap1,pr)
        if (area2A < 2 * sliverEps || area2B < 2 * sliverEps) { robustSliverRejects++; return false; }
      }
    }
    // LEGACY manifold guard (drifting incremental multiset): reject the flip if the new diagonal (ap0,ap1)
    // appears present in the multiset. SKIPPED when robust is on (the drift-free edgeExists guard above replaces
    // it — the multiset FALSE-REJECTS under dense pickets). No-op when medges is undefined (guard off).
    if (!robust && medges !== undefined && mget(ap0, ap1) > 0) return false;
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
  //
  // `blockOut` (opt-in, subdivideCollinear): when the walk gives up because a vertex lies ON the segment p→q
  // (collinear apex), the blocking vertex index is written to blockOut.v (else -1). Pure diagnostic write —
  // STRICT NO-OP when blockOut is undefined (the byte-identical default path never allocates or writes it).
  const collectCrossings = (p: number, q: number, uRef: number, blockOut?: { v: number }): number[] | null => {
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
    if (startFar < 0) {
      // No clean entry crossing from p's fan. This includes a vertex in p's fan lying ON p→q. When subdividing,
      // find the fan vertex that is collinear-on-segment and closest to p, and report it as the blocker.
      if (blockOut !== undefined) blockOut.v = fanCollinearBlocker(p, q, uRef);
      return null;
    }
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
      // Neither apex-incident edge is crossed ⇒ the segment passes THROUGH the apex vertex (collinear) → give up.
      // The apex is exactly the on-segment blocking vertex the subdivide path needs.
      if (blockOut !== undefined) blockOut.v = apex;
      return null; // manifold-safe give-up
    }
    return null; // guard tripped (degenerate) → give up
  };

  // subdivideCollinear helper: is vertex v collinear-ON the open segment p→q (strictly between, |perp| < eps)?
  // Uses the local u-frame anchored at uRef. Returns the parameter t∈(0,1) along p→q, or -1 if not on-segment.
  const onSegT = (v: number, p: number, q: number, uRef: number, eps: number): number => {
    if (v === p || v === q) return -1;
    const px = wx(p, uRef), py = wy(p), qx = wx(q, uRef), qy = wy(q);
    const vx = wx(v, uRef), vy = wy(v);
    const dx = qx - px, dy = qy - py; const L2 = dx * dx + dy * dy;
    if (L2 <= 0) return -1;
    const cross = dx * (vy - py) - dy * (vx - px); // 2·signed area = perp·|pq|
    if (Math.abs(cross) > eps * Math.sqrt(L2)) return -1; // perp distance = |cross|/|pq| ≥ eps → not on-segment
    const t = ((vx - px) * dx + (vy - py) * dy) / L2;
    return t > 1e-6 && t < 1 - 1e-6 ? t : -1; // strictly between
  };

  // subdivideCollinear helper: among the vertices of every triangle INCIDENT to p, the on-segment vertex
  // closest to p (used when the walk finds NO clean entry crossing because a neighbour vertex sits on p→q —
  // e.g. the next collinear picket vertex, which on a boundary edge is reachable only as an INCOMING halfedge,
  // so scanning `nextHE(e)` alone misses it). We check BOTH other corners of each incident triangle. Returns -1.
  const fanCollinearBlocker = (p: number, q: number, uRef: number): number => {
    let best = -1, bestT = Infinity;
    const consider = (w: number): void => {
      if (w === p) return;
      const t = onSegT(w, p, q, uRef, collinearEps);
      if (t >= 0 && t < bestT) { bestT = t; best = w; }
    };
    forEachOutgoing(p, (e) => {
      // triangle of `e` = (p, nextHE(e), prevHE(e) origins); check its two non-p corners.
      consider(triangles[nextHE(e)]);
      consider(triangles[prevHE(e)]);
      return false;
    });
    return best;
  };

  // Recover a SINGLE sub-segment p→q by the crossing-chain walk. Returns:
  //   'present'   — the edge already exists (locked, no flips).
  //   'recovered' — recovered via flips (locked).
  //   'blocked'   — a vertex lies collinear ON the segment (blockOut.v set) — the subdivide path splits here.
  //   'failed'    — could not recover for another reason (no clean chain / degenerate), NOT collinear-blocked.
  // Locks the edge on success. Pure with respect to the caller's counters (they read the return value).
  const recoverSegment = (p: number, q: number, blockOut?: { v: number }): 'present' | 'recovered' | 'blocked' | 'failed' => {
    if (edgeExists(p, q)) { locked.add(lockKey(p, q)); return 'present'; }
    const uRef = uv[2 * p]; // local u-frame anchored at p (shortest-image across the seam)
    // CROSSING-CHAIN recovery (Sloan): re-collect the crossing chain, flip ONE convex crossing edge, repeat.
    let ok = false;
    let bestLen = Infinity, sinceImprove = 0;
    const stallCap = 4;
    if (blockOut !== undefined) blockOut.v = -1;
    for (let outer = 0; outer < maxFlipsPerEdge * 8 && !ok; outer++) {
      const chain = collectCrossings(p, q, uRef, blockOut);
      if (chain === null || chain.length === 0) break; // blocked / collinear / done → give up cleanly
      if (chain.length < bestLen) { bestLen = chain.length; sinceImprove = 0; } else if (++sinceImprove > stallCap) break;
      let flippedAny = false;
      for (const e of chain) {
        if (flipConvexCrossing(e, uRef)) { totalFlips++; flippedAny = true; break; } // re-collect on the mutated mesh
      }
      if (edgeExists(p, q)) { ok = true; break; }
      if (!flippedAny) break; // no convex crossing edge anywhere → give up cleanly (degenerate)
    }
    if (ok || edgeExists(p, q)) { locked.add(lockKey(p, q)); return 'recovered'; }
    if (blockOut !== undefined && blockOut.v >= 0) return 'blocked';
    return 'failed';
  };

  const blockOut = subdivideCollinear ? { v: -1 } : undefined;

  for (let ci = 0; ci + 1 < constraints.length; ci += 2) {
    const p0 = constraints[ci], q0 = constraints[ci + 1];
    if (p0 === q0 || p0 < 0 || q0 < 0 || p0 >= nVerts || q0 >= nVerts) continue;

    if (!subdivideCollinear) {
      // BYTE-IDENTICAL default path: recover the segment once; blocked/failed both count as failed.
      const res = recoverSegment(p0, q0);
      if (res === 'present') alreadyPresent++;
      else if (res === 'recovered') recovered++;
      else recoveryFailed++;
      continue;
    }

    // SUBDIVIDE-COLLINEAR path (opt-in): a worklist of sub-segments. When a segment is BLOCKED by an on-segment
    // vertex v, split it into a→v and v→b and re-enqueue both (v is a legitimate shared endpoint — textbook CDT
    // segment subdivision). Recurse up to maxSubdiv times (several collinear vertices may lie on the original).
    // ACCOUNTING: recovery% is reported over ORIGINAL constraints (present/recovered/failed each count the
    // original ONCE) — a fully-embedded original (every sub-segment present-or-recovered) is `recovered` (or
    // `alreadyPresent` if it never split and was already an edge); if ANY sub-segment genuinely fails the
    // original is `recoveryFailed`. subdivSubSegments tracks the extra sub-segments for diagnostics only.
    let didSplit = false, subCount = 0, anyFail = false, anyFlip = false;
    const stack: Array<[number, number]> = [[p0, q0]];
    let subdivBudget = maxSubdiv;
    while (stack.length) {
      const [a, b] = stack.pop()!;
      if (a === b) continue;
      const res = recoverSegment(a, b, blockOut);
      if (res === 'present') { /* sub-segment already an edge */ }
      else if (res === 'recovered') { anyFlip = true; }
      else if (res === 'blocked' && subdivBudget > 0) {
        // split at the reported on-segment vertex; the two sub-segments recover as ordinary edges.
        const v = blockOut!.v;
        subdivBudget--;
        didSplit = true; subCount++;
        stack.push([a, v], [v, b]);
      } else {
        anyFail = true; // genuine failure (non-collinear give-up, or budget exhausted)
        if (res === 'blocked') subdivFailBudget++; else subdivFailNonCollinear++;
      }
    }
    if (didSplit) { subdivSplits++; subdivSubSegments += subCount + 1; }
    // Classify the ORIGINAL constraint: failed if any sub-segment failed; else recovered if any work happened
    // (a flip or a split), else alreadyPresent (the whole original was already an edge, no split, no flip).
    if (anyFail) recoveryFailed++;
    else if (didSplit || anyFlip) recovered++;
    else alreadyPresent++;
  }

  return { locked, alreadyPresent, recovered, recoveryFailed, flips: totalFlips, robustSliverRejects, robustManifoldRejects, subdivSplits, subdivSubSegments, subdivFailNonCollinear, subdivFailBudget };
}

/** Helper to convert a locked-edge Set into the isLocked predicate flipHE expects. */
export function lockedPredicate(locked: Set<number>, nVerts: number): (a: number, b: number) => boolean {
  const N = nVerts + 1;
  return (a: number, b: number): boolean => locked.has(a < b ? a * N + b : b * N + a);
}

export { TAU };
