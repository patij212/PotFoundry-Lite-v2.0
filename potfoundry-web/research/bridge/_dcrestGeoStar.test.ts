// _dcrestGeoStar.test.ts — DEV-ONLY (env PF_DCGS=1). PHASE-2 of the STRUCTURED DOUBLED-CREST primitive:
// apply _doubledCrestLib.buildDoubledCrestMesh (reused VERBATIM) to GeometricStar.
//
// GeometricStar feature structure (defaults N=8, layers=4, zoom=1, gap=0.05, roundness=0 => edge=0.02 sharp,
// relief=2.0, shift=0):
//   - HORIZONTAL C0 tile-boundary creases at t*layers*zoom = integer => z = k*30 (t=0.25,0.5,0.75). Vertical
//     z-riser cliffs (like ArtDeco doubled-rings). Handled by mandatoryT rows => exact mesh-edge RINGS.
//   - VERTICAL/chevron C1 strapwork creases: per sector the strap edges (|dLine|=gap) fold at sector centre
//     (pX=|uvX| at a=0). These show as r-extrema in u per row => the doubled-crest column tracker embeds them.
//
// HONEST RULERS (labkit; wiring cloned from _doubledCrest.test.ts):
//   TRUE-3D    = bruteAnchoredRedPerp(...).trustedP99   (brute-anchor corrects GN steep-overstatement)
//   QUALITY    = triangleQualityDistribution.pctBelow20
//   WATERTIGHT = auditNonManRaw  (RAW-index, NOT weld)
//   SERRATION  = measureSerration (VERTICAL chevron crest curves) + measureHRingSerration (HORIZONTAL tile rings)
//               — the designed cliffs MUST be mesh edges; combined serration is the decisive NEW gate.
//
// KILL-CRITERION: REACHES iff trustedP99<=0.012 AND serration(max of vert+horiz)<=0.001 AND rawNonMan 0 AND %<20<10.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, liftUtToRadial, triangleQualityDistribution,
  perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import { buildDoubledCrestMesh, measureSerration, rowExtremaU, trackCrestSlots, msquareRowsDC, type DoubledCrestOpts } from './_doubledCrestLib';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_dcrest_gs');
const LEDGER = join(DIR, 'scorecard.ndjson');
// tile-boundary creases (C0): z = k * H/(layers*zoom) = k*30 => t = 0.25,0.5,0.75.
const TILE_T = [0.25, 0.5, 0.75];

// Raw-index non-manifold (NOT weld) — SHARDED numeric-key maps (cloned from _doubledCrest.test.ts).
function auditNonManRaw(indices: ArrayLike<number>, nV: number): number {
  const EK = nV + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const NSHARD = 64;
  const ecs: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (p: number, r: number): void => { const kk = key(p, r); const m = ecs[(p < r ? p : r) & (NSHARD - 1)]; m.set(kk, (m.get(kk) ?? 0) + 1); };
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    bump(a, b); bump(b, c); bump(c, a);
  }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}

/**
 * HORIZONTAL-crease serration: for each tile-boundary t=tk, sample the true crease RING (z=tk*H) around u and
 * measure the 3D distance to the nearest MESH EDGE. If a mandatory row sits exactly at tk the ring is a mesh-edge
 * chain => ~0; if the nearest row is off tk the crease point is off every edge => serration>0. Mirrors
 * measureSerration's edge-hash but for horizontal rings.
 */
