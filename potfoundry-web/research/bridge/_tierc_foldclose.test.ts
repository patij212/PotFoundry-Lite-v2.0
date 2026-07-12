// _tierc_foldclose.test.ts — VALIDATE the "fold" branch of the steepest-relief-locus conforming
// escalation for the GyroidManifold region-core, on the PRODUCTION kernel.
//
// CONTEXT (certified, do NOT re-derive — commit 9549e2dd, research/bridge/_tierc_chordfloor_char.test.ts,
// research/exchange/tierc/chordfloor_char.json): the GyroidManifold whole-mesh worst facet
// (window.__pfFidelity GPU-truth, ~2M-tri production mesh) is PINNED at 0.7241mm MAX @ (u=0.655,
// t=0.879) (theta=4.115, z=105.48, r=48.79). It is a smooth 2D FOLD (kappaMax -0.020/mm, across-relief
// direction nearly pure-VERTICAL dZ=0.9965), NOT a floor: across-fold sag CONVERGES O(L^2) — a 0.29mm
// across-fold edge reaches <=0.01, a 0.25mm edge ~0. The pinned point is |val|=0.15525 — just PAST the
// outer band-edge isolevel 0.15. The steepest-slope midline of the smoothstep, |val|=0.1425, was NEVER
// embedded as a featureLine: the two embedded band-edge contours (0.135, 0.15) sit at the smoothstep
// zero-slope FEET and bracket the wall, MISSING its steepest face. So the fold's worst cell is crossed
// by NO embedded contour ⇒ the production verdict-refine (general-curve 1-ring / featureLevel gate,
// architecturally bound by the `intersects` gate — P2.5c root cause) NEVER selects it ⇒ p99 dropped
// -35% (covered facets) but MAX 0.0% (this uncovered fold).
//
// HYPOTHESIS: embedding the steepest-midline |val|=0.1425 contour into the Gyroid featureLine set (as an
// extra general-curve, ADDED to the doubled band-edge pair) + driving verdict-driven SPARSE across-fold
// escalation of the pinned cell + near-twins from it CLOSES the pinned MAX facet to <=0.01 at BOUNDED tri
// cost (NOT the +113%-tri band-dilation blow-up P2.5 saw), watertight preserved.
//
// PRE-REGISTERED GATE (stated BEFORE running):
//   FOLD-CLOSEABLE                 iff mid-embed(+sparse-esc) drives the pinned cell facet to worst<=0.01
//                                  AND region-worst<=0.01 AND nonMan==0 AND added tris <= +10% of baseline.
//   COST-BLOWUP                    iff it closes (<=0.01) but added tris > +10%.
//   COVERAGE-EXTENSION-INSUFFICIENT iff the mid contour + escalation cannot drive the pinned cell facet
//                                  below 0.01 (the mid contour does not cross the worst cell / the
//                                  intersects gate never admits it even with mid embedded) — then the
//                                  cross-attribution control (inject a per-cell cross AT the pinned point)
//                                  separates "the midline is the wrong/insufficient locus" from "any
//                                  reach closes it".
//   Non-vacuity: the DIRECT baseline (band-edge only, NO mid) MUST reproduce a large pinned fold worst
//   (>=0.2 on the CPU-analytic surface — CPU under-reads the GPU 0.7241 by ~1.6x, so state the surface).
//
// METHOD: REUSE the P2.5b/c buildOuterDirect harness (buildConformingWall directly, production opts,
// featureLevel 11, band-edge contours from _gyroid_bandedge_lib) VERBATIM. Extract the mid isolevel
// (|val|=wallIsolevels.mid=0.1425) with the SAME extractIsolevel machinery the band edges use, ADD it as
// a third general-curve. Score the pinned facet (the worst facet whose centroid L11-cell == the pinned
// cell) AND the whole hot region (a +-0.05 (u,t) box) via denseBary radial + Newton-nearest confirm
// (radial >= true, a proven-safe upper bound), against the analytic truth. Arms:
//   baseline        — bands only (reproduces the fold).
//   mid-embed       — bands + mid contour, featureLevel 11, NO featureLevelAt (does the constraint edge +
//                     featureLevel coverage close it on its own?).
//   mid-esc-L{..}   — bands + mid + sparse featureLevelAt escalating pinned+twin cells to L (across-fold
//                     depth from the embedded midline).
//   mid+cross-esc   — bands + mid + a per-cell cross injected AT the pinned point + escalation
//                     (attribution control: isolates coverage-REACH from convergence).
//
// RULES: NEW FILE. Imports committed src by import — NO src/ edit. DEV-ONLY; src never imports research.
// Resilience: one env-gated test; each arm banked to research/exchange/tierc/foldclose_summary.json the
// INSTANT it completes; a killed run RESUMES by skipping banked arms. Self-bump AboveNormal (EcoQoS).
// Helpers copied verbatim from _tierc_p2_5c.test.ts (a NEW FILE cannot import a .test.ts).
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_FOLDCLOSE=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_foldclose.config.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import type { AnalyticRadiusFn } from './labkit';
import { nonManRawBigStats } from './labkit';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import {
  GBE_EXTRACT_DEFAULT, GBE_FIELD, extractBandedgeContours, extractIsolevel, contoursToFeatureLines,
} from './_gyroid_bandedge_lib';
import { wallIsolevels } from './_gyroidContourLib';
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
const ON = process.env.PF_TIERC_FOLDCLOSE === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'foldclose_crumbs.ndjson');
const SUMMARY_PATH = join(OUT_DIR, 'foldclose_summary.json');
const RESIDUAL_PATH = join(OUT_DIR, 'foldclose_region.ndjson');
const TOL = 0.01;
const NEWTON_OPTS: NewtonOpts = { seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
const PINNED_U = 0.655;
const PINNED_T = 0.879;
const HOT_DU = 0.05;             // hot-region box half-width in u
const HOT_DT = 0.05;             // hot-region box half-width in t
const CONFIRM_TOPK = 48;         // Newton-confirm the top-K worst-RADIAL in-box facets (radial >= true)
const DENSE8 = denseBary(8);
const FEATURE_LEVEL = AF_PROD_OPTS.featureLevel; // 11
const MAX_LEVEL = AF_PROD_OPTS.maxLevel; // 16
const TEST_TIMEOUT_MS = 48 * 60 * 1000;
const HG = 2048; // centroid bucket resolution (~ level-11 cell size)
const N_TARGETS = 12; // distinct worst L11 cells to escalate (pinned + near-twins)
const SWEEP_LEVELS = [12, 14, 16]; // per-cell escalation targets to sweep

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ probe: 'FOLDCLOSE', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch { /* a breadcrumb must never kill the run */ }
}
function heapLimitMB(): number { return Math.round(getHeapStatistics().heap_size_limit / 1048576); }
function bumpPriority(): void {
  try { os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); } catch { /* best effort */ }
}
function wrapDu(d: number): number { return d - Math.round(d); }

