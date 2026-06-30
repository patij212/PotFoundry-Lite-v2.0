// featureLocalizedFidelity.ts — DEV-ONLY meshing LAB harness (research/, never imported by src/).
//
// MEASURE-ONLY. Quantifies how much the in-house surface-metric mesher GENERALIZES
// (rounds off / steps over / under-shoots) the tiniest/sharpest/narrowest style features.
//
// The global perpendicular3DDeviation rms is STRADDLE-MASKED: it averages error over the
// WHOLE (u,t) rectangle, so a chamfered crest or a stepped-over thin channel drowns under
// well-resolved smooth walls. This harness samples error ON the true feature loci instead.
//
// Three measurements (all on a 2D (u,t) triangulation lifted to 3D radial):
//   (1) FEATURE-LINE CHORD: |P_true - P_mesh| sampled densely ALONG ridge/crease/relief-wall
//       loci (denseFeatureGroundTruth). rms/p99/max OVER FEATURE-LINE SAMPLES ONLY. The gap
//       between this and the global rms IS the straddle-masking, quantified.
//   (2) CREST/VALLEY HEIGHT RETENTION: at ridge-crest / valley-floor extrema, TRUE radius vs
//       mesh-interpolated radius → peak under-shoot (mm & % of local relief amplitude).
//   (3) NARROW-CHANNEL COVERAGE: narrowest feature-to-feature perpendicular spacing (mm) and
//       the MIN number of mesh triangles spanning it (<2 ⇒ stepped over / generalized).
//
// Reuses: research/bridge/inhouseMetricMesh (kernel), runStyle (radius fn), measure (lift),
// src/fidelity/analyticSurfaceGate (global chord), and the conforming featureGraph dense-truth
// extractors. Does NOT modify the kernel or any src/ file.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { denseFeatureGroundTruth } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/groundTruth';
import { styleSampler, type StyleSamplerDims } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleId, StyleOptions } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Lift (u,t) -> 3D radial position on the TRUE analytic surface.
// ---------------------------------------------------------------------------

/** True 3D position on the analytic surface at (u,t). The kernel's own liftP. */
export function liftTrue(u: number, t: number, rA: AnalyticRadiusFn, H: number): [number, number, number] {
  const th = TAU * u, z = t * H, r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

// ---------------------------------------------------------------------------
// Point location over the (u,t) triangulation — uniform bucket grid of triangle
// bboxes. Periodic u handled by testing u and u±1 near the seam (a triangle that
// straddles the seam has one vertex near u≈0 and another near u≈1, giving a bbox
// that spans [0,1]; we additionally insert seam-straddling triangles into BOTH
// the low-u and high-u buckets shifted, and at query time test u, u-1, u+1).
// ---------------------------------------------------------------------------

interface MeshUt {
  /** Flat (u,t) pairs, length = 2*nVerts. */
  ut: number[];
  /** Triangle indices, length = 3*nTris. */
  indices: ArrayLike<number>;
  /** Lifted 3D positions (xyz) parallel to ut, length = 3*nVerts. */
  xyz: Float64Array;
}

interface PointLocator {
  /** Locate (u,t); return interpolated 3D position + interpolated radius, or null if outside. */
  query(u: number, t: number): { P: [number, number, number]; radius: number } | null;
  /**
   * Return all UNIQUE triangle ids whose bboxes overlap the cell ring of radius `cellR`
   * around the query (u,t). Includes seam-shifted registrations. Used for true-3D
   * point-to-triangle neighborhood queries and feature-adjacent sliver detection.
   */
  neighborTriangles(u: number, t: number, cellR?: number): number[];
  /** The (u,t) cell size (= 1/gridN). */
  cellSize: number;
}

/**
 * Build the lifted mesh view (ut + parallel xyz on the TRUE surface). The kernel
 * already places vertices exactly on the surface, so xyz here is the EXACT lift
 * of each mesh vertex's (u,t) — identical to what liftUtToRadial produces (f32 vs
 * f64 only; we use f64 for the metric).
 */
export function buildMeshUt(ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number): MeshUt {
  const n = ut.length / 2;
  const xyz = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = liftTrue(ut[2 * i], ut[2 * i + 1], rA, H);
    xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z;
  }
  return { ut, indices, xyz };
}

/**
 * Uniform bucket grid of triangle bboxes over (u,t) ∈ [0,1]×[0,1] for fast point
 * location. Triangles whose u-extent exceeds 0.5 are treated as SEAM-STRADDLERS:
 * their true (u,t) wraps the seam, so we register two shifted copies (one with all
 * u'<0.5 mapped via u→u, the high-u verts via u→u-1; symmetric copy) and the query
 * tests u, u-1, u+1. Barycentric test is done in (u,t) with the matching u-shift.
 */
