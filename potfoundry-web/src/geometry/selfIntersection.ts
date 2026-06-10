/**
 * selfIntersection.ts — Plan Task 4.2: geometric self-intersection check.
 *
 * `detectSelfIntersections(mesh)` reports whether any two non-adjacent triangles
 * of a `MeshData` cross each other in 3D. Twisted / high-flare pots are the
 * printability risk: a wall that folds through itself slices into a tangle of
 * shells even though the mesh can still pass the topology gate (watertight,
 * manifold, oriented).
 *
 * This is a NON-BLOCKING, WARNING-level capability. It is intentionally NOT
 * wired into the blocking export gate (`validateMeshForExport` in
 * `exportValidation.ts`). Surfacing path (follow-up): the export flow should
 * call this after assembly and, when `intersects === true`, show a soft warning
 * in the export integrity UI (`ExportIntegrityPanel`, Task 4.1) — e.g.
 * "N self-intersecting triangle pairs (mesh may print as separate shells)" —
 * without preventing the download.
 *
 * Algorithm (≈O(n log n), not O(n²)):
 *   1. Compute each triangle's axis-aligned bounding box (AABB).
 *   2. Bin triangles into a uniform spatial hash grid sized to the mean AABB
 *      extent (so each triangle touches O(1) cells on average).
 *   3. For each candidate pair sharing a cell, run a tolerant Möller
 *      triangle–triangle overlap test. Pairs that share a vertex index, or whose
 *      vertices are geometrically coincident (welded seams, shared edges of the
 *      legitimate tessellation), are skipped so neighbours are never flagged.
 *
 * The geometric test is a tolerant float test (no exact predicates): adequate
 * for a warning-level check. `robust-predicates` is not a project dependency;
 * if exact robustness is later required, swap the orientation primitives only.
 */

import type { MeshData } from './types';

/** Result of a self-intersection scan. */
export interface SelfIntersectionResult {
  /** True when at least one non-adjacent triangle pair crosses in 3D. */
  intersects: boolean;
  /** Number of crossing triangle pairs found (capped by `maxPairs`). */
  count: number;
  /**
   * Up to `sampleLimit` example crossing pairs as `[triA, triB]` triangle
   * indices, for diagnostics / UI surfacing. Omitted when `count === 0`.
   */
  samplePairs?: Array<[number, number]>;
}

/** Tuning knobs (all optional; defaults are export-grade). */
export interface SelfIntersectionOptions {
  /**
   * Absolute distance (mm) under which two vertex positions are treated as the
   * same point — used to detect welded/shared geometry so neighbouring
   * triangles are not reported. Defaults to 1e-4 mm.
   */
  weldToleranceMm?: number;
  /**
   * Stop scanning once this many crossing pairs have been found (keeps the
   * worst case bounded on pathologically tangled meshes). Defaults to 10000.
   */
  maxPairs?: number;
  /** How many example pairs to return in `samplePairs`. Defaults to 8. */
  sampleLimit?: number;
}

const DEFAULT_WELD_TOLERANCE_MM = 1e-4;
const DEFAULT_MAX_PAIRS = 10000;
const DEFAULT_SAMPLE_LIMIT = 8;
/** Relative epsilon for coplanar / on-edge tolerance in the overlap test. */
const COPLANAR_EPS = 1e-9;

type Vec3 = readonly [number, number, number];

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Detect 3D self-intersections (non-adjacent triangle pairs that cross).
 *
 * @param mesh   Triangle mesh (flat positions + triangle indices).
 * @param options Tolerances / limits.
 */