function measureHRingSerration(
  tileTs: number[], xyz: Float64Array | number[], indices: ArrayLike<number>,
  rA: AnalyticRadiusFn, H: number, samplePerRing = 720,
): { p99Mm: number; maxMm: number; meanMm: number; nSample: number } {
  const nV = xyz.length / 3;
  const NSH = 64;
  const seenSh: Array<Set<number>> = Array.from({ length: NSH }, () => new Set<number>());
  const edges: Array<[number, number]> = [];
  const ekey = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a);
  const addEdge = (p: number, q: number): void => { const kk = ekey(p, q); const s = seenSh[(p < q ? p : q) & (NSH - 1)]; if (!s.has(kk)) { s.add(kk); edges.push([p, q]); } };
  for (let k = 0; k < indices.length; k += 3) { const a = indices[k], b = indices[k + 1], c = indices[k + 2]; addEdge(a, b); addEdge(b, c); addEdge(c, a); }
  const CELL = 1.0;
  const grid = new Map<string, number[]>();
  const gk = (x: number, y: number, z: number): string => `${Math.floor(x / CELL)}_${Math.floor(y / CELL)}_${Math.floor(z / CELL)}`;
  for (let e = 0; e < edges.length; e++) {
    const [p, q] = edges[e];
    const mx = (xyz[3 * p] + xyz[3 * q]) / 2, my = (xyz[3 * p + 1] + xyz[3 * q + 1]) / 2, mz = (xyz[3 * p + 2] + xyz[3 * q + 2]) / 2;
    const key = gk(mx, my, mz); const arr = grid.get(key); if (arr) arr.push(e); else grid.set(key, [e]);
  }
  const segDist = (px: number, py: number, pz: number, e: number): number => {
    const [p, q] = edges[e];
    const ax = xyz[3 * p], ay = xyz[3 * p + 1], az = xyz[3 * p + 2];
    const bx = xyz[3 * q], by = xyz[3 * q + 1], bz = xyz[3 * q + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
    let t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy, cz = az + t * dz;
    return Math.hypot(px - cx, py - cy, pz - cz);
  };
  const dists: number[] = [];
  for (const tk of tileTs) {
    const z = tk * H;
    for (let i = 0; i < samplePerRing; i++) {
      const th = TAU * (i / samplePerRing); const rr = rA(th, z);
      const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      let best = Infinity;
      const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL), cz = Math.floor(pz / CELL);
      for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) for (let iz = -1; iz <= 1; iz++) {
        const arr = grid.get(`${cx + ix}_${cy + iy}_${cz + iz}`); if (!arr) continue;
        for (const e of arr) { const d = segDist(px, py, pz, e); if (d < best) best = d; }
      }
      if (isFinite(best)) dists.push(best);
    }
  }
  dists.sort((a, b) => a - b);
  const p = (q: number): number => dists.length ? dists[Math.min(dists.length - 1, Math.floor(q * dists.length))] : 0;
  const mean = dists.length ? dists.reduce((a, c) => a + c, 0) / dists.length : 0;
  return { p99Mm: p(0.99), maxMm: dists.length ? dists[dists.length - 1] : 0, meanMm: mean, nSample: dists.length };
}

