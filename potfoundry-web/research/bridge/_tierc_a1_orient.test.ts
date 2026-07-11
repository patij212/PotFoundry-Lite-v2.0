// _tierc_a1_orient.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A1 ISOLATION follow-up
// (coordinator-directed, env-gated PF_TIERC_A1ORIENT=1). Decides whether A2's fanRepair PASS
// stands or must reopen, by isolating the orientationMismatches=651 / boundaryEdges=360 finding
// surfaced by scoreAllGates on the fanRepair full assembly.
//
// QUESTION: is the orientation/boundary defect PRE-EXISTING in Gyroid's doubled band-edge
// general-curve CDT construction (independent of multiCurveCellPolicy), or INTRODUCED by
// fanRepair (in which case A2's narrow nonManRawBig-only acceptance missed a watertightness
// regression — it traded the mult-3 crack for mult-1 boundary holes)?
//
// DECISIVE COMPARISON (all via the SAME topologyMetric, src/fidelity/metrics.ts):
//   (1) NATIVE 'off' build — buildRegionOuterWall(getManifest('GyroidManifold'), dims), the real
//       orchestration entry point, policy OFF (multiCurveCellPolicy cannot be threaded through
//       RegionBuildOpts today — the missing thread A1 reported). Its full-assembly hash is banked
//       = f033dbf5 = the twin 'off' baseline. This is the decisive baseline: SAME band-edge
//       construction, policy OFF.
//   (2) fanRepair build — via the region layer's OWN generic helper (buildRegionWallGridCPU) +
//       assembleWatertight(multiCurveCellPolicy:'fanRepair') + evaluatePackedAssemblyToXyz, the
//       only reachable fanRepair path (native cannot). NOTE the fallback path introduces nothing:
//       A1 PROVED fallback-'off' hash == native-'off' hash == banked-'off' hash (byte-identical),
//       so any off->fanRepair delta measured here isolates the fanRepair POST-PASS effect exactly
//       (it cannot be a fallback-vs-native assembly artifact — that difference is provably zero).
//   (3) REAL captured PRODUCTION artifact — research/exchange/_prod_truth/GyroidManifold/full.
//       {xyz,idx}.bin (the shipping val=0-centerline export, 4,014,814 tris) — tells us whether
//       real production carries this too (a shipping bug) or whether it is band-edge-twin-specific.
//
// EXTRA DISAMBIGUATION (nearly free, ~8s/call): each mesh is measured at TWO weld tolerances —
//   - weld = 1e-4mm (the harness's own canonical G3 weld, architecture-v1 Decision A4); and
//   - weld = 0 (buildWeldRemapFast returns the IDENTITY remap for tol<=0, metrics.ts:1108-1111,
//     verified by direct read) => PURE BY-INDEX topology, no positional merging at all.
// assembleWatertight closes the pot by SHARED INDICES at every surface junction (that is what
// makes it watertight — the cheatsheet's "watertight by INDEX" law), so a correct assembly is
// closed/manifold/oriented at weld=0. If weld=0 reads 0/0/0 but weld=1e-4 reads 651/360, the
// 1e-4 count is a POSITIONAL WELD OVER-MERGE artifact of topologyMetric on the dense band-edge
// mesh (distinct sub-0.1µm-apart surface points spuriously merged), NOT a mesh defect — which
// would also be a HARNESS-CALIBRATION finding (1e-4 too coarse for band-edge-density Gyroid). If
// weld=0 ALSO reads 651/360, it is a real index-level topology defect. nonManRawBig(idx) (the
// mandated by-index watertight metric) is reported alongside for the full picture.
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A1ORIENT=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_a1_orient.config.ts
//
// DEV-ONLY. research/ never imported by src/. NEW FILE ONLY — everything imported read-only.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import {
  buildRegionOuterWall,
  evaluatePackedAssemblyToXyz,
  buildRegionWallGridCPU,
} from './tierc_regionLayer';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  extractBandedgeContours,
  contoursToFeatureLines,
} from './_gyroid_bandedge_lib';
import { loadBinMesh } from './_pf_rebaselineRuler';
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
import { topologyMetric } from '../../src/fidelity/metrics';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_A1ORIENT === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armA1_orient_crumbs.ndjson');
const OUT_JSON = join(OUT_DIR, 'armA1_orient_isolation.json');
const PROD_DIR = join('research', 'exchange', '_prod_truth', 'GyroidManifold');
const ISO_TIMEOUT_MS = 20 * 60 * 1000;

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A1-orient', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

