/**
 * snapPlacementAudit.ts — STAGE 2b SNAP/PLACEMENT AUDIT (blueprint
 * `faithfulMetricSpec` item 4, crest-elimination-blueprint.json).
 *
 * ## What this measures — TWO SEPARATE channels, never summed
 *
 * The inserted-polyline-vs-analytic-ridge deviation has two independent
 * sources, and conflating them would make the Stage-4 placement fix
 * unfalsifiable. This module keeps them in separate result objects:
 *
 *  (A) EXTRACTION ERROR (`measureExtractionError`) — the production feature
 *      extractor's polyline (FeatureLineGraph; for SuperformulaBlossom the
 *      768×320 marching-squares trace of ∂rf/∂u = 0 + 3e-4 simplification)
 *      versus the ANALYTIC true ridge from the Stage 2a machinery
 *      (`solveParamRidgeByBisection` / `sfClosedFormParamRidge` — REUSED, not
 *      re-derived). Reported in BOTH u-units and mm (lateral, perpendicular to
 *      the local crest tangent — the Stage 2a convention
 *      d = r·Δθ/√(1+(r·dθ/dz)²)), MAX + RMS, per branch + worst. Absolute
 *      counts only — NO percent fields.
 *
 *  (B) SNAP DISPLACEMENT (`measureSnapDisplacement`) — the polyline vertices
 *      the REAL FeatureConformingTriangulator ACTUALLY ends up with (after
 *      `snapToCellEdge` + `snapToAnchor` + the interior boundary weld) versus
 *      the pre-snap input polyline. The FCT input is the pre-snap polyline and
 *      its output mesh contains the post-snap vertices; pre→post vertex
 *      correspondence is recovered by NEAREST-NEIGHBOR matching inside a
 *      cornerSnap-class anisotropic search box (3× per-axis snap threshold —
 *      covering the worst observed ~2.5× compositions). Exact correspondence
 *      is NOT recoverable from production data structures (CdtStats incidents
 *      record per-cell inversion/drop counts, not snap moves; TRI_SOURCE tags
 *      triangles, not vertices), and NN matching against the REAL output needs
 *      ZERO production change. An unsnapped vertex survives essentially
 *      exactly (f32 storage floor ≈6e-8, WELD_TAU=1e-6 jitter weld), so a
 *      `numericFloor` of 2e-6 separates "snapped" from "unsnapped" honestly.
 *
 *      MATCHING PRECONDITION (NN aliasing): unique pre→post correspondence is
 *      GUARANTEED only when the pairwise INPUT-vertex spacing exceeds the
 *      search box — i.e. every input pair is separated, on at least one axis,
 *      by more than (1 + worst snap composition/searchRadiusScale) search-box
 *      half-extents. Below that, two inputs can match the same output vertex:
 *      legitimate for welds, but a CDT-DROPPED input whose NEIGHBOR's image is
 *      in range reads as a small snap and UNDERSTATES displacement.
 *      `sharedOutputMatchCount` makes this visible — nonzero means re-verify
 *      the spacing precondition before trusting the numbers. (Measured at the
 *      pinned SFB@1 config: min pairwise spacing = 1.93× the search-box edge —
 *      see stage2-snap-floor.md.)
 *
 * ## The snap rule being audited (FeatureConformingTriangulator.ts)
 *
 * `cornerSnap` (FCT.ts:261) is the absolute per-axis threshold in t; the u
 * threshold is `cornerSnapU = cornerSnap / 2^B` (FCT.ts:285). Production sets
 * `cornerSnap = 0.06 / 2^featureLevel` (ConformingWall.ts:539; featureLevel=7
 * on the conforming export path, ParametricExportComputer.ts). Every inserted
 * feature vertex passes `snapToCellEdge` (FCT.ts:329-368 — perpendicular
 * projection onto the containing cell's nearest in-range edge) and clipped
 * piece endpoints pass `snapToAnchor` (FCT.ts:641-647 — anisotropic-Chebyshev
 * snap onto cell corners / mid-edge vertices); interior points may further be
 * welded onto a boundary point within the same box (FCT.ts:849-865). Worst
 * composition ≈ a few × cornerSnap — the SNAP FLOOR the blueprint promotes to
 * a first-class work item: production amplitude gates are set at
 * max(0.02mm, the measured post-fix placement floor).
 *
 * ## Channel C — the publishable SFB@1 measurement
 *
 * `runSfbSnapFloorAudit` runs BOTH channels at the pinned production config
 * (SFB at sf_strength=1 — default strength 0 extracts NOTHING per
 * SF_CREST_MIN_STRENGTH; featureLevel 7, uBias B=2 per the Stage-0 hasFeatures
 * cap, default pot dims H=120/Rt=70/Rb=45) with the REAL extractor and the
 * REAL FCT insertion running in-process (the conforming triangulation is pure
 * CPU TypeScript). The measured numbers are published in
 * docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage2-snap-floor.md.
 *
 * Pure CPU (vitest-trusted). Production modules are imported READ-ONLY; the
 * only production-file change made for this audit is the `export` keyword on
 * ConformingWall's `clipFeaturesToBox` (behavior unchanged) so the audit can
 * run the REAL clip instead of a drift-prone mirror.
 */
