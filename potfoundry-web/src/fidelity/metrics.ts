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