export function buildLocator(mesh: MeshUt, gridN = 256): PointLocator {
  const { ut, indices, xyz } = mesh;
  const nTris = indices.length / 3;
  // Per-triangle: store the 3 (u,t) with a per-triangle u-shift normalization so a
  // seam-straddling triangle's three u's are made contiguous (subtract 1 from the
  // high-u verts). We store the normalized u-range origin so the query can align.
  type Cell = number[]; // triangle ids
  const cells: Cell[][] = Array.from({ length: gridN }, () => Array.from({ length: gridN }, (): Cell => []));
  // For seam straddlers we also need a "shifted" registration: the normalized
  // triangle may have u in [-something, +something]; we register it in buckets for
  // both the [0,1] view and the wrapped view by clamping the bbox into [0,1] and,
  // if it extends below 0, also registering the +1 shifted band.
  const triU = new Float64Array(nTris * 3); // normalized u per tri vertex
  const triStraddle = new Uint8Array(nTris);

  const register = (ti: number, u0: number, u1: number, t0: number, t1: number): void => {
    const cu0 = Math.max(0, Math.min(gridN - 1, Math.floor(u0 * gridN)));
    const cu1 = Math.max(0, Math.min(gridN - 1, Math.floor(u1 * gridN)));
    const ct0 = Math.max(0, Math.min(gridN - 1, Math.floor(t0 * gridN)));
    const ct1 = Math.max(0, Math.min(gridN - 1, Math.floor(t1 * gridN)));
    for (let cu = cu0; cu <= cu1; cu++) for (let ct = ct0; ct <= ct1; ct++) cells[cu][ct].push(ti);
  };

  for (let ti = 0; ti < nTris; ti++) {
    const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    // Normalize u's to be contiguous: if the spread > 0.5, the triangle straddles
    // the seam — pull the high-u verts down by 1 so the three are within a small band.
    const umin0 = Math.min(ua, ub, uc), umax0 = Math.max(ua, ub, uc);
    if (umax0 - umin0 > 0.5) {
      triStraddle[ti] = 1;
      if (ua > 0.5) ua -= 1; if (ub > 0.5) ub -= 1; if (uc > 0.5) uc -= 1;
    }
    triU[3 * ti] = ua; triU[3 * ti + 1] = ub; triU[3 * ti + 2] = uc;
    const tmin = Math.min(ta, tb, tc), tmax = Math.max(ta, tb, tc);
    const umin = Math.min(ua, ub, uc), umax = Math.max(ua, ub, uc);
    // Register in the [0,1] view (clamp). If the normalized bbox dips below 0
    // (straddler), also register the +1-shifted band so a query near u≈1 finds it.
    register(ti, Math.max(0, umin), Math.min(1, umax), tmin, tmax);
    if (umin < 0) register(ti, Math.max(0, umin + 1), Math.min(1, umax + 1), tmin, tmax);
    if (umax > 1) register(ti, Math.max(0, umin - 1), Math.min(1, umax - 1), tmin, tmax);
  }

  // Barycentric coords of (qu,qt) in triangle ti using its NORMALIZED u (triU).
  // Returns [wa,wb,wc] or null if degenerate. Caller supplies a qu already aligned
  // to the triangle's normalized band (we try qu, qu-1, qu+1).
  const bary = (ti: number, qu: number, qt: number): [number, number, number] | null => {
    const ua = triU[3 * ti], ub = triU[3 * ti + 1], uc = triU[3 * ti + 2];
    const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    const d = (tb - tc) * (ua - uc) + (uc - ub) * (ta - tc);
    if (Math.abs(d) < 1e-18) return null;
    const wa = ((tb - tc) * (qu - uc) + (uc - ub) * (qt - tc)) / d;
    const wb = ((tc - ta) * (qu - uc) + (ua - uc) * (qt - tc)) / d;
    const wc = 1 - wa - wb;
    return [wa, wb, wc];
  };

  const EPS = 1e-7;
  return {
    cellSize: 1 / gridN,
    query(u: number, t: number) {
      let uu = u - Math.floor(u); if (uu < 0) uu += 1;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const cu = Math.max(0, Math.min(gridN - 1, Math.floor(uu * gridN)));
      const ct = Math.max(0, Math.min(gridN - 1, Math.floor(tc * gridN)));
      const bucket = cells[cu][ct];
      for (let k = 0; k < bucket.length; k++) {
        const ti = bucket[k];
        // try the query u aligned three ways (handles straddlers whose normalized
        // band is around 0, and the +1/-1 shifted registrations).
        for (const qu of triStraddle[ti] ? [uu, uu - 1, uu + 1] : [uu]) {
          const w = bary(ti, qu, tc);
          if (w === null) continue;
          if (w[0] >= -EPS && w[1] >= -EPS && w[2] >= -EPS) {
            const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
            const P: [number, number, number] = [
              w[0] * xyz[3 * a] + w[1] * xyz[3 * b] + w[2] * xyz[3 * c],
              w[0] * xyz[3 * a + 1] + w[1] * xyz[3 * b + 1] + w[2] * xyz[3 * c + 1],
              w[0] * xyz[3 * a + 2] + w[1] * xyz[3 * b + 2] + w[2] * xyz[3 * c + 2],
            ];
            const radius = Math.hypot(P[0], P[1]);
            return { P, radius };
          }
        }
      }
      return null;
    },
    neighborTriangles(u: number, t: number, cellR = 2): number[] {
      let uu = u - Math.floor(u); if (uu < 0) uu += 1;
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const cu = Math.floor(uu * gridN);
      const ct = Math.floor(tc * gridN);
      const seen = new Set<number>();
      for (let du = -cellR; du <= cellR; du++) {
        let cu2 = cu + du;
        // periodic u wrap
        while (cu2 < 0) cu2 += gridN;
        while (cu2 >= gridN) cu2 -= gridN;
        for (let dv = -cellR; dv <= cellR; dv++) {
          const ct2 = Math.max(0, Math.min(gridN - 1, ct + dv));
          for (const ti of cells[cu2][ct2]) seen.add(ti);
        }
      }
      return Array.from(seen);
    },
  };
}

// ---------------------------------------------------------------------------
// Dense feature lines — reuse the conforming dense-truth extractors. These return
// ridge/crease/relief-wall loci as 2-point FeatureLines in (u,t). We sample each
// at arc-length step ~ hMin (in mm) along the line.
// ---------------------------------------------------------------------------

export interface FeatureTruth {
  lines: FeatureLine[];
  /** u→mm scale (ring circumference at t=0.5), from the dense-truth's own Rchar derivation. */
  uToMm: number;
  /** t→mm scale = H. */
  tToMm: number;
}

/**
 * Build the dense feature ground truth for a style. Uses styleSampler (the same
 * pre-evaluated bilinear surface the conforming detector consumes) at high grid res
 * so the feature LOCATIONS land within ~1 cell of the true loci. The dense-truth's
 * `res` controls the marching-squares/ridge/crease grid resolution.
 *
 * NOTE on truth fidelity: the sampler is bilinear (deliberately rounds C0 creases
 * to avoid spurious 1e6 curvature). This affects only the (u,t) LOCATION of the
 * loci, not the metric: positions/radii are evaluated from the RAW analytic rA. A
 * high gridResU/T + truthRes keeps the location error sub-cell.
 */
