/**
 * interiorRuler.ts — the honest whole-mesh TRUE-3D interior ruler + the
 * MANDATORY whole-mesh acceptance guard.
 *
 * Port of the proven research kernel (research/bridge/_pf_perfectMesherBruteLib
 * facetInteriorBrute / facetInteriorGuardDense / acceptanceGuardWhole). The
 * campaign's two hard-won metrology rules are load-bearing here:
 *
 *  1. The stop/accept ruler is the TWO-STAGE HONEST ruler: same-(u,t) upper
 *     bound (deep-green prefilter) → Gauss-Newton screen → FULL-AZIMUTH BRUTE
 *     anchor on any non-green sample. Bare GN UNDERSTATES true-3D on
 *     near-vertical flanks (measured: loop stopped at worstGN 0.0085 while
 *     the brute showed 0.133) — a loop driven by a blind ruler never reaches
 *     honest convergence.
 *  2. The acceptance population is EVERY FREE FACET. A top-N-gradU or
 *     percentile guard was measured blind twice (VALIDATION 6/9: read 0 while
 *     32/791 facets were outliers). No production API here exposes a top-N
 *     population — that is a banked mandate, guarded by a regression test.
 *
 * @module conforming/tierC/interiorRuler
 */

import type { SurfaceSampler } from '../SurfaceSampler';
import {
  projectPointToRadialSurface,
  type AnalyticRadiusFn,
} from '../../../../../fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

// ---------------------------------------------------------------------------
// Radial-surface adapter
// ---------------------------------------------------------------------------

/** A single-valued radial surface r(θ,z) derived from a SurfaceSampler. */
export interface RadialSurface {
  rA: AnalyticRadiusFn;
  /** Wall height (mm): z spans [0, H] as t spans [0, 1]. */
  H: number;
}

/**
 * Wrap a sampler as r(θ,z). Valid ONLY for the unwarped radial convention
 * position(u,t) = [r·cos(2πu), r·sin(2πu), t·H] — true for the count-unstable
 * Tier-C styles (proven single-valued in research). Verified numerically at
 * construction; a spin/twist-warped surface throws (documented Task-4
 * patch-scale limitation — full-pot warp support is integration scope).
 */
export function radialSurfaceFromSampler(sampler: SurfaceSampler): RadialSurface {
  const z0 = sampler.position(0, 0)[2];
  const z1 = sampler.position(0, 1)[2];
  const H = z1 - z0;
  if (!(H > 0) || Math.abs(z0) > 1e-6) {
    throw new Error(
      `radialSurfaceFromSampler: expected z = t·H (measured z0=${z0}, z1=${z1})`,
    );
  }
  // Azimuth-convention check on a small probe grid.
  for (const [u, t] of [
    [0.13, 0.2],
    [0.4, 0.5],
    [0.77, 0.8],
  ] as const) {
    const [x, y] = sampler.position(u, t);
    let dTh = Math.atan2(y, x) - TAU * u;
    while (dTh > Math.PI) dTh -= TAU;
    while (dTh < -Math.PI) dTh += TAU;
    if (Math.abs(dTh) > 1e-3) {
      throw new Error(
        'radialSurfaceFromSampler: sampler azimuth deviates from 2πu ' +
          '(spin/twist warp?) — Tier-C radial ruler unsupported for this surface',
      );
    }
  }
  const rA: AnalyticRadiusFn = (theta, z) => {
    const u = (theta / TAU) % 1;
    const t = Math.min(1, Math.max(0, z / H));
    const [x, y] = sampler.position(u < 0 ? u + 1 : u, t);
    return Math.hypot(x, y);
  };
  return { rA, H };
}

// ---------------------------------------------------------------------------
// Sample lattices + ruler options (proven trusted configuration)
// ---------------------------------------------------------------------------

/** Cheap 7-pt interior/edge lattice — the PHASE-A bulk stop driver. */
export const BARY_STOP: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.5, 0],
  [0, 0.5, 0.5],
  [0.5, 0, 0.5],
  [1 / 3, 1 / 3, 1 / 3],
  [2 / 3, 1 / 6, 1 / 6],
  [1 / 6, 2 / 3, 1 / 6],
  [1 / 6, 1 / 6, 2 / 3],
];

