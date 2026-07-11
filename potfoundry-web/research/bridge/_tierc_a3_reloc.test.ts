// _tierc_a3_reloc.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A3-relocate (Addendum 13 DIAGNOSE-
// THEN-FIX). Companion: research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md Addendum 13,
// research/lab/tierc/champion-spec-gyroid.md SS1.4/SS2.1-2.2/SS2.5/SS3.2,
// research/exchange/tierc/armA3_char_summary.json + armA3_char_heatmap.txt (the hot-arc geography),
// research/bridge/_tierc_a3_reloc_lib.ts (the wrapper primitives this probe drives).
//
// STAGE 1 (diagnosis, cheap, PF_TIERC_A3RELOC_DIAG=1): for every already Newton-confirmed band-edge
// outlier (research/exchange/tierc/armA3_char_confirmed.json, 2205 points), scan the CLOSED-FORM
// gyroidAnalyticCurvature along the local val-GRADIENT direction (the natural across-band
// coordinate) and find the argmax |val| locus. Compare to the nominal embedded edge (0.135 if
// nearestIsInner else 0.15). PRE-REGISTERED thresholds (written BEFORE reading any result):
//   median |offset| >= OFFSET_MATERIAL_THRESHOLD (0.0005, ~1/3 of the ramp half-width 0.0075)
//     => OFFSET-class => Step 2 lever = RELOCATE the embedded isolevels.
//   median |offset| <  ATEDGE_THRESHOLD (0.0002, ~2x the extraction valTol=1e-4)
//     => AT-EDGE-class => Step 2 lever = LOCAL along-curve DENSIFY on the ~166 hot arcs only.
//   otherwise => AMBIGUOUS => Step 2 tests BOTH.
//
// STAGE 2 (fix + score, PF_TIERC_A3RELOC_BUILD=1): builds the lever STAGE 1 indicated (env-selected
// via PF_TIERC_A3RELOC_LEVER='relocate'|'densify', set AFTER inspecting the Stage-1 JSON) on the
// Delta2-exact fanRepair twin (A2 policy, so nonMan doesn't confound), scores via the SAME
// instruments the champion's own verdict used (gpcPrescreenDetail + gpcStratifiedNewton, plan
// {topExhaustive:200,strata:8,perStratum:225} -- apples-to-apples with the banked ~31,114/0.024917),
// audits watertightness (auditWatertight, non-vacuous) and re-runs the knee-class check (100%
// knee-adjacent / 0 off-band is the pre-registered HALT-and-reclassify signature if violated).
//
// RULES: NEW FILE ONLY. Read-only on all committed research libs + src/ -- no edit to
// _gyroidContourLib.ts / _gyroid_bandedge_lib.ts / any production conforming/ file. DEV-ONLY,
// research/ never imported by src/. Commit nothing. Resilience: two independently env-gated `it`
// blocks (a kill mid-Stage-2 does not lose Stage-1's diagnosis); breadcrumb every <=30s;
// intermediate results flushed to disk the instant computed; self-bumps to AboveNormal priority.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import {
  scanCurvatureAcrossBand,
  percentiles,
  gpcR0Wrap,
  GPC_FIELD,
  GPC_DIMS,
  extractIsolevelPairAt,
  marchLinkRefine,
  decimatePerPolylineTargeted,
  buildFanRepairOuterFromCurves,
} from './_tierc_a3_reloc_lib';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  contoursToFeatureLines,
  gpcPrescreenDetail,
  gpcStratifiedNewton,
  auditWatertight,
  zeroAreaCount,
} from './_gyroid_bandedge_lib';
import { gyroidValDerivs } from './_gyroid_prodclose_lib';

const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armA3_reloc_crumbs.ndjson');
const DIAG_ON = process.env.PF_TIERC_A3RELOC_DIAG === '1';
const BUILD_ON = process.env.PF_TIERC_A3RELOC_BUILD === '1';
const LEVER = process.env.PF_TIERC_A3RELOC_LEVER ?? ''; // 'relocate' | 'densify' | 'both'
const TOL = 0.01;

