// _pf_costgap_prod_domain.test.ts — DEV-ONLY (PF_TIERC_COSTGAP=1). E-2026-07-08-TIERC-COSTGAP (V11m, ROUND 5).
//
// THE DISCRIMINATOR: run the RESEARCH M-square kernel VERBATIM (its own extractProtectedComplex + graded seedMesh +
// refineInteriorMsquare honest-brute STOP loop) on the EXACT PRODUCTION multi-bay gate domain
// u[0.05,0.15] × t[0.38,0.62], tol 0.01, whole-mesh full-azimuth guard. Adjudicate:
//   (i)  research converges to 0 UNDER 6M on this domain  ⇒ MECHANISM-GAP CONFIRMED (ablate: uniform-seed control)
//   (ii) research ALSO explodes / doesn't reach 0         ⇒ GENUINE-COST FRONTIER (band expensive irrespective of mech)
//
// V3's 1.05M was on makeGothicPatch(4,12) = u[-0.0576,0.1091] × t[0.70,0.80] (protected-κ apex tier). The production
// gate is t[0.38,0.62] (the V11d raw-κ DEAD ZONE / smooth arch arc). DISJOINT t-bands (see spec §V11m step 1).
//
// The ONLY change vs _pf_perfect_gothic_msquare.test.ts is the PatchDef domain: we build it EXPLICITLY at the
// production gate domain instead of via findApexJunction. Same rA/dims (GothicArches H=120 Rb40 Rt50). Kernel code
// (extract/seed/refine/guard/lift) is imported READ-ONLY and unmodified.
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib + _pf_perfectMesherMsquareLib
// READ-ONLY. Writes ONLY research/exchange/_tierc_costgap/. Env sub-gate + row-exists skip => resumable.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution, buildRadiusFn } from './labkit';
import type { StyleId, } from '../../src/geometry/types';
import {
  extractProtectedComplex, seedMesh, acceptanceGuard, liftMesh, type PatchDef,
} from './_pf_perfectMesherLib';
import { refineInteriorBrute } from './_pf_perfectMesherBruteLib';
import { refineInteriorMsquare } from './_pf_perfectMesherMsquareLib';

const TAU = 2 * Math.PI;
const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_tierc_costgap');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return (JSON.parse(l) as { key?: string }).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${String(row.key)}] ${JSON.stringify(row)}`); };
const persistMesh = (name: string, uv: number[], tris: number[]): void => {
  mkdirSync(DIR, { recursive: true });
  const buf = Buffer.alloc(8 + uv.length * 8 + tris.length * 4);
  buf.writeInt32LE(uv.length / 2, 0); buf.writeInt32LE(tris.length / 3, 4);
  let o = 8; for (let i = 0; i < uv.length; i++) { buf.writeDoubleLE(uv[i], o); o += 8; }
  for (let i = 0; i < tris.length; i++) { buf.writeInt32LE(tris[i], o); o += 4; }
  writeFileSync(join(DIR, name), buf);
};

// ── build a PatchDef at an EXPLICIT domain (same style/dims as makeGothicPatch, domain not from findApexJunction) ──
function makePatchExplicit(uLo: number, uHi: number, tLo: number, tHi: number): PatchDef {
  const dims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
  const H = dims.H;
  const rMean = 45;
  const arcPerU = TAU * rMean;
  const rA = buildRadiusFn('GothicArches' as StyleId, {}, dims);
  return { rA, H, rMean, arcPerU, uLo, uHi, tLo, tHi };
}

