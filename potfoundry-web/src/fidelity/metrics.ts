/**
 * Pure 3D export-fidelity metrics (SP0). No DOM, no GPU, no app imports beyond types.
 * Trusted via vitest unit tests, then run in-page by the fidelity window hook.
 */
import { ASPECT_MAX } from './types';
import type { FidelityMetrics, MeshView, RTrue } from './types';

const TAU = 2 * Math.PI;

/** Default upper bound for expensive sag test triangles in large fidelity runs. */
const DEFAULT_SAG_TRIANGLE_SAMPLE_LIMIT = 64_000;

/** Default upper bound for 3D triangle-quality scoring in large fidelity runs. */
const DEFAULT_QUALITY_TRIANGLE_SAMPLE_LIMIT = 256_000;

/** Default upper bound for reference triangles indexed by nearest-surface sag. */
const DEFAULT_NEAREST_REFERENCE_TRIANGLE_SAMPLE_LIMIT = 256_000;

/** Include every reference orientation in the downsampled nearest-surface index. */
const ALL_REFERENCE_ORIENTATIONS_COS = 0;

/** Local cell-ring budget before nearest-surface queries switch to fallback sampling. */
const DEFAULT_NEAREST_SURFACE_MAX_SEARCH_RING = 2;

/** Fallback reference-triangle budget for sparse nearest-surface index misses. */
const DEFAULT_NEAREST_SURFACE_FALLBACK_TRIANGLE_LIMIT = 4_096;

export interface RadialReferenceOptions {
  thetaBins?: number; // default 720
  zBins?: number;     // default 400
}

export interface RadialReference {
  rTrue: RTrue;
  binThetaRad: number;
  binZmm: number;
}

/**
 * Build an R_true(θ, z) lookup from dense-mesh vertices (which lie on the
 * analytic surface). Bins radius into a (θ, z) grid, fills empty cells by
 * iterative dilation, then bilinearly interpolates with θ wrap-around.
 */
export function buildRadialReference(
  denseVertices: Float32Array,
  options: RadialReferenceOptions = {},
): RadialReference {
  const nTheta = options.thetaBins ?? 720;
  const nZ = options.zBins ?? 400;
  const n = denseVertices.length / 3;

  if (n === 0) {
    throw new Error('buildRadialReference: empty dense vertex set');
  }
  if (nTheta < 2 || nZ < 2) {
    throw new Error(
      `buildRadialReference: bin dimensions must be >= 2 (got thetaBins=${nTheta}, zBins=${nZ})`,
    );
  }

  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < n; i++) {
    const z = denseVertices[i * 3 + 2];
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const zSpan = Math.max(zMax - zMin, 1e-9);

  const sum = new Float64Array(nTheta * nZ);
  const cnt = new Uint32Array(nTheta * nZ);

  for (let i = 0; i < n; i++) {
    const x = denseVertices[i * 3];
    const y = denseVertices[i * 3 + 1];
    const z = denseVertices[i * 3 + 2];
    const r = Math.hypot(x, y);
    let th = Math.atan2(y, x);
    if (th < 0) th += TAU;
    let ti = Math.floor((th / TAU) * nTheta);
    if (ti >= nTheta) ti = nTheta - 1;
    let zi = Math.floor(((z - zMin) / zSpan) * nZ);
    if (zi < 0) zi = 0;
    if (zi >= nZ) zi = nZ - 1;
    const idx = zi * nTheta + ti;
    sum[idx] += r;
    cnt[idx] += 1;
  }

  // Cell averages; -1 marks empty.
  const grid = new Float64Array(nTheta * nZ);
  for (let k = 0; k < grid.length; k++) {
    grid[k] = cnt[k] > 0 ? sum[k] / cnt[k] : -1;
  }
  dilateFillEmpty(grid, nTheta, nZ);

  for (let k = 0; k < grid.length; k++) {
    if (grid[k] < 0) {
      throw new Error('buildRadialReference: reference grid has unfillable empty cells');
    }
  }

  const binThetaRad = TAU / nTheta;
  const binZmm = zSpan / nZ;

  const cellAt = (ti: number, zi: number): number => {
    const t = ((ti % nTheta) + nTheta) % nTheta; // wrap θ (periodic)
    const z = zi < 0 ? 0 : zi >= nZ ? nZ - 1 : zi; // defensive z clamp
    return grid[z * nTheta + t];
  };

  const rTrue: RTrue = (theta, z) => {
    let th = theta % TAU;
    if (th < 0) th += TAU;
    // -0.5 shifts to cell centers: a bin holds samples in [k, k+1), so its
    // value represents position k+0.5. θ is periodic (wraps); z is bounded.
    const tf = (th / TAU) * nTheta - 0.5;
    const zf = ((z - zMin) / zSpan) * nZ - 0.5;
    const ti0 = Math.floor(tf);
    // Clamp the base z-cell so the upper cell (zi0+1) stays in range; zw is then
    // allowed outside [0,1] at the z extremes, yielding linear extrapolation.
    // This removes the half-bin clamp bias at the rim/base against the gradient.
    let zi0 = Math.floor(zf);
    if (zi0 < 0) zi0 = 0;
    else if (zi0 > nZ - 2) zi0 = nZ - 2;
    const tw = tf - ti0;
    const zw = zf - zi0;
    const c00 = cellAt(ti0, zi0);
    const c10 = cellAt(ti0 + 1, zi0);
    const c01 = cellAt(ti0, zi0 + 1);
    const c11 = cellAt(ti0 + 1, zi0 + 1);
    const top = c00 * (1 - tw) + c10 * tw;
    const bot = c01 * (1 - tw) + c11 * tw;
    return top * (1 - zw) + bot * zw;
  };

  return { rTrue, binThetaRad, binZmm };
}

