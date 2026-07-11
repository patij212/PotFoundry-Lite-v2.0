// _tierc_geostar_c2.test.ts — E-2026-07-11-TIERC-HEADTOHEAD GeoStar C2-repeat arm.
//
// MIRRORS research/bridge/_tierc_c2full.test.ts (the committed Gothic C2-full probe) for
// GeometricStar — the OTHER count-unstable K2 style (COUNT_UNSTABLE_STYLES =
// {GothicArches, GeometricStar}, src/renderers/webgpu/parametric/conforming/tierC/countUnstable.ts).
//
// QUESTION: is GeoStar a true-0.01 style — ALREADY (its finite-width chevron kink, apex ~130-137°
// per champion-spec-gothic.md §0, may resolve fine on the 512² styleSampler grid, so the
// SAMPLER-built mesh is already ≤0.01mm vs the EXACT analytic surface) or does it need the C2
// `surfaceSource:'analytic'` lever the way Gothic's zero-width knife-edge did (Gothic: sampler-built
// 0.17mm off analytic → analytic-built ≤0.01 everywhere, C2-analytic-surface-verdict.md)?
//
// GeoStar is NOT in tierc_manifest.ts (only FourierBloom/GyroidManifold/DragonScales/GothicArches
// have a StyleManifest row — TIERC_MANIFEST_STYLE_IDS, tierc_manifest.ts:215-220) — its EXACT
// analytic radius fn is built directly via `buildRadiusFn('GeometricStar', {}, dims)`
// (research/bridge/runStyle.ts, re-exported by labkit), the SAME function tierc_manifest.ts calls
// for its own 4 styles. Verified by direct read: styleSampler.ts pre-evaluates this EXACT
// `rOuterGeometricStar` + `baseRadius` formula on a 512×512 grid (styleSampler.ts:106-131,
// DEFAULT_GRID_U/T=512) — `buildRadiusFn` is the continuous, un-gridded version of the SAME
// analytic function the sampler discretizes, so scoring a sampler-built mesh against `buildRadiusFn`
// is the honest "sampler chords across sub-mm relief" comparison, exactly Gothic's C1/C2 method.
//
// PATCH DOMAIN (CONSTRUCTED — no CI-smoke-scale GeoStar patch exists in production the way
// Gothic's u[0,0.125]×t[0.48,0.52]@nTheta512 CI gate does; `wholeMesh0Outlier.test.ts`'s GeoStar
// branch is only the FULL multi-hour gate, u[0,0.1]×t[0.4,0.6]@nTheta1024, documented as a
// multi-hour single-thread grind — far outside this arm's budget):
//   u ∈ [0, 0.05], t ∈ [0.35, 0.40]
// GeometricStar's DEFAULT params (gsPoints=8, gsLayers=4, gsZoom=1, gsShift=0 —
// DEFAULT_GEOMETRIC_STAR, src/geometry/types.ts:753-763) tile the strapwork chevron vertically via
// `vRaw = t·layers·zoom = 4t`; relief FADES to 0 at every integer vRaw (row seam,
// `vFade = 1 − |v|⁴`, `v = (vRaw − row − 0.5)·2`) and PEAKS at vRaw = k+0.5 (row centre) —
// `src/geometry/styles.ts:1763-1815`. t ∈ [0.35, 0.40] ⇒ vRaw ∈ [1.4, 1.6], entirely inside
// row = floor(vRaw) = 1 (no seam crossing) with v ∈ [−0.2, 0.2] ⇒ vFade ∈ [0.9984, 1] — essentially
// FULL relief throughout, deliberately AVOIDING the t=0.5-exact row-seam fade (vFade=0) the
// project's own `_geostarProbe.test.ts` domain (u[0,0.05]×t[0.45,0.55]) straddles at its own
// t-midpoint. u-width 0.05 = 18° = 0.4 of one 45°-wide (N=8) sector — wide enough to bracket at
// least one full strapwork crease line (`gsGap=0.05`, the folded `|dLine|−gap` smoothstep ridge
// that gives the apex its finite ~130-137° kink). `bgArcMm=0.6` / `nTheta=256` mirror the project's
// own already-proven-cheap GeoStar probe scale (`_geostarProbe.test.ts`, same bgArcMm/nTheta pair,
// a comparable-scale domain converged to 7792 tris / 0-outliers-vs-sampler / capped=false) — a
// validated-cheap starting config, not a guess.
//
// COST MODEL (reused from _tierc_c2full.test.ts's own header, same kernel/ruler): a facet that
// FAILS its cheap 4-point GN screen advances to the honest 45-point brute (~1-2s/facet when most
// scanned facets advance — expected for a SAMPLER-built mesh scored vs analytic, since the sampler
// chords across relief the analytic mesh doesn't); a facet that PASSES the cheap screen (every facet
// on a CONVERGED analytic-built mesh, by construction) resolves in <1ms. So PART A (sampler-built vs
// analytic) is STRIDED (expensive); PART B (analytic-built vs analytic) attempts a literal stride=1
// scan ONLY after a strided phase-1 sample reads 0 outliers (mirrors Gothic's own two-phase design).
//
// BUDGET (this arm, 25min total mission budget — GeoStar has no pinned CI-gate precedent at this
// NEW constructed domain, unlike Gothic's Part A which reproduces a live, already-characterized CI
// gate): UNLIKE _tierc_c2full.test.ts, BOTH parts here are wrapped in the SAME wall-clock-bounded
// `runBounded` (Part A included) — a defensive addition since this domain's build trajectory is
// unmeasured a priori. PART A build budget 4min, PART B build budget 5min; strided scores capped at
// targetScanned=100 (A) / 80 (B phase 1) to bound worst-case brute cost.
//
// Checkpointed per LAB-CHEATSHEET resilience doctrine: every pass and every stage's numbers are
// appended to geostar_c2_crumbs.ndjson THE INSTANT they are computed; a verdict JSON is (re)written
// after EVERY major stage (not only at the end) so a killed run's progress is never lost.
//
// Run (two SEPARATE processes, resilience — mirrors _tierc_c2full.test.ts's own convention):
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_GEOSTAR_C2_A=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_geostar_c2.config.ts
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_GEOSTAR_C2_B=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_geostar_c2.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only. NEW FILE ONLY — every kernel/ruler/harness
// import here is READ-ONLY (C2's surfaceSource lever is already committed in noBridgeRefine.ts /
// interiorRuler.ts; this file only USES it via the public RefineOptions.surfaceSource field). Commits
// nothing.
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
  radialSurfaceFromSampler,
  analyticSurfaceSampler,
  scoreWholeMesh,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import { topologyMetric, triangleQualityDistribution } from '../../src/fidelity/metrics';

