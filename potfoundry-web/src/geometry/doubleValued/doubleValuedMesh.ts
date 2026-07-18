// doubleValuedMesh.ts — the general standalone core: turn a declared cliff complex
// + an exact surface radius fn into a watertight, double-valued-wall triangle mesh.
//
// Pipeline (fully style-agnostic):
//   1. constrained-CDT the (u,t) domain with the cliff polylines as constraint edges;
//   2. classify each triangle into a REGION = a topological connected component whose
//      triangle adjacency never crosses a cliff constraint edge (each component is one
//      z-buffer sheet: ribbon-interior vs background);
//   3. split every cliff point into one mesh vertex per incident region (the double-
//      valuedness), lifting a region-interior point to `surface(u,t)` and a cliff point
//      to the region's one-sided lip (ribbon side -> upper, background side -> lower,
//      decided by nudging into the region interior and matching the nearer lip);
//   4. bridge each cliff's two region-rails with flat wall quads welded to those exact
//      split vertices, so the seam is closed by construction;
//   5. refine: subdivide any sheet triangle / wall interval whose midpoint deviates from
//      the true surface by more than `chordTolMm`, re-lift, repeat (up to maxRefinePasses).

import cdt2d from 'cdt2d';
import { createMesh, addVertex, addTriangle, addQuad } from './mesh';
import { buildTriDistance } from './verify';
import type {
  BuildStats,
  CliffComplexLike,
  CreaseLike,
  DomainWindow,
  JunLike,
  Mesh,
  MeshBuildOptions,
  RefTri,
  SegLike,
  SurfaceRadiusFn,
  Vec3,
  WallRecord,
} from './types';

const TAU = 2 * Math.PI;
/** Numerical slack for rim detection (domain coords are O(1)). */
const RIM_EPS = 1e-9;

type Lip = { lower: number; upper: number };
type UV = readonly [number, number];

/** One sample along a cliff polyline (in arc order). */
interface CliffSample {
  s: number;
  u: number;
  t: number;
  lower: number;
  upper: number;
  /**
   * Index of the declared crossing junction this sample is SNAPPED onto (M3+). All samples
   * across every incident segment sharing a junction index collapse to ONE CDT point in
   * `assemble`, so the crossing constraint edges MEET at a single vertex (planar PSLG).
   */
  junction?: number;
}
/** The mutable per-cliff sampling state (refined in place). */
interface CliffState {
  seg: SegLike;
  samples: CliffSample[];
}
/** One sample along a crease polyline (in arc order). */
interface CreaseSample {
  /** Arc parameter s∈[0,1] along the crease (bisected during crease refinement). */
  s: number;
}
/** The mutable per-crease sampling state (in-sheet constraint line; refined in place when enabled). */
interface CreaseState {
  cr: CreaseLike;
  samples: CreaseSample[];
}

/** Cylindrical lift matching the rest of the app: theta = 2*pi*u, z = t*H. */
const lift = (u: number, t: number, r: number, H: number): Vec3 => [
  r * Math.cos(TAU * u),
  r * Math.sin(TAU * u),
  t * H,
];

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Insert a sample into an arc-ordered list, keeping it sorted by `s` (first-fit before a larger s). */
function insertSampleSorted<T extends { s: number }>(list: T[], sample: T): void {
  let idx = list.length;
  for (let m = 0; m < list.length; m += 1) {
    if (list[m].s > sample.s) {
      idx = m;
      break;
    }
  }
  list.splice(idx, 0, sample);
}