export function detectSelfIntersections(
  mesh: MeshData,
  options: SelfIntersectionOptions = {},
): SelfIntersectionResult {
  const weldTol = options.weldToleranceMm ?? DEFAULT_WELD_TOLERANCE_MM;
  const weldTol2 = weldTol * weldTol;
  const maxPairs = options.maxPairs ?? DEFAULT_MAX_PAIRS;
  const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;

  const { vertices, indices } = mesh;
  const triCount = Math.floor(indices.length / 3);
  if (triCount < 2) {
    return { intersects: false, count: 0 };
  }

  // --- Pass 1: per-triangle vertex indices, vertices, and AABBs. -----------
  const triA = new Float64Array(triCount * 3);
  const triB = new Float64Array(triCount * 3);
  const triC = new Float64Array(triCount * 3);
  const triIdx = new Uint32Array(triCount * 3);
  const minB = new Float64Array(triCount * 3);
  const maxB = new Float64Array(triCount * 3);

  let sumExtent = 0;
  let extentSamples = 0;
  let gMinX = Infinity, gMinY = Infinity, gMinZ = Infinity;

  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3];
    const i1 = indices[t * 3 + 1];
    const i2 = indices[t * 3 + 2];
    triIdx[t * 3] = i0;
    triIdx[t * 3 + 1] = i1;
    triIdx[t * 3 + 2] = i2;

    const ax = vertices[i0 * 3], ay = vertices[i0 * 3 + 1], az = vertices[i0 * 3 + 2];
    const bx = vertices[i1 * 3], by = vertices[i1 * 3 + 1], bz = vertices[i1 * 3 + 2];
    const cx = vertices[i2 * 3], cy = vertices[i2 * 3 + 1], cz = vertices[i2 * 3 + 2];

    triA[t * 3] = ax; triA[t * 3 + 1] = ay; triA[t * 3 + 2] = az;
    triB[t * 3] = bx; triB[t * 3 + 1] = by; triB[t * 3 + 2] = bz;
    triC[t * 3] = cx; triC[t * 3 + 1] = cy; triC[t * 3 + 2] = cz;

    const lo0 = Math.min(ax, bx, cx);
    const lo1 = Math.min(ay, by, cy);
    const lo2 = Math.min(az, bz, cz);
    const hi0 = Math.max(ax, bx, cx);
    const hi1 = Math.max(ay, by, cy);
    const hi2 = Math.max(az, bz, cz);
    minB[t * 3] = lo0; minB[t * 3 + 1] = lo1; minB[t * 3 + 2] = lo2;
    maxB[t * 3] = hi0; maxB[t * 3 + 1] = hi1; maxB[t * 3 + 2] = hi2;

    if (Number.isFinite(lo0) && Number.isFinite(hi0)) {
      sumExtent += (hi0 - lo0) + (hi1 - lo1) + (hi2 - lo2);
      extentSamples += 3;
      gMinX = Math.min(gMinX, lo0);
      gMinY = Math.min(gMinY, lo1);
      gMinZ = Math.min(gMinZ, lo2);
    }
  }

  if (!Number.isFinite(gMinX)) {
    // All triangles degenerate / non-finite — nothing meaningful to test.
    return { intersects: false, count: 0 };
  }

  // Cell size: mean per-axis AABB extent (clamped away from zero). This makes
  // each triangle span O(1) cells on average → near-linear binning.
  let cell = extentSamples > 0 ? sumExtent / extentSamples : 1;
  if (!(cell > 0) || !Number.isFinite(cell)) cell = 1;
  const invCell = 1 / cell;

  // --- Pass 2: bin triangles into a sparse spatial hash. -------------------
  const buckets = new Map<number, number[]>();
  const cellKey = (cx: number, cy: number, cz: number): number => {
    // Cantor-ish hash of three (possibly large) integer cell coords.
    let h = (cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791);
    h = h >>> 0;
    return h;
  };

  const cellOf = (v: number, origin: number): number =>
    Math.floor((v - origin) * invCell);

  for (let t = 0; t < triCount; t++) {
    const cx0 = cellOf(minB[t * 3], gMinX);
    const cy0 = cellOf(minB[t * 3 + 1], gMinY);
    const cz0 = cellOf(minB[t * 3 + 2], gMinZ);
    const cx1 = cellOf(maxB[t * 3], gMinX);
    const cy1 = cellOf(maxB[t * 3 + 1], gMinY);
    const cz1 = cellOf(maxB[t * 3 + 2], gMinZ);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const key = cellKey(cx, cy, cz);
          const arr = buckets.get(key);
          if (arr) arr.push(t);
          else buckets.set(key, [t]);
        }
      }
    }
  }

  // --- Pass 3: candidate pairs (same cell) → tolerant overlap test. --------
  // A pair may share several cells; dedupe with a "seen" set keyed on the pair.
  const tested = new Set<number>();
  let count = 0;
  const samplePairs: Array<[number, number]> = [];

  const pairKey = (a: number, b: number): number => a * triCount + b;

  const adjacentOrCoincident = (ta: number, tb: number): boolean => {
    // Share a topological vertex index?
    for (let i = 0; i < 3; i++) {
      const va = triIdx[ta * 3 + i];
      for (let j = 0; j < 3; j++) {
        if (va === triIdx[tb * 3 + j]) return true;
      }
    }
    // Geometrically coincident vertices (welded seam / shared edge)?
    const a = [
      [triA[ta * 3], triA[ta * 3 + 1], triA[ta * 3 + 2]],
      [triB[ta * 3], triB[ta * 3 + 1], triB[ta * 3 + 2]],
      [triC[ta * 3], triC[ta * 3 + 1], triC[ta * 3 + 2]],
    ];
    const b = [
      [triA[tb * 3], triA[tb * 3 + 1], triA[tb * 3 + 2]],
      [triB[tb * 3], triB[tb * 3 + 1], triB[tb * 3 + 2]],
      [triC[tb * 3], triC[tb * 3 + 1], triC[tb * 3 + 2]],
    ];
    let shared = 0;
    for (const pa of a) {
      for (const pb of b) {
        const dx = pa[0] - pb[0];
        const dy = pa[1] - pb[1];
        const dz = pa[2] - pb[2];
        if (dx * dx + dy * dy + dz * dz <= weldTol2) {
          shared++;
          break;
        }
      }
    }
    // Sharing a vertex or an edge means they are legitimate neighbours.
    return shared >= 1;
  };

  outer:
  for (const arr of buckets.values()) {
    const n = arr.length;
    if (n < 2) continue;
    for (let i = 0; i < n; i++) {
      const ta = arr[i];
      for (let j = i + 1; j < n; j++) {
        const tb = arr[j];
        const lo = ta < tb ? ta : tb;
        const hi = ta < tb ? tb : ta;
        const pk = pairKey(lo, hi);
        if (tested.has(pk)) continue;
        tested.add(pk);

        // Cheap AABB reject (cell membership only proves AABB-cell overlap).
        if (
          minB[lo * 3] > maxB[hi * 3] || maxB[lo * 3] < minB[hi * 3] ||
          minB[lo * 3 + 1] > maxB[hi * 3 + 1] || maxB[lo * 3 + 1] < minB[hi * 3 + 1] ||
          minB[lo * 3 + 2] > maxB[hi * 3 + 2] || maxB[lo * 3 + 2] < minB[hi * 3 + 2]
        ) {
          continue;
        }

        if (adjacentOrCoincident(lo, hi)) continue;

        if (trianglesIntersect(lo, hi, triA, triB, triC)) {
          count++;
          if (samplePairs.length < sampleLimit) samplePairs.push([lo, hi]);
          if (count >= maxPairs) break outer;
        }
      }
    }
  }

  if (count === 0) {
    return { intersects: false, count: 0 };
  }
  return { intersects: true, count, samplePairs };
}

