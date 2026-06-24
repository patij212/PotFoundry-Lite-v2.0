/**
 * corridorPave.ts — feature-aligned interior paving welded at the dyadic seam
 * (Q2 of the dyadic-edge-seam spike).
 *
 * Q1 ({@link module:fidelity/bandRemesh/seamFill}) proved the UNIVERSAL seam: an
 * externally-filled region bounded by WHOLE dyadic cell edges, reusing the
 * complement's EXACT hole-boundary vertices (corners + 2:1-balance mid-edges),
 * welds watertight to the production complement. Q1 used a trivial ear-clip fill
 * — correct topology, arbitrary shape — and DID NOT care about the interior.
 *
 * Q2 replaces that ear-clip with a fill that makes the interior triangles FOLLOW
 * a feature (the cure for serration). The corridor is triangulated as ONE region
 * (the per-cell axis-aligned geometry that produced the serration slivers is
 * dissolved), with:
 *
 *   - the FEATURE polyline pinned as OUR OWN constraint edge-chain, densified
 *     inside the corridor → the feature becomes a smooth, continuous mesh edge
 *     chain (no staircase), and
 *   - the BOUNDARY pinned to the EXACT Q1 hole-boundary vertex ids (corners +
 *     2:1 mid-edges, passed as a closed constraint loop so cdt2d keeps every one)
 *     → the seam still welds by the Q1 guarantee (the feature is internal to our
 *     fill; the seam is never the feature).
 *
 * The kernel is `cdt2d` (constrained Delaunay) — the SAME library
 * {@link module:conforming/ConstrainedCellTriangulator} uses — run ONCE on the
 * whole corridor (not per-cell). New interior vertices (densified feature points
 * + interior Steiner points for quality) are fine: they are strictly INTERIOR to
 * the corridor, never on the seam.
 *
 * Pure CPU (analytic / CPU `styleSampler`), no GPU/DOM.
 *
 * @module fidelity/bandRemesh/corridorPave
 */

import cdt2d from 'cdt2d';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { HoleBoundary } from './seamFill';

/** A point in (u,t) parameter space. */
export interface UTPoint {
  u: number;
  t: number;
}

/** Inputs for {@link corridorPave}. */
export interface CorridorPaveInput {
  /** The Q1 hole boundary (loops of EXISTING vertex ids + the complement dirs). */
  boundary: HoleBoundary;
  /** (u,t) per EXISTING merged vertex id (the Q1 id-space). Read-only. */
  vertexUT: Array<[number, number]>;
  /**
   * The analytic feature locus as a dense (u,t) polyline (open chain). Its
   * endpoints should lie at or beyond the corridor so it crosses the whole hole;
   * {@link corridorPave} clips it to the hole interior and SNAPS the two crossing
   * points onto the NEAREST EXISTING hole-boundary vertex ids (so NO new boundary
   * vertex is minted → the Q1 seam guarantee is preserved).
   */
  featurePolyline: UTPoint[];
  /** Surface sampler (for 3D-aware orientation; reserved — cdt2d works in (u,t)). */
  sampler: SurfaceSampler;
  /**
   * Target interior edge length in (u,t) for feature densification + Steiner fill.
   * When omitted, it is AUTO-CALIBRATED to the median dyadic boundary-edge length
   * (the 2:1-balanced mid-edge spacing). This is the load-bearing quality lever:
   * a Steiner density matching the dense staircase boundary lets cdt2d's Delaunay
   * produce near-equilateral triangles right up to the wall (a coarse interior
   * against a dense boundary fans into slivers — MEASURED 45% → 0.06% `<10°`).
   */
  targetEdgeUT?: number;
}

