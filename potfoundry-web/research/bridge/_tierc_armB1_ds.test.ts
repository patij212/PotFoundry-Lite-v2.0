// _tierc_armB1_ds.test.ts — PROD-TIERC region-layer-core plan task A-5 (Arm B DS B1, full 7-ring/
// 8-body chain THROUGH the region layer). docs/superpowers/plans/2026-07-12-region-layer-core.md §A-5.
//
// Interface (per task brief, authoritative over the plan doc's literal "driving buildDsChainCorrected"
// phrasing): `buildRegionOuterWall(getManifest('DragonScales'), TIERC_COMMON_DIMS)` (A-1's committed,
// non-overlapping-domain `dragonScalesAnatomy` — 8 R-CDT body regions + 7 R-STRUCT ring regions,
// dispatched by `buildStructCdtChain`) → the A-2 gates-harness runner (`scoreAllGates`, per
// `_tierc_a2_gatesrunner.test.ts`'s own established pattern: `toHarnessManifest` + `full: result.full
// ?? result.outer` for styles with no full-pot assembly). This is a DIFFERENT arm from the already-
// committed `_tierc_armB1.test.ts` (E-2026-07-11-TIERC-HEADTOHEAD Arm B1, ceca9985): that arm scored a
// small FIXED SAMPLE (2000 facets/population) as a directional read only and concluded
// NOT-REPRODUCED (config-explained, loose K1_TOY_DEFAULTS body sizing). This arm (A-5) drives the SAME
// native chain through the A-2 harness AND computes literal-or-labeled-stride T1-T7 numbers per
// champion-spec-dragonscales.md §5, so this task's specific gate (T1∧T4∧T5) has a real answer.
//
// SCORING (champion-spec-dragonscales.md §5, §1.2): the DS champion needs the composite §V11g ruler
// (sheet-twin ∪ riser-wall-only, `_ds_prodtruth_lib.ts`'s `buildConformRuler`) — a single-valued radial
// ruler is TREAD-BLIND at the 7 genuine two-valued ring loci and either scores ~141k false-positive
// riser facets (per champion-spec §1.2) or, worse, is measured INTRACTABLE on a real captured DS
// artifact (champion-spec §1.4: "130 CPU-minutes... no completion"). `tierc_gatesHarness.ts`'s
// `scoreAllGates` G1/G2 gates use exactly that single-valued radial-Newton ruler UNCONDITIONALLY — it
// does NOT dispatch on `manifest.ruler` (grep-confirmed: `ruler` is read only for `toHarnessManifest`'s
// pass-through, never branched on inside `scoreAllGates`'s body). Running scoreAllGates on the DS outer
// wall THEREFORE risks the exact same intractability the production capture hit. FINDING (flagged, not
// silently worked around): this arm bounds G1 by pre-computing the prescreen45 survivor list itself
// (`prescreenOuterFacets`, exported by tierc_gatesHarness.ts) and choosing a STRIDE from the ACTUAL
// survivor count (target ~5,000 brute-scored facets) before calling `scoreAllGates` with
// `survivorsIn`+`stride` — this keeps the A-2 runner's G1/G2/G3/G4/G6/quality gates tractable and
// produces one valid ndjson row per the A-2 interface, but that row's g1_forward/g2_reverse numbers are
// EXPLICITLY NOT the DS acceptance basis (informational only, tread-blind-ruler-biased) — T1/T2/T3/T6
// below, scored under the composite ruler with the body-vs-ring-band split, are the real DS numbers.
//
// RESILIENCE: env-gated `it` per stage (own stage; PF_TIERC_A5_DS=1 gates every stage in this file);
// ndjson CHECKPOINT the instant a result is computed; a key that already exists is SKIPPED (a killed
// run resumes on the next unfinished stage) — LAB-CHEATSHEET.md convention, mirrors _tierc_armB1.test.ts.
//
// NEW-FILE-ONLY. research/ never imported by src/. No committed file edited (tierc_manifest.ts,
// tierc_regionLayer.ts, tierc_gatesHarness.ts, _ds_prodtruth_lib.ts, _tierc_b1_lib.ts are all READ-ONLY
// imports). Commits nothing per mission RULES.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getManifest, TIERC_COMMON_DIMS } from './tierc_manifest';
import { buildRegionOuterWall, toHarnessManifest, type RegionBuildResult } from './tierc_regionLayer';
import { scoreAllGates, prescreenOuterFacets, type BinMesh, type StyleTruth, type GatesRow } from './tierc_gatesHarness';
import { nonManRawBig, nonManRawBigStats } from './labkit';
import { topologyMetric, triangleQualityDistribution, triangleQuality3D } from '../../src/fidelity/metrics';
import {
  dsRadiusFn, dragonRings, buildConformRuler, classifyRingBand,
  scoreBodyFacets, scoreRingBandFacets, sheetCoverage, wallCoverage, oneSidedRA,
  buildArtifactLocator, locatorSelfCheck, WALLEPS, WALL_NTHETA,
  TOL as DS_TOL,
} from './_ds_prodtruth_lib';
import { dumpB1Bin, loadB1Bin, b1BinExists, boundaryRimVsInterior } from './_tierc_b1_lib';

