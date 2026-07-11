/**
 * FeatureConformingTriangulator.ts — feature-aware variant of
 * {@link triangulateQuadtree}.
 *
 * Builds the same periodic, 2:1-balanced, T-junction-free triangle mesh as the
 * plain triangulator, EXCEPT that every cell a feature curve passes through is
 * locally re-triangulated (constrained Delaunay via
 * {@link triangulateConstrainedCell}) so the curve becomes real mesh edges.
 *
 * ## Why it stays watertight + T-junction-free BY CONSTRUCTION
 *
 * A cell's perimeter vertex set is fully determined by (a) its 4 corners,
 * (b) a mid-edge vertex on each side that borders a finer neighbour (exactly as
 * the plain triangulator), and (c) feature-curve↔boundary crossing points. A
 * crossing on a shared edge is the intersection of the SAME feature segment with
 * the SAME edge line, computed by the same formula from both adjacent cells, so
 * the two cells produce a bit-identical crossing point → deduped to one global
 * vertex. Hence both sides of every shared edge carry the identical vertex
 * sequence: no T-junction. Feature curves are closed loops / full-height lines,
 * so a crossing is always shared by two feature cells (a curve can only reach an
 * edge by passing between the two cells it separates).
 *
 * With no feature lines this delegates to {@link triangulateQuadtree} verbatim,
 * so the 16 already-passing styles are byte-for-byte unaffected.
 *
 * @module conforming/FeatureConformingTriangulator
 */

import type { QuadLeaf } from './PeriodicBalancedQuadtree';
import type { Efg, QuadtreeLike, QuadtreeMesh, TriangulationStageTiming } from './QuadtreeTriangulator';
import {
  triangulateQuadtree,
  TRI_SOURCE,
  metricLen2,
  shapedTemplate,
  emitShapedTransition,
  isDevTriangulationTimingEnabled,
} from './QuadtreeTriangulator';
import type { FeatureLine } from './FeatureLineGraph';
import {
  triangulateConstrainedCell,
  type CellPoint,
  type CdtStats,
  type ConstrainedCellResult,
} from './ConstrainedCellTriangulator';
import { triangulateFeatureAlignedCell, type Sampler3D as FeatureSampler3D } from './featureAlignedCell';
import { makeQuadtreeCellKeyCodec, MAX_U_EXTRA_FOR_CODEC } from './QuadtreeCellKeyCodec';
import {
  buildQuadtreeTopology,
  forEachTopologyEdgePoint,
  QUAD_SIDE,
  quadSideBit,
} from './QuadtreeTopology';
import {
  refineCellInterior,
  type Sampler3D,
  THETA_MIN,
  MAX_STEINER_PER_CELL,
} from './CellQualityRefinement';

/**
 * A band region in (u,t) parameter space — the footprint of an offset feature
 * band whose own paving (the general-mesher's `paveBand`) fills it. The
 * predicate answers "is this (u,t) strictly inside the band interior?". The
 * emit-gate (PASS B) SUPPRESSES triangle emission for any quadtree leaf whose 4
 * corners AND center are all inside, so the band's paved triangles can occupy
 * the hole without overlap. Straddle leaves (rail-crossed) keep emitting — they
 * are feature-constrained by the rails passed as `FeatureLine`s. The simplest
 * representation the per-cell test needs: a corner+center membership predicate.
 */
export interface BandRegion {
  /** True iff (u,t) is strictly inside the band interior. */
  insideBand(u: number, t: number): boolean;
}

export interface FeatureTriangulationOptions {
  /** Use the historical structural split/edge registry as a parity oracle. */
  legacyTopology?: boolean;
  /** Quantization scale for vertex dedup (must match the plain triangulator). */
  quantScale?: number;
  /**
   * Opt-in offset-band footprints (general-mesher integration spike, Task 2).
   * When supplied, a quadtree leaf whose 4 corners AND center all fall inside a
   * band is SKIPPED at emission (a hole the band's own paving fills); every
   * other leaf is unchanged. The tree build (refine/balance) is NOT touched —
   * only emission is gated — so the 2:1-balance + pinned-boundary invariants
   * hold. Omitted / empty ⇒ byte-identical to the pre-gate output (the default
   * export path is never disturbed). Band straddle cells keep emitting; they are
   * feature-constrained by the rails passed in `features`.
   */
  bandRegions?: BandRegion[];
  /**
   * Absolute (u,t) threshold: a feature point within this Chebyshev distance of
   * a cell corner or mid-edge vertex is SNAPPED onto it. This caps the worst
   * triangle aspect (a crossing landing just shy of a corner would otherwise
   * make a needle). It must be ABSOLUTE (not cell-relative) so both cells
   * sharing an edge make the identical snap decision → no T-junction. Pick it
   * as a small fraction of the feature cell size. 0 disables snapping.
   */
  cornerSnap?: number;
  /**
   * Optional (u,t)→3D surface sampler. When supplied, every REAL feature cell
   * (one carrying inserted feature segments) runs the Tier-2 interior quality
   * refinement ({@link refineCellInterior}) AFTER its constrained CDT — inserting
   * strictly-interior off-center Steiner points (computed in the 3D surface
   * metric) to raise the min interior angle, WITHOUT ever mutating the
   * registry-shared perimeter. Omitted ⇒ byte-identical to the pre-refinement
   * output (the clean styles are untouched). The closure must match the wall's
   * production surface map so the off-centers are well-shaped in 3D.
   */
  sampler?: Sampler3D;
  /**
   * Opt-in offset-band RAIL feature lines (general-mesher integration spike,
   * Task 3) — the densify-and-share contract's complement half. Every vertex of
   * a rail line is FORCE-REGISTERED into the grid-line registry
   * (`regH`/`regV`) keyed by its `tKey(t)`/`uKey(u)` line, REGARDLESS of the
   * on-edge check that gates ordinary feature points (`registerBoundary`). A rail
   * vertex that the band placed on a shared cell edge is therefore adopted
   * IDENTICALLY by both adjacent cells (read via `readH`/`readV`), so the band's
   * paving and the complement weld by the same global id — watertight by
   * construction.
   *
   * Rail lines are ADDITIVE feature constraints: they are triangulated as
   * constraints exactly like ordinary `features` AND additionally force-
   * registered. The vertices MUST be `quantizeRailUT`-snapped (Task 1) so their
   * grid-line keys are exact dyadic and dedupe with the neighbour + `vertexIndex`.
   *
   * This is gated to rail lines ONLY: ordinary `features` keep their exact
   * current behaviour (an interior feature point stays single-cell), so an empty
   * / omitted `railLines` is byte-identical to the pre-Task-3 output (the default
   * export path is never disturbed). NOTE: when `railLines` is supplied but
   * `features` is empty, the feature path still runs (the early plain fast-out is
   * taken only when BOTH are empty).
   */
  railLines?: FeatureLine[];
  /**
   * OPT-IN remedy for the 2-locus deterministic non-manifold defect at
   * near-tangent doubled general-curve passes (E-2026-07-11-TIERC-HEADTOHEAD
   * Arm A2; `research/lab/tierc/champion-spec-gyroid.md` §1.5). Default `'off'`
   * (or omitted) is BYTE-IDENTICAL to the pre-A2 output — {@link
   * forceRefineMultiCurveLeaves} is never called. `'forceRefine'` (the
   * pre-registered first remedy) splits any leaf crossed by >=2 DISTINCT
   * `kind:'general-curve'` FeatureLines into 4 quadrant leaves one level finer,
   * BEFORE any other processing, so the existing registry/transition-template
   * machinery treats it exactly as if the quadtree itself had refined there —
   * refining the CELL, never inserting new constraint geometry (the
   * over-constraint hazard the champion spec's §V11q names). `'forceRefine'`
   * was MEASURED (E-2026-07-11-TIERC-HEADTOHEAD Arm A2, twin-scale acceptance
   * run) to clear 0/3 of the known non-manifold loci on the real production
   * twin — the literal "one leaf hosts both curves" condition it requires does
   * not hold at any of the 3 offending edges (confirmed by direct diagnosis:
   * each is a single degenerate near-zero-area sliver triangle spanning a
   * near-tangent constraint configuration, not a shared-cell crossing).
   * `'fanRepair'` (the pre-registered fallback) is a POST-PASS — see {@link
   * fanConsistencyRepair} — that drops the smallest triangle on a >2-multiplicity
   * edge ONLY when it is a confidently-degenerate sliver (area ratio gated), run
   * once on the fully-assembled mesh. See that function's doc for the measured
   * result.
   *
   * `'snapMerge'` (E-2026-07-11-TIERC-HEADTOHEAD Arm A4b; `research/lab/tierc/
   * A4-diagnosis.md` §2.1/§4.1) targets a DIFFERENT symptom of the SAME
   * near-tangent doubled-curve root cause: not the 3 known mult=3 SLIVERS
   * `'fanRepair'` fixes, but the ~65-spot, 329-edge population of mult=1
   * boundary HOLES the diagnosis found `'fanRepair'` structurally cannot reach
   * (its edge-selection is scoped to mult>2 edges only; a hole has no excess
   * triangle to drop). Reuses the EXACT same leaf-flagging test {@link
   * forceRefineMultiCurveLeaves} uses (factored into {@link
   * detectMultiCurveLeaves}) but, instead of splitting the flagged leaf, WIDENS
   * the grid-line REGISTRY's merge tolerance (see `SNAP_MERGE_WELD`) — ONLY for
   * boundary points registered while processing a flagged leaf — so a
   * near-coincident registry point from the OTHER curve label (measured gap
   * ≈0.000178 in the one dumped example, ~6× production `cornerSnap`) is
   * UNIFIED onto the already-registered point instead of creating a second,
   * near-duplicate vertex. Both cells sharing that grid line read the SAME
   * (now-merged) registry entry in PASS B, so the merge is symmetric by
   * construction. Adds NO new constraint line/curve (the §V11q over-constraint
   * hazard `'forceRefine'`'s own doc names) — it only relabels which
   * already-present vertex a near-tangent crossing resolves to. Default `'off'`
   * never computes the flagged set or reaches the widened path — byte-identical.
   *
   * MEASURED (E-2026-07-11-TIERC-HEADTOHEAD Arm A4b, full band-edge twin,
   * `research/bridge/_tierc_a4b.test.ts`, `SNAP_MERGE_WELD=4e-4`): a
   * documented NEGATIVE result, in the same spirit as `'forceRefine'`'s own
   * measured 0/3 above. `'off'` byte-identity holds exactly (hash + topology
   * reproduce the banked baseline) and fidelity is untouched (outer tris
   * +0.038%, Newton-worst and coverage-max BIT-IDENTICAL to banked) — but
   * boundaryEdges REGRESSED 360→426 (+66, worse, not the targeted ≤31) and
   * nonManifold stayed at 3 (unchanged — does not supersede `'fanRepair'`).
   * The registry-level widen search is correctly gated (only a flagged leaf's
   * OWN `registerBoundary` calls widen) and correctly bounded in raw (u,t)
   * distance, but it is NOT scoped to the flagged leaf's own edge extent — it
   * searches every already-registered point on the SAME exact grid line
   * (shared by every leaf whose edge lies on that line, not just the flagged
   * one) within `SNAP_MERGE_WELD`, so on Gyroid's long near-parallel doubled
   * band-edge run (A2's own measurement: ~0.00058 mean curve separation) it
   * can merge onto a coincidentally-nearby but topologically-UNRELATED point
   * rather than the intended near-tangent twin — moving, not net-resolving,
   * the cross-cell shared-vertex disagreement A4 diagnosed. Left in place
   * (default `'off'`, byte-identical, zero production risk) as a proven-safe,
   * honestly-negative starting point; a fix would need to scope the merge
   * candidate search to points ALSO registered while processing a flagged
   * leaf (provenance-tracked), not merely to absolute (u,t) proximity on a
   * shared grid line — untried, next-arm work.
   */
  multiCurveCellPolicy?: 'off' | 'forceRefine' | 'fanRepair' | 'snapMerge';
}

