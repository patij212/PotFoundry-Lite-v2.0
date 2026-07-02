// _sfbPushLib.ts — DEV-ONLY (research/ only; src/ must never import this). ISOLATED helpers for
// TEAM-A SFB-PUSH (E-2026-07-02-SFB-PUSH). Drive SuperformulaBlossom@1 to the RAISED STANDARD
// (<=0.01mm true-3D chord against the ACTUAL 3D object). Every helper here COPIES nothing from src/;
// it only reads the analytic rA closure + reuses committed research helpers (labkit, _sharp3dRef,
// refineLoci, planarizeSkeleton). Edits nothing in src/ or existing research files.
//
// The trusted true-3D ruler: SFB@1 is single-valued r=rA(theta,z) (NO radius steps), so the closed
// 3D object IS the parametric sheet — a DENSE sheet reference + BVH (_sharp3dRef buildStepReference
// with rings=[]) gives a trustworthy facet->nearest-surface distance that is IMMUNE to the GN
// wrong-local-minimum overstatement bug the labkit perFaceTrue3DSag hits on steep relief
// (E-2026-07-02-STEEP-HETEROGENEITY F2). We ALWAYS cross-check with brute-force nearest on the worst
// facets (buildRefLocator.bruteDist).

import { buildStepReference, buildRefLocator, type RefMesh, type RefLocator } from './_sharp3dRef';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

/** Facet interior sample barycentrics: 3 edge-midpoints + centroid (matches labkit SAG_BARY). */
export const SAG_BARY: ReadonlyArray<readonly [number, number, number]> = [
  [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3],
];

/**
 * ANALYTIC petal ridge/valley tracer for SuperformulaBlossom (single-valued r=rA(theta,z)).
 * For each z-row, find ALL radial maxima (petal tips = crests) and minima (valleys) in theta by a dense
 * scan + golden-section refine, then LINK across rows into continuous loci u_feat(t) from t=0 to t=1
 * (nearest-in-theta greedy tracking, seam-aware). This is the fix for the E-2026-07-02-SFB-PUSH-DIAG
 * finding that segmentsFromLines DROPS the seam-crossing + rim-band ridge segments (the dominant residual).
 * Ridges reach t=0 and t=1 BY CONSTRUCTION and seam-crossing chains are split at u=0/u=1 so both sides
 * get a boundary endpoint (the kernel welds u=0 == u=1 at the periodic seam).
 *
 * Returns polylines in (u,t); each is a monotone-in-t chain (already seam-split so no segment wraps u).
 */
