/**
 * WatertightAssembly.ts — Whole-pot watertight-by-construction assembly.
 *
 * Builds the outer and inner walls (conforming, pinned to a shared uniform
 * `nRing`), then joins them with cap surfaces (rim, bottom-under, bottom-top,
 * drain) that REFERENCE the walls' shared ring vertex indices rather than
 * duplicating them. Because every boundary ring is a single set of indices
 * shared by both neighbouring surfaces, the result is watertight by
 * construction — no weld, no repair battery.
 *
 * Output: a combined `{ vertices:(u,t,surfaceId), indices, surfaceRanges }`.
 * The pipeline (T5) GPU-evaluates every packed (u,t,surfaceId) vertex to 3D;
 * each shared ring vertex carries its OWNING surface's triple, and the GPU's
 * evaluate_vertices is constructed so neighbouring surfaces' ring positions
 * coincide exactly (same r, z, twist), so index-sharing yields a closed solid.
 *
 * Geometry per surfaceId (see adaptive_mesh.wgsl evaluate_vertices):
 *  - 0 outer wall: z=t·H
 *  - 1 inner wall: z=tBottom+t·(H−tBottom)
 *  - 2 rim @z=H:           inner-top (t=0) ↔ outer-top (t=1)
 *  - 3 bottom-under @z=0:  outer-bottom (t=0) ↔ drain ring (t=1)
 *  - 4 bottom-top @z=tBottom: inner-bottom (t=0) ↔ drain ring (t=1)
 *  - 5 drain: bottom-under drain ring (t=0, z=0) ↔ bottom-top drain ring (t=1, z=tBottom)
 *
 * If rDrain<=0 there is no drain surface; the two base discs fan to a single
 * centre vertex on the axis.
 *
 * @module conforming/WatertightAssembly
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { buildConformingWall, type ConformingWallResult } from './ConformingWall';
import { annulusStrip, discFan } from './RingStrip';

/** Pot dimensions needed to place the cap/drain surfaces. */
export interface AssemblyDimensions {
  /** Overall height (mm). */
  H: number;
  /** Base thickness — z of the inner-wall bottom / bottom-top disc (mm). */
  tBottom: number;
  /** Drain radius (mm). <=0 ⇒ solid base (discs fan to a centre vertex). */
  rDrain: number;
}

/** Wall tuning shared by both walls (mirrors ConformingWallOptions sans surfaceId). */
export interface AssemblyWallOptions {
  maxSagMm: number;
  maxEdgeMm: number;
  minEdgeMm: number;
  gradeRatio: number;
  maxLevel: number;
  resU: number;
  resT: number;
  /** Uniform ring count — power of two; both walls pin to this. */
  nRing: number;
}

/** Index range and vertex count for one surface in the combined mesh. */
export interface SurfaceRange {
  surfaceId: number;
  /** First index (into `indices`) belonging to this surface. */
  indexStart: number;
  /** One past the last index. */
  indexEnd: number;
  /** Vertices uniquely OWNED by this surface (walls: grid verts; caps: 0 or new ring/centre verts). */
  vertexCount: number;
}

/** Combined watertight mesh in (u,t,surfaceId) parameter space. */
export interface WatertightAssemblyResult {
  /** Packed (u, t, surfaceId) per vertex — GPU-evaluated to 3D downstream. */
  vertices: Float32Array;
  /** Triangle indices into `vertices` (consistently oriented). */
  indices: Uint32Array;
  /** Per-surface index ranges + owned-vertex counts. */
  surfaceRanges: SurfaceRange[];
}

/** Append a wall's packed vertices to `verts`, returning the index offset. */
function appendWall(verts: number[], wall: ConformingWallResult): number {
  const offset = verts.length / 3;
  for (let i = 0; i < wall.vertices.length; i++) verts.push(wall.vertices[i]);
  return offset;
}