export function buildDoubleValuedMesh(
  complex: CliffComplexLike,
  surface: SurfaceRadiusFn,
  dims: { H: number },
  opts: MeshBuildOptions,
  stats?: BuildStats,
  wallsOut?: WallRecord[],
): Mesh {
  const { H } = dims;
  const { baseGridU, baseGridT, chordTolMm, maxRefinePasses } = opts;
  const periodicU = opts.periodicU ?? false;
  const refineCreases = opts.refineCreases ?? false;
  const weldSoftCliffs = opts.weldSoftCliffs ?? false;
  // The reference-free refine metric skips genuine cliff-straddle samples when soft-welding OR when
  // cliffs are pre-clipped to their visible sub-arcs (T2). `weldSoftCliffs` implies the guard; the
  // explicit `straddleGuard` turns the SAME guard on for the clip path (no soft-weld). M1–M5: false.
  const straddleGuard = weldSoftCliffs || (opts.straddleGuard ?? false);

  // 1. Domain window. Default (M1): full circle u in [0,1], t spanning the cliff band.
  const domain: DomainWindow = opts.domain ?? {
    uMin: 0,
    uMax: 1,
    tLo: Math.min(...complex.segments.map((s) => s.tRange[0])),
    tHi: Math.max(...complex.segments.map((s) => s.tRange[1])),
  };

  // 2. Mutable sampling state: a base (u,t) grid + one sample chain per cliff segment.
  const gridPts: Array<[number, number]> = [];
  for (let i = 0; i < baseGridU; i += 1) {
    const u = domain.uMin + (domain.uMax - domain.uMin) * (i / (baseGridU - 1));
    for (let j = 0; j < baseGridT; j += 1) {
      const t = domain.tLo + (domain.tHi - domain.tLo) * (j / (baseGridT - 1));
      gridPts.push([u, t]);
    }
  }
  if (opts.seedPoints) for (const [u, t] of opts.seedPoints) gridPts.push([u, t]);
  const cliffs: CliffState[] = complex.segments.map((seg) => {
    const samples: CliffSample[] = [];
    for (let j = 0; j < baseGridT; j += 1) {
      const s = j / (baseGridT - 1);
      const { u, t } = seg.at(s);
      const { lower, upper } = seg.lipsAt(s);
      samples.push({ s, u, t, lower, upper });
    }
    return { seg, samples };
  });

  // Snap each declared crossing junction onto its incident segments: insert one sample at the
  // EXACT junction (u,t) on every incident segment, tagged with the junction index. In
  // `assemble` all samples sharing a junction index collapse to a single shared CDT point, so
  // (a) the crossing constraint edges MEET there instead of crossing (cdt2d needs a planar
  // PSLG) and (b) the incident walls pinch to the one shared double-vertex.
  const tSpan = domain.tHi - domain.tLo;
  for (let k = 0; k < complex.junctions.length; k += 1) {
    const jn = complex.junctions[k];
    const sDom = tSpan > 0 ? (jn.t - domain.tLo) / tSpan : 0;
    if (sDom < -1e-9 || sDom > 1 + 1e-9) continue; // junction outside this window
    for (const segIdx of jn.segs) {
      const st = cliffs[segIdx];
      if (!st) continue;
      // Sort the junction sample by ITS OWN segment's arc fraction, not the domain fraction: a T2
      // visible-envelope-CLIPPED arc spans only a sub-interval of the window, so a domain-fraction s
      // would place the junction in the middle of the arc's chain (a non-monotonic t spike). For a
      // full-band arc (M1–M5: tRange === the window) segLo/segHi === domain.tLo/tHi, so sSeg === the
      // old sDom and the inserted sample is byte-identical.
      const segLo = st.seg.tRange[0];
      const segHi = st.seg.tRange[1];
      const segSpan = segHi - segLo;
      const sSeg = segSpan > 0 ? (jn.t - segLo) / segSpan : 0;
      const sClamped = sSeg < 0 ? 0 : sSeg > 1 ? 1 : sSeg;
      const sample: CliffSample = {
        s: sClamped,
        u: jn.u,
        t: jn.t,
        lower: jn.pinch.lower,
        upper: jn.pinch.upper,
        junction: k,
      };
      // A T2 visible-envelope-clipped arc TERMINATES on this crossing, so its endpoint base sample sits
      // at the junction (u,t): UPGRADE that sample in place to the shared pinch vertex instead of adding
      // a coincident CDT point (which would degenerate the wall). A full-band arc (M1–M5) meets a
      // junction mid-arc with no coincident base sample ⇒ the insert path runs, byte-identical.
      const hit = st.samples.findIndex(
        (sm) => Math.abs(sm.u - jn.u) < 1e-6 && Math.abs(sm.t - jn.t) < 1e-6,
      );
      if (hit >= 0) st.samples[hit] = sample;
      else insertSampleSorted(st.samples, sample);
    }
  }
  // When crossings are declared, lift each cliff split-vertex to the TRUE one-sided analytic
  // limit taken from inside its own region (not the naive declared lip): on an overlap-diamond
  // side that limit is the occluded (raised) neighbour, so the wall spans the real occlusion
  // step and the independent certifier reads ~0. Genuine ribbon↔background cliffs are
  // unaffected (their one-sided limits ARE r0 / r0−jump).
  const occlusionAware = complex.junctions.length > 0;
  const oneSidedDelta = opts.oneSidedDelta ?? 1e-6;
  // Creases: in-sheet conforming polylines (ridge apexes / iso-fraction ribbon lines).
  // They constrain the triangulation (so triangles never cross a sharp ridge and the ribbon
  // becomes clean structured strips) but never split a region or get a wall. Sampled on the
  // SAME t-grid as the cliffs so the strips between constraint lines are clean quads.
  // Crease sampling is PROPORTIONAL to the crease's t-length (a full-height crease keeps the
  // baseGridT count, so M2 is byte-identical; a short diamond-clipped crest fragment is not
  // over-sampled). With `refineCreases` the sample count then grows adaptively along t.
  const domainSpanT = domain.tHi - domain.tLo;
  const creases: CreaseState[] = (complex.creases ?? []).map((cr) => {
    const frac = domainSpanT > 0 ? Math.abs(cr.tRange[1] - cr.tRange[0]) / domainSpanT : 1;
    const n = Math.max(2, Math.ceil(baseGridT * Math.min(1, frac)));
    const samples: CreaseSample[] = [];
    for (let j = 0; j < n; j += 1) samples.push({ s: j / (n - 1) });
    return { cr, samples };
  });


  // 3. Build; if refining, measure GEOMETRICALLY against a hole-free reference soup of
  //    the true surface (sampling the discontinuous radius across a cliff would fabricate
  //    ~jump-sized phantom chord). Refine until the chord is under tol (or passes run out).
  // Reference-free (analytic) chord measures facet sag directly against `surface` at the
  // parameter-space midpoint; otherwise fall back to nearest-distance to a reference soup.
  const analytic = opts.analyticChord ? { surface, H } : undefined;
  const dist =
    maxRefinePasses > 0 && !analytic
      ? buildTriDistance(opts.refSoup ?? buildSurfaceReferenceSoup(surface, domain, complex.segments, H))
      : () => 0;
  const POINT_CAP = opts.pointCap ?? 60000; // hard bound on the sampling set (logged, never silent)
  const uPeriod = periodicU ? domain.uMax - domain.uMin : undefined;
  let result = assemble(gridPts, cliffs, creases, surface, domain, H, complex.junctions, occlusionAware, oneSidedDelta, periodicU, weldSoftCliffs);
  let m = measure(result, dist, chordTolMm, analytic, refineCreases, uPeriod, straddleGuard);
  let addedSheetPoints = 0;
  let splitCliffEdges = 0;
  let splitCreaseEdges = 0;
  let passes = 0;
  let cappedAt = 0;
  while (passes < maxRefinePasses && m.maxChord >= chordTolMm) {
    if (gridPts.length >= POINT_CAP) {
      cappedAt = gridPts.length;
      break;
    }
    addedSheetPoints += applyCentroids(gridPts, m.centroidInserts);
    splitCliffEdges += applyCliffSplits(cliffs, m.cliffSplits);
    if (refineCreases) splitCreaseEdges += applyCreaseSplits(creases, m.creaseSplits);
    result = assemble(gridPts, cliffs, creases, surface, domain, H, complex.junctions, occlusionAware, oneSidedDelta, periodicU, weldSoftCliffs);
    m = measure(result, dist, chordTolMm, analytic, refineCreases, uPeriod, straddleGuard);
    passes += 1;
  }
  void splitCreaseEdges;

  if (stats) {
    stats.refinePasses = passes;
    stats.addedSheetPoints = addedSheetPoints;
    stats.splitCliffEdges = splitCliffEdges;
    stats.unwalledCliffEdges = result.unwalled;
    stats.maxAnalyticChordMm = m.maxChord;
    stats.pointCapHit = cappedAt;
    stats.voteFreeRegions = result.voteFreeRegions;
    stats.tieCliffRegions = result.tieCliffRegions;
  }

  // Expose the emitted walls (final pass) read-only: each wall interval's segment, locus, and
  // its two incident region rail radii. A style entry uses this to identify which walls are
  // occlusion curtains (M4) — the mesher itself stays style-agnostic and adds no occlusion wall.
  if (wallsOut) {
    const pos = result.mesh.positions;
    const U = result.mesh.vertexU;
    const T = result.mesh.vertexT;
    const rOf = (v: number): number => Math.hypot(pos[v * 3], pos[v * 3 + 1]);
    for (const wq of result.wallQuads) {
      const [aP, bP, bQ, aQ] = wq.v;
      wallsOut.push({
        ci: wq.ci,
        interval: wq.interval,
        u: (U[aP] + U[bP]) / 2,
        t: (T[aP] + T[bP]) / 2,
        railA: (rOf(aP) + rOf(bP)) / 2,
        railB: (rOf(aQ) + rOf(bQ)) / 2,
      });
    }
  }
  // Never let an undecided region classification pass silently (see the vote loop in
  // `assemble`): a non-zero tie is a real anomaly, a vote-free region is inert but surfaced.
  if (result.tieCliffRegions > 0 || result.voteFreeRegions > 0) {
    console.warn(
      `[doubleValuedMesh] region classification defaulted to background for ` +
        `${result.tieCliffRegions} non-zero cliff-vote tie(s) and ` +
        `${result.voteFreeRegions} cliff-vote-free region(s).`,
    );
  }
  // M5: close the periodic u-seam on the FINAL mesh (measure/wallsOut have already read the
  // open-seam intermediate; welding + compacting only rewrites indices/positions). Done once,
  // after the refine loop, so the tube is watertight with open edges only on the two t-rims.
  if (periodicU) weldPeriodicSeamAndCompact(result.mesh, domain);
  return result.mesh;
}

