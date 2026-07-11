// _tierc_a2_accept.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A2 twin-scale
// acceptance run (env-gated PF_TIERC_A2=1).
//
// Design constraint #5 (the A2 prereg gate): on the full Delta2-exact production
// twin at stepMm 0.15 with multiCurveCellPolicy='forceRefine': nonManRawBig==0
// (non-vacuous, control-moved), zeroArea==0, AND fidelity unchanged within noise
// (outer tri count +/-0.5%, stratified outlier estimate +/-15%, Newton-worst
// +/-5% of the banked 0.024917) vs the ALREADY-BANKED band-edge champion numbers
// (research/exchange/_gyroid_bandedge/verdict_strat.json,
// E-2026-07-10-GYROID-BANDEDGE verdict commit 39ad7939): outerTris=2,242,987,
// estOutliers=31,114, newtonWorst=0.02491654414922634, nonManRaw=3.
//
// This file does NOT modify _gyroid_bandedge_lib.ts (a SHARED file per the
// prereg's "new-file-first" discipline) -- it reuses prepareGbeTwinInputs
// (exported, read-only) and calls assembleWatertight itself with
// multiCurveCellPolicy threaded into AssemblyWallOptions, the ONE new field this
// arm adds to the production kernel.
//
// Run (mirrors _gyroid_bandedge.test.ts's own invocation convention):
//   NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A2=1 \
//   npx vitest run research/bridge/_tierc_a2_accept.test.ts \
//   --testTimeout=3600000 --hookTimeout=600000 --pool=forks
// Heap: NODE_OPTIONS on the COMMAND LINE is REQUIRED (Vitest 4 silently ignores
// poolOptions.forks.execArgv in a config file -- banked lesson, same as the
// parent arm).
//
// DEV-ONLY. src/ never imports research/. Artifacts gitignored (research/.gitignore
// has `exchange/`); numbers inlined in the agent's final report at close.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import {
  GBE_FIELD,
  GPC_DIMS,
  GPC_STYLE,
  auditWatertight,
  classifyNonManLoci,
  gbeBreadcrumb,
  gpcHeapLimitMB,
  gpcPrescreenDetail,
  gpcScoreCoverage,
  gpcStratifiedNewton,
  prepareGbeTwinInputs,
  zeroAreaCount,
  type BandedgeExtraction,
} from './_gyroid_bandedge_lib';
import { GPC_RDRAIN, GPC_TBOTTOM } from './_gyroid_prodclose_lib';
import { AF_PROD_OPTS, fnvHash } from './_analytic_floor_lib';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { extractOuterWallSubmesh } from '../../src/fidelity/metrics';
import type { Contour } from './_gyroidContourLib';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_A2 === '1';
const POLICY = ((): 'forceRefine' | 'fanRepair' => {
  const p = process.env.PF_TIERC_A2_POLICY;
  return p === 'fanRepair' ? 'fanRepair' : 'forceRefine';
})();
const STEP = Number(process.env.PF_TIERC_A2_STEP ?? 0.15);
const TOL = 0.01;
// Reuse the PARENT arm's banked Stage-E contours -- no re-extraction needed.
const GBE_ROOT = join('research', 'exchange', '_gyroid_bandedge');
const SUFFIX = STEP === 0.15 ? '' : `_s${STEP}`;
const CONTOURS_FILE = join(GBE_ROOT, `contours_bandedge${SUFFIX}.json`);
const OUT_ROOT = join('research', 'exchange', '_tierc_a2_accept');
const ROWS = join(OUT_ROOT, 'rows.ndjson');

// The already-banked E-2026-07-10-GYROID-BANDEDGE champion numbers this arm's
// policy must stay within noise of (verdict_strat.json, step 0.15). Also the
// exact off-policy hash this file's OWN (independent) twin-build wiring must
// reproduce before its forceRefine/fanRepair comparison can be trusted.
const BANKED = {
  outerTris: 2_242_987,
  estOutliers: 31_114,
  newtonWorst: 0.02491654414922634,
  coverageMax: 0.02531285773363981,
  nonManRaw: 3,
  offHash: 'f033dbf5-b5f9fb84',
};

interface StoredContours {
  wallIsolevels: BandedgeExtraction['wallIsolevels'];
  inner: { c: number; label: string; contours: Contour[]; placement: BandedgeExtraction['inner']['placement'] };
  outer: { c: number; label: string; contours: Contour[]; placement: BandedgeExtraction['outer']['placement'] };
  totalPts: number;
  maxPlacementDisp3D: number;
  at: string;
}

/** Load a banked Stage-E contours file back into the BandedgeExtraction shape
 *  (mirrors _gyroid_bandedge.test.ts's own loadBandedge -- not exported there,
 *  so re-derived here rather than reaching into a test file). */
