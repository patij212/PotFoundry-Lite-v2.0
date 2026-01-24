/**
 * Mesh Decimator Unit Tests
 *
 * Tests for the mesh decimation functionality.
 * Since meshoptimizer WASM requires browser/Node with WASM support,
 * we focus on testing the utility functions that don't require WASM.
 */

import { describe, it, expect } from 'vitest';
import {
    calculateOptimalDecimationRatio,
    estimateDecimatedFileSize,
    compactMesh,
} from './meshDecimator';
import type { MeshData } from './types';

// ============================================================================
// Mock Mesh Data
// ============================================================================

/**
 * Create a simple test mesh
 */
function createTestMesh(vertexCount: number, triangleCount: number): MeshData {
    const vertices = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(triangleCount * 3);

    // Fill with simple pattern
    for (let i = 0; i < vertexCount; i++) {
        vertices[i * 3] = i % 100;     // x
        vertices[i * 3 + 1] = i % 50;  // y
        vertices[i * 3 + 2] = i;       // z
    }

    // Create triangle strip pattern
    for (let i = 0; i < triangleCount; i++) {
        indices[i * 3] = i % vertexCount;
        indices[i * 3 + 1] = (i + 1) % vertexCount;
        indices[i * 3 + 2] = (i + 2) % vertexCount;
    }

    return { vertices, indices, vertexCount, triangleCount };
}

// ============================================================================
// calculateOptimalDecimationRatio Tests
// ============================================================================

describe('calculateOptimalDecimationRatio', () => {
    it('should return 1.0 for meshes under 2M triangles', () => {
        const mesh = createTestMesh(1000, 1_000_000);
        const ratio = calculateOptimalDecimationRatio(mesh);
        expect(ratio).toBe(1.0);
    });

    it('should return 1.0 for meshes exactly at 2M triangles', () => {
        const mesh = createTestMesh(1000, 2_000_000);
        const ratio = calculateOptimalDecimationRatio(mesh);
        expect(ratio).toBe(1.0);
    });

    it('should return reduced ratio for meshes between 2M-5M triangles', () => {
        const mesh = createTestMesh(1000, 4_000_000);
        const ratio = calculateOptimalDecimationRatio(mesh);
        expect(ratio).toBeLessThan(1.0);
        expect(ratio).toBeGreaterThan(0.4); // 2M/4M = 0.5
    });

    it('should return aggressive ratio for very large meshes', () => {
        const mesh = createTestMesh(1000, 20_000_000);
        const ratio = calculateOptimalDecimationRatio(mesh);
        expect(ratio).toBeLessThan(0.2);
        expect(ratio).toBeGreaterThanOrEqual(0.05); // Minimum ratio
    });

    it('should never go below 5% for any mesh size', () => {
        const mesh = createTestMesh(1000, 100_000_000); // 100M triangles
        const ratio = calculateOptimalDecimationRatio(mesh);
        expect(ratio).toBe(0.05);
    });
});

// ============================================================================
// estimateDecimatedFileSize Tests
// ============================================================================

describe('estimateDecimatedFileSize', () => {
    it('should calculate correct STL size after decimation', () => {
        const originalTriangles = 1_000_000;
        const targetRatio = 0.5;
        const size = estimateDecimatedFileSize(originalTriangles, targetRatio);

        // Expected: 84 + 500,000 * 50 = 25,000,084 bytes
        expect(size).toBe(84 + 500_000 * 50);
    });

    it('should handle full ratio (no decimation)', () => {
        const originalTriangles = 100_000;
        const size = estimateDecimatedFileSize(originalTriangles, 1.0);
        expect(size).toBe(84 + 100_000 * 50);
    });

    it('should handle very small ratio', () => {
        const originalTriangles = 1_000_000;
        const size = estimateDecimatedFileSize(originalTriangles, 0.01);
        // Expected: 84 + 10,000 * 50 = 500,084 bytes
        expect(size).toBe(84 + 10_000 * 50);
    });
});

// ============================================================================
// compactMesh Tests
// ============================================================================

describe('compactMesh', () => {
    it('should return identical mesh when all vertices are used', () => {
        // Create a simple triangle mesh where all 3 vertices are used
        const mesh: MeshData = {
            vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]),
            indices: new Uint32Array([0, 1, 2]),
            vertexCount: 3,
            triangleCount: 1,
        };

        const compacted = compactMesh(mesh);

        expect(compacted.vertexCount).toBe(3);
        expect(compacted.triangleCount).toBe(1);
        expect(compacted.vertices.length).toBe(9);
        expect(compacted.indices.length).toBe(3);
    });

    it('should remove unused vertices', () => {
        // Create a mesh with unused vertices
        const mesh: MeshData = {
            vertices: new Float32Array([
                0, 0, 0,  // v0 - used
                1, 0, 0,  // v1 - UNUSED
                2, 0, 0,  // v2 - used
                3, 0, 0,  // v3 - used
            ]),
            indices: new Uint32Array([0, 2, 3]), // Only uses v0, v2, v3
            vertexCount: 4,
            triangleCount: 1,
        };

        const compacted = compactMesh(mesh);

        expect(compacted.vertexCount).toBe(3); // Only 3 vertices used
        expect(compacted.triangleCount).toBe(1);
        expect(compacted.vertices.length).toBe(9);

        // Verify indices are remapped correctly
        expect(compacted.indices[0]).toBe(0);
        expect(compacted.indices[1]).toBe(1);
        expect(compacted.indices[2]).toBe(2);
    });

    it('should handle meshes with many unused vertices', () => {
        // 10 vertices, but only 3 are used
        const vertices = new Float32Array(30);
        for (let i = 0; i < 10; i++) {
            vertices[i * 3] = i;
            vertices[i * 3 + 1] = i * 2;
            vertices[i * 3 + 2] = i * 3;
        }

        const mesh: MeshData = {
            vertices,
            indices: new Uint32Array([1, 5, 9]), // Only use vertices 1, 5, 9
            vertexCount: 10,
            triangleCount: 1,
        };

        const compacted = compactMesh(mesh);

        expect(compacted.vertexCount).toBe(3);
        expect(compacted.triangleCount).toBe(1);

        // Verify the vertex data was preserved correctly
        // v1 -> v0 in compacted
        expect(compacted.vertices[0]).toBe(1);
        expect(compacted.vertices[1]).toBe(2);
        expect(compacted.vertices[2]).toBe(3);

        // v5 -> v1 in compacted
        expect(compacted.vertices[3]).toBe(5);
        expect(compacted.vertices[4]).toBe(10);
        expect(compacted.vertices[5]).toBe(15);

        // v9 -> v2 in compacted
        expect(compacted.vertices[6]).toBe(9);
        expect(compacted.vertices[7]).toBe(18);
        expect(compacted.vertices[8]).toBe(27);
    });

    it('should preserve triangle count', () => {
        const mesh: MeshData = {
            vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
            indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
            vertexCount: 4,
            triangleCount: 2,
        };

        const compacted = compactMesh(mesh);

        expect(compacted.triangleCount).toBe(2);
        expect(compacted.indices.length).toBe(6);
    });
});
