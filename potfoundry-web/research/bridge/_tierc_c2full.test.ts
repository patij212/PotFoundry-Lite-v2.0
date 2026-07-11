// _tierc_c2full.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm C2 FULL-PATCH CONFIRM (the deferred C2
// question, per research/lab/tierc/C2-analytic-surface-verdict.md "Honest limitation": C2 proved
// surfaceSource:'analytic' makes a SMALL crest sub-patch faithful to the exact analytic surface
// (0.24mm -> 0.005mm, triple-independent) but explicitly deferred the FULL 9917-facet CI smoke patch
// (u[0,0.125] t[0.48,0.52] bgArc 0.6 nTheta 512) as "expensive" / "the remaining C2 follow-up".
//
// THIS FILE runs that follow-up: builds the FULL patch TWICE via the SAME K2 kernel entry point
// wholeMesh0Outlier.test.ts's runPatchGate uses (surfaceSource 'sampler' vs 'analytic') and scores
// BOTH against the EXACT analytic surface (getManifest('GothicArches').truth.rA / buildRadiusFn) —
// not the 512^2 grid the sampler-mode build targets and the live CI gate checks.
//
// COST MODEL (measured empirically from research/exchange/tierc/armC1_diag_crumbs.ndjson +
// armC2_crumbs.ndjson, reused here rather than guessed): `scoreWholeMeshInterior`'s cost is asymmetric
// — a facet that FAILS its cheap 4-point GN screen advances to a 45-point honest ruler with a
// full-azimuth brute fallback (measured ~1.4-2s per SCANNED facet when ~70-97% of scanned facets
// advance, exactly what C1 found for the sampler-built mesh vs analytic: armC1_diag's
// k2@analytic-strided = 414 facets / 33.8s = 82ms/facet via the CHEAPER facetInteriorHonest; the
// harness's own scoreWholeMeshInterior measured SLOWER still on the small sampler-mode patch in
// armC2 PART2: 61 scanned / 87.5s = 1.4s/facet). A facet that PASSES the cheap screen (already <=tol,
// as EVERY facet on a converged analytic-built mesh does BY CONSTRUCTION) resolves in <1ms — armC2
// PART2's after_harness: 61 facets, "advanced":1, total 10ms. So a CONVERGED analytic-built mesh is
// CHEAP to score even literally (stride=1); a sampler-built mesh scored vs analytic is EXPENSIVE
// (most facets advance) and must be strided. This asymmetry drives the two-phase design below.
//
// PART A (env PF_TIERC_C2FULL_A=1, fast, foreground-safe <10min): sampler-mode FULL CI patch — the
// "before". Reproduces the live CI gate exactly (9917 tris / 7 passes / 0 outliers vs SAMPLER,
// max<=0.0101 — C1's own reproduction target) then STRIDED-scores this SAME mesh against the exact
// analytic rA via scoreWholeMeshInterior (stride sized to ~220 scanned facets — budget-bounded even
// in the pessimistic case where every scanned facet advances to the honest-brute stage). This
// reproduces C1's "~70-97% of facets exceed tol vs analytic" finding at FULL literal CI-gate scale
// using the SAME ruler function (scoreWholeMeshInterior) PART B's "after" number uses, for an
// apples-to-apples before/after (C1 itself used a DIFFERENT function, facetInteriorHonest, for its
// own strided read).
//
// PART B (env PF_TIERC_C2FULL_B=1, SLOW, meant to run in the background): analytic-mode FULL CI patch
// build — the "after", the deferred C2 confirm itself. Internally wall-clock-budget-guarded (mirrors
// _tierc_armC2.test.ts's own `runBounded`: refineToZeroOutliers is fully synchronous and
// uninterruptible mid-pass, the onPass callback is the only yield point, so abort granularity is
// "next pass boundary"; a budget-triggered abort is an honest PARTIAL finding, never silently
// discarded). If the build completes (capped:false) within budget, a TWO-PHASE score follows:
//   PHASE 1 — a budget-bounded stride score (~100 scanned facets) as an immediate, always-bounded
//     sanity check of the analytic-built mesh against analytic.
//   PHASE 2 (conditional) — IF phase 1 reads 0 outliers on its sample (indicating convergence) AND
//     the build did not abort, ESCALATE to a LITERAL stride=1 full scan of EVERY facet — cheap by the
//     cost model above, and the strongest possible whole-patch verdict (every single facet checked,
//     not a sample). If phase 1 is nonzero, do NOT escalate (would hit the expensive per-facet path
//     broadly); report the strided estimate + a whole-mesh extrapolation instead, honestly.
// If the BUILD itself is wall-clock-aborted, the honest partial is the last onPass RefinePassStat
// (pass/tris/outliers/worst per the LOOP's OWN internal ruler) — the "where does it plateau" finding
// the mission anticipates, never tuned away. refineToZeroOutliers does not return a usable (uv,tris)
// snapshot on a thrown mid-loop abort (only the onPass stat's COUNTS survive), so an aborted build is
// reported as build-only (no re-score/re-audit possible on that pass — an honest limitation of the
// synchronous kernel, not of this probe).
//
// G3 (orientation) / G7 (boundary, by-index domain classifier — rim of the (u,t) rectangle vs
// strictly interior, the Gyroid A1/A4 defect signature) run on whichever PART B mesh was produced:
// expected clean 0/0 like C1's sampler build (a rectangular open patch legitimately carries rim
// boundary edges; the defect signature is boundary/mismatch edges STRICTLY INTERIOR to the domain).
//
// Checkpointed per LAB-CHEATSHEET resilience doctrine: every pass and every stage's numbers are
// appended to c2full_crumbs.ndjson THE INSTANT they are computed; a verdict JSON is (re)written after
// EVERY major stage (not only at the end) so a killed run's progress is never lost.
//
// Run (two SEPARATE processes):
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_C2FULL_A=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_c2full.config.ts
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_C2FULL_B=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_c2full.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only. NEW FILE ONLY — every kernel/ruler/harness
// import here is READ-ONLY (C2's surfaceSource lever is already committed in noBridgeRefine.ts /
// interiorRuler.ts; this file only USES it via the public RefineOptions.surfaceSource field). Commits
// nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
import { nonManRawBigStats } from './labkit';
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
  radialSurfaceFromSampler,
  analyticSurfaceSampler,
  scoreWholeMesh,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import { topologyMetric, triangleQualityDistribution } from '../../src/fidelity/metrics';

