// _pf_creststrip_direct.test.ts — DEV-ONLY (PF_DIRECT=1). GATE-2 SLIVERS: the EXPLICIT STRUCTURED-QUAD FLANK
// STRIP with DIRECTLY-EMITTED connectivity (NO cdt2d), on GothicArches (PF_STYLE=gothic, default) OR GeometricStar
// (PF_STYLE=geostar).
//
// E-2026-07-05-CRESTSTRIP-DIRECT. The V6 refineCrestStrip was REFUTED because it inserted structured points then
// re-CDT'd the whole set with free cdt2d (which re-chorded them into needles). This probe builds the WHOLE patch as
// a structured (t-row × crest-tracking-u-column) mesh and stitches rows with a monotone u-zipper that EMITS TRIS
// DIRECTLY — cdt2d is never called. Square cells by construction (no cross-flank needles), no-bridge crest,
// watertight by construction, on-surface by construction (honest whole-mesh brute decides 0-outlier).
//
// PRE-REGISTERED KILL-CRITERION (this file header IS the pre-registration; ledger row appended on commit):
//   CONFIRM iff pctBelow20 → SINGLE DIGITS (<~10%) AND minAngle sane WHILE wholeMeshOutliers HOLD 0 (EVERY free
//     facet, honest ≥36-pt full-azimuth brute, acceptanceGuardWhole) AND zeroAreaFaces=0 AND watertight
//     (auditNonManByIndex=0 by index, non-vacuous — inject crack moves the count).
//   REFUTE iff the structured strip cannot HOLD 0-outlier (any facet floors >tol after density is raised) OR cannot
//     reach single-digit %<20 (report the honest %<20 at outliers=0).
//   Report pctBelow20 before/after, minAngle, wholeMeshOutliers, zeroArea, watertight; reachesCleanAndZero.
//
// "before" = the CONFIRMED M-square edge-mode mesh's banked figures (Gothic 56.2% <20°, GeoStar 21.3%); "after" =
// this direct-strip mesh. ISOLATION: NEW file. Reuses labkit + _pf_perfectMesherLib + _pf_perfectMesherBruteLib +
// _pf_crestStripDirectLib + _pf_geostarPatchLib + _pf_crestStripLib READ-ONLY. Writes ONLY research/exchange/. Env
// sub-gate + row-exists skip ⇒ resumable; checkpoint each unit the instant computed.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution } from './labkit';
import { makeGothicPatch, liftMesh, type PatchDef } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { acceptanceGuardWhole } from './_pf_perfectMesherBruteLib';
import { buildDirectCrestStrip } from './_pf_crestStripDirectLib';
import { countZeroAreaFaces } from './_pf_crestStripLib';

const TOL = 0.01;
const STYLE = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
const SMOKE = process.env.PF_SMOKE === '1';
const DIR = join(process.cwd(), 'research', 'exchange', `_pf_creststrip_direct_${STYLE}${SMOKE ? '_smoke' : ''}`);
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

// Patch: default 2-bay / 8mm z-band (matches the whole-mesh probe scope — tractable honest whole-mesh guard).
const BAYS = Number(process.env.PF_BAYS ?? (SMOKE ? 2 : 2));
const ZBAND_MM = Number(process.env.PF_ZBAND ?? (SMOKE ? 6 : 8));
const MIN_AMP = 0.03;
// strip density knobs (3D mm). hCrest fine across-crest near the apex (0-outlier lever); dtRow ~ hCrest for square
// cells along the crest; hPanel coarse on the smooth panel.
const H_CREST = Number(process.env.PF_HCREST ?? (SMOKE ? 0.05 : 0.03));
const H_PANEL = Number(process.env.PF_HPANEL ?? 0.3);
const DT_ROW = Number(process.env.PF_DTROW ?? (SMOKE ? 0.06 : 0.04));
const N_RAMP = Number(process.env.PF_NRAMP ?? 6);
// honest whole-mesh guard ruler (SAME two-stage anchor the CONFIRMED kernel uses).
const LOOP_NTH = Number(process.env.PF_LNTH ?? (SMOKE ? 512 : 1024));
const RULER = { gnScreen: 0.006, preFilter: 0.006, nTheta: LOOP_NTH, nZ: 120, zBandMm: 3, refineIters: 60 };

function makePatch(): PatchDef {
  return STYLE === 'geostar' ? makeGeoStarPatch(BAYS, ZBAND_MM) : makeGothicPatch(BAYS, ZBAND_MM);
}

