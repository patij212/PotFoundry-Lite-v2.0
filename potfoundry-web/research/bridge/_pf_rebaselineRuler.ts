// _pf_rebaselineRuler.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// THE HONEST WHOLE-MESH INTERIOR RULER for the DEFINITIVE 20-STYLE RE-BASELINE (E-2026-07-05-REBASELINE20).
//
// PURPOSE: re-score the _best20 reaching meshes under the corrected WHOLE-MESH every-facet ruler — NOT the top-N
// guard population (bruteAnchoredRedPerp sampleN=25-40) that HID Gothic/GeoStar (and, we suspect, Gyroid/Voronoi/
// Crystalline/DragonScales/LowPoly) whole-mesh residuals. The heatmap `worstMm` is `true3d-anchored` (GN body +
// top-K brute) which OVERSTATES steep lattices via wrong-local-minimum GN feet (cheatsheet: up to 7x), so it cannot
// adjudicate real-vs-artifact. This ruler brute-confirms EVERY candidate red facet (no cap) → honest interior max.
//
// INPUTS: raw XYZ (f32, lifted on the true surface) + indices + the analytic radius fn rA + H. NO (u,t) chart is
// needed — the ground truth is the full-azimuth bruteNearestOnRadialSurface (needs only the 3D point + rA + H). This
// lets us score the EXACT reaching meshes from their persisted heatmap bins with zero rebuild / zero driver drift.
//
// PER FACET: >=36-pt denseBary(8) interior lattice of the FLAT stored facet, each sample scored true-3D as:
//   stage 1 (cheap): single-seed GN foot (projectPointToRadialSurface). GN <= gnScreen => cannot be an outlier, keep.
//   stage 2 (honest): GN > gnScreen => full-azimuth bruteNearestOnRadialSurface (keeps the SMALLER of GN, brute —
//     brute corrects GN's wrong-local-minimum overstatement on steep flanks; GN corrects a coarse-brute aliasing).
// A facet is an OUTLIER iff its worst honest interior sample > tol (0.01mm). Whole-mesh: max/count over EVERY facet.
//
// FACET-PLANE PRE-SCREEN (perf, NOT a correctness lever): a facet whose 3 vertices + centroid are all within
// `flatGreenMm` of the surface (own-vertex-foot bound) AND whose facet in-plane extent is tiny cannot carry a >tol
// interior sag — but we do NOT skip it on that alone (a broad facet CAN sag). Instead the cheap screen = the GN foot
// of the 4 BARY_FAST samples; only facets whose fast screen > gnScreen advance to the full denseBary + brute. This is
// the same two-stage philosophy as facetInteriorGuardDense, with the (u,t) utBound stage replaced by the GN foot
// (honest: GN is an UPPER bound on the true nearest only up to its local-minimum; the brute confirm on every
// advanced facet closes that gap, and the low gnScreen=0.006 << tol keeps the screen conservative).
import {
  type AnalyticRadiusFn, bruteNearestOnRadialSurface, projectPointToRadialSurface,
} from './labkit';

const TAU = 2 * Math.PI;

const BARY_FAST: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3],
];
export function denseBary(n = 8): Array<[number, number, number]> {
  const B: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
  return B; // 45 pts for n=8 (>=36 pre-registered minimum)
}
const DENSE = denseBary(8);

export interface WholeMeshRulerOpts {
  tol?: number;            // outlier threshold (mm), default 0.01
  // GN foot is a LOCAL minimum of the point->surface distance with the global fallback disabled (coarseTrigger=1e9)
  // => GN >= true global nearest, i.e. GN is an UPPER BOUND on the true sag. Hence GN <= screenTol => true <= tol =>
  // the facet CANNOT be an outlier and we stop cheaply (no brute). Only GN > screenTol advances to the honest brute
  // (which can only LOWER the value, correcting GN's wrong-local-minimum overstatement on steep flanks). Default the
  // screen to `tol` itself: smooth facets (GN ~0.008) never brute; only genuine reds (GN > 0.01) get brute-confirmed.
  gnScreen?: number;       // default = tol (0.01)
  greenBrute?: number;     // sub-screen: honest brute keeps the smaller of GN,brute when GN in (greenBrute, screen]
  brute?: { nTheta?: number; nZ?: number; zBandMm?: number; refineIters?: number };
  onProgress?: (done: number, total: number, nOut: number, worst: number, bruteCalls: number) => void;
  progressEvery?: number;  // facets between onProgress calls
  // TRACTABILITY for tangled/steep lattices (reaching-density whole-mesh brute is the documented ~3.4h ceiling):
  // score a UNIFORM 1-in-`stride` facet subsample. interiorOutliers is then the EXACT count over the subsample and
  // `scannedFacets` records how many were scored (so a scaled whole-mesh estimate = interiorOutliers * stride). The
  // MAX/percentiles are over the subsample. stride=1 (default) = the full every-facet whole-mesh ruler.
  stride?: number;
}
export interface WholeMeshRulerResult {
  nFacets: number;
  interiorOutliers: number;   // facets whose honest interior true-3D max > tol (EVERY facet, no top-N cap)
  wholeMeshMaxMm: number;     // honest max interior true-3D over ALL facets
  p50: number; p90: number; p99: number;
  bruteCalls: number;
  worstFacet: number;
  worstXyz: [number, number, number];
  advanced: number;           // facets that reached the brute stage (GN screen > gnScreen on some sample)
  scannedFacets: number;      // facets actually scored (= nFacets when stride=1)
  stride: number;
}

