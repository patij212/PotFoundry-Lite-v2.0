/**
 * Types Tests
 * Tests for the utility functions in src/types.ts
 */
import { describe, it, expect } from 'vitest';
import {
    lerp,
    easeOutCubic,
    clamp,
    isCameraMode,
    computeSceneExtents,
    DEBUG_PARAM_FLAG,
    ALWAYS_ON_DIAGNOSTICS,
} from './types';

describe('lerp', () => {
    it('should return first value at t=0', () => {
        expect(lerp(10, 20, 0)).toBe(10);
    });

    it('should return second value at t=1', () => {
        expect(lerp(10, 20, 1)).toBe(20);
    });

    it('should return midpoint at t=0.5', () => {
        expect(lerp(0, 100, 0.5)).toBe(50);
    });

    it('should interpolate correctly', () => {
        expect(lerp(0, 10, 0.3)).toBeCloseTo(3);
    });

    it('should handle negative values', () => {
        expect(lerp(-10, 10, 0.5)).toBe(0);
    });
});

describe('easeOutCubic', () => {
    it('should return 0 at t=0', () => {
        expect(easeOutCubic(0)).toBe(0);
    });

    it('should return 1 at t=1', () => {
        expect(easeOutCubic(1)).toBe(1);
    });

    it('should be greater than linear at t=0.5', () => {
        const result = easeOutCubic(0.5);
        expect(result).toBeGreaterThan(0.5);
    });

    it('should produce smooth curve', () => {
        const result = easeOutCubic(0.5);
        expect(result).toBeCloseTo(0.875);
    });
});

describe('clamp', () => {
    it('should return value when within range', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });

    it('should clamp to minimum', () => {
        expect(clamp(-5, 0, 10)).toBe(0);
    });

    it('should clamp to maximum', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });

    it('should handle equal min and max', () => {
        expect(clamp(5, 5, 5)).toBe(5);
    });
});

describe('isCameraMode', () => {
    it('should return true for arcball', () => {
        expect(isCameraMode('arcball')).toBe(true);
    });

    it('should return true for turntable', () => {
        expect(isCameraMode('turntable')).toBe(true);
    });

    it('should return true for free', () => {
        expect(isCameraMode('free')).toBe(true);
    });

    it('should return false for invalid mode', () => {
        expect(isCameraMode('invalid')).toBe(false);
    });

    it('should return false for non-string', () => {
        expect(isCameraMode(123)).toBe(false);
    });
});

describe('computeSceneExtents', () => {
    it('should return extents for default config', () => {
        const extents = computeSceneExtents({ H: 120, Rt: 70, Rb: 45 });
        expect(extents).toBeDefined();
        expect(extents.paddedMax).toBeGreaterThan(0);
    });

    it('should handle null config', () => {
        const extents = computeSceneExtents(null);
        expect(extents.paddedMax).toBeGreaterThan(0);
    });

    it('should handle empty config', () => {
        const extents = computeSceneExtents({});
        expect(extents.paddedMax).toBe(70); // Default Rt=70, max(halfHeight=60, maxRadius=70)=70
    });

    it('should compute max radius correctly', () => {
        const extents = computeSceneExtents({ H: 100, Rt: 80, Rb: 40 });
        expect(extents.paddedHalfWidth).toBe(80); // max of Rt, Rb
    });
});

describe('DEBUG_PARAM_FLAG', () => {
    it('should be a string', () => {
        expect(typeof DEBUG_PARAM_FLAG).toBe('string');
    });
});

describe('ALWAYS_ON_DIAGNOSTICS', () => {
    it('should be a Set', () => {
        expect(ALWAYS_ON_DIAGNOSTICS).toBeInstanceOf(Set);
    });

    it('should contain shader-compile-error', () => {
        expect(ALWAYS_ON_DIAGNOSTICS.has('webgpu:shader-compile-error')).toBe(true);
    });

    it('should contain pipeline-ready', () => {
        expect(ALWAYS_ON_DIAGNOSTICS.has('webgpu:pipeline-ready')).toBe(true);
    });
});