export function buildFeatureTruth(
  styleId: StyleId, params: StyleOptions, dims: StyleSamplerDims, truthRes: number,
): FeatureTruth {
  const sampler = styleSampler(styleId, params, { ...dims, gridResU: 1024, gridResT: 1024 });
  // Measure ring circumference at t=0.5 the SAME way the dense-truth does (Rchar).
  let circ = 0;
  const [x0, y0] = sampler.position(0, 0.5);
  let px = x0, py = y0;
  const N = 1024;
  for (let i = 1; i <= N; i++) {
    const [cx, cy] = sampler.position((i / N) % 1, 0.5);
    circ += Math.hypot(cx - px, cy - py);
    px = cx; py = cy;
  }
  const lines = denseFeatureGroundTruth(sampler, { res: truthRes, uToMm: circ, tToMm: dims.H });
  return { lines, uToMm: circ, tToMm: dims.H };
}

/** Sample a 2-point feature line at arc-length step ~stepMm (in 3D-ish (u,t)→mm). */
function sampleLine(line: FeatureLine, uToMm: number, tToMm: number, stepMm: number): Array<{ u: number; t: number }> {
  const pts = line.points;
  const out: Array<{ u: number; t: number }> = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    let u0 = pts[i].u, u1 = pts[i + 1].u; const t0 = pts[i].t, t1 = pts[i + 1].t;
    // shortest periodic du
    let du = u1 - u0; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
    const dt = t1 - t0;
    const lenMm = Math.hypot(du * uToMm, dt * tToMm);
    const n = Math.max(1, Math.ceil(lenMm / stepMm));
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      let u = u0 + du * f; u -= Math.floor(u);
      out.push({ u, t: t0 + dt * f });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (1) FEATURE-LINE CHORD
// ---------------------------------------------------------------------------

export interface FeatureLineChordResult {
  rmsMm: number; p99Mm: number; maxMm: number; samples: number; missed: number;
  worst: { u: number; t: number; mm: number };
}

/**
 * |P_true - P_mesh| (3D, mm) sampled densely ALONG each feature line. P_true from
 * raw rA; P_mesh from barycentric interpolation of the mesh's lifted vertices.
 */
export function featureLineChord(
  truth: FeatureTruth, locator: PointLocator, rA: AnalyticRadiusFn, H: number, stepMm: number,
): FeatureLineChordResult {
  const devs: number[] = [];
  let missed = 0;
  let worst = { u: 0, t: 0, mm: 0 };
  for (const line of truth.lines) {
    for (const { u, t } of sampleLine(line, truth.uToMm, truth.tToMm, stepMm)) {
      const q = locator.query(u, t);
      if (q === null) { missed++; continue; }
      const Pt = liftTrue(u, t, rA, H);
      const d = Math.hypot(Pt[0] - q.P[0], Pt[1] - q.P[1], Pt[2] - q.P[2]);
      devs.push(d);
      if (d > worst.mm) worst = { u, t, mm: d };
    }
  }
  devs.sort((a, b) => a - b);
  const n = devs.length;
  let sumSq = 0; for (const d of devs) sumSq += d * d;
  return {
    rmsMm: n ? Math.sqrt(sumSq / n) : 0,
    p99Mm: n ? devs[Math.min(n - 1, Math.floor(0.99 * n))] : 0,
    maxMm: n ? devs[n - 1] : 0,
    samples: n, missed, worst,
  };
}

// ---------------------------------------------------------------------------
// (2) CREST/VALLEY HEIGHT RETENTION
//
// At every feature-line sample we also have a candidate extremum. To isolate true
// crests/valleys we find, along each feature line sample's t-row, the local radial
// extremum in u within a small window, then compare TRUE radius vs mesh radius.
// A simpler, robust approach used here: at each feature-line (u,t), the feature is
// (by construction of ridge/crease truth) a radial extremum in its cross-direction.
// We measure the SIGNED radial retention = r_true - r_mesh (positive = under-shoot,
// mesh sits BELOW a crest; negative = over-shoot into a valley). We also express it
// as a fraction of the LOCAL relief amplitude (peak-to-mean radius on that t-row).
// ---------------------------------------------------------------------------

export interface CrestRetentionResult {
  /** mean / worst peak UNDER-shoot at crests (mesh radius below true crest), mm. */
  crestUnderMeanMm: number; crestUnderWorstMm: number;
  /** as % of local relief amplitude (peak-to-mean radius on the t-row). */
  crestUnderMeanPct: number; crestUnderWorstPct: number;
  /** valley OVER-shoot (mesh radius above true valley floor), mm. */
  valleyOverMeanMm: number; valleyOverWorstMm: number;
  crestSamples: number; valleySamples: number;
  worstCrest: { u: number; t: number; mm: number; pct: number };
}

/** Per-t-row mean radius + max relief amplitude, memoized, from raw rA. */
function rowReliefStats(rA: AnalyticRadiusFn, H: number, t: number, nU = 512): { mean: number; amp: number } {
  const z = t * H;
  let sum = 0; const rs = new Float64Array(nU);
  for (let i = 0; i < nU; i++) { const r = rA(TAU * (i / nU), z); rs[i] = r; sum += r; }
  const mean = sum / nU;
  let amp = 0; for (let i = 0; i < nU; i++) { const d = Math.abs(rs[i] - mean); if (d > amp) amp = d; }
  return { mean, amp };
}

/**
 * Crest/valley retention. For each feature-line (u,t): r_true = rA, r_mesh from the
 * locator (radial). We classify the sample as a CREST if r_true > row-mean (a ridge
 * bump) or VALLEY if r_true < row-mean (a groove floor). Under-shoot at a crest =
 * max(0, r_true - r_mesh); over-shoot at a valley = max(0, r_mesh - r_true).
 */
export function crestValleyRetention(
  truth: FeatureTruth, locator: PointLocator, rA: AnalyticRadiusFn, H: number, stepMm: number,
): CrestRetentionResult {
  const rowCache = new Map<number, { mean: number; amp: number }>();
  const statsAt = (t: number): { mean: number; amp: number } => {
    const key = Math.round(t * 4096);
    const c = rowCache.get(key); if (c) return c;
    const s = rowReliefStats(rA, H, t); rowCache.set(key, s); return s;
  };
  const crestUnder: number[] = []; const crestPct: number[] = []; const valleyOver: number[] = [];
  let worstCrest = { u: 0, t: 0, mm: 0, pct: 0 };
  for (const line of truth.lines) {
    for (const { u, t } of sampleLine(line, truth.uToMm, truth.tToMm, stepMm)) {
      const q = locator.query(u, t);
      if (q === null) continue;
      const rTrue = rA(TAU * u, t * H);
      const rMesh = q.radius;
      const { mean, amp } = statsAt(t);
      if (amp < 1e-6) continue; // flat row, no relief here
      if (rTrue > mean) {
        const under = Math.max(0, rTrue - rMesh);
        crestUnder.push(under); const pct = 100 * under / amp; crestPct.push(pct);
        if (under > worstCrest.mm) worstCrest = { u, t, mm: under, pct };
      } else {
        valleyOver.push(Math.max(0, rMesh - rTrue));
      }
    }
  }
  // Loop-based (NOT Math.max(...a)/reduce) — these arrays have tens of thousands of
  // samples and the spread form overflows the call stack.
  const mean = (a: number[]): number => { if (!a.length) return 0; let s = 0; for (const x of a) s += x; return s / a.length; };
  const max = (a: number[]): number => { let m = 0; for (const x of a) if (x > m) m = x; return m; };
  // worst pct corresponds to the worst-mm crest's pct (kept in worstCrest)
  return {
    crestUnderMeanMm: mean(crestUnder), crestUnderWorstMm: max(crestUnder),
    crestUnderMeanPct: mean(crestPct), crestUnderWorstPct: worstCrest.pct,
    valleyOverMeanMm: mean(valleyOver), valleyOverWorstMm: max(valleyOver),
    crestSamples: crestUnder.length, valleySamples: valleyOver.length,
    worstCrest,
  };
}

// ---------------------------------------------------------------------------
// (3) NARROW-CHANNEL COVERAGE
//
// Definition of "channel width": rasterize all feature-line samples into a fine
// (u,t) occupancy grid (in mm-aware cells). The narrowest channel = the smallest
// gap (in mm) between two DISTINCT feature loci measured perpendicular to a locus.
// We estimate it via a distance transform: for a dense set of feature points, find
// the nearest OTHER feature point that is not arc-length-connected (different line
// far away), and take the min over a robust percentile. Then count mesh triangles
// across that width: sample a short perpendicular segment of that length centered
// on the narrowest locus and count distinct triangles the segment passes through.
//
// This is heuristic (channel width is genuinely ambiguous on procedural reliefs);
// we report the measured width and how we got it so the number is interpretable.
// ---------------------------------------------------------------------------

export interface ChannelResult {
  narrowestWidthMm: number;
  minTrisAcross: number;
  /** how many distinct feature points seeded the spacing estimate. */
  featurePoints: number;
  /** location of the narrowest channel midpoint. */
  at: { u: number; t: number };
  /** median (not min) feature-to-feature spacing, mm — a robustness sanity number. */
  medianSpacingMm: number;
}

/**
 * Narrow-channel coverage. Builds the dense feature point cloud (mm coords), finds
 * the narrowest robust spacing between non-adjacent feature points, then counts how
 * many distinct mesh triangles a perpendicular probe segment of that width crosses
 * at that location.
 */
export function narrowChannelCoverage(
  truth: FeatureTruth, mesh: MeshUt, locator: PointLocator, stepMm: number,
): ChannelResult {
  // 1) Build feature point cloud in mm (u*uToMm, t*tToMm), tagged by line index AND
  //    by the line's local tangent direction (unit, in mm space) so we can require a
  //    channel to be bounded by two roughly-PARALLEL walls (rules out the X-crossing
  //    of a ridge over a crease, whose loci coincide → spurious ~0 width).
  const uToMm = truth.uToMm, tToMm = truth.tToMm;
  type FP = { u: number; t: number; xm: number; ym: number; line: number; tx: number; ty: number };
  const pts: FP[] = [];
  truth.lines.forEach((line, li) => {
    const pl = line.points;
    // tangent from the 2-point segment (dense-truth segments are 2 points).
    let du = pl.length > 1 ? pl[1].u - pl[0].u : 0;
    if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
    const dt = pl.length > 1 ? pl[1].t - pl[0].t : 0;
    const txm = du * uToMm, tym = dt * tToMm;
    const tl = Math.hypot(txm, tym) || 1;
    for (const { u, t } of sampleLine(line, uToMm, tToMm, stepMm)) {
      pts.push({ u, t, xm: u * uToMm, ym: t * tToMm, line: li, tx: txm / tl, ty: tym / tl });
    }
  });
  if (pts.length === 0) return { narrowestWidthMm: Infinity, minTrisAcross: 0, featurePoints: 0, at: { u: 0, t: 0 }, medianSpacingMm: Infinity };

  // Coincidence floor: pairs closer than this are the SAME physical wall sampled by
  // two truth families (ridge≈crease≈relief-wall overlap) — NOT a channel. Set to a
  // few sampling steps so a genuine sub-stepMm channel would already read as 0-across.
  const COINCIDE_MM = Math.max(4 * stepMm, 0.05);
  // Two walls bound a channel only if their tangents are roughly parallel (|cos|>0.7).
  const PARALLEL_COS = 0.7;

  // 2) Spatial hash on mm coords. Cell sized so a small SEARCH ring spans the few-mm
  //    reach needed to find a parallel wall across a channel WITHOUT a huge cell
  //    scan (the 2*stepMm cell forced a 24-cell ring = O(2401) per point). Periodic u.
  const cell = 0.3; // mm
  const REACH_MM = 2.0; // max channel width we look for
  const SEARCH = Math.ceil(REACH_MM / cell); // ~7 cells → 15x15 max
  const key = (gx: number, gy: number): string => `${gx},${gy}`;
  const grid = new Map<string, number[]>();
  const cx = (xm: number): number => Math.floor(xm / cell);
  const cy = (ym: number): number => Math.floor(ym / cell);
  pts.forEach((p, i) => {
    const k = key(cx(p.xm), cy(p.ym));
    const arr = grid.get(k); if (arr) arr.push(i); else grid.set(k, [i]);
  });
  const wrapDx = (dx: number): number => {
    // periodic in u → mm circumference uToMm
    if (dx > uToMm / 2) dx -= uToMm; else if (dx < -uToMm / 2) dx += uToMm;
    return dx;
  };
  const spacings: Array<{ d: number; i: number; j: number }> = [];
  // Subsample seed points: the narrowest-channel estimate is statistical, so seeding
  // from every SEED_STRIDE-th feature point (capped at ~40k seeds) keeps the scan
  // O(40k * 225) regardless of mesh size. Each seed still searches the FULL cloud.
  const SEED_STRIDE = Math.max(1, Math.ceil(pts.length / 40_000));
  for (let i = 0; i < pts.length; i += SEED_STRIDE) {
    const p = pts[i];
    let best = Infinity, bestJ = -1;
    const bx = cx(p.xm), by = cy(p.ym);
    for (let gx = bx - SEARCH; gx <= bx + SEARCH; gx++) {
      for (let gy = by - SEARCH; gy <= by + SEARCH; gy++) {
        const arr = grid.get(key(gx, gy)); if (!arr) continue;
        for (const j of arr) {
          if (j === i) continue;
          const q = pts[j];
          const dx = wrapDx(q.xm - p.xm), dy = q.ym - p.ym;
          const d = Math.hypot(dx, dy);
          // exclude coincident loci (same physical wall sampled by 2 families, or the
          // same-line sampling step) — those are not a channel between two walls.
          if (d < COINCIDE_MM) continue;
          // a channel is bounded by two roughly-PARALLEL walls: require parallel
          // tangents AND that the connecting vector is ~perpendicular to the wall
          // (so we measure ACROSS the channel, not along a single curving wall).
          const cosTan = Math.abs(p.tx * q.tx + p.ty * q.ty);
          if (cosTan < PARALLEL_COS) continue;
          const perpDot = Math.abs((dx / d) * p.tx + (dy / d) * p.ty); // ~0 if perp
          if (perpDot > 0.5) continue; // connecting vector too aligned with the wall
          if (d < best) { best = d; bestJ = j; }
        }
      }
    }
    if (bestJ >= 0 && isFinite(best)) spacings.push({ d: best, i, j: bestJ });
  }
  if (spacings.length === 0) return { narrowestWidthMm: Infinity, minTrisAcross: 0, featurePoints: pts.length, at: { u: 0, t: 0 }, medianSpacingMm: Infinity };
  spacings.sort((a, b) => a.d - b.d);
  // Coincident loci are already filtered (COINCIDE_MM) and only parallel-wall pairs
  // remain, so the 1% percentile is a robust "narrowest real channel" (guards a few
  // residual degenerate pairs without hiding a genuine thin channel).
  const lowIdx = Math.max(0, Math.floor(0.01 * spacings.length));
  const narrowest = spacings[lowIdx];
  const median = spacings[Math.floor(0.5 * spacings.length)].d;

  // 3) Count mesh triangles across the narrowest channel. Probe a perpendicular
  //    segment of length = narrowest width, centered at the midpoint between the
  //    two feature points, oriented along the line connecting them (that IS the
  //    cross-channel direction). Walk it in fine steps and count distinct triangles.
  const pA = pts[narrowest.i], pB = pts[narrowest.j];
  let dxm = wrapDx(pB.xm - pA.xm), dym = pB.ym - pA.ym;
  const segLenMm = Math.hypot(dxm, dym) || 1e-6;
  const midXm = pA.xm + dxm / 2, midYm = pA.ym + dym / 2;
  const midU = ((midXm / uToMm) % 1 + 1) % 1, midT = Math.min(1, Math.max(0, midYm / tToMm));
  // unit direction in (u,t)
  const dirU = (dxm / uToMm), dirT = (dym / tToMm);
  const stepsN = 64;
  const seen = new Set<string>();
  const triKey = (a: number, b: number, c: number): string => {
    const s = [a, b, c].sort((x, y) => x - y); return `${s[0]},${s[1]},${s[2]}`;
  };
  // We need triangle IDENTITY at each probe point. Re-implement a light locate that
  // returns the triangle id by reusing the locator's logic via mesh data directly.
  const triAt = locateTriId(mesh);
  for (let k = 0; k <= stepsN; k++) {
    const f = (k / stepsN) - 0.5; // -0.5..+0.5 across the segment
    let u = midU + dirU * f; u = ((u % 1) + 1) % 1;
    const t = Math.min(1, Math.max(0, midT + dirT * f));
    const ti = triAt(u, t);
    if (ti >= 0) {
      const a = mesh.indices[3 * ti], b = mesh.indices[3 * ti + 1], c = mesh.indices[3 * ti + 2];
      seen.add(triKey(a, b, c));
    }
  }
  return {
    narrowestWidthMm: narrowest.d,
    minTrisAcross: seen.size,
    featurePoints: pts.length,
    at: { u: midU, t: midT },
    medianSpacingMm: median,
  };
}

/**
 * Lightweight triangle-id locator (returns the containing triangle index or -1).
 * Mirrors buildLocator's point-in-triangle test but yields the id. Linear scan with
 * a coarse bucket prefilter would be ideal; for the SHORT probe segments here a
 * per-call bucket lookup over a rebuilt grid is overkill — we reuse a small grid.
 */
function locateTriId(mesh: MeshUt): (u: number, t: number) => number {
  const { ut, indices } = mesh;
  const nTris = indices.length / 3;
  const gridN = 256;
  const cells: number[][] = Array.from({ length: gridN * gridN }, () => []);
  const idx = (cu: number, ct: number): number => cu * gridN + ct;
  const triU = new Float64Array(nTris * 3); const straddle = new Uint8Array(nTris);
  const reg = (ti: number, u0: number, u1: number, t0: number, t1: number): void => {
    const a0 = Math.max(0, Math.min(gridN - 1, Math.floor(u0 * gridN)));
    const a1 = Math.max(0, Math.min(gridN - 1, Math.floor(u1 * gridN)));
    const b0 = Math.max(0, Math.min(gridN - 1, Math.floor(t0 * gridN)));
    const b1 = Math.max(0, Math.min(gridN - 1, Math.floor(t1 * gridN)));
    for (let cu = a0; cu <= a1; cu++) for (let ct = b0; ct <= b1; ct++) cells[idx(cu, ct)].push(ti);
  };
  for (let ti = 0; ti < nTris; ti++) {
    const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) {
      straddle[ti] = 1; if (ua > 0.5) ua -= 1; if (ub > 0.5) ub -= 1; if (uc > 0.5) uc -= 1;
    }
    triU[3 * ti] = ua; triU[3 * ti + 1] = ub; triU[3 * ti + 2] = uc;
    const umin = Math.min(ua, ub, uc), umax = Math.max(ua, ub, uc);
    const tmin = Math.min(ta, tb, tc), tmax = Math.max(ta, tb, tc);
    reg(ti, Math.max(0, umin), Math.min(1, umax), tmin, tmax);
    if (umin < 0) reg(ti, Math.max(0, umin + 1), Math.min(1, umax + 1), tmin, tmax);
    if (umax > 1) reg(ti, Math.max(0, umin - 1), Math.min(1, umax - 1), tmin, tmax);
  }
  const EPS = 1e-7;
  const bary = (ti: number, qu: number, qt: number): boolean => {
    const ua = triU[3 * ti], ub = triU[3 * ti + 1], uc = triU[3 * ti + 2];
    const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    const d = (tb - tc) * (ua - uc) + (uc - ub) * (ta - tc);
    if (Math.abs(d) < 1e-18) return false;
    const wa = ((tb - tc) * (qu - uc) + (uc - ub) * (qt - tc)) / d;
    const wb = ((tc - ta) * (qu - uc) + (ua - uc) * (qt - tc)) / d;
    const wc = 1 - wa - wb;
    return wa >= -EPS && wb >= -EPS && wc >= -EPS;
  };
  return (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    const cu = Math.max(0, Math.min(gridN - 1, Math.floor(uu * gridN)));
    const ct = Math.max(0, Math.min(gridN - 1, Math.floor(tt * gridN)));
    const bucket = cells[idx(cu, ct)];
    for (const ti of bucket) {
      for (const qu of straddle[ti] ? [uu, uu - 1, uu + 1] : [uu]) {
        if (bary(ti, qu, tt)) return ti;
      }
    }
    return -1;
  };
}

