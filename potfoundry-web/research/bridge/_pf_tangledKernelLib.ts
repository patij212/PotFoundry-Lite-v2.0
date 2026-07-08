// _pf_tangledKernelLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-TANGLED-KERNEL: dispatch the proven whole-mesh perfect-mesher mechanism (honest true-3D interior
// STOP driver, EVERY-facet acceptance guard) to the TANGLED class (Gyroid/Voronoi/…). Per the spec §4 dispatch
// table the tangled protected complex is EMPTY: "empty complex + interior chord-sag Steiner". So the kernel here is
// exactly the seam-safe inhouse deep-sag mesher (buildInhouseMetricMesh chordSteiner) whose STOP/verdict RULER is
// swapped from the blind SAME-(u,t) RADIAL chord sag to the HONEST true-3D nearest — the identical lever that
// overturned Gothic (spec §V7/V10e: GN/chord driver read 0.0085 while the honest brute saw 0.133).
//
// WHY NOT refineInteriorBruteWhole here: that kernel re-triangulates each pass with a FLAT-rectangle cdt2d, which
// on a FULL RING would leave a seam crack (u=0/u=1 unjoined). The inhouse mesher already produces a watertight ring
// (V10b nonMan=0). So we keep ALL re-triangulation inside the proven seam-safe inhouse mesher and drive it toward
// honest ≤0.01 by tightening chordTolMm, re-scoring EVERY facet with the honest θ-windowed brute after each build.
//
// RULER = the honest two-stage per-facet interior deviation over denseBary(45): same-(u,t) bound (RADIAL PREFILTER,
// analytic-anchored) → GN screen → θ-WINDOWED full-resolution brute. The θ-window is ported VERBATIM (per-sample,
// provably-safe: win = asin(2·bound/ρ) + 12-cell margin ⇒ EXACT-or-overstate) from the production tierC ruler
// (src/…/tierC/interiorRuler.ts, commits 47c5ceb/7098a30). Chosen OVER the BVH twin (which band-limits/UNDERSTATES
// at high curvature = ruler-lied). Full-azimuth fallback (window omitted) is available for cross-check.
//
// ISOLATION: NEW file. Imports labkit + inhouseMetricMesh READ-ONLY. NO src/ edit, NO edit to the proven kernel libs.
import {
  type AnalyticRadiusFn, buildRadiusFn, buildInhouseMetricMesh, projectPointToRadialSurface,
  type StyleDims,
} from './labkit';
import { scoreWholeMeshBVH, buildRadialTwin, twinOnSurfaceResidual, type BvhRulerResult } from './_pf_bvhRuler';
import { buildRefLocator } from './_sharp3dRef';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

// ── denseBary(45) — the ≥36-pt acceptance lattice (identical to the proven kernel) ──────────────────────────────
export function denseBary(n = 8): Array<[number, number, number]> {
  const B: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
  return B; // 45 pts for n=8
}
const DENSE = denseBary(8);

