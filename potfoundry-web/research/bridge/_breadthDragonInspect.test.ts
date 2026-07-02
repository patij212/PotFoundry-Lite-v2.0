// _breadthDragonInspect.test.ts — DEV-ONLY (env PF_BREADTH_DRAGON=1). TEAM B — BREADTH.
// STEP 0b: precisely characterize DragonScales' z-discontinuity rings (the genuine step/riser of the 4).
// For a fine grid of z, compute the max over theta of |r(th,z-eps) - r(th,z+eps)| (the ring jump), and the
// theta-coverage of large jumps. This tells us the ring z-levels + whether each is theta-independent (a clean
// tread ring, meshable with a doubled-row band) or a diagonal/scale-cell crease.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_inspect');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe('BREADTH-DRAGON-INSPECT', () => {
  it.skipIf(process.env.PF_BREADTH_DRAGON !== '1')('map DragonScales z-jump vs z + theta-coverage', () => {
    const rA = buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
    const nTh = 3000;
    const eps = 5e-4; // mm below/above the z-level
    // scan z finely; at each z compute max/mean over theta of the one-sided jump across z
    const nZ = 4000;
    const perZ: Array<{ z: number; t: number; maxJump: number; covFrac: number }> = [];
    for (let j = 0; j < nZ; j++) {
      const z = DIMS.H * (j / (nZ - 1));
      const zb = Math.max(0, z - eps), za = Math.min(DIMS.H, z + eps);
      let mx = 0, cov = 0;
      for (let i = 0; i < nTh; i++) {
        const th = TAU * (i / nTh);
        const dr = Math.abs(rA(th, za) - rA(th, zb));
        if (dr > mx) mx = dr;
        if (dr > 0.1) cov++;
      }
      perZ.push({ z, t: z / DIMS.H, maxJump: mx, covFrac: cov / nTh });
    }
    // find local peaks (ring z-levels): maxJump > 0.3 and a local max within +-1mm
    const rings: Array<{ z: number; t: number; maxJump: number; covFrac: number }> = [];
    for (let k = 3; k < perZ.length - 3; k++) {
      const c = perZ[k];
      if (c.maxJump < 0.3) continue;
      let isPeak = true;
      for (let d = -3; d <= 3; d++) if (perZ[k + d].maxJump > c.maxJump) { isPeak = false; break; }
      if (isPeak) rings.push(c);
    }
    // dedupe rings within 1mm
    const dedup: typeof rings = [];
    for (const r of rings) { if (dedup.length === 0 || Math.abs(r.z - dedup[dedup.length - 1].z) > 1) dedup.push(r); }
    save('dragon_rings', { nRings: dedup.length, rings: dedup, note: 'scaleRows=8 → row boundaries at t=k/8; stagger flips theta offset per row' });
    // eslint-disable-next-line no-console
    console.log(`[dragon] found ${dedup.length} ring z-levels: ${dedup.map(r => `t=${r.t.toFixed(3)}(z=${r.z.toFixed(1)},Δ=${r.maxJump.toFixed(2)},cov=${(r.covFrac * 100).toFixed(0)}%)`).join(' ')}`);
  }, 600_000);
});
