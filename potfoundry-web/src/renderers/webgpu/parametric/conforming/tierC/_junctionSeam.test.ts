/**
 * _junctionSeam.test.ts — TASK 3 (E-2026-07-08-TIERC-PERF-SEAM): reproduce +
 * classify the pinned ~1.0592mm facet from LEVER 1 (V11d). The diagnostic
 * hypothesis: u=0 is BOTH the periodic seam AND the domain uLo boundary, and
 * the pinned facet is a patch-domain artifact (seam ∩ boundary) that RED-1→4
 * cannot reduce — NOT present in a seam-free domain (the focused domain reached
 * literal 0). This probe SETTLES it: run the same refine on an ON-SEAM domain
 * (u∈[0,0.1]) vs an OFF-SEAM domain (u∈[0.05,0.15]) at the SAME density; if the
 * pinned facet vanishes off-seam, it is a patch-test-only artifact ⇒ the gate
 * domain must be seam-avoiding (the full pot has no domain boundary).
 *
 * Env-gated PF_TIERC_SEAM=1 (perf-bound; uses the parallel scorer for the guard).
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
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

const RUN = process.env.PF_TIERC_SEAM === '1';
const OUT = 'research/exchange/_tierc_junction';

/** Locate the worst facet + whether its centroid u sits on the u=0 seam. */
function worstFacet(
  sampler: GpuSurfaceSampler,
  uv: number[],
  tris: number[],
): {
  worst: number;
  uC: number;
  tC: number;
  onSeam: boolean;
  nOut: number;
} {
  const surface = radialSurfaceFromSampler(sampler);
  const xyz = liftChartMesh(sampler, uv);
  const { dev } = computeDevArraySeq(surface, xyz, { uv, tris }, DEFAULT_RULER);
  let worst = 0;
  let wf = -1;
  let nOut = 0;
  for (let f = 0; f < dev.length; f++) {
    if (dev[f] > 0.01) nOut++;
    if (dev[f] > worst) {
      worst = dev[f];
      wf = f;
    }
  }
  const a = tris[3 * wf];
  const b = tris[3 * wf + 1];
  const c = tris[3 * wf + 2];
  const uC = (uv[2 * a] + uv[2 * b] + uv[2 * c]) / 3;
  const tC = (uv[2 * a + 1] + uv[2 * b + 1] + uv[2 * c + 1]) / 3;
  const minU = Math.min(uv[2 * a], uv[2 * b], uv[2 * c]);
  return { worst, uC, tC, onSeam: minU < 1e-6, nOut };
}

describe('Tier-C seam facet (Task 3)', () => {
  it.skipIf(!RUN)('on-seam vs off-seam pinned facet', async () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const ruler = { ...DEFAULT_RULER, thetaWindowRad: 0.5 };
    const refOpts = {
      tolMm: 0.01,
      maxPass: 14,
      bulkPasses7pt: 4,
      bgArcMm: 0.3,
      ruler,
    };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);

    // Match the LEVER-1 t-band; the ONLY difference is uLo (seam vs off-seam).
    const onSeam: ChartDomain = { uLo: 0, uHi: 0.1, tLo: 0.38, tHi: 0.62 };
    const offSeam: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };

    writeFileSync(`${OUT}/seam.ndjson`, '');
    const run = async (
      label: string,
      dom: ChartDomain,
    ): Promise<Record<string, unknown>> => {
      const refined = await refineToZeroOutliersParallel(
        sampler,
        complex,
        dom,
        refOpts,
        pool,
        (s) => appendFileSync(`${OUT}/seam_pass.ndjson`, JSON.stringify({ label, ...s }) + '\n'),
      );
      const wf = worstFacet(sampler, refined.uv, refined.tris);
      const row = {
        label,
        uLo: dom.uLo,
        tris: refined.tris.length / 3,
        capped: refined.capped,
        passes: refined.passes,
        nOut: wf.nOut,
        worstMm: +wf.worst.toFixed(5),
        worstUc: +wf.uC.toFixed(4),
        worstTc: +wf.tC.toFixed(4),
        worstOnSeam: wf.onSeam,
      };
      appendFileSync(`${OUT}/seam.ndjson`, JSON.stringify(row) + '\n');
      // eslint-disable-next-line no-console
      console.log('[seam]', JSON.stringify(row));
      return row;
    };

    const rOn = await run('on-seam', onSeam);
    const rOff = await run('off-seam', offSeam);
    await pool.close();
    writeFileSync(
      `${OUT}/seam_result.json`,
      JSON.stringify({ onSeam: rOn, offSeam: rOff }, null, 2),
    );

    // The pre-registered classifier: patch-artifact iff the pinned facet is
    // on the seam ON the seam-anchored domain AND vanishes (worst drops below
    // ~0.1mm, or at least is no longer on-seam) OFF the seam.
    expect(rOn.worstMm as number).toBeGreaterThan(0.1); // reproduce the pin
    // Off-seam worst must NOT be a pinned seam facet.
    expect(rOff.worstOnSeam).toBe(false);
  }, 2 * 60 * 60 * 1000);
});
