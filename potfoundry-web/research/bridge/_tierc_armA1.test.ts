// _tierc_armA1.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A1 (region layer + manifest
// integration proof for GyroidManifold). Env-gated PF_TIERC_ARMA1=1.
// Prereg: research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md, Arm A / A1 bullet + ADDENDUM 1
// (region layer runs research-side via twin injection) + ADDENDUM 2 (parity criteria — applies
// to "Arm D run 2 and all subsequent arms"; no quality baseline is cited anywhere for Gyroid
// (champion-spec-gyroid.md never reports triangleQualityDistribution), so this arm reports
// `quality` as fresh data with no comparison basis, consistent with Addendum 2's own logic that
// a comparison needs a same-provenance or captured baseline to be meaningful).
//
// QUESTION: does buildRegionOuterWall(getManifest('GyroidManifold'), dims) — the GENERAL
// orchestration path (manifest anatomy provider -> region dispatch -> production kernel) —
// reproduce the bespoke-twin band-edge row banked at
// research/exchange/_tierc_a2_accept/verdict_fanRepair.json (A2-fanrepair-verdict.md) /
// champion-spec-gyroid.md §5.4? This is the integration proof that the general dispatch equals
// the hand-built twin.
//
// FINDING (confirmed by direct read of tierc_regionLayer.ts's buildSingleRCdtRegion, ~L449-571,
// BEFORE this file was written): `RegionBuildOpts` — the only options buildRegionOuterWall
// accepts — has NO multiCurveCellPolicy field, and the AssemblyWallOptions object literal
// buildSingleRCdtRegion constructs (L506-524: maxSagMm..innerEfgSampler) never sets
// `multiCurveCellPolicy` — the field is simply absent from that object literal, so
// assembleWatertight sees `undefined` (='off' behavior, WatertightAssembly.ts:314) regardless of
// what a caller wants. The A2 kernel fix (multiCurveCellPolicy: 'off'|'forceRefine'|'fanRepair')
// is real and proven (A2-fanrepair-verdict.md: closes the 2-locus non-manifold defect to 0,
// fidelity unmoved) but the region layer's ONE existing R-CDT dispatch path has NOT been wired to
// expose it to a manifest/caller — a genuine missing thread, not a design choice (RegionPlan's
// `sizing.params`/`kernelOpts` are numeric-only via `pickNum`, which cannot even carry a string
// enum like this one through the existing plumbing). This file therefore:
//   (1) builds NATIVE via buildRegionOuterWall(getManifest('GyroidManifold'), dims) with NO opts
//       (multiCurveCellPolicy cannot be threaded through the public API today) — reports its
//       hash/tris/nonMan as the direct integration-fidelity check: does the general dispatch
//       reproduce the twin's construction bit-for-bit, modulo the policy gap?
//   (2) falls back to a manual re-construction that reuses the region layer's OWN exported
//       generic helper (buildRegionWallGridCPU) plus the SAME production warp/feature-graph
//       plumbing _tierc_a2_accept.test.ts already validated (chooseCreaseGrid/chooseCreaseTGrid/
//       chooseHelixGrid/composedWallSampler/resolveUniformLevelOverride/computeUBias/
//       assembleWatertight), with multiCurveCellPolicy:'fanRepair' added as the ONE extra field —
//       i.e. "what the region layer would build if it threaded the policy" — to produce a G4=0
//       mesh scoreAllGates can actually score. Both paths' provenance is labeled explicitly
//       throughout the output (never silently conflated).
//
// Extraction (checklist item 1, champion-spec-gyroid.md §5.4) is run FRESH via
// extractBandedgeContours at GBE_EXTRACT_DEFAULT (nu=nt=1200, stepMm=0.15) — the EXACT call
// gyroidManifoldAnatomy makes internally — rather than loading A2's banked contours file, so this
// arm is a genuinely independent end-to-end reproduction, not a replay of cached intermediates.
//
// Scoring: `scoreAllGates` (mandated instrument, tierc_gatesHarness.ts v1.1) is run with
// `survivorsIn` (prescreen-once, reusing gpcPrescreenDetail's own dense-45 scan — its survivor SET
// is mathematically identical to the harness's own internal prescreenOuterFacets: same 45-pt
// denseBary(8) lattice, same `|hypot(x,y)-rA(th,clamp(z))|>tol` test, same facet order — avoids a
// redundant second full-outer-mesh scan) and `stride` (the harness's own tractability lever, v1.1;
// freshly measured production rate this same day: gates-harness-bench.md 2026-07-11,
// 440ms/scanned-facet on GothicArches, a comparably steep tangled style, ~90% GN+brute-advance
// rate). This is a DIFFERENT basis than the champion's own pre-registered SEVERITY-STRATIFIED
// sample (gpcStratifiedNewton, plan {topExhaustive:200,strata:8,perStratum:225}) — the harness has
// no stratified lever (confirmed: gates-harness-bench.md "Gaps found in the harness"). Per the
// mission's explicit instruction ("use the pre-registered stratified basis if the harness supports
// it, else stride... label the basis"), this file runs BOTH: gpcStratifiedNewton (imported
// read-only, already-proven instrument — NOT new metrology) directly on the SAME fanRepair mesh
// for the apples-to-apples champion-spec comparison, AND scoreAllGates(stride=N) for the mandated
// gates.ndjson row — both bases are reported, clearly labeled, never conflated.
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_ARMA1=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_armA1.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only. NEW FILE ONLY — region layer, manifest,
// gates harness, and the A2 kernel change are all READ-ONLY imports; none edited by this file.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import {
  buildRegionOuterWall,
  toHarnessManifest,
  evaluatePackedAssemblyToXyz,
  buildRegionWallGridCPU,
} from './tierc_regionLayer';
import { scoreAllGates, type StyleTruth } from './tierc_gatesHarness';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  extractBandedgeContours,
  contoursToFeatureLines,
  gpcPrescreenDetail,
  gpcStratifiedNewton,
} from './_gyroid_bandedge_lib';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM, AF_RDRAIN, fnvHash } from './_analytic_floor_lib';
import { nonManRawBig } from './labkit';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import {
  buildCreaseRefineLines,
  type FeatureLine,
} from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';
import { extractOuterWallSubmesh } from '../../src/fidelity/metrics';

