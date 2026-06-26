/**
 * bandConstruct.ts — curvature-aware variable-width band construction.
 *
 * Produces a feature-following ridge band whose (u,t) footprint is SIMPLE by
 * construction (the perpendicular flank offset cannot fold), so it welds into the
 * multiply-connected `corridorPaveMulti` interior with zero T-junctions. The cure
 * for the STEP-3a blocker: real (even conditioned) feature spines self-fold a
 * CONSTANT-width offset at sharp corners → non-simple footprints → double-cover.
 *
 * Mechanism: cap each spine station's flank half-width by the local (metric)
 * radius of curvature (`w_i ≤ safety·R_i`), so the offset stays within the
 * non-folding envelope; sharp corners pinch toward zero width (accept-class thin
 * slivers, per the standing min(20°,θ) posture); the crest is always the EXACT
 * spine (fidelity untouched). A verify-and-shrink net guarantees a simple footprint
 * (terminating — width→0 is always simple). Reuses paveRidge's proven assembly
 * ({@link assembleRidgeBands}).
 *
 * See `docs/superpowers/specs/2026-06-26-band-construction-design.md`.
 *
 * @module fidelity/bandRemesh/bandConstruct
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { StationPoint } from './stations';

/** 3D distance between two (u,t) samples. */
function dist3(sampler: SurfaceSampler, a: StationPoint, b: StationPoint): number {
  const pa = sampler.position(a.u, a.t);
  const pb = sampler.position(b.u, b.t);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

/** Area of the 3D triangle (A,B,C). */
function area3(sampler: SurfaceSampler, A: StationPoint, B: StationPoint, C: StationPoint): number {
  const a = sampler.position(A.u, A.t);
  const b = sampler.position(B.u, B.t);
  const c = sampler.position(C.u, C.t);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * Per-station radius of curvature (mm) along the spine, via 3D Menger curvature
 * `R = (|AB|·|BC|·|CA|) / (4·area(ABC))` over the three consecutive stations.
 * Straight runs → `Infinity`; sharp turns → small `R`. Endpoints → `Infinity`.
 */
export function measureSpineCurvatureRadius(spine: StationPoint[], sampler: SurfaceSampler): number[] {
  const n = spine.length;
  const out = new Array<number>(n).fill(Infinity);
  for (let i = 1; i < n - 1; i++) {
    const A = spine[i - 1], B = spine[i], C = spine[i + 1];
    const ab = dist3(sampler, A, B);
    const bc = dist3(sampler, B, C);
    const ca = dist3(sampler, C, A);
    const ar = area3(sampler, A, B, C);
    out[i] = ar > 1e-12 ? (ab * bc * ca) / (4 * ar) : Infinity;
  }
  return out;
}