/** Multi-pass nearest-neighbour dilation to fill empty (-1) cells in place. */
function dilateFillEmpty(grid: Float64Array, nTheta: number, nZ: number): void {
  let emptyCount = 0;
  for (let k = 0; k < grid.length; k++) if (grid[k] < 0) emptyCount++;

  let guard = 0;
  while (emptyCount > 0 && guard++ < nTheta + nZ) {
    const next = grid.slice();
    for (let zi = 0; zi < nZ; zi++) {
      for (let ti = 0; ti < nTheta; ti++) {
        const idx = zi * nTheta + ti;
        if (grid[idx] >= 0) continue;
        let acc = 0;
        let num = 0;
        const neigh = [
          [(ti + 1) % nTheta, zi],
          [(ti - 1 + nTheta) % nTheta, zi],
          [ti, Math.min(zi + 1, nZ - 1)],
          [ti, Math.max(zi - 1, 0)],
        ];
        for (const [nt, nz] of neigh) {
          const v = grid[nz * nTheta + nt];
          if (v >= 0) { acc += v; num++; }
        }
        if (num > 0) { next[idx] = acc / num; emptyCount--; }
      }
    }
    grid.set(next);
  }
}

export interface SagResult {
  maxSagMm: number;
  rmsSagMm: number;
}

interface TriangleSample {
  mesh: MeshView;
  triangleCount: number;
  scaleToOriginal: number;
}

function sampleTriangles(mesh: MeshView, maxTriangles: number | undefined): TriangleSample {
  const triangleCount = mesh.indices.length / 3;
  if (
    maxTriangles === undefined ||
    maxTriangles <= 0 ||
    triangleCount <= maxTriangles
  ) {
    return { mesh, triangleCount, scaleToOriginal: 1 };
  }

  const sampleCount = Math.max(1, Math.floor(maxTriangles));
  const sampled = new Uint32Array(sampleCount * 3);
  const stride = triangleCount / sampleCount;
  for (let i = 0; i < sampleCount; i++) {
    const tri = Math.min(triangleCount - 1, Math.floor((i + 0.5) * stride));
    const src = tri * 3;
    const dst = i * 3;
    sampled[dst] = mesh.indices[src];
    sampled[dst + 1] = mesh.indices[src + 1];
    sampled[dst + 2] = mesh.indices[src + 2];
  }

  return {
    mesh: { vertices: mesh.vertices, indices: sampled },
    triangleCount: sampleCount,
    scaleToOriginal: triangleCount / sampleCount,
  };
}

/** Barycentric interior sample weights for a given order (order 4 → 15 samples). */
function barycentricSamples(order: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  for (let i = 1; i < order; i++) {
    for (let j = 1; j < order - i; j++) {
      const k = order - i - j;
      if (k < 1) continue;
      out.push([i / order, j / order, k / order]);
    }
  }
  // Fallback to centroid if the order is too small to yield interior points.
  if (out.length === 0) out.push([1 / 3, 1 / 3, 1 / 3]);
  return out;
}

/**
 * Cutoff for the radial-vs-nearest sag split, expressed as |n_z|/|n| (the cosine
 * of the angle between the face normal and the vertical axis). The radial model
 * r=R(θ,z) is single-valued — and the radial sag metric valid — only on
 * near-VERTICAL walls (small |n_z|/|n|). Anywhere the surface tilts toward
 * horizontal (base, drain, rim, AND the sloped foot/base fillet) the radial
 * parameterization folds in z and the metric is degenerate, so triangles at or
 * above this cosine are measured by true nearest-surface distance instead.
 * Set above the flared-wall band (a wall flaring Rb→Rt over H sits near ~0.2)
 * so ordinary walls stay on the cheap radial path with margin.
 */
