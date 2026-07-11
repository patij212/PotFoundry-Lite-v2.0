// _sharp3dMesh.ts — DEV-ONLY (research/ only). ISOLATED builder for E-2026-07-01-SHARP3D-ARTDECO.
// A discontinuity-conforming CLOSED-3D export mesh BY CONSTRUCTION: a structured θ×z outer-wall mesh with the
// step rings DOUBLED (both radii present at each ring's fixed z) so the connecting TREAD band is a first-class
// tessellated strip, plus optional per-row θ-conforming at the chevron/fan kink loci. Every ring row and every
// kink column is a CHAIN OF MESH EDGES ⇒ zero serration by construction; watertight by shared-row vertices.
//
// The (u,t)→(θ,z) single-valued kernel CANNOT represent a tread (a range of radii at one z) — hence a native 3D
// structured builder. z-rows and θ-columns are placed/refined; refinement is DRIVEN BY the 3D-vs-reference metric
// externally (the probe adds z-rows / θ-columns where facets exceed tol), so this builder just takes explicit
// row z-levels + a per-row θ-sample function and emits a watertight band mesh (merge-strip between adjacent rows
// whose θ-sample sets may differ).

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface RowSpec {
  /** the z the row lives at (mm). Two rows at the SAME z (below/above) make a tread strip. */
  z: number;
  /** the z the RADIUS is evaluated at (one-sided at a ring; = z on the sheet). */
  rz: number;
  /** sorted, unique θ samples for this row (radians in [0,TAU)). Must include 0 (seam) implicitly-periodic. */
  thetas: Float64Array;
  /** tag for reporting: 'sheet' | 'ringBelow' | 'ringAbove' | 'tread' (an interior radial sub-ring of a tread). */
  kind: 'sheet' | 'ringBelow' | 'ringAbove' | 'tread';
  /**
   * OPT radial-blend for a TREAD sub-ring: the radius is rBlend*r(θ,rzOuter) + (1-rBlend)*r(θ,rzInner), placing
   * the sub-ring at an interior radius of the flat tread annulus (constant z). Absent ⇒ radius = rA(θ,rz).
   */
  treadBlend?: { s: number; rzInner: number; rzOuter: number };
}

export interface BuiltMesh {
  ut: number[];            // (u,t) per vertex, u=θ/TAU, t=z/H — for labkit heatmap/lift compatibility (sheet)
  xyz: Float64Array;       // lifted 3D positions (the TRUTH: includes treads via rz≠z rows)
  idx: Uint32Array;
  nV: number;
  nF: number;
  rowStart: number[];      // vertex offset where each row begins (length rows+1)
  rows: RowSpec[];
  /** vertex pairs (a,b) that are ring-ring or ring-column mesh edges we assert as feature edges (for serration). */
}

/**
 * Merge-strip triangulation between two θ-sorted vertex rings (periodic). Advances two pointers by θ; emits a
 * triangle using whichever ring's next vertex has the smaller θ-gap, producing a watertight strip even when the
 * two rows have different θ-sample sets. Guarantees every row edge (consecutive same-row vertices) is a mesh
 * edge (zero serration along rows).
 */
function stripBetween(
  idx: number[], topBase: number, topN: number, topTh: Float64Array,
  botBase: number, botN: number, botTh: Float64Array,
): void {
  // walk θ from 0..TAU; i over top, j over bot. Emit triangle from the current top/bot verts to whichever
  // next vertex (top i+1 or bot j+1) is closer in θ. Periodic wrap: append the first vertex at θ+TAU sentinel.
  let i = 0, j = 0;
  const topNext = (k: number): number => (k + 1 <= topN ? (k + 1 < topN ? topTh[k + 1] : topTh[0] + TAU) : Infinity);
  const botNext = (k: number): number => (k + 1 <= botN ? (k + 1 < botN ? botTh[k + 1] : botTh[0] + TAU) : Infinity);
  const topV = (k: number): number => topBase + (k % topN);
  const botV = (k: number): number => botBase + (k % botN);
  const steps = topN + botN;
  for (let s = 0; s < steps; s++) {
    const tn = topNext(i), bn = botNext(j);
    if (tn <= bn) {
      // advance top: triangle (topV(i), topV(i+1), botV(j)) — CCW-in-(theta,z), matching
      // ConformingWall/QuadtreeTriangulator's convention (WINDING-ROOT-diagnosis.md: this branch
      // was CW-in-(theta,z) unconditionally, the DS Finding-2 winding defect's mechanism — last
      // two vertices swapped from the original (topV(i), botV(j), topV(i+1)) to flip the sign).
      idx.push(topV(i), topV(i + 1), botV(j));
      i++;
    } else {
      // advance bot: triangle (topV(i), botV(j+1), botV(j)) — CCW-in-(theta,z), same flip (last
      // two vertices swapped from the original (topV(i), botV(j), botV(j+1))).
      idx.push(topV(i), botV(j + 1), botV(j));
      j++;
    }
  }
}

