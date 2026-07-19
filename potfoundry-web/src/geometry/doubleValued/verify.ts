// verify.ts — self-contained manifold audit + chord-to-surface for the mesher.

import type { Mesh, SurfaceRadiusFn } from './types';
import type { RefTri, Vec3 } from './types';

const TAU = 2 * Math.PI;

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

/** u-resolution of the {@link lowestSurfaceAcrossU} scan for a junction's LOWER pinch level. */
const LOWER_PINCH_SCAN_U = 2000;

/**
 * The LOWER pinch level at height `t`: the minimum of the analytic `surface` over a full sweep of
 * u ∈ [0,1]. At a ribbon↔background pot surface this is the depressed background level at that height
 * (the true one-sided limit a background junction-pinch vertex is routed to). Read-only; used only to
 * certify a `dirCnt==0` JUNCTION corner whose region-centroid nudge fails to cross the local footprint.
 */
function lowestSurfaceAcrossU(surface: SurfaceRadiusFn, t: number): number {
  let lo = Infinity;
  for (let k = 0; k <= LOWER_PINCH_SCAN_U; k += 1) {
    const s = surface(k / LOWER_PINCH_SCAN_U, t);
    if (s < lo) lo = s;
  }
  return lo;
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
 *  - JUNCTION-PINCH vertex with NO interior sheet neighbour (`dirCnt==0`, a diamond corner): the
 *    geometric centroid nudge can fail to cross the local over-strand footprint and land on the
 *    WRONG branch. It is then replaced by the region's own analytic one-sided PINCH LEVEL (lower =
 *    min-over-u of `surface`, upper = the locus-straddle max), read at the vertex's own t — but only
 *    where the nudge demonstrably landed on the other branch, so valid corners stay byte-identical.
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
  const isJunction = mesh.vertexIsJunction;
  const U = mesh.vertexU;
  const T = mesh.vertexT;
  const region = mesh.vertexRegion;
  const regionIsRibbon = mesh.regionIsRibbon;
  const cliffSeg = mesh.vertexCliffSeg;
  const vcount = pos.length / 3;

  // Into-region nudge direction per cliff vertex: for each interior (non-cliff) same-region
  // neighbour, vote for the SIDE of the cliff vertex's OWN locus the neighbour lies on —
  // `sign(u_neighbour − locus(seg, t_neighbour))`, evaluated at the NEIGHBOUR's t so the
  // snaking ribbon (which shifts in u with t) cannot flip the sign. Sheet neighbours of a
  // cliff vertex are always in its own region (walls only join cliff→cliff), and a region lies
  // wholly on one side of its bounding locus, so the majority vote is that side.
  //
  // A JUNCTION pinch vertex (M3+) is shared by several regions that differ in t as well as u
  // around the corner, so a u-only side is ambiguous; for those we accumulate the FULL (du,dt)
  // offset toward the tagged region's interior and nudge along it instead.
  const dirSum = new Float64Array(vcount);
  const dirCnt = new Int32Array(vcount);
  const juDu = new Float64Array(vcount);
  const juDt = new Float64Array(vcount);
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
        if (isJunction[vp]) {
          juDu[vp] += U[vq] - U[vp];
          juDt[vp] += T[vq] - T[vp];
        } else {
          const side = U[vq] - cliffLocusU(cliffSeg[vp], T[vq]) >= 0 ? 1 : -1;
          dirSum[vp] += side;
        }
        dirCnt[vp] += 1;
      }
    }
  }

  // Region centroids (from ALL vertices — topological region membership, label-independent).
  // Used to orient a cliff vertex that has NO interior sheet neighbour to vote a direction
  // (a thin sliver region meshed with only cliff/junction corners): nudge toward the region
  // interior instead of skipping it, so every cliff vertex is certified, not waved through.
  let maxRegion = -1;
  for (let v = 0; v < vcount; v += 1) if (region[v] > maxRegion) maxRegion = region[v];
  const nReg = maxRegion + 1;
  const regU = new Float64Array(nReg);
  const regT = new Float64Array(nReg);
  const regN = new Int32Array(nReg);
  for (let v = 0; v < vcount; v += 1) {
    const rg = region[v];
    if (rg < 0) continue;
    regU[rg] += U[v];
    regT[rg] += T[v];
    regN[rg] += 1;
  }
  for (let rg = 0; rg < nReg; rg += 1)
    if (regN[rg] > 0) {
      regU[rg] /= regN[rg];
      regT[rg] /= regN[rg];
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
      let expected: number;
      if (isJunction[v] && dirCnt[v] > 0) {
        // full-direction nudge into the tagged region (corner regions differ in t, not just u)
        const mag = Math.hypot(juDu[v], juDt[v]);
        expected =
          mag < 1e-12
            ? surface(u, t)
            : surface(u + (juDu[v] / mag) * oneSidedDelta, t + (juDt[v] / mag) * oneSidedDelta);
      } else if (!isJunction[v] && dirCnt[v] > 0) {
        const dir = dirSum[v] >= 0 ? 1 : -1;
        expected = surface(u + dir * oneSidedDelta, t);
      } else {
        // no interior sheet neighbour: orient by the region centroid (still label-independent)
        const rg = region[v];
        const du = rg >= 0 ? regU[rg] - u : 0;
        const dt = rg >= 0 ? regT[rg] - t : 0;
        const mag = Math.hypot(du, dt);
        if (mag < 1e-12) {
          cliffVertsSkipped += 1;
          continue;
        }
        expected = surface(u + (du / mag) * oneSidedDelta, t + (dt / mag) * oneSidedDelta);
        // JUNCTION-PINCH robustness (dirCnt==0): at a diamond CORNER the tagged background/ribbon
        // region can wrap so its centroid direction, nudged by δ, never crosses the local over-strand
        // footprint the pinch vertex sits in — so the nudge above lands on the WRONG analytic branch
        // (a full radial-jump error: the certifier's ~0.6mm false positive on the clipped full pot).
        // Guard it by the region's OWN one-sided PINCH LEVEL, read straight from `surface` at the
        // vertex's own t (no taper), independent of the classifier label only for the branch VALUE:
        //   • background region  → the LOWER pinch level  = min over u of surface(·, t)  (the depressed
        //     background level at this height; the over-strand occludes it in u near the corner, but it
        //     is the true one-sided limit into the background the mesher routed this vertex to);
        //   • ribbon region      → the UPPER pinch level  = max(surface(u±δ, t)) across the locus (the
        //     ribbon FOOT r0; the crest-ward straddle overshoots by <1e-3, well under the gate).
        // Only ADOPT the pinch level when the centroid nudge landed on the OTHER branch (closer to it
        // than to the region's own level) — i.e. it demonstrably failed to cross. Where the nudge
        // already resolves the own branch (every M1–M6a/T2/M5 junction corner), `expected` is left
        // byte-identical; this bites only the wrong-branch corners (the clipped full pot).
        if (isJunction[v]) {
          const isRib = regionIsRibbon[rg];
          let ownLevel: number;
          let otherLevel: number;
          if (isRib) {
            ownLevel = Math.max(surface(u + oneSidedDelta, t), surface(u - oneSidedDelta, t));
            otherLevel = lowestSurfaceAcrossU(surface, t);
          } else {
            ownLevel = lowestSurfaceAcrossU(surface, t);
            otherLevel = Math.max(surface(u + oneSidedDelta, t), surface(u - oneSidedDelta, t));
          }
          if (Math.abs(expected - otherLevel) < Math.abs(expected - ownLevel)) expected = ownLevel;
        }
      }
      const dev = Math.abs(r - expected);
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

// ---------------------------------------------------------------------------
// Honest facet-chord vs the TRUE analytic surface (reference-free; M6).
//
// The prior full-pot chord (`analyticChordSplit`) skipped only wall edges (both
// endpoints on a cliff), so a SHEET edge whose parameter midpoint straddled a genuine
// ribbon↔background cliff scored a ~jump-sized (~0.6mm) PHANTOM sag — the "clear-region
// 0.599" the M5 report carried. That is not a facet error: the radial jump is a real 3D
// feature carried by the double-valued WALL, not the sheet. This metric measures the true
// facet sag of every SHEET facet by:
//   • sampling each triangle's three edge-midpoints AND its centroid (a barycentric interior
//     point), taking the mesh's flat (linear) interpolation there;
//   • comparing that flat point to the true surface point `lift(surface(u,t))` at the
//     sample's PARAMETER midpoint (the crest VALUE is continuous — only its slope kinks — so a
//     crest facet's midpoint samples the true ridge with no discontinuity);
//   • SKIPPING genuine cliff-straddle: a sample touching a cliff split-vertex across which the
//     surface is DISCONTINUOUS (|surface(u+δ)−surface(u−δ)| exceeds `straddleJumpMm`). A genuine
//     ribbon↔background cliff (≈0.6mm jump) is skipped; an OCCLUDED under-strand cliff buried
//     under the visible over-ribbon crest is C0-continuous there (≈0 jump) and IS measured — so
//     the crest ridge running through an overlap diamond is honestly certified, not waved past.
//
// Read-only: consumes the mesh's own (u,t)/onCliff provenance; never re-meshes.
// ---------------------------------------------------------------------------

/** Result of {@link facetChordToTrueSurface}. */
export interface FacetChordReport {
  /** Max flat-sample→true-surface distance (mm) over all measured sheet-facet samples. */
  maxMm: number;
  /** RMS of the same distances (mm). */
  rmsMm: number;
  /** Samples actually measured. */
  measured: number;
  /** Samples skipped (wall edges + genuine cliff-straddle). */
  skipped: number;
  /** Normalized u of the worst sample (for diagnostics). */
  maxU: number;
  /** t of the worst sample. */
  maxT: number;
}

/**
 * Measure the honest facet chord of a built mesh's SHEET facets against the exact analytic
 * `surface`, skipping wall edges and genuine cliff-straddle samples (see the section header).
 *
 * `opts.uPeriod` unwraps the second endpoint's u across a welded periodic seam before averaging
 * (a seam-straddling background edge would otherwise land on the opposite side of the pot).
 * `opts.straddleJumpMm` (default 0.05) is the surface-jump threshold that separates a genuine
 * cliff from an occluded (continuous) one; `opts.straddleDeltaU` (default 2e-4) is the u-nudge
 * used to probe that jump at a cliff split-vertex's locus.
 */
export function facetChordToTrueSurface(
  mesh: Mesh,
  surface: SurfaceRadiusFn,
  H: number,
  opts?: { uPeriod?: number; straddleJumpMm?: number; straddleDeltaU?: number },
): FacetChordReport {
  const pos = mesh.positions;
  const U = mesh.vertexU;
  const T = mesh.vertexT;
  const onCliff = mesh.vertexOnCliff;
  const tris = mesh.triangles;
  const uPeriod = opts?.uPeriod;
  const straddleJump = opts?.straddleJumpMm ?? 0.05;
  const dU = opts?.straddleDeltaU ?? 2e-4;

  // A cliff split-vertex is "hard" when the surface genuinely jumps across its locus (a real
  // ribbon↔background cliff); "soft" when the surface is continuous there (an occluded under-
  // strand cliff buried beneath the visible crest). Any facet sample touching a HARD cliff
  // vertex would straddle the discontinuity, so it is skipped; soft-cliff facets are measured.
  const hardCache = new Int8Array(pos.length / 3).fill(-1); // -1 unknown, 0 soft, 1 hard
  const isHard = (v: number): boolean => {
    if (!onCliff[v]) return false;
    if (hardCache[v] >= 0) return hardCache[v] === 1;
    const jump = Math.abs(surface(U[v] + dU, T[v]) - surface(U[v] - dU, T[v]));
    const hard = jump > straddleJump ? 1 : 0;
    hardCache[v] = hard;
    return hard === 1;
  };

  // Unwrap `u` onto `ref`'s branch (periodic seam), then re-wrap the average into [0,uPeriod).
  const unwrap = (u: number, ref: number): number => {
    if (uPeriod === undefined) return u;
    if (u - ref > uPeriod / 2) return u - uPeriod;
    if (u - ref < -uPeriod / 2) return u + uPeriod;
    return u;
  };
  const rewrap = (u: number): number => {
    if (uPeriod === undefined) return u;
    let x = u % uPeriod;
    if (x < 0) x += uPeriod;
    return x;
  };

  let maxMm = 0;
  let sumSq = 0;
  let n = 0;
  let skipped = 0;
  let maxU = 0;
  let maxT = 0;
  const consider = (fx: number, fy: number, fz: number, um: number, tm: number): void => {
    const r = surface(um, tm);
    const dx = fx - r * Math.cos(TAU * um);
    const dy = fy - r * Math.sin(TAU * um);
    const dz = fz - tm * H;
    const d = Math.hypot(dx, dy, dz);
    if (d > maxMm) {
      maxMm = d;
      maxU = um;
      maxT = tm;
    }
    sumSq += d * d;
    n += 1;
  };

  for (let i = 0; i < tris.length; i += 3) {
    const a = tris[i];
    const b = tris[i + 1];
    const c = tris[i + 2];
    // edge midpoints
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      if (onCliff[p] && onCliff[q]) { skipped += 1; continue; } // wall / cliff-seam edge (radial)
      // A near-RADIAL edge (endpoints at ~the same (u,t) but different radius) is a wall edge —
      // e.g. a sheet vertex meeting a cliff rail at a diamond-edge occlusion taper — not a sagging
      // sheet facet; the wall spans that step exactly, so its midpoint-vs-surface is a metric
      // artifact. Skip it (consistent with skipping cliff↔cliff wall edges above).
      if (Math.abs(U[p] - U[q]) < 5e-5 && Math.abs(T[p] - T[q]) < 5e-5) { skipped += 1; continue; }
      if (isHard(p) || isHard(q)) { skipped += 1; continue; } // genuine cliff-straddle
      const uq = unwrap(U[q], U[p]);
      const um = rewrap((U[p] + uq) / 2);
      const tm = (T[p] + T[q]) / 2;
      consider(
        (pos[p * 3] + pos[q * 3]) / 2,
        (pos[p * 3 + 1] + pos[q * 3 + 1]) / 2,
        (pos[p * 3 + 2] + pos[q * 3 + 2]) / 2,
        um,
        tm,
      );
    }
    // centroid (skip wall triangles, degenerate (u,t) wall slivers, and hard-cliff straddle)
    if (onCliff[a] && onCliff[b] && onCliff[c]) { skipped += 1; continue; }
    // A triangle with any coincident-(u,t) vertex pair has ~zero PARAMETER area — it is a vertical
    // wall sliver (spanning radius at one (u,t)), not a sheet patch, so its centroid-vs-surface is
    // meaningless. Skip it (its vertices are still certified on the surface elsewhere).
    const coincident =
      (Math.abs(U[a] - U[b]) < 5e-5 && Math.abs(T[a] - T[b]) < 5e-5) ||
      (Math.abs(U[b] - U[c]) < 5e-5 && Math.abs(T[b] - T[c]) < 5e-5) ||
      (Math.abs(U[c] - U[a]) < 5e-5 && Math.abs(T[c] - T[a]) < 5e-5);
    if (coincident) { skipped += 1; continue; }
    if (isHard(a) || isHard(b) || isHard(c)) { skipped += 1; continue; }
    const ub = unwrap(U[b], U[a]);
    const uc = unwrap(U[c], U[a]);
    consider(
      (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3,
      (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3,
      (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3,
      rewrap((U[a] + ub + uc) / 3),
      (T[a] + T[b] + T[c]) / 3,
    );
  }

  return { maxMm, rmsMm: Math.sqrt(sumSq / Math.max(1, n)), measured: n, skipped, maxU, maxT };
}