export function tracePetalLoci(
  rA: AnalyticRadiusFn, H: number,
  opts: { nRows: number; thetaScan: number; kind: 'crest' | 'valley' | 'both' } = { nRows: 481, thetaScan: 4000, kind: 'both' },
): Array<{ points: { u: number; t: number }[]; label: string }> {
  const { nRows, thetaScan } = opts;
  const rowU = (t: number, sign: number): number[] => {
    // sign +1 => maxima (crest), -1 => minima (valley). Dense scan then refine each local extremum.
    const z = t * H;
    const rAt = (th: number): number => sign * rA(TAU * ((th % 1) + (th < 0 ? 1 : 0)), z);
    const N = thetaScan;
    const vals = new Float64Array(N);
    for (let i = 0; i < N; i++) vals[i] = rAt(i / N);
    const found: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = vals[(i - 1 + N) % N], b = vals[i], c = vals[(i + 1) % N];
      if (b >= a && b > c) {
        // golden-section refine on [i-1, i+1]/N
        let lo = (i - 1) / N, hi = (i + 1) / N; const gr = (Math.sqrt(5) - 1) / 2;
        let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = rAt(c1), f2 = rAt(c2);
        for (let it = 0; it < 50 && hi - lo > 1e-7; it++) {
          if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = rAt(c2); }
          else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = rAt(c1); }
        }
        let u = (lo + hi) / 2; u -= Math.floor(u); found.push(u);
      }
    }
    found.sort((a, b) => a - b);
    return found;
  };
  const rows: number[][] = []; // per-row sorted extremum u's
  const signs = opts.kind === 'crest' ? [1] : opts.kind === 'valley' ? [-1] : [1, -1];
  const out: Array<{ points: { u: number; t: number }[]; label: string }> = [];
  for (const sign of signs) {
    const label = sign > 0 ? 'crest' : 'valley';
    rows.length = 0;
    for (let r = 0; r < nRows; r++) { const t = r / (nRows - 1); rows.push(rowU(t, sign)); }
    // Greedy nearest-in-theta linking across rows. Track chains; each chain is a list of {u,t,rowIdx}.
    type Node = { u: number; t: number };
    const chains: Node[][] = [];
    const used: boolean[][] = rows.map((r) => r.map(() => false));
    const cyc = (a: number, b: number): number => { let d = Math.abs(a - b); if (d > 0.5) d = 1 - d; return d; };
    for (let r0 = 0; r0 < nRows; r0++) {
      for (let k0 = 0; k0 < rows[r0].length; k0++) {
        if (used[r0][k0]) continue;
        const chain: Node[] = [{ u: rows[r0][k0], t: r0 / (nRows - 1) }]; used[r0][k0] = true;
        let curU = rows[r0][k0];
        for (let r = r0 + 1; r < nRows; r++) {
          let best = -1, bd = 0.06; // max theta drift per row-link (u units)
          for (let k = 0; k < rows[r].length; k++) { if (used[r][k]) continue; const d = cyc(curU, rows[r][k]); if (d < bd) { bd = d; best = k; } }
          if (best < 0) break;
          used[r][best] = true; curU = rows[r][best]; chain.push({ u: curU, t: r / (nRows - 1) });
        }
        if (chain.length >= 2) chains.push(chain);
      }
    }
    // Seam-split each chain: wherever a link crosses u=0/1, cut and (optionally) insert boundary endpoints.
    for (const chain of chains) {
      let cur: Node[] = [chain[0]];
      for (let i = 1; i < chain.length; i++) {
        const p = chain[i - 1], q = chain[i];
        let du = q.u - p.u;
        if (Math.abs(du) > 0.5) {
          // seam cross: linearly interpolate the t at u=0/1 crossing and cut both sides at the boundary
          const wrapUp = du < 0; // p near 1, q near 0 (increasing u wraps down) OR p near 0, q near 1
          const pu = p.u, qu = q.u + (wrapUp ? 1 : -1);
          // Place the seam-crossing endpoints JUST INSIDE the seam (u=1-eps and u=eps), NOT exactly at
          // u=0/1. Exact-u=1 pileups triangulate into degenerate zero-u-width slivers along the seam
          // (FACET-INSPECT: all-u=1 slivers, ownSag=0, but the metric mis-reads them as 0.034). The kernel's
          // periodic-u triangulation bridges the tiny 2*eps gap; the two endpoints are the same 3D point.
          const EPS = 5e-4;
          const uCross = wrapUp ? 1 : 0;
          const f = (uCross - pu) / (qu - pu);
          const tCross = p.t + (q.t - p.t) * f;
          cur.push({ u: wrapUp ? 1 - EPS : EPS, t: tCross });
          if (cur.length >= 2) out.push({ points: cur, label });
          cur = [{ u: wrapUp ? EPS : 1 - EPS, t: tCross }, q];
        } else {
          cur.push(q);
        }
      }
      if (cur.length >= 2) out.push({ points: cur, label });
    }
  }
  // REFINE every point to the TRUE row extremum nearest its u (fixes interpolated seam-cross/endpoint
  // points that sat off-ridge). Search a narrow window around u; keep u at the boundary if it is one.
  const refinePoint = (u: number, t: number, sign: number): number => {
    const onSeam = u < 1e-6 || u > 1 - 1e-6;
    const z = t * H;
    const rAt = (th: number): number => sign * rA(TAU * (((th % 1) + 1) % 1), z);
    // golden-section on [u-win, u+win]; for seam points center at 0 and search both sides via wrap
    const win = onSeam ? 0.0 : 0.04; // seam points: the ridge IS at the seam by construction, keep u
    if (onSeam) return u;
    let lo = u - win, hi = u + win; const gr = (Math.sqrt(5) - 1) / 2;
    let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = rAt(c1), f2 = rAt(c2);
    for (let it = 0; it < 40 && hi - lo > 1e-7; it++) {
      if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = rAt(c2); }
      else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = rAt(c1); }
    }
    let ur = (lo + hi) / 2; ur = ((ur % 1) + 1) % 1; return ur;
  };
  for (const ln of out) {
    const sign = ln.label === 'crest' ? 1 : -1;
    for (const p of ln.points) p.u = refinePoint(p.u, p.t, sign);
  }
  return out;
}

