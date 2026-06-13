/**
 * crestAlignedCeiling.ts — the CURE-confirming follow-up to
 * cellTriangulationCeiling.ts.
 *
 * `stage3-connectivity-ceiling.md` proved that on the AXIS-ALIGNED grid,
 * connectivity alone cannot lift 55.5% of SFB@1 crest cells above 15° in 3D —
 * because the crest is incommensurate with the grid and carves thin slivers.
 * This module tests the proposed cure: ALIGN the local lattice to the crest so
 * the crest is a grid LINE (not a chord cutting across cells), and measure the
 * 3D triangle quality of the crest-adjacent cells.
 *
 * Two alignment models, same real SFB@1 crests, same production grid spacing:
 *
 *   M1 — SHEARED lattice `v = u − u*(t)` (the crest at v=0). This is EXACTLY
 *        what the repo's CreaseUWarp / CreaseHelixWarp already do (shift u by
 *        the crease offset). Crest-adjacent cells are PARALLELOGRAMS in (u,t):
 *        the v=const sides run parallel to the crest, the t=const sides stay
 *        horizontal. Cheap, already-built machinery — but a sheared
 *        parallelogram's min angle is capped by its shear angle.
 *
 *   M2 — PERPENDICULAR crest-frame ribbon (the ideal). The flank cell offsets
 *        the crest segment by a vector that maps (via the surface Jacobian) to
 *        a 3D displacement PERPENDICULAR to the crest tangent and of length =
 *        the along-crest cell length — i.e. a 3D-square cell with the crest as
 *        one edge. The upper bound on what alignment can buy.
 *
 * Each flank cell is a clean quad (crest on an edge, no internal chord), so its
 * "best achievable" is just the better of its two diagonals — measured in 3D
 * through the SAME production wall surface (`SfbWallSampler`), never in (u,t).
 *
 * Scope (honest): this measures whether crest-aligned CELLS can be well-shaped
 * — the geometric premise of the cure. It does NOT address how to TILE a
 * sheared ribbon watertightly into the surrounding axis-aligned grid (the
 * transition zone) — that is the engineering follow-on, not the feasibility
 * question. Pure CPU, production byte-identical.
 */
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import type { PositionSampler } from './metrics';
import type { ParamRidgeBranch } from './crestLateralDeviation';
import { sfClosedFormParamRidge } from './crestLateralDeviation';
import { polygonBestMinAngle3D } from './cellTriangulationCeiling';
import {
  SfbWallSampler,
  SFB1_PACKED,
  SFB_FEATURE_LEVEL,
  SFB_UBIAS,
} from './snapPlacementAudit';

type V3 = readonly [number, number, number];

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function len(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function norm(a: V3): V3 {
  const l = len(a);
  return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}
function sdU(a: number, b: number): number {
  let d = (a - b) % 1;
  if (d > 0.5) d -= 1;
  if (d <= -0.5) d += 1;
  return d;
}

/** Interpolated crest u at t (wrap-aware), or null outside the branch domain. */
function branchUAt(branch: ParamRidgeBranch, t: number): number | null {
  const pts = branch.points;
  if (pts.length < 2) return null;
  if (t < pts[0].t - 1e-9 || t > pts[pts.length - 1].t + 1e-9) return null;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const p0 = pts[lo];
  const p1 = pts[hi];
  const span = p1.t - p0.t;
  const f = span > 1e-12 ? (t - p0.t) / span : 0;
  return wrapU(p0.u + sdU(p1.u, p0.u) * f);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface AngleStats {
  count: number;
  minDeg: number;
  p05Deg: number;
  medianDeg: number;
  below15: number;
  below20: number;
  below30: number;
  /** Fractions for the verdict. */
  fracBelow15: number;
  fracBelow20: number;
}

function angleStats(values: number[]): AngleStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number): number => (n === 0 ? 0 : sorted[Math.min(n - 1, Math.floor(q * n))]);
  let b15 = 0;
  let b20 = 0;
  let b30 = 0;
  for (const v of sorted) {
    if (v < 15) b15++;
    if (v < 20) b20++;
    if (v < 30) b30++;
  }
  const denom = Math.max(1, n);
  return {
    count: n,
    minDeg: n > 0 ? sorted[0] : 0,
    p05Deg: at(0.05),
    medianDeg: at(0.5),
    below15: b15,
    below20: b20,
    below30: b30,
    fracBelow15: b15 / denom,
    fracBelow20: b20 / denom,
  };
}

