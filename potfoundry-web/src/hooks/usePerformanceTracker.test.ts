/**
 * Performance Tracker Tests
 * Tests for the parseStatusMetrics utility function.
 */
import { describe, it, expect } from 'vitest';
import { parseStatusMetrics } from './usePerformanceTracker';

describe('parseStatusMetrics', () => {
    it('should parse triangle count from status string', () => {
        const result = parseStatusMetrics('WebGPU • 123,456 tris • 60 FPS');
        expect(result).not.toBeNull();
        expect(result?.triangleCount).toBe(123456);
    });

    it('should parse FPS and compute render time', () => {
        const result = parseStatusMetrics('WebGPU • 50,000 tris • 60 FPS');
        expect(result).not.toBeNull();
        expect(result?.renderTime).toBeCloseTo(1000 / 60, 1);
    });

    it('should return null for invalid status', () => {
        const result = parseStatusMetrics('Invalid status');
        expect(result).toBeNull();
    });

    it('should handle status without FPS', () => {
        const result = parseStatusMetrics('WebGPU • 100,000 tris');
        expect(result).not.toBeNull();
        expect(result?.triangleCount).toBe(100000);
        expect(result?.renderTime).toBeUndefined();
    });

    it('should handle numbers without commas', () => {
        const result = parseStatusMetrics('WebGPU • 5000 tris • 30 FPS');
        expect(result?.triangleCount).toBe(5000);
    });

    it('should be case insensitive for tris', () => {
        const result = parseStatusMetrics('WebGPU • 10,000 TRIS');
        expect(result?.triangleCount).toBe(10000);
    });
});
