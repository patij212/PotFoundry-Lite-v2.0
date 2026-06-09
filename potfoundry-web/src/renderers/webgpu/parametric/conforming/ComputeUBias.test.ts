/**
 * ComputeUBias.test.ts — guards the GATED, FIXED uBias selection.
 *
 * A square (u,t) cell maps to a 3D sliver under extreme circumference/height
 * anisotropy (GAP 1). `computeUBias` corrects this with a level-exponent bias B,
 * but ONLY for genuinely wide/flat pots (gate), and by a SINGLE FIXED amount —
 * NOT scaled by surface relief. The relief-scaled version was measured to
 * over-bias moderate-relief styles into construction slivers (ArtDeco short-wide
 * B=3 → 3639 ~101-aspect cells), while a uniform B=2 left every wide/flat style
 * sliver-free. These guards pin both the gate and the fixed value.
 */
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import { computeUBias } from './WatertightAssembly';
import { SyntheticCylinderSampler } from './SurfaceSampler';

/**
 * Cylinder with relief in the T direction: `r = R0 + amp·cos(2π k t)`. This
 * inflates √G (= √(H² + (∂r/∂t)²)), which fooled the OLD `2π·r/√G` gate into
 * UNDER-reading the shape and wrongly excluding such styles (Crystalline) from
 * the bias. The relief-free geometric gate must not be fooled.
 */
class TReliefCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly amp: number,
    private readonly k: number,
  ) {}
  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    const r = this.R0 + this.amp * Math.cos(2 * Math.PI * this.k * t);
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

describe('computeUBias — gated fixed anisotropy bias', () => {
  it('is 0 for default / tall pots with LOW relief (no-op gate → byte-identical defaults)', () => {
    // Default shape (R≈57, H≈120): 2πR/H ≈ 3, below the wide/flat gate.
    expect(computeUBias(new SyntheticCylinderSampler(57, 120))).toBe(0);
    // Tall-narrow: even further below.
    expect(computeUBias(new SyntheticCylinderSampler(40, 120))).toBe(0);
    // Gentle u-relief (low √E/√G) stays below the relief gate → still B=0.
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 2, 4))).toBe(0);
  });

  it('is the FIXED wide-bias for a wide/flat pot (short-wide H40/OD300 regime)', () => {
    // Short-wide shape (R≈145, H≈40): 2πR/H ≈ 22.8, well above the gate.
    expect(computeUBias(new SyntheticCylinderSampler(145, 40))).toBe(2);
  });

  it('does NOT scale the bias up with surface relief (the measured over-bias bug)', () => {
    // Same wide/flat shape, increasing relief amplitude/frequency: B stays fixed.
    // The old `round(log2(median(√E/√G)/AREF))` would climb to 3-4 here and inject
    // ~101-aspect grading-transition slivers (ArtDeco). The fixed bias must not.
    const plain = computeUBias(new SyntheticCylinderSampler(145, 40));
    expect(computeUBias(new SyntheticCylinderSampler(145, 40, 10, 16))).toBe(plain);
    expect(computeUBias(new SyntheticCylinderSampler(145, 40, 20, 40))).toBe(plain);
    expect(plain).toBe(2);
  });

  it('does NOT exceed the fixed bias even for an extreme wide/flat dish', () => {
    // 2πR/H ≈ 94 — far wider than short-wide — still the single fixed bias.
    expect(computeUBias(new SyntheticCylinderSampler(300, 20))).toBe(2);
  });

  it('brackets the gate threshold (2πR/H ≈ AREF·√2 ≈ 4.24)', () => {
    // Just below the wide/flat gate → no bias; just above → fixed bias.
    expect(computeUBias(new SyntheticCylinderSampler(80, 120))).toBe(0); // 2πR/H ≈ 4.19
    expect(computeUBias(new SyntheticCylinderSampler(85, 120))).toBe(2); // 2πR/H ≈ 4.45
  });

  it('is NOT fooled by t-direction relief (the Crystalline gate bug)', () => {
    // A wide/flat pot with strong ∂r/∂t relief: √G is inflated, so the old
    // `2π·r/√G` gate read it as tall (B=0 → residual slivers). The geometric gate
    // averages/ranges the relief away and correctly biases it.
    expect(computeUBias(new TReliefCylinderSampler(145, 40, 20, 6))).toBe(2);
    // And a TALL pot with the same relief still gets no bias (shape, not relief).
    expect(computeUBias(new TReliefCylinderSampler(40, 120, 20, 6))).toBe(0);
  });
});

describe('computeUBias — relief-gated bias at DEFAULT dims (the serration fix)', () => {
  // The high-strength serration is U-LONG surface anisotropy (∂r/∂u large at
  // steep relief → √E/√G ≫ 1) at DEFAULT (non-wide/flat) dims. uBias squares
  // those cells. This is ADDITIVE to the wide/flat dims bias and gated on the
  // u-anisotropy ratio (√E/√G), so it does NOT touch the short-wide regime (where
  // relief-scaled B caused construction slivers) — the !wideFlat branch only.
  it('biases a TALL pot with HIGH u-relief (the SuperformulaBlossom@high-strength case)', () => {
    // R57/H120 (tall, !wideFlat) + strong u-relief → √E/√G ≈ 7 > gate → B > 0.
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 8, 16))).toBeGreaterThanOrEqual(2);
    // Stronger relief → at most the cap (does not run away).
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 20, 24))).toBeLessThanOrEqual(4);
  });

  it('the relief bias APPLIES even with features (lifts the hasFeatures trap at default dims)', () => {
    // SuperformulaBlossom@high-strength carries crests (hasFeatures); uBias=3 was
    // measured watertight + crest-tracked. So relief-B must fire WITH features.
    const withFeat = computeUBias(new SyntheticCylinderSampler(57, 120, 8, 16), true);
    expect(withFeat).toBeGreaterThanOrEqual(2);
  });

  it('KEEPS the short-wide braid safety: wide/flat + features → B=0 (dims path unchanged)', () => {
    // A wide/flat pot WITH features stays B=0 (the CelticKnot braid-crack guard);
    // relief-B is the !wideFlat branch and never reaches here.
    expect(computeUBias(new SyntheticCylinderSampler(145, 40, 20, 16), true)).toBe(0);
    // Without features the wide/flat dims bias is the fixed value (unchanged).
    expect(computeUBias(new SyntheticCylinderSampler(145, 40, 20, 16), false)).toBe(2);
  });

  it('brackets the RELIEF_RATIO_GATE (maxURatio ≈ 6): just below → B=0, just above → B>0', () => {
    // TALL pot (R57/H120; with k=16 the wideFlat 16-sample scan reads r=R0+amp, so
    // wideFlat = 2π·(57+amp)/120 ≈ 3.3 < AREF·√2 — GATE A is OFF, this is GATE B).
    // k=16 lands the u-relief peak (u=1/64) EXACTLY on the 192² lattice (no aliasing),
    // so the measured worst √E/√G is analytic: maxURatio = 2π·√(k²·amp²+R0²)/H.
    //   amp=5.5 → 2π·√(256·30.25+3249)/120 ≈ 5.49  (just BELOW the 6 gate → no bias)
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 5.5, 16))).toBe(0);
    //   amp=7.0 → 2π·√(256·49+3249)/120     ≈ 6.58  (just ABOVE the 6 gate → bias fires)
    // Tight ±0.5 bracket around 6: catches a gate typo to 5 (5.49 would wrongly bias)
    // or to 7 (6.58 would wrongly return 0).
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 7, 16))).toBeGreaterThanOrEqual(1);
  });
});
