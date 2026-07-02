// labkit.ts — DEV-ONLY consolidated instrument kit for the meshing research lab.
// research/ ONLY — src/ must never import this. Import the proven instruments FROM HERE in new probes instead of
// re-deriving the kernel API or re-coding utilities (this session re-implemented auditNonMan / per-face chord-sag /
// STL+bin dump across 3+ probes — that stops now).
//
// Two things live here:
//   (1) a BARREL re-exporting the canonical, battle-tested instruments (kernel, conforming, gate, recovery,
//       true-3D fidelity, oracle scoring); and
//   (2) the CANONICAL HOME for the helpers that were previously copy-pasted inline in probe tests
//       (manifold audit by index, per-face chord sag + heatmap colour, binary STL, render-bin dump).
//
// METRIC DISCIPLINE (the gotcha that cost a round): the RADIAL / same-(u,t) chord OVERSTATES near-vertical
// features by 2–27× (measured: ArtDeco radial "3.35mm" vs true-3D 0.039mm). For any FIDELITY verdict use
// `featureLineChord3D` (true-3D nearest-surface) — or `perFaceChordSag` (facet→surface plane distance, what the
// heatmap shows) — NOT radial crest under-shoot. Report both when in doubt. See research/LAB-CHEATSHEET.md.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectPointToRadialSurface } from '../../src/fidelity/analyticSurfaceGate';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

// ───────────────────────── barrel: the canonical instruments ─────────────────────────
// kernel + styles
export { buildInhouseMetricMesh, flipHE } from './inhouseMetricMesh';
export type { InhouseMeshOpts, InhouseMesh, ConstraintRecoveryStats } from './inhouseMetricMesh';
export { buildRadiusFn, runStyle } from './runStyle';
export type { StyleDims } from './runStyle';
export { liftUtToRadial, measureOracleMesh } from './measure';
export type { ScoreRow } from './measure';
// feature-conforming
export { buildFeatureConformingMesh, buildFeatureConformingMeshB } from './featureConformingMesh';
export type { FeatureConformOpts, FeatureConformResult, FeatureConformBResult } from './featureConformingMesh';
export { computeMeasuredGate, computeSharpnessGate } from './featureSharpnessGate';
export type { MeasuredGateOpts, MeasuredGateResult, SharpnessGateOpts, SharpnessGateResult } from './featureSharpnessGate';
export { honestGate } from './honestMetrics';
export type { HonestGate } from './honestMetrics';
export { recoverAndLockEdges, lockedPredicate } from './constraintRecovery';
export type { RecoveryResult } from './constraintRecovery';
// fidelity instruments (true-3D FIRST)
export {
  buildFeatureTruth, buildLocator, buildMeshUt, liftTrue,
  featureLineChord, featureLineChord3D, crestValleyRetention, featureAdjacentSlivers,
  narrowChannelCoverage, globalChord,
} from './featureLocalizedFidelity';
export type {
  FeatureTruth, FeatureLineChordResult, FeatureLineChord3DResult,
  CrestRetentionResult, FeatureAdjacentSliverResult, ChannelResult, GlobalChordResult,
} from './featureLocalizedFidelity';
// shared src instruments
export { perpendicular3DDeviation, projectPointToRadialSurface } from '../../src/fidelity/analyticSurfaceGate';
export type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
export { triangleQualityDistribution, triangleQuality3D, crestBandTriangleQuality } from '../../src/fidelity/metrics';
export type { TriangleQualityDistribution, TriangleQualityResult } from '../../src/fidelity/metrics';

const TAU = 2 * Math.PI;
/** BARY sample points for facet interior sag: 3 edge-midpoints + centroid. */
const SAG_BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

// ───────────────────────── manifold audit (by INDEX, non-vacuous) ─────────────────────────
/**
 * Non-manifold edge count via 3D position-weld by index: weld vertices at the same quantized position, then count
 * undirected edges shared by >2 triangles. "Watertight" here means shared-vertex-by-index (a UV-seam crack that
 * shares a 3D position is NOT a real crack). Degenerate tris (repeated index) are skipped.
 * @param xyz lifted 3D positions (xyz triples), Float32/Float64. @param indices triangle indices.
 */
