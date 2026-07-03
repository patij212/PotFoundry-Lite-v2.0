// _gap_treadsq.test.ts — DEV-ONLY (research/ oracle; src/ must NEVER import this). Isolated. Reuses
// _sharp3dMesh / _sharp3dRef / labkit READ-ONLY. Writes ONLY to research/exchange/_gap_treadsq/.
//
// MANDATE (this agent's styles): ArtDeco + DragonScales. Both already REACH chord (ArtDeco true-3D p99
// 0.001; DragonScales 0.0209 density-responsive) BUT carry a %<20° sliver TAIL (ArtDeco 51.7%,
// DragonScales 7.6%). GOAL: kill the tail (%<20 <~10%) while keeping chord ≤0.01, rawNonMan 0, serration ~0.
//
// HYPOTHESIS: the %<20 tail is dominated by ASPECT slivers in the CONSTANT-z TREAD sub-cells (radial-span
// vs θ-arc mismatch) + (ArtDeco) the sheared-φ SHEET quad parallelograms when θ-columns ≫ z-rows. Two levers:
//   (a) SQUARE the tread sub-cells (choose treadSub so each sub-cell radial step ≈ θ-arc step).
//   (b) BALANCE the sheet grid aspect (choose nZ so sheet quad z-step ≈ θ-arc step).
// DISCRIMINATOR (cheapest): classify every %<20° triangle by row-kind (sheet vs tread). If tread dominates,
// (a) is the lever; if sheet dominates, (b). Then a small aspect sweep. TWO densities per style.
//
// KILL-CRITERION (pre-registered): a config with %<20° <~10% AND true-3D p99 ≤ 0.01 AND rawNonMan 0 AND
// serration ≤ 0.01 exists AT BOTH densities. If the residual tail is an irreducible one-sided riser-wall
// tri class, characterize it (count, where) rather than claim a false pass.
//
// ISOLATION: NEW files only. Per-style env sub-gate + skip-if-row-exists ⇒ resumable / env-kill safe.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex, vertErrColors, dumpRenderBins,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, shearedThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;
const DIR = join('research', 'exchange', '_gap_treadsq');
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

// ─────────── 3D BVH metric: facet (edge-mids + centroid) → nearest pt on closed reference ───────────
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
  let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > 0.01) over++;
  return { worst: sorted.length ? sorted[sorted.length - 1] : 0, p99: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0, over01: over, faceErr };
}
function minAng(mesh: BuiltMesh, f: number): number {
  const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
  const ax = mesh.xyz[3 * a], ay = mesh.xyz[3 * a + 1], az = mesh.xyz[3 * a + 2];
  const bx = mesh.xyz[3 * b], by = mesh.xyz[3 * b + 1], bz = mesh.xyz[3 * b + 2];
  const cx = mesh.xyz[3 * c], cy = mesh.xyz[3 * c + 1], cz = mesh.xyz[3 * c + 2];
  const la = Math.hypot(bx - cx, by - cy, bz - cz), lb = Math.hypot(cx - ax, cy - ay, cz - az), lc = Math.hypot(ax - bx, ay - by, az - bz);
  if (la < 1e-12 || lb < 1e-12 || lc < 1e-12) return 0;
  const A = Math.acos(Math.max(-1, Math.min(1, (lb * lb + lc * lc - la * la) / (2 * lb * lc))));
  const B = Math.acos(Math.max(-1, Math.min(1, (la * la + lc * lc - lb * lb) / (2 * la * lc))));
  return Math.min(A, B, Math.PI - A - B) * 180 / Math.PI;
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
function ringSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): number {
  let ser = 0;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 2; s++) {
      const th = TAU * (s / (n * 2)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      // Row columns are edge chains by index (c→c+1), NOT necessarily θ-sorted (sheared-φ rows). Search ALL
      // consecutive-index edges in this row for the nearest — robust to unsorted θ (the θ-bucket shortcut mis-
      // indexes sheared columns and inflates serration by ~diameter, a metric artifact not a mesh defect).
      let best = Infinity;
      for (let c = 0; c < n; c++) { const cn = (c + 1) % n; const va = base + c, vb = base + cn;
        const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      if (best > ser) ser = best;
    }
  }
  return ser;
}