/** topologyMetric at BOTH weld tolerances + by-index nonManRawBig — the full topology fingerprint. */
function fingerprint(
  label: string,
  xyz: Float32Array,
  idx: Uint32Array,
): {
  label: string;
  nV: number;
  nTris: number;
  byIndex: { boundaryEdges: number; nonManifoldEdges: number; orientationMismatches: number };
  weld1e4: { boundaryEdges: number; nonManifoldEdges: number; orientationMismatches: number };
  nonManRawBigIdx: number;
} {
  const view = { vertices: xyz, indices: idx };
  const t0 = Date.now();
  const byIndex = topologyMetric(view, 0); // identity remap => pure by-index topology
  crumb(`topo-byindex-${label}`, { ms: Date.now() - t0, ...byIndex });
  const t1 = Date.now();
  const weld1e4 = topologyMetric(view, 1e-4); // harness canonical weld
  crumb(`topo-weld1e4-${label}`, { ms: Date.now() - t1, ...weld1e4 });
  const t2 = Date.now();
  const nmRaw = nonManRawBig(idx);
  crumb(`nonManRawBig-${label}`, { ms: Date.now() - t2, nonManRawBig: nmRaw });
  return {
    label,
    nV: xyz.length / 3,
    nTris: idx.length / 3,
    byIndex,
    weld1e4,
    nonManRawBigIdx: nmRaw,
  };
}

/** fanRepair full assembly via the region layer's own generic helper (see file header — the only
 *  reachable fanRepair path; fallback-'off' is byte-proven == native-'off', so this isolates the
 *  post-pass exactly). Returns evaluated 3D full mesh. */
