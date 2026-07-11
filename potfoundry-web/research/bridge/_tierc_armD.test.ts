// _tierc_armD.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm D (smooth control) SCORED RUN.
//
// PART 2 of the region-layer BUILD arm: FourierBloom through the NEW region layer
// (research/bridge/tierc_regionLayer.ts's buildRegionOuterWall) at the prereg's pinned dims
// (H120/Rt50/Rb40/expn1/spin0, DEFAULT style params), scored with the composite gates harness
// (tierc_gatesHarness.ts's scoreAllGates) at PRODUCTION defaults (no g2Lattice/g1Brute overrides,
// prescreen on, stride 1 — FourierBloom is the SHIPPED-CLEAN control so stride 1 is cheap: its own
// prescreen45 should survivor-starve almost immediately).
//
// Arm D is the orchestration layer's NULL CASE (architecture-v1.md §5): one R-CDT region, zero
// curves, zero pins, standard assembly — "PASS = every gate green at tol; outer tris within ±5% of
// production; quality distribution not worse than production's on p5MinAngle/%<20°; G7 full-pot. FAIL
// here kills the orchestration layer itself... nothing else runs until D passes"
// (E-2026-07-11-TIERC-HEADTOHEAD-prereg.md). Per ADDENDUM 1, this runs ENTIRELY RESEARCH-SIDE (no
// src/ edit, no dev flag) — the region layer drives assembleWatertight directly, the same
// twin-injection seam _gyroid_prodclose_lib.ts/_gyroid_bandedge_lib.ts and _tierc_b0_toy_lib.ts use.
//
// This file follows tierc_gatesBench.test.ts's OWN reporting convention exactly (that file is the
// origin of the banked FourierBloom row this arm compares against — see BASELINE_* below): only the
// INSTRUMENT non-vacuity witnesses are `expect()`-asserted (nonManControlMoved / locatorSelfCheckMaxMm
// — "a row without them is VOID", prereg "Common configuration"); the SUBSTANTIVE Arm-D verdict
// (outliers/coverage/watertight/quality/tri-budget) is COMPUTED and LOGGED, never asserted — per the
// mission's explicit rule: "do NOT tune anything to pass; Arm D failing is a first-class finding about
// the orchestration layer," not a test-code bug to chase away with `expect()`.
//
// Env-gated: PF_TIERC_ARMD=1 to run; unset (the default) is a no-op — matches PF_TIERC_BENCH /
// PF_PROD_TRUTH convention, so `npm test`/CI never pays this probe's cost.
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_ARMD=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_armD.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall, toHarnessManifest } from './tierc_regionLayer';
import { scoreAllGates, type StyleTruth } from './tierc_gatesHarness';

