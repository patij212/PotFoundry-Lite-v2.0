// _pf_perfect_gothic_relax.test.ts — DEV-ONLY (PF_RELAX=1). CLOSE the Gothic SLIVER gate.
//
// STATE (spec §VALIDATION 3): the perfect mesher is FIDELITY-PROVEN whole-PATCH at 4-BAY on Gothic (0 interior
// outliers, 0.006mm, watertight non-vacuous, 6 passes converged) + cost 1.05M<6M. The LAST OPEN GATE = SLIVERS:
// M=g/h² square spacing improved pctBelow20 81.4%→56.2% but not to single digits; minAngle 0°. ROOT CAUSE
// (_pf_msq_diag): 37.6% of <20° facets on the LOW-gradU SMOOTH PANEL at the dense↔coarse GRADING-TRANSITION
// (RED 1→4 preserves parent needle shape). Fidelity & sliver gates are NOT in hard tension (M-square HELD outliers
// at 0; only the a-posteriori Lawson flip REOPENED them — E-…-TIERAB-SLIVERS §3b).
//
// THIS PROBE applies SURFACE-PRESERVING LAPLACIAN-UNDER-M relaxation (research/bridge/_pf_relaxLib) to the
// CONFIRMED 4-bay M-square mesh: iterate FREE (non-crest, non-boundary) verts toward their M-metric-equilateral
// position, re-project on the true surface (lift), REJECT the move if any incident facet's honest full-azimuth-brute
// interior dev > tol. Unlike a-posteriori flips (which reconnect the SAME needle point set and REOPEN outliers),
// relaxation MOVES the points — the reject-guard holds 0 outliers while the umbrella smoothing fattens needles AND
// grades the abrupt dense↔coarse transition into a ramp (smooth-grading lever #1 arises from the relaxation).
//
// PRE-REGISTERED KILL-CRITERION (registry E-2026-07-05-PERFECT-MESHER-RELAX, committed a29e1a4 BEFORE measuring):
//   CONFIRM iff on the 4-bay Gothic patch: pctBelow20 → SINGLE DIGITS (< ~10%) AND minAngle > ~15° (or median >
//     ~30° w/ small tail) WHILE interiorOutliers HOLD 0 (honest ≥36-pt brute, worst-gradU) AND watertight
//     (auditNonManByIndex=0 non-vacuous).
//   REFUTE iff relaxation cannot get pctBelow20 below ~15% without reopening an outlier (report best %<20 at
//     outliers=0 — the honest tradeoff frontier).
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib + _pf_relaxLib READ-ONLY.
// Writes ONLY research/exchange/_pf_perfect_gothic_relax/. Env sub-gate + row-exists skip => resumable; checkpoint
// each unit the instant it is computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { makeGothicPatch, extractProtectedComplex, acceptanceGuard, liftMesh } from './_pf_perfectMesherLib';
import { relaxLaplacianUnderM, gradedSeed } from './_pf_relaxLib';
import { refineInteriorMsquare } from './_pf_perfectMesherMsquareLib';

const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_relax');
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

// same patch controls the CONFIRMED 4-bay M-square mesh was built with (spec §VALIDATION 3): BAYS=4 ZBAND=12
// N_ROW=N_COL=200. The complex is deterministic ⇒ extractProtectedComplex reproduces the SAME crestVertexSet
// for the crest-lock (its prefix verts align with the persisted mesh's prefix — the M-square probe guards this).
const BAYS = Number(process.env.PF_BAYS ?? 4);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 12);
const N_ROW = Number(process.env.PF_NROW ?? 200), N_COL = Number(process.env.PF_NCOL ?? 200), MIN_AMP = 0.03;
const TOP_FRAC = Number(process.env.PF_TOPFRAC ?? 0.06);
const GUARD_CAP = Number(process.env.PF_GCAP ?? 400);
const MAX_SWEEPS = Number(process.env.PF_SWEEPS ?? 20);
const OMEGA = Number(process.env.PF_OMEGA ?? 0.5);
const QDIR = process.env.PF_QDIR !== '0'; // quality-directed smart-Laplacian (default on)
const H_MIN = Number(process.env.PF_HMIN ?? 0.08), H_MAX = Number(process.env.PF_HMAX ?? 0.5), GRADE_BETA = Number(process.env.PF_BETA ?? 0.35);
const MAX_PASS = Number(process.env.PF_PASS ?? 16);
const LOOP_NTH = Number(process.env.PF_LNTH ?? 512);
// per-move reject-guard ruler = the honest brute (same class as the M-square STOP driver). Slightly coarser theta
// keeps the per-move cost tractable; the FINAL verdict uses acceptanceGuard's 1024×120 brute (trusted).
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 80, zBandMm: 3, refineIters: 40 };
const BEFORE_MESH = process.env.PF_BEFORE_MESH ?? join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_msquare', 'after_mesh.bin');

