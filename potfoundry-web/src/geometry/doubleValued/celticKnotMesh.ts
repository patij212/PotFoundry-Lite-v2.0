// celticKnotMesh.ts — Milestone 2 deliverable entry of the snaking-C0 P3 mesher.
//
// Wires P1's declared CelticKnot cliff complex + the exact analytic surface into the
// general `buildDoubleValuedMesh` core to mesh ONE real snaking ribbon strand (its two
// ±strandWidth cliff edges + the ribbon sheet + the two background sheets + the two
// vertical double-valued walls), then verifies it is watertight and chords the true
// analytic surface < 0.01mm after refinement. No strand crossings / Y-junctions (M3).
//
// Isolation strategy: we mesh a single (column, strand) over a crossing-free (u,t)
// window found numerically — expanded around the strand's outward peak while every
// OTHER declared strand stays clear of the domain u-band — so the surface inside the
// window is a clean single-strand field (raised ribbon / depressed background) with no
// second cliff the mesh cannot conform to.

import { buildCelticKnotCliffComplex } from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';
import type {
  CelticKnotCliffParams,
  CliffDims,
  CliffJunction,
  CliffSegment,
} from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';
import { buildAnalyticRadiusFn } from '../analyticRadius';
import { DEFAULT_CELTIC_KNOT, type StyleOptions } from '../types';
import { buildDoubleValuedMesh } from './doubleValuedMesh';
import { clipCliffsToVisibleEnvelope, type VisibleEnvelope } from './visibleEnvelope';
import { toMeshData } from './mesh';
import { orientMeshForSTL } from '../stlExport';
import {
  auditManifold,
  certifyAgainstTrueSurface,
  chordToSurface,
  facetChordToTrueSurface,
  regionRadiusConsistency,
} from './verify';
import type {
  BuildStats,
  CreaseLike,
  DomainWindow,
  JunctionLevelReport,
  JunLike,
  Mesh,
  MeshReport,
  RefTri,
  SegLike,
  SurfaceCertification,
  SurfaceRadiusFn,
  Vec3,
  WallRecord,
} from './types';
import type { MeshData } from '../types';

const TAU = 2 * Math.PI;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/**
 * u-space nudge used by the independent certifier for the cliff one-sided limit and the
 * sheet straddle guard. Small enough that the ribbon-profile one-sided limit `surface(u∓δ)`
 * overshoots the exact edge value r0 by only ~1e-3mm (≪ the 0.01mm gate and ≪ the 0.6mm
 * radial jump a swapped label would produce), yet ≫ float noise so the cliff branch is
 * unambiguous.
 */
const ONE_SIDED_DELTA = 1e-6;

export interface CelticKnotMeshDims {
  H: number;
  Rb: number;
  Rt: number;
  expn?: number;
}
export interface CelticKnotMeshOptions {
  baseGridU: number;
  baseGridT: number;
  chordTolMm: number;
  maxRefinePasses: number;
}

/**
 * Mesh one isolated snaking CelticKnot ribbon strand as a watertight double-valued-wall
 * patch and verify it against the exact analytic surface.
 */
export function buildCelticKnotDoubleValuedMesh(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotMeshOptions,
): { mesh: MeshData; report: MeshReport } {
  const H = dims.H;
  const expn = dims.expn ?? 1;
  const merged = { ...DEFAULT_CELTIC_KNOT, ...styleOptions };

  // ---- params, derived exactly as celticKnotOuterWallTarget.parameters() ----
  const params: CelticKnotCliffParams = {
    columnCount: Math.max(1, Math.floor(merged.ckScale)),
    strandWidth: merged.ckWidth * 0.15,
    strandCount: Math.max(2, Math.min(8, Math.floor(merged.ckStrands + 0.5))),
    tightness: Math.max(0.5, merged.ckTwist + 0.5),
    relief: merged.ckRelief,
    gap: merged.ckGap,
    roundness: merged.ckRoundness,
  };
  const cliffDims: CliffDims = { H, Rb: dims.Rb, Rt: dims.Rt, expn };
  const complex = buildCelticKnotCliffComplex(params, cliffDims);

  // exact analytic surface (theta,z) -> r, wrapped to the mesher's normalized (u,t).
  const rA = buildAnalyticRadiusFn('CelticKnot', styleOptions, { H, Rb: dims.Rb, Rt: dims.Rt, expn });
  const surface: SurfaceRadiusFn = (u, t) => rA(TAU * u, t * H);

  // ---- pick + isolate one strand ----
  const CHOSEN_COLUMN = 0;
  const CHOSEN_STRAND = 0;
  const ribbonSegs = complex.segments.filter((s) => s.kind === 'ribbon-background');
  const chosen = ribbonSegs.filter((s) => s.column === CHOSEN_COLUMN && s.strand === CHOSEN_STRAND);
  const others = ribbonSegs.filter((s) => !(s.column === CHOSEN_COLUMN && s.strand === CHOSEN_STRAND));
  if (chosen.length !== 2) {
    throw new Error(`expected the chosen strand to have 2 ribbon edges, got ${chosen.length}`);
  }
  const [plusSeg, minusSeg] = chosen;

  const window = isolateWindow(plusSeg, minusSeg, others);
  const domain: DomainWindow = window.domain;

  const plusAdapted = adaptSegment(plusSeg, window);
  const minusAdapted = adaptSegment(minusSeg, window);

  // Structure the thin snaking ribbon with ISO-FRACTION crease lines across it (constant
  // fraction between the two cliff edges, snaking along t). These force the CDT into clean
  // structured strips (scattered seeds + Delaunay slivered the anisotropic ridge and its
  // chord bounced under refinement). The fraction f=0.5 line is the centerline: the relief
  // profile is |localU-centerline|, so the crest is a SHARP C0 ridge that MUST be a mesh
  // edge (a straddling triangle would leave ~half-relief chord no refinement can remove).
  const ACROSS = 10; // strips across the ribbon
  const creaseAtFrac = (f: number): CreaseLike => ({
    tRange: [window.domain.tLo, window.domain.tHi],
    at: (s: number) => {
      const pu = plusAdapted.at(s);
      const mu = minusAdapted.at(s);
      return { u: mu.u + (pu.u - mu.u) * f, t: pu.t };
    },
  });
  const makeCreases = (n: number): CreaseLike[] => {
    const cs: CreaseLike[] = [];
    for (let k = 1; k < n; k += 1) cs.push(creaseAtFrac(k / n)); // exclude the cliffs (f=0,1)
    return cs;
  };
  const adapted = { segments: [plusAdapted, minusAdapted], junctions: [] as [], creases: makeCreases(ACROSS) };

  // Reference soup that CONFORMS to every sharp feature (both cliffs, both lips, the ridge
  // apex): a FINE run of the same structured mesher (dense strips + walls). A uniform-grid
  // soup cannot represent the cliff or apex and fabricates a ~0.03-0.05mm false floor for
  // any correct mesh point sitting on those edges. Used for the refine metric AND the report.
  // Moderate density: conformance (strips fold at the cliffs/apex) removes the sharp-feature
  // floor; a few-times-finer-than-the-test mesh keeps its own smooth floor well under tol
  // without an expensive CDT.
  const refMesh = buildDoubleValuedMesh(
    { segments: [plusAdapted, minusAdapted], junctions: [] as [], creases: makeCreases(30) },
    surface,
    { H },
    { baseGridU: 40, baseGridT: 110, chordTolMm: 1, maxRefinePasses: 0, domain },
  );
  const refTris = meshToRefTris(refMesh);

  // ---- build (with refinement) ----
  const innerTol = opts.chordTolMm * 0.5; // refine tighter than the report gate for margin
  const stats: BuildStats = {
    refinePasses: 0,
    addedSheetPoints: 0,
    splitCliffEdges: 0,
    unwalledCliffEdges: 0,
    maxAnalyticChordMm: 0,
    pointCapHit: 0,
    voteFreeRegions: 0,
    tieCliffRegions: 0,
  };
  const mesh = buildDoubleValuedMesh(
    adapted,
    surface,
    { H },
    {
      baseGridU: opts.baseGridU,
      baseGridT: opts.baseGridT,
      chordTolMm: innerTol,
      maxRefinePasses: opts.maxRefinePasses,
      domain,
      refSoup: refTris,
    },
    stats,
  );

  // ---- verify: manifold + chord against the conforming reference soup ----
  const audit = auditManifold(mesh);
  const chord = chordToSurface(mesh, refTris);

  // ---- INDEPENDENT fidelity certification (does NOT go through the region classifier) ----
  // The chord above is a valid facet/interpolation bound GIVEN a correct classifier, but it
  // cannot certify the classifier itself: a swapped ribbon/background lip hides inside the
  // wall ruled-face. `certifyAgainstTrueSurface` pins every vertex to the analytic ground
  // truth `surface` — sheet vertices to `surface(u,t)`, cliff vertices to the ONE-SIDED limit
  // taken from INSIDE their own region (direction read from mesh geometry, not the label).
  const cliffLocusDistance = (u: number, t: number): number => {
    const s = clamp01((t - domain.tLo) / (domain.tHi - domain.tLo));
    const dPlus = Math.abs(u - plusAdapted.at(s).u);
    const dMinus = Math.abs(u - minusAdapted.at(s).u);
    return dPlus < dMinus ? dPlus : dMinus;
  };
  // Normalized-u of cliff segment `seg` at height t (t is linear in s over the window). The
  // segment order matches `adapted.segments` below: 0 = plus edge, 1 = minus edge. The
  // certifier uses this to test each neighbour's side against the cliff curve at the
  // NEIGHBOUR's own t — snake-robust, unlike comparing bare u to the cliff vertex's u (the
  // snaking ribbon shifts in u with t, so a genuine ribbon neighbour a row away can sit at
  // smaller u than the cliff vertex).
  const adaptedSegs = [plusAdapted, minusAdapted];
  const locusUAt = (seg: number, t: number): number => {
    const s = clamp01((t - domain.tLo) / (domain.tHi - domain.tLo));
    return adaptedSegs[seg].at(s).u;
  };
  const cert = certifyAgainstTrueSurface(mesh, surface, cliffLocusDistance, locusUAt, ONE_SIDED_DELTA);
  const regionStats = regionRadiusConsistency(mesh);
  const certification: SurfaceCertification = {
    maxSheetDevMm: cert.maxSheetDevMm,
    maxCliffDevMm: cert.maxCliffDevMm,
    sheetVertsChecked: cert.sheetVertsChecked,
    cliffVertsCertified: cert.cliffVertsCertified,
    cliffVertsSkipped: cert.cliffVertsSkipped,
    minRibbonMeanRadiusMm: regionStats.minRibbonMeanRadiusMm,
    maxBackgroundMeanRadiusMm: regionStats.maxBackgroundMeanRadiusMm,
    ribbonRegionCount: regionStats.ribbonRegionCount,
    backgroundRegionCount: regionStats.backgroundRegionCount,
  };

  const md = toMeshData(mesh);
  const report: MeshReport = {
    vertexCount: md.vertexCount,
    triangleCount: md.triangleCount,
    nonManifold: audit.nonManifold,
    boundary: audit.boundary,
    cliffBoundary: audit.cliffBoundary,
    boundaryNonRim: audit.boundaryNonRim,
    maxChordMm: chord.maxMm,
    rmsChordMm: chord.rmsMm,
    refinePasses: stats.refinePasses,
    certification,
    junctionCount: 0, // M2 isolates a single strand — no crossings
    junctions: [],
    occlusionWallCount: 0, // M2 supplies no styleRadius ⇒ no declared occlusion segments
    occlusionWallLoci: 0,
    minOcclusionRaiseMm: 0,
  };
  return { mesh: md, report };
}

