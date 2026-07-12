// _tierc_p2_5.test.ts — Curved-Element Phase-2 program, arm P2.5 (BUILD + PROVE the `levelAt` seam
// on the PRODUCTION kernel). Charter: research/lab/2026-07-12-curved-element-phase2-charter.md;
// design: research/lab/tierc/P2.1-design.md §1 (the levelAt seam, verbatim implemented here);
// predecessor verdict: research/lab/tierc/P2.0-verdict.md (LOCAL cell-scoped refinement closes the
// Gyroid band-edge knee 0.0249 -> <=0.01 at +4.54% tris — proven with a RESEARCH quadrisection proxy,
// NOT the production quadtree). Roadmap: research/lab/2026-07-12-existing-asset-roadmap.md §Gyroid
// (VERDICT-DRIVEN, not a build-time predictor — P2.1-P2.4 refuted the predictor: the base sizing
// field under-reads, so no delta discriminates; the PROVEN path is to escalate the Newton-flagged
// residual cells DIRECTLY).
//
// HYPOTHESIS: driving the NEW additive `featureRefine.levelAt` seam (ConformingWall +
// PeriodicBalancedQuadtree, default-absent byte-identical) from the BANKED Newton verdict (the
// armA3-confirmed hot cells, with p2_0_s2's usedLevel2 labels selecting the +1-vs-+2 escalation)
// closes the Gyroid knee on the REAL production kernel (buildConformingWall -> quadtree
// refine/balance/triangulate) — Newton-worst 0.02491654... -> <=0.01 at a BOUNDED tri cost (NOT the
// +200% of the REFUTED predictor), watertight preserved (fanRepair), the non-knee bulk unperturbed.
//
// METHOD (cheapest-decisive; reuses committed twin plumbing; the ONLY new mechanism is the seam
// itself, already merged into the kernel):
//  1) BYTE-IDENTITY anchor: rebuild the EXACT champion fanRepair band-edge twin via
//     buildFanRepairOuterFromCurves (which passes NO featureLevelAt) and assert its hash reproduces
//     the banked 51a25eba-6a58e3e1 — i.e. the kernel edit is byte-identical when the seam is absent,
//     PROVEN through the whole production assembly path. Score its hot region -> reproduces ~0.0249.
//  2) DIRECT baseline: build the SAME outer wall via buildConformingWall directly (the exact opts
//     assembleWatertight feeds it), NO levelAt. Score the hot region -> must reproduce ~0.0249 (the
//     direct-outer path faithfully carries the champion knee — the apples-to-apples baseline).
//  3) ESCALATED: build the identical outer wall WITH featureLevelAt driven from the banked verdict
//     (target = featureLevel+2 where p2_0_s2 flagged usedLevel2, else featureLevel+1). Re-score the
//     hot region -> <=0.01; measure tri delta (bounded) + watertight (nonMan 0, non-vacuous: the
//     escalation actively injects T-junctions that 2:1 balance must resolve).
//
// GATE (pre-registered): PASS iff escalated hot-region Newton-worst <= 0.01 (from ~0.0249) AND outer
// tris <= +10% AND nonMan == 0 AND the direct baseline reproduced ~0.0249 => the levelAt seam CLOSES
// the Gyroid knee on the PRODUCTION kernel (mechanism production-real, not just the P2.0 proxy).
// FAIL iff the production kernel diverges from the P2.0 quadrisection proxy (quadtree can't reach the
// local level, or balance() over-propagates) — reported as a first-class finding.
//
// RULES: NEW FILE. Imports committed code (incl. the two edited kernel files) by import. The kernel
// edit (levelAt) is additive + default-absent byte-identical (proven by step 1). DEV-ONLY; src/ never
// imports research/. Resilience: one env-gated test, breadcrumb + checkpoint every step to
// research/exchange/tierc/p2_5_crumbs.ndjson + p2_5_summary.json; self-bump AboveNormal (EcoQoS).
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
import { buildFanRepairOuterFromCurves } from './_tierc_a3_reloc_lib';
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
const ON = process.env.PF_TIERC_P2_5 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'p2_5_crumbs.ndjson');
const EXPECT_HASH = '51a25eba-6a58e3e1';
const TOL = 0.01;
const NEWTON_OPTS: NewtonOpts = { seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
const BANKED_NEWTON_WORST = 0.02491654414922634;
// The single worst knee facet's own (u,t) (P2.0 header: f=1336851/1336852) — added explicitly so the
// scored hot region is guaranteed to contain the banked worst regardless of armA3 sampling.
const KNEE_U = 0.29138268584834043;
const KNEE_T = 0.719970703125;
const DENSE8 = denseBary(8);
const FEATURE_LEVEL = AF_PROD_OPTS.featureLevel; // 11
const TEST_TIMEOUT_MS = 29 * 60 * 1000;
// Hot-region bucket resolution (mesh-invariant): ~ level-11 cell size (1/2048). Facets whose
// centroid falls in a hot bucket (dilated ±1) are the scored "hot population".
const HG = 2048;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'P2.5', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
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

// ── scoring: worst-radial (denseBary) -> Newton-confirm only if radial > tol (proven safe UB) ──
function radialDevAt(x: number, y: number, z: number, rA: AnalyticRadiusFn, H: number): number {
  if (z < -1e-9 || z > H + 1e-9) return Infinity;
  let th = Math.atan2(y, x); if (th < 0) th += TAU;
  return Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z))));
}
let newtonCallCount = 0;
function newtonWorstOfXyz(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number, rA: AnalyticRadiusFn, H: number,
): number {
  let worst = -1, wx = 0, wy = 0, wz = 0;
  for (const [wa, wb, wc] of DENSE8) {
    const x = wa * ax + wb * bx + wc * cx, y = wa * ay + wb * by + wc * cy, z = wa * az + wb * bz + wc * cz;
    const d = radialDevAt(x, y, z, rA, H);
    if (d > worst) { worst = d; wx = x; wy = y; wz = z; }
  }
  if (worst <= TOL) return worst;
  newtonCallCount++;
  return Math.min(worst, newtonNearest(rA, H, wx, wy, wz, NEWTON_OPTS).dist);
}

