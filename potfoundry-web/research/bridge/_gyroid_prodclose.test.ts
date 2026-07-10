// E-2026-07-10-GYROID-PRODCLOSE — probe (pre-registered; see
// research/lab/E-2026-07-10-GYROID-PRODCLOSE-prereg.md).
// Stages (PF_GPC):
//   twin    — Node twin at production defaults (resU/resT=128, no floor). TWIN-VALIDITY
//             gates vs the banked GyroidManifold production row (E-2026-07-09-PROD-
//             ARTIFACT-TRUTH / FAST-HONEST-RULER). Banks the baseline row for later stages.
//   floorval— Stage-F step 1: build the analytic curvature floor at PF_GPC_RESU (default
//             512) and VALIDATE it against dense FD-sampled kappa (>=1M probes) BEFORE any
//             mesher use — the pre-registered VALIDATION KILL gate.
//   floor   — Stage-F step 2: apply the validated floor via TwinOverrides at PF_GPC_RESU,
//             full scoring (forward + Newton-all + coverage + watertight). Report-shaped —
//             KILL-A/B/C classification happens by comparing 2+ floor rows (this arm makes
//             no default-path change under any outcome).
// Run (NO config file — CLI flags only, staying inside this arm's allowed file globs):
//   NODE_OPTIONS=--max-old-space-size=16384 PF_GPC=1 [PF_GPC_STAGE=twin|floorval|floor] \
//   [PF_GPC_RESU=512] npx vitest run research/bridge/_gyroid_prodclose.test.ts \
//   --testTimeout=5400000 --hookTimeout=600000 --pool=forks
// Heap: NODE_OPTIONS on the COMMAND LINE is REQUIRED (Vitest 4 silently ignores
// poolOptions.forks.execArgv in a config file — banked E-2026-07-09-ANALYTIC-FLOOR
// lesson; this is also WHY there is no vitest.gyroid_prodclose.config.ts in this arm — a
// config file would sit outside the pre-registered allowed-file globs regardless).
// DEV-ONLY. src/ never imports research/. Artifacts gitignored; numbers inlined in the
// prereg's VERDICT section at close.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import {
  GPC_BANKED,
  GPC_DIMS,
  GPC_STYLE,
  auditWatertight,
  buildGpcTwin,
  buildGyroidCurvatureFloor,
  gpcBreadcrumb,
  gpcHeapLimitMB,
  gpcPrescreenCount,
  gpcPrescreenDetail,
  gpcR0,
  gpcScoreCoverage,
  gpcScoreForward,
  gpcStratifiedNewton,
  validateGyroidFloor,
  zeroAreaCount,
} from './_gyroid_prodclose_lib';
import { AF_PROD_OPTS } from './_analytic_floor_lib';

const ON = process.env.PF_GPC === '1';
const STAGE = ((): 'twin' | 'twingate' | 'floorval' | 'floor' | 'floorstrat' => {
  const s = process.env.PF_GPC_STAGE;
  return s === 'floorval' || s === 'floor' || s === 'twingate' || s === 'floorstrat' ? s : 'twin';
})();
const RESU = Math.max(128, Math.floor(Number(process.env.PF_GPC_RESU ?? 512)));
// FAST-HONEST-RULER shard levers for the literal acceptance run (survivors ≡ i mod n;
// exact-count equivalence by construction — see the banked E-2026-07-09-FAST-HONEST-RULER).
const SHARD = Math.max(0, Number(process.env.PF_GPC_SHARD ?? 0));
const NSHARDS = Math.max(1, Number(process.env.PF_GPC_NSHARDS ?? 1));
const TOL = 0.01;
const ROOT = join('research', 'exchange', '_gyroid_prodclose');
const BASELINE = join(ROOT, 'twin_baseline.json');
const ROWS = join(ROOT, 'rows.ndjson');

interface Baseline {
  hash: string;
  fullTris: number;
  outerTris: number;
  survivors: number;
  newtonWorst: number;
  coverageMax: number;
  at: string;
}