const NEAR_VERTICAL_COS = 0.35;

/** Spatial index over reference triangles, queryable by nearest-surface distance. */
export interface NearestSurface {
  /** Squared distance from (px,py,pz) to the closest reference triangle. */
  nearestDist2(px: number, py: number, pz: number): number;
}

export interface NearestSurfaceOptions {
  /** |n_z|/|n| at/above which a reference triangle is indexed (non-vertical). */
  minNonVerticalCos?: number; // default NEAR_VERTICAL_COS
  /** XY spatial-hash cell size in mm. Small keeps candidates-per-query low on
   *  the dense reference (~0.1mm triangles → a 2mm cell holds a few hundred). */
  cellMm?: number; // default 2
  /** Maximum empty cell rings to scan before using the bounded fallback sample. */
  maxSearchRing?: number;
  /** Reference triangles tested when a sparse query misses the local cell rings. */
  fallbackTriangleLimit?: number;
}

/**
 * Build a nearest-surface index from the dense reference's NON-VERTICAL triangles
 * (base/drain/rim discs and the sloped foot/base fillet — everything where the
 * radial metric is degenerate). Triangles are hashed by their XY bounding box
 * into a uniform grid; nearestDist2 searches the query cell outward in rings
 * until a candidate is found (plus one safety ring), using exact closest-point-
 * on-triangle distance. Near-vertical walls are excluded — they stay on the
 * cheap radial path, which keeps the dense wall bulk out of the index.
 */
