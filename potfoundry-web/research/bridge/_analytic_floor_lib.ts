// E-2026-07-09-ANALYTIC-FLOOR — Node TWIN of the production conforming build for
// SpiralRidges (see EXPERIMENT-REGISTRY.md §E-2026-07-09-ANALYTIC-FLOOR).
//
// Replicates ParametricExportComputer's conforming branch CPU-side, step for step,
// at the capture dims (H120/Rt50/Rb40/expn1/spin0, store-default tWall 3 / tBottom 3 /
// rDrain 10) and the RESOLVED production 'high'+CAD-floor knobs (sag 0.003 / maxEdge 1 /
// minEdge 0.1 / grade 2 / maxLevel 16 / sizing res 128 / nRing 2048 / budget 16M 'cap' /
// featureLevel 11). The wall samplers are CPU-f64 evaluations of the SAME formulas the
// WGSL `evaluate_vertices` kernel uses (OUTER: z=tH, r=rA(u·TAU,z); INNER:
// z=tBottom+t(H−tBottom), r=max(rA−tWall, 0.5)), cast to f32 — the pilot's vertexOnSurf
// gate (p99 6e-5mm) bounds the CPU↔GPU truth-bridge gap on this style.
//
// Twin validity is NOT assumed: the probe gates the flag-OFF twin against the captured
// artifact (tris / outliers / worst / Newton / coverage) before any flag-ON number is
// read — see the pre-registered TWIN-VALIDITY gate.
//
// DEV-ONLY. src/ never imports research/.
import { appendFileSync } from 'node:fs';
import { buildRadiusFn } from './runStyle';
import type { AnalyticRadiusFn } from './labkit';
import { scoreWholeMeshInterior, denseBary } from './_pf_rebaselineRuler';
import { newtonNearest } from './_gyroid_truthLib';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { GpuSurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import {
  principalCurvatureMax,
  metricStepsForSampler,
} from '../../src/renderers/webgpu/parametric/conforming/SurfaceMetricTensor';
import {
  assembleWatertight,
  computeUBias,
  type AssemblyWallOptions,
  type WatertightAssemblyResult,
} from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { buildConformingWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { MetricSizingField } from '../../src/renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../../src/renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import {
  extractAnalyticFeatures,
  buildCreaseRefineLines,
} from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { chooseCreaseGrid, applyUWarp } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { chooseCreaseTGrid, applyTWarp } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { chooseHelixGrid, applyHelixWarp } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { composedWallSampler } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import { resolveUniformLevelOverride } from '../../src/renderers/webgpu/parametric/conforming/uniformLevelOverride';
import { extractOuterWallSubmesh } from '../../src/fidelity/metrics';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import type { StyleId } from '../../src/geometry/types';

const TAU = Math.PI * 2;

/** Capture dims (e2e/_prod_truth_capture.mjs) + store-default pot body params. */
export const AF_DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
export const AF_TWALL = 3.0;
export const AF_TBOTTOM = 3.0;
export const AF_RDRAIN = 10.0;
export const AF_STYLE: StyleId = 'SpiralRidges';

/** RESOLVED production assemblyOpts for the default 'high'+CAD-floor export
 *  (ParametricExportComputer.compute conforming branch, dev levers unset). */
export const AF_PROD_OPTS = {
  maxSagMm: 0.003,
  maxEdgeMm: 1,
  minEdgeMm: 0.1,
  gradeRatio: 2,
  maxLevel: 16,
  resU: 128,
  resT: 128,
  nRing: 2048,
  targetTriangles: 16_000_000,
  budgetMode: 'cap' as const,
  featureLevel: 11,
};

export interface FloorSpec {
  curvatureFloor: (u: number, t: number) => number;
  maxKappa: number;
}

/** CPU-f64 → f32 wall sampler grid, formula-exact to WGSL evaluate_vertices. */
export function buildWallGridCPU(
  rA: AnalyticRadiusFn,
  surfaceId: 0 | 1,
  res = 256,
): { sampler: GpuSurfaceSampler; positions: Float32Array } {
  const { H } = AF_DIMS;
  const positions = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const t = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const theta = (col / res) * TAU;
      let z: number;
      let r: number;
      if (surfaceId === 0) {
        z = t * H;
        r = rA(theta, z);
      } else {
        z = AF_TBOTTOM + t * (H - AF_TBOTTOM);
        r = Math.max(rA(theta, z) - AF_TWALL, 0.5);
      }
      positions[w++] = r * Math.cos(theta);
      positions[w++] = r * Math.sin(theta);
      positions[w++] = z;
    }
  }
  return { sampler: new GpuSurfaceSampler(positions, res, res), positions };
}

