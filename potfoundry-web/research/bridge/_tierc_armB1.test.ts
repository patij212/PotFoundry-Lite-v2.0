// _tierc_armB1.test.ts — E-2026-07-11-TIERC-HEADTOHEAD Arm B1 (DragonScales full outer wall: 7
// R-STRUCT ring bands + 8 R-CDT body bands, region layer). Env-gated per stage:
//   PF_TIERC_ARMB1_BUILD=1     — Stage 1: build (native buildRegionOuterWall; corrected fallback
//                                if native shows the domain-overlap defect). Dumps bins, checkpoints.
//   PF_TIERC_ARMB1_TOPO=1      — Stage 2: cheap topology (nonManRawBig non-vacuous, topologyMetric,
//                                rim-vs-interior boundary classification, zeroArea).
//   PF_TIERC_ARMB1_FIDELITY=1  — Stage 3: V11g composite ruler, body vs ring-band, time-boxed.
//
// Prereg: research/lab/E-2026-07-11-TIERC-HEADTOHEAD-prereg.md, Arm B / B1. Champion spec:
// research/lab/tierc/champion-spec-dragonscales.md §5 (T1-T7 reproduce-targets + kill rule). B0
// verdict: research/lab/tierc/B0-boundary-contract-verdict.md (the proven per-seam mechanism this
// arm generalizes to N=15 regions). Architecture: research/lab/tierc/architecture-v1.md §2.
//
// RESILIENCE: env-gated `it` per stage; ndjson CHECKPOINT the instant a result is computed; a key
// that already exists is SKIPPED (a killed run resumes on the unfinished stage) — LAB-CHEATSHEET.md.
//
// NEW-FILE-ONLY. research/ never imported by src/. No committed file edited (tierc_manifest.ts,
// tierc_regionLayer.ts, _tierc_b0_toy_lib.ts, _ds_prodtruth_lib.ts, labkit.ts, metrics.ts are all
// READ-ONLY imports). Commits nothing per mission RULES.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall, type RegionBuildResult } from './tierc_regionLayer';
import { nonManRawBig, nonManRawBigStats } from './labkit';
import { topologyMetric, triangleQualityDistribution, triangleQuality3D } from '../../src/fidelity/metrics';
import {
  dsRadiusFn, dragonRings, buildConformRuler, classifyRingBand,
  scoreBodyFacets, scoreRingBandFacets, TOL as DS_TOL,
} from './_ds_prodtruth_lib';
import { dumpB1Bin, loadB1Bin, b1BinExists, boundaryRimVsInterior, buildDsChainCorrected } from './_tierc_b1_lib';

const OUT_DIR = join('research', 'exchange', '_tierc_b1');
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
function readRow(k: string): Record<string, unknown> | null {
  if (!existsSync(NDJSON)) return null;
  for (const l of readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)) {
    try { const r = JSON.parse(l) as Record<string, unknown>; if (r.key === k) return r; } catch { /* */ }
  }
  return null;
}