export function buildNearestSurface(
  denseVertices: Float32Array,
  denseIndices: Uint32Array,
  options: NearestSurfaceOptions = {},
): NearestSurface {
  const minNonVerticalCos = options.minNonVerticalCos ?? NEAR_VERTICAL_COS;
  const cell = options.cellMm ?? 2;
  const maxSearchRing = options.maxSearchRing ?? DEFAULT_NEAREST_SURFACE_MAX_SEARCH_RING;
  const fallbackTriangleLimit = options.fallbackTriangleLimit ?? DEFAULT_NEAREST_SURFACE_FALLBACK_TRIANGLE_LIMIT;
  const invCell = 1 / cell;

  // Triangle coords (9 per triangle) for the indexed subset.
  const tris: number[] = [];
  // 3D spatial hash: "cx,cy,cz" -> triangle base indices (into tris/9). Adding z
  // to the cell key distributes a tall vertical wall over many z-cells instead of
  // stacking every wall triangle into a couple of XY columns — which is what makes
  // a full (minNonVerticalCos:0) index over a dense wall feasible to query.
  const cellMap = new Map<string, number[]>();

  const addToCell = (cx: number, cy: number, cz: number, triBase: number): void => {
    const key = `${cx},${cy},${cz}`;
    let list = cellMap.get(key);
    if (!list) { list = []; cellMap.set(key, list); }
    list.push(triBase);
  };

  for (let t = 0; t < denseIndices.length; t += 3) {
    const ia = denseIndices[t] * 3;
    const ib = denseIndices[t + 1] * 3;
    const ic = denseIndices[t + 2] * 3;
    const ax = denseVertices[ia], ay = denseVertices[ia + 1], az = denseVertices[ia + 2];
    const bx = denseVertices[ib], by = denseVertices[ib + 1], bz = denseVertices[ib + 2];
    const cx = denseVertices[ic], cy = denseVertices[ic + 1], cz = denseVertices[ic + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const nlen = Math.hypot(nx, ny, nz);
    if (nlen <= 1e-12) continue; // degenerate
    if (Math.abs(nz) / nlen < minNonVerticalCos) continue; // near-vertical wall → radial path

    const triBase = tris.length / 9;
    tris.push(ax, ay, az, bx, by, bz, cx, cy, cz);

    const minCx = Math.floor(Math.min(ax, bx, cx) * invCell);
    const maxCx = Math.floor(Math.max(ax, bx, cx) * invCell);
    const minCy = Math.floor(Math.min(ay, by, cy) * invCell);
    const maxCy = Math.floor(Math.max(ay, by, cy) * invCell);
    const minCz = Math.floor(Math.min(az, bz, cz) * invCell);
    const maxCz = Math.floor(Math.max(az, bz, cz) * invCell);
    for (let gx = minCx; gx <= maxCx; gx++) {
      for (let gy = minCy; gy <= maxCy; gy++) {
        for (let gz = minCz; gz <= maxCz; gz++) addToCell(gx, gy, gz, triBase);
      }
    }
  }

  const triCount = tris.length / 9;
  const fallbackTriBases = buildFallbackTriBases(triCount, fallbackTriangleLimit);

  const distToTri = (px: number, py: number, pz: number, triBase: number): number => {
    const o = triBase * 9;
    return closestPtTriDist2(
      px, py, pz,
      tris[o], tris[o + 1], tris[o + 2],
      tris[o + 3], tris[o + 4], tris[o + 5],
      tris[o + 6], tris[o + 7], tris[o + 8],
    );
  };

  return {
    nearestDist2(px: number, py: number, pz: number): number {
      if (triCount === 0) return Infinity;
      const qx = Math.floor(px * invCell);
      const qy = Math.floor(py * invCell);
      const qz = Math.floor(pz * invCell);
      let best = Infinity;
      let foundRing = -1;
      // Expand in cube shells; once a candidate is found, search one more shell
      // (a closer triangle can sit just across a cell boundary) then stop.
      for (let ring = 0; ring <= maxSearchRing; ring++) {
        if (foundRing >= 0 && ring > foundRing + 1) break;
        for (let gx = qx - ring; gx <= qx + ring; gx++) {
          for (let gy = qy - ring; gy <= qy + ring; gy++) {
            for (let gz = qz - ring; gz <= qz + ring; gz++) {
              // Only the shell surface is new on each iteration (skip the interior).
              if (
                ring > 0 &&
                gx > qx - ring && gx < qx + ring &&
                gy > qy - ring && gy < qy + ring &&
                gz > qz - ring && gz < qz + ring
              ) {
                continue;
              }
              const list = cellMap.get(`${gx},${gy},${gz}`);
              if (!list) continue;
              for (const triBase of list) {
                const d2 = distToTri(px, py, pz, triBase);
                if (d2 < best) best = d2;
              }
              if (list.length > 0 && foundRing < 0) foundRing = ring;
            }
          }
        }
      }
      // Fallback: sparse/extreme query that missed every populated local ring.
      // This is deliberately sampled so downscaled metric runs stay bounded.
      if (best === Infinity) {
        for (const triBase of fallbackTriBases) {
          const d2 = distToTri(px, py, pz, triBase);
          if (d2 < best) best = d2;
        }
      }
      return best;
    },
  };
}

function buildFallbackTriBases(triCount: number, fallbackTriangleLimit: number): Uint32Array {
  if (triCount === 0) return new Uint32Array(0);
  if (fallbackTriangleLimit <= 0 || triCount <= fallbackTriangleLimit) {
    const all = new Uint32Array(triCount);
    for (let triBase = 0; triBase < triCount; triBase++) all[triBase] = triBase;
    return all;
  }
  const sampleCount = Math.max(1, Math.floor(fallbackTriangleLimit));
  const out = new Uint32Array(sampleCount);
  const stride = triCount / sampleCount;
  for (let i = 0; i < sampleCount; i++) {
    out[i] = Math.min(triCount - 1, Math.floor((i + 0.5) * stride));
  }
  return out;
}

/** Squared distance between two points. */
function pointDist2(
  px: number, py: number, pz: number,
  qx: number, qy: number, qz: number,
): number {
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Squared distance from point P to triangle ABC. Ericson, "Real-Time Collision
 * Detection" §5.1.5 (closest point on triangle via Voronoi regions of the
 * vertices, edges, and face interior).
 */
function closestPtTriDist2(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return pointDist2(px, py, pz, ax, ay, az); // vertex A

  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return pointDist2(px, py, pz, bx, by, bz); // vertex B

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { // edge AB
    const v = d1 / (d1 - d3);
    return pointDist2(px, py, pz, ax + v * abx, ay + v * aby, az + v * abz);
  }

  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return pointDist2(px, py, pz, cx, cy, cz); // vertex C

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { // edge AC
    const w = d2 / (d2 - d6);
    return pointDist2(px, py, pz, ax + w * acx, ay + w * acy, az + w * acz);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { // edge BC
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return pointDist2(px, py, pz, bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz));
  }

  // Inside face region — project onto the plane via barycentric coords.
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return pointDist2(
    px, py, pz,
    ax + abx * v + acx * w,
    ay + aby * v + acy * w,
    az + abz * v + acz * w,
  );
}

/**
 * Per-triangle sag vs the reference. Each test triangle is classified by its
 * face normal: non-vertical triangles (|n_z|/|n| >= NEAR_VERTICAL_COS — base,
 * drain, rim, AND the sloped foot/base fillet), when a `nearestSurface` is
 * supplied, are measured by true nearest-surface distance, because the radial
 * metric is degenerate wherever the surface tilts off vertical. Near-vertical
 * wall triangles keep the radial deviation |hypot(P.x,P.y) −
 * R_true(atan2(P.y,P.x), P.z)|. Omitting `nearestSurface` preserves the
 * pure-radial behavior exactly.
 */
export function sagDeviation(
  mesh: MeshView,
  rTrue: RTrue,
  order = 4,
  nearestSurface?: NearestSurface,
): SagResult {
  const { vertices, indices } = mesh;
  const samples = barycentricSamples(order);
  let maxSag = 0;
  let sumSq = 0;
  let count = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    let useSurface = false;
    if (nearestSurface !== undefined) {
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const nlen = Math.hypot(nx, ny, nz);
      useSurface = nlen > 1e-12 && Math.abs(nz) / nlen >= NEAR_VERTICAL_COS;
    }

    for (const [wa, wb, wc] of samples) {
      const px = ax * wa + bx * wb + cx * wc;
      const py = ay * wa + by * wb + cy * wc;
      const pz = az * wa + bz * wb + cz * wc;
      let dev: number;
      if (useSurface) {
        dev = Math.sqrt(nearestSurface!.nearestDist2(px, py, pz));
      } else {
        const r = Math.hypot(px, py);
        dev = Math.abs(r - rTrue(Math.atan2(py, px), pz));
      }
      if (dev > maxSag) maxSag = dev;
      sumSq += dev * dev;
      count++;
    }
  }

  return {
    maxSagMm: maxSag,
    rmsSagMm: count > 0 ? Math.sqrt(sumSq / count) : 0,
  };
}

