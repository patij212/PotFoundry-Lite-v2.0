// _tierc_a4a.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A4a (orientation-seam fix, opt-in;
// prereg Addendum 4 A4a bullet + research/lab/tierc/A4-diagnosis.md §2.2).
//
// HYPOTHESIS: `linkSegments` (_gyroidContourLib.ts) welds polyline endpoints via an EXACT,
// non-periodic quantized (u,t) key — a segment ending at u=1.0 (marchAbsIso's right edge of the
// last u-column) and one starting at u=0.0 (left edge of the first column) are the SAME physical
// seam crossing but get different weld keys and are never chained. This tears every band-edge
// contour that crosses u=1<->0 into two pieces with dangling ends, and A4-diagnosis measured that
// tear's downstream signature: 645/652 orientationMismatch defects (+51/360 boundary) concentrate
// in ONE t-band (~0.307-0.442) at a seam-adjacent forward/forward mis-wound stitch edge. Making
// `linkSegments` periodic-u-aware (opt-in, default false) is predicted to collapse that cluster.
//
// MECHANISM-VERIFICATION CAVEAT (found by direct read BEFORE writing any fix, recorded honestly
// per the audit-first rule): `ConformingWall.ts:588-606,809-814` clips EVERY general-curve feature
// line to the safe box `[uMargin, 1-uMargin] x [tMargin, 1-tMargin]` ONCE, unconditionally, where
// `uMargin = 1.5/(1<<featureLevel) ~= 0.000732` — BY DESIGN, per its own comment: "a feature vertex
// on u=0 would be a T-junction against the wrapping u=1 cells, which the non-periodic crease
// extraction does not mirror." Since the raw seam-torn endpoints (u=0.0 / u=1.0, i.e. the exact
// vertices `linkSegments` would weld) sit OUTSIDE that margin on BOTH sides trivially (0 < uMargin,
// 1 > 1-uMargin), `clipLineToInterval`'s scan (a "run" is a maximal CONSECUTIVE in-range stretch)
// closes a run at the SAME interpolated `hi`/`lo` boundary point whether the two torn pieces were
// pre-welded into ONE `Contour`/`FeatureLine` or left as two SEPARATE ones — a run cannot straddle
// two consecutive out-of-range points either way, and welding does not change which points are
// in/out of range. This is a code-level proof (not a guess) that `linkSegments`'s weld, BY ITSELF,
// is very likely INERT on the `clippedFeatures` the kernel actually triangulates — the ACTUAL
// gatekeeper is the kernel's OWN uMargin clip (src/, out of this file's edit scope). This probe
// TESTS that prediction empirically (build + measure both variants) rather than trusting the
// derivation alone, per the mission's step 1 ("VERIFY the mechanism before fixing").
//
// IMPACT (GitNexus CLI, `node .gitnexus/run.cjs impact --uid
// "Function:potfoundry-web/research/bridge/_gyroidContourLib.ts:linkSegments" --direction upstream
// --include-tests`): risk LOW, impactedCount 1 (direct caller `_gyroid_close.test.ts`, 3 call
// sites) + `_gyroid_bandedge_lib.ts`'s `extractIsolevel` (1 call site, confirmed by direct grep —
// the CLI's depth-1 listing only surfaced the test-file edge but the file-level CALLS relation to
// extractIsolevel is present in the graph). ALL 4 known call sites pass <=2 positional args (never
// a 3rd) — a new optional 3rd parameter defaulting to `false` is 100% additive/backward-compatible.
// Chose an opt-in parameter over changing default behavior per the mission's own preference.
//
// METHOD: (1) extract the REAL baseline band-edge contours via the unmodified production entry
// point `extractBandedgeContours`; build the 'off'-policy twin (must reproduce banked hash
// f033dbf5-b5f9fb84); classify all edges Map-free (cross-checked against `topologyMetric`).
// (2) mechanism verification: scan the baseline decimated contours for polyline endpoints within
// one marching cell of u=0/1 in the affected t-band, co-locate against the classified
// orientationMismatch loci, and directly check they sit outside the kernel's own uMargin.
// (3) byte-identity proof: `linkSegments(segs)` === `linkSegments(segs,1e-6,false)` element-wise,
// AND a local re-implementation of the extraction pipeline with `periodicU=false` reproduces the
// REAL `extractBandedgeContours` output hash exactly. (4) build the periodic-linked ('off'-policy)
// twin via the SAME local re-implementation with `periodicU=true`; classify; compare against
// baseline. (5) geometric diff-confinement: Map-free sorted-key symmetric difference of the FULL
// packed (u,t,surfaceId) vertex sets between the two builds — every differing vertex must sit
// inside the expected seam neighborhood, or this is a HALT-worthy surprise. (6) fidelity re-score:
// prescreen + severity-stratified Newton (SAME plan as A1: topExhaustive:200,strata:8,
// perStratum:225) + coverage on BOTH outer submeshes.
//
// Run: NODE_OPTIONS=--max-old-space-size=12288 PF_TIERC_A4A=1 \
//   node node_modules/vitest/vitest.mjs run --config vitest.tierc_a4a.config.ts
//
// RULES: NEW FILE ONLY. `_gyroidContourLib.ts`'s `linkSegments` gained ONE opt-in default-false
// 3rd parameter (this arm's only production-lib edit); every other import is READ-ONLY (no other
// src/ or committed-lib edit). DEV-ONLY, research/ never imported by src/. Commit nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionWallGridCPU } from './tierc_regionLayer';
import {
  GBE_EXTRACT_DEFAULT,
  GBE_FIELD,
  extractBandedgeContours,
  contoursToFeatureLines,
  gpcPrescreenDetail,
  gpcStratifiedNewton,
  gpcScoreCoverage,
} from './_gyroid_bandedge_lib';
import {
  marchAbsIso,
  linkSegments,
  refineAndFilterContours,
  decimateContours,
  isoResidual3D,
  wallIsolevels,
  type Contour,
  type GyroidFieldParams,
} from './_gyroidContourLib';
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
import { topologyMetric, extractOuterWallSubmesh } from '../../src/fidelity/metrics';
import type { CdtStats } from '../../src/renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';

