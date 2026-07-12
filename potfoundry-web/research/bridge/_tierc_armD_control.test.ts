// _tierc_armD_control.test.ts — PROD-TIERC region-layer-core plan, task A-3 (Arm D control:
// FourierBloom null case, runs FIRST). Spec: task-A3-brief.md (authoritative) /
// docs/superpowers/plans/2026-07-12-region-layer-core.md §A-3. Research-side ONLY — no src/ edit,
// no dev flag. Uses the A-2 gates-harness runner call shape (research/bridge/_tierc_a2_gatesrunner.test.ts,
// committed b2ca8562): `buildRegionOuterWall(getManifest('FourierBloom'), TIERC_COMMON_DIMS) ->
// scoreAllGates`, exercised at PRODUCTION SCALE with PRODUCTION-DEFAULT scoring (no g2Lattice/g1Brute
// density overrides) — matching the brief's cited concrete gate numbers (fidelity max<=0.0101mm),
// which only resolve to something meaningful under full-density scoring, not the FAST_G2/FAST_G1_BRUTE
// overrides A-2's OWN env-gated block uses for its cheap 4-arm sweep. This file scores exactly ONE
// arm (FourierBloom) at full fidelity instead.
//
// ── WHY THIS FILE EXISTS DESPITE _tierc_armD_run2.test.ts (commit 2d968598) ALREADY PASSING ─────────
// The EXACT same claim this task validates — "a single R-CDT region with zero curves is, BY
// CONSTRUCTION, the plain production-equivalent build" (tierc_regionLayer.ts header) — was already
// scored and PASSED under Addendum-2 adjudication (packed-assembly HASH IDENTITY between the
// region-layer build and a direct assembleWatertight twin build; research/exchange/tierc/armD_crumbs.ndjson
// stage:"verdict" run:2, hash bf78f51f-693eeace, verdict PASS). That prior run predates 17 src/ commits
// this task's controller branch has since accumulated on the production conforming kernel this arm's
// build path drives (WatertightAssembly.ts / verdictRefine.ts / FeatureLineGraph.ts area — Gyroid-knee
// ship T1-T5/T3.2/T3.4, Arm A2 multiCurveCellPolicy, Arm A4b snapMerge, a SuperformulaBlossom CPU fix,
// among others; `git log --oneline 2d968598..HEAD -- src/`). Every one of those changes is documented
// default-off/flag-gated, so byte-identical FourierBloom output is the EXPECTED outcome — but that is
// exactly the kind of claim this repo's audit-first rule (project memory: "no fix proposals without
// TDD/measurement") requires re-measuring, not assuming. This file is that fresh, honest re-measurement
// under the NEW region-layer-core plan's own A-3 slot (distinct runId/crumb namespace from the old
// E-2026-07-11-TIERC-HEADTOHEAD mission's Arm D files, which are left untouched).
//
// GATE (task-A3-brief.md, measurable): all S-GATES green at tolMm=0.01 (fidelity outliers 0 / max
// <=0.0101mm, watertight non-vacuous [nonManRaw 0 + nonManControlMoved true], orientation ok, G4
// zeroArea/degenerate 0); outer AND full tri counts within +/-5% of FOURIER_BLOOM_BUDGET (outer
// 1,278,510 / full 3,143,106); no quality regression vs the DIRECT production twin
// (buildRegionWallGridCPU + assembleWatertight, same call shape _tierc_armD_run2.test.ts validated) —
// scored here via packed-assembly HASH IDENTITY (the primary, strongest possible "no regression"
// criterion: byte-identical output, not merely statistically close).
//
// HONEST CAN-FAIL: every criterion below is expect()-asserted against the ACTUAL measured value, not
// tuned to pass. If the region-layer null path diverges from the direct twin (hash mismatch) or from
// the captured production budget, that is a real orchestration-layer finding to report, not a test bug.
//
// Resilience: breadcrumb-checkpointed at every stage to research/exchange/tierc/armD_control_crumbs.ndjson
// (own namespace, does not touch the old armD_crumbs.ndjson file the run1/run2 arms wrote). Self-bumps
// Windows EcoQoS priority to ABOVE_NORMAL (project memory: "Windows EcoQoS throttles detached node jobs
// ~4-5x"). Env-gated: PF_TIERC_A3_ARMD_CONTROL=1; unset (default) is a no-op.
//
// Run (single build ~29s + twin build ~30s + full-density score ~85s per the prior run's own crumb
// timings — expect ~2.5-3 minutes total, NOT the 45-minute backstop):
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A3_ARMD_CONTROL=1 \
//     node node_modules/vitest/vitest.mjs run --config vitest.tierc_armD_control.config.ts
//
// NEVER edit any src/ file. DEV-ONLY. research/ never imported by src/. NEW FILE — no existing test
// file edited.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall, buildRegionWallGridCPU, toHarnessManifest } from './tierc_regionLayer';
import { scoreAllGates, type StyleTruth } from './tierc_gatesHarness';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM, AF_RDRAIN, fnvHash } from './_analytic_floor_lib';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { buildCreaseRefineLines } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';