/** FNV-1a 32-bit dual-lane over byte views — deterministic mesh fingerprint. */
export function fnvHash(...arrays: Array<Float32Array | Uint32Array>): string {
  let hA = 0x811c9dc5;
  let hB = 0x811c9dc5 ^ 0x5bd1e995;
  for (const a of arrays) {
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      hA ^= bytes[i];
      hA = Math.imul(hA, 0x01000193) >>> 0;
      hB ^= bytes[(bytes.length - 1 - i) as number];
      hB = Math.imul(hB, 0x01000193) >>> 0;
    }
  }
  return `${hA.toString(16).padStart(8, '0')}-${hB.toString(16).padStart(8, '0')}`;
}

export interface TwinBuild {
  fullVerts: number;
  fullTris: number;
  outerVerts: number;
  outerTris: number;
  /** Post-warp full assembly fingerprint (vertices (u,t,s) + indices) — the byte-identity channel. */
  hash: string;
  helix: { k: number; turns: number; level: number; identity: boolean };
  generalCurveCount: number;
  creaseLineCount: number;
  buildMs: number;
  /** Full-pot assembly for watertight/zeroArea audits ((u,t,s) space — audits are index-based). */
  fullIdx: Uint32Array;
  /** Outer-wall submesh, CPU-evaluated to 3D (f32, capture-parity dtype). */
  outerXyz: Float32Array;
  outerIdx: Uint32Array;
}

/** Everything the assembly consumes, prepared once (PEC conforming branch, verbatim logic). */
export interface TwinInputs {
  rA: ReturnType<typeof buildRadiusFn>;
  outerSampler: GpuSurfaceSampler;
  innerSampler: GpuSurfaceSampler;
  creaseChoice: ReturnType<typeof chooseCreaseGrid>;
  creaseTChoice: ReturnType<typeof chooseCreaseTGrid>;
  helixChoice: ReturnType<typeof chooseHelixGrid>;
  helixK: number;
  helixTurns: number;
  generalCurves: ReturnType<typeof buildCreaseRefineLines>;
  creaseLines: ReturnType<typeof buildCreaseRefineLines>;
  outerEfgSampler: ReturnType<typeof composedWallSampler>;
  innerEfgSampler: ReturnType<typeof composedWallSampler>;
  minUniformLevel: number | undefined;
}

/** Samplers + feature graph + warp choices — the pre-assembly production steps. */
export function prepareTwinInputs(): TwinInputs {
  const { H, Rt, Rb } = AF_DIMS;
  const rA = buildRadiusFn(AF_STYLE, {}, AF_DIMS);
  const outer = buildWallGridCPU(rA, 0);
  const inner = buildWallGridCPU(rA, 1);

  // ── Feature graph + warp choices (PEC conforming branch, verbatim logic) ──
  const [, packedWarpParams] = buildStyleParamPayload(AF_STYLE, {});
  const featureGraph = extractAnalyticFeatures(
    AF_STYLE,
    Float32Array.from(packedWarpParams),
    { H, Rt, Rb },
    { surfaceFidelityExact: false },
  );
  const creaseUSet = new Set<number>();
  const creaseU: number[] = [];
  const creaseTSet = new Set<number>();
  const creaseT: number[] = [];
  const helixLines = featureGraph.lines.filter((l) => l.kind === 'helical-crease');
  for (const line of featureGraph.lines) {
    if (line.kind === 'vertical-crease') {
      const u = line.points[0].u;
      const key = Math.round(u * 1e7);
      if (creaseUSet.has(key)) continue;
      creaseUSet.add(key);
      creaseU.push(u);
    } else if (line.kind === 'horizontal-band') {
      const t = line.points[0].t;
      const key = Math.round(t * 1e7);
      if (creaseTSet.has(key)) continue;
      creaseTSet.add(key);
      creaseT.push(t);
    }
  }
  const creaseChoice = chooseCreaseGrid(creaseU);
  const creaseTChoice = chooseCreaseTGrid(creaseT);
  let helixChoice: ReturnType<typeof chooseHelixGrid> = {
    warp: { isIdentity: true, base: { isIdentity: true, anchors: [] }, shearRate: 0, offset: 0 },
    grid: 0,
    level: 0,
  };
  let helixK = 0;
  let helixTurns = 0;
  if (helixLines.length > 0) {
    const k = helixLines.length;
    const l0 = helixLines[0].points;
    const p0 = l0[0];
    const p1 = l0[Math.min(1, l0.length - 1)];
    let du = (p1.u - p0.u) % 1;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    const dt = p1.t - p0.t;
    const slope = dt > 1e-9 ? du / dt : 0;
    const turns = -slope * k;
    const phaseU = p0.u * k;
    helixChoice = chooseHelixGrid(k, turns, phaseU);
    helixK = k;
    helixTurns = turns;
  }
  const generalCurves = featureGraph.lines.filter((l) => l.kind === 'general-curve');
  const creaseLines = buildCreaseRefineLines(featureGraph, {
    uWarp: creaseChoice.warp,
    tWarp: creaseTChoice.warp,
    helixWarp: helixChoice.warp,
  });
  const outerEfgSampler = composedWallSampler(outer.sampler, {
    uWarp: creaseChoice.warp,
    tWarp: creaseTChoice.warp,
    helix: helixChoice.warp,
  });
  const innerEfgSampler = composedWallSampler(inner.sampler, {
    uWarp: creaseChoice.warp,
    tWarp: creaseTChoice.warp,
    helix: helixChoice.warp,
  });

  return {
    rA,
    outerSampler: outer.sampler,
    innerSampler: inner.sampler,
    creaseChoice,
    creaseTChoice,
    helixChoice,
    helixK,
    helixTurns,
    generalCurves,
    creaseLines,
    outerEfgSampler,
    innerEfgSampler,
    minUniformLevel: resolveUniformLevelOverride(
      Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level),
      0,
    ),
  };
}