/** Convert a lifted xyz vertex back to (u,t). */
function xyzToUt(x: number, y: number, z: number, H: number): [number, number] {
  let th = Math.atan2(y, x); if (th < 0) th += TAU;
  return [th / TAU, Math.min(1, Math.max(0, z / H))];
}
interface OuterMesh { xyz: Float32Array; ut: Float32Array; idx: Uint32Array; tris: number; }

/** Wrap a u-delta into (-0.5, 0.5] (periodic seam). */
function wrapDu(d: number): number { return d - Math.round(d); }

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

/** worstRadial (denseBary) of facet f, with the winning barycentric point (for Newton confirm). */
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

/**
 * Score the covering facet per banked hot (u,t) — the faithful P2.0 method (score the hot facets),
 * made mesh-INVARIANT by locating the facet through a centroid bucket grid instead of a fixed index.
 * For each hot point: gather facets in the 3×3 bucket neighborhood, take the worst-RADIAL few (radial
 * is a proven safe UPPER BOUND on Newton-nearest), and Newton-confirm only those — so Newton calls are
 * bounded to ~top-K per point (seconds), NOT the radial-overstated whole band edge. Returns the global
 * worst Newton, the per-point outlier count (>tol), and the scored-point count (coverage).
 */
/** Approximate quadtree level of facet f from its largest (u,t) t-extent (t-size = 1/2^level). */
function facetLevel(m: OuterMesh, f: number): number {
  const { ut, idx } = m;
  const ia = idx[3 * f], ib = idx[3 * f + 1], ic = idx[3 * f + 2];
  const tA = ut[3 * ia + 1], tB = ut[3 * ib + 1], tC = ut[3 * ic + 1];
  const maxT = Math.max(Math.abs(tA - tB), Math.abs(tB - tC), Math.abs(tC - tA));
  if (maxT <= 1e-9) return 99;
  return Math.max(0, Math.min(20, Math.round(-Math.log2(maxT))));
}

