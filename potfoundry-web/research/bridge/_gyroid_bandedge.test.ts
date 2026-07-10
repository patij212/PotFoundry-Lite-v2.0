// E-2026-07-10-GYROID-BANDEDGE — probe (pre-registered; see
// research/lab/E-2026-07-10-GYROID-BANDEDGE-prereg.md).
// Stages (PF_GBE_STAGE):
//   extract — Stage E: extract both wall-band isolevels (|val|=0.135, 0.15), validate
//             placement (<=0.001mm 3D disp gate), bank contours.json for Stage B.
//   build   — Stage B: rebuild the twin with the banked contours OVERRIDING the
//             general-curve inputs (production config otherwise, no floor). Reports
//             build/recovery/watertight/zeroArea outcomes -- a machinery-choke is a
//             first-class KILL-B finding, caught and reported, not propagated.
//   verdict — Stage V: prescreen + stratified Newton + coverage on the banked
//             build's mesh (rebuilds if the mesh wasn't kept in memory across a
//             process boundary -- each `it` is its own process invocation).
// Run (NO config file -- CLI flags only, staying inside this arm's allowed file globs):
//   NODE_OPTIONS=--max-old-space-size=16384 PF_GBE=1 [PF_GBE_STAGE=extract|build|verdict] \
//   npx vitest run research/bridge/_gyroid_bandedge.test.ts \
//   --testTimeout=5400000 --hookTimeout=600000 --pool=forks
// Heap: NODE_OPTIONS on the COMMAND LINE is REQUIRED (Vitest 4 silently ignores
// poolOptions.forks.execArgv in a config file -- banked E-2026-07-09-ANALYTIC-FLOOR /
// E-2026-07-10-GYROID-PRODCLOSE lesson).
// DEV-ONLY. src/ never imports research/. Artifacts gitignored; numbers inlined in
// the prereg's VERDICT section at close.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  GPC_BANKED,
  GPC_DIMS,
  GPC_STYLE,
  auditWatertight,
  buildGbeTwin,
  classifyNonManLoci,
  extractBandedgeContours,
  gbeBreadcrumb,
  gpcHeapLimitMB,
  gpcPrescreenCount,
  gpcPrescreenDetail,
  gpcScoreCoverage,
  gpcScoreForward,
  gpcStratifiedNewton,
  gyroidValDerivs,
  zeroAreaCount,
  type BandedgeExtraction,
} from './_gyroid_bandedge_lib';
import type { Contour } from './_gyroidContourLib';

const ON = process.env.PF_GBE === '1';
const STAGE = ((): 'extract' | 'build' | 'verdict' | 'locus' => {
  const s = process.env.PF_GBE_STAGE;
  return s === 'build' || s === 'verdict' || s === 'locus' ? s : 'extract';
})();
// FAST-HONEST-RULER shard levers for a possible sharded literal acceptance run (see
// prereg DECIDE fork) -- implemented from the start, exercised only if Stage V's
// stratified estimate says it is worth the CPU-hours.
const SHARD = Math.max(0, Number(process.env.PF_GBE_SHARD ?? 0));
const NSHARDS = Math.max(1, Number(process.env.PF_GBE_NSHARDS ?? 1));
// Contour decimation step override (coordinator-authorized bounded retry 2026-07-10:
// 0.15 -> 0.08 per the SS V11o lesson -- finer picket makes consecutive constraint
// vertices Delaunay-adjacent, recovery 99.1->99.4%). Artifact names are step-aware so
// the step-0.15 rows/meta stay banked for the A/B table; step 0.15 keeps the original
// (un-suffixed) names for continuity with the already-banked first run.
const STEP = Number(process.env.PF_GBE_STEP ?? 0.15);
const TOL = 0.01;
const ROOT = join('research', 'exchange', '_gyroid_bandedge');
const SUFFIX = STEP === 0.15 ? '' : `_s${STEP}`;
const CONTOURS_FILE = join(ROOT, `contours_bandedge${SUFFIX}.json`);
const BUILD_META_FILE = join(ROOT, `build_meta${SUFFIX}.json`);
const ROWS = join(ROOT, 'rows.ndjson');

