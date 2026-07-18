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

/** Cylindrical lift matching the rest of the app: theta = 2*pi*u, z = t*H. */
const lift = (u: number, t: number, r: number, H: number): Vec3 => [
  r * Math.cos(TAU * u),
  r * Math.sin(TAU * u),
  t * H,
];

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

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
    const sJ = tSpan > 0 ? (jn.t - domain.tLo) / tSpan : 0;
    if (sJ < -1e-9 || sJ > 1 + 1e-9) continue; // junction outside this window
    const sClamped = sJ < 0 ? 0 : sJ > 1 ? 1 : sJ;
    for (const segIdx of jn.segs) {
      const st = cliffs[segIdx];
      if (!st) continue;
      const sample: CliffSample = {
        s: sClamped,
        u: jn.u,
        t: jn.t,
        lower: jn.pinch.lower,
        upper: jn.pinch.upper,
        junction: k,
      };
      let idx = st.samples.length;
      for (let m = 0; m < st.samples.length; m += 1) {
        if (st.samples[m].s > sClamped) {
          idx = m;
          break;
        }
      }
      st.samples.splice(idx, 0, sample);
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
  const creaseChains: Array<Array<[number, number]>> = (complex.creases ?? []).map((cr) => {
    const chain: Array<[number, number]> = [];
    for (let j = 0; j < baseGridT; j += 1) {
      const { u, t } = cr.at(j / (baseGridT - 1));
      chain.push([u, t]);
    }
    return chain;
  });

  // 3. Build; if refining, measure GEOMETRICALLY against a hole-free reference soup of
  //    the true surface (sampling the discontinuous radius across a cliff would fabricate
  //    ~jump-sized phantom chord). Refine until the chord is under tol (or passes run out).
  const dist =
    maxRefinePasses > 0
      ? buildTriDistance(opts.refSoup ?? buildSurfaceReferenceSoup(surface, domain, complex.segments, H))
      : () => 0;
  const POINT_CAP = 60000; // hard bound on the sampling set (logged, never silent)
  let result = assemble(gridPts, cliffs, creaseChains, surface, domain, H, complex.junctions, occlusionAware, oneSidedDelta);
  let m = measure(result, dist, chordTolMm);
  let addedSheetPoints = 0;
  let splitCliffEdges = 0;
  let passes = 0;
  let cappedAt = 0;
  while (passes < maxRefinePasses && m.maxChord >= chordTolMm) {
    if (gridPts.length >= POINT_CAP) {
      cappedAt = gridPts.length;
      break;
    }
    addedSheetPoints += applyCentroids(gridPts, m.centroidInserts);
    splitCliffEdges += applyCliffSplits(cliffs, m.cliffSplits);
    result = assemble(gridPts, cliffs, creaseChains, surface, domain, H, complex.junctions, occlusionAware, oneSidedDelta);
    m = measure(result, dist, chordTolMm);
    passes += 1;
  }

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
  return result.mesh;
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
  unwalled: number;
  voteFreeRegions: number;
  tieCliffRegions: number;
}