// production gate domain (VERBATIM from src/.../tierC/_junctionGate.test.ts: ULO 0.05, uHi ULO+0.1, tLo 0.38, tHi 0.62)
const P_ULO = Number(process.env.PF_CG_ULO ?? 0.05);
const P_UHI = Number(process.env.PF_CG_UHI ?? 0.15);
const P_TLO = Number(process.env.PF_CG_TLO ?? 0.38);
const P_THI = Number(process.env.PF_CG_THI ?? 0.62);
// research-kernel refine controls: mirror the V3 msquare non-smoke params (N_ROW/N_COL 200, MIN_AMP 0.03,
// BG_ARC 0.16, MAX_PASS 16, LOOP_NTH 512, guard TOP_FRAC 0.06 CAP 400). These are the exact V3 knobs.
const N_ROW = Number(process.env.PF_CG_NROW ?? 200), N_COL = Number(process.env.PF_CG_NCOL ?? 200), MIN_AMP = 0.03;
const BG_ARC_MM = Number(process.env.PF_CG_BG ?? 0.16);
const MAX_PASS = Number(process.env.PF_CG_PASS ?? 16);
const TOP_FRAC = 0.06;
const GUARD_CAP = 400;
const LOOP_NTH = Number(process.env.PF_CG_LNTH ?? 512);
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 80, zBandMm: 3, refineIters: 40 };
// full-pot projection: V3 used FULL_BAYS=72 scaling by trisPerBay. Here the domain is a fixed u-width 0.10 = ~7.2 bays
// (bayDu≈1/72). Full ring = 1.0 u. So projection = tris × (1.0 / uWidth) × (fullTspan / tSpan)? V3 scaled ONLY by bays
// at the apex ROW (short z-band). To compare apples-to-apples with V3's projectedFullMeshTris we replicate its rule:
// projected = trisPerBay × 72, where bays = uWidth / bayDu. We report BOTH that and a raw density projection.
const BAY_DU = 1 / 72;
const N_BAYS = (P_UHI - P_ULO) / BAY_DU;

function projectV3Rule(finalTris: number): number { return Math.round((finalTris / N_BAYS) * 72); }

// watertight audit with a NON-VACUOUS injected-crack control (interior-edge finder → shared-by-3).
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