/** Quantization scale for vertex dedup (exact for dyadic coords up to lvl 24). */
const QSCALE = 1 << 24;
/**
 * Weld-safe interior margin for Tier-2 Steiner points: ≥ 2× the float-jitter weld
 * radius (`WELD_TAU = 1e-6` in the tolerance-weld pass below) AND > one QSCALE
 * quantum (≈5.96e-8), so a refined interior point can never be welded or quantized
 * onto a registry-shared boundary vertex (or a neighbour cell's near-edge Steiner
 * across the shared edge) → no manufactured T-junction.
 */
const STEINER_MIN_EDGE_DIST = 2e-6;
/** Cap on per-leaf directional u-refinement (mirrors PeriodicBalancedQuadtree).
 *  Sourced from the key codec so the packed-key uExtra field can't drift. */
const MAX_U_EXTRA = MAX_U_EXTRA_FOR_CODEC;
/** Geometric tolerance for "on a cell boundary" classification (in u,t). */
const ON_EDGE_EPS = 1e-9;
/** Hard cap on retained CDT incidents per wall — totals stay exact past it. */
const MAX_CDT_INCIDENTS = 500;
/**
 * OPT-IN widened registry-merge radius for `multiCurveCellPolicy: 'snapMerge'`
 * (Arm A4b, E-2026-07-11-TIERC-HEADTOHEAD Addendum 4/5). A boundary point
 * registered while processing a leaf {@link detectMultiCurveLeaves} flagged is
 * unified onto an EXISTING grid-line registry entry within this Chebyshev
 * (u,t) distance instead of creating a new near-duplicate entry — see {@link
 * regAddResolve}. Sized above the one measured example gap (0.000178, ~6×
 * production `cornerSnap≈2.93e-5` at featureLevel 11) with ~2.2× margin, and
 * kept under one featureLevel-11 t-cell (1/2048≈0.000488) / ~1.6 effective
 * u-cells at uBias=1 (1/4096≈0.000244) so the merge cannot reach past the
 * immediate near-tangent neighbourhood into an unrelated feature crossing
 * elsewhere on the same grid line. Read ONLY by the `'snapMerge'` path; every
 * other policy value never references it.
 */
const SNAP_MERGE_WELD = 4e-4;

interface Seg {
  /** start (u,t) of the original feature segment. */
  a: CellPoint;
  /** end (u,t) of the original feature segment. */
  b: CellPoint;
}

/** Flatten all feature lines into individual (a,b) segments in (u,t) space. */
function collectSegments(features: FeatureLine[]): Seg[] {
  const segs: Seg[] = [];
  for (const line of features) {
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.u === b.u && a.t === b.t) continue;
      segs.push({ a: { u: a.u, t: a.t }, b: { u: b.u, t: b.t } });
    }
  }
  return segs;
}

/**
 * Liang–Barsky clip of segment (a→b) to box [u0,u1]×[t0,t1]. Returns the inside
 * sub-parameter interval [λ0,λ1] ⊂ [0,1], or null if the segment misses the box.
 * λ is the fraction along a→b, so the clipped endpoints are lerp(a,b,λ0/λ1).
 */
function clipToBox(
  s: Seg,
  u0: number,
  u1: number,
  t0: number,
  t1: number,
): [number, number] | null {
  const du = s.b.u - s.a.u;
  const dt = s.b.t - s.a.t;
  let lo = 0;
  let hi = 1;
  const edges: Array<[number, number]> = [
    [-du, s.a.u - u0], // u >= u0
    [du, u1 - s.a.u], // u <= u1
    [-dt, s.a.t - t0], // t >= t0
    [dt, t1 - s.a.t], // t <= t1
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-300) {
      if (q < 0) return null; // parallel & outside
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > hi) return null;
      if (r > lo) lo = r;
    } else {
      if (r < lo) return null;
      if (r < hi) hi = r;
    }
  }
  if (lo >= hi) return null;
  return [lo, hi];
}

function lerp(a: CellPoint, b: CellPoint, l: number): CellPoint {
  return { u: a.u + (b.u - a.u) * l, t: a.t + (b.t - a.t) * l };
}

/**
 * Points where segment (a→b) meets the 4 edges of box [u0,u1]×[t0,t1] (endpoints
 * INCLUSIVE, so a vertex tangent to / sitting on an edge is reported). Computed
 * per edge LINE, so both cells sharing an edge derive the identical crossing.
 * Corners are skipped (handled as cell corners). Pushes onto `out`.
 */
function edgeCrossingsInto(
  s: Seg, u0: number, u1: number, t0: number, t1: number, eps: number, out: CellPoint[],
): void {
  const { a, b } = s;
  const inU = (u: number): boolean => u >= u0 - eps && u <= u1 + eps;
  const inT = (t: number): boolean => t >= t0 - eps && t <= t1 + eps;
  // Horizontal edges t=t0,t1: param along t.
  if (Math.abs(b.t - a.t) > 1e-300) {
    for (const te of [t0, t1]) {
      const f = (te - a.t) / (b.t - a.t);
      if (f < -eps || f > 1 + eps) continue;
      const u = a.u + (b.u - a.u) * f;
      if (inU(u)) out.push({ u, t: te });
    }
  }
  // Vertical edges u=u0,u1: param along u.
  if (Math.abs(b.u - a.u) > 1e-300) {
    for (const ue of [u0, u1]) {
      const f = (ue - a.u) / (b.u - a.u);
      if (f < -eps || f > 1 + eps) continue;
      const t = a.t + (b.t - a.t) * f;
      if (inT(t)) out.push({ u: ue, t });
    }
  }
}

/** Position (0..1) of a boundary point along a CCW side, or -1 if not on it. */
interface SidePoint {
  pos: number;
  pt: CellPoint;
}

/** Proper interior intersection of segments (a0,a1)·(b0,b1), or null. */
function segSegCross(
  a0: CellPoint, a1: CellPoint, b0: CellPoint, b1: CellPoint,
): { point: CellPoint; ta: number; tb: number } | null {
  const r = { u: a1.u - a0.u, t: a1.t - a0.t };
  const s = { u: b1.u - b0.u, t: b1.t - b0.t };
  const denom = r.u * s.t - r.t * s.u;
  if (Math.abs(denom) < 1e-300) return null; // parallel
  const qp = { u: b0.u - a0.u, t: b0.t - a0.t };
  const ta = (qp.u * s.t - qp.t * s.u) / denom;
  const tb = (qp.u * r.t - qp.t * r.u) / denom;
  const eps = 1e-7;
  if (ta <= eps || ta >= 1 - eps || tb <= eps || tb >= 1 - eps) return null; // not a proper crossing
  return { point: { u: a0.u + r.u * ta, t: a0.t + r.t * ta }, ta, tb };
}

/**
 * Planarize a set of constraint segments: split every pair that PROPERLY crosses
 * at the intersection (a Steiner point), so no two constraints cross in their
 * interior (which cdt2d cannot handle → braids self-overlap). The intersection
 * lies strictly inside the cell, so it is a purely-local interior vertex → no
 * cross-cell inconsistency. Returns the split segments + the new Steiner points.
 */
function planarizeConstraints(
  constraints: Array<[CellPoint, CellPoint]>,
): { segments: Array<[CellPoint, CellPoint]>; steiner: CellPoint[] } {
  const n = constraints.length;
  const splits: Array<Array<{ t: number; pt: CellPoint }>> = constraints.map(() => []);
  const steiner: CellPoint[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const x = segSegCross(constraints[a][0], constraints[a][1], constraints[b][0], constraints[b][1]);
      if (!x) continue;
      splits[a].push({ t: x.ta, pt: x.point });
      splits[b].push({ t: x.tb, pt: x.point });
      steiner.push(x.point);
    }
  }
  const segments: Array<[CellPoint, CellPoint]> = [];
  for (let a = 0; a < n; a++) {
    const [p, q] = constraints[a];
    if (splits[a].length === 0) {
      segments.push([p, q]);
      continue;
    }
    const cuts = splits[a].slice().sort((x, y) => x.t - y.t);
    let prev = p;
    for (const c of cuts) {
      if (Math.abs(prev.u - c.pt.u) > 1e-12 || Math.abs(prev.t - c.pt.t) > 1e-12) {
        segments.push([prev, c.pt]);
      }
      prev = c.pt;
    }
    if (Math.abs(prev.u - q.u) > 1e-12 || Math.abs(prev.t - q.t) > 1e-12) segments.push([prev, q]);
  }
  return { segments, steiner };
}

/** Worst (smallest) 3D min interior angle (deg) over a cell result, via `sampler`. */
function worstMin3D(result: ConstrainedCellResult, sampler: FeatureSampler3D): number {
  let worst = 180;
  for (const [a, b, c] of result.triangles) {
    const pa = sampler(result.points[a].u, result.points[a].t);
    const pb = sampler(result.points[b].u, result.points[b].t);
    const pc = sampler(result.points[c].u, result.points[c].t);
    const A = Math.hypot(pb[0] - pc[0], pb[1] - pc[1], pb[2] - pc[2]);
    const B = Math.hypot(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]);
    const C = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    if (A < 1e-12 || B < 1e-12 || C < 1e-12) return 0;
    const ang = (o1: number, o2: number, op: number): number =>
      Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - op * op) / (2 * o1 * o2))));
    const m = Math.min(ang(B, C, A), ang(A, C, B), ang(A, B, C)) * (180 / Math.PI);
    if (m < worst) worst = m;
  }
  return worst;
}

/**
 * Shared same-cell/2-distinct-general-curve-label detection — factored out of
 * {@link forceRefineMultiCurveLeaves}'s step (a) so `multiCurveCellPolicy:
 * 'snapMerge'` (Arm A4b) can reuse the EXACT same precise geometric test
 * without duplicating it. Returns the set of LEAF INDICES (into `leaves`, its
 * original unmodified order) crossed by >=2 DISTINCT `kind:'general-curve'`
 * FeatureLine labels. Pure / side-effect-free — never mutates `leaves`.
 */