/**
 * Tolerant Möller triangle–triangle overlap test (interval-on-line-of-
 * intersection method). Returns true when the two triangles cross in 3D.
 *
 * Triangles are read from the flat per-triangle vertex buffers by index.
 */
function trianglesIntersect(
  ta: number,
  tb: number,
  bufA: Float64Array,
  bufB: Float64Array,
  bufC: Float64Array,
): boolean {
  const a0: Vec3 = [bufA[ta * 3], bufA[ta * 3 + 1], bufA[ta * 3 + 2]];
  const a1: Vec3 = [bufB[ta * 3], bufB[ta * 3 + 1], bufB[ta * 3 + 2]];
  const a2: Vec3 = [bufC[ta * 3], bufC[ta * 3 + 1], bufC[ta * 3 + 2]];
  const b0: Vec3 = [bufA[tb * 3], bufA[tb * 3 + 1], bufA[tb * 3 + 2]];
  const b1: Vec3 = [bufB[tb * 3], bufB[tb * 3 + 1], bufB[tb * 3 + 2]];
  const b2: Vec3 = [bufC[tb * 3], bufC[tb * 3 + 1], bufC[tb * 3 + 2]];

  // Plane of triangle B: N2 · X + d2 = 0
  const n2 = cross(sub(b1, b0), sub(b2, b0));
  const d2 = -dot(n2, b0);
  const scale2 = Math.max(1e-30, dot(n2, n2));
  // Signed distances of A's vertices to B's plane.
  let da0 = dot(n2, a0) + d2;
  let da1 = dot(n2, a1) + d2;
  let da2 = dot(n2, a2) + d2;
  const epsA = COPLANAR_EPS * Math.sqrt(scale2);
  if (Math.abs(da0) < epsA) da0 = 0;
  if (Math.abs(da1) < epsA) da1 = 0;
  if (Math.abs(da2) < epsA) da2 = 0;
  // All on the same side (and none on the plane) → no overlap.
  if (da0 * da1 > 0 && da0 * da2 > 0) return false;
  if (da0 === 0 && da1 === 0 && da2 === 0) {
    // Coplanar — handle with a 2D coplanar test.
    return coplanarOverlap(a0, a1, a2, b0, b1, b2, n2);
  }

  // Plane of triangle A: N1 · X + d1 = 0
  const n1 = cross(sub(a1, a0), sub(a2, a0));
  const d1 = -dot(n1, a0);
  const scale1 = Math.max(1e-30, dot(n1, n1));
  let db0 = dot(n1, b0) + d1;
  let db1 = dot(n1, b1) + d1;
  let db2 = dot(n1, b2) + d1;
  const epsB = COPLANAR_EPS * Math.sqrt(scale1);
  if (Math.abs(db0) < epsB) db0 = 0;
  if (Math.abs(db1) < epsB) db1 = 0;
  if (Math.abs(db2) < epsB) db2 = 0;
  if (db0 * db1 > 0 && db0 * db2 > 0) return false;

  // Direction of the line of intersection of the two planes.
  const dLine = cross(n1, n2);
  // Project onto the dominant axis of dLine for the interval computation.
  let axis = 0;
  let amax = Math.abs(dLine[0]);
  if (Math.abs(dLine[1]) > amax) { amax = Math.abs(dLine[1]); axis = 1; }
  if (Math.abs(dLine[2]) > amax) { amax = Math.abs(dLine[2]); axis = 2; }
  if (amax < 1e-30) {
    // Planes parallel but not coplanar (already handled) — no crossing.
    return false;
  }

  const pa0 = a0[axis], pa1 = a1[axis], pa2 = a2[axis];
  const pb0 = b0[axis], pb1 = b1[axis], pb2 = b2[axis];

  const intervalA = planeInterval(pa0, pa1, pa2, da0, da1, da2);
  const intervalB = planeInterval(pb0, pb1, pb2, db0, db1, db2);
  if (!intervalA || !intervalB) return false;

  const [aLo, aHi] = intervalA;
  const [bLo, bHi] = intervalB;
  // Open-ish overlap: require a strictly positive overlap so triangles that
  // merely touch at a shared boundary point are not counted.
  return aHi > bLo + 0 && bHi > aLo + 0 && !(aHi <= bLo || bHi <= aLo);
}

