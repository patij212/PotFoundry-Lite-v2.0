// _pf_perfect_geostar_wholemesh.test.ts — DEV-ONLY (PF_GSWHOLE=1). GATE 1 FIDELITY-TO-LITERAL-0 on GeometricStar.
//
// The CONFIRMED GeoStar brute-refine mesh (E-2026-07-05-PERFECT-MESHER-GEOSTAR, commit 01f56c2) reported "0 outliers"
// via acceptanceGuard scoring ONLY the top-400-worst-gradU facets. The GEOSTAR-CRESTSTRIP catch RECONFIRMED the
// guard-population artifact: ~4 residual MODERATE-gradU flank facets sit below the top-gradU population and were
// never re-checked. This probe makes ONE change: the guard AND the refine loop cover the WHOLE MESH.
//
// PRE-REGISTERED KILL-CRITERION (registry E-2026-07-05-PERFECT-MESHER-GEOSTAR-WHOLEMESH, commit 1bf283e):
//   CONFIRM iff the honest WHOLE-MESH brute (EVERY free facet, 45-pt) shows 0 interior outliers (max ≤0.01) AND
//     watertight (auditNonManByIndex=0 NON-VACUOUS). Report wholeMeshOutliers=0 + wholeMeshMax + tris.
//   REFUTE iff a residual facet FLOORS >0.02 after the whole-mesh refine loop terminates (characterize it).
//   NO-OP iff the whole-mesh guard on the reloaded mesh already reads 0.
//
// ISOLATION: NEW files. Reloads the persisted CONFIRMED mesh READ-ONLY. Reuses labkit + _pf_perfectMesherLib +
// _pf_geostarPatchLib + _pf_wholeMeshGuardLib. Writes ONLY research/exchange/_pf_perfect_geostar_wholemesh/.
// Env sub-gate + row-exists skip + persisted refined mesh => resumable across the env's long-run kills.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { extractProtectedComplex, liftMesh } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { wholeMeshGuard, refineInteriorBruteWhole } from './_pf_wholeMeshGuardLib';

const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh');
const SRC_MESH = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_brute', 'refined_mesh.bin');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const REFINED = join(DIR, 'refined_mesh.bin');

// patch controls — MUST MATCH the CONFIRMED brute probe defaults so extractProtectedComplex yields the SAME
// constraint edges the persisted mesh was built with (used only if we refine).
const BAYS = Number(process.env.PF_BAYS ?? 5);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 10);
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const MIN_AMP = 0.03;
const N_ROW = 260, N_COL = 260;
const MAX_PASS = Number(process.env.PF_PASS ?? 30);
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 };

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

function loadMeshFrom(path: string): { uv: number[]; tris: number[]; passes: number; capped: boolean } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4), passes = buf.readInt32LE(8), capped = buf.readInt32LE(12) === 1;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = 16; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris, passes, capped };
}
function persistMesh(path: string, uv: number[], tris: number[], passes: number, capped: boolean): void {
  mkdirSync(DIR, { recursive: true });
  const buf = Buffer.alloc(16 + uv.length * 8 + tris.length * 4);
  buf.writeInt32LE(uv.length / 2, 0); buf.writeInt32LE(tris.length / 3, 4); buf.writeInt32LE(passes, 8); buf.writeInt32LE(capped ? 1 : 0, 12);
  let o = 16; for (let i = 0; i < uv.length; i++) { buf.writeDoubleLE(uv[i], o); o += 8; }
  for (let i = 0; i < tris.length; i++) { buf.writeInt32LE(tris[i], o); o += 4; }
  writeFileSync(path, buf);
}

function watertightNonVacuous(patch: ReturnType<typeof makeGeoStarPatch>, uv: number[], tris: number[]): { nonMan: number; nonManInjected: number; nonVacuous: boolean } {
  const xyz = liftMesh(patch, uv);
  const nonMan = auditNonManByIndex(xyz, tris, 1e-4);
  const a0 = tris[0], b0 = tris[1]; const vNew = uv.length / 2;
  const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
  xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
  const crackTris = tris.slice(); crackTris.push(a0, b0, vNew);
  const nonManInjected = auditNonManByIndex(xyz2, crackTris, 1e-4);
  return { nonMan, nonManInjected, nonVacuous: nonManInjected > nonMan };
}

