// _tierc_fullpot_scaling.test.ts — FULL-POT TRACTABILITY of the C2 analytic-surface lever.
//
// QUESTION (adjudication): is full-pot Gothic/GeoStar literal-0.01 via the analytic lever
// (surfaceSource:'analytic') tractable, and if not, what must be parallelized/optimized? The prior
// corpus called full-pot "multi-day, intractable" — but that was measured on the GRID-BOUND sampler
// kernel, NOT the analytic lever. This probe re-measures the ANALYTIC path at increasing domains,
// derives a cost model (tris/area, ms/final-tri), and projects full-pot single-thread + parallelized.
//
// METHOD — measure the runnable domains, EXTRAPOLATE full-pot (never run a multi-hour full-pot):
//   Both styles, analytic mode, at increasing (u,t) area, each wall-clock-bounded (a budget abort is
//   an honest PARTIAL, never discarded — mirrors _tierc_geostar_c2.test.ts's runBounded). Per-pass
//   nTris/ms/dense/outliers/bruteCalls are crumbed the INSTANT computed; a verdict JSON is rewritten
//   after every stage. The COST DECOMPOSITION is the deliverable:
//     tRefine        = wall time of refineToZeroOutliers
//     sumPassMs      = Σ per-pass ms (lift + score + insert; scoring dominates)
//     densePassMs    = Σ ms of dense passes         → the PARALLELIZABLE per-facet scoring work
//     phaseAMs       = Σ ms of 7-pt PHASE-A passes  → sequential in the existing parallel path
//     serialRemainMs = tRefine − sumPassMs          → CDT (re-triangulate whole point set/pass) +
//                                                      seed + between-pass lift = INHERENTLY SERIAL
//   Full-pot projection uses tris/area (from the converged domains) × full area (1.0), and
//   ms/final-tri × projected tris. Parallelizable fraction = densePassMs / tRefine; Amdahl with the
//   measured parallelScorer 2.94× (sampler-grid figure; the analytic per-facet cost is HIGHER
//   arithmetic-intensity ⇒ 2.94× is a conservative FLOOR for the analytic case).
//
// DOMAIN LADDER (gaCounts=12 ⇒ Gothic bay u-width 1/12≈0.0833; gsPoints=8 ⇒ GeoStar bay 1/8=0.125):
//   GeoStar (cheap, converges — the clean 3-point scaling anchor):
//     GS_CI   u[0,0.05]  t[0.35,0.40] nTheta256  — control, reproduces the committed 5071/22s point.
//     GS_BAND u[0,0.1]   t[0.40,0.60] nTheta1024 — mission (c): the LIVE wholeMesh0Outlier GeoStar
//             production-gate domain (8× CI area).
//     GS_BAY  u[0,0.125] t[0,1]       nTheta256  — mission (b): one full 45° sector, full height
//             (50× CI area). Bounded; converges-or-partial.
//   Gothic (expensive — CI already 352s; larger domains are bounded PARTIALS, the "where does it
//   plateau" finding the mission anticipates; the converged CI point is cited from the committed run):
//     G_BAND  u[0,0.1]   t[0.38,0.62] nTheta1024 — mission (c): production band (~4.8× CI area).
//     G_BAY   u[0,0.0833] t[0,1]      nTheta512  — mission (b): one arch bay, full height (~16.7× CI).
//   Gothic CI (u[0,0.125] t[0.48,0.52] nTheta512) = committed 18045 tris / 8 passes / 352.2s
//   (research/exchange/tierc/analytic_ship_gothic_verdict.json, same machine, 2026-07-12) — cited, not
//   re-run (saves ~6min of redundant compute; the analytic build is deterministic).
//
// Run (ONE env-gated it() per process — serialize for clean uncontended timing; resumable):
//   NODE_OPTIONS=--max-old-space-size=12288 PF_FP_GS_CI=1   node node_modules/vitest/vitest.mjs run --config vitest.tierc_fullpot_scaling.config.ts
//   NODE_OPTIONS=--max-old-space-size=12288 PF_FP_GS_BAND=1 node node_modules/vitest/vitest.mjs run --config vitest.tierc_fullpot_scaling.config.ts
//   NODE_OPTIONS=--max-old-space-size=12288 PF_FP_GS_BAY=1  node node_modules/vitest/vitest.mjs run --config vitest.tierc_fullpot_scaling.config.ts
//   NODE_OPTIONS=--max-old-space-size=12288 PF_FP_G_BAND=1  node node_modules/vitest/vitest.mjs run --config vitest.tierc_fullpot_scaling.config.ts
//   NODE_OPTIONS=--max-old-space-size=12288 PF_FP_G_BAY=1   node node_modules/vitest/vitest.mjs run --config vitest.tierc_fullpot_scaling.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only. NEW FILE — every kernel/ruler import is
// READ-ONLY (the C2 lever is committed in noBridgeRefine.ts). Commits nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { buildRadiusFn, nonManRawBigStats } from './labkit';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
  type RefineOptions,
  type RefinePassStat,
  type RefineResult,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import {
  DEFAULT_RULER,
  liftChartMesh,
  analyticSurfaceSampler,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import { topologyMetric, triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'fullpot_scaling_crumbs.ndjson');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TOL = 0.01;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ probe: 'fullpot-scaling', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

/** interior edge shared by >2 tris = non-manifold (verbatim port of the committed harness helper). */
function nonManifoldByIndex(tris: ArrayLike<number>): number {
  const use = new Map<string, number>();
  for (let f = 0; f < tris.length / 3; f++) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const n of use.values()) if (n > 2) bad++;
  return bad;
}

