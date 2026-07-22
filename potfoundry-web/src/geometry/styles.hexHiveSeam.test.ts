// styles.hexHiveSeam.test.ts — HexagonalHive u-wrap seam periodicity.
//
// The honeycomb radius maps one revolution (theta 0→2π) to `2π·hhScale` hex
// x-periods. The hex distance field has an x-period of exactly 1.0, so the
// surface is circumferentially periodic — rA(2π,z) === rA(0,z) — IFF that column
// count is an integer. At the shipped default hhScale=4.0 the count is
// 2π·4 = 25.13 (non-integer), which opens a genuine C0 seam of up to ~0.92mm at
// the u=0↔2π weld. Snapping the effective angular frequency to round(2π·hhScale)
// columns closes it to machine zero. See rOuterHexagonalHive (styles.ts) and its
// WGSL / feature-graph / cert-target parity twins.
import { describe, it, expect } from 'vitest';
import { buildAnalyticRadiusFn } from './analyticRadius';

const TAU = 2 * Math.PI;
// Production DEFAULT_DIMENSIONS: OD140 / H120 tapered ⇒ H120 / Rb45 / Rt70 / expn1.1.
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 } as const;

/** Worst |rA(0⁺,z) − rA(2π⁻,z)| over the wall — the u-wrap seam step (→0 ⇔ periodic). */
function seamStep(rA: (theta: number, z: number) => number, H: number): number {
  const eps = 1e-6;
  let max = 0;
  for (let j = 0; j <= 400; j++) {
    const z = (j / 400) * H;
    max = Math.max(max, Math.abs(rA(0 + eps, z) - rA(TAU - eps, z)));
  }
  return max;
}

describe('HexagonalHive circumferential periodicity (u-wrap seam)', () => {
  it('closes the honeycomb seam at the shipped default params', () => {
    const rA = buildAnalyticRadiusFn('HexagonalHive', {}, DIMS);
    expect(seamStep(rA, DIMS.H)).toBeLessThan(1e-6);
  });

  it('closes the seam for a non-integer-frequency scale too (snap generalizes)', () => {
    // 2π·4.1 = 25.76 columns ⇒ would seam unless snapped to round() = 26.
    const rA = buildAnalyticRadiusFn('HexagonalHive', { hhScale: 4.1 }, DIMS);
    expect(seamStep(rA, DIMS.H)).toBeLessThan(1e-6);
  });

  it('closes the seam with the noise (randomness) parameter active', () => {
    // The per-cell noise hash must ALSO tile. The cell straddling the seam is
    // otherwise hashed from two different absolute ids (−0.5 vs cols−0.5) ⇒ a
    // height cliff even though the distance field is periodic. hhNoise=0.5
    // exercises the residual (measured ~0.53mm before the cell-id wrap).
    const rA = buildAnalyticRadiusFn('HexagonalHive', { hhNoise: 0.5 }, DIMS);
    expect(seamStep(rA, DIMS.H)).toBeLessThan(1e-6);
  });

  it('is exactly periodic at the endpoints across scale AND noise', () => {
    for (const hhScale of [1.0, 2.5, 4.0, 4.1, 7.3, 10.0]) {
      for (const hhNoise of [0, 0.3, 1.0]) {
        const rA = buildAnalyticRadiusFn('HexagonalHive', { hhScale, hhNoise }, DIMS);
        for (const z of [0, 30, 60, 90, 120]) {
          expect(Math.abs(rA(0, z) - rA(TAU, z))).toBeLessThan(1e-9);
        }
      }
    }
  });
});