describe('TIERC-B1 — DragonScales full outer wall (region layer, N=15 chain)', () => {
  // ═══════════════════════ STAGE 1 — BUILD ═══════════════════════
  it.skipIf(process.env.PF_TIERC_ARMB1_BUILD !== '1')('STAGE 1 — build native (+ corrected fallback if warranted)', () => {
    if (keyExists('stage1_build')) { plog('[skip] stage1 already built'); expect(true).toBe(true); return; }

    const manifest = getManifest('DragonScales');
    plog(`[BUILD] manifest loaded. styleId=${manifest.styleId} ruler=${manifest.ruler} budget=${JSON.stringify(manifest.budget)}`);
    plog('[BUILD] calling buildRegionOuterWall (native region-layer R-STRUCT/R-CDT chain dispatch)...');

    const t0 = Date.now();
    let native: RegionBuildResult | null = null;
    let nativeError: string | null = null;
    try {
      native = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
    } catch (e) {
      nativeError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    }
    const nativeMs = Date.now() - t0;

    if (nativeError) {
      plog(`[BUILD] NATIVE THREW after ${nativeMs}ms: ${nativeError}`);
      checkpoint({ key: 'stage1_build', native: 'THREW', nativeError, nativeMs });
      plog('[BUILD] falling back to corrected chain builder (_tierc_b1_lib.buildDsChainCorrected)...');
    } else if (native) {
      const outerTris = native.outer.idx.length / 3;
      const outerVerts = native.outer.xyz.length / 3;
      plog(`[BUILD] NATIVE OK in ${nativeMs}ms: dispatch=${native.meta.dispatch} outerTris=${outerTris} outerVerts=${outerVerts}`);
      plog(`[BUILD] per-region: ${JSON.stringify(native.meta.regions)}`);
      plog(`[BUILD] warnings (${native.meta.warnings.length}): ${JSON.stringify(native.meta.warnings)}`);
      dumpB1Bin('native', native.outer.xyz, native.outer.idx);
      checkpoint({
        key: 'stage1_build', native: 'OK', dispatch: native.meta.dispatch,
        outerTris, outerVerts, regions: native.meta.regions, nativeMs, warnings: native.meta.warnings,
      });
    }

    // Always ALSO build the corrected (non-overlapping-domain) fallback for direct A/B comparison —
    // cheap (same primitives, same scale) and the mission's own instruction is "if unrecoverable,
    // fall back... labeling the path"; building it regardless (even when native succeeds) turns the
    // domain-overlap hypothesis into a MEASURED finding (tri-count/quality delta) rather than a
    // static-analysis claim.
    const rA = dsRadiusFn();
    plog('[BUILD] building CORRECTED fallback chain (non-overlapping body/ring domains)...');
    const tC0 = Date.now();
    let correctedError: string | null = null;
    let correctedTris = 0, correctedVerts = 0;
    try {
      const corrected = buildDsChainCorrected(rA, H, { nRing: 512, nThetaRing: 2400, treadCap: 4, halfBandMm: 0.6, resU: 128, resT: 128 });
      const correctedMs = Date.now() - tC0;
      correctedTris = corrected.idx.length / 3;
      correctedVerts = corrected.xyz.length / 3;
      plog(`[BUILD] CORRECTED OK in ${correctedMs}ms: tris=${correctedTris} verts=${correctedVerts}`);
      dumpB1Bin('corrected', corrected.xyz, corrected.idx);
      checkpoint({ key: 'stage1_corrected', corrected: 'OK', correctedTris, correctedVerts, correctedMs });
    } catch (e) {
      correctedError = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      plog(`[BUILD] CORRECTED THREW: ${correctedError}`);
      checkpoint({ key: 'stage1_corrected', corrected: 'THREW', correctedError });
    }

    expect(true).toBe(true); // report; do not assert a verdict here (pre-registered adjudication happens after fidelity).
  }, 15 * 60 * 1000);

  // ═══════════════════════ STAGE 2 — CHEAP TOPOLOGY ═══════════════════════
  for (const which of ['native', 'corrected'] as const) {
    it.skipIf(process.env.PF_TIERC_ARMB1_TOPO !== '1')(`STAGE 2 — topology (${which})`, () => {
      if (keyExists(`stage2_topo_${which}`)) { plog(`[skip] stage2_topo_${which} already done`); expect(true).toBe(true); return; }
      if (!b1BinExists(which)) { plog(`[TOPO-${which}] no bins on disk, skip`); expect(true).toBe(true); return; }

      const { xyz, idx } = loadB1Bin(which);
      const nTris = idx.length / 3;
      plog(`[TOPO-${which}] loaded ${nTris} tris / ${xyz.length / 3} verts. running nonManRawBigStats...`);

      const t0 = Date.now();
      const stats = nonManRawBigStats(idx);
      // non-vacuous control: inject a duplicate triangle, verify the count MOVES.
      const cracked = new Uint32Array(idx.length + 3);
      cracked.set(idx);
      cracked.set([idx[0], idx[1], idx[2]], idx.length);
      const crackedNonMan = nonManRawBig(cracked);
      const nonVacuous = crackedNonMan > stats.nonMan;
      plog(`[TOPO-${which}] nonManRawBig=${stats.nonMan} boundary=${stats.boundary} totalEdges=${stats.edges} control(injected)=${crackedNonMan} nonVacuous=${nonVacuous} (${Date.now() - t0}ms)`);

      const t1 = Date.now();
      const topo = topologyMetric({ vertices: xyz, indices: idx }, 1e-4);
      plog(`[TOPO-${which}] topologyMetric(weld=1e-4mm): boundaryEdges=${topo.boundaryEdges} nonManifoldEdges=${topo.nonManifoldEdges} orientationMismatches=${topo.orientationMismatches} (${Date.now() - t1}ms)`);

      const t2 = Date.now();
      const rimCls = boundaryRimVsInterior(xyz, idx, H, 0.05);
      plog(`[TOPO-${which}] boundary rim-vs-interior: rim=${rimCls.rim} interior=${rimCls.interior} (${Date.now() - t2}ms)`);
      if (rimCls.interior > 0) {
        plog(`[TOPO-${which}] INTERIOR BOUNDARY SAMPLES (first ${rimCls.interiorSamples.length}): ${JSON.stringify(rimCls.interiorSamples)}`);
      }

      const t3 = Date.now();
      const q3d = triangleQuality3D({ vertices: xyz, indices: idx });
      plog(`[TOPO-${which}] triangleQuality3D: degenerateCount(zeroArea)=${q3d.degenerateCount} sliverCount=${q3d.sliverCount} maxAspect3D=${q3d.maxAspect3D} (${Date.now() - t3}ms)`);

      checkpoint({
        key: `stage2_topo_${which}`, which, nTris,
        nonManRawBig: stats.nonMan, boundaryEdgesRaw: stats.boundary, totalEdges: stats.edges,
        controlInjectedNonMan: crackedNonMan, nonVacuous,
        topoBoundaryEdges: topo.boundaryEdges, topoNonManifoldEdges: topo.nonManifoldEdges, topoOrientationMismatches: topo.orientationMismatches,
        rimBoundary: rimCls.rim, interiorBoundary: rimCls.interior, interiorSamples: rimCls.interiorSamples,
        zeroArea: q3d.degenerateCount, sliverCount: q3d.sliverCount, maxAspect3D: q3d.maxAspect3D,
      });
      expect(true).toBe(true);
    }, 5 * 60 * 1000);
  }

  // ═══════════════════════ STAGE 3-SMALL — bounded small-sample fidelity (directional read only) ═══════════════════════
  // A full-population run (PF_TIERC_ARMB1_FIDELITY=1) proved intractable within budget: the body
  // regions were built at B0's LOOSE toy tolerance (maxSagMm=0.05mm, looser than the 0.01mm scoring
  // tol), so scoreBodyFacets' cheap green-proven prefilter has a near-zero hit rate and almost every
  // facet falls to the expensive per-facet dense-BVH path. This probe takes a SMALL, FIXED-SIZE,
  // deterministic sample (2000 facets/population/config) with unconditional per-batch console
  // logging (no modulo-filter bug) so progress is directly observable, hard-bounded regardless of
  // population size. Labeled a DIRECTIONAL read only — never an acceptance basis for T1/T2/T3.
  for (const which of ['native', 'corrected'] as const) {
    it.skipIf(process.env.PF_TIERC_ARMB1_FIDELITY_SMALL !== '1')(`STAGE 3-SMALL — bounded fidelity sample (${which})`, () => {
      const key = `stage3small_${which}`;
      if (keyExists(key)) { plog(`[skip] ${key} already done`); expect(true).toBe(true); return; }
      if (!b1BinExists(which)) { plog(`[FIDS-${which}] no bins, skip`); expect(true).toBe(true); return; }

      const { xyz, idx } = loadB1Bin(which);
      const nF = idx.length / 3;
      const rA = dsRadiusFn();
      const rings = dragonRings(8);
      const ringZs = rings.map((r) => r.z);
      const bandMm = 1.5;
      plog(`[FIDS-${which}] building ruler + classifying ${nF} facets...`);
      const loc = buildConformRuler(rA);
      const cls = classifyRingBand(xyz, idx, ringZs, bandMm);
      const bodyAll: number[] = [], ringAll: number[] = [];
      for (let f = 0; f < nF; f++) { if (cls(f) === 'ringBand') ringAll.push(f); else bodyAll.push(f); }
      plog(`[FIDS-${which}] body=${bodyAll.length} ringBand=${ringAll.length}`);

      const SAMPLE = 2000;
      const strideB = Math.max(1, Math.floor(bodyAll.length / SAMPLE));
      const strideR = Math.max(1, Math.floor(ringAll.length / SAMPLE));
      const bodySample = bodyAll.filter((_, i) => i % strideB === 0);
      const ringSample = ringAll.filter((_, i) => i % strideR === 0);
      plog(`[FIDS-${which}] sampling body ${bodySample.length}/${bodyAll.length} (stride ${strideB}), ring ${ringSample.length}/${ringAll.length} (stride ${strideR})`);

      const t0 = Date.now();
      let bDone = 0;
      const bodyStats = scoreBodyFacets(xyz, idx, bodySample, loc, rA, DS_TOL, (done) => {
        bDone = done;
        if (done % 200 === 0) plog(`[FIDS-${which}-BODY] ${done}/${bodySample.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      });
      const bodyMs = Date.now() - t0;
      plog(`[FIDS-${which}-BODY] FINAL ${bDone}/${bodySample.length} in ${(bodyMs / 1000).toFixed(1)}s: out=${bodyStats.outliers}/${bodyStats.scannedFacets} max=${bodyStats.maxMm} p99=${bodyStats.p99} greenProven=${bodyStats.greenProvenFrac}`);
      checkpoint({ key: `${key}_body`, which, population: 'body-SAMPLE', ...bodyStats, ms: bodyMs, fullPopulation: bodyAll.length, stride: strideB, basis: `STRIDE=${strideB} directional sample, NOT an acceptance basis` });

      const t1 = Date.now();
      let rDone = 0;
      const ringStats = scoreRingBandFacets(xyz, idx, ringSample, loc, DS_TOL, (done) => {
        rDone = done;
        if (done % 200 === 0) plog(`[FIDS-${which}-RING] ${done}/${ringSample.length} (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
      });
      const ringMs = Date.now() - t1;
      plog(`[FIDS-${which}-RING] FINAL ${rDone}/${ringSample.length} in ${(ringMs / 1000).toFixed(1)}s: out=${ringStats.outliers}/${ringStats.scannedFacets} max=${ringStats.maxMm} p99=${ringStats.p99}`);
      checkpoint({ key: `${key}_ring`, which, population: 'ringBand-SAMPLE', ...ringStats, ms: ringMs, fullPopulation: ringAll.length, stride: strideR, basis: `STRIDE=${strideR} directional sample, NOT an acceptance basis` });

      checkpoint({ key, which, done: true, bodyMs, ringMs });
      expect(true).toBe(true);
    }, 8 * 60 * 1000);
  }

  // ═══════════════════════ STAGE 3 — FIDELITY (V11g composite ruler, body vs ring-band) ═══════════════════════
  for (const which of ['native', 'corrected'] as const) {
    it.skipIf(process.env.PF_TIERC_ARMB1_FIDELITY !== '1')(`STAGE 3 — fidelity (${which})`, () => {
      const key = `stage3_fidelity_${which}`;
      if (keyExists(key)) { plog(`[skip] ${key} already done`); expect(true).toBe(true); return; }
      if (!b1BinExists(which)) { plog(`[FID-${which}] no bins on disk, skip`); expect(true).toBe(true); return; }
      const topoRow = readRow(`stage2_topo_${which}`);
      if (!topoRow) { plog(`[FID-${which}] stage2 not run yet, skip (run PF_TIERC_ARMB1_TOPO=1 first)`); expect(true).toBe(true); return; }

      const { xyz, idx } = loadB1Bin(which);
      const nF = idx.length / 3;
      const rA = dsRadiusFn();
      const rings = dragonRings(8);
      const ringZs = rings.map((r) => r.z);
      const bandMm = 1.5; // matches T1's own production basis (PF_DS_PT_BAND default, champion-spec §1.4)

      plog(`[FID-${which}] building V11g composite ruler...`);
      const tR0 = Date.now();
      const loc = buildConformRuler(rA);
      plog(`[FID-${which}] ruler built in ${Date.now() - tR0}ms. classifying ${nF} facets (bandMm=${bandMm})...`);

      const cls = classifyRingBand(xyz, idx, ringZs, bandMm);
      const bodyAll: number[] = [], ringAll: number[] = [];
      for (let f = 0; f < nF; f++) { if (cls(f) === 'ringBand') ringAll.push(f); else bodyAll.push(f); }
      plog(`[FID-${which}] body=${bodyAll.length} ringBand=${ringAll.length}`);

      // BODY: full literal scan (sound radial prefilter makes this cheap — most facets are
      // green-proven without touching the BVH).
      const t0 = Date.now();
      const bodyStats = scoreBodyFacets(xyz, idx, bodyAll, loc, rA, DS_TOL, (done, total) => {
        if (done % Math.max(1, Math.floor(total / 5)) === 0) plog(`[FID-${which}-BODY] ${done}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      });
      const bodyMs = Date.now() - t0;
      plog(`[FID-${which}-BODY] done in ${(bodyMs / 1000).toFixed(1)}s: out=${bodyStats.outliers}/${bodyStats.scannedFacets} max=${bodyStats.maxMm} p99=${bodyStats.p99} greenProven=${bodyStats.greenProvenFrac}`);
      checkpoint({ key: `${key}_body`, which, population: 'body', ...bodyStats, ms: bodyMs, fullPopulation: bodyAll.length });

      // RING-BAND: no prefilter (unsound at the riser) — every facet dense-scored. Time-box: probe a
      // small batch first, project total time, and if it would exceed ~8min, switch to a labeled
      // stride (champion-spec precedent: production itself used an 8/16 SHARD for exactly this reason).
      const PROBE_N = Math.min(2000, ringAll.length);
      const probeSet = ringAll.slice(0, PROBE_N);
      const tP0 = Date.now();
      scoreRingBandFacets(xyz, idx, probeSet, loc, DS_TOL);
      const probeMs = Date.now() - tP0;
      const perFacetMs = PROBE_N > 0 ? probeMs / PROBE_N : 0;
      const projectedFullMs = perFacetMs * ringAll.length;
      plog(`[FID-${which}-RING] probe ${PROBE_N} facets in ${probeMs}ms (${perFacetMs.toFixed(3)}ms/facet) -> projected full scan ${(projectedFullMs / 1000).toFixed(0)}s for ${ringAll.length} facets`);

      let ringStride = 1;
      const BUDGET_MS = 8 * 60 * 1000;
      if (projectedFullMs > BUDGET_MS) {
        ringStride = Math.ceil(projectedFullMs / BUDGET_MS);
        plog(`[FID-${which}-RING] projected time exceeds budget — using STRIDE=${ringStride} (labeled estimate, not literal)`);
      }
      const ringSample = ringStride === 1 ? ringAll : ringAll.filter((_, i) => i % ringStride === 0);
      const t1 = Date.now();
      const ringStats = scoreRingBandFacets(xyz, idx, ringSample, loc, DS_TOL, (done, total) => {
        if (done % Math.max(1, Math.floor(total / 5)) === 0) plog(`[FID-${which}-RING] ${done}/${total} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
      });
      const ringMs = Date.now() - t1;
      const extrapolatedOutliers = ringStride === 1 ? ringStats.outliers : Math.round(ringStats.outliers * ringStride);
      plog(`[FID-${which}-RING] done in ${(ringMs / 1000).toFixed(1)}s: out=${ringStats.outliers}/${ringStats.scannedFacets} (stride=${ringStride}, extrapolated full-pop outliers~=${extrapolatedOutliers}) max=${ringStats.maxMm} p99=${ringStats.p99}`);
      checkpoint({
        key: `${key}_ring`, which, population: 'ringBand', ...ringStats, ms: ringMs,
        fullPopulation: ringAll.length, stride: ringStride, extrapolatedOutliers,
        basis: ringStride === 1 ? 'literal' : `STRIDE=${ringStride} labeled estimate, extrapolated x${ringStride}`,
      });

      // triangle-quality distribution for the whole (which) mesh — T5's %<20° figure.
      const qDist = triangleQualityDistribution({ vertices: xyz, indices: idx });
      plog(`[FID-${which}-QUALITY] minAngleDeg=${qDist.minAngleDeg} pctBelow20=${qDist.pctBelow20} pctBelow10=${qDist.pctBelow10}`);
      checkpoint({ key: `${key}_quality`, which, minAngleDeg: qDist.minAngleDeg, pctBelow10: qDist.pctBelow10, pctBelow20: qDist.pctBelow20, pctBelow30: qDist.pctBelow30 });

      checkpoint({ key, which, done: true, bodyMs, ringMs, totalMs: bodyMs + ringMs });
      expect(true).toBe(true);
    }, 20 * 60 * 1000);
  }
});
