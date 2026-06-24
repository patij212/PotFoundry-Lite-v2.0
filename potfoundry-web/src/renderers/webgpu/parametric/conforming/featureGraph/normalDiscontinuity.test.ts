/**
 * normalDiscontinuity.test.ts — TDD tests for detectNormalDiscontinuity.
 *
 * Three synthetic cases — BOTH orientations exercised to avoid the single-axis
 * blind spot the curvature detector had:
 *
 * 1. VERTICAL CREASE (u-aligned, runs along t) — V-groove in u:
 *    r(u,t) = R0 + depth * abs(frac(u * N) - 0.5)
 *    with N_GROOVES=6 grooves around the circumference. Each groove has a sharp
 *    crease at u = k/N. The surface normals flip sharply there. The detector
 *    must return segments at those u positions with strength ≈ the measured
 *    per-edge angle jump (≈9.4 deg with the chosen depth=5, R0=40, N=6).
 *    minAngleDeg = 5 (above smooth-surface noise of ≤3 deg; below the 9.4 deg jump).
 *
 * 2. HORIZONTAL CREASE (t-aligned, runs along u) — V-groove in t:
 *    r(u,t) = R0 + depth * abs(t - 0.5)
 *    Single crease at t=0.5 running all the way around in u. Measured per-edge
 *    jump at the crease ≈7.15 deg (depth=15, H=120, resT=60).
 *    minAngleDeg = 5 (same lower bound; ensures crease is detected, smooth is not).
 *
 * 3. SMOOTH SURFACE (no crease) — flat cylinder:
 *    r(u,t) = R0 (constant). Per-edge normal jump = hoop-curvature contribution,
 *    measured at ≤3 deg. minAngleDeg = 5 → 0 segments.
 *
 * Analytic crease angles (total dihedral across two adjacent cells):
 *   u-groove: 2 * atan(depth*N / (2*pi*R0)) ≈ 13.6 deg; each straddling edge sees ~9.4 deg.
 *   t-groove: 2 * atan(depth / H)            ≈ 14.3 deg; each straddling edge sees ~7.15 deg.
 *   smooth:   hoop: atan(1/R0 * cell_arc)    ≈ 3.0  deg per edge.
 */

import { describe, it, expect } from 'vitest';
import { sampleFeatureFields } from './sampleFields';
import { detectNormalDiscontinuity } from './normalDiscontinuity';
import type { SurfaceSampler } from '../SurfaceSampler';
import type { Vec3 } from '../SurfaceSampler';

// ---------------------------------------------------------------------------
// Synthetic samplers
// ---------------------------------------------------------------------------

/**
 * V-groove cylinder: N grooves along u, each with a sharp |.|-crease at u=k/N.
 * r(u) = R0 + depth * |frac(u*N) - 0.5|
 *
 * Analytic normal-jump at the crease (per straddling edge ≈ half of total dihedral):
 *   total dihedral = 2 * atan(depth * N / (2 * pi * R0)) [degrees]
 * With depth=5, N=6, R0=40: total ≈ 13.6 deg; measured per-edge ≈ 9.4 deg.
 */
class VGrooveUCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly depth: number,
    private readonly N: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    // frac(u * N) in [0, 1), periodic
    const frac = ((u * this.N) % 1 + 1) % 1;
    const r = this.R0 + this.depth * Math.abs(frac - 0.5);
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

/**
 * V-groove in t: r(u,t) = R0 + depth * |t - 0.5|
 * Single crease at t=0.5 running all the way around in u.
 *
 * Analytic normal-jump (total dihedral): 2 * atan(depth / H)
 * With depth=15, H=120: total ≈ 14.3 deg; measured per-edge ≈ 7.15 deg.
 */
class VGrooveTCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
    private readonly depth: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    const r = this.R0 + this.depth * Math.abs(t - 0.5);
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

/**
 * Flat cylinder: r(u,t) = R0. Normals rotate only in the hoop direction.
 * Per-cell hoop angle: atan(2*pi*R0 / (resU * R0)) = atan(2*pi/resU) ≈ 3 deg at resU=120.
 * With minAngleDeg=5 this gives 0 segments.
 */
class FlatCylinderSampler implements SurfaceSampler {
  constructor(
    private readonly R0: number,
    private readonly H: number,
  ) {}

