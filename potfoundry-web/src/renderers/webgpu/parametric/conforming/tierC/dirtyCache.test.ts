/**
 * dirtyCache.test.ts — BYTE-IDENTICAL gate for the cross-pass dirty-facet cache
 * (E-2026-07-08-TIERC-PERF-SEAM, Task 2). The cache reuses a facet's dev
 * verdict when its (a,b,c) vertex triple is unchanged since a prior pass under
 * the same lattice phase. Because the ruler is a pure function of the 3 (u,t)
 * pairs + lattice + opts (and `uv` only grows, so a vertex index is stable), a
 * hit is EXACT. This test asserts the CACHED refine produces a bit-identical
 * result (same per-pass outlier/worst/inserted/tris trajectory + same final
 * uv/tris) as the UNCACHED refine, and reports the hit rate. Only the
 * diagnostic `bruteCalls` counter may drop (cached facets do no brute work).
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliers,
  type ChartDomain,
  type RefineOptions,
} from './noBridgeRefine';
import { DEFAULT_RULER } from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';

describe('Tier-C dirty-facet cache — byte-identical', () => {
  it('cached refine == uncached refine (trajectory + final mesh)', () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0.03, uHi: 0.08, tLo: 0.44, tHi: 0.52 };
    const base: Omit<RefineOptions, 'dirtyFacetCache'> = {
      tolMm: 0.01,
      maxPass: 6,
      bulkPasses7pt: 3,
      bgArcMm: 0.6,
      ruler: DEFAULT_RULER,
    };

    const off = refineToZeroOutliers(sampler, complex, domain, {
      ...base,
      dirtyFacetCache: false,
    });
    const on = refineToZeroOutliers(sampler, complex, domain, {
      ...base,
      dirtyFacetCache: true,
    });

    // Final mesh bit-identical.
    expect(on.uv.length).toBe(off.uv.length);
    expect(on.tris.length).toBe(off.tris.length);
    expect(on.passes).toBe(off.passes);
    expect(on.capped).toBe(off.capped);
    for (let i = 0; i < off.uv.length; i++) expect(on.uv[i]).toBe(off.uv[i]);
    for (let i = 0; i < off.tris.length; i++) expect(on.tris[i]).toBe(off.tris[i]);

    // Per-pass metrology trajectory identical (dev-driven quantities only;
    // bruteCalls legitimately drops on the cached run).
    expect(on.history.length).toBe(off.history.length);
    let totalHits = 0;
    let totalChecks = 0;
    for (let p = 0; p < off.history.length; p++) {
      const a = off.history[p];
      const b = on.history[p];
      expect(b.outliers).toBe(a.outliers);
      expect(b.worstMm).toBe(a.worstMm);
      expect(b.inserted).toBe(a.inserted);
      expect(b.nTris).toBe(a.nTris);
      totalHits += b.cacheHits ?? 0;
      totalChecks += b.cacheChecks ?? 0;
    }
    // The cache must actually engage on a multi-pass run (else it is a no-op).
    const hitRate = totalChecks > 0 ? totalHits / totalChecks : 0;
    // eslint-disable-next-line no-console
    console.log(
      '[dirtyCache] hitRate=' +
        hitRate.toFixed(3) +
        ` (${totalHits}/${totalChecks}) passes=${on.passes}`,
    );
    expect(hitRate).toBeGreaterThan(0.1);
  }, 300_000);
});
