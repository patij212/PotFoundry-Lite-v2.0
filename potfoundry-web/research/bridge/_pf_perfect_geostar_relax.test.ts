// _pf_perfect_geostar_relax.test.ts — DEV-ONLY (PF_GSRELAX=1). SLIVER LEVER 13b: close the GeoStar SLIVER gate by
// targeting the RIGHT class — the OFF-crest PANEL grading-transition needles.
//
// STATE (spec §VALIDATION 8): the perfect mesher is FIDELITY-PROVEN whole-mesh 0-outlier on GeoStar
// (E-…-GEOSTAR-WHOLEMESH gate1: wholeMeshOutliers=0, max 0.01mm, watertight non-vacuous, 116889 tris) but SLIVERY
// (pctBelow20=21.7%, minAngle=0). DECISIVE re-localization (`_pf_geostar_hybrid_diag`): of the 21.7% <20° facets,
// **91% are OFF-crest** grading-transition needles on the smooth panel (offCrestSliv 23087 / nSliv 25369), only 9%
// on-crest. Every prior GeoStar sliver lever (strips, hybrid) attacked the 9% on-crest MINORITY. Lever#1 (smooth
// graded seed) + Lever#2 (Laplacian-under-M relaxation) were refuted ONLY on GOTHIC (whose slivers are the DIFFERENT
// crest-flank cross-curvature class, structurally guard-locked); they were NEVER run on GeoStar and target EXACTLY
// this off-crest free-vertex panel grading class.
//
// THIS PROBE applies SURFACE-PRESERVING LAPLACIAN-UNDER-M relaxation (research/bridge/_pf_relaxLib) to the CONFIRMED
// GeoStar whole-mesh mesh: iterate FREE (non-crest, non-boundary) panel verts toward their M-metric-equilateral
// position, re-project on the true surface (lift), REJECT the move if any incident facet's honest full-azimuth-brute
// interior dev > tol. Unlike Gothic's crest-flank needles (guard-rejected, structural), the panel sits where the
// surface is near-isotropic so a metric-equilateral move is NOT fidelity-forbidden — the reject-guard should PASS
// on the panel and fatten the needles.
//
// PRE-REGISTERED KILL-CRITERION (registry E-2026-07-05-PERFECT-MESHER-GEOSTAR-RELAX, committed BEFORE measuring):
//   CONFIRM iff pctBelow20 → SINGLE DIGIT (<~10%) AND minAngle sane (>~10° or median >~35°) WHILE wholeMeshOutliers
//     HOLD 0 (honest full-azimuth wholeMeshGuard, EVERY free facet — NOT top-N-gradU, per the banked MANDATE) AND
//     watertight (auditNonManByIndex=0 by index, non-vacuous).
//   REFUTE iff the panel needles persist (report honest pctBelow20 at 0-outlier) OR relaxation cannot get below ~15%
//     without reopening a whole-mesh outlier.
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_geostarPatchLib + _pf_relaxLib +
// _pf_wholeMeshGuardLib READ-ONLY. Writes ONLY research/exchange/_pf_perfect_geostar_relax/. Env sub-gate +
// row-exists skip + persisted after-mesh => resumable across the env's long-run kills; checkpoint each unit the
// INSTANT it is computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { extractProtectedComplex, liftMesh, lift } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { relaxLaplacianUnderM, gradedSeed } from './_pf_relaxLib';
import { facetInteriorBrute45 } from './_pf_wholeMeshGuardLib';
import { refineInteriorMsquare } from './_pf_perfectMesherMsquareLib';

const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_relax');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
// the CONFIRMED whole-mesh 0-outlier GeoStar mesh (E-…-GEOSTAR-WHOLEMESH)
const BEFORE_MESH = process.env.PF_BEFORE_MESH ?? join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh', 'refined_mesh.bin');

