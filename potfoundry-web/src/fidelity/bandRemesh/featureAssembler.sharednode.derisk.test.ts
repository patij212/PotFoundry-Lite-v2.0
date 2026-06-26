/**
 * featureAssembler.sharednode.derisk.test.ts — SHARED-NODE WELD (the ONE unproven
 * integration piece before `assembleFeatureAligned`).
 *
 * The selective de-risk (`featureAssembler.selective.derisk.test.ts`) proved clean
 * bands + folding-spine constraints coexist in one `corridorPaveMulti` fill — but it
 * used SPATIALLY SEPARATED edges (free-interior anchors) to ISOLATE the weld. The
 * whole-wall assembler must weld a CLUSTER of edges that SHARE a graph junction node.
 *
 * ── MEASURED (this de-risk): banding right up to a shared node FAILS. ───────────────
 * Paving every clean incident edge as a band all the way to the node packs the bands
 * so tightly around it that adjacent bands' vertices land on each other's perimeter
 * edges → cdt2d SPLITS those perimeter constraints → the topological flood-fill leaks
 * across them → the whole interior fuses into one component whose representative lands
 * inside a band → 0 interior fill (the same node-too-tight class that refuted
 * `paveRidgeJunction`). ⇒ DO NOT band into the node.
 *
 * THE ROBUST DESIGN (proven here; what `assembleFeatureAligned` uses): leave a
 * node-neighborhood GAP (DEGREE-ADAPTIVE — `adaptiveGap`: r·sin(π/N) ≳ HALF_W+clearance,
 * so adjacent bands at the gap radius stay clear). Each clean edge is banded over
 * [gap … gap+BAND_LEN] only (its band is a DISJOINT hole — no perimeter packing). The
 * central junction region (radius ~GAP) is CDT-filled with ALL incident SPINES meeting
 * at ONE shared `jId` via the `junction` anchor (the proven STEP-2 path). Each banded
 * edge's CREST is continued from `jId` to its band by a short junction→snap-boundary
 * spine, so the crest is a continuous mesh edge through the node (NO serration). Folding
 * edges' whole spines run `jId` → free-interior.
 *
 * ── VERDICT (measured): GENERIC junction PROVEN; very-high-degree needs degree-reduction. ──
 *  - DEFAULT (PF_DERISK=1) selects the cleanest case (a TRIPLE — the GENERIC Voronoi
 *    vertex): watertight 0/0, crests followed, node shared, pct<10°=0.0%, aspect 4.1. GO.
 *  - PF_SHAREDNODE_HIGHDEG=1 selects the hardest real node (deg-15, a junction-MERGE
 *    artifact of clustered triples): still cracks (tJ≈49). PF_SHAREDNODE_NOBANDS=1 proves
 *    this is NOT band packing — pure-folding deg-15 (zero bands) ALSO cracks (tJ≈46): the
 *    central N-spine FAN itself is degenerate at high valence. ⇒ high-degree nodes need
 *    DEGREE-REDUCTION (split → triples; the conditioner's deferred `splitHighDegree`) — a
 *    lattice-scale concern (Step 5), NOT on the SFB-canary path (ridge crests, clean junctions).
 *
 * THE GATE (the DEFAULT, triple-node GO gate):
 *  - a junction cluster with >=1 clean band AND >=1 folding spine sharing the node;
 *  - corridorPaveMulti: inversionCount==0, unfillablePinches==[];
 *  - merged mesh nonManifoldEdges==0, tJunctions==0 (frame = open boundary);
 *  - every band-perimeter edge incidence==2 (all bands weld);
 *  - every spine feature-chain edge incidence==2 (crest FOLLOWED, incl. through J);
 *  - the node is ONE shared id: every spine's J-end == the minted jId;
 *  - NEGATIVE CONTROL: split a band-perimeter vertex band-side → tJunctions>0.
 *
 * CPU throwaway spike (real detector pipeline → heavy). Reuses only proven primitives;
 * no production code. Skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/featureAssembler.sharednode.derisk.test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import { conditionGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { ConditionGraphOptions, ConditionedGraph, NodeType } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { paveRidgeCornerSplit, footprintSelfCrossings } from './bandConstruct';
import type { RidgeResult } from './featureStrip';
import { corridorPaveMulti } from './corridorPave';
import type { FeatureChainInput, CorridorPaveMultiResult } from './corridorPave';
import { extractHoleBoundary } from './seamFill';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { QSCALE, quantizeRailUT } from './railKey';
import type { StationPoint } from './stations';

// ── Real-pipeline config (verbatim from the selective / junction de-risks) ──────

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

// ── Band / cluster parameters (feature-sized width — the chosen operating point) ─

const HALF_W = 0.6;
const EDGE_MM = 1.5;
const BAND_LEN = 6;    // band length beyond the gap (3D mm)
const GAP_MIN = 3.5;   // minimum node-neighborhood radius (CDT-filled)
const CLEARANCE = 2.5; // min flank-to-flank clearance between adjacent bands at the gap radius
const STUB_MAX = 26;   // max arm length built (must exceed gap+BAND_LEN at the highest degree)
const U_LO = 0.15, U_HI = 0.85, T_LO = 0.15, T_HI = 0.85;

/**
 * Degree-adaptive node-neighborhood radius. Bands begin at this radius; for them to stay
 * DISJOINT (no mutual perimeter-splitting — the deg-15 failure), adjacent bands (angular
 * spacing ~2π/N) must clear: r·sin(π/N) ≳ HALF_W + CLEARANCE/2. Higher valence → larger
 * CDT neighborhood, so the junction stays a clean CDT region and the bands never pack.
 */
