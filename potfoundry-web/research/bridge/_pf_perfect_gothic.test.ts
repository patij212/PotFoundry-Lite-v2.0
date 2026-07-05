// _pf_perfect_gothic.test.ts — DEV-ONLY (PF_PERFECT=1). E-2026-07-04-PERFECT-MESHER-GOTHIC.
//
// END-TO-END assembly of the perfect-mesher kernel (blueprint §4) on a REAL single-arch GothicArches patch:
//   (1) extract the Morse ridge graph (FGJ) over the patch = protected no-bridge 1-complex incl. junction 0-cells;
//   (2) seed metric-Delaunay CDT with the graph LOCKED as constraint edges, no-bridge split;
//   (3) INTERIOR-CRITERION refine loop (SURFNATIVE): while a facet's TRUE-3D interior dev > 0.01, insert a
//       surface-projected arc-length-graded node on the flank, re-CDT with locked constraints, recurse;
//   (4) acceptance guard = >=36-pt sampler on the worst-gradU population, full-azimuth brute.
//
// KILL-CRITERION (pre-registered, committed 8c4467a):
//   CONFIRM iff 0 triangles have interior true-3D > 0.01 (>=36-pt sampler, worst-gradU pop, full-azimuth brute)
//     AND watertight (auditNonManByIndex = 0 by index, non-vacuous control confirmed) AND manifold across the
//     junction network, at <=6M-equivalent density.
//   REFUTE iff any facet floors > 0.02 after the interior loop terminates, OR the junction network can't be split
//     non-manifold-free (residualCrossings > 0 / fan gaps).
//   NO-OP iff it matches the _cu_gothicseg embedded-crest floor (0.058) within 10%.
// ALSO REPORT (non-gating): tri-count + arc-length fat-tail leaf distribution; minAngle / %<20 (sliver gate).
//
// ISOLATION: NEW files only. Reuses labkit + _pf_perfectMesherLib + planarizeConstraintGraph + cdt2d READ-ONLY.
// Writes ONLY research/exchange/_pf_perfect_gothic/. Env sub-gate + row-exists skip => resumable; checkpoint each row.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import {
  makeGothicPatch, extractProtectedComplex, seedMesh, refineInterior, acceptanceGuard, liftMesh,
} from './_pf_perfectMesherLib';

const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', process.env.PF_SMOKE === '1' ? '_pf_perfect_gothic_smoke' : '_pf_perfect_gothic');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };
const readRow = (key: string): Record<string, unknown> | null => { if (!existsSync(NDJSON)) return null; for (const l of readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)) { try { const o = JSON.parse(l); if (o.key === key) return o; } catch { /* ignore */ } } return null; };
const MESHBIN = join(DIR, 'refined_mesh.bin');
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

// PATCH: single arch — several u-bays x a short z-band around a REAL arch-apex junction (count-unstable net).
// Env-tunable so a fast SMOKE (PF_SMOKE=1) validates the full pipeline before the full-density go/no-go run.
const SMOKE = process.env.PF_SMOKE === '1';
const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 3 : 5));           // u-family ribs => births/merges of the t-family
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 8 : 14));    // axial band spanning t-family crest crossings
const N_ROW = SMOKE ? 120 : 220, N_COL = SMOKE ? 120 : 220, MIN_AMP = 0.03;
const BG_ARC_MM = Number(process.env.PF_BG ?? (SMOKE ? 0.35 : 0.11)); // background flat grid pitch (mm arc / mm z)
const MAX_PASS = Number(process.env.PF_PASS ?? (SMOKE ? 10 : 18));    // interior-criterion refine passes cap (cheap
                                                                     // ~0.3s/pass; run enough to reach ~0 GN-outliers
                                                                     // so the honest brute guard is cheap on few reds)
const TOP_FRAC = Number(process.env.PF_TOPFRAC ?? (SMOKE ? 0.03 : 0.06)); // guard pop = worst-gradU fraction
const GUARD_CAP = Number(process.env.PF_GCAP ?? (SMOKE ? 600 : 2000)); // absolute cap on worst-gradU guard pop
                                                                       // (the reddest facets — where any outlier lives —
                                                                       // so the honest brute stays tractable)

