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
 * `type: 'component-boundary'` and a per-segment `strength` field of 1 for
 * every segment (the field gives no local saliency; downstream code may weight
 * by segment length or curvature if needed).
 *
 * @module conforming/featureGraph/componentBoundary
 */

import type { Vec2, RawSegment, RawSegments } from './types';
import {
  marchingSquaresZero,
  marchingSquaresLabels,
} from '../SampledFeatureExtractor';

// `RawSegment` / `RawSegments` were moved to ./types so all three detectors and
// the unifier share one canonical definition; re-export them here so existing
// `import { RawSegment } from './componentBoundary'` call sites keep compiling.
export type { RawSegment, RawSegments } from './types';

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
 *                per-segment strength field.
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
  // Cast to the underlying shape then add the required strength field (1 for
  // all component-boundary segments — no local saliency variation).
  const segs: RawSegment[] = (rawSegs as Array<{ a: Vec2; b: Vec2 }>).map(
    (s) => ({ a: s.a, b: s.b, strength: 1 }),
  );

  return {
    segs,
    type: 'component-boundary',
    // Every component-boundary segment carries strength 1 and the detector's
    // "emission threshold" is 1 — so normalized saliency is exactly 1.0 for all
    // of them (a present-but-not-locally-graded feature).
    threshold: 1,
  };
}
