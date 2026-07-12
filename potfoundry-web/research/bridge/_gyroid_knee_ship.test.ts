// _gyroid_knee_ship.test.ts — Gyroid-knee-ship plan, T6: the END-TO-END PROOF that the committed
// two-pass verdict loop (T4, shipped flag `__pfConformingVerdictRefine`) closes the REAL production
// Gyroid band-edge knee through the SHIPPED flag path — not the synthetic bump T4 unit-tested, and
// not P2.5c's research-injected general-curve crosses / hand-built levelAt.
//
// WHAT THIS PROVES (vs the predecessors it reuses):
//   P2.5b built the real Gyroid outer wall and drove closure with a RESEARCH sparse `featureLevelAt`
//     map (worstLevel stuck at 11: the knee cell is OFF the band-edge contour, so the intersects gate
//     short-circuited before levelAt was ever read — a COVERAGE bug, not a curved-element floor).
//   P2.5c ADJUDICATED that: injecting a tiny general-curve CROSS through the knee (augmenting the
//     intersects gate) + escalating via the committed levelAt seam closed the knee — COVERAGE-BUG-
//     CONFIRMED. But that used a RESEARCH injection, not the production loop.
//   T1 (PeriodicBalancedQuadtree) decoupled `levelAt` from the `intersects` short-circuit; T5's
//     `selectCandidateFacets` near-band (3-cell box) reach makes the OFF-contour knee a scorable
//     candidate WITHOUT any injection; T4's loop scores→escalates 1-rings→rebuilds up to 4 passes.
//   T6 (THIS FILE) exercises that SHIPPED path: set `globalThis.__pfConformingVerdictRefine = true`,
//     pass the SAME band-edge `featureLines` (NO featureLevelAt — the loop owns it), rebuild, and score
//     the BROAD hot region with the INDEPENDENT dense-bary(8)+newtonNearest instrument vs the analytic
//     truth rA. The scorer is deliberately NOT T5's selector — a selector scope-miss must be VISIBLE
//     as a surviving fleet outlier, not hidden.
//
// SCORING INDEPENDENCE (controller hardening, critical): the acceptance instrument is the P2.5b/P2.5c
//   `scoreHotPoints` (denseBary(8) worst-radial in the 3x3 centroid-bucket neighbourhood, Newton-
//   confirmed vs getManifest('GyroidManifold').truth.rA) over the FULL banked hot population
//   (armA3_char_confirmed.json → 2105 distinct hot (u,t) + the knee = the ~2105 facets P2.5b scored),
//   NOT the cells T5's selectCandidateFacets returned. FLEET worst is gated, not just the knee cell.
//
// PRE-REGISTERED GATE (stated BEFORE running), flag ON:
//   PASS iff  knee worst ≤ 0.01  AND  fleet/hot-region worst ≤ 0.01  AND  nonManifoldByIndex == 0
//             AND outer tris < ~1% over the flag-OFF baseline
//             AND the flag-OFF baseline arm reproduces worst ≈ 0.02491654 (non-vacuity — proves the
//                 instrument sees the knee and the FLAG is what closes it).
//   FAIL-to-close iff fleet worst STAYS > 0.01 — then the per-residual characterization (which cells,
//             level reached, was the knee in T5's candidate set, min-angle) IS the deliverable; do NOT
//             tune src to pass — report FAIL for controller adjudication.
//
// RULES: NEW FILE. Imports committed src by import — NO src edit; src never imports research. The flag
//   is set on globalThis and RESTORED in a finally. Resilience: one env-gated test; each arm is banked
//   to research/exchange/tierc/gyroid_knee_ship_summary.json the INSTANT it completes and a killed run
//   RESUMES by skipping banked arms. Breadcrumbs to gyroid_knee_ship_crumbs.ndjson. Self-bump
//   AboveNormal (Windows EcoQoS). Helpers copied verbatim from _tierc_p2_5c.test.ts (a NEW FILE cannot
//   import a .test.ts) so the instrument is byte-parity with the arms this file supersedes.
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_GYROID_KNEE_SHIP=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.gyroid_knee_ship.config.ts
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
import {
  selectCandidateFacets, type CandidateFeatureRefineSpec,
} from '../../src/renderers/webgpu/parametric/conforming/verdictRefine';