export interface TriangleQualityResult {
  maxAspect3D: number;
  minAngleDeg: number;
  sliverCount: number;
}

export interface TriangleQualityDiagnosticSample {
  triangleIndex: number;
  indices: [number, number, number];
  aspect3D: number;
  minAngleDeg: number;
  edgeLengthsMm: [number, number, number];
  uvs?: [[number, number, number], [number, number, number], [number, number, number]];
}

export interface TriangleQualityDiagnostics extends TriangleQualityResult {
  worst: TriangleQualityDiagnosticSample[];
}

/**
 * Finite aspect sentinel for zero-area (degenerate) triangles. Using a large
 * finite value (not Infinity) keeps every FidelityMetrics field JSON-numeric,
 * so the row survives CDP transfer and the all-numeric baseline contract.
 */
const DEGENERATE_ASPECT = 1e9;

/**
 * 3D triangle quality. aspect = longest²·√3 / (4·area) (1 = equilateral),
 * minAngleDeg = smallest interior angle across non-degenerate triangles,
 * sliverCount = triangles with aspect > ASPECT_MAX (degenerate ones included).
 */
export function triangleQuality3D(mesh: MeshView): TriangleQualityResult {
  const { vertices, indices } = mesh;
  let maxAspect = 0;
  let minAngle = 180;
  let slivers = 0;
  let goodCount = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    const ab2 = dist2(ax, ay, az, bx, by, bz);
    const bc2 = dist2(bx, by, bz, cx, cy, cz);
    const ca2 = dist2(cx, cy, cz, ax, ay, az);
    const longest2 = Math.max(ab2, bc2, ca2);

    // Area via cross product of two edges.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const cxp = uy * vz - uz * vy;
    const cyp = uz * vx - ux * vz;
    const czp = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(cxp, cyp, czp);

    if (area <= 1e-12) {
      // Degenerate triangle: finite sentinel aspect, counts as a sliver, but
      // contributes no interior angle (would otherwise pin minAngle to 0).
      if (DEGENERATE_ASPECT > maxAspect) maxAspect = DEGENERATE_ASPECT;
      slivers++;
      continue;
    }

    const aspect = (longest2 * Math.sqrt(3)) / (4 * area);
    if (aspect > maxAspect) maxAspect = aspect;
    if (aspect > ASPECT_MAX) slivers++;

    const a = Math.sqrt(bc2); // side opposite A
    const b = Math.sqrt(ca2); // side opposite B
    const c = Math.sqrt(ab2); // side opposite C
    const angA = lawOfCosines(b, c, a);
    const angB = lawOfCosines(a, c, b);
    const angC = lawOfCosines(a, b, c);
    const triMin = Math.min(angA, angB, angC);
    if (triMin < minAngle) minAngle = triMin;
    goodCount++;
  }

  return {
    maxAspect3D: maxAspect,
    minAngleDeg: goodCount > 0 ? minAngle : 0,
    sliverCount: slivers,
  };
}

