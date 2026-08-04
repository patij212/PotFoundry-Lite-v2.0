// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// _s29FpVetoGothic.test.ts — THE MEASUREMENT. PF_CB_FPVETO PRICED AND SCORED ON THE REAL SURFACE.
//   PF_FPVETO_MEASURE=1 npx vitest run research/tools/_s29FpVetoGothic.test.ts
// RESEARCH ONLY. Opt-in — it runs the S29 ruler thousands of times and is far too slow for the suite.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// The synthetic bars in `_s29FpVeto.test.ts` prove the foot-point ruler SOLVES (V9) and is an UPPER bound.
// They cannot answer the only two questions that decide this arm, because a cylinder and a cone are not
// GothicArches:
//   Q1  DOES IT AGREE? The veto is a BOOLEAN. A cheaper ruler that changes the verdict is a different
//       experiment, not a cheaper S29. The dangerous direction is asymmetric and is counted separately:
//       fp-ACCEPTS-what-S29-REJECTS lets through what the certificate would fail.
//   Q2  WHAT DOES IT COST? The registered criterion: <= ~50 rA evaluations per honest accept test, against
//       S29 iteration 1's measured ~2,844.
//
// Both are measured on `buildRadiusFn('GothicArches', registryDefaults, DIMS)` — the driver's own radius
// function at the driver's own dimensions and REGISTRY DEFAULTS, not a de-featured harness config.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn, type StyleDims } from '../bridge/labkit';
import type { StyleId } from '../../src/geometry/types';
import { s29PerpTriangle, type RadiusFn } from './s29Perp';
import { fpVetoTriangle } from './s29FpVeto';

const RUN = process.env.PF_FPVETO_MEASURE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = process.env.PF_FPVETO_STYLE ?? 'GothicArches';
const TOL = 0.01;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

/** deterministic LCG — the facet sample must be the same set on every run or the numbers cannot be compared */
const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
};

