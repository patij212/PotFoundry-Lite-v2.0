// _pf_geostar_structstrip.test.ts — DEV-ONLY (PF_GSSTRIP=1). GATE-2 SLIVERS on GeometricStar via a STRUCTURED-QUAD
// FLANK STRIP with DIRECT connectivity emission (the spec's mandated mechanism; bypasses free cdt2d — the V6 failure).
//
// Baseline = the CONFIRMED whole-mesh 0-outlier GeoStar mesh (E-…-GEOSTAR-WHOLEMESH gate1: wholeMeshOutliers=0,
// max 0.01mm, watertight non-vacuous, pctBelow20=21.7%, minAngle=0). This probe REBUILDS the near-crest region as
// structured strips emitted DIRECTLY (2 tris/quad, consistent diagonal), CDT'ing ONLY the smooth-panel complement.
//
// PRE-REGISTERED KILL-CRITERION (registry E-2026-07-05-PERFECT-MESHER-GEOSTAR-STRUCTSTRIP):
//   CONFIRM iff pctBelow20 → SINGLE DIGITS (<~10%) AND minAngle sane WHILE the honest WHOLE-MESH brute holds
//     interiorOutliers=0 (EVERY free facet, 45-pt) AND zeroAreaFaces=0 AND watertight (auditNonManByIndex non-vacuous).
//   REFUTE iff the strip cannot hold 0-outlier (reopens on the whole-mesh brute) OR cannot reach single-digit %<20
//     (report the honest %<20 at outliers=0).
//   Report pctBelow20 before/after, minAngle, wholeMeshOutliers, zeroArea, watertight.
//
// ISOLATION: NEW files. Reloads the CONFIRMED wholemesh mesh READ-ONLY. Reuses labkit + _pf_perfectMesherLib +
// _pf_geostarPatchLib + _pf_wholeMeshGuardLib + _pf_structStripLib + _pf_crestStripLib(countZeroAreaFaces). Writes
// ONLY research/exchange/_pf_geostar_structstrip[/_smoke]. Env sub-gate + row-exists skip + persisted strip mesh =>
// resumable across the env's long-run kills; checkpoint each unit the instant it is computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { extractProtectedComplex, liftMesh } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { wholeMeshGuard } from './_pf_wholeMeshGuardLib';
import { buildStructStrips } from './_pf_structStripLib';
import { countZeroAreaFaces } from './_pf_crestStripLib';

const TOL = 0.01;
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_geostar_structstrip_smoke' : '_pf_geostar_structstrip');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const STRIP_BIN = join(DIR, 'strip_mesh.bin');
// baseline: the CONFIRMED whole-mesh 0-outlier mesh (fallback to the brute mesh if wholemesh not present)
const WHOLEMESH_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh', 'refined_mesh.bin');
const BRUTE_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_brute', 'refined_mesh.bin');

const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 3 : 5));
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 6 : 10));
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const N_ROW = SMOKE ? 120 : 260, N_COL = SMOKE ? 120 : 260, MIN_AMP = 0.03;
// strip geometry: h = square 3D pitch (mm); widthMm = across-crest reach. The brute STOP already fixed the fidelity
// depth (~0.035mm arc apex threshold, whole-mesh max 0.01) — the strip pitch must be at least as fine near the crest.
const H_MM = Number(process.env.PF_HMM ?? 0.06);
const WIDTH_MM = Number(process.env.PF_WIDTH ?? 0.9);
const VALLEY_CLAMP = process.env.PF_VALLEY === '1';
// the whole-mesh brute STOP ruler (identical to the CONFIRMED gate1 ruler)
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: SMOKE ? 512 : 1024, nZ: SMOKE ? 80 : 120, zBandMm: 3, refineIters: SMOKE ? 40 : 60 };

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
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
function persistMesh(path: string, uv: number[], tris: number[]): void {
  mkdirSync(DIR, { recursive: true });
  const buf = Buffer.alloc(8 + uv.length * 8 + tris.length * 4);
  buf.writeInt32LE(uv.length / 2, 0); buf.writeInt32LE(tris.length / 3, 4);
  let o = 8; for (let i = 0; i < uv.length; i++) { buf.writeDoubleLE(uv[i], o); o += 8; }
  for (let i = 0; i < tris.length; i++) { buf.writeInt32LE(tris[i], o); o += 4; }
  writeFileSync(path, buf);
}
// watertight non-vacuous: an INTERIOR edge + a 3rd face on it must move the by-index count.
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

