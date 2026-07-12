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
import {
  MetricSizingField,
  MetricSizingWorkspace,
  type SizingOptions,
} from './MetricSizingField';
import {
  PeriodicBalancedQuadtree,
  QuadtreeRefinementEvidenceCache,
  QuadtreeRefinementHierarchy,
} from './PeriodicBalancedQuadtree';
import { triangulateQuadtree, type QuadtreeMesh, type TriangulationStageTiming } from './QuadtreeTriangulator';
import { triangulateQuadtreeWithFeatures, type BandRegion } from './FeatureConformingTriangulator';
import type { FeatureLine, FeatureLinePoint } from './FeatureLineGraph';
import type { CdtStats } from './ConstrainedCellTriangulator';
import {
  selectCandidateFacets,
  scoreCandidateFacets,
  buildLevelAtFromTargets,
  type VerdictLiftSampler,
  type VerdictScorableMesh,
} from './verdictRefine';

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
   * Optional ANALYTIC curvature floor κ(u,t) (mm⁻¹), threaded verbatim to
   * {@link SizingOptions.curvatureFloor}: a style that knows its ridge curvature
   * closed-form (see conforming/AnalyticCurvatureFloor) corrects the band-limited
   * sampler's sub-cell under-read (E-2026-07-09-ANALYTIC-FLOOR). Also seen by the
   * budget-scale search, so 'cap' coarsening prices the floored field coherently.
   * Omit ⇒ byte-identical sizing.
   */
  curvatureFloor?: (u: number, t: number) => number;
  /** Optional κ cap paired with the floor (see {@link SizingOptions.maxKappa}). */
  maxKappa?: number;
  /**
   * Metric samples per axis for the quadtree refinement size test (threads to
   * {@link PeriodicBalancedQuadtree}'s `cellSamples`). 1/absent = centre-only,
   * byte-identical legacy; k>1 lets shouldRefine SEE a steep crease that crosses
   * a cell OFF-centre. Accepted by AssemblyWallOptions since 92fca543 but never
   * threaded through this interface — completed by E-2026-07-10-CAD-LEVER-
   * COMPLETION Stage A with the default unchanged.
   */
  cellSamples?: number;
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
   * OPT-IN per-cell feature-level ESCALATION (E-2026-07-12 P2.5; design
   * P2.1-design §1). Returns the target quadtree level for a feature-crossed cell
   * at lower-corner `(u0,t0)` with the given `size` (>= `featureLevel` ⇒ deeper
   * local refinement; <= `featureLevel` ⇒ no change). Evaluated ONLY on cells
   * that already pass the cheap feature `intersects` gate, so the cost is scoped
   * to the (small) feature-crossed subset. Used to escalate the Newton-flagged
   * residual knee cells directly (VERDICT-driven refinement) — the localized
   * cure for the Gyroid band-edge knee that a global `featureLevel` bump could
   * not deliver without a relief-chord-cliff blow-up. Threaded to
   * {@link FeatureRefineSpec.levelAt} ONLY when `featureLines`/`railLines` are
   * non-empty (mirrors how `featureLevel` itself is gated). Omit ⇒ byte-identical
   * default mesh (the load-bearing flag-OFF guarantee).
   */
  featureLevelAt?: (u0: number, t0: number, size: number) => number;
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
  /** Test-only oracle: rebuild raw recursive refinement for every budget probe. */
  legacyBudgetSearch?: boolean;
  /**
   * Anisotropy bias B (≥0) for the quadtree: a level-L leaf spans Δu=1/2^(L+B),
   * Δt=1/2^L, so cells stay 3D-near-square under extreme circumference/height
   * anisotropy (GAP 1). 0 (default) is the isotropic quadtree. With B>0 the
   * boundary rings carry 2^(log2(nRing)+B) vertices (the caller derives the cap
   * ring count from `bottomRing.length`). The metric sizing field, pin grading,
   * and warps are unaffected (t-based / u-value-based).
   */
  uBias?: number;
  /**
   * Enable the LOCAL directional u-refinement pass (per-leaf `uExtra`, GAP 1) on
   * the FINAL build, to drive residual short-WIDE slivers (cells whose local
   * √E/√G/2^B still exceeds the bound) to 3D-near-square. GATED on the same
   * wide/flat criterion as the global bias, so it is a no-op at default dims, and
   * IGNORED when feature lines are present (directional refine is disabled on
   * feature walls). The boundary rows never directionally split → the shared
   * `nRing` is unchanged. Default false.
   */
  directionalRefine?: boolean;
  /**
   * Warp-pinned CREASE loci (vertical/horizontal/helical) — used ONLY to drive
   * uBias-invariant t-refinement of the crease columns/rows, NOT inserted as CDT
   * edges (the creases are realised by the downstream warps, which pin a full-
   * height column / full-width row onto each locus). With an anisotropy bias B>0
   * the u-driven square refinement near a sharp crease stops B levels shallower,
   * halving the crease column's t-rows per bias level and dropping feature
   * coverage; refining crease-crossed cells with the BIAS-FREE u-width restores
   * exactly those rows, on the crease cells only (the rest of the wall keeps the
   * bias quality win). No-op at B=0 (bias-free width == biased width) and when
   * empty. These lines are NOT clipped/inserted — only their cell footprint
   * matters — so passing full-height/width loci is safe and cheap.
   */
  creaseLines?: FeatureLine[];
  /**
   * Optional WARP-COMPOSED surface map for per-leaf `efg` tagging (Stage-1
   * Task 2 — see {@link PeriodicBalancedQuadtree}'s `efgSampler` opt). Tagged
   * leaves arm the shaped triangulation templates (shorter-3D-diagonal /
   * max-min-angle transition polygons) with the metric the emitted triangles
   * ACTUALLY carry after the post-assembly domain warps. SIZING and refinement
   * stay on the plain `sampler` argument. The budget-scale search only reads
   * `leafCount()` — `leaves()` (where efg is computed) never runs during the
   * search, so this adds no cost to the repeated search rebuilds. Omit for the
   * legacy untagged tree (byte-identical templates).
   */
  efgSampler?: SurfaceSampler;
  /**
   * Opt-in offset-band footprints (general-mesher integration spike, Task 2).
   * Threaded verbatim to {@link triangulateQuadtreeWithFeatures}'s emit-gate:
   * a leaf fully inside a band is skipped at emission so the band's own paving
   * fills it. Only effective when `featureLines` are present (the plain wall
   * takes the no-feature fast path). Omit ⇒ byte-identical default mesh.
   */
  bandRegions?: BandRegion[];
  /**
   * Opt-in offset-band RAIL feature lines (general-mesher integration spike,
   * Task 4 — the complement half of the densify-and-share contract). Threaded
   * verbatim to {@link triangulateQuadtreeWithFeatures}'s `railLines` force-
   * register: every snapped rail vertex is admitted into the grid-line registry
   * regardless of the on-edge check, so both adjacent cells adopt it identically
   * and the band's paving welds to the complement by the same global id. The
   * feature path runs when EITHER `featureLines` OR `railLines` is non-empty.
   * Omit / empty ⇒ byte-identical default mesh (the load-bearing flag-OFF rule).
   */
  railLines?: FeatureLine[];
  /**
   * OPT-IN remedy for the 2-locus deterministic non-manifold defect at
   * near-tangent doubled general-curve passes (E-2026-07-11-TIERC-HEADTOHEAD
   * Arm A2; `'snapMerge'` is Arm A4b). Threaded verbatim to {@link
   * triangulateQuadtreeWithFeatures}'s same-named option — see that option's
   * doc for the mechanism. Default `'off'` (or omitted) ⇒ byte-identical
   * default mesh (the load-bearing flag-OFF guarantee). Only effective when
   * `featureLines` are present.
   */
  multiCurveCellPolicy?: 'off' | 'forceRefine' | 'fanRepair' | 'snapMerge';
  /**
   * VERDICT-loop ONLY (E-2026-07-12 T6 root-cause fix): the EXACT closed-form
   * outer radius r(θ,z) (mm) the two-pass verdict scores its chord/max-sag
   * against, INSTEAD of the warp-composed `efgSampler`/`sampler`. The production
   * `efgSampler` is a 256² bilinear grid (`tierc_regionLayer.ts`) that SMOOTHS
   * the band-edge cliff — the Gyroid knee's true ~0.025mm sag reads <0.01 through
   * the grid, so it is never flagged and never escalated. Only the closed-form
   * radius exposes the cliff (the same principle that closed Gothic/GeoStar). The
   * (u,t)→(θ,z) lift matches the export/P2.5c analytic surface EXACTLY: θ = u·2π,
   * z = t·{@link analyticH}, r = analyticRA(θ,z). Consumed ONLY inside the
   * flag-on branch (`__pfConformingVerdictRefine`); omit ⇒ the loop keeps the
   * `efgSampler ?? sampler` lift (unchanged) — but the knee only truly closes when
   * this is supplied. Never read on the flag-off / production path.
   */
  analyticRA?: (theta: number, z: number) => number;
  /**
   * Pot height H (mm) paired with {@link analyticRA}: the analytic lift maps a
   * mesh vertex's t to surface height z = t·H. Only read when `analyticRA` is set
   * (verdict loop, flag-on). Should always accompany `analyticRA`.
   */
  analyticH?: number;
}

