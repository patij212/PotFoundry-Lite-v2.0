// potfoundry-web/research/bridge/surfaceMetricField.ts
//
// SURFACE-INTRINSIC (first-fundamental-form) metric over the (u,t) square.
//
// Plain (Euclidean) (u,t) Delaunay maximizes the min angle in the FLAT parameter rectangle — but the map
// S(u,t)=(r·cosθ, r·sinθ, z) (θ=u·TAU, z=t·H) distorts that rectangle on the way to 3D, so a (u,t)-equilateral
// triangle is a stretched sliver on the surface. The fix that stays in UV: mesh under the first fundamental
// form g = [[E,F],[F,G]] (E=Su·Su, F=Su·St, G=St·St). A parameter-vector d has 3D length √(dᵀ g d), so the
// metric
//                                   M = g / h²
// gives unit metric-length to exactly the parameter-vectors of 3D length h, in EVERY direction. Meshing to
// unit metric edges (gmsh BAMG) therefore yields triangles that are even ON THE 3D SURFACE — "even in the
// metric" = "even in 3D". h is the target 3D edge length (uniform here), so the only anisotropy in M is the
// parametrization's own (E/G ratio + relief), which is exactly what pre-distorts the (u,t) mesh to be 3D-even.
//
// g is positive-definite for a regular radial surface (E ≥ 4π²r² > 0, det g = EG−F² > 0), so M is PD and needs
// no eigen-clamp; the uniform h bounds triangle size directly. Packed [M00, M01, M11] per (u,t) grid node,
// identical layout to metricField.ts so the existing gmsh BAMG adapter path consumes it unchanged.
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];

/** Per-node symmetric 2x2 surface metric M = g/h², packed [M00, M01, M11] per (u,t) grid node. */
export interface SurfaceMetricField { resU: number; resT: number; m: Float64Array; }

export function buildSurfaceMetricField(
  rA: AnalyticRadiusFn, H: number,
  opts: { resU: number; resT: number; h3DMm: number },
): SurfaceMetricField {
  const { resU, resT, h3DMm } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const m = new Float64Array(resU * resT * 3);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  const inv = 1 / (h3DMm * h3DMm);
  for (let it = 0; it < resT; it++) {
    for (let iu = 0; iu < resU; iu++) {
      // clamp the stencil centre off the boundary so the ± samples stay in-domain
      const uu = Math.min(Math.max(iu * du, du), 1 - du);
      const tt = Math.min(Math.max(it * dt, dt), 1 - dt);
      const Su = (sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du)) as V3);
      const St = (sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt)) as V3);
      const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);   // first fundamental form
      const base = (it * resU + iu) * 3;
      m[base] = E * inv;        // M00
      m[base + 1] = F * inv;    // M01
      m[base + 2] = G * inv;    // M11
    }
  }
  return { resU, resT, m };
}