describe('E-2026-07-10-GYROID-PRODCLOSE — production twin, analytic curvature floor', () => {
  it.skipIf(!ON)(`${GPC_STYLE}: stage=${STAGE} resU=${RESU}`, () => {
    mkdirSync(ROOT, { recursive: true });
    // ── HEAP FAIL-FAST GATE (post-mortem of the first Stage-T attempt, 2026-07-10):
    // that run stalled for 2.2h with declining CPU utilization and zero output — prime
    // suspect: NODE_OPTIONS=--max-old-space-size not reaching the vitest FORK CHILD
    // (the banked E-2026-07-09-ANALYTIC-FLOOR footgun). Unverifiable from outside on
    // Windows, so verify IN-CHILD: read the actual V8 heap limit and fail in seconds
    // with an unambiguous message instead of grinding for hours. ──
    const heapMB = gpcHeapLimitMB();
    gpcBreadcrumb(`stage=${STAGE} resU=${RESU} heapLimitMB=${heapMB} pid=${process.pid}`);
    expect(
      heapMB,
      `fork-child V8 heap limit is ${heapMB}MB — NODE_OPTIONS=--max-old-space-size=16384 did NOT propagate; relaunch with the env var exported`,
    ).toBeGreaterThanOrEqual(8192);
    const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);
    const row: Record<string, unknown> = { stage: STAGE, resU: RESU, at: new Date().toISOString(), tol: TOL, heapMB };
    const wallTimes: Record<string, number> = {};
    const tStageStart = Date.now();

    // ── STAGE twingate: adjudicate the pre-registered STRICT twin gate WITHOUT the
    // multi-hour stride-1 survivor scoring (coordinator-authorized parallelization,
    // 2026-07-10; prereg-compatibility verified before implementing: the STRICT gate =
    // outer tris ±3% AND prescreen radial-survivor count ±10% AND coverage max ±0.010 —
    // Newton-worst appears ONLY in the WIDE fallback band, and the prereg's VERDICT
    // BASIS section binds fidelity verdicts, not this instrument gate). Same
    // instruments as the twin stage (same deterministic build fn — prior run measured
    // Δ2-exact vs the banked artifact — same denseBary(8) prescreen, same coverage
    // ruler); only the scoring is unbundled. The still-running twin-stage scan is left
    // untouched and delivers the own-basis fidelity baseline (incl. Newton-worst) to
    // rows.ndjson + twin_baseline.json when it lands — belt-and-braces.
    if (STAGE === 'twingate') {
      const tBuild = Date.now();
      const twin = buildGpcTwin();
      wallTimes.assemblyMs = Date.now() - tBuild;
      row.build = {
        fullTris: twin.fullTris, outerTris: twin.outerTris, hash: twin.hash,
        generalCurves: twin.generalCurveCount, uBias: twin.uBias, buildMs: twin.buildMs,
      };
      const tAudit = Date.now();
      const audit = auditWatertight(twin.fullIdx);
      wallTimes.auditMs = Date.now() - tAudit;
      gpcBreadcrumb(`twingate audit DONE nonMan=${audit.nonMan} (${wallTimes.auditMs}ms)`);
      row.nonManRaw = audit.nonMan;
      row.nonManControlMoved = audit.controlMoved;
      row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);
      const tPre = Date.now();
      const survivors = gpcPrescreenCount(twin.outerXyz, twin.outerIdx, rA, GPC_DIMS.H, TOL);
      wallTimes.prescreenMs = Date.now() - tPre;
      gpcBreadcrumb(`twingate prescreen DONE survivors=${survivors}/${twin.outerTris} (${wallTimes.prescreenMs}ms)`);
      const tCov = Date.now();
      const cov = gpcScoreCoverage(twin.outerXyz, twin.outerIdx, rA, GPC_DIMS.H, TOL);
      wallTimes.coverageScoreMs = Date.now() - tCov;
      gpcBreadcrumb(`twingate coverage DONE max=${cov.max.toFixed(4)} p99=${cov.p99.toFixed(4)} (${wallTimes.coverageScoreMs}ms)`);
      row.survivors = survivors;
      row.coverage = cov as unknown as Record<string, unknown>;
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;

      const trisPass = Math.abs(twin.outerTris - GPC_BANKED.outerTris) / GPC_BANKED.outerTris < 0.03;
      const survPass = Math.abs(survivors - GPC_BANKED.survivors) / GPC_BANKED.survivors < 0.10;
      const covPass = Math.abs(cov.max - GPC_BANKED.coverageMax) < 0.010;
      const strict = trisPass && survPass && covPass;
      row.twinGate = { strict, trisPass, survPass, covPass };
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      writeFileSync(
        join(ROOT, 'twin_gate.json'),
        JSON.stringify(
          {
            strict, trisPass, survPass, covPass,
            outerTris: twin.outerTris, survivors, coverageMax: cov.max,
            banked: GPC_BANKED, at: new Date().toISOString(),
          },
          null, 2,
        ),
      );
      console.log(
        `[gyroid-prodclose] TWINGATE: outerTris ${GPC_BANKED.outerTris}->${twin.outerTris} (${trisPass ? 'PASS' : 'FAIL'}) | ` +
          `survivors ${GPC_BANKED.survivors}->${survivors} (${((Math.abs(survivors - GPC_BANKED.survivors) / GPC_BANKED.survivors) * 100).toFixed(2)}% delta, ${survPass ? 'PASS' : 'FAIL'}) | ` +
          `coverage ${GPC_BANKED.coverageMax}->${cov.max.toFixed(4)} (${covPass ? 'PASS' : 'FAIL'}) | STRICT=${strict}`,
      );
      gpcBreadcrumb(`twingate VERDICT strict=${strict} tris=${trisPass} surv=${survPass} cov=${covPass}`);

      // Instrument hygiene + the pre-registered STRICT gate. (The WIDE fallback band
      // needs Newton-worst — if strict fails, that adjudication waits for the scan row.)
      expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
      expect(cov.locSelfCheckMax).toBeLessThan(1e-9);
      expect(audit.nonMan, 'watertight').toBe(0);
      expect(row.zeroArea, 'zeroArea').toBe(0);
      expect(strict, 'pre-registered STRICT twin gate (tris AND survivors AND coverage)').toBe(true);
      return;
    }

    // ── STAGE floorstrat: V11i two-tier STRATIFIED Newton estimate (labeled interim
    // basis — coordinator redirect 2026-07-10, run.log REFRAME note): the radial
    // survivor count SATURATES on near-vertical walls (V11b banked), so the floor
    // config's 351,698 survivors say nothing by themselves and the blind literal chain
    // is 10-20 CPU-h. This stage Newton-scores a deterministic stratified sample of
    // BOTH configs' survivors (~500 baseline, ~2,000 floor) for the DECIDE fork:
    // sharded literal acceptance iff plausibly-closing, else KILL-A per the 05:12:22Z
    // pre-commit. Report-shaped: no fidelity asserts here.
    if (STAGE === 'floorstrat') {
      const tB = Date.now();
      let base: ReturnType<typeof buildGpcTwin> | null = buildGpcTwin();
      const basePre = gpcPrescreenDetail(base.outerXyz, base.outerIdx, rA, GPC_DIMS.H, TOL);
      const baseOuterTris = base.outerTris;
      base = null; // release the mesh before the bigger floor build
      gpcBreadcrumb(`floorstrat baseline prescreenDetail survivors=${basePre.recs.length}/${basePre.nFacets} (${Date.now() - tB}ms)`);
      const baseStrat = gpcStratifiedNewton(basePre.recs, rA, GPC_DIMS.H, TOL, {
        topExhaustive: 100, strata: 8, perStratum: 50,
      });
      gpcBreadcrumb(
        `floorstrat baseline strat: est=${baseStrat.estOutliers} worst=${baseStrat.newtonWorst.toFixed(4)} ` +
          `sampled=${baseStrat.sampled} knee={wall:${baseStrat.kneeClass.wallBand},adj:${baseStrat.kneeClass.kneeAdjacent},off:${baseStrat.kneeClass.offBand}} (${baseStrat.ms}ms)`,
      );

      const tF = Date.now();
      const floorSpec = buildGyroidCurvatureFloor(gpcR0, GPC_DIMS.H, {
        resU: RESU, resT: RESU, maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm,
      });
      gpcBreadcrumb(`floorstrat floor grid built (${Date.now() - tF}ms)`);
      let flr: ReturnType<typeof buildGpcTwin> | null = buildGpcTwin(floorSpec, { resU: RESU, resT: RESU });
      const flrPre = gpcPrescreenDetail(flr.outerXyz, flr.outerIdx, rA, GPC_DIMS.H, TOL);
      const flrOuterTris = flr.outerTris;
      flr = null;
      gpcBreadcrumb(`floorstrat floor prescreenDetail survivors=${flrPre.recs.length}/${flrPre.nFacets} (${Date.now() - tF}ms)`);
      const flrStrat = gpcStratifiedNewton(flrPre.recs, rA, GPC_DIMS.H, TOL, {
        topExhaustive: 400, strata: 8, perStratum: 200,
      });
      gpcBreadcrumb(
        `floorstrat floor strat: est=${flrStrat.estOutliers} worst=${flrStrat.newtonWorst.toFixed(4)} ` +
          `sampled=${flrStrat.sampled} knee={wall:${flrStrat.kneeClass.wallBand},adj:${flrStrat.kneeClass.kneeAdjacent},off:${flrStrat.kneeClass.offBand}} (${flrStrat.ms}ms)`,
      );

      row.baseline = {
        outerTris: baseOuterTris, survivors: basePre.recs.length,
        estOutliers: baseStrat.estOutliers, newtonWorst: baseStrat.newtonWorst,
        sampled: baseStrat.sampled, kneeClass: baseStrat.kneeClass, strata: baseStrat.strata,
      };
      row.floor = {
        outerTris: flrOuterTris, survivors: flrPre.recs.length,
        estOutliers: flrStrat.estOutliers, newtonWorst: flrStrat.newtonWorst,
        sampled: flrStrat.sampled, kneeClass: flrStrat.kneeClass, strata: flrStrat.strata,
      };
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      writeFileSync(
        join(ROOT, 'floor_strat.json'),
        JSON.stringify({ baseline: { ...(row.baseline as object), scatter: baseStrat.scatter }, floor: { ...(row.floor as object), scatter: flrStrat.scatter }, at: new Date().toISOString() }, null, 2),
      );
      console.log(
        `[gyroid-prodclose] FLOORSTRAT (stratified interim basis): ` +
          `baseline est=${baseStrat.estOutliers}±strat worst=${baseStrat.newtonWorst.toFixed(4)} (artifact literal: 105,107/0.0590) | ` +
          `floor est=${flrStrat.estOutliers} worst=${flrStrat.newtonWorst.toFixed(4)} tris=${flrOuterTris} | ` +
          `floor knee-class of Newton-outliers: wall=${flrStrat.kneeClass.wallBand} kneeAdj=${flrStrat.kneeClass.kneeAdjacent} off=${flrStrat.kneeClass.offBand}`,
      );
      return;
    }

    // ── STAGE floorval: derive + VALIDATE the analytic floor at RESU BEFORE any mesher use ──
    if (STAGE === 'floorval') {
      const tFloorBuild = Date.now();
      const floor = buildGyroidCurvatureFloor(gpcR0, GPC_DIMS.H, {
        resU: RESU, resT: RESU, maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm,
      });
      wallTimes.floorBuildMs = Date.now() - tFloorBuild;
      row.maxKappa = floor.maxKappa;

      const tValidate = Date.now();
      const NPROBES = 1_000_000;
      const val = validateGyroidFloor(floor.curvatureFloor, gpcR0, GPC_DIMS.H, NPROBES);
      wallTimes.validateMs = Date.now() - tValidate;
      row.validation = val;
      row.wallTimes = wallTimes;
      row.totalMs = Date.now() - tStageStart;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');

      const violFrac = val.violations / val.total;
      console.log(
        `[gyroid-prodclose] floorval resU=${RESU}: probes=${val.total} inBand=${(val.fracInBand * 100).toFixed(2)}% ` +
          `violations=${val.violations} (${(violFrac * 100).toFixed(3)}%) maxShortfall=${val.maxShortfall.toFixed(6)} ` +
          `worstUt=(${val.worstUt[0].toFixed(4)},${val.worstUt[1].toFixed(4)}) | floorBuild=${wallTimes.floorBuildMs}ms validate=${wallTimes.validateMs}ms`,
      );

      // ── VALIDATION KILL gate (pre-registered) ──
      expect(1 - violFrac, 'floor(u,t) >= sampled kappa at >=99% of probes').toBeGreaterThanOrEqual(0.99);
      return;
    }

    // ── STAGE twin / floor: build the assembly, score, checkpoint, gate ──
    const floorOpt = STAGE === 'floor'
      ? buildGyroidCurvatureFloor(gpcR0, GPC_DIMS.H, {
          resU: RESU, resT: RESU, maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm,
        })
      : undefined;
    if (floorOpt) row.maxKappa = floorOpt.maxKappa;

    const tBuild = Date.now();
    const overrides = STAGE === 'floor' ? { resU: RESU, resT: RESU } : undefined;
    const twin = buildGpcTwin(floorOpt, overrides);
    wallTimes.assemblyMs = Date.now() - tBuild;
    row.build = {
      fullTris: twin.fullTris, outerTris: twin.outerTris, fullVerts: twin.fullVerts, outerVerts: twin.outerVerts,
      hash: twin.hash, generalCurves: twin.generalCurveCount, hasFeatures: twin.hasFeatures,
      uBias: twin.uBias, buildMs: twin.buildMs,
    };
    console.log(
      `[gyroid-prodclose] ${STAGE} resU=${RESU}: built full=${twin.fullTris} outer=${twin.outerTris} tris ` +
        `hash=${twin.hash} generalCurves=${twin.generalCurveCount} hasFeatures=${twin.hasFeatures} uBias=${twin.uBias} ` +
        `in ${(twin.buildMs / 1000).toFixed(0)}s`,
    );

    const tAudit = Date.now();
    const audit = auditWatertight(twin.fullIdx);
    wallTimes.auditMs = Date.now() - tAudit;
    gpcBreadcrumb(`audit DONE nonMan=${audit.nonMan} (${wallTimes.auditMs}ms)`);
    row.nonManRaw = audit.nonMan;
    row.nonManControlMoved = audit.controlMoved;
    row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);

    const tFwd = Date.now();
    if (NSHARDS > 1) row.shard = { i: SHARD, n: NSHARDS };
    const fwd = gpcScoreForward(twin.outerXyz, twin.outerIdx, rA, GPC_DIMS.H, {
      tol: TOL, newtonAll: STAGE === 'floor',
      shard: NSHARDS > 1 ? { i: SHARD, n: NSHARDS } : undefined,
    });
    wallTimes.forwardScoreMs = Date.now() - tFwd;
    gpcBreadcrumb(`forward DONE survivors=${fwd.survivors} outliers=${fwd.outliers} (${wallTimes.forwardScoreMs}ms)`);
    row.forward = fwd as unknown as Record<string, unknown>;

    const tCov = Date.now();
    const cov = gpcScoreCoverage(twin.outerXyz, twin.outerIdx, rA, GPC_DIMS.H, TOL);
    wallTimes.coverageScoreMs = Date.now() - tCov;
    gpcBreadcrumb(`coverage DONE max=${cov.max.toFixed(4)} (${wallTimes.coverageScoreMs}ms)`);
    row.coverage = cov as unknown as Record<string, unknown>;
    row.wallTimes = wallTimes;
    row.totalMs = Date.now() - tStageStart;

    console.log(
      `[gyroid-prodclose] ${STAGE}: forward survivors=${fwd.survivors} out=${fwd.outliers} gridMax=${fwd.gridMax.toFixed(4)} ` +
        `newtonWorst=${fwd.newtonWorst.toFixed(4)}` +
        (fwd.newtonAll
          ? ` | newtonALL pts=${fwd.newtonAll.pointsScored} over=${fwd.newtonAll.pointsOver} facetsOver=${fwd.newtonAll.facetsOver} max=${fwd.newtonAll.max.toFixed(4)}`
          : '') +
        ` | coverage max=${cov.max.toFixed(4)} p99=${cov.p99.toFixed(4)} | wallTimes=${JSON.stringify(wallTimes)}`,
    );

    // Checkpoint the row BEFORE any assert (data survives a failing verdict / timeout).
    appendFileSync(ROWS, JSON.stringify(row) + '\n');

    // Instrument hygiene (both stages).
    expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
    expect(cov.locSelfCheckMax).toBeLessThan(1e-9);

    if (STAGE === 'twin') {
      // ── TWIN-VALIDITY gates (pre-registered, vs the banked production row) ──
      const trisPass = Math.abs(twin.outerTris - GPC_BANKED.outerTris) / GPC_BANKED.outerTris < 0.03;
      const survPass = Math.abs(fwd.survivors - GPC_BANKED.survivors) / GPC_BANKED.survivors < 0.10;
      const covPass = Math.abs(cov.max - GPC_BANKED.coverageMax) < 0.010;
      row.twinGate = { strict: trisPass && survPass && covPass, trisPass, survPass, covPass };
      console.log(
        `[gyroid-prodclose] TWIN-VALIDITY: outerTris ${GPC_BANKED.outerTris}->${twin.outerTris} ` +
          `(${(Math.abs(twin.outerTris - GPC_BANKED.outerTris) / GPC_BANKED.outerTris * 100).toFixed(2)}% delta, gate <3%) | ` +
          `survivors ${GPC_BANKED.survivors}->${fwd.survivors} ` +
          `(${(Math.abs(fwd.survivors - GPC_BANKED.survivors) / GPC_BANKED.survivors * 100).toFixed(2)}% delta, gate <10%) | ` +
          `coverage ${GPC_BANKED.coverageMax}->${cov.max.toFixed(4)} (delta ${Math.abs(cov.max - GPC_BANKED.coverageMax).toFixed(4)}, gate <0.010) | ` +
          `STRICT=${trisPass && survPass && covPass}`,
      );

      // WIDER band (twin-baseline, not artifact-exact): tris within 10%, survivors
      // 100k-200k, Newton-worst 0.03-0.09 (magnitude class match).
      const trisWide = Math.abs(twin.outerTris - GPC_BANKED.outerTris) / GPC_BANKED.outerTris < 0.10;
      const survClass = fwd.survivors >= 100_000 && fwd.survivors <= 200_000;
      const newtonClass = fwd.newtonWorst >= 0.03 && fwd.newtonWorst <= 0.09;
      row.twinGateWide = { pass: trisWide && survClass && newtonClass, trisWide, survClass, newtonClass };
      console.log(
        `[gyroid-prodclose] TWIN-VALIDITY WIDE (fallback): trisWide=${trisWide} survClass(100k-200k)=${survClass}(${fwd.survivors}) ` +
          `newtonClass(0.03-0.09)=${newtonClass}(${fwd.newtonWorst.toFixed(4)}) | WIDE-PASS=${trisWide && survClass && newtonClass}`,
      );

      if (!existsSync(BASELINE)) {
        const baseline: Baseline = {
          hash: twin.hash, fullTris: twin.fullTris, outerTris: twin.outerTris,
          survivors: fwd.survivors, newtonWorst: fwd.newtonWorst, coverageMax: cov.max,
          at: new Date().toISOString(),
        };
        writeFileSync(BASELINE, JSON.stringify(baseline, null, 2));
        console.log(`[gyroid-prodclose] twin baseline BANKED: hash=${baseline.hash}`);
      }

      // Pre-registered STOP: fail the test if NEITHER band passes (surfaces the miss to CI-style output).
      expect(
        (trisPass && survPass && covPass) || (trisWide && survClass && newtonClass),
        'twin must pass STRICT or WIDE (labeled twin-baseline) validity band',
      ).toBe(true);
      expect(audit.nonMan, 'watertight').toBe(0);
      expect(row.zeroArea, 'zeroArea').toBe(0);
    } else if (STAGE === 'floor') {
      // ── Stage F report gates: hygiene only (KILL-A/B/C classification is done by
      // comparing 2+ floor rows across resU designs, per the prereg — no single-row
      // acceptance/rejection assert here beyond watertight/zeroArea, matching the
      // pre-committed "report-shaped, no silent iteration" discipline). ──
      expect(audit.nonMan, 'watertight (floor)').toBe(0);
      expect(row.zeroArea, 'zeroArea (floor)').toBe(0);
      if (existsSync(BASELINE)) {
        const banked = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
        const nAll = fwd.newtonAll;
        console.log(
          `[gyroid-prodclose] floor resU=${RESU} vs twin baseline: outerTris ${banked.outerTris}->${twin.outerTris} ` +
            `survivors ${banked.survivors}->${fwd.survivors} newtonWorst ${banked.newtonWorst.toFixed(4)}->${fwd.newtonWorst.toFixed(4)} ` +
            `coverage ${banked.coverageMax.toFixed(4)}->${cov.max.toFixed(4)}` +
            (nAll ? ` newtonAll: pts=${nAll.pointsScored} over=${nAll.pointsOver} facetsOver=${nAll.facetsOver} max=${nAll.max.toFixed(4)}` : ''),
        );
      }
    }
  }, 5_400_000);
});