describe('pf-GEOSTAR-STRUCTSTRIP: direct-emission structured-quad flank strip — single-digit slivers holding whole-mesh 0-outlier?', () => {
  it.skipIf(process.env.PF_GSSTRIP !== '1')('gate2: structured strip rebuild → whole-mesh 0-outlier held + slivers dropped', () => {
    if (rowExists('gate2')) { plog('gate2 exists, skip'); return; }
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    plog(`[gate2] patch uLo=${patch.uLo.toFixed(5)} uHi=${patch.uHi.toFixed(5)} tLo=${patch.tLo.toFixed(4)} tHi=${patch.tHi.toFixed(4)} arcPerU=${patch.arcPerU.toFixed(2)}`);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[gate2] complex fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length}`);

    // BASELINE mesh = CONFIRMED wholemesh (0-outlier) if present, else the brute mesh.
    let base = loadMesh(WHOLEMESH_BIN); let baseSrc = 'wholemesh';
    if (!base) { base = loadMesh(BRUTE_BIN); baseSrc = 'brute'; }
    if (!base) { plog(`[gate2] FATAL: no baseline mesh at ${WHOLEMESH_BIN} nor ${BRUTE_BIN}`); expect(existsSync(WHOLEMESH_BIN) || existsSync(BRUTE_BIN)).toBe(true); return; }
    plog(`[gate2] baseline(${baseSrc}) ${base.uv.length / 2}v ${base.tris.length / 3}t`);

    // BEFORE metrics on the baseline (slivers + zeroArea + watertight). Whole-mesh outliers are the CONFIRMED 0
    // (from gate1) — we do NOT re-run the 30-min baseline guard here; we re-run the AFTER guard on the strip mesh.
    const xyzB = liftMesh(patch, base.uv);
    const qB = triangleQualityDistribution({ vertices: xyzB, indices: Int32Array.from(base.tris) });
    const zaB = countZeroAreaFaces(xyzB, base.tris);
    const wtB = watertight(xyzB, base.tris, base.uv.length);
    plog(`[gate2 BEFORE] tris=${base.tris.length / 3} pct<20=${qB.pctBelow20.toFixed(1)}% minAngle=${qB.minAngleDeg.toFixed(2)} zeroArea=${zaB.zeroArea} nonVac=${wtB.nonVacuous}`);
    checkpoint({ key: 'before', baseSrc, tris: base.tris.length / 3, minAngleDeg: +qB.minAngleDeg.toFixed(2), medianMinAngle: +qB.medianMinAngleDeg.toFixed(2), pctBelow20: +qB.pctBelow20.toFixed(1), zeroAreaFaces: zaB.zeroArea, subMicro: zaB.subMicro, watertightNonMan: wtB.nonMan, nonVacuous: wtB.nonVacuous });

    // BUILD the structured strip mesh directly (resume if persisted).
    let strip = loadMesh(STRIP_BIN); let built: ReturnType<typeof buildStructStrips> | null = null;
    if (strip) { plog(`[gate2] RESUMED strip mesh ${strip.uv.length / 2}v ${strip.tris.length / 3}t`); }
    else {
      const t0 = Date.now();
      built = buildStructStrips(patch, base.uv, pc.constraintEdges, { hMm: H_MM, widthMm: WIDTH_MM, valleyClamp: VALLEY_CLAMP });
      strip = { uv: built.uv, tris: built.tris };
      persistMesh(STRIP_BIN, strip.uv, strip.tris);
      plog(`[gate2] built strips: chains=${built.nChains} stripTris=${built.nStripTris} bgTris=${built.nBgTris} stripVerts=${built.nStripVerts} meanColDepth=${built.meanColDepth.toFixed(1)} tris=${strip.tris.length / 3} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }

    // AFTER metrics: slivers + zeroArea + watertight (fast) — checkpoint immediately BEFORE the slow guard.
    const xyzA = liftMesh(patch, strip.uv);
    const qA = triangleQualityDistribution({ vertices: xyzA, indices: Int32Array.from(strip.tris) });
    const zaA = countZeroAreaFaces(xyzA, strip.tris);
    const wtA = watertight(xyzA, strip.tris, strip.uv.length);
    plog(`[gate2 AFTER-fast] tris=${strip.tris.length / 3} pct<20=${qA.pctBelow20.toFixed(1)}% minAngle=${qA.minAngleDeg.toFixed(2)} median=${qA.medianMinAngleDeg.toFixed(2)} zeroArea=${zaA.zeroArea} nonVac=${wtA.nonVacuous}`);
    checkpoint({ key: 'after_fast', tris: strip.tris.length / 3, stripTris: built?.nStripTris ?? null, bgTris: built?.nBgTris ?? null, minAngleDeg: +qA.minAngleDeg.toFixed(2), medianMinAngle: +qA.medianMinAngleDeg.toFixed(2), pctBelow20: +qA.pctBelow20.toFixed(1), zeroAreaFaces: zaA.zeroArea, subMicro: zaA.subMicro, watertightNonMan: wtA.nonMan, nonManInjected: wtA.injected, nonVacuous: wtA.nonVacuous });

    // GUARD GATE: the whole-mesh brute is ~minutes; skip it if the fast metrics ALREADY refute (a non-watertight or
    // still-slivery mesh cannot CONFIRM regardless of fidelity). This keeps the run resumable + cheap on a refute.
    const fastRefutes = wtA.nonMan > 0 || zaA.zeroArea > 0 || qA.pctBelow20 >= 10;
    if (fastRefutes && process.env.PF_FORCEGUARD !== '1') {
      plog(`[gate2] FAST-REFUTE (nonMan=${wtA.nonMan} zeroArea=${zaA.zeroArea} pct<20=${qA.pctBelow20.toFixed(1)}) — skipping the whole-mesh guard (would not change the REFUTE). Set PF_FORCEGUARD=1 to run it anyway.`);
      const row0 = {
        key: 'gate2', target: 'GeometricStar', baseSrc, guardSkipped: true, guardSkipReason: `nonMan=${wtA.nonMan} zeroArea=${zaA.zeroArea} pct<20=${qA.pctBelow20.toFixed(1)}`,
        pctBelow20Before: +qB.pctBelow20.toFixed(1), pctBelow20After: +qA.pctBelow20.toFixed(1),
        minAngleDegBefore: +qB.minAngleDeg.toFixed(2), minAngleDegAfter: +qA.minAngleDeg.toFixed(2), medianMinAngleAfter: +qA.medianMinAngleDeg.toFixed(2),
        wholeMeshOutliers: null, zeroAreaFacesAfter: zaA.zeroArea, watertightNonMan: wtA.nonMan, nonManInjected: wtA.injected, nonVacuous: wtA.nonVacuous,
        trisAfter: strip.tris.length / 3, stripTris: built?.nStripTris ?? null, bgTris: built?.nBgTris ?? null,
        reachesCleanAndZero: false, hMm: H_MM, widthMm: WIDTH_MM, valleyClamp: VALLEY_CLAMP,
      };
      writeFileSync(join(DIR, 'gate2.json'), JSON.stringify(row0, null, 2)); checkpoint(row0);
      expect(strip.tris.length / 3).toBeGreaterThan(0); return;
    }
    // AFTER FIDELITY: honest WHOLE-MESH brute guard (EVERY free facet, 45-pt) — the literal 0-outlier proof.
    const tG = Date.now();
    const g = wholeMeshGuard(patch, strip.uv, strip.tris, TOL, pc.crestSamples3D, RULER,
      (done, total, brute) => { if (done % 20000 === 0) plog(`[gate2 guard] ${done}/${total} bruteSoFar=${brute}`); });
    plog(`[gate2 AFTER-guard] wholeMeshMax=${g.wholeMeshMaxMm} outliers=${g.wholeMeshOutliers} (onCrest=${g.onCrestOutliers} off=${g.offCrestOutliers}) p99=${g.p99} outlierGradU[${g.outlierGradU.min}..${g.outlierGradU.max}] brute=${g.totalBruteCalls} in ${((Date.now() - tG) / 1000).toFixed(0)}s`);
    writeFileSync(join(DIR, 'guard_after.json'), JSON.stringify(g, null, 2));

    const reachesCleanAndZero = g.wholeMeshOutliers === 0 && qA.pctBelow20 < 10 && zaA.zeroArea === 0 && wtA.nonVacuous;
    const row = {
      key: 'gate2', target: 'GeometricStar', baseSrc,
      pctBelow20Before: +qB.pctBelow20.toFixed(1), pctBelow20After: +qA.pctBelow20.toFixed(1),
      minAngleDegBefore: +qB.minAngleDeg.toFixed(2), minAngleDegAfter: +qA.minAngleDeg.toFixed(2),
      medianMinAngleAfter: +qA.medianMinAngleDeg.toFixed(2),
      wholeMeshOutliers: g.wholeMeshOutliers, wholeMeshMaxMm: g.wholeMeshMaxMm, onCrestOutliers: g.onCrestOutliers, offCrestOutliers: g.offCrestOutliers,
      guardP50: g.p50, guardP90: g.p90, guardP99: g.p99, outlierGradUmin: g.outlierGradU.min, outlierGradUmax: g.outlierGradU.max,
      outlierDetail: g.outlierDetail.slice(0, 20),
      zeroAreaFacesAfter: zaA.zeroArea, subMicroAfter: zaA.subMicro,
      watertightNonMan: wtA.nonMan, nonManInjected: wtA.injected, nonVacuous: wtA.nonVacuous,
      trisAfter: strip.tris.length / 3, stripTris: built?.nStripTris ?? null, bgTris: built?.nBgTris ?? null,
      reachesCleanAndZero,
      hMm: H_MM, widthMm: WIDTH_MM,
    };
    writeFileSync(join(DIR, 'gate2.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[gate2 VERDICT INPUT] reachesCleanAndZero=${reachesCleanAndZero} wholeMeshOutliers=${g.wholeMeshOutliers} pct<20 ${qB.pctBelow20.toFixed(1)}→${qA.pctBelow20.toFixed(1)} minAngle=${qA.minAngleDeg.toFixed(2)} zeroArea=${zaA.zeroArea} nonVac=${wtA.nonVacuous}`);
    expect(strip.tris.length / 3).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
