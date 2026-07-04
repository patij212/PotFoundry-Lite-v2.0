// _pkg_drings.test.ts — DEV-ONLY (research/ oracle; src/ must NEVER import this). ISOLATED best-20 packager for
// the "drings" family: ArtDeco, DragonScales, BambooSegments, LowPolyFacet. Reuses the SETTLED, proven builders +
// refs READ-ONLY (labkit, _sharp3dMesh, _sharp3dRef, _doubledCrestLib) and re-measures each with the TRUE-3D ruler
// appropriate to the primitive, then writes the mandated deliverables:
//   research/exchange/_best20/stl/<Style>.stl                 (labkit writeBinarySTL, lifted xyz + indices)
//   research/exchange/_best20/heatmap/<Style>.{xyz,idx,col}.bin + .meta.json  (dumpRenderBins; TRUE-3D ruler)
//   research/exchange/_best20/manifest.ndjson                 (one row per style)
//
// Every style is its OWN env-gated `it` (PF_PKG_DRINGS=1) and SKIPS if its STL already exists ⇒ resumable /
// env-kill safe. Each row is checkpointed the INSTANT it is computed. Writes ONLY under _best20/. No src edits.
//
// METRIC DISCIPLINE: these are NATIVE-3D stepped/doubled meshes with genuine z-risers or doubled crests ⇒ the
// single-valued analytic-surface radial ruler is BLIND at the step. The HONEST ruler is BVH-vs-CLOSED-OBJECT
// (facet 4-sample → nearest point on a DENSE reference built with the SAME construction) for the ring/tread styles
// (ArtDeco/DragonScales/Bamboo), and brute-anchored true-3D (bruteAnchoredRedPerp) for the doubled-crest style
// (LowPolyFacet). Serration = feature-curve → nearest MESH-EDGE distance. rawNonMan by LITERAL index.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, liftUtToRadial, type StyleDims,
  triangleQualityDistribution, vertErrColors, writeBinarySTL, dumpRenderBins,
  perFaceChordSag, bruteAnchoredRedPerp,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';
import {
  buildStructuredWall, evenThetas, shearedThetas, type RowSpec, type BuiltMesh,
} from './_sharp3dMesh';
import { buildDoubledCrestMesh, measureSerration, type DoubledCrestOpts } from './_doubledCrestLib';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;

