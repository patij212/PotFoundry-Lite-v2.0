/**
 * parametricHausdorff.ts — the SURFACE→MESH half of a two-sided Hausdorff measurement.
 *
 * `buildParametricSurfaceProjector` (mesh→surface) answers "does every mesh point lie on
 * the surface?" — but it is structurally BLIND to surface the mesh OMITS (a dropped
 * strand, a hole, a missing feature emit no mesh sample). This module answers the other
 * direction — "is every point of the true surface covered by the mesh?" — by sampling
 * the parametric surface `Φ(u,v)` densely and measuring each sample to the NEAREST mesh
 * triangle. A gap shows up as a large distance (≈ the gap size).
 *
 * The honest "true error including ALL features" is `max(meshToSurface, surfaceToMesh)`.
 *
 * Pure CPU. Additive: composes `Φ` + a mesh; imports only the shared surface type.
 */
import { buildParametricSurfaceProjector, type ParametricSurface } from './parametricSurfaceProjector';
import type { MeshView } from './types';

/** Point→nearest-mesh-triangle distance, exact and UNBOUNDED (finds the nearest triangle
 *  no matter how far — required for a hole, where the nearest triangle is at the rim). */
export interface MeshDistanceField {
  nearestDistMm(px: number, py: number, pz: number): number;
  readonly triangleCount: number;
}

export interface SurfaceToMeshResult {
  /** Worst (max) distance (mm) from a Φ-sample to the mesh — the surface→mesh Hausdorff. */
  maxMm: number;
  /** RMS Φ-sample→mesh distance (mm). */
  rmsMm: number;
  /** (u,v) of the worst-covered surface sample — where the mesh is most incomplete. */
  worst: { u: number; v: number };
  /** Φ-samples measured. */
  samples: number;
}

function pd2(px: number, py: number, pz: number, qx: number, qy: number, qz: number): number {
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/** Squared distance point→triangle (Ericson, Real-Time Collision Detection §5.1.5). */
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
  if (d1 <= 0 && d2 <= 0) return pd2(px, py, pz, ax, ay, az);
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return pd2(px, py, pz, bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const w = d1 / (d1 - d3); return pd2(px, py, pz, ax + w * abx, ay + w * aby, az + w * abz); }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return pd2(px, py, pz, cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return pd2(px, py, pz, ax + w * acx, ay + w * acy, az + w * acz); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return pd2(px, py, pz, bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz)); }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return pd2(px, py, pz, ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w);
}

/**
 * Build an exact point→mesh distance field: triangles hashed into a 3D grid; a query
 * expands cube shells outward until no farther shell can beat the current best (so it is
 * unbounded — a query far from the mesh still finds the true nearest triangle).
 */
