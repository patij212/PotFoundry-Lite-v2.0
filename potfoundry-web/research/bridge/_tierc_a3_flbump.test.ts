// _tierc_a3_flbump.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A3 BONUS feasibility check
// (diagnosis only, cheap, tightly bounded). Companion: _tierc_a3_char.test.ts (the decisive
// POINT-vs-EDGE characterization; this file answers ONE separate, cheaper question named in the
// same DO list: "does bumping featureLevel 11->12 on the band-edge contours reduce the ~31k
// [radial-survivor proxy], and by how much / at what tri cost?").
//
// SCOPE (deliberately narrow): featureLevel is production's FIXED, unconditional forced-refine
// level on any quadtree cell a general-curve line crosses (champion-spec-gyroid.md §2.5 point 3)
// -- a DIFFERENT mechanism from the curvature-driven h(kappa) sizing formula that
// E-2026-07-10-GYROID-PRODCLOSE already proved saturates at the knee (KILL-A: h(kappa>=2.4) binds
// exactly, so no CONTINUOUS density/floor escalation can move the sizing output there). A forced
// LEVEL bump is not subject to that plateau argument (it is a discrete, unconditional cell split,
// not a curvature-gated formula), so it is a genuinely different, untested lever worth a cheap
// directional check -- NOT a re-litigation of the already-KILLED curvature-floor lever.
//
// METHOD: build featureLevel=12 (vs production's 11) on the SAME fanRepair Delta2-exact twin
// construction, then run ONLY the cheap early-break radial prescreen COUNT (gpcPrescreenCount, no
// per-facet worst-point detail, no Newton confirmation) to get an HONEST but PROXY (not
// Newton-confirmed) before/after survivor-count signal + the tri-cost. The L11 baseline is NOT
// rebuilt here -- it is cited from the already-run, already-verified _tierc_a3_char.test.ts
// result (outerTris 2,242,984, survivors 236,185, banked stratified estOutliers 31,114) to avoid
// spending budget twice on the same build. This is a DIRECTIONAL/cost signal only -- a literal
// Newton-confirmed re-estimate at L12 is explicitly OUT of scope for this bonus check (budget).
//
// RULES: NEW FILE ONLY. Read-only on all src/ and committed research libs -- diagnosis only, no
// fix is built or proposed in code. DEV-ONLY, research/ never imported by src/. Commit nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import * as os from 'node:os';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionWallGridCPU } from './tierc_regionLayer';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  extractBandedgeContours,
  contoursToFeatureLines,
  gpcPrescreenCount,
  type BandedgeExtraction,
} from './_gyroid_bandedge_lib';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM, AF_RDRAIN, fnvHash } from './_analytic_floor_lib';
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
const ON = process.env.PF_TIERC_A3FLBUMP === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armA3_flbump_crumbs.ndjson');
const TEST_TIMEOUT_MS = 10 * 60 * 1000; // tightly bounded -- build + prescreenCount only
const TOL = 0.01;
/** Baseline (L11, fanRepair) -- cited from the already-verified _tierc_a3_char.test.ts run
 *  (hash 51a25eba-6a58e3e1), NOT rebuilt here. */
const L11_BASELINE = {
  outerTris: 2242984, survivors: 236185, bankedStratifiedEstOutliers: 31114,
};

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A3-flbump', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

interface A3Build {
  hash: string; fullTris: number; outerTris: number;
  outerXyz: Float32Array; outerIdx: Uint32Array; uBias: number; buildMs: number;
}

/** Mirrors _tierc_a3_char.test.ts's buildFanRepairOuter EXACTLY, with ONE field different:
 *  featureLevel is a parameter instead of hardcoded to AF_PROD_OPTS.featureLevel (11). */
