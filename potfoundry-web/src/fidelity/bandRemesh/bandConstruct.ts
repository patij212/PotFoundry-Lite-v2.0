/**
 * bandConstruct.ts — curvature-aware variable-width band construction.
 *
 * Produces a feature-following ridge band whose (u,t) footprint is SIMPLE by
 * construction (the perpendicular flank offset cannot fold), so it welds into the
 * multiply-connected `corridorPaveMulti` interior with zero T-junctions. The cure
 * for the STEP-3a blocker: real (even conditioned) feature spines self-fold a
 * CONSTANT-width offset at sharp corners → non-simple footprints → double-cover.
 *
 * Mechanism: cap each spine station's flank half-width by the local (metric)
 * radius of curvature (`w_i ≤ safety·R_i`), so the offset stays within the
 * non-folding envelope; sharp corners pinch toward zero width (accept-class thin
 * slivers, per the standing min(20°,θ) posture); the crest is always the EXACT
 * spine (fidelity untouched). A verify-and-shrink net guarantees a simple footprint
 * (terminating — width→0 is always simple). Reuses paveRidge's proven assembly
 * ({@link assembleRidgeBands}).
 *
 * See `docs/superpowers/specs/2026-06-26-band-construction-design.md`.
 *
 * @module fidelity/bandRemesh/bandConstruct
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildStations } from './stations';
import type { StationPoint, StationGrid } from './stations';
import { paveBand } from './paver';
import type { RidgeResult } from './featureStrip';
import { perpUV, assembleRidgeBands } from './featureStrip';
import { densifyRail } from './stitch';
import { extractHoleBoundary } from './seamFill';
import { triangulatePolygon3D } from './junction';
import type { Vec3 } from './junction';
import { quantizeRailUT } from './railKey';

/** 3D distance between two (u,t) samples. */
function dist3(sampler: SurfaceSampler, a: StationPoint, b: StationPoint): number {
  const pa = sampler.position(a.u, a.t);
  const pb = sampler.position(b.u, b.t);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

/** Area of the 3D triangle (A,B,C). */
function area3(sampler: SurfaceSampler, A: StationPoint, B: StationPoint, C: StationPoint): number {
  const a = sampler.position(A.u, A.t);
  const b = sampler.position(B.u, B.t);
  const c = sampler.position(C.u, C.t);
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * Per-station radius of curvature (mm) along the spine, via 3D Menger curvature
 * `R = (|AB|·|BC|·|CA|) / (4·area(ABC))` over the three consecutive stations.
 * Straight runs → `Infinity`; sharp turns → small `R`. Endpoints → `Infinity`.
 */
export function measureSpineCurvatureRadius(spine: StationPoint[], sampler: SurfaceSampler): number[] {
  const n = spine.length;
  const out = new Array<number>(n).fill(Infinity);
  for (let i = 1; i < n - 1; i++) {
    const A = spine[i - 1], B = spine[i], C = spine[i + 1];
    const ab = dist3(sampler, A, B);
    const bc = dist3(sampler, B, C);
    const ca = dist3(sampler, C, A);
    const ar = area3(sampler, A, B, C);
    out[i] = ar > 1e-12 ? (ab * bc * ca) / (4 * ar) : Infinity;
  }
  return out;
}

/** Options for {@link safeHalfWidthProfile}. */
export interface HalfWidthOpts {
  /** Fraction of the curvature radius the half-width may use (default 0.8). */
  safety?: number;
  /** Min-filter neighborhood (stations each side) tapering a pinch (default 2). */
  taperRadius?: number;
  /** Optional per-station upper bound (mm) from feature density (assembler-supplied). */
  maxByDensity?: number[];
}

/**
 * Per-station flank half-width (mm): `w_i = min(target, safety·R_i, density_i)`,
 * then a min-filter over `±taperRadius` so a corner's pinch tapers across its
 * neighbours (prevents multi-segment folds). The crest is unaffected — only the
 * flank width adapts.
 */
export function safeHalfWidthProfile(
  radius: number[],
  targetWidthMm: number,
  opts: HalfWidthOpts = {},
): number[] {
  const safety = opts.safety ?? 0.8;
  const taper = opts.taperRadius ?? 2;
  const base = radius.map((R, i) => {
    let w = Math.min(targetWidthMm, safety * R);
    if (opts.maxByDensity) w = Math.min(w, opts.maxByDensity[i]);
    return w;
  });
  if (taper <= 0) return base;
  const out = base.slice();
  for (let i = 0; i < base.length; i++) {
    let m = base[i];
    for (let k = Math.max(0, i - taper); k <= Math.min(base.length - 1, i + taper); k++) {
      if (base[k] < m) m = base[k];
    }
    out[i] = m;
  }
  return out;
}

/** Offset each spine station by its own ±width along the metric perpendicular. */
export function offsetRailVariable(
  spine: StationPoint[],
  sampler: SurfaceSampler,
  widths: number[],
  sign: 1 | -1,
): StationPoint[] {
  const n = spine.length;
  const out: StationPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    let du = (b.u - a.u) % 1;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    const dt = b.t - a.t;
    const l = Math.hypot(du, dt) || 1;
    const { a: pa, b: pb } = perpUV(sampler, spine[i].u, spine[i].t, du / l, dt / l);
    const w = widths[i];
    out.push({ u: spine[i].u + sign * pa * w, t: spine[i].t + sign * pb * w });
  }
  return out;
}

/** Proper (strict-interior) crossing of (u,t) segments p1→p2 and p3→p4. */
function properCrossUT(
  p1: readonly [number, number], p2: readonly [number, number],
  p3: readonly [number, number], p4: readonly [number, number],
): boolean {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return false;
  const qpx = p3[0] - p1[0], qpy = p3[1] - p1[1];
  const tS = (qpx * sy - qpy * sx) / denom;
  const tU = (qpx * ry - qpy * rx) / denom;
  const E = 1e-12;
  return tS > E && tS < 1 - E && tU > E && tU < 1 - E;
}

/**
 * Count proper self-crossings of the band's (u,t) FOOTPRINT — the count-1 perimeter
 * loop of its mesh (the spine crease is count-2 interior). Returns `Infinity` when
 * the perimeter is not a single simple loop (a degenerate band). This is the weld
 * precondition `corridorPaveMulti`'s `pointInLoop` exclusion requires.
 */
export function footprintSelfCrossings(
  mesh: { indices: Uint32Array },
  vertexUT: Array<[number, number]>,
): number {
  let loop: number[];
  try {
    const bh = extractHoleBoundary({ indices: mesh.indices }, new Set<number>());
    if (bh.loops.length !== 1) return Infinity;
    loop = bh.loops[0];
  } catch {
    return Infinity;
  }
  const pts = loop.map((id) => vertexUT[id]);
  const m = pts.length;
  let count = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    for (let j = i + 1; j < m; j++) {
      if (j === i || (j + 1) % m === i || (i + 1) % m === j) continue;
      if (properCrossUT(a, b, pts[j], pts[(j + 1) % m])) count++;
    }
  }
  return count;
}

