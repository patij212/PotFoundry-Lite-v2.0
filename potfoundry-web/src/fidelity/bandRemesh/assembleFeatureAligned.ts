/**
 * assembleFeatureAligned.ts — the feature-aligned whole-wall interior assembler.
 *
 * Generalizes the PROVEN shared-node weld (`featureAssembler.sharednode.derisk.test.ts`)
 * from one junction to a WHOLE conditioned feature graph, returning one watertight
 * UNROLLED-RECTANGLE interior mesh (periodicity + caps + inner wall deferred to the
 * production WatertightAssembly merge — STEP 4 / `mergeCorridorIntoAssembly`).
 *
 * The design (measured, proven on real Voronoi at a junction):
 *  - Every interior edge is partitioned CLEAN (band) vs FOLDING (spine):
 *      • a CLEAN edge is STRIP-PAVED as a band over its middle [gapA … len-gapB] — rows
 *        ∥ the ridge, premium flank quality (the cure for the 15.7% crest-band slivers).
 *        Its band is a DISJOINT hole; its crest is CONTINUED into each junction by a short
 *        junction→snap-boundary spine.
 *      • a FOLDING edge (offset folds on 3D relief) is NOT banded — its whole spine is a
 *        `corridorPaveMulti` feature constraint (the spine is always simple in (u,t); only
 *        the band OFFSET folds), so the crest is still a continuous mesh edge (no serration).
 *  - At each JUNCTION node, all incident spines (folding edges + banded-edge continuations)
 *    anchor at ONE shared id via the `junction` anchor; a DEGREE-ADAPTIVE GAP keeps bands
 *    out of the tight node neighborhood so they never pack/perimeter-split.
 *  - ONE `corridorPaveMulti` fills the featureless interior + welds everything by exact
 *    (u,t)/QSCALE key; band meshes are merged in by quantized-(u,t) key (the production weld).
 *
 * KNOWN LIMIT (measured): very-high-degree junctions (deg≳8, predominantly junction-MERGE
 * artifacts of clustered triples) crack at the central N-spine fan even with zero bands —
 * they need DEGREE-REDUCTION (split → triples; the conditioner's deferred `splitHighDegree`).
 * Generic Voronoi vertices and the SFB petal-crest canary are low-degree → unaffected.
 *
 * Pure CPU (analytic / CPU sampler), no GPU/DOM.
 *
 * @module fidelity/bandRemesh/assembleFeatureAligned
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { ConditionedGraph } from '../../renderers/webgpu/parametric/conforming/featureGraph/conditionGraph';
import { paveRidgeCornerSplit, footprintSelfCrossings } from './bandConstruct';
import type { RidgeResult } from './featureStrip';
import { corridorPaveMulti } from './corridorPave';
import type { FeatureChainInput, CorridorPaveMultiResult } from './corridorPave';
import { extractHoleBoundary } from './seamFill';
import type { HoleBoundary } from './seamFill';
import { QSCALE } from './railKey';
import type { StationPoint } from './stations';
import type { Mesh3 } from './audit';

/** Options for {@link assembleFeatureAligned}. */
export interface AssembleFeatureAlignedOptions {
  /** u→mm scale (circumference) — for the frame step and the interior window. */
  uToMm: number;
  /** t→mm scale (height). */
  tToMm: number;
  /** Band half-width (mm). Default 0.6 (feature-sized — the relief-limited operating point). */
  halfWidthMm?: number;
  /** Band / fill target edge length (mm). Default 1.5. */
  edgeMm?: number;
  /** Minimum band length (mm) past the gaps to bother strip-paving. Default 3. */
  bandLenMinMm?: number;
  /** Minimum node-neighborhood radius (mm). Default 3.5. */
  gapMinMm?: number;
  /** Min flank-to-flank clearance between adjacent bands at the gap radius (mm). Default 2.5. */
  clearanceMm?: number;
  /**
   * Restrict to a (u,t) interior window (drops u-seam / t-ring features — deferred to the
   * production merge). Default { uLo: 0.06, uHi: 0.94, tLo: 0.06, tHi: 0.94 }.
   */
  interiorWindow?: { uLo: number; uHi: number; tLo: number; tHi: number };
  /** Diagnostic: force every edge to the folding-spine path (no bands) — isolates the cdt2d limit. */
  disableBands?: boolean;
}

/** Per-node diagnostic of where watertight defects concentrate (degree → tJunction count). */
export interface AssembleDiagnostics {
  nodes: number;
  junctions: number;
  edgesTotal: number;
  edgesUsed: number;
  bands: number;
  foldingFeatures: number;
  closedLoops: number;
  fillTriangles: number;
  fillInversion: number;
  fillPinches: number;
  maxNodeDegree: number;
}