/**
 * Assemble the whole pot watertight from an outer and inner wall sampler.
 *
 * @param outerSampler Returns outer-wall 3D positions for (u,t) (surfaceId 0).
 * @param innerSampler Returns inner-wall 3D positions for (u,t) (surfaceId 1).
 * @param dims Pot dimensions (H, tBottom, rDrain).
 * @param opts Wall tuning incl. the shared uniform `nRing`.
 */
export function assembleWatertight(
  outerSampler: SurfaceSampler,
  innerSampler: SurfaceSampler,
  dims: AssemblyDimensions,
  opts: AssemblyWallOptions,
): WatertightAssemblyResult {
  const nRing = opts.nRing;

  // --- 1. Build the two conforming walls (uniform shared rings) -------------
  const wallOpts = {
    maxSagMm: opts.maxSagMm,
    maxEdgeMm: opts.maxEdgeMm,
    minEdgeMm: opts.minEdgeMm,
    gradeRatio: opts.gradeRatio,
    maxLevel: opts.maxLevel,
    resU: opts.resU,
    resT: opts.resT,
    nRing,
  };
  const outer = buildConformingWall(outerSampler, { ...wallOpts, surfaceId: 0 });
  const inner = buildConformingWall(innerSampler, { ...wallOpts, surfaceId: 1 });

  const verts: number[] = [];
  const indices: number[] = [];
  const ranges: SurfaceRange[] = [];

  // --- 2. Concatenate wall vertices; remap each wall's local indices --------
  const outerOffset = appendWall(verts, outer); // 0
  const outerCount = outer.vertices.length / 3;
  const innerOffset = appendWall(verts, inner);
  const innerCount = inner.vertices.length / 3;

  const remap = (offset: number, ring: number[]): number[] =>
    ring.map((i) => i + offset);

  // Shared boundary rings (global indices), each ordered by ascending U.
  const outerTop = remap(outerOffset, outer.topRing); // z=H, r=outer
  const outerBottom = remap(outerOffset, outer.bottomRing); // z=0, r=outer
  const innerTop = remap(innerOffset, inner.topRing); // z=H, r=inner
  const innerBottom = remap(innerOffset, inner.bottomRing); // z=tBottom, r=inner

  // Wall triangle blocks (remapped) recorded as their own surface ranges.
  const pushWallTris = (
    surfaceId: number,
    offset: number,
    vertexCount: number,
    wall: ConformingWallResult,
  ): void => {
    const indexStart = indices.length;
    for (let i = 0; i < wall.indices.length; i++) indices.push(wall.indices[i] + offset);
    ranges.push({ surfaceId, indexStart, indexEnd: indices.length, vertexCount });
  };
  pushWallTris(0, outerOffset, outerCount, outer);
  pushWallTris(1, innerOffset, innerCount, inner);

  // --- 3. Rim (surfaceId 2): annulus inner-top ↔ outer-top, no new verts ----
  {
    const indexStart = indices.length;
    const tri = annulusStrip(innerTop, outerTop, false);
    for (const v of tri) indices.push(v);
    ranges.push({ surfaceId: 2, indexStart, indexEnd: indices.length, vertexCount: 0 });
  }

  const hasDrain = dims.rDrain > 0;

  if (hasDrain) {
    // --- 4. Drain rings (surfaceId 5): NEW vertices, ordered by U ----------
    const drainBottomRing: number[] = []; // z=0   (drain t=0)
    const drainTopRing: number[] = []; // z=tBottom (drain t=1)
    const drainVertStart = verts.length / 3;
    for (let i = 0; i < nRing; i++) {
      const u = i / nRing;
      drainBottomRing.push(verts.length / 3);
      verts.push(u, 0, 5);
    }
    for (let i = 0; i < nRing; i++) {
      const u = i / nRing;
      drainTopRing.push(verts.length / 3);
      verts.push(u, 1, 5);
    }
    const drainVertCount = verts.length / 3 - drainVertStart;

    // bottom-under (3): outer-bottom (t=0) ↔ drain bottom ring (t=1).
    {
      const indexStart = indices.length;
      const tri = annulusStrip(outerBottom, drainBottomRing, false);
      for (const v of tri) indices.push(v);
      ranges.push({ surfaceId: 3, indexStart, indexEnd: indices.length, vertexCount: 0 });
    }
    // bottom-top (4): inner-bottom (t=0) ↔ drain top ring (t=1).
    {
      const indexStart = indices.length;
      const tri = annulusStrip(innerBottom, drainTopRing, false);
      for (const v of tri) indices.push(v);
      ranges.push({ surfaceId: 4, indexStart, indexEnd: indices.length, vertexCount: 0 });
    }
    // drain (5): drain bottom ring (t=0) ↔ drain top ring (t=1).
    {
      const indexStart = indices.length;
      const tri = annulusStrip(drainBottomRing, drainTopRing, false);
      for (const v of tri) indices.push(v);
      ranges.push({
        surfaceId: 5,
        indexStart,
        indexEnd: indices.length,
        vertexCount: drainVertCount,
      });
    }
  } else {
    // --- 4'. Solid base: each disc fans to ONE centre vertex on the axis ---
    // bottom-under (3): outer-bottom ring → centre at z=0.
    const centreUnder = verts.length / 3;
    verts.push(0, 1, 3); // (u=0, t=1, s=3) ⇒ r=rDrain≈0, z=0
    {
      const indexStart = indices.length;
      const tri = discFan(outerBottom, centreUnder, false);
      for (const v of tri) indices.push(v);
      ranges.push({ surfaceId: 3, indexStart, indexEnd: indices.length, vertexCount: 1 });
    }
    // bottom-top (4): inner-bottom ring → centre at z=tBottom.
    const centreTop = verts.length / 3;
    verts.push(0, 1, 4); // (u=0, t=1, s=4) ⇒ r≈0, z=tBottom
    {
      const indexStart = indices.length;
      const tri = discFan(innerBottom, centreTop, false);
      for (const v of tri) indices.push(v);
      ranges.push({ surfaceId: 4, indexStart, indexEnd: indices.length, vertexCount: 1 });
    }
  }

  const vertices = new Float32Array(verts);
  const indexArr = new Uint32Array(indices);

  // --- 5. Orientation: make the closed solid consistently outward -----------
  orientOutward(vertices, indexArr, evalPos.bind(null, dims, outerSampler, innerSampler));

  return { vertices, indices: indexArr, surfaceRanges: ranges };
}

