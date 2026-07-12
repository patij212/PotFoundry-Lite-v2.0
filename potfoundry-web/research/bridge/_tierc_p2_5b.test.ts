// _tierc_p2_5b.test.ts — Curved-Element Phase-2 program, arm P2.5b (TWO-PASS VERDICT-DRIVEN per-cell
// escalation + FULL residual characterization, on the PRODUCTION kernel). Predecessor: P2.5
// (research/lab/tierc/P2.5-verdict.md) proved the `levelAt` seam is production-real (byte-identity
// hash 51a25eba-6a58e3e1 through the full assembly; nonMan 0) but its "dense-arc" targeting FAILED
// the gate: worst 0.02492 -> 0.01652 (>0.01) at +113.8% outer tris (85,106 cells escalated within a
// Chebyshev R=0.005 ball of 1,891 hot points). Residuals PERSISTED at escalated levels (after-hist
// 6@L11/134@L12/164@L13/1@L14; worstLevel 12) — depth alone did not close a sub-population.
//
// THE TWO P2.5 DEFECTS P2.5b ISOLATES:
//   (1) TARGETING (cost): dense-arc R-dilation escalated the WHOLE hot arc (85k cells). The verdict-
//       driven fix escalates ONLY the Newton-flagged outlier CELLS (expect O(100s), not 85k) — the
//       faithful production realization of P2.0's proven cell-scoped local quadrisection (+4.54%).
//   (2) CONVERGENCE (fidelity): residuals persisted at escalated levels. P2.5b re-scores after each
//       escalated rebuild and CHARACTERIZES every residual facet: level reached vs commanded,
//       contour-crossed (the `intersects` gate the seam is architecturally bound by), sliver
//       min-angle, chord decomposition — adjudicating the three P2.5-verdict candidates:
//         (a) anisotropy (uBias=1: level+1 halves BOTH the biased u-width and the t-height),
//         (b) K2 sliver floor (depth-invariant straddle facets from CDT),
//         (c) coverage miss (off-contour cells the `intersects` gate never consults, OR map misses).
//
// HYPOTHESIS: verdict-driven SPARSE per-cell escalation (escalate exactly the Newton-flagged outlier
// cells to a per-cell target, iterate ≤3 rounds folding survivors) closes the Gyroid knee hot-region
// Newton-worst 0.02492 -> ≤0.01 on the PRODUCTION kernel at ≤+10% outer tris, watertight preserved.
//
// PRE-REGISTERED GATE (stated BEFORE running):
//   PASS         iff final hot-region Newton-worst ≤ 0.01 AND outer tris ≤ +10% of direct baseline
//                AND nonMan == 0 (AND direct baseline reproduces worst ≈ 0.02491654).
//   PARTIAL      iff worst ≤ 0.01 but tris > +10% — report the true cost curve.
//   FAIL-to-close iff worst STAYS > 0.01 after ≤3 rounds — then the per-residual characterization IS
//                the deliverable: state the honest floor and where the K2/curved-element boundary sits.
//   ANY outcome MUST include the per-residual characterization table (counts per adjudicated cause).
//
// TARGETING MODEL: per-cell ΔL = clamp(ceil(log_rate(0.01 / worstChordInCell)), 1, 3). The task brief
// names log4 (rate 0.25, smooth-C2 chord ∝ 4^-ΔL). P2.0 MEASURED this knee's rate ≈ 0.46-0.59 (milder
// than smooth-C2, consistent with C1 slope-kink proximity): its worst facet needed +1 -> 0.0114 (>tol),
// +2 -> 0.00896 (closes). So round-1 uses the P2.0-CALIBRATED rate 0.55 (log4 would UNDER-target and
// waste a round); the EMPIRICAL rate is measured round-over-round and reported (headline: does the
// production kernel h-converge at the log4 expectation or the P2.0 rate?). The ≤3-round fold pushes
// each surviving locus one level deeper — a refineToZeroOutliers-style loop.
//
// RULES: NEW FILE (P2.5's test + banked artifacts untouched). Imports committed code (incl. the merged
// levelAt kernel seam) by import — NO src/ edit. DEV-ONLY; src/ never imports research/. Resilience:
// one env-gated test; breadcrumb + full-summary CHECKPOINT the INSTANT each round completes to
// research/exchange/tierc/p2_5b_crumbs.ndjson + p2_5b_summary.json (a killed run resumes by re-running;
// a killed mid-round leaves every completed round banked). Self-bump AboveNormal (Windows EcoQoS).
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_P2_5B=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_p2_5b.config.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import type { AnalyticRadiusFn } from './labkit';
import { nonManRawBigStats } from './labkit';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import {
  GBE_EXTRACT_DEFAULT, GBE_FIELD, extractBandedgeContours, contoursToFeatureLines,
} from './_gyroid_bandedge_lib';
import { newtonNearest, denseBary, type NewtonOpts } from './_gyroid_truthLib';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM } from './_analytic_floor_lib';
import { buildRegionWallGridCPU } from './tierc_regionLayer';
import { buildConformingWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildCreaseRefineLines } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_P2_5B === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_5b_crumbs.ndjson');
const SUMMARY_PATH = join(OUT_DIR, 'p2_5b_summary.json');
const RESIDUAL_PATH = join(OUT_DIR, 'p2_5b_residuals.ndjson');
const TOL = 0.01;
const NEWTON_OPTS: NewtonOpts = { seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
const BANKED_NEWTON_WORST = 0.02491654414922634;
const KNEE_U = 0.29138268584834043;
const KNEE_T = 0.719970703125;
const DENSE8 = denseBary(8);
const FEATURE_LEVEL = AF_PROD_OPTS.featureLevel; // 11
const MAX_LEVEL = AF_PROD_OPTS.maxLevel; // 16
const TEST_TIMEOUT_MS = 39 * 60 * 1000;
const HG = 2048; // hot-region centroid bucket resolution (~ level-11 cell size)
const MAX_ROUNDS = 3;
const INIT_RATE = 0.55; // P2.0-calibrated round-1 chord-reduction rate (log4=0.25 under-targets)
const SLIVER_ANGLE_DEG = 15; // min-angle threshold for the K2 sliver classification

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.5b', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch { /* a breadcrumb must never kill the run */ }
}
function heapLimitMB(): number { return Math.round(getHeapStatistics().heap_size_limit / 1048576); }
function bumpPriority(): void {
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ }
}
function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
function median(arr: number[]): number { return pct(arr, 0.5); }

