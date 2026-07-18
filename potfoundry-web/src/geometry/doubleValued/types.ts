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

/**
 * A declared C0 CREASE inside a sheet (e.g. a ridge apex): a conforming constraint the
 * triangulation must not cross, but which — unlike a cliff — does NOT split regions and
 * gets no wall (same region, same surface branch on both sides). Its points lift to
 * `surface(u,t)`.
 */
export interface CreaseLike {
  at(s: number): { u: number; t: number };
  tRange: readonly [number, number];
}

/** The generic cliff complex the mesher consumes (style-agnostic). */
export interface CliffComplexLike {
  segments: readonly SegLike[];
  junctions: readonly JunLike[];
  /** Optional in-sheet creases (ridge apexes) to conform to without splitting/walling. */
  creases?: readonly CreaseLike[];
}

/** An explicit rectangular (u,t) domain window (normalized u in [0,1], t in [0,1]). */
export interface DomainWindow {
  uMin: number;
  uMax: number;
  tLo: number;
  tHi: number;
}

/** Tuning knobs for a build. */
export interface MeshBuildOptions {
  baseGridU: number;
  baseGridT: number;
  chordTolMm: number;
  maxRefinePasses: number;
  /**
   * Explicit domain window. When omitted the mesher uses the M1 default (full circle
   * u in [0,1], t spanning the cliff band) — the straight-cliff stand-in. Real cases
   * (a local strand patch) pass the isolated window here.
   */
  domain?: DomainWindow;
  /**
   * Extra interior (u,t) grid points appended to the base lattice. A style entry uses
   * this to structurally seed a thin anisotropic feature (e.g. the ribbon interior
   * between its two cliffs) so a single CDT resolves it, instead of relying on many
   * iterative refine passes. Points inside a region are lifted by `surface`.
   */
  seedPoints?: ReadonlyArray<readonly [number, number]>;
  /**
   * Reference triangle soup driving the refine chord metric. When supplied it MUST conform
   * to the sharp features (cliffs + creases), else a uniform soup's flat cells under-cut a
   * correct sharp apex and fabricate a false floor. When omitted the mesher builds a
   * uniform soup from `surface` (fine for smooth sheets; not apex-accurate).
   */
  refSoup?: ReadonlyArray<RefTri>;
}

/** A 3D point [x,y,z] (mm). */
export type Vec3 = [number, number, number];

/** A reference-surface triangle (three 3D corners) for chord measurement. */
export type RefTri = readonly [Vec3, Vec3, Vec3];

/** Refinement bookkeeping filled by `buildDoubleValuedMesh` (no silent caps). */
export interface BuildStats {
  /** Number of refine iterations actually performed (0 = base build only). */
  refinePasses: number;
  /** Interior sheet points inserted across all passes (centroids of high-chord tris). */
  addedSheetPoints: number;
  /** Cliff arc-intervals split across all passes (each adds one cliff sample). */
  splitCliffEdges: number;
  /** Cliff edges that could not be walled (fewer than two incident regions) — must be 0. */
  unwalledCliffEdges: number;
  /** Max per-triangle chord (mm) of the returned mesh at the last measured pass. */
  maxAnalyticChordMm: number;
  /** Sampling-set size at which refinement was halted by the point cap (0 = not hit). */
  pointCapHit: number;
}

/** The verified per-build report returned by the CelticKnot entry. */
export interface MeshReport {
  vertexCount: number;
  triangleCount: number;
  /** Edges shared by > 2 triangles (must be 0). */
  nonManifold: number;
  /** Total open (count-1) edges. */
  boundary: number;
  /** Open edges along a cliff that are NOT on a rim (a crack in the wall; must be 0). */
  cliffBoundary: number;
  /** Open edges with an endpoint off the domain rim (any interior hole; must be 0). */
  boundaryNonRim: number;
  /** Max distance (mm) from the mesh to the dense true-surface reference. */
  maxChordMm: number;
  /** RMS distance (mm) from the mesh to the reference. */
  rmsChordMm: number;
  /** Refine iterations performed. */
  refinePasses: number;
}