export function buildMeshDistanceField(mesh: MeshView, opts: { cellMm?: number } = {}): MeshDistanceField {
  const V = mesh.vertices, I = mesh.indices;
  const triCount = I.length / 3;
  // 9 coords per triangle, plus a size estimate for the cell.
  const tri = new Float64Array(triCount * 9);
  let edgeSum = 0, edgeN = 0;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let t = 0; t < triCount; t++) {
    const ia = I[t * 3] * 3, ib = I[t * 3 + 1] * 3, ic = I[t * 3 + 2] * 3;
    const o = t * 9;
    for (let k = 0; k < 3; k++) { tri[o + k] = V[ia + k]; tri[o + 3 + k] = V[ib + k]; tri[o + 6 + k] = V[ic + k]; }
    edgeSum += Math.hypot(tri[o] - tri[o + 3], tri[o + 1] - tri[o + 4], tri[o + 2] - tri[o + 5]);
    edgeN++;
    for (let k = 0; k < 3; k++) {
      const x = tri[o + k * 3], y = tri[o + k * 3 + 1], z = tri[o + k * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  }
  const cell = opts.cellMm ?? Math.max(1e-3, edgeN > 0 ? edgeSum / edgeN : 1);
  const invCell = 1 / cell;
  const buckets = new Map<string, number[]>();
  const key = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
  const add = (cx: number, cy: number, cz: number, t: number): void => {
    const k = key(cx, cy, cz);
    let list = buckets.get(k);
    if (!list) { list = []; buckets.set(k, list); }
    list.push(t);
  };
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const lx = Math.min(tri[o], tri[o + 3], tri[o + 6]), hx = Math.max(tri[o], tri[o + 3], tri[o + 6]);
    const ly = Math.min(tri[o + 1], tri[o + 4], tri[o + 7]), hy = Math.max(tri[o + 1], tri[o + 4], tri[o + 7]);
    const lz = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), hz = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    for (let gx = Math.floor(lx * invCell); gx <= Math.floor(hx * invCell); gx++)
      for (let gy = Math.floor(ly * invCell); gy <= Math.floor(hy * invCell); gy++)
        for (let gz = Math.floor(lz * invCell); gz <= Math.floor(hz * invCell); gz++) add(gx, gy, gz, t);
  }
  const spanRings = Math.ceil((Math.max(maxX - minX, maxY - minY, maxZ - minZ, cell) * invCell)) + 2;

  return {
    triangleCount: triCount,
    nearestDistMm(px: number, py: number, pz: number): number {
      if (triCount === 0) return Infinity;
      const qx = Math.floor(px * invCell), qy = Math.floor(py * invCell), qz = Math.floor(pz * invCell);
      let best2 = Infinity;
      for (let ring = 0; ring <= spanRings; ring++) {
        // Once we have a candidate, stop when the nearest possible point in this shell
        // (≥ (ring-1)·cell from the query) cannot beat the current best.
        if (best2 < Infinity) {
          const rmd = (ring - 1) * cell;
          if (rmd > 0 && rmd * rmd > best2) break;
        }
        for (let gx = qx - ring; gx <= qx + ring; gx++)
          for (let gy = qy - ring; gy <= qy + ring; gy++)
            for (let gz = qz - ring; gz <= qz + ring; gz++) {
              if (ring > 0 && gx > qx - ring && gx < qx + ring && gy > qy - ring && gy < qy + ring && gz > qz - ring && gz < qz + ring) continue;
              const list = buckets.get(key(gx, gy, gz));
              if (!list) continue;
              for (const t of list) {
                const o = t * 9;
                const d2 = closestPtTriDist2(px, py, pz, tri[o], tri[o + 1], tri[o + 2], tri[o + 3], tri[o + 4], tri[o + 5], tri[o + 6], tri[o + 7], tri[o + 8]);
                if (d2 < best2) best2 = d2;
              }
            }
      }
      return Math.sqrt(best2);
    },
  };
}

export interface SurfaceToMeshOptions {
  /** Φ-sampling resolution over the domain. Higher = catches smaller gaps. Default 256×128. */
  nu?: number; nv?: number;
  uMin?: number; uMax?: number; vMin?: number; vMax?: number;
  /** Skip the far endpoint on a periodic axis (it duplicates the near one). Default false. */
  uPeriodic?: boolean; vPeriodic?: boolean;
  /** Mesh bucket cell size (mm). Default: the mean triangle edge. */
  cellMm?: number;
}

/**
 * SURFACE→MESH deviation: the max (and RMS) distance from a dense sampling of the true
 * surface `Φ(u,v)` to the nearest mesh triangle — i.e. how much of the surface the mesh
 * FAILS to cover. Large where a feature is missing.
 */
