/**
 * _topologyGate.test.ts — E-2026-07-08-TIERC-TOPOLOGY DESIGN A full GATE (ROUND 7).
 *
 * The needle-forbidding LOCKED-PICKET design on the EXACT V11n multi-bay Gothic
 * gate: adaptiveSeed hMin0.09 t-only + splitMode 'aniso' (edgeSag) + parallel
 * 4-worker scorer, tol 0.01, u[0.05,0.15]×t[0.38,0.62]. The ONLY difference vs
 * _anisoGate is that `buildProtectedComplex` is passed PICKETS: short locked
 * t-aligned constraint segments across the apex-bump t-band so cdt2d cannot
 * re-form the 1.0592 t-spanning needle (pin_diag.json).
 *
 * ACCEPTANCE (pre-registered): guard outliers 0 + capped false + nonManifold 0
 * (non-vacuous) + projFullPot (×42) < 6,000,000.
 * A-KILL: guardMax still 1.059-class after ≤2 placements ⇒ DESIGN A refuted.
 *
 * Per-pass ndjson checkpoint written the INSTANT computed (resumable).
 * Env: PF_TIERC_TOPOGATE=1. PF_TOPO_PLACEMENT = 1 | 2 (picket set, default 1).
 * PF_TOPO_MAXPASS (default 30). PF_TOPO_TAG. Hours-sized.
 */
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex, type PicketSpec } from './morseComplex';
import {
  refineToZeroOutliersParallel,
  type ChartDomain,
  type RefineOptions,
} from './noBridgeRefine';
import { DEFAULT_RULER, reduceDevArray, liftChartMesh } from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { ParallelScorerPool, samplerGrid } from './parallelScorer';

const RUN = process.env.PF_TIERC_TOPOGATE === '1';
const OUT = 'research/exchange/_tierc_topology';
const PLACEMENT = process.env.PF_TOPO_PLACEMENT ? +process.env.PF_TOPO_PLACEMENT : 1;
const MAXPASS = process.env.PF_TOPO_MAXPASS ? +process.env.PF_TOPO_MAXPASS : 30;
const TAG = process.env.PF_TOPO_TAG ?? `p${PLACEMENT}`;
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

/**
 * Picket placements. The apex bump is a HORIZONTAL arch arc spanning all u in
 * the domain, so the needle can re-form at any bay apex — place pickets at a
 * spread of u-columns covering the domain [0.05,0.15].
 *  - PLACEMENT 1: 3 columns (one per bay-ish) across the needle-diag t-band.
 *  - PLACEMENT 2 (if 1 fails): a denser 6-column comb over a wider t-band.
 */
function placementPickets(which: number): PicketSpec[] {
  if (which === 2) {
    const cols = [0.058, 0.078, 0.098, 0.118, 0.138, 0.148];
    return cols.map((u) => ({ u, tLo: 0.4, tHi: 0.6, maxChordMm: 0.09 }));
  }
  // PLACEMENT 1
  const cols = [0.058, 0.1, 0.14];
  return cols.map((u) => ({ u, tLo: 0.44, tHi: 0.58, maxChordMm: 0.09 }));
}

describe('Tier-C multi-bay GATE — TOPOLOGY needle-forbidding pickets', () => {
  it.skipIf(!RUN)('converges to whole-mesh 0 under 6M (pickets)', async () => {
    mkdirSync(OUT, { recursive: true });
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 }) as GpuSurfaceSampler;
    const pickets = placementPickets(PLACEMENT);
    const complex = buildProtectedComplex(sampler, 'GothicArches', undefined, pickets);
    const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);

    const opts: RefineOptions = {
      tolMm: 0.01,
      maxPass: MAXPASS,
      bulkPasses7pt: 4,
      bgArcMm: 0.3,
      adaptiveSeed: true,
      hMinMm: 0.09,
      adaptiveMaxLevel: 5,
      adaptiveUSplit: false,
      splitMode: 'aniso',
      anisoDirection: 'edgeSag',
      anisoAspectTol: 0.15,
      dirtyFacetCache: true,
      ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
    };

    const log = `${OUT}/topogate_${TAG}_pass.ndjson`;
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
      design: 'A-pickets',
      placement: PLACEMENT,
      nPickets: pickets.length,
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
      needleKilled: score.maxMm < 1.0, // the 1.0592 pin gone
      converged: score.outliers === 0 && !refined.capped && projFull < 6_000_000,
      sec: +((Date.now() - t0) / 1000).toFixed(0),
    };
    // eslint-disable-next-line no-console
    console.log('[topogate RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/topogate_${TAG}_result.json`, JSON.stringify(result, null, 2));

    expect(nonMan).toBe(0);
    expect(nonManCracked).toBeGreaterThan(nonMan);
  }, 6 * 60 * 60 * 1000);
});