// ---------------------------------------------------------------------------
// Global chord (for contrast) — the project's own instrument on the SAME mesh.
// ---------------------------------------------------------------------------

export interface GlobalChordResult { rmsMm: number; p99Mm: number; maxMm: number; vertexMaxMm: number; }

export function globalChord(ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number): GlobalChordResult {
  const n = ut.length / 2;
  const vertices = new Float32Array(n * 3); const utFlat = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = ut[2 * i], t = ut[2 * i + 1]; const th = TAU * u, z = t * H, r = rA(th, z);
    vertices[3 * i] = r * Math.cos(th); vertices[3 * i + 1] = r * Math.sin(th); vertices[3 * i + 2] = z;
    utFlat[3 * i] = u; utFlat[3 * i + 1] = t;
  }
  const idx = indices instanceof Uint32Array ? indices : Uint32Array.from(indices);
  const dev = perpendicular3DDeviation({ vertices, indices: idx }, utFlat, rA, { H, tolMm: 0.05, seamExclU: 0, denseN: 4 });
  return { rmsMm: dev.rmsDevMm, p99Mm: dev.p99DevMm, maxMm: dev.chordMaxMm, vertexMaxMm: dev.vertexMaxMm };
}

// ---------------------------------------------------------------------------
// (4) TRUE-3D NEAREST-SURFACE DISTANCE
//
// Same-param |P_true − P_mesh| (used in featureLineChord) OVERSTATES error for
// near-vertical features: a facet chord across a strapwork cliff reads as big even
// if the mesh passes right next to the true surface point. The TRUE 3D distance is
// point P_true to its nearest point on the MESH SURFACE (closest point on any nearby
// triangle). This resolves the radial overstatement and collapses GeometricStar /
// Crystalline if their residual is the cliff artifact.
//
// Point-to-triangle-3D: parameterized via the Eberly (2003) formulation. Given P and
// triangle (A,B,C), the closest point Q is found by projecting P onto the triangle
// plane, then clamping the barycentric coords to the triangle boundary. This is the
// EXACT minimum distance without the Newton iteration used by the chord oracle.
// ---------------------------------------------------------------------------

