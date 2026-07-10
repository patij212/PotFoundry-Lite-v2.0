// E-2026-07-10-GYROID-BANDEDGE — Node twin of the production conforming build for
// GyroidManifold, with the general-curve feature inputs OVERRIDDEN to the doubled
// wall-band-edge contours (|val| = 0.135 and 0.15) instead of production's real
// val=0 plateau-centerline. See research/lab/E-2026-07-10-GYROID-BANDEDGE-prereg.md.
//
// Direct follow-up to E-2026-07-10-GYROID-PRODCLOSE (KILL-A: the analytic curvature
// floor cannot move the knee-adjacent residual — h(kappa>=2.4)=minEdge exactly, a
// density lever is structurally the wrong tool). The parent arm's own DECISIVE
// finding: production's extractGyroidManifold traces val=0 (shape saturated flat,
// kappa~=0, harmless) — never the working |val| in {0.135,0.15} band edges the lab's
// mechanism proof (2026-07-04-perfect-mesher-spec.md SS V11o/V11q) actually needed.
// This file overrides ONLY the generalCurves input at the exact seam
// _gyroid_prodclose_lib.ts's prepareGpcTwinInputs() exposes — everything else
// (samplers, style opts, CAD-floor constants, assembly path, computeUBias) is
// reused/re-derived identically to the parent twin, imported READ-ONLY where
// generic.
//
// ISOLATION: NEW file. Imports _gyroid_prodclose_lib.ts + _gyroidContourLib.ts
// READ-ONLY (both committed, dev-only, no src/ edit). DEV-ONLY. src/ never imports
// research/.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import { buildWallGridCPU, AF_PROD_OPTS } from './_analytic_floor_lib';
import {
  GPC_DIMS,
  GPC_STYLE,
  GPC_STYLE_OPTS,
  GPC_TBOTTOM,
  GPC_RDRAIN,
  GPC_BANKED,
  gpcBreadcrumb as gpcBreadcrumbParent,
} from './_gyroid_prodclose_lib';
import {
  GYROID_DEFAULTS,
  gyroidVal,
  wallIsolevels,
  marchAbsIso,
  linkSegments,
  refineAndFilterContours,
  decimateContours,
  isoResidual3D,
  type Contour,
  type GyroidFieldParams,
} from './_gyroidContourLib';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
  type WatertightAssemblyResult,
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
import { fnvHash } from './_analytic_floor_lib';

const TAU = Math.PI * 2;

export { GPC_DIMS, GPC_STYLE, GPC_STYLE_OPTS, GPC_BANKED };

/** Field params for _gyroidContourLib.ts's gyroidVal/marchAbsIso, from the SAME
 *  production defaults _gyroid_prodclose_lib.ts's GPC_FIELD uses (gm_scale=4.0, NOT
 *  packGyroidManifold's internal 3.5 fallback). */
export const GBE_FIELD: GyroidFieldParams = {
  fScale: GPC_STYLE_OPTS.gm_scale,
  zStretch: GPC_STYLE_OPTS.gm_z_stretch,
  pulse: GPC_STYLE_OPTS.gm_pulse,
  morph: GPC_STYLE_OPTS.gm_morph,
  bias: GPC_STYLE_OPTS.gm_bias,
  thickness: GPC_STYLE_OPTS.gm_thickness,
  smoothVal: GPC_STYLE_OPTS.gm_sharpness,
};

const GBE_EXCHANGE = join('research', 'exchange', '_gyroid_bandedge');