function scoreAndCheckpoint(label: string, opts: DoubledCrestOpts, dumpVisual: boolean): Record<string, unknown> {
  const STYLE = 'GeometricStar' as StyleId;
  const rA = buildRadiusFn(STYLE, {}, DIMS);
  const t0 = Date.now();
  const build = buildDoubledCrestMesh(rA, DIMS.H, opts);
  const { mesh } = build; const ut = mesh.ut, idx = mesh.idx;
  const ms = Date.now() - t0;

  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 });
  const lift = liftUtToRadial(ut, rA, DIMS.H).vertices;
  const q = triangleQualityDistribution({ vertices: lift, indices: idx });
  const rawNonMan = auditNonManRaw(idx, mesh.nV);
  const serrV = measureSerration(build.featureSlots, build.ts, mesh.xyz, idx, rA, DIMS.H, 1);
  const serrH = measureHRingSerration(TILE_T, mesh.xyz, idx, rA, DIMS.H, 720);
  const serrMaxAll = Math.max(serrV.p99Mm, serrH.p99Mm);

  const reaches = anchored.trustedP99 <= 0.012 && serrMaxAll <= 0.001 && rawNonMan === 0 && q.pctBelow20 < 10;
  const row = {
    style: STYLE, label, tris: idx.length / 3,
    trustedP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(4), gnOver: anchored.gnOver, nRed: anchored.nRed,
    serrVP99: +serrV.p99Mm.toFixed(5), serrVMax: +serrV.maxMm.toFixed(5), serrVN: serrV.nSample,
    serrHP99: +serrH.p99Mm.toFixed(5), serrHMax: +serrH.maxMm.toFixed(5), serrHN: serrH.nSample,
    minA: +q.minAngleDeg.toFixed(2), pctB20: +q.pctBelow20.toFixed(2), pctB10: +q.pctBelow10.toFixed(2),
    rawNonMan, nCrest: build.nCrest, nValley: build.nValley, nCol: build.nCol,
    stable: build.countStableCrest && build.countStableValley, reaches, ms: Math.round(ms),
  };
  mkdirSync(DIR, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`GS/${label} tris=${row.tris} trueP99=${row.trustedP99}(gn ${row.gnP99},red ${row.nRed}) serrV=${row.serrVP99}(mx${row.serrVMax},n${row.serrVN}) serrH=${row.serrHP99}(mx${row.serrHMax},n${row.serrHN}) minA=${row.minA} %<20=${row.pctB20} rawNM=${row.rawNonMan} nCrest=${row.nCrest} nVal=${row.nValley} nCol=${row.nCol} stable=${row.stable} REACHES=${row.reaches} ${row.ms}ms`);
  if (dumpVisual) {
    dumpHeatmap(DIR, `dcrest_GS_${label}`, mesh.xyz, ut, idx, rA, DIMS.H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
    const order = Array.from({ length: radial.faceErr.length }, (_, f) => f).sort((a, b) => radial.faceErr[b] - radial.faceErr[a]).slice(0, 8);
    const crestUs = build.featureSlots.filter((s) => s.sharp && s.sign > 0);
    const info: string[] = [];
    for (const f of order) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const cu = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, ctv = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const rr = Math.floor(ctv * (build.ts.length - 1));
      let dCrest = 1; for (const s of crestUs) { let d = Math.abs(cu - s.u[rr]); if (d > 0.5) d = 1 - d; if (d < dCrest) dCrest = d; }
      const uw = Math.max(ut[2 * a], ut[2 * b], ut[2 * c]) - Math.min(ut[2 * a], ut[2 * b], ut[2 * c]);
      let dTile = 1; for (const tk of TILE_T) { const d = Math.abs(ctv - tk); if (d < dTile) dTile = d; }
      info.push(`err=${radial.faceErr[f].toFixed(3)}@u${cu.toFixed(3)},t${ctv.toFixed(3)} dCrest=${dCrest.toFixed(4)} dTile=${dTile.toFixed(4)} uw=${uw.toFixed(4)}`);
    }
    // eslint-disable-next-line no-console
    console.log(`  [localize ${label}] worst radial facets: ${info.join(' | ')}`);
  }
  return row;
}