/**
 * TIP LADDER: for each traced ridge point, emit a graded ladder of companion points PERPENDICULAR to the
 * local ridge tangent on BOTH shoulders, at FINE arc spacings near the cusp (e.g. 0.02, 0.05, 0.1, 0.2mm).
 * This FORCES sub-metric-scale cells exactly at the fractional-power tip cusps that the band-limited metric
 * field cannot resolve (CORNER-CLASS: arc ~0.025mm reaches 0.01 at exp 0.86). The kernel's injectedPoints
 * mechanism seeds these; the fine base metric keeps them (they fall in already-fine cells so are not deduped
 * away as they were in the coarse regime). Returns flat (u,t) pairs to append to the skeleton.
 *
 * @param loci traced ridge/valley polylines (from tracePetalLoci).
 * @param offsetsMm perpendicular offsets (mm) on EACH side of the ridge (graded fine->coarse).
 * @param uToMm u->mm scale (ring circ ~ 2*pi*Rt).
 */
export function tipLadderPoints(
  loci: Array<{ points: { u: number; t: number }[]; label: string }>,
  offsetsMm: number[], uToMm: number, H: number,
): number[] {
  const out: number[] = [];
  for (const ln of loci) {
    const pts = ln.points;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let du = b.u - a.u; if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
      const dt = b.t - a.t;
      const txMm = du * uToMm, tyMm = dt * H; const L = Math.hypot(txMm, tyMm) || 1;
      // perpendicular unit (in mm), converted to (u,t) deltas per mm
      const perpU = (-tyMm / L) / uToMm, perpT = (txMm / L) / H;
      for (const off of offsetsMm) {
        for (const s of [off, -off]) {
          let u = p.u + s * perpU; u -= Math.floor(u);
          const t = Math.min(1, Math.max(0, p.t + s * perpT));
          out.push(u, t);
        }
      }
    }
  }
  return out;
}

/** Build the DENSE closed-3D reference of a single-valued style (rings=[]) + a BVH locator. */
export function buildSheetRefLocator(
  rA: AnalyticRadiusFn, H: number, nTheta: number, nZ: number, cell = 2.0,
): { ref: RefMesh; loc: RefLocator } {
  // rings=[] => buildStepReference builds a pure sheet (bottom row + nZperBand interior rows + top row).
  const ref = buildStepReference(rA, H, [], { nTheta, nZperBand: nZ, zEps: 1e-4 });
  const loc = buildRefLocator(ref, cell);
  return { ref, loc };
}

export interface TrueSagResult {
  faceErr: Float64Array;   // per-face max BVH sag (mm)
  vertErr: Float64Array;   // per-vertex max incident-face sag (mm) for heatmap
  worstMm: number;
  p99Mm: number;
  p50Mm: number;
  worstFace: number;
  fracOver: (mm: number) => number;
  nOver: (mm: number) => number;
}