const TAU = Math.PI * 2;
const ON = process.env.PF_TIERC_A4A === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armA4a_crumbs.ndjson');
const ISO_TIMEOUT_MS = 20 * 60 * 1000;
/** A1/A2/A4-proven 'off' banked twin hash — the non-vacuity witness that the baseline build here
 *  is the EXACT SAME construction those arms measured 360/652/3 on. */
const EXPECT_HASH = 'f033dbf5-b5f9fb84';
const TOL = 0.01; // matches _tierc_armA1.test.ts's TOL — apples-to-apples fidelity basis

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A4a', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

function periodicUDistToSeam(u: number): number {
  const uw = ((u % 1) + 1) % 1;
  return Math.min(uw, 1 - uw);
}
function uDist(ua: number, ub: number): number {
  const wa = ((ua % 1) + 1) % 1;
  const wb = ((ub % 1) + 1) % 1;
  const d = Math.abs(wa - wb);
  return Math.min(d, 1 - d);
}

// ─────────────────────────── local extraction pipeline (mirrors _gyroid_bandedge_lib.ts's
// extractIsolevel/extractBandedgeContours EXACTLY, with `periodicU` threaded to linkSegments —
// NOT editing that committed lib per the mission's edit-scope rule; this is a local, provably-
// faithful re-implementation, proven byte-identical to the real entry point at periodicU=false in
// Stage 5 below) ───────────────────────────

interface IsolevelLocal {
  decimatedContours: Contour[];
  decimatedPtCount: number;
  rawPts: number;
  kept: number;
  dropped: number;
  placement: { maxDisp3D: number; p99Disp3D: number; sampledN: number };
}

function extractIsolevelLocal(
  c: number, rA: (theta: number, z: number) => number, H: number,
  opts: typeof GBE_EXTRACT_DEFAULT, params: GyroidFieldParams, periodicU: boolean,
): IsolevelLocal {
  const segs = marchAbsIso(c, params, { nu: opts.nu, nt: opts.nt, polishIters: opts.polishIters });
  const linked = linkSegments(segs, 1e-6, periodicU);
  const rawPts = linked.reduce((n, cont) => n + cont.pts.length, 0);
  const { contours: refined, dropped, kept } = refineAndFilterContours(linked, c, params, opts.valTol);
  const decimated = decimateContours(refined, opts.stepMm, rA, H);
  const decimatedPtCount = decimated.reduce((n, cont) => n + cont.pts.length, 0);
  const flat: Array<[number, number]> = [];
  for (const cont of decimated) for (const p of cont.pts) flat.push(p);
  const stride = Math.max(1, Math.floor(flat.length / opts.placementSampleN));
  const disps: number[] = [];
  for (let i = 0; i < flat.length; i += stride) {
    const [u, t] = flat[i];
    disps.push(isoResidual3D(u, t, c, params, rA, H).disp3D);
  }
  disps.sort((a, b) => a - b);
  return {
    decimatedContours: decimated, decimatedPtCount, rawPts, kept, dropped,
    placement: {
      maxDisp3D: disps.length ? disps[disps.length - 1] : 0,
      p99Disp3D: disps.length ? disps[Math.min(disps.length - 1, Math.floor(0.99 * disps.length))] : 0,
      sampledN: disps.length,
    },
  };
}

interface BandedgeLocal { inner: IsolevelLocal; outer: IsolevelLocal; totalPts: number }