const PART_A = process.env.PF_TIERC_C2FULL_A === '1';
const PART_B = process.env.PF_TIERC_C2FULL_B === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'c2full_crumbs.ndjson');
const VERDICT_A_PATH = join(OUT_DIR, 'c2full_partA_verdict.json');
const VERDICT_B_PATH = join(OUT_DIR, 'c2full_partB_verdict.json');

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'C2-full', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

// Verbatim port of wholeMesh0Outlier.test.ts / _tierc_armC2.test.ts's own local helper — the SAME
// definition the live CI gate uses, so watertight numbers are directly comparable.
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

// Verbatim port of _tierc_armC1_rulerdiag.test.ts / _tierc_armC2.test.ts's by-index boundary DOMAIN
// classifier: rim of the (u,t) rectangle (expected, an open patch) vs strictly interior (the Gyroid
// A1/A4 defect signature).
function boundaryDomainClass(
  uv: ArrayLike<number>,
  tris: ArrayLike<number>,
  domain: ChartDomain,
): { onRect: number; interior: number; interiorSamples: Array<{ u: number; t: number }> } {
  const eps = 1e-7;
  const use = new Map<string, { a: number; b: number; n: number }>();
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
      const hit = use.get(k);
      if (hit) hit.n++;
      else use.set(k, { a: i, b: j, n: 1 });
    }
  }
  let onRect = 0;
  let interior = 0;
  const interiorSamples: Array<{ u: number; t: number }> = [];
  for (const { a, b, n } of use.values()) {
    if (n !== 1) continue;
    const um = (uv[2 * a] + uv[2 * b]) / 2;
    const tm = (uv[2 * a + 1] + uv[2 * b + 1]) / 2;
    const onU = Math.abs(um - domain.uLo) < eps || Math.abs(um - domain.uHi) < eps;
    const onT = Math.abs(tm - domain.tLo) < eps || Math.abs(tm - domain.tHi) < eps;
    if (onU || onT) onRect++;
    else {
      interior++;
      if (interiorSamples.length < 20) interiorSamples.push({ u: um, t: tm });
    }
  }
  return { onRect, interior, interiorSamples };
}

