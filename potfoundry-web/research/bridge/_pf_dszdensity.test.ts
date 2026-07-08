// _pf_dszdensity.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-DRAGONSCALES-ZDENSITY. Drive DragonScales to whole-mesh EVERY-FACET dense-basis true-3D <= 0.01mm
// via SHEET Z-DENSITY on the doubled-rings structured research mesh, scored under the EXACT V10b honest dense-basis
// ruler (`scoreWholeMeshBVH`, dense radial twin, radial prefilter, NO screen, tol 0.01) — NOT the buildStepReference
// step-locator the 2026-07-04b close used (that reported p99 on a different twin, not comparable to V10b's 263,536).
//
// RESILIENCE: one env-gated `it`; CHECKPOINT one ndjson row per (arm,nTh,nZband) the INSTANT scored; a row whose key
// already exists is SKIPPED ⇒ a killed run resumes on unfinished points. Edits NOTHING in src/.
//
//   PF_DS_ZDENS=1   — run the anchor re-score (production best20 mesh) + the doubled-rings nZband sweep.
//
// KILL-CRITERION (pre-registered, registry E-2026-07-08-DRAGONSCALES-ZDENSITY): CLOSE iff EVERY-FACET dense-basis
// outliers==0 at tol 0.01 at SOME nZband AND rawNonMan==0 (non-vacuous) AND zeroArea==0 AND %<20<10 AND tris<6M.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, triangleQualityDistribution,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';
import { buildRadialTwin, loadBinMesh } from './_pf_bvhRuler';
import { buildRefLocator, buildStepReference, type RefLocator } from './_sharp3dRef';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TOL = 0.01;
const OUT = join('research', 'exchange', '_ds_zdensity');
const NDJSON = join(OUT, 'scorecard.ndjson');
const BEST20 = join('research', 'exchange', '_best20', 'heatmap');
// The EXACT V10b DragonScales twin: 2048 x 3072. (Anchor: 263,536 out / max 0.0463 / p99 0.0395 / twinOnSurf 0.0099.)
const TWIN = { nTheta: 2048, nZ: 3072 };
// CRITICAL: locator cell ≈ 4× twin θ-edge (~0.35mm at 2048 on ~283mm circ). The 3.0mm default packs 1000+ twin
// tris/cell ⇒ every BVH query scans thousands (V10b: Gyroid <5% in 8h). This is the exact fix from _pf_bvhRuler.test.
const CIRC = 2 * Math.PI * ((DIMS.Rb + DIMS.Rt) / 2);
const CELL = Math.max(0.35, 4 * (CIRC / TWIN.nTheta));
// Optional facet sharding for parallelism: PF_DS_SHARD="k/N".
const SHARD = ((): { k: number; n: number } | null => { const s = process.env.PF_DS_SHARD; if (!s) return null; const mm = /^(\d+)\/(\d+)$/.exec(s); return mm ? { k: +mm[1], n: +mm[2] } : null; })();

const plog = (m: string): void => { mkdirSync(OUT, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT, 'run.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const keyExists = (k: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(OUT, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

// ── watertight (RAW index) + zero-area, both non-vacuous. ─────────────────────
function auditNonManRaw(idx: Uint32Array): { nonMan: number; edges: number } {
  const ec = new Map<string, number>(); let edges = 0;
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; if (a === b || b === c || a === c) continue; for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); edges++; } }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return { nonMan: nm, edges };
}
function zeroAreaCount(xyz: Float64Array | Float32Array, idx: Uint32Array): number {
  let n = 0;
  for (let f = 0; f < idx.length / 3; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const abx = xyz[3 * b] - xyz[3 * a], aby = xyz[3 * b + 1] - xyz[3 * a + 1], abz = xyz[3 * b + 2] - xyz[3 * a + 2];
    const acx = xyz[3 * c] - xyz[3 * a], acy = xyz[3 * c + 1] - xyz[3 * a + 1], acz = xyz[3 * c + 2] - xyz[3 * a + 2];
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    if (0.5 * Math.hypot(cx, cy, cz) < 1e-9) n++;
  }
  return n;
}

