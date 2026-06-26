// potfoundry-web/research/bridge/sizingField.test.ts
import { describe, it, expect } from 'vitest';
import { buildIsotropicSizingField } from './sizingField';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

describe('buildIsotropicSizingField', () => {
  it('cylinder (zero curvature) → field saturates at hMax everywhere', () => {
    const rA: AnalyticRadiusFn = () => 50;
    const f = buildIsotropicSizingField(rA, 120, { resU: 16, resT: 16, tolMm: 0.1, hMin: 0.005, hMax: 0.2 });
    expect(f.h.length).toBe(16 * 16);
    for (const v of f.h) expect(v).toBeCloseTo(0.2, 6);
  });

  it('fluted wall (high azimuthal curvature) → field is smaller than a smooth wall', () => {
    const smooth: AnalyticRadiusFn = () => 50;
    const fluted: AnalyticRadiusFn = (theta) => 50 + 3 * Math.cos(12 * theta); // strong κ
    const opts = { resU: 32, resT: 8, tolMm: 0.1, hMin: 0.001, hMax: 0.2 };
    const hS = buildIsotropicSizingField(smooth, 120, opts).h;
    const hF = buildIsotropicSizingField(fluted, 120, opts).h;
    const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(hF)).toBeLessThan(mean(hS));
  });
});