// ── geometry / scoring primitives (P2.5 machinery, copied verbatim; NEW FILE cannot import a .test.ts) ──
function radialDevAt(x: number, y: number, z: number, rA: AnalyticRadiusFn, H: number): number {
  if (z < -1e-9 || z > H + 1e-9) return Infinity;
  let th = Math.atan2(y, x); if (th < 0) th += TAU;
  return Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z))));
}
/** Wrap a u-delta into (-0.5, 0.5] (periodic seam). */
function wrapDu(d: number): number { return d - Math.round(d); }
/** Reduce a u-delta into [0, 1) (periodic seam, for box-containment). */
function fracDu(d: number): number { return d - Math.floor(d); }

interface OuterMesh { xyz: Float32Array; ut: Float32Array; idx: Uint32Array; tris: number; }

function liftUtVerts(verts: Float32Array, rA: AnalyticRadiusFn, H: number): Float32Array {
  const xyz = new Float32Array(verts.length);
  for (let v = 0; v < verts.length; v += 3) {
    const u = verts[v] - Math.floor(verts[v]);
    const t = verts[v + 1];
    const theta = u * TAU, z = t * H, r = rA(theta, z);
    xyz[v] = r * Math.cos(theta); xyz[v + 1] = r * Math.sin(theta); xyz[v + 2] = z;
  }
  return xyz;
}

/** Bucket facet centroids on a G×G (u,t) grid so a hot-point query scans only nearby facets. */
function buildCentroidGrid(m: OuterMesh, G: number): Map<number, number[]> {
  const { ut, idx } = m;
  const nF = idx.length / 3;
  const grid = new Map<number, number[]>();
  for (let f = 0; f < nF; f++) {
    const ia = idx[3 * f], ib = idx[3 * f + 1], ic = idx[3 * f + 2];
    const ua = ut[3 * ia];
    const uCentroid = ua + (wrapDu(ut[3 * ib] - ua) + wrapDu(ut[3 * ic] - ua)) / 3;
    const u = ((uCentroid % 1) + 1) % 1;
    const t = (ut[3 * ia + 1] + ut[3 * ib + 1] + ut[3 * ic + 1]) / 3;
    const bu = Math.min(G - 1, Math.max(0, Math.floor(u * G)));
    const bt = Math.min(G - 1, Math.max(0, Math.floor(t * G)));
    const k = bt * G + bu;
    const arr = grid.get(k); if (arr) arr.push(f); else grid.set(k, [f]);
  }
  return grid;
}

/** worstRadial (denseBary) of facet f + winning barycentric point (for Newton confirm). */
function worstRadialOfFacet(m: OuterMesh, f: number, rA: AnalyticRadiusFn, H: number): {
  radial: number; x: number; y: number; z: number;
} {
  const { xyz, idx } = m;
  const ia = idx[3 * f], ib = idx[3 * f + 1], ic = idx[3 * f + 2];
  const ax = xyz[3 * ia], ay = xyz[3 * ia + 1], az = xyz[3 * ia + 2];
  const bx = xyz[3 * ib], by = xyz[3 * ib + 1], bz = xyz[3 * ib + 2];
  const cx = xyz[3 * ic], cy = xyz[3 * ic + 1], cz = xyz[3 * ic + 2];
  let radial = -1, wx = 0, wy = 0, wz = 0;
  for (const [wa, wb, wc] of DENSE8) {
    const x = wa * ax + wb * bx + wc * cx, y = wa * ay + wb * by + wc * cy, z = wa * az + wb * bz + wc * cz;
    const d = radialDevAt(x, y, z, rA, H);
    if (d > radial) { radial = d; wx = x; wy = y; wz = z; }
  }
  return { radial, x: wx, y: wy, z: wz };
}