// patch controls — MUST MATCH the CONFIRMED wholemesh probe so extractProtectedComplex reproduces the SAME
// crestVertexSet prefix the persisted mesh was built with (spec §VALIDATION 2 / the wholemesh probe defaults).
const BAYS = Number(process.env.PF_BAYS ?? 5);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 10);
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const N_ROW = Number(process.env.PF_NROW ?? 260), N_COL = Number(process.env.PF_NCOL ?? 260), MIN_AMP = 0.03;
const MAX_SWEEPS = Number(process.env.PF_SWEEPS ?? 20);
const OMEGA = Number(process.env.PF_OMEGA ?? 0.5);
const QDIR = process.env.PF_QDIR !== '0'; // quality-directed smart-Laplacian (default on)
const LOOP_NTH = Number(process.env.PF_LNTH ?? 512); // per-move reject-guard theta (coarser = tractable per-move)
// graded-seed arm knobs
const H_MIN = Number(process.env.PF_HMIN ?? 0.06), H_MAX = Number(process.env.PF_HMAX ?? 0.4), GRADE_BETA = Number(process.env.PF_BETA ?? 0.35);
const MAX_PASS = Number(process.env.PF_PASS ?? 16);
// per-move reject-guard ruler = honest brute (same class as the wholemesh STOP driver), coarser theta for speed.
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 80, zBandMm: 3, refineIters: 40 };
// final-verdict whole-mesh guard ruler (trusted, per the wholemesh probe)
const GUARD_RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 };

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

// injected-crack non-vacuous control on an INTERIOR edge (a boundary edge already has incidence 1).
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

// ── RESUMABLE whole-mesh guard (survives the env's long-run kills) ─────────────────────────────────────────────
// Scores EVERY free facet with the honest 45-pt full-azimuth brute (identical ruler class to wholeMeshGuard), but
// CHECKPOINTS the dev array + cursor every CHUNK facets to a .bin keyed by a mesh signature. A kill resumes from the
// cursor. Reproduces wholeMeshGuard's outlier/on-crest/percentile outputs. NOT a lib change (probe-local).
interface WholeGuardOut { nFacets: number; wholeMeshMaxMm: number; wholeMeshOutliers: number; onCrestOutliers: number; offCrestOutliers: number; p50: number; p90: number; p99: number; totalBruteCalls: number; }
function resumableWholeGuard(key: string, patch: ReturnType<typeof makeGeoStarPatch>, uv: number[], tris: number[], tol: number, crest: Array<[number, number, number]>): WholeGuardOut {
  const { rA, H } = patch;
  const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const nF = tris.length / 3;
  const sig = `${key}_${nF}_${tris[0]}_${tris[tris.length - 1]}`;
  const CK = join(DIR, `guard_ck_${key}.bin`);
  const dev = new Float64Array(nF); let cursor = 0; let totalBrute = 0;
  // resume: [magic sig hash][cursor][totalBrute][dev...]
  const sigHash = sig.split('').reduce((a, ch) => ((a * 31 + ch.charCodeAt(0)) >>> 0), 7);
  if (existsSync(CK)) {
    const buf = readFileSync(CK);
    if (buf.length >= 12 && buf.readUInt32LE(0) === sigHash) {
      cursor = buf.readInt32LE(4); totalBrute = buf.readInt32LE(8);
      for (let f = 0; f < cursor; f++) dev[f] = buf.readDoubleLE(12 + f * 8);
      plog(`[${key} guard] RESUMED at facet ${cursor}/${nF} (bruteSoFar=${totalBrute})`);
    }
  }
  const persistCk = (done: number): void => { const b = Buffer.alloc(12 + nF * 8); b.writeUInt32LE(sigHash, 0); b.writeInt32LE(done, 4); b.writeInt32LE(totalBrute, 8); for (let f = 0; f < nF; f++) b.writeDoubleLE(dev[f], 12 + f * 8); writeFileSync(CK, b); };
  const CHUNK = 1000;
  for (let f = cursor; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const g = facetInteriorBrute45(rA, H, xyz, uv, a, b, c, GUARD_RULER);
    dev[f] = g.dev; totalBrute += g.bruteCalls;
    if ((f + 1) % CHUNK === 0) { persistCk(f + 1); plog(`[${key} guard] ${f + 1}/${nF} bruteSoFar=${totalBrute}`); }
  }
  persistCk(nF);
  // reduce
  const THRESH = 0.4; let maxMm = 0, nOut = 0, onC = 0, offC = 0;
  for (let f = 0; f < nF; f++) {
    const d = dev[f]; if (d > maxMm) maxMm = d;
    if (d > tol) {
      nOut++;
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const cx = (xyz[3 * a] + xyz[3 * b] + xyz[3 * c]) / 3, cy = (xyz[3 * a + 1] + xyz[3 * b + 1] + xyz[3 * c + 1]) / 3, cz = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
      let best = Infinity; for (const cs of crest) { const dd = Math.hypot(cx - cs[0], cy - cs[1], cz - cs[2]); if (dd < best) best = dd; if (best < THRESH) break; }
      if (best < THRESH) onC++; else offC++;
    }
  }
  const sorted = Float64Array.from(dev).sort();
  const pctl = (q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return { nFacets: nF, wholeMeshMaxMm: +maxMm.toFixed(5), wholeMeshOutliers: nOut, onCrestOutliers: onC, offCrestOutliers: offC, p50: +pctl(0.5).toFixed(5), p90: +pctl(0.9).toFixed(5), p99: +pctl(0.99).toFixed(5), totalBruteCalls: totalBrute };
}

function scoreMesh(key: string, patch: ReturnType<typeof makeGeoStarPatch>, pc: ReturnType<typeof extractProtectedComplex>, uv: number[], tris: number[], extra: Record<string, unknown>): Record<string, unknown> {
  const xyz = liftMesh(patch, uv);
  const wt = watertight(xyz, tris, uv.length);
  const g = resumableWholeGuard(key, patch, uv, tris, TOL, pc.crestSamples3D);
  const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(tris) });
  return {
    key, bays: BAYS, tris: tris.length / 3,
    wholeMeshOutliers: g.wholeMeshOutliers, wholeMeshMaxMm: g.wholeMeshMaxMm, onCrest: g.onCrestOutliers, off: g.offCrestOutliers,
    guardP50: g.p50, guardP90: g.p90, guardP99: g.p99, outlierGradUmin: g.outlierGradU.min, outlierGradUmax: g.outlierGradU.max,
    minAngleDeg: +q.minAngleDeg.toFixed(3), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2),
    watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
    ...extra,
  };
}

