// _tierc_a4_diag.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A4 (DIAGNOSIS ONLY, no fix).
//
// QUESTION (research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md Addendum 3, A4): the doubled
// band-edge Gyroid full assembly (4,365,677 tris, policy 'off') carries 360 BOUNDARY edges +
// ~652 ORIENTATION-mismatched facets, real by index (A1: weld=0 == weld=1e-4), pre-existing
// (A1: unaffected by fanRepair — 360->360, 652->651), on the OUTER wall only. WHY? Is it the SAME
// near-tangent-doubled-curve root cause A2 fixed for the 3 mult=3 non-manifold loci (just the
// under-shared/winding manifestation), or a DIFFERENT mechanism (T-junction at cell seams, sliver
// drops elsewhere along the curve, clip-boundary handling)?
//
// METHOD: build the SAME 'off'-policy Delta2-exact twin construction A1/A2 measured (reusing
// _tierc_a1_orient.test.ts's buildFanRepairFull plumbing, minus multiCurveCellPolicy so it
// defaults to 'off'), keeping the PACKED (u,t,surfaceId) vertex buffer directly (no xyz
// evaluation / analytic inverse needed — classifyNonManLoci's own pattern, generalized to
// boundary + orientationMismatch, not just nonManifold). Also captures
// WatertightAssemblyResult.cdtStats.outer — an ALREADY-WIRED Stage-0 instrument
// (ConstrainedCellTriangulator.ts's inversionCount/droppedCount per cell) no prior Gyroid probe
// has read — giving near-free per-cell ground truth for "did this cell's local CDT fold a
// triangle (inversion, an orientation-mismatch candidate) or drop a degenerate one (a boundary-
// hole candidate)?", cross-referenced against my own edge-topology localization.
//
// RULES: NEW FILE ONLY. Read-only on all src/ and committed research libs (this is diagnosis —
// no fix is proposed in code). DEV-ONLY, research/ never imported by src/. Commit nothing.
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
  type BandedgeExtraction,
} from './_gyroid_bandedge_lib';
import { gyroidVal, type Contour } from './_gyroidContourLib';
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
import type {
  CdtStats,
  CdtCellIncident,
} from '../../src/renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';

const ON = process.env.PF_TIERC_A4DIAG === '1';
const OUT_DIR = join('research', 'exchange', 'tierc');
const CRUMB_PATH = join(OUT_DIR, 'armA4_crumbs.ndjson');
const ISO_TIMEOUT_MS = 20 * 60 * 1000;
/** A1/A2-proven 'off' banked twin hash (2,242,987 outer / 4,365,677 full) — the non-vacuity
 *  witness that this build is the EXACT SAME construction A1 measured 360/652/3 on. */
const EXPECT_HASH = 'f033dbf5-b5f9fb84';
/** The 3 known step-0.15 non-manifold loci (champion-spec-gyroid.md §1.5 table) — the reference
 *  class ALREADY characterized as near-tangent doubled-curve degenerate slivers. */
const KNOWN_LOCI: Array<[number, number]> = [
  [0.6448, 0.8931],
  [0.5231, 0.4162],
  [0.4384, 0.4421],
];

function crumb(stage: string, extra?: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  try {
    appendFileSync(
      CRUMB_PATH,
      JSON.stringify({ arm: 'A4-diag', stage, pid: process.pid, at: new Date().toISOString(), ...extra }) + '\n',
    );
  } catch {
    /* a breadcrumb must never kill the run */
  }
}

function heapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

/** Periodic-u distance (matches classifyNonManLoci's own uDist exactly). */
function uDist(ua: number, ub: number): number {
  const d = Math.abs((ua - Math.floor(ua)) - (ub - Math.floor(ub)));
  return Math.min(d, 1 - d);
}

function percentiles(arr: number[]): {
  min: number; p25: number; p50: number; p75: number; p90: number; p99: number; max: number;
} {
  if (arr.length === 0) return { min: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, max: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const pct = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { min: s[0], p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), p99: pct(0.99), max: s[s.length - 1] };
}

