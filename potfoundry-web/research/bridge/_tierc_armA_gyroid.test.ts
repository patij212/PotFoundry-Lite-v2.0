// _tierc_armA_gyroid.test.ts — PROD-TIERC region-layer-core plan, task A-4 (Arm A: reproduce the
// Gyroid champion THROUGH the region layer). Brief: task-A4-brief.md (authoritative) /
// docs/superpowers/plans/2026-07-12-region-layer-core.md §A-4. Research-side ONLY — no src/ edit,
// no dev flag.
//
// GOAL (brief, verbatim mechanism): gyroidManifoldAnatomy (tierc_manifest.ts, already wraps
// _gyroid_bandedge_lib.ts's extractBandedgeContours/contoursToFeatureLines VERBATIM — see that
// function's own doc-comment) feeds the doubled band-edge EmbeddedCurve[] as `outerFeatureLines`
// through single-R-CDT via buildRegionOuterWall(getManifest('GyroidManifold'), TIERC_COMMON_DIMS) —
// the A-2 gates-harness runner (research/bridge/_tierc_a2_gatesrunner.test.ts, committed) then scores
// it. Reproduce champion-spec-gyroid.md §5.4's checklist within its own banked tolerances.
//
// METHOD (two independent legs on the SAME region-layer-built mesh; no new ruler invented anywhere):
//  (1) HASH-IDENTITY vs the ORIGINAL champion twin: buildGbeTwin(bandedge) (_gyroid_bandedge_lib.ts —
//      the EXACT machinery that PRODUCED champion-spec-gyroid.md's own §5.1/§5.4 numbers, pre-reg
//      3c996af8, verdict 39ad7939) built from the SAME extracted contours. Neither side sets
//      `multiCurveCellPolicy` (region layer's buildSingleRCdtRegion omits it; buildGbeTwin's own
//      assemblyOpts omits it too — confirmed by direct read of both files), so both fall to
//      ConformingWall's identical default — hash identity here is the strongest available "this IS
//      the champion build, reached via the region layer" proof, mirroring task A-3's
//      (_tierc_armD_control.test.ts) own hash-identity-vs-direct-twin pattern for FourierBloom.
//  (2) SCORE the region-layer's own outer/full mesh two ways:
//        (a) the A-2 gates-harness runner (buildRegionOuterWall -> scoreAllGates) with
//            FAST_G2/FAST_G1_BRUTE overrides — the literal brief interface, cost-bounded exactly like
//            _tierc_a2_gatesrunner.test.ts's own PF_TIERC_A2_GATESRUNNER=1 production-scale 4-arm
//            block already uses for this SAME Gyroid arm (sample-density-only levers, never
//            algorithm-changing — see that file's header).
//        (b) the SAME stratified-Newton instrument champion-spec-gyroid.md's own §5.1/§5.4 numbers
//            were measured with: gpcPrescreenDetail -> gpcStratifiedNewton, plus gpcScoreCoverage
//            (_gyroid_bandedge_lib.ts's re-export of _gyroid_prodclose_lib.ts's proven machinery,
//            itself reused verbatim by the ORIGINAL GYROID-BANDEDGE arm). NOT a literal every-facet
//            Newton scan — champion-spec-gyroid.md §5.2 explicitly records that scan was deliberately
//            never run at this population size ("the stratified classification decided the fork
//            without the 10-20 CPU-h literal"); re-deriving that cost here would not be a fair
//            apples-to-apples comparison against the banked numbers, it would be a DIFFERENT
//            experiment.
//  (3) classifyNonManLoci(twin, bandedge) — the ORIGINAL locus classifier — for the 2-locus fan-defect
//      count + per-locus (u,t) detail on the DIRECT twin (byte-identical to the region-layer build per
//      (1)); auditWatertight on the region-layer's own full mesh as the primary non-vacuity witness.
//      The fan defect is REPORTED here, not fixed — champion-spec-gyroid.md §1.5/§3.3 names it a
//      SEPARATE chip ("2-locus CDT fan defect"), and the brief explicitly scopes the fix out of A-4.
//
// GATE (reproduce §5.4 within banked tolerances — HONEST CAN-FAIL, nothing tuned to force a pass):
//   ~28,785 feature pts (pure geometry, mesher-independent — tight tolerance expected);
//   outer ~2,242,987 tris (+/-5%); Newton-worst ~0.024917 (tight if hash-identical, since the same
//   worst locus then reproduces exactly); ~100% knee-adjacent / 0 off-band; coverage max ~0.0253
//   (+/-10%); watertight non-vacuous (nonManControlMoved witness fires). The 2-locus fan defect count
//   is reported, not asserted to be zero (champion-spec-gyroid.md §4.2: "cannot ship as-is", named
//   remedies un-implemented — that is a correctly-scoped OUT for this task).
//
// RULES: NEW FILE. Imports committed code only (tierc_regionLayer.ts / tierc_manifest.ts /
// tierc_gatesHarness.ts / _gyroid_bandedge_lib.ts's re-export of _gyroid_prodclose_lib.ts) — no src/
// edit. DEV-ONLY; src/ never imports research/. Env-gated PF_TIERC_A4_GYROID=1 (default no-op);
// breadcrumbed to research/exchange/tierc/armA_gyroid_crumbs.ndjson + a final summary json; self-bumps
// Windows EcoQoS priority to ABOVE_NORMAL (project memory: "Windows EcoQoS throttles detached node
// jobs ~4-5x").
//
// Run (FOREGROUND; expect roughly 8-15 minutes — extraction ~10s, region-layer build ~90-230s,
// direct-twin build ~90-230s [reuses the already-extracted contours, skips re-extraction], prescreen
// ~1-2min, stratified Newton ~1-2min [~2,000 Newton calls @ ~40ms], coverage ~1-2min, A-2 runner
// scoring ~1-3min at FAST_G2/FAST_G1_BRUTE density):
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A4_GYROID=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_armA_gyroid.config.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import {
  getManifest,
  TIERC_COMMON_DIMS,
  type StyleManifest,
  type FeatureAnatomy,
  type StyleDims,
} from './tierc_manifest';
import { buildRegionOuterWall, toHarnessManifest } from './tierc_regionLayer';
import { scoreAllGates, type StyleTruth } from './tierc_gatesHarness';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  extractBandedgeContours,
  buildGbeTwin,
  classifyNonManLoci,
  auditWatertight,
  gpcPrescreenDetail,
  gpcStratifiedNewton,
  gpcScoreCoverage,
  type BandedgeExtraction,
} from './_gyroid_bandedge_lib';
import type { AnalyticRadiusFn } from './labkit';
import type { StyleOptions } from '../../src/geometry/types';

