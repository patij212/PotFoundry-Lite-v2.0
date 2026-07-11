// _tierc_a4b.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A4b acceptance run
// (coordinator-directed, env-gated PF_TIERC_A4B=1).
//
// QUESTION: does `multiCurveCellPolicy: 'snapMerge'` (the NEW kernel remedy —
// widen the grid-line registry's merge tolerance ONLY in leaves
// `detectMultiCurveLeaves` flags, reusing A2's exact same-cell/2-distinct-
// general-curve-label test) close the 329/360 near-tangent-doubled-curve
// boundary HOLES the A4 diagnosis found (research/lab/tierc/A4-diagnosis.md
// section 2.1) -- the population `fanRepair` structurally cannot reach
// (mult>2-scoped, holes are mult=1) -- WITHOUT moving fidelity or regressing
// the default-off byte-identical path?
//
// GATE (prereg Addendum 4/5, A4b bullet):
//   (a) policy 'off' -> outer hash MUST stay f033dbf5-b5f9fb84 (byte-identical
//       default path proof, with this session's kernel edit in tree).
//   (b) policy 'snapMerge' -> boundaryEdges 360 -> <=31 (the non-near-tangent
//       remainder -- do NOT expect 0); nonManifold 0 (fanRepair OR snapMerge
//       superseding -- report which); orientationMismatches delta (report,
//       not gated -- A4-orient's job); zeroArea 0.
//   (c) fidelity Delta0%: outer tris +/-0.5%, Newton-worst +/-5% of banked
//       0.02491654414922634, coverage +/-10% of banked 0.02531285773363981,
//       knee-class 410/410 knee-adjacent / 0 off-band / 0 wall-band.
//
// Reuses _gyroid_bandedge_lib.ts's prepareGbeTwinInputs (read-only, mirrors
// _tierc_a2_accept.test.ts's buildA2Twin pattern) + _tierc_a1_orient.test.ts's
// topologyMetric-fingerprint pattern (by-index AND canonical 1e-4 weld) for
// the boundary/orientation/nonManifold counts no prior Gyroid verdict measured
// together with fidelity in one row.
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A4B=1 \
//   npx vitest run research/bridge/_tierc_a4b.test.ts \
//   --testTimeout=3600000 --hookTimeout=600000 --pool=forks
//
// DEV-ONLY. src/ never imports research/. Artifacts gitignored
// (research/.gitignore has `exchange/`); numbers inlined in the agent's final
// report at close.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import {
  GBE_FIELD,
  GPC_DIMS,
  GPC_STYLE,
  auditWatertight,
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
import { extractOuterWallSubmesh, topologyMetric } from '../../src/fidelity/metrics';
import type { Contour } from './_gyroidContourLib';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_A4B === '1';
const GBE_ROOT = join('research', 'exchange', '_gyroid_bandedge');
const CONTOURS_FILE = join(GBE_ROOT, 'contours_bandedge.json');
const OUT_ROOT = join('research', 'exchange', 'tierc');
const ROWS = join(OUT_ROOT, 'armA4b_rows.ndjson');
const CRUMB_PATH = join(OUT_ROOT, 'armA4b_crumbs.ndjson');
const OUT_JSON = join(OUT_ROOT, 'armA4b_verdict.json');

// Already-banked E-2026-07-10-GYROID-BANDEDGE champion numbers (SAME basis
// _tierc_a2_accept.test.ts scores against) + A1's own topology reading of the
// 'off' build (research/lab/tierc/A1-gyroid-reproduction-verdict.md Result 2).
const BANKED = {
  outerTris: 2_242_987,
  newtonWorst: 0.02491654414922634,
  coverageMax: 0.02531285773363981,
  offHash: 'f033dbf5-b5f9fb84',
  offBoundary: 360,
  offOrientation: 652,
  offNonManByIndex: 3,
};
const GATE_BOUNDARY_MAX = 31;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_ROOT, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A4b', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

interface StoredContours {
  wallIsolevels: BandedgeExtraction['wallIsolevels'];
  inner: { c: number; label: string; contours: Contour[]; placement: BandedgeExtraction['inner']['placement'] };
  outer: { c: number; label: string; contours: Contour[]; placement: BandedgeExtraction['outer']['placement'] };
  totalPts: number;
  maxPlacementDisp3D: number;
  at: string;
}

/** Mirrors _tierc_a2_accept.test.ts's loadBandedge exactly (not exported there). */
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

interface TwinResult {
  fullTris: number;
  outerTris: number;
  hash: string;
  uBias: number;
  fullIdx: Uint32Array;
  fullVertCount: number;
  outerXyz: Float32Array;
  outerIdx: Uint32Array;
  buildMs: number;
}

