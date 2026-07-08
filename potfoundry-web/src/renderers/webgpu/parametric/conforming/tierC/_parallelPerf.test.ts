/**
 * _parallelPerf.test.ts — SPEEDUP measurement for the parallel scorer
 * (E-2026-07-08-TIERC-PERF-SEAM, Task 1 perf half). Env-gated (PF_TIERC_PERF=1)
 * so it never runs in the fast suite. Builds a moderate multi-bay Gothic mesh,
 * scores it sequentially and with a 4-worker pool, and reports the ratio +
 * re-confirms byte-identical aggregates. Checkpoints one ndjson row.
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import { refineToZeroOutliers, type ChartDomain } from './noBridgeRefine';
import {
  DEFAULT_RULER,
  radialSurfaceFromSampler,
  scoreWholeMesh,
} from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { scoreWholeMeshParallel } from './parallelScorer';

const RUN = process.env.PF_TIERC_PERF === '1';
const OUT = 'research/exchange/_tierc_junction';

describe('Tier-C parallel scorer — speedup', () => {
  it.skipIf(!RUN)('4-worker parallel vs sequential (byte-identical)', async () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    // A moderate multi-bay patch → tens of thousands of facets (the regime
    // where the dense whole-mesh brute costs 60-96s single-threaded).
    const domain: ChartDomain = { uLo: 0, uHi: 0.1, tLo: 0.4, tHi: 0.55 };
    const refined = refineToZeroOutliers(sampler, complex, domain, {
      tolMm: 0.01,
      maxPass: 8,
      bulkPasses7pt: 4,
      bgArcMm: 0.5,
      ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
    });
    const mesh = { uv: refined.uv, tris: refined.tris };
    const nF = mesh.tris.length / 3;
    const surface = radialSurfaceFromSampler(sampler);
    const guardRuler = { ...DEFAULT_RULER };

    // Sequential.
    const s0 = Date.now();
    const seq = scoreWholeMesh(sampler, surface, mesh, 0.01, guardRuler);
    const seqMs = Date.now() - s0;

    // Parallel (4 workers) — includes pool spin-up (worst case for the ratio).
    const p0 = Date.now();
    const par = await scoreWholeMeshParallel(sampler, mesh, 0.01, 4, guardRuler);
    const parMs = Date.now() - p0;

    const row = {
      probe: 'parallelPerf',
      nF,
      seqMs,
      parMs,
      speedup: +(seqMs / parMs).toFixed(2),
      seqOut: seq.outliers,
      parOut: par.outliers,
      seqMax: +seq.maxMm.toFixed(6),
      parMax: +par.maxMm.toFixed(6),
      byteIdentical:
        seq.outliers === par.outliers &&
        seq.maxMm === par.maxMm &&
        seq.p50 === par.p50 &&
        seq.p99 === par.p99 &&
        seq.bruteCalls === par.bruteCalls,
    };
    // eslint-disable-next-line no-console
    console.log('[parallelPerf]', JSON.stringify(row, null, 2));
    appendFileSync(`${OUT}/perf.ndjson`, JSON.stringify(row) + '\n');
    writeFileSync(`${OUT}/perf_result.json`, JSON.stringify(row, null, 2));

    expect(row.byteIdentical).toBe(true);
    expect(row.speedup).toBeGreaterThan(2.5);
  }, 30 * 60 * 1000);
});
