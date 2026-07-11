// _tierc_armD_run2.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm D SCORED RUN 2 (coordinator-directed
// re-run after the run-1 evaluator-bug fix; adjudicated under Prereg ADDENDUM 2, commit 5f4a959e).
//
// Run 1 (research/bridge/_tierc_armD.test.ts, row armD-FourierBloom-1783776573731) FAILED its
// quality-parity sub-criterion; the coordinator-adjudicated diagnosis
// (research/lab/tierc/armD-quality-diagnosis.md) found the miss was NOISE: round1 reporting
// quantization stacked on a twin evaluator bug (double-applied inner-wall z-mapping,
// evaluatePackedAssemblyToXyz — FIXED in tierc_regionLayer.ts with a pinned regression test). The
// run-1 FAIL row stands as recorded; THIS file is the LABELED run 2 — a NEW file, not an edit of
// run 1, per the prereg honesty rail ("Any config/tolerance change after first scored run = a new
// labeled arm, never an edit").
//
// RUN LABELING: the GatesRow schema is read-only for this arm (tierc_gatesHarness.ts untouched), so
// run 2 is encoded IN THE runId — `armD-run2-FourierBloom-<ts>` — not as a new row field. Crumbs
// carry an explicit run:2 field (the crumb writer is this file's own).
//
// ADJUDICATION (Addendum 2): PRIMARY criterion = SAME-PROVENANCE parity — for the smooth control,
// packed-assembly HASH IDENTITY between the region-layer build and a direct assembleWatertight twin
// build (replicated in-run from the exported building blocks; the same replication the diagnosis
// probe validated). expect()-ASSERTED, per the coordinator ("assert it in the run"). Also asserted:
// identity with run 1's recorded build fingerprint (bf78f51f-693eeace) — the evaluator fix touches
// only post-assembly 3D evaluation, so the packed assembly must be byte-identical to run 1's.
// FALLBACK numbers (unrounded pctBelow10/20/30 vs the captured production artifact, computed fresh
// in-run on both meshes with metrics.ts-identical math) are REPORTED for the record with Addendum
// 2's grounded tolerances (not worse by >0.1pp at 20°, >0.05pp at 10°, no new sub-5° mass beyond
// +0.01pp of population) — reported, not gating, when the primary criterion passes.
// Hard gates (G1 outliers 0, G2 max<=tol, G3 nonMan 0 + orientation clean, G4 zeros, G7 closed,
// outer tris ±5% of production) are computed and logged exactly as run 1 did.
//
// Env-gated: PF_TIERC_ARMD=1 (the coordinator-specified env; scoped to THIS file by its own config).
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_ARMD=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_armD_run2.config.ts
//
// DEV-ONLY. research/ never imported by src/. Node-only.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall, buildRegionWallGridCPU, toHarnessManifest } from './tierc_regionLayer';
import { scoreAllGates, type BinMesh, type StyleTruth } from './tierc_gatesHarness';
import { loadBinMesh } from './_pf_bvhRuler';
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

const ON = process.env.PF_TIERC_ARMD === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const OUT = join(OUT_DIR, 'gates.ndjson');
const CRUMB_PATH = join(OUT_DIR, 'armD_crumbs.ndjson');
const CAPTURE_DIR = join('research', 'exchange', '_prod_truth', 'FourierBloom');
const RUN1_HASH = 'bf78f51f-693eeace'; // armD_crumbs.ndjson run-1 stage:"build-done"
const ARMD_TIMEOUT_MS = 45 * 60 * 1000;