/**
 * Split a densified spine into maximal sub-spines at every interior station where a
 * full-width offset would FOLD (`radius[i] < minRadius`, with `minRadius =
 * safety·widthMm`). Adjacent sub-spines SHARE the split (corner) vertex exactly, so
 * the corner-join can weld them. Each returned sub-spine has `radius ≥ minRadius`
 * everywhere interior ⇒ its constant-width offset is simple (the proven `paveRidge`
 * regime). When nothing folds, returns the whole spine as one sub-spine.
 *
 * This is approach C's split step (approach A's variable-width pinch was refuted:
 * pinching corners degenerates the band; here corners become joins, not pinches).
 */
export function splitAtFoldPoints(
  spine: StationPoint[],
  radius: number[],
  minRadius: number,
): StationPoint[][] {
  const folds: number[] = [];
  for (let i = 1; i < spine.length - 1; i++) {
    if (radius[i] < minRadius) folds.push(i);
  }
  const copy = (a: number, b: number): StationPoint[] => spine.slice(a, b).map((p) => ({ u: p.u, t: p.t }));
  if (folds.length === 0) return [copy(0, spine.length)];
  const subs: StationPoint[][] = [];
  let start = 0;
  for (const f of folds) {
    subs.push(copy(start, f + 1)); // include the fold vertex as this sub-spine's end
    start = f; // ...and as the next sub-spine's start (shared corner)
  }
  subs.push(copy(start, spine.length));
  return subs;
}