/**
 * 3D position of a packed (u,t,surfaceId) vertex, used only by the orientation
 * pass. Walls defer to their samplers; caps/drain are placed analytically to
 * coincide with the GPU geometry (same r, z as evaluate_vertices). The twist is
 * irrelevant to orientation (a rigid rotation about z preserves winding), so it
 * is omitted here.
 */
function evalPos(
  dims: AssemblyDimensions,
  outerSampler: SurfaceSampler,
  innerSampler: SurfaceSampler,
  u: number,
  t: number,
  surfaceId: number,
): [number, number, number] {
  if (surfaceId < 0.5) {
    const p = outerSampler.position(u, t);
    return [p[0], p[1], p[2]];
  }
  if (surfaceId < 1.5) {
    const p = innerSampler.position(u, t);
    return [p[0], p[1], p[2]];
  }
  const theta = 2 * Math.PI * (u - Math.floor(u));
  // Radii at the rings (twist-free; radial magnitude is all the orient pass needs).
  const rOuterTop = radial(outerSampler.position(u, 1));
  const rOuterBot = radial(outerSampler.position(u, 0));
  const rInnerTop = radial(innerSampler.position(u, 1));
  const rInnerBot = radial(innerSampler.position(u, 0));
  let r: number;
  let z: number;
  if (surfaceId < 2.5) {
    r = rInnerTop + (rOuterTop - rInnerTop) * t;
    z = dims.H;
  } else if (surfaceId < 3.5) {
    r = rOuterBot + (dims.rDrain - rOuterBot) * t;
    z = 0;
  } else if (surfaceId < 4.5) {
    r = rInnerBot + (dims.rDrain - rInnerBot) * t;
    z = dims.tBottom;
  } else {
    r = dims.rDrain;
    z = t * dims.tBottom;
  }
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

function radial(p: readonly number[]): number {
  return Math.hypot(p[0], p[1]);
}

/**
 * Make every triangle consistently outward-facing. The mesh is a single closed
 * manifold built from index-shared rings, so a position-welded edge adjacency
 * is connected; flood-fill orientation from a seed, then flip the whole mesh if
 * its signed volume is negative (i.e. it came out inward). Deterministic and
 * purely topological — not a repair/weld pass (it never merges/moves vertices).
 */
function orientOutward(
  packed: Float32Array,
  indices: Uint32Array,
  posOf: (u: number, t: number, s: number) => [number, number, number],
): void {
  const triCount = indices.length / 3;
  if (triCount === 0) return;

  // Weld vertices by 3D position so shared-ring edges are identified.
  const n = packed.length / 3;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = posOf(packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2]);
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
  }
  const inv = 1 / 1e-4;
  const weld = new Uint32Array(n);
  const buckets = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * inv)},${Math.round(pos[i * 3 + 1] * inv)},${Math.round(pos[i * 3 + 2] * inv)}`;
    const ex = buckets.get(key);
    if (ex === undefined) { buckets.set(key, i); weld[i] = i; }
    else weld[i] = ex;
  }

  // Map each undirected welded edge to the (up to two) triangles using it.
  const edgeTris = new Map<string, number[]>();
  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a}:${b}` : `${b}:${a}`;
  for (let t = 0; t < triCount; t++) {
    const a = weld[indices[t * 3]];
    const b = weld[indices[t * 3 + 1]];
    const c = weld[indices[t * 3 + 2]];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const k = edgeKey(i, j);
      let list = edgeTris.get(k);
      if (!list) { list = []; edgeTris.set(k, list); }
      list.push(t);
    }
  }

  // Flood-fill: neighbours across a shared edge must traverse it in opposite
  // directions. Flip a neighbour whose directed edge matches ours.
  const oriented = new Uint8Array(triCount);
  const flip = (t: number): void => {
    const i0 = t * 3;
    const tmp = indices[i0 + 1];
    indices[i0 + 1] = indices[i0 + 2];
    indices[i0 + 2] = tmp;
  };
  const directedHas = (t: number, i: number, j: number): boolean => {
    const a = weld[indices[t * 3]];
    const b = weld[indices[t * 3 + 1]];
    const c = weld[indices[t * 3 + 2]];
    return (
      (a === i && b === j) ||
      (b === i && c === j) ||
      (c === i && a === j)
    );
  };
  for (let seed = 0; seed < triCount; seed++) {
    if (oriented[seed]) continue;
    oriented[seed] = 1;
    const stack = [seed];
    while (stack.length > 0) {
      const t = stack.pop() as number;
      const a = weld[indices[t * 3]];
      const b = weld[indices[t * 3 + 1]];
      const c = weld[indices[t * 3 + 2]];
      const dirEdges: Array<[number, number]> = [[a, b], [b, c], [c, a]];
      for (const [i, j] of dirEdges) {
        if (i === j) continue;
        const list = edgeTris.get(edgeKey(i, j));
        if (!list) continue;
        for (const nb of list) {
          if (nb === t || oriented[nb]) continue;
          // Consistent if the neighbour traverses (i,j) as (j,i). If it has the
          // SAME directed edge, flip it.
          if (directedHas(nb, i, j)) flip(nb);
          oriented[nb] = 1;
          stack.push(nb);
        }
      }
    }
  }

  // Global sense: if the signed volume is negative the mesh is inward — flip all.
  let vol6 = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
    const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];
    vol6 +=
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx);
  }
  if (vol6 < 0) {
    for (let t = 0; t < triCount; t++) flip(t);
  }
}