/**
 * WALLS DIAGNOSTIC (twin-divergence localizer): per-wall leaf counts at the computed
 * uBias vs B=0 (plain quadtree, no crease/feature refine) + the TRUE per-wall
 * buildConformingWall counts with the production wallOpts (assembleWatertight
 * internals :486-520 mirrored). Localizes where a twin/artifact triangle-count
 * divergence comes from WITHOUT running caps/orientOutward (which Map-caps ≥~11.2M
 * tris — the crash that motivated this probe).
 */
export function wallsDiag(): Record<string, unknown> {
  const t0 = Date.now();
  const inp = prepareTwinInputs();
  const uBias = computeUBias(inp.outerSampler, false);
  const pin = Math.round(Math.log2(AF_PROD_OPTS.nRing));

  const plainLeaves = (sampler: GpuSurfaceSampler, bias: number): number => {
    const field = new MetricSizingField(sampler, {
      maxSagMm: AF_PROD_OPTS.maxSagMm,
      minEdgeMm: AF_PROD_OPTS.minEdgeMm,
      maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
      gradeRatio: AF_PROD_OPTS.gradeRatio,
      resU: AF_PROD_OPTS.resU,
      resT: AF_PROD_OPTS.resT,
    });
    return new PeriodicBalancedQuadtree(field, sampler, {
      maxLevel: AF_PROD_OPTS.maxLevel,
      pinBoundaryLevel: pin,
      minUniformLevel: inp.minUniformLevel,
      uBias: bias,
    }).leafCount();
  };

  const outerLeavesAtB = plainLeaves(inp.outerSampler, uBias);
  const outerLeavesAt0 = uBias > 0 ? plainLeaves(inp.outerSampler, 0) : outerLeavesAtB;
  const innerLeavesAtB = plainLeaves(inp.innerSampler, uBias);

  // TRUE production wall builds (mirrors assembleWatertight's wallOpts verbatim).
  const wallOpts = {
    maxSagMm: AF_PROD_OPTS.maxSagMm,
    maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
    minEdgeMm: AF_PROD_OPTS.minEdgeMm,
    gradeRatio: AF_PROD_OPTS.gradeRatio,
    maxLevel: AF_PROD_OPTS.maxLevel,
    resU: AF_PROD_OPTS.resU,
    resT: AF_PROD_OPTS.resT,
    nRing: AF_PROD_OPTS.nRing,
    targetTriangles: Math.floor(AF_PROD_OPTS.targetTriangles / 2),
    budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel: inp.minUniformLevel,
    uBias,
    directionalRefine: false,
  };
  const outerWall = buildConformingWall(inp.outerSampler, {
    ...wallOpts,
    surfaceId: 0,
    featureLines: inp.generalCurves.length > 0 ? inp.generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel,
    creaseLines: inp.creaseLines.length > 0 ? inp.creaseLines : undefined,
    efgSampler: inp.outerEfgSampler,
  });
  const outerTris = outerWall.indices.length / 3;
  const innerWall = buildConformingWall(inp.innerSampler, {
    ...wallOpts,
    surfaceId: 1,
    efgSampler: inp.innerEfgSampler,
  });
  const innerTris = innerWall.indices.length / 3;

  return {
    uBias,
    helix: { k: inp.helixK, turns: inp.helixTurns, level: inp.helixChoice.level },
    minUniformLevel: inp.minUniformLevel ?? 0,
    creaseLineCount: inp.creaseLines.length,
    generalCurveCount: inp.generalCurves.length,
    plainLeaves: { outerAtB: outerLeavesAtB, outerAt0: outerLeavesAt0, innerAtB: innerLeavesAtB },
    outer: { tris: outerTris, verts: outerWall.gridVertexCount, budget: outerWall.budget ?? null },
    inner: { tris: innerTris, verts: innerWall.gridVertexCount, budget: innerWall.budget ?? null },
    projWallsTris: outerTris + innerTris,
    capturedOuterTris: 2_680_400,
    capturedFullTris: 5_686_826,
    ms: Date.now() - t0,
  };
}