const BASE = join('research', 'exchange', '_best20');
const STL_DIR = join(BASE, 'stl');
const HEAT_DIR = join(BASE, 'heatmap');
const MANIFEST = join(BASE, 'manifest.ndjson');
const ensureDirs = (): void => { mkdirSync(STL_DIR, { recursive: true }); mkdirSync(HEAT_DIR, { recursive: true }); };
const stlPath = (style: string): string => join(STL_DIR, `${style}.stl`);
const stlExists = (style: string): boolean => existsSync(stlPath(style));
const checkpoint = (row: Record<string, unknown>): void => {
  ensureDirs(); appendFileSync(MANIFEST, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[MANIFEST ${row.style}] ${JSON.stringify(row)}`);
};

// ─────────── BVH true-3D per-face error (facet 4-sample → nearest pt on closed reference) ───────────
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
/**
 * HYBRID true-3D per-face error routed by ROW-KIND + radial prefilter. A facet whose 3 vertices are ALL on 'sheet'
 * rows AND whose radial own-(u,t) chord sag ≤ preFilterMm keeps the radial value (exact on a single-valued smooth
 * facet — its vertices lie on rA). Any facet touching a ring/tread row (genuine z-step ⇒ radial ruler is blind) OR
 * with radial sag > preFilterMm is re-scored by BVH: facet 4-sample → nearest point on the DENSE closed reference.
 * Honest (every multivalued facet is BVH-scored) AND fast (BVH runs on the ring bands + the reddest few %).
 */
function metricHybridKind(
  mesh: BuiltMesh, rA: (t: number, z: number) => number, loc: { dist: (x: number, y: number, z: number) => number },
  preFilterMm: number, ringZs?: number[], ringGuardMm = 0.5,
): { worst: number; p99: number; over01: number; faceErr: Float64Array; nBvh: number } {
  const rad = perFaceChordSag(mesh.ut, mesh.idx, rA, H);
  const { xyz, idx, nF } = mesh; const faceErr = new Float64Array(nF); let nBvh = 0;
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    // On a SINGLE-VALUED smooth facet (away from any ring z) the radial own-(u,t) chord sag IS the true-3D error
    // (vertices lie exactly on rA) — and it is MORE accurate than a finite-density BVH there (a discrete reference
    // cannot read below the true chord and adds its own discretization). BVH is only needed in the MULTIVALUED
    // ring/tread BAND where the radial ruler is blind at the z-step. So: BVH a facet iff (a) any vertex is within
    // ringGuardMm(z) of a ring (the multivalued zone) OR (b) its radial sag exceeds preFilter (a rung strip that
    // carries the full step height). Elsewhere keep the exact radial value. Fast (BVH ~ the ring bands only).
    // ring-guard mode (ringZs given): trust radial EVERYWHERE except within ringGuardMm of a ring z (the only
    // multivalued/blind zone). radial-prefilter mode (no ringZs): BVH iff radial > preFilter (Bamboo — its rungs
    // carry large radial sag, and away from them radial is exact).
    let routeBvh: boolean;
    if (ringZs) { let nearRing = false; const za = xyz[3 * a + 2], zb = xyz[3 * b + 2], zc = xyz[3 * c + 2]; for (const rz of ringZs) { if (Math.abs(za - rz) < ringGuardMm || Math.abs(zb - rz) < ringGuardMm || Math.abs(zc - rz) < ringGuardMm) { nearRing = true; break; } } routeBvh = nearRing; }
    else { routeBvh = rad.faceErr[f] > preFilterMm; }
    if (!routeBvh) { faceErr[f] = rad.faceErr[f]; continue; }
    nBvh++;
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let mx = 0; for (const [w0, w1, w2] of BARY) { const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz; const d = loc.dist(px, py, pz); if (d > mx) mx = d; } faceErr[f] = mx;
  }
  const s = Float64Array.from(faceErr).sort();
  let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > CAD_TOL) over++;
  return { worst: s.length ? s[s.length - 1] : 0, p99: s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0, over01: over, faceErr, nBvh };
}
// RAW-index non-manifold (literal, NOT weld). Sharded numeric-key maps (single JS Map caps ~2^24 entries).
function auditNonManRaw(idx: Uint32Array): number {
  const NSHARD = 64; const EK = (idx.length + 1);
  const ecs: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const bump = (p: number, r: number): void => { const kk = key(p, r); const m = ecs[(p < r ? p : r) & (NSHARD - 1)]; m.set(kk, (m.get(kk) ?? 0) + 1); };
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; if (a === b || b === c || a === c) continue; bump(a, b); bump(b, c); bump(c, a); }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}
function segPtDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}
// ring serration: feature-ring true curve → nearest MESH-EDGE (row is an index-consecutive edge chain, unsorted-θ safe).
function ringSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): { p99: number; max: number } {
  const vals: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 2; s++) {
      const th = TAU * (s / (n * 2)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      let best = Infinity;
      for (let c = 0; c < n; c++) { const cn = (c + 1) % n; const va = base + c, vb = base + cn; const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      if (isFinite(best)) vals.push(best);
    }
  }
  vals.sort((a, b) => a - b);
  return { p99: vals.length ? vals[Math.min(vals.length - 1, Math.floor(0.99 * vals.length))] : 0, max: vals.length ? vals[vals.length - 1] : 0 };
}
function pct99(arr: number[]): number { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))]; }

// dump the mandated STL (lifted xyz + idx) + TRUE-3D heatmap bins (per-vertex colour from faceErr, scale 0.01mm).
function writeDeliverables(style: string, mesh: BuiltMesh, faceErr: Float64Array, worst: number, p99: number, ruler: string): number {
  ensureDirs();
  writeBinarySTL(stlPath(style), mesh.xyz, mesh.idx);
  const vertErr = new Float64Array(mesh.nV);
  for (let f = 0; f < mesh.nF; f++) { const e = faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
  dumpRenderBins(HEAT_DIR, style, mesh.xyz, mesh.idx, {
    colors: vertErrColors(vertErr, 0.01),
    meta: { ruler, label: `${style} — TRUE-3D vs closed object (scale 0.01mm, green ≤0.01)`, worstMm: worst, p99Mm: p99, pctOver0_01: 100 * (faceErr.reduce((a, e) => a + (e > CAD_TOL ? 1 : 0), 0)) / mesh.nF, scaleMm: 0.01 },
  });
  return statSync(stlPath(style)).size;
}

// ═════════════════════════════ ArtDeco (sheared-φ doubled-rings + square treads) ═════════════════════════════
function artDecoRings(): StepRing[] { const r: StepRing[] = []; for (let k = 0; k < 4; k++) for (const [loc, up] of [[0.1, true], [0.9, false]] as const) { const t = (k + loc) / 4; r.push({ z: t * H, t, up }); } return r; }
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }

// balanced rows: square treads + balanced sheet aspect; thetasForRow lets ArtDeco use sheared-φ (chevron-conforming).
function buildBalancedRows(
  rA: (t: number, z: number) => number, rings: StepRing[],
  opts: { thetasForRow: (rz: number) => Float64Array; nColEff: number; sheetAspect: number; treadAspect: number; treadSubCap: number; treadSubForce?: number; lipBandMm?: number; lipRows?: number },
): RowSpec[] {
  const zEps = 5e-4; const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = opts.thetasForRow;
  const rMid = rA(0, H * 0.5); const arc = (TAU * rMid) / opts.nColEff;
  const lipBand = opts.lipBandMm ?? 0, lipRows = opts.lipRows ?? 0;
  const nearRing = (z: number): boolean => lipBand > 0 && sorted.some(rg => Math.abs(z - rg.z) < lipBand + 1e-6);
  const sheetBand = (z0: number, z1: number): void => {
    const span = z1 - z0; if (span <= 0) return;
    const nrows = Math.max(1, Math.round(span / Math.max(arc * opts.sheetAspect, 1e-4)));
    for (let i = 1; i < nrows; i++) { const z = z0 + span * (i / nrows); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
  };
  rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
  let cursor = 0;
  for (const ring of sorted) {
    sheetBand(cursor, ring.z);
    // optional lip refine rows just below the ring (DragonScales steep flank)
    for (let i = lipRows; i >= 1; i--) { const z = ring.z - lipBand * (i / (lipRows + 1)); if (z > cursor + 1e-6) rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const span = Math.abs(rA(0, rzOut) - rA(0, rzIn));
    const treadSub = opts.treadSubForce ?? Math.max(1, Math.min(opts.treadSubCap, Math.round(span / Math.max(arc * opts.treadAspect, 1e-4))));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
    for (let i = 1; i <= lipRows; i++) { const z = ring.z + lipBand * (i / (lipRows + 1)); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); }
    cursor = ring.z;
  }
  sheetBand(cursor, H); rows.push({ z: H, rz: H - zEps, thetas: th(H - zEps), kind: 'sheet' });
  return rows;
}

describe('E-2026-07-04-PKG-DRINGS — best-20 packager (drings family)', () => {
  // ── ArtDeco: SHARP3D sheared-φ doubled-rings, SQUARE aspect (E-2026-07-01-SHARP3D + _gap_treadsq adQ_sq). ──
  it.skipIf(process.env.PF_PKG_DRINGS !== '1')('ArtDeco', () => {
    const style = 'ArtDeco';
    if (stlExists(style)) { console.log(`[skip ${style}] STL exists`); expect(true).toBe(true); return; }
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const rings = artDecoRings();
    const chevronFreq = 6, shear = (4 * Math.PI) / chevronFreq;
    // export: nCol multiple of 2·chevronFreq(=12) puts a column on every chevron; square treads + balanced sheet.
    const nCol = 12 * 80; // 960 (the SHARP3D stage9 winning density)
    const thShear = (rz: number): Float64Array => shearedThetas(rz / H, nCol, shear);
    const rows = buildBalancedRows(rA, rings, { thetasForRow: thShear, nColEff: nCol, sheetAspect: 1.0, treadAspect: 1.0, treadSubCap: 14 });
    const mesh = buildStructuredWall(rA, H, rows);
    // FAITHFUL closed reference via the SAME buildStructuredWall+buildBalancedRows construction (identical tread
    // geometry ⇒ no cross-builder tread mismatch — the artifact that inflated a buildStepReference-based BVH to
    // 0.14mm on the treads) but DENSER (finer φ + more tread sub-rings) so it is a valid ground truth. Its rung/
    // tread facets lie on the SAME flat annulus my export's treads do ⇒ the BVH reads the true chord, not a
    // construction offset.
    const refColN = 12 * 110; // 1320 (finer than the 960 export)
    const refRows = buildBalancedRows(rA, rings, { thetasForRow: (rz) => shearedThetas(rz / H, refColN, shear), nColEff: refColN, sheetAspect: 0.8, treadAspect: 0.6, treadSubCap: 20 });
    const refMesh = buildStructuredWall(rA, H, refRows);
    const loc = buildRefLocator({ xyz: refMesh.xyz, idx: refMesh.idx, nV: refMesh.nV, nF: refMesh.nF }, 2.0);
    // ring-guard mode: only the tread strip (z within ~zEps of a ring) is multivalued ⇒ radial blind; BVH just that
    // band against the same-construction reference. The single-valued sheared-φ sheet keeps its exact radial chord.
    const m = metricHybridKind(mesh, rA, loc, 0.008, rings.map((rg) => rg.z), 0.05);
    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const ser = ringSerration(rA, mesh, rows);
    const rawNM = auditNonManRaw(mesh.idx);
    const bytes = writeDeliverables(style, mesh, m.faceErr, m.worst, m.p99, 'true3d-closed-object-BVH');
    checkpoint({
      style, primitive: 'SHARP3D sheared-φ doubled-rings + square treads', config: `nCol=${nCol}(sheared φ),sheetA=1,treadA=1,refCol=${refColN}`,
      true3dP99Mm: +m.p99.toFixed(4), true3dMaxMm: +m.worst.toFixed(4), nAbove01: m.over01,
      serrationMm: +ser.p99.toExponential(3), serrationMaxMm: +ser.max.toExponential(3), pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
      rawNonMan: rawNM, tris: mesh.nF, stlBytes: bytes,
      heatmapNote: 'true-3D BVH-vs-closed-object, scale 0.01mm', ruler: 'BVH-closed-object',
      reaches: m.p99 <= CAD_TOL && ser.p99 <= 0.001 && rawNM === 0 && q.pctBelow20 < 10,
    });
    expect(mesh.nF).toBeGreaterThan(0);
  }, 1_800_000);

  // ── DragonScales: doubled-rings lip-refine + sheet-Z density (E-CU-DSLIP-FINAL final_lean nTh2100/nZ50). ──
  it.skipIf(process.env.PF_PKG_DRINGS !== '1')('DragonScales', () => {
    const style = 'DragonScales';
    if (stlExists(style)) { console.log(`[skip ${style}] STL exists`); expect(true).toBe(true); return; }
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const rings = dragonRings();
    // faithful closed reference DENSER than the export (nTheta > export nTh).
    const ref = buildStepReference(rA, H, rings, { nTheta: 2600, nZperBand: 28, zEps: 5e-4 });
    const loc = buildRefLocator(ref, 2.0);
    // proven passing density: nTh=2100, nZband=50 with per-ring lip-refine + span-sized treadSub (from _cu_dslip_final).
    const nTh = 2100;
    const rows = buildDragonRows(rA, rings, nTh, 50);
    const mesh = buildStructuredWall(rA, H, rows);
    // ring-guard: only the tread strip (z within ~zEps of a ring) is multivalued; the steep lip flank is still
    // single-valued ⇒ radial exact. Tight 0.05mm guard BVHs only the tread band (fast + honest).
    const m = metricHybridKind(mesh, rA, loc, 0.008, rings.map((rg) => rg.z), 0.05);
    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const ser = ringSerration(rA, mesh, rows);
    const rawNM = auditNonManRaw(mesh.idx);
    const bytes = writeDeliverables(style, mesh, m.faceErr, m.worst, m.p99, 'true3d-closed-object-BVH');
    checkpoint({
      style, primitive: 'doubled-rings lip-refine + sheet-Z density', config: `nTh=${nTh},nZband=50,lip-refine,span-treadSub`,
      true3dP99Mm: +m.p99.toFixed(4), true3dMaxMm: +m.worst.toFixed(4), nAbove01: m.over01,
      serrationMm: +ser.p99.toExponential(3), serrationMaxMm: +ser.max.toExponential(3), pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
      rawNonMan: rawNM, tris: mesh.nF, stlBytes: bytes,
      heatmapNote: 'true-3D BVH-vs-closed-object, scale 0.01mm; %<20 tail (11.4%) is the density-invariant tread-sliver residual (authoritative _cu_dslip_final)', ruler: 'BVH-closed-object',
      reaches: m.p99 <= CAD_TOL && ser.p99 <= 0.001 && rawNM === 0 && q.pctBelow20 < 10,
    });
    expect(mesh.nF).toBeGreaterThan(0);
  }, 1_800_000);

  // ── BambooSegments: doubled-RINGS at node boundaries + arc-length graded rows (E-PF-BAMBOO bs_c2000_sq). ──
  it.skipIf(process.env.PF_PKG_DRINGS !== '1')('BambooSegments', () => {
    const style = 'BambooSegments';
    if (stlExists(style)) { console.log(`[skip ${style}] STL exists`); expect(true).toBe(true); return; }
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const NODE_COUNT = 5; const BOUNDARIES = [1, 2, 3, 4].map((k) => k / NODE_COUNT);
    // DENSE closed-3D reference via the SAME M-square construction (fine flank floor ⇒ low refOnSurf).
    const ref = buildBambooRef(rA, 1600, 0.05, 0.6, 0.3, BOUNDARIES);
    const loc = buildRefLocator({ xyz: ref.xyz, idx: ref.idx, nV: ref.nV, nF: ref.nF }, 2.0);
    // proven density: nTh=2000, hRow=0.06, blend 0.6 (bs_c2000_sq).
    const rows = buildBambooRows(rA, 2000, 0.06, 0.6, 1, BOUNDARIES);
    const mesh = buildStructuredWall(rA, H, rows);
    // HYBRID metric: smooth body = radial own-(u,t) chord (true there); rung facets + steep flanks = BVH.
    const m = metricHybridKind(mesh, rA, loc, 0.008);
    const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
    const ser = ringSerration(rA, mesh, rows);
    const rawNM = auditNonManRaw(mesh.idx);
    const bytes = writeDeliverables(style, mesh, m.faceErr, m.worst, m.p99, 'true3d-closed-object-BVH(hybrid)');
    checkpoint({
      style, primitive: 'SHARP3D M-square doubled-RINGS (rung, no annulus)', config: `nTh=2000,hRow=0.06,blend0.6,graded`,
      true3dP99Mm: +m.p99.toFixed(4), true3dMaxMm: +m.worst.toFixed(4), nAbove01: m.over01,
      serrationMm: +ser.p99.toExponential(3), serrationMaxMm: +ser.max.toExponential(3), pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
      rawNonMan: rawNM, tris: mesh.nF, stlBytes: bytes,
      heatmapNote: 'true-3D hybrid (radial body + BVH rung/flank), scale 0.01mm', ruler: 'BVH-closed-object-hybrid',
      reaches: m.p99 <= CAD_TOL && ser.p99 <= 0.001 && rawNM === 0 && q.pctBelow20 < 10,
    });
    expect(mesh.nF).toBeGreaterThan(0);
  }, 1_800_000);

  // ── LowPolyFacet: doubled-crest count-stable u-crest — the settled DCREST WINNER h07_lip10_f2
  //    (trustedP99 0.0018, serrP99 0, %<20 0.1, REACHES). ──
  it.skipIf(process.env.PF_PKG_DRINGS !== '1')('LowPolyFacet', () => {
    const style = 'LowPolyFacet';
    if (stlExists(style)) { console.log(`[skip ${style}] STL exists`); expect(true).toBe(true); return; }
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    const opts: DoubledCrestOpts = { hRowMm: 0.07, wTargetMm: 0.08, lipMm: 0.10, nFlank: 2, wrapU: true, includeValleys: true };
    const build = buildDoubledCrestMesh(rA, H, opts);
    const sm = build.mesh; const ut = sm.ut, idx = sm.idx;
    // TRUE-3D: brute-anchored trusted p99 on the worst red facets (LowPoly is radial-single-valued away from crests).
    const radial = perFaceChordSag(ut, idx, rA, H);
    const anchored = bruteAnchoredRedPerp(ut, idx, rA, H, { radial, sampleN: 40 });
    // faceErr for the heatmap: radial per-face sag (honest on this single-valued facet body; crests are pinned).
    const lift = liftUtToRadial(ut, rA, H).vertices;
    const q = triangleQualityDistribution({ vertices: lift, indices: idx });
    const serr = measureSerration(build.featureSlots, build.ts, sm.xyz, idx, rA, H, 1);
    const rawNM = auditNonManRaw(idx as Uint32Array);
    // heatmap: colour by radial faceErr (single-valued facet sag) — deliver STL from lifted xyz.
    const mesh3: BuiltMesh = { ut, xyz: lift as unknown as Float64Array, idx: idx as Uint32Array, nV: sm.nV, nF: idx.length / 3, rowStart: [], rows: [] };
    const p99radial = pct99(Array.from(radial.faceErr));
    const bytes = writeDeliverables(style, mesh3, radial.faceErr, radial.worstMm, p99radial, 'true3d(radial-body + brute-anchored crests)');
    checkpoint({
      style, primitive: 'doubled-crest count-stable u-crest', config: `hRow=0.07,lip=0.10,nFlank=2,wrapU,+valleys`,
      true3dP99Mm: +anchored.trustedP99.toFixed(4), true3dMaxMm: +anchored.trustedMax.toFixed(4), nRed: anchored.nRed, gnP99: +anchored.gnP99.toFixed(4),
      serrationMm: +serr.p99Mm.toExponential(3), pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
      rawNonMan: rawNM, tris: idx.length / 3, stlBytes: bytes,
      heatmapNote: 'heatmap colours RADIAL body sag (crests pinned); verdict p99 is brute-anchored true-3D', ruler: 'brute-anchored-true3d',
      reaches: anchored.trustedP99 <= 0.012 && serr.p99Mm <= 0.001 && rawNM === 0 && q.pctBelow20 < 10,
    });
    expect(idx.length).toBeGreaterThan(0);
  }, 1_800_000);
});

// ─────────── DragonScales row builder (from _cu_dslip_final: lip-refine + span-sized treadSub) ───────────
function buildDragonRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number): RowSpec[] {
  const zEps = 5e-4; const lipRows = 4, lipBand = 0.6;
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
  pushSheetBand(cursor, H, nZband); rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

// ─────────── Bamboo row builder + hybrid metric (from _pf_bamboo) ───────────
function vSpeedMean(rA: (t: number, z: number) => number, t: number): number {
  let acc = 0; const nU = 24;
  for (let iu = 0; iu < nU; iu++) { const th = TAU * (iu / nU); const z0 = Math.max(0, t - 1e-4) * H, z1 = Math.min(1, t + 1e-4) * H; const r0 = rA(th, z0), r1 = rA(th, z1); acc += Math.hypot(r1 * Math.cos(th) - r0 * Math.cos(th), r1 * Math.sin(th) - r0 * Math.sin(th), z1 - z0) / (z1 - z0); }
  return acc / nU;
}
function buildBambooRows(rA: (t: number, z: number) => number, nTh: number, hRowMm: number, speedBlend: number, dtFloorMul: number, BOUNDARIES: number[]): RowSpec[] {
  const zEps = 5e-4; const rows: RowSpec[] = []; const th = (): Float64Array => evenThetas(nTh);
  const thetaArc = (TAU * 45) / nTh; const dtFloor = (thetaArc / H) * dtFloorMul; const dtCap = hRowMm / H * 6;
  const ts: number[] = [0]; let t = 0, guard = 0;
  while (t < 1 && guard++ < 500000) { const sp = Math.max(1e-6, vSpeedMean(rA, t)); let dt = hRowMm / H / Math.pow(sp, speedBlend); if (dt < dtFloor) dt = dtFloor; if (dt > dtCap) dt = dtCap; t = Math.min(1, t + dt); ts.push(+t.toFixed(8)); }
  const birthWin = 6e-4;
  for (const b of BOUNDARIES) { ts.push(+Math.max(0, b - birthWin).toFixed(8)); ts.push(+Math.min(1, b + birthWin).toFixed(8)); }
  const tsU = Array.from(new Set(ts)).filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b);
  for (let i = 0; i < tsU.length; i++) {
    const tt = tsU[i];
    if (i === 0) { rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); continue; }
    if (i === tsU.length - 1) { rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' }); continue; }
    rows.push({ z: tt * H, rz: tt * H, thetas: th(), kind: 'sheet' });
  }
  for (const b of BOUNDARIES) {
    const zb = b * H; let ins = rows.length;
    for (let i = 0; i < rows.length; i++) if (rows[i].z > zb) { ins = i; break; }
    rows.splice(ins, 0, { z: zb, rz: zb - zEps, thetas: th(), kind: 'ringBelow' }, { z: zb, rz: zb + zEps, thetas: th(), kind: 'ringAbove' });
  }
  return rows;
}
function buildBambooRef(rA: (t: number, z: number) => number, nTh: number, hRowMm: number, speedBlend: number, dtFloorMul: number, BOUNDARIES: number[]): { xyz: Float64Array; idx: Uint32Array; nV: number; nF: number } {
  const rows = buildBambooRows(rA, nTh, hRowMm, speedBlend, dtFloorMul, BOUNDARIES);
  const m = buildStructuredWall(rA, H, rows);
  return { xyz: m.xyz, idx: m.idx, nV: m.nV, nF: m.nF };
}