// ---------------------------------------------------------------------------
// Isolation window: a crossing-free (u,t) rectangle around one strand.
// ---------------------------------------------------------------------------

interface Window {
  domain: DomainWindow;
  tPeak: number;
}

/** Normalized u (=theta/TAU) of a P1 segment at global height `t`. */
function uNormAt(seg: CliffSegment, t: number): number {
  const s = (t - seg.tRange[0]) / (seg.tRange[1] - seg.tRange[0]);
  return seg.at(s).u / TAU;
}

function isolateWindow(plusSeg: CliffSegment, minusSeg: CliffSegment, others: readonly CliffSegment[]): Window {
  const T0 = plusSeg.tRange[0];
  const T1 = plusSeg.tRange[1];
  const uc = (t: number): number => (uNormAt(plusSeg, t) + uNormAt(minusSeg, t)) / 2;
  const half = (t: number): number => Math.abs(uNormAt(plusSeg, t) - uNormAt(minusSeg, t)) / 2;

  // strand's outward peak (max |uc - domain-mean|); scan deterministically.
  const N = 2000;
  let tPeak = T0;
  let best = -Infinity;
  const mid = 0.5 * (uc(T0) + uc(T1));
  for (let i = 0; i <= N; i += 1) {
    const t = T0 + ((T1 - T0) * i) / N;
    const score = Math.abs(uc(t) - mid);
    if (score > best) {
      best = score;
      tPeak = t;
    }
  }

  const ribbonHalf = half(tPeak);
  const bgMargin = 2 * ribbonHalf; // background band on each side of the ribbon
  const guard = 3 * ribbonHalf; // keep every other strand this far beyond the domain edge
  const bandHalf = ribbonHalf + bgMargin + guard;
  const maxHalfT = 0.1; // cap the window so the patch stays a tractable size

  const isolated = (t: number): boolean => {
    const c = uc(t);
    for (const o of others) if (Math.abs(uNormAt(o, t) - c) <= bandHalf) return false;
    return true;
  };

  const step = (T1 - T0) / N;
  let tLo = tPeak;
  let tHi = tPeak;
  while (tLo - step > T0 && tPeak - (tLo - step) <= maxHalfT && isolated(tLo - step)) tLo -= step;
  while (tHi + step < T1 && tHi + step - tPeak <= maxHalfT && isolated(tHi + step)) tHi += step;

  let uMin = Infinity;
  let uMax = -Infinity;
  for (let i = 0; i <= N; i += 1) {
    const t = tLo + ((tHi - tLo) * i) / N;
    const c = uc(t);
    const h = half(t) + bgMargin;
    if (c - h < uMin) uMin = c - h;
    if (c + h > uMax) uMax = c + h;
  }
  return { domain: { uMin, uMax, tLo, tHi }, tPeak };
}

/**
 * Clip a P1 segment to the window and convert its theta to normalized u. m1 (P3b): the window is
 * just the explicit `[tLo,tHi]` sub-range of {@link adaptSegmentToRange} — this delegates so the
 * clip/convert body lives in ONE place (byte-identical: same `tLo,tHi` from `w.domain`).
 */
function adaptSegment(seg: CliffSegment, w: Window): SegLike {
  return adaptSegmentToRange(seg, w.domain.tLo, w.domain.tHi);
}

/**
 * Clip a P1 segment to an EXPLICIT t-sub-range [tLo,tHi] (T2's visible-envelope arcs), converting its
 * theta to normalized u. Like {@link adaptSegment} but the arc spans only the given sub-interval, so
 * the segment's `tRange`/`at(s)` parameterize that sub-arc — the mesher's junction snapping then sorts
 * a junction sample by the arc's OWN fraction and the wall/pinch terminate the clipped edge cleanly.
 */
function adaptSegmentToRange(seg: CliffSegment, tLo: number, tHi: number): SegLike {
  const origS = (t: number): number => (t - seg.tRange[0]) / (seg.tRange[1] - seg.tRange[0]);
  return {
    tRange: [tLo, tHi],
    at: (s: number) => {
      const t = tLo + (tHi - tLo) * clamp01(s);
      const o = seg.at(origS(t));
      return { u: o.u / TAU, t: o.t };
    },
    lipsAt: (s: number) => {
      const t = tLo + (tHi - tLo) * clamp01(s);
      return seg.lipsAt(origS(t));
    },
  };
}

/**
 * P3b I2 — the SHARED clip-arc construction + junction binding used by BOTH clipped-envelope paths:
 * the single-crossing T2 path (`meshColumnCrossing` withClip) and the full-pot T3 path
 * (`buildCelticKnotFullPotMesh` clip). Both clip each ribbon↔background cliff to its visible
 * (non-occluded) t-sub-arcs, SNAP every non-rim arc end onto its declared crossing junction (so the
 * clipped arc terminates ON the crossing the M3 pinch closes), and BIND each in-band junction to the
 * arcs that reach it. The two callers differed ONLY by the strand-key scope (single column vs all
 * columns) and T2's extra far-strand `overlapsWindowU` drop — unified here into the always-column-keyed
 * form (single-column T2 is a no-op subset of it) plus an optional `arcFilter`. Behavior-preserving:
 * the emitted `adapted`/`adaptedId`/`junctions` are byte-identical to the two prior inline copies, and
 * the tuned tolerances (`SNAP_T`, `JBIND`, the `1e-3` min-arc drop) now live in ONE place (m4 bound).
 */
function buildClippedConstraints(
  env: VisibleEnvelope,
  ribbonSegs: readonly CliffSegment[],
  junctionList: readonly CliffJunction[],
  domain: DomainWindow,
  arcFilter?: (arcSeg: SegLike) => boolean,
): {
  adapted: SegLike[];
  adaptedId: Array<{ column: number; strand: number; side: number }>;
  junctions: JunLike[];
} {
  const adapted: SegLike[] = [];
  const adaptedId: Array<{ column: number; strand: number; side: number }> = [];
  const arcRange: Array<[number, number]> = [];
  const junctions: JunLike[] = [];

  // Per (column,strand,side): the t of every incident crossing junction (its occlusion boundaries).
  // An arc end that abuts an occlusion boundary is SNAPPED exactly onto its junction t, so the clipped
  // arc terminates ON the crossing the pinch closes (the endpoint base sample is then upgraded in place
  // to the junction's shared pinch vertex by `buildDoubleValuedMesh`).
  const keyOf = (column: number, strand: number, side: number): string => `${column}:${strand}:${side}`;
  const incidentJt = new Map<string, number[]>();
  for (const j of junctionList) {
    for (const inc of j.incident) {
      const key = keyOf(j.column, inc.strand, inc.side);
      const arr = incidentJt.get(key) ?? [];
      arr.push(j.t);
      incidentJt.set(key, arr);
    }
  }
  // The clip's occlusion-boundary t and its crossing junction's t agree to ~1e-4; snap within a
  // tolerance ≪ the occluded gap (~0.007 at DEFAULT) so an arc end never snaps across the diamond.
  const SNAP_T = 3e-3;
  const snapEnd = (column: number, strand: number, side: number, t: number): number => {
    let best = t;
    let bestD = SNAP_T;
    for (const jt of incidentJt.get(keyOf(column, strand, side)) ?? []) {
      const d = Math.abs(jt - t);
      if (d < bestD) {
        bestD = d;
        best = jt;
      }
    }
    return best;
  };
  // t-range of each adapted arc, parallel to `adapted`, so a junction binds to the arc that reaches it
  // (an under-strand edge has several visible arcs; the over-strand one spans the diamond).
  for (const arc of env.visibleCliffs) {
    const seg = ribbonSegs.find((s) => s.column === arc.column && s.strand === arc.strand && s.side === arc.side);
    if (!seg) continue;
    let lo = Math.max(arc.tRange[0], domain.tLo);
    let hi = Math.min(arc.tRange[1], domain.tHi);
    // A non-rim end is an occlusion boundary ⇒ snap it onto its crossing junction; a t-rim end stays.
    if (lo > domain.tLo + 1e-9) lo = snapEnd(arc.column, arc.strand, arc.side, lo);
    if (hi < domain.tHi - 1e-9) hi = snapEnd(arc.column, arc.strand, arc.side, hi);
    if (hi - lo < 1e-3) continue; // sub-arc too short to mesh meaningfully
    const arcSeg = adaptSegmentToRange(seg, lo, hi);
    if (arcFilter && !arcFilter(arcSeg)) continue; // far strand not participating in this crossing (T2)
    adapted.push(arcSeg);
    adaptedId.push({ column: arc.column, strand: arc.strand, side: arc.side });
    arcRange.push([lo, hi]);
  }
  // Bind an incident (column,strand,side) at height t to the adapted arc that reaches t. Arc ends now
  // sit ON the junctions, so a tiny tolerance suffices; another arc of the same edge is ≫ that away.
  const JBIND = 1e-4;
  const arcIndexAt = (column: number, strand: number, side: number, t: number): number => {
    let best = -1;
    let bestSlack = Infinity;
    for (let i = 0; i < adaptedId.length; i += 1) {
      const id = adaptedId[i];
      if (id.column !== column || id.strand !== strand || id.side !== side) continue;
      const [lo, hi] = arcRange[i];
      const slack = Math.max(0, lo - t) + Math.max(0, t - hi); // 0 when t is inside (endpoints incl.)
      if (slack <= JBIND && slack < bestSlack) {
        bestSlack = slack;
        best = i;
      }
    }
    return best;
  };
  for (const j of junctionList) {
    if (j.t < domain.tLo || j.t > domain.tHi) continue;
    const segs = j.incident.map((inc) => arcIndexAt(j.column, inc.strand, inc.side, j.t)).filter((i) => i >= 0);
    if (segs.length < 2) continue; // both incident edges must reach the junction
    junctions.push({ u: j.u / TAU, t: j.t, pinch: { upper: j.pinch.upper, lower: j.pinch.lower }, segs });
  }
  return { adapted, adaptedId, junctions };
}