// honest per-sample true-3D on an ADVANCED facet. The honest foot = min of:
//   (1) GN WITH the global coarse fallback (projectPointToRadialSurface default) — finds the true basin on
//       smooth/structured surfaces; and
//   (2) the full-azimuth grid brute — corrects GN's wrong-local-minimum overstatement on steep flanks.
// Keeping the SMALLER is honest: the true nearest is <= both, so min(GN_fallback, brute) is the tightest available
// upper bound on the true distance. (The coarse-brute aliasing that mislocates a foot HIGH is corrected by GN;
// GN's wrong-local-min HIGH is corrected by the brute.) Returns {dist, bruteUsed}.
function honestSample(
  px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number, gnScreen: number,
  brute: { nTheta: number; nZ: number; zBandMm: number; refineIters: number },
): { dist: number; bruteUsed: boolean } {
  // GN WITH global fallback (coarseTrigger low) so it does not stall in a wrong local min on the FLAT-facet interior
  // sample (which can sit far from the point's own azimuth on a tangled surface). GN-with-fallback is the honest foot:
  // it resolved Gyroid's on-surface VERTICES to EXACTLY 0 where the coarse GRID brute mislocated them to 0.27mm (grid
  // aliasing on the fine channel walls). So the grid brute is BOTH slower AND less reliable here; GN-fallback is the
  // trusted ruler. The grid brute is kept ONLY as a cross-check tie-break on the reddest samples (dist > 5*tol), where
  // an extra confirm is cheap relative to their rarity, keeping the SMALLER (both are upper bounds on the true dist).
  const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 0.02, maxIter: 40 }).dist;
  if (gn <= gnScreen) return { dist: gn, bruteUsed: false };
  if (gn > 5 * gnScreen) {
    const bf = bruteNearestOnRadialSurface(px, py, pz, rA, H, brute).dist;
    return { dist: Math.min(gn, bf), bruteUsed: true };
  }
  return { dist: gn, bruteUsed: false };
}

/**
 * WHOLE-MESH honest interior ruler over EVERY free facet of a stored mesh (xyz f32, on-surface vertices).
 * No top-N guard cap: every facet whose cheap GN screen exceeds gnScreen is brute-confirmed with a >=36-pt lattice.
 */
