/**
 * collapseDegenerate.ts — the universal slicer-safety post-pass.
 *
 * Port of the VALIDATION-6-proven collapse (research/bridge/_pf_crestStripLib
 * collapseDegenerateFaces): a zero-/sub-floor-area 3D face (UV-collinear
 * chains produce them at crest junctions — Gothic carried 36) is a real
 * slicer risk. For each degenerate face, weld the two vertices joined by its
 * SHORTEST 3D edge (union-find, keep the representative's chart position —
 * the pair is ~coincident so the representative is faithful), then rebuild
 * dropping any face with <3 distinct vertices. Proven to hold fidelity and
 * watertightness (Gothic 36→0 zero-area, 77 verts welded, 0-outlier held).
 *
 * @module conforming/tierC/collapseDegenerate
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import { liftChartMesh, type ChartMesh } from './interiorRuler';

export interface CollapseResult extends ChartMesh {
  /** Number of degenerate faces encountered. */
  collapsed: number;
  /** Number of vertex pairs welded. */
  verticesMerged: number;
}

/** Count faces whose 3D area is below the floor (the slicer-risk metric). */
export function countZeroAreaFaces(
  sampler: SurfaceSampler,
  mesh: ChartMesh,
  areaFloorMm2 = 1e-6,
): number {
  const xyz = liftChartMesh(sampler, mesh.uv);
  let n = 0;
  for (let k = 0; k < mesh.tris.length; k += 3) {
    if (area3(xyz, mesh.tris[k], mesh.tris[k + 1], mesh.tris[k + 2]) < areaFloorMm2) {
      n++;
    }
  }
  return n;
}

function area3(xyz: Float64Array, a: number, b: number, c: number): number {
  const ux = xyz[3 * b] - xyz[3 * a];
  const uy = xyz[3 * b + 1] - xyz[3 * a + 1];
  const uz = xyz[3 * b + 2] - xyz[3 * a + 2];
  const vx = xyz[3 * c] - xyz[3 * a];
  const vy = xyz[3 * c + 1] - xyz[3 * a + 1];
  const vz = xyz[3 * c + 2] - xyz[3 * a + 2];
  return (
    0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
  );
}

/** Collapse degenerate faces (see module doc). Chart positions unchanged. */
export function collapseDegenerateFaces(
  sampler: SurfaceSampler,
  mesh: ChartMesh,
  areaFloorMm2 = 1e-6,
): CollapseResult {
  const uv = mesh.uv.slice();
  const tris0 = mesh.tris;
  const xyz = liftChartMesh(sampler, uv);
  const nV = uv.length / 2;
  const remap = new Int32Array(nV);
  for (let i = 0; i < nV; i++) remap[i] = i;
  const find = (i: number): number => {
    let r = i;
    while (remap[r] !== r) r = remap[r];
    while (remap[i] !== r) {
      const n = remap[i];
      remap[i] = r;
      i = n;
    }
    return r;
  };
  const dist3 = (p: number, q: number): number =>
    Math.hypot(
      xyz[3 * p] - xyz[3 * q],
      xyz[3 * p + 1] - xyz[3 * q + 1],
      xyz[3 * p + 2] - xyz[3 * q + 2],
    );
  let collapsed = 0;
  let merged = 0;
  for (let k = 0; k < tris0.length; k += 3) {
    const a = find(tris0[k]);
    const b = find(tris0[k + 1]);
    const c = find(tris0[k + 2]);
    if (a === b || b === c || a === c) continue;
    if (area3(xyz, a, b, c) >= areaFloorMm2) continue;
    // Weld the two vertices with the SHORTEST 3D edge into one (collinear →
    // the middle vertex is redundant; welding the shortest edge removes the
    // sliver base without moving the outer vertices far).
    const dAB = dist3(a, b);
    const dBC = dist3(b, c);
    const dCA = dist3(c, a);
    let p = a;
    let q = b;
    if (dBC <= dAB && dBC <= dCA) {
      p = b;
      q = c;
    } else if (dCA <= dAB && dCA <= dBC) {
      p = c;
      q = a;
    }
    if (find(p) !== find(q)) {
      remap[find(q)] = find(p);
      merged++;
    }
    collapsed++;
  }
  const tris: number[] = [];
  for (let k = 0; k < tris0.length; k += 3) {
    const a = find(tris0[k]);
    const b = find(tris0[k + 1]);
    const c = find(tris0[k + 2]);
    if (a === b || b === c || a === c) continue;
    tris.push(a, b, c);
  }
  return { uv, tris, collapsed, verticesMerged: merged };
}