function loadBandedge(file: string): BandedgeExtraction {
  const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredContours;
  const lift = (s: StoredContours['inner']): BandedgeExtraction['inner'] => ({
    c: s.c,
    label: s.label,
    rawSegs: 0,
    rawContours: s.contours.length,
    rawPts: 0,
    keptPts: 0,
    droppedPts: 0,
    decimatedContours: s.contours,
    decimatedPtCount: s.contours.reduce((n, c) => n + c.pts.length, 0),
    placement: s.placement,
    ms: 0,
  });
  return {
    inner: lift(stored.inner),
    outer: lift(stored.outer),
    wallIsolevels: stored.wallIsolevels,
    totalPts: stored.totalPts,
    maxPlacementDisp3D: stored.maxPlacementDisp3D,
    ms: 0,
  };
}

function heapGate(): number {
  const heapMB = gpcHeapLimitMB();
  expect(
    heapMB,
    'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child -- relaunch with the env var exported',
  ).toBeGreaterThanOrEqual(8192);
  return heapMB;
}

interface TwinResult {
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
 * Build the twin with an EXPLICIT multiCurveCellPolicy -- the one new lever
 * this arm adds. Mirrors _gyroid_bandedge_lib.ts's buildGbeTwin exactly (same
 * production config: 128^2 sizing, featureLevel 11, no curvature floor) except
 * for that one field, reusing prepareGbeTwinInputs (exported, read-only)
 * rather than duplicating its logic. Does NOT edit the shared lib file --
 * new-file-first per the program's shared-file discipline.
 */
