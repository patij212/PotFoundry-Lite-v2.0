// _tierc_p2_5c.test.ts — Curved-Element Phase-2 program, arm P2.5c: ADJUDICATE the P2.5b
// `worstLevel`-stuck-at-11 smoking gun. Is the Gyroid knee un-closable because it is a genuine
// K2/curved-element sliver floor, OR because the P2.5b escalation NEVER reached the worst cell?
//
// WHAT P2.5b MEASURED (research/exchange/tierc/p2_5b_summary.json + p2_5b_residuals.ndjson):
//   The single worst residual facet IS the knee (u,t)=(0.29138,0.71997): worst 0.02506, level 11,
//   COMMANDED 13, contourCrossed=FALSE, minAngle 13.03° (NOT a sliver), cause coverage-miss-intersects.
//   1935 OTHER cells escalated to L12/L13, yet worstLevel stayed 11 across all 3 rounds.
//
// SOURCE-LEVEL ROOT CAUSE (read, not assumed):
//   ConformingWall.ts:124-126 + :847,:852 — `featureLevelAt` (the levelAt seam) is consulted ONLY on
//   cells that first pass the `intersects` gate, and that gate is built from the band-edge featureLines
//   (`buildFeatureIntersector(refineLines)`). PeriodicBalancedQuadtree.ts:718 short-circuits:
//     if (!hitTest()) return false;   // off-contour ⇒ levelAt NEVER read ⇒ cell stays at metric level
//   The knee cell is OFF the band-edge contour (contourCrossed=false), so no `featureLevelAt` command —
//   however large — can drive it deeper. That is a targeting/coverage limitation of P2.5b's realization,
//   NOT (yet) proof of an irreducible curved-element floor.
//
// HYPOTHESIS (this arm): once the worst cell's OWN containing quadtree cell is genuinely driven deep
// (up to maxLevel 16) via the committed levelAt seam, the knee chord closes to ≤0.01 — i.e. the P2.5b
// plateau is a COVERAGE bug, not a curved-element boundary.
//
// DISCRIMINATOR (test-side, NO src edit): I cannot bypass the `intersects` gate without editing
// ConformingWall/PeriodicBalancedQuadtree (forbidden). I therefore AUGMENT it: inject a tiny
// general-curve CROSS through each top-K worst (u,t) so the band-edge intersector ALSO admits those
// cells, then command them to a target level through the SAME committed `featureLevelAt` seam. The
// augmentation adds a CDT constraint edge at the knee, which could itself close the chord independent
// of depth — so a CONTROL arm (augment ONLY, target=featureLevel 11, no deep escalation) separates
// "the constraint closes it" from "the depth closes it", and a level 12..16 SWEEP yields the
// chord-vs-level h-convergence curve that distinguishes coverage-bug (chord drops through 0.01) from
// curved-element-boundary (chord PLATEAUS above 0.01 even at L16).
//
// PRE-REGISTERED VERDICT GATE (stated BEFORE running):
//   COVERAGE-BUG-CONFIRMED  iff the knee facet is measurably driven to level ≥15 AND its worst ≤ 0.01,
//                           nonMan==0. (Attribute constraint-vs-depth via the CONTROL arm.)
//   CURVED-ELEMENT-BOUNDARY iff the knee facet is driven to level ≥15 yet its worst STAYS > 0.01 —
//                           then the chord-vs-level curve + min-angle IS the irreducible-floor deliverable.
//   INCONCLUSIVE            iff the escalation still fails to move the knee facet to ≥15 (augmentation
//                           did not reach) — report why.
//   Non-vacuity: the DIRECT baseline (band-edge only, no injection) MUST reproduce worst ≈ 0.02491654.
//
// RULES: NEW FILE. Imports committed src by import — NO src edit. Dev-only; src never imports research.
// Resilience: one env-gated test; each arm's result is banked to research/exchange/tierc/p2_5c_summary.json
// the INSTANT it completes and a killed run RESUMES by skipping already-banked arms. Self-bump
// AboveNormal (Windows EcoQoS). Helpers copied verbatim from _tierc_p2_5b.test.ts (a NEW FILE cannot
// import a .test.ts) so the instrument is byte-parity with the arm being adjudicated.
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_P2_5C=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_p2_5c.config.ts
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
const ON = process.env.PF_TIERC_P2_5C === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_5c_crumbs.ndjson');
const SUMMARY_PATH = join(OUT_DIR, 'p2_5c_summary.json');
const P2_5B_RESIDUALS = join(OUT_DIR, 'p2_5b_residuals.ndjson');
const TOL = 0.01;
const NEWTON_OPTS: NewtonOpts = { seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
const BANKED_NEWTON_WORST = 0.02491654414922634;
const KNEE_U = 0.29138268584834043;
const KNEE_T = 0.719970703125;
const DENSE8 = denseBary(8);
const FEATURE_LEVEL = AF_PROD_OPTS.featureLevel; // 11
const MAX_LEVEL = AF_PROD_OPTS.maxLevel; // 16
const TEST_TIMEOUT_MS = 44 * 60 * 1000;
const HG = 2048; // hot-region centroid bucket resolution (~ level-11 cell size)
const N_TARGETS = 8; // distinct worst L11 cells to escalate (knee + near-twins)
const SWEEP_LEVELS = [12, 13, 14, 15, 16]; // per-cell escalation targets to sweep

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.5c', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch { /* a breadcrumb must never kill the run */ }
}
function heapLimitMB(): number { return Math.round(getHeapStatistics().heap_size_limit / 1048576); }
function bumpPriority(): void {
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ }
}
function wrapDu(d: number): number { return d - Math.round(d); }

