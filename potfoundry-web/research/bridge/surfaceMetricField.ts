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
//     tightens on the relief.
//
// GRADATION (opts.gradeBeta): chord sizing creates a SIZE GRADIENT (tiny cells on creases, big in smooth
// zones) and BAMG grows slivers where the size changes too fast — and it worsens with density (measured: %<20°
// climbs 1.5%→8% as tris 32k→189k). Gradation caps the growth rate: h(i) ≤ min_neighbour(h)·(1+β) per cell,
// swept to convergence. This PRESERVES crease fineness (small h stays small; only the coarse side is pulled in)
// while forcing gentle transitions ⇒ fewer transition slivers at no chord cost on the creases.
//
// g is positive-definite for a regular radial surface, so M is PD and needs no eigen-clamp. Packed
// [M00, M01, M11] per (u,t) node, identical layout to metricField.ts so the gmsh BAMG adapter consumes it.
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
type V3 = [number, number, number];

/** Per-node symmetric 2x2 surface metric M = g/h₃D², packed [M00, M01, M11] per (u,t) grid node. */
export interface SurfaceMetricField { resU: number; resT: number; m: Float64Array; }

type Grade = { gradeBeta?: number; gradePasses?: number };
type UniformOpts = { resU: number; resT: number; h3DMm: number } & Grade;
type ChordOpts = { resU: number; resT: number; tolMm: number; hMin: number; hMax: number } & Grade;
export type SurfaceMetricOpts = UniformOpts | ChordOpts;

function isChord(o: SurfaceMetricOpts): o is ChordOpts {
  return (o as ChordOpts).tolMm !== undefined;
}

/** Cap each node's size to (1+β)× its smallest 4-neighbour, swept to convergence — standard h-gradation. */
export function gradeSizeField(h: Float64Array, resU: number, resT: number, beta: number, passes: number): void {
  const at = (iu: number, it: number): number => it * resU + iu;
  for (let p = 0; p < passes; p++) {
    let changed = false;
    // forward + backward sweeps so fineness propagates both directions per pass
    for (let pass = 0; pass < 2; pass++) {
      const uOrder = (k: number): number => (pass === 0 ? k : resU - 1 - k);
      const tOrder = (k: number): number => (pass === 0 ? k : resT - 1 - k);
      for (let kt = 0; kt < resT; kt++) for (let ku = 0; ku < resU; ku++) {
        const iu = uOrder(ku), it = tOrder(kt), i = at(iu, it);
        let mn = h[i];
        if (iu > 0) mn = Math.min(mn, h[at(iu - 1, it)]);
        if (iu < resU - 1) mn = Math.min(mn, h[at(iu + 1, it)]);
        if (it > 0) mn = Math.min(mn, h[at(iu, it - 1)]);
        if (it < resT - 1) mn = Math.min(mn, h[at(iu, it + 1)]);
        const cap = mn * (1 + beta);
        if (h[i] > cap) { h[i] = cap; changed = true; }
      }
    }
    if (!changed) break;
  }
}

export function buildSurfaceMetricField(rA: AnalyticRadiusFn, H: number, opts: SurfaceMetricOpts): SurfaceMetricField {
  const { resU, resT } = opts;
  const S = (u: number, t: number): V3 => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const du = 1 / Math.max(resU - 1, 1), dt = 1 / Math.max(resT - 1, 1);
  const chord = isChord(opts);

  // Pass 1 — first fundamental form (E,F,G) and target 3D size h₃D per node.
  const Eg = new Float64Array(resU * resT), Fg = new Float64Array(resU * resT), Gg = new Float64Array(resU * resT);
  const h3D = new Float64Array(resU * resT);
  for (let it = 0; it < resT; it++) {
    for (let iu = 0; iu < resU; iu++) {
      const uu = Math.min(Math.max(iu * du, du), 1 - du);
      const tt = Math.min(Math.max(it * dt, dt), 1 - dt);
      const Su = (sub(S(uu + du, tt), S(uu - du, tt)).map((v) => v / (2 * du)) as V3);
      const St = (sub(S(uu, tt + dt), S(uu, tt - dt)).map((v) => v / (2 * dt)) as V3);
      const E = dot(Su, Su), F = dot(Su, St), G = dot(St, St);
      const idx = it * resU + iu;
      Eg[idx] = E; Fg[idx] = F; Gg[idx] = G;

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
          const L = dot(Suu, n), Mn = dot(Sut, n), N = dot(Stt, n);
          const a = E * G - F * F, b = -(E * N + G * L - 2 * F * Mn), cc = L * N - Mn * Mn;
          if (Math.abs(a) > 1e-30) {
            const disc = Math.sqrt(Math.max(0, b * b - 4 * a * cc));
            kappaMax = Math.max(Math.abs((-b + disc) / (2 * a)), Math.abs((-b - disc) / (2 * a)));
          }
        }
        const hRaw = kappaMax > 1e-9 ? Math.sqrt((8 * o.tolMm) / kappaMax) : o.hMax;
        h3D[idx] = Math.min(Math.max(hRaw, o.hMin), o.hMax);
      } else {
        h3D[idx] = (opts as UniformOpts).h3DMm;
      }
    }
  }

  // Optional gradation (chord mode only — uniform h has no gradient).
  if (chord && opts.gradeBeta && opts.gradeBeta > 0) {
    gradeSizeField(h3D, resU, resT, opts.gradeBeta, opts.gradePasses ?? 32);
  }

  // Pass 2 — assemble M = g / h₃D².
  const m = new Float64Array(resU * resT * 3);
  for (let i = 0; i < resU * resT; i++) {
    const inv = 1 / (h3D[i] * h3D[i]);
    m[i * 3] = Eg[i] * inv; m[i * 3 + 1] = Fg[i] * inv; m[i * 3 + 2] = Gg[i] * inv;
  }
  return { resU, resT, m };
}