/**
 * Compute the [t0, t1] parameter interval where a triangle (given its three
 * projected coordinates `p*` and its three signed plane distances `d*`)
 * crosses the line of plane intersection. Returns null if the triangle does not
 * straddle the plane.
 */
function planeInterval(
  p0: number, p1: number, p2: number,
  d0: number, d1: number, d2: number,
): [number, number] | null {
  // Order so that the "lone" vertex (opposite side) is isolated.
  // Identify which two are on the same side.
  const s0 = Math.sign(d0);
  const s1 = Math.sign(d1);
  const s2 = Math.sign(d2);

  // Collect the two edges that cross the plane and their parametric points.
  const ts: number[] = [];
  const addCross = (pa: number, pb: number, dposa: number, dposb: number): void => {
    if ((dposa > 0 && dposb < 0) || (dposa < 0 && dposb > 0)) {
      const tt = pa + (pb - pa) * (dposa / (dposa - dposb));
      ts.push(tt);
    } else if (dposa === 0) {
      ts.push(pa);
    } else if (dposb === 0) {
      ts.push(pb);
    }
  };

  // Edges: 0-1, 1-2, 2-0. Only consider edges that genuinely straddle.
  if (s0 !== s1 || d0 === 0 || d1 === 0) addCross(p0, p1, d0, d1);
  if (s1 !== s2 || d1 === 0 || d2 === 0) addCross(p1, p2, d1, d2);
  if (s2 !== s0 || d2 === 0 || d0 === 0) addCross(p2, p0, d2, d0);

  if (ts.length < 2) return null;
  let lo = ts[0];
  let hi = ts[0];
  for (let k = 1; k < ts.length; k++) {
    if (ts[k] < lo) lo = ts[k];
    if (ts[k] > hi) hi = ts[k];
  }
  return [lo, hi];
}

