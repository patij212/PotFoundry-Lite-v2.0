// research/spike-raycast-oracle/scorecard.spike.test.ts
//
// Raycast-Oracle Fidelity Spike — Task 5: orchestrator.
//
// Builds each style OFF/ON at the 0.01mm verdict-refine target, scores outer
// chord-sag against the exact evalSurface lift, runs condition C (watertight/
// manifold/oriented + self-intersection-free) on the ON build, assembles a
// ScoreRow per style, and writes the scorecard + STLs. This file's "test" IS
// the measurement run — the payoff of the whole CPU-spine spike.
//
// Three deviations from task-5-brief.md (methodology pivot after the plan was
// written — see task-5-report.md for full rationale):
//
//   1. Control swap: STYLES uses '__SmoothControl__' where the brief had
//      'SuperformulaBlossom'. SuperformulaBlossom's CPU radius function
//      (src/geometry/styles.ts) ignores sf_strength — it always renders full
//      petal relief plus a theta=0 seam self-intersection — so it cannot
//      serve as a smooth control. '__SmoothControl__' is a sentinel styleId
//      (buildSolidCPU.ts) that evaluates a genuine smooth pure-r0 surface of
//      revolution on both the CPU build and (via the exported evalSurface)
//      the sag scorer's lift function.
//   2. Robustness for slow/large frontier builds: a 30-minute (1_800_000ms)
//      per-test timeout, not the brief's 10-minute one (frontier builds at
//      0.01mm with verdictRefine can take minutes each — 8 builds total);
//      console.log per-build wall-time + triangle count as each build
//      finishes; and each style's full pipeline (build OFF, build ON, score,
//      condition C) wrapped in its own try/catch so one slow/failed style
//      can't lose the other styles' rows. A failed style still pushes a row
//      (style name + error message via ScoreRow.error, other fields
//      best-effort/0) — no silent skips.
//   3. driftMaxMm stays null for every row: the GPU anchor (Phase 2 / Tasks
//      6-7) is not run in this spike, so the scorecard's drift column
//      correctly renders "pending" for all 4 styles.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StyleId } from '../../src/geometry/types';
import { buildSolidCPU, evalSurface } from './buildSolidCPU';
import { scoreOuterSag } from './sagScorer';
import { checkConditionC } from './conditionC';
import { renderScorecard, type ScoreRow } from './scorecard';

// Deviation 1: '__SmoothControl__' replaces the brief's 'SuperformulaBlossom' control.
const STYLES: (StyleId | '__SmoothControl__')[] = [
  '__SmoothControl__',
  'SpiralRidges',
  'GothicArches',
  'GyroidManifold',
];
const TOL = 0.01;
// Outputs go to the harness's own _out/ dir (untracked). This test used to write
// straight over the committed research/lab/2026-07-12-raycast-oracle-fidelity.md,
// which destroyed its curated Phase-2/findings/lever sections twice (2026-07-14
// 04:40, 2026-07-15 05:54). Curated docs are append-only by hand; harnesses must
// never own a committed lab-doc path.
const OUT_DIR = join('research', 'spike-raycast-oracle', '_out');
const OUT_MD = join(OUT_DIR, 'scorecard.md');
const STL_DIR = join(OUT_DIR, 'stl');
const CAP_NOTE =
  'cap = production VERDICT_MAX_PASS(4) @ VERDICT_TOL_MM(0.01mm). Reasoned: 4 dyadic ' +
  'passes = up to 16x local refine over the base feature cell; non-convergence past ' +
  'that indicates a topology limit (chord-across-feature), i.e. a remesher signal, not ' +
  'insufficient density. Not silently truncated — per-style convergence recorded below.';

const emptyConditionC = (): ScoreRow['conditionC'] => ({
  ok: false, boundaryEdges: 0, nonManifoldEdges: 0,
  orientationMismatches: 0, selfIntersections: 0, stlPath: '',
});