/**
 * Weld the periodic u-seam (M5) and drop the now-orphaned duplicate vertices.
 *
 * `theta = 2π·u`, so a vertex at `u = uMax` sits at the IDENTICAL 3D point as the vertex at
 * `u = uMin` with the same t (and the CelticKnot strands never reach the column edges, so the
 * seam is always plain background — one vertex per t on each side, no cliff/wall there). Every
 * u=uMax seam vertex is therefore merged onto the coincident u=uMin vertex by rounded 3D
 * position (restricted to seam vertices, so nothing interior is ever fused), the triangle
 * indices are remapped, and the vertex buffer is compacted to keep `vertexCount` honest.
 */
function weldPeriodicSeamAndCompact(mesh: Mesh, domain: DomainWindow): void {
  const n = mesh.positions.length / 3;
  const isSeam = (v: number): boolean =>
    mesh.vertexU[v] <= domain.uMin + RIM_EPS || mesh.vertexU[v] >= domain.uMax - RIM_EPS;
  // 1. weld: canonical seam vertex per rounded 3D position (1e-5 mm), seam vertices only.
  const canon = new Int32Array(n);
  for (let v = 0; v < n; v += 1) canon[v] = v;
  const Q = 1e5;
  const seamMap = new Map<string, number>();
  for (let v = 0; v < n; v += 1) {
    if (!isSeam(v)) continue;
    const k = `${Math.round(mesh.positions[v * 3] * Q)}:${Math.round(mesh.positions[v * 3 + 1] * Q)}:${Math.round(mesh.positions[v * 3 + 2] * Q)}`;
    const c = seamMap.get(k);
    if (c === undefined) seamMap.set(k, v);
    else canon[v] = c;
  }
  const tris = mesh.triangles;
  for (let i = 0; i < tris.length; i += 1) tris[i] = canon[tris[i]];

  // 2. compact: keep only vertices still referenced, rebuilding the index-aligned tag arrays.
  const used = new Uint8Array(n);
  for (let i = 0; i < tris.length; i += 1) used[tris[i]] = 1;
  const remap = new Int32Array(n);
  const positions: number[] = [];
  const vertexOnCliff: boolean[] = [];
  const vertexOnRim: boolean[] = [];
  const vertexU: number[] = [];
  const vertexT: number[] = [];
  const vertexRegion: number[] = [];
  const vertexCliffSeg: number[] = [];
  const vertexIsJunction: boolean[] = [];
  let next = 0;
  for (let v = 0; v < n; v += 1) {
    if (!used[v]) {
      remap[v] = -1;
      continue;
    }
    remap[v] = next;
    next += 1;
    positions.push(mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]);
    vertexOnCliff.push(mesh.vertexOnCliff[v]);
    vertexOnRim.push(mesh.vertexOnRim[v]);
    vertexU.push(mesh.vertexU[v]);
    vertexT.push(mesh.vertexT[v]);
    vertexRegion.push(mesh.vertexRegion[v]);
    vertexCliffSeg.push(mesh.vertexCliffSeg[v]);
    vertexIsJunction.push(mesh.vertexIsJunction[v]);
  }
  for (let i = 0; i < tris.length; i += 1) tris[i] = remap[tris[i]];
  mesh.positions = positions;
  mesh.vertexOnCliff = vertexOnCliff;
  mesh.vertexOnRim = vertexOnRim;
  mesh.vertexU = vertexU;
  mesh.vertexT = vertexT;
  mesh.vertexRegion = vertexRegion;
  mesh.vertexCliffSeg = vertexCliffSeg;
  mesh.vertexIsJunction = vertexIsJunction;
  // regionIsRibbon is per-region (not per-vertex) — unchanged by the weld/compact.
}

/**
 * Dense, HOLE-FREE reference triangle soup of the true surface: the analytic radius on a
 * fine (u,t) grid (every cell kept — cliff-straddling cells become near-vertical ramps
 * that, with the explicit wall faces, cover the seam) plus the wall ruled faces from each
 * cliff's lips. Used as the geometric target for chord measurement.
 */
export function buildSurfaceReferenceSoup(
  surface: SurfaceRadiusFn,
  domain: DomainWindow,
  segments: ReadonlyArray<SegLike>,
  H: number,
  dU = 240,
  dT = 240,
  nWall = 512,
): RefTri[] {
  const tris: RefTri[] = [];
  const { uMin, uMax, tLo, tHi } = domain;
  const pos: Vec3[][] = [];
  for (let i = 0; i <= dU; i += 1) {
    const u = uMin + ((uMax - uMin) * i) / dU;
    const row: Vec3[] = [];
    for (let j = 0; j <= dT; j += 1) {
      const t = tLo + ((tHi - tLo) * j) / dT;
      row.push(lift(u, t, surface(u, t), H));
    }
    pos.push(row);
  }
  for (let i = 0; i < dU; i += 1) {
    for (let j = 0; j < dT; j += 1) {
      const a = pos[i][j];
      const b = pos[i + 1][j];
      const c = pos[i + 1][j + 1];
      const d = pos[i][j + 1];
      tris.push([a, b, c]);
      tris.push([a, c, d]);
    }
  }
  for (const seg of segments) {
    let prevUp: Vec3 | null = null;
    let prevLo: Vec3 | null = null;
    for (let k = 0; k <= nWall; k += 1) {
      const s = k / nWall;
      const { u, t } = seg.at(s);
      const { upper, lower } = seg.lipsAt(s);
      const up = lift(u, t, upper, H);
      const lo = lift(u, t, lower, H);
      if (prevUp && prevLo) {
        tris.push([prevUp, up, lo]);
        tris.push([prevUp, lo, prevLo]);
      }
      prevUp = up;
      prevLo = lo;
    }
  }
  return tris;
}