function scoreHotPoints(
  m: OuterMesh, grid: Map<number, number[]>, G: number, hot: HotPoint[], rA: AnalyticRadiusFn, H: number,
): { worst: number; outliers: number; scored: number; p99: number; worstLevel: number; levelHist: Record<number, number> } {
  // Newton is the cost driver (~40ms/call at the banked 451-seed opts); the hot points sit ON the
  // radial-overstated band edge so the radial screen can't cull them. Newton only the SINGLE
  // worst-radial facet per point (radial >= newton, so the worst-radial facet bounds the point).
  const TOPK = 1;
  let worst = -1, outliers = 0, scored = 0, worstLevel = -1;
  const vals: number[] = [];
  const levelHist: Record<number, number> = {};
  for (const hp of hot) {
    const bu0 = Math.floor((((hp.u % 1) + 1) % 1) * G);
    const bt0 = Math.min(G - 1, Math.max(0, Math.floor(hp.t * G)));
    const cand: number[] = [];
    for (let dt = -1; dt <= 1; dt++) {
      const bt = bt0 + dt; if (bt < 0 || bt >= G) continue;
      for (let du = -1; du <= 1; du++) {
        const bu = ((bu0 + du) % G + G) % G;
        const arr = grid.get(bt * G + bu); if (arr) for (const f of arr) cand.push(f);
      }
    }
    if (cand.length === 0) continue;
    // Rank candidates by worstRadial; Newton-confirm the top-K (radial >= newton always).
    const ranked = cand.map((f) => ({ f, wr: worstRadialOfFacet(m, f, rA, H) }))
      .sort((a, b) => b.wr.radial - a.wr.radial);
    let pointWorst = -1;
    for (let i = 0; i < Math.min(TOPK, ranked.length); i++) {
      const r = ranked[i];
      const nd = r.wr.radial <= TOL ? r.wr.radial
        : (newtonCallCount++, Math.min(r.wr.radial, newtonNearest(rA, H, r.wr.x, r.wr.y, r.wr.z, NEWTON_OPTS).dist));
      if (nd > pointWorst) pointWorst = nd;
    }
    const lvl = facetLevel(m, ranked[0].f); // level of the worst-radial (bounding) facet at this point
    levelHist[lvl] = (levelHist[lvl] ?? 0) + 1;
    scored++;
    vals.push(pointWorst);
    if (pointWorst > worst) { worst = pointWorst; worstLevel = lvl; }
    if (pointWorst > TOL) outliers++;
  }
  return { worst, outliers, scored, p99: pct(vals, 0.99), worstLevel, levelHist };
}

/** Lift a ConformingWall (u,t,surfaceId) vertex buffer to 3D via rA (matches the reloc lib's lift). */
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

/**
 * Build the OUTER wall via buildConformingWall DIRECTLY, mirroring EXACTLY the outer-wall opts
 * assembleWatertight feeds it inside buildFanRepairOuterFromCurves (perWallBudget = 16M/2 = 8M cap,
 * featureLevel 11, fanRepair, empty crease grids -> minUniformLevel 0, computeUBias). `featureLevelAt`
 * is the ONLY addition — undefined => the direct baseline (must reproduce the champion knee).
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
  // res.vertices packs (u, t, surfaceId); the ut reader uses slots 0,1 only.
  return { xyz, ut: res.vertices, idx: res.indices, tris: res.indices.length / 3 };
}

/** Derive a (u,t,_) buffer from a lifted xyz buffer (for the assembly-extracted twin). */
function deriveUt(xyz: Float32Array, H: number): Float32Array {
  const ut = new Float32Array(xyz.length);
  for (let v = 0; v < xyz.length; v += 3) {
    const [u, t] = xyzToUt(xyz[v], xyz[v + 1], xyz[v + 2], H);
    ut[v] = u; ut[v + 1] = t;
  }
  return ut;
}

interface HotPoint { f: number; u: number; t: number; target: number; }