// ── θ-WINDOWED full-resolution brute (ported verbatim from src/…/tierC/interiorRuler.ts) ────────────────────────
// Provably safe: at full angular resolution TAU/nTheta, scanning only [th0-w, th0+w] around the query azimuth is
// EXACT when the true foot lies in the window and can only OVERSTATE otherwise. Never understates (unlike a BVH
// twin band-limit or a FIXED window). The caller derives `w` per-sample from the same-(u,t) bound.
export interface WinBruteOpts { nTheta: number; nZ: number; zBandMm: number; refineIters: number; thetaWindowRad?: number; seedTheta?: number; seedZ?: number; }
// Windowed brute nearest with an OPTIONAL extra box-refine SEED (seedTheta,seedZ) — e.g. the GN-fallback foot's
// (θ,z), so the box-refine has a second start that escapes a wrong coarse-grid local minimum. The θ-window is a
// PROVEN-valid search RANGE for these radial styles (the foot is never geometrically outside asin(2·bound/ρ) —
// measured 0/242 outside on Gyroid), so restricting the coarse grid to the window is exact; the WRONG-LOCAL-MIN
// unreliability of a COARSE grid is fixed by (a) a denser grid and (b) the multi-start box-refine below.
export function bruteWindowed(
  px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number, opts: WinBruteOpts,
): number {
  const d2 = (th: number, z: number): number => {
    const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z;
    return ex * ex + ey * ey + ez * ez;
  };
  const zLo = Math.max(0, pz - opts.zBandMm), zHi = Math.min(H, pz + opts.zBandMm);
  let best = Infinity, bth = 0, bz = pz;
  const dth = TAU / opts.nTheta;
  const w = opts.thetaWindowRad;
  const th0 = w !== undefined && w > 0 ? (() => { const a = Math.atan2(py, px); return a < 0 ? a + TAU : a; })() : 0;
  const iLo = w !== undefined && w > 0 ? -Math.ceil(w / dth) : 0;
  const iHi = w !== undefined && w > 0 ? Math.ceil(w / dth) : opts.nTheta - 1;
  for (let i = iLo; i <= iHi; i++) {
    const th = th0 + i * dth; // d2 uses cos/sin — no wrap needed
    for (let j = 0; j <= opts.nZ; j++) { const z = zLo + (zHi - zLo) * (j / opts.nZ); const f = d2(th, z); if (f < best) { best = f; bth = th; bz = z; } }
  }
  // second start: the GN-fallback foot (if provided) — box-refine from BOTH, keep the better. Escapes the coarse
  // grid wrong-local-min that made the plain 1024×120 brute lie ±0.024mm on Gyroid (measured vs 4096×800 truth).
  const starts: Array<[number, number, number]> = [[best, bth, bz]];
  if (opts.seedTheta !== undefined && opts.seedZ !== undefined) { const fs = d2(opts.seedTheta, opts.seedZ); starts.push([fs, opts.seedTheta, opts.seedZ]); }
  let gBest = Infinity;
  for (const [b0, t0, z0] of starts) {
    let cb = b0, ct = t0, cz = z0; let hTh = TAU / opts.nTheta, hZ = (zHi - zLo) / opts.nZ;
    for (let it = 0; it < opts.refineIters; it++) {
      let improved = false;
      for (const ddth of [-hTh, 0, hTh]) for (const ddz of [-hZ, 0, hZ]) { const f = d2(ct + ddth, cz + ddz); if (f < cb) { cb = f; ct += ddth; cz += ddz; improved = true; } }
      if (!improved) { hTh *= 0.5; hZ *= 0.5; }
      if (hTh < 1e-10 && hZ < 1e-10) break;
    }
    if (cb < gBest) gBest = cb;
  }
  return Math.sqrt(gBest);
}

export interface WinRuler { preFilter: number; gnScreen: number; nTheta: number; nZ: number; zBandMm: number; refineIters: number; fullAzimuth?: boolean; }
// DENSER grid than the Gothic-era 1024×120 default: on Gyroid (20% relief, fine channels) the coarse grid + box-
// refine lied ±0.024mm vs a 4096×800 truth (E-2026-07-08 diag). 2048×200 + the GN-fallback multi-start box-refine
// (min(GN-fallback, windowed-brute)) restores an honest tight upper bound. preFilter/gnScreen 0.006 keep the cheap
// same-(u,t) RADIAL PREFILTER (analytic-anchored, immune to grid) as the deep-green screen.
export const DEFAULT_WIN_RULER: WinRuler = { preFilter: 0.006, gnScreen: 0.006, nTheta: 2048, nZ: 200, zBandMm: 3, refineIters: 60 };

// ── honest per-facet interior deviation (θ-windowed), denseBary(45) ─────────────────────────────────────────────
export interface FacetDev { dev: number; uWorst: number; tWorst: number; bruteCalls: number; }
export function facetInteriorWin(
  rA: AnalyticRadiusFn, H: number, xyz: Float64Array, uv: number[], a: number, b: number, c: number, ruler: WinRuler,
): FacetDev {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
  const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => {
    const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z);
    return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
  };
  let dev = 0, uW = (ua + ub + uc) / 3, tW = (ta + tb + tc) / 3, bruteCalls = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
    const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
    const bound = utBound(px, py, pz, um, tm);
    let d: number;
    if (bound <= ruler.preFilter) { d = bound; } // deep-green (radial prefilter): true ≤ bound ≤ tol
    else {
      // no-fallback GN = upper bound on true dist (local min ≥ global). Cheap screen.
      const gnNf = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      if (gnNf <= ruler.gnScreen) { d = gnNf; }
      else {
        // HONEST foot = min( GN-with-global-fallback , θ-windowed brute seeded at the GN foot ). GN-fallback
        // resolves Gyroid feet the coarse grid mislocates (rebaselineRuler finding); the windowed brute corrects
        // GN's wrong-local-min on steep flanks. Both are upper bounds ⇒ min is the tightest honest value.
        const gp = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 0.02, maxIter: 60 });
        const rho = Math.hypot(px, py);
        const win = ruler.fullAzimuth ? undefined
          : Math.min(Math.PI, Math.asin(Math.min(1, (2 * bound) / Math.max(1e-6, rho))) + 12 * (TAU / ruler.nTheta));
        const bw = bruteWindowed(px, py, pz, rA, H, { nTheta: ruler.nTheta, nZ: ruler.nZ, zBandMm: ruler.zBandMm, refineIters: ruler.refineIters, thetaWindowRad: win, seedTheta: gp.theta, seedZ: gp.z });
        d = Math.min(gp.dist, bw);
        bruteCalls++;
      }
    }
    if (d > dev) { dev = d; uW = um; tW = tm; }
  }
  return { dev, uWorst: uW, tWorst: tW, bruteCalls };
}

