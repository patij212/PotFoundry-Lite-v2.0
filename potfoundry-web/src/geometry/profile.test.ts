/**
 * Geometry Profile Tests
 * Tests for base radius and spin/twist calculations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    baseRadius,
    rBaseOut,
    spinTwistRadians,
    baseRadiusArray,
    spinTwistArray,
    getThetaGrid,
    clearThetaGridCache,
} from './profile';
import { TAU } from './types';

describe('baseRadius', () => {
    it('should return Rb at z=0', () => {
        const r = baseRadius(0, 100, 50, 80, 1.0);
        expect(r).toBeCloseTo(50);
    });

    it('should return Rt at z=H', () => {
        const r = baseRadius(100, 100, 50, 80, 1.0);
        expect(r).toBeCloseTo(80, 0);
    });

    it('should handle H=0', () => {
        const r = baseRadius(50, 0, 50, 80, 1.0);
        expect(r).toBe(50);
    });

    it('should interpolate with expn=1', () => {
        const r = baseRadius(50, 100, 40, 80, 1.0);
        expect(r).toBeGreaterThan(40);
        expect(r).toBeLessThan(80);
    });

    it('should apply bell deformation', () => {
        const rNoBell = baseRadius(50, 100, 50, 50, 1.0, {});
        const rWithBell = baseRadius(50, 100, 50, 50, 1.0, {
            bellAmp: 0.2,
            bellCenter: 0.5,
            bellWidth: 0.3,
        });
        expect(rWithBell).toBeGreaterThan(rNoBell);
    });
});

describe('rBaseOut', () => {
    it('should return Rb at z=0', () => {
        const r = rBaseOut(0, 100, 50, 80, 1.0);
        expect(r).toBe(50);
    });

    it('should return Rt at z=H', () => {
        const r = rBaseOut(100, 100, 50, 80, 1.0);
        expect(r).toBe(80);
    });

    it('should handle expn=2 (slow start)', () => {
        const r = rBaseOut(50, 100, 40, 80, 2.0);
        // pow(0.5, 2) = 0.25, so r = 40 + 40*0.25 = 50
        expect(r).toBeCloseTo(50);
    });
});

describe('spinTwistRadians', () => {
    it('should return 0 with no spin', () => {
        const twist = spinTwistRadians(50, 100, {});
        expect(twist).toBe(0);
    });

    it('should return 0 at z=0', () => {
        const twist = spinTwistRadians(0, 100, { spinTurns: 1.0 });
        expect(twist).toBeCloseTo(0);
    });

    it('should return full twist at z=H', () => {
        const twist = spinTwistRadians(100, 100, { spinTurns: 1.0 });
        expect(twist).toBeCloseTo(-TAU);
    });

    it('should apply phase offset', () => {
        const twist = spinTwistRadians(0, 100, { spinPhaseDeg: 90 });
        expect(twist).toBeCloseTo(-Math.PI / 2);
    });

    it('should handle H=0', () => {
        const twist = spinTwistRadians(50, 0, { spinTurns: 1.0 });
        expect(twist).toBe(0);
    });
});

describe('baseRadiusArray', () => {
    it('should return correct length', () => {
        const zArray = [0, 25, 50, 75, 100];
        const result = baseRadiusArray(zArray, 100, 50, 80, 1.0);
        expect(result).toHaveLength(5);
    });

    it('should match single value calculations', () => {
        const zArray = [0, 50, 100];
        const result = baseRadiusArray(zArray, 100, 50, 80, 1.0);
        expect(result[0]).toBeCloseTo(baseRadius(0, 100, 50, 80, 1.0));
        expect(result[2]).toBeCloseTo(baseRadius(100, 100, 50, 80, 1.0));
    });
});

describe('spinTwistArray', () => {
    it('should return correct length', () => {
        const zArray = [0, 25, 50, 75, 100];
        const result = spinTwistArray(zArray, 100, { spinTurns: 1.0 });
        expect(result).toHaveLength(5);
    });

    it('should return zeros with no spin', () => {
        const zArray = [0, 50, 100];
        const result = spinTwistArray(zArray, 100, {});
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0);
        expect(result[2]).toBe(0);
    });
});

describe('getThetaGrid', () => {
    beforeEach(() => {
        clearThetaGridCache();
    });

    it('should return grid with correct length', () => {
        const grid = getThetaGrid(36);
        expect(grid.thetas).toHaveLength(36);
        expect(grid.cosThetas).toHaveLength(36);
        expect(grid.sinThetas).toHaveLength(36);
    });

    it('should cache and return same grid', () => {
        const grid1 = getThetaGrid(36);
        const grid2 = getThetaGrid(36);
        expect(grid1).toBe(grid2);
    });

    it('should create new grid for different size', () => {
        const grid1 = getThetaGrid(36);
        const grid2 = getThetaGrid(72);
        expect(grid1).not.toBe(grid2);
        expect(grid2.thetas).toHaveLength(72);
    });

    it('should have correct theta at index 0', () => {
        const grid = getThetaGrid(36);
        expect(grid.thetas[0]).toBe(0);
        expect(grid.cosThetas[0]).toBeCloseTo(1);
        expect(grid.sinThetas[0]).toBeCloseTo(0);
    });
});

describe('clearThetaGridCache', () => {
    it('should force new grid creation', () => {
        const grid1 = getThetaGrid(36);
        clearThetaGridCache();
        const grid2 = getThetaGrid(36);
        expect(grid1).not.toBe(grid2);
    });
});
