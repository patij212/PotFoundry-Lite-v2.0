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
import { scoreWholeMeshBVH, loadBinMesh } from './_pf_bvhRuler';

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

// ── score one mesh under the EXACT V10b ruler + report sheet/lip class of the outliers. ─
function scoreMesh(
  key: string, arm: string, nTh: number, nZband: number, tris: number,
  xyz: Float32Array, idx: Uint32Array, rowKind: Int8Array | null,
): void {
  const t0 = Date.now();
  const r = scoreWholeMeshBVH(xyz, idx, buildRadiusFn('DragonScales' as StyleId, {}, DIMS), H, TWIN, {
    tol: TOL, stride: 1, cell: CELL, radialPrefilter: true,
    shard: SHARD ?? undefined, twinValidate: SHARD && SHARD.k > 0 ? 'sub' : 'full',
    onProgress: (d, tot, no, w) => { if (Math.floor(d / tot * 20) !== Math.floor((d - 1) / tot * 20)) plog(`[${key}] ${Math.floor(d / tot * 100)}% out=${no} worst=${w.toFixed(5)} ${((Date.now() - t0) / 1000).toFixed(0)}s`); },
  });
  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nm = auditNonManRaw(idx);
  const za = zeroAreaCount(xyz, idx);
  const closes = r.interiorOutliers === 0 && nm.nonMan === 0 && za === 0 && q.pctBelow20 < 10 && tris < 6_000_000;
  const row: Record<string, unknown> = {
    key, arm, style: 'DragonScales', nTh, nZband, tris,
    twinTris: r.twinTris, twinOnSurfMaxMm: +r.twinOnSurfMaxMm.toFixed(6),
    interiorOutliers: r.interiorOutliers, wholeMeshMaxMm: r.wholeMeshMaxMm, p50: r.p50, p90: r.p90, p99: r.p99,
    worstXyz: r.worstXyz, pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: nm.nonMan, auditEdges: nm.edges, zeroArea: za, closes,
    ruler: 'whole-mesh dense radial twin BVH every-facet 45pt, radial prefilter, no screen (EXACT V10b basis)',
    scoreMs: Date.now() - t0,
  };
  checkpoint(row);
  plog(`[${key}] out=${r.interiorOutliers} max=${r.wholeMeshMaxMm} p99=${r.p99} twinOnSurf=${r.twinOnSurfMaxMm} %<20=${q.pctBelow20.toFixed(2)} rawNM=${nm.nonMan} za=${za} tris=${tris} CLOSES=${closes} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  void rowKind;
}

describe('DS-ZDENSITY — DragonScales sheet-z-density sweep under the V10b dense-basis ruler', () => {
  it.skipIf(process.env.PF_DS_ZDENS !== '1')('anchor re-score + nZband sweep', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);

    // (0) ANCHOR: re-score the production best20 mesh under THIS probe's exact ruler call — must reproduce
    //     the V10b 263,536 / 0.0463 (instrument-match gate). If this row disagrees the sweep is on a bad basis.
    if (!keyExists('anchor_best20')) {
      const xp = join(BEST20, 'DragonScales.xyz.bin'), ip = join(BEST20, 'DragonScales.idx.bin');
      if (existsSync(xp) && existsSync(ip)) {
        const m = loadBinMesh(xp, ip);
        plog(`[anchor] best20 mesh tris=${m.idx.length / 3} — re-scoring under V10b ruler...`);
        scoreMesh('anchor_best20', 'anchor', 0, 0, m.idx.length / 3, m.xyz, m.idx, null);
      } else { plog(`[anchor] MISSING best20 bins at ${xp}`); }
    }

    // (1) SWEEP: doubled-rings structured mesh, fixed nTh=2400, treadCap=4, nZband in {30,50,70,90,110}.
    //     nTh=2400 gives serration margin (per _cu_dslip_close); the lever under test is nZband (sheet z-density).
    const NTH = 2400, TREADCAP = 4;
    for (const nZband of [30, 50, 70, 90, 110]) {
      const key = `dr_nTh${NTH}_nZ${nZband}`;
      if (keyExists(key)) { plog(`[skip] ${key} exists`); continue; }
      const t0 = Date.now();
      const rows = buildRows(rA, dragonRings(), NTH, nZband, TREADCAP);
      const mesh = buildStructuredWall(rA, H, rows);
      const { xyz, idx } = toF32(mesh);
      plog(`[${key}] built ${mesh.nF} tris (${(Date.now() - t0) / 1000}s) — scoring...`);
      scoreMesh(key, 'doubled-rings-zsweep', NTH, nZband, mesh.nF, xyz, idx, null);
    }
    expect(true).toBe(true);
  }, 5 * 60 * 60 * 1000);
});
