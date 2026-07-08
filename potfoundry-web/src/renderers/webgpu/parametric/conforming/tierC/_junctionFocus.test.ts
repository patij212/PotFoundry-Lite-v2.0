/**
 * _junctionFocus.test.ts — DEV-ONLY: the density discriminator. Run the SAME
 * Tier-C refine loop on a SMALL domain tightly around the worst dead-zone
 * outlier (u≈0.058, t≈0.44–0.50) at a denser background seed, and see whether
 * it reaches literal 0 outliers. If a small focused domain with dense seed
 * converges to 0, the multi-bay plateau is DENSITY + pass/seed budget (smooth
 * low-κ horizontal crest, not a protection gap). If it STILL plateaus at ~0.4,
 * the crest is structurally unconformable by u/t-midpoint splitting and needs a
 * locked crest edge.
 *
 * Sweeps bgArcMm to bound the density needed.
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

const RUN = process.env.PF_TIERC_JUNCTION === '1';
const OUT = 'research/exchange/_tierc_junction';

describe('Tier-C junction density discriminator', () => {
  it.skipIf(!RUN)('focused dead-zone domain, seed sweep', () => {
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 });
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const surface = radialSurfaceFromSampler(sampler);
    // Small domain around the worst site (one arch period in u, the crest band
    // in t). One period ≈ 0.0625 in u for Gothic; keep it tight.
    const domain: ChartDomain = { uLo: 0.03, uHi: 0.09, tLo: 0.42, tHi: 0.52 };
    const nTheta = 1024;
    const log = `${OUT}/focus.ndjson`;
    writeFileSync(log, '');

    const results: Array<Record<string, unknown>> = [];
    for (const bgArcMm of [0.5, 0.3, 0.2]) {
      const loopRuler = { ...DEFAULT_RULER, nTheta, thetaWindowRad: 0.5 };
      const t0 = Date.now();
      const refined = refineToZeroOutliers(
        sampler,
        complex,
        domain,
        { tolMm: 0.01, maxPass: 20, bulkPasses7pt: 4, bgArcMm, ruler: loopRuler },
        (s) => {
          appendFileSync(
            log,
            JSON.stringify({ bgArcMm, ...s }) + '\n',
          );
        },
      );
      const guardRuler = { ...DEFAULT_RULER, nTheta };
      const score = scoreWholeMesh(sampler, surface, refined, 0.01, guardRuler);
      const row = {
        bgArcMm,
        capped: refined.capped,
        passes: refined.passes,
        tris: refined.tris.length / 3,
        guardOutliers: score.outliers,
        guardMax: +score.maxMm.toFixed(5),
        sec: +((Date.now() - t0) / 1000).toFixed(0),
      };
      results.push(row);
      // eslint-disable-next-line no-console
      console.log('[focus]', JSON.stringify(row));
      writeFileSync(`${OUT}/focus_results.json`, JSON.stringify(results, null, 2));
    }
    expect(results.length).toBe(3);
  }, 60 * 60 * 1000);
});
