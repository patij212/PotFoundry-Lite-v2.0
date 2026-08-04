/**
 * Shadow-only action-frontier analysis for the Strata conforming-bisection driver.
 *
 * This module never mutates a production mesh. It reconstructs the driver's finite
 * placement sequence, scores both sides of every shared edge, and can stage a
 * two-action protector transaction in scratch arrays. The caller decides whether a
 * measured transaction is worth a separate A/B; nothing here relaxes a mesh gate.
 */
import type { RadiusFn } from './_facetTruthLib';
import {
  aspect3,
  chordParam,
  signedAreaParam,
  type LiftedPoint,
} from './_shapeGuard';
import {
  canonTheta,
  dThRaw,
  edgeSagRaw,
  locateKinkRaw,
  type SweepKink,
  type SweepPredConst,
} from './_sweepPredicate';

export interface FrontierVertex {
  x: number;
  y: number;
  z: number;
  /** Canonical theta for stored vertices; edge interpolation unwraps with dThRaw. */
  th: number;
}

export interface FrontierTriangle {
  v: [number, number, number];
  /** Triangle id in the source STL, retained across scratch children. */
  sourceTri: number;
  /** True only for triangles introduced by a staged action. */
  born?: boolean;
  /** Parametric orientation of the source triangle, inherited by descendants. */
  rootSign?: number;
}

export interface FrontierMesh {
  vertices: FrontierVertex[];
  triangles: FrontierTriangle[];
}

export type FrontierEdge = [number, number];

export interface FrontierOptions {
  arCap: number;
  arGuard: number;
  floorMm: number;
  weldMm: number;
  snapAlpha: number;
  mid3dIters: number;
  mid3dMaxShift: number;
  nudgeFractions: readonly number[];
  shippedNormal: boolean;
  predicate: SweepPredConst;
}

export type SplitRejection =
  | 'aspect'
  | 'fold'
  | 'normal'
  | 'weld-endpoint'
  | 'weld-other'
  | 'no-incident';

export interface ChildScore {
  sourceTri: number;
  ar: number;
  fold: boolean;
  footprintBack: boolean;
}

export interface PlacementScore {
  edge: FrontierEdge;
  parameter: number;
  point: FrontierVertex;
  incidentCount: number;
  children: ChildScore[];
  worstAr: number;
  shapeLegal: boolean;
  legal: boolean;
  reasons: SplitRejection[];
  /** First refusal in production order: AR, fold, split-normal, weld, then incidence. */
  primaryRejection: SplitRejection | null;
}

export interface DriverAttempt {
  edgeIndex: number;
  edge: FrontierEdge;
  kind: 'snap' | 'snap-suppressed' | 'nudge';
  requestedFraction: number;
  parameter: number | null;
  kink: SweepKink | null;
  score: PlacementScore | null;
}

export interface DriverFrontier {
  edgeOrder: number[];
  edgeLengthsMm: number[];
  edgeSagUm: number[];
  attempts: DriverAttempt[];
  selected: DriverAttempt | null;
}

export interface SampledMinimax {
  edge: FrontierEdge;
  parameter: number;
  score: PlacementScore;
  samples: number;
  /** Numerical search only: absence of a legal sample is not a proof of impossibility. */
  certified: false;
}

export interface PatchScore {
  legal: boolean;
  worstAr: number;
  bornTriangles: number;
  folds: number;
  footprintBack: number;
  aspectSources: number[];
  foldSources: number[];
  normalSources: number[];
  reasons: SplitRejection[];
}

export interface ProtectorAction {
  targetEdge: FrontierEdge;
  targetParameter: number;
  firstEdge: FrontierEdge;
  requestedFraction: number;
  firstParameter: number;
  intermediateLegal: boolean;
  final: PatchScore;
  featureRecovered: boolean;
  changedSourceTriangles: number;
  legal: boolean;
}

export interface ProtectorExecution {
  mesh: FrontierMesh;
  featureVertex: number;
  score: PatchScore;
  featureRecovered: boolean;
  changedSourceTriangles: number;
}

export interface RedGreenTopology {
  beforeEuler: number;
  afterEuler: number;
  eulerDelta: number;
  beforeNonManifold: number;
  afterNonManifold: number;
  splitEdgesConforming: boolean;
}

export interface RedGreenPlan {
  rings: number;
  redParents: number;
  greenParents: number;
  changedSourceTriangles: number;
  newVertices: number;
  targetRecovered: boolean;
  score: PatchScore;
  topology: RedGreenTopology;
  legal: boolean;
}

export interface RedGreenExecution {
  mesh: FrontierMesh;
  targetVertex: number;
  plan: RedGreenPlan;
}

const ADM_H = 1e-6;

/** Stable undirected edge key for scratch vertex ids. */
export function frontierEdgeKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