/** Result of {@link assembleFeatureAligned}. */
export interface AssembleFeatureAlignedResult {
  /** Merged band + fill interior mesh (3D positions, unrolled rectangle). */
  mesh: Mesh3;
  /** (u,t) per merged vertex id. */
  vertexUT: Array<[number, number]>;
  /** Each band's perimeter loop (merged ids) — every edge must weld count-2. */
  bandPerims: number[][];
  /** Each fill feature chain (merged ids) — every consecutive pair must weld count-2 (crest followed). */
  featureChains: number[][];
  /** The frame (open-boundary) vertex ids — pass to auditWatertight as boundaryVertexIndices. */
  frameVertexIds: Set<number>;
  /** Number of band triangles (the first span of mesh.indices). */
  bandTriCount: number;
  diagnostics: AssembleDiagnostics;
}

// ── Geometry helpers (shared with the de-risk) ────────────────────────────────────

function seg3D(sampler: SurfaceSampler, a: { u: number; t: number }, b: { u: number; t: number }): number {
  const pa = sampler.position(a.u, a.t), pb = sampler.position(b.u, b.t);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

/** Total 3D arc length of a (u,t) polyline. */
function arcLen3D(sampler: SurfaceSampler, poly: ReadonlyArray<{ u: number; t: number }>): number {
  let s = 0;
  for (let i = 1; i < poly.length; i++) s += seg3D(sampler, poly[i - 1], poly[i]);
  return s;
}

/** A sub-arc of a polyline clipped to 3D arc-length [lenLo, lenHi] (interpolating the ends). */
function clipArc(poly: ReadonlyArray<{ u: number; t: number }>, sampler: SurfaceSampler, lenLo: number, lenHi: number): StationPoint[] {
  const out: StationPoint[] = [];
  let len = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1], b = poly[i];
    const s = seg3D(sampler, a, b);
    if (s < 1e-9) continue;
    const lo = len, hi = len + s;
    if (hi >= lenLo && lo <= lenHi) {
      const fStart = Math.max(0, (lenLo - lo) / s);
      const fEnd = Math.min(1, (lenHi - lo) / s);
      if (out.length === 0) out.push({ u: a.u + (b.u - a.u) * fStart, t: a.t + (b.t - a.t) * fStart });
      out.push({ u: a.u + (b.u - a.u) * fEnd, t: a.t + (b.t - a.t) * fEnd });
    }
    len = hi;
    if (len >= lenHi) break;
  }
  return out;
}

/**
 * Degree-adaptive node-neighborhood radius (mm). Bands begin at this radius; for them to
 * stay DISJOINT (no perimeter-splitting at a junction), adjacent bands (angular spacing
 * ~2π/N) must clear: r·sin(π/N) ≳ halfWidth + clearance/2.
 */
function adaptiveGap(nArms: number, halfWidthMm: number, clearanceMm: number, gapMinMm: number): number {
  const n = Math.max(3, nArms);
  return Math.max(gapMinMm, (2 * halfWidthMm + clearanceMm) / (2 * Math.sin(Math.PI / n)));
}

function utKey(u: number, t: number): string { return `${u}:${t}`; }
function edgeKey(i: number, j: number): string { return i < j ? `${i}:${j}` : `${j}:${i}`; }

interface BandEntry { band: RidgeResult; perimLocal: number[]; }

/**
 * Try to strip-pave `bandSpine` as a clean band (simple footprint + single perimeter loop).
 * Returns null if it folds / is too short / has a non-simple footprint → caller treats the
 * edge as a folding spine instead.
 */
function tryBand(bandSpine: StationPoint[], sampler: SurfaceSampler, halfWidthMm: number, edgeMm: number): BandEntry | null {
  if (bandSpine.length < 2) return null;
  let band: RidgeResult;
  try { band = paveRidgeCornerSplit(bandSpine, sampler, { widthMm: halfWidthMm, edgeMm }); } catch { return null; }
  if (footprintSelfCrossings(band.mesh, band.vertexUT) !== 0) return null;
  let bh: HoleBoundary;
  try { bh = extractHoleBoundary({ indices: band.mesh.indices }, new Set<number>()); } catch { return null; }
  if (bh.loops.length !== 1) return null;
  return { band, perimLocal: bh.loops[0] };
}

