/**
 * QuadtreeTriangulator.ts — Transition-template triangulation of a periodic,
 * 2:1-balanced quadtree into a conforming, T-junction-free triangle mesh in
 * (u,t) parameter space.
 *
 * Each leaf is a quad. On any side where a finer neighbour exists (detected
 * directly from the leaf set), the leaf gains a mid-edge vertex so its
 * triangulation matches the finer neighbour's edge subdivision — no
 * T-junctions. The leaf's corner + mid-edge vertices are walked CCW into a
 * convex boundary polygon and fan-triangulated from the first vertex.
 *
 * Vertices are deduped by quantized (u,t) with u taken mod 1, so the u=0 and
 * u=1 columns share indices → the periodic seam is closed by construction.
 *
 * Output: `{ vertices: Float32Array (u,t,0 per vertex), indices: Uint32Array
 * (CCW) }`.
 *
 * @module conforming/QuadtreeTriangulator
 */

import type { QuadLeaf } from './PeriodicBalancedQuadtree';

/** Minimal quadtree shape consumed by the triangulator. */
export interface QuadtreeLike {
  leaves(): QuadLeaf[];
}

/** Triangulated (u,t) mesh. */
export interface QuadtreeMesh {
  /** Packed (u,t,0) per vertex. */
  vertices: Float32Array;
  /** CCW triangle indices. */
  indices: Uint32Array;
  /**
   * Per-triangle seam flag (1 byte/triangle). A `1` means the triangle's
   * owning leaf sits on the right seam (u1 == 1), so its right-edge vertices
   * are collapsed onto the u=0 column; consumers measuring orientation/area in
   * (u,t) must unwrap those (treat the triangle's u=0 vertices as u=1).
   */
  seamTriangles: Uint8Array;
}

/** Quantization scale for vertex dedup (exact for dyadic coords up to lvl 24). */
const QSCALE = 1 << 24;

export function triangulateQuadtree(qt: QuadtreeLike): QuadtreeMesh {
  const leaves = qt.leaves();

  // Integer-cell existence set: key `${level}:${iu}:${it}`.
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

  // Vertex dedup by quantized (u,t) WITHOUT wrapping u, so each leaf quad keeps
  // its true extent (a leaf spanning u∈[0.75,1] keeps u=1, not u=0) and stays
  // CCW. The u=1 seam column is merged into the u=0 column afterwards (see
  // remap below), closing the periodic seam at the index level.
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
  // Per-triangle flag: does this triangle's owning leaf sit on the right seam
  // (u1 == 1)? Such triangles have their right-edge vertices collapsed onto the
  // u=0 column, so orientation/position must unwrap them (treat u=0 as u=1).
  const triWrapsSeam: number[] = [];

  /**
   * Does the given side of (level,iu,it) border a finer (level+1) neighbour?
   * If so, that side carries a single mid-edge vertex. In a 2:1-balanced tree
   * the only options are same-level, one-coarser, or one-finer.
   */
  const sideHasFiner = (
    level: number,
    iu: number,
    it: number,
    side: 'uMinus' | 'uPlus' | 'tMinus' | 'tPlus',
  ): boolean => {
    if (level >= maxLevel) return false;
    const fl = level + 1;
    // Finer cells that would touch this side, expressed at level fl.
    if (side === 'uPlus') {
      // neighbour region starts at u=(iu+1)/2^level → fl col = (iu+1)*2.
      const col = (iu + 1) * 2;
      return has(fl, col, it * 2) || has(fl, col, it * 2 + 1);
    }
    if (side === 'uMinus') {
      // neighbour region ends at u=iu/2^level → fl col just left = iu*2 - 1.
      const col = iu * 2 - 1;
      return has(fl, col, it * 2) || has(fl, col, it * 2 + 1);
    }
    if (side === 'tPlus') {
      if (it + 1 >= 1 << level) return false; // domain top
      const row = (it + 1) * 2;
      return has(fl, iu * 2, row) || has(fl, iu * 2 + 1, row);
    }
    // tMinus
    if (it === 0) return false; // domain bottom
    const row = it * 2 - 1;
    return has(fl, iu * 2, row) || has(fl, iu * 2 + 1, row);
  };

  for (const leaf of leaves) {
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

    // Count split sides (those with a finer neighbour → one mid-edge vertex).
    const splitS = sideHasFiner(leaf.level, iu, it, 'tMinus');
    const splitE = sideHasFiner(leaf.level, iu, it, 'uPlus');
    const splitN = sideHasFiner(leaf.level, iu, it, 'tPlus');
    const splitW = sideHasFiner(leaf.level, iu, it, 'uMinus');
    const splitCount = (splitS ? 1 : 0) + (splitE ? 1 : 0) + (splitN ? 1 : 0) + (splitW ? 1 : 0);

    // Walk the boundary CCW: SW → (south mid) → SE → (east mid) → NE →
    // (north mid) → NW → (west mid). Insert mids only where a finer neighbour
    // splits the side (template guarantees the mid-edge vertex is referenced →
    // no T-junction).
    const poly: number[] = [];
    poly.push(vertexIndex(u0, t0)); // SW
    if (splitS) poly.push(vertexIndex(um, t0));
    poly.push(vertexIndex(u1, t0)); // SE
    if (splitE) poly.push(vertexIndex(u1, tm));
    poly.push(vertexIndex(u1, t1)); // NE
    if (splitN) poly.push(vertexIndex(um, t1));
    poly.push(vertexIndex(u0, t1)); // NW
    if (splitW) poly.push(vertexIndex(u0, tm));

    const emit = (a: number, b: number, c: number): void => {
      if (a === b || b === c || a === c) return;
      indices.push(a, b, c);
      triWrapsSeam.push(wrapsSeam);
    };

    if (splitCount === 0) {
      // Plain quad: two triangles along the SW→NE diagonal.
      // poly = [SW, SE, NE, NW].
      emit(poly[0], poly[1], poly[2]);
      emit(poly[0], poly[2], poly[3]);
    } else {
      // Transition template: fan from the cell centre (an interior vertex,
      // unique to this leaf → no T-junction, no colinear slivers even when a
      // side carries a mid-edge vertex). Centre-fan over the CCW boundary.
      const ctr = vertexIndex(um, tm);
      for (let i = 0; i < poly.length; i++) {
        emit(ctr, poly[i], poly[(i + 1) % poly.length]);
      }
    }
  }

  // --- close the seam: merge the u=1 column into the u=0 column -------------
  // Build u=0 lookup by quantized t, then remap any u≈1 vertex to its u=0 twin.
  const zeroByT = new Map<number, number>();
  for (let i = 0; i < vu.length; i++) {
    if (Math.round(vu[i] * QSCALE) === 0) {
      zeroByT.set(Math.round(vt[i] * QSCALE), i);
    }
  }
  const remap = new Int32Array(vu.length);
  for (let i = 0; i < vu.length; i++) remap[i] = i;
  for (let i = 0; i < vu.length; i++) {
    if (Math.round(vu[i] * QSCALE) === QSCALE) {
      const twin = zeroByT.get(Math.round(vt[i] * QSCALE));
      if (twin !== undefined) remap[i] = twin;
    }
  }

  // Compact: assign new contiguous indices to surviving (kept) vertices.
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
  for (let i = 0; i < indices.length; i++) {
    outIndices[i] = newIndexOf[remap[indices[i]]];
  }

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