function extractBandedgeLocal(
  rA: (theta: number, z: number) => number, H: number,
  opts: typeof GBE_EXTRACT_DEFAULT, params: GyroidFieldParams, periodicU: boolean,
): BandedgeLocal {
  const iso = wallIsolevels(params);
  const inner = extractIsolevelLocal(iso.inner, rA, H, opts, params, periodicU);
  const outer = extractIsolevelLocal(iso.outer, rA, H, opts, params, periodicU);
  return { inner, outer, totalPts: inner.decimatedPtCount + outer.decimatedPtCount };
}

function flattenAllPts(contours: Contour[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const c of contours) for (const p of c.pts) out.push(p);
  return out;
}

// ─────────────────────────── build plumbing (mirrors _tierc_a4_diag.test.ts's
// buildOffWithStats — 'off'-policy only, no multiCurveCellPolicy so it defaults 'off') ───────────

interface OffBuild {
  vertices: Float32Array; // packed (u, t, surfaceId)
  indices: Uint32Array;
  hash: string;
  uBias: number;
  cdtStatsOuter: CdtStats | undefined;
  buildMs: number;
}

function buildOffTwin(
  rA: (theta: number, z: number) => number,
  bandedge: { inner: { decimatedContours: Contour[] }; outer: { decimatedContours: Contour[] } },
): OffBuild {
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
    featureLevel: AF_PROD_OPTS.featureLevel,
    outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    outerEfgSampler,
    innerEfgSampler,
    // NO multiCurveCellPolicy -> defaults 'off' (the A1/A2/A4-measured pre-existing baseline;
    // orthogonal to A4a — this arm only changes the contour-linking INPUT, not the kernel policy).
  };
  const asm = assembleWatertight(
    outer.sampler, inner.sampler,
    { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN }, assemblyOpts,
  );
  return {
    vertices: asm.vertices,
    indices: asm.indices,
    hash: fnvHash(asm.vertices, asm.indices),
    uBias,
    cdtStatsOuter: asm.cdtStats?.outer,
    buildMs: Date.now() - t0,
  };
}

// ─────────────────────────── Map-free full-mesh edge classification (mirrors
// _tierc_a4_diag.test.ts's classifyAllDefects/resolveDefectLoci numeric algorithm, generalized
// only to what THIS probe needs) ───────────────────────────

type DefectKind = 'boundary' | 'nonManifold' | 'orientationMismatch';
const KEY_MUL = 134217728; // 2^27 — matches topologyMetric's / A4-diag's packed-key convention

function classifyAllDefects(indices: Uint32Array): {
  offenders: Map<number, { total: number; forward: number; kind: DefectKind }>;
  counts: { boundary: number; nonManifold: number; orientationMismatch: number; totalEdges: number };
} {
  const n = indices.length - (indices.length % 3);
  const all = new Float64Array(n);
  const fwd = new Float64Array(n);
  let m = 0;
  let mf = 0;
  for (let k = 0; k < n; k += 3) {
    const v0 = indices[k], v1 = indices[k + 1], v2 = indices[k + 2];
    if (v0 === v1 || v1 === v2 || v0 === v2) continue;
    for (const [a, b] of [[v0, v1], [v1, v2], [v2, v0]] as const) {
      if (a === b) continue;
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const key = lo * KEY_MUL + hi;
      all[m++] = key;
      if (a === lo) fwd[mf++] = key;
    }
  }
  const A = all.subarray(0, m);
  A.sort();
  const F = fwd.subarray(0, mf);
  F.sort();
  const offenders = new Map<number, { total: number; forward: number; kind: DefectKind }>();
  let boundary = 0, nonManifold = 0, orientationMismatch = 0, totalEdges = 0, fi = 0;
  for (let i = 0; i < m; ) {
    const k = A[i];
    let j = i + 1;
    while (j < m && A[j] === k) j++;
    const total = j - i;
    totalEdges++;
    while (fi < mf && F[fi] < k) fi++;
    let forward = 0;
    while (fi < mf && F[fi] === k) { forward++; fi++; }
    let kind: DefectKind | null = null;
    if (total === 1) { kind = 'boundary'; boundary++; }
    else if (total > 2) { kind = 'nonManifold'; nonManifold++; }
    else if (total === 2 && forward !== 1) { kind = 'orientationMismatch'; orientationMismatch++; }
    if (kind) offenders.set(k, { total, forward, kind });
    i = j;
  }
  return { offenders, counts: { boundary, nonManifold, orientationMismatch, totalEdges } };
}

interface LociLite { kind: DefectKind; mult: number; forward: number; midU: number; midT: number }