interface StoredContours {
  wallIsolevels: BandedgeExtraction['wallIsolevels'];
  extractOpts: typeof GBE_EXTRACT_DEFAULT;
  inner: { c: number; label: string; contours: Contour[]; placement: BandedgeExtraction['inner']['placement'] };
  outer: { c: number; label: string; contours: Contour[]; placement: BandedgeExtraction['outer']['placement'] };
  totalPts: number;
  maxPlacementDisp3D: number;
  at: string;
}

function heapGate(): number {
  const heapMB = gpcHeapLimitMB();
  expect(
    heapMB,
    `fork-child V8 heap limit is ${heapMB}MB -- NODE_OPTIONS=--max-old-space-size=16384 did NOT propagate; relaunch with the env var exported`,
  ).toBeGreaterThanOrEqual(8192);
  return heapMB;
}

/** Load a banked Stage-E contours file back into the BandedgeExtraction shape. */
function loadBandedge(file: string): BandedgeExtraction {
  const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredContours;
  const lift = (s: StoredContours['inner']): BandedgeExtraction['inner'] => ({
    c: s.c, label: s.label, rawSegs: 0, rawContours: s.contours.length,
    rawPts: 0, keptPts: 0, droppedPts: 0, decimatedContours: s.contours,
    decimatedPtCount: s.contours.reduce((n, c) => n + c.pts.length, 0),
    placement: s.placement, ms: 0,
  });
  return {
    inner: lift(stored.inner), outer: lift(stored.outer),
    wallIsolevels: stored.wallIsolevels, totalPts: stored.totalPts,
    maxPlacementDisp3D: stored.maxPlacementDisp3D, ms: 0,
  };
}