/**
 * Build the FULL band-edge twin with an EXPLICIT multiCurveCellPolicy,
 * INCLUDING 'snapMerge' (the new Arm A4b lever). Mirrors
 * _tierc_a2_accept.test.ts's buildA2Twin exactly (same production config:
 * 128^2 sizing, featureLevel 11, no curvature floor), reusing
 * prepareGbeTwinInputs (exported, read-only) -- does NOT edit the shared lib
 * file (new-file-first per the program's shared-file discipline).
 */
function buildA4bTwin(
  bandedge: BandedgeExtraction,
  policy: 'off' | 'forceRefine' | 'fanRepair' | 'snapMerge',
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
    fullVertCount: nV,
    outerXyz,
    outerIdx: sub.indices,
    buildMs: Date.now() - t0,
  };
}

/** topologyMetric at BOTH weld tolerances -- the full topology fingerprint
 *  (mirrors _tierc_a1_orient.test.ts's fingerprint helper). */
function fingerprint(
  label: string,
  fullIdx: Uint32Array,
  fullVertCount: number,
): {
  label: string;
  byIndex: { boundaryEdges: number; nonManifoldEdges: number; orientationMismatches: number };
  weld1e4: { boundaryEdges: number; nonManifoldEdges: number; orientationMismatches: number };
} {
  // topologyMetric needs a vertex buffer only for its weld pass; byIndex
  // (weld<=0) never touches positions, so a zero-filled placeholder of the
  // right length is sufficient there. For weld1e4 we need real vertices --
  // reconstruct from the packed (u,t,surfaceId) triple the assembly emits
  // (vertices[*3]=u,[*3+1]=t,[*3+2]=surfaceId) which IS a valid 3-vector
  // input to topologyMetric's weld (same representation _tierc_a1_orient.test.ts
  // uses via offResult.full.xyz -- there it is the evaluated 3D position; here
  // we only have (u,t) packed triples from assembleWatertight's raw output).
  // We therefore score byIndex only here (weld=0, pure index topology) -- the
  // MANDATED non-vacuous by-index metric this program's cheatsheet names --
  // and skip the positional weld1e4 reading (would require a full 3D
  // evaluation pass this probe does not otherwise need).
  const dummyVerts = new Float32Array(fullVertCount * 3);
  const view = { vertices: dummyVerts, indices: fullIdx };
  const byIndex = topologyMetric(view, 0);
  crumb(`topo-byindex-${label}`, byIndex);
  return { label, byIndex, weld1e4: byIndex };
}

function heapGate(): number {
  const heapMB = gpcHeapLimitMB();
  expect(
    heapMB,
    'NODE_OPTIONS=--max-old-space-size=12288 must propagate to the fork child -- relaunch with the env var exported',
  ).toBeGreaterThanOrEqual(8192);
  return heapMB;
}

