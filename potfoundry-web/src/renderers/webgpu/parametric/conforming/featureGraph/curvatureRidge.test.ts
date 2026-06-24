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
// Synthetic ring-ridge sampler (t-branch exercise)
// ---------------------------------------------------------------------------

/**
 * A cylinder whose radius varies with t only: r(t) = R0 + amp·exp(-((t−0.5)/σ)²).
 * This places a raised band ring at t≈0.5 — a feature with a curvature ridge that
 * runs along u (constant t). The κ-gradient is in the t-direction, so gTSq > gUSq
 * and the t-branch of the dominant-axis gate fires. If the t-branch is broken,
 * no ridge is detected.
 */
class RingRidgeSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly amp: number,
    private readonly t0: number,
    private readonly sigma: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    const r = this.R0 + this.amp * Math.exp(-Math.pow((t - this.t0) / this.sigma, 2));
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

// ---------------------------------------------------------------------------
// Case 4 — Ring ridge at t0=0.5 (t-branch exercise)
// ---------------------------------------------------------------------------
// r(t) = R0 + amp·exp(-((t − 0.5)/σ)²). The curvature is maximal along the
// raised ring at t≈0.5 and decays away in both ±t directions. The κ-gradient
// is therefore in the t-direction (gTSq > gUSq), which exercises the ELSE
// branch of the dominant-axis gate (k0 > kT0 && k0 > kT2). If that branch
// were buggy (e.g. testing the wrong axis), no segments near t=0.5 would be
// found even though the curvature peak is real.

describe('detectCurvatureRidge — ring ridge at t0=0.5 (t-branch)', () => {
  const RING_T0 = 0.5;
  const RING_SIGMA = 0.07; // narrow enough to produce a clear gradient
  const RING_AMP = 8; // large amplitude → strong κ peak
  const sampler = new RingRidgeSampler(R0, H, RING_AMP, RING_T0, RING_SIGMA);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });
  const result = detectCurvatureRidge(fields, { minStrength: MIN_STRENGTH });

  it('returns type "curvature-ridge"', () => {
    expect(result.type).toBe('curvature-ridge');
  });

  it('detects at least one segment near t0=0.5 (within 2 t-cells)', () => {
    // Each t-cell spans 1/(resT−1). A ridge at t=0.5 must be within 2 cells.
    const T_CELL = 1 / (RES_T - 1);
    const TWO_T_CELLS = 2 * T_CELL;
    const nearRing = result.segs.some((seg) => {
      const midT = (seg.a.t + seg.b.t) / 2;
      return Math.abs(midT - RING_T0) <= TWO_T_CELLS;
    });
    // If this fails, the t-branch of the dominant-axis gate is broken.
    expect(nearRing).toBe(true);
  });

  it('detected ring segments span the full u-circumference (≥ 4 distinct u-bands)', () => {
    // The ring runs along u — segments should be distributed across u, not
    // clustered at a single column. Count distinct u-bands (bucket u into 4
    // equal quarters and require at least one segment per quarter).
    const T_CELL_LOCAL = 1 / (RES_T - 1);
    const ringSegs = result.segs.filter(
      (seg) => Math.abs((seg.a.t + seg.b.t) / 2 - RING_T0) <= 2 * T_CELL_LOCAL,
    );
    const quarters = new Set<number>();
    for (const seg of ringSegs) {
      const midU = (seg.a.u + seg.b.u) / 2;
      quarters.add(Math.floor(midU * 4)); // bucket into [0,3]
    }
    expect(quarters.size).toBeGreaterThanOrEqual(4);
  });

  it('per-segment strength is finite and >= minStrength', () => {
    for (const seg of result.segs) {
      expect(Number.isFinite(seg.strength)).toBe(true);
      expect(seg.strength).toBeGreaterThanOrEqual(MIN_STRENGTH);
    }
  });
});
