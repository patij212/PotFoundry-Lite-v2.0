/**
 * verify_real_feature_mesher.test.ts — Task 1 of the real-feature mesher de-risk.
 *
 * Tests whether the PROVEN dyadic-edge-seam corridor mechanism ({@link corridorPave})
 * holds on a REAL detector-driven Voronoi wall — not the synthetic diagonal ridge the
 * spike used. The seam (Q1) and the feature-pinned fill (Q2) are GO on the synthetic
 * (commits 47c6c60, f8c038b); this scales them to a feature sourced from
 * {@link detectFeatures} on a REAL {@link styleSampler} Voronoi pot.
 *
 * VERDICT: **GO**. The seam mechanism carries over (the count-1 dyadic hole boundary
 * extracts cleanly as ONE loop, the feature is a continuous mesh edge-chain), AND the
 * corridor FILL now welds the real curved wall's DEEPLY SELF-PROXIMATE dyadic-staircase
 * corridor watertight. The earlier NO-GO had two fixed causes: (a) the single
 * `cdt2d {exterior:false}` interior fill carved the concave bays out (then a per-
 * triangle centroid test flipped wrongly in the self-proximate pinches) — REPLACED by a
 * CONSTRAINT-RESPECTING TOPOLOGICAL FLOOD-FILL ({@link corridorPave}) that classifies
 * whole flood components by a robust ray test, robust to self-proximity; (b) the
 * Steiner grid placed quality points ON the long coarse boundary constraint edges →
 * cdt2d SPLIT them → those coarse edges welded count-1 against the complement (a
 * T-junction) — FIXED by rejecting Steiner points near the boundary SEGMENTS (not just
 * vertices). FL11 now uses an mm-width corridor (multiple cells wide at any FL) so a
 * hole DOES form. Result FL7 & FL11: 0/0/0, boundaryUnfilled=0.
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
 * THE GATE (FL7 & FL11, NOT weakened): the dyadic hole extracts as ONE simple loop;
 * merged boundaryEdges = the t=0/t=1 rings ONLY; nonManifoldEdges = 0;
 * orientationMismatches = 0; tJunctions = 0; boundaryEdgesUnfilled = 0; the REAL
 * feature IS a continuous mesh edge-chain (allMeshEdges=true) riding the real curved
 * locus (wobble MEASURED — larger than the synthetic 0.0000 because the wall curves).
 * Aspect + %<10° are MEASURED (the user accepts pinch-region slivers where the mesh
 * follows the feature; watertight + feature-followed is the load-bearing criterion).
 *   Non-vacuous control: cracking an interior SHARED vertex ⇒ tJunctions > 0 (the audit
 *   is responsive — the 0/0/0 GO is a genuine weld, not an audit blind spot).
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
import type { FeatureGraph } from '../renderers/webgpu/parametric/conforming/featureGraph/types';
import { auditWatertight, triangleQuality3D, lateralWobbleMm, type Mesh3 } from './bandRemesh/audit';
import type { UTPoint } from './bandRemesh/corridorPave';
import {
  realFeatureCorridor,
  realFeatureCorridorMulti,
  type MultiFeatureSpec,
} from './bandRemesh/realCorridor';

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
// VERDICT: GO. The corridor welds watertight (0/0/0, boundaryUnfilled=0) on the REAL
// curved Voronoi wall at BOTH FL7 and FL11, the feature is a continuous mesh
// edge-chain, and the seam mechanism (Q1) carries over unchanged.
//
// The PROVEN parts hold on the real wall: the band emit-gate carves a whole-cell
// hole whose count-1 boundary IS the complement's dyadic edges (extractHoleBoundary
// returns ONE simple loop after the periodic-distance fix), and corridorPave pins
// the REAL feature as a CONTINUOUS mesh edge-chain (allMeshEdges=true) riding the
// real curved locus (wobble measured, larger than the synthetic 0.0000 because the
// wall genuinely curves).
//
//   WHAT FIXED THE EARLIER NO-GO (the corridor FILL on a deeply self-proximate
//   staircase, ~299 non-adjacent boundary-vertex pairs within 0.6 cell at FL7):
//   (a) corridorPave's interior recovery is now a CONSTRAINT-RESPECTING TOPOLOGICAL
//       FLOOD-FILL: the cdt2d full triangulation is flooded across SHARED edges,
//       never crossing a boundary or feature constraint edge → components each wholly
//       on one side of every constraint; each component is classified interior/
//       exterior by a robust ray test on its largest-area triangle. This is robust to
//       self-proximity (topology, not a per-triangle centroid that flips in a pinch),
//       and the feature splits the interior into its two sub-regions (both kept).
//   (b) the interior Steiner quality grid now rejects points near the boundary
//       SEGMENTS (not just vertices): a self-proximate staircase has LONG coarse
//       boundary edges whose midpoints are far from any vertex, so a vertex-only
//       reject left Steiner points ON a coarse constraint edge → cdt2d SPLIT it → that
//       coarse edge welded count-1 against the complement's coarse edge (a T-junction).
//       Segment-reject keeps every boundary edge an unsplit constraint → count-2 weld.
//   (c) FL11 uses an mm-width corridor (multiple dyadic cells wide at any FL), so a
//       hole DOES form (the old fixed 1.5-cell band was thinner than a cell at FL11).
//
//   MEASURED (FL7): tJunctions 100 (prior centroid attempt) → 0; boundaryUnfilled 65
//   (first flood-fill, Steiner-on-edge splits) → 0; orientationMismatches 3 → 0.
//
// Each case below PINS the GO with hard assertions so the controller re-verifies.
// ═════════════════════════════════════════════════════════════════════════════
describe('real-feature mesher — corridorPave on a REAL Voronoi wall (Task 1 — GO)', () => {
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

  it('FL7: the real curved corridor welds 0/0/0 AND the feature is a continuous mesh edge-chain (GO)', () => {
    const m = measureRealCorridorAtLevel(sampler, picked.polyline, 7);

    // ── The dyadic hole extracts cleanly as ONE simple loop (the seam carries over). ──
    expect(m.holeVerts).toBeGreaterThan(0);
    expect(m.holeLoops).toBe(1);
    expect(m.fillTris).toBeGreaterThan(0);

    // ── THE GATE (0/0/0 + boundaryUnfilled=0): the corridor welds watertight. ──
    expect(m.boundaryEdges).toBe(m.ringVerts); // open boundary = the two rings ONLY
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    expect(m.boundaryEdgesUnfilled).toBe(0); // every dyadic boundary edge welds count-2

    // ── The REAL feature IS followed — a continuous chain of mesh edges (no staircase). ──
    expect(m.featureChainLen).toBeGreaterThan(0);
    expect(m.featureChainAllEdges).toBe(true);
    // The boundary is genuinely self-proximate (the case the flood-fill must survive).
    expect(m.boundaryPinchPairs).toBeGreaterThan(50);
    // It rides the real curved locus; the snapped endpoints add a bounded wobble (the
    // feature follows the real wall, which genuinely curves — larger than synthetic 0).
    expect(m.wobbleP99Mm).toBeLessThan(3.0);

    // ── Quality is MEASURED, not gated (the user accepts pinch-region slivers where
    // the mesh follows the feature; watertight + feature-followed is load-bearing). ──
    expect(m.corridorPctBelow10).toBeLessThan(2.0); // ≈0.14% — near sliver-free
    expect(m.corridorAspectMax).toBeLessThan(60);   // ≈17 on the real curved wall
  }, 600000);

  it('FL11: the mm-width corridor still welds 0/0/0 at the finer feature level (GO)', () => {
    // The mm-width corridor is multiple dyadic cells wide at ANY featureLevel, so a
    // hole DOES form at FL11 (the old fixed 1.5-cell band was thinner than a cell).
    const m = measureRealCorridorAtLevel(sampler, picked.polyline, 11);
    expect(m.holeVerts).toBeGreaterThan(0);
    expect(m.holeLoops).toBe(1);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    expect(m.boundaryEdgesUnfilled).toBe(0);
    expect(m.featureChainLen).toBeGreaterThan(0);
    expect(m.featureChainAllEdges).toBe(true);
    expect(m.wobbleP99Mm).toBeLessThan(3.0);
    expect(m.corridorPctBelow10).toBeLessThan(2.0);
    expect(m.corridorAspectMax).toBeLessThan(60);
  }, 600000);

  it('NON-VACUOUS control: cracking an interior SHARED corridor vertex ⇒ tJunctions > 0 (the GO is a genuine weld)', () => {
    // Build the clean merged corridor at FL7, confirm it audits 0 T-junctions, then
    // crack ONE interior SHARED hole-boundary vertex (t strictly in (0,1), an id the
    // complement and the fill both reference) by duplicating it and re-pointing a
    // single incident triangle. The audit must DETECT the crack — so the 0/0/0 GO
    // above is a genuine weld, not an audit blind-spot.
    const r = realFeatureCorridor(sampler, picked.polyline, { featureLevel: 7 });
    const positions = evalPositions(sampler, r.merged.vertexUT);
    const mergedTris = r.merged.indices as number[];
    const cleanMesh: Mesh3 = { positions, indices: new Uint32Array(mergedTris) };
    const cleanAudit = auditWatertight(cleanMesh, { boundaryVertexIndices: r.merged.ringVertexIds });
    expect(cleanAudit.tJunctions).toBe(0); // the corridor is clean

    // Pick an INTERIOR hole-boundary vertex (t strictly in (0,1), not on a ring).
    let crackV = -1;
    for (const loop of r.hole.loops) {
      for (const id of loop) {
        const [, t] = r.merged.vertexUT[id];
        if (t > 1e-6 && t < 1 - 1e-6 && !r.merged.ringVertexIds.has(id)) { crackV = id; break; }
      }
      if (crackV >= 0) break;
    }
    expect(crackV).toBeGreaterThanOrEqual(0);

    const nV = r.merged.vertexUT.length;
    const newPositions = new Float32Array((nV + 1) * 3);
    newPositions.set(positions);
    newPositions[nV * 3] = positions[crackV * 3];
    newPositions[nV * 3 + 1] = positions[crackV * 3 + 1];
    newPositions[nV * 3 + 2] = positions[crackV * 3 + 2];
    const crackedIndices = Uint32Array.from(mergedTris);
    let cracked = false;
    for (let k = 0; k + 2 < crackedIndices.length && !cracked; k += 3) {
      for (let e = 0; e < 3; e++) {
        if (crackedIndices[k + e] === crackV) {
          crackedIndices[k + e] = nV; // re-point ONE incidence → splits the fan
          cracked = true;
          break;
        }
      }
    }
    expect(cracked).toBe(true);

    const crackedMesh: Mesh3 = { positions: newPositions, indices: crackedIndices };
    const crackedAudit = auditWatertight(crackedMesh, { boundaryVertexIndices: r.merged.ringVertexIds });
    // eslint-disable-next-line no-console
    console.log(
      `[REAL control] clean tJunctions=${cleanAudit.tJunctions}; after cracking interior ` +
      `hole-boundary vertex v=${crackV} ⇒ tJunctions=${crackedAudit.tJunctions}`,
    );
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
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

// ═════════════════════════════════════════════════════════════════════════════
// TASK 2 — REAL TOPOLOGY: a Voronoi JUNCTION (3 edges meeting at a node) + a closed
// LOOP (a Voronoi cell), each paved in ONE corridor with all its features pinned.
//
// The single-wall corridor (Task 1) is GO. Task 2 proves the SAME flood-fill paves
// real TOPOLOGY: more features → more wall edges → more flood components, every
// interior component kept. The JUNCTION's 3 edges must meet at ONE SHARED mesh
// vertex (the junction node, an interior id shared by the 3 chains); the LOOP must
// CLOSE (first≡last vertex). Both must weld 0/0/0 at FL7 & FL11 with every feature a
// continuous mesh edge-chain.
// ═════════════════════════════════════════════════════════════════════════════

/** A degree-3 junction: the node + its 3 incident edges clipped to junction-rooted sub-arcs. */
interface PickedJunction {
  nodeId: number;
  nodeUT: UTPoint;
  degree: number;
  /** 3 sub-arcs, each ORIENTED so polyline[0] is AT the junction node. */
  arms: UTPoint[][];
}