export function auditNonManByIndex(xyz: ArrayLike<number>, indices: ArrayLike<number>, quantizeMm = 1e-4): number {
  const n = xyz.length / 3;
  const canon = new Int32Array(n); const wmap = new Map<string, number>();
  const q = 1 / quantizeMm;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`;
    const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; }
  }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  // SHARDED edge-count map: a single JS Map caps at ~2^24 (16.7M) entries, which a large mesh (≥~6M tris ⇒ ~18M
  // undirected edges) exceeds → "Map maximum size exceeded" (MEASURED at 10M tris). Shard by the low bits of the
  // min endpoint (mirrors flipHE's edge-set sharding) so each Map stays under cap. The count is identical to the
  // single-Map version (every edge maps to exactly one shard by its own min vertex), so small-mesh results and the
  // non-vacuous crack-injection control are unchanged.
  const NSHARD = 64;
  const ecs: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (p: number, r: number): void => { const kk = key(p, r); const m = ecs[(p < r ? p : r) & (NSHARD - 1)]; m.set(kk, (m.get(kk) ?? 0) + 1); };
  for (let k = 0; k < indices.length; k += 3) {
    const a = canon[indices[k]], b = canon[indices[k + 1]], c = canon[indices[k + 2]];
    if (a === b || b === c || a === c) continue;
    bump(a, b); bump(b, c); bump(c, a);
  }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}

// ───────────────────────── per-face chord sag (what the heatmap shows) ─────────────────────────
export interface ChordSagResult {
  /** per-face max chord sag (mm) = max over SAG_BARY of |P_true − facet-plane| (perpendicular). */
  faceErr: Float64Array;
  /** per-vertex sag = max incident-face sag (mm) — for heatmap colouring. */
  vertErr: Float64Array;
  /** worst face sag (mm). */
  worstMm: number;
  /** fraction of faces with sag > mm (e.g. fracOver(0.15) = heatmap "red" fraction). */
  fracOver: (mm: number) => number;
}

/**
 * Per-face chord sag: how far the TRUE analytic surface bulges from each flat facet, sampled at the 3 edge-midpoints
 * + centroid, as perpendicular distance to the facet plane. This is the honest per-triangle fidelity error and the
 * quantity the chord-error heatmap renders. Reducible by refinement (unlike crest UNDER-shoot, which is placement).
 * Computes lifted positions from (u,t) internally via the exact radial lift; seam-aware in u.
 */
export function perFaceChordSag(ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number): ChordSagResult {
  const nV = ut.length / 2, nF = indices.length / 3;
  // lift once
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const faceErr = new Float64Array(nF); const vertErr = new Float64Array(nV);
  let worst = 0;
  for (let f = 0; f < nF; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    let err = 0;
    for (const [wa, wb, wc] of SAG_BARY) {
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (d > err) err = d;
    }
    faceErr[f] = err; if (err > worst) worst = err;
    if (err > vertErr[a]) vertErr[a] = err; if (err > vertErr[b]) vertErr[b] = err; if (err > vertErr[c]) vertErr[c] = err;
  }
  const fracOver = (mm: number): number => { let o = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > mm) o++; return nF ? o / nF : 0; };
  return { faceErr, vertErr, worstMm: worst, fracOver };
}

/** green(0) → yellow(0.5) → red(≥1) heatmap ramp; err/scaleMm clamped to [0,1]. */
export function chordSagColor(errMm: number, scaleMm = 0.15): [number, number, number] {
  const c = Math.max(0, Math.min(1, errMm / scaleMm));
  const L = (a: number, b: number, k: number): number => a + (b - a) * k;
  const G: [number, number, number] = [0.13, 0.62, 0.23], Y: [number, number, number] = [0.98, 0.82, 0.10], R: [number, number, number] = [0.86, 0.13, 0.13];
  if (c < 0.5) { const k = c / 0.5; return [L(G[0], Y[0], k), L(G[1], Y[1], k), L(G[2], Y[2], k)]; }
  const k = (c - 0.5) / 0.5; return [L(Y[0], R[0], k), L(Y[1], R[1], k), L(Y[2], R[2], k)];
}

/** Float32 per-vertex colour buffer from a vertErr array (for render `.col.bin`). */
export function vertErrColors(vertErr: Float64Array, scaleMm = 0.15): Float32Array {
  const col = new Float32Array(vertErr.length * 3);
  for (let i = 0; i < vertErr.length; i++) { const [r, g, b] = chordSagColor(vertErr[i], scaleMm); col[3 * i] = r; col[3 * i + 1] = g; col[3 * i + 2] = b; }
  return col;
}

// ───────────────────────── brute-force nearest-surface (the GN anchor for tangled lattices) ─────────────────────────
/** Foot point + shortest 3D distance from the brute-force dense-nearest search (the trusted anchor for the GN foot). */
export interface BruteNearestResult { dist: number; theta: number; z: number; }

/**
 * BRUTE-FORCE nearest-surface distance from P=(px,py,pz) to S(θ,z)=(r·cosθ, r·sinθ, z), r = rA(θ,z): a dense
 * FULL-AZIMUTH (θ,z) grid scan + local box-refine. This is the TRUSTED FLOOR that anchors
 * `projectPointToRadialSurface`'s single-seed Gauss-Newton foot on TANGLED LATTICES (Gyroid / CelticTriquetra / …),
 * where a single GN can stall in a WRONG LOCAL MINIMUM and OVERSTATE the true perpendicular deviation up to ~7×
 * (E-2026-07-02-STEEP-HETEROGENEITY / F2: Gyroid GN 0.644 vs brute 0.092). A denser sample can only make the
 * distance SMALLER, so `min(GN, brute)` is a safe trusted anchor. The FULL azimuth sweep is load-bearing — GN's own
 * src coarse fallback only scans a ±0.22-rad LOCAL window, so a wrong-well foot at a different azimuth stays hidden
 * from it but not from this scan.
 *
 * DEV-ONLY (research/): O(nTheta·nZ) per call is far too slow for src — use it only to anchor the WORST steep facets
 * (see {@link bruteAnchoredRedPerp}). Coarse default 2048×400; pass a fine grid (e.g. 8192×1600) to break ties on
 * sharp ribs where the coarse grid can alias PAST the true foot and read a spuriously larger distance.
 */
export function bruteNearestOnRadialSurface(
  px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number,
  opts: { nTheta?: number; nZ?: number; zBandMm?: number; refineIters?: number } = {},
): BruteNearestResult {
  const nTheta = opts.nTheta ?? 2048, nZ = opts.nZ ?? 400, band = opts.zBandMm ?? 14, refineIters = opts.refineIters ?? 60;
  const d2 = (th: number, z: number): number => { const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; return ex * ex + ey * ey + ez * ez; };
  // coarse global grid across the full azimuth + a z-band around P's own z (relief is local in z)
  const zLo = Math.max(0, pz - band), zHi = Math.min(H, pz + band);
  let best = Infinity, bth = 0, bz = pz;
  for (let i = 0; i < nTheta; i++) {
    const th = (i / nTheta) * TAU;
    for (let j = 0; j <= nZ; j++) { const z = zLo + (zHi - zLo) * (j / nZ); const f = d2(th, z); if (f < best) { best = f; bth = th; bz = z; } }
  }
  // local box-refine: shrink a ±cell box around (bth,bz) until it stops improving, then halve
  let hTh = TAU / nTheta, hZ = (zHi - zLo) / nZ;
  for (let it = 0; it < refineIters; it++) {
    let improved = false;
    for (const dth of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) { const f = d2(bth + dth, bz + dz); if (f < best) { best = f; bth += dth; bz += dz; improved = true; } }
    if (!improved) { hTh *= 0.5; hZ *= 0.5; }
    if (hTh < 1e-10 && hZ < 1e-10) break;
  }
  return { dist: Math.sqrt(best), theta: bth, z: bz };
}

// ───────────────────────── per-face TRUE-3D sag (the HONEST heatmap ruler — DEFAULT) ─────────────────────────
/**
 * Per-face TRUE-3D chord sag: the SHORTEST 3D distance from each flat-facet interior sample to the true surface
 * (`projectPointToRadialSurface` — Gauss-Newton + global-search fallback), NOT the same-(u,t) radial residual. This
 * is the HONEST "is every triangle faithful" ruler and the DEFAULT lab heatmap: it does NOT overstate near-vertical
 * / steep relief the way `perFaceChordSag` (radial) does — radial overstates true-3D 2–370× (measured across all 20
 * styles; the arch-tip / riser / weave near-vertical walls read red under radial but green under true-3D).
 *
 * Perf: the same-(u,t) FULL-3D distance is a guaranteed UPPER BOUND on the true-3D nearest distance, so it is
 * computed first (cheap) and the expensive projection runs ONLY on facets whose bound exceeds `preFilterMm` (default
 * 0.02mm); sub-threshold facets keep the bound (all deep-green — negligible over-statement). Returns the same
 * `ChordSagResult` shape as `perFaceChordSag`, so it is a drop-in for `vertErrColors` / `dumpRenderBins`.
 *
 * STEEP-STYLE CAVEAT (E-2026-07-02-STEEP-HETEROGENEITY / F2): the underlying single-seed GN
 * (`projectPointToRadialSurface`) can stall in a WRONG LOCAL MINIMUM on TANGLED LATTICES (Gyroid / CelticTriquetra /
 * …) and OVERSTATE red-facet perp up to ~7× (Gyroid GN 0.644 vs brute-trusted 0.092). This ruler therefore
 * OVER-colours steep-lattice red facets. Whole-mesh brute-anchoring is infeasible (~3.4h at 2703 red facets), so for
 * any STEEP-STYLE red-facet VERDICT use {@link bruteAnchoredRedPerp} (worst-N brute-twin, seconds) — do NOT trust
 * this ruler's steep-lattice red p99. On SMOOTH styles GN ≡ brute (unique foot), so this ruler is already honest.
 */
export function perFaceTrue3DSag(ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number, opts: { preFilterMm?: number } = {}): ChordSagResult {
  const preFilter = opts.preFilterMm ?? 0.02;
  const nV = ut.length / 2, nF = indices.length / 3;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  const faceErr = new Float64Array(nF); const vertErr = new Float64Array(nV);
  let worst = 0;
  for (let f = 0; f < nF; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    // pass 1: same-(u,t) full-3D distance = guaranteed upper bound on the true-3D nearest distance; keep sample pts
    let ub3 = 0; const px: number[] = [], py: number[] = [], pz: number[] = [];
    for (const [wa, wb, wc] of SAG_BARY) {
      const fx = wa * ax + wb * bx + wc * cx, fy = wa * ay + wb * by + wc * cy, fz = wa * az + wb * bz + wc * cz;
      px.push(fx); py.push(fy); pz.push(fz);
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.hypot(r * Math.cos(th) - fx, r * Math.sin(th) - fy, z - fz);
      if (d > ub3) ub3 = d;
    }
    let err: number;
    if (ub3 <= preFilter) { err = ub3; } // sub-threshold: bound already tight + deep-green, skip the projection
    else { let mx = 0; for (let k = 0; k < px.length; k++) { const dd = projectPointToRadialSurface(px[k], py[k], pz[k], rA).dist; if (dd > mx) mx = dd; } err = mx; }
    faceErr[f] = err; if (err > worst) worst = err;
    if (err > vertErr[a]) vertErr[a] = err; if (err > vertErr[b]) vertErr[b] = err; if (err > vertErr[c]) vertErr[c] = err;
  }
  const fracOver = (mm: number): number => { let o = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > mm) o++; return nF ? o / nF : 0; };
  return { faceErr, vertErr, worstMm: worst, fracOver };
}

// ───────────────────────── brute-anchored trusted steep-red perp (the honest verdict number) ─────────────────────────
/** Trusted brute-anchored perpendicular-3D result on the worst red facets + the raw-GN it corrects. */
export interface BruteAnchoredPerp {
  /** total red facets (radial per-face sag > redMm). */ nRed: number;
  /** facets actually anchored = min(sampleN, nRed). */ nSample: number;
  /** sampled facets where raw GN OVERSTATED the brute floor by > overMm (the wrong-local-minimum signature). */ gnOver: number;
  /** sampled facets where the coarse brute exceeded GN by > disagreeMm (coarse aliased above GN's foot). */ bruteOver: number;
  /** raw single-seed GN p99 at the sampled facet CENTROIDS — the OVERSTATED value (same projector perFaceTrue3DSag uses). */ gnP99: number;
  /** brute-anchored TRUSTED CENTROID p99 = min(GN, brute[, fine]) — the honest steep-red perp (≤ perFaceTrue3DSag's 4-pt max). */ trustedP99: number;
  /** brute-anchored trusted CENTROID max over the sampled facets. */ trustedMax: number;
}

function pctile99(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = Float64Array.from(arr).sort();
  return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))];
}

/**
 * BRUTE-ANCHORED trusted perpendicular-3D deviation on the WORST red facets — the honest steep-style verdict number,
 * folding the convene's brute-twin (E-2026-07-02-STEEP-HETEROGENEITY / F2). Single-seed GN
 * (`projectPointToRadialSurface`, used by `perFaceTrue3DSag` / `perpendicular3DDeviation`) stalls in WRONG-LOCAL-
 * MINIMUM feet on tangled lattices and OVERSTATES perp up to ~7× (Gyroid GN 0.644 vs brute-trusted 0.092). For the
 * `sampleN` red facets (radial sag > `redMm`) with the LARGEST radial sag, this cross-checks each facet-CENTROID GN
 * foot against a full-azimuth {@link bruteNearestOnRadialSurface} (coarse `coarse`, default 2048×400) and keeps the
 * SMALLER distance. A `fine` tie-break (default 8192×1600) fires when the coarse brute exceeds GN by > `disagreeMm`
 * (a sharp rib the coarse grid aliased PAST) OR the coarse-anchored value is still ≥ `redMm` (a rib can alias BOTH GN
 * and the coarse brute HIGH with disagree≈0, so a "still-red" result warrants the fine confirm). Returns the TRUSTED
 * p99 alongside the raw-GN p99 + `gnOver` so the caller can SEE the overstatement it corrected.
 *
 * CENTROID-ONLY (faithful to the convene's `twinSheet`): each facet is anchored at its CENTROID, so `trustedP99` is
 * the centroid perp — the honest correction of GN's centroid overstatement, and the exact statistic the convene used
 * to classify the steep class. It is NOT `perFaceTrue3DSag`'s per-facet ruler, which takes the MAX over 4 SAG_BARY
 * interior points and so reads HIGHER; do not read `trustedP99` as the facet's worst-interior perp. `gnOver` counts
 * facets where GN beat the brute floor by > `overMm` (default 0.1, the RED band) — a STRICTER gate than the convene
 * twin's 0.02, so its count is not directly comparable to the convene's `gnOver`.
 *
 * Why worst-N + centroid: whole-mesh anchoring is infeasible (~3.4h at ~2700 red facets × 2048×400); the convene
 * used the worst-40 centroid twin (p99/verdict signal lives in the worst facets) and it runs in seconds. Pass a
 * precomputed `radial` (perFaceChordSag) to skip the radial recompute. DEV-ONLY — reuse the exported
 * `bruteNearestOnRadialSurface` primitive for other sample geometries. Does NOT do the braid sheet-guard; for
 * braids (CelticTriquetra/Knot) also run the sign check from `_steepHeterogeneity.test.ts`.
 */
export function bruteAnchoredRedPerp(
  ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number,
  opts: {
    redMm?: number; sampleN?: number; overMm?: number; disagreeMm?: number;
    coarse?: { nTheta?: number; nZ?: number }; fine?: { nTheta?: number; nZ?: number };
    /** precomputed radial chord sag (perFaceChordSag) to pick the red set without recomputing it. */
    radial?: ChordSagResult;
  } = {},
): BruteAnchoredPerp {
  const redMm = opts.redMm ?? 0.1, sampleN = opts.sampleN ?? 40, overMm = opts.overMm ?? 0.1, disagreeMm = opts.disagreeMm ?? 0.02;
  const cN = { nTheta: opts.coarse?.nTheta ?? 2048, nZ: opts.coarse?.nZ ?? 400 };
  const fN = { nTheta: opts.fine?.nTheta ?? 8192, nZ: opts.fine?.nZ ?? 1600 };
  const radial = opts.radial ?? perFaceChordSag(ut, indices, rA, H);
  const red: number[] = [];
  for (let f = 0; f < radial.faceErr.length; f++) if (radial.faceErr[f] > redMm) red.push(f);
  red.sort((x, y) => radial.faceErr[y] - radial.faceErr[x]);
  const sample = red.slice(0, Math.min(sampleN, red.length));
  // lift the sampled facets' vertices (only the ones we touch)
  const gnD: number[] = [], trusted: number[] = [];
  let gnOver = 0, bruteOver = 0;
  const lift = (i: number): [number, number, number] => { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  for (const f of sample) {
    const [ax, ay, az] = lift(indices[3 * f]), [bx, by, bz] = lift(indices[3 * f + 1]), [cx2, cy2, cz2] = lift(indices[3 * f + 2]);
    const cx = (ax + bx + cx2) / 3, cy = (ay + by + cy2) / 3, cz = (az + bz + cz2) / 3;
    const gn = projectPointToRadialSurface(cx, cy, cz, rA).dist;
    const bf = bruteNearestOnRadialSurface(cx, cy, cz, rA, H, cN);
    let tf = Math.min(gn, bf.dist);
    if (gn - bf.dist > overMm) gnOver++;                 // GN overstated → brute floor already captured in tf
    if (bf.dist - gn > disagreeMm) bruteOver++;          // coarse brute > GN ⇒ it aliased ABOVE a foot GN found
    // Fine tie-break when the coarse brute disagreed with GN OR the coarse-anchored value is still RED — a sharp rib
    // can alias BOTH gn and the coarse brute HIGH (disagree≈0), and only the fine grid finds the true foot.
    if (bf.dist - gn > disagreeMm || tf > redMm) tf = Math.min(tf, bruteNearestOnRadialSurface(cx, cy, cz, rA, H, fN).dist);
    gnD.push(gn); trusted.push(tf);
  }
  return {
    nRed: red.length, nSample: sample.length, gnOver, bruteOver,
    gnP99: pctile99(gnD), trustedP99: pctile99(trusted), trustedMax: trusted.length ? Math.max(...trusted) : 0,
  };
}

// ───────────────────────── anchored TRUE-3D sag (trusted HEATMAP source for steep lattices) ─────────────────────────
/**
 * `perFaceTrue3DSag` with the WORST-K red facets brute-ANCHORED — a TRUSTED HEATMAP source for STEEP LATTICES.
 * The plain true-3D ruler OVER-COLOURS steep-lattice red facets because single-seed GN overstates their perp up to
 * ~7× via wrong-local-minimum feet (E-2026-07-02-STEEP-HETEROGENEITY / F2). Whole-mesh brute anchoring is infeasible
 * (~3.4h at ~2700 red facets), so this anchors ONLY the `topK` reddest facets (radial sag > `redMm`): each is
 * re-scored at its 4 SAG_BARY interior samples as max_k min(GN, brute[, fine]) via {@link bruteNearestOnRadialSurface}
 * (fine tie-break on coarse-disagreement OR a still-red coarse value), while the green body keeps the fast GN score.
 * The anchor can only LOWER a facet's error, so the red tail stops lying without touching the honest green body.
 *
 * Returns a drop-in {@link ChordSagResult} (faceErr overwritten on the anchored facets; vertErr + worstMm recomputed)
 * for `vertErrColors` / `dumpHeatmap`. Bounded cost = topK × 4 × brute (seconds–tens of seconds, not hours). Pass a
 * precomputed `radial` (perFaceChordSag) to skip the recompute; `onStats` reports {nRed, anchoredK} for coverage
 * logging (worst-K is a CAP — facets beyond topK keep the GN colour). DEV-ONLY.
 */
export function perFaceTrue3DSagAnchored(
  ut: number[], indices: ArrayLike<number>, rA: AnalyticRadiusFn, H: number,
  opts: {
    preFilterMm?: number; redMm?: number; topK?: number; disagreeMm?: number;
    coarse?: { nTheta?: number; nZ?: number }; fine?: { nTheta?: number; nZ?: number };
    radial?: ChordSagResult; onStats?: (s: { nRed: number; anchoredK: number }) => void;
  } = {},
): ChordSagResult {
  const preFilter = opts.preFilterMm ?? 0.02, redMm = opts.redMm ?? 0.1, topK = opts.topK ?? 200, disagreeMm = opts.disagreeMm ?? 0.02;
  const cN = { nTheta: opts.coarse?.nTheta ?? 2048, nZ: opts.coarse?.nZ ?? 400 };
  const fN = { nTheta: opts.fine?.nTheta ?? 8192, nZ: opts.fine?.nZ ?? 1600 };
  const base = perFaceTrue3DSag(ut, indices, rA, H, { preFilterMm: preFilter }); // fast GN body (green stays honest)
  const radial = opts.radial ?? perFaceChordSag(ut, indices, rA, H);
  const nV = ut.length / 2, nF = indices.length / 3;
  const red: number[] = [];
  for (let f = 0; f < nF; f++) if (radial.faceErr[f] > redMm) red.push(f);
  red.sort((x, y) => radial.faceErr[y] - radial.faceErr[x]);
  const sample = red.slice(0, Math.min(topK, red.length));
  opts.onStats?.({ nRed: red.length, anchoredK: sample.length });
  if (sample.length === 0) return base; // no red facets ⇒ identical to perFaceTrue3DSag
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  for (const f of sample) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    let mx = 0;
    for (const [wa, wb, wc] of SAG_BARY) {
      const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
      const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
      const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
      const gn = projectPointToRadialSurface(px, py, pz, rA).dist;
      const bf = bruteNearestOnRadialSurface(px, py, pz, rA, H, cN);
      let tf = Math.min(gn, bf.dist);
      if (bf.dist - gn > disagreeMm || tf > redMm) tf = Math.min(tf, bruteNearestOnRadialSurface(px, py, pz, rA, H, fN).dist);
      if (tf > mx) mx = tf;
    }
    base.faceErr[f] = mx; // overwrite the GN-overstated facet error with the brute-anchored one (only ever lower)
  }
  // recompute vertErr (max incident face) + worstMm from the corrected faceErr; fracOver closes over the same array.
  base.vertErr.fill(0);
  let worst = 0;
  for (let f = 0; f < nF; f++) {
    const e = base.faceErr[f]; if (e > worst) worst = e;
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    if (e > base.vertErr[a]) base.vertErr[a] = e; if (e > base.vertErr[b]) base.vertErr[b] = e; if (e > base.vertErr[c]) base.vertErr[c] = e;
  }
  base.worstMm = worst;
  return base;
}

// ───────────────────────── export: binary STL + render bins ─────────────────────────
/** Binary STL with per-face normals from geometry. xyz = lifted positions (any float ArrayLike). */
export function writeBinarySTL(path: string, xyz: ArrayLike<number>, indices: ArrayLike<number>): void {
  const nTri = indices.length / 3;
  const buf = Buffer.alloc(84 + nTri * 50);
  buf.writeUInt32LE(nTri, 80);
  let off = 84;
  for (let t = 0; t < nTri; t++) {
    const a = indices[3 * t], b = indices[3 * t + 1], c = indices[3 * t + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    buf.writeFloatLE(ax, off + 12); buf.writeFloatLE(ay, off + 16); buf.writeFloatLE(az, off + 20);
    buf.writeFloatLE(bx, off + 24); buf.writeFloatLE(by, off + 28); buf.writeFloatLE(bz, off + 32);
    buf.writeFloatLE(cx, off + 36); buf.writeFloatLE(cy, off + 40); buf.writeFloatLE(cz, off + 44);
    off += 50;
  }
  writeFileSync(path, buf);
}

/**
 * Dump render bins for research/render/*.cjs: `<dir>/<name>.xyz.bin` (f32 xyz), `.idx.bin` (u32), `.meta.json`,
 * optional `.col.bin` (f32 rgb per vertex) and `.stl`. CHECKPOINT-FRIENDLY: call per mesh AS SOON as it is built,
 * so a killed run leaves completed meshes on disk.
 */
export function dumpRenderBins(
  dir: string, name: string, xyz: ArrayLike<number>, indices: ArrayLike<number>,
  opts: { colors?: Float32Array; meta?: Record<string, unknown>; stl?: boolean } = {},
): void {
  const f32 = xyz instanceof Float32Array ? xyz : Float32Array.from(xyz);
  writeFileSync(join(dir, `${name}.xyz.bin`), Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength));
  const u32 = indices instanceof Uint32Array ? indices : Uint32Array.from(indices);
  writeFileSync(join(dir, `${name}.idx.bin`), Buffer.from(u32.buffer, u32.byteOffset, u32.byteLength));
  writeFileSync(join(dir, `${name}.meta.json`), JSON.stringify({ name, tris: indices.length / 3, ...(opts.meta ?? {}) }));
  if (opts.colors) writeFileSync(join(dir, `${name}.col.bin`), Buffer.from(opts.colors.buffer, opts.colors.byteOffset, opts.colors.byteLength));
  if (opts.stl) writeBinarySTL(join(dir, `${name}.stl`), xyz, indices);
}

/**
 * CANONICAL default lab heatmap dump. Colours each vertex by the TRUE-3D per-face sag (the honest ruler) by DEFAULT
 * — `ruler:'radial'` opts into the legacy same-(u,t) chord (which OVERSTATES near-vertical relief 2–370×; keep for
 * A/B only). Prefer THIS over hand-wiring `perFaceChordSag`+`vertErrColors` in new probes. Writes the render bins +
 * `.col.bin` + a `.meta.json` carrying `ruler`/`worstMm`/`p99Mm`/`pctOver0_03` so `meshRender.cjs` labels the ruler
 * honestly. `xyz` = lifted 3D positions (from buildMeshUt/liftUtToRadial). Returns the ChordSagResult it computed.
 *
 * STEEP-LATTICE TRUSTED VISUAL (`anchorSteep`): the default true-3D ruler OVER-COLOURS steep-lattice red facets
 * (single-seed GN overstates up to ~7×, F2). Pass `anchorSteep` to brute-anchor the worst-K red facets via
 * {@link perFaceTrue3DSagAnchored} — the reddest facets show their TRUE colour, the green body stays fast-GN, in
 * seconds (not the ~3.4h a whole-mesh anchor would cost). Meta then carries `ruler:'true3d-anchored'` +
 * `anchoredK`/`nRedTotal` so the legend shows how many red facets were anchored vs left GN-coloured (worst-K CAP).
 */
export function dumpHeatmap(
  dir: string, name: string, xyz: ArrayLike<number>, ut: number[], indices: ArrayLike<number>,
  rA: AnalyticRadiusFn, H: number,
  opts: {
    ruler?: 'true3d' | 'radial'; scaleMm?: number; preFilterMm?: number; stl?: boolean; meta?: Record<string, unknown>;
    /** brute-anchor the worst-K red facets (steep-lattice trusted visual) — see {@link perFaceTrue3DSagAnchored}. */
    anchorSteep?: { redMm?: number; topK?: number; disagreeMm?: number; coarse?: { nTheta?: number; nZ?: number }; fine?: { nTheta?: number; nZ?: number } };
  } = {},
): ChordSagResult {
  const ruler = opts.ruler ?? 'true3d';
  let sag: ChordSagResult, rulerLabel: string = ruler, anchorMeta: Record<string, unknown> = {};
  if (ruler === 'radial') {
    sag = perFaceChordSag(ut, indices, rA, H);
  } else if (opts.anchorSteep) {
    let cov = { nRed: 0, anchoredK: 0 };
    sag = perFaceTrue3DSagAnchored(ut, indices, rA, H, { preFilterMm: opts.preFilterMm, ...opts.anchorSteep, onStats: (s) => { cov = s; } });
    rulerLabel = 'true3d-anchored';
    anchorMeta = { anchored: true, redMm: opts.anchorSteep.redMm ?? 0.1, anchoredK: cov.anchoredK, nRedTotal: cov.nRed };
  } else {
    sag = perFaceTrue3DSag(ut, indices, rA, H, { preFilterMm: opts.preFilterMm });
  }
  const sorted = Float64Array.from(sag.faceErr).sort();
  const p99 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0;
  dumpRenderBins(dir, name, xyz, indices, {
    colors: vertErrColors(sag.vertErr, opts.scaleMm ?? 0.15),
    meta: { ruler: rulerLabel, worstMm: sag.worstMm, p99Mm: p99, pctOver0_03: 100 * sag.fracOver(0.03), ...anchorMeta, ...(opts.meta ?? {}) },
    stl: opts.stl,
  });
  return sag;
}
