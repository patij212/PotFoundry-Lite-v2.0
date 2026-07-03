// _braidDiag.test.ts — DEV-ONLY. Characterize CelticKnot (braid) crease structure: is it a checkerboard of C0
// cliffs like BasketWeave, or a smoother swept-ribbon relief? Measure (a) the max radial 2nd-diff kinkiness, (b)
// whether the strand-boundary creases are STEPS (jump) or grooves, and (c) whether they're axis-aligned or swept.
// This decides whether the brick-wall primitive transfers or a swept-curve-conforming variant is needed. Env PF_WEAVE=1.

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { celticKnotCreasePredicate } from '../../src/fidelity/analyticSurfaceGate';
import { DEFAULT_CELTIC_KNOT } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const TAU = 2 * Math.PI;
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe.skipIf(!RUN)('BRAID diag — CelticKnot crease structure', () => {
  it('is CelticKnot a cliff-checkerboard or swept-ribbon relief?', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('CelticKnot', {}, DIMS);
    const p = DEFAULT_CELTIC_KNOT;

    // (a) step magnitude across the crease loci: sample near celticKnotCreasePredicate boundaries and measure the
    // radial jump across a tiny (u,t) step normal to the crease. The predicate flags points within band of a strand
    // boundary. We scan a grid, find crease points, and measure the local max |dr| over a tiny neighborhood.
    const pred = celticKnotCreasePredicate(p.ckScale, p.ckWidth, p.ckTwist, p.ckStrands, 4e-3);
    const nU = 800, nT = 400; const eps = 1e-3;
    let stepMax = 0; let stepSum = 0; let nCrease = 0; const samples: Array<{ u: number; t: number; step: number }> = [];
    for (let it = 1; it < nT; it++) {
      const t = it / nT;
      for (let iu = 0; iu < nU; iu++) {
        const u = iu / nU;
        if (!pred(u, t)) continue;
        nCrease++;
        // local max radial difference over the 4 neighbors (u+-eps, t+-eps)
        const r0 = rA(u * TAU, t * H);
        const du = Math.abs(rA((u + eps) * TAU, t * H) - rA((u - eps) * TAU, t * H));
        const dt = Math.abs(rA(u * TAU, (t + eps) * H) - rA(u * TAU, (t - eps) * H));
        const s = Math.max(du, dt);
        if (s > stepMax) stepMax = s; stepSum += s;
        if (samples.length < 30 && s > 0.5) samples.push({ u: +u.toFixed(4), t: +t.toFixed(4), step: +s.toFixed(4) });
      }
    }
    // (b) whole-surface kinkiness (max radial 2nd-diff along theta) to compare to BasketWeave (~big).
    let kink = 0; const nUk = 4096;
    for (let it = 0; it <= 40; it++) { const z = (it / 40) * H; const r = new Float64Array(nUk); for (let i = 0; i < nUk; i++) r[i] = rA(TAU * (i / nUk), z); for (let i = 0; i < nUk; i++) { const d2 = Math.abs(r[(i - 1 + nUk) % nUk] - 2 * r[i] + r[(i + 1) % nUk]); if (d2 > kink) kink = d2; } }

    ck('braid_diag', { creasePointsScanned: nCrease, stepMaxMm: +stepMax.toFixed(4), stepMeanAtCreaseMm: +(stepSum / Math.max(1, nCrease)).toFixed(4), kinkiness: +kink.toFixed(4), sampleCliffs: samples });
    console.log(`CelticKnot: creasePts=${nCrease} stepMax=${stepMax.toFixed(3)}mm stepMeanAtCrease=${(stepSum / Math.max(1, nCrease)).toFixed(3)}mm kinkiness=${kink.toFixed(3)}`);
    console.log(`  is it a cliff-checkerboard? stepMax>1mm => YES (like BasketWeave); sample cliff pts: ${JSON.stringify(samples.slice(0, 5))}`);
  });
});