/**
 * Wall-clock-bounded refine (verbatim pattern from _tierc_geostar_c2.test.ts). The kernel is
 * synchronous/uninterruptible mid-pass; onPass is the only yield point, so abort granularity is the
 * next pass boundary. A budget abort is an honest PARTIAL. Captures per-pass stats into `stats`.
 */
function runBounded(
  sampler: ReturnType<typeof styleSampler>,
  complex: ReturnType<typeof buildProtectedComplex>,
  domain: ChartDomain,
  opts: RefineOptions,
  budgetMs: number,
  label: string,
  stats: RefinePassStat[],
): { result?: RefineResult; lastStat?: RefinePassStat; aborted: boolean; ms: number } {
  const t0 = Date.now();
  let lastStat: RefinePassStat | undefined;
  let aborted = false;
  try {
    const result = refineToZeroOutliers(sampler, complex, domain, opts, (s) => {
      lastStat = s;
      stats.push(s);
      crumb(`${label}-pass`, {
        pass: s.pass,
        dense: s.dense,
        tris: s.nTris,
        outliers: s.outliers,
        worstMm: +s.worstMm.toFixed(5),
        inserted: s.inserted,
        bruteCalls: s.bruteCalls,
        ms: s.ms,
        elapsedMs: Date.now() - t0,
      });
      if (Date.now() - t0 > budgetMs) {
        aborted = true;
        throw new Error('PF_FP_BUDGET_ABORT');
      }
    });
    return { result, lastStat, aborted: false, ms: Date.now() - t0 };
  } catch (e) {
    if (aborted) return { lastStat, aborted: true, ms: Date.now() - t0 };
    throw e; // a genuine error — do not swallow
  }
}

/** Cost decomposition from the captured per-pass stats + the total refine wall time. */
function costModel(stats: RefinePassStat[], tRefineMs: number): {
  sumPassMs: number;
  densePassMs: number;
  phaseAMs: number;
  serialRemainMs: number;
  parallelFraction: number;
} {
  let sumPassMs = 0;
  let densePassMs = 0;
  let phaseAMs = 0;
  for (const s of stats) {
    sumPassMs += s.ms;
    if (s.dense) densePassMs += s.ms;
    else phaseAMs += s.ms;
  }
  const serialRemainMs = Math.max(0, tRefineMs - sumPassMs);
  return {
    sumPassMs,
    densePassMs,
    phaseAMs,
    serialRemainMs,
    parallelFraction: tRefineMs > 0 ? densePassMs / tRefineMs : 0,
  };
}

/**
 * The one measured domain runner. Builds the analytic-mode mesh under a wall-clock budget, decomposes
 * the cost, verifies the converged mesh vs the EXACT analytic surface (literal stride=1 — cheap on a
 * converged mesh per C2-full-patch-verdict.md), and writes a verdict JSON. A budget-aborted build is
 * reported build-only (the kernel returns no usable snapshot on a thrown abort).
 */
