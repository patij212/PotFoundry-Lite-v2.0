// _pf_dslip.test.ts — DEV-ONLY (research/ oracle; src/ must NEVER import this). Isolated. Reuses
// _sharp3dRef / _sharp3dMesh / labkit READ-ONLY. Writes ONLY to research/exchange/_pf_dslip/.
//
// MANDATE (DragonScales, this agent): plain doubled-rings already gets DragonScales to true-3D p99 ~0.0136
// (density-INVARIANT tread-LIP floor) with %<20 0.4, rawNonMan 0, serration ~0.010 (E-2026-07-03-GAP-TREADSQ).
// The tread-lip is a near-vertical C0 riser at t=k/8. It is JUST over the bar (1.36×). GOAL: make the tread-LIP
// a CLEANER doubled feature-edge PAIR + rung strip (both lip edges = mesh-edge chains, rungs on the vertical lip
// wall) so serration → ≤0.001 AND the true-3D on the lip drops ≤0.01, at TWO densities.
//
// HYPOTHESIS: the prior ~0.0136 has TWO components confounded: (a) the closed-object REFERENCE's own tread-band
// discretization (nTheta 1920 / nZband 24 vs the export mesh's density → a ruler floor), and (b) the genuine
// near-vertical lip-wall chord. A FINE reference (nTheta 3840 + explicit dense tread bands) + a lip-refined export
// (finer θ for lower serration + more treadSub rungs + a fine near-lip sheet band) drives BOTH down: serration
// ≤0.001 (θ-density) AND true-3D ≤0.01 (if the lip residual was mostly ruler-floor). ELSE the lip floors at a
// density-INVARIANT value with the fine ref too ⇒ genuine near-vertical designed cliff = steep-EXCLUDE (honest
// close under the zero-serration standard: serr ≤0.001, faces CAD-grade, lip is designed geometry meshed as a
// clean doubled edge pair).
//
// DISCRIMINATOR (cheapest): reproduce the plain-doubled-rings baseline against BOTH the coarse ref (prior 0.0136)
// AND a FINE ref (isolates the ruler floor); then the lip-refined recipe at 2 densities. If the FINE-ref baseline
// already drops well below 0.0136, the residual was ruler discretization → the lip reaches. If it stays ~0.0136
// independent of ref AND density → genuine cliff → EXCLUDE.
//
// KILL-CRITERION (pre-registered): REACHES iff true-3D p99 (closed-object BVH vs FINE ref) ≤0.01 AND serration
// ≤0.001 AND rawNonMan 0 AND %<20 <10, at TWO densities. STEEP-EXCLUDE iff true-3D floors >0.01 density-INVARIANT
// with the fine ref (ref-independent) while serration ≤0.001 + rawNonMan 0 + %<20 <10 (clean doubled edge pair) —
// an honest close under the zero-serration standard. Else characterize the residual honestly.
//
// ISOLATION: NEW files only (_pf_dslip*). Per-density skip-if-row-exists ⇒ resumable / env-kill safe. Checkpoint
// each config the INSTANT it is scored.
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
const DIR = join('research', 'exchange', '_pf_dslip');
const NDJSON = join(DIR, 'scorecard.ndjson');

