/**
 * ConformingWall.ts — Conforming wall mesher with pinned uniform boundary rings.
 *
 * Generalizes the outer-wall mesher to ANY wall sampler (outer surfaceId 0 or
 * inner surfaceId 1) and pins the t=0 / t=1 boundary rows to a uniform `nRing`
 * = 2^pin U-samples (U = i/nRing). Because every wall is pinned to the SAME
 * `nRing`, adjacent surfaces share ring vertices BY INDEX in the watertight
 * assembly (Plan 3) — no weld, no repair.
 *
 * Pipeline: sampler → metric sizing field → periodic 2:1-balanced quadtree
 * (pinBoundaryLevel = log2(nRing)) → transition-template triangulation. The
 * result packs each vertex as `(u, t, surfaceId)` so the GPU can evaluate every
 * vertex by its own triple, and exposes the two ordered boundary rings (each
 * exactly `nRing` vertices, ordered by increasing U) for cap stitching.
 *
 * `buildConformingOuterWall` (Plan 1) is re-expressed as a thin wrapper.
 *
 * @module conforming/ConformingWall
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { MetricSizingField } from './MetricSizingField';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree } from './QuadtreeTriangulator';
import { triangulateQuadtreeWithFeatures } from './FeatureConformingTriangulator';
import type { FeatureLine, FeatureLinePoint } from './FeatureLineGraph';

/** Tuning for a conforming wall. */
export interface ConformingWallOptions {
  /** Maximum chord sagitta (mm). */
  maxSagMm: number;
  /** Upper clamp on target edge length (mm). */
  maxEdgeMm: number;
  /** Lower clamp on target edge length (mm). */
  minEdgeMm: number;
  /** Lipschitz grading ratio (≥ 1). */
  gradeRatio: number;
  /** Deepest quadtree level allowed. */
  maxLevel: number;
  /** Sizing-field grid resolution in u. */
  resU: number;
  /** Sizing-field grid resolution in t. */
  resT: number;
  /**
   * Uniform boundary-ring sample count. When set it MUST be a power of two; the
   * t=0 and t=1 rows are then pinned to exactly `nRing` cells (pinBoundaryLevel
   * = log2(nRing)). Omit to disable pinning (legacy unpinned behaviour).
   */
  nRing?: number;
  /** Surface id written into each vertex's third slot (0 = outer, 1 = inner). */
  surfaceId: number;
  /**
   * Optional uniform base-refinement level. When set, every quadtree cell is
   * refined to at least this level (a uniform 2^L × 2^L base grid) before
   * curvature adds more — guaranteeing a full-height column at each u=i/2^L.
   * Used to make sharp vertical creases pin-able to real mesh edges (the
   * downstream u-warp maps these columns onto the crease loci). Omit for the
   * pure adaptive mesh.
   */
  minUniformLevel?: number;
  /**
   * Optional triangle budget for THIS wall. When set, the curvature sizing
   * field's target edge lengths are uniformly scaled (and the fast quadtree
   * rebuilt) to bring the triangle count toward `targetTriangles`. The search
   * never coarsens below the sag-required mesh (`minEdgeMm`-clamped sagitta law),
   * so sag is always preserved. Omit to use the pure sag-driven mesh.
   */
  targetTriangles?: number;
  /**
   * Optional feature curves (closed loops / diagonals / braids) to insert as
   * real mesh edges via local constrained Delaunay (see
   * {@link triangulateQuadtreeWithFeatures}). Curves are clipped to t ∈
   * [tMargin, 1−tMargin] so they never touch the shared t=0/t=1 boundary rings
   * (which the caps reference by index) nor create rim slivers. Omit / empty for
   * the plain adaptive mesh.
   */
  featureLines?: FeatureLine[];
  /**
   * t-margin for feature clipping. Feature vertices are kept strictly inside
   * [tMargin, 1−tMargin]. Defaults to one boundary-cell height (1/nRing) so the
   * pinned boundary cell rows stay plain (no feature → no ring corruption / rim
   * sliver). Only used when `featureLines` is non-empty.
   */
  featureTMargin?: number;
  /**
   * Quadtree level to refine cells a feature curve crosses to, so the curve
   * crosses each cell simply and the local-CDT insertion stays sliver-free.
   * Capped by maxLevel / pin grading. Defaults to min(maxLevel, log2(nRing)+1).
   * Only used when `featureLines` is non-empty.
   */
  featureLevel?: number;
  /**
   * How `targetTriangles` is interpreted:
   *  - `'target'` (default): steer the count toward the budget in BOTH
   *    directions — refine a coarse sag mesh UP toward a larger budget, or
   *    coarsen an over-refined mesh DOWN toward a smaller one. A budget below the
   *    sag-required floor is floored (count not driven under sag).
   *  - `'cap'`: treat the budget as an UPPER LIMIT only. A mesh already at or
   *    below the budget is left at its sag floor (no wasteful refinement); a mesh
   *    above the budget is coarsened toward it. This is the production default —
   *    a SMOOTH pot keeps its (small) sag-tight count instead of being inflated.
   */
  budgetMode?: 'target' | 'cap';
  /**
   * Anisotropy bias B (≥0) for the quadtree: a level-L leaf spans Δu=1/2^(L+B),
   * Δt=1/2^L, so cells stay 3D-near-square under extreme circumference/height
   * anisotropy (GAP 1). 0 (default) is the isotropic quadtree. With B>0 the
   * boundary rings carry 2^(log2(nRing)+B) vertices (the caller derives the cap
   * ring count from `bottomRing.length`). The metric sizing field, pin grading,
   * and warps are unaffected (t-based / u-value-based).
   */
  uBias?: number;
}