// ---------------------------------------------------------------------------
// Assembly: CDT -> regions -> split-lift sheets -> wall bridges.
// ---------------------------------------------------------------------------

interface SheetTri {
  cdt: [number, number, number];
  v: [number, number, number];
  region: number;
}
interface WallQuad {
  ci: number;
  interval: number;
  v: [number, number, number, number];
}
interface Assembled {
  mesh: Mesh;
  pts: Array<[number, number]>;
  sheetTris: SheetTri[];
  wallQuads: WallQuad[];
  cliffs: CliffState[];
  cliffEdgeSet: Set<string>;
  creaseEdgeInfo: Map<string, { cr: number; interval: number }>;
  unwalled: number;
  voteFreeRegions: number;
  tieCliffRegions: number;
}

function assemble(
  gridPts: ReadonlyArray<[number, number]>,
  cliffs: CliffState[],
  creases: ReadonlyArray<CreaseState>,
  surface: SurfaceRadiusFn,
  domain: DomainWindow,
  H: number,
  junctions: ReadonlyArray<JunLike>,
  occlusionAware: boolean,
  oneSidedDelta: number,
  periodicU: boolean,
  weldSoftCliffs: boolean,
): Assembled {
  // A cliff sample is SOFT (occluded — the visible over-ribbon is continuous across its locus)
  // when the surface barely jumps there. Its interval carries no real wall, so under
  // `weldSoftCliffs` it is meshed in-sheet (constraint kept for planarity, but no region split,
  // no wall, vertices welded to one `surface(u,t)` point) — de-fragmenting overlap diamonds.
  const SOFT_JUMP = 0.05;
  const SOFT_DU = 2e-4;
  const isSoftAt = (u: number, t: number): boolean =>
    weldSoftCliffs && Math.abs(surface(u + SOFT_DU, t) - surface(u - SOFT_DU, t)) < SOFT_JUMP;
  const pts: Array<[number, number]> = [];
  const cliffLip: Array<Lip | null> = [];
  const cliffSegOf: number[] = []; // segment index this point's locus belongs to; -1 for sheet points
  const ptJunction: number[] = []; // declared-junction index this point pinches to; -1 otherwise
  const ptWeld: number[] = []; // >=0 ⇒ soft (occluded) point welded to ONE single-valued vertex; -1 otherwise
  const pushPt = (u: number, t: number, lip: Lip | null, seg = -1): number => {
    pts.push([u, t]);
    cliffLip.push(lip);
    cliffSegOf.push(seg);
    ptJunction.push(-1);
    ptWeld.push(-1);
    return pts.length - 1;
  };

  for (const [u, t] of gridPts) pushPt(u, t, null);

  const edges: Array<[number, number]> = [];
  const chains: number[][] = [];
  const cliffEdgeSet = new Set<string>();
  const cliffEdgeInfo = new Map<string, { ci: number; interval: number }>();
  // Shared CDT point per declared junction: the first incident segment that reaches the
  // junction creates it, every other incident segment reuses it — so their constraint chains
  // MEET at that single vertex (planar PSLG) instead of crossing.
  const junctionPt = new Map<number, number>();
  // Edges of INERT (soft, occluded) cliff intervals: kept as CDT constraints for planarity, but
  // NOT split (regions union across them) and NOT walled — so the buried under-cliff no longer
  // fragments the over-ribbon. Skipped in the wall loop (not counted as `unwalled`).
  const inertEdges = new Set<string>();
  for (let ci = 0; ci < cliffs.length; ci += 1) {
    const chain: number[] = [];
    let prev = -1;
    const { samples } = cliffs[ci];
    // Per-sample softness: an occluded stretch where the surface is continuous across the locus.
    const soft = samples.map((sm) => sm.junction === undefined && isSoftAt(sm.u, sm.t));
    for (let j = 0; j < samples.length; j += 1) {
      const sm = samples[j];
      // Drop INTERIOR soft samples (both neighbours also soft): the occluded under-cliff has no
      // visible step there, so its Steiner point serves nothing and — worse — sits on the very (u,t)
      // a crest crease crosses, spawning a coincident near-vertical sliver. Dropping it lets the
      // crest cross truly empty space. Soft samples at a hard/soft BOUNDARY are kept + welded so the
      // fading occlusion wall converges to one vertex (a clean taper), never left dangling.
      if (weldSoftCliffs && soft[j] && j > 0 && j < samples.length - 1 && soft[j - 1] && soft[j + 1]) continue;
      let id: number;
      if (sm.junction !== undefined) {
        const shared = junctionPt.get(sm.junction);
        if (shared !== undefined) {
          id = shared;
        } else {
          id = pushPt(sm.u, sm.t, { lower: sm.lower, upper: sm.upper }, ci);
          ptJunction[id] = sm.junction;
          junctionPt.set(sm.junction, id);
        }
      } else {
        id = pushPt(sm.u, sm.t, { lower: sm.lower, upper: sm.upper }, ci);
        // WELD a kept soft (boundary) point to one single-valued vertex at surface(u,t).
        if (soft[j]) ptWeld[id] = 1;
      }
      chain.push(id);
      if (prev >= 0 && prev !== id) {
        const k = edgeKey(prev, id);
        // A both-soft interval is INERT: the occluded under-cliff carries no visible step there, so
        // it is DROPPED entirely — no constraint edge (the crest crease crosses free space, planar,
        // no crossing to planarize), no region split, no wall. HARD intervals stay real cliffs.
        if (weldSoftCliffs && ptWeld[prev] >= 0 && ptWeld[id] >= 0) {
          inertEdges.add(k);
        } else {
          edges.push([prev, id]);
          cliffEdgeSet.add(k);
          cliffEdgeInfo.set(k, { ci, interval: j - 1 });
        }
      }
      prev = id;
    }
    chains.push(chain);
  }

  // Creases: enforced as CDT constraints (so no triangle crosses the ridge apex) but NOT
  // added to cliffEdgeSet — regions union across them and they get no wall. Their edges ARE
  // recorded (creaseEdgeInfo) so the refine loop can bisect a crease interval whose sheet
  // chord is too large (a snaking crest line sampled too coarsely).
  const creaseEdgeInfo = new Map<string, { cr: number; interval: number }>();
  for (let cr = 0; cr < creases.length; cr += 1) {
    const { cr: creaseLike, samples } = creases[cr];
    let prev = -1;
    for (let j = 0; j < samples.length; j += 1) {
      const sm = samples[j];
      const { u, t } = creaseLike.at(sm.s);
      const id = pushPt(u, t, null);
      if (prev >= 0 && prev !== id) {
        edges.push([prev, id]);
        creaseEdgeInfo.set(edgeKey(prev, id), { cr, interval: j - 1 });
      }
      prev = id;
    }
  }

  // Keep every face: the grid's hull is the domain rectangle, so exterior+interior fills
  // it; the cliff constraint edges are enforced and present in the output.
  const tris = cdt2d(pts, edges, { exterior: true, interior: true }) as Array<[number, number, number]>;

  // ---- region = connected components not crossing a cliff constraint edge ----
  const uf = new Int32Array(tris.length);
  for (let i = 0; i < tris.length; i += 1) uf[i] = i;
  const find = (x: number): number => {
    let r = x;
    while (uf[r] !== r) {
      uf[r] = uf[uf[r]];
      r = uf[r];
    }
    return r;
  };
  const edgeTri = new Map<string, number[]>();
  for (let ti = 0; ti < tris.length; ti += 1) {
    const [a, b, c] = tris[ti];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const k = edgeKey(p, q);
      const bucket = edgeTri.get(k);
      if (bucket) bucket.push(ti);
      else edgeTri.set(k, [ti]);
    }
  }
  for (const [k, bucket] of edgeTri) {
    if (bucket.length === 2 && !cliffEdgeSet.has(k)) {
      const ra = find(bucket[0]);
      const rb = find(bucket[1]);
      if (ra !== rb) uf[ra] = rb;
    }
  }
  const regionDense = new Int32Array(tris.length);
  const denseOf = new Map<number, number>();
  let regionCount = 0;
  for (let ti = 0; ti < tris.length; ti += 1) {
    const root = find(ti);
    let d = denseOf.get(root);
    if (d === undefined) {
      d = regionCount;
      regionCount += 1;
      denseOf.set(root, d);
    }
    regionDense[ti] = d;
  }

  // ---- per-region ribbon/background classification (nudge into interior, match lip) ----
  const ribVotes = new Float64Array(regionCount);
  const bgVotes = new Float64Array(regionCount);
  for (let ti = 0; ti < tris.length; ti += 1) {
    const [a, b, c] = tris[ti];
    const reg = regionDense[ti];
    const cu = (pts[a][0] + pts[b][0] + pts[c][0]) / 3;
    const ct = (pts[a][1] + pts[b][1] + pts[c][1]) / 3;
    let sc = -1;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const info = cliffEdgeInfo.get(edgeKey(p, q));
      if (!info) continue;
      if (sc < 0) sc = surface(cu, ct);
      const s0 = cliffs[info.ci].samples[info.interval];
      const s1 = cliffs[info.ci].samples[info.interval + 1];
      const avgU = (s0.upper + s1.upper) / 2;
      const avgL = (s0.lower + s1.lower) / 2;
      if (Math.abs(sc - avgU) <= Math.abs(sc - avgL)) ribVotes[reg] += 1;
      else bgVotes[reg] += 1;
    }
  }
  const isRibbon = new Array<boolean>(regionCount);
  let voteFreeRegions = 0;
  let tieCliffRegions = 0;
  for (let r = 0; r < regionCount; r += 1) {
    const rib = ribVotes[r];
    const bg = bgVotes[r];
    // Surface the two cases the bare `rib > bg` used to swallow silently: a region touching
    // no cliff edge (rib === bg === 0 — its label is inert, it owns no cliff vertex) and a
    // genuine NON-zero tie (rib === bg > 0 — a region's own cliff edges disagree on which
    // side is ribbon, which should never happen). Both are counted and threaded to stats.
    if (rib === bg) {
      if (rib === 0) voteFreeRegions += 1;
      else tieCliffRegions += 1;
    }
    isRibbon[r] = rib > bg;
  }

  // ---- one-sided-limit machinery (occlusion-faithful cliff lift; M3+) ----
  // Direction into a region at a cliff point, matching the certifier: for each interior sheet
  // neighbour of a (non-junction) cliff point in that region, vote for the u-SIDE of the
  // cliff's OWN locus the neighbour lies on — measured against the locus at the neighbour's t
  // (snake-robust). The cliff vertex is then lifted to surface(u ∓ δ, t) taken from that side.
  // I1/sSeg parity (P3b): evaluate the locus at the cliff arc's OWN tRange fraction, NOT the domain
  // fraction. A T2/T3 visible-envelope-CLIPPED arc spans only a sub-interval [lo,hi] of the window, so
  // its `at(s)` maps s∈[0,1] onto [lo,hi]; the domain fraction (t−tLo)/tSpan samples the arc at the WRONG
  // height and can flip a fragile side-vote at an occlusion-corner cliff point — mis-lifting it a full
  // radial jump off its own region's sheets (measured: T2 cliff vertex placed 0.60mm below its region).
  // For a full-band arc (M1–M6a: tRange === the window) lo/hi === domain.tLo/tHi, so this is byte-identical
  // — it corrects only the clip path, and keeps the mesher consistent with the independent certifier.
  const locusU = (ci: number, t: number): number => {
    const sg = cliffs[ci].seg;
    const lo = sg.tRange[0];
    const hi = sg.tRange[1];
    const span = hi - lo;
    const s = span > 0 ? (t - lo) / span : 0;
    return sg.at(s < 0 ? 0 : s > 1 ? 1 : s).u;
  };
  const regCenU = new Float64Array(regionCount);
  const regCenT = new Float64Array(regionCount);
  const regCenN = new Int32Array(regionCount);
  const dirAcc = new Map<number, { sum: number; cnt: number }>();
  const dirKey = (pi: number, reg: number): number => pi * (regionCount + 1) + reg;
  for (let ti = 0; ti < tris.length; ti += 1) {
    const tri = tris[ti];
    const reg = regionDense[ti];
    regCenU[reg] += (pts[tri[0]][0] + pts[tri[1]][0] + pts[tri[2]][0]) / 3;
    regCenT[reg] += (pts[tri[0]][1] + pts[tri[1]][1] + pts[tri[2]][1]) / 3;
    regCenN[reg] += 1;
    if (!occlusionAware) continue;
    for (let a = 0; a < 3; a += 1) {
      const p = tri[a];
      if (cliffLip[p] === null || ptJunction[p] >= 0 || cliffSegOf[p] < 0) continue;
      for (let b = 0; b < 3; b += 1) {
        if (b === a) continue;
        const q = tri[b];
        if (cliffLip[q] !== null) continue; // interior sheet neighbour only
        const side = pts[q][0] - locusU(cliffSegOf[p], pts[q][1]) >= 0 ? 1 : -1;
        const kk = dirKey(p, reg);
        const acc = dirAcc.get(kk);
        if (acc) {
          acc.sum += side;
          acc.cnt += 1;
        } else dirAcc.set(kk, { sum: side, cnt: 1 });
      }
    }
  }
  for (let r = 0; r < regionCount; r += 1)
    if (regCenN[r] > 0) {
      regCenU[r] /= regCenN[r];
      regCenT[r] /= regCenN[r];
    }
  /** True one-sided analytic limit of the surface into `region` at cliff point `pi`. */
  const oneSidedLimit = (pi: number, region: number): number => {
    const [u, t] = pts[pi];
    const acc = dirAcc.get(dirKey(pi, region));
    if (acc && acc.cnt > 0) return surface(u + (acc.sum >= 0 ? oneSidedDelta : -oneSidedDelta), t);
    // Fallback (thin region without an interior sheet neighbour): nudge toward its centroid.
    let du = regCenU[region] - u;
    let dt = regCenT[region] - t;
    const mag = Math.hypot(du, dt);
    if (mag < 1e-12) return surface(u, t);
    du /= mag;
    dt /= mag;
    return surface(u + du * oneSidedDelta, t + dt * oneSidedDelta);
  };

  // ---- split-lift: one mesh vertex per (cdtPointIndex, region); junctions pinch by level ----
  const mesh = createMesh();
  // For a PERIODIC-u pot the u=uMin/uMax edges are NOT open rims — they weld to each other —
  // so only the t-rims count as declared-open. Tagging the seam as non-rim makes an unwelded
  // seam surface as `boundaryNonRim` (a caught defect) instead of being hidden as "rim".
  const onRimPt = (u: number, t: number): boolean => {
    const tRim = t <= domain.tLo + RIM_EPS || t >= domain.tHi - RIM_EPS;
    if (periodicU) return tRim;
    return tRim || u <= domain.uMin + RIM_EPS || u >= domain.uMax - RIM_EPS;
  };
  const tagVertex = (id: number, u: number, t: number, region: number, seg: number, onCliff: boolean, isJn: boolean): void => {
    mesh.vertexOnCliff[id] = onCliff;
    mesh.vertexOnRim[id] = onRimPt(u, t);
    mesh.vertexU[id] = u;
    mesh.vertexT[id] = t;
    mesh.vertexRegion[id] = region;
    mesh.vertexCliffSeg[id] = seg;
    mesh.vertexIsJunction[id] = isJn;
  };
  // Junction pinch: exactly two shared vertices per crossing — upper (r0) and lower (r0−jump).
  // Every incident sheet/wall copy is routed by its radius LEVEL (ribbon→upper, background→
  // lower), so N incident sheets collapse to 2 vertices (the 55→…→2 pinch) instead of a fan.
  // Lazily created so an unused level never leaves a floating vertex.
  const junctionUpper = new Map<number, number>();
  const junctionLower = new Map<number, number>();
  const junctionVert = (jk: number, upper: boolean, region: number, pi: number): number => {
    const store = upper ? junctionUpper : junctionLower;
    const existing = store.get(jk);
    if (existing !== undefined) return existing;
    const jn = junctions[jk];
    const r = upper ? jn.pinch.upper : jn.pinch.lower;
    const [x, y, z] = lift(jn.u, jn.t, r, H);
    const id = addVertex(mesh, x, y, z);
    // Tag with the routing region (a ribbon region for upper, a background region for lower)
    // so the certifier's into-region nudge reproduces this exact level.
    tagVertex(id, jn.u, jn.t, region, cliffSegOf[pi], true, true);
    store.set(jk, id);
    return id;
  };
  // Soft-cliff WELD (M6): a soft (occluded) point has a surface-continuous locus, so collapse it to
  // ONE single-valued vertex at `surface(u,t)` shared by every incident region — turning that
  // cliff's (0-height) wall into a watertight converging fan at the hard/soft boundary and letting a
  // crest crease thread straight over the buried cliff. Still tagged onCliff (its locus is a cliff).
  // Welded points key by ROUNDED (u,t) so coincident welds (two soft cliffs meeting) collapse to one.
  const weldVert = new Map<string, number>();
  const registry = new Map<string, number>();
  const getV = (pi: number, region: number): number => {
    if (ptWeld[pi] >= 0) {
      const [u, t] = pts[pi];
      const wk = `${Math.round(u / 1e-7)}:${Math.round(t / 1e-7)}`;
      const existing = weldVert.get(wk);
      if (existing !== undefined) return existing;
      const [x, y, z] = lift(u, t, surface(u, t), H);
      const id = addVertex(mesh, x, y, z);
      tagVertex(id, u, t, region, cliffSegOf[pi], true, false);
      weldVert.set(wk, id);
      return id;
    }
    const lip = cliffLip[pi];
    const jk = ptJunction[pi];
    if (jk >= 0 && lip) return junctionVert(jk, isRibbon[region], region, pi);
    const k = `${pi}:${region}`;
    const existing = registry.get(k);
    if (existing !== undefined) return existing;
    const [u, t] = pts[pi];
    let r: number;
    if (lip) r = occlusionAware ? oneSidedLimit(pi, region) : isRibbon[region] ? lip.upper : lip.lower;
    else r = surface(u, t);
    const [x, y, z] = lift(u, t, r, H);
    const id = addVertex(mesh, x, y, z);
    // Read-only provenance for the independent certifier: the exact (u,t) this vertex was
    // lifted from and the topological region it belongs to. Neither depends on the
    // ribbon/background label — only the radius `r` above does.
    tagVertex(id, u, t, region, cliffSegOf[pi], lip !== null, false);
    registry.set(k, id);
    return id;
  };

  const sheetTris: SheetTri[] = [];
  for (let ti = 0; ti < tris.length; ti += 1) {
    const [a, b, c] = tris[ti];
    const region = regionDense[ti];
    const va = getV(a, region);
    const vb = getV(b, region);
    const vc = getV(c, region);
    addTriangle(mesh, va, vb, vc);
    sheetTris.push({ cdt: [a, b, c], v: [va, vb, vc], region });
  }

  // ---- walls: bridge each cliff edge's two incident region-rails ----
  // At a Y-junction both rails may route to the SAME shared pinch vertex, collapsing the quad
  // to a triangle (one end pinched) or nothing (fully pinched — the sheets already share the
  // seam). Emitting a quad with a repeated index would fabricate a zero-length self-edge and
  // corrupt the manifold census, so collapse explicitly.
  const addWall = (aP: number, bP: number, bQ: number, aQ: number): boolean => {
    if (aP === aQ && bP === bQ) return false; // fully pinched: shared seam, no wall
    if (aP === aQ) {
      addTriangle(mesh, aP, bP, bQ);
      return true;
    }
    if (bP === bQ) {
      addTriangle(mesh, aP, bP, aQ);
      return true;
    }
    addQuad(mesh, aP, bP, bQ, aQ);
    return true;
  };
  const wallQuads: WallQuad[] = [];
  let unwalled = 0;
  for (let ci = 0; ci < chains.length; ci += 1) {
    const chain = chains[ci];
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const a = chain[i];
      const b = chain[i + 1];
      if (a === b) continue; // degenerate chain step (shared junction point)
      if (inertEdges.has(edgeKey(a, b))) continue; // occluded soft interval: in-sheet, no wall
      const bucket = edgeTri.get(edgeKey(a, b)) ?? [];
      const regs = [...new Set(bucket.map((ti) => regionDense[ti]))];
      if (regs.length < 2) {
        unwalled += 1;
        continue;
      }
      const [rP, rQ] = regs;
      const aP = getV(a, rP);
      const bP = getV(b, rP);
      const aQ = getV(a, rQ);
      const bQ = getV(b, rQ);
      if (addWall(aP, bP, bQ, aQ)) wallQuads.push({ ci, interval: i, v: [aP, bP, bQ, aQ] });
    }
  }

  // Expose the classifier's per-region label read-only (the independent certifier cross-checks
  // it against the label-independent interior-sheet geometry).
  mesh.regionIsRibbon = isRibbon;

  return { mesh, pts, sheetTris, wallQuads, cliffs, cliffEdgeSet, creaseEdgeInfo, unwalled, voteFreeRegions, tieCliffRegions };
}

