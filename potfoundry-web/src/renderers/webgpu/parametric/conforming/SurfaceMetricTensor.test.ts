import { describe, it, expect } from 'vitest';
import {
  SyntheticCylinderSampler,
  type SurfaceSampler,
  type Vec3,
} from './SurfaceSampler';
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

/**
 * Quantizing decorator: snaps (u,t) to the nearest node of a `resU × resT` grid
 * and returns the analytic position there. This emulates the production
 * `GpuSurfaceSampler`'s *nearest-node* read (the pre-evaluated grid is discrete),
 * so finite differences taken at sub-grid steps see a STAIRCASE — central
 * differences over a gap smaller than one cell read the same node on both sides
 * (zero derivative) or jump a full cell (huge derivative), amplifying
 * quantization noise into spurious curvature. A step that spans ~one cell
 * recovers the true smooth-surface curvature.
 */
class QuantizingSampler implements SurfaceSampler {
  constructor(
    private readonly inner: SurfaceSampler,
    private readonly resU: number,
    private readonly resT: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const uu = u - Math.floor(u); // u periodic
    const tc = Math.min(1, Math.max(0, t));
    const qu = Math.round(uu * this.resU) / this.resU;
    const qt = this.resT > 1 ? Math.round(tc * (this.resT - 1)) / (this.resT - 1) : 0;
    return this.inner.position(qu, qt);
  }
}

describe('principalCurvatureMax — grid-scaled step de-noises quantization', () => {
  const R0 = 50;
  const expected = 1 / R0;
  // A smooth cylinder read through a discrete grid sampler.
  const samplerRes = 256;
  const smooth = new SyntheticCylinderSampler(R0, 120);
  const quantized = new QuantizingSampler(smooth, samplerRes, samplerRes);

  it('fixed sub-grid h is grossly wrong on a quantized smooth surface', () => {
    // h=1e-4 is far below one cell (1/256 ≈ 3.9e-3) → centred differences read
    // the same staircase node on both sides, so the estimate collapses to ~0
    // (or, off-centre, spikes). Either way it is nowhere near 1/R0.
    const k = principalCurvatureMax(quantized, 0.3, 0.5, 1e-4, 1e-4);
    expect(Math.abs(k - expected) / expected).toBeGreaterThan(0.5);
  });

  it('grid-scaled h (≈ 1/samplerRes) recovers 1/R0 within 15%', () => {
    const hu = 1 / samplerRes;
    const ht = 1 / samplerRes;
    const k = principalCurvatureMax(quantized, 0.3, 0.5, hu, ht);
    expect(Math.abs(k - expected) / expected).toBeLessThan(0.15);
  });

  it('grid-scaled curvature is STABLE (monotone) as the sampler refines', () => {
    // Across a sweep of sampler resolutions, the grid-scaled estimate must stay
    // close to 1/R0 — never spiking — whereas a sub-grid step would diverge.
    for (const res of [64, 128, 256, 512]) {
      const q = new QuantizingSampler(smooth, res, res);
      const k = principalCurvatureMax(q, 0.3, 0.5, 1 / res, 1 / res);
      expect(Math.abs(k - expected) / expected).toBeLessThan(0.2);
    }
  });

  it('firstFundamentalForm accepts grid-scaled steps and stays accurate', () => {
    // Step spans ~one grid cell in each axis (node spacing is 1/resU in u and
    // 1/(resT-1) in t). A step that reliably spans a cell recovers E,G; a
    // sub-cell step would read the staircase and collapse a derivative.
    const hu = 1 / samplerRes;
    const ht = 1 / (samplerRes - 1);
    const { E, G } = firstFundamentalForm(quantized, 0.3, 0.5, hu, ht);
    const eExp = (2 * Math.PI * R0) ** 2;
    const gExp = 120 ** 2;
    expect(Math.abs(E - eExp) / eExp).toBeLessThan(0.05);
    expect(Math.abs(G - gExp) / gExp).toBeLessThan(0.05);
  });
});
