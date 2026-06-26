/**
 * assembleFeatureAligned.derisk.test.ts — STEP 2 TDD gate: the feature-aligned
 * whole-wall interior assembler on a REAL conditioned graph (Voronoi).
 *
 * Drives the real pipeline (styleSampler → detectFeatures → conditionGraph, calibrated
 * config) → `assembleFeatureAligned` → measures the unrolled-rectangle interior mesh:
 *   - corridorPaveMulti fill: inversion 0, pinches 0;
 *   - watertight 0/0 by index (frame = open boundary);
 *   - every band perimeter edge incidence == 2 (bands weld);
 *   - every feature-chain edge incidence == 2 (crests followed, no serration).
 *
 * PF_FA_MAXDEG=<N> drops edges incident to nodes of degree > N before assembling — to
 * ATTRIBUTE any watertight defects to the high-degree central-fan limit (the shared-node
 * de-risk proved deg-15 fans crack; generic triples weld 0/0).
 *
 * CPU throwaway-grade spike (real detector pipeline → heavy). Reuses only proven
 * primitives + the new assembler. Skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/assembleFeatureAligned.derisk.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { conditionGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { ConditionGraphOptions, ConditionedGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { assembleFeatureAligned } from './assembleFeatureAligned';
import type { AssembleFeatureAlignedResult } from './assembleFeatureAligned';
import { auditWatertight, triangleQuality3D } from './audit';

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;
const STYLE = process.env.PF_FA_STYLE ?? 'Voronoi';

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  uToMm: U_TO_MM, tToMm: T_TO_MM, creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};
const RELIEF_MEAN_SAMPLES = 256, RELIEF_ALPHA = 0.5, RELIEF_ABS_FLOOR_MM = 1e-3;
function samplerRadius(s: SurfaceSampler, u: number, t: number): number { const [x, y] = s.position(u, t); return Math.hypot(x, y); }
function makeReliefIndicator(s: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t); if (cached !== undefined) return cached;
    let sum = 0; const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const r = samplerRadius(s, i / RELIEF_MEAN_SAMPLES, t); rs[i] = r; sum += r; }
    const mean = sum / RELIEF_MEAN_SAMPLES; let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const d = rs[i] - mean; sq += d * d; }
    const stats = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * Math.sqrt(sq / RELIEF_MEAN_SAMPLES)) };
    rowStats.set(t, stats); return stats;
  };
  return (u, t) => { const { mean, floor } = statsAtT(t); return Math.abs(samplerRadius(s, u, t) - mean) - floor; };
}
function condOpts(): ConditionGraphOptions {
  return { uToMm: U_TO_MM, tToMm: T_TO_MM, minFeatureMm: 2.5, simplifyTolMm: 0.5, junctionMergeMm: 2.5, prune: false, simplify: true, mergeJunctions: true };
}

function edgeKey(i: number, j: number): string { return i < j ? `${i}:${j}` : `${j}:${i}`; }
function incidence(indices: Uint32Array | number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) { if (i === j) continue; m.set(edgeKey(i, j), (m.get(edgeKey(i, j)) ?? 0) + 1); }
  }
  return m;
}

/** Drop edges incident to nodes with degree > maxDeg (degree-attribution probe). */
function capDegree(graph: ConditionedGraph, maxDeg: number): ConditionedGraph {
  const degree = new Array<number>(graph.nodes.length).fill(0);
  for (const e of graph.edges) { degree[e.endpoints[0]]++; if (e.endpoints[1] !== e.endpoints[0]) degree[e.endpoints[1]]++; }
  const edges = graph.edges.filter((e) => degree[e.endpoints[0]] <= maxDeg && degree[e.endpoints[1]] <= maxDeg);
  return { ...graph, edges };
}