/**
 * MINI assembly fingerprint — a small, seconds-scale assembleWatertight build used
 * as the byte-identity gate for internal WatertightAssembly refactors (e.g. the
 * capless orientOutward rewrite): the hash must be identical before/after.
 */
export function buildMiniAssemblyHash(): { hash: string; tris: number; verts: number } {
  const { H } = AF_DIMS;
  const rA = buildRadiusFn(AF_STYLE, {}, AF_DIMS);
  const outer = buildWallGridCPU(rA, 0);
  const inner = buildWallGridCPU(rA, 1);
  const asm = assembleWatertight(
    outer.sampler,
    inner.sampler,
    { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN },
    {
      maxSagMm: 0.05,
      maxEdgeMm: 4,
      minEdgeMm: 0.5,
      gradeRatio: 2,
      maxLevel: 8,
      resU: 65,
      resT: 17,
      nRing: 128,
      targetTriangles: 200_000,
      budgetMode: 'cap',
    },
  );
  return {
    hash: fnvHash(asm.vertices, asm.indices),
    tris: asm.indices.length / 3,
    verts: asm.vertices.length / 3,
  };
}

/** Twin knob overrides for lever arms (E-2026-07-10-CAD-LEVER-COMPLETION Stage B). */
export interface TwinOverrides {
  /** Sizing-field grid res (the qSizingRes wiring's target; default 128 = production). */
  resU?: number;
  resT?: number;
  /**
   * Crease-seeing refiner samples/axis (AssemblyWallOptions.cellSamples — threads to
   * the quadtree only once Stage A lands; absent/1 = centre-only production default).
   */
  cellSamples?: number;
}

/**
 * Build the full-pot production twin (assembleWatertight + PEC warp application),
 * optionally with the analytic curvature floor on the OUTER wall (flag-ON arm)
 * and/or lever overrides (Stage-B A/B arms).
 */
export function buildProductionTwin(floor?: FloorSpec, overrides?: TwinOverrides): TwinBuild {
  const t0 = Date.now();
  const { H } = AF_DIMS;
  const inp = prepareTwinInputs();
  const { rA, creaseChoice, creaseTChoice, helixChoice, generalCurves, creaseLines } = inp;

  const assemblyOpts: AssemblyWallOptions = {
    maxSagMm: AF_PROD_OPTS.maxSagMm,
    maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
    minEdgeMm: AF_PROD_OPTS.minEdgeMm,
    gradeRatio: AF_PROD_OPTS.gradeRatio,
    maxLevel: AF_PROD_OPTS.maxLevel,
    resU: overrides?.resU ?? AF_PROD_OPTS.resU,
    resT: overrides?.resT ?? AF_PROD_OPTS.resT,
    cellSamples: overrides?.cellSamples,
    nRing: AF_PROD_OPTS.nRing,
    targetTriangles: AF_PROD_OPTS.targetTriangles,
    budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel: inp.minUniformLevel,
    outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: AF_PROD_OPTS.featureLevel,
    outerCreaseLines: creaseLines.length > 0 ? creaseLines : undefined,
    outerEfgSampler: inp.outerEfgSampler,
    innerEfgSampler: inp.innerEfgSampler,
  };
  if (floor) {
    // outerCurvatureFloor/outerMaxKappa land on AssemblyWallOptions with the wiring
    // commit (this instrument is committed BEFORE the src edit, per pre-registration);
    // the record cast keeps the instrument commit typecheck-clean either way, and the
    // flag-ON arm asserts the threading end-to-end at the mesh level.
    (assemblyOpts as Record<string, unknown>).outerCurvatureFloor = floor.curvatureFloor;
    (assemblyOpts as Record<string, unknown>).outerMaxKappa = floor.maxKappa;
  }

  const asm: WatertightAssemblyResult = assembleWatertight(
    inp.outerSampler,
    inp.innerSampler,
    { H, tBottom: AF_TBOTTOM, rDrain: AF_RDRAIN },
    assemblyOpts,
  );

  // ── Domain warps (PEC application loops, verbatim gates) ──
  if (!creaseChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      asm.vertices[i] = applyUWarp(creaseChoice.warp, asm.vertices[i]);
    }
  }
  if (!creaseTChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      if (asm.vertices[i + 2] < 1.5) {
        asm.vertices[i + 1] = applyTWarp(creaseTChoice.warp, asm.vertices[i + 1]);
      }
    }
  }
  if (!helixChoice.warp.isIdentity && creaseChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      const surfaceId = asm.vertices[i + 2];
      let tEval: number;
      if (surfaceId < 1.5) tEval = asm.vertices[i + 1];
      else if (surfaceId < 2.5) tEval = 1;
      else tEval = 0;
      asm.vertices[i] = applyHelixWarp(helixChoice.warp, asm.vertices[i], tEval);
    }
  }

  const hash = fnvHash(asm.vertices, asm.indices);

  // ── Outer submesh (production surfaceId<0.5 mask) + CPU evaluation ──
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
    fullVerts: nV,
    fullTris: asm.indices.length / 3,
    outerVerts: sub.vertices.length / 3,
    outerTris: sub.indices.length / 3,
    hash,
    helix: { k: inp.helixK, turns: inp.helixTurns, level: helixChoice.level, identity: helixChoice.warp.isIdentity },
    generalCurveCount: generalCurves.length,
    creaseLineCount: creaseLines.length,
    buildMs: Date.now() - t0,
    fullIdx: asm.indices,
    outerXyz,
    outerIdx: sub.indices,
  };
}