/** Periodic-u (u,t) chord. */
function chordUT(a: UTPoint, b: UTPoint): number {
  return Math.hypot(uDistP(a.u, b.u), a.t - b.t);
}

/** (u,t) span of a polyline (periodic u). */
function polySpan(pts: UTPoint[]): number {
  let s = 0;
  for (let k = 1; k < pts.length; k++) {
    let du = Math.abs(pts[k].u - pts[k - 1].u);
    if (du > 0.5) du = 1 - du;
    s += Math.hypot(du, pts[k].t - pts[k - 1].t);
  }
  return s;
}

/** True if the polyline crosses the u=0/1 seam or strays off the u∈[0.2,0.8] band. */
function offSeamOpen(pts: UTPoint[]): boolean {
  let uMin = Infinity, uMax = -Infinity, seam = false;
  for (let k = 0; k < pts.length; k++) {
    if (pts[k].u < uMin) uMin = pts[k].u;
    if (pts[k].u > uMax) uMax = pts[k].u;
    if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) seam = true;
  }
  return !seam && uMin > 0.2 && uMax < 0.8;
}

/**
 * Pick a REAL degree-≥3 Voronoi junction: an interior, off-seam node whose 3 longest
 * incident edges are each substantial and off-seam. Each arm is oriented so its head
 * sits AT the junction node, then clipped to a bounded sub-arc (so its far end lands
 * well inside the corridor, where it snaps to the hole boundary). Geometric (stable
 * across detector versions), NOT a hardcoded index.
 */
