// _tierc_a3_reloc_lib.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm A3-relocate DIAGNOSIS+FIX support.
// Companion: research/lab/tierc/champion-spec-gyroid.md SS1.4 (knee), SS2.1-2.2 (extraction),
// SS2.5/SS3.2 (closed-form curvature); research/exchange/tierc/armA3_char_summary.json (the hot-arc
// geography); Addendum 13 (redirect to locus relocation, both point-pins and naive-density REFUTED).
//
// DECISIVE QUESTION (Step 1): does the smoothstep curvature (gyroidAnalyticCurvature, closed-form,
// _gyroid_prodclose_lib.ts) PEAK exactly at the nominal band edges |val| in {0.135,0.15} the
// champion already embeds, or OFFSET from them? Answered by scanning curvature along the LOCAL
// val-GRADIENT direction (the natural across-band coordinate) through every already-Newton-confirmed
// outlier point (research/exchange/tierc/armA3_char_confirmed.json) and finding the argmax.
//
// Step 2 support (lever-dependent, both implemented so the decision can be made AFTER Step 1 runs):
//  (a) OFFSET -> relocate: extractIsolevelPair() re-extracts the two isolevels at NEW c-values
//      (reuses _gyroid_bandedge_lib.ts's extractIsolevel EXACTLY, only the c argument differs).
//  (b) AT-EDGE -> local densify: marchLinkRefine() + decimatePerPolylineTargeted() reproduce
//      extractIsolevel's march->link->refine stages (via the exported primitives) then decimate
//      PER-POLYLINE at a finer stepMm only for a caller-supplied "hot" polyline gid set, leaving the
//      rest at the champion's stepMm=0.15 -- composes existing exported primitives differently, does
//      NOT edit _gyroidContourLib.ts.
//
// ISOLATION: NEW file. Imports _gyroidContourLib.ts, _gyroid_bandedge_lib.ts, _gyroid_prodclose_lib.ts
// READ-ONLY (all committed, dev-only, no src/ edit to any of them). DEV-ONLY. src/ never imports
// research/.
import {
  gyroidValDerivs,
  gyroidAnalyticCurvature,
  gpcR0,
  GPC_FIELD,
  GPC_DIMS,
  type GyroidFieldP,
} from './_gyroid_prodclose_lib';
import {
  marchAbsIso,
  linkSegments,
  refineAndFilterContours,
  decimateContours,
  type Contour,
  type GyroidFieldParams,
} from './_gyroidContourLib';
import {
  extractIsolevel,
  type ExtractOpts,
  type BandedgeExtraction,
  type IsolevelExtraction,
} from './_gyroid_bandedge_lib';
import { buildRegionWallGridCPU } from './tierc_regionLayer';
import { TIERC_COMMON_DIMS } from './tierc_manifest';
import { AF_PROD_OPTS, AF_TWALL, AF_TBOTTOM, AF_RDRAIN, fnvHash, type AnalyticRadiusFn } from './_analytic_floor_lib';
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

// ═══════════════════════════════ STEP 1: closed-form curvature-vs-|val| scan ═══════════════════════════════

export interface BandScanResult {
  peakAbsVal: number;
  peakKappa: number;
  startAbsVal: number;
  startKappa: number;
  kappaAt135: number;
  kappaAt150: number;
  gradMag: number;
  scanOk: boolean;
}

/**
 * Scan gyroidAnalyticCurvature along the LOCAL val-gradient direction through (u0,t0) — the
 * natural "across-band" coordinate (perpendicular to the isolevel contours) — over a window
 * SCALED IN |val| UNITS (not raw (u,t) arc-length): `targetValRange` (default 0.006) is converted
 * to an arc-length halfWidth = targetValRange / |grad val| PER-POINT. This is load-bearing: the
 * band is ONLY 0.015 wide in |val| (inner 0.135 to outer 0.15, midline 0.1425); a FIXED arc-length
 * window (the first version of this function used halfWidth=0.004 unconditionally) covers a
 * |val|-range of gradMag*0.004, which for the OBSERVED |grad val| in [4.8,38.3] is ALWAYS
 * >=0.0192 -- i.e. it ALWAYS reaches past the midline to the OTHER nominal edge regardless of
 * gradient, so "argmax across the window" silently degenerates into "which of the two edges (0.135
 * vs 0.15) has the globally sharper corner", not "is THIS point's own nearby edge the local peak".
 * (Measured artifact: with the fixed window, ~75% of points "jumped" to the opposite edge as their
 * reported peak regardless of which edge they started near -- an edge-asymmetry finding, not an
 * offset finding.) targetValRange=0.006 keeps the window inside this edge's own half of the band
 * (edge-to-midline is 0.0075) with a little overshoot into the flat zone on the far side, so the
 * scan cannot cross to the other edge. Returns the ARGMAX locus (peakAbsVal/peakKappa) plus
 * curvature AT the two nominal edges (nearest-sampled-point proxy) for direct before/after
 * comparison.
 */