/** Return every live scratch triangle incident on an undirected edge. */
export function incidentTriangles(mesh: FrontierMesh, a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < mesh.triangles.length; i += 1) {
    const v = mesh.triangles[i].v;
    if (v.includes(a) && v.includes(b)) out.push(i);
  }
  return out;
}

function edgeLength(mesh: FrontierMesh, a: number, b: number): number {
  const p = mesh.vertices[a];
  const q = mesh.vertices[b];
  return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
}

function liftOnEdge(R: RadiusFn, a: FrontierVertex, b: FrontierVertex, s: number): FrontierVertex {
  const thRaw = a.th + dThRaw(a.th, b.th) * s;
  const th = canonTheta(thRaw);
  const z = a.z + (b.z - a.z) * s;
  const r = R(th, z);
  return { x: r * Math.cos(th), y: r * Math.sin(th), z, th };
}

/** Driver-equivalent chord-fraction placement, including the max-shift guard. */
export function chordPlacement(
  R: RadiusFn,
  a: FrontierVertex,
  b: FrontierVertex,
  fraction: number,
  iters: number,
  maxShift: number,
): number {
  const s = chordParam(
    (u) => liftOnEdge(R, a, b, u) as LiftedPoint,
    a.x,
    a.y,
    a.z,
    b.x,
    b.y,
    b.z,
    fraction,
    iters,
  );
  const shift = Math.abs(s - fraction);
  if (shift <= maxShift) return s;
  return s > fraction ? fraction + maxShift : fraction - maxShift;
}

function orientedEdge(
  tri: FrontierTriangle,
  a: number,
  b: number,
): { oa: number; ob: number; apex: number } | null {
  const seq = tri.v;
  for (let i = 0; i < 3; i += 1) {
    const p = seq[i];
    const q = seq[(i + 1) % 3];
    if (p === a && q === b) return { oa: a, ob: b, apex: seq[(i + 2) % 3] };
    if (p === b && q === a) return { oa: b, ob: a, apex: seq[(i + 2) % 3] };
  }
  return null;
}

function bestAnalyticDot(
  R: RadiusFn,
  th: number,
  z: number,
  fx: number,
  fy: number,
  fz: number,
): number {
  const r0 = R(th, z);
  const rTp = R(th + ADM_H, z);
  const rTm = R(th - ADM_H, z);
  const rZp = R(th, z + ADM_H);
  const rZm = R(th, z - ADM_H);
  const candidates: Array<[number, number]> = [
    [(rTp - rTm) / (2 * ADM_H), (rZp - rZm) / (2 * ADM_H)],
    [(rTp - r0) / ADM_H, (rZp - r0) / ADM_H],
    [(rTp - r0) / ADM_H, (r0 - rZm) / ADM_H],
    [(r0 - rTm) / ADM_H, (rZp - r0) / ADM_H],
    [(r0 - rTm) / ADM_H, (r0 - rZm) / ADM_H],
  ];
  const ct = Math.cos(th);
  const st = Math.sin(th);
  let best = -Infinity;
  for (const [rt, rz] of candidates) {
    const nx = r0 * ct + rt * st;
    const ny = r0 * st - rt * ct;
    const nz = -r0 * rz;
    const nl = Math.hypot(nx, ny, nz) || 1;
    best = Math.max(best, (fx * nx + fy * ny + fz * nz) / nl);
  }
  return best;
}

function footprintBack(
  R: RadiusFn,
  p0: FrontierVertex,
  q0: FrontierVertex,
  s0: FrontierVertex,
  shipped: boolean,
): boolean {
  const f32 = Math.fround;
  const p = shipped ? { x: f32(p0.x), y: f32(p0.y), z: f32(p0.z), th: 0 } : p0;
  const q = shipped ? { x: f32(q0.x), y: f32(q0.y), z: f32(q0.z), th: 0 } : q0;
  const s = shipped ? { x: f32(s0.x), y: f32(s0.y), z: f32(s0.z), th: 0 } : s0;
  const pth = shipped ? Math.atan2(p.y, p.x) : p0.th;
  const qth = shipped ? Math.atan2(q.y, q.x) : q0.th;
  const sth = shipped ? Math.atan2(s.y, s.x) : s0.th;
  let fx = (q.y - p.y) * (s.z - p.z) - (q.z - p.z) * (s.y - p.y);
  let fy = (q.z - p.z) * (s.x - p.x) - (q.x - p.x) * (s.z - p.z);
  let fz = (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 0)) return false;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  const cth = canonTheta(Math.atan2((p.y + q.y + s.y) / 3, (p.x + q.x + s.x) / 3));
  const cz = (p.z + q.z + s.z) / 3;
  if (bestAnalyticDot(R, cth, cz, fx, fy, fz) >= 0) return false;
  if (bestAnalyticDot(R, canonTheta(pth), p.z, fx, fy, fz) >= 0) return false;
  if (bestAnalyticDot(R, canonTheta(qth), q.z, fx, fy, fz) >= 0) return false;
  if (bestAnalyticDot(R, canonTheta(sth), s.z, fx, fy, fz) >= 0) return false;
  return true;
}

