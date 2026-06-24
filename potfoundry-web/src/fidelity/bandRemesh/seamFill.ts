/**
 * seamFill.ts — the UNIVERSAL dyadic-edge seam (Q1 of the dyadic-edge-seam spike).
 *
 * Proves the make-or-break claim: an externally-filled region bounded by WHOLE
 * dyadic cell edges, reusing the complement's EXACT hole-boundary vertices, welds
 * watertight to the production complement. This is the opposite of the band-stitch
 * NO-GO (the rail seam): there the complement re-discretised an arbitrary feature
 * curve at its own crossings → rail edges never welded; here the seam is the
 * complement's OWN dyadic cell edges, which it shares with its neighbours by
 * construction (corners + 2:1-balance mid-edge vertices) and does NOT
 * re-discretise.
 *
 * The mechanism, in two pure-orchestration steps (ZERO production edits):
 *
 *   1. {@link extractHoleBoundary} — from the complement's emitted OUTER wall, the
 *      hole-boundary edges are exactly the COUNT-1 edges that are NOT on the
 *      t=0/t=1 rings. Because the band-region emit-gate skips only WHOLE cells
 *      (all 4 corners + center inside), every hole-boundary edge is a dyadic cell
 *      edge whose OTHER side is an emitting complement cell. If that neighbour is
 *      FINER (2:1 balance), it emitted a MID-EDGE vertex on the shared edge — and
 *      that mid-edge vertex is in the count-1 set automatically (the finer cell
 *      emits two half-edges, each count-1 on the hole side). Ordering the count-1
 *      edges into closed loops therefore reuses the complement's EXACT boundary
 *      vertices, mid-edges included. No registry surgery: the vertices already
 *      exist in the emitted mesh.
 *
 *   2. {@link fillHole} — ear-clip the hole polygon in (u,t) using ONLY the loop's
 *      existing vertex ids. Q1 does not care about triangle quality, only that the
 *      fill reuses the EXACT boundary vertices and is internally consistent. The
 *      fill is oriented so each hole-boundary edge is traversed OPPOSITE to its
 *      single complement triangle → the merged edge welds count-2 with consistent
 *      winding (one complement tri + one fill tri).
 *
 * Pure CPU (analytic / CPU `styleSampler`), no GPU/DOM.
 *
 * @module fidelity/bandRemesh/seamFill
 */

/** A minimal indexed triangle mesh in (u,t)-id space (3D evaluated elsewhere). */
export interface IndexedMesh {
  /** Triangle index buffer (length % 3 === 0). */
  indices: Uint32Array | number[];
}

/** Result of {@link extractHoleBoundary}. */
export interface HoleBoundary {
  /**
   * Ordered closed loops of vertex ids (each loop's first id is NOT repeated at
   * the end). Each consecutive pair (incl. last→first) is a count-1 hole-boundary
   * edge of the complement. Includes EVERY count-1 boundary vertex, 2:1 mid-edges
   * included.
   */
  loops: number[][];
  /**
   * The single DIRECTED traversal of each undirected hole-boundary edge by the
   * complement (the count-1 triangle's winding), keyed `${i}:${j}` (i<j) → `[i,j]`
   * in the direction the complement used. {@link fillHole} reverses this so the
   * fill welds count-2 with consistent orientation.
   */
  complementDir: Map<string, [number, number]>;
  /** Total number of distinct hole-boundary vertices across all loops. */
  vertexCount: number;
}

/** Result of {@link fillHole}. */
export interface HoleFill {
  /** Fill triangles indexing the SAME vertex ids as the input loop. */
  triangles: Array<[number, number, number]>;
}

/** Canonical undirected edge key (i<j). */
function edgeKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/**
 * Extract the hole-boundary loop(s) from the complement's emitted OUTER wall.
 *
 * Builds the undirected edge→triangle-count map over the outer-wall triangles.
 * The hole-boundary edges are those used by EXACTLY ONE triangle whose two
 * endpoints are NOT both in `ringVertexIds` (the t=0/t=1 open rings). These are
 * dyadic cell edges between a skipped (hole) cell and an emitting complement cell;
 * the finer-neighbour case contributes its 2:1 mid-edge vertices automatically
 * (each half-edge is count-1 on the hole side). The edges are then ordered into
 * closed loops.
 *
 * @param outerWall  The complement OUTER-wall mesh (indices in merged id-space).
 * @param ringVertexIds  Vertex ids on the t=0 and t=1 rings (the true open boundary).
 * @throws if the count-1 boundary edges off the rings do not form closed loops
 *         (a non-vertex-2 junction or an open chain — which would itself be a
 *         decisive failure to report).
 */