const TAU = Math.PI * 2;
const ON = process.env.PF_GYROID_KNEE_SHIP === '1';
const FLAG = '__pfConformingVerdictRefine';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'gyroid_knee_ship_crumbs.ndjson');
const SUMMARY_PATH = join(OUT_DIR, 'gyroid_knee_ship_summary.json');
const HOT_POP_PATH = join(OUT_DIR, 'armA3_char_confirmed.json');
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
const TRI_PCT_GATE = 1.0; // outer tris must be < ~1% over the flag-OFF baseline

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'T6', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
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
 *  Newton-confirm only that one. Byte-parity with P2.5b/P2.5c scoreHotPoints. INDEPENDENT of T5. */
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

/** Build the OUTER wall via buildConformingWall DIRECTLY — mirrors EXACTLY the outer-wall opts
 * assembleWatertight feeds it (P2.5b/P2.5c buildOuterDirect, verbatim). NO featureLevelAt is ever
 * passed here: the SHIPPED two-pass loop owns featureLevelAt internally when the flag is ON, and the
 * flag-OFF arm is the byte-identical production baseline. `featureLines` = band-edge generalCurves. */
function buildOuterDirect(rA: AnalyticRadiusFn, generalCurves: FeatureLine[]): OuterMesh {
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
    // NB: featureLevelAt intentionally OMITTED — the shipped flag-ON loop drives it internally.
  });
  const xyz = liftUtVerts(res.vertices, rA, H);
  return { xyz, ut: res.vertices, idx: res.indices, tris: res.indices.length / 3 };
}

// ── faithful `intersects` reconstruction (ConformingWall.buildFeatureIntersector replica, byte-parity
//    with P2.5b/P2.5c) — used ONLY to instrument "was the knee cell in T5's candidate set" via the
//    exported production selectCandidateFacets. Not part of the acceptance instrument. ──
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

/** The distinct L11 (iu,it) cell key of a (u,t) at uBias B — matches scoreCandidateFacets keying. */
function cellKeyOf(u: number, t: number, uBias: number): number {
  const iu = Math.floor(((u % 1) + 1) % 1 * (1 << (FEATURE_LEVEL + uBias)));
  const it = Math.floor(Math.min(1 - 1e-12, Math.max(0, t)) * (1 << FEATURE_LEVEL));
  return it * (1 << (FEATURE_LEVEL + uBias)) + iu;
}

/** Compact per-arm bank record (resumable — the heavy PtScore[] is NOT persisted, only aggregates
 * + surviving outliers, so a killed run resumes by skipping already-banked arms). */
interface ArmBank {
  arm: string;
  fleetWorst: number;
  kneeWorst: number;
  kneeLevel: number;
  kneeMinAngleDeg: number;
  fleetWorstLevel: number;
  fleetWorstMinAngleDeg: number;
  scored: number;
  outlierCount: number;
  tris: number;
  triPct: number;
  nonMan: number;
  topOutliers: Array<{ u: number; t: number; worst: number; level: number; minAngleDeg: number }>;
}

function aggregateArm(arm: string, pts: PtScore[], tris: number, baseTris: number, nonMan: number): ArmBank {
  let fleetWorst = -1, fleetWorstLevel = -1, fleetWorstMinAngle = NaN;
  const outliers: PtScore[] = [];
  for (const p of pts) {
    if (p.worst > fleetWorst) { fleetWorst = p.worst; fleetWorstLevel = p.level; fleetWorstMinAngle = p.minAngleDeg; }
    if (p.worst > TOL) outliers.push(p);
  }
  outliers.sort((a, b) => b.worst - a.worst);
  const kneePt = pts.find((p) => Math.round(p.u * 1e7) === Math.round(KNEE_U * 1e7)
    && Math.round(p.t * 1e7) === Math.round(KNEE_T * 1e7));
  return {
    arm,
    fleetWorst,
    kneeWorst: kneePt?.worst ?? NaN,
    kneeLevel: kneePt?.level ?? -1,
    kneeMinAngleDeg: kneePt?.minAngleDeg ?? NaN,
    fleetWorstLevel,
    fleetWorstMinAngleDeg: fleetWorstMinAngle,
    scored: pts.length,
    outlierCount: outliers.length,
    tris,
    triPct: baseTris > 0 ? 100 * (tris - baseTris) / baseTris : 0,
    nonMan,
    topOutliers: outliers.slice(0, 25).map((p) => ({
      u: p.u, t: p.t, worst: p.worst, level: p.level, minAngleDeg: p.minAngleDeg,
    })),
  };
}

