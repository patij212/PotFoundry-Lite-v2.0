// _pf_hybrid_apex.test.ts — DEV-ONLY (PF_HYBRID=1). GATE-2 SLIVERS: the untried HYBRID — the CLEAN direct-emit
// structured-quad crest strip EVERYWHERE (buildDirectCrestStrip: 0.4% <20°) + a LOCALIZED honest-brute apex refine
// on ONLY the outlier triangles (red-green subdivision, DIRECT connectivity emission, NO cdt2d re-chord). Registry
// E-2026-07-05-CRESTSTRIP-DIRECT §NEXT named this the one remaining move.
//
// PRE-REGISTERED KILL-CRITERION (this header IS the pre-registration; ledger row appended on commit):
//   CONFIRM iff wholeMeshOutliers = 0 (EVERY free facet, honest 45-pt full-azimuth brute acceptanceGuardWhole)
//     AND pctBelow20 SINGLE-DIGIT (<~10%) AND zeroAreaFaces=0 AND watertight (auditNonManByIndex=0 by index,
//     non-vacuous — inject crack moves the count).
//   PARTIAL iff wholeMeshOutliers=0 + watertight + zeroArea=0 HELD but pctBelow20 stays >~10% (report the honest
//     %<20 at 0-outlier — the tradeoff frontier point).
//   REFUTE iff the localized apex refine cannot restore 0-outlier without re-needling back above ~15% (the tension
//     is irreducible for flat-P1 ⇒ the honest final answer is print-usable-with-needles).
//   Report wholeMeshOutliers, pctBelow20 before/after, minAngle, zeroArea, watertight, tris.
//
// STYLE: PF_STYLE=gothic (default) | geostar. "before" = the clean direct strip (its own measured %<20 + outliers);
// "after" = the hybrid-refined mesh. ISOLATION: NEW file. Imports labkit + _pf_perfectMesherLib +
// _pf_perfectMesherBruteLib + _pf_geostarPatchLib + _pf_crestStripLib + _pf_hybridApexLib READ-ONLY. Writes ONLY
// research/exchange/_pf_hybrid_apex_<style>[/_smoke]. Env sub-gate + row-exists skip + persisted mesh => resumable;
// checkpoint each unit the instant computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { makeGothicPatch, liftMesh, type PatchDef } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { acceptanceGuardWhole } from './_pf_perfectMesherBruteLib';
import { countZeroAreaFaces } from './_pf_crestStripLib';
import { buildHybridApex } from './_pf_hybridApexLib';

const TOL = 0.01;
const STYLE = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', `_pf_hybrid_apex_${STYLE}${SMOKE ? '_smoke' : ''}`);
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

// The single-digit-sliver strip config: hCrest=dtRow=0.15 (1-bay/4mm) — the CONFIRMED clean-strip point
// (0.4% <20°, 236 apex outliers @0.22mm on Gothic; registry E-…-CRESTSTRIP-DIRECT).
const BAYS = Number(process.env.PF_BAYS ?? 1);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 4);
const MIN_AMP = 0.03;
const H_CREST = Number(process.env.PF_HCREST ?? 0.15);
const H_PANEL = Number(process.env.PF_HPANEL ?? 0.3);
const DT_ROW = Number(process.env.PF_DTROW ?? 0.15);
const N_RAMP = Number(process.env.PF_NRAMP ?? 6);
const MAX_PASS = Number(process.env.PF_MAXPASS ?? 10);
const LOOP_NTH = Number(process.env.PF_LNTH ?? (SMOKE ? 512 : 1024));
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 120, zBandMm: 3, refineIters: 60 };

function makePatch(): PatchDef {
  return STYLE === 'geostar' ? makeGeoStarPatch(BAYS, ZBAND_MM) : makeGothicPatch(BAYS, ZBAND_MM);
}

