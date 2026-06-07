/**
 * SurfaceMetricTensor.ts — First fundamental form (E,F,G) and principal
 * curvature of a parametric surface, estimated by finite differences on an
 * injected {@link SurfaceSampler}.
 *
 * These quantities warp parameter space into a metric in which the sizing
 * field (Task 3) and quadtree (Task 4) can reason about physical edge lengths
 * and curvature-driven refinement.
 *
 * @module conforming/SurfaceMetricTensor
 */

import type { SurfaceSampler, Vec3 } from './SurfaceSampler';

/** First fundamental form coefficients at a (u,t). */
export interface MetricTensor {
  /** E = ∂P/∂u · ∂P/∂u. */
  E: number;
  /** F = ∂P/∂u · ∂P/∂t. */
  F: number;
  /** G = ∂P/∂t · ∂P/∂t. */
  G: number;
}

const DEFAULT_H = 1e-4;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Clamp a t-evaluation step so the sample stays inside [0,1]. Returns the
 * effective step actually used (so central differences shrink near the caps
 * rather than reading outside the domain). u is left untouched because it
 * wraps periodically.
 */
function clampStepT(t: number, h: number): number {
  const hi = 1 - t;
  const lo = t;
  return Math.max(1e-9, Math.min(h, hi, lo));
}

/**
 * First fundamental form at (u,t) by central differences (step h in param).
 *
 * `Pu = (P(u+h,t)-P(u-h,t))/(2h)`, `Pt = (P(u,t+ht)-P(u,t-ht))/(2ht)`;
 * `E = Pu·Pu`, `F = Pu·Pt`, `G = Pt·Pt`.
 */
export function firstFundamentalForm(
  s: SurfaceSampler,
  u: number,
  t: number,
  h: number = DEFAULT_H,
): MetricTensor {
  const ht = clampStepT(t, h);
  const Pu = scale(sub(s.position(u + h, t), s.position(u - h, t)), 1 / (2 * h));
  const Pt = scale(sub(s.position(u, t + ht), s.position(u, t - ht)), 1 / (2 * ht));
  return { E: dot(Pu, Pu), F: dot(Pu, Pt), G: dot(Pt, Pt) };
}

/**
 * Max absolute principal curvature at (u,t) by second differences (mm^-1).
 *
 * Builds the shape operator S = II·I⁻¹ from the first fundamental form
 * `I=[[E,F],[F,G]]` and second fundamental form `II=[[L,M],[M,N]]`
 * (`L=Puu·n, M=Put·n, N=Ptt·n`, n the unit surface normal). The principal
 * curvatures are S's eigenvalues; this returns the larger magnitude.
 */
export function principalCurvatureMax(
  s: SurfaceSampler,
  u: number,
  t: number,
  h: number = DEFAULT_H,
): number {
  const ht = clampStepT(t, h);

  const P = s.position(u, t);
  const Pup = s.position(u + h, t);
  const Pum = s.position(u - h, t);
  const Ptp = s.position(u, t + ht);
  const Ptm = s.position(u, t - ht);
  const Pupp = s.position(u + h, t + ht);
  const Pupm = s.position(u + h, t - ht);
  const Pump = s.position(u - h, t + ht);
  const Pumm = s.position(u - h, t - ht);

  // First derivatives (central).
  const Pu = scale(sub(Pup, Pum), 1 / (2 * h));
  const Pt = scale(sub(Ptp, Ptm), 1 / (2 * ht));

  // Second derivatives (central).
  const Puu = scale(add(sub(Pup, scale(P, 2)), Pum), 1 / (h * h));
  const Ptt = scale(add(sub(Ptp, scale(P, 2)), Ptm), 1 / (ht * ht));
  // Mixed: (P(u+,t+) - P(u+,t-) - P(u-,t+) + P(u-,t-)) / (4 h ht)
  const Put = scale(
    add(sub(sub(Pupp, Pupm), Pump), Pumm),
    1 / (4 * h * ht),
  );

  const E = dot(Pu, Pu);
  const F = dot(Pu, Pt);
  const G = dot(Pt, Pt);

  const nRaw = cross(Pu, Pt);
  const nLen = Math.hypot(nRaw[0], nRaw[1], nRaw[2]);
  if (nLen < 1e-30) return 0;
  const n = scale(nRaw, 1 / nLen);

  const L = dot(Puu, n);
  const M = dot(Put, n);
  const N = dot(Ptt, n);

  // Shape operator S = II · I^{-1}.
  const detI = E * G - F * F;
  if (Math.abs(detI) < 1e-30) return 0;
  const invDet = 1 / detI;
  // I^{-1} = (1/detI) [[G, -F], [-F, E]].
  const i00 = G * invDet;
  const i01 = -F * invDet;
  const i10 = -F * invDet;
  const i11 = E * invDet;
  // S = [[L,M],[M,N]] · I^{-1}.
  const s00 = L * i00 + M * i10;
  const s01 = L * i01 + M * i11;
  const s10 = M * i00 + N * i10;
  const s11 = M * i01 + N * i11;

  // Eigenvalues of the 2x2 shape operator.
  const trace = s00 + s11;
  const det = s00 * s11 - s01 * s10;
  const disc = Math.max(0, trace * trace - 4 * det);
  const root = Math.sqrt(disc);
  const k1 = (trace + root) / 2;
  const k2 = (trace - root) / 2;
  return Math.max(Math.abs(k1), Math.abs(k2));
}
