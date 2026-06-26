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
import { perpUV } from './featureStrip';
import { extractHoleBoundary } from './seamFill';

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

/** Options for {@link safeHalfWidthProfile}. */
export interface HalfWidthOpts {
  /** Fraction of the curvature radius the half-width may use (default 0.8). */
  safety?: number;
  /** Min-filter neighborhood (stations each side) tapering a pinch (default 2). */
  taperRadius?: number;
  /** Optional per-station upper bound (mm) from feature density (assembler-supplied). */
  maxByDensity?: number[];
}

/**
 * Per-station flank half-width (mm): `w_i = min(target, safety·R_i, density_i)`,
 * then a min-filter over `±taperRadius` so a corner's pinch tapers across its
 * neighbours (prevents multi-segment folds). The crest is unaffected — only the
 * flank width adapts.
 */
export function safeHalfWidthProfile(
  radius: number[],
  targetWidthMm: number,
  opts: HalfWidthOpts = {},
): number[] {
  const safety = opts.safety ?? 0.8;
  const taper = opts.taperRadius ?? 2;
  const base = radius.map((R, i) => {
    let w = Math.min(targetWidthMm, safety * R);
    if (opts.maxByDensity) w = Math.min(w, opts.maxByDensity[i]);
    return w;
  });
  if (taper <= 0) return base;
  const out = base.slice();
  for (let i = 0; i < base.length; i++) {
    let m = base[i];
    for (let k = Math.max(0, i - taper); k <= Math.min(base.length - 1, i + taper); k++) {
      if (base[k] < m) m = base[k];
    }
    out[i] = m;
  }
  return out;
}

/** Offset each spine station by its own ±width along the metric perpendicular. */
export function offsetRailVariable(
  spine: StationPoint[],
  sampler: SurfaceSampler,
  widths: number[],
  sign: 1 | -1,
): StationPoint[] {
  const n = spine.length;
  const out: StationPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    let du = (b.u - a.u) % 1;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    const dt = b.t - a.t;
    const l = Math.hypot(du, dt) || 1;
    const { a: pa, b: pb } = perpUV(sampler, spine[i].u, spine[i].t, du / l, dt / l);
    const w = widths[i];
    out.push({ u: spine[i].u + sign * pa * w, t: spine[i].t + sign * pb * w });
  }
  return out;
}

/** Proper (strict-interior) crossing of (u,t) segments p1→p2 and p3→p4. */
function properCrossUT(
  p1: readonly [number, number], p2: readonly [number, number],
  p3: readonly [number, number], p4: readonly [number, number],
): boolean {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return false;
  const qpx = p3[0] - p1[0], qpy = p3[1] - p1[1];
  const tS = (qpx * sy - qpy * sx) / denom;
  const tU = (qpx * ry - qpy * rx) / denom;
  const E = 1e-12;
  return tS > E && tS < 1 - E && tU > E && tU < 1 - E;
}

/**
 * Count proper self-crossings of the band's (u,t) FOOTPRINT — the count-1 perimeter
 * loop of its mesh (the spine crease is count-2 interior). Returns `Infinity` when
 * the perimeter is not a single simple loop (a degenerate band). This is the weld
 * precondition `corridorPaveMulti`'s `pointInLoop` exclusion requires.
 */
export function footprintSelfCrossings(
  mesh: { indices: Uint32Array },
  vertexUT: Array<[number, number]>,
): number {
  let loop: number[];
  try {
    const bh = extractHoleBoundary({ indices: mesh.indices }, new Set<number>());
    if (bh.loops.length !== 1) return Infinity;
    loop = bh.loops[0];
  } catch {
    return Infinity;
  }
  const pts = loop.map((id) => vertexUT[id]);
  const m = pts.length;
  let count = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    for (let j = i + 1; j < m; j++) {
      if (j === i || (j + 1) % m === i || (i + 1) % m === j) continue;
      if (properCrossUT(a, b, pts[j], pts[(j + 1) % m])) count++;
    }
  }
  return count;
}