describe(`pf-hybrid-apex [${STYLE}]: clean direct strip + LOCAL brute apex refine (red-green, no cdt2d)`, () => {
  it.skipIf(process.env.PF_HYBRID !== '1')('hybrid -> restore 0-outlier while KEEPING single-digit %<20', () => {
    if (rowExists('hybrid')) { plog('hybrid row exists, skip'); return; }
    const patch = makePatch();
    plog(`[hybrid ${STYLE}] patch bays=${BAYS} zBand=${ZBAND_MM} u[${patch.uLo.toFixed(4)}..${patch.uHi.toFixed(4)}] t[${patch.tLo.toFixed(4)}..${patch.tHi.toFixed(4)}] hCrest=${H_CREST} dtRow=${DT_ROW} maxPass=${MAX_PASS}`);
    const t0 = Date.now();
    const res = buildHybridApex(
      patch,
      { dtRowMm: DT_ROW, hCrestMm: H_CREST, hPanelMm: H_PANEL, nRamp: N_RAMP, minAmp: MIN_AMP },
      TOL, RULER, MAX_PASS,
      (h) => { plog(`  pass${h.pass}: tris=${h.nTris} outliers=${h.nOutlier} worst=${h.worst} red=${h.nRed} green=${h.nGreen} ${h.ms}ms`); appendFileSync(join(DIR, 'passes.ndjson'), JSON.stringify(h) + '\n'); },
    );
    plog(`[hybrid] built: baseStripTris=${res.strip.tris.length / 3} baselineOutliers(7pt)=${res.baselineOutliers} baselineWorst=${res.baselineWorst} -> finalTris=${res.tris.length / 3} passes=${res.passes} capped=${res.capped} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    persistMesh('hybrid_mesh.bin', res.uv, res.tris);

    const xyz = liftMesh(patch, res.uv);

    // ── watertight (by INDEX, non-vacuous control) ──
    const nonMan = auditNonManByIndex(xyz, res.tris, 1e-4);
    const a0 = res.tris[0], b0 = res.tris[1]; const vNew = res.uv.length / 2;
    const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
    xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
    const crackTris = res.tris.slice(); crackTris.push(a0, b0, vNew);
    const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
    const nonVacuous = nonManCracked > nonMan;
    plog(`[hybrid] watertight: nonMan=${nonMan} injected=${nonManCracked} nonVacuous=${nonVacuous}`);

    // ── zero-area / degenerate faces ──
    const za = countZeroAreaFaces(xyz, res.tris);
    plog(`[hybrid] zeroArea=${za.zeroArea} subMicro=${za.subMicro} minArea=${za.minAreaMm2.toExponential(2)}`);

    // ── slivers (honest min-angle distribution) ──
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(res.tris) });
    // BEFORE = the clean strip's own quality (A/B for the tradeoff frontier)
    const xyzS = liftMesh(patch, res.strip.uv);
    const qS = triangleQualityDistribution({ vertices: xyzS, indices: Int32Array.from(res.strip.tris) });
    plog(`[hybrid] slivers BEFORE(strip): minAngle=${qS.minAngleDeg.toFixed(2)} median=${qS.medianMinAngleDeg.toFixed(2)} pct<20=${qS.pctBelow20.toFixed(1)}%  AFTER(hybrid): minAngle=${q.minAngleDeg.toFixed(2)} median=${q.medianMinAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}%`);

    // ── HONEST WHOLE-MESH acceptance guard: EVERY free facet, 45-pt denseBary, two-stage full-azimuth brute ──
    const tG = Date.now();
    const wg = acceptanceGuardWhole(patch, res.uv, res.tris, TOL, RULER);
    plog(`[hybrid] WHOLE-MESH GUARD: scored=${wg.nScored}/${wg.nFacets} wholeMeshMax=${wg.wholeMeshMaxMm} outliers=${wg.wholeMeshOutliers} p50=${wg.p50} p90=${wg.p90} p99=${wg.p99} worstGradU=${wg.worstGradU} worstUt=${JSON.stringify(wg.worstUtWorst)} bruteCalls=${wg.bruteCalls} outlierGradU=${JSON.stringify(wg.outlierGradU)} in ${((Date.now() - tG) / 1000).toFixed(0)}s`);
    writeFileSync(join(DIR, 'wholeguard.json'), JSON.stringify(wg, null, 2));

    const reachesCleanAndZero = wg.wholeMeshOutliers === 0 && za.zeroArea === 0 && nonMan === 0 && nonVacuous && q.pctBelow20 < 10;
    const row = {
      key: 'hybrid', style: STYLE, config: { bays: BAYS, zBand: ZBAND_MM, hCrest: H_CREST, dtRow: DT_ROW, maxPass: MAX_PASS },
      stripTris: res.strip.tris.length / 3, finalTris: res.tris.length / 3, passes: res.passes, capped: res.capped,
      baselineOutliers7pt: res.baselineOutliers, baselineWorst7pt: res.baselineWorst,
      wholeMeshOutliers: wg.wholeMeshOutliers, wholeMeshMaxMm: wg.wholeMeshMaxMm, wholeGuardP50: wg.p50, wholeGuardP90: wg.p90, wholeGuardP99: wg.p99, worstGradU: wg.worstGradU, outlierGradU: wg.outlierGradU,
      zeroArea: za.zeroArea, subMicro: za.subMicro, minAreaMm2: za.minAreaMm2,
      watertightNonMan: nonMan, nonManInjected: nonManCracked, nonVacuous,
      pctBelow20Before: +qS.pctBelow20.toFixed(1), minAngleBefore: +qS.minAngleDeg.toFixed(2),
      pctBelow20After: +q.pctBelow20.toFixed(1), minAngleAfter: +q.minAngleDeg.toFixed(2), medianMinAngleAfter: +q.medianMinAngleDeg.toFixed(2),
      reachesCleanAndZero,
    };
    writeFileSync(join(DIR, 'hybrid.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[hybrid] RESULT: reachesCleanAndZero=${reachesCleanAndZero} outliers=${wg.wholeMeshOutliers} max=${wg.wholeMeshMaxMm} pct<20 ${qS.pctBelow20.toFixed(1)}%->${q.pctBelow20.toFixed(1)}% minAngle=${q.minAngleDeg.toFixed(2)} zeroArea=${za.zeroArea} watertight=${nonMan}/nonVac=${nonVacuous} tris=${res.tris.length / 3}`);
    expect(res.tris.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