// ---------------------------------------------------------------------------
// Chord measurement (geometric, vs a hole-free reference soup) + refine scheduling.
// ---------------------------------------------------------------------------

interface Measured {
  maxChord: number;
  centroidInserts: Array<[number, number]>;
  cliffSplits: Map<number, Set<number>>;
  creaseSplits: Map<number, Set<number>>;
}

/**
 * Measure each sheet triangle and wall quad by the GEOMETRIC distance of its edge/centre
 * samples to the reference soup (`dist`), and schedule refinement: a high sheet triangle
 * inserts its worst-deviating (u,t) sample (crest of the ridge), a high wall quad splits
 * its cliff arc-interval (so the polyline hugs the curve). Vertices already sit on the
 * surface; the midpoints carry the chord.
 */
function measure(
  a: Assembled,
  dist: (p: Vec3) => number,
  tol: number,
  analytic: { surface: SurfaceRadiusFn; H: number } | undefined,
  refineCreases: boolean,
  uPeriod: number | undefined,
  straddleGuard: boolean,
): Measured {
  const { mesh, pts, sheetTris, wallQuads, cliffEdgeSet, creaseEdgeInfo, cliffs } = a;
  const pos = mesh.positions;
  const vert = (id: number): Vec3 => [pos[id * 3], pos[id * 3 + 1], pos[id * 3 + 2]];
  const mid3 = (p: Vec3, q: Vec3): Vec3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  // Periodic u: a background edge/triangle straddling the welded seam has parameter u's near 0
  // AND near the period, whose naive average lands on the OPPOSITE side of the pot — evaluating
  // the analytic surface there fabricates a ~2·radius phantom sag. Unwrap the second u onto the
  // same branch as a reference u before averaging (the 3D midpoint itself is already correct).
  const unwrapU = (u: number, ref: number): number => {
    if (uPeriod === undefined) return u;
    if (u - ref > uPeriod / 2) return u - uPeriod;
    if (u - ref < -uPeriod / 2) return u + uPeriod;
    return u;
  };
  const wrapInsertU = (u: number): number => {
    if (uPeriod === undefined) return u;
    let x = (u - 0) % uPeriod;
    if (x < 0) x += uPeriod;
    return x; // domain uMin is 0 for the periodic pot
  };
  const d3 = (p: Vec3, q: Vec3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  // Reference-free sag: distance of a flat sample at parameter (um,tm) to the TRUE surface point
  // there. Falls back to nearest-triangle distance to the reference soup when not analytic.
  const liftA = (u: number, t: number, r: number): Vec3 =>
    analytic ? [r * Math.cos(TAU * u), r * Math.sin(TAU * u), t * analytic.H] : [0, 0, 0];
  // Straddle guard (M6 soft-weld OR T2 clip — `straddleGuard`): a sheet sample whose parameter
  // midpoint lands across a genuine surface DISCONTINUITY (a real ribbon↔background cliff) reports a
  // ~jump-sized phantom sag and makes the refine loop chase the cliff forever (the wall, not the
  // sheet, owns that radial step). Zero those samples out; an OCCLUDED (continuous) cliff under the
  // visible crest passes the test and is refined normally. Gated so the M5 refine path is byte-
  // identical (M5 sets neither flag and relies on the un-guarded analytic sag for its clear/diamond
  // chord split).
  const STRADDLE_JUMP = 0.05;
  const STRADDLE_DU = 2e-4;
  const straddles = (um: number, tm: number): boolean =>
    !!analytic && straddleGuard && Math.abs(analytic.surface(um + STRADDLE_DU, tm) - analytic.surface(um - STRADDLE_DU, tm)) > STRADDLE_JUMP;
  const sheetSag = (flat: Vec3, um: number, tm: number): number => {
    if (!analytic) return dist(flat);
    if (straddles(um, tm)) return 0;
    return d3(flat, liftA(um, tm, analytic.surface(um, tm)));
  };

  let maxChord = 0;
  const centroidInserts: Array<[number, number]> = [];
  const seenInsert = new Set<string>();
  const cliffSplits = new Map<number, Set<number>>();
  const creaseSplits = new Map<number, Set<number>>();
  const scheduleCrease = (cr: number, interval: number): void => {
    let set = creaseSplits.get(cr);
    if (!set) {
      set = new Set<number>();
      creaseSplits.set(cr, set);
    }
    set.add(interval);
  };

  const flag = (uv: UV): void => {
    const k = `${Math.round(uv[0] / 1e-7)}:${Math.round(uv[1] / 1e-7)}`;
    if (seenInsert.has(k)) return;
    seenInsert.add(k);
    centroidInserts.push([uv[0], uv[1]]);
  };

  // Sheet triangles: insert EVERY high non-cliff edge midpoint (and the centroid when it
  // is the worst). Subdividing all bad edges each pass converges the thin diagonal ribbon
  // uniformly (single-worst-point insertion whack-a-moles it). Cliff edges are the wall's.
  for (const st of sheetTris) {
    const [a3, b3, c3] = st.cdt;
    const [va, vb, vc] = st.v;
    const uvA = pts[a3];
    const uvB = pts[b3];
    const uvC = pts[c3];
    // Unwrap onto uvA's branch so a seam-straddling triangle's centroid u is meaningful.
    const cenUV: UV = [
      wrapInsertU((uvA[0] + unwrapU(uvB[0], uvA[0]) + unwrapU(uvC[0], uvA[0])) / 3),
      (uvA[1] + uvB[1] + uvC[1]) / 3,
    ];
    const flatCen: Vec3 = [
      (pos[va * 3] + pos[vb * 3] + pos[vc * 3]) / 3,
      (pos[va * 3 + 1] + pos[vb * 3 + 1] + pos[vc * 3 + 1]) / 3,
      (pos[va * 3 + 2] + pos[vb * 3 + 2] + pos[vc * 3 + 2]) / 3,
    ];
    const cenD = sheetSag(flatCen, cenUV[0], cenUV[1]);
    let triMax = cenD;
    let edgeFlagged = false;
    for (const [pIdx, qIdx, pV, qV] of [
      [a3, b3, va, vb],
      [b3, c3, vb, vc],
      [c3, a3, vc, va],
    ] as const) {
      const ek = edgeKey(pIdx, qIdx);
      if (cliffEdgeSet.has(ek)) continue; // walls own the cliff seam
      const uq = unwrapU(pts[qIdx][0], pts[pIdx][0]); // unwrap across the periodic seam
      const umid = (pts[pIdx][0] + uq) / 2;
      const tmid = (pts[pIdx][1] + pts[qIdx][1]) / 2;
      const d = sheetSag(mid3(vert(pV), vert(qV)), umid, tmid);
      if (d > triMax) triMax = d;
      if (d > tol) {
        // A crease edge is a constraint cdt2d never splits, so refine it by bisecting the
        // crease interval (its snaking crest line tracks the true ridge); otherwise densify
        // the sheet with a grid point at the edge midpoint.
        const ci = refineCreases ? creaseEdgeInfo.get(ek) : undefined;
        if (ci) scheduleCrease(ci.cr, ci.interval);
        else flag([wrapInsertU(umid), tmid]);
        edgeFlagged = true;
      }
    }
    if (triMax > maxChord) maxChord = triMax;
    if (!edgeFlagged && cenD > tol) flag(cenUV); // interior bulge with no bad edge
  }

  // Wall quads: how far the flat ruled face sits from the true (curving) cliff wall. The radial
  // direction is exact (rails sit at the exact lip radii), so the sag is the cliff curve's
  // LATERAL sag between the two samples — measured analytically against the true cliff point at
  // the interval midpoint, or against the reference soup otherwise.
  for (const wq of wallQuads) {
    const [aP, bP, bQ, aQ] = wq.v.map(vert) as [Vec3, Vec3, Vec3, Vec3];
    let triMax = 0;
    if (analytic) {
      const st = cliffs[wq.ci];
      const sMid = (st.samples[wq.interval].s + st.samples[wq.interval + 1].s) / 2;
      const c = st.seg.at(sMid);
      const rLow = (Math.hypot(aP[0], aP[1]) + Math.hypot(bP[0], bP[1])) / 2;
      const rUp = (Math.hypot(aQ[0], aQ[1]) + Math.hypot(bQ[0], bQ[1])) / 2;
      triMax = Math.max(
        d3(mid3(aP, bP), liftA(c.u, c.t, rLow)),
        d3(mid3(aQ, bQ), liftA(c.u, c.t, rUp)),
      );
    } else {
      const samples: Vec3[] = [
        mid3(aP, bP),
        mid3(aQ, bQ),
        mid3(aP, bQ),
        [(aP[0] + bP[0] + bQ[0] + aQ[0]) / 4, (aP[1] + bP[1] + bQ[1] + aQ[1]) / 4, (aP[2] + bP[2] + bQ[2] + aQ[2]) / 4],
      ];
      for (const s of samples) {
        const d = dist(s);
        if (d > triMax) triMax = d;
      }
    }
    if (triMax > maxChord) maxChord = triMax;
    if (triMax > tol) {
      let set = cliffSplits.get(wq.ci);
      if (!set) {
        set = new Set<number>();
        cliffSplits.set(wq.ci, set);
      }
      set.add(wq.interval);
    }
  }

  return { maxChord, centroidInserts, cliffSplits, creaseSplits };
}

// ---------------------------------------------------------------------------
// Apply refinements to the persistent sampling state.
// ---------------------------------------------------------------------------

function applyCentroids(gridPts: Array<[number, number]>, inserts: ReadonlyArray<[number, number]>): number {
  const seen = new Set<string>();
  for (const [u, t] of gridPts) seen.add(`${Math.round(u / 1e-7)}:${Math.round(t / 1e-7)}`);
  let added = 0;
  for (const [u, t] of inserts) {
    const k = `${Math.round(u / 1e-7)}:${Math.round(t / 1e-7)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    gridPts.push([u, t]);
    added += 1;
  }
  return added;
}

function applyCliffSplits(cliffs: CliffState[], splits: ReadonlyMap<number, Set<number>>): number {
  let count = 0;
  for (const [ci, intervals] of splits) {
    const state = cliffs[ci];
    // splice highest interval first so earlier indices stay valid
    for (const iv of [...intervals].sort((x, y) => y - x)) {
      const s0 = state.samples[iv].s;
      const s1 = state.samples[iv + 1].s;
      const sMid = (s0 + s1) / 2;
      const { u, t } = state.seg.at(sMid);
      const { lower, upper } = state.seg.lipsAt(sMid);
      state.samples.splice(iv + 1, 0, { s: sMid, u, t, lower, upper });
      count += 1;
    }
  }
  return count;
}

/** Bisect the flagged crease intervals in place (mirror of {@link applyCliffSplits} for creases). */
function applyCreaseSplits(creases: ReadonlyArray<CreaseState>, splits: ReadonlyMap<number, Set<number>>): number {
  let count = 0;
  for (const [cr, intervals] of splits) {
    const state = creases[cr];
    if (!state) continue;
    for (const iv of [...intervals].sort((x, y) => y - x)) {
      if (iv + 1 >= state.samples.length) continue;
      const sMid = (state.samples[iv].s + state.samples[iv + 1].s) / 2;
      state.samples.splice(iv + 1, 0, { s: sMid }); // interior split point carries no pin
      count += 1;
    }
  }
  return count;
}
