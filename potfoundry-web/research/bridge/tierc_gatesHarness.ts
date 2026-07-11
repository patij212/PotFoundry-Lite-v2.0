// tierc_gatesHarness.ts — PROD-TIERC Phase-1 composite gates harness (build items 1-2).
// Spec: research/lab/tierc/gates-harness-spec.md §3 (composition + row schema §3.3 + gap list §4).
// Prereg: research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md ("Common configuration" / harness reqs).
// Architecture: research/lab/tierc/architecture-v1.md §3 S-GATES.
//
// This is a THIN COMPOSITION WRAPPER, not new metrology: every gate below calls an already-proven
// instrument (cited per-gate) rather than re-deriving the math. The one exception is two small,
// CANONICAL-LOCAL helpers (zeroAreaCount, needleCount) that the spec explicitly keeps local to this
// file until labkit.ts quiets (labkit / metrics.ts / conforming/* currently hold other sessions'
// uncommitted work — shared-file discipline, prereg "Build items gating the arms").
//
// Composition sources (see gates-harness-spec.md §1 for the validation history of each):
//   G1 forward : prescreen45 (denseBary(8), _pf_tangledKernelLib.ts) -> scoreWholeMeshInterior
//                (_pf_rebaselineRuler.ts) -> newtonNearest worst-point re-score (_gyroid_truthLib.ts).
//                Proven composition: _prod_truth.test.ts:174-256.
//   G2 reverse : buildRefLocator (_sharp3dRef.ts) dense-lattice coverage + adversarial self-check.
//                Proven composition: _prod_truth.test.ts:259-344.
//   G3/G4      : nonManRawBig (labkit.ts) for watertight; topologyMetric (src/fidelity/metrics.ts,
//                precedented import — see research/bridge/_export_perf.test.ts:11) for
//                orientation/boundary; a locally-mirrored signedTetraVolumeMm3 (no research/bridge
//                precedent for importing src/geometry/exportValidation.ts — see the FINAL REPORT/commit
//                message for this finding) for the inside-out check.
//   quality    : triangleQualityDistribution + triangleQuality3D, imported directly from
//                src/fidelity/metrics.ts (precedented by ~20 existing research/bridge files, e.g.
//                allTwentyExport.test.ts:12, honestMetrics.ts:13, _export_perf.test.ts:11).
//
// DEV-ONLY. research/ never imported by src/. Node-only (uses node:fs for the optional breadcrumb /
// ndjson-append side effects; both are opt-in — scoreAllGates is a pure function of its inputs unless
// opts.breadcrumbPath / opts.outputPath are supplied).
//
// v1.1 (post gates-harness-bench.md, 7507c19f): adds `opts.stride` — threaded VERBATIM to
// scoreWholeMeshInterior's own stride parameter (the probe's exact composition; the scorecard's own
// GothicArches shard rows carry "stride=4 ... shard=k/4" with scannedFacets = ceil(slice/4)) and echoed
// in the basis string like the probe does; adds `opts.survivorsIn` + returned `survivorsOut` +
// exported `prescreenOuterFacets` (prescreen-once for fleets); adds `g1_forward.scannedFacets` (the
// merge-precedent sum field, _prod_truth_merge.mjs). Scored semantics at default opts are UNCHANGED
// vs v1.0 — stride=1 scans the identical facet set with identical numbers; the only row-format deltas
// are the ` stride=N` basis label (probe convention — semantics-bearing, so unconditional) and the
// additive scannedFacets field.
import { appendFileSync } from 'node:fs';
import { denseBary } from './_pf_tangledKernelLib';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { newtonNearest } from './_gyroid_truthLib';
import { nonManRawBig } from './labkit';
import type { AnalyticRadiusFn } from './labkit';
import { triangleQualityDistribution, triangleQuality3D, topologyMetric } from '../../src/fidelity/metrics';

const TAU = 2 * Math.PI;

// ─────────────────────────────────────── shared shapes ───────────────────────────────────────────

/** In-memory mesh artifact shape (matches loadBinMesh's return, _pf_bvhRuler.ts:383-390). */
export interface BinMesh {
  xyz: Float32Array;
  idx: Uint32Array;
}

/**
 * LOCAL PLACEHOLDER for `StyleManifest` (architecture-v1.md §4 "Manifest v1 (minimal, code)").
 * The real manifest does not exist as code yet (gates-harness-spec.md Gap List #5 / build item 3,
 * out of scope for this build arm's items 1-2) — this mirrors the documented shape narrowly enough
 * for scoreAllGates to consume the two fields it actually uses (truth.bridgeClass, budget.maxFullTris)
 * and "degrade gracefully" (per the spec's §3.2 comment) when omitted.
 */
export interface StyleManifest {
  styleId: string;
  truth: { rA: AnalyticRadiusFn; bridgeClass: 'exact' | 'hash-int' | 'KNOWN-BROKEN' };
  anatomy?: (params: unknown, dims: unknown) => unknown;
  ruler?: 'radial-newton' | 'ds-composite-v11g' | 'k2-interior';
  budget?: { maxOuterTris: number; maxFullTris: number };
  gates?: { g7scope: 'full-pot' | 'patch-NA' };
}

/**
 * The style-truth input. Extends the spec's `{styleId, rA, H}` sketch with optional Rb/Rt/expn so the
 * row's `dims` field (H/Rb/Rt/expn, per the TANGLED_BASE convention, _prod_truth.test.ts:34) can be
 * populated — the spec's proposed signature didn't carry these, and the row schema needs them; a
 * genuine ambiguity resolved here (see FINAL REPORT). Rb/Rt/expn are `null` in the row when omitted,
 * never fabricated.
 */
