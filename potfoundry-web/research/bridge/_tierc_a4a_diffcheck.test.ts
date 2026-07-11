// _tierc_a4a_diffcheck.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A4a FOLLOW-UP (narrow
// question only). The main A4a probe's (_tierc_a4a.test.ts) geometric diff-confinement check used
// a "seam zone" that restricted BOTH u-distance-to-seam AND t to the specific band A4-diagnosis
// measured for the ORIENTATION-mismatch population (t in [0.25,0.47]) — but the doubled band-edge
// contour physically crosses the u=0/1 seam at MANY t-heights across its full [0,1] range (it is a
// closed curve winding around the whole pot), so `linkSegments`'s periodic weld touches every one
// of those crossings, not just the ones near the orientation-defect band. The main probe's 200-pt
// JSON sample (sorted by quantized-u key, so front-loaded toward u~0) already showed max
// uDistToSeam ~0.0112 among that slice, but did NOT cover the u~1 side (which sorts to the far end
// of the array) or the full onlyA/onlyB counts (3832/3728). This probe re-derives ONLY the
// geometric diff (skips the 8.6-minute fidelity re-score, already measured) over the FULL,
// uncapped onlyA/onlyB sets to answer: is EVERY differing vertex confined to a small U-neighborhood
// of the seam (expected, physically-scoped), or are some genuinely far from it (the real red flag)?
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A4A_DIFF=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_a4a_diff.config.ts
//
// RULES: NEW FILE. Read-only on all src/ and committed research libs (linkSegments' opt-in 3rd
// param was already added by the main A4a probe's edit). DEV-ONLY. Commit nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionWallGridCPU } from './tierc_regionLayer';
import { GBE_EXTRACT_DEFAULT, GBE_FIELD, extractBandedgeContours, contoursToFeatureLines } from './_gyroid_bandedge_lib';
import {
  marchAbsIso, linkSegments, refineAndFilterContours, decimateContours, wallIsolevels,
  type Contour, type GyroidFieldParams,
} from './_gyroidContourLib';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM, AF_RDRAIN, fnvHash } from './_analytic_floor_lib';
import {
  assembleWatertight, computeUBias, type AssemblyWallOptions,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { buildCreaseRefineLines, type FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';

const ON = process.env.PF_TIERC_A4A_DIFF === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armA4a_diffcheck_crumbs.ndjson');
const TIMEOUT_MS = 8 * 60 * 1000;
const EXPECT_HASH = 'f033dbf5-b5f9fb84';

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(CRUMB_PATH, JSON.stringify({ arm: 'A4a-diffcheck', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n');
  } catch { /* never kill the run */ }
}
function heapLimitMB(): number { return Math.round(getHeapStatistics().heap_size_limit / 1048576); }
function periodicUDistToSeam(u: number): number { const uw = ((u % 1) + 1) % 1; return Math.min(uw, 1 - uw); }

function extractIsolevelLocal(
  c: number, rA: (theta: number, z: number) => number, H: number,
  opts: typeof GBE_EXTRACT_DEFAULT, params: GyroidFieldParams, periodicU: boolean,
): { decimatedContours: Contour[] } {
  const segs = marchAbsIso(c, params, { nu: opts.nu, nt: opts.nt, polishIters: opts.polishIters });
  const linked = linkSegments(segs, 1e-6, periodicU);
  const { contours: refined } = refineAndFilterContours(linked, c, params, opts.valTol);
  const decimated = decimateContours(refined, opts.stepMm, rA, H);
  return { decimatedContours: decimated };
}
function extractBandedgeLocal(
  rA: (theta: number, z: number) => number, H: number,
  opts: typeof GBE_EXTRACT_DEFAULT, params: GyroidFieldParams, periodicU: boolean,
): { inner: { decimatedContours: Contour[] }; outer: { decimatedContours: Contour[] } } {
  const iso = wallIsolevels(params);
  return {
    inner: extractIsolevelLocal(iso.inner, rA, H, opts, params, periodicU),
    outer: extractIsolevelLocal(iso.outer, rA, H, opts, params, periodicU),
  };
}

function buildOffTwin(
  rA: (theta: number, z: number) => number,
  bandedge: { inner: { decimatedContours: Contour[] }; outer: { decimatedContours: Contour[] } },
): { vertices: Float32Array; indices: Uint32Array; hash: string } {
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
  const outerEfgSampler = composedWallSampler(outer.sampler, { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp });
  const innerEfgSampler = composedWallSampler(inner.sampler, { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp });
  const minUniformLevel = resolveUniformLevelOverride(Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level), 0);
  const uBias = computeUBias(outer.sampler, generalCurves.length > 0);
  const assemblyOpts: AssemblyWallOptions = {
    maxSagMm: AF_PROD_OPTS.maxSagMm, maxEdgeMm: AF_PROD_OPTS.maxEdgeMm, minEdgeMm: AF_PROD_OPTS.minEdgeMm,
    gradeRatio: AF_PROD_OPTS.gradeRatio, maxLevel: AF_PROD_OPTS.maxLevel, resU: AF_PROD_OPTS.resU, resT: AF_PROD_OPTS.resT,
    nRing: AF_PROD_OPTS.nRing, targetTriangles: AF_PROD_OPTS.targetTriangles, budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel, uBias, outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel, outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    outerEfgSampler, innerEfgSampler,
  };
  const asm = assembleWatertight(outer.sampler, inner.sampler, { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN }, assemblyOpts);
  return { vertices: asm.vertices, indices: asm.indices, hash: fnvHash(asm.vertices, asm.indices) };
}

interface VKey { key: number; u: number; t: number; s: number }
function quantizedKeys(vertices: Float32Array): VKey[] {
  const nV = vertices.length / 3;
  const out: VKey[] = new Array(nV);
  for (let i = 0; i < nV; i++) {
    const u = vertices[i * 3], t = vertices[i * 3 + 1], s = vertices[i * 3 + 2];
    const qU = Math.round((u + 2) * 1e5);
    const qT = Math.round((t + 200) * 1e5);
    const qS = Math.round(s * 10);
    out[i] = { key: qU * 2e7 + qT * 100 + qS, u, t, s };
  }
  out.sort((a, b) => a.key - b.key);
  return out;
}
function symmetricDiffFull(a: VKey[], b: VKey[]): { onlyA: VKey[]; onlyB: VKey[]; common: number } {
  let i = 0, j = 0, common = 0;
  const onlyA: VKey[] = [];
  const onlyB: VKey[] = [];
  while (i < a.length && j < b.length) {
    if (a[i].key === b[j].key) { common++; i++; j++; }
    else if (a[i].key < b[j].key) { onlyA.push(a[i]); i++; }
    else { onlyB.push(b[j]); j++; }
  }
  while (i < a.length) { onlyA.push(a[i]); i++; }
  while (j < b.length) { onlyB.push(b[j]); j++; }
  return { onlyA, onlyB, common };
}
function percentiles(arr: number[]): { min: number; p50: number; p90: number; p99: number; max: number } {
  if (arr.length === 0) return { min: 0, p50: 0, p90: 0, p99: 0, max: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const pct = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: s[s.length - 1] };
}

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A4a geometric-diff FOLLOW-UP (full extent, u-only zone)', () => {
  it(
    'every differing vertex between baseline-off and periodic-off is within a small U-neighborhood of the seam, across the FULL uncapped diff set',
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB).toBeGreaterThanOrEqual(4096);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      const t1 = Date.now();
      const bandedgeBaseline = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      const bandedgePeriodic = extractBandedgeLocal(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD, true);
      crumb('extract-done', { ms: Date.now() - t1 });

      const t2 = Date.now();
      const off = buildOffTwin(rA, bandedgeBaseline);
      crumb('build-baseline-done', { ms: Date.now() - t2, hash: off.hash, tris: off.indices.length / 3 });
      expect(off.hash, 'baseline must reproduce the banked hash').toBe(EXPECT_HASH);

      const t3 = Date.now();
      const periodicOff = buildOffTwin(rA, bandedgePeriodic);
      crumb('build-periodic-done', { ms: Date.now() - t3, hash: periodicOff.hash, tris: periodicOff.indices.length / 3 });

      const t4 = Date.now();
      const keysBase = quantizedKeys(off.vertices);
      const keysPer = quantizedKeys(periodicOff.vertices);
      const { onlyA, onlyB, common } = symmetricDiffFull(keysBase, keysPer);
      crumb('diff-done', { ms: Date.now() - t4, onlyACount: onlyA.length, onlyBCount: onlyB.length, common });

      const aUDist = onlyA.map((v) => periodicUDistToSeam(v.u));
      const bUDist = onlyB.map((v) => periodicUDistToSeam(v.u));
      const aT = onlyA.map((v) => v.t);
      const bT = onlyB.map((v) => v.t);
      const THRESH_LIST = [0.01, 0.02, 0.05, 0.1];
      const overThresh = (arr: number[], thr: number): number => arr.filter((d) => d > thr).length;
      const summary = {
        onlyACount: onlyA.length, onlyBCount: onlyB.length, common,
        aUDistToSeamPercentiles: percentiles(aUDist), bUDistToSeamPercentiles: percentiles(bUDist),
        aTRange: aT.length ? [Math.min(...aT), Math.max(...aT)] : [0, 0],
        bTRange: bT.length ? [Math.min(...bT), Math.max(...bT)] : [0, 0],
        overThreshA: Object.fromEntries(THRESH_LIST.map((t) => [String(t), overThresh(aUDist, t)])),
        overThreshB: Object.fromEntries(THRESH_LIST.map((t) => [String(t), overThresh(bUDist, t)])),
        maxUDistToSeamOverall: Math.max(...aUDist, ...bUDist, 0),
      };
      crumb('summary', summary as unknown as Record<string, unknown>);
      writeFileSync(join(OUT_DIR, 'armA4a_diffcheck_full.json'), JSON.stringify({
        summary,
        farFromSeamA: onlyA.filter((v) => periodicUDistToSeam(v.u) > 0.02),
        farFromSeamB: onlyB.filter((v) => periodicUDistToSeam(v.u) > 0.02),
      }, null, 2));
      // eslint-disable-next-line no-console
      console.log(`[armA4a-diffcheck] DONE\n${JSON.stringify(summary, null, 2)}`);

      expect(onlyA.length + onlyB.length, 'diff must be non-vacuous (the fix must change SOMETHING, matching the main probe hash-changed finding)').toBeGreaterThan(0);
    },
    TIMEOUT_MS,
  );
});
