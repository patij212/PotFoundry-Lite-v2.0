// _pf_dslipt.test.ts — DEV-ONLY (research/ oracle). TRUE-3D confirm of the aspect-balanced lip-refined DragonScales
// recipe (the config that ALREADY passes quality %<20<10 + serration≤0.001 + rawNonMan 0 in _pf_dslipq). Measures
// the closed-object BVH true-3D at TWO densities on the SAME balanced builder, against a MODERATE reference (kept
// tractable — the 3M-tri fine ref in _pf_dslip took ~28min/config). Reuses _sharp3dRef/_sharp3dMesh/labkit READ-ONLY.
//
// The _pf_dslip run established: (1) plain doubled-rings floor is ref-INVARIANT (coarse-ref 0.021 vs fine-ref 0.026 —
// finer ref does NOT lower it → genuine near-vertical lip cliff, not a ruler floor); (2) the LIP true-3D IS reducible
// (lip-refined lipP99 0.0016 GREEN, overall p99 0.0105) but the naive lip refine blew %<20 to 42%. _pf_dslipq then
// found the aspect-balanced near-lip band recovers %<20 to 0.6% + serration≤0.001. THIS probe measures that winner's
// true-3D at 2 densities → does aspect-balanced + lip-refined REACH overall p99 ≤0.01, or floor just above (0.010–0.013)?
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, triangleQualityDistribution, auditNonManByIndex, vertErrColors, dumpRenderBins } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01, SERR_TOL = 0.001;
const DIR = join('research', 'exchange', '_pf_dslip');
const NDJSON = join(DIR, 'truescore.ndjson');

const keyExists = (k: string): boolean => existsSync(NDJSON) && readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } });
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[TRUE ${row.key}] ${JSON.stringify(row)}`); };
const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'truescore.log'), `${new Date().toISOString()} ${msg}\n`); };

const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function metric3DBvh(mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }): { worst: number; p99: number; p999: number; over01: number; faceErr: Float64Array } {
  const { xyz, idx, nF } = mesh; const faceErr = new Float64Array(nF);
  for (let f = 0; f < nF; f++) { const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2], cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let mx = 0; for (const [w0, w1, w2] of BARY) { const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz; const d = loc.dist(px, py, pz); if (d > mx) mx = d; } faceErr[f] = mx; }
  const s = Float64Array.from(faceErr).sort(); let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > CAD_TOL) over++;
  return { worst: s.length ? s[s.length - 1] : 0, p99: s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0, p999: s.length ? s[Math.min(s.length - 1, Math.floor(0.999 * s.length))] : 0, over01: over, faceErr };
}
function auditNonManRaw(idx: Uint32Array, nV: number): number {
  const EK = nV + 1, NSHARD = 64; const ecs: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (p: number, r: number): void => { const kk = p < r ? p * EK + r : r * EK + p; const m = ecs[(p < r ? p : r) & (NSHARD - 1)]; m.set(kk, (m.get(kk) ?? 0) + 1); };
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; if (a === b || b === c || a === c) continue; bump(a, b); bump(b, c); bump(c, a); }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}
function segPtDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1; let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}
function lipSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): { p99: number; max: number } {
  const vals: number[] = [];
  for (let r = 0; r < rows.length; r++) { if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue; const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 4; s++) { const th = TAU * (s / (n * 4)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z; const c0 = Math.floor((th / TAU) * n); let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn; const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; } vals.push(best); } }
  vals.sort((a, b) => a - b);
  return { p99: vals.length ? vals[Math.min(vals.length - 1, Math.floor(0.99 * vals.length))] : 0, max: vals.length ? vals[vals.length - 1] : 0 };
}
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

// aspect-balanced lip rows (VERBATIM from _pf_dslipq buildLipRowsBalanced).
function buildLipRowsBalanced(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, opts: { sheetAspect: number; treadAspect: number; lipAspect: number; lipBandMm: number }): RowSpec[] {
  const zEps = 5e-4; const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  const rMid = rA(0, H * 0.5); const arc = (TAU * rMid) / nTh; const lipBand = opts.lipBandMm;
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number): void => { const span = z1 - z0; if (span <= 0) return; const n = Math.max(1, Math.round(span / Math.max(arc * opts.sheetAspect, 1e-4))); for (let i = 1; i < n; i++) { const z = z0 + span * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  const lipStep = Math.max(arc * opts.lipAspect, 1e-4); const nLip = Math.max(1, Math.round(lipBand / lipStep));
  for (const ring of sorted) { pushSheetBand(cursor, ring.z);
    for (let i = nLip; i >= 1; i--) { const z = ring.z - lipBand * (i / (nLip + 1)); if (z > cursor + 1e-6 && !sorted.some(rg => rg !== ring && Math.abs(z - rg.z) < 1e-6)) rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps; const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arcR = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(24, Math.round(span / Math.max(arcR * opts.treadAspect, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    for (let i = 1; i <= nLip; i++) { const z = ring.z + lipBand * (i / (nLip + 1)); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } cursor = ring.z; }
  pushSheetBand(cursor, H); rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

function score(key: string, density: string, rA: (t: number, z: number) => number, rows: RowSpec[], loc: ReturnType<typeof buildRefLocator>, refTag: string, extra: Record<string, unknown>, dump: boolean): void {
  const t0 = Date.now(); const mesh = buildStructuredWall(rA, H, rows); plog(`${key} built ${mesh.nF} tris (${Date.now() - t0}ms)`);
  const m = metric3DBvh(mesh, loc); const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx }); const rawNM = auditNonManRaw(mesh.idx, mesh.nV); const ser = lipSerration(rA, mesh, rows);
  const rowOf = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
  const lipErr: number[] = []; for (let f = 0; f < mesh.nF; f++) { const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2]; if ([a, b, c].some(v => { const k = rows[rowOf[v]].kind; return k === 'ringBelow' || k === 'ringAbove' || k === 'tread'; })) lipErr.push(m.faceErr[f]); }
  lipErr.sort((x, y) => x - y); const lipP99 = lipErr.length ? lipErr[Math.min(lipErr.length - 1, Math.floor(0.99 * lipErr.length))] : 0; const lipMax = lipErr.length ? lipErr[lipErr.length - 1] : 0;
  plog(`${key} scored p99=${m.p99.toFixed(4)} p999=${m.p999.toFixed(4)} worst=${m.worst.toFixed(4)} lipP99=${lipP99.toFixed(4)} lipMax=${lipMax.toFixed(4)} over01=${m.over01} %<20=${q.pctBelow20.toFixed(2)} rawNM=${rawNM} serP99=${ser.p99.toExponential(2)} (${Date.now() - t0}ms)`);
  if (dump) { const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
    dumpRenderBins(DIR, `DragonScales_bal_${density}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01), meta: { ruler: 'true3d-closed-object', label: `DragonScales aspect-balanced lip-refined ${density} — 3D vs closed object (0.01mm)`, worstMm: m.worst, p99Mm: m.p99, lipP99Mm: lipP99, pctOver0_01: 100 * m.over01 / mesh.nF, scaleMm: 0.01 }, stl: true }); }
  const pass = m.p99 <= CAD_TOL && ser.p99 <= SERR_TOL && rawNM === 0 && q.pctBelow20 < 10;
  checkpoint({ key, style: 'DragonScales', density, ref: refTag, tris: mesh.nF, ...extra,
    honestTrue3dP99Mm: +m.p99.toFixed(4), honestTrue3dP999Mm: +m.p999.toFixed(4), honestTrue3dMaxMm: +m.worst.toFixed(4), nAbove01: m.over01,
    lipP99Mm: +lipP99.toFixed(4), lipMaxMm: +lipMax.toFixed(4), pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx), serrationP99Mm: +ser.p99.toExponential(3), serrationMaxMm: +ser.max.toExponential(3),
    reaches001: m.p99 <= CAD_TOL, serrReaches: ser.p99 <= SERR_TOL, pass, ruler: 'BVH-closed-object' });
}