// ── geometry / scoring primitives (P2.5b machinery, copied verbatim for byte-parity instrument) ──
function radialDevAt(x: number, y: number, z: number, rA: AnalyticRadiusFn, H: number): number {
  if (z < -1e-9 || z > H + 1e-9) return Infinity;
  let th = Math.atan2(y, x); if (th < 0) th += TAU;
  return Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z))));
}

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

function facetLevel(m: OuterMesh, f: number): number {
  const { ut, idx } = m;
  const ia = idx[3 * f], ib = idx[3 * f + 1], ic = idx[3 * f + 2];
  const tA = ut[3 * ia + 1], tB = ut[3 * ib + 1], tC = ut[3 * ic + 1];
  const maxT = Math.max(Math.abs(tA - tB), Math.abs(tB - tC), Math.abs(tC - tA));
  if (maxT <= 1e-9) return 99;
  return Math.max(0, Math.min(20, Math.round(-Math.log2(maxT))));
}

function facetMinAngleDeg(m: OuterMesh, f: number): number {
  const { xyz, idx } = m;
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
    if (n1 < 1e-12 || n2 < 1e-12) return 0;
    const ang = Math.acos(Math.max(-1, Math.min(1, dot / (n1 * n2)))) * 180 / Math.PI;
    if (ang < minAngle) minAngle = ang;
  }
  return minAngle;
}

let newtonCallCount = 0;
interface HotPoint { u: number; t: number; }
interface PtScore { u: number; t: number; worst: number; radial: number; level: number; minAngleDeg: number; f: number; }

/** For each hot (u,t): covering facet via centroid buckets, worst-RADIAL in 3×3 neighborhood,
 *  Newton-confirm only that one. Byte-parity with P2.5b scoreHotPointsDetailed. */
function scoreHotPoints(
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
    out.push({
      u: hp.u, t: hp.t, worst: nd, radial: bestR,
      level: facetLevel(m, bestF), minAngleDeg: facetMinAngleDeg(m, bestF), f: bestF,
    });
  }
  return out;
}

// ── sparse per-cell escalation map (P2.5b machinery, copied verbatim) ──
interface CellFlag { level: number; iu: number; it: number; target: number; cu0: number; cu1: number; ct0: number; ct1: number; tc: number; }

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
  const maxFlagT = 1 / (1 << FEATURE_LEVEL);
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

