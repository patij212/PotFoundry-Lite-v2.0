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
  Mesh,
  MeshBuildOptions,
  RefTri,
  SegLike,
  SurfaceRadiusFn,
  Vec3,
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
  let result = assemble(gridPts, cliffs, creaseChains, surface, domain, H);
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
    result = assemble(gridPts, cliffs, creaseChains, surface, domain, H);
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
}

function assemble(
  gridPts: ReadonlyArray<[number, number]>,
  cliffs: CliffState[],
  creaseChains: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
  surface: SurfaceRadiusFn,
  domain: DomainWindow,
  H: number,
): Assembled {
  const pts: Array<[number, number]> = [];
  const cliffLip: Array<Lip | null> = [];
  const pushPt = (u: number, t: number, lip: Lip | null): number => {
    pts.push([u, t]);
    cliffLip.push(lip);
    return pts.length - 1;
  };

  for (const [u, t] of gridPts) pushPt(u, t, null);

  const edges: Array<[number, number]> = [];
  const chains: number[][] = [];
  const cliffEdgeSet = new Set<string>();
  const cliffEdgeInfo = new Map<string, { ci: number; interval: number }>();
  for (let ci = 0; ci < cliffs.length; ci += 1) {
    const chain: number[] = [];
    let prev = -1;
    const { samples } = cliffs[ci];
    for (let j = 0; j < samples.length; j += 1) {
      const sm = samples[j];
      const id = pushPt(sm.u, sm.t, { lower: sm.lower, upper: sm.upper });
      chain.push(id);
      if (prev >= 0) {
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
  for (let r = 0; r < regionCount; r += 1) isRibbon[r] = ribVotes[r] > bgVotes[r];

  // ---- split-lift: one mesh vertex per (cdtPointIndex, region) ----
  const mesh = createMesh();
  const onRimPt = (u: number, t: number): boolean =>
    u <= domain.uMin + RIM_EPS ||
    u >= domain.uMax - RIM_EPS ||
    t <= domain.tLo + RIM_EPS ||
    t >= domain.tHi - RIM_EPS;
  const registry = new Map<string, number>();
  const getV = (pi: number, region: number): number => {
    const k = `${pi}:${region}`;
    const existing = registry.get(k);
    if (existing !== undefined) return existing;
    const [u, t] = pts[pi];
    const lip = cliffLip[pi];
    const r = lip ? (isRibbon[region] ? lip.upper : lip.lower) : surface(u, t);
    const [x, y, z] = lift(u, t, r, H);
    const id = addVertex(mesh, x, y, z);
    mesh.vertexOnCliff[id] = lip !== null;
    mesh.vertexOnRim[id] = onRimPt(u, t);
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
  const wallQuads: WallQuad[] = [];
  let unwalled = 0;
  for (let ci = 0; ci < chains.length; ci += 1) {
    const chain = chains[ci];
    for (let i = 0; i + 1 < chain.length; i += 1) {
      const a = chain[i];
      const b = chain[i + 1];
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
      addQuad(mesh, aP, bP, bQ, aQ);
      wallQuads.push({ ci, interval: i, v: [aP, bP, bQ, aQ] });
    }
  }

  return { mesh, pts, sheetTris, wallQuads, cliffs, cliffEdgeSet, unwalled };
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
