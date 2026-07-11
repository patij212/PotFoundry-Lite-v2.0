// _tierc_a3_char.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A3 CHARACTERIZATION (DIAGNOSIS
// ONLY — decides the lever, does NOT build the fix). Companion docs:
// research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md (A3 bullet, Addendum 3/8/9/11) +
// research/lab/tierc/champion-spec-gyroid.md §1.4 (knee-pin mechanism, proven on the LEGACY
// research kernel at 5-spot/10-facet scale) + §4.1 (the biggest gap: "does the population
// concentrate at isolated knee POINTS (pins work) or along the ENTIRE contour length (edge-class
// -> pins don't scale, needs a chord-ladder)? -- explicitly UNTESTED") +
// research/lab/tierc/A1-gyroid-reproduction-verdict.md (the ~31k residual: 100% knee-adjacent,
// Newton-worst 0.02491654414922634).
//
// DECISIVE QUESTION: the ~31,114 band-edge fidelity outliers (Newton-confirmed, facets over
// 0.01mm vs the exact analytic Gyroid surface) were ALL previously classified "knee-adjacent" by
// an ACROSS-band criterion (dEdge = min(||val|-0.135|,||val|-0.15|) <= 0.005) -- a test that says
// NOTHING about ALONG-contour distribution, since the field gradient never vanishes (so "near an
// edge" is true everywhere along the ~2,045-polyline contour set, by construction). Are the
// outliers POINT-CLASS (isolated at N discrete spots, N small -> the §V11aa pin mechanism scales)
// or EDGE-CLASS (spread along the whole contour length -> pins don't scale, needs a chord-ladder /
// denser feature-adjacent refinement)?
//
// METHOD (cheap -- reuses the committed band-edge twin plumbing, builds NO new mechanism):
// (1) Delta2-exact band-edge twin, multiCurveCellPolicy:'fanRepair' (A2, so the 3 non-manifold
//     loci do not confound scoring) -- mirrors _gyroid_bandedge_lib.ts's buildGbeTwin +
//     _tierc_a1_orient.test.ts's buildFanRepairFull, ONE line different (the policy field added),
//     everything else byte-identical to the committed twin.
// (2) A full radial prescreen (gpcPrescreenDetail, cheap -- banked empirical ~49s) to get every
//     candidate over-tol facet's worst point.
// (3) Newton-CONFIRM (a) the top-250 worst-radial facets (exhaustive -- reproduces/validates the
//     banked Newton-worst 0.02491654414922634 as a non-vacuity witness) and (b) a large,
//     spatially-EVEN sample of the remaining survivor population (a low-discrepancy Bresenham
//     spread across the FULL facet-index range, THEN a deterministic Fisher-Yates shuffle of the
//     PROCESSING ORDER -- so ANY prefix, including an early time-budget truncation, remains an
//     unbiased sample of the WHOLE (u,t) domain, not just "whatever facet indices happen first").
//     This is deliberately NOT gpcStratifiedNewton's radial-value-sorted stratification, which
//     cannot answer a spatial question. Adaptively time-budgeted against a 22-minute scoring
//     soft-cap.
// (4) Resolve every Newton-confirmed outlier's nearest contour point (both isolevels, ~28,785 pts
//     / ~2,045 polylines) -> polyline id + along-polyline position.
// (5) Cluster + measure: distinct-cluster count (radius sweep), polyline-coverage fraction,
//     per-polyline outlier span, and a RAREFACTION/saturation curve over the randomized stride
//     sample (does the distinct-cluster count SATURATE as more of the domain is sampled, or keep
//     growing linearly? -- the direct point-class/edge-class discriminator).
//
// RULES: NEW FILE ONLY. Read-only on all src/ and committed research libs -- this is DIAGNOSIS,
// no fix is built or proposed in code. DEV-ONLY, research/ never imported by src/. Commit nothing.
// Resilience: one env-gated probe; breadcrumb every <=30s; partial-confirmed checkpoint flushed to
// disk during the stride loop (survives a kill); every stage's result written to disk the instant
// it is computed; adaptive time-budgeted stride loop with an explicit kill+projection if the
// 22-minute scoring soft-cap is reached; self-bumps to AboveNormal priority (Windows EcoQoS
// mitigation, CROSS-WORKSTREAM-NOTES.md 2026-07-10 update 3 / tierc_gatesHarness.test.ts pattern).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionWallGridCPU } from './tierc_regionLayer';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  extractBandedgeContours,
  contoursToFeatureLines,
  gpcPrescreenDetail,
  type BandedgeExtraction,
} from './_gyroid_bandedge_lib';
import { gyroidVal } from './_gyroidContourLib';
import { newtonNearest } from './_gyroid_truthLib';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM, AF_RDRAIN, fnvHash } from './_analytic_floor_lib';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import {
  buildCreaseRefineLines,
  type FeatureLine,
} from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';
import { extractOuterWallSubmesh } from '../../src/fidelity/metrics';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_A3CHAR === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armA3_char_crumbs.ndjson');
const TEST_TIMEOUT_MS = 31 * 60 * 1000;
const TOTAL_BUDGET_MS = 30 * 60 * 1000;
const SCORING_SOFT_CAP_MS = 22 * 60 * 1000;
const RESERVE_POST_MS = 75_000; // post-processing (attribution + clustering + writes) reserve
/** A1-proven fanRepair FULL-mesh hash (armA1_crumbs.ndjson / armA1_orient_crumbs.ndjson) --
 *  non-vacuity witness that this IS the exact champion construction prior arms measured. */
