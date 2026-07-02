// _sfbChainColumns.test.ts — DEV-ONLY (research/ only). E-2026-07-02-SFB-CHAIN Lever 2:
// STRUCTURED RIDGE COLUMNS (the general sheared-phi analog). Instead of injecting ridge points into the
// metric-Delaunay kernel and RECOVERING them as constraint edges (the mechanism that fails at 68-129 chains),
// build a NATIVE structured theta x z wall (like _sharp3dMesh) whose theta-COLUMNS are placed EXACTLY at the
// petal ridge loci (+ even sub-columns between). Then each petal ridge IS a column of mesh edges BY
// CONSTRUCTION -> zero serration, NO crossing-chain recovery at all.
//
// Petal count changes 6->7->8->9->10 across t (GEOM probe): within each constant-count BAND we use the
// equal-count structured strip (buildStructuredWall equal-count path) so column c tracks ridge k across rows
// (a near-vertical mesh-edge chain = the ridge). At the 4 petal-birth transitions the strip merges
// (stripBetween). z-rows are placed dense at the base (t<0.05, where the tips are the exp-0.86 cusp).
//
// Measured with the FAITHFUL single-valued rulers (E-BREADTH): own-region RADIAL chord (perFaceChordSag) +
// analytic brute-nearest cross-check at the worst facets; serration (feature-curve -> nearest mesh EDGE);
// watertight by RAW-INDEX (not weld). ISOLATION: NEW files only; reuses _sharp3dMesh + _sfbPushLib + labkit.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface, dumpRenderBins } from './labkit';
import { conformingThetas } from './_sharp3dMesh';
import { serrationToMeshEdge, trustedWorstAnalytic, vertColorsFrom, tracePetalLoci } from './_sfbPushLib';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_sfbchain');
const ckptDir = (): string => { mkdirSync(ROOT, { recursive: true }); return ROOT; };
const ckpt = (name: string, obj: unknown): void => { writeFileSync(join(ckptDir(), `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

// per-row radial EXTREMA (crests = maxima, valleys = minima) in theta at a given z.
function rowExtrema(rA: AnalyticRadiusFn, z: number, scanN: number, kind: 'crest' | 'valley' | 'both'): number[] {
  const vals = new Float64Array(scanN);
  const out: number[] = [];
  const refine = (i0: number, sign: number): number => {
    // golden-section on [i0-1,i0+1]/N maximizing sign*r
    let lo = (i0 - 1) / scanN, hi = (i0 + 1) / scanN; const gr = (Math.sqrt(5) - 1) / 2;
    const f = (u: number): number => sign * rA(TAU * (((u % 1) + 1) % 1), z);
    let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
    for (let it = 0; it < 50 && hi - lo > 1e-8; it++) { if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); } else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); } }
    let u = (lo + hi) / 2; u -= Math.floor(u); return u * TAU;
  };
  for (let i = 0; i < scanN; i++) vals[i] = rA(TAU * (i / scanN), z);
  for (let i = 0; i < scanN; i++) {
    const a = vals[(i - 1 + scanN) % scanN], b = vals[i], c = vals[(i + 1) % scanN];
    if ((kind === 'crest' || kind === 'both') && b >= a && b > c) out.push(refine(i, 1));
    if ((kind === 'valley' || kind === 'both') && b <= a && b < c) out.push(refine(i, -1));
  }
  return out.sort((x, y) => x - y);
}

// place z-rows: dense at the base (t<0.05, the exp-0.86 tip cusp), moderate elsewhere. Returns t values.
function placeRows(tBaseFine: number, nBase: number, nMid: number): number[] {
  const ts: number[] = [];
  for (let i = 0; i <= nBase; i++) ts.push((tBaseFine * i) / nBase); // dense base band [0, tBaseFine]
  for (let i = 1; i <= nMid; i++) ts.push(tBaseFine + ((1 - tBaseFine) * i) / nMid);
  return Array.from(new Set(ts.map((t) => +t.toFixed(6)))).sort((a, b) => a - b);
}

interface RowT { z: number; thetas: Float64Array; }
interface WallMesh { ut: number[]; xyz: Float64Array; idx: Uint32Array; nV: number; nF: number; }

// ALWAYS-theta-merge structured wall (my own; does NOT use buildStructuredWall's equal-count INDEX path, which
// rotates the column meaning when the theta-sorted extremum set's first element changes physical ridge across
// rows — the bug that gave the 5mm first result). stripBetween walks theta and connects nearest-theta vertices,
// so a feature theta present as a SAMPLE on BOTH rows connects feature->feature => the ridge is a near-vertical
// mesh-edge chain (zero serration) regardless of count changes / births. targetDth controls across-ridge chord.
function buildThetaMergeWall(rA: AnalyticRadiusFn, H: number, rows: RowT[]): WallMesh {
  const rowStart: number[] = [0]; let total = 0;
  for (const r of rows) { total += r.thetas.length; rowStart.push(total); }
  const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]; const base = rowStart[r];
    for (let k = 0; k < row.thetas.length; k++) {
      const th = row.thetas[k]; const rad = rA(th, row.z); const v = base + k;
      xyz[3 * v] = rad * Math.cos(th); xyz[3 * v + 1] = rad * Math.sin(th); xyz[3 * v + 2] = row.z;
      ut[2 * v] = th / TAU; ut[2 * v + 1] = row.z / H;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r + 1 < rows.length; r++) {
    const topBase = rowStart[r], botBase = rowStart[r + 1];
    const topTh = rows[r].thetas, botTh = rows[r + 1].thetas;
    const topN = topTh.length, botN = botTh.length;
    let i = 0, j = 0;
    const topNext = (k: number): number => (k + 1 < topN ? topTh[k + 1] : topTh[0] + TAU);
    const botNext = (k: number): number => (k + 1 < botN ? botTh[k + 1] : botTh[0] + TAU);
    const topV = (k: number): number => topBase + (k % topN);
    const botV = (k: number): number => botBase + (k % botN);
    const steps = topN + botN;
    for (let s = 0; s < steps; s++) {
      const tn = topNext(i), bn = botNext(j);
      if (tn <= bn) { idx.push(topV(i), botV(j), topV(i + 1)); i++; }
      else { idx.push(topV(i), botV(j), botV(j + 1)); j++; }
    }
  }
  return { ut, xyz, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

describe('SFB-CHAIN COLUMNS — structured ridge-column wall (Lever 2)', () => {
  it.skipIf(process.env.PF_SFBCHAIN_COLUMNS !== '1')('builds ridge-as-column wall; measures fidelity/serration/rawNonMan (resumable)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    // targetDthMm = across-ridge chord control (max theta-arc between samples, in mm at Rt=50). scanN = extremum scan.
    const targetDthMm = Number(process.env.PF_SFBCHAIN_DTH ?? '0.3');
    const tBaseFine = Number(process.env.PF_SFBCHAIN_TBASE ?? '0.03');
    const nBase = Number(process.env.PF_SFBCHAIN_NBASE ?? '120');   // z-rows in the sharp base band
    const nMid = Number(process.env.PF_SFBCHAIN_NMID ?? '600');     // z-rows above
    const scanN = Number(process.env.PF_SFBCHAIN_SCANN ?? '8000');
    const targetDthRad = targetDthMm / 50; // arc mm -> radians at Rt~50
    const name = `columns2_dth${String(targetDthMm).replace('.', 'p')}_tb${String(tBaseFine).replace('.', 'p')}_nb${nBase}_nm${nMid}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }

    const ts = placeRows(tBaseFine, nBase, nMid);
    // per-row theta samples = conformingThetas(crests+valleys, targetDth): every feature theta is a SAMPLE
    // (=> the feature is a mesh vertex on every row it crosses) AND across-feature arcs are <= targetDth. The
    // theta-MERGE wall connects nearest-theta vertices between rows => feature-theta connects feature-to-feature
    // => the ridge/valley is a near-vertical mesh-edge chain (zero serration) BY CONSTRUCTION, no recovery.
    const rows: RowT[] = [];
    const countsPerRow: number[] = [];
    for (const t of ts) {
      const z = t * DIMS.H;
      const ext = rowExtrema(rA, z, scanN, 'both'); // crests + valleys sorted (radians)
      const thetas = conformingThetas(ext, targetDthRad);
      rows.push({ z, thetas });
      countsPerRow.push(thetas.length);
    }
    console.log(`rows ${rows.length}, col-counts range ${Math.min(...countsPerRow)}..${Math.max(...countsPerRow)}`);
    const mesh = buildThetaMergeWall(rA, DIMS.H, rows);
    console.log(`mesh ${mesh.nF} tris, ${mesh.nV} verts`);

    // ── RAW-INDEX non-manifold (true topology; sharded) ──
    const nonManRaw = ((): number => {
      const idx = mesh.idx; let mx = 0; for (let i = 0; i < idx.length; i++) if (idx[i] > mx) mx = idx[i];
      const EK = mx + 1; const NSHARD = 64;
      const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
      const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
      for (let f = 0; f < idx.length; f += 3) { const a = idx[f], b = idx[f + 1], c = idx[f + 2]; if (a !== b) bump(a, b); if (b !== c) bump(b, c); if (a !== c) bump(a, c); }
      let nm = 0; for (const m of ms) for (const v of m.values()) if (v > 2) nm++; return nm;
    })();

    // ── FIDELITY: own-region radial chord (faithful for single-valued SFB) + analytic-brute at worst facets ──
    const ut = Array.from(mesh.ut);
    const xyzF = Float32Array.from(mesh.xyz);
    const own = perFaceChordSag(ut, mesh.idx, rA, DIMS.H);
    const twOwn = trustedWorstAnalytic(ut, xyzF, mesh.idx, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 800, 0.01);
    // ── SERRATION: are the traced ridge loci embedded as mesh edges? ──
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    const featUt: number[] = []; for (const ln of loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, mesh.idx);
    // ── QUALITY ──
    const vtx = Float64Array.from(mesh.xyz);
    const tq = triangleQualityDistribution({ vertices: vtx, indices: mesh.idx });

    const rec = {
      config: name, targetDthMm, tBaseFine, nBase, nMid, scanN, tris: mesh.nF, verts: mesh.nV,
      colCountRange: [Math.min(...countsPerRow), Math.max(...countsPerRow)],
      nonManRaw,
      ownWorstMm: own.worstMm,
      ownTrustedWorstMm: twOwn.worstMm, ownTrustedNOver01: twOwn.nOverTol,
      ownNOver01: Math.round(own.fracOver(0.01) * mesh.nF), ownNOver005: Math.round(own.fracOver(0.005) * mesh.nF),
      pctOver01: 100 * own.fracOver(0.01),
      ownTrustedWorstFacets: twOwn.overFacets.slice(0, 15),
      maxGnMinusBrute: twOwn.maxGnMinusBrute, maxBruteMinusGn: twOwn.maxBruteMinusGn,
      serrationMm: { worst: serr.worstMm, p99: serr.p99Mm, mean: serr.meanMm, n: serr.n },
      quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ckpt(name, rec);
    // heatmap (own-region ruler, scale 0.01)
    const col = vertColorsFrom(own.vertErr, 0.01);
    const p99 = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * mesh.nF)] ?? 0;
    dumpRenderBins(ckptDir(), name, xyzF, mesh.idx, {
      colors: col, meta: { ruler: 'true3d(own)', worstMm: twOwn.worstMm, p99Mm: p99, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE },
      stl: process.env.PF_SFBCHAIN_STL === '1',
    });
    console.log(`COLUMNS ${name} OWN-trusted ${twOwn.worstMm.toFixed(4)} (nOver01 ${twOwn.nOverTol}) ownWorst ${own.worstMm.toFixed(4)} serr ${serr.worstMm.toExponential(2)} rawNonMan ${nonManRaw} minAngle ${tq.minAngleDeg} %<20 ${tq.pctBelow20}`);
    expect(mesh.nF).toBeGreaterThan(0);
  }, 3_600_000);
});
