/**
 * audit.ts — Measurement/audit utilities for the bandRemesh module (Phase 0).
 *
 * Exports:
 *   - Mesh3              simple flat-array indexed mesh type
 *   - auditWatertight    edge-topology audit (boundary / non-manifold / T-junction)
 *   - triangleQuality3D  per-mesh 3D triangle quality statistics
 *   - lateralWobbleMm    perpendicular deviation of a boundary polyline from a locus
 *
 * Pure CPU, no DOM, no GPU. Safe for Vitest/jsdom and Node environments.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal flat-array indexed triangle mesh in 3D. */
export interface Mesh3 {
  /** Flat XYZ vertex buffer: [x0, y0, z0, x1, y1, z1, …] */
  positions: Float32Array;
  /** Flat triangle index buffer: [i0, i1, i2, …] (length % 3 === 0) */
  indices: Uint32Array;
}

/** Result of {@link auditWatertight}. */
export interface WatertightAuditResult {
  /**
   * Edges referenced by exactly 1 triangle whose both endpoints are in the
   * caller-supplied `boundaryVertexIndices` set. These are genuine open-boundary
   * edges (cap/rail rings) — NOT defects.
   *
   * When `boundaryVertexIndices` is omitted the mesh is treated as fully closed,
   * so this count is always 0 (every count-1 edge becomes a T-junction instead).
   */
  boundaryEdges: number;
  /** Edges referenced by more than 2 triangles. */
  nonManifoldEdges: number;
  /**
   * Interior boundary edges: edges referenced exactly once whose both endpoints
   * are NOT both in `boundaryVertexIndices` (i.e., they are interior T-junctions).
   *
   * When `boundaryVertexIndices` is omitted every count-1 edge is a T-junction
   * (safe default for a gate — no silent false-passes).
   * `openT === 'none'` has the same effect and is kept for backward compatibility.
   */
  tJunctions: number;
}

/** Options for {@link auditWatertight}. */
export interface WatertightAuditOptions {
  /**
   * Explicit set of vertex indices that form the open boundary rings (e.g. the
   * t=0 and t=1 cap/rail rings of a cylinder ribbon). A count-1 edge whose
   * **both** endpoints are in this set is classified as a legitimate
   * `boundaryEdge`; otherwise it is a `tJunction`.
   *
   * **Precedence:** when this is supplied it is used exclusively — `openT` is
   * ignored. When omitted, the gate falls back to the `openT` option.
   *
   * Use this in preference to the old y-coordinate heuristic. Passing the
   * explicit set is the only sound approach because the open rings could map to
   * any axis (Z for `SyntheticCylinderSampler`, Y for legacy wall meshes, etc.).
   */
  boundaryVertexIndices?: Set<number>;

  /**
   * Pass `'none'` to indicate the mesh has no open boundary rings (fully
   * closed surface). In that case every boundary edge (count=1) is a
   * T-junction. This is also the behaviour when `boundaryVertexIndices` is
   * omitted (safe default — no silent false-passes).
   *
   * Ignored when `boundaryVertexIndices` is supplied.
   *
   * @deprecated Prefer `boundaryVertexIndices` for explicit, geometry-independent
   * boundary classification. This option will be kept for backward compatibility.
   */
  openT?: 'none';
}

/** Result of {@link triangleQuality3D}. */
export interface TriangleQuality3DResult {
  /** Max aspect ratio across all triangles (equilateral = 1). */
  aspectMax: number;
  /** Percentage of triangles with min interior angle < 10°. */
  pctMinAngleBelow10: number;
  /** 50th-percentile min interior angle (degrees). */
  minAngleP50: number;
}

/** Result of {@link lateralWobbleMm}. */
export interface LateralWobbleResult {
  /** 99th-percentile perpendicular distance to the locus (mm). */
  p99: number;
  /** Maximum perpendicular distance to the locus (mm). */
  max: number;
}

// ── auditWatertight ───────────────────────────────────────────────────────────

