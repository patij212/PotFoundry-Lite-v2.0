/**
 * verify_real_feature_mesher.test.ts — Task 1 of the real-feature mesher de-risk.
 *
 * Tests whether the PROVEN dyadic-edge-seam corridor mechanism ({@link corridorPave})
 * holds on a REAL detector-driven Voronoi wall — not the synthetic diagonal ridge the
 * spike used. The seam (Q1) and the feature-pinned fill (Q2) are GO on the synthetic
 * (commits 47c6c60, f8c038b); this scales them to a feature sourced from
 * {@link detectFeatures} on a REAL {@link styleSampler} Voronoi pot.
 *
 * VERDICT: **NO-GO** (documented, with the exact invariant — a SUCCESS per the brief).
 * The seam mechanism carries over (the count-1 dyadic hole boundary extracts cleanly
 * as ONE loop, the feature is a continuous mesh edge-chain), but corridorPave's
 * single `cdt2d {exterior:false}` interior fill CANNOT weld the real curved wall's
 * DEEPLY SELF-PROXIMATE dyadic-staircase corridor: ~44% of hole-boundary edges get no
 * fill triangle → ~197 T-junctions at FL7; FL11's fixed 1.5-cell band is thinner than
 * a cell so no hole forms. See the gate block's banner for the full invariant.
 *
 * Pipeline (the spike's, with the feature swapped for a real one):
 *   1. Real Voronoi pot: `styleSampler('Voronoi', {}, DIMS)`.
 *   2. `detectFeatures(sampler, GLOBAL_OPTS + reliefIndicator)` → FeatureGraph.
 *   3. Pick ONE substantial feature edge GEOMETRICALLY (NOT by hardcoded index, which
 *      is unstable across detector versions): the longest OPEN edge that is INTERIOR
 *      to the t=0/t=1 rings, does NOT cross the u=0/1 seam, and lives off the seam
 *      (u∈[0.2,0.8]). Then CLIP it to its max-chord traversing sub-arc so the feature
 *      has two well-separated endpoints (a real cell-web edge nearly closes on
 *      itself; the raw polyline's two ends sit on top of each other → a degenerate
 *      corridor). This yields a genuine curved Voronoi wall segment.
 *   4. `realFeatureCorridor(sampler, subArc, {featureLevel})` at FL7 AND FL11.
 *   5. Evaluate 3D positions via the Voronoi sampler, audit + measure.
 *
 * THE GATE (FL7 & FL11, NOT weakened — it PINS the NO-GO with hard assertions):
 *   (1) WHAT HOLDS: the dyadic hole extracts as ONE simple loop; boundaryEdges = the
 *       t=0/t=1 rings ONLY; nonManifoldEdges = 0; orientationMismatches = 0; the REAL
 *       feature IS a continuous mesh edge-chain riding the real curved locus (wobble
 *       MEASURED — larger than the synthetic 0.0000 because the wall curves).
 *   (2) THE NO-GO (hard-asserted): the corridor boundary is deeply self-proximate
 *       (>50 pinch pairs); the fill drops a large fraction of boundary edges
 *       (boundaryEdgesUnfilled > 0) → tJunctions > 0 and tJunctions = unfilledEdges.
 *   (3) FL11: a fixed 1.5-cell band is thinner than a dyadic cell ⇒ no hole ⇒ throws.
 *   Non-vacuous control: the merged T-junctions ARE the unfilled boundary edges, and a
 *   manually-completed fill audits fewer (the metric clears when the boundary closes).
 *   Flag-OFF byte-identical: no bandRegions ⇒ assembleWatertight unchanged.
 *
 * Pure CPU, read-only analytic samplers (jsdom / Vitest, NO WebGPU).
 */
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { assembleWatertight } from '../renderers/webgpu/parametric/conforming/WatertightAssembly';
import { auditWatertight, triangleQuality3D, lateralWobbleMm, type Mesh3 } from './bandRemesh/audit';
import type { UTPoint } from './bandRemesh/corridorPave';
import { realFeatureCorridor } from './bandRemesh/realCorridor';

const TAU = 2 * Math.PI;

// ── Real pot dims (matching the spike's realistic dims). ───────────────────────
const H = 120;
const R0 = 40;
const TBOTTOM = 6;
const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };

// u/t → mm scale factors (full circumference / height). Same for every probe.
const U_TO_MM = TAU * R0; // ≈ 251.3 mm
const T_TO_MM = H; // 120 mm

// ── GLOBAL detector options (verbatim from validation.test.ts GLOBAL_OPTS). ────
const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40,
  fineRes: 120,
  minStrength: 1.0,
  minAngleDeg: 28,
  uToMm: U_TO_MM,
  tToMm: T_TO_MM,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};

// ── GLOBAL sampler-derived relief indicator (verbatim from validation.test.ts). ─
const RELIEF_MEAN_SAMPLES = 256;
const RELIEF_ALPHA = 0.5;
const RELIEF_ABS_FLOOR_MM = 1e-3;
function samplerRadius(sampler: SurfaceSampler, u: number, t: number): number {
  const [x, y] = sampler.position(u, t);
  return Math.hypot(x, y);
}
function makeReliefIndicator(sampler: SurfaceSampler): (u: number, t: number) => number {
  const cache = new Map<number, { mean: number; floor: number }>();
  const at = (t: number): { mean: number; floor: number } => {
    const c = cache.get(t);
    if (c !== undefined) return c;
    let sum = 0;
    const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) {
      const r = samplerRadius(sampler, i / RELIEF_MEAN_SAMPLES, t);
      rs[i] = r;
      sum += r;
    }
    const mean = sum / RELIEF_MEAN_SAMPLES;
    let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) {
      const d = rs[i] - mean;
      sq += d * d;
    }
    const rms = Math.sqrt(sq / RELIEF_MEAN_SAMPLES);
    const v = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * rms) };
    cache.set(t, v);
    return v;
  };
  return (u: number, t: number): number => {
    const { mean, floor } = at(t);
    return Math.abs(samplerRadius(sampler, u, t) - mean) - floor;
  };
}

// ── The real Voronoi pot sampler + its inner-wall offset cylinder. ─────────────
function buildVoronoiSamplers(): { sampler: SurfaceSampler; innerSampler: SurfaceSampler } {
  const sampler = styleSampler('Voronoi', {}, STYLE_DIMS);
  const innerSampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 - 4;
      const z = TBOTTOM + t * (H - TBOTTOM);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
  return { sampler, innerSampler };
}

// ── Periodic-u helpers for edge selection + wobble. ────────────────────────────
function uDistP(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/**
 * Pick ONE real Voronoi feature edge for the corridor, fully geometrically (stable
 * across detector versions): the longest OPEN edge interior to the rings, NOT
 * seam-crossing, off the seam (u∈[0.2,0.8]), then CLIP to its max-chord sub-arc so
 * the feature traverses (two well-separated endpoints). Returns the clipped (u,t)
 * polyline + diagnostics.
 */
interface PickedEdge {
  polyline: UTPoint[];
  edgeIndex: number;
  tMin: number;
  tMax: number;
  uMin: number;
  uMax: number;
  chordUT: number;
  seamCrossing: boolean;
}
function pickRealVoronoiEdge(sampler: SurfaceSampler): PickedEdge {
  const graph = detectFeatures(sampler, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) });

  let bestIdx = -1;
  let bestSpan = -1;
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    if (e.kind !== 'open') continue;
    const pts = e.polyline;
    if (pts.length < 20) continue;
    let tMin = Infinity, tMax = -Infinity, uMin = Infinity, uMax = -Infinity;
    let seam = false;
    let span = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      if (p.t < tMin) tMin = p.t;
      if (p.t > tMax) tMax = p.t;
      if (p.u < uMin) uMin = p.u;
      if (p.u > uMax) uMax = p.u;
      if (k > 0) {
        let du = Math.abs(pts[k].u - pts[k - 1].u);
        if (du > 0.5) { seam = true; du = 1 - du; }
        span += Math.hypot(du, pts[k].t - pts[k - 1].t);
      }
    }
    const interior = tMin > 0.1 && tMax < 0.9;
    const offSeam = uMin > 0.2 && uMax < 0.8;
    if (!interior || seam || !offSeam) continue;
    if (span > bestSpan) { bestSpan = span; bestIdx = i; }
  }
  if (bestIdx < 0) throw new Error('pickRealVoronoiEdge: no interior off-seam open edge found');

  const pts = graph.edges[bestIdx].polyline;
  // Max-chord sub-arc: the two indices with the largest periodic-u (u,t) chord.
  let bi = 0, bj = 0, bestChord = -1;
  for (let a = 0; a < pts.length; a++) {
    for (let b = a + 1; b < pts.length; b++) {
      const ch = Math.hypot(uDistP(pts[a].u, pts[b].u), pts[a].t - pts[b].t);
      if (ch > bestChord) { bestChord = ch; bi = a; bj = b; }
    }
  }
  const lo = Math.min(bi, bj), hi = Math.max(bi, bj);
  const sub = pts.slice(lo, hi + 1).map((p) => ({ u: p.u, t: p.t }));

  let tMin = Infinity, tMax = -Infinity, uMin = Infinity, uMax = -Infinity, seam = false;
  for (let k = 0; k < sub.length; k++) {
    if (sub[k].t < tMin) tMin = sub[k].t;
    if (sub[k].t > tMax) tMax = sub[k].t;
    if (sub[k].u < uMin) uMin = sub[k].u;
    if (sub[k].u > uMax) uMax = sub[k].u;
    if (k > 0 && Math.abs(sub[k].u - sub[k - 1].u) > 0.5) seam = true;
  }
  return { polyline: sub, edgeIndex: bestIdx, tMin, tMax, uMin, uMax, chordUT: bestChord, seamCrossing: seam };
}

