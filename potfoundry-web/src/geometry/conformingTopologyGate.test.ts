/**
 * conformingTopologyGate.test.ts — Plan Task 3.1: the crown-jewel CI gate.
 *
 * Headless CPU goal-vector gate over ALL 20 registered styles. For each style we
 * CPU-assemble the conforming wall at default dims using the SAME pipeline the
 * production GPU path runs (`assembleWatertight` + `extractAnalyticFeatures` +
 * the crease/helix warps), but driven by a CPU surface surrogate instead of a
 * WebGPU `evaluatePoints` round-trip — so the gate runs in CI (Vitest + jsdom)
 * with no GPU.
 *
 * It asserts the goal vector for every style:
 *   boundaryEdges === 0, nonManifoldEdges === 0, orientationMismatches === 0,
 *   sliverCount === 0.
 *
 * ## Faithfulness / caveats
 *
 * - **Topology (boundary / non-manifold / orientation)** is reproduced EXACTLY:
 *   it is a pure function of the assembled `(u,t,surfaceId)` connectivity, which
 *   is identical to production (same `assembleWatertight` + warp passes). The
 *   crease/helix/u-warps are connectivity-preserving homeomorphisms, so they
 *   cannot change these invariants.
 *
 * - **Slivers / aspect** depend on 3D POSITIONS. Production evaluates the final
 *   vertices on the GPU via the exact WGSL `evaluate_vertices`; here we evaluate
 *   the same `(u,t,surfaceId)` vertices with a CPU surrogate of that geometry
 *   built from `src/geometry/styles.ts` (the CPU style-radius functions, which
 *   "match the WGSL shader implementations" per their header but are not
 *   guaranteed byte-identical). The surrogate is geometrically representative,
 *   so the sliver gate is meaningful — but for styles whose CPU radius is an
 *   APPROXIMATION of the WGSL radius the sliver field is approximate. Those are
 *   flagged in the followups; topology stays exact for them regardless.
 *
 * Reference: `parametric/conforming/WatertightAssembly.test.ts` (the CPU
 * `evalSurface` re-impl pattern this file generalizes to real styles) and
 * `src/fidelity/metrics.ts` topology / triangle-quality diagnostics.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_REGISTRY } from '../styles/registry';
import type { StyleId, StyleOptions } from './types';
import { DEFAULT_DIMENSIONS } from './types';
import { getStyleFunction } from './styles';
import { baseRadius } from './profile';
import { buildStyleParamPayload } from '../utils/styleParams';
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
} from '../renderers/webgpu/parametric/conforming';
import { topologyMetric, triangleQuality3D } from '../fidelity/metrics';
import type { MeshView } from '../fidelity/types';

const ALL_20_STYLES = Object.keys(STYLE_REGISTRY) as StyleId[];

/** Default-dim pot (matches plan default + DEFAULT_DIMENSIONS). */
const DIMS = {
  H: DEFAULT_DIMENSIONS.H,
  Rt: DEFAULT_DIMENSIONS.Rt,
  Rb: DEFAULT_DIMENSIONS.Rb,
  tWall: DEFAULT_DIMENSIONS.tWall,
  tBottom: DEFAULT_DIMENSIONS.tBottom,
  rDrain: DEFAULT_DIMENSIONS.rDrain,
  expn: DEFAULT_DIMENSIONS.expn,
};

/** Min wall radius — mirrors the WGSL `get_minR()` floor in `compute_inner_radius`. */
const MIN_R = 0.5;

const EMPTY_OPTS: StyleOptions = {};

/**
 * CPU surrogate of the WGSL `compute_outer_radius(theta, t)`:
 * `r0 = baseRadius(t·H)`, then the style radius function. (Twist is identity at
 * default opts — spinTurns/spinPhase = 0 — so theta passes through.)
 */
function outerRadius(styleId: StyleId, theta: number, t: number): number {
  const z = t * DIMS.H;
  const r0 = baseRadius(z, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn, EMPTY_OPTS);
  return getStyleFunction(styleId)(theta, z, r0, DIMS.H, EMPTY_OPTS);
}

/** CPU surrogate of `compute_inner_radius`: outer − tWall, floored at MIN_R. */
function innerRadius(styleId: StyleId, theta: number, t: number): number {
  return Math.max(outerRadius(styleId, theta, t) - DIMS.tWall, MIN_R);
}

/**
 * CPU surrogate of the WGSL `evaluate_vertices`: maps a packed (u,t,surfaceId)
 * to a 3D position. Mirrors `adaptive_mesh.wgsl` surface dispatch exactly
 * (outer / inner walls + rim / bottom-under / bottom-top / drain caps), with the
 * style radius supplied by the CPU surrogate above.
 */
function evalSurface(styleId: StyleId, u: number, t: number, surfaceId: number): [number, number, number] {
  const theta = 2 * Math.PI * (u - Math.floor(u));
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const { H, tBottom, rDrain } = DIMS;
  let r: number;
  let z: number;
  if (surfaceId < 0.5) {
    // OUTER (0): z = t·H
    r = outerRadius(styleId, theta, t);
    z = t * H;
  } else if (surfaceId < 1.5) {
    // INNER (1): z = tBottom + t·(H − tBottom); radius sampled at t_radius = z/H
    z = tBottom + t * (H - tBottom);
    r = innerRadius(styleId, theta, z / H);
  } else if (surfaceId < 2.5) {
    // RIM (2): t=0 inner edge → t=1 outer edge, at z=H (t_top = 1)
    const ri = innerRadius(styleId, theta, 1);
    const ro = outerRadius(styleId, theta, 1);
    r = ri + (ro - ri) * t;
    z = H;
  } else if (surfaceId < 3.5) {
    // BOTTOM-UNDER (3): t=0 outer edge → t=1 drain, at z=0 (t_bot = 0)
    const ro = outerRadius(styleId, theta, 0);
    r = ro + (rDrain - ro) * t;
    z = 0;
  } else if (surfaceId < 4.5) {
    // BOTTOM-TOP (4): t=0 inner edge → t=1 drain, at z=tBottom (t_radius = tBottom/H)
    const ri = innerRadius(styleId, theta, tBottom / H);
    r = ri + (rDrain - ri) * t;
    z = tBottom;
  } else {
    // DRAIN (5): cylinder r=rDrain, z = t·tBottom
    r = rDrain;
    z = t * tBottom;
  }
  return [r * cos, r * sin, z];
}