export interface StyleTruth {
  styleId: string;
  rA: AnalyticRadiusFn;
  H: number;
  Rb?: number;
  Rt?: number;
  expn?: number;
}

export interface ScoreAllGatesOpts {
  /** Outlier tolerance (mm). Default 0.01. */
  tolMm?: number;
  /** PF_PT_SHARD convention. Falls back to process.env.PF_PT_SHARD, then 0. */
  shard?: number;
  /** PF_PT_NSHARDS convention. Falls back to process.env.PF_PT_NSHARDS, then 1. */
  nShards?: number;
  /** PF_PT_BREADCRUMB convention. Falls back to process.env.PF_PT_BREADCRUMB. Unset = writes nothing. */
  breadcrumbPath?: string;
  /** FAST-HONEST-RULER prescreen lever. Default true (gates-harness-spec.md §3.2). */
  prescreen?: boolean;
  /** Row identifier. Default: a generated timestamp+random id. */
  runId?: string;
  /** When set, appends the finished row as one ndjson line to this path (opt-in; pure otherwise). */
  outputPath?: string;
  /**
   * TEST/DEV override for G2's sample-lattice resolution. Production runs MUST omit this to match the
   * proven composition (gates-harness-spec.md §3.3 g2_reverse.basis: "lattice1024x1024") — the default
   * below IS that exact resolution. Exists because the 1024x1024 (1,048,576-query) scan is a fixed
   * per-call cost independent of mesh size, which would make a synthetic-mesh TDD suite slow; overriding
   * it changes only sample density, not the algorithm (the same relationship as scoreWholeMeshInterior's
   * own `stride` parameter).
   */
  g2Lattice?: { nu: number; nt: number };
  /**
   * TEST/DEV override for G1 stage-2's brute-confirm grid resolution, passed straight through to
   * `scoreWholeMeshInterior`'s own `brute` option (_pf_rebaselineRuler.ts) — NOT a new lever, just
   * exposing an existing one. Production runs MUST omit this to match the proven composition's default
   * (1024x120, tuned for real tangled-lattice styles). Omitting it is always safe: `scoreWholeMeshInterior`
   * only invokes the brute grid at all on facets whose cheap GN screen exceeds `gnScreen` (genuine
   * candidates), so this only changes the COST of confirming a real candidate, never which facets get
   * flagged as outliers (same non-correctness-changing relationship as g2Lattice above).
   */
  g1Brute?: { nTheta?: number; nZ?: number; zBandMm?: number; refineIters?: number };
  /**
   * Outer-wall `seamTriangles` tag (tierC/index.ts's toOuterWallResult, per-face). When supplied,
   * populates g7_assembly.outerWallSeamTriangleCount; otherwise that field stays null (spec §3.3).
   */
  outerWallSeamTriangles?: ArrayLike<number>;
  /**
   * G1 interior stride (default 1): threaded VERBATIM to `scoreWholeMeshInterior`'s own `stride`
   * parameter — score every stride-th facet of THIS shard's stage-2 population (survivor-ordinal
   * striding, exactly the probe's PF_PT_STRIDE composition; see the GothicArches scorecard rows whose
   * basis reads "stride=4 ... shard=k/4" with scannedFacets = ceil(sliceSize/4)). Echoed in
   * `g1_forward.basis` as ` stride=N` (unconditional, probe convention). stride=1 is byte-identical
   * to the unstrided path. stride>1 rows are labeled SUBSAMPLE rows: outliers/max are exact over the
   * scanned subsample (`scannedFacets`), same semantics as the probe's own stride>1 rows — never an
   * acceptance basis (prereg honesty rail: "stratified estimates never serve as acceptance bases").
   * NOTE (deliberate deviation from a literal reading of the v1.1 mission item 3): the PRESCREEN stage
   * is NOT strided. (1) The prescreen population defines the survivor set — striding it would create a
   * NEW sampling basis no proven run has used (the probe strides survivors, never the screen), breaking
   * "exactly like the probe does". (2) Raw-facet-id striding collides with the raw-id shard filter when
   * gcd(stride, nShards) > 1 (the fleet's own 4/4 config would starve shards 1-3). (3) The prescreen
   * cost motive is served by survivorsIn/prescreenOuterFacets (prescreen ONCE per fleet, not per shard).
   */
  stride?: number;
  /**
   * PRESCREEN-ONCE (fleet lever): a precomputed prescreen45 survivor list (GLOBAL outer-facet ids,
   * ascending) — e.g. a prior run's `survivorsOut` or a direct `prescreenOuterFacets()` call over the
   * SAME outer bins / rA / H / tolMm. When supplied, the prescreen stage is SKIPPED entirely and this
   * list is the stage-2 population (then shard-filtered by raw id + strided by the ruler, exactly as a
   * fresh prescreen's survivors would be). The basis string is unchanged (same prescreen45 population
   * definition — reuse is an execution detail, not a semantics change); the caller owns the contract
   * that the list actually came from the same screen. Takes precedence over `prescreen`.
   */
  survivorsIn?: Uint32Array | ArrayLike<number>;
}

