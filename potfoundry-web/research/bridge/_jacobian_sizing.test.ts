// E-2026-07-10-JACOBIAN-SIZING — probe (pre-registered; see
// research/lab/E-2026-07-10-JACOBIAN-SIZING-prereg.md).
//
// Stages (PF_JS_STAGE):
//   fd      — analytic Jacobian vs finite-difference validation (fast, no mesh).
//   fleet   — J-field statistics for SpiralRidges/GyroidManifold/DragonScales
//             (fast, no mesh — the mandatory fleet diagnostic).
//   h0      — flag-off production twin rebuild; BYTE-IDENTITY vs the banked
//             H0 = f707898e-02e3bea1 (pinned-worktree instrument gate).
//   c1match — rebuild the ORIGINAL (non-J) masked-C1 floor (resU512/resT128) via
//             buildAnalyticCurvatureFloor directly; must reproduce the KILL-A
//             verdict's class (fullTris ~6,956,244; 2,764 facets over; worst
//             ~0.0358) within noise — instrument-match gate BEFORE the J-arm
//             is trusted.
//   jdesign — the J-composed floor (buildJacobianAwareFloor) at the SAME C1
//             config; two-tier acceptance (prescreen -> stratified estimate ->
//             exact literal) + budget/coverage/watertight gates.
//
// Run (no dedicated vitest config — file-scope restriction; matches the more
// recent _gyroid_prodclose/_gyroid_bandedge precedent, which also dropped the
// per-experiment config file once NODE_OPTIONS-on-CLI was banked as the fix for
// "Vitest 4 silently ignores poolOptions.forks.execArgv in a config file"):
//   NODE_OPTIONS=--max-old-space-size=16384 PF_JS=1 PF_JS_STAGE=<stage> \
//     npx vitest run research/bridge/_jacobian_sizing.test.ts \
//     --testTimeout=5400000 --hookTimeout=600000 --pool=forks --no-file-parallelism
//
// DEV-ONLY. src/ never imports research/. Data under research/exchange/_jacobian_sizing/
// is gitignored; numbers are inlined into the prereg's verdict section on completion.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import {
  AF_DIMS,
  AF_PROD_OPTS,
  AF_STYLE,
  auditWatertight,
  buildProductionTwin,
  scoreCoverage,
  scoreForward,
  zeroAreaCount,
} from './_analytic_floor_lib';
import {
  JS_EXCHANGE,
  jsBreadcrumb,
  jsHeapLimitMB,
  spiralRidgesWarpChoices,
  extractWarpChoices,
  validateJacobianFD,
  jFieldStats,
  buildJacobianAwareFloor,
  prescreenDetail,
  stratifiedNewtonEstimate,
  classifyJacobianResidual,
} from './_jacobian_sizing_lib';
import { buildAnalyticCurvatureFloor } from '../../src/renderers/webgpu/parametric/conforming/AnalyticCurvatureFloor';

const ON = process.env.PF_JS === '1';
const STAGE = ((): 'fd' | 'fleet' | 'h0' | 'c1match' | 'jdesign' => {
  const s = process.env.PF_JS_STAGE;
  return s === 'fd' || s === 'fleet' || s === 'h0' || s === 'c1match' || s === 'jdesign' ? s : 'fd';
})();

const TOL = 0.01;
const H0_EXPECTED = 'f707898e-02e3bea1';
const FLAG_OFF_FULLTRIS = 5_686_834; // TWIN-VALIDITY re-measurement, E-2026-07-09-ANALYTIC-FLOOR
const BUDGET_GATE = Math.floor(1.5 * FLAG_OFF_FULLTRIS); // 8,530,251
const C1_MATCH = { fullTris: 6_956_244, facetsOver: 2_764, worst: 0.03575, coverageMax: null as number | null };
const MASKED_RES = { resU: 512, resT: 128 };
const ROOT = JS_EXCHANGE;
const ROWS = join(ROOT, 'rows.ndjson');

function heapGate(): void {
  const mb = jsHeapLimitMB();
  jsBreadcrumb(`heapGate: heap_size_limit=${mb}MB pid=${process.pid}`);
  expect(mb, `NODE_OPTIONS=--max-old-space-size must propagate to the fork child (got ${mb}MB)`).toBeGreaterThanOrEqual(8192);
}

