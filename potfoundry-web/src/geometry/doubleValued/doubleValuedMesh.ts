// doubleValuedMesh.ts — the general standalone core: turn a declared cliff complex
// + an exact surface radius fn into a watertight, double-valued-wall triangle mesh.
//
// M1 scope: one straight vertical cliff splitting the domain into a LO sheet and a
// HI sheet, joined by a vertical wall. Pipeline:
//   constrained-CDT (cliff as constraint edges)
//     -> classify each triangle to a region by its centroid
//     -> split each cliff point into one mesh vertex per region (the double-valuedness)
//     -> bridge each cliff polyline with flat wall quads welded to the sheet vertices.

import cdt2d from 'cdt2d';
import { createMesh, addVertex, addTriangle, addQuad } from './mesh';
import type { CliffComplexLike, Mesh, MeshBuildOptions, SurfaceRadiusFn } from './types';

const TAU = 2 * Math.PI;
/** Numerical slack for rim detection (domain coords are O(1)). */
const RIM_EPS = 1e-9;

type RegionId = 'LO' | 'HI';
type Lip = { lower: number; upper: number };

/** Cylindrical lift matching the rest of the app: theta = 2*pi*u, z = t*H. */
const lift = (u: number, t: number, r: number, H: number): [number, number, number] => [
  r * Math.cos(TAU * u),
  r * Math.sin(TAU * u),
  t * H,
];

export function buildDoubleValuedMesh(
  complex: CliffComplexLike,
  surface: SurfaceRadiusFn,
  dims: { H: number },
  opts: MeshBuildOptions,
): Mesh {
  const { H } = dims;
  const { baseGridU, baseGridT } = opts;

  // 1. Domain bounds. M1: full u in [0,1]; t spans the cliff band.
  const tLo = Math.min(...complex.segments.map((s) => s.tRange[0]));
  const tHi = Math.max(...complex.segments.map((s) => s.tRange[1]));
  const uMin = 0;
  const uMax = 1;

  // 2. Point set (fixed insertion order for determinism) + cliff constraint chains.
  const pts: Array<[number, number]> = [];
  const cliffLip: Array<Lip | null> = []; // per point: its lips if a cliff point, else null
  const pushPt = (u: number, t: number, lip: Lip | null): number => {
    pts.push([u, t]);
    cliffLip.push(lip);
    return pts.length - 1;
  };

  for (let i = 0; i < baseGridU; i += 1) {
    const u = uMin + (uMax - uMin) * (i / (baseGridU - 1));
    for (let j = 0; j < baseGridT; j += 1) {
      const t = tLo + (tHi - tLo) * (j / (baseGridT - 1));
      pushPt(u, t, null);
    }
  }

  const edges: Array<[number, number]> = [];
  const segChains: number[][] = []; // ordered cdt-point ids along each cliff
  for (const seg of complex.segments) {
    const chain: number[] = [];
    let prev = -1;
    for (let j = 0; j < baseGridT; j += 1) {
      const s = j / (baseGridT - 1);
      const { u, t } = seg.at(s);
      const { lower, upper } = seg.lipsAt(s);
      const id = pushPt(u, t, { lower, upper });
      chain.push(id);
      if (prev >= 0) edges.push([prev, id]);
      prev = id;
    }
    segChains.push(chain);
  }

  // 3. Constrained Delaunay over the convex domain. The grid's hull IS the
  //    rectangle, so keep every face: an open cliff slit encloses no area, so
  //    `{exterior:false}` drops ALL triangles (verified empirically). Cliff edges
  //    are enforced as constraints and are present in the output.
  const tris = cdt2d(pts, edges, { exterior: true, interior: true });

  return assembleSheetsAndWalls({
    pts,
    tris,
    segChains,
    cliffLip,
    surface,
    H,
    uMin,
    uMax,
    tLo,
    tHi,
  });
}

interface AssembleParams {
  pts: ReadonlyArray<readonly [number, number]>;
  tris: ReadonlyArray<readonly [number, number, number]>;
  segChains: ReadonlyArray<ReadonlyArray<number>>;
  cliffLip: ReadonlyArray<Lip | null>;
  surface: SurfaceRadiusFn;
  H: number;
  uMin: number;
  uMax: number;
  tLo: number;
  tHi: number;
}

/**
 * Emit region-split sheet vertices per CDT triangle, then bridge every cliff with
 * flat wall quads. A cliff point becomes a DISTINCT mesh vertex per incident region
 * (double-valued), lifted to that region's lip radius; the wall reuses those exact
 * vertices, so the seam is closed by construction.
 */
function assembleSheetsAndWalls(p: AssembleParams): Mesh {
  const { pts, tris, segChains, cliffLip, surface, H, uMin, uMax, tLo, tHi } = p;
  const mesh = createMesh();

  const onRimPt = (u: number, t: number): boolean =>
    u <= uMin + RIM_EPS || u >= uMax - RIM_EPS || t <= tLo + RIM_EPS || t >= tHi - RIM_EPS;

  // Region-split registry: one mesh vertex per (cdtPointIndex, region).
  const registry = new Map<string, number>();
  const getV = (pi: number, region: RegionId): number => {
    const k = `${pi}:${region}`;
    const existing = registry.get(k);
    if (existing !== undefined) return existing;
    const [u, t] = pts[pi];
    const lip = cliffLip[pi];
    // Cliff points take the segment's one-sided lip (LO->lower, HI->upper); every
    // other point takes the unambiguous surface radius.
    const r = lip ? (region === 'LO' ? lip.lower : lip.upper) : surface(u, t);
    const [x, y, z] = lift(u, t, r, H);
    const id = addVertex(mesh, x, y, z);
    mesh.vertexOnCliff[id] = lip !== null;
    mesh.vertexOnRim[id] = onRimPt(u, t);
    registry.set(k, id);
    return id;
  };

  // Region of a triangle from its centroid (M1: u>=0.5 -> HI, else LO). No triangle
  // crosses the cliff constraint, so all three of its points resolve to this region.
  const regionOf = (a: number, b: number, c: number): RegionId =>
    (pts[a][0] + pts[b][0] + pts[c][0]) / 3 >= 0.5 ? 'HI' : 'LO';

  // Sheets: each CDT triangle -> its region's split vertices.
  for (const [a, b, c] of tris) {
    const region = regionOf(a, b, c);
    addTriangle(mesh, getV(a, region), getV(b, region), getV(c, region));
  }

  // Walls: bridge the LO rail (lower lip) to the HI rail (upper lip) along each cliff.
  for (const chain of segChains) {
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const loA = getV(chain[i], 'LO');
      const loB = getV(chain[i + 1], 'LO');
      const hiA = getV(chain[i], 'HI');
      const hiB = getV(chain[i + 1], 'HI');
      addQuad(mesh, loA, loB, hiB, hiA);
    }
  }

  return mesh;
}
