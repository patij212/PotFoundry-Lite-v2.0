// _gyroid_truthLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-GYROID-TRUTH: resolve the Gyroid INSTRUMENT WALL. On Gyroid (20% relief, fine multi-well r(θ,z))
// neither the V10e θ-window analytic grid brute (grid-trapped, UNDERSTATES ≤0.0225mm) nor the V10b BVH twin
// (band-limits, twinOnSurf 0.05-0.075 >> tol) is a trustworthy true-3D nearest at tol 0.01. The ONE sound
// grid-free instrument banked so far is the RADIAL same-(u,t) bound (strict UPPER bound, OVERSTATES ~2-3× on
// near-vertical channel walls). This lib builds two trustworthy true-3D nearest instruments to break the wall:
//   (1) TRUTH-GRADE BRUTE  — dense full-azimuth grid over the z-band + per-cell local box-refine, with a
//       demonstrated convergence gate (2048×400 → 4096×800 stable to <0.001mm on a subsample before trusting).
//   (2) GRID-FREE NEWTON   — multi-start Gauss-Newton on D(θ,z)=|P−S(θ,z)|² (analytic-FD gradient/Hessian),
//       seeds = a coarse (θ-window × z-band) lattice sized to the well density, each polished to ‖∇‖<1e-9,
//       keep the global min. Validated against (1) on the worst-500 (maxdiff<0.001, no false-0s, µs/query).
//
// ISOLATION: NEW file. Imports labkit + _pf_tangledKernelLib READ-ONLY. NO src/ edit, NO edit to the kernel libs.
import type { AnalyticRadiusFn } from './labkit';

const TAU = 2 * Math.PI;

// ── analytic surface point S(θ,z) and the two nearest instruments ───────────────────────────────────────────────
// S(θ,z) = ( rA(θ,z)·cosθ, rA(θ,z)·sinθ, z ). We minimise D²(θ,z) = |P − S(θ,z)|² over θ∈ℝ (periodic), z∈[0,H].

function surf(rA: AnalyticRadiusFn, th: number, z: number): [number, number, number] {
  const r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z];
}
function d2(rA: AnalyticRadiusFn, px: number, py: number, pz: number, th: number, z: number): number {
  const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z;
  return ex * ex + ey * ey + ez * ez;
}

// ── (1) TRUTH-GRADE BRUTE ────────────────────────────────────────────────────────────────────────────────────────
// Full-azimuth (or θ-windowed) dense grid → keep the K best cells → local box-refine each to machine precision.
// Keeping K best cells (not just the single best) is what defeats the wrong-local-minimum trap of a single-seed
// box-refine: the true global foot on a multi-well surface may not sit in the single lowest coarse cell if the grid
// straddles a well; refining the K lowest coarse cells and taking the min is exact as res→∞ and robust at finite res.
export interface BruteOpts { nTheta: number; nZ: number; zBandMm: number; kBest: number; refineIters: number; thetaWindowRad?: number; }
export function bruteTruth(
  rA: AnalyticRadiusFn, H: number, px: number, py: number, pz: number, opts: BruteOpts,
): { dist: number; theta: number; z: number } {
  const zLo = Math.max(0, pz - opts.zBandMm), zHi = Math.min(H, pz + opts.zBandMm);
  const dth = TAU / opts.nTheta;
  const w = opts.thetaWindowRad;
  const th0 = w !== undefined && w > 0 ? (() => { const a = Math.atan2(py, px); return a < 0 ? a + TAU : a; })() : 0;
  const iLo = w !== undefined && w > 0 ? -Math.ceil(w / dth) : 0;
  const iHi = w !== undefined && w > 0 ? Math.ceil(w / dth) : opts.nTheta - 1;
  // collect the K best coarse cells
  const K = opts.kBest;
  const bestF = new Float64Array(K).fill(Infinity);
  const bestTh = new Float64Array(K), bestZ = new Float64Array(K);
  const consider = (f: number, th: number, z: number): void => {
    // insertion into a small K-sized max-heap-ish array (K is tiny, linear scan is fine)
    let wi = -1, wv = -Infinity; for (let k = 0; k < K; k++) { if (bestF[k] > wv) { wv = bestF[k]; wi = k; } }
    if (f < wv) { bestF[wi] = f; bestTh[wi] = th; bestZ[wi] = z; }
  };
  for (let i = iLo; i <= iHi; i++) {
    const th = th0 + i * dth;
    for (let j = 0; j <= opts.nZ; j++) { const z = zLo + (zHi - zLo) * (j / opts.nZ); consider(d2(rA, px, py, pz, th, z), th, z); }
  }
  // box-refine each of the K best coarse cells; keep the tightest
  let gBest = Infinity, gTh = th0, gZ = pz;
  const hTh0 = dth, hZ0 = (zHi - zLo) / opts.nZ;
  for (let k = 0; k < K; k++) {
    if (!isFinite(bestF[k])) continue;
    let cb = bestF[k], ct = bestTh[k], cz = bestZ[k]; let hTh = hTh0, hZ = hZ0;
    for (let it = 0; it < opts.refineIters; it++) {
      let improved = false;
      for (const ddth of [-hTh, 0, hTh]) for (const ddz of [-hZ, 0, hZ]) {
        if (ddth === 0 && ddz === 0) continue;
        const nz = Math.min(H, Math.max(0, cz + ddz));
        const f = d2(rA, px, py, pz, ct + ddth, nz);
        if (f < cb) { cb = f; ct += ddth; cz = nz; improved = true; }
      }
      if (!improved) { hTh *= 0.5; hZ *= 0.5; }
      if (hTh < 1e-11 && hZ < 1e-11) break;
    }
    if (cb < gBest) { gBest = cb; gTh = ct; gZ = cz; }
  }
  return { dist: Math.sqrt(gBest), theta: gTh, z: gZ };
}