/** Build the closed-wall structured mesh from ordered row specs. Adjacent rows are strip-triangulated. */
export function buildStructuredWall(rA: AnalyticRadiusFn, H: number, rows: RowSpec[]): BuiltMesh {
  const rowStart: number[] = [0];
  let total = 0;
  for (const r of rows) { total += r.thetas.length; rowStart.push(total); }
  const xyz = new Float64Array(total * 3);
  const ut: number[] = new Array(total * 2);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]; const base = rowStart[r]; const tb = row.treadBlend;
    for (let k = 0; k < row.thetas.length; k++) {
      const th = row.thetas[k];
      const rad = tb
        ? tb.s * rA(th, tb.rzOuter) + (1 - tb.s) * rA(th, tb.rzInner) // interior of the flat tread annulus
        : rA(th, row.rz);
      const v = base + k;
      xyz[3 * v] = rad * Math.cos(th); xyz[3 * v + 1] = rad * Math.sin(th); xyz[3 * v + 2] = row.z;
      ut[2 * v] = th / TAU; ut[2 * v + 1] = row.z / H;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r + 1 < rows.length; r++) {
    const nTop = rows[r].thetas.length, nBot = rows[r + 1].thetas.length;
    if (nTop === nBot) {
      // STRUCTURED column-to-column strip: both rows share the same logical column structure (same count).
      // Connect column c(top) — c(bot) directly ⇒ clean quads (2 tris). The kink column is a DIAGONAL chain of
      // mesh edges across rows (zero serration). Per-quad choose the diagonal that MAXIMIZES the min 3D angle
      // (a cheap Delaunay-like flip at build time) so the shear tilt doesn't force slivers.
      const tb = rowStart[r], bb = rowStart[r + 1], n = nTop;
      const d2 = (u: number, v: number): number => { const dx = xyz[3 * u] - xyz[3 * v], dy = xyz[3 * u + 1] - xyz[3 * v + 1], dz = xyz[3 * u + 2] - xyz[3 * v + 2]; return dx * dx + dy * dy + dz * dz; };
      for (let c = 0; c < n; c++) {
        const cn = (c + 1) % n;
        const a = tb + c, an = tb + cn, b = bb + c, bn = bb + cn;
        // quad corners a(top,c) an(top,c+1) b(bot,c) bn(bot,c+1). Diagonal option1 = a-bn, option2 = an-b.
        // choose the SHORTER diagonal (well-known heuristic ≈ max-min-angle on a convex quad).
        // WINDING (WINDING-ROOT-diagnosis.md): each triangle's LAST TWO vertices are swapped vs the
        // original (idx.push(a,b,bn); idx.push(a,bn,an) / idx.push(a,b,an); idx.push(an,b,bn)) to flip
        // this branch from CW-in-(theta,z) to CCW-in-(theta,z), matching ConformingWall/
        // QuadtreeTriangulator's convention (a single transposition negates signed area unconditionally).
        if (d2(a, bn) <= d2(an, b)) { idx.push(a, bn, b); idx.push(a, an, bn); }
        else { idx.push(a, an, b); idx.push(an, bn, b); }
      }
    } else {
      stripBetween(idx, rowStart[r], nTop, rows[r].thetas, rowStart[r + 1], nBot, rows[r + 1].thetas);
    }
  }
  return { ut, xyz, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3, rowStart, rows };
}

/**
 * LOGICAL-COLUMN conforming θ samples: given the sorted kink θ-loci (segment endpoints) and a FIXED number of
 * even sub-samples per segment `subPerSeg`, produce a θ-array whose COLUMN COUNT and column MEANING are identical
 * across rows (column c = kink k + fractional j/subPerSeg into segment k). Because every row uses the same segment
 * structure (kinks shift with z but stay in the same cyclic order and count), two adjacent rows have identical
 * column counts ⇒ a structured quad strip (no merge-strip slivers), and column 0 of each segment is the kink
 * itself ⇒ the kink is a DIAGONAL chain of mesh edges (zero serration) with well-shaped quads.
 * Returns { thetas, nCols } where nCols = nKink*subPerSeg (constant for a given nKink & subPerSeg).
 */
