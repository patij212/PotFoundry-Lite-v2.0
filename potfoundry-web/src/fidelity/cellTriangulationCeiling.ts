/**
 * cellTriangulationCeiling.ts — feasibility measurement for the crest-
 * elimination program's load-bearing unknown (blueprint `openRisks` #1 +
 * Stage 3 Step C): can CONNECTIVITY ALONE remove the slivers an axis-aligned
 * (u,t) grid produces where a diagonal/cusped crest crosses a cell, once the
 * crest crossings are placed EXACTLY on the grid lines (the Stage-4 watertight-
 * preserving placement)?
 *
 * ## The hypothesis under test (falsifiable, mm/angle, no percent gates)
 *
 *   H: for a real SFB@1 crest-crossing feature cell, with the crest entry/exit
 *      placed EXACTLY at the analytic-ridge ∩ grid-line intersection (so both
 *      neighbouring cells derive the identical point → watertight by
 *      construction), there EXISTS a triangulation of the fixed point set —
 *      the crest held as a constraint edge — whose minimum triangle angle,
 *      measured in 3D on the true surface, exceeds 15°.
 *
 * If H holds across the real cell population, the band residual is reachable by
 * a smarter cell-interior triangulation (Step C) and the staged plan is sound.
 * If H FAILS for a material fraction, placement + connectivity is provably
 * insufficient — the cure is crest-aligned/sheared cells (deferred Stage 5),
 * not a better diagonal.
 *
 * ## Why the answer is decidable by enumeration
 *
 * A single straight crest chord through an axis-aligned cell partitions it into
 * exactly TWO simple sub-polygons sharing only the chord. Because the chord is
 * a hard constraint, the two sides triangulate INDEPENDENTLY, so
 *
 *   bestCellMinAngle = min( best(subA), best(subB) )
 *   best(sub)        = max over all triangulations of ( min triangle angle ).
 *
 * Each sub-polygon is convex (a rectangle cut by a chord), so ALL its
 * triangulations are the fan decompositions enumerated by
 * {@link triangulationsOfNgon} (Catalan(n−2) of them, n ≤ 6 here). The min
 * angle is measured in 3D via the SAME production wall surface the snap-floor
 * audit uses ({@link SfbWallSampler}) — never in (u,t), so the reference-
 * domination trap that fooled prior sessions cannot recur. The "ships today"
 * baseline is the REAL production cell fill ({@link triangulateConstrainedCell}
 * = cdt2d) on the identical exact-placed input.
 *
 * THE KEY STRUCTURAL FACT this measurement surfaces: when the crest clips a
 * cell CORNER (enters two ADJACENT edges), one sub-polygon is a single triangle
 * {corner, entry, exit} whose three vertices are ALL pinned (corner by the
 * grid, entry/exit by the watertight crest∩grid-line rule). That triangle is an
 * invariant of placement+constraint — NO triangulation can change it. If it is
 * a sliver, the cell is unfixable by connectivity, full stop.
 *
 * Pure CPU (vitest-trusted). Imports production modules READ-ONLY; the only
 * production-adjacent change is the `export` keyword added to the already-
 * committed audit's `SfbWallSampler` + pinned config (behaviour unchanged) so
 * this sibling pins the IDENTICAL surface and config — single source of truth.
 */
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import { triangulateConstrainedCell } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import type { PositionSampler } from './metrics';
import type { ParamRidgePoint } from './crestLateralDeviation';
import { sfClosedFormParamRidge } from './crestLateralDeviation';
import {
  SfbWallSampler,
  SFB1_PACKED,
  SFB_FEATURE_LEVEL,
  SFB_UBIAS,
} from './snapPlacementAudit';

const RAD2DEG = 180 / Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// Triangulation enumeration (convex polygon → all fan decompositions)
// ─────────────────────────────────────────────────────────────────────────────

const ngonCache = new Map<number, Array<Array<[number, number, number]>>>();

/**
 * All triangulations of a CONVEX polygon with vertices 0..n−1 in CCW order,
 * each as a list of CCW triangle index-triples. Count = Catalan(n−2). For a
 * convex polygon every fan diagonal is valid, so the recursion (fix the base
 * edge (lo,hi); pick every apex k between; recurse on the two chains) is
 * COMPLETE — it enumerates the entire triangulation set, not a sample.
 */