const ON = process.env.PF_TIERC_ARMD === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const OUT = join(OUT_DIR, 'gates.ndjson');
const CRUMB_PATH = join(OUT_DIR, 'armD_crumbs.ndjson');
// Mission budget: "Budget up to 30 min for the build." Scoring (prescreen + interior + coverage) is
// additional on top — generous backstop only, mirrors vitest.tierc_bench.config.ts's own philosophy
// ("this in-process ceiling should never actually fire" — liveness is watched via the crumb file).
const ARMD_TIMEOUT_MS = 45 * 60 * 1000;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({
        arm: 'D',
        style: 'FourierBloom',
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

/** The fork child's ACTUAL V8 heap limit (MB) — verifies NODE_OPTIONS propagated (mirrors
 *  _gyroid_prodclose_lib.ts's gpcHeapLimitMB). */
function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

// research/exchange/_prod_truth/FourierBloom/meta.json (the captured production artifact this arm
// compares against — read directly, not paraphrased).
const BASELINE_OUTER_TRIS = 1_278_510;
const BASELINE_FULL_TRIS = 3_143_106;
const OUTER_TOL_FRAC = 0.05;

// research/exchange/tierc/gates.ndjson's banked "bench-FourierBloom-*" row (tierc_gatesBench.test.ts,
// v1.0 harness basis — this arm's own row will carry v1.1's additive " stride=1"/scannedFacets fields;
// semantics are UNCHANGED at stride=1 per tierc_gatesHarness.ts's own header note, so the comparison is
// apples-to-apples on values even though the `basis` STRING differs — the "basis-label migration" the
// mission flags).
const BASELINE_QUALITY = {
  p5MinAngleDeg: 7,
  pctBelow20: 16.7,
  pctBelow10: 9.6,
  maxAspect3D: 84.70455060723779,
  sliverCount: 0,
  degenerateCount: 0,
  needleCount: 0,
};

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm D — FourierBloom smooth control (scored)', () => {
  it(
    'buildRegionOuterWall -> scoreAllGates at production defaults',
    () => {
      crumb('start', { heapLimitMB: heapLimitMB() });

      const manifest = getManifest('FourierBloom');
      const t0 = Date.now();
      const result = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
      const buildMs = Date.now() - t0;
      crumb('build-done', {
        buildMs,
        dispatch: result.meta.dispatch,
        outerTris: result.outer.idx.length / 3,
        fullTris: result.full ? result.full.idx.length / 3 : null,
        uBias: result.meta.uBias,
        hash: result.meta.hash,
        warnings: result.meta.warnings,
      });
      console.log(
        `[armD] build DONE in ${(buildMs / 1000).toFixed(1)}s: outer=${result.outer.idx.length / 3} ` +
          `full=${result.full ? result.full.idx.length / 3 : 'MISSING'} tris, uBias=${result.meta.uBias}, ` +
          `warnings=${JSON.stringify(result.meta.warnings)}`,
      );
      if (!result.full) {
        throw new Error(
          'Arm D requires a full-pot BinMesh (single-R-CDT dispatch always returns one) — got none; ' +
            'this is itself an orchestration-layer finding, not expected for a single R-CDT region.',
        );
      }

      const styleTruth: StyleTruth = {
        styleId: manifest.styleId,
        rA: manifest.truth.rA,
        H: TIERC_COMMON_DIMS.H,
        Rb: TIERC_COMMON_DIMS.Rb,
        Rt: TIERC_COMMON_DIMS.Rt,
        expn: TIERC_COMMON_DIMS.expn,
      };
      const manifestRow = toHarnessManifest(manifest);

      crumb('score-start');
      const tScore0 = Date.now();
      // Deliberately NO g2Lattice/g1Brute/stride overrides — production defaults (prereg mission:
      // "production defaults: NO g2Lattice/g1Brute overrides, prescreen on, stride 1"; scoreAllGates's
      // own defaults ALREADY are prescreen:true / stride:1 — tolMm is stated explicitly for
      // self-documentation even though 0.01 is also the default).
      const row = scoreAllGates(
        { full: result.full, outer: result.outer },
        styleTruth,
        manifestRow,
        {
          tolMm: 0.01,
          breadcrumbPath: CRUMB_PATH,
          outputPath: OUT,
          runId: `armD-FourierBloom-${Date.now()}`,
        },
      );
      const scoreMs = Date.now() - tScore0;
      crumb('score-done', { scoreMs, totalMs: row.totalMs });

      console.log(
        `[armD] score DONE in ${(scoreMs / 1000).toFixed(1)}s: g1 survivors=${row.g1_forward.survivors} ` +
          `outliers=${row.g1_forward.outliers} maxMm=${row.g1_forward.maxMm} | ` +
          `g2 coverageMax=${row.g2_reverse.maxMm ?? 'n/a'} | ` +
          `g3 nonMan=${row.g3_watertight.nonManRaw ?? 'n/a'} orientMismatch=${row.g3_watertight.orientationMismatches ?? 'n/a'} | ` +
          `g4 zeroArea=${row.g4_zeroDefect.zeroAreaCount ?? 'n/a'} degen=${row.g4_zeroDefect.degenerateCount ?? 'n/a'} | ` +
          `g7 boundaryEdges=${row.g7_assembly.wholeMeshBoundaryEdges ?? 'n/a'} | ` +
          `quality p5MinAngle=${row.quality.p5MinAngleDeg} pctBelow20=${row.quality.pctBelow20}`,
      );

      // ── Instrument non-vacuity witnesses — MANDATORY per the prereg ("a row without them is VOID").
      // Asserted (unlike the substantive Arm-D verdict below): these are HYGIENE checks on the harness
      // itself, not on FourierBloom's mesh quality — a failure here means the MEASUREMENT is untrustworthy,
      // not that the arm failed. Mirrors tierc_gatesBench.test.ts:165-167 exactly.
      expect(row.g3_watertight.nonManControlMoved).toBe(true);
      expect(row.g2_reverse.locatorSelfCheckMaxMm).not.toBeNull();
      expect(row.g2_reverse.locatorSelfCheckMaxMm as number).toBeLessThan(1e-9);

      // ── VERDICT (computed + logged; NEVER used to fail this test — see file header) ──────────────
      const outerTris = row.g1_forward.nFacets;
      const fullTris = row.g6_budget.triangleCount;
      const outerDeltaFrac = (outerTris - BASELINE_OUTER_TRIS) / BASELINE_OUTER_TRIS;
      const outerWithinTol = Math.abs(outerDeltaFrac) <= OUTER_TOL_FRAC;
      const fullDeltaFrac = (fullTris - BASELINE_FULL_TRIS) / BASELINE_FULL_TRIS;

      const gates = {
        g1_outliers0: row.g1_forward.outliers === 0,
        g2_maxLeTol: (row.g2_reverse.maxMm ?? Infinity) <= 0.01,
        g3_nonMan0: row.g3_watertight.nonManRaw === 0,
        g3_orientationClean: row.g3_watertight.orientationMismatches === 0,
        g4_zeroAreaZero: row.g4_zeroDefect.zeroAreaCount === 0,
        g4_degenerateZero: row.g4_zeroDefect.degenerateCount === 0,
        g7_fullPotClosed: row.g7_assembly.wholeMeshBoundaryEdges === 0,
      };
      const quality = {
        p5MinAngleNotWorse: row.quality.p5MinAngleDeg >= BASELINE_QUALITY.p5MinAngleDeg,
        pctBelow20NotWorse: row.quality.pctBelow20 <= BASELINE_QUALITY.pctBelow20,
      };

      const allGatesGreen = Object.values(gates).every(Boolean);
      const qualityOk = Object.values(quality).every(Boolean);
      const verdict = allGatesGreen && outerWithinTol && qualityOk ? 'PASS' : 'FAIL';

      const summary = {
        verdict,
        allGatesGreen,
        gates,
        outer: { tris: outerTris, baseline: BASELINE_OUTER_TRIS, deltaFrac: outerDeltaFrac, withinTol: outerWithinTol },
        full: { tris: fullTris, baseline: BASELINE_FULL_TRIS, deltaFrac: fullDeltaFrac },
        qualityOk,
        quality,
        qualityNumbers: { row: row.quality, baseline: BASELINE_QUALITY },
        wallTimes: { buildMs, scoreMs, totalMs: row.totalMs },
        uBias: result.meta.uBias,
        dispatchWarnings: result.meta.warnings,
      };
      crumb('verdict', summary);
      // eslint-disable-next-line no-console
      console.log(`[armD] VERDICT=${verdict}\n${JSON.stringify(summary, null, 2)}`);
    },
    ARMD_TIMEOUT_MS,
  );
});
