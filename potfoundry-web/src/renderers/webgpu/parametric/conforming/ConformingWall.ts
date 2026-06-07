/**
 * ConformingWall.ts — Conforming wall mesher with pinned uniform boundary rings.
 *
 * Generalizes the outer-wall mesher to ANY wall sampler (outer surfaceId 0 or
 * inner surfaceId 1) and pins the t=0 / t=1 boundary rows to a uniform `nRing`
 * = 2^pin U-samples (U = i/nRing). Because every wall is pinned to the SAME
 * `nRing`, adjacent surfaces share ring vertices BY INDEX in the watertight
 * assembly (Plan 3) — no weld, no repair.
 *
 * Pipeline: sampler → metric sizing field → periodic 2:1-balanced quadtree
 * (pinBoundaryLevel = log2(nRing)) → transition-template triangulation. The
 * result packs each vertex as `(u, t, surfaceId)` so the GPU can evaluate every
 * vertex by its own triple, and exposes the two ordered boundary rings (each
 * exactly `nRing` vertices, ordered by increasing U) for cap stitching.
 *
 * `buildConformingOuterWall` (Plan 1) is re-expressed as a thin wrapper.
 *
 * @module conforming/ConformingWall
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { MetricSizingField } from './MetricSizingField';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree } from './QuadtreeTriangulator';

/** Tuning for a conforming wall. */
export interface ConformingWallOptions {
  /** Maximum chord sagitta (mm). */
  maxSagMm: number;
  /** Upper clamp on target edge length (mm). */
  maxEdgeMm: number;
  /** Lower clamp on target edge length (mm). */
  minEdgeMm: number;
  /** Lipschitz grading ratio (≥ 1). */
  gradeRatio: number;
  /** Deepest quadtree level allowed. */
  maxLevel: number;
  /** Sizing-field grid resolution in u. */
  resU: number;
  /** Sizing-field grid resolution in t. */
  resT: number;
  /**
   * Uniform boundary-ring sample count. When set it MUST be a power of two; the
   * t=0 and t=1 rows are then pinned to exactly `nRing` cells (pinBoundaryLevel
   * = log2(nRing)). Omit to disable pinning (legacy unpinned behaviour).
   */
  nRing?: number;
  /** Surface id written into each vertex's third slot (0 = outer, 1 = inner). */
  surfaceId: number;
}

/** Conforming wall mesh result with uniform shared boundary rings. */
export interface ConformingWallResult {
  /** Packed (u, t, surfaceId) per vertex — exact positions, no interpolation. */
  vertices: Float32Array;
  /** CCW triangle indices (seam shared). */
  indices: Uint32Array;
  /** Per-triangle seam-wrap flag (see QuadtreeTriangulator). */
  seamTriangles: Uint8Array;
  /** Number of (u,t) grid vertices (= vertices.length / 3). */
  gridVertexCount: number;
  /** Ordered bottom-ring (t=0) vertex indices, length nRing, U=i/nRing ascending. */
  bottomRing: number[];
  /** Ordered top-ring (t=1) vertex indices, length nRing, U=i/nRing ascending. */
  topRing: number[];
}

const RING_EPS = 1e-6;

/** True iff `n` is a positive power of two. */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/**
 * Build a conforming wall with uniform `nRing` t=0/t=1 boundary rings.
 *
 * The quadtree pins the boundary rows to level `log2(nRing)` so each ring is
 * exactly `nRing` vertices at U = i/nRing. Vertices are packed (u, t, surfaceId).
 */
export function buildConformingWall(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
): ConformingWallResult {
  let pinBoundaryLevel = 0;
  if (opts.nRing !== undefined) {
    if (!isPowerOfTwo(opts.nRing)) {
      throw new Error(`buildConformingWall: nRing must be a power of two (got ${opts.nRing})`);
    }
    pinBoundaryLevel = Math.round(Math.log2(opts.nRing));
    if (pinBoundaryLevel > opts.maxLevel) {
      throw new Error(
        `buildConformingWall: log2(nRing)=${pinBoundaryLevel} exceeds maxLevel=${opts.maxLevel}`,
      );
    }
  }

  const field = new MetricSizingField(sampler, {
    maxSagMm: opts.maxSagMm,
    minEdgeMm: opts.minEdgeMm,
    maxEdgeMm: opts.maxEdgeMm,
    gradeRatio: opts.gradeRatio,
    resU: opts.resU,
    resT: opts.resT,
  });

  const quadtree = new PeriodicBalancedQuadtree(field, sampler, {
    maxLevel: opts.maxLevel,
    pinBoundaryLevel,
  });

  const mesh = triangulateQuadtree(quadtree);

  // Stamp the surfaceId into each vertex's third slot (the triangulator packs 0
  // there). The GPU evaluates each vertex by its own (u, t, surfaceId) triple.
  const n = mesh.vertices.length / 3;
  if (opts.surfaceId !== 0) {
    for (let i = 0; i < n; i++) mesh.vertices[i * 3 + 2] = opts.surfaceId;
  }

  // Ordered boundary rings at t=0 and t=1 (by increasing u). The seam is already
  // index-shared, so each ring is a single closed loop of exactly nRing verts.
  const bottom: number[] = [];
  const top: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = mesh.vertices[i * 3 + 1];
    if (t < RING_EPS) bottom.push(i);
    else if (t > 1 - RING_EPS) top.push(i);
  }
  const byU = (a: number, b: number): number =>
    mesh.vertices[a * 3] - mesh.vertices[b * 3];
  bottom.sort(byU);
  top.sort(byU);

  return {
    vertices: mesh.vertices,
    indices: mesh.indices,
    seamTriangles: mesh.seamTriangles,
    gridVertexCount: n,
    bottomRing: bottom,
    topRing: top,
  };
}