describe('pf-costgap: research M-square kernel VERBATIM on the PRODUCTION gate domain', () => {
  const buildBase = (): { patch: PatchDef; pc: ReturnType<typeof extractProtectedComplex>; seed: ReturnType<typeof seedMesh> } => {
    const patch = makePatchExplicit(P_ULO, P_UHI, P_TLO, P_THI);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    const seed = seedMesh(patch, pc, BG_ARC_MM);
    return { patch, pc, seed };
  };

  // ── DISCRIMINATOR: M-square research kernel on the production domain ──
  it.skipIf(process.env.PF_TIERC_COSTGAP !== '1')('discriminator: M-square kernel on u[0.05,0.15]xt[0.38,0.62]', () => {
    if (rowExists('msquare_prod')) { plog('msquare_prod exists, skip'); return; }
    const { patch, pc, seed } = buildBase();
    plog(`[msq] DOMAIN u[${P_ULO},${P_UHI}] t[${P_TLO},${P_THI}] nBays=${N_BAYS.toFixed(2)} | complex fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length} crest3D=${pc.crestSamples3D.length} | seed ${seed.uv.length / 2}v ${seed.tris.length / 3}t`);
    const t0 = Date.now();
    const r = refineInteriorMsquare(patch, { uv: seed.uv.slice(), tris: seed.tris.slice() }, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
      const proj = projectV3Rule(s.nTris);
      plog(`[msq pass ${s.pass}] tris=${s.nTris} proj=${proj} out=${s.nOutBrute} worst=${s.worstBrute} insF=${s.nInsertedFlank} insC=${s.nInsertedCrest} ${(s.ms / 1000).toFixed(1)}s`);
      appendFileSync(join(DIR, 'msquare_passes.ndjson'), JSON.stringify({ ...s, proj }) + '\n');
    });
    const xyz = liftMesh(patch, r.uv);
    const wt = watertight(xyz, r.tris, r.uv.length);
    const guard = acceptanceGuard(patch, r.uv, r.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(r.tris) });
    const finalTris = r.tris.length / 3;
    persistMesh('msquare_prod_mesh.bin', r.uv, r.tris);
    const projectedFullMeshTris = projectV3Rule(finalTris);
    const row = {
      key: 'msquare_prod', mode: 'M-square', domain: { uLo: P_ULO, uHi: P_UHI, tLo: P_TLO, tHi: P_THI }, nBays: +N_BAYS.toFixed(2),
      tris: finalTris, trisPerBay: +(finalTris / N_BAYS).toFixed(0), projectedFullMeshTris, budget6M: projectedFullMeshTris <= 6_000_000,
      refinePasses: r.passes, capped: r.capped,
      interiorOutliers: guard.interiorOutliers, interiorMaxMm: guard.interiorMaxMm, onCrest: guard.onCrestOutliers, off: guard.offCrestOutliers, guardP99: guard.p99,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
      elapsedS: +((Date.now() - t0) / 1000).toFixed(0),
    };
    writeFileSync(join(DIR, 'msquare_prod.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[msq] DONE outliers=${guard.interiorOutliers} max=${guard.interiorMaxMm} tris=${finalTris} proj=${projectedFullMeshTris} budget6M=${projectedFullMeshTris <= 6_000_000} converged=${!r.capped && guard.interiorOutliers === 0} nonVac=${wt.nonVacuous}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── ABLATION (runs regardless; the adjudication decides which arm is load-bearing) — UNIFORM seed + edge-mode RED ──
  // This is the PRODUCTION mechanism (uniform bgArcMm seed + isotropic RED 1→4) on the SAME research harness/domain.
  // If M-square converges under 6M and this EXPLODES, the delta is isolated to the M-square seed/graded refine.
  it.skipIf(process.env.PF_TIERC_COSTGAP !== '1')('ablation: uniform-seed edge-mode RED on the SAME domain', () => {
    if (rowExists('edge_prod')) { plog('edge_prod exists, skip'); return; }
    const { patch, pc, seed } = buildBase();
    plog(`[edge] ablation edge-mode RED on prod domain | seed ${seed.uv.length / 2}v ${seed.tris.length / 3}t`);
    const t0 = Date.now();
    const rr = refineInteriorBrute(patch, { uv: seed.uv.slice(), tris: seed.tris.slice() }, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
      const proj = projectV3Rule(s.nTris);
      plog(`[edge pass ${s.pass}] tris=${s.nTris} proj=${proj} out=${s.nOutBrute} worst=${s.worstBrute} ins=${s.nInserted} ${(s.ms / 1000).toFixed(1)}s`);
      appendFileSync(join(DIR, 'edge_passes.ndjson'), JSON.stringify({ ...s, proj }) + '\n');
    }, 'edge');
    const xyz = liftMesh(patch, rr.uv);
    const wt = watertight(xyz, rr.tris, rr.uv.length);
    const guard = acceptanceGuard(patch, rr.uv, rr.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(rr.tris) });
    const finalTris = rr.tris.length / 3;
    persistMesh('edge_prod_mesh.bin', rr.uv, rr.tris);
    const projectedFullMeshTris = projectV3Rule(finalTris);
    const row = {
      key: 'edge_prod', mode: 'edge-arclen', domain: { uLo: P_ULO, uHi: P_UHI, tLo: P_TLO, tHi: P_THI }, nBays: +N_BAYS.toFixed(2),
      tris: finalTris, trisPerBay: +(finalTris / N_BAYS).toFixed(0), projectedFullMeshTris, budget6M: projectedFullMeshTris <= 6_000_000,
      refinePasses: rr.passes, capped: rr.capped,
      interiorOutliers: guard.interiorOutliers, interiorMaxMm: guard.interiorMaxMm, onCrest: guard.onCrestOutliers, off: guard.offCrestOutliers, guardP99: guard.p99,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
      elapsedS: +((Date.now() - t0) / 1000).toFixed(0),
    };
    writeFileSync(join(DIR, 'edge_prod.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[edge] DONE outliers=${guard.interiorOutliers} max=${guard.interiorMaxMm} tris=${finalTris} proj=${projectedFullMeshTris} budget6M=${projectedFullMeshTris <= 6_000_000} capped=${rr.capped} nonVac=${wt.nonVacuous}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