function scoreChild(
  R: RadiusFn,
  a: FrontierVertex,
  b: FrontierVertex,
  c: FrontierVertex,
  sourceTri: number,
  parentSign: number,
  shippedNormal: boolean,
): ChildScore {
  const sign = Math.sign(signedAreaParam(a.th, a.z, b.th, b.z, c.th, c.z));
  return {
    sourceTri,
    ar: aspect3(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z),
    fold: parentSign !== 0 && sign !== parentSign,
    footprintBack: footprintBack(R, a, b, c, shippedNormal),
  };
}

function weldReason(
  mesh: FrontierMesh,
  point: FrontierVertex,
  a: number,
  b: number,
  weldMm: number,
): SplitRejection | null {
  for (let i = 0; i < mesh.vertices.length; i += 1) {
    const v = mesh.vertices[i];
    if (Math.hypot(v.x - point.x, v.y - point.y, v.z - point.z) > weldMm) continue;
    return i === a || i === b ? 'weld-endpoint' : 'weld-other';
  }
  return null;
}

/** Score a proposed split against every incident triangle and every current safety gate. */
export function scoreEdgePlacement(
  R: RadiusFn,
  mesh: FrontierMesh,
  edge: FrontierEdge,
  parameter: number,
  options: FrontierOptions,
): PlacementScore {
  const [a, b] = edge;
  const point = liftOnEdge(R, mesh.vertices[a], mesh.vertices[b], parameter);
  const incident = incidentTriangles(mesh, a, b);
  const children: ChildScore[] = [];
  const reasons = new Set<SplitRejection>();
  let primaryRejection: SplitRejection | null = null;
  for (const triIndex of incident) {
    const tri = mesh.triangles[triIndex];
    const oriented = orientedEdge(tri, a, b);
    if (oriented === null) continue;
    const va = mesh.vertices[oriented.oa];
    const vb = mesh.vertices[oriented.ob];
    const apex = mesh.vertices[oriented.apex];
    const parentSign = tri.rootSign ?? Math.sign(signedAreaParam(
      mesh.vertices[tri.v[0]].th,
      mesh.vertices[tri.v[0]].z,
      mesh.vertices[tri.v[1]].th,
      mesh.vertices[tri.v[1]].z,
      mesh.vertices[tri.v[2]].th,
      mesh.vertices[tri.v[2]].z,
    ));
    const first = scoreChild(R, va, point, apex, tri.sourceTri, parentSign, options.shippedNormal);
    const second = scoreChild(R, point, vb, apex, tri.sourceTri, parentSign, options.shippedNormal);
    children.push(first, second);
    if (primaryRejection === null && (first.ar > options.arCap || second.ar > options.arCap)) {
      primaryRejection = 'aspect';
    }
    if (primaryRejection === null && (first.fold || second.fold)) primaryRejection = 'fold';
  }
  const worstAr = children.reduce((m, c) => Math.max(m, c.ar), 0);
  if (worstAr > options.arCap) reasons.add('aspect');
  if (children.some((c) => c.fold)) reasons.add('fold');
  if (children.some((c) => c.footprintBack)) {
    reasons.add('normal');
    if (primaryRejection === null) primaryRejection = 'normal';
  }
  const weld = weldReason(mesh, point, a, b, options.weldMm);
  if (weld !== null) {
    reasons.add(weld);
    if (primaryRejection === null) primaryRejection = weld;
  }
  if (incident.length === 0) {
    reasons.add('no-incident');
    if (primaryRejection === null) primaryRejection = 'no-incident';
  }
  const shapeLegal = !reasons.has('aspect') && !reasons.has('fold') && !reasons.has('normal');
  return {
    edge,
    parameter,
    point,
    incidentCount: incident.length,
    children,
    worstAr,
    shapeLegal,
    legal: shapeLegal && !reasons.has('weld-endpoint') && !reasons.has('weld-other') && !reasons.has('no-incident'),
    reasons: [...reasons],
    primaryRejection,
  };
}

function targetEdges(tri: FrontierTriangle): FrontierEdge[] {
  return [[tri.v[0], tri.v[1]], [tri.v[1], tri.v[2]], [tri.v[2], tri.v[0]]];
}