/** Conforming wall mesh result with uniform shared boundary rings. */
export interface ConformingWallResult {
  /** Packed (u, t, surfaceId) per vertex — exact positions, no interpolation. */
  vertices: Float32Array;
  /** CCW triangle indices (seam shared). */
  indices: Uint32Array;
  /** Per-triangle seam-wrap flag (see QuadtreeTriangulator). */
  seamTriangles: Uint8Array;
  /** Number of (u,t) grid vertices (= vertices.length / 3). */
  gridVertexCount: number;
  /** Ordered bottom-ring (t=0) vertex indices, length nRing, U=i/nRing ascending. */
  bottomRing: number[];
  /** Ordered top-ring (t=1) vertex indices, length nRing, U=i/nRing ascending. */
  topRing: number[];
}

const RING_EPS = 1e-6;

/** True iff `n` is a positive power of two. */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

/** Lower bound on the budget-search scale (refine, never below this fraction). */
const MIN_BUDGET_SCALE = 1 / 64;
/**
 * Upper bound on the budget-search scale in `'cap'` mode. Coarsening multiplies
 * the per-node sagitta target; `minEdgeMm` clamps the lower end, but a runaway
 * scale could still relax sag in low-curvature regions, so cap it at a modest
 * factor — cap mode is meant to trim grade/maxEdge-induced over-refinement, not
 * to bulldoze genuine sag-required detail (that case floors at the budget-bound).
 */
const MAX_BUDGET_SCALE = 4;
/** Scale-search iterations (binary search on a monotone count(scale)). */
const BUDGET_SEARCH_STEPS = 5;
/** Budget acceptance band: stop early once within ±this of the target. */
const BUDGET_TOLERANCE = 0.1;
/**
 * Triangles per quadtree leaf. A balanced quad triangulates to ~2 triangles
 * (transition templates add a few near level boundaries), so the search counts
 * leaves — far cheaper than triangulating — against `targetTriangles/2`.
 */
const TRIS_PER_LEAF = 2;

/** Build only the sizing field + quadtree at a target scale (no triangulation). */
function buildQuadtreeAtScale(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
  pinBoundaryLevel: number,
  targetScale: number,
  featureRefine?: FeatureRefineSpec,
): PeriodicBalancedQuadtree {
  const field = new MetricSizingField(sampler, {
    maxSagMm: opts.maxSagMm,
    minEdgeMm: opts.minEdgeMm,
    maxEdgeMm: opts.maxEdgeMm,
    gradeRatio: opts.gradeRatio,
    resU: opts.resU,
    resT: opts.resT,
    targetScale,
  });
  return new PeriodicBalancedQuadtree(field, sampler, {
    maxLevel: opts.maxLevel,
    pinBoundaryLevel,
    minUniformLevel: opts.minUniformLevel,
    featureRefine,
    uBias: opts.uBias,
  });
}