describe('pf-perfect-GEOSTAR-WHOLEMESH: literal whole-mesh 0-outlier guard + whole-mesh refine loop', () => {
  it.skipIf(process.env.PF_GSWHOLE !== '1')('gate1: whole-mesh guard on the CONFIRMED mesh, then refine ALL residuals to literal 0', () => {
    if (rowExists('gate1')) { plog('gate1 exists, skip'); return; }
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    plog(`[gate1] patch: uLo=${patch.uLo.toFixed(5)} uHi=${patch.uHi.toFixed(5)} tLo=${patch.tLo.toFixed(4)} tHi=${patch.tHi.toFixed(4)} arcPerU=${patch.arcPerU.toFixed(2)}`);

    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[gate1] extracted: fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length} crestSamples=${pc.crestSamples3D.length}`);

    // 1) reload the CONFIRMED brute-refine mesh (or resume our own refined mesh if a prior run persisted it)
    let m = loadMeshFrom(REFINED);
    let resumed = false;
    if (m) { resumed = true; plog(`[gate1] RESUMED from our persisted refined mesh: tris=${m.tris.length / 3} verts=${m.uv.length / 2}`); }
    else {
      m = loadMeshFrom(SRC_MESH);
      if (!m) { plog(`[gate1] FATAL: CONFIRMED source mesh missing at ${SRC_MESH} — run _pf_perfect_geostar_brute.test.ts first`); expect(existsSync(SRC_MESH)).toBe(true); return; }
      plog(`[gate1] loaded CONFIRMED source mesh: tris=${m.tris.length / 3} verts=${m.uv.length / 2}`);
    }

    // 2) WHOLE-MESH guard BEFORE (every free facet, 45-pt brute) — expose the true residual the top-400 hid.
    //    Skip if already computed (30-min scan; banked to guard_before.json) — resilience across kills.
    if (!resumed && !existsSync(join(DIR, 'guard_before.json'))) {
      const tB = Date.now();
      const gBefore = wholeMeshGuard(patch, m.uv, m.tris, TOL, pc.crestSamples3D, RULER,
        (done, total, brute) => { if (done % 20000 === 0) plog(`[gate1 before] guard ${done}/${total} bruteSoFar=${brute}`); });
      plog(`[gate1] WHOLE-MESH GUARD (before, top-400 claimed 0): nFacets=${gBefore.nFacets} wholeMeshMax=${gBefore.wholeMeshMaxMm} outliers=${gBefore.wholeMeshOutliers} (onCrest=${gBefore.onCrestOutliers} off=${gBefore.offCrestOutliers}) p99=${gBefore.p99} outlierGradU[${gBefore.outlierGradU.min}..${gBefore.outlierGradU.max}] brute=${gBefore.totalBruteCalls} in ${((Date.now() - tB) / 1000).toFixed(0)}s`);
      writeFileSync(join(DIR, 'guard_before.json'), JSON.stringify(gBefore, null, 2));
      checkpoint({ key: 'guard_before', target: 'GeometricStar', nFacets: gBefore.nFacets, wholeMeshMaxMm: gBefore.wholeMeshMaxMm, wholeMeshOutliers: gBefore.wholeMeshOutliers, onCrest: gBefore.onCrestOutliers, offCrest: gBefore.offCrestOutliers, p99: gBefore.p99, outlierGradUmin: gBefore.outlierGradU.min, outlierGradUmax: gBefore.outlierGradU.max });
    }

    // 3) WHOLE-MESH refine loop (active=ALL facets EVERY pass, edge 1→4, STOP=45-pt whole-mesh brute) until max≤tol
    const seed = { uv: m.uv, tris: m.tris };
    const t0 = Date.now();
    const r = refineInteriorBruteWhole(patch, seed, pc.constraintEdges, TOL, MAX_PASS, RULER, (s, uvNow, trisNow) => {
      // CHECKPOINT each pass to ndjson AND persist the growing mesh the INSTANT the pass completes (resilience: the
      // env kills long runs — proven this arc; a mid-refine kill resumes from the persisted mesh, re-scans whole).
      plog(`[whole-refine pass ${s.pass}] tris=${s.nTris} scored=${s.nScored} whole=${s.wholeScan} nOut=${s.nOut} worst=${s.worst} inserted=${s.nInserted} brute=${s.bruteCalls} ${(s.ms / 1000).toFixed(1)}s`);
      appendFileSync(join(DIR, 'refine_passes.ndjson'), JSON.stringify(s) + '\n');
      persistMesh(REFINED, uvNow, trisNow, s.pass, false);
    });
    persistMesh(REFINED, r.uv, r.tris, r.passes, r.capped);
    plog(`[gate1] whole-refine done: passes=${r.passes} capped=${r.capped} finalTris=${r.tris.length / 3} verts=${r.uv.length / 2} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

    // 4) WHOLE-MESH guard AFTER — the literal-0 measurement
    const tA = Date.now();
    const gAfter = wholeMeshGuard(patch, r.uv, r.tris, TOL, pc.crestSamples3D, RULER,
      (done, total, brute) => { if (done % 20000 === 0) plog(`[gate1 after] guard ${done}/${total} bruteSoFar=${brute}`); });
    plog(`[gate1] WHOLE-MESH GUARD (after): nFacets=${gAfter.nFacets} wholeMeshMax=${gAfter.wholeMeshMaxMm} outliers=${gAfter.wholeMeshOutliers} (onCrest=${gAfter.onCrestOutliers} off=${gAfter.offCrestOutliers}) p99=${gAfter.p99} outlierGradU[${gAfter.outlierGradU.min}..${gAfter.outlierGradU.max}] brute=${gAfter.totalBruteCalls} in ${((Date.now() - tA) / 1000).toFixed(0)}s`);
    writeFileSync(join(DIR, 'guard_after.json'), JSON.stringify(gAfter, null, 2));

    // 5) watertight non-vacuous + slivers
    const wt = watertightNonVacuous(patch, r.uv, r.tris);
    const xyz = liftMesh(patch, r.uv);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(r.tris) });
    plog(`[gate1] watertight: nonMan=${wt.nonMan} injected=${wt.nonManInjected} nonVacuous=${wt.nonVacuous}; slivers minAngle=${q.minAngleDeg.toFixed(2)} median=${q.medianMinAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}%`);

    const residualFloor = gAfter.wholeMeshMaxMm;
    const reachesLiteralZero = gAfter.wholeMeshOutliers === 0;
    const row = {
      key: 'gate1', target: 'GeometricStar',
      finalTris: r.tris.length / 3, refinePasses: r.passes, capped: r.capped,
      wholeMeshOutliers: gAfter.wholeMeshOutliers, wholeMeshMaxMm: gAfter.wholeMeshMaxMm,
      onCrestOutliers: gAfter.onCrestOutliers, offCrestOutliers: gAfter.offCrestOutliers,
      residualFloorMm: residualFloor, reachesLiteralZero,
      guardP50: gAfter.p50, guardP90: gAfter.p90, guardP99: gAfter.p99,
      outlierGradUmin: gAfter.outlierGradU.min, outlierGradUmax: gAfter.outlierGradU.max,
      outlierDetail: gAfter.outlierDetail.slice(0, 20),
      watertightNonMan: wt.nonMan, nonManInjected: wt.nonManInjected, nonVacuous: wt.nonVacuous,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
    };
    writeFileSync(join(DIR, 'gate1.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[gate1] VERDICT INPUT: reachesLiteralZero=${reachesLiteralZero} wholeMeshOutliers=${gAfter.wholeMeshOutliers} wholeMeshMax=${gAfter.wholeMeshMaxMm} residualFloor=${residualFloor} watertightNonVacuous=${wt.nonVacuous}`);
    expect(r.tris.length / 3).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
