/**
 * featureAssembler.selective.derisk.test.ts — SELECTIVE PAVING (the chosen STEP-3
 * strategy after the band-construction ceiling was characterized).
 *
 * The gate proved per-edge full-feature-band construction ceilings at ~67/61/83% on
 * dense relief lattices (the offset folds where the surface relief radius < band
 * width — intrinsic, not algorithmic). Selective paving attacks the root: pave only
 * the edges whose band has a SIMPLE footprint at feature width (premium strip-pave
 * flank quality); for the folding (relief-dense) edges, do NOT force a band — insert
 * just the SPINE as a `corridorPaveMulti` feature constraint (the spine is always
 * simple in (u,t); only the band OFFSET folds), so its crest is still a continuous
 * mesh edge (NO serration), triangulated by cdt2d. The whole wall is covered: bands
 * where they give clean quality, CDT-followed spines elsewhere.
 *
 * MECHANISM de-risk (this file): a few SEPARATED clean bands + a few SEPARATED folding
 * spines (free-interior constraints) coexist in ONE corridorPaveMulti fill and weld:
 *   - merged mesh nonManifoldEdges == 0, tJunctions == 0 (frame = open boundary);
 *   - every clean-band perimeter edge incidence == 2 (bands weld);
 *   - every folding-spine feature-chain edge incidence == 2 (crest FOLLOWED, count-2);
 *   - corridorPaveMulti inversionCount == 0, unfillablePinches == [];
 *   - NEGATIVE CONTROL: split a band-perimeter vertex band-side → tJunctions > 0.
 *
 * CPU throwaway spike (real detector pipeline → heavy). Reuses only proven primitives;
 * no production code. Skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/featureAssembler.selective.derisk.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { conditionGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { ConditionGraphOptions, ConditionedGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureEdge } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';
import { paveRidgeCornerSplit, footprintSelfCrossings } from './bandConstruct';
import type { RidgeResult } from './featureStrip';
import { corridorPaveMulti } from './corridorPave';
import type { FeatureChainInput, CorridorPaveMultiResult } from './corridorPave';
import { extractHoleBoundary } from './seamFill';
import type { HoleBoundary } from './seamFill';
import { auditWatertight } from './audit';
import type { Mesh3 } from './audit';
import { QSCALE } from './railKey';
import type { StationPoint } from './stations';

// ── Real-pipeline config (verbatim from the step3a / gate de-risks) ─────────────

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;
const STYLE = 'Voronoi';

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

// ── Selection / band parameters (feature-sized width — the chosen operating point) ─

const HALF_W = 0.6;
const EDGE_MM = 1.5; // coarse edge keeps the MECHANISM de-risk fast (weld is edge-independent; quality is task-10)
const MIN_LEN_MM = 10;
const MAX_BANDS = 3, MAX_FEATURES = 3;
const MAX_SCAN = 80; // cap how many candidates we pave to classify (keep beforeAll fast)
const SEP_MM = 2 * HALF_W + EDGE_MM + 3; // band/feature footprints disjoint + margin
const U_LO = 0.12, U_HI = 0.88, T_LO = 0.12, T_HI = 0.88;

function edgeKey(i: number, j: number): string { return i < j ? `${i}:${j}` : `${j}:${i}`; }
function dyadicSnap(x: number): number { return Math.round(x * QSCALE) / QSCALE; }
function polyLenMm(p: ReadonlyArray<{ u: number; t: number }>): number {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot((p[i].u - p[i - 1].u) * U_TO_MM, (p[i].t - p[i - 1].t) * T_TO_MM);
  return s;
}
function minPolyDistMm(a: ReadonlyArray<{ u: number; t: number }>, b: ReadonlyArray<{ u: number; t: number }>): number {
  let best = Infinity;
  for (const p of a) for (const q of b) { const d = Math.hypot((p.u - q.u) * U_TO_MM, (p.t - q.t) * T_TO_MM); if (d < best) best = d; }
  return best;
}
function interior(p: ReadonlyArray<{ u: number; t: number }>): boolean {
  for (const q of p) if (q.u < U_LO || q.u > U_HI || q.t < T_LO || q.t > T_HI) return false;
  return true;
}
function buildFrameLoop(stepUT: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const push = (u: number, t: number): void => out.push([dyadicSnap(u), dyadicSnap(t)]);
  const n = Math.max(1, Math.round(1 / stepUT));
  for (let i = 0; i < n; i++) push(i / n, 0);
  for (let i = 0; i < n; i++) push(1, i / n);
  for (let i = 0; i < n; i++) push(1 - i / n, 1);
  for (let i = 0; i < n; i++) push(0, 1 - i / n);
  return out;
}
function incidence(indices: Uint32Array | number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) { if (i === j) continue; m.set(edgeKey(i, j), (m.get(edgeKey(i, j)) ?? 0) + 1); }
  }
  return m;
}

interface SelectiveBuild {
  bands: RidgeResult[];
  perims: number[][];
  features: FeatureEdge[];
  fill: CorridorPaveMultiResult;
  merged: Mesh3;
  frameSet: Set<number>;
  bandTriCount: number;
  sampler: SurfaceSampler;
}

function buildSelective(): SelectiveBuild {
  const sampler = styleSampler(STYLE as Parameters<typeof styleSampler>[0], {}, DIMS);
  const raw = detectFeatures(sampler, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) });
  const cond: ConditionedGraph = conditionGraph(raw, condOpts());
  const cand = cond.edges
    .filter((e) => e.kind !== 'loop' && interior(e.polyline) && polyLenMm(e.polyline) >= MIN_LEN_MM)
    .sort((a, b) => polyLenMm(b.polyline) - polyLenMm(a.polyline));

  // LAZY selection: only pave SEPARATED candidates, classify each (clean band vs
  // folding spine), stop once both quotas fill (paving all ~420 edges at fine edge is
  // far too slow). Candidates are length-desc; that's fine — folding fills fast, bands
  // come from the rest.
  const usedPolys: Array<ReadonlyArray<{ u: number; t: number }>> = [];
  const sep = (poly: ReadonlyArray<{ u: number; t: number }>): boolean => !usedPolys.some((p) => minPolyDistMm(poly, p) < SEP_MM);
  const bands: RidgeResult[] = [];
  const features: FeatureEdge[] = [];
  let scanned = 0;
  for (const e of cand) {
    if (bands.length >= MAX_BANDS && features.length >= MAX_FEATURES) break;
    if (scanned >= MAX_SCAN) break;
    if (!sep(e.polyline)) continue;
    scanned++;
    const spine: StationPoint[] = e.polyline.map((p) => ({ u: p.u, t: p.t }));
    let band: RidgeResult | null = null;
    try { band = paveRidgeCornerSplit(spine, sampler, { widthMm: HALF_W, edgeMm: EDGE_MM }); } catch { band = null; }
    const isClean = band !== null && footprintSelfCrossings(band.mesh, band.vertexUT) === 0;
    if (isClean && band) {
      if (bands.length < MAX_BANDS) { usedPolys.push(e.polyline); bands.push(band); }
    } else if (features.length < MAX_FEATURES) {
      usedPolys.push(e.polyline); features.push(e);
    }
  }

  // Assemble bands (holes) into one merged (u,t) table; collect perimeters + complement dirs.
  const mergedUT: Array<[number, number]> = [];
  const perims: number[][] = [];
  const complementDir = new Map<string, [number, number]>();
  const bandTris: number[] = [];
  for (const band of bands) {
    const bh: HoleBoundary = extractHoleBoundary({ indices: band.mesh.indices }, new Set<number>());
    const off = mergedUT.length;
    for (const p of band.vertexUT) mergedUT.push([p[0], p[1]]);
    for (let k = 0; k < band.mesh.indices.length; k++) bandTris.push(band.mesh.indices[k] + off);
    perims.push(bh.loops[0].map((id) => id + off));
    for (const [, dir] of bh.complementDir) complementDir.set(edgeKey(dir[0] + off, dir[1] + off), [dir[0] + off, dir[1] + off]);
  }

  // Outer frame.
  const frameBase = mergedUT.length;
  const frameUT = buildFrameLoop(0.04);
  const frameIds = frameUT.map((_, i) => frameBase + i);
  const frameSet = new Set(frameIds);
  for (const p of frameUT) mergedUT.push(p);

  // Folding spines become free-interior feature constraints (crest followed, no band).
  const featureChains: FeatureChainInput[] = features.map((e) => ({
    polyline: e.polyline.map((p) => ({ u: p.u, t: p.t })),
    start: { kind: 'free-interior' as const },
    end: { kind: 'free-interior' as const },
  }));

  const boundary: HoleBoundary = { loops: [frameIds, ...perims], complementDir, vertexCount: mergedUT.length };
  const fill = corridorPaveMulti({ boundary, vertexUT: mergedUT, features: featureChains, sampler });

  // Merge band tris (offset) + fill tris over the fill vertex table.
  const allUT = fill.vertexUT;
  const positions = new Float32Array(allUT.length * 3);
  for (let i = 0; i < allUT.length; i++) { const p = sampler.position(allUT[i][0], allUT[i][1]); positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2]; }
  const indices = new Uint32Array(bandTris.length + fill.triangles.length * 3);
  indices.set(bandTris, 0);
  let w = bandTris.length;
  for (const tri of fill.triangles) { indices[w++] = tri[0]; indices[w++] = tri[1]; indices[w++] = tri[2]; }
  return { bands, perims, features, fill, merged: { positions, indices }, frameSet, bandTriCount: bandTris.length / 3, sampler };
}

let cached: SelectiveBuild | undefined;
function getBuild(): SelectiveBuild { if (!cached) cached = buildSelective(); return cached; }

// ── THE GATE ────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.PF_DERISK)('SELECTIVE PAVING — clean bands + folding-spine constraints weld in one fill', () => {
  beforeAll(() => { getBuild(); }, 180000);

  it('selects >=1 clean band AND >=1 folding-spine feature (genuinely mixed)', () => {
    const { bands, features } = getBuild();
    // eslint-disable-next-line no-console
    console.log(`[SELECTIVE] bands=${bands.length} foldingFeatures=${features.length}`);
    expect(bands.length).toBeGreaterThanOrEqual(1);
    expect(features.length).toBeGreaterThanOrEqual(1);
  });

  it('corridorPaveMulti fill: inversionCount == 0, unfillablePinches == []', () => {
    const { fill } = getBuild();
    expect(fill.triangles.length).toBeGreaterThan(0);
    expect(fill.inversionCount).toBe(0);
    expect(fill.unfillablePinches).toEqual([]);
  });

  it('GATE: merged mesh nonManifoldEdges == 0 and tJunctions == 0 (bands + features weld)', () => {
    const { merged, frameSet } = getBuild();
    const audit = auditWatertight(merged, { boundaryVertexIndices: frameSet });
    // eslint-disable-next-line no-console
    console.log('[SELECTIVE] audit', JSON.stringify(audit));
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(audit.boundaryEdges).toBeGreaterThan(0);
  });

  it('every clean-band perimeter edge incidence == 2', () => {
    const { merged, perims } = getBuild();
    const inc = incidence(merged.indices);
    let cracked = 0, total = 0;
    for (const loop of perims) for (let i = 0; i < loop.length; i++) { total++; if (inc.get(edgeKey(loop[i], loop[(i + 1) % loop.length])) !== 2) cracked++; }
    expect(total).toBeGreaterThan(0);
    expect(cracked).toBe(0);
  });

  it('every folding-spine feature-chain edge incidence == 2 (crest FOLLOWED, no serration)', () => {
    const { merged, fill } = getBuild();
    const inc = incidence(merged.indices);
    let cracked = 0, total = 0;
    for (const chain of fill.featureChains) {
      for (let i = 0; i + 1 < chain.length; i++) { total++; if (inc.get(edgeKey(chain[i], chain[i + 1])) !== 2) cracked++; }
    }
    expect(total).toBeGreaterThan(0);
    expect(cracked).toBe(0);
  });

  it('NEGATIVE CONTROL: splitting one band-perimeter vertex band-side → tJunctions > 0', () => {
    const { merged, perims, frameSet, bandTriCount } = getBuild();
    const splitId = perims[0][Math.floor(perims[0].length / 2)];
    expect(frameSet.has(splitId)).toBe(false);
    const newId = merged.positions.length / 3;
    const positions = new Float32Array(merged.positions.length + 3);
    positions.set(merged.positions);
    positions[merged.positions.length] = merged.positions[splitId * 3];
    positions[merged.positions.length + 1] = merged.positions[splitId * 3 + 1];
    positions[merged.positions.length + 2] = merged.positions[splitId * 3 + 2];
    const indices = new Uint32Array(merged.indices);
    const bandSpan = bandTriCount * 3;
    for (let k = 0; k < bandSpan; k++) if (indices[k] === splitId) indices[k] = newId;
    const crackedAudit = auditWatertight({ positions, indices }, { boundaryVertexIndices: frameSet });
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
  });
});