/**
 * Choose a sizing-field target scale that brings the leaf (≈ triangle) count
 * toward `targetTriangles`. Leaf count is monotone DECREASING in `targetScale`
 * (larger target edge ⇒ coarser ⇒ fewer leaves), so a binary search on scale is
 * well-posed. Only the quadtree is rebuilt per step (tens of ms) — triangulation
 * runs once after.
 *
 * Scale=1 is the sag floor (coarsest sag-legal mesh). The search window depends
 * on `mode`:
 *  - `'target'`: window [MIN_BUDGET_SCALE, 1] — refine UP toward a larger budget
 *    (scale<1); a budget below the floor returns scale=1 (floored).
 *  - `'cap'`: window [1, MAX_BUDGET_SCALE] — never refines above the floor (no
 *    inflation); a floor already under budget returns scale=1, and a floor over
 *    budget is coarsened toward it (bounded by MAX_BUDGET_SCALE so genuine
 *    sag-required detail is floored, not bulldozed).
 */
function searchBudgetScale(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
  pinBoundaryLevel: number,
  targetTriangles: number,
  mode: 'target' | 'cap',
  featureRefine?: FeatureRefineSpec,
): number {
  const targetLeaves = targetTriangles / TRIS_PER_LEAF;
  const leavesAt = (scale: number): number =>
    buildQuadtreeAtScale(sampler, opts, pinBoundaryLevel, scale, featureRefine).leafCount();

  const floorLeaves = leavesAt(1);

  if (mode === 'cap') {
    // Cap: never inflate. Floor already within budget ⇒ keep it (the de-noised
    // sag mesh, e.g. a smooth pot, stays small). Over budget ⇒ coarsen toward it.
    if (floorLeaves <= targetLeaves) return 1;
    if (leavesAt(MAX_BUDGET_SCALE) >= targetLeaves) return MAX_BUDGET_SCALE; // can't reach; coarsest allowed
    let lo = 1; // more leaves (floor)
    let hi = MAX_BUDGET_SCALE; // fewer leaves (coarsest allowed)
    let best = 1;
    for (let i = 0; i < BUDGET_SEARCH_STEPS; i++) {
      const mid = Math.sqrt(lo * hi);
      const c = leavesAt(mid);
      best = mid;
      if (Math.abs(c - targetLeaves) / targetLeaves <= BUDGET_TOLERANCE) break;
      if (c > targetLeaves) lo = mid; // still too many ⇒ coarsen more ⇒ raise scale
      else hi = mid;
    }
    return best;
  }

  // 'target': scale=1 is the FEWEST leaves. Budget at/below the floor floors at
  // scale=1 (sag preserved); above the floor refines up toward it.
  if (targetLeaves <= floorLeaves) return 1;
  if (leavesAt(MIN_BUDGET_SCALE) <= targetLeaves) return MIN_BUDGET_SCALE; // maxLevel-capped; closest

  let lo = MIN_BUDGET_SCALE; // more leaves
  let hi = 1; // fewer leaves (floor)
  let best = 1;
  for (let i = 0; i < BUDGET_SEARCH_STEPS; i++) {
    const mid = Math.sqrt(lo * hi); // geometric midpoint (scale is multiplicative)
    const c = leavesAt(mid);
    best = mid;
    if (Math.abs(c - targetLeaves) / targetLeaves <= BUDGET_TOLERANCE) break;
    if (c > targetLeaves) lo = mid; // too many leaves ⇒ coarsen ⇒ raise scale
    else hi = mid;
  }
  return best;
}

/**
 * Clip one feature line to [lo, hi] on the chosen axis ('u' or 't'), preserving
 * polyline structure: each maximal in-range run becomes an output line, with an
 * interpolated boundary point where the line crosses lo / hi. Keeps features off
 * the shared boundary rings (t) and off the periodic seam column (u).
 */
function clipLineToInterval(
  line: FeatureLine, axis: 'u' | 't', lo: number, hi: number,
): FeatureLine[] {
  const pts = line.points;
  const val = (p: FeatureLinePoint): number => (axis === 'u' ? p.u : p.t);
  const inRange = (x: number): boolean => x >= lo && x <= hi;
  const crossAt = (a: FeatureLinePoint, b: FeatureLinePoint, edge: number): FeatureLinePoint => {
    const denom = val(b) - val(a);
    const f = Math.abs(denom) < 1e-300 ? 0 : (edge - val(a)) / denom;
    return { u: a.u + (b.u - a.u) * f, t: a.t + (b.t - a.t) * f };
  };
  const out: FeatureLine[] = [];
  let cur: FeatureLinePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (inRange(val(p))) {
      if (cur.length === 0 && i > 0 && !inRange(val(pts[i - 1]))) {
        cur.push(crossAt(pts[i - 1], p, val(pts[i - 1]) < lo ? lo : hi));
      }
      cur.push(p);
    } else if (cur.length > 0) {
      cur.push(crossAt(pts[i - 1], p, val(p) < lo ? lo : hi));
      if (cur.length >= 2) out.push({ ...line, points: cur });
      cur = [];
    }
  }
  if (cur.length >= 2) out.push({ ...line, points: cur });
  return out;
}