interface Build { result: AssembleFeatureAlignedResult; }
function build(): Build {
  const sampler = styleSampler(STYLE as Parameters<typeof styleSampler>[0], {}, DIMS);
  const raw = detectFeatures(sampler, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) });
  let cond: ConditionedGraph = conditionGraph(raw, condOpts());
  const maxDeg = process.env.PF_FA_MAXDEG ? Number(process.env.PF_FA_MAXDEG) : Infinity;
  if (Number.isFinite(maxDeg)) cond = capDegree(cond, maxDeg);
  // PF_FA_WINDOW="uLo,uHi,tLo,tHi" shrinks the interior window (density probe for the cdt2d limit).
  let interiorWindow: { uLo: number; uHi: number; tLo: number; tHi: number } | undefined;
  if (process.env.PF_FA_WINDOW) { const [uLo, uHi, tLo, tHi] = process.env.PF_FA_WINDOW.split(',').map(Number); interiorWindow = { uLo, uHi, tLo, tHi }; }
  const result = assembleFeatureAligned(sampler, cond, { uToMm: U_TO_MM, tToMm: T_TO_MM, interiorWindow, disableBands: !!process.env.PF_FA_NOBANDS });
  return { result };
}

let cached: Build | undefined;
function getBuild(): Build { if (!cached) cached = build(); return cached; }

describe.skipIf(!process.env.PF_DERISK)('STEP 2 — assembleFeatureAligned on a real conditioned Voronoi graph', () => {
  beforeAll(() => { getBuild(); }, 180000);

  it('reports assembler diagnostics', () => {
    const { result } = getBuild();
    // eslint-disable-next-line no-console
    console.log('[FA] diag', JSON.stringify(result.diagnostics));
    expect(result.diagnostics.edgesUsed).toBeGreaterThan(0);
    expect(result.diagnostics.bands).toBeGreaterThanOrEqual(1);
  });

  it('corridorPaveMulti fill: inversion == 0, pinches == 0', () => {
    const { result } = getBuild();
    expect(result.diagnostics.fillTriangles).toBeGreaterThan(0);
    expect(result.diagnostics.fillInversion).toBe(0);
    expect(result.diagnostics.fillPinches).toBe(0);
  });

  it('GATE: watertight 0/0 by index (frame = open boundary)', () => {
    const { result } = getBuild();
    const audit = auditWatertight(result.mesh, { boundaryVertexIndices: result.frameVertexIds });
    // eslint-disable-next-line no-console
    console.log('[FA] audit', JSON.stringify(audit), 'maxDeg', result.diagnostics.maxNodeDegree);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(audit.boundaryEdges).toBeGreaterThan(0);
  });

  it('every band perimeter edge incidence == 2 (bands weld)', () => {
    const { result } = getBuild();
    const inc = incidence(result.mesh.indices);
    let cracked = 0, total = 0;
    for (const loop of result.bandPerims) for (let i = 0; i < loop.length; i++) { total++; if (inc.get(edgeKey(loop[i], loop[(i + 1) % loop.length])) !== 2) cracked++; }
    // eslint-disable-next-line no-console
    console.log(`[FA] band perim edges: cracked=${cracked}/${total}`);
    expect(total).toBeGreaterThan(0);
    expect(cracked).toBe(0);
  });

  it('every feature-chain edge incidence == 2 (crests followed, no serration)', () => {
    const { result } = getBuild();
    const inc = incidence(result.mesh.indices);
    let cracked = 0, total = 0;
    for (const chain of result.featureChains) for (let i = 0; i + 1 < chain.length; i++) { total++; if (inc.get(edgeKey(chain[i], chain[i + 1])) !== 2) cracked++; }
    // eslint-disable-next-line no-console
    console.log(`[FA] feature-chain edges: cracked=${cracked}/${total}`);
    expect(total).toBeGreaterThan(0);
    expect(cracked).toBe(0);
  });

  it('reports merged triangle quality (informational)', () => {
    const { result } = getBuild();
    const q = triangleQuality3D(result.mesh);
    // eslint-disable-next-line no-console
    console.log(`[FA] tris band=${result.bandTriCount} fill=${result.diagnostics.fillTriangles} aspectMax=${q.aspectMax.toFixed(2)} pct<10=${q.pctMinAngleBelow10.toFixed(1)}% p50=${q.minAngleP50.toFixed(1)}°`);
    expect(result.mesh.indices.length % 3).toBe(0);
  });
});