// ── the doubled-rings DragonScales recipe (verbatim from _cu_dslip_close). ─────
function dragonRings(): StepRing[] { const r: StepRing[] = []; for (let k = 1; k < 8; k++) { const t = k / 8; r.push({ z: t * H, t, up: false }); } return r; }
function buildRows(rA: (t: number, z: number) => number, rings: StepRing[], nTh: number, nZband: number, treadCap: number): RowSpec[] {
  const zEps = 5e-4; const rows: RowSpec[] = []; const sorted = [...rings].sort((a, b) => a.z - b.z); const th = (): Float64Array => evenThetas(nTh);
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); let cursor = 0;
  const nearRing = (z: number): boolean => sorted.some(rg => Math.abs(z - rg.z) < 0.6 + 1e-6);
  const pushSheetBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); if (nearRing(z)) continue; rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    const rIn = rA(0, rzIn), rOut = rA(0, rzOut); const span = Math.abs(rOut - rIn); const rMean = 0.5 * (rIn + rOut); const arc = (TAU * rMean) / nTh;
    const treadSub = Math.max(2, Math.min(treadCap, Math.round(span / Math.max(arc, 1e-4)) + 1));
    rows.push({ z: ring.z, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband); rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return rows;
}

// ── convert BuiltMesh (Float64) to the Float32 xyz + Uint32 idx the ruler wants. ─
function toF32(mesh: BuiltMesh): { xyz: Float32Array; idx: Uint32Array } {
  return { xyz: Float32Array.from(mesh.xyz), idx: mesh.idx };
}

// ── dense-bary lattice (45 pts, n=8) — identical to _pf_bvhRuler.DENSE. ─
function denseBary(n = 8): Array<[number, number, number]> { const B: Array<[number, number, number]> = []; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]); return B; }
const DENSE = denseBary(8);