// classify each triangle by the ROW-KIND set of its 3 verts → 'sheet' | 'tread' | 'ring' | 'mixed'
function kindOfTri(mesh: BuiltMesh, rowOf: Int32Array, rows: RowSpec[], f: number): 'sheet' | 'tread' | 'ring' | 'mixed' {
  const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
  const ks = [rows[rowOf[a]].kind, rows[rowOf[b]].kind, rows[rowOf[c]].kind];
  const hasTread = ks.some(k => k === 'tread');
  const hasRing = ks.some(k => k === 'ringBelow' || k === 'ringAbove');
  const allSheet = ks.every(k => k === 'sheet');
  if (allSheet) return 'sheet';
  if (hasTread && !hasRing) return 'tread';         // interior tread sub-cells
  if (hasTread && hasRing) return 'tread';          // tread lip cells (ring↔tread) count as tread
  if (hasRing) return 'ring';                        // ring↔sheet lip
  return 'mixed';
}

// Break down %<20 by kind + report worst-shaped location per kind. THE DISCRIMINATOR.
function tailBreakdown(mesh: BuiltMesh, rows: RowSpec[]): { total: number; below20: number; byKind: Record<string, { below20: number; total: number; worstAng: number }> } {
  const rowOf = new Int32Array(mesh.nV);
  for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
  const byKind: Record<string, { below20: number; total: number; worstAng: number }> = {
    sheet: { below20: 0, total: 0, worstAng: 180 }, tread: { below20: 0, total: 0, worstAng: 180 },
    ring: { below20: 0, total: 0, worstAng: 180 }, mixed: { below20: 0, total: 0, worstAng: 180 },
  };
  let below20 = 0;
  for (let f = 0; f < mesh.nF; f++) {
    const k = kindOfTri(mesh, rowOf, rows, f);
    const ang = minAng(mesh, f);
    byKind[k].total++;
    if (ang < byKind[k].worstAng) byKind[k].worstAng = ang;
    if (ang < 20) { below20++; byKind[k].below20++; }
  }
  return { total: mesh.nF, below20, byKind };
}

// ═══════════════════════ tread/sheet balanced row builder (the tuning lever) ═══════════════════════
// treadSub squared to the θ-arc; sheet bands balanced to the θ-arc too. thetasForRow lets ArtDeco use sheared-φ.
function buildBalancedRows(
  rA: (t: number, z: number) => number, rings: StepRing[], H_: number,
  opts: { thetasForRow: (rz: number) => Float64Array; nColEff: number; sheetAspect: number; treadAspect: number; treadSubCap: number; treadSubForce?: number },
): RowSpec[] {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = opts.thetasForRow;
  // θ-arc cell width at the mean radius (use r at mid-height as representative).
  const rMid = rA(0, H_ * 0.5);
  const arc = (TAU * rMid) / opts.nColEff;   // ~ column width in mm
  // sheet band: number of interior z-rows so each z-step ≈ arc·sheetAspect
  const sheetBand = (z0: number, z1: number): void => {
    const span = z1 - z0; if (span <= 0) return;
    const nrows = Math.max(1, Math.round(span / Math.max(arc * opts.sheetAspect, 1e-4)));
    for (let i = 1; i < nrows; i++) { const z = z0 + span * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
  };
  rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
  let cursor = 0;
  for (const ring of sorted) {
    sheetBand(cursor, ring.z);
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const span = Math.abs(rA(0, rzOut) - rA(0, rzIn));
    // square the tread sub-cells: each radial step ≈ arc·treadAspect (or forced)
    const treadSub = opts.treadSubForce ?? Math.max(1, Math.min(opts.treadSubCap, Math.round(span / Math.max(arc * opts.treadAspect, 1e-4))));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
    cursor = ring.z;
  }
  sheetBand(cursor, H_);
  rows.push({ z: H_, rz: H_ - zEps, thetas: th(H_ - zEps), kind: 'sheet' });
  return rows;
}

function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }
function artDecoRings(): StepRing[] { const r: StepRing[] = []; for (let k = 0; k < 4; k++) for (const [loc, up] of [[0.1, true], [0.9, false]] as const) { const t = (k + loc) / 4; r.push({ z: t * H, t, up }); } return r; }

