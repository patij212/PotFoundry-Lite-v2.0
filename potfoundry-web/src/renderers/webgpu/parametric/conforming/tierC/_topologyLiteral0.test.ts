/**
 * _topologyLiteral0.test.ts — E-2026-07-08-TIERC-LITERAL0 (ROUND 8).
 *
 * NEW USER MANDATE: full-pot budget RAISED to 8-10M (prefer <=8M); goal is
 * LITERAL whole-mesh 0 DEMONSTRATED (dense 45-pt guard, every free facet), not
 * extrapolated. Same multi-bay Gothic gate + ALL banked levers as round-7 p1
 * (_topologyGate.test.ts): adaptiveSeed hMin0.09 t-only + splitMode 'aniso'
 * (edgeSag) + 3-picket needle-forbid + parallel 4-worker + dirty cache, tol 0.01,
 * u[0.05,0.15] x t[0.38,0.62], x42 full-pot.
 *
 * STEP 1 (this file, MODE=extend): resume the p1 config at MAXPASS 120 with
 *   per-pass ndjson to _tierc_literal0/. Each pass row records nTris + inserted
 *   so the dedupe-stall (inserted>>dNtris) is directly visible. The curve decides:
 *   monotone->0 within <=10M projection = DONE; asymptote >0 = floor is real.
 * STEP 2 (MODE=escalate): the SAME driver with escalation levers via env:
 *   PF_L0_MAXCONSTRAINT (maxConstraintMm, default 0.15) — the code-predicted lever;
 *   PF_L0_HMIN (hMinMm, default 0.09); PF_L0_MAXLEVEL (adaptiveMaxLevel, default 5).
 *   PF_L0_PICKETCHORD (picket maxChordMm, default 0.09).
 *
 * ACCEPTANCE (pre-registered): guardOutliers 0 (dense 45-pt, every free facet) +
 *   nonManifold 0 (non-vacuous, cracked control >0) + capped false + projFullPot
 *   (x42) <= 10,000,000 (state whether <=8M).
 * KILL: outliers asymptote >0 with projFullPot already >10M ⇒ STOP (report the
 *   measured asymptote + curve). A lever regressing worst/nonMan ⇒ drop it.
 *
 * Per-pass ndjson checkpoint written the INSTANT computed (resumable).
 * Env: PF_TIERC_LITERAL0=1. PF_L0_MAXPASS (default 120). PF_L0_TAG.
 * Hours-sized (6h+ timeout).
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

const RUN = process.env.PF_TIERC_LITERAL0 === '1';
const OUT = 'research/exchange/_tierc_literal0';
const MAXPASS = process.env.PF_L0_MAXPASS ? +process.env.PF_L0_MAXPASS : 120;
const MAXCONSTRAINT = process.env.PF_L0_MAXCONSTRAINT ? +process.env.PF_L0_MAXCONSTRAINT : 0.15;
const HMIN = process.env.PF_L0_HMIN ? +process.env.PF_L0_HMIN : 0.09;
const MAXLEVEL = process.env.PF_L0_MAXLEVEL ? +process.env.PF_L0_MAXLEVEL : 5;
const PICKETCHORD = process.env.PF_L0_PICKETCHORD ? +process.env.PF_L0_PICKETCHORD : 0.09;
const TAG =
  process.env.PF_L0_TAG ??
  `mc${MAXCONSTRAINT}_hm${HMIN}_ml${MAXLEVEL}`;
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

/** Round-7 PLACEMENT-1 pickets (the banked needle-forbidding set), chord overridable. */
function placementPickets(chord: number): PicketSpec[] {
  const cols = [0.058, 0.1, 0.14];
  return cols.map((u) => ({ u, tLo: 0.44, tHi: 0.58, maxChordMm: chord }));
}

describe('Tier-C multi-bay GATE — LITERAL-0 extended/escalation (round 8)', () => {
  it.skipIf(!RUN)('drives whole-mesh 0 under the raised 8-10M budget', async () => {
    mkdirSync(OUT, { recursive: true });
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 }) as GpuSurfaceSampler;
    const pickets = placementPickets(PICKETCHORD);
    const complex = buildProtectedComplex(sampler, 'GothicArches', undefined, pickets);
    const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);

    const opts: RefineOptions = {
      tolMm: 0.01,
      maxPass: MAXPASS,
      bulkPasses7pt: 4,
      bgArcMm: 0.3,
      maxConstraintMm: MAXCONSTRAINT,
      adaptiveSeed: true,
      hMinMm: HMIN,
      adaptiveMaxLevel: MAXLEVEL,
      adaptiveUSplit: false,
      splitMode: 'aniso',
      anisoDirection: 'edgeSag',
      anisoAspectTol: 0.15,
      dirtyFacetCache: true,
      ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
    };

    const log = `${OUT}/l0_${TAG}_pass.ndjson`;
    writeFileSync(log, '');
    // eslint-disable-next-line no-console
    console.log(
      `[literal0 START] tag=${TAG} maxPass=${MAXPASS} maxConstraintMm=${MAXCONSTRAINT} hMin=${HMIN} maxLevel=${MAXLEVEL} picketChord=${PICKETCHORD}`,
    );
    const t0 = Date.now();
    let prevTris = 0;
    const refined = await refineToZeroOutliersParallel(
      sampler,
      complex,
      domain,
      opts,
      pool,
      (s) => {
        const proj = Math.round(s.nTris * PROJ);
        const dTris = s.nTris - prevTris;
        // dedupe-stall tell: inserted midpoints vs actual tri growth.
        // dTris ~= 2*acceptedInserts (each accepted point adds ~2 tris on re-CDT);
        // inserted>>dTris/2 ⇒ splits are being dedupe-rejected (frozen lattice).
        const rejectFrac =
          s.inserted > 0 ? +(1 - dTris / 2 / s.inserted).toFixed(4) : 0;
        prevTris = s.nTris;
        appendFileSync(
          log,
          JSON.stringify({
            ...s,
            projFullPot: proj,
            dTris,
            approxRejectFrac: rejectFrac,
            underBudget8M: proj < 8_000_000,
            underBudget10M: proj < 10_000_000,
          }) + '\n',
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
      design: 'A-pickets-literal0',
      maxConstraintMm: MAXCONSTRAINT,
      hMinMm: HMIN,
      adaptiveMaxLevel: MAXLEVEL,
      picketChordMm: PICKETCHORD,
      capped: refined.capped,
      passes: refined.passes,
      tris,
      projFullPot: projFull,
      underBudget8M: projFull < 8_000_000,
      underBudget10M: projFull < 10_000_000,
      guardOutliers: score.outliers,
      guardMax: +score.maxMm.toFixed(5),
      guardP99: +score.p99.toFixed(5),
      nonManifold: nonMan,
      nonManCrackedControl: nonManCracked,
      // LITERAL-0 acceptance
      literal0:
        score.outliers === 0 &&
        !refined.capped &&
        nonMan === 0 &&
        nonManCracked > nonMan &&
        projFull <= 10_000_000,
      sec: +((Date.now() - t0) / 1000).toFixed(0),
    };
    // eslint-disable-next-line no-console
    console.log('[literal0 RESULT]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/l0_${TAG}_result.json`, JSON.stringify(result, null, 2));

    // Non-vacuous watertight control must always hold (independent of convergence).
    expect(nonMan).toBe(0);
    expect(nonManCracked).toBeGreaterThan(nonMan);
  }, 6 * 60 * 60 * 1000);
});
