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
  it('biases default pots to B=1 (moderate base anisotropy) but leaves tall-narrow at B=0', () => {
    // RE-BASELINE 2026-06-10 (clean-CAD triangle quality): GATE B now fires at
    // DEFAULT dims. Default shape (R≈57, H≈120): maxURatio = 2πR/H ≈ 2.98 →
    // B=round(log2(2.98/√3))=1, squaring the ~3:1 cells (median min-angle 19°→33°,
    // MEASURED). Was B=0 (byte-identical) before the re-baseline.
    expect(computeUBias(new SyntheticCylinderSampler(57, 120))).toBe(1);
    // Tall-narrow (maxURatio ≈ 2.09 < √2·√3 ≈ 2.45): genuinely low anisotropy → B=0.
    expect(computeUBias(new SyntheticCylinderSampler(40, 120))).toBe(0);
    // Gentle u-relief lifts maxURatio to ≈3.1 → B=1.
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 2, 4))).toBe(1);
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

  it('brackets the GATE A wide/flat threshold (2πR/H ≈ AREF·√2 ≈ 4.24): GATE B below, GATE A above', () => {
    // Just below the wide/flat gate → GATE B anisotropy bias (maxURatio 4.19 → B=1);
    // just above → the fixed GATE A wide bias (B=2). (Pre-re-baseline the below
    // case was B=0.)
    expect(computeUBias(new SyntheticCylinderSampler(80, 120))).toBe(1); // 2πR/H ≈ 4.19 (GATE B)
    expect(computeUBias(new SyntheticCylinderSampler(85, 120))).toBe(2); // wideFlat 4.45 → GATE A
  });

  it('is NOT fooled by t-direction relief (the Crystalline gate bug)', () => {
    // A wide/flat pot with strong ∂r/∂t relief: √G is inflated, so the old
    // `2π·r/√G` gate read it as tall (B=0 → residual slivers). The geometric gate
    // averages/ranges the relief away and correctly biases it.
    expect(computeUBias(new TReliefCylinderSampler(145, 40, 20, 6))).toBe(2);
    // A TALL pot with the same relief gets no GATE-A (wide/flat) bias, but GATE B
    // now fires on the u-anisotropy at the wide relief-PEAK bands (maxURatio ≈ 3.1 →
    // B=1) — squaring those bands is correct (re-baseline).
    expect(computeUBias(new TReliefCylinderSampler(40, 120, 20, 6))).toBe(1);
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

  it('TEMPORARY containment (Stage 0): caps GATE B at 2 for feature-inserting styles', () => {
    // High u-relief sampler that reads B>=3 without features (the maxURatio ~12
    // class; k=16 lands the relief peak on the 192² lattice → maxURatio ≈ 12.1,
    // MEASURED). B-sweep verdict (e2e/baselines/b-sweep-2026-06.json): auto-B=3 is
    // NON-MANIFOLD on CDT-insertion styles (SFB@1: nonMan=3, sliver=2285) while B=2
    // is clean with no true-instrument crest loss — so the hasFeatures path is
    // capped at 2 until Stage 3's gate lifts it.
    const hot = new SyntheticCylinderSampler(57, 120, 14, 16);
    expect(computeUBias(hot, false)).toBeGreaterThanOrEqual(3); // plain path keeps full B
    expect(computeUBias(hot, true)).toBe(2); // CDT-insertion path capped
  });

  it('B climbs continuously with u-relief (the self-calibrating serration bias)', () => {
    // TALL pot (R57/H120; with k=16 the wideFlat 16-sample scan reads r=R0+amp, so
    // wideFlat ≈ 3.3 < AREF·√2 — GATE A is OFF, this is GATE B). k=16 lands the
    // u-relief peak (u=1/64) EXACTLY on the 192² lattice (no aliasing), so the worst
    // √E/√G is analytic: maxURatio = 2π·√(k²·amp²+R0²)/H.
    //   amp=5.5 → maxURatio ≈ 5.49 → round(log2(5.49/√3)) = 2
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 5.5, 16))).toBe(2);
    //   amp=7.0 → maxURatio ≈ 6.58 → B = 2 (climbs toward the serration B=3 at 11.8)
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 7, 16))).toBeGreaterThanOrEqual(2);
  });
});