// PRE-REGISTERED (before reading any Stage-1 result):
const OFFSET_MATERIAL_THRESHOLD = 0.0005;
const ATEDGE_THRESHOLD = 0.0002;

/** Baseline champion numbers, THIS build (hash 51a25eba-6a58e3e1, fanRepair, cited from the
 *  already-run+verified armA3_char_summary.json -- NOT rebuilt here, avoids spending budget twice
 *  on the identical construction). */
const CHAMPION_BASELINE = {
  hash: '51a25eba-6a58e3e1',
  fullTris: 4365674,
  outerTris: 2242984,
  survivors: 236185,
  newtonWorstObserved: 0.025060266742862585,
  bankedNewtonWorst: 0.02491654414922634,
  bandedgePts: 28785,
  bandedgePolylines: 2045,
};
/** From the champion's OWN BANDEDGE verdict (champion-spec-gyroid.md SS5.2): the plan used to
 *  produce the banked ~31,114 estimate -- reused verbatim for apples-to-apples comparison. */
const STRAT_PLAN = { topExhaustive: 200, strata: 8, perStratum: 225 };

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A3-reloc', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}
function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}
function bumpPriority(tag: string): void {
  try {
    os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
  } catch {
    console.log(`[${tag}] note: could not self-bump priority (EcoQoS throttle risk remains)`);
  }
}

interface ConfirmedRec {
  f: number; u: number; t: number; newton: number; radial: number; source: string;
  nearestPoly: number; nearestPtIdx: number; nearestIsInner: boolean; nearestDist: number;
  alongFrac: number; absValAtPt: number; dEdgeIso: number;
}

// ═══════════════════════════════════════════ STAGE 1: DIAGNOSIS ═══════════════════════════════════════════