// ── (2) GRID-FREE NEWTON with well-covering multi-start ──────────────────────────────────────────────────────────
// Gyroid r(θ,z) is NOT separably periodic in θ (θ enters via cos/sin nested inside sin/cos) so a closed-form well
// enumeration is not available; instead we cover the (θ-window × z-band) with a COARSE seed lattice whose spacing is
// finer than the well period (the relief plateau/channel structure repeats on a θ-scale ≈ 2π/(2·fScale) and a
// z-scale set by zTpms), then polish EACH seed with damped Gauss-Newton on the analytic (FD) gradient/Hessian of D².
// Keeping the global min over all polished seeds is grid-free (the answer is a continuous optimum, not a grid node)
// and defeats the wrong-local-min trap because every well within the window gets its own descent.
// E-2026-07-08 DIAG2 fix: the true foot on a Gyroid channel-wall point is θ-NARROW (within the radial-bound window
// asin(2·bound/ρ)) and z-SHARP (the smoothstep relief well is steep in z). A ±45° θ-window with 5 z-seeds WANDERS
// and OVERSTATES (facet-max read ~the radial bound). Seeding at the RADIAL-ANCHOR azimuth (θ=atan2(py,px)) with a
// window sized to the radial bound + DENSE z-seeds nails the well: newtonSeeded == windowed brute8192 == FULL
// brute8192 to machine precision on the 3 worst facets (0.0128/0.0113/0.0147). `windowMode:'radialAnchor'` is the
// validated default; the legacy wide-window mode is kept for A/B.
export interface NewtonOpts { seedTheta: number; seedZ: number; nThetaSeeds: number; nZSeeds: number; maxIter: number; windowMode?: 'radialAnchor' | 'wide'; }
// gradient of D² w.r.t (θ,z) by central FD on rA (rA is smooth except at the smoothstep clamp edges; FD h chosen
// small enough to be exact away from a clamp and the multi-start + brute cross-check covers the clamp kinks).
function gradD2(rA: AnalyticRadiusFn, px: number, py: number, pz: number, th: number, z: number): [number, number, number] {
  const hT = 1e-6, hZ = 1e-6;
  const f = d2(rA, px, py, pz, th, z);
  const gTh = (d2(rA, px, py, pz, th + hT, z) - d2(rA, px, py, pz, th - hT, z)) / (2 * hT);
  const gZ = (d2(rA, px, py, pz, th, z + hZ) - d2(rA, px, py, pz, th, z - hZ)) / (2 * hZ);
  return [f, gTh, gZ];
}
export function newtonNearest(
  rA: AnalyticRadiusFn, H: number, px: number, py: number, pz: number, opts: NewtonOpts,
): { dist: number; theta: number; z: number; iters: number } {
  // seed window around the RADIAL-ANCHOR azimuth (validated: the true foot is θ-narrow within the radial-bound
  // window). radialAnchor mode sizes the θ-half-window from the radial bound (asin(2·bound/ρ)+margin) so seeds
  // cluster where the foot actually is; wide mode is the legacy ±45° (kept for A/B).
  const a0 = (() => { const a = Math.atan2(py, px); return a < 0 ? a + TAU : a; })();
  const mode = opts.windowMode ?? 'radialAnchor';
  const rho = Math.hypot(px, py);
  const bnd = Math.abs(rho - rA(a0, Math.min(H, Math.max(0, pz))));
  const thHalf = mode === 'wide'
    ? Math.PI / 4
    : Math.min(Math.PI, Math.asin(Math.min(1, (2 * Math.max(bnd, 0.02)) / Math.max(1e-6, rho))) + 0.1);
  const zHalf = Math.min(H * 0.5, 4); // ±4mm z-band (relief ~0-1.5mm, feet stay local)
  let gBest = Infinity, gTh = a0, gZ = pz, totIter = 0;
  for (let si = 0; si < opts.nThetaSeeds; si++) {
    const sth = a0 + (opts.nThetaSeeds === 1 ? 0 : (si / (opts.nThetaSeeds - 1) - 0.5) * 2 * thHalf);
    for (let sj = 0; sj < opts.nZSeeds; sj++) {
      let z = pz + (opts.nZSeeds === 1 ? 0 : (sj / (opts.nZSeeds - 1) - 0.5) * 2 * zHalf);
      z = Math.min(H, Math.max(0, z));
      let th = sth;
      // damped Gauss-Newton via numeric Hessian (2x2) — robust, no analytic 2nd deriv needed
      let cur = d2(rA, px, py, pz, th, z);
      for (let it = 0; it < opts.maxIter; it++) {
        totIter++;
        const [, gTheta, gZv] = gradD2(rA, px, py, pz, th, z);
        const gnorm = Math.hypot(gTheta, gZv);
        if (gnorm < 1e-9) break;
        // numeric 2x2 Hessian (central FD of the gradient)
        const hT = 1e-5, hZ = 1e-5;
        const gp_t = gradD2(rA, px, py, pz, th + hT, z), gm_t = gradD2(rA, px, py, pz, th - hT, z);
        const gp_z = gradD2(rA, px, py, pz, th, z + hZ), gm_z = gradD2(rA, px, py, pz, th, z - hZ);
        const Htt = (gp_t[1] - gm_t[1]) / (2 * hT), Htz = (gp_t[2] - gm_t[2]) / (2 * hT);
        const Hzt = (gp_z[1] - gm_z[1]) / (2 * hZ), Hzz = (gp_z[2] - gm_z[2]) / (2 * hZ);
        const Hsym_tz = 0.5 * (Htz + Hzt);
        // solve H·δ = −g (regularise if near-singular / indefinite → fall back to gradient step)
        const det = Htt * Hzz - Hsym_tz * Hsym_tz;
        let dth: number, dz: number;
        if (Math.abs(det) > 1e-12 && Htt > 0) {
          dth = -(Hzz * gTheta - Hsym_tz * gZv) / det;
          dz = -(-Hsym_tz * gTheta + Htt * gZv) / det;
        } else { const s = 1e-3; dth = -s * gTheta; dz = -s * gZv; }
        // line search (backtracking) to guarantee descent
        let step = 1, accepted = false;
        for (let ls = 0; ls < 30; ls++) {
          const nth = th + step * dth; const nz = Math.min(H, Math.max(0, z + step * dz));
          const nf = d2(rA, px, py, pz, nth, nz);
          if (nf < cur - 1e-14) { th = nth; z = nz; cur = nf; accepted = true; break; }
          step *= 0.5;
        }
        if (!accepted) break;
      }
      if (cur < gBest) { gBest = cur; gTh = th; gZ = z; }
    }
  }
  // ── COARSE-GRID SEED (basin insurance) ──────────────────────────────────────────────────────────────────────
  // E-2026-07-08 VALIDATE residual: on ~1/60 hard points, EVERY seed-lattice start falls outside the true well's
  // basin so descent stalls at ~the radial upper bound (f=1678065: newton 0.0785 vs truth8192 0.0091). A cheap
  // COARSE windowed grid scan lands a seed INSIDE whatever well the grid can see; polishing its best cell with the
  // same GN descent recovers the well. This is min(seed-lattice, coarse-grid-polished) — grid-free in spirit (the
  // final value is a continuous optimum) but immune to the seed-basin miss. Coarse grid = 256 θ (window) × 400 z.
  {
    const win = thHalf;
    const nT = 256, nZg = 400;
    let cbf = Infinity, cbt = a0, cbz = pz;
    for (let i = 0; i <= nT; i++) {
      const th = a0 + (i / nT - 0.5) * 2 * win;
      for (let j = 0; j <= nZg; j++) { const z = Math.min(H, Math.max(0, pz + (j / nZg - 0.5) * 2 * zHalf)); const f = d2(rA, px, py, pz, th, z); if (f < cbf) { cbf = f; cbt = th; cbz = z; } }
    }
    // FINE 1D z-line scan at the best coarse θ — the Gyroid well is z-SHARP (validated f=1678065: true foot at
    // dz≈-0.009mm; a 0.02mm coarse z-grid + GN misses it, but a fine z-scan finds it). ±2 coarse z-cells, 800 steps.
    const zCell = (2 * zHalf) / nZg; const zc0 = Math.max(0, cbz - 2 * zCell), zc1 = Math.min(H, cbz + 2 * zCell);
    for (let j = 0; j <= 800; j++) { const z = zc0 + (zc1 - zc0) * (j / 800); const f = d2(rA, px, py, pz, cbt, z); if (f < cbf) { cbf = f; cbz = z; } }
    // polish the best coarse cell with GN descent
    let th = cbt, z = cbz, cur = cbf;
    for (let it = 0; it < opts.maxIter; it++) {
      totIter++;
      const [, gTheta, gZv] = gradD2(rA, px, py, pz, th, z);
      if (Math.hypot(gTheta, gZv) < 1e-9) break;
      const hT = 1e-5, hZ = 1e-5;
      const gp_t = gradD2(rA, px, py, pz, th + hT, z), gm_t = gradD2(rA, px, py, pz, th - hT, z);
      const gp_z = gradD2(rA, px, py, pz, th, z + hZ), gm_z = gradD2(rA, px, py, pz, th, z - hZ);
      const Htt = (gp_t[1] - gm_t[1]) / (2 * hT), Htz = (gp_t[2] - gm_t[2]) / (2 * hT);
      const Hzt = (gp_z[1] - gm_z[1]) / (2 * hZ), Hzz = (gp_z[2] - gm_z[2]) / (2 * hZ);
      const Hsym_tz = 0.5 * (Htz + Hzt); const det = Htt * Hzz - Hsym_tz * Hsym_tz;
      let dth: number, dz: number;
      if (Math.abs(det) > 1e-12 && Htt > 0) { dth = -(Hzz * gTheta - Hsym_tz * gZv) / det; dz = -(-Hsym_tz * gTheta + Htt * gZv) / det; }
      else { const s = 1e-3; dth = -s * gTheta; dz = -s * gZv; }
      let step = 1, accepted = false;
      for (let ls = 0; ls < 30; ls++) { const nth = th + step * dth; const nz = Math.min(H, Math.max(0, z + step * dz)); const nf = d2(rA, px, py, pz, nth, nz); if (nf < cur - 1e-14) { th = nth; z = nz; cur = nf; accepted = true; break; } step *= 0.5; }
      if (!accepted) break;
    }
    if (cur < gBest) { gBest = cur; gTh = th; gZ = z; }
  }
  return { dist: Math.sqrt(gBest), theta: gTh, z: gZ, iters: totIter };
}