function pickRealVoronoiJunction(graph: FeatureGraph): PickedJunction {
  const deg = new Array(graph.nodes.length).fill(0);
  const incident: number[][] = graph.nodes.map(() => []);
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    deg[e.endpoints[0]]++;
    incident[e.endpoints[0]].push(i);
    if (e.endpoints[1] !== e.endpoints[0]) {
      deg[e.endpoints[1]]++;
      incident[e.endpoints[1]].push(i);
    }
  }
  let bestNode = -1;
  let bestScore = -1;
  let bestArms: UTPoint[][] = [];
  for (let n = 0; n < graph.nodes.length; n++) {
    if (deg[n] < 3) continue;
    const node = graph.nodes[n];
    if (!(node.t > 0.18 && node.t < 0.82 && node.u > 0.25 && node.u < 0.75)) continue;
    // The incident edges, oriented head-at-node, with their spans; reject seam-crossers.
    const cand: Array<{ arc: UTPoint[]; span: number }> = [];
    let bad = false;
    for (const ei of incident[n]) {
      const e = graph.edges[ei];
      if (e.kind !== 'open') continue;
      const pts = e.polyline.map((p) => ({ u: p.u, t: p.t }));
      if (!offSeamOpen(pts)) { bad = true; break; }
      // Orient so head is AT the junction node (the end nearest the node).
      const dHead = chordUT(pts[0], node);
      const dTail = chordUT(pts[pts.length - 1], node);
      if (dTail < dHead) pts.reverse();
      cand.push({ arc: pts, span: polySpan(pts) });
    }
    if (bad || cand.length < 3) continue;
    cand.sort((a, b) => b.span - a.span);
    const top3 = cand.slice(0, 3);
    const minSpan = top3[2].span;
    if (minSpan > bestScore) {
      bestScore = minSpan;
      bestNode = n;
      bestArms = top3.map((c) => c.arc);
    }
  }
  if (bestNode < 0) throw new Error('pickRealVoronoiJunction: no interior off-seam degree-3 junction found');
  // Clip each arm to a bounded sub-arc rooted at the junction node so its far end is
  // a genuine traversing endpoint (~0.06 (u,t) out) that lands inside the corridor.
  const arms = bestArms.map((arc) => {
    const head = arc[0];
    let cut = arc.length - 1;
    for (let k = 1; k < arc.length; k++) {
      if (chordUT(arc[k], head) > 0.06) { cut = k; break; }
    }
    return arc.slice(0, cut + 1);
  });
  return { nodeId: bestNode, nodeUT: graph.nodes[bestNode], degree: deg[bestNode], arms };
}

