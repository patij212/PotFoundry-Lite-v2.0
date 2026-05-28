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
