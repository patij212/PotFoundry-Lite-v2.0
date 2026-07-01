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
 */
export function dumpHeatmap(
  dir: string, name: string, xyz: ArrayLike<number>, ut: number[], indices: ArrayLike<number>,
  rA: AnalyticRadiusFn, H: number,
  opts: { ruler?: 'true3d' | 'radial'; scaleMm?: number; preFilterMm?: number; stl?: boolean; meta?: Record<string, unknown> } = {},
): ChordSagResult {
  const ruler = opts.ruler ?? 'true3d';
  const sag = ruler === 'radial' ? perFaceChordSag(ut, indices, rA, H) : perFaceTrue3DSag(ut, indices, rA, H, { preFilterMm: opts.preFilterMm });
  const sorted = Float64Array.from(sag.faceErr).sort();
  const p99 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0;
  dumpRenderBins(dir, name, xyz, indices, {
    colors: vertErrColors(sag.vertErr, opts.scaleMm ?? 0.15),
    meta: { ruler, worstMm: sag.worstMm, p99Mm: p99, pctOver0_03: 100 * sag.fracOver(0.03), ...(opts.meta ?? {}) },
    stl: opts.stl,
  });
  return sag;
}
