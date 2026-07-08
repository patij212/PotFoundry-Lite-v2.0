/**
 * _junctionLever1.test.ts — FIX LEVER 1 (E-2026-07-08-TIERC-JUNCTION).
 *
 * Diagnostic verdict: the multi-bay plateau is NOT a junction/protection wall
 * (threshold relaxation recovered ZERO dead-zone recall — the crest is a smooth
 * low-κ HIGH-amplitude horizontal arch arc, correctly ignored by the κ-ridge
 * detector) but a SEED-DENSITY + PASS-BUDGET asymptote: RED-1→4 uniform midpoint
 * splitting has diminishing returns on smooth curvature, so a too-coarse seed
 * (bgArcMm 0.5) leaves a tail of marginal facets and CAPS. The focused
 * discriminator PROVED bgArcMm 0.3 reaches literal 0 (guardMax 0.00996) where
 * 0.5 stuck at 1 facet @0.0104. LEVER 1 = denser seed (0.3) + more passes on
 * the FULL multi-bay gate (u 0-0.1, t 0.38-0.62), honest full-azimuth guard.
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

function nonManifoldByIndex(tris: number[]): number {
  const use = new Map<string, number>();
  for (let f = 0; f < tris.length / 3; f++) {
    const a = tris[3 * f];
    const b = tris[3 * f + 1];
    const c = tris[3 * f + 2];
    for (const [i, j] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const n of use.values()) if (n > 2) bad++;
  return bad;
}

describe('Tier-C multi-bay LEVER 1 (denser seed)', () => {
  it.skipIf(!RUN)('multi-bay gate at bgArcMm 0.3', () => {
    const styleId = 'GothicArches' as const;
    const domain: ChartDomain = { uLo: 0, uHi: 0.1, tLo: 0.38, tHi: 0.62 };
    const nTheta = 1024;
    const sampler = styleSampler(styleId, {}, { H: 120, Rt: 50, Rb: 40 });
    const complex = buildProtectedComplex(sampler, styleId);
    const surface = radialSurfaceFromSampler(sampler);

    const loopRuler = { ...DEFAULT_RULER, nTheta, thetaWindowRad: 0.5 };
    const log = `${OUT}/lever1_pass.ndjson`;
    writeFileSync(log, '');
    const t0 = Date.now();
    const refined = refineToZeroOutliers(
      sampler,
      complex,
      domain,
      { tolMm: 0.01, maxPass: 30, bulkPasses7pt: 4, bgArcMm: 0.3, ruler: loopRuler },
      (s) => {
        appendFileSync(log, JSON.stringify(s) + '\n');
      },
    );

    // Honest FULL-azimuth whole-mesh guard (the trusted verdict).
    const guardRuler = { ...DEFAULT_RULER, nTheta };
    const score = scoreWholeMesh(sampler, surface, refined, 0.01, guardRuler);
    const nonMan = nonManifoldByIndex(refined.tris);
    const cracked = refined.tris.slice();
    cracked.push(refined.tris[0], refined.tris[1], refined.tris[2]);
    const nonManCracked = nonManifoldByIndex(cracked);

    const result = {
      lever: 1,
      bgArcMm: 0.3,
      capped: refined.capped,
      passes: refined.passes,
      tris: refined.tris.length / 3,
      guardOutliers: score.outliers,
      guardMax: +score.maxMm.toFixed(5),
      guardP99: +score.p99.toFixed(5),
      nonManifold: nonMan,
      nonManCrackedControl: nonManCracked, // must be > nonMan (non-vacuous)
      sec: +((Date.now() - t0) / 1000).toFixed(0),
    };
    // eslint-disable-next-line no-console
    console.log('[lever1 RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/lever1_result.json`, JSON.stringify(result, null, 2));

    // The gate: converged 0 + watertight non-vacuous + not capped.
    expect(score.outliers).toBe(0);
    expect(refined.capped).toBe(false);
    expect(nonMan).toBe(0);
    expect(nonManCracked).toBeGreaterThan(nonMan);
  }, 6 * 60 * 60 * 1000);
});