/**
 * Telemetry from the budget-scale search (budget-honesty channel). Makes the
 * cap's three failure modes (MAX_BUDGET_SCALE saturation; scale-independent
 * floors — minUniformLevel crease lattice, featureLevel refinement,
 * creaseRefine, pinBoundaryLevel + balancing; leaves→tris slack) OBSERVABLE
 * instead of inferred, and supplies the chosenScale the export's honesty
 * report needs (effectiveMaxSagMm = chosenScale × profile sag). Metadata only
 * — the search behaviour and the emitted mesh are byte-identical.
 */
export interface WallBudgetTelemetry {
  /** Leaves at scale=1 — the sag floor INCLUDING the scale-independent floors. */
  floorLeaves: number;
  /** Scale actually chosen ([1, MAX_BUDGET_SCALE] in 'cap' mode; <=1 in 'target'). */
  chosenScale: number;
  /** Leaf count at the chosen scale. */
  leavesAtChosen: number;
  /** 'cap' mode only: leavesAt(MAX_BUDGET_SCALE) >= targetLeaves — coarsening is
   *  SATURATED; the residual gap is the decimate-or-refuse decision's input. */
  capSaturated: boolean;
}

/**
 * DEV-ONLY per-wall stage timing (E-2026-07-09-EXPORT-STAGE-TIMING follow-up).
 * Sub-breakdown of ONE wall's build: the budget-scale binary search (up to
 * `BUDGET_SEARCH_STEPS` quadtree-only rebuilds, no triangulation), the FINAL
 * kept quadtree rebuild at the chosen scale, and the triangulation pass
 * (`usedCdt`=true ⇒ the constrained-CDT feature path {@link triangulateQuadtreeWithFeatures}
 * ran; false ⇒ the plain fast {@link triangulateQuadtree}). Present on
 * {@link ConformingWallResult} only when dev-stage-timing is enabled; measurement
 * only — never influences what is computed.
 */