// ───────────────────────────── scoring (pilot machinery) ─────────────────────────────

export interface PctStats { max: number; p99: number; p50: number; n: number; over: number }

export function pctStats(devs: Float64Array, n: number, tol: number): PctStats {
  const a = devs.subarray(0, n).slice();
  a.sort();
  let over = 0;
  for (let i = n - 1; i >= 0 && a[i] > tol; i--) over++;
  return {
    max: n ? a[n - 1] : 0,
    p99: n ? a[Math.min(n - 1, Math.floor(0.99 * n))] : 0,
    p50: n ? a[Math.floor(0.5 * n)] : 0,
    n,
    over,
  };
}

export function zeroAreaCount(xyz: Float32Array, idx: Uint32Array): number {
  let zero = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const abx = xyz[b] - xyz[a], aby = xyz[b + 1] - xyz[a + 1], abz = xyz[b + 2] - xyz[a + 2];
    const acx = xyz[c] - xyz[a], acy = xyz[c + 1] - xyz[a + 1], acz = xyz[c + 2] - xyz[a + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (0.5 * Math.hypot(cx, cy, cz) <= 1e-12) zero++;
  }
  return zero;
}

export interface ForwardScore {
  vertexOnSurf: PctStats;
  survivors: number;
  outliers: number;
  gridMax: number;
  gridP99: number;
  newtonWorst: number;
  /** Present when newtonAll: EXACT every-flagged-point Newton acceptance basis. */
  newtonAll?: { pointsScored: number; pointsOver: number; facetsOver: number; max: number };
  ms: number;
}

/**
 * Forward ruler, pilot basis: dense-45 radial PRESCREEN (sound: radial >= nearest)
 * → scoreWholeMeshInterior(min(GN,brute), stride 1) on survivors → Newton re-score of
 * the worst point. With `newtonAll`, ALSO Newton-scores EVERY dense-45 lattice point
 * whose radial bound exceeds tol — the pre-registered every-facet Newton acceptance
 * basis (newton <= radial pointwise, so radial-green points are already proven).
 */
