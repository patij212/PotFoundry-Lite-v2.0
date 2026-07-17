// types.ts — shared contracts for the standalone double-valued-wall mesher.
//
// Isolated module (src/geometry/doubleValued/). Touches no production mesher.
// P3 M1: prove constrained-CDT -> region-classify -> vertex-split -> wall-bridge
// -> verify on the simplest synthetic input (one straight vertical cliff).

/**
 * Growable triangle mesh accumulated during a build.
 * `positions` is flat xyz (3 per vertex); `triangles` is flat vertex indices (3 per face).
 * The two per-vertex tag arrays (index-aligned with vertices) let `verify.auditManifold`
 * classify open edges without re-deriving geometry from 3D positions.
 */
export interface Mesh {
  positions: number[];
  triangles: number[];
  /** True where the vertex is a cliff split-vertex (its source (u,t) lay on a cliff locus). */
  vertexOnCliff: boolean[];
  /** True where the vertex sits on the declared-open outer domain rim (u=0/1 or t=tLo/tHi). */
  vertexOnRim: boolean[];
}

/** Exact radius at a domain point: (u,t) -> r (mm). */
export type SurfaceRadiusFn = (u: number, t: number) => number;

/** A single declared cliff curve: a parametric polyline in (u,t) with one-sided lip radii. */
export interface SegLike {
  at(s: number): { u: number; t: number };
  lipsAt(s: number): { upper: number; lower: number };
  tRange: readonly [number, number];
}

/** A declared crossing junction with its shared pinch double-vertex (used from M3). */
export interface JunLike {
  u: number;
  t: number;
  pinch: { upper: number; lower: number };
}

/** The generic cliff complex the mesher consumes (style-agnostic). */
export interface CliffComplexLike {
  segments: readonly SegLike[];
  junctions: readonly JunLike[];
}

/** Tuning knobs for a build. */
export interface MeshBuildOptions {
  baseGridU: number;
  baseGridT: number;
  chordTolMm: number;
  maxRefinePasses: number;
}
