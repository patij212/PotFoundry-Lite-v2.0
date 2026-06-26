/**
 * featureAlignedCell.ts — feature-aligned interior fill for a single feature cell
 * (the strip-pave graft, drop-in for {@link triangulateConstrainedCell}).
 *
 * MEASUREMENT (sfbSliversBySource.probe, 2026-06-26): on the real SFB@1 per-cell
 * wall at the production anisotropy (computeUBias=2), the per-cell CDT
 * (FCT_FEATURE_CDT) owns 81% of the <20° slivers, 98% of <10°, and 100% of the
 * <1° catastrophic needles. The needles come from a feature constraint splitting
 * a (3D-near-square) cell into thin sub-regions that the CDT can only fill with
 * sliver triangles — the lone long constraint edge has no interior vertices to
 * subdivide the thin strip beside it.
 *
 * THIS module SUBDIVIDES the ridge into column stations (spaced by 3D arc length)
 * and adds perpendicular row points beside it (offset in the 3D metric), forming a
 * ridge-aligned, 3D-near-square grid, then hands the augmented input to the SAME
 * {@link triangulateConstrainedCell} kernel. The ridge subdivision is SHARED by
 * both sub-regions (the constraint chain both sides reference), so the two flanks
 * weld along it with no intra-cell crack. All added points are interior (kept
 * clear of the perimeter by `minEdgeDist`), so the cell's boundary vertex set is
 * UNCHANGED — the registry-shared perimeter still welds watertight + T-junction-
 * free by construction.
 *
 * Distinct from {@link refineCellInterior} (MEASURED HARMFUL): that placed
 * ISOTROPIC off-centres via an affine back-map; here the grid runs PARALLEL to the
 * ridge and is spaced by 3D arc length, so the triangles are 3D-near-square in the
 * u-stretched feature band the isotropic tool could not square.
 *
 * Gated to the SIMPLE case — exactly one open feature chain crossing the cell from
 * boundary to boundary (no junction, no loop, no second chain). Otherwise returns
 * `null` and the caller falls back to the plain CDT (so the graft can only improve
 * the simple cells, never regress the harder ones).
 *
 * @module conforming/featureAlignedCell
 */

import {
  triangulateConstrainedCell,
  type CellPoint,
  type ConstrainedCellInput,
  type ConstrainedCellResult,
} from './ConstrainedCellTriangulator';

/** A (u,t) → 3D position closure (the wall's production surface map). */
export type Sampler3D = (u: number, t: number) => readonly [number, number, number];

export interface FeatureAlignedOptions {
  /** Target triangle edge length in 3D mm (sets the row/column spacing). */
  targetEdgeMm: number;
  /**
   * Minimum (u,t) Chebyshev distance a Steiner point must keep from the cell
   * perimeter, so the downstream tolerance weld can never fuse it across a shared
   * cell edge (→ no manufactured T-junction). Mirror the caller's
   * `STEINER_MIN_EDGE_DIST`.
   */
  minEdgeDist: number;
}