/** Reconstruct the exact heap-driver edge order and SNAP/nudge placement sequence. */
export function auditDriverFrontier(
  R: RadiusFn,
  mesh: FrontierMesh,
  targetTriangle: number,
  options: FrontierOptions,
): DriverFrontier {
  const tri = mesh.triangles[targetTriangle];
  const edges = targetEdges(tri);
  const lengths = edges.map(([a, b]) => edgeLength(mesh, a, b));
  const lMax = Math.max(...lengths);
  const sag = edges.map(([a, b]) => {
    const p = mesh.vertices[a];
    const q = mesh.vertices[b];
    return edgeSagRaw(R, p.x, p.y, p.z, q.x, q.y, q.z, p.th, dThRaw(p.th, q.th), options.predicate);
  });
  let order = [0, 1, 2].filter((e) => lengths[e] >= options.floorMm && lengths[e] * options.arGuard >= lMax);
  if (order.length === 0) order = [0, 1, 2].filter((e) => lengths[e] >= options.floorMm);
  order.sort((a, b) => sag[b] - sag[a]);
  if (order.length > 1) {
    let longest = 0;
    for (let e = 1; e < 3; e += 1) if (lengths[e] > lengths[longest]) longest = e;
    if (order[0] !== longest && order.includes(longest)) {
      const head = edges[order[0]];
      const long = edges[longest];
      const hs = chordPlacement(R, mesh.vertices[head[0]], mesh.vertices[head[1]], 0.5, options.mid3dIters, options.mid3dMaxShift);
      const ls = chordPlacement(R, mesh.vertices[long[0]], mesh.vertices[long[1]], 0.5, options.mid3dIters, options.mid3dMaxShift);
      if (!scoreEdgePlacement(R, mesh, head, hs, options).shapeLegal
        && scoreEdgePlacement(R, mesh, long, ls, options).shapeLegal) {
        order = [longest, ...order.filter((e) => e !== longest)];
      }
    }
  }

  const attempts: DriverAttempt[] = [];
  let selected: DriverAttempt | null = null;
  for (const edgeIndex of order) {
    const edge = edges[edgeIndex];
    const p = mesh.vertices[edge[0]];
    const q = mesh.vertices[edge[1]];
    const kink = options.predicate.snap
      ? locateKinkRaw(R, p.th, p.z, p.th + dThRaw(p.th, q.th), q.z, options.predicate)
      : null;
    if (kink !== null) {
      if (kink.t > options.snapAlpha && kink.t < 1 - options.snapAlpha) {
        const score = scoreEdgePlacement(R, mesh, edge, kink.t, options);
        const attempt: DriverAttempt = {
          edgeIndex,
          edge,
          kind: 'snap',
          requestedFraction: kink.t,
          parameter: kink.t,
          kink,
          score,
        };
        attempts.push(attempt);
        if (score.legal) { selected = attempt; break; }
      } else {
        attempts.push({
          edgeIndex,
          edge,
          kind: 'snap-suppressed',
          requestedFraction: kink.t,
          parameter: null,
          kink,
          score: null,
        });
      }
    }
    for (const fraction of options.nudgeFractions) {
      const parameter = chordPlacement(
        R,
        p,
        q,
        fraction,
        options.mid3dIters,
        options.mid3dMaxShift,
      );
      const score = scoreEdgePlacement(R, mesh, edge, parameter, options);
      const attempt: DriverAttempt = {
        edgeIndex,
        edge,
        kind: 'nudge',
        requestedFraction: fraction,
        parameter,
        kink,
        score,
      };
      attempts.push(attempt);
      if (score.legal) { selected = attempt; break; }
    }
    if (selected !== null) break;
  }
  return {
    edgeOrder: order,
    edgeLengthsMm: lengths,
    edgeSagUm: sag.map((v) => v * 1000),
    attempts,
    selected,
  };
}

/** Numerically minimize the two-sided worst child AR along one edge. */
export function sampledMinimaxPlacement(
  R: RadiusFn,
  mesh: FrontierMesh,
  edge: FrontierEdge,
  options: FrontierOptions,
  sampleCount = 2049,
): SampledMinimax {
  const n = Math.max(33, sampleCount | 1);
  const loLimit = 1 / (n + 1);
  const hiLimit = 1 - loLimit;
  let bestIndex = 0;
  let bestScore = scoreEdgePlacement(R, mesh, edge, loLimit, options);
  for (let i = 1; i < n; i += 1) {
    const s = loLimit + (hiLimit - loLimit) * (i / (n - 1));
    const score = scoreEdgePlacement(R, mesh, edge, s, options);
    if (score.worstAr < bestScore.worstAr) { bestScore = score; bestIndex = i; }
  }
  const step = (hiLimit - loLimit) / (n - 1);
  let lo = Math.max(loLimit, loLimit + (bestIndex - 1) * step);
  let hi = Math.min(hiLimit, loLimit + (bestIndex + 1) * step);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = hi - phi * (hi - lo);
  let d = lo + phi * (hi - lo);
  let sc = scoreEdgePlacement(R, mesh, edge, c, options);
  let sd = scoreEdgePlacement(R, mesh, edge, d, options);
  for (let i = 0; i < 48; i += 1) {
    if (sc.worstAr <= sd.worstAr) {
      hi = d;
      d = c;
      sd = sc;
      c = hi - phi * (hi - lo);
      sc = scoreEdgePlacement(R, mesh, edge, c, options);
    } else {
      lo = c;
      c = d;
      sc = sd;
      d = lo + phi * (hi - lo);
      sd = scoreEdgePlacement(R, mesh, edge, d, options);
    }
  }
  if (sc.worstAr < bestScore.worstAr) bestScore = sc;
  if (sd.worstAr < bestScore.worstAr) bestScore = sd;
  return { edge, parameter: bestScore.parameter, score: bestScore, samples: n, certified: false };
}

