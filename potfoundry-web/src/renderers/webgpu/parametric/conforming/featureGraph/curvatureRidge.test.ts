/**
 * curvatureRidge.test.ts — TDD tests for detectCurvatureRidge.
 *
 * Three synthetic cases:
 *
 * 1. RIPPLED CYLINDER — SyntheticCylinderSampler(R0=40, H=120, amp=5, k=6).
 *    The radius profile r(u) = R0 + amp·cos(2π·k·u) has k=6 crests and k=6
 *    valleys per revolution → 12 κ-extrema at u = m/12. The detector should
 *    return segments with midpoints within 1.5 cells of those extrema. We
 *    verify:
 *      (a) at least 6 distinct ridge u-bands are detected,
 *      (b) every ridge-segment midpoint u lies within 1.5 cells of one of the
 *          12 analytic extrema u = m/12,
 *      (c) returned type === 'curvature-ridge',
 *      (d) per-segment strength is finite and ≥ minStrength.
 *
 * 2. FLAT CYLINDER — SyntheticCylinderSampler(R0=40, H=120, amp=0, k=0).
 *    All curvature equal (1/R0 hoop). minStrength = 0.5 >> κ_hoop ≈ 0.025 mm⁻¹
 *    → no ridges pass the threshold → 0 segments.
 *
 * 3. GAUSSIAN BUMP — a custom sampler whose radius has a single Gaussian bump:
 *    r(u) = R0 + amp · exp(-((u-u0)/σ)²). The apex of the bump at u=u0 is a
 *    local κ maximum that runs along t at that u. The detector must find at
 *    least one segment with u-midpoint within 2 cells of u0.
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../SurfaceSampler';
import { sampleFeatureFields } from './sampleFields';
import { detectCurvatureRidge } from './curvatureRidge';
import type { SurfaceSampler } from '../SurfaceSampler';
import type { Vec3 } from '../SurfaceSampler';

// ---------------------------------------------------------------------------
// Synthetic Gaussian-bump sampler
// ---------------------------------------------------------------------------

/**
 * A cylinder with a single narrow Gaussian bump in the radius at u = u0.
 * r(u) = R0 + amp * exp(-((u - u0) / sigma)^2)
 * This injects a local curvature maximum at u = u0.
 */
class GaussianBumpSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly amp: number,
    private readonly u0: number,
    private readonly sigma: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    // Periodic distance to u0 in [0,1).
    let du = u - this.u0;
    // Wrap into [-0.5, 0.5)
    du = du - Math.round(du);
    const r = this.R0 + this.amp * Math.exp(-Math.pow(du / this.sigma, 2));
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const R0 = 40;
const H = 120;
const AMP = 5;
const K = 6;
const RES_U = 120; // cell width = 1/120 ≈ 0.00833
const RES_T = 60;
const CELL_WIDTH = 1 / RES_U;
const MIN_STRENGTH = 0.05; // well below κ_extremum ≈ 0.11 mm⁻¹

// Analytic u positions of the 12 κ-extrema for k=6: m/12 for m=0..11.
const N_EXTREMA = 2 * K; // 12
const EXTREMA_U = Array.from({ length: N_EXTREMA }, (_, m) => m / N_EXTREMA);

// ---------------------------------------------------------------------------
// Case 1 — Rippled cylinder
// ---------------------------------------------------------------------------

describe('detectCurvatureRidge — rippled cylinder (amp=5, k=6)', () => {
  const sampler = new SyntheticCylinderSampler(R0, H, AMP, K);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });
  const result = detectCurvatureRidge(fields, { minStrength: MIN_STRENGTH });

  it('returns type "curvature-ridge"', () => {
    expect(result.type).toBe('curvature-ridge');
  });

  it('returns at least 6 ridge segments (one per crest)', () => {
    // Each of the 6 crests should contribute at least one segment.
    expect(result.segs.length).toBeGreaterThanOrEqual(6);
  });

  it('every segment midpoint u lies within 1.5 cells of a known extremum', () => {
    for (const seg of result.segs) {
      const midU = (seg.a.u + seg.b.u) / 2;
      const nearestDist = Math.min(
        ...EXTREMA_U.map((eu) => {
          const d = Math.abs(midU - eu);
          return Math.min(d, 1 - d); // periodic wrap
        }),
      );
      expect(nearestDist).toBeLessThanOrEqual(1.5 * CELL_WIDTH);
    }
  });

  it('at least 6 distinct u-bands are covered', () => {
    // Cluster segment midpoints by nearest extremum; count how many extrema
    // have at least one segment assigned.
    const covered = new Set<number>();
    for (const seg of result.segs) {
      const midU = (seg.a.u + seg.b.u) / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      EXTREMA_U.forEach((eu, idx) => {
        const d = Math.min(Math.abs(midU - eu), 1 - Math.abs(midU - eu));
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      covered.add(bestIdx);
    }
    expect(covered.size).toBeGreaterThanOrEqual(6);
  });

  it('per-segment strength is finite and >= minStrength', () => {
    for (const seg of result.segs) {
      expect(Number.isFinite(seg.strength)).toBe(true);
      expect(seg.strength).toBeGreaterThanOrEqual(MIN_STRENGTH);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 2 — Flat cylinder (no ridges above threshold)
// ---------------------------------------------------------------------------

describe('detectCurvatureRidge — flat cylinder (amp=0), high minStrength', () => {
  const sampler = new SyntheticCylinderSampler(R0, H, 0, 0);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });
  // κ_hoop ≈ 1/R0 = 0.025 mm⁻¹. minStrength of 0.5 >> κ_hoop → nothing passes.
  const result = detectCurvatureRidge(fields, { minStrength: 0.5 });

  it('returns type "curvature-ridge"', () => {
    expect(result.type).toBe('curvature-ridge');
  });

  it('returns 0 segments when κ < minStrength everywhere', () => {
    expect(result.segs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Gaussian bump (single ridge at u0 = 0.3)
// ---------------------------------------------------------------------------

describe('detectCurvatureRidge — Gaussian bump at u0=0.3', () => {
  const U0 = 0.3;
  const SIGMA = 0.05;
  const BUMP_AMP = 8; // large amp → strong κ peak
  const sampler = new GaussianBumpSampler(R0, H, BUMP_AMP, U0, SIGMA);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });
  const result = detectCurvatureRidge(fields, { minStrength: MIN_STRENGTH });

  it('returns type "curvature-ridge"', () => {
    expect(result.type).toBe('curvature-ridge');
  });

  it('detects at least one segment near the bump apex u0=0.3 (within 2 cells)', () => {
    const TWO_CELLS = 2 * CELL_WIDTH;
    const nearApex = result.segs.some((seg) => {
      const midU = (seg.a.u + seg.b.u) / 2;
      const d = Math.min(Math.abs(midU - U0), 1 - Math.abs(midU - U0));
      return d <= TWO_CELLS;
    });
    expect(nearApex).toBe(true);
  });

  it('per-segment strength is finite and >= minStrength', () => {
    for (const seg of result.segs) {
      expect(Number.isFinite(seg.strength)).toBe(true);
      expect(seg.strength).toBeGreaterThanOrEqual(MIN_STRENGTH);
    }
  });
});