const ON = process.env.PF_TIERC_A4_GYROID === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const OUT = join(OUT_DIR, 'gates.ndjson');
const CRUMB_PATH = join(OUT_DIR, 'armA_gyroid_crumbs.ndjson');
const SUMMARY_PATH = join(OUT_DIR, 'armA_gyroid_summary.json');
const TEST_TIMEOUT_MS = 45 * 60 * 1000; // generous backstop; liveness watched via crumbs (see header)

// FAST overrides for the SCORING stage only (identical to _tierc_a2_gatesrunner.test.ts's own
// PF_TIERC_A2_GATESRUNNER=1 production-scale block — sample-density-only levers, never
// algorithm-changing; see that file's ScoreAllGatesOpts.g2Lattice/g1Brute doc-comments).
const FAST_G2 = { nu: 8, nt: 8 };
const FAST_G1_BRUTE = { nTheta: 32, nZ: 8 };

const TOL_MM = 0.01;

// champion-spec-gyroid.md §5.4 checklist targets (band-edge step-0.15 config, the "recommended" one —
// see §5). Every number here is CITED from that document, not derived or tuned by this file.
const TARGET_PTS = 28_785;
const TARGET_OUTER_TRIS = 2_242_987;
const TARGET_FULL_TRIS = 4_365_677;
const TARGET_NEWTON_WORST = 0.024917;
const TARGET_EST_OUTLIERS = 31_114;
const TARGET_COVERAGE_MAX = 0.0253;
const TARGET_COVERAGE_P99 = 0.0009;