export function gbeBreadcrumb(msg: string): void {
  try {
    mkdirSync(GBE_EXCHANGE, { recursive: true });
    appendFileSync(join(GBE_EXCHANGE, 'run.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* a breadcrumb must never kill the run */
  }
}
// Re-export the parent arm's heap-limit + breadcrumb helper name for continuity in
// the probe's console output (same underlying gpcHeapLimitMB semantics, imported
// via _gyroid_prodclose_lib to avoid re-deriving v8 heap stats logic).
export { gpcHeapLimitMB } from './_gyroid_prodclose_lib';
// Also expose the parent's own breadcrumb fn under its original name, in case a
// caller wants both streams merged into the SAME run.log path convention (kept
// separate here deliberately — this arm writes to _gyroid_bandedge/run.log, not
// _gyroid_prodclose/run.log, so the two arms' logs never interleave).
void gpcBreadcrumbParent;

// ─────────────────────────────── STAGE E: extract doubled band-edge contours ───────────────────────────────

export interface ExtractOpts {
  nu: number;
  nt: number;
  polishIters: number;
  valTol: number;
  stepMm: number;
  placementSampleN: number;
}
export const GBE_EXTRACT_DEFAULT: ExtractOpts = {
  nu: 1200, nt: 1200, polishIters: 40, valTol: 1e-4, stepMm: 0.15, placementSampleN: 2000,
};

export interface IsolevelExtraction {
  c: number;
  label: string;
  rawSegs: number;
  rawContours: number;
  rawPts: number;
  keptPts: number;
  droppedPts: number;
  decimatedContours: Contour[];
  decimatedPtCount: number;
  placement: { maxDisp3D: number; p50Disp3D: number; p99Disp3D: number; sampledN: number };
  ms: number;
}

/** Extract ONE isolevel (|val|=c) end-to-end: march -> link -> refine/filter -> decimate -> validate. */
export function extractIsolevel(
  c: number, label: string, rA: (theta: number, z: number) => number, H: number,
  opts: ExtractOpts, params: GyroidFieldParams = GBE_FIELD,
): IsolevelExtraction {
  const t0 = Date.now();
  const segs = marchAbsIso(c, params, { nu: opts.nu, nt: opts.nt, polishIters: opts.polishIters });
  const linked = linkSegments(segs);
  const rawPts = linked.reduce((n, cont) => n + cont.pts.length, 0);
  gbeBreadcrumb(`extract[${label}] march+link DONE segs=${segs.length} contours=${linked.length} rawPts=${rawPts} (${Date.now() - t0}ms)`);

  const { contours: refined, dropped, kept } = refineAndFilterContours(linked, c, params, opts.valTol);
  gbeBreadcrumb(`extract[${label}] refine+filter DONE kept=${kept} dropped=${dropped} contours=${refined.length} (${Date.now() - t0}ms)`);

  const decimated = decimateContours(refined, opts.stepMm, rA, H);
  const decimatedPtCount = decimated.reduce((n, cont) => n + cont.pts.length, 0);
  gbeBreadcrumb(`extract[${label}] decimate DONE stepMm=${opts.stepMm} contours=${decimated.length} pts=${decimatedPtCount} (${Date.now() - t0}ms)`);

  // Deterministic stride sample over the decimated points for placement validation
  // (not random -> reproducible across runs).
  const flat: Array<[number, number]> = [];
  for (const cont of decimated) for (const p of cont.pts) flat.push(p);
  const stride = Math.max(1, Math.floor(flat.length / opts.placementSampleN));
  const disps: number[] = [];
  for (let i = 0; i < flat.length; i += stride) {
    const [u, t] = flat[i];
    const { disp3D } = isoResidual3D(u, t, c, params, rA, H);
    disps.push(disp3D);
  }
  disps.sort((a, b) => a - b);
  const pct = (p: number): number => disps.length === 0 ? 0 : disps[Math.min(disps.length - 1, Math.floor(p * disps.length))];
  const placement = {
    maxDisp3D: disps.length ? disps[disps.length - 1] : 0,
    p50Disp3D: pct(0.5), p99Disp3D: pct(0.99), sampledN: disps.length,
  };
  gbeBreadcrumb(`extract[${label}] placement DONE max=${placement.maxDisp3D.toFixed(6)} p99=${placement.p99Disp3D.toFixed(6)} n=${placement.sampledN} (${Date.now() - t0}ms)`);

  return {
    c, label, rawSegs: segs.length, rawContours: linked.length, rawPts,
    keptPts: kept, droppedPts: dropped,
    decimatedContours: decimated, decimatedPtCount, placement, ms: Date.now() - t0,
  };
}

export interface BandedgeExtraction {
  inner: IsolevelExtraction; // |val| = 0.135 (ridge-plateau edge)
  outer: IsolevelExtraction; // |val| = 0.15  (channel-floor edge)
  wallIsolevels: { inner: number; outer: number; mid: number; th: number };
  totalPts: number;
  maxPlacementDisp3D: number;
  ms: number;
}

/** Both isolevels together — the doubled wall-band contour set. */
export function extractBandedgeContours(
  rA: (theta: number, z: number) => number, H: number, opts: ExtractOpts = GBE_EXTRACT_DEFAULT,
  params: GyroidFieldParams = GBE_FIELD,
): BandedgeExtraction {
  const t0 = Date.now();
  const iso = wallIsolevels(params);
  gbeBreadcrumb(`extractBandedge START inner=${iso.inner} outer=${iso.outer} nu=${opts.nu} nt=${opts.nt} stepMm=${opts.stepMm}`);
  const inner = extractIsolevel(iso.inner, 'bandedge-inner', rA, H, opts, params);
  const outer = extractIsolevel(iso.outer, 'bandedge-outer', rA, H, opts, params);
  const totalPts = inner.decimatedPtCount + outer.decimatedPtCount;
  const maxPlacementDisp3D = Math.max(inner.placement.maxDisp3D, outer.placement.maxDisp3D);
  gbeBreadcrumb(`extractBandedge DONE totalPts=${totalPts} maxPlacementDisp3D=${maxPlacementDisp3D.toFixed(6)} (${Date.now() - t0}ms)`);
  return { inner, outer, wallIsolevels: iso, totalPts, maxPlacementDisp3D, ms: Date.now() - t0 };
}

/** Convert decimated (u,t) contours into FeatureLine[] (kind:'general-curve', matching
 *  the SAME shape/kind production's real extractGyroidManifold output already uses —
 *  this is a locus substitution, not a new feature-line kind). */
export function contoursToFeatureLines(contours: Contour[], label: string): FeatureLine[] {
  return contours.map((c, i) => ({
    kind: 'general-curve' as const,
    points: c.pts.map(([u, t]) => ({ u, t })),
    label: `${label}[${i}]`,
  }));
}

// ─────────────────────────────── STAGE B: twin build with overridden general-curve inputs ───────────────────────────────

export interface GbeTwinInputs {
  rA: ReturnType<typeof buildRadiusFn>;
  outerSampler: ReturnType<typeof buildWallGridCPU>['sampler'];
  innerSampler: ReturnType<typeof buildWallGridCPU>['sampler'];
  generalCurves: FeatureLine[];
  creaseLines: FeatureLine[];
  outerEfgSampler: ReturnType<typeof composedWallSampler>;
  innerEfgSampler: ReturnType<typeof composedWallSampler>;
  minUniformLevel: number | undefined;
  hasFeatures: boolean;
}

/**
 * Samplers + the OVERRIDDEN band-edge feature graph — mirrors
 * _gyroid_prodclose_lib.ts's prepareGpcTwinInputs() EXACTLY except the general-curve
 * source: instead of extractAnalyticFeatures's val=0 marching squares, the contours
 * passed in (Stage E output) become the generalCurves array. No other production
 * step (crease/helix warps — both identity no-ops for Gyroid, verified in the
 * parent arm) is touched.
 */
export function prepareGbeTwinInputs(bandedge: BandedgeExtraction): GbeTwinInputs {
  const rA = buildRadiusFn(GPC_STYLE, {}, GPC_DIMS);
  const outer = buildWallGridCPU(rA, 0);
  const inner = buildWallGridCPU(rA, 1);

  const generalCurves = [
    ...contoursToFeatureLines(bandedge.inner.decimatedContours, 'bandedge-inner'),
    ...contoursToFeatureLines(bandedge.outer.decimatedContours, 'bandedge-outer'),
  ];

  // Gyroid has NO vertical-crease/horizontal-band/helical-crease lines regardless of
  // which general-curve source is used (verified in the parent arm) -- these stay
  // identity no-ops, computed via the real chooseXGrid(empty) path for fidelity.
  const creaseChoice = chooseCreaseGrid([]);
  const creaseTChoice = chooseCreaseTGrid([]);
  const helixChoice = chooseHelixGrid(0, 0, 0);
  const creaseLines = buildCreaseRefineLines(
    { styleId: GPC_STYLE, lines: [], groundTruthCount: 0 },
    { uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helixWarp: helixChoice.warp },
  );
  const outerEfgSampler = composedWallSampler(outer.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const innerEfgSampler = composedWallSampler(inner.sampler, {
    uWarp: creaseChoice.warp, tWarp: creaseTChoice.warp, helix: helixChoice.warp,
  });
  const hasFeatures = generalCurves.length > 0;

  return {
    rA,
    outerSampler: outer.sampler,
    innerSampler: inner.sampler,
    generalCurves,
    creaseLines,
    outerEfgSampler,
    innerEfgSampler,
    minUniformLevel: resolveUniformLevelOverride(
      Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level), 0,
    ),
    hasFeatures,
  };
}

export interface GbeTwinBuild {
  fullVerts: number;
  fullTris: number;
  outerVerts: number;
  outerTris: number;
  hash: string;
  generalCurveCount: number;
  generalCurvePtCount: number;
  hasFeatures: boolean;
  uBias: number;
  buildMs: number;
  fullIdx: Uint32Array;
  /** Raw packed assembly vertices (u, t, surfaceId triples) — needed by the KILL-B
   *  locus classifier to resolve non-manifold edge endpoints back to (u,t). */
  fullUt: Float32Array;
  outerXyz: Float32Array;
  outerIdx: Uint32Array;
  buildError?: string;
}

/**
 * Build the full-pot twin with the band-edge contours as the ONLY general-curve
 * input, production config otherwise (128^2 sizing, featureLevel 11, no curvature
 * floor -- per the prereg's Stage B, floor is explicitly decoupled from this arm).
 * Any thrown error during assembleWatertight is caught, breadcrumbed, and returned
 * via buildError rather than propagated -- a machinery-choke IS this arm's KILL-B
 * finding, not an uncaught crash to lose telemetry on.
 */
export function buildGbeTwin(bandedge: BandedgeExtraction): GbeTwinBuild {
  const t0 = Date.now();
  const { H } = GPC_DIMS;
  gbeBreadcrumb(`buildGbeTwin START generalCurvePts=${bandedge.totalPts}`);
  const inp = prepareGbeTwinInputs(bandedge);
  const { rA, generalCurves, creaseLines } = inp;
  const genPtCount = generalCurves.reduce((n, l) => n + l.points.length, 0);
  gbeBreadcrumb(`inputs ready: generalCurves=${generalCurves.length} lines / ${genPtCount} pts, creaseLines=${creaseLines.length} (${Date.now() - t0}ms)`);

  const uBias = computeUBias(inp.outerSampler, inp.hasFeatures);
  gbeBreadcrumb(`uBias=${uBias} (${Date.now() - t0}ms)`);

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
    outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel,
    outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    outerEfgSampler: inp.outerEfgSampler,
    innerEfgSampler: inp.innerEfgSampler,
    // NO outerCurvatureFloor/outerMaxKappa -- contours-first per the prereg; floor
    // decoupled from this arm.
  };

  gbeBreadcrumb(`assembleWatertight starting (${Date.now() - t0}ms) -- production's per-cell constrained CDT has never seen this many general-curve points`);
  let asm: WatertightAssemblyResult;
  try {
    asm = assembleWatertight(
      inp.outerSampler, inp.innerSampler,
      { H, tBottom: GPC_TBOTTOM, rDrain: GPC_RDRAIN }, assemblyOpts,
    );
  } catch (err) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    gbeBreadcrumb(`assembleWatertight THREW: ${msg}`);
    return {
      fullVerts: 0, fullTris: 0, outerVerts: 0, outerTris: 0, hash: '', generalCurveCount: generalCurves.length,
      generalCurvePtCount: genPtCount, hasFeatures: inp.hasFeatures, uBias, buildMs: Date.now() - t0,
      fullIdx: new Uint32Array(0), fullUt: new Float32Array(0), outerXyz: new Float32Array(0), outerIdx: new Uint32Array(0),
      buildError: msg,
    };
  }
  gbeBreadcrumb(`assembleWatertight DONE tris=${asm.indices.length / 3} (${Date.now() - t0}ms)`);

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

  gbeBreadcrumb(`submesh+eval DONE outerTris=${sub.indices.length / 3} (${Date.now() - t0}ms)`);
  return {
    fullVerts: nV,
    fullTris: asm.indices.length / 3,
    outerVerts: sub.vertices.length / 3,
    outerTris: sub.indices.length / 3,
    hash,
    generalCurveCount: generalCurves.length,
    generalCurvePtCount: genPtCount,
    hasFeatures: inp.hasFeatures,
    uBias,
    buildMs: Date.now() - t0,
    fullIdx: asm.indices,
    fullUt: asm.vertices,
    outerXyz,
    outerIdx: sub.indices,
  };
}

