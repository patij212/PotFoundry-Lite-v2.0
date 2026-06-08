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

/** Position (0..1) of a boundary point along a CCW side, or -1 if not on it. */
interface SidePoint {
  pos: number;
  pt: CellPoint;
}

export function triangulateQuadtreeWithFeatures(
  qt: QuadtreeLike,
  features: FeatureLine[],
  _options: FeatureTriangulationOptions = {},
): QuadtreeMesh {
  void _options;
  if (features.length === 0) return triangulateQuadtree(qt);

  const leaves = qt.leaves();
  const segs = collectSegments(features);

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

  // Per-leaf feature pieces: the clipped (a,b) segments that intersect each leaf.
  const leafSegs: Array<Seg[]> = leaves.map(() => []);
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
          const clip = clipToBox(s, l.u0, l.u0 + size, l.t0, l.t0 + size);
          if (!clip) continue;
          leafSegs[li].push({ a: lerp(s.a, s.b, clip[0]), b: lerp(s.a, s.b, clip[1]) });
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

    const pieces = leafSegs[li];
    if (pieces.length === 0) {
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

    for (const piece of pieces) {
      // Classify each endpoint; interior endpoints get registered, boundary
      // endpoints get added to their side. Then the piece is a constraint edge.
      if (!classifyBoundary(piece.a)) registerInterior(piece.a);
      if (!classifyBoundary(piece.b)) registerInterior(piece.b);
      constraints.push([piece.a, piece.b]);
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

    // Combined cell-local point → index map for constraint resolution.
    const localKey = new Map<number, number>();
    boundary.forEach((p, i) => localKey.set(qk(p), i));
    interior.forEach((p, i) => localKey.set(qk(p), boundary.length + i));

    const cellConstraints: Array<[number, number]> = [];
    for (const [pa, pb] of constraints) {
      const ia = localKey.get(qk(pa));
      const ib = localKey.get(qk(pb));
      if (ia === undefined || ib === undefined || ia === ib) continue;
      cellConstraints.push([ia, ib]);
    }

    const result = triangulateConstrainedCell({ boundary, interior, constraints: cellConstraints });

    // Map cell-local point indices to GLOBAL deduped vertex indices.
    const globalOf = result.points.map((p) => vertexIndex(p.u, p.t));
    for (const [a, b, c] of result.triangles) {
      emit(globalOf[a], globalOf[b], globalOf[c]);
    }
  }

  // ── Close the seam: merge the u=1 column into the u=0 column (as plain) ──
  const zeroByT = new Map<number, number>();
  for (let i = 0; i < vu.length; i++) {
    if (Math.round(vu[i] * QSCALE) === 0) zeroByT.set(Math.round(vt[i] * QSCALE), i);
  }
  const remap = new Int32Array(vu.length);
  for (let i = 0; i < vu.length; i++) remap[i] = i;
  for (let i = 0; i < vu.length; i++) {
    if (Math.round(vu[i] * QSCALE) === QSCALE) {
      const twin = zeroByT.get(Math.round(vt[i] * QSCALE));
      if (twin !== undefined) remap[i] = twin;
    }
  }

  const newIndexOf = new Int32Array(vu.length).fill(-1);
  const keptU: number[] = [];
  const keptT: number[] = [];
  for (let i = 0; i < vu.length; i++) {
    const r = remap[i];
    if (newIndexOf[r] === -1) {
      newIndexOf[r] = keptU.length;
      keptU.push(vu[r]);
      keptT.push(vt[r]);
    }
  }

  const outIndices = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) outIndices[i] = newIndexOf[remap[indices[i]]];

  const vertices = new Float32Array(keptU.length * 3);
  for (let i = 0; i < keptU.length; i++) {
    vertices[i * 3] = keptU[i];
    vertices[i * 3 + 1] = keptT[i];
    vertices[i * 3 + 2] = 0;
  }
  return {
    vertices,
    indices: outIndices,
    seamTriangles: Uint8Array.from(triWrapsSeam),
  };
}