function cloneMesh(mesh: FrontierMesh): FrontierMesh {
  return {
    vertices: mesh.vertices.map((v) => ({ ...v })),
    triangles: mesh.triangles.map((t) => ({ ...t, v: [...t.v] as [number, number, number] })),
  };
}

function pointWelds(mesh: FrontierMesh, p: FrontierVertex, excluded: readonly number[], weldMm: number): boolean {
  const skip = new Set(excluded);
  for (let i = 0; i < mesh.vertices.length; i += 1) {
    if (skip.has(i)) continue;
    const v = mesh.vertices[i];
    if (Math.hypot(v.x - p.x, v.y - p.y, v.z - p.z) <= weldMm) return true;
  }
  return false;
}

function splitScratchEdgeAtPoint(
  mesh: FrontierMesh,
  edge: FrontierEdge,
  point: FrontierVertex,
  weldMm: number,
): { mesh: FrontierMesh; vertex: number; replaced: number[] } | null {
  const [a, b] = edge;
  const incident = incidentTriangles(mesh, a, b);
  const va = mesh.vertices[a];
  const vb = mesh.vertices[b];
  if (incident.length === 0
    || Math.hypot(va.x - point.x, va.y - point.y, va.z - point.z) <= weldMm
    || Math.hypot(vb.x - point.x, vb.y - point.y, vb.z - point.z) <= weldMm
    || pointWelds(mesh, point, [a, b], weldMm)) return null;
  const out = cloneMesh(mesh);
  const m = out.vertices.length;
  out.vertices.push({ ...point });
  const remove = new Set(incident);
  const kept: FrontierTriangle[] = [];
  const made: FrontierTriangle[] = [];
  for (let i = 0; i < out.triangles.length; i += 1) {
    const tri = out.triangles[i];
    if (!remove.has(i)) { kept.push(tri); continue; }
    const oriented = orientedEdge(tri, a, b);
    if (oriented === null) return null;
    const rootSign = tri.rootSign ?? Math.sign(signedAreaParam(
      out.vertices[tri.v[0]].th,
      out.vertices[tri.v[0]].z,
      out.vertices[tri.v[1]].th,
      out.vertices[tri.v[1]].z,
      out.vertices[tri.v[2]].th,
      out.vertices[tri.v[2]].z,
    ));
    made.push(
      { v: [oriented.oa, m, oriented.apex], sourceTri: tri.sourceTri, born: true, rootSign },
      { v: [m, oriented.ob, oriented.apex], sourceTri: tri.sourceTri, born: true, rootSign },
    );
  }
  out.triangles = [...kept, ...made];
  return { mesh: out, vertex: m, replaced: incident };
}

function edgeExists(mesh: FrontierMesh, a: number, b: number): boolean {
  return incidentTriangles(mesh, a, b).length > 0;
}

function scorePatch(R: RadiusFn, mesh: FrontierMesh, options: FrontierOptions): PatchScore {
  let worstAr = 0;
  let bornTriangles = 0;
  let folds = 0;
  let back = 0;
  const aspectSources = new Set<number>();
  const foldSources = new Set<number>();
  const normalSources = new Set<number>();
  const reasons = new Set<SplitRejection>();
  for (const tri of mesh.triangles) {
    if (tri.born !== true) continue;
    bornTriangles += 1;
    const a = mesh.vertices[tri.v[0]];
    const b = mesh.vertices[tri.v[1]];
    const c = mesh.vertices[tri.v[2]];
    const child = scoreChild(
      R,
      a,
      b,
      c,
      tri.sourceTri,
      tri.rootSign ?? 0,
      options.shippedNormal,
    );
    worstAr = Math.max(worstAr, child.ar);
    if (child.ar > options.arCap) { reasons.add('aspect'); aspectSources.add(child.sourceTri); }
    if (child.fold) { folds += 1; reasons.add('fold'); foldSources.add(child.sourceTri); }
    if (child.footprintBack) { back += 1; reasons.add('normal'); normalSources.add(child.sourceTri); }
  }
  return {
    legal: reasons.size === 0,
    worstAr,
    bornTriangles,
    folds,
    footprintBack: back,
    aspectSources: [...aspectSources].sort((a, b) => a - b),
    foldSources: [...foldSources].sort((a, b) => a - b),
    normalSources: [...normalSources].sort((a, b) => a - b),
    reasons: [...reasons],
  };
}

