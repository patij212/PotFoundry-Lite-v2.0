/**
 * ConstrainedCellTriangulator.ts — local constrained triangulation of a single
 * quadtree cell with feature-curve constraint edges.
 *
 * Given a cell's CCW boundary polygon (corners + finer-neighbour mid-edge
 * vertices + feature-curve↔boundary crossing points), its interior feature
 * points, and the feature-curve segments as constraint edges, this produces a
 * triangulation that:
 *  - uses EXACTLY the supplied boundary vertices on the cell perimeter (so a
 *    neighbour cell sharing that perimeter sees the identical vertex set → no
 *    T-junction by construction), and
 *  - contains every constraint edge as a real mesh edge (so the feature curve
 *    becomes a sharp dihedral, not a chamfer).
 *
 * The kernel is `cdt2d` (constrained Delaunay) run LOCALLY on the handful of
 * points in one cell — never globally (the global CDT was the legacy timeout
 * source). The cell boundary loop is itself passed as constraint edges so every
 * collinear mid-edge / crossing vertex is retained (cdt2d would otherwise drop
 * collinear hull points), and `{ exterior: false }` keeps only the cell interior.
 *
 * @module conforming/ConstrainedCellTriangulator
 */

import cdt2d from 'cdt2d';

/** A point in (u,t) parameter space. */
export interface CellPoint {
  u: number;
  t: number;
}

/** Inputs for a single constrained cell triangulation. */
export interface ConstrainedCellInput {
  /** Boundary polygon vertices in CCW order (corners + mid-edges + crossings). */
  boundary: CellPoint[];
  /** Interior points strictly inside the cell (curve vertices + Steiner points). */
  interior: CellPoint[];
  /** Constraint edges as [i,j] index pairs into the combined [boundary, interior]. */
  constraints: Array<[number, number]>;
}

/** Result of a single constrained cell triangulation. */
export interface ConstrainedCellResult {
  /** Combined point list (boundary first, then interior). */
  points: CellPoint[];
  /** CCW triangles as index triples into `points`. */
  triangles: Array<[number, number, number]>;
  /** cdt2d emitted a CW triangle that was flipped CCW — a fold-over signal. */
  inversionCount: number;
  /** Zero-(u,t)-area triangles dropped — (u,t)-collinear ≠ 3D-collinear ⇒ potential hole. */
  droppedCount: number;
}

/** One CDT cell that fired a masking channel (Stage-0 instrument). */
export interface CdtCellIncident {
  u0: number;
  t0: number;
  u1: number;
  t1: number;
  inversions: number;
  drops: number;
  /** Replay dump — only when `globalThis.__pfConformingCellDumps === true`. */
  input?: ConstrainedCellInput;
}

/** Aggregated masking-channel counters across all CDT cells of one mesh build. */
export interface CdtStats {
  inversions: number;
  drops: number;
  /** Incident cells (capped at 500 per wall; the inversions/drops totals stay exact past the cap). */
  incidents: CdtCellIncident[];
}

/** Signed area of triangle p,q,r in (u,t); positive ⇒ CCW. */
function signedArea2(p: CellPoint, q: CellPoint, r: CellPoint): number {
  return (q.u - p.u) * (r.t - p.t) - (r.u - p.u) * (q.t - p.t);
}

/** Winding normalization with masking-channel counters (was silent). */
export function normalizeWinding(
  points: CellPoint[],
  raw: Array<[number, number, number]>,
): { triangles: Array<[number, number, number]>; inversionCount: number; droppedCount: number } {
  const triangles: Array<[number, number, number]> = [];
  let inversionCount = 0;
  let droppedCount = 0;
  for (const [a, b, c] of raw) {
    const area = signedArea2(points[a], points[b], points[c]);
    if (area > 0) triangles.push([a, b, c]);
    else if (area < 0) {
      triangles.push([a, c, b]);
      inversionCount++;
    } else droppedCount++;
    // area === 0 ⇒ degenerate (a constraint forced collinear points) — counted, dropped.
  }
  return { triangles, inversionCount, droppedCount };
}

/**
 * True iff `triangles` leave a HOLE in the cell: some non-perimeter edge is used
 * by only ONE triangle. In a complete triangulation of the (convex) cell
 * rectangle every interior edge is shared by two triangles and only the boundary
 * loop (`i↔i+1`, wrap `0↔nB-1`) is single-sided, so a lone interior edge means a
 * triangle is missing. Numeric edge key `lo*nPoints + hi` (unique: hi < nPoints).
 */
function hasInteriorHole(
  triangles: Array<[number, number, number]>,
  nB: number,
  nPoints: number,
): boolean {
  const count = new Map<number, number>();
  const bump = (x: number, y: number): void => {
    const key = x < y ? x * nPoints + y : y * nPoints + x;
    count.set(key, (count.get(key) ?? 0) + 1);
  };
  for (const [a, b, c] of triangles) {
    bump(a, b);
    bump(b, c);
    bump(c, a);
  }
  for (const [key, cnt] of count) {
    if (cnt !== 1) continue;
    const lo = Math.floor(key / nPoints);
    const hi = key % nPoints;
    const perim = hi < nB && (hi === lo + 1 || (lo === 0 && hi === nB - 1));
    if (!perim) return true; // an interior edge with one triangle ⇒ hole
  }
  return false;
}

export function triangulateConstrainedCell(
  input: ConstrainedCellInput,
): ConstrainedCellResult {
  const points: CellPoint[] = [...input.boundary, ...input.interior];
  const nB = input.boundary.length;

  // Boundary loop edges (closed) keep every collinear boundary vertex; feature
  // segments are the interior constraints. cdt2d dedups internally, but we pass
  // a clean unique set.
  const edgeKeys = new Set<string>();
  const edges: Array<[number, number]> = [];
  const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push([a, b]);
  };
  for (let i = 0; i < nB; i++) addEdge(i, (i + 1) % nB);
  for (const [a, b] of input.constraints) addEdge(a, b);

  const xy: Array<[number, number]> = points.map((p) => [p.u, p.t]);
  let raw = cdt2d(xy, edges, { exterior: false });

  // cdt2d's `{ exterior:false }` region-removal punches a HOLE when feature
  // constraints form a CLOSED LOOP inside the cell (e.g. a Voronoi junction where
  // 3+ cell-edges meet): it classifies the loop interior as "exterior" and drops
  // the triangle(s) there, leaving interior naked edges — a real crack in the
  // watertight wall (the whole cell rectangle is surface; feature edges are
  // interior creases, not region boundaries). The point set's convex hull is
  // exactly the cell rectangle (the 4 corners are always in `boundary`), so the
  // FULL constrained triangulation (no exterior-removal) covers the cell with no
  // holes. Fall back to it ONLY when a hole is detected → every already-watertight
  // cell stays byte-identical (the common path is untouched).
  if (hasInteriorHole(raw, nB, points.length)) {
    raw = cdt2d(xy, edges);
  }

  // Normalize winding to CCW (cdt2d emits CCW for a CCW boundary, but guard
  // against any inverted/degenerate triangle so downstream orientation holds).
  // Both guard channels are COUNTED (Stage-0 instrument): a flip masks a
  // constraint fold-over; a drop is a potential hole ((u,t)-collinear ≠ 3D-collinear).
  const norm = normalizeWinding(points, raw);
  return {
    points,
    triangles: norm.triangles,
    inversionCount: norm.inversionCount,
    droppedCount: norm.droppedCount,
  };
}
