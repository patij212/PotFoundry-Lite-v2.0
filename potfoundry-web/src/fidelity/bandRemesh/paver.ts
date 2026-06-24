/**
 * paver.ts — Advancing-front band-following strip triangulation.
 *
 * Connects consecutive rows from a {@link StationGrid} into a triangle mesh
 * whose triangles run ALONG the ribbon (the orientation fix).  Each pair of
 * adjacent rows is zipped via an advancing-front walk on the two cross-band
 * polylines, handling unequal w-lengths without creating T-junctions.
 *
 * @module fidelity/bandRemesh/paver
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { StationGrid, StationPoint } from './stations';

// ── Public types ──────────────────────────────────────────────────────────────

/** Result of {@link paveBand}. */
export interface PaveBandResult {
  /**
   * Deduplicated vertex table in (u,t) parameter space.  Convert each entry to
   * a 3D position via `sampler.position(u, t)`.
   *
   * Vertices are deduplicated by exact (u,t) key so shared row points are
   * represented once and the mesh is internally watertight.
   */
  utVertices: Array<[number, number]>;

  /**
   * Flat triangle index buffer (`length % 3 === 0`), indexing into `utVertices`.
   */
  indices: Uint32Array;

  /**
   * Vertex indices (into `utVertices`) for the two boundary rails, in row
   * order (index 0 = first row, last = last row).
   *
   * Task 5 (stitching) needs these to close the band against adjacent strips.
   */
  railVertexIds: {
    /** Foot rail: one vertex per row — the `w[0]` point of each row. */
    foot: number[];
    /** Crest rail: one vertex per row — the `w[last]` point of each row. */
    crest: number[];
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Canonical string key for deduplication of (u,t) pairs. */
function utKey(u: number, t: number): string {
  return `${u}|${t}`;
}

/** 3D squared distance between two evaluated points. */
function dist3Sq(
  sampler: SurfaceSampler,
  a: StationPoint,
  b: StationPoint,
): number {
  const pa = sampler.position(a.u, a.t);
  const pb = sampler.position(b.u, b.t);
  return (pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2;
}

/**
 * Law-of-cosines angle (degrees) at vertex B given side lengths AB, BC, AC.
 * Clamps cosine to [-1,1] to protect against floating-point drift.
 *
 * Parameter names: ab = |AB|, bc = |BC|, ac = |AC|; computes the angle at vertex B.
 */
function angleDeg(ab: number, bc: number, ac: number): number {
  if (ab <= 0 || bc <= 0) return 0;
  const cos = Math.max(-1, Math.min(1, (ab * ab + bc * bc - ac * ac) / (2 * ab * bc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Minimum interior angle (degrees) of the triangle (A, B, C).
 * Side lengths: a=|BC|, b=|CA|, c=|AB|.
 */
function minAngle3D(
  sampler: SurfaceSampler,
  A: StationPoint,
  B: StationPoint,
  C: StationPoint,
): number {
  const pa = sampler.position(A.u, A.t);
  const pb = sampler.position(B.u, B.t);
  const pc = sampler.position(C.u, C.t);

  const c = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]); // |AB|
  const b = Math.hypot(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]); // |CA|
  const a = Math.hypot(pb[0] - pc[0], pb[1] - pc[1], pb[2] - pc[2]); // |BC|

  const angA = angleDeg(b, c, a); // angle at A
  const angB = angleDeg(a, c, b); // angle at B
  const angC = angleDeg(a, b, c); // angle at C

  return Math.min(angA, angB, angC);
}

// ── Core implementation ───────────────────────────────────────────────────────

/**
 * Triangulate the band between two adjacent cross-band rows using an
 * advancing-front zip.
 *
 * The two rows may have different w-lengths.  We walk both from foot (index 0)
 * toward crest (index last) simultaneously.  At each step we have two candidate
 * triangles (advance the top pointer or the bottom pointer) and we choose the
 * one that maximises the 3D minimum interior angle, which gives diagonal-split
 * behaviour equivalent to picking the better diagonal in each quad.
 *
 * The walk invariant is:
 *   - iA is the cursor on row A (starting row, w counts as nA vertices).
 *   - iB is the cursor on row B (ending row, w counts as nB vertices).
 *   - Both start at 0, both must reach (nA-1) and (nB-1) respectively.
 *   - Each step emits one triangle and advances exactly one cursor.
 *
 * Edge cases:
 *   - If one cursor is already at its last vertex, we can only advance the other.
 *   - If both cursors are at their last vertex, the zip is complete.
 *
 * This algorithm produces no T-junctions along the boundary between rows:
 * every edge between two consecutive w-points on row A or B is shared by
 * exactly the triangles on either side.
 *
 * @param wA      Cross-band point array for the "top" (earlier s) row.
 * @param wB      Cross-band point array for the "bottom" (later s) row.
 * @param sampler Surface sampler for 3D evaluation.
 * @param vidA    Vertex-ID resolver for row A points (index → global vertex id).
 * @param vidB    Vertex-ID resolver for row B points (index → global vertex id).
 * @param tris    Output accumulator for triangle index triples.
 */
function zipRows(
  wA: StationPoint[],
  wB: StationPoint[],
  sampler: SurfaceSampler,
  vidA: (i: number) => number,
  vidB: (i: number) => number,
  tris: number[],
): void {
  const nA = wA.length;
  const nB = wB.length;
  let iA = 0;
  let iB = 0;

  while (iA < nA - 1 || iB < nB - 1) {
    const canAdvA = iA < nA - 1;
    const canAdvB = iB < nB - 1;

    if (canAdvA && canAdvB) {
      // Two candidate triangles:
      //   triA = (A[iA], A[iA+1], B[iB])  — advance A cursor
      //   triB = (A[iA], B[iB], B[iB+1])  — advance B cursor
      const minA = minAngle3D(sampler, wA[iA], wA[iA + 1], wB[iB]);
      const minB = minAngle3D(sampler, wA[iA], wB[iB], wB[iB + 1]);

      if (minA >= minB) {
        // Advance A
        tris.push(vidA(iA), vidA(iA + 1), vidB(iB));
        iA++;
      } else {
        // Advance B
        tris.push(vidA(iA), vidB(iB), vidB(iB + 1));
        iB++;
      }
    } else if (canAdvA) {
      // B is exhausted: emit a triangle advancing A only
      tris.push(vidA(iA), vidA(iA + 1), vidB(iB));
      iA++;
    } else {
      // A is exhausted: emit a triangle advancing B only
      tris.push(vidA(iA), vidB(iB), vidB(iB + 1));
      iB++;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pave the band described by `grid` into a triangle mesh.
 *
 * Consecutive rows are connected by an advancing-front zip (see {@link zipRows}).
 * Vertices are deduplicated by exact (u,t) key so each (u,t) point is stored
 * once.  Watertightness is guaranteed by {@link zipRows}: it links the vertex IDs
 * of both adjacent rows so every shared-row edge is referenced by exactly two
 * triangles — no T-junctions and no non-manifold edges along row boundaries.
 *
 * @param grid    Station grid produced by `buildStations`.
 * @param sampler Surface sampler (used only for 3D min-angle evaluation during
 *                diagonal selection and the boundary-vertex export for Task 5).
 * @returns       Deduplicated vertex table, flat triangle index buffer, and
 *                per-rail boundary vertex ID arrays.
 */
export function paveBand(
  grid: StationGrid,
  sampler: SurfaceSampler,
): PaveBandResult {
  const { rows } = grid;

  // Vertex deduplication table: utKey → index in utVertices.
  const vtxMap = new Map<string, number>();
  const utVertices: Array<[number, number]> = [];

  /** Intern a (u,t) point and return its vertex id. */
  function intern(pt: StationPoint): number {
    const key = utKey(pt.u, pt.t);
    let id = vtxMap.get(key);
    if (id === undefined) {
      id = utVertices.length;
      vtxMap.set(key, id);
      utVertices.push([pt.u, pt.t]);
    }
    return id;
  }

  // Pre-intern all vertices row by row so vidA/vidB can be simple lookups.
  // Also build per-row vertex-ID arrays.
  const rowVids: number[][] = rows.map((row) => row.w.map((pt) => intern(pt)));

  // Accumulate triangle indices.
  const tris: number[] = [];

  for (let r = 0; r + 1 < rows.length; r++) {
    const wA = rows[r].w;
    const wB = rows[r + 1].w;
    const idsA = rowVids[r];
    const idsB = rowVids[r + 1];

    zipRows(
      wA, wB, sampler,
      (i) => idsA[i],
      (i) => idsB[i],
      tris,
    );
  }

  // Build rail vertex-id arrays from per-row vertex tables.
  // foot  = w[0]      of each row
  // crest = w[last]   of each row
  const footIds: number[] = rowVids.map((ids) => ids[0]);
  const crestIds: number[] = rows.map((row, r) => rowVids[r][row.w.length - 1]);

  return {
    utVertices,
    indices: new Uint32Array(tris),
    railVertexIds: {
      foot: footIds,
      crest: crestIds,
    },
  };
}
