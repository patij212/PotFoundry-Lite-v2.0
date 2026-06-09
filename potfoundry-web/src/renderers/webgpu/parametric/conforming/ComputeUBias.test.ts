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
import { computeUBias } from './WatertightAssembly';
import { SyntheticCylinderSampler } from './SurfaceSampler';

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

  it('brackets the gate threshold (2πR/√G ≈ AREF·√2 ≈ 4.24)', () => {
    // Just below the wide/flat gate → no bias; just above → fixed bias.
    expect(computeUBias(new SyntheticCylinderSampler(80, 120))).toBe(0); // 2πR/H ≈ 4.19
    expect(computeUBias(new SyntheticCylinderSampler(85, 120))).toBe(2); // 2πR/H ≈ 4.45
  });
});
