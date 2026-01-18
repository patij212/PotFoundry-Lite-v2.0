/**
 * Geometry Types Tests
 * Tests for geometry type definitions and constants.
 */
import { describe, it, expect } from 'vitest';
import {
    TAU,
    EPSILON,
    DEFAULT_N_THETA,
    DEFAULT_N_Z,
} from './types';
import { STYLE_IDS } from '../styles/registry';

describe('Mathematical Constants', () => {
    it('should have TAU equal to 2π', () => {
        expect(TAU).toBeCloseTo(Math.PI * 2);
    });

    it('should have small EPSILON', () => {
        expect(EPSILON).toBeGreaterThan(0);
        expect(EPSILON).toBeLessThan(1e-6);
    });
});

describe('Default Resolution Constants', () => {
    it('should have positive DEFAULT_N_THETA', () => {
        expect(DEFAULT_N_THETA).toBeGreaterThan(0);
    });

    it('should have positive DEFAULT_N_Z', () => {
        expect(DEFAULT_N_Z).toBeGreaterThan(0);
    });

    it('should have reasonable theta resolution', () => {
        expect(DEFAULT_N_THETA).toBeGreaterThanOrEqual(36);
        expect(DEFAULT_N_THETA).toBeLessThanOrEqual(360);
    });

    it('should have reasonable Z resolution', () => {
        expect(DEFAULT_N_Z).toBeGreaterThanOrEqual(20);
        expect(DEFAULT_N_Z).toBeLessThanOrEqual(200);
    });
});

describe('STYLE_IDS', () => {
    it('should have SuperformulaBlossom at 0', () => {
        expect(STYLE_IDS.SuperformulaBlossom).toBe(0);
    });

    it('should have FourierBloom at 1', () => {
        expect(STYLE_IDS.FourierBloom).toBe(1);
    });

    it('should have SpiralRidges at 2', () => {
        expect(STYLE_IDS.SpiralRidges).toBe(2);
    });

    it('should have GothicArches at 5', () => {
        expect(STYLE_IDS.GothicArches).toBe(5);
    });

    it('should have unique IDs', () => {
        const ids = Object.values(STYLE_IDS);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have at least 6 styles', () => {
        expect(Object.keys(STYLE_IDS).length).toBeGreaterThanOrEqual(6);
    });
});
