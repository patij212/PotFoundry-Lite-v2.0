/**
 * FeatureConformingTriangulator.ts — feature-aware variant of
 * {@link triangulateQuadtree}.
 *
 * Builds the same periodic, 2:1-balanced, T-junction-free triangle mesh as the
 * plain triangulator, EXCEPT that every cell a feature curve passes through is
 * locally re-triangulated (constrained Delaunay via
 * {@link triangulateConstrainedCell}) so the curve becomes real mesh edges.
 *
 * ## Why it stays watertight + T-junction-free BY CONSTRUCTION
 *
 * A cell's perimeter vertex set is fully determined by (a) its 4 corners,
 * (b) a mid-edge vertex on each side that borders a finer neighbour (exactly as
 * the plain triangulator), and (c) feature-curve↔boundary crossing points. A
 * crossing on a shared edge is the intersection of the SAME feature segment with
 * the SAME edge line, computed by the same formula from both adjacent cells, so
 * the two cells produce a bit-identical crossing point → deduped to one global
 * vertex. Hence both sides of every shared edge carry the identical vertex
 * sequence: no T-junction. Feature curves are closed loops / full-height lines,
 * so a crossing is always shared by two feature cells (a curve can only reach an
 * edge by passing between the two cells it separates).
 *
 * With no feature lines this delegates to {@link triangulateQuadtree} verbatim,
 * so the 16 already-passing styles are byte-for-byte unaffected.
 *
 * @module conforming/FeatureConformingTriangulator
 */

import type { QuadLeaf } from './PeriodicBalancedQuadtree';
import type { Efg, QuadtreeLike, QuadtreeMesh } from './QuadtreeTriangulator';
import {
  triangulateQuadtree,
  TRI_SOURCE,
  metricLen2,
  shapedTemplate,
  maxMinAngleTriangulation,
} from './QuadtreeTriangulator';
import type { FeatureLine } from './FeatureLineGraph';
import {
  triangulateConstrainedCell,
  type CellPoint,
  type CdtStats,
} from './ConstrainedCellTriangulator';
import {
  refineCellInterior,
  type Sampler3D,
  THETA_MIN,
  MAX_STEINER_PER_CELL,
} from './CellQualityRefinement';

export interface FeatureTriangulationOptions {
  /** Quantization scale for vertex dedup (must match the plain triangulator). */
  quantScale?: number;
  /**
   * Absolute (u,t) threshold: a feature point within this Chebyshev distance of
   * a cell corner or mid-edge vertex is SNAPPED onto it. This caps the worst
   * triangle aspect (a crossing landing just shy of a corner would otherwise
   * make a needle). It must be ABSOLUTE (not cell-relative) so both cells
   * sharing an edge make the identical snap decision → no T-junction. Pick it
   * as a small fraction of the feature cell size. 0 disables snapping.
   */
  cornerSnap?: number;
  /**
   * Optional (u,t)→3D surface sampler. When supplied, every REAL feature cell
   * (one carrying inserted feature segments) runs the Tier-2 interior quality
   * refinement ({@link refineCellInterior}) AFTER its constrained CDT — inserting
   * strictly-interior off-center Steiner points (computed in the 3D surface
   * metric) to raise the min interior angle, WITHOUT ever mutating the
   * registry-shared perimeter. Omitted ⇒ byte-identical to the pre-refinement
   * output (the clean styles are untouched). The closure must match the wall's
   * production surface map so the off-centers are well-shaped in 3D.
   */
  sampler?: Sampler3D;
}

/** Quantization scale for vertex dedup (exact for dyadic coords up to lvl 24). */
const QSCALE = 1 << 24;
/**
 * Weld-safe interior margin for Tier-2 Steiner points: ≥ 2× the float-jitter weld
 * radius (`WELD_TAU = 1e-6` in the tolerance-weld pass below) AND > one QSCALE
 * quantum (≈5.96e-8), so a refined interior point can never be welded or quantized
 * onto a registry-shared boundary vertex (or a neighbour cell's near-edge Steiner
 * across the shared edge) → no manufactured T-junction.
 */
const STEINER_MIN_EDGE_DIST = 2e-6;
/** Cap on per-leaf directional u-refinement (mirrors PeriodicBalancedQuadtree). */
const MAX_U_EXTRA = 4;
/** Geometric tolerance for "on a cell boundary" classification (in u,t). */
const ON_EDGE_EPS = 1e-9;
/** Hard cap on retained CDT incidents per wall — totals stay exact past it. */
const MAX_CDT_INCIDENTS = 500;

interface Seg {
  /** start (u,t) of the original feature segment. */
  a: CellPoint;
  /** end (u,t) of the original feature segment. */
  b: CellPoint;
}

/** Flatten all feature lines into individual (a,b) segments in (u,t) space. */
function collectSegments(features: FeatureLine[]): Seg[] {
  const segs: Seg[] = [];
  for (const line of features) {
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.u === b.u && a.t === b.t) continue;
      segs.push({ a: { u: a.u, t: a.t }, b: { u: b.u, t: b.t } });
    }
  }
  return segs;
}

/**
 * Liang–Barsky clip of segment (a→b) to box [u0,u1]×[t0,t1]. Returns the inside
 * sub-parameter interval [λ0,λ1] ⊂ [0,1], or null if the segment misses the box.
 * λ is the fraction along a→b, so the clipped endpoints are lerp(a,b,λ0/λ1).
 */
function clipToBox(
  s: Seg,
  u0: number,
  u1: number,
  t0: number,
  t1: number,
): [number, number] | null {
  const du = s.b.u - s.a.u;
  const dt = s.b.t - s.a.t;
  let lo = 0;
  let hi = 1;
  const edges: Array<[number, number]> = [
    [-du, s.a.u - u0], // u >= u0
    [du, u1 - s.a.u], // u <= u1
    [-dt, s.a.t - t0], // t >= t0
    [dt, t1 - s.a.t], // t <= t1
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-300) {
      if (q < 0) return null; // parallel & outside
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > hi) return null;
      if (r > lo) lo = r;
    } else {
      if (r < lo) return null;
      if (r < hi) hi = r;
    }
  }
  if (lo >= hi) return null;
  return [lo, hi];
}

function lerp(a: CellPoint, b: CellPoint, l: number): CellPoint {
  return { u: a.u + (b.u - a.u) * l, t: a.t + (b.t - a.t) * l };
}