/** Build the unrolled-rectangle frame loop (open boundary), subdivided ~ the band edge spacing. */
function buildFrame(win: { uLo: number; uHi: number; tLo: number; tHi: number }, edgeMm: number, uToMm: number, tToMm: number): Array<[number, number]> {
  const snap = (x: number): number => Math.round(x * QSCALE) / QSCALE;
  const du = edgeMm / uToMm, dt = edgeMm / tToMm;
  const nU = Math.max(2, Math.ceil((win.uHi - win.uLo) / du));
  const nT = Math.max(2, Math.ceil((win.tHi - win.tLo) / dt));
  const out: Array<[number, number]> = [];
  for (let i = 0; i < nU; i++) out.push([snap(win.uLo + ((win.uHi - win.uLo) * i) / nU), snap(win.tLo)]);
  for (let i = 0; i < nT; i++) out.push([snap(win.uHi), snap(win.tLo + ((win.tHi - win.tLo) * i) / nT)]);
  for (let i = 0; i < nU; i++) out.push([snap(win.uHi - ((win.uHi - win.uLo) * i) / nU), snap(win.tHi)]);
  for (let i = 0; i < nT; i++) out.push([snap(win.uLo), snap(win.tHi - ((win.tHi - win.tLo) * i) / nT)]);
  return out;
}

/**
 * Assemble a watertight, serration-free, feature-aligned interior mesh from a conditioned
 * feature graph: strip-pave clean edges as bands (premium flank quality), CDT-follow folding
 * edges + junctions, all welded in one `corridorPaveMulti` fill over an unrolled-rectangle
 * frame. Periodicity + caps + inner wall are deferred to the production merge.
 */