export function triangleQualityDiagnostics(mesh: MeshView, sampleLimit = 16): TriangleQualityDiagnostics {
  const { vertices, indices, uvs } = mesh;
  let maxAspect = 0;
  let minAngle = 180;
  let slivers = 0;
  let goodCount = 0;
  const worst: TriangleQualityDiagnosticSample[] = [];
  const limit = Math.max(0, Math.floor(sampleLimit));

  const trackWorst = (sample: TriangleQualityDiagnosticSample): void => {
    if (limit === 0) return;
    if (worst.length < limit) {
      worst.push(sample);
      worst.sort((a, b) => b.aspect3D - a.aspect3D);
    } else if (sample.aspect3D > worst[worst.length - 1].aspect3D) {
      worst[worst.length - 1] = sample;
      worst.sort((a, b) => b.aspect3D - a.aspect3D);
    }
  };

  for (let t = 0; t < indices.length; t += 3) {
    const aIdx = indices[t];
    const bIdx = indices[t + 1];
    const cIdx = indices[t + 2];
    const ia = aIdx * 3;
    const ib = bIdx * 3;
    const ic = cIdx * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    const ab2 = dist2(ax, ay, az, bx, by, bz);
    const bc2 = dist2(bx, by, bz, cx, cy, cz);
    const ca2 = dist2(cx, cy, cz, ax, ay, az);
    const ab = Math.sqrt(ab2);
    const bc = Math.sqrt(bc2);
    const ca = Math.sqrt(ca2);
    const longest2 = Math.max(ab2, bc2, ca2);

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const cxp = uy * vz - uz * vy;
    const cyp = uz * vx - ux * vz;
    const czp = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(cxp, cyp, czp);

    let aspect = DEGENERATE_ASPECT;
    let triMin = 0;
    if (area > 1e-12) {
      aspect = (longest2 * Math.sqrt(3)) / (4 * area);
      const angA = lawOfCosines(bc, ca, ab);
      const angB = lawOfCosines(ab, ca, bc);
      const angC = lawOfCosines(ab, bc, ca);
      triMin = Math.min(angA, angB, angC);
      if (triMin < minAngle) minAngle = triMin;
      goodCount++;
    }

    if (aspect > maxAspect) maxAspect = aspect;
    if (aspect > ASPECT_MAX) slivers++;
    trackWorst({
      triangleIndex: t / 3,
      indices: [aIdx, bIdx, cIdx],
      aspect3D: aspect,
      minAngleDeg: triMin,
      edgeLengthsMm: [ab, bc, ca],
      uvs: uvs
        ? [
          [uvs[ia], uvs[ia + 1], uvs[ia + 2]],
          [uvs[ib], uvs[ib + 1], uvs[ib + 2]],
          [uvs[ic], uvs[ic + 1], uvs[ic + 2]],
        ]
        : undefined,
    });
  }

  return {
    maxAspect3D: maxAspect,
    minAngleDeg: goodCount > 0 ? minAngle : 0,
    sliverCount: slivers,
    worst,
  };
}

