import { describe, expect, it } from 'vitest';
import { buildRadialReference } from './metrics';

const TAU = 2 * Math.PI;

/** Dense cylinder: constant radius R over height [0, H]. */
function denseCylinder(R: number, H: number, nTheta: number, nZ: number): Float32Array {
  const verts: number[] = [];
  for (let j = 0; j < nZ; j++) {
    const z = (j / (nZ - 1)) * H;
    for (let i = 0; i < nTheta; i++) {
      const th = (i / nTheta) * TAU;
      verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
    }
  }
  return new Float32Array(verts);
}

describe('buildRadialReference', () => {
  it('recovers a constant radius for a dense cylinder', () => {
    // Oversample to fully populate the default 720x400 bin grid (no empty cells).
    const ref = buildRadialReference(denseCylinder(40, 100, 1440, 800));
    expect(ref.binThetaRad).toBeGreaterThan(0);
    expect(ref.binZmm).toBeGreaterThan(0);
    // Sample at arbitrary (theta, z) — must return ~40.
    for (const [th, z] of [[0.1, 5], [1.7, 50], [5.9, 95]] as const) {
      expect(ref.rTrue(th, z)).toBeCloseTo(40, 3);
    }
  });

  it('captures a linearly varying radius (cone) within bin resolution', () => {
    // Cone: R grows from 20 at z=0 to 60 at z=100. Oversample (1440x800) to
    // fully populate the default 720x400 grid so no empty-cell dilation biases
    // the bilinear sample.
    const verts: number[] = [];
    for (let j = 0; j < 800; j++) {
      const z = (j / 799) * 100;
      const R = 20 + (60 - 20) * (z / 100);
      for (let i = 0; i < 1440; i++) {
        const th = (i / 1440) * TAU;
        verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
      }
    }
    const ref = buildRadialReference(new Float32Array(verts));
    expect(ref.rTrue(2.0, 50)).toBeCloseTo(40, 1);
    expect(ref.rTrue(2.0, 25)).toBeCloseTo(30, 1);
  });
});

import { sagDeviation } from './metrics';

const TAU2 = 2 * Math.PI;