/**
 * 2D coplanar triangle-overlap test (both triangles lie in plane with normal
 * `n`). Projects to the dominant plane and tests edge crossings + containment.
 */
function coplanarOverlap(
  a0: Vec3, a1: Vec3, a2: Vec3,
  b0: Vec3, b1: Vec3, b2: Vec3,
  n: Vec3,
): boolean {
  // Drop the dominant axis of the normal to project to 2D.
  const nx = Math.abs(n[0]), ny = Math.abs(n[1]), nz = Math.abs(n[2]);
  let ix = 0, iy = 1;
  if (nx >= ny && nx >= nz) { ix = 1; iy = 2; }
  else if (ny >= nx && ny >= nz) { ix = 0; iy = 2; }
  else { ix = 0; iy = 1; }

  const A: Array<[number, number]> = [
    [a0[ix], a0[iy]], [a1[ix], a1[iy]], [a2[ix], a2[iy]],
  ];
  const B: Array<[number, number]> = [
    [b0[ix], b0[iy]], [b1[ix], b1[iy]], [b2[ix], b2[iy]],
  ];

  // Edge-edge crossing between any A edge and any B edge.
  for (let i = 0; i < 3; i++) {
    const a = A[i], b = A[(i + 1) % 3];
    for (let j = 0; j < 3; j++) {
      const c = B[j], d = B[(j + 1) % 3];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  // Containment: a vertex of one inside the other.
  if (pointInTri(A[0], B[0], B[1], B[2])) return true;
  if (pointInTri(B[0], A[0], A[1], A[2])) return true;
  return false;
}

function segmentsCross(
  p: readonly [number, number], q: readonly [number, number],
  r: readonly [number, number], s: readonly [number, number],
): boolean {
  const d1 = orient2d(r, s, p);
  const d2 = orient2d(r, s, q);
  const d3 = orient2d(p, q, r);
  const d4 = orient2d(p, q, s);
  // Strict crossing only (touching endpoints do not count).
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function orient2d(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTri(
  p: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): boolean {
  const d1 = orient2d(a, b, p);
  const d2 = orient2d(b, c, p);
  const d3 = orient2d(c, a, p);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  // Strictly inside (not on an edge).
  return !(hasNeg && hasPos);
}
