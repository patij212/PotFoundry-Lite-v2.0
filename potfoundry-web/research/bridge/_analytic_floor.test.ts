// E-2026-07-09-ANALYTIC-FLOOR — probe (pre-registered; see EXPERIMENT-REGISTRY.md).
// Stages (PF_AF_STAGE):
//   twin — flag-OFF production twin: build + pilot-basis scoring. FIRST run banks the
//          baseline (incl. the byte-identity hash H0, PRE-src-edit); every LATER run
//          asserts the rebuilt flag-OFF hash equals H0 EXACTLY (the pre-registered
//          BYTE-IDENTITY kill: the wiring must be provably inert with the flag off).
//          TWIN-VALIDITY gates vs the captured artifact are asserted on every run.
//   on   — flag-ON arm: analytic floor injected on the OUTER wall; ACCEPTANCE gates
//          (every-flagged-point Newton <= tol; fullTris <= 1.5x banked; coverage
//          interior max <= tol; watertight+zeroArea) asserted AFTER the row is
//          checkpointed (rows survive a timeout verdict — pilot lesson).
// Run: PF_ANALYTIC_FLOOR=1 [PF_AF_STAGE=twin|on] npx vitest run --config vitest.analytic_floor.config.ts
// DEV-ONLY. src/ never imports research/. Artifacts gitignored; numbers inlined in the registry.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import {
  AF_DIMS,
  AF_PROD_OPTS,
  AF_STYLE,
  auditWatertight,
  buildMiniAssemblyHash,
  buildProductionTwin,
  buildWallGridCPU,
  floorGridStats,
  maskedWallDiag,
  scoreCoverage,
  scoreForward,
  wallsDiag,
  zeroAreaCount,
  type FloorSpec,
} from './_analytic_floor_lib';
import { buildAnalyticCurvatureFloor } from '../../src/renderers/webgpu/parametric/conforming/AnalyticCurvatureFloor';

const ON = process.env.PF_ANALYTIC_FLOOR === '1';
const STAGE = ((): 'on' | 'walls' | 'orient-mini' | 'lever-cs2' | 'lever-res256' | 'masked' | 'masked-diag' | 'twin' => {
  const s = process.env.PF_AF_STAGE;
  return s === 'on' ||
    s === 'walls' ||
    s === 'orient-mini' ||
    s === 'lever-cs2' ||
    s === 'lever-res256' ||
    s === 'masked' ||
    s === 'masked-diag'
    ? s
    : 'twin';
})();

// E-2026-07-10-ANALYTIC-FLOOR-MASKED config ladder (pre-registered; C1b/C2 only per gates).
const MASKED_RES = { resU: Number(process.env.PF_AF_MASKED_RESU ?? 512), resT: 128 };
// Blanket-arm banked point for the 3-point curve (E-2026-07-09-ANALYTIC-FLOOR flag-ON).
const BLANKET = { fullTris: 11_004_336, newtonAllMax: 0.009985, coverageMax: 0.00877 };
const TOL = 0.01;
const ROOT = join('research', 'exchange', '_analytic_floor');
const BASELINE = join(ROOT, 'twin_baseline.json');
const ROWS = join(ROOT, 'rows.ndjson');

// Captured production artifact (research/exchange/_prod_truth/SpiralRidges, 2026-07-09)
// — the pre-registered TWIN-VALIDITY anchors.
const CAP = {
  fullTris: 5_686_826,
  outerTris: 2_680_400,
  outliers: 3_145,
  gridMax: 0.035753,
  newtonWorst: 0.023884,
  coverageMax: 0.035294,
};

interface Baseline {
  hash: string;
  fullTris: number;
  outerTris: number;
  outliers: number;
  gridMax: number;
  newtonWorst: number;
  coverageMax: number;
  at: string;
}

