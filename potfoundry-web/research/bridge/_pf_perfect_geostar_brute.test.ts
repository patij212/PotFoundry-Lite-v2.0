// _pf_perfect_geostar_brute.test.ts — DEV-ONLY (PF_PERFECTGS=1). Applies the HONEST-BRUTE-DRIVEN perfect-mesher
// kernel (proven on Gothic, commit cc9c5d8 topology + brute-driven fidelity) to GeometricStar — the OTHER
// count-unstable cusp (chevron strapwork). The spec (research/lab/2026-07-04-perfect-mesher-spec.md) expects a
// FINITE-WIDTH 130-137° kink, plausibly EASIER than Gothic's zero-width knife-edge.
//
// ONE change vs the Gothic probe: makeGothicPatch -> makeGeoStarPatch. The whole downstream pipeline
// (extractProtectedComplex nearest-neighbour crest linking + planarizeMM X-split + seedMesh CDT-lock +
// refineInteriorBrute honest full-azimuth STOP + acceptanceGuard >=36-pt worst-gradU brute) is style-agnostic and
// COUNT-AGNOSTIC (it births/dies chains, does NOT pin vanished straps like the doubled-crest column primitive that
// floored GeoStar at 26mm in E-2026-07-04-DCGS).
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE measuring — SAME as the Gothic crux):
//   CONFIRM iff interiorOutliersFinal = 0 (honest >=36-pt brute, worst-gradU pop) AND watertight
//     (auditNonManByIndex = 0 NON-VACUOUS) AND manifold, at <=6M-equiv. Note usedPnAtApex (false = flat-P1 alone).
//   REFUTE iff BOTH brute-driven flat-P1 AND scoped-apex-PN floor > 0.02 on-crest => GeoStar's chevron apex is
//     genuinely below a P2 element's reach OR the count-instability breaks the topology pipeline (name which).
//   Report FLAT-P1 (interiorOutliersFlatP1 / interiorMaxFlatP1Mm) SEPARATELY from FINAL.
//
// ISOLATION: NEW files. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib + _pf_geostarPatchLib
// READ-ONLY. Writes ONLY research/exchange/_pf_perfect_geostar_brute/. Env sub-gate + row-exists skip => resumable.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import {
  extractProtectedComplex, seedMesh, acceptanceGuard, liftMesh, lift, rowCrests, type PatchDef,
} from './_pf_perfectMesherLib';
import { refineInteriorBrute, apexLeafPN } from './_pf_perfectMesherBruteLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

const TOL = 0.01;
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_perfect_geostar_brute_smoke' : '_pf_perfect_geostar_brute');
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

// Patch controls. tCenter=0.08 = a HIGH-RELIEF strap band (RECON: amp ~1.7mm, 16-32 crests). zBandMm spans a strap
// birth/death (relief fades to 0 by t~0.14) so the count-instability IS exercised inside the patch.
const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 3 : 5));
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 6 : 10));
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const MIN_AMP = 0.03;
const N_ROW = SMOKE ? 120 : 260, N_COL = SMOKE ? 120 : 260;
const BG_ARC_MM = Number(process.env.PF_BG ?? (SMOKE ? 0.35 : 0.11));
const MAX_PASS = Number(process.env.PF_PASS ?? (SMOKE ? 12 : 40));
const TOP_FRAC = Number(process.env.PF_TOPFRAC ?? (SMOKE ? 0.03 : 0.06));
const GUARD_CAP = Number(process.env.PF_GCAP ?? 400);

const LOOP_NTH = Number(process.env.PF_LNTH ?? (SMOKE ? 384 : 512));
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 80, zBandMm: 3, refineIters: 40 };
const REFINE_MODE: 'point' | 'edge' = (process.env.PF_MODE === 'point' ? 'point' : 'edge'); // default EDGE (geometric apex convergence)

