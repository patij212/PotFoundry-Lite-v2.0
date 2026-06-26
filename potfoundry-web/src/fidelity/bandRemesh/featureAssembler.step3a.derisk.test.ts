/**
 * featureAssembler.step3a.derisk.test.ts — STEP 3a (throwaway de-risk): MULTI-BAND
 * whole-wall fill on a REAL conditioned graph (no junction composition yet).
 *
 * STEP 0 proved ONE ridge band welds to a cdt2d featureless complement. STEP 3a
 * proves N SEPARATED ridge bands — driven from a REAL `conditionGraph` (the actual
 * detector → conditioner pipeline, calibrated config) on a real style — all weld to
 * one multiply-connected `corridorPaveMulti({features:[]})` interior fill. This is
 * the natural extension of STEP 0 from one hole to many, and the first time the
 * assembler is driven by real feature geometry.
 *
 * Scope (per the agreed incremental plan): NON-junction. Edges are selected to be
 * pairwise non-adjacent (no shared node) + spatially separated (band footprints
 * disjoint) + interior in (u,t) (away from the u-seam and t-rings), so each band is
 * an independent hole and NO ridge↔fan composition is needed. The unrolled
 * rectangle [0,1]² is the outer boundary; the periodic u-seam + caps are deferred to
 * STEP 4's production WatertightAssembly merge (consistent with STEP 0–2).
 *
 * The gate (= STEP-0 gate, generalized to N holes):
 *  - ≥2 bands paved from the real graph (genuinely multi-band);
 *  - each band perimeter is a single simple degree-2 loop;
 *  - corridorPaveMulti: inversionCount==0, unfillablePinches==[];
 *  - merged mesh nonManifoldEdges==0, tJunctions==0 (frame = open boundary);
 *  - EVERY band's perimeter edges incidence==2 (all N bands weld);
 *  - NEGATIVE CONTROL: split one band-perimeter vertex band-side → tJunctions>0.
 *
 * CPU throwaway spike (real detector pipeline → heavy). Reuses only proven
 * primitives; touches no production code.
 * Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/featureAssembler.step3a.derisk.test
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
import { paveRidge } from './featureStrip';
import type { RidgeResult } from './featureStrip';
import { corridorPaveMulti } from './corridorPave';
import type { CorridorPaveMultiResult } from './corridorPave';
import { extractHoleBoundary } from './seamFill';
import type { HoleBoundary } from './seamFill';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { QSCALE } from './railKey';
import type { StationPoint } from './stations';

// ── Real-pipeline config (verbatim from conditionGraph.skeleton.test.ts) ────────

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;
const STYLE = 'Voronoi';

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  uToMm: U_TO_MM, tToMm: T_TO_MM, creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};
const RELIEF_MEAN_SAMPLES = 256, RELIEF_ALPHA = 0.5, RELIEF_ABS_FLOOR_MM = 1e-3;
function samplerRadius(s: SurfaceSampler, u: number, t: number): number {
  const [x, y] = s.position(u, t);
  return Math.hypot(x, y);
}
function makeReliefIndicator(s: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t);
    if (cached !== undefined) return cached;
    let sum = 0;
    const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const r = samplerRadius(s, i / RELIEF_MEAN_SAMPLES, t); rs[i] = r; sum += r; }
    const mean = sum / RELIEF_MEAN_SAMPLES;
    let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const d = rs[i] - mean; sq += d * d; }
    const stats = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * Math.sqrt(sq / RELIEF_MEAN_SAMPLES)) };
    rowStats.set(t, stats);
    return stats;
  };
  return (u, t) => { const { mean, floor } = statsAtT(t); return Math.abs(samplerRadius(s, u, t) - mean) - floor; };
}
function condOpts(): ConditionGraphOptions {
  return {
    uToMm: U_TO_MM, tToMm: T_TO_MM,
    minFeatureMm: 2.5, simplifyTolMm: 0.5, junctionMergeMm: 2.5,
    prune: false, simplify: true, mergeJunctions: true,
  };
}

// ── Band/selection parameters ───────────────────────────────────────────────────

const WIDTH_MM = 2.5;
const EDGE_MM = 2.0;
const MAX_EDGES = 4; // conservative selection (handoff: targetEdges<=4)
const MIN_LEN_MM = 10; // long enough for a multi-row band
const MIN_SEP_MM = 2 * WIDTH_MM + EDGE_MM + 2; // band footprints + margin disjoint
const U_LO = 0.1, U_HI = 0.9, T_LO = 0.1, T_HI = 0.9; // interior (no u-seam / t-ring)

// ── Helpers ──────────────────────────────────────────────────────────────────────

function edgeKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}
function dyadicSnap(x: number): number {
  return Math.round(x * QSCALE) / QSCALE;
}
function polyLenMm(poly: ReadonlyArray<{ u: number; t: number }>): number {
  let s = 0;
  for (let i = 1; i < poly.length; i++) {
    s += Math.hypot((poly[i].u - poly[i - 1].u) * U_TO_MM, (poly[i].t - poly[i - 1].t) * T_TO_MM);
  }
  return s;
}
/** Min distance (mm) between two (u,t) polylines (sampled by vertices — adequate for separation). */
function minPolyDistMm(a: ReadonlyArray<{ u: number; t: number }>, b: ReadonlyArray<{ u: number; t: number }>): number {
  let best = Infinity;
  for (const p of a) for (const q of b) {
    const d = Math.hypot((p.u - q.u) * U_TO_MM, (p.t - q.t) * T_TO_MM);
    if (d < best) best = d;
  }
  return best;
}
function interior(poly: ReadonlyArray<{ u: number; t: number }>): boolean {
  for (const p of poly) {
    if (p.u < U_LO || p.u > U_HI || p.t < T_LO || p.t > T_HI) return false;
  }
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
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      m.set(edgeKey(i, j), (m.get(edgeKey(i, j)) ?? 0) + 1);
    }
  }
  return m;
}

