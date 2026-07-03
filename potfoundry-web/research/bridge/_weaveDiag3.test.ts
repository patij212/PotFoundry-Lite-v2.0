// _weaveDiag3.test.ts — DEV-ONLY. Resolve the TRUE WIDTH of the layer-ring step + strand-boundary step. Is it a
// genuine C0 discontinuity (zero width => needs doubled lines) or a steep-but-finite transition (needs dense rows)?
// Sample r(t) across the ring t=0.5 at ULTRA-fine t resolution around the jump, and r(theta) across a strand
// boundary at ultra-fine theta. Report the transition width (t or theta span over which 90% of the step happens).
// Env PF_WEAVE=1.

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

describe.skipIf(!RUN)('WEAVE diag3 — resolve the step transition WIDTH', () => {
  it('is the ring/boundary step a true C0 cliff (zero width) or a steep finite ramp?', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const strands = DEFAULT_BASKET_WEAVE.bwStrands;

    // RING at t=0.5, at strand-cell center u=0.5/16. Sweep t in [0.5-w, 0.5+w] for decreasing w to find the width.
    const thC = TAU * (0.5 / strands);
    const results: Record<string, unknown> = {};
    for (const w of [0.02, 0.002, 0.0002, 0.00002]) {
      const nT = 2000; const prof: number[] = [];
      let rMin = Infinity, rMax = -Infinity;
      for (let i = 0; i <= nT; i++) { const tt = 0.5 - w + (2 * w) * (i / nT); const r = rA(thC, tt * H); prof.push(r); if (r < rMin) rMin = r; if (r > rMax) rMax = r; }
      // the step magnitude within this window
      results[`ring_w${w}`] = { windowT: 2 * w, rSpanMm: +(rMax - rMin).toFixed(4), rBelow: +prof[0].toFixed(4), rAbove: +prof[nT].toFixed(4), jumpEndpointsMm: +(prof[nT] - prof[0]).toFixed(4) };
    }

    // STRAND BOUNDARY at u=2/16 (theta=2*TAU/16), at t=0.55 (mid-cell). Sweep theta ultra-fine.
    const uB = 2 / strands; const tC = 0.55;
    const bres: Record<string, unknown> = {};
    for (const w of [0.02 / strands, 0.002 / strands, 0.0002 / strands]) {
      const nS = 2000; let rMin = Infinity, rMax = -Infinity; const p: number[] = [];
      for (let i = 0; i <= nS; i++) { const uu = uB - w + (2 * w) * (i / nS); const r = rA(uu * TAU, tC * H); p.push(r); if (r < rMin) rMin = r; if (r > rMax) rMax = r; }
      bres[`bnd_w${w.toExponential(1)}`] = { windowU: 2 * w, rSpanMm: +(rMax - rMin).toFixed(4), jumpEndpointsMm: +(p[nS] - p[0]).toFixed(4) };
    }

    ck('diag3_width', { ring: results, boundary: bres });
    console.log('RING step vs window width:', JSON.stringify(results, null, 1));
    console.log('BOUNDARY step vs window width:', JSON.stringify(bres, null, 1));
  });
});