/** Options for {@link paveRidgeAdaptive}. */
export interface AdaptiveRidgeOptions {
  /** Target flank half-width (mm) where curvature allows. */
  widthMm: number;
  /** Target 3D edge length (mm). */
  edgeMm: number;
  /** Curvature safety fraction (default 0.8). */
  safety?: number;
  /** Taper neighborhood (default 2). */
  taperRadius?: number;
  /** Optional per-DENSIFIED-station density bound (mm). Rare; usually omitted. */
  maxByDensity?: number[];
  /** Max verify-and-shrink iterations (default 8; w·0.7^8 ≈ 0.06·w). */
  maxShrink?: number;
}

/** {@link RidgeResult} plus the construction diagnostics. */
export interface AdaptiveRidgeResult extends RidgeResult {
  /** How many global width-shrinks the verify net needed (0 = the cap sufficed). */
  shrinks: number;
  /** Footprint self-crossings of the returned band (0 by the simplicity guarantee). */
  selfCrossings: number;
}

/**
 * Pave a ridge whose (u,t) footprint is SIMPLE by construction: cap each station's
 * flank half-width by the local curvature radius, then VERIFY and globally shrink
 * the width until the footprint has zero self-crossings (terminating — w→0 is always
 * simple). The crest is the exact spine; sharp corners pinch to accept-class thin
 * slivers. Reuses paveRidge's proven assembly ({@link assembleRidgeBands}).
 */
export function paveRidgeAdaptive(
  spine: StationPoint[],
  sampler: SurfaceSampler,
  opts: AdaptiveRidgeOptions,
): AdaptiveRidgeResult {
  const { widthMm, edgeMm } = opts;
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const spineDense = densifyRail(spine, sampler, maxSpacingMm);
  const radius = measureSpineCurvatureRadius(spineDense, sampler);
  const base = safeHalfWidthProfile(radius, widthMm, {
    safety: opts.safety,
    taperRadius: opts.taperRadius,
    maxByDensity: opts.maxByDensity,
  });

  const maxShrink = opts.maxShrink ?? 8;
  let scale = 1;
  let last: RidgeResult | null = null;
  let lastCross = Infinity;
  for (let s = 0; s <= maxShrink; s++) {
    const widths = base.map((w) => Math.max(1e-4, w * scale));
    const leftRail = densifyRail(offsetRailVariable(spineDense, sampler, widths, 1), sampler, maxSpacingMm);
    const rightRail = densifyRail(offsetRailVariable(spineDense, sampler, widths, -1), sampler, maxSpacingMm);
    const res = assembleRidgeBands(spineDense, leftRail, rightRail, sampler, edgeMm);
    const cross = footprintSelfCrossings(res.mesh, res.vertexUT);
    last = res;
    lastCross = cross;
    if (cross === 0) return { ...res, shrinks: s, selfCrossings: 0 };
    scale *= 0.7;
  }
  // Net exhausted (pathological spine) — return the best attempt + LOUD diagnostic.
  return { ...(last as RidgeResult), shrinks: maxShrink, selfCrossings: lastCross };
}

// ── Approach C: corner-split + join ───────────────────────────────────────────────

/** Options for {@link joinCorner} / {@link paveRidgeCornerSplit}. */
export interface CornerJoinOptions {
  /** Flank half-width (mm) — full width away from corners (no pinch). */
  widthMm: number;
  /** Target 3D edge length (mm). */
  edgeMm: number;
}

/** Wrapped (periodic-u) (u,t) direction from `a` to `b`, normalized in (u,t). */
function dirUT(a: StationPoint, b: StationPoint): { du: number; dt: number } {
  let du = (b.u - a.u) % 1;
  if (du > 0.5) du -= 1;
  if (du < -0.5) du += 1;
  const dt = b.t - a.t;
  const l = Math.hypot(du, dt) || 1;
  return { du: du / l, dt: dt / l };
}

/** Intersection of (u,t) lines P1+s·d1 and P2+r·d2; null if (near-)parallel. */
function lineIntersectUT(
  P1: StationPoint, d1: { du: number; dt: number },
  P2: StationPoint, d2: { du: number; dt: number },
): StationPoint | null {
  const denom = d1.du * d2.dt - d1.dt * d2.du;
  if (Math.abs(denom) < 1e-12) return null;
  const wu = P2.u - P1.u, wt = P2.t - P1.t;
  const s = (wu * d2.dt - wt * d2.du) / denom;
  return { u: P1.u + s * d1.du, t: P1.t + s * d1.dt };
}