function buildFanRepairOuterAtLevel(
  rA: (theta: number, z: number) => number,
  bandedge: BandedgeExtraction,
  featureLevel: number,
): A3Build {
  const t0 = Date.now();
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
    featureLevel,
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
    hash, fullTris: asm.indices.length / 3, outerTris: sub.indices.length / 3,
    outerXyz, outerIdx: sub.indices, uBias, buildMs: Date.now() - t0,
  };
}

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A3 BONUS featureLevel 11->12 feasibility (cheap, diagnosis only)', () => {
  it(
    'builds featureLevel=12 and compares tri-cost + radial-survivor-count proxy vs the L11 baseline',
    () => {
      const t0 = Date.now();
      mkdirSync(OUT_DIR, { recursive: true });
      try {
        os.setPriority(process.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL);
      } catch {
        console.log('[armA3-flbump] note: could not self-bump priority');
      }
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      const tExtract = Date.now();
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      crumb('extract-done', { ms: Date.now() - tExtract, totalPts: bandedge.totalPts });

      const tBuild = Date.now();
      const build12 = buildFanRepairOuterAtLevel(rA, bandedge, 12);
      crumb('build-L12-done', {
        ms: Date.now() - tBuild, hash: build12.hash, fullTris: build12.fullTris, outerTris: build12.outerTris,
      });
      writeFileSync(join(OUT_DIR, 'armA3_flbump_build_meta.json'), JSON.stringify({
        featureLevel: 12, hash: build12.hash, fullTris: build12.fullTris, outerTris: build12.outerTris,
        baselineL11: L11_BASELINE,
        trisDeltaPct: +(100 * (build12.outerTris - L11_BASELINE.outerTris) / L11_BASELINE.outerTris).toFixed(2),
      }));

      const tPrescreen = Date.now();
      const survivors12 = gpcPrescreenCount(build12.outerXyz, build12.outerIdx, rA, H, TOL);
      crumb('prescreenCount-L12-done', { ms: Date.now() - tPrescreen, survivors: survivors12, nFacets: build12.outerTris });

      const survivorsDeltaPct = +(100 * (survivors12 - L11_BASELINE.survivors) / L11_BASELINE.survivors).toFixed(2);
      const trisDeltaPct = +(100 * (build12.outerTris - L11_BASELINE.outerTris) / L11_BASELINE.outerTris).toFixed(2);
      // Proxy estimate of the Newton-confirmed outlier population at L12: apply the SAME
      // survivors->Newton-confirmed conversion ratio the L11 banked/A2 runs measured
      // (31,114 / 236,185 = 13.176%) to the L12 raw survivor count. This is EXPLICITLY a proxy,
      // not a re-run stratified/Newton estimate -- flagged honestly in the summary.
      const conversionRatio = L11_BASELINE.bankedStratifiedEstOutliers / L11_BASELINE.survivors;
      const estOutliers12Proxy = Math.round(survivors12 * conversionRatio);

      const summary = {
        experiment: 'E-2026-07-11-TIERC-HEADTOHEAD Arm A3 BONUS featureLevel 11->12 feasibility',
        at: new Date().toISOString(),
        elapsedMs: Date.now() - t0,
        baselineL11: L11_BASELINE,
        l12: { hash: build12.hash, fullTris: build12.fullTris, outerTris: build12.outerTris, survivors: survivors12, buildMs: build12.buildMs },
        deltas: { trisDeltaPct, survivorsDeltaPct },
        proxyEstOutliers12: estOutliers12Proxy,
        proxyEstOutliersDeltaPct: +(100 * (estOutliers12Proxy - L11_BASELINE.bankedStratifiedEstOutliers) / L11_BASELINE.bankedStratifiedEstOutliers).toFixed(2),
        caveat:
          'proxyEstOutliers12 applies the L11 banked survivors->Newton-confirmed CONVERSION RATIO ' +
          '(13.176%) to the L12 RAW radial-survivor count -- it is NOT a re-run Newton/stratified ' +
          'estimate at L12 (out of scope for this bounded bonus check). Treat as directional only.',
      };
      writeFileSync(join(OUT_DIR, 'armA3_flbump_summary.json'), JSON.stringify(summary, null, 2));
      crumb('DONE', { trisDeltaPct, survivorsDeltaPct, proxyEstOutliers12: estOutliers12Proxy, totalMs: Date.now() - t0 });
      // eslint-disable-next-line no-console
      console.log(`[armA3-flbump] DONE\n${JSON.stringify(summary, null, 2)}`);

      expect(build12.outerTris, 'L12 build must produce a non-vacuous mesh').toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );
});