const DIMS = TIERC_COMMON_DIMS;
// wholeMesh0Outlier.test.ts's own pinned smoke-gate domain — the LIVE CI target.
const FULL_DOMAIN: ChartDomain = { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 };
const BG_ARC_MM = 0.6;
const N_THETA = 512;
const TOL = 0.01;

/**
 * Run refineToZeroOutliers under a WALL-CLOCK budget — verbatim pattern from
 * _tierc_armC2.test.ts's `runBounded` (the kernel is fully synchronous / uninterruptible mid-pass,
 * onPass is the only yield point, so abort granularity is "next pass boundary"; a budget-triggered
 * abort is an honest partial, never a silently-discarded error).
 */
function runBounded(
  sampler: ReturnType<typeof styleSampler>,
  complex: ReturnType<typeof buildProtectedComplex>,
  domain: ChartDomain,
  opts: RefineOptions,
  budgetMs: number,
  label: string,
): { result?: RefineResult; lastStat?: RefinePassStat; aborted: boolean; ms: number } {
  const t0 = Date.now();
  let lastStat: RefinePassStat | undefined;
  let aborted = false;
  try {
    const result = refineToZeroOutliers(sampler, complex, domain, opts, (s) => {
      lastStat = s;
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
        throw new Error('PF_C2FULL_BUDGET_ABORT');
      }
    });
    return { result, lastStat, aborted: false, ms: Date.now() - t0 };
  } catch (e) {
    if (aborted) return { lastStat, aborted: true, ms: Date.now() - t0 };
    throw e; // a genuine error — do not swallow
  }
}

/** Strided honest score vs the exact analytic surface, with breadcrumbs on every `progressEvery` hit. */
function stridedScoreVsAnalytic(
  xyz: Float64Array | Float32Array,
  tris: number[],
  analyticRA: (theta: number, z: number) => number,
  H: number,
  targetScanned: number,
  label: string,
): ReturnType<typeof scoreWholeMeshInterior> {
  const nF = tris.length / 3;
  const stride = Math.max(1, Math.floor(nF / targetScanned));
  const t0 = Date.now();
  const result = scoreWholeMeshInterior(Float32Array.from(xyz), Uint32Array.from(tris), analyticRA, H, {
    tol: TOL,
    stride,
    progressEvery: 10,
    onProgress: (done, total, nOut, worst, bruteCalls) => {
      crumb(`${label}-score-progress`, {
        done,
        total,
        nOut,
        worst: +worst.toFixed(6),
        bruteCalls,
        elapsedMs: Date.now() - t0,
      });
    },
  });
  crumb(`${label}-score-done`, {
    nFacets: result.nFacets,
    scannedFacets: result.scannedFacets,
    stride: result.stride,
    interiorOutliers: result.interiorOutliers,
    wholeMeshMaxMm: result.wholeMeshMaxMm,
    p50: result.p50,
    p90: result.p90,
    p99: result.p99,
    advanced: result.advanced,
    bruteCalls: result.bruteCalls,
    ms: Date.now() - t0,
  });
  return result;
}

