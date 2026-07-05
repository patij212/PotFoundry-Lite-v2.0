// _pf_perfect_gothic_msquare.test.ts — DEV-ONLY (PF_MSQ=1). CLOSE the SLIVER + SCALE gates on Gothic.
//
// STATE: the perfect mesher is FIDELITY-PROVEN whole-PATCH on Gothic by FLAT-P1 (0 interior outliers @0.006mm,
// watertight non-vacuous, manifold) via the honest-brute-driven EDGE-mode refine. But that 0-outlier mesh is
// SLIVERY (Gothic 81.4% <20°, minAngle 0, density-invariant). An a-posteriori max-min-angle Lawson FLIP was
// REFUTED (E-…-TIERAB-SLIVERS): flips REOPEN outliers 0→57 (they reconnect the SAME needle point-set). The lever
// must be METRIC-AWARE SPACING AT REFINE TIME.
//
// THIS PROBE changes ONE thing vs the CONFIRMED kernel: the refine DELIVERY is M=g/h² SQUARE spacing
// (refineInteriorMsquare) instead of blind edge-mode 1→4 RED — when a flank node is inserted to hold the
// 0-outlier gate, matching ALONG-crest density is added (dt = h/st, du = h/su → SQUARE 3D cells) AND the locked
// crest constraint edges are subdivided to the same 3D pitch, so needle rows become square cells. The honest
// full-azimuth brute STOP driver is UNCHANGED (holds fidelity). Run on a MULTI-BAY patch (3-5 bays).
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE measuring — see registry E-2026-07-05-PERFECT-MESHER-MSQUARE):
//   CONFIRM iff, on a 3-5 bay Gothic patch: interior outliers STAY 0 (honest ≥36-pt brute, worst-gradU pop) AND
//     minAngle rises to a usable bar (target %<20 < ~10% AND minAngle > ~10°) AND watertight (auditNonManByIndex=0
//     non-vacuous) AND manifold. Report minAngle/%<20 BEFORE (pure arc-length edge-mode) vs AFTER (M-square).
//   REFUTE iff M-square spacing REOPENS outliers (>0) — square cells cannot hold the near-vertical-flank fidelity
//     (0-outlier and sliver gates in genuine tension; report the tradeoff curve).
//   Also REPORT tris + tris-per-bay + PROJECTED full-mesh tri-count (extrapolate to Gothic's ~96 births/72 merges)
//     vs the 6M budget — the cost gate.
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib + _pf_perfectMesherMsquareLib
// READ-ONLY. Writes ONLY research/exchange/_pf_perfect_gothic_msquare/. Env sub-gate + row-exists skip => resumable;
// checkpoint each unit the instant it is computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import {
  makeGothicPatch, extractProtectedComplex, seedMesh, acceptanceGuard, liftMesh,
} from './_pf_perfectMesherLib';
import { refineInteriorBrute } from './_pf_perfectMesherBruteLib';
import { refineInteriorMsquare } from './_pf_perfectMesherMsquareLib';

const TOL = 0.01;
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', SMOKE ? '_pf_perfect_gothic_msquare_smoke' : '_pf_perfect_gothic_msquare');
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

// Patch controls. The spec requires MULTI-BAY (3-5 bays). SMOKE mirrors the CONFIRMED brute probe's EXACT params
// (BAYS=1 ZBAND=5 N_ROW=N_COL=120 BG=0.35 LNTH=384 → seed 762t → 9885t converged, outliers 0, minAngle 0,
// pct<20=81.4%) so the M-square AFTER arm runs on the SAME patch/complex/seed the CONFIRMED before mesh used and
// the A/B is apples-to-apples. Non-smoke = the multi-bay scale confirm.
const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 1 : 4));
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 5 : 12));
const N_ROW = Number(process.env.PF_NROW ?? (SMOKE ? 120 : 200)), N_COL = Number(process.env.PF_NCOL ?? (SMOKE ? 120 : 200)), MIN_AMP = 0.03;
const BG_ARC_MM = Number(process.env.PF_BG ?? (SMOKE ? 0.35 : 0.16));
const MAX_PASS = Number(process.env.PF_PASS ?? (SMOKE ? 10 : 16));
const TOP_FRAC = Number(process.env.PF_TOPFRAC ?? 0.06);
const GUARD_CAP = Number(process.env.PF_GCAP ?? 400);
const LOOP_NTH = Number(process.env.PF_LNTH ?? (SMOKE ? 384 : 512));
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 80, zBandMm: 3, refineIters: 40 };
// BEFORE mesh: prefer loading the CONFIRMED persisted edge-mode brute mesh (avoids re-deriving a known baseline;
// the env kills the long edge-mode re-run). Falls back to running edge-mode if absent.
const BEFORE_MESH = process.env.PF_BEFORE_MESH ?? join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_brute_smoke', 'refined_mesh.bin');
function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  // both persist layouts start with nV,nT; brute uses a 16-byte header (nV,nT,passes,capped), this probe uses 8.
  // Detect by size: 16 + nV*16 + nT*12  vs  8 + nV*16 + nT*12.
  const size16 = 16 + nV * 16 + nT * 12, size8 = 8 + nV * 16 + nT * 12;
  const off = buf.length === size16 ? 16 : (buf.length === size8 ? 8 : -1);
  if (off < 0) return null;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

