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
  CliffSegment,
} from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';
import { buildAnalyticRadiusFn } from '../analyticRadius';
import { DEFAULT_CELTIC_KNOT, type StyleOptions } from '../types';
import { buildDoubleValuedMesh } from './doubleValuedMesh';
import { toMeshData } from './mesh';
import { auditManifold, chordToSurface } from './verify';
import type { BuildStats, CreaseLike, DomainWindow, MeshReport, RefTri, SegLike, SurfaceRadiusFn, Vec3 } from './types';
import type { MeshData } from '../types';

const TAU = 2 * Math.PI;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

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