export function scoreForward(
  xyz: Float32Array,
  idx: Uint32Array,
  rA: AnalyticRadiusFn,
  H: number,
  opts: { tol: number; newtonAll: boolean },
): ForwardScore {
  const t0 = Date.now();
  const { tol } = opts;
  const nV = xyz.length / 3;
  const vDev = new Float64Array(nV);
  for (let v = 0; v < nV; v++) {
    const x = xyz[v * 3], y = xyz[v * 3 + 1];
    const z = Math.min(H, Math.max(0, xyz[v * 3 + 2]));
    let th = Math.atan2(y, x);
    if (th < 0) th += TAU;
    vDev[v] = Math.abs(Math.hypot(x, y) - rA(th, z));
  }
  const vertexOnSurf = pctStats(vDev, nV, tol);

  const nF = idx.length / 3;
  const bary = denseBary(8);
  const survivors: number[] = [];
  const overPts: Array<{ x: number; y: number; z: number; radial: number; facet: number }> = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[f * 3] * 3, b = idx[f * 3 + 1] * 3, c = idx[f * 3 + 2] * 3;
    let flagged = false;
    for (const [wa, wb, wc] of bary) {
      const x = wa * xyz[a] + wb * xyz[b] + wc * xyz[c];
      const y = wa * xyz[a + 1] + wb * xyz[b + 1] + wc * xyz[c + 1];
      const z = wa * xyz[a + 2] + wb * xyz[b + 2] + wc * xyz[c + 2];
      let th = Math.atan2(y, x);
      if (th < 0) th += TAU;
      const radial = Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z))));
      if (radial > tol) {
        flagged = true;
        if (opts.newtonAll) overPts.push({ x, y, z, radial, facet: f });
        else break;
      }
    }
    if (flagged) survivors.push(f);
  }
  const scoreIdx = new Uint32Array(survivors.length * 3);
  for (let i = 0; i < survivors.length; i++) {
    scoreIdx[i * 3] = idx[survivors[i] * 3];
    scoreIdx[i * 3 + 1] = idx[survivors[i] * 3 + 1];
    scoreIdx[i * 3 + 2] = idx[survivors[i] * 3 + 2];
  }
  const interior = scoreWholeMeshInterior(xyz, scoreIdx, rA, H, { tol, stride: 1 });

  let newtonWorst = interior.wholeMeshMaxMm;
  if (interior.worstFacet >= 0 && interior.wholeMeshMaxMm > 0) {
    const [wx, wy, wz] = interior.worstXyz;
    const nw = newtonNearest(rA, H, wx, wy, wz, {
      seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
    });
    newtonWorst = Math.min(interior.wholeMeshMaxMm, nw.dist);
  }

  let newtonAll: ForwardScore['newtonAll'];
  if (opts.newtonAll) {
    const facetOver = new Set<number>();
    let over = 0;
    let max = 0;
    for (const p of overPts) {
      const nd = Math.min(
        p.radial,
        newtonNearest(rA, H, p.x, p.y, p.z, {
          seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
        }).dist,
      );
      if (nd > max) max = nd;
      if (nd > tol) {
        over++;
        facetOver.add(p.facet);
      }
    }
    newtonAll = { pointsScored: overPts.length, pointsOver: over, facetsOver: facetOver.size, max };
  }

  return {
    vertexOnSurf,
    survivors: survivors.length,
    outliers: interior.interiorOutliers,
    gridMax: interior.wholeMeshMaxMm,
    gridP99: interior.p99,
    newtonWorst,
    newtonAll,
    ms: Date.now() - t0,
  };
}

export interface CoverageScore {
  max: number;
  p99: number;
  p50: number;
  over: number;
  worstUt: [number, number];
  boundary: PctStats;
  locatorCellMm: number;
  locSelfCheckMax: number;
  ms: number;
}

/** Reverse (surface→mesh) coverage ruler — pilot block verbatim. */
export function scoreCoverage(
  xyz: Float32Array,
  idx: Uint32Array,
  rA: AnalyticRadiusFn,
  H: number,
  tol: number,
): CoverageScore {
  const nV = xyz.length / 3;
  const nF = idx.length / 3;
  const refXyz = new Float64Array(xyz.length);
  for (let i = 0; i < xyz.length; i++) refXyz[i] = xyz[i];
  const ref: RefMesh = { xyz: refXyz, idx, nV, nF };
  let edgeSum = 0;
  const eSamples = Math.min(2000, nF);
  for (let s = 0; s < eSamples; s++) {
    const t = Math.floor((s / eSamples) * nF) * 3;
    const a = idx[t] * 3, b = idx[t + 1] * 3;
    edgeSum += Math.hypot(xyz[b] - xyz[a], xyz[b + 1] - xyz[a + 1], xyz[b + 2] - xyz[a + 2]);
  }
  const cell = Math.max(0.4, Math.min(3.0, (edgeSum / Math.max(1, eSamples)) * 4));
  const loc = buildRefLocator(ref, cell);
  const bandMm = 0.5;
  const NU = 1024, NT = 1024;
  const cov = new Float64Array(NU * NT);
  let covN = 0;
  let worstU = 0, worstT = 0, worstD = -1;
  const t0 = Date.now();
  for (let j = 0; j < NT; j++) {
    const z = bandMm + ((H - 2 * bandMm) * j) / (NT - 1);
    for (let i = 0; i < NU; i++) {
      const th = (TAU * i) / NU;
      const r = rA(th, z);
      const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
      cov[covN++] = d;
      if (d > worstD) { worstD = d; worstU = th / TAU; worstT = z / H; }
    }
  }
  let refinedMax = worstD;
  const du = 1 / NU, dt = (H - 2 * bandMm) / (NT - 1) / H;
  for (let j = -8; j <= 8; j++) {
    for (let i = -8; i <= 8; i++) {
      const u = worstU + (i * du) / 4;
      const z = Math.min(H - bandMm, Math.max(bandMm, (worstT + (j * dt) / 4) * H));
      const th = ((u % 1) + 1) % 1 * TAU;
      const r = rA(th, z);
      refinedMax = Math.max(refinedMax, loc.dist(r * Math.cos(th), r * Math.sin(th), z));
    }
  }
  const covStats = pctStats(cov, covN, tol);
  const bDev = new Float64Array(NU * 4);
  let bN = 0;
  for (const z of [bandMm * 0.5, bandMm * 0.25, H - bandMm * 0.5, H - bandMm * 0.25]) {
    for (let i = 0; i < NU; i++) {
      const th = (TAU * i) / NU;
      const r = rA(th, z);
      bDev[bN++] = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
    }
  }
  let locSelfCheckMax = 0;
  for (let s = 0; s < 24; s++) {
    const th = (TAU * ((s * 79) % 1024)) / 1024;
    const z = bandMm + (H - 2 * bandMm) * (((s * 131) % 997) / 997);
    const r = rA(th, z);
    const px = r * Math.cos(th), py = r * Math.sin(th);
    locSelfCheckMax = Math.max(locSelfCheckMax, Math.abs(loc.dist(px, py, z) - loc.bruteDist(px, py, z)));
  }
  return {
    max: refinedMax,
    p99: covStats.p99,
    p50: covStats.p50,
    over: covStats.over,
    worstUt: [worstU, worstT],
    boundary: pctStats(bDev, bN, tol),
    locatorCellMm: cell,
    locSelfCheckMax,
    ms: Date.now() - t0,
  };
}

