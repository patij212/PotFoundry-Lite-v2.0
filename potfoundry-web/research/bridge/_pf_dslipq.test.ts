// _pf_dslipq.test.ts — DEV-ONLY (research/ oracle). FAST reference-free aspect-balance sweep for the DragonScales
// lip-refined recipe. QUALITY (%<20) + SERRATION need NO closed-object reference (pure mesh) ⇒ seconds/config,
// so we can sweep the lip-band / treadSub / θ balance to find %<20<10 + serration≤0.001, THEN confirm the winner's
// true-3D once (in _pf_dslip). Reuses _sharp3dMesh + labkit READ-ONLY. Writes ONLY to research/exchange/_pf_dslip/.
//
// FINDING that motivates this (from _pf_dslip run): the lip-refined recipe (nTh1800 + lipRows4 + square treadSub)
// drove the LIP true-3D to lipP99 0.0016 (GREEN) and overall p99 to 0.0105 — the tread-lip is NOT irreducible, it
// responds to near-lip sheet + rung density. BUT %<20 hit 42.1% (thin near-lip z-rows + thin square rungs). This
// sweep finds the aspect-balanced config: near-lip band spaced ≈ θ-arc, treadSub ≈ square, so quality stays clean.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, triangleQualityDistribution, auditNonManByIndex } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const DIR = join('research', 'exchange', '_pf_dslip');
const NDJSON = join(DIR, 'qsweep.ndjson');

const keyExists = (k: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[QSWEEP ${row.key}] ${JSON.stringify(row)}`); };
const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'qsweep.log'), `${new Date().toISOString()} ${msg}\n`); };

// RAW-INDEX non-manifold, SHARDED (a single JS Map caps at ~16.7M entries; HD meshes exceed it — mirror labkit's
// sharding by the low bits of the min endpoint so the count is identical but the Map stays under cap).
function auditNonManRaw(idx: Uint32Array, nV: number): number {
  const EK = nV + 1; const NSHARD = 64;
  const ecs: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (p: number, r: number): void => { const kk = p < r ? p * EK + r : r * EK + p; const m = ecs[(p < r ? p : r) & (NSHARD - 1)]; m.set(kk, (m.get(kk) ?? 0) + 1); };
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; if (a === b || b === c || a === c) continue; bump(a, b); bump(b, c); bump(c, a); }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
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
    for (let s = 0; s < n * 4; s++) { const th = TAU * (s / (n * 4)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z; const c0 = Math.floor((th / TAU) * n); let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn; const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      vals.push(best); }
  }
  vals.sort((a, b) => a - b);
  return { p99: vals.length ? vals[Math.min(vals.length - 1, Math.floor(0.99 * vals.length))] : 0, max: vals.length ? vals[vals.length - 1] : 0 };
}

function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

// Aspect-balanced lip rows: near-lip sheet rows spaced by ~arc·lipAspect (NOT a fixed count), treadSub square·treadAspect.
function buildLipRowsBalanced(
  rA: (t: number, z: number) => number, rings: StepRing[], nTh: number,
  opts: { sheetAspect: number; treadAspect: number; lipAspect: number; lipBandMm: number },
): RowSpec[] {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = (): Float64Array => evenThetas(nTh);
  const rMid = rA(0, H * 0.5); const arc = (TAU * rMid) / nTh;
  const lipBand = opts.lipBandMm;
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' });
  let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number): void => {
    const span = z1 - z0; if (span <= 0) return;
    const n = Math.max(1, Math.round(span / Math.max(arc * opts.sheetAspect, 1e-4)));
    for (let i = 1; i < n; i++) { const z = z0 + span * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
  };
  // near-lip band: rows within lipBand spaced by arc·lipAspect (dense, but aspect-controlled → square cells)
  const lipStep = Math.max(arc * opts.lipAspect, 1e-4);
  const nLip = Math.max(1, Math.round(lipBand / lipStep));
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z);
    for (let i = nLip; i >= 1; i--) { const z = ring.z - lipBand * (i / (nLip + 1)); if (z > cursor + 1e-6 && !sorted.some(rg => rg !== ring && Math.abs(z - rg.z) < 1e-6)) rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arcR = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(24, Math.round(span / Math.max(arcR * opts.treadAspect, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    for (let i = 1; i <= nLip; i++) { const z = ring.z + lipBand * (i / (nLip + 1)); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    cursor = ring.z;
  }
  pushSheetBand(cursor, H);
  rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

describe('PF-DSLIPQ-sweep', () => {
  it.skipIf(process.env.PF_DSLIPQ !== '1')('DragonScales lip-refined quality/serration aspect balance (reference-free)', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rings = dragonRings();
    // sweep: (nTh, sheetAspect, treadAspect, lipAspect, lipBandMm). lipAspect≥1 keeps near-lip cells square-ish.
    const cfgs: Array<{ tag: string; nTh: number; sA: number; tA: number; lA: number; band: number }> = [
      { tag: 'q_bal_A1', nTh: 1800, sA: 1.0, tA: 1.0, lA: 1.0, band: 0.6 },
      { tag: 'q_bal_lA2', nTh: 1800, sA: 1.0, tA: 1.0, lA: 2.0, band: 0.6 },
      { tag: 'q_bal_lA3_band04', nTh: 1800, sA: 1.0, tA: 1.5, lA: 3.0, band: 0.4 },
      { tag: 'q_bal_lA4_band03', nTh: 1800, sA: 1.0, tA: 2.0, lA: 4.0, band: 0.3 },
      { tag: 'q_bal_hd_lA3', nTh: 2880, sA: 1.0, tA: 1.5, lA: 3.0, band: 0.4 },
      // serration≤0.001 needs more θ (ring polyline chord ∝ 1/nTh²): nTh 2400 → predict serP99 ~7.6e-4.
      { tag: 'q_ser_c2400', nTh: 2400, sA: 1.0, tA: 2.0, lA: 4.0, band: 0.3 },
      { tag: 'q_ser_c3000', nTh: 3000, sA: 1.0, tA: 2.0, lA: 4.0, band: 0.3 },
    ];
    for (const c of cfgs) {
      if (keyExists(c.tag)) { plog(`${c.tag} exists skip`); continue; }
      const t0 = Date.now();
      const rows = buildLipRowsBalanced(rA, rings, c.nTh, { sheetAspect: c.sA, treadAspect: c.tA, lipAspect: c.lA, lipBandMm: c.band });
      const mesh = buildStructuredWall(rA, H, rows);
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      const rawNM = auditNonManRaw(mesh.idx, mesh.nV);
      const ser = lipSerration(rA, mesh, rows);
      plog(`${c.tag} tris=${mesh.nF} %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)} rawNM=${rawNM} serP99=${ser.p99.toExponential(2)} serMax=${ser.max.toExponential(2)} (${Date.now() - t0}ms)`);
      checkpoint({ key: c.tag, style: 'DragonScales', ...c, tris: mesh.nF, pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2), rawNonMan: rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx), serrationP99Mm: +ser.p99.toExponential(3), serrationMaxMm: +ser.max.toExponential(3), qualityOk: q.pctBelow20 < 10, serrOk: ser.p99 <= 0.001 });
    }
    expect(true).toBe(true);
  }, 900_000);
});
