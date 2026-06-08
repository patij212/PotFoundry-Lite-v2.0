/**
 * ConformingOuterWall.ts — Orchestrates the conforming outer-wall mesher.
 *
 * Composes the metric sizing field (Task 3), the periodic 2:1-balanced quadtree
 * (Task 4), and the transition-template triangulator (Task 5) into a single
 * watertight-by-construction, T-junction-free, seam-closed outer-wall mesh in
 * (u,t) parameter space. The result is `OuterWallResult`-shaped for the
 * pipeline (Task 8): exact (u,t) positions, shared seam indices, and ordered
 * bottom/top boundary rings for downstream watertight assembly (Plan 3).
 *
 * @module conforming/ConformingOuterWall
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { buildConformingWall } from './ConformingWall';

/** Tuning for the conforming outer wall. */
export interface ConformingOuterWallOptions {
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
   * Optional triangle budget. Scales the sizing field to approach this count,
   * bounded so it never coarsens below the sag-required mesh. Omit for the pure
   * sag-driven mesh.
   */
  targetTriangles?: number;
}

/** Conforming outer-wall mesh result (OuterWallResult-compatible subset). */
export interface ConformingOuterWallResult {
  /** Packed (u,t,0) per vertex — exact positions, no interpolation. */
  vertices: Float32Array;
  /** CCW triangle indices (seam shared). */
  indices: Uint32Array;
  /** Per-triangle seam-wrap flag (see QuadtreeTriangulator). */
  seamTriangles: Uint8Array;
  /** Number of (u,t) grid vertices (= vertices.length / 3). */
  gridVertexCount: number;
  /** Ordered bottom-ring (t=0) vertex indices. */
  bottomRing: number[];
  /** Ordered top-ring (t=1) vertex indices. */
  topRing: number[];
}

/**
 * Thin wrapper over {@link buildConformingWall} for the feature-free outer wall
 * (surfaceId 0, unpinned boundary rings — preserves the Plan 1 behaviour).
 * Plan 3's whole-mesh assembly calls `buildConformingWall` directly with a
 * uniform `nRing` to obtain shared rings.
 */
export function buildConformingOuterWall(
  sampler: SurfaceSampler,
  opts: ConformingOuterWallOptions,
): ConformingOuterWallResult {
  const wall = buildConformingWall(sampler, {
    maxSagMm: opts.maxSagMm,
    maxEdgeMm: opts.maxEdgeMm,
    minEdgeMm: opts.minEdgeMm,
    gradeRatio: opts.gradeRatio,
    maxLevel: opts.maxLevel,
    resU: opts.resU,
    resT: opts.resT,
    targetTriangles: opts.targetTriangles,
    surfaceId: 0,
  });
  return {
    vertices: wall.vertices,
    indices: wall.indices,
    seamTriangles: wall.seamTriangles,
    gridVertexCount: wall.gridVertexCount,
    bottomRing: wall.bottomRing,
    topRing: wall.topRing,
  };
}