// ─────────────────────────── build plumbing (copied from _tierc_a1_orient.test.ts's
// buildFanRepairFull, MINUS multiCurveCellPolicy so it defaults to 'off' — the A1/A2-measured
// pre-existing baseline) ───────────────────────────

interface OffBuild {
  vertices: Float32Array; // packed (u, t, surfaceId)
  indices: Uint32Array;
  hash: string;
  uBias: number;
  cdtStatsOuter: CdtStats | undefined;
  buildMs: number;
}

function buildOffWithStats(
  rA: (theta: number, z: number) => number,
  bandedge: BandedgeExtraction,
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
    // NO multiCurveCellPolicy -> defaults 'off' (the A1/A2-measured pre-existing baseline).
  };
  const asm = assembleWatertight(
    outer.sampler, inner.sampler,
    { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN }, assemblyOpts,
  );
  const hash = fnvHash(asm.vertices, asm.indices);
  return {
    vertices: asm.vertices,
    indices: asm.indices,
    hash,
    uBias,
    cdtStatsOuter: asm.cdtStats?.outer,
    buildMs: Date.now() - t0,
  };
}

// ─────────────────────────── Map-free full-mesh edge classification (mirrors
// src/fidelity/metrics.ts's topologyMetric numeric algorithm + _gyroid_bandedge_lib.ts's
// classifyNonManLoci offender-resolution pattern, generalized to ALL three topology defect
// kinds) ───────────────────────────

