/**
 * Pure 3D export-fidelity metrics (SP0). No DOM, no GPU, no app imports beyond types.
 * Trusted via vitest unit tests, then run in-page by the fidelity window hook.
 */
import type { MeshView, RTrue } from './types';

const TAU = 2 * Math.PI;

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
    let zi = Math.floor(((z - zMin) / zSpan) * (nZ - 1));
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

  const binThetaRad = TAU / nTheta;
  const binZmm = zSpan / (nZ - 1);

  const cellAt = (ti: number, zi: number): number => {
    const t = ((ti % nTheta) + nTheta) % nTheta; // wrap θ
    const z = zi < 0 ? 0 : zi >= nZ ? nZ - 1 : zi; // clamp z
    return grid[z * nTheta + t];
  };

  const rTrue: RTrue = (theta, z) => {
    let th = theta % TAU;
    if (th < 0) th += TAU;
    const tf = (th / TAU) * nTheta - 0.5;
    // -0.5 shifts to cell centers: a bin holds samples in [k, k+1), so its
    // value represents position k+0.5. Matches the theta convention above;
    // without it, z sampling is biased half a bin against the radius gradient.
    const zf = ((z - zMin) / zSpan) * (nZ - 1) - 0.5;
    const ti0 = Math.floor(tf);
    const zi0 = Math.floor(zf);
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
  const hasEmpty = () => {
    for (let k = 0; k < grid.length; k++) if (grid[k] < 0) return true;
    return false;
  };
  let guard = 0;
  while (hasEmpty() && guard++ < nTheta + nZ) {
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
        if (num > 0) next[idx] = acc / num;
      }
    }
    grid.set(next);
  }
}

export interface SagResult {
  maxSagMm: number;
  rmsSagMm: number;
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
 * Radial sag of each triangle's interior vs R_true. For each barycentric
 * sample point P, deviation = |hypot(P.x,P.y) − R_true(atan2(P.y,P.x), P.z)|.
 */
export function sagDeviation(mesh: MeshView, rTrue: RTrue, order = 4): SagResult {
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

    for (const [wa, wb, wc] of samples) {
      const px = ax * wa + bx * wb + cx * wc;
      const py = ay * wa + by * wb + cy * wc;
      const pz = az * wa + bz * wb + cz * wc;
      const r = Math.hypot(px, py);
      const dev = Math.abs(r - rTrue(Math.atan2(py, px), pz));
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

const SLIVER_ASPECT = 100;

/**
 * 3D triangle quality. aspect = longest²·√3 / (4·area) (1 = equilateral),
 * minAngleDeg = smallest interior angle across all triangles, sliverCount =
 * triangles with aspect > 100.
 */
export function triangleQuality3D(mesh: MeshView): TriangleQualityResult {
  const { vertices, indices } = mesh;
  let maxAspect = 0;
  let minAngle = 180;
  let slivers = 0;

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
      maxAspect = Math.max(maxAspect, Infinity);
      slivers++;
      minAngle = 0;
      continue;
    }

    const aspect = (longest2 * Math.sqrt(3)) / (4 * area);
    if (aspect > maxAspect) maxAspect = aspect;
    if (aspect > SLIVER_ASPECT) slivers++;

    const a = Math.sqrt(bc2); // side opposite A
    const b = Math.sqrt(ca2); // side opposite B
    const c = Math.sqrt(ab2); // side opposite C
    const angA = lawOfCosines(b, c, a);
    const angB = lawOfCosines(a, c, b);
    const angC = lawOfCosines(a, b, c);
    const triMin = Math.min(angA, angB, angC);
    if (triMin < minAngle) minAngle = triMin;
  }

  return {
    maxAspect3D: maxAspect,
    minAngleDeg: indices.length > 0 ? minAngle : 0,
    sliverCount: slivers,
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

/**
 * Weld vertices by position quantization, then analyze the directed edge map:
 * - boundaryEdges: undirected edges used by exactly one triangle side.
 * - nonManifoldEdges: undirected edges shared by >2 triangle sides.
 * - orientationMismatches: manifold edges whose two uses point the same way
 *   (i.e. not one forward + one reverse) → inconsistent winding.
 */
export function topologyMetric(mesh: MeshView, weldToleranceMm: number): TopologyResult {
  const remap = buildWeldRemap(mesh.vertices, weldToleranceMm);
  const { indices } = mesh;

  // Directed edge usage keyed by "min:max"; track forward/reverse counts.
  const uses = new Map<string, { forward: number; reverse: number }>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue; // degenerate edge
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      let u = uses.get(key);
      if (!u) { u = { forward: 0, reverse: 0 }; uses.set(key, u); }
      if (a === lo) u.forward++; else u.reverse++;
    }
  }

  let boundary = 0;
  let nonManifold = 0;
  let mismatch = 0;
  for (const u of uses.values()) {
    const total = u.forward + u.reverse;
    if (total === 1) boundary++;
    else if (total > 2) nonManifold++;
    else if (total === 2 && !(u.forward === 1 && u.reverse === 1)) mismatch++;
  }

  return { boundaryEdges: boundary, nonManifoldEdges: nonManifold, orientationMismatches: mismatch };
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
