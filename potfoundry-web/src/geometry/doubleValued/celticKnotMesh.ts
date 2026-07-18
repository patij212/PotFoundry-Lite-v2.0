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
import { toMeshData } from './mesh';
import { auditManifold, certifyAgainstTrueSurface, chordToSurface, regionRadiusConsistency } from './verify';
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

/** Clip a P1 segment to the window and convert its theta to normalized u. */
function adaptSegment(seg: CliffSegment, w: Window): SegLike {
  const { tLo, tHi } = w.domain;
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
 * Difference from M2: this feeds the FULL complex — all strands, their crossings, and the
 * declared `junctions`. At each junction several cliff curves meet, so the general
 * per-region split would emit a non-manifold FAN; instead the mesher pinches every incident
 * sheet + wall to the two shared `pinch` vertices (r0 / r0−jump) by radius level (the
 * 55→…→2 collapse). On the overlap-diamond sides the surface is z-buffer OCCLUDED, so cliff
 * vertices are lifted to the true one-sided analytic limit (the occluded raised neighbour),
 * not the naive r0 lip — which both makes the wall span the real occlusion step and keeps
 * the independent certifier ~0. Occlusion *segments/walls* proper + multi-column are M4/M5.
 */
export function buildCelticKnotColumnCrossingMesh(
  styleOptions: StyleOptions,
  dims: CelticKnotMeshDims,
  opts: CelticKnotMeshOptions,
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
  const complex = buildCelticKnotCliffComplex(params, cliffDims);

  const rA = buildAnalyticRadiusFn('CelticKnot', styleOptions, { H, Rb: dims.Rb, Rt: dims.Rt, expn });
  const surface: SurfaceRadiusFn = (u, t) => rA(TAU * u, t * H);

  // ---- one column + its ribbon-background strand edges ----
  const COLUMN = 0;
  const ribbonSegs = complex.segments.filter((s) => s.kind === 'ribbon-background' && s.column === COLUMN);
  if (ribbonSegs.length < 4) throw new Error(`expected >=4 ribbon edges in column ${COLUMN}, got ${ribbonSegs.length}`);
  const colJunctions = complex.junctions.filter((j) => j.column === COLUMN);
  if (colJunctions.length === 0) throw new Error('no crossing junctions (need >=2 strands whose edges cross)');

  // ---- window around ONE crossing (overlap diamond + its corner junctions) ----
  const window = crossingWindow(colJunctions);
  const domain = window.domain;

  const adapted: SegLike[] = [];
  const adaptedId: Array<{ strand: number; side: number }> = [];
  for (const seg of ribbonSegs) {
    adapted.push(adaptSegment(seg, window));
    adaptedId.push({ strand: seg.strand, side: seg.side });
  }
  const segIndexOf = (strand: number, side: number): number =>
    adaptedId.findIndex((a) => a.strand === strand && a.side === side);

  // in-window junctions → JunLike (normalized u; incident segment indices into `adapted`)
  const junctions: JunLike[] = [];
  for (const j of colJunctions) {
    if (j.t < domain.tLo || j.t > domain.tHi) continue;
    const segs = j.incident.map((inc) => segIndexOf(inc.strand, inc.side)).filter((i) => i >= 0);
    if (segs.length < 2) continue; // both incident edges must be present in the window
    junctions.push({ u: j.u / TAU, t: j.t, pinch: { upper: j.pinch.upper, lower: j.pinch.lower }, segs });
  }
  if (junctions.length === 0) throw new Error('crossing window captured no complete junction');

  const complexAdapted = { segments: adapted, junctions };

  // Conforming reference soup: a FINE run of the SAME mesher (same junctions + occlusion-aware
  // walls) so the chord metric measures facet error, not a uniform grid's false cliff/occlusion
  // floor. A uniform surface soup cannot represent the cliffs, the occlusion steps, or the pinch.
  const refMesh = buildDoubleValuedMesh(complexAdapted, surface, { H }, {
    baseGridU: 132,
    baseGridT: 128,
    chordTolMm: 1,
    maxRefinePasses: 0,
    domain,
    oneSidedDelta: ONE_SIDED_DELTA,
  });
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
    complexAdapted,
    surface,
    { H },
    {
      baseGridU: opts.baseGridU,
      baseGridT: opts.baseGridT,
      chordTolMm: innerTol,
      maxRefinePasses: opts.maxRefinePasses,
      domain,
      refSoup: refTris,
      oneSidedDelta: ONE_SIDED_DELTA,
    },
    stats,
  );

  // ---- verify: manifold + chord against the conforming reference soup ----
  const audit = auditManifold(mesh);
  const chord = chordToSurface(mesh, refTris);

  // ---- INDEPENDENT fidelity certification (does NOT go through the region classifier) ----
  const cliffLocusDistance = (u: number, t: number): number => {
    const s = clamp01((t - domain.tLo) / (domain.tHi - domain.tLo));
    let best = Infinity;
    for (const seg of adapted) {
      const d = Math.abs(u - seg.at(s).u);
      if (d < best) best = d;
    }
    return best;
  };
  const locusUAt = (seg: number, t: number): number => {
    const s = clamp01((t - domain.tLo) / (domain.tHi - domain.tLo));
    return adapted[seg].at(s).u;
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
  };
  return { mesh: md, report };
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
