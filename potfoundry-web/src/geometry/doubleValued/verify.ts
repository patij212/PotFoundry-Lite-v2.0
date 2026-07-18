// verify.ts — self-contained manifold audit + chord-to-surface for the mesher.

import type { Mesh, SurfaceRadiusFn } from './types';
import type { RefTri, Vec3 } from './types';

export interface ManifoldReport {
  /** Count of edges shared by more than two triangles (must be 0). */
  nonManifold: number;
  /** Count of edges used by exactly one triangle (open edges; the outer rim is allowed). */
  boundary: number;
  /**
   * Count of open edges that lie ALONG a cliff and are NOT on the declared-open rim:
   * i.e. both endpoints are cliff split-vertices and neither is a rim vertex. A closed
   * (wall-bridged) cliff has 0 of these — a crack along the cliff shows up here.
   */
  cliffBoundary: number;
  /**
   * Count of open edges with at least one endpoint OFF the domain rim. A correct patch
   * is open only on its rectangular rim, so this must be 0 — it catches ANY interior
   * hole (cliff crack or otherwise), a strict superset of `cliffBoundary`.
   */
  boundaryNonRim: number;
}

/**
 * Edge-use census over the triangle soup. Determines manifoldness and, using the
 * mesh's per-vertex cliff/rim tags, whether the cliff seam is watertight and whether
 * every open edge is on the rim.
 */