/** Result of {@link corridorPave}. */
export interface CorridorPaveResult {
  /**
   * (u,t) for EVERY vertex the fill indexes. The first `boundary.vertexCount`-ish
   * span is the EXISTING ids (identity-mapped: `vertexUT[id]`); appended entries
   * (ids ≥ `existingCount`) are NEW interior vertices (feature densification +
   * Steiner). The seam-welding boundary ids are unchanged.
   */
  vertexUT: Array<[number, number]>;
  /** Number of existing (Q1) vertices — ids `< existingCount` are seam-shared. */
  existingCount: number;
  /** Fill triangles (CCW in (u,t)) indexing into {@link vertexUT}. */
  triangles: Array<[number, number, number]>;
  /**
   * The feature as a chain of vertex ids (into {@link vertexUT}): consecutive
   * pairs are the densified feature segments that MUST appear as mesh edges. The
   * first and last are EXISTING hole-boundary ids (the snapped crossings).
   */
  featureChainIds: number[];
  /** cdt2d emitted a CW triangle flipped to CCW — a fold-over signal (should be ~0). */
  inversionCount: number;
  /** (u,t)-degenerate triangles dropped by the winding normalizer. */
  droppedCount: number;
}

/** Twice the signed area of triangle (a,b,c) in (u,t). Positive ⇒ CCW. */
function tri2(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
}

/** Signed area (×2) of a loop polygon in (u,t). Positive = CCW. */
function loopSignedArea2(
  loop: number[],
  vertexUT: Array<[number, number]>,
): number {
  let s = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ui, ti] = vertexUT[loop[i]];
    const [uj, tj] = vertexUT[loop[j]];
    s += uj * ti - ui * tj;
  }
  return s;
}

/** Point-in-polygon (even-odd) for a (u,t) loop of vertex ids. */
function pointInLoop(
  pu: number,
  pt: number,
  loop: number[],
  vertexUT: Array<[number, number]>,
): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ui, ti] = vertexUT[loop[i]];
    const [uj, tj] = vertexUT[loop[j]];
    const intersect =
      ti > pt !== tj > pt &&
      pu < ((uj - ui) * (pt - ti)) / (tj - ti) + ui;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 2D distance in (u,t). */
function dist2(au: number, at: number, bu: number, bt: number): number {
  return Math.hypot(au - bu, at - bt);
}

/**
 * Median undirected boundary-edge length over all loops (in (u,t)). This is the
 * dyadic 2:1 mid-edge spacing — the density the interior Steiner fill should match
 * so cdt2d's Delaunay stays near-equilateral up to the dense staircase wall.
 */
function medianBoundaryEdge(
  boundary: HoleBoundary,
  vertexUT: Array<[number, number]>,
): number {
  const lens: number[] = [];
  for (const loop of boundary.loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = vertexUT[loop[i]];
      const b = vertexUT[loop[(i + 1) % loop.length]];
      lens.push(dist2(a[0], a[1], b[0], b[1]));
    }
  }
  if (lens.length === 0) return 0.008; // degenerate fallback
  lens.sort((x, y) => x - y);
  return lens[Math.floor(lens.length / 2)];
}

/**
 * Snap a (u,t) point onto the NEAREST existing hole-boundary vertex id (over all
 * loops). Used to pin the feature's hole-crossing endpoints to EXISTING ids so no
 * new boundary vertex is minted (the Q1 seam guarantee).
 */
function snapToBoundaryId(
  pu: number,
  pt: number,
  boundary: HoleBoundary,
  vertexUT: Array<[number, number]>,
): number {
  let bestId = -1;
  let bestD = Infinity;
  for (const loop of boundary.loops) {
    for (const id of loop) {
      const [u, t] = vertexUT[id];
      const d = dist2(pu, pt, u, t);
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    }
  }
  return bestId;
}

/**
 * Densify the open feature polyline into interior (u,t) points at ~targetEdgeUT
 * spacing, KEEPING only the strictly-interior portion of the hole (the part NOT
 * snapped to the boundary). Returns the interior densified (u,t) list ordered
 * from the start crossing toward the end crossing.
 */
