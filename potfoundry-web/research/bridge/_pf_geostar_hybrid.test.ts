// _pf_geostar_hybrid.test.ts — DEV-ONLY (PF_GSHYBRID=1). The HYBRID: fix the structured strip pitch to respect the
// chevron sub-pitch (watertight) → THEN localized honest-brute apex refine ONLY on the strip's residual outlier
// tris. Task pre-registered kill-criterion (this header IS the pre-registration; registry row on commit):
//   CONFIRM iff wholeMeshOutliers=0 (every facet, honest 45-pt brute) AND pctBelow20 SINGLE-DIGIT (<~10%) AND
//     zeroAreaFaces=0 AND watertight (auditNonManByIndex non-vacuous).
//   PARTIAL iff 0-outlier + watertight + slicer-safe held but pctBelow20 stays >~10% (report the honest %<20).
//   REFUTE iff the localized apex refine cannot restore 0-outlier without re-needling >~15%, OR the strip cannot be
//     made watertight at sub-pitch.
//
// STAGE A (the task's mandated prerequisite): fix the strip so it stays WATERTIGHT at the sub-pitch. diag1 measured
// crest sub-pitch p50=0.068mm ⇒ max non-overlapping strip half-width ≈ 0.034mm. This stage sweeps h/width/valleyClamp
// on buildStructStrips and reports nonMan (by index, non-vacuous) + pctBelow20. FAST-refute if it cannot reach
// watertight (a non-watertight mesh cannot CONFIRM). Cheap — no long guard until a watertight candidate exists.
//
// ISOLATION: NEW file. Reloads the CONFIRMED wholemesh mesh READ-ONLY. Reuses labkit + _pf_perfectMesherLib +
// _pf_geostarPatchLib + _pf_structStripLib + _pf_crestStripLib(countZeroAreaFaces) + _pf_wholeMeshGuardLib. Writes
// ONLY research/exchange/_pf_geostar_hybrid. Env sub-gate + row-exists skip ⇒ resumable; checkpoint per unit.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { extractProtectedComplex, liftMesh } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { buildStructStrips } from './_pf_structStripLib';
import { countZeroAreaFaces } from './_pf_crestStripLib';

const DIR = join(process.cwd(), 'research', 'exchange', '_pf_geostar_hybrid');
const NDJSON = join(DIR, 'scorecard.ndjson');
const WHOLEMESH_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh', 'refined_mesh.bin');
const BRUTE_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_brute', 'refined_mesh.bin');

const BAYS = Number(process.env.PF_BAYS ?? 5);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 10);
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const N_ROW = 260, N_COL = 260, MIN_AMP = 0.03;

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); /* eslint-disable-next-line no-console */ console.log(`[${new Date().toISOString()}] ${m}`); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

function loadMesh(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const size16 = 16 + nV * 16 + nT * 12, size8 = 8 + nV * 16 + nT * 12;
  const off = buf.length === size16 ? 16 : (buf.length === size8 ? 8 : -1);
  if (off < 0) return null;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}
function watertightNV(xyz: Float64Array, tris: number[], uvLen: number): { nonMan: number; injected: number; nonVacuous: boolean } {
  const nonMan = auditNonManByIndex(xyz, tris, 1e-4);
  const a0 = tris[0], b0 = tris[1]; const vNew = uvLen / 2;
  const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
  xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
  const crackTris = tris.slice(); crackTris.push(a0, b0, vNew);
  const injected = auditNonManByIndex(xyz2, crackTris, 1e-4);
  return { nonMan, injected, nonVacuous: injected > nonMan };
}

describe('pf-GEOSTAR-HYBRID: sub-pitch-respecting structured strip watertightness (STAGE A prerequisite)', () => {
  it.skipIf(process.env.PF_GSHYBRID !== '1')('stageA: sweep h/width/valleyClamp for a WATERTIGHT strip at sub-pitch', () => {
    const key = `stageA_h${process.env.PF_HMM ?? '0.03'}_w${process.env.PF_WIDTH ?? '0.12'}_vc${process.env.PF_VALLEY ?? '1'}`;
    if (rowExists(key)) { plog(`${key} exists, skip`); return; }
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[stageA] complex cEdges=${pc.constraintEdges.length}`);
    let base = loadMesh(WHOLEMESH_BIN); if (!base) base = loadMesh(BRUTE_BIN);
    if (!base) { expect(false).toBe(true); return; }

    const H_MM = Number(process.env.PF_HMM ?? 0.03);
    const WIDTH_MM = Number(process.env.PF_WIDTH ?? 0.12);
    const VALLEY = process.env.PF_VALLEY !== '0';
    plog(`[stageA] building strips h=${H_MM} width=${WIDTH_MM} valleyClamp=${VALLEY} (maxSquareHalfWidth≈0.034mm from diag1)`);
    const t0 = Date.now();
    const built = buildStructStrips(patch, base.uv, pc.constraintEdges, { hMm: H_MM, widthMm: WIDTH_MM, valleyClamp: VALLEY });
    const strip = { uv: built.uv, tris: built.tris };
    plog(`[stageA] built chains=${built.nChains} stripTris=${built.nStripTris} bgTris=${built.nBgTris} tris=${strip.tris.length / 3} meanColDepth=${built.meanColDepth.toFixed(2)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const xyz = liftMesh(patch, strip.uv);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(strip.tris) });
    const za = countZeroAreaFaces(xyz, strip.tris);
    const wt = watertightNV(xyz, strip.tris, strip.uv.length);
    plog(`[stageA] pct<20=${q.pctBelow20.toFixed(1)}% minAngle=${q.minAngleDeg.toFixed(2)} zeroArea=${za.zeroArea} subMicro=${za.subMicro} nonMan=${wt.nonMan} nonVac=${wt.nonVacuous}`);
    const row = {
      key, target: 'GeometricStar', hMm: H_MM, widthMm: WIDTH_MM, valleyClamp: VALLEY,
      tris: strip.tris.length / 3, stripTris: built.nStripTris, bgTris: built.nBgTris, meanColDepth: +built.meanColDepth.toFixed(2),
      pctBelow20: +q.pctBelow20.toFixed(1), minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2),
      zeroAreaFaces: za.zeroArea, subMicro: za.subMicro,
      watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
      watertight: wt.nonMan === 0 && wt.nonVacuous,
    };
    checkpoint(row);
    expect(strip.tris.length).toBeGreaterThan(0);
  }, 2 * 60 * 60 * 1000);
});