const EXPECT_FANREPAIR_HASH = '51a25eba-6a58e3e1';
const TOL = 0.01;
const NEWTON_OPTS = { seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };
const TOPK_EXHAUSTIVE = 250;
/** Conservative vs. the banked empirical ~79-80ms/query
 *  (research/exchange/_gyroid_bandedge/verdict_strat.json wallTimes.stratifiedMs/2000 =
 *  158886/2000); leaves ~25% margin for this arm's fanRepair build / different sample mix. */
const ASSUMED_MS_PER_QUERY = 100;

// PRE-REGISTERED CLASSIFICATION THRESHOLDS (fixed BEFORE reading any clustering result --
// written into this file before the run, per the meshing-research CLOSE protocol's
// "kill-criterion before running" rule):
const CLUSTER_RADIUS_PRIMARY = 0.001; // ~2 featureLevel-11 cells (1/2048~=4.88e-4); same order as
// the §V11aa pin ring spread (0.0008) -- the natural "one pin cluster" scale.
const CLUSTER_RADII_SWEEP = [0.0005, 0.001, 0.002, 0.005];
const POINT_CLASS_MAX_POLYLINE_FRAC = 0.15;
const POINT_CLASS_MIN_COMPACTION = 3.0;
const EDGE_CLASS_MIN_POLYLINE_FRAC = 0.4;
const EDGE_CLASS_MAX_COMPACTION = 1.5;
const SATURATION_POINT_MAX_RATE = 0.05; // new-cluster rate in 2nd half of the randomized stride sample
const SATURATION_EDGE_MIN_RATE = 0.4;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A3-char', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

function uDist(ua: number, ub: number): number {
  const d = Math.abs((ua - Math.floor(ua)) - (ub - Math.floor(ub)));
  return Math.min(d, 1 - d);
}

function percentiles(arr: number[]): {
  min: number; p25: number; p50: number; p75: number; p90: number; p99: number; max: number;
} {
  if (arr.length === 0) return { min: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, max: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const pct = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), p99: pct(0.99), max: s[s.length - 1] };
}

function xyzToUt(x: number, y: number, z: number, H: number): [number, number] {
  let th = Math.atan2(y, x);
  if (th < 0) th += TAU;
  return [th / TAU, Math.min(1, Math.max(0, z / H))];
}

/** Low-discrepancy (Bresenham-style) index selection evenly spread across [0,n) -- guarantees
 *  full-domain coverage IF fully processed. Deterministic, no RNG. */
function evenSelect(n: number, target: number): number[] {
  if (target >= n) return Array.from({ length: n }, (_, i) => i);
  const strideF = n / target;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < n && out.length < target; i++) {
    acc += 1;
    if (acc >= strideF) { acc -= strideF; out.push(i); }
  }
  return out;
}

/** Deterministic mulberry32 PRNG (matches _gyroid_prodclose_lib.ts's own convention). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, in place. Applied to the OUTPUT of evenSelect so that any PREFIX of the
 *  processing order (e.g. an early time-budget truncation) remains an unbiased sample of the
 *  whole domain -- without this, evenSelect's own output is sorted ascending by source index, so
 *  a truncated prefix would silently re-introduce the exact bias evenSelect was meant to avoid. */