/** Select up to MAX_EDGES pairwise-non-adjacent, spatially-separated, interior open edges. */
function selectSeparatedEdges(cond: ConditionedGraph): FeatureEdge[] {
  const cand = cond.edges
    .filter((e) => e.kind !== 'loop' && interior(e.polyline) && polyLenMm(e.polyline) >= MIN_LEN_MM)
    .sort((a, b) => polyLenMm(b.polyline) - polyLenMm(a.polyline));
  const selected: FeatureEdge[] = [];
  const usedNodes = new Set<number>();
  for (const e of cand) {
    if (selected.length >= MAX_EDGES) break;
    if (usedNodes.has(e.endpoints[0]) || usedNodes.has(e.endpoints[1])) continue;
    if (selected.some((s) => minPolyDistMm(e.polyline, s.polyline) < MIN_SEP_MM)) continue;
    selected.push(e);
    usedNodes.add(e.endpoints[0]);
    usedNodes.add(e.endpoints[1]);
  }
  return selected;
}

interface Step3aBuild {
  nBandsRequested: number;
  bands: RidgeResult[];
  perims: number[][]; // each band's perimeter loop in MERGED ids
  bandPerimUT: Array<Array<[number, number]>>; // each band's perimeter (u,t), band-local order
  fill: CorridorPaveMultiResult;
  merged: Mesh3;
  frameSet: Set<number>;
  bandTriCount: number;
  selectedSpines: StationPoint[][];
  sampler: SurfaceSampler;
}

/** Laplacian smooth a (u,t) spine (interior points only; endpoints fixed). */
function smoothSpine(spine: StationPoint[], iters: number): StationPoint[] {
  let pts = spine.map((p) => ({ u: p.u, t: p.t }));
  for (let it = 0; it < iters; it++) {
    const next = pts.map((p) => ({ u: p.u, t: p.t }));
    for (let i = 1; i < pts.length - 1; i++) {
      next[i] = {
        u: 0.5 * pts[i].u + 0.25 * (pts[i - 1].u + pts[i + 1].u),
        t: 0.5 * pts[i].t + 0.25 * (pts[i - 1].t + pts[i + 1].t),
      };
    }
    pts = next;
  }
  return pts;
}

/** Proper (strict-interior) segment crossing test in (u,t). */
function properCross(
  p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number],
): boolean {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return false;
  const qpx = p3[0] - p1[0], qpy = p3[1] - p1[1];
  const tS = (qpx * sy - qpy * sx) / denom;
  const tU = (qpx * ry - qpy * rx) / denom;
  const E = 1e-12;
  return tS > E && tS < 1 - E && tU > E && tU < 1 - E;
}

/** Count proper self-crossings of a closed (u,t) loop (non-adjacent segment pairs). */
function loopSelfCrossings(loop: Array<[number, number]>): number {
  const n = loop.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = loop[i], b = loop[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue; // adjacent
      const c = loop[j], d = loop[(j + 1) % n];
      if (properCross(a, b, c, d)) count++;
    }
  }
  return count;
}