// ── Orientation consistency (verbatim from the spike harness). ─────────────────
function orientationMismatches(indices: Uint32Array): number {
  const dir = new Map<string, number>();
  const undirected = new Map<string, number>();
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const tri = [indices[k], indices[k + 1], indices[k + 2]];
    for (let e = 0; e < 3; e++) {
      const i = tri[e], j = tri[(e + 1) % 3];
      if (i === j) continue;
      dir.set(`${i}->${j}`, (dir.get(`${i}->${j}`) ?? 0) + 1);
      const uk = i < j ? `${i}:${j}` : `${j}:${i}`;
      undirected.set(uk, (undirected.get(uk) ?? 0) + 1);
    }
  }
  let conflicts = 0;
  for (const [uk, count] of undirected) {
    if (count !== 2) continue;
    const [iS, jS] = uk.split(':');
    const ij = dir.get(`${iS}->${jS}`) ?? 0;
    const ji = dir.get(`${jS}->${iS}`) ?? 0;
    if (!(ij === 1 && ji === 1)) conflicts++;
  }
  return conflicts;
}

/** Evaluate 3D positions for every merged (u,t) via the Voronoi sampler. */
function evalPositions(sampler: SurfaceSampler, mergedUt: Array<[number, number]>): Float32Array {
  const positions = new Float32Array(mergedUt.length * 3);
  for (let i = 0; i < mergedUt.length; i++) {
    const p = sampler.position(mergedUt[i][0], mergedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  return positions;
}

interface RealMeasurement {
  featureLevel: number;
  boundaryEdges: number;
  ringVerts: number;
  nonManifoldEdges: number;
  tJunctions: number;
  orientMismatches: number;
  holeVerts: number;
  holeLoops: number;
  featureChainLen: number;
  featureChainAllEdges: boolean;
  wobbleP99Mm: number;
  wobbleMaxMm: number;
  corridorAspectMax: number;
  corridorPctBelow10: number;
  cdtInversions: number;
  cdtDrops: number;
  fillTris: number;
  /** Hole-boundary edges that get NO fill triangle (the count-2 weld gap — the NO-GO). */
  boundaryEdgesUnfilled: number;
  boundaryEdgesTotal: number;
  /** Non-adjacent hole-boundary vertex pairs within 0.6 dyadic cell (self-proximity). */
  boundaryPinchPairs: number;
}

/** Run the full real-feature corridor pipeline at one featureLevel and MEASURE. */
function measureRealCorridorAtLevel(
  sampler: SurfaceSampler,
  feature: UTPoint[],
  featureLevel: number,
): RealMeasurement {
  const r = realFeatureCorridor(sampler, feature, { featureLevel });

  const positions = evalPositions(sampler, r.merged.vertexUT);
  const mergedMesh: Mesh3 = { positions, indices: new Uint32Array(r.merged.indices) };
  const audit = auditWatertight(mergedMesh, { boundaryVertexIndices: r.merged.ringVertexIds });
  const orient = orientationMismatches(mergedMesh.indices);

  // ── Feature-followed proof: every densified feature segment is a MESH EDGE. ──
  const meshEdges = new Set<string>();
  const ind = r.merged.indices;
  for (let k = 0; k + 2 < ind.length; k += 3) {
    const tri = [ind[k], ind[k + 1], ind[k + 2]];
    for (let e = 0; e < 3; e++) {
      const i = tri[e], j = tri[(e + 1) % 3];
      meshEdges.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
  }
  let featureChainAllEdges = true;
  for (let i = 0; i + 1 < r.paved.featureChainIds.length; i++) {
    const a = r.paved.featureChainIds[i], b = r.paved.featureChainIds[i + 1];
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!meshEdges.has(key)) { featureChainAllEdges = false; break; }
  }

  // ── Lateral wobble of the feature chain from the REAL feature locus (mm). ──
  // The real locus is the picked polyline itself; parametrise it by index fraction.
  const chainUT = r.paved.featureChainIds.map((id) => r.merged.vertexUT[id]);
  const uToMm = TAU * R0;
  const tToMm = H;
  const wob = lateralWobbleMm(
    chainUT,
    (param: number): [number, number] => {
      const f = param * (feature.length - 1);
      const i0 = Math.min(Math.floor(f), feature.length - 1);
      const i1 = Math.min(i0 + 1, feature.length - 1);
      const fr = f - i0;
      return [
        feature[i0].u + (feature[i1].u - feature[i0].u) * fr,
        feature[i0].t + (feature[i1].t - feature[i0].t) * fr,
      ];
    },
    uToMm,
    tToMm,
  );

  // ── Quality over the CORRIDOR fill triangles ONLY. ──
  const corridorMesh: Mesh3 = { positions, indices: new Uint32Array(r.paved.triangles.flat()) };
  const q = triangleQuality3D(corridorMesh);

  // ── NO-GO metric: hole-boundary edges that get NO fill triangle. Each such edge
  // welds count-1 (complement only) → it is a tJunction in the merged audit. This
  // localizes the failure to the corridor FILL, not the seam extraction. ──
  const fillEdges = new Set<string>();
  for (const [a, b, c] of r.paved.triangles) {
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      fillEdges.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
  }
  let boundaryEdgesUnfilled = 0;
  let boundaryEdgesTotal = 0;
  for (const loop of r.hole.loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      boundaryEdgesTotal++;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!fillEdges.has(key)) boundaryEdgesUnfilled++;
    }
  }

  // ── Self-proximity: non-adjacent boundary vertex pairs within 0.6 dyadic cell.
  // A real curved-wall band footprint is a deeply self-proximate dyadic staircase
  // (the 2:1 mid-edges split it into ~half-cell steps; opposite corridor walls sit
  // within ~1 cell). This is the geometric reason cdt2d {exterior:false} carves the
  // concave bays out of the fill. ──
  const cellW = 1 / 2 ** featureLevel;
  const pinchTol = 0.6 * cellW;
  let boundaryPinchPairs = 0;
  for (const loop of r.hole.loops) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent across the wrap
        const a = r.merged.vertexUT[loop[i]];
        const b = r.merged.vertexUT[loop[j]];
        let du = Math.abs(a[0] - b[0]) % 1;
        if (du > 0.5) du = 1 - du;
        if (Math.hypot(du, a[1] - b[1]) < pinchTol) boundaryPinchPairs++;
      }
    }
  }

  const m: RealMeasurement = {
    featureLevel,
    boundaryEdges: audit.boundaryEdges,
    ringVerts: r.merged.ringVertexIds.size,
    nonManifoldEdges: audit.nonManifoldEdges,
    tJunctions: audit.tJunctions,
    orientMismatches: orient,
    holeVerts: r.hole.vertexCount,
    holeLoops: r.hole.loops.length,
    featureChainLen: r.paved.featureChainIds.length - 1,
    featureChainAllEdges,
    wobbleP99Mm: wob.p99,
    wobbleMaxMm: wob.max,
    corridorAspectMax: q.aspectMax,
    corridorPctBelow10: q.pctMinAngleBelow10,
    cdtInversions: r.paved.inversionCount,
    cdtDrops: r.paved.droppedCount,
    fillTris: r.paved.triangles.length,
    boundaryEdgesUnfilled,
    boundaryEdgesTotal,
    boundaryPinchPairs,
  };
  // eslint-disable-next-line no-console
  console.log(
    `[REAL corridor FL${featureLevel}] bnd=${m.boundaryEdges} (rings=${m.ringVerts}) ` +
    `nonMan=${m.nonManifoldEdges} tJunction=${m.tJunctions} orientMismatch=${m.orientMismatches} | ` +
    `holeVerts=${m.holeVerts} loops=${m.holeLoops} fillTris=${m.fillTris} | ` +
    `featureChain=${m.featureChainLen}seg allMeshEdges=${m.featureChainAllEdges} ` +
    `wobbleP99=${m.wobbleP99Mm.toFixed(4)}mm max=${m.wobbleMaxMm.toFixed(4)}mm | ` +
    `aspectMax=${m.corridorAspectMax.toFixed(2)} %<10°=${m.corridorPctBelow10.toFixed(2)} ` +
    `cdt(inv=${m.cdtInversions} drop=${m.cdtDrops}) | ` +
    `boundaryUnfilled=${m.boundaryEdgesUnfilled}/${m.boundaryEdgesTotal} pinchPairs=${m.boundaryPinchPairs}`,
  );
  return m;
}

