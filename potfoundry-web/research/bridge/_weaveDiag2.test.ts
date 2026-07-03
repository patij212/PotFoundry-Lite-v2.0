// _weaveDiag2.test.ts — DEV-ONLY. Confirm the layer-ring C0 STEP structure of BasketWeave. The diag showed a
// ~1.5mm radial JUMP across t=0.1 (the over/under checker flips at the ring => the strand on top changes => a
// C0 step in t). This probe measures the step magnitude |r(t=k/10 +eps) - r(t=k/10 -eps)| at EVERY layer ring, at
// several theta, to confirm the "horizontal ring cliff" hypothesis => the fix is a doubled-ring t-ladder (SHARP3D
// in t), analogous to the theta=0 seam cliff. Env PF_WEAVE=1.

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const TAU = 2 * Math.PI;
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe.skipIf(!RUN)('WEAVE diag2 — layer-ring C0 step confirmation', () => {
  it('measure the radial step across each layer ring at several theta', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const layers = DEFAULT_BASKET_WEAVE.bwLayers; const strands = DEFAULT_BASKET_WEAVE.bwStrands;
    const eps = 1e-3; // in t
    const nU = 512;
    const rings: Array<Record<string, number>> = [];
    let maxStep = 0;
    for (let k = 1; k < layers; k++) {
      const t = k / layers;
      let stepMax = 0, stepMean = 0;
      for (let iu = 0; iu < nU; iu++) {
        const th = TAU * (iu / nU);
        const rBelow = rA(th, (t - eps) * H); const rAbove = rA(th, (t + eps) * H);
        const s = Math.abs(rAbove - rBelow); if (s > stepMax) stepMax = s; stepMean += s;
      }
      stepMean /= nU;
      rings.push({ k, t: +t.toFixed(3), stepMaxMm: +stepMax.toFixed(4), stepMeanMm: +stepMean.toFixed(4) });
      if (stepMax > maxStep) maxStep = stepMax;
    }
    // Also confirm: WITHIN a cell band (away from rings), is the t-direction smooth (no step)? sample t=0.15 (mid v=1..2)
    let midStepMax = 0;
    for (let iu = 0; iu < nU; iu++) { const th = TAU * (iu / nU); const s = Math.abs(rA(th, (0.15 + eps) * H) - rA(th, (0.15 - eps) * H)); if (s > midStepMax) midStepMax = s; }
    ck('diag2_ringsteps', { eps, rings, midCellStepMax: +midStepMax.toFixed(5), maxRingStep: +maxStep.toFixed(4) });
    console.log('LAYER-RING STEPS:', JSON.stringify(rings));
    console.log(`mid-cell t-step (should be ~2*eps*speed, small & smooth): ${midStepMax.toFixed(4)}mm; maxRingStep=${maxStep.toFixed(3)}mm`);
  });
});
