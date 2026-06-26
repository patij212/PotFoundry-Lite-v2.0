import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface IsotropicSizingField { resU: number; resT: number; h: Float64Array; }

/**
 * Isotropic chord-control sizing field over (u,t). At each grid node we estimate
 * the worst second-fundamental-form magnitude |S_dd| by central differences of the
 * radial surface S(θ,z)=(r·cosθ, r·sinθ, z) (θ=u·TAU, z=t·H) in each parameter
 * direction. A parameter-edge of length h has chord sag ≈ |S_dd|·h²/8, so bounding
 * sag ≤ tol gives the target edge length DIRECTLY in (u,t) units (|S_dd| already
 * carries the parameter→mm scale — no speed division):
 *   h = clamp( sqrt(8·tol / max(|S_uu|,|S_tt|)), hMin, hMax ).
 * A cylinder r=R is circumferentially curved (|S_uu|=(2π)²R) ⇒ h≈sqrt(8·tol/((2π)²R)),
 * NOT hMax; only a (degenerate) zero-curvature patch saturates at hMax.
 */
export function buildIsotropicSizingField(
  rA: AnalyticRadiusFn, H: number,
  opts: { resU: number; resT: number; tolMm: number; hMin: number; hMax: number },
): IsotropicSizingField {
  const { resU, resT, tolMm, hMin, hMax } = opts;
  const S = (u: number, t: number): [number, number, number] => {
    const th = TAU * u, z = t * H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  // |a − 2c + b| / step²  — central second-difference magnitude (≈ |S_dd|).
  const secondDiff = (
    a: [number, number, number], c: [number, number, number], b: [number, number, number], step: number,
  ): number =>
    Math.hypot(a[0] - 2 * c[0] + b[0], a[1] - 2 * c[1] + b[1], a[2] - 2 * c[2] + b[2]) / (step * step);
  const h = new Float64Array(resU * resT);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  for (let it = 0; it < resT; it++) {
    for (let iu = 0; iu < resU; iu++) {
      // clamp the stencil centre off the boundary so the ± samples stay in-domain
      const uu = Math.min(Math.max(iu * du, du), 1 - du);
      const tt = Math.min(Math.max(it * dt, dt), 1 - dt);
      const c = S(uu, tt);
      const d2u = secondDiff(S(uu + du, tt), c, S(uu - du, tt), du);
      const d2t = secondDiff(S(uu, tt + dt), c, S(uu, tt - dt), dt);
      const d2max = Math.max(d2u, d2t, 1e-9);
      const hUt = Math.sqrt((8 * tolMm) / d2max);
      h[it * resU + iu] = Math.min(Math.max(hUt, hMin), hMax);
    }
  }
  return { resU, resT, h };
}