export function auditManifold(m: Mesh): ManifoldReport {
  const use = new Map<string, number>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const tris = m.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    const edgesOfTri: ReadonlyArray<readonly [number, number]> = [
      [tris[i], tris[i + 1]],
      [tris[i + 1], tris[i + 2]],
      [tris[i + 2], tris[i]],
    ];
    for (const [a, b] of edgesOfTri) {
      const k = key(a, b);
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }

  const onCliff = m.vertexOnCliff;
  const onRim = m.vertexOnRim;
  let nonManifold = 0;
  let boundary = 0;
  let cliffBoundary = 0;
  let boundaryNonRim = 0;
  for (const [k, count] of use) {
    if (count > 2) {
      nonManifold += 1;
      continue;
    }
    if (count === 1) {
      boundary += 1;
      const sep = k.indexOf(':');
      const a = Number(k.slice(0, sep));
      const b = Number(k.slice(sep + 1));
      if (onCliff[a] && onCliff[b] && !onRim[a] && !onRim[b]) cliffBoundary += 1;
      if (!onRim[a] || !onRim[b]) boundaryNonRim += 1;
    }
  }
  return { nonManifold, boundary, cliffBoundary, boundaryNonRim };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Squared point→triangle distance (Ericson, Real-Time Collision Detection §5.1.5). */
export function distPtTri2(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const q = add(a, ab, v);
    const d = sub(p, q);
    return dot(d, d);
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const q = add(a, ac, w);
    const d = sub(p, q);
    return dot(d, d);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    const q = add(b, sub(c, b), w);
    const d = sub(p, q);
    return dot(d, d);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  const q: Vec3 = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  const d = sub(p, q);
  return dot(d, d);
}

/** A uniform spatial grid indexing reference triangles by the cells their AABB overlaps. */
class TriGrid {
  private readonly cell: number;
  private readonly buckets = new Map<string, number[]>();
  constructor(
    private readonly tris: ReadonlyArray<RefTri>,
    cell: number,
  ) {
    this.cell = cell;
    for (let i = 0; i < tris.length; i += 1) {
      const [a, b, c] = tris[i];
      const xlo = Math.min(a[0], b[0], c[0]);
      const xhi = Math.max(a[0], b[0], c[0]);
      const ylo = Math.min(a[1], b[1], c[1]);
      const yhi = Math.max(a[1], b[1], c[1]);
      const zlo = Math.min(a[2], b[2], c[2]);
      const zhi = Math.max(a[2], b[2], c[2]);
      for (let ix = Math.floor(xlo / cell); ix <= Math.floor(xhi / cell); ix += 1)
        for (let iy = Math.floor(ylo / cell); iy <= Math.floor(yhi / cell); iy += 1)
          for (let iz = Math.floor(zlo / cell); iz <= Math.floor(zhi / cell); iz += 1) {
            const k = `${ix}:${iy}:${iz}`;
            const bucket = this.buckets.get(k);
            if (bucket) bucket.push(i);
            else this.buckets.set(k, [i]);
          }
    }
  }

  /** Nearest squared distance from `p` to any indexed triangle (ring-expanding search). */
  nearest2(p: Vec3): number {
    const cx = Math.floor(p[0] / this.cell);
    const cy = Math.floor(p[1] / this.cell);
    const cz = Math.floor(p[2] / this.cell);
    let best = Infinity;
    const seen = new Set<number>();
    for (let r = 0; r <= 8; r += 1) {
      for (let ix = cx - r; ix <= cx + r; ix += 1)
        for (let iy = cy - r; iy <= cy + r; iy += 1)
          for (let iz = cz - r; iz <= cz + r; iz += 1) {
            // only the freshly-added shell of the ring
            if (r > 0 && Math.abs(ix - cx) !== r && Math.abs(iy - cy) !== r && Math.abs(iz - cz) !== r) continue;
            const bucket = this.buckets.get(`${ix}:${iy}:${iz}`);
            if (!bucket) continue;
            for (const ti of bucket) {
              if (seen.has(ti)) continue;
              seen.add(ti);
              const [a, b, c] = this.tris[ti];
              const d2 = distPtTri2(p, a, b, c);
              if (d2 < best) best = d2;
            }
          }
      // once we have a hit and the next ring is farther than the best found, stop
      if (best !== Infinity && r * this.cell > Math.sqrt(best)) break;
    }
    return best;
  }
}

/**
 * Index a reference triangle soup and return a closure giving the (Euclidean) distance
 * from a query point to the nearest reference triangle. Reused by the refine loop and by
 * `chordToSurface`, so the grid is built once.
 */
export function buildTriDistance(refTris: ReadonlyArray<RefTri>): (p: Vec3) => number {
  if (refTris.length === 0) return () => Infinity;
  let edgeSum = 0;
  const sample = Math.min(refTris.length, 500);
  for (let i = 0; i < sample; i += 1) {
    const [a, b] = refTris[Math.floor((i * refTris.length) / sample)];
    edgeSum += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  const cell = Math.max(0.2, (edgeSum / sample) * 2);
  const grid = new TriGrid(refTris, cell);
  return (p: Vec3) => Math.sqrt(grid.nearest2(p));
}

export interface ChordReport {
  maxMm: number;
  rmsMm: number;
}

/**
 * Max/RMS distance from the mesh (its vertices AND every triangle edge-midpoint) to a
 * dense reference triangle soup of the TRUE surface. The reference is built by the
 * caller (analytic sheets sampled fine + wall ruled faces from the lips). Distance is
 * measured GEOMETRICALLY (nearest reference triangle), so it never samples the
 * discontinuous radius across a cliff.
 */
export function chordToSurface(mesh: Mesh, refTris: ReadonlyArray<RefTri>): ChordReport {
  if (refTris.length === 0) return { maxMm: Infinity, rmsMm: Infinity };
  const dist = buildTriDistance(refTris);
  const pos = mesh.positions;
  const vert = (i: number): Vec3 => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  let maxMm = 0;
  let sumSq = 0;
  let n = 0;
  const consider = (p: Vec3): void => {
    const d = dist(p);
    if (d > maxMm) maxMm = d;
    sumSq += d * d;
    n += 1;
  };

  const vcount = pos.length / 3;
  for (let i = 0; i < vcount; i += 1) consider(vert(i));

  const tris = mesh.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    const a = vert(tris[i]);
    const b = vert(tris[i + 1]);
    const c = vert(tris[i + 2]);
    consider([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    consider([(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2]);
    consider([(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2]);
  }

  return { maxMm, rmsMm: Math.sqrt(sumSq / Math.max(1, n)) };
}

// ---------------------------------------------------------------------------
// Independent (classifier-free) certification against the TRUE analytic surface.
//
// WHY the geometric chord gate above cannot certify the classifier: the reference soup
// includes each cliff's WALL ruled-face, which spans the entire radial jump lower↔upper.
// A cliff vertex mis-lifted to the wrong lip (a swapped ribbon/background label) still lands
// ON that ruled-face, so its nearest-triangle distance stays ~0 — the swap is invisible to
// `chordToSurface`. The checks below instead pin each cliff vertex to the ONE-SIDED analytic
// limit taken from INSIDE its own region, where a swap is a full-jump-sized spike.
// ---------------------------------------------------------------------------

/** u-distance from (u,t) to the nearest declared cliff locus at height t (for the straddle guard). */
export type CliffLocusDistance = (u: number, t: number) => number;

/**
 * Normalized u of cliff SEGMENT `seg` (in `complex.segments` order) at height t. Used to
 * measure a neighbour's side against the cliff CURVE at the neighbour's own t, which is
 * snake-robust: a snaking ribbon shifts in u with t, so comparing a neighbour's bare u to the
 * cliff vertex's u mis-orders genuine interior neighbours a row away.
 */
export type CliffLocusU = (seg: number, t: number) => number;

/** Result of {@link certifyAgainstTrueSurface}. */
export interface SurfaceCertReport {
  /** Max |hypot(x,y) − surface(u,t)| over interior SHEET vertices (near-cliff ones skipped). */
  maxSheetDevMm: number;
  /** Max |radius − surface one-sided limit into the vertex's OWN region| over CLIFF vertices. */
  maxCliffDevMm: number;
  /** SHEET vertices actually measured. */
  sheetVertsChecked: number;
  /** CLIFF vertices certified (an interior same-region neighbour oriented the one-sided limit). */
  cliffVertsCertified: number;
  /** CLIFF vertices skipped for lack of an interior neighbour. Must be 0 for a full cert. */
  cliffVertsSkipped: number;
}

/**
 * Certify a built mesh's vertices directly against the true analytic `surface`, WITHOUT
 * routing through the mesher's region classifier (the classifier's only effect is which lip
 * radius each cliff vertex takes — every sheet vertex is lifted straight to `surface(u,t)`).
 *
 *  - SHEET vertex (not on a cliff, and farther than `oneSidedDelta` in u from any cliff
 *    locus): its cylindrical radius `hypot(x,y)` must equal `surface(u,t)`. Certifies the
 *    interior lift is on the true surface; the near-cliff skip is the straddle guard.
 *  - CLIFF vertex (a split copy sitting on a locus): its radius must equal the ONE-SIDED
 *    limit `surface(u ∓ δ, t)` taken from INSIDE its own region. The nudge DIRECTION is read
 *    from mesh geometry — which side of the vertex's OWN cliff locus its interior same-region
 *    sheet neighbours fall on (measured against the locus at each neighbour's own t, so the
 *    ribbon's snake does not mis-order them) — so the expected value is classifier-independent.
 *    A swapped label makes the vertex take the wrong lip while the geometric limit is
 *    unchanged ⇒ the deviation spikes by the radial jump.
 *
 * (u,t), region and cliff-segment come from the mesh's read-only provenance arrays
 * (independent of the label); `surface` is the analytic ground truth (`buildAnalyticRadiusFn`).
 */
export function certifyAgainstTrueSurface(
  mesh: Mesh,
  surface: SurfaceRadiusFn,
  cliffLocusDistance: CliffLocusDistance,
  cliffLocusU: CliffLocusU,
  oneSidedDelta: number,
): SurfaceCertReport {
  const pos = mesh.positions;
  const onCliff = mesh.vertexOnCliff;
  const U = mesh.vertexU;
  const T = mesh.vertexT;
  const region = mesh.vertexRegion;
  const cliffSeg = mesh.vertexCliffSeg;
  const vcount = pos.length / 3;

  // Into-region nudge direction per cliff vertex: for each interior (non-cliff) same-region
  // neighbour, vote for the SIDE of the cliff vertex's OWN locus the neighbour lies on —
  // `sign(u_neighbour − locus(seg, t_neighbour))`, evaluated at the NEIGHBOUR's t so the
  // snaking ribbon (which shifts in u with t) cannot flip the sign. Sheet neighbours of a
  // cliff vertex are always in its own region (walls only join cliff→cliff), and a region lies
  // wholly on one side of its bounding locus, so the majority vote is that side.
  const dirSum = new Float64Array(vcount);
  const dirCnt = new Int32Array(vcount);
  const tris = mesh.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    const tri: readonly [number, number, number] = [tris[i], tris[i + 1], tris[i + 2]];
    for (let p = 0; p < 3; p += 1) {
      const vp = tri[p];
      if (!onCliff[vp] || cliffSeg[vp] < 0) continue;
      for (let q = 0; q < 3; q += 1) {
        if (q === p) continue;
        const vq = tri[q];
        if (onCliff[vq] || region[vq] !== region[vp]) continue;
        const side = U[vq] - cliffLocusU(cliffSeg[vp], T[vq]) >= 0 ? 1 : -1;
        dirSum[vp] += side;
        dirCnt[vp] += 1;
      }
    }
  }

  let maxSheetDevMm = 0;
  let maxCliffDevMm = 0;
  let sheetVertsChecked = 0;
  let cliffVertsCertified = 0;
  let cliffVertsSkipped = 0;

  for (let v = 0; v < vcount; v += 1) {
    const x = pos[v * 3];
    const y = pos[v * 3 + 1];
    const r = Math.hypot(x, y);
    const u = U[v];
    const t = T[v];
    if (!onCliff[v]) {
      if (cliffLocusDistance(u, t) <= oneSidedDelta) continue; // straddle guard: skip near-cliff sheet points
      const dev = Math.abs(r - surface(u, t));
      if (dev > maxSheetDevMm) maxSheetDevMm = dev;
      sheetVertsChecked += 1;
    } else {
      if (dirCnt[v] === 0) {
        cliffVertsSkipped += 1;
        continue;
      }
      const dir = dirSum[v] >= 0 ? 1 : -1;
      const dev = Math.abs(r - surface(u + dir * oneSidedDelta, t));
      if (dev > maxCliffDevMm) maxCliffDevMm = dev;
      cliffVertsCertified += 1;
    }
  }

  return { maxSheetDevMm, maxCliffDevMm, sheetVertsChecked, cliffVertsCertified, cliffVertsSkipped };
}

/** Per-label mean-radius summary returned by {@link regionRadiusConsistency}. */
export interface RegionRadiusStats {
  /** Min mean cylindrical radius over classifier-labeled RIBBON regions (+Infinity if none). */
  minRibbonMeanRadiusMm: number;
  /** Max mean cylindrical radius over classifier-labeled BACKGROUND regions (−Infinity if none). */
  maxBackgroundMeanRadiusMm: number;
  ribbonRegionCount: number;
  backgroundRegionCount: number;
}

/**
 * Cross-check the classifier's per-region label against the label-INDEPENDENT geometry:
 * mean cylindrical radius per region, split by ribbon/background label. Because interior
 * sheet lifts (which dominate the mean) never consult the label, a correct classifier must
 * give every ribbon (raised) region a mean radius above every background (depressed) region's.
 * A swapped label points "ribbon" at a depressed region and inverts the ordering.
 */
export function regionRadiusConsistency(mesh: Mesh): RegionRadiusStats {
  const pos = mesh.positions;
  const region = mesh.vertexRegion;
  const isRib = mesh.regionIsRibbon;
  const nReg = isRib.length;
  const sum = new Float64Array(nReg);
  const cnt = new Int32Array(nReg);
  const vcount = pos.length / 3;
  for (let v = 0; v < vcount; v += 1) {
    const reg = region[v];
    if (reg < 0 || reg >= nReg) continue;
    sum[reg] += Math.hypot(pos[v * 3], pos[v * 3 + 1]);
    cnt[reg] += 1;
  }
  let minRibbonMeanRadiusMm = Infinity;
  let maxBackgroundMeanRadiusMm = -Infinity;
  let ribbonRegionCount = 0;
  let backgroundRegionCount = 0;
  for (let r = 0; r < nReg; r += 1) {
    if (cnt[r] === 0) continue;
    const mean = sum[r] / cnt[r];
    if (isRib[r]) {
      ribbonRegionCount += 1;
      if (mean < minRibbonMeanRadiusMm) minRibbonMeanRadiusMm = mean;
    } else {
      backgroundRegionCount += 1;
      if (mean > maxBackgroundMeanRadiusMm) maxBackgroundMeanRadiusMm = mean;
    }
  }
  return { minRibbonMeanRadiusMm, maxBackgroundMeanRadiusMm, ribbonRegionCount, backgroundRegionCount };
}