const PTS_TOL_FRAC = 0.01; // pure geometry, mesher-independent — tight
const OUTER_TRI_TOL_FRAC = 0.05; // §5.4 item 2
const EST_OUTLIER_TOL_FRAC = 0.15; // §5.4 item 3 / §5.1 estimator's own validated precision
const COVERAGE_TOL_FRAC = 0.10; // §5.4 item 3
const KNEE_ADJACENT_MIN_FRAC = 0.90; // §5.4 item 4 targets "100%" — leaves honest slack, not tuned to the exact figure

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({
        task: 'A-4',
        arm: 'A-Gyroid',
        style: 'GyroidManifold',
        stage,
        pid: process.pid,
        at: new Date().toISOString(),
        ...extra,
      }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

function bumpPriority(): void {
  try {
    os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
  } catch {
    /* best effort — Windows EcoQoS mitigation, never fatal if unsupported */
  }
}

describe.skipIf(!ON)('PROD-TIERC region-layer-core A-4 — Arm A (Gyroid champion reproduction)', () => {
  it(
    'buildRegionOuterWall(getManifest(GyroidManifold)) -> A-2 runner reproduces champion-spec-gyroid.md §5.4 within banked tolerances',
    () => {
      const t0 = Date.now();
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 should propagate to this fork').toBeGreaterThanOrEqual(
        8192,
      );

      const manifest = getManifest('GyroidManifold');
      const rA: AnalyticRadiusFn = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      // ── STEP 0: extract the doubled band-edge contours ONCE — pure geometry, shared by the direct
      // champion twin below. gyroidManifoldAnatomy re-derives the SAME contours internally
      // (deterministic function of rA/H/GBE_EXTRACT_DEFAULT/GBE_FIELD) when buildRegionOuterWall calls
      // it — this call is the independent provenance copy, not a shortcut the region layer itself takes.
      const tExtract0 = Date.now();
      const bandedge: BandedgeExtraction = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const extractMs = Date.now() - tExtract0;
      const totalPolylines = bandedge.inner.decimatedContours.length + bandedge.outer.decimatedContours.length;
      crumb('extract-done', {
        extractMs,
        totalPts: bandedge.totalPts,
        totalPolylines,
        innerPts: bandedge.inner.decimatedPtCount,
        outerPts: bandedge.outer.decimatedPtCount,
        maxPlacementDisp3D: bandedge.maxPlacementDisp3D,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] extract DONE in ${(extractMs / 1000).toFixed(1)}s: pts=${bandedge.totalPts} ` +
          `polylines=${totalPolylines} maxPlacementDisp3D=${bandedge.maxPlacementDisp3D}`,
      );

      // ── STEP 1: build THROUGH the region layer (buildRegionOuterWall's single-R-CDT dispatch).
      // manifest.anatomy is wrapped ONLY to capture its own internally-derived FeatureAnatomy for
      // reporting (curve/point counts) — buildRegionOuterWall still calls it exactly once, on the real
      // dispatch path, no shortcut taken. ──────────────────────────────────────────────────────────
      let capturedAnatomy: FeatureAnatomy | undefined;
      const wrappedManifest: StyleManifest = {
        ...manifest,
        anatomy: (params: StyleOptions, dims: StyleDims): FeatureAnatomy => {
          const a = manifest.anatomy(params, dims);
          capturedAnatomy = a;
          return a;
        },
      };
      const tBuild0 = Date.now();
      const result = buildRegionOuterWall(wrappedManifest, TIERC_COMMON_DIMS);
      const buildMs = Date.now() - tBuild0;
      const regionCurvePts = capturedAnatomy
        ? capturedAnatomy.curves.reduce((n, c) => n + c.points.length, 0)
        : -1;
      const regionCurveCount = capturedAnatomy?.curves.length ?? -1;
      crumb('region-build-done', {
        buildMs,
        dispatch: result.meta.dispatch,
        outerTris: result.outer.idx.length / 3,
        fullTris: result.full ? result.full.idx.length / 3 : null,
        uBias: result.meta.uBias,
        hash: result.meta.hash,
        warnings: result.meta.warnings,
        regionCurvePts,
        regionCurveCount,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] region-layer build DONE in ${(buildMs / 1000).toFixed(1)}s: dispatch=${result.meta.dispatch} ` +
          `outer=${result.outer.idx.length / 3} full=${result.full ? result.full.idx.length / 3 : 'MISSING'} ` +
          `hash=${result.meta.hash} curvePts=${regionCurvePts} curveCount=${regionCurveCount}`,
      );
      expect(result.meta.dispatch, 'Gyroid must dispatch single-R-CDT (whole-pot R-CDT, no curves-side-effect on dispatch)').toBe(
        'single-R-CDT',
      );
      expect(result.full, 'single-R-CDT dispatch always returns a full-pot mesh').toBeDefined();
      expect(result.outer.idx.length, 'non-vacuous: outer wall actually built').toBeGreaterThan(0);
      expect(
        regionCurvePts,
        'gyroidManifoldAnatomy (called INSIDE buildRegionOuterWall) should extract the SAME point count as the independent provenance extraction above',
      ).toBe(bandedge.totalPts);

      // ── STEP 2: DIRECT champion twin — the ORIGINAL machinery that produced champion-spec-gyroid.md's
      // own §5.1/§5.4 numbers, built from the SAME extracted contours (byte-identical inputs). ───────
      const tTwin0 = Date.now();
      const twin = buildGbeTwin(bandedge);
      const twinMs = Date.now() - tTwin0;
      if (twin.buildError) crumb('twin-build-ERROR', { buildError: twin.buildError });
      const hashIdentity = result.meta.hash === twin.hash;
      crumb('twin-build-done', {
        twinMs,
        outerTris: twin.outerTris,
        fullTris: twin.fullTris,
        hash: twin.hash,
        regionLayerHash: result.meta.hash,
        hashIdentity,
        buildError: twin.buildError ?? null,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] DIRECT champion-twin build DONE in ${(twinMs / 1000).toFixed(1)}s: outer=${twin.outerTris} ` +
          `full=${twin.fullTris} hash=${twin.hash} vs regionLayer=${result.meta.hash} -> identity=${hashIdentity}`,
      );
      expect(twin.buildError, 'direct champion-twin build must not throw').toBeUndefined();

      // ── STEP 3a: the A-2 gates-harness runner — the literal brief interface, cost-bounded exactly
      // like _tierc_a2_gatesrunner.test.ts's own production-scale 4-arm block. ───────────────────────
      const styleTruth: StyleTruth = {
        styleId: manifest.styleId,
        rA,
        H: TIERC_COMMON_DIMS.H,
        Rb: TIERC_COMMON_DIMS.Rb,
        Rt: TIERC_COMMON_DIMS.Rt,
        expn: TIERC_COMMON_DIMS.expn,
      };
      const tGates0 = Date.now();
      const gatesRow = scoreAllGates(
        { full: result.full!, outer: result.outer },
        styleTruth,
        toHarnessManifest(manifest),
        {
          g2Lattice: FAST_G2,
          g1Brute: FAST_G1_BRUTE,
          breadcrumbPath: CRUMB_PATH,
          outputPath: OUT,
          runId: `a4-armA-gyroid-${Date.now()}`,
        },
      );
      const gatesMs = Date.now() - tGates0;
      crumb('a2-runner-done', {
        gatesMs,
        g1: gatesRow.g1_forward,
        g2locatorSelfCheckMaxMm: gatesRow.g2_reverse.locatorSelfCheckMaxMm,
        g3: gatesRow.g3_watertight,
        g4: gatesRow.g4_zeroDefect,
        g6: gatesRow.g6_budget,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] A-2 gates runner DONE in ${(gatesMs / 1000).toFixed(1)}s: g1 outliers=${gatesRow.g1_forward.outliers} ` +
          `newtonWorstMm=${gatesRow.g1_forward.newtonWorstMm} maxMm=${gatesRow.g1_forward.maxMm} | ` +
          `g3 nonMan=${gatesRow.g3_watertight.nonManRaw} controlMoved=${gatesRow.g3_watertight.nonManControlMoved}`,
      );
      expect(gatesRow.g3_watertight.nonManControlMoved, 'g3 non-vacuity witness (A-2 runner leg)').toBe(true);
      expect(gatesRow.g2_reverse.locatorSelfCheckMaxMm, 'g2 non-vacuity witness (A-2 runner leg)').not.toBeNull();

      // ── STEP 3b: the SAME stratified-Newton instrument champion-spec-gyroid.md's own numbers were
      // measured with — honest apples-to-apples comparison against the banked §5.4 checklist. ────────
      const tPrescreen0 = Date.now();
      const { recs, nFacets } = gpcPrescreenDetail(result.outer.xyz, result.outer.idx, rA, H, TOL_MM);
      const prescreenMs = Date.now() - tPrescreen0;
      crumb('prescreen-done', { prescreenMs, nFacets, survivors: recs.length });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] prescreen DONE in ${(prescreenMs / 1000).toFixed(1)}s: survivors=${recs.length}/${nFacets}`,
      );

      const tStrat0 = Date.now();
      const strat = gpcStratifiedNewton(recs, rA, H, TOL_MM, { topExhaustive: 200, strata: 8, perStratum: 225 });
      const stratMs = Date.now() - tStrat0;
      crumb('stratified-newton-done', {
        stratMs,
        estOutliers: strat.estOutliers,
        newtonWorst: strat.newtonWorst,
        sampled: strat.sampled,
        overSampled: strat.overSampled,
        kneeClass: strat.kneeClass,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] stratified Newton DONE in ${(stratMs / 1000).toFixed(1)}s: estOutliers=${strat.estOutliers} ` +
          `newtonWorst=${strat.newtonWorst} kneeClass=${JSON.stringify(strat.kneeClass)}`,
      );

      const tCov0 = Date.now();
      const coverage = gpcScoreCoverage(result.outer.xyz, result.outer.idx, rA, H, TOL_MM);
      const covMs = Date.now() - tCov0;
      crumb('coverage-done', {
        covMs,
        max: coverage.max,
        p99: coverage.p99,
        locSelfCheckMax: coverage.locSelfCheckMax,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] coverage DONE in ${(covMs / 1000).toFixed(1)}s: max=${coverage.max} p99=${coverage.p99}`,
      );

      // ── STEP 4: the 2-locus fan-defect count — REPORTED, not fixed (brief: "a SEPARATE task"). ─────
      const regionAudit = auditWatertight(result.full!.idx);
      const twinLoci = classifyNonManLoci(twin, bandedge);
      crumb('watertight-done', {
        regionNonMan: regionAudit.nonMan,
        regionControlMoved: regionAudit.controlMoved,
        twinNonManLociCount: twinLoci.length,
        twinLoci: twinLoci.map((l) => ({
          aUt: l.aUt,
          bUt: l.bUt,
          mult: l.mult,
          midAbsVal: l.midAbsVal,
          dEdgeIso: l.dEdgeIso,
          nearUSeam: l.nearUSeam,
        })),
      });
      // eslint-disable-next-line no-console
      console.log(
        `[A-4 armA-gyroid] watertight: region-layer nonMan=${regionAudit.nonMan} (controlMoved=${regionAudit.controlMoved}) ` +
          `| direct-twin classified fan-defect loci=${twinLoci.length}`,
      );

      // ── §5.4 checklist deltas (HONEST — computed and logged regardless of pass/fail). ──────────────
      const outerTris = result.outer.idx.length / 3;
      const fullTris = result.full!.idx.length / 3;
      const ptsDeltaFrac = (bandedge.totalPts - TARGET_PTS) / TARGET_PTS;
      const outerDeltaFrac = (outerTris - TARGET_OUTER_TRIS) / TARGET_OUTER_TRIS;
      const fullDeltaFrac = (fullTris - TARGET_FULL_TRIS) / TARGET_FULL_TRIS;
      const newtonWorstDeltaFrac = (strat.newtonWorst - TARGET_NEWTON_WORST) / TARGET_NEWTON_WORST;
      const estOutliersDeltaFrac = (strat.estOutliers - TARGET_EST_OUTLIERS) / TARGET_EST_OUTLIERS;
      const covMaxDeltaFrac = (coverage.max - TARGET_COVERAGE_MAX) / TARGET_COVERAGE_MAX;
      const kneeTotal = strat.kneeClass.wallBand + strat.kneeClass.kneeAdjacent + strat.kneeClass.offBand;
      const kneeAdjacentFrac = kneeTotal > 0 ? strat.kneeClass.kneeAdjacent / kneeTotal : null;

      const summary = {
        task: 'A-4',
        arm: 'A-Gyroid',
        at: new Date().toISOString(),
        wallTimes: { extractMs, buildMs, twinMs, gatesMs, prescreenMs, stratMs, covMs, totalMs: Date.now() - t0 },
        hashIdentity: { regionLayerHash: result.meta.hash, directTwinHash: twin.hash, identity: hashIdentity },
        extraction: {
          totalPts: bandedge.totalPts,
          totalPolylines,
          target: TARGET_PTS,
          deltaFrac: ptsDeltaFrac,
          maxPlacementDisp3D: bandedge.maxPlacementDisp3D,
        },
        regionAnatomy: { curveCount: regionCurveCount, curvePts: regionCurvePts },
        tris: {
          outer: { measured: outerTris, target: TARGET_OUTER_TRIS, deltaFrac: outerDeltaFrac },
          full: { measured: fullTris, target: TARGET_FULL_TRIS, deltaFrac: fullDeltaFrac },
        },
        fidelity: {
          stratifiedNewtonWorst: { measured: strat.newtonWorst, target: TARGET_NEWTON_WORST, deltaFrac: newtonWorstDeltaFrac },
          stratifiedEstOutliers: { measured: strat.estOutliers, target: TARGET_EST_OUTLIERS, deltaFrac: estOutliersDeltaFrac },
          kneeClass: strat.kneeClass,
          kneeAdjacentFrac,
          coverage: {
            max: coverage.max,
            p99: coverage.p99,
            targetMax: TARGET_COVERAGE_MAX,
            targetP99: TARGET_COVERAGE_P99,
            deltaFrac: covMaxDeltaFrac,
          },
        },
        watertight: {
          regionNonMan: regionAudit.nonMan,
          regionControlMoved: regionAudit.controlMoved,
          twinNonManLociCount: twinLoci.length,
          twinLoci,
        },
        a2GatesRunner: {
          g1_forward: gatesRow.g1_forward,
          g2_reverse: gatesRow.g2_reverse,
          g3_watertight: gatesRow.g3_watertight,
          g4_zeroDefect: gatesRow.g4_zeroDefect,
          g6_budget: gatesRow.g6_budget,
        },
      };
      writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
      crumb('DONE', { totalMs: Date.now() - t0 });
      // eslint-disable-next-line no-console
      console.log(`[A-4 armA-gyroid] DONE\n${JSON.stringify(summary, null, 2)}`);

      // ── Assertions (HONEST CAN-FAIL — each checks a measured value against a §5.4-cited target;
      // nothing here was tuned to force a pass). ────────────────────────────────────────────────────
      expect(
        Math.abs(ptsDeltaFrac),
        `feature pts (${bandedge.totalPts}) vs champion-spec §5.4 target ${TARGET_PTS} (pure geometry, exact expected)`,
      ).toBeLessThan(PTS_TOL_FRAC);
      expect(
        Math.abs(outerDeltaFrac),
        `outer tris (${outerTris}) within +/-5% of champion-spec §5.4 target ${TARGET_OUTER_TRIS}`,
      ).toBeLessThanOrEqual(OUTER_TRI_TOL_FRAC);
      expect(
        hashIdentity,
        `region-layer hash (${result.meta.hash}) should equal the direct champion-twin hash (${twin.hash}) — ` +
          'byte-identical construction is the design intent of tierc_regionLayer.ts\'s R-CDT dispatch (see file header)',
      ).toBe(true);
      if (hashIdentity) {
        // The mesh is provably identical bit-for-bit — the stratified Newton-worst should closely
        // reproduce the banked figure (same deterministic mulberry32(0xC0FFEE) plan over the same
        // survivor population).
        expect(
          strat.newtonWorst,
          `Newton-worst (${strat.newtonWorst}) should closely reproduce champion-spec §5.4 target ${TARGET_NEWTON_WORST} (hash-identical mesh)`,
        ).toBeCloseTo(TARGET_NEWTON_WORST, 3);
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `[A-4 armA-gyroid] hash diverged from the direct twin — Newton-worst comparison is informational ` +
            `only: measured=${strat.newtonWorst} target=${TARGET_NEWTON_WORST} deltaFrac=${newtonWorstDeltaFrac}`,
        );
      }
      expect(
        Math.abs(estOutliersDeltaFrac),
        `stratified est. outliers (${strat.estOutliers}) within +/-15% of champion-spec §5.4 target ${TARGET_EST_OUTLIERS}`,
      ).toBeLessThanOrEqual(EST_OUTLIER_TOL_FRAC);
      expect(
        Math.abs(covMaxDeltaFrac),
        `coverage max (${coverage.max}) within +/-10% of champion-spec §5.4 target ${TARGET_COVERAGE_MAX}`,
      ).toBeLessThanOrEqual(COVERAGE_TOL_FRAC);
      if (kneeAdjacentFrac !== null) {
        expect(
          kneeAdjacentFrac,
          `knee-adjacent fraction of confirmed outliers (${kneeAdjacentFrac}) should dominate, matching champion-spec §5.4's 100%/410 figure`,
        ).toBeGreaterThanOrEqual(KNEE_ADJACENT_MIN_FRAC);
      }
      expect(regionAudit.controlMoved, 'watertight audit non-vacuity witness (region-layer full mesh)').toBe(true);
      // Non-manifold / fan-defect count is REPORTED (matches champion-spec-gyroid.md's own "cannot ship
      // as-is, named remedies un-implemented" finding, §4.2) — NOT hard-asserted to be zero here; the
      // brief explicitly scopes the fan-fix OUT of task A-4 ("the fan fix is a SEPARATE task").
    },
    TEST_TIMEOUT_MS,
  );
});