/** Flatten a built mesh into a reference triangle soup (3D corners per face). */
function meshToRefTris(mesh: { positions: number[]; triangles: number[] }): RefTri[] {
  const p = mesh.positions;
  const vert = (i: number): Vec3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  const out: RefTri[] = [];
  const tri = mesh.triangles;
  for (let i = 0; i < tri.length; i += 3) out.push([vert(tri[i]), vert(tri[i + 1]), vert(tri[i + 2])]);
  return out;
}

// ===========================================================================
// Milestone 3: the FULL single-column complex — MULTIPLE strands whose ribbon
// edges CROSS, with the watertight 3-sheet Y-junction pinch at every crossing.
// ===========================================================================

/**
 * Mesh a window around ONE genuine strand crossing of the full single-column CelticKnot
 * complex (its overlap diamond + the four corner junctions), emitting the watertight
 * Y-junction pinch at every crossing, and verify it against the exact analytic surface.
 *
 * Feeds the FULL complex — all strands, their crossings, and the declared `junctions`. At each
 * junction several cliff curves meet, so the general per-region split would emit a non-manifold
 * FAN; instead the mesher pinches every incident sheet + wall to the two shared `pinch` vertices
 * (r0 / r0−jump) by radius level (the 55→…→2 collapse). On the overlap-diamond sides the surface
 * is z-buffer OCCLUDED, so cliff vertices are lifted to the true one-sided analytic limit (the
 * occluded raised neighbour), not the naive r0 lip — which both makes the wall span the real
 * occlusion step and keeps the independent certifier ~0. This entry supplies NO `styleRadius`,
 * so P1 declares no `kind:'occlusion'` segments and `occlusionWallCount` is 0 (that is M4).
 */
export function buildCelticKnotColumnCrossingMesh(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotMeshOptions,
): { mesh: MeshData; report: MeshReport } {
  return meshColumnCrossing(styleOptions, dims, opts, false);
}

/**
 * Milestone 4: the same single-column crossing mesh, now WITH the internal occlusion walls
 * (the ribbon-over-ribbon z-buffer step) declared and certified.
 *
 * RECONCILIATION (measured before implementing — see the M4 header in celticKnotMesh.test.ts):
 * a declared `kind:'occlusion'` segment is EXACTLY co-located with an existing ribbon-background
 * cliff edge — it is a sub-arc of that edge, inside the overlap diamond. Feeding those segments
 * as a SECOND CDT constraint chain cracks the mesh (overlapping collinear constraints ⇒
 * nonManifold 1, boundaryNonRim 257). The ribbon-background edge's OWN one-sided-limit wall,
 * however, already IS the occlusion curtain: inside the diamond its outward one-sided limit is
 * the raised, z-buffer-occluding under-strand surface, so its wall already steps r0 → raised-under,
 * watertight. So occlusion is represented EXACTLY ONCE (by that wall). This entry supplies the
 * analytic `styleRadius` so P1 emits the declared occlusion segments, meshes the identical
 * watertight M3-path complex, and uses those segments ONLY to IDENTIFY + count which ribbon-
 * background walls are occlusion curtains (raised lower rail) — it adds no second wall. The
 * occlusion rails are ordinary cliff split-vertices, so the existing one-sided-limit certifier
 * already certifies them against the true raised under surface (< 0.01mm).
 */
export function buildCelticKnotOcclusionMesh(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotMeshOptions,
): { mesh: MeshData; report: MeshReport } {
  return meshColumnCrossing(styleOptions, dims, opts, true);
}

/**
 * Milestone 6a (LOAD-BEARING PROOF): the single-column crossing mesh at the CORNERED-CREST default
 * (ckRoundness = 0.5), with each ribbon's crest crease carried THROUGH the overlap diamond by
 * crest-crossing planarization. Where M3/M4 used the smooth crest (roundness 1) to sidestep the
 * ridge, this meshes the real default sharp ridge and asserts the honest facet chord AT the crossing
 * crest is < 0.01mm — the fix the M5 report flagged as the remaining structure problem. Reports
 * `facetMaxChordMm` (vs the exact analytic surface, straddle-guarded) alongside the M3/M4 gates.
 */
export function buildCelticKnotCrestCrossingMesh(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotMeshOptions,
): { mesh: MeshData; report: MeshReport } {
  return meshColumnCrossing(styleOptions, dims, opts, true, true);
}

/**
 * P3b Task 2 (LOAD-BEARING TOPOLOGICAL PROOF): the single-column crossing mesh at the cornered-crest
 * 3-strand DEFAULT (ckRoundness = 0.5, ckStrands = 3), meshed from the VISIBLE-ENVELOPE-CLIPPED cliffs
 * (Task 1's `clipCliffsToVisibleEnvelope`) instead of full-band cliffs + `weldSoftCliffs`.
 *
 * The M6a soft-drop proof composes only for an ISOLATED 2-strand crossing; at the real 3-strand
 * default it mis-welds an occluded cliff vertex and `maxCliffDevMm` spikes to the full 0.60mm radial
 * jump (the M6b blocker). This entry instead feeds each ribbon↔background cliff clipped to exactly its
 * visible (non-occluded) t-sub-arcs, so the occluded under-strand edges are ABSENT inside the overlap
 * diamond: the over-strand crest crease then threads the crossing through FREE space (no cliff to
 * cross, no crash, no soft-weld), each occlusion boundary is closed by the M3 junction pinch + the M4
 * one-sided-limit occlusion wall (over-foot → raised under-surface), and both the crossing-crest facet
 * chord and `maxCliffDevMm` fall below 0.01mm. Reports the honest facet chord (vs the exact analytic
 * surface, straddle-guarded) alongside the M3/M4 watertight + certification gates.
 */
export function buildCelticKnotClippedCrossingMesh(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotMeshOptions,
): { mesh: MeshData; report: MeshReport } {
  return meshColumnCrossing(styleOptions, dims, opts, true, true, true);
}

/**
 * Shared core for the single-column crossing mesh (M3) and its occlusion variant (M4). The MESH
 * is identical either way — occlusion curtains are the ribbon-background edges' own one-sided-
 * lifted walls, never a second wall. `withOcclusion` only (a) supplies the analytic `styleRadius`
 * to P1 so it emits the declared `kind:'occlusion'` segments and (b) reports the occlusion-wall
 * census (count, distinct loci, min raise above background) computed from the emitted walls.
 */
