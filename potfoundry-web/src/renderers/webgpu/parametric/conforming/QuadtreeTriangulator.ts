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
import type { CdtStats } from './ConstrainedCellTriangulator';

/** Per-triangle emission provenance (Stage-0 instrument). */
export const TRI_SOURCE = {
  PLAIN_QUAD: 0,      // triangulateQuadtree plain-quad split
  TRANSITION_FAN: 1,  // triangulateQuadtree centroid transition fan
  EAR_CLIP: 2,        // metric ear-clip path (ARMED Stage-1: leaves carry efg when an efgSampler is threaded)
  FCT_PLAIN_QUAD: 3,  // FeatureConformingTriangulator plain cell, 0-split
  FCT_PLAIN_FAN: 4,   // FeatureConformingTriangulator plain cell, centroid fan
  FCT_FEATURE_CDT: 5, // FeatureConformingTriangulator feature-cell CDT fill
  RING_OR_CAP: 6,     // assembly ring strips / caps / discs
} as const;

/** Minimal quadtree shape consumed by the triangulator. */
export interface QuadtreeLike {
  leaves(): QuadLeaf[];
  /**
   * Anisotropy bias B (≥0): a level-L leaf spans Δu = 1/2^(L+B) in u (Δt =
   * 1/2^L in t). Absent ⇒ 0 (isotropic). The triangulator reconstructs each
   * leaf's integer u-index via 2^(level+B) and wraps the periodic seam mod the
   * same, so anisotropic (B>0) leaves stay watertight + T-junction-free.
   */
  uBias?(): number;
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
  /**
   * Masking-channel counters from the constrained-CDT cells (Stage-0
   * instrument) — only the feature path ({@link
   * FeatureConformingTriangulator}) populates this; the plain triangulator
   * has no CDT cells. Metadata only: the triangle output is unaffected.
   */
  cdtStats?: CdtStats;
  /** Per-triangle emission provenance (TRI_SOURCE values; parallel to indices/3). */
  triangleSource?: Uint8Array;
}

/** Quantization scale for vertex dedup (exact for dyadic coords up to lvl 24). */
const QSCALE = 1 << 24;

/** Cap on per-leaf directional u-refinement (mirrors PeriodicBalancedQuadtree). */
const MAX_U_EXTRA = 4;

/** First fundamental form `{E,F,G}` carried by a leaf (Tier 1b shape templates). */
interface Efg {
  E: number;
  F: number;
  G: number;
}

/**
 * Above this F-inclusive 3D cell aspect the cell is "anisotropic" and the
 * shape-aware templates (shorter 3D diagonal / max-min-angle ear-clip) fire. A
 * perfectly isotropic cell (E==G, F==0) has aspect √3 ≈ 1.732 (the equilateral-
 * normalized right-triangle factor), so this floor sits a hair above it: an
 * isotropic cell falls through to the legacy template byte-for-byte. (B>0 also
 * forces the shaped path regardless of aspect — see {@link shapedTemplate}.)
 */
const ANISO_ASPECT_GATE = Math.sqrt(3) * (1 + 1e-6);

/**
 * Squared 3D length of the (u,t)-space vector (du,dt) under the constant first
 * fundamental form `efg`: |Pu·du + Pt·dt|² = E·du² + 2F·du·dt + G·dt². This is
 * the local metric the shape templates minimize/maximize over, matching the 3D
 * law-of-cosines basis the gate metric (`triangleQualityDistribution`) uses.
 */
function metricLen2(efg: Efg, du: number, dt: number): number {
  return efg.E * du * du + 2 * efg.F * du * dt + efg.G * dt * dt;
}

/** F-inclusive 3D aspect of the leaf quad (matches PeriodicBalancedQuadtree.cellAspect3D). */
function cellAspect3D(efg: Efg, du: number, dt: number): number {
  const physW2 = efg.E * du * du;
  const physH2 = efg.G * dt * dt;
  const det = efg.E * efg.G - efg.F * efg.F;
  const area = Math.sqrt(Math.max(det, 0)) * du * dt;
  const longest2 = Math.max(physW2, physH2);
  return area <= 1e-300 ? Infinity : (longest2 * Math.sqrt(3)) / (2 * area);
}

