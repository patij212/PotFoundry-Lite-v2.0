/**
 * componentBoundary.ts — style-agnostic component-boundary detector.
 *
 * Detects the boundaries of a generic region/level-set field in (u,t) parameter
 * space by delegating to the existing marching-squares tracers in
 * `../SampledFeatureExtractor`. Two modes are supported:
 *
 * - `kind: 'zero'` — traces the zero-contour of a scalar field `f(u,t)`.
 *   Delegates to {@link marchingSquaresZero}. Typical use: TPMS level sets
 *   (Gyroid), Voronoi seam fields, hex-hive boundary fields.
 *
 * - `kind: 'label'` — traces the boundary between regions of a categorical
 *   (integer label) field. Delegates to {@link marchingSquaresLabels}. Typical
 *   use: Voronoi cell partitions where each cell carries a distinct integer label.
 *
 * The caller supplies a generic field callback — there is NO style-id branching
 * inside this module. The returned {@link RawSegments} carries a constant
 * `type: 'component-boundary'` and a `strength` function that returns 1 for
 * every segment (the field gives no local saliency; downstream code may weight
 * by segment length or curvature if needed).
 *
 * @module conforming/featureGraph/componentBoundary
 */

import type { Vec2, FeatureType } from './types';
import {
  marchingSquaresZero,
  marchingSquaresLabels,
} from '../SampledFeatureExtractor';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single undirected segment connecting two (u,t) points. */
export interface RawSegment {
  a: Vec2;
  b: Vec2;
}

/**
 * The raw output of a single detector pass — an unordered array of (u,t)
 * segments, a feature-type tag, and a per-segment strength accessor.
 *
 * Downstream tasks (Tasks 3–6) weld these into polylines and inject them into
 * the CDT constraint graph.
 */
export interface RawSegments {
  /** Unordered array of (u,t) segments produced by the detector. */
  segs: RawSegment[];
  /** Feature classification tag — always `'component-boundary'` here. */
  type: FeatureType;
  /**
   * Returns the saliency strength of a segment in [0,∞).
   * For component boundaries, all segments carry equal weight (1). Callers may
   * multiply by segment length or local curvature to bias constraint selection.
   */
  strength: (seg: RawSegment) => number;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ComponentBoundaryOptions {
  /** Grid resolution in u (number of distinct u-columns). */
  resU: number;
  /** Grid resolution in t (number of distinct t-rows). */
  resT: number;
  /**
   * Whether the u-axis is periodic. When true, a wrap column at u=1 (values
   * from u=0) is appended so seam-crossing contours are closed properly.
   * Set false for fields that do NOT tile at u=1 to avoid a spurious seam
   * contour (e.g. HexagonalHive whose u·TAU·scale is non-integer).
   */
  periodicU: boolean;
  /**
   * Tracing mode:
   * - `'zero'`  — zero-contour of `field` via {@link marchingSquaresZero}.
   * - `'label'` — cell-boundary tracing of an integer-label field via
   *               {@link marchingSquaresLabels}.
   */
  kind: 'zero' | 'label';
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Detect component boundaries in a generic scalar/label field.
 *
 * @param field   A callback `(u,t) => number`. For `kind:'zero'` this should
 *                return a signed scalar (negative inside, positive outside the
 *                region, or vice-versa). For `kind:'label'` it should return a
 *                non-negative integer identifying the region at (u,t). In both
 *                cases the callback is style-agnostic: the caller is responsible
 *                for constructing the appropriate indicator from the sampler.
 * @param opts    Resolution, periodicity, and tracing mode.
 * @returns       {@link RawSegments} — unordered segments, type tag, and
 *                strength accessor.
 */
export function detectComponentBoundary(
  field: (u: number, t: number) => number,
  opts: ComponentBoundaryOptions,
): RawSegments {
  const { resU, resT, periodicU, kind } = opts;

  const rawSegs =
    kind === 'zero'
      ? marchingSquaresZero(field, resU, resT, periodicU)
      : marchingSquaresLabels(field, resU, resT, periodicU);

  // ContourSegment uses FeatureLinePoint which has {u,t} — same shape as Vec2.
  // Cast directly; no copy needed.
  const segs = rawSegs as RawSegment[];

  return {
    segs,
    type: 'component-boundary',
    // All component-boundary segments carry equal intrinsic saliency. The caller
    // can scale by segment length or local curvature if needed.
    strength: (_seg: RawSegment) => 1,
  };
}