/** 3D distance between two (u,t) points under `sampler`. */
function dist3D(s: Sampler3D, a: CellPoint, b: CellPoint): number {
  const pa = s(a.u, a.t);
  const pb = s(b.u, b.t);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

/**
 * The single open feature chain through the cell, as an ordered vertex-index list
 * [b0, …, bk] into `points = [boundary, interior]`, where b0 and bk are BOUNDARY
 * indices (the entry/exit crossings) and the rest are interior. Returns null when
 * the constraint set is not exactly one such simple chain (junction / loop / two
 * chains / interior-only / perimeter-running) — the caller then falls back to CDT.
 */
export function extractSimpleChain(input: ConstrainedCellInput): number[] | null {
  const nB = input.boundary.length;
  const cons = input.constraints;
  if (cons.length === 0) return null;
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number): void => {
    const cur = adj.get(a);
    if (cur) cur.push(b);
    else adj.set(a, [b]);
  };
  for (const [a, b] of cons) {
    if (a === b) return null;
    link(a, b);
    link(b, a);
  }
  let end0 = -1, end1 = -1;
  for (const [v, ns] of adj) {
    if (ns.length > 2) return null; // junction
    if (ns.length === 1) {
      if (end0 < 0) end0 = v;
      else if (end1 < 0) end1 = v;
      else return null; // > 2 endpoints ⇒ not one path
    }
  }
  if (end0 < 0 || end1 < 0) return null; // closed loop (no degree-1 ends)
  if (end0 >= nB || end1 >= nB) return null; // an endpoint is interior ⇒ not a crossing
  const chain: number[] = [end0];
  const seen = new Set<number>([end0]);
  let cur = end0;
  while (cur !== end1) {
    const next = adj.get(cur)!.find((n) => !seen.has(n));
    if (next === undefined) return null; // broken path
    chain.push(next);
    seen.add(next);
    cur = next;
  }
  if (seen.size !== adj.size) return null; // leftover constrained vertices ⇒ not one chain
  for (let i = 1; i + 1 < chain.length; i++) if (chain[i] < nB) return null; // perimeter-running
  return chain;
}