/**
 * Per-face TRUE-3D sag via the BVH reference (nearest point on the dense reference mesh from each
 * facet interior sample). This is the HONEST ruler (immune to GN local-minimum overstatement).
 * @param xyz lifted 3D vertex positions (Float64/Float32).
 */
export function perFaceTrueSagBVH(
  xyz: ArrayLike<number>, indices: ArrayLike<number>, loc: RefLocator,
): TrueSagResult {
  const nF = indices.length / 3;
  const nV = xyz.length / 3;
  const faceErr = new Float64Array(nF);
  const vertErr = new Float64Array(nV);
  let worst = 0, worstFace = -1;
  for (let f = 0; f < nF; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let err = 0;
    for (const [wa, wb, wc] of SAG_BARY) {
      const px = wa * ax + wb * bx + wc * cx;
      const py = wa * ay + wb * by + wc * cy;
      const pz = wa * az + wb * bz + wc * cz;
      const d = loc.dist(px, py, pz);
      if (d > err) err = d;
    }
    faceErr[f] = err;
    if (err > worst) { worst = err; worstFace = f; }
    if (err > vertErr[a]) vertErr[a] = err;
    if (err > vertErr[b]) vertErr[b] = err;
    if (err > vertErr[c]) vertErr[c] = err;
  }
  const sorted = Float64Array.from(faceErr).sort();
  const p = (q: number): number => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0);
  const fracOver = (mm: number): number => { let o = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > mm) o++; return nF ? o / nF : 0; };
  const nOver = (mm: number): number => { let o = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > mm) o++; return o; };
  return { faceErr, vertErr, worstMm: worst, p99Mm: p(0.99), p50Mm: p(0.5), worstFace, fracOver, nOver };
}

/**
 * Adversarial cross-check: for the top-K worst facets by BVH sag, recompute the worst-sample distance
 * with brute-force nearest-triangle. Returns the max ratio |bruteWorst/bvhWorst| and the max abs diff.
 * A ratio ~1 (diff ~machine-eps) confirms the BVH is trustworthy; a big brute>bvh means the BVH shell
 * search missed the true nearest tri (should not happen with a full-coverage grid).
 */
export function adversarialBVH(
  xyz: ArrayLike<number>, indices: ArrayLike<number>, loc: RefLocator, faceErr: Float64Array, topK = 50,
): { maxRatio: number; maxDiffMm: number; worstBvh: number; worstBrute: number } {
  const nF = indices.length / 3;
  const order = Array.from({ length: nF }, (_, f) => f).sort((x, y) => faceErr[y] - faceErr[x]).slice(0, topK);
  let maxRatio = 0, maxDiff = 0, worstBvh = 0, worstBrute = 0;
  for (const f of order) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    for (const [wa, wb, wc] of SAG_BARY) {
      const px = wa * ax + wb * bx + wc * cx;
      const py = wa * ay + wb * by + wc * cy;
      const pz = wa * az + wb * bz + wc * cz;
      const dBvh = loc.dist(px, py, pz);
      const dBrute = loc.bruteDist(px, py, pz);
      const ratio = dBvh > 1e-9 ? dBrute / dBvh : 1;
      if (ratio > maxRatio) maxRatio = ratio;
      const diff = Math.abs(dBrute - dBvh);
      if (diff > maxDiff) { maxDiff = diff; worstBvh = dBvh; worstBrute = dBrute; }
    }
  }
  return { maxRatio, maxDiffMm: maxDiff, worstBvh, worstBrute };
}

/**
 * TRUSTED-WORST: given a CHEAP per-face faceErr (labkit perFaceTrue3DSag GN, or radial), re-measure the
 * top-K worst facets with the trusted BVH ruler (per-sample bruteDist is exact). This is the fast path:
 * the GN/radial pre-filter is O(nF) cheap; the BVH runs only on ~K facets. Returns the BVH-trusted worst,
 * the list of over-tol facets (BVH sag > tolMm) with their worst (u,t) sample, and adversarial ratio.
 */
