import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { firstFundamentalForm, principalCurvatureMax } from './SurfaceMetricTensor';

describe('firstFundamentalForm (plain cylinder R0=50, H=120)', () => {
  const s = new SyntheticCylinderSampler(50, 120);

  it('E = |dP/du|^2 ≈ (2π·R0)^2', () => {
    const { E } = firstFundamentalForm(s, 0.3, 0.5);
    const expected = (2 * Math.PI * 50) ** 2;
    expect(E).toBeCloseTo(expected, -1); // within ~1%: relative tolerance asserted below
    expect(Math.abs(E - expected) / expected).toBeLessThan(0.01);
  });

  it('G = |dP/dt|^2 ≈ H^2', () => {
    const { G } = firstFundamentalForm(s, 0.3, 0.5);
    const expected = 120 ** 2;
    expect(Math.abs(G - expected) / expected).toBeLessThan(0.01);
  });

  it('F = dP/du·dP/dt ≈ 0', () => {
    const { F } = firstFundamentalForm(s, 0.3, 0.5);
    expect(Math.abs(F)).toBeLessThan(1e-3);
  });
});

describe('principalCurvatureMax (plain cylinder R0=50)', () => {
  it('≈ 1/R0 within 5%', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const k = principalCurvatureMax(s, 0.3, 0.5);
    const expected = 1 / 50;
    expect(Math.abs(k - expected) / expected).toBeLessThan(0.05);
  });
});