// watertight audit with a NON-VACUOUS injected-crack control. The control adds a 3rd triangle to an INTERIOR
// (shared-by-exactly-2) edge → that edge becomes shared-by-3 → non-manifold count MUST rise. Picking tris[0..1]
// blindly can hit a BOUNDARY edge (only 1 triangle) → adding a 2nd makes it manifold, not non-manifold (a false
// vacuous). So we FIND an interior edge first (weld by position, count each undirected edge's incidence).
function findInteriorEdge(xyz: Float64Array, tris: number[]): [number, number] | null {
  const n = xyz.length / 3; const q = 1e4;
  const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) { const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`; const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; } }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const cnt = new Map<number, number>();
  for (let k = 0; k < tris.length; k += 3) { const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue; cnt.set(key(a, b), (cnt.get(key(a, b)) ?? 0) + 1); cnt.set(key(b, c), (cnt.get(key(b, c)) ?? 0) + 1); cnt.set(key(c, a), (cnt.get(key(c, a)) ?? 0) + 1); }
  // first ORIGINAL (unwelded) index pair whose welded edge is shared by exactly 2 triangles (interior).
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

describe('pf-perfect-gothic-MSQUARE: metric-aware refine-time spacing closes slivers while holding 0 outliers', () => {
  // Shared: extract the protected complex once (deterministic). Both arms reuse the SAME seed + complex so the ONLY
  // difference is the refine DELIVERY (edge-mode arc-length vs M-square).
  const buildBase = (): ReturnType<typeof makeGothicPatch> extends never ? never : { patch: ReturnType<typeof makeGothicPatch>; pc: ReturnType<typeof extractProtectedComplex>; seed: ReturnType<typeof seedMesh> } => {
    const patch = makeGothicPatch(BAYS, ZBAND_MM);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    const seed = seedMesh(patch, pc, BG_ARC_MM);
    return { patch, pc, seed };
  };

  // ── BEFORE: the CONFIRMED edge-mode arc-length refine on the MULTI-BAY patch (baseline sliver/outlier numbers) ──
  it.skipIf(process.env.PF_MSQ !== '1')('before: edge-mode arc-length refine (baseline) — load CONFIRMED mesh if present', () => {
    if (rowExists('before')) { plog('before exists, skip'); return; }
    const { patch, pc, seed } = buildBase();
    plog(`[before] patch bays=${BAYS} zBand=${ZBAND_MM} | complex fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length} | seed ${seed.uv.length / 2}v ${seed.tris.length / 3}t`);
    const t0 = Date.now();
    let r: { uv: number[]; tris: number[]; passes: number; capped: boolean };
    const loaded = loadBin(BEFORE_MESH);
    if (loaded) {
      // ALIGNMENT GUARD: the loaded mesh's crest-prefix verts must match this complex (same patch params).
      let aligned = true; for (let i = 0; i < Math.min(pc.uv.length / 2, 20); i++) { if (2 * i + 1 < loaded.uv.length && (Math.abs(pc.uv[2 * i] - loaded.uv[2 * i]) > 1e-9 || Math.abs(pc.uv[2 * i + 1] - loaded.uv[2 * i + 1]) > 1e-9)) aligned = false; }
      r = { uv: loaded.uv, tris: loaded.tris, passes: 0, capped: false };
      plog(`[before] LOADED CONFIRMED mesh from ${BEFORE_MESH}: ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t aligned=${aligned}`);
    } else {
      const rr = refineInteriorBrute(patch, { uv: seed.uv.slice(), tris: seed.tris.slice() }, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
        plog(`[before pass ${s.pass}] tris=${s.nTris} out=${s.nOutBrute} worst=${s.worstBrute} ins=${s.nInserted} ${(s.ms / 1000).toFixed(1)}s`);
        appendFileSync(join(DIR, 'before_passes.ndjson'), JSON.stringify(s) + '\n');
      }, 'edge');
      r = { uv: rr.uv, tris: rr.tris, passes: rr.passes, capped: rr.capped };
    }
    const xyz = liftMesh(patch, r.uv);
    const wt = watertight(xyz, r.tris, r.uv.length);
    const guard = acceptanceGuard(patch, r.uv, r.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(r.tris) });
    const finalTris = r.tris.length / 3;
    persistMesh('before_mesh.bin', r.uv, r.tris);
    const row = {
      key: 'before', mode: 'edge-arclen', bays: BAYS, tris: finalTris, trisPerBay: +(finalTris / BAYS).toFixed(0),
      refinePasses: r.passes, capped: r.capped,
      interiorOutliers: guard.interiorOutliers, interiorMaxMm: guard.interiorMaxMm, onCrest: guard.onCrestOutliers, off: guard.offCrestOutliers, guardP99: guard.p99,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
      elapsedS: +((Date.now() - t0) / 1000).toFixed(0),
    };
    writeFileSync(join(DIR, 'before.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[before] outliers=${guard.interiorOutliers} max=${guard.interiorMaxMm} | minAngle=${q.minAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}% | tris=${finalTris} nonVac=${wt.nonVacuous}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);

  // ── AFTER: the M=g/h² SQUARE refine on the SAME multi-bay patch/seed/complex ──
  it.skipIf(process.env.PF_MSQ !== '1')('after: M=g/h² square refine — outliers stay 0, slivers drop', () => {
    if (rowExists('after')) { plog('after exists, skip'); return; }
    const { patch, pc, seed } = buildBase();
    plog(`[after] M-square refine on bays=${BAYS} zBand=${ZBAND_MM} cEdges0=${pc.constraintEdges.length}`);
    const t0 = Date.now();
    const r = refineInteriorMsquare(patch, { uv: seed.uv.slice(), tris: seed.tris.slice() }, pc.constraintEdges, TOL, MAX_PASS, RULER, (s) => {
      plog(`[after pass ${s.pass}] tris=${s.nTris} out=${s.nOutBrute} worst=${s.worstBrute} insF=${s.nInsertedFlank} insC=${s.nInsertedCrest} crestSplit=${s.nCrestEdgesSplit} ${(s.ms / 1000).toFixed(1)}s`);
      appendFileSync(join(DIR, 'after_passes.ndjson'), JSON.stringify(s) + '\n');
    });
    const xyz = liftMesh(patch, r.uv);
    const wt = watertight(xyz, r.tris, r.uv.length);
    const guard = acceptanceGuard(patch, r.uv, r.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(r.tris) });
    const finalTris = r.tris.length / 3;
    persistMesh('after_mesh.bin', r.uv, r.tris);
    // PROJECTED full-mesh tri-count: Gothic full network ≈ 96 births / 72 merges. This patch spans BAYS bays of the
    // ~72-bay full ring at the apex row; scale linearly by (72 / BAYS) as the honest first-order extrapolation.
    const FULL_BAYS = 72;
    const projectedFullMeshTris = Math.round((finalTris / BAYS) * FULL_BAYS);
    const row = {
      key: 'after', mode: 'M-square', bays: BAYS, tris: finalTris, trisPerBay: +(finalTris / BAYS).toFixed(0),
      projectedFullMeshTris, budget6M: projectedFullMeshTris <= 6_000_000,
      refinePasses: r.passes, capped: r.capped,
      interiorOutliers: guard.interiorOutliers, interiorMaxMm: guard.interiorMaxMm, onCrest: guard.onCrestOutliers, off: guard.offCrestOutliers, guardP99: guard.p99,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
      elapsedS: +((Date.now() - t0) / 1000).toFixed(0),
    };
    writeFileSync(join(DIR, 'after.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[after] outliers=${guard.interiorOutliers} max=${guard.interiorMaxMm} | minAngle=${q.minAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}% | tris=${finalTris} proj=${projectedFullMeshTris} nonVac=${wt.nonVacuous}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
