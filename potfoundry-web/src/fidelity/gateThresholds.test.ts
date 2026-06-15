import { describe, it, expect } from 'vitest';
import { GATE_THRESHOLDS, chordToleranceMm } from './gateThresholds';

describe('gateThresholds (Stage-1 calibrated dual-gate constants)', () => {
  it('pins the calibrated quality bars', () => {
    // theta_min: clean smooth styles (SuperellipseMorph/HarmonicRipple/RippleInterference)
    // achieve worst min-angle 24-29deg -> 20deg is the CAD bar they clear with margin.
    expect(GATE_THRESHOLDS.minAngleDeg).toBe(20);
    // A_max: analytic aspect (longest^2*sqrt3 / 4*area) of the worst 20deg-min-angle
    // (flat cap) triangle ~= 4.76; companion bound, validated vs measured in Stage 2.
    expect(GATE_THRESHOLDS.maxAspect).toBeCloseTo(4.76, 1);
  });
  it('chord tolerance clamps to the ceiling on large smooth features', () => {
    expect(chordToleranceMm(1000)).toBeCloseTo(GATE_THRESHOLDS.tauCeilMm, 6);
  });
  it('chord tolerance clamps to the floor on tiny sharp features', () => {
    expect(chordToleranceMm(0.0001)).toBeCloseTo(GATE_THRESHOLDS.tauFloorMm, 6);
  });
  it('chord tolerance scales with feature size in the mid band', () => {
    const mid = chordToleranceMm(0.5);
    expect(mid).toBeGreaterThan(GATE_THRESHOLDS.tauFloorMm);
    expect(mid).toBeLessThan(GATE_THRESHOLDS.tauCeilMm);
    expect(mid).toBeCloseTo(0.025, 6); // epsRel(0.05) * 0.5
  });
});