const PART_A = process.env.PF_TIERC_GEOSTAR_C2_A === '1';
const PART_B = process.env.PF_TIERC_GEOSTAR_C2_B === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'geostar_c2_crumbs.ndjson');
const VERDICT_A_PATH = join(OUT_DIR, 'geostar_c2_partA_verdict.json');
const VERDICT_B_PATH = join(OUT_DIR, 'geostar_c2_partB_verdict.json');

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'GeoStar-C2', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

// Verbatim port of wholeMesh0Outlier.test.ts / _tierc_c2full.test.ts's own local helper: an
// interior edge shared by >2 triangles is non-manifold. Boundary edges (1 tri) are legitimate on
// a patch.
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

// Verbatim port of _tierc_c2full.test.ts's by-index boundary DOMAIN classifier: rim of the (u,t)
// rectangle (expected, an open patch) vs strictly interior (the Gyroid A1/A4 defect signature).
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

const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 }; // TIERC_COMMON_DIMS / wholeMesh0Outlier.test.ts's own dims
const FULL_DOMAIN: ChartDomain = { uLo: 0, uHi: 0.05, tLo: 0.35, tHi: 0.4 };
const BG_ARC_MM = 0.6;
const N_THETA = 256;
const TOL = 0.01;

/**
 * Run refineToZeroOutliers under a WALL-CLOCK budget — verbatim pattern from
 * _tierc_c2full.test.ts's `runBounded` (the kernel is fully synchronous / uninterruptible mid-pass,
 * onPass is the only yield point, so abort granularity is "next pass boundary"; a budget-triggered
 * abort is an honest partial, never a silently-discarded error). APPLIED TO BOTH PART A AND PART B
 * here (c2full only wrapped Part B) since this domain has no pinned CI-gate precedent.
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
        throw new Error('PF_GEOSTAR_C2_BUDGET_ABORT');
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
    progressEvery: 5,
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
  'GeoStar C2 PART A — sampler-built patch scored vs EXACT analytic (the "before")',
  () => {
    it(
      'builds the sampler-mode patch (wall-clock bounded) then strided-scores vs analytic + reports topology/quality',
      () => {
        const tStart = Date.now();
        const heapMB = Math.round(getHeapStatistics().heap_size_limit / 1048576);
        crumb('partA-start', { heapLimitMB: heapMB, domain: FULL_DOMAIN, bgArcMm: BG_ARC_MM, nTheta: N_THETA });
        expect(
          heapMB,
          'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child',
        ).toBeGreaterThanOrEqual(9000);

        const analyticRA = buildRadiusFn('GeometricStar', {}, DIMS);
        const { H } = DIMS;

        const sampler = styleSampler('GeometricStar', {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
        const complex = buildProtectedComplex(sampler, 'GeometricStar');
        expect(complex.residualCrossings).toBe(0);
        crumb('partA-complex', {
          residualCrossings: complex.residualCrossings,
          verts: complex.vertices.length / 2,
          edges: complex.edges.length,
          ms: Date.now() - tStart,
        });

        const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
        const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
        const BUILD_BUDGET_MS_A = 4 * 60 * 1000;
        const built = runBounded(
          sampler,
          complex,
          FULL_DOMAIN,
          { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: BG_ARC_MM, ruler: loopRuler }, // surfaceSource OMITTED = 'sampler'
          BUILD_BUDGET_MS_A,
          'partA-samplerBuild',
        );
        crumb('partA-build-done', {
          aborted: built.aborted,
          buildMs: built.ms,
          tris: built.result ? built.result.tris.length / 3 : built.lastStat?.nTris,
          passes: built.result?.passes,
          capped: built.result?.capped,
          lastStat: built.lastStat,
        });
        writeFileSync(
          VERDICT_A_PATH,
          JSON.stringify(
            {
              stage: 'build-only',
              domain: FULL_DOMAIN,
              bgArcMm: BG_ARC_MM,
              nTheta: N_THETA,
              budgetMs: BUILD_BUDGET_MS_A,
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

        if (!built.result) {
          const summary = {
            verdict: 'BUILD-ABORTED-NO-MESH-SNAPSHOT',
            note:
              'refineToZeroOutliers threw at the wall-clock budget boundary before returning a usable ' +
              '(uv,tris) snapshot — only the last onPass RefinePassStat COUNTS are available. Honest ' +
              'partial: the sampler-mode build had NOT converged within budget.',
            budgetMs: BUILD_BUDGET_MS_A,
            buildMs: built.ms,
            lastStat: built.lastStat,
            wallTimes: { totalMs: Date.now() - tStart },
          };
          writeFileSync(VERDICT_A_PATH, JSON.stringify(summary, null, 2));
          crumb('partA-done-aborted-nomesh', summary);
          // eslint-disable-next-line no-console
          console.log(`[geostar-c2-partA] ABORTED, no mesh snapshot. ${JSON.stringify(summary)}`);
          expect(built.aborted).toBe(true);
          return;
        }

        const refined = built.result;
        const surface = radialSurfaceFromSampler(sampler);
        const guard = scoreWholeMesh(sampler, surface, refined, TOL, guardRuler);
        crumb('partA-guard-vs-sampler', { outliers: guard.outliers, maxMm: guard.maxMm, nFacets: guard.nFacets });

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

        const preScore = {
          stage: 'pre-score',
          domain: FULL_DOMAIN,
          bgArcMm: BG_ARC_MM,
          nTheta: N_THETA,
          note: 'GeoStar has no pinned live CI-gate reference at this constructed domain (unlike Gothic).',
          build: { tris: refined.tris.length / 3, passes: refined.passes, capped: refined.capped, buildMs: built.ms },
          guardVsSampler: { outliers: guard.outliers, maxMm: guard.maxMm },
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
        // "before" number; budget-bounded (~100 scanned facets).
        const scoreVsAnalytic = stridedScoreVsAnalytic(xyz, idx, analyticRA, H, 100, 'partA-samplerBuilt-vs-analytic');

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
        console.log(`[geostar-c2-partA] ${JSON.stringify(summary)}`);

        // Sanity-only gate: structural invariants, NOT the fidelity numbers (those are the finding).
        expect(nonMan).toBe(0);
        expect(nonManControlMoved).toBe(true);
      },
      8 * 60 * 1000,
    );
  },
);

describe.skipIf(!PART_B)('GeoStar C2 PART B — analytic-built patch (the C2-lever confirm)', () => {
  it(
    "surfaceSource:'analytic' patch build (wall-clock budget-guarded) + two-phase score vs analytic + G3/G7",
    () => {
      const tStart = Date.now();
      const heapMB = Math.round(getHeapStatistics().heap_size_limit / 1048576);
      crumb('partB-start', { heapLimitMB: heapMB, domain: FULL_DOMAIN, bgArcMm: BG_ARC_MM, nTheta: N_THETA });
      expect(
        heapMB,
        'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child',
      ).toBeGreaterThanOrEqual(9000);

      const analyticRA = buildRadiusFn('GeometricStar', {}, DIMS);
      const { H } = DIMS;

      const sampler = styleSampler('GeometricStar', {}, { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb });
      const complex = buildProtectedComplex(sampler, 'GeometricStar');
      expect(complex.residualCrossings).toBe(0);
      crumb('partB-complex', { residualCrossings: complex.residualCrossings, ms: Date.now() - tStart });

      const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
      const BUILD_BUDGET_MS = 5 * 60 * 1000;
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

      writeFileSync(
        VERDICT_B_PATH,
        JSON.stringify(
          {
            stage: 'build-only',
            domain: FULL_DOMAIN,
            bgArcMm: BG_ARC_MM,
            nTheta: N_THETA,
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
        console.log(`[geostar-c2-partB] ABORTED, no mesh snapshot. ${JSON.stringify(summary)}`);
        expect(built.aborted).toBe(true);
        return;
      }

      const refined = built.result;
      // Lift via the SAME analytic-backed sampler the kernel used internally for PLACEMENT (the
      // c2full/armC2 lesson: liftChartMesh(sampler,...) with the ORIGINAL grid sampler would
      // re-derive WRONG (chorded) xyz for an analytic-mode mesh).
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
            domain: FULL_DOMAIN,
            bgArcMm: BG_ARC_MM,
            nTheta: N_THETA,
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

      // PHASE 1 — budget-bounded stride score vs analytic (always-bounded sanity check; ~80 scanned).
      const phase1 = stridedScoreVsAnalytic(xyz, idx, analyticRA, H, 80, 'partB-phase1');

      let phase2: ReturnType<typeof scoreWholeMeshInterior> | null = null;
      const escalate = phase1.interiorOutliers === 0 && !built.aborted;
      if (escalate) {
        // PHASE 2 — literal stride=1 full scan. Cheap on a converged analytic-built mesh (every
        // facet's cheap 4-pt GN screen resolves <=tol without advancing to the honest brute stage).
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
          ? 'C2-LEVER PASS (analytic-built <=0.01 everywhere vs analytic)'
          : built.aborted
            ? 'BUILD-BUDGET-ABORTED (partial)'
            : 'C2-LEVER FAIL (residual tail even in analytic mode)',
        domain: FULL_DOMAIN,
        bgArcMm: BG_ARC_MM,
        nTheta: N_THETA,
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
      console.log(`[geostar-c2-partB] ${JSON.stringify(summary)}`);

      // Sanity-only gate (must not fail merely because the mechanism plateaus/is slow — that is a
      // FIRST-CLASS FINDING, not a test bug): watertight must hold on whatever mesh was produced.
      expect(nonMan).toBe(0);
    },
    8.5 * 60 * 1000,
  );
});
