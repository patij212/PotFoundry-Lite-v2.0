/**
 * Export Tier Tests
 * Tests for the export tier utility functions and constants.
 */
import { describe, it, expect } from 'vitest';
import {
    getExportQualityLimits,
    FREE_TIER_MONTHLY_LIMIT,
    FREE_TIER_MAX_N_THETA,
    FREE_TIER_MAX_N_Z,
} from './useExportTier';

describe('FREE_TIER constants', () => {
    it('should have positive monthly limit', () => {
        expect(FREE_TIER_MONTHLY_LIMIT).toBeGreaterThan(0);
        expect(FREE_TIER_MONTHLY_LIMIT).toBe(10);
    });

    it('should have positive resolution limits', () => {
        expect(FREE_TIER_MAX_N_THETA).toBeGreaterThan(0);
        expect(FREE_TIER_MAX_N_Z).toBeGreaterThan(0);
    });
});

describe('getExportQualityLimits', () => {
    it('should return limits for free tier', () => {
        const limits = getExportQualityLimits(false);
        expect(limits.maxNTheta).toBe(FREE_TIER_MAX_N_THETA);
        expect(limits.maxNZ).toBe(FREE_TIER_MAX_N_Z);
        expect(limits.addWatermark).toBe(true);
    });

    it('should return unlimited for pro tier', () => {
        const limits = getExportQualityLimits(true);
        expect(limits.maxNTheta).toBeGreaterThan(FREE_TIER_MAX_N_THETA);
        expect(limits.maxNZ).toBeGreaterThan(FREE_TIER_MAX_N_Z);
        expect(limits.addWatermark).toBe(false);
    });

    it('should not add watermark for pro users', () => {
        const limits = getExportQualityLimits(true);
        expect(limits.addWatermark).toBe(false);
    });

    it('should add watermark for free users', () => {
        const limits = getExportQualityLimits(false);
        expect(limits.addWatermark).toBe(true);
    });
});
