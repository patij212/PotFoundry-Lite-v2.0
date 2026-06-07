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
import { MetricSizingField } from './MetricSizingField';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree } from './QuadtreeTriangulator';

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

const RING_EPS = 1e-6;

export function buildConformingOuterWall(
  sampler: SurfaceSampler,
  opts: ConformingOuterWallOptions,
): ConformingOuterWallResult {
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
  });

  const mesh = triangulateQuadtree(quadtree);

  // Ordered boundary rings at t=0 and t=1 (by increasing u). The seam is
  // already index-shared, so each ring is a single closed loop.
  const n = mesh.vertices.length / 3;
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