/** Dense (n+1)(n+2)/2-pt barycentric lattice; n=8 → 45 pts (≥36 mandated). */
export function denseBary(n = 8): Array<[number, number, number]> {
  const B: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
  }
  return B;
}

/** Two-stage ruler configuration. */
export interface RulerOptions {
  /** Same-(u,t) bound below this (mm) is deep-green — no GN, no brute. */
  preFilter: number;
  /** GN distance below this (mm) is green — brute not needed. */
  gnScreen: number;
  /** Brute grid: full-azimuth θ resolution. */
  nTheta: number;
  /** Brute grid: z rows across the z-band. */
  nZ: number;
  /** Brute z-band half-extent (mm) around the query point. */
  zBandMm: number;
  /** Brute local box-refine iterations. */
  refineIters: number;
  /**
   * θ half-window (rad) around the query's own azimuth to scan, at the SAME
   * angular resolution as a full scan (exact, just fewer samples). Valid ONLY
   * for single-valued radial surfaces (Gothic/GeoStar ribs): the nearest foot
   * of a near-surface point lies within a few ribs of its own azimuth, so a
   * generous window is exact while skipping the far-azimuth ~90% of the scan.
   * Omit/undefined ⇒ full azimuth (unchanged). 0.35rad ≈ ±20° ≈ ±3 ribs.
   */
  thetaWindowRad?: number;
}

/** The trusted config (surfnative calibration: box-refine <1e-4mm). */
export const DEFAULT_RULER: RulerOptions = {
  preFilter: 0.006,
  gnScreen: 0.006,
  nTheta: 1024,
  nZ: 120,
  zBandMm: 3,
  refineIters: 60,
};

// ---------------------------------------------------------------------------
// Full-azimuth brute nearest (port of labkit bruteNearestOnRadialSurface)
// ---------------------------------------------------------------------------

/**
 * Global-nearest foot on the radial surface: coarse full-azimuth grid over a
 * z-band around the query, then a shrinking local box-refine. The trusted
 * anchor where GN may sit in a wrong well (near-vertical flank ribbons).
 */
export function bruteNearestOnRadialSurface(
  px: number,
  py: number,
  pz: number,
  rA: AnalyticRadiusFn,
  H: number,
  opts: RulerOptions,
): number {
  const d2 = (th: number, z: number): number => {
    const r = rA(th, z);
    const ex = px - r * Math.cos(th);
    const ey = py - r * Math.sin(th);
    const ez = pz - z;
    return ex * ex + ey * ey + ez * ez;
  };
  const zLo = Math.max(0, pz - opts.zBandMm);
  const zHi = Math.min(H, pz + opts.zBandMm);
  let best = Infinity;
  let bth = 0;
  let bz = pz;
  // Angular step = full-scan resolution (TAU/nTheta), preserved whether we
  // scan the full circle or a window around the query azimuth.
  const dth = TAU / opts.nTheta;
  const w = opts.thetaWindowRad;
  const th0 =
    w !== undefined && w > 0
      ? (() => {
          const a = Math.atan2(py, px);
          return a < 0 ? a + TAU : a;
        })()
      : 0;
  const iLo = w !== undefined && w > 0 ? -Math.ceil(w / dth) : 0;
  const iHi =
    w !== undefined && w > 0 ? Math.ceil(w / dth) : opts.nTheta - 1;
  for (let i = iLo; i <= iHi; i++) {
    const th = th0 + i * dth; // d2 uses cos/sin — no need to wrap into [0,TAU)
    for (let j = 0; j <= opts.nZ; j++) {
      const z = zLo + (zHi - zLo) * (j / opts.nZ);
      const f = d2(th, z);
      if (f < best) {
        best = f;
        bth = th;
        bz = z;
      }
    }
  }
  let hTh = TAU / opts.nTheta;
  let hZ = (zHi - zLo) / opts.nZ;
  for (let it = 0; it < opts.refineIters; it++) {
    let improved = false;
    for (const dth of [-hTh, 0, hTh]) {
      for (const dz of [-hZ, 0, hZ]) {
        const f = d2(bth + dth, bz + dz);
        if (f < best) {
          best = f;
          bth += dth;
          bz += dz;
          improved = true;
        }
      }
    }
    if (!improved) {
      hTh *= 0.5;
      hZ *= 0.5;
    }
    if (hTh < 1e-10 && hZ < 1e-10) break;
  }
  return Math.sqrt(best);
}