/**
 * Points where segment (a→b) meets the 4 edges of box [u0,u1]×[t0,t1] (endpoints
 * INCLUSIVE, so a vertex tangent to / sitting on an edge is reported). Computed
 * per edge LINE, so both cells sharing an edge derive the identical crossing.
 * Corners are skipped (handled as cell corners). Pushes onto `out`.
 */
function edgeCrossingsInto(
  s: Seg, u0: number, u1: number, t0: number, t1: number, eps: number, out: CellPoint[],
): void {
  const { a, b } = s;
  const inU = (u: number): boolean => u >= u0 - eps && u <= u1 + eps;
  const inT = (t: number): boolean => t >= t0 - eps && t <= t1 + eps;
  // Horizontal edges t=t0,t1: param along t.
  if (Math.abs(b.t - a.t) > 1e-300) {
    for (const te of [t0, t1]) {
      const f = (te - a.t) / (b.t - a.t);
      if (f < -eps || f > 1 + eps) continue;
      const u = a.u + (b.u - a.u) * f;
      if (inU(u)) out.push({ u, t: te });
    }
  }
  // Vertical edges u=u0,u1: param along u.
  if (Math.abs(b.u - a.u) > 1e-300) {
    for (const ue of [u0, u1]) {
      const f = (ue - a.u) / (b.u - a.u);
      if (f < -eps || f > 1 + eps) continue;
      const t = a.t + (b.t - a.t) * f;
      if (inT(t)) out.push({ u: ue, t });
    }
  }
}

/** Position (0..1) of a boundary point along a CCW side, or -1 if not on it. */
interface SidePoint {
  pos: number;
  pt: CellPoint;
}

/** Proper interior intersection of segments (a0,a1)·(b0,b1), or null. */
function segSegCross(
  a0: CellPoint, a1: CellPoint, b0: CellPoint, b1: CellPoint,
): { point: CellPoint; ta: number; tb: number } | null {
  const r = { u: a1.u - a0.u, t: a1.t - a0.t };
  const s = { u: b1.u - b0.u, t: b1.t - b0.t };
  const denom = r.u * s.t - r.t * s.u;
  if (Math.abs(denom) < 1e-300) return null; // parallel
  const qp = { u: b0.u - a0.u, t: b0.t - a0.t };
  const ta = (qp.u * s.t - qp.t * s.u) / denom;
  const tb = (qp.u * r.t - qp.t * r.u) / denom;
  const eps = 1e-7;
  if (ta <= eps || ta >= 1 - eps || tb <= eps || tb >= 1 - eps) return null; // not a proper crossing
  return { point: { u: a0.u + r.u * ta, t: a0.t + r.t * ta }, ta, tb };
}

/**
 * Planarize a set of constraint segments: split every pair that PROPERLY crosses
 * at the intersection (a Steiner point), so no two constraints cross in their
 * interior (which cdt2d cannot handle → braids self-overlap). The intersection
 * lies strictly inside the cell, so it is a purely-local interior vertex → no
 * cross-cell inconsistency. Returns the split segments + the new Steiner points.
 */
function planarizeConstraints(
  constraints: Array<[CellPoint, CellPoint]>,
): { segments: Array<[CellPoint, CellPoint]>; steiner: CellPoint[] } {
  const n = constraints.length;
  const splits: Array<Array<{ t: number; pt: CellPoint }>> = constraints.map(() => []);
  const steiner: CellPoint[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const x = segSegCross(constraints[a][0], constraints[a][1], constraints[b][0], constraints[b][1]);
      if (!x) continue;
      splits[a].push({ t: x.ta, pt: x.point });
      splits[b].push({ t: x.tb, pt: x.point });
      steiner.push(x.point);
    }
  }
  const segments: Array<[CellPoint, CellPoint]> = [];
  for (let a = 0; a < n; a++) {
    const [p, q] = constraints[a];
    if (splits[a].length === 0) {
      segments.push([p, q]);
      continue;
    }
    const cuts = splits[a].slice().sort((x, y) => x.t - y.t);
    let prev = p;
    for (const c of cuts) {
      if (Math.abs(prev.u - c.pt.u) > 1e-12 || Math.abs(prev.t - c.pt.t) > 1e-12) {
        segments.push([prev, c.pt]);
      }
      prev = c.pt;
    }
    if (Math.abs(prev.u - q.u) > 1e-12 || Math.abs(prev.t - q.t) > 1e-12) segments.push([prev, q]);
  }
  return { segments, steiner };
}