export function extractHoleBoundary(
  outerWall: IndexedMesh,
  ringVertexIds: Set<number>,
): HoleBoundary {
  const idx = outerWall.indices;
  // Undirected edge → use count, and the directed traversal(s).
  const count = new Map<string, number>();
  const directed = new Map<string, Array<[number, number]>>();
  for (let k = 0; k + 2 < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = edgeKey(i, j);
      count.set(key, (count.get(key) ?? 0) + 1);
      const dirList = directed.get(key);
      if (dirList) dirList.push([i, j]);
      else directed.set(key, [[i, j]]);
    }
  }

  // Hole-boundary edges: count-1, NOT both endpoints on a ring.
  const complementDir = new Map<string, [number, number]>();
  // adjacency for loop ordering (each boundary vertex appears in exactly 2 edges).
  const adj = new Map<number, number[]>();
  const addAdj = (i: number, j: number): void => {
    const li = adj.get(i);
    if (li) li.push(j); else adj.set(i, [j]);
  };
  for (const [key, c] of count) {
    if (c !== 1) continue;
    const [iS, jS] = key.split(':');
    const vi = Number(iS), vj = Number(jS);
    if (ringVertexIds.has(vi) && ringVertexIds.has(vj)) continue; // a ring edge — true open boundary
    const dirs = directed.get(key);
    // A count-1 edge is traversed by exactly one triangle.
    complementDir.set(key, (dirs as Array<[number, number]>)[0]);
    addAdj(vi, vj);
    addAdj(vj, vi);
  }

  // Each hole-boundary vertex must have degree exactly 2 (a simple closed loop).
  for (const [v, nbrs] of adj) {
    if (nbrs.length !== 2) {
      throw new Error(
        `extractHoleBoundary: vertex ${v} has hole-boundary degree ${nbrs.length} (expected 2) — ` +
        `the count-1 boundary is not a set of simple closed loops (a non-vacuous crack or a missed 2:1 mid-edge)`,
      );
    }
  }

  // Walk the adjacency into closed loops.
  const visited = new Set<string>();
  const loops: number[][] = [];
  const allVerts = new Set<number>();
  for (const start of adj.keys()) {
    if (allVerts.has(start)) continue;
    // Begin a fresh loop only from an unvisited vertex.
    let prev = -1;
    let cur = start;
    const loop: number[] = [];
    // Guard against runaway in case of a malformed graph.
    const maxSteps = adj.size + 1;
    let steps = 0;
    while (steps++ <= maxSteps) {
      loop.push(cur);
      allVerts.add(cur);
      const nbrs = adj.get(cur) as number[];
      const next = nbrs[0] !== prev ? nbrs[0] : nbrs[1];
      const ek = edgeKey(cur, next);
      visited.add(ek);
      prev = cur;
      cur = next;
      if (cur === start) break;
    }
    if (cur !== start) {
      throw new Error('extractHoleBoundary: failed to close a hole-boundary loop (open chain)');
    }
    loops.push(loop);
  }

  // Sanity: every count-1 boundary edge is consumed by exactly one loop traversal.
  if (visited.size !== complementDir.size) {
    throw new Error(
      `extractHoleBoundary: loop walk visited ${visited.size} edges but there are ${complementDir.size} ` +
      `hole-boundary edges (disconnected or multiply-covered loop)`,
    );
  }

  return { loops, complementDir, vertexCount: allVerts.size };
}

/** Signed area (×2) of a polygon in (u,t). Positive = CCW. */
function signedArea2(loop: number[], vertexUT: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ui, ti] = vertexUT[loop[i]];
    const [uj, tj] = vertexUT[loop[j]];
    s += uj * ti - ui * tj;
  }
  return s;
}

