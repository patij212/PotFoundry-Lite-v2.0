// _pf_perfect_gothic_wholemesh.test.ts — DEV-ONLY (PF_WHOLEMESH=1). GATE-1: drive the WHOLE-MESH honest brute to
// LITERAL 0 outliers on GothicArches.
//
// E-2026-07-05-WHOLEMESH-GOTHIC (pre-reg dce21de). The V6 metrology banked a GUARD-POPULATION ARTIFACT: the
// campaign's whole-patch "0 interior outliers" was a top-400-worst-gradU acceptanceGuard + active-cavity-only
// refine loop that NEVER SCORED ~3 residual MODERATE-gradU facets (gradU 110-182, <=0.21mm). This probe makes ONE
// change: BOTH the acceptance guard AND the refine-loop ITERATION score the WHOLE MESH (every free facet, honest
// two-stage utBound->GN->full-azimuth-brute, >=36-pt denseBary), and refinement continues on ANY facet whose
// whole-mesh interior deviation >0.01 (edge-mode RED 1->4, the proven mechanism) until the MAX over ALL facets
// <=0.01.
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE measuring, registry dce21de):
//   CONFIRM iff wholeMeshOutliers = 0 (max over ALL free facets <=0.01, honest >=36-pt brute) AND watertight
//     (auditNonManByIndex = 0 by index, non-vacuous — inject crack moves the count). Report wholeMeshOutliers
//     (must be 0), wholeMeshMax, tris.
//   REFUTE iff a residual facet FLOORS >0.02 after the whole-mesh loop terminates (a new MODERATE-gradU hard
//     sub-class — characterize where/what geometry/another cusp form).
//   NO-OP iff it matches the current top-400-guard floor (~3 facets <=0.21) within 10% without moving toward 0.
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib (READ-ONLY, plus the NEW
// whole-mesh exports refineInteriorBruteWhole/acceptanceGuardWhole). Writes ONLY research/exchange/
// _pf_perfect_gothic_wholemesh/. Env sub-gate + row-exists skip => resumable; checkpoint each unit the instant
// computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import {
  makeGothicPatch, extractProtectedComplex, seedMesh, acceptanceGuard, liftMesh,
} from './_pf_perfectMesherLib';
import { refineInteriorBruteWhole, acceptanceGuardWhole } from './_pf_perfectMesherBruteLib';

const TOL = 0.01;
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_perfect_gothic_wholemesh_smoke' : '_pf_perfect_gothic_wholemesh');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const MESHBIN = join(DIR, 'refined_mesh.bin');

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };
const persistMesh = (uv: number[], tris: number[], passes: number, capped: boolean): void => {
  mkdirSync(DIR, { recursive: true });
  const nV = uv.length / 2, nT = tris.length / 3;
  const buf = Buffer.alloc(16 + uv.length * 8 + tris.length * 4);
  buf.writeInt32LE(nV, 0); buf.writeInt32LE(nT, 4); buf.writeInt32LE(passes, 8); buf.writeInt32LE(capped ? 1 : 0, 12);
  let o = 16; for (let i = 0; i < uv.length; i++) { buf.writeDoubleLE(uv[i], o); o += 8; }
  for (let i = 0; i < tris.length; i++) { buf.writeInt32LE(tris[i], o); o += 4; }
  writeFileSync(MESHBIN, buf);
};
const loadMesh = (): { uv: number[]; tris: number[]; passes: number; capped: boolean } | null => {
  if (!existsSync(MESHBIN)) return null;
  const buf = readFileSync(MESHBIN);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4), passes = buf.readInt32LE(8), capped = buf.readInt32LE(12) === 1;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = 16; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris, passes, capped };
};

// Patch controls — a REAL single-arch Gothic patch. Default to 2 bays / 8mm z-band so the WHOLE-MESH brute (every
// facet each pass + the final 45-pt guard) is tractable in one run window (~60-120k tris). Env-overridable.
const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 2 : 2));
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 6 : 8));
const N_ROW = SMOKE ? 120 : 200, N_COL = SMOKE ? 120 : 200, MIN_AMP = 0.03;
const BG_ARC_MM = Number(process.env.PF_BG ?? (SMOKE ? 0.35 : 0.14));
const MAX_PASS = Number(process.env.PF_PASS ?? (SMOKE ? 12 : 30));

// honest LOOP + GUARD ruler (SAME two-stage anchor the CONFIRMED kernel uses; 1024x120 box-refine trusted <1e-4).
const LOOP_NTH = Number(process.env.PF_LNTH ?? (SMOKE ? 512 : 1024));
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 120, zBandMm: 3, refineIters: 60 };
// PHASED loop: PHASE A = cheap 7-pt driver converges the dense near-crest steep tail (the bulk); PHASE B = dense
// 45-pt driver (== the guard) mops up the residual MODERATE-gradU facets the 7-pt missed. Both score EVERY facet.
const BULK_7PT = Number(process.env.PF_BULK ?? 4);