function detectMultiCurveLeaves(
  leaves: readonly QuadLeaf[],
  features: readonly FeatureLine[],
  uBias: number,
): Set<number> {
  const generalCurves = features.filter((f) => f.kind === 'general-curve');
  if (generalCurves.length < 2) return new Set();

  const eULof = (l: { level: number; uExtra?: number }): number => l.level + uBias + (l.uExtra ?? 0);

  // Bucketed bbox pre-filter (candidate narrowing only) + a PRECISE geometric
  // test (clipToBox proper-interior-clip OR edgeCrossingsInto tangent touch —
  // the SAME two tests PASS A in {@link triangulateQuadtreeWithFeatures} uses
  // to decide a segment is present in a cell) for cell membership. A pure
  // bbox-overlap test was tried first and measured too coarse: two long
  // near-parallel curves have overlapping bounding boxes across a wide swath
  // of cells they don't actually both cross, over-flagging ~200 cells in the
  // window-repro fixture and (empirically) relocating rather than clearing
  // the defect. The precise test narrows the flagged set to cells the curves
  // ACTUALLY pass through.
  const BUCKET = 64;
  const bKey = (bu: number, bt: number): number => bt * BUCKET + bu;
  const clampB = (x: number): number => Math.max(0, Math.min(BUCKET - 1, Math.floor(x * BUCKET)));
  interface SegRec { a: CellPoint; b: CellPoint; minU: number; maxU: number; minT: number; maxT: number; label: string }
  const segBuckets = new Map<number, SegRec[]>();
  for (const line of generalCurves) {
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.u === b.u && a.t === b.t) continue;
      const minU = Math.min(a.u, b.u);
      const maxU = Math.max(a.u, b.u);
      const minT = Math.min(a.t, b.t);
      const maxT = Math.max(a.t, b.t);
      const rec: SegRec = { a: { u: a.u, t: a.t }, b: { u: b.u, t: b.t }, minU, maxU, minT, maxT, label: line.label };
      const bu0 = clampB(minU);
      const bu1 = clampB(maxU);
      const bt0 = clampB(minT);
      const bt1 = clampB(maxT);
      for (let bt = bt0; bt <= bt1; bt++) {
        for (let bu = bu0; bu <= bu1; bu++) {
          const k = bKey(bu, bt);
          let arr = segBuckets.get(k);
          if (!arr) { arr = []; segBuckets.set(k, arr); }
          arr.push(rec);
        }
      }
    }
  }
  const EDGE_EPS = 1e-12;
  const touchScratch: CellPoint[] = [];
  const segTouchesBox = (seg: SegRec, u0: number, u1: number, t0: number, t1: number): boolean => {
    const clip = clipToBox(seg, u0, u1, t0, t1);
    if (clip && clip[1] - clip[0] > 1e-12) return true;
    touchScratch.length = 0;
    edgeCrossingsInto(seg, u0, u1, t0, t1, 1e-9, touchScratch);
    return touchScratch.length > 0;
  };
  // SAME-CELL, not proximity-dilated: this is the literal reading of the named
  // remedy ("cells crossed by >=2 distinct general-curves"). A PROXIMITY-dilated
  // variant (flagging any leaf within K cells of BOTH curves, not just one
  // literally hosting both) was measured during E-2026-07-11-TIERC-HEADTOHEAD Arm
  // A2 and REJECTED: the two doubled band-edge contours run near-parallel at a
  // near-CONSTANT ~0.00058 (u,t) separation over a LONG stretch (66% of a 201-pt
  // sample of the inner contour sits within 0.0005 of the outer contour) — a
  // distance/proximity criterion cannot discriminate the 2-3 true defect loci
  // from thousands of equally-close, defect-free points along the same curves; at
  // K=2 cells it force-refined >2,500 of ~12,000 window leaves (would blow the
  // ±0.5% outer-tris acceptance band many times over on the real twin). The exact
  // same-cell test is therefore the implementation; PROXIMITY_CELLS is kept as a
  // named, zeroed constant (not a magic 0 inlined below) so this rejection is
  // legible at the call site, not just in the comment.
  const PROXIMITY_CELLS = 0;
  const flagged = new Set<number>();
  for (let li = 0; li < leaves.length; li++) {
    const l = leaves[li];
    const sizeU = 1 / (1 << eULof(l));
    const sizeT = 1 / (1 << l.level);
    const u0 = l.u0;
    const u1 = u0 + sizeU;
    const t0 = l.t0;
    const t1 = t0 + sizeT;
    const du = PROXIMITY_CELLS * sizeU;
    const dt = PROXIMITY_CELLS * sizeT;
    const qu0 = u0 - du;
    const qu1 = u1 + du;
    const qt0 = t0 - dt;
    const qt1 = t1 + dt;
    const bu0 = Math.max(0, Math.min(BUCKET - 1, Math.floor(qu0 * BUCKET)));
    const bu1 = Math.max(0, Math.min(BUCKET - 1, Math.floor((qu1 - 1e-12) * BUCKET)));
    const bt0 = Math.max(0, Math.min(BUCKET - 1, Math.floor(qt0 * BUCKET)));
    const bt1 = Math.max(0, Math.min(BUCKET - 1, Math.floor((qt1 - 1e-12) * BUCKET)));
    const labels = new Set<string>();
    for (let bt = bt0; bt <= bt1 && labels.size < 2; bt++) {
      for (let bu = bu0; bu <= bu1 && labels.size < 2; bu++) {
        const arr = segBuckets.get(bKey(bu, bt));
        if (!arr) continue;
        for (const seg of arr) {
          if (labels.has(seg.label)) continue;
          if (
            seg.maxU < qu0 - EDGE_EPS || seg.minU > qu1 + EDGE_EPS ||
            seg.maxT < qt0 - EDGE_EPS || seg.minT > qt1 + EDGE_EPS
          ) continue;
          if (segTouchesBox(seg, qu0, qu1, qt0, qt1)) {
            labels.add(seg.label);
            if (labels.size >= 2) break;
          }
        }
      }
    }
    if (labels.size >= 2) flagged.add(li);
  }
  return flagged;
}

/**
 * OPT-IN multi-curve cell force-refine — `multiCurveCellPolicy: 'forceRefine'`
 * (E-2026-07-11-TIERC-HEADTOHEAD Arm A2; named remedy #1 in
 * `research/lab/tierc/champion-spec-gyroid.md` §1.5, the 2-locus deterministic
 * non-manifold defect at near-tangent doubled general-curve passes). A leaf
 * crossed by >=2 DISTINCT `kind:'general-curve'` FeatureLines (by `label`) is
 * split into 4 quadrant leaves at level+1 BEFORE any other processing in
 * {@link triangulateQuadtreeWithFeatures}, so every downstream mechanism (grid-
 * line registry, 2:1 transition templates, spatial bucketing) treats it exactly
 * as if the quadtree itself had refined there — refining the CELL, never
 * inserting new constraint geometry (the over-constraint hazard the champion
 * spec's §V11q names: a THIRD near-coincident CONSTRAINT line regressed badly;
 * this lever adds zero new curve points, only smaller cells).
 *
 * SAFETY GUARD: a flagged leaf is left UNSPLIT if it has an existing neighbour
 * exactly one level COARSER than itself on any side. Splitting it would then
 * create a 2-level gap on that side; the transition-template system (splitS/E/
 * N/W in the caller) only ever adds ONE mid-edge point per side and assumes at
 * most a one-level finer-neighbour gap — the invariant
 * `PeriodicBalancedQuadtree.balance()` normally guarantees for every REAL
 * quadtree build. Violating it here would manufacture a NEW T-junction/crack —
 * exactly the class of defect this policy exists to remove. Skipping is a
 * conservative, measurable degrade (that one cell is simply not force-refined),
 * never a new crack. Also skipped: any leaf with `uExtra !== 0` (directional
 * refinement is disabled on every feature wall in production, so this never
 * fires there; the guard exists so a hand-built test/edge-case fixture can never
 * hit the ambiguous effective-u-level arithmetic a directional split implies).
 *
 * Called ONLY when `options.multiCurveCellPolicy === 'forceRefine'` — default
 * `'off'` never reaches this function, so it has zero effect on the byte-
 * identical default export path.
 */
export function forceRefineMultiCurveLeaves(
  leaves: readonly QuadLeaf[],
  features: readonly FeatureLine[],
  uBias: number,
): QuadLeaf[] {
  const flagged = detectMultiCurveLeaves(leaves, features, uBias);
  if (flagged.size === 0) return leaves.slice();

  const eULof = (l: { level: number; uExtra?: number }): number => l.level + uBias + (l.uExtra ?? 0);
  const iuOf = (l: QuadLeaf): number => l.iu ?? Math.round(l.u0 * (1 << eULof(l)));
  const itOf = (l: QuadLeaf): number => l.it ?? Math.round(l.t0 * (1 << l.level));

  // ── (b) safety guard: skip a flagged leaf that already has an existing
  //    neighbour exactly one level COARSER (would create a 2-level gap). ──
  const cellKey = (level: number, eUL: number, iu: number, it: number): string =>
    `${level}:${eUL}:${iu}:${it}`;
  const origSet = new Set<string>();
  for (const l of leaves) origSet.add(cellKey(l.level, eULof(l), iuOf(l), itOf(l)));
  const wrapU = (u: number): number => ((u % 1) + 1) % 1;
  const hasCoarserNeighbour = (l: QuadLeaf): boolean => {
    const L = l.level;
    if (L === 0) return false;
    const eUL = eULof(l);
    const cL = L - 1;
    const cEUL = cL + uBias;
    if (cEUL < 0) return false;
    const coarseUSpan = 1 << cEUL;
    const coarseTSpan = 1 << cL;
    const sizeU = 1 / (1 << eUL);
    const sizeT = 1 / (1 << L);
    const u0 = l.u0;
    const u1 = u0 + sizeU;
    const t0 = l.t0;
    const t1 = t0 + sizeT;
    const probe = (u: number, t: number): boolean => {
      if (t < 0 || t > 1) return false;
      const iu = Math.floor(wrapU(u) * coarseUSpan);
      const it = Math.floor(t * coarseTSpan);
      if (it < 0 || it >= coarseTSpan) return false;
      return origSet.has(cellKey(cL, cEUL, iu, it));
    };
    const eps = 1e-9;
    const uc = wrapU((u0 + u1) / 2);
    if (t0 > eps && probe(uc, t0 - eps)) return true; // south
    if (t1 < 1 - eps && probe(uc, t1 + eps)) return true; // north
    const tc = (t0 + t1) / 2;
    if (probe(u0 - eps, tc)) return true; // west
    if (probe(u1 + eps, tc)) return true; // east
    return false;
  };

  // A leaf touching the t=0 or t=1 domain edge is (or borders) the PINNED
  // boundary row (`PeriodicBalancedQuadtree`'s `pinBoundaryLevel`, capped there
  // REGARDLESS of feature-refine — see `levelCap`'s `pinRows=0` case) that both
  // walls share BY INDEX for cap stitching (`assembleWatertight` hard-throws on
  // `outer.bottomRing.length !== inner.bottomRing.length`). Splitting it would
  // change the outer wall's ring vertex COUNT while the inner wall's ring (no
  // features, never force-refined) stays put — corrupting the shared-ring
  // contract. MEASURED on the real production twin (E-2026-07-11-TIERC-
  // HEADTOHEAD Arm A2): `outerFeatureLines`' clip margin
  // (`ConformingWall.ts`'s `tMargin = 1/nRing`) does NOT always coincide with
  // the pinned row's own physical height once `uBias>0` shrinks
  // `pinBoundaryLevel` below `log2(nRing)` (Gyroid's real uBias=1 gives
  // `pinBoundaryLevel=10` while `tMargin=1/2048` is only half of that row's
  // `1/1024` height) — so a curve CAN legally sit inside the boundary row's own
  // cell without the clip catching it. This guard is therefore load-bearing,
  // not defensive-only: it is what keeps `assembleWatertight`'s ring-mismatch
  // throw from firing on the real twin.
  const touchesPinnedBoundary = (l: QuadLeaf): boolean => {
    const sizeT = 1 / (1 << l.level);
    const eps = 1e-9;
    return l.t0 <= eps || l.t0 + sizeT >= 1 - eps;
  };

  // ── (c) split each safe flagged leaf into 4 quadrant children at level+1. ──
  const out: QuadLeaf[] = [];
  for (let li = 0; li < leaves.length; li++) {
    const l = leaves[li];
    if (!flagged.has(li) || (l.uExtra ?? 0) !== 0 || touchesPinnedBoundary(l) || hasCoarserNeighbour(l)) {
      out.push(l);
      continue;
    }
    const L = l.level;
    const eUL = eULof(l);
    const iu = iuOf(l);
    const it = itOf(l);
    const childEUL = eUL + 1;
    const childUSpan = 1 << childEUL;
    const childTSpan = 1 << (L + 1);
    for (const du of [0, 1]) {
      for (const dt of [0, 1]) {
        const cIu = iu * 2 + du;
        const cIt = it * 2 + dt;
        out.push({
          u0: cIu / childUSpan,
          t0: cIt / childTSpan,
          level: L + 1,
          iu: cIu,
          it: cIt,
          uExtra: 0,
        });
      }
    }
  }
  return out;
}

