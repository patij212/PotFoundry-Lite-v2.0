/* eslint-disable no-console */
// _gsSeamWeld.test.ts — DEV-ONLY. GeometricStar rim-pin SEAM-WELD root-cause + FIX verify (2026-07-23).
//
// HYPOTHESIS: GeometricStar's production region emitter (buildRegionOuterWall → buildMetricOuterWall →
// metricMeshToOuterWall) leaves nonMan 3 + a localized true-3D MAX (~0.7) NOT because of a diffuse chevron floor
// (bulk p99 0.0049 = CAD-grade) but because of a LOCALIZED rim-pin u=1→u=0 SEAM-WELD defect + a small budget-capped
// worst-facet tail (E-2026-07-23-HARDCARD-SCORECARD). The concurrent E-2026-07-22-GEOSTAR-PROD-CLOSE probe meshes the
// SAME surface with buildMetricMesh DIRECTLY (NO rim-pin weld) and does not see nonMan 3 ⇒ the defect is SPECIFIC to
// the rim-pin index-weld in metricMeshToOuterWall, which runs AFTER flipHE's guardManifoldAlways (so the guard cannot
// catch a weld-created non-manifold — hence "nonMan 3 despite guardManifoldAlways").
//
// This probe (a) REPRODUCES the nonMan + MAX at reproduction/production density, (b) LOCATES the exact non-manifold
// edges (u,t,z + incident triangles) and worst facets, (c) a NO-RIM-PIN control confirms the weld is the culprit, and
// after the src fix (d) VERIFIES nonMan 0, boundary = 2·nRing, MAX ≤ 0.01, vtx ≈ 0.
//
// Each unit is env-gated + ndjson-checkpointed so a killed run RESUMES the unfinished unit only. research/ only;
// imports src READ-ONLY except that the FIX lands in src/.../regionMetric.ts (metricMeshToOuterWall). ONE ruler both
// meshes: measureProjectorMax (globally-correct perpendicular projector) + labkit true-3D/audit instruments.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildRegionOuterWall } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { buildMetricMesh, type MetricMeshOpts } from '../../src/renderers/webgpu/parametric/conforming/tierC/regionMetric';
import type { StyleId, StyleOptions } from '../../src/geometry/types';
import {
  perFaceTrue3DSag, triangleQualityDistribution, auditNonManByIndex, nonManRawBigStats, liftUtToRadial, dumpRenderBins,
} from './labkit';

// PRODUCTION dims (task): tapered OD140/H120 → Rt70/Rb45/expn1.1.
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const H = DIMS.H;
const TOL = 0.01;
const NRING = 2048;
const TAU = 2 * Math.PI;

const OUT_DIR = join('research', 'exchange', '_gsSeamWeld');
const WIT = join(OUT_DIR, 'witness.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  console.log(l);
}
function keyExists(file: string, k: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(WIT, JSON.stringify(row) + '\n');
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row).slice(0, 900)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}
function packedToUt(vertices: Float32Array): number[] {
  const n = vertices.length / 3;
  const ut = new Array<number>(n * 2);
  for (let i = 0; i < n; i++) { ut[2 * i] = vertices[3 * i]; ut[2 * i + 1] = vertices[3 * i + 1]; }
  return ut;
}

// ─────────────────────── DETAILED non-manifold census (large-mesh-safe, LOCATES the edges) ───────────────────────
interface NmEdge {
  aUt: [number, number]; bUt: [number, number]; aZ: number; bZ: number; mult: number;
  where: string; triCentroids: Array<{ u: number; t: number }>;
}
interface Census { nonMan: number; boundary: number; interior: number; edges: number; nmEdges: NmEdge[] }

/**
 * Position-weld (quantized) non-manifold census that LOCATES each >2-shared edge: endpoint (u,t,z) + incident-triangle
 * centroids. Mirrors labkit.auditNonManByIndex's weld exactly (same quantize) so `nonMan` matches it, then adds the
 * per-edge locus + a boundary/interior tally (a closed watertight wall has boundary = the two open rims only).
 * Large-mesh-safe: single vertex-weld Map (< 16.7M cap at ≤5M verts) + a sorted-key edge run-length scan (no edge Map).
 */