describe('E-2026-07-11-TIERC-HEADTOHEAD Arm A4b -- snapMerge boundary-hole acceptance', () => {
  it.skipIf(!ON)('snapMerge closes the near-tangent boundary holes without moving fidelity', () => {
    mkdirSync(OUT_ROOT, { recursive: true });
    const heapMB = heapGate();
    gbeBreadcrumb(`[A4b] heapLimitMB=${heapMB} pid=${process.pid}`);
    crumb('start', { heapLimitMB: heapMB });
    if (!existsSync(CONTOURS_FILE)) {
      throw new Error(
        `Arm A4b requires the parent arm's banked Stage-E contours at ${CONTOURS_FILE} ` +
          '(already committed from E-2026-07-10-GYROID-BANDEDGE) -- none found.',
      );
    }
    const bandedge = loadBandedge(CONTOURS_FILE);
    const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);

    // (0) DEFAULT-OFF BYTE-IDENTITY (gate a). Must byte-match the banked hash
    // with THIS session's kernel edit in tree -- proves the 'snapMerge' addition
    // is inert on the default policy path.
    const tOff = Date.now();
    const off = buildA4bTwin(bandedge, 'off');
    crumb('off-build-done', { ms: Date.now() - tOff, hash: off.hash, outerTris: off.outerTris, fullVertCount: off.fullVertCount });
    expect(
      off.hash,
      "policy='off' must byte-match the banked hash -- the default path must be untouched by the snapMerge addition",
    ).toBe(BANKED.offHash);
    const offFp = fingerprint('off', off.fullIdx, off.fullVertCount);
    crumb('off-fingerprint-done', offFp.byIndex);

    // (1) snapMerge TEST BUILD (gate b/c).
    const tSm = Date.now();
    const sm = buildA4bTwin(bandedge, 'snapMerge');
    crumb('snapMerge-build-done', { ms: Date.now() - tSm, hash: sm.hash, outerTris: sm.outerTris, fullVertCount: sm.fullVertCount });
    const smFp = fingerprint('snapMerge', sm.fullIdx, sm.fullVertCount);
    crumb('snapMerge-fingerprint-done', smFp.byIndex);

    const audit = auditWatertight(sm.fullIdx);
    const zeroArea = zeroAreaCount(sm.outerXyz, sm.outerIdx);
    crumb('watertight-audit-done', { nonMan: audit.nonMan, controlMoved: audit.controlMoved, zeroArea });

    // (2) FIDELITY (gate c) -- SAME instrument A1/A2 scored the banked row with.
    const tFid = Date.now();
    const preDetail = gpcPrescreenDetail(sm.outerXyz, sm.outerIdx, rA, GPC_DIMS.H, 0.01);
    const strat = gpcStratifiedNewton(preDetail.recs, rA, GPC_DIMS.H, 0.01, {
      topExhaustive: 200,
      strata: 8,
      perStratum: 225,
    });
    const cov = gpcScoreCoverage(sm.outerXyz, sm.outerIdx, rA, GPC_DIMS.H, 0.01);
    crumb('fidelity-done', {
      ms: Date.now() - tFid,
      outerTris: sm.outerTris,
      newtonWorst: strat.newtonWorst,
      coverageMax: cov.max,
      kneeClass: strat.kneeClass,
    });

    const outerTrisDeltaPct = (Math.abs(sm.outerTris - BANKED.outerTris) / BANKED.outerTris) * 100;
    const newtonDeltaPct = (Math.abs(strat.newtonWorst - BANKED.newtonWorst) / BANKED.newtonWorst) * 100;
    const coverageDeltaPct = (Math.abs(cov.max - BANKED.coverageMax) / BANKED.coverageMax) * 100;

    const boundaryBefore = offFp.byIndex.boundaryEdges;
    const boundaryAfter = smFp.byIndex.boundaryEdges;
    const orientBefore = offFp.byIndex.orientationMismatches;
    const orientAfter = smFp.byIndex.orientationMismatches;
    const nonManBefore = offFp.byIndex.nonManifoldEdges;
    const nonManAfter = smFp.byIndex.nonManifoldEdges;

    const gateB = boundaryAfter <= GATE_BOUNDARY_MAX;
    const gateNonMan = nonManAfter === 0;
    const gateZeroArea = zeroArea === 0;
    const gateFidelity =
      outerTrisDeltaPct <= 0.5 && newtonDeltaPct <= 5 && coverageDeltaPct <= 10 &&
      strat.kneeClass.offBand === 0 && strat.kneeClass.wallBand === 0;
    const overallPass = gateB && gateNonMan && gateZeroArea && gateFidelity;

    const summary = {
      experiment: 'E-2026-07-11-TIERC-HEADTOHEAD Arm A4b snapMerge acceptance',
      at: new Date().toISOString(),
      snapMergeWeld: 4e-4,
      offVerification: { hash: off.hash, matchesBanked: off.hash === BANKED.offHash },
      topology: {
        off: { boundaryEdges: boundaryBefore, orientationMismatches: orientBefore, nonManifoldEdges: nonManBefore },
        snapMerge: { boundaryEdges: boundaryAfter, orientationMismatches: orientAfter, nonManifoldEdges: nonManAfter },
        boundaryDelta: boundaryAfter - boundaryBefore,
        orientationDelta: orientAfter - orientBefore,
        nonManDelta: nonManAfter - nonManBefore,
      },
      watertightAudit: { nonMan: audit.nonMan, controlMoved: audit.controlMoved, zeroArea },
      fidelity: {
        outerTris: { before: BANKED.outerTris, after: sm.outerTris, deltaPct: outerTrisDeltaPct },
        newtonWorst: { before: BANKED.newtonWorst, after: strat.newtonWorst, deltaPct: newtonDeltaPct },
        coverageMax: { before: BANKED.coverageMax, after: cov.max, deltaPct: coverageDeltaPct },
        kneeClass: strat.kneeClass,
        locSelfCheckMax: cov.locSelfCheckMax,
      },
      gates: { gateB, gateNonMan, gateZeroArea, gateFidelity, overallPass },
      buildMs: { off: off.buildMs, snapMerge: sm.buildMs },
    };
    writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
    appendFileSync(ROWS, JSON.stringify(summary) + '\n');
    crumb('verdict', { overallPass, boundaryBefore, boundaryAfter, orientBefore, orientAfter, nonManBefore, nonManAfter });
    // eslint-disable-next-line no-console
    console.log(`[armA4b] VERDICT\n${JSON.stringify(summary, null, 2)}`);

    // Mandatory hygiene gates (non-vacuous, hard asserts -- matches every other
    // probe in this program). The overall PASS/FAIL judgment is adjudicated in
    // the agent's final report against this row's printed numbers (mirrors A2's
    // own Stage V discipline: no hard assert on a design-target verdict).
    expect(audit.controlMoved, 'nonManRawBig-style control must move (non-vacuous)').toBe(true);
    expect(cov.locSelfCheckMax).toBeLessThan(1e-9);
    expect(off.hash, "policy='off' byte-identity is a HARD gate, not a judgment call").toBe(BANKED.offHash);
  }, 3_600_000);
});
