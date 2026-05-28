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
