/**
 * assembleWatertightWithFeatures — the production-frame feature-aligned mesher.
 *
 * Mirrors the PROVEN de-risk realFeatureCorridorMulti pipeline but grafts ONLY the
 * corridor FILL onto the FULL production assembly (which already holds the outer wall
 * with holes). The band emit-gate fires only on the wall feature path, so a minimal
 * off-corridor activation strand is injected as outerFeatureLines (mirroring
 * defaultAssemblyFeature) and REPLACES any analytic outerFeatureLines when on. The
 * outer wall is interned via railVertexKey (u-seam dedup) and the fill's boundary ids
 * are mapped back to asm ids; interior ids append as (u,t,0) and ride the caller's warps
 * + the GPU evaluate_vertices dispatch. Pure CPU.
 * @module fidelity/bandRemesh/assembleWithFeatures
 */
import {
  assembleWatertight,
  type WatertightAssemblyResult,
  type AssemblyDimensions,
  type AssemblyWallOptions,
  type BandRegion,
  type SurfaceRange,
} from '../../renderers/webgpu/parametric/conforming/WatertightAssembly';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureLine } from '../../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  detectFeatures,
  type DetectFeaturesOptions,
} from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { makeReliefIndicator } from '../../renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import type { FeatureGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';
import { extractHoleBoundary } from './seamFill';
import { corridorPaveMulti, type FeatureChainInput, type UTPoint } from './corridorPave';
import { internOuterWall, type MultiFeatureSpec } from './realCorridor';

export type AssembleWithFeaturesOptions = AssemblyWallOptions & {
  detectOptions: DetectFeaturesOptions;
  corridorWidthMm?: number;
  featureLevel: number;
};

// --- periodic-u polyline distance (mm-scaled), mirrors realCorridor ---
function uDistPeriodic(a: number, b: number): number { let d = Math.abs(a - b) % 1; if (d > 0.5) d = 1 - d; return d; }
function unwrapU(x: number, ref: number): number { let d = (x - ref) % 1; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return ref + d; }
function distToPolylinePeriodic(u: number, t: number, poly: UTPoint[], uS: number, tS: number): number {
  if (poly.length === 1) return Math.hypot(uDistPeriodic(u, poly[0].u) * uS, (t - poly[0].t) * tS);
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const au = poly[i].u, at = poly[i].t, bu = unwrapU(poly[i + 1].u, au), bt = poly[i + 1].t, qu = unwrapU(u, au);
    const du = (bu - au) * uS, dt = (bt - at) * tS, len2 = du * du + dt * dt;
    let f = 0; if (len2 > 1e-24) f = Math.max(0, Math.min(1, ((qu - au) * uS * du + (t - at) * tS * dt) / len2));
    const cu = au + (bu - au) * f, ct = at + (bt - at) * f;
    const d = Math.hypot((qu - cu) * uS, (t - ct) * tS); if (d < best) best = d;
  }
  return best;
}
function bandForFeatures(features: MultiFeatureSpec[], sampler: SurfaceSampler, dims: AssemblyDimensions, widthMm: number): BandRegion {
  const ref = features[0].polyline, mid = ref[Math.floor(ref.length / 2)];
  const midPos = sampler.position(((mid.u % 1) + 1) % 1, mid.t);
  const uToMm = 2 * Math.PI * Math.hypot(midPos[0], midPos[1]), tToMm = dims.H;
  return { insideBand(u, t) {
    const uu = ((u % 1) + 1) % 1;
    for (const f of features) if (distToPolylinePeriodic(uu, t, f.polyline, uToMm, tToMm) < widthMm) return true;
    return false;
  } };
}
/** Minimal off-corridor activation strand — mirrors realCorridor defaultAssemblyFeature. */
function activationStrand(): FeatureLine[] {
  const points: Array<{ u: number; t: number }> = [];
  for (let k = 0; k <= 16; k++) points.push({ u: 0.05, t: 0.1 + (0.8 * k) / 16 });
  return [{ kind: 'general-curve', points, label: 'corridor-activation-strand' }];
}