export function surfaceToMeshMaxMm(
  Phi: ParametricSurface,
  mesh: MeshView,
  opts: SurfaceToMeshOptions = {},
): SurfaceToMeshResult {
  const nu = Math.max(2, Math.floor(opts.nu ?? 256));
  const nv = Math.max(2, Math.floor(opts.nv ?? 128));
  const uMin = opts.uMin ?? 0, uMax = opts.uMax ?? 1, vMin = opts.vMin ?? 0, vMax = opts.vMax ?? 1;
  const field = buildMeshDistanceField(mesh, { cellMm: opts.cellMm });
  const nUv = opts.uPeriodic ? nu : nu + 1;
  const nVv = opts.vPeriodic ? nv : nv + 1;
  let maxMm = 0, sumSq = 0, samples = 0;
  let worst = { u: uMin, v: vMin };
  for (let i = 0; i < nUv; i++) {
    const u = uMin + (uMax - uMin) * (i / nu);
    for (let j = 0; j < nVv; j++) {
      const v = vMin + (vMax - vMin) * (j / nv);
      const p = Phi(u, v);
      const d = field.nearestDistMm(p[0], p[1], p[2]);
      if (!Number.isFinite(d)) continue;
      sumSq += d * d; samples++;
      if (d > maxMm) { maxMm = d; worst = { u, v }; }
    }
  }
  return { maxMm, rmsMm: samples > 0 ? Math.sqrt(sumSq / samples) : 0, worst, samples };
}

export interface TwoSidedHausdorffOptions extends SurfaceToMeshOptions {
  /** Barycentric sub-samples per edge for the mesh→surface chord channel (default 4). */
  denseN?: number;
  /** Projector seed-grid resolution for the mesh→surface direction (default 256×128). */
  projectorNu?: number; projectorNv?: number;
}

export interface TwoSidedHausdorffResult {
  /** Max flat-facet sample → surface distance (mm): placement + chord error. */
  meshToSurfaceMm: number;
  /** Max surface sample → mesh distance (mm): missing/uncovered feature. */
  surfaceToMeshMm: number;
  /** max(both) — the true error including ALL features (the certification number). */
  hausdorffMm: number;
  /** (u,v) of the worst-uncovered surface sample. */
  worstSurfaceSample: { u: number; v: number };
}

/**
 * The full two-sided (symmetric) Hausdorff distance between a mesh and the true
 * parametric surface `Φ(u,v)` — the honest "true error including all possible features":
 *  - mesh→surface: dense facet samples projected onto Φ (catches facets straying off the
 *    surface — chord/placement error, wrong-sheet); shape-agnostic via the parametric
 *    projector, so over/under walls are handled.
 *  - surface→mesh: dense Φ samples to the nearest triangle (catches missing surface).
 * Certify on `hausdorffMm ≤ tol`.
 */
export function twoSidedHausdorffMm(
  mesh: MeshView,
  Phi: ParametricSurface,
  opts: TwoSidedHausdorffOptions = {},
): TwoSidedHausdorffResult {
  const uMin = opts.uMin ?? 0, uMax = opts.uMax ?? 1, vMin = opts.vMin ?? 0, vMax = opts.vMax ?? 1;
  const N = Math.max(1, Math.floor(opts.denseN ?? 4));
  const projector = buildParametricSurfaceProjector(Phi, {
    uMin, uMax, vMin, vMax, uPeriodic: opts.uPeriodic, vPeriodic: opts.vPeriodic,
    nu: opts.projectorNu ?? 256, nv: opts.projectorNv ?? 128,
  });
  const V = mesh.vertices, I = mesh.indices;
  let meshToSurfaceMm = 0;
  for (let t = 0; t + 2 < I.length; t += 3) {
    const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
    const ax = V[ia], ay = V[ia + 1], az = V[ia + 2];
    const bx = V[ib], by = V[ib + 1], bz = V[ib + 2];
    const cx = V[ic], cy = V[ic + 1], cz = V[ic + 2];
    for (let p = 0; p <= N; p++) {
      for (let q = 0; q <= N - p; q++) {
        const wa = p / N, wb = q / N, wc = 1 - wa - wb;
        const d = projector.project(wa * ax + wb * bx + wc * cx, wa * ay + wb * by + wc * cy, wa * az + wb * bz + wc * cz).dist;
        if (d > meshToSurfaceMm) meshToSurfaceMm = d;
      }
    }
  }
  const s2m = surfaceToMeshMaxMm(Phi, mesh, opts);
  return {
    meshToSurfaceMm,
    surfaceToMeshMm: s2m.maxMm,
    hausdorffMm: Math.max(meshToSurfaceMm, s2m.maxMm),
    worstSurfaceSample: s2m.worst,
  };
}
