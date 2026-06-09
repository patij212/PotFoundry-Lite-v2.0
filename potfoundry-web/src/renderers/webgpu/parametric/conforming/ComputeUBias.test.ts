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
  it('is 0 for default / tall pots (the no-op gate that keeps default meshes byte-identical)', () => {
    // Default shape (R≈57, H≈120): 2πR/H ≈ 3, below the wide/flat gate.
    expect(computeUBias(new SyntheticCylinderSampler(57, 120))).toBe(0);
    // Tall-narrow: even further below.
    expect(computeUBias(new SyntheticCylinderSampler(40, 120))).toBe(0);
    // Relief does not trip the gate (it is computed from the shape, not ∂r/∂u).
    expect(computeUBias(new SyntheticCylinderSampler(57, 120, 8, 16))).toBe(0);
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