/**
 * Select a CONNECTED, bounded, deep-interior corridor region from the detector graph.
 *
 * REALITY ADAPTATION (Phase 1): a dense lattice (Voronoi ≈ 2378 features spanning
 * t∈[0,1]) blankets the WHOLE surface if every feature gets a `corridorWidthMm` band
 * tube — the union covers ~96% of (u,t) INCLUDING the t=0/t=1 rings, so the outer-wall
 * emit-gate skips the ring cells and `assembleWatertight` throws "wall ring mismatch
 * (outer 0, inner nRing)". The PROVEN de-risk path never paves the full graph — it paves
 * a CONNECTED, bounded, deep-interior, off-seam sub-graph with degree-WITHIN-the-selected-
 * subgraph anchoring (a selected-degree-≥2 node is a SHARED junction; a selected-degree-1
 * node is a `free-interior` stub — snapping such a deep-interior leaf to the wall mints a
 * spurious long constraint and cracks the weld). This is the faithful port of
 * `pickDenseVoronoiRegion` (verify_real_feature_mesher Task 3, GO).
 *
 * Drops ring/seam-incident features (a Phase-2 carry-forward; see the plan's
 * "Seam/rim-incident corridors" residual) — it does NOT weaken the watertight gate.
 *
 * @param targetEdges  Max connected web edges to grow into the corridor. Default 4:
 *   MEASURED ceiling at the Phase-1 dims (H=100) where the corridor footprint still
 *   welds 0/0 watertight by index (te∈{1..4} → tJ=0, unfilled=0; te≥6 → the footprint
 *   self-touches into genuine `unfillablePinches`, a corridorPaveMulti footprint limit,
 *   NOT a graft defect — verified the de-risk realFeatureCorridorMulti produces the same
 *   pinch count on the same region). Widening the corridor is a Phase-2/3 paver concern.
 */
function selectCorridorFeatures(graph: FeatureGraph, targetEdges = 4): MultiFeatureSpec[] {
  const nNodes = graph.nodes.length;
  const deg = new Array<number>(nNodes).fill(0);
  const incident: number[][] = graph.nodes.map(() => []);
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    deg[e.endpoints[0]]++; incident[e.endpoints[0]].push(i);
    if (e.endpoints[1] !== e.endpoints[0]) { deg[e.endpoints[1]]++; incident[e.endpoints[1]].push(i); }
  }
  const edgeSeam = (i: number): boolean => {
    const pts = graph.edges[i].polyline;
    for (let k = 1; k < pts.length; k++) if (Math.abs(pts[k].u - pts[k - 1].u) > 0.5) return true;
    return false;
  };
  const edgeBox = (i: number): { uMin: number; uMax: number; tMin: number; tMax: number } => {
    const pts = graph.edges[i].polyline;
    let uMin = 1, uMax = 0, tMin = 1, tMax = 0;
    for (const p of pts) { if (p.u < uMin) uMin = p.u; if (p.u > uMax) uMax = p.u; if (p.t < tMin) tMin = p.t; if (p.t > tMax) tMax = p.t; }
    return { uMin, uMax, tMin, tMax };
  };
  // Usable = open, off-seam, comfortably interior to the rings + off the u-seam band.
  const usable = (i: number): boolean => {
    if (graph.edges[i].kind !== 'open') return false;
    if (edgeSeam(i)) return false;
    const b = edgeBox(i);
    return b.uMin > 0.2 && b.uMax < 0.8 && b.tMin > 0.12 && b.tMax < 0.88;
  };
  // Seed: a deep-interior degree-≥3 junction with at least one usable incident edge.
  let seedNode = -1;
  for (let n = 0; n < nNodes; n++) {
    const nd = graph.nodes[n];
    if (deg[n] >= 3 && nd.u > 0.35 && nd.u < 0.65 && nd.t > 0.35 && nd.t < 0.65 && incident[n].some(usable)) {
      seedNode = n; break;
    }
  }
  if (seedNode < 0) return [];
  // BFS-grow the connected component of usable edges up to targetEdges.
  const region = new Set<number>();
  const frontier = [seedNode];
  const seen = new Set<number>([seedNode]);
  while (frontier.length > 0 && region.size < targetEdges) {
    const n = frontier.shift() as number;
    for (const ei of incident[n]) {
      if (region.size >= targetEdges) break;
      if (!usable(ei) || region.has(ei)) continue;
      region.add(ei);
      for (const ep of graph.edges[ei].endpoints) if (!seen.has(ep)) { seen.add(ep); frontier.push(ep); }
    }
  }
  const regionEdges = [...region];
  if (regionEdges.length === 0) return [];
  // selDeg[n] = how many SELECTED edges touch node n (junction vs free-interior stub).
  const selDeg = new Map<number, number>();
  for (const ei of regionEdges) for (const ep of graph.edges[ei].endpoints) selDeg.set(ep, (selDeg.get(ep) ?? 0) + 1);
  const anchorFor = (nodeId: number): MultiFeatureSpec['start'] =>
    (selDeg.get(nodeId) ?? 0) >= 2 ? { kind: 'junction', junctionKey: `vj-${nodeId}` } : { kind: 'free-interior' };
  let uMin = 1, uMax = 0, tMin = 1, tMax = 0;
  const features: MultiFeatureSpec[] = [];
  for (const ei of regionEdges) {
    const e = graph.edges[ei];
    const b = edgeBox(ei);
    if (b.uMin < uMin) uMin = b.uMin; if (b.uMax > uMax) uMax = b.uMax;
    if (b.tMin < tMin) tMin = b.tMin; if (b.tMax > tMax) tMax = b.tMax;
    features.push({
      polyline: e.polyline.map((p) => ({ u: p.u, t: p.t })),
      closed: false,
      start: anchorFor(e.endpoints[0]),
      end: anchorFor(e.endpoints[1]),
    });
  }
  // Add any closed cell loop fully inside the region bbox + off-seam (paved closed).
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    if (e.kind !== 'loop' || edgeSeam(i)) continue;
    const b = edgeBox(i);
    if (b.uMin >= uMin && b.uMax <= uMax && b.tMin >= tMin && b.tMax <= tMax) {
      features.push({ polyline: e.polyline.map((p) => ({ u: p.u, t: p.t })), closed: true });
    }
  }
  return features;
}

