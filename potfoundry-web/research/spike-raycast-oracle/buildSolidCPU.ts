// research/spike-raycast-oracle/buildSolidCPU.ts
//
// Parameterized CPU build (Raycast-Oracle Fidelity Spike, Task 1).
//
// This is a near-verbatim, parameterized COPY of `assembleConformingCPU`
// (`src/geometry/conformingTopologyGate.test.ts:64-287`). It is copied — not
// imported — because that source is a `.test.ts` whose top-level
// `describe.each` would execute on import in a non-test module. Two changes
// vs the original: `maxSagMm` is a parameter, and
// `globalThis.__pfConformingVerdictRefine` is toggled around the
// `assembleWatertight` call when `opts.verdictRefine` is true. This
// duplication is intentional and plan-mandated — do not dedupe it.
import {
  assembleWatertight,
  GpuSurfaceSampler,
  extractAnalyticFeatures,
  chooseCreaseGrid,
  chooseCreaseTGrid,
  chooseHelixGrid,
  applyUWarp,
  applyTWarp,
  applyHelixWarp,
  type AssemblyDimensions,
  type FeatureLine,
  type SurfaceSampler,
} from '../../src/renderers/webgpu/parametric/conforming';
import type { StyleId, StyleOptions } from '../../src/geometry/types';
import { DEFAULT_DIMENSIONS } from '../../src/geometry/types';
import { getStyleFunction } from '../../src/geometry/styles';
import { baseRadius } from '../../src/geometry/profile';
import { buildStyleParamPayload } from '../../src/utils/styleParams';

const DIMS = {
  H: DEFAULT_DIMENSIONS.H, Rt: DEFAULT_DIMENSIONS.Rt, Rb: DEFAULT_DIMENSIONS.Rb,
  tWall: DEFAULT_DIMENSIONS.tWall, tBottom: DEFAULT_DIMENSIONS.tBottom,
  rDrain: DEFAULT_DIMENSIONS.rDrain, expn: DEFAULT_DIMENSIONS.expn,
};
const MIN_R = 0.5;
const EMPTY_OPTS: StyleOptions = {};

/** CPU surrogate of WGSL compute_outer_radius (twist identity at default dims). */
export function outerRadius(styleId: StyleId, theta: number, t: number): number {
  const z = t * DIMS.H;
  const r0 = baseRadius(z, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn, EMPTY_OPTS);
  return getStyleFunction(styleId)(theta, z, r0, DIMS.H, EMPTY_OPTS);
}
function innerRadius(styleId: StyleId, theta: number, t: number): number {
  return Math.max(outerRadius(styleId, theta, t) - DIMS.tWall, MIN_R);
}

/** CPU surrogate of WGSL evaluate_vertices — all 6 surface IDs. Exported so the
 *  sag scorer and condition-C task lift with the identical exact field. */
export function evalSurface(
  styleId: StyleId, u: number, t: number, surfaceId: number,
): [number, number, number] {
  const theta = 2 * Math.PI * (u - Math.floor(u));
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const { H, tBottom, rDrain } = DIMS;
  let r: number, z: number;
  if (surfaceId < 0.5) { r = outerRadius(styleId, theta, t); z = t * H; }
  else if (surfaceId < 1.5) { z = tBottom + t * (H - tBottom); r = innerRadius(styleId, theta, z / H); }
  else if (surfaceId < 2.5) {
    const ri = innerRadius(styleId, theta, 1), ro = outerRadius(styleId, theta, 1);
    r = ri + (ro - ri) * t; z = H;
  } else if (surfaceId < 3.5) {
    const ro = outerRadius(styleId, theta, 0); r = ro + (rDrain - ro) * t; z = 0;
  } else if (surfaceId < 4.5) {
    const ri = innerRadius(styleId, theta, tBottom / H); r = ri + (rDrain - ri) * t; z = tBottom;
  } else { r = rDrain; z = t * tBottom; }
  return [r * cos, r * sin, z];
}

