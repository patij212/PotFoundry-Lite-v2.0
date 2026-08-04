/**
 * FootPointMetric — Foot-point surface projection error metric for research meshing.
 *
 * Computes the true 3D shortest perpendicular distance from a point P to a parametric
 * surface S(u,v) by iteratively minimizing ‖S(u,v) − P‖² via Newton-type relaxation.
 *
 * Two modes:
 *   - **Gauss-Newton** (default): Uses only first derivatives S_u, S_v. The Hessian is
 *     approximated as J^T J (dropping curvature terms). Sufficient when the initial guess
 *     (u0,v0) is close and curvature is moderate. This is what runs when no second
 *     derivatives are supplied.
 *
 *   - **Full Newton**: When second derivatives S_uu, S_uv, S_vv are provided, the Hessian
 *     includes the curvature tensor terms (S−P)·S_uu etc. Required for convergence on
 *     high-curvature surfaces (Gothic arches, tight crest bends) where Gauss-Newton may
 *     stall or oscillate.
 *
 * Thread safety: All scratch memory is allocated per-call via a caller-provided buffer
 * or a fresh local allocation. There is NO shared mutable state — safe for worker threads.
 */

/** Callback writing a 3-component vector into `out` at `offset`. */
export type SurfaceVec3Fn = (u: number, v: number, out: Float64Array, offset: number) => void;

/** Configuration for foot-point projection. */
export interface FootPointOpts {
  /** Maximum Newton iterations (default: 8). */
  maxIter?: number;
  /** Convergence tolerance on ‖Δ(u,v)‖ per step (default: 1e-10). */
  tol?: number;
  /** Domain clamp: [uMin, uMax] (default: unclamped). */
  uBounds?: readonly [number, number];
  /** Domain clamp: [vMin, vMax] (default: unclamped). */
  vBounds?: readonly [number, number];
  /**
   * Second-derivative callbacks for full Newton mode.
   * If omitted, falls back to Gauss-Newton (J^T J approximation).
   */
  d2S_duu?: SurfaceVec3Fn;
  d2S_duv?: SurfaceVec3Fn;
  d2S_dvv?: SurfaceVec3Fn;
  /**
   * Optional pre-allocated scratch buffer (≥ 27 Float64 elements).
   * If omitted, a fresh buffer is allocated per call. Provide one for hot loops
   * when you control the calling thread and want zero allocation overhead.
   */
  scratch?: Float64Array;
}

const DEFAULT_MAX_ITER = 8;
const DEFAULT_TOL = 1e-10;

/**
 * Compute true 3D orthogonal foot-point distance from point P = (px,py,pz) to S(u,v).
 *
 * The initial guess (u0,v0) should be the parameter-space centroid of the triangle whose
 * error is being measured. For sub-µm accuracy, the guess must land in the correct surface
 * patch — a far-off guess on a multi-valued surface will find the WRONG foot-point.
 *
 * @returns Euclidean distance ‖S(u*,v*) − P‖ at the converged foot-point.
 */
export function footPointDistance(
  px: number,
  py: number,
  pz: number,
  u0: number,
  v0: number,
  S: SurfaceVec3Fn,
  dS_du: SurfaceVec3Fn,
  dS_dv: SurfaceVec3Fn,
  opts?: FootPointOpts,
): number {
  const maxIter = opts?.maxIter ?? DEFAULT_MAX_ITER;
  const tol = opts?.tol ?? DEFAULT_TOL;
  const uBounds = opts?.uBounds;
  const vBounds = opts?.vBounds;
  const d2uu = opts?.d2S_duu;
  const d2uv = opts?.d2S_duv;
  const d2vv = opts?.d2S_dvv;
  const fullNewton = d2uu !== undefined && d2uv !== undefined && d2vv !== undefined;

  // Scratch layout (27 float64):
  //   [0..2]   = S(u,v)
  //   [3..5]   = dS/du
  //   [6..8]   = dS/dv
  //   [9..11]  = d²S/du²   (full Newton only)
  //   [12..14] = d²S/dudv  (full Newton only)
  //   [15..17] = d²S/dv²   (full Newton only)
  //   [18..26] = unused / available for caller
  const buf = opts?.scratch ?? new Float64Array(fullNewton ? 27 : 9);

  let u = u0;
  let v = v0;

  for (let iter = 0; iter < maxIter; iter++) {
    S(u, v, buf, 0);
    dS_du(u, v, buf, 3);
    dS_dv(u, v, buf, 6);

    // Residual r = S(u,v) − P
    const rx = buf[0] - px;
    const ry = buf[1] - py;
    const rz = buf[2] - pz;

    // First derivatives
    const dux = buf[3]; const duy = buf[4]; const duz = buf[5];
    const dvx = buf[6]; const dvy = buf[7]; const dvz = buf[8];

    // Gradient of ½‖r‖²: g = J^T r
    const g1 = rx * dux + ry * duy + rz * duz;
    const g2 = rx * dvx + ry * dvy + rz * dvz;

    // Hessian H = J^T J  (Gauss-Newton base)
    let H11 = dux * dux + duy * duy + duz * duz;
    let H12 = dux * dvx + duy * dvy + duz * dvz;
    let H22 = dvx * dvx + dvy * dvy + dvz * dvz;

    // Full Newton: add curvature terms  r · S_uu, r · S_uv, r · S_vv
    if (fullNewton) {
      d2uu!(u, v, buf, 9);
      d2uv!(u, v, buf, 12);
      d2vv!(u, v, buf, 15);

      H11 += rx * buf[9]  + ry * buf[10] + rz * buf[11];
      H12 += rx * buf[12] + ry * buf[13] + rz * buf[14];
      H22 += rx * buf[15] + ry * buf[16] + rz * buf[17];
    }

    // Solve 2×2 linear system  H Δ = −g
    const det = H11 * H22 - H12 * H12;
    if (Math.abs(det) < 1e-30) break; // Degenerate — surface tangent vectors are parallel

    const du = -(H22 * g1 - H12 * g2) / det;
    const dv = -(H11 * g2 - H12 * g1) / det;

    u += du;
    v += dv;

    // Domain clamping: prevent divergence on bounded parametric surfaces
    if (uBounds) {
      if (u < uBounds[0]) u = uBounds[0];
      else if (u > uBounds[1]) u = uBounds[1];
    }
    if (vBounds) {
      if (v < vBounds[0]) v = vBounds[0];
      else if (v > vBounds[1]) v = vBounds[1];
    }

    // Convergence check: step size in parameter space
    if (du * du + dv * dv < tol * tol) break;
  }

  // Final evaluation at converged (u*, v*)
  S(u, v, buf, 0);
  const dx = buf[0] - px;
  const dy = buf[1] - py;
  const dz = buf[2] - pz;

  return Math.hypot(dx, dy, dz);
}