// ---------------------------------------------------------------------------
// Per-facet honest interior deviation (two-stage, any lattice)
// ---------------------------------------------------------------------------

/** Per-facet honest verdict + the in-chart worst-sample split site. */
export interface HonestFacet {
  dev: number;
  uWorst: number;
  tWorst: number;
  bruteCalls: number;
}

/**
 * Honest worst interior deviation of facet (a,b,c) over the given barycentric
 * lattice. The split site (uWorst,tWorst) is the worst SAMPLE's own chart
 * coordinate — guaranteed inside the facet, never a wrong-rib 3D foot.
 */
export function facetInteriorHonest(
  surface: RadialSurface,
  xyz: Float64Array,
  uv: number[],
  a: number,
  b: number,
  c: number,
  bary: ReadonlyArray<readonly [number, number, number]>,
  opts: RulerOptions,
): HonestFacet {
  const { rA, H } = surface;
  const ax = xyz[3 * a];
  const ay = xyz[3 * a + 1];
  const az = xyz[3 * a + 2];
  const bx = xyz[3 * b];
  const by = xyz[3 * b + 1];
  const bz = xyz[3 * b + 2];
  const cx = xyz[3 * c];
  const cy = xyz[3 * c + 1];
  const cz = xyz[3 * c + 2];
  // Seam-consistent u for the facet (shortest image around a's u).
  let ua = uv[2 * a];
  let ub = uv[2 * b];
  let uc = uv[2 * c];
  const ta = uv[2 * a + 1];
  const tb = uv[2 * b + 1];
  const tc = uv[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1;
  while (ua - ub > 0.5) ub += 1;
  while (uc - ua > 0.5) uc -= 1;
  while (ua - uc > 0.5) uc += 1;
  const utBound = (
    px: number,
    py: number,
    pz: number,
    um: number,
    tm: number,
  ): number => {
    const th = TAU * (um - Math.floor(um));
    const z = tm * H;
    const r = rA(th, z);
    return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
  };
  let dev = 0;
  let uW = (ua + ub + uc) / 3;
  let tW = (ta + tb + tc) / 3;
  let bruteCalls = 0;
  for (const [wa, wb, wc] of bary) {
    const px = wa * ax + wb * bx + wc * cx;
    const py = wa * ay + wb * by + wc * cy;
    const pz = wa * az + wb * bz + wc * cz;
    const um = wa * ua + wb * ub + wc * uc;
    const tm = wa * ta + wb * tb + wc * tc;
    const bound = utBound(px, py, pz, um, tm);
    let d: number;
    if (bound <= opts.preFilter) {
      // Deep-green: true dist ≤ bound ≤ preFilter ≤ tol — cannot be an outlier.
      d = bound;
    } else {
      const gn = projectPointToRadialSurface(px, py, pz, rA, {
        coarseTrigger: 1e9,
        maxIter: 40,
      }).dist;
      if (gn <= opts.gnScreen) {
        d = gn; // green GN cannot be an outlier; keep the cheap value
      } else {
        // PER-SAMPLE θ-window: the same-azimuth `bound` upper-bounds the true
        // distance, so the foot lies within `bound` Euclidean of P, hence
        // within asin(bound/r_foot) of P's azimuth. r_foot ≥ r_local for a
        // point OUTSIDE the surface but can be smaller for one inside — so
        // use HALF the local radius as a conservative r_foot floor (covers
        // relief up to 50% of the radius, generous for the rib/chevron
        // styles) plus a 12-cell margin for the z-band box refine. Scans at
        // full angular resolution ⇒ exact where the window holds the foot;
        // it can only OVERSTATE otherwise (safe). Fixed windows understate —
        // a big early-pass facet's foot can be many ribs away (measured 57
        // false-0s at a fixed 0.5rad).
        const rho = Math.hypot(px, py);
        const win =
          Math.asin(Math.min(1, (2 * bound) / Math.max(1e-6, rho))) +
          12 * (TAU / opts.nTheta);
        d = bruteNearestOnRadialSurface(px, py, pz, rA, H, {
          ...opts,
          thetaWindowRad: Math.min(Math.PI, win),
        });
        bruteCalls++;
      }
    }
    if (d > dev) {
      dev = d;
      uW = um;
      tW = tm;
    }
  }
  return { dev, uWorst: uW, tWorst: tW, bruteCalls };
}

// ---------------------------------------------------------------------------
// The MANDATORY whole-mesh acceptance guard
// ---------------------------------------------------------------------------

/** Whole-mesh guard verdict (every free facet, dense lattice). */
export interface WholeMeshScore {
  nFacets: number;
  outliers: number;
  maxMm: number;
  p50: number;
  p99: number;
  bruteCalls: number;
}

/** Mesh view: packed (u,t) chart coords + triangle indices. */
export interface ChartMesh {
  uv: number[];
  tris: number[];
}

/** Lift every chart vertex to 3D through the sampler (exact placement). */
export function liftChartMesh(
  sampler: SurfaceSampler,
  uv: number[],
): Float64Array {
  const nV = uv.length / 2;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const u = uv[2 * i];
    const [x, y, z] = sampler.position(((u % 1) + 1) % 1, uv[2 * i + 1]);
    xyz[3 * i] = x;
    xyz[3 * i + 1] = y;
    xyz[3 * i + 2] = z;
  }
  return xyz;
}