describe('E-2026-07-04-DCGS — doubled-crest primitive on GeometricStar (chevron C1 + tile-boundary C0)', () => {
  // ── FAST DIAGNOSTIC (bounded, resumable): where does the 26mm true-3D come from? Build a coarse mesh, use the
  //    radial chord + brute-anchor ONLY the worst 30 red facets, and localize them (dCrest / dTile / u-width / row
  //    span). Confirms density-invariance of the floor + pins the defect to collapsed-slot facets. ──
  it.skipIf(process.env.PF_DCGS !== '1')('GeometricStar: 26mm-floor localization (fast)', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
    const opts: DoubledCrestOpts = { hRowMm: 0.5, wTargetMm: 0.3, lipMm: 0.08, nFlank: 1, wrapU: true, includeValleys: true, mandatoryT: TILE_T };
    const build = buildDoubledCrestMesh(rA, DIMS.H, opts);
    const { mesh } = build; const ut = mesh.ut, idx = mesh.idx;
    const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
    const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 30 });
    const serrV = measureSerration(build.featureSlots, build.ts, mesh.xyz, idx, rA, DIMS.H, 1);
    const serrH = measureHRingSerration(TILE_T, mesh.xyz, idx, rA, DIMS.H, 720);
    const rawNonMan = auditNonManRaw(idx, mesh.nV);
    const lift = liftUtToRadial(ut, rA, DIMS.H).vertices;
    const q = triangleQualityDistribution({ vertices: lift, indices: idx });
    // localize worst 12 radial facets
    const order = Array.from({ length: radial.faceErr.length }, (_, f) => f).sort((a, b) => radial.faceErr[b] - radial.faceErr[a]).slice(0, 12);
    const crestUs = build.featureSlots.filter((s) => s.sharp && s.sign > 0);
    const info: string[] = [];
    for (const f of order) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const cu = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, ctv = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const rr = Math.floor(ctv * (build.ts.length - 1));
      let dCrest = 1; for (const s of crestUs) { let d = Math.abs(cu - s.u[rr]); if (d > 0.5) d = 1 - d; if (d < dCrest) dCrest = d; }
      const uw = Math.max(ut[2 * a], ut[2 * b], ut[2 * c]) - Math.min(ut[2 * a], ut[2 * b], ut[2 * c]);
      const tw = Math.max(ut[2 * a + 1], ut[2 * b + 1], ut[2 * c + 1]) - Math.min(ut[2 * a + 1], ut[2 * b + 1], ut[2 * c + 1]);
      let dTile = 1; for (const tk of TILE_T) { const d = Math.abs(ctv - tk); if (d < dTile) dTile = d; }
      info.push(`err=${radial.faceErr[f].toFixed(2)}@u${cu.toFixed(3)},t${ctv.toFixed(3)} dCrest=${dCrest.toFixed(4)} dTile=${dTile.toFixed(4)} uw=${uw.toFixed(4)} tw=${tw.toFixed(4)}`);
    }
    const row = {
      style: 'GeometricStar', label: 'gs_localize_fast', tris: idx.length / 3,
      trustedP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(4), nRed: anchored.nRed,
      serrVP99: +serrV.p99Mm.toFixed(5), serrHP99: +serrH.p99Mm.toFixed(5),
      pctB20: +q.pctBelow20.toFixed(2), rawNonMan, nCol: build.nCol, rows: build.ts.length, stable: build.countStableCrest && build.countStableValley,
    };
    appendFileSync(LEDGER, JSON.stringify(row) + '\n');
    // eslint-disable-next-line no-console
    console.log(`GS-localize tris=${row.tris} trueP99=${row.trustedP99}(gn ${row.gnP99},red ${row.nRed}) serrV=${row.serrVP99} serrH=${row.serrHP99} %<20=${row.pctB20} rawNM=${row.rawNonMan} nCol=${row.nCol} rows=${row.rows} stable=${row.stable}`);
    // eslint-disable-next-line no-console
    console.log(`  [worst facets] ${info.join(' | ')}`);
    expect(radial.faceErr.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  // ── RECON (cheap, no mesh): per-row crest/valley count + does a mandatory row land ON each tile boundary? ──
  it.skipIf(process.env.PF_DCGS !== '1')('recon: feature-count stability + tile-row alignment', () => {
    const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
    // rows WITHOUT mandatory (Phase-1 placement) to see if tile boundaries are naturally hit.
    const tsFree = msquareRowsDC(rA, DIMS.H, 0.4, [], 0.5);
    // nearest free-row distance to each tile t.
    const tileGap = TILE_T.map((tk) => Math.min(...tsFree.map((t) => Math.abs(t - tk))));
    // rows WITH mandatory tile rows.
    const tsMand = msquareRowsDC(rA, DIMS.H, 0.4, TILE_T, 0.5);
    const hasAll = TILE_T.every((tk) => tsMand.some((t) => Math.abs(t - tk) < 1e-6));
    const cCounts: number[] = [], vCounts: number[] = [];
    for (const t of tsFree) {
      const z = t * DIMS.H; let sum = 0; const NM = 256; for (let i = 0; i < NM; i++) sum += rA(TAU * (i / NM), z); const mean = sum / NM;
      const cr = rowExtremaU(rA, z, +1, 2048).filter((u) => Math.abs(rA(TAU * u, z) - mean) >= 0.02);
      const va = rowExtremaU(rA, z, -1, 2048).filter((u) => Math.abs(rA(TAU * u, z) - mean) >= 0.02);
      cCounts.push(cr.length); vCounts.push(va.length);
    }
    const tr = trackCrestSlots(rA, DIMS.H, tsFree, { scanN: 2048, reliefFloorMm: 0.02 });
    // eslint-disable-next-line no-console
    console.log(`[recon GeometricStar] rows=${tsFree.length} crestCount[min..max]=${Math.min(...cCounts)}..${Math.max(...cCounts)} valleyCount=${Math.min(...vCounts)}..${Math.max(...vCounts)} | tracker nCrest=${tr.nCrest} nVal=${tr.nValley} stableC=${tr.countStableCrest} stableV=${tr.countStableValley}`);
    // eslint-disable-next-line no-console
    console.log(`   tile-boundary nearest FREE-row gap (t units): ${tileGap.map((g) => g.toFixed(4)).join(', ')} | mandatoryT lands ALL tile rows: ${hasAll}`);
    // eslint-disable-next-line no-console
    console.log(`   crest counts per row: ${cCounts.join(',')}`);
    expect(tsFree.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  // ── ROW-COUNT probe: GeometricStar's near-vertical strap flanks spike vSpeed => msquareRowsDC row runaway
  //    (the h10 build OOM'd at Float64Array(total*3): invalid length). Report nRow at each hRow so we bound it. ──
  it.skipIf(process.env.PF_DCGS !== '1')('probe: msquare row count at each density', () => {
    const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
    for (const h of [0.4, 0.2, 0.12, 0.10, 0.07, 0.05]) {
      const ts = msquareRowsDC(rA, DIMS.H, h, TILE_T, 0.5);
      // eslint-disable-next-line no-console
      console.log(`[rowprobe] hRow=${h} => nRow=${ts.length}`);
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);

  // ── BUILD-DIMS probe: build ONE coarse mesh, catch, and report nCrest/nVal/nCol/nV/nF to locate the OOM. ──
  it.skipIf(process.env.PF_DCGS !== '1')('probe: build dims (coarse)', () => {
    const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
    for (const [lbl, o] of [
      ['coarse_val', { hRowMm: 0.4, wTargetMm: 0.3, lipMm: 0.08, nFlank: 1, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
      ['coarse_noval', { hRowMm: 0.4, wTargetMm: 0.3, lipMm: 0.08, nFlank: 1, wrapU: true, includeValleys: false, mandatoryT: TILE_T }],
      ['f2_coarse', { hRowMm: 0.4, wTargetMm: 0.10, lipMm: 0.08, nFlank: 2, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
      ['f2_h20', { hRowMm: 0.2, wTargetMm: 0.10, lipMm: 0.08, nFlank: 2, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
      ['f2_h30', { hRowMm: 0.3, wTargetMm: 0.10, lipMm: 0.08, nFlank: 2, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
      ['f2_h25', { hRowMm: 0.25, wTargetMm: 0.10, lipMm: 0.08, nFlank: 2, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
      ['f1_h20', { hRowMm: 0.2, wTargetMm: 0.14, lipMm: 0.08, nFlank: 1, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
    ] as Array<[string, DoubledCrestOpts]>) {
      try {
        const b = buildDoubledCrestMesh(rA, DIMS.H, o);
        // eslint-disable-next-line no-console
        console.log(`[builddims ${lbl}] nCrest=${b.nCrest} nVal=${b.nValley} nCol=${b.nCol} rows=${b.ts.length} nV=${b.mesh.nV} nF=${b.mesh.nF}`);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`[builddims ${lbl}] FAIL ${(e as Error).message}`);
      }
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);

  // ── BUILD + SCORE at >=2 densities. Chevron crests + tile-boundary rings, M-square between. ──
  it.skipIf(process.env.PF_DCGS !== '1')('GeometricStar: doubled-crest sweep', () => {
    mkdirSync(DIR, { recursive: true });
    // NOTE: finer rows (h<=0.20) trip the tracker's unstable-count pathology (nFeat explodes on a spuriously-dense
    // row => nCol overflow => "Invalid array length"). The two densities below are the finest that BUILD; they are
    // the honest floor at ~10M/~20M tris — well above the 6M HD-confirm budget, so this IS the density sweep.
    const variants: Array<[string, DoubledCrestOpts]> = [
      ['h30_lip08_f2', { hRowMm: 0.30, wTargetMm: 0.10, lipMm: 0.08, nFlank: 2, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
      ['h25_lip08_f2', { hRowMm: 0.25, wTargetMm: 0.10, lipMm: 0.08, nFlank: 2, wrapU: true, includeValleys: true, mandatoryT: TILE_T }],
    ];
    for (const [label, opts] of variants) {
      try {
        scoreAndCheckpoint(label, opts, true);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`[BUILD-FAIL ${label}] ${(e as Error).message}`);
      }
    }
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