// ── whole-mesh honest guard (EVERY facet, no top-N) — the acceptance verdict AND the refine STOP driver ──────────
export interface WholeScore {
  nFacets: number; outliers: number; maxMm: number; p50: number; p90: number; p99: number;
  bruteCalls: number; advanced: number; worstFacet: number; worstUt: [number, number]; zeroArea: number;
  outlierUt: Array<[number, number, number]>; // (uc, tc, dev) of up to 300 worst outliers, for floor localization
}
export function wholeMeshGuardWin(
  rA: AnalyticRadiusFn, H: number, ut: number[], idx: ArrayLike<number>, tol: number, ruler: WinRuler,
  onProgress?: (done: number, total: number, nOut: number, worst: number, brute: number) => void,
): WholeScore {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const nF = idx.length / 3; const dev = new Float64Array(nF);
  let brute = 0, advanced = 0, worst = 0, worstFacet = -1, nOut = 0, zeroArea = 0;
  const outs: Array<[number, number, number]> = [];
  const progEvery = Math.max(1, Math.floor(nF / 200));
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    // zero-area (degenerate) facet in 3D — collapse candidate (slicer safety)
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const abx = xyz[3 * b] - ax, aby = xyz[3 * b + 1] - ay, abz = xyz[3 * b + 2] - az;
    const acx = xyz[3 * c] - ax, acy = xyz[3 * c + 1] - ay, acz = xyz[3 * c + 2] - az;
    const crx = aby * acz - abz * acy, cry = abz * acx - abx * acz, crz = abx * acy - aby * acx;
    const area2 = crx * crx + cry * cry + crz * crz;
    if (area2 < 1e-20) zeroArea++;
    const g = facetInteriorWin(rA, H, xyz, ut, a, b, c, ruler);
    if (g.bruteCalls > 0) advanced++;
    brute += g.bruteCalls; dev[f] = g.dev;
    if (g.dev > worst) { worst = g.dev; worstFacet = f; }
    if (g.dev > tol) {
      nOut++;
      const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      if (outs.length < 300) outs.push([+uc.toFixed(5), +tc.toFixed(5), +g.dev.toFixed(5)]);
    }
    if (onProgress && (f % progEvery === 0 || f === nF - 1)) onProgress(f + 1, nF, nOut, worst, brute);
  }
  const sorted = Float64Array.from(dev).sort();
  const pc = (q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  outs.sort((x, y) => y[2] - x[2]);
  let wUt: [number, number] = [0, 0];
  if (worstFacet >= 0) { const a = idx[3 * worstFacet], b = idx[3 * worstFacet + 1], c = idx[3 * worstFacet + 2]; wUt = [(ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3]; }
  return {
    nFacets: nF, outliers: nOut, maxMm: +worst.toFixed(6),
    p50: +pc(0.5).toFixed(6), p90: +pc(0.9).toFixed(6), p99: +pc(0.99).toFixed(6),
    bruteCalls: brute, advanced, worstFacet, worstUt: wUt, zeroArea, outlierUt: outs.slice(0, 300),
  };
}

// ── SOUND grid-free guard: the radial same-(u,t) bound is a STRICT analytic upper bound on true-3D nearest ───────
// E-2026-07-08 metrology wall: on Gyroid BOTH grid instruments fail at tol 0.01 — the θ-window analytic brute LIES
// (grid-trapped ±0.024mm, measured) AND the BVH twin BAND-LIMITS (twinOnSurf max 0.075 @2048² / ~0.05 @3072² >> tol,
// its outlier count/max are twin-artifact-contaminated). The ONE sound, grid-free instrument is the radial bound
// |hypot(x,y) − rA(atan2,z)|: S(atan2,z) IS on the surface ⇒ this is a STRICT UPPER bound on the true nearest for
// z∈[0,H]. Hence a facet whose worst-sample radial bound ≤ tol is PROVABLY ≤tol (no grid, no twin). The count of
// facets with bound > tol is a SOUND UPPER BOUND on true outliers (overstates ~2× on Gyroid where radial > true-3D,
// but 0 here ⇒ PROVABLY whole-mesh ≤tol — the strongest possible verdict). This is the PRIMARY driver + verdict.
export interface SoundScore {
  nFacets: number; outliers: number; maxMm: number; p50: number; p90: number; p99: number; zeroArea: number;
  outlierUt: Array<[number, number, number]>;
}
export function wholeMeshGuardRadialBound(
  rA: AnalyticRadiusFn, H: number, ut: number[], idx: Uint32Array, tol: number,
): SoundScore {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const bound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > H) return Infinity; const th = Math.atan2(py, px); return Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + TAU : th, pz)); };
  const nF = idx.length / 3; const dev = new Float64Array(nF);
  let outliers = 0, worst = 0, zeroArea = 0; const outs: Array<[number, number, number]> = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
    const crx = aby * acz - abz * acy, cry = abz * acx - abx * acz, crz = abx * acy - aby * acx;
    if (crx * crx + cry * cry + crz * crz < 1e-20) zeroArea++;
    let dv = 0;
    for (const [wa, wb, wc] of DENSE) { const d = bound(wa * ax + wb * bx + wc * cx, wa * ay + wb * by + wc * cy, wa * az + wb * bz + wc * cz); if (d > dv) dv = d; }
    dev[f] = dv;
    if (dv > worst) worst = dv;
    if (dv > tol) { outliers++; if (outs.length < 300) { const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3; outs.push([+uc.toFixed(5), +tc.toFixed(5), +dv.toFixed(5)]); } }
  }
  const s = Float64Array.from(dev).sort();
  const pc = (q: number): number => s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
  outs.sort((x, y) => y[2] - x[2]);
  return { nFacets: nF, outliers, maxMm: +worst.toFixed(6), p50: +pc(0.5).toFixed(6), p90: +pc(0.9).toFixed(6), p99: +pc(0.99).toFixed(6), zeroArea, outlierUt: outs.slice(0, 300) };
}

