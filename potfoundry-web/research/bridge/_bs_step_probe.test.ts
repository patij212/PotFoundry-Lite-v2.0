import { describe, it, expect } from 'vitest';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
describe('bs-step', () => {
  it.skipIf(process.env.PF_BS_STEP !== '1')('C0 step at segment boundary', () => {
    const rA = buildRadiusFn('BambooSegments' as StyleId, {}, DIMS);
    const H = 120;
    // segment boundaries at t = k/5 -> z = k*24. Check z=72 (t=0.6, segment 2->3).
    for (const zb of [24, 48, 72, 96]) {
      for (const th of [0, Math.PI/3, Math.PI]) {
        const below = rA(th, zb - 0.001), above = rA(th, zb + 0.001);
        console.log(`z=${zb} th=${th.toFixed(2)} r-=${below.toFixed(4)} r+=${above.toFixed(4)} STEP=${(above-below).toFixed(4)}`);
      }
    }
    // also gradient just off the boundary to show it's a jump not a slope
    const th=0; const r1=rA(th,71.5), r2=rA(th,71.99), r3=rA(th,72.01), r4=rA(th,72.5);
    console.log(`profile z=71.5..72.5: ${r1.toFixed(4)} ${r2.toFixed(4)} | ${r3.toFixed(4)} ${r4.toFixed(4)}`);
    expect(true).toBe(true);
  });
});