/**
 * Score EVERY free facet with the dense 45-pt honest ruler. There is
 * deliberately NO population parameter: the whole mesh is the only honest
 * acceptance population (top-N-gradU was measured blind — banked mandate).
 */
export function scoreWholeMesh(
  sampler: SurfaceSampler,
  surface: RadialSurface,
  mesh: ChartMesh,
  tolMm: number,
  opts: RulerOptions = DEFAULT_RULER,
): WholeMeshScore {
  const xyz = liftChartMesh(sampler, mesh.uv);
  const nF = mesh.tris.length / 3;
  const dense = denseBary(8);
  const dev = new Float64Array(nF);
  let bruteCalls = 0;
  for (let f = 0; f < nF; f++) {
    const g = facetInteriorHonest(
      surface,
      xyz,
      mesh.uv,
      mesh.tris[3 * f],
      mesh.tris[3 * f + 1],
      mesh.tris[3 * f + 2],
      dense,
      opts,
    );
    dev[f] = g.dev;
    bruteCalls += g.bruteCalls;
  }
  let maxMm = 0;
  let outliers = 0;
  for (let f = 0; f < nF; f++) {
    if (dev[f] > maxMm) maxMm = dev[f];
    if (dev[f] > tolMm) outliers++;
  }
  const sorted = Float64Array.from(dev).sort();
  const pc = (q: number): number =>
    sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
      : 0;
  return {
    nFacets: nF,
    outliers,
    maxMm,
    p50: pc(0.5),
    p99: pc(0.99),
    bruteCalls,
  };
}

/** Convenience count for the go/no-go assertions. */
export function countInteriorOutliers(
  sampler: SurfaceSampler,
  mesh: ChartMesh,
  tolMm: number,
  opts: RulerOptions = DEFAULT_RULER,
): number {
  const surface = radialSurfaceFromSampler(sampler);
  return scoreWholeMesh(sampler, surface, mesh, tolMm, opts).outliers;
}

/** The mandatory guard: throws unless the WHOLE mesh is ≤ tol. */
export function assertWholeMeshZero(
  sampler: SurfaceSampler,
  mesh: ChartMesh,
  tolMm: number,
  opts: RulerOptions = DEFAULT_RULER,
): void {
  const surface = radialSurfaceFromSampler(sampler);
  const s = scoreWholeMesh(sampler, surface, mesh, tolMm, opts);
  if (s.outliers > 0) {
    throw new Error(
      `assertWholeMeshZero: ${s.outliers}/${s.nFacets} facets exceed ` +
        `${tolMm}mm (max ${s.maxMm.toFixed(5)}mm)`,
    );
  }
}
