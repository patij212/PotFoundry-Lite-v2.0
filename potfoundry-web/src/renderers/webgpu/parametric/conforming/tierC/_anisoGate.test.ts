/**
 * _anisoGate.test.ts — E-2026-07-08-TIERC-ANISO-RED full GATE (ROUND 6).
 *
 * Multi-bay Gothic gate (parallel scorer 4-worker) with the ANISOTROPIC split
 * mode: an outlier rib-flank facet bisects ONLY its sag-dominant edge (a 1→2
 * point insertion) instead of isotropic RED 1→4. Head-to-head vs the V11k
 * baseline trajectory on disk (_tierc_ribaware/baseline_leverA_tOnly_frontier.json
 * + ribgate_leverA_tOnly_pass.ndjson) — IDENTICAL config (adaptiveSeed hMin0.09
 * t-only, bgArcMm 0.3, tol 0.01, thetaWindow 0.5). Measures the refine trajectory
 * (outliers/worst/tris/projFullPot per pass) + the final honest whole-mesh guard.
 * Per-pass ndjson checkpoint written the INSTANT computed (resumable across kills).
 *
 * PROJECTION: ×42 full-pot (the V11k convention: pass-5 144369 tris → 6.06M).
 *
 * Env: PF_TIERC_ANISOGATE=1. PF_ANISO_DIR = edgeSag | longEdge (default edgeSag).
 * PF_ANISO_TOL (aspect fallback, default 0.15). PF_ANISO_HMIN (default 0.09).
 * PF_ANISO_MAXPASS (default 30). PF_ANISO_TAG (checkpoint tag). Hours-sized.
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

const RUN = process.env.PF_TIERC_ANISOGATE === '1';
const OUT = 'research/exchange/_tierc_aniso';
const DIR = (process.env.PF_ANISO_DIR ?? 'edgeSag') as 'edgeSag' | 'longEdge';
const ATOL = process.env.PF_ANISO_TOL ? +process.env.PF_ANISO_TOL : 0.15;
const HMIN = process.env.PF_ANISO_HMIN ? +process.env.PF_ANISO_HMIN : 0.09;
const MAXPASS = process.env.PF_ANISO_MAXPASS ? +process.env.PF_ANISO_MAXPASS : 30;
const TAG = process.env.PF_ANISO_TAG ?? DIR;
const PROJ = 42;

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

describe('Tier-C multi-bay GATE — ANISOTROPIC split', () => {
  it.skipIf(!RUN)('converges to whole-mesh 0 under 6M (aniso)', async () => {
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
      maxPass: MAXPASS,
      bulkPasses7pt: 4,
      bgArcMm: 0.3,
      adaptiveSeed: true,
      hMinMm: HMIN,
      adaptiveMaxLevel: 5,
      adaptiveUSplit: false,
      splitMode: 'aniso',
      anisoDirection: DIR,
      anisoAspectTol: ATOL,
      ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
    };

    const log = `${OUT}/anisogate_${TAG}_pass.ndjson`;
    writeFileSync(log, '');
    const t0 = Date.now();
    const refined = await refineToZeroOutliersParallel(
      sampler,
      complex,
      domain,
      opts,
      pool,
      (s) => {
        const proj = Math.round(s.nTris * PROJ);
        appendFileSync(
          log,
          JSON.stringify({ ...s, projFullPot: proj, underBudget6M: proj < 6_000_000 }) + '\n',
        );
      },
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
    const projFull = Math.round(tris * PROJ);
    const result = {
      tag: TAG,
      splitMode: 'aniso',
      direction: DIR,
      aspectTol: ATOL,
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
      converged: score.outliers === 0 && !refined.capped && projFull < 6_000_000,
      sec: +((Date.now() - t0) / 1000).toFixed(0),
    };
    // eslint-disable-next-line no-console
    console.log('[anisogate RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/anisogate_${TAG}_result.json`, JSON.stringify(result, null, 2));

    // Non-vacuous watertight check (structural — the gate verdict is the result json).
    expect(nonMan).toBe(0);
    expect(nonManCracked).toBeGreaterThan(nonMan);
  }, 6 * 60 * 60 * 1000);
});