// ─────────────────────────────── KILL-B locus classifier (Map-free — the 2^23 Map cap lesson) ───────────────────────────────

export interface NonManEdgeLocus {
  a: number;
  b: number;
  mult: number;
  aUt: [number, number, number]; // (u, t, surfaceId)
  bUt: [number, number, number];
  midAbsVal: number;             // |val| at the (u,t) edge midpoint
  dEdgeIso: number;              // min(| |val|-0.135 |, | |val|-0.15 |) at midpoint
  dInnerCtr: number;             // (u,t) distance from midpoint to nearest INNER contour pt (periodic u)
  dOuterCtr: number;             // ... to nearest OUTER contour pt
  aOnContour: boolean;           // endpoint == a decimated contour vertex (1e-6 in u,t)
  bOnContour: boolean;
  nearUSeam: boolean;            // within the featureLevel-11 clip margin of u=0/1
}

/**
 * Find every non-manifold (mult>2) raw-index edge and classify its locus against the
 * embedded contour set. Map-FREE for the full scan (packed-key sort + run-length, the
 * nonManRawBigStats recipe — a JS Map at 13.1M edges would die at the 2^23 cap); only
 * the tiny offender set uses a Map. Endpoints are resolved via the raw packed (u,t,
 * surfaceId) assembly vertices.
 */