function meshColumnCrossing(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotMeshOptions,
  withOcclusion: boolean,
  withCreases = false,
  withClip = false,
): { mesh: MeshData; report: MeshReport } {
  const H = dims.H;
  const expn = dims.expn ?? 1;
  const merged = { ...DEFAULT_CELTIC_KNOT, ...styleOptions };

  const params: CelticKnotCliffParams = {
    columnCount: Math.max(1, Math.floor(merged.ckScale)),
    strandWidth: merged.ckWidth * 0.15,
    strandCount: Math.max(2, Math.min(8, Math.floor(merged.ckStrands + 0.5))),
    tightness: Math.max(0.5, merged.ckTwist + 0.5),
    relief: merged.ckRelief,
    gap: merged.ckGap,
    roundness: merged.ckRoundness,
  };
  const cliffDims: CliffDims = { H, Rb: dims.Rb, Rt: dims.Rt, expn };

  const rA = buildAnalyticRadiusFn('CelticKnot', styleOptions, { H, Rb: dims.Rb, Rt: dims.Rt, expn });
  const surface: SurfaceRadiusFn = (u, t) => rA(TAU * u, t * H);
  // The style's OWN analytic radius (theta,z)→r, supplied to P1 so the occlusion upper lip reads
  // as the exact one-sided limit of the raised under-strand surface. Same fn as `surface`, un-wrapped.
  const styleRadius = (theta: number, z: number): number => rA(theta, z);
  const complex = withOcclusion || withCreases
    ? buildCelticKnotCliffComplex(params, cliffDims, styleRadius)
    : buildCelticKnotCliffComplex(params, cliffDims);

  // ---- one column + its ribbon-background strand edges ----
  const COLUMN = 0;
  const ribbonSegs = complex.segments.filter((s) => s.kind === 'ribbon-background' && s.column === COLUMN);
  if (ribbonSegs.length < 4) throw new Error(`expected >=4 ribbon edges in column ${COLUMN}, got ${ribbonSegs.length}`);
  const colJunctions = complex.junctions.filter((j) => j.column === COLUMN);
  if (colJunctions.length === 0) throw new Error('no crossing junctions (need >=2 strands whose edges cross)');

  // ---- window around ONE crossing (overlap diamond + its corner junctions) ----
  const window = crossingWindow(colJunctions);
  const domain = window.domain;

  // T2: a constraint (cliff arc / crease) overlaps this crossing window in u iff any of its samples
  // fall within the window's u-band (+ a background pad). Used to DROP the far, non-participating
  // strands (e.g. at a 3-strand default only strands 1&2 cross near t=0.5; strand 0 sits ~0.27 away in
  // u). Feeding a far strand's edge would extend the CDT hull across the empty gap into one giant
  // background triangle whose facet chord no local refinement clears — the residual the clip closes.
  const U_PAD = 0.04;
  const overlapsWindowU = (at: (s: number) => { u: number; t: number }): boolean => {
    for (let s = 0; s <= 1 + 1e-9; s += 0.25) {
      const u = at(s).u;
      if (u >= domain.uMin - U_PAD && u <= domain.uMax + U_PAD) return true;
    }
    return false;
  };

  const adapted: SegLike[] = [];
  const adaptedId: Array<{ column: number; strand: number; side: number }> = [];
  const junctions: JunLike[] = [];
  if (withClip) {
    // P3b T2 (via the shared clip helper `buildClippedConstraints`): feed each ribbon↔background cliff
    // CLIPPED to its visible (non-occluded) t-sub-arcs (`clipCliffsToVisibleEnvelope`), dropping the far
    // strands that do NOT reach this crossing window (`overlapsWindowU`). The occluded under-strand edges
    // are then ABSENT inside the overlap diamond, so the over-strand crest crease threads the crossing
    // through FREE space (planar PSLG, no cdt2d crash, no soft-weld); each occlusion boundary is snapped
    // onto its declared crossing junction so the clipped arc terminates there and the M3 pinch + M4
    // one-sided-limit occlusion wall close it watertight.
    const env = clipCliffsToVisibleEnvelope(params, cliffDims);
    const clipped = buildClippedConstraints(env, ribbonSegs, colJunctions, domain, (arcSeg) =>
      overlapsWindowU(arcSeg.at),
    );
    adapted.push(...clipped.adapted);
    adaptedId.push(...clipped.adaptedId);
    junctions.push(...clipped.junctions);
  } else {
    for (const seg of ribbonSegs) {
      adapted.push(adaptSegment(seg, window));
      adaptedId.push({ column: seg.column, strand: seg.strand, side: seg.side });
    }
    const segIndexOf = (strand: number, side: number): number =>
      adaptedId.findIndex((a) => a.strand === strand && a.side === side);

    // in-window junctions → JunLike (normalized u; incident segment indices into `adapted`)
    for (const j of colJunctions) {
      if (j.t < domain.tLo || j.t > domain.tHi) continue;
      const segs = j.incident.map((inc) => segIndexOf(inc.strand, inc.side)).filter((i) => i >= 0);
      if (segs.length < 2) continue; // both incident edges must be present in the window
      junctions.push({ u: j.u / TAU, t: j.t, pinch: { upper: j.pinch.upper, lower: j.pinch.lower }, segs });
    }
  }
  if (junctions.length === 0) throw new Error('crossing window captured no complete junction');

  // M6a: structure the cornered crest. Flanks stay diamond-clipped; the crest is carried THROUGH
  // the diamond (the occluded under-strand cliffs are DROPPED in-sheet by `weldSoftCliffs`, so the
  // crest crosses free space), making the sharp default ridge a real mesh edge across the crossing.
  const cwOpts = opts as CelticKnotMeshOptions & { across?: number; creaseMarginT?: number; crestMarginT?: number };
  const allCreases: CreaseLike[] | undefined = withCreases
    ? [
        ...diamondClippedCreases(params, cwOpts.across ?? 20, cwOpts.creaseMarginT ?? 0.004, domain, false),
        ...crestCreasesThroughDiamonds(params, domain, cwOpts.crestMarginT ?? CREST_END_MARGIN_T),
      ]
    : undefined;
  // T2 clip path: drop the far strands' crest/flank creases too (same window-u scope as the cliffs), so
  // no crease constraint reaches across the empty background gap. Non-clip paths are left untouched.
  const creases = withClip && allCreases ? allCreases.filter((c) => overlapsWindowU(c.at)) : allCreases;
  const complexAdapted = { segments: adapted, junctions, creases };

  // Conforming reference soup: a FINE run of the SAME mesher (same junctions + occlusion-aware
  // walls) so the chord metric measures facet error, not a uniform grid's false cliff/occlusion
  // floor. A uniform surface soup cannot represent the cliffs, the occlusion steps, or the pinch.
  // Skipped in crease mode — there the refine metric is the reference-free analytic chord (a self-
  // mesh reference would carry the same cornered-crest sag and hide it), measured vs `surface`.
  const refTris = withCreases
    ? []
    : meshToRefTris(
        buildDoubleValuedMesh(complexAdapted, surface, { H }, {
          baseGridU: 132,
          baseGridT: 128,
          chordTolMm: 1,
          maxRefinePasses: 0,
          domain,
          oneSidedDelta: ONE_SIDED_DELTA,
        }),
      );

  // ---- build (with refinement) ----
  const innerTol = opts.chordTolMm * 0.5; // refine tighter than the report gate for margin
  const stats: BuildStats = {
    refinePasses: 0,
    addedSheetPoints: 0,
    splitCliffEdges: 0,
    unwalledCliffEdges: 0,
    maxAnalyticChordMm: 0,
    pointCapHit: 0,
    voteFreeRegions: 0,
    tieCliffRegions: 0,
  };
  // Collect the emitted walls only when we need the occlusion census (M4); the mesh is identical.
  const walls: WallRecord[] = [];
  const mesh = buildDoubleValuedMesh(
    complexAdapted,
    surface,
    { H },
    {
      baseGridU: opts.baseGridU,
      baseGridT: opts.baseGridT,
      chordTolMm: innerTol,
      maxRefinePasses: opts.maxRefinePasses,
      domain,
      refSoup: withCreases ? undefined : refTris,
      oneSidedDelta: ONE_SIDED_DELTA,
      analyticChord: withCreases,
      refineCreases: withCreases,
      // Clip path (T2): the cliffs are already clipped to their visible sub-arcs, so the occluded
      // under-strand edges are absent (no soft-weld needed) — but the analytic-chord refine loop still
      // needs the straddle guard for the genuine (visible) ribbon↔background cliffs it skips.
      weldSoftCliffs: withCreases && !withClip,
      straddleGuard: withClip,
      pointCap: withCreases ? 300000 : undefined,
    },
    stats,
    withOcclusion ? walls : undefined,
  );

  // ---- verify: manifold + chord ----
  const audit = auditManifold(mesh);
  // In crease mode the honest facet chord (vs the true analytic surface, straddle-guarded) is the
  // gate; otherwise the geometric chord vs the conforming reference soup (M3/M4).
  const chord = withCreases
    ? { maxMm: stats.maxAnalyticChordMm, rmsMm: 0 }
    : chordToSurface(mesh, refTris);
  // Honest facet chord vs the true analytic surface (straddle-guarded). In crease mode this is the
  // M6a gate; in the M3/M4 paths it is a free diagnostic (the smooth crest keeps it small).
  const facet = facetChordToTrueSurface(mesh, surface, H);

  // ---- INDEPENDENT fidelity certification (does NOT go through the region classifier) ----
  // I1 (P3b): evaluate each arc at ITS OWN tRange fraction, not the domain fraction. A clip-path arc
  // (`adaptSegmentToRange`) spans only a sub-interval [lo,hi] of the domain, so its `at(s)` maps s∈[0,1]
  // onto [lo,hi]; the domain fraction (t−tLo)/(tHi−tLo) would sample the wrong physical height. For a
  // full-band arc (M3/M4/M6a: tRange === domain) this is byte-identical, so it corrects only the clip path.
  const cliffLocusDistance = (u: number, t: number): number => {
    let best = Infinity;
    for (const seg of adapted) {
      const s = clamp01((t - seg.tRange[0]) / (seg.tRange[1] - seg.tRange[0]));
      const d = Math.abs(u - seg.at(s).u);
      if (d < best) best = d;
    }
    return best;
  };
  const locusUAt = (seg: number, t: number): number => {
    const sg = adapted[seg];
    return sg.at(clamp01((t - sg.tRange[0]) / (sg.tRange[1] - sg.tRange[0]))).u;
  };
  const cert = certifyAgainstTrueSurface(mesh, surface, cliffLocusDistance, locusUAt, ONE_SIDED_DELTA);
  const regionStats = regionRadiusConsistency(mesh);
  const certification: SurfaceCertification = {
    maxSheetDevMm: cert.maxSheetDevMm,
    maxCliffDevMm: cert.maxCliffDevMm,
    sheetVertsChecked: cert.sheetVertsChecked,
    cliffVertsCertified: cert.cliffVertsCertified,
    cliffVertsSkipped: cert.cliffVertsSkipped,
    minRibbonMeanRadiusMm: regionStats.minRibbonMeanRadiusMm,
    maxBackgroundMeanRadiusMm: regionStats.maxBackgroundMeanRadiusMm,
    ribbonRegionCount: regionStats.ribbonRegionCount,
    backgroundRegionCount: regionStats.backgroundRegionCount,
  };

  // ---- per-junction pinch levels (read straight off the mesh's junction vertices) ----
  const junctionLevels = measureJunctionLevels(mesh, junctions);

  // ---- occlusion-wall census (M4): which emitted walls are declared occlusion curtains ----
  const occ = withOcclusion
    ? occlusionWallCensus(
        walls,
        adaptedId,
        complex.segments.filter((s) => s.kind === 'occlusion' && s.column === COLUMN),
        complex.jumpMm,
      )
    : { count: 0, loci: 0, minRaise: 0 };

  const md = toMeshData(mesh);
  const report: MeshReport = {
    vertexCount: md.vertexCount,
    triangleCount: md.triangleCount,
    nonManifold: audit.nonManifold,
    boundary: audit.boundary,
    cliffBoundary: audit.cliffBoundary,
    boundaryNonRim: audit.boundaryNonRim,
    maxChordMm: chord.maxMm,
    rmsChordMm: chord.rmsMm,
    refinePasses: stats.refinePasses,
    certification,
    junctionCount: junctions.length,
    junctions: junctionLevels,
    occlusionWallCount: occ.count,
    occlusionWallLoci: occ.loci,
    minOcclusionRaiseMm: occ.minRaise,
    facetMaxChordMm: facet.maxMm,
    facetRmsChordMm: facet.rmsMm,
    facetMaxU: facet.maxU,
    facetMaxT: facet.maxT,
    facetSamplesSkipped: facet.skipped,
  };
  return { mesh: md, report };
}

/**
 * Identify which emitted walls are internal OCCLUSION curtains, using P1's declared
 * `kind:'occlusion'` segments. Each such segment is co-located with a ribbon-background edge
 * (same strand/side) over a sub-arc `tRange`; a wall on that edge whose midpoint-t lies in the
 * sub-arc and whose LOWER rail is raised above the plain background (r0 − jump) by more than
 * `RAISE_MARGIN` is a genuine ribbon-over-ribbon curtain (near the diamond corners the step
 * tapers to the plain jump and is excluded). Returns the count, the distinct-locus count (equal
 * to the count ⇒ exactly one wall per locus, no doubled curtain), and the min raise above
 * background (positive ⇒ the curtains are genuine raised steps, not plain ribbon→background drops).
 */
