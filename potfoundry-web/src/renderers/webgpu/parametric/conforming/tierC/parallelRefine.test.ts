/**
 * parallelRefine.test.ts — BYTE-IDENTICAL parity gate for the parallel refine
 * loop (E-2026-07-08-TIERC-PERF-SEAM, Task 1/4). refineToZeroOutliersParallel
 * scores DENSE passes via the worker pool (7-pt passes stay sequential) and
 * shares the SAME insertion logic (applyScoredPass) as the sequential loop, so
 * given the pool's byte-identical dev[] the refined mesh must be bit-identical
 * to refineToZeroOutliers.
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliers,
  refineToZeroOutliersParallel,
  type ChartDomain,
  type RefineOptions,
} from './noBridgeRefine';
import { DEFAULT_RULER } from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { ParallelScorerPool, samplerGrid } from './parallelScorer';

describe('Tier-C parallel refine — byte-identical parity', () => {
  it('parallel refine == sequential refine (final uv/tris + trajectory)', async () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0.03, uHi: 0.08, tLo: 0.44, tHi: 0.52 };
    const opts: RefineOptions = {
      tolMm: 0.01,
      maxPass: 6,
      bulkPasses7pt: 3,
      bgArcMm: 0.6,
      ruler: DEFAULT_RULER,
    };

    const seq = refineToZeroOutliers(sampler, complex, domain, opts);

    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);
    const par = await refineToZeroOutliersParallel(
      sampler,
      complex,
      domain,
      opts,
      pool,
    );
    await pool.close();

    expect(par.uv.length).toBe(seq.uv.length);
    expect(par.tris.length).toBe(seq.tris.length);
    expect(par.passes).toBe(seq.passes);
    expect(par.capped).toBe(seq.capped);
    for (let i = 0; i < seq.uv.length; i++) expect(par.uv[i]).toBe(seq.uv[i]);
    for (let i = 0; i < seq.tris.length; i++)
      expect(par.tris[i]).toBe(seq.tris[i]);

    expect(par.history.length).toBe(seq.history.length);
    for (let p = 0; p < seq.history.length; p++) {
      expect(par.history[p].outliers).toBe(seq.history[p].outliers);
      expect(par.history[p].worstMm).toBe(seq.history[p].worstMm);
      expect(par.history[p].inserted).toBe(seq.history[p].inserted);
      expect(par.history[p].nTris).toBe(seq.history[p].nTris);
    }
  }, 300_000);
});
