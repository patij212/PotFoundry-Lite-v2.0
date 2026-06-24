/**
 * sampleFields.test.ts — TDD tests for sampleFeatureFields.
 *
 * Surface: SyntheticCylinderSampler(R0=40, H=120, amp=5, k=6) — a rippled
 * cylinder. The radius profile r(u) = R0 + amp*cos(2π*k*u) has k=6 crests
 * (cos=+1, r=R0+amp=45) and k=6 valleys (cos=−1, r=R0−amp=35), giving 12
 * extrema per revolution at u = m/12 for m = 0..11.
 *
 * ── Analytic principal curvature at a profile extremum ─────────────────────
 *
 * The surface is P(u,t) = [r·cosθ, r·sinθ, t·H] with θ = 2π·u and
 * r(u) = R0 + amp·cos(2π·k·u).
 *
 * At an extremum r′(u) = 0 (i.e. sin(2π·k·u) = 0), the two basis tangents
 * are orthogonal:
 *   Pu = r·2π·(−sinθ, cosθ, 0),   |Pu|² = (2π·r)²
 *   Pt = (0, 0, H),                 |Pt|² = H²
 *   F  = Pu·Pt = 0
 *
 * The unit outward normal at any extremum is n̂ = (cosθ, sinθ, 0).
 *
 * Second derivative: Puu = (r″ − r·(2π)²)·(cosθ, sinθ, 0).
 *   r″ = −amp·(2π·k)²·cos(2π·k·u)
 *      = −amp·(2π·k)²  at a crest  (cos = +1)
 *      = +amp·(2π·k)²  at a valley (cos = −1)
 *
 * Second fundamental form coefficient in the u-direction:
 *   L = Puu · n̂ = r″ − r·(2π)²
 *
 * Principal curvature in the u-direction (the dominant one; κ_t = 0 because
 * Ptt = 0):
 *   κ = L / |Pu|² = (r″ − r·(2π)²) / (2π·r)²
 *     = r″ / (2π·r)²  −  1/r
 *     = amp·(2π·k)²·sign / (2π·r)²  −  1/r   (sign = −1 at crest, +1 at valley)
 *     = ∓amp·k² / r²  −  1/r     (expanding (2π·k)²/(2π)²= k²)
 *
 * But curvature magnitude = |κ| (using outward-normal sign convention, both
 * crest and valley give positive κ):
 *   κ_crest  = amp·k²/(R0+amp)²  +  1/(R0+amp)   [sign: both terms add]
 *   κ_valley = amp·k²/(R0−amp)²  −  1/(R0−amp)   [sign: subtract hoop term]
 *
 * (The hoop term 1/r is the ordinary cylinder curvature; at the valley the
 * profile curves away from axis while the hoop curves toward it, so they
 * partially cancel.)
 *
 * Numerically for R0=40, amp=5, k=6:
 *   κ_crest  = 5·36/45²  + 1/45  = 0.08889 + 0.02222 = 0.11111 mm⁻¹
 *   κ_valley = 5·36/35²  − 1/35  = 0.14694 − 0.02857 = 0.11837 mm⁻¹
 *
 * The global per-row maximum κ is at the valley (0.11837 > 0.11111).
 *
 * Finite-difference error budget at resU=256:
 *   Step hu = 1/256. The curvature varies at spatial frequency ~2k = 12 cycles
 *   per u-revolution. Central-difference κ has O(hu²·|κ‴|) error. For a
 *   k=6 sinusoidal ripple the third derivative scales as (2π·k)³·amp/r² which
 *   gives a relative error of order (2π·k·hu)² / 6 ≈ (2π·6/256)² / 6 ≈ 0.36%.
 *   A ±5% tolerance comfortably covers this and any cross-term contributions;
 *   ±25% would only be needed to accept a 2× curvature error (useless gate).
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

  it('κ at the valley extremum is within 5% of the analytic value (see file-header derivation)', () => {
    // Analytic curvature at a VALLEY (r = R0 − amp = 35 mm), derived in the
    // file-header comment above:
    //   κ_valley = amp*k²/(R0−amp)² − 1/(R0−amp)
    //            = 5*36/35²  − 1/35
    //            = 0.14694   − 0.02857
    //            = 0.11837 mm⁻¹
    //
    // This is the global per-row maximum (κ_valley > κ_crest = 0.11111).
    //
    // Tolerance: ±5%. The finite-difference error at resU=256 is O((2π·k·hu)²/6)
    // ≈ 0.36%, so ±5% gives 13× headroom above the FD floor while still
    // rejecting any implementation with a 2× curvature error (which would land
    // at ±50–100% off, far outside this gate).
    const kValley = (amp * k * k) / (R0 - amp) ** 2 - 1 / (R0 - amp);
    // 0.14694 − 0.02857 = 0.11837 mm⁻¹

    // Valley nearest to u=0 is at u = 1/(2k) = 1/12.  Column index = round(resU/12).
    // cos(2π·6·(1/12)) = cos(π) = −1 → r = R0 − amp = 35 mm. ✓
    const i = Math.round(RES_U / (2 * k)); // nearest grid column to u = 1/12
    const j = Math.round(0.5 * (RES_T - 1)); // mid-height t = 0.5
    const kappaAtValley = fields.kappa[j * RES_U + i];

    const relError = Math.abs(kappaAtValley - kValley) / kValley;
    expect(relError).toBeLessThan(0.05); // within 5% of analytic — rejects 2× errors
  });
});