// ── BVH whole-mesh guard (the V10b VERDICT basis) — dense radial twin + radial prefilter, EVERY facet ────────────
// This is the DECISION instrument (E-2026-07-08 INSTRUMENT_FINDING: the θ-window analytic grid brute LIES on Gyroid
// ±0.024mm — grid-trapped in wrong local minima on the fine multi-well surface; the BVH twin + radial prefilter is
// the sound, V10b-comparable basis). twinRes 3072² is the V10b density; twinOnSurfaceResidual gates the band-limit.
export interface BvhWhole extends BvhRulerResult { zeroArea: number; twinOnSurfMax: number; outlierUt: Array<[number, number, number]>; }
export function wholeMeshGuardBVH(
  rA: AnalyticRadiusFn, H: number, ut: number[], idx: Uint32Array, tol: number,
  twinRes: { nTheta: number; nZ: number } = { nTheta: 3072, nZ: 3072 },
  onProgress?: (done: number, total: number, nOut: number, worst: number) => void,
): BvhWhole {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  // zero-area facets (3D degenerate)
  let zeroArea = 0; const nF = idx.length / 3;
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const abx = xyz[3 * b] - ax, aby = xyz[3 * b + 1] - ay, abz = xyz[3 * b + 2] - az;
    const acx = xyz[3 * c] - ax, acy = xyz[3 * c + 1] - ay, acz = xyz[3 * c + 2] - az;
    const crx = aby * acz - abz * acy, cry = abz * acx - abx * acz, crz = abx * acy - aby * acx;
    if (crx * crx + cry * cry + crz * crz < 1e-20) zeroArea++;
  }
  const s = scoreWholeMeshBVH(xyz, idx, rA, H, twinRes, { tol, radialPrefilter: true, twinValidate: 'full', onProgress });
  // localize the worst outliers (u,t) for floor characterization: re-score the worst facet's neighborhood cheaply.
  // scoreWholeMeshBVH does not return per-facet outlier lists, so re-run a light BVH pass collecting outlier (u,t).
  const outlierUt: Array<[number, number, number]> = [];
  if (s.interiorOutliers > 0) {
    const twin = buildRadialTwin(rA, H, twinRes.nTheta, twinRes.nZ);
    const loc = buildRefLocator(twin, 3.0);
    for (let f = 0; f < nF && outlierUt.length < 300; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      // cheap centroid+verts screen before the dense pass (matches the guard's prefilter intent)
      let dv = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        const d = loc.dist(px, py, pz); if (d > dv) dv = d;
        if (dv > tol) break;
      }
      if (dv > tol) { const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3; outlierUt.push([+uc.toFixed(5), +tc.toFixed(5), +dv.toFixed(5)]); }
    }
    outlierUt.sort((x, y) => y[2] - x[2]);
  }
  return { ...s, zeroArea, twinOnSurfMax: s.twinOnSurfMaxMm, outlierUt: outlierUt.slice(0, 300) };
}

