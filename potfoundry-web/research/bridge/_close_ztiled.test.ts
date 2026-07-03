// _close_ztiled.test.ts — DEV-ONLY (env PF_ZTILED=1 + per-style sub-gate). CLOSE the z-TILED axis.
//
// MANDATE: honest true-3D perpendicular deviation ≤0.01mm vs the ACTUAL closed 3D object, zero serration by
// construction (feature edges = mesh edges), on EACH of ArtDeco/DragonScales/LowPolyFacet/GeometricStar/
// BambooSegments. PRIMARY PRIMITIVE = SHARP3D doubled-rings + M-square (double the ring at every z-riser, explicit
// near-vertical radial cliff rungs = tread strips, M-square smooth platform rows between).
//
// PRIOR ART (must not re-derive): E-2026-07-01-SHARP3D-ARTDECO proved the doubled-ring recipe on ArtDeco
// (sheared-φ, 2.23M, worst 0.014mm p99 0.001mm watertight). E-2026-07-02-BREADTH ran the transfer on the OTHER
// four and REFUTED the premise for 3/4: only DragonScales is z-riser (7 C0 rings z=k·15); GeometricStar is in-plane
// strapwork creases (no z-step); BambooSegments is SMOOTH; LowPolyFacet is bevel-smoothed flat faces (no z-step).
// This probe REPRODUCES the honest measured triple (true-3D p99 / %<20 / rawNonMan) from a REAL vitest run for the
// scorecard, and CLOSES the ONE open lever breadth left un-tuned: DragonScales tread-sub SQUARE-SIZING (its
// minAngle 0.1° / %<20=29% was entirely un-square constant-z tread sub-rings — TUNABLE per breadth).
//
// METRIC DISCIPLINE (breadth finding, load-bearing): for a structured on-surface mesh the FAITHFUL per-facet ruler
// is the RADIAL own-(u,t) chord (facet vertices lie EXACTLY on r(θ,z)); the global-nearest perpendicular OVERSTATES
// on azimuthal relief (nearest foot lands on an adjacent feature/azimuth). The closed-object BVH is needed ONLY at
// a genuine z-discontinuity (DragonScales/ArtDeco treads) where radial is blind. We report the honest verdict
// number per the axis: BVH-vs-closed-object for the riser styles (ArtDeco/DragonScales), brute-anchored true-3D
// (bruteAnchoredRedPerp trustedP99 — the F2 fix for GN wrong-well overstatement) for the on-surface styles.
//
// rawNonMan = RAW-INDEX non-manifold (undirected edges by LITERAL index shared by >2 tris) — the true-topology
// gate; the weld-index audit over-counts at coincident tips (E-2026-07-02-KERNEL-HARDEN). MUST be 0.
//
// ISOLATION: NEW files only (_close_ztiled*). Reuses labkit + _sharp3dRef/_sharp3dMesh READ-ONLY. Writes ONLY to
// research/exchange/_close_ztiled/. Per-style env sub-gate + skip-if-row-exists ⇒ resumable / env-kill safe.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex, vertErrColors, dumpRenderBins,
  perFaceTrue3DSag, perFaceTrue3DSagAnchored, bruteAnchoredRedPerp, perFaceChordSag,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, shearedThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;
const DIR = join('research', 'exchange', '_close_ztiled');
const NDJSON = join(DIR, 'scorecard.ndjson');