/**
 * scoreAllGates' return: the ndjson row PLUS (when a prescreen ran fresh, or echoing survivorsIn) the
 * full unsharded survivor list, so a fleet coordinator can prescreen once and fan out shards with
 * `survivorsIn`. `survivorsOut` is attached AFTER the optional `opts.outputPath` append — it never
 * appears in the ndjson file, only on the in-memory return value.
 */
export interface ScoreAllGatesResult extends GatesRow {
  survivorsOut?: Uint32Array;
}

// ─────────────────────────────────────── row schema (spec §3.3) ──────────────────────────────────

export interface GatesRowG1Forward {
  basis: string;
  nFacets: number;
  survivors: number;
  /**
   * Facets actually scored by stage 2 (= this shard's survivor slice reduced by stride) — the probe's
   * own `interior.scannedFacets` field; SUMS across shards in a merge (_prod_truth_merge.mjs
   * precedent: "outlier counts and scanned-facet counts sum").
   */
  scannedFacets: number;
  outliers: number;
  maxMm: number;
  p50Mm: number;
  p90Mm: number;
  p99Mm: number;
  newtonWorstMm: number | null;
  vertexOnSurfP99Mm: number | null;
  rulerPremiseOk: boolean | null;
  ms: number;
}

export interface GatesRowG2Reverse {
  basis: string;
  maxMm: number | null;
  p99Mm: number | null;
  p50Mm: number | null;
  overCount: number | null;
  boundary: { p99Mm: number | null; maxMm: number | null };
  locatorCellMm: number | null;
  locatorSelfCheckMaxMm: number | null;
  ms: number | null;
}

export interface GatesRowG3Watertight {
  weldToleranceMm: number;
  nonManRaw: number | null;
  nonManControlMoved: boolean | null;
  orientationMismatches: number | null;
  signedVolumeMm3: number | null;
  insideOut: boolean | null;
  ms: number | null;
}

export interface GatesRowG4ZeroDefect {
  areaFloorMm2: number;
  zeroAreaCount: number | null;
  degenerateCount: number | null;
  ms: number | null;
}

export interface GatesRowG5Bridging {
  detectorRecall: number | null;
  detectorPrecision: number | null;
  residualCrossings: number | null;
  constraintRecoveryFailed: number | null;
  verdict: 'OPEN';
  ms: number;
}

export interface GatesRowG6Budget {
  triangleCount: number;
  policyMaxTris: number;
  withinTriBudget: boolean;
  generateMs: number | null;
  assembleWatertightMs: number | null;
  peakMemoryMB: number | null;
  estimatedFileSizeBytes: number;
  withinSizeBudget: boolean;
}

export interface GatesRowG7Assembly {
  wholeMeshBoundaryEdges: number | null;
  outerWallSeamTriangleCount: number | null;
  seamSpecificCheck: 'OPEN';
  rimCheck: 'OPEN';
  baseCheck: 'OPEN';
  capCheck: 'OPEN';
  innerOuterStitchCheck: 'OPEN';
}

export interface GatesRowQuality {
  basis: string;
  minAngleDeg: number;
  p5MinAngleDeg: number;
  medianMinAngleDeg: number;
  pctBelow10: number;
  pctBelow20: number;
  pctBelow30: number;
  maxAspect3D: number;
  sliverCount: number;
  degenerateCount: number;
  needleCount: number;
}

export interface GatesRow {
  runId: string;
  at: string;
  style: string;
  dims: { H: number; Rb: number | null; Rt: number | null; expn: number | null };
  tolMm: number;
  shard: number;
  nShards: number;
  merged: boolean;
  truthBridge: { ok: boolean | null; note: string | null };
  g1_forward: GatesRowG1Forward;
  g2_reverse: GatesRowG2Reverse;
  g3_watertight: GatesRowG3Watertight;
  g4_zeroDefect: GatesRowG4ZeroDefect;
  g5_bridging: GatesRowG5Bridging;
  g6_budget: GatesRowG6Budget;
  g7_assembly: GatesRowG7Assembly;
  quality: GatesRowQuality;
  totalMs: number;
}

// ─────────────────────────────────────── local canonical helpers ─────────────────────────────────
// Kept local per the mission's explicit instruction: labkit.ts / metrics.ts hold other sessions'
// uncommitted work, so these are NOT promoted there yet (gates-harness-spec.md Gap List #1/#9).

/**
 * Zero-area triangle count. Mirrors research/bridge/_prod_truth.test.ts's module-private
 * `zeroAreaCount` (not exported there, hence re-derived here rather than imported) with an explicit
 * `areaFloorMm2` parameter (gates-harness-spec.md Gap List #1: 4 disagreeing thresholds found across
 * the codebase; this harness canonicalizes on 1e-12, matching 3 of 4 existing call sites and
 * src/geometry/exportValidation.ts / src/fidelity/metrics.ts's own convention).
 */
export function zeroAreaCount(xyz: Float32Array, idx: Uint32Array, areaFloorMm2 = 1e-12): number {
  let zero = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const abx = xyz[b] - xyz[a], aby = xyz[b + 1] - xyz[a + 1], abz = xyz[b + 2] - xyz[a + 2];
    const acx = xyz[c] - xyz[a], acy = xyz[c + 1] - xyz[a + 1], acz = xyz[c + 2] - xyz[a + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (0.5 * Math.hypot(cx, cy, cz) <= areaFloorMm2) zero++;
  }
  return zero;
}