export function trustedWorst(
  ut: number[], xyz: ArrayLike<number>, indices: ArrayLike<number>, cheapFaceErr: Float64Array,
  loc: RefLocator, topK: number, tolMm: number,
): {
  worstMm: number; nOverTol: number; overFacets: Array<{ f: number; sag: number; u: number; t: number }>;
  advMaxRatio: number;
} {
  const nF = indices.length / 3;
  const order = Array.from({ length: nF }, (_, f) => f).sort((x, y) => cheapFaceErr[y] - cheapFaceErr[x]).slice(0, topK);
  let worst = 0, advMaxRatio = 0;
  const overFacets: Array<{ f: number; sag: number; u: number; t: number }> = [];
  for (const f of order) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let fSag = 0, bestBary = SAG_BARY[3];
    for (const bary of SAG_BARY) {
      const [wa, wb, wc] = bary;
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const d = loc.dist(px, py, pz);
      const dBrute = loc.bruteDist(px, py, pz);
      const ratio = d > 1e-9 ? dBrute / d : 1;
      if (ratio > advMaxRatio) advMaxRatio = ratio;
      const dTrust = Math.min(d, dBrute); // trust the smaller (brute is exact; if BVH shell missed, brute wins)
      if (dTrust > fSag) { fSag = dTrust; bestBary = bary; }
    }
    if (fSag > worst) worst = fSag;
    if (fSag > tolMm) {
      // (u,t) of the worst sample: bary-blend the facet's (u,t) (seam-normalized)
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
      const [wa, wb, wc] = bestBary;
      let u = wa * ua + wb * ub + wc * uc; u -= Math.floor(u);
      const t = wa * ta + wb * tb + wc * tc;
      overFacets.push({ f, sag: fSag, u, t });
    }
  }
  return { worstMm: worst, nOverTol: overFacets.length, overFacets, advMaxRatio };
}

/**
 * ANALYTIC brute-force nearest-surface distance (the trusted wrong-well guard for a SINGLE-VALUED style).
 * Scans theta over the FULL circle (coarse grid) at the sample's z, and also a small z-window, evaluating
 * the EXACT analytic rA (NOT a discretized reference), then golden-refines the best. This is the honest
 * ruler for SFB@1: projectPointToRadialSurface (GN) can converge to a wrong local well on a cusp; this
 * full-azimuth scan cannot. Returns min distance (mm). More accurate than a discretized BVH near cusps
 * (a discretized reference has its OWN chord error at a fractional-power cusp — measured 0.54 vs GN 0.16).
 */
export function analyticBruteDist(
  px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number,
  opts: { nTheta?: number; zWinMm?: number; nZ?: number } = {},
): number {
  const nTheta = opts.nTheta ?? 2048;
  const zWin = opts.zWinMm ?? 3.0;
  const nZ = opts.nZ ?? 9;
  const d2At = (th: number, z: number): number => {
    const r = rA(th, z);
    const dx = r * Math.cos(th) - px, dy = r * Math.sin(th) - py, dz = z - pz;
    return dx * dx + dy * dy + dz * dz;
  };
  let best = Infinity, bTh = 0, bZ = pz;
  const z0 = Math.max(0, pz - zWin), z1 = Math.min(H, pz + zWin);
  for (let iz = 0; iz < nZ; iz++) {
    const z = nZ > 1 ? z0 + (z1 - z0) * (iz / (nZ - 1)) : pz;
    for (let it = 0; it < nTheta; it++) {
      const th = TAU * (it / nTheta);
      const d2 = d2At(th, z);
      if (d2 < best) { best = d2; bTh = th; bZ = z; }
    }
  }
  // golden-refine theta and z around the best coarse cell
  const dTh = TAU / nTheta, dZ = nZ > 1 ? (z1 - z0) / (nZ - 1) : 0.5;
  const refine1D = (center: number, half: number, fixOther: number, thetaAxis: boolean): number => {
    let lo = center - half, hi = center + half; const gr = (Math.sqrt(5) - 1) / 2;
    const f = (x: number): number => thetaAxis ? d2At(x, fixOther) : d2At(fixOther, Math.max(0, Math.min(H, x)));
    let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
    for (let it = 0; it < 40 && hi - lo > 1e-7; it++) {
      if (f1 < f2) { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); }
      else { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); }
    }
    return (lo + hi) / 2;
  };
  for (let pass = 0; pass < 3; pass++) {
    bTh = refine1D(bTh, dTh, bZ, true);
    if (nZ > 1) bZ = refine1D(bZ, dZ, bTh, false);
    best = d2At(bTh, bZ);
  }
  return Math.sqrt(best);
}

