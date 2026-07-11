// _tierc_ds_f3.test.ts — PROD-TIERC / E-2026-07-11-TIERC-HEADTOHEAD, DS Finding-3 arm.
//
// B1 (research/lab/tierc/B1-dragonscales-verdict.md) Finding 3: the NATIVE DS chain
// (buildRegionOuterWall(getManifest('DragonScales'))) shows a 73% %<20° quality collapse
// (minAngle 0.9°), UNDIAGNOSED, IDENTICAL in native/corrected configs (so NOT the Finding-1 overlap
// bug). B1 built at K1_TOY_DEFAULTS (loose 0.05mm sag) — this arm asks: does the collapse persist at
// PRODUCTION-TIGHT sizing (AF_PROD_OPTS-equivalent), or was it a loose-config artifact?
//
// GAP CONFIRMED BY READING (tierc_regionLayer.ts:804-818, tierc_manifest.ts:394-408):
// buildStructCdtChain (DS's N-region dispatch, unexported) resolves each R-CDT body region's
// maxSagMm/maxEdgeMm/minEdgeMm/gradeRatio/maxLevel/nRing via `pickNum(key, K1_TOY_DEFAULTS.key,
// region.sizing.params, region.kernelOpts)` — sizing.params CHECKED FIRST. dragonScalesAnatomy's
// body regions set `sizing.params = {resU:128, resT:128}` ONLY (already AF_PROD_OPTS-equivalent for
// those two keys) — maxSagMm/maxEdgeMm/minEdgeMm/maxLevel/nRing are absent, so they silently fall
// through to K1_TOY_DEFAULTS (maxSagMm 0.05 vs prod-tight 0.003 = 16.7x looser; maxLevel 10 vs 16;
// nRing falls to a hardcoded 512 vs prod-tight 2048). This is the region-layer sizing-thread GAP:
// there is no RegionBuildOpts field to pass tight sizing to the N-region chain path (RegionBuildOpts
// only carries styleParams/tWallMm/tBottomMm/rDrainMm/sampleRes — nothing sizing-related).
// R-STRUCT ring bands are NOT part of this gap — dragonScalesAnatomy deliberately sets their sizing
// to `{method:'designed-texture-exempt'}` (no params) with a fixed nTheta=2400 in kernelOpts, and
// the manifest's own comment says this must NOT be raised (θ-trap, §2.5: doubling nTheta made the
// sheet WORSE). So "tight sizing" is a body-region-only lever by design.
//
// PROBE-LEVEL OVERRIDE (rule: READ-ONLY on committed src/research libs): withTightBodySizing(...)
// below wraps the REAL, committed `dragonScalesAnatomy` (via manifest.anatomy) and overrides only
// the returned R-CDT regions' `sizing.params` with AF_PROD_OPTS-equivalent values post-hoc. No
// committed file is edited. This threads all the way to buildK1ZBand/ConformingWallOptions because
// pickNum checks sizing.params before falling back to K1_TOY_DEFAULTS.
//
// Env gates (RESILIENCE: one probe per question, checkpoint the instant computed):
//   PF_TIERC_DS_F3_SMOKE=1    — single body region at tight sizing: derisk tri-count/time blowup
//                                BEFORE committing to the full 15-region chain.
//   PF_TIERC_DS_F3=1          — MAIN: full tight-sized native chain build + topology + whole-mesh
//                                quality + body-vs-ringBand quality split (localizes the collapse).
//   PF_TIERC_DS_F3_FIDELITY=1 — SECONDARY, time-boxed: bounded V11g composite-ruler spot-check
//                                (prescreen/stride sample, NOT a full scan — B1 showed that's
//                                intractable). Skipped if MAIN did not finish or bins are missing.
//
// NEW-FILE-ONLY. research/ never imported by src/. No committed file edited (tierc_manifest.ts,
// tierc_regionLayer.ts, _tierc_b0_toy_lib.ts, _ds_prodtruth_lib.ts, _tierc_b1_lib.ts,
// _analytic_floor_lib.ts, labkit.ts, metrics.ts are all READ-ONLY imports). Commits nothing.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS, type StyleManifest } from './tierc_manifest';
import { buildRegionOuterWall } from './tierc_regionLayer';
import { AF_PROD_OPTS } from './_analytic_floor_lib';
import { buildK1ZBand } from './_tierc_b0_toy_lib';
import {
  dsRadiusFn, dragonRings, buildConformRuler, classifyRingBand,
  scoreBodyFacets, scoreRingBandFacets, TOL as DS_TOL,
} from './_ds_prodtruth_lib';
import { nonManRawBig, nonManRawBigStats } from './labkit';
import { topologyMetric, triangleQualityDistribution, triangleQuality3D } from '../../src/fidelity/metrics';
import { boundaryRimVsInterior } from './_tierc_b1_lib';