function censusPositionWeld(xyz: ArrayLike<number>, ut: number[], indices: ArrayLike<number>, quantizeMm = 1e-4): Census {
  const n = xyz.length / 3;
  const canon = new Int32Array(n);
  const wmap = new Map<string, number>();
  const q = 1 / quantizeMm;
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`;
    const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; }
  }
  // sorted canon-edge keys: lo*2^27+hi (canon < n ≤ ~5M < 2^23 ⇒ exact in Float64).
  const nT = indices.length / 3;
  const keys = new Float64Array(nT * 3);
  let m = 0;
  for (let t = 0; t < nT; t++) {
    const a = canon[indices[3 * t]], b = canon[indices[3 * t + 1]], c = canon[indices[3 * t + 2]];
    if (a === b || b === c || a === c) continue;
    for (const [p, r] of [[a, b], [b, c], [c, a]] as const) { const lo = p < r ? p : r, hi = p < r ? r : p; keys[m++] = lo * 134217728 + hi; }
  }
  const sorted = keys.subarray(0, m); sorted.sort();
  let nonMan = 0, boundary = 0, interior = 0;
  const nmKeys = new Set<number>();
  for (let i = 0; i < m;) {
    let j = i + 1; while (j < m && sorted[j] === sorted[i]) j++;
    const mult = j - i;
    if (mult > 2) { nonMan++; nmKeys.add(sorted[i]); } else if (mult === 1) boundary++; else interior++;
    i = j;
  }
  // Second pass: gather incident-tri centroids for the (few) nonMan edges.
  const perEdge = new Map<number, { mult: number; tris: Array<{ u: number; t: number }> }>();
  for (const k of nmKeys) perEdge.set(k, { mult: 0, tris: [] });
  if (nmKeys.size > 0) {
    for (let t = 0; t < nT; t++) {
      const ia = indices[3 * t], ib = indices[3 * t + 1], ic = indices[3 * t + 2];
      const a = canon[ia], b = canon[ib], c = canon[ic];
      if (a === b || b === c || a === c) continue;
      let ua = ut[2 * ia], ub = ut[2 * ib], uc = ut[2 * ic];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const cU = ((ua + ub + uc) / 3) % 1, cT = (ut[2 * ia + 1] + ut[2 * ib + 1] + ut[2 * ic + 1]) / 3;
      for (const [p, r] of [[a, b], [b, c], [c, a]] as const) {
        const lo = p < r ? p : r, hi = p < r ? r : p; const kk = lo * 134217728 + hi;
        const rec = perEdge.get(kk);
        if (rec) { rec.mult++; if (rec.tris.length < 8) rec.tris.push({ u: +cU.toFixed(5), t: +cT.toFixed(5) }); }
      }
    }
  }
  const nmEdges: NmEdge[] = [];
  for (const [k, rec] of perEdge) {
    const lo = Math.floor(k / 134217728), hi = k - lo * 134217728;
    const au = ut[2 * lo], at = ut[2 * lo + 1], bu = ut[2 * hi], bt = ut[2 * hi + 1];
    const nearSeam = (u: number): boolean => u <= 1e-4 || u >= 1 - 1e-4;
    const nearRim = (t: number): boolean => t <= 1e-4 || t >= 1 - 1e-4;
    const where = (nearSeam(au) || nearSeam(bu) ? 'SEAM ' : '') + (nearRim(at) || nearRim(bt) ? 'RIM ' : '') || 'interior';
    nmEdges.push({
      aUt: [+au.toFixed(6), +at.toFixed(6)], bUt: [+bu.toFixed(6), +bt.toFixed(6)],
      aZ: +(at * H).toFixed(3), bZ: +(bt * H).toFixed(3), mult: rec.mult, where: where.trim(), triCentroids: rec.tris,
    });
  }
  return { nonMan, boundary, interior, edges: m, nmEdges };
}

/** Cheap worst-facet localizer (same-(u,t) UB ≥ true chord ⇒ top-K UB contains worst-true). */
function worstFacetsUB(ut: number[], idx: ArrayLike<number>, lifted: Float32Array, rA: (th: number, z: number) => number, K: number): Array<{ u: number; t: number; z: number; ub: number }> {
  const nF = idx.length / 3;
  const worst = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const cx = (lifted[3 * a] + lifted[3 * b] + lifted[3 * c]) / 3;
    const cy = (lifted[3 * a + 1] + lifted[3 * b + 1] + lifted[3 * c + 1]) / 3;
    const cz = (lifted[3 * a + 2] + lifted[3 * b + 2] + lifted[3 * c + 2]) / 3;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const um = ((ua + ub + uc) / 3) % 1, tm = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    const th = TAU * um, z = tm * H, r = rA(th, z);
    worst[f] = Math.hypot(r * Math.cos(th) - cx, r * Math.sin(th) - cy, z - cz);
  }
  const order = Array.from({ length: nF }, (_, i) => i).sort((x, y) => worst[y] - worst[x]).slice(0, K);
  return order.map((f) => {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const um = (((ua + ub + uc) / 3) % 1 + 1) % 1, tm = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    return { u: +um.toFixed(4), t: +tm.toFixed(4), z: +(tm * H).toFixed(2), ub: +worst[f].toFixed(4) };
  });
}

// ─────────────────────── FAITHFUL replica of src metricMeshToOuterWall packing (configurable RING_EPS) ───────────────────────
// Lets us build the expensive 10M FLAT kernel mesh ONCE and test the CURRENT (RING_EPS=1e-6) vs FIX packing without a
// rebuild. Mirrors regionMetric.ts#metricMeshToOuterWall exactly (weld u=1→u=0 by t-sorted bijection, compact, rings).
interface Packed { vertices: Float32Array; indices: Uint32Array; bottomRing: number[]; topRing: number[]; col0: number; col1: number; threw?: string }
function packMetricMesh(ut: number[], indices: ArrayLike<number>, rimPinRing: number, RING_EPS: number): Packed {
  const nV = ut.length / 2;
  const doRimPin = rimPinRing >= 2;
  const remap = new Int32Array(nV);
  for (let i = 0; i < nV; i++) remap[i] = i;
  let c0len = 0, c1len = 0;
  if (doRimPin) {
    const col0: number[] = [], col1: number[] = [];
    for (let i = 0; i < nV; i++) { const u = ut[2 * i]; if (u <= RING_EPS) col0.push(i); else if (u >= 1 - RING_EPS) col1.push(i); }
    c0len = col0.length; c1len = col1.length;
    if (col0.length === 0 || col0.length !== col1.length) return { vertices: new Float32Array(0), indices: new Uint32Array(0), bottomRing: [], topRing: [], col0: c0len, col1: c1len, threw: `bijection u0=${c0len} u1=${c1len}` };
    col0.sort((a, b) => ut[2 * a + 1] - ut[2 * b + 1]); col1.sort((a, b) => ut[2 * a + 1] - ut[2 * b + 1]);
    for (let k = 0; k < col1.length; k++) {
      if (Math.abs(ut[2 * col1[k] + 1] - ut[2 * col0[k] + 1]) >= RING_EPS) return { vertices: new Float32Array(0), indices: new Uint32Array(0), bottomRing: [], topRing: [], col0: c0len, col1: c1len, threw: 't-mismatch' };
      remap[col1[k]] = col0[k];
    }
  }
  const oldToNew = new Int32Array(nV).fill(-1); let newCount = 0;
  for (let i = 0; i < nV; i++) if (remap[i] === i) oldToNew[i] = newCount++;
  const finalOf = (i: number): number => oldToNew[remap[i]];
  const vertices = new Float32Array(newCount * 3);
  for (let i = 0; i < nV; i++) { if (remap[i] !== i) continue; const ni = oldToNew[i]; vertices[3 * ni] = ut[2 * i]; vertices[3 * ni + 1] = ut[2 * i + 1]; vertices[3 * ni + 2] = 0; }
  const outIdx = new Uint32Array(indices.length);
  for (let k = 0; k < indices.length; k++) outIdx[k] = finalOf(indices[k]);
  const bottom: number[] = [], top: number[] = [];
  for (let i = 0; i < nV; i++) { if (remap[i] !== i) continue; const t = ut[2 * i + 1]; const ni = oldToNew[i]; if (t <= RING_EPS) bottom.push(ni); else if (t >= 1 - RING_EPS) top.push(ni); }
  return { vertices, indices: outIdx, bottomRing: bottom, topRing: top, col0: c0len, col1: c1len };
}

const FLAT_UT = join(OUT_DIR, 'flat_ut.f64.bin');
const FLAT_IDX = join(OUT_DIR, 'flat_idx.u32.bin');

interface Arm { key: string; tolMm: number; hMin: number; maxPoints: number; dump?: boolean; note: string }

async function runRegion(arm: Arm): Promise<Record<string, unknown>> {
  const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
  const t0 = Date.now(); const c0 = cpuUsage();
  const wall = buildRegionOuterWall({
    analyticRA: rA, H, nRing: NRING, tolMm: arm.tolMm, hMin: arm.hMin, hMax: 1.0,
    sizeRes: 128, chordTolMm: arm.tolMm, maxPoints: arm.maxPoints,
  }, 'GeometricStar' as StyleId);
  if (!wall) throw new Error('buildRegionOuterWall returned undefined (flag off?)');
  const cpuMs = Math.round(cpuUsage(c0).user / 1000);
  const ut = packedToUt(wall.vertices);
  const lifted = liftUtToRadial(ut, rA, H).vertices;
  const idx = wall.indices;
  const tris = idx.length / 3, verts = ut.length / 2;
  plog(`[${arm.key}] meshed ${tris} tris / ${verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s (cpu ${cpuMs}ms); bottomRing=${wall.bottomRing.length} topRing=${wall.topRing.length}`);

  const nonMan = auditNonManByIndex(lifted, idx);
  const raw = nonManRawBigStats(idx);
  const census = censusPositionWeld(lifted, ut, idx);
  plog(`[${arm.key}] nonMan(pos-weld)=${nonMan} raw-index{nonMan=${raw.nonMan},boundary=${raw.boundary}} census{nonMan=${census.nonMan},boundary=${census.boundary}} expectBoundary=${2 * NRING}`);
  for (const e of census.nmEdges) plog(`[${arm.key}]  NM-EDGE ${e.where} a=(u${e.aUt[0]},t${e.aUt[1]},z${e.aZ}) b=(u${e.bUt[0]},t${e.bUt[1]},z${e.bZ}) mult=${e.mult} tris=${JSON.stringify(e.triCentroids)}`);

  const q = triangleQualityDistribution({ vertices: lifted, indices: idx });
  // CHEAP true-3D MAX: perFaceTrue3DSag pre-filters by the same-(u,t) UB and projects only the tail with single-seed
  // GN — HONEST on GeoStar (riser/revolution, gnOver=0 per registry). The slow global-projector measureProjectorMax
  // (task's specified ruler) is gated behind PF_GSSEAM_FULL for the authoritative final confirm (it AGREES on GeoStar).
  const tT = Date.now();
  const t3 = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.02 });
  const sorted = Float64Array.from(t3.faceErr).sort();
  const t3Max = +t3.worstMm.toFixed(6), t3P99 = pct(sorted, 0.99), t3P999 = pct(sorted, 0.999);
  plog(`[${arm.key}] perFaceTrue3DSag ${((Date.now() - tT) / 1000).toFixed(1)}s: max=${t3Max} p99=${t3P99} p99.9=${t3P999}`);
  let pmMax = -1, pmChord = -1, pmVtx = -1, pmP99 = -1;
  if (process.env.PF_GSSEAM_FULL === '1') {
    const pmT = Date.now();
    const pm = await measureProjectorMax({ vertices: lifted, indices: idx }, rA, { H, tolMm: TOL, nTheta: 2048, nZ: 1024 });
    pmMax = +pm.maxMm.toFixed(6); pmChord = +pm.chordMaxMm.toFixed(6); pmVtx = +pm.vertexMaxMm.toFixed(6); pmP99 = +pm.p99Mm.toFixed(6);
    plog(`[${arm.key}] measureProjectorMax ${((Date.now() - pmT) / 1000).toFixed(1)}s: max=${pmMax} chord=${pmChord} vtx=${pmVtx} p99=${pmP99}`);
  }
  const worst = worstFacetsUB(ut, idx, lifted, rA, 8);
  plog(`[${arm.key}] worst-UB facets: ${JSON.stringify(worst)}`);

  if (arm.dump) {
    dumpRenderBins(OUT_DIR, `gsSeam_${arm.key.replace(/[|.]/g, '_')}`, lifted, idx, { meta: { arm: arm.key, tris, nonMan, projMax: pm.maxMm } });
  }

  return {
    key: arm.key, style: 'GeometricStar', emitter: 'buildRegionOuterWall(rim-pin weld)', note: arm.note,
    tolMm: arm.tolMm, hMin: arm.hMin, maxPoints: arm.maxPoints, tris, verts, cpuMs,
    bottomRing: wall.bottomRing.length, topRing: wall.topRing.length, expectBoundary: 2 * NRING,
    nonManPosWeld: nonMan, rawNonMan: raw.nonMan, rawBoundary: raw.boundary,
    censusNonMan: census.nonMan, censusBoundary: census.boundary, censusEdges: census.edges,
    nmEdges: census.nmEdges,
    t3Max, t3P99, t3P999, projMax: pmMax, projChord: pmChord, projVtx: pmVtx, projP99: pmP99,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3),
    worstUB: worst,
    verdict: (t3Max <= TOL && nonMan === 0 && census.boundary === 2 * NRING) ? 'CLOSED<=0.01+watertight' : `nonMan=${nonMan} t3Max=${t3Max.toFixed(3)}`,
  };
}

// ─────────────────────── CONTROL: no-rim-pin kernel (confirms the weld is the culprit) ───────────────────────
function runControlNoRimPin(tolMm: number, hMin: number, maxPoints: number): Record<string, unknown> {
  const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
  const o: MetricMeshOpts = {
    tolMm, hMin, hMax: 1.0, sizeRes: 128, gradeBeta: 0.2, maxPoints,
    chordTolMm: tolMm, guardManifoldAlways: true, // NO rimPinRing ⇒ distinct u=0/u=1 columns, no index-weld
  };
  const t0 = Date.now();
  const mesh = buildMetricMesh(rA, H, o);
  const ut = mesh.ut, idx = mesh.indices;
  const lifted = liftUtToRadial(ut, rA, H).vertices;
  const tris = idx.length / 3;
  const nonMan = auditNonManByIndex(lifted, idx);
  const census = censusPositionWeld(lifted, ut, idx);
  plog(`[ctrl-norimpin] tris=${tris} in ${((Date.now() - t0) / 1000).toFixed(1)}s nonMan(pos-weld)=${nonMan} census.nonMan=${census.nonMan} boundary=${census.boundary}`);
  for (const e of census.nmEdges) plog(`[ctrl-norimpin]  NM-EDGE ${e.where} a=(u${e.aUt[0]},t${e.aUt[1]}) b=(u${e.bUt[0]},t${e.bUt[1]}) mult=${e.mult}`);
  return {
    key: 'ctrl-norimpin', emitter: 'buildMetricMesh(NO rim-pin)', tolMm, hMin, maxPoints, tris,
    nonManPosWeld: nonMan, censusNonMan: census.nonMan, censusBoundary: census.boundary,
    nmEdges: census.nmEdges,
    verdict: nonMan === 0 ? 'NO-DEFECT (weld is the culprit)' : `nonMan=${nonMan} (defect not weld-specific)`,
  };
}

describe('GeometricStar rim-pin seam-weld — root-cause + fix verify (H120/Rb45/Rt70/expn1.1)', () => {
  (globalThis as unknown as { __pfRegionLayer?: boolean; __pfPerfectMesher?: boolean }).__pfRegionLayer = true;
  (globalThis as unknown as { __pfPerfectMesher?: boolean }).__pfPerfectMesher = true;

  // 1) REPRO (moderate density — cheapest reproduction of the nonMan defect). ~6M tris.
  it.skipIf(process.env.PF_GSSEAM_REPRO !== '1')('REPRO tol0.004/p3M — reproduce + locate nonMan', async () => {
    const arm: Arm = { key: 'repro|tol0.004|p3M', tolMm: 0.004, hMin: 0.04, maxPoints: 3_000_000, dump: true, note: 'moderate repro of the rim-pin seam-weld nonMan' };
    if (keyExists(WIT, arm.key)) { plog(`[skip] ${arm.key}`); return; }
    append(await runRegion(arm));
  }, 6_000_000);

  // 2) CONTROL — same density, NO rim-pin: expect nonMan 0 ⇒ the weld is the culprit.
  it.skipIf(process.env.PF_GSSEAM_CTRL !== '1')('CONTROL no-rim-pin tol0.004/p3M — weld isolation', () => {
    if (keyExists(WIT, 'ctrl-norimpin')) { plog('[skip] ctrl-norimpin'); return; }
    append(runControlNoRimPin(0.004, 0.04, 3_000_000));
  }, 6_000_000);

  // 3) PROD — exact scorecard config (tol0.003 / 5M cap ⇒ ~10M tris). The expensive confirm/verify via the REAL
  //    production path (buildRegionOuterWall) — the authoritative build+prove of the src fix.
  it.skipIf(process.env.PF_GSSEAM_PROD !== '1')('PROD tol0.003/p5M — scorecard-config confirm/verify (real path)', async () => {
    const arm: Arm = { key: 'prod|tol0.003|p5M', tolMm: 0.003, hMin: 0.04, maxPoints: 5_000_000, dump: false, note: 'exact E-HARDCARD prod config (buildRegionOuterWall)' };
    if (keyExists(WIT, arm.key)) { plog(`[skip] ${arm.key}`); return; }
    append(await runRegion(arm));
  }, 18_000_000);

  // 4) DUMP — build the FLAT kernel mesh (pre-pack) ONCE at prod config via buildMetricMesh(rimPinRing) and dump it,
  //    so the cheap ANALYZE unit can test both packings without a rebuild. Same flat mesh buildMetricOuterWall packs.
  it.skipIf(process.env.PF_GSSEAM_DUMP !== '1')('DUMP flat kernel mesh (prod tol0.003/p5M) — build once', () => {
    if (existsSync(FLAT_UT) && existsSync(FLAT_IDX) && keyExists(WIT, 'dump|flat')) { plog('[skip] dump'); return; }
    const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
    const t0 = Date.now();
    const mesh = buildMetricMesh(rA, H, {
      tolMm: 0.003, hMin: 0.04, hMax: 1.0, sizeRes: 128, gradeBeta: 0.2, maxPoints: 5_000_000,
      chordTolMm: 0.003, guardManifoldAlways: true, rimPinRing: NRING,
    });
    const ut = mesh.ut, idx = mesh.indices;
    plog(`[dump] flat mesh ${idx.length / 3} tris / ${ut.length / 2} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s rounds=${mesh.rounds} hitBudget=${mesh.hitBudget}`);
    const utF = Float64Array.from(ut);
    writeFileSync(FLAT_UT, Buffer.from(utF.buffer, utF.byteOffset, utF.byteLength));
    const idxU = idx instanceof Uint32Array ? idx : Uint32Array.from(idx);
    writeFileSync(FLAT_IDX, Buffer.from(idxU.buffer, idxU.byteOffset, idxU.byteLength));
    append({ key: 'dump|flat', tris: idx.length / 3, verts: ut.length / 2, rounds: mesh.rounds, hitBudget: mesh.hitBudget, note: 'flat kernel mesh dumped (rimPinRing=2048, pre-pack)' });
  }, 18_000_000);

  // 5) ANALYZE — load the dumped flat mesh, pack with the CURRENT (RING_EPS=1e-6) vs FIX (1e-9) collection band, and
  //    census both: LOCATE the nonMan edges (old) and prove the fix (nonMan 0). Measure MAX on the fix packing.
  it.skipIf(process.env.PF_GSSEAM_ANALYZE !== '1')('ANALYZE dumped flat mesh — old(1e-6) vs fix(1e-9) packing', async () => {
    const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
    const utBuf = readFileSync(FLAT_UT); const utF = new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8);
    const ut = Array.from(utF);
    const idxBuf = readFileSync(FLAT_IDX); const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, Math.floor(idxBuf.byteLength / 4));
    plog(`[analyze] loaded flat ${idx.length / 3} tris / ${ut.length / 2} verts`);
    for (const [tag, eps] of [['old', 1e-6], ['fix', 1e-9]] as const) {
      if (keyExists(WIT, `analyze|${tag}`)) { plog(`[skip] analyze|${tag}`); continue; }
      const t0 = Date.now();
      const wall = packMetricMesh(ut, idx, NRING, eps);
      if (wall.threw) { plog(`[analyze ${tag} eps=${eps}] PACK THREW: ${wall.threw}`); append({ key: `analyze|${tag}`, eps, threw: wall.threw }); continue; }
      const putt = packedToUt(wall.vertices);
      const lifted = liftUtToRadial(putt, rA, H).vertices;
      const nonMan = auditNonManByIndex(lifted, wall.indices);
      const census = censusPositionWeld(lifted, putt, wall.indices);
      plog(`[analyze ${tag} eps=${eps}] col0=${wall.col0} col1=${wall.col1} bottomRing=${wall.bottomRing.length} topRing=${wall.topRing.length} nonMan=${nonMan} census.boundary=${census.boundary} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      for (const e of census.nmEdges) plog(`[analyze ${tag}]  NM-EDGE ${e.where} a=(u${e.aUt[0]},t${e.aUt[1]},z${e.aZ}) b=(u${e.bUt[0]},t${e.bUt[1]},z${e.bZ}) mult=${e.mult} tris=${JSON.stringify(e.triCentroids)}`);
      const worst = worstFacetsUB(putt, wall.indices, lifted, rA, 10);
      plog(`[analyze ${tag}] worst-UB: ${JSON.stringify(worst)}`);
      // CHEAP true-3D MAX on BOTH packings (perFaceTrue3DSag, honest on GeoStar). Shows whether the mis-weld stray
      // facets dominate the MAX (old) vs the residual after the fix. Optional authoritative measureProjectorMax on fix.
      const t3 = perFaceTrue3DSag(putt, wall.indices, rA, H, { preFilterMm: 0.02 });
      const s3 = Float64Array.from(t3.faceErr).sort();
      const t3Max = +t3.worstMm.toFixed(6), t3P99 = pct(s3, 0.99), t3P999 = pct(s3, 0.999);
      plog(`[analyze ${tag}] perFaceTrue3DSag max=${t3Max} p99=${t3P99} p99.9=${t3P999}`);
      let projMax = -1, projP99 = -1, projVtx = -1, projChord = -1;
      if (tag === 'fix' && process.env.PF_GSSEAM_FULL === '1') {
        const pm = await measureProjectorMax({ vertices: lifted, indices: wall.indices }, rA, { H, tolMm: TOL, nTheta: 2048, nZ: 1024 });
        projMax = +pm.maxMm.toFixed(6); projP99 = +pm.p99Mm.toFixed(6); projVtx = +pm.vertexMaxMm.toFixed(6); projChord = +pm.chordMaxMm.toFixed(6);
        plog(`[analyze fix] measureProjectorMax max=${projMax} chord=${projChord} vtx=${projVtx} p99=${projP99}`);
      }
      append({ key: `analyze|${tag}`, eps, col0: wall.col0, col1: wall.col1, bottomRing: wall.bottomRing.length, topRing: wall.topRing.length, nonMan, censusBoundary: census.boundary, expectBoundary: 2 * NRING, nmEdges: census.nmEdges, worstUB: worst, t3Max, t3P99, t3P999, projMax, projP99, projVtx, projChord });
    }
  }, 18_000_000);

  // 6) DIAG — the census REFUTED the seam-weld hypothesis (nonMan 3 is INTERIOR, identical old vs fix). Dissect the
  //    3 fold spots on the FLAT (pre-pack) mesh: raw-INDEX nonMan (index fold vs position-weld artifact), and every
  //    vertex + triangle in a tiny (u,t) window around each spot, so we SEE the near-degenerate overlap structure.
  it.skipIf(process.env.PF_GSSEAM_DIAG !== '1')('DIAG flat mesh — raw nonMan + dissect the 3 fold spots', () => {
    const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
    const utBuf = readFileSync(FLAT_UT); const utF = new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8);
    const idxBuf = readFileSync(FLAT_IDX); const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, Math.floor(idxBuf.byteLength / 4));
    const nV = utF.length / 2, nT = idx.length / 3;
    plog(`[diag] flat ${nT} tris / ${nV} verts`);
    // raw-INDEX nonMan (no position weld) — distinguishes a genuine index fold from a position-weld artifact.
    const raw = nonManRawBigStats(idx);
    plog(`[diag] RAW-INDEX nonMan=${raw.nonMan} boundary=${raw.boundary} edges=${raw.edges}`);
    // degenerate (repeated-index) triangle count in the flat mesh.
    let degen = 0;
    for (let t = 0; t < nT; t++) { const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2]; if (a === b || b === c || a === c) degen++; }
    plog(`[diag] repeated-index degenerate tris=${degen}`);
    // Dissect each fold spot: every vertex + triangle in a tiny (u,t) window.
    const spots = [{ u: 0.258088, t: 0.051371 }, { u: 0.720835, t: 0.314001 }];
    const DU = 6e-4, DT = 6e-4;
    for (const sp of spots) {
      const vs: Array<{ i: number; u: number; t: number; x: number; y: number; z: number }> = [];
      for (let i = 0; i < nV; i++) {
        const u = utF[2 * i], t = utF[2 * i + 1];
        if (Math.abs(u - sp.u) < DU && Math.abs(t - sp.t) < DT) {
          const th = TAU * u, z = t * H, r = rA(th, z);
          vs.push({ i, u: +u.toFixed(7), t: +t.toFixed(7), x: +(r * Math.cos(th)).toFixed(5), y: +(r * Math.sin(th)).toFixed(5), z: +z.toFixed(5) });
        }
      }
      plog(`[diag spot u${sp.u} t${sp.t}] ${vs.length} verts in window: ${JSON.stringify(vs)}`);
      // pairwise min 3D distance among the window verts (near-duplicate detector).
      let minD = Infinity, mi = -1, mj = -1;
      for (let a = 0; a < vs.length; a++) for (let b = a + 1; b < vs.length; b++) {
        const d = Math.hypot(vs[a].x - vs[b].x, vs[a].y - vs[b].y, vs[a].z - vs[b].z);
        if (d < minD) { minD = d; mi = vs[a].i; mj = vs[b].i; }
      }
      plog(`[diag spot u${sp.u}] min 3D vertex-vertex dist in window = ${minD.toExponential(3)}mm between idx ${mi},${mj}`);
      const win = new Set(vs.map((v) => v.i));
      const tris: Array<{ t: number; abc: number[] }> = [];
      for (let t = 0; t < nT && tris.length < 24; t++) {
        const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
        if (win.has(a) || win.has(b) || win.has(c)) tris.push({ t, abc: [a, b, c] });
      }
      plog(`[diag spot u${sp.u}] incident tris (idx triples): ${JSON.stringify(tris)}`);
    }
  }, 3_600_000);

  // 7) TESTFIX — the ROOT cause is near-COINCIDENT vertices (7e-5mm apart; dedup-miss + smoothing collisions) that
  //    auditNonManByIndex position-welds (1e-4mm) into mult-4 folds (2 coincident triangle PAIRS). Test the correct
  //    fix on the PACKED mesh: 3D position-weld at tol (⊇ the audit's 1e-4mm) + drop degenerate + dedup DUPLICATE
  //    faces. Expect nonMan 0 with fidelity (MAX) unchanged. Sweep tol to find the safe value (over-merge = folds).
  it.skipIf(process.env.PF_GSSEAM_TESTFIX !== '1')('TESTFIX packed mesh — 3D weld + dedup faces → nonMan 0', async () => {
    const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
    const utBuf = readFileSync(FLAT_UT); const utF = new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8);
    const ut0 = Array.from(utF);
    const idxBuf = readFileSync(FLAT_IDX); const idx0 = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, Math.floor(idxBuf.byteLength / 4));
    const wall0 = packMetricMesh(ut0, idx0, NRING, 1e-9); // seam-welded packed mesh (the production output)
    const putt0 = packedToUt(wall0.vertices);
    const lifted0 = liftUtToRadial(putt0, rA, H).vertices;
    plog(`[testfix] packed base: ${wall0.indices.length / 3} tris, nonMan=${auditNonManByIndex(lifted0, wall0.indices)}`);
    for (const tolMm of [1.5e-4, 3e-4]) {
      const t0 = Date.now();
      const { ut, indices, merged, degen, dup } = weldCoincidentClean(putt0, lifted0, wall0.indices, tolMm);
      const lifted = liftUtToRadial(ut, rA, H).vertices;
      const nonMan = auditNonManByIndex(lifted, indices);
      const census = censusPositionWeld(lifted, ut, indices);
      const raw = nonManRawBigStats(indices);
      plog(`[testfix tolMm=${tolMm}] merged ${merged} verts / dropped ${degen} degen + ${dup} dup faces in ${((Date.now() - t0) / 1000).toFixed(1)}s ⇒ tris ${wall0.indices.length / 3}->${indices.length / 3}`);
      plog(`[testfix tolMm=${tolMm}] nonMan(pos)=${nonMan} census.nonMan=${census.nonMan} raw.nonMan=${raw.nonMan} raw.boundary=${raw.boundary} census.boundary=${census.boundary} expect=${2 * NRING}`);
      for (const e of census.nmEdges.slice(0, 5)) plog(`[testfix ${tolMm}] RESIDUAL NM ${e.where} a=(u${e.aUt[0]},t${e.aUt[1]}) b=(u${e.bUt[0]},t${e.bUt[1]}) mult=${e.mult}`);
      const q = triangleQualityDistribution({ vertices: lifted, indices });
      const t3 = perFaceTrue3DSag(ut, indices, rA, H, { preFilterMm: 0.02 });
      const s3 = Float64Array.from(t3.faceErr).sort();
      const t3Max = +t3.worstMm.toFixed(6), t3P99 = pct(s3, 0.99);
      plog(`[testfix tolMm=${tolMm}] perFaceTrue3DSag max=${t3Max} p99=${t3P99} pctBelow20=${q.pctBelow20.toFixed(2)} minAngle=${q.minAngleDeg.toFixed(3)}`);
      append({ key: `testfix|tol${tolMm}`, tolMm, merged, degen, dup, tris: indices.length / 3, nonMan, rawNonMan: raw.nonMan, rawBoundary: raw.boundary, censusBoundary: census.boundary, expectBoundary: 2 * NRING, t3Max, t3P99, pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), verdict: (nonMan === 0 && raw.boundary === 2 * NRING) ? 'WATERTIGHT (fix works)' : `nonMan=${nonMan}` });
    }
  }, 3_600_000);

  // 8) WORST — the decisive MAX-mechanism probe: are the worst facets UNDER-REFINED (edges ≫ hMin ⇒ budget-starved,
  //    density-responsive) or CLIFF-BRIDGING (edges ≈ hMin with a big radius spread ⇒ the documented GeoStar
  //    chevron-cliff class, density-IRREDUCIBLE)? Cheap: reuses the dumped flat mesh, no rebuild.
  it.skipIf(process.env.PF_GSSEAM_WORST !== '1')('WORST — MAX mechanism (under-refined vs cliff-bridging)', () => {
    const rA = buildAnalyticRadiusFn('GeometricStar' as StyleId, {} as StyleOptions, DIMS);
    const utBuf = readFileSync(FLAT_UT); const utF = new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8);
    const ut0 = Array.from(utF);
    const idxBuf = readFileSync(FLAT_IDX); const idx0 = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, Math.floor(idxBuf.byteLength / 4));
    const wall = packMetricMesh(ut0, idx0, NRING, 1e-9);
    const putt = packedToUt(wall.vertices);
    const lifted = liftUtToRadial(putt, rA, H).vertices;
    const t3 = perFaceTrue3DSag(putt, wall.indices, rA, H, { preFilterMm: 0.02 });
    const s3 = Float64Array.from(t3.faceErr).sort();
    plog(`[worst] true-3D max=${t3.worstMm.toFixed(6)} p99=${pct(s3, 0.99)} p99.9=${pct(s3, 0.999)} over0.01=${(100 * t3.fracOver(0.01)).toFixed(3)}% over0.1=${(100 * t3.fracOver(0.1)).toFixed(4)}%`);
    const mech = worstFacetMechanism(putt, wall.indices, lifted, t3.faceErr, 20);
    for (const m of mech) plog(`[worst] ${JSON.stringify(m)}`);
    // How many facets carry the tail, and are they at the hMin sizing floor?
    let nOver01 = 0, nOver1 = 0;
    for (let f = 0; f < t3.faceErr.length; f++) { if (t3.faceErr[f] > 0.01) nOver01++; if (t3.faceErr[f] > 0.1) nOver1++; }
    plog(`[worst] facets >0.01mm: ${nOver01} ; >0.1mm: ${nOver1} (of ${t3.faceErr.length})`);
    append({ key: 'worst|mechanism', tris: t3.faceErr.length, t3Max: +t3.worstMm.toFixed(6), t3P99: pct(s3, 0.99), t3P999: pct(s3, 0.999), nOver01, nOver1, hMinMm: 0.04, worst20: mech });
  }, 3_600_000);
});

