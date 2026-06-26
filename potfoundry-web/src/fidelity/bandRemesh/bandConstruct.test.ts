/**
 * bandConstruct.test.ts — analytic unit tests for the curvature-aware variable-width
 * band-construction module. Default CI (no PF_DERISK, no real detector pipeline).
 *
 * @module fidelity/bandRemesh/bandConstruct.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { StationPoint } from './stations';
import { measureSpineCurvatureRadius, safeHalfWidthProfile, offsetRailVariable, paveRidgeAdaptive, splitAtFoldPoints } from './bandConstruct';
import { auditWatertight } from './audit';

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

describe('offsetRailVariable', () => {
  it('offsets each station by its own width along the metric perpendicular', () => {
    const flat = new SyntheticCylinderSampler(50, 100, 0, 0);
    const spine: StationPoint[] = [{ u: 0.40, t: 0.5 }, { u: 0.45, t: 0.5 }, { u: 0.50, t: 0.5 }];
    const widths = [1, 2, 1];
    const rail = offsetRailVariable(spine, flat, widths, 1);
    expect(rail.length).toBe(3);
    const d = (a: StationPoint, b: StationPoint): number => {
      const pa = flat.position(a.u, a.t), pb = flat.position(b.u, b.t);
      return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
    };
    // The middle station (width 2) is offset farther from the spine than the ends (width 1).
    expect(d(rail[1], spine[1])).toBeGreaterThan(d(rail[0], spine[0]) + 0.5);
  });
});

describe('splitAtFoldPoints (approach C)', () => {
  it('splits a right-angle-corner spine at the corner into sub-spines sharing the corner vertex', () => {
    const spine: StationPoint[] = [{ u: 0.3, t: 0.3 }, { u: 0.5, t: 0.3 }, { u: 0.5, t: 0.55 }];
    const radius = [Infinity, 0.1, Infinity]; // the corner station folds a full-width offset
    const subs = splitAtFoldPoints(spine, radius, 0.8 * 3); // minRadius = 2.4
    expect(subs.length).toBe(2);
    // adjacent sub-spines SHARE the corner vertex (exact (u,t)).
    expect(subs[0][subs[0].length - 1]).toEqual(spine[1]);
    expect(subs[1][0]).toEqual(spine[1]);
    for (const s of subs) expect(s.length).toBeGreaterThanOrEqual(2);
  });

  it('returns the whole spine as one sub-spine when no station folds', () => {
    const spine: StationPoint[] = [{ u: 0.3, t: 0.3 }, { u: 0.4, t: 0.3 }, { u: 0.5, t: 0.3 }];
    const radius = [Infinity, 100, Infinity];
    const subs = splitAtFoldPoints(spine, radius, 0.8 * 3);
    expect(subs.length).toBe(1);
    expect(subs[0].length).toBe(3);
  });
});

describe('paveRidgeAdaptive', () => {
  it('produces a SIMPLE footprint + watertight band on a sharp right-angle corner spine (where constant width folds)', () => {
    const flat = new SyntheticCylinderSampler(50, 100, 0, 0);
    // An L-shaped spine with a sharp 90° corner — the constant-width failure case.
    const spine: StationPoint[] = [
      { u: 0.30, t: 0.30 }, { u: 0.50, t: 0.30 }, { u: 0.50, t: 0.55 },
    ];
    const res = paveRidgeAdaptive(spine, flat, { widthMm: 3, edgeMm: 2 });
    expect(res.selfCrossings).toBe(0); // simple footprint (the whole point)
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0); // band is internally watertight
    expect(res.mesh.indices.length).toBeGreaterThan(0);
  });
});