/** Approximate quadtree level of facet f from its largest (u,t) t-extent (t-size = 1/2^level). */
function facetLevel(m: OuterMesh, f: number): number {
  const { ut, idx } = m;
  const ia = idx[3 * f], ib = idx[3 * f + 1], ic = idx[3 * f + 2];
  const tA = ut[3 * ia + 1], tB = ut[3 * ib + 1], tC = ut[3 * ic + 1];
  const maxT = Math.max(Math.abs(tA - tB), Math.abs(tB - tC), Math.abs(tC - tA));
  if (maxT <= 1e-9) return 99;
  return Math.max(0, Math.min(20, Math.round(-Math.log2(maxT))));
}

let newtonCallCount = 0;
interface HotPoint { f: number; u: number; t: number; }
interface PtScore { u: number; t: number; worst: number; radial: number; level: number; f: number; }

/**
 * Detailed per-hot-point score: for each hot (u,t) locate the covering facet through the centroid
 * bucket grid, take the worst-RADIAL facet in the 3×3 neighborhood (radial ≥ Newton-nearest, a proven
 * safe upper bound), Newton-confirm ONLY that one. Returns one row per hot point (worst, level, facet).
 */
function scoreHotPointsDetailed(
  m: OuterMesh, grid: Map<number, number[]>, G: number, hot: HotPoint[], rA: AnalyticRadiusFn, H: number,
): PtScore[] {
  const out: PtScore[] = [];
  for (const hp of hot) {
    const bu0 = Math.floor((((hp.u % 1) + 1) % 1) * G);
    const bt0 = Math.min(G - 1, Math.max(0, Math.floor(hp.t * G)));
    let bestF = -1, bestR = -1, bx = 0, by = 0, bz = 0;
    for (let dt = -1; dt <= 1; dt++) {
      const bt = bt0 + dt; if (bt < 0 || bt >= G) continue;
      for (let du = -1; du <= 1; du++) {
        const bu = ((bu0 + du) % G + G) % G;
        const arr = grid.get(bt * G + bu); if (!arr) continue;
        for (const f of arr) {
          const wr = worstRadialOfFacet(m, f, rA, H);
          if (wr.radial > bestR) { bestR = wr.radial; bestF = f; bx = wr.x; by = wr.y; bz = wr.z; }
        }
      }
    }
    if (bestF < 0) continue;
    const nd = bestR <= TOL ? bestR
      : (newtonCallCount++, Math.min(bestR, newtonNearest(rA, H, bx, by, bz, NEWTON_OPTS).dist));
    out.push({ u: hp.u, t: hp.t, worst: nd, radial: bestR, level: facetLevel(m, bestF), f: bestF });
  }
  return out;
}

interface Agg { worst: number; p99: number; outliers: number; scored: number; worstLevel: number; levelHist: Record<number, number>; }
function aggregate(pts: PtScore[]): Agg {
  let worst = -1, outliers = 0, worstLevel = -1;
  const vals: number[] = [];
  const levelHist: Record<number, number> = {};
  for (const p of pts) {
    levelHist[p.level] = (levelHist[p.level] ?? 0) + 1;
    vals.push(p.worst);
    if (p.worst > worst) { worst = p.worst; worstLevel = p.level; }
    if (p.worst > TOL) outliers++;
  }
  return { worst, p99: pct(vals, 0.99), outliers, scored: pts.length, worstLevel, levelHist };
}

/**
 * Build the OUTER wall via buildConformingWall DIRECTLY — mirrors EXACTLY the outer-wall opts
 * assembleWatertight feeds it (P2.5 buildOuterDirect, verbatim). `featureLevelAt` is the ONLY
 * addition — undefined ⇒ the direct baseline (reproduces the champion knee 0.0249).
 */