describe('PF-DSLIPT-DragonScales', () => {
  it.skipIf(process.env.PF_DSLIPT !== '1')('DragonScales aspect-balanced lip-refined: true-3D at 2 densities', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS); const rings = dragonRings(); const t0 = Date.now();
    // MODERATE ref (2560/32 ≈ 1.6M tris) — dense enough to resolve the tread band, fast enough for a ~5M-facet query.
    const ref = buildStepReference(rA, H, rings, { nTheta: 2560, nZperBand: 32, zEps: 5e-4 }); plog(`ref nF=${ref.nF} (${Date.now() - t0}ms)`); const loc = buildRefLocator(ref, 2.5);
    // SCREEN: nTh1440 balanced (~3.2M facets) → ~5-8min query.
    if (!keyExists('bal_screen')) { const rows = buildLipRowsBalanced(rA, rings, 1440, { sheetAspect: 1.0, treadAspect: 2.0, lipAspect: 4.0, lipBandMm: 0.3 }); score('bal_screen', 'screen', rA, rows, loc, 'mod(2560/32)', { config: 'balanced nTh1440 tA2 lA4 band0.3' }, true); }
    // HD: nTh2400 balanced (the quality+serr winner q_ser_c2400, ~5.7M facets).
    if (!keyExists('bal_hd')) { const rows = buildLipRowsBalanced(rA, rings, 2400, { sheetAspect: 1.0, treadAspect: 2.0, lipAspect: 4.0, lipBandMm: 0.3 }); score('bal_hd', 'hd', rA, rows, loc, 'mod(2560/32)', { config: 'balanced nTh2400 tA2 lA4 band0.3 (=q_ser_c2400)' }, false); }
    expect(true).toBe(true);
  }, 1_800_000);
});