export interface WallStageTiming {
  searchMs: number;
  finalQuadtreeMs: number;
  triangulationMs: number;
  usedCdt: boolean;
  /** True when the final mesh triangulates the terminal budget-search tree. */
  reusedSearchQuadtree: boolean;
  /**
   * DEV-ONLY sub-breakdown of `triangulationMs` itself (E-2026-07-10 follow-up):
   * prep / grid-line registry / the main per-leaf emission loop (CDT calls live
   * here when `usedCdt`) / tolerance weld (feature path only) / seam close. Read
   * straight off the triangulator's own returned `QuadtreeMesh.stageTiming` — see
   * {@link TriangulationStageTiming}. Undefined when not captured.
   */
  triangulationDetail?: TriangulationStageTiming;
}

/**
 * Dev-build detector for the wall-level stage-timing instrument. Mirrors
 * `isDevStageTimingEnabled` (ParametricExportComputer.ts) — duplicated rather
 * than imported to avoid a circular import (ParametricExportComputer.ts →
 * WatertightAssembly.ts → this module). `import.meta.env` can be undefined in
 * some bundling/test contexts, so the read is guarded; any failure means "not
 * a dev build", never a thrown error out of buildConformingWall().
 */
function isDevWallStageTimingEnabled(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/**
 * Dev/opt-in detector for the two-pass VERDICT-driven refinement loop
 * (E-2026-07-12 Gyroid-knee ship, T4 — the integration keystone). Default OFF:
 * when this returns false `buildConformingWall` is byte-identical to
 * `buildConformingWallOnce` (today's production body), so the entire two-pass
 * path is dead code in production until the flag is flipped. A `globalThis`
 * read (not a new opt) because `WatertightAssembly` passes only named fields to
 * `buildConformingWall` — there is no `...opts` spread to carry a new flag
 * through (plan §T4 "Why the flag is a globalThis read").
 */
function isConformingVerdictRefineEnabled(): boolean {
  return (
    (globalThis as unknown as { __pfConformingVerdictRefine?: boolean })
      .__pfConformingVerdictRefine === true
  );
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
  /**
   * Constrained-CDT masking-channel counters (Stage-0 instrument). Present only
   * on the FEATURE path (plain `triangulateQuadtree` output has none).
   */
  cdtStats?: CdtStats;
  /**
   * Per-triangle emission provenance (Stage-0 instrument): TRI_SOURCE values,
   * parallel to `indices`/3. Copied straight from the triangulator's mesh.
   * Metadata only — the triangle content/order is untouched.
   */
  triangleSource?: Uint8Array;
  /**
   * Present when a triangle budget drove a sizing-scale search
   * ({@link searchBudgetScale}). Metadata only — the mesh is unchanged.
   */
  budget?: WallBudgetTelemetry;
  /** DEV-ONLY search/final-build/triangulation sub-timing. See {@link WallStageTiming}. */
  stageTiming?: WallStageTiming;
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

/** Exact sizing options shared by legacy one-shot fields and search workspaces. */
function sizingOptionsAtScale(
  opts: ConformingWallOptions,
  targetScale: number,
): SizingOptions {
  return {
    maxSagMm: opts.maxSagMm,
    minEdgeMm: opts.minEdgeMm,
    maxEdgeMm: opts.maxEdgeMm,
    gradeRatio: opts.gradeRatio,
    resU: opts.resU,
    resT: opts.resT,
    targetScale,
    curvatureFloor: opts.curvatureFloor,
    maxKappa: opts.maxKappa,
  };
}

/**
 * Build only the sizing field + quadtree at a target scale (no triangulation).
 *
 * `directionalRefine` is passed THROUGH to the quadtree only on the FINAL build —
 * the budget search passes it FALSE so the leaf count stays monotone in
 * `targetScale` (the directional pass adds a scale-independent, relief-driven
 * number of cells that would otherwise break the binary search's monotonicity).
 */
function buildQuadtreeAtScale(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
  pinBoundaryLevel: number,
  targetScale: number,
  featureRefine?: FeatureRefineSpec,
  directionalRefine = false,
  creaseRefine?: { intersects: FeatureRefineSpec['intersects'] },
  sizingWorkspace?: MetricSizingWorkspace,
  refinementEvidenceCache?: QuadtreeRefinementEvidenceCache,
  captureRefinementHierarchy?: QuadtreeRefinementHierarchy,
  refinementHierarchy?: QuadtreeRefinementHierarchy,
): PeriodicBalancedQuadtree {
  const field = sizingWorkspace
    ? sizingWorkspace.fieldAtScale(targetScale)
    : new MetricSizingField(sampler, sizingOptionsAtScale(opts, targetScale));
  return new PeriodicBalancedQuadtree(field, sampler, {
    maxLevel: opts.maxLevel,
    pinBoundaryLevel,
    minUniformLevel: opts.minUniformLevel,
    featureRefine,
    creaseRefine,
    uBias: opts.uBias,
    directionalRefine,
    // Crease-seeing refiner (92fca543's declared-but-unthreaded lever; Stage A of
    // E-2026-07-10-CAD-LEVER-COMPLETION). Absent ⇒ 1 ⇒ byte-identical centre-only.
    cellSamples: opts.cellSamples,
    // Per-leaf efg tagging (shaped templates). Lazy: the quadtree only computes
    // efg inside `leaves()`, and the budget search above calls `leafCount()`
    // alone — so threading it here costs the search nothing.
    efgSampler: opts.efgSampler,
    refinementEvidenceCache,
    captureRefinementHierarchy,
    refinementHierarchy,
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
interface BudgetSearchProbe {
  scale: number;
  leaves: number;
  quadtree: PeriodicBalancedQuadtree;
}

interface BudgetSearchResult {
  scale: number;
  telemetry: WallBudgetTelemetry;
  /** The terminal probe built with directional refinement disabled. */
  quadtree: PeriodicBalancedQuadtree;
}

function searchBudgetScale(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
  pinBoundaryLevel: number,
  targetTriangles: number,
  mode: 'target' | 'cap',
  featureRefine?: FeatureRefineSpec,
  creaseRefine?: { intersects: FeatureRefineSpec['intersects'] },
): BudgetSearchResult {
  const targetLeaves = targetTriangles / TRIS_PER_LEAF;
  // Curvature/floor/cap sampling is invariant across target scales. Cache those
  // raw sagitta targets once; each probe still replays scale/clamp/grading and
  // reconstructs/balances its quadtree exactly as before.
  const sizingWorkspace = new MetricSizingWorkspace(
    sampler,
    sizingOptionsAtScale(opts, 1),
  );
  const refinementEvidenceCache = new QuadtreeRefinementEvidenceCache();
  const persistentSearch = opts.legacyBudgetSearch !== true;
  const hierarchy = persistentSearch ? new QuadtreeRefinementHierarchy() : undefined;
  const envelopeScale = mode === 'target' ? MIN_BUDGET_SCALE : 1;
  const envelope = hierarchy
    ? {
        scale: envelopeScale,
        quadtree: buildQuadtreeAtScale(
          sampler, opts, pinBoundaryLevel, envelopeScale, featureRefine, false, creaseRefine,
          sizingWorkspace, refinementEvidenceCache, hierarchy,
        ),
      }
    : undefined;
  const probeAt = (scale: number): BudgetSearchProbe => {
    if (envelope && scale === envelope.scale) {
      return { scale, leaves: envelope.quadtree.leafCount(), quadtree: envelope.quadtree };
    }
    const quadtree = buildQuadtreeAtScale(
      sampler, opts, pinBoundaryLevel, scale, featureRefine, false, creaseRefine,
      sizingWorkspace, refinementEvidenceCache, undefined, hierarchy,
    );
    return { scale, leaves: quadtree.leafCount(), quadtree };
  };

  const floor = probeAt(1);
  const floorLeaves = floor.leaves;

  if (mode === 'cap') {
    // Cap: never inflate. Floor already within budget ⇒ keep it (the de-noised
    // sag mesh, e.g. a smooth pot, stays small). Over budget ⇒ coarsen toward it.
    if (floorLeaves <= targetLeaves) {
      return {
        scale: 1,
        telemetry: { floorLeaves, chosenScale: 1, leavesAtChosen: floorLeaves, capSaturated: false },
        quadtree: floor.quadtree,
      };
    }
    const coarsest = probeAt(MAX_BUDGET_SCALE);
    if (coarsest.leaves >= targetLeaves) {
      // Can't reach the budget; coarsest allowed — coarsening is SATURATED.
      return {
        scale: MAX_BUDGET_SCALE,
        telemetry: { floorLeaves, chosenScale: MAX_BUDGET_SCALE, leavesAtChosen: coarsest.leaves, capSaturated: true },
        quadtree: coarsest.quadtree,
      };
    }
    let lo = 1; // more leaves (floor)
    let hi = MAX_BUDGET_SCALE; // fewer leaves (coarsest allowed)
    let best = floor;
    let lastCount = floorLeaves;
    for (let i = 0; i < BUDGET_SEARCH_STEPS; i++) {
      const mid = Math.sqrt(lo * hi);
      const probe = probeAt(mid);
      const c = probe.leaves;
      best = probe;
      lastCount = c;
      if (Math.abs(c - targetLeaves) / targetLeaves <= BUDGET_TOLERANCE) break;
      if (c > targetLeaves) lo = mid; // still too many ⇒ coarsen more ⇒ raise scale
      else hi = mid;
    }
    return {
      scale: best.scale,
      telemetry: { floorLeaves, chosenScale: best.scale, leavesAtChosen: lastCount, capSaturated: false },
      quadtree: best.quadtree,
    };
  }

  // 'target': scale=1 is the FEWEST leaves. Budget at/below the floor floors at
  // scale=1 (sag preserved); above the floor refines up toward it.
  if (targetLeaves <= floorLeaves) {
    return {
      scale: 1,
      telemetry: { floorLeaves, chosenScale: 1, leavesAtChosen: floorLeaves, capSaturated: false },
      quadtree: floor.quadtree,
    };
  }
  const finest = probeAt(MIN_BUDGET_SCALE);
  if (finest.leaves <= targetLeaves) {
    // maxLevel-capped; closest
    return {
      scale: MIN_BUDGET_SCALE,
      telemetry: { floorLeaves, chosenScale: MIN_BUDGET_SCALE, leavesAtChosen: finest.leaves, capSaturated: false },
      quadtree: finest.quadtree,
    };
  }

  let lo = MIN_BUDGET_SCALE; // more leaves
  let hi = 1; // fewer leaves (floor)
  let best = floor;
  let lastCount = floorLeaves;
  for (let i = 0; i < BUDGET_SEARCH_STEPS; i++) {
    const mid = Math.sqrt(lo * hi); // geometric midpoint (scale is multiplicative)
    const probe = probeAt(mid);
    const c = probe.leaves;
    best = probe;
    lastCount = c;
    if (Math.abs(c - targetLeaves) / targetLeaves <= BUDGET_TOLERANCE) break;
    if (c > targetLeaves) lo = mid; // too many leaves ⇒ coarsen ⇒ raise scale
    else hi = mid;
  }
  return {
    scale: best.scale,
    telemetry: { floorLeaves, chosenScale: best.scale, leavesAtChosen: lastCount, capSaturated: false },
    quadtree: best.quadtree,
  };
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
// Exported for the fidelity snap audit (src/fidelity/snapPlacementAudit.ts) — behavior unchanged.
export function clipFeaturesToBox(features: FeatureLine[], uMargin: number, tMargin: number): FeatureLine[] {
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
  /**
   * OPTIONAL per-cell target level (>= `level`), evaluated ONLY on cells that
   * already pass the cheap `intersects` gate (cost-gated). Returns the ESCALATED
   * floor for THIS cell; absent, or a value <= `level`, leaves the cell at the
   * uniform `level` floor. Absent ⇒ byte-identical to the pre-P2.5 behaviour.
   * The escalation is a DISCRETE level integer with no continuous-sizing round
   * trip and no grading pass — the quadtree already makes its own discrete
   * decisions at exactly this point, and the existing 2:1 `balance()` propagates
   * the resulting T-junctions for free (E-2026-07-12 P2.5; design P2.1-design §1).
   */
  levelAt?: (u0: number, t0: number, size: number) => number;
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
  creaseRefine?: { intersects: FeatureRefineSpec['intersects'] },
  railLines?: FeatureLine[],
  stageTiming?: WallStageTiming,
  prebuiltQuadtree?: PeriodicBalancedQuadtree,
): QuadtreeMesh {
  // The feature triangulator runs when EITHER inserted features OR force-register
  // rail lines are present (Task 4). With neither, the plain fast-out is taken
  // (byte-identical to the pre-spike mesh). `railLines` are NOT clipped — they are
  // pre-snapped to the QSCALE grid by the caller and must reach the registry intact.
  const hasRails = (railLines?.length ?? 0) > 0;
  const featurePath = clippedFeatures.length > 0 || hasRails;
  // FINAL build: enable the directional refine pass (if requested) — but NEVER on
  // a feature wall (clipped features or rail lines present). The pass is gated/no-op
  // at default dims; on a wide/flat smooth wall it removes residual short-WIDE slivers.
  const directionalRefine = (opts.directionalRefine ?? false) && !featurePath;
  const qtStart = stageTiming ? performance.now() : 0;
  const qt = prebuiltQuadtree ?? buildQuadtreeAtScale(
    sampler, opts, pinBoundaryLevel, targetScale, featureRefine, directionalRefine, creaseRefine,
  );
  if (stageTiming) {
    stageTiming.finalQuadtreeMs = performance.now() - qtStart;
    stageTiming.reusedSearchQuadtree = prebuiltQuadtree !== undefined;
  }
  if (!featurePath) {
    const triStart = stageTiming ? performance.now() : 0;
    const fast = triangulateQuadtree(qt);
    if (stageTiming) {
      stageTiming.triangulationMs = performance.now() - triStart;
      stageTiming.usedCdt = false;
      stageTiming.triangulationDetail = fast.stageTiming;
    }
    return fast;
  }
  // Corner-snap threshold: a small fraction of the feature cell size, made
  // ABSOLUTE (not per-cell) so both sides of every shared edge snap identically.
  const featureLevel = featureRefine ? featureRefine.level : opts.maxLevel;
  const cornerSnap = 0.06 / (1 << featureLevel);
  // Tier-2 interior quality refinement is OPT-IN and DEFAULT-OFF. MEASURED HARMFUL
  // on the real (bilinear/curved) surface: refineCellInterior places its off-center
  // in the triangle's FLAT 3D plane then barycentric-maps to (u,t) — exact only for
  // an AFFINE map — so on a steep crest cell the back-mapped point lands wrong and
  // MANUFACTURES slivers (SFB@1 sliver 0→143, Hive 0→199, CelticKnot 0→99; %<15°
  // rises). It is also the wrong TOOL: the residual slivers are uBias-ANISOTROPIC
  // (u-stretched), and isotropic Steiner insertion cannot square them. Kept behind
  // `window.__pfConformingRefine=true` (dev-only) so the wiring + the affine-correct
  // kernel survive for a future curvature-aware / anisotropic variant. Default path
  // passes NO sampler ⇒ byte-identical to before this change.
  const refineEnabled =
    (globalThis as unknown as { __pfConformingRefine?: boolean }).__pfConformingRefine === true;
  const triStart = stageTiming ? performance.now() : 0;
  const withFeatures = triangulateQuadtreeWithFeatures(qt, clippedFeatures, {
    cornerSnap,
    sampler: refineEnabled ? (u, t) => sampler.position(u, t) : undefined,
    bandRegions: opts.bandRegions,
    railLines,
    multiCurveCellPolicy: opts.multiCurveCellPolicy,
  });
  if (stageTiming) {
    stageTiming.triangulationMs = performance.now() - triStart;
    stageTiming.usedCdt = true;
    stageTiming.triangulationDetail = withFeatures.stageTiming;
  }
  return withFeatures;
}

/**
 * INTERNAL knobs for the single-pass build, used ONLY by the two-pass verdict
 * loop in {@link buildConformingWall} (never on the public
 * {@link ConformingWallOptions}; production callers never pass this). Keeps the
 * flag-off path byte-identical: with `internal` absent, `buildConformingWallOnce`
 * runs exactly today's production body.
 */
interface BuildOnceInternal {
  /**
   * Reuse this already-resolved budget scale INSTEAD of calling
   * {@link searchBudgetScale}. The escalation rebuilds pass pass-0's chosen
   * scale so (a) the budget re-search is skipped (cost — `searchBudgetScale` is
   * CRITICAL and is NOT edited; this is a guarded early-return around the CALL)
   * and (b) `budgetMode:'cap'` cannot re-coarsen the freshly escalated cells
   * (plan §T4 risk #5). Absent ⇒ the production search path (byte-identical).
   */
  fixedScale?: number;
  /**
   * Called once with the resolved scale + the `FeatureRefineSpec` this build
   * used, so the verdict loop can drive the scorer/selector with the SAME
   * `intersects` predicate and fix the scale on escalation rebuilds.
   */
  captureBuildInfo?: (info: {
    resolvedScale: number;
    featureRefine?: FeatureRefineSpec;
    featureLevel: number;
  }) => void;
}

/**
 * Single-pass conforming wall build — TODAY's `buildConformingWall` body,
 * behaviourally unchanged. `buildConformingWall` is now a thin wrapper that, when
 * the (default-OFF) verdict-refine flag is on, calls this repeatedly in a
 * two-pass loop; when the flag is off it forwards straight to this function, so
 * the production path is byte-identical.
 *
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
export function buildConformingWallOnce(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
  internal?: BuildOnceInternal,
): ConformingWallResult {
  let pinBoundaryLevel = 0;
  if (opts.nRing !== undefined) {
    if (!isPowerOfTwo(opts.nRing)) {
      throw new Error(`buildConformingWall: nRing must be a power of two (got ${opts.nRing})`);
    }
    // The boundary ring carries 2^(pinBoundaryLevel + uBias) U-columns (the cells
    // at the pinned t-rows are 1/2^(level+uBias) wide). To keep the SHARED ring at
    // exactly `nRing` regardless of the anisotropy bias — so caps stay nRing-wide
    // instead of inflating to nRing·2^B — pin the t-rows `uBias` levels COARSER:
    // pinBoundaryLevel = log2(nRing) − uBias ⇒ 2^(pinBoundaryLevel+uBias) = nRing.
    // (uBias=0 ⇒ unchanged.) Floored at 1 so the boundary stays uniformly pinned.
    const basePin = Math.round(Math.log2(opts.nRing));
    pinBoundaryLevel = Math.max(1, basePin - Math.max(0, opts.uBias ?? 0));
    if (pinBoundaryLevel > opts.maxLevel) {
      throw new Error(
        `buildConformingWall: pinBoundaryLevel=${pinBoundaryLevel} exceeds maxLevel=${opts.maxLevel}`,
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
  // Rail lines (Task 4) are pre-snapped to the QSCALE grid by the caller and are
  // NOT clipped — they must reach the force-register with their exact dyadic
  // vertices. They DO drive the same feature-cell refinement (the cells they cross
  // refine to featureLevel so the CDT insertion stays sliver-free).
  const railLines = opts.railLines ?? [];
  const refineLines = [...clippedFeatures, ...railLines];
  let featureRefine: FeatureRefineSpec | undefined;
  if (refineLines.length > 0) {
    featureRefine = {
      level: featureLevel,
      intersects: buildFeatureIntersector(refineLines),
      // Per-cell escalation (P2.5). Absent ⇒ `levelAt` undefined ⇒ the quadtree's
      // legacy uniform `level` floor (byte-identical). Only wired here (feature
      // walls) — features are outer-only, matching `featureLevel`'s own gating.
      levelAt: opts.featureLevelAt,
    };
  }

  // Crease t-refinement spec (REFINE-ONLY, no CDT): the warp-pinned crease loci
  // drive bias-free-u refinement of their columns/rows so a B>0 anisotropy bias
  // does not strip the crease t-rows feature coverage needs. Only the cell
  // footprint matters (the warps realise the creases), so the lines are used
  // as-is — NOT clipped or inserted. A pure no-op when B=0 or no crease lines.
  let creaseRefine: { intersects: FeatureRefineSpec['intersects'] } | undefined;
  if ((opts.creaseLines?.length ?? 0) > 0 && (opts.uBias ?? 0) > 0) {
    creaseRefine = { intersects: buildFeatureIntersector(opts.creaseLines as FeatureLine[]) };
  }

  // DEV-ONLY per-wall stage timing (E-2026-07-09-EXPORT-STAGE-TIMING follow-up:
  // sub-instrument assembleWatertight into search/final-build/triangulation).
  // Measurement only — never changes what is computed; undefined ⇒ every timed
  // branch below is skipped entirely (zero production cost).
  const stageTiming: WallStageTiming | undefined = isDevWallStageTimingEnabled()
    ? {
        searchMs: 0,
        finalQuadtreeMs: 0,
        triangulationMs: 0,
        usedCdt: false,
        reusedSearchQuadtree: false,
      }
    : undefined;

  const searchStart = stageTiming ? performance.now() : 0;
  // `internal.fixedScale` (verdict-loop escalation rebuilds only) SKIPS the
  // budget re-search: a guarded early-return around the CALL to the CRITICAL
  // `searchBudgetScale` (which is itself never edited). Absent ⇒ the exact
  // production condition `targetTriangles > 0` drives the search, byte-identical.
  const search =
    internal?.fixedScale === undefined &&
    opts.targetTriangles !== undefined && opts.targetTriangles > 0
      ? searchBudgetScale(
          sampler,
          opts,
          pinBoundaryLevel,
          opts.targetTriangles,
          opts.budgetMode ?? 'target',
          featureRefine,
          creaseRefine,
        )
      : undefined;
  if (stageTiming) stageTiming.searchMs = performance.now() - searchStart;
  const targetScale = internal?.fixedScale ?? search?.scale ?? 1;
  // Expose the resolved scale + the feature spec this build used to the two-pass
  // verdict loop (buildConformingWall). No-op / zero cost when `internal` is
  // absent (the production path).
  internal?.captureBuildInfo?.({ resolvedScale: targetScale, featureRefine, featureLevel });
  // The search builds its terminal probe with directional refinement disabled.
  // Reuse it only when the final build has the same setting; the directional
  // path must retain its separate final rebuild because it changes the leaf set.
  const finalUsesDirectionalRefine =
    (opts.directionalRefine ?? false) && clippedFeatures.length === 0 && railLines.length === 0;
  const reusableSearchQuadtree = finalUsesDirectionalRefine ? undefined : search?.quadtree;

  const mesh = buildWallMeshAtScale(
    sampler, opts, pinBoundaryLevel, targetScale, clippedFeatures, featureRefine, creaseRefine,
    railLines.length > 0 ? railLines : undefined,
    stageTiming,
    reusableSearchQuadtree,
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
    // Stage-0 instrument: only the FEATURE triangulator produces cdtStats; the
    // plain path leaves it undefined. Metadata only — the mesh is unchanged.
    cdtStats: mesh.cdtStats,
    // Stage-0 instrument: per-triangle emission provenance (both triangulators
    // populate it). Metadata only — the mesh is unchanged.
    triangleSource: mesh.triangleSource,
    // Budget-honesty telemetry: present only when a budget drove the search.
    budget: search?.telemetry,
    stageTiming,
  };
}

/**
 * Max escalation passes for the two-pass verdict loop. Each pass scores the
 * built wall against the LIFT sampler and escalates the outliers' 1-rings by one
 * level; P2.5c converged the Gyroid band-edge knee by commanded L13 (worst
 * 0.00711) within this bound.
 */
const VERDICT_MAX_PASS = 4;
/**
 * Verdict outlier tolerance (mm): a facet whose measured chord/max-sag against
 * the LIFT sampler exceeds this is escalated. Matches the 0.01mm export standard
 * P2.5c converged against.
 */
const VERDICT_TOL_MM = 0.01;

/** `d - round(d)`: shortest signed u-step across the periodic u=0/u=1 seam.
 * Mirrors verdictRefine's (non-exported) `wrapDu` — kept local so the candidate-
 * scope helpers below key facet centroids IDENTICALLY to `scoreCandidateFacets`. */
function verdictWrapDu(d: number): number {
  return d - Math.round(d);
}

/** Every facet index of a mesh (the pass-0 FULL-scan candidate set). */
function allFacetIndices(mesh: VerdictScorableMesh): number[] {
  const nF = Math.floor(mesh.indices.length / 3);
  const out = new Array<number>(nF);
  for (let f = 0; f < nF; f++) out[f] = f;
  return out;
}

/**
 * The 1-ring (iu,it) footprint of every accumulated escalation target — the
 * SAME cells {@link buildLevelAtFromTargets} drives deeper — as a packed-key
 * Set. Periodic-wrapped in u (`uCellRes = 1 << (featureLevel + uBias)`), clamped/
 * dropped in t (`tCellRes = 1 << featureLevel`), matching the escalation ring.
 */
function targetFootprintKeys(
  targets: Map<number, number>,
  uCellRes: number,
  tCellRes: number,
): Set<number> {
  const footprint = new Set<number>();
  for (const coreKey of targets.keys()) {
    const coreIu = coreKey % uCellRes;
    const coreIt = (coreKey - coreIu) / uCellRes;
    for (let dt = -1; dt <= 1; dt++) {
      const it = coreIt + dt;
      if (it < 0 || it >= tCellRes) continue; // t is NOT periodic
      for (let du = -1; du <= 1; du++) {
        const iu = ((coreIu + du) % uCellRes + uCellRes) % uCellRes; // periodic u
        footprint.add(it * uCellRes + iu);
      }
    }
  }
  return footprint;
}

/**
 * Leg #1 candidate scope for a LATER verdict pass (pass ≥ 1): the sparse near-
 * band selector's output UNION every facet whose centroid cell lies in an
 * already-escalated target's 1-ring footprint (deduped). The near-band selector
 * (`selectCandidateFacets` with no `sizingField`) only reaches facets AROUND the
 * band-edge contour, so an OFF-band survivor would otherwise stop being re-scored
 * after its first escalation and could never climb further; re-scoring its
 * footprint keeps it converging toward the 0.01 export standard. Centroid keying
 * mirrors {@link scoreCandidateFacets} exactly (periodic-wrapped u).
 */
function widenedCandidates(
  wall: VerdictScorableMesh,
  nearBand: number[],
  footprint: Set<number>,
  featureLevel: number,
  uBias: number,
): number[] {
  const uCellRes = 1 << (featureLevel + uBias);
  const tCellRes = 1 << featureLevel;
  const { vertices, indices } = wall;
  const chosen = new Set<number>(nearBand);
  const nF = Math.floor(indices.length / 3);
  for (let f = 0; f < nF; f++) {
    if (chosen.has(f)) continue;
    const ia = indices[3 * f], ib = indices[3 * f + 1], ic = indices[3 * f + 2];
    const ua = vertices[ia * 3], ub = vertices[ib * 3], uc = vertices[ic * 3];
    const ta = vertices[ia * 3 + 1], tb = vertices[ib * 3 + 1], tc = vertices[ic * 3 + 1];
    const uCentroidRaw = ua + (verdictWrapDu(ub - ua) + verdictWrapDu(uc - ua)) / 3;
    const uCentroid = ((uCentroidRaw % 1) + 1) % 1;
    const tCentroid = (ta + tb + tc) / 3;
    const iu = Math.min(uCellRes - 1, Math.max(0, Math.floor(uCentroid * uCellRes)));
    const it = Math.min(
      tCellRes - 1,
      Math.max(0, Math.floor(Math.min(1 - 1e-12, Math.max(0, tCentroid)) * tCellRes)),
    );
    if (footprint.has(it * uCellRes + iu)) chosen.add(f);
  }
  return Array.from(chosen);
}

/**
 * Build a conforming wall — production entry point (unchanged signature/return).
 *
 * Default path (flag OFF, or any ineligible wall) forwards straight to
 * {@link buildConformingWallOnce}, i.e. today's production build, BYTE-IDENTICAL.
 *
 * When the opt-in `__pfConformingVerdictRefine` flag is on AND this is an outer
 * feature wall (`surfaceId === 0`, `featureLines` present) with no
 * caller-supplied `featureLevelAt`, it runs the two-pass VERDICT loop
 * (E-2026-07-12 Gyroid-knee ship, T4 keystone): build → score outlier facets
 * against the LIFT sampler (the warp-composed surface the emitted triangles
 * actually carry) → escalate their 1-rings via `featureLevelAt` → rebuild, up to
 * {@link VERDICT_MAX_PASS} passes. The escalation is a build-time GEOMETRIC
 * verdict, never the sizing-field curvature (which under-reads true curvature
 * 1.2–20× — the exact mistake every prior build-time predictor made).
 */
export function buildConformingWall(
  sampler: SurfaceSampler,
  opts: ConformingWallOptions,
): ConformingWallResult {
  // Flag-OFF or ineligible ⇒ the byte-identical production path. Only the OUTER
  // wall (features are outer-only), only with feature lines, and never when a
  // caller already drives `featureLevelAt` itself (don't double-drive).
  if (
    !isConformingVerdictRefineEnabled() ||
    opts.surfaceId !== 0 ||
    (opts.featureLines?.length ?? 0) === 0 ||
    opts.featureLevelAt !== undefined
  ) {
    return buildConformingWallOnce(sampler, opts);
  }

  // Pass 0: the production build. Capture its resolved budget scale + the
  // feature spec it built so the loop drives the scorer/selector with the SAME
  // `intersects` and reuses the scale on escalation rebuilds.
  let resolvedScale = 1;
  let capturedRefine: FeatureRefineSpec | undefined;
  let featureLevel = opts.maxLevel;
  let wall = buildConformingWallOnce(sampler, opts, {
    captureBuildInfo: (info) => {
      resolvedScale = info.resolvedScale;
      capturedRefine = info.featureRefine;
      featureLevel = info.featureLevel;
    },
  });
  // No feature spec survived clipping ⇒ nothing to score/escalate against.
  if (capturedRefine === undefined) return wall;
  const featureRefine = capturedRefine;

  const uBias = opts.uBias ?? 0;
  const uCellRes = 1 << (featureLevel + uBias);
  // VERDICT LIFT. When the caller supplies the EXACT closed-form radius
  // `analyticRA`, score against the analytic surface instead of the warp-composed
  // `efgSampler`/`sampler`: the production `efgSampler` is a 256² bilinear grid
  // that SMOOTHS the band-edge cliff (the knee's true ~0.025mm sag reads <0.01
  // through the grid → never flagged → never escalated; E-2026-07-12 T6 root
  // cause). The (u,t)→(θ,z) lift mirrors the export/P2.5c analytic surface
  // EXACTLY (research/bridge/_tierc_p2_5c.test.ts:122-123, _gyroid_truthLib.ts
  // `surf`): θ = u·TAU, z = t·H, r = rA(θ,z). WITHOUT `analyticRA` the loop keeps
  // the efgSampler/sampler lift (behaviour unchanged) — but the knee only truly
  // closes with `analyticRA` supplied.
  const TAU = 2 * Math.PI;
  const analyticRA = opts.analyticRA;
  const analyticH = opts.analyticH ?? 1;
  const fallbackLift = opts.efgSampler ?? sampler;
  const liftSampler: VerdictLiftSampler = analyticRA
    ? {
        position: (u, t) => {
          const theta = u * TAU;
          const z = t * analyticH;
          const r = analyticRA(theta, z);
          return [r * Math.cos(theta), r * Math.sin(theta), z];
        },
      }
    : {
        // Adapt the (readonly-tuple) SurfaceSampler to the scorer's lift
        // interface — one fresh (mutable) triple per query (the scorer copies to
        // XYZ anyway).
        position: (u, t) => {
          const p = fallbackLift.position(u, t);
          return [p[0], p[1], p[2]];
        },
      };

  // ACCUMULATE + INCREMENT (faithful P2.5c "iterate, fold survivors one level
  // deeper"). `targets` persists across passes: coreCellKey → commanded level.
  // Each pass folds the surviving outliers ONE level deeper and rebuilds the
  // `featureLevelAt` closure from the FULL accumulated map, so (a) cells needing
  // more than featureLevel+1 keep climbing (reaching L13+), (b) cells closed in
  // an earlier pass STAY escalated (never re-opened), and (c) the `changed` guard
  // terminates cleanly once every survivor has plateaued at maxLevel.
  const tCellRes = 1 << featureLevel;
  const targets = new Map<number, number>();
  for (let pass = 0; pass < VERDICT_MAX_PASS; pass++) {
    // Leg #1 (E-2026-07-12-R2b): the export standard is 0.01mm EVERYWHERE, so the
    // candidate scope must be COMPLETE — not just the sparse near-band around the
    // contour (which misses genuine OFF-band background under-tessellation, the 2
    // T6 residuals). Pass 0 scores the FULL mesh to seed the complete outlier set;
    // later passes re-score the near-band UNION every already-escalated cell's
    // 1-ring footprint so an off-band survivor keeps climbing until it closes.
    // Full-mesh CPU scoring is minutes-scale — the price the GPU scorer offloads.
    const candidates = pass === 0
      ? allFacetIndices(wall)
      : widenedCandidates(
          wall,
          selectCandidateFacets(wall, featureRefine),
          targetFootprintKeys(targets, uCellRes, tCellRes),
          featureLevel,
          uBias,
        );
    const outliers = scoreCandidateFacets(
      wall, liftSampler, candidates, VERDICT_TOL_MM, featureLevel, uBias,
    );
    if (outliers.length === 0) break;
    let changed = false;
    for (const o of outliers) {
      const key = o.it * uCellRes + o.iu; // core cell key (matches T2/T3 keying)
      const cur = targets.get(key) ?? featureLevel;
      const next = Math.min(cur + 1, opts.maxLevel);
      if (next !== cur) {
        targets.set(key, next);
        changed = true;
      }
    }
    if (!changed) break; // every survivor already at maxLevel — converged/plateau
    const levelAt = buildLevelAtFromTargets(targets, featureLevel, uBias, opts.maxLevel);
    wall = buildConformingWallOnce(
      sampler,
      { ...opts, featureLevelAt: levelAt },
      { fixedScale: resolvedScale },
    );
  }
  return wall;
}