describe('pf-perfect-GEOSTAR-RELAX: Laplacian-under-M closes the OFF-crest panel slivers while holding whole-mesh 0-outlier', () => {
  const buildBase = (): { patch: ReturnType<typeof makeGeoStarPatch>; pc: ReturnType<typeof extractProtectedComplex> } => {
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    return { patch, pc };
  };

  // ── BEFORE: re-score the CONFIRMED whole-mesh GeoStar mesh under THIS probe's whole-mesh guard (one-metric-both-
  //    meshes A/B; expect it to reproduce 0 outliers / 21.7% <20%). ──
  it.skipIf(process.env.PF_GSRELAX !== '1')('before: re-score the CONFIRMED whole-mesh GeoStar mesh (whole-mesh guard)', () => {
    if (rowExists('before')) { plog('before exists, skip'); return; }
    const { patch, pc } = buildBase();
    const loaded = loadBin(BEFORE_MESH);
    if (!loaded) throw new Error(`CONFIRMED GeoStar whole-mesh mesh not found at ${BEFORE_MESH}`);
    plog(`[before] loaded ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t | complex fam=${pc.familyCount} crestV=${pc.crestVertexSet.size} cEdges=${pc.constraintEdges.length}`);
    const t0 = Date.now();
    const row = scoreMesh('before', patch, pc, loaded.uv, loaded.tris, { mode: 'wholemesh (reloaded)', elapsedS: +((Date.now() - t0) / 1000).toFixed(0) });
    persistMesh('before_mesh.bin', loaded.uv, loaded.tris);
    writeFileSync(join(DIR, 'before.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[before] outliers=${row.wholeMeshOutliers} max=${row.wholeMeshMaxMm} | minAngle=${row.minAngleDeg} pct<20=${row.pctBelow20}% median=${row.medianMinAngle} | nonVac=${row.nonVacuous}`);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── AFTER: surface-preserving Laplacian-under-M relaxation on the SAME mesh — targets the 91% OFF-crest panel. ──
  it.skipIf(process.env.PF_GSRELAX !== '1')('after: Laplacian-under-M relaxation — panel slivers drop, whole-mesh outliers HOLD 0', () => {
    if (rowExists('after')) { plog('after exists, skip'); return; }
    const { patch, pc } = buildBase();
    // RESUME a partly-relaxed mesh if a prior run persisted it (resilience across kills).
    const resumed = loadBin(join(DIR, 'after_mesh.bin'));
    const loaded = resumed ?? loadBin(BEFORE_MESH);
    if (!loaded) throw new Error(`GeoStar mesh not found at ${BEFORE_MESH}`);
    if (resumed) plog(`[after] RESUMED partly-relaxed mesh ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t`);
    plog(`[after] relax on ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t | crestV=${pc.crestVertexSet.size} omega=${OMEGA} maxSweeps=${MAX_SWEEPS} loopNth=${LOOP_NTH}`);
    const t0 = Date.now();
    const r = relaxLaplacianUnderM(patch, { uv: loaded.uv.slice(), tris: loaded.tris.slice() }, pc.crestVertexSet, TOL, MAX_SWEEPS, RULER, (s) => {
      plog(`[after sweep ${s.sweep}] free=${s.nFree} moved=${s.nMoved} rej=${s.nRejected} maxDisp=${s.maxDispMm} | minA=${s.minAngleDeg} pct<20=${s.pctBelow20}% med=${s.medianMinAngle} | ${(s.ms / 1000).toFixed(1)}s guardCalls=${s.guardCalls}`);
      appendFileSync(join(DIR, 'after_sweeps.ndjson'), JSON.stringify(s) + '\n');
    }, { omega: OMEGA, qualityDirected: QDIR });
    // relaxLaplacianUnderM keeps uv/tris internally; onSweep gives STATS only, so the growing mesh cannot be
    // per-sweep persisted through the current LIB contract (banked, LOCK-clean — not changing it). The authoritative
    // persist is the post-loop one; resilience granularity = the whole 'after' unit (row-exists skip + MAX_SWEEPS cap).
    persistMesh('after_mesh.bin', r.uv, r.tris);
    const row = scoreMesh('after', patch, pc, r.uv, r.tris, { mode: `relax-laplacian-under-M${QDIR ? '-qdir' : ''}`, omega: OMEGA, sweeps: r.sweeps, elapsedS: +((Date.now() - t0) / 1000).toFixed(0) });
    writeFileSync(join(DIR, 'after.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[after] outliers=${row.wholeMeshOutliers} max=${row.wholeMeshMaxMm} | minAngle=${row.minAngleDeg} pct<20=${row.pctBelow20}% median=${row.medianMinAngle} | sweeps=${r.sweeps} nonVac=${row.nonVacuous}`);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── GRADED-SEED (lever #1): smooth-graded background seed (no abrupt RED transition) + M-square refine (holds
  //    fidelity). Tests whether removing the dense↔coarse transition at INSERTION removes the panel needles.
  //    Independent env sub-gate PF_GSGRADED=1 (heavier: full re-build + refine). ──
  it.skipIf(process.env.PF_GSGRADED !== '1')('graded: smooth-graded seed + M-square refine — panel transition needles removed?', () => {
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
    plog(`[graded] outliers=${row.wholeMeshOutliers} max=${row.wholeMeshMaxMm} | minAngle=${row.minAngleDeg} pct<20=${row.pctBelow20}% median=${row.medianMinAngle} | tris=${row.tris} nonVac=${row.nonVacuous}`);
    expect(row.tris as number).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
