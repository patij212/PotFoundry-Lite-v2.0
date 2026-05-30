/**
 * Tests for tolerance-driven export feasibility checks.
 */
import { describe, expect, it } from 'vitest';
import type { ExportTolerances } from './types';
import {
  MIN_STABLE_POSITION_TOLERANCE_MM,
  assessToleranceFeasibility,
  assertToleranceFeasible,
} from './ExportFeasibility';
import { MAX_BINARY_STL_BYTES, MAX_BINARY_STL_TRIANGLES } from './QualityProfiles';

const TINY_POT = {
  H: 24,
  Rt: 6,
  Rb: 4,
  tWall: 1.2,
  tBottom: 1.6,
  rDrain: 1.2,
  expn: 1,
};

const LARGE_POT = {
  H: 120,
  Rt: 60,
  Rb: 45,
  tWall: 3,
  tBottom: 4,
  rDrain: 2,
  expn: 1,
};

function tolerances(epsPosMm: number): ExportTolerances {
  return {
    epsPosMm,
    epsNormalDeg: 3,
    epsFeatureMm: epsPosMm,
    minTriangleAngleDeg: 20,
    maxAspectRatio: 16,
  };
}

describe('assessToleranceFeasibility', () => {
  it('allows sub-micron tolerance for tiny pots when the estimate fits budget and file limits', () => {
    const report = assessToleranceFeasibility({
      dimensions: TINY_POT,
      tolerances: tolerances(0.0008),
      targetTriangles: 1_000_000,
      explicitToleranceRequest: true,
    });

    expect(report.ok).toBe(true);
    expect(report.estimatedTrianglesForTolerance).toBeLessThan(1_000_000);
    expect(report.estimatedBinaryStlBytes).toBeLessThan(MAX_BINARY_STL_BYTES);
  });

  it('fails loudly below the numerical stability floor', () => {
    const report = assessToleranceFeasibility({
      dimensions: TINY_POT,
      tolerances: tolerances(MIN_STABLE_POSITION_TOLERANCE_MM / 10),
      targetTriangles: MAX_BINARY_STL_TRIANGLES,
      explicitToleranceRequest: true,
    });

    expect(report.ok).toBe(false);
    expect(report.errors.join('\n')).toMatch(/numerical stability/i);
  });

  it('fails when the estimated tolerance mesh would exceed the 1 GiB STL ceiling', () => {
    const report = assessToleranceFeasibility({
      dimensions: LARGE_POT,
      tolerances: tolerances(0.000001),
      targetTriangles: MAX_BINARY_STL_TRIANGLES,
      explicitToleranceRequest: true,
    });

    expect(report.ok).toBe(false);
    expect(report.estimatedBinaryStlBytes).toBeGreaterThan(MAX_BINARY_STL_BYTES);
    expect(report.errors.join('\n')).toMatch(/1 GiB/i);
  });

  it('fails when the requested triangle target is lower than the tolerance estimate', () => {
    const report = assessToleranceFeasibility({
      dimensions: LARGE_POT,
      tolerances: tolerances(0.001),
      targetTriangles: 20_000,
      explicitToleranceRequest: true,
    });

    expect(report.ok).toBe(false);
    expect(report.estimatedTrianglesForTolerance).toBeGreaterThan(20_000);
    expect(report.errors.join('\n')).toMatch(/targetTriangles/i);
  });

  it('throws an actionable message through assertToleranceFeasible', () => {
    expect(() => assertToleranceFeasible({
      dimensions: LARGE_POT,
      tolerances: tolerances(0.000001),
      targetTriangles: MAX_BINARY_STL_TRIANGLES,
      explicitToleranceRequest: true,
    })).toThrow(/cannot satisfy requested export tolerance/i);
  });
});