describe('raycast-oracle fidelity scorecard', () => {
  // Gated: this is a ~30-minute measurement run with file side effects, not a
  // regression test — it must not ride along in a default `npm test`.
  it.skipIf(!process.env.PF_RAYCAST_SPIKE)('scores 4 styles and writes the scorecard + STLs', () => {
    const rows: ScoreRow[] = [];
    const suiteStart = Date.now();

    for (const style of STYLES) {
      // Deviation 2c: seed a best-effort row up front so a mid-pipeline throw
      // still yields a row with whatever completed, plus the error message.
      const row: ScoreRow = {
        style,
        featureKinds: {},
        sagOffMm: 0, overTolOff: 0,
        sagOnMm: 0, overTolOn: 0,
        verdictRan: false,
        trisOff: 0, trisOn: 0,
        worstOn: null,
        conditionC: emptyConditionC(),
        driftMaxMm: null, // Deviation 3: GPU anchor is Phase 2 — not run here.
      };

      try {
        const t0 = Date.now();
        const off = buildSolidCPU(style, { maxSagMm: TOL, verdictRefine: false });
        const offMs = Date.now() - t0;
        row.trisOff = off.indices.length / 3;
        console.log(`[${style}] OFF build: ${(offMs / 1000).toFixed(1)}s, ${row.trisOff} tris`);

        const t1 = Date.now();
        const on = buildSolidCPU(style, { maxSagMm: TOL, verdictRefine: true });
        const onMs = Date.now() - t1;
        row.trisOn = on.indices.length / 3;
        row.verdictRan = on.verdictRan;
        row.featureKinds = on.featureKinds;
        console.log(
          `[${style}] ON build: ${(onMs / 1000).toFixed(1)}s, ${row.trisOn} tris, verdictRan=${on.verdictRan}`,
        );

        const lift = (u: number, t: number) => evalSurface(style, u, t, 0);

        const sagOff = scoreOuterSag(off, lift, TOL);
        row.sagOffMm = sagOff.maxSagMm;
        row.overTolOff = sagOff.overTolCount;

        const sagOn = scoreOuterSag(on, lift, TOL);
        row.sagOnMm = sagOn.maxSagMm;
        row.overTolOn = sagOn.overTolCount;
        row.worstOn = sagOn.worst;
        console.log(
          `[${style}] sag OFF=${sagOff.maxSagMm.toFixed(5)}mm (>tol ${sagOff.overTolCount}) ` +
          `ON=${sagOn.maxSagMm.toFixed(5)}mm (>tol ${sagOn.overTolCount})`,
        );

        const c = checkConditionC(on, style, STL_DIR);
        row.conditionC = {
          ok: c.ok, boundaryEdges: c.boundaryEdges, nonManifoldEdges: c.nonManifoldEdges,
          orientationMismatches: c.orientationMismatches, selfIntersections: c.selfIntersections,
          stlPath: c.stlPath,
        };
        console.log(
          `[${style}] conditionC ok=${c.ok} bnd=${c.boundaryEdges} nonMan=${c.nonManifoldEdges} ` +
          `orient=${c.orientationMismatches} selfX=${c.selfIntersections}`,
        );
      } catch (err) {
        // Deviation 2c: record the failure honestly and continue — one bad
        // style must not cost the run the other styles' results.
        const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
        row.error = msg;
        console.log(`[${style}] FAILED: ${msg}`);
      }

      rows.push(row);
    }

    console.log(
      `[TOTAL] wall-time: ${((Date.now() - suiteStart) / 1000).toFixed(1)}s across ${STYLES.length} styles`,
    );

    // Write artifacts BEFORE the assertions below so a failing sanity check
    // never costs us the scorecard/STLs already produced.
    const md = renderScorecard(rows, CAP_NOTE);
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_MD, md);

    expect(rows.length).toBe(4);
    expect(md.length).toBeGreaterThan(200);

    // Sanity anchor: '__SmoothControl__' MUST come out clean. If it doesn't,
    // the harness itself (not a frontier style) has regressed — this must
    // fail loudly, not get buried in a passing suite.
    const control = rows.find((r) => r.style === '__SmoothControl__');
    expect(control, '__SmoothControl__ row must exist').toBeTruthy();
    if (control) {
      console.log(
        `[SANITY __SmoothControl__] overTolOn=${control.overTolOn} conditionC.ok=${control.conditionC.ok} ` +
        `selfIntersections=${control.conditionC.selfIntersections} sagOnMm=${control.sagOnMm.toFixed(5)} ` +
        `error=${control.error ?? 'none'}`,
      );
      expect(control.overTolOn, '__SmoothControl__ overTolOn must be 0').toBe(0);
      expect(control.conditionC.ok, '__SmoothControl__ conditionC.ok must be true').toBe(true);
      expect(control.conditionC.selfIntersections, '__SmoothControl__ selfIntersections must be 0').toBe(0);
      expect(control.sagOnMm, '__SmoothControl__ sagOnMm should be small (~0.005mm)').toBeLessThan(0.01);
    }
  }, 1_800_000);
});