function buildOuterDirect(
  rA: AnalyticRadiusFn, generalCurves: FeatureLine[],
  featureLevelAt: ((u0: number, t0: number, size: number) => number) | undefined,
): OuterMesh {
  const { H } = TIERC_COMMON_DIMS;
  const outer = buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
  const creaseChoice = chooseCreaseGrid([]);
  const creaseTChoice = chooseCreaseTGrid([]);
  const helixChoice = chooseHelixGrid(0, 0, 0);
  const creaseLines = buildCreaseRefineLines(
    { styleId: 'GyroidManifold', lines: [], groundTruthCount: 0 },
    { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
  );
  const outerEfgSampler = composedWallSampler(outer.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const minUniformLevel = resolveUniformLevelOverride(
    Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level), 0,
  );
  const uBias = computeUBias(outer.sampler, generalCurves.length > 0);
  const perWallBudget = Math.max(1, Math.floor(AF_PROD_OPTS.targetTriangles / 2));
  const res = buildConformingWall(outer.sampler, {
    maxSagMm: AF_PROD_OPTS.maxSagMm,
    maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
    minEdgeMm: AF_PROD_OPTS.minEdgeMm,
    gradeRatio: AF_PROD_OPTS.gradeRatio,
    maxLevel: AF_PROD_OPTS.maxLevel,
    resU: AF_PROD_OPTS.resU,
    resT: AF_PROD_OPTS.resT,
    nRing: AF_PROD_OPTS.nRing,
    targetTriangles: perWallBudget,
    budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel,
    uBias,
    directionalRefine: false,
    surfaceId: 0,
    featureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: FEATURE_LEVEL,
    creaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    efgSampler: outerEfgSampler,
    multiCurveCellPolicy: 'fanRepair',
    featureLevelAt,
  });
  const xyz = liftUtVerts(res.vertices, rA, H);
  return { xyz, ut: res.vertices, idx: res.indices, tris: res.indices.length / 3 };
}

// ── VERDICT-DRIVEN sparse escalation map (the core P2.5b mechanism) ──
// A flag is a quadtree CELL at some level with an escalated target. The kernel calls levelAt with the
// cell LOWER CORNER (u0=iu/2^(L+B), t0=it/2^L) and size=max(uSize,tSize)=tSize=1/2^L; the actual cell
// u-width is size/2^B. levelAt returns the max target among flagged cells whose box OVERLAPS the query
// box — so a coarse ANCESTOR containing a flagged cell descends toward it, and EVERY descendant of a
// flagged cell (that the `intersects` gate still admits) is driven to the target. Overlap (not point-
// containment) escalates the WHOLE flagged cell, matching P2.0's cell-scoped uniform quadrisection.
interface CellFlag { level: number; iu: number; it: number; target: number; cu0: number; cu1: number; ct0: number; ct1: number; tc: number; }

/** The distinct base(level-11) cell key of a (u,t), at uBias B. */
function baseCellKey(u: number, t: number, uBias: number): number {
  const iu = Math.floor(((u % 1) + 1) % 1 * (1 << (FEATURE_LEVEL + uBias)));
  const it = Math.floor(Math.min(1 - 1e-12, Math.max(0, t)) * (1 << FEATURE_LEVEL));
  return it * (1 << (FEATURE_LEVEL + uBias)) + iu;
}

/** Make a CellFlag covering (u,t) at a chosen level with a target. */
function cellFlagAt(u: number, t: number, level: number, target: number, uBias: number): CellFlag {
  const eUL = level + uBias;
  const iu = Math.floor(((u % 1) + 1) % 1 * (1 << eUL));
  const it = Math.floor(Math.min(1 - 1e-12, Math.max(0, t)) * (1 << level));
  const cu0 = iu / (1 << eUL), cu1 = (iu + 1) / (1 << eUL);
  const ct0 = it / (1 << level), ct1 = (it + 1) / (1 << level);
  return { level, iu, it, target, cu0, cu1, ct0, ct1, tc: (ct0 + ct1) / 2 };
}

function makeSparseLevelAt(flags: CellFlag[], uBias: number): (u0: number, t0: number, size: number) => number {
  const sorted = flags.slice().sort((a, b) => a.tc - b.tc);
  const tcs = Float64Array.from(sorted.map((f) => f.tc));
  const maxFlagT = 1 / (1 << FEATURE_LEVEL); // flagged cells are level ≥ 11 ⇒ t-extent ≤ 1/2048
  const EPS = 1e-12;
  const lowerBound = (arr: Float64Array, x: number): number => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const uOverlap = (qu0: number, qu1: number, cu0: number, cu1: number): boolean => {
    for (const s of [-1, 0, 1]) if (qu0 + s < cu1 + EPS && qu1 + s > cu0 - EPS) return true;
    return false;
  };
  return (u0: number, t0: number, size: number): number => {
    const qU0 = u0, qU1 = u0 + size / (1 << uBias);
    const qT0 = t0, qT1 = t0 + size;
    let best = 0;
    for (let i = lowerBound(tcs, qT0 - maxFlagT - EPS); i < sorted.length && tcs[i] <= qT1 + EPS; i++) {
      const fl = sorted[i];
      if (fl.ct0 < qT1 + EPS && fl.ct1 > qT0 - EPS && uOverlap(qU0, qU1, fl.cu0, fl.cu1)) {
        if (fl.target > best) best = fl.target;
      }
    }
    return best;
  };
}

/** Per-cell target ΔL from the cell's worst chord + a chord-reduction rate. Clamp [+1,+3]. */
function deltaForWorst(worst: number, rate: number): number {
  if (worst <= TOL) return 0;
  const d = Math.ceil(Math.log(TOL / worst) / Math.log(rate));
  return Math.max(1, Math.min(3, d));
}

// ── faithful `intersects` reconstruction (ConformingWall.segHitsBox / buildFeatureIntersector), for
//    residual characterization: does the band-edge contour cross a cell's SQUARE side-`size` box? ──
function segHitsBox(au: number, at: number, bu: number, bt: number, u0: number, u1: number, t0: number, t1: number): boolean {
  const du = bu - au, dt = bt - at;
  let lo = 0, hi = 1;
  const edges: Array<[number, number]> = [[-du, au - u0], [du, u1 - au], [-dt, at - t0], [dt, t1 - at]];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-300) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > hi) return false; if (r > lo) lo = r; }
    else { if (r < lo) return false; if (r < hi) hi = r; }
  }
  return lo < hi;
}
function buildIntersector(features: FeatureLine[]): (u0: number, t0: number, size: number) => boolean {
  const BUCKET = 64;
  const buckets = new Map<number, Array<[number, number, number, number]>>();
  const key = (bu: number, bt: number): number => bt * BUCKET + bu;
  const clampB = (x: number): number => Math.max(0, Math.min(BUCKET - 1, Math.floor(x * BUCKET)));
  for (const line of features) {
    const p = line.points;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i], b = p[i + 1];
      const seg: [number, number, number, number] = [a.u, a.t, b.u, b.t];
      const bu0 = clampB(Math.min(a.u, b.u)), bu1 = clampB(Math.max(a.u, b.u));
      const bt0 = clampB(Math.min(a.t, b.t)), bt1 = clampB(Math.max(a.t, b.t));
      for (let bt = bt0; bt <= bt1; bt++) for (let bu = bu0; bu <= bu1; bu++) {
        const k = key(bu, bt); const arr = buckets.get(k); if (arr) arr.push(seg); else buckets.set(k, [seg]);
      }
    }
  }
  return (u0: number, t0: number, size: number): boolean => {
    const u1 = u0 + size, t1 = t0 + size;
    const bu0 = clampB(u0), bu1 = clampB(u1 - 1e-12), bt0 = clampB(t0), bt1 = clampB(t1 - 1e-12);
    for (let bt = bt0; bt <= bt1; bt++) for (let bu = bu0; bu <= bu1; bu++) {
      const arr = buckets.get(key(bu, bt)); if (!arr) continue;
      for (const [au, at, bvu, bvt] of arr) if (segHitsBox(au, at, bvu, bvt, u0, u1, t0, t1)) return true;
    }
    return false;
  };
}