// ── geometry / scoring primitives (P2.5c machinery, copied verbatim for byte-parity instrument) ──
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

function facetCentroidUt(m: OuterMesh, f: number): { u: number; t: number } {
  const { ut, idx } = m;
  const ia = idx[3 * f], ib = idx[3 * f + 1], ic = idx[3 * f + 2];
  const ua = ut[3 * ia];
  const uCentroid = ua + (wrapDu(ut[3 * ib] - ua) + wrapDu(ut[3 * ic] - ua)) / 3;
  const u = ((uCentroid % 1) + 1) % 1;
  const t = (ut[3 * ia + 1] + ut[3 * ib + 1] + ut[3 * ic + 1]) / 3;
  return { u, t };
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

// The distinct level-11 cell key of a (u,t) at uBias B (biased-u index + t index).
function cellKeyOf(u: number, t: number, uBias: number): number {
  const iu = Math.floor(((u % 1) + 1) % 1 * (1 << (FEATURE_LEVEL + uBias)));
  const it = Math.floor(Math.min(1 - 1e-12, Math.max(0, t)) * (1 << FEATURE_LEVEL));
  return it * (1 << (FEATURE_LEVEL + uBias)) + iu;
}

interface RegionScore {
  pinnedWorst: number;      // Newton-worst among facets whose centroid L11-cell == the pinned cell
  pinnedRadial: number;
  pinnedLevel: number;      // facetLevel of that pinned-cell worst facet
  pinnedMinAngleDeg: number;
  pinnedFound: boolean;
  regionWorst: number;      // Newton-worst over the whole +-0.05 hot box (top-K radial confirmed)
  regionWorstUt: { u: number; t: number };
  regionWorstLevel: number;
  regionOutliersRadial: number; // count of in-box facets with worstRadial > TOL (radial upper bound)
  inBox: number;
}

/** Score the pinned facet + the whole hot box against the analytic truth. Single facet pass:
 *  collect in-box facets, track the pinned-cell best, Newton-confirm the top-K worst-radial. */
function scoreRegion(m: OuterMesh, rA: AnalyticRadiusFn, H: number, uBias: number): RegionScore {
  const pinCell = cellKeyOf(PINNED_U, PINNED_T, uBias);
  const nF = m.idx.length / 3;
  // pinned-cell tracking (radial pre-rank; Newton-confirm the single best after)
  let pinF = -1, pinR = -1, pinX = 0, pinY = 0, pinZ = 0;
  // in-box candidate list for region max (store facet + radial + winning point)
  const cand: Array<{ f: number; radial: number; x: number; y: number; z: number; u: number; t: number }> = [];
  let outliersRadial = 0, inBox = 0;
  for (let f = 0; f < nF; f++) {
    const c = facetCentroidUt(m, f);
    const dt = c.t - PINNED_T;
    let du = c.u - PINNED_U; du = du - Math.round(du); // periodic u
    if (Math.abs(du) > HOT_DU || Math.abs(dt) > HOT_DT) continue;
    inBox++;
    const wr = worstRadialOfFacet(m, f, rA, H);
    if (wr.radial > TOL) outliersRadial++;
    cand.push({ f, radial: wr.radial, x: wr.x, y: wr.y, z: wr.z, u: c.u, t: c.t });
    if (cellKeyOf(c.u, c.t, uBias) === pinCell && wr.radial > pinR) {
      pinR = wr.radial; pinF = f; pinX = wr.x; pinY = wr.y; pinZ = wr.z;
    }
  }
  // pinned-cell Newton confirm (radial >= true; only confirm if it actually carries residual)
  let pinnedWorst = pinR;
  if (pinF >= 0 && pinR > TOL) {
    newtonCallCount++;
    pinnedWorst = Math.min(pinR, newtonNearest(rA, H, pinX, pinY, pinZ, NEWTON_OPTS).dist);
  }
  // region max: Newton-confirm the top-K by radial (safe: true <= radial; the max true is bounded by
  // the largest radials — confirm enough to be robust).
  cand.sort((a, b) => b.radial - a.radial);
  let regionWorst = -1, rwU = PINNED_U, rwT = PINNED_T, rwF = -1;
  for (let i = 0; i < Math.min(CONFIRM_TOPK, cand.length); i++) {
    const c = cand[i];
    if (c.radial <= regionWorst) break; // no remaining radial can beat the confirmed best
    const nd = c.radial <= TOL ? c.radial
      : (newtonCallCount++, Math.min(c.radial, newtonNearest(rA, H, c.x, c.y, c.z, NEWTON_OPTS).dist));
    if (nd > regionWorst) { regionWorst = nd; rwU = c.u; rwT = c.t; rwF = c.f; }
  }
  return {
    pinnedWorst, pinnedRadial: pinR, pinnedLevel: pinF >= 0 ? facetLevel(m, pinF) : -1,
    pinnedMinAngleDeg: pinF >= 0 ? facetMinAngleDeg(m, pinF) : NaN, pinnedFound: pinF >= 0,
    regionWorst, regionWorstUt: { u: rwU, t: rwT }, regionWorstLevel: rwF >= 0 ? facetLevel(m, rwF) : -1,
    regionOutliersRadial: outliersRadial, inBox,
  };
}

// ── sparse per-cell escalation map (P2.5c machinery, copied verbatim) ──
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

/** A tiny general-curve CROSS centered on (u,t): a horizontal + a vertical short segment through the
 *  point, so the band-edge intersector ALSO admits every cell containing the point (attribution control
 *  only — isolates coverage-REACH from the midline being the right locus). */
function injectedCross(u: number, t: number, uBias: number): FeatureLine[] {
  const du = 3 / (1 << (FEATURE_LEVEL + uBias));
  const dt = 3 / (1 << FEATURE_LEVEL);
  return [
    { kind: 'general-curve', label: 'foldclose-cross-h', points: [{ u: u - du, t }, { u, t }, { u: u + du, t }] },
    { kind: 'general-curve', label: 'foldclose-cross-v', points: [{ u, t: t - dt }, { u, t }, { u, t: t + dt }] },
  ];
}

/** Build the OUTER wall via buildConformingWall DIRECTLY (P2.5c buildOuterDirect, verbatim). */
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
  score: RegionScore;
  tris: number;
  triPct: number;
  nonMan: number;
}

