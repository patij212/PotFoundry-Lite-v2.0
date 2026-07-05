// _pf_apex_pn.test.ts — DEV-ONLY (PF_APEXPN=1). SLIVER LEVER 13a (E-2026-07-05-GOTHIC-APEXPN):
// scoped one-sided PN curved element AT the apex, re-tessellating the near-apex NEEDLE leaves into a FEW well-shaped
// ON-SURFACE flat sub-triangles. Reloads the CONFIRMED whole-mesh Gothic mesh READ-ONLY; re-tessellates the
// high-gradU near-apex needle clusters over a Vlachos PN patch (no cdt2d); re-scores the WHOLE mesh with the honest
// full-azimuth 45-pt acceptance guard + watertight (non-vacuous) + slivers; renders a true-3D heatmap.
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE measuring, registry d6b2cf1):
//   CONFIRM iff pctBelow20 drops toward SINGLE DIGIT (materially below 19%, ideally <~10%) WHILE wholeMeshOutliers
//     HOLD 0 (honest full-azimuth 45-pt acceptanceGuardWhole, EVERY facet — NOT top-N-gradU) AND watertight
//     (auditNonManByIndex=0 by index, non-vacuous).
//   REFUTE iff the apex-PN re-tessellation CANNOT hold whole-mesh 0-outlier (PN sub-facets reopen an outlier) OR
//     pctBelow20 barely moves (needles survive). Report the HONEST pctBelow20 at 0-outlier (the frontier).
//
// ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib (acceptanceGuardWhole) +
// _pf_apexPnLib READ-ONLY. Writes ONLY research/exchange/_pf_apex_pn/. Env sub-gate + row-exists skip => resumable;
// checkpoint each unit the instant computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution, dumpHeatmap } from './labkit';
import { makeGothicPatch, liftMesh } from './_pf_perfectMesherLib';
import { acceptanceGuardWhole } from './_pf_perfectMesherBruteLib';
import { buildApexPnTess, diagnoseNeedles, pnFlipDiscriminator, type ApexPnOpts } from './_pf_apexPnLib';
import { bruteNearestOnRadialSurface, projectPointToRadialSurface } from './labkit';

const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_apex_pn');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const BASE = join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_wholemesh', 'refined_mesh.bin');

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

const loadMesh = (): { uv: number[]; tris: number[] } => {
  const buf = readFileSync(BASE);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = 16; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
};

// same honest two-stage ruler the CONFIRMED kernel + guard use (1024x120 box-refine, trusted <1e-4).
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 };

// watertight (by INDEX, non-vacuous control — 3rd tri on an existing edge MUST move the count).
function watertight(patch: ReturnType<typeof makeGothicPatch>, uv: number[], tris: number[]): { nonMan: number; nonVacuous: boolean } {
  const xyz = liftMesh(patch, uv);
  const nonMan = auditNonManByIndex(xyz, tris, 1e-4);
  const a0 = tris[0], b0 = tris[1]; const vNew = uv.length / 2;
  const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
  xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
  const crackTris = tris.slice(); crackTris.push(a0, b0, vNew);
  const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
  return { nonMan, nonVacuous: nonManCracked > nonMan };
}

const ANG = Number(process.env.PF_ANG ?? 20);
const GRADU = Number(process.env.PF_GRADU ?? 60);   // near-apex if centroid gradU > this (panel needles are lower)
const NINT = Number(process.env.PF_NINT ?? 1);