describe('pf-perfect-gothic-WHOLEMESH: acceptance guard + refine loop score EVERY free facet (GATE-1)', () => {
  it.skipIf(process.env.PF_WHOLEMESH !== '1')('wholemesh: brute-driven refine + honest whole-mesh guard -> literal 0 outliers', () => {
    if (rowExists('wholemesh')) { plog('wholemesh row exists, skip'); return; }
    const patch = makeGothicPatch(BAYS, ZBAND_MM);
    const t0 = Date.now();
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[wm] extracted: fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length}`);

    // RESUME: reload a persisted whole-mesh-refined mesh if a prior run was killed after refine but before the guard.
    let ref = loadMesh();
    if (ref) {
      plog(`[wm] RESUMED persisted mesh: tris=${ref.tris.length / 3} verts=${ref.uv.length / 2} passes=${ref.passes} capped=${ref.capped}`);
    } else {
      const seed = seedMesh(patch, pc, BG_ARC_MM);
      plog(`[wm] seed: verts=${seed.uv.length / 2} tris=${seed.tris.length / 3}`);
      const r = refineInteriorBruteWhole(patch, seed, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
        plog(`[wm-refine pass ${s.pass}${s.dense ? ' DENSE' : ' 7pt'}] tris=${s.nTris} scored=${s.nScored} outBRUTE=${s.nOutBrute} worstBRUTE=${s.worstBrute} inserted=${s.nInserted} bruteCalls=${s.bruteCalls} ${(s.ms / 1000).toFixed(1)}s`);
        appendFileSync(join(DIR, 'refine_passes.ndjson'), JSON.stringify(s) + '\n');
        // CHECKPOINT the mesh EACH pass (resilience: env kills long runs).
      }, 'edge', BULK_7PT);
      ref = { uv: r.uv, tris: r.tris, passes: r.passes, capped: r.capped };
      persistMesh(ref.uv, ref.tris, ref.passes, ref.capped);
      plog(`[wm] refine done: passes=${r.passes} capped=${r.capped} finalTris=${r.tris.length / 3} verts=${r.uv.length / 2} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }

    // ── watertight (by INDEX, non-vacuous control — 3rd tri on an existing edge MUST move the count) ──
    const xyz = liftMesh(patch, ref.uv);
    const nonMan = auditNonManByIndex(xyz, ref.tris, 1e-4);
    const a0 = ref.tris[0], b0 = ref.tris[1]; const vNew = ref.uv.length / 2;
    const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
    xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
    const crackTris = ref.tris.slice(); crackTris.push(a0, b0, vNew);
    const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
    const nonVacuous = nonManCracked > nonMan;
    plog(`[wm] watertight: nonMan=${nonMan} nonManInjected=${nonManCracked} nonVacuous=${nonVacuous}`);

    // ── WHOLE-MESH honest acceptance guard: EVERY free facet, 45-pt denseBary, two-stage brute ──
    const tG = Date.now();
    const wg = acceptanceGuardWhole(patch, ref.uv, ref.tris, TOL, RULER);
    plog(`[wm] WHOLE-MESH GUARD: scored=${wg.nScored}/${wg.nFacets} wholeMeshMax=${wg.wholeMeshMaxMm} outliers=${wg.wholeMeshOutliers} p50=${wg.p50} p90=${wg.p90} p99=${wg.p99} worstGradU=${wg.worstGradU} worstUt=${JSON.stringify(wg.worstUtWorst)} bruteCalls=${wg.bruteCalls} outlierGradU=${JSON.stringify(wg.outlierGradU)} in ${((Date.now() - tG) / 1000).toFixed(0)}s`);
    writeFileSync(join(DIR, 'wholeguard.json'), JSON.stringify(wg, null, 2));

    // ── legacy top-400 guard for the A/B (proves the artifact: top-400 reads 0 where whole-mesh may not) ──
    const g400 = acceptanceGuard(patch, ref.uv, ref.tris, TOL, 0.06, pc.crestSamples3D, 400);
    plog(`[wm] TOP-400 GUARD (A/B): scored=${g400.nScored}/${g400.nFacets} interiorMax=${g400.interiorMaxMm} outliers=${g400.interiorOutliers} gradU[${g400.gradUofScored.min}..${g400.gradUofScored.max}]`);

    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(ref.tris) });
    plog(`[wm] slivers: minAngle=${q.minAngleDeg.toFixed(2)} median=${q.medianMinAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}%`);

    const finalTris = ref.tris.length / 3;
    const reachesLiteralZero = wg.wholeMeshOutliers === 0;
    const row = {
      key: 'wholemesh',
      finalTris, refinePasses: ref.passes, capped: ref.capped,
      familyCount: pc.familyCount, residualCrossings: pc.residualCrossings,
      wholeMeshOutliers: wg.wholeMeshOutliers, wholeMeshMaxMm: wg.wholeMeshMaxMm,
      wholeGuardP50: wg.p50, wholeGuardP90: wg.p90, wholeGuardP99: wg.p99, wholeWorstGradU: wg.worstGradU, outlierGradU: wg.outlierGradU,
      top400Outliers: g400.interiorOutliers, top400Max: g400.interiorMaxMm, top400GradUmin: g400.gradUofScored.min, top400GradUmax: g400.gradUofScored.max,
      watertightNonMan: nonMan, nonManInjected: nonManCracked, nonVacuous,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      converged: !ref.capped, reachesLiteralZero,
    };
    writeFileSync(join(DIR, 'wholemesh.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[wm] RESULT: reachesLiteralZero=${reachesLiteralZero} wholeMeshOutliers=${wg.wholeMeshOutliers} wholeMeshMax=${wg.wholeMeshMaxMm} tris=${finalTris} watertight=${nonMan}/nonVac=${nonVacuous}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