/** Cell axis-aligned box from the boundary extent. */
function cellBox(boundary: CellPoint[]): { u0: number; u1: number; t0: number; t1: number } {
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
 * Build the ridge-aligned augmented input: ridge subdivided into 3D-uniform column
 * stations + perpendicular row points beside it, all interior. Returns null when
 * the ridge is too short to subdivide (no improvement available ⇒ fall back).
 */
export function buildFeatureAlignedInput(
  input: ConstrainedCellInput,
  chain: number[],
  sampler: Sampler3D,
  opts: FeatureAlignedOptions,
): ConstrainedCellInput | null {
  const points0: CellPoint[] = [...input.boundary, ...input.interior];
  const ridge = chain.map((i) => points0[i]);
  const cum: number[] = [0];
  for (let i = 0; i + 1 < ridge.length; i++) cum.push(cum[i] + dist3D(sampler, ridge[i], ridge[i + 1]));
  const ridgeLen3D = cum[cum.length - 1];
  const target = Math.max(1e-6, opts.targetEdgeMm);
  if (ridgeLen3D < target * 1.25) return null; // too short to row-subdivide usefully

  const ridgeAt = (s: number): CellPoint => {
    let seg = 0;
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const segLen = cum[seg + 1] - cum[seg] || 1;
    const f = Math.min(1, Math.max(0, (s - cum[seg]) / segLen));
    return {
      u: ridge[seg].u + (ridge[seg + 1].u - ridge[seg].u) * f,
      t: ridge[seg].t + (ridge[seg + 1].t - ridge[seg].t) * f,
    };
  };

  const { u0, u1, t0, t1 } = cellBox(input.boundary);

  // Local 3D metric scale (mm per unit u / unit t) at the cell centre.
  const uc = (u0 + u1) / 2, tc = (t0 + t1) / 2;
  const eu = Math.max(1e-9, (u1 - u0) * 1e-3);
  const et = Math.max(1e-9, (t1 - t0) * 1e-3);
  const mmPerU = dist3D(sampler, { u: uc - eu, t: tc }, { u: uc + eu, t: tc }) / (2 * eu);
  const mmPerT = dist3D(sampler, { u: uc, t: tc - et }, { u: uc, t: tc + et }) / (2 * et);

  // QUALITY margin from the perimeter (anisotropic): a Steiner point landing closer
  // than ~½ the target edge to a cell edge makes a needle AGAINST that long edge
  // (the edge has no interior vertices to break it up). Keep points ≥ this 3D
  // distance from each box edge and let the CDT fill the residual ½-target strip
  // with ONE well-shaped triangle row. Floored at `minEdgeDist` (the weld-safety
  // quantum), so a degenerate metric can never relax below the weld floor.
  const qMargin3D = 0.5 * target; // mm
  const marginU = Math.max(opts.minEdgeDist, qMargin3D / Math.max(1e-9, mmPerU));
  const marginT = Math.max(opts.minEdgeDist, qMargin3D / Math.max(1e-9, mmPerT));
  const insideBox = (p: CellPoint): boolean =>
    p.u > u0 + marginU && p.u < u1 - marginU && p.t > t0 + marginT && p.t < t1 - marginT;

  const newInterior: CellPoint[] = [...input.interior];
  const addInterior = (p: CellPoint): number => {
    newInterior.push(p);
    return input.boundary.length + newInterior.length - 1;
  };

  // Min 3D distance from a point to the ridge polyline (for the grid exclusion zone),
  // measured in the local metric (anisotropy-aware).
  const distToRidge = (p: CellPoint): number => {
    let best = Infinity;
    for (let i = 0; i + 1 < ridge.length; i++) {
      const a = ridge[i], b = ridge[i + 1];
      const abu = (b.u - a.u) * mmPerU, abt = (b.t - a.t) * mmPerT;
      const apu = (p.u - a.u) * mmPerU, apt = (p.t - a.t) * mmPerT;
      const len2 = abu * abu + abt * abt || 1;
      const f = Math.min(1, Math.max(0, (apu * abu + apt * abt) / len2));
      const du = apu - f * abu, dt = apt - f * abt;
      best = Math.min(best, Math.hypot(du, dt));
    }
    return best;
  };

  // ── (1) Subdivide the ridge into 3D-uniform column stations (the feature is
  //    FOLLOWED as a chain of mesh edges; the subdivision is shared by both flanks
  //    → no intra-cell crack). ──
  const nCol = Math.max(2, Math.round(ridgeLen3D / target));
  const stationIdx: number[] = [chain[0]];
  for (let ci = 1; ci < nCol; ci++) stationIdx.push(addInterior(ridgeAt((ci / nCol) * ridgeLen3D)));
  stationIdx.push(chain[chain.length - 1]);
  const newConstraints: Array<[number, number]> = [];
  for (let i = 0; i + 1 < stationIdx.length; i++) newConstraints.push([stationIdx[i], stationIdx[i + 1]]);

  // ── (2) Anisotropic BACKGROUND grid over the cell interior — the same uniform
  //    3D-near-square fill that makes a PLAIN cell well-shaped, so corners far from
  //    the ridge get points (no flat corner triangles). Grid points inside the
  //    ridge's exclusion zone (≤ 0.6·target) are dropped — the ridge stations own
  //    that strip — and points within the quality margin of the perimeter are
  //    dropped (the CDT fills the residual ½-target rim row). ──
  const nu = Math.max(1, Math.round(((u1 - u0) * mmPerU) / target));
  const nv = Math.max(1, Math.round(((t1 - t0) * mmPerT) / target));
  const excl = 0.6 * target;
  for (let i = 1; i < nu; i++) {
    for (let j = 1; j < nv; j++) {
      const p: CellPoint = { u: u0 + (i * (u1 - u0)) / nu, t: t0 + (j * (t1 - t0)) / nv };
      if (!insideBox(p)) continue;
      if (distToRidge(p) < excl) continue;
      addInterior(p);
    }
  }

  return { boundary: input.boundary, interior: newInterior, constraints: newConstraints };
}

/**
 * Feature-aligned interior fill for a single feature cell. For the simple
 * single-through-chain case, augments the input with a ridge-aligned grid and runs
 * the SAME constrained CDT — a needle-free, ridge-aligned fill with the boundary
 * vertex set UNCHANGED. Returns `null` for any other constraint topology (caller
 * falls back to the plain CDT).
 */
export function triangulateFeatureAlignedCell(
  input: ConstrainedCellInput,
  sampler: Sampler3D,
  opts: FeatureAlignedOptions,
): ConstrainedCellResult | null {
  const chain = extractSimpleChain(input);
  if (chain === null) return null;
  const augmented = buildFeatureAlignedInput(input, chain, sampler, opts);
  if (augmented === null) return null;
  return triangulateConstrainedCell(augmented);
}