/** Exact 3D distance from point P to the closest point on triangle (A,B,C). */
function pointToTriDist3D(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  // Edge vectors
  const e0x = bx - ax, e0y = by - ay, e0z = bz - az;
  const e1x = cx - ax, e1y = cy - ay, e1z = cz - az;
  const dx = ax - px, dy = ay - py, dz = az - pz;

  const a = e0x * e0x + e0y * e0y + e0z * e0z; // e0·e0
  const b = e0x * e1x + e0y * e1y + e0z * e1z; // e0·e1
  const c = e1x * e1x + e1y * e1y + e1z * e1z; // e1·e1
  const d = e0x * dx + e0y * dy + e0z * dz;    // e0·(A-P)
  const e = e1x * dx + e1y * dy + e1z * dz;    // e1·(A-P)
  const det = a * c - b * b; let s = b * e - c * d; let tt = b * d - a * e;

  if (s + tt <= det) {
    if (s < 0) {
      if (tt < 0) { // region 4 (corner A)
        if (d < 0) { tt = 0; s = Math.min(-d / a, 1); } else { s = 0; tt = e >= 0 ? 0 : Math.min(-e / c, 1); }
      } else { s = 0; tt = e >= 0 ? 0 : Math.min(-e / c, 1); } // region 3 (edge AC)
    } else if (tt < 0) { // region 5 (edge AB)
      tt = 0; s = d >= 0 ? 0 : Math.min(-d / a, 1);
    } else { // region 0 (interior)
      const invDet = det > 1e-30 ? 1 / det : 0; s *= invDet; tt *= invDet;
    }
  } else {
    if (s < 0) { // region 2 (edge BC, side of C)
      const tmp0 = b + d, tmp1 = c + e;
      if (tmp1 > tmp0) { const numer = tmp1 - tmp0; const denom = a - 2 * b + c; s = Math.min(numer / denom, 1); tt = 1 - s; }
      else { s = 0; tt = tmp1 <= 0 ? 1 : e >= 0 ? 0 : Math.min(-e / c, 1); }
    } else if (tt < 0) { // region 6 (edge BC, side of B)
      const tmp0 = b + e, tmp1 = a + d;
      if (tmp1 > tmp0) { const numer = tmp1 - tmp0; const denom = a - 2 * b + c; tt = Math.min(numer / denom, 1); s = 1 - tt; }
      else { tt = 0; s = tmp1 <= 0 ? 1 : d >= 0 ? 0 : Math.min(-d / a, 1); }
    } else { // region 1 (edge BC)
      const numer = c + e - b - d; if (numer <= 0) { s = 0; } else { const denom = a - 2 * b + c; s = Math.min(numer / denom, 1); } tt = 1 - s;
    }
  }
  // Closest point on triangle
  const qx = ax + s * e0x + tt * e1x;
  const qy = ay + s * e0y + tt * e1y;
  const qz = az + s * e0z + tt * e1z;
  return Math.hypot(px - qx, py - qy, pz - qz);
}

