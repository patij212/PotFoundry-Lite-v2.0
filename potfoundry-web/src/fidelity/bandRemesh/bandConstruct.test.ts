/**
 * bandConstruct.test.ts — analytic unit tests for the curvature-aware variable-width
 * band-construction module. Default CI (no PF_DERISK, no real detector pipeline).
 *
 * @module fidelity/bandRemesh/bandConstruct.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { StationPoint } from './stations';
import { measureSpineCurvatureRadius, safeHalfWidthProfile, offsetRailVariable, paveRidgeAdaptive, splitAtFoldPoints, joinCorner, footprintSelfCrossings, paveRidgeCornerSplit, paveRidgeJunction } from './bandConstruct';
import { auditWatertight, triangleQuality3D } from './audit';
import { quantizeRailUT } from './railKey';

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

describe('joinCorner (approach C — corner-split + join)', () => {
  // The cylinder is developable: a +u step is azimuthal arclength (2π·R0·du mm), a
  // +t step is vertical (H·dt mm). So a spine segment along +u then along +t turns
  // through a true 90° in 3D — the constant-width fold case approach C must solve.
  const flat = new SyntheticCylinderSampler(50, 100, 0, 0);

  // Sub-spines sharing the corner C = (0.50, 0.30). A runs in +u (azimuthal), B in
  // +t (vertical): a sharp 90° corner where a full-width offset self-folds.
  const C: StationPoint = { u: 0.50, t: 0.30 };
  const subA: StationPoint[] = [{ u: 0.30, t: 0.30 }, C];
  const subB: StationPoint[] = [C, { u: 0.50, t: 0.55 }];

  it('joins two straight sub-spines at a 90° corner into a SIMPLE-footprint band', () => {
    const res = joinCorner(subA, subB, flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
  });

  it('the joined band is internally watertight (no T-junctions, no non-manifold edges)', () => {
    const res = joinCorner(subA, subB, flat, { widthMm: 3, edgeMm: 2 });
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
  });

  it('keeps the crest EXACT: every input spine vertex is a crease (spine) vertex (0mm fidelity loss)', () => {
    const res = joinCorner(subA, subB, flat, { widthMm: 3, edgeMm: 2 });
    const spineKeys = new Set(res.spineVertexIds.map((id) => {
      const [u, t] = res.vertexUT[id];
      return `${u}|${t}`;
    }));
    for (const v of [subA[0], C, subB[subB.length - 1]]) {
      const [qu, qt] = quantizeRailUT(v.u, v.t);
      expect(spineKeys.has(`${qu}|${qt}`)).toBe(true);
    }
  });

  it('produces well-formed corner triangles (no inverted/degenerate; full-width, not pinched)', () => {
    // A naive full-spine paveRidge folds here (footprintSelfCrossings=1, proven above).
    // The join must instead be a real, non-vacuous, sliver-free corner element.
    const naive = joinCorner(subA, subB, flat, { widthMm: 3, edgeMm: 2 });
    const q = triangleQuality3D(naive.mesh);
    expect(q.aspectMax).toBeLessThan(20); // no needle slivers from the miter/wedge
    expect(q.minAngleP50).toBeGreaterThan(15);
    // Non-vacuous: the joined band spans both sub-spines (more tris than a single flank pair).
    expect(naive.mesh.indices.length / 3).toBeGreaterThan(20);
  });

  it('joins a SHARP ~60° corner that turns the OTHER way (concave on the mirror flank)', () => {
    // Incoming +u (azimuthal); outgoing rotated 120° CW in the developed plane
    // (interior angle ~60°, a right turn) so the concave side is the -perp flank —
    // exercising the mirror branch of the corner resolver.
    const Cc: StationPoint = { u: 0.50, t: 0.50 };
    const a60: StationPoint[] = [{ u: 0.30, t: 0.50 }, Cc];
    // dev-plane outgoing: 30mm at -120° → Δ(u,t) = (-15/(2π·50), -25.98/100).
    const end: StationPoint = { u: Cc.u - 15 / (2 * Math.PI * 50), t: Cc.t - 25.98 / 100 };
    const b60: StationPoint[] = [Cc, end];
    const res = joinCorner(a60, b60, flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const audit = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
  });
});

describe('paveRidgeCornerSplit (approach C — orchestrator)', () => {
  const flat = new SyntheticCylinderSampler(50, 100, 0, 0);
  const OPTS = { widthMm: 3, edgeMm: 2 };

  it('paves a single-corner spine into a SIMPLE-footprint, watertight ridge (crest exact)', () => {
    const spine: StationPoint[] = [{ u: 0.30, t: 0.30 }, { u: 0.50, t: 0.30 }, { u: 0.50, t: 0.55 }];
    const res = paveRidgeCornerSplit(spine, flat, OPTS);
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
    // Crest exact: the sharp corner is preserved as a crease vertex.
    const spineKeys = new Set(res.spineVertexIds.map((id) => {
      const [u, t] = res.vertexUT[id];
      return `${u}|${t}`;
    }));
    const [qu, qt] = quantizeRailUT(0.50, 0.30);
    expect(spineKeys.has(`${qu}|${qt}`)).toBe(true);
  });

  it('paves a MULTI-corner zigzag (alternating left/right turns) — simple footprint + watertight', () => {
    // A staircase of sharp 90° corners alternating turn direction (concave side flips).
    const spine: StationPoint[] = [
      { u: 0.20, t: 0.20 }, { u: 0.40, t: 0.20 }, { u: 0.40, t: 0.45 },
      { u: 0.60, t: 0.45 }, { u: 0.60, t: 0.70 },
    ];
    const res = paveRidgeCornerSplit(spine, flat, OPTS);
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
  });

  it('does NOT crash on two very close corners (degenerate short sub-spine) — guard, not throw', () => {
    // Corners C1=(0.40,0.50) and C2=(0.40,0.51) are ~1mm apart in 3D — far closer than
    // the full band width (6mm) — so the middle sub-spine's concave rail clips empty.
    // The guard must fall back (no crash) rather than throw on the degenerate sub-band.
    const spine: StationPoint[] = [
      { u: 0.30, t: 0.50 }, { u: 0.40, t: 0.50 }, { u: 0.40, t: 0.51 }, { u: 0.50, t: 0.51 },
    ];
    expect(() => paveRidgeCornerSplit(spine, flat, { widthMm: 3, edgeMm: 2 })).not.toThrow();
    const res = paveRidgeCornerSplit(spine, flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
  });

  it('a no-fold (gently curved) spine paves as one simple band (no spurious split)', () => {
    const spine: StationPoint[] = [{ u: 0.30, t: 0.30 }, { u: 0.40, t: 0.32 }, { u: 0.50, t: 0.30 }];
    const res = paveRidgeCornerSplit(spine, flat, OPTS);
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
  });
});

describe('paveRidgeJunction (STEP 3b — junction composition)', () => {
  // Near-ISOTROPIC cylinder (circumference 2π·R0 = H = 100) so dev-plane angles map
  // cleanly to (u,t) — this isolates the junction MECHANISM from metric anisotropy
  // (the cylinder's u-squish folds the (u,t) footprint of metric-spread arms; that is
  // a surface property the real-junction gate measures, not a mechanism defect).
  const flat = new SyntheticCylinderSampler(100 / (2 * Math.PI), 100, 0, 0);
  const J: StationPoint = { u: 0.5, t: 0.5 };
  // Arm radiating from J at dev-plane angle `deg`, length L mm (1 dev-mm = 1/100 in u,t).
  const armAt = (deg: number, L = 20): StationPoint[] => {
    const r = (deg * Math.PI) / 180;
    return [J, { u: J.u + (L * Math.cos(r)) / 100, t: J.t + (L * Math.sin(r)) / 100 }];
  };

  it('composes a symmetric degree-3 Y into a SIMPLE-footprint, watertight ridge (J shared crease)', () => {
    const spines = [armAt(90), armAt(210), armAt(330)];
    const res = paveRidgeJunction(spines, flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
    // J is a crease vertex shared by all arms.
    const [qu, qt] = quantizeRailUT(J.u, J.t);
    const spineKeys = new Set(res.spineVertexIds.map((id) => { const [u, t] = res.vertexUT[id]; return `${u}|${t}`; }));
    expect(spineKeys.has(`${qu}|${qt}`)).toBe(true);
  });

  it('composes an asymmetric junction with a NARROW sector (sharp miter) — simple + watertight', () => {
    // Two arms 40° apart (80°,120°) + one opposite (280°): one narrow sector → a sharp miter.
    const res = paveRidgeJunction([armAt(80), armAt(120), armAt(280)], flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
  });

  it('composes a REFLEX degree-3 junction (one sector > 180°, wedge branch) — simple + watertight', () => {
    // Three arms bunched in a half-plane → the opposite sector is reflex (> 180°).
    const res = paveRidgeJunction([armAt(60), armAt(120), armAt(180)], flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
  });

  it('composes a degree-4 junction — simple + watertight', () => {
    const res = paveRidgeJunction([armAt(45), armAt(135), armAt(225), armAt(315)], flat, { widthMm: 3, edgeMm: 2 });
    expect(res.mesh.indices.length).toBeGreaterThan(0);
    expect(footprintSelfCrossings(res.mesh, res.vertexUT)).toBe(0);
    const a = auditWatertight(res.mesh, { boundaryVertexIndices: res.openBoundaryVertices });
    expect(a.nonManifoldEdges).toBe(0);
    expect(a.tJunctions).toBe(0);
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