/**
 * needleCount = sliverCount - degenerateCount: the finite-area high-aspect-needle count, the
 * documented print-usable concession class (metrics.ts:640-646, E-2026-07-09-EXPORT-PERF) — positive
 * area, watertight, slicer-safe, as distinct from a genuine zero-area mesh defect. Exposed as a
 * first-class field per gates-harness-spec.md §2 / Gap List #9 (previously an implicit subtraction
 * callers had to know to do).
 */
export function needleCount(q: { sliverCount: number; degenerateCount: number }): number {
  return q.sliverCount - q.degenerateCount;
}

/**
 * Signed mesh volume (mm^3), summed per-triangle signed tetrahedron volume from the origin. Mirrors
 * src/geometry/exportValidation.ts's private `signedTetraVolumeMm3` (per-triangle formula) summed over
 * all faces, reimplemented locally: no research/bridge file imports src/geometry/exportValidation.ts
 * today (checked; unlike src/fidelity/metrics.ts, which IS an established research->src import path —
 * see the FINAL REPORT for this finding), so this follows the same "reimplement + cite" rule the
 * mission applied to zeroAreaCount/needleCount rather than opening a new, unprecedented import boundary.
 * A closed, outward-oriented mesh has positive signed volume; <=0 is the inside-out signature.
 */
function signedVolumeMm3Of(xyz: Float32Array, idx: Uint32Array): number {
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
    const ax = xyz[i0 * 3], ay = xyz[i0 * 3 + 1], az = xyz[i0 * 3 + 2];
    const bx = xyz[i1 * 3], by = xyz[i1 * 3 + 1], bz = xyz[i1 * 3 + 2];
    const cx = xyz[i2 * 3], cy = xyz[i2 * 3 + 1], cz = xyz[i2 * 3 + 2];
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
}

/** Binary-STL size estimate (84-byte header + 50 bytes/triangle), mirrors exportValidation.ts's constants. */
function estimatedBinaryStlBytes(triangleCount: number): number {
  return 84 + triangleCount * 50;
}
const HARD_MAX_EXPORT_BYTES = 1024 * 1024 * 1024; // mirrors exportValidation.ts:15

interface PctStats { max: number; p99: number; p50: number; n: number; over: number }

/** Percentile/outlier stats over the first `n` entries of `devs`. Mirrors _prod_truth.test.ts:66-80
 * (module-private there, hence re-derived — same reasoning as zeroAreaCount above). */
function pctStats(devs: Float64Array, n: number, tol: number): PctStats {
  const a = devs.subarray(0, n).slice();
  a.sort();
  let over = 0;
  for (let i = n - 1; i >= 0 && a[i] > tol; i--) over++;
  return {
    max: n ? a[n - 1] : 0,
    p99: n ? a[Math.min(n - 1, Math.floor(0.99 * n))] : 0,
    p50: n ? a[Math.floor(0.5 * n)] : 0,
    n,
    over,
  };
}

/** Builds a new idx array containing only the triangles at the given GLOBAL facet indices. */
function buildFacetSubset(idx: Uint32Array, facetIds: number[]): Uint32Array {
  const out = new Uint32Array(facetIds.length * 3);
  for (let i = 0; i < facetIds.length; i++) {
    const f = facetIds[i];
    out[i * 3] = idx[f * 3];
    out[i * 3 + 1] = idx[f * 3 + 1];
    out[i * 3 + 2] = idx[f * 3 + 2];
  }
  return out;
}

function countNonZero(a: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== 0) n++;
  return n;
}

/**
 * The FAST-HONEST-RULER prescreen45 as a standalone, reusable pass: dense 45-pt (denseBary(8))
 * same-(u,t) RADIAL upper bound per facet — a facet whose whole lattice is radially <= tolMm is
 * proven green on the same dense basis the acceptance guard uses (radial >= true nearest), so
 * outlier count and max over the returned SURVIVORS are exact-equivalent to scoring every facet
 * (_prod_truth.test.ts:40-43 / :174-208, reproduced verbatim; loop-local aliases hoisted, a pure
 * refactor). Returns the survivor facet ids (ascending, GLOBAL outer-facet indices) — feed to
 * `scoreAllGates` via `opts.survivorsIn` to prescreen ONCE for a whole shard fleet.
 */
export function prescreenOuterFacets(
  outer: BinMesh,
  rA: AnalyticRadiusFn,
  H: number,
  tolMm = 0.01,
  onTick?: (scanned: number, of: number, survivorsSoFar: number) => void,
): Uint32Array {
  const oXyz = outer.xyz, oIdx = outer.idx;
  const nF = oIdx.length / 3;
  const bary = denseBary(8); // the 45-pt acceptance lattice (>=36 mandated)
  const survivors: number[] = [];
  const tick = Math.max(1, Math.floor(nF / 10));
  for (let f = 0; f < nF; f++) {
    if (onTick && f % tick === 0) onTick(f, nF, survivors.length);
    const a = oIdx[f * 3] * 3, b = oIdx[f * 3 + 1] * 3, c = oIdx[f * 3 + 2] * 3;
    let green = true;
    for (const [wa, wb, wc] of bary) {
      const x = wa * oXyz[a] + wb * oXyz[b] + wc * oXyz[c];
      const y = wa * oXyz[a + 1] + wb * oXyz[b + 1] + wc * oXyz[c + 1];
      const z = wa * oXyz[a + 2] + wb * oXyz[b + 2] + wc * oXyz[c + 2];
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      if (Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z)))) > tolMm) {
        green = false;
        break;
      }
    }
    if (!green) survivors.push(f);
  }
  return Uint32Array.from(survivors);
}