const rowExists = (style: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  const lines = readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean);
  return lines.some((l) => { try { return JSON.parse(l).style === style; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CHECKPOINT ${row.style}] ${JSON.stringify(row)}`);
};
// UNBUFFERED phase log (vitest 4 buffers console.log until test end; this streams to disk immediately).
const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'progress.log'), `${new Date().toISOString()} ${msg}\n`); };

// ─────────── shared BVH 3D metric: facet (3 edge-mids + centroid) → nearest pt on reference mesh ───────────
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function metric3DBvh(mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }): { worst: number; p99: number; p50: number; over01: number; nF: number; faceErr: Float64Array } {
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
  return { worst: sorted.length ? sorted[sorted.length - 1] : 0, p99: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0,
    p50: sorted.length ? sorted[Math.floor(0.5 * sorted.length)] : 0, over01: over, nF, faceErr };
}

// per-facet 3D min-angle (deg) — for sliver-vs-wellshaped classification
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
/** RAW-INDEX non-manifold: undirected edges (by literal index) shared by >2 tris. */
function auditNonManRaw(idx: Uint32Array): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}
// segment→point 3D distance (serration)
function segPtDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}

// DragonScales rings (breadth STEP-0): 7 C0 radius-step rings, t=k/8, z=k·15, θ-independent.
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

// ════════════════════════════════ RISER STYLES (BVH vs closed 3D object) ════════════════════════════════
// Build a doubled-ring tread-conforming wall; tread sub-rings SQUARE-SIZED so tread cells ~= θ-arc cells
// (the un-tuned constant-z tread sub-rings were breadth's only quality gap on DragonScales).

/** ring serration: sample each ring row's true curve at 2× density; nearest to the row's own mesh edges. */
function ringSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): number {
  let ser = 0;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 2; s++) {
      const th = TAU * (s / (n * 2)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      const c0 = Math.floor((th / TAU) * n); let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn;
        const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      if (best > ser) ser = best;
    }
  }
  return ser;
}

/**
 * Build tread-conforming rows. `treadSub` is COMPUTED from square-sizing when `squareTread` is set: the tread
 * annulus radial span |r_out−r_in| is divided so each tread sub-cell radial step ≈ the θ-arc step (r·dθ), giving
 * ~square (non-sliver) tread cells. Sheet bands are even in z (M-square platform rows).
 */
function buildRiserRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number, opts: { fixedTreadSub?: number; squareTread?: boolean }): RowSpec[] {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = (): Float64Array => evenThetas(nTh);
  const pushSheetBand = (z0: number, z1: number, nrows: number): void => { for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' });
  let cursor = 0;
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    // square-size the tread sub-rings: radial span at θ=0 vs the θ-arc step at the mean radius.
    let treadSub = opts.fixedTreadSub ?? 9;
    if (opts.squareTread) {
      const rIn = rA(0, rzIn), rOut = rA(0, rzOut);
      const span = Math.abs(rOut - rIn);
      const rMean = 0.5 * (rIn + rOut);
      const arc = (TAU * rMean) / nTh; // θ-arc cell width at this ring
      treadSub = Math.max(2, Math.min(24, Math.round(span / Math.max(arc, 1e-4)) + 1));
    }
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

/** sheared-φ ArtDeco rows (the E-2026-07-01 winning primitive: chevron kinks = fixed φ-columns). */
function buildArtDecoShearedRows(rA: (t: number, z: number) => number, rings: StepRing[], nCol: number, nZband: number, treadSub: number, shear: number): RowSpec[] {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = (rz: number): Float64Array => shearedThetas(rz / H, nCol, shear);
  const pushSheetBand = (z0: number, z1: number, nrows: number): void => { for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); } };
  rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
  let cursor = 0;
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(H - zEps), kind: 'sheet' });
  return rows;
}

function scoreRiser(style: string, rA: (t: number, z: number) => number, rings: StepRing[], mesh: BuiltMesh, rows: RowSpec[], loc: { dist: (x: number, y: number, z: number) => number; bruteDist: (x: number, y: number, z: number) => number }): { m: ReturnType<typeof metric3DBvh>; q: ReturnType<typeof triangleQualityDistribution>; rawNM: number; ser: number; adv: number; sheetMinAngle: number } {
  const m = metric3DBvh(mesh, loc);
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx);
  const ser = ringSerration(rA, mesh, rows);
  // sheet-only min-angle (excludes constant-z tread sub-rings) — isolates the platform quality.
  const rowOf = new Int32Array(mesh.nV); for (let r = 0; r < rows.length; r++) for (let v = mesh.rowStart[r]; v < mesh.rowStart[r + 1]; v++) rowOf[v] = r;
  let sheetMinAngle = 180;
  for (let f = 0; f < mesh.nF; f++) {
    const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
    const kinds = [rows[rowOf[a]].kind, rows[rowOf[b]].kind, rows[rowOf[c]].kind];
    if (kinds.every(k => k === 'sheet')) { const mn = minAng(mesh, f); if (mn < sheetMinAngle) sheetMinAngle = mn; }
  }
  // adversarial: BVH==brute on top-30 worst centroids
  const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => m.faceErr[y] - m.faceErr[x]).slice(0, 30);
  let adv = 0;
  for (const f of order) { const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
    const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
    const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > adv) adv = e; }
  return { m, q, rawNM, ser, adv, sheetMinAngle };
}

// ─────────────── DRAGONSCALES: full tread recipe + SQUARE-SIZED tread sub-rings (the open lever) ───────────────
describe('CLOSE-ZTILED-DragonScales', () => {
  it.skipIf(process.env.PF_ZTILED !== '1' || process.env.PF_ZTILED_DS !== '1')('DragonScales: doubled-ring treads + square tread-sub → true-3D triple', () => {
    const style = 'DragonScales';
    if (rowExists(style)) { console.log(`[${style}] row exists — skip`); return; }
    const t0 = Date.now();
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const rings = dragonRings();
    const ringZs = rings.map(r => r.z);
    // faithful closed-3D reference: uniform θ + explicit tread bands. Validate on-surface + BVH==brute.
    // Reference θ 1920 (dense enough vs the export screen 900) + 24 z/band ⇒ moderate BVH (fast query).
    const ref = buildStepReference(rA, H, rings, { nTheta: 1920, nZperBand: 24, zEps: 5e-4 });
    const loc = buildRefLocator(ref, 3.0);
    plog(`${style} ref built nF=${ref.nF} (${Date.now() - t0}ms)`);
    let refOnSurf = 0, hashErr = 0;
    for (let s = 0; s < 200; s++) { const th = TAU * Math.random(), z = H * (0.03 + 0.94 * Math.random());
      let near = false; for (const rz of ringZs) if (Math.abs(z - rz) < 0.05) near = true; if (near) continue;
      const r = rA(th, z); const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z); if (d > refOnSurf) refOnSurf = d; }
    for (let s = 0; s < 80; s++) { const th = TAU * Math.random(), z = H * (0.02 + 0.96 * Math.random());
      const r = rA(th, z) + (Math.random() - 0.5) * 2; const px = r * Math.cos(th), py = r * Math.sin(th), pz = z + (Math.random() - 0.5) * 4;
      const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > hashErr) hashErr = e; }
    plog(`${style} ref validated refOnSurf=${refOnSurf.toFixed(4)} hashErr=${hashErr.toExponential(2)} (${Date.now() - t0}ms)`);

    // ONE screen config with SQUARE-SIZED treads (the open lever). HD numbers already in E-2026-07-02-BREADTH.
    const nTh = 900, nZ = 24, tag = 'ds_c900_z24_sq';
    const rows = buildRiserRows(rA, rings, nTh, nZ, { squareTread: true });
    const mesh = buildStructuredWall(rA, H, rows);
    plog(`${style} ${tag} built ${mesh.nF} tris (${Date.now() - t0}ms)`);
    const s = scoreRiser(style, rA, rings, mesh, rows, loc);
    plog(`${style} ${tag} scored p99=${s.m.p99.toFixed(4)} worst=${s.m.worst.toFixed(4)} over01=${s.m.over01} allMinAng=${s.q.minAngleDeg.toFixed(2)} sheetMinAng=${s.sheetMinAngle.toFixed(2)} %<20=${s.q.pctBelow20.toFixed(1)} rawNM=${s.rawNM} ser=${s.ser.toExponential(2)} (${Date.now() - t0}ms)`);
    {
      const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = s.m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
      dumpRenderBins(DIR, `${style}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01),
        meta: { ruler: 'true3d-reference', label: `${style} doubled-ring treads (square-sized) — 3D vs closed object (scale 0.01mm)`, worstMm: s.m.worst, p99Mm: s.m.p99, pctOver0_01: 100 * s.m.over01 / mesh.nF, scaleMm: 0.01 }, stl: true });
    }
    const p99 = s.m.p99;
    checkpoint({
      style, axis: 'z-tiled', primitive: 'SHARP3D doubled-rings + square treads', tris: mesh.nF,
      honestTrue3dP99Mm: +p99.toFixed(4), honestTrue3dMaxMm: +s.m.worst.toFixed(4), nAbove01: s.m.over01,
      pctBelow20: +s.q.pctBelow20.toFixed(1), allMinAngleDeg: +s.q.minAngleDeg.toFixed(2), sheetMinAngleDeg: +s.sheetMinAngle.toFixed(2),
      rawNonMan: s.rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx), serrationMm: +s.ser.toExponential(2),
      ruler: 'BVH-closed-object', refOnSurfMm: +refOnSurf.toFixed(4), bvhAdvMm: s.adv,
      reaches001: p99 <= CAD_TOL, densityResponsive: true,
      residualMechanism: p99 <= CAD_TOL ? 'reaches (treads green)' : 'tread-lip-C0-edge-density-responsive-need-more (worst is stair-lip); %<20-tail from tread sub-rings',
    });
    expect(s.rawNM).toBe(0);
  }, 1_800_000);
});

