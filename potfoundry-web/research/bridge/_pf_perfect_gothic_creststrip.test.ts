// _pf_perfect_gothic_creststrip.test.ts — DEV-ONLY (PF_CRESTSTRIP=1). The LAST Gothic sliver lever.
//
// E-2026-07-05-PERFECT-MESHER-CRESTSTRIP. 6 sliver levers refuted; ANISO-RULER proved the 0-outlier slivers are a
// GENUINE cross-curvature-needle defect (+36 zero-area faces on Gothic). This probe replaces the greedy flat-P1
// crest-flank RED 1→4 refinement with a CURVED-element-GUIDED STRUCTURED SQUARE flank strip (refineCrestStrip):
// per crest edge, a structured strip marches OUT into the flank at square 3D pitch, rows ALONG the crest, columns
// arc-length-graded to follow the flank curvature → cells square-by-construction (no needles), on-surface
// (0-outlier held by the honest brute STOP driver). Crest stays a no-bridge shared edge.
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE measuring — registry E-2026-07-05-PERFECT-MESHER-CRESTSTRIP):
//   FULL CONFIRM iff pctBelow20 → single digits (<~10%) AND minAngle sane (>~15° OR median >~30°) AND
//     zeroAreaFaces=0 AND interiorOutliers HOLD 0 (honest ≥36-pt brute) AND watertight non-vacuous.
//   PARTIAL (slicer-safe) iff zeroAreaFaces→0 + interiorOutliers HOLD 0 + watertight held but pctBelow20 stays
//     >single-digit (PRINT-USABLE, not angle-clean). usedCollapseFallback reported.
//   REFUTE iff the strip cannot hold 0-outlier OR cannot kill the zero-area faces without reopening outliers.
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib + _pf_crestStripLib
// READ-ONLY. Writes ONLY research/exchange/_pf_perfect_gothic_creststrip/. Env sub-gate + row-exists skip ⇒
// resumable; checkpoint each unit the instant it is computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import {
  makeGothicPatch, extractProtectedComplex, seedMesh, acceptanceGuard, liftMesh,
} from './_pf_perfectMesherLib';
import { refineCrestStrip, countZeroAreaFaces, collapseDegenerateFaces } from './_pf_crestStripLib';

const TOL = 0.01;
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_perfect_gothic_creststrip_smoke' : '_pf_perfect_gothic_creststrip');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };
const persistMesh = (name: string, uv: number[], tris: number[]): void => {
  mkdirSync(DIR, { recursive: true });
  const buf = Buffer.alloc(8 + uv.length * 8 + tris.length * 4);
  buf.writeInt32LE(uv.length / 2, 0); buf.writeInt32LE(tris.length / 3, 4);
  let o = 8; for (let i = 0; i < uv.length; i++) { buf.writeDoubleLE(uv[i], o); o += 8; }
  for (let i = 0; i < tris.length; i++) { buf.writeInt32LE(tris[i], o); o += 4; }
  writeFileSync(join(DIR, name), buf);
};
function loadBin(path: string): { uv: number[]; tris: number[] } | null {
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

// Patch controls: SMOKE = the CONFIRMED brute smoke (1-bay) for a cheap direction read; non-smoke = the 4-bay
// M-square patch VERBATIM (makeGothicPatch(4,12), same extract/seed) so the AFTER arm is apples-to-apples with the
// CONFIRMED M-square before.
const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 1 : 4));
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 5 : 12));
const N_ROW = Number(process.env.PF_NROW ?? (SMOKE ? 120 : 200)), N_COL = Number(process.env.PF_NCOL ?? (SMOKE ? 120 : 200)), MIN_AMP = 0.03;
const BG_ARC_MM = Number(process.env.PF_BG ?? (SMOKE ? 0.35 : 0.16));
const MAX_PASS = Number(process.env.PF_PASS ?? (SMOKE ? 10 : 16));
const TOP_FRAC = Number(process.env.PF_TOPFRAC ?? 0.06);
const GUARD_CAP = Number(process.env.PF_GCAP ?? 400);
const LOOP_NTH = Number(process.env.PF_LNTH ?? (SMOKE ? 384 : 512));
const N_STRIP_COL = Number(process.env.PF_NCOLSTRIP ?? 4);
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 80, zBandMm: 3, refineIters: 40 };
// BEFORE = the CONFIRMED M-square 4-bay mesh (or brute smoke 1-bay) — reuse the banked baseline (zeroArea=36 on 4-bay).
const BEFORE_MESH = process.env.PF_BEFORE_MESH ?? join(process.cwd(), 'research', 'exchange',
  SMOKE ? '_pf_perfect_gothic_brute_smoke' : '_pf_perfect_gothic_msquare', SMOKE ? 'refined_mesh.bin' : 'after_mesh.bin');