function runDomain(
  styleId: StyleId,
  domain: ChartDomain,
  nTheta: number,
  bgArcMm: number,
  budgetMs: number,
  label: string,
): void {
  const tStart = Date.now();
  const heapMB = Math.round(getHeapStatistics().heap_size_limit / 1048576);
  crumb(`${label}-start`, { style: styleId, domain, nTheta, bgArcMm, budgetMs, heapLimitMB: heapMB });
  expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child').toBeGreaterThanOrEqual(9000);

  const area = (domain.uHi - domain.uLo) * (domain.tHi - domain.tLo);
  const analyticRA = buildRadiusFn(styleId, {}, DIMS);
  const { H } = DIMS;

  const sampler = styleSampler(styleId, {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
  const tComplex0 = Date.now();
  const complex = buildProtectedComplex(sampler, styleId);
  const complexMs = Date.now() - tComplex0;
  expect(complex.residualCrossings).toBe(0);
  crumb(`${label}-complex`, { residualCrossings: complex.residualCrossings, verts: complex.vertices.length / 2, edges: complex.edges.length, complexMs });

  const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta, thetaWindowRad: 0.5 };
  const stats: RefinePassStat[] = [];
  const built = runBounded(
    sampler,
    complex,
    domain,
    { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm, ruler: loopRuler, surfaceSource: 'analytic', analyticRA },
    budgetMs,
    label,
    stats,
  );
  const cost = costModel(stats, built.ms);
  const lastTris = built.result ? built.result.tris.length / 3 : built.lastStat?.nTris ?? 0;
  crumb(`${label}-build-done`, {
    aborted: built.aborted,
    refineMs: built.ms,
    complexMs,
    tris: lastTris,
    passes: built.result?.passes,
    capped: built.result?.capped,
    area,
    trisPerArea: area > 0 ? Math.round(lastTris / area) : null,
    msPerTri: lastTris > 0 ? +(built.ms / lastTris).toFixed(3) : null,
    ...cost,
    parallelFractionPct: +(cost.parallelFraction * 100).toFixed(1),
  });

  const baseVerdict = {
    style: styleId,
    domain,
    nTheta,
    bgArcMm,
    budgetMs,
    area,
    aborted: built.aborted,
    refineMs: built.ms,
    complexMs,
    tris: lastTris,
    passes: built.result?.passes,
    capped: built.result?.capped,
    lastStat: built.lastStat,
    cost: {
      ...cost,
      parallelFractionPct: +(cost.parallelFraction * 100).toFixed(1),
      // Amdahl on the DENSE scoring only (7-pt PHASE-A stays sequential in the existing parallel
      // path; serialRemain = CDT/seed/lift is also sequential). 2.94x = measured parallelScorer
      // sampler-grid figure — a conservative FLOOR for analytic (higher arithmetic intensity).
      amdahlSpeedupAt2p94x:
        built.ms > 0
          ? +(built.ms / (built.ms - cost.densePassMs + cost.densePassMs / 2.94)).toFixed(3)
          : null,
    },
    perAreaModel: {
      trisPerArea: area > 0 ? Math.round(lastTris / area) : null,
      msPerTri: lastTris > 0 ? +(built.ms / lastTris).toFixed(3) : null,
      // Projected full-pot (area=1.0) IF this domain's density is representative (flagged: it is NOT
      // — a patch sits on a feature-specific band; the whole-pot value is the aggregate finding).
      projFullPotTris: area > 0 ? Math.round(lastTris / area) : null,
      projFullPotSingleThreadSec:
        area > 0 && lastTris > 0 ? +(((lastTris / area) * (built.ms / lastTris)) / 1000).toFixed(0) : null,
    },
  };
  const VERDICT_PATH = join(OUT_DIR, `fullpot_${label}_verdict.json`);
  writeFileSync(VERDICT_PATH, JSON.stringify({ stage: 'build-only', ...baseVerdict }, null, 2));

  if (!built.result) {
    const summary = {
      verdict: 'BUILD-BUDGET-ABORTED (partial — trajectory in lastStat + *-pass crumbs)',
      note: 'refineToZeroOutliers threw at the wall-clock boundary before returning a usable (uv,tris) snapshot; only per-pass COUNTS survive. Honest partial: NOT converged within budget.',
      ...baseVerdict,
      wallTimes: { totalMs: Date.now() - tStart },
    };
    writeFileSync(VERDICT_PATH, JSON.stringify(summary, null, 2));
    crumb(`${label}-done-aborted`, { tris: lastTris, worstMm: built.lastStat?.worstMm, outliers: built.lastStat?.outliers });
    // eslint-disable-next-line no-console
    console.log(`[fp-${label}] ABORTED partial. ${JSON.stringify(summary)}`);
    expect(built.aborted).toBe(true);
    return;
  }

  // Converged (or maxPass-capped) mesh — audit + literal-scan score vs the EXACT analytic surface.
  const refined = built.result;
  const analyticLift = analyticSurfaceSampler(analyticRA, H);
  const xyz = liftChartMesh(analyticLift, refined.uv);
  const idx = refined.tris;
  const nonMan = nonManifoldByIndex(idx);
  const cracked = idx.slice();
  cracked.push(idx[0], idx[1], idx[2]);
  const nonManControlMoved = nonManifoldByIndex(cracked) > nonMan;
  const rawStats = nonManRawBigStats(Uint32Array.from(idx));
  const topo = topologyMetric({ vertices: Float32Array.from(xyz), indices: Uint32Array.from(idx) }, 1e-4);
  const quality = triangleQualityDistribution({ vertices: Float32Array.from(xyz), indices: Uint32Array.from(idx) });

  const score = scoreWholeMeshInterior(Float32Array.from(xyz), Uint32Array.from(idx), analyticRA, H, { tol: TOL, stride: 1 });
  crumb(`${label}-score`, {
    tris: idx.length / 3,
    scanned: score.scannedFacets,
    interiorOutliers: score.interiorOutliers,
    wholeMeshMaxMm: score.wholeMeshMaxMm,
    p99: score.p99,
    nonMan,
  });

  const converged = !refined.capped && score.interiorOutliers === 0 && score.wholeMeshMaxMm <= TOL;
  const summary = {
    verdict: converged ? 'CONVERGED (0 outliers <=0.01 vs analytic, literal scan)' : 'CAPPED/RESIDUAL (see score)',
    ...baseVerdict,
    watertight: { nonMan, nonManControlMoved, rawNonMan: rawStats.nonMan, orientationMismatches: topo.orientationMismatches },
    quality: { minAngleDeg: quality.minAngleDeg, degenerateCount: quality.degenerateCount },
    scoreVsAnalytic: {
      scanned: score.scannedFacets,
      interiorOutliers: score.interiorOutliers,
      wholeMeshMaxMm: score.wholeMeshMaxMm,
      p50: score.p50,
      p90: score.p90,
      p99: score.p99,
    },
    wallTimes: { totalMs: Date.now() - tStart },
  };
  writeFileSync(VERDICT_PATH, JSON.stringify(summary, null, 2));
  crumb(`${label}-done`, { verdict: summary.verdict, tris: idx.length / 3, refineMs: built.ms, parallelFractionPct: summary.cost.parallelFractionPct });
  // eslint-disable-next-line no-console
  console.log(`[fp-${label}] ${JSON.stringify(summary)}`);
  expect(nonMan).toBe(0);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// One env-gated it() per (style, domain) — independently resumable per LAB-CHEATSHEET resilience.
// ════════════════════════════════════════════════════════════════════════════════════════════════
describe.skipIf(process.env.PF_FP_GS_CI !== '1')('full-pot scaling — GeoStar CI control', () => {
  it('GS_CI analytic build (reproduces the committed 5071/22s anchor)', () => {
    runDomain('GeometricStar', { uLo: 0, uHi: 0.05, tLo: 0.35, tHi: 0.4 }, 256, 0.6, 5 * 60 * 1000, 'GS_CI');
  }, 6 * 60 * 1000);
});

describe.skipIf(process.env.PF_FP_GS_BAND !== '1')('full-pot scaling — GeoStar production band (c)', () => {
  it('GS_BAND analytic build (live wholeMesh0Outlier GeoStar gate domain, nTheta1024)', () => {
    runDomain('GeometricStar', { uLo: 0, uHi: 0.1, tLo: 0.4, tHi: 0.6 }, 1024, 0.6, 14 * 60 * 1000, 'GS_BAND');
  }, 16 * 60 * 1000);
});

describe.skipIf(process.env.PF_FP_GS_BAY !== '1')('full-pot scaling — GeoStar single-bay full-height (b)', () => {
  it('GS_BAY analytic build (one 45deg sector, full height)', () => {
    runDomain('GeometricStar', { uLo: 0, uHi: 0.125, tLo: 0, tHi: 1 }, 256, 0.6, 14 * 60 * 1000, 'GS_BAY');
  }, 16 * 60 * 1000);
});

describe.skipIf(process.env.PF_FP_G_BAND !== '1')('full-pot scaling — Gothic production band (c)', () => {
  it('G_BAND analytic build (bounded; production band trajectory)', () => {
    runDomain('GothicArches', { uLo: 0, uHi: 0.1, tLo: 0.38, tHi: 0.62 }, 1024, 0.6, 13 * 60 * 1000, 'G_BAND');
  }, 15 * 60 * 1000);
});

describe.skipIf(process.env.PF_FP_G_BAY !== '1')('full-pot scaling — Gothic single-bay full-height (b)', () => {
  it('G_BAY analytic build (bounded; one arch bay full height trajectory)', () => {
    runDomain('GothicArches', { uLo: 0, uHi: 0.0833, tLo: 0, tHi: 1 }, 512, 0.6, 13 * 60 * 1000, 'G_BAY');
  }, 15 * 60 * 1000);
});