  position(u: number, t: number): Vec3 {
    const theta = 2 * Math.PI * u;
    return [this.R0 * Math.cos(theta), this.R0 * Math.sin(theta), t * this.H];
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const R0 = 40;
const H = 120;
const DEPTH_U = 5; // V-groove depth for u-crease (analytic per-edge ≈ 9.4 deg)
const DEPTH_T = 15; // V-groove depth for t-crease (analytic per-edge ≈ 7.15 deg)
const N_GROOVES = 6; // number of u-creases
const RES_U = 120;
const RES_T = 60;
const U_CELL = 1 / RES_U;
const T_CELL = 1 / (RES_T - 1);

// Threshold: above smooth noise (≤3 deg) and below crease jump (≥7 deg).
// Chosen at 5 deg so both crease types are detected and smooth surface is not.
const MIN_ANGLE_DEG = 5;

// ---------------------------------------------------------------------------
// Case 1 — Vertical crease (u-aligned crease, runs along t)
// ---------------------------------------------------------------------------

describe('detectNormalDiscontinuity — V-groove in u (vertical crease at u=k/N)', () => {
  const sampler = new VGrooveUCylinderSampler(R0, H, DEPTH_U, N_GROOVES);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });
  const result = detectNormalDiscontinuity(fields, { minAngleDeg: MIN_ANGLE_DEG });

  // Analytic crease positions in u: k / N_GROOVES for k = 0..N_GROOVES-1
  const creaseU = Array.from({ length: N_GROOVES }, (_, k) => k / N_GROOVES);

  it('returns type "normal-discontinuity"', () => {
    expect(result.type).toBe('normal-discontinuity');
  });

  it('detects segments at the crease locations (segs.length > 0)', () => {
    expect(result.segs.length).toBeGreaterThan(0);
  });

  it('every segment midpoint-u is within 1.5 u-cells of a known crease', () => {
    for (const seg of result.segs) {
      const midU = (seg.a.u + seg.b.u) / 2;
      const nearestDist = Math.min(
        ...creaseU.map((cu) => {
          const d = Math.abs(midU - cu);
          return Math.min(d, 1 - d); // periodic wrap
        }),
      );
      expect(nearestDist).toBeLessThanOrEqual(1.5 * U_CELL);
    }
  });

  it('at least N_GROOVES distinct crease u-bands are covered', () => {
    const covered = new Set<number>();
    for (const seg of result.segs) {
      const midU = (seg.a.u + seg.b.u) / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      creaseU.forEach((cu, idx) => {
        const d = Math.min(Math.abs(midU - cu), 1 - Math.abs(midU - cu));
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      covered.add(bestIdx);
    }
    expect(covered.size).toBeGreaterThanOrEqual(N_GROOVES);
  });

  it('per-segment strength is finite, >= minAngleDeg, and <= 180', () => {
    for (const seg of result.segs) {
      expect(Number.isFinite(seg.strength)).toBe(true);
      expect(seg.strength).toBeGreaterThanOrEqual(MIN_ANGLE_DEG);
      expect(seg.strength).toBeLessThanOrEqual(180);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 2 — Horizontal crease (t-aligned crease, runs along u)
// ---------------------------------------------------------------------------

describe('detectNormalDiscontinuity — V-groove in t (horizontal crease at t=0.5)', () => {
  const CREASE_T = 0.5;
  const sampler = new VGrooveTCylinderSampler(R0, H, DEPTH_T);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });
  const result = detectNormalDiscontinuity(fields, { minAngleDeg: MIN_ANGLE_DEG });

  it('returns type "normal-discontinuity"', () => {
    expect(result.type).toBe('normal-discontinuity');
  });

  it('detects at least one segment near t=0.5 (within 2 t-cells)', () => {
    const nearCrease = result.segs.some((seg) => {
      const midT = (seg.a.t + seg.b.t) / 2;
      return Math.abs(midT - CREASE_T) <= 2 * T_CELL;
    });
    expect(nearCrease).toBe(true);
  });

  it('crease segments span the full u-circumference (≥ 4 distinct u-bands)', () => {
    const creaseSegs = result.segs.filter(
      (seg) => Math.abs((seg.a.t + seg.b.t) / 2 - CREASE_T) <= 2 * T_CELL,
    );
    const quarters = new Set<number>();
    for (const seg of creaseSegs) {
      const midU = (seg.a.u + seg.b.u) / 2;
      quarters.add(Math.floor(midU * 4));
    }
    expect(quarters.size).toBeGreaterThanOrEqual(4);
  });

  it('per-segment strength is finite, >= minAngleDeg, and <= 180', () => {
    for (const seg of result.segs) {
      expect(Number.isFinite(seg.strength)).toBe(true);
      expect(seg.strength).toBeGreaterThanOrEqual(MIN_ANGLE_DEG);
      expect(seg.strength).toBeLessThanOrEqual(180);
    }
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Smooth surface (no crease, minAngleDeg above smooth-surface noise)
// ---------------------------------------------------------------------------

describe('detectNormalDiscontinuity — flat cylinder (no crease)', () => {
  const sampler = new FlatCylinderSampler(R0, H);
  const fields = sampleFeatureFields(sampler, { resU: RES_U, resT: RES_T });
  // Flat cylinder: max per-edge angle ≈ 3 deg (hoop rotation per cell).
  // minAngleDeg = 5 > 3 → no edges pass the gate → 0 segments.
  const result = detectNormalDiscontinuity(fields, { minAngleDeg: 5 });

  it('returns type "normal-discontinuity"', () => {
    expect(result.type).toBe('normal-discontinuity');
  });

  it('returns 0 segments for a smooth surface (minAngleDeg=5 > hoop noise ≈3 deg)', () => {
    expect(result.segs.length).toBe(0);
  });
});