const RUN = process.env.PF_TIERC_A5_DS === '1';
const OUT_DIR = join('research', 'exchange', '_tierc_a5_armB1_ds');
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

// 1mm z-bin triangle-density histogram (T4's "ring-local density measurably DOWN" witness, matching
// champion-spec-dragonscales.md §1.4's own basis: "130-175k tris per 1mm-z-bin at rings vs 20-25k
// baseline"). Facet membership = centroid z -> floor(z) bin.
function zBinDensity(xyz: Float32Array, idx: Uint32Array, hMm: number): number[] {
  const nBins = Math.ceil(hMm);
  const bins = new Array<number>(nBins).fill(0);
  const nF = idx.length / 3;
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
    const bin = Math.min(nBins - 1, Math.max(0, Math.floor(zc)));
    bins[bin]++;
  }
  return bins;
}

describe.skipIf(!RUN)('TIERC-A5 — DragonScales full outer wall through buildRegionOuterWall + A-2 gates-harness runner', () => {
  // ═══════════════════════ STAGE 1 — BUILD (native region-layer chain) ═══════════════════════
  it('STAGE 1 — buildRegionOuterWall(getManifest(DragonScales), TIERC_COMMON_DIMS)', () => {
    if (keyExists('stage1_build')) { plog('[skip] stage1 already built'); expect(true).toBe(true); return; }

    const manifest = getManifest('DragonScales');
    plog(`[BUILD] manifest loaded. styleId=${manifest.styleId} ruler=${manifest.ruler} budget=${JSON.stringify(manifest.budget)} g7scope=${manifest.gates.g7scope}`);
    plog('[BUILD] calling buildRegionOuterWall...');

    const t0 = Date.now();
    const result: RegionBuildResult = buildRegionOuterWall(manifest, TIERC_COMMON_DIMS);
    const buildMs = Date.now() - t0;
    const outerTris = result.outer.idx.length / 3;
    const outerVerts = result.outer.xyz.length / 3;
    plog(`[BUILD] OK in ${buildMs}ms: dispatch=${result.meta.dispatch} outerTris=${outerTris} outerVerts=${outerVerts} hasFull=${result.full !== undefined}`);
    plog(`[BUILD] per-region: ${JSON.stringify(result.meta.regions)}`);
    plog(`[BUILD] warnings (${result.meta.warnings.length}): ${JSON.stringify(result.meta.warnings)}`);

    expect(result.meta.dispatch).toBe('RSTRUCT-RCDT-chain');
    expect(result.meta.regions.length).toBe(15); // 8 body + 7 ring, A-1's DEFINED chain
    expect(outerTris).toBeGreaterThan(0);

    dumpB1Bin('a5_native', result.outer.xyz, result.outer.idx);
    checkpoint({
      key: 'stage1_build', dispatch: result.meta.dispatch,
      outerTris, outerVerts, regions: result.meta.regions, buildMs, warnings: result.meta.warnings,
      hasFull: result.full !== undefined,
    });
    expect(true).toBe(true);
  }, 15 * 60 * 1000);

  // ═══════════════════════ STAGE 2 — A-2 GATES-HARNESS RUNNER ═══════════════════════
  it('STAGE 2 — scoreAllGates(bins, styleTruth, toHarnessManifest(manifest)) emits one valid ndjson row', () => {
    if (keyExists('stage2_gatesrunner')) { plog('[skip] stage2 already scored'); expect(true).toBe(true); return; }
    if (!b1BinExists('a5_native')) { plog('[GR] no build bins on disk, skip (run stage1 first)'); expect(true).toBe(true); return; }

    const manifest = getManifest('DragonScales');
    const { xyz, idx } = loadB1Bin('a5_native');
    const outer: BinMesh = { xyz, idx };
    const fullBin: BinMesh = outer; // buildStructCdtChain returns no `full` (standalone outer-wall-only,
    // per champion-spec-dragonscales.md §4.2) — A-2's own established convention: `full: result.full ?? result.outer`.

    plog('[GR] pre-computing prescreen45 survivors to bound the tread-blind radial ruler before scoreAllGates...');
    const t0 = Date.now();
    const survivors = prescreenOuterFacets(outer, manifest.truth.rA, H, 0.01, (f, of, sSoFar) => {
      if (f % Math.max(1, Math.floor(of / 5)) === 0) plog(`[GR-prescreen] ${f}/${of} survivorsSoFar=${sSoFar}`);
    });
    const prescreenMs = Date.now() - t0;
    const nF = idx.length / 3;
    // Target ~5,000 brute-scored facets regardless of survivor population size (bounds G1's cost —
    // see file header finding: scoreAllGates' radial-Newton ruler is tread-blind at DS's ring loci and
    // will otherwise brute-confirm almost the entire ring-band population, the same intractability
    // class as the production capture, champion-spec-dragonscales.md §1.4).
    const targetBrute = 5000;
    const stride = Math.max(1, Math.ceil(survivors.length / targetBrute));
    plog(`[GR] prescreen done in ${prescreenMs}ms: outerFacets=${nF} survivors=${survivors.length} (${(100 * survivors.length / nF).toFixed(2)}%) -> chosen stride=${stride} (bounds brute-confirm to ~${targetBrute})`);

    const styleTruth: StyleTruth = {
      styleId: manifest.styleId, rA: manifest.truth.rA,
      H: TIERC_COMMON_DIMS.H, Rb: TIERC_COMMON_DIMS.Rb, Rt: TIERC_COMMON_DIMS.Rt, expn: TIERC_COMMON_DIMS.expn,
    };
    const manifestRow = toHarnessManifest(manifest);
    const outPath = join(OUT_DIR, 'gates.ndjson');

    const t1 = Date.now();
    const row: GatesRow = scoreAllGates(
      { full: fullBin, outer },
      styleTruth,
      manifestRow,
      {
        survivorsIn: survivors,
        stride,
        g2Lattice: { nu: 64, nt: 64 }, // FAST override, sample-density-only lever (see A-2 runner's own FAST_G2)
        g1Brute: { nTheta: 32, nZ: 8 },
        outputPath: outPath,
        runId: `a5-armB1-ds-${Date.now()}`,
      },
    );
    const scoreMs = Date.now() - t1;
    plog(`[GR] scoreAllGates done in ${scoreMs}ms. g1.outliers=${row.g1_forward.outliers}/${row.g1_forward.scannedFacets} g1.maxMm=${row.g1_forward.maxMm} (TREAD-BLIND RULER, informational only) | g3.nonManRaw=${row.g3_watertight.nonManRaw} g3.nonManControlMoved=${row.g3_watertight.nonManControlMoved} | g4.zeroArea=${row.g4_zeroDefect.zeroAreaCount} | g6.triangleCount=${row.g6_budget.triangleCount} policyMax=${row.g6_budget.policyMaxTris} withinBudget=${row.g6_budget.withinTriBudget} | quality.pctBelow20=${row.quality.pctBelow20}`);

    // Schema sanity — mirrors _tierc_a2_gatesrunner.test.ts's assertValidGatesRowSchema for the OPEN fields.
    expect(row.style).toBe('DragonScales');
    expect(row.g5_bridging.verdict).toBe('OPEN');
    expect(row.g7_assembly.seamSpecificCheck).toBe('OPEN');
    expect(row.g3_watertight.nonManControlMoved).toBe(true); // non-vacuity witness

    checkpoint({
      key: 'stage2_gatesrunner',
      survivors: survivors.length, outerFacets: nF, stride, prescreenMs, scoreMs,
      g1_outliers: row.g1_forward.outliers, g1_scannedFacets: row.g1_forward.scannedFacets,
      g1_maxMm: row.g1_forward.maxMm, g1_basis: row.g1_forward.basis,
      g2_maxMm: row.g2_reverse.maxMm, g2_locatorSelfCheckMaxMm: row.g2_reverse.locatorSelfCheckMaxMm,
      g3_nonManRaw: row.g3_watertight.nonManRaw, g3_nonManControlMoved: row.g3_watertight.nonManControlMoved,
      g3_orientationMismatches: row.g3_watertight.orientationMismatches,
      g4_zeroAreaCount: row.g4_zeroDefect.zeroAreaCount, g4_degenerateCount: row.g4_zeroDefect.degenerateCount,
      g6_triangleCount: row.g6_budget.triangleCount, g6_policyMaxTris: row.g6_budget.policyMaxTris,
      g6_withinTriBudget: row.g6_budget.withinTriBudget,
      quality_pctBelow20: row.quality.pctBelow20, quality_minAngleDeg: row.quality.minAngleDeg,
      quality_sliverCount: row.quality.sliverCount, quality_needleCount: row.quality.needleCount,
      note: 'g1/g2 use the radial-Newton ruler (tread-blind at DS ring loci) — informational only, NOT the DS acceptance basis; see T1/T2 below (composite V11g ruler).',
    });
    expect(true).toBe(true);
  }, 30 * 60 * 1000);

  // ═══════════════════════ STAGE 3 — TOPOLOGY + QUALITY (T5 support, cheap, full population) ═══════════════════════
  it('STAGE 3 — topology (nonMan/rim-vs-interior) + quality distribution (T5)', () => {
    if (keyExists('stage3_topology')) { plog('[skip] stage3 already done'); expect(true).toBe(true); return; }
    if (!b1BinExists('a5_native')) { plog('[TOPO] no bins, skip'); expect(true).toBe(true); return; }

    const { xyz, idx } = loadB1Bin('a5_native');
    const nTris = idx.length / 3;
    plog(`[TOPO] loaded ${nTris} tris / ${xyz.length / 3} verts.`);

    const t0 = Date.now();
    const stats = nonManRawBigStats(idx);
    const cracked = new Uint32Array(idx.length + 3);
    cracked.set(idx);
    cracked.set([idx[0], idx[1], idx[2]], idx.length);
    const crackedNonMan = nonManRawBig(cracked);
    const nonVacuous = crackedNonMan > stats.nonMan;
    plog(`[TOPO] nonManRawBig=${stats.nonMan} boundary=${stats.boundary} control(injected)=${crackedNonMan} nonVacuous=${nonVacuous} (${Date.now() - t0}ms)`);

    const t1 = Date.now();
    const topo = topologyMetric({ vertices: xyz, indices: idx }, 1e-4);
    plog(`[TOPO] topologyMetric(weld=1e-4mm): boundaryEdges=${topo.boundaryEdges} nonManifoldEdges=${topo.nonManifoldEdges} orientationMismatches=${topo.orientationMismatches} (${Date.now() - t1}ms)`);

    const t2 = Date.now();
    const rimCls = boundaryRimVsInterior(xyz, idx, H, 0.05);
    plog(`[TOPO] boundary rim-vs-interior: rim=${rimCls.rim} interior=${rimCls.interior} (expected rim=2*nTheta for the designed open top/bottom, champion-spec §1.3's bd=4800 pattern) (${Date.now() - t2}ms)`);
    if (rimCls.interior > 0) plog(`[TOPO] INTERIOR BOUNDARY SAMPLES: ${JSON.stringify(rimCls.interiorSamples)}`);

    const t3 = Date.now();
    const q3d = triangleQuality3D({ vertices: xyz, indices: idx });
    const qDist = triangleQualityDistribution({ vertices: xyz, indices: idx });
    plog(`[TOPO] triangleQuality3D: zeroArea=${q3d.degenerateCount} sliverCount=${q3d.sliverCount} maxAspect3D=${q3d.maxAspect3D} | qualityDist: minAngleDeg=${qDist.minAngleDeg} pctBelow20=${qDist.pctBelow20} pctBelow10=${qDist.pctBelow10} (${Date.now() - t3}ms)`);

    checkpoint({
      key: 'stage3_topology', nTris,
      nonManRawBig: stats.nonMan, boundaryEdgesRaw: stats.boundary, controlInjectedNonMan: crackedNonMan, nonVacuous,
      topoBoundaryEdges: topo.boundaryEdges, topoNonManifoldEdges: topo.nonManifoldEdges, topoOrientationMismatches: topo.orientationMismatches,
      rimBoundary: rimCls.rim, interiorBoundary: rimCls.interior, interiorSamples: rimCls.interiorSamples,
      zeroArea: q3d.degenerateCount, sliverCount: q3d.sliverCount, maxAspect3D: q3d.maxAspect3D,
      minAngleDeg: qDist.minAngleDeg, pctBelow10: qDist.pctBelow10, pctBelow20: qDist.pctBelow20, pctBelow30: qDist.pctBelow30,
    });
    expect(true).toBe(true);
  }, 10 * 60 * 1000);

  // ═══════════════════════ STAGE 4 — T4 (budget + ring-local density) ═══════════════════════
  it('STAGE 4 — outer triangle budget + ring-local z-density (T4)', () => {
    if (keyExists('stage4_density')) { plog('[skip] stage4 already done'); expect(true).toBe(true); return; }
    if (!b1BinExists('a5_native')) { plog('[T4] no bins, skip'); expect(true).toBe(true); return; }

    const { xyz, idx } = loadB1Bin('a5_native');
    const outerTris = idx.length / 3;
    const T4_BUDGET = 4_549_600; // champion-spec-dragonscales.md T4 / §1.4 production outer ceiling
    const withinBudget = outerTris <= T4_BUDGET;
    plog(`[T4] outerTris=${outerTris} budget=${T4_BUDGET} withinBudget=${withinBudget}`);

    const bins = zBinDensity(xyz, idx, H);
    const rings = dragonRings(8);
    const ringZs = rings.map((r) => r.z);
    const ringBinIdxs = new Set<number>();
    for (const rz of ringZs) {
      // ring half-band is 0.6mm — the bin(s) the ring z itself and its immediate neighbor fall in.
      for (let dz = -1; dz <= 1; dz++) {
        const b = Math.floor(rz) + dz;
        if (b >= 0 && b < bins.length) ringBinIdxs.add(b);
      }
    }
    let ringSum = 0, ringN = 0, baseSum = 0, baseN = 0;
    for (let b = 0; b < bins.length; b++) {
      if (ringBinIdxs.has(b)) { ringSum += bins[b]; ringN++; }
      else { baseSum += bins[b]; baseN++; }
    }
    const ringAvgTrisPerMm = ringN ? ringSum / ringN : 0;
    const baseAvgTrisPerMm = baseN ? baseSum / baseN : 0;
    const PROD_RING_SPIKE_LOW = 130_000, PROD_RING_SPIKE_HIGH = 175_000; // champion-spec §1.4 cited production spike
    const measurablyDown = ringAvgTrisPerMm < PROD_RING_SPIKE_LOW;
    plog(`[T4] ring-adjacent bins avg=${ringAvgTrisPerMm.toFixed(0)} tris/mm (n=${ringN} bins) vs baseline (non-ring) avg=${baseAvgTrisPerMm.toFixed(0)} tris/mm (n=${baseN} bins) | production spike cited [${PROD_RING_SPIKE_LOW}-${PROD_RING_SPIKE_HIGH}] tris/mm | measurablyDown(<${PROD_RING_SPIKE_LOW})=${measurablyDown}`);

    checkpoint({
      key: 'stage4_density', outerTris, T4_BUDGET, withinBudget,
      ringAvgTrisPerMm: +ringAvgTrisPerMm.toFixed(1), baseAvgTrisPerMm: +baseAvgTrisPerMm.toFixed(1),
      ringBins: ringN, baseBins: baseN,
      prodRingSpikeLow: PROD_RING_SPIKE_LOW, prodRingSpikeHigh: PROD_RING_SPIKE_HIGH, measurablyDown,
      zBinHistogram: bins,
    });
    expect(true).toBe(true);
  }, 5 * 60 * 1000);

  // ═══════════════ STAGE 5 — T1/T2 FIDELITY (composite V11g ruler, body-vs-ring-band SPLIT, literal-or-labeled-stride) ═══════════════
  it('STAGE 5 — composite ruler forward scoring, body vs ring-band, time-boxed literal-or-stride (T1/T2/T3)', () => {
    const key = 'stage5_fidelity';
    if (keyExists(key)) { plog('[skip] stage5 already done'); expect(true).toBe(true); return; }
    if (!b1BinExists('a5_native')) { plog('[FID] no bins, skip'); expect(true).toBe(true); return; }

    const { xyz, idx } = loadB1Bin('a5_native');
    const nF = idx.length / 3;
    const rA = dsRadiusFn();
    const rings = dragonRings(8);
    const ringZs = rings.map((r) => r.z);
    const bandMm = 1.5; // matches champion-spec-dragonscales.md §1.4's own production classification basis (PF_DS_PT_BAND default)

    plog('[FID] building V11g composite ruler (sheet twin 2048x3072 + wall-only-ref 4096theta)...');
    const tR0 = Date.now();
    const loc = buildConformRuler(rA);
    plog(`[FID] ruler built in ${Date.now() - tR0}ms. classifying ${nF} facets (bandMm=${bandMm})...`);

    const cls = classifyRingBand(xyz, idx, ringZs, bandMm);
    const bodyAll: number[] = [], ringAll: number[] = [];
    for (let f = 0; f < nF; f++) { if (cls(f) === 'ringBand') ringAll.push(f); else bodyAll.push(f); }
    plog(`[FID] body=${bodyAll.length} ringBand=${ringAll.length}`);

    // Time-box each population independently: probe first N, project total, choose a stride to fit an
    // ~8min budget (matches _tierc_armB1.test.ts's own STAGE-3 precedent + production's own 8/16-SHARD
    // rationale, champion-spec-dragonscales.md §1.4). stride=1 (literal) when the projection fits.
    const BUDGET_MS = 8 * 60 * 1000;
    function timeBoxedScore(
      pop: number[], label: 'BODY' | 'RING',
      scorer: (facets: number[], onProgress?: (d: number, t: number) => void) => ReturnType<typeof scoreBodyFacets>,
    ): { stats: ReturnType<typeof scoreBodyFacets>; stride: number; ms: number; extrapolatedOutliers: number } {
      const PROBE_N = Math.min(2000, pop.length);
      const probeSet = pop.slice(0, PROBE_N);
      const tP0 = Date.now();
      scorer(probeSet);
      const probeMs = Date.now() - tP0;
      const perFacetMs = PROBE_N > 0 ? probeMs / PROBE_N : 0;
      const projectedFullMs = perFacetMs * pop.length;
      plog(`[FID-${label}] probe ${PROBE_N} in ${probeMs}ms (${perFacetMs.toFixed(3)}ms/facet) -> projected full ${(projectedFullMs / 1000).toFixed(0)}s for ${pop.length} facets`);
      let stride = 1;
      if (projectedFullMs > BUDGET_MS) {
        stride = Math.ceil(projectedFullMs / BUDGET_MS);
        plog(`[FID-${label}] projected exceeds budget — STRIDE=${stride} (labeled estimate)`);
      }
      const sample = stride === 1 ? pop : pop.filter((_, i) => i % stride === 0);
      const t1 = Date.now();
      const stats = scorer(sample, (done, total) => {
        if (done % Math.max(1, Math.floor(total / 5)) === 0) plog(`[FID-${label}] ${done}/${total} (${((Date.now() - t1) / 1000).toFixed(0)}s)`);
      });
      const ms = Date.now() - t1;
      const extrapolatedOutliers = stride === 1 ? stats.outliers : Math.round(stats.outliers * stride);
      plog(`[FID-${label}] done in ${(ms / 1000).toFixed(1)}s: out=${stats.outliers}/${stats.scannedFacets} (stride=${stride}, extrapolated~=${extrapolatedOutliers}) max=${stats.maxMm} p99=${stats.p99}`);
      return { stats, stride, ms, extrapolatedOutliers };
    }

    const bodyRes = timeBoxedScore(bodyAll, 'BODY', (facets, onProgress) => scoreBodyFacets(xyz, idx, facets, loc, rA, DS_TOL, onProgress));
    checkpoint({
      key: `${key}_body`, population: 'body', ...bodyRes.stats, stride: bodyRes.stride, ms: bodyRes.ms,
      fullPopulation: bodyAll.length, extrapolatedOutliers: bodyRes.extrapolatedOutliers,
      basis: bodyRes.stride === 1 ? 'literal' : `STRIDE=${bodyRes.stride} labeled estimate`,
    });

    const ringRes = timeBoxedScore(ringAll, 'RING', (facets, onProgress) => scoreRingBandFacets(xyz, idx, facets, loc, DS_TOL, onProgress));
    checkpoint({
      key: `${key}_ring`, population: 'ringBand', ...ringRes.stats, stride: ringRes.stride, ms: ringRes.ms,
      fullPopulation: ringAll.length, extrapolatedOutliers: ringRes.extrapolatedOutliers,
      basis: ringRes.stride === 1 ? 'literal' : `STRIDE=${ringRes.stride} labeled estimate`,
    });

    checkpoint({ key, done: true, bodyMs: bodyRes.ms, ringMs: ringRes.ms, totalMs: bodyRes.ms + ringRes.ms });
    expect(true).toBe(true);
  }, 30 * 60 * 1000);

  // ═══════════════ STAGE 6 — reverse coverage (T1 wall-coverage-over + T6 rim-attachment diagnostic) ═══════════════
  it('STAGE 6 — reverse (truth->mesh) sheet + wall coverage against the artifact locator (T1/T6)', () => {
    const key = 'stage6_reverse';
    if (keyExists(key)) { plog('[skip] stage6 already done'); expect(true).toBe(true); return; }
    if (!b1BinExists('a5_native')) { plog('[REV] no bins, skip'); expect(true).toBe(true); return; }

    const { xyz, idx } = loadB1Bin('a5_native');
    const rA = dsRadiusFn();
    const rings = dragonRings(8);
    const ringZs = rings.map((r) => r.z);

    plog('[REV] building artifact locator (own outer submesh)...');
    const t0 = Date.now();
    const loc = buildArtifactLocator(xyz, idx);
    plog(`[REV] locator built in ${((Date.now() - t0) / 1000).toFixed(0)}s. self-check...`);
    const selfCheckMax = locatorSelfCheck(loc, rA, 24, 0.5);
    plog(`[REV] locatorSelfCheckMax=${selfCheckMax}`);
    expect(selfCheckMax).toBeLessThan(1e-9);

    const rAOneSided = oneSidedRA(rA, ringZs, WALLEPS);
    const t1 = Date.now();
    const NU = 1024, NT = 1024, bandMm = 0.5; // matches _ds_prodtruth.test.ts's own REVERSE task lattice exactly
    plog(`[REV] sheet coverage lattice ${NU}x${NT}...`);
    const sheet = sheetCoverage(loc, rAOneSided, NU, NT, bandMm);
    plog(`[REV] sheet done in ${((Date.now() - t1) / 1000).toFixed(0)}s: interior max=${sheet.interior.max} p99=${sheet.interior.p99} over=${sheet.interior.over}/${sheet.interior.n} | boundary(t~0,1) max=${sheet.boundary.max} p99=${sheet.boundary.p99}`);

    const t2 = Date.now();
    plog(`[REV] wall coverage on riser strips (nTheta=${WALL_NTHETA}, nS=8)...`);
    const wall = wallCoverage(loc, rA, rings, WALLEPS, WALL_NTHETA, 8);
    const wallOverFrac = wall.n ? wall.over / wall.n : 0;
    plog(`[REV] wall done in ${((Date.now() - t2) / 1000).toFixed(0)}s: max=${wall.max} p99=${wall.p99} over=${wall.over}/${wall.n} (${(100 * wallOverFrac).toFixed(1)}%)`);

    checkpoint({
      key,
      locatorSelfCheckMax: selfCheckMax,
      sheetInterior: sheet.interior, sheetBoundary: sheet.boundary,
      wall, wallOverFrac,
      lattice: `${NU}x${NT} sheet + ${rings.length}x${WALL_NTHETA}x8 wall`,
      // T6 note: DS's own champion mesh (per champion-spec §4.2) and THIS arm's chain build (no `full`
      // returned — see file header) are both standalone outer-wall-only, open at z=0/z=H — there is no
      // rim/base attachment weld to characterize. `sheet.boundary` (t~0/t~1 bands) is reported as a
      // DIAGNOSTIC PROXY only, not the T6 rim-attachment defect itself (which only exists once a real
      // rim/base assembly is welded on — out of scope for this single-R-CDT-per-body/R-STRUCT chain).
      t6Note: 'T6 rim-attachment N/A: this dispatch produces no full-pot/rim assembly (standalone outer-wall-only, champion-spec §4.2). sheetBoundary is a diagnostic proxy only.',
      totalMs: Date.now() - t0,
    });
    expect(true).toBe(true);
  }, 20 * 60 * 1000);
});