export function assembleFeatureAligned(
  sampler: SurfaceSampler,
  graph: ConditionedGraph,
  opts: AssembleFeatureAlignedOptions,
): AssembleFeatureAlignedResult {
  const halfWidthMm = opts.halfWidthMm ?? 0.6;
  const edgeMm = opts.edgeMm ?? 1.5;
  const bandLenMinMm = opts.bandLenMinMm ?? 3;
  const gapMinMm = opts.gapMinMm ?? 3.5;
  const clearanceMm = opts.clearanceMm ?? 2.5;
  const win = opts.interiorWindow ?? { uLo: 0.06, uHi: 0.94, tLo: 0.06, tHi: 0.94 };

  // ── Degree over the WHOLE graph (the junction structure). ──
  const degree = new Array<number>(graph.nodes.length).fill(0);
  for (const e of graph.edges) { degree[e.endpoints[0]]++; if (e.endpoints[1] !== e.endpoints[0]) degree[e.endpoints[1]]++; }
  const isJunction = (n: number): boolean => degree[n] >= 3;
  const junctionGap = new Map<number, number>();
  for (let n = 0; n < graph.nodes.length; n++) if (isJunction(n)) junctionGap.set(n, adaptiveGap(degree[n], halfWidthMm, clearanceMm, gapMinMm));

  const inWindow = (poly: ReadonlyArray<{ u: number; t: number }>): boolean => {
    for (const p of poly) if (p.u < win.uLo || p.u > win.uHi || p.t < win.tLo || p.t > win.tHi) return false;
    // Reject seam-crossing polylines (a Δu jump > 0.5 between samples — deferred to STEP 4).
    for (let i = 1; i < poly.length; i++) if (Math.abs(poly[i].u - poly[i - 1].u) > 0.5) return false;
    return true;
  };

  // ── Merge band meshes by quantized (u,t) key (the production weld). ──
  const keyToId = new Map<string, number>();
  const mergedUT: Array<[number, number]> = [];
  const internUT = (u: number, t: number): number => {
    const key = utKey(u, t);
    let id = keyToId.get(key);
    if (id === undefined) { id = mergedUT.length; mergedUT.push([u, t]); keyToId.set(key, id); }
    return id;
  };

  const bandPerims: number[][] = [];
  const complementDir = new Map<string, [number, number]>();
  const bandTris: number[] = [];
  const features: FeatureChainInput[] = [];
  let nBands = 0, nFolding = 0, nClosed = 0, edgesUsed = 0;

  const anchorFor = (node: number): FeatureChainInput['start'] =>
    isJunction(node) ? { kind: 'junction', junctionKey: `n${node}` } : { kind: 'free-interior' };

  const addBand = (entry: BandEntry): void => {
    const local2merged = entry.band.vertexUT.map((p) => internUT(p[0], p[1]));
    for (let k = 0; k < entry.band.mesh.indices.length; k++) bandTris.push(local2merged[entry.band.mesh.indices[k]]);
    bandPerims.push(entry.perimLocal.map((id) => local2merged[id]));
    const bh = extractHoleBoundary({ indices: entry.band.mesh.indices }, new Set<number>());
    for (const [, dir] of bh.complementDir) { const a = local2merged[dir[0]], b = local2merged[dir[1]]; complementDir.set(edgeKey(a, b), [a, b]); }
    nBands++;
  };

  for (const e of graph.edges) {
    if (!inWindow(e.polyline)) continue;
    if (e.kind === 'loop') {
      features.push({ polyline: e.polyline.map((p) => ({ u: p.u, t: p.t })), closed: true });
      nClosed++; edgesUsed++;
      continue;
    }
    const A = e.endpoints[0], B = e.endpoints[1];
    // Force the polyline endpoints exactly onto the node positions (the shared-vertex anchors).
    const poly: StationPoint[] = e.polyline.map((p) => ({ u: p.u, t: p.t }));
    poly[0] = { u: graph.nodes[A].u, t: graph.nodes[A].t };
    poly[poly.length - 1] = { u: graph.nodes[B].u, t: graph.nodes[B].t };

    const gapA = junctionGap.get(A) ?? 0;
    const gapB = junctionGap.get(B) ?? 0;
    const len = arcLen3D(sampler, poly);

    // BAND the middle [gapA … len-gapB]; FOLD the whole edge if too short to band.
    let entry: BandEntry | null = null;
    if (!opts.disableBands && len > gapA + gapB + bandLenMinMm) {
      entry = tryBand(clipArc(poly, sampler, gapA, len - gapB), sampler, halfWidthMm, edgeMm);
    }

    if (entry) {
      addBand(entry);
      // CREST-CONTINUATION: connect each junction to its band end via a short
      // junction→snap-boundary spine (snap-boundary auto-finds the band's near crest-end),
      // so the crest is a continuous mesh edge through the node (no serration).
      if (gapA > 0) {
        const nodeSpine = clipArc(poly, sampler, 0, gapA);
        if (nodeSpine.length >= 2) { nodeSpine[0] = { u: poly[0].u, t: poly[0].t }; features.push({ polyline: nodeSpine, start: anchorFor(A), end: { kind: 'snap-boundary' } }); }
      }
      if (gapB > 0) {
        const nodeSpine = clipArc(poly, sampler, len - gapB, len);
        if (nodeSpine.length >= 2) { nodeSpine[nodeSpine.length - 1] = { u: poly[poly.length - 1].u, t: poly[poly.length - 1].t }; features.push({ polyline: nodeSpine, start: { kind: 'snap-boundary' }, end: anchorFor(B) }); }
      }
    } else {
      features.push({ polyline: poly.map((p) => ({ u: p.u, t: p.t })), start: anchorFor(A), end: anchorFor(B) });
      nFolding++;
    }
    edgesUsed++;
  }

  // ── Frame (unrolled rectangle, open boundary) + one corridorPaveMulti fill. ──
  const frameUT = buildFrame(win, edgeMm, opts.uToMm, opts.tToMm);
  const frameBase = mergedUT.length;
  const frameIds = frameUT.map((_, i) => frameBase + i);
  const frameVertexIds = new Set(frameIds);
  for (const p of frameUT) mergedUT.push(p);

  const boundary: HoleBoundary = { loops: [frameIds, ...bandPerims], complementDir, vertexCount: mergedUT.length };
  const fill: CorridorPaveMultiResult = corridorPaveMulti({ boundary, vertexUT: mergedUT, features, sampler });

  // ── Merge band tris + fill tris over the fill's vertex table (existing ids preserved). ──
  const allUT = fill.vertexUT;
  const positions = new Float32Array(allUT.length * 3);
  for (let i = 0; i < allUT.length; i++) { const p = sampler.position(allUT[i][0], allUT[i][1]); positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2]; }
  const indices = new Uint32Array(bandTris.length + fill.triangles.length * 3);
  indices.set(bandTris, 0);
  let w = bandTris.length;
  for (const tri of fill.triangles) { indices[w++] = tri[0]; indices[w++] = tri[1]; indices[w++] = tri[2]; }

  let maxDeg = 0;
  for (let n = 0; n < graph.nodes.length; n++) if (degree[n] > maxDeg) maxDeg = degree[n];

  return {
    mesh: { positions, indices },
    vertexUT: allUT,
    bandPerims,
    featureChains: fill.featureChains,
    frameVertexIds,
    bandTriCount: bandTris.length / 3,
    diagnostics: {
      nodes: graph.nodes.length,
      junctions: [...junctionGap.keys()].length,
      edgesTotal: graph.edges.length,
      edgesUsed,
      bands: nBands,
      foldingFeatures: nFolding,
      closedLoops: nClosed,
      fillTriangles: fill.triangles.length,
      fillInversion: fill.inversionCount,
      fillPinches: fill.unfillablePinches.length,
      maxNodeDegree: maxDeg,
    },
  };
}