export function logicalColumnThetas(kinks: number[], subPerSeg: number): Float64Array {
  const norm = kinks.map((k) => { let kk = k % TAU; if (kk < 0) kk += TAU; return kk; }).sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const k of norm) { if (uniq.length === 0 || k - uniq[uniq.length - 1] > 1e-7) uniq.push(k); }
  if (uniq.length === 0) uniq.push(0);
  const out: number[] = [];
  for (let i = 0; i < uniq.length; i++) {
    const a = uniq[i];
    const b = i + 1 < uniq.length ? uniq[i + 1] : uniq[0] + TAU;
    for (let j = 0; j < subPerSeg; j++) { let v = a + ((b - a) * j) / subPerSeg; v = v % TAU; if (v < 0) v += TAU; out.push(v); }
  }
  return Float64Array.from(out);
}

/** even θ samples of count n (periodic, starts at 0). */
export function evenThetas(n: number): Float64Array {
  const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = TAU * (i / n); return a;
}

/**
 * SHEARED (φ) row: the ArtDeco chevron kink is at θ·chevronFreq + t·(4π) = mπ. With φ = θ + shear·t and
 * shear = 4π/chevronFreq, chevronPhase = chevronFreq·φ ⇒ the chevron kinks are FIXED φ-columns φ = mπ/chevronFreq,
 * z-INDEPENDENT (no seam rotation, unlike sorted-by-θ logical columns). This helper gives, for a row at param t,
 * the θ-samples for a FIXED φ-grid of `nCol` even φ-columns (nCol a multiple of 2·chevronFreq puts a column
 * exactly on every chevron kink). θ_j = (φ_j − shear·t) mod TAU. The FIRST column is at φ=0 for all rows ⇒
 * identical column count/meaning across rows ⇒ clean structured strip (buildStructuredWall equal-count path).
 * NB: because the θ's are φ-fixed − shear·t, the row's θ-array is NOT θ-sorted, but the structured strip connects
 * column c→c by index (not θ), which is exactly the sheared-grid quad — correct and twist-free.
 */
export function shearedThetas(t: number, nCol: number, shear: number): Float64Array {
  const a = new Float64Array(nCol);
  for (let j = 0; j < nCol; j++) {
    let th = (TAU * (j / nCol)) - shear * t; th = th % TAU; if (th < 0) th += TAU;
    a[j] = th;
  }
  return a;
}

/**
 * θ samples that are even but with EXTRA columns injected at the given kink θ-loci (merged + sorted + unique).
 * Zero serration along a kink requires the kink θ to be an actual sample (a mesh vertex) on every row that
 * crosses it — this puts it there.
 */
export function thetasWithKinks(nEven: number, kinks: number[]): Float64Array {
  const set = new Set<number>();
  for (let i = 0; i < nEven; i++) set.add(TAU * (i / nEven));
  for (const k of kinks) { let kk = k % TAU; if (kk < 0) kk += TAU; set.add(kk); }
  const arr = Array.from(set).sort((a, b) => a - b);
  return Float64Array.from(arr);
}

/**
 * FEATURE-CONFORMING θ samples: the sorted kink θ-loci as segment ENDPOINTS, with each inter-kink segment
 * SUBDIVIDED into ceil(segWidth/targetDth) even pieces. Guarantees (a) every kink θ is a sample (a mesh vertex
 * ⇒ the kink is a chain of mesh edges, zero serration), and (b) no segment exceeds targetDth (uniform smooth-arc
 * chord control between kinks). Deduped against a min-gap so a kink coinciding with a subdivision node doesn't
 * make a zero-width sliver. Periodic: the wrap segment (last→first+TAU) is subdivided too.
 */
export function conformingThetas(kinks: number[], targetDth: number): Float64Array {
  const uniq: number[] = [];
  const norm = kinks.map((k) => { let kk = k % TAU; if (kk < 0) kk += TAU; return kk; }).sort((a, b) => a - b);
  const minGap = Math.min(1e-4, targetDth * 0.1);
  for (const k of norm) { if (uniq.length === 0 || k - uniq[uniq.length - 1] > minGap) uniq.push(k); }
  // ensure θ=0 is present (seam anchor) — snap the first kink to 0 if very close, else prepend 0.
  if (uniq.length === 0 || uniq[0] > minGap) uniq.unshift(0);
  const out: number[] = [];
  for (let i = 0; i < uniq.length; i++) {
    const a = uniq[i];
    const b = i + 1 < uniq.length ? uniq[i + 1] : uniq[0] + TAU; // wrap
    out.push(a);
    const w = b - a; const n = Math.max(1, Math.ceil(w / targetDth));
    for (let j = 1; j < n; j++) out.push(a + (w * j) / n);
  }
  // fold back into [0,TAU) and dedupe
  const set: number[] = [];
  for (let v of out) { v = v % TAU; if (v < 0) v += TAU; set.push(v); }
  set.sort((x, y) => x - y);
  const res: number[] = [];
  for (const v of set) { if (res.length === 0 || v - res[res.length - 1] > minGap) res.push(v); }
  return Float64Array.from(res);
}