/** A tiny general-curve CROSS centered on (u,t): a horizontal + a vertical short segment that pass
 * THROUGH the point, so the band-edge intersector ALSO admits every cell (any level) containing the
 * point down to maxLevel. Interior points only (knee/near-twins are far from seams ⇒ not clipped). */
function injectedCross(u: number, t: number, uBias: number): FeatureLine[] {
  const du = 3 / (1 << (FEATURE_LEVEL + uBias)); // ~3 escalated-u-cell half-width
  const dt = 3 / (1 << FEATURE_LEVEL);           // ~3 t-cell half-width
  return [
    { kind: 'general-curve', label: 'p2_5c-cross-h', points: [{ u: u - du, t }, { u, t }, { u: u + du, t }] },
    { kind: 'general-curve', label: 'p2_5c-cross-v', points: [{ u, t: t - dt }, { u, t }, { u, t: t + dt }] },
  ];
}

/** Build the OUTER wall via buildConformingWall DIRECTLY (P2.5b buildOuterDirect, verbatim: the only
 * addition is featureLevelAt). generalCurves feeds BOTH the CDT feature edges AND the intersector. */
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

interface ArmResult {
  arm: string;
  worst: number;
  kneeWorst: number;
  kneeLevel: number;
  kneeMinAngleDeg: number;
  tris: number;
  triPct: number;
  nonMan: number;
  scored: PtScore[];
}