// twin band-limit gate helper (report the twin's own on-surface residual for the chosen density)
export function twinBandLimit(rA: AnalyticRadiusFn, H: number, twinRes: { nTheta: number; nZ: number }): { maxMm: number; p99Mm: number } {
  const twin = buildRadialTwin(rA, H, twinRes.nTheta, twinRes.nZ);
  const loc = buildRefLocator(twin, 3.0);
  const r = twinOnSurfaceResidual(loc, rA, H, twinRes.nTheta, twinRes.nZ, 4);
  return { maxMm: r.maxMm, p99Mm: r.p99Mm };
}

// ── watertight by INDEX (3D-weld: shared-vertex-by-position, non-vacuous) ───────────────────────────────────────
// The inhouse ring output shares vertices by INDEX already (single vertex list). Raw-index non-manifold = an
// undirected edge shared by >2 triangles. Non-vacuous: an injected 3rd-tri-on-edge must move the count.
export function auditNonManRaw(idx: ArrayLike<number>): number {
  const ec = new Map<number, number>();
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? p * 33554432 + q : q * 33554432 + p; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

// ── the tangled-kernel build: seam-safe inhouse deep-sag mesher, driven toward honest ≤tol ──────────────────────
export interface TangledOpts {
  chordTolMm: number;   // deep-sag chord tolerance (the density lever)
  maxPoints: number;    // budget cap for THIS build
  tolMm?: number; hMin?: number; hMax?: number; sizeRes?: number; gradeBeta?: number; seedN?: number; splitThresh?: number;
  // E-2026-07-08 PI relay (smooth-tail §V11a): the post-refinement Laplacian smoothing SWEEPS re-introduce chord sag
  // AFTER the deep-sag guard runs (they slide vertices off the crest/valley). sweeps:0 was the fix on the two hardest
  // smooth styles. And the default 4-pt chord guard is BLIND between samples → chordSampleN:8 (opt-in, byte-identical
  // default) makes the deep-sag guard see the interior. Both are load-bearing for the tangled close.
  optimizeSweeps?: number; chordSampleN?: number;
}
export const TANGLED_BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;

export interface TangledBuild { ut: number[]; idx: Uint32Array; tris: number; points: number; hitBudget: boolean; ms: number; }
export function buildTangled(style: StyleId, dims: StyleDims, opts: TangledOpts): TangledBuild {
  const rA = buildRadiusFn(style, {}, dims);
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, dims.H, {
    ...TANGLED_BASE,
    tolMm: opts.tolMm ?? TANGLED_BASE.tolMm, hMin: opts.hMin ?? TANGLED_BASE.hMin, hMax: opts.hMax ?? TANGLED_BASE.hMax,
    sizeRes: opts.sizeRes ?? TANGLED_BASE.sizeRes, gradeBeta: opts.gradeBeta ?? TANGLED_BASE.gradeBeta,
    seedN: opts.seedN ?? TANGLED_BASE.seedN, splitThresh: opts.splitThresh ?? TANGLED_BASE.splitThresh,
    maxPoints: opts.maxPoints, optimizeSweeps: opts.optimizeSweeps ?? 2,
    guardManifoldAlways: true, chordTolMm: opts.chordTolMm, chordSteiner: true,
    ...(opts.chordSampleN !== undefined ? { chordSampleN: opts.chordSampleN } : {}),
  });
  return { ut: mesh.ut, idx: mesh.indices, tris: mesh.indices.length / 3, points: mesh.points, hitBudget: mesh.hitBudget, ms: Date.now() - t0 };
}

export function radiusFn(style: StyleId, dims: StyleDims): AnalyticRadiusFn { return buildRadiusFn(style, {}, dims); }
