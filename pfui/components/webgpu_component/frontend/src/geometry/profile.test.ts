/**
 * Profile Functions Tests
 *
 * Tests for the base geometry profile calculations.
 */

import { describe, it, expect } from 'vitest';
import {
  baseRadius,
  rBaseOut,
  spinTwistRadians,
  baseRadiusArray,
  spinTwistArray,
  getThetaGrid,
  clearThetaGridCache,
} from './profile';

describe('baseRadius', () => {
  it('should return bottom radius at z=0 with default opts', () => {
    const Rb = 30;
    const Rt = 50;
    const H = 100;
    const result = baseRadius(0, H, Rb, Rt, 1.0);
    // At z=0, should be close to Rb (with sigmoid warping, exact value varies)
    expect(result).toBeGreaterThanOrEqual(Rb * 0.9);
    expect(result).toBeLessThanOrEqual(Rt);
  });

  it('should return top radius at z=H with default opts', () => {
    const Rb = 30;
    const Rt = 50;
    const H = 100;
    const result = baseRadius(H, H, Rb, Rt, 1.0);
    // At z=H, should be close to Rt (with sigmoid warping)
    expect(result).toBeGreaterThanOrEqual(Rb);
    expect(result).toBeLessThanOrEqual(Rt * 1.1);
  });

  it('should handle H=0 edge case', () => {
    const result = baseRadius(0, 0, 30, 50, 1.0);
    expect(result).toBe(30); // Returns Rb when H <= 0
  });

  it('should apply bell modification when bellAmp is set', () => {
    const opts = { bellAmp: 0.2, bellCenter: 0.5, bellWidth: 0.3 };
    const resultWithBell = baseRadius(50, 100, 30, 50, 1.0, opts);
    const resultWithoutBell = baseRadius(50, 100, 30, 50, 1.0, {});
    
    // Bell should increase radius at center
    expect(resultWithBell).toBeGreaterThan(resultWithoutBell);
  });

  it('should vary with exponent', () => {
    const H = 100;
    const Rb = 30;
    const Rt = 50;
    const z = 50;
    
    const resultExp1 = baseRadius(z, H, Rb, Rt, 1.0);
    const resultExp2 = baseRadius(z, H, Rb, Rt, 2.0);
    const resultExp05 = baseRadius(z, H, Rb, Rt, 0.5);
    
    // Higher exponent curves inward (smaller at midpoint)
    // Lower exponent curves outward (larger at midpoint)
    expect(resultExp05).toBeGreaterThan(resultExp1);
    expect(resultExp1).toBeGreaterThan(resultExp2);
  });
});

describe('rBaseOut (simple profile)', () => {
  it('should return bottom radius at z=0', () => {
    const result = rBaseOut(0, 100, 30, 50, 1.0);
    expect(result).toBeCloseTo(30, 5);
  });

  it('should return top radius at z=H', () => {
    const result = rBaseOut(100, 100, 30, 50, 1.0);
    expect(result).toBeCloseTo(50, 5);
  });

  it('should interpolate linearly with expn=1.0', () => {
    const midPoint = rBaseOut(50, 100, 30, 50, 1.0);
    // Linear interpolation: 30 + (50-30) * 0.5 = 40
    expect(midPoint).toBeCloseTo(40, 5);
  });

  it('should apply exponential profile with expn > 1', () => {
    const midPoint = rBaseOut(50, 100, 30, 50, 2.0);
    // With expn=2, t^2 at t=0.5 is 0.25, result = 30 + 20*0.25 = 35
    expect(midPoint).toBeCloseTo(35, 5);
  });

  it('should handle H=0 edge case', () => {
    const result = rBaseOut(0, 0, 30, 50, 1.0);
    expect(result).toBeCloseTo(30, 5);
  });
});

describe('spinTwistRadians', () => {
  it('should return 0 when no spin parameters set', () => {
    const result = spinTwistRadians(50, 100, {});
    expect(result).toBe(0);
  });

  it('should return phase at z=0', () => {
    const opts = { spinTurns: 1.0, spinPhaseDeg: 90 };
    const result = spinTwistRadians(0, 100, opts);
    // At z=0 with 90 degree phase, should be π/2
    expect(result).toBeCloseTo(Math.PI / 2, 5);
  });

  it('should return full turns at z=H', () => {
    const opts = { spinTurns: 1.0, spinPhaseDeg: 0 };
    const result = spinTwistRadians(100, 100, opts);
    // One full turn = 2π
    expect(result).toBeCloseTo(2 * Math.PI, 5);
  });

  it('should handle H=0', () => {
    const result = spinTwistRadians(0, 0, { spinTurns: 1.0 });
    expect(result).toBe(0);
  });
});

describe('baseRadiusArray', () => {
  it('should compute array of radii', () => {
    const zArray = new Float32Array([0, 25, 50, 75, 100]);
    const result = baseRadiusArray(zArray, 100, 30, 50, 1.0);
    
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(5);
    
    // First should be near bottom, last near top
    expect(result[0]).toBeLessThan(result[4]);
  });

  it('should handle empty array', () => {
    const result = baseRadiusArray([], 100, 30, 50, 1.0);
    expect(result.length).toBe(0);
  });
});

describe('spinTwistArray', () => {
  it('should compute array of twist angles', () => {
    const zArray = new Float32Array([0, 50, 100]);
    const opts = { spinTurns: 1.0, spinPhaseDeg: 0 };
    const result = spinTwistArray(zArray, 100, opts);
    
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3);
    
    // Should increase with height
    expect(result[0]).toBeLessThan(result[1]);
    expect(result[1]).toBeLessThan(result[2]);
  });
});

describe('getThetaGrid', () => {
  beforeEach(() => {
    clearThetaGridCache();
  });

  it('should create theta grid with correct length', () => {
    const grid = getThetaGrid(36);
    
    expect(grid.nTheta).toBe(36);
    expect(grid.thetas.length).toBe(36);
    expect(grid.cosThetas.length).toBe(36);
    expect(grid.sinThetas.length).toBe(36);
  });

  it('should cache and return same grid', () => {
    const grid1 = getThetaGrid(36);
    const grid2 = getThetaGrid(36);
    
    expect(grid1).toBe(grid2); // Same reference
  });

  it('should recompute for different nTheta', () => {
    const grid1 = getThetaGrid(36);
    const grid2 = getThetaGrid(72);
    
    expect(grid1.nTheta).toBe(36);
    expect(grid2.nTheta).toBe(72);
    expect(grid1).not.toBe(grid2);
  });

  it('should have correct trigonometric values', () => {
    const grid = getThetaGrid(4);
    
    // At theta=0 (i=0)
    expect(grid.cosThetas[0]).toBeCloseTo(1, 10);
    expect(grid.sinThetas[0]).toBeCloseTo(0, 10);
    
    // At theta=π/2 (i=1 for n=4)
    expect(grid.cosThetas[1]).toBeCloseTo(0, 10);
    expect(grid.sinThetas[1]).toBeCloseTo(1, 10);
  });
});