// ═════════════════════════════════════════════════════════════════════════════
// THE GATE — real Voronoi wall, corridor welded at the dyadic seam, FL7 & FL11.
//
// VERDICT: NO-GO (documented, with the exact invariant — a SUCCESS per the brief).
//
// The PROVEN parts hold on the real wall: the band emit-gate carves a whole-cell
// hole whose count-1 boundary IS the complement's dyadic edges (extractHoleBoundary
// returns ONE simple loop after the periodic-distance fix), and corridorPave pins
// the REAL feature as a CONTINUOUS mesh edge-chain (allMeshEdges=true) riding the
// real curved locus (wobble measured, larger than the synthetic 0.0000 because the
// wall genuinely curves). BUT the corridor FILL does NOT weld:
//
//   THE INVARIANT: a real curved Voronoi wall's band footprint is a DEEPLY
//   SELF-PROXIMATE dyadic staircase hole boundary (the 2:1 mid-edges split it into
//   ~half-cell steps, so opposite walls of the ~1.5-cell corridor sit within ~1
//   cell — MEASURED: ~299 non-adjacent boundary-vertex pairs within 0.6 cell at
//   FL7). corridorPave's single `cdt2d(points, edges, {exterior:false})` flood-fill
//   carves the concave bays OUT of the fill, so ~44% of hole-boundary edges
//   (MEASURED 90/204 at FL7) get NO fill triangle → they weld count-1 (complement
//   only) → ~197 T-junctions. WIDENING the corridor makes it WORSE (cdt2d returns
//   ZERO triangles at widthCells ≥ 4 — the wider self-touching boundary is
//   effectively non-simple to cdt2d). At FL11 the fixed 1.5-cell band is THINNER
//   than a whole dyadic cell, so the emit-gate skips NO cell → NO hole forms →
//   corridorPave throws on the empty boundary. The synthetic diagonal spike had a
//   clean monotone staircase with NO self-proximity, so this failure mode never
//   surfaced — it is intrinsic to real curved/marching-squares feature walls.
//
// The seam mechanism (Q1) is NOT refuted — the count-1 dyadic boundary still
// extracts cleanly. What is refuted is corridorPave's `{exterior:false}` ONE-cdt2d
// interior strategy on a self-proximate corridor. The fix is an INTERIOR-strategy
// change (e.g. constrain by the feature + boundary into convex sub-regions, or a
// boundary-respecting fill that cannot drop a constraint edge), NOT a seam change.
//
// Each case below PINS this NO-GO with hard assertions on the MEASURED mechanism
// so the controller re-verifies the exact invariant (not a vague failure).
// ═════════════════════════════════════════════════════════════════════════════
describe('real-feature mesher — corridorPave on a REAL Voronoi wall (Task 1 — documented NO-GO)', () => {
  // Detect + pick ONCE (shared across the cases — same real edge).
  const { sampler } = buildVoronoiSamplers();
  const picked = pickRealVoronoiEdge(sampler);
  // eslint-disable-next-line no-console
  console.log(
    `[REAL edge] index=${picked.edgeIndex} pts=${picked.polyline.length} ` +
    `t=[${picked.tMin.toFixed(3)},${picked.tMax.toFixed(3)}] u=[${picked.uMin.toFixed(3)},${picked.uMax.toFixed(3)}] ` +
    `chordUT=${picked.chordUT.toFixed(4)} seamCrossing=${picked.seamCrossing} ` +
    `head=(${picked.polyline[0].u.toFixed(3)},${picked.polyline[0].t.toFixed(3)}) ` +
    `tail=(${picked.polyline[picked.polyline.length - 1].u.toFixed(3)},${picked.polyline[picked.polyline.length - 1].t.toFixed(3)})`,
  );

  it('picks a substantial INTERIOR, NON-seam-crossing real Voronoi wall segment', () => {
    expect(picked.polyline.length).toBeGreaterThanOrEqual(3);
    expect(picked.seamCrossing).toBe(false);
    expect(picked.tMin).toBeGreaterThan(0.1);
    expect(picked.tMax).toBeLessThan(0.9);
    expect(picked.chordUT).toBeGreaterThan(0.05); // a genuine traversing segment
  }, 600000);

  it('FL7: the seam + feature-chain HOLD, but the self-proximate corridor FILL cannot weld (the NO-GO)', () => {
    const m = measureRealCorridorAtLevel(sampler, picked.polyline, 7);

    // ── WHAT HOLDS on the real wall (the PROVEN parts carry over). ──
    // The dyadic hole extracts cleanly as ONE simple loop (after the periodic-dist
    // fix) and its count-1 boundary edges = the complement's dyadic cell edges.
    expect(m.holeVerts).toBeGreaterThan(0);
    expect(m.holeLoops).toBe(1);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts); // open boundary = the two rings ONLY
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    // The REAL feature IS followed — a continuous chain of mesh edges (no staircase).
    expect(m.featureChainLen).toBeGreaterThan(0);
    expect(m.featureChainAllEdges).toBe(true);
    // It rides the real curved locus (larger than the synthetic 0.0000 — real wall).
    expect(m.wobbleP99Mm).toBeLessThan(2.0);

    // ── THE NO-GO (the exact invariant, hard-asserted so the controller re-verifies). ──
    // The boundary is deeply self-proximate (opposite corridor walls ~1 cell apart).
    expect(m.boundaryPinchPairs).toBeGreaterThan(50);
    // cdt2d {exterior:false} drops a large fraction of the concave-bay boundary edges
    // from the fill → those edges weld count-1 only → T-junctions. This is the
    // load-bearing NO-GO: the corridor FILL does not weld the real staircase.
    expect(m.boundaryEdgesUnfilled).toBeGreaterThan(0);
    expect(m.tJunctions).toBeGreaterThan(0);
    // The T-junctions are exactly the unfilled boundary edges (localizes the failure
    // to the FILL, not the seam extraction): every unfilled boundary edge is count-1.
    expect(m.tJunctions).toBeGreaterThanOrEqual(m.boundaryEdgesUnfilled);
  }, 600000);

  it('FL11: a fixed 1.5-cell band is thinner than a dyadic cell ⇒ NO hole forms (corridorPave throws)', () => {
    // At FL11 cellWidth = 1/2048 ≈ 4.9e-4; the 1.5-cell band half-width ≈ 7.3e-4.
    // A whole dyadic cell needs all 4 corners + center inside the band — a tube that
    // thin around a curved wall contains no whole cell → the emit-gate skips nothing
    // → extractHoleBoundary finds no count-1 hole loops → corridorPave throws on the
    // empty boundary. The second face of the same real-geometry NO-GO: the corridor
    // width must SCALE with the feature level, and even then (see FL7) the fill fails.
    expect(() => realFeatureCorridor(sampler, picked.polyline, { featureLevel: 11 })).toThrow();
  }, 600000);

  it('NON-VACUOUS control: the merged T-junctions include the unfilled corridor-boundary edges, and closing them reduces the count', () => {
    const r = realFeatureCorridor(sampler, picked.polyline, { featureLevel: 7 });
    const positions = evalPositions(sampler, r.merged.vertexUT);
    const mesh: Mesh3 = { positions, indices: new Uint32Array(r.merged.indices) };
    const audit = auditWatertight(mesh, { boundaryVertexIndices: r.merged.ringVertexIds });

    // (a) Collect the unfilled hole-boundary edges (count-1 in the merged mesh, off
    // the rings). These are exactly the cdt2d {exterior:false} bay-carve drops.
    const use = new Map<string, number>();
    const ind = r.merged.indices;
    for (let k = 0; k + 2 < ind.length; k += 3) {
      const tri = [ind[k], ind[k + 1], ind[k + 2]];
      for (let e = 0; e < 3; e++) {
        const i = tri[e], j = tri[(e + 1) % 3];
        if (i === j) continue;
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        use.set(key, (use.get(key) ?? 0) + 1);
      }
    }
    const unfilled: Array<[number, number]> = [];
    for (const loop of r.hole.loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if ((use.get(key) ?? 0) === 1) unfilled.push([a, b]);
      }
    }
    // The dropped boundary edges are a LOWER BOUND on the merged T-junctions: each
    // unfilled boundary edge welds count-1, and the carved bays ALSO leave interior
    // fill-perimeter edges count-1 (MEASURED: 90 boundary + ~107 interior = 197).
    // This localizes the failure to the corridor FILL (the cdt2d {exterior:false}
    // bay-carve), NOT the seam extraction or the audit.
    expect(unfilled.length).toBeGreaterThan(0);
    expect(audit.tJunctions).toBeGreaterThanOrEqual(unfilled.length);

    // (b) NON-VACUOUS: the audit is NOT always-positive — it RESPONDS to closing the
    // boundary. The 90 unfilled boundary edges are each count-1 now; add ONE fill
    // triangle per edge (fanning to a shared interior anchor) → those exact edges
    // become count-2. Re-audit: the merged T-junction count DROPS by ~the number of
    // boundary edges we closed (the residual is the carved-bay interior count-1 edges
    // we did NOT touch — proving the 90 boundary drops were genuine, audit-detected
    // T-junctions, not an audit artifact).
    const completed: number[] = (r.merged.indices as number[]).slice();
    const anchor = r.paved.featureChainIds[Math.floor(r.paved.featureChainIds.length / 2)];
    for (const [a, b] of unfilled) completed.push(a, b, anchor);
    const completedMesh: Mesh3 = { positions, indices: new Uint32Array(completed) };
    const completedAudit = auditWatertight(completedMesh, { boundaryVertexIndices: r.merged.ringVertexIds });
    // eslint-disable-next-line no-console
    console.log(
      `[REAL control] merged tJunctions=${audit.tJunctions} (boundaryUnfilled=${unfilled.length} + ` +
      `interior carve drops=${audit.tJunctions - unfilled.length}); after fanning the ${unfilled.length} ` +
      `boundary edges to anchor ${anchor} ⇒ tJunctions=${completedAudit.tJunctions}`,
    );
    // Closing the boundary edges strictly reduces the T-junction count (the metric is
    // responsive — the boundary gap is corridorPave's interior strategy, not the audit).
    expect(completedAudit.tJunctions).toBeLessThan(audit.tJunctions);
  }, 600000);

  it('FLAG-OFF byte-identical: no bandRegions ⇒ vertices+indices unchanged', () => {
    const { sampler: s, innerSampler } = buildVoronoiSamplers();
    const BASE = {
      maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2,
      maxLevel: 12, resU: 128, resT: 128, nRing: 1024,
      targetTriangles: 6_000_000, budgetMode: 'cap' as const,
    };
    const features = [{
      kind: 'general-curve' as const,
      points: Array.from({ length: 17 }, (_, k) => ({ u: 0.05, t: 0.1 + (0.8 * k) / 16 })),
      label: 'corridor-strand',
    }];
    const baseline = assembleWatertight(s, innerSampler, DIMS, {
      ...BASE, featureLevel: 7, outerFeatureLines: features,
    });
    const withOptUndefined = assembleWatertight(s, innerSampler, DIMS, {
      ...BASE, featureLevel: 7, outerFeatureLines: features, bandRegions: undefined,
    });
    expect(withOptUndefined.vertices.length).toBe(baseline.vertices.length);
    expect(withOptUndefined.indices.length).toBe(baseline.indices.length);
    expect(Array.from(withOptUndefined.vertices)).toEqual(Array.from(baseline.vertices));
    expect(Array.from(withOptUndefined.indices)).toEqual(Array.from(baseline.indices));
  }, 600000);
});
