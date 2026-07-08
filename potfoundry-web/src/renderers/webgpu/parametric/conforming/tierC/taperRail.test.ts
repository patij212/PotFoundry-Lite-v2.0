/**
 * taperRail.test.ts — fast unit guard for `taperedLevels`
 * (E-2026-07-08-TIERC-TAPERRAIL). Steepness-tapered af-rail placement: rails must
 * cluster in af where the flank profile is steepest (large 3D arc-length per
 * unit af). Runs on a purpose-built analytic sampler with a KNOWN steepness skew
 * — no heavy Gothic build. Pure geometry (no mesh) ⇒ fast + deterministic.
 */
import { describe, it, expect } from 'vitest';
import { taperedLevels } from './flankBand';
import type { SurfaceSampler, Vec3 } from '../SurfaceSampler';
import type { FlankDomain } from './flankBand';

/**
 * Analytic flank: at u in [uLo,uHi] the radius rises from a panel floor to a crest
 * following r(u) = floor + relief * shape(x), x=(u-uLo)/(uHi-uLo). `shape` is chosen
 * so MOST of the rise happens in the FIRST portion of x (steep lower flank), then
 * eases — i.e. steepness dr/dx is front-loaded. t is a plain height sweep. The
 * amplitude-fraction af is monotone in u, so `taperedLevels`'s uForAf bisection
 * resolves cleanly and the taper should crowd rails at LOW af (steep lower flank).
 */
class SkewedFlankSampler implements SurfaceSampler {
  constructor(
    private readonly domain: FlankDomain,
    private readonly floor = 40,
    private readonly relief = 10,
    private readonly H = 120,
  ) {}
  position(u: number, t: number): Vec3 {
    const { uLo, uHi } = this.domain;
    const x = Math.min(1, Math.max(0, (u - uLo) / (uHi - uLo)));
    // Front-loaded rise: sqrt(x) climbs fast near x=0 then flattens ⇒ steep low flank.
    const shape = Math.sqrt(x);
    const r = this.floor + this.relief * shape;
    const theta = 2 * Math.PI * u;
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

describe('taperedLevels (steepness-tapered rails)', () => {
  const domain: FlankDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };

  it('returns nRails levels strictly inside (afLo,afHi), ascending', () => {
    const sampler = new SkewedFlankSampler(domain);
    const levels = taperedLevels(sampler, domain, 4, 0.02, 0.45);
    expect(levels.length).toBe(4);
    for (let i = 0; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(0.02);
      expect(levels[i]).toBeLessThan(0.45);
      if (i > 0) expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
  });

  it('crowds rails at LOW af where the front-loaded flank is steepest', () => {
    const sampler = new SkewedFlankSampler(domain);
    const levels = taperedLevels(sampler, domain, 4, 0.02, 0.45);
    // Uniform af rails would be ~[0.106,0.192,0.278,0.364]. A front-loaded (sqrt)
    // steepness taper puts MORE rails below the af-midpoint 0.235 than above.
    const mid = (0.02 + 0.45) / 2;
    const below = levels.filter((l) => l < mid).length;
    const above = levels.filter((l) => l >= mid).length;
    expect(below).toBeGreaterThan(above);
    // The lowest rail should sit well below the uniform first rail (0.106).
    expect(levels[0]).toBeLessThan(0.09);
  });

  it('falls back to uniform af spacing on a FLAT flank (no steepness signal)', () => {
    // relief 0 ⇒ Stot≈0 ⇒ uniform fallback = afLo + (afHi-afLo)*k/(n+1).
    const flat = new SkewedFlankSampler(domain, 40, 0, 120);
    const levels = taperedLevels(flat, domain, 4, 0.02, 0.45);
    expect(levels.length).toBe(4);
    const expected = [1, 2, 3, 4].map((k) => 0.02 + (0.45 - 0.02) * (k / 5));
    for (let i = 0; i < 4; i++) expect(levels[i]).toBeCloseTo(expected[i], 4);
  });
});