describe.skipIf(!PART_A)(
  'C2-full PART A — sampler-built FULL CI patch scored vs EXACT analytic (the "before")',
  () => {
    it(
      'reproduces the CI baseline (9917/7/0-vs-sampler) then strided-scores the SAME mesh vs analytic',
      () => {
        const tStart = Date.now();
        const heapMB = Math.round(getHeapStatistics().heap_size_limit / 1048576);
        crumb('partA-start', { heapLimitMB: heapMB });
        expect(
          heapMB,
          'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child',
        ).toBeGreaterThanOrEqual(9000);

        const manifest = getManifest('GothicArches');
        const analyticRA = manifest.truth.rA;
        const { H, Rt, Rb, expn } = DIMS;

        const sampler = styleSampler('GothicArches', {}, { H, Rt, Rb, expn });
        const complex = buildProtectedComplex(sampler, 'GothicArches');
        expect(complex.residualCrossings).toBe(0);
        crumb('partA-complex', { residualCrossings: complex.residualCrossings, ms: Date.now() - tStart });

        const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
        const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
        const tBuild0 = Date.now();
        const refined = refineToZeroOutliers(
          sampler,
          complex,
          FULL_DOMAIN,
          { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: BG_ARC_MM, ruler: loopRuler }, // surfaceSource OMITTED = 'sampler', byte-identical to the live CI gate
          (s) =>
            crumb('partA-pass', {
              pass: s.pass,
              dense: s.dense,
              tris: s.nTris,
              outliers: s.outliers,
              worstMm: +s.worstMm.toFixed(5),
            }),
        );
        const buildMs = Date.now() - tBuild0;
        crumb('partA-build-done', {
          buildMs,
          tris: refined.tris.length / 3,
          passes: refined.passes,
          capped: refined.capped,
        });
        expect(refined.capped).toBe(false);

        const surface = radialSurfaceFromSampler(sampler);
        const guard = scoreWholeMesh(sampler, surface, refined, TOL, guardRuler);
        crumb('partA-ci-guard', { outliers: guard.outliers, maxMm: guard.maxMm, nFacets: guard.nFacets });

        const xyz = liftChartMesh(sampler, refined.uv);
        const idx = refined.tris;
        const nonMan = nonManifoldByIndex(idx);
        const cracked = idx.slice();
        cracked.push(idx[0], idx[1], idx[2]);
        const nonManControlMoved = nonManifoldByIndex(cracked) > nonMan;
        const rawStats = nonManRawBigStats(Uint32Array.from(idx));

        const topo = topologyMetric({ vertices: Float32Array.from(xyz), indices: Uint32Array.from(idx) }, 1e-4);
        const rim = boundaryDomainClass(refined.uv, idx, FULL_DOMAIN);
        const quality = triangleQualityDistribution({ vertices: Float32Array.from(xyz), indices: Uint32Array.from(idx) });
        crumb('partA-topology', {
          orientationMismatches: topo.orientationMismatches,
          boundaryEdges: topo.boundaryEdges,
          rimOnRect: rim.onRect,
          rimInterior: rim.interior,
          nonMan,
          nonManControlMoved,
          rawNonMan: rawStats.nonMan,
        });

        // Checkpoint BEFORE the expensive strided score — if that stage gets killed, this survives.
        const preScore = {
          stage: 'pre-score',
          matchesCiGate:
            refined.tris.length / 3 === 9917 && refined.passes === 7 && guard.outliers === 0 && guard.maxMm <= 0.0101,
          build: { tris: refined.tris.length / 3, passes: refined.passes, capped: refined.capped, buildMs },
          ciGuardVsSampler: { outliers: guard.outliers, maxMm: guard.maxMm },
          watertight: { nonMan, nonManControlMoved, rawNonMan: rawStats.nonMan, rawBoundary: rawStats.boundary },
          topology: {
            orientationMismatches: topo.orientationMismatches,
            boundaryEdges: topo.boundaryEdges,
            rimOnRect: rim.onRect,
            rimStrictlyInterior_defectSignature: rim.interior,
          },
          quality: {
            minAngleDeg: quality.minAngleDeg,
            p5MinAngleDeg: quality.p5MinAngleDeg,
            degenerateCount: quality.degenerateCount,
            pctBelow20: quality.pctBelow20,
          },
        };
        writeFileSync(VERDICT_A_PATH, JSON.stringify(preScore, null, 2));

        // STRIDED honest score of THIS SAME (sampler-built) mesh vs the EXACT analytic surface — the
        // "before" number; budget-bounded (~150 scanned facets, worst case ~2s/facet if every scanned
        // facet advances to the honest-brute stage, per the file-header cost model — trimmed from a
        // larger target to respect the project's SEQUENTIAL heavy-fork policy, PART B is the priority).
        const scoreVsAnalytic = stridedScoreVsAnalytic(xyz, idx, analyticRA, H, 150, 'partA-samplerBuilt-vs-analytic');

        const summary = {
          ...preScore,
          stage: 'complete',
          samplerBuiltVsAnalytic: {
            nFacets: scoreVsAnalytic.nFacets,
            scannedFacets: scoreVsAnalytic.scannedFacets,
            stride: scoreVsAnalytic.stride,
            interiorOutliers: scoreVsAnalytic.interiorOutliers,
            wholeMeshMaxMm: scoreVsAnalytic.wholeMeshMaxMm,
            p50: scoreVsAnalytic.p50,
            p90: scoreVsAnalytic.p90,
            p99: scoreVsAnalytic.p99,
            advanced: scoreVsAnalytic.advanced,
            outlierRateOfScanned: scoreVsAnalytic.interiorOutliers / Math.max(1, scoreVsAnalytic.scannedFacets),
            projectedWholeMeshOutliers: Math.round(
              (scoreVsAnalytic.interiorOutliers / Math.max(1, scoreVsAnalytic.scannedFacets)) * scoreVsAnalytic.nFacets,
            ),
          },
          wallTimes: { totalMs: Date.now() - tStart },
        };
        writeFileSync(VERDICT_A_PATH, JSON.stringify(summary, null, 2));
        crumb('partA-done', { totalMs: Date.now() - tStart });
        // eslint-disable-next-line no-console
        console.log(`[c2full-partA] ${JSON.stringify(summary)}`);

        expect(refined.tris.length / 3).toBe(9917);
        expect(refined.passes).toBe(7);
        expect(guard.outliers).toBe(0);
        expect(nonMan).toBe(0);
      },
      9 * 60 * 1000,
    );
  },
);