const ON = process.env.PF_TIERC_A3_ARMD_CONTROL === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const OUT = join(OUT_DIR, 'gates.ndjson');
const CRUMB_PATH = join(OUT_DIR, 'armD_control_crumbs.ndjson');
const CONTROL_TIMEOUT_MS = 45 * 60 * 1000; // generous backstop; liveness watched via crumbs, see header

// research/exchange/_prod_truth/FourierBloom/meta.json — the captured production artifact this arm
// compares against (same source _tierc_armD.test.ts / _tierc_armD_run2.test.ts pin).
const FOURIER_BLOOM_BUDGET_OUTER = 1_278_510;
const FOURIER_BLOOM_BUDGET_FULL = 3_143_106;
const TRI_TOL_FRAC = 0.05;
const FIDELITY_TOL_MM = 0.01;
const G2_MAX_MM_GATE = 0.0101; // tolMm(0.01) + small epsilon, per task-A3-brief.md's literal gate bound

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({
        task: 'A-3',
        arm: 'D-control',
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

describe.skipIf(!ON)('PROD-TIERC region-layer-core A-3 — Arm D control (FourierBloom null case)', () => {
  it(
    'buildRegionOuterWall -> scoreAllGates matches the DIRECT production twin (hash identity), all S-GATES green, tris within budget',
    () => {
      bumpPriority();
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate to this fork').toBeGreaterThanOrEqual(8192);

      // ── Build through the region layer (buildRegionOuterWall's single-R-CDT dispatch). ────────────
      const manifest = getManifest('FourierBloom');
      const dims = TIERC_COMMON_DIMS;
      const t0 = Date.now();
      const result = buildRegionOuterWall(manifest, dims);
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
        `[A-3 armD-control] build DONE in ${(buildMs / 1000).toFixed(1)}s: dispatch=${result.meta.dispatch} ` +
          `outer=${result.outer.idx.length / 3} full=${result.full ? result.full.idx.length / 3 : 'MISSING'} tris, ` +
          `hash=${result.meta.hash}, warnings=${JSON.stringify(result.meta.warnings)}`,
      );
      expect(result.meta.dispatch, 'FourierBloom must dispatch single-R-CDT (the orchestration null case)').toBe(
        'single-R-CDT',
      );
      expect(result.full, 'single-R-CDT dispatch always returns a full-pot mesh').toBeDefined();
      expect(result.outer.idx.length, 'non-vacuous: outer wall actually built').toBeGreaterThan(0);

      // ── DIRECT production twin — independent call site composing the same exported building blocks
      // (buildRegionWallGridCPU + assembleWatertight), the same replication _tierc_armD_run2.test.ts's
      // Addendum-2 primary criterion used. NOT the region layer — this is the plain-production build
      // the region layer's null path is claimed to equal "by construction".
      const rA = manifest.truth.rA;
      const tTwin0 = Date.now();
      const outerGrid = buildRegionWallGridCPU(rA, 0, dims, AF_TWALL, AF_TBOTTOM, 256);
      const innerGrid = buildRegionWallGridCPU(rA, 1, dims, AF_TWALL, AF_TBOTTOM, 256);
      const creaseChoice = chooseCreaseGrid([]);
      const creaseTChoice = chooseCreaseTGrid([]);
      const helixChoice = chooseHelixGrid(0, 0, 0);
      const creaseLinesAll = buildCreaseRefineLines(
        { styleId: manifest.styleId, lines: [], groundTruthCount: 0 },
        { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
      );
      const assemblyOpts: AssemblyWallOptions = {
        maxSagMm: AF_PROD_OPTS.maxSagMm,
        maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
        minEdgeMm: AF_PROD_OPTS.minEdgeMm,
        gradeRatio: AF_PROD_OPTS.gradeRatio,
        maxLevel: AF_PROD_OPTS.maxLevel,
        resU: AF_PROD_OPTS.resU,
        resT: AF_PROD_OPTS.resT,
        nRing: AF_PROD_OPTS.nRing,
        targetTriangles: AF_PROD_OPTS.targetTriangles,
        budgetMode: AF_PROD_OPTS.budgetMode,
        minUniformLevel: resolveUniformLevelOverride(
          Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level),
          0,
        ),
        uBias: computeUBias(outerGrid.sampler, false),
        featureLevel: AF_PROD_OPTS.featureLevel,
        outerCreaseLines: creaseLinesAll.length > 0 ? creaseLinesAll : undefined,
        outerEfgSampler: composedWallSampler(outerGrid.sampler, {
          uWarp: creaseChoice.warp,
          tWarp: creaseTChoice.warp,
          helix: helixChoice.warp,
        }),
        innerEfgSampler: composedWallSampler(innerGrid.sampler, {
          uWarp: creaseChoice.warp,
          tWarp: creaseTChoice.warp,
          helix: helixChoice.warp,
        }),
      };
      const directAsm = assembleWatertight(
        outerGrid.sampler,
        innerGrid.sampler,
        { H: dims.H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN },
        assemblyOpts,
      );
      const directHash = fnvHash(directAsm.vertices, directAsm.indices);
      const directTwinMs = Date.now() - tTwin0;
      const hashIdentity = result.meta.hash === directHash;
      crumb('twin-done', {
        regionLayerHash: result.meta.hash,
        directTwinHash: directHash,
        hashIdentity,
        directTwinTris: directAsm.indices.length / 3,
        directTwinMs,
      });
      console.log(
        `[A-3 armD-control] DIRECT TWIN DONE in ${(directTwinMs / 1000).toFixed(1)}s: regionLayer=${result.meta.hash} ` +
          `directTwin=${directHash} -> identity=${hashIdentity}`,
      );

      // ── Score (production defaults: no g2Lattice/g1Brute overrides — full density, matching the
      // brief's literal G2 gate bound of 0.0101mm, which only resolves meaningfully at full density).
      const styleTruth: StyleTruth = { styleId: manifest.styleId, rA, H: dims.H, Rb: dims.Rb, Rt: dims.Rt, expn: dims.expn };
      crumb('score-start');
      const tScore0 = Date.now();
      const row = scoreAllGates(
        { full: result.full!, outer: result.outer },
        styleTruth,
        toHarnessManifest(manifest),
        {
          tolMm: FIDELITY_TOL_MM,
          breadcrumbPath: CRUMB_PATH,
          outputPath: OUT,
          runId: `a3-armD-control-FourierBloom-${Date.now()}`,
        },
      );
      const scoreMs = Date.now() - tScore0;
      crumb('score-done', { scoreMs, totalMs: row.totalMs });
      console.log(
        `[A-3 armD-control] score DONE in ${(scoreMs / 1000).toFixed(1)}s: g1 outliers=${row.g1_forward.outliers} ` +
          `maxMm=${row.g1_forward.maxMm} | g2 maxMm=${row.g2_reverse.maxMm ?? 'n/a'} | ` +
          `g3 nonMan=${row.g3_watertight.nonManRaw ?? 'n/a'} orient=${row.g3_watertight.orientationMismatches ?? 'n/a'} | ` +
          `g4 zeroArea=${row.g4_zeroDefect.zeroAreaCount ?? 'n/a'} degen=${row.g4_zeroDefect.degenerateCount ?? 'n/a'} | ` +
          `g7 bnd=${row.g7_assembly.wholeMeshBoundaryEdges ?? 'n/a'}`,
      );

      // ── Instrument non-vacuity witnesses (mandatory hygiene, per prereg "a row without them is VOID").
      expect(row.g3_watertight.nonManControlMoved, 'nonManControlMoved witness').toBe(true);
      expect(row.g2_reverse.locatorSelfCheckMaxMm, 'locatorSelfCheckMaxMm witness').not.toBeNull();
      expect(row.g2_reverse.locatorSelfCheckMaxMm as number, 'locatorSelfCheckMaxMm witness').toBeLessThan(1e-9);

      // ── Tri counts vs FOURIER_BLOOM_BUDGET, +/-5% (task-A3-brief.md's explicit numeric gate). ─────
      const outerTris = row.g1_forward.nFacets;
      const fullTris = row.g6_budget.triangleCount;
      const outerDeltaFrac = (outerTris - FOURIER_BLOOM_BUDGET_OUTER) / FOURIER_BLOOM_BUDGET_OUTER;
      const fullDeltaFrac = (fullTris - FOURIER_BLOOM_BUDGET_FULL) / FOURIER_BLOOM_BUDGET_FULL;

      // ── S-GATES + verdict (computed, logged, then asserted individually — honest can-fail: each
      // expect() below fires on the ACTUAL measured value, nothing is tuned to force a pass). ────────
      const gates = {
        g1_outliers0: row.g1_forward.outliers === 0,
        g2_maxLeTol: (row.g2_reverse.maxMm ?? Infinity) <= G2_MAX_MM_GATE,
        g3_nonMan0: row.g3_watertight.nonManRaw === 0,
        g3_orientationClean: row.g3_watertight.orientationMismatches === 0,
        g4_zeroAreaZero: row.g4_zeroDefect.zeroAreaCount === 0,
        g4_degenerateZero: row.g4_zeroDefect.degenerateCount === 0,
        g7_fullPotClosed: row.g7_assembly.wholeMeshBoundaryEdges === 0,
        outerTrisWithin5pct: Math.abs(outerDeltaFrac) <= TRI_TOL_FRAC,
        fullTrisWithin5pct: Math.abs(fullDeltaFrac) <= TRI_TOL_FRAC,
        hashIdentityVsDirectTwin: hashIdentity,
      };
      const allGatesGreen = Object.values(gates).every(Boolean);
      const verdict = allGatesGreen ? 'PASS' : 'FAIL';

      const summary = {
        verdict,
        gates,
        outer: { tris: outerTris, budget: FOURIER_BLOOM_BUDGET_OUTER, deltaFrac: outerDeltaFrac },
        full: { tris: fullTris, budget: FOURIER_BLOOM_BUDGET_FULL, deltaFrac: fullDeltaFrac },
        hashIdentity: { regionLayerHash: result.meta.hash, directTwinHash: directHash, identity: hashIdentity },
        g1: row.g1_forward,
        g2: row.g2_reverse,
        g3: row.g3_watertight,
        g4: row.g4_zeroDefect,
        g7: row.g7_assembly,
        quality: row.quality,
        signedVolumeMm3: row.g3_watertight.signedVolumeMm3,
        wallTimes: { buildMs, directTwinMs, scoreMs, totalMs: row.totalMs },
      };
      crumb('verdict', summary);
      // eslint-disable-next-line no-console
      console.log(`[A-3 armD-control] VERDICT=${verdict}\n${JSON.stringify(summary, null, 2)}`);

      // ── Assertions (each an independent, honest can-fail check on a measured value). ───────────────
      expect(hashIdentity, `region-layer hash (${result.meta.hash}) must equal direct-twin hash (${directHash})`).toBe(
        true,
      );
      expect(row.g1_forward.outliers, 'G1 forward-check outliers').toBe(0);
      expect(row.g2_reverse.maxMm ?? Infinity, `G2 reverse-check maxMm <= ${G2_MAX_MM_GATE}`).toBeLessThanOrEqual(
        G2_MAX_MM_GATE,
      );
      expect(row.g3_watertight.nonManRaw, 'G3 non-manifold edge count').toBe(0);
      expect(row.g3_watertight.orientationMismatches, 'G3 orientation mismatches').toBe(0);
      expect(row.g4_zeroDefect.zeroAreaCount, 'G4 zero-area facet count').toBe(0);
      expect(row.g4_zeroDefect.degenerateCount, 'G4 degenerate facet count').toBe(0);
      expect(row.g7_assembly.wholeMeshBoundaryEdges, 'G7 whole-mesh boundary edges (full-pot closed)').toBe(0);
      expect(
        Math.abs(outerDeltaFrac),
        `outer tris (${outerTris}) within +/-5% of budget (${FOURIER_BLOOM_BUDGET_OUTER})`,
      ).toBeLessThanOrEqual(TRI_TOL_FRAC);
      expect(
        Math.abs(fullDeltaFrac),
        `full tris (${fullTris}) within +/-5% of budget (${FOURIER_BLOOM_BUDGET_FULL})`,
      ).toBeLessThanOrEqual(TRI_TOL_FRAC);
    },
    CONTROL_TIMEOUT_MS,
  );
});