/**
 * Clip a feature set to the safe box [uMargin,1−uMargin]×[tMargin,1−tMargin].
 * The t-margin keeps features off the shared t=0/t=1 rings; the u-margin keeps
 * them off the periodic u-seam column (a feature vertex on u=0 would be a
 * T-junction against the wrapping u=1 cells, which the non-periodic crease
 * extraction does not mirror). Lines that vanish are dropped.
 */
function clipFeaturesToBox(features: FeatureLine[], uMargin: number, tMargin: number): FeatureLine[] {
  let work = features;
  if (uMargin > 0) {
    const next: FeatureLine[] = [];
    for (const line of work) for (const c of clipLineToInterval(line, 'u', uMargin, 1 - uMargin)) next.push(c);
    work = next;
  }
  const out: FeatureLine[] = [];
  for (const line of work) for (const c of clipLineToInterval(line, 't', tMargin, 1 - tMargin)) out.push(c);
  return out;
}

/** Feature-driven refinement spec passed to the quadtree. */
type FeatureRefineSpec = {
  level: number;
  intersects: (u0: number, t0: number, size: number) => boolean;
};

/** Does segment (au,at)→(bu,bt) meet the box [u0,u1]×[t0,t1]? (Liang–Barsky.) */
function segHitsBox(
  au: number, at: number, bu: number, bt: number,
  u0: number, u1: number, t0: number, t1: number,
): boolean {
  const du = bu - au;
  const dt = bt - at;
  let lo = 0;
  let hi = 1;
  const edges: Array<[number, number]> = [
    [-du, au - u0],
    [du, u1 - au],
    [-dt, at - t0],
    [dt, t1 - at],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-300) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > hi) return false;
      if (r > lo) lo = r;
    } else {
      if (r < lo) return false;
      if (r < hi) hi = r;
    }
  }
  return lo < hi;
}

/**
 * Build a fast cell→feature intersection predicate from clipped feature lines.
 * Segments are bucketed on a coarse uniform grid so each cell test only scans
 * nearby segments — keeping feature refinement near O(cells + segments).
 */
function buildFeatureIntersector(features: FeatureLine[]): FeatureRefineSpec['intersects'] {
  const BUCKET = 64;
  const buckets = new Map<number, Array<[number, number, number, number]>>();
  const key = (bu: number, bt: number): number => bt * BUCKET + bu;
  const clampB = (x: number): number => Math.max(0, Math.min(BUCKET - 1, Math.floor(x * BUCKET)));
  for (const line of features) {
    const p = line.points;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      const bu0 = clampB(Math.min(a.u, b.u));
      const bu1 = clampB(Math.max(a.u, b.u));
      const bt0 = clampB(Math.min(a.t, b.t));
      const bt1 = clampB(Math.max(a.t, b.t));
      const seg: [number, number, number, number] = [a.u, a.t, b.u, b.t];
      for (let bt = bt0; bt <= bt1; bt++) {
        for (let bu = bu0; bu <= bu1; bu++) {
          const k = key(bu, bt);
          let arr = buckets.get(k);
          if (!arr) { arr = []; buckets.set(k, arr); }
          arr.push(seg);
        }
      }
    }
  }
  return (u0: number, t0: number, size: number): boolean => {
    const u1 = u0 + size;
    const t1 = t0 + size;
    const bu0 = clampB(u0);
    const bu1 = clampB(u1 - 1e-12);
    const bt0 = clampB(t0);
    const bt1 = clampB(t1 - 1e-12);
    for (let bt = bt0; bt <= bt1; bt++) {
      for (let bu = bu0; bu <= bu1; bu++) {
        const arr = buckets.get(key(bu, bt));
        if (!arr) continue;
        for (const [au, at, bvu, bvt] of arr) {
          if (segHitsBox(au, at, bvu, bvt, u0, u1, t0, t1)) return true;
        }
      }
    }
    return false;
  };
}

