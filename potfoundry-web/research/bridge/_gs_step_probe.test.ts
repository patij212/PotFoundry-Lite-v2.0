import { describe, it, expect } from 'vitest';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
describe('gs-step', () => {
  it.skipIf(process.env.PF_GS_STEP !== '1')('C0 tile-boundary step', () => {
    const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
    // worst facets at z~13.5,43.5,73.5,103.5 -> spacing 30. Probe across z=13.5.
    for (const zb of [13.5, 43.5, 73.5]) {
      let maxStep = 0, argTh = 0;
      for (let i=0;i<400;i++){ const th=2*Math.PI*i/400; const s=Math.abs(rA(th,zb+0.002)-rA(th,zb-0.002)); if(s>maxStep){maxStep=s;argTh=th;} }
      console.log(`z=${zb} maxStep=${maxStep.toFixed(4)} @th=${argTh.toFixed(3)}`);
    }
    // slope check: is it a jump or a steep slope? sample fine z around 13.5 at the worst theta
    const th=0.79; const zs=[13.40,13.45,13.49,13.51,13.55,13.60];
    console.log('profile @th=0.79: ' + zs.map(z=>rA(th,z).toFixed(4)).join(' '));
    expect(true).toBe(true);
  });
});