/**
 * Audit the edge topology of a triangle mesh.
 *
 * Builds an undirected edge map keyed by sorted vertex-index pair.
 * - count > 2 → non-manifold edge
 * - count = 1 → boundary edge; further classified as:
 *     - `boundaryEdge`: both endpoints are in `opts.boundaryVertexIndices`
 *     - `tJunction`: otherwise (interior crack — a real defect)
 *
 * **Safe default when `boundaryVertexIndices` is omitted:** every count-1 edge
 * is a `tJunction`. This is the conservative choice for a gate — the mesh is
 * assumed fully closed so nothing is silently forgiven. `openT === 'none'`
 * has the same effect and is kept for backward compatibility.
 *
 * **Do not rely on positional heuristics** (e.g. y-min/y-max planes) to infer
 * which vertices are on the boundary rings. Those heuristics are axis-specific
 * and break for cylinder-style meshes (where open rings map to the Z axis).
 * Pass `boundaryVertexIndices` explicitly — the caller knows which vertices are
 * the cap/rail open boundary.
 */
export function auditWatertight(
  mesh: Mesh3,
  opts: WatertightAuditOptions = {},
): WatertightAuditResult {
  const { indices } = mesh;

  // Build undirected edge → use count map.
  const edges = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k];
    const b = indices[k + 1];
    const c = indices[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue; // degenerate edge — skip
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }

  // Boundary-ring classification.
  // When boundaryVertexIndices is supplied: both-in-set → true open boundary.
  // Otherwise (including openT='none' or no opts): every count-1 edge is a
  // T-junction — safe for a gate (no silent false-passes).
  const bvi = opts.boundaryVertexIndices;
  const isBoundaryEdge =
    bvi !== undefined
      ? (vi: number, vj: number): boolean => bvi.has(vi) && bvi.has(vj)
      : (_vi: number, _vj: number): boolean => false;

  let nonManifoldEdges = 0;
  let tJunctions = 0;
  let openBoundaryEdges = 0;

  for (const [key, count] of edges) {
    if (count > 2) {
      nonManifoldEdges++;
    } else if (count === 1) {
      const [iS, jS] = key.split(':');
      const vi = Number(iS);
      const vj = Number(jS);
      if (isBoundaryEdge(vi, vj)) {
        openBoundaryEdges++;
      } else {
        // Interior boundary edge → T-junction (or omitted boundary set)
        tJunctions++;
      }
    }
  }

  return {
    boundaryEdges: openBoundaryEdges,
    nonManifoldEdges,
    tJunctions,
  };
}

// ── triangleQuality3D ─────────────────────────────────────────────────────────

/**
 * Compute 3D triangle quality statistics for a mesh.
 *
 * Aspect ratio convention (equilateral-normalized):
 *   aspect = longest² * √3 / (4 * area)
 * so equilateral triangles have aspect = 1.
 *
 * Angles computed via law of cosines from 3D side lengths.
 * Degenerate triangles (zero or near-zero area) are excluded from statistics.
 */
export function triangleQuality3D(mesh: Mesh3): TriangleQuality3DResult {
  const { positions, indices } = mesh;
  const nTri = indices.length / 3;

  const minAngles: number[] = [];
  let aspectMax = 0;

  for (let t = 0; t < nTri; t++) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;

    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

    // Side lengths
    const sa = edgeLen(bx, by, bz, cx, cy, cz); // opposite vertex a
    const sb = edgeLen(cx, cy, cz, ax, ay, az); // opposite vertex b
    const sc = edgeLen(ax, ay, az, bx, by, bz); // opposite vertex c

    // Cross-product area
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const area = 0.5 * Math.hypot(
      uy * vz - uz * vy,
      uz * vx - ux * vz,
      ux * vy - uy * vx,
    );

    if (!(area > 1e-12)) continue; // degenerate — skip

    // Aspect ratio (equilateral = 1)
    const longest2 = Math.max(sa * sa, sb * sb, sc * sc);
    const aspect = (longest2 * Math.sqrt(3)) / (4 * area);
    if (aspect > aspectMax) aspectMax = aspect;

    // Min interior angle
    const minA = Math.min(
      cosAngle(sb, sc, sa),
      cosAngle(sa, sc, sb),
      cosAngle(sa, sb, sc),
    );
    minAngles.push(minA);
  }

  if (minAngles.length === 0) {
    return { aspectMax: 0, pctMinAngleBelow10: 0, minAngleP50: 0 };
  }

  minAngles.sort((a, b) => a - b);
  const n = minAngles.length;
  const below10 = minAngles.filter((a) => a < 10).length;
  const p50idx = Math.floor(n * 0.5);
  const minAngleP50 = minAngles[Math.min(p50idx, n - 1)];

  return {
    aspectMax,
    pctMinAngleBelow10: (below10 / n) * 100,
    minAngleP50,
  };
}