export function scanCurvatureAcrossBand(
  u0: number, t0: number, r0: (t: number) => number, H: number, p: GyroidFieldP = GPC_FIELD,
  targetValRange = 0.006, steps = 400,
): BandScanResult {
  const vd0 = gyroidValDerivs(u0, t0, p);
  const gmag = Math.hypot(vd0.val_u, vd0.val_t);
  const startAbsVal = Math.abs(vd0.val);
  const startKappa = gyroidAnalyticCurvature(u0, t0, r0, H, p);
  if (gmag < 1e-6) {
    return { peakAbsVal: startAbsVal, peakKappa: startKappa, startAbsVal, startKappa, kappaAt135: 0, kappaAt150: 0, gradMag: gmag, scanOk: false };
  }
  const halfWidth = targetValRange / gmag;
  const gu = vd0.val_u / gmag, gt = vd0.val_t / gmag;
  let bestKappa = -Infinity, bestAbsVal = startAbsVal;
  let kappaAt135 = 0, kappaAt150 = 0, closest135 = Infinity, closest150 = Infinity;
  for (let i = -steps; i <= steps; i++) {
    const s = (i / steps) * halfWidth;
    const u = u0 + s * gu;
    const t = Math.min(1, Math.max(0, t0 + s * gt));
    const vd = gyroidValDerivs(u, t, p);
    const av = Math.abs(vd.val);
    const kap = gyroidAnalyticCurvature(u, t, r0, H, p);
    if (kap > bestKappa) { bestKappa = kap; bestAbsVal = av; }
    const d135 = Math.abs(av - 0.135), d150 = Math.abs(av - 0.15);
    if (d135 < closest135) { closest135 = d135; kappaAt135 = kap; }
    if (d150 < closest150) { closest150 = d150; kappaAt150 = kap; }
  }
  return { peakAbsVal: bestAbsVal, peakKappa: bestKappa, startAbsVal, startKappa, kappaAt135, kappaAt150, gradMag: gmag, scanOk: true };
}