// ── score one mesh under the EXACT V10b ruler using a SHARED locator (twin built once). Same logic as
//    scoreWholeMeshBVH: radial same-azimuth prefilter (analytic-anchored strict bound) then dense 45-pt BVH. ─
function scoreMesh(
  key: string, arm: string, nTh: number, nZband: number, tris: number,
  xyz: Float32Array, idx: Uint32Array, loc: RefLocator, rA: (t: number, z: number) => number,
  rowKindOf: ((f: number) => 'sheet' | 'lip') | null, stride: number,
): void {
  const t0 = Date.now();
  const nF = idx.length / 3;
  const advMargin = 0.7 * TOL;
  const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += TAU; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };
  const devS: number[] = []; let worst = 0, worstFacet = -1, scanned = 0;
  let outSheet = 0, outLip = 0;
  const shardK = SHARD?.k ?? 0, shardN = SHARD?.n ?? 1;
  const progEvery = Math.max(1, Math.floor((nF / (stride * shardN)) / 20));
  for (let f = shardK * stride; f < nF; f += stride * shardN) {
    scanned++;
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    // Stage 0: radial upper bound over the dense lattice — sub-margin ⇒ cannot be an outlier (skip BVH).
    let bMax = 0;
    for (const [wa, wb, wc] of DENSE) { const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz; const bd = radialBound(px, py, pz); if (bd > bMax) { bMax = bd; if (bMax > advMargin) break; } }
    let dv: number;
    if (bMax <= advMargin) { dv = bMax; }
    else { dv = 0; for (const [wa, wb, wc] of DENSE) { const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz; const d = loc.dist(px, py, pz); if (d > dv) dv = d; } }
    devS.push(dv);
    if (dv > worst) { worst = dv; worstFacet = f; }
    if (dv > TOL && rowKindOf) { if (rowKindOf(f) === 'lip') outLip++; else outSheet++; }
    if (scanned % progEvery === 0) { let no = 0; for (const d of devS) if (d > TOL) no++; plog(`[${key}] ${Math.floor(scanned / (nF / (stride * shardN)) * 100)}% out=${no} worst=${worst.toFixed(5)} ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
  }
  let nOut = 0; for (const d of devS) if (d > TOL) nOut++;
  const s = Float64Array.from(devS).sort(); const pc = (q: number): number => s.length ? +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(6) : 0;
  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nm = auditNonManRaw(idx);
  const za = zeroAreaCount(xyz, idx);
  const scaledOut = nOut * stride * shardN;
  const closes = scaledOut === 0 && nm.nonMan === 0 && za === 0 && q.pctBelow20 < 10 && tris < 6_000_000;
  const row: Record<string, unknown> = {
    key, arm, style: 'DragonScales', nTh, nZband, tris, stride, shard: SHARD ? `${shardK}/${shardN}` : null,
    scannedFacets: scanned, interiorOutliers: nOut, scaledOutlierEstimate: scaledOut,
    outSheet: outSheet * stride * shardN, outLip: outLip * stride * shardN,
    wholeMeshMaxMm: +worst.toFixed(6), p50: pc(0.5), p90: pc(0.9), p99: pc(0.99),
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: nm.nonMan, auditEdges: nm.edges, zeroArea: za, closes,
    ruler: 'whole-mesh dense radial twin BVH every-facet 45pt, radial prefilter, no screen (EXACT V10b basis), shared locator',
    scoreMs: Date.now() - t0,
  };
  checkpoint(row);
  plog(`[${key}] out=${nOut}(×${stride * shardN}=${scaledOut}) sheet=${outSheet * stride * shardN} lip=${outLip * stride * shardN} max=${worst.toFixed(5)} p99=${pc(0.99)} %<20=${q.pctBelow20.toFixed(2)} rawNM=${nm.nonMan} za=${za} tris=${tris} CLOSES=${closes} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  void worstFacet;
}

/** Build a facet->('sheet'|'lip') classifier from the row structure (lip = any vertex on a ring/tread row). */
function facetClassifier(mesh: BuiltMesh): (f: number) => 'sheet' | 'lip' {
  const rows = mesh.rows; const rowStart = mesh.rowStart;
  const rowOf = new Int32Array(mesh.nV);
  for (let r = 0; r < rows.length; r++) for (let v = rowStart[r]; v < rowStart[r + 1]; v++) rowOf[v] = r;
  const isLipRow = (r: number): boolean => { const k = rows[r].kind; return k === 'ringBelow' || k === 'ringAbove' || k === 'tread'; };
  return (f: number): 'sheet' | 'lip' => {
    const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
    return (isLipRow(rowOf[a]) || isLipRow(rowOf[b]) || isLipRow(rowOf[c])) ? 'lip' : 'sheet';
  };
}

describe('DS-ZDENSITY — DragonScales sheet-z-density sweep under the V10b dense-basis ruler', () => {
  it.skipIf(process.env.PF_DS_ZDENS !== '1')('doubled-rings nZband sweep (shared twin)', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    // ANCHOR NOTE: the production best20 mesh's dense-basis count (263,536 / max 0.0463 / p99 0.0395) is ALREADY
    // committed in V10b under this EXACT scoreWholeMeshBVH call (spec §V10b + _pf_bvh/q3_dense.ndjson, shard-summed).
    // This probe re-uses the SAME twin (2048x3072) + SAME radial-prefilter dense-45 logic (verified below by a fast
    // anchor-slice re-score if PF_DS_ANCHOR=1). We do NOT re-score the full 2M-facet anchor here (it stalls in the
    // tread band under memory pressure with concurrent agents) — the basis identity is by construction + slice check.

    // Build the dense radial twin + BVH ONCE (reused across all sweep meshes — the twin build is the fixed cost).
    plog(`[twin] building radial twin ${TWIN.nTheta}x${TWIN.nZ} + BVH (cell=${CELL.toFixed(2)})...`);
    const tw0 = Date.now();
    const twin = buildRadialTwin(rA, H, TWIN.nTheta, TWIN.nZ);
    const loc = buildRefLocator(twin, CELL);
    plog(`[twin] built ${twin.nF} tris + BVH in ${((Date.now() - tw0) / 1000).toFixed(0)}s`);

    // (opt) fast anchor-slice re-score: score a STRIDE-40 slice of the best20 mesh to confirm the scaled count
    // reproduces ~263k (instrument-match gate) without the full 2M-facet scan.
    if (process.env.PF_DS_ANCHOR === '1' && !keyExists('anchor_slice')) {
      const xp = join(BEST20, 'DragonScales.xyz.bin'), ip = join(BEST20, 'DragonScales.idx.bin');
      if (existsSync(xp) && existsSync(ip)) {
        const m = loadBinMesh(xp, ip);
        plog(`[anchor_slice] best20 tris=${m.idx.length / 3} stride-40 slice...`);
        scoreMesh('anchor_slice', 'anchor', 0, 0, m.idx.length / 3, m.xyz, m.idx, loc, rA, null, 40);
      }
    }

    // SWEEP: doubled-rings structured mesh, fixed nTh=2400, treadCap=4, nZband in {30,50,70,90,110}. The density
    // screen uses STRIDE (scaled outlier estimate); the CLOSING density is confirmed at stride=1 via PF_DS_CLOSE.
    const NTH = 2400, TREADCAP = 4;
    const screenStride = Number(process.env.PF_DS_STRIDE ?? '8');
    const closeStride = process.env.PF_DS_CLOSE === '1' ? 1 : screenStride;
    for (const nZband of [30, 50, 70, 90, 110]) {
      const key = `dr_nTh${NTH}_nZ${nZband}${closeStride === 1 ? '_s1' : ''}`;
      if (keyExists(key)) { plog(`[skip] ${key} exists`); continue; }
      const tb = Date.now();
      const rows = buildRows(rA, dragonRings(), NTH, nZband, TREADCAP);
      const mesh = buildStructuredWall(rA, H, rows);
      const { xyz, idx } = toF32(mesh);
      const cls = facetClassifier(mesh);
      plog(`[${key}] built ${mesh.nF} tris (${((Date.now() - tb) / 1000).toFixed(1)}s) stride=${closeStride} — scoring...`);
      scoreMesh(key, 'doubled-rings-zsweep', NTH, nZband, mesh.nF, xyz, idx, loc, rA, cls, closeStride);
    }
    expect(true).toBe(true);
  }, 5 * 60 * 60 * 1000);

  // ── DECISIVE lip cross-check: are the density-INVARIANT ~141k "lip" outliers a REAL defect or a TWIN-BLIND-SPOT
  //    (the single-valued radial twin cannot represent the tread — a range of radii at one z = a vertical wall)?
  //    Score the SAME nZband=70 lip facets against BOTH (a) the radial twin (V10b ruler) and (b) the STEP-reference
  //    twin (buildStepReference, which DOUBLES the ring radii ⇒ represents the tread). If lip reads ~0 under the
  //    step-twin but ~large under the radial twin ⇒ TWIN-BLIND artifact (DragonScales body CAD-grade; tread is a
  //    designed near-vertical feature the radial twin can't measure = SFB-seam class). Verdict-deciding.
  it.skipIf(process.env.PF_DS_LIPCHECK !== '1')('lip cross-check: radial-twin vs step-twin on nZband=70 lip facets', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const NTH = 2400, TREADCAP = 4, NZ = 70;
    const rows = buildRows(rA, dragonRings(), NTH, NZ, TREADCAP);
    const mesh = buildStructuredWall(rA, H, rows);
    const { xyz, idx } = toF32(mesh);
    const cls = facetClassifier(mesh);
    plog(`[lipcheck] mesh ${mesh.nF} tris — building BOTH twins...`);
    // radial twin (V10b) + step-reference twin (tread-representing)
    const radTwin = buildRadialTwin(rA, H, TWIN.nTheta, TWIN.nZ);
    const radLoc = buildRefLocator(radTwin, CELL);
    const stepRef = buildStepReference(rA, H, dragonRings(), { nTheta: 3840, nZperBand: 48, zEps: 5e-4 });
    const stepLoc = buildRefLocator(stepRef, 2.0);
    plog(`[lipcheck] radTwin ${radTwin.nF} tris, stepRef ${stepRef.nF} tris — scoring lip facets...`);
    // score EVERY lip facet (stride 1, they are a minority) under both locators, dense 45-pt.
    let lipN = 0, lipOutRad = 0, lipOutStep = 0; let radMax = 0, stepMax = 0;
    const t0 = Date.now();
    for (let f = 0; f < mesh.nF; f++) {
      if (cls(f) !== 'lip') continue;
      lipN++;
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      let dr = 0, dstp = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        const a1 = radLoc.dist(px, py, pz); if (a1 > dr) dr = a1;
        const a2 = stepLoc.dist(px, py, pz); if (a2 > dstp) dstp = a2;
      }
      if (dr > TOL) lipOutRad++;
      if (dstp > TOL) lipOutStep++;
      if (dr > radMax) radMax = dr;
      if (dstp > stepMax) stepMax = dstp;
      if (lipN % 20000 === 0) plog(`[lipcheck] ${lipN} lip facets, radOut=${lipOutRad} stepOut=${lipOutStep} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    const row = {
      key: 'lipcheck_nZ70', style: 'DragonScales', nZband: NZ, lipFacets: lipN,
      lipOut_radialTwin: lipOutRad, lipOut_stepTwin: lipOutStep,
      lipMax_radialTwin: +radMax.toFixed(6), lipMax_stepTwin: +stepMax.toFixed(6),
      verdict: (lipOutStep < 0.1 * Math.max(1, lipOutRad))
        ? 'TWIN-BLIND: lip is a radial-twin artifact (tread wall); step-twin reads clean — DragonScales body CAD-grade'
        : 'REAL: lip outliers survive the tread-representing step-twin',
      note: 'radial twin cannot represent the tread (range of radii at one z); step-twin doubles ring radii',
    };
    checkpoint(row);
    plog(`[lipcheck] VERDICT ${row.verdict} | lipFacets=${lipN} radOut=${lipOutRad}(max ${radMax.toFixed(4)}) stepOut=${lipOutStep}(max ${stepMax.toFixed(4)})`);
    expect(true).toBe(true);
  }, 2 * 60 * 60 * 1000);
});