describe.skipIf(!ON)('P2.5c — adjudicate worstLevel-stuck-at-11: coverage bug vs curved-element floor', () => {
  it(
    'augment intersects + escalate the knee cell through the committed levelAt seam, sweep level 12..16',
    () => {
      const t0 = Date.now();
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB, targets: N_TARGETS, sweep: SWEEP_LEVELS });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA as AnalyticRadiusFn;
      const { H } = TIERC_COMMON_DIMS;
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const bandCurves: FeatureLine[] = [
        ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
        ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
      ];
      const uBias = computeUBias(
        buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256).sampler,
        bandCurves.length > 0,
      );
      crumb('bandedge-extracted', { curves: bandCurves.length, uBias });

      // ── target selection: distinct worst L11 cells from the P2.5b residuals (interior only), knee first ──
      expect(existsSync(P2_5B_RESIDUALS), `P2.5b residuals missing: ${P2_5B_RESIDUALS}`).toBe(true);
      const resid = readFileSync(P2_5B_RESIDUALS, 'utf8').trim().split('\n').map(
        (l) => JSON.parse(l) as { u: number; t: number; worst: number },
      );
      resid.sort((a, b) => b.worst - a.worst);
      const cellKeyOf = (u: number, t: number): number => {
        const iu = Math.floor(((u % 1) + 1) % 1 * (1 << (FEATURE_LEVEL + uBias)));
        const it = Math.floor(Math.min(1 - 1e-12, Math.max(0, t)) * (1 << FEATURE_LEVEL));
        return it * (1 << (FEATURE_LEVEL + uBias)) + iu;
      };
      const seen = new Set<number>();
      const targets: HotPoint[] = [{ u: KNEE_U, t: KNEE_T }];
      seen.add(cellKeyOf(KNEE_U, KNEE_T));
      const uSeamMargin = 2 / (1 << FEATURE_LEVEL);
      for (const r of resid) {
        if (targets.length >= N_TARGETS) break;
        const uu = ((r.u % 1) + 1) % 1;
        if (uu < uSeamMargin || uu > 1 - uSeamMargin || r.t < 0.02 || r.t > 0.98) continue; // clip-safe interior
        const k = cellKeyOf(r.u, r.t);
        if (seen.has(k)) continue; seen.add(k);
        targets.push({ u: r.u, t: r.t });
      }
      // hot scoring set = the target cells (the escalation subjects) + the knee, deduped already.
      const hot: HotPoint[] = targets.slice();
      const injected: FeatureLine[] = targets.flatMap((tg) => injectedCross(tg.u, tg.t, uBias));
      crumb('targets-selected', { nTargets: targets.length, injectedLines: injected.length, targets });

      // ── resumable arm bank: skip arms already present in a prior summary (killed-run resume) ──
      const armBank: Record<string, ArmResult> = {};
      if (existsSync(SUMMARY_PATH)) {
        try {
          const prior = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as { arms?: Record<string, ArmResult> };
          if (prior.arms) for (const [k, v] of Object.entries(prior.arms)) armBank[k] = v;
          crumb('resumed', { banked: Object.keys(armBank) });
        } catch { /* corrupt/partial summary ⇒ start clean */ }
      }

      let baseTris = 0;
      const kneeCellKey = cellKeyOf(KNEE_U, KNEE_T);
      const writeSummary = (status: string): void => {
        const kneeAt = (a: ArmResult | undefined): PtScore | undefined =>
          a?.scored.find((p) => cellKeyOf(p.u, p.t) === kneeCellKey);
        const convergence = SWEEP_LEVELS.map((L) => {
          const a = armBank[`esc-L${L}`];
          const kp = kneeAt(a);
          return a ? { commanded: L, kneeLevel: a.kneeLevel, kneeWorst: a.kneeWorst, worst: a.worst, triPct: a.triPct, nonMan: a.nonMan, kneeMinAngleDeg: kp?.minAngleDeg ?? a.kneeMinAngleDeg } : { commanded: L, pending: true };
        });
        writeFileSync(SUMMARY_PATH, JSON.stringify({
          experiment: 'P2.5c-ADJUDICATE-worstLevel11', at: new Date().toISOString(), status,
          seam: 'FeatureRefineSpec.levelAt via AUGMENTED intersects (injected general-curve cross)',
          rootCause: 'ConformingWall.ts:718 belowFeatureFloorTest short-circuits on !hitTest() ⇒ off-contour cell never reads featureLevelAt',
          config: { featureLevel: FEATURE_LEVEL, maxLevel: MAX_LEVEL, uBias, nTargets: targets.length, sweep: SWEEP_LEVELS, tol: TOL },
          kneeCellKey, targets, arms: armBank, convergenceCurve: convergence,
          newtonCallCount, elapsedMs: Date.now() - t0,
        }, null, 2));
      };

      const runArm = (
        arm: string, generalCurves: FeatureLine[],
        levelAt: ((u0: number, t0: number, size: number) => number) | undefined,
      ): ArmResult => {
        if (armBank[arm]) { crumb(`${arm}-skip-banked`, { worst: armBank[arm].worst }); return armBank[arm]; }
        const bstart = Date.now();
        const mesh = buildOuterDirect(rA, generalCurves, levelAt);
        const scored = scoreHotPoints(mesh, buildCentroidGrid(mesh, HG), HG, hot, rA, H);
        const nonMan = nonManRawBigStats(mesh.idx).nonMan;
        let worst = -1; for (const p of scored) if (p.worst > worst) worst = p.worst;
        const kneePt = scored.find((p) => cellKeyOf(p.u, p.t) === kneeCellKey);
        const triPct = baseTris > 0 ? 100 * (mesh.tris - baseTris) / baseTris : 0;
        const r: ArmResult = {
          arm, worst,
          kneeWorst: kneePt?.worst ?? NaN, kneeLevel: kneePt?.level ?? -1, kneeMinAngleDeg: kneePt?.minAngleDeg ?? NaN,
          tris: mesh.tris, triPct, nonMan, scored,
        };
        armBank[arm] = r;
        crumb(`${arm}-done`, {
          worst, kneeWorst: r.kneeWorst, kneeLevel: r.kneeLevel, kneeMinAngle: r.kneeMinAngleDeg,
          tris: mesh.tris, triPct, nonMan, buildMs: Date.now() - bstart, newtonCallCount,
        });
        writeSummary(`${arm}-done`);
        return r;
      };

      // ── Arm 0: DIRECT baseline (band-edge only, NO injection) — must reproduce the knee ──
      const base = runArm('baseline', bandCurves, undefined);
      baseTris = base.tris;
      base.triPct = 0; armBank['baseline'].triPct = 0;
      const baseReproduces = Math.abs(base.kneeWorst - BANKED_NEWTON_WORST) < 5e-4;
      crumb('baseline-check', { kneeWorst: base.kneeWorst, expect: BANKED_NEWTON_WORST, ok: baseReproduces });
      writeSummary('baseline-done');

      // ── Arm CONTROL: AUGMENT ONLY (inject crosses, featureLevelAt→11 floor, NO deep escalation) ──
      //    Isolates "the CDT constraint edge closes it" from "the depth closes it".
      runArm('control-augment-L11', [...bandCurves, ...injected], () => 0);

      // ── Arm ESCALATE sweep: inject crosses + command each target cell to L (12..16) ──
      for (const L of SWEEP_LEVELS) {
        const flags = targets.map((tg) => cellFlagAt(tg.u, tg.t, FEATURE_LEVEL, L, uBias));
        runArm(`esc-L${L}`, [...bandCurves, ...injected], makeSparseLevelAt(flags, uBias));
      }

      // ── VERDICT ──
      const escTop = armBank[`esc-L${MAX_LEVEL}`];
      const reached = escTop.kneeLevel >= 15;
      const closed = escTop.kneeWorst <= TOL;
      const control = armBank['control-augment-L11'];
      let verdict: string;
      if (!reached) {
        verdict = 'INCONCLUSIVE';
      } else if (closed) {
        verdict = 'COVERAGE-BUG-CONFIRMED';
      } else {
        verdict = 'CURVED-ELEMENT-BOUNDARY';
      }
      const controlClosed = control.kneeWorst <= TOL;
      const attribution = verdict === 'COVERAGE-BUG-CONFIRMED'
        ? (controlClosed ? 'constraint-edge-suffices (L11+CDT-edge already ≤0.01 ⇒ fix=add knee to feature graph)'
          : 'depth-required (only deep escalation ≤0.01 ⇒ fix=off-contour levelAt reach)')
        : 'n/a';

      writeSummary('DONE');
      crumb('DONE', {
        verdict, reached, closed, kneeLevelAtL16: escTop.kneeLevel, kneeWorstAtL16: escTop.kneeWorst,
        kneeMinAngleAtL16: escTop.kneeMinAngleDeg, controlKneeWorst: control.kneeWorst, controlClosed,
        attribution, baseKneeWorst: base.kneeWorst, elapsedMs: Date.now() - t0,
      });
      // eslint-disable-next-line no-console
      console.log(`[P2.5c] VERDICT=${verdict} kneeL16Level=${escTop.kneeLevel} kneeL16Worst=${escTop.kneeWorst} minAngle=${escTop.kneeMinAngleDeg} control=${control.kneeWorst}(closed=${controlClosed}) attribution=${attribution}`);
      const curve = SWEEP_LEVELS.map((L) => `L${L}:${armBank[`esc-L${L}`].kneeWorst.toFixed(5)}@lvl${armBank[`esc-L${L}`].kneeLevel}`).join(' ');
      // eslint-disable-next-line no-console
      console.log(`[P2.5c] chord-vs-level: base:${base.kneeWorst.toFixed(5)}@lvl${base.kneeLevel} controlL11+edge:${control.kneeWorst.toFixed(5)}@lvl${control.kneeLevel} ${curve}`);

      // Non-vacuity anchors (assertions guard the instrument; the verdict lives in the summary/crumb).
      expect(base.kneeWorst, 'direct baseline must reproduce the champion knee ~0.0249').toBeCloseTo(BANKED_NEWTON_WORST, 3);
      expect(base.nonMan, 'direct baseline must be watertight').toBe(0);
      expect(escTop.nonMan, 'escalated mesh must stay watertight (fanRepair + 2:1 balance)').toBe(0);
      expect(injected.length, 'augmentation must actually fire (non-vacuous injected lines)').toBeGreaterThan(0);
      expect(escTop.kneeLevel, 'escalation must move the knee facet deeper than the stuck-at-11 baseline').toBeGreaterThan(base.kneeLevel);
    },
    TEST_TIMEOUT_MS,
  );
});