describe('pf-apex-pn: scoped apex PN re-tessellation of near-apex needle leaves (SLIVER LEVER 13a)', () => {
  // ── UNIT 1: DIAGNOSTIC — characterize the needle population (where are they, what gradU) — cheapest first ──
  it.skipIf(process.env.PF_APEXPN !== '1')('diag: needle population localization', () => {
    if (rowExists('diag')) { plog('diag row exists, skip'); return; }
    const patch = makeGothicPatch(2, 8);
    const { uv, tris } = loadMesh();
    const q0 = triangleQualityDistribution({ vertices: liftMesh(patch, uv), indices: Int32Array.from(tris) });
    const d = diagnoseNeedles(patch, uv, tris, ANG);
    const row = {
      key: 'diag', baseTris: tris.length / 3,
      basePctBelow20: +q0.pctBelow20.toFixed(1), baseMinAngle: +q0.minAngleDeg.toFixed(2), baseMedian: +q0.medianMinAngleDeg.toFixed(2),
      nNeedle: d.nNeedle, needleGradU_p10: d.needleGradU.p10, needleGradU_p50: d.needleGradU.p50, needleGradU_p90: d.needleGradU.p90,
      nPanelNeedle_gradUlt50: d.nPanelNeedle,
    };
    checkpoint(row);
    plog(`[diag] nNeedle=${d.nNeedle} gradU p10/p50/p90=${d.needleGradU.p10}/${d.needleGradU.p50}/${d.needleGradU.p90} panel(<50)=${d.nPanelNeedle} basePct<20=${q0.pctBelow20.toFixed(1)}`);
    expect(tris.length).toBeGreaterThan(0);
  }, 60 * 60 * 1000);

  // ── UNIT 1b: ELEMENT-LEVEL DISCRIMINATOR — can a CURVED (PN) element let a ROUNDER cell ride the crest cusp
  //    within tol, and what flat sub-tessellation (+ its worst sliver) does STL actually need? (cheapest decider) ──
  it.skipIf(process.env.PF_APEXPN !== '1')('pnflip: element-level curved-vs-flat discriminator', () => {
    if (rowExists('pnflip')) { plog('pnflip row exists, skip'); return; }
    const patch = makeGothicPatch(2, 8);
    const { uv, tris } = loadMesh();
    // honest two-stage brute (GN screen -> full-azimuth brute) as the point ruler for the discriminator. CHEAPER
    // brute (256x120, box-refine 40) — Gothic's radius field is single-valued so a 256-azimuth brute box-refines to
    // the true foot; this is a DIRECTION discriminator (flat-vs-PN), not the final acceptance verdict (which uses
    // the full 1024 acceptanceGuardWhole in UNIT 2). Keeps 200 pairs tractable in-window.
    const brute = (Q: [number, number, number]): number => {
      const gn = projectPointToRadialSurface(Q[0], Q[1], Q[2], patch.rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      if (gn <= RULER.gnScreen) return gn;
      return bruteNearestOnRadialSurface(Q[0], Q[1], Q[2], patch.rA, patch.H, { nTheta: 256, nZ: 120, zBandMm: 3, refineIters: 40 }).dist;
    };
    const t0 = Date.now();
    const s = pnFlipDiscriminator(patch, uv, tris, { angThresh: ANG, gradUThresh: GRADU, tol: TOL, sampleCap: 200 }, brute);
    const row = {
      key: 'pnflip', tol: s.tol,
      nPairs: s.nPairs, nRounder: s.nRounder, nScored: s.nScored, nPnRidesFlat: s.nPnRidesFlat, nFlatWithinTol: s.nFlatWithinTol,
      beforeMin_p10: s.worstMinAngleBefore.p10, beforeMin_p50: s.worstMinAngleBefore.p50,
      flippedMin_p10: s.flippedMinAngle.p10, flippedMin_p50: s.flippedMinAngle.p50,
      flatDev_p50: s.flatDev.p50, flatDev_p90: s.flatDev.p90, pnDev_p50: s.pnDev.p50, pnDev_p90: s.pnDev.p90,
    };
    checkpoint(row);
    plog(`[pnflip] pairs=${s.nPairs} rounder=${s.nRounder} scored=${s.nScored} pnRidesFlat=${s.nPnRidesFlat} flatOk=${s.nFlatWithinTol} beforeMin p10/p50=${s.worstMinAngleBefore.p10}/${s.worstMinAngleBefore.p50} flippedMin p10/p50=${s.flippedMinAngle.p10}/${s.flippedMinAngle.p50} flatDev p50/p90=${s.flatDev.p50}/${s.flatDev.p90} pnDev p50/p90=${s.pnDev.p50}/${s.pnDev.p90} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    expect(s.nPairs).toBeGreaterThanOrEqual(0);
  }, 3 * 60 * 60 * 1000);

  // ── UNIT 2: FIX — apex-PN re-tessellation + honest whole-mesh guard + watertight + slivers + render ──
  it.skipIf(process.env.PF_APEXPN !== '1')('apexPN: re-tessellate near-apex needles over PN, hold 0-outlier', () => {
    const key = `apexpn_ang${ANG}_g${GRADU}_n${NINT}`;
    if (rowExists(key)) { plog(`${key} row exists, skip`); return; }
    const patch = makeGothicPatch(2, 8);
    const { uv, tris } = loadMesh();

    // BEFORE (base) numbers for the A/B.
    const xyz0 = liftMesh(patch, uv);
    const q0 = triangleQualityDistribution({ vertices: xyz0, indices: Int32Array.from(tris) });
    plog(`[base] tris=${tris.length / 3} pct<20=${q0.pctBelow20.toFixed(1)} minAngle=${q0.minAngleDeg.toFixed(2)} median=${q0.medianMinAngleDeg.toFixed(2)}`);

    const opts: ApexPnOpts = { angThresh: ANG, gradUThresh: GRADU, nInterior: NINT };
    const t0 = Date.now();
    const r = buildApexPnTess(patch, uv, tris, opts);
    plog(`[apexPN] nNeedle=${r.nNeedle} nNearApexNeedle=${r.nNearApexNeedle} panelNeedle=${r.diag.nPanelNeedle} clusters=${r.nClusters} retess=${r.clustersRetessellated} skip=${r.clustersSkipped} replaced=${r.nOldFacetsReplaced} newFacets=${r.nNewFacets} interiorNodes=${r.nInteriorNodes} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // AFTER slivers
    const xyz1 = liftMesh(patch, r.uv);
    const q1 = triangleQualityDistribution({ vertices: xyz1, indices: Int32Array.from(r.tris) });
    plog(`[apexPN] AFTER slivers: pct<20=${q1.pctBelow20.toFixed(1)} minAngle=${q1.minAngleDeg.toFixed(2)} median=${q1.medianMinAngleDeg.toFixed(2)} tris=${r.tris.length / 3}`);

    // watertight (non-vacuous)
    const wt = watertight(patch, r.uv, r.tris);
    plog(`[apexPN] watertight: nonMan=${wt.nonMan} nonVacuous=${wt.nonVacuous}`);

    // WHOLE-MESH honest acceptance guard (every facet, 45-pt, two-stage brute) — the fidelity gate.
    const tG = Date.now();
    const wg = acceptanceGuardWhole(patch, r.uv, r.tris, TOL, RULER);
    plog(`[apexPN] WHOLE-MESH GUARD: outliers=${wg.wholeMeshOutliers} max=${wg.wholeMeshMaxMm} p50=${wg.p50} p90=${wg.p90} p99=${wg.p99} worstGradU=${wg.worstGradU} outlierGradU=${JSON.stringify(wg.outlierGradU)} bruteCalls=${wg.bruteCalls} in ${((Date.now() - tG) / 1000).toFixed(0)}s`);
    writeFileSync(join(DIR, `wholeguard_${key}.json`), JSON.stringify(wg, null, 2));

    // render true-3D heatmap (visual gate)
    try {
      dumpHeatmap(DIR, `apexpn_${key}_true3d`, xyz1, r.uv, Int32Array.from(r.tris), patch.rA, patch.H, { scaleMm: 0.03, meta: { style: 'GothicArches-apexPN', pctBelow20: +q1.pctBelow20.toFixed(1) } });
      plog(`[apexPN] heatmap written apexpn_${key}_true3d.png`);
    } catch (e) { plog(`[apexPN] heatmap FAILED: ${String(e)}`); }

    const reachesLiteralZero = wg.wholeMeshOutliers === 0;
    const row = {
      key,
      ang: ANG, gradU: GRADU, nInterior: NINT,
      baseTris: tris.length / 3, basePctBelow20: +q0.pctBelow20.toFixed(1), baseMinAngle: +q0.minAngleDeg.toFixed(2), baseMedian: +q0.medianMinAngleDeg.toFixed(2),
      nNeedle: r.nNeedle, nNearApexNeedle: r.nNearApexNeedle, panelNeedle: r.diag.nPanelNeedle,
      nClusters: r.nClusters, clustersRetessellated: r.clustersRetessellated, clustersSkipped: r.clustersSkipped,
      oldFacetsReplaced: r.nOldFacetsReplaced, newFacets: r.nNewFacets, interiorNodes: r.nInteriorNodes,
      finalTris: r.tris.length / 3,
      pctBelow20: +q1.pctBelow20.toFixed(1), minAngleDeg: +q1.minAngleDeg.toFixed(2), medianMinAngle: +q1.medianMinAngleDeg.toFixed(2),
      wholeMeshOutliers: wg.wholeMeshOutliers, wholeMeshMaxMm: wg.wholeMeshMaxMm, wholeGuardP99: wg.p99, worstGradU: wg.worstGradU, outlierGradU: wg.outlierGradU,
      watertightNonMan: wt.nonMan, nonVacuous: wt.nonVacuous,
      reachesLiteralZero,
    };
    writeFileSync(join(DIR, `${key}.json`), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[apexPN] RESULT: pctBelow20 ${q0.pctBelow20.toFixed(1)}->${q1.pctBelow20.toFixed(1)} wholeMeshOutliers=${wg.wholeMeshOutliers} watertight=${wt.nonMan}/nonVac=${wt.nonVacuous} reachesLiteralZero=${reachesLiteralZero}`);
    expect(r.tris.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