function buildStep3a(): Step3aBuild {
  const sampler = styleSampler(STYLE as Parameters<typeof styleSampler>[0], {}, DIMS);
  const raw = detectFeatures(sampler, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) });
  const cond = conditionGraph(raw, condOpts());
  const selected = selectSeparatedEdges(cond);
  const selectedSpines: StationPoint[][] = selected.map((e) => e.polyline.map((p) => ({ u: p.u, t: p.t })));

  // Pave each selected edge; keep only bands with a clean degree-2 perimeter.
  const mergedUT: Array<[number, number]> = [];
  const bands: RidgeResult[] = [];
  const perims: number[][] = [];
  const bandPerimUT: Array<Array<[number, number]>> = [];
  const complementDir = new Map<string, [number, number]>();
  const bandTris: number[] = [];

  // Adaptive band construction: smooth the spine, then shrink the width until the
  // (u,t) perimeter is GEOMETRICALLY SIMPLE (selfCrossings==0). The diagnostic above
  // proved real Voronoi spines self-fold at fixed width; a simple footprint is the
  // precondition corridorPaveMulti's pointInLoop band-hole exclusion requires. This
  // isolates the WELD (3a's claim) from band-construction robustness (a separate,
  // documented STEP-3 prerequisite — a proper curvature-aware-width module).
  const WIDTHS = [2.5, 1.5, 1.0, 0.6, 0.4];
  const SMOOTH_ITERS = 6;
  for (const e of selected) {
    const spine: StationPoint[] = smoothSpine(e.polyline.map((p) => ({ u: p.u, t: p.t })), SMOOTH_ITERS);
    let band: RidgeResult | null = null;
    let bh: HoleBoundary | null = null;
    for (const w of WIDTHS) {
      try {
        const b = paveRidge(spine, sampler, { widthMm: w, edgeMm: EDGE_MM });
        const h = extractHoleBoundary({ indices: b.mesh.indices }, new Set<number>());
        if (h.loops.length !== 1) continue;
        const perimUT = h.loops[0].map((id) => b.vertexUT[id] as [number, number]);
        if (loopSelfCrossings(perimUT) === 0) { band = b; bh = h; break; }
      } catch {
        /* try a smaller width */
      }
    }
    if (band === null || bh === null) continue; // no simple-footprint width found — skip this edge
    const off = mergedUT.length;
    for (const p of band.vertexUT) mergedUT.push([p[0], p[1]]);
    for (let k = 0; k < band.mesh.indices.length; k++) bandTris.push(band.mesh.indices[k] + off);
    perims.push(bh.loops[0].map((id) => id + off));
    bandPerimUT.push(bh.loops[0].map((id) => band.vertexUT[id] as [number, number]));
    for (const [, dir] of bh.complementDir) {
      const a = dir[0] + off, b = dir[1] + off;
      complementDir.set(edgeKey(a, b), [a, b]);
    }
    bands.push(band);
  }

  // Outer frame (unrolled rectangle). Subdivide ~ the band perimeter spacing.
  const frameBase = mergedUT.length;
  const frameUT = buildFrameLoop(0.04);
  const frameIds = frameUT.map((_, i) => frameBase + i);
  const frameSet = new Set(frameIds);
  for (const p of frameUT) mergedUT.push(p);

  const boundary: HoleBoundary = {
    loops: [frameIds, ...perims],
    complementDir,
    vertexCount: mergedUT.length,
  };
  const fill = corridorPaveMulti({ boundary, vertexUT: mergedUT, features: [], sampler });

  // Merge band tris (offset) + fill tris over the fill's vertex table.
  const allUT = fill.vertexUT;
  const positions = new Float32Array(allUT.length * 3);
  for (let i = 0; i < allUT.length; i++) {
    const p = sampler.position(allUT[i][0], allUT[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const indices = new Uint32Array(bandTris.length + fill.triangles.length * 3);
  indices.set(bandTris, 0);
  let w = bandTris.length;
  for (const tri of fill.triangles) {
    indices[w++] = tri[0];
    indices[w++] = tri[1];
    indices[w++] = tri[2];
  }
  return { nBandsRequested: selected.length, bands, perims, bandPerimUT, fill, merged: { positions, indices }, frameSet, bandTriCount: bandTris.length / 3, selectedSpines, sampler };
}

let cached: Step3aBuild | undefined;
function getBuild(): Step3aBuild {
  if (!cached) cached = buildStep3a();
  return cached;
}

// ── THE GATE ──────────────────────────────────────────────────────────────────

// Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
describe.skipIf(!process.env.PF_DERISK)('STEP 3a — multi-band whole-wall fill on a real conditioned graph', () => {
  // The heavy real-pipeline build (detectFeatures ~13s) runs once here, not inside a test.
  beforeAll(() => { getBuild(); }, 120000);

  it('selects + paves >=2 separated ridge bands from the real conditioned graph', () => {
    const { bands, nBandsRequested } = getBuild();
    // eslint-disable-next-line no-console
    console.log(`[STEP3a] style=${STYLE} requested=${nBandsRequested} paved=${bands.length}`);
    expect(bands.length).toBeGreaterThanOrEqual(2);
  });

  it('DIAGNOSTIC: per-band perimeter simplicity + each band is independently watertight', () => {
    const { bands, bandPerimUT } = getBuild();
    /* eslint-disable no-console */
    let nonSimple = 0;
    for (let i = 0; i < bands.length; i++) {
      const sx = loopSelfCrossings(bandPerimUT[i]);
      const selfAudit = auditWatertight(bands[i].mesh, { boundaryVertexIndices: bands[i].openBoundaryVertices });
      if (sx > 0) nonSimple++;
      console.log(
        `[STEP3a-DIAG] band${i}: perimVerts=${bandPerimUT[i].length} selfCrossings=${sx} ` +
          `selfAudit{nonMan:${selfAudit.nonManifoldEdges},tJ:${selfAudit.tJunctions},bnd:${selfAudit.boundaryEdges}}`,
      );
    }
    console.log(`[STEP3a-DIAG] bands with non-simple (u,t) perimeter: ${nonSimple}/${bands.length}`);
    /* eslint-enable no-console */
    expect(bands.length).toBeGreaterThanOrEqual(2);
  });

  it('HYPOTHESIS: spine-smoothing / smaller width reduces (u,t) perimeter self-crossings', () => {
    const { selectedSpines, sampler } = getBuild();
    /* eslint-disable no-console */
    const trials: Array<{ label: string; iters: number; width: number }> = [
      { label: 'raw w2.5', iters: 0, width: 2.5 },
      { label: 'smooth4 w2.5', iters: 4, width: 2.5 },
      { label: 'smooth8 w2.5', iters: 8, width: 2.5 },
      { label: 'raw w1.0', iters: 0, width: 1.0 },
      { label: 'smooth8 w1.0', iters: 8, width: 1.0 },
    ];
    for (const tr of trials) {
      let totalCross = 0;
      let ok = 0;
      for (const spine of selectedSpines) {
        const s = tr.iters > 0 ? smoothSpine(spine, tr.iters) : spine;
        try {
          const band = paveRidge(s, sampler, { widthMm: tr.width, edgeMm: EDGE_MM });
          const bh = extractHoleBoundary({ indices: band.mesh.indices }, new Set<number>());
          if (bh.loops.length === 1) {
            const sx = loopSelfCrossings(bh.loops[0].map((id) => band.vertexUT[id] as [number, number]));
            totalCross += sx;
            if (sx === 0) ok++;
          }
        } catch {
          /* skip */
        }
      }
      console.log(`[STEP3a-HYP] ${tr.label}: simpleBands=${ok}/${selectedSpines.length} totalSelfCrossings=${totalCross}`);
    }
    /* eslint-enable no-console */
    expect(selectedSpines.length).toBeGreaterThanOrEqual(2);
  });

  it('corridorPaveMulti fills the multi-hole interior with inversionCount==0, unfillablePinches==[]', () => {
    const { fill } = getBuild();
    expect(fill.triangles.length).toBeGreaterThan(0);
    expect(fill.inversionCount).toBe(0);
    expect(fill.unfillablePinches).toEqual([]);
  });

  it('GATE: merged mesh nonManifoldEdges==0 and tJunctions==0 (all N bands weld; frame = open boundary)', () => {
    const { merged, frameSet } = getBuild();
    const audit = auditWatertight(merged, { boundaryVertexIndices: frameSet });
    // eslint-disable-next-line no-console
    console.log('[STEP3a] audit', JSON.stringify(audit));
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(audit.boundaryEdges).toBeGreaterThan(0);
  });

  it('every band-perimeter edge incidence==2 across ALL bands (multi-band weld)', () => {
    const { merged, perims } = getBuild();
    const inc = incidence(merged.indices);
    let cracked = 0;
    let total = 0;
    for (const loop of perims) {
      for (let i = 0; i < loop.length; i++) {
        total++;
        if (inc.get(edgeKey(loop[i], loop[(i + 1) % loop.length])) !== 2) cracked++;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(cracked).toBe(0);
  });

  it('reports merged triangle quality (informational)', () => {
    const { merged, bandTriCount, fill } = getBuild();
    const q = triangleQuality3D(merged);
    // eslint-disable-next-line no-console
    console.log(
      `[STEP3a] tris band=${bandTriCount} fill=${fill.triangles.length} ` +
        `aspectMax=${q.aspectMax.toFixed(2)} pct<10=${q.pctMinAngleBelow10.toFixed(1)}% p50=${q.minAngleP50.toFixed(1)}°`,
    );
    expect(merged.indices.length % 3).toBe(0);
  });

  it('NEGATIVE CONTROL: splitting one band-perimeter vertex band-side → tJunctions>0', () => {
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
    const bandSpan = bandTriCount * 3; // band tris are the first span of the merged buffer
    for (let k = 0; k < bandSpan; k++) {
      if (indices[k] === splitId) indices[k] = newId;
    }
    const crackedAudit = auditWatertight({ positions, indices }, { boundaryVertexIndices: frameSet });
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
  });
});