/**
 * WORST-FACET MECHANISM probe: for the top-K true-3D-worst facets, report the 3D edge lengths + area + the RADIUS
 * SPREAD across the facet. Decides the MAX mechanism: edges ≫ hMin ⇒ UNDER-REFINED (budget-starved, density-
 * responsive); edges ≈ hMin with a large radius spread ⇒ the facet BRIDGES a near-vertical cliff (the documented
 * GeoStar chevron-cliff class — density-IRREDUCIBLE, needs feature-conforming/anisotropic edges).
 */
function worstFacetMechanism(
  ut: number[], indices: ArrayLike<number>, xyz: ArrayLike<number>, faceErr: Float64Array, K: number,
): Array<Record<string, number>> {
  const nF = indices.length / 3;
  const order = Array.from({ length: nF }, (_, f) => f).sort((a, b) => faceErr[b] - faceErr[a]).slice(0, K);
  const out: Array<Record<string, number>> = [];
  for (const f of order) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const e = (p: number, q: number): number => Math.hypot(xyz[3 * p] - xyz[3 * q], xyz[3 * p + 1] - xyz[3 * q + 1], xyz[3 * p + 2] - xyz[3 * q + 2]);
    const eAB = e(a, b), eBC = e(b, c), eCA = e(c, a);
    const rad = (p: number): number => Math.hypot(xyz[3 * p], xyz[3 * p + 1]);
    const rs = [rad(a), rad(b), rad(c)];
    const ux = xyz[3 * b] - xyz[3 * a], uy = xyz[3 * b + 1] - xyz[3 * a + 1], uz = xyz[3 * b + 2] - xyz[3 * a + 2];
    const vx = xyz[3 * c] - xyz[3 * a], vy = xyz[3 * c + 1] - xyz[3 * a + 1], vz = xyz[3 * c + 2] - xyz[3 * a + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    out.push({
      sag: +faceErr[f].toFixed(4),
      u: +((((ua + ub + uc) / 3) % 1)).toFixed(5), t: +((ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3).toFixed(5),
      maxEdgeMm: +Math.max(eAB, eBC, eCA).toFixed(4), minEdgeMm: +Math.min(eAB, eBC, eCA).toFixed(4),
      areaMm2: +area.toFixed(6), radSpreadMm: +(Math.max(...rs) - Math.min(...rs)).toFixed(4),
    });
  }
  return out;
}

/**
 * The candidate PRODUCTION fix, tested here on the packed mesh: weld near-COINCIDENT vertices by 3D position (robust
 * floor-hash cell=tolMm + 3x3x3 neighbourhood + union-find; tolMm ⊇ the audit's 1e-4mm quantize so the by-index audit
 * sees them merged), then rebuild dropping (a) DEGENERATE faces (repeated index) and (b) DUPLICATE faces (same index
 * triple — the mult-4 folds are 2 coincident triangle pairs ⇒ dedup ⇒ mult-2 ⇒ manifold). Returns compacted (u,t) +
 * indices + the merge/drop counts. tolMm must be ≫ the near-dup gap (7e-5mm) yet ≪ the finest legitimate 3D edge
 * (hMin 0.04mm) so ONLY coincident anomalies merge.
 */
function weldCoincidentClean(ut: number[], xyz: ArrayLike<number>, indices: ArrayLike<number>, tolMm: number): { ut: number[]; indices: Uint32Array; merged: number; degen: number; dup: number } {
  const nV = xyz.length / 3;
  const inv = 1 / tolMm;
  const parent = new Int32Array(nV);
  for (let i = 0; i < nV; i++) parent[i] = i;
  const find = (i: number): number => { let r = i; while (parent[r] !== r) r = parent[r]; while (parent[i] !== r) { const n = parent[i]; parent[i] = r; i = n; } return r; };
  const grid = new Map<string, number[]>();
  const key = (a: number, b: number, c: number): string => `${a}_${b}_${c}`;
  let merged = 0;
  for (let i = 0; i < nV; i++) {
    const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
    const cx = Math.floor(x * inv), cy = Math.floor(y * inv), cz = Math.floor(z * inv);
    let rep = -1;
    for (let dx = -1; dx <= 1 && rep < 0; dx++) for (let dy = -1; dy <= 1 && rep < 0; dy++) for (let dz = -1; dz <= 1 && rep < 0; dz++) {
      const b = grid.get(key(cx + dx, cy + dy, cz + dz));
      if (b) for (const j of b) { const dxx = xyz[3 * j] - x, dyy = xyz[3 * j + 1] - y, dzz = xyz[3 * j + 2] - z; if (dxx * dxx + dyy * dyy + dzz * dzz < tolMm * tolMm) { rep = j; break; } }
    }
    if (rep >= 0) { if (find(rep) !== find(i)) { parent[find(i)] = find(rep); merged++; } }
    else { const k = key(cx, cy, cz); const b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]); }
  }
  // compact representatives
  const oldToNew = new Int32Array(nV).fill(-1); let n = 0;
  for (let i = 0; i < nV; i++) { const r = find(i); if (oldToNew[r] < 0) oldToNew[r] = n++; }
  const outUt = new Array<number>(n * 2);
  for (let i = 0; i < nV; i++) { const r = find(i); const ni = oldToNew[r]; outUt[2 * ni] = ut[2 * r]; outUt[2 * ni + 1] = ut[2 * r + 1]; }
  // A DUPLICATE face can only arise where vertices were merged, so flag the representatives that absorbed a merge and
  // run the (string-keyed, exact) duplicate check ONLY on faces touching one. Keeps the key set tiny and avoids the
  // 2^53 overflow a packed 3-index numeric key would hit at n≈5M.
  const touched = new Uint8Array(n);
  for (let i = 0; i < nV; i++) { const r = find(i); if (r !== i) touched[oldToNew[r]] = 1; }
  const nT = indices.length / 3;
  const outIdx: number[] = []; let degen = 0, dup = 0;
  const seenFace = new Set<string>();
  for (let f = 0; f < nT; f++) {
    const a = oldToNew[find(indices[3 * f])], b = oldToNew[find(indices[3 * f + 1])], c = oldToNew[find(indices[3 * f + 2])];
    if (a === b || b === c || a === c) { degen++; continue; }
    if (touched[a] || touched[b] || touched[c]) {
      let s0 = a, s1 = b, s2 = c;
      if (s0 > s1) { const t = s0; s0 = s1; s1 = t; } if (s1 > s2) { const t = s1; s1 = s2; s2 = t; } if (s0 > s1) { const t = s0; s0 = s1; s1 = t; }
      const fk = `${s0}_${s1}_${s2}`;
      if (seenFace.has(fk)) { dup++; continue; }
      seenFace.add(fk);
    }
    outIdx.push(a, b, c);
  }
  return { ut: outUt, indices: Uint32Array.from(outIdx), merged, degen, dup };
}