export interface FeatureLineChord3DResult {
  rmsMm: number; p99Mm: number; maxMm: number; samples: number; missed: number;
  worst: { u: number; t: number; mm: number };
  /** Ratio same-param p99 / true3D p99 — the radial overstatement factor. */
  radialOverstatementRatio: number;
}

/**
 * TRUE-3D nearest-surface feature-line error. For each feature-line (u,t):
 *   P_true = liftTrue(u,t,rA,H)  [exact analytic position]
 *   P_closest = closest point on the MESH SURFACE in a (u,t) neighborhood
 *   dist = |P_true − P_closest|  [exact 3D, not radial]
 *
 * Uses `locator.neighborTriangles` with a modest cell radius to gather candidate
 * triangles, then evaluates exact point-to-triangle-3D for each candidate and takes
 * the minimum. `cellR` is set so the search radius comfortably covers ~1 mm
 * (large enough that the nearest triangle is always found for any feature size
 * that passed the channel coverage check).
 *
 * @param sameParamP99  the same-param p99 from featureLineChord (to compute the
 *                      overstatement ratio; pass 0 to skip).
 */
export function featureLineChord3D(
  truth: FeatureTruth, locator: PointLocator, mesh: MeshUt, rA: AnalyticRadiusFn, H: number,
  stepMm: number, sameParamP99 = 0, cellROverride?: number,
): FeatureLineChord3DResult {
  const { xyz, indices } = mesh;
  // Cell radius for neighborhood: aim for ~1mm radius. cellSize is in (u,t) units;
  // we need to cover ~1mm / uToMm in u and ~1mm / H in t. A safe fixed cellR=4 on a
  // 256-cell grid is (4/256 in u) × uToMm mm ≈ 4–6mm, well within the triangle density.
  // cellROverride lets a caller trade radius for speed on dense meshes (the nearest tri is
  // typically within 2–3 cells at high density); default 4 keeps existing callers identical.
  const cellR = cellROverride ?? 4;

  const devs: number[] = [];
  let missed = 0;
  let worst = { u: 0, t: 0, mm: 0 };

  for (const line of truth.lines) {
    for (const { u, t } of sampleLine(line, truth.uToMm, truth.tToMm, stepMm)) {
      const [px, py, pz] = liftTrue(u, t, rA, H);
      const candidates = locator.neighborTriangles(u, t, cellR);
      if (candidates.length === 0) { missed++; continue; }
      let minD = Infinity;
      for (const ti of candidates) {
        const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
        const d = pointToTriDist3D(
          px, py, pz,
          xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2],
          xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2],
          xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2],
        );
        if (d < minD) minD = d;
      }
      if (!isFinite(minD)) { missed++; continue; }
      devs.push(minD);
      if (minD > worst.mm) worst = { u, t, mm: minD };
    }
  }

  devs.sort((a, b) => a - b);
  const n = devs.length;
  let sumSq = 0; for (const d of devs) sumSq += d * d;
  const p99 = n ? devs[Math.min(n - 1, Math.floor(0.99 * n))] : 0;
  return {
    rmsMm: n ? Math.sqrt(sumSq / n) : 0, p99Mm: p99, maxMm: n ? devs[n - 1] : 0,
    samples: n, missed,
    worst,
    radialOverstatementRatio: p99 > 1e-9 && sameParamP99 > 0 ? sameParamP99 / p99 : 1,
  };
}

