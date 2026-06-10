/**
 * CellQualityRefinement.ts — Tier 2 interior quality-refinement kernel.
 *
 * The conforming mesher's per-cell constrained CDT
 * ({@link triangulateConstrainedCell}) inserts ZERO interior Steiner points
 * (`ConstrainedCellTriangulator.ts:77`): it only flips winding to satisfy the
 * constraints. On feature/grading cells this leaves anisotropic needles whose
 * smallest 3D interior angle falls well below the clean-CAD bar (≳20°).
 *
 * This module is the bounded Ruppert/Chew refinement primitive that fixes that
 * — IN ISOLATION on a single cell, with NO registry interaction. It scans for
 * the worst bad triangle (min 3D angle below the bar, measured in the surface
 * metric via a supplied sampler closure), inserts an off-center (Üngör)
 * circumcenter as a NEW INTERIOR point, and re-runs the seed CDT with the
 * boundary and constraint edges UNCHANGED. The loop repeats to a fixpoint or a
 * hard per-cell insertion cap.
 *
 * WATERTIGHT CONTRACT (load-bearing): this kernel may ONLY ever add
 * **cell-interior** points. Any candidate point that lands outside the cell box
 * or within {@link ON_EDGE_EPS} of a cell side is REJECTED (not inserted, not
 * split) — the cell keeps its best triangulation for that triangle. The cell
 * perimeter (boundary vertices + their order + the constraint edges) is never
 * mutated, so a neighbour cell sharing that perimeter is unaffected. On-edge
 * densification, when needed, is the job of the PASS A2 edge densifier (a
 * deterministic, registry-mirrored, edge-local function — a separate task);
 * NEVER this angle-driven loop. This is what keeps the mesh T-junction-free by
 * construction.
 *
 * @module conforming/CellQualityRefinement
 */

import {
  triangulateConstrainedCell,
  type CellPoint,
  type ConstrainedCellInput,
  type ConstrainedCellResult,
} from './ConstrainedCellTriangulator';

/** A surface sampler closure: (u,t) → 3D position (mm). The refinement metric. */
export type Sampler3D = (u: number, t: number) => readonly [number, number, number];

/** Min interior angle (deg) the gate counts as "clean CAD". */
export const THETA_MIN = 20;
/** Drive refinement slightly above the bar for margin. */
export const THETA_REFINE = 25;
/** Hard per-cell insertion cap — guarantees termination on acute inputs. */
export const MAX_STEINER_PER_CELL = 32;
/** Tier 1a aspect cap (re-exported for the templates; unused by this kernel). */
export const ASPECT_CAP = 4;
/** Input angle (deg) below which a feature corner is "unfixable" (Task 6). */
export const SHARP_CORNER_DEG = 36;
/** F-shear degeneracy floor (EG−F² below this ⇒ no-refine fallback; Task 7). */
export const MIN_EGF2 = 1e-9;

/**
 * A candidate / inserted point must be at least this far (in (u,t)) from every
 * cell side to be accepted. Matches the triangulator's on-edge epsilon
 * (`FeatureConformingTriangulator.ts:54`) so "interior" means the same thing on
 * both sides of the contract.
 */
export const ON_EDGE_EPS = 1e-9;

/** Options controlling one cell's interior refinement. */
export interface CellRefineOptions {
  /** Minimum interior 3D angle (deg) every non-protected triangle must reach. */
  angleBar?: number;
  /** Per-cell hard insertion cap (best-so-far on exhaustion). */
  cap?: number;
}

/**
 * The seed cell to refine: the original constrained-cell INPUT (so the boundary
 * + constraint edges can be replayed unchanged) plus its seed CDT RESULT.
 */
export interface SeedCell {
  input: ConstrainedCellInput;
  result: ConstrainedCellResult;
}