function resolveLociLite(
  indices: Uint32Array, vertices: Float32Array,
  offenders: Map<number, { total: number; forward: number; kind: DefectKind }>,
): LociLite[] {
  const n = indices.length - (indices.length % 3);
  const results: LociLite[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < n; k += 3) {
    const v0 = indices[k], v1 = indices[k + 1], v2 = indices[k + 2];
    if (v0 === v1 || v1 === v2 || v0 === v2) continue;
    for (const [a, b] of [[v0, v1], [v1, v2], [v2, v0]] as const) {
      if (a === b) continue;
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const key = lo * KEY_MUL + hi;
      const off = offenders.get(key);
      if (!off || seen.has(key)) continue;
      seen.add(key);
      const au = vertices[lo * 3], at = vertices[lo * 3 + 1];
      const bu = vertices[hi * 3], bt = vertices[hi * 3 + 1];
      const mu = ((au + bu) / 2) - Math.floor((au + bu) / 2);
      const mt = (at + bt) / 2;
      results.push({ kind: off.kind, mult: off.total, forward: off.forward, midU: mu, midT: mt });
    }
  }
  return results;
}

// ─────────────────────────── mechanism verification: seam-torn endpoint scan ───────────────────

interface SeamEndpoint { u: number; t: number; distToSeam: number; source: string }

function seamTornEndpoints(contours: Contour[], label: string, cellU: number): SeamEndpoint[] {
  const out: SeamEndpoint[] = [];
  for (const c of contours) {
    if (c.pts.length === 0) continue;
    const first = c.pts[0];
    const last = c.pts[c.pts.length - 1];
    for (const [u, t] of [first, last]) {
      const d = periodicUDistToSeam(u);
      if (d <= cellU) out.push({ u, t, distToSeam: d, source: label });
    }
  }
  return out;
}

function percentiles(arr: number[]): { min: number; p50: number; p90: number; p99: number; max: number } {
  if (arr.length === 0) return { min: 0, p50: 0, p90: 0, p99: 0, max: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const pct = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: s[s.length - 1] };
}

// ─────────────────────────── geometric diff-confinement (Map-free sorted-key symmetric diff over
// the FULL packed (u,t,surfaceId) vertex sets — proves whether the fix moved ANY geometry outside
// the seam neighborhood, rather than assuming it from the code-level argument alone) ─────────────

interface VKey { key: number; u: number; t: number; s: number }

function quantizedKeys(vertices: Float32Array): VKey[] {
  const nV = vertices.length / 3;
  const out: VKey[] = new Array(nV);
  for (let i = 0; i < nV; i++) {
    const u = vertices[i * 3], t = vertices[i * 3 + 1], s = vertices[i * 3 + 2];
    const qU = Math.round((u + 2) * 1e5); // offset +2 to keep small negative drift positive
    const qT = Math.round((t + 200) * 1e5); // t/s span base+drain rows too — generous offset
    const qS = Math.round(s * 10);
    out[i] = { key: qU * 2e7 + qT * 100 + qS, u, t, s };
  }
  out.sort((a, b) => a.key - b.key);
  return out;
}

function symmetricDiff(
  a: VKey[], b: VKey[], sampleCap = 5000,
): { onlyACount: number; onlyBCount: number; common: number; onlyASample: VKey[]; onlyBSample: VKey[] } {
  let i = 0, j = 0, onlyACount = 0, onlyBCount = 0, common = 0;
  const onlyASample: VKey[] = [];
  const onlyBSample: VKey[] = [];
  while (i < a.length && j < b.length) {
    if (a[i].key === b[j].key) { common++; i++; j++; }
    else if (a[i].key < b[j].key) { onlyACount++; if (onlyASample.length < sampleCap) onlyASample.push(a[i]); i++; }
    else { onlyBCount++; if (onlyBSample.length < sampleCap) onlyBSample.push(b[j]); j++; }
  }
  while (i < a.length) { onlyACount++; if (onlyASample.length < sampleCap) onlyASample.push(a[i]); i++; }
  while (j < b.length) { onlyBCount++; if (onlyBSample.length < sampleCap) onlyBSample.push(b[j]); j++; }
  return { onlyACount, onlyBCount, common, onlyASample, onlyBSample };
}

// ─────────────────────────── outer-submesh extraction + 3D evaluation (mirrors
// _gyroid_bandedge_lib.ts's buildGbeTwin outer-eval block) ───────────────────

function outerSubmesh(vertices: Float32Array, indices: Uint32Array): { subVerts: Float32Array; subIdx: Uint32Array } {
  const nV = vertices.length / 3;
  const mask = new Uint8Array(nV);
  for (let j = 0; j < nV; j++) mask[j] = vertices[j * 3 + 2] < 0.5 ? 1 : 0;
  const sub = extractOuterWallSubmesh(vertices, indices, mask);
  return { subVerts: sub.vertices, subIdx: sub.indices };
}

