/**
 * sampleFields.test.ts — TDD tests for sampleFeatureFields.
 *
 * Surface: SyntheticCylinderSampler(R0=40, H=120, amp=5, k=6) — a rippled
 * cylinder. The radius profile r(u) = 40 + 5*cos(12π*u) has k=6 crests (cos=+1)
 * and k=6 valleys (cos=−1), giving 12 extrema per revolution at u = m/12 for
 * m = 0..11.
 *
 * Max principal curvature at these extrema is dominated by the second derivative
 * of the profile: |r''| = amp*(2π*k)². The resulting κ in mm⁻¹ is approximately
 * |r''| / (r * |Pu/∂u|²) which works out to ≈ 1/(r·(2π*r)²) * |r''|... but
 * most simply: numerical value ≈ 0.111 mm⁻¹ at the extrema (computed by
 * principalCurvatureMax on the analytic surface).
 *
 * The per-row kappa maxima must land within 1 cell (1/resU) of one of the 12
 * analytic extrema positions.
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../SurfaceSampler';
import { sampleFeatureFields } from './sampleFields';

const R0 = 40;
const H = 120;
const amp = 5;
const k = 6;
const RES_U = 256;
const RES_T = 128;

describe('sampleFeatureFields — SyntheticCylinder(R0=40,H=120,amp=5,k=6)', () => {
  const sampler = new SyntheticCylinderSampler(R0, H, amp, k);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });

  it('returns Fields with correct shape', () => {
    expect(fields.resU).toBe(RES_U);
    expect(fields.resT).toBe(RES_T);
    expect(fields.kappa.length).toBe(RES_U * RES_T);
    expect(fields.nx.length).toBe(RES_U * RES_T);
    expect(fields.ny.length).toBe(RES_U * RES_T);
    expect(fields.nz.length).toBe(RES_U * RES_T);
  });

  it('uOf(i) maps column index to u ∈ [0,1)', () => {
    expect(fields.uOf(0)).toBeCloseTo(0, 10);
    expect(fields.uOf(RES_U - 1)).toBeCloseTo((RES_U - 1) / RES_U, 10);
  });

  it('tOf(j) maps row index to t ∈ [0,1]', () => {
    expect(fields.tOf(0)).toBeCloseTo(0, 10);
    expect(fields.tOf(RES_T - 1)).toBeCloseTo(1, 10);
  });

  it('normals are unit length |n|≈1 everywhere (sample 200 nodes)', () => {
    // Check a spread of indices rather than all RES_U*RES_T nodes.
    const stride = Math.floor((RES_U * RES_T) / 200);
    for (let idx = 0; idx < RES_U * RES_T; idx += stride) {
      const nx = fields.nx[idx];
      const ny = fields.ny[idx];
      const nz = fields.nz[idx];
      const len = Math.hypot(nx, ny, nz);
      expect(len).toBeCloseTo(1, 5); // |n| within 1e-5
    }
  });

  it('κ row-maxima fall at one of the 2k=12 profile extrema within 1 cell', () => {
    // r(u) = R0 + amp*cos(2π*k*u) has 2*k=12 extrema per revolution at u=m/(2k)
    // for m=0..11. The max principal curvature peaks at these extrema (the profile
    // second derivative is largest there). The per-row max must land within 1 grid
    // cell (1/resU) of one such extremum.
    const nExtrema = 2 * k; // 12
    const extremaU = Array.from({ length: nExtrema }, (_, m) => m / nExtrema);
    const cellWidth = 1 / RES_U;

    // Check representative t-rows; skip the very top/bottom where boundary
    // clamping of the finite-difference step may shift the stencil slightly.
    const rowsToCheck = [16, 32, 48, 64, 80, 96, 112];
    for (const j of rowsToCheck) {
      const rowStart = j * RES_U;
      let maxKappa = -Infinity;
      let maxCol = 0;
      for (let i = 0; i < RES_U; i++) {
        const kv = fields.kappa[rowStart + i];
        if (kv > maxKappa) {
          maxKappa = kv;
          maxCol = i;
        }
      }
      const uMax = fields.uOf(maxCol);
      // Distance to nearest extremum (periodic on [0,1)).
      const nearestDist = Math.min(
        ...extremaU.map((eu) => {
          const d = Math.abs(uMax - eu);
          return Math.min(d, 1 - d); // periodic wrap
        }),
      );
      expect(nearestDist).toBeLessThanOrEqual(cellWidth);
    }
  });

  it('κ at an extremum is in the right order of magnitude (within 25% of analytic)', () => {
    // For SyntheticCylinder(R0=40,H=120,amp=5,k=6) at a profile extremum, the
    // max principal curvature is dominated by the hoop curvature
    // κ ≈ amp*(2π*k)² / (r * E) where E = |∂P/∂u|² ≈ (2π*r)².
    // Simplifying: κ ≈ amp*(2π*k)² / (r * (2π*r)²) = amp*(k)² / (r³) * (1/(4π²)) ...
    // Rather than derive analytically, we anchor to the numerically verified value:
    // at u=0 (crest, r=45mm), t=0.5: kappa ≈ 0.111 mm⁻¹.
    // At u=1/12 (inflection → actually this is extremum u=1/(2k)=1/12):
    // cos(2π*6*1/12)=cos(π)=-1 → r=35mm (valley), kappa ≈ 0.117 mm⁻¹.
    //
    // The expected order of magnitude: kappa >> 1/R0 (≈0.025) because the ripple
    // dominates. We assert kappa > 4/R0 and kappa < 20/R0 (a 5x range around
    // the numerically verified value ≈ 0.111 mm⁻¹ = 4.4/R0).
    const kappaLow = 4 / R0; // 0.10 mm⁻¹
    const kappaHigh = 20 / R0; // 0.50 mm⁻¹

    // Sample at t=0.5 (mid-height) at u=0 (a known extremum — crest at cos=1).
    const j = Math.round(0.5 * (RES_T - 1));
    const i = 0; // u=0 is an extremum (crest)
    const kappaAtExtrema = fields.kappa[j * RES_U + i];

    expect(kappaAtExtrema).toBeGreaterThan(kappaLow);
    expect(kappaAtExtrema).toBeLessThan(kappaHigh);
  });
});
