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
  /**
   * Source domain coordinates the vertex was lifted from (index-aligned with vertices).
   * Exposed READ-ONLY so an independent certifier can recover (u,t) exactly instead of
   * un-projecting the 3D position — and, crucially, WITHOUT going through the region
   * classifier (the classifier only picks each cliff vertex's lip radius, never its (u,t)).
   */
  vertexU: number[];
  vertexT: number[];
  /**
   * Dense region id (topological connected component) the vertex belongs to. Region
   * MEMBERSHIP is pure triangle-adjacency topology — independent of the ribbon/background
   * LABEL — so it is a sound basis for a classifier-independent cross-check.
   */
  vertexRegion: number[];
  /**
   * For a cliff split-vertex, the index of the cliff SEGMENT (in `complex.segments` order)
   * whose locus it sits on; −1 for sheet vertices. Lets the certifier measure a neighbour's
   * side against the cliff CURVE at the neighbour's own t (snake-robust), rather than against
   * the cliff vertex's bare u. Segment identity is declared input — not a classifier output.
   */
  vertexCliffSeg: number[];
  /**
   * The classifier's ribbon(true)/background(false) LABEL per dense region id (indexed by
   * region, not vertex). Exposed so a sanity check can confirm the label agrees with the
   * label-INDEPENDENT geometry (interior sheet lifts): a swapped label points "ribbon" at a
   * geometrically depressed region.
   */
  regionIsRibbon: boolean[];
  /**
   * True where the vertex is one of the two shared PINCH vertices of a declared crossing
   * junction (M3+). At a Y-junction several cliff curves meet, so the general per-region
   * split would emit one copy per incident sheet (a non-manifold FAN); instead every
   * incident sheet + wall is routed by radius LEVEL to exactly two shared vertices —
   * `pinch.upper` (r0) and `pinch.lower` (r0−jump). Flagged so the certifier can treat them
   * as the special multi-region pinch (their one-sided limit is read with a full-direction
   * nudge, since incident regions differ in t as well as u around a corner).
   */
  vertexIsJunction: boolean[];
}

/** Exact radius at a domain point: (u,t) -> r (mm). */
export type SurfaceRadiusFn = (u: number, t: number) => number;

/**
 * One emitted wall interval, exposed READ-ONLY (via an optional `wallsOut` out-param of
 * `buildDoubleValuedMesh`) so a style entry can IDENTIFY which walls are occlusion curtains
 * (M4). A wall bridges one cliff arc-interval's two incident region rails; `railA`/`railB`
 * are those two rails' mean cylindrical radii across the interval. The occlusion test needs
 * only the locus + the two rail radii — never the region labels — so it stays classifier-free.
 */
export interface WallRecord {
  /** Index (into the FED `complex.segments` order) of the cliff segment this wall bridges. */
  ci: number;
  /** Arc-interval on that segment (sample i → i+1). */
  interval: number;
  /** Interval-midpoint domain coordinates (the wall's locus). */
  u: number;
  t: number;
  /** Mean cylindrical radius (mm) of the first incident region's rail across the interval. */
  railA: number;
  /** Mean cylindrical radius (mm) of the second incident region's rail across the interval. */
  railB: number;
}

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
  /**
   * Indices (into `CliffComplexLike.segments`) of the cliff segments that CROSS here. The
   * mesher inserts one shared CDT point at `(u,t)` on each of these segments so their
   * constraint chains MEET at a single vertex (planar PSLG) instead of crossing — cdt2d
   * crashes on crossing constraints — and so the incident walls can pinch to the shared
   * double-vertex.
   */
  segs: readonly number[];
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
  /**
   * u-space nudge δ for the one-sided-limit cliff lift (M3+, active only when the complex
   * declares junctions). A cliff split-vertex is then lifted to `surface(u ∓ δ, t)` taken
   * from INSIDE its own region — the TRUE analytic one-sided limit — rather than the naive
   * declared lip. On an overlap-diamond side that limit is the occluded (raised) neighbour,
   * not r0, so the wall spans the real occlusion step and the independent certifier (which
   * expects exactly this limit, with the SAME δ) reads ~0 deviation. Default 1e-6.
   */
  oneSidedDelta?: number;
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
  /**
   * Regions that received ZERO cliff votes (touch no cliff edge). Their ribbon/background
   * label is irrelevant (they own no cliff vertices), but it is surfaced rather than
   * silently defaulted. Expected 0 for a clean single-strand patch.
   */
  voteFreeRegions: number;
  /**
   * Regions whose cliff votes tied with a NON-ZERO count (ribVotes === bgVotes > 0): a
   * genuinely ambiguous classification the code no longer hides. Must be 0 — a tie means a
   * region's own cliff edges disagree on which side is ribbon, which should never happen.
   */
  tieCliffRegions: number;
}