/** Sign of the 3D turn `tIn → tOut` about the surface normal at C (>0 ⇒ +perp side is concave). */
function turnSign3D(
  sampler: SurfaceSampler, C: StationPoint,
  dIn: { du: number; dt: number }, dOut: { du: number; dt: number },
): number {
  const E = 1e-4;
  const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const pu = sub(sampler.position(C.u + E, C.t), sampler.position(C.u - E, C.t)).map((x) => x / (2 * E)) as [number, number, number];
  const pt = sub(sampler.position(C.u, C.t + E), sampler.position(C.u, C.t - E)).map((x) => x / (2 * E)) as [number, number, number];
  const n: [number, number, number] = [pu[1] * pt[2] - pu[2] * pt[1], pu[2] * pt[0] - pu[0] * pt[2], pu[0] * pt[1] - pu[1] * pt[0]];
  const t3 = (d: { du: number; dt: number }): [number, number, number] => [pu[0] * d.du + pt[0] * d.dt, pu[1] * d.du + pt[1] * d.dt, pu[2] * d.du + pt[2] * d.dt];
  const a = t3(dIn), b = t3(dOut);
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  return Math.sign(cx * n[0] + cy * n[1] + cz * n[2]);
}

/**
 * Clip an offset rail (ordered OUTER→corner, ending near `C`) so its corner end is
 * the miter point `M`: keep the points before `M` along the incoming tangent, drop
 * the overshooting tail, append `M`. The concave miter — no fold past the corner.
 */
function clipTailToMiter(raw: StationPoint[], M: StationPoint, dIn: { du: number; dt: number }): StationPoint[] {
  const out: StationPoint[] = [];
  const EPS = 1e-9;
  for (const Q of raw) {
    if ((Q.u - M.u) * dIn.du + (Q.t - M.t) * dIn.dt > EPS) break; // overshoots M toward the corner
    out.push({ u: Q.u, t: Q.t });
  }
  out.push({ u: M.u, t: M.t });
  return out;
}

/**
 * Clip an offset rail (ordered corner→OUTER, starting near `C`) so its corner end is
 * the miter point `M`: prepend `M`, drop the head points that fall before `M` along
 * the outgoing tangent. The mirror of {@link clipTailToMiter} for the second sub-band.
 */
function clipHeadToMiter(raw: StationPoint[], M: StationPoint, dOut: { du: number; dt: number }): StationPoint[] {
  const out: StationPoint[] = [{ u: M.u, t: M.t }];
  const EPS = 1e-9;
  for (const Q of raw) {
    if ((Q.u - M.u) * dOut.du + (Q.t - M.t) * dOut.dt < -EPS) continue; // before M, inside the miter
    out.push({ u: Q.u, t: Q.t });
  }
  return out;
}

/** A combined-mesh vertex interner (QSCALE dyadic, exact-(u,t) weld). */
interface CombinedTable {
  intern(u: number, t: number): number;
  ut: Array<[number, number]>;
}
function makeCombinedTable(): CombinedTable {
  const keyToId = new Map<string, number>();
  const ut: Array<[number, number]> = [];
  return {
    ut,
    intern(uRaw: number, tRaw: number): number {
      const [u, t] = quantizeRailUT(uRaw, tRaw);
      const key = `${u}|${t}`;
      let id = keyToId.get(key);
      if (id === undefined) { id = ut.length; keyToId.set(key, id); ut.push([u, t]); }
      return id;
    },
  };
}

/** One paved flank: its station grid (for end-row access) + combined-id triangles. */
interface PavedFlank {
  grid: StationGrid;
  /** crest-rail (outer flank edge) combined ids, in row order. */
  crestIds: number[];
}

/**
 * Pave one flank (foot=spine, crest=crestRail) and intern its triangles into the
 * shared combined table. Returns the grid (for corner end-row access) + crest ids.
 */