/** A closed Voronoi cell loop. */
interface PickedLoop {
  polyline: UTPoint[];
  span: number;
}

/**
 * Pick a REAL closed Voronoi cell: a `kind:'loop'` edge, interior, off-seam, of
 * moderate span (the largest within bounds). Closed (first≡last).
 */
function pickRealVoronoiLoop(graph: FeatureGraph): PickedLoop {
  let best = -1;
  let bestSpan = -1;
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    if (e.kind !== 'loop') continue;
    let tMin = 1, tMax = 0, uMin = 1, uMax = 0, seam = false;
    const pts = e.polyline;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      if (p.t < tMin) tMin = p.t;
      if (p.t > tMax) tMax = p.t;
      if (p.u < uMin) uMin = p.u;
      if (p.u > uMax) uMax = p.u;
      if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) seam = true;
    }
    if (seam) continue;
    if (!(tMin > 0.18 && tMax < 0.82 && uMin > 0.25 && uMax < 0.75)) continue;
    const sp = polySpan(pts);
    if (sp < 0.08) continue;
    if (sp > bestSpan) { bestSpan = sp; best = i; }
  }
  if (best < 0) throw new Error('pickRealVoronoiLoop: no interior off-seam closed loop found');
  return { polyline: graph.edges[best].polyline.map((p) => ({ u: p.u, t: p.t })), span: bestSpan };
}

