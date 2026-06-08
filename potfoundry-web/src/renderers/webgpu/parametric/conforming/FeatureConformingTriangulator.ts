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
import type { QuadtreeLike, QuadtreeMesh } from './QuadtreeTriangulator';
import { triangulateQuadtree } from './QuadtreeTriangulator';
import type { FeatureLine } from './FeatureLineGraph';
import { triangulateConstrainedCell, type CellPoint } from './ConstrainedCellTriangulator';

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
}

/** Quantization scale for vertex dedup (exact for dyadic coords up to lvl 24). */
const QSCALE = 1 << 24;
/** Geometric tolerance for "on a cell boundary" classification (in u,t). */
const ON_EDGE_EPS = 1e-9;

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

export function triangulateQuadtreeWithFeatures(
  qt: QuadtreeLike,
  features: FeatureLine[],
  options: FeatureTriangulationOptions = {},
): QuadtreeMesh {
  if (features.length === 0) return triangulateQuadtree(qt);
  const cornerSnap = Math.max(0, options.cornerSnap ?? 0);

  const leaves = qt.leaves();

  // Integer-cell existence set (for finer-neighbour detection) — as plain.
  const cellSet = new Set<string>();
  let maxLevel = 0;
  for (const l of leaves) {
    const span = 1 << l.level;
    const iu = Math.round(l.u0 * span);
    const it = Math.round(l.t0 * span);
    cellSet.add(`${l.level}:${iu}:${it}`);
    if (l.level > maxLevel) maxLevel = l.level;
  }

  // NOTE (robustness item): a feature vertex sitting a hair off a t=const cell
  // edge (a local-t-min tangent to the edge from inside, far from any boundary
  // vertex) can leave a thin needle in (u,t) parameter space. On the production
  // GPU-smoothed surface this maps to a benign 3D aspect (well within the sliver
  // gate), but a global edge-snap to fix it cracks the feature-clip / seam
  // transition cells, so it is deferred to the dimension-space hardening phase
  // (a per-edge forced-crossing pass mirrored into the neighbour cell). The
  // straightforward insertion below stays watertight + T-junction-free.
  const segs = collectSegments(features);
  const has = (level: number, iu: number, it: number): boolean => {
    const span = 1 << level;
    const wu = ((iu % span) + span) % span;
    return cellSet.has(`${level}:${wu}:${it}`);
  };
  const sideHasFiner = (
    level: number,
    iu: number,
    it: number,
    side: 'uMinus' | 'uPlus' | 'tMinus' | 'tPlus',
  ): boolean => {
    if (level >= maxLevel) return false;
    const fl = level + 1;
    if (side === 'uPlus') {
      const col = (iu + 1) * 2;
      return has(fl, col, it * 2) || has(fl, col, it * 2 + 1);
    }
    if (side === 'uMinus') {
      const col = iu * 2 - 1;
      return has(fl, col, it * 2) || has(fl, col, it * 2 + 1);
    }
    if (side === 'tPlus') {
      if (it + 1 >= 1 << level) return false;
      const row = (it + 1) * 2;
      return has(fl, iu * 2, row) || has(fl, iu * 2 + 1, row);
    }
    if (it === 0) return false;
    const row = it * 2 - 1;
    return has(fl, iu * 2, row) || has(fl, iu * 2 + 1, row);
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

  // ── Per-leaf emit ─────────────────────────────────────────────────────────
  for (let li = 0; li < leaves.length; li++) {
    const leaf = leaves[li];
    const span = 1 << leaf.level;
    const iu = Math.round(leaf.u0 * span);
    const it = Math.round(leaf.t0 * span);
    const size = 1 / span;
    const u0 = leaf.u0;
    const t0 = leaf.t0;
    const u1 = u0 + size;
    const t1 = t0 + size;
    const um = u0 + size / 2;
    const tm = t0 + size / 2;
    const wrapsSeam = Math.round(u1 * QSCALE) === QSCALE ? 1 : 0;

    const splitS = sideHasFiner(leaf.level, iu, it, 'tMinus');
    const splitE = sideHasFiner(leaf.level, iu, it, 'uPlus');
    const splitN = sideHasFiner(leaf.level, iu, it, 'tPlus');
    const splitW = sideHasFiner(leaf.level, iu, it, 'uMinus');

    const emit = (a: number, b: number, c: number): void => {
      if (a === b || b === c || a === c) return;
      indices.push(a, b, c);
      triWrapsSeam.push(wrapsSeam);
    };

    // Interior arcs (box clip) + boundary crossings (per-edge, symmetric).
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
      // ── Plain template cell (identical to triangulateQuadtree) ──
      const poly: number[] = [];
      poly.push(vertexIndex(u0, t0));
      if (splitS) poly.push(vertexIndex(um, t0));
      poly.push(vertexIndex(u1, t0));
      if (splitE) poly.push(vertexIndex(u1, tm));
      poly.push(vertexIndex(u1, t1));
      if (splitN) poly.push(vertexIndex(um, t1));
      poly.push(vertexIndex(u0, t1));
      if (splitW) poly.push(vertexIndex(u0, tm));
      const splitCount = (splitS ? 1 : 0) + (splitE ? 1 : 0) + (splitN ? 1 : 0) + (splitW ? 1 : 0);
      if (splitCount === 0) {
        emit(poly[0], poly[1], poly[2]);
        emit(poly[0], poly[2], poly[3]);
      } else {
        const ctr = vertexIndex(um, tm);
        for (let i = 0; i < poly.length; i++) emit(ctr, poly[i], poly[(i + 1) % poly.length]);
      }
      continue;
    }

    // ── Feature cell: local constrained triangulation ──
    // Collect side points (mids + crossings) and interior feature vertices.
    const south: SidePoint[] = [];
    const east: SidePoint[] = [];
    const north: SidePoint[] = [];
    const west: SidePoint[] = [];
    if (splitS) south.push({ pos: 0.5, pt: { u: um, t: t0 } });
    if (splitE) east.push({ pos: 0.5, pt: { u: u1, t: tm } });
    if (splitN) north.push({ pos: 0.5, pt: { u: um, t: t1 } });
    if (splitW) west.push({ pos: 0.5, pt: { u: u0, t: tm } });

    // Cell-local dedup of boundary + interior feature points by quantized key.
    const interior: CellPoint[] = [];
    const interiorKey = new Map<number, number>(); // qkey → interior index
    const constraints: Array<[CellPoint, CellPoint]> = [];

    const qk = (p: CellPoint): number =>
      Math.round(p.u * QSCALE) * (QSCALE * 2 + 1) + Math.round(p.t * QSCALE);

    const classifyBoundary = (p: CellPoint): boolean => {
      // Returns true if p lies on the cell boundary; records it on the right side.
      const onS = Math.abs(p.t - t0) <= ON_EDGE_EPS;
      const onN = Math.abs(p.t - t1) <= ON_EDGE_EPS;
      const onW = Math.abs(p.u - u0) <= ON_EDGE_EPS;
      const onE = Math.abs(p.u - u1) <= ON_EDGE_EPS;
      if (!(onS || onN || onW || onE)) return false;
      // Corner points are already cell corners — no side insertion needed.
      const atCorner = (onS || onN) && (onW || onE);
      if (atCorner) return true;
      if (onS) south.push({ pos: (p.u - u0) / size, pt: { u: p.u, t: t0 } });
      else if (onE) east.push({ pos: (p.t - t0) / size, pt: { u: u1, t: p.t } });
      else if (onN) north.push({ pos: (u1 - p.u) / size, pt: { u: p.u, t: t1 } });
      else if (onW) west.push({ pos: (t1 - p.t) / size, pt: { u: u0, t: p.t } });
      return true;
    };

    const registerInterior = (p: CellPoint): void => {
      const k = qk(p);
      if (!interiorKey.has(k)) {
        interiorKey.set(k, interior.length);
        interior.push(p);
      }
    };

    // Anchor points (corners + existing mids) for corner-snapping. Snapping a
    // feature point onto a nearby anchor caps the worst triangle aspect; the
    // ABSOLUTE threshold makes the decision identical from both sides of every
    // shared edge (anchors are shared) → still T-junction-free.
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
        if (Math.abs(p.u - a.u) <= cornerSnap && Math.abs(p.t - a.t) <= cornerSnap) return a;
      }
      return p;
    };

    for (const piece of pieces) {
      // Snap endpoints onto nearby anchors, then classify. A piece that collapses
      // (both endpoints snapped to the same anchor) contributes no constraint.
      const pa = snapToAnchor(piece.a);
      const pb = snapToAnchor(piece.b);
      if (qk(pa) === qk(pb)) continue;
      if (!classifyBoundary(pa)) registerInterior(pa);
      if (!classifyBoundary(pb)) registerInterior(pb);
      constraints.push([pa, pb]);
    }

    // Register per-edge boundary crossings (incl. tangent touches the box clip
    // misses). These carry NO constraint — they are boundary vertices the
    // neighbour cell across each shared edge derives identically → no T-junction.
    for (const ec of edgeCross) {
      classifyBoundary(snapToAnchor(ec));
    }

    // Build the CCW boundary polygon: corners + sorted side points.
    const sortBy = (arr: SidePoint[]): SidePoint[] =>
      arr
        .filter((s) => s.pos > ON_EDGE_EPS && s.pos < 1 - ON_EDGE_EPS)
        .sort((p, q) => p.pos - q.pos);
    const dedupSide = (arr: SidePoint[]): SidePoint[] => {
      const out: SidePoint[] = [];
      let lastPos = -1;
      for (const sp of arr) {
        if (Math.abs(sp.pos - lastPos) <= ON_EDGE_EPS) continue;
        out.push(sp);
        lastPos = sp.pos;
      }
      return out;
    };
    const boundary: CellPoint[] = [];
    boundary.push({ u: u0, t: t0 });
    for (const sp of dedupSide(sortBy(south))) boundary.push(sp.pt);
    boundary.push({ u: u1, t: t0 });
    for (const sp of dedupSide(sortBy(east))) boundary.push(sp.pt);
    boundary.push({ u: u1, t: t1 });
    for (const sp of dedupSide(sortBy(north))) boundary.push(sp.pt);
    boundary.push({ u: u0, t: t1 });
    for (const sp of dedupSide(sortBy(west))) boundary.push(sp.pt);

    // Weld interior feature points onto a nearby BOUNDARY point (within
    // cornerSnap). Boundary points (crossings + anchors) are shared/identical
    // across cells and are NEVER moved, so welding an INTERIOR point onto one is
    // a purely local decision → cross-cell consistent. This removes
    // edge-proximity needles (an interior sample landing a hair off a crossing
    // on the same edge).
    const interiorCanon = new Map<number, CellPoint>(); // qk(interior) → canonical
    const survivingInterior: CellPoint[] = [];
    for (const ip of interior) {
      let canon: CellPoint | null = null;
      if (cornerSnap > 0) {
        for (const bp of boundary) {
          if (Math.abs(ip.u - bp.u) <= cornerSnap && Math.abs(ip.t - bp.t) <= cornerSnap) {
            canon = bp;
            break;
          }
        }
      }
      if (canon) {
        interiorCanon.set(qk(ip), canon);
      } else {
        interiorCanon.set(qk(ip), ip);
        survivingInterior.push(ip);
      }
    }

    // Combined cell-local point → index map for constraint resolution.
    const localKey = new Map<number, number>();
    boundary.forEach((p, i) => localKey.set(qk(p), i));
    survivingInterior.forEach((p, i) => localKey.set(qk(p), boundary.length + i));

    const canonical = (p: CellPoint): CellPoint => interiorCanon.get(qk(p)) ?? p;
    const cellConstraints: Array<[number, number]> = [];
    for (const [pa, pb] of constraints) {
      const ia = localKey.get(qk(canonical(pa)));
      const ib = localKey.get(qk(canonical(pb)));
      if (ia === undefined || ib === undefined || ia === ib) continue;
      cellConstraints.push([ia, ib]);
    }

    const result = triangulateConstrainedCell({
      boundary,
      interior: survivingInterior,
      constraints: cellConstraints,
    });

    // Map cell-local point indices to GLOBAL deduped vertex indices.
    const globalOf = result.points.map((p) => vertexIndex(p.u, p.t));
    for (const [a, b, c] of result.triangles) {
      emit(globalOf[a], globalOf[b], globalOf[c]);
    }
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
  // welded together (their geometric area was already ~0).
  const outIndices: number[] = [];
  const outSeam: number[] = [];
  for (let k = 0; k < indices.length; k += 3) {
    const a = newIndexOf[remap[indices[k]]];
    const b = newIndexOf[remap[indices[k + 1]]];
    const c = newIndexOf[remap[indices[k + 2]]];
    if (a === b || b === c || a === c) continue;
    outIndices.push(a, b, c);
    outSeam.push(triWrapsSeam[k / 3]);
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
  };
}
