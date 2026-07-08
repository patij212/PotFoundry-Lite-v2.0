/**
 * parallelScorer.test.ts — the BYTE-IDENTICAL metrology gate for the Tier-C
 * worker-pool parallel scorer (E-2026-07-08-TIERC-PERF-SEAM, Task 1).
 *
 * STOP-SHIP contract: the parallel scorer MUST reproduce the sequential
 * scorer's (outliers, maxMm, p50, p99) EXACTLY, and its full per-facet dev[]
 * must be bit-identical. Metrology drives an accept/stop gate — any divergence
 * is a defect, not a tolerance.
 *
 * Fixture: a small real Gothic multi-bay-style patch (styleSampler grid +
 * protected complex + a couple of refine passes) so the ruler exercises the
 * deep-green / GN-screen / brute paths, not just trivial green facets.
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import { refineToZeroOutliers, type ChartDomain } from './noBridgeRefine';
import {
  DEFAULT_RULER,
  radialSurfaceFromSampler,
  scoreWholeMesh,
  computeDevArraySeq,
  liftChartMesh,
  type ChartMesh,
} from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import {
  ParallelScorerPool,
  samplerGrid,
  scoreWholeMeshParallel,
} from './parallelScorer';

/** Build a small Gothic patch mesh (a few thousand facets) as the fixture. */
function buildFixture(): { sampler: GpuSurfaceSampler; mesh: ChartMesh } {
  const sampler = styleSampler(
    'GothicArches',
    {},
    { H: 120, Rt: 50, Rb: 40 },
  ) as GpuSurfaceSampler;
  const complex = buildProtectedComplex(sampler, 'GothicArches');
  // A small seam-free patch so the fixture stays fast (~thousands of facets).
  const domain: ChartDomain = { uLo: 0.03, uHi: 0.08, tLo: 0.44, tHi: 0.52 };
  const refined = refineToZeroOutliers(
    sampler,
    complex,
    domain,
    { tolMm: 0.01, maxPass: 6, bulkPasses7pt: 3, bgArcMm: 0.6, ruler: DEFAULT_RULER },
  );
  return { sampler, mesh: { uv: refined.uv, tris: refined.tris } };
}

describe('Tier-C parallel scorer — byte-identical metrology', () => {
  it('reproduces the sequential dev[] and score EXACTLY (4 workers)', async () => {
    const { sampler, mesh } = buildFixture();
    const nF = mesh.tris.length / 3;
    expect(nF).toBeGreaterThan(500); // non-trivial fixture

    // Sequential ground truth (dev[] + aggregate).
    const surface = radialSurfaceFromSampler(sampler);
    const xyz = liftChartMesh(sampler, mesh.uv);
    const seq = computeDevArraySeq(surface, xyz, mesh, DEFAULT_RULER);
    const seqScore = scoreWholeMesh(sampler, surface, mesh, 0.01, DEFAULT_RULER);

    // Parallel via a held pool (exercises scoreDev directly).
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);
    const par = await pool.scoreDev(xyz, mesh.uv, mesh.tris, DEFAULT_RULER);
    await pool.close();

    // BIT-IDENTICAL dev[] (every facet, exact equality — no epsilon).
    expect(par.dev.length).toBe(seq.dev.length);
    let firstDiff = -1;
    for (let f = 0; f < nF; f++) {
      if (par.dev[f] !== seq.dev[f]) {
        firstDiff = f;
        break;
      }
    }
    expect(firstDiff).toBe(-1);
    expect(par.bruteCalls).toBe(seq.bruteCalls);

    // Exact aggregate equality via the one-shot wrapper too.
    const parScore = await scoreWholeMeshParallel(sampler, mesh, 0.01, 4, DEFAULT_RULER);
    expect(parScore.outliers).toBe(seqScore.outliers);
    expect(parScore.maxMm).toBe(seqScore.maxMm);
    expect(parScore.p50).toBe(seqScore.p50);
    expect(parScore.p99).toBe(seqScore.p99);
    expect(parScore.bruteCalls).toBe(seqScore.bruteCalls);
    expect(parScore.nFacets).toBe(seqScore.nFacets);
  }, 120_000);

  it('is invariant to worker count (1 vs 3 vs 4 give identical dev[])', async () => {
    const { sampler, mesh } = buildFixture();
    const xyz = liftChartMesh(sampler, mesh.uv);
    const grid = samplerGrid(sampler);
    const devFor = async (n: number): Promise<Float64Array> => {
      const pool = new ParallelScorerPool(grid, n);
      const r = await pool.scoreDev(xyz, mesh.uv, mesh.tris, DEFAULT_RULER);
      await pool.close();
      return r.dev;
    };
    const [d1, d3, d4] = await Promise.all([devFor(1), devFor(3), devFor(4)]);
    expect(d1.length).toBe(d4.length);
    for (let f = 0; f < d1.length; f++) {
      expect(d3[f]).toBe(d1[f]);
      expect(d4[f]).toBe(d1[f]);
    }
  }, 120_000);
});
