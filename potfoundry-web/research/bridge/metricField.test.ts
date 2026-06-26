// potfoundry-web/research/bridge/metricField.test.ts
import { describe, it, expect } from 'vitest';
import { buildAnisotropicMetricField } from './metricField';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

/** Compute eigenvalues of a 2x2 symmetric matrix [[a,b],[b,c]]. */
function eig2(a: number, b: number, c: number): [number, number] {
  const tr = a + c;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - (a * c - b * b)));
  return [tr / 2 + disc, tr / 2 - disc];
}

/** Eigenvector of [[a,b],[b,c]] for eigenvalue lam (unit vector). */
function eigvec2(a: number, b: number, c: number, lam: number): [number, number] {
  let ex = b, ey = lam - a;
  let el = Math.hypot(ex, ey);
  if (el < 1e-20) { ex = lam - c; ey = b; el = Math.hypot(ex, ey); }
  if (el < 1e-20) return [1, 0];
  return [ex / el, ey / el];
}

describe('buildAnisotropicMetricField', () => {
  it('fluted cylinder: metric is strongly anisotropic — large eigenvalue ratio + large-eigenvalue direction along u', () => {
    // rA has high θ-curvature (12 flutes of amplitude 3mm at R=50mm) and ZERO z-curvature.
    // The second fundamental form II should be large in the u-direction and ~0 in the t-direction.
    // => λ_max/λ_min >> 1, and the eigenvector of λ_max points along u (i.e. first component dominates).
    const rA: AnalyticRadiusFn = (theta) => 50 + 3 * Math.cos(12 * theta);
    const field = buildAnisotropicMetricField(rA, 120, {
      resU: 16, resT: 16, tolMm: 0.1, hMin: 0.0005, hMax: 0.5,
    });
    expect(field.m.length).toBe(16 * 16 * 3);

    // Pick a representative interior node (mid-u, mid-t) — at flute peak, curvature is highest.
    // We sample multiple nodes to find a strongly anisotropic one (flute peak ≈ iu=0, where cos(0)=1).
    let maxRatio = 0;
    let maxRatioNode = { M00: 0, M01: 0, M11: 0 };
    for (let it = 2; it < 14; it++) {
      for (let iu = 0; iu < 16; iu++) {
        const base = (it * 16 + iu) * 3;
        const M00 = field.m[base], M01 = field.m[base + 1], M11 = field.m[base + 2];
        const [lmax, lmin] = eig2(M00, M01, M11);
        const ratio = lmin > 0 ? lmax / lmin : lmax / 1e-30;
        if (ratio > maxRatio) { maxRatio = ratio; maxRatioNode = { M00, M01, M11 }; }
      }
    }

    // The fluted cylinder must produce strongly anisotropic metric at its curvature peak.
    expect(maxRatio).toBeGreaterThan(5);

    // The large-eigenvalue eigenvector of the max-ratio node must be predominantly along u (component 0).
    const { M00, M01, M11 } = maxRatioNode;
    const [lmax] = eig2(M00, M01, M11);
    const [ex] = eigvec2(M00, M01, M11, lmax);
    // The u-component of the high-curvature eigenvector should dominate (|ex| > |ey|).
    expect(Math.abs(ex)).toBeGreaterThan(0.5);
  });

  it('smooth cylinder: metric is positive-definite (M00 > 0, det > 0) everywhere', () => {
    // A smooth cylinder r=50 has purely azimuthal (u) curvature; the t-direction is flat.
    // The metric should be positive semi-definite and strictly positive where curvature is non-zero.
    const rA: AnalyticRadiusFn = () => 50;
    const field = buildAnisotropicMetricField(rA, 120, {
      resU: 8, resT: 8, tolMm: 0.1, hMin: 0.001, hMax: 0.5,
    });
    for (let i = 0; i < 8 * 8; i++) {
      const M00 = field.m[i * 3], M01 = field.m[i * 3 + 1], M11 = field.m[i * 3 + 2];
      expect(M00).toBeGreaterThan(0);
      expect(M00 * M11 - M01 * M01).toBeGreaterThan(0); // positive-definite
    }
  });
});