const TAU = Math.PI * 2;
const TOL = 0.01;
const ON = process.env.PF_TIERC_ARMA1 === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const GATES_OUT = join(OUT_DIR, 'gates.ndjson');
const CRUMB_PATH = join(OUT_DIR, 'armA1_crumbs.ndjson');
const VERDICT_PATH = join(OUT_DIR, 'armA1_verdict.json');
const ARMA1_TIMEOUT_MS = 40 * 60 * 1000;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({
        arm: 'A1',
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

// BANKED reference: research/exchange/_tierc_a2_accept/verdict_fanRepair.json (A2's own scored
// row, at: 2026-07-11T13:51:47.409Z) cross-checked against champion-spec-gyroid.md §5.1/§5.4.
const BANKED = {
  extractionPts: 28_785,
  polylines: 2_045, // "~2,045" per champion-spec §5.4 item 1 (approximate in the source doc itself)
  outerTrisOff: 2_242_987, // policy='off' -- byte-identical to the E-2026-07-10-GYROID-BANDEDGE baseline
  outerTrisFanRepair: 2_242_984, // policy='fanRepair' -- -3 tris from the fan-consistency post-pass
  offHash: 'f033dbf5-b5f9fb84',
  estOutliers: 31_114,
  newtonWorst: 0.02491654414922634,
  coverageMax: 0.02531285773363981,
  nonManOffPolicy: 3,
  sampled: 2000,
  overSampled: 410,
  kneeClass: { wallBand: 0, kneeAdjacent: 410, offBand: 0 },
};

interface NativeMeta {
  hash: string | undefined;
  outerTris: number;
  fullTris: number | null;
  nonMan: number | null;
  warnings: string[];
  buildMs: number;
  dispatch: string;
}

interface FallbackBuild {
  fullTris: number;
  outerTris: number;
  hash: string;
  uBias: number;
  fullIdx: Uint32Array;
  fullUt: Float32Array;
  outerXyz: Float32Array;
  outerIdx: Uint32Array;
  buildMs: number;
}

/**
 * "Twin-fallback" construction: the region layer's OWN generic R-CDT helper
 * (buildRegionWallGridCPU) + the SAME production warp/feature-graph plumbing
 * _tierc_a2_accept.test.ts already validated, plus multiCurveCellPolicy — the one field
 * buildRegionOuterWall's public RegionBuildOpts cannot thread today (see file header FINDING).
 * NOT a new mesher/twin — reuses only already-proven, already-imported pieces; the ONLY line that
 * differs from what buildSingleRCdtRegion (tierc_regionLayer.ts) does internally is the addition
 * of `multiCurveCellPolicy: policy` to the AssemblyWallOptions object literal.
 */
function buildFallback(
  rA: (theta: number, z: number) => number,
  bandedge: ReturnType<typeof extractBandedgeContours>,
  policy: 'off' | 'forceRefine' | 'fanRepair',
): FallbackBuild {
  const t0 = Date.now();
  const { H } = TIERC_COMMON_DIMS;
  const outer = buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
  const inner = buildRegionWallGridCPU(rA, 1, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);

  const innerLines = contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner');
  const outerLines = contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer');
  const generalCurves: FeatureLine[] = [...innerLines, ...outerLines];

  // Gyroid has NO vertical-crease/horizontal-band/helical-crease lines regardless of general-curve
  // source (verified in the parent GYROID-PRODCLOSE/BANDEDGE arms) -- identity no-ops, computed via
  // the real chooseXGrid(empty) path for fidelity, matching prepareGbeTwinInputs exactly.
  const creaseChoice = chooseCreaseGrid([]);
  const creaseTChoice = chooseCreaseTGrid([]);
  const helixChoice = chooseHelixGrid(0, 0, 0);
  const creaseLines = buildCreaseRefineLines(
    { styleId: 'GyroidManifold', lines: [], groundTruthCount: 0 },
    { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
  );
  const outerEfgSampler = composedWallSampler(outer.sampler, {
    uWarp: creaseChoice.warp,
    tWarp: creaseTChoice.warp,
    helix: helixChoice.warp,
  });
  const innerEfgSampler = composedWallSampler(inner.sampler, {
    uWarp: creaseChoice.warp,
    tWarp: creaseTChoice.warp,
    helix: helixChoice.warp,
  });
  const minUniformLevel = resolveUniformLevelOverride(
    Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level),
    0,
  );
  const uBias = computeUBias(outer.sampler, generalCurves.length > 0);

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
    minUniformLevel,
    uBias,
    outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel,
    outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    outerEfgSampler,
    innerEfgSampler,
    // NO outerCurvatureFloor/outerMaxKappa -- matches the parent arm (floor decoupled, measured
    // dominated by the band-edge contour mechanism). The ONE deliberate addition vs. what
    // buildSingleRCdtRegion constructs today:
    multiCurveCellPolicy: policy,
  };

  const asm = assembleWatertight(
    outer.sampler,
    inner.sampler,
    { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN },
    assemblyOpts,
  );
  const hash = fnvHash(asm.vertices, asm.indices);
  const nV = asm.vertices.length / 3;
  const mask = new Uint8Array(nV);
  for (let j = 0; j < nV; j++) mask[j] = asm.vertices[j * 3 + 2] < 0.5 ? 1 : 0;
  const sub = extractOuterWallSubmesh(asm.vertices, asm.indices, mask);
  const outerXyz = new Float32Array(sub.vertices.length);
  for (let v = 0; v < sub.vertices.length; v += 3) {
    const u = sub.vertices[v] - Math.floor(sub.vertices[v]);
    const t = sub.vertices[v + 1];
    const theta = u * TAU;
    const z = t * H;
    const r = rA(theta, z);
    outerXyz[v] = r * Math.cos(theta);
    outerXyz[v + 1] = r * Math.sin(theta);
    outerXyz[v + 2] = z;
  }
  return {
    fullTris: asm.indices.length / 3,
    outerTris: sub.indices.length / 3,
    hash,
    uBias,
    fullIdx: asm.indices,
    fullUt: asm.vertices,
    outerXyz,
    outerIdx: sub.indices,
    buildMs: Date.now() - t0,
  };
}

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A1 -- Gyroid region-layer integration', () => {
  it(
    'buildRegionOuterWall native attempt -> multiCurveCellPolicy finding -> twin-fallback -> scoreAllGates',
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(
        heapMB,
        'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child -- relaunch with the env var exported',
      ).toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      // ── Stage 1: fresh extraction (checklist item 1, champion-spec-gyroid.md §5.4) ────────────
      const tExtract0 = Date.now();
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const polylines = bandedge.inner.decimatedContours.length + bandedge.outer.decimatedContours.length;
      crumb('extract-done', {
        ms: Date.now() - tExtract0,
        totalPts: bandedge.totalPts,
        polylines,
        maxPlacementDisp3D: bandedge.maxPlacementDisp3D,
      });

      // ── Stage 2: NATIVE attempt via buildRegionOuterWall (no policy possible -- see FINDING) ──
      let nativeMeta: NativeMeta | null = null;
      let nativeError: string | null = null;
      try {
        const tNative0 = Date.now();
        const nativeResult = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
        const nativeBuildMs = Date.now() - tNative0;
        const nativeFull = nativeResult.full;
        const nativeNonMan = nativeFull ? nonManRawBig(nativeFull.idx) : null;
        nativeMeta = {
          hash: nativeResult.meta.hash,
          outerTris: nativeResult.outer.idx.length / 3,
          fullTris: nativeFull ? nativeFull.idx.length / 3 : null,
          nonMan: nativeNonMan,
          warnings: nativeResult.meta.warnings,
          buildMs: nativeBuildMs,
          dispatch: nativeResult.meta.dispatch,
        };
        crumb('native-build-done', { ...nativeMeta });
      } catch (err) {
        nativeError = err instanceof Error ? err.message : String(err);
        crumb('native-build-THREW', { error: nativeError });
      }

      // ── Stage 3: fallback 'off'-policy verification build (self-consistency vs BANKED + native) ──
      const tOff0 = Date.now();
      const off = buildFallback(rA, bandedge, 'off');
      crumb('fallback-off-done', { ms: Date.now() - tOff0, outerTris: off.outerTris, hash: off.hash });

      // ── Stage 4: fallback 'fanRepair' build -- the mesh actually scored below ──────────────────
      const tFan0 = Date.now();
      const built = buildFallback(rA, bandedge, 'fanRepair');
      crumb('fallback-fanRepair-done', {
        ms: Date.now() - tFan0,
        outerTris: built.outerTris,
        fullTris: built.fullTris,
        hash: built.hash,
        uBias: built.uBias,
      });

      const quickNonMan = nonManRawBig(built.fullIdx);
      crumb('fallback-fanRepair-quicknonman', { nonMan: quickNonMan });

      // ── Stage 5: prescreen detail -- reused for BOTH the stratified check and scoreAllGates's
      // survivorsIn (its survivor SET is mathematically identical to the harness's own internal
      // prescreenOuterFacets -- see file header). ──────────────────────────────────────────────
      const tPre0 = Date.now();
      const preDetail = gpcPrescreenDetail(built.outerXyz, built.outerIdx, rA, H, TOL);
      const survivorsIn = Uint32Array.from(preDetail.recs.map((r) => r.f));
      crumb('prescreen-done', { ms: Date.now() - tPre0, survivors: survivorsIn.length, nFacets: preDetail.nFacets });

      // ── Stage 6: pre-registered STRATIFIED basis (champion-spec §5.2 plan, apples-to-apples vs
      // BANKED -- the harness itself has no stratified lever, see file header). ─────────────────
      const tStrat0 = Date.now();
      const strat = gpcStratifiedNewton(preDetail.recs, rA, H, TOL, {
        topExhaustive: 200,
        strata: 8,
        perStratum: 225,
      });
      crumb('stratified-done', {
        ms: Date.now() - tStrat0,
        estOutliers: strat.estOutliers,
        newtonWorst: strat.newtonWorst,
        sampled: strat.sampled,
        overSampled: strat.overSampled,
        kneeClass: strat.kneeClass,
      });
      if (strat.kneeClass.offBand > 0) {
        crumb('WARNING-offband-reappeared', { offBand: strat.kneeClass.offBand });
        // eslint-disable-next-line no-console
        console.warn(
          `[armA1] offBand=${strat.kneeClass.offBand} > 0 -- the pre-registered K3 single-midline-trap ` +
            'signature. NOT averaging away; flagged as the dominant finding in the final report.',
        );
      }

      // ── Stage 7: evaluate full-mesh xyz (real 3D, region layer's own evaluator) ────────────────
      const tEval0 = Date.now();
      const fullXyz = evaluatePackedAssemblyToXyz(built.fullUt, rA, H, AF_TWALL, AF_TBOTTOM, AF_RDRAIN);
      crumb('eval-fullxyz-done', { ms: Date.now() - tEval0, nV: fullXyz.length / 3 });

      // ── Stage 8: scoreAllGates -- the MANDATED composite-harness row ───────────────────────────
      const styleTruth: StyleTruth = {
        styleId: manifest.styleId,
        rA,
        H,
        Rb: TIERC_COMMON_DIMS.Rb,
        Rt: TIERC_COMMON_DIMS.Rt,
        expn: TIERC_COMMON_DIMS.expn,
      };
      const manifestRow = toHarnessManifest(manifest);
      const stride = Math.max(1, Math.ceil(survivorsIn.length / 1800));
      crumb('score-start', { survivors: survivorsIn.length, stride });
      const tScore0 = Date.now();
      const row = scoreAllGates(
        { full: { xyz: fullXyz, idx: built.fullIdx }, outer: { xyz: built.outerXyz, idx: built.outerIdx } },
        styleTruth,
        manifestRow,
        {
          tolMm: TOL,
          prescreen: true,
          survivorsIn,
          stride,
          breadcrumbPath: CRUMB_PATH,
          outputPath: GATES_OUT,
          runId: `armA1-Gyroid-${Date.now()}`,
        },
      );
      const scoreMs = Date.now() - tScore0;
      crumb('score-done', { scoreMs, totalMs: row.totalMs });

      // ── non-vacuity witnesses (mandatory, hard-asserted -- prereg "a row without them is VOID") ──
      expect(row.g3_watertight.nonManControlMoved).toBe(true);
      expect(row.g2_reverse.locatorSelfCheckMaxMm).not.toBeNull();
      expect(row.g2_reverse.locatorSelfCheckMaxMm as number).toBeLessThan(1e-9);

      // ── ADJUDICATION (computed + logged; NEVER tuned to pass -- prereg honesty rails) ──────────
      const outerTrisDeltaPct = ((built.outerTris - BANKED.outerTrisFanRepair) / BANKED.outerTrisFanRepair) * 100;
      const outliersDeltaPct = ((strat.estOutliers - BANKED.estOutliers) / BANKED.estOutliers) * 100;
      const newtonDeltaPct = ((strat.newtonWorst - BANKED.newtonWorst) / BANKED.newtonWorst) * 100;
      const coverageMax = row.g2_reverse.maxMm;
      const coverageDeltaPct =
        coverageMax !== null ? ((coverageMax - BANKED.coverageMax) / BANKED.coverageMax) * 100 : null;
      const kneeTotal = strat.kneeClass.wallBand + strat.kneeClass.kneeAdjacent + strat.kneeClass.offBand;
      const kneeAdjacentPct = kneeTotal > 0 ? (strat.kneeClass.kneeAdjacent / kneeTotal) * 100 : null;

      const gates = {
        outerTrisWithinBand: Math.abs(outerTrisDeltaPct) <= 5,
        outliersWithinBand: Math.abs(outliersDeltaPct) <= 15,
        newtonExact: strat.newtonWorst === BANKED.newtonWorst,
        coverageWithinBand: coverageDeltaPct !== null && Math.abs(coverageDeltaPct) <= 10,
        kneeClassClean: strat.kneeClass.offBand === 0 && strat.kneeClass.wallBand === 0,
        g4Clean: row.g4_zeroDefect.zeroAreaCount === 0 && row.g3_watertight.nonManRaw === 0,
        g3OrientationClean: row.g3_watertight.orientationMismatches === 0,
      };
      const verdict = Object.values(gates).every(Boolean) ? 'PASS' : 'FAIL';

      const summary = {
        verdict,
        gates,
        buildPath: {
          native: nativeMeta,
          nativeError,
          nativeHashMatchesBankedOff: nativeMeta?.hash === BANKED.offHash,
          fallbackOffHashMatchesBanked: off.hash === BANKED.offHash,
          nativeHashMatchesFallbackOff: nativeMeta?.hash !== undefined && nativeMeta.hash === off.hash,
          scoredPath:
            'twin-fallback (fanRepair) -- native cannot thread multiCurveCellPolicy through RegionBuildOpts, see file header FINDING',
        },
        extraction: {
          totalPts: bandedge.totalPts,
          bankedTotalPts: BANKED.extractionPts,
          polylines,
          bankedPolylines: BANKED.polylines,
          maxPlacementDisp3D: bandedge.maxPlacementDisp3D,
        },
        outer: { tris: built.outerTris, banked: BANKED.outerTrisFanRepair, deltaPct: outerTrisDeltaPct },
        stratified: {
          estOutliers: strat.estOutliers,
          banked: BANKED.estOutliers,
          deltaPct: outliersDeltaPct,
          newtonWorst: strat.newtonWorst,
          bankedNewtonWorst: BANKED.newtonWorst,
          newtonDeltaPct,
          sampled: strat.sampled,
          overSampled: strat.overSampled,
          kneeClass: strat.kneeClass,
          kneeAdjacentPct,
        },
        coverage: { max: coverageMax, banked: BANKED.coverageMax, deltaPct: coverageDeltaPct, p99: row.g2_reverse.p99Mm },
        g3g4: {
          nonManRaw: row.g3_watertight.nonManRaw,
          nonManControlMoved: row.g3_watertight.nonManControlMoved,
          orientationMismatches: row.g3_watertight.orientationMismatches,
          zeroAreaCount: row.g4_zeroDefect.zeroAreaCount,
          quickNonManOnBuild: quickNonMan,
        },
        harnessRow: {
          basis: row.g1_forward.basis,
          nFacets: row.g1_forward.nFacets,
          survivors: row.g1_forward.survivors,
          scannedFacets: row.g1_forward.scannedFacets,
          outliers: row.g1_forward.outliers,
          maxMm: row.g1_forward.maxMm,
          newtonWorstMm: row.g1_forward.newtonWorstMm,
          stride,
        },
        quality: row.quality,
        wallTimes: { scoreMs, totalMs: row.totalMs },
      };
      writeFileSync(VERDICT_PATH, JSON.stringify(summary, null, 2));
      crumb('verdict', summary);
      // eslint-disable-next-line no-console
      console.log(`[armA1] VERDICT=${verdict}\n${JSON.stringify(summary, null, 2)}`);
    },
    ARMA1_TIMEOUT_MS,
  );
});