function occlusionWallCensus(
  walls: readonly WallRecord[],
  adaptedId: ReadonlyArray<{ strand: number; side: number }>,
  occlusionSegs: readonly CliffSegment[],
  jumpMm: number,
): { count: number; loci: number; minRaise: number } {
  const RAISE_MARGIN = 0.1; // mm above plain background to count as a genuine raised curtain
  const T_EPS = 1e-9;
  const raises: number[] = [];
  const lociKeys = new Set<string>();
  for (const w of walls) {
    const id = adaptedId[w.ci];
    if (!id) continue;
    const decl = occlusionSegs.find(
      (o) => o.strand === id.strand && o.side === id.side && w.t >= o.tRange[0] - T_EPS && w.t <= o.tRange[1] + T_EPS,
    );
    if (!decl) continue;
    const s = clamp01((w.t - decl.tRange[0]) / (decl.tRange[1] - decl.tRange[0]));
    const background = decl.lipsAt(s).lower - jumpMm; // r0(t) − jump = plain background radius at t
    const raise = Math.min(w.railA, w.railB) - background;
    if (raise <= RAISE_MARGIN) continue; // plain wall or tapered corner interval — not a curtain
    raises.push(raise);
    lociKeys.add(`${Math.round(w.u / 1e-6)}:${Math.round(w.t / 1e-6)}`);
  }
  return {
    count: raises.length,
    loci: lociKeys.size,
    minRaise: raises.length ? Math.min(...raises) : 0,
  };
}

/**
 * A TIGHT rectangular (u,t) window around ONE strand crossing — the bounding box of one
 * overlap diamond's four corner junctions, plus a background margin on every side so both
 * background sheets (the r0−jump pinch level) are meshed. Kept compact on purpose: the steep
 * anisotropic ribbon is expensive to chord to 0.01mm by isotropic refinement, so a box around
 * a single crossing bounds the triangle budget while still exercising the whole M3 mechanism
 * (a genuine diamond + its four watertight Y-junctions + surrounding ribbon/background). The
 * strands are clipped by the window rim, which is a declared-open boundary.
 */
function crossingWindow(junctions: readonly CliffJunction[]): Window {
  // choose the junction nearest t=0.5, then the cluster within CLUSTER_DT of it in t
  const CLUSTER_DT = 0.02;
  let seed = junctions[0];
  for (const j of junctions) if (Math.abs(j.t - 0.5) < Math.abs(seed.t - 0.5)) seed = j;
  const cluster = junctions.filter((j) => Math.abs(j.t - seed.t) <= CLUSTER_DT);

  // bounding box of the diamond's corners (normalized u = theta/TAU)
  let uLo = Infinity;
  let uHi = -Infinity;
  let tLo = Infinity;
  let tHi = -Infinity;
  for (const j of cluster) {
    const un = j.u / TAU;
    if (un < uLo) uLo = un;
    if (un > uHi) uHi = un;
    if (j.t < tLo) tLo = j.t;
    if (j.t > tHi) tHi = j.t;
  }
  const U_MARGIN = 0.022; // background band each side (>> strandWidth/2 so bg regions are meshed)
  const T_MARGIN = 0.007; // a little sheet beyond the top/bottom corners
  const tPeak = (tLo + tHi) / 2;
  return {
    domain: {
      uMin: uLo - U_MARGIN,
      uMax: uHi + U_MARGIN,
      tLo: Math.max(0.02, tLo - T_MARGIN),
      tHi: Math.min(0.98, tHi + T_MARGIN),
    },
    tPeak,
  };
}

/**
 * Read each declared junction's pinch straight off the built mesh: the distinct radius levels
 * among the mesh's junction vertices at that (u,t). A watertight pinch shows exactly TWO
 * (upper = r0, lower = r0−jump) — the 55→…→2 collapse — never a multi-level fan.
 */
function measureJunctionLevels(mesh: Mesh, junctions: readonly JunLike[]): JunctionLevelReport[] {
  const pos = mesh.positions;
  const isJn = mesh.vertexIsJunction;
  const U = mesh.vertexU;
  const T = mesh.vertexT;
  const vcount = pos.length / 3;
  const out: JunctionLevelReport[] = [];
  for (const j of junctions) {
    const radii: number[] = [];
    for (let v = 0; v < vcount; v += 1) {
      if (!isJn[v]) continue;
      if (Math.abs(U[v] - j.u) < 1e-6 && Math.abs(T[v] - j.t) < 1e-6) radii.push(Math.hypot(pos[v * 3], pos[v * 3 + 1]));
    }
    radii.sort((a, b) => a - b);
    const levels: number[] = [];
    for (const r of radii) if (levels.length === 0 || r - levels[levels.length - 1] > 1e-3) levels.push(r);
    out.push({
      u: j.u,
      t: j.t,
      distinctLevels: levels.length,
      upper: levels.length ? levels[levels.length - 1] : NaN,
      lower: levels.length ? levels[0] : NaN,
    });
  }
  return out;
}

// ===========================================================================
// Milestone 5: the FULL multi-column CelticKnot pot outer wall — ONE watertight,
// double-valued-wall tube, PERIODIC in u, refined to 0.01mm, verified, exported to STL.
// ===========================================================================

/** WGSL braid amplitude (styles.ts `rOuterCelticKnot`); needed to place the crest/strip creases. */
const CK_AMP = 0.4;

/**
 * Default t-trim of each crest run's HARD dive/emerge ends (M6). Kept SMALL so the tiny sliver of
 * ridge left un-structured at the occlusion boundary is minimal, but > the visibility scan step so
 * the ridge never lands on the occlusion cliff (which cracks the wall).
 */
const CREST_END_MARGIN_T = 0.0012;

// CelticKnot analytic centreline / z-height, EXACTLY as `rOuterCelticKnot` (styles.ts) and P1
// (`celticKnotCliffComplex`) evaluate them — the single source of truth the mesh must conform to.
const ckArg = (p: CelticKnotCliffParams, col: number, strand: number, t: number): number =>
  t * p.tightness * TAU * 3 + col * Math.PI * 0.333 + strand * (TAU / p.strandCount);
/** Strand centreline offset in localU at height t (localU = CK_AMP·sin(arg)). */
const ckCentre = (p: CelticKnotCliffParams, col: number, strand: number, t: number): number =>
  CK_AMP * Math.sin(ckArg(p, col, strand, t));
/** Strand z-buffer height (parity-switched osc), the z-order that decides which crest is visible. */
const ckZHeight = (p: CelticKnotCliffParams, col: number, strand: number, t: number): number => {
  const osc = ckArg(p, col, strand, t) * Math.max(1, p.strandCount - 1);
  return p.strandCount % 2 !== 0 ? Math.sin(osc) : Math.cos(osc);
};
/** localU → normalized u (theta/TAU); matches `localUToTheta`/TAU and `diamondClippedCreases`. */
const ckUOf = (p: CelticKnotCliffParams, col: number, localU: number): number =>
  (col + localU / 2 + 0.5) / p.columnCount;

/** Options for {@link buildCelticKnotFullPotMesh} (adds the ribbon strip density knob). */
export interface CelticKnotFullPotOptions extends CelticKnotMeshOptions {
  /**
   * Structured crest+flank strips per ribbon (M2's technique, generalised to the whole pot):
   * `across − 1` iso-fraction crease lines span each ribbon between its two cliff edges, so the
   * tall thin snaking ridge is meshed as clean strips instead of relying on isotropic refinement.
   * f = 0.5 is the crest itself. Default 16 (≈13 flank segments ⇒ crest-flank sag ≲ 0.01 mm).
   */
  across?: number;
  /** t-margin trimming each clear crease interval back from the overlap diamonds. Default 0.004. */
  creaseMarginT?: number;
  /** t-trim of each crest run's HARD dive/emerge ends (M6). Default {@link CREST_END_MARGIN_T}. */
  crestMarginT?: number;
  /**
   * Add dense crest-band seed points through the overlap diamonds (finely tessellates the diamond
   * crest for appearance). It does NOT bring the diamond chord below 0.01mm — that ridge needs
   * crest-crossing planarization — and it enlarges/slows the build, so it is OFF by default.
   */
  diamondSeeds?: boolean;
  /**
   * Carry each ribbon's crest crease THROUGH the overlap diamonds (M6). When set, the flank strips
   * stay diamond-clipped but the CREST becomes a continuous mesh edge along every visible ridge; the
   * occluded under-strand cliffs it crosses are DROPPED in-sheet (via `weldSoftCliffs`), so the crest
   * crosses free space (planar, no crack). Also supplies P1 the analytic radius so it declares the
   * `kind:'occlusion'` segments (over-strand identity). OFF by default so the M5 pot (which documents
   * the crossing residual as the remaining task) is byte-identical; M6 turns it on. NOTE (M6b): this
   * mechanism is proven in an ISOLATED crossing but does NOT yet compose into the full periodic
   * multi-column pot — see the M6 report.
   */
  crestThroughDiamonds?: boolean;
  /**
   * P3b T3 (DELIVER): mesh from the VISIBLE-ENVELOPE-CLIPPED cliffs — T2's single-crossing fix
   * GENERALISED to compose over every crossing across all columns AND the periodic u-seam. Each
   * ribbon↔background cliff is fed CLIPPED to exactly its visible (non-occluded) t-sub-arcs
   * (`clipCliffsToVisibleEnvelope`), so the occluded under-strand edges are ABSENT inside every
   * overlap diamond: the over-strand crest crease threads each crossing through free space (no cliff
   * to cross ⇒ planar PSLG, no crash, no soft-weld), and each occlusion boundary is SNAPPED onto its
   * declared crossing junction so the clipped arc terminates there and closes via the M3 pinch + M4
   * one-sided-limit wall. Implies the crest-through-diamond creases (like `crestThroughDiamonds`) but
   * replaces `weldSoftCliffs` with the pre-clip + per-junction `straddleGuard`. Where the M5 unclipped
   * path carries a ~1.58mm diamond crossing residual at the 3-strand default, this closes the honest
   * facet chord < 0.01mm EVERYWHERE. OFF by default so M5/M6 stay byte-identical.
   */
  clipToVisibleEnvelope?: boolean;
}