/** Twice the signed area of triangle (a,b,c) in (u,t). */
function tri2(
  a: [number, number], b: [number, number], c: [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
}

/** Is point p strictly inside triangle (a,b,c)? (CCW triangle assumed.) */
function pointInTri(
  p: [number, number],
  a: [number, number], b: [number, number], c: [number, number],
): boolean {
  const d1 = tri2(a, b, p);
  const d2 = tri2(b, c, p);
  const d3 = tri2(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clip ONE simple polygon loop (vertex ids), in (u,t), into triangles that
 * reuse ONLY the loop's existing vertex ids. The loop is first normalised to CCW
 * in (u,t) so the standard ear test applies; the caller fixes the final 3D
 * winding against the complement.
 */
function earClip(loop: number[], vertexUT: Array<[number, number]>): Array<[number, number, number]> {
  const work = loop.slice();
  // Normalise to CCW for the ear test.
  if (signedArea2(work, vertexUT) < 0) work.reverse();

  const tris: Array<[number, number, number]> = [];
  const pt = (id: number): [number, number] => vertexUT[id];
  let guard = 0;
  const guardMax = work.length * work.length + 16;
  while (work.length > 3) {
    if (guard++ > guardMax) {
      throw new Error('fillHole: ear-clip failed to terminate (degenerate / self-intersecting hole polygon)');
    }
    let clipped = false;
    const n = work.length;
    for (let i = 0; i < n; i++) {
      const aId = work[(i + n - 1) % n];
      const bId = work[i];
      const cId = work[(i + 1) % n];
      const a = pt(aId), b = pt(bId), c = pt(cId);
      // Convex (CCW) corner?
      if (tri2(a, b, c) <= 0) continue;
      // No other loop vertex strictly inside this ear?
      let anyInside = false;
      for (let j = 0; j < n; j++) {
        const vId = work[j];
        if (vId === aId || vId === bId || vId === cId) continue;
        if (pointInTri(pt(vId), a, b, c)) { anyInside = true; break; }
      }
      if (anyInside) continue;
      tris.push([aId, bId, cId]);
      work.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      throw new Error('fillHole: no ear found (non-simple hole polygon)');
    }
  }
  tris.push([work[0], work[1], work[2]]);
  return tris;
}

/**
 * Fill the hole bounded by `boundary.loops`, reusing ONLY the existing
 * hole-boundary vertex ids, oriented so every hole-boundary edge welds count-2
 * (opposite to the complement's traversal).
 *
 * @param boundary  The output of {@link extractHoleBoundary}.
 * @param vertexUT  (u,t) per vertex id (merged id-space) — used for the ear test
 *                  and the orientation reconciliation.
 */
export function fillHole(
  boundary: HoleBoundary,
  vertexUT: Array<[number, number]>,
): HoleFill {
  const triangles: Array<[number, number, number]> = [];
  for (const loop of boundary.loops) {
    const earTris = earClip(loop, vertexUT);
    // Orient the WHOLE loop's fill consistently: every hole-boundary edge must be
    // traversed OPPOSITE to the complement's single triangle. Determine the global
    // flip from ANY boundary edge of this loop (all fill tris are wound the same
    // way after ear-clip's CCW normalisation, so one decision flips the loop).
    let needFlip: boolean | undefined;
    const loopEdges = new Set<string>();
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      loopEdges.add(edgeKey(loop[i], loop[j]));
    }
    for (const tri of earTris) {
      if (needFlip !== undefined) break;
      for (let e = 0; e < 3; e++) {
        const i = tri[e], j = tri[(e + 1) % 3];
        const ek = edgeKey(i, j);
        if (!loopEdges.has(ek)) continue;
        const compDir = boundary.complementDir.get(ek);
        if (!compDir) continue;
        // Complement traverses compDir[0]→compDir[1]. The fill (as ear-clipped)
        // currently traverses i→j on this edge. To weld count-2 the fill must go
        // OPPOSITE: i→j must equal compDir[1]→compDir[0].
        const fillSameAsComplement = i === compDir[0] && j === compDir[1];
        needFlip = fillSameAsComplement; // if fill matches complement dir, flip.
        break;
      }
    }
    for (const tri of earTris) {
      triangles.push(needFlip ? [tri[0], tri[2], tri[1]] : tri);
    }
  }
  return { triangles };
}