export function percentiles(arr: number[]): { min: number; p25: number; p50: number; p75: number; p90: number; p99: number; max: number; mean: number } {
  if (arr.length === 0) return { min: 0, p25: 0, p50: 0, p75: 0, p90: 0, p99: 0, max: 0, mean: 0 };
  const s = arr.slice().sort((a, b) => a - b);
  const pct = (pp: number): number => s[Math.min(s.length - 1, Math.floor(pp * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { min: s[0], p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p90: pct(0.9), p99: pct(0.99), max: s[s.length - 1], mean };
}

/** GPC_FIELD's r0(t) — exported for callers that need the exact same profile fn as the scan. */
export function gpcR0Wrap(t: number): number {
  return gpcR0(t);
}
export { GPC_FIELD, GPC_DIMS };
export type { GyroidFieldP };

// ═══════════════════════════ STEP 2a: RELOCATE — re-extract at new c-values ═══════════════════════════

/** Re-extract the doubled band-edge contour set at ARBITRARY (cInner,cOuter) instead of the
 *  champion's fixed (0.135,0.15) — reuses _gyroid_bandedge_lib.ts's extractIsolevel verbatim,
 *  only the c argument differs. Zero new extraction algorithm. */
export function extractIsolevelPairAt(
  rA: (theta: number, z: number) => number, H: number, cInner: number, cOuter: number,
  opts: ExtractOpts, params: GyroidFieldParams,
): BandedgeExtraction {
  const inner: IsolevelExtraction = extractIsolevel(cInner, 'bandedge-inner-reloc', rA, H, opts, params);
  const outer: IsolevelExtraction = extractIsolevel(cOuter, 'bandedge-outer-reloc', rA, H, opts, params);
  const totalPts = inner.decimatedPtCount + outer.decimatedPtCount;
  const maxPlacementDisp3D = Math.max(inner.placement.maxDisp3D, outer.placement.maxDisp3D);
  return {
    inner, outer,
    wallIsolevels: { inner: cInner, outer: cOuter, mid: (cInner + cOuter) / 2, th: 0.15 },
    totalPts, maxPlacementDisp3D, ms: inner.ms + outer.ms,
  };
}

// ═══════════════════════ STEP 2b: LOCAL DENSIFY — per-polyline targeted stepMm ═══════════════════════

/** Reproduce extractIsolevel's STAGES 1-3 (march -> link -> refine/filter) WITHOUT decimating —
 *  composes the exported primitives exactly as extractIsolevel does internally, just stops one
 *  stage early so the caller can decimate per-polyline with a non-uniform step. Zero new algorithm. */
export function marchLinkRefine(
  c: number, rA: (theta: number, z: number) => number, H: number, opts: ExtractOpts, params: GyroidFieldParams,
): Contour[] {
  const segs = marchAbsIso(c, params, { nu: opts.nu, nt: opts.nt, polishIters: opts.polishIters });
  const linked = linkSegments(segs);
  const { contours } = refineAndFilterContours(linked, c, params, opts.valTol);
  return contours;
}

/** Decimate each polyline individually: polylines whose GLOBAL gid (baseGid + array index) is in
 *  hotGids get fineStepMm; all others get baseStepMm. Matches _tierc_a3_char.test.ts's
 *  buildContourIndex gid convention EXACTLY (inner contours first, gid 0..innerCount-1, then outer,
 *  gid innerCount..innerCount+outerCount-1) PROVIDED the caller passes refined (pre-decimate, zero-
 *  drop) contour arrays in inner-then-outer order with matching baseGid -- true here because the
 *  champion's own extraction measured droppedPts=0 for BOTH isolevels at GBE_EXTRACT_DEFAULT
 *  (champion-spec-gyroid.md SS2.2 table), so refine does not split/reorder any contour and the
 *  post-refine array is index-identical to the champion's post-decimate array. */
export function decimatePerPolylineTargeted(
  contours: Contour[], baseGid: number, hotGids: Set<number>,
  baseStepMm: number, fineStepMm: number, rA: AnalyticRadiusFn, H: number,
): { contours: Contour[]; nHot: number; nCool: number; hotPtCount: number; coolPtCount: number } {
  const out: Contour[] = [];
  let nHot = 0, nCool = 0, hotPtCount = 0, coolPtCount = 0;
  contours.forEach((c, i) => {
    const gid = baseGid + i;
    const isHot = hotGids.has(gid);
    const step = isHot ? fineStepMm : baseStepMm;
    const dec = decimateContours([c], step, rA, H);
    for (const d of dec) {
      out.push(d);
      if (isHot) { nHot++; hotPtCount += d.pts.length; } else { nCool++; coolPtCount += d.pts.length; }
    }
  });
  return { contours: out, nHot, nCool, hotPtCount, coolPtCount };
}

// ═══════════════════════════════ shared: build outer wall from arbitrary generalCurves ═══════════════════════════════

export interface RelocBuild {
  hash: string;
  fullTris: number;
  outerTris: number;
  outerXyz: Float32Array;
  outerIdx: Uint32Array;
  fullIdx: Uint32Array;
  uBias: number;
  buildMs: number;
}

/** Mirrors _tierc_a3_char.test.ts's buildFanRepairOuter EXACTLY (same assemblyOpts, same
 *  multiCurveCellPolicy:'fanRepair' A2 policy) except generalCurves is a caller-supplied parameter
 *  instead of being derived from a fixed BandedgeExtraction -- so the SAME build path serves both
 *  the relocated-isolevel and the locally-densified fix, and (byte-identically, when passed the
 *  champion's own contoursToFeatureLines output) reproduces the champion build for a non-vacuity
 *  hash check. Also returns fullIdx (needed for auditWatertight, which the champion probes did not
 *  expose on this exact function). */
export function buildFanRepairOuterFromCurves(
  rA: (theta: number, z: number) => number, generalCurves: FeatureLine[],
): RelocBuild {
  const t0 = Date.now();
  const { H } = TIERC_COMMON_DIMS;
  const outer = buildRegionWallGridCPU(rA, 0, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
  const inner = buildRegionWallGridCPU(rA, 1, TIERC_COMMON_DIMS, AF_TWALL, AF_TBOTTOM, 256);
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
    outerXyz, outerIdx: sub.indices, fullIdx: asm.indices, uBias, buildMs: Date.now() - t0,
  };
}

void TAU;