/**
 * Crest creases carried THROUGH overlap diamonds (M6) — the fix that makes each strand's visible
 * ridge a real mesh EDGE where the M5 diamond-clipped creases could not go.
 *
 * For every strand the visible crest ridge is the polyline `localU = centre_s(t)` over exactly the
 * t where that strand is the OUTERMOST at its own centreline (the analytic z-buffer: no other
 * strand within `strandWidth` has a higher z-height) — i.e. the clear runs AND the intervals where
 * the strand passes OVER another inside a diamond (precisely where P1 declares its `kind:'occlusion'`
 * segment with `strand` = this over strand). Inside a diamond the crest crosses the OCCLUDED under
 * strand's cliff edges, but those cliffs carry no real step there and are DROPPED in-sheet by the
 * mesher's `weldSoftCliffs` (surface-continuous ⇒ no constraint, no wall) — so the crest crosses
 * FREE space and no crossing needs planarizing (crossing constraints crash cdt2d). Each visible run
 * is trimmed by `endMargin` at both ends so the crease never touches the HARD occlusion cliff at the
 * dive/emerge boundary (which would crack the wall); the tiny untrimmed sliver of ridge there is a
 * cliff-straddle the facet metric skips. Fine-scanned visibility so a z-order swap mid-overlap also
 * ends the run cleanly. In-sheet only: no wall, no double vertex ⇒ watertightness + the vertex
 * certification are unchanged.
 *
 * `extendToRim` (the full pot only): a run END that coincides with a DOMAIN t-rim (t=tLo or t=tHi)
 * is NOT a dive/emerge occlusion cliff — it is the mesh's declared-OPEN outer boundary — and the
 * maximal-visible run is occlusion-free right up to it by construction, so the crest is extended ALL
 * THE WAY to the rim there instead of being trimmed. Trimming a rim end instead leaves the ridge
 * unstructured over [rim∓endMargin, rim], where a flat base facet bridges r0→r0+relief (the rim-trim
 * facet — the global-worst chord on the clipped pot). The crest at the rim lands in the ribbon
 * interior (its own cliffs are ±strandWidth away), so it touches no wall and the rim stays an open
 * t-rim (boundaryNonRim unchanged). OFF by default so the crossing-window callers (M6a/T2), whose
 * domain edges are interior window cuts and are meant to stay trimmed, are byte-identical.
 */
function crestCreasesThroughDiamonds(
  params: CelticKnotCliffParams,
  domain: DomainWindow,
  endMargin: number,
  extendToRim = false,
): CreaseLike[] {
  const { columnCount, strandCount } = params;
  const w = params.strandWidth;
  const ST = 0.0003; // t scan step (finer than the ~0.014 diamond so no visibility flip is missed)
  const spanT = domain.tHi - domain.tLo;
  const creases: CreaseLike[] = [];
  const visibleAt = (col: number, s: number, t: number): boolean => {
    const cs = ckCentre(params, col, s, t);
    const zs = ckZHeight(params, col, s, t);
    for (let k = 0; k < strandCount; k += 1) {
      if (k === s) continue;
      if (Math.abs(cs - ckCentre(params, col, k, t)) < w && ckZHeight(params, col, k, t) > zs) return false;
    }
    return true;
  };
  for (let col = 0; col < columnCount; col += 1) {
    for (let s = 0; s < strandCount; s += 1) {
      const flush = (a0: number, b0: number, aIsRim: boolean, bIsRim: boolean): void => {
        // Trim each run's HARD dive/emerge ends so the ridge never lands on the occlusion cliff — but
        // NOT a domain t-rim end (an OPEN mesh boundary, not an occlusion cliff): when `extendToRim`
        // the crest runs all the way to it, else the un-structured [rim∓endMargin, rim] sliver leaves a
        // flat r0→r0+relief base facet (the rim-trim facet). The run is occlusion-free up to the rim by
        // construction, so extending it crosses no wall.
        const a = aIsRim && extendToRim ? a0 : a0 + endMargin;
        const b = bIsRim && extendToRim ? b0 : b0 - endMargin;
        if (b - a < 5e-4) return; // too short to structure
        creases.push({
          tRange: [a, b],
          at: (sPar: number) => {
            const t = a + (b - a) * clamp01(sPar);
            return { u: ckUOf(params, col, ckCentre(params, col, s, t)), t };
          },
        });
      };
      // maximal visible runs from a fine scan (boundaries are the strand's dive/emerge points)
      const nStep = Math.max(4, Math.ceil(spanT / ST));
      let runA: number | null = null;
      let runAIsRim = false; // did this run OPEN on the bottom domain t-rim (visible from t=tLo)?
      let prevVis = false;
      for (let i = 0; i <= nStep; i += 1) {
        const t = domain.tLo + spanT * (i / nStep);
        const vis = visibleAt(col, s, t);
        if (vis && !prevVis) {
          runA = i === 0 ? domain.tLo : t;
          runAIsRim = i === 0;
        } else if (!vis && prevVis && runA !== null) {
          flush(runA, t, runAIsRim, false); // this end is a dive occlusion boundary — always trimmed
          runA = null;
        }
        prevVis = vis;
      }
      if (runA !== null) flush(runA, domain.tHi, runAIsRim, true); // reaches the top domain t-rim
    }
  }
  return creases;
}

/**
 * Diamond-CLIPPED crest + flank strip creases for every ribbon, derived from CelticKnot's own
 * analytic centreline (matches P1 exactly). Each crease is emitted ONLY over the t-intervals
 * where its strand is clear of every other same-column strand (no other centreline within
 * `2·strandWidth`), so a crease never enters an overlap diamond and thus NEVER crosses another
 * crease or cliff — the mesh stays a planar PSLG with no crease-crossing planarization needed.
 * Inside the diamonds the crest is carried by the base grid + junction pinch (already M3-proven).
 *
 * `extendToRim` (the full-pot clip path): a run END on a DOMAIN t-rim (t=tLo/tHi) is the mesh's
 * OPEN outer boundary, not a diamond occlusion edge, so the flank strips are run ALL THE WAY to it
 * instead of being pulled back by `marginT`. Trimming there leaves the flanks un-structured over
 * [rim∓marginT, rim], where a coarse base facet spans the rounded flank (the flank half of the
 * rim-trim facet — with the crest carried to the rim by `crestCreasesThroughDiamonds`, this is what
 * remains). OFF by default so M5 (crest-clipped strips) and the M6a/T2 crossing-window caller — whose
 * domain edges are interior cuts meant to stay trimmed — are byte-identical.
 */
function diamondClippedCreases(
  params: CelticKnotCliffParams,
  across: number,
  marginT: number,
  domain: DomainWindow,
  includeCrest = true,
  extendToRim = false,
): CreaseLike[] {
  const { columnCount, strandCount, strandWidth, tightness } = params;
  const centre = (col: number, strand: number, t: number): number =>
    CK_AMP * Math.sin(t * tightness * TAU * 3 + col * Math.PI * 0.333 + strand * (TAU / strandCount));
  const uOf = (col: number, localU: number): number => (col + localU / 2 + 0.5) / columnCount;
  const w2 = 2 * strandWidth;
  const STEP = 0.0008;
  const creases: CreaseLike[] = [];
  for (let col = 0; col < columnCount; col += 1) {
    for (let strand = 0; strand < strandCount; strand += 1) {
      const clear = (t: number): boolean => {
        for (let o = 0; o < strandCount; o += 1) {
          if (o === strand) continue;
          if (Math.abs(centre(col, strand, t) - centre(col, o, t)) < w2) return false;
        }
        return true;
      };
      const runs: Array<[number, number, boolean, boolean]> = [];
      let runStart = -1;
      for (let t = domain.tLo; t <= domain.tHi + 1e-9; t += STEP) {
        if (clear(t)) {
          if (runStart < 0) runStart = t;
        } else if (runStart >= 0) {
          // ends because the strand entered an overlap diamond — an occlusion boundary, NOT a rim
          runs.push([runStart, t - STEP, runStart <= domain.tLo + 1e-9, false]);
          runStart = -1;
        }
      }
      if (runStart >= 0) runs.push([runStart, domain.tHi, runStart <= domain.tLo + 1e-9, true]);
      for (const [a0, b0, aIsRim, bIsRim] of runs) {
        // A run END on a domain t-rim is the OPEN mesh boundary; extend the flank strips to it under
        // `extendToRim` rather than pulling back by `marginT` (else the un-structured band leaves a
        // coarse flank facet at the rim). A diamond occlusion end stays trimmed.
        const a = aIsRim && extendToRim ? a0 : a0 + marginT;
        const b = bIsRim && extendToRim ? b0 : b0 - marginT;
        if (b - a < 0.02) continue; // too short to structure
        for (let k = 1; k < across; k += 1) {
          // The crest (k = across/2, off = 0) is carried THROUGH diamonds by
          // `crestCreasesThroughDiamonds` in M6 mode; skip it here so it is not double-emitted.
          if (!includeCrest && k * 2 === across) continue;
          const off = (2 * (k / across) - 1) * strandWidth;
          creases.push({
            tRange: [a, b],
            at: (s: number) => {
              const t = a + (b - a) * clamp01(s);
              return { u: uOf(col, centre(col, strand, t) + off), t };
            },
          });
        }
      }
    }
  }
  return creases;
}

/**
 * Narrow crest-band SEED points through each overlap diamond. The visible over-strand crest
 * continues through the diamond, but the diamond-clipped creases stop at its edge (so nothing
 * crosses), leaving the crest there structured only by the coarse base grid — where a single
 * base cell spans the whole ~2mm-tall ribbon and a triangle straddles the ridge. This seeds a
 * dense lattice ALONG both crossing strands' centrelines (±~1.25·halfWidth across, a short t
 * window around each junction) so that ridge is resolved by DENSITY (M3's proven approach,
 * localised to the diamonds). Points only — no constraint edges — so nothing crosses; deduped
 * on a rounded (u,t) key so the four corner-junctions of one diamond share their overlap.
 */
function diamondCrestSeeds(
  junctions: readonly CliffJunction[],
  params: CelticKnotCliffParams,
  domain: DomainWindow,
  hw: number,
): Array<[number, number]> {
  const { columnCount, strandCount, tightness } = params;
  const centre = (col: number, strand: number, t: number): number =>
    CK_AMP * Math.sin(t * tightness * TAU * 3 + col * Math.PI * 0.333 + strand * (TAU / strandCount));
  const uOf = (col: number, localU: number): number => (col + localU / 2 + 0.5) / columnCount;
  const T_WIN = 0.007;
  const GT = 0.0009;
  const GU = Math.max(0.0004, (2 * hw) / 14); // ~14 samples across the ribbon width
  const ACROSS = 1.25 * hw;
  const seen = new Set<string>();
  const seeds: Array<[number, number]> = [];
  for (const j of junctions) {
    const strands = new Set(j.incident.map((inc) => inc.strand));
    for (const strand of strands) {
      for (let t = j.t - T_WIN; t <= j.t + T_WIN + 1e-9; t += GT) {
        if (t < domain.tLo || t > domain.tHi) continue;
        const cu = uOf(j.column, centre(j.column, strand, t));
        for (let du = -ACROSS; du <= ACROSS + 1e-9; du += GU) {
          const u = cu + du;
          if (u <= domain.uMin || u >= domain.uMax) continue;
          const k = `${Math.round(u / GU)}:${Math.round(t / GT)}`;
          if (seen.has(k)) continue;
          seen.add(k);
          seeds.push([u, t]);
        }
      }
    }
  }
  return seeds;
}

