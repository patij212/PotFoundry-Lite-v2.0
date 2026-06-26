/**
 * bandConstruct.test.ts — analytic unit tests for the curvature-aware variable-width
 * band-construction module. Default CI (no PF_DERISK, no real detector pipeline).
 *
 * @module fidelity/bandRemesh/bandConstruct.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { StationPoint } from './stations';
import { measureSpineCurvatureRadius } from './bandConstruct';

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
