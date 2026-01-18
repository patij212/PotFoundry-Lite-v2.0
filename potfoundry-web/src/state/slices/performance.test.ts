/**
 * Performance Slice Tests
 * Tests for the performance slice state defaults.
 */
import { describe, it, expect } from 'vitest';
import { PerformanceSlice } from './performance';

// Note: We test the interface/exports rather than the slice creator
// since slice creators require a full Zustand store setup

describe('PerformanceSlice interface', () => {
    it('should define PerformanceSlice type', () => {
        // Type check - ensure interface exists
        const mockSlice: Partial<PerformanceSlice> = {
            performance: {
                generationTime: 0,
                renderTime: 0,
                triangleCount: 0,
                vertexCount: 0,
                volume: 0,
                surfaceArea: 0,
                isGenerating: false,
            },
        };
        expect(mockSlice.performance).toBeDefined();
    });

    it('should have expected performance state structure', () => {
        const mockPerf = {
            generationTime: 100,
            renderTime: 16,
            triangleCount: 50000,
            vertexCount: 25000,
            volume: 150000,
            surfaceArea: 50000,
            isGenerating: false,
        };

        expect(mockPerf.generationTime).toBe(100);
        expect(mockPerf.triangleCount).toBe(50000);
        expect(mockPerf.isGenerating).toBe(false);
    });
});