function denseWallSampler(styleId: StyleId, surfaceId: number, res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const p = evalSurface(styleId, col / res, tVal, surfaceId);
      grid[w++] = p[0]; grid[w++] = p[1]; grid[w++] = p[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}

export interface SolidCPU {
  paramVerts: Float32Array;
  pos3D: Float32Array;
  indices: Uint32Array;
  outerIndexStart: number;
  outerIndexEnd: number;
  generalCurveCount: number;
  featureKinds: Record<string, number>;
  verdictRan: boolean;
}

export function buildSolidCPU(
  styleId: StyleId,
  opts: { maxSagMm: number; verdictRefine: boolean },
): SolidCPU {
  const DENSE_RES = 128;
  const outerSampler = denseWallSampler(styleId, 0, DENSE_RES);
  const innerSampler = denseWallSampler(styleId, 1, DENSE_RES);
  const dims: AssemblyDimensions = { H: DIMS.H, tBottom: DIMS.tBottom, rDrain: DIMS.rDrain };
  const nRing = 256;

  const [, packedParams] = buildStyleParamPayload(styleId, EMPTY_OPTS as Record<string, unknown>);
  const featureGraph = extractAnalyticFeatures(
    styleId, Float32Array.from(packedParams), { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
  );

  const featureKinds: Record<string, number> = {};
  for (const l of featureGraph.lines) featureKinds[l.kind] = (featureKinds[l.kind] ?? 0) + 1;

  const creaseUSet = new Set<number>(), creaseU: number[] = [];
  const creaseTSet = new Set<number>(), creaseT: number[] = [];
  const helixLines = featureGraph.lines.filter((l) => l.kind === 'helical-crease');
  for (const line of featureGraph.lines) {
    if (line.kind === 'vertical-crease') {
      const u = line.points[0].u, key = Math.round(u * 1e7);
      if (!creaseUSet.has(key)) { creaseUSet.add(key); creaseU.push(u); }
    } else if (line.kind === 'horizontal-band') {
      const tt = line.points[0].t, key = Math.round(tt * 1e7);
      if (!creaseTSet.has(key)) { creaseTSet.add(key); creaseT.push(tt); }
    }
  }
  const creaseChoice = chooseCreaseGrid(creaseU);
  const creaseTChoice = chooseCreaseTGrid(creaseT);
  let helixChoice = chooseHelixGrid(0, 0, 0);
  if (helixLines.length > 0) {
    const k = helixLines.length, l0 = helixLines[0].points;
    const p0 = l0[0], p1 = l0[Math.min(1, l0.length - 1)];
    let du = (p1.u - p0.u) % 1;
    if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
    const dt = p1.t - p0.t, slope = dt > 1e-9 ? du / dt : 0;
    helixChoice = chooseHelixGrid(k, -slope * k, p0.u * k);
  }

  const generalCurves: FeatureLine[] = featureGraph.lines.filter((l) => l.kind === 'general-curve');
  const minLevel = Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level);

  // Verdict-refine flag: eligible only when outer featureLines are non-empty
  // (matches ConformingWall's flag-ON guard). Record eligibility for the scorecard.
  const prevFlag = (globalThis as Record<string, unknown>).__pfConformingVerdictRefine;
  const verdictRan = opts.verdictRefine && generalCurves.length > 0;
  (globalThis as Record<string, unknown>).__pfConformingVerdictRefine = opts.verdictRefine;
  let asm;
  try {
    asm = assembleWatertight(outerSampler, innerSampler, dims, {
      maxSagMm: opts.maxSagMm, maxEdgeMm: 8, minEdgeMm: 0.2, gradeRatio: 2,
      maxLevel: 10, resU: 128, resT: 128, nRing, targetTriangles: undefined,
      budgetMode: 'cap' as const,
      minUniformLevel: minLevel > 0 ? minLevel : undefined,
      outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
      featureLevel: 7,
    });
  } finally {
    (globalThis as Record<string, unknown>).__pfConformingVerdictRefine = prevFlag;
  }

  if (!creaseChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) asm.vertices[i] = applyUWarp(creaseChoice.warp, asm.vertices[i]);
  }
  if (!creaseTChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      if (asm.vertices[i + 2] < 1.5) asm.vertices[i + 1] = applyTWarp(creaseTChoice.warp, asm.vertices[i + 1]);
    }
  }
  if (!helixChoice.warp.isIdentity && creaseChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      const sid = asm.vertices[i + 2];
      const tEval = sid < 1.5 ? asm.vertices[i + 1] : sid < 2.5 ? 1 : 0;
      asm.vertices[i] = applyHelixWarp(helixChoice.warp, asm.vertices[i], tEval);
    }
  }

  const paramVerts = Float32Array.from(asm.vertices);
  const n = asm.vertices.length / 3;
  const pos3D = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = evalSurface(styleId, asm.vertices[i * 3], asm.vertices[i * 3 + 1], asm.vertices[i * 3 + 2]);
    pos3D[i * 3] = p[0]; pos3D[i * 3 + 1] = p[1]; pos3D[i * 3 + 2] = p[2];
  }

  const outer = asm.surfaceRanges.find((r) => r.surfaceId === 0);
  if (!outer) throw new Error('no outer surface range');

  return {
    paramVerts, pos3D, indices: asm.indices,
    outerIndexStart: outer.indexStart, outerIndexEnd: outer.indexEnd,
    generalCurveCount: generalCurves.length, featureKinds, verdictRan,
  };
}