/** Facet geometry for characterization: min interior angle (3D, deg), (u,t) extents, level. */
function facetGeom(m: OuterMesh, f: number): { minAngleDeg: number; duMax: number; dtMax: number } {
  const { xyz, ut, idx } = m;
  const ia = idx[3 * f], ib = idx[3 * f + 1], ic = idx[3 * f + 2];
  const P = [
    [xyz[3 * ia], xyz[3 * ia + 1], xyz[3 * ia + 2]],
    [xyz[3 * ib], xyz[3 * ib + 1], xyz[3 * ib + 2]],
    [xyz[3 * ic], xyz[3 * ic + 1], xyz[3 * ic + 2]],
  ];
  let minAngle = 180;
  for (let k = 0; k < 3; k++) {
    const a = P[k], b = P[(k + 1) % 3], c = P[(k + 2) % 3];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const dot = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2];
    const n1 = Math.hypot(e1[0], e1[1], e1[2]), n2 = Math.hypot(e2[0], e2[1], e2[2]);
    if (n1 < 1e-12 || n2 < 1e-12) { minAngle = 0; break; }
    const ang = Math.acos(Math.max(-1, Math.min(1, dot / (n1 * n2)))) * 180 / Math.PI;
    if (ang < minAngle) minAngle = ang;
  }
  const uA = ut[3 * ia], uB = ut[3 * ib], uC = ut[3 * ic];
  const tA = ut[3 * ia + 1], tB = ut[3 * ib + 1], tC = ut[3 * ic + 1];
  const duMax = Math.max(Math.abs(wrapDu(uA - uB)), Math.abs(wrapDu(uB - uC)), Math.abs(wrapDu(uC - uA)));
  const dtMax = Math.max(Math.abs(tA - tB), Math.abs(tB - tC), Math.abs(tC - tA));
  return { minAngleDeg: minAngle, duMax, dtMax };
}