describe('pf-perfect-GEOSTAR-BRUTE: honest-brute-driven kernel on the chevron-strap count-unstable cusp', () => {
  // ── PN-MECH (cheap, standalone): reconstruct the worst GeoStar chevron apex facet at facet-scale and compare
  //    flat-P1 interior true-3D vs one-sided Vlachos PN under the SAME honest brute. Gated PF_PNMECH=1. ──
  it.skipIf(process.env.PF_PNMECH !== '1')('pn-mech: flat vs one-sided PN on a reconstructed chevron apex facet', () => {
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    const { rA, H } = patch;
    const uMid = (patch.uLo + patch.uHi) / 2, tMid = (patch.tLo + patch.tHi) / 2;
    const uc = rowCrests(rA, tMid, H, patch.uLo, patch.uHi, 8000, 0.03);
    if (!uc.length) { plog('[pn-mech] no crest at tMid; trying tCenter band'); }
    const src = uc.length ? uc : rowCrests(rA, T_CENTER, H, patch.uLo, patch.uHi, 8000, 0.03);
    if (!src.length) { plog('[pn-mech] no crest'); expect(true).toBe(true); return; }
    let uCrest = src[0]; for (const u of src) if (Math.abs(u - uMid) < Math.abs(uCrest - uMid)) uCrest = u;
    const R = { gnScreen: 0.006, preFilter: 0.006, nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 };
    const rows: Array<Record<string, unknown>> = [];
    for (const du of [0.001, 0.0005, 0.00025, 0.000125, 0.0000625]) {
      const dt = (du * patch.arcPerU) / H;
      const P0 = lift(rA, uCrest - du, tMid - dt / 2, H) as [number, number, number];
      const P1 = lift(rA, uCrest + du, tMid - dt / 2, H) as [number, number, number];
      const P2 = lift(rA, uCrest, tMid + dt / 2, H) as [number, number, number];
      const r = apexLeafPN(rA, H, P0, P1, P2, [uCrest - du, tMid - dt / 2, 0], [uCrest + du, tMid - dt / 2, 0], [uCrest, tMid + dt / 2, 0], R);
      const facetArcMm = +(du * patch.arcPerU * 2).toFixed(4);
      rows.push({ du, facetArcMm, dtZmm: +(dt * H).toFixed(4), devFlat: +r.devFlat.toFixed(5), devPN: +r.devPN.toFixed(5) });
      plog(`[pn-mech] du=${du} arc=${facetArcMm}mm zH=${(dt * H).toFixed(3)}mm devFlat=${r.devFlat.toFixed(5)} devPN=${r.devPN.toFixed(5)}`);
    }
    writeFileSync(join(DIR, 'pn_mech.json'), JSON.stringify({ uCrest, tMid, rows }, null, 2));
    checkpoint({ key: 'pn-mech', uCrest: +uCrest.toFixed(5), rows });
    expect(rows.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  // ── STEP 1: build END-TO-END with the BRUTE-DRIVEN refine loop + honest guard. ──
  it.skipIf(process.env.PF_PERFECTGS !== '1')('step1: brute-driven flat-P1 refine -> honest guard', () => {
    if (rowExists('step1')) { plog('step1 exists, skip'); return; }
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    plog(`[step1] patch: uLo=${patch.uLo.toFixed(5)} uHi=${patch.uHi.toFixed(5)} tLo=${patch.tLo.toFixed(4)} tHi=${patch.tHi.toFixed(4)} arcPerU=${patch.arcPerU.toFixed(2)}`);
    const t0 = Date.now();
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[step1] extracted: fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length} crestSamples=${pc.crestSamples3D.length}`);

    let ref = loadMesh();
    if (ref) {
      plog(`[step1] RESUMED from persisted mesh: tris=${ref.tris.length / 3} verts=${ref.uv.length / 2} passes=${ref.passes} capped=${ref.capped}`);
    } else {
      const seed = seedMesh(patch, pc, BG_ARC_MM);
      plog(`[step1] seed: verts=${seed.uv.length / 2} tris=${seed.tris.length / 3}`);
      const r = refineInteriorBrute(patch, seed, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
        plog(`[brute-refine pass ${s.pass}] tris=${s.nTris} scored=${s.nScored} outBRUTE=${s.nOutBrute} worstBRUTE=${s.worstBrute} inserted=${s.nInserted} bruteCalls=${s.bruteCalls} ${(s.ms / 1000).toFixed(1)}s`);
        appendFileSync(join(DIR, 'refine_passes.ndjson'), JSON.stringify(s) + '\n');
      }, REFINE_MODE);
      ref = { uv: r.uv, tris: r.tris, passes: r.passes, capped: r.capped };
      plog(`[step1] brute-refine done: passes=${r.passes} capped=${r.capped} finalTris=${r.tris.length / 3} verts=${r.uv.length / 2} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      persistMesh(ref.uv, ref.tris, ref.passes, ref.capped);
    }

    // ── watertight audit (by INDEX, non-vacuous control) ──
    const xyz = liftMesh(patch, ref.uv);
    const nonMan = auditNonManByIndex(xyz, ref.tris, 1e-4);
    const a0 = ref.tris[0], b0 = ref.tris[1]; const vNew = ref.uv.length / 2;
    const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
    xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
    const crackTris = ref.tris.slice(); crackTris.push(a0, b0, vNew);
    const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
    const nonVacuous = nonManCracked > nonMan;
    plog(`[step1] watertight: nonMan=${nonMan} nonManInjected=${nonManCracked} nonVacuous=${nonVacuous}`);

    // ── honest acceptance guard (>=36-pt sampler, worst-gradU top-400, full-azimuth brute) ──
    const tG = Date.now();
    const guard = acceptanceGuard(patch, ref.uv, ref.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    plog(`[step1] GUARD: scored=${guard.nScored}/${guard.nFacets} interiorMax=${guard.interiorMaxMm} outliers=${guard.interiorOutliers} (onCrest=${guard.onCrestOutliers} off=${guard.offCrestOutliers}) p99=${guard.p99} gradU[${guard.gradUofScored.min}..${guard.gradUofScored.max}] in ${((Date.now() - tG) / 1000).toFixed(0)}s`);

    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(ref.tris) });
    plog(`[step1] slivers: minAngle=${q.minAngleDeg.toFixed(2)} median=${q.medianMinAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}%`);

    const finalTris = ref.tris.length / 3;
    const row = {
      key: 'step1', target: 'GeometricStar', loopDriver: 'brute', refineMode: REFINE_MODE,
      finalTris, refinePasses: ref.passes, capped: ref.capped,
      familyCount: pc.familyCount, residualCrossings: pc.residualCrossings, segU: pc.nSegU, segT: pc.nSegT,
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
  it.skipIf(process.env.PF_PERFECTGS !== '1')('step2: scoped near-apex one-sided PN (only if step1 floors)', () => {
    if (rowExists('step2')) { plog('step2 exists, skip'); return; }
    if (!existsSync(join(DIR, 'step1.json'))) { plog('step1.json missing — run step1 first'); return; }
    const s1 = JSON.parse(readFileSync(join(DIR, 'step1.json'), 'utf8'));
    const patch: PatchDef = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    void pc;
    const ref = loadMesh();
    if (!ref) { plog('no persisted mesh — run step1 first'); return; }

    if (Number(s1.interiorOutliersFlatP1) === 0) {
      const row = {
        key: 'step2', target: 'GeometricStar', usedPnAtApex: false, interiorOutliersFinal: 0, interiorMaxFinalMm: Number(s1.interiorMaxFlatP1Mm),
        note: 'flat-P1 brute-driven reached 0 outliers; scoped apex PN NOT needed',
      };
      checkpoint(row); plog('[step2] flat-P1 already 0 outliers => usedPnAtApex=false'); expect(true).toBe(true); return;
    }

    const { rA, H } = patch;
    const xyz = liftMesh(patch, ref.uv);
    const nF = ref.tris.length / 3;
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
      if (r.devFlat > TOL) { applied++; if (r.devPN > TOL) pnFloored++; if (r.devPN > worstPN) worstPN = r.devPN; }
    }
    const interiorOutliersFinal = pnFloored;
    const usedPnAtApex = applied > 0;
    const row = {
      key: 'step2', target: 'GeometricStar', usedPnAtApex,
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
