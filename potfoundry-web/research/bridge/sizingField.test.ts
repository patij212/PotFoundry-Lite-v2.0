import { describe, it, expect } from 'vitest';
import { buildIsotropicSizingField } from './sizingField';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

describe('buildIsotropicSizingField', () => {
  it('cylinder: uniform field == the analytic chord length sqrt(8·tol/((2π)²R))', () => {
    // A cylinder r=R is circumferentially curved (|S_uu|=(2π)²R) ⇒ it does NOT
    // saturate at hMax; its sizing equals the analytic chord length, in u-units.
    const R = 50, tolMm = 0.1;
    const rA: AnalyticRadiusFn = () => R;
    const f = buildIsotropicSizingField(rA, 120, { resU: 16, resT: 16, tolMm, hMin: 0.0005, hMax: 0.2 });
    expect(f.h.length).toBe(16 * 16);
    const expected = Math.sqrt((8 * tolMm) / (4 * Math.PI * Math.PI * R)); // ≈ 0.0201, inside [hMin,hMax]
    for (const v of f.h) expect(v).toBeCloseTo(expected, 3); // uniform + matches analytic
  });

  it('clamps to hMax when the curvature-derived length exceeds it', () => {
    const rA: AnalyticRadiusFn = () => 50; // analytic ≈0.0201 > hMax 0.01 → clamp
    const f = buildIsotropicSizingField(rA, 120, { resU: 8, resT: 8, tolMm: 0.1, hMin: 0.001, hMax: 0.01 });
    for (const v of f.h) expect(v).toBeCloseTo(0.01, 6);
  });

  it('fluted wall (high azimuthal curvature) → smaller mean h than a smooth cylinder', () => {
    const smooth: AnalyticRadiusFn = () => 50;
    const fluted: AnalyticRadiusFn = (theta) => 50 + 3 * Math.cos(12 * theta); // strong curvature
    const opts = { resU: 64, resT: 8, tolMm: 0.1, hMin: 0.0005, hMax: 0.2 };
    const hS = buildIsotropicSizingField(smooth, 120, opts).h;
    const hF = buildIsotropicSizingField(fluted, 120, opts).h;
    const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(hF)).toBeLessThan(mean(hS));
  });
});