describe('PF_CB_FPVETO measured on the real surface', () => {
  it.runIf(RUN)('agrees with the S29 ruler and prices the accept test', () => {
    const rA0 = buildRadiusFn(STYLE as StyleId, registryDefaults(STYLE), DIMS);
    let evals = 0;
    const rA: RadiusFn = (th, z) => { evals += 1; return rA0(th, z); };
    const P = (th: number, z: number): [number, number, number] => {
      const r = rA0(th, z);
      return [r * Math.cos(th), r * Math.sin(th), z];
    };

    // Two scales, because the driver pays accept tests at both: the 200x140 INITIAL grid (where nearly every
    // facet is over the bar) and an 8x-refined patch (where most of the run's accept tests actually happen).
    const scales: { name: string; gu: number; gv: number }[] = [
      { name: 'initial 200x140 grid', gu: 200, gv: 140 },
      { name: '8x-refined (1600x1120)', gu: 1600, gv: 1120 },
    ];

    const lines: string[] = [];
    let worstBadDirection = 0;
    for (const sc of scales) {
      const dTh = (2 * Math.PI) / sc.gu; const dZ = DIMS.H / sc.gv;
      const pick = rng(20260804);
      let agree = 0; let fpAcceptsS29Rejects = 0; let fpRejectsS29Accepts = 0;
      let s29Cost = 0; let fpCost = 0; let s29Rejects = 0;
      let worstDelta = 0; let sumAbsDelta = 0;
      // THE REGISTERED CRITERION IS ABOUT THE **HONEST ACCEPT TEST** — the facet that PASSES. A rejecting
      // test is the expensive side by construction (it is the one that runs Newton at all), so averaging
      // the two together would hide the number the criterion is written about.
      let okCostS29 = 0; let okCostFp = 0; let okN = 0;
      let noCostS29 = 0; let noCostFp = 0;
      // SIGNED, not absolute. Both rulers return UPPER bounds, so the interesting question is which one is
      // looser and by how much: fp > s29 is OVER-statement (spurious rejects — S29's own D2 failure mode),
      // fp < s29 means the foot-point solve found a nearer surface point than the registered ruler did.
      let fpLooser = 0; let fpTighter = 0; let worstOver = 0; let worstUnder = 0;
      const N = 200;
      for (let k = 0; k < N; k += 1) {
        const i = Math.floor(pick() * sc.gu);
        const j = Math.floor(pick() * (sc.gv - 1));
        const th0 = i * dTh; const z0 = j * dZ;
        const a = P(th0, z0); const b = P(th0 + dTh, z0); const c = P(th0, z0 + dZ);

        evals = 0;
        const s = s29PerpTriangle(rA, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H: DIMS.H, tol: TOL });
        const cs = evals; s29Cost += cs;
        evals = 0;
        const f = fpVetoTriangle(rA, a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], { H: DIMS.H, tol: TOL });
        const cf = evals; fpCost += cf;
        if (s.witnessed <= TOL) { okN += 1; okCostS29 += cs; okCostFp += cf; }
        else { noCostS29 += cs; noCostFp += cf; }
        const sd = f.witnessed - s.witnessed;
        if (sd > 1e-12) { fpLooser += 1; if (sd > worstOver) worstOver = sd; }
        else if (sd < -1e-12) { fpTighter += 1; if (-sd > worstUnder) worstUnder = -sd; }
        // the ruler's own counter must equal the counted calls, or the cost line is fiction
        expect(f.cost).toBe(evals);

        const sOk = s.witnessed <= TOL; const fOk = f.witnessed <= TOL;
        if (!sOk) s29Rejects += 1;
        if (sOk === fOk) agree += 1;
        else if (fOk) fpAcceptsS29Rejects += 1;
        else fpRejectsS29Accepts += 1;
        const d = Math.abs(f.witnessed - s.witnessed);
        sumAbsDelta += d; if (d > worstDelta) worstDelta = d;
      }
      worstBadDirection = Math.max(worstBadDirection, fpAcceptsS29Rejects);
      lines.push(
        `  ${sc.name}: ${N} facets, S29 rejects ${s29Rejects}`
        + `\n     AGREEMENT ${agree}/${N} = ${((100 * agree) / N).toFixed(1)}%`
        + `   fp-ACCEPTS-what-S29-REJECTS ${fpAcceptsS29Rejects}   fp-rejects-what-S29-accepts ${fpRejectsS29Accepts}`
        + `\n     COST/test, ALL: S29 ${(s29Cost / N).toFixed(0)} rA evals -> FP ${(fpCost / N).toFixed(0)}`
        + `   = x${(s29Cost / Math.max(fpCost, 1)).toFixed(1)} cheaper`
        + `\n     COST/HONEST ACCEPT TEST (the ${okN} facets that PASS): S29 ${(okCostS29 / Math.max(okN, 1)).toFixed(0)}`
        + ` -> FP ${(okCostFp / Math.max(okN, 1)).toFixed(0)}   = x${(okCostS29 / Math.max(okCostFp, 1)).toFixed(1)} cheaper`
        + `\n     COST/REJECTING test (${N - okN} facets): S29 ${(noCostS29 / Math.max(N - okN, 1)).toFixed(0)}`
        + ` -> FP ${(noCostFp / Math.max(N - okN, 1)).toFixed(0)}`
        + `\n     reading |Δ| mean ${((sumAbsDelta / N) * 1000).toFixed(3)} µm, worst ${(worstDelta * 1000).toFixed(3)} µm`
        + `   —  FP LOOSER on ${fpLooser} (worst +${(worstOver * 1000).toFixed(3)} µm),`
        + ` FP TIGHTER on ${fpTighter} (worst −${(worstUnder * 1000).toFixed(3)} µm)`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(`\n=== PF_CB_FPVETO vs S29 — ${STYLE} at registry defaults, bar ${TOL * 1000} µm ===\n${lines.join('\n')}\n`);
    // The measurement is the deliverable; the only thing asserted is the direction that would be unsafe to
    // discover later — the veto must not let through what the S29 ruler rejects.
    expect(worstBadDirection).toBe(0);
  }, 900_000);
});