/**
 * OPT-IN fan-consistency post-pass — `multiCurveCellPolicy: 'fanRepair'`
 * (E-2026-07-11-TIERC-HEADTOHEAD Arm A2; named remedy #2 in
 * `research/lab/tierc/champion-spec-gyroid.md` §1.5, the fallback for when
 * `forceRefineMultiCurveLeaves` does not clear a locus). Runs ONCE on the
 * fully-assembled, welded, seam-closed triangle list (after every other pass
 * in {@link triangulateQuadtreeWithFeatures}). For every undirected edge used
 * by MORE than 2 triangles, drops the excess triangle(s) — smallest area
 * first — but ONLY when a dropped triangle's area is confidently degenerate
 * relative to its next-smallest sibling on the SAME edge (`SLIVER_RATIO`): a
 * triangle whose area is NOT catastrophically smaller than its neighbour is
 * left alone, because dropping it is not provably safe (it could open a real
 * hole rather than remove a spurious sliver). This is a SAFETY gate, not a
 * tuning knob — it is what stops the repair from ever touching a mult>2
 * configuration whose cause is not a degenerate sliver.
 *
 * MECHANISM CONFIRMED (direct diagnosis, window-repro fixture, locus
 * (0.4384,0.4421)): the offending edge's third (excess) triangle has area
 * ~7e-13 — FOUR ORDERS OF MAGNITUDE smaller than its two siblings (~8e-9,
 * ~2e-8) on the same edge — a genuine near-zero-area sliver formed where two
 * near-tangent constraint-adjacent points land almost, but not exactly, atop
 * each other (closer than the tolerance-weld's `WELD_TAU=1e-6` would merge,
 * but far enough to survive as a distinct, legitimately-needed vertex
 * elsewhere in the same cell's fan — so blind vertex-welding is NOT safe;
 * only dropping the specific degenerate triangle is).
 *
 * MEASURED (E-2026-07-11-TIERC-HEADTOHEAD Arm A2, window-repro fixture, the
 * SAME real band-edge data `triangulateQuadtreeWithFeatures`'s own window-scale
 * test uses): dropping the sliver clears the mult=3 edge CLEANLY at this
 * locus — the mesh's overall boundary-edge (multiplicity-1) count is UNCHANGED
 * (499 before and after; the window's own finite-patch perimeter accounts for
 * all of it both times). An initial hand-analysis of a partial ("incident to
 * 2 of the 3 relevant vertices") neighbourhood dump wrongly predicted this
 * drop would orphan a different edge — the automated, full measurement
 * contradicts that. The `orphanedEdges` return field exists precisely to catch
 * a locus where this ISN'T true (a real risk this function does not rule out
 * in general — see `research/bridge/_tierc_a2_accept.test.ts` for the
 * twin-scale verdict across all 3 known loci, not just this one). Called ONLY
 * when `options.multiCurveCellPolicy === 'fanRepair'` — default `'off'` never
 * reaches this function.
 */
export function fanConsistencyRepair(
  indices: readonly number[],
  seam: readonly number[],
  source: readonly number[],
  vu: readonly number[],
  vt: readonly number[],
): { indices: number[]; seam: number[]; source: number[]; dropped: number; orphanedEdges: number } {
  const triCount = indices.length / 3;
  const area = (t: number): number => {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    return 0.5 * Math.abs((vu[b] - vu[a]) * (vt[c] - vt[a]) - (vu[c] - vu[a]) * (vt[b] - vt[a]));
  };
  const edgeTris = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      let arr = edgeTris.get(key);
      if (!arr) { arr = []; edgeTris.set(key, arr); }
      arr.push(t);
    }
  }
  const SLIVER_RATIO = 1e-3;
  const dropSet = new Set<number>();
  for (const [, tris] of edgeTris) {
    if (tris.length <= 2) continue;
    const withArea = tris.map((t) => ({ t, a: area(t) })).sort((p, q) => p.a - q.a);
    const excess = tris.length - 2;
    for (let i = 0; i < excess; i++) {
      const smallest = withArea[i];
      const next = withArea[i + 1];
      if (next && smallest.a < next.a * SLIVER_RATIO) dropSet.add(smallest.t);
      // else: not confidently a sliver — leave this edge's multiplicity as-is
      // rather than guess.
    }
  }
  if (dropSet.size === 0) {
    return { indices: indices.slice(), seam: seam.slice(), source: source.slice(), dropped: 0, orphanedEdges: 0 };
  }
  const outIdx: number[] = [];
  const outSeam: number[] = [];
  const outSrc: number[] = [];
  for (let t = 0; t < triCount; t++) {
    if (dropSet.has(t)) continue;
    outIdx.push(indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]);
    outSeam.push(seam[t]);
    outSrc.push(source[t]);
  }
  // Count newly-orphaned (multiplicity-1) edges among the dropped triangles'
  // OTHER two edges — the honesty instrument that caught this remedy's own
  // limitation (see the doc above). Metadata only; never suppresses the drop.
  let orphanedEdges = 0;
  const finalCounts = new Map<string, number>();
  for (let k = 0; k < outIdx.length; k += 3) {
    const a = outIdx[k];
    const b = outIdx[k + 1];
    const c = outIdx[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      finalCounts.set(key, (finalCounts.get(key) ?? 0) + 1);
    }
  }
  for (const t of dropSet) {
    const a = indices[t * 3];
    const b = indices[t * 3 + 1];
    const c = indices[t * 3 + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (finalCounts.get(key) === 1) orphanedEdges++;
    }
  }
  return { indices: outIdx, seam: outSeam, source: outSrc, dropped: dropSet.size, orphanedEdges };
}