const keyExists = (k: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`);
};
const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'progress.log'), `${new Date().toISOString()} ${msg}\n`); };

// ── closed-object BVH 3D metric: facet (3 edge-mids + centroid) → nearest pt on the reference mesh ──
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function metric3DBvh(mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }): { worst: number; p99: number; over01: number; faceErr: Float64Array } {
  const { xyz, idx, nF } = mesh;
  const faceErr = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let mx = 0;
    for (const [w0, w1, w2] of BARY) {
      const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
      const d = loc.dist(px, py, pz); if (d > mx) mx = d;
    }
    faceErr[f] = mx;
  }
  const sorted = Float64Array.from(faceErr).sort();
  let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > CAD_TOL) over++;
  return { worst: sorted.length ? sorted[sorted.length - 1] : 0, p99: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0, over01: over, faceErr };
}
function auditNonManRaw(idx: Uint32Array): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}
function segPtDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}
/**
 * LIP serration: for BOTH lip edges (ringBelow r_in(θ), ringAbove r_out(θ)) sample the TRUE curve at 4× row
 * density and measure nearest distance to the ROW's own mesh-edge chain — a doubled feature-edge PAIR should read
 * near-zero (the ring curve IS the polyline; residual = the polyline chord sag between θ-samples).
 */
function lipSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): { p99: number; max: number } {
  const vals: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 4; s++) {
      const th = TAU * (s / (n * 4)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      const c0 = Math.floor((th / TAU) * n); let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn;
        const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      vals.push(best);
    }
  }
  vals.sort((a, b) => a - b);
  return { p99: vals.length ? vals[Math.min(vals.length - 1, Math.floor(0.99 * vals.length))] : 0, max: vals.length ? vals[vals.length - 1] : 0 };
}
// per-facet min-angle (deg)
function minAng(mesh: BuiltMesh, f: number): number {
  const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
  const ax = mesh.xyz[3 * a], ay = mesh.xyz[3 * a + 1], az = mesh.xyz[3 * a + 2];
  const bx = mesh.xyz[3 * b], by = mesh.xyz[3 * b + 1], bz = mesh.xyz[3 * b + 2];
  const cx = mesh.xyz[3 * c], cy = mesh.xyz[3 * c + 1], cz = mesh.xyz[3 * c + 2];
  const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
  if (la < 1e-9 || lb < 1e-9 || lc < 1e-9) return 0;
  const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
  const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
  return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
}

// DragonScales rings: 7 C0 radius-step rings, t=k/8, z=k·15, θ-independent (E-BREADTH STEP-0).
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

/**
 * Lip-refined doubled-ring rows. Each ring gets a DOUBLED feature-edge PAIR (ringBelow r_in, ringAbove r_out) with
 * `treadSub` interior RUNG rows on the vertical lip wall (square-sized to the θ-arc), PLUS a fine near-lip SHEET
 * band (`lipRows` extra sheet rows within ±`lipBandMm` of the ring z) so the sheet approaches the lip densely
 * (kills the one-sided ring-lip thin quad). Sheet elsewhere is even in z (`nZband` rows/band). θ uniform `nTh`.
 */
function buildLipRows(
  rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number,
  opts: { squareTread?: boolean; fixedTreadSub?: number; lipRows?: number; lipBandMm?: number },
): RowSpec[] {
  const zEps = 5e-4;
  const lipRows = opts.lipRows ?? 0;
  const lipBand = opts.lipBandMm ?? 0.5;
  const rows: RowSpec[] = [];
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = (): Float64Array => evenThetas(nTh);
  // even sheet band z0->z1 with `n` interior rows; skips z within lipBand of any ring (those are lip rows).
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' });
  let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    // fine near-lip sheet rows APPROACHING the ring from below (dense toward the lip)
    for (let i = lipRows; i >= 1; i--) { const z = ring.z - lipBand * (i / (lipRows + 1)); if (z > cursor + 1e-6) rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    let treadSub = opts.fixedTreadSub ?? 3;
    if (opts.squareTread) {
      const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn);
      const rMean = 0.5 * (rIn + rOut); const arc = (TAU * rMean) / nTh;
      treadSub = Math.max(2, Math.min(24, Math.round(span / Math.max(arc, 1e-4)) + 1));
    }
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' }); // DOUBLED lip-edge (bottom of wall)
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } }); // rungs
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' }); // DOUBLED lip-edge (top of wall)
    // fine near-lip sheet rows LEAVING the ring above
    for (let i = 1; i <= lipRows; i++) { const z = ring.z + lipBand * (i / (lipRows + 1)); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); }
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

function scoreDs(
  key: string, density: string, rA: (t: number, z: number) => number, rows: RowSpec[],
  loc: { dist: (x: number, y: number, z: number) => number }, refTag: string, extra: Record<string, unknown>, dump: boolean,
): void {
  const t0 = Date.now();
  const mesh = buildStructuredWall(rA, H, rows);
  plog(`${key} built ${mesh.nF} tris (${Date.now() - t0}ms)`);
  const m = metric3DBvh(mesh, loc);
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx);
  const ser = lipSerration(rA, mesh, rows);
  // lip-only p99 (facets touching a ringBelow/ringAbove/tread row) — isolate the vertical lip wall true-3D.
  const rowOf = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
  const lipErr: number[] = [];
  for (let f = 0; f < mesh.nF; f++) {
    const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
    const isLip = [a, b, c].some(v => { const k = rows[rowOf[v]].kind; return k === 'ringBelow' || k === 'ringAbove' || k === 'tread'; });
    if (isLip) lipErr.push(m.faceErr[f]);
  }
  lipErr.sort((x, y) => x - y);
  const lipP99 = lipErr.length ? lipErr[Math.min(lipErr.length - 1, Math.floor(0.99 * lipErr.length))] : 0;
  const lipMax = lipErr.length ? lipErr[lipErr.length - 1] : 0;
  plog(`${key} scored p99=${m.p99.toFixed(4)} worst=${m.worst.toFixed(4)} lipP99=${lipP99.toFixed(4)} lipMax=${lipMax.toFixed(4)} %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)} rawNM=${rawNM} serP99=${ser.p99.toExponential(2)} serMax=${ser.max.toExponential(2)} (${Date.now() - t0}ms)`);
  if (dump) {
    const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
    dumpRenderBins(DIR, `DragonScales_${density}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01), meta: { ruler: 'true3d-closed-object', label: `DragonScales lip-refined ${density} — 3D vs closed object (scale 0.01mm)`, worstMm: m.worst, p99Mm: m.p99, lipP99Mm: lipP99, pctOver0_01: 100 * m.over01 / mesh.nF, scaleMm: 0.01 }, stl: true });
  }
  const reaches = m.p99 <= CAD_TOL && ser.p99 <= SERR_TOL && rawNM === 0 && q.pctBelow20 < 10;
  checkpoint({
    key, style: 'DragonScales', density, ref: refTag, tris: mesh.nF, ...extra,
    honestTrue3dP99Mm: +m.p99.toFixed(4), honestTrue3dMaxMm: +m.worst.toFixed(4), nAbove01: m.over01,
    lipP99Mm: +lipP99.toFixed(4), lipMaxMm: +lipMax.toFixed(4),
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx),
    serrationP99Mm: +ser.p99.toExponential(3), serrationMaxMm: +ser.max.toExponential(3),
    reaches001: m.p99 <= CAD_TOL, serrReaches: ser.p99 <= SERR_TOL, pass: reaches,
    ruler: 'BVH-closed-object', residualMechanism: m.p99 <= CAD_TOL ? 'lip green' : 'tread-lip near-vertical C0 riser (check density-invariance vs ref)',
  });
}