/**
 * Does this leaf take the shape-aware (Tier 1b) template path? Only when it
 * carries an `efg` tag AND it is anisotropic (3D aspect over the gate) OR the
 * tree is globally u-biased (B>0, which makes EVERY cell anisotropic in u by
 * construction). Otherwise (no tag, or isotropic + B==0) the legacy templates
 * are emitted verbatim → smooth-default mesh stays byte-identical.
 */
function shapedTemplate(efg: Efg | undefined, du: number, dt: number, uBias: number): efg is Efg {
  if (!efg) return false;
  if (uBias > 0) return true;
  return cellAspect3D(efg, du, dt) > ANISO_ASPECT_GATE;
}

/** Min interior 3D angle (deg) of triangle (p0,p1,p2) under the metric `efg`. */
function triMinAngle3D(
  efg: Efg,
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
): number {
  const a2 = metricLen2(efg, p2[0] - p1[0], p2[1] - p1[1]); // opposite p0
  const b2 = metricLen2(efg, p0[0] - p2[0], p0[1] - p2[1]); // opposite p1
  const c2 = metricLen2(efg, p1[0] - p0[0], p1[1] - p0[1]); // opposite p2
  const a = Math.sqrt(Math.max(a2, 0));
  const b = Math.sqrt(Math.max(b2, 0));
  const c = Math.sqrt(Math.max(c2, 0));
  const ang = (adj1: number, adj2: number, opp: number): number => {
    if (adj1 <= 0 || adj2 <= 0) return 0;
    let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
    if (cos > 1) cos = 1;
    if (cos < -1) cos = -1;
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}

/** Signed (u,t)-space area×2 of triangle (p0,p1,p2); >0 ⇒ CCW. */
function signedArea2(
  p0: readonly [number, number],
  p1: readonly [number, number],
  p2: readonly [number, number],
): number {
  return (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
}

/**
 * Ear-clip a CCW boundary polygon (given as (u,t) points + their global vertex
 * indices) into a fan-free triangulation, repeatedly removing the ear whose
 * resulting triangle has the LARGEST minimum 3D angle (locally-max-min-angle).
 * Pure interior choice: the polygon vertices are unchanged, so every shared edge
 * keeps its exact vertex set (watertight + T-junction-free preserved). Collinear
 * (zero-area) ears are never selected (they score −∞), so a near-collinear mid
 * set produces NO degenerate triangle. Convex polygons (every transition cell
 * here is a rectangle + on-edge mids) always have a valid ear, guaranteeing
 * termination in exactly k−2 triangles.
 */
function earClipMaxMinAngle(
  efg: Efg,
  poly: readonly [number, number][],
  idx: readonly number[],
  emit: (a: number, b: number, c: number) => void,
): void {
  const n = poly.length;
  if (n < 3) return;
  const remaining: number[] = [];
  for (let i = 0; i < n; i++) remaining.push(i);
  const AREA_EPS = 1e-18;
  while (remaining.length > 3) {
    const m = remaining.length;
    let bestPrev = -1;
    let bestScore = -Infinity;
    for (let k = 0; k < m; k++) {
      const ip = remaining[(k - 1 + m) % m];
      const ic = remaining[k];
      const inx = remaining[(k + 1) % m];
      const pp = poly[ip];
      const pc = poly[ic];
      const pn = poly[inx];
      // Valid ear: convex corner (CCW, strictly positive area) and — for the
      // convex polygons here — no containment test is needed. Reject collinear.
      const area2 = signedArea2(pp, pc, pn);
      if (area2 <= AREA_EPS) continue;
      const score = triMinAngle3D(efg, pp, pc, pn);
      if (score > bestScore) {
        bestScore = score;
        bestPrev = k;
      }
    }
    if (bestPrev < 0) break; // no convex ear (should not happen for a convex poly)
    const ip = remaining[(bestPrev - 1 + m) % m];
    const ic = remaining[bestPrev];
    const inx = remaining[(bestPrev + 1) % m];
    emit(idx[ip], idx[ic], idx[inx]);
    remaining.splice(bestPrev, 1);
  }
  if (remaining.length === 3) {
    emit(idx[remaining[0]], idx[remaining[1]], idx[remaining[2]]);
  }
}

export function triangulateQuadtree(qt: QuadtreeLike): QuadtreeMesh {
  const leaves = qt.leaves();
  const uBias = qt.uBias?.() ?? 0;
  /** Effective u-level of a leaf: level + global bias + per-leaf uExtra. */
  const eULof = (l: { level: number; uExtra?: number }): number =>
    l.level + uBias + (l.uExtra ?? 0);
  /** u-modulus at an effective u-level. */
  const uMod = (eUL: number): number => 1 << eUL;
  /** Integer u-index of a leaf at its effective u-level (read DIRECTLY, no round-trip). */
  const iuOf = (l: QuadLeaf): number => l.iu ?? Math.round(l.u0 * uMod(eULof(l)));
  /** Integer t-index of a leaf. */
  const itOf = (l: QuadLeaf): number => l.it ?? Math.round(l.t0 * (1 << l.level));

  // Integer-cell existence set keyed on the EFFECTIVE u-level so a uExtra=0 cell
  // and a uExtra=1 cell never collide: `${level}:${it}:${eUL}:${iu}`. Including
  // `level` (the t-resolution) AND `eUL` (the u-resolution) disambiguates cells
  // that share an `it` integer at different levels (different t-positions). At
  // uExtra=0 (eUL=level+B is a fixed bijection of level) this is byte-identical to
  // the original level-keyed set.
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
  const has = (level: number, iu: number, it: number, eUL: number): boolean => {
    const span = uMod(eUL);
    const wu = ((iu % span) + span) % span;
    return cellSet.has(`${level}:${it}:${eUL}:${wu}`);
  };
  /**
   * Does a finer u-neighbour exist in the effective-u column `col` at effective
   * u-level `feUL` across the t-strip of OUR (level,it) cell? A finer u-neighbour
   * may be: (a) a uExtra-split at our SAME level (its t-index is our `it`,
   * uExtra' = feUL−B−level), or (b) a level-split at a finer level `lvl>level`
   * (its t-indices subdivide our strip). We probe the LEVEL-keyed `has` (not the
   * level-agnostic effective index) so a same-`it` integer at a DIFFERENT level —
   * a genuinely different t-position — never spuriously matches. At uExtra=0 only
   * lvl=level+1 (rows it*2, it*2+1) is possible → byte-identical to the original.
   */
  const uColHasFiner = (feUL: number, col: number, level: number, it: number): boolean => {
    for (let lvl = level; lvl <= maxLevel; lvl++) {
      const ux = feUL - uBias - lvl;
      if (ux < 0 || ux > MAX_U_EXTRA) continue;
      const tMul = 1 << (lvl - level);
      const tBase = it * tMul;
      for (let k = 0; k < tMul; k++) {
        if (has(lvl, col, tBase + k, feUL)) return true;
      }
    }
    return false;
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
  // Stage-0 provenance channel: one TRI_SOURCE tag per emitted triangle, pushed
  // in lockstep by `emit`. `curTag` is set immediately before each emission
  // region. Metadata only — the triangle content/order is untouched.
  const source: number[] = [];
  let curTag: number = TRI_SOURCE.PLAIN_QUAD;

  /**
   * Does the given side of (level,iu,it,eUL) border a finer neighbour? On a
   * t-side "finer" is level+1 (their it-rows subdivide ours). On a u-side "finer"
   * is effective-u-level eUL+1 — which may arise from a level+1 split OR a
   * uExtra+1 directional split — detected via {@link uColHasFiner}, so the side
   * carries a single mid-edge vertex either way. In a 2:1-balanced tree
   * the only options are same, one-coarser, or one-finer. At uExtra=0 (eUL=
   * level+B) this is byte-identical to the original level+1 probe.
   */
  const sideHasFiner = (
    level: number,
    iu: number,
    it: number,
    eUL: number,
    side: 'uMinus' | 'uPlus' | 'tMinus' | 'tPlus',
  ): boolean => {
    if (side === 'uPlus') {
      if (eUL >= maxEUL) return false;
      // neighbour region starts at u=(iu+1)/2^eUL → finer eff-col = (iu+1)*2.
      return uColHasFiner(eUL + 1, (iu + 1) * 2, level, it);
    }
    if (side === 'uMinus') {
      if (eUL >= maxEUL) return false;
      // neighbour region ends at u=iu/2^eUL → finer eff-col just left = iu*2 - 1.
      return uColHasFiner(eUL + 1, iu * 2 - 1, level, it);
    }
    if (level >= maxLevel) return false;
    const fl = level + 1;
    const fe = fl + uBias; // finer cells are uExtra=0 in a square-balanced region
    if (side === 'tPlus') {
      if (it + 1 >= 1 << level) return false; // domain top
      const row = (it + 1) * 2;
      return has(fl, iu * 2, row, fe) || has(fl, iu * 2 + 1, row, fe);
    }
    // tMinus
    if (it === 0) return false; // domain bottom
    const row = it * 2 - 1;
    return has(fl, iu * 2, row, fe) || has(fl, iu * 2 + 1, row, fe);
  };

  // ── Per-leaf geometry, computed once and shared by both passes. ──
  interface LeafGeom {
    level: number; eUL: number; iu: number; it: number;
    u0: number; t0: number; u1: number; t1: number; um: number; tm: number;
    wrapsSeam: number;
    /** Per-leaf metric (Tier 1b); undefined ⇒ legacy templates. */
    efg?: Efg;
    /** True ⇒ this leaf takes the shape-aware template path (anisotropic OR B>0). */
    aniso: boolean;
  }
  const geom: LeafGeom[] = leaves.map((leaf) => {
    const eUL = eULof(leaf);
    const iu = iuOf(leaf);
    const it = itOf(leaf);
    const sizeU = 1 / uMod(eUL);
    const sizeT = 1 / (1 << leaf.level);
    const u0 = leaf.u0;
    const t0 = leaf.t0;
    const u1 = u0 + sizeU;
    const t1 = t0 + sizeT;
    const efg = leaf.efg;
    return {
      level: leaf.level, eUL, iu, it,
      u0, t0, u1, t1, um: u0 + sizeU / 2, tm: t0 + sizeT / 2,
      wrapsSeam: Math.round(u1 * QSCALE) === QSCALE ? 1 : 0,
      efg,
      aniso: shapedTemplate(efg, sizeU, sizeT, uBias),
    };
  });

  // ── PASS A: register each leaf's 4 corners onto the shared grid-line registry.
  // A coarse cell whose edge is subdivided at MULTIPLE points by several finer
  // neighbours (a level-finer AND uExtra-finer neighbour both abut the same edge
  // → quarter-points, not a single mid) reads the UNION of those subdivision
  // points in PASS B, so both sides of every shared edge carry the identical
  // ordered vertex set → no T-junction even at an N-mid transition. Horizontal
  // grid lines (t-lines) are keyed by quantized t; vertical (u-lines) by
  // quantized u mod 1 so the periodic seam u=1≡u=0 shares a key. At uExtra=0 the
  // only finer u-level is eUL+1, so every edge carries at most a single mid →
  // PASS B takes the byte-identical single-mid fast path.
  const tKey = (t: number): number => Math.round(t * QSCALE);
  const uKey = (u: number): number => Math.round((((u % 1) + 1) % 1) * QSCALE);
  const regH = new Map<number, Set<number>>(); // tKey(t) → set of uKey(u) corners on that t-line
  const regV = new Map<number, Set<number>>(); // uKey(u) → set of tKey(t) corners on that u-line
  const regAdd = (m: Map<number, Set<number>>, k: number, sub: number): void => {
    let s = m.get(k);
    if (!s) { s = new Set(); m.set(k, s); }
    s.add(sub);
  };
  for (const g of geom) {
    // Bottom (t0) and top (t1) edges run along t-lines: register the cell's two
    // corner u-positions on each.
    regAdd(regH, tKey(g.t0), uKey(g.u0));
    regAdd(regH, tKey(g.t0), uKey(g.u1));
    regAdd(regH, tKey(g.t1), uKey(g.u0));
    regAdd(regH, tKey(g.t1), uKey(g.u1));
    // Left (u0) and right (u1) edges run along u-lines: register corner t-positions.
    regAdd(regV, uKey(g.u0), tKey(g.t0));
    regAdd(regV, uKey(g.u0), tKey(g.t1));
    regAdd(regV, uKey(g.u1), tKey(g.t0));
    regAdd(regV, uKey(g.u1), tKey(g.t1));
  }

  // Read the subdivision u-positions registered on t-line `tk`, strictly inside
  // (lo,hi), ascending. (Returns the union contributed by ALL cells touching that
  // line — including the finer neighbours across the edge.)
  const QEPS = 1; // one quantization unit
  const readH = (tk: number, lo: number, hi: number): number[] => {
    const s = regH.get(tk);
    if (!s) return [];
    const loQ = Math.round(lo * QSCALE);
    const hiQ = Math.round(hi * QSCALE);
    const out: number[] = [];
    for (const uq of s) {
      // Unwrap the periodic u-key into [lo,hi]: candidate at uq or uq+QSCALE.
      for (const cand of uq > loQ ? [uq] : [uq, uq + QSCALE]) {
        if (cand > loQ + QEPS && cand < hiQ - QEPS) out.push(cand / QSCALE);
      }
    }
    out.sort((a, b) => a - b);
    return out;
  };
  const readV = (uk: number, lo: number, hi: number): number[] => {
    const s = regV.get(uk);
    if (!s) return [];
    const loQ = Math.round(lo * QSCALE);
    const hiQ = Math.round(hi * QSCALE);
    const out: number[] = [];
    for (const tq of s) if (tq > loQ + QEPS && tq < hiQ - QEPS) out.push(tq / QSCALE);
    out.sort((a, b) => a - b);
    return out;
  };

  // ── PASS B: triangulate each leaf, reading the UNION of edge subdivision
  //    points so both sides of every shared edge carry the identical sequence. ──
  for (let li = 0; li < leaves.length; li++) {
    const g = geom[li];
    const { level, eUL, iu, it, u0, t0, u1, t1, um, tm, wrapsSeam, efg, aniso } = g;

    const emit = (a: number, b: number, c: number): void => {
      if (a === b || b === c || a === c) return;
      indices.push(a, b, c);
      triWrapsSeam.push(wrapsSeam);
      source.push(curTag);
    };

    // Fast-path split flags (single mid where a finer neighbour exists).
    const splitS = sideHasFiner(level, iu, it, eUL, 'tMinus');
    const splitE = sideHasFiner(level, iu, it, eUL, 'uPlus');
    const splitN = sideHasFiner(level, iu, it, eUL, 'tPlus');
    const splitW = sideHasFiner(level, iu, it, eUL, 'uMinus');

    // Union subdivision points on each edge (from the registry). These include
    // the single-mid case AND multi-point (N-mid) transitions a directional
    // neighbour creates. We walk each edge in its CCW direction.
    const subS = readH(tKey(t0), u0, u1); // south, u ascending (CCW left→right)
    const subE = readV(uKey(u1), t0, t1); // east, t ascending (CCW bottom→top)
    const subN = readH(tKey(t1), u0, u1); // north, u — CCW is right→left, reverse below
    const subW = readV(uKey(u0), t0, t1); // west, t — CCW is top→bottom, reverse below

    const nExtra = subS.length + subE.length + subN.length + subW.length;
    const splitCount = (splitS ? 1 : 0) + (splitE ? 1 : 0) + (splitN ? 1 : 0) + (splitW ? 1 : 0);

    // Fast path: no edge subdivision at all (plain quad), OR exactly the legacy
    // single-mid template (each subdivided side carries its lone mid). At
    // uExtra=0 every transition is single-mid, so this branch is taken for the
    // entire default tree → byte-identical to the pre-registry triangulator.
    const singleMid =
      (!splitS || (subS.length === 1 && Math.abs(subS[0] - um) < 2 / QSCALE)) &&
      (!splitE || (subE.length === 1 && Math.abs(subE[0] - tm) < 2 / QSCALE)) &&
      (!splitN || (subN.length === 1 && Math.abs(subN[0] - um) < 2 / QSCALE)) &&
      (!splitW || (subW.length === 1 && Math.abs(subW[0] - tm) < 2 / QSCALE)) &&
      subS.length === (splitS ? 1 : 0) && subE.length === (splitE ? 1 : 0) &&
      subN.length === (splitN ? 1 : 0) && subW.length === (splitW ? 1 : 0);

    if (nExtra === 0 && splitCount === 0) {
      // Plain quad. Legacy: split along the SW→NE diagonal. Shape-aware (Tier 1b):
      // split along the SHORTER 3D diagonal so a wide/anisotropic cell yields two
      // better-conditioned triangles. Strictly interior choice (same 4 corner
      // vertices) → watertight unaffected. Tie (equal quantized 3D length, e.g. an
      // isotropic square) resolves to SW→NE → byte-identical to legacy.
      const sw = vertexIndex(u0, t0);
      const se = vertexIndex(u1, t0);
      const ne = vertexIndex(u1, t1);
      const nw = vertexIndex(u0, t1);
      let useSeNw = false;
      if (aniso && efg) {
        const dSwNe = metricLen2(efg, u1 - u0, t1 - t0); // SW→NE
        const dSeNw = metricLen2(efg, u0 - u1, t1 - t0); // SE→NW
        // Quantize to suppress float jitter so the tie always falls to SW→NE.
        const qSwNe = Math.round(dSwNe * QSCALE);
        const qSeNw = Math.round(dSeNw * QSCALE);
        useSeNw = qSeNw < qSwNe;
      }
      curTag = TRI_SOURCE.PLAIN_QUAD;
      if (useSeNw) {
        emit(sw, se, nw);
        emit(se, ne, nw);
      } else {
        emit(sw, se, ne);
        emit(sw, ne, nw);
      }
      continue;
    }

    if (singleMid) {
      // Single-mid transition. Build the CCW boundary polygon (corners + lone
      // mids), then EITHER the legacy centre-fan (isotropic / untagged → byte-
      // identical) OR a max-min-angle ear-clip (anisotropic). Both keep the exact
      // boundary vertex set; only the interior connectivity differs (no centroid
      // vertex in the ear-clip), so every shared edge stays T-junction-free.
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
      if (aniso && efg) {
        curTag = TRI_SOURCE.EAR_CLIP;
        // curTag must be set before this call — earClipMaxMinAngle calls emit synchronously.
        earClipMaxMinAngle(efg, co, poly, emit);
      } else {
        curTag = TRI_SOURCE.TRANSITION_FAN;
        const ctr = vertexIndex(um, tm);
        for (let i = 0; i < poly.length; i++) emit(ctr, poly[i], poly[(i + 1) % poly.length]);
      }
      continue;
    }

    // N-mid transition: build the CCW boundary from the UNION of edge points,
    // then EITHER centre-fan (legacy) or max-min-angle ear-clip (anisotropic).
    // The centre is interior + unique to this leaf, and the edge-point sets are
    // symmetric across each shared edge (read from the same registry), so EITHER
    // template is watertight + T-junction-free with positive area; the ear-clip
    // additionally avoids the centroid needles a wide cell would radiate.
    const poly: number[] = [];
    const co: [number, number][] = [];
    const add = (u: number, t: number): void => { poly.push(vertexIndex(u, t)); co.push([u, t]); };
    add(u0, t0); // SW
    for (const u of subS) add(u, t0); // south: u ascending
    add(u1, t0); // SE
    for (const t of subE) add(u1, t); // east: t ascending
    add(u1, t1); // NE
    for (let k = subN.length - 1; k >= 0; k--) add(subN[k], t1); // north: u descending
    add(u0, t1); // NW
    for (let k = subW.length - 1; k >= 0; k--) add(u0, subW[k]); // west: t descending
    if (aniso && efg) {
      curTag = TRI_SOURCE.EAR_CLIP;
      // curTag must be set before this call — earClipMaxMinAngle calls emit synchronously.
      earClipMaxMinAngle(efg, co, poly, emit);
    } else {
      curTag = TRI_SOURCE.TRANSITION_FAN;
      const ctr = vertexIndex(um, tm);
      for (let i = 0; i < poly.length; i++) emit(ctr, poly[i], poly[(i + 1) % poly.length]);
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
    // Stage-0 provenance: the seam remap above never drops/reorders triangles,
    // so the per-emit tags stay parallel to the final triangle list.
    triangleSource: Uint8Array.from(source),
  };
}
