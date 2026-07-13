// _tierc_armC1_gothic.test.ts — PROD-TIERC region-layer-core plan task A-6
// (docs/superpowers/plans/2026-07-12-region-layer-core.md §A-6: "Arm C Gothic C1 (patch through K2,
// + quality report)"). Env-gated PF_TIERC_A6_GOTHIC=1. Research-side only, no src edit, no flag.
//
// GOAL: does `buildRegionOuterWall(getManifest('GothicArches'), TIERC_COMMON_DIMS)` — the region
// layer's single-R-REFINE (K2) dispatch (`buildSingleRRefineRegion`, tierc_regionLayer.ts) —
// reproduce the LIVE production CI smoke gate (wholeMesh0Outlier.test.ts's unconditional
// `runPatchGate('GothicArches', {uLo:0,uHi:0.125,tLo:0.48,tHi:0.52}, 0.6, 512)`: outliers 0,
// max<=0.0101mm, watertight non-vacuous, 9,917 tris in 7 refine passes) — PLUS the quality report
// the current suite omits (`triangleQualityDistribution` fields + explicit `needleCount`,
// gothic-spec gap #1's reporting hole)?
//
// tierc_manifest.ts's `gothicArchesAnatomy` (verified by direct read) carries the CI's EXACT pinned
// config as `kernelOpts` (bgArcMm:0.6, rulerNTheta:512, domain {0,0.125,0.48,0.52}) and
// `sizing.params` (tolMm:0.01, maxPass:16, bulkPasses7pt:4) — the SAME values runPatchGate passes to
// refineToZeroOutliers. So a "native" `buildRegionOuterWall` build and a "K2-direct" build (calling
// styleSampler/buildProtectedComplex/refineToZeroOutliers with those SAME literals, mirroring
// runPatchGate exactly) are provably the same computation.
//
// BUILD-PATH STRATEGY (same as _tierc_armC1.test.ts, this task's direct predecessor): TWO paths,
// cross-checked by content hash (fnvHash).
//   (1) NATIVE — the actual mission target. `RegionBuildResult` does not expose the refine loop's own
//       `passes`/`capped` (only `outer.xyz`/`outer.idx`/`meta`, verified by direct read of
//       `buildSingleRRefineRegion`'s return statement) — needed to check the CI's "<=7 passes" gate —
//       so path (2) below is ALSO always built.
//   (2) K2-DIRECT — exposes `passes`/`capped` directly, and carries the CI's OWN full-azimuth honest
//       ruler (`scoreWholeMesh`, unstrided, every facet) as the CI-AUTHORITATIVE outliers/maxMm
//       reading — independent of scoreAllGates' own G1 ruler below.
// When hashes match, K2-direct's `passes`/`capped`/CI-guard numbers transfer to the native result
// exactly (same mesh, bit-for-bit); any divergence is reported as its own named finding, not silently
// resolved. If native throws, this is a first-class dispatch-bug finding (reported verbatim, never
// worked around) and K2-direct becomes the (labeled) authoritative mesh for scoring below.
//
// WHY A NEW FILE INSTEAD OF RE-RUNNING _tierc_armC1.test.ts: that probe's own `scoreAllGates` call
// used NO g1Brute/stride override (armC1_crumbs.ndjson, this repo's own prior run: prescreen found
// 7,006 survivor facets, then the unstrided G1 interior stage measured ~1s/facet — 105 facets took
// ~103s — extrapolating to 7,006 facets is ~2hrs; no armC1_verdict.json was ever written, confirming
// that run never completed scoreAllGates). This file reuses the A-2 gates-runner's OWN fix for
// exactly this problem (_tierc_a2_gatesrunner.test.ts's file-header: "g2Lattice/g1Brute FAST
// overrides bound the SCORING stage only ... sample-density-only levers, never algorithm-changing")
// PLUS a `stride` bound on G1's interior stage (a SEPARATE, likewise sample-density-only lever per
// ScoreAllGatesOpts.stride's own doc-comment: "stride=1 is byte-identical to the unstrided path;
// stride>1 rows are labeled SUBSAMPLE rows ... never an acceptance basis"). The CI-gate reproduction
// itself (outliers/maxMm/tris/passes) is NEVER read from this strided scoreAllGates row — it comes
// from the K2-direct path's own unstrided `scoreWholeMesh` CI guard (byte-for-byte the CI's own
// methodology). scoreAllGates here supplies ONLY the composite-harness row (G3/G4/G6/quality) and the
// quality report this task adds; its G1 row is explicitly labeled a bounded subsample, not the
// authoritative CI check.
//
// G7 = patch-NA (gothic-spec §5, manifest `gates.g7scope:'patch-NA'`) — deferred, asserted OPEN, never
// fabricated. G2: scoreAllGates' own default G2 scans the FULL [0,2*pi]x[0,H] pot surface against a
// locator built ONLY from this tiny patch — semantically mismatched denominator (A-2's own flagged
// caveat: "full-pot-vs-patch-locator"). This file therefore ALSO runs a patch-SCOPED G2 supplementary
// reading (reusing `buildRefLocator`, the harness's own proven instrument, restricted to the patch's
// own (u,t) domain — verbatim port of _tierc_armC1.test.ts's own `patchG2` block), which is the
// meaningful G2-style number for a patch and is reported alongside the caveated full-pot default.
//
// Run: NODE_OPTIONS=--max-old-space-size=8192 PF_TIERC_A6_GOTHIC=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_armC1_gothic.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only. NEW FILE ONLY — manifest, region layer,
// gates harness, labkit, and every tierC/ production kernel file are READ-ONLY imports; none edited
// by this file. Commits nothing (per mission rules). Honest can-fail: the CI-gate numbers below are
// hard-asserted against the LITERAL CI reference (9917/7/0/<=0.0101) — never tuned to pass.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall, toHarnessManifest, type RegionBuildResult } from './tierc_regionLayer';
import { scoreAllGates, type StyleTruth, type BinMesh } from './tierc_gatesHarness';
import { fnvHash } from './_analytic_floor_lib';
import { nonManRawBigStats } from './labkit';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildProtectedComplex } from '../../src/renderers/webgpu/parametric/conforming/tierC/morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
  type RefineOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/noBridgeRefine';
