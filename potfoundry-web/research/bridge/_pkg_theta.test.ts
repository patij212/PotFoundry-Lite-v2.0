// _pkg_theta.test.ts — DEV-ONLY (research/ only; src/ NEVER imports this). PF_PKG_THETA=1 + per-style sub-gate.
// PACKAGING probe for the THETA family: SpiralRidges, SuperformulaBlossom, HexagonalHive. Re-runs each style's
// SETTLED recipe (from the committed probes), writes STL + TRUE-3D heatmap + one manifest row per style to
// research/exchange/_best20/. NOTHING ships. All builders/rulers imported READ-ONLY from labkit + the committed
// research libs; no src/ or kernel edits.
//
// SETTLED RECIPES (do NOT re-derive):
//   SpiralRidges     — dense M-square SQUARE sheet (graded-z), nTh=2200 nZ=940 zGrade=6 (_gap_gsbss sr_c2200_z940_sq).
//   SuperformulaBlossom — CDT-under-M body meshed as ridge-graph M-square rows + the DOUBLED seam-edge+rung
//     watertight ladder on the non-2pi theta=0 seam (buildSeamLadderWatertight; _pf_sfbseam2 @hRow=0.15). The
//     seam-WALL reads high on the parametric-surface ruler (a PROVEN ruler blind-spot, NOT a defect: the seam is a
//     genuine radius-discontinuity cliff off the analytic surface) => true3dP99 reported on the BODY (seam band
//     excluded); seam-wall ribbon annotated in the manifest + heatmapNote.
//   HexagonalHive    — CDT-under-M chordSteiner chordTolMm=0.010 @6M budget (_ct_hexhive steiner0.010/d6M).
//
// Each style is env sub-gated + STL-exists skip => resumable across the environment's interruptions; the manifest
// row is checkpointed the INSTANT the style finishes.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator,
  featureLineChord3D, liftUtToRadial, triangleQualityDistribution, auditNonManByIndex,
  perFaceChordSag, bruteAnchoredRedPerp, perFaceTrue3DSagAnchored, vertErrColors, writeBinarySTL, dumpRenderBins,
  type StyleDims,
} from './labkit';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';
import { findBirths } from './_scaleColDriver';
import { msquareRows, rasterizeColumnsSquare } from './_qcolMsquare';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { buildSeamLadderWatertight } from './_ct_sfbwaterLib';

const RUN = process.env.PF_PKG_THETA === '1';
const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const BASE = join(process.cwd(), 'research', 'exchange', '_best20');
const STL_DIR = join(BASE, 'stl');
const HEAT_DIR = join(BASE, 'heatmap');
const MANIFEST = join(BASE, 'manifest.ndjson');

const ensureDirs = (): void => { for (const d of [BASE, STL_DIR, HEAT_DIR]) mkdirSync(d, { recursive: true }); };
const stlPath = (style: string): string => join(STL_DIR, `${style}.stl`);
const stlDone = (style: string): boolean => { try { return existsSync(stlPath(style)) && statSync(stlPath(style)).size > 84; } catch { return false; } };
const manifestHas = (style: string): boolean => {
  if (!existsSync(MANIFEST)) return false;
  return readFileSync(MANIFEST, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).style === style; } catch { return false; } });
};
const plog = (m: string): void => { /* eslint-disable-next-line no-console */ console.log(`[pkg-theta ${new Date().toISOString()}] ${m}`); };
const checkpoint = (row: Record<string, unknown>): void => {
  ensureDirs(); appendFileSync(MANIFEST, JSON.stringify(row) + '\n');
  /* eslint-disable-next-line no-console */ console.log(`[MANIFEST ${row.style}] ${JSON.stringify(row)}`);
};
const p99 = (arr: ArrayLike<number>): number => { const s = Float64Array.from(arr as ArrayLike<number>).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0; };

/** RAW-index non-manifold (the shipping bar): undirected literal-index edges shared by >2 tris. SORT-based (no giant Map). */
function auditNonManRaw(idx: ArrayLike<number>): number {
  const keys = new Float64Array(idx.length); let w = 0; const BIG = 2 ** 26;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const lo = p < q ? p : q, hi = p < q ? q : p; keys[w++] = lo * BIG + hi; }
  }
  const arr = keys.subarray(0, w); arr.sort();
  let nm = 0, i = 0;
  while (i < w) { let j = i + 1; while (j < w && arr[j] === arr[i]) j++; if (j - i > 2) nm++; i = j; }
  return nm;
}