describe('PF-DSLIP-DragonScales', () => {
  it.skipIf(process.env.PF_DSLIP !== '1')('DragonScales tread-lip: doubled edge-pair + rung + fine ref → true-3D ≤0.01 or steep-EXCLUDE', () => {
    const style = 'DragonScales';
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const rings = dragonRings();
    const ringZs = rings.map(r => r.z);
    const t0 = Date.now();

    // COARSE ref (matches prior E-GAP-TREADSQ: nTheta 1920 / nZband 24) — reproduces the ~0.0136 ruler.
    // FINE ref (nTheta 3840 / nZband 48) — isolates the reference-discretization component of the lip residual.
    const buildRef = (nTheta: number, nZ: number, cell: number): ReturnType<typeof buildRefLocator> => {
      const ref = buildStepReference(rA, H, rings, { nTheta, nZperBand: nZ, zEps: 5e-4 });
      plog(`ref nTheta=${nTheta} nZ=${nZ} nF=${ref.nF} (${Date.now() - t0}ms)`);
      return buildRefLocator(ref, cell);
    };

    // 1) BASELINE reproduce (square treads, no lip refine) vs COARSE ref — confirm the ~0.0136 anchor.
    if (!keyExists('base_coarse')) {
      const loc = buildRef(1920, 24, 3.0);
      const rows = buildLipRows(rA, rings, 900, 24, { squareTread: true, lipRows: 0 });
      scoreDs('base_coarse', 'coarse-ref-screen', rA, rows, loc, 'coarse(1920/24)', { config: 'square-tread, no-lip-refine', nTh: 900, nZband: 24 }, false);
    }
    // 2) SAME baseline mesh vs FINE ref — does the residual drop? (ruler-floor test)
    if (!keyExists('base_fine')) {
      const loc = buildRef(3840, 48, 2.0);
      const rows = buildLipRows(rA, rings, 900, 24, { squareTread: true, lipRows: 0 });
      scoreDs('base_fine', 'fine-ref-screen', rA, rows, loc, 'fine(3840/48)', { config: 'square-tread, no-lip-refine', nTh: 900, nZband: 24 }, false);
    }
    // 3) LIP-REFINED @ screen density vs FINE ref (finer θ for serration ≤0.001, treadSub rungs, fine near-lip band).
    if (!keyExists('lip_screen')) {
      const loc = buildRef(3840, 48, 2.0);
      const rows = buildLipRows(rA, rings, 1800, 30, { squareTread: true, lipRows: 4, lipBandMm: 0.6 });
      scoreDs('lip_screen', 'screen', rA, rows, loc, 'fine(3840/48)', { config: 'lip-refined: nTh1800, lipRows4, treadSub square', nTh: 1800, nZband: 30, lipRows: 4 }, true);
    }
    // 4) LIP-REFINED @ HD density vs FINE ref (density-invariance test of the lip floor).
    if (!keyExists('lip_hd')) {
      const loc = buildRef(3840, 48, 2.0);
      const rows = buildLipRows(rA, rings, 2880, 40, { squareTread: true, lipRows: 6, lipBandMm: 0.6 });
      scoreDs('lip_hd', 'hd', rA, rows, loc, 'fine(3840/48)', { config: 'lip-refined HD: nTh2880, lipRows6, treadSub square', nTh: 2880, nZband: 40, lipRows: 6 }, false);
    }
    // 5) ADVERSARIAL: is the lip residual density-INVARIANT? treadSub-forced very fine rungs @ mid θ vs FINE ref.
    if (!keyExists('lip_treadfine')) {
      const loc = buildRef(3840, 48, 2.0);
      const rows = buildLipRows(rA, rings, 1800, 30, { fixedTreadSub: 12, lipRows: 4, lipBandMm: 0.6 });
      scoreDs('lip_treadfine', 'treadfine', rA, rows, loc, 'fine(3840/48)', { config: 'lip-refined: nTh1800, treadSub=12 forced, lipRows4', nTh: 1800, nZband: 30, treadSubForced: 12 }, false);
    }
    expect(true).toBe(true);
  }, 1_800_000);
});