/** Live progress side-channel (vitest buffers stdout until the test ends). */
export function twinProgress(msg: string): void {
  try {
    appendFileSync(
      'research/exchange/_analytic_floor/progress.log',
      `${new Date().toISOString()} ${msg}\n`,
    );
  } catch {
    /* progress is best-effort */
  }
}

export interface FloorGridStats {
  /** Fraction of lattice nodes where the floor exceeds the sampler κ (pre-registered tell). */
  liftedFrac: number;
  /** As liftedFrac, but only counting nodes where the floor also demands h < maxEdge
   *  (i.e. it actually changes the mesh, not just the κ ordering on flat wall). */
  liftedEffectiveFrac: number;
  /** Max floor κ over the lattice (mm⁻¹). */
  floorMax: number;
}

/**
 * Compare the analytic floor against the sampler-FD κ on the (resU × resT) sizing
 * lattice — the pre-registered MASKED-arm early tell (§E-2026-07-10-ANALYTIC-FLOOR-
 * MASKED: lifted fraction ≈0.15–0.35 expected at 512; ≳0.6 predicts KILL-B early).
 */
export function floorGridStats(
  spec: FloorSpec,
  sampler: GpuSurfaceSampler,
  resU: number,
  resT: number,
  maxSagMm: number,
  maxEdgeMm: number,
): FloorGridStats {
  const { hu, ht } = metricStepsForSampler(sampler);
  const kappaAtMaxEdge = (8 * maxSagMm) / (maxEdgeMm * maxEdgeMm);
  let lifted = 0;
  let effective = 0;
  let floorMax = 0;
  for (let j = 0; j < resT; j++) {
    const t = resT > 1 ? j / (resT - 1) : 0;
    for (let i = 0; i < resU; i++) {
      const u = i / resU;
      const kSampler = Math.max(principalCurvatureMax(sampler, u, t, hu, ht), 1e-6);
      const kFloor = spec.curvatureFloor(u, t);
      if (kFloor > floorMax) floorMax = kFloor;
      if (kFloor > kSampler) {
        lifted++;
        if (kFloor > kappaAtMaxEdge) effective++;
      }
    }
  }
  const n = resU * resT;
  return { liftedFrac: lifted / n, liftedEffectiveFrac: effective / n, floorMax };
}

/**
 * Large-mesh-safe raw-index non-manifold audit (sorted-key run-length scan, no
 * Map cap). LOCAL COPY: the labkit promotion of nonManRawBig exists only in the
 * concurrent arm's UNCOMMITTED worktree — importing it broke this lib at every
 * COMMIT (masked by the shared tree; caught by the pinned-worktree verification,
 * E-2026-07-10-ANALYTIC-FLOOR-MASKED). Re-point to labkit once that lands.
 */