function evalOuterXyz(subVerts: Float32Array, rA: (theta: number, z: number) => number, H: number): Float32Array {
  const outerXyz = new Float32Array(subVerts.length);
  for (let v = 0; v < subVerts.length; v += 3) {
    const u = subVerts[v] - Math.floor(subVerts[v]);
    const t = subVerts[v + 1];
    const theta = u * TAU;
    const z = t * H;
    const r = rA(theta, z);
    outerXyz[v] = r * Math.cos(theta);
    outerXyz[v + 1] = r * Math.sin(theta);
    outerXyz[v + 2] = z;
  }
  return outerXyz;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A4a orientation-seam fix (opt-in)', () => {
  it(
    'periodic-u linkSegments weld: mechanism verify + build both + measure the A4a gate',
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;
      const UMARGIN = 1.5 / (1 << AF_PROD_OPTS.featureLevel);
      const SEAM_CELL_U = 1 / GBE_EXTRACT_DEFAULT.nu;

      // ── STAGE 1: baseline extraction (REAL, unmodified production entry point) ──────────────
      const t1 = Date.now();
      const bandedgeBaseline = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      crumb('stage1-extract-baseline-done', {
        ms: Date.now() - t1, totalPts: bandedgeBaseline.totalPts,
        innerPolylines: bandedgeBaseline.inner.decimatedContours.length,
        outerPolylines: bandedgeBaseline.outer.decimatedContours.length,
      });

      // ── STAGE 2: baseline 'off'-policy build — must reproduce the banked hash ───────────────
      const t2 = Date.now();
      const off = buildOffTwin(rA, bandedgeBaseline);
      crumb('stage2-build-baseline-done', { ms: Date.now() - t2, hash: off.hash, fullTris: off.indices.length / 3 });
      expect(off.hash, 'baseline off build must reproduce the A1/A2/A4-proven banked hash').toBe(EXPECT_HASH);

      // ── STAGE 3: classify baseline defects (Map-free), cross-checked vs topologyMetric ──────
      const t3 = Date.now();
      const { offenders: offBaseline, counts: countsBaseline } = classifyAllDefects(off.indices);
      const topoBaseline = topologyMetric({ vertices: off.vertices, indices: off.indices }, 0);
      crumb('stage3-classify-baseline-done', {
        ms: Date.now() - t3, mine: countsBaseline, topologyMetric: topoBaseline,
        a1a4Reported: { boundary: 360, orientationMismatch: 652, nonManifold: 3 },
        cdtStatsOuter: off.cdtStatsOuter
          ? { inversions: off.cdtStatsOuter.inversions, drops: off.cdtStatsOuter.drops }
          : null,
      });
      expect(topoBaseline.boundaryEdges, 'topologyMetric vs Map-free classifier must agree (boundary)').toBe(countsBaseline.boundary);
      expect(topoBaseline.nonManifoldEdges, 'topologyMetric vs Map-free classifier must agree (nonManifold)').toBe(countsBaseline.nonManifold);
      expect(topoBaseline.orientationMismatches, 'topologyMetric vs Map-free classifier must agree (orientation)').toBe(countsBaseline.orientationMismatch);
      const lociBaseline = resolveLociLite(off.indices, off.vertices, offBaseline);

      // ── STAGE 4: mechanism verification — seam-torn endpoint scan + co-location ─────────────
      const t4 = Date.now();
      const innerEnds = seamTornEndpoints(bandedgeBaseline.inner.decimatedContours, 'inner', SEAM_CELL_U);
      const outerEnds = seamTornEndpoints(bandedgeBaseline.outer.decimatedContours, 'outer', SEAM_CELL_U);
      const allSeamEnds = [...innerEnds, ...outerEnds];
      const T_BAND_PRECISE: [number, number] = [0.30, 0.40]; // A4-diagnosis's own measured decile
      const T_BAND_TASK: [number, number] = [0.307, 0.333]; // task prompt's literal wording
      const inBandPrecise = allSeamEnds.filter((e) => e.t >= T_BAND_PRECISE[0] && e.t < T_BAND_PRECISE[1]);
      const inBandTask = allSeamEnds.filter((e) => e.t >= T_BAND_TASK[0] && e.t <= T_BAND_TASK[1]);
      const orientLoci = lociBaseline.filter((l) => l.kind === 'orientationMismatch');
      const R_COLOC = 0.003;
      let colocated = 0;
      const nearestDists: number[] = [];
      for (const l of orientLoci) {
        let best = Infinity;
        for (const e of inBandPrecise) {
          const d = Math.hypot(uDist(l.midU, e.u), l.midT - e.t);
          if (d < best) best = d;
        }
        nearestDists.push(best);
        if (best <= R_COLOC) colocated++;
      }
      const allSeamEndsBeyondMargin = allSeamEnds.filter((e) => e.distToSeam >= UMARGIN).length;
      const mechanismSummary = {
        seamCellU: SEAM_CELL_U, uMargin: UMARGIN,
        innerSeamTornEndpoints: innerEnds.length, outerSeamTornEndpoints: outerEnds.length,
        totalSeamTornEndpoints: allSeamEnds.length,
        inBandPrecise: inBandPrecise.length, inBandTask: inBandTask.length,
        distToSeamPercentiles: percentiles(allSeamEnds.map((e) => e.distToSeam)),
        orientLociCount: orientLoci.length,
        colocatedWithinRcoloc: colocated,
        colocatedFrac: orientLoci.length > 0 ? colocated / orientLoci.length : 0,
        nearestDistPercentiles: percentiles(nearestDists),
        allSeamEndsBeyondMargin, allSeamEndsBeyondMarginFrac: allSeamEnds.length > 0 ? allSeamEndsBeyondMargin / allSeamEnds.length : 0,
      };
      crumb('stage4-mechanism-done', { ms: Date.now() - t4, ...mechanismSummary });
      writeFileSync(join(OUT_DIR, 'armA4a_mechanism.json'), JSON.stringify({ mechanismSummary, sampleSeamEnds: allSeamEnds.slice(0, 50) }, null, 2));

      // ── STAGE 5: byte-identity proof (default-off === explicit-off === REAL entry point) ────
      const t5 = Date.now();
      const sampleIso = wallIsolevels(GBE_FIELD);
      const sampleSegs = marchAbsIso(sampleIso.inner, GBE_FIELD, {
        nu: GBE_EXTRACT_DEFAULT.nu, nt: GBE_EXTRACT_DEFAULT.nt, polishIters: GBE_EXTRACT_DEFAULT.polishIters,
      });
      const linkedDefault = linkSegments(sampleSegs);
      const linkedExplicitOff = linkSegments(sampleSegs, 1e-6, false);
      const linkSegmentsIdentical =
        linkedDefault.length === linkedExplicitOff.length &&
        linkedDefault.every((c, i) =>
          c.pts.length === linkedExplicitOff[i].pts.length &&
          c.pts.every((p, j) => p[0] === linkedExplicitOff[i].pts[j][0] && p[1] === linkedExplicitOff[i].pts[j][1]),
        );
      expect(linkSegmentsIdentical, 'linkSegments(segs) must equal linkSegments(segs,1e-6,false) element-wise').toBe(true);

      const localOff = extractBandedgeLocal(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD, false);
      const realFlat = flattenAllPts([...bandedgeBaseline.inner.decimatedContours, ...bandedgeBaseline.outer.decimatedContours]);
      const localFlat = flattenAllPts([...localOff.inner.decimatedContours, ...localOff.outer.decimatedContours]);
      const realPacked = Float32Array.from(realFlat.flatMap(([u, t]) => [u, t]));
      const localPacked = Float32Array.from(localFlat.flatMap(([u, t]) => [u, t]));
      const realHash = fnvHash(realPacked);
      const localOffHash = fnvHash(localPacked);
      crumb('stage5-byte-identity-done', {
        ms: Date.now() - t5, linkSegmentsIdentical,
        realPts: realFlat.length, localOffPts: localFlat.length, realHash, localOffHash,
        pipelineIdentical: realHash === localOffHash,
      });
      expect(realHash, 'local re-implementation at periodicU=false must reproduce the REAL extractBandedgeContours output bit-for-bit').toBe(localOffHash);

      // ── STAGE 6: PERIODIC extraction (the actual fix, periodicU=true) ───────────────────────
      const t6 = Date.now();
      const bandedgePeriodic = extractBandedgeLocal(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD, true);
      crumb('stage6-extract-periodic-done', {
        ms: Date.now() - t6, totalPts: bandedgePeriodic.totalPts,
        innerPolylines: bandedgePeriodic.inner.decimatedContours.length,
        outerPolylines: bandedgePeriodic.outer.decimatedContours.length,
        innerPolylinesDelta: bandedgePeriodic.inner.decimatedContours.length - bandedgeBaseline.inner.decimatedContours.length,
        outerPolylinesDelta: bandedgePeriodic.outer.decimatedContours.length - bandedgeBaseline.outer.decimatedContours.length,
      });

      // ── STAGE 7: PERIODIC 'off'-policy build ─────────────────────────────────────────────────
      const t7 = Date.now();
      const periodicOff = buildOffTwin(rA, bandedgePeriodic);
      crumb('stage7-build-periodic-done', {
        ms: Date.now() - t7, hash: periodicOff.hash, fullTris: periodicOff.indices.length / 3,
        hashChangedVsBaseline: periodicOff.hash !== off.hash,
        cdtStatsOuter: periodicOff.cdtStatsOuter
          ? { inversions: periodicOff.cdtStatsOuter.inversions, drops: periodicOff.cdtStatsOuter.drops }
          : null,
      });

      // ── STAGE 8: classify PERIODIC defects ───────────────────────────────────────────────────
      const t8 = Date.now();
      const { counts: countsPeriodic } = classifyAllDefects(periodicOff.indices);
      const topoPeriodic = topologyMetric({ vertices: periodicOff.vertices, indices: periodicOff.indices }, 0);
      crumb('stage8-classify-periodic-done', { ms: Date.now() - t8, mine: countsPeriodic, topologyMetric: topoPeriodic });
      expect(topoPeriodic.boundaryEdges, 'topologyMetric vs Map-free classifier must agree (boundary, periodic)').toBe(countsPeriodic.boundary);
      expect(topoPeriodic.orientationMismatches, 'topologyMetric vs Map-free classifier must agree (orientation, periodic)').toBe(countsPeriodic.orientationMismatch);

      // ── STAGE 9: geometric diff-confinement ──────────────────────────────────────────────────
      const t9 = Date.now();
      const keysBaseline = quantizedKeys(off.vertices);
      const keysPeriodic = quantizedKeys(periodicOff.vertices);
      const diff = symmetricDiff(keysBaseline, keysPeriodic);
      const SEAM_ZONE_U = 0.06; // generous vs A4's measured max uDist=0.05 for orientationMismatch
      const SEAM_ZONE_T: [number, number] = [0.25, 0.47]; // generous vs A4's measured 0.307-0.442
      const inSeamZone = (v: VKey): boolean =>
        periodicUDistToSeam(v.u) <= SEAM_ZONE_U && v.t >= SEAM_ZONE_T[0] && v.t <= SEAM_ZONE_T[1];
      const onlyAOutsideZone = diff.onlyASample.filter((v) => !inSeamZone(v));
      const onlyBOutsideZone = diff.onlyBSample.filter((v) => !inSeamZone(v));
      const diffSummary = {
        vertsBaseline: off.vertices.length / 3, vertsPeriodic: periodicOff.vertices.length / 3,
        onlyACount: diff.onlyACount, onlyBCount: diff.onlyBCount, common: diff.common,
        sampledOnlyA: diff.onlyASample.length, sampledOnlyB: diff.onlyBSample.length,
        onlyAOutsideSeamZone: onlyAOutsideZone.length, onlyBOutsideSeamZone: onlyBOutsideZone.length,
        allDiffsConfinedToSeamZone: onlyAOutsideZone.length === 0 && onlyBOutsideZone.length === 0,
      };
      crumb('stage9-geodiff-done', {
        ms: Date.now() - t9, ...diffSummary,
        sampleOutsideZoneA: onlyAOutsideZone.slice(0, 10), sampleOutsideZoneB: onlyBOutsideZone.slice(0, 10),
      });
      writeFileSync(join(OUT_DIR, 'armA4a_geodiff.json'), JSON.stringify({
        diffSummary,
        onlyASample: diff.onlyASample.slice(0, 200), onlyBSample: diff.onlyBSample.slice(0, 200),
      }, null, 2));

      // ── STAGE 10: fidelity re-score (prescreen + stratified Newton + coverage), BOTH outer
      // submeshes — skipped ONLY if the two full-assembly hashes are already byte-identical
      // (in which case fidelity is trivially, provably Delta0% — no re-score needed). ───────────
      const t10 = Date.now();
      const meshesIdentical = off.hash === periodicOff.hash;
      let fidelityBaseline: {
        outerTris: number; survivors: number; estOutliers: number; newtonWorst: number;
        kneeClass: { wallBand: number; kneeAdjacent: number; offBand: number };
        coverageMax: number; coverageP99: number;
      } | null = null;
      let fidelityPeriodic: typeof fidelityBaseline = null;
      if (!meshesIdentical) {
        const subBase = outerSubmesh(off.vertices, off.indices);
        const xyzBase = evalOuterXyz(subBase.subVerts, rA, H);
        const preBase = gpcPrescreenDetail(xyzBase, subBase.subIdx, rA, H, TOL);
        const stratBase = gpcStratifiedNewton(preBase.recs, rA, H, TOL, { topExhaustive: 200, strata: 8, perStratum: 225 });
        const covBase = gpcScoreCoverage(xyzBase, subBase.subIdx, rA, H, TOL);
        fidelityBaseline = {
          outerTris: subBase.subIdx.length / 3, survivors: preBase.recs.length,
          estOutliers: stratBase.estOutliers, newtonWorst: stratBase.newtonWorst, kneeClass: stratBase.kneeClass,
          coverageMax: covBase.max, coverageP99: covBase.p99,
        };
        crumb('stage10-fidelity-baseline-done', { ms: Date.now() - t10, ...fidelityBaseline });

        const t10b = Date.now();
        const subPer = outerSubmesh(periodicOff.vertices, periodicOff.indices);
        const xyzPer = evalOuterXyz(subPer.subVerts, rA, H);
        const prePer = gpcPrescreenDetail(xyzPer, subPer.subIdx, rA, H, TOL);
        const stratPer = gpcStratifiedNewton(prePer.recs, rA, H, TOL, { topExhaustive: 200, strata: 8, perStratum: 225 });
        const covPer = gpcScoreCoverage(xyzPer, subPer.subIdx, rA, H, TOL);
        fidelityPeriodic = {
          outerTris: subPer.subIdx.length / 3, survivors: prePer.recs.length,
          estOutliers: stratPer.estOutliers, newtonWorst: stratPer.newtonWorst, kneeClass: stratPer.kneeClass,
          coverageMax: covPer.max, coverageP99: covPer.p99,
        };
        crumb('stage10-fidelity-periodic-done', { ms: Date.now() - t10b, ...fidelityPeriodic });
      } else {
        crumb('stage10-SKIPPED-hashes-identical', { ms: Date.now() - t10 });
      }

      // ── STAGE 11: gate verdict (computed + logged, NEVER tuned to pass) ──────────────────────
      const orientPass = countsPeriodic.orientationMismatch <= 15;
      const boundaryDelta = countsPeriodic.boundary - countsBaseline.boundary;
      const boundaryDropped = boundaryDelta < -5;
      const boundaryUnchanged = Math.abs(boundaryDelta) <= 5;
      const nonManUnchanged = countsPeriodic.nonManifold === countsBaseline.nonManifold;
      const outerTrisDeltaPct = fidelityBaseline && fidelityPeriodic
        ? ((fidelityPeriodic.outerTris - fidelityBaseline.outerTris) / fidelityBaseline.outerTris) * 100
        : 0;
      const fidelityDelta0 = meshesIdentical || (
        fidelityBaseline !== null && fidelityPeriodic !== null &&
        Math.abs(outerTrisDeltaPct) <= 0.5 &&
        Math.abs(fidelityPeriodic.newtonWorst - fidelityBaseline.newtonWorst) <= 0.05 * Math.max(fidelityBaseline.newtonWorst, 1e-6) &&
        Math.abs(fidelityPeriodic.coverageMax - fidelityBaseline.coverageMax) <= 0.10 * Math.max(fidelityBaseline.coverageMax, 1e-6) &&
        fidelityPeriodic.kneeClass.offBand === fidelityBaseline.kneeClass.offBand
      );
      const geoDiffConfined = diff.onlyASample.filter((v) => !inSeamZone(v)).length === 0 &&
        diff.onlyBSample.filter((v) => !inSeamZone(v)).length === 0;
      const verdict = boundaryDropped
        ? 'HALT-RECLASSIFY: boundary count DROPPED on the periodic build — the two mechanisms are coupled, not independent as A4-diagnosis assumed. Do not celebrate the orientation number without re-diagnosing.'
        : orientPass && boundaryUnchanged && nonManUnchanged && fidelityDelta0
          ? 'PASS'
          : 'FAIL (reported, not tuned): linkSegments periodic-u weld did not clear the gate.';

      const gateTable = {
        before: { ...countsBaseline, topologyMetric: topoBaseline },
        after: { ...countsPeriodic, topologyMetric: topoPeriodic },
        orientPass, boundaryDelta, boundaryDropped, boundaryUnchanged, nonManUnchanged,
        meshesIdentical, outerTrisDeltaPct, fidelityDelta0, geoDiffConfined,
        fidelityBaseline, fidelityPeriodic,
        verdict,
      };
      crumb('stage11-verdict', gateTable as unknown as Record<string, unknown>);
      writeFileSync(join(OUT_DIR, 'armA4a_gate.json'), JSON.stringify({
        mechanismSummary, diffSummary, gateTable,
        impact: {
          gitnexusRisk: 'LOW', impactedCount: 1,
          callers: ['_gyroid_close.test.ts (3 call sites)', '_gyroid_bandedge_lib.ts extractIsolevel (1 call site)'],
          allCallSitesUseLteTwoArgs: true,
        },
      }, null, 2));

      // eslint-disable-next-line no-console
      console.log(`[armA4a] DONE\n${JSON.stringify(gateTable, null, 2)}`);

      // ── non-vacuity witnesses (hard) ──────────────────────────────────────────────────────────
      const quickNonManPeriodic = nonManRawBig(periodicOff.indices);
      crumb('nonvacuity-check', { quickNonManPeriodic, countsBaseline, countsPeriodic });
      expect(countsBaseline.orientationMismatch, 'baseline defect population must be non-vacuous (reproduces A1/A4)').toBeGreaterThan(600);
      expect(countsBaseline.boundary, 'baseline boundary population must be non-vacuous (reproduces A1/A4)').toBeGreaterThan(300);
    },
    ISO_TIMEOUT_MS,
  );
});
