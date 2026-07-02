// _breadthDragonSlope.test.ts — DEV-ONLY (PF_BREADTH_DRAGON2=1). Is DragonScales' z-step a TRUE C0 cliff or a
// steep-but-continuous ramp? Check two-sided jump across row boundaries + slope profile near the worst z.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_inspect');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe('BREADTH-DRAGON-SLOPE', () => {
  it.skipIf(process.env.PF_BREADTH_DRAGON2 !== '1')('is DragonScales step a true cliff or a steep ramp', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const rowBnd: Array<{ k: number; t: number; z: number; twoSidedJump: number; th: number }> = [];
    for (let k = 1; k < 8; k++) {
      const z = k * 15; const eps = 1e-5;
      let mx = 0, mth = 0;
      for (let i = 0; i < 4000; i++) { const th = TAU * (i / 4000); const dr = Math.abs(rA(th, z + eps) - rA(th, z - eps)); if (dr > mx) { mx = dr; mth = th; } }
      rowBnd.push({ k, t: k / 8, z, twoSidedJump: mx, th: mth });
    }
    // slope profile near z=105 at worst theta from inspect
    const th0 = 1.376;
    const prof: Array<{ z: number; r: number }> = [];
    for (let z = 104.0; z <= 106.0; z += 0.02) prof.push({ z, r: rA(th0, z) });
    // max |dr| over a tiny (1e-5 mm) two-sided step anywhere (true C0 test): scan a fine z near the steep zone
    let trueCliff = 0, tcZ = 0, tcTh = 0;
    for (let j = 0; j < 6000; j++) {
      const z = 100 + 10 * (j / 5999); const eps = 1e-5;
      for (let i = 0; i < 1500; i++) { const th = TAU * (i / 1500); const dr = Math.abs(rA(th, z + eps) - rA(th, z - eps)); if (dr > trueCliff) { trueCliff = dr; tcZ = z; tcTh = th; } }
    }
    save('dragon_slope', { rowBnd, prof, trueCliff, tcZ, tcTh });
    // eslint-disable-next-line no-console
    console.log(`[dragon-slope] rowBnd two-sided jumps: ${rowBnd.map(r => `t${r.t.toFixed(2)}=${r.twoSidedJump.toFixed(3)}`).join(' ')}`);
    // eslint-disable-next-line no-console
    console.log(`[dragon-slope] max TRUE two-sided(1e-5mm) jump in z∈[100,110]=${trueCliff.toFixed(4)}mm @z=${tcZ.toFixed(3)} th=${tcTh.toFixed(3)}`);
    // eslint-disable-next-line no-console
    console.log(`[dragon-slope] slope profile z=104..106 (th=1.376): ${prof.filter((_, i) => i % 5 === 0).map(p => `${p.z.toFixed(1)}:${p.r.toFixed(2)}`).join(' ')}`);
  }, 300_000);
});