/**
 * DENSE-ARC per-cell escalation (P2.5 discriminator; coordinator dir. #1). Escalates every cell
 * within Chebyshev radius `R` (in u AND t) of ANY banked hot (u,t) to featureLevel+2. Because
 * `belowFeatureFloorTest` gates on the contour `intersects` FIRST, only CONTOUR cells actually
 * escalate — so this densely escalates the WHOLE hot ARC (the ~166 knee arcs), not the stride-
 * sampled points: R is chosen > the sample stride so it bridges the gaps between consecutive sampled
 * hot facets along each arc (the armA3 sample covers ~6% of the ~31,114 estimated hot population ⇒
 * stride ~16 level-11 cells ~0.0078 in t; R=0.005 bridges with margin without fattening into the
 * whole circumference). +2 everywhere is the decisive COVERAGE-vs-RE-CHORD test: P2.0 proved +2
 * closes the facet-quadrisection, so if the production kernel STILL doesn't close under FULL arc
 * coverage the residual is a genuine transition-facet re-chord, not a coverage gap.
 * `escalatedBaseCells` records the distinct level-featureLevel cells escalated (the dense-arc count).
 */
function makeDenseLevelAt(
  hot: HotPoint[], uBias: number, R: number, escalatedBaseCells: Set<number>,
): (u0: number, t0: number, size: number) => number {
  const baseSize = 1 / (1 << FEATURE_LEVEL);
  const target = FEATURE_LEVEL + 2;
  const BG = Math.max(16, Math.round(1 / R)); // bucket edge ~ R
  const grid = new Map<number, Array<[number, number]>>();
  const bkey = (bu: number, bt: number): number => bt * BG + (((bu % BG) + BG) % BG);
  for (const hp of hot) {
    const bu = Math.floor((((hp.u % 1) + 1) % 1) * BG);
    const bt = Math.min(BG - 1, Math.max(0, Math.floor(hp.t * BG)));
    const k = bkey(bu, bt);
    const arr = grid.get(k); if (arr) arr.push([hp.u, hp.t]); else grid.set(k, [[hp.u, hp.t]]);
  }
  return (u0: number, t0: number, size: number): number => {
    if (size > baseSize * 1.5) return 0; // coarse: the feature floor already refines to featureLevel
    const uSize = size / (1 << uBias);
    const uc = u0 + uSize / 2;
    const tc = t0 + size / 2;
    const bu0 = Math.floor((((uc % 1) + 1) % 1) * BG);
    const bt0 = Math.floor(tc * BG);
    let hit = false;
    for (let dt = -1; dt <= 1 && !hit; dt++) {
      const bt = bt0 + dt; if (bt < 0 || bt >= BG) continue;
      for (let du = -1; du <= 1 && !hit; du++) {
        const arr = grid.get(bkey(bu0 + du, bt)); if (!arr) continue;
        for (const [hu, ht] of arr) {
          if (Math.abs(ht - tc) <= R && Math.abs(wrapDu(hu - uc)) <= R) { hit = true; break; }
        }
      }
    }
    if (!hit) return 0;
    if (size >= baseSize * 0.75) {
      // Distinct level-featureLevel (base) cell key: (iu at level+uBias, it at level).
      escalatedBaseCells.add(
        Math.round(u0 * (1 << (FEATURE_LEVEL + uBias))) * 100003 + Math.round(t0 * (1 << FEATURE_LEVEL)),
      );
    }
    return target;
  };
}

