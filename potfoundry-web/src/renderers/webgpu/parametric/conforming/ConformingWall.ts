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
): number {
  const targetLeaves = targetTriangles / TRIS_PER_LEAF;
  const leavesAt = (scale: number): number =>
    buildQuadtreeAtScale(sampler, opts, pinBoundaryLevel, scale).leafCount();

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

/** The raw triangulated quadtree mesh at a given sizing-field target scale. */
function buildWallMeshAtScale(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
  pinBoundaryLevel: number,
  targetScale: number,
): { vertices: Float32Array; indices: Uint32Array; seamTriangles: Uint8Array } {
  return triangulateQuadtree(
    buildQuadtreeAtScale(sampler, opts, pinBoundaryLevel, targetScale),
  );
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

  const targetScale =
    opts.targetTriangles !== undefined && opts.targetTriangles > 0
      ? searchBudgetScale(
          sampler,
          opts,
          pinBoundaryLevel,
          opts.targetTriangles,
          opts.budgetMode ?? 'target',
        )
      : 1;

  const mesh = buildWallMeshAtScale(sampler, opts, pinBoundaryLevel, targetScale);

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