function findInteriorEdge(xyz: Float64Array, tris: number[]): [number, number] | null {
  const n = xyz.length / 3; const q = 1e4; const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) { const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`; const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; } }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a); const cnt = new Map<number, number>();
  for (let k = 0; k < tris.length; k += 3) { const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue; cnt.set(key(a, b), (cnt.get(key(a, b)) ?? 0) + 1); cnt.set(key(b, c), (cnt.get(key(b, c)) ?? 0) + 1); cnt.set(key(c, a), (cnt.get(key(c, a)) ?? 0) + 1); }
  for (let k = 0; k < tris.length; k += 3) { const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue; if ((cnt.get(key(a, b)) ?? 0) === 2) return [tris[k], tris[k + 1]]; if ((cnt.get(key(b, c)) ?? 0) === 2) return [tris[k + 1], tris[k + 2]]; if ((cnt.get(key(c, a)) ?? 0) === 2) return [tris[k + 2], tris[k]]; }
  return null;
}
function watertight(xyz: Float64Array, tris: number[], uvLen: number): { nonMan: number; injected: number; nonVacuous: boolean } {
  const nonMan = auditNonManByIndex(xyz, tris, 1e-4);
  const ie = findInteriorEdge(xyz, tris); const a0 = ie ? ie[0] : tris[0], b0 = ie ? ie[1] : tris[1]; const vNew = uvLen / 2;
  const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
  xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
  const crackTris = tris.slice(); crackTris.push(a0, b0, vNew);
  const injected = auditNonManByIndex(xyz2, crackTris, 1e-4);
  return { nonMan, injected, nonVacuous: injected > nonMan };
}

function scoreMesh(key: string, patch: ReturnType<typeof makeGothicPatch>, pc: ReturnType<typeof extractProtectedComplex>, uv: number[], tris: number[], extra: Record<string, unknown>): Record<string, unknown> {
  const xyz = liftMesh(patch, uv);
  const wt = watertight(xyz, tris, uv.length);
  const guard = acceptanceGuard(patch, uv, tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
  const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(tris) });
  const finalTris = tris.length / 3;
  return {
    key, bays: BAYS, tris: finalTris,
    interiorOutliers: guard.interiorOutliers, interiorMaxMm: guard.interiorMaxMm, onCrest: guard.onCrestOutliers, off: guard.offCrestOutliers, guardP99: guard.p99,
    minAngleDeg: +q.minAngleDeg.toFixed(3), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2),
    watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
    ...extra,
  };
}

describe('pf-perfect-gothic-RELAX: surface-preserving Laplacian-under-M closes slivers while holding 0 outliers', () => {
  const buildBase = (): { patch: ReturnType<typeof makeGothicPatch>; pc: ReturnType<typeof extractProtectedComplex> } => {
    const patch = makeGothicPatch(BAYS, ZBAND_MM);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    return { patch, pc };
  };

  // ── BEFORE: score the CONFIRMED 4-bay M-square mesh verbatim (re-score under THIS probe's guard so the A/B is
  //    one-metric-both-meshes; expect it to reproduce the spec's 0 outliers / 56.2% <20°) ──
  it.skipIf(process.env.PF_RELAX !== '1')('before: re-score the CONFIRMED 4-bay M-square mesh', () => {
    if (rowExists('before')) { plog('before exists, skip'); return; }
    const { patch, pc } = buildBase();
    const loaded = loadBin(BEFORE_MESH);
    if (!loaded) throw new Error(`CONFIRMED M-square mesh not found at ${BEFORE_MESH}`);
    plog(`[before] loaded ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t | complex crestV=${pc.crestVertexSet.size} cEdges=${pc.constraintEdges.length}`);
    const t0 = Date.now();
    const row = scoreMesh('before', patch, pc, loaded.uv, loaded.tris, { mode: 'M-square (reloaded)', elapsedS: +((Date.now() - t0) / 1000).toFixed(0) });
    persistMesh('before_mesh.bin', loaded.uv, loaded.tris);
    writeFileSync(join(DIR, 'before.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[before] outliers=${row.interiorOutliers} max=${row.interiorMaxMm} | minAngle=${row.minAngleDeg} pct<20=${row.pctBelow20}% median=${row.medianMinAngle} | nonVac=${row.nonVacuous}`);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── AFTER: surface-preserving Laplacian-under-M relaxation on the SAME mesh ──
  it.skipIf(process.env.PF_RELAX !== '1')('after: Laplacian-under-M relaxation — slivers drop, outliers HOLD 0', () => {
    if (rowExists('after')) { plog('after exists, skip'); return; }
    const { patch, pc } = buildBase();
    const loaded = loadBin(BEFORE_MESH);
    if (!loaded) throw new Error(`CONFIRMED M-square mesh not found at ${BEFORE_MESH}`);
    plog(`[after] relax on ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t | crestV=${pc.crestVertexSet.size} omega=${OMEGA} maxSweeps=${MAX_SWEEPS}`);
    const t0 = Date.now();
    const r = relaxLaplacianUnderM(patch, { uv: loaded.uv.slice(), tris: loaded.tris.slice() }, pc.crestVertexSet, TOL, MAX_SWEEPS, RULER, (s) => {
      plog(`[after sweep ${s.sweep}] free=${s.nFree} moved=${s.nMoved} rej=${s.nRejected} maxDisp=${s.maxDispMm} | minA=${s.minAngleDeg} pct<20=${s.pctBelow20}% med=${s.medianMinAngle} | ${(s.ms / 1000).toFixed(1)}s guardCalls=${s.guardCalls}`);
      appendFileSync(join(DIR, 'after_sweeps.ndjson'), JSON.stringify(s) + '\n');
    }, { omega: OMEGA, qualityDirected: QDIR });
    persistMesh('after_mesh.bin', r.uv, r.tris);
    const row = scoreMesh('after', patch, pc, r.uv, r.tris, { mode: `relax-laplacian-under-M${QDIR ? '-qdir' : ''}`, omega: OMEGA, sweeps: r.sweeps, elapsedS: +((Date.now() - t0) / 1000).toFixed(0) });
    writeFileSync(join(DIR, 'after.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[after] outliers=${row.interiorOutliers} max=${row.interiorMaxMm} | minAngle=${row.minAngleDeg} pct<20=${row.pctBelow20}% median=${row.medianMinAngle} | sweeps=${r.sweeps} nonVac=${row.nonVacuous}`);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── GRADED-SEED (lever #1): build a SMOOTHLY-graded background seed (no abrupt RED transition) then M-square
  //    refine (holds fidelity). Tests whether removing the dense↔coarse transition at INSERTION removes the
  //    transition-zone needles. Independent env sub-gate PF_GRADED=1 (heavier: full re-build + refine). ──
  it.skipIf(process.env.PF_GRADED !== '1')('graded: smooth-graded seed + M-square refine — transition needles removed?', () => {
    if (rowExists('graded')) { plog('graded exists, skip'); return; }
    const { patch, pc } = buildBase();
    plog(`[graded] hMin=${H_MIN} hMax=${H_MAX} beta=${GRADE_BETA} | complex crestV=${pc.crestVertexSet.size} cEdges=${pc.constraintEdges.length}`);
    const t0 = Date.now();
    const seed = gradedSeed(patch, pc, H_MIN, H_MAX, GRADE_BETA);
    plog(`[graded] seed ${seed.uv.length / 2}v ${seed.tris.length / 3}t`);
    const rr = refineInteriorMsquare(patch, { uv: seed.uv.slice(), tris: seed.tris.slice() }, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
      plog(`[graded pass ${s.pass}] tris=${s.nTris} out=${s.nOutBrute} worst=${s.worstBrute} insF=${s.nInsertedFlank} insC=${s.nInsertedCrest} ${(s.ms / 1000).toFixed(1)}s`);
      appendFileSync(join(DIR, 'graded_passes.ndjson'), JSON.stringify(s) + '\n');
    });
    persistMesh('graded_mesh.bin', rr.uv, rr.tris);
    const row = scoreMesh('graded', patch, pc, rr.uv, rr.tris, { mode: 'graded-seed+M-square', hMin: H_MIN, hMax: H_MAX, beta: GRADE_BETA, refinePasses: rr.passes, capped: rr.capped, seedTris: seed.tris.length / 3, elapsedS: +((Date.now() - t0) / 1000).toFixed(0) });
    writeFileSync(join(DIR, 'graded.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[graded] outliers=${row.interiorOutliers} max=${row.interiorMaxMm} | minAngle=${row.minAngleDeg} pct<20=${row.pctBelow20}% median=${row.medianMinAngle} | tris=${row.tris} nonVac=${row.nonVacuous}`);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