export function triangulationsOfNgon(n: number): Array<Array<[number, number, number]>> {
  if (n < 3) return [[]];
  const cached = ngonCache.get(n);
  if (cached) return cached;
  const rec = (lo: number, hi: number): Array<Array<[number, number, number]>> => {
    if (hi - lo < 2) return [[]];
    const out: Array<Array<[number, number, number]>> = [];
    for (let k = lo + 1; k <= hi - 1; k++) {
      const left = rec(lo, k);
      const right = rec(k, hi);
      for (const L of left) {
        for (const R of right) {
          out.push([...L, [lo, k, hi], ...R]);
        }
      }
    }
    return out;
  };
  const all = rec(0, n - 1);
  ngonCache.set(n, all);
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D triangle quality (on the true surface — never in (u,t))
// ─────────────────────────────────────────────────────────────────────────────

type V3 = readonly [number, number, number];

/** Min interior angle (degrees) of the 3D triangle a,b,c. 0 for a degenerate
 *  (zero-length-edge) triangle. */
function triMinAngleDeg3(a: V3, b: V3, c: V3): number {
  const ang = (p: V3, q: V3, r: V3): number => {
    const v1x = q[0] - p[0];
    const v1y = q[1] - p[1];
    const v1z = q[2] - p[2];
    const v2x = r[0] - p[0];
    const v2y = r[1] - p[1];
    const v2z = r[2] - p[2];
    const l1 = Math.hypot(v1x, v1y, v1z);
    const l2 = Math.hypot(v2x, v2y, v2z);
    if (l1 < 1e-12 || l2 < 1e-12) return 0;
    let cos = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
    if (cos > 1) cos = 1;
    if (cos < -1) cos = -1;
    return Math.acos(cos) * RAD2DEG;
  };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}

/**
 * Best achievable 3D min-angle over ALL triangulations of a convex CCW
 * polygon (in (u,t), mapped to 3D through `surf`). For n=3 the single triangle
 * is forced — there is no choice.
 */
export function polygonBestMinAngle3D(poly: CellPoint[], surf: PositionSampler): number {
  const n = poly.length;
  if (n < 3) return Infinity;
  const P: V3[] = poly.map((p) => surf.position(p.u, p.t));
  if (n === 3) return triMinAngleDeg3(P[0], P[1], P[2]);
  let best = 0;
  for (const T of triangulationsOfNgon(n)) {
    let mn = Infinity;
    for (const [i, j, k] of T) {
      const a = triMinAngleDeg3(P[i], P[j], P[k]);
      if (a < mn) mn = a;
      if (mn <= best) break; // prune: this triangulation can't beat the incumbent
    }
    if (mn > best) best = mn;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// One cell, exact crest placement → best-vs-Delaunay ceiling
// ─────────────────────────────────────────────────────────────────────────────

export type CellTopology = 'corner-clip' | 'opposite' | 'same-side' | 'degenerate';

export interface CellCeilingRecord {
  u0: number;
  t0: number;
  u1: number;
  t1: number;
  /** Crest entry/exit (exactly on the cell boundary / grid lines). */
  e1: CellPoint;
  e2: CellPoint;
  topology: CellTopology;
  /** Best 3D min-angle achievable by ANY triangulation (the ceiling). */
  bestMinAngleDeg: number;
  /** 3D min-angle of the REAL production fill (cdt2d) on the same input. */
  delaunayMinAngleDeg: number;
  /** For a corner-clip: the forced corner-triangle 3D min-angle (= a hard
   *  ceiling on bestMinAngleDeg). −1 when not a corner-clip. */
  forcedCornerMinAngleDeg: number;
  /** cdt2d masking-channel counters (nonzero ⇒ the Delaunay number is suspect). */
  delaunayDrops: number;
  delaunayInversions: number;
  /** Vertex counts of the two sub-polygons (chord-split). */
  subVertexCounts: [number, number];
}

const EPS = 1e-9;

/** Which cell edge a boundary point lies strictly on, or 'corner'/'off'. */
function edgeOf(
  p: CellPoint,
  u0: number,
  t0: number,
  u1: number,
  t1: number,
): 'S' | 'E' | 'N' | 'W' | 'corner' | 'off' {
  const onS = Math.abs(p.t - t0) < EPS;
  const onN = Math.abs(p.t - t1) < EPS;
  const onW = Math.abs(p.u - u0) < EPS;
  const onE = Math.abs(p.u - u1) < EPS;
  const count = (onS ? 1 : 0) + (onN ? 1 : 0) + (onW ? 1 : 0) + (onE ? 1 : 0);
  if (count !== 1) return count >= 2 ? 'corner' : 'off';
  if (onS) return 'S';
  if (onE) return 'E';
  if (onN) return 'N';
  return 'W';
}

/**
 * Measure one cell crossed by a single crest chord (e1→e2, both already placed
 * exactly on the cell boundary). Splits the cell by the chord, enumerates every
 * triangulation of each sub-polygon, and reports the best achievable 3D
 * min-angle alongside the production fill's 3D min-angle.
 */
export function measureCellCeiling(
  u0: number,
  t0: number,
  u1: number,
  t1: number,
  e1: CellPoint,
  e2: CellPoint,
  surf: PositionSampler,
): CellCeilingRecord {
  const s1 = edgeOf(e1, u0, t0, u1, t1);
  const s2 = edgeOf(e2, u0, t0, u1, t1);

  const base: CellCeilingRecord = {
    u0, t0, u1, t1, e1, e2,
    topology: 'degenerate',
    bestMinAngleDeg: 0,
    delaunayMinAngleDeg: 0,
    forcedCornerMinAngleDeg: -1,
    delaunayDrops: 0,
    delaunayInversions: 0,
    subVertexCounts: [0, 0],
  };

  if (s1 === 'corner' || s1 === 'off' || s2 === 'corner' || s2 === 'off') return base;
  if (s1 === s2) return { ...base, topology: 'same-side' };

  const adjacent =
    (s1 === 'S' || s1 === 'N' ? s2 === 'E' || s2 === 'W' : s2 === 'S' || s2 === 'N');
  const topology: CellTopology = adjacent ? 'corner-clip' : 'opposite';

  // Build the CCW boundary: corners + the (up to one per side) crossing on each
  // side, inserted in CCW order (S asc u, E asc t, N desc u, W desc t).
  const sw: CellPoint = { u: u0, t: t0 };
  const se: CellPoint = { u: u1, t: t0 };
  const ne: CellPoint = { u: u1, t: t1 };
  const nw: CellPoint = { u: u0, t: t1 };
  const onSide = (side: 'S' | 'E' | 'N' | 'W'): CellPoint[] => {
    const out: CellPoint[] = [];
    if (s1 === side) out.push(e1);
    if (s2 === side) out.push(e2);
    return out;
  };
  const boundary: CellPoint[] = [
    sw, ...onSide('S'),
    se, ...onSide('E'),
    ne, ...onSide('N'),
    nw, ...onSide('W'),
  ];

  const sameUT = (a: CellPoint, b: CellPoint): boolean =>
    Math.abs(a.u - b.u) < EPS && Math.abs(a.t - b.t) < EPS;
  const i1 = boundary.findIndex((p) => sameUT(p, e1));
  const i2 = boundary.findIndex((p) => sameUT(p, e2));
  if (i1 < 0 || i2 < 0) return base;
  const lo = Math.min(i1, i2);
  const hi = Math.max(i1, i2);

  // Two chord-split sub-polygons (each carries the chord as its closing edge).
  const subA = boundary.slice(lo, hi + 1);
  const subB = [...boundary.slice(hi), ...boundary.slice(0, lo + 1)];

  const bestA = polygonBestMinAngle3D(subA, surf);
  const bestB = polygonBestMinAngle3D(subB, surf);
  const bestMinAngleDeg = Math.min(bestA, bestB);

  let forcedCornerMinAngleDeg = -1;
  if (topology === 'corner-clip') {
    // The triangular sub IS the forced corner triangle.
    if (subA.length === 3) forcedCornerMinAngleDeg = bestA;
    else if (subB.length === 3) forcedCornerMinAngleDeg = bestB;
  }

  // "Ships today": the REAL production fill on the identical exact-placed input.
  const cdt = triangulateConstrainedCell({
    boundary,
    interior: [],
    constraints: [[i1, i2]],
  });
  let delaunayMinAngleDeg = cdt.triangles.length > 0 ? Infinity : 0;
  for (const [a, b, c] of cdt.triangles) {
    const m = triMinAngleDeg3(
      surf.position(cdt.points[a].u, cdt.points[a].t),
      surf.position(cdt.points[b].u, cdt.points[b].t),
      surf.position(cdt.points[c].u, cdt.points[c].t),
    );
    if (m < delaunayMinAngleDeg) delaunayMinAngleDeg = m;
  }
  if (!Number.isFinite(delaunayMinAngleDeg)) delaunayMinAngleDeg = 0;

  return {
    u0, t0, u1, t1, e1, e2,
    topology,
    bestMinAngleDeg,
    delaunayMinAngleDeg,
    forcedCornerMinAngleDeg,
    delaunayDrops: cdt.droppedCount,
    delaunayInversions: cdt.inversionCount,
    subVertexCounts: [subA.length, subB.length],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Walk a crest across the production grid → all crossed cells
// ─────────────────────────────────────────────────────────────────────────────

interface Crossing {
  u: number;
  t: number;
}

/**
 * Exact crest ∩ grid-line crossings along a branch polyline (ordered by t).
 * The on-grid coordinate is set EXACTLY (u=col/uSpan or t=row/tSpan — the
 * watertight, shareable value); the off-grid coordinate is linearly
 * interpolated on the dense analytic ridge polyline (sub-µm class, far below
 * the cell size, so the cell classification and angles are unaffected).
 */
function branchGridCrossings(
  points: ParamRidgePoint[],
  uSpan: number,
  tSpan: number,
): Crossing[] {
  const cr: Crossing[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dt = b.t - a.t;
    if (dt <= 0) continue; // solver contract: t strictly increasing
    // Horizontal grid lines t = row/tSpan in (a.t, b.t].
    const rLo = Math.floor(a.t * tSpan) + 1;
    const rHi = Math.floor(b.t * tSpan + EPS);
    for (let r = rLo; r <= rHi; r++) {
      const tg = r / tSpan;
      const f = (tg - a.t) / dt;
      cr.push({ u: a.u + (b.u - a.u) * f, t: tg });
    }
    // Vertical grid lines u = col/uSpan strictly between a.u and b.u.
    const uA = a.u;
    const uB = b.u;
    const cLo = Math.floor(Math.min(uA, uB) * uSpan) + 1;
    const cHi = Math.ceil(Math.max(uA, uB) * uSpan) - 1;
    for (let c = cLo; c <= cHi; c++) {
      const ug = c / uSpan;
      const f = (ug - uA) / (uB - uA);
      if (f <= 0 || f >= 1) continue;
      cr.push({ u: ug, t: a.t + dt * f });
    }
  }
  cr.sort((p, q) => p.t - q.t);
  // Dedup coincident (grid-corner) crossings.
  const out: Crossing[] = [];
  for (const c of cr) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.t - c.t) < EPS && Math.abs(prev.u - c.u) < EPS) continue;
    out.push(c);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Channel — the publishable SFB@1 crest-cell ceiling audit
// ─────────────────────────────────────────────────────────────────────────────

export interface CellCeilingHistogram {
  /** Best-achievable 3D min-angle: counts strictly below each threshold. */
  below15: number;
  below20: number;
  below30: number;
  /** Worst (min) and median best-achievable 3D min-angle across cells. */
  minDeg: number;
  p05Deg: number;
  medianDeg: number;
}

export interface SfbCellCeilingResult {
  config: {
    styleId: 'SuperformulaBlossom';
    packedParams: number[];
    featureLevel: number;
    uBias: number;
    uSpan: number;
    tSpan: number;
    crestBranches: number;
  };
  cellsMeasured: number;
  cornerClipCells: number;
  oppositeCells: number;
  sameSideCells: number;
  degenerateCells: number;
  /** Cells whose cdt2d fill dropped/flipped a triangle (number is suspect). */
  delaunaySuspectCells: number;

  /** The headline: ceiling distribution (best achievable, 3D). */
  ceiling: CellCeilingHistogram;
  /** The production fill (cdt2d) distribution, same cells. */
  delaunay: CellCeilingHistogram;

  /** Corner-clip cells whose FORCED corner triangle is below 15° / 20° — these
   *  are PROVABLY unfixable by connectivity (the triangle is an invariant). */
  forcedCornerBelow15: number;
  forcedCornerBelow20: number;
  worstForcedCornerDeg: number;

  /** Verdict: fraction of cells where even the BEST triangulation < 15° (H
   *  fails). */
  fractionCeilingBelow15: number;
  fractionCeilingBelow20: number;

  /** The worst cells by ceiling (for the report). */
  worstCells: CellCeilingRecord[];
}

function histogram(values: number[]): CellCeilingHistogram {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number): number => (n === 0 ? 0 : sorted[Math.min(n - 1, Math.floor(q * n))]);
  let below15 = 0;
  let below20 = 0;
  let below30 = 0;
  for (const v of sorted) {
    if (v < 15) below15++;
    if (v < 20) below20++;
    if (v < 30) below30++;
  }
  return {
    below15,
    below20,
    below30,
    minDeg: n > 0 ? sorted[0] : 0,
    p05Deg: at(0.05),
    medianDeg: at(0.5),
  };
}

export interface SfbCellCeilingOptions {
  /** Analytic-ridge polyline density (t samples per branch). Default 6145 —
   *  dense enough that crossing localization error is sub-µm. */
  tSamples?: number;
  /** How many worst cells to retain in the report. Default 12. */
  worstK?: number;
}

/**
 * Walk every SFB@1 closed-form CREST across the production featureLevel-7 / B=2
 * grid; for each crossed cell place the crest entry/exit EXACTLY on the grid
 * lines and compute the best-achievable vs production-fill 3D min-angle.
 * Returns the ceiling distribution and the count of provably-unfixable
 * (forced-corner-sliver) cells.
 */
export function runSfbCrestCellCeilingAudit(
  opts: SfbCellCeilingOptions = {},
): SfbCellCeilingResult {
  const tSamples = opts.tSamples ?? 6145;
  const worstK = opts.worstK ?? 12;
  const p = Float32Array.from(SFB1_PACKED);
  const surf = new SfbWallSampler(p);
  const uSpan = 1 << (SFB_FEATURE_LEVEL + SFB_UBIAS);
  const tSpan = 1 << SFB_FEATURE_LEVEL;

  const ridge = sfClosedFormParamRidge(p, { tSamples });
  const crests = ridge.branches.filter((b) => b.kind === 'crest');

  const records: CellCeilingRecord[] = [];
  const seenCells = new Set<string>();

  for (const branch of crests) {
    const crossings = branchGridCrossings(branch.points, uSpan, tSpan);
    for (let i = 0; i + 1 < crossings.length; i++) {
      const x = crossings[i];
      const y = crossings[i + 1];
      const mu = (x.u + y.u) / 2;
      const mt = (x.t + y.t) / 2;
      let col = Math.floor(mu * uSpan);
      let row = Math.floor(mt * tSpan);
      if (col < 0) col = 0;
      if (col >= uSpan) col = uSpan - 1;
      if (row < 0) row = 0;
      if (row >= tSpan) row = tSpan - 1;
      const key = `${col}:${row}`;
      if (seenCells.has(key)) continue;
      seenCells.add(key);
      const u0 = col / uSpan;
      const u1 = (col + 1) / uSpan;
      const t0 = row / tSpan;
      const t1 = (row + 1) / tSpan;
      records.push(measureCellCeiling(u0, t0, u1, t1, x, y, surf));
    }
  }

  const measured = records.filter((r) => r.topology === 'corner-clip' || r.topology === 'opposite');
  const ceilingVals = measured.map((r) => r.bestMinAngleDeg);
  const delaunayVals = measured.map((r) => r.delaunayMinAngleDeg);

  let cornerClip = 0;
  let opposite = 0;
  let sameSide = 0;
  let degenerate = 0;
  let suspect = 0;
  let forcedBelow15 = 0;
  let forcedBelow20 = 0;
  let worstForced = 180;
  for (const r of records) {
    if (r.topology === 'corner-clip') cornerClip++;
    else if (r.topology === 'opposite') opposite++;
    else if (r.topology === 'same-side') sameSide++;
    else degenerate++;
    if (r.delaunayDrops > 0 || r.delaunayInversions > 0) suspect++;
    if (r.forcedCornerMinAngleDeg >= 0) {
      if (r.forcedCornerMinAngleDeg < 15) forcedBelow15++;
      if (r.forcedCornerMinAngleDeg < 20) forcedBelow20++;
      if (r.forcedCornerMinAngleDeg < worstForced) worstForced = r.forcedCornerMinAngleDeg;
    }
  }

  const ceiling = histogram(ceilingVals);
  const denom = Math.max(1, measured.length);
  const worstCells = [...measured]
    .sort((a, b) => a.bestMinAngleDeg - b.bestMinAngleDeg)
    .slice(0, worstK);

  return {
    config: {
      styleId: 'SuperformulaBlossom',
      packedParams: [...SFB1_PACKED],
      featureLevel: SFB_FEATURE_LEVEL,
      uBias: SFB_UBIAS,
      uSpan,
      tSpan,
      crestBranches: crests.length,
    },
    cellsMeasured: measured.length,
    cornerClipCells: cornerClip,
    oppositeCells: opposite,
    sameSideCells: sameSide,
    degenerateCells: degenerate,
    delaunaySuspectCells: suspect,
    ceiling,
    delaunay: histogram(delaunayVals),
    forcedCornerBelow15: forcedBelow15,
    forcedCornerBelow20: forcedBelow20,
    worstForcedCornerDeg: cornerClip > 0 ? worstForced : -1,
    fractionCeilingBelow15: ceiling.below15 / denom,
    fractionCeilingBelow20: ceiling.below20 / denom,
    worstCells,
  };
}