/** Periodic-tube boundary census: which OPEN edges are on a t-rim vs the (must-be-welded) u-seam. */
function periodicSeamAudit(mesh: Mesh, domain: DomainWindow): { seamOpen: number; tRim: number; other: number } {
  const use = new Map<string, number>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const tris = mesh.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    for (const [a, b] of [[tris[i], tris[i + 1]], [tris[i + 1], tris[i + 2]], [tris[i + 2], tris[i]]] as const) {
      use.set(key(a, b), (use.get(key(a, b)) ?? 0) + 1);
    }
  }
  const onTRim = (v: number): boolean => mesh.vertexT[v] <= domain.tLo + 1e-9 || mesh.vertexT[v] >= domain.tHi - 1e-9;
  const onSeam = (v: number): boolean => mesh.vertexU[v] <= domain.uMin + 1e-9 || mesh.vertexU[v] >= domain.uMax - 1e-9;
  let seamOpen = 0;
  let tRim = 0;
  let other = 0;
  for (const [k, c] of use) {
    if (c !== 1) continue;
    const sep = k.indexOf(':');
    const a = Number(k.slice(0, sep));
    const b = Number(k.slice(sep + 1));
    if (onTRim(a) && onTRim(b)) tRim += 1;
    else if (onSeam(a) && onSeam(b)) seamOpen += 1;
    else other += 1;
  }
  return { seamOpen, tRim, other };
}

/**
 * Orientation check for STL (this codebase has an orientation-bug history, so ASSERT don't assume):
 * run the exact `orientMeshForSTL` the exporter uses, then confirm the result is (a) a single
 * connected component, (b) coherently wound — every interior edge traversed antiparallel by its
 * two faces — and (c) OUTWARD (total signed volume > 0 for a tube around the z-axis).
 */
function checkOutwardWinding(md: MeshData): {
  consistent: boolean;
  inconsistentEdges: number;
  outward: boolean;
  signedVolume: number;
  components: number;
} {
  const oriented = orientMeshForSTL(md);
  const idx = oriented.indices;
  const v = oriented.vertices;
  const nTri = idx.length / 3;
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const dir = new Map<string, { fwd: number; bwd: number; tris: number[] }>();
  for (let t = 0; t < nTri; t += 1) {
    const i0 = idx[t * 3];
    const i1 = idx[t * 3 + 1];
    const i2 = idx[t * 3 + 2];
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      if (a === b) continue;
      const k = key(a, b);
      let e = dir.get(k);
      if (!e) {
        e = { fwd: 0, bwd: 0, tris: [] };
        dir.set(k, e);
      }
      if (a < b) e.fwd += 1;
      else e.bwd += 1;
      e.tris.push(t);
    }
  }
  let inconsistent = 0;
  const adj: number[][] = Array.from({ length: nTri }, () => []);
  for (const e of dir.values()) {
    if (e.fwd + e.bwd === 2) {
      if (!(e.fwd === 1 && e.bwd === 1)) inconsistent += 1;
      if (e.tris.length === 2) {
        adj[e.tris[0]].push(e.tris[1]);
        adj[e.tris[1]].push(e.tris[0]);
      }
    }
  }
  const seen = new Uint8Array(nTri);
  let components = 0;
  for (let s = 0; s < nTri; s += 1) {
    if (seen[s]) continue;
    components += 1;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const x = stack.pop() as number;
      for (const y of adj[x]) if (!seen[y]) {
        seen[y] = 1;
        stack.push(y);
      }
    }
  }
  let vol = 0;
  for (let t = 0; t < nTri; t += 1) {
    const a = idx[t * 3] * 3;
    const b = idx[t * 3 + 1] * 3;
    const c = idx[t * 3 + 2] * 3;
    vol +=
      (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) -
        v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) +
        v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) /
      6;
  }
  return { consistent: inconsistent === 0, inconsistentEdges: inconsistent, outward: vol > 0, signedVolume: vol, components };
}

/**
 * Reference-free sheet-facet sag split by proximity to a crossing: `clearMax` is the worst sag
 * OUTSIDE every overlap diamond (farther than `DIAMOND_R` in (u,t) from any junction), `diamondMax`
 * is the worst inside. The clear-region mechanism (structured crest/flank strips) resolves the
 * ribbons to tolerance; the diamond crest — where the clipped creases cannot go without crossing —
 * carries the residual until crest-crossing planarization structures it. Also returns the RMS.
 */