function addFlankToCombined(
  foot: StationPoint[], crestRail: StationPoint[], sampler: SurfaceSampler, edgeMm: number,
  maxSpacingMm: number, table: CombinedTable, tris: number[],
): PavedFlank {
  const crestDense = densifyRail(crestRail, sampler, maxSpacingMm);
  const grid = buildStations(foot, crestDense, sampler, edgeMm);
  const band = paveBand(grid, sampler);
  const map = band.utVertices.map((v) => table.intern(v[0], v[1]));
  for (let k = 0; k < band.indices.length; k += 3) {
    const a = map[band.indices[k]], b = map[band.indices[k + 1]], c = map[band.indices[k + 2]];
    if (a === b || b === c || c === a) continue;
    tris.push(a, b, c);
  }
  return { grid, crestIds: band.railVertexIds.crest.map((id) => map[id]) };
}

/** Triangulate a small (u,t) polygon Steiner-free and append to `tris` (combined ids). */
function fillPolygon(loopPts: StationPoint[], sampler: SurfaceSampler, table: CombinedTable, tris: number[]): void {
  const loopIds = loopPts.map((p) => table.intern(p.u, p.t));
  const loopXyz: Vec3[] = loopPts.map((p) => sampler.position(p.u, p.t) as Vec3);
  for (const [la, lb, lc] of triangulatePolygon3D(loopXyz)) {
    const a = loopIds[la], b = loopIds[lb], c = loopIds[lc];
    if (a === b || b === c || c === a) continue;
    tris.push(a, b, c);
  }
}

/** Resolved corner frame between a sub-spine ending at C and the next starting at C. */
interface CornerGeom {
  dIn: { du: number; dt: number };
  dOut: { du: number; dt: number };
  mLeft: StationPoint | null;
  mRight: StationPoint | null;
  /** True ⇒ the +perp (left) flank is the inside of the turn (concave). */
  leftConcave: boolean;
}

/** Corner frame at the shared vertex `C` of `endDense` (ends at C) and `startDense` (starts at C). */
function computeCornerGeom(
  endDense: StationPoint[], startDense: StationPoint[], C: StationPoint, sampler: SurfaceSampler, widthMm: number,
): CornerGeom {
  const dIn = dirUT(endDense[endDense.length - 2], C);
  const dOut = dirUT(C, startDense[1]);
  const pIn = perpUV(sampler, C.u, C.t, dIn.du, dIn.dt);
  const pOut = perpUV(sampler, C.u, C.t, dOut.du, dOut.dt);
  const crestInL: StationPoint = { u: C.u + pIn.a * widthMm, t: C.t + pIn.b * widthMm };
  const crestOutL: StationPoint = { u: C.u + pOut.a * widthMm, t: C.t + pOut.b * widthMm };
  const crestInR: StationPoint = { u: C.u - pIn.a * widthMm, t: C.t - pIn.b * widthMm };
  const crestOutR: StationPoint = { u: C.u - pOut.a * widthMm, t: C.t - pOut.b * widthMm };
  return {
    dIn, dOut,
    mLeft: lineIntersectUT(crestInL, dIn, crestOutL, dOut),
    mRight: lineIntersectUT(crestInR, dIn, crestOutR, dOut),
    leftConcave: turnSign3D(sampler, C, dIn, dOut) > 0,
  };
}

/**
 * Assemble a chain of sub-spines (each sharing its endpoints with its neighbours at
 * fold corners) into ONE watertight ridge with a SIMPLE (u,t) footprint — the general
 * core of approach C. Each sub-band is paved at FULL width over its own sub-spine (so
 * every corner `C` is a first/last `buildStations` row ⇒ crest EXACT through corners);
 * each interior corner is a JOIN: concave crest rails clipped to the shared miter `M`
 * (byte-identical `C→M` cross-rows weld, no overlap/fold), convex wedge filled
 * Steiner-free by `triangulatePolygon3D` (full width, no pinch). All interned by exact
 * (u,t) key (QSCALE) so sub-bands + wedges weld into one mesh.
 */