function adaptiveGap(nArms: number): number {
  const n = Math.max(3, nArms);
  return Math.max(GAP_MIN, (2 * HALF_W + CLEARANCE) / (2 * Math.sin(Math.PI / n)));
}
const MAX_SCAN = 80;  // cap candidate nodes scanned (lazy — keep beforeAll fast)
const JKEY = 'J';     // single shared-junction key

function edgeKey(i: number, j: number): string { return i < j ? `${i}:${j}` : `${j}:${i}`; }
function utKey(u: number, t: number): string { return `${u}:${t}`; }
function incidence(indices: Uint32Array | number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) { if (i === j) continue; m.set(edgeKey(i, j), (m.get(edgeKey(i, j)) ?? 0) + 1); }
  }
  return m;
}
function seg3D(sampler: SurfaceSampler, a: StationPoint, b: StationPoint): number {
  const pa = sampler.position(a.u, a.t), pb = sampler.position(b.u, b.t);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

/** A sub-arc of a J-first polyline clipped to 3D arc-length [lenLo, lenHi] (interpolating ends). */
function clipArc(poly: ReadonlyArray<{ u: number; t: number }>, sampler: SurfaceSampler, lenLo: number, lenHi: number): StationPoint[] {
  const out: StationPoint[] = [];
  let len = 0;
  const emit = (p: { u: number; t: number }): void => { out.push({ u: p.u, t: p.t }); };
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i];
    const s = seg3D(sampler, a, b);
    if (s < 1e-9) continue;
    const lo = len, hi = len + s;
    // The portion of [lo,hi] inside [lenLo,lenHi] contributes points.
    if (hi >= lenLo && lo <= lenHi) {
      const fStart = Math.max(0, (lenLo - lo) / s);
      const fEnd = Math.min(1, (lenHi - lo) / s);
      if (out.length === 0) emit({ u: a.u + (b.u - a.u) * fStart, t: a.t + (b.t - a.t) * fStart });
      emit({ u: a.u + (b.u - a.u) * fEnd, t: a.t + (b.t - a.t) * fEnd });
    }
    len = hi;
    if (len >= lenHi) break;
  }
  return out;
}

/** Build a J-first arm polyline of `poly` clipped to ~STUB_MAX (interpolated), forcing the node vertex exact. */
function buildArm(poly: ReadonlyArray<{ u: number; t: number }>, jFirst: boolean, sampler: SurfaceSampler, J: StationPoint): StationPoint[] | null {
  const src = (jFirst ? poly : [...poly].reverse()).map((p) => ({ u: p.u, t: p.t }));
  src[0] = { u: J.u, t: J.t };
  const arm = clipArc(src, sampler, 0, STUB_MAX);
  if (arm.length >= 2) arm[0] = { u: J.u, t: J.t };
  return arm.length >= 2 ? arm : null;
}