/** 3D Euclidean distance between two points. */
function edgeLen(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2);
}

/** Interior angle (degrees) opposite `opp`, given adjacent side lengths `adj1`, `adj2`. */
function cosAngle(adj1: number, adj2: number, opp: number): number {
  if (adj1 <= 0 || adj2 <= 0) return 0;
  let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  if (cos > 1) cos = 1;
  if (cos < -1) cos = -1;
  return (Math.acos(cos) * 180) / Math.PI;
}

// ── lateralWobbleMm ───────────────────────────────────────────────────────────

/**
 * Compute the perpendicular (lateral) deviation of a boundary polyline from a
 * reference locus, both expressed in (u, t) parameter space.
 *
 * For each boundary point, finds the nearest point on the locus polyline
 * (sampled at 512 points) and computes the 2D distance in mm (using the
 * supplied uToMm and tToMm scale factors). Returns the 99th-percentile and
 * maximum distance.
 *
 * @param boundary  Array of (u, t) coordinates on the boundary polyline.
 * @param locus     Function u → [u, t] defining the reference locus.
 * @param uToMm     Scale factor: 1 unit of u = uToMm millimetres.
 * @param tToMm     Scale factor: 1 unit of t = tToMm millimetres.
 */
export function lateralWobbleMm(
  boundary: Array<[number, number]>,
  locus: (u: number) => [number, number],
  uToMm: number,
  tToMm: number,
): LateralWobbleResult {
  if (boundary.length === 0) return { p99: 0, max: 0 };

  // Sample the locus densely: 512 segments + endpoints
  const LOCUS_SAMPLES = 512;
  const locusPts: Array<[number, number]> = [];
  for (let i = 0; i <= LOCUS_SAMPLES; i++) {
    const u = i / LOCUS_SAMPLES;
    locusPts.push(locus(u));
  }

  const distances: number[] = [];
  for (const [bu, bt] of boundary) {
    let minDist = Infinity;
    // Check distance to each locus segment
    for (let s = 0; s < locusPts.length - 1; s++) {
      const [lu0, lt0] = locusPts[s];
      const [lu1, lt1] = locusPts[s + 1];
      const d = pointToSegmentDistMm(bu, bt, lu0, lt0, lu1, lt1, uToMm, tToMm);
      if (d < minDist) minDist = d;
    }
    // Also check against the last point directly
    if (minDist === Infinity) {
      const [lu, lt] = locusPts[locusPts.length - 1];
      minDist = ptDistMm(bu, bt, lu, lt, uToMm, tToMm);
    }
    distances.push(minDist);
  }

  distances.sort((a, b) => a - b);
  const n = distances.length;
  const maxDist = distances[n - 1];
  const p99idx = Math.min(n - 1, Math.floor(n * 0.99));
  const p99 = distances[p99idx];

  return { p99, max: maxDist };
}

/** Perpendicular distance (mm) from point (pu, pt) to segment [(u0,t0)→(u1,t1)]. */
function pointToSegmentDistMm(
  pu: number, pt: number,
  u0: number, t0: number,
  u1: number, t1: number,
  uToMm: number, tToMm: number,
): number {
  const dxU = (u1 - u0) * uToMm;
  const dxT = (t1 - t0) * tToMm;
  const len2 = dxU * dxU + dxT * dxT;
  if (len2 < 1e-24) return ptDistMm(pu, pt, u0, t0, uToMm, tToMm);

  // Project point onto segment
  const pxU = (pu - u0) * uToMm;
  const pxT = (pt - t0) * tToMm;
  const param = Math.max(0, Math.min(1, (pxU * dxU + pxT * dxT) / len2));
  const closestU = u0 + param * (u1 - u0);
  const closestT = t0 + param * (t1 - t0);
  return ptDistMm(pu, pt, closestU, closestT, uToMm, tToMm);
}

/** Euclidean distance (mm) between two (u,t) points. */
function ptDistMm(
  au: number, at: number,
  bu: number, bt: number,
  uToMm: number, tToMm: number,
): number {
  return Math.hypot((au - bu) * uToMm, (at - bt) * tToMm);
}