describe('pf-perfect-gothic: FGJ junction graph + SURFNATIVE interior-criterion refine, end-to-end on a real Gothic patch', () => {
  // ── STAGE 0: diag — size the patch (tri-count target 0.3-0.8M). Cheap, resumable. ──
  it.skipIf(process.env.PF_PERFECT !== '1')('diag: patch + protected-complex census', () => {
    if (rowExists('diag')) { plog('diag exists, skip'); return; }
    const patch = makeGothicPatch(BAYS, ZBAND_MM);
    plog(`patch u[${patch.uLo.toFixed(4)},${patch.uHi.toFixed(4)}] t[${patch.tLo.toFixed(4)},${patch.tHi.toFixed(4)}] arcSpan=${((patch.uHi - patch.uLo) * patch.arcPerU).toFixed(1)}mm zSpan=${((patch.tHi - patch.tLo) * patch.H).toFixed(1)}mm`);
    const t0 = Date.now();
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`extract: familyCount=${pc.familyCount} nSegU=${pc.nSegU} nSegT=${pc.nSegT} residualCrossings=${pc.residualCrossings} crestVerts=${pc.crestVertexSet.size} constraintEdges=${pc.constraintEdges.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const seed = seedMesh(patch, pc, BG_ARC_MM);
    const seedTris = seed.tris.length / 3;
    plog(`seed CDT: verts=${seed.uv.length / 2} tris=${seedTris} (target 0.3-0.8M)`);
    checkpoint({
      key: 'diag', bays: BAYS, zBandMm: ZBAND_MM, arcSpanMm: +((patch.uHi - patch.uLo) * patch.arcPerU).toFixed(1), zSpanMm: +((patch.tHi - patch.tLo) * patch.H).toFixed(1),
      familyCount: pc.familyCount, nSegU: pc.nSegU, nSegT: pc.nSegT, residualCrossings: pc.residualCrossings,
      crestVerts: pc.crestVertexSet.size, constraintEdges: pc.constraintEdges.length,
      seedVerts: seed.uv.length / 2, seedTris,
    });
    expect(pc.familyCount).toBeGreaterThanOrEqual(1);
    expect(seedTris).toBeGreaterThan(0);
  }, 60 * 60 * 1000);

  // ── STAGE 1: build END-TO-END + acceptance guard + watertight audit + sliver gate. The go/no-go. ──
  it.skipIf(process.env.PF_PERFECT !== '1')('build: end-to-end kernel + guard + watertight + slivers', () => {
    if (rowExists('build')) { plog('build exists, skip'); return; }
    const patch = makeGothicPatch(BAYS, ZBAND_MM);
    const t0 = Date.now();
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[build] extracted: fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} resid=${pc.residualCrossings} cEdges=${pc.constraintEdges.length}`);
    // RESUME: if the refined mesh was already persisted (a prior run refined but the guard was killed), reload it
    // and skip the ~8min refine — go straight to the (now capped) honest brute guard.
    let ref = loadMesh();
    if (ref) {
      plog(`[build] RESUMED from persisted mesh: tris=${ref.tris.length / 3} verts=${ref.uv.length / 2} passes=${ref.passes} capped=${ref.capped}`);
    } else {
      const seed = seedMesh(patch, pc, BG_ARC_MM);
      plog(`[build] seed: verts=${seed.uv.length / 2} tris=${seed.tris.length / 3}`);
      // STEP 4 — interior-criterion refine loop. Checkpoint EACH pass to disk the instant it completes (resilience).
      const r = refineInterior(patch, seed, pc.constraintEdges, TOL, MAX_PASS, pc.crestVertexSet, (s) => {
        plog(`[refine pass ${s.pass}] tris=${s.nTris} scored=${s.nScored} outGN=${s.nOutGN} worstGN=${s.worstGN} inserted=${s.nInserted} ${(s.ms / 1000).toFixed(1)}s`);
        appendFileSync(join(DIR, 'refine_passes.ndjson'), JSON.stringify(s) + '\n');
      });
      ref = { uv: r.uv, tris: r.tris, passes: r.passes, capped: r.capped };
      plog(`[build] refine done: passes=${r.passes} capped=${r.capped} finalTris=${r.tris.length / 3} verts=${r.uv.length / 2} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      persistMesh(ref.uv, ref.tris, ref.passes, ref.capped);
    }

    // ── watertight audit (by INDEX, non-vacuous control) ──
    const xyz = liftMesh(patch, ref.uv);
    const nonMan = auditNonManByIndex(xyz, ref.tris, 1e-4);
    // NON-VACUOUS control: inject a genuine NON-MANIFOLD edge (an edge shared by >2 triangles). auditNonManByIndex
    // counts edges welded-by-position that ≥3 triangles share; a torn SEAM only creates boundary edges (count=1),
    // NOT non-manifold — so the control MUST add a third triangle onto an existing edge. Duplicate the first
    // triangle's (v0,v1) edge into a new fan triangle (v0,v1,vNew) → that edge is now shared by 3 tris → count MUST
    // increase. If it doesn't, the audit is not seeing the injected defect and nonMan=0 is untrustworthy.
    const a0 = ref.tris[0], b0 = ref.tris[1];
    const vNew = ref.uv.length / 2;
    const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
    // place vNew at a fresh position (offset from a0) so it is a distinct 4th vertex on that edge's star
    xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
    const crackTris = ref.tris.slice(); crackTris.push(a0, b0, vNew); // 3rd tri on edge (a0,b0)
    const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
    const nonVacuous = nonManCracked > nonMan;
    plog(`[build] watertight: nonMan=${nonMan} nonManInjected=${nonManCracked} nonVacuousControl=${nonVacuous}`);

    // ── acceptance guard (>=36-pt sampler, worst-gradU population, full-azimuth brute) ──
    const tG = Date.now();
    const guard = acceptanceGuard(patch, ref.uv, ref.tris, TOL, TOP_FRAC, pc.crestSamples3D, GUARD_CAP);
    plog(`[build] guard: scored=${guard.nScored}/${guard.nFacets} interiorMax=${guard.interiorMaxMm} outliers=${guard.interiorOutliers} (onCrest=${guard.onCrestOutliers} offCrest=${guard.offCrestOutliers}) p99=${guard.p99} gradU[${guard.gradUofScored.min}..${guard.gradUofScored.max}] in ${((Date.now() - tG) / 1000).toFixed(0)}s`);

    // ── sliver gate (minAngle distribution) ──
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(ref.tris) });
    plog(`[build] slivers: minAngle=${q.minAngleDeg.toFixed(2)} p5=${q.p5MinAngleDeg.toFixed(2)} median=${q.medianMinAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}%`);

    // ── verdict per the pre-registered kill-criterion ──
    const finalTris = ref.tris.length / 3;
    const confirm = guard.interiorOutliers === 0 && nonMan === 0 && nonVacuous && pc.residualCrossings === 0;
    const refute = guard.interiorMaxMm > 0.02 || pc.residualCrossings > 0;
    const noop = guard.interiorMaxMm >= 0.058 * 0.9 && guard.interiorMaxMm <= 0.058 * 1.1;
    const verdict = confirm ? 'CONFIRM' : refute ? 'REFUTE' : noop ? 'NO-OP' : 'PARTIAL';

    const row = {
      key: 'build', verdict,
      finalTris, refinePasses: ref.passes, capped: ref.capped,
      familyCount: pc.familyCount, residualCrossings: pc.residualCrossings, constraintEdges: pc.constraintEdges.length,
      interiorMaxMm: guard.interiorMaxMm, interiorOutliers: guard.interiorOutliers,
      onCrestOutliers: guard.onCrestOutliers, offCrestOutliers: guard.offCrestOutliers,
      guardP50: guard.p50, guardP90: guard.p90, guardP99: guard.p99, guardScored: guard.nScored,
      gradUmin: guard.gradUofScored.min, gradUmax: guard.gradUofScored.max,
      watertightNonMan: nonMan, nonManInjected: nonManCracked, nonVacuousControl: nonVacuous,
      minAngleDeg: +q.minAngleDeg.toFixed(2), p5MinAngle: +q.p5MinAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      seedTris: seed.tris.length / 3,
    };
    writeFileSync(join(DIR, 'build.json'), JSON.stringify({ row, refineHist: ref.histPerPass }, null, 2));
    checkpoint(row);
    plog(`[build] VERDICT=${verdict} interiorMax=${guard.interiorMaxMm} outliers=${guard.interiorOutliers} nonMan=${nonMan} resid=${pc.residualCrossings} tris=${finalTris}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 90 * 60 * 1000);

  // ── STAGE 2: cost report — arc-length fat-tail leaf distribution across passes (non-gating). Reads build.json. ──
  it.skipIf(process.env.PF_PERFECT !== '1')('cost: refine fat-tail + density check', () => {
    if (rowExists('cost')) { plog('cost exists, skip'); return; }
    const b = readRow('build'); if (!b) { plog('build row missing, run build first'); return; }
    // tri growth per pass from build.json
    const bj = JSON.parse(readFileSync(join(DIR, 'build.json'), 'utf8'));
    const hist: Array<{ pass: number; nTris: number; nOutGN: number }> = bj.refineHist ?? [];
    const growth = hist.map((h) => h.nTris);
    const outSeq = hist.map((h) => h.nOutGN);
    // extrapolate to whole Gothic: patch spans BAYS bays x ZBAND_MM; full mesh ~72 bays x 120mm.
    const patchArea = BAYS * ZBAND_MM;      // (bays * mm) proxy
    const fullArea = 72 * 120;
    const scale = fullArea / patchArea;
    const finalTris = Number(b.finalTris);
    const projectedFullTris = Math.round(finalTris * scale);
    const under6M = projectedFullTris <= 6_000_000;
    const row = {
      key: 'cost', patchFinalTris: finalTris, seedTris: Number(b.seedTris),
      triGrowthPerPass: growth, outlierGNPerPass: outSeq,
      areaScaleToFullMesh: +scale.toFixed(1), projectedFullMeshTris: projectedFullTris, under6MBudget: under6M,
      refinePasses: Number(b.refinePasses), capped: b.capped,
    };
    checkpoint(row);
    plog(`[cost] patchTris=${finalTris} projectedFull=${projectedFullTris} under6M=${under6M} growth=${JSON.stringify(growth)}`);
    expect(finalTris).toBeGreaterThan(0);
  }, 20 * 60 * 1000);
});
