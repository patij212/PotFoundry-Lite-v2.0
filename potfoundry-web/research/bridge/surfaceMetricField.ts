// potfoundry-web/research/bridge/surfaceMetricField.ts
//
// SURFACE-INTRINSIC (first-fundamental-form) metric over the (u,t) square.
//
// Plain (Euclidean) (u,t) Delaunay maximizes the min angle in the FLAT parameter rectangle — but the map
// S(u,t)=(r·cosθ, r·sinθ, z) (θ=u·TAU, z=t·H) distorts that rectangle on the way to 3D, so a (u,t)-equilateral
// triangle is a stretched sliver on the surface. The fix that stays in UV: mesh under the first fundamental
// form g = [[E,F],[F,G]] (E=Su·Su, F=Su·St, G=St·St). A parameter-vector d has 3D length √(dᵀ g d), so the
// metric
//                                   M = g / h₃D²
// gives unit metric-length to exactly the parameter-vectors of 3D length h₃D, in EVERY direction. Meshing to
// unit metric edges (gmsh BAMG) therefore yields triangles that are even ON THE 3D SURFACE.
//
// Two sizing modes for h₃D (the target 3D edge length):
//   • UNIFORM  (opts.h3DMm)          → even 3D triangles of one global size.
//   • CHORD    (opts.tolMm/hMin/hMax) → curvature-adaptive: h₃D = √(8·tol/κ_max), κ_max = max |principal
//     curvature| (eigenvalue of the shape operator I⁻¹·II). Even 3D SHAPE (isotropic from g) with SIZE that
//     tightens on the relief — "even 3D triangles AND crease-tight density in one field".
//
// g is positive-definite for a regular radial surface, so M is PD and needs no eigen-clamp; the (clamped) h₃D
// bounds triangle size. Packed [M00, M01, M11] per (u,t) node, identical layout to metricField.ts so the
// existing gmsh BAMG adapter path consumes it unchanged.
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];

/** Per-node symmetric 2x2 surface metric M = g/h₃D², packed [M00, M01, M11] per (u,t) grid node. */
export interface SurfaceMetricField { resU: number; resT: number; m: Float64Array; }

type UniformOpts = { resU: number; resT: number; h3DMm: number };
type ChordOpts = { resU: number; resT: number; tolMm: number; hMin: number; hMax: number };
export type SurfaceMetricOpts = UniformOpts | ChordOpts;

function isChord(o: SurfaceMetricOpts): o is ChordOpts {
  return (o as ChordOpts).tolMm !== undefined;
}

export function buildSurfaceMetricField(rA: AnalyticRadiusFn, H: number, opts: SurfaceMetricOpts): SurfaceMetricField {
  const { resU, resT } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const m = new Float64Array(resU * resT * 3);
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  const chord = isChord(opts);

  for (let it = 0; it < resT; it++) {
    for (let iu = 0; iu < resU; iu++) {
      const uu = Math.min(Math.max(iu * du, du), 1 - du);
      const tt = Math.min(Math.max(it * dt, dt), 1 - dt);
      const Su = (sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du)) as V3);
      const St = (sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt)) as V3);
      const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);   // first fundamental form

      let h3D: number;
      if (chord) {
        const o = opts as ChordOpts;
        const c = S(uu, tt);
        const Suu = (sub(sub(S(uu + du, tt), c), sub(c, S(uu - du, tt))).map((v) => v / (du * du)) as V3);
        const Stt = (sub(sub(S(uu, tt + dt), c), sub(c, S(uu, tt - dt))).map((v) => v / (dt * dt)) as V3);
        const pp = S(uu + du, tt + dt), pm = S(uu + du, tt - dt), mp = S(uu - du, tt + dt), mm_ = S(uu - du, tt - dt);
        const Sut = ([0, 1, 2].map((k) => (pp[k] - pm[k] - mp[k] + mm_[k]) / (4 * du * dt)) as V3);
        let n = cross(Su, St); const nl = Math.hypot(n[0], n[1], n[2]);
        let kappaMax = 0;
        if (nl > 1e-30) {
          n = [n[0] / nl, n[1] / nl, n[2] / nl];
          const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);            // second fundamental form II
          // principal curvatures = eigenvalues of I⁻¹II: a·k² + b·k + c = 0
          const a = E * G - F * F, b = -(E * N + G * L - 2 * F * Mn), cc = L * N - Mn * Mn;
          if (Math.abs(a) > 1e-30) {
            const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc));
            const k1 = (-b + disc) / (2 * a), k2 = (-b - disc) / (2 * a);
            kappaMax = Math.max(Math.abs(k1), Math.abs(k2));
          }
        }
        const hRaw = kappaMax > 1e-9 ? Math.sqrt((8 * o.tolMm) / kappaMax) : o.hMax;
        h3D = Math.min(Math.max(hRaw, o.hMin), o.hMax);
      } else {
        h3D = (opts as UniformOpts).h3DMm;
      }

      const inv = 1 / (h3D * h3D);
      const base = (it * resU + iu) * 3;
      m[base] = E * inv;        // M00
      m[base + 1] = F * inv;    // M01
      m[base + 2] = G * inv;    // M11
    }
  }
  return { resU, resT, m };
}