function findInteriorEdge(xyz: Float64Array, tris: number[]): [number, number] | null {
  const n = xyz.length / 3; const q = 1e4;
  const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) { const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`; const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; } }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const cnt = new Map<number, number>();
  for (let k = 0; k < tris.length; k += 3) { const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue; cnt.set(key(a, b), (cnt.get(key(a, b)) ?? 0) + 1); cnt.set(key(b, c), (cnt.get(key(b, c)) ?? 0) + 1); cnt.set(key(c, a), (cnt.get(key(c, a)) ?? 0) + 1); }
  for (let k = 0; k < tris.length; k += 3) {
    const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue;
    if ((cnt.get(key(a, b)) ?? 0) === 2) return [tris[k], tris[k + 1]];
    if ((cnt.get(key(b, c)) ?? 0) === 2) return [tris[k + 1], tris[k + 2]];
    if ((cnt.get(key(c, a)) ?? 0) === 2) return [tris[k + 2], tris[k]];
  }
  return null;
}
function watertight(xyz: Float64Array, tris: number[], uvLen: number): { nonMan: number; injected: number; nonVacuous: boolean } {
  const nonMan = auditNonManByIndex(xyz, tris, 1e-4);
  const ie = findInteriorEdge(xyz, tris);
  const a0 = ie ? ie[0] : tris[0], b0 = ie ? ie[1] : tris[1]; const vNew = uvLen / 2;
  const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
  xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
  const crackTris = tris.slice(); crackTris.push(a0, b0, vNew);
  const injected = auditNonManByIndex(xyz2, crackTris, 1e-4);
  return { nonMan, injected, nonVacuous: injected > nonMan };
}

describe('pf-perfect-gothic-CRESTSTRIP: curved-element structured square flank strip closes slivers, holds 0 outliers', () => {
  const buildBase = (): { patch: ReturnType<typeof makeGothicPatch>; pc: ReturnType<typeof extractProtectedComplex>; seed: ReturnType<typeof seedMesh> } => {
    const patch = makeGothicPatch(BAYS, ZBAND_MM);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    const seed = seedMesh(patch, pc, BG_ARC_MM);
    return { patch, pc, seed };
  };

  // ── BEFORE: load the CONFIRMED M-square (or brute-smoke) mesh; measure baseline incl. zeroArea faces ──
  it.skipIf(process.env.PF_CRESTSTRIP !== '1')('before: load CONFIRMED mesh — baseline slivers + zeroArea', () => {
    if (rowExists('before')) { plog('before exists, skip'); return; }
    const { patch } = buildBase();
    const loaded = loadBin(BEFORE_MESH);
    if (!loaded) { plog(`[before] MISSING baseline mesh ${BEFORE_MESH} — cannot A/B`); checkpoint({ key: 'before', error: 'missing_baseline', path: BEFORE_MESH }); return; }
    plog(`[before] LOADED ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t from ${BEFORE_MESH}`);
    const xyz = liftMesh(patch, loaded.uv);
    const wt = watertight(xyz, loaded.tris, loaded.uv.length);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(loaded.tris) });
    const za = countZeroAreaFaces(xyz, loaded.tris);
    const row = {
      key: 'before', mode: 'load-confirmed', bays: BAYS, tris: loaded.tris.length / 3,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      zeroAreaFaces: za.zeroArea, subMicroFaces: za.subMicro, minAreaMm2: za.minAreaMm2,
      watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
    };
    writeFileSync(join(DIR, 'before.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[before] pct<20=${q.pctBelow20.toFixed(1)}% minAngle=${q.minAngleDeg.toFixed(2)} zeroArea=${za.zeroArea} sub-µm²=${za.subMicro} nonVac=${wt.nonVacuous}`);
    expect(loaded.tris.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── AFTER: the CURVED-element STRUCTURED STRIP refine on the SAME patch/complex/seed ──
  it.skipIf(process.env.PF_CRESTSTRIP !== '1')('after: structured square flank strip — outliers hold 0, slivers drop', () => {
    if (rowExists('after')) { plog('after exists, skip'); return; }
    const { patch, pc, seed } = buildBase();
    plog(`[after] crest-strip refine bays=${BAYS} zBand=${ZBAND_MM} cEdges0=${pc.constraintEdges.length} seed ${seed.uv.length / 2}v ${seed.tris.length / 3}t nColStrip=${N_STRIP_COL}`);
    const t0 = Date.now();
    const r = refineCrestStrip(patch, { uv: seed.uv.slice(), tris: seed.tris.slice() }, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
      plog(`[after pass ${s.pass}] tris=${s.nTris} out=${s.nOutBrute} worst=${s.worstBrute} strips=${s.nStrips} insR=${s.nInsertedRow} insC=${s.nInsertedCol} crestSplit=${s.nCrestEdgesSplit} ${(s.ms / 1000).toFixed(1)}s`);
      appendFileSync(join(DIR, 'after_passes.ndjson'), JSON.stringify(s) + '\n');
    }, { nCol: N_STRIP_COL });
    const xyz = liftMesh(patch, r.uv);
    const wt = watertight(xyz, r.tris, r.uv.length);
    const guard = acceptanceGuard(patch, r.uv, r.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(r.tris) });
    const za = countZeroAreaFaces(xyz, r.tris);
    const finalTris = r.tris.length / 3;
    persistMesh('after_mesh.bin', r.uv, r.tris);
    const FULL_BAYS = 72;
    const projectedFullMeshTris = Math.round((finalTris / BAYS) * FULL_BAYS);
    const row = {
      key: 'after', mode: 'crest-strip', bays: BAYS, tris: finalTris, trisPerBay: +(finalTris / BAYS).toFixed(0),
      projectedFullMeshTris, budget6M: projectedFullMeshTris <= 6_000_000,
      refinePasses: r.passes, capped: r.capped,
      interiorOutliers: guard.interiorOutliers, interiorMaxMm: guard.interiorMaxMm, onCrest: guard.onCrestOutliers, off: guard.offCrestOutliers, guardP99: guard.p99,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      zeroAreaFaces: za.zeroArea, subMicroFaces: za.subMicro, minAreaMm2: za.minAreaMm2,
      watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
      usedCollapseFallback: false,
      elapsedS: +((Date.now() - t0) / 1000).toFixed(0),
    };
    writeFileSync(join(DIR, 'after.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[after] outliers=${guard.interiorOutliers} max=${guard.interiorMaxMm} | pct<20=${q.pctBelow20.toFixed(1)}% minAngle=${q.minAngleDeg.toFixed(2)} | zeroArea=${za.zeroArea} | tris=${finalTris} nonVac=${wt.nonVacuous}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── FALLBACK: degenerate-face COLLAPSE post-pass on the AFTER mesh → slicer-safe (zeroArea=0). Re-measure BOTH
  //    gates (fidelity + watertight) after the collapse — the honest report of whether they survive. ──
  it.skipIf(process.env.PF_CRESTSTRIP !== '1')('collapse: degenerate-face collapse fallback → slicer-safe; re-measure fidelity + watertight', () => {
    if (rowExists('collapse')) { plog('collapse exists, skip'); return; }
    const { patch, pc } = buildBase();
    // prefer the AFTER strip mesh; if it has no zeroArea faces the collapse is moot but still reported. If AFTER is
    // absent (window killed before it ran), collapse the BEFORE baseline (still a valid slicer-safety datapoint).
    const afterMesh = loadBin(join(DIR, 'after_mesh.bin')) ?? loadBin(BEFORE_MESH);
    if (!afterMesh) { plog('[collapse] no mesh to collapse'); checkpoint({ key: 'collapse', error: 'no_mesh' }); return; }
    const source = existsSync(join(DIR, 'after_mesh.bin')) ? 'after' : 'before-baseline';
    const xyz0 = liftMesh(patch, afterMesh.uv);
    const za0 = countZeroAreaFaces(xyz0, afterMesh.tris);
    const g0 = acceptanceGuard(patch, afterMesh.uv, afterMesh.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    const col = collapseDegenerateFaces(patch, afterMesh.uv, afterMesh.tris, 1e-6);
    const xyz1 = liftMesh(patch, col.uv);
    const za1 = countZeroAreaFaces(xyz1, col.tris);
    const wt1 = watertight(xyz1, col.tris, col.uv.length);
    const g1 = acceptanceGuard(patch, col.uv, col.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    const q1 = triangleQualityDistribution({ vertices: xyz1, indices: Int32Array.from(col.tris) });
    persistMesh('collapse_mesh.bin', col.uv, col.tris);
    const row = {
      key: 'collapse', source, usedCollapseFallback: true,
      collapsedFaces: col.collapsed, verticesMerged: col.verticesMerged,
      zeroAreaBefore: za0.zeroArea, subMicroBefore: za0.subMicro,
      zeroAreaAfter: za1.zeroArea, subMicroAfter: za1.subMicro,
      interiorOutliersBefore: g0.interiorOutliers, interiorMaxBefore: g0.interiorMaxMm,
      interiorOutliersAfter: g1.interiorOutliers, interiorMaxAfter: g1.interiorMaxMm,
      pctBelow20After: +q1.pctBelow20.toFixed(1), minAngleAfter: +q1.minAngleDeg.toFixed(2), medianMinAngleAfter: +q1.medianMinAngleDeg.toFixed(2),
      watertightNonMan: wt1.nonMan, nonManInjected: wt1.injected, nonVacuous: wt1.nonVacuous,
      trisBefore: afterMesh.tris.length / 3, trisAfter: col.tris.length / 3,
    };
    writeFileSync(join(DIR, 'collapse.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[collapse] src=${source} zeroArea ${za0.zeroArea}→${za1.zeroArea} | outliers ${g0.interiorOutliers}→${g1.interiorOutliers} (max ${g0.interiorMaxMm}→${g1.interiorMaxMm}) | pct<20=${q1.pctBelow20.toFixed(1)}% | nonVac=${wt1.nonVacuous}`);
    expect(col.tris.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