function densifyInteriorFeature(
  featurePolyline: UTPoint[],
  startBoundary: [number, number],
  endBoundary: [number, number],
  targetEdgeUT: number,
): Array<[number, number]> {
  // Find the polyline arc strictly between the two boundary crossings. The
  // crossings are the closest polyline points to startBoundary / endBoundary.
  let iStart = 0;
  let iEnd = featurePolyline.length - 1;
  let dStart = Infinity;
  let dEnd = Infinity;
  for (let i = 0; i < featurePolyline.length; i++) {
    const p = featurePolyline[i];
    const ds = dist2(p.u, p.t, startBoundary[0], startBoundary[1]);
    const de = dist2(p.u, p.t, endBoundary[0], endBoundary[1]);
    if (ds < dStart) {
      dStart = ds;
      iStart = i;
    }
    if (de < dEnd) {
      dEnd = de;
      iEnd = i;
    }
  }
  const lo = Math.min(iStart, iEnd);
  const hi = Math.max(iStart, iEnd);
  const arc = featurePolyline.slice(lo, hi + 1);
  if (iStart > iEnd) arc.reverse();

  // Resample the arc at ~targetEdgeUT (interior points only: drop the two ends,
  // which coincide with the snapped boundary vertices).
  const out: Array<[number, number]> = [];
  for (let i = 0; i + 1 < arc.length; i++) {
    const a = arc[i];
    const b = arc[i + 1];
    const segLen = dist2(a.u, a.t, b.u, b.t);
    const nSub = Math.max(1, Math.round(segLen / targetEdgeUT));
    for (let s = 0; s < nSub; s++) {
      const f = s / nSub;
      out.push([a.u + (b.u - a.u) * f, a.t + (b.t - a.t) * f]);
    }
  }
  out.push([arc[arc.length - 1].u, arc[arc.length - 1].t]);
  // Drop the first and last samples: they are the boundary crossings (snapped to
  // EXISTING ids by the caller). The remaining are strictly-interior.
  return out.slice(1, out.length - 1);
}

/**
 * Pave the corridor (the Q1 hole) so the interior triangles FOLLOW the feature,
 * the boundary pinned to the EXACT Q1 hole-boundary vertex ids (so the seam still
 * welds), via a single constrained Delaunay triangulation (cdt2d) of the WHOLE
 * corridor as one region.
 *
 * Construction:
 *  1. Snap the feature's two hole-crossings onto the NEAREST existing
 *     hole-boundary vertex ids (no new boundary vertex → Q1 seam preserved).
 *  2. Densify the interior feature arc → NEW interior vertices; the feature
 *     chain is [snappedStart, ...interiorFeature, snappedEnd] (all by id).
 *  3. Scatter interior Steiner points on a (u,t) grid, keeping only those
 *     strictly inside the hole and away from the feature/boundary, for quality.
 *  4. Run cdt2d ONCE: boundary loops as closed constraint edges (keeps every
 *     corner + 2:1 mid-edge), the feature chain as constraint edges, `{exterior:
 *     false}` to keep the corridor interior. Normalize winding to CCW.
 *
 * The returned `triangles` index a vertex table whose ids `< existingCount` are
 * the UNCHANGED Q1 ids (seam-shared); appended ids are interior-only.
 */
