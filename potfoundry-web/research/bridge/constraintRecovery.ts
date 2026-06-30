// constraintRecovery.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// Constrained-Delaunay EDGE RECOVERY by locked Lawson flips, over Delaunator's halfedge structure (the same
// connectivity the in-house kernel uses). Stage B of the feature-conforming spike: make each feature locus an
// actual mesh EDGE so the triangulation interpolates ALONG a thin ridge instead of cutting a Delaunay diagonal
// ACROSS it (the residual that vertex-injection alone, Stage A, cannot fix on thin wandering ridges —
// MEASURED: GothicArches true-3D p99 only −44% from injection; density-along-line made it WORSE).
//
// Approach (textbook segment-constraint insertion):
//   For each constraint (p,q):
//     if the edge p–q already exists → lock it.
//     else repeatedly find the triangle edge that the segment p–q crosses and FLIP it (when the quad is
//     convex) until p–q appears, then lock it. Edges already locked are never flipped (would un-recover a
//     previously inserted constraint), and the in-circle/optimization flips that follow also skip locked edges.
//
// Periodic u: the mesh wraps at the u-seam. We operate in a per-segment LOCAL u-frame: both endpoints and any
// candidate vertex are shifted into the segment's [umin-0.5, umin+0.5] band (shortest-image) so the 2D
// orientation predicates are well-defined across the seam. This mirrors the locator's straddle normalization.
//
// HONEST limitation: a plain flip-only recovery cannot insert a constraint whose span is blocked by a vertex
// lying ON the segment, or by a non-convex flip chain; such constraints are LEFT un-recovered and counted
// (recoveryFailed). The kernel proceeds with whatever was recovered — a partial constraint set still pins most
// of the ridge. We report the recovery rate so the measurement is honest about how complete Stage B was.

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
): RecoveryResult {
  const nVerts = uv.length / 2;
  const N = nVerts + 1;
  const locked = new Set<number>();
  const lockKey = (a: number, b: number): number => (a < b ? a * N + b : b * N + a);
  let alreadyPresent = 0, recovered = 0, recoveryFailed = 0, totalFlips = 0;

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

  for (let ci = 0; ci + 1 < constraints.length; ci += 2) {
    const p = constraints[ci], q = constraints[ci + 1];
    if (p === q || p < 0 || q < 0 || p >= nVerts || q >= nVerts) continue;
    if (edgeExists(p, q)) { locked.add(lockKey(p, q)); alreadyPresent++; continue; }

    // local u-frame anchored at p (shortest-image across the seam)
    const uRef = uv[2 * p];
    const px = wrapU(uv[2 * p], uRef), py = uv[2 * p + 1];
    const qx = wrapU(uv[2 * q], uRef), qy = uv[2 * q + 1];

    let ok = false;
    for (let iter = 0; iter < maxFlipsPerEdge; iter++) {
      if (edgeExists(p, q)) { ok = true; break; }
      // Find, in p's outgoing fan, the triangle whose FAR edge (opposite p) crosses segment p→q, then flip
      // that far edge. (Standard CDT walk — the first crossed edge always lies in the fan of p.)
      let flipE = -1;
      forEachOutgoing(p, (e) => {
        // triangle of halfedge e = (p, b, c) with b=triangles[nextHE(e)], c=triangles[prevHE(e)].
        const farE = nextHE(e); // halfedge b→c, the edge opposite p
        const b = triangles[farE], c = triangles[nextHE(farE)];
        if (b === q || c === q) return false; // q is a corner — edge p-q will appear by another flip
        const bx = wrapU(uv[2 * b], uRef), by = uv[2 * b + 1];
        const cx = wrapU(uv[2 * c], uRef), cy = uv[2 * c + 1];
        if (segCross(px, py, qx, qy, bx, by, cx, cy)) { flipE = farE; return true; }
        return false;
      });
      if (flipE < 0) break; // no crossing edge in p's fan → give up (non-convex / blocked)
      const tw = halfedges[flipE];
      if (tw < 0) break;
      if (locked.has(lockKey(triangles[flipE], triangles[nextHE(flipE)]))) break; // would break a constraint
      // Quad = the two triangles sharing flipE. Apexes:
      const e = flipE;
      const eNext = nextHE(e), ePrev = prevHE(e), twPrev = prevHE(tw);
      const pr = triangles[e], pl = triangles[eNext], ap0 = triangles[ePrev], ap1 = triangles[twPrev];
      // convexity: new diagonal ap0-ap1 must separate pr and pl
      const a0x = wrapU(uv[2 * ap0], uRef), a0y = uv[2 * ap0 + 1];
      const a1x = wrapU(uv[2 * ap1], uRef), a1y = uv[2 * ap1 + 1];
      const prx = wrapU(uv[2 * pr], uRef), pry = uv[2 * pr + 1];
      const plx = wrapU(uv[2 * pl], uRef), ply = uv[2 * pl + 1];
      const s0 = orient(a0x, a0y, a1x, a1y, prx, pry);
      const s1 = orient(a0x, a0y, a1x, a1y, plx, ply);
      if (s0 * s1 >= 0) break; // not convex → cannot flip
      // perform the flip (relink identical to flipHE)
      triangles[e] = ap1; triangles[tw] = ap0;
      const hbl = halfedges[twPrev], har = halfedges[ePrev];
      linkHE(halfedges, e, hbl);
      linkHE(halfedges, tw, har);
      linkHE(halfedges, ePrev, twPrev);
      // repair vhe for every halfedge in the two rewritten triangles
      const t0 = e - (e % 3), t1 = tw - (tw % 3);
      setVhe(t0); setVhe(t0 + 1); setVhe(t0 + 2);
      setVhe(t1); setVhe(t1 + 1); setVhe(t1 + 2);
      totalFlips++;
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