function dist2(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx, dy = ay - by, dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/** Interior angle (degrees) opposite side `opp`, given the two adjacent sides. */
function lawOfCosines(adj1: number, adj2: number, opp: number): number {
  if (adj1 <= 0 || adj2 <= 0) return 0;
  let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  if (cos > 1) cos = 1;
  if (cos < -1) cos = -1;
  return (Math.acos(cos) * 180) / Math.PI;
}

export interface TopologyResult {
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationMismatches: number;
}

export type TopologySampleKind = 'boundary' | 'nonManifold' | 'orientationMismatch';

export interface TopologyEdgeSample {
  kind: TopologySampleKind;
  canonicalA: number;
  canonicalB: number;
  forward: number;
  reverse: number;
  total: number;
  edgeLengthMm: number;
  midpoint: [number, number, number];
  a: [number, number, number];
  b: [number, number, number];
  uvA?: [number, number, number];
  uvB?: [number, number, number];
  firstForwardTriangle: number | null;
  secondForwardTriangle: number | null;
  firstReverseTriangle: number | null;
  secondReverseTriangle: number | null;
}

export interface TopologyDiagnostics extends TopologyResult {
  triangleCount: number;
  vertexCount: number;
  weldToleranceMm: number;
  samples: TopologyEdgeSample[];
}

interface TopologyUse {
  lo: number;
  hi: number;
  forward: number;
  reverse: number;
  firstForwardTriangle: number | null;
  secondForwardTriangle: number | null;
  firstReverseTriangle: number | null;
  secondReverseTriangle: number | null;
}

/**
 * Weld vertices by position quantization, then analyze the directed edge map:
 * - boundaryEdges: undirected edges used by exactly one triangle side.
 * - nonManifoldEdges: undirected edges shared by >2 triangle sides.
 * - orientationMismatches: manifold edges whose two uses point the same way
 *   (i.e. not one forward + one reverse) → inconsistent winding.
 */
export function topologyMetric(mesh: MeshView, weldToleranceMm: number): TopologyResult {
  return summarizeTopologyUses(collectTopologyUses(mesh, weldToleranceMm).uses);
}

export function topologyDiagnostics(
  mesh: MeshView,
  weldToleranceMm: number,
  sampleLimit = 16,
): TopologyDiagnostics {
  const { uses } = collectTopologyUses(mesh, weldToleranceMm);
  const summary = summarizeTopologyUses(uses);
  const samples: TopologyEdgeSample[] = [];

  if (sampleLimit > 0) {
    for (const use of uses.values()) {
      const kind = classifyTopologyUse(use);
      if (!kind) continue;
      samples.push(sampleTopologyEdge(mesh.vertices, mesh.uvs, use, kind));
      if (samples.length >= sampleLimit) break;
    }
  }

  return {
    ...summary,
    triangleCount: mesh.indices.length / 3,
    vertexCount: mesh.vertices.length / 3,
    weldToleranceMm,
    samples,
  };
}

function collectTopologyUses(
  mesh: MeshView,
  weldToleranceMm: number,
): { uses: Map<string, TopologyUse>; remap: Uint32Array } {
  const remap = buildWeldRemap(mesh.vertices, weldToleranceMm);
  const { indices } = mesh;

  // Directed edge usage keyed by "min:max"; track forward/reverse counts.
  const uses = new Map<string, TopologyUse>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    const triangleIndex = t / 3;
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue; // degenerate edge
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      let u = uses.get(key);
      if (!u) {
        u = {
          lo,
          hi,
          forward: 0,
          reverse: 0,
          firstForwardTriangle: null,
          secondForwardTriangle: null,
          firstReverseTriangle: null,
          secondReverseTriangle: null,
        };
        uses.set(key, u);
      }
      if (a === lo) {
        u.forward++;
        if (u.firstForwardTriangle === null) u.firstForwardTriangle = triangleIndex;
        else if (u.secondForwardTriangle === null) u.secondForwardTriangle = triangleIndex;
      } else {
        u.reverse++;
        if (u.firstReverseTriangle === null) u.firstReverseTriangle = triangleIndex;
        else if (u.secondReverseTriangle === null) u.secondReverseTriangle = triangleIndex;
      }
    }
  }

  return { uses, remap };
}

function summarizeTopologyUses(uses: Map<string, TopologyUse>): TopologyResult {
  let boundary = 0;
  let nonManifold = 0;
  let mismatch = 0;
  for (const u of uses.values()) {
    const kind = classifyTopologyUse(u);
    if (kind === 'boundary') boundary++;
    else if (kind === 'nonManifold') nonManifold++;
    else if (kind === 'orientationMismatch') mismatch++;
  }

  return { boundaryEdges: boundary, nonManifoldEdges: nonManifold, orientationMismatches: mismatch };
}

function classifyTopologyUse(u: TopologyUse): TopologySampleKind | null {
  const total = u.forward + u.reverse;
  if (total === 1) return 'boundary';
  if (total > 2) return 'nonManifold';
  if (total === 2 && !(u.forward === 1 && u.reverse === 1)) return 'orientationMismatch';
  return null;
}

function sampleTopologyEdge(
  vertices: Float32Array,
  uvs: Float32Array | undefined,
  use: TopologyUse,
  kind: TopologySampleKind,
): TopologyEdgeSample {
  const ax = vertices[use.lo * 3];
  const ay = vertices[use.lo * 3 + 1];
  const az = vertices[use.lo * 3 + 2];
  const bx = vertices[use.hi * 3];
  const by = vertices[use.hi * 3 + 1];
  const bz = vertices[use.hi * 3 + 2];
  const edgeLengthMm = Math.sqrt(dist2(ax, ay, az, bx, by, bz));
  const sample: TopologyEdgeSample = {
    kind,
    canonicalA: use.lo,
    canonicalB: use.hi,
    forward: use.forward,
    reverse: use.reverse,
    total: use.forward + use.reverse,
    edgeLengthMm,
    midpoint: [(ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5],
    a: [ax, ay, az],
    b: [bx, by, bz],
    firstForwardTriangle: use.firstForwardTriangle,
    secondForwardTriangle: use.secondForwardTriangle,
    firstReverseTriangle: use.firstReverseTriangle,
    secondReverseTriangle: use.secondReverseTriangle,
  };
  if (uvs && use.hi * 3 + 2 < uvs.length) {
    sample.uvA = [uvs[use.lo * 3], uvs[use.lo * 3 + 1], uvs[use.lo * 3 + 2]];
    sample.uvB = [uvs[use.hi * 3], uvs[use.hi * 3 + 1], uvs[use.hi * 3 + 2]];
  }
  return sample;
}

/** Map each vertex index to a canonical welded index via position quantization. */
function buildWeldRemap(vertices: Float32Array, toleranceMm: number): Uint32Array {
  const n = vertices.length / 3;
  const remap = new Uint32Array(n);
  if (toleranceMm <= 0) {
    for (let i = 0; i < n; i++) remap[i] = i;
    return remap;
  }
  const inv = 1 / toleranceMm;
  const buckets = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const qx = Math.round(vertices[i * 3] * inv);
    const qy = Math.round(vertices[i * 3 + 1] * inv);
    const qz = Math.round(vertices[i * 3 + 2] * inv);
    const key = `${qx},${qy},${qz}`;
    const existing = buckets.get(key);
    if (existing === undefined) { buckets.set(key, i); remap[i] = i; }
    else remap[i] = existing;
  }
  return remap;
}