/** The raw triangulated quadtree mesh at a given sizing-field target scale. */
function buildWallMeshAtScale(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
  pinBoundaryLevel: number,
  targetScale: number,
  clippedFeatures: FeatureLine[],
  featureRefine?: FeatureRefineSpec,
): { vertices: Float32Array; indices: Uint32Array; seamTriangles: Uint8Array } {
  const qt = buildQuadtreeAtScale(sampler, opts, pinBoundaryLevel, targetScale, featureRefine);
  if (clippedFeatures.length === 0) return triangulateQuadtree(qt);
  // Corner-snap threshold: a small fraction of the feature cell size, made
  // ABSOLUTE (not per-cell) so both sides of every shared edge snap identically.
  const featureLevel = featureRefine ? featureRefine.level : opts.maxLevel;
  const cornerSnap = 0.06 / (1 << featureLevel);
  return triangulateQuadtreeWithFeatures(qt, clippedFeatures, { cornerSnap });
}

/**
 * Build a conforming wall with uniform `nRing` t=0/t=1 boundary rings.
 *
 * The quadtree pins the boundary rows to level `log2(nRing)` so each ring is
 * exactly `nRing` vertices at U = i/nRing. Vertices are packed (u, t, surfaceId).
 *
 * When `targetTriangles` is set, a global scale on the sizing field's target
 * edge lengths is searched to steer the triangle count toward that budget,
 * bounded so it never coarsens below the sag-required mesh (see
 * {@link searchBudgetScale}).
 */
export function buildConformingWall(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
): ConformingWallResult {
  let pinBoundaryLevel = 0;
  if (opts.nRing !== undefined) {
    if (!isPowerOfTwo(opts.nRing)) {
      throw new Error(`buildConformingWall: nRing must be a power of two (got ${opts.nRing})`);
    }
    pinBoundaryLevel = Math.round(Math.log2(opts.nRing));
    if (pinBoundaryLevel > opts.maxLevel) {
      throw new Error(
        `buildConformingWall: log2(nRing)=${pinBoundaryLevel} exceeds maxLevel=${opts.maxLevel}`,
      );
    }
  }

  // Feature cell-refinement level (sliver-free insertion). Determined first so
  // the u-seam clip margin can be ≥ one feature cell wide.
  const defaultLevel = Math.min(opts.maxLevel, pinBoundaryLevel + 1);
  const featureLevel = Math.min(opts.maxLevel, opts.featureLevel ?? defaultLevel);

  // Clip feature curves to the safe box ONCE: off the shared t=0/t=1 rings AND
  // off the periodic u-seam (a feature vertex on u=0 would be a T-junction
  // against the wrapping u=1 cells). Then build the refinement spec.
  const tMargin = opts.featureTMargin ?? (opts.nRing && opts.nRing > 0 ? 1 / opts.nRing : 1 / 64);
  const uMargin = 1.5 / (1 << featureLevel); // ≥ one feature cell off the seam
  const clippedFeatures = clipFeaturesToBox(opts.featureLines ?? [], uMargin, tMargin);
  let featureRefine: FeatureRefineSpec | undefined;
  if (clippedFeatures.length > 0) {
    featureRefine = {
      level: featureLevel,
      intersects: buildFeatureIntersector(clippedFeatures),
    };
  }

  const targetScale =
    opts.targetTriangles !== undefined && opts.targetTriangles > 0
      ? searchBudgetScale(
          sampler,
          opts,
          pinBoundaryLevel,
          opts.targetTriangles,
          opts.budgetMode ?? 'target',
          featureRefine,
        )
      : 1;

  const mesh = buildWallMeshAtScale(
    sampler, opts, pinBoundaryLevel, targetScale, clippedFeatures, featureRefine,
  );

  // Stamp the surfaceId into each vertex's third slot (the triangulator packs 0
  // there). The GPU evaluates each vertex by its own (u, t, surfaceId) triple.
  const n = mesh.vertices.length / 3;
  if (opts.surfaceId !== 0) {
    for (let i = 0; i < n; i++) mesh.vertices[i * 3 + 2] = opts.surfaceId;
  }

  // Ordered boundary rings at t=0 and t=1 (by increasing u). The seam is already
  // index-shared, so each ring is a single closed loop of exactly nRing verts.
  const bottom: number[] = [];
  const top: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = mesh.vertices[i * 3 + 1];
    if (t < RING_EPS) bottom.push(i);
    else if (t > 1 - RING_EPS) top.push(i);
  }
  const byU = (a: number, b: number): number =>
    mesh.vertices[a * 3] - mesh.vertices[b * 3];
  bottom.sort(byU);
  top.sort(byU);

  return {
    vertices: mesh.vertices,
    indices: mesh.indices,
    seamTriangles: mesh.seamTriangles,
    gridVertexCount: n,
    bottomRing: bottom,
    topRing: top,
  };
}