function nonManRawBig(idx: ArrayLike<number>): number {
  const nE = (idx.length / 3) * 3;
  const keys = new Float64Array(nE);
  let m = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    const e = [[a, b], [b, c], [c, a]] as const;
    for (const [p, q] of e) {
      const lo = p < q ? p : q, hi = p < q ? q : p;
      keys[m++] = lo * 134217728 + hi;
    }
  }
  const sub = keys.subarray(0, m);
  sub.sort();
  let nm = 0;
  for (let i = 0; i < m; ) {
    let j = i + 1;
    while (j < m && sub[j] === sub[i]) j++;
    if (j - i > 2) nm++;
    i = j;
  }
  return nm;
}

/**
 * MASKED-arm build-phase localizer (tractability instrument): times the floored
 * field + plain quadtree in isolation, then the FULL outer wall (creases + budget
 * search + triangulation), with live marks to progress.log. No caps/orient.
 */
export function maskedWallDiag(resU: number, resT: number, floor: FloorSpec): Record<string, unknown> {
  const t0 = Date.now();
  twinProgress(`masked-diag start ${resU}x${resT}`);
  const inp = prepareTwinInputs();
  const uBias = computeUBias(inp.outerSampler, false);
  twinProgress(`inputs ready uBias=${uBias} (+${Date.now() - t0}ms)`);

  const probe = (withFloor: boolean): { fieldMs: number; qtMs: number; leaves: number } => {
    const s1 = Date.now();
    const field = new MetricSizingField(inp.outerSampler, {
      maxSagMm: AF_PROD_OPTS.maxSagMm,
      minEdgeMm: AF_PROD_OPTS.minEdgeMm,
      maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
      gradeRatio: AF_PROD_OPTS.gradeRatio,
      resU,
      resT,
      curvatureFloor: withFloor ? floor.curvatureFloor : undefined,
      maxKappa: withFloor ? floor.maxKappa : undefined,
    });
    const fieldMs = Date.now() - s1;
    twinProgress(`field(${withFloor ? 'floored' : 'plain'}) ${fieldMs}ms`);
    const s2 = Date.now();
    const leaves = new PeriodicBalancedQuadtree(field, inp.outerSampler, {
      maxLevel: AF_PROD_OPTS.maxLevel,
      pinBoundaryLevel: Math.round(Math.log2(AF_PROD_OPTS.nRing)),
      minUniformLevel: inp.minUniformLevel,
      uBias,
    }).leafCount();
    const qtMs = Date.now() - s2;
    twinProgress(`quadtree(${withFloor ? 'floored' : 'plain'}) leaves=${leaves} ${qtMs}ms`);
    return { fieldMs, qtMs, leaves };
  };
  const plain = probe(false);
  const floored = probe(true);

  twinProgress('buildConformingWall(outer, floored, FULL opts incl. creases/budget) start');
  const s3 = Date.now();
  const outer = buildConformingWall(inp.outerSampler, {
    maxSagMm: AF_PROD_OPTS.maxSagMm,
    maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
    minEdgeMm: AF_PROD_OPTS.minEdgeMm,
    gradeRatio: AF_PROD_OPTS.gradeRatio,
    maxLevel: AF_PROD_OPTS.maxLevel,
    resU,
    resT,
    nRing: AF_PROD_OPTS.nRing,
    targetTriangles: Math.floor(AF_PROD_OPTS.targetTriangles / 2),
    budgetMode: AF_PROD_OPTS.budgetMode,
    minUniformLevel: inp.minUniformLevel,
    uBias,
    directionalRefine: false,
    surfaceId: 0,
    featureLevel: AF_PROD_OPTS.featureLevel,
    creaseLines: inp.creaseLines.length > 0 ? inp.creaseLines : undefined,
    efgSampler: inp.outerEfgSampler,
    curvatureFloor: floor.curvatureFloor,
    maxKappa: floor.maxKappa,
  });
  const wallMs = Date.now() - s3;
  const outerTris = outer.indices.length / 3;
  twinProgress(`outer wall DONE tris=${outerTris} budget=${JSON.stringify(outer.budget ?? null)} ${wallMs}ms`);
  return {
    uBias,
    plain,
    floored,
    outer: { tris: outerTris, wallMs, budget: outer.budget ?? null },
    totalMs: Date.now() - t0,
  };
}

/** Full-pot watertight audit with the NON-VACUOUS injected-crack control. */
export function auditWatertight(fullIdx: Uint32Array): { nonMan: number; controlMoved: boolean } {
  const nonMan = nonManRawBig(fullIdx);
  const cracked = new Uint32Array(fullIdx.length + 3);
  cracked.set(fullIdx);
  cracked.set([fullIdx[0], fullIdx[1], fullIdx[2]], fullIdx.length);
  return { nonMan, controlMoved: nonManRawBig(cracked) > nonMan };
}