/** Stage one protector split followed by the exact feature split, with no live-mesh mutation. */
export function executeProtectorAction(
  R: RadiusFn,
  mesh: FrontierMesh,
  targetEdge: FrontierEdge,
  kinkParameter: number,
  firstEdge: FrontierEdge,
  firstParameter: number,
  options: FrontierOptions,
): ProtectorExecution | null {
  const [targetA, targetB] = targetEdge;
  const featurePoint = liftOnEdge(R, mesh.vertices[targetA], mesh.vertices[targetB], kinkParameter);
  const firstPoint = liftOnEdge(R, mesh.vertices[firstEdge[0]], mesh.vertices[firstEdge[1]], firstParameter);
  const first = splitScratchEdgeAtPoint(mesh, firstEdge, firstPoint, options.weldMm);
  if (first === null) return null;
  let staged = first.mesh;
  let featureVertex = -1;
  let featureRecovered = false;
  if (frontierEdgeKey(firstEdge[0], firstEdge[1]) === frontierEdgeKey(targetA, targetB)) {
    const orientedS = firstEdge[0] === targetA ? firstParameter : 1 - firstParameter;
    if (Math.abs(orientedS - kinkParameter) <= 1e-12) {
      featureVertex = first.vertex;
      featureRecovered = edgeExists(staged, targetA, featureVertex) && edgeExists(staged, featureVertex, targetB);
    } else {
      const descendant: FrontierEdge = kinkParameter < orientedS
        ? [targetA, first.vertex]
        : [first.vertex, targetB];
      const second = splitScratchEdgeAtPoint(staged, descendant, featurePoint, options.weldMm);
      if (second === null) return null;
      staged = second.mesh;
      featureVertex = second.vertex;
      featureRecovered = kinkParameter < orientedS
        ? edgeExists(staged, targetA, featureVertex)
          && edgeExists(staged, featureVertex, first.vertex)
          && edgeExists(staged, first.vertex, targetB)
        : edgeExists(staged, targetA, first.vertex)
          && edgeExists(staged, first.vertex, featureVertex)
          && edgeExists(staged, featureVertex, targetB);
    }
  } else {
    const second = splitScratchEdgeAtPoint(staged, targetEdge, featurePoint, options.weldMm);
    if (second === null) return null;
    staged = second.mesh;
    featureVertex = second.vertex;
    featureRecovered = edgeExists(staged, targetA, featureVertex) && edgeExists(staged, featureVertex, targetB);
  }
  const score = scorePatch(R, staged, options);
  const changed = new Set(staged.triangles.filter((t) => t.born === true).map((t) => t.sourceTri)).size;
  return { mesh: staged, featureVertex, score, featureRecovered, changedSourceTriangles: changed };
}

/** Enumerate every current nudge placement on every edge of the target edge's incident pair. */
export function enumerateProtectorActions(
  R: RadiusFn,
  mesh: FrontierMesh,
  targetEdge: FrontierEdge,
  kinkParameter: number,
  options: FrontierOptions,
): ProtectorAction[] {
  const incident = incidentTriangles(mesh, targetEdge[0], targetEdge[1]);
  const edgeMap = new Map<string, FrontierEdge>();
  for (const triIndex of incident) {
    for (const edge of targetEdges(mesh.triangles[triIndex])) edgeMap.set(frontierEdgeKey(edge[0], edge[1]), edge);
  }
  const actions: ProtectorAction[] = [];
  for (const edge of edgeMap.values()) {
    // A boundary edge in the extracted patch cannot be scored on both sides and is not actionable.
    if (incidentTriangles(mesh, edge[0], edge[1]).length !== 2) continue;
    const p = mesh.vertices[edge[0]];
    const q = mesh.vertices[edge[1]];
    const candidates = new Set<number>();
    for (const fraction of options.nudgeFractions) {
      candidates.add(chordPlacement(R, p, q, fraction, options.mid3dIters, options.mid3dMaxShift));
    }
    candidates.add(sampledMinimaxPlacement(R, mesh, edge, options, 513).parameter);
    for (const firstParameter of candidates) {
      const requested = options.nudgeFractions.reduce((best, f) => {
        const s = chordPlacement(R, p, q, f, options.mid3dIters, options.mid3dMaxShift);
        return Math.abs(s - firstParameter) < Math.abs(best.s - firstParameter) ? { f, s } : best;
      }, { f: 0.5, s: chordPlacement(R, p, q, 0.5, options.mid3dIters, options.mid3dMaxShift) });
      const intermediate = scoreEdgePlacement(R, mesh, edge, firstParameter, options);
      const execution = executeProtectorAction(
        R,
        mesh,
        targetEdge,
        kinkParameter,
        edge,
        firstParameter,
        options,
      );
      if (execution === null) continue;
      actions.push({
        targetEdge,
        targetParameter: kinkParameter,
        firstEdge: edge,
        requestedFraction: requested.f,
        firstParameter,
        intermediateLegal: intermediate.legal,
        final: execution.score,
        featureRecovered: execution.featureRecovered,
        changedSourceTriangles: execution.changedSourceTriangles,
        legal: intermediate.legal && execution.featureRecovered && execution.score.legal,
      });
    }
  }
  actions.sort((a, b) => Number(b.legal) - Number(a.legal) || a.final.worstAr - b.final.worstAr);
  return actions;
}

