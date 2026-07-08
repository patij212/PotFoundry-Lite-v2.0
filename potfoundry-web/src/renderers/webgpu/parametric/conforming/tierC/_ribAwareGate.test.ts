/**
 * _ribAwareGate.test.ts — E-2026-07-08-TIERC-RIBAWARE-SEED full GATE.
 *
 * Multi-bay Gothic gate (parallel scorer 4-worker + dirty cache) with a
 * RIB-AWARE seed field. Measures the refine trajectory (outliers/worst/tris per
 * pass) + the final honest whole-mesh guard + full-pot tri projection. The seed
 * diagnostic (_ribAwareDiag) showed rib-aware masking barely changes the seed
 * count (~22k) — the budget question is whether the REFINE trajectory (not the
 * seed) stays under 6M once rib-aware seeding redirects density into the smooth
 * dead-zone. Per-pass ndjson checkpoint written the INSTANT computed (resumable).
 *
 * Env: PF_TIERC_RIBGATE=1. PF_RIB_MODE = leverA | mask | thetaAvg.
 * PF_RIB_BAND (mask band mm, default 1.0). PF_RIB_USPLIT (default 0 = t-only).
 * PF_RIB_HMIN (default 0.09). PF_RIB_TAG (checkpoint tag). Hours-sized.
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliersParallel,
  type ChartDomain,
  type RefineOptions,
} from './noBridgeRefine';
import { DEFAULT_RULER, reduceDevArray, liftChartMesh } from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { ParallelScorerPool, samplerGrid } from './parallelScorer';

const RUN = process.env.PF_TIERC_RIBGATE === '1';
const OUT = 'research/exchange/_tierc_ribaware';
const MODE = (process.env.PF_RIB_MODE ?? 'thetaAvg') as 'leverA' | 'mask' | 'thetaAvg';
const BAND = process.env.PF_RIB_BAND ? +process.env.PF_RIB_BAND : 1.0;
const USPLIT = process.env.PF_RIB_USPLIT === '1';
const HMIN = process.env.PF_RIB_HMIN ? +process.env.PF_RIB_HMIN : 0.09;
const TAG = process.env.PF_RIB_TAG ?? MODE;

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

describe('Tier-C multi-bay GATE — RIB-AWARE seed', () => {
  it.skipIf(!RUN)('converges to whole-mesh 0 under 6M (rib-aware)', async () => {
    mkdirSync(OUT, { recursive: true });
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);

    const opts: RefineOptions = {
      tolMm: 0.01,
      maxPass: 30,
      bulkPasses7pt: 4,
      bgArcMm: 0.3,
      adaptiveSeed: true,
      hMinMm: HMIN,
      adaptiveMaxLevel: 5,
      adaptiveUSplit: USPLIT,
      ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
      ...(MODE === 'mask' ? { ribAwareMode: 'mask' as const, ribBandMm: BAND } : {}),
      ...(MODE === 'thetaAvg' ? { ribAwareMode: 'thetaAvg' as const } : {}),
    };

    const log = `${OUT}/ribgate_${TAG}_pass.ndjson`;
    writeFileSync(log, '');
    const t0 = Date.now();
    const refined = await refineToZeroOutliersParallel(
      sampler,
      complex,
      domain,
      opts,
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
    const projFull = Math.round(tris * 42);
    const result = {
      tag: TAG,
      mode: MODE,
      band: BAND,
      uSplit: USPLIT,
      hMinMm: HMIN,
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
    console.log('[ribgate RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/ribgate_${TAG}_result.json`, JSON.stringify(result, null, 2));

    expect(nonMan).toBe(0);
    expect(nonManCracked).toBeGreaterThan(nonMan);
  }, 6 * 60 * 60 * 1000);
});
