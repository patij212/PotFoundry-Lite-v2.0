/**
 * types.ts — Core data types for the feature-graph pipeline.
 *
 * The feature-graph pipeline detects geometric features (curvature ridges,
 * normal discontinuities, component boundaries) on a parametric surface and
 * encodes them as a graph of polyline edges in (u,t) parameter space. Later
 * tasks (detectors, tracers, constraint injectors) consume these types.
 *
 * @module conforming/featureGraph/types
 */

/** A point in (u,t) parameter space. u is periodic [0,1); t is clamped [0,1]. */
export interface Vec2 {
  u: number;
  t: number;
}

/**
 * Classification of a detected feature.
 *
 * - `curvature-ridge`: a local maximum of max principal curvature κ across u —
 *   the mesher should place edges here so the ridge appears sharp in the export.
 * - `normal-discontinuity`: a crease where the surface normal changes abruptly
 *   across a short parameter-space interval.
 * - `component-boundary`: the boundary between topologically separate surface
 *   components (e.g. the seam between the outer wall and a decorative band).
 */
export type FeatureType = 'curvature-ridge' | 'normal-discontinuity' | 'component-boundary';

/**
 * A node in the feature graph — a point in (u,t) space where one or more
 * feature edges meet. Nodes are shared between edges at junctions/endpoints.
 */
export type FeatureGraphNode = Vec2;

/**
 * A directed feature edge: a polyline in (u,t) space together with metadata
 * describing why it was detected and how strong the feature is.
 *
 * - `polyline`: ordered sequence of (u,t) samples along the feature.
 * - `strength`: feature saliency in [0,∞); higher = sharper/more prominent.
 *   Typically κ_max at the ridge or |Δn| at a discontinuity.
 * - `types`: one or more {@link FeatureType} labels (an edge can carry multiple
 *   types when, e.g., a curvature ridge coincides with a component boundary).
 * - `kind`: `'loop'` if the polyline closes on itself (typical for ridges running
 *   all the way around the pot); `'open'` if it has distinct endpoints.
 * - `endpoints`: indices into the parent {@link FeatureGraph}'s `nodes` array for
 *   the first and last node of the polyline (identical for loops).
 */
export interface FeatureEdge {
  polyline: Vec2[];
  strength: number;
  types: FeatureType[];
  kind: 'open' | 'loop';
  endpoints: [number, number];
}

/**
 * The complete feature graph for one surface.
 *
 * `nodes` are the junction/endpoint positions; `edges` reference them by index.
 * An empty graph (`{nodes:[], edges:[]}`) is valid for smooth surfaces with no
 * detectable features.
 */
export interface FeatureGraph {
  nodes: FeatureGraphNode[];
  edges: FeatureEdge[];
}

// ---------------------------------------------------------------------------
// Raw detector output — the unordered segment soup the unifier consumes.
// (Moved here from componentBoundary.ts so all three detectors and the unifier
//  share one canonical definition.)
// ---------------------------------------------------------------------------

/**
 * A single undirected segment connecting two (u,t) points.
 *
 * `strength` is the RAW per-detector saliency in [0,∞) and its UNIT differs by
 * detector: curvature-ridge emits κ (mm⁻¹), normal-discontinuity emits the
 * normal-angle jump (DEGREES), component-boundary emits a constant 1. These raw
 * values are therefore NOT comparable across detectors — the unifier first
 * normalizes each to a dimensionless saliency (raw / detector-threshold) before
 * any cross-detector comparison. See {@link RawSegments.threshold}.
 */
export interface RawSegment {
  a: Vec2;
  b: Vec2;
  /** Raw, per-detector feature saliency in [0,∞). Unit varies by detector. */
  strength: number;
}

/**
 * The raw output of a single detector pass — an unordered array of (u,t)
 * segments with per-segment strength values, a feature-type tag, and the
 * emission threshold the detector used.
 *
 * Downstream tasks (the unifier, then the CDT constraint injector) weld these
 * into polylines and merge them into one topology-rich feature graph.
 */
export interface RawSegments {
  /** Unordered array of (u,t) segments produced by the detector. */
  segs: RawSegment[];
  /** Feature classification tag. */
  type: FeatureType;
  /**
   * The emission threshold this detector used, in the SAME UNIT as each
   * segment's `strength` (κ for curvature-ridge, degrees for
   * normal-discontinuity, 1 for component-boundary). The unifier divides
   * `strength` by this to obtain a dimensionless, cross-detector-comparable
   * saliency (≥1 for every emitted segment). Optional for backward
   * compatibility; when absent the unifier falls back to a threshold of 1
   * (i.e. saliency = raw strength).
   */
  threshold?: number;
}

// ---------------------------------------------------------------------------
// Fields — the 2-D sampled grid consumed by all three detectors.
// ---------------------------------------------------------------------------

/**
 * A dense (u,t) grid of surface normal and max principal curvature values,
 * produced by {@link sampleFeatureFields} and consumed by the three detectors
 * (curvature-ridge tracer, normal-discontinuity detector, component-boundary
 * detector).
 *
 * Layout: row-major, resU columns × resT rows.
 * - Node (i, j): u = i/resU, t = j/(resT-1).
 * - Linear index: idx = j * resU + i.
 *
 * The u axis is **periodic** (column resU wraps back to column 0).
 * The t axis is **clamped** to [0,1].
 */
export interface Fields {
  /** Number of distinct u columns (u node spacing = 1/resU, periodic). */
  resU: number;
  /** Number of distinct t rows (t node spacing = 1/(resT-1), clamped). */
  resT: number;
  /**
   * Max absolute principal curvature κ (mm⁻¹) at each grid node.
   * Row-major Float64Array of length resU × resT.
   */
  kappa: Float64Array;
  /** x-component of the unit outward surface normal at each grid node. */
  nx: Float64Array;
  /** y-component of the unit outward surface normal at each grid node. */
  ny: Float64Array;
  /** z-component of the unit outward surface normal at each grid node. */
  nz: Float64Array;
  /** Map column index i → u value (i / resU). */
  uOf(i: number): number;
  /** Map row index j → t value (j / (resT - 1)). */
  tOf(j: number): number;
}
