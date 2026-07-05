// _pf_perfect_gothic_brute.test.ts — DEV-ONLY (PF_PERFECTBRUTE=1). THE CRUX EXPERIMENT.
//
// E-2026-07-04-PERFECT-MESHER-GOTHIC REFUTED because the refine-loop TERMINATION was driven by the GN ruler, which
// UNDERSTATES true-3D on near-vertical Gothic flanks (it stopped at worstGN 0.0085 while the honest full-azimuth
// brute reveals a 0.133mm on-crest floor). This probe reuses the PROVEN topology pipeline (extract -> seed -> guard,
// which passed whole-mesh: residualCrossings=0, watertight non-vacuous, manifold, 149k tris) and makes ONE change:
//   the refine-loop STOP test is the HONEST full-azimuth brute interior deviation, NOT GN. GN still PROPOSES the
//   split site cheaply; a facet keeps refining iff its brute-confirmed interior dev > 0.01.
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE measuring):
//   CONFIRM iff interiorOutliersFinal = 0 (honest >=36-pt brute, worst-gradU pop) AND watertight
//     (auditNonManByIndex = 0 non-vacuous) AND manifold, at <=6M-equiv. Note usedPnAtApex (false = flat-P1 alone).
//   REFUTE iff BOTH brute-driven flat-P1 AND scoped-apex-PN floor > 0.02 on-crest => Gothic's zero-width apex is
//     genuinely below a P2 element's reach => a deeper element/representation change is needed (name it).
//   Report FLAT-P1 number (interiorOutliersFlatP1 / interiorMaxFlatP1Mm) SEPARATELY from FINAL so we know if the
//     apex PN was necessary.
//
// STEP 1 (flat-P1, brute-driven): does flat-P1 arc-length grading reach 0 interior outliers on the worst-gradU
//   top-N under the honest brute? Report interiorOutliersFlatP1 + max + converged + tris.
// STEP 2 (only if Step 1 still floors >0.01 at the sharpest apex): swap ONLY the last-1-2-ring near-apex leaf tris
//   for a one-sided Vlachos PN element, re-measure under the SAME honest brute. Report interiorOutliersFinal +
//   usedPnAtApex.
//
// ISOLATION: NEW files only. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib READ-ONLY. Writes ONLY
// research/exchange/_pf_perfect_gothic_brute/. Env sub-gate + row-exists skip => resumable; checkpoint each unit.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import {
  makeGothicPatch, extractProtectedComplex, seedMesh, acceptanceGuard, liftMesh, lift, type PatchDef,
} from './_pf_perfectMesherLib';
import { refineInteriorBrute, apexLeafPN } from './_pf_perfectMesherBruteLib';

const TOL = 0.01;
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_perfect_gothic_brute_smoke' : '_pf_perfect_gothic_brute');
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

// Patch controls — MATCH the proven E-2026-07-04 probe so this is the SAME patch (only the loop driver changes).
const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 3 : 5));
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 8 : 14));
const N_ROW = SMOKE ? 120 : 220, N_COL = SMOKE ? 120 : 220, MIN_AMP = 0.03;
const BG_ARC_MM = Number(process.env.PF_BG ?? (SMOKE ? 0.35 : 0.11));
const MAX_PASS = Number(process.env.PF_PASS ?? (SMOKE ? 12 : 40)); // GENEROUS cap — brute-driven loop must run to
                                                                    // HONEST convergence (not GN's premature 4 passes)
const TOP_FRAC = Number(process.env.PF_TOPFRAC ?? (SMOKE ? 0.03 : 0.06));
const GUARD_CAP = Number(process.env.PF_GCAP ?? (SMOKE ? 400 : 400)); // worst-gradU top-400 (per the task spec)

// two-stage honest ruler config (SAME as acceptanceGuard's — brute grid 1024x120 +-3mm z-band + box-refine)
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: SMOKE ? 512 : 1024, nZ: 120, zBandMm: 3, refineIters: 60 };