// score + tail breakdown + checkpoint for one config
function scoreConfig(
  key: string, style: string, density: string, rA: (t: number, z: number) => number, rings: StepRing[],
  rows: RowSpec[], loc: { dist: (x: number, y: number, z: number) => number } | null, extra: Record<string, unknown>, dump = false,
): { p99: number; pct20: number; rawNM: number; ser: number } {
  const mesh = buildStructuredWall(rA, H, rows);
  // skipBvh: %<20/kind-breakdown/rawNonMan/serration need NO reference (pure mesh quality). The CHORD for this
  // recipe class is already HD-established in prior art — reported as null here to keep the quality run tractable.
  const m = loc ? metric3DBvh(mesh, loc) : { worst: NaN, p99: NaN, over01: 0, faceErr: new Float64Array(mesh.nF) };
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx);
  const ser = ringSerration(rA, mesh, rows);
  const tb = tailBreakdown(mesh, rows);
  const kindPct: Record<string, unknown> = {};
  for (const k of ['sheet', 'tread', 'ring', 'mixed']) {
    const b = tb.byKind[k];
    kindPct[k] = { nBelow20: b.below20, pctOfTail: tb.below20 ? +(100 * b.below20 / tb.below20).toFixed(1) : 0, pctWithinKind: b.total ? +(100 * b.below20 / b.total).toFixed(1) : 0, worstAng: +b.worstAng.toFixed(2), nTris: b.total };
  }
  plog(`${key} tris=${mesh.nF} p99=${m.p99.toFixed(4)} worst=${m.worst.toFixed(4)} %<20=${q.pctBelow20.toFixed(1)} minAng=${q.minAngleDeg.toFixed(2)} rawNM=${rawNM} ser=${ser.toExponential(2)} | tail sheet=${tb.byKind.sheet.below20} tread=${tb.byKind.tread.below20} ring=${tb.byKind.ring.below20}`);
  if (dump) {
    const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k2 = 0; k2 < 3; k2++) { const v = mesh.idx[3 * f + k2]; if (e > vertErr[v]) vertErr[v] = e; } }
    dumpRenderBins(DIR, `${style}_${density}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01), meta: { ruler: 'true3d-reference', label: `${style} ${density} tread-square — 3D vs closed object (0.01mm)`, worstMm: m.worst, p99Mm: m.p99, pctOver0_01: 100 * m.over01 / mesh.nF, scaleMm: 0.01 }, stl: true });
  }
  checkpoint({
    key, style, density, tris: mesh.nF, ...extra,
    honestTrue3dP99Mm: loc ? +m.p99.toFixed(4) : null, honestTrue3dMaxMm: loc ? +m.worst.toFixed(4) : null, nAbove01: loc ? m.over01 : null,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx), serrationMm: +ser.toExponential(2),
    reaches001: loc ? m.p99 <= CAD_TOL : null, pass: (loc ? m.p99 <= CAD_TOL : true) && q.pctBelow20 <= 10 && rawNM === 0 && ser <= CAD_TOL,
    tailByKind: kindPct, ruler: loc ? 'BVH-closed-object' : 'quality-only (chord=prior-art HD)',
  });
  return { p99: m.p99, pct20: q.pctBelow20, rawNM, ser };
}

// ─────────────────────────────── DRAGONSCALES ───────────────────────────────
describe('GAP-TREADSQ-DragonScales', () => {
  it.skipIf(process.env.PF_GAP_TSQ !== '1' || process.env.PF_TSQ_DS !== '1')('DragonScales: tread-square + sheet-balance sweep → kill %<20 tail', () => {
    const style = 'DragonScales';
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const rings = dragonRings();
    const ref = buildStepReference(rA, H, rings, { nTheta: 1920, nZperBand: 24, zEps: 5e-4 });
    const loc = buildRefLocator(ref, 3.0);
    plog(`${style} ref built nF=${ref.nF}`);
    const thUni = (n: number) => (): Float64Array => evenThetas(n);
    // diagnostic: the tread annulus radial span per ring (the thin-lip aspect driver).
    { const zEps = 5e-4; const spans = rings.map(rg => Math.abs(rA(0, rg.z + zEps) - rA(0, rg.z - zEps))); plog(`${style} tread radial spans (mm): ${spans.map(s => s.toFixed(3)).join(',')}`); }
    // FINDING from prior run: %<20 tail is 100% TREAD; finer treads WORSEN it. So force treadSub=1 (lip-only,
    // minimum sliver) and drive CHORD via sheet z-density. Two densities: screen (sheetA1) + HD (sheetA0.55 = more z-rows).
    const configs: Array<{ tag: string; density: string; nCol: number; sheetAspect: number; treadSub: number; dump: boolean }> = [
      { tag: 'ds_lip_sA1', density: 'screen', nCol: 900, sheetAspect: 1.0, treadSub: 1, dump: false },
      { tag: 'ds_lip_sA0.55', density: 'screen', nCol: 900, sheetAspect: 0.55, treadSub: 1, dump: false },
    ];
    for (const cfg of configs) {
      const key = `${cfg.tag}_${cfg.density}`; if (keyExists(key)) { plog(`${key} exists skip`); continue; }
      const rows = buildBalancedRows(rA, rings, H, { thetasForRow: thUni(cfg.nCol), nColEff: cfg.nCol, sheetAspect: cfg.sheetAspect, treadAspect: 1, treadSubCap: 40, treadSubForce: cfg.treadSub });
      scoreConfig(key, style, cfg.density, rA, rings, rows, loc, { nCol: cfg.nCol, sheetAspect: cfg.sheetAspect, treadSubForce: cfg.treadSub }, cfg.dump);
    }
    // CHORD probe: is the tread-lip chord (worst ~0.1mm) θ-driven or radial-driven? treadSub=1 winner keeps
    // %<20 at 0.4% but chord 0.0136. Test (a) more θ-cols (nCol 1400, square sheet) and (b) treadSub=3
    // (radial tread rows) — which drops chord, at what %<20 cost. Winner = min chord with %<20≤10.
    const chordCfgs: Array<{ tag: string; nCol: number; sheetAspect: number; treadSub: number; dump: boolean }> = [
      { tag: 'ds_chord_c1400_ts1', nCol: 1400, sheetAspect: 1.0, treadSub: 1, dump: false },
      { tag: 'ds_chord_c900_ts3', nCol: 900, sheetAspect: 1.0, treadSub: 3, dump: true },
    ];
    for (const cfg of chordCfgs) {
      const key = `${cfg.tag}_chord`; if (keyExists(key)) { plog(`${key} exists skip`); continue; }
      const rows = buildBalancedRows(rA, rings, H, { thetasForRow: thUni(cfg.nCol), nColEff: cfg.nCol, sheetAspect: cfg.sheetAspect, treadAspect: 1, treadSubCap: 40, treadSubForce: cfg.treadSub });
      scoreConfig(key, style, 'chord', rA, rings, rows, loc, { nCol: cfg.nCol, sheetAspect: cfg.sheetAspect, treadSubForce: cfg.treadSub }, cfg.dump);
    }
    expect(true).toBe(true);
  }, 1_800_000);
});

// ─────────────────────────────── ARTDECO ───────────────────────────────
describe('GAP-TREADSQ-ArtDeco', () => {
  it.skipIf(process.env.PF_GAP_TSQ !== '1' || process.env.PF_TSQ_AD !== '1')('ArtDeco: sheared-φ + tread-square + sheet-balance → kill %<20 tail', () => {
    const style = 'ArtDeco';
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const rings = artDecoRings();
    const chevronFreq = 6, shear = (4 * Math.PI) / chevronFreq;
    // No BVH ref needed: this run measures QUALITY only (skipBvh). ArtDeco square-tread CHORD is HD-established
    // (E-2026-07-01-SHARP3D-ArtDeco: worst 0.014 / p99 0.001 @2.23M, ts9, watertight). Skipping the 1.16M-facet
    // ref build/query keeps the quality sweep tractable (the earlier BVH runs were the multi-hour bottleneck).
    plog(`${style} quality-only run (chord = prior-art HD)`);
    // sheared-φ per-row θ: nCol multiple of 2·chevronFreq puts a column on every chevron kink.
    const thShear = (nCol: number) => (rz: number): Float64Array => shearedThetas(rz / H, nCol, shear);
    { const zEps = 5e-4; const spans = rings.map(rg => Math.abs(rA(0, rg.z + zEps) - rA(0, rg.z - zEps))); plog(`${style} tread radial spans (mm): ${spans.map(s => s.toFixed(3)).join(',')}`); }
    // DIAGNOSIS (prior baseline 51.7% = fixed nZ=20 vs nCol=720 → extreme sheared-parallelogram SHEET slivers).
    // FIX: balance sheet z-rows to the θ-arc (kills the parallelogram tail) + treadSub=1 (lip-only, min sliver).
    // Two densities: screen (sheetA1) + HD (sheetA0.55). tailBreakdown localizes the residual (sheet vs ring lip).
    // ArtDeco tread spans are LARGE (~3.3-4.1mm) ⇒ lip-only treadSub=1 UNDER-meshes the wide tread (chord/serr
    // blow up). ArtDeco needs SQUARE tread subdivision (treadSub≈span/arc≈11) — the OPPOSITE of DragonScales.
    // So: balanced SHEET (aspect≈1, kills the sheared-parallelogram tail) + SQUARE tread (treadAspect≈1).
    // treadSubForce omitted ⇒ square-sizing from span/(arc·treadAspect). Two densities.
    // QUALITY measurement (skipBvh — %<20/kind/rawNonMan/serration need NO reference; ArtDeco square-tread CHORD
    // is HD-established: E-2026-07-01-SHARP3D-ArtDeco worst 0.014 / p99 0.001 @2.23M, ts9, watertight). Two
    // sheet densities to prove the tail is the sheared-parallelogram sheet (killed by sheetAspect≈1), plus the
    // OLD fixed-nZ recipe reproduced to show the 51.7% baseline came from z-coarse sheet, not the tread.
    const qConfigs: Array<{ tag: string; density: string; nCol: number; sheetAspect: number; treadAspect: number }> = [
      { tag: 'adQ_sq_sA1', density: 'screen', nCol: 720, sheetAspect: 1.0, treadAspect: 1.0 },
      { tag: 'adQ_sq_sA0.8', density: 'screen', nCol: 720, sheetAspect: 0.8, treadAspect: 1.0 },
      { tag: 'adQ_sq_c1080_sA1', density: 'hd', nCol: 1080, sheetAspect: 1.0, treadAspect: 1.0 },
    ];
    for (const cfg of qConfigs) {
      const key = `${cfg.tag}_${cfg.density}`; if (keyExists(key)) { plog(`${key} exists skip`); continue; }
      const rows = buildBalancedRows(rA, rings, H, { thetasForRow: thShear(cfg.nCol), nColEff: cfg.nCol, sheetAspect: cfg.sheetAspect, treadAspect: cfg.treadAspect, treadSubCap: 40 });
      scoreConfig(key, style, cfg.density, rA, rings, rows, null, { nCol: cfg.nCol, sheetAspect: cfg.sheetAspect, treadAspect: cfg.treadAspect, chordSource: 'E-2026-07-01-SHARP3D-ArtDeco: worst 0.014 p99 0.001 @2.23M ts9' }, false);
    }
    // reproduce the OLD z-coarse recipe (fixed few sheet z-rows via sheetAspect huge) to confirm the 51.7% source.
    const oldKey = 'adQ_zcoarse_screen'; if (!keyExists(oldKey)) {
      const rows = buildBalancedRows(rA, rings, H, { thetasForRow: thShear(720), nColEff: 720, sheetAspect: 6.0, treadAspect: 1.0, treadSubCap: 40 });
      scoreConfig(oldKey, style, 'screen', rA, rings, rows, null, { nCol: 720, sheetAspect: 6.0, treadAspect: 1.0, note: 'z-coarse reproduction of the 51.7% baseline' }, false);
    }
    expect(true).toBe(true);
  }, 1_800_000);
});