export interface FeatureGraftDebug {
  asm: WatertightAssemblyResult;
  featureChainAsmIds: number[][];
  complementIndexEnd: number; // asm.indices.length before the fill was appended
}

export function mergeCorridorIntoAssembly(
  asm: WatertightAssemblyResult, features: MultiFeatureSpec[], sampler: SurfaceSampler,
): WatertightAssemblyResult {
  return mergeCorridorIntoAssemblyDebug(asm, features, sampler).asm;
}

export function mergeCorridorIntoAssemblyDebug(
  asm: WatertightAssemblyResult, features: MultiFeatureSpec[], sampler: SurfaceSampler,
): FeatureGraftDebug {
  // 1. Intern the outer wall (railVertexKey) — collapses u-seam duplicates (proven step).
  const { outerWall, vertexUT, ringVertexIds, compToMerged, outerVertCount } = internOuterWall(asm);
  // 2. Inverse: merged-id → first asm outer-wall vertex id.
  const mergedToAsm = new Int32Array(vertexUT.length).fill(-1);
  for (let i = 0; i < outerVertCount; i++) {
    const m = compToMerged[i];
    if (m >= 0 && mergedToAsm[m] < 0) mergedToAsm[m] = i;
  }
  // 3. Extract the dyadic hole boundary and pave it (merged-id space).
  const hole = extractHoleBoundary(outerWall, ringVertexIds);
  const chains: FeatureChainInput[] = features.map((f) => ({ polyline: f.polyline, closed: f.closed, start: f.start, end: f.end }));
  const paved = corridorPaveMulti({ boundary: hole, vertexUT, features: chains, sampler });
  const existing = vertexUT.length; // corridorPaveMulti's existingCount: ids < this are seam-shared
  // 4. Graft the FILL onto asm. boundary merged-id → asm id (mergedToAsm); interior → new asm vertex.
  const totalVerts = asm.vertices.length / 3;
  const newInterior = paved.vertexUT.length - existing;
  const vertices = new Float32Array(asm.vertices.length + newInterior * 3);
  vertices.set(asm.vertices);
  for (let j = existing; j < paved.vertexUT.length; j++) {
    const o = asm.vertices.length + (j - existing) * 3;
    vertices[o] = paved.vertexUT[j][0]; vertices[o + 1] = paved.vertexUT[j][1]; vertices[o + 2] = 0; // surfaceId 0
  }
  const remap = (id: number): number => {
    if (id < existing) {
      const a = mergedToAsm[id];
      if (a < 0) throw new Error('mergeCorridorIntoAssembly: fill boundary id has no asm origin');
      return a;
    }
    return totalVerts + (id - existing);
  };
  const complementIndexEnd = asm.indices.length;
  const fillIdx: number[] = [];
  for (const [a, b, c] of paved.triangles) fillIdx.push(remap(a), remap(b), remap(c));
  const indices = new Uint32Array(asm.indices.length + fillIdx.length);
  indices.set(asm.indices); indices.set(fillIdx, asm.indices.length);

  const ranges: SurfaceRange[] = asm.surfaceRanges.slice();
  ranges.push({ surfaceId: 0, indexStart: complementIndexEnd, indexEnd: indices.length, vertexCount: newInterior });

  let triangleSource = asm.triangleSource;
  if (asm.triangleSource !== undefined) {
    const ext = new Uint8Array(indices.length / 3); ext.set(asm.triangleSource); triangleSource = ext;
  }
  const featureChainAsmIds = paved.featureChains.map((ch) => ch.map(remap));
  return { asm: { ...asm, vertices, indices, surfaceRanges: ranges, triangleSource }, featureChainAsmIds, complementIndexEnd };
}