/** Faceted cylinder (flat side quads) of radius R, nSides around, 1 tall band. */
function facetedCylinder(R: number, H: number, nSides: number): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  for (let j = 0; j < 2; j++) {
    const z = j * H;
    for (let i = 0; i < nSides; i++) {
      const th = (i / nSides) * TAU2;
      verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < nSides; i++) {
    const a = i;
    const b = (i + 1) % nSides;
    const c = i + nSides;
    const d = ((i + 1) % nSides) + nSides;
    idx.push(a, b, c, b, d, c);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

describe('sagDeviation', () => {
  it('reports near-zero sag when the mesh lies on the reference surface', () => {
    const R = 40;
    const mesh = facetedCylinder(R, 100, 256); // many sides → near-smooth
    const rTrue = () => R;
    const out = sagDeviation(mesh, rTrue, 4);
    // A 256-gon's flat-chord dip from the true circle is tiny.
    expect(out.maxSagMm).toBeLessThan(0.05);
    expect(out.rmsSagMm).toBeLessThanOrEqual(out.maxSagMm);
  });

  it('reports the chord sag of a coarse faceted cylinder', () => {
    const R = 40;
    const nSides = 8;
    const mesh = facetedCylinder(R, 100, nSides);
    const rTrue = () => R;
    const out = sagDeviation(mesh, rTrue, 6);
    // Max chord sag of a regular n-gon ≈ R(1 - cos(π/n)).
    const expectedMax = R * (1 - Math.cos(Math.PI / nSides));
    expect(out.maxSagMm).toBeGreaterThan(expectedMax * 0.5);
    expect(out.maxSagMm).toBeLessThanOrEqual(expectedMax + 1e-6);
  });
});

import { triangleQuality3D } from './metrics';

describe('triangleQuality3D', () => {
  it('rates an equilateral triangle as near-ideal', () => {
    const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, Math.sqrt(3) / 2, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const out = triangleQuality3D({ vertices, indices });
    expect(out.maxAspect3D).toBeCloseTo(1, 1);
    expect(out.minAngleDeg).toBeGreaterThan(59);
    expect(out.sliverCount).toBe(0);
  });

  it('flags a needle sliver with high aspect and tiny min angle', () => {
    const vertices = new Float32Array([0, 0, 0, 100, 0, 0, 50, 0.05, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const out = triangleQuality3D({ vertices, indices });
    expect(out.maxAspect3D).toBeGreaterThan(100);
    expect(out.minAngleDeg).toBeLessThan(1);
    expect(out.sliverCount).toBe(1);
  });
});

import { topologyMetric } from './metrics';

function closedCube(): { vertices: Float32Array; indices: Uint32Array } {
  return {
    vertices: new Float32Array([
      -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
      -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]),
  };
}

describe('topologyMetric', () => {
  it('reports a closed oriented cube as watertight', () => {
    const out = topologyMetric(closedCube(), 1e-4);
    expect(out.boundaryEdges).toBe(0);
    expect(out.nonManifoldEdges).toBe(0);
    expect(out.orientationMismatches).toBe(0);
  });

  it('reports boundary edges for an open quad', () => {
    const mesh = {
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    };
    const out = topologyMetric(mesh, 1e-4);
    expect(out.boundaryEdges).toBeGreaterThan(0);
  });

  it('detects winding mismatches on a flipped face', () => {
    const mesh = closedCube();
    const flipped = new Uint32Array(mesh.indices);
    flipped[3] = 0; flipped[4] = 2; flipped[5] = 3; // flip second triangle
    const out = topologyMetric({ vertices: mesh.vertices, indices: flipped }, 1e-4);
    expect(out.orientationMismatches).toBeGreaterThan(0);
  });
});

import { computeFidelityMetrics } from './metrics';

describe('computeFidelityMetrics', () => {
  it('assembles a full metrics row from a mesh + dense reference', () => {
    const R = 40;
    const dense = denseCylinder(R, 100, 360, 200);
    const mesh = facetedCylinder(R, 100, 64);
    const row = computeFidelityMetrics({
      styleId: 'TestCylinder',
      mesh,
      denseVertices: dense,
      features: { expected: 5, present: 5 },
      weldToleranceMm: 1e-4,
      sagSampleOrder: 4,
    });
    expect(row.styleId).toBe('TestCylinder');
    expect(row.triangleCount).toBe(mesh.indices.length / 3);
    expect(row.maxSagMm).toBeGreaterThanOrEqual(0);
    expect(row.maxAspect3D).toBeGreaterThan(0);
    expect(row.featuresExpected).toBe(5);
    expect(row.featuresDropped).toBe(0);
    expect(row.sagReferenceBinThetaRad).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Hardening: input guards, z-boundary accuracy, degenerate-triangle isolation,
// and non-manifold detection. These pin the measurement instrument so its
// output can serve as the SP0 acceptance baseline.
// ---------------------------------------------------------------------------

/** Dense cone: R = R0 + (R1-R0)*(z/H) over height [0, H]. */
function denseCone(R0: number, R1: number, H: number, nTheta: number, nZ: number): Float32Array {
  const verts: number[] = [];
  for (let j = 0; j < nZ; j++) {
    const z = (j / (nZ - 1)) * H;
    const R = R0 + (R1 - R0) * (z / H);
    for (let i = 0; i < nTheta; i++) {
      const th = (i / nTheta) * TAU;
      verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
    }
  }
  return new Float32Array(verts);
}

describe('buildRadialReference guards & boundaries', () => {
  it('throws a clear error on an empty dense reference', () => {
    expect(() => buildRadialReference(new Float32Array([]))).toThrow();
  });

  it('throws when bin dimensions are degenerate (< 2)', () => {
    expect(() => buildRadialReference(denseCylinder(40, 100, 1440, 800), { zBins: 1 })).toThrow();
    expect(() => buildRadialReference(denseCylinder(40, 100, 1440, 800), { thetaBins: 1 })).toThrow();
  });

  it('is accurate at z boundaries with no half-bin bias against the gradient', () => {
    // Coarse z-bins (40 over H=100 → 2.5mm bins) with ~20 samples/bin so each
    // cell centroid sits at the cell center. A naive boundary clamp biases the
    // rim/base by ~0.5mm (half a bin × the 0.4 mm/mm cone gradient); correct
    // linear extrapolation at the extremes drives that to well under 0.1mm.
    const ref = buildRadialReference(denseCone(20, 60, 100, 360, 800), {
      thetaBins: 180,
      zBins: 40,
    });
    expect(Math.abs(ref.rTrue(2.0, 0) - 20)).toBeLessThan(0.1);
    expect(Math.abs(ref.rTrue(2.0, 100) - 60)).toBeLessThan(0.1);
  });
});

describe('triangleQuality3D degenerate isolation', () => {
  it('keeps maxAspect finite and excludes a degenerate triangle from the good min angle', () => {
    const vertices = new Float32Array([
      0, 0, 0, 1, 0, 0, 0.5, Math.sqrt(3) / 2, 0, // good equilateral
      0, 0, 0, 1, 0, 0, 2, 0, 0,                  // degenerate (collinear, zero area)
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const out = triangleQuality3D({ vertices, indices });
    expect(Number.isFinite(out.maxAspect3D)).toBe(true);
    expect(out.sliverCount).toBe(1);
    // minAngle must reflect the good equilateral (~60°), not be pinned to 0.
    expect(out.minAngleDeg).toBeGreaterThan(59);
  });
});

describe('topologyMetric non-manifold detection', () => {
  it('flags an edge shared by three triangles', () => {
    const vertices = new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1,
    ]);
    // Edge 0–1 is shared by all three triangles → non-manifold.
    const indices = new Uint32Array([0, 1, 2, 0, 1, 3, 0, 1, 4]);
    const out = topologyMetric({ vertices, indices }, 1e-4);
    expect(out.nonManifoldEdges).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Surface-aware sag: the radial metric (|hypot(x,y) − R(θ,z)|) is degenerate on
// horizontal surfaces (base/drain/rim), where many radii map to one (θ,z) bin —
// it reports large false "sag" on a geometrically perfect flat disc. The fix
// classifies each test triangle by face normal: near-horizontal triangles are
// measured by true nearest-surface (point-to-triangle) distance against the
// dense reference; vertical wall triangles keep the radial metric.
// ---------------------------------------------------------------------------

import { buildNearestSurface } from './metrics';

/** Triangle-fan disc of radius R at height z (center vertex + ring). Horizontal. */
function flatDisc(R: number, z: number, nSides: number): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [0, 0, z]; // center = index 0
  for (let i = 0; i < nSides; i++) {
    const th = (i / nSides) * TAU;
    verts.push(Math.cos(th) * R, Math.sin(th) * R, z);
  }
  const idx: number[] = [];
  for (let i = 0; i < nSides; i++) {
    idx.push(0, 1 + i, 1 + ((i + 1) % nSides));
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

/** Single-band frustum: ring of radius Rb at z=0 up to Rt at z=H. Sloped facets. */
function coneFrustum(Rb: number, Rt: number, H: number, nSides: number): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  for (let i = 0; i < nSides; i++) {
    const th = (i / nSides) * TAU;
    verts.push(Math.cos(th) * Rb, Math.sin(th) * Rb, 0);
  }
  for (let i = 0; i < nSides; i++) {
    const th = (i / nSides) * TAU;
    verts.push(Math.cos(th) * Rt, Math.sin(th) * Rt, H);
  }
  const idx: number[] = [];
  for (let i = 0; i < nSides; i++) {
    const a = i;
    const b = (i + 1) % nSides;
    const c = i + nSides;
    const d = ((i + 1) % nSides) + nSides;
    idx.push(a, b, c, b, d, c);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

describe('buildNearestSurface', () => {
  it('reports ~0 distance on the surface and ~d² at height d', () => {
    const disc = flatDisc(40, 0, 64);
    const surf = buildNearestSurface(disc.vertices, disc.indices);
    // Point lying on the disc plane within its radius → distance 0.
    expect(surf.nearestDist2(10, 0, 0)).toBeLessThan(1e-4);
    // Point 5mm above the disc → squared distance ≈ 25.
    expect(surf.nearestDist2(10, 0, 5)).toBeCloseTo(25, 1);
  });
});

describe('sagDeviation surface-aware horizontal path', () => {
  it('radial metric reports false sag on a perfect flat disc; surface-aware reads ~0', () => {
    const disc = flatDisc(40, 0, 64);
    const surf = buildNearestSurface(disc.vertices, disc.indices);
    const rTrue = () => 40; // single-valued radial model is wrong for a disc
    const radial = sagDeviation(disc, rTrue, 4);
    const aware = sagDeviation(disc, rTrue, 4, surf);
    // Radial wrongly sees ~30mm because interior points have r far below 40.
    expect(radial.maxSagMm).toBeGreaterThan(10);
    // Surface-aware correctly sees the disc lying exactly on the reference.
    expect(aware.maxSagMm).toBeLessThan(0.5);
  });

  it('surface-aware path catches a real displacement (disc lifted to z=20)', () => {
    const refDisc = flatDisc(40, 0, 64);
    const surf = buildNearestSurface(refDisc.vertices, refDisc.indices);
    const testDisc = flatDisc(40, 20, 64);
    const rTrue = () => 40;
    const aware = sagDeviation(testDisc, rTrue, 4, surf);
    expect(aware.maxSagMm).toBeCloseTo(20, 0);
    expect(aware.rmsSagMm).toBeCloseTo(20, 0);
  });

  it('leaves vertical wall triangles on the radial path (surface arg ignored)', () => {
    const mesh = facetedCylinder(40, 100, 8); // vertical facets, radial normals
    const disc = flatDisc(40, 0, 64);
    const surf = buildNearestSurface(disc.vertices, disc.indices);
    const rTrue = () => 40;
    const without = sagDeviation(mesh, rTrue, 6);
    const withSurf = sagDeviation(mesh, rTrue, 6, surf);
    expect(withSurf.maxSagMm).toBeCloseTo(without.maxSagMm, 10);
    expect(withSurf.rmsSagMm).toBeCloseTo(without.rmsSagMm, 10);
  });

  it('measures SLOPED surfaces by nearest-surface, not radial (the foot/fillet band)', () => {
    // A 45°-sloped frustum (Rt-Rb == H) has |n_z|/|n| ≈ 0.707 — non-vertical, so
    // the radial r=R(θ,z) model is degenerate there. The nearest-surface path
    // sees the test surface lying on the matching reference (~0); the radial path,
    // given a deliberately-wrong rTrue, reports a large false sag.
    const ref = coneFrustum(20, 60, 40, 96);
    const surf = buildNearestSurface(ref.vertices, ref.indices);
    const test = coneFrustum(20, 60, 40, 96); // coincident facets
    const wrongRadial = () => 0; // intentionally wrong single-valued model
    const aware = sagDeviation(test, wrongRadial, 4, surf);
    const radial = sagDeviation(test, wrongRadial, 4);
    expect(aware.maxSagMm).toBeLessThan(0.5);
    expect(radial.maxSagMm).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Spatial-hash + near-vertical inclusion contract for buildNearestSurface.
//
// These pin the OBSERVABLE behavior across the planned 3D-cell hash refactor
// (the XY-only hash stacks the whole dense wall into a few columns → quadratic
// per-query cost; a 3D hash distributes vertical-wall triangles by z so the
// outer-wall bottom rows can be measured honestly in a feasible runtime).
//
//   1. DEFAULT options exclude near-vertical reference triangles → a pure
//      vertical wall yields an EMPTY index → nearestDist2 == Infinity. This is
//      the property that keeps the production sag path (computeFidelityMetrics,
//      default options) byte-identical: vertical walls stay on the radial path.
//   2. With minNonVerticalCos:0 the vertical wall IS indexed and measured by
//      true point-to-triangle distance at every height — on-wall ≈ 0, a 3mm
//      radial offset ≈ 9 mm². This must hold at low / mid / high z, which is
//      exactly what the 3D-cell distribution has to preserve.
// ---------------------------------------------------------------------------
describe('buildNearestSurface vertical-wall inclusion contract', () => {
  it('DEFAULT options exclude near-vertical walls → empty index → Infinity', () => {
    const wall = facetedCylinder(40, 100, 64);
    const surf = buildNearestSurface(wall.vertices, wall.indices);
    expect(surf.nearestDist2(40, 0, 50)).toBe(Infinity);
  });

  it('minNonVerticalCos:0 measures the wall honestly at every height', () => {
    const wall = facetedCylinder(40, 100, 128);
    const surf = buildNearestSurface(wall.vertices, wall.indices, { minNonVerticalCos: 0 });
    for (const zc of [5, 50, 95]) {
      // On the wall near θ=0 (128-gon chord dip is sub-mm) → ~0.
      expect(surf.nearestDist2(40, 0, zc)).toBeLessThan(0.05);
      // 3mm radially outside / inside the wall → squared distance ≈ 9.
      expect(surf.nearestDist2(43, 0, zc)).toBeCloseTo(9, 0);
      expect(surf.nearestDist2(37, 0, zc)).toBeCloseTo(9, 0);
    }
  });
});