describe(`pf-creststrip-DIRECT [${STYLE}]: structured-quad flank strip, connectivity emitted DIRECTLY (no cdt2d)`, () => {
  it.skipIf(process.env.PF_DIRECT !== '1')('direct-strip -> hold 0-outlier + single-digit %<20', () => {
    if (rowExists('direct')) { plog('direct row exists, skip'); return; }
    const patch = makePatch();
    plog(`[direct ${STYLE}] patch: bays=${BAYS} zBand=${ZBAND_MM} u[${patch.uLo.toFixed(4)}..${patch.uHi.toFixed(4)}] t[${patch.tLo.toFixed(4)}..${patch.tHi.toFixed(4)}] hCrest=${H_CREST} hPanel=${H_PANEL} dtRow=${DT_ROW} nRamp=${N_RAMP}`);
    const t0 = Date.now();
    const strip = buildDirectCrestStrip(patch, { dtRowMm: DT_ROW, hCrestMm: H_CREST, hPanelMm: H_PANEL, nRamp: N_RAMP, minAmp: MIN_AMP });
    plog(`[direct] built: rows=${strip.nRows} nodes=${strip.nNodes} tris=${strip.tris.length / 3} rowCount[${strip.minRowCount}..${strip.maxRowCount}] in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    persistMesh('direct_mesh.bin', strip.uv, strip.tris);

    const xyz = liftMesh(patch, strip.uv);

    // ── watertight (by INDEX, non-vacuous control) ──
    const nonMan = auditNonManByIndex(xyz, strip.tris, 1e-4);
    const a0 = strip.tris[0], b0 = strip.tris[1]; const vNew = strip.uv.length / 2;
    const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
    xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
    const crackTris = strip.tris.slice(); crackTris.push(a0, b0, vNew);
    const nonManCracked = auditNonManByIndex(xyz2, crackTris, 1e-4);
    const nonVacuous = nonManCracked > nonMan;
    plog(`[direct] watertight: nonMan=${nonMan} injected=${nonManCracked} nonVacuous=${nonVacuous}`);

    // ── zero-area / degenerate faces ──
    const za = countZeroAreaFaces(xyz, strip.tris);
    plog(`[direct] zeroArea=${za.zeroArea} subMicro=${za.subMicro} minArea=${za.minAreaMm2.toExponential(2)}`);

    // ── slivers ──
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(strip.tris) });
    plog(`[direct] slivers: minAngle=${q.minAngleDeg.toFixed(2)} median=${q.medianMinAngleDeg.toFixed(2)} pct<20=${q.pctBelow20.toFixed(1)}%`);

    // ── HONEST WHOLE-MESH acceptance guard: EVERY free facet, 45-pt denseBary, two-stage brute ──
    const tG = Date.now();
    const wg = acceptanceGuardWhole(patch, strip.uv, strip.tris, TOL, RULER);
    plog(`[direct] WHOLE-MESH GUARD: scored=${wg.nScored}/${wg.nFacets} wholeMeshMax=${wg.wholeMeshMaxMm} outliers=${wg.wholeMeshOutliers} p50=${wg.p50} p90=${wg.p90} p99=${wg.p99} worstGradU=${wg.worstGradU} worstUt=${JSON.stringify(wg.worstUtWorst)} bruteCalls=${wg.bruteCalls} outlierGradU=${JSON.stringify(wg.outlierGradU)} in ${((Date.now() - tG) / 1000).toFixed(0)}s`);
    writeFileSync(join(DIR, 'wholeguard.json'), JSON.stringify(wg, null, 2));

    const reachesCleanAndZero = wg.wholeMeshOutliers === 0 && za.zeroArea === 0 && nonMan === 0 && nonVacuous && q.pctBelow20 < 10;
    const row = {
      key: 'direct', style: STYLE,
      finalTris: strip.tris.length / 3, nodes: strip.nNodes, nRows: strip.nRows, rowCountMin: strip.minRowCount, rowCountMax: strip.maxRowCount,
      wholeMeshOutliers: wg.wholeMeshOutliers, wholeMeshMaxMm: wg.wholeMeshMaxMm, wholeGuardP50: wg.p50, wholeGuardP90: wg.p90, wholeGuardP99: wg.p99, worstGradU: wg.worstGradU, outlierGradU: wg.outlierGradU,
      zeroArea: za.zeroArea, subMicro: za.subMicro, minAreaMm2: za.minAreaMm2,
      watertightNonMan: nonMan, nonManInjected: nonManCracked, nonVacuous,
      minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2), pctBelow20: +q.pctBelow20.toFixed(1),
      reachesCleanAndZero,
    };
    writeFileSync(join(DIR, 'direct.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    plog(`[direct] RESULT: reachesCleanAndZero=${reachesCleanAndZero} outliers=${wg.wholeMeshOutliers} max=${wg.wholeMeshMaxMm} pct<20=${q.pctBelow20.toFixed(1)}% minAngle=${q.minAngleDeg.toFixed(2)} zeroArea=${za.zeroArea} watertight=${nonMan}/nonVac=${nonVacuous} tris=${strip.tris.length / 3}`);
    expect(strip.tris.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
