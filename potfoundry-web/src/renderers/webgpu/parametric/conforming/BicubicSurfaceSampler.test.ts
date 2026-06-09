/**
 * BicubicSurfaceSampler.test.ts — guards the C1 Catmull-Rom reconstruction used as
 * the FAITHFUL serration-metric reference.
 *
 * The bilinear {@link GpuSurfaceSampler} is C0: its derivative jumps at every cell
 * boundary, so the metric's 2D-Newton (angle,z)→(u,t) inversion gets NOISIER near a
 * sharp cusp as the grid is refined (the measured non-monotonic crestRms at high
 * reference resolution). A bicubic (Catmull-Rom) reconstruction over the SAME grid
 * is C1 with O(h^4) interpolation error (vs bilinear O(h^2)) — it both de-noises the
 * inversion and tracks the smooth surface far closer between nodes. These guards pin
 * the properties the metric relies on: interpolatory at nodes, exact on affine data,
 * strictly more accurate than bilinear on a curved surface, periodic in u, clamped
 * in t.
 */
import { describe, it, expect } from 'vitest';
import type { Vec3 } from './SurfaceSampler';
import { GpuSurfaceSampler, SyntheticCylinderSampler } from './SurfaceSampler';
import { BicubicSurfaceSampler } from './BicubicSurfaceSampler';

/** Sample an analytic surface onto a row-major (resU×resT) position grid (the
 *  same layout GpuSurfaceSampler/BicubicSurfaceSampler consume). */
function gridFrom(
  s: { position(u: number, t: number): Vec3 },
  resU: number,
  resT: number,
): Float32Array {
  const g = new Float32Array(resU * resT * 3);
  let w = 0;
  for (let row = 0; row < resT; row++) {
    const t = row / (resT - 1);
    for (let col = 0; col < resU; col++) {
      const p = s.position(col / resU, t);
      g[w++] = p[0];
      g[w++] = p[1];
      g[w++] = p[2];
    }
  }
  return g;
}

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('BicubicSurfaceSampler', () => {
  it('is INTERPOLATORY: returns the exact node value at every grid node', () => {
    const resU = 32;
    const resT = 17;
    const analytic = new SyntheticCylinderSampler(50, 120, 6, 5);
    const grid = gridFrom(analytic, resU, resT);
    const bic = new BicubicSurfaceSampler(grid, resU, resT);
    for (let row = 0; row < resT; row++) {
      for (let col = 0; col < resU; col++) {
        const u = col / resU;
        const t = row / (resT - 1);
        const got = bic.position(u, t);
        const node: Vec3 = [grid[(row * resU + col) * 3], grid[(row * resU + col) * 3 + 1], grid[(row * resU + col) * 3 + 2]];
        expect(dist(got, node)).toBeLessThan(1e-6);
      }
    }
  });

  it('reproduces an AFFINE field exactly on an interior stencil (Catmull-Rom reproduces linear)', () => {
    // A grid whose positions are affine in (u,t): bicubic must reproduce it to
    // round-off between nodes (the cubic terms vanish), not just AT nodes. Tested
    // at INTERIOR points only — an affine field is NOT periodic, so the seam cell
    // (which wraps col res-1→0) legitimately cannot reproduce it; seam continuity
    // is covered by the periodicity test instead.
    const resU = 16;
    const resT = 9;
    const affine = {
      position: (u: number, t: number): Vec3 => [3 + 2 * u, -1 + 5 * t, 7 + u - 4 * t],
    };
    const grid = gridFrom(affine, resU, resT);
    const bic = new BicubicSurfaceSampler(grid, resU, resT);
    // u in [2/16, 12/16] and t in [2/8, 6/8] keep both 4-wide stencils off the
    // periodic-u seam and the clamped-t caps.
    for (const [u, t] of [[0.13, 0.3], [0.49, 0.5], [0.6, 0.45], [0.72, 0.66]] as const) {
      expect(dist(bic.position(u, t), affine.position(u, t))).toBeLessThan(1e-4);
    }
  });

  it('beats bilinear on a CURVED surface at the same resolution (lower max error)', () => {
    // ~21 samples/period (128 cols / 6 lobes) — far enough into the asymptotic
    // regime that bicubic's O(h^4) clearly dominates bilinear's O(h^2). The real
    // reference grids (1024+, ~100 samples/period) are even deeper in.
    const resU = 128;
    const resT = 33;
    const analytic = new SyntheticCylinderSampler(57, 120, 8, 6); // real angular relief
    const grid = gridFrom(analytic, resU, resT);
    const bic = new BicubicSurfaceSampler(grid, resU, resT);
    const lin = new GpuSurfaceSampler(grid, resU, resT);
    let maxBic = 0;
    let maxLin = 0;
    // Sample OFF-node points (mid-cell is the worst case for interpolation).
    for (let row = 0; row < resT - 1; row++) {
      const t = (row + 0.5) / (resT - 1);
      for (let col = 0; col < resU; col++) {
        const u = (col + 0.5) / resU;
        const truth = analytic.position(u - Math.floor(u), t);
        maxBic = Math.max(maxBic, dist(bic.position(u, t), truth));
        maxLin = Math.max(maxLin, dist(lin.position(u, t), truth));
      }
    }
    // Bicubic O(h^4) should be SUBSTANTIALLY better than bilinear O(h^2) here.
    expect(maxBic).toBeLessThan(maxLin * 0.5);
  });

  it('is PERIODIC in u: position(u) == position(u+1) (seam continuity)', () => {
    const resU = 24;
    const resT = 13;
    const analytic = new SyntheticCylinderSampler(40, 100, 5, 4);
    const grid = gridFrom(analytic, resU, resT);
    const bic = new BicubicSurfaceSampler(grid, resU, resT);
    for (const [u, t] of [[0.07, 0.3], [0.5, 0.6], [0.99, 0.9]] as const) {
      expect(dist(bic.position(u, t), bic.position(u + 1, t))).toBeLessThan(1e-6);
      expect(dist(bic.position(u, t), bic.position(u - 1, t))).toBeLessThan(1e-6);
    }
  });

  it('CLAMPS t to [0,1] (caps; no read outside the grid)', () => {
    const resU = 20;
    const resT = 11;
    const analytic = new SyntheticCylinderSampler(50, 120, 3, 4);
    const grid = gridFrom(analytic, resU, resT);
    const bic = new BicubicSurfaceSampler(grid, resU, resT);
    expect(dist(bic.position(0.3, -0.5), bic.position(0.3, 0))).toBeLessThan(1e-6);
    expect(dist(bic.position(0.7, 1.8), bic.position(0.7, 1))).toBeLessThan(1e-6);
  });

  it('exposes its grid resolution (for the inversion step sizing)', () => {
    const bic = new BicubicSurfaceSampler(new Float32Array(8 * 4 * 3), 8, 4);
    expect(bic.gridResolution()).toEqual({ resU: 8, resT: 4 });
  });
});