/** Total turning angle of a (u,t) polyline (a curvature proxy for demotion choice). */
function turning(spine: StationPoint[]): number {
  let total = 0;
  for (let i = 1; i + 1 < spine.length; i++) {
    const ax = spine[i].u - spine[i - 1].u, ay = spine[i].t - spine[i - 1].t;
    const bx = spine[i + 1].u - spine[i].u, by = spine[i + 1].t - spine[i].t;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-12 || lb < 1e-12) continue;
    total += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  return total;
}

interface Arm {
  full: StationPoint[];       // [J … far] (the whole arm)
  nodeSpine: StationPoint[];   // [J … gap] (always present, ≥2 pts)
  band: RidgeResult | null;    // non-null ⇒ clean band over [gap … far]
  perimLocal: number[] | null; // band-local perimeter loop when band !== null
}

/** Classify an arm: gap-split at `gapMm`, then try to band [gap … gap+BAND_LEN] (clean ⇒ band; else folding). */
function classifyArm(full: StationPoint[], sampler: SurfaceSampler, gapMm: number): Arm | null {
  const nodeSpine = clipArc(full, sampler, 0, gapMm);
  if (nodeSpine.length >= 1) nodeSpine[0] = { u: full[0].u, t: full[0].t };
  if (nodeSpine.length < 2) return null;
  const bandSpine = clipArc(full, sampler, gapMm, gapMm + BAND_LEN);
  let band: RidgeResult | null = null;
  let perimLocal: number[] | null = null;
  if (!process.env.PF_SHAREDNODE_NOBANDS && bandSpine.length >= 2) {
    try {
      const b = paveRidgeCornerSplit(bandSpine, sampler, { widthMm: HALF_W, edgeMm: EDGE_MM });
      if (footprintSelfCrossings(b.mesh, b.vertexUT) === 0) {
        const bh = extractHoleBoundary({ indices: b.mesh.indices }, new Set<number>());
        if (bh.loops.length === 1) { band = b; perimLocal = bh.loops[0]; }
      }
    } catch { band = null; }
  }
  return { full, nodeSpine, band, perimLocal };
}

interface SharedNodeCase {
  nodeIdx: number; type: NodeType; degree: number; J: StationPoint;
  arms: Arm[]; nBands: number; nFolding: number;
}

interface SharedNodeBuild {
  found: SharedNodeCase | null;
  jId: number;
  bands: RidgeResult[];
  perims: number[][];
  bandNearCrestIds: number[]; // merged id of each band's near (gap) crest-end
  fill: CorridorPaveMultiResult;
  merged: Mesh3;
  frameSet: Set<number>;
  bandTriCount: number;
  sampler: SurfaceSampler;
}

function buildRectFrame(uLo: number, uHi: number, tLo: number, tHi: number): Array<[number, number]> {
  const snap = (x: number): number => Math.round(x * QSCALE) / QSCALE;
  const du = EDGE_MM / U_TO_MM, dt = EDGE_MM / T_TO_MM;
  const nU = Math.max(2, Math.ceil((uHi - uLo) / du));
  const nT = Math.max(2, Math.ceil((tHi - tLo) / dt));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < nU; i++) out.push([snap(uLo + ((uHi - uLo) * i) / nU), snap(tLo)]);
  for (let i = 0; i < nT; i++) out.push([snap(uHi), snap(tLo + ((tHi - tLo) * i) / nT)]);
  for (let i = 0; i < nU; i++) out.push([snap(uHi - ((uHi - uLo) * i) / nU), snap(tHi)]);
  for (let i = 0; i < nT; i++) out.push([snap(uLo), snap(tHi - ((tHi - tLo) * i) / nT)]);
  return out;
}

// Default: prefer LOW-degree (cleanest weld first). PF_SHAREDNODE_HIGHDEG=1 flips it to
// probe the hardest real case (highDegree-dominant Voronoi junctions).
const TYPE_RANK: Record<string, number> = process.env.PF_SHAREDNODE_HIGHDEG
  ? { highDegree: 0, reflex: 1, triple: 2 }
  : { triple: 0, reflex: 1, highDegree: 2 };
const DEG_DIR = process.env.PF_SHAREDNODE_HIGHDEG ? -1 : 1;