describe.skipIf(!ON)('P2.5b — two-pass verdict-driven per-cell escalation + residual characterization', () => {
  it(
    'sparse Newton-flagged escalation closes the Gyroid knee (or an honestly-characterized floor)',
    () => {
      const t0 = Date.now();
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB, initRate: INIT_RATE, maxRounds: MAX_ROUNDS });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA as AnalyticRadiusFn;
      const { H } = TIERC_COMMON_DIMS;
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const generalCurves: FeatureLine[] = [
        ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
        ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
      ];
      const intersects = buildIntersector(generalCurves);
      crumb('bandedge-extracted', { curves: generalCurves.length, totalPts: bandedge.totalPts });

      // Banked Newton verdict: the armA3-confirmed hot (u,t). Dedup to distinct hot LOCATIONS (armA3
      // has multiple facets per fan sharing a (u,t)); the KNEE (u,t) is appended for non-vacuity.
      const armA3Path = join(OUT_DIR, 'armA3_char_confirmed.json');
      expect(existsSync(armA3Path), `banked hot population missing: ${armA3Path}`).toBe(true);
      const armA3 = JSON.parse(readFileSync(armA3Path, 'utf8')) as Array<{ f: number; u: number; t: number }>;
      const seenLoc = new Set<string>();
      const hot: HotPoint[] = [];
      for (const c of armA3) {
        const kk = `${Math.round(c.u * 1e7)}_${Math.round(c.t * 1e7)}`;
        if (seenLoc.has(kk)) continue; seenLoc.add(kk);
        hot.push({ f: c.f, u: c.u, t: c.t });
      }
      const kneeKk = `${Math.round(KNEE_U * 1e7)}_${Math.round(KNEE_T * 1e7)}`;
      if (!seenLoc.has(kneeKk)) hot.push({ f: -1, u: KNEE_U, t: KNEE_T });
      crumb('hot-loaded', { armA3Rows: armA3.length, distinctHotLocations: hot.length });

      // ── STEP 1: DIRECT baseline (production kernel, NO featureLevelAt) — must reproduce the knee ──
      const baseMesh = buildOuterDirect(rA, generalCurves, undefined);
      const uBias = computeUBias(
        buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256).sampler,
        generalCurves.length > 0,
      );
      const baseNonMan = nonManRawBigStats(baseMesh.idx).nonMan;
      crumb('baseline-built', { tris: baseMesh.tris, uBias, baseNonMan });
      const basePts = scoreHotPointsDetailed(baseMesh, buildCentroidGrid(baseMesh, HG), HG, hot, rA, H);
      const baseAgg = aggregate(basePts);
      crumb('baseline-scored', { ...baseAgg, newtonCallCount });
      const baseReproduces = Math.abs(baseAgg.worst - BANKED_NEWTON_WORST) < 5e-4;

      const rounds: Array<Record<string, unknown>> = [];
      rounds.push({
        round: 0, mode: 'direct-baseline', worst: baseAgg.worst, p99: baseAgg.p99,
        outliers: baseAgg.outliers, scored: baseAgg.scored, worstLevel: baseAgg.worstLevel,
        levelHist: baseAgg.levelHist, tris: baseMesh.tris, triPct: 0, nonMan: baseNonMan,
        escalatedFlags: 0, distinctBaseCells: 0,
      });
      const writeSummary = (final: Record<string, unknown>): void => {
        writeFileSync(SUMMARY_PATH, JSON.stringify({
          experiment: 'P2.5b-VERDICT-SPARSE', at: new Date().toISOString(),
          seam: 'FeatureRefineSpec.levelAt (ConformingWall.featureLevelAt -> PeriodicBalancedQuadtree)',
          config: { featureLevel: FEATURE_LEVEL, maxLevel: MAX_LEVEL, uBias, initRate: INIT_RATE, maxRounds: MAX_ROUNDS, tol: TOL },
          baselineReproducesKnee: { got: baseAgg.worst, expect: BANKED_NEWTON_WORST, ok: baseReproduces },
          rounds, ...final, newtonCallCount, elapsedMs: Date.now() - t0,
        }, null, 2));
      };
      writeSummary({ status: 'baseline-only' });

      // If the baseline doesn't reproduce the knee, ABORT (per mission) — the path is not faithful.
      if (!baseReproduces) {
        crumb('ABORT-baseline-mismatch', { worst: baseAgg.worst, expect: BANKED_NEWTON_WORST });
        writeSummary({ status: 'ABORT-baseline-mismatch', gate: 'ABORT' });
        expect(baseAgg.worst, 'direct baseline must reproduce the champion knee ~0.0249').toBeCloseTo(BANKED_NEWTON_WORST, 3);
        return;
      }

      // ── STEP 2: VERDICT PASS — flag distinct level-11 cells of baseline outliers, per-cell target ──
      const cellTargets = new Map<number, { u: number; t: number; target: number }>();
      for (const p of basePts) {
        if (p.worst <= TOL) continue;
        const kk = baseCellKey(p.u, p.t, uBias);
        const tgt = FEATURE_LEVEL + deltaForWorst(p.worst, INIT_RATE);
        const cur = cellTargets.get(kk);
        if (!cur || tgt > cur.target) cellTargets.set(kk, { u: p.u, t: p.t, target: tgt });
      }
      let flags: CellFlag[] = [];
      for (const { u, t, target } of cellTargets.values()) flags.push(cellFlagAt(u, t, FEATURE_LEVEL, target, uBias));
      crumb('verdict-flagged', { distinctBaseCells: flags.length, targetHist: histOfTargets(flags) });

      // ── STEP 3-4: iterate ≤3 escalated rebuilds (refineToZeroOutliers-style fold) ──
      let lastMesh = baseMesh;
      let lastPts = basePts;
      let closed = false;
      let empiricalRate = NaN;
      for (let r = 1; r <= MAX_ROUNDS; r++) {
        const levelAt = makeSparseLevelAt(flags, uBias);
        const distinctBase = new Set(flags.map((f) => (f.level === FEATURE_LEVEL ? f.it * (1 << (FEATURE_LEVEL + uBias)) + f.iu : -1))).size;
        const buildStart = Date.now();
        const mesh = buildOuterDirect(rA, generalCurves, levelAt);
        crumb(`round${r}-built`, { tris: mesh.tris, flags: flags.length, buildMs: Date.now() - buildStart });
        const pts = scoreHotPointsDetailed(mesh, buildCentroidGrid(mesh, HG), HG, hot, rA, H);
        const agg = aggregate(pts);
        const nonMan = nonManRawBigStats(mesh.idx).nonMan;
        const triPct = 100 * (mesh.tris - baseMesh.tris) / baseMesh.tris;

        // Empirical chord-reduction rate (round 1): (worst_after/worst_before)^(1/ΔL) over cells that
        // moved level, for baseline-outlier loci — the headline "does production h-converge at log4?".
        if (r === 1) {
          const rateSamples: number[] = [];
          for (let i = 0; i < pts.length; i++) {
            const w0 = basePts[i]?.worst ?? -1, w1 = pts[i].worst;
            const dL = pts[i].level - basePts[i]?.level;
            if (w0 > TOL && w1 > 1e-6 && dL >= 1) rateSamples.push(Math.pow(w1 / w0, 1 / dL));
          }
          empiricalRate = median(rateSamples);
        }

        rounds.push({
          round: r, mode: 'verdict-sparse-escalated', worst: agg.worst, p99: agg.p99,
          outliers: agg.outliers, scored: agg.scored, worstLevel: agg.worstLevel, levelHist: agg.levelHist,
          tris: mesh.tris, triDelta: mesh.tris - baseMesh.tris, triPct, nonMan,
          escalatedFlags: flags.length, distinctBaseCells: distinctBase,
          targetHist: histOfTargets(flags), empiricalRate: r === 1 ? empiricalRate : undefined,
        });
        crumb(`round${r}-scored`, {
          worst: agg.worst, p99: agg.p99, outliers: agg.outliers, worstLevel: agg.worstLevel,
          triPct, nonMan, flags: flags.length, empiricalRate: r === 1 ? empiricalRate : undefined, newtonCallCount,
        });
        writeSummary({ status: `round-${r}-done` });

        lastMesh = mesh; lastPts = pts;
        if (agg.worst <= TOL) { closed = true; break; }

        // FOLD survivors: escalate each surviving locus one level deeper than it actually REACHED
        // (self-correcting: fixes under-refinement AND pushes a reached-but-still-hot locus deeper).
        for (const p of pts) {
          if (p.worst <= TOL) continue;
          const kk = `${p.level}_${baseCellKey(p.u, p.t, uBias)}`;
          const tgt = Math.min(MAX_LEVEL, p.level + 1);
          if (!foldSeen.has(kk) || tgt > (foldSeen.get(kk) as number)) {
            foldSeen.set(kk, tgt);
            flags.push(cellFlagAt(p.u, p.t, p.level, tgt, uBias));
          }
        }
      }

      // ── STEP 5: CHARACTERIZE every residual outlier facet (from the LAST scored round) ──
      const levelAtProbe = makeSparseLevelAt(flags, uBias);
      const causeCounts: Record<string, number> = {};
      const residualRows: string[] = [];
      let charMinAngleWorst = 180;
      for (const p of lastPts) {
        if (p.worst <= TOL) continue;
        const g = facetGeom(lastMesh, p.f);
        const level = p.level;
        // commanded target = what the map assigned to the base(L11) cell covering this locus
        const l11 = cellFlagAt(p.u, p.t, FEATURE_LEVEL, 0, uBias);
        const commanded = Math.max(FEATURE_LEVEL, levelAtProbe(l11.cu0, l11.ct0, 1 / (1 << FEATURE_LEVEL)));
        // contour-crossed? (the intersects gate the seam is architecturally bound by) — SQUARE side-tSize box
        const cell = cellFlagAt(p.u, p.t, level, 0, uBias);
        const contourCrossed = intersects(cell.cu0, cell.ct0, 1 / (1 << level));
        const rPhys = rA(((p.u % 1) + 1) % 1 * TAU, Math.min(H, Math.max(0, p.t * H)));
        const duPhys = g.duMax * TAU * rPhys;
        const dtPhys = g.dtMax * H;
        let cause: string;
        if (commanded <= FEATURE_LEVEL) {
          cause = 'unflagged-by-map'; // became an outlier only in the final round (transition-induced), never flagged
        } else if (level >= commanded) {
          cause = g.minAngleDeg < SLIVER_ANGLE_DEG ? 'K2-sliver-floor' : 'rechord-floor';
        } else if (!contourCrossed) {
          cause = 'coverage-miss-intersects'; // off-contour cell the intersects gate never consults (balance-only reach)
        } else if (level >= MAX_LEVEL) {
          cause = 'clamp-maxLevel';
        } else {
          cause = 'under-refined-other';
        }
        causeCounts[cause] = (causeCounts[cause] ?? 0) + 1;
        if (g.minAngleDeg < charMinAngleWorst) charMinAngleWorst = g.minAngleDeg;
        residualRows.push(JSON.stringify({
          u: p.u, t: p.t, worst: p.worst, radial: p.radial, radialOverstate: p.radial / Math.max(1e-9, p.worst),
          level, commanded, contourCrossed, minAngleDeg: g.minAngleDeg, duPhys, dtPhys, aniso: duPhys / Math.max(1e-9, dtPhys), cause,
        }));
      }
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(RESIDUAL_PATH, residualRows.join('\n') + (residualRows.length ? '\n' : ''));
      crumb('characterized', { residualCount: residualRows.length, causeCounts, charMinAngleWorst });

      // ── GATE ──
      const finalRound = rounds[rounds.length - 1];
      const finalWorst = finalRound.worst as number;
      const finalTriPct = (finalRound.triPct as number) ?? 0;
      const finalNonMan = finalRound.nonMan as number;
      const worstOk = finalWorst <= TOL;
      const triOk = finalTriPct <= 10;
      const wtOk = finalNonMan === 0;
      const gate = worstOk && triOk && wtOk ? 'PASS'
        : (worstOk && !triOk && wtOk ? 'PARTIAL'
          : (!worstOk ? 'FAIL-to-close' : 'FAIL-other'));

      // Extrapolated full-population cost note: the scored/escalated hot set (armA3) samples ~6% of
      // the estimated ~31,114-facet hot population — the honest full-scale tri cost is ~×(1/0.06).
      const extrapTriPctFull = finalTriPct * (1 / 0.06);

      writeSummary({
        status: 'DONE', closed, gate,
        gateLegs: { worstOk, triOk, wtOk },
        final: { worst: finalWorst, triPct: finalTriPct, nonMan: finalNonMan, worstLevel: finalRound.worstLevel },
        empiricalRate, log4RateReference: 0.25, p2_0RateReference: 0.55,
        residual: { count: residualRows.length, causeCounts, worstMinAngleDeg: charMinAngleWorst },
        extrapolatedTriPctFullPopulation: extrapTriPctFull,
        residualPath: RESIDUAL_PATH,
      });
      crumb('DONE', {
        gate, closed, finalWorst, finalTriPct, finalNonMan, empiricalRate,
        residualCount: residualRows.length, causeCounts, elapsedMs: Date.now() - t0,
      });
      // eslint-disable-next-line no-console
      console.log(`[P2.5b] GATE=${gate} worst=${finalWorst} triPct=${finalTriPct.toFixed(2)} nonMan=${finalNonMan} closed=${closed} empRate=${empiricalRate} causes=${JSON.stringify(causeCounts)}`);

      // Hard NON-VACUITY anchors (PASS regardless of the fidelity verdict, per this lab's convention:
      // the gate verdict lives in the summary/crumb, the assertions only guard the instrument's validity).
      expect(baseNonMan, 'direct baseline must be watertight').toBe(0);
      expect(finalNonMan, 'escalated mesh must stay watertight (nonMan 0, fanRepair + 2:1 balance)').toBe(0);
      expect(flags.length, 'escalation must actually fire (non-vacuous flag set)').toBeGreaterThan(0);
      expect(finalWorst, 'escalation must reduce the worst below the baseline knee (direction)').toBeLessThan(BANKED_NEWTON_WORST);
    },
    TEST_TIMEOUT_MS,
  );
});

// module-scope fold memo (reset per process; the test is single-shot)
const foldSeen = new Map<string, number>();

function histOfTargets(flags: CellFlag[]): Record<number, number> {
  const h: Record<number, number> = {};
  for (const f of flags) h[f.target] = (h[f.target] ?? 0) + 1;
  return h;
}