describe('E-2026-07-09-ANALYTIC-FLOOR — production twin, flag-off/flag-on', () => {
  it.skipIf(!ON)(`${AF_STYLE}: stage=${STAGE}`, () => {
    mkdirSync(ROOT, { recursive: true });
    const rA = buildRadiusFn(AF_STYLE, {}, AF_DIMS);
    const row: Record<string, unknown> = { stage: STAGE, at: new Date().toISOString(), tol: TOL };

    if (STAGE === 'orient-mini') {
      // Byte-identity gate for internal WatertightAssembly refactors: run once
      // BEFORE the refactor (banks the mini hash), and after (must match).
      const mini = buildMiniAssemblyHash();
      const miniPath = join(ROOT, 'orient_mini_baseline.json');
      Object.assign(row, mini);
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      console.log(`[analytic-floor] orient-mini: hash=${mini.hash} tris=${mini.tris} verts=${mini.verts}`);
      if (existsSync(miniPath)) {
        const banked = JSON.parse(readFileSync(miniPath, 'utf8')) as { hash: string; tris: number };
        expect(mini.hash, 'mini-assembly BYTE-IDENTITY vs banked').toBe(banked.hash);
        expect(mini.tris).toBe(banked.tris);
        console.log(`[analytic-floor] orient-mini BYTE-IDENTITY OK vs ${banked.hash}`);
      } else {
        writeFileSync(miniPath, JSON.stringify(mini, null, 2));
        console.log('[analytic-floor] orient-mini baseline BANKED');
      }
      return;
    }

    if (STAGE === 'masked-diag') {
      // Build-phase localizer for the C1 grind (tractability clause: the first C1
      // attempt was stopped at ~125min wall / 58 CPU-min with a 0.16GB working set
      // — a pre-triangulation loop). Times floored field + plain quadtree in
      // isolation, then the FULL outer wall; live marks in progress.log.
      const dFloor = buildAnalyticCurvatureFloor(
        AF_STYLE,
        {},
        { H: AF_DIMS.H, Rt: AF_DIMS.Rt, Rb: AF_DIMS.Rb, expn: AF_DIMS.expn },
        {
          resU: MASKED_RES.resU,
          resT: MASKED_RES.resT,
          maxSagMm: AF_PROD_OPTS.maxSagMm,
          minEdgeMm: AF_PROD_OPTS.minEdgeMm,
        },
      );
      if (!dFloor) throw new Error('null floor');
      const diag = maskedWallDiag(MASKED_RES.resU, MASKED_RES.resT, dFloor);
      Object.assign(row, { maskedRes: MASKED_RES }, diag);
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      console.log(`[analytic-floor] masked-diag:\n${JSON.stringify(diag, null, 2)}`);
      return;
    }

    if (STAGE === 'masked') {
      // E-2026-07-10-ANALYTIC-FLOOR-MASKED — C1 (or PF_AF_MASKED_RESU override for the
      // pre-authorized C2=1024): the SAME analytic floor evaluated on a FINER sizing
      // lattice, bundled with the matching field res (res-only is ANTI-helpful:
      // lever-res256 measured −7.5% tris / +142% outliers). Acceptance asserted
      // AFTER the row checkpoint.
      expect(existsSync(BASELINE), 'twin baseline must exist before the masked arm').toBe(true);
      const banked = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
      row.maskedRes = MASKED_RES;
      const mFloor = buildAnalyticCurvatureFloor(
        AF_STYLE,
        {},
        { H: AF_DIMS.H, Rt: AF_DIMS.Rt, Rb: AF_DIMS.Rb, expn: AF_DIMS.expn },
        {
          resU: MASKED_RES.resU,
          resT: MASKED_RES.resT,
          maxSagMm: AF_PROD_OPTS.maxSagMm,
          minEdgeMm: AF_PROD_OPTS.minEdgeMm,
        },
      );
      if (!mFloor) throw new Error('buildAnalyticCurvatureFloor returned null for SpiralRidges');
      row.maxKappa = mFloor.maxKappa;
      // Pre-registered early tell: lifted-node fraction on the C1 lattice.
      const statsSampler = buildWallGridCPU(rA, 0);
      const fStats = floorGridStats(
        mFloor,
        statsSampler.sampler,
        MASKED_RES.resU,
        MASKED_RES.resT,
        AF_PROD_OPTS.maxSagMm,
        AF_PROD_OPTS.maxEdgeMm,
      );
      row.floorGrid = fStats as unknown as Record<string, unknown>;
      console.log(
        `[analytic-floor] masked: floorGrid liftedFrac=${fStats.liftedFrac.toFixed(3)} ` +
          `effectiveFrac=${fStats.liftedEffectiveFrac.toFixed(3)} floorMax=${fStats.floorMax.toFixed(3)} ` +
          `(pre-reg: ~0.15-0.35 expected; >=0.6 predicts KILL-B)`,
      );

      const twin = buildProductionTwin(mFloor, { resU: MASKED_RES.resU, resT: MASKED_RES.resT });
      row.build = {
        fullTris: twin.fullTris,
        outerTris: twin.outerTris,
        hash: twin.hash,
        buildMs: twin.buildMs,
      };
      const audit = auditWatertight(twin.fullIdx);
      row.nonManRaw = audit.nonMan;
      row.nonManControlMoved = audit.controlMoved;
      row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);
      const fwd = scoreForward(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, {
        tol: TOL,
        newtonAll: true,
      });
      row.forward = fwd as unknown as Record<string, unknown>;
      const cov = scoreCoverage(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, TOL);
      row.coverage = cov as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');

      // CONFOUND RULE (pre-registered): shared field res also touches the INNER wall.
      const innerPlusCaps = twin.fullTris - twin.outerTris;
      const innerPlusCapsBase = banked.fullTris - banked.outerTris;
      const innerDrift = (innerPlusCaps - innerPlusCapsBase) / innerPlusCapsBase;
      const ratio = twin.fullTris / banked.fullTris;
      const nAll = fwd.newtonAll;
      console.log(
        `[analytic-floor] masked C1(${MASKED_RES.resU}x${MASKED_RES.resT}): ` +
          `fullTris ${banked.fullTris} -> ${twin.fullTris} (${ratio.toFixed(3)}x; gate <=1.5x=${Math.floor(1.5 * banked.fullTris)}) | ` +
          `outer ${banked.outerTris} -> ${twin.outerTris} | inner+caps drift ${(innerDrift * 100).toFixed(1)}% | ` +
          `newtonALL pts=${nAll?.pointsScored} over=${nAll?.pointsOver} facetsOver=${nAll?.facetsOver} max=${nAll?.max.toFixed(4)} | ` +
          `coverage max=${cov.max.toFixed(4)} (blanket ${BLANKET.coverageMax}) | ` +
          `3-point curve: {${banked.fullTris} => 3140 over/0.0239} -> {${BLANKET.fullTris} blanket => 0 over/${BLANKET.newtonAllMax}} -> {${twin.fullTris} masked => ${nAll?.facetsOver} facetsOver/${nAll?.max.toFixed(4)}}`,
      );

      // Instrument hygiene.
      expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
      expect(cov.locSelfCheckMax).toBeLessThan(1e-9);
      if (Math.abs(innerDrift) > 0.1) {
        console.log('[analytic-floor] masked: |inner drift| > 10% — walls-diag split REQUIRED before any KILL-B claim (pre-registered confound rule)');
      }
      // ── ACCEPTANCE (pre-registered) ──
      expect(fwd.newtonAll, 'masked arm must run the every-point Newton basis').toBeDefined();
      const nA = fwd.newtonAll as NonNullable<typeof fwd.newtonAll>;
      expect(nA.facetsOver, 'every-facet <=0.01 (Newton basis)').toBe(0);
      expect(nA.max, 'worst Newton point <= tol').toBeLessThanOrEqual(TOL);
      expect(twin.fullTris, 'fullTris <= 1.5x flag-off (KILL-B)').toBeLessThanOrEqual(1.5 * banked.fullTris);
      expect(cov.max, 'coverage interior max <= tol').toBeLessThanOrEqual(TOL);
      expect(cov.max, 'coverage must not exceed the flag-off baseline').toBeLessThanOrEqual(banked.coverageMax);
      expect(audit.nonMan, 'watertight (masked)').toBe(0);
      expect(row.zeroArea, 'zeroArea (masked)').toBe(0);
      return;
    }

    if (STAGE === 'lever-cs2' || STAGE === 'lever-res256') {
      // E-2026-07-10-CAD-LEVER-COMPLETION Stage B — REPORT-shaped A/B vs the banked
      // flag-off baseline (pre-committed NO-DEFAULT-FLIP: these arms never change
      // production defaults; they price the restored levers). Hygiene asserts only.
      expect(existsSync(BASELINE), 'twin baseline must exist before lever arms').toBe(true);
      const banked = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
      const overrides =
        STAGE === 'lever-cs2' ? { cellSamples: 2 } : { resU: 256, resT: 256 };
      row.overrides = overrides;
      const twin = buildProductionTwin(undefined, overrides);
      row.build = {
        fullTris: twin.fullTris,
        outerTris: twin.outerTris,
        hash: twin.hash,
        buildMs: twin.buildMs,
      };
      const audit = auditWatertight(twin.fullIdx);
      row.nonManRaw = audit.nonMan;
      row.nonManControlMoved = audit.controlMoved;
      row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);
      const fwd = scoreForward(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, {
        tol: TOL,
        newtonAll: false,
      });
      row.forward = fwd as unknown as Record<string, unknown>;
      const cov = scoreCoverage(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, TOL);
      row.coverage = cov as unknown as Record<string, unknown>;
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      const dTris = ((twin.fullTris - banked.fullTris) / banked.fullTris) * 100;
      const dOut = banked.outliers > 0 ? ((banked.outliers - fwd.outliers) / banked.outliers) * 100 : 0;
      console.log(
        `[analytic-floor] ${STAGE}: fullTris ${banked.fullTris} -> ${twin.fullTris} (${dTris >= 0 ? '+' : ''}${dTris.toFixed(2)}%) | ` +
          `outliers ${banked.outliers} -> ${fwd.outliers} (-${dOut.toFixed(1)}%) | ` +
          `gridMax ${banked.gridMax.toFixed(4)} -> ${fwd.gridMax.toFixed(4)} | newtonWorst ${banked.newtonWorst.toFixed(4)} -> ${fwd.newtonWorst.toFixed(4)} | ` +
          `coverage ${banked.coverageMax.toFixed(4)} -> ${cov.max.toFixed(4)} | nonMan=${audit.nonMan} zeroArea=${row.zeroArea as number}`,
      );
      expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
      expect(cov.locSelfCheckMax).toBeLessThan(1e-9);
      return;
    }

    if (STAGE === 'walls') {
      // Twin-divergence localizer (no caps / no orientOutward): per-wall counts +
      // uBias A/B leaves vs the captured artifact. Report-only.
      const diag = wallsDiag();
      Object.assign(row, diag);
      appendFileSync(ROWS, JSON.stringify(row) + '\n');
      console.log(`[analytic-floor] walls diag:\n${JSON.stringify(diag, null, 2)}`);
      return;
    }

    let floor: FloorSpec | null = null;
    if (STAGE === 'on') {
      floor = buildAnalyticCurvatureFloor(
        AF_STYLE,
        {},
        { H: AF_DIMS.H, Rt: AF_DIMS.Rt, Rb: AF_DIMS.Rb, expn: AF_DIMS.expn },
        {
          resU: AF_PROD_OPTS.resU,
          resT: AF_PROD_OPTS.resT,
          maxSagMm: AF_PROD_OPTS.maxSagMm,
          minEdgeMm: AF_PROD_OPTS.minEdgeMm,
        },
      );
      if (!floor) throw new Error('buildAnalyticCurvatureFloor returned null for SpiralRidges');
      row.maxKappa = floor.maxKappa;
    }

    const twin = buildProductionTwin(floor ?? undefined);
    row.build = {
      fullTris: twin.fullTris,
      outerTris: twin.outerTris,
      fullVerts: twin.fullVerts,
      outerVerts: twin.outerVerts,
      hash: twin.hash,
      helix: twin.helix,
      generalCurves: twin.generalCurveCount,
      creaseLines: twin.creaseLineCount,
      buildMs: twin.buildMs,
    };
    console.log(
      `[analytic-floor] ${STAGE}: built full=${twin.fullTris} outer=${twin.outerTris} tris ` +
        `hash=${twin.hash} helix(k=${twin.helix.k}, turns=${twin.helix.turns.toFixed(4)}, L=${twin.helix.level}) ` +
        `in ${(twin.buildMs / 1000).toFixed(0)}s`,
    );

    // Watertight + zeroArea on the FULL twin assembly (both arms — refinement must not crack the pot).
    const audit = auditWatertight(twin.fullIdx);
    row.nonManRaw = audit.nonMan;
    row.nonManControlMoved = audit.controlMoved;
    row.zeroArea = zeroAreaCount(twin.outerXyz, twin.outerIdx);

    const fwd = scoreForward(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, {
      tol: TOL,
      newtonAll: STAGE === 'on',
    });
    row.forward = fwd as unknown as Record<string, unknown>;
    const cov = scoreCoverage(twin.outerXyz, twin.outerIdx, rA, AF_DIMS.H, TOL);
    row.coverage = cov as unknown as Record<string, unknown>;
    console.log(
      `[analytic-floor] ${STAGE}: forward out=${fwd.outliers} gridMax=${fwd.gridMax.toFixed(4)} ` +
        `newtonWorst=${fwd.newtonWorst.toFixed(4)}` +
        (fwd.newtonAll
          ? ` | newtonALL pts=${fwd.newtonAll.pointsScored} over=${fwd.newtonAll.pointsOver} facetsOver=${fwd.newtonAll.facetsOver} max=${fwd.newtonAll.max.toFixed(4)}`
          : '') +
        ` | coverage max=${cov.max.toFixed(4)} p99=${cov.p99.toFixed(4)} | vtxOnSurf p99=${fwd.vertexOnSurf.p99.toExponential(2)}`,
    );

    // Checkpoint the row BEFORE any assert (data survives a failing verdict).
    appendFileSync(ROWS, JSON.stringify(row) + '\n');

    // Instrument hygiene (both stages).
    expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
    expect(cov.locSelfCheckMax).toBeLessThan(1e-9);

    if (STAGE === 'twin') {
      // ── TWIN-VALIDITY gates (pre-registered) ──
      expect(Math.abs(twin.fullTris - CAP.fullTris) / CAP.fullTris, 'fullTris ±3%').toBeLessThan(0.03);
      expect(Math.abs(twin.outerTris - CAP.outerTris) / CAP.outerTris, 'outerTris ±3%').toBeLessThan(0.03);
      expect(fwd.outliers, 'outliers lower band').toBeGreaterThanOrEqual(2200);
      expect(fwd.outliers, 'outliers upper band').toBeLessThanOrEqual(4100);
      expect(Math.abs(fwd.gridMax - CAP.gridMax), 'gridMax ±0.006').toBeLessThan(0.006);
      expect(Math.abs(fwd.newtonWorst - CAP.newtonWorst), 'newtonWorst ±0.005').toBeLessThan(0.005);
      expect(Math.abs(cov.max - CAP.coverageMax), 'coverage max ±0.010').toBeLessThan(0.010);
      expect(audit.nonMan, 'watertight').toBe(0);
      expect(row.zeroArea, 'zeroArea').toBe(0);

      if (existsSync(BASELINE)) {
        // ── BYTE-IDENTITY gate: post-edit flag-OFF must reproduce banked H0 EXACTLY ──
        const banked = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
        expect(twin.hash, 'BYTE-IDENTITY vs banked H0').toBe(banked.hash);
        expect(twin.fullTris).toBe(banked.fullTris);
        console.log(`[analytic-floor] BYTE-IDENTITY OK vs H0=${banked.hash} (banked ${banked.at})`);
      } else {
        const baseline: Baseline = {
          hash: twin.hash,
          fullTris: twin.fullTris,
          outerTris: twin.outerTris,
          outliers: fwd.outliers,
          gridMax: fwd.gridMax,
          newtonWorst: fwd.newtonWorst,
          coverageMax: cov.max,
          at: new Date().toISOString(),
        };
        writeFileSync(BASELINE, JSON.stringify(baseline, null, 2));
        console.log(`[analytic-floor] baseline BANKED: H0=${baseline.hash}`);
      }
    } else {
      // ── ACCEPTANCE gates (pre-registered) ──
      expect(existsSync(BASELINE), 'twin baseline must exist before the flag-on arm').toBe(true);
      const banked = JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
      expect(fwd.newtonAll, 'flag-on arm must run the every-point Newton basis').toBeDefined();
      const nAll = fwd.newtonAll as NonNullable<typeof fwd.newtonAll>;
      // (a) every dense-45-flagged point Newton-re-scored <= tol (EXACT population).
      expect(nAll.facetsOver, 'every-facet <=0.01 (Newton basis)').toBe(0);
      expect(nAll.max, 'worst Newton point <= tol').toBeLessThanOrEqual(TOL);
      // (b) full-pot budget <= 1.5x the flag-off twin.
      expect(twin.fullTris, 'fullTris <= 1.5x flag-off').toBeLessThanOrEqual(1.5 * banked.fullTris);
      // (d) coverage interior co-gate + KILL-3 (regression vs twin baseline).
      expect(cov.max, 'coverage interior max <= tol').toBeLessThanOrEqual(TOL);
      expect(cov.max, 'KILL-3: coverage must not regress past the twin baseline').toBeLessThanOrEqual(banked.coverageMax);
      // Watertight + zeroArea must hold under refinement.
      expect(audit.nonMan, 'watertight (flag-on)').toBe(0);
      expect(row.zeroArea, 'zeroArea (flag-on)').toBe(0);
    }
  }, 5_400_000);
});