// ─────────────────────────────────────── entry point ─────────────────────────────────────────────

/**
 * Scores every Tier-C gate for one (style, shard) against already-loaded mesh bins, composing the
 * existing proven instruments (see the file header for the source of each gate). Pure function of its
 * inputs unless `opts.breadcrumbPath` / `opts.outputPath` are supplied (both opt-in side effects).
 *
 * Sharding (gates-harness-spec.md §3.4): G1 stage 2/3 and `quality` are facet-sharded
 * (`f % nShards === shard`, keyed on the GLOBAL facet index so a union of all shards' results
 * reproduces the unsharded run exactly); G2/G3/G4/G1's vertexOnSurf premise run shard-0-only and are
 * `null` on other shards. Config/threshold fields (weldToleranceMm, areaFloorMm2, tolMm, basis
 * strings) are always populated regardless of shard — only RESULT fields go null.
 */
export function scoreAllGates(
  bins: { full: BinMesh; outer: BinMesh },
  styleTruth: StyleTruth,
  manifestRow: StyleManifest | undefined,
  opts: ScoreAllGatesOpts = {},
): ScoreAllGatesResult {
  const t0 = Date.now();
  const tolMm = opts.tolMm ?? 0.01;
  const shard = Math.max(0, opts.shard ?? Number(process.env.PF_PT_SHARD ?? 0));
  const nShards = Math.max(1, opts.nShards ?? Number(process.env.PF_PT_NSHARDS ?? 1));
  const shard0 = shard === 0;
  const prescreen = opts.prescreen ?? true;
  const crumbPath = opts.breadcrumbPath ?? process.env.PF_PT_BREADCRUMB ?? '';
  const { rA, H } = styleTruth;

  let lastTickAt = Date.now();
  function crumb(stage: string, extra?: Record<string, unknown>): void {
    if (!crumbPath) return;
    try {
      appendFileSync(
        crumbPath,
        JSON.stringify({
          style: styleTruth.styleId, shard, nShards, stage, pid: process.pid,
          at: new Date().toISOString(), ...extra,
        }) + '\n',
      );
    } catch {
      /* breadcrumbs must never kill the run */
    }
  }
  crumb('start');

  // ── G1 forward: prescreen45 -> scoreWholeMeshInterior(stride) -> newtonNearest (worst point) ────
  const tG1 = Date.now();
  const nFOuter = bins.outer.idx.length / 3;
  const stride = Math.max(1, Math.floor(opts.stride ?? 1));
  let survivorsTotal: number;
  let survivorsFresh: Uint32Array | undefined; // full unsharded survivor list, when computed here
  let scoreIdx: Uint32Array;
  let prescreenBasis: boolean;
  if (opts.survivorsIn !== undefined) {
    // PRESCREEN-ONCE reuse: the caller supplies the survivor population (same prescreen45 basis,
    // computed elsewhere — e.g. prescreenOuterFacets or a prior run's survivorsOut). Shard-filter by
    // raw facet id exactly as the fresh path does.
    prescreenBasis = true;
    const sIn = opts.survivorsIn;
    survivorsTotal = sIn.length;
    const mine: number[] = [];
    for (let i = 0; i < sIn.length; i++) {
      const f = sIn[i];
      if (nShards === 1 || f % nShards === shard) mine.push(f);
    }
    scoreIdx = buildFacetSubset(bins.outer.idx, mine);
    crumb('prescreen-reused', { survivors: survivorsTotal, mine: mine.length });
  } else if (prescreen) {
    prescreenBasis = true;
    survivorsFresh = prescreenOuterFacets(bins.outer, rA, H, tolMm, (f, of, sSoFar) => {
      crumb('prescreen-tick', { pct: Math.round((f / of) * 100), survivorsSoFar: sSoFar });
    });
    survivorsTotal = survivorsFresh.length;
    const mine: number[] = [];
    for (let i = 0; i < survivorsFresh.length; i++) {
      const f = survivorsFresh[i];
      if (nShards === 1 || f % nShards === shard) mine.push(f);
    }
    scoreIdx = buildFacetSubset(bins.outer.idx, mine);
    crumb('prescreen-done', { survivors: survivorsTotal, mine: mine.length });
  } else {
    prescreenBasis = false;
    survivorsTotal = nFOuter;
    if (nShards === 1) {
      // Zero-copy fast path (probe parity for the unscreened, unsharded case: _prod_truth.test.ts
      // passes outer.idx directly). The ruler's own stride handles any stride>1.
      scoreIdx = bins.outer.idx;
    } else {
      const mine: number[] = [];
      for (let f = 0; f < nFOuter; f++) if (f % nShards === shard) mine.push(f);
      scoreIdx = buildFacetSubset(bins.outer.idx, mine);
    }
  }

  crumb('interior-start', { toScore: Math.ceil(scoreIdx.length / 3 / stride), stride });
  const interior = scoreWholeMeshInterior(bins.outer.xyz, scoreIdx, rA, H, {
    tol: tolMm,
    stride,
    brute: opts.g1Brute,
    onProgress: (done, total, nOut, worst) => {
      if (Date.now() - lastTickAt > 30_000) {
        lastTickAt = Date.now();
        crumb('interior-tick', { done, total, out: nOut, worst: +worst.toFixed(4) });
      }
    },
  });
  // Basis assembled AFTER the ruler so the stride label is the ruler's own echo (probe convention:
  // "upperBound(min(GN,brute)) stride=N ..." — the number the run actually used, not the request).
  let g1Basis =
    (prescreenBasis ? 'prescreen45(dense-radial-upperBound) -> ' : '') +
    `scoreWholeMeshInterior(GNscreen+bruteConfirm-if-gn>5x) stride=${interior.stride}` +
    ' -> newtonNearest(worstPointOnly)';
  if (nShards > 1) g1Basis += ` shard=${shard}/${nShards}`;
  crumb('interior-done', { outliers: interior.interiorOutliers, max: +interior.wholeMeshMaxMm.toFixed(6) });

  let newtonWorstMm: number | null = null;
  if (interior.worstFacet >= 0 && interior.wholeMeshMaxMm > 0) {
    const [wx, wy, wz] = interior.worstXyz;
    const nw = newtonNearest(rA, H, wx, wy, wz, {
      seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
    });
    newtonWorstMm = Math.min(interior.wholeMeshMaxMm, nw.dist);
  }
  crumb('newton-done', { newtonWorstMm });

  // vertexOnSurf premise check (shard-0-only, gates-harness-spec.md §3.4).
  let vertexOnSurfP99Mm: number | null = null;
  let rulerPremiseOk: boolean | null = null;
  if (shard0) {
    const nV = bins.outer.xyz.length / 3;
    const vDev = new Float64Array(nV);
    for (let v = 0; v < nV; v++) {
      const x = bins.outer.xyz[v * 3], y = bins.outer.xyz[v * 3 + 1];
      const z = Math.min(H, Math.max(0, bins.outer.xyz[v * 3 + 2]));
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      vDev[v] = Math.abs(Math.hypot(x, y) - rA(th, z));
    }
    const vStats = pctStats(vDev, nV, tolMm);
    vertexOnSurfP99Mm = vStats.p99;
    rulerPremiseOk = vStats.p99 <= tolMm;
    crumb('vertexOnSurf-done', { p99: vertexOnSurfP99Mm, premiseOk: rulerPremiseOk });
  }

  const g1_forward: GatesRowG1Forward = {
    basis: g1Basis,
    nFacets: nFOuter,
    survivors: survivorsTotal,
    scannedFacets: interior.scannedFacets,
    outliers: interior.interiorOutliers,
    maxMm: interior.wholeMeshMaxMm,
    p50Mm: interior.p50,
    p90Mm: interior.p90,
    p99Mm: interior.p99,
    newtonWorstMm,
    vertexOnSurfP99Mm,
    rulerPremiseOk,
    ms: Date.now() - tG1,
  };

  // ── G2 reverse coverage (shard-0-only) ───────────────────────────────────────────────────────────
  let g2_reverse: GatesRowG2Reverse;
  const NU = opts.g2Lattice?.nu ?? 1024;
  const NT = opts.g2Lattice?.nt ?? 1024;
  const bandMm = 0.5;
  const g2Basis = `lattice${NU}x${NT} + 4x-local-refine, boundaryBands(${bandMm}mm)-separated`;
  if (shard0) {
    const tG2 = Date.now();
    const nVOuter = bins.outer.xyz.length / 3;
    const nFOuterRef = bins.outer.idx.length / 3;
    const refXyz = new Float64Array(bins.outer.xyz.length);
    for (let i = 0; i < bins.outer.xyz.length; i++) refXyz[i] = bins.outer.xyz[i];
    const ref: RefMesh = { xyz: refXyz, idx: bins.outer.idx, nV: nVOuter, nF: nFOuterRef };
    let edgeSum = 0;
    const eSamples = Math.min(2000, nFOuterRef);
    for (let s = 0; s < eSamples; s++) {
      const t = Math.floor((s / eSamples) * nFOuterRef) * 3;
      const a = bins.outer.idx[t] * 3, b = bins.outer.idx[t + 1] * 3;
      edgeSum += Math.hypot(
        bins.outer.xyz[b] - bins.outer.xyz[a],
        bins.outer.xyz[b + 1] - bins.outer.xyz[a + 1],
        bins.outer.xyz[b + 2] - bins.outer.xyz[a + 2],
      );
    }
    const cell = Math.max(0.4, Math.min(3.0, (edgeSum / Math.max(1, eSamples)) * 4));
    const loc = buildRefLocator(ref, cell);
    const cov = new Float64Array(NU * NT);
    let covN = 0;
    let worstU = 0, worstT = 0, worstD = -1;
    for (let j = 0; j < NT; j++) {
      if (Date.now() - lastTickAt > 30_000) {
        lastTickAt = Date.now();
        crumb('coverage-tick', { row: j, of: NT });
      }
      const z = bandMm + ((H - 2 * bandMm) * j) / (NT - 1);
      for (let i = 0; i < NU; i++) {
        const th = (TAU * i) / NU;
        const r = rA(th, z);
        const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
        cov[covN++] = d;
        if (d > worstD) { worstD = d; worstU = th / TAU; worstT = z / H; }
      }
    }
    let refinedMax = worstD;
    const du = 1 / NU, dt = (H - 2 * bandMm) / (NT - 1) / H;
    for (let j = -8; j <= 8; j++) {
      for (let i = -8; i <= 8; i++) {
        const u = worstU + (i * du) / 4;
        const z = Math.min(H - bandMm, Math.max(bandMm, (worstT + (j * dt) / 4) * H));
        const th = (((u % 1) + 1) % 1) * TAU;
        const r = rA(th, z);
        refinedMax = Math.max(refinedMax, loc.dist(r * Math.cos(th), r * Math.sin(th), z));
      }
    }
    const covStats = pctStats(cov, covN, tolMm);
    const bDev = new Float64Array(NU * 4);
    let bN = 0;
    for (const z of [bandMm * 0.5, bandMm * 0.25, H - bandMm * 0.5, H - bandMm * 0.25]) {
      for (let i = 0; i < NU; i++) {
        const th = (TAU * i) / NU;
        const r = rA(th, z);
        bDev[bN++] = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
      }
    }
    let locSelfCheckMax = 0;
    for (let s = 0; s < 24; s++) {
      const th = (TAU * ((s * 79) % 1024)) / 1024;
      const z = bandMm + (H - 2 * bandMm) * (((s * 131) % 997) / 997);
      const r = rA(th, z);
      const px = r * Math.cos(th), py = r * Math.sin(th);
      locSelfCheckMax = Math.max(locSelfCheckMax, Math.abs(loc.dist(px, py, z) - loc.bruteDist(px, py, z)));
    }
    const boundStats = pctStats(bDev, bN, tolMm);
    g2_reverse = {
      basis: g2Basis,
      maxMm: refinedMax,
      p99Mm: covStats.p99,
      p50Mm: covStats.p50,
      overCount: covStats.over,
      boundary: { p99Mm: boundStats.p99, maxMm: boundStats.max },
      locatorCellMm: cell,
      locatorSelfCheckMaxMm: locSelfCheckMax,
      ms: Date.now() - tG2,
    };
    crumb('coverage-done', { max: refinedMax });
  } else {
    g2_reverse = {
      basis: g2Basis,
      maxMm: null, p99Mm: null, p50Mm: null, overCount: null,
      boundary: { p99Mm: null, maxMm: null },
      locatorCellMm: null, locatorSelfCheckMaxMm: null, ms: null,
    };
  }

  // ── G3 watertight + G4 zero-defect (shard-0-only; share one topologyMetric call) ───────────────
  const weldToleranceMm = 1e-4; // labkit default (architecture-v1.md Decision A4)
  const areaFloorMm2 = 1e-12; // canonical (architecture-v1.md Decision A4)
  let g3_watertight: GatesRowG3Watertight;
  let g4_zeroDefect: GatesRowG4ZeroDefect;
  let wholeMeshBoundaryEdges: number | null = null;
  if (shard0) {
    const tG3 = Date.now();
    const nonMan = nonManRawBig(bins.full.idx);
    // Internal non-vacuity control: inject a duplicate use of an existing triangle's edges and verify
    // the count moves (mirrors _prod_truth.test.ts:137-142's "NON-VACUOUS injected-crack control").
    const cracked = new Uint32Array(bins.full.idx.length + 3);
    cracked.set(bins.full.idx);
    cracked.set([bins.full.idx[0], bins.full.idx[1], bins.full.idx[2]], bins.full.idx.length);
    const crackedCount = nonManRawBig(cracked);
    const nonManControlMoved = crackedCount > nonMan;

    const fullView = { vertices: bins.full.xyz, indices: bins.full.idx };
    const topo = topologyMetric(fullView, weldToleranceMm);
    const signedVolumeMm3 = signedVolumeMm3Of(bins.full.xyz, bins.full.idx);
    // Simplified mirror of exportValidation.ts's "inside-out" gate, restricted to the signals this
    // row already carries in g3 (topology + volume); degenerate/invalid-index checks live in
    // g4_zeroDefect as their own independent signal rather than folded into this boolean (keeps the
    // per-gate rows independently queryable, per the composite harness's own design goal).
    const insideOut = nonMan === 0 && topo.boundaryEdges === 0 && topo.orientationMismatches === 0
      && signedVolumeMm3 <= 0;

    g3_watertight = {
      weldToleranceMm,
      nonManRaw: nonMan,
      nonManControlMoved,
      orientationMismatches: topo.orientationMismatches,
      signedVolumeMm3,
      insideOut,
      ms: Date.now() - tG3,
    };
    wholeMeshBoundaryEdges = topo.boundaryEdges;
    crumb('watertight-done', { nonMan, nonManControlMoved, orientationMismatches: topo.orientationMismatches });

    const tG4 = Date.now();
    const za = zeroAreaCount(bins.full.xyz, bins.full.idx, areaFloorMm2);
    const q3dFull = triangleQuality3D(fullView);
    g4_zeroDefect = {
      areaFloorMm2,
      zeroAreaCount: za,
      degenerateCount: q3dFull.degenerateCount,
      ms: Date.now() - tG4,
    };
    crumb('zerodefect-done', { zeroArea: za, degenerate: q3dFull.degenerateCount });
  } else {
    g3_watertight = {
      weldToleranceMm, nonManRaw: null, nonManControlMoved: null,
      orientationMismatches: null, signedVolumeMm3: null, insideOut: null, ms: null,
    };
    g4_zeroDefect = { areaFloorMm2, zeroAreaCount: null, degenerateCount: null, ms: null };
  }

  // ── G5 bridging — no synthesized instrument exists yet (Gap List #7); always OPEN, never fabricated. ──
  const g5_bridging: GatesRowG5Bridging = {
    detectorRecall: null, detectorPrecision: null, residualCrossings: null, constraintRecoveryFailed: null,
    verdict: 'OPEN',
    ms: 0,
  };

  // ── G6 budget (cheap; computed regardless of shard) ──────────────────────────────────────────────
  const triangleCount = bins.full.idx.length / 3;
  const policyMaxTris = manifestRow?.budget?.maxFullTris ?? 10_000_000;
  const withinTriBudget = triangleCount <= policyMaxTris;
  const estimatedFileSizeBytes = estimatedBinaryStlBytes(triangleCount);
  const withinSizeBudget = estimatedFileSizeBytes <= HARD_MAX_EXPORT_BYTES;
  const g6_budget: GatesRowG6Budget = {
    triangleCount, policyMaxTris, withinTriBudget,
    generateMs: null, assembleWatertightMs: null, peakMemoryMB: null, // Gap List #4/#6 — no instrument yet
    estimatedFileSizeBytes, withinSizeBudget,
  };

  // ── G7 assembly — only wholeMeshBoundaryEdges + (opt-in) outerWallSeamTriangleCount are computed. ──
  const outerWallSeamTriangleCount = opts.outerWallSeamTriangles
    ? countNonZero(opts.outerWallSeamTriangles)
    : null;
  const g7_assembly: GatesRowG7Assembly = {
    wholeMeshBoundaryEdges,
    outerWallSeamTriangleCount,
    seamSpecificCheck: 'OPEN', rimCheck: 'OPEN', baseCheck: 'OPEN', capCheck: 'OPEN',
    innerOuterStitchCheck: 'OPEN',
  };

  // ── quality: triangleQualityDistribution + triangleQuality3D, sharded by facet index on FULL mesh ──
  const tQ = Date.now();
  const nFFull = bins.full.idx.length / 3;
  const qFacetIds: number[] = [];
  for (let f = 0; f < nFFull; f++) if (nShards === 1 || f % nShards === shard) qFacetIds.push(f);
  const qIdx = buildFacetSubset(bins.full.idx, qFacetIds);
  const qView = { vertices: bins.full.xyz, indices: qIdx };
  const qDist = triangleQualityDistribution(qView);
  const q3dShard = triangleQuality3D(qView);
  let qBasis = 'triangleQualityDistribution (depth-invariant, LAB-CHEATSHEET.md:43)';
  if (nShards > 1) qBasis += ` shard=${shard}/${nShards}`;
  const quality: GatesRowQuality = {
    basis: qBasis,
    minAngleDeg: qDist.minAngleDeg,
    p5MinAngleDeg: qDist.p5MinAngleDeg,
    medianMinAngleDeg: qDist.medianMinAngleDeg,
    pctBelow10: qDist.pctBelow10,
    pctBelow20: qDist.pctBelow20,
    pctBelow30: qDist.pctBelow30,
    maxAspect3D: q3dShard.maxAspect3D,
    sliverCount: q3dShard.sliverCount,
    degenerateCount: q3dShard.degenerateCount,
    needleCount: needleCount(q3dShard),
  };
  crumb('quality-done', { ms: Date.now() - tQ });

  // ── truthBridge: manifest-classified. Absent a manifest the premise is UNVERIFIED — ok:null,
  // never trusted-by-default: the SuperformulaBlossom/WaveInterference truth-bridge failures are
  // exactly the class an optimistic default would silently score as truth-verified. 'hash-int' is
  // a VALID bridge (integer-exact by construction, post-INTHASH). g1_forward.rulerPremiseOk stays
  // the MEASURED premise check; this field is the a-priori classification.
  const bridgeClass = manifestRow?.truth?.bridgeClass;
  const truthBridge =
    bridgeClass === 'exact'
      ? { ok: true as boolean | null, note: null as string | null }
      : bridgeClass === 'hash-int'
        ? { ok: true as boolean | null, note: 'hash-int (integer-exact bridge)' as string | null }
        : bridgeClass === 'KNOWN-BROKEN'
          ? { ok: false as boolean | null, note: 'KNOWN-BROKEN' as string | null }
          : {
              ok: null as boolean | null,
              note: 'UNCLASSIFIED — no manifest bridgeClass; interior numbers not truth-verified' as
                | string
                | null,
            };

  const row: GatesRow = {
    runId: opts.runId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    style: styleTruth.styleId,
    dims: {
      H,
      Rb: styleTruth.Rb ?? null,
      Rt: styleTruth.Rt ?? null,
      expn: styleTruth.expn ?? null,
    },
    tolMm,
    shard,
    nShards,
    merged: false,
    truthBridge,
    g1_forward,
    g2_reverse,
    g3_watertight,
    g4_zeroDefect,
    g5_bridging,
    g6_budget,
    g7_assembly,
    quality,
    totalMs: Date.now() - t0,
  };

  if (opts.outputPath) {
    appendFileSync(opts.outputPath, JSON.stringify(row) + '\n');
  }
  crumb('row-append', { totalMs: row.totalMs });
  // survivorsOut attached AFTER the ndjson append — never serialized into the file. Fresh list when
  // the prescreen ran here; echo (as Uint32Array) when survivorsIn was supplied; absent otherwise
  // (prescreen:false has no survivor basis to hand out).
  const result: ScoreAllGatesResult = row;
  if (survivorsFresh) {
    result.survivorsOut = survivorsFresh;
  } else if (opts.survivorsIn !== undefined) {
    result.survivorsOut =
      opts.survivorsIn instanceof Uint32Array ? opts.survivorsIn : Uint32Array.from(opts.survivorsIn);
  }
  return result;
}