// Baselines (identical sources to run 1): captured production artifact counts
// (research/exchange/_prod_truth/FourierBloom/meta.json) + Addendum 2 fallback tolerances.
const BASELINE_OUTER_TRIS = 1_278_510;
const BASELINE_FULL_TRIS = 3_143_106;
const OUTER_TOL_FRAC = 0.05;
const FALLBACK_TOL_PP_20 = 0.1;
const FALLBACK_TOL_PP_10 = 0.05;
const FALLBACK_TOL_PP_SUB5 = 0.01;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({
        arm: 'D',
        run: 2,
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

// ── metrics.ts-identical min-angle math for the UNROUNDED fallback numbers (same replication the
// diagnosis probe validated against the scored rows — see _tierc_armD_qualdiag.test.ts header). ──
function lawOfCosines(adj1: number, adj2: number, opp: number): number {
  if (adj1 <= 0 || adj2 <= 0) return 0;
  let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
  if (cos > 1) cos = 1;
  if (cos < -1) cos = -1;
  return (Math.acos(cos) * 180) / Math.PI;
}

interface UnroundedQuality {
  good: number;
  degenerate: number;
  below5: number;
  below10: number;
  below20: number;
  below30: number;
  pctBelow5: number;
  pctBelow10: number;
  pctBelow20: number;
  pctBelow30: number;
}

function unroundedQuality(mesh: BinMesh): UnroundedQuality {
  const { xyz, idx } = mesh;
  const nF = idx.length / 3;
  let good = 0;
  let degenerate = 0;
  let below5 = 0;
  let below10 = 0;
  let below20 = 0;
  let below30 = 0;
  for (let t = 0; t < nF; t++) {
    const ia = idx[3 * t] * 3, ib = idx[3 * t + 1] * 3, ic = idx[3 * t + 2] * 3;
    const ax = xyz[ia], ay = xyz[ia + 1], az = xyz[ia + 2];
    const bx = xyz[ib], by = xyz[ib + 1], bz = xyz[ib + 2];
    const cx = xyz[ic], cy = xyz[ic + 1], cz = xyz[ic + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const area = 0.5 * Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx);
    if (area <= 1e-12) {
      degenerate++;
      continue;
    }
    const ab2 = abx * abx + aby * aby + abz * abz;
    const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
    const bc2 = bcx * bcx + bcy * bcy + bcz * bcz;
    const ca2 = acx * acx + acy * acy + acz * acz;
    const a = Math.sqrt(bc2), b = Math.sqrt(ca2), c = Math.sqrt(ab2);
    const ang = Math.min(lawOfCosines(b, c, a), lawOfCosines(a, c, b), lawOfCosines(a, b, c));
    good++;
    if (ang < 5) below5++;
    if (ang < 10) below10++;
    if (ang < 20) below20++;
    if (ang < 30) below30++;
  }
  return {
    good, degenerate, below5, below10, below20, below30,
    pctBelow5: (below5 / good) * 100,
    pctBelow10: (below10 / good) * 100,
    pctBelow20: (below20 / good) * 100,
    pctBelow30: (below30 / good) * 100,
  };
}

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm D RUN 2 — FourierBloom, Addendum-2 adjudication', () => {
  it(
    'buildRegionOuterWall (fixed evaluator) -> hash-identity primary + scoreAllGates + unrounded fallback',
    () => {
      crumb('start', { heapLimitMB: heapLimitMB() });

      // ── Build through the region layer (identical call to run 1; evaluator now fixed). ──────────
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
        `[armD run2] build DONE in ${(buildMs / 1000).toFixed(1)}s: outer=${result.outer.idx.length / 3} ` +
          `full=${result.full ? result.full.idx.length / 3 : 'MISSING'} tris, hash=${result.meta.hash}`,
      );
      expect(result.full).toBeDefined();

      // ── PRIMARY (Addendum 2): same-provenance packed-assembly hash identity, ASSERTED. ──────────
      // Direct twin build — an independent call site composing the same exported blocks (the
      // replication the diagnosis probe validated against run 1's fingerprint).
      const rA = manifest.truth.rA;
      const dims = TIERC_COMMON_DIMS;
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
        resU: 128,
        resT: 128,
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
          uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
        }),
        innerEfgSampler: composedWallSampler(innerGrid.sampler, {
          uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
        }),
      };
      const directAsm = assembleWatertight(
        outerGrid.sampler,
        innerGrid.sampler,
        { H: dims.H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN },
        assemblyOpts,
      );
      const directHash = fnvHash(directAsm.vertices, directAsm.indices);
      const hashIdentity = result.meta.hash === directHash;
      const hashMatchesRun1 = result.meta.hash === RUN1_HASH;
      crumb('primary-hash-identity', {
        regionLayerHash: result.meta.hash,
        directTwinHash: directHash,
        run1Hash: RUN1_HASH,
        hashIdentity,
        hashMatchesRun1,
        directTwinMs: Date.now() - tTwin0,
      });
      console.log(
        `[armD run2] PRIMARY same-provenance: regionLayer=${result.meta.hash} directTwin=${directHash} ` +
          `run1=${RUN1_HASH} -> identity=${hashIdentity} matchesRun1=${hashMatchesRun1}`,
      );
      expect(result.meta.hash).toBe(directHash); // Addendum 2 PRIMARY criterion (asserted per coordinator)
      expect(result.meta.hash).toBe(RUN1_HASH); // evaluator fix must not change the packed assembly

      // ── Score (identical config to run 1: production defaults, prescreen on, stride 1). ─────────
      const styleTruth: StyleTruth = {
        styleId: manifest.styleId,
        rA,
        H: dims.H,
        Rb: dims.Rb,
        Rt: dims.Rt,
        expn: dims.expn,
      };
      crumb('score-start');
      const tScore0 = Date.now();
      const row = scoreAllGates(
        { full: result.full!, outer: result.outer },
        styleTruth,
        toHarnessManifest(manifest),
        {
          tolMm: 0.01,
          breadcrumbPath: CRUMB_PATH,
          outputPath: OUT,
          runId: `armD-run2-FourierBloom-${Date.now()}`,
        },
      );
      const scoreMs = Date.now() - tScore0;
      crumb('score-done', { scoreMs, totalMs: row.totalMs });
      console.log(
        `[armD run2] score DONE in ${(scoreMs / 1000).toFixed(1)}s: g1 outliers=${row.g1_forward.outliers} ` +
          `maxMm=${row.g1_forward.maxMm} | g2 coverageMax=${row.g2_reverse.maxMm ?? 'n/a'} | ` +
          `g3 nonMan=${row.g3_watertight.nonManRaw ?? 'n/a'} orient=${row.g3_watertight.orientationMismatches ?? 'n/a'} ` +
          `signedVol=${row.g3_watertight.signedVolumeMm3 ?? 'n/a'} | ` +
          `g4 zeroArea=${row.g4_zeroDefect.zeroAreaCount ?? 'n/a'} | g7 bnd=${row.g7_assembly.wholeMeshBoundaryEdges ?? 'n/a'} | ` +
          `quality p5=${row.quality.p5MinAngleDeg} %<20=${row.quality.pctBelow20}`,
      );

      // Instrument non-vacuity witnesses (mandatory; hygiene, not verdict — same as run 1).
      expect(row.g3_watertight.nonManControlMoved).toBe(true);
      expect(row.g2_reverse.locatorSelfCheckMaxMm).not.toBeNull();
      expect(row.g2_reverse.locatorSelfCheckMaxMm as number).toBeLessThan(1e-9);

      // ── FALLBACK numbers for the record (Addendum 2): unrounded, computed fresh on both meshes. ─
      crumb('fallback-quality-start');
      const captured = loadBinMesh(join(CAPTURE_DIR, 'full.xyz.bin'), join(CAPTURE_DIR, 'full.idx.bin'));
      const qCaptured = unroundedQuality(captured);
      const qRun2 = unroundedQuality(result.full!);
      const fallback = {
        pctBelow20DeltaPp: qRun2.pctBelow20 - qCaptured.pctBelow20,
        pctBelow10DeltaPp: qRun2.pctBelow10 - qCaptured.pctBelow10,
        sub5DeltaPp: qRun2.pctBelow5 - qCaptured.pctBelow5,
        pass20: qRun2.pctBelow20 - qCaptured.pctBelow20 <= FALLBACK_TOL_PP_20,
        pass10: qRun2.pctBelow10 - qCaptured.pctBelow10 <= FALLBACK_TOL_PP_10,
        passSub5: qRun2.pctBelow5 - qCaptured.pctBelow5 <= FALLBACK_TOL_PP_SUB5,
      };
      crumb('fallback-quality-done', { qCaptured, qRun2, fallback });

      // ── Hard gates + verdict under Addendum 2 (computed + logged; primary already asserted). ────
      const outerTris = row.g1_forward.nFacets;
      const fullTris = row.g6_budget.triangleCount;
      const outerDeltaFrac = (outerTris - BASELINE_OUTER_TRIS) / BASELINE_OUTER_TRIS;
      const gates = {
        g1_outliers0: row.g1_forward.outliers === 0,
        g2_maxLeTol: (row.g2_reverse.maxMm ?? Infinity) <= 0.01,
        g3_nonMan0: row.g3_watertight.nonManRaw === 0,
        g3_orientationClean: row.g3_watertight.orientationMismatches === 0,
        g4_zeroAreaZero: row.g4_zeroDefect.zeroAreaCount === 0,
        g4_degenerateZero: row.g4_zeroDefect.degenerateCount === 0,
        g7_fullPotClosed: row.g7_assembly.wholeMeshBoundaryEdges === 0,
        outerTrisWithin5pct: Math.abs(outerDeltaFrac) <= OUTER_TOL_FRAC,
      };
      const allGatesGreen = Object.values(gates).every(Boolean);
      const verdict = allGatesGreen && hashIdentity ? 'PASS' : 'FAIL';

      const summary = {
        run: 2,
        adjudication: 'Addendum 2 (5f4a959e): PRIMARY same-provenance hash identity; fallback reported',
        verdict,
        primary: { hashIdentity, hashMatchesRun1, regionLayerHash: result.meta.hash, directTwinHash: directHash },
        gates,
        outer: { tris: outerTris, baseline: BASELINE_OUTER_TRIS, deltaFrac: outerDeltaFrac },
        full: { tris: fullTris, baseline: BASELINE_FULL_TRIS },
        fallbackUnrounded: {
          captured: qCaptured,
          run2: qRun2,
          ...fallback,
          tolerances: { pp20: FALLBACK_TOL_PP_20, pp10: FALLBACK_TOL_PP_10, sub5: FALLBACK_TOL_PP_SUB5 },
        },
        signedVolumeMm3: row.g3_watertight.signedVolumeMm3,
        wallTimes: { buildMs, directTwinMs: Date.now() - tTwin0 - scoreMs, scoreMs, totalMs: row.totalMs },
        runIdConvention: 'run=2 encoded in runId (armD-run2-FourierBloom-<ts>); GatesRow schema untouched',
      };
      crumb('verdict', summary);
      // eslint-disable-next-line no-console
      console.log(`[armD run2] VERDICT=${verdict}\n${JSON.stringify(summary, null, 2)}`);
    },
    ARMD_TIMEOUT_MS,
  );
});
