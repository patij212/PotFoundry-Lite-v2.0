/**
 * useMobile Tests
 * Tests for the mobile detection constants and types.
 */
import { describe, it, expect } from 'vitest';
import { MOBILE_BREAKPOINT, TABLET_BREAKPOINT } from './useMobile';

describe('MOBILE_BREAKPOINT', () => {
    it('should be a positive number', () => {
        expect(MOBILE_BREAKPOINT).toBeGreaterThan(0);
    });

    it('should be 768px', () => {
        expect(MOBILE_BREAKPOINT).toBe(768);
    });
});

describe('TABLET_BREAKPOINT', () => {
    it('should be a positive number', () => {
        expect(TABLET_BREAKPOINT).toBeGreaterThan(0);
    });

    it('should be 768px', () => {
        expect(TABLET_BREAKPOINT).toBe(768);
    });

    it('should be >= MOBILE_BREAKPOINT', () => {
        expect(TABLET_BREAKPOINT).toBeGreaterThanOrEqual(MOBILE_BREAKPOINT);
    });
});