describe('E-2026-07-10-JACOBIAN-SIZING', () => {
  it.skipIf(!ON)(`stage=${STAGE}`, () => {
    mkdirSync(ROOT, { recursive: true });
    const row: Record<string, unknown> = { stage: STAGE, at: new Date().toISOString(), tol: TOL, pid: process.pid };
    jsBreadcrumb(`=== stage=${STAGE} start pid=${process.pid} ===`);

    // ── fd: analytic Jacobian vs FD, no mesh ──
    if (STAGE === 'fd') {
      const w = spiralRidgesWarpChoices();
      jsBreadcrumb(
        `fd: helix isIdentity=${w.helixChoice.warp.isIdentity} creaseU isIdentity=${w.creaseChoice.warp.isIdentity} ` +
          `creaseT isIdentity=${w.creaseTChoice.warp.isIdentity} shearRate=${w.helixChoice.warp.shearRate}`,
      );
      const val = validateJacobianFD(w, { nProbes: 100_000, h: 1e-6, kinkMargin: 1e-4, seed: 0x1acb1a });
      row.validation = val as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      console.log(`[jacobian-sizing] fd:\n${JSON.stringify(val, null, 2)}`);
      jsBreadcrumb(
        `fd: nProbes=${val.nProbes} excluded=${val.nExcludedNearKink} maxRelErrJu=${val.maxRelErrJu.toExponential(3)} ` +
          `maxRelErrShear=${val.maxRelErrShear.toExponential(3)} ms=${val.ms}`,
      );
      expect(val.nProbes, 'at least 100k in-segment probes').toBeGreaterThanOrEqual(100_000);
      expect(val.maxRelErrJu, 'analytic Ju must match FD of the composed warp map to <1e-6 rel-err').toBeLessThan(1e-6);
      if (val.maxRelErrShear > 0) {
        expect(val.maxRelErrShear, 'shear term (diagnostic-only) must also match FD to <1e-6 rel-err').toBeLessThan(1e-6);
      }
      return;
    }

    // ── fleet: J-field stats, no mesh (mandatory diagnostic) ──
    if (STAGE === 'fleet') {
      const dims = { H: AF_DIMS.H, Rt: AF_DIMS.Rt, Rb: AF_DIMS.Rb };
      const spiral = jFieldStats(spiralRidgesWarpChoices(), AF_STYLE, 2048, 512);
      const gyroid = jFieldStats(extractWarpChoices('GyroidManifold', {}, dims), 'GyroidManifold', 2048, 512);
      const dragon = jFieldStats(extractWarpChoices('DragonScales', {}, dims), 'DragonScales', 2048, 512);
      row.fleet = { spiral, gyroid, dragon } as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      for (const s of [spiral, gyroid, dragon]) {
        jsBreadcrumb(
          `fleet ${s.styleId}: branch=${s.branch} maxJ2=${s.maxJ2.toFixed(4)} p99J2=${s.p99J2.toFixed(4)} ` +
            `areaFracJ2>1=${(s.areaFracJ2Over1 * 100).toFixed(2)}% areaFracJ2>1.5=${(s.areaFracJ2Over1_5 * 100).toFixed(2)}%`,
        );
      }
      console.log(`[jacobian-sizing] fleet:\n${JSON.stringify({ spiral, gyroid, dragon }, null, 2)}`);
      return;
    }

    // Heavy stages below all need the real heap.
    heapGate();

    // ── h0: flag-off byte-identity (pinned-worktree instrument gate) ──
    if (STAGE === 'h0') {
      const twin = buildProductionTwin(undefined);
      row.build = { fullTris: twin.fullTris, outerTris: twin.outerTris, hash: twin.hash, buildMs: twin.buildMs };
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      jsBreadcrumb(`h0: fullTris=${twin.fullTris} hash=${twin.hash} buildMs=${twin.buildMs}`);
      console.log(`[jacobian-sizing] h0: fullTris=${twin.fullTris} hash=${twin.hash} (expect ${H0_EXPECTED})`);
      expect(twin.hash, 'H0 BYTE-IDENTITY vs banked f707898e-02e3bea1').toBe(H0_EXPECTED);
      expect(twin.fullTris, 'flag-off fullTris must match the TWIN-VALIDITY re-measurement').toBe(FLAG_OFF_FULLTRIS);
      return;
    }

    // ── c1match: instrument-match, ORIGINAL (non-J) masked floor ──
    if (STAGE === 'c1match') {
      const rA = buildRadiusFn(AF_STYLE, {}, AF_DIMS);
      const floor = buildAnalyticCurvatureFloor(
        AF_STYLE, {}, { H: AF_DIMS.H, Rt: AF_DIMS.Rt, Rb: AF_DIMS.Rb, expn: AF_DIMS.expn },
        { resU: MASKED_RES.resU, resT: MASKED_RES.resT, maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm },
      );
      if (!floor) throw new Error('buildAnalyticCurvatureFloor returned null for SpiralRidges');
      jsBreadcrumb('c1match: floor built, starting twin build');
      const twin = buildProductionTwin(floor, { resU: MASKED_RES.resU, resT: MASKED_RES.resT });
      jsBreadcrumb(`c1match: twin built fullTris=${twin.fullTris} buildMs=${twin.buildMs}`);
      row.build = { fullTris: twin.fullTris, outerTris: twin.outerTris, hash: twin.hash, buildMs: twin.buildMs };
      const audit = auditWatertight(twin.fullIdx);
      row.nonManRaw = audit.nonMan;
      row.nonManControlMoved = audit.controlMoved;
      row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      jsBreadcrumb('c1match: starting exact Newton-ALL scoring');
      const fwd = scoreForward(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, { tol: TOL, newtonAll: true });
      row.forward = fwd as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      const nAll = fwd.newtonAll!;
      jsBreadcrumb(
        `c1match RESULT: fullTris=${twin.fullTris} (expect ~${C1_MATCH.fullTris}) facetsOver=${nAll.facetsOver} ` +
          `(expect ~${C1_MATCH.facetsOver}) worst=${nAll.max.toFixed(5)} (expect ~${C1_MATCH.worst})`,
      );
      console.log(
        `[jacobian-sizing] c1match: fullTris ${twin.fullTris} vs banked ${C1_MATCH.fullTris} | ` +
          `facetsOver ${nAll.facetsOver} vs banked ${C1_MATCH.facetsOver} | worst ${nAll.max.toFixed(5)} vs banked ${C1_MATCH.worst}`,
      );
      // INSTRUMENT-MATCH gates (pre-registered noise band; this build is fully
      // deterministic — a mismatch beyond float noise means the twin/prod pipeline
      // drifted since fa7e8c48 and the J-arm's baseline is stale).
      expect(Math.abs(twin.fullTris - C1_MATCH.fullTris) / C1_MATCH.fullTris, 'c1match fullTris within 1%').toBeLessThan(0.01);
      expect(Math.abs(nAll.facetsOver - C1_MATCH.facetsOver), 'c1match facetsOver within +-10% of 2,764').toBeLessThan(0.1 * C1_MATCH.facetsOver + 5);
      expect(Math.abs(nAll.max - C1_MATCH.worst), 'c1match worst within +-0.003mm').toBeLessThan(0.003);
      expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
      return;
    }

    // ── jdesign: the J-composed floor — the mission measurement ──
    if (STAGE === 'jdesign') {
      const rA = buildRadiusFn(AF_STYLE, {}, AF_DIMS);
      const w = spiralRidgesWarpChoices();
      const baseFloor = buildAnalyticCurvatureFloor(
        AF_STYLE, {}, { H: AF_DIMS.H, Rt: AF_DIMS.Rt, Rb: AF_DIMS.Rb, expn: AF_DIMS.expn },
        { resU: MASKED_RES.resU, resT: MASKED_RES.resT, maxSagMm: AF_PROD_OPTS.maxSagMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm },
      );
      if (!baseFloor) throw new Error('buildAnalyticCurvatureFloor returned null for SpiralRidges');
      const jFloor = buildJacobianAwareFloor(baseFloor, w);
      jsBreadcrumb('jdesign: J-composed floor built, starting twin build');
      const twin = buildProductionTwin(jFloor, { resU: MASKED_RES.resU, resT: MASKED_RES.resT });
      jsBreadcrumb(`jdesign: twin built fullTris=${twin.fullTris} buildMs=${twin.buildMs}`);
      row.build = { fullTris: twin.fullTris, outerTris: twin.outerTris, hash: twin.hash, buildMs: twin.buildMs };
      const audit = auditWatertight(twin.fullIdx);
      row.nonManRaw = audit.nonMan;
      row.nonManControlMoved = audit.controlMoved;
      row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);
      appendFileSync(ROWS, JSON.stringify(row) + '\n');

      // ── TIER 1: sound radial prescreen ──
      jsBreadcrumb('jdesign: prescreen start');
      const { recs } = prescreenDetail(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, TOL);
      jsBreadcrumb(`jdesign: prescreen done survivors=${recs.length}`);

      // ── TIER 2: cheap stratified estimate (early signal, logged before the exact pass) ──
      const strat = stratifiedNewtonEstimate(recs, rA, AF_DIMS.H, TOL, { topExhaustive: 400, strata: 8, perStratum: 200 });
      row.stratified = strat as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      jsBreadcrumb(
        `jdesign STRATIFIED (early signal): estOutliers=${strat.estOutliers.toFixed(1)} newtonWorst(sampled)=${strat.newtonWorst.toFixed(5)} ` +
          `sampled=${strat.sampled}/${recs.length}`,
      );

      // ── TIER 3: exact literal Newton-ALL over every prescreen survivor — the
      // certifying acceptance basis. (Not sharded: at this style's survivor scale
      // the single-process exact pass is the same cost class the C1/c1match arms
      // already ran successfully — see prereg for why full sharding is not built.) ──
      jsBreadcrumb('jdesign: exact Newton-ALL scoring start');
      const fwd = scoreForward(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, { tol: TOL, newtonAll: true });
      row.forward = fwd as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      const nAll = fwd.newtonAll!;
      jsBreadcrumb(`jdesign: exact Newton-ALL done facetsOver=${nAll.facetsOver} max=${nAll.max.toFixed(5)}`);

      const cov = scoreCoverage(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, TOL);
      row.coverage = cov as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');

      console.log(
        `[jacobian-sizing] jdesign RESULT: fullTris ${twin.fullTris} (gate <=${BUDGET_GATE}, ${(twin.fullTris / FLAG_OFF_FULLTRIS).toFixed(3)}x) | ` +
          `stratified estOutliers=${strat.estOutliers.toFixed(1)} | exact facetsOver=${nAll.facetsOver} max=${nAll.max.toFixed(5)} | ` +
          `coverage max=${cov.max.toFixed(5)} | nonMan=${audit.nonMan} zeroArea=${row.zeroArea as number} | ` +
          `c1match baseline was facetsOver=${C1_MATCH.facetsOver} worst=${C1_MATCH.worst}`,
      );

      // ── KILL-J1 diagnostic dump (runs regardless of pass/fail — cheap relative to
      // the exact pass already paid for; worst-50 loci with local J for the verdict) ──
      if (nAll.facetsOver > 0) {
        const cls = classifyJacobianResidual(
          twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, TOL, w, jFloor, AF_PROD_OPTS.maxSagMm, 50,
        );
        writeFileSync(join(ROOT, 'jdesign_worst50.json'), JSON.stringify(cls, null, 2));
        jsBreadcrumb(`jdesign: KILL-J1 dump pointsOver=${cls.pointsOver} facetsOver=${cls.facetsOver} -> jdesign_worst50.json`);
        console.log(`[jacobian-sizing] jdesign worst-50 loci dumped -> ${join(ROOT, 'jdesign_worst50.json')}`);
      }

      // Instrument hygiene.
      expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
      expect(cov.locSelfCheckMax).toBeLessThan(1e-9);

      // ── ACCEPTANCE (pre-registered) ──
      expect(nAll.facetsOver, 'every-facet <=0.01 (Newton basis, exact)').toBe(0);
      expect(nAll.max, 'worst Newton point <= tol').toBeLessThanOrEqual(TOL);
      expect(twin.fullTris, `fullTris <= 1.5x flag-off (${BUDGET_GATE})`).toBeLessThanOrEqual(BUDGET_GATE);
      expect(cov.max, 'coverage interior max <= tol').toBeLessThanOrEqual(TOL);
      expect(audit.nonMan, 'watertight').toBe(0);
      expect(row.zeroArea, 'zeroArea').toBe(0);
      return;
    }

    if (!existsSync(ROOT)) writeFileSync(join(ROOT, '.keep'), '');
  }, 5_400_000);
});