/** Best 3D min-angle over the two diagonals of a quad (cyclic vertex order). */
function quadBestMinAngle3D(quad: CellPoint[], surf: PositionSampler): number {
  return polygonBestMinAngle3D(quad, surf);
}

// ─────────────────────────────────────────────────────────────────────────────
// The aligned-ceiling audit
// ─────────────────────────────────────────────────────────────────────────────

export interface SfbAlignedCeilingResult {
  config: {
    styleId: 'SuperformulaBlossom';
    packedParams: number[];
    featureLevel: number;
    uBias: number;
    tSpan: number;
    crestBranches: number;
    widthScale: number;
  };
  /** Crest-adjacent flank cells measured (2 per crest grid-row). */
  cellsMeasured: number;
  skippedRows: number;
  /** M1 — sheared lattice (CreaseUWarp-style parallelogram cells). */
  sheared: AngleStats;
  /** M2 — perpendicular crest-frame ribbon (ideal 3D-square cells). */
  perpendicular: AngleStats;
}

export interface SfbAlignedCeilingOptions {
  /** Analytic-ridge polyline density. Default 6145 (matches the axis audit). */
  tSamples?: number;
  /** Cross-crest cell width as a multiple of the along-crest length (aspect).
   *  Default 1 (3D-square). */
  widthScale?: number;
}

/**
 * Walk every SFB@1 crest across the production featureLevel-7 / B=2 grid rows;
 * for each row build the two crest-adjacent flank cells under BOTH alignment
 * models and measure their best 3D min-angle. Returns the M1 (sheared) and M2
 * (perpendicular) distributions for a head-to-head against the axis-aligned
 * ceiling.
 */
