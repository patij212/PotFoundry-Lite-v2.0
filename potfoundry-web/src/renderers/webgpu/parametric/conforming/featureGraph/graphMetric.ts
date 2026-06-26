/**
 * graphMetric.ts — shared (u,t)→mm distance primitives for the feature-graph
 * pipeline.
 *
 * The unifier ({@link ./unify}) and the conditioner ({@link ./conditionGraph})
 * BOTH measure distances in (u,t) parameter space scaled to millimetres, with u
 * PERIODIC ([0,1) on a circle). The periodic-u handling is subtle (a feature
 * straddling the u=0/1 seam must not read as far from its wrapped twin), so the
 * primitives live here as the SINGLE SOURCE OF TRUTH — the two consumers cannot
 * drift apart. Extracted verbatim from `unify.ts` (behaviour byte-identical).
 *
 * @module conforming/featureGraph/graphMetric
 */

import type { Vec2 } from './types';

/** Shortest periodic gap |u1−u2| on the unit circle, in [0, 0.5]. */
export function periodicGap(u1: number, u2: number): number {
  let d = Math.abs(u1 - u2) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/** Signed periodic gap (u2 − u1) wrapped to [−0.5, 0.5]. */
export function signedGap(u1: number, u2: number): number {
  let d = (u2 - u1) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}

/** Periodic-u (u,t)→mm gap between two points. */
export function pointDistMm(p: Vec2, q: Vec2, uToMm: number, tToMm: number): number {
  const du = periodicGap(p.u, q.u) * uToMm;
  const dt = (p.t - q.t) * tToMm;
  return Math.hypot(du, dt);
}

/** mm-distance from point p to segment ab (periodic in u). */
export function segDistMm(
  p: Vec2,
  a: Vec2,
  b: Vec2,
  uToMm: number,
  tToMm: number,
): number {
  // Work in a local mm frame anchored at `a`, with u un-wrapped relative to a.
  const ax = 0;
  const ay = 0;
  const bx = signedGap(a.u, b.u) * uToMm;
  const by = (b.t - a.t) * tToMm;
  const px = signedGap(a.u, p.u) * uToMm;
  const py = (p.t - a.t) * tToMm;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-300) return Math.hypot(px - ax, py - ay);
  let s = ((px - ax) * dx + (py - ay) * dy) / len2;
  s = s < 0 ? 0 : s > 1 ? 1 : s;
  const cx = ax + s * dx;
  const cy = ay + s * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Total polyline length in millimetres (periodic u). */
export function polyLengthMm(pts: readonly Vec2[], uToMm: number, tToMm: number): number {
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    len += pointDistMm(pts[i], pts[i + 1], uToMm, tToMm);
  }
  return len;
}

/** Lexicographic (u,t) comparison (deterministic node/edge ordering). */
export function cmpVec(a: Vec2, b: Vec2): number {
  if (a.u !== b.u) return a.u - b.u;
  if (a.t !== b.t) return a.t - b.t;
  return 0;
}