export function triangulateQuadtreeWithFeatures(
  qt: QuadtreeLike,
  features: FeatureLine[],
  options: FeatureTriangulationOptions = {},
): QuadtreeMesh {
  if (features.length === 0) return triangulateQuadtree(qt);
  const cornerSnap = Math.max(0, options.cornerSnap ?? 0);
  const sampler = options.sampler;
  // Stage-1 Task 4: shaped templates (shorter-3D-diagonal + Klincsek max-min-
  // angle DP) on the PLAIN cells of a feature wall, mirroring the plain
  // triangulator. Dev lever `__pfConformingShapedCdtCells` (default ON; set
  // false to restore the legacy plain templates) — read ONCE per build so a
  // mid-build flag flip can never split one wall across template regimes. It
  // composes with efg presence: leaves without an `efg` tag take the legacy
  // arms regardless of the flag.
  const shapedCdtCells =
    (globalThis as { __pfConformingShapedCdtCells?: boolean }).__pfConformingShapedCdtCells !==
    false;

  // Anisotropy bias (GAP 1): a level-L leaf spans Δu=1/2^(L+B) in u, Δt=1/2^L in t.
  // u-index/wrap use 2^(level+B); `cornerSnap` is the t-extent fraction, so the u
  // threshold is `cornerSnap/2^B` (same FRACTION of the finer u-cell). B=0 ⇒ both
  // equal ⇒ byte-identical to the isotropic path.
  const uBias = qt.uBias?.() ?? 0;
  /** Effective u-level of a leaf: level + global bias + per-leaf uExtra (GAP 1 H1). */
  const eULof = (l: { level: number; uExtra?: number }): number =>
    l.level + uBias + (l.uExtra ?? 0);
  const uMod = (eUL: number): number => 1 << eUL;
  const iuOf = (l: QuadLeaf): number => l.iu ?? Math.round(l.u0 * uMod(eULof(l)));
  const itOf = (l: QuadLeaf): number => l.it ?? Math.round(l.t0 * (1 << l.level));
  const cornerSnapU = uBias > 0 ? cornerSnap / (1 << uBias) : cornerSnap;
  const cornerSnapT = cornerSnap;
  /** Anisotropic Chebyshev: within snap of (u,t) in BOTH axes (per-axis threshold). */
  const withinSnap = (du: number, dt: number): boolean =>
    Math.abs(du) <= cornerSnapU && Math.abs(dt) <= cornerSnapT;

  const leaves = qt.leaves();

  // Integer-cell existence set keyed on the EFFECTIVE u-level (`${level}:${it}:
  // ${eUL}:${iu}`) so a uExtra=0 and a uExtra=1 cell never collide (GAP 1 H1).
  // A secondary effective-u set (`${eUL}:${it}:${iu}`) supports the per-(eUL,it)
  // containing-cell lookup the feature-point snap needs. At uExtra=0 both reduce
  // to the original level-keyed sets → byte-identical.
  const cellSet = new Set<string>();
  let maxLevel = 0;
  let maxEUL = 0;
  for (const l of leaves) {
    const eUL = eULof(l);
    const iu = iuOf(l);
    const it = itOf(l);
    cellSet.add(`${l.level}:${it}:${eUL}:${iu}`);
    if (l.level > maxLevel) maxLevel = l.level;
    if (eUL > maxEUL) maxEUL = eUL;
  }
  /** Existence of a (level,iu,it,eUL) leaf (iu wraps mod 2^eUL). */
  const hasCell = (level: number, iu: number, it: number, eUL: number): boolean => {
    const span = uMod(eUL);
    const wu = ((iu % span) + span) % span;
    return cellSet.has(`${level}:${it}:${eUL}:${wu}`);
  };

  // ── Snap feature points onto a nearby cell edge ────────────────────────────
  // A feature vertex sitting a hair off a cell edge (a curve local-extremum
  // tangent to the edge from inside, far from any boundary vertex) leaves a
  // near-collinear needle the per-cell weld can't catch (point-vs-point, never
  // point-vs-edge). Snapping it ONTO the containing cell's edge eliminates the
  // needle. The threshold is ABSOLUTE so neighbours decide consistently, and the
  // grid-line vertex registry (PASS A/B below) MIRRORS the snapped on-edge vertex
  // into the cell across that edge — including a COARSER transition neighbour or
  // the feature-clip boundary — so the snap can no longer leave a one-sided
  // crossing. (Previously this snap was guarded to SAME-LEVEL edges only, to
  // avoid exactly that un-mirrored transition crack; the registry makes the guard
  // unnecessary and lets the snap also kill needles at transition edges, the last
  // dense-border sliver source.)
  const snapToCellEdge = (p: CellPoint): CellPoint => {
    if (cornerSnap <= 0) return p;
    const wu = ((p.u % 1) + 1) % 1;
    const tc = p.t < 0 ? 0 : p.t > 1 ? 1 : p.t;
    // Find the leaf containing (wu,tc): scan finest-first over (level,uExtra).
    for (let eUL = maxEUL; eUL >= 0; eUL--) {
      const uSpan = uMod(eUL);
      const iuCand = Math.min(uSpan - 1, Math.floor(wu * uSpan));
      let lv = -1;
      let it = -1;
      for (let cand = eUL - uBias; cand >= 0; cand--) {
        const tSpan = 1 << cand;
        const itCand = Math.min(tSpan - 1, Math.floor(tc * tSpan));
        if (hasCell(cand, iuCand, itCand, eUL)) { lv = cand; it = itCand; break; }
      }
      if (lv < 0) continue;
      const iu = iuCand;
      const tSpan = 1 << lv;
      const sizeU = 1 / uSpan;
      const sizeT = 1 / tSpan;
      const u0 = iu * sizeU;
      const t0 = it * sizeT;
      // u-distances threshold on cornerSnapU (finer cell), t-distances on cornerSnapT.
      const cands: Array<{ d: number; pt: CellPoint }> = [];
      const dB = tc - t0;
      const dT = t0 + sizeT - tc;
      const dL = wu - u0;
      const dR = u0 + sizeU - wu;
      // Snap onto the containing cell's own edge; the registry mirrors it to the
      // neighbour across (any level) so both carry the identical edge vertex.
      if (dB < cornerSnapT) cands.push({ d: dB, pt: { u: p.u, t: t0 } });
      if (dT < cornerSnapT) cands.push({ d: dT, pt: { u: p.u, t: t0 + sizeT } });
      if (dL < cornerSnapU) cands.push({ d: dL, pt: { u: u0, t: p.t } });
      if (dR < cornerSnapU) cands.push({ d: dR, pt: { u: u0 + sizeU, t: p.t } });
      if (cands.length === 0) return p;
      cands.sort((a, b) => a.d - b.d);
      return cands[0].pt;
    }
    return p;
  };
  const snappedFeatures: FeatureLine[] = features.map((line) => ({
    ...line,
    points: line.points.map(snapToCellEdge),
  }));
  const segs = collectSegments(snappedFeatures);
  // Does a finer u-neighbour exist in effective-u column `col` at level `feUL`
  // across OUR (level,it) t-strip — a uExtra-split at our level OR a level-split
  // (mirrors the plain triangulator's H1 probe). At uExtra=0 only lvl=level+1.
  const uColHasFiner = (feUL: number, col: number, level: number, it: number): boolean => {
    for (let lvl = level; lvl <= maxLevel; lvl++) {
      const ux = feUL - uBias - lvl;
      if (ux < 0 || ux > MAX_U_EXTRA) continue;
      const tMul = 1 << (lvl - level);
      const tBase = it * tMul;
      for (let k = 0; k < tMul; k++) {
        if (hasCell(lvl, col, tBase + k, feUL)) return true;
      }
    }
    return false;
  };
  const sideHasFiner = (
    level: number,
    iu: number,
    it: number,
    eUL: number,
    side: 'uMinus' | 'uPlus' | 'tMinus' | 'tPlus',
  ): boolean => {
    if (side === 'uPlus') {
      if (eUL >= maxEUL) return false;
      return uColHasFiner(eUL + 1, (iu + 1) * 2, level, it);
    }
    if (side === 'uMinus') {
      if (eUL >= maxEUL) return false;
      return uColHasFiner(eUL + 1, iu * 2 - 1, level, it);
    }
    if (level >= maxLevel) return false;
    const fl = level + 1;
    const fe = fl + uBias; // finer t-cells are uExtra=0 in a square-balanced region
    if (side === 'tPlus') {
      if (it + 1 >= 1 << level) return false;
      const row = (it + 1) * 2;
      return hasCell(fl, iu * 2, row, fe) || hasCell(fl, iu * 2 + 1, row, fe);
    }
    if (it === 0) return false;
    const row = it * 2 - 1;
    return hasCell(fl, iu * 2, row, fe) || hasCell(fl, iu * 2 + 1, row, fe);
  };

  // Global vertex dedup WITHOUT wrapping u (seam closed afterwards) — as plain.
  const vertMap = new Map<number, number>();
  const vu: number[] = [];
  const vt: number[] = [];
  const vertexIndex = (u: number, t: number): number => {
    const qu = Math.round(u * QSCALE);
    const qt2 = Math.round(t * QSCALE);
    const key = qu * (QSCALE * 2 + 1) + qt2;
    const existing = vertMap.get(key);
    if (existing !== undefined) return existing;
    const idx = vu.length;
    vu.push(u);
    vt.push(t);
    vertMap.set(key, idx);
    return idx;
  };

  const indices: number[] = [];
  const triWrapsSeam: number[] = [];
  // Stage-0 provenance channel: one TRI_SOURCE tag per emitted triangle, pushed
  // in lockstep by `emit`. `curTag` is set immediately before each emission
  // region. Metadata only — the triangle content/order is untouched.
  const triSource: number[] = [];
  let curTag: number = TRI_SOURCE.FCT_PLAIN_QUAD;

  // ── Spatial bucketing: assign each leaf to the coarse buckets its box overlaps,
  // so a feature segment is tested only against nearby leaves (not all of them).
  const BUCKET = 64;
  const leafBuckets = new Map<number, number[]>(); // bucketKey → leaf indices
  const bucketKey = (bu: number, bt: number): number => bt * BUCKET + bu;
  const addToBuckets = (leafIdx: number, l: QuadLeaf): void => {
    const size = 1 / (1 << l.level);
    const u0 = l.u0;
    const t0 = l.t0;
    const bu0 = Math.min(BUCKET - 1, Math.floor(u0 * BUCKET));
    const bu1 = Math.min(BUCKET - 1, Math.floor((u0 + size - 1e-12) * BUCKET));
    const bt0 = Math.min(BUCKET - 1, Math.floor(t0 * BUCKET));
    const bt1 = Math.min(BUCKET - 1, Math.floor((t0 + size - 1e-12) * BUCKET));
    for (let bt = bt0; bt <= bt1; bt++) {
      for (let bu = bu0; bu <= bu1; bu++) {
        const k = bucketKey(bu, bt);
        let arr = leafBuckets.get(k);
        if (!arr) { arr = []; leafBuckets.set(k, arr); }
        arr.push(leafIdx);
      }
    }
  };
  leaves.forEach((l, i) => addToBuckets(i, l));

  // Per-leaf CANDIDATE segments: original (a,b) whose bbox overlaps the leaf box
  // (inclusive of edge touches). We keep originals — not pre-clipped — so each
  // leaf can compute BOTH its interior arcs (box clip) AND its boundary crossings
  // per shared edge (so a curve TANGENT to an edge registers in BOTH cells → no
  // T-junction; a per-cell box clip alone misses the non-entering side).
  const EDGE_EPS = 1e-12;
  const leafCand: Array<Seg[]> = leaves.map(() => []);
  for (const s of segs) {
    const minU = Math.min(s.a.u, s.b.u);
    const maxU = Math.max(s.a.u, s.b.u);
    const minT = Math.min(s.a.t, s.b.t);
    const maxT = Math.max(s.a.t, s.b.t);
    const bu0 = Math.max(0, Math.min(BUCKET - 1, Math.floor(minU * BUCKET)));
    const bu1 = Math.max(0, Math.min(BUCKET - 1, Math.floor(maxU * BUCKET)));
    const bt0 = Math.max(0, Math.min(BUCKET - 1, Math.floor(minT * BUCKET)));
    const bt1 = Math.max(0, Math.min(BUCKET - 1, Math.floor(maxT * BUCKET)));
    const seen = new Set<number>();
    for (let bt = bt0; bt <= bt1; bt++) {
      for (let bu = bu0; bu <= bu1; bu++) {
        const arr = leafBuckets.get(bucketKey(bu, bt));
        if (!arr) continue;
        for (const li of arr) {
          if (seen.has(li)) continue;
          seen.add(li);
          const l = leaves[li];
          const size = 1 / (1 << l.level);
          // bbox overlap (inclusive) — keeps tangent touches as candidates.
          if (
            maxU < l.u0 - EDGE_EPS || minU > l.u0 + size + EDGE_EPS ||
            maxT < l.t0 - EDGE_EPS || minT > l.t0 + size + EDGE_EPS
          ) continue;
          leafCand[li].push(s);
        }
      }
    }
  }

  // ── Per-leaf geometry + 2:1 transition splits (shared by both passes) ──
  interface LeafGeom {
    leaf: QuadLeaf; eUL: number; uSpan: number; tSpan: number; iu: number; it: number;
    sizeU: number; sizeT: number;
    u0: number; t0: number; u1: number; t1: number; um: number; tm: number;
    wrapsSeam: number; splitS: boolean; splitE: boolean; splitN: boolean; splitW: boolean;
  }
  const geomOf = (li: number): LeafGeom => {
    const leaf = leaves[li];
    const eUL = eULof(leaf);
    const uSpan = uMod(eUL); // u-modulus 2^eUL
    const tSpan = 1 << leaf.level;
    const iu = iuOf(leaf);
    const it = itOf(leaf);
    const sizeU = 1 / uSpan;
    const sizeT = 1 / tSpan;
    const u0 = leaf.u0;
    const t0 = leaf.t0;
    return {
      leaf, eUL, uSpan, tSpan, iu, it, sizeU, sizeT, u0, t0,
      u1: u0 + sizeU, t1: t0 + sizeT, um: u0 + sizeU / 2, tm: t0 + sizeT / 2,
      wrapsSeam: Math.round((u0 + sizeU) * QSCALE) === QSCALE ? 1 : 0,
      splitS: sideHasFiner(leaf.level, iu, it, eUL, 'tMinus'),
      splitE: sideHasFiner(leaf.level, iu, it, eUL, 'uPlus'),
      splitN: sideHasFiner(leaf.level, iu, it, eUL, 'tPlus'),
      splitW: sideHasFiner(leaf.level, iu, it, eUL, 'uMinus'),
    };
  };

  const qk = (p: CellPoint): number =>
    Math.round(p.u * QSCALE) * (QSCALE * 2 + 1) + Math.round(p.t * QSCALE);
  // Grid-line keys: t-lines keyed by quantized t; u-lines by quantized u mod 1
  // (so the periodic seam u=1≡u=0 shares a key). A feature vertex landing on a
  // shared cell edge is registered HERE keyed by its grid line, so BOTH adjacent
  // cells read the IDENTICAL ordered vertex set in PASS B → no T-junction even
  // when one cell is tangent to the edge and never "enters" it.
  const tKey = (t: number): number => Math.round(t * QSCALE);
  const uKey = (u: number): number => Math.round((((u % 1) + 1) % 1) * QSCALE);
  const regH = new Map<number, Map<number, CellPoint>>(); // tKey(t) → uKey(u) → point
  const regV = new Map<number, Map<number, CellPoint>>(); // uKey(u) → tKey(t) → point
  const regAdd = (
    m: Map<number, Map<number, CellPoint>>, k: number, sub: number, p: CellPoint,
  ): void => {
    let inner = m.get(k);
    if (!inner) { inner = new Map(); m.set(k, inner); }
    if (!inner.has(sub)) inner.set(sub, p);
  };

  // ── PASS A0 (directional only): register every leaf's 4 CORNERS onto the grid-
  //    line registry so a coarse cell whose edge is subdivided by a SAME-LEVEL
  //    u-finer (directional uExtra) neighbour — which `sideHasFiner`'s level+1
  //    t-probe cannot see — reads the finer neighbour's on-edge corner in PASS B.
  //    Both sides of the shared edge then carry the identical vertex set →
  //    T-junction-free under directional (eUL) transitions.
  //
  //    GUARDED on the presence of any uExtra>0 cell. In production, feature walls
  //    have directional refine DISABLED (inserted styles stay deferred), so no
  //    leaf carries uExtra>0 and this pass is SKIPPED → the feature path is
  //    byte-identical to the pre-GAP1 triangulator (the delicate honeycomb /
  //    braid transition templates are untouched). ──
  const hasDirectional = leaves.some((l) => (l.uExtra ?? 0) > 0);
  if (hasDirectional) {
    for (let li = 0; li < leaves.length; li++) {
      const g = geomOf(li);
      regAdd(regH, tKey(g.t0), uKey(g.u0), { u: g.u0, t: g.t0 });
      regAdd(regH, tKey(g.t0), uKey(g.u1), { u: g.u1, t: g.t0 });
      regAdd(regH, tKey(g.t1), uKey(g.u0), { u: g.u0, t: g.t1 });
      regAdd(regH, tKey(g.t1), uKey(g.u1), { u: g.u1, t: g.t1 });
      regAdd(regV, uKey(g.u0), tKey(g.t0), { u: g.u0, t: g.t0 });
      regAdd(regV, uKey(g.u0), tKey(g.t1), { u: g.u0, t: g.t1 });
      regAdd(regV, uKey(g.u1), tKey(g.t0), { u: g.u1, t: g.t0 });
      regAdd(regV, uKey(g.u1), tKey(g.t1), { u: g.u1, t: g.t1 });
    }
  }

  // ── PASS A: classify each feature cell's boundary points + interior +
  //    constraints, and register the boundary points by grid line. Mids
  //    (transition vertices) are NOT registered — they are re-derived from the
  //    splits in PASS B (already symmetric via sideHasFiner). ──
  interface LeafData {
    feature: boolean;
    interior: CellPoint[];
    constraints: Array<[CellPoint, CellPoint]>;
  }
  const leafData: LeafData[] = new Array(leaves.length);

  for (let li = 0; li < leaves.length; li++) {
    const g = geomOf(li);
    const { u0, t0, u1, t1, um, tm, splitS, splitE, splitN, splitW } = g;

    const cand = leafCand[li];
    const pieces: Seg[] = [];
    const edgeCross: CellPoint[] = [];
    for (const s of cand) {
      const clip = clipToBox(s, u0, u1, t0, t1);
      if (clip && clip[1] - clip[0] > 1e-12) {
        pieces.push({ a: lerp(s.a, s.b, clip[0]), b: lerp(s.a, s.b, clip[1]) });
      }
      edgeCrossingsInto(s, u0, u1, t0, t1, 1e-9, edgeCross);
    }
    if (pieces.length === 0 && edgeCross.length === 0) {
      leafData[li] = { feature: false, interior: [], constraints: [] };
      continue;
    }

    const interior: CellPoint[] = [];
    const interiorKey = new Map<number, number>();
    const constraints: Array<[CellPoint, CellPoint]> = [];

    // Register a boundary feature point onto its grid line (skip corners).
    const registerBoundary = (p: CellPoint): boolean => {
      const onS = Math.abs(p.t - t0) <= ON_EDGE_EPS;
      const onN = Math.abs(p.t - t1) <= ON_EDGE_EPS;
      const onW = Math.abs(p.u - u0) <= ON_EDGE_EPS;
      const onE = Math.abs(p.u - u1) <= ON_EDGE_EPS;
      if (!(onS || onN || onW || onE)) return false;
      const atCorner = (onS || onN) && (onW || onE);
      if (atCorner) return true;
      if (onS) regAdd(regH, tKey(t0), uKey(p.u), { u: p.u, t: t0 });
      else if (onN) regAdd(regH, tKey(t1), uKey(p.u), { u: p.u, t: t1 });
      else if (onW) regAdd(regV, uKey(u0), tKey(p.t), { u: u0, t: p.t });
      else regAdd(regV, uKey(u1), tKey(p.t), { u: u1, t: p.t });
      return true;
    };
    const registerInterior = (p: CellPoint): void => {
      const k = qk(p);
      if (!interiorKey.has(k)) { interiorKey.set(k, interior.length); interior.push(p); }
    };

    // Anchors (corners + existing mids) for corner-snapping — ABSOLUTE threshold
    // + shared anchors so both sides of every shared edge snap identically.
    const anchors: CellPoint[] = [
      { u: u0, t: t0 }, { u: u1, t: t0 }, { u: u1, t: t1 }, { u: u0, t: t1 },
    ];
    if (splitS) anchors.push({ u: um, t: t0 });
    if (splitE) anchors.push({ u: u1, t: tm });
    if (splitN) anchors.push({ u: um, t: t1 });
    if (splitW) anchors.push({ u: u0, t: tm });
    const snapToAnchor = (p: CellPoint): CellPoint => {
      if (cornerSnap <= 0) return p;
      for (const a of anchors) {
        if (withinSnap(p.u - a.u, p.t - a.t)) return a;
      }
      return p;
    };

    for (const piece of pieces) {
      const pa = snapToAnchor(piece.a);
      const pb = snapToAnchor(piece.b);
      if (qk(pa) === qk(pb)) continue;
      if (!registerBoundary(pa)) registerInterior(pa);
      if (!registerBoundary(pb)) registerInterior(pb);
      constraints.push([pa, pb]);
    }
    // Per-edge boundary crossings (incl. tangent touches the box clip misses).
    for (const ec of edgeCross) registerBoundary(snapToAnchor(ec));

    // Planarize crossing constraints (braids) → Steiner points are interior.
    const planar = planarizeConstraints(constraints);
    constraints.length = 0;
    for (const seg of planar.segments) constraints.push(seg);
    for (const sp of planar.steiner) registerInterior(sp);

    leafData[li] = { feature: true, interior, constraints };
  }

  // ── PASS B: triangulate each leaf, reading the UNION of feature edge points
  //    from the registry so both adjacent cells carry the identical edge-vertex
  //    set (symmetric → T-junction-free). A cell that was PLAIN in PASS A but
  //    whose neighbour registered points on a shared edge becomes a feature cell
  //    here (it subdivides the edge to match — with no interior constraints). ──
  const readH = (tk: number, lo: number, hi: number): CellPoint[] => {
    const inner = regH.get(tk);
    if (!inner) return [];
    const out: CellPoint[] = [];
    for (const p of inner.values()) if (p.u > lo + ON_EDGE_EPS && p.u < hi - ON_EDGE_EPS) out.push(p);
    return out;
  };
  const readV = (uk: number, lo: number, hi: number): CellPoint[] => {
    const inner = regV.get(uk);
    if (!inner) return [];
    const out: CellPoint[] = [];
    for (const p of inner.values()) if (p.t > lo + ON_EDGE_EPS && p.t < hi - ON_EDGE_EPS) out.push(p);
    return out;
  };

  // Masking-channel counters across all constrained cells (Stage-0 instrument):
  // winding inversions (fold-over signal) + zero-area drops (potential hole).
  const cdtStats: CdtStats = { inversions: 0, drops: 0, incidents: [] };

  for (let li = 0; li < leaves.length; li++) {
    const g = geomOf(li);
    const {
      leaf, eUL, tSpan, iu, it, sizeU, sizeT, u0, t0, u1, t1, um, tm, wrapsSeam,
      splitS, splitE, splitN, splitW,
    } = g;
    const data = leafData[li];

    const emit = (a: number, b: number, c: number): void => {
      if (a === b || b === c || a === c) return;
      indices.push(a, b, c);
      triWrapsSeam.push(wrapsSeam);
      triSource.push(curTag);
    };

    // Feature edge points (union across both adjacent cells), as SidePoints. The
    // pos is normalized along the side: south/north along u (sizeU), east/west
    // along t (sizeT).
    const featS = readH(tKey(t0), u0, u1).map((p) => ({ pos: (p.u - u0) / sizeU, pt: p }));
    const featN = readH(tKey(t1), u0, u1).map((p) => ({ pos: (u1 - p.u) / sizeU, pt: p }));
    const featW = readV(uKey(u0), t0, t1).map((p) => ({ pos: (t1 - p.t) / sizeT, pt: p }));
    const featE = readV(uKey(u1), t0, t1).map((p) => ({ pos: (p.t - t0) / sizeT, pt: p }));

    const isFeature =
      data.feature || featS.length > 0 || featN.length > 0 || featW.length > 0 || featE.length > 0;

    if (!isFeature) {
      // ── Plain template cell (mirrors triangulateQuadtree's plain branch,
      // INCLUDING the Stage-1 shaped templates — Task 4 mirror). The shaped
      // arms keep the registry contract: interior connectivity only, the
      // boundary polygon's vertex set is unchanged, so every shared edge keeps
      // its exact vertex sequence (watertight + T-junction-free preserved —
      // the plain-path precedent in QuadtreeTriangulator). No efg tag, or
      // isotropic + B==0, or the dev flag off ⇒ legacy arms byte-for-byte. ──
      const poly: number[] = [];
      const co: [number, number][] = [];
      const add = (u: number, t: number): void => { poly.push(vertexIndex(u, t)); co.push([u, t]); };
      add(u0, t0); // SW
      if (splitS) add(um, t0);
      add(u1, t0); // SE
      if (splitE) add(u1, tm);
      add(u1, t1); // NE
      if (splitN) add(um, t1);
      add(u0, t1); // NW
      if (splitW) add(u0, tm);
      const splitCount = (splitS ? 1 : 0) + (splitE ? 1 : 0) + (splitN ? 1 : 0) + (splitW ? 1 : 0);
      // Per-leaf shaped gate, derived EXACTLY as the plain path derives `aniso`
      // (leaf.efg + cell extents + the tree's global uBias).
      const efg: Efg | undefined = shapedCdtCells ? leaf.efg : undefined;
      const aniso = shapedTemplate(efg, sizeU, sizeT, uBias);
      if (splitCount === 0) {
        // Plain quad. Legacy: SW→NE diagonal. Shaped: the SHORTER 3D diagonal
        // via metricLen2 with the SAME QSCALE tie-quantization convention as
        // the plain path (tie → SW→NE → byte-identical isotropic path). The
        // diagonal choice keeps the FCT_PLAIN_QUAD tag — it is still a plain
        // quad, only its interior diagonal differs.
        curTag = TRI_SOURCE.FCT_PLAIN_QUAD;
        let useSeNw = false;
        if (aniso && efg) {
          const dSwNe = metricLen2(efg, u1 - u0, t1 - t0); // SW→NE
          const dSeNw = metricLen2(efg, u0 - u1, t1 - t0); // SE→NW
          // Quantize to suppress float jitter so the tie always falls to SW→NE.
          const qSwNe = Math.round(dSwNe * QSCALE);
          const qSeNw = Math.round(dSeNw * QSCALE);
          useSeNw = qSeNw < qSwNe;
        }
        if (useSeNw) {
          emit(poly[0], poly[1], poly[3]); // SW, SE, NW
          emit(poly[1], poly[2], poly[3]); // SE, NE, NW
        } else {
          emit(poly[0], poly[1], poly[2]); // SW, SE, NE
          emit(poly[0], poly[2], poly[3]); // SW, NE, NW
        }
      } else if (aniso && efg) {
        // Shaped transition: the certified Klincsek max-min-angle DP over the
        // CCW boundary polygon — no centroid vertex, no zero-area emissions.
        curTag = TRI_SOURCE.FCT_EAR_CLIP;
        // curTag must be set before this call — maxMinAngleTriangulation calls emit synchronously.
        maxMinAngleTriangulation(efg, co, poly, emit);
      } else {
        curTag = TRI_SOURCE.FCT_PLAIN_FAN;
        const ctr = vertexIndex(um, tm);
        for (let i = 0; i < poly.length; i++) emit(ctr, poly[i], poly[(i + 1) % poly.length]);
      }
      continue;
    }

    // ── Feature cell: side points = mids (transition) + registry feature points ──
    const south: SidePoint[] = [];
    const east: SidePoint[] = [];
    const north: SidePoint[] = [];
    const west: SidePoint[] = [];
    if (splitS) south.push({ pos: 0.5, pt: { u: um, t: t0 } });
    if (splitE) east.push({ pos: 0.5, pt: { u: u1, t: tm } });
    if (splitN) north.push({ pos: 0.5, pt: { u: um, t: t1 } });
    if (splitW) west.push({ pos: 0.5, pt: { u: u0, t: tm } });
    for (const sp of featS) south.push(sp);
    for (const sp of featE) east.push(sp);
    for (const sp of featN) north.push(sp);
    for (const sp of featW) west.push(sp);

    // Build the CCW boundary polygon: corners + sorted/deduped side points.
    const sortBy = (arr: SidePoint[]): SidePoint[] =>
      arr
        .filter((s) => s.pos > ON_EDGE_EPS && s.pos < 1 - ON_EDGE_EPS)
        .sort((p, q) => p.pos - q.pos);
    // Merge side points closer than cornerSnap on a CLEAN shared edge (no mid,
    // same-level neighbour), keeping the CANONICAL (min-qk) point so both cells
    // agree (opposite sides walk the edge in reversed order → "keep first" would
    // diverge). The registry already makes both sides see the same set, so the
    // dedup result is identical on both sides too.
    const cleanEdge = (split: boolean, niu: number, nit: number): boolean =>
      !split && nit >= 0 && nit < tSpan && hasCell(leaf.level, niu, nit, eUL);
    const cleanS = cleanEdge(splitS, iu, it - 1);
    const cleanN = cleanEdge(splitN, iu, it + 1);
    const cleanW = cleanEdge(splitW, iu - 1, it);
    const cleanE = cleanEdge(splitE, iu + 1, it);
    // Side-position tolerance: u-sides (S/N) measure pos along u (cornerSnapU/sizeU);
    // t-sides (E/W) along t (cornerSnapT/sizeT). Equal at B=0.
    const posTolU = cornerSnapU / sizeU;
    const posTolT = cornerSnapT / sizeT;
    const dedupSide = (arr: SidePoint[], clean: boolean, posTol: number): SidePoint[] => {
      const tol = clean ? Math.max(ON_EDGE_EPS, posTol) : ON_EDGE_EPS;
      const out: SidePoint[] = [];
      let group: SidePoint[] = [];
      const flush = (): void => {
        if (group.length === 0) return;
        let best = group[0];
        for (const sp of group) if (qk(sp.pt) < qk(best.pt)) best = sp;
        out.push(best);
        group = [];
      };
      for (const sp of arr) {
        if (group.length > 0 && Math.abs(sp.pos - group[group.length - 1].pos) > tol) flush();
        group.push(sp);
      }
      flush();
      return out;
    };
    const boundary: CellPoint[] = [];
    boundary.push({ u: u0, t: t0 });
    for (const sp of dedupSide(sortBy(south), cleanS, posTolU)) boundary.push(sp.pt);
    boundary.push({ u: u1, t: t0 });
    for (const sp of dedupSide(sortBy(east), cleanE, posTolT)) boundary.push(sp.pt);
    boundary.push({ u: u1, t: t1 });
    for (const sp of dedupSide(sortBy(north), cleanN, posTolU)) boundary.push(sp.pt);
    boundary.push({ u: u0, t: t1 });
    for (const sp of dedupSide(sortBy(west), cleanW, posTolT)) boundary.push(sp.pt);

    // Weld interior feature points onto a nearby BOUNDARY point (shared/
    // never-moved) else fold into a nearby surviving interior point — both
    // per-cell decisions → cross-cell consistent. Removes edge-proximity +
    // braid-Steiner needles.
    const interiorCanon = new Map<number, CellPoint>();
    const survivingInterior: CellPoint[] = [];
    for (const ip of data.interior) {
      let canon: CellPoint | null = null;
      if (cornerSnap > 0) {
        for (const bp of boundary) {
          if (withinSnap(ip.u - bp.u, ip.t - bp.t)) { canon = bp; break; }
        }
        if (!canon) {
          for (const sp of survivingInterior) {
            if (withinSnap(ip.u - sp.u, ip.t - sp.t)) { canon = sp; break; }
          }
        }
      }
      if (canon) interiorCanon.set(qk(ip), canon);
      else { interiorCanon.set(qk(ip), ip); survivingInterior.push(ip); }
    }

    const localKey = new Map<number, number>();
    boundary.forEach((p, i) => localKey.set(qk(p), i));
    survivingInterior.forEach((p, i) => localKey.set(qk(p), boundary.length + i));
    const canonical = (p: CellPoint): CellPoint => interiorCanon.get(qk(p)) ?? p;
    const combined = [...boundary, ...survivingInterior];
    const resolve = (p: CellPoint): number => {
      const c = canonical(p);
      const exact = localKey.get(qk(c));
      if (exact !== undefined) return exact;
      let best = -1;
      // Normalized anisotropic distance: a point is "within snap" iff
      // max(|du|/cornerSnapU, |dt|/cornerSnapT) ≤ 1 (≡ Chebyshev at B=0).
      let bestD = 1 + 1e-9;
      const snapU = cornerSnapU > 0 ? cornerSnapU : 1;
      const snapT = cornerSnapT > 0 ? cornerSnapT : 1;
      for (let i = 0; i < combined.length; i++) {
        const d = Math.max(Math.abs(combined[i].u - c.u) / snapU, Math.abs(combined[i].t - c.t) / snapT);
        if (d <= bestD) { bestD = d; best = i; }
      }
      return best;
    };
    const cellConstraints: Array<[number, number]> = [];
    for (const [pa, pb] of data.constraints) {
      const ia = resolve(pa);
      const ib = resolve(pb);
      if (ia < 0 || ib < 0 || ia === ib) continue;
      cellConstraints.push([ia, ib]);
    }

    let result = triangulateConstrainedCell({
      boundary,
      interior: survivingInterior,
      constraints: cellConstraints,
    });
    // Record the masking-channel counters from the FIRST (per-cell CDT) result —
    // `result` may be reassigned by refineCellInterior below. Counting only; the
    // triangle output is untouched.
    if (result.inversionCount > 0 || result.droppedCount > 0) {
      cdtStats.inversions += result.inversionCount;
      cdtStats.drops += result.droppedCount;
      const dump =
        (globalThis as { __pfConformingCellDumps?: boolean }).__pfConformingCellDumps === true;
      if (cdtStats.incidents.length < MAX_CDT_INCIDENTS) {
        cdtStats.incidents.push({
          u0, t0, u1, t1,
          inversions: result.inversionCount, drops: result.droppedCount,
          ...(dump ? { input: { boundary, interior: survivingInterior, constraints: cellConstraints } } : {}),
        });
      }
    }
    // ── Tier-2 interior quality refinement (opt-in via options.sampler) ──
    // Only on REAL feature cells (data.feature — those carrying inserted feature
    // segments), NOT registry-passive neighbours. Inserts strictly-interior
    // off-center Steiner points (computed in the 3D surface metric) to raise the
    // min interior angle of the per-cell CDT fill, which inserts ZERO quality
    // Steiner points itself. The boundary + constraints are replayed UNCHANGED, so
    // the registry-shared perimeter is invariant; STEINER_MIN_EDGE_DIST keeps every
    // Steiner ≥ 2·WELD_TAU clear of every side so the downstream weld cannot fuse it
    // across a shared edge. No-op without a sampler ⇒ the clean styles are untouched.
    if (sampler !== undefined && data.feature) {
      result = refineCellInterior(
        { input: { boundary, interior: survivingInterior, constraints: cellConstraints }, result },
        sampler,
        { angleBar: THETA_MIN, cap: MAX_STEINER_PER_CELL, minEdgeDist: STEINER_MIN_EDGE_DIST },
      );
    }
    const globalOf = result.points.map((p) => vertexIndex(p.u, p.t));
    // Every feature-cell triangle (incl. any Tier-2 refined replacement set)
    // comes from the per-cell CDT fill.
    curTag = TRI_SOURCE.FCT_FEATURE_CDT;
    for (const [a, b, c] of result.triangles) emit(globalOf[a], globalOf[b], globalOf[c]);
  }

  const n = vu.length;
  const remap = new Int32Array(n);
  for (let i = 0; i < n; i++) remap[i] = i;

  // ── Tolerance weld of float-jitter duplicates (NOT a crash/crack repair) ──
  // A feature sample that lands within float-epsilon of a cell edge can be
  // represented two ways across the two cells (a snapped sample vs a clip
  // crossing), ~1e-8 apart in (u,t). The exact QSCALE dedup may keep them as
  // two indices; the downstream 3D weld (1e-4 mm) would then merge them and
  // collapse a triangle. WELD_TAU (1e-6) is FAR below the minimum legitimate
  // mesh-vertex spacing (~1e-4 at the deepest level), so this can only fuse
  // numerically-coincident representations of the SAME point — it cannot merge
  // distinct geometry or paper over a real gap. Spatial-hash with a neighbour
  // sweep so a jitter straddling a bucket boundary still merges.
  const WELD_TAU = 1e-6;
  const weldBuckets = new Map<string, number[]>();
  const bk = (u: number, t: number): string => `${Math.floor(u / WELD_TAU)}:${Math.floor(t / WELD_TAU)}`;
  for (let i = 0; i < n; i++) {
    const bu = Math.floor(vu[i] / WELD_TAU);
    const bt = Math.floor(vt[i] / WELD_TAU);
    let canon = -1;
    for (let du = -1; du <= 1 && canon < 0; du++) {
      for (let dt = -1; dt <= 1 && canon < 0; dt++) {
        const arr = weldBuckets.get(`${bu + du}:${bt + dt}`);
        if (!arr) continue;
        for (const j of arr) {
          if (Math.abs(vu[j] - vu[i]) <= WELD_TAU && Math.abs(vt[j] - vt[i]) <= WELD_TAU) {
            canon = j;
            break;
          }
        }
      }
    }
    if (canon >= 0) {
      remap[i] = canon;
    } else {
      const key = bk(vu[i], vt[i]);
      let arr = weldBuckets.get(key);
      if (!arr) { arr = []; weldBuckets.set(key, arr); }
      arr.push(i);
    }
  }

  // ── Close the seam: merge the u=1 column into the u=0 column (as plain) ──
  // Operate on welded canonicals so the seam twin lookup is jitter-free.
  const zeroByT = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (remap[i] === i && Math.round(vu[i] * QSCALE) === 0) {
      zeroByT.set(Math.round(vt[i] * QSCALE), i);
    }
  }
  for (let i = 0; i < n; i++) {
    const r = remap[i];
    if (Math.round(vu[r] * QSCALE) === QSCALE) {
      const twin = zeroByT.get(Math.round(vt[r] * QSCALE));
      if (twin !== undefined) remap[i] = twin;
    }
  }

  const newIndexOf = new Int32Array(n).fill(-1);
  const keptU: number[] = [];
  const keptT: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = remap[i];
    if (newIndexOf[r] === -1) {
      newIndexOf[r] = keptU.length;
      keptU.push(vu[r]);
      keptT.push(vt[r]);
    }
  }

  // Remap triangles; drop any that became degenerate when two of their vertices
  // welded together (their geometric area was already ~0). The provenance tags
  // are filtered in lockstep so they stay parallel to the surviving triangles.
  const outIndices: number[] = [];
  const outSeam: number[] = [];
  const outSource: number[] = [];
  for (let k = 0; k < indices.length; k += 3) {
    const a = newIndexOf[remap[indices[k]]];
    const b = newIndexOf[remap[indices[k + 1]]];
    const c = newIndexOf[remap[indices[k + 2]]];
    // LOCKSTEP: any future per-triangle channel must be pushed in this same loop body.
    if (a === b || b === c || a === c) continue;
    outIndices.push(a, b, c);
    outSeam.push(triWrapsSeam[k / 3]);
    outSource.push(triSource[k / 3]);
  }

  const vertices = new Float32Array(keptU.length * 3);
  for (let i = 0; i < keptU.length; i++) {
    vertices[i * 3] = keptU[i];
    vertices[i * 3 + 1] = keptT[i];
    vertices[i * 3 + 2] = 0;
  }
  return {
    vertices,
    indices: Uint32Array.from(outIndices),
    seamTriangles: Uint8Array.from(outSeam),
    cdtStats,
    triangleSource: Uint8Array.from(outSource),
  };
}