function buildA2Twin(
  bandedge: BandedgeExtraction,
  policy: 'off' | 'forceRefine' | 'fanRepair',
): TwinResult {
  const t0 = Date.now();
  const { H } = GPC_DIMS;
  const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);
  const inp = prepareGbeTwinInputs(bandedge);
  const uBias = computeUBias(inp.outerSampler, inp.hasFeatures);
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
    minUniformLevel: inp.minUniformLevel,
    uBias,
    outerFeatureLines: inp.generalCurves.length > 0 ? inp.generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel,
    outerCreaseLines: inp.creaseLines.length > 0 ? inp.creaseLines : undefined,
    outerEfgSampler: inp.outerEfgSampler,
    innerEfgSampler: inp.innerEfgSampler,
    // NO outerCurvatureFloor/outerMaxKappa -- matches the parent arm (floor
    // decoupled, measured dominated by the band-edge contour mechanism).
    multiCurveCellPolicy: policy,
  };
  const asm = assembleWatertight(
    inp.outerSampler,
    inp.innerSampler,
    { H, tBottom: GPC_TBOTTOM, rDrain: GPC_RDRAIN },
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

describe('E-2026-07-11-TIERC-HEADTOHEAD Arm A2 -- multiCurveCellPolicy twin acceptance', () => {
  it.skipIf(!ON)(`${GPC_STYLE}: ${POLICY} acceptance @ step=${STEP}`, () => {
    mkdirSync(OUT_ROOT, { recursive: true });
    const heapMB = heapGate();
    gbeBreadcrumb(`[A2] heapLimitMB=${heapMB} pid=${process.pid} step=${STEP} policy=${POLICY}`);
    if (!existsSync(CONTOURS_FILE)) {
      throw new Error(
        `Arm A2 requires the parent arm's banked Stage-E contours at ${CONTOURS_FILE} ` +
          '(already committed from E-2026-07-10-GYROID-BANDEDGE) -- none found.',
      );
    }
    const bandedge = loadBandedge(CONTOURS_FILE);
    const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);

    // (0) VERIFICATION build: policy='off' must byte-match the ALREADY-BANKED
    // hash -- proves this file's OWN twin-build wiring (a deliberate non-edit
    // of the shared _gyroid_bandedge_lib.ts) is faithful before the policy
    // comparison below is trusted.
    const tOff = Date.now();
    const off = buildA2Twin(bandedge, 'off');
    gbeBreadcrumb(
      `[A2] off-policy verification build DONE outerTris=${off.outerTris} hash=${off.hash} (${Date.now() - tOff}ms)`,
    );
    expect(
      off.hash,
      "policy='off' must byte-match the banked E-2026-07-10-GYROID-BANDEDGE hash -- " +
        "this file's own harness must be faithful before trusting the policy comparison",
    ).toBe(BANKED.offHash);

    // (1) TEST build: the policy under test.
    const tPolicy = Date.now();
    const built = buildA2Twin(bandedge, POLICY);
    gbeBreadcrumb(
      `[A2] ${POLICY} build DONE outerTris=${built.outerTris} hash=${built.hash} (${Date.now() - tPolicy}ms)`,
    );

    const audit = auditWatertight(built.fullIdx);
    const zeroArea = zeroAreaCount(built.outerXyz, built.outerIdx);
    gbeBreadcrumb(`[A2] audit nonMan=${audit.nonMan} controlMoved=${audit.controlMoved} zeroArea=${zeroArea}`);

    let loci: ReturnType<typeof classifyNonManLoci> = [];
    if (audit.nonMan > 0) {
      loci = classifyNonManLoci(built, bandedge, GBE_FIELD);
      writeFileSync(join(OUT_ROOT, `nonman_loci_${POLICY}${SUFFIX}.json`), JSON.stringify(loci, null, 2));
      for (const L of loci) {
        console.log(
          `[A2] RESIDUAL LOCUS edge(${L.a},${L.b}) mult=${L.mult} ` +
            `aUt=(${L.aUt[0].toFixed(6)},${L.aUt[1].toFixed(6)}) bUt=(${L.bUt[0].toFixed(6)},${L.bUt[1].toFixed(6)}) ` +
            `mid|val|=${L.midAbsVal.toFixed(5)} dEdgeIso=${L.dEdgeIso.toFixed(5)}`,
        );
      }
    }

    const preDetail = gpcPrescreenDetail(built.outerXyz, built.outerIdx, rA, GPC_DIMS.H, TOL);
    const strat = gpcStratifiedNewton(preDetail.recs, rA, GPC_DIMS.H, TOL, {
      topExhaustive: 200,
      strata: 8,
      perStratum: 225,
    });
    const cov = gpcScoreCoverage(built.outerXyz, built.outerIdx, rA, GPC_DIMS.H, TOL);

    const row = {
      step: STEP,
      policy: POLICY,
      at: new Date().toISOString(),
      offVerification: { outerTris: off.outerTris, hash: off.hash },
      built: {
        outerTris: built.outerTris,
        fullTris: built.fullTris,
        hash: built.hash,
        uBias: built.uBias,
        buildMs: built.buildMs,
      },
      audit,
      zeroArea,
      loci,
      prescreen: { survivors: preDetail.recs.length, nFacets: preDetail.nFacets },
      stratified: {
        estOutliers: strat.estOutliers,
        newtonWorst: strat.newtonWorst,
        sampled: strat.sampled,
        overSampled: strat.overSampled,
        kneeClass: strat.kneeClass,
      },
      coverage: { max: cov.max, p99: cov.p99, locSelfCheckMax: cov.locSelfCheckMax },
      banked: BANKED,
    };
    appendFileSync(ROWS, JSON.stringify(row) + '\n');
    writeFileSync(join(OUT_ROOT, `verdict_${POLICY}${SUFFIX}.json`), JSON.stringify(row, null, 2));

    const outerTrisDeltaPct = (Math.abs(built.outerTris - BANKED.outerTris) / BANKED.outerTris) * 100;
    const outliersDeltaPct = (Math.abs(strat.estOutliers - BANKED.estOutliers) / BANKED.estOutliers) * 100;
    const newtonDeltaPct = (Math.abs(strat.newtonWorst - BANKED.newtonWorst) / BANKED.newtonWorst) * 100;
    console.log(
      `[A2] VERDICT policy=${POLICY} step=${STEP}: nonManRaw=${audit.nonMan} (controlMoved=${audit.controlMoved}) zeroArea=${zeroArea} | ` +
        `outerTris=${built.outerTris} (banked ${BANKED.outerTris}, delta ${outerTrisDeltaPct.toFixed(2)}%, gate <=0.5%) | ` +
        `estOutliers=${strat.estOutliers} (banked ${BANKED.estOutliers}, delta ${outliersDeltaPct.toFixed(2)}%, gate <=15%) | ` +
        `newtonWorst=${strat.newtonWorst.toFixed(6)} (banked ${BANKED.newtonWorst.toFixed(6)}, delta ${newtonDeltaPct.toFixed(2)}%, gate <=5%) | ` +
        `coverageMax=${cov.max.toFixed(4)} (banked ${BANKED.coverageMax.toFixed(4)})`,
    );

    // Report-shaped for the acceptance numbers themselves (nonMan==0, zeroArea==0,
    // the three +/-tolerance fidelity bands) -- adjudicated in the agent's final
    // report against this row's printed numbers, mirroring the parent arm's own
    // Stage V discipline (no hard assert on a judgment-call verdict). The
    // MANDATORY hygiene gates (non-vacuity, locator self-check) are hard asserts,
    // matching every other probe in this program.
    expect(audit.controlMoved, 'nonManRawBig control must move (non-vacuous)').toBe(true);
    expect(cov.locSelfCheckMax).toBeLessThan(1e-9);
  }, 3_600_000);
});