/** Build the set of undirected mesh edges of a merged index buffer. */
function meshEdgeSet(indices: number[]): Set<string> {
  const s = new Set<string>();
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const tri = [indices[k], indices[k + 1], indices[k + 2]];
    for (let e = 0; e < 3; e++) {
      const i = tri[e], j = tri[(e + 1) % 3];
      s.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
  }
  return s;
}

/** Every consecutive pair of a chain is a mesh edge (feature-followed proof). */
function chainAllMeshEdges(chain: number[], edges: Set<string>): boolean {
  for (let i = 0; i + 1 < chain.length; i++) {
    const a = chain[i], b = chain[i + 1];
    if (!edges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) return false;
  }
  return true;
}

interface MultiMeasurement {
  featureLevel: number;
  boundaryEdges: number;
  ringVerts: number;
  nonManifoldEdges: number;
  tJunctions: number;
  orientMismatches: number;
  holeLoops: number;
  fillTris: number;
  boundaryEdgesUnfilled: number;
  aspectMax: number;
  pctBelow10: number;
  allChainsFollowed: boolean;
}

/** Audit + measure a merged multi-feature corridor result. */
function measureMulti(
  sampler: SurfaceSampler,
  r: ReturnType<typeof realFeatureCorridorMulti>,
): MultiMeasurement {
  const positions = evalPositions(sampler, r.merged.vertexUT);
  const mergedMesh: Mesh3 = { positions, indices: new Uint32Array(r.merged.indices) };
  const audit = auditWatertight(mergedMesh, { boundaryVertexIndices: r.merged.ringVertexIds });
  const orient = orientationMismatches(mergedMesh.indices);

  const edges = meshEdgeSet(r.merged.indices);
  let allChainsFollowed = true;
  for (const chain of r.paved.featureChains) {
    if (!chainAllMeshEdges(chain, edges)) { allChainsFollowed = false; break; }
  }

  // Hole-boundary edges with no fill triangle (the count-2 weld gap).
  const fillEdges = new Set<string>();
  for (const [a, b, c] of r.paved.triangles) {
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      fillEdges.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
  }
  let boundaryEdgesUnfilled = 0;
  for (const loop of r.hole.loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      if (!fillEdges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) boundaryEdgesUnfilled++;
    }
  }

  const corridorMesh: Mesh3 = { positions, indices: new Uint32Array(r.paved.triangles.flat()) };
  const q = triangleQuality3D(corridorMesh);

  return {
    featureLevel: 0,
    boundaryEdges: audit.boundaryEdges,
    ringVerts: r.merged.ringVertexIds.size,
    nonManifoldEdges: audit.nonManifoldEdges,
    tJunctions: audit.tJunctions,
    orientMismatches: orient,
    holeLoops: r.hole.loops.length,
    fillTris: r.paved.triangles.length,
    boundaryEdgesUnfilled,
    aspectMax: q.aspectMax,
    pctBelow10: q.pctMinAngleBelow10,
    allChainsFollowed,
  };
}