export function corridorPave(input: CorridorPaveInput): CorridorPaveResult {
  const { boundary, vertexUT, featurePolyline } = input;

  // Interior edge target: AUTO-CALIBRATE to the median dyadic boundary-edge length
  // when not given (the load-bearing quality lever — see CorridorPaveInput).
  const targetEdgeUT = input.targetEdgeUT ?? medianBoundaryEdge(boundary, vertexUT);

  // The outer loop (largest |area|) bounds the hole; any others are inner holes.
  const loopsByArea = boundary.loops
    .map((loop) => ({ loop, area: Math.abs(loopSignedArea2(loop, vertexUT)) }))
    .sort((a, b) => b.area - a.area);
  const outerLoop = loopsByArea[0].loop;

  // ── 1. Snap the feature's two hole-crossings to existing boundary ids. ──────
  // The feature enters/exits the hole; use its first/last polyline points as the
  // crossing seeds and snap each to the nearest existing boundary vertex id.
  const fHead = featurePolyline[0];
  const fTail = featurePolyline[featurePolyline.length - 1];
  const startId = snapToBoundaryId(fHead.u, fHead.t, boundary, vertexUT);
  const endId = snapToBoundaryId(fTail.u, fTail.t, boundary, vertexUT);
  const startUT = vertexUT[startId];
  const endUT = vertexUT[endId];

  // ── Combined point table: existing ids first (identity), then NEW interior. ─
  const existingCount = vertexUT.length;
  const points: Array<[number, number]> = vertexUT.map((p) => [p[0], p[1]]);
  const addInterior = (u: number, t: number): number => {
    const id = points.length;
    points.push([u, t]);
    return id;
  };

  // ── 2. Densify the interior feature arc → NEW interior ids → the chain. ─────
  const interiorFeatureUT = densifyInteriorFeature(
    featurePolyline,
    startUT,
    endUT,
    targetEdgeUT,
  );
  const featureChainIds: number[] = [startId];
  for (const [u, t] of interiorFeatureUT) featureChainIds.push(addInterior(u, t));
  featureChainIds.push(endId);

  // ── 3. Interior Steiner grid for quality (strictly inside, off the feature). ─
  // Grid spacing ~targetEdgeUT; reject points within ~0.6·targetEdgeUT of the
  // feature chain or a boundary vertex (so cdt2d does not produce slivers there).
  const minU = Math.min(...outerLoop.map((id) => vertexUT[id][0]));
  const maxU = Math.max(...outerLoop.map((id) => vertexUT[id][0]));
  const minT = Math.min(...outerLoop.map((id) => vertexUT[id][1]));
  const maxT = Math.max(...outerLoop.map((id) => vertexUT[id][1]));
  const featurePts = featureChainIds.map((id) => points[id]);
  const reject = targetEdgeUT * 0.6;
  const nearFeature = (u: number, t: number): boolean => {
    for (let i = 0; i + 1 < featurePts.length; i++) {
      const a = featurePts[i];
      const b = featurePts[i + 1];
      const du = b[0] - a[0];
      const dt = b[1] - a[1];
      const len2 = du * du + dt * dt;
      let f = 0;
      if (len2 > 1e-24) f = Math.max(0, Math.min(1, ((u - a[0]) * du + (t - a[1]) * dt) / len2));
      const d = dist2(u, t, a[0] + du * f, a[1] + dt * f);
      if (d < reject) return true;
    }
    return false;
  };
  const nearBoundary = (u: number, t: number): boolean => {
    for (const loop of boundary.loops) {
      for (const id of loop) {
        if (dist2(u, t, vertexUT[id][0], vertexUT[id][1]) < reject) return true;
      }
    }
    return false;
  };
  for (let u = minU + targetEdgeUT; u < maxU; u += targetEdgeUT) {
    for (let t = minT + targetEdgeUT; t < maxT; t += targetEdgeUT) {
      if (!pointInLoop(u, t, outerLoop, vertexUT)) continue;
      // Reject if inside an INNER hole loop (multiply-connected corridor).
      let inInner = false;
      for (let li = 1; li < loopsByArea.length; li++) {
        if (pointInLoop(u, t, loopsByArea[li].loop, vertexUT)) {
          inInner = true;
          break;
        }
      }
      if (inInner) continue;
      if (nearFeature(u, t) || nearBoundary(u, t)) continue;
      addInterior(u, t);
    }
  }

  // ── 4. cdt2d ONCE over the whole corridor. ─────────────────────────────────
  const edgeKeys = new Set<string>();
  const edges: Array<[number, number]> = [];
  const addEdge = (a: number, b: number): void => {
    if (a === b) return;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push([a, b]);
  };
  // Boundary loops as CLOSED constraint loops (keeps corners + 2:1 mid-edges).
  for (const loop of boundary.loops) {
    for (let i = 0; i < loop.length; i++) addEdge(loop[i], loop[(i + 1) % loop.length]);
  }
  // Feature chain as constraint edges (the cure — it becomes a mesh edge chain).
  for (let i = 0; i + 1 < featureChainIds.length; i++) {
    addEdge(featureChainIds[i], featureChainIds[i + 1]);
  }

  const raw = cdt2d(points, edges, { exterior: false }) as Array<[number, number, number]>;

  // Normalize winding to CCW in (u,t); count fold-overs and (u,t)-degenerate drops.
  const triangles: Array<[number, number, number]> = [];
  let inversionCount = 0;
  let droppedCount = 0;
  for (const [a, b, c] of raw) {
    const area = tri2(points[a], points[b], points[c]);
    if (area > 0) triangles.push([a, b, c]);
    else if (area < 0) {
      triangles.push([a, c, b]);
      inversionCount++;
    } else droppedCount++;
  }

  // Drop any triangle whose CENTROID is inside an inner hole loop (cdt2d with
  // {exterior:false} keeps faces between nested loops; for a simply-connected
  // corridor there are none, but guard for the multiply-connected case).
  let filtered = triangles;
  if (loopsByArea.length > 1) {
    filtered = triangles.filter(([a, b, c]) => {
      const cu = (points[a][0] + points[b][0] + points[c][0]) / 3;
      const ct = (points[a][1] + points[b][1] + points[c][1]) / 3;
      for (let li = 1; li < loopsByArea.length; li++) {
        if (pointInLoop(cu, ct, loopsByArea[li].loop, vertexUT)) return false;
      }
      return true;
    });
  }

  // ── 5. Reconcile orientation to the complement (weld count-2). ─────────────
  // cdt2d gives CCW-in-(u,t) triangles, but the complement traverses each
  // hole-boundary edge in a fixed direction; the fill must traverse it OPPOSITE
  // so the merged edge welds with consistent winding (one complement tri + one
  // fill tri). All fill tris share one (u,t) handedness → ONE boundary edge
  // decides the global flip (identical reasoning to Q1's fillHole).
  const flipped = reconcileToComplement(filtered, boundary);

  return {
    vertexUT: points,
    existingCount,
    triangles: flipped,
    featureChainIds,
    inversionCount,
    droppedCount,
  };
}

