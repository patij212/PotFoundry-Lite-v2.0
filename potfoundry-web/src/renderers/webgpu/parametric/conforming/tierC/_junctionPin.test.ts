/**
 * _junctionPin.test.ts — TASK 3/4 pin locator. The 1.05918988549241mm pin
 * appears IDENTICALLY on the on-seam u[0,0.1], off-seam u[0.05,0.15] AND LEVER1
 * domains — all three share the t-band [0.38,0.62]. So the pin is NOT a u-seam
 * artifact (it survives the off-seam shift). This probe reproduces the mesh to
 * the dense-transition and dumps the WORST facet's 3 vertices' (u,t) + whether
 * they sit on a t-domain boundary (t=0.38 / t=0.62), to nail the mechanism.
 *
 * Env-gated PF_TIERC_PIN=1. Uses the parallel refine for tractability.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliersParallel,
  type ChartDomain,
} from './noBridgeRefine';
import {
  DEFAULT_RULER,
  radialSurfaceFromSampler,
  computeDevArraySeq,
  liftChartMesh,
} from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { ParallelScorerPool, samplerGrid } from './parallelScorer';

const RUN = process.env.PF_TIERC_PIN === '1';
const OUT = 'research/exchange/_tierc_junction';

describe('Tier-C pin locator (Task 3/4)', () => {
  it.skipIf(!RUN)('locate the 1.0592mm pinned facet', async () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);
    // Stop at the dense transition (pass 6) — the pin is fully present there.
    const refined = await refineToZeroOutliersParallel(
      sampler,
      complex,
      domain,
      {
        tolMm: 0.01,
        maxPass: 6,
        bulkPasses7pt: 4,
        bgArcMm: 0.3,
        ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
      },
      pool,
    );
    await pool.close();

    const surface = radialSurfaceFromSampler(sampler);
    const xyz = liftChartMesh(sampler, refined.uv);
    const { dev } = computeDevArraySeq(
      surface,
      xyz,
      { uv: refined.uv, tris: refined.tris },
      DEFAULT_RULER,
    );
    let worst = 0;
    let wf = -1;
    for (let f = 0; f < dev.length; f++) {
      if (dev[f] > worst) {
        worst = dev[f];
        wf = f;
      }
    }
    const a = refined.tris[3 * wf];
    const b = refined.tris[3 * wf + 1];
    const c = refined.tris[3 * wf + 2];
    const V = (i: number): { u: number; t: number } => ({
      u: refined.uv[2 * i],
      t: refined.uv[2 * i + 1],
    });
    const onT = (t: number): boolean =>
      Math.abs(t - 0.38) < 1e-6 || Math.abs(t - 0.62) < 1e-6;
    const onU = (u: number): boolean =>
      Math.abs(u - 0.05) < 1e-6 || Math.abs(u - 0.15) < 1e-6;
    const va = V(a);
    const vb = V(b);
    const vc = V(c);
    const result = {
      worstMm: +worst.toFixed(5),
      tris: refined.tris.length / 3,
      verts: [va, vb, vc],
      anyOnTBoundary: onT(va.t) || onT(vb.t) || onT(vc.t),
      anyOnUBoundary: onU(va.u) || onU(vb.u) || onU(vc.u),
      tSpan: +(
        Math.max(va.t, vb.t, vc.t) - Math.min(va.t, vb.t, vc.t)
      ).toFixed(5),
      uSpan: +(
        Math.max(va.u, vb.u, vc.u) - Math.min(va.u, vb.u, vc.u)
      ).toFixed(5),
      tCentroid: +((va.t + vb.t + vc.t) / 3).toFixed(4),
      uCentroid: +((va.u + vb.u + vc.u) / 3).toFixed(4),
    };
    // eslint-disable-next-line no-console
    console.log('[pin]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/pin_result.json`, JSON.stringify(result, null, 2));
    expect(worst).toBeGreaterThan(0.1);
  }, 30 * 60 * 1000);
});