describe.skipIf(!PART_B)('C2-full PART B — analytic-built FULL CI patch (the deferred C2 confirm)', () => {
  it(
    "surfaceSource:'analytic' FULL patch build (wall-clock budget-guarded) + two-phase score vs analytic + G3/G7",
    () => {
      const tStart = Date.now();
      const heapMB = Math.round(getHeapStatistics().heap_size_limit / 1048576);
      crumb('partB-start', { heapLimitMB: heapMB });
      expect(
        heapMB,
        'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child',
      ).toBeGreaterThanOrEqual(9000);

      const manifest = getManifest('GothicArches');
      const analyticRA = manifest.truth.rA;
      const { H, Rt, Rb, expn } = DIMS;

      const sampler = styleSampler('GothicArches', {}, { H, Rt, Rb, expn });
      const complex = buildProtectedComplex(sampler, 'GothicArches');
      expect(complex.residualCrossings).toBe(0);
      crumb('partB-complex', { residualCrossings: complex.residualCrossings, ms: Date.now() - tStart });

      const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
      const BUILD_BUDGET_MS = 12 * 60 * 1000; // internal wall-clock abort for the analytic refine loop
      const built = runBounded(
        sampler,
        complex,
        FULL_DOMAIN,
        {
          tolMm: TOL,
          maxPass: 16,
          bulkPasses7pt: 4,
          bgArcMm: BG_ARC_MM,
          ruler: loopRuler,
          surfaceSource: 'analytic',
          analyticRA,
        },
        BUILD_BUDGET_MS,
        'partB-analyticBuild',
      );
      crumb('partB-build-done', {
        aborted: built.aborted,
        ms: built.ms,
        tris: built.result ? built.result.tris.length / 3 : built.lastStat?.nTris,
        passes: built.result?.passes,
        capped: built.result?.capped,
        lastStat: built.lastStat,
      });

      // Checkpoint immediately — if scoring below gets killed, this build-only record survives.
      writeFileSync(
        VERDICT_B_PATH,
        JSON.stringify(
          {
            stage: 'build-only',
            budgetMs: BUILD_BUDGET_MS,
            aborted: built.aborted,
            buildMs: built.ms,
            tris: built.result ? built.result.tris.length / 3 : built.lastStat?.nTris,
            passes: built.result?.passes,
            capped: built.result?.capped,
            lastStat: built.lastStat,
          },
          null,
          2,
        ),
      );

      // A thrown mid-loop abort does not return a usable (uv,tris) snapshot — only the onPass stat's
      // COUNTS survive (the same limitation _tierc_armC2.test.ts's own runBounded/budgetAborted branch
      // has). Report this honestly as a build-only partial; no re-score/re-audit is possible.
      if (!built.result) {
        const summary = {
          verdict: 'BUILD-ABORTED-NO-MESH-SNAPSHOT',
          note:
            'refineToZeroOutliers threw at the wall-clock budget boundary before returning a usable ' +
            '(uv,tris) snapshot; only the last onPass RefinePassStat COUNTS are available (no vertex/' +
            'triangle arrays to re-score or audit). This is the honest partial: the loop had NOT ' +
            'converged within budget — the plateau/trajectory is in lastStat + the *-pass crumbs.',
          budgetMs: BUILD_BUDGET_MS,
          buildMs: built.ms,
          lastStat: built.lastStat,
          wallTimes: { totalMs: Date.now() - tStart },
        };
        writeFileSync(VERDICT_B_PATH, JSON.stringify(summary, null, 2));
        crumb('partB-done-aborted-nomesh', summary);
        // eslint-disable-next-line no-console
        console.log(`[c2full-partB] ABORTED, no mesh snapshot. ${JSON.stringify(summary)}`);
        expect(built.aborted).toBe(true); // sanity: this branch is only taken on a genuine abort
        return;
      }

      const refined = built.result;
      // Lift via the SAME analytic-backed sampler the kernel used internally for PLACEMENT (the
      // armC2 PART2 lesson: liftChartMesh(sampler,...) with the ORIGINAL grid sampler would re-derive
      // WRONG (chorded) xyz for an analytic-mode mesh — resolveSurfaceSource built `effSampler =
      // analyticSurfaceSampler(analyticRA,H)` internally, so that is the mesh's true placed xyz).
      const analyticLiftSampler = analyticSurfaceSampler(analyticRA, H);
      const xyz = liftChartMesh(analyticLiftSampler, refined.uv);
      const idx = refined.tris;

      const nonMan = nonManifoldByIndex(idx);
      const cracked = idx.slice();
      cracked.push(idx[0], idx[1], idx[2]);
      const nonManControlMoved = nonManifoldByIndex(cracked) > nonMan;
      const rawStats = nonManRawBigStats(Uint32Array.from(idx));

      const topo = topologyMetric({ vertices: Float32Array.from(xyz), indices: Uint32Array.from(idx) }, 1e-4);
      const rim = boundaryDomainClass(refined.uv, idx, FULL_DOMAIN);
      const quality = triangleQualityDistribution({ vertices: Float32Array.from(xyz), indices: Uint32Array.from(idx) });
      crumb('partB-topology', {
        orientationMismatches: topo.orientationMismatches,
        boundaryEdges: topo.boundaryEdges,
        rimOnRect: rim.onRect,
        rimInterior: rim.interior,
        nonMan,
        nonManControlMoved,
        rawNonMan: rawStats.nonMan,
      });

      writeFileSync(
        VERDICT_B_PATH,
        JSON.stringify(
          {
            stage: 'mesh-built',
            aborted: built.aborted,
            buildMs: built.ms,
            tris: idx.length / 3,
            passes: refined.passes,
            capped: refined.capped,
            watertight: { nonMan, nonManControlMoved, rawNonMan: rawStats.nonMan },
            topology: {
              orientationMismatches: topo.orientationMismatches,
              boundaryEdges: topo.boundaryEdges,
              rimOnRect: rim.onRect,
              rimStrictlyInterior_defectSignature: rim.interior,
            },
            quality: { minAngleDeg: quality.minAngleDeg, degenerateCount: quality.degenerateCount },
          },
          null,
          2,
        ),
      );

      // PHASE 1 — budget-bounded stride score vs analytic (always-bounded sanity check; ~100 scanned).
      const phase1 = stridedScoreVsAnalytic(xyz, idx, analyticRA, H, 100, 'partB-phase1');

      let phase2: ReturnType<typeof scoreWholeMeshInterior> | null = null;
      const escalate = phase1.interiorOutliers === 0 && !built.aborted;
      if (escalate) {
        // PHASE 2 — literal stride=1 full scan. Cheap by the file-header cost model: on a converged
        // analytic-built mesh every facet's cheap 4-pt GN screen resolves <=tol without ever advancing
        // to the honest brute stage. Only attempted when PHASE 1 already read 0 outliers on its sample
        // AND the build was not wall-clock-aborted (an aborted build is known-unconverged by its own
        // last-pass stat — escalating there would hit the EXPENSIVE per-facet path broadly).
        const t2 = Date.now();
        phase2 = scoreWholeMeshInterior(Float32Array.from(xyz), Uint32Array.from(idx), analyticRA, H, {
          tol: TOL,
          stride: 1,
          progressEvery: Math.max(1, Math.floor(idx.length / 3 / 20)),
          onProgress: (done, total, nOut, worst, bruteCalls) =>
            crumb('partB-phase2-progress', {
              done,
              total,
              nOut,
              worst: +worst.toFixed(6),
              bruteCalls,
              elapsedMs: Date.now() - t2,
            }),
        });
        crumb('partB-phase2-done', {
          nFacets: phase2.nFacets,
          scannedFacets: phase2.scannedFacets,
          interiorOutliers: phase2.interiorOutliers,
          wholeMeshMaxMm: phase2.wholeMeshMaxMm,
          p99: phase2.p99,
          ms: Date.now() - t2,
        });
      }

      const finalScore = phase2 ?? phase1;
      const wholePatchPass = finalScore.interiorOutliers === 0 && finalScore.wholeMeshMaxMm <= 0.01 && !built.aborted;

      const summary = {
        verdict: wholePatchPass
          ? 'C2-FULL PASS'
          : built.aborted
            ? 'BUILD-BUDGET-ABORTED (partial)'
            : 'C2-FULL FAIL (residual tail)',
        build: {
          aborted: built.aborted,
          buildMs: built.ms,
          tris: idx.length / 3,
          passes: refined.passes,
          capped: refined.capped,
          lastStat: built.lastStat,
        },
        watertight: { nonMan, nonManControlMoved, rawNonMan: rawStats.nonMan },
        topology: {
          orientationMismatches: topo.orientationMismatches,
          boundaryEdges: topo.boundaryEdges,
          rimOnRect: rim.onRect,
          rimStrictlyInterior_defectSignature: rim.interior,
        },
        quality: { minAngleDeg: quality.minAngleDeg, degenerateCount: quality.degenerateCount },
        phase1_stridedScoreVsAnalytic: {
          nFacets: phase1.nFacets,
          scannedFacets: phase1.scannedFacets,
          stride: phase1.stride,
          interiorOutliers: phase1.interiorOutliers,
          wholeMeshMaxMm: phase1.wholeMeshMaxMm,
          p50: phase1.p50,
          p90: phase1.p90,
          p99: phase1.p99,
        },
        phase2_literalFullScanVsAnalytic: phase2
          ? {
              nFacets: phase2.nFacets,
              scannedFacets: phase2.scannedFacets,
              stride: phase2.stride,
              interiorOutliers: phase2.interiorOutliers,
              wholeMeshMaxMm: phase2.wholeMeshMaxMm,
              p50: phase2.p50,
              p90: phase2.p90,
              p99: phase2.p99,
            }
          : null,
        escalatedToLiteralScan: escalate,
        wallTimes: { totalMs: Date.now() - tStart },
      };
      writeFileSync(VERDICT_B_PATH, JSON.stringify(summary, null, 2));
      crumb('partB-done', { verdict: summary.verdict, totalMs: Date.now() - tStart });
      // eslint-disable-next-line no-console
      console.log(`[c2full-partB] ${JSON.stringify(summary)}`);

      // Sanity-only gate (this it() must not fail merely because the mechanism plateaus/is slow — that
      // is the FIRST-CLASS FINDING the mission asks for, not a test bug): watertight must hold on
      // whatever mesh was produced.
      expect(nonMan).toBe(0);
    },
    28 * 60 * 1000,
  );
});