/** Canonical undirected edge key (i<j). */
function edgeKeyOf(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/**
 * Flip the WHOLE fill (if needed) so each hole-boundary edge is traversed
 * OPPOSITE to the complement's single triangle → the merged edge welds count-2.
 * The decision is made from ANY one boundary edge: all CCW-(u,t) fill triangles
 * share one handedness, so one flip flips the loop consistently.
 */
function reconcileToComplement(
  triangles: Array<[number, number, number]>,
  boundary: HoleBoundary,
): Array<[number, number, number]> {
  const boundaryEdges = new Set<string>();
  for (const loop of boundary.loops) {
    for (let i = 0; i < loop.length; i++) {
      boundaryEdges.add(edgeKeyOf(loop[i], loop[(i + 1) % loop.length]));
    }
  }
  let needFlip: boolean | undefined;
  outer: for (const tri of triangles) {
    for (let e = 0; e < 3; e++) {
      const i = tri[e];
      const j = tri[(e + 1) % 3];
      const ek = edgeKeyOf(i, j);
      if (!boundaryEdges.has(ek)) continue;
      const compDir = boundary.complementDir.get(ek);
      if (!compDir) continue;
      // Complement traverses compDir[0]→compDir[1]. To weld count-2 the fill must
      // traverse this edge OPPOSITE; flip iff the fill currently matches it.
      needFlip = i === compDir[0] && j === compDir[1];
      break outer;
    }
  }
  if (!needFlip) return triangles;
  return triangles.map((tri) => [tri[0], tri[2], tri[1]] as [number, number, number]);
}