function topologySignature(mesh: FrontierMesh): { euler: number; nonManifold: number } {
  const used = new Set<number>();
  const edges = new Map<string, number>();
  for (const triangle of mesh.triangles) {
    for (const vertex of triangle.v) used.add(vertex);
    for (const edge of targetEdges(triangle)) {
      const key = frontierEdgeKey(edge[0], edge[1]);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let nonManifold = 0;
  for (const count of edges.values()) if (count > 2) nonManifold += 1;
  return { euler: used.size - edges.size + mesh.triangles.length, nonManifold };
}

function expandTriangleRing(
  mesh: FrontierMesh,
  seeds: ReadonlySet<number>,
  rings: number,
  maxParents: number,
): Set<number> | null {
  const selected = new Set(seeds);
  let frontier = [...seeds];
  for (let ring = 0; ring < rings; ring += 1) {
    const next = new Set<number>();
    for (const triangleIndex of frontier) {
      for (const edge of targetEdges(mesh.triangles[triangleIndex])) {
        for (const neighbor of incidentTriangles(mesh, edge[0], edge[1])) {
          if (!selected.has(neighbor)) next.add(neighbor);
        }
      }
    }
    if (selected.size + next.size > maxParents) return null;
    for (const triangleIndex of next) selected.add(triangleIndex);
    frontier = [...next].sort((a, b) => a - b);
  }
  return selected;
}

function childSetPenalty(
  R: RadiusFn,
  mesh: FrontierMesh,
  triangles: readonly FrontierTriangle[],
  options: FrontierOptions,
): [number, number] {
  let rejected = 0;
  let worstAr = 0;
  for (const triangle of triangles) {
    const child = scoreChild(
      R,
      mesh.vertices[triangle.v[0]],
      mesh.vertices[triangle.v[1]],
      mesh.vertices[triangle.v[2]],
      triangle.sourceTri,
      triangle.rootSign ?? 0,
      options.shippedNormal,
    );
    worstAr = Math.max(worstAr, child.ar);
    if (child.ar > options.arCap || child.fold || child.footprintBack) rejected += 1;
  }
  return [rejected, worstAr];
}

function splitTriangleByMarkedEdges(
  R: RadiusFn,
  mesh: FrontierMesh,
  triangle: FrontierTriangle,
  midpoint: ReadonlyMap<string, number>,
  options: FrontierOptions,
): FrontierTriangle[] {
  const [a, b, c] = triangle.v;
  const mab = midpoint.get(frontierEdgeKey(a, b));
  const mbc = midpoint.get(frontierEdgeKey(b, c));
  const mca = midpoint.get(frontierEdgeKey(c, a));
  const rootSign = triangle.rootSign ?? Math.sign(signedAreaParam(
    mesh.vertices[a].th,
    mesh.vertices[a].z,
    mesh.vertices[b].th,
    mesh.vertices[b].z,
    mesh.vertices[c].th,
    mesh.vertices[c].z,
  ));
  const child = (v: [number, number, number]): FrontierTriangle => ({
    v,
    sourceTri: triangle.sourceTri,
    born: true,
    rootSign,
  });
  const count = Number(mab !== undefined) + Number(mbc !== undefined) + Number(mca !== undefined);
  if (count === 0) return [triangle];
  if (count === 1) {
    if (mab !== undefined) return [child([a, mab, c]), child([mab, b, c])];
    if (mbc !== undefined) return [child([b, mbc, a]), child([mbc, c, a])];
    return [child([c, mca as number, b]), child([mca as number, a, b])];
  }
  if (count === 3) {
    return [
      child([a, mab as number, mca as number]),
      child([mab as number, b, mbc as number]),
      child([mca as number, mbc as number, c]),
      child([mab as number, mbc as number, mca as number]),
    ];
  }
  let fixed: FrontierTriangle;
  let first: FrontierTriangle[];
  let second: FrontierTriangle[];
  if (mab !== undefined && mbc !== undefined) {
    fixed = child([mab, b, mbc]);
    first = [child([a, mab, mbc]), child([a, mbc, c])];
    second = [child([a, mab, c]), child([mab, mbc, c])];
  } else if (mbc !== undefined && mca !== undefined) {
    fixed = child([mbc, c, mca]);
    first = [child([b, mbc, mca]), child([b, mca, a])];
    second = [child([b, mbc, a]), child([mbc, mca, a])];
  } else {
    fixed = child([mca as number, a, mab as number]);
    first = [child([c, mca as number, mab as number]), child([c, mab as number, b])];
    second = [child([c, mca as number, b]), child([mca as number, mab as number, b])];
  }
  const firstSet = [fixed, ...first];
  const secondSet = [fixed, ...second];
  const firstPenalty = childSetPenalty(R, mesh, firstSet, options);
  const secondPenalty = childSetPenalty(R, mesh, secondSet, options);
  return firstPenalty[0] < secondPenalty[0]
    || (firstPenalty[0] === secondPenalty[0] && firstPenalty[1] <= secondPenalty[1])
    ? firstSet
    : secondSet;
}

function redGreenExecution(
  R: RadiusFn,
  mesh: FrontierMesh,
  targetEdge: FrontierEdge,
  selected: ReadonlySet<number>,
  rings: number,
  options: FrontierOptions,
): RedGreenExecution | null {
  const out = cloneMesh(mesh);
  const midpoint = new Map<string, number>();
  const splitEdges: Array<{ a: number; b: number; m: number }> = [];
  for (const triangleIndex of [...selected].sort((a, b) => a - b)) {
    for (const edge of targetEdges(mesh.triangles[triangleIndex])) {
      const key = frontierEdgeKey(edge[0], edge[1]);
      if (midpoint.has(key)) continue;
      const a = mesh.vertices[edge[0]];
      const b = mesh.vertices[edge[1]];
      const parameter = chordPlacement(R, a, b, 0.5, options.mid3dIters, options.mid3dMaxShift);
      const point = liftOnEdge(R, a, b, parameter);
      if (Math.hypot(a.x - point.x, a.y - point.y, a.z - point.z) <= options.weldMm
        || Math.hypot(b.x - point.x, b.y - point.y, b.z - point.z) <= options.weldMm
        || pointWelds(out, point, [edge[0], edge[1]], options.weldMm)) return null;
      const m = out.vertices.length;
      out.vertices.push(point);
      midpoint.set(key, m);
      splitEdges.push({ a: edge[0], b: edge[1], m });
    }
  }
  const changed = new Set<number>();
  let greenParents = 0;
  const triangles: FrontierTriangle[] = [];
  for (let triangleIndex = 0; triangleIndex < mesh.triangles.length; triangleIndex += 1) {
    const triangle = mesh.triangles[triangleIndex];
    const children = splitTriangleByMarkedEdges(R, out, triangle, midpoint, options);
    if (children.length === 1 && children[0] === triangle) {
      triangles.push(triangle);
      continue;
    }
    changed.add(triangle.sourceTri);
    if (!selected.has(triangleIndex)) greenParents += 1;
    triangles.push(...children);
  }
  out.triangles = triangles;
  const targetVertex = midpoint.get(frontierEdgeKey(targetEdge[0], targetEdge[1])) ?? -1;
  const targetRecovered = targetVertex >= 0
    && edgeExists(out, targetEdge[0], targetVertex)
    && edgeExists(out, targetVertex, targetEdge[1]);
  const splitEdgesConforming = splitEdges.every(({ a, b, m }) => !edgeExists(out, a, b)
    && edgeExists(out, a, m)
    && edgeExists(out, m, b));
  const before = topologySignature(mesh);
  const after = topologySignature(out);
  const topology: RedGreenTopology = {
    beforeEuler: before.euler,
    afterEuler: after.euler,
    eulerDelta: after.euler - before.euler,
    beforeNonManifold: before.nonManifold,
    afterNonManifold: after.nonManifold,
    splitEdgesConforming,
  };
  const score = scorePatch(R, out, options);
  const legal = targetRecovered
    && score.legal
    && topology.eulerDelta === 0
    && topology.afterNonManifold === topology.beforeNonManifold
    && topology.splitEdgesConforming;
  return {
    mesh: out,
    targetVertex,
    plan: {
      rings,
      redParents: selected.size,
      greenParents,
      changedSourceTriangles: changed.size,
      newVertices: midpoint.size,
      targetRecovered,
      score,
      topology,
      legal,
    },
  };
}

/**
 * Build bounded, atomic RED/green closure plans around the two parents of a target edge.
 * The plans are scratch-only; callers may inspect them but this function never writes an STL.
 */
export function dryPlanRedGreen(
  R: RadiusFn,
  mesh: FrontierMesh,
  targetEdge: FrontierEdge,
  options: FrontierOptions,
  maxRings = 2,
  maxParents = 64,
): RedGreenExecution[] {
  const seeds = new Set(incidentTriangles(mesh, targetEdge[0], targetEdge[1]));
  if (seeds.size === 0) return [];
  const plans: RedGreenExecution[] = [];
  for (let rings = 0; rings <= maxRings; rings += 1) {
    const selected = expandTriangleRing(mesh, seeds, rings, maxParents);
    if (selected === null) break;
    const execution = redGreenExecution(R, mesh, targetEdge, selected, rings, options);
    if (execution !== null) plans.push(execution);
  }
  return plans;
}