function assembleSubSpines(
  subSpines: StationPoint[][], sampler: SurfaceSampler, opts: CornerJoinOptions,
): RidgeResult {
  const { widthMm, edgeMm } = opts;
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const N = subSpines.length;
  const dense = subSpines.map((s) => densifyRail(s, sampler, maxSpacingMm));

  // Corner i is the shared vertex between dense[i] (its end) and dense[i+1] (its start).
  const corners: CornerGeom[] = [];
  for (let i = 0; i < N - 1; i++) {
    const C = dense[i][dense[i].length - 1];
    corners.push(computeCornerGeom(dense[i], dense[i + 1], C, sampler, widthMm));
  }

  const table = makeCombinedTable();
  const tris: number[] = [];
  const flankL: PavedFlank[] = [];
  const flankR: PavedFlank[] = [];

  for (let i = 0; i < N; i++) {
    const widths = new Array<number>(dense[i].length).fill(widthMm);
    const rawL = offsetRailVariable(dense[i], sampler, widths, 1);
    const rawR = offsetRailVariable(dense[i], sampler, widths, -1);
    let railL = rawL;
    let railR = rawR;
    const endCorner = i < N - 1 ? corners[i] : null; // C at the END of dense[i]
    const startCorner = i > 0 ? corners[i - 1] : null; // C at the START of dense[i]
    // Clip the CONCAVE rail to the miter at each corner end (convex rails keep full offset).
    if (endCorner) {
      if (endCorner.leftConcave) { if (endCorner.mLeft) railL = clipTailToMiter(railL, endCorner.mLeft, endCorner.dIn); }
      else if (endCorner.mRight) railR = clipTailToMiter(railR, endCorner.mRight, endCorner.dIn);
    }
    if (startCorner) {
      if (startCorner.leftConcave) { if (startCorner.mLeft) railL = clipHeadToMiter(railL, startCorner.mLeft, startCorner.dOut); }
      else if (startCorner.mRight) railR = clipHeadToMiter(railR, startCorner.mRight, startCorner.dOut);
    }
    // GUARD: a sub-spine shorter than the band width can have BOTH-end clips collapse
    // its concave rail below 2 points (no band can support that miter). Fall back to the
    // raw full-width offset there — the corner stays un-mitered (may fold, recorded by the
    // footprintSelfCrossings net) but the construction never CRASHES on dense corners.
    if (railL.length < 2) railL = rawL;
    if (railR.length < 2) railR = rawR;
    flankL.push(addFlankToCombined(dense[i], railL, sampler, edgeMm, maxSpacingMm, table, tris));
    flankR.push(addFlankToCombined(dense[i], railR, sampler, edgeMm, maxSpacingMm, table, tris));
  }

  // Convex wedge fill at each interior corner.
  for (let i = 0; i < N - 1; i++) {
    const cg = corners[i];
    const aConvex = cg.leftConcave ? flankR[i] : flankL[i];
    const bConvex = cg.leftConcave ? flankR[i + 1] : flankL[i + 1];
    const aRowC = aConvex.grid.rows[aConvex.grid.rows.length - 1].w; // [C, …, crestInConvex]
    const bRowC = bConvex.grid.rows[0].w; // [C, …, crestOutConvex]
    fillPolygon([...aRowC, ...bRowC.slice(1).reverse()], sampler, table, tris);
  }

  // Open boundary: every flank's crest rail + the two free t-ends (first sub-spine's
  // start rows, last sub-spine's end rows). Corner cross-rows + the crease are interior.
  const openBoundaryVertices = new Set<number>();
  for (const f of [...flankL, ...flankR]) for (const id of f.crestIds) openBoundaryVertices.add(id);
  for (const f of [flankL[0], flankR[0]]) for (const p of f.grid.rows[0].w) openBoundaryVertices.add(table.intern(p.u, p.t));
  for (const f of [flankL[N - 1], flankR[N - 1]]) {
    const outer = f.grid.rows[f.grid.rows.length - 1].w;
    for (const p of outer) openBoundaryVertices.add(table.intern(p.u, p.t));
  }

  // Crease (spine) ids: foot rows across all sub-spines, dropping shared-corner dups.
  const spineVertexIds: number[] = [];
  for (let i = 0; i < N; i++) {
    const foot = flankL[i].grid.rows.map((r) => table.intern(r.footPt.u, r.footPt.t));
    spineVertexIds.push(...(i === 0 ? foot : foot.slice(1)));
  }

  const positions = new Float32Array(table.ut.length * 3);
  for (let i = 0; i < table.ut.length; i++) {
    const p = sampler.position(table.ut[i][0], table.ut[i][1]);
    positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
  }
  return {
    mesh: { positions, indices: new Uint32Array(tris) },
    vertexUT: table.ut.map((v) => [v[0], v[1]] as [number, number]),
    spineVertexIds,
    openBoundaryVertices,
  };
}