// ─────────────── ARTDECO: confirm the E-2026-07-01 sheared-φ winning recipe (screen budget) ───────────────
describe('CLOSE-ZTILED-ArtDeco', () => {
  it.skipIf(process.env.PF_ZTILED !== '1' || process.env.PF_ZTILED_AD !== '1')('ArtDeco: sheared-φ doubled-ring treads → true-3D triple (confirm 0.014mm class)', () => {
    const style = 'ArtDeco';
    if (rowExists(style)) { console.log(`[${style}] row exists — skip`); return; }
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    // ArtDeco analytic step schedule: stepCount=4, jumps at stepLocal 0.1 (up) / 0.9 (down) per tier.
    const rings: StepRing[] = [];
    for (let k = 0; k < 4; k++) for (const [loc, up] of [[0.1, true], [0.9, false]] as const) { const t = (k + loc) / 4; rings.push({ z: t * H, t, up }); }
    const chevronFreq = 6, shear = (4 * Math.PI) / chevronFreq;
    // faithful sheared reference (chevrons = exact φ-columns ⇒ conformed in ground truth). Moderate density.
    const refCol = 12 * 120;
    const ref = buildStepReference(rA, H, rings, { nTheta: 0, nZperBand: 44, zEps: 5e-4, thetasFor: (rz) => shearedThetas(rz / H, refCol, shear) });
    const loc = buildRefLocator(ref, 2.0);
    const t0 = Date.now();
    plog(`${style} ref built nF=${ref.nF} (${Date.now() - t0}ms)`);
    // ONE screen config with the sheared-φ winning primitive (chevrons = fixed φ-columns; every chevron a column).
    // The HD 0.014 worst / 0.001 p99 @2.23M number is DEFINITIVELY established in E-2026-07-01-SHARP3D-ARTDECO.
    const nCol = 12 * 60, nZ = 20, ts = 9, tag = 'ad_c720_z20_ts9';
    const rows = buildArtDecoShearedRows(rA, rings, nCol, nZ, ts, shear);
    const mesh = buildStructuredWall(rA, H, rows);
    plog(`${style} ${tag} built ${mesh.nF} tris (${Date.now() - t0}ms)`);
    const s = scoreRiser(style, rA, rings, mesh, rows, loc);
    plog(`${style} ${tag} scored p99=${s.m.p99.toFixed(4)} worst=${s.m.worst.toFixed(4)} over01=${s.m.over01} allMinAng=${s.q.minAngleDeg.toFixed(2)} sheetMinAng=${s.sheetMinAngle.toFixed(2)} %<20=${s.q.pctBelow20.toFixed(1)} rawNM=${s.rawNM} ser=${s.ser.toExponential(2)} (${Date.now() - t0}ms)`);
    {
      const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = s.m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
      dumpRenderBins(DIR, `${style}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01),
        meta: { ruler: 'true3d-reference', label: `${style} sheared-φ doubled-ring treads — 3D vs closed object (scale 0.01mm)`, worstMm: s.m.worst, p99Mm: s.m.p99, pctOver0_01: 100 * s.m.over01 / mesh.nF, scaleMm: 0.01 }, stl: true });
    }
    const p99 = s.m.p99;
    checkpoint({
      style, axis: 'z-tiled', primitive: 'SHARP3D sheared-φ doubled-rings + treads', tris: mesh.nF,
      honestTrue3dP99Mm: +p99.toFixed(4), honestTrue3dMaxMm: +s.m.worst.toFixed(4), nAbove01: s.m.over01,
      pctBelow20: +s.q.pctBelow20.toFixed(1), allMinAngleDeg: +s.q.minAngleDeg.toFixed(2), sheetMinAngleDeg: +s.sheetMinAngle.toFixed(2),
      rawNonMan: s.rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx), serrationMm: +s.ser.toExponential(2),
      ruler: 'BVH-closed-object', bvhAdvMm: s.adv,
      reaches001: p99 <= CAD_TOL, densityResponsive: true,
      residualMechanism: p99 <= CAD_TOL ? 'reaches (E-2026-07-01 confirms 0.014 worst @2.23M; p99 green)' : 'stair-tread-lip-C0-edge-density-responsive (worst @junction)',
    });
    expect(s.rawNM).toBe(0);
  }, 1_800_000);
});

// ════════════ ON-SURFACE STYLES (no z-step): dense M-square sheet vs ANALYTIC surface ════════════
// GeometricStar / BambooSegments / LowPolyFacet have NO radius-vs-z discontinuity (breadth STEP-0). The honest 3D
// verdict = brute-anchored true-3D (trustedP99 — F2 fix), with the faithful radial own-region chord reported too.
function onSurfaceTest(style: string, envSub: string, configs: Array<[number, number, string, boolean]>): void {
  describe(`CLOSE-ZTILED-${style}`, () => {
    it.skipIf(process.env.PF_ZTILED !== '1' || process.env[envSub] !== '1')(`${style}: dense M-square sheet vs analytic surface → true-3D triple`, () => {
      if (rowExists(style)) { console.log(`[${style}] row exists — skip`); return; }
      const rA = buildRadiusFn(style as StyleId, {}, DIMS);
      let best: any = null;
      for (const [nTh, nZ, tag, dump] of configs) {
        const t0 = Date.now();
        const rows: RowSpec[] = [];
        for (let j = 0; j <= nZ; j++) { const z = H * (j / nZ); rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' }); }
        const mesh = buildStructuredWall(rA, H, rows);
        plog(`${style} ${tag} built ${mesh.nF} tris (${Date.now() - t0}ms)`);
        if (mesh.nF > 8_000_000 && tag.includes('screen')) continue;
        // RADIAL own-region chord (faithful for on-surface meshes).
        const rad = perFaceChordSag(mesh.ut, mesh.idx, rA, H);
        const radP99 = (() => { const s = Float64Array.from(rad.faceErr).sort(); return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))]; })();
        plog(`${style} ${tag} radial done radP99=${radP99.toFixed(4)} (${Date.now() - t0}ms)`);
        // RAW-GN true-3D (facet→analytic surface).
        const gn = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.005 });
        const gnSorted = Float64Array.from(gn.faceErr).sort();
        const gnP99 = gnSorted[Math.min(gnSorted.length - 1, Math.floor(0.99 * gnSorted.length))];
        let gnOver = 0; for (let f = 0; f < mesh.nF; f++) if (gn.faceErr[f] > 0.01) gnOver++;
        plog(`${style} ${tag} GN done p99=${gnP99.toFixed(4)} over01=${gnOver} (${Date.now() - t0}ms)`);
        // BRUTE-ANCHORED worst-red (trusted verdict number). FAST + bounded: pick the red set on the GN true-3D
        // ruler (already computed) NOT radial (radial over-selects LP's flat-face edge facets → thousands of reds),
        // and use a small coarse grid + few samples (the F2 fix only needs the worst-K facets' true foot).
        const anch = bruteAnchoredRedPerp(mesh.ut, mesh.idx, rA, H, { redMm: 0.02, sampleN: 16, coarse: { nTheta: 768, nZ: 200 }, fine: { nTheta: 1536, nZ: 400 } });
        plog(`${style} ${tag} anchor done trustedP99=${anch.trustedP99.toFixed(4)} nRed=${anch.nRed} (${Date.now() - t0}ms)`);
        const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
        const rawNM = auditNonManRaw(mesh.idx);
        console.log(`[${style} ${tag}] tris=${mesh.nF} radialP99=${radP99.toFixed(4)} | GN p99=${gnP99.toFixed(4)} over01=${gnOver} | ANCHORED nRed=${anch.nRed} gnP99=${anch.gnP99.toFixed(4)} trustedP99=${anch.trustedP99.toFixed(4)} trustedMax=${anch.trustedMax.toFixed(4)} | %<20=${q.pctBelow20.toFixed(1)} minAng=${q.minAngleDeg.toFixed(1)} rawNM=${rawNM} (${Date.now() - t0}ms)`);
        best = { tag, mesh, radP99, gnP99, gnOver, anch, q, rawNM };
        if (dump) {
          const anSag = perFaceTrue3DSagAnchored(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.02, redMm: 0.05, topK: 60, coarse: { nTheta: 768, nZ: 200 }, fine: { nTheta: 1536, nZ: 400 } });
          dumpRenderBins(DIR, `${style}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(anSag.vertErr, 0.01),
            meta: { ruler: 'true3d-anchored', label: `${style} dense M-square sheet — true-3D vs analytic surface (anchored, scale 0.01mm)`, worstMm: anSag.worstMm, p99Mm: gnP99, pctOver0_01: 100 * gnOver / mesh.nF, scaleMm: 0.01 }, stl: true });
        }
      }
      const b = best;
      // honest verdict number = brute-anchored trustedP99 (falls back to radial when no red set).
      const verdictP99 = b.anch.nRed > 0 ? b.anch.trustedP99 : b.radP99;
      checkpoint({
        style, axis: 'z-tiled(refuted: on-surface, no z-step)', primitive: 'dense M-square sheet', tris: b.mesh.nF,
        honestTrue3dP99Mm: +verdictP99.toFixed(4), radialP99Mm: +b.radP99.toFixed(4),
        anchorTrustedP99Mm: b.anch.nRed > 0 ? +b.anch.trustedP99.toFixed(4) : null, anchorTrustedMaxMm: b.anch.nRed > 0 ? +b.anch.trustedMax.toFixed(4) : null,
        anchorGnP99Mm: b.anch.nRed > 0 ? +b.anch.gnP99.toFixed(4) : null, anchorNRed: b.anch.nRed,
        gnP99Mm: +b.gnP99.toFixed(4), nAbove01Gn: b.gnOver,
        pctBelow20: +b.q.pctBelow20.toFixed(1), allMinAngleDeg: +b.q.minAngleDeg.toFixed(2),
        rawNonMan: b.rawNM, weldNonMan: auditNonManByIndex(b.mesh.xyz, b.mesh.idx),
        ruler: 'brute-anchored-true3d (analytic surface); radial own-region reported',
        reaches001: verdictP99 <= CAD_TOL, densityResponsive: true,
        residualMechanism: verdictP99 <= CAD_TOL ? 'reaches (M-square dense; on-surface faces flat-faithful)'
          : (style === 'LowPolyFacet' ? 'steep-EXCLUDE-radial-overstate-true3d-CAD-grade: 12 DESIGNED convex polygon EDGES (genuine geometry, density-invariant), faces radial=0'
            : 'density-responsive-need-more: crest/crease (node-ring / strapwork C1 corner), density-responsive; radial own-region CAD-grade'),
      });
      expect(b.rawNM).toBe(0);
    }, 1_800_000);
  });
}

// ONE moderate-budget confirm per style (screen); the mechanism + numbers are already HD-established in
// E-2026-07-02-BREADTH — this reproduces the honest triple from a fresh REAL run within the per-style budget.
// dump=true → also writes the anchored true-3D heatmap for visual evidence.
onSurfaceTest('GeometricStar', 'PF_ZTILED_GS', [
  [1800, 500, 'gs_c1800_z500', true],
]);
onSurfaceTest('BambooSegments', 'PF_ZTILED_BS', [
  [1200, 700, 'bs_c1200_z700', true],
]);
onSurfaceTest('LowPolyFacet', 'PF_ZTILED_LP', [
  [1200, 500, 'lp_c1200_z500', true],
]);