export function classifyNonManLoci(
  twin: GbeTwinBuild, bandedge: BandedgeExtraction, p: GyroidFieldParams = GBE_FIELD,
): NonManEdgeLocus[] {
  const idx = twin.fullIdx;
  const n = idx.length - (idx.length % 3);
  // Pass 1: packed keys, sort, run-length — collect offender keys (mult>2).
  const keys = new Float64Array(n);
  let m = 0;
  for (let k = 0; k < n; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [pp, qq] of [[a, b], [b, c], [c, a]] as const) {
      const lo = pp < qq ? pp : qq, hi = pp < qq ? qq : pp;
      keys[m++] = lo * 134217728 + hi;
    }
  }
  const sorted = keys.subarray(0, m);
  sorted.sort();
  const offenders = new Map<number, number>(); // key -> mult (tiny)
  for (let i = 0; i < m;) {
    let j = i + 1;
    while (j < m && sorted[j] === sorted[i]) j++;
    if (j - i > 2) offenders.set(sorted[i], j - i);
    i = j;
  }
  if (offenders.size === 0) return [];

  // Contour points as flat arrays for nearest-distance (periodic u).
  const flatPts = (contours: Contour[]): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (const c of contours) for (const pt of c.pts) out.push(pt);
    return out;
  };
  const innerPts = flatPts(bandedge.inner.decimatedContours);
  const outerPts = flatPts(bandedge.outer.decimatedContours);
  const uDist = (ua: number, ub: number): number => {
    const d = Math.abs((ua - Math.floor(ua)) - (ub - Math.floor(ub)));
    return Math.min(d, 1 - d);
  };
  const nearestCtr = (u: number, t: number, pts: Array<[number, number]>): number => {
    let best = Infinity;
    for (const [cu, ct] of pts) {
      const d = Math.hypot(uDist(u, cu), t - ct);
      if (d < best) best = d;
    }
    return best;
  };
  const onContour = (u: number, t: number): boolean => {
    // decimated contour vertices are exact f64 (u,t) — the assembly stores f32, so
    // match within f32 quantization (~1e-7 at u~1) + weld slack.
    const eps = 2e-6;
    for (const pts of [innerPts, outerPts]) {
      for (const [cu, ct] of pts) {
        if (uDist(u, cu) <= eps && Math.abs(t - ct) <= eps) return true;
      }
    }
    return false;
  };

  const uSeamMargin = 1.5 / (1 << AF_PROD_OPTS.featureLevel); // ConformingWall's own clip margin
  const loci: NonManEdgeLocus[] = [];
  // Pass 2: resolve offender keys back to endpoint indices.
  const seen = new Set<number>();
  for (let k = 0; k < n; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [pp, qq] of [[a, b], [b, c], [c, a]] as const) {
      const lo = pp < qq ? pp : qq, hi = pp < qq ? qq : pp;
      const key = lo * 134217728 + hi;
      if (!offenders.has(key) || seen.has(key)) continue;
      seen.add(key);
      const aUt: [number, number, number] = [twin.fullUt[lo * 3], twin.fullUt[lo * 3 + 1], twin.fullUt[lo * 3 + 2]];
      const bUt: [number, number, number] = [twin.fullUt[hi * 3], twin.fullUt[hi * 3 + 1], twin.fullUt[hi * 3 + 2]];
      const mu = ((aUt[0] + bUt[0]) / 2) - Math.floor((aUt[0] + bUt[0]) / 2);
      const mt = (aUt[1] + bUt[1]) / 2;
      const midAbsVal = Math.abs(gyroidVal(mu, mt, p));
      loci.push({
        a: lo, b: hi, mult: offenders.get(key)!,
        aUt, bUt, midAbsVal,
        dEdgeIso: Math.min(Math.abs(midAbsVal - 0.135), Math.abs(midAbsVal - 0.15)),
        dInnerCtr: nearestCtr(mu, mt, innerPts),
        dOuterCtr: nearestCtr(mu, mt, outerPts),
        aOnContour: onContour(aUt[0], aUt[1]),
        bOnContour: onContour(bUt[0], bUt[1]),
        nearUSeam: Math.min(aUt[0] - Math.floor(aUt[0]), 1 - (aUt[0] - Math.floor(aUt[0]))) <= uSeamMargin ||
                   Math.min(bUt[0] - Math.floor(bUt[0]), 1 - (bUt[0] - Math.floor(bUt[0]))) <= uSeamMargin,
      });
    }
  }
  return loci;
}

// ─────────────────────────────── re-export the parent arm's scoring machinery (no new ruler) ───────────────────────────────

export {
  auditWatertight, zeroAreaCount, gpcR0,
  gpcPrescreenCount, gpcPrescreenDetail, gpcStratifiedNewton,
  gpcScoreForward, gpcScoreCoverage,
} from './_gyroid_prodclose_lib';
export { gyroidValDerivs } from './_gyroid_prodclose_lib';
export { GYROID_DEFAULTS };