function assemble(
  gridPts: ReadonlyArray<[number, number]>,
  cliffs: CliffState[],
  creaseChains: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  surface: SurfaceRadiusFn,
  domain: DomainWindow,
  H: number,
  junctions: ReadonlyArray<JunLike>,
  occlusionAware: boolean,
  oneSidedDelta: number,
): Assembled {
  const pts: Array<[number, number]> = [];
  const cliffLip: Array<Lip | null> = [];
  const cliffSegOf: number[] = []; // segment index this point's locus belongs to; -1 for sheet points
  const ptJunction: number[] = []; // declared-junction index this point pinches to; -1 otherwise
  const pushPt = (u: number, t: number, lip: Lip | null, seg = -1): number => {
    pts.push([u, t]);
    cliffLip.push(lip);
    cliffSegOf.push(seg);
    ptJunction.push(-1);
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
  for (let ci = 0; ci < cliffs.length; ci += 1) {
    const chain: number[] = [];
    let prev = -1;
    const { samples } = cliffs[ci];
    for (let j = 0; j < samples.length; j += 1) {
      const sm = samples[j];
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
      }
      chain.push(id);
      if (prev >= 0 && prev !== id) {
        const k = edgeKey(prev, id);
        edges.push([prev, id]);
        cliffEdgeSet.add(k);
        cliffEdgeInfo.set(k, { ci, interval: j - 1 });
      }
      prev = id;
    }
    chains.push(chain);
  }

  // Creases: enforced as CDT constraints (so no triangle crosses the ridge apex) but NOT
  // added to cliffEdgeSet — regions union across them and they get no wall.
  for (const chain of creaseChains) {
    let prev = -1;
    for (const [u, t] of chain) {
      const id = pushPt(u, t, null);
      if (prev >= 0) edges.push([prev, id]);
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
  const tSpanA = domain.tHi - domain.tLo;
  const sOfT = (t: number): number => {
    if (tSpanA <= 0) return 0;
    const s = (t - domain.tLo) / tSpanA;
    return s < 0 ? 0 : s > 1 ? 1 : s;
  };
  const locusU = (ci: number, t: number): number => cliffs[ci].seg.at(sOfT(t)).u;
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
  const onRimPt = (u: number, t: number): boolean =>
    u <= domain.uMin + RIM_EPS ||
    u >= domain.uMax - RIM_EPS ||
    t <= domain.tLo + RIM_EPS ||
    t >= domain.tHi - RIM_EPS;
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
  const registry = new Map<string, number>();
  const getV = (pi: number, region: number): number => {
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

  return { mesh, pts, sheetTris, wallQuads, cliffs, cliffEdgeSet, unwalled, voteFreeRegions, tieCliffRegions };
}

// ---------------------------------------------------------------------------
// Chord measurement (geometric, vs a hole-free reference soup) + refine scheduling.
// ---------------------------------------------------------------------------

interface Measured {
  maxChord: number;
  centroidInserts: Array<[number, number]>;
  cliffSplits: Map<number, Set<number>>;
}

/**
 * Measure each sheet triangle and wall quad by the GEOMETRIC distance of its edge/centre
 * samples to the reference soup (`dist`), and schedule refinement: a high sheet triangle
 * inserts its worst-deviating (u,t) sample (crest of the ridge), a high wall quad splits
 * its cliff arc-interval (so the polyline hugs the curve). Vertices already sit on the
 * surface; the midpoints carry the chord.
 */
function measure(a: Assembled, dist: (p: Vec3) => number, tol: number): Measured {
  const { mesh, pts, sheetTris, wallQuads, cliffEdgeSet } = a;
  const pos = mesh.positions;
  const vert = (id: number): Vec3 => [pos[id * 3], pos[id * 3 + 1], pos[id * 3 + 2]];
  const mid3 = (p: Vec3, q: Vec3): Vec3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];

  let maxChord = 0;
  const centroidInserts: Array<[number, number]> = [];
  const seenInsert = new Set<string>();
  const cliffSplits = new Map<number, Set<number>>();

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
    const cenUV: UV = [(uvA[0] + uvB[0] + uvC[0]) / 3, (uvA[1] + uvB[1] + uvC[1]) / 3];
    const flatCen: Vec3 = [
      (pos[va * 3] + pos[vb * 3] + pos[vc * 3]) / 3,
      (pos[va * 3 + 1] + pos[vb * 3 + 1] + pos[vc * 3 + 1]) / 3,
      (pos[va * 3 + 2] + pos[vb * 3 + 2] + pos[vc * 3 + 2]) / 3,
    ];
    const cenD = dist(flatCen);
    let triMax = cenD;
    let edgeFlagged = false;
    for (const [pIdx, qIdx, pV, qV] of [
      [a3, b3, va, vb],
      [b3, c3, vb, vc],
      [c3, a3, vc, va],
    ] as const) {
      if (cliffEdgeSet.has(edgeKey(pIdx, qIdx))) continue; // walls own the cliff seam
      const d = dist(mid3(vert(pV), vert(qV)));
      if (d > triMax) triMax = d;
      if (d > tol) {
        flag([(pts[pIdx][0] + pts[qIdx][0]) / 2, (pts[pIdx][1] + pts[qIdx][1]) / 2]);
        edgeFlagged = true;
      }
    }
    if (triMax > maxChord) maxChord = triMax;
    if (!edgeFlagged && cenD > tol) flag(cenUV); // interior bulge with no bad edge
  }

  // Wall quads: how far the flat ruled face sits from the true (curving) cliff wall.
  for (const wq of wallQuads) {
    const [aP, bP, bQ, aQ] = wq.v.map(vert) as [Vec3, Vec3, Vec3, Vec3];
    const samples: Vec3[] = [
      mid3(aP, bP),
      mid3(aQ, bQ),
      mid3(aP, bQ),
      [(aP[0] + bP[0] + bQ[0] + aQ[0]) / 4, (aP[1] + bP[1] + bQ[1] + aQ[1]) / 4, (aP[2] + bP[2] + bQ[2] + aQ[2]) / 4],
    ];
    let triMax = 0;
    for (const s of samples) {
      const d = dist(s);
      if (d > triMax) triMax = d;
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

  return { maxChord, centroidInserts, cliffSplits };
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