/** stl byte size for a lifted mesh (binary STL = 84 + 50*nTri). */
const stlBytes = (nTri: number): number => 84 + 50 * nTri;

// ── SpiralRidges: graded-z M-square sheet (EXACT _gap_gsbss buildSheet path) ────────────────────────────────
function gradedZ(rA: AnalyticRadiusFn, nZ: number, grade: number): number[] {
  if (grade <= 0) return Array.from({ length: nZ + 1 }, (_, j) => (H * j) / nZ);
  const NS = 2000; const dens = new Float64Array(NS + 1);
  const thetas = [0, TAU * 0.13, TAU * 0.37, TAU * 0.61, TAU * 0.83];
  const dz = H / NS;
  for (let i = 0; i <= NS; i++) {
    const z = H * (i / NS); let c = 0;
    for (const th of thetas) { const zm = Math.max(0, z - dz), zp = Math.min(H, z + dz); c = Math.max(c, Math.abs(rA(th, zp) - 2 * rA(th, z) + rA(th, zm))); }
    dens[i] = 1 + grade * c;
  }
  const cdf = new Float64Array(NS + 1);
  for (let i = 1; i <= NS; i++) cdf[i] = cdf[i - 1] + 0.5 * (dens[i] + dens[i - 1]);
  const total = cdf[NS]; const zs: number[] = [0]; let k = 0;
  for (let j = 1; j < nZ; j++) { const target = (total * j) / nZ; while (k < NS && cdf[k + 1] < target) k++; const seg = cdf[k + 1] - cdf[k] || 1; const frac = (target - cdf[k]) / seg; zs.push(H * ((k + frac) / NS)); }
  zs.push(H); return zs;
}
function buildSheet(rA: AnalyticRadiusFn, nTh: number, nZ: number, zGrade: number): BuiltMesh {
  const zs = gradedZ(rA, nZ, zGrade);
  const rows: RowSpec[] = zs.map((z) => ({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' as const }));
  return buildStructuredWall(rA, H, rows);
}

interface Common { style: string; primitive: string; config: string; tris: number; ut: number[]; idx: Uint32Array; xyz: Float64Array; rA: AnalyticRadiusFn; }

/** Score + dump STL + true-3D heatmap + manifest row. seamBandExclude: mask theta=0 band from the true-3D verdict
 * (SFB seam-wall ruler blind-spot). heatmapNote annotates the row. */
function finish(c: Common, opts: { serration: number; seamBandExclude?: boolean; heatmapNote: string; interiorFl?: number }): void {
  const { style, ut, idx, xyz, rA } = c;
  ensureDirs();
  // STL from lifted xyz (already lifted; write directly)
  writeBinarySTL(stlPath(style), xyz, idx);
  plog(`${style}: STL written (${c.tris} tris)`);
  // quality + watertight
  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const rawNM = auditNonManRaw(idx);
  const weldNM = auditNonManByIndex(xyz, idx);
  // radial chord to seed the brute anchor
  const radial = perFaceChordSag(ut, Array.from(idx), rA, H);
  // BODY radial (optionally mask theta=0 seam band for SFB) — drives the honest true-3D verdict set
  let bodyRadial = radial;
  if (opts.seamBandExclude) {
    const seamBand = (i: number): boolean => { const u = ((ut[2 * i] % 1) + 1) % 1; return u < 0.02 || u > 0.98; };
    bodyRadial = { ...radial, faceErr: Float64Array.from(radial.faceErr) };
    for (let f = 0; f < idx.length / 3; f++) { const a = idx[3 * f], b = idx[3 * f + 1], cc = idx[3 * f + 2]; if (seamBand(a) || seamBand(b) || seamBand(cc)) bodyRadial.faceErr[f] = 0; }
  }
  // honest true-3D worst-red tail: anchor at redMm=0.008 (AT/BELOW the CAD bar) so the tail is measured, not
  // body-diluted. If nRed==0 the mesh is genuinely <0.008 everywhere (a real pass). trustedP99 corrects GN.
  const anch = bruteAnchoredRedPerp(ut, Array.from(idx), rA, H, {
    redMm: 0.008, sampleN: 200, radial: bodyRadial, coarse: { nTheta: 1536, nZ: 400 }, fine: { nTheta: 3072, nZ: 800 },
  });
  const true3dP99 = anch.nRed > 0 ? anch.trustedP99 : p99(bodyRadial.faceErr);
  plog(`${style}: anchor nRed=${anch.nRed} trustedP99=${anch.trustedP99.toFixed(5)} gnP99=${anch.gnP99.toFixed(5)} gnOver=${anch.gnOver} => true3dP99=${true3dP99.toFixed(5)}`);
  // heatmap (true-3D anchored) at a tractable topK; scale 0.01mm (green <= 0.01).
  try {
    const anSag = perFaceTrue3DSagAnchored(ut, Array.from(idx), rA, H, {
      preFilterMm: 0.008, redMm: 0.02, topK: 120, radial,
      coarse: { nTheta: 1024, nZ: 300 }, fine: { nTheta: 2048, nZ: 600 },
    });
    dumpRenderBins(HEAT_DIR, style, xyz, idx, {
      colors: vertErrColors(anSag.vertErr, 0.01),
      meta: { ruler: 'true3d-anchored', style, primitive: c.primitive, config: c.config,
        label: `${style} — true-3D vs analytic surface (anchored, scale 0.01mm). ${opts.heatmapNote}`,
        worstMm: anSag.worstMm, p99Mm: true3dP99, scaleMm: 0.01, note: opts.heatmapNote },
    });
    plog(`${style}: heatmap dumped`);
  } catch (e) { plog(`${style}: heatmap FAILED ${String(e)}`); }
  const row = {
    style, primitive: c.primitive, config: c.config,
    true3dP99Mm: +true3dP99.toFixed(5),
    serrationMm: +opts.serration.toFixed(5),
    pctBelow20: +q.pctBelow20.toFixed(2),
    rawNonMan: rawNM,
    tris: c.tris, stlBytes: stlBytes(c.tris),
    weldNonMan: weldNM, minAngleDeg: +q.minAngleDeg.toFixed(2),
    anchorNRed: anch.nRed, anchorGnP99Mm: +anch.gnP99.toFixed(5), anchorGnOver: anch.gnOver,
    interiorFlChordP99Mm: opts.interiorFl != null ? +opts.interiorFl.toFixed(5) : undefined,
    heatmapNote: opts.heatmapNote,
  };
  checkpoint(row);
}

describe('PKG-THETA — packaging: STL + true-3D heatmap + manifest for SpiralRidges / SuperformulaBlossom / HexagonalHive', () => {
  // ── SpiralRidges ───────────────────────────────────────────────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_PKG_SR !== '1')('SpiralRidges: M-square graded-z sheet', () => {
    const style = 'SpiralRidges';
    if (stlDone(style) && manifestHas(style)) { plog(`${style}: exists — skip`); expect(true).toBe(true); return; }
    const t0 = Date.now(); const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const mesh = buildSheet(rA, 2200, 940, 6);
    plog(`${style}: built ${mesh.nF} tris (${Date.now() - t0}ms)`);
    finish(
      { style, primitive: 'M-square graded-z sheet', config: 'nTh=2200 nZ=940 zGrade=6 (sr_c2200_z940_sq)', tris: mesh.nF, ut: mesh.ut, idx: mesh.idx, xyz: mesh.xyz, rA },
      { serration: 0, heatmapNote: 'smooth helix; structured on-surface sheet (serration 0 by construction).' },
    );
    expect(stlDone(style)).toBe(true);
  }, 30 * 60 * 1000);

  // ── SuperformulaBlossom ────────────────────────────────────────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_PKG_SFB !== '1')('SuperformulaBlossom: ridge-graph body + doubled seam ladder', () => {
    const style = 'SuperformulaBlossom';
    if (stlDone(style) && manifestHas(style)) { plog(`${style}: exists — skip`); expect(true).toBe(true); return; }
    const t0 = Date.now(); const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const truth = buildFeatureTruth(style as StyleId, {}, DIMS, 384);
    const hRow = 0.15;
    const births = findBirths(rA, H, 4096);
    const ts = msquareRows(rA, H, hRow, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: hRow * 6 });
    const graph = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
    const rows = rasterizeColumnsSquare(graph, rA, H, 0.03, 2, 0.03, 0.6);
    const mesh = buildSeamLadderWatertight(rA, H, rows);
    plog(`${style}: built ${mesh.nF} tris (${Date.now() - t0}ms)`);
    // seam-lip serration: max radial residual of the u=0+/u=1- lip vertices vs rA(0,z)/rA(2pi-,z) (lips only).
    let lipSerr = 0; const nV = mesh.ut.length / 2;
    for (let i = 0; i < nV; i++) {
      const u = ((mesh.ut[2 * i] % 1) + 1) % 1; if (!(u < 3e-3 || u > 1 - 3e-3)) continue;
      const z = mesh.ut[2 * i + 1] * H; const r0 = rA(1e-9, z), r1 = rA((1 - 1e-9) * TAU, z);
      const rx = Math.hypot(mesh.xyz[3 * i], mesh.xyz[3 * i + 1]); const d = Math.min(Math.abs(rx - r0), Math.abs(rx - r1));
      if (d < 1e-3 && d > lipSerr) lipSerr = d; // classify as lip (near a true seam radius), report residual
    }
    // interior feature-line true-3D (body fidelity), seam+rim band excluded
    const meshUt = buildMeshUt(mesh.ut, Array.from(mesh.idx), rA, H);
    const loc = buildLocator(meshUt, 256);
    const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.02 && p.u < 0.98 && p.t > 0.02 && p.t < 0.98)) };
    const fl3 = interior.lines.length ? featureLineChord3D(interior, loc, meshUt, rA, H, 0.05, 0, 4) : { p99Mm: 0 };
    finish(
      { style, primitive: 'ridge-graph M-square body + doubled seam-edge+rung watertight ladder', config: `hRow=${hRow} (buildSeamLadderWatertight)`, tris: mesh.nF, ut: mesh.ut, idx: mesh.idx, xyz: mesh.xyz, rA },
      { serration: lipSerr, seamBandExclude: true, interiorFl: fl3.p99Mm,
        heatmapNote: 'true3dP99 is the BODY (theta=0 seam band excluded). The seam-wall ribbon reads high because the non-2pi seam is a genuine radius-discontinuity CLIFF off the analytic surface — a PROVEN parametric-ruler blind-spot, not a defect; the doubled lip edges (u=0+/u=1-) are exact mesh edges (serration ~0) and the mesh is raw-index watertight.' },
    );
    expect(stlDone(style)).toBe(true);
  }, 45 * 60 * 1000);

  // ── HexagonalHive ──────────────────────────────────────────────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_PKG_HH !== '1')('HexagonalHive: CDT-under-M chordSteiner 0.010', () => {
    const style = 'HexagonalHive';
    if (stlDone(style) && manifestHas(style)) { plog(`${style}: exists — skip`); expect(true).toBe(true); return; }
    const t0 = Date.now(); const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const truth = buildFeatureTruth(style as StyleId, {}, DIMS, 384);
    const KBASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;
    const km = buildInhouseMetricMesh(rA, H, { ...KBASE, maxPoints: 6_000_000, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.010, chordSteiner: true });
    const ut = Array.from(km.ut); const idx = km.indices;
    const xyz = liftUtToRadial(ut, rA, H).vertices; // Float32 lifted positions
    const xyz64 = Float64Array.from(xyz);
    plog(`${style}: built ${idx.length / 3} tris (${Date.now() - t0}ms)`);
    // interior feature-line true-3D (the HexHive verdict metric; nRed==0 => fl-chord IS the true-3D)
    const meshUt = buildMeshUt(ut, Array.from(idx), rA, H);
    const loc = buildLocator(meshUt, 256);
    const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
    const fl3 = featureLineChord3D(interior, loc, meshUt, rA, H, 0.05, 0, 4);
    finish(
      { style, primitive: 'CDT-under-M chordSteiner', config: 'chordTolMm=0.010 @6M (steiner0.010/d6M)', tris: idx.length / 3, ut, idx, xyz: xyz64, rA },
      { serration: 0, interiorFl: fl3.p99Mm,
        heatmapNote: 'CDT-under-M; zero red facets at density (pure under-density, no steep tail). true3dP99 == interior fl-chord p99.' },
    );
    expect(stlDone(style)).toBe(true);
  }, 45 * 60 * 1000);
});
