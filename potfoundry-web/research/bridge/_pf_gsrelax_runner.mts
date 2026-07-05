// _pf_gsrelax_runner.mts — DEV-ONLY standalone runner for SLIVER LEVER 13b (GeoStar relax).
// Bundled with esbuild + run under plain node so the env's vitest-fork watchdog (killing every ~2-3 min) does not
// truncate the honest whole-mesh 45-pt brute guard. Same logic as _pf_perfect_geostar_relax.test.ts, resumable via
// per-chunk dev-array checkpoints. Writes ONLY research/exchange/_pf_perfect_geostar_relax/.
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { extractProtectedComplex, liftMesh, lift } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { relaxLaplacianUnderM } from './_pf_relaxLib';
import { facetInteriorBrute45 } from './_pf_wholeMeshGuardLib';

const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_relax');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const BEFORE_MESH = process.env.PF_BEFORE_MESH ?? join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh', 'refined_mesh.bin');

const BAYS = Number(process.env.PF_BAYS ?? 5);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 10);
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const N_ROW = Number(process.env.PF_NROW ?? 260), N_COL = Number(process.env.PF_NCOL ?? 260), MIN_AMP = 0.03;
const MAX_SWEEPS = Number(process.env.PF_SWEEPS ?? 3);
const OMEGA = Number(process.env.PF_OMEGA ?? 0.5);
const QDIR = process.env.PF_QDIR !== '0';
const LOOP_NTH = Number(process.env.PF_LNTH ?? 384);
const RUN_BEFORE = process.env.PF_SKIP_BEFORE !== '1';
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 80, zBandMm: 3, refineIters: 40 };
const GUARD_RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 };

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return (JSON.parse(l) as { key: string }).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); console.log(`[CP ${String(row.key)}] ${JSON.stringify(row)}`); };
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
  const uv: number[] = new Array<number>(nV * 2); const tris: number[] = new Array<number>(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}
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

interface WholeGuardOut { nFacets: number; wholeMeshMaxMm: number; wholeMeshOutliers: number; onCrestOutliers: number; offCrestOutliers: number; p50: number; p90: number; p99: number; totalBruteCalls: number; }
function resumableWholeGuard(key: string, patch: ReturnType<typeof makeGeoStarPatch>, uv: number[], tris: number[], tol: number, crest: Array<[number, number, number]>): WholeGuardOut {
  const { rA, H } = patch;
  const nV = uv.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, uv[2 * i], uv[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const nF = tris.length / 3;
  const sig = `${key}_${nF}_${tris[0]}_${tris[tris.length - 1]}`;
  const CK = join(DIR, `guard_ck_${key}.bin`);
  const dev = new Float64Array(nF); let cursor = 0; let totalBrute = 0;
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
  const CHUNK = 2000;
  for (let f = cursor; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const g = facetInteriorBrute45(rA, H, xyz, uv, a, b, c, GUARD_RULER);
    dev[f] = g.dev; totalBrute += g.bruteCalls;
    if ((f + 1) % CHUNK === 0) { persistCk(f + 1); plog(`[${key} guard] ${f + 1}/${nF} bruteSoFar=${totalBrute}`); }
  }
  persistCk(nF);
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
  const pctl = (qq: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(qq * sorted.length))] : 0;
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
    guardP50: g.p50, guardP90: g.p90, guardP99: g.p99,
    minAngleDeg: +q.minAngleDeg.toFixed(3), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(2),
    watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous,
    ...extra,
  };
}