export function runSfbCrestAlignedCeilingAudit(
  opts: SfbAlignedCeilingOptions = {},
): SfbAlignedCeilingResult {
  const tSamples = opts.tSamples ?? 6145;
  const widthScale = opts.widthScale ?? 1;
  const p = Float32Array.from(SFB1_PACKED);
  const surf = new SfbWallSampler(p);
  const tSpan = 1 << SFB_FEATURE_LEVEL;
  const EPS = 1e-5; // surface FD step (u,t)

  const ridge = sfClosedFormParamRidge(p, { tSamples });
  const crests = ridge.branches.filter((b) => b.kind === 'crest');

  const sheared: number[] = [];
  const perpendicular: number[] = [];
  let skipped = 0;

  const P = (u: number, t: number): V3 => surf.position(u, t);

  for (const branch of crests) {
    const tLo = branch.points[0].t;
    const tHi = branch.points[branch.points.length - 1].t;
    const jLo = Math.ceil(tLo * tSpan - 1e-9);
    const jHi = Math.floor(tHi * tSpan + 1e-9) - 1;
    for (let j = jLo; j <= jHi; j++) {
      const t0 = j / tSpan;
      const t1 = (j + 1) / tSpan;
      const tm = (t0 + t1) / 2;
      const u0c = branchUAt(branch, t0);
      const u1c = branchUAt(branch, t1);
      const umc = branchUAt(branch, tm);
      if (u0c === null || u1c === null || umc === null) {
        skipped++;
        continue;
      }

      // Along-crest 3D length of this segment.
      const c0 = P(u0c, t0);
      const c1 = P(u1c, t1);
      const L = len(sub(c1, c0));
      if (!(L > 1e-9)) {
        skipped++;
        continue;
      }

      // Surface tangents at the crest midpoint.
      const Pu = ((): V3 => {
        const a = P(umc + EPS, tm);
        const b = P(umc - EPS, tm);
        return [(a[0] - b[0]) / (2 * EPS), (a[1] - b[1]) / (2 * EPS), (a[2] - b[2]) / (2 * EPS)];
      })();
      const Pt = ((): V3 => {
        const a = P(umc, Math.min(1, tm + EPS));
        const b = P(umc, Math.max(0, tm - EPS));
        return [(a[0] - b[0]) / (2 * EPS), (a[1] - b[1]) / (2 * EPS), (a[2] - b[2]) / (2 * EPS)];
      })();
      const puLen = len(Pu);
      if (!(puLen > 1e-9)) {
        skipped++;
        continue;
      }

      // ── M1: sheared lattice (offset purely in u at fixed t) ──
      // Cross-crest extent Δv in u so the horizontal side's 3D length ≈ L·scale.
      const dv = (L * widthScale) / puLen;
      const shPlus: CellPoint[] = [
        { u: u0c, t: t0 },
        { u: u0c + dv, t: t0 },
        { u: u1c + dv, t: t1 },
        { u: u1c, t: t1 },
      ];
      const shMinus: CellPoint[] = [
        { u: u0c, t: t0 },
        { u: u1c, t: t1 },
        { u: u1c - dv, t: t1 },
        { u: u0c - dv, t: t0 },
      ];
      sheared.push(quadBestMinAngle3D(shPlus, surf));
      sheared.push(quadBestMinAngle3D(shMinus, surf));

      // ── M2: perpendicular crest-frame ribbon ──
      // crest 3D tangent, surface normal, in-plane perpendicular.
      const ddu = sdU(u1c, u0c);
      const ddt = t1 - t0;
      const Tc = norm([
        Pu[0] * ddu + Pt[0] * ddt,
        Pu[1] * ddu + Pt[1] * ddt,
        Pu[2] * ddu + Pt[2] * ddt,
      ]);
      const N = norm(cross(Pu, Pt));
      const n3 = norm(cross(N, Tc)); // in tangent plane, ⊥ crest
      // Solve J·δ = (L·scale)·n3 for δ=(δu,δt), J=[Pu|Pt]. JᵀJ is 2×2 SPD.
      const w = L * widthScale;
      const b: V3 = [w * n3[0], w * n3[1], w * n3[2]];
      const a11 = dot(Pu, Pu);
      const a12 = dot(Pu, Pt);
      const a22 = dot(Pt, Pt);
      const b1 = dot(Pu, b);
      const b2 = dot(Pt, b);
      const det = a11 * a22 - a12 * a12;
      if (!(Math.abs(det) > 1e-18)) {
        skipped++;
        continue;
      }
      const du = (b1 * a22 - b2 * a12) / det;
      const dt = (a11 * b2 - a12 * b1) / det;
      const ppPlus: CellPoint[] = [
        { u: u0c, t: t0 },
        { u: u1c, t: t1 },
        { u: u1c + du, t: t1 + dt },
        { u: u0c + du, t: t0 + dt },
      ];
      const ppMinus: CellPoint[] = [
        { u: u0c, t: t0 },
        { u: u0c - du, t: t0 - dt },
        { u: u1c - du, t: t1 - dt },
        { u: u1c, t: t1 },
      ];
      perpendicular.push(quadBestMinAngle3D(ppPlus, surf));
      perpendicular.push(quadBestMinAngle3D(ppMinus, surf));
    }
  }

  return {
    config: {
      styleId: 'SuperformulaBlossom',
      packedParams: [...SFB1_PACKED],
      featureLevel: SFB_FEATURE_LEVEL,
      uBias: SFB_UBIAS,
      tSpan,
      crestBranches: crests.length,
      widthScale,
    },
    cellsMeasured: sheared.length,
    skippedRows: skipped,
    sheared: angleStats(sheared),
    perpendicular: angleStats(perpendicular),
  };
}