function analyticChordSplit(
  mesh: Mesh,
  junctions: readonly JunLike[],
  surface: SurfaceRadiusFn,
  H: number,
): { clearMax: number; diamondMax: number; rms: number } {
  const pos = mesh.positions;
  const U = mesh.vertexU;
  const T = mesh.vertexT;
  const onCliff = mesh.vertexOnCliff;
  const tris = mesh.triangles;
  const DIAMOND_R = 0.02;
  // Unwrap the second endpoint's u across the periodic seam (u=0 ≡ u=1), else a seam-straddling
  // background edge's parameter midpoint lands on the far side and fabricates a phantom sag.
  const unwrapU = (u: number, ref: number): number => (u - ref > 0.5 ? u - 1 : u - ref < -0.5 ? u + 1 : u);
  const nearJunction = (um: number, tm: number): boolean => {
    for (const j of junctions) {
      const du = Math.abs(um - j.u);
      const duw = Math.min(du, 1 - du); // periodic in u
      if (duw < DIAMOND_R && Math.abs(tm - j.t) < DIAMOND_R) return true;
    }
    return false;
  };
  let clearMax = 0;
  let diamondMax = 0;
  let sumSq = 0;
  let n = 0;
  for (let i = 0; i < tris.length; i += 3) {
    const vs = [tris[i], tris[i + 1], tris[i + 2]];
    for (const [a, b] of [[vs[0], vs[1]], [vs[1], vs[2]], [vs[2], vs[0]]] as const) {
      if (onCliff[a] && onCliff[b]) continue; // wall/cliff edge (radial, not a sheet facet)
      let um = (U[a] + unwrapU(U[b], U[a])) / 2;
      if (um < 0) um += 1;
      else if (um >= 1) um -= 1;
      const tm = (T[a] + T[b]) / 2;
      const r = surface(um, tm);
      const dx = (pos[a * 3] + pos[b * 3]) / 2 - r * Math.cos(TAU * um);
      const dy = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2 - r * Math.sin(TAU * um);
      const dz = (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2 - tm * H;
      const d = Math.hypot(dx, dy, dz);
      sumSq += d * d;
      n += 1;
      if (nearJunction(um, tm)) {
        if (d > diamondMax) diamondMax = d;
      } else if (d > clearMax) clearMax = d;
    }
  }
  return { clearMax, diamondMax, rms: Math.sqrt(sumSq / Math.max(1, n)) };
}

/**
 * Build the FULL multi-column CelticKnot pot outer wall as one watertight, double-valued-wall
 * tube, PERIODIC in u (u=0 and u=1 are the same physical location), refined to a max chord below
 * `chordTolMm` against the exact analytic surface, and independently certified.
 *
 * The whole periodic domain u∈[0,1], t∈[0.02,0.98] is triangulated in ONE constrained CDT: every
 * column's ribbon↔background cliffs are constraint chains, every declared crossing is planarized
 * to its shared 2-level pinch (M3), each ribbon is structured into diamond-clipped crest/flank
 * strips (so the tall thin snaking ridge meshes without a globally dense grid), the chord is
 * measured reference-free against the analytic surface, and the u-seam is welded so the only open
 * boundary is the two t-rims. Occlusion fidelity rides on the M3 one-sided-limit lift (certified
 * by `maxCliffDevMm`); this entry supplies no `styleRadius`, so it declares no occlusion census.
 */
export function buildCelticKnotFullPotMesh(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotFullPotOptions,
): { mesh: MeshData; report: MeshReport } {
  const H = dims.H;
  const expn = dims.expn ?? 1;
  const merged = { ...DEFAULT_CELTIC_KNOT, ...styleOptions };
  const params: CelticKnotCliffParams = {
    columnCount: Math.max(1, Math.floor(merged.ckScale)),
    strandWidth: merged.ckWidth * 0.15,
    strandCount: Math.max(2, Math.min(8, Math.floor(merged.ckStrands + 0.5))),
    tightness: Math.max(0.5, merged.ckTwist + 0.5),
    relief: merged.ckRelief,
    gap: merged.ckGap,
    roundness: merged.ckRoundness,
  };
  const cliffDims: CliffDims = { H, Rb: dims.Rb, Rt: dims.Rt, expn };
  const rA = buildAnalyticRadiusFn('CelticKnot', styleOptions, { H, Rb: dims.Rb, Rt: dims.Rt, expn });
  const surface: SurfaceRadiusFn = (u, t) => rA(TAU * u, t * H);
  // T3 clip path carries the crest through every diamond the same way M6 does (the occluded
  // under-strand cliffs are simply ABSENT rather than soft-welded), so it implies crest-through.
  const clip = opts.clipToVisibleEnvelope ?? false;
  const crestThrough = (opts.crestThroughDiamonds ?? false) || clip;
  // M6: supply P1 the style's own analytic radius so it DECLARES the `kind:'occlusion'` segments
  // (their `strand` = the OVER strand — the crest that continues through each diamond). The mesher
  // reads over-identity from the same analytic z-buffer (`ckZHeight`), so these are used to confirm
  // the crest fix, not as a second CDT chain; without crestThrough the pot is byte-identical to M5.
  const styleRadius = (theta: number, z: number): number => rA(theta, z);
  const complex = crestThrough
    ? buildCelticKnotCliffComplex(params, cliffDims, styleRadius)
    : buildCelticKnotCliffComplex(params, cliffDims);

  const T_LO = 0.02;
  const T_HI = 0.98; // matches P1's declared interior band
  const domain: DomainWindow = { uMin: 0, uMax: 1, tLo: T_LO, tHi: T_HI };
  const window: Window = { domain, tPeak: (T_LO + T_HI) / 2 };

  // ALL columns' ribbon-background edges → normalized-u segs; crossings → seg-index junctions.
  const ribbonSegs = complex.segments.filter((s) => s.kind === 'ribbon-background');
  const adapted: SegLike[] = [];
  const adaptedId: Array<{ column: number; strand: number; side: number }> = [];
  const junctions: JunLike[] = [];
  if (clip) {
    // P3b T3 (via the shared clip helper `buildClippedConstraints`): feed each ribbon↔background cliff
    // CLIPPED to its visible (non-occluded) t-sub-arcs (`clipCliffsToVisibleEnvelope`), composed over
    // EVERY column and the WHOLE periodic band — no isolation window, no far-strand drop (that was T2's
    // single-crossing window scoping; here every strand of every column participates, so NO `arcFilter`).
    // The occluded under-strand edges are ABSENT inside each overlap diamond, so the over-strand crest
    // crease threads the crossing through free space (planar PSLG, no cdt2d crash, no soft-weld); each
    // occlusion boundary is snapped onto its declared crossing junction so the clipped arc terminates
    // there and the M3 junction pinch + M4 one-sided-limit wall close it watertight.
    const env = clipCliffsToVisibleEnvelope(params, cliffDims);
    const clipped = buildClippedConstraints(env, ribbonSegs, complex.junctions, domain);
    adapted.push(...clipped.adapted);
    adaptedId.push(...clipped.adaptedId);
    junctions.push(...clipped.junctions);
    // m4-harden (P3b): a junction whose incident arcs did NOT both reach it — a dropped short arc
    // (`hi−lo < 1e-3`) or an arm that failed to bind — is silently absent from `junctions`, leaving
    // that crossing un-planarized. Guard LOUDLY: every declared junction inside the band must bind
    // (at the 3-strand DEFAULT this is 108/108, 0 orphans). A silent junction-skip now THROWS with the
    // orphan count instead of passing unnoticed. Deterministic (pure count over the declared junctions).
    const inBandJunctions = complex.junctions.filter((j) => j.t >= domain.tLo && j.t <= domain.tHi).length;
    if (junctions.length !== inBandJunctions) {
      throw new Error(
        `clip junction bind incomplete: ${junctions.length}/${inBandJunctions} in-band junctions bound ` +
          `(${inBandJunctions - junctions.length} orphan crossing(s) left un-planarized — a clipped arc was ` +
          `dropped as too short or failed to reach its junction; loosen SNAP_T/the 1e-3 min-arc or investigate)`,
      );
    }
  } else {
    for (const seg of ribbonSegs) {
      adapted.push(adaptSegment(seg, window));
      adaptedId.push({ column: seg.column, strand: seg.strand, side: seg.side });
    }
    const segIndexOf = (column: number, strand: number, side: number): number =>
      adaptedId.findIndex((a) => a.column === column && a.strand === strand && a.side === side);
    for (const j of complex.junctions) {
      const segs = j.incident.map((inc) => segIndexOf(j.column, inc.strand, inc.side)).filter((i) => i >= 0);
      if (segs.length < 2) continue;
      junctions.push({ u: j.u / TAU, t: j.t, pinch: { upper: j.pinch.upper, lower: j.pinch.lower }, segs });
    }
  }

  const across = opts.across ?? 20;
  // M6: when carrying the crest THROUGH diamonds, `diamondClippedCreases` emits FLANKS only (the
  // crest is now a continuous through-diamond mesh edge) and `crestCreasesThroughDiamonds` adds the
  // crest along every visible ridge; the occluded under-strand cliffs it crosses are dropped in-sheet
  // by `weldSoftCliffs`. Otherwise (M5) the crest is a diamond-clipped strip like the flanks.
  // In the crest-through/clip path both the crest AND its flank strips run to the domain t-rims
  // (extendToRim), so the ribbon is fully structured up to the open rim and no coarse base facet
  // bridges r0→r0+relief there. M5 (crestThrough=false) passes extendToRim=false ⇒ byte-identical.
  const flankCreases = diamondClippedCreases(params, across, opts.creaseMarginT ?? 0.004, domain, !crestThrough, crestThrough);
  const creases = crestThrough
    ? [...flankCreases, ...crestCreasesThroughDiamonds(params, domain, opts.crestMarginT ?? CREST_END_MARGIN_T, true)]
    : flankCreases;
  // Ribbon u half-width (theta=2π·u): the crest sits at the strand centreline, the cliff edges
  // at ±strandWidth in localU ⇒ ±(strandWidth/(2·columnCount)) in u.
  const hw = params.strandWidth / (2 * params.columnCount);
  // Dense crest-band seeds through the overlap diamonds (opt-in): they finely tessellate the
  // diamond crest but do NOT bring it under 0.01mm — the crossing ridge needs the crest to be a
  // MESH EDGE there, i.e. crest-crossing planarization (documented remaining work). Off by
  // default so the build stays bounded; the honest diamond chord is the same either way.
  const seedPoints = opts.diamondSeeds ? diamondCrestSeeds(complex.junctions, params, domain, hw) : undefined;

  const stats: BuildStats = {
    refinePasses: 0,
    addedSheetPoints: 0,
    splitCliffEdges: 0,
    unwalledCliffEdges: 0,
    maxAnalyticChordMm: 0,
    pointCapHit: 0,
    voteFreeRegions: 0,
    tieCliffRegions: 0,
  };
  const mesh = buildDoubleValuedMesh(
    { segments: adapted, junctions, creases },
    surface,
    { H },
    {
      baseGridU: opts.baseGridU,
      baseGridT: opts.baseGridT,
      chordTolMm: opts.chordTolMm * 0.75, // refine a little under the report gate for margin
      maxRefinePasses: opts.maxRefinePasses,
      domain,
      oneSidedDelta: ONE_SIDED_DELTA,
      analyticChord: true,
      periodicU: true,
      refineCreases: true,
      // Clip path (T3): the cliffs are already pre-clipped to their visible sub-arcs, so the occluded
      // under-strand edges are ABSENT (nothing to soft-weld) — but the analytic-chord refine loop still
      // needs the straddle guard for the genuine (visible) ribbon↔background cliffs it must skip. M5/M6
      // (clip off): `weldSoftCliffs: crestThrough`, no straddle guard — byte-identical.
      weldSoftCliffs: crestThrough && !clip,
      straddleGuard: clip,
      seedPoints: clip ? undefined : seedPoints,
      pointCap: 400000,
    },
    stats,
  );

  // ---- verify: manifold + periodic-seam census (u-seam welded ⇒ open only on t-rims) ----
  const audit = auditManifold(mesh);
  const seam = periodicSeamAudit(mesh, domain);

  // ---- INDEPENDENT fidelity certification (classifier-free, vs the exact analytic surface) ----
  // I1 (P3b): evaluate each arc at ITS OWN tRange fraction, not the domain (T_LO..T_HI) fraction. A
  // clip-path arc (`adaptSegmentToRange`) spans only a sub-interval [lo,hi] of the band, so its `at(s)`
  // maps s∈[0,1] onto [lo,hi]; the domain fraction (t−T_LO)/(T_HI−T_LO) samples the wrong physical
  // height, mis-locating the locus the side-vote (verify.ts:338) and straddle guard (verify.ts:382) use.
  // For a full-band arc (M5: tRange === [T_LO,T_HI]) this is byte-identical — it corrects only the clip path.
  const cliffLocusDistance = (u: number, t: number): number => {
    let best = Infinity;
    for (const sg of adapted) {
      const s = clamp01((t - sg.tRange[0]) / (sg.tRange[1] - sg.tRange[0]));
      const d = Math.abs(u - sg.at(s).u);
      if (d < best) best = d;
    }
    return best;
  };
  const locusUAt = (seg: number, t: number): number => {
    const sg = adapted[seg];
    return sg.at(clamp01((t - sg.tRange[0]) / (sg.tRange[1] - sg.tRange[0]))).u;
  };
  const cert = certifyAgainstTrueSurface(mesh, surface, cliffLocusDistance, locusUAt, ONE_SIDED_DELTA);
  const regionStats = regionRadiusConsistency(mesh);
  const certification: SurfaceCertification = {
    maxSheetDevMm: cert.maxSheetDevMm,
    maxCliffDevMm: cert.maxCliffDevMm,
    sheetVertsChecked: cert.sheetVertsChecked,
    cliffVertsCertified: cert.cliffVertsCertified,
    cliffVertsSkipped: cert.cliffVertsSkipped,
    minRibbonMeanRadiusMm: regionStats.minRibbonMeanRadiusMm,
    maxBackgroundMeanRadiusMm: regionStats.maxBackgroundMeanRadiusMm,
    ribbonRegionCount: regionStats.ribbonRegionCount,
    backgroundRegionCount: regionStats.backgroundRegionCount,
  };

  const junctionLevels = measureJunctionLevels(mesh, junctions);
  const chordSplit = analyticChordSplit(mesh, junctions, surface, H);
  // Honest facet chord (M6): the true sheet-facet sag against the analytic surface, straddle-guarded
  // so a genuine ribbon↔background cliff (owned by the wall) is not counted as a facet error. This is
  // the load-bearing < 0.01mm-EVERYWHERE claim once the crest is carried through the diamonds.
  const facet = facetChordToTrueSurface(mesh, surface, H, { uPeriod: domain.uMax - domain.uMin });
  const md = toMeshData(mesh);
  const orient = checkOutwardWinding(md);

  const report: MeshReport = {
    vertexCount: md.vertexCount,
    triangleCount: md.triangleCount,
    nonManifold: audit.nonManifold,
    boundary: audit.boundary,
    cliffBoundary: audit.cliffBoundary,
    boundaryNonRim: audit.boundaryNonRim,
    maxChordMm: stats.maxAnalyticChordMm,
    rmsChordMm: chordSplit.rms,
    refinePasses: stats.refinePasses,
    certification,
    junctionCount: junctions.length,
    junctions: junctionLevels,
    occlusionWallCount: 0,
    occlusionWallLoci: 0,
    minOcclusionRaiseMm: 0,
    seamOpenEdges: seam.seamOpen,
    tRimBoundaryEdges: seam.tRim,
    orientationConsistent: orient.consistent,
    orientationInconsistentEdges: orient.inconsistentEdges,
    outwardWinding: orient.outward,
    signedVolumeMm3: orient.signedVolume,
    componentCount: orient.components,
    clearRegionMaxChordMm: chordSplit.clearMax,
    diamondMaxChordMm: chordSplit.diamondMax,
    facetMaxChordMm: facet.maxMm,
    facetRmsChordMm: facet.rmsMm,
    facetMaxU: facet.maxU,
    facetMaxT: facet.maxT,
    facetSamplesSkipped: facet.skipped,
  };
  return { mesh: md, report };
}
