/**
 * Pure 3D export-fidelity metrics (SP0). No DOM, no GPU, no app imports beyond types.
 * Trusted via vitest unit tests, then run in-page by the fidelity window hook.
 */
import { ASPECT_MAX, SAG_TOL_MM } from './types';
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

/** Faithful CAD-fidelity result, restricted to the WALL. */
export interface WallDeviationResult {
  /** Worst radial deviation (mm) of a wall sample from the true surface. */
  maxMm: number;
  /** RMS radial deviation (mm) over wall samples. */
  rmsMm: number;
  /** 99th-percentile radial deviation (mm) — robust to a few outliers. */
  p99Mm: number;
  /** Wall samples measured. */
  wallSamples: number;
  /** Wall (near-vertical) triangles measured. */
  wallTriangles: number;
}

/**
 * Faithful CAD-fidelity metric for the WALL surface (the model-truth signal the
 * mixed `sagDeviation` drowns under the drain/cap artifact).
 *
 * Restricts to NEAR-VERTICAL wall triangles and measures the 3D distance of
 * interior barycentric samples to the NEAREST point on the dense true surface
 * (not a radial compare — radial wrongly compares the near-vertical drain and
 * inner wall against the OUTER R_true, the ~35mm artifact). Each sample is scored
 * against ITS OWN nearest true surface, so inner wall / drain follow their own
 * geometry (≈0) and only the OUTER ridge chord-error shows: mesh VERTICES lie on
 * the true surface (≈0), but a flat triangle chord-cuts a convex ridge crest, so
 * where mesh edges are not aligned with / dense enough at a crest (serration) the
 * interior dips off the surface and the deviation spikes. A plain pot reads ≈ the
 * sag-refinement floor; ridge serration drives `maxMm`/`p99Mm` up.
 *
 * Uses RADIAL deviation `|r − R_true(θ,z)|` (R_true = the OUTER radius per (θ,z)
 * bin of the dense reference). Radial — not 3D nearest-point — because a flat
 * triangle chord-cutting a sharp ridge crest stays close to the surface
 * LATERALLY (nearest-point under-measures it), whereas the radial under-shoot at
 * the crest IS the CAD error. The near-vertical DRAIN (r ≈ rDrain ≪ R_true) is
 * excluded by `r > 0.5·R_true`; flat caps/rim/base are excluded by the
 * near-vertical normal test. (The inner wall contributes a ~constant
 * wall-thickness floor; the serration is the climb above it.)
 */
