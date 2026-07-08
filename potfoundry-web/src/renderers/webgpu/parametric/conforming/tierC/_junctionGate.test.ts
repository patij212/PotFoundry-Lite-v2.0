/**
 * _junctionGate.test.ts — TASK 4 (E-2026-07-08-TIERC-PERF-SEAM): re-run the
 * full multi-bay Gothic gate with the perf fixes (parallel refine + parallel
 * guard) + the denser seed (bgArcMm 0.3) + the seam resolution (Task 3). The
 * domain is chosen SEAM-AVOIDING per the Task-3 verdict (the full pot has no
 * domain boundary; the pinned u=0 facet was a patch-test artifact). SUCCESS =
 * literal whole-mesh 0 outliers (honest full-azimuth parallel guard) +
 * watertight non-vacuous + not capped.
 *
 * Env-gated PF_TIERC_GATE=1. Checkpoints per-pass ndjson. Sized in hours (sync
 * vitest cannot be interrupted); NODE_OPTIONS=--max-old-space-size=8192.
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

const RUN = process.env.PF_TIERC_GATE === '1';
const OUT = 'research/exchange/_tierc_junction';
// Seam-avoiding domain width; matches the LEVER-1 t-band + u-width (0.1) but
// shifted off u=0. Overridable via env for the seam-avoid sensitivity.
const ULO = process.env.PF_GATE_ULO ? +process.env.PF_GATE_ULO : 0.05;
const BGARC = process.env.PF_GATE_BGARC ? +process.env.PF_GATE_BGARC : 0.3;

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

describe('Tier-C multi-bay GATE (Task 4)', () => {
  it.skipIf(!RUN)('converges to whole-mesh 0 (parallel, seam-avoiding)', async () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: ULO, uHi: ULO + 0.1, tLo: 0.38, tHi: 0.62 };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);

    const log = `${OUT}/gate_pass.ndjson`;
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
        ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
      },
      pool,
      (s) => appendFileSync(log, JSON.stringify(s) + '\n'),
    );

    // Honest FULL-azimuth whole-mesh guard via the pool (no theta window).
    const xyz = liftChartMesh(sampler, refined.uv);
    const g = await pool.scoreDev(xyz, refined.uv, refined.tris, DEFAULT_RULER);
    await pool.close();
    const score = reduceDevArray(g.dev, 0.01, g.bruteCalls);

    const nonMan = nonManifoldByIndex(refined.tris);
    const cracked = refined.tris.slice();
    cracked.push(refined.tris[0], refined.tris[1], refined.tris[2]);
    const nonManCracked = nonManifoldByIndex(cracked);

    const result = {
      task: 4,
      uLo: ULO,
      bgArcMm: BGARC,
      capped: refined.capped,
      passes: refined.passes,
      tris: refined.tris.length / 3,
      guardOutliers: score.outliers,
      guardMax: +score.maxMm.toFixed(5),
      guardP99: +score.p99.toFixed(5),
      nonManifold: nonMan,
      nonManCrackedControl: nonManCracked,
      sec: +((Date.now() - t0) / 1000).toFixed(0),
    };
    // eslint-disable-next-line no-console
    console.log('[gate RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/gate_result.json`, JSON.stringify(result, null, 2));

    expect(score.outliers).toBe(0);
    expect(refined.capped).toBe(false);
    expect(nonMan).toBe(0);
    expect(nonManCracked).toBeGreaterThan(nonMan);
  }, 6 * 60 * 60 * 1000);
});
