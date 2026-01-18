/**
 * State Types Tests
 * Tests for state types and constants including:
 * - Geometry bounds validation
 * - Default values
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_GEOMETRY,
    GEOMETRY_BOUNDS,
} from '../types';

describe('Geometry Bounds', () => {
    it('should have bounds for all required parameters', () => {
        const requiredParams = ['H', 'top_od', 'bottom_od', 't_wall', 't_bottom', 'r_drain'];
        for (const param of requiredParams) {
            expect(GEOMETRY_BOUNDS).toHaveProperty(param);
            expect(GEOMETRY_BOUNDS[param as keyof typeof GEOMETRY_BOUNDS]).toHaveProperty('min');
            expect(GEOMETRY_BOUNDS[param as keyof typeof GEOMETRY_BOUNDS]).toHaveProperty('max');
        }
    });

    it('should have min less than max for all bounds', () => {
        for (const [, bounds] of Object.entries(GEOMETRY_BOUNDS)) {
            expect(bounds.min).toBeLessThan(bounds.max);
        }
    });

    it('should have non-negative minimums for dimensions', () => {
        expect(GEOMETRY_BOUNDS.H.min).toBeGreaterThanOrEqual(0);
        expect(GEOMETRY_BOUNDS.top_od.min).toBeGreaterThanOrEqual(0);
        expect(GEOMETRY_BOUNDS.bottom_od.min).toBeGreaterThanOrEqual(0);
    });
});

describe('Default Geometry', () => {
    it('should have all required fields', () => {
        expect(DEFAULT_GEOMETRY).toHaveProperty('H');
        expect(DEFAULT_GEOMETRY).toHaveProperty('top_od');
        expect(DEFAULT_GEOMETRY).toHaveProperty('bottom_od');
        expect(DEFAULT_GEOMETRY).toHaveProperty('t_wall');
        expect(DEFAULT_GEOMETRY).toHaveProperty('t_bottom');
        expect(DEFAULT_GEOMETRY).toHaveProperty('r_drain');
        expect(DEFAULT_GEOMETRY).toHaveProperty('expn');
    });

    it('should have values within bounds', () => {
        for (const [key, value] of Object.entries(DEFAULT_GEOMETRY)) {
            if (key in GEOMETRY_BOUNDS) {
                const bounds = GEOMETRY_BOUNDS[key as keyof typeof GEOMETRY_BOUNDS];
                expect(value).toBeGreaterThanOrEqual(bounds.min);
                expect(value).toBeLessThanOrEqual(bounds.max);
            }
        }
    });

    it('should have physically valid proportions', () => {
        // Wall can't be more than half the diameter
        const minRadius = Math.min(DEFAULT_GEOMETRY.top_od, DEFAULT_GEOMETRY.bottom_od) / 2;
        expect(DEFAULT_GEOMETRY.t_wall).toBeLessThan(minRadius);
    });
});
