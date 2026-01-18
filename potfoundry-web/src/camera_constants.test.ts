/**
 * Camera Constants Tests
 * Tests for camera constant values and ranges.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_INTERACTIVE_LOD,
    MIN_INTERACTIVE_LOD,
    MIN_ZOOM,
    MAX_ZOOM,
    ZOOM_SENSITIVITY,
    BASE_FOV,
    MIN_FOV,
    MAX_FOV,
    UNIFORM_FLOAT_COUNT,
    DRAIN_RADIUS_OFFSET,
    BELL_WIDTH_OFFSET,
    SEAM_ANGLE_OFFSET,
    AUTOROTATE_SPEED_DEFAULT,
    FOCUS_TWEEN_DURATION_MS,
} from './camera_constants';

describe('Camera Zoom Constants', () => {
    it('should have MIN_ZOOM less than MAX_ZOOM', () => {
        expect(MIN_ZOOM).toBeLessThan(MAX_ZOOM);
    });

    it('should have positive zoom range', () => {
        expect(MIN_ZOOM).toBeGreaterThan(0);
        expect(MAX_ZOOM).toBeGreaterThan(1);
    });

    it('should have reasonable zoom sensitivity', () => {
        expect(ZOOM_SENSITIVITY).toBeGreaterThan(0);
        expect(ZOOM_SENSITIVITY).toBeLessThan(0.1);
    });
});

describe('Camera FOV Constants', () => {
    it('should have BASE_FOV within min/max range', () => {
        expect(BASE_FOV).toBeGreaterThanOrEqual(MIN_FOV);
        expect(BASE_FOV).toBeLessThanOrEqual(MAX_FOV);
    });

    it('should have MIN_FOV less than MAX_FOV', () => {
        expect(MIN_FOV).toBeLessThan(MAX_FOV);
    });

    it('should be in radians', () => {
        // Max FOV should be less than π (180 degrees)
        expect(MAX_FOV).toBeLessThan(Math.PI);
        expect(MIN_FOV).toBeGreaterThan(0);
    });
});

describe('Buffer Offset Constants', () => {
    it('should have UNIFORM_FLOAT_COUNT sufficient for all offsets', () => {
        expect(UNIFORM_FLOAT_COUNT).toBeGreaterThan(DRAIN_RADIUS_OFFSET);
        expect(UNIFORM_FLOAT_COUNT).toBeGreaterThan(BELL_WIDTH_OFFSET);
        expect(UNIFORM_FLOAT_COUNT).toBeGreaterThan(SEAM_ANGLE_OFFSET);
    });

    it('should have unique offset values', () => {
        const offsets = [DRAIN_RADIUS_OFFSET, BELL_WIDTH_OFFSET, SEAM_ANGLE_OFFSET];
        const uniqueOffsets = new Set(offsets);
        expect(uniqueOffsets.size).toBe(offsets.length);
    });

    it('should have non-negative offsets', () => {
        expect(DRAIN_RADIUS_OFFSET).toBeGreaterThanOrEqual(0);
        expect(BELL_WIDTH_OFFSET).toBeGreaterThanOrEqual(0);
        expect(SEAM_ANGLE_OFFSET).toBeGreaterThanOrEqual(0);
    });
});

describe('LOD Constants', () => {
    it('should have DEFAULT_INTERACTIVE_LOD within bounds', () => {
        expect(DEFAULT_INTERACTIVE_LOD).toBeGreaterThanOrEqual(MIN_INTERACTIVE_LOD);
        expect(DEFAULT_INTERACTIVE_LOD).toBeLessThanOrEqual(1);
    });

    it('should have MIN_INTERACTIVE_LOD positive', () => {
        expect(MIN_INTERACTIVE_LOD).toBeGreaterThan(0);
    });
});

describe('Animation Constants', () => {
    it('should have positive autorotate speed', () => {
        expect(AUTOROTATE_SPEED_DEFAULT).toBeGreaterThan(0);
    });

    it('should have reasonable focus tween duration', () => {
        expect(FOCUS_TWEEN_DURATION_MS).toBeGreaterThan(100);
        expect(FOCUS_TWEEN_DURATION_MS).toBeLessThan(2000);
    });
});