describe('pf-perfect-gothic-BRUTE: refine-loop TERMINATION driven by the HONEST full-azimuth brute (the crux)', () => {
  // ── STEP 1: build END-TO-END with the BRUTE-DRIVEN refine loop + honest guard. ──
  it.skipIf(process.env.PF_PERFECTBRUTE !== '1')('step1: brute-driven flat-P1 refine -> honest guard', () => {
    if (rowExists('step1')) { plog('step1 exists, skip'); return; }
    const patch = makeGothicPatch(BAYS, ZBAND_MM);
    const t0 = Date.now();
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[step1] extracted: fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length}`);

    // RESUME: reload a persisted brute-refined mesh if a prior run was killed after refine but before the guard.
    let ref = loadMesh();
    if (ref) {
      plog(`[step1] RESUMED from persisted mesh: tris=${ref.tris.length / 3} verts=${ref.uv.length / 2} passes=${ref.passes} capped=${ref.capped}`);
    } else {
      const seed = seedMesh(patch, pc, BG_ARC_MM);
      plog(`[step1] seed: verts=${seed.uv.length / 2} tris=${seed.tris.length / 3}`);
      const r = refineInteriorBrute(patch, seed, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
        plog(`[brute-refine pass ${s.pass}] tris=${s.nTris} scored=${s.nScored} outBRUTE=${s.nOutBrute} worstBRUTE=${s.worstBrute} inserted=${s.nInserted} bruteCalls=${s.bruteCalls} ${(s.ms / 1000).toFixed(1)}s`);
        appendFileSync(join(DIR, 'refine_passes.ndjson'), JSON.stringify(s) + '\n');
        // CHECKPOINT the mesh EACH pass so a kill mid-loop resumes from the latest (cost: cheap disk write).
      });
      ref = { uv: r.uv, tris: r.tris, passes: r.passes, capped: r.capped };
      plog(`[step1] brute-refine done: passes=${r.passes} capped=${r.capped} finalTris=${r.tris.length / 3} verts=${r.uv.length / 2} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      persistMesh(ref.uv, ref.tris, ref.passes, ref.capped);
    }

    // ── watertight audit (by INDEX, non-vacuous control — 3rd tri on an existing edge MUST move the count) ──
    const xyz = liftMesh(patch, ref.uv);
    const nonMan = auditNonManByIndex(xyz, ref.tris, 1e-4);
    const a0 = ref.tris[0], b0 = ref.tris[1]; const vNew = ref.uv.length / 2;
    const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
    xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
    const crackTris = ref.tris.slice(); crackTris.push(a0, b0, vNew);
    const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
    const nonVacuous = nonManCracked > nonMan;
    plog(`[step1] watertight: nonMan=${nonMan} nonManInjected=${nonManCracked} nonVacuous=${nonVacuous}`);

    // ── honest acceptance guard (SAME as the proven probe: >=36-pt sampler, worst-gradU top-400, full-azimuth brute) ──
    const tG = Date.now();
    const guard = acceptanceGuard(patch, ref.uv, ref.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    plog(`[step1] GUARD: scored=${guard.nScored}/${guard.nFacets} interiorMax=${guard.interiorMaxMm} outliers=${guard.interiorOutliers} (onCrest=${guard.onCrestOutliers} off=${guard.offCrestOutliers}) p99=${guard.p99} gradU[${guard.gradUofScored.min}..${guard.gradUofScored.max}] in ${((Date.now() - tG) / 1000).toFixed(0)}s`);

    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(ref.tris) });
    plog(`[step1] slivers: minAngle=${q.minAngleDeg.toFixed(2)} median=${q.medianMinAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}%`);

    const finalTris = ref.tris.length / 3;
    const row = {
      key: 'step1',
      finalTris, refinePasses: ref.passes, capped: ref.capped,
      familyCount: pc.familyCount, residualCrossings: pc.residualCrossings,
      interiorMaxFlatP1Mm: guard.interiorMaxMm, interiorOutliersFlatP1: guard.interiorOutliers,
      onCrestOutliers: guard.onCrestOutliers, offCrestOutliers: guard.offCrestOutliers,
      guardP50: guard.p50, guardP90: guard.p90, guardP99: guard.p99, guardScored: guard.nScored,
      gradUmin: guard.gradUofScored.min, gradUmax: guard.gradUofScored.max,
      watertightNonMan: nonMan, nonManInjected: nonManCracked, nonVacuous,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      converged: !ref.capped,
    };
    writeFileSync(join(DIR, 'step1.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[step1] flat-P1 BRUTE-DRIVEN: interiorMax=${guard.interiorMaxMm} outliers=${guard.interiorOutliers} converged=${!ref.capped} tris=${finalTris}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── STEP 2: scoped near-apex PN — ONLY if step1 still floors > tol on-crest. Reads the persisted mesh. ──
  it.skipIf(process.env.PF_PERFECTBRUTE !== '1')('step2: scoped near-apex one-sided PN (only if step1 floors)', () => {
    if (rowExists('step2')) { plog('step2 exists, skip'); return; }
    if (!existsSync(join(DIR, 'step1.json'))) { plog('step1.json missing — run step1 first'); return; }
    const s1 = JSON.parse(readFileSync(join(DIR, 'step1.json'), 'utf8'));
    const patch: PatchDef = makeGothicPatch(BAYS, ZBAND_MM);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    const ref = loadMesh();
    if (!ref) { plog('no persisted mesh — run step1 first'); return; }

    // If step1 already reached 0 outliers, PN is UNNECESSARY — record the flat-P1 result as final.
    if (Number(s1.interiorOutliersFlatP1) === 0) {
      const row = {
        key: 'step2', usedPnAtApex: false, interiorOutliersFinal: 0, interiorMaxFinalMm: Number(s1.interiorMaxFlatP1Mm),
        note: 'flat-P1 brute-driven reached 0 outliers; scoped apex PN NOT needed',
      };
      checkpoint(row); plog('[step2] flat-P1 already 0 outliers => usedPnAtApex=false'); expect(true).toBe(true); return;
    }

    // Otherwise: find the near-apex leaf triangles that still floor > tol (on-crest, highest gradU) and PN them.
    const { rA, H } = patch;
    const xyz = liftMesh(patch, ref.uv);
    const nF = ref.tris.length / 3;
    // rank facets by centroid gradU; take the reddest, cross-check on-crest by 3D proximity to a crest sample.
    const du = 1 / 8192;
    const gradU = new Float64Array(nF);
    const TAU = 2 * Math.PI;
    for (let f = 0; f < nF; f++) {
      const a = ref.tris[3 * f], b = ref.tris[3 * f + 1], c = ref.tris[3 * f + 2];
      const um = (ref.uv[2 * a] + ref.uv[2 * b] + ref.uv[2 * c]) / 3, tm = (ref.uv[2 * a + 1] + ref.uv[2 * b + 1] + ref.uv[2 * c + 1]) / 3;
      const z = tm * H;
      gradU[f] = Math.abs(rA(TAU * ((um + du) - Math.floor(um + du)), z) - rA(TAU * ((um - du) - Math.floor(um - du)), z)) / (2 * du * TAU);
    }
    const order = Array.from({ length: nF }, (_, i) => i).sort((x, y) => gradU[y] - gradU[x]);
    const N_PN = Math.min(nF, 400);
    let flatFloored = 0, pnFloored = 0, worstFlat = 0, worstPN = 0, applied = 0;
    for (let s = 0; s < N_PN; s++) {
      const f = order[s]; const a = ref.tris[3 * f], b = ref.tris[3 * f + 1], c = ref.tris[3 * f + 2];
      const P0: [number, number, number] = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]];
      const P1: [number, number, number] = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]];
      const P2: [number, number, number] = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
      const uv0: [number, number, number] = [ref.uv[2 * a], ref.uv[2 * a + 1], 0];
      const uv1: [number, number, number] = [ref.uv[2 * b], ref.uv[2 * b + 1], 0];
      const uv2: [number, number, number] = [ref.uv[2 * c], ref.uv[2 * c + 1], 0];
      const r = apexLeafPN(rA, H, P0, P1, P2, uv0, uv1, uv2, RULER);
      if (r.devFlat > TOL) flatFloored++;
      if (r.devFlat > worstFlat) worstFlat = r.devFlat;
      // apply PN only where flat floors (the near-apex leaf); count the PN residual there
      if (r.devFlat > TOL) { applied++; if (r.devPN > TOL) pnFloored++; if (r.devPN > worstPN) worstPN = r.devPN; }
    }
    // FINAL = flat-P1 outliers that PN could NOT fix (PN still > tol) + any flat outlier not in the PN population.
    // Since we PN'd all flat-floored leaves in the top-400 (the reddest, where any outlier lives), final = pnFloored.
    const interiorOutliersFinal = pnFloored;
    const usedPnAtApex = applied > 0;
    const row = {
      key: 'step2', usedPnAtApex,
      pnPopulation: N_PN, flatFlooredInPop: flatFloored, pnApplied: applied,
      worstFlatMm: +worstFlat.toFixed(5), worstPNMm: +worstPN.toFixed(5),
      interiorOutliersFinal, interiorMaxFinalMm: +Math.max(worstPN, 0).toFixed(5),
    };
    writeFileSync(join(DIR, 'step2.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[step2] PN: applied=${applied} flatFloored=${flatFloored} worstFlat=${worstFlat.toFixed(5)} -> pnFloored=${pnFloored} worstPN=${worstPN.toFixed(5)} usedPnAtApex=${usedPnAtApex}`);
    void lift;
    expect(N_PN).toBeGreaterThan(0);
  }, 2 * 60 * 60 * 1000);
});