function buildFanRepairFull(
  rA: (theta: number, z: number) => number,
  bandedge: ReturnType<typeof extractBandedgeContours>,
): { xyz: Float32Array; idx: Uint32Array; hash: string; outerTrisNote: number } {
  const { H } = TIERC_COMMON_DIMS;
  const outer = buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
  const inner = buildRegionWallGridCPU(rA, 1, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
  const generalCurves: FeatureLine[] = [
    ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
    ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
  ];
  const creaseChoice = chooseCreaseGrid([]);
  const creaseTChoice = chooseCreaseTGrid([]);
  const helixChoice = chooseHelixGrid(0, 0, 0);
  const creaseLines = buildCreaseRefineLines(
    { styleId: 'GyroidManifold', lines: [], groundTruthCount: 0 },
    { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
  );
  const outerEfgSampler = composedWallSampler(outer.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const innerEfgSampler = composedWallSampler(inner.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const minUniformLevel = resolveUniformLevelOverride(
    Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level), 0,
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
    multiCurveCellPolicy: 'fanRepair',
  };
  const asm = assembleWatertight(
    outer.sampler, inner.sampler,
    { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN }, assemblyOpts,
  );
  const hash = fnvHash(asm.vertices, asm.indices);
  const xyz = evaluatePackedAssemblyToXyz(asm.vertices, rA, H, AF_TWALL, AF_TBOTTOM, AF_RDRAIN);
  return { xyz, idx: asm.indices, hash, outerTrisNote: asm.indices.length / 3 };
}

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A1 orient/boundary ISOLATION', () => {
  it(
    'off vs fanRepair vs realProd: pre-existing or introduced?',
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      // Fresh extraction (same call gyroidManifoldAnatomy makes internally).
      const tE = Date.now();
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      crumb('extract-done', { ms: Date.now() - tE, totalPts: bandedge.totalPts });

      // (1) NATIVE 'off' via the real orchestration entry point.
      const tOff = Date.now();
      const offResult = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
      if (!offResult.full) {
        throw new Error('native off build returned no full mesh — unexpected for single R-CDT dispatch.');
      }
      crumb('off-build-done', {
        ms: Date.now() - tOff,
        hash: offResult.meta.hash,
        fullTris: offResult.full.idx.length / 3,
      });
      const offFp = fingerprint('off', offResult.full.xyz, offResult.full.idx);

      // (2) fanRepair via the region layer's own helper (isolates the post-pass — see header).
      const tFan = Date.now();
      const fan = buildFanRepairFull(rA, bandedge);
      crumb('fanRepair-build-done', { ms: Date.now() - tFan, hash: fan.hash, fullTris: fan.idx.length / 3 });
      const fanFp = fingerprint('fanRepair', fan.xyz, fan.idx);

      // (3) REAL captured production artifact (val=0 centerline shipping export).
      let realFp: ReturnType<typeof fingerprint> | null = null;
      const realXyzPath = join(PROD_DIR, 'full.xyz.bin');
      const realIdxPath = join(PROD_DIR, 'full.idx.bin');
      if (existsSync(realXyzPath) && existsSync(realIdxPath)) {
        const tR = Date.now();
        const real = loadBinMesh(realXyzPath, realIdxPath);
        crumb('real-load-done', { ms: Date.now() - tR, fullTris: real.idx.length / 3 });
        realFp = fingerprint('realProd', real.xyz, real.idx);
      } else {
        crumb('real-artifact-MISSING', { realXyzPath, realIdxPath });
      }

      // ── INTERPRETATION ────────────────────────────────────────────────────────────────────────
      // "Defect present" at the harness's canonical weld = orientationMismatches>0 OR boundaryEdges>0.
      const offDefect1e4 = offFp.weld1e4.orientationMismatches > 0 || offFp.weld1e4.boundaryEdges > 0;
      const fanDefect1e4 = fanFp.weld1e4.orientationMismatches > 0 || fanFp.weld1e4.boundaryEdges > 0;
      const offDefectByIndex = offFp.byIndex.orientationMismatches > 0 || offFp.byIndex.boundaryEdges > 0;
      const fanDefectByIndex = fanFp.byIndex.orientationMismatches > 0 || fanFp.byIndex.boundaryEdges > 0;

      // Is fanRepair MATERIALLY WORSE than off at the canonical weld? (the A2-reopen trigger)
      const fanWorseThanOff1e4 =
        fanFp.weld1e4.orientationMismatches > offFp.weld1e4.orientationMismatches + 3 ||
        fanFp.weld1e4.boundaryEdges > offFp.weld1e4.boundaryEdges + 3;

      let originVerdict: string;
      if (offDefect1e4 && !fanWorseThanOff1e4) {
        originVerdict =
          'PRE-EXISTING (policy-independent): the off build already carries the orientation/boundary ' +
          'signature at the canonical weld, and fanRepair is not materially worse (<=+3). fanRepair ' +
          'fixes only the by-index nonMan-3 and does NOT degrade watertightness. A2 PASS STANDS; ' +
          'orientation/boundary is a SEPARATE new Gyroid-arm finding (band-edge CDT / weld).';
      } else if (!offDefect1e4 && fanDefect1e4) {
        originVerdict =
          'INTRODUCED by fanRepair: off is clean at the canonical weld but fanRepair shows the defect. ' +
          'A2 PASS must REOPEN — the fan-consistency post-pass traded the mult-3 crack for boundary/' +
          'orientation defects its nonManRawBig-only acceptance did not measure.';
      } else if (fanWorseThanOff1e4) {
        originVerdict =
          'PARTIALLY INTRODUCED: both carry a signature but fanRepair is materially worse than off ' +
          '(> +3 on orientation or boundary) — fanRepair adds defects on top of a pre-existing base. ' +
          'A2 PASS should REOPEN for the incremental degradation.';
      } else {
        originVerdict =
          'NO DEFECT at the canonical weld on either build — the scoreAllGates 651/360 reading is not ' +
          'reproduced here; investigate the evaluator/weld path difference.';
      }

      // Weld-artifact test: canonical-weld defect present but by-index clean => positional over-merge.
      const weldArtifactOff = offDefect1e4 && !offDefectByIndex;
      const weldArtifactFan = fanDefect1e4 && !fanDefectByIndex;
      const weldArtifactNote = weldArtifactFan
        ? 'WELD-ARTIFACT CONFIRMED on fanRepair: by-index (weld=0) topology is clean but the 1e-4 weld ' +
          'inflates it => distinct sub-0.1µm-apart band-edge surface points are spuriously merged by ' +
          'the canonical weld. The mesh is watertight BY INDEX (the cheatsheet law); the 651/360 is a ' +
          'topologyMetric measurement artifact on the dense band-edge mesh => ALSO a harness-calibration ' +
          'finding (1e-4 too coarse for band-edge-density Gyroid).'
        : fanDefectByIndex
          ? 'REAL INDEX-LEVEL defect on fanRepair: by-index (weld=0) topology ALSO shows the signature ' +
            '=> not a weld artifact; the assembly genuinely emits boundary/mis-oriented facets by index.'
          : 'fanRepair clean at canonical weld — no artifact question arises.';

      const summary = {
        experiment: 'E-2026-07-11-TIERC-HEADTOHEAD Arm A1 orient/boundary isolation',
        at: new Date().toISOString(),
        weldTolerances: { byIndex: 0, canonical: 1e-4 },
        builds: {
          off: { hash: offResult.meta.hash, dispatch: offResult.meta.dispatch, note: 'native buildRegionOuterWall, policy OFF (hash should == banked f033dbf5)' },
          fanRepair: { hash: fan.hash, note: 'region-layer helper + multiCurveCellPolicy:fanRepair (only reachable path)' },
          real: realFp ? { note: 'captured production val=0 export' } : null,
        },
        table: {
          off: offFp,
          fanRepair: fanFp,
          realProd: realFp,
        },
        interpretation: {
          offDefectAtCanonicalWeld: offDefect1e4,
          fanDefectAtCanonicalWeld: fanDefect1e4,
          offDefectByIndex,
          fanDefectByIndex,
          fanWorseThanOffAtCanonicalWeld: fanWorseThanOff1e4,
          originVerdict,
          weldArtifactOff,
          weldArtifactFan,
          weldArtifactNote,
          a2PassStands: offDefect1e4 && !fanWorseThanOff1e4,
        },
      };
      writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
      crumb('verdict', {
        originVerdict,
        a2PassStands: summary.interpretation.a2PassStands,
        weldArtifactFan,
      });
      // eslint-disable-next-line no-console
      console.log(`[armA1-orient] ISOLATION\n${JSON.stringify(summary, null, 2)}`);

      // Sanity witness (hard): the native 'off' build must reproduce the banked twin 'off' hash —
      // if it does not, the whole comparison basis is void.
      expect(offResult.meta.hash, 'native off build must reproduce banked twin off hash').toBe('f033dbf5-b5f9fb84');
    },
    ISO_TIMEOUT_MS,
  );
});