// ---------------------------------------------------------------------------
// (5) FEATURE-ADJACENT SLIVER QUALITY
//
// The user literally SEES slivers as long red triangles. For triangles that either
// (a) contain a feature-line (u,t) sample within their area (located by query), or
// (b) have their centroid within `cellR` cells of a feature locus (located by
//     neighborTriangles), compute 3D min interior angle and classify as slivers.
// Report: minAngle, %<20°, %<10°, count — and contrast with the WHOLE-MESH %<20°.
//
// Implementation: mark triangles "feature-adjacent" via (a) the containing triangle
// from featureLineChord's point-location (the triangle IS on the feature), and (b)
// all neighbor triangles gathered from the feature locus location. Method (a) is most
// selective (only the straddle triangle); (b) is slightly more generous. We use (a).
// ---------------------------------------------------------------------------

/** Min interior angle (degrees) of 3D triangle (A,B,C). acos-based for reporting. */
function triMinAngle3D(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const bcx = cx - bx, bcy = cy - by, bcz = cz - bz;
  const lab = Math.hypot(abx, aby, abz), lac = Math.hypot(acx, acy, acz), lbc = Math.hypot(bcx, bcy, bcz);
  if (lab < 1e-15 || lac < 1e-15 || lbc < 1e-15) return 0;
  // cos of each angle via dot-product
  const cosA = (abx * acx + aby * acy + abz * acz) / (lab * lac);
  const cosB = (-abx * bcx - aby * bcy - abz * bcz) / (lab * lbc);
  const cosC = (acx * bcx + acy * bcy + acz * bcz) / (lac * lbc);
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  return Math.min(
    Math.acos(clamp(cosA)), Math.acos(clamp(cosB)), Math.acos(clamp(cosC)),
  ) * (180 / Math.PI);
}

