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

/** The discrete grid resolution backing a sampler (for finite-difference step sizing). */
export interface SamplerGridResolution {
  /** Number of distinct u columns (u node spacing = 1/resU, periodic). */
  resU: number;
  /** Number of distinct t rows (t node spacing = 1/(resT-1), clamped). */
  resT: number;
}

/** Maps outer-wall parameter (u,t) in [0,1)x[0,1] to a 3D position (mm). */
export interface SurfaceSampler {
  /** Evaluate one point. u wraps periodically; t clamps to [0,1]. */
  position(u: number, t: number): Vec3;
  /**
   * The discrete grid resolution this sampler interpolates, if any. Curvature
   * estimators use it to size finite-difference steps to ~one grid cell so they
   * don't amplify quantization noise. Analytic samplers (no discretization)
   * omit it and let estimators fall back to a fixed analytic step.
   */
  gridResolution?(): SamplerGridResolution;
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

/**
 * Production sampler backed by a pre-evaluated dense grid of 3D positions.
 *
 * The grid is evaluated once (a single GPU `evaluatePoints` batch in the
 * pipeline) and stored row-major: `positions[(tRow*resU + uCol)*3]` is the
 * (x,y,z) at column `uCol` (u = uCol/resU) and row `tRow` (t = tRow/(resT-1)).
 *
 * - `u` is **periodic**: column `resU` wraps back to column `0` (u = 1 == u = 0).
 * - `t` is **clamped** to `[0,1]`.
 *
 * `position` is bilinear interpolation over the enclosing grid cell — no
 * per-call GPU round-trip.
 */
export class GpuSurfaceSampler implements SurfaceSampler {
  constructor(
    private readonly positions: Float32Array,
    private readonly resU: number,
    private readonly resT: number,
  ) {}

  /** This sampler interpolates a `resU × resT` grid; expose it for step sizing. */
  gridResolution(): SamplerGridResolution {
    return { resU: this.resU, resT: this.resT };
  }

  position(u: number, t: number): Vec3 {
    const { positions, resU, resT } = this;

    // u in [0,1) periodic: map to a continuous column index in [0, resU).
    let uu = u - Math.floor(u);
    if (uu < 0) uu += 1;
    const uf = uu * resU;
    const u0 = Math.floor(uf) % resU;
    const u1 = (u0 + 1) % resU; // wraps column resU → 0
    const fu = uf - Math.floor(uf);

    // t in [0,1] clamped: map to a continuous row index in [0, resT-1].
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const tf = tc * (resT - 1);
    const t0 = Math.min(Math.floor(tf), resT - 1);
    const t1 = Math.min(t0 + 1, resT - 1);
    const ft = tf - t0;

    const idx = (col: number, row: number): number => (row * resU + col) * 3;
    const i00 = idx(u0, t0);
    const i10 = idx(u1, t0);
    const i01 = idx(u0, t1);
    const i11 = idx(u1, t1);

    const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
    const out: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const bottom = lerp(positions[i00 + c], positions[i10 + c], fu);
      const top = lerp(positions[i01 + c], positions[i11 + c], fu);
      out[c] = lerp(bottom, top, ft);
    }
    return out;
  }
}