export function scoreWholeMeshInterior(
  xyz: Float32Array | Float64Array, idx: Uint32Array | Int32Array, rA: AnalyticRadiusFn, H: number,
  opts: WholeMeshRulerOpts = {},
): WholeMeshRulerResult {
  const tol = opts.tol ?? 0.01;
  const gnScreen = opts.gnScreen ?? tol; // GN is an upper bound => GN<=tol cannot be an outlier; skip brute (honest)
  const brute = {
    nTheta: opts.brute?.nTheta ?? 1024, nZ: opts.brute?.nZ ?? 120,
    zBandMm: opts.brute?.zBandMm ?? 3, refineIters: opts.brute?.refineIters ?? 60,
  };
  const nF = idx.length / 3;
  const stride = Math.max(1, Math.floor(opts.stride ?? 1));
  const dev = new Float64Array(nF); // sparse when stride>1 (only strided facets set)
  let bruteCalls = 0, advanced = 0, worst = 0, worstFacet = -1, nOutRunning = 0, scanned = 0;
  const progEvery = opts.progressEvery ?? Math.max(1, Math.floor((nF / stride) / 200));
  const devScanned: number[] = [];
  for (let f = 0; f < nF; f += stride) {
    scanned++;
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    // ── STAGE 1 (cheap): GN foot of the 4 BARY_FAST samples. Deep-green facets stop here (no brute). ──
    let screen = 0;
    for (const [wa, wb, wc] of BARY_FAST) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      if (gn > screen) screen = gn;
    }
    // ADVANCE if the fast 4-sample screen is within `advMargin` of tol — the 45-pt lattice can peak between the
    // coarse fast samples, so we advance conservatively (0.7*tol) and let the dense+brute stage decide. Deep-green
    // facets (fast screen < 0.7*tol) cannot carry a >tol interior sag on a bounded-curvature facet and stop here.
    const advMargin = 0.7 * gnScreen;
    let d: number;
    if (screen <= advMargin) {
      d = screen; // deep-green: worst fast-sample GN well below tol; cannot be an outlier
    } else {
      // ── STAGE 2 (honest): full denseBary. Per sample: cheap no-fallback GN is an UPPER BOUND on the true dist
      // (local min >= global nearest), so GN_nf <= gnScreen => that sample is <= tol, keep it (no fallback/brute).
      // Only samples whose no-fallback GN EXCEEDS gnScreen get the expensive honest foot = min(GN-fallback, brute).
      // This fires the costly path ONLY on samples genuinely near/over tol => steep-lattice facets converge fast. ──
      advanced++;
      d = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        const gnNf = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
        let ds: number;
        if (gnNf <= gnScreen) { ds = gnNf; } // upper bound already <= tol => cannot be an outlier sample
        else { const h = honestSample(px, py, pz, rA, H, gnScreen, brute); if (h.bruteUsed) bruteCalls++; ds = h.dist; }
        if (ds > d) d = ds;
      }
    }
    dev[f] = d; devScanned.push(d);
    if (d > tol) nOutRunning++;
    if (d > worst) { worst = d; worstFacet = f; }
    if (opts.onProgress && (scanned % progEvery === 0 || f + stride >= nF)) {
      opts.onProgress(f + 1, nF, nOutRunning, worst, bruteCalls);
    }
  }
  let nOut = 0; for (const d of devScanned) if (d > tol) nOut++;
  const sorted = Float64Array.from(devScanned).sort();
  const pc = (q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  let wXyz: [number, number, number] = [0, 0, 0];
  if (worstFacet >= 0) {
    const a = idx[3 * worstFacet], b = idx[3 * worstFacet + 1], c = idx[3 * worstFacet + 2];
    wXyz = [
      (xyz[3 * a] + xyz[3 * b] + xyz[3 * c]) / 3,
      (xyz[3 * a + 1] + xyz[3 * b + 1] + xyz[3 * c + 1]) / 3,
      (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3,
    ];
  }
  return {
    nFacets: nF, interiorOutliers: nOut, wholeMeshMaxMm: +worst.toFixed(6),
    p50: +pc(0.5).toFixed(6), p90: +pc(0.9).toFixed(6), p99: +pc(0.99).toFixed(6),
    bruteCalls, worstFacet, worstXyz: wXyz, advanced, scannedFacets: scanned, stride,
  };
}

// RAW-INDEX non-manifold (literal index, no weld) — undirected edge shared by >2 tris. Matches the pkg probes'
// auditNonManRaw so the re-baseline `watertight` figure is comparable.
export function auditNonManRaw(idx: Uint32Array | Int32Array | ArrayLike<number>): number {
  const ec = new Map<number, number>();
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? p * 33554432 + q : q * 33554432 + p;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

// load a heatmap-bins mesh (xyz f32, idx u32) from a directory + name.
export function loadBinMesh(xyzPath: string, idxPath: string): { xyz: Float32Array; idx: Uint32Array } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const xb = readFileSync(xyzPath); const ib = readFileSync(idxPath);
  const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
  const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  return { xyz, idx };
}

// Sanity-check vertices ARE on the true analytic surface (should be ~0) before trusting the ruler. Reports the
// HONEST foot = min(GN-with-fallback, coarse-brute) — the SAME honest ruler the facet scorer uses — so the gate is
// consistent. If maxVert is NOT ~0 even under the honest foot, the ruler CANNOT trust that style's outlier count
// (the instrument mislocates the surface itself; a documented tangled-lattice ceiling) => the probe FLAGS it.
export function vertexOnSurfaceCheck(
  xyz: Float32Array | Float64Array, rA: AnalyticRadiusFn, H: number, nSample = 200,
): { maxVertMm: number; p99VertMm: number } {
  const nV = xyz.length / 3;
  const stride = Math.max(1, Math.floor(nV / nSample));
  const ds: number[] = [];
  for (let i = 0; i < nV; i += stride) {
    const gn = projectPointToRadialSurface(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], rA, { coarseTrigger: 0.02, maxIter: 40 }).dist;
    let d = gn;
    if (gn > 0.01) d = Math.min(gn, bruteNearestOnRadialSurface(xyz[3 * i], xyz[3 * i + 1], xyz[3 * i + 2], rA, H, { nTheta: 2048, nZ: 400, zBandMm: 3, refineIters: 60 }).dist);
    ds.push(d);
  }
  ds.sort((a, b) => a - b);
  return { maxVertMm: ds.length ? ds[ds.length - 1] : 0, p99VertMm: ds.length ? ds[Math.min(ds.length - 1, Math.floor(0.99 * ds.length))] : 0 };
}