/** 3D distance² between two sampled (u,t) points. */
function dist2(p: readonly number[], q: readonly number[]): number {
  const dx = p[0] - q[0];
  const dy = p[1] - q[1];
  const dz = p[2] - q[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Smallest interior angle (deg) of the triangle with the given 3D corner
 * positions, by the law of cosines — the SAME basis as the gate metric
 * (`metrics.ts:782`/`:920`). Returns 180 for a degenerate (zero-length-edge)
 * triangle so it never registers as the "worst" (degenerates are handled
 * separately by area).
 */
function triMinAngle3D(A: readonly number[], B: readonly number[], C: readonly number[]): number {
  const a = Math.sqrt(dist2(B, C));
  const b = Math.sqrt(dist2(C, A));
  const c = Math.sqrt(dist2(A, B));
  const law = (adj1: number, adj2: number, opp: number): number => {
    if (adj1 <= 0 || adj2 <= 0) return 180;
    let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
    if (cos > 1) cos = 1;
    if (cos < -1) cos = -1;
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(law(b, c, a), law(a, c, b), law(a, b, c));
}

/** Signed area of triangle p,q,r in (u,t); positive ⇒ CCW. */
function signedArea2(p: CellPoint, q: CellPoint, r: CellPoint): number {
  return (q.u - p.u) * (r.t - p.t) - (r.u - p.u) * (q.t - p.t);
}

/**
 * Off-center (Üngör) Steiner point for a bad triangle, computed in the **3D
 * surface metric** and mapped back to (u,t) via barycentric coordinates.
 *
 * The anisotropy is in the (u,t)→3D map, so refining in (u,t) would insert a
 * point that is well-shaped in parameter space but still a sliver on the
 * surface. We therefore:
 *  1. sample the three corners to 3D (`A,B,C`);
 *  2. compute the off-center point `X` IN THE TRIANGLE'S 3D PLANE (so distances
 *     are true surface distances), pulling from the shortest 3D edge's midpoint
 *     toward the 3D circumcenter no farther than `r_off = (|shortEdge|/2)/tan(β/2)`
 *     (Üngör — bounds the new smallest angle to ≥ β, cutting insertion count);
 *  3. express `X` in barycentric coordinates of the 3D triangle (affine-invariant);
 *  4. apply those same barycentrics to the (u,t) triangle to get the insertion
 *     point — exact when the map is affine (our synthetic case), a good local
 *     approximation otherwise.
 *
 * Returns `null` for a degenerate triangle (no useful refinement point).
 */
function offCenter3DToUT(
  p: CellPoint,
  q: CellPoint,
  r: CellPoint,
  sampler: Sampler3D,
  betaAngleDeg: number,
): CellPoint | null {
  const A = sampler(p.u, p.t);
  const B = sampler(q.u, q.t);
  const C = sampler(r.u, r.t);

  // 3D edge vectors from A.
  const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const ac = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  // Plane normal; degenerate if zero-area.
  const nx = ab[1] * ac[2] - ab[2] * ac[1];
  const ny = ab[2] * ac[0] - ab[0] * ac[2];
  const nz = ab[0] * ac[1] - ab[1] * ac[0];
  const n2 = nx * nx + ny * ny + nz * nz;
  if (n2 < 1e-24) return null;

  // Circumcenter in the triangle's plane (Cartesian, in 3D), via the canonical
  // cross-product formula: O = A + ((|ab|²·ac − |ac|²·ab) × N) / (2|N|²),
  // where N = ab×ac. (Verified against the right-triangle hypotenuse midpoint.)
  const ab2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const ac2 = ac[0] * ac[0] + ac[1] * ac[1] + ac[2] * ac[2];
  const w = [
    ab2 * ac[0] - ac2 * ab[0],
    ab2 * ac[1] - ac2 * ab[1],
    ab2 * ac[2] - ac2 * ab[2],
  ];
  // w × N
  const wxn = [
    w[1] * nz - w[2] * ny,
    w[2] * nx - w[0] * nz,
    w[0] * ny - w[1] * nx,
  ];
  const inv = 1 / (2 * n2);
  const cc = [
    A[0] + wxn[0] * inv,
    A[1] + wxn[1] * inv,
    A[2] + wxn[2] * inv,
  ];

  // Shortest 3D edge → its midpoint anchors the off-center.
  const V3 = [A, B, C];
  const elen2 = (i: number, j: number): number =>
    (V3[i][0] - V3[j][0]) ** 2 + (V3[i][1] - V3[j][1]) ** 2 + (V3[i][2] - V3[j][2]) ** 2;
  const e = [elen2(1, 2), elen2(2, 0), elen2(0, 1)]; // opposite vert 0,1,2
  let s = 0;
  if (e[1] < e[s]) s = 1;
  if (e[2] < e[s]) s = 2;
  const i = (s + 1) % 3;
  const j = (s + 2) % 3;
  const mid = [
    (V3[i][0] + V3[j][0]) / 2,
    (V3[i][1] + V3[j][1]) / 2,
    (V3[i][2] + V3[j][2]) / 2,
  ];

  const shortLen = Math.sqrt(e[s]);
  const beta = Math.max(betaAngleDeg, 1) * (Math.PI / 180);
  const rOff = (shortLen / 2) / Math.tan(beta / 2); // half-edge / tan(β/2)

  let dx = cc[0] - mid[0];
  let dy = cc[1] - mid[1];
  let dz = cc[2] - mid[2];
  const dlen = Math.hypot(dx, dy, dz);
  let X: number[];
  if (dlen < 1e-18) {
    X = cc; // circumcenter coincides with the midpoint
  } else if (dlen <= rOff) {
    X = cc; // circumcenter is the gentler (closer) point
  } else {
    dx /= dlen;
    dy /= dlen;
    dz /= dlen;
    X = [mid[0] + dx * rOff, mid[1] + dy * rOff, mid[2] + dz * rOff];
  }

  // Barycentric coords of X w.r.t. the 3D triangle (affine-invariant), then map
  // to (u,t) with the same weights.
  const bary = barycentric3D(A, B, C, X, n2);
  if (bary === null) return null;
  const [wa, wb, wc] = bary;
  return {
    u: wa * p.u + wb * q.u + wc * r.u,
    t: wa * p.t + wb * q.t + wc * r.t,
  };
}

/**
 * Barycentric coordinates of point `X` in the plane of 3D triangle A,B,C, via
 * the projected-area (cross-product) method. `n2` is |(B−A)×(C−A)|² (>0).
 * Returns `[wA,wB,wC]` (summing to 1) or `null` if degenerate.
 */
function barycentric3D(
  A: readonly number[],
  B: readonly number[],
  C: readonly number[],
  X: readonly number[],
  n2: number,
): [number, number, number] | null {
  if (n2 < 1e-24) return null;
  const cross = (p: readonly number[], q: readonly number[]): number[] => [
    p[1] * q[2] - p[2] * q[1],
    p[2] * q[0] - p[0] * q[2],
    p[0] * q[1] - p[1] * q[0],
  ];
  const sub = (p: readonly number[], q: readonly number[]): number[] => [
    p[0] - q[0], p[1] - q[1], p[2] - q[2],
  ];
  // Full normal (un-normalized) for sign reference.
  const nFull = cross(sub(B, A), sub(C, A));
  const dot = (p: readonly number[], q: readonly number[]): number =>
    p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  // Sub-triangle signed areas (·2) projected onto nFull.
  const areaBCX = dot(cross(sub(B, X), sub(C, X)), nFull);
  const areaCAX = dot(cross(sub(C, X), sub(A, X)), nFull);
  const areaABX = dot(cross(sub(A, X), sub(B, X)), nFull);
  const denom = n2; // = dot(nFull, nFull)
  return [areaBCX / denom, areaCAX / denom, areaABX / denom];
}

/** True iff the (u,t) point is strictly inside the cell box (all sides clear). */
function strictlyInsideBox(p: CellPoint, box: { u0: number; u1: number; t0: number; t1: number }): boolean {
  return (
    p.u > box.u0 + ON_EDGE_EPS &&
    p.u < box.u1 - ON_EDGE_EPS &&
    p.t > box.t0 + ON_EDGE_EPS &&
    p.t < box.t1 - ON_EDGE_EPS
  );
}

/** Axis-aligned bounding box of the seed boundary (the cell sides). */
function boundaryBox(boundary: CellPoint[]): { u0: number; u1: number; t0: number; t1: number } {
  let u0 = Infinity, u1 = -Infinity, t0 = Infinity, t1 = -Infinity;
  for (const p of boundary) {
    if (p.u < u0) u0 = p.u;
    if (p.u > u1) u1 = p.u;
    if (p.t < t0) t0 = p.t;
    if (p.t > t1) t1 = p.t;
  }
  return { u0, u1, t0, t1 };
}

/**
 * Refine a single isolated cell's INTERIOR triangulation to raise the minimum
 * 3D interior angle to `angleBar`, inserting only off-center circumcenters that
 * land strictly inside the cell box. The boundary and constraint edges are
 * replayed unchanged on every re-triangulation, so the perimeter is invariant.
 *
 * No registry, no neighbour interaction, no on-edge insertion: this is the
 * quality engine in isolation (blueprint Task 4). Termination is unconditional
 * via the per-cell `cap`.
 */
export function refineCellInterior(
  seed: SeedCell,
  sampler: Sampler3D,
  opts: CellRefineOptions = {},
): ConstrainedCellResult {
  const angleBar = opts.angleBar ?? THETA_MIN;
  const cap = Math.max(0, Math.floor(opts.cap ?? MAX_STEINER_PER_CELL));

  const boundary = seed.input.boundary;
  const constraints = seed.input.constraints;
  const box = boundaryBox(boundary);

  // Accumulated interior points: start from the seed's interior, append
  // circumcenters. The boundary + constraints are NEVER touched.
  const interior: CellPoint[] = [...seed.input.interior];

  let result = seed.result;
  const sample = (p: CellPoint): readonly [number, number, number] => sampler(p.u, p.t);
  // Drive a hair above the bar for margin (off-center β), but never below it.
  const driveBar = Math.max(angleBar, Math.min(THETA_REFINE, angleBar + 5));

  /** Is `cand` a usable interior insertion (strictly inside + not coincident)? */
  const acceptable = (cand: CellPoint | null): boolean => {
    // WATERTIGHT: reject anything not STRICTLY interior. Do not insert, do not
    // split — the boundary is PASS A2's job, never this angle-driven loop.
    if (cand === null || !strictlyInsideBox(cand, box)) return false;
    for (const e of boundary) {
      if (Math.abs(e.u - cand.u) <= ON_EDGE_EPS && Math.abs(e.t - cand.t) <= ON_EDGE_EPS) return false;
    }
    for (const e of interior) {
      if (Math.abs(e.u - cand.u) <= ON_EDGE_EPS && Math.abs(e.t - cand.t) <= ON_EDGE_EPS) return false;
    }
    return true;
  };

  for (let inserted = 0; inserted < cap; inserted++) {
    // Rank every below-bar, non-degenerate triangle worst-angle-first.
    const bad: Array<{ tri: [number, number, number]; ang: number }> = [];
    for (const [ia, ib, ic] of result.triangles) {
      const A = sample(result.points[ia]);
      const B = sample(result.points[ib]);
      const C = sample(result.points[ic]);
      const ang = triMinAngle3D(A, B, C);
      if (ang < angleBar) bad.push({ tri: [ia, ib, ic], ang });
    }
    if (bad.length === 0) break; // all triangles clear the bar — done.
    bad.sort((x, y) => x.ang - y.ang);

    // Insert ONE off-center for the worst triangle that yields a STRICTLY
    // INTERIOR candidate, then re-triangulate and rescan. Walking down the
    // ranked list means a triangle whose off-center would land on/beyond the
    // perimeter (rejected) does not stall the whole loop — the next-worst
    // interior-fixable triangle is refined instead.
    //
    // CRITICAL (no centroid / no boundary chase): we deliberately do NOT fall
    // back to a centroid or any always-interior point. A bad triangle whose
    // shortest edge lies on the cell boundary has its off-center marching toward
    // that (un-splittable) boundary edge; chasing it would either march onto the
    // edge (forbidden) or insert a cascade of ever-thinner interior points that
    // never converge. Such triangles are PASS A2's responsibility (edge
    // densification), NOT this interior loop — so they are simply skipped here,
    // and the kernel exits best-effort once no triangle admits an interior fix.
    let didInsert = false;
    for (const { tri } of bad) {
      const p = result.points[tri[0]];
      const q = result.points[tri[1]];
      const r = result.points[tri[2]];
      // Skip a (u,t)-degenerate triangle (constraint forced collinear points).
      if (Math.abs(signedArea2(p, q, r)) < 1e-18) continue;

      const offc = offCenter3DToUT(p, q, r, sampler, driveBar);
      if (!acceptable(offc)) continue;

      interior.push(offc as CellPoint);
      result = triangulateConstrainedCell({ boundary, interior, constraints });
      didInsert = true;
      break;
    }
    if (!didInsert) break; // no bad triangle admits an interior point — best-effort exit.
  }

  return result;
}