/**
 * TRUSTED-WORST-ANALYTIC: like trustedWorst but the guard is the ANALYTIC brute (exact rA, full azimuth),
 * NOT a discretized-reference BVH. Trusted per-sample distance = min(GN, analyticBrute). This is the honest
 * ruler for a single-valued analytic surface (no reference-discretization error at cusps).
 */
export function trustedWorstAnalytic(
  ut: number[], xyz: ArrayLike<number>, indices: ArrayLike<number>, cheapFaceErr: Float64Array,
  gnProject: (px: number, py: number, pz: number) => number, rA: AnalyticRadiusFn, H: number,
  topK: number, tolMm: number,
): {
  worstMm: number; nOverTol: number; overFacets: Array<{ f: number; sag: number; u: number; t: number }>;
  maxGnMinusBrute: number; maxBruteMinusGn: number;
} {
  const nF = indices.length / 3;
  const order = Array.from({ length: nF }, (_, f) => f).sort((x, y) => cheapFaceErr[y] - cheapFaceErr[x]).slice(0, topK);
  let worst = 0, maxGnMinusBrute = 0, maxBruteMinusGn = 0;
  const overFacets: Array<{ f: number; sag: number; u: number; t: number }> = [];
  for (const f of order) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let fSag = 0, bestBary = SAG_BARY[3];
    for (const bary of SAG_BARY) {
      const [wa, wb, wc] = bary;
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const dGn = gnProject(px, py, pz);
      const dBr = analyticBruteDist(px, py, pz, rA, H);
      if (dGn - dBr > maxGnMinusBrute) maxGnMinusBrute = dGn - dBr;
      if (dBr - dGn > maxBruteMinusGn) maxBruteMinusGn = dBr - dGn;
      const dTrust = Math.min(dGn, dBr);
      if (dTrust > fSag) { fSag = dTrust; bestBary = bary; }
    }
    if (fSag > worst) worst = fSag;
    if (fSag > tolMm) {
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
      const [wa, wb, wc] = bestBary;
      let u = wa * ua + wb * ub + wc * uc; u -= Math.floor(u);
      const t = wa * ta + wb * tb + wc * tc;
      overFacets.push({ f, sag: fSag, u, t });
    }
  }
  return { worstMm: worst, nOverTol: overFacets.length, overFacets, maxGnMinusBrute, maxBruteMinusGn };
}

/** green->yellow->red heatmap ramp (same colours as labkit chordSagColor). */
export function heatColor(errMm: number, scaleMm: number): [number, number, number] {
  const c = Math.max(0, Math.min(1, errMm / scaleMm));
  const L = (a: number, b: number, k: number): number => a + (b - a) * k;
  const G: [number, number, number] = [0.13, 0.62, 0.23], Y: [number, number, number] = [0.98, 0.82, 0.10], R: [number, number, number] = [0.86, 0.13, 0.13];
  if (c < 0.5) { const k = c / 0.5; return [L(G[0], Y[0], k), L(G[1], Y[1], k), L(G[2], Y[2], k)]; }
  const k = (c - 0.5) / 0.5; return [L(Y[0], R[0], k), L(Y[1], R[1], k), L(Y[2], R[2], k)];
}