// ── worst-N facet extraction by the SOUND RADIAL BOUND (the population to floor-truth) ───────────────────────────
// Rebuilds xyz from ut, computes per-facet radial-bound dev over denseBary(8), returns the worst-N facet records
// (facet index + 3 vertex xyz + centroid ut + radial dev) for the truth-grade brute / Newton cross-score.
export function denseBary(n = 8): Array<[number, number, number]> {
  const B: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
  return B;
}
const DENSE = denseBary(8);
export interface FacetRec { f: number; verts: [number, number, number][]; uc: number; tc: number; radialDev: number; }
export function worstFacetsByRadial(
  rA: AnalyticRadiusFn, H: number, ut: number[], idx: Uint32Array, topN: number,
): { recs: FacetRec[]; nFacets: number } {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const bound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > H) return Infinity; const th = Math.atan2(py, px); return Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + TAU : th, pz)); };
  const nF = idx.length / 3;
  const recs: FacetRec[] = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let dv = 0;
    for (const [wa, wb, wc] of DENSE) { const d = bound(wa * ax + wb * bx + wc * cx, wa * ay + wb * by + wc * cy, wa * az + wb * bz + wc * cz); if (d > dv) dv = d; }
    const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    recs.push({ f, verts: [[ax, ay, az], [bx, by, bz], [cx, cy, cz]], uc, tc, radialDev: dv });
  }
  recs.sort((x, y) => y.radialDev - x.radialDev);
  return { recs: recs.slice(0, topN), nFacets: nF };
}

// ── honest per-facet true-3D dev over denseBary(8), given a nearest fn (brute OR newton) ────────────────────────
export function facetTrue3D(
  rec: FacetRec, nearest: (px: number, py: number, pz: number) => number,
): { dev: number; wa: number; wb: number; wc: number } {
  const [A, B, C] = rec.verts;
  let dev = 0, bwa = 1, bwb = 0, bwc = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * A[0] + wb * B[0] + wc * C[0];
    const py = wa * A[1] + wb * B[1] + wc * C[1];
    const pz = wa * A[2] + wb * B[2] + wc * C[2];
    const d = nearest(px, py, pz);
    if (d > dev) { dev = d; bwa = wa; bwb = wb; bwc = wc; }
  }
  return { dev, wa: bwa, wb: bwb, wc: bwc };
}
