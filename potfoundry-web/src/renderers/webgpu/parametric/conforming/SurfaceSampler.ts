/**
 * SurfaceSampler.ts — Parameter-space → 3D position sampling for the
 * conforming outer-wall mesher.
 *
 * The mesher works entirely in metric-warped (u,t) parameter space and depends
 * only on a {@link SurfaceSampler}. In production this is GPU-backed (a
 * pre-evaluated dense grid + bilinear interpolation — Task 7); in unit tests it
 * is the analytic {@link SyntheticCylinderSampler}, so correctness is testable
 * without WebGPU.
 *
 * @module conforming/SurfaceSampler
 */

/** A 3D position in millimetres. */
export type Vec3 = readonly [number, number, number];

/** Maps outer-wall parameter (u,t) in [0,1)x[0,1] to a 3D position (mm). */
export interface SurfaceSampler {
  /** Evaluate one point. u wraps periodically; t clamps to [0,1]. */
  position(u: number, t: number): Vec3;
}

/**
 * Analytic test surface: a rippled cylinder.
 *
 * `r(u) = R0 + amp*cos(2*pi*k*u)`, swept around `theta = 2*pi*u`, with height
 * `z = t*H`. With `amp = 0` this is a plain cylinder of radius `R0`; the ripple
 * (`amp`, `k`) injects real, closed-form curvature for metric/sizing tests.
 */
export class SyntheticCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly amp = 0,
    private readonly k = 0,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    const r = this.R0 + this.amp * Math.cos(2 * Math.PI * this.k * u);
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}
