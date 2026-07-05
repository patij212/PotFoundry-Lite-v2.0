// _pf_creststrip_collapse4bay.test.ts — DEV-ONLY (PF_COLLAPSE4=1). The FALLBACK on the ACTUAL go/no-go artifact:
// the CONFIRMED 4-bay M-square Gothic mesh (58365t) has 36 ZERO-AREA UV-collinear degenerate faces (the real
// slicer risk, E-…-ANISO-RULER). Apply the degenerate-face COLLAPSE post-pass and RE-MEASURE both gates: does it
// make Gothic SLICER-SAFE (zeroAreaAfter=0) while HOLDING 0-outlier (top-400 guard) + watertight non-vacuous?
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { makeGothicPatch, extractProtectedComplex, acceptanceGuard, liftMesh } from './_pf_perfectMesherLib';
import { countZeroAreaFaces, collapseDegenerateFaces } from './_pf_crestStripLib';

const TOL = 0.01;
const OUT = join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_creststrip');
const SRC = join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_msquare', 'after_mesh.bin');
function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path); const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const s8 = 8 + nV * 16 + nT * 12, s16 = 16 + nV * 16 + nT * 12; const off = buf.length === s8 ? 8 : (buf.length === s16 ? 16 : -1); if (off < 0) return null;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; } for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; } return { uv, tris };
}
function findInteriorEdge(xyz: Float64Array, tris: number[]): [number, number] | null {
  const n = xyz.length / 3; const q = 1e4; const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) { const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`; const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; } }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a); const cnt = new Map<number, number>();
  for (let k = 0; k < tris.length; k += 3) { const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue; cnt.set(key(a, b), (cnt.get(key(a, b)) ?? 0) + 1); cnt.set(key(b, c), (cnt.get(key(b, c)) ?? 0) + 1); cnt.set(key(c, a), (cnt.get(key(c, a)) ?? 0) + 1); }
  for (let k = 0; k < tris.length; k += 3) { const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue; if ((cnt.get(key(a, b)) ?? 0) === 2) return [tris[k], tris[k + 1]]; if ((cnt.get(key(b, c)) ?? 0) === 2) return [tris[k + 1], tris[k + 2]]; if ((cnt.get(key(c, a)) ?? 0) === 2) return [tris[k + 2], tris[k]]; } return null;
}
function watertight(xyz: Float64Array, tris: number[], uvLen: number): { nonMan: number; injected: number; nonVacuous: boolean } {
  const nonMan = auditNonManByIndex(xyz, tris, 1e-4); const ie = findInteriorEdge(xyz, tris);
  const a0 = ie ? ie[0] : tris[0], b0 = ie ? ie[1] : tris[1]; const vNew = uvLen / 2;
  const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz); xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
  const crackTris = tris.slice(); crackTris.push(a0, b0, vNew); const injected = auditNonManByIndex(xyz2, crackTris, 1e-4);
  return { nonMan, injected, nonVacuous: injected > nonMan };
}

describe('collapse 4-bay: degenerate-face collapse makes the CONFIRMED M-square Gothic slicer-safe', () => {
  it.skipIf(process.env.PF_COLLAPSE4 !== '1')('collapse 36 zero-area faces, re-measure fidelity+watertight', () => {
    const patch = makeGothicPatch(4, 12);
    const pc = extractProtectedComplex(patch, 200, 200, 0.03);
    const m = loadBin(SRC); if (!m) { mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, 'collapse4bay.json'), JSON.stringify({ error: 'no msquare mesh', SRC })); return; }
    const xyz0 = liftMesh(patch, m.uv); const za0 = countZeroAreaFaces(xyz0, m.tris);
    const g0 = acceptanceGuard(patch, m.uv, m.tris, TOL, 0.06, pc.crestSamples3D, 400);
    const q0 = triangleQualityDistribution({ vertices: xyz0, indices: Int32Array.from(m.tris) });
    const col = collapseDegenerateFaces(patch, m.uv, m.tris, 1e-6);
    const xyz1 = liftMesh(patch, col.uv); const za1 = countZeroAreaFaces(xyz1, col.tris);
    const g1 = acceptanceGuard(patch, col.uv, col.tris, TOL, 0.06, pc.crestSamples3D, 400);
    const q1 = triangleQualityDistribution({ vertices: xyz1, indices: Int32Array.from(col.tris) });
    const wt1 = watertight(xyz1, col.tris, col.uv.length);
    const row = {
      key: 'collapse4bay', src: 'msquare 4-bay 58365t (36 zeroArea)',
      collapsedFaces: col.collapsed, verticesMerged: col.verticesMerged, trisBefore: m.tris.length / 3, trisAfter: col.tris.length / 3,
      zeroAreaBefore: za0.zeroArea, subMicroBefore: za0.subMicro, zeroAreaAfter: za1.zeroArea, subMicroAfter: za1.subMicro,
      interiorOutliersBefore: g0.interiorOutliers, interiorMaxBefore: g0.interiorMaxMm, interiorOutliersAfter: g1.interiorOutliers, interiorMaxAfter: g1.interiorMaxMm,
      pctBelow20Before: +q0.pctBelow20.toFixed(1), pctBelow20After: +q1.pctBelow20.toFixed(1), minAngleAfter: +q1.minAngleDeg.toFixed(2), medianMinAngleAfter: +q1.medianMinAngleDeg.toFixed(2),
      watertightNonMan: wt1.nonMan, nonManInjected: wt1.injected, nonVacuous: wt1.nonVacuous,
    };
    mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, 'collapse4bay.json'), JSON.stringify(row, null, 2));
    /* eslint-disable-next-line no-console */ console.log('[COLLAPSE4]', JSON.stringify(row));
    expect(col.tris.length).toBeGreaterThan(0);
  }, 2 * 60 * 60 * 1000);
});
