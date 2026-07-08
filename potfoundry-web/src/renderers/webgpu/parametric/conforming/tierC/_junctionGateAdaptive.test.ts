/**
 * _junctionGateAdaptive.test.ts — E-2026-07-08-TIERC-ADAPTIVE-SEED, GATE with
 * LEVER A (2D curvature-adaptive background seed). The pin diagnosis
 * (pin_diag.json) showed the ~1.0592mm pin is a LONG t-SPANNING NEEDLE
 * (edges AB=CA≈8.9mm, uSpan≈0, tSpan≈0.075) across the smooth arch bump the
 * κ-detector misses — the CDT forms it because the UNIFORM bgArcMm seed has no
 * interior points inside the dead-zone t-band. LEVER A packs points into that
 * 2D bump so the CDT cannot span it with a needle.
 *
 * Env-gated PF_TIERC_GATEA=1. Per-pass ndjson checkpoint. Hours-sized.
 * PF_GATEA_HMIN / PF_GATEA_MAXLEVEL parameterize the adaptive field (2 tries).
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliersParallel,
  type ChartDomain,
} from './noBridgeRefine';
import { DEFAULT_RULER, reduceDevArray, liftChartMesh } from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { ParallelScorerPool, samplerGrid } from './parallelScorer';

const RUN = process.env.PF_TIERC_GATEA === '1';
const OUT = 'research/exchange/_tierc_junction';
const HMIN = process.env.PF_GATEA_HMIN ? +process.env.PF_GATEA_HMIN : 0.09;
const MAXLEVEL = process.env.PF_GATEA_MAXLEVEL ? +process.env.PF_GATEA_MAXLEVEL : 5;
const BGARC = process.env.PF_GATEA_BGARC ? +process.env.PF_GATEA_BGARC : 0.3;
const USPLIT = process.env.PF_GATEA_USPLIT !== '0';
const TAG = process.env.PF_GATEA_TAG ?? 'A';

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

describe('Tier-C multi-bay GATE — LEVER A adaptive seed', () => {
  it.skipIf(!RUN)('converges to whole-mesh 0 (adaptive seed)', async () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);

    const log = `${OUT}/gateA_${TAG}_pass.ndjson`;
    writeFileSync(log, '');
    const t0 = Date.now();
    const refined = await refineToZeroOutliersParallel(
      sampler,
      complex,
      domain,
      {
        tolMm: 0.01,
        maxPass: 30,
        bulkPasses7pt: 4,
        bgArcMm: BGARC,
        adaptiveSeed: true,
        hMinMm: HMIN,
        adaptiveMaxLevel: MAXLEVEL,
        adaptiveUSplit: USPLIT,
        ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
      },
      pool,
      (s) => appendFileSync(log, JSON.stringify(s) + '\n'),
    );

    const xyz = liftChartMesh(sampler, refined.uv);
    const g = await pool.scoreDev(xyz, refined.uv, refined.tris, DEFAULT_RULER);
    await pool.close();
    const score = reduceDevArray(g.dev, 0.01, g.bruteCalls);

    const nonMan = nonManifoldByIndex(refined.tris);
    const cracked = refined.tris.slice();
    cracked.push(refined.tris[0], refined.tris[1], refined.tris[2]);
    const nonManCracked = nonManifoldByIndex(cracked);

    const tris = refined.tris.length / 3;
    // Full-pot tri projection: this domain (u 0.1 × t 0.24) is ~1/42 of the pot.
    const projFull = Math.round(tris * 42);
    const result = {
      tag: TAG,
      hMinMm: HMIN,
      maxLevel: MAXLEVEL,
      uSplit: USPLIT,
      bgArcMm: BGARC,
      capped: refined.capped,
      passes: refined.passes,
      tris,
      projFullPot: projFull,
      underBudget6M: projFull < 6_000_000,
      guardOutliers: score.outliers,
      guardMax: +score.maxMm.toFixed(5),
      guardP99: +score.p99.toFixed(5),
      nonManifold: nonMan,
      nonManCrackedControl: nonManCracked,
      sec: +((Date.now() - t0) / 1000).toFixed(0),
    };
    // eslint-disable-next-line no-console
    console.log('[gateA RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/gateA_${TAG}_result.json`, JSON.stringify(result, null, 2));

    expect(nonMan).toBe(0);
    expect(nonManCracked).toBeGreaterThan(nonMan);
  }, 6 * 60 * 60 * 1000);
});