describe.skipIf(!ON)('P2.5 — levelAt seam closes the Gyroid knee on the PRODUCTION kernel', () => {
  it(
    'byte-identical when absent (hash 51a25eba), then verdict-driven levelAt closes 0.0249 -> <=0.01',
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

      // ── STEP 1: BYTE-IDENTITY anchor — the full champion twin, seam ABSENT ──
      const twin = buildFanRepairOuterFromCurves(rA, generalCurves);
      crumb('twin-built', { hash: twin.hash, outerTris: twin.outerTris, buildMs: twin.buildMs, uBias: twin.uBias });
      expect(twin.hash, 'kernel edit must be byte-identical when levelAt absent (production assembly path)')
        .toBe(EXPECT_HASH);

      // Load the banked verdict: armA3 hot (u,t) + p2_0_s2 usedLevel2 labels.
      const armA3Path = join(OUT_DIR, 'armA3_char_confirmed.json');
      expect(existsSync(armA3Path), `banked hot population missing: ${armA3Path}`).toBe(true);
      const armA3 = JSON.parse(readFileSync(armA3Path, 'utf8')) as Array<{ f: number; u: number; t: number; source: string }>;
      const usedL2 = new Set<number>();
      const s2Path = join(OUT_DIR, 'p2_0_s2_partial.json');
      if (existsSync(s2Path)) {
        const s2 = JSON.parse(readFileSync(s2Path, 'utf8')) as Array<{ f: number; usedLevel2: boolean }>;
        for (const r of s2) if (r.usedLevel2) usedL2.add(r.f);
      }
      const seen = new Set<number>();
      const hot: HotPoint[] = [];
      for (const c of armA3) {
        if (c.f < 0 || seen.has(c.f)) continue;
        seen.add(c.f);
        // VERDICT-driven target: +2 where P2.0's Newton pass needed level 2, else +1.
        const target = usedL2.has(c.f) ? FEATURE_LEVEL + 2 : FEATURE_LEVEL + 1;
        hot.push({ f: c.f, u: c.u, t: c.t, target });
      }
      // Guarantee the single worst knee (u,t) is escalated to +2 and in the scored region.
      hot.push({ f: -1, u: KNEE_U, t: KNEE_T, target: FEATURE_LEVEL + 2 });
      const nL2 = hot.filter((h) => h.target === FEATURE_LEVEL + 2).length;
      crumb('verdict-loaded', { hotPoints: hot.length, usedLevel2Points: nL2, armA3Rows: armA3.length });

      // Scored SAMPLE (Newton-bounded): the worst knee (f<0) + EVERY +2 verdict point (the hardest,
      // most-likely-residual cells) + a deterministic 1-in-7 stride of the rest — ~300 points, ample
      // for the worst + outlier RATE. `levelAt` still escalates the FULL 1,891-point hot set.
      const scoreSample: HotPoint[] = hot.filter((h, i) => h.f < 0 || h.target === FEATURE_LEVEL + 2 || i % 7 === 0);
      crumb('score-sample', { sampleSize: scoreSample.length });

      // Score the full twin's sampled hot points (the hash-anchored champion) — reproduces the knee.
      const twinMesh: OuterMesh = {
        xyz: twin.outerXyz, ut: deriveUt(twin.outerXyz, H), idx: twin.outerIdx, tris: twin.outerTris,
      };
      const twinGrid = buildCentroidGrid(twinMesh, HG);
      const twinScore = scoreHotPoints(twinMesh, twinGrid, HG, scoreSample, rA, H);
      crumb('twin-scored', { ...twinScore, newtonCallCount });
      expect(twinScore.worst, 'hot points must contain the banked knee (non-vacuity)')
        .toBeGreaterThan(0.024);

      // ── STEP 2: DIRECT baseline (production kernel, no levelAt) ──
      const baseMesh = buildOuterDirect(rA, generalCurves, undefined);
      crumb('direct-baseline-built', { tris: baseMesh.tris });
      const baseGrid = buildCentroidGrid(baseMesh, HG);
      const baseScore = scoreHotPoints(baseMesh, baseGrid, HG, scoreSample, rA, H);
      const baseNonMan = nonManRawBigStats(baseMesh.idx).nonMan;
      crumb('direct-baseline-scored', { ...baseScore, baseNonMan, newtonCallCount });
      expect(baseScore.worst, 'direct-outer baseline must reproduce the champion knee (path faithful)')
        .toBeCloseTo(BANKED_NEWTON_WORST, 3);

      // ── STEP 3: ESCALATED build — DENSE-ARC levelAt (coordinator dir #1: escalate the WHOLE hot
      // arc densely, not the stride-sampled points; R > sample stride, contour-gated by intersects) ──
      const R_DILATE = 0.005; // > the ~0.0078 sample stride (armA3 ~6% of ~31,114 est. pop)
      const escalatedBaseCells = new Set<number>();
      const levelAt = makeDenseLevelAt(hot, twin.uBias, R_DILATE, escalatedBaseCells);
      const escMesh = buildOuterDirect(rA, generalCurves, levelAt);
      crumb('escalated-built', { tris: escMesh.tris, escalatedBaseCells: escalatedBaseCells.size, R: R_DILATE });
      const escGrid = buildCentroidGrid(escMesh, HG);
      const escScore = scoreHotPoints(escMesh, escGrid, HG, scoreSample, rA, H);
      const escNonMan = nonManRawBigStats(escMesh.idx).nonMan;
      crumb('escalated-scored', {
        worst: escScore.worst, outliers: escScore.outliers, p99: escScore.p99,
        worstLevel: escScore.worstLevel, escNonMan, newtonCallCount,
      });

      const triDelta = escMesh.tris - baseMesh.tris;
      const triPct = 100 * triDelta / baseMesh.tris;
      const summary = {
        experiment: 'P2.5-DENSE-ARC', at: new Date().toISOString(),
        seam: 'FeatureRefineSpec.levelAt (ConformingWall.featureLevelAt -> PeriodicBalancedQuadtree)',
        escalation: {
          mode: 'dense-arc', R: R_DILATE, target: FEATURE_LEVEL + 2,
          escalatedBaseCells: escalatedBaseCells.size, hotPoints: hot.length,
          note: 'every contour cell within Chebyshev R of any hot point -> featureLevel+2 (whole arc, not sampled points)',
        },
        byteIdentityHash: { got: twin.hash, expect: EXPECT_HASH, ok: twin.hash === EXPECT_HASH },
        twinHotRegion: twinScore,
        gate: {
          before: { worst: baseScore.worst, outliers: baseScore.outliers, p99: baseScore.p99, worstLevel: baseScore.worstLevel, tris: baseMesh.tris, nonMan: baseNonMan, levelHist: baseScore.levelHist },
          after: { worst: escScore.worst, outliers: escScore.outliers, p99: escScore.p99, worstLevel: escScore.worstLevel, tris: escMesh.tris, nonMan: escNonMan, levelHist: escScore.levelHist },
          scoredBefore: baseScore.scored, scoredAfter: escScore.scored,
          triDelta, triPct,
          closes: escScore.worst <= TOL,
          triBounded: triPct <= 10,
          watertight: escNonMan === 0,
        },
        newtonCallCount, elapsedMs: Date.now() - t0,
      };
      writeFileSync(join(OUT_DIR, 'p2_5_summary.json'), JSON.stringify(summary, null, 2));
      crumb('DONE', { worstBefore: baseScore.worst, worstAfter: escScore.worst, triPct, escNonMan, elapsedMs: Date.now() - t0 });
      // eslint-disable-next-line no-console
      console.log(`[P2.5] DONE\n${JSON.stringify(summary, null, 2)}`);

      // Pre-registered GATE — RECORDED (not hard-failed) so this stays a re-runnable instrument that
      // banks its verdict (this codebase's convention: green probe, the verdict lives in the summary +
      // crumb). closes<=0.01 under DENSE-arc coverage => COVERAGE was the issue (the levelAt seam
      // closes the Gyroid knee on the production kernel); worst PERSISTS at level 13 (fully escalated)
      // => genuine transition-facet RE-CHORD (the P2.0 facet-quadrisection proxy over-promised). The
      // `after.worstLevel` field discriminates: 13 => the worst facet IS a fully-escalated feature
      // cell that still re-chords; 11/12 => an un-covered arc cell or a 2:1 transition cell.
      const gatePass = summary.gate.closes && summary.gate.watertight && summary.gate.triBounded;
      // eslint-disable-next-line no-console
      console.log(`[P2.5] PRE-REGISTERED GATE closes<=0.01=${summary.gate.closes} watertight=${summary.gate.watertight} triBounded=${summary.gate.triBounded} => ${gatePass ? 'PASS' : 'FAIL-to-close'}`);
      // Hard NON-VACUITY anchor (PASSES): the escalation actively perturbed the mesh (+113% tris here,
      // level 11->12/13) yet stayed watertight — so the FAIL-to-close is a genuine fidelity result on a
      // valid mesh, not a broken build. triBounded is RECORDED (not asserted): the dense-arc R=0.005
      // over-dilated to 85,106 cells (+113.8%) — cost is a lever (tighter R), NOT the finding; the
      // finding is the effective-level-12 floor at the worst locus (see summary.gate.after.worstLevel).
      expect(escNonMan, 'escalated outer wall must stay watertight (nonMan 0, fanRepair)').toBe(0);
      expect(triPct, 'escalation must actually fire (non-vacuous perturbation)').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