function selectSharedNode(cond: ConditionedGraph, sampler: SurfaceSampler): SharedNodeCase | null {
  const incident: Array<Array<{ ei: number; jFirst: boolean }>> = cond.nodes.map(() => []);
  cond.edges.forEach((e, ei) => {
    if (e.kind === 'loop') return;
    incident[e.endpoints[0]].push({ ei, jFirst: true });
    if (e.endpoints[1] !== e.endpoints[0]) incident[e.endpoints[1]].push({ ei, jFirst: false });
  });

  // Candidate junction nodes in the interior window, PREFER low-degree (cleanest weld first).
  const cands: number[] = [];
  for (let n = 0; n < cond.nodes.length; n++) {
    const type = cond.nodeTypes[n];
    if (type !== 'triple' && type !== 'reflex' && type !== 'highDegree') continue;
    const J = cond.nodes[n];
    if (J.u < U_LO || J.u > U_HI || J.t < T_LO || J.t > T_HI) continue;
    cands.push(n);
  }
  cands.sort((a, b) => (TYPE_RANK[cond.nodeTypes[a]] - TYPE_RANK[cond.nodeTypes[b]]) || DEG_DIR * (incident[a].length - incident[b].length));

  let scanned = 0;
  for (const n of cands) {
    if (scanned >= MAX_SCAN) break;
    scanned++;
    const J = cond.nodes[n];
    const fullArms: StationPoint[][] = [];
    for (const { ei, jFirst } of incident[n]) {
      const arm = buildArm(cond.edges[ei].polyline, jFirst, sampler, J);
      if (arm) fullArms.push(arm);
    }
    if (fullArms.length < 2) continue;

    const gapMm = adaptiveGap(fullArms.length);
    const arms = fullArms.map((a) => classifyArm(a, sampler, gapMm)).filter((a): a is Arm => a !== null);
    if (arms.length < 2) continue;
    let nBands = arms.filter((a) => a.band !== null).length;
    let nFolding = arms.length - nBands;
    if (process.env.PF_SHAREDNODE_NOBANDS) { // pure-folding probe: isolate the central N-spine fan
      if (nFolding >= 2) return { nodeIdx: n, type: cond.nodeTypes[n], degree: incident[n].length, J, arms, nBands, nFolding };
      continue;
    }
    if (nBands < 1) continue;

    // Deterministically exercise the band↔folding weld: if no folding arose, demote the
    // most-curved clean arm to a folding spine (documented — production is footprint-only).
    if (nFolding === 0 && nBands >= 2) {
      let worst = -1, worstTurn = -1;
      for (let i = 0; i < arms.length; i++) {
        if (arms[i].band === null) continue;
        const tu = turning(arms[i].full);
        if (tu > worstTurn) { worstTurn = tu; worst = i; }
      }
      if (worst >= 0) { arms[worst] = { ...arms[worst], band: null, perimLocal: null }; nBands--; nFolding++; }
    }

    if (nBands >= 1 && nFolding >= 1) {
      return { nodeIdx: n, type: cond.nodeTypes[n], degree: incident[n].length, J, arms, nBands, nFolding };
    }
  }
  return null;
}