const OUT_DIR = join('research', 'exchange', '_tierc_ds_f3');
const NDJSON = join(OUT_DIR, 'scorecard.ndjson');
const H = TIERC_COMMON_DIMS.H;

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${String(row.key)}] ${JSON.stringify(row).slice(0, 2000)}`);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => {
    try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; }
  });
}

// dump/load raw bins (mirrors _tierc_b1_lib.ts's dumpB1Bin convention, kept local per its own
// stated "avoid a labkit edit per shared-file discipline" reasoning).
function dumpBin(name: string, xyz: Float32Array, idx: Uint32Array): void {
  const { writeFileSync } = require('node:fs') as typeof import('node:fs');
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${name}.xyz.bin`), Buffer.from(xyz.buffer, xyz.byteOffset, xyz.byteLength));
  writeFileSync(join(OUT_DIR, `${name}.idx.bin`), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
}
function loadBin(name: string): { xyz: Float32Array; idx: Uint32Array } {
  const xb = readFileSync(join(OUT_DIR, `${name}.xyz.bin`));
  const ib = readFileSync(join(OUT_DIR, `${name}.idx.bin`));
  return {
    xyz: new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4),
    idx: new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4),
  };
}
function binExists(name: string): boolean {
  return existsSync(join(OUT_DIR, `${name}.xyz.bin`)) && existsSync(join(OUT_DIR, `${name}.idx.bin`));
}

/** Reproduces _tierc_ds_topofix.test.ts's own signedVolumeMm3Of (unexported upstream; same
 *  "safely reproduced rather than imported" reasoning as _tierc_b1_lib.ts's header). */