/**
 * Join two sub-spines that meet at a shared corner vertex `C`
 * (`subSpineA[last]` === `subSpineB[0]` === `C`) into ONE watertight ridge whose
 * (u,t) footprint is SIMPLE by construction — the approach-C corner-join (the 2-arm
 * case of {@link assembleSubSpines}). The crest stays EXACT through the corner; the
 * concave flank mitres to a shared vertex, the convex flank fills its wedge.
 */
export function joinCorner(
  subSpineA: StationPoint[],
  subSpineB: StationPoint[],
  sampler: SurfaceSampler,
  opts: CornerJoinOptions,
): RidgeResult {
  return assembleSubSpines([subSpineA, subSpineB], sampler, opts);
}

/** Options for {@link paveRidgeCornerSplit}. */
export interface CornerSplitOptions extends CornerJoinOptions {
  /**
   * Split the spine at every station whose curvature radius is below
   * `safety·widthMm` (where a full-width offset would fold). Default 1.5. Calibrate
   * UP (more splits) to harden construction — never relax the gate.
   */
  safety?: number;
}

/**
 * Pave a feature ridge whose (u,t) footprint is SIMPLE by construction for ANY spine
 * — the approach-C drop-in for `paveRidge`. Densify → measure curvature →
 * `splitAtFoldPoints` (at every station whose radius < `safety·widthMm`, where a
 * full-width offset would fold) → {@link assembleSubSpines} (pave each sub-spine at
 * full width + join the corners). A fold-free spine yields one sub-spine ⇒ a single
 * ridge. `footprintSelfCrossings === 0` is the by-construction net the assembler must
 * meet (callers/gates assert it).
 */
export function paveRidgeCornerSplit(
  spine: StationPoint[],
  sampler: SurfaceSampler,
  opts: CornerSplitOptions,
): RidgeResult {
  const { widthMm, edgeMm, safety = 1.5 } = opts;
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const spineDense = densifyRail(spine, sampler, maxSpacingMm);
  const radius = measureSpineCurvatureRadius(spineDense, sampler);
  const subSpines = splitAtFoldPoints(spineDense, radius, safety * widthMm);
  return assembleSubSpines(subSpines, sampler, { widthMm, edgeMm });
}

/** Outgoing (u,t) azimuth of an arm at J in the metric tangent plane (for CCW ordering). */
function armAzimuth(arm: StationPoint[], J: StationPoint, sampler: SurfaceSampler): number {
  const d = dirUT(J, arm[1]);
  const E = 1e-4;
  const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const pu = sub(sampler.position(J.u + E, J.t), sampler.position(J.u - E, J.t)) as [number, number, number];
  const pt = sub(sampler.position(J.u, J.t + E), sampler.position(J.u, J.t - E)) as [number, number, number];
  const t3 = [pu[0] * d.du + pt[0] * d.dt, pu[1] * d.du + pt[1] * d.dt, pu[2] * d.du + pt[2] * d.dt];
  const x = t3[0] * pu[0] + t3[1] * pu[1] + t3[2] * pu[2];
  const y = t3[0] * pt[0] + t3[1] * pt[1] + t3[2] * pt[2];
  return Math.atan2(y, x);
}

/**
 * Compose N ridge bands meeting at a shared node J into ONE watertight ridge whose
 * (u,t) footprint is SIMPLE by construction — the approach-C corner-join generalized
 * from degree-2 to degree-N.
 *
 * Each `spines[i]` is a (u,t) polyline whose FIRST vertex is the shared node J (exact
 * (u,t) across all arms). Each arm is paved at FULL width sharing J as a crease end;
 * the arms are ordered by azimuth around J; each azimuth SECTOR between two adjacent
 * arms is resolved by the per-corner machinery — here the wide-sector wedge fill
 * between arm-A's CCW-facing (+perp) J-row and arm-B's CW-facing (−perp) J-row, all
 * sharing J (Steiner-free via `triangulatePolygon3D`). Narrow-sector miter = Task 2.
 */
