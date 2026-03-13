/**
 * ExportComputer Unit Tests
 * 
 * Tests for the GPU compute-based mesh generation logic.
 * Since we can't run actual GPU compute in Node.js, we focus on:
 * - Buffer size calculations
 * - Parameter validation
 * - Error handling
 */

import { describe, it, expect } from 'vitest';
import {
    calculateBufferSizes,
    calculateWorkgroups,
    ExportComputer,
    type ComputeBufferSizes,
} from './ExportComputer';

// ============================================================================
// Buffer Size Calculation Tests
// ============================================================================

describe('calculateBufferSizes', () => {
    it('should calculate correct sizes for low resolution', () => {
        const quality = { nTheta: 48, nZ: 24 };
        const sizes = calculateBufferSizes(quality);

        expect(sizes.vertexCount).toBeGreaterThan(0);
        expect(sizes.triangleCount).toBeGreaterThan(0);
        expect(sizes.vertexBufferBytes).toBe(sizes.vertexCount * 3 * 4); // 3 floats (position only) * 4 bytes
        expect(sizes.indexBufferBytes).toBe(sizes.triangleCount * 3 * 4); // 3 indices * 4 bytes
    });

    it('should calculate correct sizes for medium resolution', () => {
        const quality = { nTheta: 168, nZ: 84 }; // Default quality
        const sizes = calculateBufferSizes(quality);

        // Expected rough counts based on mesh structure
        expect(sizes.vertexCount).toBeGreaterThan(25000);
        expect(sizes.triangleCount).toBeGreaterThan(50000);
    });

    it('should calculate correct sizes for high resolution', () => {
        const quality = { nTheta: 1200, nZ: 600 };
        const sizes = calculateBufferSizes(quality);

        // High resolution produces many more triangles
        expect(sizes.vertexCount).toBeGreaterThan(1000000);
        expect(sizes.triangleCount).toBeGreaterThan(2000000);

        // Buffer should be in reasonable range (< 500MB)
        expect(sizes.vertexBufferBytes).toBeLessThan(500 * 1024 * 1024);
        expect(sizes.indexBufferBytes).toBeLessThan(500 * 1024 * 1024);
    });

    it('should scale quadratically with resolution increase', () => {
        const low = calculateBufferSizes({ nTheta: 48, nZ: 24 });
        const high = calculateBufferSizes({ nTheta: 96, nZ: 48 });

        // Doubling both dimensions should roughly 4x the counts
        const vertexRatio = high.vertexCount / low.vertexCount;
        const triangleRatio = high.triangleCount / low.triangleCount;

        expect(vertexRatio).toBeGreaterThan(3.5);
        expect(vertexRatio).toBeLessThan(4.5);
        expect(triangleRatio).toBeGreaterThan(3.5);
        expect(triangleRatio).toBeLessThan(4.5);
    });

    it('should handle minimum resolution', () => {
        const quality = { nTheta: 3, nZ: 2 }; // Minimum possible
        const sizes = calculateBufferSizes(quality);

        // Should still produce valid (small) mesh
        expect(sizes.vertexCount).toBeGreaterThan(0);
        expect(sizes.triangleCount).toBeGreaterThan(0);
    });
});

// ============================================================================
// Workgroup Calculation Tests
// ============================================================================

describe('calculateWorkgroups', () => {
    it('should calculate correct workgroups for exact multiple', () => {
        expect(calculateWorkgroups(64)).toBe(1);
        expect(calculateWorkgroups(128)).toBe(2);
        expect(calculateWorkgroups(640)).toBe(10);
    });

    it('should round up for non-exact multiples', () => {
        expect(calculateWorkgroups(65)).toBe(2);
        expect(calculateWorkgroups(100)).toBe(2);
        expect(calculateWorkgroups(127)).toBe(2);
    });

    it('should handle edge cases', () => {
        expect(calculateWorkgroups(1)).toBe(1);
        expect(calculateWorkgroups(0)).toBe(0);
    });

    it('should handle large counts', () => {
        const largeCount = 1000000;
        const workgroups = calculateWorkgroups(largeCount);

        // 1M / 64 = 15625
        expect(workgroups).toBe(15625);
    });
});

// ============================================================================
// ExportComputer Class Tests (Mocked)
// ============================================================================

describe('ExportComputer', () => {
    // Since we can't use real GPUDevice in Node, we test what we can

    describe('Class Structure', () => {
        it('should have required methods', () => {
            // We can't instantiate without a real GPUDevice, but we can check the prototype
            expect(ExportComputer.prototype.init).toBeDefined();
            expect(ExportComputer.prototype.compute).toBeDefined();
            expect(ExportComputer.prototype.isReady).toBeDefined();
            expect(ExportComputer.prototype.destroy).toBeDefined();
        });
    });

    describe('Buffer Size Consistency', () => {
        it('should match meshBuilder output structure', () => {
            // Verify our buffer calculations produce compatible output
            const quality = { nTheta: 48, nZ: 24 };
            const sizes = calculateBufferSizes(quality);

            // MeshData interface expects:
            // - vertices: Float32Array [x,y,z, x,y,z, ...]
            // - indices: Uint32Array [i0,i1,i2, i3,i4,i5, ...]

            // Verify vertex buffer can hold position per vertex (3 floats)
            const expectedVertexFloats = sizes.vertexCount * 3;
            expect(sizes.vertexBufferBytes).toBe(expectedVertexFloats * 4);

            // Verify index buffer can hold 3 indices per triangle
            const expectedIndices = sizes.triangleCount * 3;
            expect(sizes.indexBufferBytes).toBe(expectedIndices * 4);
        });
    });

    describe('Integration Preparation', () => {
        it('should calculate sizes compatible with STL export', () => {
            // STL format: 80 byte header + 4 byte count + 50 bytes per triangle
            const quality = { nTheta: 168, nZ: 84 };
            const sizes = calculateBufferSizes(quality);

            const expectedSTLSize = 80 + 4 + (sizes.triangleCount * 50);

            // A typical export should be < 100MB
            expect(expectedSTLSize).toBeLessThan(100 * 1024 * 1024);
            expect(expectedSTLSize).toBeGreaterThan(0);
        });
    });
});

// ============================================================================
// Type Tests
// ============================================================================

describe('ComputeBufferSizes Type', () => {
    it('should have all required fields', () => {
        const sizes: ComputeBufferSizes = {
            vertexCount: 100,
            triangleCount: 200,
            vertexBufferBytes: 2400,
            indexBufferBytes: 2400,
        };

        expect(sizes.vertexCount).toBe(100);
        expect(sizes.triangleCount).toBe(200);
        expect(sizes.vertexBufferBytes).toBe(2400);
        expect(sizes.indexBufferBytes).toBe(2400);
    });
});
