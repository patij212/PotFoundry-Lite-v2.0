/** _adaptiveDiag.test.ts — dev-only: dump the sampler's r(t) + |r''| resolution
 * near the arch peak so LEVER A's density field can be calibrated. PF_ADIAG=1. */
import { describe, it } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import { GpuSurfaceSampler } from '../SurfaceSampler';

const RUN = process.env.PF_ADIAG === '1';

describe('adaptive diag', () => {
  it.skipIf(!RUN)('r(t) resolution near t=0.465', () => {
    const s = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 }) as GpuSurfaceSampler;
    const g = s as unknown as { resU: number; resT: number };
    // eslint-disable-next-line no-console
    console.log('[grid]', JSON.stringify({ resU: g.resU, resT: g.resT }));
    const H = 120;
    const u = 0.1;
    const rAt = (t: number): number => {
      const [x, y] = s.position(u, t);
      return Math.hypot(x, y);
    };
    // Fine scan t∈[0.44,0.49] at dt=0.0005; print r + |r''(z)|.
    const dt = 0.0005;
    const dz = dt * H;
    let maxD2 = 0;
    let maxAt = 0;
    for (let t = 0.44; t <= 0.49; t += dt) {
      const r0 = rAt(t - dt);
      const r1 = rAt(t);
      const r2 = rAt(t + dt);
      const d2 = Math.abs((r0 - 2 * r1 + r2) / (dz * dz));
      if (d2 > maxD2) {
        maxD2 = d2;
        maxAt = t;
      }
    }
    // eslint-disable-next-line no-console
    console.log('[peak]', JSON.stringify({ maxD2: +maxD2.toFixed(4), maxAt: +maxAt.toFixed(4), neededPitchMm: +Math.sqrt(0.08 / maxD2).toFixed(4) }));
    // Does the grid actually resolve the peak? print r on the grid step.
    const stepT = 1 / (g.resT - 1);
    // eslint-disable-next-line no-console
    console.log('[gridStep]', JSON.stringify({ stepT: +stepT.toFixed(5), stepMm: +(stepT * H).toFixed(4) }));
    const samples: Array<[number, number]> = [];
    for (let t = 0.45; t <= 0.48; t += stepT) samples.push([+t.toFixed(4), +rAt(t).toFixed(3)]);
    // eslint-disable-next-line no-console
    console.log('[onGrid]', JSON.stringify(samples));

    // WHOLE-DOMAIN scan: max|r''(z)| over u∈[0.05,0.15], t∈[0.38,0.62] on the
    // GRID the mesh lifts through (the honest field the refine loop sees).
    let gMax = 0;
    let gU = 0;
    let gT = 0;
    const dtc = stepT; // grid pitch
    const duc = 1 / (g.resU - 1);
    for (let uu = 0.05; uu <= 0.15; uu += duc) {
      const rU = (t: number): number => {
        const [x, y] = s.position(((uu % 1) + 1) % 1, t);
        return Math.hypot(x, y);
      };
      for (let t = 0.38 + dtc; t <= 0.62 - dtc; t += dtc) {
        const d2t = Math.abs((rU(t - dtc) - 2 * rU(t) + rU(t + dtc)) / (dtc * H) ** 2);
        if (d2t > gMax) {
          gMax = d2t;
          gU = uu;
          gT = t;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log('[domD2t]', JSON.stringify({ maxD2t: +gMax.toFixed(4), atU: +gU.toFixed(4), atT: +gT.toFixed(4), neededPitchMm: +Math.sqrt(0.08 / Math.max(1e-6, gMax)).toFixed(4) }));
    // Also |d²r/du²| (the u-ridge curvature) at the worst-t.
    let uMax = 0;
    let uMaxAt = 0;
    const rTfix = (uu: number): number => {
      const [x, y] = s.position(((uu % 1) + 1) % 1, gT);
      return Math.hypot(x, y);
    };
    const uArc = 2 * Math.PI * 45; // mm per u
    for (let uu = 0.05 + duc; uu <= 0.15 - duc; uu += duc) {
      const d2u = Math.abs((rTfix(uu - duc) - 2 * rTfix(uu) + rTfix(uu + duc)) / (duc * uArc) ** 2);
      if (d2u > uMax) {
        uMax = d2u;
        uMaxAt = uu;
      }
    }
    // eslint-disable-next-line no-console
    console.log('[domD2u]', JSON.stringify({ maxD2u: +uMax.toFixed(4), atU: +uMaxAt.toFixed(4), atT: +gT.toFixed(4), neededPitchMm: +Math.sqrt(0.08 / Math.max(1e-6, uMax)).toFixed(4) }));
  });
});