function main(): void {
  const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
  const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
  plog(`[runner] patch built; complex fam=${pc.familyCount} crestV=${pc.crestVertexSet.size} cEdges=${pc.constraintEdges.length} crestSamples=${pc.crestSamples3D.length}`);

  // BEFORE
  if (RUN_BEFORE && !rowExists('before')) {
    const loaded = loadBin(BEFORE_MESH);
    if (!loaded) throw new Error(`CONFIRMED GeoStar whole-mesh mesh not found at ${BEFORE_MESH}`);
    plog(`[before] loaded ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t`);
    const t0 = Date.now();
    const row = scoreMesh('before', patch, pc, loaded.uv, loaded.tris, { mode: 'wholemesh (reloaded)', elapsedS: +((Date.now() - t0) / 1000).toFixed(0) });
    persistMesh('before_mesh.bin', loaded.uv, loaded.tris);
    writeFileSync(join(DIR, 'before.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[before] outliers=${String(row.wholeMeshOutliers)} max=${String(row.wholeMeshMaxMm)} minAngle=${String(row.minAngleDeg)} pct<20=${String(row.pctBelow20)}% nonVac=${String(row.nonVacuous)}`);
  } else plog('[before] skip (exists or PF_SKIP_BEFORE)');

  // AFTER (relaxation) — INCREMENTAL per-sweep to survive the env's ~3.5min watchdog kills. Each node invocation
  //   runs ONE sweep (relaxLaplacianUnderM w/ maxSweeps=1), persists the relaxed mesh + a sweep-counter state file,
  //   and only finalizes (whole-mesh guard + 'after' row) once the cumulative sweep count reaches MAX_SWEEPS OR the
  //   sweep converged (nMoved=0). A kill mid-sweep loses ONLY the in-flight sweep (resumes from the last persisted).
  const STATE = join(DIR, 'after_state.json');
  if (!rowExists('after')) {
    let done = 0; let converged = false;
    if (existsSync(STATE)) { const st = JSON.parse(readFileSync(STATE, 'utf8')) as { done: number; converged: boolean }; done = st.done; converged = st.converged; }
    // run additional single sweeps until MAX_SWEEPS or convergence
    while (done < MAX_SWEEPS && !converged) {
      const resumed = loadBin(join(DIR, 'after_mesh.bin'));
      const loaded = resumed ?? loadBin(BEFORE_MESH);
      if (!loaded) throw new Error(`GeoStar mesh not found`);
      plog(`[after] sweep ${done + 1}/${MAX_SWEEPS} on ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t (${resumed ? 'resumed' : 'base'}) omega=${OMEGA} loopNth=${LOOP_NTH}`);
      const t0 = Date.now();
      let sMoved = 0;
      const r = relaxLaplacianUnderM(patch, { uv: loaded.uv.slice(), tris: loaded.tris.slice() }, pc.crestVertexSet, TOL, 1, RULER, (s) => {
        sMoved = s.nMoved;
        plog(`[after sweep#${done + 1}] free=${s.nFree} moved=${s.nMoved} rej=${s.nRejected} maxDisp=${s.maxDispMm} | minA=${s.minAngleDeg} pct<20=${s.pctBelow20}% med=${s.medianMinAngle} | ${(s.ms / 1000).toFixed(1)}s guardCalls=${s.guardCalls}`);
        appendFileSync(join(DIR, 'after_sweeps.ndjson'), JSON.stringify({ cum: done + 1, ...s }) + '\n');
      }, { omega: OMEGA, qualityDirected: QDIR });
      persistMesh('after_mesh.bin', r.uv, r.tris);
      done += 1; converged = sMoved === 0;
      writeFileSync(STATE, JSON.stringify({ done, converged }));
      plog(`[after] persisted sweep ${done}; converged=${converged} elapsed=${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    // FINALIZE: whole-mesh guard on the relaxed mesh (resumable guard)
    const fin = loadBin(join(DIR, 'after_mesh.bin'));
    if (!fin) throw new Error('after_mesh.bin missing at finalize');
    const row = scoreMesh('after', patch, pc, fin.uv, fin.tris, { mode: `relax-laplacian-under-M${QDIR ? '-qdir' : ''}`, omega: OMEGA, sweeps: done, converged, elapsedS: 0 });
    writeFileSync(join(DIR, 'after.json'), JSON.stringify(row, null, 2)); checkpoint(row);
    plog(`[after] outliers=${String(row.wholeMeshOutliers)} max=${String(row.wholeMeshMaxMm)} minAngle=${String(row.minAngleDeg)} pct<20=${String(row.pctBelow20)}% median=${String(row.medianMinAngle)} sweeps=${done} nonVac=${String(row.nonVacuous)}`);
  } else plog('[after] skip (exists)');
  plog('[runner] DONE');
}
main();