describe.skipIf(!DIAG_ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A3-relocate STAGE 1 (curvature-peak locus diagnosis)', () => {
  it('locates the analytic curvature peak vs the nominal band edges for every confirmed outlier', () => {
    const t0 = Date.now();
    bumpPriority('armA3-reloc-diag');
    const heapMB = heapLimitMB();
    crumb('start', { heapLimitMB: heapMB });

    const confirmedPath = join(OUT_DIR, 'armA3_char_confirmed.json');
    expect(existsSync(confirmedPath), 'Stage-1 depends on the already-run armA3_char_confirmed.json').toBe(true);
    const confirmed: ConfirmedRec[] = JSON.parse(readFileSync(confirmedPath, 'utf8'));
    crumb('loaded-confirmed', { n: confirmed.length });

    const r0 = gpcR0Wrap;
    const H = GPC_DIMS.H;
    expect(H).toBe(TIERC_COMMON_DIMS.H);

    let scanOkCount = 0;
    const innerOffsets: number[] = [], outerOffsets: number[] = [];
    const innerPeakAbsVal: number[] = [], outerPeakAbsVal: number[] = [];
    const innerPeakKappa: number[] = [], outerPeakKappa: number[] = [];
    const innerKappaAtEdge: number[] = [], outerKappaAtEdge: number[] = [];
    const innerStartKappa: number[] = [], outerStartKappa: number[] = [];
    // sign convention: offset = peakAbsVal - nominalEdge. Positive = peak is on the RAMP-INTERIOR
    // side of the nominal edge (toward the midline 0.1425); negative = peak is OUTSIDE the ramp
    // (toward the flat plateau/floor beyond the nominal edge).
    let lastCrumb = Date.now();
    for (let i = 0; i < confirmed.length; i++) {
      const c = confirmed[i];
      const scan = scanCurvatureAcrossBand(c.u, c.t, r0, H, GPC_FIELD, 0.004, 400);
      if (scan.scanOk) {
        scanOkCount++;
        const nominalEdge = c.nearestIsInner ? 0.135 : 0.15;
        const sign = c.nearestIsInner ? 1 : -1; // toward-midline is +val for inner(0.135), -val for outer(0.15)
        const offset = sign * (scan.peakAbsVal - nominalEdge);
        const kappaAtEdge = c.nearestIsInner ? scan.kappaAt135 : scan.kappaAt150;
        if (c.nearestIsInner) {
          innerOffsets.push(offset); innerPeakAbsVal.push(scan.peakAbsVal); innerPeakKappa.push(scan.peakKappa);
          innerKappaAtEdge.push(kappaAtEdge); innerStartKappa.push(scan.startKappa);
        } else {
          outerOffsets.push(offset); outerPeakAbsVal.push(scan.peakAbsVal); outerPeakKappa.push(scan.peakKappa);
          outerKappaAtEdge.push(kappaAtEdge); outerStartKappa.push(scan.startKappa);
        }
      }
      if (Date.now() - lastCrumb > 30000) {
        crumb('scan-progress', { i, n: confirmed.length, scanOkCount, elapsedMs: Date.now() - t0 });
        lastCrumb = Date.now();
      }
    }
    crumb('scan-done', { scanOkCount, total: confirmed.length, ms: Date.now() - t0 });

    const innerOffsetStats = percentiles(innerOffsets);
    const outerOffsetStats = percentiles(outerOffsets);
    const allOffsets = [...innerOffsets, ...outerOffsets];
    const allAbsOffsetStats = percentiles(allOffsets.map((x) => Math.abs(x)));

    const medianAbsOffset = allAbsOffsetStats.p50;
    let verdict: 'OFFSET' | 'AT-EDGE' | 'AMBIGUOUS';
    if (medianAbsOffset >= OFFSET_MATERIAL_THRESHOLD) verdict = 'OFFSET';
    else if (medianAbsOffset < ATEDGE_THRESHOLD) verdict = 'AT-EDGE';
    else verdict = 'AMBIGUOUS';

    // suggested relocated c-values (median peak |val| per group) -- ready-to-use if verdict=OFFSET.
    const suggestedCInner = percentiles(innerPeakAbsVal).p50;
    const suggestedCOuter = percentiles(outerPeakAbsVal).p50;

    // kappa amplification at peak vs at the nominal edge (informs whether densification even has
    // room to help: if kappaAtEdge ~= kappaAtPeak, the edge already sits at/near the peak).
    const innerKappaRatio = percentiles(innerPeakKappa.map((pk, idx) => (innerKappaAtEdge[idx] > 1e-9 ? pk / innerKappaAtEdge[idx] : 1)));
    const outerKappaRatio = percentiles(outerPeakKappa.map((pk, idx) => (outerKappaAtEdge[idx] > 1e-9 ? pk / outerKappaAtEdge[idx] : 1)));

    const summary = {
      experiment: 'E-2026-07-11-TIERC-HEADTOHEAD Arm A3-relocate STAGE 1 (curvature-peak diagnosis)',
      at: new Date().toISOString(),
      elapsedMs: Date.now() - t0,
      nConfirmed: confirmed.length,
      scanOkCount,
      scanParams: { halfWidth: 0.004, steps: 400 },
      thresholds: { OFFSET_MATERIAL_THRESHOLD, ATEDGE_THRESHOLD },
      innerGroup: {
        n: innerOffsets.length,
        offsetStats: innerOffsetStats,
        peakAbsValStats: percentiles(innerPeakAbsVal),
        peakKappaStats: percentiles(innerPeakKappa),
        kappaAtEdgeStats: percentiles(innerKappaAtEdge),
        startKappaStats: percentiles(innerStartKappa),
        kappaPeakOverEdgeRatioStats: innerKappaRatio,
      },
      outerGroup: {
        n: outerOffsets.length,
        offsetStats: outerOffsetStats,
        peakAbsValStats: percentiles(outerPeakAbsVal),
        peakKappaStats: percentiles(outerPeakKappa),
        kappaAtEdgeStats: percentiles(outerKappaAtEdge),
        startKappaStats: percentiles(outerStartKappa),
        kappaPeakOverEdgeRatioStats: outerKappaRatio,
      },
      combined: { medianAbsOffset, allAbsOffsetStats },
      suggestedReloc: { cInner: suggestedCInner, cOuter: suggestedCOuter, nominalInner: 0.135, nominalOuter: 0.15 },
      verdict,
    };
    writeFileSync(join(OUT_DIR, 'armA3_reloc_diag.json'), JSON.stringify(summary, null, 2));
    crumb('DONE', { verdict, medianAbsOffset, suggestedCInner, suggestedCOuter, totalMs: Date.now() - t0 });
    // eslint-disable-next-line no-console
    console.log(`[armA3-reloc-diag] DONE\n${JSON.stringify(summary, null, 2)}`);

    expect(scanOkCount, 'the curvature scan must be non-vacuous').toBeGreaterThan(0);
  }, 10 * 60 * 1000);
});