/** A wall sampler bound to one surfaceId — what `assembleWatertight` consumes. */
function wallSampler(styleId: StyleId, surfaceId: number): SurfaceSampler {
  return { position: (u: number, t: number) => evalSurface(styleId, u, t, surfaceId) };
}

/** Dense bilinear grid sampler (mirrors production's GPU `buildWallSampler`). */
function denseWallSampler(styleId: StyleId, surfaceId: number, res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const p = evalSurface(styleId, col / res, tVal, surfaceId);
      grid[w++] = p[0];
      grid[w++] = p[1];
      grid[w++] = p[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}

export interface CpuConformingResult {
  /** Final 3D positions [x,y,z, ...] (CPU-evaluated from the assembled u,t,s). */
  vertices: Float32Array;
  /** Triangle indices. */
  indices: Uint32Array;
  /** Whether the style fed any general-curve features into the outer wall. */
  hasGeneralCurves: boolean;
}

/**
 * CPU-assemble the conforming whole-pot mesh for a style at the given dims —
 * a headless mirror of the production conforming branch in
 * `ParametricExportComputer.ts` (dense wall samplers → analytic feature graph →
 * crease/helix grid selection → `assembleWatertight` → warp passes → evaluate
 * the assembled vertices to 3D).
 */
export function assembleConformingCPU(styleId: StyleId): CpuConformingResult {
  // Dense bilinear wall samplers (the assembler's sag/metric driver), mirroring
  // production's GPU-evaluated dense grids wrapped in GpuSurfaceSampler.
  const DENSE_RES = 128;
  const outerSampler = denseWallSampler(styleId, 0, DENSE_RES);
  const innerSampler = denseWallSampler(styleId, 1, DENSE_RES);

  const dims: AssemblyDimensions = { H: DIMS.H, tBottom: DIMS.tBottom, rDrain: DIMS.rDrain };
  const nRing = 256;

  // Analytic feature graph (same packing the GPU path uses) → crease/helix grids.
  const [, packedParams] = buildStyleParamPayload(styleId, EMPTY_OPTS as Record<string, unknown>);
  const featureGraph = extractAnalyticFeatures(
    styleId,
    Float32Array.from(packedParams),
    { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
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
      const tt = line.points[0].t;
      const key = Math.round(tt * 1e7);
      if (creaseTSet.has(key)) continue;
      creaseTSet.add(key);
      creaseT.push(tt);
    }
  }
  const creaseChoice = chooseCreaseGrid(creaseU);
  const creaseTChoice = chooseCreaseTGrid(creaseT);
  let helixChoice = chooseHelixGrid(0, 0, 0);
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
  }

  const generalCurves: FeatureLine[] = featureGraph.lines.filter((l) => l.kind === 'general-curve');
  const minLevel = Math.max(creaseChoice.level, creaseTChoice.level, helixChoice.level);

  const asm = assembleWatertight(outerSampler, innerSampler, dims, {
    maxSagMm: 0.1,
    maxEdgeMm: 8,
    minEdgeMm: 0.2,
    gradeRatio: 2,
    maxLevel: 10,
    resU: 128,
    resT: 128,
    nRing,
    targetTriangles: undefined,
    budgetMode: 'cap' as const,
    minUniformLevel: minLevel > 0 ? minLevel : undefined,
    outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    featureLevel: 7,
  });

  // ── Warp passes (connectivity-preserving; mirror production order). ──
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

  // CPU-evaluate every assembled (u,t,surfaceId) vertex to a 3D position.
  const n = asm.vertices.length / 3;
  const pos3D = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = evalSurface(styleId, asm.vertices[i * 3], asm.vertices[i * 3 + 1], asm.vertices[i * 3 + 2]);
    pos3D[i * 3] = p[0];
    pos3D[i * 3 + 1] = p[1];
    pos3D[i * 3 + 2] = p[2];
  }

  return { vertices: pos3D, indices: asm.indices, hasGeneralCurves: generalCurves.length > 0 };
}

/** Weld tolerance for the topology classifier (matches the WatertightAssembly test). */
const WELD_TOL_MM = 1e-4;

describe.each(ALL_20_STYLES)('conforming goal-vector: %s', (style) => {
  it('is watertight, manifold, oriented, sliver-free at default dims', () => {
    const asm = assembleConformingCPU(style);
    const mesh: MeshView = { vertices: asm.vertices, indices: asm.indices };

    // Guard against a vacuous pass: an empty/degenerate mesh trivially has 0
    // boundary/non-manifold/sliver edges. A real whole-pot conforming mesh has
    // thousands of triangles (two walls at nRing=256 + caps).
    expect(mesh.indices.length / 3).toBeGreaterThan(1000);

    const topo = topologyMetric(mesh, WELD_TOL_MM);
    const quality = triangleQuality3D(mesh);

    expect(topo.boundaryEdges).toBe(0);
    expect(topo.nonManifoldEdges).toBe(0);
    expect(topo.orientationMismatches).toBe(0);
    expect(quality.sliverCount).toBe(0);
  }, 60000);
});