import type { FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  extractAnalyticFeatures,
  sfRf,
} from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type {
  QuadtreeLike,
  QuadtreeMesh,
} from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import type { PositionSampler } from './metrics';
import type { ParamRidge, ParamRidgeBranch } from './crestLateralDeviation';
import { solveParamRidgeByBisection } from './crestLateralDeviation';

const TAU = 2 * Math.PI;

/**
 * Numeric floor (u,t units) separating a SNAPPED vertex from an UNSNAPPED one:
 * the triangulator stores vertices as Float32 (quantum ≈6e-8 at u≈1) and runs
 * a WELD_TAU=1e-6 float-jitter weld — both far below the smallest real snap
 * (cornerSnapU = 0.06/2^(featureLevel+B), ≥1e-4-class at production levels).
 */
const NUMERIC_FLOOR = 2e-6;

/** Default search-box half-extent as a multiple of cornerSnapU/T. Covers the
 *  worst observed snap composition (~2.5× cornerSnap, FCT.test.ts:323-326). */
const DEFAULT_SEARCH_RADIUS_SCALE = 3;

function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

function wrapPi(a: number): number {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x <= -Math.PI) x += TAU;
  return x;
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Signed shortest-arc u-difference a − b (periodic, in (−0.5, 0.5]). */
function sdU(a: number, b: number): number {
  let d = (a - b) % 1;
  if (d > 0.5) d -= 1;
  if (d <= -0.5) d += 1;
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel A — EXTRACTION ERROR (extractor polyline vs analytic ridge)
// ─────────────────────────────────────────────────────────────────────────────

/** Per-analytic-branch extraction-error summary (absolute, no percent). */
export interface ExtractionBranchError {
  label: string;
  kind: 'crest' | 'valley';
  /** Extracted polyline vertices matched to this branch (absolute count). */
  matchedVertexCount: number;
  /** Worst |Δu| (u-units, wrap-aware). */
  maxU: number;
  /** RMS |Δu| over the matched vertices. */
  rmsU: number;
  /** Worst lateral deviation (mm, ⊥ crest tangent — Stage 2a convention). */
  maxMm: number;
  /** RMS lateral deviation (mm). */
  rmsMm: number;
}

/** Channel-A result. Absolute counts / u-units / mm only — NO percent. */
export interface ExtractionErrorResult {
  totalPolylineVertices: number;
  matchedVertexCount: number;
  /** FINITE vertices with no analytic branch within the match window
   *  (absolute). Non-finite rejects are a separate class: `nonFiniteCount`. */
  unmatchedVertexCount: number;
  /**
   * Non-finite (NaN/Inf) polyline vertices REJECTED before matching (absolute
   * count, house style). Unguarded, a NaN vertex PASSES the branch-domain
   * check (NaN comparisons are false), captures a match candidate, and
   * poisons rms while leaving maxU/maxMm silently clean (false PASS). ANY
   * nonzero value means this channel did not see the full polyline: do not
   * gate on this result.
   */
  nonFiniteCount: number;
  branches: ExtractionBranchError[];
  /** Branch with the worst maxMm (among matched branches). */
  worstBranchLabel: string;
  /** Global worst |Δu| over all matched vertices. */
  maxU: number;
  rmsU: number;
  /** Global worst lateral deviation (mm). */
  maxMm: number;
  rmsMm: number;
  /** u-space root tolerance of the truth solver (0 for a closed form) — the
   *  reference-error bound this channel's numbers carry. */
  truthDuTol: number;
}

export interface ExtractionErrorOptions {
  /** Scale on the per-branch match window (default 1 = the branch's local
   *  half-spacing `windowU`). */
  matchWindowScale?: number;
}

interface BranchEval {
  u: number;
  windowU: number;
}

/** Interpolated branch locus at t (shortest-arc in u), or null outside its
 *  t-domain. Branch points are ordered by ascending t (solver contract). */
function branchAt(b: ParamRidgeBranch, t: number): BranchEval | null {
  const pts = b.points;
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
  const f = span > 1e-12 ? clamp01((t - p0.t) / span) : 0;
  return {
    u: wrapU(p0.u + sdU(p1.u, p0.u) * f),
    windowU: p0.windowU + (p1.windowU - p0.windowU) * f,
  };
}

/** dθ_true/dz of a branch near t, via two nearby branch points mapped through
 *  the surface (the Stage 2a tangent-correction term). */
function branchSlopeThetaPerZ(
  surface: PositionSampler,
  b: ParamRidgeBranch,
  t: number,
): number {
  const t0 = b.points[0].t;
  const t1 = b.points[b.points.length - 1].t;
  const delta = Math.max(1e-4, (t1 - t0) / 128);
  const ta = Math.max(t0, t - delta);
  const tb = Math.min(t1, t + delta);
  if (!(tb > ta)) return 0;
  const ea = branchAt(b, ta);
  const eb = branchAt(b, tb);
  if (!ea || !eb) return 0;
  const Pa = surface.position(ea.u, clamp01(ta));
  const Pb = surface.position(eb.u, clamp01(tb));
  const dz = Pb[2] - Pa[2];
  if (Math.abs(dz) < 1e-9) return 0;
  return wrapPi(Math.atan2(Pb[1], Pb[0]) - Math.atan2(Pa[1], Pa[0])) / dz;
}

/** Stage 2a lateral-mm conversion of a u-deviation at a branch point:
 *  d = |Δu| · (dθ/du) · r / √(1 + (r · dθ_true/dz)²). */
function extractionLateralMm(
  surface: PositionSampler,
  branch: ParamRidgeBranch,
  uStar: number,
  t: number,
  absDu: number,
): number {
  const tc = clamp01(t);
  const e = 1e-5;
  const Pa = surface.position(wrapU(uStar + e), tc);
  const Pb = surface.position(wrapU(uStar - e), tc);
  const dThetaDu =
    Math.abs(wrapPi(Math.atan2(Pa[1], Pa[0]) - Math.atan2(Pb[1], Pb[0]))) / (2 * e);
  const P = surface.position(wrapU(uStar), tc);
  const r = Math.hypot(P[0], P[1]);
  const slope = branchSlopeThetaPerZ(surface, branch, t);
  return (absDu * dThetaDu * r) / Math.sqrt(1 + r * slope * (r * slope));
}

/**
 * CHANNEL A — extraction error: the production extractor's polylines versus
 * the analytic true ridge (Stage 2a `ParamRidge`). Each polyline vertex is
 * matched to the analytic branch (same t-domain) with the smallest wrap-aware
 * |Δu| within the branch's local window; the deviation is reported in u-units
 * AND mm (lateral, ⊥ crest tangent), MAX + RMS, per branch + worst. Vertices
 * with no branch in window are counted absolutely as unmatched — never
 * silently dropped.
 */
export function measureExtractionError(
  lines: FeatureLine[],
  truth: ParamRidge,
  surface: PositionSampler,
  options: ExtractionErrorOptions = {},
): ExtractionErrorResult {
  const windowScale = options.matchWindowScale ?? 1;
  interface Acc {
    label: string;
    kind: 'crest' | 'valley';
    n: number;
    maxU: number;
    sumSqU: number;
    maxMm: number;
    sumSqMm: number;
  }
  const accs: Acc[] = truth.branches.map((b, i) => ({
    label: b.label ?? `${b.kind}[${i}]`,
    kind: b.kind,
    n: 0,
    maxU: 0,
    sumSqU: 0,
    maxMm: 0,
    sumSqMm: 0,
  }));

  let total = 0;
  let matched = 0;
  let nonFinite = 0;
  let gMaxU = 0;
  let gSumSqU = 0;
  let gMaxMm = 0;
  let gSumSqMm = 0;

  for (const line of lines) {
    for (const p of line.points) {
      total++;
      // CRITICAL: reject non-finite vertices LOUDLY before candidate creation
      // (house nonFiniteCount pattern — see crestLateralDeviation.ts). A NaN
      // u/t passes the branch-domain check below (NaN comparisons are false),
      // captures the first branch as a "match", and poisons rms while
      // maxU/maxMm stay silently clean — a false PASS.
      if (!Number.isFinite(p.u) || !Number.isFinite(p.t)) {
        nonFinite++;
        continue;
      }
      let best = -1;
      let bestDu = 0;
      let bestEval: BranchEval | null = null;
      for (let bi = 0; bi < truth.branches.length; bi++) {
        const ev = branchAt(truth.branches[bi], p.t);
        if (!ev) continue;
        const du = sdU(p.u, ev.u);
        if (Math.abs(du) > ev.windowU * windowScale) continue;
        if (best < 0 || Math.abs(du) < Math.abs(bestDu)) {
          best = bi;
          bestDu = du;
          bestEval = ev;
        }
      }
      if (best < 0 || bestEval === null) continue;
      matched++;
      const absDu = Math.abs(bestDu);
      const mm = extractionLateralMm(surface, truth.branches[best], bestEval.u, p.t, absDu);
      const a = accs[best];
      a.n++;
      if (absDu > a.maxU) a.maxU = absDu;
      a.sumSqU += absDu * absDu;
      if (mm > a.maxMm) a.maxMm = mm;
      a.sumSqMm += mm * mm;
      if (absDu > gMaxU) gMaxU = absDu;
      gSumSqU += absDu * absDu;
      if (mm > gMaxMm) gMaxMm = mm;
      gSumSqMm += mm * mm;
    }
  }

  const branches: ExtractionBranchError[] = accs.map((a) => ({
    label: a.label,
    kind: a.kind,
    matchedVertexCount: a.n,
    maxU: a.maxU,
    rmsU: a.n > 0 ? Math.sqrt(a.sumSqU / a.n) : 0,
    maxMm: a.maxMm,
    rmsMm: a.n > 0 ? Math.sqrt(a.sumSqMm / a.n) : 0,
  }));
  let worst = '';
  let worstMm = -1;
  for (const b of branches) {
    if (b.matchedVertexCount > 0 && b.maxMm > worstMm) {
      worstMm = b.maxMm;
      worst = b.label;
    }
  }

  return {
    totalPolylineVertices: total,
    matchedVertexCount: matched,
    unmatchedVertexCount: total - matched - nonFinite,
    nonFiniteCount: nonFinite,
    branches,
    worstBranchLabel: worst,
    maxU: gMaxU,
    rmsU: matched > 0 ? Math.sqrt(gSumSqU / matched) : 0,
    maxMm: gMaxMm,
    rmsMm: matched > 0 ? Math.sqrt(gSumSqMm / matched) : 0,
    truthDuTol: truth.duTol,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel B — SNAP DISPLACEMENT (FCT post-snap vertices vs pre-snap input)
// ─────────────────────────────────────────────────────────────────────────────

/** The FCT insertion config the audit mirrors (production law in the header). */
export interface SnapDisplacementConfig {
  /** Feature-cell quadtree level L (cell Δt = 1/2^L). */
  featureLevel: number;
  /** Anisotropy bias B (cell Δu = 1/2^(L+B); cornerSnapU = cornerSnap/2^B). */
  uBias: number;
  /** The FCT `cornerSnap` option (production: 0.06 / 2^featureLevel). */
  cornerSnap: number;
}

/** Channel-B result. Absolute counts / u,t-units / mm only — NO percent. */
export interface SnapDisplacementResult {
  /** Input polyline vertices fed to the FCT (absolute). */
  totalInsertedVertices: number;
  /** Vertices matched to an output mesh vertex inside the search box. */
  matchedCount: number;
  /** Vertices with NO output vertex inside the search box (dropped/welded
   *  beyond it — coverage loss is visible, never silent). */
  unmatchedCount: number;
  /** Matched vertices displaced beyond `numericFloor` — actually snapped. */
  snappedCount: number;
  /** Matched vertices at/below the floor — present essentially exactly. */
  unsnappedCount: number;
  /** Snapped vertices whose u-displacement exceeds the floor (absolute). */
  snappedInUCount: number;
  /** Snapped vertices whose t-displacement exceeds the floor (absolute). */
  snappedInTCount: number;
  /** Worst |Δu| (u-units, wrap-aware) over matched vertices. */
  maxAbsDu: number;
  rmsDu: number;
  /** Worst |Δt| over matched vertices. */
  maxAbsDt: number;
  rmsDt: number;
  /** Worst lateral displacement (mm, ⊥ local crest tangent). NOTE: this is
   *  the full 3D displacement's perpendicular component, so on a cusp crest it
   *  INCLUDES the radial flank drop of leaving the apex — the conservative
   *  (largest-honest) placement number. */
  maxLateralMm: number;
  rmsLateralMm: number;
  /** The worst-lateral vertex (pre-snap position + its displacement). */
  worst: { u: number; t: number; du: number; dt: number; lateralMm: number } | null;
  /**
   * Non-finite (NaN/Inf) OUTPUT mesh vertices REJECTED during bucketing
   * (absolute count, house style). Unguarded, a NaN vertex lands in an
   * unreachable "NaN:NaN" bucket and vanishes silently — invisible coverage
   * loss on the post-snap side. ANY nonzero value: do not gate on this result.
   */
  nonFiniteCount: number;
  /**
   * Inputs (beyond the first) whose matched output vertex was ALSO claimed by
   * another input, where the shared claims include a displacement beyond
   * `numericFloor` (absolute count). Two inputs may legitimately share one
   * output (a weld at ~0 distance — not counted); but a CDT-DROPPED input
   * matching its NEIGHBOR's image reads as a small snap and UNDERSTATES
   * displacement. ANY nonzero value means the spacing precondition (module
   * header) is violated or suspect: do not gate on this result.
   */
  sharedOutputMatchCount: number;
  /** The snapped/unsnapped classification floor (see NUMERIC_FLOOR). */
  numericFloor: number;
  /** Derived per-axis snap thresholds (the FCT law: cornerSnap/2^B in u). */
  cornerSnapU: number;
  cornerSnapT: number;
  /** Search-box half-extents actually used for the NN matching. */
  searchRadiusU: number;
  searchRadiusT: number;
  config: SnapDisplacementConfig;
}

export interface SnapDisplacementOptions {
  /** Search-box half-extent as a multiple of cornerSnapU/T (default 3). */
  searchRadiusScale?: number;
}

/**
 * CHANNEL B — snap displacement: nearest-neighbor match of each PRE-SNAP input
 * polyline vertex against the REAL FCT output vertex set (anisotropic
 * cornerSnap-class search box, wrap-aware in u), reporting the per-vertex
 * displacement in u/t units and in lateral mm (⊥ the local polyline tangent
 * mapped through the surface — Stage 2a convention). NN correspondence is
 * exact for surviving unsnapped vertices (they appear at distance ~0) and
 * matches a snapped/welded vertex to its actual end state; only a vertex
 * displaced beyond the search box reads as unmatched (counted absolutely).
 */
export function measureSnapDisplacement(
  mesh: Pick<QuadtreeMesh, 'vertices'>,
  inputLines: FeatureLine[],
  surface: PositionSampler,
  config: SnapDisplacementConfig,
  options: SnapDisplacementOptions = {},
): SnapDisplacementResult {
  const cornerSnapU =
    config.uBias > 0 ? config.cornerSnap / (1 << config.uBias) : config.cornerSnap;
  const cornerSnapT = config.cornerSnap;
  const scale = options.searchRadiusScale ?? DEFAULT_SEARCH_RADIUS_SCALE;
  const searchU = Math.max(cornerSnapU * scale, 1e-9);
  const searchT = Math.max(cornerSnapT * scale, 1e-9);

  // Bucket the output vertices on a (searchU × searchT) grid; query probes the
  // 3×3 neighborhood at u, u−1, u+1 so the periodic seam matches across wrap.
  const buckets = new Map<string, number[]>();
  const nVerts = mesh.vertices.length / 3;
  let nonFinite = 0;
  for (let i = 0; i < nVerts; i++) {
    const vu = mesh.vertices[i * 3];
    const vt = mesh.vertices[i * 3 + 1];
    // CRITICAL: count non-finite output vertices LOUDLY (house nonFiniteCount
    // pattern — see crestLateralDeviation.ts). Math.floor(NaN) keys an
    // unreachable "NaN:NaN" bucket, so an unguarded NaN vertex would vanish
    // silently from the matchable set.
    if (!Number.isFinite(vu) || !Number.isFinite(vt)) {
      nonFinite++;
      continue;
    }
    const key = `${Math.floor(vu / searchU)}:${Math.floor(vt / searchT)}`;
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(i);
  }
  const findNearest = (u: number, t: number): { du: number; dt: number; i: number } | null => {
    let bestI = -1;
    let bestD = Infinity;
    let bestDu = 0;
    let bestDt = 0;
    for (const shift of [0, -1, 1]) {
      const bu = Math.floor((u + shift) / searchU);
      const bt = Math.floor(t / searchT);
      for (let dbu = -1; dbu <= 1; dbu++) {
        for (let dbt = -1; dbt <= 1; dbt++) {
          const arr = buckets.get(`${bu + dbu}:${bt + dbt}`);
          if (!arr) continue;
          for (const i of arr) {
            const du = sdU(mesh.vertices[i * 3], u);
            const dt = mesh.vertices[i * 3 + 1] - t;
            if (Math.abs(du) > searchU || Math.abs(dt) > searchT) continue;
            const d = (du / searchU) * (du / searchU) + (dt / searchT) * (dt / searchT);
            if (d < bestD) {
              bestD = d;
              bestI = i;
              bestDu = du;
              bestDt = dt;
            }
          }
        }
      }
    }
    return bestI >= 0 ? { du: bestDu, dt: bestDt, i: bestI } : null;
  };

  let total = 0;
  let matched = 0;
  let snapped = 0;
  let snappedInU = 0;
  let snappedInT = 0;
  let maxAbsDu = 0;
  let sumSqDu = 0;
  let maxAbsDt = 0;
  let sumSqDt = 0;
  let maxLat = 0;
  let sumSqLat = 0;
  let worst: SnapDisplacementResult['worst'] = null;
  // Output-vertex claims for the NN-aliasing counter (sharedOutputMatchCount):
  // per matched output index, how many inputs claimed it and whether any claim
  // was displaced beyond the numeric floor.
  const claims = new Map<number, { count: number; beyondFloor: boolean }>();

  for (const line of inputLines) {
    const pts = line.points;
    for (let pi = 0; pi < pts.length; pi++) {
      total++;
      const p = pts[pi];
      const hit = findNearest(wrapU(p.u), clamp01(p.t));
      if (!hit) continue;
      matched++;
      const absDu = Math.abs(hit.du);
      const absDt = Math.abs(hit.dt);
      const beyondFloor = absDu > NUMERIC_FLOOR || absDt > NUMERIC_FLOOR;
      const claim = claims.get(hit.i);
      if (claim) {
        claim.count++;
        claim.beyondFloor = claim.beyondFloor || beyondFloor;
      } else {
        claims.set(hit.i, { count: 1, beyondFloor });
      }
      if (beyondFloor) snapped++;
      if (absDu > NUMERIC_FLOOR) snappedInU++;
      if (absDt > NUMERIC_FLOOR) snappedInT++;
      if (absDu > maxAbsDu) maxAbsDu = absDu;
      sumSqDu += absDu * absDu;
      if (absDt > maxAbsDt) maxAbsDt = absDt;
      sumSqDt += absDt * absDt;
      // Lateral mm: 3D displacement ⊥ the local polyline tangent (Stage 2a
      // convention — the along-crest component is not a placement defect).
      const pre = surface.position(wrapU(p.u), clamp01(p.t));
      const post = surface.position(
        wrapU(mesh.vertices[hit.i * 3]),
        clamp01(mesh.vertices[hit.i * 3 + 1]),
      );
      const D: [number, number, number] = [post[0] - pre[0], post[1] - pre[1], post[2] - pre[2]];
      const a = pts[Math.max(0, pi - 1)];
      const b = pts[Math.min(pts.length - 1, pi + 1)];
      const Pa = surface.position(wrapU(a.u), clamp01(a.t));
      const Pb = surface.position(wrapU(b.u), clamp01(b.t));
      const T: [number, number, number] = [Pb[0] - Pa[0], Pb[1] - Pa[1], Pb[2] - Pa[2]];
      const tl = Math.hypot(T[0], T[1], T[2]);
      const dLen2 = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
      let lat: number;
      if (tl < 1e-12) {
        lat = Math.sqrt(dLen2);
      } else {
        const along = (D[0] * T[0] + D[1] * T[1] + D[2] * T[2]) / tl;
        lat = Math.sqrt(Math.max(0, dLen2 - along * along));
      }
      if (lat > maxLat) {
        maxLat = lat;
        worst = { u: p.u, t: p.t, du: hit.du, dt: hit.dt, lateralMm: lat };
      }
      sumSqLat += lat * lat;
    }
  }

  let sharedOutputMatches = 0;
  for (const c of claims.values()) {
    if (c.count >= 2 && c.beyondFloor) sharedOutputMatches += c.count - 1;
  }

  return {
    totalInsertedVertices: total,
    matchedCount: matched,
    unmatchedCount: total - matched,
    snappedCount: snapped,
    unsnappedCount: matched - snapped,
    snappedInUCount: snappedInU,
    snappedInTCount: snappedInT,
    maxAbsDu,
    rmsDu: matched > 0 ? Math.sqrt(sumSqDu / matched) : 0,
    maxAbsDt,
    rmsDt: matched > 0 ? Math.sqrt(sumSqDt / matched) : 0,
    maxLateralMm: maxLat,
    rmsLateralMm: matched > 0 ? Math.sqrt(sumSqLat / matched) : 0,
    worst,
    nonFiniteCount: nonFinite,
    sharedOutputMatchCount: sharedOutputMatches,
    numericFloor: NUMERIC_FLOOR,
    cornerSnapU,
    cornerSnapT,
    searchRadiusU: searchU,
    searchRadiusT: searchT,
    config,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel C — the publishable SFB@1 snap-floor audit
// ─────────────────────────────────────────────────────────────────────────────

/** The pinned SFB@1 packed params (WGSL slot order; defaults + sf_strength=1 —
 *  the blueprint's pinned benchmark config: strength 0 extracts nothing).
 *  EXPORTED so sibling audits (cellTriangulationCeiling) pin the identical
 *  config — single source of truth, no drift. */
export const SFB1_PACKED: readonly number[] = [1, 6, 10, 1.2, 0.35, 0.5, 0.8, 1.4, 0.8, 0.8, 1, 1];

/** Default pot dims (state/types.ts DEFAULT_GEOMETRY: H=120, top_od=140,
 *  bottom_od=90, expn=1.1) — the r≈45-90mm wall the blueprint's 0.05-0.2mm
 *  class refers to. EXPORTED (see SFB1_PACKED). */
export const SFB_DIMS = { H: 120, Rt: 70, Rb: 45, expn: 1.1 } as const;

/** Production conforming config for SFB@1 at the default 'high' profile:
 *  featureLevel=7 (ParametricExportComputer.ts conforming branch), uBias B=2
 *  (computeUBias GATE B with the Stage-0 hasFeatures cap — measured B=2 clean,
 *  B=3 non-manifold), nRing=1024 ('high' profile → tMargin=1/nRing).
 *  EXPORTED (see SFB1_PACKED). */
export const SFB_FEATURE_LEVEL = 7;
export const SFB_UBIAS = 2;
const SFB_NRING = 1024;

/** Pinned config echo published with the measurement. */
export interface SfbSnapFloorConfig {
  styleId: 'SuperformulaBlossom';
  packedParams: number[];
  dims: { H: number; Rt: number; Rb: number; expn: number };
  featureLevel: number;
  uBias: number;
  cornerSnap: number;
  nRing: number;
  uClipMargin: number;
  tClipMargin: number;
  /** Leaves of the uniform featureLevel/B audit grid. */
  gridLeaves: number;
  /** Feature lines actually inserted after the production-mirror clip. */
  insertedLineCount: number;
}

export interface SfbSnapFloorAuditResult {
  config: SfbSnapFloorConfig;
  extraction: ExtractionErrorResult;
  snap: SnapDisplacementResult;
  /** max(0.02mm, extraction maxMm, snap maxLateralMm) — the blueprint's
   *  amplitude-gate floor input (gates are frozen at max(0.02, post-fix
   *  placement floor)). BOTH channels feed the max: post-Stage-4 the snap term
   *  may collapse below the extraction error (0.074mm-class today), and the
   *  published floor must not understate the dominant remaining channel. */
  impliedPlacementFloorMm: number;
}

/** SFB@1 wall surface: r(u,t) = r0(t)·(0.9 + 0.35·rf) at strength 1, with the
 *  default-dims base profile r0(t) = Rb + (Rt−Rb)·t^expn (geometry/profile.ts)
 *  and the production f64 `sfRf` mirror — the mm-conversion surface. */
export class SfbWallSampler implements PositionSampler {
  constructor(private readonly p: Float32Array) {}

  position(u: number, t: number): readonly [number, number, number] {
    const tc = clamp01(t);
    const r0 = SFB_DIMS.Rb + (SFB_DIMS.Rt - SFB_DIMS.Rb) * Math.pow(tc, SFB_DIMS.expn);
    const r = r0 * (0.9 + 0.35 * sfRf(wrapU(u), tc, this.p));
    const theta = TAU * u;
    return [r * Math.cos(theta), r * Math.sin(theta), tc * SFB_DIMS.H];
  }
}

/** Uniform anisotropic quadtree: 2^(L+B) columns × 2^L rows of level-L leaves —
 *  exactly the production FEATURE-cell geometry (featureLevel cells under
 *  uBias B), mirroring FeatureConformingTriangulator.test.ts. */
function uniformAnisoQuadtree(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias);
  const tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) {
    for (let iu = 0; iu < uSpan; iu++) {
      leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
    }
  }
  return { leaves: () => leaves, uBias: () => uBias };
}

/**
 * CHANNEL C — the publishable SFB@1 snap-floor measurement at the pinned
 * production config:
 *
 *  - REAL extractor: `extractAnalyticFeatures('SuperformulaBlossom', …)` at
 *    sf_strength=1 (768×320 marching squares + 3e-4 simplify, full-height
 *    crests only — the production insertion set), clipped by the PRODUCTION
 *    `clipFeaturesToBox` (imported from ConformingWall — exported for this
 *    audit) at the production margins (uMargin = 1.5/2^featureLevel,
 *    tMargin = 1/nRing — ConformingWall.ts:601-603).
 *  - REAL insertion: `triangulateQuadtreeWithFeatures` with
 *    cornerSnap = 0.06/2^featureLevel (ConformingWall.ts:539) on a uniform
 *    featureLevel=7 / B=2 grid — the exact production feature-cell geometry
 *    (production trees are adaptive, but every inserted vertex lives in a
 *    featureLevel cell, which this grid reproduces everywhere).
 *  - TRUTH: Stage 2a `solveParamRidgeByBisection` on the production f64 `sfRf`
 *    mirror (duTol 1e-6; periodicU=false — m(t) is non-integer mid-height).
 *  - mm conversion: the SFB@1 default-dims wall surface (r≈45-90mm).
 *
 * Returns both channels SEPARATELY plus the implied placement floor
 * max(0.02mm, extraction maxMm, snap maxLateralMm). Values are published in
 * stage2-snap-floor.md; tests only pin that the instrument runs.
 */
export function runSfbSnapFloorAudit(): SfbSnapFloorAuditResult {
  const p = Float32Array.from(SFB1_PACKED);
  const cornerSnap = 0.06 / (1 << SFB_FEATURE_LEVEL);
  const uMargin = 1.5 / (1 << SFB_FEATURE_LEVEL);
  const tMargin = 1 / SFB_NRING;

  const graph = extractAnalyticFeatures('SuperformulaBlossom', p, {
    H: SFB_DIMS.H,
    Rt: SFB_DIMS.Rt,
    Rb: SFB_DIMS.Rb,
  });
  const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);

  const qt = uniformAnisoQuadtree(SFB_FEATURE_LEVEL, SFB_UBIAS);
  const mesh = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });

  const surface = new SfbWallSampler(p);
  const truth = solveParamRidgeByBisection({
    value: (u: number, t: number): number => sfRf(u, t, p),
    periodicU: false,
  });

  const extraction = measureExtractionError(clipped, truth, surface);
  const snap = measureSnapDisplacement(mesh, clipped, surface, {
    featureLevel: SFB_FEATURE_LEVEL,
    uBias: SFB_UBIAS,
    cornerSnap,
  });

  return {
    config: {
      styleId: 'SuperformulaBlossom',
      packedParams: [...SFB1_PACKED],
      dims: { ...SFB_DIMS },
      featureLevel: SFB_FEATURE_LEVEL,
      uBias: SFB_UBIAS,
      cornerSnap,
      nRing: SFB_NRING,
      uClipMargin: uMargin,
      tClipMargin: tMargin,
      gridLeaves: (1 << (SFB_FEATURE_LEVEL + SFB_UBIAS)) * (1 << SFB_FEATURE_LEVEL),
      insertedLineCount: clipped.length,
    },
    extraction,
    snap,
    impliedPlacementFloorMm: Math.max(0.02, extraction.maxMm, snap.maxLateralMm),
  };
}