// ═══════════════════════════════════════════ STAGE 2: FIX + SCORE ═══════════════════════════════════════════

describe.skipIf(!BUILD_ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A3-relocate STAGE 2 (build+score the indicated lever)', () => {
  it(
    'builds the Stage-1-indicated fix and scores it against the champion baseline',
    () => {
      const t0 = Date.now();
      bumpPriority('armA3-reloc-build');
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB, lever: LEVER });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);
      expect(['relocate', 'densify', 'both'], 'PF_TIERC_A3RELOC_LEVER must be set after Stage 1').toContain(LEVER);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      const diagPath = join(OUT_DIR, 'armA3_reloc_diag.json');
      expect(existsSync(diagPath), 'Stage 2 depends on Stage 1 having run').toBe(true);
      const diag = JSON.parse(readFileSync(diagPath, 'utf8'));
      crumb('diag-loaded', { verdict: diag.verdict, suggestedReloc: diag.suggestedReloc });

      const levers = LEVER === 'both' ? ['relocate', 'densify'] : [LEVER];
      const results: Record<string, unknown> = {};

      for (const lever of levers) {
        crumb(`lever-${lever}-start`);
        const tLever = Date.now();
        let generalCurves;
        let extractMeta: Record<string, unknown>;

        if (lever === 'relocate') {
          const cInner = diag.suggestedReloc.cInner;
          const cOuter = diag.suggestedReloc.cOuter;
          const tExtract = Date.now();
          const bandedge = extractIsolevelPairAt(rA, H, cInner, cOuter, GBE_EXTRACT_DEFAULT, GBE_FIELD);
          crumb('relocate-extract-done', {
            ms: Date.now() - tExtract, cInner, cOuter,
            totalPts: bandedge.totalPts, innerPolylines: bandedge.inner.decimatedContours.length,
            outerPolylines: bandedge.outer.decimatedContours.length,
            innerPlacementMax: bandedge.inner.placement.maxDisp3D, outerPlacementMax: bandedge.outer.placement.maxDisp3D,
          });
          generalCurves = [
            ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'reloc-inner'),
            ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'reloc-outer'),
          ];
          extractMeta = {
            cInner, cOuter, totalPts: bandedge.totalPts,
            innerPolylines: bandedge.inner.decimatedContours.length, outerPolylines: bandedge.outer.decimatedContours.length,
            innerPlacementMax: bandedge.inner.placement.maxDisp3D, outerPlacementMax: bandedge.outer.placement.maxDisp3D,
            innerDropped: bandedge.inner.droppedPts, outerDropped: bandedge.outer.droppedPts,
          };
        } else {
          // densify: identify hot polyline gids from the confirmed-outlier attribution, reproduce
          // refine-stage contours (zero-drop, so gid == champion's decimated-array index), decimate
          // hot gids at a finer step, everyone else at the champion's stepMm.
          const confirmed: ConfirmedRec[] = JSON.parse(readFileSync(join(OUT_DIR, 'armA3_char_confirmed.json'), 'utf8'));
          const hotInner = new Set<number>(), hotOuterLocal = new Set<number>();
          for (const c of confirmed) {
            if (c.nearestIsInner) hotInner.add(c.nearestPoly);
            else hotOuterLocal.add(c.nearestPoly);
          }
          const tRefine = Date.now();
          const iso = { inner: 0.135, outer: 0.15 };
          const innerRefined = marchLinkRefine(iso.inner, rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
          const outerRefined = marchLinkRefine(iso.outer, rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
          crumb('densify-refine-done', {
            ms: Date.now() - tRefine, innerContours: innerRefined.length, outerContours: outerRefined.length,
            expectInner: CHAMPION_BASELINE.bandedgePolylines, // sanity: inner+outer should equal 2045 (0 drops)
          });
          // 0.02mm = 7.5x finer than the champion's 0.15, LOCAL to hot arcs only (not diluted
          // globally). Chosen deliberately aggressive: the champion-spec SS2.2 A/B already found
          // GLOBAL 0.15->0.08 (only 1.875x finer, diluted across all 2045 polylines) fidelity-
          // equivalent (Newton-worst BIT-IDENTICAL to 6 sig figs) -- a timid local step would not
          // discriminate "along-curve density is not the lever" from "wasn't aggressive enough".
          const FINE_STEP_MM = 0.02;
          const innerDec = decimatePerPolylineTargeted(innerRefined, 0, hotInner, GBE_EXTRACT_DEFAULT.stepMm, FINE_STEP_MM, rA, H);
          const outerDec = decimatePerPolylineTargeted(outerRefined, innerRefined.length, hotOuterLocal, GBE_EXTRACT_DEFAULT.stepMm, FINE_STEP_MM, rA, H);
          crumb('densify-decimate-done', {
            ms: Date.now() - tRefine, nHotInner: innerDec.nHot, nHotOuter: outerDec.nHot,
            innerPts: innerDec.hotPtCount + innerDec.coolPtCount, outerPts: outerDec.hotPtCount + outerDec.coolPtCount,
          });
          generalCurves = [
            ...contoursToFeatureLines(innerDec.contours, 'densify-inner'),
            ...contoursToFeatureLines(outerDec.contours, 'densify-outer'),
          ];
          extractMeta = {
            fineStepMm: FINE_STEP_MM, hotInnerPolylines: innerDec.nHot, hotOuterPolylines: outerDec.nHot,
            totalHotPolylines: innerDec.nHot + outerDec.nHot,
            totalPts: innerDec.hotPtCount + innerDec.coolPtCount + outerDec.hotPtCount + outerDec.coolPtCount,
          };
        }

        const tBuild = Date.now();
        const build = buildFanRepairOuterFromCurves(rA, generalCurves);
        crumb(`lever-${lever}-build-done`, { ms: Date.now() - tBuild, hash: build.hash, fullTris: build.fullTris, outerTris: build.outerTris });
        writeFileSync(join(OUT_DIR, `armA3_reloc_${lever}_build_meta.json`), JSON.stringify({
          lever, hash: build.hash, fullTris: build.fullTris, outerTris: build.outerTris, extractMeta,
          trisDeltaPct: +(100 * (build.outerTris - CHAMPION_BASELINE.outerTris) / CHAMPION_BASELINE.outerTris).toFixed(3),
        }));

        // watertight + zeroArea (G4 gate), non-vacuous
        const tWt = Date.now();
        const wt = auditWatertight(build.fullIdx);
        const za = zeroAreaCount(build.outerXyz, build.outerIdx);
        crumb(`lever-${lever}-watertight-done`, { ms: Date.now() - tWt, nonMan: wt.nonMan, controlMoved: wt.controlMoved, zeroArea: za });

        // prescreen (cheap, ~49s banked) then the SAME stratified plan the champion's own verdict used
        const tPre = Date.now();
        const { recs, nFacets } = gpcPrescreenDetail(build.outerXyz, build.outerIdx, rA, H, TOL);
        crumb(`lever-${lever}-prescreen-done`, { ms: Date.now() - tPre, survivors: recs.length, nFacets });
        writeFileSync(join(OUT_DIR, `armA3_reloc_${lever}_prescreen_meta.json`), JSON.stringify({ survivors: recs.length, nFacets }));

        const tStrat = Date.now();
        const strat = gpcStratifiedNewton(recs, rA, H, TOL, STRAT_PLAN, GPC_FIELD);
        crumb(`lever-${lever}-stratified-done`, {
          ms: Date.now() - tStrat, estOutliers: strat.estOutliers, newtonWorst: strat.newtonWorst,
          kneeClass: strat.kneeClass, sampled: strat.sampled,
        });

        const kneeTotal = strat.kneeClass.wallBand + strat.kneeClass.kneeAdjacent + strat.kneeClass.offBand;
        const kneeAdjacentFrac = kneeTotal > 0 ? strat.kneeClass.kneeAdjacent / kneeTotal : 0;
        const offBandFrac = kneeTotal > 0 ? strat.kneeClass.offBand / kneeTotal : 0;
        const HALT = offBandFrac > 0.02; // pre-registered: any material off-band reappearance = the K3 signature

        const leverResult = {
          lever,
          extractMeta,
          build: { hash: build.hash, fullTris: build.fullTris, outerTris: build.outerTris, buildMs: build.buildMs },
          trisDeltaVsChampionPct: +(100 * (build.outerTris - CHAMPION_BASELINE.outerTris) / CHAMPION_BASELINE.outerTris).toFixed(3),
          watertight: { nonMan: wt.nonMan, controlMoved: wt.controlMoved, zeroArea: za },
          prescreen: { survivors: recs.length, nFacets, survivorsDeltaVsChampionPct: +(100 * (recs.length - CHAMPION_BASELINE.survivors) / CHAMPION_BASELINE.survivors).toFixed(3) },
          stratified: {
            estOutliers: strat.estOutliers, newtonWorst: strat.newtonWorst, sampled: strat.sampled, overSampled: strat.overSampled,
            kneeClass: strat.kneeClass, kneeAdjacentFrac: +kneeAdjacentFrac.toFixed(4), offBandFrac: +offBandFrac.toFixed(4),
            estOutliersDeltaVsChampionPct: +(100 * (strat.estOutliers - 31114) / 31114).toFixed(2),
            newtonWorstDeltaVsChampionPct: +(100 * (strat.newtonWorst - CHAMPION_BASELINE.bankedNewtonWorst) / CHAMPION_BASELINE.bankedNewtonWorst).toFixed(2),
          },
          HALT_offBandReappeared: HALT,
          gateNewtonWorstLE001: strat.newtonWorst <= 0.01,
          elapsedMs: Date.now() - tLever,
        };
        results[lever] = leverResult;
        writeFileSync(join(OUT_DIR, `armA3_reloc_${lever}_result.json`), JSON.stringify(leverResult, null, 2));
        crumb(`lever-${lever}-DONE`, { estOutliers: strat.estOutliers, newtonWorst: strat.newtonWorst, HALT, elapsedMs: Date.now() - tLever });
        // eslint-disable-next-line no-console
        console.log(`[armA3-reloc-build] lever=${lever} DONE\n${JSON.stringify(leverResult, null, 2)}`);

        if (HALT) {
          console.log(`[armA3-reloc-build] HALT: off-band fraction ${offBandFrac} exceeds 0.02 for lever=${lever} -- possible K3 signature reappearance`);
        }
      }

      const finalSummary = {
        experiment: 'E-2026-07-11-TIERC-HEADTOHEAD Arm A3-relocate STAGE 2 (build+score)',
        at: new Date().toISOString(),
        elapsedMs: Date.now() - t0,
        championBaseline: CHAMPION_BASELINE,
        diagVerdict: diag.verdict,
        levers,
        results,
      };
      writeFileSync(join(OUT_DIR, 'armA3_reloc_final_summary.json'), JSON.stringify(finalSummary, null, 2));
      crumb('ALL-DONE', { totalMs: Date.now() - t0, levers });
      // eslint-disable-next-line no-console
      console.log(`[armA3-reloc-build] ALL DONE\n${JSON.stringify(finalSummary, null, 2)}`);

      expect(Object.keys(results).length, 'at least one lever must have produced a result').toBeGreaterThan(0);
    },
    35 * 60 * 1000,
  );
});

void gyroidValDerivs; // kept imported for potential ad-hoc debug; silence unused if trimmed later