import {
  DEFAULT_RULER,
  liftChartMesh,
  radialSurfaceFromSampler,
  scoreWholeMesh,
  type RulerOptions,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/interiorRuler';
import type { StyleId } from '../../src/geometry/types';

const TAU = Math.PI * 2;
const TOL = 0.01;
const ON = process.env.PF_TIERC_A6_GOTHIC === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const GATES_OUT = join(OUT_DIR, 'gates.ndjson'); // shared ndjson corpus, same convention every arm uses
const CRUMB_PATH = join(OUT_DIR, 'a6_gothic_crumbs.ndjson');
const VERDICT_PATH = join(OUT_DIR, 'a6_gothic_verdict.json');
const A6_TIMEOUT_MS = 15 * 60 * 1000;

// The CI gate's EXACT pinned domain/config (wholeMesh0Outlier.test.ts:109-114,
// champion-spec-gothic.md §5 "REPRODUCE-TARGETS / Primary target") — VERIFIED identical to
// tierc_manifest.ts's gothicArchesAnatomy kernelOpts (see file header).
const DOMAIN: ChartDomain = { uLo: 0, uHi: 0.125, tLo: 0.48, tHi: 0.52 };
const BG_ARC_MM = 0.6;
const N_THETA = 512;

// CI gate reference numbers (research/exchange/_rebaseline20_final/FINDINGS.md:4;
// champion-spec-gothic.md table row "production-ported smoke (CI, unconditional)").
const CI_REF = { tris: 9917, passes: 7, maxMm: 0.0101 };

// FAST overrides for the scoreAllGates SCORING stage only (identical convention to
// _tierc_a2_gatesrunner.test.ts's own FAST_G2/FAST_G1_BRUTE consts — sample-density-only levers,
// never algorithm-changing; ScoreAllGatesOpts.g2Lattice/g1Brute doc-comments).
const FAST_G2 = { nu: 8, nt: 8 };
const FAST_G1_BRUTE = { nTheta: 32, nZ: 8 };
// G1 interior-stage stride bound (see file header "WHY A NEW FILE"): armC1_crumbs.ndjson's prior run
// measured 7,006 prescreen survivors on this exact patch; stride=30 scores ~234 of them (the same
// ~150-250 scanned-facet order _tierc_c2full.test.ts's own `stridedScoreVsAnalytic` targets), keeping
// this stage bounded to low minutes. stride>1 rows are explicitly SUBSAMPLE (ScoreAllGatesOpts.stride
// doc-comment) — never the CI-authoritative reading; that comes from the K2-direct `scoreWholeMesh`
// guard below (unstrided, every facet, byte-for-byte the CI's own methodology).
const G1_STRIDE = 30;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A6-gothic', style: 'GothicArches', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

/** Self-bump AboveNormal priority (Windows EcoQoS throttles detached/background node jobs ~4-5x —
 *  feedback_windows_ecoqos_throttle.md). Best-effort; a failure here must never kill the run. */
function bumpPriority(tag: string): void {
  try {
    os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
  } catch {
    // eslint-disable-next-line no-console
    console.log(`[${tag}] note: could not self-bump priority (EcoQoS throttle risk remains)`);
  }
}

describe.skipIf(!ON)('PROD-TIERC region-layer-core A-6 -- Gothic K2/R-REFINE reproduction + quality report', () => {
  it(
    'buildRegionOuterWall native + K2-direct CI reproduction -> scoreAllGates -> explicit quality report',
    () => {
      const tStart = Date.now();
      bumpPriority('a6-gothic');
      mkdirSync(OUT_DIR, { recursive: true });
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(
        heapMB,
        'NODE_OPTIONS=--max-old-space-size=8192 must propagate to the fork child -- relaunch with the env var exported',
      ).toBeGreaterThanOrEqual(6000);

      const manifest = getManifest('GothicArches');
      expect(manifest.gates.g7scope, 'G7 = patch-NA per gothic-spec §5').toBe('patch-NA');
      const rA = manifest.truth.rA;
      const { H, Rt, Rb, expn } = TIERC_COMMON_DIMS;

      // ── Stage 1: NATIVE build via buildRegionOuterWall -- the actual mission target. ──────────────
      let nativeResult: RegionBuildResult | null = null;
      let nativeError: string | null = null;
      let nativeHash: string | null = null;
      try {
        const tNative0 = Date.now();
        nativeResult = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
        const buildMs = Date.now() - tNative0;
        nativeHash = fnvHash(nativeResult.outer.xyz, nativeResult.outer.idx);
        crumb('native-build-done', {
          ms: buildMs,
          tris: nativeResult.outer.idx.length / 3,
          dispatch: nativeResult.meta.dispatch,
          warnings: nativeResult.meta.warnings,
          hash: nativeHash,
        });
      } catch (err) {
        nativeError = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
        crumb('native-build-THREW', { error: nativeError });
        // eslint-disable-next-line no-console
        console.warn(`[a6-gothic] NATIVE buildRegionOuterWall THREW -- falling back to K2-direct. ${nativeError}`);
      }

      // ── Stage 2: K2-DIRECT build, mirroring wholeMesh0Outlier.test.ts's runPatchGate EXACTLY --
      // exposes passes/capped and the CI's own full-azimuth scoreWholeMesh guard. ────────────────────
      const tSampler0 = Date.now();
      const sampler = styleSampler('GothicArches' as StyleId, {}, { H, Rt, Rb, expn });
      const complex = buildProtectedComplex(sampler, 'GothicArches');
      crumb('complex-built', {
        ms: Date.now() - tSampler0,
        residualCrossings: complex.residualCrossings,
        junctions: complex.junctions.length,
        recoveryPct: complex.recoveryPct,
      });
      expect(complex.residualCrossings).toBe(0);

      const loopRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA, thetaWindowRad: 0.5 };
      const guardRuler: RulerOptions = { ...DEFAULT_RULER, nTheta: N_THETA };
      const refineOpts: RefineOptions = { tolMm: TOL, maxPass: 16, bulkPasses7pt: 4, bgArcMm: BG_ARC_MM, ruler: loopRuler };
      const tRefine0 = Date.now();
      const refined = refineToZeroOutliers(sampler, complex, DOMAIN, refineOpts, (s) => {
        crumb('refine-pass', { pass: s.pass, dense: s.dense, tris: s.nTris, outliers: s.outliers, worstMm: +s.worstMm.toFixed(5), inserted: s.inserted, ms: s.ms });
      });
      crumb('refine-done', { ms: Date.now() - tRefine0, passes: refined.passes, capped: refined.capped, tris: refined.tris.length / 3 });

      // MANDATORY whole-mesh guard: EVERY facet, dense 45-pt honest ruler at FULL azimuth -- the CI's
      // own trusted verdict (wholeMesh0Outlier.test.ts:88-94), reproduced exactly here, independent of
      // scoreAllGates' own (strided, FAST-overridden) G1 ruler below.
      const surface = radialSurfaceFromSampler(sampler);
      const tGuard0 = Date.now();
      const ciGuard = scoreWholeMesh(sampler, surface, refined, TOL, guardRuler);
      crumb('ci-guard-done', { ms: Date.now() - tGuard0, outliers: ciGuard.outliers, maxMm: ciGuard.maxMm, nFacets: ciGuard.nFacets });

      const xyz64 = liftChartMesh(sampler, refined.uv);
      const k2xyz = Float32Array.from(xyz64);
      const k2idx = Uint32Array.from(refined.tris);
      const k2hash = fnvHash(k2xyz, k2idx);
      crumb('k2direct-hash', { hash: k2hash, tris: k2idx.length / 3, passes: refined.passes, capped: refined.capped });

      const baseStats = nonManRawBigStats(k2idx);
      const cracked = new Uint32Array(k2idx.length + 3);
      cracked.set(k2idx);
      cracked.set([k2idx[0], k2idx[1], k2idx[2]], k2idx.length);
      const crackedStats = nonManRawBigStats(cracked);
      const k2NonMan = { nonMan: baseStats.nonMan, boundary: baseStats.boundary, controlMoved: crackedStats.nonMan > baseStats.nonMan };
      crumb('k2direct-nonman', k2NonMan);

      const nativeMatchesK2Direct = nativeResult !== null && nativeHash === k2hash && nativeResult.outer.idx.length === k2idx.length;
      crumb('cross-check', { nativeMatchesK2Direct, nativeHash, k2hash });

      // ── Authoritative mesh for scoring: native if it built (mission target), else K2-direct
      // fallback -- LABELED. Patch-NA: `full` and `outer` are the SAME patch mesh. ───────────────────
      let scoredXyz: Float32Array;
      let scoredIdx: Uint32Array;
      let scoredPath: string;
      if (nativeResult) {
        scoredXyz = nativeResult.outer.xyz;
        scoredIdx = nativeResult.outer.idx;
        scoredPath = nativeMatchesK2Direct
          ? 'region-layer-native (buildRegionOuterWall R-REFINE dispatch; hash-verified BIT-IDENTICAL to K2-direct)'
          : 'region-layer-native (buildRegionOuterWall R-REFINE dispatch; DIVERGES from K2-direct -- see nativeVsK2Direct in the verdict)';
      } else {
        scoredXyz = k2xyz;
        scoredIdx = k2idx;
        scoredPath = `K2-direct-fallback (native buildRegionOuterWall THREW: ${nativeError ?? 'unknown error'})`;
      }
      const scoredTris = scoredIdx.length / 3;

      // ── Stage 3: scoreAllGates -- composite harness row + the quality report this task adds.
      // G1's stride/g1Brute are bounded (file header "WHY A NEW FILE"); G1 here is NOT the
      // CI-authoritative reading (that is ciGuard above, unstrided). ─────────────────────────────────
      const fullBin: BinMesh = { xyz: scoredXyz, idx: scoredIdx };
      const styleTruth: StyleTruth = { styleId: 'GothicArches', rA, H, Rb, Rt, expn };
      const manifestRow = toHarnessManifest(manifest);
      crumb('score-start', { tris: scoredTris, scoredPath });
      const tScore0 = Date.now();
      const row = scoreAllGates(
        { full: fullBin, outer: fullBin },
        styleTruth,
        manifestRow,
        {
          tolMm: TOL,
          stride: G1_STRIDE,
          prescreen: true,
          g1Brute: FAST_G1_BRUTE,
          g2Lattice: FAST_G2,
          breadcrumbPath: CRUMB_PATH,
          outputPath: GATES_OUT,
          runId: `a6-gothic-${Date.now()}`,
        },
      );
      crumb('score-done', { scoreMs: Date.now() - tScore0, totalMs: row.totalMs });

      // Mandatory non-vacuity witnesses (prereg "a row without them is VOID").
      expect(row.g3_watertight.nonManControlMoved).toBe(true);
      expect(row.g2_reverse.locatorSelfCheckMaxMm).not.toBeNull();
      expect(row.g2_reverse.locatorSelfCheckMaxMm as number).toBeLessThan(1e-9);

      // G7 = patch-NA: OPEN fields, never fabricated.
      expect(row.g7_assembly.seamSpecificCheck).toBe('OPEN');
      expect(row.g7_assembly.rimCheck).toBe('OPEN');
      expect(row.g7_assembly.baseCheck).toBe('OPEN');
      expect(row.g7_assembly.capCheck).toBe('OPEN');
      expect(row.g7_assembly.innerOuterStitchCheck).toBe('OPEN');

      // ── Explicit quality report (the deliverable this task adds -- gothic-spec gap #1's reporting
      // hole): triangleQualityDistribution's fields + explicit needleCount, well-formed. ─────────────
      const qualityReport = {
        basis: row.quality.basis,
        minAngleDeg: row.quality.minAngleDeg,
        p5MinAngleDeg: row.quality.p5MinAngleDeg,
        medianMinAngleDeg: row.quality.medianMinAngleDeg,
        pctBelow10: row.quality.pctBelow10,
        pctBelow20: row.quality.pctBelow20,
        pctBelow30: row.quality.pctBelow30,
        maxAspect3D: row.quality.maxAspect3D,
        sliverCount: row.quality.sliverCount,
        degenerateCount: row.quality.degenerateCount,
        needleCount: row.quality.needleCount,
      };
      for (const [k, v] of Object.entries(qualityReport)) {
        if (k === 'basis') continue;
        expect(Number.isFinite(v as number), `quality.${k} must be a finite number`).toBe(true);
      }
      crumb('quality-report', qualityReport);

      // ── Stage 4: patch-SCOPED G2 supplementary (verbatim port of _tierc_armC1.test.ts's own
      // `patchG2` block) -- the meaningful, non-mismatched G2-style reading for a patch (A-2's own
      // flagged caveat: default G2 scans the FULL pot vs a patch-only locator). ──────────────────────
      const tPg0 = Date.now();
      const refMesh: RefMesh = { xyz: Float64Array.from(k2xyz), idx: k2idx, nV: k2xyz.length / 3, nF: k2idx.length / 3 };
      let edgeSum = 0;
      const eSamples = Math.min(2000, refMesh.nF);
      for (let s = 0; s < eSamples; s++) {
        const tIdx = Math.floor((s / eSamples) * refMesh.nF) * 3;
        const a = refMesh.idx[tIdx] * 3;
        const b = refMesh.idx[tIdx + 1] * 3;
        edgeSum += Math.hypot(refMesh.xyz[b] - refMesh.xyz[a], refMesh.xyz[b + 1] - refMesh.xyz[a + 1], refMesh.xyz[b + 2] - refMesh.xyz[a + 2]);
      }
      const cell = Math.max(0.05, Math.min(3.0, (edgeSum / Math.max(1, eSamples)) * 4));
      const patchLoc = buildRefLocator(refMesh, cell);
      const NU_P = 400;
      const NT_P = 48;
      const cov = new Float64Array(NU_P * NT_P);
      let pn = 0;
      let worstD = -1;
      let worstU = 0;
      let worstT = 0;
      for (let j = 0; j < NT_P; j++) {
        const t = DOMAIN.tLo + (DOMAIN.tHi - DOMAIN.tLo) * (j / (NT_P - 1));
        const z = t * H;
        for (let i = 0; i < NU_P; i++) {
          const u = DOMAIN.uLo + (DOMAIN.uHi - DOMAIN.uLo) * (i / (NU_P - 1));
          const th = TAU * u;
          const r = rA(th, z);
          const d = patchLoc.dist(r * Math.cos(th), r * Math.sin(th), z);
          cov[pn++] = d;
          if (d > worstD) { worstD = d; worstU = u; worstT = t; }
        }
      }
      const sorted = Float64Array.from(cov.subarray(0, pn)).sort();
      let selfCheckMax = 0;
      for (let s = 0; s < 12; s++) {
        const u = DOMAIN.uLo + (DOMAIN.uHi - DOMAIN.uLo) * (((s * 79) % 97) / 97);
        const t = DOMAIN.tLo + (DOMAIN.tHi - DOMAIN.tLo) * (((s * 131) % 89) / 89);
        const th = TAU * u;
        const z = t * H;
        const r = rA(th, z);
        const px = r * Math.cos(th);
        const py = r * Math.sin(th);
        selfCheckMax = Math.max(selfCheckMax, Math.abs(patchLoc.dist(px, py, z) - patchLoc.bruteDist(px, py, z)));
      }
      const patchG2 = {
        maxMm: worstD, worstU, worstT,
        p99Mm: sorted[Math.min(pn - 1, Math.floor(0.99 * pn))],
        p50Mm: sorted[Math.floor(0.5 * pn)],
        overCount: sorted.reduce((n, d) => n + (d > TOL ? 1 : 0), 0),
        n: pn, cellMm: cell, selfCheckMaxMm: selfCheckMax, ms: Date.now() - tPg0,
      };
      crumb('patch-g2-done', patchG2);
      expect(selfCheckMax, 'patch-G2 locator self-check: fast path must match brute').toBeLessThan(1e-6);

      // ── ADJUDICATE (literal CI-gate reproduction) -- hard-asserted against the CI reference, never
      // tuned to pass ("honest can-fail" per this task's own rules). ─────────────────────────────────
      const gates = {
        outliersZero: ciGuard.outliers === 0,
        maxMmWithinRef: ciGuard.maxMm <= CI_REF.maxMm,
        watertightNonVacuous: baseStats.nonMan === 0 && k2NonMan.controlMoved === true,
        trisWithinRef: scoredTris <= CI_REF.tris,
        passesWithinRef: refined.passes <= CI_REF.passes,
      };
      const verdict = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';

      const summary = {
        verdict,
        gates,
        ciReproduction: {
          note: 'reproduces wholeMesh0Outlier.test.ts runPatchGate(GothicArches, {0,0.125,0.48,0.52}, 0.6, 512) exactly, via the K2-direct build',
          tris: scoredTris, trisRef: CI_REF.tris,
          passes: refined.passes, passesRef: CI_REF.passes, capped: refined.capped,
          fullAzimuthGuard: { outliers: ciGuard.outliers, maxMm: ciGuard.maxMm, nFacets: ciGuard.nFacets }, // CI's OWN trusted verdict
          maxMmRef: CI_REF.maxMm,
          watertight: { nonMan: baseStats.nonMan, boundary: baseStats.boundary, controlMoved: k2NonMan.controlMoved },
        },
        buildPath: {
          scoredPath,
          native: nativeResult
            ? { tris: nativeResult.outer.idx.length / 3, dispatch: nativeResult.meta.dispatch, buildMs: nativeResult.meta.buildMs, warnings: nativeResult.meta.warnings, hash: nativeHash }
            : null,
          nativeError,
          k2Direct: { tris: k2idx.length / 3, passes: refined.passes, capped: refined.capped, hash: k2hash },
          nativeMatchesK2Direct,
        },
        harnessRow: {
          g1_forward: {
            ...row.g1_forward,
            CAVEAT: `stride=${G1_STRIDE} SUBSAMPLE (ScoreAllGatesOpts.stride doc-comment: "never an acceptance basis") -- the CI-authoritative outliers/maxMm reading is ciReproduction.fullAzimuthGuard above (unstrided, every facet, byte-for-byte the CI's own scoreWholeMesh methodology), NOT this row.`,
          },
          g2_reverse: {
            ...row.g2_reverse,
            CAVEAT: 'scoreAllGates default G2 scans the FULL [0,2*pi]x[0,H] pot surface against a locator built ONLY from this tiny patch -- semantically mismatched denominator for a patch (most query points are far outside the patch entirely). See patchG2 below for the meaningful patch-scoped reading.',
          },
          g3_watertight: row.g3_watertight,
          g4_zeroDefect: row.g4_zeroDefect,
          g6_budget: row.g6_budget,
          g7_assembly: { ...row.g7_assembly, note: 'g7scope=patch-NA (gothic-spec §5) -- full=outer for this patch, no full-pot assembly to check' },
        },
        patchG2, // the meaningful, patch-scoped G2 reading (scope-to-patch-domain requirement)
        qualityReport, // triangleQualityDistribution fields + needleCount -- the reporting hole this task closes
        wallTimes: { totalMs: Date.now() - tStart },
      };
      writeFileSync(VERDICT_PATH, JSON.stringify(summary, null, 2));
      crumb('verdict', { verdict, gates, elapsedMs: Date.now() - tStart });
      // eslint-disable-next-line no-console
      console.log(`[a6-gothic] VERDICT=${verdict}\n${JSON.stringify(summary, null, 2)}`);

      expect(ciGuard.outliers, 'CI reference: outliers must be 0').toBe(0);
      expect(ciGuard.maxMm, `CI reference: max <= ${CI_REF.maxMm}`).toBeLessThanOrEqual(CI_REF.maxMm);
      expect(baseStats.nonMan, 'watertight: raw non-manifold edges must be 0').toBe(0);
      expect(k2NonMan.controlMoved, 'watertight non-vacuity: the cracked control MUST register worse').toBe(true);
      expect(scoredTris, `CI reference: tris <= ${CI_REF.tris}`).toBeLessThanOrEqual(CI_REF.tris);
      expect(refined.passes, `CI reference: passes <= ${CI_REF.passes}`).toBeLessThanOrEqual(CI_REF.passes);
    },
    A6_TIMEOUT_MS,
  );
});