function buildSharedNode(): SharedNodeBuild {
  const sampler = styleSampler(STYLE as Parameters<typeof styleSampler>[0], {}, DIMS);
  const raw = detectFeatures(sampler, { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(sampler) });
  const cond: ConditionedGraph = conditionGraph(raw, condOpts());
  const found = selectSharedNode(cond, sampler);

  const empty = (): SharedNodeBuild => ({
    found, jId: -1, bands: [], perims: [], bandNearCrestIds: [],
    fill: { vertexUT: [], existingCount: 0, triangles: [], featureChains: [], junctionIds: new Map(), inversionCount: 0, droppedCount: 0, unfillablePinches: [] },
    merged: { positions: new Float32Array(0), indices: new Uint32Array(0) }, frameSet: new Set(), bandTriCount: 0, sampler,
  });
  if (!found) return empty();

  // ── Merge band meshes by quantized (u,t) key (the production weld; bands are disjoint
  //    here so no collisions, but this is the real cross-band intern path). ──
  const keyToId = new Map<string, number>();
  const mergedUT: Array<[number, number]> = [];
  const internUT = (u: number, t: number): number => {
    const key = utKey(u, t);
    let id = keyToId.get(key);
    if (id === undefined) { id = mergedUT.length; mergedUT.push([u, t]); keyToId.set(key, id); }
    return id;
  };

  const bands: RidgeResult[] = [];
  const perims: number[][] = [];
  const bandNearCrestIds: number[] = [];
  const complementDir = new Map<string, [number, number]>();
  const bandTris: number[] = [];
  for (const arm of found.arms) {
    if (arm.band === null || arm.perimLocal === null) continue;
    const band = arm.band;
    const local2merged = band.vertexUT.map((p) => internUT(p[0], p[1]));
    for (let k = 0; k < band.mesh.indices.length; k++) bandTris.push(local2merged[band.mesh.indices[k]]);
    perims.push(arm.perimLocal.map((id) => local2merged[id]));
    bandNearCrestIds.push(local2merged[band.spineVertexIds[0]]); // gap-end crest (near the node)
    const bh = extractHoleBoundary({ indices: band.mesh.indices }, new Set<number>());
    for (const [, dir] of bh.complementDir) {
      const a = local2merged[dir[0]], b = local2merged[dir[1]];
      complementDir.set(edgeKey(a, b), [a, b]);
    }
    bands.push(band);
  }

  // ── Spines: ALL incident arms anchored at the SHARED node (junction@J). Clean arms
  //    contribute a SHORT node→band crest spine (end snaps to the band's near crest-end);
  //    folding arms contribute the WHOLE spine (end free-interior). ──
  const features: FeatureChainInput[] = [];
  for (const arm of found.arms) {
    if (arm.band !== null) {
      features.push({
        polyline: arm.nodeSpine.map((p) => ({ u: p.u, t: p.t })),
        start: { kind: 'junction' as const, junctionKey: JKEY },
        end: { kind: 'snap-boundary' as const }, // → the band's near crest-end (continuous crest)
      });
    } else {
      features.push({
        polyline: arm.full.map((p) => ({ u: p.u, t: p.t })),
        start: { kind: 'junction' as const, junctionKey: JKEY },
        end: { kind: 'free-interior' as const },
      });
    }
  }

  // ── LOCAL frame enclosing the whole cluster + margin. ──
  let uMin = Infinity, uMax = -Infinity, tMin = Infinity, tMax = -Infinity;
  for (const [u, t] of mergedUT) { uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
  for (const arm of found.arms) for (const p of arm.full) { uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); }
  const mU = (EDGE_MM * 2) / U_TO_MM, mT = (EDGE_MM * 2) / T_TO_MM;
  const frameUT = buildRectFrame(uMin - mU, uMax + mU, tMin - mT, tMax + mT);
  const frameBase = mergedUT.length;
  const frameIds = frameUT.map((_, i) => frameBase + i);
  const frameSet = new Set(frameIds);
  for (const p of frameUT) mergedUT.push(p);

  const boundary = { loops: [frameIds, ...perims], complementDir, vertexCount: mergedUT.length };
  const fill = corridorPaveMulti({ boundary, vertexUT: mergedUT, features, sampler });

  /* eslint-disable no-console */
  console.log(`[SHAREDNODE-DIAG] fill tris=${fill.triangles.length} inversion=${fill.inversionCount} dropped=${fill.droppedCount} pinches=${fill.unfillablePinches.length} chains=[${fill.featureChains.map((c) => c.length).join(',')}]`);
  /* eslint-enable no-console */

  // ── Merge band tris + fill tris over the fill's vertex table (existing ids preserved). ──
  const allUT = fill.vertexUT;
  const positions = new Float32Array(allUT.length * 3);
  for (let i = 0; i < allUT.length; i++) { const p = sampler.position(allUT[i][0], allUT[i][1]); positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2]; }
  const indices = new Uint32Array(bandTris.length + fill.triangles.length * 3);
  indices.set(bandTris, 0);
  let w = bandTris.length;
  for (const tri of fill.triangles) { indices[w++] = tri[0]; indices[w++] = tri[1]; indices[w++] = tri[2]; }

  const jId = fill.junctionIds.get(JKEY) ?? -1;
  return { found, jId, bands, perims, bandNearCrestIds, fill, merged: { positions, indices }, frameSet, bandTriCount: bandTris.length / 3, sampler };
}

let cached: SharedNodeBuild | undefined;
function getBuild(): SharedNodeBuild { if (!cached) cached = buildSharedNode(); return cached; }

// ── THE GATE ────────────────────────────────────────────────────────────────────