export function assembleWatertightWithFeatures(
  outerSampler: SurfaceSampler, innerSampler: SurfaceSampler, dims: AssemblyDimensions, opts: AssembleWithFeaturesOptions,
): WatertightAssemblyResult {
  const { detectOptions, corridorWidthMm, featureLevel, ...wallOpts } = opts;
  const graph = detectFeatures(outerSampler, detectOptions);
  // Restrict the full detector graph to a CONNECTED bounded interior corridor region (a
  // dense lattice's all-features band blankets the rings → no wall; see selectCorridorFeatures).
  const features = selectCorridorFeatures(graph);
  if (features.length === 0) {
    return assembleWatertight(outerSampler, innerSampler, dims, wallOpts); // smooth → byte-identical
  }
  const band = bandForFeatures(features, outerSampler, dims, corridorWidthMm ?? 3);
  // Activation strand REPLACES any analytic outerFeatureLines so the legacy CDT insertion
  // does not run in the feature region (the corridor owns it) — and fires the band emit-gate.
  const asm = assembleWatertight(outerSampler, innerSampler, dims, {
    ...wallOpts, featureLevel, outerFeatureLines: activationStrand(), bandRegions: [band],
  });
  try {
    return mergeCorridorIntoAssembly(asm, features, outerSampler);
  } catch (err) {
    // The paver failed (e.g. the measured cdt2d 'upperIds' crash on a dense crossing
    // PSLG). `asm` was built WITH `bandRegions`, so its excluded feature cells are HOLES
    // that are now UNFILLED — returning it would be non-watertight (boundary / T-junctions).
    // Re-assemble WITHOUT `bandRegions`: the dyadic complement meshes those cells (the
    // feature staircases there, but the mesh is watertight) → byte-identical to the
    // no-feature path. The export is degraded-but-never-broken; the flag-OFF guarantee holds.
    // eslint-disable-next-line no-console
    console.warn('[featureMesher] corridor graft failed; falling back to dyadic assembly:', (err as Error).message);
    return assembleWatertight(outerSampler, innerSampler, dims, wallOpts);
  }
}

/** Test-only: expose the graft internals for the feature-followed + control assertions. */
export function assembleWatertightWithFeaturesDebug(outerSampler: SurfaceSampler): FeatureGraftDebug {
  const DIMS = { H: 100, tBottom: 6, rDrain: 0 };
  const innerSampler: SurfaceSampler = { position(u, t) {
    const theta = u * 2 * Math.PI; const r = 36; const z = DIMS.tBottom + t * (DIMS.H - DIMS.tBottom);
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  } };
  const graph = detectFeatures(outerSampler, {
    coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
    creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
    reliefIndicator: makeReliefIndicator(outerSampler),
  });
  const features = selectCorridorFeatures(graph);
  const base = { maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12, resU: 128, resT: 128, nRing: 1024, targetTriangles: 6_000_000, budgetMode: 'cap' as const };
  const band = bandForFeatures(features, outerSampler, DIMS, 3);
  const asm = assembleWatertight(outerSampler, innerSampler, DIMS, { ...base, featureLevel: 7, outerFeatureLines: activationStrand(), bandRegions: [band] });
  return mergeCorridorIntoAssemblyDebug(asm, features, outerSampler);
}