function signedVolumeMm3Of(xyz: Float32Array | Float64Array, idx: Uint32Array): number {
  let vol = 0;
  const nT = idx.length / 3;
  for (let t = 0; t < nT; t++) {
    const i0 = idx[3 * t], i1 = idx[3 * t + 1], i2 = idx[3 * t + 2];
    const ax = xyz[3 * i0], ay = xyz[3 * i0 + 1], az = xyz[3 * i0 + 2];
    const bx = xyz[3 * i1], by = xyz[3 * i1 + 1], bz = xyz[3 * i1 + 2];
    const cx = xyz[3 * i2], cy = xyz[3 * i2 + 1], cz = xyz[3 * i2 + 2];
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return vol;
}

const TIGHT_BODY_PARAMS = {
  maxSagMm: AF_PROD_OPTS.maxSagMm,
  maxEdgeMm: AF_PROD_OPTS.maxEdgeMm,
  minEdgeMm: AF_PROD_OPTS.minEdgeMm,
  gradeRatio: AF_PROD_OPTS.gradeRatio,
  maxLevel: AF_PROD_OPTS.maxLevel,
  resU: AF_PROD_OPTS.resU,
  resT: AF_PROD_OPTS.resT,
  nRing: AF_PROD_OPTS.nRing,
};

/** See file header for the full gap analysis. Wraps the REAL committed dragonScalesAnatomy (via
 *  manifest.anatomy) and overrides only R-CDT (body) regions' sizing.params post-hoc — R-STRUCT
 *  (ring) regions are untouched by design (designed-texture-exempt). */
function withTightBodySizing(manifest: StyleManifest): StyleManifest {
  return {
    ...manifest,
    anatomy: (params, dims) => {
      const a = manifest.anatomy(params, dims);
      return {
        ...a,
        regions: a.regions.map((r) =>
          r.type === 'R-CDT'
            ? { ...r, sizing: { ...r.sizing, params: { ...(r.sizing.params ?? {}), ...TIGHT_BODY_PARAMS } } }
            : r,
        ),
      };
    },
  };
}

describe('TIERC-DS-F3 — DS Finding-3 quality collapse: config vs structural (tight sizing)', () => {
  // ═══════════════════════ SMOKE — single body region, derisk before full chain ═══════════════════════
  it.skipIf(process.env.PF_TIERC_DS_F3_SMOKE !== '1')(
    'SMOKE — single R-CDT body region at AF_PROD_OPTS-tight sizing (tri count + time projection)',
    () => {
      const manifest = getManifest('DragonScales');
      const anatomy = manifest.anatomy({}, TIERC_COMMON_DIMS);
      const body0 = anatomy.regions.find((r) => r.type === 'R-CDT');
      if (!body0 || body0.domain.zLo === undefined || body0.domain.zHi === undefined) {
        throw new Error('SMOKE: no R-CDT region with a defined z-domain found in DragonScales anatomy');
      }
      plog(`[SMOKE] body region "${body0.id}" z=[${body0.domain.zLo},${body0.domain.zHi}] (span ${(body0.domain.zHi - body0.domain.zLo).toFixed(2)}mm)`);
      plog(`[SMOKE] tight params: ${JSON.stringify(TIGHT_BODY_PARAMS)} (AF_PROD_OPTS-equivalent, vs K1_TOY_DEFAULTS maxSagMm=0.05/maxLevel=10/nRing~512)`);
      const t0 = Date.now();
      const region = buildK1ZBand(manifest.truth.rA, body0.domain.zLo, body0.domain.zHi, {
        nRing: TIGHT_BODY_PARAMS.nRing,
        maxSagMm: TIGHT_BODY_PARAMS.maxSagMm,
        maxEdgeMm: TIGHT_BODY_PARAMS.maxEdgeMm,
        minEdgeMm: TIGHT_BODY_PARAMS.minEdgeMm,
        gradeRatio: TIGHT_BODY_PARAMS.gradeRatio,
        maxLevel: TIGHT_BODY_PARAMS.maxLevel,
        resU: TIGHT_BODY_PARAMS.resU,
        resT: TIGHT_BODY_PARAMS.resT,
      });
      const ms = Date.now() - t0;
      const tris = region.result.indices.length / 3;
      const nBodyRegions = anatomy.regions.filter((r) => r.type === 'R-CDT').length;
      const nRingRegions = anatomy.regions.filter((r) => r.type === 'R-STRUCT').length;
      const projectedFullMs = ms * nBodyRegions; // rings are cheap/fixed-cost, bodies dominate
      plog(`[SMOKE] tris=${tris} in ${ms}ms. ${nBodyRegions} body regions total -> projected full-chain body build ~${(projectedFullMs / 1000).toFixed(1)}s (+ ${nRingRegions} fixed-cost rings)`);
      checkpoint({
        key: 'smoke', regionId: body0.id, zLo: body0.domain.zLo, zHi: body0.domain.zHi,
        tris, ms, nBodyRegions, nRingRegions, projectedFullMs, tightParams: TIGHT_BODY_PARAMS,
      });
      expect(tris).toBeGreaterThan(0);
    },
    5 * 60 * 1000,
  );

  // ═══════════════════════ MAIN — full tight-sized native chain: topology + quality + localization ═══════════════════════
  it.skipIf(process.env.PF_TIERC_DS_F3 !== '1')(
    'MAIN — tight-sized native DS chain: topology stays closed, %<20 vs B1 loose 73%, body-vs-ringBand localization',
    () => {
      if (keyExists('main_done')) { plog('[skip] main already done'); expect(true).toBe(true); return; }

      const manifest = withTightBodySizing(getManifest('DragonScales'));
      plog(`[BUILD] tight-sized manifest ready. Calling buildRegionOuterWall(DragonScales, tight-body-sizing)...`);
      const t0 = Date.now();
      const built = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
      const buildMs = Date.now() - t0;
      const { xyz, idx } = built.outer;
      const nTris = idx.length / 3;
      const nVerts = xyz.length / 3;
      plog(`[BUILD] dispatch=${built.meta.dispatch} tris=${nTris} verts=${nVerts} in ${buildMs}ms`);
      plog(`[BUILD] per-region: ${JSON.stringify(built.meta.regions)}`);
      plog(`[BUILD] warnings: ${JSON.stringify(built.meta.warnings)}`);
      dumpBin('tight', xyz, idx);
      const budget = manifest.budget.maxOuterTris;
      checkpoint({
        key: 'build', dispatch: built.meta.dispatch, nTris, nVerts, buildMs,
        regions: built.meta.regions, budgetMaxOuterTris: budget, overBudget: nTris > budget,
        warnings: built.meta.warnings,
      });

      // ── topology (must stay CLOSED per d4eeb5c8 — Findings 1+2 fixes must survive sizing change) ──
      const tTopo0 = Date.now();
      const raw = nonManRawBigStats(idx);
      const cracked = new Uint32Array(idx.length + 3);
      cracked.set(idx);
      cracked.set([idx[0], idx[1], idx[2]], idx.length);
      const crackedNonMan = nonManRawBig(cracked);
      const nonVacuous = crackedNonMan > raw.nonMan;
      const topo = topologyMetric({ vertices: xyz, indices: idx }, 1e-4);
      const rim = boundaryRimVsInterior(xyz, idx, H, 0.05);
      const q3d = triangleQuality3D({ vertices: xyz, indices: idx });
      const signedVolume = signedVolumeMm3Of(xyz, idx);
      const topoMs = Date.now() - tTopo0;
      plog(
        `[TOPO] nonMan=${topo.nonManifoldEdges} orientMismatch=${topo.orientationMismatches} ` +
        `boundary=${topo.boundaryEdges} (rim=${rim.rim}/interior=${rim.interior}) zeroArea=${q3d.degenerateCount} ` +
        `signedVolume=${signedVolume.toFixed(1)}mm3 (${signedVolume > 0 ? 'OUTWARD' : 'INWARD'}) nonVacuous=${nonVacuous} (${topoMs}ms)`,
      );
      checkpoint({
        key: 'topology', nonManifoldEdges: topo.nonManifoldEdges, orientationMismatches: topo.orientationMismatches,
        boundaryEdges: topo.boundaryEdges, rimBoundary: rim.rim, interiorBoundary: rim.interior,
        zeroArea: q3d.degenerateCount, signedVolumeMm3: signedVolume, outward: signedVolume > 0,
        rawNonMan: raw.nonMan, controlInjectedNonMan: crackedNonMan, nonVacuous, topoMs,
        closed: topo.nonManifoldEdges === 0 && topo.orientationMismatches === 0 && rim.interior === 0 && signedVolume > 0,
      });

      // ── whole-mesh quality (T5's %<20 figure; B1 loose baseline: 73.4% native / 73.7% corrected) ──
      const tQ0 = Date.now();
      const qWhole = triangleQualityDistribution({ vertices: xyz, indices: idx });
      const qMs = Date.now() - tQ0;
      plog(`[QUALITY-WHOLE] minAngleDeg=${qWhole.minAngleDeg} p5MinAngleDeg=${qWhole.p5MinAngleDeg} pctBelow20=${qWhole.pctBelow20} pctBelow10=${qWhole.pctBelow10} (${qMs}ms, n=${qWhole.triangleCount})`);
      checkpoint({
        key: 'quality_whole', minAngleDeg: qWhole.minAngleDeg, p5MinAngleDeg: qWhole.p5MinAngleDeg,
        medianMinAngleDeg: qWhole.medianMinAngleDeg, pctBelow10: qWhole.pctBelow10, pctBelow20: qWhole.pctBelow20,
        pctBelow30: qWhole.pctBelow30, degenerateCount: qWhole.degenerateCount, triangleCount: qWhole.triangleCount,
        b1LooseNativePctBelow20: 73.4, b1LooseCorrectedPctBelow20: 73.7,
        delta: qWhole.pctBelow20 - 73.4,
      });

      // ── body-vs-ringBand localization (classifyRingBand — geometric, order-independent) ──
      const rA = dsRadiusFn();
      const rings = dragonRings(8);
      const ringZs = rings.map((r) => r.z);
      const bandMm = 1.5; // matches B1 Stage-3's own basis (champion-spec §1.4 production band)
      const cls = classifyRingBand(xyz, idx, ringZs, bandMm);
      const bodyFacets: number[] = [];
      const ringFacets: number[] = [];
      for (let f = 0; f < nTris; f++) { if (cls(f) === 'ringBand') ringFacets.push(f); else bodyFacets.push(f); }
      plog(`[LOCALIZE] body=${bodyFacets.length} ringBand=${ringFacets.length} (bandMm=${bandMm})`);

      const sliceIdx = (facets: number[]): Uint32Array => {
        const out = new Uint32Array(facets.length * 3);
        for (let i = 0; i < facets.length; i++) {
          const f = facets[i];
          out[3 * i] = idx[3 * f]; out[3 * i + 1] = idx[3 * f + 1]; out[3 * i + 2] = idx[3 * f + 2];
        }
        return out;
      };
      const qBody = triangleQualityDistribution({ vertices: xyz, indices: sliceIdx(bodyFacets) });
      const qRing = triangleQualityDistribution({ vertices: xyz, indices: sliceIdx(ringFacets) });
      plog(`[LOCALIZE-BODY] n=${qBody.triangleCount} minAngle=${qBody.minAngleDeg} pctBelow20=${qBody.pctBelow20}`);
      plog(`[LOCALIZE-RING] n=${qRing.triangleCount} minAngle=${qRing.minAngleDeg} pctBelow20=${qRing.pctBelow20}`);
      checkpoint({
        key: 'quality_localize',
        bodyCount: bodyFacets.length, bodyPctBelow20: qBody.pctBelow20, bodyMinAngle: qBody.minAngleDeg, bodyP5MinAngle: qBody.p5MinAngleDeg,
        ringCount: ringFacets.length, ringPctBelow20: qRing.pctBelow20, ringMinAngle: qRing.minAngleDeg, ringP5MinAngle: qRing.p5MinAngleDeg,
        ringShareOfSlivers:
          (qBody.pctBelow20 / 100 * bodyFacets.length + qRing.pctBelow20 / 100 * ringFacets.length) > 0
            ? (qRing.pctBelow20 / 100 * ringFacets.length) / (qBody.pctBelow20 / 100 * bodyFacets.length + qRing.pctBelow20 / 100 * ringFacets.length)
            : null,
      });

      checkpoint({ key: 'main_done', nTris, buildMs, pctBelow20Whole: qWhole.pctBelow20, closed: topo.nonManifoldEdges === 0 && topo.orientationMismatches === 0 });
      expect(true).toBe(true);
    },
    10 * 60 * 1000,
  );

  // ═══════════════════════ FIDELITY — secondary, time-boxed spot-check ═══════════════════════
  it.skipIf(process.env.PF_TIERC_DS_F3_FIDELITY !== '1')(
    'FIDELITY spot-check (secondary) — V11g composite ruler, bounded prescreen/stride sample, tight-sized mesh',
    () => {
      if (keyExists('fidelity_done')) { plog('[skip] fidelity already done'); expect(true).toBe(true); return; }
      if (!binExists('tight')) { plog('[FIDELITY] no tight bins on disk — run PF_TIERC_DS_F3=1 first'); expect(true).toBe(true); return; }

      const { xyz, idx } = loadBin('tight');
      const nF = idx.length / 3;
      const rA = dsRadiusFn();
      const rings = dragonRings(8);
      const ringZs = rings.map((r) => r.z);
      const bandMm = 1.5;
      const cls = classifyRingBand(xyz, idx, ringZs, bandMm);
      const bodyAll: number[] = [], ringAll: number[] = [];
      for (let f = 0; f < nF; f++) { if (cls(f) === 'ringBand') ringAll.push(f); else bodyAll.push(f); }
      plog(`[FID] body=${bodyAll.length} ringBand=${ringAll.length} — building V11g composite ruler...`);
      const tR0 = Date.now();
      const loc = buildConformRuler(rA);
      plog(`[FID] ruler built in ${Date.now() - tR0}ms`);

      const BUDGET_MS = 8 * 60 * 1000;

      // BODY: probe first (tight sizing may have MUCH more body tris than B1's loose full-scan), then
      // decide stride from the projection — same discipline B1 applied to ring-band only.
      const PROBE_B = Math.min(2000, bodyAll.length);
      const probeBodySet = bodyAll.slice(0, PROBE_B);
      const tPB0 = Date.now();
      scoreBodyFacets(xyz, idx, probeBodySet, loc, rA, DS_TOL);
      const probeBodyMs = Date.now() - tPB0;
      const perBodyMs = PROBE_B > 0 ? probeBodyMs / PROBE_B : 0;
      const projectedBodyMs = perBodyMs * bodyAll.length;
      let bodyStride = 1;
      if (projectedBodyMs > BUDGET_MS) bodyStride = Math.ceil(projectedBodyMs / BUDGET_MS);
      const bodySample = bodyStride === 1 ? bodyAll : bodyAll.filter((_, i) => i % bodyStride === 0);
      plog(`[FID-BODY] probe ${PROBE_B} in ${probeBodyMs}ms -> projected full ${(projectedBodyMs / 1000).toFixed(0)}s, stride=${bodyStride}, sample=${bodySample.length}`);
      const tB0 = Date.now();
      const bodyStats = scoreBodyFacets(xyz, idx, bodySample, loc, rA, DS_TOL, (done, total) => {
        if (done % Math.max(1, Math.floor(total / 5)) === 0) plog(`[FID-BODY] ${done}/${total}`);
      });
      const bodyMs = Date.now() - tB0;
      plog(`[FID-BODY] done ${(bodyMs / 1000).toFixed(1)}s out=${bodyStats.outliers}/${bodyStats.scannedFacets} max=${bodyStats.maxMm} p99=${bodyStats.p99}`);
      checkpoint({ key: 'fidelity_body', population: 'body', ...bodyStats, ms: bodyMs, fullPopulation: bodyAll.length, stride: bodyStride, basis: bodyStride === 1 ? 'literal' : `STRIDE=${bodyStride} labeled estimate` });

      // RING-BAND: same probe-then-stride discipline (B1's own precedent — ring has no sound prefilter).
      const PROBE_R = Math.min(2000, ringAll.length);
      const probeRingSet = ringAll.slice(0, PROBE_R);
      const tPR0 = Date.now();
      scoreRingBandFacets(xyz, idx, probeRingSet, loc, DS_TOL);
      const probeRingMs = Date.now() - tPR0;
      const perRingMs = PROBE_R > 0 ? probeRingMs / PROBE_R : 0;
      const projectedRingMs = perRingMs * ringAll.length;
      let ringStride = 1;
      if (projectedRingMs > BUDGET_MS) ringStride = Math.ceil(projectedRingMs / BUDGET_MS);
      const ringSample = ringStride === 1 ? ringAll : ringAll.filter((_, i) => i % ringStride === 0);
      plog(`[FID-RING] probe ${PROBE_R} in ${probeRingMs}ms -> projected full ${(projectedRingMs / 1000).toFixed(0)}s, stride=${ringStride}, sample=${ringSample.length}`);
      const tRi0 = Date.now();
      const ringStats = scoreRingBandFacets(xyz, idx, ringSample, loc, DS_TOL, (done, total) => {
        if (done % Math.max(1, Math.floor(total / 5)) === 0) plog(`[FID-RING] ${done}/${total}`);
      });
      const ringMs = Date.now() - tRi0;
      plog(`[FID-RING] done ${(ringMs / 1000).toFixed(1)}s out=${ringStats.outliers}/${ringStats.scannedFacets} max=${ringStats.maxMm} p99=${ringStats.p99}`);
      checkpoint({ key: 'fidelity_ring', population: 'ringBand', ...ringStats, ms: ringMs, fullPopulation: ringAll.length, stride: ringStride, basis: ringStride === 1 ? 'literal' : `STRIDE=${ringStride} labeled estimate` });

      checkpoint({ key: 'fidelity_done', bodyMs, ringMs });
      expect(true).toBe(true);
    },
    20 * 60 * 1000,
  );
});
