import { describe, it, expect } from 'vitest';
import { styleSampler } from '../featureGraph/styleSampler';
import {
  bruteNearestOnRadialSurface,
  radialSurfaceFromSampler,
  DEFAULT_RULER,
} from './interiorRuler';

// The θ-windowed brute must be EXACT (identical to full azimuth) wherever the
// window contains the true foot — and can only OVERSTATE otherwise (the safe
// direction). Verify on a lattice of off-surface probe points around Gothic
// ribs (single-valued radial): windowed == full to floating-point.
describe('Tier-C θ-windowed brute exactness', () => {
  it('windowed brute == full-azimuth brute on Gothic probe points', () => {
    const sampler = styleSampler('GothicArches', {}, { H: 120, Rt: 50, Rb: 40 });
    const { rA, H } = radialSurfaceFromSampler(sampler);
    const full = { ...DEFAULT_RULER };
    const win = { ...DEFAULT_RULER, thetaWindowRad: 0.5 };
    const TAU = 2 * Math.PI;
    let maxAbsDiff = 0;
    let overstateCount = 0;
    let n = 0;
    for (let iu = 0; iu < 40; iu++) {
      const u = iu / 40;
      for (let it = 1; it < 12; it++) {
        const t = it / 12;
        const th = TAU * u;
        const z = t * H;
        const r = rA(th, z);
        // Probe points pushed off the surface radially (both signs) — the
        // regime the ruler actually scores (facet interiors near the surface).
        for (const off of [0.05, 0.2, -0.05, 0.5]) {
          const px = (r + off) * Math.cos(th);
          const py = (r + off) * Math.sin(th);
          const pz = z;
          const dFull = bruteNearestOnRadialSurface(px, py, pz, rA, H, full);
          const dWin = bruteNearestOnRadialSurface(px, py, pz, rA, H, win);
          // Windowed can only be ≥ full (overstate) — never smaller.
          expect(dWin).toBeGreaterThanOrEqual(dFull - 1e-9);
          if (dWin > dFull + 1e-6) overstateCount++;
          maxAbsDiff = Math.max(maxAbsDiff, Math.abs(dWin - dFull));
          n++;
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({ probes: n, maxAbsDiffMm: +maxAbsDiff.toFixed(8), overstateCount }),
    );
    // Exact where the window contains the foot; the 0.5rad window is generous
    // enough that NO probe overstates on Gothic ribs.
    expect(maxAbsDiff).toBeLessThan(1e-6);
    expect(overstateCount).toBe(0);
  }, 5 * 60 * 1000);
});