export function triangulateQuadtreeWithFeatures(
  qt: QuadtreeLike,
  features: FeatureLine[],
  options: FeatureTriangulationOptions = {},
): QuadtreeMesh {
  // DEV-ONLY stage timing (E-2026-07-10 follow-up). Measurement only. Started
  // here (before the empty-features fast-out) so that fast-out simply returns
  // triangulateQuadtree(qt)'s OWN stageTiming — no double-timing needed.
  const devTriTiming = isDevTriangulationTimingEnabled();
  const prepStart = devTriTiming ? performance.now() : 0;
  // Rail lines (Task 3) are ADDITIVE feature constraints that are ALSO force-
  // registered. They run through the same feature path, so the plain fast-out is
  // taken only when BOTH inputs are empty. Read ONCE per build (mirroring the
  // bandRegions/shapedCdtCells flag pattern) so a mid-build flip can never split
  // one wall across regimes. Empty/omitted ⇒ no force-register fires ⇒ the
  // ordinary feature path is byte-identical to the pre-Task-3 output.
  const railLines = options.railLines ?? [];
  const hasRails = railLines.length > 0;
  if (features.length === 0 && !hasRails) {
    return triangulateQuadtree(qt, { legacyTopology: options.legacyTopology });
  }
  const cornerSnap = Math.max(0, options.cornerSnap ?? 0);
  const sampler = options.sampler;
  // Opt-in per-cell feature-aligned strip-pave (the FCT_FEATURE_CDT sliver fix).
  // Dev lever `__pfFeatureAlignedCells` (default OFF). When ON *and* a 3D `sampler`
  // is supplied, every REAL feature cell additionally tries the ridge-aligned fill
  // ({@link triangulateFeatureAlignedCell}); the result is kept ONLY if its 3D
  // worst min-angle strictly beats the plain CDT's (keep-better ⇒ the graft can
  // never regress a cell). Read ONCE per build (mid-flip safety). OFF ⇒ the call
  // is never reached ⇒ byte-identical default path. Takes precedence over (and
  // suppresses) the measured-harmful refineCellInterior on the same cell.
  const featureAlignedOn =
    (globalThis as { __pfFeatureAlignedCells?: boolean }).__pfFeatureAlignedCells === true;
  // Opt-in band-region emit-gate (Task 2). Read ONCE per build so a mid-build
  // flag flip can never split one wall across emit regimes. Undefined/empty ⇒
  // the gate is inert (no leaf is ever skipped) ⇒ byte-identical default path.
  const bandRegions = options.bandRegions;
  const hasBands = (bandRegions?.length ?? 0) > 0;
  // Stage-1 Task 4: shaped templates (shorter-3D-diagonal + Klincsek max-min-
  // angle DP) on the PLAIN cells of a feature wall, mirroring the plain
  // triangulator. Dev lever `__pfConformingShapedCdtCells` (default ON; set
  // false to restore the legacy plain templates) — read ONCE per build so a
  // mid-build flag flip can never split one wall across template regimes. It
  // composes with efg presence: leaves without an `efg` tag take the legacy
  // arms regardless of the flag.
  const shapedCdtCells =
    (globalThis as { __pfConformingShapedCdtCells?: boolean }).__pfConformingShapedCdtCells !==
    false;

  // Anisotropy bias (GAP 1): a level-L leaf spans Δu=1/2^(L+B) in u, Δt=1/2^L in t.
  // u-index/wrap use 2^(level+B); `cornerSnap` is the t-extent fraction, so the u
  // threshold is `cornerSnap/2^B` (same FRACTION of the finer u-cell). B=0 ⇒ both
  // equal ⇒ byte-identical to the isotropic path.
  const uBias = qt.uBias?.() ?? 0;
  /** Effective u-level of a leaf: level + global bias + per-leaf uExtra (GAP 1 H1). */
  const eULof = (l: { level: number; uExtra?: number }): number =>
    l.level + uBias + (l.uExtra ?? 0);
  const uMod = (eUL: number): number => 1 << eUL;
  const iuOf = (l: QuadLeaf): number => l.iu ?? Math.round(l.u0 * uMod(eULof(l)));
  const itOf = (l: QuadLeaf): number => l.it ?? Math.round(l.t0 * (1 << l.level));
  const cornerSnapU = uBias > 0 ? cornerSnap / (1 << uBias) : cornerSnap;
  const cornerSnapT = cornerSnap;
  /** Anisotropic Chebyshev: within snap of (u,t) in BOTH axes (per-axis threshold). */
  const withinSnap = (du: number, dt: number): boolean =>
    Math.abs(du) <= cornerSnapU && Math.abs(dt) <= cornerSnapT;

  let leaves = qt.leaves();
  // OPT-IN multi-curve cell force-refine (E-2026-07-11-TIERC-HEADTOHEAD Arm A2).
  // Default 'off' (or omitted) never reaches this branch — byte-identical to the
  // pre-A2 output. 'fanRepair' is the pre-registered fallback remedy; it is not
  // yet implemented, so it fails loudly rather than silently behaving as 'off'.
  const multiCurveCellPolicy = options.multiCurveCellPolicy ?? 'off';
  if (multiCurveCellPolicy === 'forceRefine') {
    leaves = forceRefineMultiCurveLeaves(leaves, features, uBias);
  }
  // 'fanRepair' does not touch the leaf set — it is a POST-PASS applied to the
  // fully-assembled triangle list, near the end of this function (see the call
  // to fanConsistencyRepair below).
  // 'snapMerge' (Arm A4b) ALSO does not touch the leaf set — it widens the
  // grid-line registry's merge tolerance for boundary points registered while
  // processing one of these flagged leaves (PASS A below), so the SAME set is
  // computed here (once, on the ORIGINAL unmodified `leaves`) and threaded
  // through as `snapMergeFlagged`. `null` for every other policy value ⇒ the
  // per-leaf `registerBoundary` widen check below is always false ⇒ the
  // default/forceRefine/fanRepair paths never evaluate `detectMultiCurveLeaves`
  // at all — byte-identical.
  const snapMergeFlagged: Set<number> | null =
    multiCurveCellPolicy === 'snapMerge' ? detectMultiCurveLeaves(leaves, features, uBias) : null;
  const topology = options.legacyTopology === true ? undefined : buildQuadtreeTopology(leaves, uBias);

  // Integer-cell existence set keyed on the EFFECTIVE u-level (`${level}:${it}:
  // ${eUL}:${iu}`) so a uExtra=0 and a uExtra=1 cell never collide (GAP 1 H1).
  // A secondary effective-u set (`${eUL}:${it}:${iu}`) supports the per-(eUL,it)
  // containing-cell lookup the feature-point snap needs. At uExtra=0 both reduce
  // to the original level-keyed sets → byte-identical.
  let maxLevel = 0;
  let maxEUL = 0;
  for (const l of leaves) {
    const eUL = eULof(l);
    if (l.level > maxLevel) maxLevel = l.level;
    if (eUL > maxEUL) maxEUL = eUL;
  }
  // Packed-INTEGER cell keys (E-2026-07-10-EMIT-CPU-PROFILE: the string-key
  // `Set<string>` here + `hasCell` was a profiled hotspot). Collision-free over
  // the (level,it,uExtra,iu) domain — see QuadtreeCellKeyCodec.test.ts. NOTE the
  // guard in hasCell: snapToCellEdge below probes with an UNBOUNDED uExtra (it
  // walks every coarser level under a fixed eUL), so unlike the plain path this
  // MUST short-circuit out-of-band (level,eUL) before packing.
  const codec = makeQuadtreeCellKeyCodec(maxLevel, uBias);
  const cellSet = new Set<number>();
  for (const l of leaves) {
    cellSet.add(codec.packCell(l.level, itOf(l), l.uExtra ?? 0, iuOf(l)));
  }
  /** Existence of a (level,iu,it,eUL) leaf (iu wraps mod 2^eUL). */
  const hasCell = (level: number, iu: number, it: number, eUL: number): boolean => {
    // A real leaf always has uExtra ∈ [0, MAX_U_EXTRA]; snapToCellEdge probes
    // arbitrary (level,eUL) pairs whose uExtra can exceed that — those never
    // matched a real leaf's string key either, so return false BEFORE packing
    // (an over-range uExtra would overflow the packed field and alias a
    // different cell). Exactly the old `Set<string>.has` result.
    const uExtra = eUL - uBias - level;
    if (uExtra < 0 || uExtra > MAX_U_EXTRA) return false;
    const span = uMod(eUL);
    const wu = ((iu % span) + span) % span;
    return cellSet.has(codec.packCell(level, it, uExtra, wu));
  };

  // ── Snap feature points onto a nearby cell edge ────────────────────────────
  // A feature vertex sitting a hair off a cell edge (a curve local-extremum
  // tangent to the edge from inside, far from any boundary vertex) leaves a
  // near-collinear needle the per-cell weld can't catch (point-vs-point, never
  // point-vs-edge). Snapping it ONTO the containing cell's edge eliminates the
  // needle. The threshold is ABSOLUTE so neighbours decide consistently, and the
  // grid-line vertex registry (PASS A/B below) MIRRORS the snapped on-edge vertex
  // into the cell across that edge — including a COARSER transition neighbour or
  // the feature-clip boundary — so the snap can no longer leave a one-sided
  // crossing. (Previously this snap was guarded to SAME-LEVEL edges only, to
  // avoid exactly that un-mirrored transition crack; the registry makes the guard
  // unnecessary and lets the snap also kill needles at transition edges, the last
  // dense-border sliver source.)
  const snapToCellEdge = (p: CellPoint): CellPoint => {
    if (cornerSnap <= 0) return p;
    const wu = ((p.u % 1) + 1) % 1;
    const tc = p.t < 0 ? 0 : p.t > 1 ? 1 : p.t;
    // Find the leaf containing (wu,tc): scan finest-first over (level,uExtra).
    for (let eUL = maxEUL; eUL >= 0; eUL--) {
      const uSpan = uMod(eUL);
      const iuCand = Math.min(uSpan - 1, Math.floor(wu * uSpan));
      let lv = -1;
      let it = -1;
      for (let cand = eUL - uBias; cand >= 0; cand--) {
        const tSpan = 1 << cand;
        const itCand = Math.min(tSpan - 1, Math.floor(tc * tSpan));
        if (hasCell(cand, iuCand, itCand, eUL)) { lv = cand; it = itCand; break; }
      }
      if (lv < 0) continue;
      const iu = iuCand;
      const tSpan = 1 << lv;
      const sizeU = 1 / uSpan;
      const sizeT = 1 / tSpan;
      const u0 = iu * sizeU;
      const t0 = it * sizeT;
      // u-distances threshold on cornerSnapU (finer cell), t-distances on cornerSnapT.
      const cands: Array<{ d: number; pt: CellPoint }> = [];
      const dB = tc - t0;
      const dT = t0 + sizeT - tc;
      const dL = wu - u0;
      const dR = u0 + sizeU - wu;
      // Snap onto the containing cell's own edge; the registry mirrors it to the
      // neighbour across (any level) so both carry the identical edge vertex.
      if (dB < cornerSnapT) cands.push({ d: dB, pt: { u: p.u, t: t0 } });
      if (dT < cornerSnapT) cands.push({ d: dT, pt: { u: p.u, t: t0 + sizeT } });
      if (dL < cornerSnapU) cands.push({ d: dL, pt: { u: u0, t: p.t } });
      if (dR < cornerSnapU) cands.push({ d: dR, pt: { u: u0 + sizeU, t: p.t } });
      if (cands.length === 0) return p;
      cands.sort((a, b) => a.d - b.d);
      return cands[0].pt;
    }
    return p;
  };
  const snappedFeatures: FeatureLine[] = features.map((line) => ({
    ...line,
    points: line.points.map(snapToCellEdge),
  }));
  // Rail lines (Task 3) are appended UN-snapped: their (u,t) are already
  // `quantizeRailUT`-snapped to the QSCALE dyadic grid, and snapToCellEdge would
  // perturb them off the exact grid line the force-register depends on. They are
  // additive feature constraints (so on-edge rail vertices are triangulated and
  // interior ones become real CDT vertices) AND are force-registered below.
  const segs = collectSegments([...snappedFeatures, ...railLines]);
  // Does a finer u-neighbour exist in effective-u column `col` at level `feUL`
  // across OUR (level,it) t-strip — a uExtra-split at our level OR a level-split
  // (mirrors the plain triangulator's H1 probe). At uExtra=0 only lvl=level+1.
  const uColHasFiner = (feUL: number, col: number, level: number, it: number): boolean => {
    for (let lvl = level; lvl <= maxLevel; lvl++) {
      const ux = feUL - uBias - lvl;
      if (ux < 0 || ux > MAX_U_EXTRA) continue;
      const tMul = 1 << (lvl - level);
      const tBase = it * tMul;
      for (let k = 0; k < tMul; k++) {
        if (hasCell(lvl, col, tBase + k, feUL)) return true;
      }
    }
    return false;
  };
  const sideHasFiner = (
    level: number,
    iu: number,
    it: number,
    eUL: number,
    side: 'uMinus' | 'uPlus' | 'tMinus' | 'tPlus',
  ): boolean => {
    if (side === 'uPlus') {
      if (eUL >= maxEUL) return false;
      return uColHasFiner(eUL + 1, (iu + 1) * 2, level, it);
    }
    if (side === 'uMinus') {
      if (eUL >= maxEUL) return false;
      return uColHasFiner(eUL + 1, iu * 2 - 1, level, it);
    }
    if (level >= maxLevel) return false;
    const fl = level + 1;
    const fe = fl + uBias; // finer t-cells are uExtra=0 in a square-balanced region
    if (side === 'tPlus') {
      if (it + 1 >= 1 << level) return false;
      const row = (it + 1) * 2;
      return hasCell(fl, iu * 2, row, fe) || hasCell(fl, iu * 2 + 1, row, fe);
    }
    if (it === 0) return false;
    const row = it * 2 - 1;
    return hasCell(fl, iu * 2, row, fe) || hasCell(fl, iu * 2 + 1, row, fe);
  };

  // Global vertex dedup WITHOUT wrapping u (seam closed afterwards) — as plain.
  const vertMap = new Map<number, number>();
  const vu: number[] = [];
  const vt: number[] = [];
  const vertexIndex = (u: number, t: number): number => {
    const qu = Math.round(u * QSCALE);
    const qt2 = Math.round(t * QSCALE);
    const key = qu * (QSCALE * 2 + 1) + qt2;
    const existing = vertMap.get(key);
    if (existing !== undefined) return existing;
    const idx = vu.length;
    vu.push(u);
    vt.push(t);
    vertMap.set(key, idx);
    return idx;
  };

  const indices: number[] = [];
  const triWrapsSeam: number[] = [];
  // Stage-0 provenance channel: one TRI_SOURCE tag per emitted triangle, pushed
  // in lockstep by `emit`. `curTag` is set immediately before each emission
  // region. Metadata only — the triangle content/order is untouched.
  const triSource: number[] = [];
  let curTag: number = TRI_SOURCE.FCT_PLAIN_QUAD;

  // ── Spatial bucketing: assign each leaf to the coarse buckets its box overlaps,
  // so a feature segment is tested only against nearby leaves (not all of them).
  const BUCKET = 64;
  const leafBuckets = new Map<number, number[]>(); // bucketKey → leaf indices
  const bucketKey = (bu: number, bt: number): number => bt * BUCKET + bu;
  const addToBuckets = (leafIdx: number, l: QuadLeaf): void => {
    const size = 1 / (1 << l.level);
    const u0 = l.u0;
    const t0 = l.t0;
    const bu0 = Math.min(BUCKET - 1, Math.floor(u0 * BUCKET));
    const bu1 = Math.min(BUCKET - 1, Math.floor((u0 + size - 1e-12) * BUCKET));
    const bt0 = Math.min(BUCKET - 1, Math.floor(t0 * BUCKET));
    const bt1 = Math.min(BUCKET - 1, Math.floor((t0 + size - 1e-12) * BUCKET));
    for (let bt = bt0; bt <= bt1; bt++) {
      for (let bu = bu0; bu <= bu1; bu++) {
        const k = bucketKey(bu, bt);
        let arr = leafBuckets.get(k);
        if (!arr) { arr = []; leafBuckets.set(k, arr); }
        arr.push(leafIdx);
      }
    }
  };
  leaves.forEach((l, i) => addToBuckets(i, l));

  // Per-leaf CANDIDATE segments: original (a,b) whose bbox overlaps the leaf box
  // (inclusive of edge touches). We keep originals — not pre-clipped — so each
  // leaf can compute BOTH its interior arcs (box clip) AND its boundary crossings
  // per shared edge (so a curve TANGENT to an edge registers in BOTH cells → no
  // T-junction; a per-cell box clip alone misses the non-entering side).
  const EDGE_EPS = 1e-12;
  const leafCand: Array<Seg[]> = leaves.map(() => []);
  for (const s of segs) {
    const minU = Math.min(s.a.u, s.b.u);
    const maxU = Math.max(s.a.u, s.b.u);
    const minT = Math.min(s.a.t, s.b.t);
    const maxT = Math.max(s.a.t, s.b.t);
    const bu0 = Math.max(0, Math.min(BUCKET - 1, Math.floor(minU * BUCKET)));
    const bu1 = Math.max(0, Math.min(BUCKET - 1, Math.floor(maxU * BUCKET)));
    const bt0 = Math.max(0, Math.min(BUCKET - 1, Math.floor(minT * BUCKET)));
    const bt1 = Math.max(0, Math.min(BUCKET - 1, Math.floor(maxT * BUCKET)));
    const seen = new Set<number>();
    for (let bt = bt0; bt <= bt1; bt++) {
      for (let bu = bu0; bu <= bu1; bu++) {
        const arr = leafBuckets.get(bucketKey(bu, bt));
        if (!arr) continue;
        for (const li of arr) {
          if (seen.has(li)) continue;
          seen.add(li);
          const l = leaves[li];
          const size = 1 / (1 << l.level);
          // bbox overlap (inclusive) — keeps tangent touches as candidates.
          if (
            maxU < l.u0 - EDGE_EPS || minU > l.u0 + size + EDGE_EPS ||
            maxT < l.t0 - EDGE_EPS || minT > l.t0 + size + EDGE_EPS
          ) continue;
          leafCand[li].push(s);
        }
      }
    }
  }

  // ── Per-leaf geometry + 2:1 transition splits (shared by both passes) ──
  interface LeafGeom {
    leaf: QuadLeaf; eUL: number; uSpan: number; tSpan: number; iu: number; it: number;
    sizeU: number; sizeT: number;
    u0: number; t0: number; u1: number; t1: number; um: number; tm: number;
    wrapsSeam: number; splitS: boolean; splitE: boolean; splitN: boolean; splitW: boolean;
  }
  const geomOf = (li: number): LeafGeom => {
    const leaf = leaves[li];
    const eUL = eULof(leaf);
    const uSpan = uMod(eUL); // u-modulus 2^eUL
    const tSpan = 1 << leaf.level;
    const iu = iuOf(leaf);
    const it = itOf(leaf);
    const sizeU = 1 / uSpan;
    const sizeT = 1 / tSpan;
    const u0 = leaf.u0;
    const t0 = leaf.t0;
    const splitMask = topology?.splitMasks[li];
    return {
      leaf, eUL, uSpan, tSpan, iu, it, sizeU, sizeT, u0, t0,
      u1: u0 + sizeU, t1: t0 + sizeT, um: u0 + sizeU / 2, tm: t0 + sizeT / 2,
      wrapsSeam: Math.round((u0 + sizeU) * QSCALE) === QSCALE ? 1 : 0,
      splitS: splitMask === undefined
        ? sideHasFiner(leaf.level, iu, it, eUL, 'tMinus')
        : (splitMask & quadSideBit(QUAD_SIDE.SOUTH)) !== 0,
      splitE: splitMask === undefined
        ? sideHasFiner(leaf.level, iu, it, eUL, 'uPlus')
        : (splitMask & quadSideBit(QUAD_SIDE.EAST)) !== 0,
      splitN: splitMask === undefined
        ? sideHasFiner(leaf.level, iu, it, eUL, 'tPlus')
        : (splitMask & quadSideBit(QUAD_SIDE.NORTH)) !== 0,
      splitW: splitMask === undefined
        ? sideHasFiner(leaf.level, iu, it, eUL, 'uMinus')
        : (splitMask & quadSideBit(QUAD_SIDE.WEST)) !== 0,
    };
  };

  const qk = (p: CellPoint): number =>
    Math.round(p.u * QSCALE) * (QSCALE * 2 + 1) + Math.round(p.t * QSCALE);
  // Grid-line keys: t-lines keyed by quantized t; u-lines by quantized u mod 1
  // (so the periodic seam u=1≡u=0 shares a key). A feature vertex landing on a
  // shared cell edge is registered HERE keyed by its grid line, so BOTH adjacent
  // cells read the IDENTICAL ordered vertex set in PASS B → no T-junction even
  // when one cell is tangent to the edge and never "enters" it.
  const tKey = (t: number): number => Math.round(t * QSCALE);
  const uKey = (u: number): number => Math.round((((u % 1) + 1) % 1) * QSCALE);
  const regH = new Map<number, Map<number, CellPoint>>(); // tKey(t) → uKey(u) → point
  const regV = new Map<number, Map<number, CellPoint>>(); // uKey(u) → tKey(t) → point
  const regAdd = (
    m: Map<number, Map<number, CellPoint>>, k: number, sub: number, p: CellPoint,
  ): void => {
    let inner = m.get(k);
    if (!inner) { inner = new Map(); m.set(k, inner); }
    if (!inner.has(sub)) inner.set(sub, p);
  };
  /**
   * OPT-IN widened registry merge for `multiCurveCellPolicy: 'snapMerge'` (Arm
   * A4b). Identical to `regAdd` (first-writer-wins on the EXACT quantized
   * sub-key, caller keeps using its own `p`) UNLESS `widen` is true (the
   * calling leaf was flagged by {@link detectMultiCurveLeaves}, the SAME
   * same-cell/2-distinct-general-curve-label test `forceRefineMultiCurveLeaves`
   * uses) AND no exact sub-key match exists — in that case, search the SAME
   * grid line's already-registered points for one within `SNAP_MERGE_WELD`
   * (u,t) and, if found, return IT so the caller adopts the EXISTING point
   * instead of registering a new near-duplicate. Both cells sharing this grid
   * line read the SAME (now-merged) entry in PASS B, so the merge is symmetric
   * by construction — no new asymmetry can result. `widen=false` (every policy
   * other than 'snapMerge', or an unflagged leaf under 'snapMerge') is
   * BYTE-IDENTICAL to `regAdd` + the caller's pre-existing "keep my own p"
   * behaviour (this function always returns `p`, never `exact`, on an exact-key
   * hit — the no-op side effect matches `regAdd` precisely).
   */
  const regAddResolve = (
    m: Map<number, Map<number, CellPoint>>, k: number, sub: number, p: CellPoint, widen: boolean,
  ): CellPoint => {
    let inner = m.get(k);
    if (!inner) { inner = new Map(); m.set(k, inner); }
    if (inner.has(sub)) return p;
    if (widen) {
      for (const cand of inner.values()) {
        if (Math.abs(cand.u - p.u) <= SNAP_MERGE_WELD && Math.abs(cand.t - p.t) <= SNAP_MERGE_WELD) {
          return cand;
        }
      }
    }
    inner.set(sub, p);
    return p;
  };

  // ── Rail force-register (Task 3) ────────────────────────────────────────────
  // Admit EVERY (snapped) rail-line vertex into the grid-line registry keyed by
  // its `tKey(t)` (horizontal line) AND `uKey(u)` (vertical line),
  // REGARDLESS of the on-edge check that gates ordinary feature points
  // (`registerBoundary`, which registers a point only when it sits on its
  // CONTAINING cell's edge). This is the complement half of the densify-and-share
  // contract: a rail vertex the band placed on a shared cell edge is now adopted
  // IDENTICALLY by both adjacent cells (each reads it via `readH`/`readV` on that
  // shared edge), so band paving and complement weld by the same global id.
  //
  // A registry entry on a grid line that is NOT any cell's edge is simply never
  // read (readH/readV are invoked only on a cell's own t0/t1/u0/u1 lines), so a
  // strictly-interior rail vertex's entry is inert — it does NOT manufacture a
  // spurious crossing. The vertices are `quantizeRailUT`-snapped, so `tKey`/`uKey`
  // are exact dyadic and dedupe with the neighbour and with `vertexIndex`. Gated
  // to rail lines ONLY: with no railLines this loop never runs ⇒ the registry is
  // identical to the pre-Task-3 ordinary-feature path (byte-identical default).
  const registerRailVertex = (p: CellPoint): void => {
    regAdd(regH, tKey(p.t), uKey(p.u), { u: p.u, t: p.t });
    regAdd(regV, uKey(p.u), tKey(p.t), { u: p.u, t: p.t });
  };
  if (hasRails) {
    for (const line of railLines) {
      for (const p of line.points) registerRailVertex({ u: p.u, t: p.t });
    }
  }

  const registryStart = devTriTiming ? performance.now() : 0;
  const prepMs = devTriTiming ? registryStart - prepStart : 0;

  // ── PASS A0 (directional only): register every leaf's 4 CORNERS onto the grid-
  //    line registry so a coarse cell whose edge is subdivided by a SAME-LEVEL
  //    u-finer (directional uExtra) neighbour — which `sideHasFiner`'s level+1
  //    t-probe cannot see — reads the finer neighbour's on-edge corner in PASS B.
  //    Both sides of the shared edge then carry the identical vertex set →
  //    T-junction-free under directional (eUL) transitions.
  //
  //    GUARDED on the presence of any uExtra>0 cell. In production, feature walls
  //    have directional refine DISABLED (inserted styles stay deferred), so no
  //    leaf carries uExtra>0 and this pass is SKIPPED → the feature path is
  //    byte-identical to the pre-GAP1 triangulator (the delicate honeycomb /
  //    braid transition templates are untouched). ──
  const hasDirectional = leaves.some((l) => (l.uExtra ?? 0) > 0);
  if (hasDirectional && topology) {
    forEachTopologyEdgePoint(topology, (leafIndex, side, coordinate) => {
      const g = geomOf(leafIndex);
      if (side === QUAD_SIDE.SOUTH || side === QUAD_SIDE.NORTH) {
        const t = side === QUAD_SIDE.SOUTH ? g.t0 : g.t1;
        regAdd(regH, tKey(t), uKey(coordinate), { u: coordinate, t });
      } else {
        const u = side === QUAD_SIDE.EAST ? g.u1 : g.u0;
        regAdd(regV, uKey(u), tKey(coordinate), { u, t: coordinate });
      }
    });
  } else if (hasDirectional) {
    for (let li = 0; li < leaves.length; li++) {
      const g = geomOf(li);
      regAdd(regH, tKey(g.t0), uKey(g.u0), { u: g.u0, t: g.t0 });
      regAdd(regH, tKey(g.t0), uKey(g.u1), { u: g.u1, t: g.t0 });
      regAdd(regH, tKey(g.t1), uKey(g.u0), { u: g.u0, t: g.t1 });
      regAdd(regH, tKey(g.t1), uKey(g.u1), { u: g.u1, t: g.t1 });
      regAdd(regV, uKey(g.u0), tKey(g.t0), { u: g.u0, t: g.t0 });
      regAdd(regV, uKey(g.u0), tKey(g.t1), { u: g.u0, t: g.t1 });
      regAdd(regV, uKey(g.u1), tKey(g.t0), { u: g.u1, t: g.t0 });
      regAdd(regV, uKey(g.u1), tKey(g.t1), { u: g.u1, t: g.t1 });
    }
  }

  // ── PASS A: classify each feature cell's boundary points + interior +
  //    constraints, and register the boundary points by grid line. Mids
  //    (transition vertices) are NOT registered — they are re-derived from the
  //    splits in PASS B (already symmetric via sideHasFiner). ──
  interface LeafData {
    feature: boolean;
    interior: CellPoint[];
    constraints: Array<[CellPoint, CellPoint]>;
  }
  const leafData: LeafData[] = new Array(leaves.length);

  for (let li = 0; li < leaves.length; li++) {
    const g = geomOf(li);
    const { u0, t0, u1, t1, um, tm, splitS, splitE, splitN, splitW } = g;

    const cand = leafCand[li];
    const pieces: Seg[] = [];
    const edgeCross: CellPoint[] = [];
    for (const s of cand) {
      const clip = clipToBox(s, u0, u1, t0, t1);
      if (clip && clip[1] - clip[0] > 1e-12) {
        pieces.push({ a: lerp(s.a, s.b, clip[0]), b: lerp(s.a, s.b, clip[1]) });
      }
      edgeCrossingsInto(s, u0, u1, t0, t1, 1e-9, edgeCross);
    }
    if (pieces.length === 0 && edgeCross.length === 0) {
      leafData[li] = { feature: false, interior: [], constraints: [] };
      continue;
    }

    const interior: CellPoint[] = [];
    const interiorKey = new Map<number, number>();
    const constraints: Array<[CellPoint, CellPoint]> = [];

    // OPT-IN 'snapMerge' widen check (Arm A4b) — true only when this EXACT
    // leaf was flagged by detectMultiCurveLeaves (same test forceRefine uses).
    // `snapMergeFlagged` is null for every other policy, so this is always
    // false off the opt-in path — zero effect on the default/forceRefine/
    // fanRepair behaviour below.
    const widenThisLeaf = snapMergeFlagged !== null && snapMergeFlagged.has(li);

    // Register a boundary feature point onto its grid line (skip corners).
    // Returns the RESOLVED point to use (== p unless 'snapMerge' widen-merged
    // it onto an already-registered near-coincident point from the OTHER
    // curve label), or null when p is not on this leaf's edge at all.
    const registerBoundary = (p: CellPoint): CellPoint | null => {
      const onS = Math.abs(p.t - t0) <= ON_EDGE_EPS;
      const onN = Math.abs(p.t - t1) <= ON_EDGE_EPS;
      const onW = Math.abs(p.u - u0) <= ON_EDGE_EPS;
      const onE = Math.abs(p.u - u1) <= ON_EDGE_EPS;
      if (!(onS || onN || onW || onE)) return null;
      const atCorner = (onS || onN) && (onW || onE);
      if (atCorner) return p;
      if (onS) return regAddResolve(regH, tKey(t0), uKey(p.u), { u: p.u, t: t0 }, widenThisLeaf);
      if (onN) return regAddResolve(regH, tKey(t1), uKey(p.u), { u: p.u, t: t1 }, widenThisLeaf);
      if (onW) return regAddResolve(regV, uKey(u0), tKey(p.t), { u: u0, t: p.t }, widenThisLeaf);
      return regAddResolve(regV, uKey(u1), tKey(p.t), { u: u1, t: p.t }, widenThisLeaf);
    };
    const registerInterior = (p: CellPoint): void => {
      const k = qk(p);
      if (!interiorKey.has(k)) { interiorKey.set(k, interior.length); interior.push(p); }
    };

    // Anchors (corners + existing mids) for corner-snapping — ABSOLUTE threshold
    // + shared anchors so both sides of every shared edge snap identically.
    const anchors: CellPoint[] = [
      { u: u0, t: t0 }, { u: u1, t: t0 }, { u: u1, t: t1 }, { u: u0, t: t1 },
    ];
    if (splitS) anchors.push({ u: um, t: t0 });
    if (splitE) anchors.push({ u: u1, t: tm });
    if (splitN) anchors.push({ u: um, t: t1 });
    if (splitW) anchors.push({ u: u0, t: tm });
    const snapToAnchor = (p: CellPoint): CellPoint => {
      if (cornerSnap <= 0) return p;
      for (const a of anchors) {
        if (withinSnap(p.u - a.u, p.t - a.t)) return a;
      }
      return p;
    };

    for (const piece of pieces) {
      let pa = snapToAnchor(piece.a);
      let pb = snapToAnchor(piece.b);
      if (qk(pa) === qk(pb)) continue;
      const rpa = registerBoundary(pa);
      if (rpa !== null) pa = rpa; else registerInterior(pa);
      const rpb = registerBoundary(pb);
      if (rpb !== null) pb = rpb; else registerInterior(pb);
      // Re-check after a possible 'snapMerge' widen-merge unified pa and pb
      // onto the same existing point (default path: pa/pb are byte-identical
      // to their pre-register values here, so this can never newly trigger).
      if (qk(pa) === qk(pb)) continue;
      constraints.push([pa, pb]);
    }
    // Per-edge boundary crossings (incl. tangent touches the box clip misses).
    for (const ec of edgeCross) registerBoundary(snapToAnchor(ec));

    // Planarize crossing constraints (braids) → Steiner points are interior.
    const planar = planarizeConstraints(constraints);
    constraints.length = 0;
    for (const seg of planar.segments) constraints.push(seg);
    for (const sp of planar.steiner) registerInterior(sp);

    leafData[li] = { feature: true, interior, constraints };
  }

  const emitStart = devTriTiming ? performance.now() : 0;
  const registryMs = devTriTiming ? emitStart - registryStart : 0;

  // ── PASS B: triangulate each leaf, reading the UNION of feature edge points
  //    from the registry so both adjacent cells carry the identical edge-vertex
  //    set (symmetric → T-junction-free). A cell that was PLAIN in PASS A but
  //    whose neighbour registered points on a shared edge becomes a feature cell
  //    here (it subdivides the edge to match — with no interior constraints). ──
  const readH = (tk: number, lo: number, hi: number): CellPoint[] => {
    const inner = regH.get(tk);
    if (!inner) return [];
    const out: CellPoint[] = [];
    for (const p of inner.values()) if (p.u > lo + ON_EDGE_EPS && p.u < hi - ON_EDGE_EPS) out.push(p);
    return out;
  };
  const readV = (uk: number, lo: number, hi: number): CellPoint[] => {
    const inner = regV.get(uk);
    if (!inner) return [];
    const out: CellPoint[] = [];
    for (const p of inner.values()) if (p.t > lo + ON_EDGE_EPS && p.t < hi - ON_EDGE_EPS) out.push(p);
    return out;
  };

  // Masking-channel counters across all constrained cells (Stage-0 instrument):
  // winding inversions (fold-over signal) + zero-area drops (potential hole).
  const cdtStats: CdtStats = { inversions: 0, drops: 0, incidents: [] };

  for (let li = 0; li < leaves.length; li++) {
    const g = geomOf(li);
    const {
      leaf, eUL, tSpan, iu, it, sizeU, sizeT, u0, t0, u1, t1, um, tm, wrapsSeam,
      splitS, splitE, splitN, splitW,
    } = g;
    const data = leafData[li];

    // ── Band-region emit-gate (Task 2) ─────────────────────────────────────
    // Classify the leaf against the opt-in band footprints: if its 4 corners
    // AND center are ALL strictly inside one band, it is FULLY-INSIDE → skip
    // emission (a hole the band's own paving fills). Straddle leaves (any
    // corner/center outside) fall through unchanged — they are feature-
    // constrained by the rails passed as `features`. The tree (refine/balance)
    // is untouched: only emission is suppressed, so the 2:1-balance + pinned-
    // boundary invariants hold. Inert (no skip) when no bands are supplied ⇒
    // byte-identical default path.
    if (hasBands) {
      const fullyInsideBand = bandRegions!.some(
        (br) =>
          br.insideBand(u0, t0) &&
          br.insideBand(u1, t0) &&
          br.insideBand(u1, t1) &&
          br.insideBand(u0, t1) &&
          br.insideBand(um, tm),
      );
      if (fullyInsideBand) continue;
    }

    const emit = (a: number, b: number, c: number): void => {
      if (a === b || b === c || a === c) return;
      indices.push(a, b, c);
      triWrapsSeam.push(wrapsSeam);
      triSource.push(curTag);
    };

    // Feature edge points (union across both adjacent cells), as SidePoints. The
    // pos is normalized along the side: south/north along u (sizeU), east/west
    // along t (sizeT).
    const featS = readH(tKey(t0), u0, u1).map((p) => ({ pos: (p.u - u0) / sizeU, pt: p }));
    const featN = readH(tKey(t1), u0, u1).map((p) => ({ pos: (u1 - p.u) / sizeU, pt: p }));
    const featW = readV(uKey(u0), t0, t1).map((p) => ({ pos: (t1 - p.t) / sizeT, pt: p }));
    const featE = readV(uKey(u1), t0, t1).map((p) => ({ pos: (p.t - t0) / sizeT, pt: p }));

    const isFeature =
      data.feature || featS.length > 0 || featN.length > 0 || featW.length > 0 || featE.length > 0;

    if (!isFeature) {
      // ── Plain template cell (mirrors triangulateQuadtree's plain branch,
      // INCLUDING the Stage-1 shaped templates — Task 4 mirror). The shaped
      // arms keep the registry contract: interior connectivity only, the
      // boundary polygon's vertex set is unchanged, so every shared edge keeps
      // its exact vertex sequence (watertight + T-junction-free preserved —
      // the plain-path precedent in QuadtreeTriangulator). No efg tag, or
      // isotropic + B==0, or the dev flag off ⇒ legacy arms byte-for-byte. ──
      const poly: number[] = [];
      const co: [number, number][] = [];
      const add = (u: number, t: number): void => { poly.push(vertexIndex(u, t)); co.push([u, t]); };
      add(u0, t0); // SW
      if (splitS) add(um, t0);
      add(u1, t0); // SE
      if (splitE) add(u1, tm);
      add(u1, t1); // NE
      if (splitN) add(um, t1);
      add(u0, t1); // NW
      if (splitW) add(u0, tm);
      const splitCount = (splitS ? 1 : 0) + (splitE ? 1 : 0) + (splitN ? 1 : 0) + (splitW ? 1 : 0);
      // Per-leaf shaped gate, derived EXACTLY as the plain path derives `aniso`
      // (leaf.efg + cell extents + the tree's global uBias).
      const efg: Efg | undefined = shapedCdtCells ? leaf.efg : undefined;
      const aniso = shapedTemplate(efg, sizeU, sizeT, uBias);
      if (splitCount === 0) {
        // Plain quad. Legacy: SW→NE diagonal. Shaped: the SHORTER 3D diagonal
        // via metricLen2 with the SAME QSCALE tie-quantization convention as
        // the plain path (tie → SW→NE → byte-identical isotropic path). The
        // diagonal choice keeps the FCT_PLAIN_QUAD tag — it is still a plain
        // quad, only its interior diagonal differs.
        curTag = TRI_SOURCE.FCT_PLAIN_QUAD;
        let useSeNw = false;
        if (aniso && efg) {
          const dSwNe = metricLen2(efg, u1 - u0, t1 - t0); // SW→NE
          const dSeNw = metricLen2(efg, u0 - u1, t1 - t0); // SE→NW
          // Quantize to suppress float jitter so the tie always falls to SW→NE.
          const qSwNe = Math.round(dSwNe * QSCALE);
          const qSeNw = Math.round(dSeNw * QSCALE);
          useSeNw = qSeNw < qSwNe;
        }
        if (useSeNw) {
          emit(poly[0], poly[1], poly[3]); // SW, SE, NW
          emit(poly[1], poly[2], poly[3]); // SE, NE, NW
        } else {
          emit(poly[0], poly[1], poly[2]); // SW, SE, NE
          emit(poly[0], poly[2], poly[3]); // SW, NE, NW
        }
      } else if (aniso && efg) {
        // Shaped transition: in-metric chooser between the Klincsek DP and the
        // centroid fan (see emitShapedTransition — the DP-always variant
        // regressed fan-favourable cells; both candidates are interior-only).
        curTag = TRI_SOURCE.FCT_EAR_CLIP;
        emitShapedTransition(efg, co, poly, um, tm, () => {
          curTag = TRI_SOURCE.FCT_PLAIN_FAN;
          return vertexIndex(um, tm);
        }, emit);
      } else {
        curTag = TRI_SOURCE.FCT_PLAIN_FAN;
        const ctr = vertexIndex(um, tm);
        for (let i = 0; i < poly.length; i++) emit(ctr, poly[i], poly[(i + 1) % poly.length]);
      }
      continue;
    }

    // ── Feature cell: side points = mids (transition) + registry feature points ──
    const south: SidePoint[] = [];
    const east: SidePoint[] = [];
    const north: SidePoint[] = [];
    const west: SidePoint[] = [];
    if (splitS) south.push({ pos: 0.5, pt: { u: um, t: t0 } });
    if (splitE) east.push({ pos: 0.5, pt: { u: u1, t: tm } });
    if (splitN) north.push({ pos: 0.5, pt: { u: um, t: t1 } });
    if (splitW) west.push({ pos: 0.5, pt: { u: u0, t: tm } });
    for (const sp of featS) south.push(sp);
    for (const sp of featE) east.push(sp);
    for (const sp of featN) north.push(sp);
    for (const sp of featW) west.push(sp);

    // Build the CCW boundary polygon: corners + sorted/deduped side points.
    const sortBy = (arr: SidePoint[]): SidePoint[] =>
      arr
        .filter((s) => s.pos > ON_EDGE_EPS && s.pos < 1 - ON_EDGE_EPS)
        .sort((p, q) => p.pos - q.pos);
    // Merge side points closer than cornerSnap on a CLEAN shared edge (no mid,
    // same-level neighbour), keeping the CANONICAL (min-qk) point so both cells
    // agree (opposite sides walk the edge in reversed order → "keep first" would
    // diverge). The registry already makes both sides see the same set, so the
    // dedup result is identical on both sides too.
    const cleanEdge = (split: boolean, niu: number, nit: number): boolean =>
      !split && nit >= 0 && nit < tSpan && hasCell(leaf.level, niu, nit, eUL);
    const cleanS = cleanEdge(splitS, iu, it - 1);
    const cleanN = cleanEdge(splitN, iu, it + 1);
    const cleanW = cleanEdge(splitW, iu - 1, it);
    const cleanE = cleanEdge(splitE, iu + 1, it);
    // Side-position tolerance: u-sides (S/N) measure pos along u (cornerSnapU/sizeU);
    // t-sides (E/W) along t (cornerSnapT/sizeT). Equal at B=0.
    const posTolU = cornerSnapU / sizeU;
    const posTolT = cornerSnapT / sizeT;
    const dedupSide = (arr: SidePoint[], clean: boolean, posTol: number): SidePoint[] => {
      const tol = clean ? Math.max(ON_EDGE_EPS, posTol) : ON_EDGE_EPS;
      const out: SidePoint[] = [];
      let group: SidePoint[] = [];
      const flush = (): void => {
        if (group.length === 0) return;
        let best = group[0];
        for (const sp of group) if (qk(sp.pt) < qk(best.pt)) best = sp;
        out.push(best);
        group = [];
      };
      for (const sp of arr) {
        if (group.length > 0 && Math.abs(sp.pos - group[group.length - 1].pos) > tol) flush();
        group.push(sp);
      }
      flush();
      return out;
    };
    const boundary: CellPoint[] = [];
    boundary.push({ u: u0, t: t0 });
    for (const sp of dedupSide(sortBy(south), cleanS, posTolU)) boundary.push(sp.pt);
    boundary.push({ u: u1, t: t0 });
    for (const sp of dedupSide(sortBy(east), cleanE, posTolT)) boundary.push(sp.pt);
    boundary.push({ u: u1, t: t1 });
    for (const sp of dedupSide(sortBy(north), cleanN, posTolU)) boundary.push(sp.pt);
    boundary.push({ u: u0, t: t1 });
    for (const sp of dedupSide(sortBy(west), cleanW, posTolT)) boundary.push(sp.pt);

    // Weld interior feature points onto a nearby BOUNDARY point (shared/
    // never-moved) else fold into a nearby surviving interior point — both
    // per-cell decisions → cross-cell consistent. Removes edge-proximity +
    // braid-Steiner needles.
    const interiorCanon = new Map<number, CellPoint>();
    const survivingInterior: CellPoint[] = [];
    for (const ip of data.interior) {
      let canon: CellPoint | null = null;
      if (cornerSnap > 0) {
        for (const bp of boundary) {
          if (withinSnap(ip.u - bp.u, ip.t - bp.t)) { canon = bp; break; }
        }
        if (!canon) {
          for (const sp of survivingInterior) {
            if (withinSnap(ip.u - sp.u, ip.t - sp.t)) { canon = sp; break; }
          }
        }
      }
      if (canon) interiorCanon.set(qk(ip), canon);
      else { interiorCanon.set(qk(ip), ip); survivingInterior.push(ip); }
    }

    const localKey = new Map<number, number>();
    boundary.forEach((p, i) => localKey.set(qk(p), i));
    survivingInterior.forEach((p, i) => localKey.set(qk(p), boundary.length + i));
    const canonical = (p: CellPoint): CellPoint => interiorCanon.get(qk(p)) ?? p;
    const combined = [...boundary, ...survivingInterior];
    const resolve = (p: CellPoint): number => {
      const c = canonical(p);
      const exact = localKey.get(qk(c));
      if (exact !== undefined) return exact;
      let best = -1;
      // Normalized anisotropic distance: a point is "within snap" iff
      // max(|du|/cornerSnapU, |dt|/cornerSnapT) ≤ 1 (≡ Chebyshev at B=0).
      let bestD = 1 + 1e-9;
      const snapU = cornerSnapU > 0 ? cornerSnapU : 1;
      const snapT = cornerSnapT > 0 ? cornerSnapT : 1;
      for (let i = 0; i < combined.length; i++) {
        const d = Math.max(Math.abs(combined[i].u - c.u) / snapU, Math.abs(combined[i].t - c.t) / snapT);
        if (d <= bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const cellConstraints: Array<[number, number]> = [];
    for (const [pa, pb] of data.constraints) {
      const ia = resolve(pa);
      const ib = resolve(pb);
      if (ia < 0 || ib < 0 || ia === ib) continue;
      cellConstraints.push([ia, ib]);
    }

    let result = triangulateConstrainedCell({
      boundary,
      interior: survivingInterior,
      constraints: cellConstraints,
    });
    // Record the masking-channel counters from the FIRST (per-cell CDT) result —
    // `result` may be reassigned by refineCellInterior below. Counting only; the
    // triangle output is untouched.
    if (result.inversionCount > 0 || result.droppedCount > 0) {
      cdtStats.inversions += result.inversionCount;
      cdtStats.drops += result.droppedCount;
      const dump =
        (globalThis as { __pfConformingCellDumps?: boolean }).__pfConformingCellDumps === true;
      if (cdtStats.incidents.length < MAX_CDT_INCIDENTS) {
        cdtStats.incidents.push({
          u0, t0, u1, t1,
          inversions: result.inversionCount, drops: result.droppedCount,
          ...(dump ? { input: { boundary, interior: survivingInterior, constraints: cellConstraints } } : {}),
        });
      }
    }
    // ── Feature-aligned strip-pave (opt-in keep-better; __pfFeatureAlignedCells) ──
    // On a REAL feature cell, try the ridge-aligned fill and keep it ONLY if its 3D
    // worst min-angle strictly beats the plain CDT's — so the graft can never
    // regress a cell. Target spacing = a fraction of the cell's 3D short side, so
    // even a small feature cell gets ≥1 ridge subdivision. The fill keeps the
    // boundary vertex set UNCHANGED (interior Steiner only ≥ STEINER_MIN_EDGE_DIST
    // from the perimeter), so the registry-shared perimeter stays watertight +
    // T-junction-free. Suppresses refineCellInterior on the same cell (below).
    if (featureAlignedOn && sampler !== undefined && data.feature) {
      const c00 = sampler(u0, t0), c10 = sampler(u1, t0), c01 = sampler(u0, t1);
      const e3u = Math.hypot(c10[0] - c00[0], c10[1] - c00[1], c10[2] - c00[2]);
      const e3t = Math.hypot(c01[0] - c00[0], c01[1] - c00[1], c01[2] - c00[2]);
      const cellShort3D = Math.min(e3u, e3t);
      const faStats = (globalThis as { __pfFeatureAlignedStats?: { tried: number; improved: number } })
        .__pfFeatureAlignedStats;
      if (faStats) faStats.tried++;
      const aligned = triangulateFeatureAlignedCell(
        { boundary, interior: survivingInterior, constraints: cellConstraints },
        sampler as FeatureSampler3D,
        { targetEdgeMm: 0.45 * cellShort3D, minEdgeDist: STEINER_MIN_EDGE_DIST },
      );
      if (aligned !== null && worstMin3D(aligned, sampler as FeatureSampler3D) >
          worstMin3D(result, sampler as FeatureSampler3D) + 1e-9) {
        result = aligned;
        if (faStats) faStats.improved++;
      }
    }
    // ── Tier-2 interior quality refinement (opt-in via options.sampler) ──
    // Only on REAL feature cells (data.feature — those carrying inserted feature
    // segments), NOT registry-passive neighbours. Inserts strictly-interior
    // off-center Steiner points (computed in the 3D surface metric) to raise the
    // min interior angle of the per-cell CDT fill, which inserts ZERO quality
    // Steiner points itself. The boundary + constraints are replayed UNCHANGED, so
    // the registry-shared perimeter is invariant; STEINER_MIN_EDGE_DIST keeps every
    // Steiner ≥ 2·WELD_TAU clear of every side so the downstream weld cannot fuse it
    // across a shared edge. No-op without a sampler ⇒ the clean styles are untouched.
    // SUPPRESSED when the strip-pave graft is active (it owns the feature cells).
    if (!featureAlignedOn && sampler !== undefined && data.feature) {
      result = refineCellInterior(
        { input: { boundary, interior: survivingInterior, constraints: cellConstraints }, result },
        sampler,
        { angleBar: THETA_MIN, cap: MAX_STEINER_PER_CELL, minEdgeDist: STEINER_MIN_EDGE_DIST },
      );
    }
    const globalOf = result.points.map((p) => vertexIndex(p.u, p.t));
    // Every feature-cell triangle (incl. any Tier-2 refined replacement set)
    // comes from the per-cell CDT fill.
    curTag = TRI_SOURCE.FCT_FEATURE_CDT;
    for (const [a, b, c] of result.triangles) emit(globalOf[a], globalOf[b], globalOf[c]);
  }

  const n = vu.length;
  const remap = new Int32Array(n);
  for (let i = 0; i < n; i++) remap[i] = i;

  const weldStart = devTriTiming ? performance.now() : 0;
  const emitMs = devTriTiming ? weldStart - emitStart : 0;

  // ── Tolerance weld of float-jitter duplicates (NOT a crash/crack repair) ──
  // A feature sample that lands within float-epsilon of a cell edge can be
  // represented two ways across the two cells (a snapped sample vs a clip
  // crossing), ~1e-8 apart in (u,t). The exact QSCALE dedup may keep them as
  // two indices; the downstream 3D weld (1e-4 mm) would then merge them and
  // collapse a triangle. WELD_TAU (1e-6) is FAR below the minimum legitimate
  // mesh-vertex spacing (~1e-4 at the deepest level), so this can only fuse
  // numerically-coincident representations of the SAME point — it cannot merge
  // distinct geometry or paper over a real gap. Spatial-hash with a neighbour
  // sweep so a jitter straddling a bucket boundary still merges.
  const WELD_TAU = 1e-6;
  const weldBuckets = new Map<string, number[]>();
  const bk = (u: number, t: number): string => `${Math.floor(u / WELD_TAU)}:${Math.floor(t / WELD_TAU)}`;
  for (let i = 0; i < n; i++) {
    const bu = Math.floor(vu[i] / WELD_TAU);
    const bt = Math.floor(vt[i] / WELD_TAU);
    let canon = -1;
    for (let du = -1; du <= 1 && canon < 0; du++) {
      for (let dt = -1; dt <= 1 && canon < 0; dt++) {
        const arr = weldBuckets.get(`${bu + du}:${bt + dt}`);
        if (!arr) continue;
        for (const j of arr) {
          if (Math.abs(vu[j] - vu[i]) <= WELD_TAU && Math.abs(vt[j] - vt[i]) <= WELD_TAU) {
            canon = j;
            break;
          }
        }
      }
    }
    if (canon >= 0) {
      remap[i] = canon;
    } else {
      const key = bk(vu[i], vt[i]);
      let arr = weldBuckets.get(key);
      if (!arr) { arr = []; weldBuckets.set(key, arr); }
      arr.push(i);
    }
  }

  const seamCloseStart = devTriTiming ? performance.now() : 0;
  const weldMs = devTriTiming ? seamCloseStart - weldStart : 0;

  // ── Close the seam: merge the u=1 column into the u=0 column (as plain) ──
  // Operate on welded canonicals so the seam twin lookup is jitter-free.
  const zeroByT = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (remap[i] === i && Math.round(vu[i] * QSCALE) === 0) {
      zeroByT.set(Math.round(vt[i] * QSCALE), i);
    }
  }
  for (let i = 0; i < n; i++) {
    const r = remap[i];
    if (Math.round(vu[r] * QSCALE) === QSCALE) {
      const twin = zeroByT.get(Math.round(vt[r] * QSCALE));
      if (twin !== undefined) remap[i] = twin;
    }
  }

  const newIndexOf = new Int32Array(n).fill(-1);
  const keptU: number[] = [];
  const keptT: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = remap[i];
    if (newIndexOf[r] === -1) {
      newIndexOf[r] = keptU.length;
      keptU.push(vu[r]);
      keptT.push(vt[r]);
    }
  }

  // Remap triangles; drop any that became degenerate when two of their vertices
  // welded together (their geometric area was already ~0). The provenance tags
  // are filtered in lockstep so they stay parallel to the surviving triangles.
  const outIndices: number[] = [];
  const outSeam: number[] = [];
  const outSource: number[] = [];
  for (let k = 0; k < indices.length; k += 3) {
    const a = newIndexOf[remap[indices[k]]];
    const b = newIndexOf[remap[indices[k + 1]]];
    const c = newIndexOf[remap[indices[k + 2]]];
    // LOCKSTEP: any future per-triangle channel must be pushed in this same loop body.
    if (a === b || b === c || a === c) continue;
    outIndices.push(a, b, c);
    outSeam.push(triWrapsSeam[k / 3]);
    outSource.push(triSource[k / 3]);
  }

  const vertices = new Float32Array(keptU.length * 3);
  for (let i = 0; i < keptU.length; i++) {
    vertices[i * 3] = keptU[i];
    vertices[i * 3 + 1] = keptT[i];
    vertices[i * 3 + 2] = 0;
  }

  // OPT-IN fan-consistency post-pass (E-2026-07-11-TIERC-HEADTOHEAD Arm A2's
  // fallback remedy). Runs ONCE, on the fully welded/seam-closed mesh. Default
  // 'off' (or any other policy) never reaches this — byte-identical output.
  let finalIndices = outIndices;
  let finalSeam = outSeam;
  let finalSource = outSource;
  if (multiCurveCellPolicy === 'fanRepair') {
    const repaired = fanConsistencyRepair(outIndices, outSeam, outSource, keptU, keptT);
    finalIndices = repaired.indices;
    finalSeam = repaired.seam;
    finalSource = repaired.source;
  }

  const seamCloseMs = devTriTiming ? performance.now() - seamCloseStart : 0;

  return {
    vertices,
    indices: Uint32Array.from(finalIndices),
    seamTriangles: Uint8Array.from(finalSeam),
    cdtStats,
    triangleSource: Uint8Array.from(finalSource),
    stageTiming: devTriTiming
      ? { prepMs, registryMs, emitMs, weldMs, seamCloseMs }
      : undefined,
  };
}
