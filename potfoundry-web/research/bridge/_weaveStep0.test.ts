// _weaveStep0.test.ts — DEV-ONLY. FRONTIER weave/braid STEP 0: VERIFY the TRUE exported geometry.
// The scaling agent ASSUMED multi-valued; the product exports single-valued r=rA. This probe DECIDES the whole
// approach empirically (measurement-first): is rA(theta,z) SINGLE-VALUED (one bumpy surface, over/under FLATTENED
// into surface creases) or does the shipped export ever place 2+ radii at one (theta,z)?
//
// TESTS:
//  (S0a) rA is a scalar function => single-valued BY CONSTRUCTION (rOuterBasketWeave returns ONE number). We CONFIRM
//        this is what the export samples (buildRadiusFn is the production analytic source) and quantify the RELIEF
//        RANGE so we know the over/under is baked into a single radius.
//  (S0b) MULTI-VALUEDNESS PROBE: for a fine theta scan at fixed z, is the radius a well-defined single value per
//        theta (yes, trivially — rA is a function) AND does the *3D surface* self-occlude (a ray from the axis at
//        angle theta hits the surface at exactly ONE radius)? A radial-height field r(theta,z) is single-valued
//        along the ray by construction => NO self-occlusion in the exported mesh. We confirm the mesh the product
//        would build is a single sheet.
//  (S0c) CREASE STRUCTURE: sample the theta-2nd-difference (crease indicator) over a (theta,t) grid and locate the
//        strand-boundary creases. For BasketWeave (twist=0) predict an ORTHOGONAL grid: 16 vertical (theta=m*TAU/16)
//        + 9 horizontal (t=k/10). Measure the actual crease loci. For CelticKnot predict SWEPT sinusoidal ribbons.
//  (S0d) SEAM: is rA 2pi-periodic? measure max_t |rA(0,z)-rA(2pi-,z)|.
//
// Env PF_WEAVE=1. Output research/exchange/_weave/. Checkpoint step0_<STYLE>.json.

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const TAU = 2 * Math.PI;
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe.skipIf(!RUN)('WEAVE STEP 0 — verify the true exported geometry (single-valued vs multi-valued)', () => {
  it('BasketWeave + CelticKnot: is rA single-valued? map the crease structure; measure seam', () => {
    const H = DIMS.H;
    const styles: StyleId[] = ['BasketWeave', 'CelticKnot'];
    const report: Record<string, unknown> = {};

    for (const style of styles) {
      const rA = buildRadiusFn(style, {}, DIMS);

      // ---- S0a: relief range (over/under baked into one radius) ----
      let rMin = Infinity, rMax = -Infinity;
      const nT = 200, nU = 4096;
      for (let it = 0; it <= nT; it++) {
        const z = (it / nT) * H;
        for (let iu = 0; iu < nU; iu++) {
          const r = rA(TAU * (iu / nU), z);
          if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        }
      }
      const reliefRangeMm = rMax - rMin;

      // ---- S0b: multi-valuedness / self-occlusion probe ----
      // A radial height field r(theta,z) places EXACTLY ONE radius per (theta,z) ray => single-valued by
      // construction. To be RIGOROUS about "does the exported surface self-occlude", check whether the surface,
      // as a function graph r=f(theta,z) in cylindrical coords, is a single sheet: it is IFF f is finite &
      // single-valued for all (theta,z), which it is (a scalar JS function). We ALSO test that no two distinct
      // (theta,z) points would be exported at the SAME 3D location with different radii along the same ray — but
      // since a ray at fixed (theta,z) has one r, that cannot happen. We record the determination + evidence.
      // Additionally: sample rA at the SAME (theta,z) twice to confirm determinism (a stochastic field would be
      // multi-valued in practice).
      let deterministic = true;
      for (let k = 0; k < 2000; k++) {
        const th = TAU * Math.random(), z = Math.random() * H;
        if (rA(th, z) !== rA(th, z)) { deterministic = false; break; }
      }
      const singleValued = deterministic; // scalar deterministic function of (theta,z) => single sheet, no occlusion

      // ---- S0c: crease structure — theta 2nd-difference over grid ----
      // vertical crease indicator: max |d2r/dtheta2| along theta at each t; find the theta positions of the peaks.
      // For BasketWeave (twist=0) creases at theta=m*TAU/16. We detect the theta locations of large 2nd-diff.
      const zMid = 0.5 * H;
      const rRow = new Float64Array(nU);
      for (let iu = 0; iu < nU; iu++) rRow[iu] = rA(TAU * (iu / nU), zMid);
      const d2 = new Float64Array(nU);
      let d2max = 0;
      for (let iu = 0; iu < nU; iu++) { d2[iu] = Math.abs(rRow[(iu - 1 + nU) % nU] - 2 * rRow[iu] + rRow[(iu + 1) % nU]); if (d2[iu] > d2max) d2max = d2[iu]; }
      // peaks in d2 above 0.3*max => vertical crease theta-locations (in units of theta/TAU)
      const vCreaseU: number[] = [];
      const thr = 0.3 * d2max;
      for (let iu = 0; iu < nU; iu++) {
        const a = d2[(iu - 1 + nU) % nU], b = d2[iu], c = d2[(iu + 1) % nU];
        if (b >= a && b > c && b > thr) vCreaseU.push(+(iu / nU).toFixed(4));
      }
      // horizontal crease indicator: max |d2r/dt2| along t at a fixed theta (theta chosen mid-strand, off a
      // vertical crease). For BasketWeave predict t=k/10.
      const thFixed = TAU * (0.5 / 16); // mid of first strand cell
      const rCol = new Float64Array(nT + 1);
      for (let it = 0; it <= nT; it++) rCol[it] = rA(thFixed, (it / nT) * H);
      let d2tMax = 0; const d2t = new Float64Array(nT + 1);
      for (let it = 1; it < nT; it++) { d2t[it] = Math.abs(rCol[it - 1] - 2 * rCol[it] + rCol[it + 1]); if (d2t[it] > d2tMax) d2tMax = d2t[it]; }
      const hCreaseT: number[] = [];
      const thrT = 0.3 * (d2tMax || 1);
      for (let it = 1; it < nT; it++) { const a = d2t[it - 1], b = d2t[it], c = d2t[it + 1]; if (b >= a && b > c && b > thrT) hCreaseT.push(+(it / nT).toFixed(4)); }

      // ---- S0d: seam step ----
      let seamMax = 0, seamSum = 0; const nSeam = 241;
      for (let i = 0; i < nSeam; i++) { const z = (i / (nSeam - 1)) * H; const s = Math.abs(rA(0, z) - rA((1 - 1e-9) * TAU, z)); if (s > seamMax) seamMax = s; seamSum += s; }

      report[style] = {
        singleValued,
        deterministic,
        reliefRangeMm: +reliefRangeMm.toFixed(4),
        rMinMm: +rMin.toFixed(4), rMaxMm: +rMax.toFixed(4),
        d2maxTheta: +d2max.toFixed(5),
        nVerticalCreasesAtMidZ: vCreaseU.length,
        verticalCreaseU: vCreaseU,
        d2maxT: +d2tMax.toFixed(5),
        nHorizontalCreases: hCreaseT.length,
        horizontalCreaseT: hCreaseT,
        seamStepMaxMm: +seamMax.toFixed(4),
        seamStepMeanMm: +(seamSum / nSeam).toFixed(4),
      };
      console.log(`${style}: singleValued=${singleValued} relief=${reliefRangeMm.toFixed(3)}mm vCreases=${vCreaseU.length} hCreases=${hCreaseT.length} seamMax=${seamMax.toFixed(3)}mm`);
      console.log(`  vCreaseU (theta/TAU): ${vCreaseU.slice(0, 20).join(', ')}`);
      console.log(`  hCreaseT: ${hCreaseT.join(', ')}`);
    }

    ck('step0', report);
    // ASSERT: both styles single-valued (they are scalar functions => this is a documented CONFIRM, not a guess)
    expect((report['BasketWeave'] as { singleValued: boolean }).singleValued).toBe(true);
    expect((report['CelticKnot'] as { singleValued: boolean }).singleValued).toBe(true);
  });
});