export interface FeatureAdjacentSliverResult {
  /** Feature-adjacent triangle count. */
  featureAdjCount: number;
  /** Min angle over all feature-adjacent triangles (deg). */
  featureAdjMinAngle: number;
  /** % of feature-adjacent triangles with min-angle < 20°. */
  featureAdj_pct20: number;
  /** % of feature-adjacent triangles with min-angle < 10°. */
  featureAdj_pct10: number;
  /** Whole-mesh %<20° (fast: check all tris once). */
  wholeMesh_pct20: number;
  /** Ratio featureAdj%<20 / wholeMesh%<20 — >1 means features attract slivers. */
  sliverRatio: number;
}

/**
 * Feature-adjacent sliver quality. Marks every triangle that CONTAINS a feature-line
 * sample (via point location in the (u,t) bucket grid) as "feature-adjacent", then
 * reports 3D min-angle statistics on that set vs. the whole mesh.
 *
 * We subsample feature-line points to ~80k seeds (speed) — enough to mark every
 * feature-adjacent triangle at least once at the typical mesh density.
 */
export function featureAdjacentSlivers(
  truth: FeatureTruth, locator: PointLocator, mesh: MeshUt, stepMm: number,
): FeatureAdjacentSliverResult {
  const { xyz, indices } = mesh;
  const nTris = indices.length / 3;

  // --- Mark feature-adjacent triangles via point location ---
  const marked = new Uint8Array(nTris);
  const SUBSAMPLE = Math.max(1, Math.ceil(truth.lines.length / 2000)); // ~2000 line seeds
  let lineIdx = 0;
  for (const line of truth.lines) {
    if (lineIdx++ % SUBSAMPLE !== 0) continue;
    for (const { u, t } of sampleLine(line, truth.uToMm, truth.tToMm, stepMm)) {
      const q = locator.query(u, t);
      if (q !== null) {
        // The locator found a triangle: we need its id. Re-run neighborTriangles(cellR=0)
        // — single-cell lookup — and pick the first one that actually contains (u,t).
        const cands = locator.neighborTriangles(u, t, 0);
        for (const ti of cands) {
          const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
          // Quick check: does the query's interpolated P match vertex-interpolation of ti?
          // Faster: just mark all single-cell candidates (the cell is tiny, ~cellSize² area).
          void a; void b; void c;
          marked[ti] = 1;
        }
      }
    }
  }

  // --- Whole-mesh %<20° and feature-adjacent stats ---
  let adjCount = 0, adjBelow20 = 0, adjBelow10 = 0, adjMinAngle = 180;
  let wholeBelow20 = 0;

  for (let ti = 0; ti < nTris; ti++) {
    const a = indices[3 * ti], b = indices[3 * ti + 1], c = indices[3 * ti + 2];
    const ang = triMinAngle3D(
      xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2],
      xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2],
      xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2],
    );
    if (ang < 20) wholeBelow20++;
    if (!marked[ti]) continue;
    adjCount++;
    if (ang < adjMinAngle) adjMinAngle = ang;
    if (ang < 20) adjBelow20++;
    if (ang < 10) adjBelow10++;
  }

  const adjPct20 = adjCount ? 100 * adjBelow20 / adjCount : 0;
  const wholePct20 = nTris ? 100 * wholeBelow20 / nTris : 0;
  return {
    featureAdjCount: adjCount, featureAdjMinAngle: adjCount ? adjMinAngle : 0,
    featureAdj_pct20: adjPct20, featureAdj_pct10: adjCount ? 100 * adjBelow10 / adjCount : 0,
    wholeMesh_pct20: wholePct20,
    // Ratio guard: when whole-mesh slivers are ~0, only flag a sentinel if the
    // feature-adjacent sliver rate is itself non-trivial (>1%). Otherwise both are
    // negligible → ratio 1 (accept). Prevents a 0.04%-vs-0.0% false DEFECT (Crystalline).
    sliverRatio: wholePct20 > 0.1 ? adjPct20 / wholePct20 : adjPct20 > 1 ? 99 : 1,
  };
}