export function paveRidgeJunction(
  spines: StationPoint[][],
  sampler: SurfaceSampler,
  opts: CornerJoinOptions,
): RidgeResult {
  const { widthMm, edgeMm } = opts;
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const J: StationPoint = { u: spines[0][0].u, t: spines[0][0].t };
  const arms = spines.map((s) => densifyRail(s, sampler, maxSpacingMm));
  const order = arms
    .map((a, i) => ({ i, az: armAzimuth(a, J, sampler) }))
    .sort((p, q) => p.az - q.az)
    .map((o) => o.i);

  // Per-arm ±perp rails (J = head). +perp (railP) faces the CCW sector; −perp (railM) the CW sector.
  const railP = arms.map((a) => offsetRailVariable(a, sampler, new Array<number>(a.length).fill(widthMm), 1));
  const railM = arms.map((a) => offsetRailVariable(a, sampler, new Array<number>(a.length).fill(widthMm), -1));

  // Resolve each CCW sector: < 180° ⇒ the two facing flanks OVERLAP near J → MITER them to a
  // shared point M (clip both facing rail heads to M; their J-rows become the identical
  // buildCrossBandRow(J,M) ⇒ weld). > 180° (reflex) ⇒ they DIVERGE → wedge-fill (deferred to
  // the loop after paving). This is the corner-join's concave-miter / convex-wedge split, per sector.
  const N = order.length;
  const reflexSectors: number[] = []; // sector index k (arm order[k] → order[k+1])
  for (let k = 0; k < N; k++) {
    const a = order[k], b = order[(k + 1) % N];
    const azGap = (() => {
      const g = arms.map((arm) => armAzimuth(arm, J, sampler));
      let d = g[b] - g[a];
      return ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    })();
    if (azGap > Math.PI) { reflexSectors.push(k); continue; }
    // Miter: M = intersection of arm-a's +perp crest line and arm-b's −perp crest line.
    const dA = dirUT(J, arms[a][1]);
    const dB = dirUT(J, arms[b][1]);
    const pA = perpUV(sampler, J.u, J.t, dA.du, dA.dt);
    const pB = perpUV(sampler, J.u, J.t, dB.du, dB.dt);
    const crestA: StationPoint = { u: J.u + pA.a * widthMm, t: J.t + pA.b * widthMm };
    const crestB: StationPoint = { u: J.u - pB.a * widthMm, t: J.t - pB.b * widthMm };
    const M = lineIntersectUT(crestA, dA, crestB, dB);
    if (M) {
      railP[a] = clipHeadToMiter(railP[a], M, dA);
      railM[b] = clipHeadToMiter(railM[b], M, dB);
    }
  }

  const table = makeCombinedTable();
  const tris: number[] = [];
  const left: PavedFlank[] = [];
  const right: PavedFlank[] = [];
  for (let i = 0; i < arms.length; i++) {
    left.push(addFlankToCombined(arms[i], railP[i], sampler, edgeMm, maxSpacingMm, table, tris));
    right.push(addFlankToCombined(arms[i], railM[i], sampler, edgeMm, maxSpacingMm, table, tris));
  }

  // Reflex sectors only: wedge-fill between arm-A's +perp J-row and arm-B's −perp J-row (share J).
  for (const k of reflexSectors) {
    const a = order[k], b = order[(k + 1) % N];
    const aRow = left[a].grid.rows[0].w;
    const bRow = right[b].grid.rows[0].w;
    fillPolygon([...aRow, ...bRow.slice(1).reverse()], sampler, table, tris);
  }

  // Open boundary: every flank crest rail + every arm's outer (free) end row.
  const openBoundaryVertices = new Set<number>();
  for (const f of [...left, ...right]) {
    for (const id of f.crestIds) openBoundaryVertices.add(id);
    const outer = f.grid.rows[f.grid.rows.length - 1].w;
    for (const p of outer) openBoundaryVertices.add(table.intern(p.u, p.t));
  }
  const spineVertexIds: number[] = [];
  for (const f of left) for (const r of f.grid.rows) spineVertexIds.push(table.intern(r.footPt.u, r.footPt.t));

  const positions = new Float32Array(table.ut.length * 3);
  for (let i = 0; i < table.ut.length; i++) {
    const p = sampler.position(table.ut[i][0], table.ut[i][1]);
    positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
  }
  return {
    mesh: { positions, indices: new Uint32Array(tris) },
    vertexUT: table.ut.map((v) => [v[0], v[1]] as [number, number]),
    spineVertexIds,
    openBoundaryVertices,
  };
}