describe.skipIf(!ON)('FOLDCLOSE — validate the fold branch: midline-embed + sparse across-fold escalation', () => {
  it(
    'embed |val|=0.1425 steepest midline + escalate the pinned fold cell; does the pinned MAX close <=0.01?',
    () => {
      const t0 = Date.now();
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB, pinned: { u: PINNED_U, t: PINNED_T }, sweep: SWEEP_LEVELS });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA as AnalyticRadiusFn;
      const { H } = TIERC_COMMON_DIMS;
      const iso = wallIsolevels(GBE_FIELD);
      crumb('isolevels', { inner: iso.inner, outer: iso.outer, mid: iso.mid });

      // band-edge contours (baseline embedded set) — SAME as P2.5b/c
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const bandCurves: FeatureLine[] = [
        ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
        ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
      ];
      crumb('bandedge-extracted', { curves: bandCurves.length });

      // mid steepest-slope midline contour (|val|=0.1425) — the NEW feature this probe embeds
      const midExtract = extractIsolevel(iso.mid, 'bandedge-mid', rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const midCurves: FeatureLine[] = contoursToFeatureLines(midExtract.decimatedContours, 'bandedge-mid');
      const midPtCount = midCurves.reduce((n, l) => n + l.points.length, 0);
      crumb('mid-extracted', {
        curves: midCurves.length, pts: midPtCount,
        placementMaxDisp3D: midExtract.placement.maxDisp3D, placementP99: midExtract.placement.p99Disp3D,
      });

      const uBias = computeUBias(
        buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256).sampler,
        bandCurves.length > 0,
      );
      crumb('uBias', { uBias });

      // ── resumable arm bank ──
      const armBank: Record<string, ArmResult> = {};
      if (existsSync(SUMMARY_PATH)) {
        try {
          const prior = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as { arms?: Record<string, ArmResult> };
          if (prior.arms) for (const [k, v] of Object.entries(prior.arms)) armBank[k] = v;
          crumb('resumed', { banked: Object.keys(armBank) });
        } catch { /* corrupt/partial ⇒ start clean */ }
      }

      let baseTris = 0;
      const writeSummary = (status: string): void => {
        const convergence = SWEEP_LEVELS.map((L) => {
          const a = armBank[`mid-esc-L${L}`];
          return a ? {
            commanded: L, pinnedWorst: a.score.pinnedWorst, pinnedLevel: a.score.pinnedLevel,
            regionWorst: a.score.regionWorst, triPct: a.triPct, nonMan: a.nonMan,
            pinnedMinAngleDeg: a.score.pinnedMinAngleDeg,
          } : { commanded: L, pending: true };
        });
        writeFileSync(SUMMARY_PATH, JSON.stringify({
          experiment: 'FOLDCLOSE-midline-embed-across-fold-escalation', at: new Date().toISOString(), status,
          surface: 'CPU-analytic (production kernel buildConformingWall). CPU under-reads GPU ~1.6x; the '
            + 'GPU-truth pinned MAX is 0.7241mm @ (0.655,0.879).',
          mechanism: 'ADD |val|=0.1425 steepest-slope midline contour to the doubled band-edge pair (general-curve); '
            + 'sparse featureLevelAt across-fold escalation of the pinned cell + near-twins (P2.5c seam).',
          config: {
            pinned: { u: PINNED_U, t: PINNED_T }, hotBox: { du: HOT_DU, dt: HOT_DT }, featureLevel: FEATURE_LEVEL,
            maxLevel: MAX_LEVEL, uBias, nTargets: N_TARGETS, sweep: SWEEP_LEVELS, tol: TOL,
            midCurves: midCurves.length, midPts: midPtCount,
          },
          arms: armBank, convergenceCurve: convergence, newtonCallCount, elapsedMs: Date.now() - t0,
        }, null, 2));
      };

      const runArm = (
        arm: string, generalCurves: FeatureLine[],
        levelAt: ((u0: number, t0: number, size: number) => number) | undefined,
      ): ArmResult => {
        if (armBank[arm]) { crumb(`${arm}-skip-banked`, { pinnedWorst: armBank[arm].score.pinnedWorst }); return armBank[arm]; }
        const bstart = Date.now();
        const mesh = buildOuterDirect(rA, generalCurves, levelAt);
        const score = scoreRegion(mesh, rA, H, uBias);
        const nonMan = nonManRawBigStats(mesh.idx).nonMan;
        const triPct = baseTris > 0 ? 100 * (mesh.tris - baseTris) / baseTris : 0;
        const r: ArmResult = { arm, score, tris: mesh.tris, triPct, nonMan };
        armBank[arm] = r;
        crumb(`${arm}-done`, {
          pinnedWorst: score.pinnedWorst, pinnedRadial: score.pinnedRadial, pinnedLevel: score.pinnedLevel,
          pinnedMinAngle: score.pinnedMinAngleDeg, regionWorst: score.regionWorst,
          regionWorstLevel: score.regionWorstLevel, regionOutliersRadial: score.regionOutliersRadial,
          inBox: score.inBox, tris: mesh.tris, triPct, nonMan, buildMs: Date.now() - bstart, newtonCallCount,
        });
        writeSummary(`${arm}-done`);
        return r;
      };

      // ── Arm baseline: bands only (reproduce the fold) ──
      const base = runArm('baseline', bandCurves, undefined);
      baseTris = base.tris;
      base.triPct = 0; armBank['baseline'].triPct = 0;
      crumb('baseline-check', {
        pinnedWorst: base.score.pinnedWorst, pinnedRadial: base.score.pinnedRadial,
        pinnedLevel: base.score.pinnedLevel, regionWorst: base.score.regionWorst,
      });
      writeSummary('baseline-done');

      // ── Arm mid-embed: bands + mid contour, featureLevel 11, NO escalation ──
      const midEmbed = runArm('mid-embed', [...bandCurves, ...midCurves], undefined);

      // ── target selection: pinned cell + near-twin baseline outlier cells (interior, seam-safe) ──
      // Re-scan the baseline hot box to gather distinct outlier L11 cells to escalate.
      const baseMesh = buildOuterDirect(rA, bandCurves, undefined);
      const pinCell = cellKeyOf(PINNED_U, PINNED_T, uBias);
      const cellWorst = new Map<number, { u: number; t: number; radial: number }>();
      {
        const nF = baseMesh.idx.length / 3;
        const uSeamMargin = 2 / (1 << FEATURE_LEVEL);
        for (let f = 0; f < nF; f++) {
          const c = facetCentroidUt(baseMesh, f);
          const dt = c.t - PINNED_T;
          let du = c.u - PINNED_U; du = du - Math.round(du);
          if (Math.abs(du) > HOT_DU || Math.abs(dt) > HOT_DT) continue;
          const uu = ((c.u % 1) + 1) % 1;
          if (uu < uSeamMargin || uu > 1 - uSeamMargin || c.t < 0.02 || c.t > 0.98) continue;
          const wr = worstRadialOfFacet(baseMesh, f, rA, H);
          if (wr.radial <= 0.05) continue; // real fold facet
          const k = cellKeyOf(c.u, c.t, uBias);
          const cur = cellWorst.get(k);
          if (!cur || wr.radial > cur.radial) cellWorst.set(k, { u: c.u, t: c.t, radial: wr.radial });
        }
      }
      const ranked = [...cellWorst.entries()].sort((a, b) => b[1].radial - a[1].radial);
      const targets: Array<{ u: number; t: number }> = [];
      const seen = new Set<number>();
      // pinned cell first (use pinned coord as representative if not among the ranked outliers)
      if (cellWorst.has(pinCell)) { const c = cellWorst.get(pinCell)!; targets.push({ u: c.u, t: c.t }); seen.add(pinCell); }
      else { targets.push({ u: PINNED_U, t: PINNED_T }); seen.add(pinCell); }
      for (const [k, c] of ranked) {
        if (targets.length >= N_TARGETS) break;
        if (seen.has(k)) continue; seen.add(k);
        targets.push({ u: c.u, t: c.t });
      }
      const injectedAtPinned: FeatureLine[] = injectedCross(PINNED_U, PINNED_T, uBias);
      crumb('targets-selected', { nTargets: targets.length, distinctOutlierCells: cellWorst.size, pinnedInOutliers: cellWorst.has(pinCell) });

      // ── Arm mid-esc sweep: bands + mid + sparse featureLevelAt escalating targets to L ──
      for (const L of SWEEP_LEVELS) {
        const flags = targets.map((tg) => cellFlagAt(tg.u, tg.t, FEATURE_LEVEL, L, uBias));
        runArm(`mid-esc-L${L}`, [...bandCurves, ...midCurves], makeSparseLevelAt(flags, uBias));
      }

      // ── Arm mid+cross-esc: attribution control — mid + a per-cell cross AT the pinned point + esc L16 ──
      {
        const flags = targets.map((tg) => cellFlagAt(tg.u, tg.t, FEATURE_LEVEL, MAX_LEVEL, uBias));
        runArm('mid+cross-esc-L16', [...bandCurves, ...midCurves, ...injectedAtPinned], makeSparseLevelAt(flags, uBias));
      }

      // ── residual dump of the best escalation arm's region for the record ──
      const bestEsc = armBank[`mid-esc-L${MAX_LEVEL}`];
      const rows = [
        JSON.stringify({ arm: 'baseline', ...base.score, tris: base.tris, triPct: 0, nonMan: base.nonMan }),
        JSON.stringify({ arm: 'mid-embed', ...midEmbed.score, tris: midEmbed.tris, triPct: midEmbed.triPct, nonMan: midEmbed.nonMan }),
        JSON.stringify({ arm: `mid-esc-L${MAX_LEVEL}`, ...bestEsc.score, tris: bestEsc.tris, triPct: bestEsc.triPct, nonMan: bestEsc.nonMan }),
      ];
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(RESIDUAL_PATH, rows.join('\n') + '\n');

      // ── VERDICT ──
      const escTop = armBank[`mid-esc-L${MAX_LEVEL}`];
      const cross = armBank['mid+cross-esc-L16'];
      const escClosedPinned = escTop.score.pinnedWorst <= TOL;
      const escClosedRegion = escTop.score.regionWorst <= TOL;
      const escTriOk = escTop.triPct <= 10;
      const escWt = escTop.nonMan === 0;
      let verdict: string;
      if (escClosedPinned && escClosedRegion && escWt) {
        verdict = escTriOk ? 'FOLD-CLOSEABLE' : 'COST-BLOWUP';
      } else if (cross.score.pinnedWorst <= TOL && cross.score.regionWorst <= TOL) {
        verdict = 'COVERAGE-EXTENSION-INSUFFICIENT'; // reach closes it, but the mid contour did not reach
      } else {
        verdict = 'COVERAGE-EXTENSION-INSUFFICIENT'; // even per-cell cross+esc did not close ⇒ report residual
      }

      writeSummary('DONE');
      crumb('DONE', {
        verdict,
        base: { pinnedWorst: base.score.pinnedWorst, pinnedRadial: base.score.pinnedRadial, pinnedLevel: base.score.pinnedLevel, regionWorst: base.score.regionWorst },
        midEmbed: { pinnedWorst: midEmbed.score.pinnedWorst, pinnedLevel: midEmbed.score.pinnedLevel, regionWorst: midEmbed.score.regionWorst, triPct: midEmbed.triPct },
        escTop: { pinnedWorst: escTop.score.pinnedWorst, pinnedLevel: escTop.score.pinnedLevel, regionWorst: escTop.score.regionWorst, triPct: escTop.triPct, nonMan: escTop.nonMan },
        cross: { pinnedWorst: cross.score.pinnedWorst, regionWorst: cross.score.regionWorst, triPct: cross.triPct },
        elapsedMs: Date.now() - t0,
      });
      // eslint-disable-next-line no-console
      console.log(`[FOLDCLOSE] VERDICT=${verdict}`);
      // eslint-disable-next-line no-console
      console.log(`[FOLDCLOSE] base pinned=${base.score.pinnedWorst.toFixed(4)}(radial ${base.score.pinnedRadial.toFixed(4)},lvl ${base.score.pinnedLevel}) region=${base.score.regionWorst.toFixed(4)}`);
      // eslint-disable-next-line no-console
      console.log(`[FOLDCLOSE] mid-embed pinned=${midEmbed.score.pinnedWorst.toFixed(4)}(lvl ${midEmbed.score.pinnedLevel}) region=${midEmbed.score.regionWorst.toFixed(4)} tri%=${midEmbed.triPct.toFixed(3)}`);
      const curve = SWEEP_LEVELS.map((L) => {
        const a = armBank[`mid-esc-L${L}`];
        return `L${L}:pin=${a.score.pinnedWorst.toFixed(4)}@lvl${a.score.pinnedLevel},reg=${a.score.regionWorst.toFixed(4)},tri%=${a.triPct.toFixed(3)}`;
      }).join('  ');
      // eslint-disable-next-line no-console
      console.log(`[FOLDCLOSE] esc-sweep: ${curve}`);
      // eslint-disable-next-line no-console
      console.log(`[FOLDCLOSE] cross-ctrl pinned=${cross.score.pinnedWorst.toFixed(4)} region=${cross.score.regionWorst.toFixed(4)} tri%=${cross.triPct.toFixed(3)}`);

      // Non-vacuity anchors (the verdict lives in the summary/crumb; assertions guard instrument validity).
      expect(base.score.pinnedFound, 'baseline must find a facet in the pinned cell').toBe(true);
      expect(base.score.pinnedWorst, 'baseline must reproduce a large fold worst (CPU under-reads GPU 0.72)').toBeGreaterThan(0.2);
      expect(base.nonMan, 'baseline must be watertight').toBe(0);
      expect(escTop.nonMan, 'escalated mesh must stay watertight (fanRepair + 2:1 balance)').toBe(0);
      expect(midCurves.length, 'mid contour must actually extract (non-vacuous)').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
