/**
 * Geometry Styles Tests
 * Tests for the style functions used in pot mesh generation.
 */
import { describe, it, expect } from 'vitest';
import {
    rOuterSuperformulaBlossom,
    rOuterFourierBloom,
    rOuterSpiralRidges,
    rOuterSuperellipseMorph,
    rOuterHarmonicRipple,
    rOuterGothicArches,
    getStyleFunction,
    getStyleFunctionVec,
} from './styles';
import { TAU } from './types';

describe('rOuterSuperformulaBlossom', () => {
    const H = 100;
    const r0 = 50;
    const opts = {};

    it('should return positive radius', () => {
        const r = rOuterSuperformulaBlossom(0, 50, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should vary with theta', () => {
        const r1 = rOuterSuperformulaBlossom(0, 50, r0, H, opts);
        const r2 = rOuterSuperformulaBlossom(Math.PI / 4, 50, r0, H, opts);
        expect(Math.abs(r1 - r2)).toBeGreaterThan(0);
    });

    it('should handle z=0 (base)', () => {
        const r = rOuterSuperformulaBlossom(0, 0, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should handle z=H (top)', () => {
        const r = rOuterSuperformulaBlossom(0, H, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should accept custom parameters', () => {
        const r = rOuterSuperformulaBlossom(0, 50, r0, H, { sfMBase: 8, sfMTop: 12 });
        expect(r).toBeGreaterThan(0);
    });
});

describe('rOuterFourierBloom', () => {
    const H = 100;
    const r0 = 50;
    const opts = {};

    it('should return positive radius', () => {
        const r = rOuterFourierBloom(0, 50, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should vary with theta', () => {
        const r1 = rOuterFourierBloom(0, 50, r0, H, opts);
        const r2 = rOuterFourierBloom(Math.PI, 50, r0, H, opts);
        expect(Math.abs(r1 - r2)).toBeGreaterThan(0);
    });

    it('should handle custom strength', () => {
        const r = rOuterFourierBloom(0, 50, r0, H, { fbStrength: 0.5 });
        expect(r).toBeGreaterThan(0);
    });
});

describe('rOuterSpiralRidges', () => {
    const H = 100;
    const r0 = 50;
    const opts = {};

    it('should return positive radius', () => {
        const r = rOuterSpiralRidges(0, 50, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should vary with theta', () => {
        const r1 = rOuterSpiralRidges(0, 50, r0, H, opts);
        const r2 = rOuterSpiralRidges(Math.PI / 2, 50, r0, H, opts);
        expect(Math.abs(r1 - r2)).toBeGreaterThan(0);
    });

    it('should vary with z', () => {
        const r1 = rOuterSpiralRidges(0, 20, r0, H, opts);
        const r2 = rOuterSpiralRidges(0, 80, r0, H, opts);
        expect(Math.abs(r1 - r2)).toBeGreaterThan(0);
    });
});

describe('rOuterSuperellipseMorph', () => {
    const H = 100;
    const r0 = 50;
    const opts = {};

    it('should return positive radius', () => {
        const r = rOuterSuperellipseMorph(0, 50, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should handle different exponents', () => {
        const r = rOuterSuperellipseMorph(0, 50, r0, H, { seMBase: 3, seMTop: 8 });
        expect(r).toBeGreaterThan(0);
    });
});

describe('rOuterHarmonicRipple', () => {
    const H = 100;
    const r0 = 50;
    const opts = {};

    it('should return positive radius', () => {
        const r = rOuterHarmonicRipple(0, 50, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should handle custom petal count', () => {
        const r = rOuterHarmonicRipple(0, 50, r0, H, { hrPetals: 12 });
        expect(r).toBeGreaterThan(0);
    });
});

describe('rOuterGothicArches', () => {
    const H = 100;
    const r0 = 50;
    const opts = {};

    it('should return positive radius', () => {
        const r = rOuterGothicArches(0, 50, r0, H, opts);
        expect(r).toBeGreaterThan(0);
    });

    it('should handle custom arch count', () => {
        const r = rOuterGothicArches(0, 50, r0, H, { gaCounts: 16 });
        expect(r).toBeGreaterThan(0);
    });

    it('should vary with theta', () => {
        const r1 = rOuterGothicArches(0, 50, r0, H, opts);
        const r2 = rOuterGothicArches(Math.PI / 4, 50, r0, H, opts);
        expect(Math.abs(r1 - r2)).toBeGreaterThan(0);
    });
});

describe('getStyleFunction', () => {
    it('should return function for SuperformulaBlossom', () => {
        const fn = getStyleFunction('SuperformulaBlossom');
        expect(fn).toBeInstanceOf(Function);
    });

    it('should return function for FourierBloom', () => {
        const fn = getStyleFunction('FourierBloom');
        expect(fn).toBeInstanceOf(Function);
    });

    it('should return function for GothicArches', () => {
        const fn = getStyleFunction('GothicArches');
        expect(fn).toBeInstanceOf(Function);
    });

    it('should return function for SpiralRidges', () => {
        const fn = getStyleFunction('SpiralRidges');
        expect(fn).toBeInstanceOf(Function);
    });

    it('should return function for HarmonicRipple', () => {
        const fn = getStyleFunction('HarmonicRipple');
        expect(fn).toBeInstanceOf(Function);
    });

    it('should return default for unknown style', () => {
        const fn = getStyleFunction('UnknownStyle' as any);
        expect(fn).toBeInstanceOf(Function);
    });
});

describe('getStyleFunctionVec', () => {
    it('should return vectorized function for SuperformulaBlossom', () => {
        const fn = getStyleFunctionVec('SuperformulaBlossom');
        expect(fn).toBeInstanceOf(Function);
    });

    it('should return vectorized function for FourierBloom', () => {
        const fn = getStyleFunctionVec('FourierBloom');
        expect(fn).toBeInstanceOf(Function);
    });

    it('should compute multiple theta values', () => {
        const fn = getStyleFunctionVec('SuperformulaBlossom');
        const thetas = new Float32Array([0, Math.PI / 4, Math.PI / 2, Math.PI]);
        const results = fn(thetas, 50, 50, 100, {});
        expect(results).toBeInstanceOf(Float32Array);
        expect(results.length).toBe(4);
    });

    it('should return different values for different thetas', () => {
        const fn = getStyleFunctionVec('SuperformulaBlossom');
        const thetas = new Float32Array([0, Math.PI / 4, Math.PI / 2]);
        const results = fn(thetas, 50, 50, 100, {});
        // At least some values should differ
        expect(results[0]).not.toEqual(results[1]);
    });
});