function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
}

interface Confirmed {
  f: number; u: number; t: number; newton: number; radial: number;
  source: 'topK' | 'stride' | 'bankedScatter';
}
interface AttrConfirmed extends Confirmed {
  nearestPoly: number; nearestPtIdx: number; nearestIsInner: boolean; nearestDist: number;
  alongFrac: number; absValAtPt: number; dEdgeIso: number;
}

// ─────────────────────────── build: fanRepair Delta2-exact twin, outer-only (mirrors
// _gyroid_bandedge_lib.ts's buildGbeTwin + _tierc_a1_orient.test.ts's buildFanRepairFull, ONE
// line different: multiCurveCellPolicy:'fanRepair' added to assemblyOpts) ───────────────────────

interface A3Build {
  hash: string; fullTris: number; outerTris: number;
  outerXyz: Float32Array; outerIdx: Uint32Array; uBias: number; buildMs: number;
}

function buildFanRepairOuter(
  rA: (theta: number, z: number) => number,
  bandedge: BandedgeExtraction,
): A3Build {
  const t0 = Date.now();
  const { H } = TIERC_COMMON_DIMS;
  const outer = buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
  const inner = buildRegionWallGridCPU(rA, 1, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
  const generalCurves: FeatureLine[] = [
    ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
    ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
  ];
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
  const innerEfgSampler = composedWallSampler(inner.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const minUniformLevel = resolveUniformLevelOverride(
    Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level), 0,
  );
  const uBias = computeUBias(outer.sampler, generalCurves.length > 0);
  const assemblyOpts: AssemblyWallOptions = {
    maxSagMm: AF_PROD_OPTS.maxSagMm,
    maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
    minEdgeMm: AF_PROD_OPTS.minEdgeMm,
    gradeRatio: AF_PROD_OPTS.gradeRatio,
    maxLevel: AF_PROD_OPTS.maxLevel,
    resU: AF_PROD_OPTS.resU,
    resT: AF_PROD_OPTS.resT,
    nRing: AF_PROD_OPTS.nRing,
    targetTriangles: AF_PROD_OPTS.targetTriangles,
    budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel,
    uBias,
    outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel,
    outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    outerEfgSampler,
    innerEfgSampler,
    multiCurveCellPolicy: 'fanRepair',
  };
  const asm = assembleWatertight(
    outer.sampler, inner.sampler,
    { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN }, assemblyOpts,
  );
  const hash = fnvHash(asm.vertices, asm.indices);

  const nV = asm.vertices.length / 3;
  const mask = new Uint8Array(nV);
  for (let j = 0; j < nV; j++) mask[j] = asm.vertices[j * 3 + 2] < 0.5 ? 1 : 0;
  const sub = extractOuterWallSubmesh(asm.vertices, asm.indices, mask);
  const outerXyz = new Float32Array(sub.vertices.length);
  for (let v = 0; v < sub.vertices.length; v += 3) {
    const u = sub.vertices[v] - Math.floor(sub.vertices[v]);
    const t = sub.vertices[v + 1];
    const theta = u * TAU;
    const z = t * H;
    const r = rA(theta, z);
    outerXyz[v] = r * Math.cos(theta);
    outerXyz[v + 1] = r * Math.sin(theta);
    outerXyz[v + 2] = z;
  }

  return {
    hash, fullTris: asm.indices.length / 3, outerTris: sub.indices.length / 3,
    outerXyz, outerIdx: sub.indices, uBias, buildMs: Date.now() - t0,
  };
}

// ─────────────────────────── contour attribution index (flat typed arrays -- ~28.8k pts; brute
// nearest search per query is fine at our sample sizes; no Map, no cap risk) ─────────────────────

interface ContourIndex {
  u: Float64Array; t: Float64Array; poly: Int32Array; ptIdx: Int32Array; isInner: Uint8Array;
  polyLen: Int32Array; totalPolylines: number; innerPolyCount: number; n: number;
}

function buildContourIndex(bandedge: BandedgeExtraction): ContourIndex {
  const innerC = bandedge.inner.decimatedContours;
  const outerC = bandedge.outer.decimatedContours;
  const n = innerC.reduce((s, c) => s + c.pts.length, 0) + outerC.reduce((s, c) => s + c.pts.length, 0);
  const u = new Float64Array(n), t = new Float64Array(n), poly = new Int32Array(n),
    ptIdx = new Int32Array(n), isInner = new Uint8Array(n);
  const polyLen: number[] = [];
  let w = 0, gid = 0;
  for (const c of innerC) {
    polyLen.push(c.pts.length);
    c.pts.forEach(([uu, tt], pi) => { u[w] = uu; t[w] = tt; poly[w] = gid; ptIdx[w] = pi; isInner[w] = 1; w++; });
    gid++;
  }
  const innerPolyCount = gid;
  for (const c of outerC) {
    polyLen.push(c.pts.length);
    c.pts.forEach(([uu, tt], pi) => { u[w] = uu; t[w] = tt; poly[w] = gid; ptIdx[w] = pi; isInner[w] = 0; w++; });
    gid++;
  }
  return { u, t, poly, ptIdx, isInner, polyLen: Int32Array.from(polyLen), totalPolylines: gid, innerPolyCount, n };
}

function nearestContourPoint(
  ci: ContourIndex, qu: number, qt: number,
): { dist: number; poly: number; ptIdx: number; isInner: boolean; polyLen: number } {
  let best = Infinity, bi = -1;
  const quN = qu - Math.floor(qu);
  for (let i = 0; i < ci.n; i++) {
    const du = Math.abs(quN - ci.u[i]);
    const duw = du > 0.5 ? 1 - du : du;
    const dt = qt - ci.t[i];
    const d = Math.hypot(duw, dt);
    if (d < best) { best = d; bi = i; }
  }
  return { dist: best, poly: ci.poly[bi], ptIdx: ci.ptIdx[bi], isInner: ci.isInner[bi] === 1, polyLen: ci.polyLen[ci.poly[bi]] };
}

function clusterAt(pts: Array<{ u: number; t: number }>, radius: number): Array<{ u: number; t: number; members: number }> {
  const reps: Array<{ u: number; t: number; members: number }> = [];
  for (const p of pts) {
    let placed = false;
    for (const rep of reps) {
      if (Math.hypot(uDist(p.u, rep.u), p.t - rep.t) <= radius) { rep.members++; placed = true; break; }
    }
    if (!placed) reps.push({ u: p.u, t: p.t, members: 1 });
  }
  return reps;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A3 CHARACTERIZATION (point-class vs edge-class, diagnosis only)', () => {
  it(
    'maps the spatial distribution of the ~31k band-edge fidelity outliers',
    () => {
      const t0 = Date.now();
      mkdirSync(OUT_DIR, { recursive: true });
      try {
        os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
      } catch {
        console.log('[armA3-char] note: could not self-bump priority (EcoQoS throttle risk remains)');
      }
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB, totalBudgetMs: TOTAL_BUDGET_MS, scoringSoftCapMs: SCORING_SOFT_CAP_MS });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      // ── STAGE 1: extraction ──────────────────────────────────────────────
      const tExtract = Date.now();
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const totalPolylines = bandedge.inner.decimatedContours.length + bandedge.outer.decimatedContours.length;
      crumb('extract-done', {
        ms: Date.now() - tExtract, totalPts: bandedge.totalPts, totalPolylines,
        innerPolylines: bandedge.inner.decimatedContours.length, outerPolylines: bandedge.outer.decimatedContours.length,
      });

      // ── STAGE 2: fanRepair build (A2, so nonMan doesn't confound) ────────
      const tBuild = Date.now();
      const build = buildFanRepairOuter(rA, bandedge);
      crumb('build-done', {
        ms: Date.now() - tBuild, hash: build.hash, fullTris: build.fullTris, outerTris: build.outerTris, uBias: build.uBias,
      });
      writeFileSync(join(OUT_DIR, 'armA3_char_build_meta.json'), JSON.stringify({
        hash: build.hash, expectHash: EXPECT_FANREPAIR_HASH, fullTris: build.fullTris, outerTris: build.outerTris,
      }));
      expect(
        build.hash,
        'fanRepair full-mesh hash must reproduce the A1-proven banked value -- non-vacuity witness that this IS the champion construction',
      ).toBe(EXPECT_FANREPAIR_HASH);

      const scoringStart = Date.now();

      // ── STAGE 3: full radial prescreen (cheap -- banked empirical ~49s) ──
      const tPrescreen = Date.now();
      const { recs, nFacets } = gpcPrescreenDetail(build.outerXyz, build.outerIdx, rA, H, TOL);
      crumb('prescreen-done', {
        ms: Date.now() - tPrescreen, survivors: recs.length, nFacets,
        survivorPct: +(100 * recs.length / nFacets).toFixed(3),
      });
      writeFileSync(join(OUT_DIR, 'armA3_char_prescreen_meta.json'), JSON.stringify({
        survivors: recs.length, nFacets, bankedSurvivorsOff: 236185,
      }));

      // ── STAGE 4a: exhaustive top-K worst-radial Newton confirm (Newton-worst cross-check) ───
      const tTopK = Date.now();
      const byRadialDesc = recs.slice().sort((a, b) => b.radial - a.radial).slice(0, Math.min(TOPK_EXHAUSTIVE, recs.length));
      const topKFacetSet = new Set(byRadialDesc.map((r) => r.f));
      const confirmed = new Map<number, Confirmed>();
      let newtonWorstObserved = 0;
      for (const r of byRadialDesc) {
        const nd = Math.min(r.radial, newtonNearest(rA, H, r.x, r.y, r.z, NEWTON_OPTS).dist);
        if (nd > newtonWorstObserved) newtonWorstObserved = nd;
        if (nd > TOL) {
          const [u, t] = xyzToUt(r.x, r.y, r.z, H);
          confirmed.set(r.f, { f: r.f, u, t, newton: nd, radial: r.radial, source: 'topK' });
        }
      }
      crumb('topK-done', { ms: Date.now() - tTopK, n: byRadialDesc.length, confirmedSoFar: confirmed.size, newtonWorstObserved });
      writeFileSync(join(OUT_DIR, 'armA3_char_topk_sanity.json'), JSON.stringify({
        newtonWorstObserved, bankedNewtonWorst: 0.02491654414922634,
        deltaPct: +(100 * (newtonWorstObserved - 0.02491654414922634) / 0.02491654414922634).toFixed(4),
        confirmedInTopK: confirmed.size, topKCount: byRadialDesc.length,
      }));

      // ── STAGE 4b: spatially-EVEN (low-discrepancy + shuffled) stride Newton confirm,
      // adaptively time-budgeted against the 22-minute scoring soft-cap ───────────────────────
      const strideDeadline = scoringStart + SCORING_SOFT_CAP_MS - RESERVE_POST_MS;
      const remainMsForStride = Math.max(0, strideDeadline - Date.now());
      const target = Math.max(500, Math.floor(remainMsForStride / ASSUMED_MS_PER_QUERY));
      const candidateIdx: number[] = [];
      for (let i = 0; i < recs.length; i++) if (!topKFacetSet.has(recs[i].f)) candidateIdx.push(i);
      const selected = evenSelect(candidateIdx.length, target);
      shuffleInPlace(selected, mulberry32(0xa3feed));
      crumb('stride-plan', { candidatePool: candidateIdx.length, target, remainMsForStride, assumedMsPerQuery: ASSUMED_MS_PER_QUERY });

      const loopStart = Date.now();
      let lastCrumbTs = loopStart;
      let truncated = false;
      let truncatedNote = '';
      let kDone = 0;
      for (let k = 0; k < selected.length; k++) {
        const rec = recs[candidateIdx[selected[k]]];
        const nd = Math.min(rec.radial, newtonNearest(rA, H, rec.x, rec.y, rec.z, NEWTON_OPTS).dist);
        if (nd > newtonWorstObserved) newtonWorstObserved = nd;
        if (nd > TOL) {
          const [u, t] = xyzToUt(rec.x, rec.y, rec.z, H);
          confirmed.set(rec.f, { f: rec.f, u, t, newton: nd, radial: rec.radial, source: 'stride' });
        }
        kDone = k + 1;

        if (Date.now() - lastCrumbTs > 30000) {
          crumb('stride-progress', { kDone, total: selected.length, confirmedSoFar: confirmed.size, elapsedMs: Date.now() - loopStart });
          writeFileSync(join(OUT_DIR, 'armA3_char_confirmed_partial.json'), JSON.stringify([...confirmed.values()]));
          lastCrumbTs = Date.now();
        }
        if (Date.now() > strideDeadline) {
          truncated = true;
          const rate = (Date.now() - loopStart) / kDone;
          const projectedFullMin = (selected.length * rate) / 60000;
          truncatedNote =
            `stride loop TRUNCATED at ${kDone}/${selected.length} (${(100 * kDone / selected.length).toFixed(1)}%) ` +
            `after ${((Date.now() - loopStart) / 1000).toFixed(0)}s; projected full completion at this rate ` +
            `~${projectedFullMin.toFixed(1)}min (vs ${(SCORING_SOFT_CAP_MS / 60000).toFixed(0)}min soft cap). ` +
            'Processing order is a shuffled low-discrepancy spread, so this truncated prefix remains an unbiased domain sample.';
          crumb('stride-TRUNCATED', { kDone, total: selected.length, note: truncatedNote });
          break;
        }
      }
      crumb('stride-done', { ms: Date.now() - loopStart, kDone, total: selected.length, truncated, confirmedTotal: confirmed.size });
      writeFileSync(join(OUT_DIR, 'armA3_char_confirmed_partial.json'), JSON.stringify([...confirmed.values()]));

      // ── STAGE 4c: fold in the FREE banked 'off'-policy scatter (400 raw / ~200 unique --
      // policy-invariant per A1: fidelity numbers reproduce bit-identically fanRepair vs off) --
      // zero-cost bonus sample from an independent prior run. ──────────────────────────────────
      let bankedFolded = 0;
      try {
        const bankedPath = join('research', 'exchange', '_gyroid_bandedge', 'verdict_strat.json');
        if (existsSync(bankedPath)) {
          const banked = JSON.parse(readFileSync(bankedPath, 'utf8')) as {
            scatter?: Array<{ u: number; t: number; newton: number }>;
          };
          const seenUt = new Set<string>();
          let synthKey = -1;
          for (const s of banked.scatter ?? []) {
            const key = `${s.u.toFixed(5)},${s.t.toFixed(5)}`;
            if (seenUt.has(key)) continue;
            seenUt.add(key);
            if (s.newton > TOL) {
              confirmed.set(synthKey--, { f: -1, u: s.u, t: s.t, newton: s.newton, radial: s.newton, source: 'bankedScatter' });
              bankedFolded++;
            }
          }
        }
      } catch (err) {
        crumb('banked-scatter-fold-FAILED', { err: err instanceof Error ? err.message : String(err) });
      }
      crumb('banked-scatter-folded', { bankedFolded, confirmedTotal: confirmed.size });

      // ── STAGE 5: contour attribution (nearest contour point -> polyline + along-poly position) ──
      const tAttr = Date.now();
      const ci = buildContourIndex(bandedge);
      const attributed: AttrConfirmed[] = [];
      for (const c of confirmed.values()) {
        const near = nearestContourPoint(ci, c.u, c.t);
        const absVal = Math.abs(gyroidVal(c.u, c.t, GBE_FIELD));
        attributed.push({
          ...c, nearestPoly: near.poly, nearestPtIdx: near.ptIdx, nearestIsInner: near.isInner, nearestDist: near.dist,
          alongFrac: near.polyLen > 1 ? near.ptIdx / (near.polyLen - 1) : 0,
          absValAtPt: absVal, dEdgeIso: Math.min(Math.abs(absVal - 0.135), Math.abs(absVal - 0.15)),
        });
      }
      crumb('attribution-done', { ms: Date.now() - tAttr, n: attributed.length });
      writeFileSync(join(OUT_DIR, 'armA3_char_confirmed.json'), JSON.stringify(attributed));

      // ── STAGE 6: spatial clustering (greedy, order-sensitive -- matches the A4 clusterReps
      // convention) at a radius sweep, + a RAREFACTION/saturation curve over the randomized
      // stride-ordered subset (topK + bankedScatter EXCLUDED -- both are biased samples: topK
      // toward extreme values, bankedScatter toward a capped/older sample) -- the direct
      // point-class/edge-class discriminator: does the distinct-cluster count SATURATE as more of
      // the domain is sampled, or keep growing? ────────────────────────────────────────────────
      const allPts = attributed.map((a) => ({ u: a.u, t: a.t }));
      const clusterSweep = CLUSTER_RADII_SWEEP.map((radius) => {
        const reps = clusterAt(allPts, radius);
        return { radius, nClusters: reps.length, nConfirmed: allPts.length, compaction: +(allPts.length / Math.max(1, reps.length)).toFixed(2) };
      });
      const primaryReps = clusterAt(allPts, CLUSTER_RADIUS_PRIMARY);
      crumb('clustering-done', { sweep: clusterSweep, primaryClusters: primaryReps.length });
      writeFileSync(join(OUT_DIR, 'armA3_char_clusters.json'), JSON.stringify(primaryReps));

      const strideOrdered = attributed.filter((a) => a.source === 'stride');
      const satReps: Array<{ u: number; t: number; members: number }> = [];
      const satCurve: Array<{ n: number; distinctClusters: number }> = [];
      for (let i = 0; i < strideOrdered.length; i++) {
        const p = strideOrdered[i];
        let placed = false;
        for (const rep of satReps) {
          if (Math.hypot(uDist(p.u, rep.u), p.t - rep.t) <= CLUSTER_RADIUS_PRIMARY) { rep.members++; placed = true; break; }
        }
        if (!placed) satReps.push({ u: p.u, t: p.t, members: 1 });
        if ((i + 1) % Math.max(1, Math.floor(strideOrdered.length / 20)) === 0 || i === strideOrdered.length - 1) {
          satCurve.push({ n: i + 1, distinctClusters: satReps.length });
        }
      }
      const half = Math.floor(satCurve.length / 2);
      let secondHalfNewClusterRate = 0;
      if (satCurve.length >= 2) {
        const atHalf = satCurve[Math.max(0, half - 1)];
        const atEnd = satCurve[satCurve.length - 1];
        const dN = atEnd.n - atHalf.n, dC = atEnd.distinctClusters - atHalf.distinctClusters;
        secondHalfNewClusterRate = dN > 0 ? dC / dN : 0;
      }
      crumb('saturation-curve-done', { curve: satCurve, secondHalfNewClusterRate: +secondHalfNewClusterRate.toFixed(4) });

      // ── STAGE 7: polyline coverage + per-polyline along-contour span ─────────────────────────
      const touchedPolys = new Map<number, AttrConfirmed[]>();
      for (const a of attributed) {
        if (!touchedPolys.has(a.nearestPoly)) touchedPolys.set(a.nearestPoly, []);
        touchedPolys.get(a.nearestPoly)!.push(a);
      }
      const polylineFrac = touchedPolys.size / totalPolylines;
      const perPolySpans: number[] = [];
      const perPolyDensity: number[] = [];
      for (const [, list] of touchedPolys) {
        if (list.length >= 2) {
          const fracs = list.map((a) => a.alongFrac);
          perPolySpans.push(Math.max(...fracs) - Math.min(...fracs));
        }
        perPolyDensity.push(list.length / Math.max(1, ci.polyLen[list[0].nearestPoly]));
      }
      const alongFracStats = percentiles(attributed.map((a) => a.alongFrac));
      const acrossDistStats = percentiles(attributed.map((a) => a.nearestDist));
      const spanStats = percentiles(perPolySpans);
      const densityStats = percentiles(perPolyDensity);
      crumb('polyline-coverage-done', {
        touchedPolylines: touchedPolys.size, totalPolylines, polylineFrac: +polylineFrac.toFixed(4), spanStats, densityStats,
      });

      // ── STAGE 8: coarse ASCII occupancy map (cheap visual evidence -- '.'=contour,
      // '#'=confirmed outlier) ──────────────────────────────────────────────────────────────────
      const COLS = 100, ROWS = 40;
      const grid: string[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(' '));
      for (let i = 0; i < ci.n; i++) {
        const col = Math.min(COLS - 1, Math.floor(ci.u[i] * COLS));
        const row = Math.min(ROWS - 1, Math.floor(ci.t[i] * ROWS));
        if (grid[row][col] === ' ') grid[row][col] = '.';
      }
      for (const a of attributed) {
        const col = Math.min(COLS - 1, Math.floor((a.u - Math.floor(a.u)) * COLS));
        const row = Math.min(ROWS - 1, Math.floor(a.t * ROWS));
        grid[row][col] = '#';
      }
      const asciiMap = grid.map((r) => r.join('')).join('\n');
      writeFileSync(join(OUT_DIR, 'armA3_char_heatmap.txt'), asciiMap);

      // ── STAGE 9: VERDICT (pre-registered thresholds, declared at top of file) ────────────────
      const primaryCompaction = clusterSweep.find((c) => c.radius === CLUSTER_RADIUS_PRIMARY)!.compaction;
      const primaryClusters = primaryReps.length;
      const pointClassSignal =
        polylineFrac <= POINT_CLASS_MAX_POLYLINE_FRAC &&
        primaryCompaction >= POINT_CLASS_MIN_COMPACTION &&
        secondHalfNewClusterRate <= SATURATION_POINT_MAX_RATE;
      const edgeClassSignal =
        polylineFrac >= EDGE_CLASS_MIN_POLYLINE_FRAC ||
        primaryCompaction < EDGE_CLASS_MAX_COMPACTION ||
        secondHalfNewClusterRate >= SATURATION_EDGE_MIN_RATE;
      let verdict: string;
      if (pointClassSignal && !edgeClassSignal) verdict = 'POINT-CLASS';
      else if (edgeClassSignal && !pointClassSignal) verdict = 'EDGE-CLASS';
      else verdict = 'AMBIGUOUS/MIXED';

      const summary = {
        experiment: 'E-2026-07-11-TIERC-HEADTOHEAD Arm A3 characterization',
        at: new Date().toISOString(),
        budget: {
          totalBudgetMs: TOTAL_BUDGET_MS, scoringSoftCapMs: SCORING_SOFT_CAP_MS,
          elapsedMs: Date.now() - t0, scoringTruncated: truncated, truncatedNote,
        },
        build: { hash: build.hash, expectHash: EXPECT_FANREPAIR_HASH, fullTris: build.fullTris, outerTris: build.outerTris },
        extraction: { totalPts: bandedge.totalPts, totalPolylines },
        prescreen: { survivors: recs.length, nFacets },
        newtonSanity: { newtonWorstObserved, bankedNewtonWorst: 0.02491654414922634 },
        sampling: {
          topKExhaustive: byRadialDesc.length,
          strideTargeted: selected.length, strideProcessed: kDone, strideTruncated: truncated,
          bankedScatterFolded: bankedFolded,
          totalConfirmed: attributed.length,
          confirmedBySource: {
            topK: attributed.filter((a) => a.source === 'topK').length,
            stride: attributed.filter((a) => a.source === 'stride').length,
            bankedScatter: attributed.filter((a) => a.source === 'bankedScatter').length,
          },
        },
        clustering: { sweep: clusterSweep, primaryRadius: CLUSTER_RADIUS_PRIMARY, primaryClusters, primaryCompaction },
        saturation: { curve: satCurve, secondHalfNewClusterRate: +secondHalfNewClusterRate.toFixed(4), sampleSizeForCurve: strideOrdered.length },
        polylineCoverage: { touchedPolylines: touchedPolys.size, totalPolylines, polylineFrac: +polylineFrac.toFixed(4) },
        alongVsAcross: { alongFracStats, acrossDistStats, perPolylineSpanStats: spanStats, perPolylineDensityStats: densityStats },
        thresholds: {
          POINT_CLASS_MAX_POLYLINE_FRAC, POINT_CLASS_MIN_COMPACTION,
          EDGE_CLASS_MIN_POLYLINE_FRAC, EDGE_CLASS_MAX_COMPACTION,
          SATURATION_POINT_MAX_RATE, SATURATION_EDGE_MIN_RATE,
        },
        verdict, pointClassSignal, edgeClassSignal,
      };
      writeFileSync(join(OUT_DIR, 'armA3_char_summary.json'), JSON.stringify(summary, null, 2));
      crumb('DONE', {
        verdict, polylineFrac: +polylineFrac.toFixed(4), primaryClusters, primaryCompaction,
        secondHalfNewClusterRate: +secondHalfNewClusterRate.toFixed(4), totalMs: Date.now() - t0,
      });
      // eslint-disable-next-line no-console
      console.log(`[armA3-char] DONE\n${JSON.stringify(summary, null, 2)}`);
      // eslint-disable-next-line no-console
      console.log(`[armA3-char] ASCII map (u 0..1 -> cols, t 0..1 -> rows, .=contour #=confirmed-outlier):\n${asciiMap}`);

      expect(attributed.length, 'confirmed-outlier population must be non-vacuous').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
