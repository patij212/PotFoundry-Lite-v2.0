/**
 * Calibrated CAD-grade dual-gate thresholds (Stage 1 output). Pinned from the
 * committed dual-gate baseline (`docs/.../stage1-dualgate-baseline.{json,md}`).
 * Consumed by the fidelity probes and (Stage 5) the CI gate — NOT wired into the
 * production export path in Stage 1.
 *
 * CHORD gate: a facet's perpendicular-3D distance to the true surface must be
 * <= chordToleranceMm(localFeatureSizeMm). Curvature-relative so sharp features get
 * a TIGHTER bound (clamped to a floor) while large smooth walls get the ceiling.
 *   - baseline: clean styles perp p99 <= 0.076mm; the 5 lattice/weave/braid gap
 *     styles 0.156-0.489mm. tauCeil 0.1 cleanly separates them.
 *
 * QUALITY gate: every triangle min interior angle >= minAngleDeg (no slivers) and
 * aspect <= maxAspect.
 *   - baseline: clean smooth styles achieve worst min-angle 24-29deg, so 20deg is a
 *     bar they clear with margin; ~16/20 styles currently fail it (the Stage-2 work).
 */
export const GATE_THRESHOLDS = {
  /** theta_min — minimum interior angle (deg). CAD/Delaunay-refinement standard. */
  minAngleDeg: 20,
  /**
   * A_max — max aspect (longest^2 * sqrt(3) / (4 * area), the metric
   * `summarizeConformingValidation` reports). 4.76 is the aspect of the worst
   * 20deg-min-angle triangle (a flat cap: angles 20-20-140). Analytic companion to
   * minAngleDeg; validate against measured maxAspectRatio in Stage 2.
   */
  maxAspect: 4.76,
  /** epsRel — curvature-relative sag fraction of local feature size. */
  epsRel: 0.05,
  /** tauFloor — absolute chord floor (mm), just above the f32/sampling floor. */
  tauFloorMm: 0.005,
  /** tauCeil — CAD-interchange chord ceiling (mm) for large smooth features. */
  tauCeilMm: 0.1,
} as const;

/**
 * Curvature-relative chord (sag) tolerance at a point with the given local feature
 * size (mm): epsRel * featureSize, clamped to [tauFloor, tauCeil]. Sharp/small
 * features clamp toward the floor (strict); large smooth features clamp to the ceiling.
 */
export function chordToleranceMm(featureSizeMm: number): number {
  const t = GATE_THRESHOLDS.epsRel * featureSizeMm;
  return Math.min(GATE_THRESHOLDS.tauCeilMm, Math.max(GATE_THRESHOLDS.tauFloorMm, t));
}
