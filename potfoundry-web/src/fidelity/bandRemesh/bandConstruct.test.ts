/**
 * bandConstruct.test.ts — analytic unit tests for the curvature-aware variable-width
 * band-construction module. Default CI (no PF_DERISK, no real detector pipeline).
 *
 * @module fidelity/bandRemesh/bandConstruct.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { StationPoint } from './stations';
import { measureSpineCurvatureRadius, safeHalfWidthProfile } from './bandConstruct';

describe('measureSpineCurvatureRadius', () => {
  it('is large on a near-straight spine and small at a sharp corner', () => {
    const flat = new SyntheticCylinderSampler(50, 100, 0, 0); // plain cylinder
    const straight: StationPoint[] = [
      { u: 0.40, t: 0.5 }, { u: 0.41, t: 0.5 }, { u: 0.42, t: 0.5 },
    ];
    const rStraight = measureSpineCurvatureRadius(straight, flat);
    // The cylinder curves in u, so the radius is finite but LARGE (~R0 order).
    expect(rStraight[1]).toBeGreaterThan(10);

    const corner: StationPoint[] = [
      { u: 0.40, t: 0.5 }, { u: 0.45, t: 0.5 }, { u: 0.45, t: 0.55 },
    ];
    const rCorner = measureSpineCurvatureRadius(corner, flat);
    expect(rCorner[1]).toBeLessThan(rStraight[1]);
    expect(rCorner[1]).toBeGreaterThan(0);
    // Endpoints carry no curvature.
    expect(rStraight[0]).toBe(Infinity);
    expect(rStraight[2]).toBe(Infinity);
  });
});

describe('safeHalfWidthProfile', () => {
  it('caps width to safety·R where R is small, uses target where R is large, and tapers corners', () => {
    const R = [Infinity, 10, 0.5, 10, Infinity]; // a tight pinch at index 2
    const w = safeHalfWidthProfile(R, 2.5, { safety: 0.8, taperRadius: 1 });
    expect(w.length).toBe(5);
    expect(w[2]).toBeCloseTo(0.4, 5); // 0.8 * 0.5
    // Neighbours are tapered DOWN toward the pinch (min-filter), not full target.
    const wNoTaper = safeHalfWidthProfile(R, 2.5, { safety: 0.8, taperRadius: 0 });
    expect(w[1]).toBeLessThanOrEqual(wNoTaper[1] + 1e-9);
    expect(w[1]).toBeLessThanOrEqual(2.5);
    // Far-from-pinch stations reach the target.
    const wNoPinch = safeHalfWidthProfile([Infinity, 10, 10, 10, Infinity], 2.5, { safety: 0.8 });
    expect(wNoPinch[2]).toBeCloseTo(2.5, 5); // min(2.5, 8) = 2.5
  });
});