describe('E-2026-07-10-GYROID-BANDEDGE -- doubled wall-band contours through production general-curve machinery', () => {
  it.skipIf(!ON)(`${GPC_STYLE}: stage=${STAGE}`, () => {
    mkdirSync(ROOT, { recursive: true });
    const heapMB = heapGate();
    gbeBreadcrumb(`stage=${STAGE} heapLimitMB=${heapMB} pid=${process.pid}`);
    const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);
    const row: Record<string, unknown> = { stage: STAGE, step: STEP, at: new Date().toISOString(), tol: TOL, heapMB };
    const wallTimes: Record<string, number> = {};
    const tStageStart = Date.now();

    // ── STAGE E: extract ──
    if (STAGE === 'extract') {
      const opts = { ...GBE_EXTRACT_DEFAULT, stepMm: STEP };
      const tExtract = Date.now();
      const bandedge = extractBandedgeContours(rA, GPC_DIMS.H, opts, GBE_FIELD);
      wallTimes.extractMs = Date.now() - tExtract;
      gbeBreadcrumb(
        `STAGE-E DONE inner: raw=${bandedge.inner.rawPts} kept=${bandedge.inner.keptPts} dropped=${bandedge.inner.droppedPts} decimated=${bandedge.inner.decimatedPtCount} | ` +
          `outer: raw=${bandedge.outer.rawPts} kept=${bandedge.outer.keptPts} dropped=${bandedge.outer.droppedPts} decimated=${bandedge.outer.decimatedPtCount} | ` +
          `maxPlacementDisp3D=${bandedge.maxPlacementDisp3D.toFixed(6)} (${wallTimes.extractMs}ms)`,
      );

      row.extract = {
        wallIsolevels: bandedge.wallIsolevels,
        inner: {
          c: bandedge.inner.c, rawPts: bandedge.inner.rawPts, keptPts: bandedge.inner.keptPts,
          droppedPts: bandedge.inner.droppedPts, decimatedPtCount: bandedge.inner.decimatedPtCount,
          placement: bandedge.inner.placement,
        },
        outer: {
          c: bandedge.outer.c, rawPts: bandedge.outer.rawPts, keptPts: bandedge.outer.keptPts,
          droppedPts: bandedge.outer.droppedPts, decimatedPtCount: bandedge.outer.decimatedPtCount,
          placement: bandedge.outer.placement,
        },
        totalPts: bandedge.totalPts, maxPlacementDisp3D: bandedge.maxPlacementDisp3D,
      };
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');

      const stored: StoredContours = {
        wallIsolevels: bandedge.wallIsolevels,
        extractOpts: opts,
        inner: {
          c: bandedge.inner.c, label: bandedge.inner.label,
          contours: bandedge.inner.decimatedContours, placement: bandedge.inner.placement,
        },
        outer: {
          c: bandedge.outer.c, label: bandedge.outer.label,
          contours: bandedge.outer.decimatedContours, placement: bandedge.outer.placement,
        },
        totalPts: bandedge.totalPts, maxPlacementDisp3D: bandedge.maxPlacementDisp3D,
        at: new Date().toISOString(),
      };
      writeFileSync(CONTOURS_FILE, JSON.stringify(stored));
      console.log(
        `[gyroid-bandedge] EXTRACT: inner(${bandedge.inner.c}) ${bandedge.inner.decimatedPtCount}pts (drop ${bandedge.inner.droppedPts}/${bandedge.inner.rawPts}) ` +
          `maxDisp=${bandedge.inner.placement.maxDisp3D.toFixed(6)} | outer(${bandedge.outer.c}) ${bandedge.outer.decimatedPtCount}pts ` +
          `(drop ${bandedge.outer.droppedPts}/${bandedge.outer.rawPts}) maxDisp=${bandedge.outer.placement.maxDisp3D.toFixed(6)} | ` +
          `total=${bandedge.totalPts}pts in ${(wallTimes.extractMs / 1000).toFixed(1)}s`,
      );

      // ── KILL-E gate (pre-registered): placement must be <=0.001mm at BOTH isolevels
      // at this design (nu=nt=1200, stepMm=0.15). A failure here does not auto-retry
      // a finer design inside this test -- the prereg's 2-design ladder is a SEPARATE
      // labeled run (PF_GBE_NU/PF_GBE_NT overrides), not a silent loop. ──
      expect(bandedge.inner.placement.maxDisp3D, 'inner isolevel (|val|=0.135) placement <=0.001mm').toBeLessThanOrEqual(0.001);
      expect(bandedge.outer.placement.maxDisp3D, 'outer isolevel (|val|=0.15) placement <=0.001mm').toBeLessThanOrEqual(0.001);
      return;
    }

    // ── STAGE locus: KILL-B residual classification (coordinator directive
    // 2026-07-10, post-retry: nonMan went 3 -> 2 at step 0.08 but did not reach 0 --
    // STOP iterating and classify the crack loci: (u,t), |val| at midpoint, distance
    // to each embedded isolevel's contour set, endpoint-on-constraint flags, u-seam
    // proximity. Runs BOTH banked steps sequentially in one process (two rebuilds --
    // never two of this arm's builds concurrently across processes). Report-shaped. ──
    if (STAGE === 'locus') {
      const designs: Array<{ step: number; file: string }> = [
        { step: 0.15, file: join(ROOT, 'contours_bandedge.json') },
        { step: 0.08, file: join(ROOT, 'contours_bandedge_s0.08.json') },
      ];
      const allLoci: Record<string, unknown>[] = [];
      for (const d of designs) {
        if (!existsSync(d.file)) {
          gbeBreadcrumb(`locus: skipping step=${d.step} (no contours file at ${d.file})`);
          continue;
        }
        const be = loadBandedge(d.file);
        gbeBreadcrumb(`locus step=${d.step}: rebuilding (pts=${be.totalPts})`);
        const twin = buildGbeTwin(be);
        if (twin.buildError) {
          gbeBreadcrumb(`locus step=${d.step}: build THREW -- ${twin.buildError.slice(0, 300)}`);
          continue;
        }
        const tScan = Date.now();
        const loci = classifyNonManLoci(twin, be, GBE_FIELD);
        gbeBreadcrumb(`locus step=${d.step}: ${loci.length} non-manifold edges classified (${Date.now() - tScan}ms scan)`);
        for (const L of loci) {
          const rec = { step: d.step, ...L };
          allLoci.push(rec as unknown as Record<string, unknown>);
          console.log(
            `[gyroid-bandedge] LOCUS step=${d.step}: edge(${L.a},${L.b}) mult=${L.mult} ` +
              `aUt=(${L.aUt[0].toFixed(6)},${L.aUt[1].toFixed(6)},sid=${L.aUt[2]}) bUt=(${L.bUt[0].toFixed(6)},${L.bUt[1].toFixed(6)},sid=${L.bUt[2]}) ` +
              `mid|val|=${L.midAbsVal.toFixed(5)} dEdgeIso=${L.dEdgeIso.toFixed(5)} ` +
              `dInnerCtr=${L.dInnerCtr.toFixed(6)} dOuterCtr=${L.dOuterCtr.toFixed(6)} ` +
              `onContour=(${L.aOnContour},${L.bOnContour}) nearUSeam=${L.nearUSeam}`,
          );
        }
      }
      row.loci = allLoci;
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      writeFileSync(join(ROOT, 'nonman_loci.json'), JSON.stringify(allLoci, null, 2));
      expect(allLoci.length).toBeGreaterThan(0); // we KNOW both builds have cracks; 0 found = scanner bug
      return;
    }

    // ── STAGE B: build ──
    if (STAGE === 'build') {
      if (!existsSync(CONTOURS_FILE)) {
        throw new Error(`Stage B requires Stage E's banked contours at ${CONTOURS_FILE} -- run PF_GBE_STAGE=extract first`);
      }
      const stored = JSON.parse(readFileSync(CONTOURS_FILE, 'utf8')) as StoredContours;
      const bandedge: BandedgeExtraction = {
        inner: {
          c: stored.inner.c, label: stored.inner.label, rawSegs: 0, rawContours: stored.inner.contours.length,
          rawPts: 0, keptPts: 0, droppedPts: 0, decimatedContours: stored.inner.contours,
          decimatedPtCount: stored.inner.contours.reduce((n, c) => n + c.pts.length, 0),
          placement: stored.inner.placement, ms: 0,
        },
        outer: {
          c: stored.outer.c, label: stored.outer.label, rawSegs: 0, rawContours: stored.outer.contours.length,
          rawPts: 0, keptPts: 0, droppedPts: 0, decimatedContours: stored.outer.contours,
          decimatedPtCount: stored.outer.contours.reduce((n, c) => n + c.pts.length, 0),
          placement: stored.outer.placement, ms: 0,
        },
        wallIsolevels: stored.wallIsolevels, totalPts: stored.totalPts,
        maxPlacementDisp3D: stored.maxPlacementDisp3D, ms: 0,
      };
      gbeBreadcrumb(`STAGE-B loaded contours from ${CONTOURS_FILE}: totalPts=${bandedge.totalPts}`);

      const tBuild = Date.now();
      const twin = buildGbeTwin(bandedge);
      wallTimes.assemblyMs = Date.now() - tBuild;
      row.build = {
        fullTris: twin.fullTris, outerTris: twin.outerTris, fullVerts: twin.fullVerts, outerVerts: twin.outerVerts,
        hash: twin.hash, generalCurveCount: twin.generalCurveCount, generalCurvePtCount: twin.generalCurvePtCount,
        hasFeatures: twin.hasFeatures, uBias: twin.uBias, buildMs: twin.buildMs, buildError: twin.buildError ?? null,
      };
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');

      // ── KILL-B: assembleWatertight threw -- THE finding, reported and stopped. ──
      if (twin.buildError) {
        gbeBreadcrumb(`STAGE-B KILL-B: assembleWatertight threw -- ${twin.buildError.slice(0, 500)}`);
        console.log(`[gyroid-bandedge] KILL-B: build THREW with generalCurvePts=${twin.generalCurvePtCount}:\n${twin.buildError}`);
        writeFileSync(BUILD_META_FILE, JSON.stringify({ killB: true, buildError: twin.buildError, generalCurvePtCount: twin.generalCurvePtCount, at: new Date().toISOString() }, null, 2));
        expect.fail(`KILL-B fired: production's general-curve machinery threw at ${twin.generalCurvePtCount} contour points -- see run.log / rows.ndjson for the full error. This IS the arm's finding, not an infra failure.`);
      }

      console.log(
        `[gyroid-bandedge] BUILD: full=${twin.fullTris} outer=${twin.outerTris} tris hash=${twin.hash} ` +
          `generalCurves=${twin.generalCurveCount} (${twin.generalCurvePtCount}pts) hasFeatures=${twin.hasFeatures} uBias=${twin.uBias} ` +
          `in ${(twin.buildMs / 1000).toFixed(0)}s`,
      );

      const tAudit = Date.now();
      const audit = auditWatertight(twin.fullIdx);
      wallTimes.auditMs = Date.now() - tAudit;
      gbeBreadcrumb(`audit DONE nonMan=${audit.nonMan} controlMoved=${audit.controlMoved} (${wallTimes.auditMs}ms)`);
      row.nonManRaw = audit.nonMan;
      row.nonManControlMoved = audit.controlMoved;
      row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');

      writeFileSync(
        BUILD_META_FILE,
        JSON.stringify(
          {
            killB: false, fullTris: twin.fullTris, outerTris: twin.outerTris, hash: twin.hash,
            generalCurveCount: twin.generalCurveCount, generalCurvePtCount: twin.generalCurvePtCount,
            hasFeatures: twin.hasFeatures, uBias: twin.uBias, nonMan: audit.nonMan, zeroArea: row.zeroArea,
            outerBudgetOkAt7M: twin.outerTris <= 7_000_000, at: new Date().toISOString(),
          },
          null, 2,
        ),
      );

      console.log(
        `[gyroid-bandedge] BUILD gates: nonMan=${audit.nonMan} (controlMoved=${audit.controlMoved}) zeroArea=${row.zeroArea} ` +
          `outerTris=${twin.outerTris} (<=7.0M: ${twin.outerTris <= 7_000_000})`,
      );

      // ── Mandatory hygiene gates (KILL-B class -- watertight/zeroArea broken IS the finding). ──
      expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
      expect(audit.nonMan, 'watertight (post band-edge embed)').toBe(0);
      expect(row.zeroArea, 'zeroArea (post band-edge embed)').toBe(0);
      // KILL-4 (budget) is reported, not hard-failed here -- Stage V still runs and
      // classifies a >7.0M build as FRONTIER per the prereg, rather than losing the
      // fidelity data. The budget verdict is adjudicated in the prereg's VERDICT text.
      if (twin.outerTris > 7_000_000) {
        console.log(`[gyroid-bandedge] NOTE: outerTris ${twin.outerTris} exceeds the 7.0M budget gate -- FRONTIER class, see prereg K4.`);
      }
      return;
    }

    // ── STAGE V: verdict ──
    if (STAGE === 'verdict') {
      if (!existsSync(CONTOURS_FILE)) {
        throw new Error(`Stage V requires Stage E's banked contours at ${CONTOURS_FILE} -- run PF_GBE_STAGE=extract first`);
      }
      const stored = JSON.parse(readFileSync(CONTOURS_FILE, 'utf8')) as StoredContours;
      const bandedge: BandedgeExtraction = {
        inner: {
          c: stored.inner.c, label: stored.inner.label, rawSegs: 0, rawContours: stored.inner.contours.length,
          rawPts: 0, keptPts: 0, droppedPts: 0, decimatedContours: stored.inner.contours,
          decimatedPtCount: stored.inner.contours.reduce((n, c) => n + c.pts.length, 0),
          placement: stored.inner.placement, ms: 0,
        },
        outer: {
          c: stored.outer.c, label: stored.outer.label, rawSegs: 0, rawContours: stored.outer.contours.length,
          rawPts: 0, keptPts: 0, droppedPts: 0, decimatedContours: stored.outer.contours,
          decimatedPtCount: stored.outer.contours.reduce((n, c) => n + c.pts.length, 0),
          placement: stored.outer.placement, ms: 0,
        },
        wallIsolevels: stored.wallIsolevels, totalPts: stored.totalPts,
        maxPlacementDisp3D: stored.maxPlacementDisp3D, ms: 0,
      };

      const tBuild = Date.now();
      const twin = buildGbeTwin(bandedge);
      wallTimes.assemblyMs = Date.now() - tBuild;
      if (twin.buildError) {
        throw new Error(`Stage V: build threw (should have been caught by Stage B first) -- ${twin.buildError}`);
      }
      gbeBreadcrumb(`STAGE-V rebuilt for scoring: outerTris=${twin.outerTris} (${wallTimes.assemblyMs}ms)`);

      const tAudit = Date.now();
      const audit = auditWatertight(twin.fullIdx);
      wallTimes.auditMs = Date.now() - tAudit;
      row.nonManRaw = audit.nonMan;
      row.nonManControlMoved = audit.controlMoved;
      row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);

      // ── Prescreen (report-only per the prereg's V11b saturation caveat -- NOT a
      // verdict signal by itself on this wall-dominated style). ──
      const tPreDetail = Date.now();
      if (NSHARDS > 1) row.shard = { i: SHARD, n: NSHARDS };
      const preDetail = gpcPrescreenDetail(twin.outerXyz, twin.outerIdx, rA, GPC_DIMS.H, TOL);
      wallTimes.prescreenDetailMs = Date.now() - tPreDetail;
      gbeBreadcrumb(`prescreenDetail DONE survivors=${preDetail.recs.length}/${preDetail.nFacets} (${wallTimes.prescreenDetailMs}ms)`);

      // ── Stratified Newton (the V11i two-tier interim basis, exactly the parent
      // arm's floorstrat plan sizing -- ~2,000 queries near the mission's stated
      // budget). ──
      const tStrat = Date.now();
      const strat = gpcStratifiedNewton(preDetail.recs, rA, GPC_DIMS.H, TOL, {
        topExhaustive: 200, strata: 8, perStratum: 225,
      });
      wallTimes.stratifiedMs = Date.now() - tStrat;
      gbeBreadcrumb(
        `stratified DONE est=${strat.estOutliers} worst=${strat.newtonWorst.toFixed(4)} sampled=${strat.sampled} ` +
          `knee={wall:${strat.kneeClass.wallBand},adj:${strat.kneeClass.kneeAdjacent},off:${strat.kneeClass.offBand}} (${wallTimes.stratifiedMs}ms)`,
      );

      // KILL-3 off-wall check: explicit headline, not buried -- the single-midline
      // failure mode (SS V11o) is 90% off-wall despite this design embedding BOTH
      // edges; verify the off-band fraction stays low even though a midline was
      // never used, per the prereg's explicit instruction.
      const offBandFrac = strat.overSampled > 0 ? strat.kneeClass.offBand / strat.overSampled : 0;

      const tCov = Date.now();
      const cov = gpcScoreCoverage(twin.outerXyz, twin.outerIdx, rA, GPC_DIMS.H, TOL);
      wallTimes.coverageScoreMs = Date.now() - tCov;
      gbeBreadcrumb(`coverage DONE max=${cov.max.toFixed(4)} p99=${cov.p99.toFixed(4)} (${wallTimes.coverageScoreMs}ms)`);

      row.build = {
        fullTris: twin.fullTris, outerTris: twin.outerTris, hash: twin.hash,
        generalCurveCount: twin.generalCurveCount, generalCurvePtCount: twin.generalCurvePtCount, uBias: twin.uBias,
      };
      row.prescreen = { survivors: preDetail.recs.length, nFacets: preDetail.nFacets };
      row.stratified = {
        estOutliers: strat.estOutliers, newtonWorst: strat.newtonWorst, sampled: strat.sampled,
        overSampled: strat.overSampled, kneeClass: strat.kneeClass, offBandFrac, strata: strat.strata,
      };
      row.coverage = cov as unknown as Record<string, unknown>;
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      writeFileSync(
        join(ROOT, `verdict_strat${SUFFIX}.json`),
        JSON.stringify({ ...row, scatter: strat.scatter, at: new Date().toISOString() }, null, 2),
      );

      // ── A/B vs the parent arm's baseline (stratified) AND floor config, printed
      // as the headline comparison table the prereg's DELIVER section needs. ──
      console.log(
        `[gyroid-bandedge] VERDICT: outerTris=${twin.outerTris} (baseline ${GPC_BANKED.outerTris}) | ` +
          `survivors=${preDetail.recs.length} (baseline ${GPC_BANKED.survivors}, saturation caveat applies) | ` +
          `est.trueOutliers(stratified)=${strat.estOutliers} (baseline ~96,012) | ` +
          `Newton-worst=${strat.newtonWorst.toFixed(4)} (baseline 0.0576) | ` +
          `kneeClass: wall=${strat.kneeClass.wallBand} adj=${strat.kneeClass.kneeAdjacent} off=${strat.kneeClass.offBand} (offFrac=${(offBandFrac * 100).toFixed(1)}%) | ` +
          `coverage.max=${cov.max.toFixed(4)} (baseline 0.0987) | watertight nonMan=${audit.nonMan} zeroArea=${row.zeroArea}`,
      );

      // Sample a few Newton-confirmed knee points and print their |val| distance from
      // the nearest embedded isolevel, using the SAME classify-style read the
      // stratified fn already does internally -- a sanity echo, not a new instrument.
      if (strat.scatter.length > 0) {
        const s0 = strat.scatter[0];
        const av = Math.abs(gyroidValDerivs(s0.u, s0.t).val);
        gbeBreadcrumb(`scatter sample[0]: u=${s0.u} t=${s0.t} |val|=${av.toFixed(5)} newton=${s0.newton}`);
      }

      // ── Instrument hygiene (mandatory). ──
      expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
      expect(cov.locSelfCheckMax).toBeLessThan(1e-9);
      expect(audit.nonMan, 'watertight').toBe(0);
      expect(row.zeroArea, 'zeroArea').toBe(0);
      // No acceptance/regression assert here -- Stage V is report-shaped (matching
      // the parent arm's floorstrat discipline); KILL-3's regression check and the
      // ACCEPTANCE/FRONTIER classification are adjudicated in the prereg's VERDICT
      // text against this row's numbers, not as an in-test hard assertion, since the
      // DECIDE fork (sharded literal vs. classify) is a judgment call on the
      // stratified estimate's magnitude, not a fixed threshold.
      return;
    }
  }, 5_400_000);

  // ── Sharded literal acceptance (DECIDE fork; only meaningful once Stage V's
  // stratified estimate justifies it -- see prereg). Every-facet stride-1 scoring on
  // this shard's slice of survivors, exact-count equivalence by construction per
  // E-2026-07-09-FAST-HONEST-RULER. ──
  it.skipIf(!ON || STAGE !== 'verdict' || NSHARDS <= 1)(`${GPC_STYLE}: literal shard ${SHARD}/${NSHARDS}`, () => {
    mkdirSync(ROOT, { recursive: true });
    heapGate();
    if (!existsSync(CONTOURS_FILE)) {
      throw new Error(`literal shard requires Stage E's banked contours -- run PF_GBE_STAGE=extract first`);
    }
    const stored = JSON.parse(readFileSync(CONTOURS_FILE, 'utf8')) as StoredContours;
    const bandedge: BandedgeExtraction = {
      inner: {
        c: stored.inner.c, label: stored.inner.label, rawSegs: 0, rawContours: stored.inner.contours.length,
        rawPts: 0, keptPts: 0, droppedPts: 0, decimatedContours: stored.inner.contours,
        decimatedPtCount: stored.inner.contours.reduce((n, c) => n + c.pts.length, 0),
        placement: stored.inner.placement, ms: 0,
      },
      outer: {
        c: stored.outer.c, label: stored.outer.label, rawSegs: 0, rawContours: stored.outer.contours.length,
        rawPts: 0, keptPts: 0, droppedPts: 0, decimatedContours: stored.outer.contours,
        decimatedPtCount: stored.outer.contours.reduce((n, c) => n + c.pts.length, 0),
        placement: stored.outer.placement, ms: 0,
      },
      wallIsolevels: stored.wallIsolevels, totalPts: stored.totalPts,
      maxPlacementDisp3D: stored.maxPlacementDisp3D, ms: 0,
    };
    const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);
    const twin = buildGbeTwin(bandedge);
    if (twin.buildError) throw new Error(`literal shard: build threw -- ${twin.buildError}`);
    gbeBreadcrumb(`literal shard ${SHARD}/${NSHARDS} build DONE outerTris=${twin.outerTris}`);
    const fwd = gpcScoreForward(twin.outerXyz, twin.outerIdx, rA, GPC_DIMS.H, {
      tol: TOL, newtonAll: true, shard: { i: SHARD, n: NSHARDS },
    });
    gbeBreadcrumb(`literal shard ${SHARD}/${NSHARDS} DONE outliers=${fwd.outliers} newtonAll=${JSON.stringify(fwd.newtonAll)}`);
    appendFileSync(
      ROWS,
      JSON.stringify({ stage: 'literal-shard', shard: SHARD, nshards: NSHARDS, forward: fwd, at: new Date().toISOString() }) + '\n',
    );
    console.log(`[gyroid-bandedge] LITERAL SHARD ${SHARD}/${NSHARDS}: survivors=${fwd.survivors} outliers=${fwd.outliers} newtonAll=${JSON.stringify(fwd.newtonAll)}`);
    expect(fwd.scoredSurvivors).toBeGreaterThanOrEqual(0);
  }, 5_400_000);
});