export interface ComputeFidelityArgs {
  styleId: string;
  mesh: MeshView;
  denseVertices: Float32Array;
  /**
   * Reference triangle indices. When supplied, non-vertical surfaces (base/drain/
   * rim and the sloped foot/base fillet) are measured by true nearest-surface
   * distance instead of the degenerate radial metric. Omit to keep the
   * pure-radial measurement.
   */
  denseIndices?: Uint32Array;
  features: { expected: number; present: number };
  weldToleranceMm: number;
  sagSampleOrder?: number;
  /** 0 or negative disables downsampling and measures sag on every test triangle. */
  sagTriangleSampleLimit?: number;
  /** 0 or negative disables downsampling and scores quality on every test triangle. */
  qualityTriangleSampleLimit?: number;
  /** 0 or negative disables downsampling for the nearest-surface reference index. */
  nearestReferenceTriangleSampleLimit?: number;
  referenceTriangleCount?: number;
}

/** Assemble a complete FidelityMetrics row from a mesh-under-test + dense reference. */
export function computeFidelityMetrics(args: ComputeFidelityArgs): FidelityMetrics {
  const { styleId, mesh, denseVertices, denseIndices, features, weldToleranceMm } = args;
  const ref = buildRadialReference(denseVertices);
  const sagMesh = sampleTriangles(
    mesh,
    args.sagTriangleSampleLimit ?? DEFAULT_SAG_TRIANGLE_SAMPLE_LIMIT,
  );
  const qualityMesh = sampleTriangles(
    mesh,
    args.qualityTriangleSampleLimit ?? DEFAULT_QUALITY_TRIANGLE_SAMPLE_LIMIT,
  );
  const nearestReference = denseIndices
    ? sampleTriangles(
      { vertices: denseVertices, indices: denseIndices },
      args.nearestReferenceTriangleSampleLimit ?? DEFAULT_NEAREST_REFERENCE_TRIANGLE_SAMPLE_LIMIT,
    ).mesh.indices
    : undefined;
  const nearestSurface = denseIndices
    ? buildNearestSurface(denseVertices, nearestReference!, {
      minNonVerticalCos: ALL_REFERENCE_ORIENTATIONS_COS,
    })
    : undefined;
  const sag = sagDeviation(sagMesh.mesh, ref.rTrue, args.sagSampleOrder ?? 4, nearestSurface);
  const quality = triangleQuality3D(qualityMesh.mesh);
  const topo = topologyMetric(mesh, weldToleranceMm);
  const dropped = Math.max(0, features.expected - features.present);

  return {
    styleId,
    triangleCount: mesh.indices.length / 3,
    vertexCount: mesh.vertices.length / 3,
    referenceTriangleCount: args.referenceTriangleCount ?? denseVertices.length / 3,
    maxSagMm: sag.maxSagMm,
    rmsSagMm: sag.rmsSagMm,
    sagReferenceBinThetaRad: ref.binThetaRad,
    sagReferenceBinZmm: ref.binZmm,
    maxAspect3D: quality.maxAspect3D,
    minAngleDeg: quality.minAngleDeg,
    sliverCount: Math.round(quality.sliverCount * qualityMesh.scaleToOriginal),
    boundaryEdges: topo.boundaryEdges,
    nonManifoldEdges: topo.nonManifoldEdges,
    orientationMismatches: topo.orientationMismatches,
    featuresExpected: features.expected,
    featuresPresent: features.present,
    featuresDropped: dropped,
  };
}