export function wallDeviation(
  mesh: MeshView,
  denseVertices: Float32Array,
  order = 4,
): WallDeviationResult {
  const rTrue = buildRadialReference(denseVertices).rTrue;
  const { vertices, indices } = mesh;
  const samples = barycentricSamples(order);
  let maxv = 0;
  let sumSq = 0;
  let count = 0;
  let wallTris = 0;
  // Histogram for a cheap p99 (0..20mm at 0.05mm; overflow in the last bucket).
  const BUCKETS = 400;
  const BW = 0.05;
  const hist = new Float64Array(BUCKETS + 1);

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nz = ux * vy - uy * vx;
    const nlen = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz);
    // Near-vertical WALL only (normal near-horizontal); excludes flat caps/rim/base.
    if (!(nlen > 1e-12) || Math.abs(nz) / nlen >= NEAR_VERTICAL_COS) continue;
    wallTris++;

    for (const [wa, wb, wc] of samples) {
      const px = ax * wa + bx * wb + cx * wc;
      const py = ay * wa + by * wb + cy * wc;
      const pz = az * wa + bz * wb + cz * wc;
      const r = Math.hypot(px, py);
      const rt = rTrue(Math.atan2(py, px), pz);
      if (r < 0.5 * rt) continue; // exclude the inner drain cylinder (r ≪ R_true)
      const dev = Math.abs(r - rt);
      if (dev > maxv) maxv = dev;
      sumSq += dev * dev;
      count++;
      hist[Math.min(BUCKETS, Math.floor(dev / BW))]++;
    }
  }

  let p99 = 0;
  if (count > 0) {
    const target = count * 0.99;
    let acc = 0;
    for (let b = 0; b <= BUCKETS; b++) {
      acc += hist[b];
      if (acc >= target) { p99 = b * BW; break; }
    }
  }
  return {
    maxMm: maxv,
    rmsMm: count > 0 ? Math.sqrt(sumSq / count) : 0,
    p99Mm: p99,
    wallSamples: count,
    wallTriangles: wallTris,
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
  /** 3D centroid [x,y,z] — for localizing slivers by height (z) and radius (hypot(x,y)). */
  centroid: [number, number, number];
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

export interface TriangleQualityDistribution {
  /** Non-degenerate triangles measured (degenerate ones have no min angle). */
  triangleCount: number;
  /** Degenerate (zero-area) triangles, excluded from the angle stats. */
  degenerateCount: number;
  /** Smallest interior angle anywhere — the single worst triangle (deg). */
  minAngleDeg: number;
  /** 5th-percentile smallest-interior-angle (robust worst, deg). */
  p5MinAngleDeg: number;
  /** Median smallest-interior-angle (deg). */
  medianMinAngleDeg: number;
  /** Mean smallest-interior-angle (deg). */
  meanMinAngleDeg: number;
  /** Percent of triangles whose smallest interior angle is below 10°. */
  pctBelow10: number;
  /** Percent below 20° — the "clean CAD mesh" bar. */
  pctBelow20: number;
  /** Percent below 30°. */
  pctBelow30: number;
}

/**
 * Min-angle distribution across the mesh — the triangle-quality instrument the
 * `aspect > ASPECT_MAX` sliver gate lacks. A clean isotropic ("CAD-grade") mesh
 * has nearly every triangle ≥ ~20–30°; stretched feature-region triangles pull
 * the low percentiles down (measured 2026-06-10: HexagonalHive 85% of wall
 * triangles below 20°, vs smooth styles ~0%). Degenerate triangles have no
 * well-defined min angle, so they are excluded from the angle stats and counted
 * separately. Uses a 0–60° integer-degree histogram (a triangle's smallest
 * interior angle is always ≤ 60°), so memory is bounded regardless of mesh size.
 */
export function triangleQualityDistribution(mesh: MeshView): TriangleQualityDistribution {
  const { vertices, indices } = mesh;
  const BINS = 61; // 0..60 inclusive
  const hist = new Float64Array(BINS);
  let degenerate = 0;
  let good = 0;
  let angleSum = 0;
  let minAngle = 180;

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3, ib = indices[t + 1] * 3, ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    const ab2 = dist2(ax, ay, az, bx, by, bz);
    const bc2 = dist2(bx, by, bz, cx, cy, cz);
    const ca2 = dist2(cx, cy, cz, ax, ay, az);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area <= 1e-12) { degenerate++; continue; }

    const a = Math.sqrt(bc2), b = Math.sqrt(ca2), c = Math.sqrt(ab2);
    const triMin = Math.min(lawOfCosines(b, c, a), lawOfCosines(a, c, b), lawOfCosines(a, b, c));
    if (triMin < minAngle) minAngle = triMin;
    angleSum += triMin;
    let bin = Math.floor(triMin);
    if (bin < 0) bin = 0;
    else if (bin >= BINS) bin = BINS - 1;
    hist[bin]++;
    good++;
  }

  if (good === 0) {
    return {
      triangleCount: 0, degenerateCount: degenerate, minAngleDeg: 0,
      p5MinAngleDeg: 0, medianMinAngleDeg: 0, meanMinAngleDeg: 0,
      pctBelow10: 0, pctBelow20: 0, pctBelow30: 0,
    };
  }

  const pctBelow = (deg: number): number => {
    let n = 0;
    for (let i = 0; i < deg && i < BINS; i++) n += hist[i];
    return (n / good) * 100;
  };
  const percentile = (p: number): number => {
    const target = (p / 100) * good;
    let cum = 0;
    for (let i = 0; i < BINS; i++) {
      cum += hist[i];
      if (cum >= target) return i;
    }
    return BINS - 1;
  };
  const round1 = (x: number): number => Math.round(x * 10) / 10;

  return {
    triangleCount: good,
    degenerateCount: degenerate,
    minAngleDeg: round1(minAngle),
    p5MinAngleDeg: percentile(5),
    medianMinAngleDeg: percentile(50),
    meanMinAngleDeg: round1(angleSum / good),
    pctBelow10: round1(pctBelow(10)),
    pctBelow20: round1(pctBelow(20)),
    pctBelow30: round1(pctBelow(30)),
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
      centroid: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
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

/** Shape of one triangle (see {@link triMinAngleAndAspect}). */
export interface TriangleShape {
  /** Min interior 3D angle (deg); 0 for a degenerate (zero-area) triangle. */
  minAngleDeg: number;
  /** longest²·√3 / (4·area) — 1 = equilateral; Infinity when degenerate. */
  aspect: number;
}

/**
 * 3D min interior angle (law of cosines) + aspect of one triangle `(a,b,c)` of
 * an indexed mesh. The aspect uses the codebase's equilateral-normalized
 * convention (longest²·√3 / (4·area), as {@link triangleQuality3D}), so the
 * `aspect > ASPECT_MAX` sliver gate means the same thing everywhere. Shared
 * per-triangle helper for the Stage-0 sliver-attribution diagnostic.
 */
export function triMinAngleAndAspect(
  vertices: Float32Array, a: number, b: number, c: number,
): TriangleShape {
  const ia = a * 3, ib = b * 3, ic = c * 3;
  const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
  const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
  const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  if (!(area > 1e-12)) return { minAngleDeg: 0, aspect: Infinity };
  const sa = Math.sqrt(dist2(bx, by, bz, cx, cy, cz)); // side opposite a
  const sb = Math.sqrt(dist2(cx, cy, cz, ax, ay, az)); // side opposite b
  const sc = Math.sqrt(dist2(ax, ay, az, bx, by, bz)); // side opposite c
  const minAngleDeg = Math.min(
    lawOfCosines(sb, sc, sa),
    lawOfCosines(sa, sc, sb),
    lawOfCosines(sa, sb, sc),
  );
  const longest2 = Math.max(sa * sa, sb * sb, sc * sc);
  return { minAngleDeg, aspect: (longest2 * Math.sqrt(3)) / (4 * area) };
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
    for (const preferredKind of ['nonManifold', 'boundary', 'orientationMismatch'] satisfies TopologySampleKind[]) {
      for (const use of uses.values()) {
        const kind = classifyTopologyUse(use);
        if (kind !== preferredKind) continue;
        samples.push(sampleTopologyEdge(mesh.vertices, mesh.uvs, use, kind));
        if (samples.length >= sampleLimit) break;
      }
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

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 — faithful crest-band serration metric.
//
// The existing `wallDeviation` is artifact-dominated (reads ~25mm / rms ~1.4mm on
// a PLAIN pot, barely moving with serration — measured live) because its R_true
// comes from the whole-pot dense reference (drain + caps + inner wall pollute the
// radial bins). This metric instead measures the OUTER wall's RADIAL deviation
// from the true crest radius recovered from the conforming OUTER sampler (the
// surface the mesher itself sees), restricted to the crest band where serration
// concentrates. It reads ~0 on a plain pot and rises with ridge serration.
//
// Design (vetted by a design+adversarial pass):
//  - RADIAL deviation `|r − R_true(θ,z)|`, NOT 3D nearest-point: a flat triangle
//    chord-cutting a convex crest stays close LATERALLY, so nearest-point
//    UNDER-measures the staircase; the radial under-shoot at the crest IS the
//    CAD error.
//  - R_true(θ,z) is recovered by inverting the sampler on (ANGLE, HEIGHT) — both
//    monotone and well-conditioned on a near-vertical wall — NOT by minimising 3D
//    distance (which is singular where ∂r/∂θ→0 at the crest).
//  - The crest band is ALL local radius extrema per t-row (peaks AND valleys),
//    not the single global argmax/argmin (which misses m−1 of m petals).
//  - Style-AGNOSTIC: it reads the sampler surface, so it works for every smooth
//    style; only the extractor (the fix) is style-specific.
// ─────────────────────────────────────────────────────────────────────────────

/** CAD-fidelity serration tolerance (mm) — a crest-band rms at/above this is a
 *  visible "cut/serration". Mirrors the sag tolerance. */
export const SERRATION_TOL_MM = SAG_TOL_MM;

/** Minimal sampler the crest metric inverts: outer-wall (u,t) → 3D position (mm).
 *  Structurally compatible with the conforming `GpuSurfaceSampler`. */
export interface PositionSampler {
  position(u: number, t: number): readonly [number, number, number];
  /** Discrete grid resolution, if any — sizes the inversion's finite-difference
   *  step to ~one cell so it is not amplified quantization noise. */
  gridResolution?(): { resU: number; resT: number };
}

/** Faithful crest-band serration result for the OUTER wall. */
export interface WallChordResult {
  /** Worst radial deviation (mm) over all outer-wall samples. */
  maxDevMm: number;
  /** RMS radial deviation (mm) over all outer-wall samples. */
  rmsDevMm: number;
  /** 99th-percentile radial deviation (mm). */
  p99DevMm: number;
  /** Worst radial deviation (mm) within the crest band. */
  maxCrestDevMm: number;
  /** RMS radial deviation (mm) within the crest band (the headline signal).
   *  Falls back to the whole-wall rms when no crest band exists (a plain pot). */
  crestBandRmsMm: number;
  /** crestBandRmsMm / SERRATION_TOL_MM — <1 within CAD tolerance, ≥1 serrated. */
  serrationScore: number;
  /** Outer-wall samples measured. */
  wallSamples: number;
  /** Samples that fell in the crest band. */
  crestSamples: number;
  /** Max number of distinct crest loci found on any one t-row (≈ 2·m). */
  crestLoci: number;
}

/** Options for {@link wallChordError}. */
export interface WallChordOptions {
  /** Interior barycentric sample order (4 → 15 interior + 3 edge midpoints). */
  sampleOrder?: number;
  /** Minimum radius swing (mm) for a row to be treated as crest-bearing. */
  minProminenceMm?: number;
  /** Crest-band half-width as a fraction of the inter-crest angular spacing. */
  crestHalfWidthFrac?: number;
  /** t-rows sampled to map the crest loci up the height. */
  crestRows?: number;
  /** u-columns sampled per row to locate the crest loci. */
  crestCols?: number;
  /** Newton iterations for the (angle,z) → (u,t) inversion. */
  newtonIters?: number;
}

const TWO_PI = 2 * Math.PI;

/** Wrap an angle difference to (−π, π]. */
function wrapPi(a: number): number {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  return x;
}

/**
 * Periodic local extrema of a radius row. Returns the column indices of every
 * strict local maximum and minimum (NOT just the global argmax/argmin — a petal
 * row has m of each). A near-flat row (total swing < `minProminenceMm`) is a
 * plain surface of revolution and yields no extrema, so a plain pot has an empty
 * crest band.
 */
export function findRowExtrema(
  radii: number[],
  minProminenceMm: number,
): { maxima: number[]; minima: number[] } {
  const n = radii.length;
  const maxima: number[] = [];
  const minima: number[] = [];
  if (n < 3) return { maxima, minima };
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    if (radii[i] < lo) lo = radii[i];
    if (radii[i] > hi) hi = radii[i];
  }
  if (hi - lo < minProminenceMm) return { maxima, minima };
  for (let i = 0; i < n; i++) {
    const prev = radii[(i - 1 + n) % n];
    const cur = radii[i];
    const next = radii[(i + 1) % n];
    if (cur > prev && cur > next) maxima.push(i);
    else if (cur < prev && cur < next) minima.push(i);
  }
  return { maxima, minima };
}

/**
 * Recover the true OUTER-wall radius at a given (θ, z) by inverting the sampler
 * on ANGLE and HEIGHT via 2D Newton, then reading the radius at the converged
 * (u,t). Angle and height are monotone on a near-vertical wall, so the system is
 * well-conditioned everywhere (unlike a 3D distance minimiser, which is singular
 * at the crest where ∂r/∂θ→0). Seeds u≈θ/2π and t≈(z−zMin)/(zMax−zMin); u wraps,
 * t clamps. Robust to twist (θ ≠ 2π·u) because it matches the position's angle.
 */
export function sampleTrueRadius(
  sampler: PositionSampler,
  theta: number,
  z: number,
  zMin: number,
  zMax: number,
  opts: { newtonIters?: number } = {},
): number {
  const iters = opts.newtonIters ?? 6;
  const res = sampler.gridResolution?.();
  const hu = res && res.resU > 1 ? 1 / res.resU : 1e-3;
  const ht = res && res.resT > 1 ? 1 / (res.resT - 1) : 1e-3;
  const zSpan = Math.max(zMax - zMin, 1e-9);

  let u = theta / TWO_PI;
  u -= Math.floor(u);
  let t = (z - zMin) / zSpan;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  let bestU = u;
  let bestT = t;
  let bestErr = Infinity;

  for (let it = 0; it < iters; it++) {
    const p = sampler.position(u, t);
    const x = p[0];
    const y = p[1];
    const r2 = Math.max(x * x + y * y, 1e-12);
    const fAng = wrapPi(Math.atan2(y, x) - theta);
    const fZ = p[2] - z;
    const err = fAng * fAng + (fZ / zSpan) * (fZ / zSpan);
    if (err < bestErr) {
      bestErr = err;
      bestU = u;
      bestT = t;
    }
    // Central finite differences for the position partials (t step shrinks at
    // the caps so it never reads outside [0,1]).
    const htc = Math.max(1e-9, Math.min(ht, t, 1 - t));
    const pu1 = sampler.position(u + hu, t);
    const pu0 = sampler.position(u - hu, t);
    const pt1 = sampler.position(u, t + htc);
    const pt0 = sampler.position(u, t - htc);
    const PuX = (pu1[0] - pu0[0]) / (2 * hu);
    const PuY = (pu1[1] - pu0[1]) / (2 * hu);
    const PuZ = (pu1[2] - pu0[2]) / (2 * hu);
    const PtX = (pt1[0] - pt0[0]) / (2 * htc);
    const PtY = (pt1[1] - pt0[1]) / (2 * htc);
    const PtZ = (pt1[2] - pt0[2]) / (2 * htc);
    // J = [[∂angle/∂u, ∂angle/∂t], [∂z/∂u, ∂z/∂t]].
    const a = (x * PuY - y * PuX) / r2;
    const b = (x * PtY - y * PtX) / r2;
    const c = PuZ;
    const d = PtZ;
    // Levenberg-Marquardt diagonal damping keeps the 2×2 solve stable if the
    // wall ever flattens in a parameter direction.
    const lam = 1e-9 * (Math.abs(a) + Math.abs(d) + 1);
    const A = a + lam;
    const D = d + lam;
    const det = A * D - b * c;
    if (Math.abs(det) < 1e-20) break;
    const du = (-fAng * D - b * -fZ) / det;
    const dt = (A * -fZ - -fAng * c) / det;
    u += du;
    u -= Math.floor(u);
    t += dt;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    if (du * du + dt * dt < 1e-16) break;
  }

  const pb = sampler.position(bestU, bestT);
  return Math.hypot(pb[0], pb[1]);
}

/**
 * Restrict a combined pot mesh to the OUTER wall via a per-vertex surfaceId mask
 * (1 = outer wall). Keeps only triangles whose three vertices are all outer-wall
 * and reindexes them compactly. This excludes the inner wall (a ~wall-thickness
 * radial phantom), the drain, and the flat caps unambiguously.
 */
export function extractOuterWallSubmesh(
  vertices: Float32Array,
  indices: Uint32Array,
  outerMask: Uint8Array,
): { vertices: Float32Array; indices: Uint32Array } {
  const remap = new Int32Array(vertices.length / 3).fill(-1);
  const outVerts: number[] = [];
  const outIdx: number[] = [];
  let next = 0;
  const mapVert = (old: number): number => {
    let n = remap[old];
    if (n < 0) {
      n = next++;
      remap[old] = n;
      outVerts.push(vertices[old * 3], vertices[old * 3 + 1], vertices[old * 3 + 2]);
    }
    return n;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t];
    const i1 = indices[t + 1];
    const i2 = indices[t + 2];
    if (!outerMask[i0] || !outerMask[i1] || !outerMask[i2]) continue;
    outIdx.push(mapVert(i0), mapVert(i1), mapVert(i2));
  }
  return { vertices: new Float32Array(outVerts), indices: new Uint32Array(outIdx) };
}

/** Crest loci (θ angles) per t-row, derived from the sampler's radius extrema. */
interface CrestLocusMap {
  rows: number; // number of t-rows
  loci: number[][]; // per-row sorted θ in [0, 2π)
  halfWidth: number[]; // per-row crest-band half-width (rad)
  maxLoci: number; // most loci on any one row
}

function buildCrestLoci(
  sampler: PositionSampler,
  rows: number,
  cols: number,
  minProminenceMm: number,
  crestHalfWidthFrac: number,
): CrestLocusMap {
  const loci: number[][] = [];
  const halfWidth: number[] = [];
  let maxLoci = 0;
  for (let j = 0; j < rows; j++) {
    const t = rows > 1 ? j / (rows - 1) : 0;
    const radii: number[] = new Array(cols);
    const angles: number[] = new Array(cols);
    for (let i = 0; i < cols; i++) {
      const p = sampler.position(i / cols, t);
      radii[i] = Math.hypot(p[0], p[1]);
      let ang = Math.atan2(p[1], p[0]);
      if (ang < 0) ang += TWO_PI;
      angles[i] = ang;
    }
    const { maxima, minima } = findRowExtrema(radii, minProminenceMm);
    const rowLoci = [...maxima, ...minima].map((i) => angles[i]).sort((p, q) => p - q);
    loci.push(rowLoci);
    if (rowLoci.length > maxLoci) maxLoci = rowLoci.length;
    halfWidth.push(rowLoci.length > 0 ? crestHalfWidthFrac * (TWO_PI / rowLoci.length) : 0);
  }
  return { rows, loci, halfWidth, maxLoci };
}

/** True if θ is within the crest-band half-width of any locus on the given row. */
function inCrestBand(map: CrestLocusMap, row: number, theta: number): boolean {
  const rowLoci = map.loci[row];
  if (rowLoci.length === 0) return false;
  const hw = map.halfWidth[row];
  let th = theta;
  if (th < 0) th += TWO_PI;
  for (const locus of rowLoci) {
    let d = Math.abs(th - locus);
    if (d > Math.PI) d = TWO_PI - d;
    if (d < hw) return true;
  }
  return false;
}

/**
 * Faithful crest-band serration metric over an OUTER-wall sub-mesh. For each
 * near-vertical wall triangle it measures interior (barycentric) AND edge-midpoint
 * samples' radial deviation `|hypot(P.xy) − R_true(θ_P, z_P)|` from the sampler,
 * splitting whole-wall vs crest-band statistics. The headline `serrationScore =
 * crestBandRmsMm / SERRATION_TOL_MM` reads ~0 on a plain pot (empty crest band →
 * whole-wall floor) and rises with ridge serration.
 */
export function wallChordError(
  mesh: MeshView,
  sampler: PositionSampler,
  opts: WallChordOptions = {},
): WallChordResult {
  const order = opts.sampleOrder ?? 4;
  const minProminenceMm = opts.minProminenceMm ?? 0.05;
  const crestHalfWidthFrac = opts.crestHalfWidthFrac ?? 0.25;
  const crestRows = opts.crestRows ?? 48;
  const crestCols = opts.crestCols ?? 360;
  const newtonIters = opts.newtonIters ?? 6;

  const { vertices, indices } = mesh;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    const z = vertices[i + 2];
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  if (!(zMax > zMin)) {
    return {
      maxDevMm: 0, rmsDevMm: 0, p99DevMm: 0, maxCrestDevMm: 0,
      crestBandRmsMm: 0, serrationScore: 0, wallSamples: 0, crestSamples: 0, crestLoci: 0,
    };
  }
  const zSpan = zMax - zMin;

  const crest = buildCrestLoci(sampler, crestRows, crestCols, minProminenceMm, crestHalfWidthFrac);
  const samples = barycentricSamples(order);

  let maxv = 0;
  let sumSq = 0;
  let count = 0;
  let maxCrest = 0;
  let sumSqCrest = 0;
  let crestCount = 0;
  const BUCKETS = 400;
  const BW = 0.05;
  const hist = new Float64Array(BUCKETS + 1);

  const accumulate = (px: number, py: number, pz: number): void => {
    const r = Math.hypot(px, py);
    const theta = Math.atan2(py, px);
    const rt = sampleTrueRadius(sampler, theta, pz, zMin, zMax, { newtonIters });
    const dev = Math.abs(r - rt);
    if (dev > maxv) maxv = dev;
    sumSq += dev * dev;
    count++;
    hist[Math.min(BUCKETS, Math.floor(dev / BW))]++;
    let row = Math.round(((pz - zMin) / zSpan) * (crest.rows - 1));
    if (row < 0) row = 0;
    else if (row > crest.rows - 1) row = crest.rows - 1;
    if (inCrestBand(crest, row, theta)) {
      if (dev > maxCrest) maxCrest = dev;
      sumSqCrest += dev * dev;
      crestCount++;
    }
  };

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nz = ux * vy - uy * vx;
    const nlen = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz);
    // Near-vertical wall only — exclude any sloped foot/fillet outer-wall band
    // where the radial metric degenerates.
    if (!(nlen > 1e-12) || Math.abs(nz) / nlen >= NEAR_VERTICAL_COS) continue;

    for (const [wa, wb, wc] of samples) {
      accumulate(ax * wa + bx * wb + cx * wc, ay * wa + by * wb + cy * wc, az * wa + bz * wb + cz * wc);
    }
    // Edge midpoints — where an axis-aligned chord dips farthest under a crest.
    accumulate((ax + bx) * 0.5, (ay + by) * 0.5, (az + bz) * 0.5);
    accumulate((bx + cx) * 0.5, (by + cy) * 0.5, (bz + cz) * 0.5);
    accumulate((cx + ax) * 0.5, (cy + ay) * 0.5, (cz + az) * 0.5);
  }

  let p99 = 0;
  if (count > 0) {
    const target = count * 0.99;
    let acc = 0;
    for (let bkt = 0; bkt <= BUCKETS; bkt++) {
      acc += hist[bkt];
      if (acc >= target) { p99 = bkt * BW; break; }
    }
  }
  const rmsDevMm = count > 0 ? Math.sqrt(sumSq / count) : 0;
  const crestBandRmsMm = crestCount > 0 ? Math.sqrt(sumSqCrest / crestCount) : rmsDevMm;
  return {
    maxDevMm: maxv,
    rmsDevMm,
    p99DevMm: p99,
    maxCrestDevMm: crestCount > 0 ? maxCrest : maxv,
    crestBandRmsMm,
    serrationScore: crestBandRmsMm / SERRATION_TOL_MM,
    wallSamples: count,
    crestSamples: crestCount,
    crestLoci: crest.maxLoci,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 — faithful crest-band TRIANGLE-QUALITY metric (reference-free).
//
// The serration chord-error metric (above) measures the mesh against a sampler
// reference and was reference-DOMINATED at sharp cusps (it fooled a prior session
// into a wrong "CAD-grade" claim). The min interior angle of a 3D triangle is a
// pure function of the GPU-evaluated vertex positions — REFERENCE-FREE, so it
// cannot be fooled by the reference. The diagonal/helical-crest defect is a field
// of STRETCHED (near-degenerate, small-min-angle) fill triangles strung along the
// crest; this metric reports the fraction of sub-bar triangles WITHIN a crest band
// (centred on the sampler's per-row radius extrema, the crest loci), so the signal
// is not diluted by the clean bulk. It reads 0 on a plain pot (empty band) and
// lights up along a ridge crest, and is the sharp gate for the fix.
// ─────────────────────────────────────────────────────────────────────────────

/** Faithful crest-band triangle-quality result (3D min interior angle). */
export interface CrestBandQualityResult {
  /** Outer-wall triangles measured (degenerate ones count as below-bar). */
  triangleCount: number;
  /** Angle bar (deg) below which a triangle is "bad" (default 15). */
  angleBarDeg: number;
  /** Percent of ALL outer-wall triangles with min interior angle < bar. */
  pctBelow15: number;
  /** Worst (smallest) min interior angle anywhere on the outer wall (deg). */
  worstMinAngleDeg: number;
  /** 1st-percentile min interior angle — robust worst tail (deg). */
  p1MinAngleDeg: number;
  /** Max distinct crest loci on any one t-row (≈ 2·m). 0 ⇒ plain pot. */
  crestLoci: number;
  /** Triangles whose centroid falls in a crest band. */
  bandTriangles: number;
  /** Percent of crest-band triangles below the bar (the headline gate). */
  bandPctBelow15: number;
  /** Worst min interior angle within the crest band (deg). */
  bandWorstMinAngleDeg: number;
  /** Percent of NON-band (bulk) triangles below the bar — proves localization. */
  nonBandPctBelow15: number;
}

/** Options for {@link crestBandTriangleQuality}. */
export interface CrestBandQualityOptions {
  /** Min interior angle (deg) bar. Default 15 (the handoff crest bar). */
  angleBarDeg?: number;
  /** Minimum radius swing (mm) for a row to be crest-bearing. */
  minProminenceMm?: number;
  /** Crest-band half-width as a fraction of the inter-crest angular spacing. */
  crestHalfWidthFrac?: number;
  /** t-rows sampled to map the crest loci up the height. */
  crestRows?: number;
  /** u-columns sampled per row to locate the crest loci. */
  crestCols?: number;
}

/**
 * Reference-free crest-band triangle-quality over an OUTER-wall sub-mesh. For each
 * triangle it computes the 3D min interior angle (a degenerate triangle scores 0)
 * and classifies its centroid (θ,z) as inside/outside a crest band derived from the
 * sampler's per-row radius extrema. Returns the whole-wall sub-bar fraction + worst
 * tail AND the band-vs-bulk split: a plain pot has no crest band (`crestLoci=0`,
 * `bandTriangles=0`, `bandPctBelow15=0`); a diagonal/helical ridge concentrates the
 * sub-bar triangles in the band (`bandPctBelow15` ≫ `nonBandPctBelow15`).
 */
export function crestBandTriangleQuality(
  mesh: MeshView,
  sampler: PositionSampler,
  opts: CrestBandQualityOptions = {},
): CrestBandQualityResult {
  const bar = opts.angleBarDeg ?? 15;
  const minProminenceMm = opts.minProminenceMm ?? 0.05;
  const crestHalfWidthFrac = opts.crestHalfWidthFrac ?? 0.3;
  const crestRows = opts.crestRows ?? 48;
  const crestCols = opts.crestCols ?? 360;

  const { vertices, indices } = mesh;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 2; i < vertices.length; i += 3) {
    const z = vertices[i];
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const zSpan = Math.max(zMax - zMin, 1e-9);
  const crest = buildCrestLoci(sampler, crestRows, crestCols, minProminenceMm, crestHalfWidthFrac);

  const BINS = 61; // 0..60 inclusive (a min interior angle is always ≤ 60°)
  const hist = new Float64Array(BINS);
  let all = 0;
  let below = 0;
  let worst = 180;
  let bandAll = 0;
  let bandBelow = 0;
  let bandWorst = 180;
  let nonBandAll = 0;
  let nonBandBelow = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = vertices[ia], ay = vertices[ia + 1], az = vertices[ia + 2];
    const bx = vertices[ib], by = vertices[ib + 1], bz = vertices[ib + 2];
    const cx = vertices[ic], cy = vertices[ic + 1], cz = vertices[ic + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    // Degenerate (zero-area) triangle: the worst possible sliver — score 0 so it
    // counts as below-bar rather than being silently dropped.
    let mAng = 0;
    if (area > 1e-12) {
      const a = Math.sqrt(dist2(bx, by, bz, cx, cy, cz)); // side opposite A
      const b = Math.sqrt(dist2(cx, cy, cz, ax, ay, az)); // side opposite B
      const c = Math.sqrt(dist2(ax, ay, az, bx, by, bz)); // side opposite C
      mAng = Math.min(lawOfCosines(b, c, a), lawOfCosines(a, c, b), lawOfCosines(a, b, c));
    }

    all++;
    let bin = Math.floor(mAng);
    if (bin < 0) bin = 0;
    else if (bin >= BINS) bin = BINS - 1;
    hist[bin]++;
    const isBelow = mAng < bar;
    if (isBelow) below++;
    if (mAng < worst) worst = mAng;

    const ccx = (ax + bx + cx) / 3;
    const ccy = (ay + by + cy) / 3;
    const ccz = (az + bz + cz) / 3;
    const theta = Math.atan2(ccy, ccx);
    let row = Math.round(((ccz - zMin) / zSpan) * (crest.rows - 1));
    if (row < 0) row = 0;
    else if (row > crest.rows - 1) row = crest.rows - 1;
    if (inCrestBand(crest, row, theta)) {
      bandAll++;
      if (isBelow) bandBelow++;
      if (mAng < bandWorst) bandWorst = mAng;
    } else {
      nonBandAll++;
      if (isBelow) nonBandBelow++;
    }
  }

  const round1 = (x: number): number => Math.round(x * 10) / 10;
  const round2 = (x: number): number => Math.round(x * 100) / 100;
  let p1 = 0;
  if (all > 0) {
    const target = all * 0.01;
    let acc = 0;
    for (let bkt = 0; bkt < BINS; bkt++) {
      acc += hist[bkt];
      if (acc >= target) { p1 = bkt; break; }
    }
  }

  return {
    triangleCount: all,
    angleBarDeg: bar,
    pctBelow15: all > 0 ? round1((below / all) * 100) : 0,
    worstMinAngleDeg: all > 0 ? round2(worst) : 0,
    p1MinAngleDeg: p1,
    crestLoci: crest.maxLoci,
    bandTriangles: bandAll,
    bandPctBelow15: bandAll > 0 ? round1((bandBelow / bandAll) * 100) : 0,
    bandWorstMinAngleDeg: bandAll > 0 ? round2(bandWorst) : 0,
    nonBandPctBelow15: nonBandAll > 0 ? round1((nonBandBelow / nonBandAll) * 100) : 0,
  };
}

/** One FNV-1a 32-bit lane over raw bytes (seeded so two lanes are independent). */
function fnv1a32(bytes: Uint8Array, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface MeshHashResult {
  vertexHash: string;
  indexHash: string;
}

/**
 * Byte-exact mesh fingerprint (two independent FNV-1a lanes per buffer → 64-bit
 * hex). Valid for SAME-machine/driver comparisons only — GPU-evaluated floats
 * are not portable across hardware. This is the Stage-0 byte-identity tripwire.
 */
export function meshHash(vertices: Float32Array, indices: Uint32Array): MeshHashResult {
  const vb = new Uint8Array(vertices.buffer, vertices.byteOffset, vertices.byteLength);
  const ib = new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength);
  const hex = (a: number, b: number): string =>
    a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  return {
    vertexHash: hex(fnv1a32(vb, 0x811c9dc5), fnv1a32(vb, 0xdeadbeef)),
    indexHash: hex(fnv1a32(ib, 0x811c9dc5), fnv1a32(ib, 0xdeadbeef)),
  };
}