describe('real-feature mesher — JUNCTION + LOOP topology (Task 2)', () => {
  const { sampler } = buildVoronoiSamplers();
  const graph: FeatureGraph = detectFeatures(sampler, {
    ...GLOBAL_OPTS,
    reliefIndicator: makeReliefIndicator(sampler),
  });
  const junction = pickRealVoronoiJunction(graph);
  const loop = pickRealVoronoiLoop(graph);
  // eslint-disable-next-line no-console
  console.log(
    `[JUNCTION] node=${junction.nodeId} @(${junction.nodeUT.u.toFixed(3)},${junction.nodeUT.t.toFixed(3)}) ` +
    `degree=${junction.degree} arms=${junction.arms.length} ` +
    `armSpans=[${junction.arms.map((a) => polySpan(a).toFixed(3)).join(',')}]`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[LOOP] pts=${loop.polyline.length} span=${loop.span.toFixed(3)} ` +
    `head=(${loop.polyline[0].u.toFixed(3)},${loop.polyline[0].t.toFixed(3)}) ` +
    `tail=(${loop.polyline[loop.polyline.length - 1].u.toFixed(3)},${loop.polyline[loop.polyline.length - 1].t.toFixed(3)})`,
  );

  it('picks a real degree-≥3 junction (3 substantial arms) + a real closed cell loop', () => {
    expect(junction.degree).toBeGreaterThanOrEqual(3);
    expect(junction.arms.length).toBe(3);
    for (const arm of junction.arms) {
      expect(arm.length).toBeGreaterThanOrEqual(2);
      expect(polySpan(arm)).toBeGreaterThan(0.02);
    }
    // All 3 arms share the junction node as their head (within snapping tolerance).
    for (const arm of junction.arms) {
      expect(chordUT(arm[0], junction.nodeUT)).toBeLessThan(0.05);
    }
    expect(loop.polyline.length).toBeGreaterThanOrEqual(8);
    expect(loop.span).toBeGreaterThan(0.08);
    // The loop is genuinely closed (first ≡ last).
    const f = loop.polyline[0], l = loop.polyline[loop.polyline.length - 1];
    expect(chordUT(f, l)).toBeLessThan(1e-3);
  }, 600000);

  /** The junction's 3 arms, all heads pinned to ONE shared junction node id. */
  function junctionFeatures(): MultiFeatureSpec[] {
    const JK = 'voronoi-junction';
    return junction.arms.map((arm) => ({
      polyline: arm,
      closed: false,
      start: { kind: 'junction', junctionKey: JK } as const, // head = junction node
      end: { kind: 'snap-boundary' } as const,               // tail = hole boundary
    }));
  }

  function runJunction(featureLevel: number): MultiMeasurement {
    const r = realFeatureCorridorMulti(sampler, junctionFeatures(), { featureLevel });
    const m = measureMulti(sampler, r);
    m.featureLevel = featureLevel;
    // The 3 chains must SHARE one junction-node id (the head of every chain).
    const heads = new Set(r.paved.featureChains.map((c) => c[0]));
    const sharedJunction = heads.size === 1;
    // eslint-disable-next-line no-console
    console.log(
      `[JUNCTION FL${featureLevel}] bnd=${m.boundaryEdges} (rings=${m.ringVerts}) ` +
      `nonMan=${m.nonManifoldEdges} tJunction=${m.tJunctions} orient=${m.orientMismatches} | ` +
      `holeLoops=${m.holeLoops} fillTris=${m.fillTris} unfilled=${m.boundaryEdgesUnfilled} | ` +
      `chains=${r.paved.featureChains.length} sharedJunctionId=${sharedJunction} ` +
      `(heads={${[...heads].join(',')}}) allFollowed=${m.allChainsFollowed} | ` +
      `aspectMax=${m.aspectMax.toFixed(2)} %<10°=${m.pctBelow10.toFixed(2)}`,
    );
    expect(sharedJunction).toBe(true);
    return m;
  }

  function runLoop(featureLevel: number): MultiMeasurement {
    const r = realFeatureCorridorMulti(sampler, [{ polyline: loop.polyline, closed: true }], { featureLevel });
    const m = measureMulti(sampler, r);
    m.featureLevel = featureLevel;
    const chain = r.paved.featureChains[0];
    const closed = chain.length > 1 && chain[0] === chain[chain.length - 1];
    // eslint-disable-next-line no-console
    console.log(
      `[LOOP FL${featureLevel}] bnd=${m.boundaryEdges} (rings=${m.ringVerts}) ` +
      `nonMan=${m.nonManifoldEdges} tJunction=${m.tJunctions} orient=${m.orientMismatches} | ` +
      `holeLoops=${m.holeLoops} fillTris=${m.fillTris} unfilled=${m.boundaryEdgesUnfilled} | ` +
      `loopChainLen=${chain.length} loopClosed=${closed} allFollowed=${m.allChainsFollowed} | ` +
      `aspectMax=${m.aspectMax.toFixed(2)} %<10°=${m.pctBelow10.toFixed(2)}`,
    );
    expect(closed).toBe(true);
    return m;
  }

  it('JUNCTION FL7: 3 edges welded at ONE shared node, corridor 0/0/0', () => {
    const m = runJunction(7);
    expect(m.holeLoops).toBeGreaterThanOrEqual(1);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    expect(m.boundaryEdgesUnfilled).toBe(0);
    expect(m.allChainsFollowed).toBe(true); // all 3 edges are continuous mesh edge-chains
  }, 600000);

  it('JUNCTION FL11: still welds 0/0/0 at the finer level', () => {
    const m = runJunction(11);
    expect(m.holeLoops).toBeGreaterThanOrEqual(1);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    expect(m.boundaryEdgesUnfilled).toBe(0);
    expect(m.allChainsFollowed).toBe(true);
  }, 600000);

  it('LOOP FL7: the closed cell loop welds 0/0/0 and closes as a continuous mesh edge-chain', () => {
    const m = runLoop(7);
    expect(m.holeLoops).toBeGreaterThanOrEqual(1);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    expect(m.boundaryEdgesUnfilled).toBe(0);
    expect(m.allChainsFollowed).toBe(true);
  }, 600000);

  it('LOOP FL11: still welds 0/0/0 at the finer level', () => {
    const m = runLoop(11);
    expect(m.holeLoops).toBeGreaterThanOrEqual(1);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    expect(m.boundaryEdgesUnfilled).toBe(0);
    expect(m.allChainsFollowed).toBe(true);
  }, 600000);

  it('NON-VACUOUS control: cracking an interior SHARED junction-corridor vertex ⇒ tJunctions > 0', () => {
    const r = realFeatureCorridorMulti(sampler, junctionFeatures(), { featureLevel: 7 });
    const positions = evalPositions(sampler, r.merged.vertexUT);
    const mergedTris = r.merged.indices;
    const cleanAudit = auditWatertight(
      { positions, indices: new Uint32Array(mergedTris) },
      { boundaryVertexIndices: r.merged.ringVertexIds },
    );
    expect(cleanAudit.tJunctions).toBe(0);

    // Crack the SHARED junction node itself (an interior id all 3 chains reference).
    const crackV = r.paved.featureChains[0][0];
    expect(crackV).toBeGreaterThanOrEqual(r.existingVertexCount); // it's a NEW interior id
    const nV = r.merged.vertexUT.length;
    const newPositions = new Float32Array((nV + 1) * 3);
    newPositions.set(positions);
    newPositions[nV * 3] = positions[crackV * 3];
    newPositions[nV * 3 + 1] = positions[crackV * 3 + 1];
    newPositions[nV * 3 + 2] = positions[crackV * 3 + 2];
    const crackedIndices = Uint32Array.from(mergedTris);
    let cracked = false;
    for (let k = 0; k + 2 < crackedIndices.length && !cracked; k += 3) {
      for (let e = 0; e < 3; e++) {
        if (crackedIndices[k + e] === crackV) { crackedIndices[k + e] = nV; cracked = true; break; }
      }
    }
    expect(cracked).toBe(true);
    const crackedAudit = auditWatertight(
      { positions: newPositions, indices: crackedIndices },
      { boundaryVertexIndices: r.merged.ringVertexIds },
    );
    // eslint-disable-next-line no-console
    console.log(`[JUNCTION control] clean tJ=${cleanAudit.tJunctions}; cracked shared node v=${crackV} ⇒ tJ=${crackedAudit.tJunctions}`);
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
  }, 600000);
});