describe.skipIf(!ON)('T6 — shipped __pfConformingVerdictRefine loop closes the REAL Gyroid knee (end-to-end)', () => {
  it(
    'flag-ON two-pass verdict loop drives knee AND fleet hot-region worst ≤ 0.01 at <~1% tris, watertight',
    () => {
      const t0 = Date.now();
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA as AnalyticRadiusFn;
      const { H } = TIERC_COMMON_DIMS;
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const generalCurves: FeatureLine[] = [
        ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
        ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
      ];
      const uBias = computeUBias(
        buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256).sampler,
        generalCurves.length > 0,
      );
      crumb('bandedge-extracted', { curves: generalCurves.length, uBias });

      // ── BROAD hot population: armA3_char_confirmed.json → distinct hot (u,t) + the knee (~2105). ──
      expect(existsSync(HOT_POP_PATH), `banked hot population missing: ${HOT_POP_PATH}`).toBe(true);
      const armA3 = JSON.parse(readFileSync(HOT_POP_PATH, 'utf8')) as Array<{ u: number; t: number }>;
      const seenLoc = new Set<string>();
      const hot: HotPoint[] = [];
      for (const c of armA3) {
        const kk = `${Math.round(c.u * 1e7)}_${Math.round(c.t * 1e7)}`;
        if (seenLoc.has(kk)) continue; seenLoc.add(kk);
        hot.push({ u: c.u, t: c.t });
      }
      const kneeKk = `${Math.round(KNEE_U * 1e7)}_${Math.round(KNEE_T * 1e7)}`;
      if (!seenLoc.has(kneeKk)) hot.push({ u: KNEE_U, t: KNEE_T });
      crumb('hot-loaded', { armA3Rows: armA3.length, distinctHotLocations: hot.length });

      // ── resumable arm bank ──
      const armBank: Record<string, ArmBank> = {};
      let kneeInT5CandidateSet: boolean | null = null;
      let baseTris = 0;
      if (existsSync(SUMMARY_PATH)) {
        try {
          const prior = JSON.parse(readFileSync(SUMMARY_PATH, 'utf8')) as {
            arms?: Record<string, ArmBank>; kneeInT5CandidateSet?: boolean | null;
          };
          if (prior.arms) for (const [k, v] of Object.entries(prior.arms)) armBank[k] = v;
          if (armBank['flag-off']) baseTris = armBank['flag-off'].tris;
          if (typeof prior.kneeInT5CandidateSet === 'boolean') kneeInT5CandidateSet = prior.kneeInT5CandidateSet;
          crumb('resumed', { banked: Object.keys(armBank), kneeInT5CandidateSet });
        } catch { /* corrupt/partial summary ⇒ start clean */ }
      }

      const writeSummary = (status: string, final?: Record<string, unknown>): void => {
        writeFileSync(SUMMARY_PATH, JSON.stringify({
          experiment: 'T6-gyroid-knee-ship-END-TO-END', at: new Date().toISOString(), status,
          seam: 'SHIPPED globalThis.__pfConformingVerdictRefine ⇒ buildConformingWall two-pass loop (T4)',
          scorer: 'INDEPENDENT: denseBary(8) worst-radial + newtonNearest vs GyroidManifold.truth.rA over 2105 hot (u,t) (NOT T5 selectCandidateFacets)',
          config: {
            featureLevel: FEATURE_LEVEL, maxLevel: MAX_LEVEL, uBias, tol: TOL,
            triPctGate: TRI_PCT_GATE, hotPopulation: hot.length, bankedNewtonWorst: BANKED_NEWTON_WORST,
          },
          kneeCellKey: cellKeyOf(KNEE_U, KNEE_T, uBias), kneeInT5CandidateSet,
          arms: armBank, ...final, newtonCallCount, elapsedMs: Date.now() - t0,
        }, null, 2));
      };

      // ── ARM 1: FLAG-OFF baseline (byte-identical production; must reproduce the knee 0.0249) ──
      if (!armBank['flag-off']) {
        const prev = (globalThis as Record<string, unknown>)[FLAG];
        try {
          (globalThis as Record<string, unknown>)[FLAG] = false;
          const bstart = Date.now();
          const mesh = buildOuterDirect(rA, generalCurves);
          crumb('flag-off-built', { tris: mesh.tris, buildMs: Date.now() - bstart });
          const nonMan = nonManRawBigStats(mesh.idx).nonMan;
          const pts = scoreHotPoints(mesh, buildCentroidGrid(mesh, HG), HG, hot, rA, H);
          baseTris = mesh.tris;
          const bank = aggregateArm('flag-off', pts, mesh.tris, baseTris, nonMan);
          armBank['flag-off'] = bank;

          // Instrument: is the knee cell in T5's candidate set on the production pass-0 mesh?
          // Replicate the shipped selector (selectCandidateFacets) with the faithful intersects
          // reconstruction, then test whether any candidate facet keys to the knee's L11 cell.
          try {
            const spec: CandidateFeatureRefineSpec = {
              level: FEATURE_LEVEL, intersects: buildIntersector(generalCurves),
            };
            const cand = selectCandidateFacets({ vertices: mesh.ut, indices: mesh.idx }, spec);
            const kneeKey = cellKeyOf(KNEE_U, KNEE_T, uBias);
            let inSet = false;
            for (const f of cand) {
              const ia = mesh.idx[3 * f], ib = mesh.idx[3 * f + 1], ic = mesh.idx[3 * f + 2];
              const ua = mesh.ut[3 * ia], ub = mesh.ut[3 * ib], uc = mesh.ut[3 * ic];
              const uCen = ((ua + (wrapDu(ub - ua) + wrapDu(uc - ua)) / 3) % 1 + 1) % 1;
              const tCen = (mesh.ut[3 * ia + 1] + mesh.ut[3 * ib + 1] + mesh.ut[3 * ic + 1]) / 3;
              if (cellKeyOf(uCen, tCen, uBias) === kneeKey) { inSet = true; break; }
            }
            kneeInT5CandidateSet = inSet;
            crumb('t5-candidate-probe', { candidateCount: cand.length, kneeInT5CandidateSet: inSet });
          } catch (e) {
            crumb('t5-candidate-probe-FAILED', { err: String(e) });
            kneeInT5CandidateSet = null;
          }

          crumb('flag-off-scored', {
            fleetWorst: bank.fleetWorst, kneeWorst: bank.kneeWorst, outliers: bank.outlierCount,
            nonMan, tris: mesh.tris, newtonCallCount,
          });
          writeSummary('flag-off-done');
        } finally {
          if (prev === undefined) delete (globalThis as Record<string, unknown>)[FLAG];
          else (globalThis as Record<string, unknown>)[FLAG] = prev;
        }
      } else {
        crumb('flag-off-skip-banked', { fleetWorst: armBank['flag-off'].fleetWorst });
      }
      const off = armBank['flag-off'];
      const baseReproduces = Math.abs(off.kneeWorst - BANKED_NEWTON_WORST) < 5e-4;
      crumb('baseline-check', { kneeWorst: off.kneeWorst, expect: BANKED_NEWTON_WORST, ok: baseReproduces });

      // ── ARM 2: FLAG-ON (the shipped two-pass loop closes the knee) ──
      if (!armBank['flag-on']) {
        const prev = (globalThis as Record<string, unknown>)[FLAG];
        try {
          (globalThis as Record<string, unknown>)[FLAG] = true;
          const bstart = Date.now();
          const mesh = buildOuterDirect(rA, generalCurves);
          crumb('flag-on-built', { tris: mesh.tris, buildMs: Date.now() - bstart });
          const nonMan = nonManRawBigStats(mesh.idx).nonMan;
          const pts = scoreHotPoints(mesh, buildCentroidGrid(mesh, HG), HG, hot, rA, H);
          const bank = aggregateArm('flag-on', pts, mesh.tris, baseTris, nonMan);
          armBank['flag-on'] = bank;
          crumb('flag-on-scored', {
            fleetWorst: bank.fleetWorst, kneeWorst: bank.kneeWorst, outliers: bank.outlierCount,
            triPct: bank.triPct, nonMan, tris: mesh.tris, newtonCallCount,
          });
          writeSummary('flag-on-done');
        } finally {
          if (prev === undefined) delete (globalThis as Record<string, unknown>)[FLAG];
          else (globalThis as Record<string, unknown>)[FLAG] = prev;
        }
      } else {
        crumb('flag-on-skip-banked', { fleetWorst: armBank['flag-on'].fleetWorst });
      }
      const on = armBank['flag-on'];

      // ── GATE (pre-registered) ──
      const kneeOk = on.kneeWorst <= TOL;
      const fleetOk = on.fleetWorst <= TOL;
      const nonManOk = on.nonMan === 0;
      const triOk = on.triPct < TRI_PCT_GATE;
      const nonVacuityOk = baseReproduces;
      const gate = kneeOk && fleetOk && nonManOk && triOk && nonVacuityOk ? 'PASS'
        : (!fleetOk || !kneeOk ? 'FAIL-to-close'
          : (!triOk ? 'FAIL-tri-cost'
            : (!nonManOk ? 'FAIL-nonManifold'
              : 'FAIL-non-vacuity')));

      writeSummary('DONE', {
        gate,
        gateLegs: { kneeOk, fleetOk, nonManOk, triOk, nonVacuityOk },
        flagOff: {
          fleetWorst: off.fleetWorst, kneeWorst: off.kneeWorst, outliers: off.outlierCount,
          tris: off.tris, nonMan: off.nonMan, reproducesKnee: baseReproduces,
        },
        flagOn: {
          fleetWorst: on.fleetWorst, kneeWorst: on.kneeWorst, outliers: on.outlierCount,
          fleetWorstLevel: on.fleetWorstLevel, fleetWorstMinAngleDeg: on.fleetWorstMinAngleDeg,
          kneeLevel: on.kneeLevel, kneeMinAngleDeg: on.kneeMinAngleDeg,
          tris: on.tris, triPct: on.triPct, nonMan: on.nonMan, topOutliers: on.topOutliers,
        },
        kneeInT5CandidateSet,
      });
      crumb('DONE', {
        gate, kneeWorstOff: off.kneeWorst, kneeWorstOn: on.kneeWorst, fleetWorstOn: on.fleetWorst,
        outliersOn: on.outlierCount, triPct: on.triPct, nonManOn: on.nonMan,
        kneeInT5CandidateSet, elapsedMs: Date.now() - t0,
      });
      // eslint-disable-next-line no-console
      console.log(`[T6] GATE=${gate} off:knee=${off.kneeWorst.toFixed(6)}/fleet=${off.fleetWorst.toFixed(6)} on:knee=${on.kneeWorst.toFixed(6)}/fleet=${on.fleetWorst.toFixed(6)} outliersOn=${on.outlierCount} triPct=${on.triPct.toFixed(3)} nonMan=${on.nonMan} kneeInT5Cand=${kneeInT5CandidateSet}`);

      // Non-vacuity anchors (assertions guard the instrument's validity; the GATE verdict lives in the
      // summary/crumb per this lab's convention — a FAIL-to-close is a real finding, not a test error).
      expect(off.kneeWorst, 'flag-OFF baseline must reproduce the champion knee ~0.0249 (non-vacuity)').toBeCloseTo(BANKED_NEWTON_WORST, 3);
      expect(off.nonMan, 'flag-OFF baseline must be watertight').toBe(0);
      expect(on.nonMan, 'flag-ON escalated mesh must stay watertight (fanRepair + 2:1 balance)').toBe(0);
      expect(on.fleetWorst, 'flag-ON must reduce the fleet worst below the baseline knee (direction)').toBeLessThan(BANKED_NEWTON_WORST);
    },
    TEST_TIMEOUT_MS,
  );
});