export function vertColorsFrom(vertErr: Float64Array, scaleMm: number): Float32Array {
  const col = new Float32Array(vertErr.length * 3);
  for (let i = 0; i < vertErr.length; i++) { const [r, g, b] = heatColor(vertErr[i], scaleMm); col[3 * i] = r; col[3 * i + 1] = g; col[3 * i + 2] = b; }
  return col;
}

/**
 * SERRATION: for a set of feature-curve sample points (u,t), find the nearest MESH EDGE (3D distance
 * from the lifted feature point to the nearest triangle edge segment). Zero => the feature IS a chain
 * of mesh edges (embedded by construction). Returns worst + p99 over the samples.
 * @param featUt flat (u,t) of feature-curve samples.
 * @param meshXyz lifted mesh vertex positions.
 */
export function serrationToMeshEdge(
  featUt: number[], rA: AnalyticRadiusFn, H: number,
  meshXyz: ArrayLike<number>, indices: ArrayLike<number>,
): { worstMm: number; p99Mm: number; meanMm: number; n: number } {
  // Build a spatial hash of UNIQUE undirected edges (endpoints as 3D segments). SHARDED dedup Set
  // (a single JS Set caps ~16.7M entries; a 6M-tri mesh has ~18M undirected edges -> overflow). Shard
  // by the low bits of min endpoint so each Set stays under cap (identical dedup result).
  const nF = indices.length / 3;
  const nV = meshXyz.length / 3;
  const EK = nV + 1;
  const NSHARD = 64;
  const edgeSets: Array<Set<number>> = Array.from({ length: NSHARD }, () => new Set<number>());
  const ea: number[] = [], eb: number[] = [];
  for (let f = 0; f < nF; f++) {
    const t0 = indices[3 * f], t1 = indices[3 * f + 1], t2 = indices[3 * f + 2];
    const tri = [t0, t1, t2];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const k = lo * EK + hi; const s = edgeSets[lo & (NSHARD - 1)];
      if (!s.has(k)) { s.add(k); ea.push(a); eb.push(b); }
    }
  }
  const nE = ea.length;
  // grid over edge midpoints
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < nV; i++) {
    const x = meshXyz[3 * i], y = meshXyz[3 * i + 1], z = meshXyz[3 * i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cell = 2.0;
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);
  const ixOf = (x: number): number => Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell)));
  const iyOf = (y: number): number => Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cell)));
  const izOf = (z: number): number => Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell)));
  const cid = (ix: number, iy: number, iz: number): number => (ix * ny + iy) * nz + iz;
  const nCells = nx * ny * nz;
  const counts = new Int32Array(nCells + 1);
  const eLo = new Int32Array(nE * 3), eHi = new Int32Array(nE * 3);
  for (let e = 0; e < nE; e++) {
    const a = ea[e], b = eb[e];
    const lx = ixOf(Math.min(meshXyz[3 * a], meshXyz[3 * b])), hx = ixOf(Math.max(meshXyz[3 * a], meshXyz[3 * b]));
    const ly = iyOf(Math.min(meshXyz[3 * a + 1], meshXyz[3 * b + 1])), hy = iyOf(Math.max(meshXyz[3 * a + 1], meshXyz[3 * b + 1]));
    const lz = izOf(Math.min(meshXyz[3 * a + 2], meshXyz[3 * b + 2])), hz = izOf(Math.max(meshXyz[3 * a + 2], meshXyz[3 * b + 2]));
    eLo[3 * e] = lx; eLo[3 * e + 1] = ly; eLo[3 * e + 2] = lz; eHi[3 * e] = hx; eHi[3 * e + 1] = hy; eHi[3 * e + 2] = hz;
    for (let ix = lx; ix <= hx; ix++) for (let iy = ly; iy <= hy; iy++) for (let iz = lz; iz <= hz; iz++) counts[cid(ix, iy, iz) + 1]++;
  }
  for (let i = 0; i < nCells; i++) counts[i + 1] += counts[i];
  const items = new Int32Array(counts[nCells]);
  const cur = counts.slice(0, nCells);
  for (let e = 0; e < nE; e++) {
    const lx = eLo[3 * e], hx = eHi[3 * e], ly = eLo[3 * e + 1], hy = eHi[3 * e + 1], lz = eLo[3 * e + 2], hz = eHi[3 * e + 2];
    for (let ix = lx; ix <= hx; ix++) for (let iy = ly; iy <= hy; iy++) for (let iz = lz; iz <= hz; iz++) items[cur[cid(ix, iy, iz)]++] = e;
  }
  const segDist = (px: number, py: number, pz: number, e: number): number => {
    const a = ea[e], b = eb[e];
    const axx = meshXyz[3 * a], ayy = meshXyz[3 * a + 1], azz = meshXyz[3 * a + 2];
    const bxx = meshXyz[3 * b], byy = meshXyz[3 * b + 1], bzz = meshXyz[3 * b + 2];
    const dx = bxx - axx, dy = byy - ayy, dz = bzz - azz;
    const l2 = dx * dx + dy * dy + dz * dz || 1;
    let s = ((px - axx) * dx + (py - ayy) * dy + (pz - azz) * dz) / l2;
    s = Math.max(0, Math.min(1, s));
    const qx = axx + s * dx, qy = ayy + s * dy, qz = azz + s * dz;
    return Math.hypot(px - qx, py - qy, pz - qz);
  };
  const stamp = new Int32Array(nE).fill(-1); let query = 0;
  const nearestEdge = (px: number, py: number, pz: number): number => {
    const cx = ixOf(px), cy = iyOf(py), cz = izOf(pz);
    let best = Infinity; const q = query++;
    const maxRing = Math.max(nx, ny, nz);
    for (let ring = 0; ring < maxRing; ring++) {
      let any = false;
      const xlo = Math.max(0, cx - ring), xhi = Math.min(nx - 1, cx + ring);
      const ylo = Math.max(0, cy - ring), yhi = Math.min(ny - 1, cy + ring);
      const zlo = Math.max(0, cz - ring), zhi = Math.min(nz - 1, cz + ring);
      for (let ix = xlo; ix <= xhi; ix++) {
        const xS = ix === cx - ring || ix === cx + ring;
        for (let iy = ylo; iy <= yhi; iy++) {
          const yS = iy === cy - ring || iy === cy + ring;
          for (let iz = zlo; iz <= zhi; iz++) {
            if (ring > 0 && !(xS || yS || iz === cz - ring || iz === cz + ring)) continue;
            any = true; const c = cid(ix, iy, iz);
            for (let p = counts[c]; p < counts[c + 1]; p++) { const e = items[p]; if (stamp[e] === q) continue; stamp[e] = q; const d = segDist(px, py, pz, e); if (d < best) best = d; }
          }
        }
      }
      if (best < Infinity && (ring * cell) > best && ring > 0) break;
      if (!any && ring > 0) break;
    }
    return best;
  };
  const n = featUt.length / 2;
  let worst = 0, sum = 0; const all: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = featUt[2 * i], tt = featUt[2 * i + 1];
    const th = TAU * u, z = tt * H, r = rA(th, z);
    const d = nearestEdge(r * Math.cos(th), r * Math.sin(th), z);
    if (d > worst) worst = d; sum += d; all.push(d);
  }
  all.sort((a, b) => a - b);
  const p99 = all.length ? all[Math.min(all.length - 1, Math.floor(0.99 * all.length))] : 0;
  return { worstMm: worst, p99Mm: p99, meanMm: n ? sum / n : 0, n };
}
