// _cu_dslip_fix.test.ts — DEV-ONLY (research/ oracle; src/ must NEVER import). Isolated. TRACK A close-out.
//
// DIAGNOSIS (from _cu_dslip_diag): the DragonScales 0.0105 residual is NOT the near-vertical lip wall
// (lip p99=0.0016, already clean). It is per-facet chord SAG on the CONTINUOUS CURVED SHEET between the C0
// rings — worst facets are MID-band (dRing≈7.7, maximally far from a ring), zSpan=0.5mm (the sheet z-row
// spacing), growing with z (dsHeightGradient deepens the scale relief with height). The scale surface curves
// smoothly in z within each 15mm scale row; 30 sheet-rows/band (0.5mm) under-resolves that curvature.
//
// HYPOTHESIS (revised): the residual is DENSITY-RESPONSIVE in the SHEET z-direction — increasing nZband
// (sheet z-rows per band) drops sheet p99 ≤0.01. The prior _pf_dslip floor was an ARTIFACT of only varying θ
// (nTh) + lipRows while holding the sheet z-density fixed at 30 rows/band. The correct lever is sheet z-density.
//
// DISCRIMINATOR (cheapest): score the lip-refined recipe at THREE sheet z-densities (nZband 30/50/80), θ held
// moderate, vs the SAME fine ref. If sheet p99 drops monotonically toward ≤0.01 with nZband → density-responsive,
// REACHES. Confirm at two overall densities. If sheet p99 FLOORS density-invariant >0.01 → genuine curved-sheet
// sub-facet residual (report honestly). Serration kept ≤0.001 via nTh≥1800.
//
// KILL-CRITERION (pre-registered): REACHES iff true-3D p99 (BVH vs fine ref) ≤0.01 AND serration ≤0.001 AND
// rawNonMan 0 AND %<20 <10, at TWO densities, ≤6M tris. Else characterize the floor honestly.
//
// ISOLATION: NEW files only. Per-key skip-if-exists ⇒ resumable / env-kill safe. Checkpoint each config on score.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex, vertErrColors, dumpRenderBins,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;
const SERR_TOL = 0.001;
const DIR = join('research', 'exchange', '_cu_dslip');
const NDJSON = join(DIR, 'scorecard.ndjson');

const keyExists = (k: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'fix.log'), `${new Date().toISOString()} ${m}\n`); };

const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function metric3DBvh(mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }): { worst: number; p99: number; over01: number; faceErr: Float64Array } {
  const { xyz, idx, nF } = mesh; const faceErr = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let mx = 0;
    for (const [w0, w1, w2] of BARY) { const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz; const d = loc.dist(px, py, pz); if (d > mx) mx = d; }
    faceErr[f] = mx;
  }
  const sorted = Float64Array.from(faceErr).sort();
  let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > CAD_TOL) over++;
  return { worst: sorted[sorted.length - 1], p99: sorted[Math.floor(0.99 * sorted.length)], over01: over, faceErr };
}
function auditNonManRaw(idx: Uint32Array): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; if (a === b || b === c || a === c) continue; for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); } }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}
function segPtDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}
function lipSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): { p99: number; max: number } {
  const vals: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 4; s++) {
      const th = TAU * (s / (n * 4)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      const c0 = Math.floor((th / TAU) * n); let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn; const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      vals.push(best);
    }
  }
  vals.sort((a, b) => a - b);
  return { p99: vals[Math.floor(0.99 * vals.length)], max: vals[vals.length - 1] };
}
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

/**
 * Lip-refined doubled-ring rows with SHEET-Z-DENSITY as the primary lever. `nZband` = sheet rows per 15mm band.
 * `zGrade`: if true, place sheet rows GRADED denser at high z (where dsHeightGradient deepens the relief) —
 * cosine-clustered toward the ring above (a curvature-following z-placement, still purely on-surface since
 * every sheet vertex is rA(θ, z) exactly). treadSub square-sized; DOUBLED lip edge pair; near-lip fine band.
 */
function buildLipRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number, opts: { lipRows?: number; lipBandMm?: number }): RowSpec[] {
  const zEps = 5e-4; const lipRows = opts.lipRows ?? 0; const lipBand = opts.lipBandMm ?? 0.6;
  const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    for (let i = lipRows; i >= 1; i--) { const z = ring.z - lipBand * (i / (lipRows + 1)); if (z > cursor + 1e-6) rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arc = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(24, Math.round(span / Math.max(arc, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    for (let i = 1; i <= lipRows; i++) { const z = ring.z + lipBand * (i / (lipRows + 1)); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

function scoreDs(key: string, density: string, rA: (t: number, z: number) => number, rows: RowSpec[], loc: { dist: (x: number, y: number, z: number) => number }, refTag: string, extra: Record<string, unknown>, dump: boolean): void {
  const t0 = Date.now();
  const mesh = buildStructuredWall(rA, H, rows);
  plog(`${key} built ${mesh.nF} tris (${Date.now() - t0}ms)`);
  const m = metric3DBvh(mesh, loc);
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx);
  const ser = lipSerration(rA, mesh, rows);
  // per-class p99 (sheet vs lip)
  const rowOf = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
  const sheetErr: number[] = [], lipErr: number[] = [];
  for (let f = 0; f < mesh.nF; f++) { const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2]; const isLip = [a, b, c].some(v => { const k = rows[rowOf[v]].kind; return k === 'ringBelow' || k === 'ringAbove' || k === 'tread'; }); (isLip ? lipErr : sheetErr).push(m.faceErr[f]); }
  sheetErr.sort((x, y) => x - y); lipErr.sort((x, y) => x - y);
  const sheetP99 = sheetErr.length ? sheetErr[Math.floor(0.99 * sheetErr.length)] : 0;
  const lipP99 = lipErr.length ? lipErr[Math.floor(0.99 * lipErr.length)] : 0;
  plog(`${key} p99=${m.p99.toFixed(4)} sheetP99=${sheetP99.toFixed(4)} lipP99=${lipP99.toFixed(4)} worst=${m.worst.toFixed(4)} %<20=${q.pctBelow20.toFixed(2)} rawNM=${rawNM} serP99=${ser.p99.toExponential(2)} (${Date.now() - t0}ms)`);
  if (dump) {
    const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
    dumpRenderBins(DIR, `DragonScales_${density}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01), meta: { ruler: 'true3d-closed-object', label: `DragonScales sheet-densified ${density} — 3D vs closed object (scale 0.01mm)`, worstMm: m.worst, p99Mm: m.p99, sheetP99Mm: sheetP99, scaleMm: 0.01 }, stl: true });
  }
  const reaches = m.p99 <= CAD_TOL && ser.p99 <= SERR_TOL && rawNM === 0 && q.pctBelow20 < 10;
  checkpoint({
    key, style: 'DragonScales', density, ref: refTag, tris: mesh.nF, ...extra,
    true3dP99Mm: +m.p99.toFixed(4), true3dMaxMm: +m.worst.toFixed(4), nAbove01: m.over01,
    sheetP99Mm: +sheetP99.toFixed(4), lipP99Mm: +lipP99.toFixed(4),
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx),
    serrationP99Mm: +ser.p99.toExponential(3), serrationMaxMm: +ser.max.toExponential(3),
    reaches001: m.p99 <= CAD_TOL, serrReaches: ser.p99 <= SERR_TOL, pass: reaches, ruler: 'BVH-closed-object',
  });
}

describe('CU-DSLIP-FIX', () => {
  it.skipIf(process.env.PF_CU_DSLIP !== '1')('DragonScales sheet-z-density sweep → true-3D ≤0.01 or honest floor', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    const t0 = Date.now();
    // Fine ref (matches _pf_dslip fine ref 3840/48) built ONCE, reused across all configs.
    let loc: { dist: (x: number, y: number, z: number) => number } | null = null;
    const getLoc = (): typeof loc => { if (!loc) { const ref = buildStepReference(rA, H, rings, { nTheta: 3840, nZperBand: 48, zEps: 5e-4 }); plog(`ref nF=${ref.nF} (${Date.now() - t0}ms)`); loc = buildRefLocator(ref, 2.0); } return loc; };

    // SCREEN sweep: sheet z-density 30 → 50 → 80 rows/band, nTh 1800 (serration), lipRows 4.
    if (!keyExists('sheet_z30')) { const rows = buildLipRows(rA, rings, 1800, 30, { lipRows: 4 }); scoreDs('sheet_z30', 'z30', rA, rows, getLoc()!, 'fine(3840/48)', { nTh: 1800, nZband: 30, lipRows: 4 }, false); }
    if (!keyExists('sheet_z50')) { const rows = buildLipRows(rA, rings, 1800, 50, { lipRows: 4 }); scoreDs('sheet_z50', 'z50', rA, rows, getLoc()!, 'fine(3840/48)', { nTh: 1800, nZband: 50, lipRows: 4 }, false); }
    if (!keyExists('sheet_z80')) { const rows = buildLipRows(rA, rings, 1800, 80, { lipRows: 4 }); scoreDs('sheet_z80', 'z80', rA, rows, getLoc()!, 'fine(3840/48)', { nTh: 1800, nZband: 80, lipRows: 4 }, true); }
    // HD confirm at the winning z-density with higher θ (density-invariance check + serration margin), ≤6M tris.
    if (!keyExists('sheet_z80_hd')) { const rows = buildLipRows(rA, rings, 2400, 80, { lipRows: 6 }); scoreDs('sheet_z80_hd', 'z80hd', rA, rows, getLoc()!, 'fine(3840/48)', { nTh: 2400, nZband: 80, lipRows: 6 }, false); }
    expect(true).toBe(true);
  }, 1_800_000);
});