describe.skipIf(!process.env.PF_DERISK)('SHARED-NODE WELD — bands + folding spines welding at a real junction node', () => {
  beforeAll(() => { getBuild(); }, 180000);

  it('selects a junction cluster with >=1 clean band AND >=1 folding spine sharing the node', () => {
    const { found, bands } = getBuild();
    /* eslint-disable no-console */
    if (found) {
      console.log(`[SHAREDNODE] node=${found.nodeIdx} type=${found.type} degree=${found.degree} ` +
        `arms=${found.arms.length} bands=${found.nBands} folding=${found.nFolding} pavedBands=${bands.length}`);
    } else {
      console.log('[SHAREDNODE] NO suitable shared node found');
    }
    /* eslint-enable no-console */
    expect(found).not.toBeNull();
    expect(bands.length).toBeGreaterThanOrEqual(1);
    expect(found ? found.nFolding : 0).toBeGreaterThanOrEqual(1);
  });

  it('corridorPaveMulti fill: inversionCount == 0, unfillablePinches == []', () => {
    const { fill } = getBuild();
    expect(fill.triangles.length).toBeGreaterThan(0);
    expect(fill.inversionCount).toBe(0);
    expect(fill.unfillablePinches).toEqual([]);
  });

  it('GATE: merged mesh nonManifoldEdges == 0 and tJunctions == 0 (cluster welds at the node)', () => {
    const { merged, frameSet } = getBuild();
    const audit = auditWatertight(merged, { boundaryVertexIndices: frameSet });
    // eslint-disable-next-line no-console
    console.log('[SHAREDNODE] audit', JSON.stringify(audit));
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(audit.boundaryEdges).toBeGreaterThan(0);
  });

  it('every clean-band perimeter edge incidence == 2 (all bands weld)', () => {
    const { merged, perims } = getBuild();
    const inc = incidence(merged.indices);
    let cracked = 0, total = 0;
    for (const loop of perims) for (let i = 0; i < loop.length; i++) { total++; if (inc.get(edgeKey(loop[i], loop[(i + 1) % loop.length])) !== 2) cracked++; }
    expect(total).toBeGreaterThan(0);
    expect(cracked).toBe(0);
  });

  it('every spine feature-chain edge incidence == 2 (crest FOLLOWED, incl. through the node)', () => {
    const { merged, fill } = getBuild();
    const inc = incidence(merged.indices);
    let cracked = 0, total = 0;
    for (const chain of fill.featureChains) {
      for (let i = 0; i + 1 < chain.length; i++) { total++; if (inc.get(edgeKey(chain[i], chain[i + 1])) !== 2) cracked++; }
    }
    expect(total).toBeGreaterThan(0);
    expect(cracked).toBe(0);
  });

  it('the node is ONE shared vertex: every spine J-end == the minted jId', () => {
    const { jId, fill, bandNearCrestIds } = getBuild();
    /* eslint-disable no-console */
    expect(jId).toBeGreaterThanOrEqual(0);
    const headsAtJ = fill.featureChains.filter((ch) => ch.length > 0 && ch[0] === jId).length;
    // Crest-continuation: each clean arm's node→band spine TAIL lands on a band near crest-end.
    const crestSet = new Set(bandNearCrestIds);
    const tailsAtBand = fill.featureChains.filter((ch) => ch.length > 1 && crestSet.has(ch[ch.length - 1])).length;
    console.log(`[SHAREDNODE] jId=${jId} headsAtJ=${headsAtJ}/${fill.featureChains.length} crestContinuations=${tailsAtBand}/${bandNearCrestIds.length}`);
    /* eslint-enable no-console */
    expect(headsAtJ).toBe(fill.featureChains.length);
  });

  it('reports merged triangle quality (informational)', () => {
    const { merged, bandTriCount, fill } = getBuild();
    const q = triangleQuality3D(merged);
    // eslint-disable-next-line no-console
    console.log(`[SHAREDNODE] tris band=${bandTriCount} fill=${fill.triangles.length} ` +
      `aspectMax=${q.aspectMax.toFixed(2)} pct<10=${q.pctMinAngleBelow10.toFixed(1)}% p50=${q.minAngleP50.toFixed(1)}°`);
    expect(merged.indices.length % 3).toBe(0);
  });

  it('NEGATIVE CONTROL: splitting one band-perimeter vertex band-side → tJunctions > 0', () => {
    const { merged, perims, frameSet, bandTriCount } = getBuild();
    const loop = perims[0];
    const splitId = loop[Math.floor(loop.length / 2)];
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