/**
 * Independent (classifier-free) fidelity certification of a built mesh against the TRUE
 * analytic surface. Produced by `certifyAgainstTrueSurface` + `regionRadiusConsistency`
 * (verify.ts). Unlike the geometric chord-to-reference gate — which cannot see a
 * ribbon/background lip swap because the wall ruled-face spans the whole radial jump and a
 * mis-lifted cliff vertex still lands ON it — this certification pins each cliff vertex to
 * the ONE-SIDED analytic limit taken from INSIDE its own region, so a swapped label spikes.
 */
export interface SurfaceCertification {
  /** Max |hypot(x,y) − surface(u,t)| over interior SHEET vertices (skips near-cliff ones). */
  maxSheetDevMm: number;
  /** Max |radius − surface one-sided limit into the vertex's OWN region| over CLIFF vertices. */
  maxCliffDevMm: number;
  /** SHEET vertices actually measured (near-cliff vertices are skipped by the straddle guard). */
  sheetVertsChecked: number;
  /** CLIFF vertices certified (an interior same-region neighbor oriented the one-sided limit). */
  cliffVertsCertified: number;
  /** CLIFF vertices skipped for lack of an interior neighbor to orient by. Must be 0 for a full cert. */
  cliffVertsSkipped: number;
  /** Min mean cylindrical radius over classifier-labeled RIBBON regions (+Infinity if none). */
  minRibbonMeanRadiusMm: number;
  /** Max mean cylindrical radius over classifier-labeled BACKGROUND regions (−Infinity if none). */
  maxBackgroundMeanRadiusMm: number;
  /** Count of regions the classifier labeled ribbon. */
  ribbonRegionCount: number;
  /** Count of regions the classifier labeled background. */
  backgroundRegionCount: number;
}

/**
 * Per-junction pinch measurement (M3+). Read straight off the built mesh's junction
 * vertices, so it independently confirms the 55→…→2 collapse: exactly TWO distinct radius
 * levels at the shared crossing point — `upper` (r0) and `lower` (r0−jump).
 */
export interface JunctionLevelReport {
  /** Normalized u of the declared junction. */
  u: number;
  /** t of the declared junction. */
  t: number;
  /** Distinct radius levels among the mesh's junction vertices at this (u,t). Must be 2. */
  distinctLevels: number;
  /** Highest junction-vertex radius here (the ribbon foot r0). */
  upper: number;
  /** Lowest junction-vertex radius here (the background r0−jump). */
  lower: number;
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
  /**
   * Independent, classifier-free certification against the analytic surface. This is the
   * load-bearing fidelity claim for the region classifier — the geometric `maxChordMm`
   * gate above is a valid facet/interpolation bound GIVEN a correct classifier, but it
   * cannot itself certify the classifier (a lip swap hides inside the wall ruled-face).
   */
  certification: SurfaceCertification;
  /** Number of declared crossing junctions meshed (0 for M1/M2, >0 once strands cross). */
  junctionCount: number;
  /** Per-junction pinch measurement (empty for M1/M2). Each must show exactly 2 levels. */
  junctions: JunctionLevelReport[];
  /**
   * INTERNAL OCCLUSION walls (M4). Count of ribbon-background wall intervals that a declared
   * `kind:'occlusion'` segment identifies as a ribbon-over-ribbon curtain — i.e. whose lower
   * rail is RAISED above the plain background (r0 − jump) because the z-buffer-occluding under
   * strand, not true background, lies across the over-strand edge inside the overlap diamond.
   * 0 for M1/M2/M3 (no `styleRadius` supplied ⇒ no declared occlusion segments). See M4's
   * reconciliation: the curtain is the ribbon-background edge's own one-sided-lifted wall, so
   * occlusion is represented EXACTLY ONCE and this counts it — it never adds a second wall.
   */
  occlusionWallCount: number;
  /**
   * Distinct (u,t) loci among the occlusion walls. A watertight single curtain has
   * `occlusionWallLoci === occlusionWallCount` (one wall per locus); a doubled co-located
   * curtain would put more than one wall at a locus and split the two apart.
   */
  occlusionWallLoci: number;
  /**
   * Smallest raise (mm) of an occlusion wall's lower rail above the plain background level
   * (r0 − jump), over all occlusion walls. Positive and non-trivial ⇒ the curtains are genuine
   * raised steps, not degenerate/plain ribbon→background drops. 0 when there are no occlusion walls.
   */
  minOcclusionRaiseMm: number;
}