type DefectKind = 'boundary' | 'nonManifold' | 'orientationMismatch';
const KEY_MUL = 134217728; // 2^27 — matches topologyMetric's packed-key convention (lo < 2^26)

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
    const v0 = indices[k];
    const v1 = indices[k + 1];
    const v2 = indices[k + 2];
    if (v0 === v1 || v1 === v2 || v0 === v2) continue;
    for (const [a, b] of [[v0, v1], [v1, v2], [v2, v0]] as const) {
      if (a === b) continue;
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
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
  let boundary = 0;
  let nonManifold = 0;
  let orientationMismatch = 0;
  let totalEdges = 0;
  let fi = 0;
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

interface DefectLocus {
  kind: DefectKind;
  a: number; b: number; mult: number; forward: number; reverse: number;
  aUt: [number, number, number]; bUt: [number, number, number];
  midU: number; midT: number;
  midAbsVal: number; dEdgeIso: number;
  dInnerCtr: number; dOuterCtr: number;
  crossIsolevelNear: boolean;
  aOnContour: boolean; bOnContour: boolean;
  aOnGridLine: boolean; bOnGridLine: boolean;
  nearUSeam: boolean;
  dCoincidentSeam: number;
  distToKnownLocus: number;
  mechanismGuess: string;
}

function flattenPts(contours: Contour[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const c of contours) for (const pt of c.pts) out.push(pt);
  return out;
}

function resolveDefectLoci(
  indices: Uint32Array,
  vertices: Float32Array,
  offenders: Map<number, { total: number; forward: number; kind: DefectKind }>,
  bandedge: BandedgeExtraction,
  uBias: number,
  coincidentSeamPts: Array<[number, number]>,
): DefectLocus[] {
  const n = indices.length - (indices.length % 3);
  const innerPts = flattenPts(bandedge.inner.decimatedContours);
  const outerPts = flattenPts(bandedge.outer.decimatedContours);
  const nearestDist = (u: number, t: number, pts: Array<[number, number]>): number => {
    let best = Infinity;
    for (const [cu, ct] of pts) {
      const d = Math.hypot(uDist(u, cu), t - ct);
      if (d < best) best = d;
    }
    return best;
  };
  const onContour = (u: number, t: number): boolean => {
    const eps = 2e-6;
    for (const pts of [innerPts, outerPts]) {
      for (const [cu, ct] of pts) {
        if (uDist(u, cu) <= eps && Math.abs(t - ct) <= eps) return true;
      }
    }
    return false;
  };
  const FEATURE_LEVEL = AF_PROD_OPTS.featureLevel;
  const uGridStep = 1 / (1 << (FEATURE_LEVEL + uBias));
  const tGridStep = 1 / (1 << FEATURE_LEVEL);
  const nearGrid = (x: number, step: number): boolean => {
    const eps = 3e-6; // float32 packed-vertex precision, matches onContour's own eps choice
    const frac = x / step;
    const distToGrid = Math.abs(frac - Math.round(frac)) * step;
    return distToGrid <= eps;
  };
  const uSeamMargin = 1.5 / (1 << FEATURE_LEVEL);
  const CROSS_THRESH = 0.001; // ~2 featureLevel-11 cells (1/2048 ~= 0.000488), matches the 3
  // known loci's own measured dInnerCtr/dOuterCtr range (0.000126-0.000820)
  const results: DefectLocus[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < n; k += 3) {
    const v0 = indices[k];
    const v1 = indices[k + 1];
    const v2 = indices[k + 2];
    if (v0 === v1 || v1 === v2 || v0 === v2) continue;
    for (const [a, b] of [[v0, v1], [v1, v2], [v2, v0]] as const) {
      if (a === b) continue;
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      const key = lo * KEY_MUL + hi;
      const off = offenders.get(key);
      if (!off || seen.has(key)) continue;
      seen.add(key);
      const aUt: [number, number, number] = [vertices[lo * 3], vertices[lo * 3 + 1], vertices[lo * 3 + 2]];
      const bUt: [number, number, number] = [vertices[hi * 3], vertices[hi * 3 + 1], vertices[hi * 3 + 2]];
      const mu = ((aUt[0] + bUt[0]) / 2) - Math.floor((aUt[0] + bUt[0]) / 2);
      const mt = (aUt[1] + bUt[1]) / 2;
      const midAbsVal = Math.abs(gyroidVal(mu, mt, GBE_FIELD));
      const dInnerCtr = nearestDist(mu, mt, innerPts);
      const dOuterCtr = nearestDist(mu, mt, outerPts);
      let distToKnownLocus = Infinity;
      for (const [ku, kt] of KNOWN_LOCI) {
        const d = Math.hypot(uDist(mu, ku), mt - kt);
        if (d < distToKnownLocus) distToKnownLocus = d;
      }
      let dCoincidentSeam = Infinity;
      for (const [su, st] of coincidentSeamPts) {
        const d = Math.hypot(uDist(mu, su), mt - st);
        if (d < dCoincidentSeam) dCoincidentSeam = d;
      }
      const aOnGridLine = nearGrid(aUt[0], uGridStep) || nearGrid(aUt[1], tGridStep);
      const bOnGridLine = nearGrid(bUt[0], uGridStep) || nearGrid(bUt[1], tGridStep);
      const aOnContour = onContour(aUt[0], aUt[1]);
      const bOnContour = onContour(bUt[0], bUt[1]);
      const nearUSeamFlag =
        Math.min(aUt[0] - Math.floor(aUt[0]), 1 - (aUt[0] - Math.floor(aUt[0]))) <= uSeamMargin ||
        Math.min(bUt[0] - Math.floor(bUt[0]), 1 - (bUt[0] - Math.floor(bUt[0]))) <= uSeamMargin;
      const mechanismGuess = nearUSeamFlag
        ? 'seam-clip'
        : aOnGridLine || bOnGridLine
          ? 'grid-line-Tjunction'
          : aOnContour && bOnContour
            ? 'interior-constraint-drop'
            : 'other';
      results.push({
        kind: off.kind, a: lo, b: hi, mult: off.total, forward: off.forward, reverse: off.total - off.forward,
        aUt, bUt, midU: mu, midT: mt, midAbsVal,
        dEdgeIso: Math.min(Math.abs(midAbsVal - 0.135), Math.abs(midAbsVal - 0.15)),
        dInnerCtr, dOuterCtr, crossIsolevelNear: dInnerCtr <= CROSS_THRESH && dOuterCtr <= CROSS_THRESH,
        aOnContour, bOnContour, aOnGridLine, bOnGridLine, nearUSeam: nearUSeamFlag,
        dCoincidentSeam, distToKnownLocus, mechanismGuess,
      });
    }
  }
  return results;
}

// ─────────────────────────── polyline-endpoint self-touch diagnostic (tests whether
// linkSegments' single-direction greedy chaining fragments one physical curve into MULTIPLE
// Contour objects sharing a position-coincident endpoint — a candidate SYSTEMIC mechanism
// distinct from cross-isolevel near-tangency) ───────────────────────────

interface EndpointRec { u: number; t: number; polyIdx: number; }

function collectEndpoints(contours: Contour[]): EndpointRec[] {
  const out: EndpointRec[] = [];
  contours.forEach((c, i) => {
    if (c.pts.length === 0) return;
    out.push({ u: c.pts[0][0], t: c.pts[0][1], polyIdx: i });
    const last = c.pts[c.pts.length - 1];
    out.push({ u: last[0], t: last[1], polyIdx: i });
  });
  return out;
}

function coincidentEndpointPairs(
  endpoints: EndpointRec[], thresh: number,
): { pairs: number; hist: { min: number; p50: number; p90: number; p99: number }; pts: Array<[number, number]> } {
  const dists: number[] = [];
  const pts: Array<[number, number]> = [];
  let pairs = 0;
  for (let i = 0; i < endpoints.length; i++) {
    let best = Infinity;
    for (let j = 0; j < endpoints.length; j++) {
      if (i === j || endpoints[j].polyIdx === endpoints[i].polyIdx) continue;
      const d = Math.hypot(uDist(endpoints[i].u, endpoints[j].u), endpoints[i].t - endpoints[j].t);
      if (d < best) best = d;
    }
    dists.push(best);
    if (best <= thresh) { pairs++; pts.push([endpoints[i].u, endpoints[i].t]); }
  }
  const p = percentiles(dists);
  return { pairs, hist: { min: p.min, p50: p.p50, p90: p.p90, p99: p.p99 }, pts };
}

// ─────────────────────────── local patch dump (Q2: "emitted triangles" + "constraint
// geometry") — 2-ring BFS via typed-array scans over the REAL assembled mesh (faithful; no
// re-simulated window prone to its own artificial boundary) ───────────────────────────

interface PatchTri { verts: Array<[number, number, number, number]>; signedAreaUV: number; }

function localPatch(
  indices: Uint32Array, vertices: Float32Array, seeds: number[], rings: number,
): PatchTri[] {
  let frontier = new Set<number>(seeds);
  let patchTriIdx: number[] = [];
  for (let r = 0; r < rings; r++) {
    const newTris: number[] = [];
    for (let k = 0; k < indices.length; k += 3) {
      const v0 = indices[k];
      const v1 = indices[k + 1];
      const v2 = indices[k + 2];
      if (frontier.has(v0) || frontier.has(v1) || frontier.has(v2)) newTris.push(k / 3);
    }
    patchTriIdx = newTris;
    const nextFrontier = new Set<number>();
    for (const ti of patchTriIdx) {
      nextFrontier.add(indices[ti * 3]);
      nextFrontier.add(indices[ti * 3 + 1]);
      nextFrontier.add(indices[ti * 3 + 2]);
    }
    frontier = nextFrontier;
  }
  return patchTriIdx.map((ti) => {
    const v0 = indices[ti * 3];
    const v1 = indices[ti * 3 + 1];
    const v2 = indices[ti * 3 + 2];
    const u0 = vertices[v0 * 3];
    const t0v = vertices[v0 * 3 + 1];
    const u1 = vertices[v1 * 3];
    const t1v = vertices[v1 * 3 + 1];
    const u2 = vertices[v2 * 3];
    const t2v = vertices[v2 * 3 + 1];
    const signedAreaUV = (u1 - u0) * (t2v - t0v) - (u2 - u0) * (t1v - t0v);
    const verts: Array<[number, number, number, number]> = [v0, v1, v2].map(
      (vi): [number, number, number, number] => [vertices[vi * 3], vertices[vi * 3 + 1], vertices[vi * 3 + 2], vi],
    );
    return { verts, signedAreaUV };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════

describe.skipIf(!ON)('E-2026-07-11-TIERC-HEADTOHEAD Arm A4 boundary/orientation DIAGNOSIS (read-only)', () => {
  it(
    'localizes + characterizes the 360 boundary / 652 orientation-mismatch band-edge defect',
    () => {
      mkdirSync(OUT_DIR, { recursive: true });
      const heapMB = heapLimitMB();
      crumb('start', { heapLimitMB: heapMB });
      expect(heapMB, 'NODE_OPTIONS=--max-old-space-size=12288 must propagate').toBeGreaterThanOrEqual(8192);

      const manifest = getManifest('GyroidManifold');
      const rA = manifest.truth.rA;
      const { H } = TIERC_COMMON_DIMS;

      // ── STAGE 1: extraction ──────────────────────────────────────────────
      const tExtract = Date.now();
      const bandedge = extractBandedgeContours(rA, H, GBE_EXTRACT_DEFAULT, GBE_FIELD);
      crumb('extract-done', {
        ms: Date.now() - tExtract, totalPts: bandedge.totalPts,
        innerPolylines: bandedge.inner.decimatedContours.length,
        outerPolylines: bandedge.outer.decimatedContours.length,
      });

      // ── STAGE 2: 'off'-policy full build (the A1/A2 baseline) + cdtStats ─
      const tBuild = Date.now();
      const off = buildOffWithStats(rA, bandedge);
      crumb('build-done', {
        ms: Date.now() - tBuild, hash: off.hash, fullTris: off.indices.length / 3, uBias: off.uBias,
        cdtStatsOuter: off.cdtStatsOuter
          ? { inversions: off.cdtStatsOuter.inversions, drops: off.cdtStatsOuter.drops, incidentsCaptured: off.cdtStatsOuter.incidents.length }
          : null,
      });
      expect(off.hash, 'off build must reproduce the A1/A2-proven banked hash — non-vacuity witness').toBe(EXPECT_HASH);
      if (off.cdtStatsOuter) {
        writeFileSync(join(OUT_DIR, 'armA4_cdtIncidents.json'), JSON.stringify(off.cdtStatsOuter, null, 2));
      }
      crumb('cdtStats-dumped');

      // ── STAGE 3: full-mesh Map-free topology classification ─────────────
      const tClassify = Date.now();
      const { offenders, counts } = classifyAllDefects(off.indices);
      crumb('classify-done', { ms: Date.now() - tClassify, ...counts });
      crumb('sanity-vs-A1', { mine: counts, a1Reported: { boundary: 360, orientationMismatch: 652, nonManifold: 3 } });
      writeFileSync(join(OUT_DIR, 'armA4_counts.json'), JSON.stringify({ mine: counts, a1Reported: { boundary: 360, orientationMismatch: 652, nonManifold: 3 } }, null, 2));

      // ── STAGE 4: polyline-endpoint self-touch diagnostic ─────────────────
      const tSeam = Date.now();
      const innerEndpoints = collectEndpoints(bandedge.inner.decimatedContours);
      const outerEndpoints = collectEndpoints(bandedge.outer.decimatedContours);
      const innerSeam = coincidentEndpointPairs(innerEndpoints, 2e-4);
      const outerSeam = coincidentEndpointPairs(outerEndpoints, 2e-4);
      crumb('endpoint-seam-analysis-done', {
        ms: Date.now() - tSeam,
        innerEndpoints: innerEndpoints.length, outerEndpoints: outerEndpoints.length,
        innerSeamPairs: innerSeam.pairs, outerSeamPairs: outerSeam.pairs,
        innerHist: innerSeam.hist, outerHist: outerSeam.hist,
      });
      const coincidentSeamPts = [...innerSeam.pts, ...outerSeam.pts];

      // ── STAGE 5: resolve every offender edge to a full locus record ─────
      const tResolve = Date.now();
      const loci = resolveDefectLoci(off.indices, off.vertices, offenders, bandedge, off.uBias, coincidentSeamPts);
      crumb('resolve-loci-done', { ms: Date.now() - tResolve, n: loci.length });
      writeFileSync(join(OUT_DIR, 'armA4_loci.json'), JSON.stringify(loci));

      // ── STAGE 6: summary aggregation ─────────────────────────────────────
      const SEAM_THRESH = 0.0005;
      const summarize = (kind: DefectKind): Record<string, number> => {
        const subset = loci.filter((l) => l.kind === kind);
        return {
          n: subset.length,
          crossIsolevelNear: subset.filter((l) => l.crossIsolevelNear).length,
          polylineSeamNear: subset.filter((l) => l.dCoincidentSeam <= SEAM_THRESH).length,
          onContourBoth: subset.filter((l) => l.aOnContour && l.bOnContour).length,
          onGridLineEither: subset.filter((l) => l.aOnGridLine || l.bOnGridLine).length,
          nearUSeam: subset.filter((l) => l.nearUSeam).length,
          nearKnown3Loci: subset.filter((l) => l.distToKnownLocus <= 0.01).length,
          surfaceOuterOnly: subset.filter((l) => l.aUt[2] < 0.5 && l.bUt[2] < 0.5).length,
          mechGridTjunction: subset.filter((l) => l.mechanismGuess === 'grid-line-Tjunction').length,
          mechInteriorDrop: subset.filter((l) => l.mechanismGuess === 'interior-constraint-drop').length,
          mechSeamClip: subset.filter((l) => l.mechanismGuess === 'seam-clip').length,
          mechOther: subset.filter((l) => l.mechanismGuess === 'other').length,
        };
      };
      const boundaryOrOrient = loci.filter((l) => l.kind === 'boundary' || l.kind === 'orientationMismatch');
      const summary = {
        counts,
        byKind: { boundary: summarize('boundary'), orientationMismatch: summarize('orientationMismatch'), nonManifold: summarize('nonManifold') },
        cdtStatsOuter: off.cdtStatsOuter
          ? { inversions: off.cdtStatsOuter.inversions, drops: off.cdtStatsOuter.drops, incidentsCaptured: off.cdtStatsOuter.incidents.length }
          : null,
        endpointSeam: {
          inner: { n: innerEndpoints.length, pairs: innerSeam.pairs, hist: innerSeam.hist },
          outer: { n: outerEndpoints.length, pairs: outerSeam.pairs, hist: outerSeam.hist },
        },
        distributions: {
          dCoincidentSeam: percentiles(boundaryOrOrient.map((l) => l.dCoincidentSeam)),
          minCrossIsolevelDist: percentiles(boundaryOrOrient.map((l) => Math.min(l.dInnerCtr, l.dOuterCtr))),
          distToKnownLocus: percentiles(boundaryOrOrient.map((l) => l.distToKnownLocus)),
        },
        thresholds: { crossIsolevelThreshMm: 0.001, polylineSeamThreshMm: SEAM_THRESH, uGridStep: 1 / (1 << (AF_PROD_OPTS.featureLevel + off.uBias)), tGridStep: 1 / (1 << AF_PROD_OPTS.featureLevel) },
      };
      writeFileSync(join(OUT_DIR, 'armA4_summary.json'), JSON.stringify(summary, null, 2));
      crumb('summary-written', summary as unknown as Record<string, unknown>);

      // ── STAGE 7: spatial clustering ──────────────────────────────────────
      const clusterRadius = 0.002; // ~4 featureLevel-11 cells
      const clusterReps: Array<{ u: number; t: number; members: number }> = [];
      for (const l of loci) {
        let placed = false;
        for (const rep of clusterReps) {
          if (Math.hypot(uDist(l.midU, rep.u), l.midT - rep.t) <= clusterRadius) { rep.members++; placed = true; break; }
        }
        if (!placed) clusterReps.push({ u: l.midU, t: l.midT, members: 1 });
      }
      const topClusters = clusterReps.slice().sort((a, b) => b.members - a.members).slice(0, 15);
      crumb('cluster-done', { clusterRadius, distinctClusters: clusterReps.length, totalLoci: loci.length, top15: topClusters });
      writeFileSync(join(OUT_DIR, 'armA4_clusters.json'), JSON.stringify(clusterReps, null, 2));

      // ── STAGE 8: representative local-patch dumps ────────────────────────
      // Pick: 1 REFERENCE (a known non-manifold sliver locus, already characterized — sanity
      // anchor for this instrument) + up to 4 NEW (boundary/orientationMismatch, preferring FAR
      // from the 3 known loci, to test whether the mechanism generalizes or is distinct).
      const refPick = loci.find((l) => l.kind === 'nonManifold' && l.distToKnownLocus < 0.001);
      const farFromKnown = loci.filter((l) => l.distToKnownLocus > 0.01);
      const picks: DefectLocus[] = refPick ? [refPick] : [];
      const wantKinds: DefectKind[] = ['boundary', 'orientationMismatch', 'boundary', 'orientationMismatch'];
      for (const kind of wantKinds) {
        const cand = (farFromKnown.length ? farFromKnown : loci).find((l) => l.kind === kind && !picks.includes(l));
        if (cand) picks.push(cand);
      }
      crumb('picks-selected', { n: picks.length, picks: picks.map((p) => ({ kind: p.kind, midU: p.midU, midT: p.midT, mechanismGuess: p.mechanismGuess })) });

      const innerFlat = flattenPts(bandedge.inner.decimatedContours);
      const outerFlat = flattenPts(bandedge.outer.decimatedContours);
      const tPatch = Date.now();
      const patchDump = picks.map((p) => {
        const patch = localPatch(off.indices, off.vertices, [p.a, p.b], 2);
        const R = 0.0015;
        const nearby = (pts: Array<[number, number]>): Array<[number, number]> =>
          pts.filter(([u, t]) => Math.hypot(uDist(u, p.midU), t - p.midT) <= R);
        const matchIncident: CdtCellIncident | undefined = off.cdtStatsOuter?.incidents.find(
          (inc) => p.midU >= inc.u0 - 1e-9 && p.midU <= inc.u1 + 1e-9 && p.midT >= inc.t0 - 1e-9 && p.midT <= inc.t1 + 1e-9,
        );
        return {
          locus: p,
          nearbyInnerContourPts: nearby(innerFlat),
          nearbyOuterContourPts: nearby(outerFlat),
          matchedCdtIncident: matchIncident ?? null,
          patchTriangleCount: patch.length,
          patchWindingSigns: patch.map((t) => Math.sign(t.signedAreaUV)),
          patch,
        };
      });
      crumb('patch-dumps-done', { ms: Date.now() - tPatch, n: patchDump.length });
      writeFileSync(join(OUT_DIR, 'armA4_patchDumps.json'), JSON.stringify(patchDump, null, 2));

      crumb('DONE');
      // eslint-disable-next-line no-console
      console.log(`[armA4-diag] DONE\n${JSON.stringify(summary, null, 2)}`);

      // Non-vacuity: the defect population must actually exist (else this whole diagnosis is
      // measuring nothing) — placed LAST so every dump above has already been written even if
      // this fails.
      expect(counts.boundary + counts.orientationMismatch, 'defect population must be non-vacuous').toBeGreaterThan(0);
    },
    ISO_TIMEOUT_MS,
  );
});
