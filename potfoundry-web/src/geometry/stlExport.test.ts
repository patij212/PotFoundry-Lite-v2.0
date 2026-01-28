/**
 * STL Export Tests
 * 
 * Comprehensive tests for STL file generation:
 * - Binary STL generation (generateBinarySTL)
 * - Streaming STL generation (generateStreamingSTLBlob)
 * - ASCII STL generation (generateAsciiSTL)
 * - STL Blob generation (generateSTLBlob)
 * - Size estimation and formatting utilities
 */
import { describe, it, expect } from 'vitest';
import {
    generateBinarySTL,
    generateStreamingSTLBlob,
    generateAsciiSTL,
    generateSTLBlob,
    estimateSTLSize,
    formatFileSize,
} from './stlExport';
import type { MeshData } from './types';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a simple test mesh (single triangle)
 */
function createSingleTriangleMesh(): MeshData {
    return {
        vertices: new Float32Array([
            0, 0, 0,   // v0
            1, 0, 0,   // v1
            0, 1, 0,   // v2
        ]),
        indices: new Uint32Array([0, 1, 2]),
        vertexCount: 3,
        triangleCount: 1,
    };
}

/**
 * Create a two-triangle mesh (quad)
 */
function createQuadMesh(): MeshData {
    return {
        vertices: new Float32Array([
            0, 0, 0,   // v0 - bottom left
            1, 0, 0,   // v1 - bottom right
            1, 1, 0,   // v2 - top right
            0, 1, 0,   // v3 - top left
        ]),
        indices: new Uint32Array([
            0, 1, 2,   // first triangle
            0, 2, 3,   // second triangle
        ]),
        vertexCount: 4,
        triangleCount: 2,
    };
}

/**
 * Create a larger test mesh for streaming tests
 */
function createLargeMesh(triangleCount: number): MeshData {
    const vertexCount = triangleCount * 3; // Non-indexed for simplicity
    const vertices = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(triangleCount * 3);

    for (let i = 0; i < triangleCount; i++) {
        const base = i * 9;
        const t = i / triangleCount;

        // Create triangles in a spiral pattern
        vertices[base + 0] = Math.cos(t * Math.PI * 4) * (10 + t * 20);
        vertices[base + 1] = Math.sin(t * Math.PI * 4) * (10 + t * 20);
        vertices[base + 2] = t * 100;

        vertices[base + 3] = vertices[base + 0] + 1;
        vertices[base + 4] = vertices[base + 1];
        vertices[base + 5] = vertices[base + 2];

        vertices[base + 6] = vertices[base + 0] + 0.5;
        vertices[base + 7] = vertices[base + 1] + 1;
        vertices[base + 8] = vertices[base + 2];

        indices[i * 3 + 0] = i * 3;
        indices[i * 3 + 1] = i * 3 + 1;
        indices[i * 3 + 2] = i * 3 + 2;
    }

    return {
        vertices,
        indices,
        vertexCount,
        triangleCount,
    };
}

/**
 * Create mesh with potential edge cases
 */
function createEdgeCaseMesh(): MeshData {
    return {
        vertices: new Float32Array([
            0, 0, 0,         // v0 - origin
            1e-10, 1e-10, 0, // v1 - very small values (near-degenerate)
            0, 0, 0,         // v2 - duplicate of v0 (degenerate triangle)
            NaN, 0, 0,       // v3 - NaN value
            Infinity, 0, 0,  // v4 - Infinity value
            1, 1, 1,         // v5 - normal vertex
        ]),
        indices: new Uint32Array([
            0, 1, 2,  // degenerate triangle
            3, 4, 5,  // triangle with invalid vertices
        ]),
        vertexCount: 6,
        triangleCount: 2,
    };
}

// ============================================================================
// generateBinarySTL Tests
// ============================================================================

describe('generateBinarySTL', () => {
    it('should generate correct buffer size', () => {
        const mesh = createSingleTriangleMesh();
        const buffer = generateBinarySTL(mesh);

        // Expected: 80 header + 4 count + 50 per triangle
        expect(buffer.byteLength).toBe(84 + 1 * 50);
    });

    it('should write correct header', () => {
        const mesh = createSingleTriangleMesh();
        const buffer = generateBinarySTL(mesh, 'TestModel');

        // Read first 80 bytes as header
        const headerBytes = new Uint8Array(buffer, 0, 80);
        const header = String.fromCharCode(...headerBytes).trim();

        expect(header).toContain('Binary STL');
        expect(header).toContain('TestModel');
    });

    it('should write correct triangle count', () => {
        const mesh = createQuadMesh();
        const buffer = generateBinarySTL(mesh);
        const view = new DataView(buffer);

        const triangleCount = view.getUint32(80, true); // Little-endian
        expect(triangleCount).toBe(2);
    });

    it('should write triangle data in correct format', () => {
        const mesh = createSingleTriangleMesh();
        const buffer = generateBinarySTL(mesh);
        const view = new DataView(buffer);

        // Triangle data starts at offset 84
        // Format: normal (12 bytes) + 3 vertices (36 bytes) + attribute (2 bytes) = 50 bytes

        // Read normal (should be [0, 0, 1] for XY plane triangle)
        const nx = view.getFloat32(84, true);
        const ny = view.getFloat32(88, true);
        const nz = view.getFloat32(92, true);

        expect(nx).toBeCloseTo(0, 5);
        expect(ny).toBeCloseTo(0, 5);
        expect(nz).toBeCloseTo(1, 5); // Normal points up (+Z)

        // Read first vertex (v0 = [0, 0, 0])
        const v0x = view.getFloat32(96, true);
        const v0y = view.getFloat32(100, true);
        const v0z = view.getFloat32(104, true);

        expect(v0x).toBeCloseTo(0, 5);
        expect(v0y).toBeCloseTo(0, 5);
        expect(v0z).toBeCloseTo(0, 5);
    });

    it('should write attribute byte count as zero', () => {
        const mesh = createSingleTriangleMesh();
        const buffer = generateBinarySTL(mesh);
        const view = new DataView(buffer);

        // Attribute byte count is at offset 84 + 48 (after normal and vertices)
        const attrCount = view.getUint16(132, true);
        expect(attrCount).toBe(0);
    });

    it('should handle multiple triangles', () => {
        const mesh = createQuadMesh();
        const buffer = generateBinarySTL(mesh);

        expect(buffer.byteLength).toBe(84 + 2 * 50);
    });

    it('should handle edge cases with invalid vertices', () => {
        const mesh = createEdgeCaseMesh();

        // Should not throw
        expect(() => generateBinarySTL(mesh)).not.toThrow();

        const buffer = generateBinarySTL(mesh);
        expect(buffer.byteLength).toBe(84 + 2 * 50);
    });

    it('should use default name if not provided', () => {
        const mesh = createSingleTriangleMesh();
        const buffer = generateBinarySTL(mesh);

        const headerBytes = new Uint8Array(buffer, 0, 80);
        const header = String.fromCharCode(...headerBytes).trim();

        expect(header).toContain('PotFoundry');
    });
});

// ============================================================================
// generateStreamingSTLBlob Tests
// ============================================================================

describe('generateStreamingSTLBlob', () => {
    it('should generate Blob with correct size', () => {
        const mesh = createQuadMesh();
        const blob = generateStreamingSTLBlob(mesh);

        // Expected: 84 header + 2 triangles * 50
        expect(blob.size).toBe(84 + 2 * 50);
    });

    it('should have correct MIME type', () => {
        const mesh = createSingleTriangleMesh();
        const blob = generateStreamingSTLBlob(mesh);

        expect(blob.type).toBe('application/octet-stream');
    });

    it('should process large meshes with multiple chunks', () => {
        const mesh = createLargeMesh(1000);
        const chunkSize = 100;
        const progressCalls: number[] = [];

        const blob = generateStreamingSTLBlob(mesh, 'LargeMesh', chunkSize, (progress) => {
            progressCalls.push(progress);
        });
        // Should call progress callback for each chunk
        expect(blob.size).toBeGreaterThan(0); // Use blob to avoid unused warning
        expect(progressCalls.length).toBe(10); // 1000 triangles / 100 per chunk
        expect(progressCalls[progressCalls.length - 1]).toBe(1); // Final progress = 1
    });

    it('should report progress correctly', () => {
        const mesh = createLargeMesh(500);
        const chunkSize = 100;
        let lastProgress = 0;

        generateStreamingSTLBlob(mesh, 'Test', chunkSize, (progress) => {
            expect(progress).toBeGreaterThanOrEqual(lastProgress);
            lastProgress = progress;
        });

        expect(lastProgress).toBe(1);
    });

    it('should produce same size as generateBinarySTL for small meshes', () => {
        const mesh = createQuadMesh();

        const directBuffer = generateBinarySTL(mesh);
        const streamingBlob = generateStreamingSTLBlob(mesh);

        // Sizes should match
        expect(streamingBlob.size).toBe(directBuffer.byteLength);
    });

    it('should handle single triangle', () => {
        const mesh = createSingleTriangleMesh();
        const blob = generateStreamingSTLBlob(mesh);

        expect(blob.size).toBe(84 + 50);
    });
});

// ============================================================================
// generateAsciiSTL Tests
// ============================================================================

describe('generateAsciiSTL', () => {
    it('should start with solid header', () => {
        const mesh = createSingleTriangleMesh();
        const stl = generateAsciiSTL(mesh, 'TestModel');

        expect(stl.startsWith('solid TestModel')).toBe(true);
    });

    it('should end with endsolid footer', () => {
        const mesh = createSingleTriangleMesh();
        const stl = generateAsciiSTL(mesh, 'TestModel');

        expect(stl.trimEnd().endsWith('endsolid TestModel')).toBe(true);
    });

    it('should contain facet normal for each triangle', () => {
        const mesh = createQuadMesh();
        const stl = generateAsciiSTL(mesh);

        const facetMatches = stl.match(/facet normal/g);
        expect(facetMatches?.length).toBe(2);
    });

    it('should contain outer loop for each triangle', () => {
        const mesh = createQuadMesh();
        const stl = generateAsciiSTL(mesh);

        const loopMatches = stl.match(/outer loop/g);
        expect(loopMatches?.length).toBe(2);
    });

    it('should contain 3 vertices per triangle', () => {
        const mesh = createQuadMesh();
        const stl = generateAsciiSTL(mesh);

        const vertexMatches = stl.match(/vertex/g);
        expect(vertexMatches?.length).toBe(6); // 2 triangles * 3 vertices
    });

    it('should format numbers in scientific notation', () => {
        const mesh = createSingleTriangleMesh();
        const stl = generateAsciiSTL(mesh);

        // Should contain exponential notation (e.g., 1.000000e+00)
        expect(stl).toMatch(/\d\.\d+e[+-]\d+/);
    });

    it('should produce parseable STL', () => {
        const mesh = createSingleTriangleMesh();
        const stl = generateAsciiSTL(mesh);

        // Verify structure
        const lines = stl.split('\n');
        expect(lines[0]).toMatch(/^solid/);
        expect(lines[1]).toMatch(/facet normal/);
        expect(lines[2]).toMatch(/outer loop/);
        expect(lines[3]).toMatch(/vertex/);
        expect(lines[4]).toMatch(/vertex/);
        expect(lines[5]).toMatch(/vertex/);
        expect(lines[6]).toMatch(/endloop/);
        expect(lines[7]).toMatch(/endfacet/);
    });
});

// ============================================================================
// generateSTLBlob Tests
// ============================================================================

describe('generateSTLBlob', () => {
    it('should generate binary Blob by default', () => {
        const mesh = createSingleTriangleMesh();
        const blob = generateSTLBlob(mesh);

        expect(blob.type).toBe('application/octet-stream');
    });

    it('should generate ASCII Blob when binary is false', () => {
        const mesh = createSingleTriangleMesh();
        const blob = generateSTLBlob(mesh, { binary: false });

        expect(blob.type).toBe('text/plain');
    });

    it('should respect name option', () => {
        const mesh = createSingleTriangleMesh();
        // For name verification, use generateBinarySTL directly since Blob.arrayBuffer
        // is not available in vitest's Node.js environment
        const buffer = generateBinarySTL(mesh, 'CustomName');
        const header = String.fromCharCode(...new Uint8Array(buffer, 0, 80)).trim();

        expect(header).toContain('CustomName');
    });

    it('should generate correct size for binary', () => {
        const mesh = createQuadMesh();
        const blob = generateSTLBlob(mesh, { binary: true });

        expect(blob.size).toBe(84 + 2 * 50);
    });
});

// ============================================================================
// estimateSTLSize Tests (Extended)
// ============================================================================

describe('estimateSTLSize', () => {
    it('should estimate binary size correctly', () => {
        // Binary: 80 header + 4 count + triangles * 50
        const size = estimateSTLSize(10, true);
        expect(size).toBe(80 + 4 + 10 * 50);
    });

    it('should estimate ASCII size larger than binary', () => {
        const binarySize = estimateSTLSize(100, true);
        const asciiSize = estimateSTLSize(100, false);
        expect(asciiSize).toBeGreaterThan(binarySize);
    });

    it('should handle zero triangles', () => {
        const size = estimateSTLSize(0, true);
        expect(size).toBe(84); // Just header + count
    });

    it('should scale linearly with triangle count (binary)', () => {
        const size1 = estimateSTLSize(100, true);
        const size2 = estimateSTLSize(200, true);
        expect(size2 - size1).toBe(100 * 50);
    });

    it('should estimate 1M triangles correctly', () => {
        const size = estimateSTLSize(1_000_000, true);
        expect(size).toBe(84 + 1_000_000 * 50); // ~50 MB
    });

    it('should match actual binary STL size', () => {
        const mesh = createQuadMesh();
        const buffer = generateBinarySTL(mesh);
        const estimated = estimateSTLSize(mesh.triangleCount, true);

        expect(estimated).toBe(buffer.byteLength);
    });
});

// ============================================================================
// formatFileSize Tests (Extended)
// ============================================================================

describe('formatFileSize', () => {
    it('should format bytes', () => {
        expect(formatFileSize(500)).toContain('B');
        expect(formatFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
        const result = formatFileSize(2048);
        expect(result).toContain('KB');
        expect(result).toBe('2.0 KB');
    });

    it('should format megabytes', () => {
        const result = formatFileSize(2 * 1024 * 1024);
        expect(result).toContain('MB');
        expect(result).toBe('2.00 MB');
    });

    it('should handle zero', () => {
        expect(formatFileSize(0)).toBe('0 B');
    });

    it('should format large files', () => {
        const result = formatFileSize(1024 * 1024 * 1024);
        expect(result).toBeDefined();
        expect(result).toContain('MB');
    });

    it('should format boundary values correctly', () => {
        expect(formatFileSize(1023)).toBe('1023 B');
        expect(formatFileSize(1024)).toContain('KB');
        expect(formatFileSize(1024 * 1024 - 1)).toContain('KB');
        expect(formatFileSize(1024 * 1024)).toContain('MB');
    });
});

// ============================================================================
// Normal Computation Tests (Indirect via STL output)
// ============================================================================

describe('Normal Computation', () => {
    it('should compute correct normal for XY plane triangle', async () => {
        // Triangle in XY plane should have normal along +Z
        const mesh: MeshData = {
            vertices: new Float32Array([
                0, 0, 0,
                1, 0, 0,
                0, 1, 0,
            ]),
            indices: new Uint32Array([0, 1, 2]),
            vertexCount: 3,
            triangleCount: 1,
        };

        const buffer = generateBinarySTL(mesh);
        const view = new DataView(buffer);

        const nz = view.getFloat32(92, true);
        expect(nz).toBeCloseTo(1, 5); // Normal should be +Z
    });

    it('should compute correct normal for XZ plane triangle', async () => {
        // Triangle in XZ plane should have normal along +Y
        const mesh: MeshData = {
            vertices: new Float32Array([
                0, 0, 0,
                0, 0, 1,
                1, 0, 0,
            ]),
            indices: new Uint32Array([0, 1, 2]),
            vertexCount: 3,
            triangleCount: 1,
        };

        const buffer = generateBinarySTL(mesh);
        const view = new DataView(buffer);

        const ny = view.getFloat32(88, true);
        expect(Math.abs(ny)).toBeCloseTo(1, 5); // Normal should be along Y axis
    });

    it('should handle degenerate triangle (all same vertex)', async () => {
        const mesh: MeshData = {
            vertices: new Float32Array([
                0, 0, 0,
                0, 0, 0,
                0, 0, 0,
            ]),
            indices: new Uint32Array([0, 1, 2]),
            vertexCount: 3,
            triangleCount: 1,
        };

        // Should not throw
        const buffer = generateBinarySTL(mesh);
        const view = new DataView(buffer);

        // Default normal for degenerate case
        const nz = view.getFloat32(92, true);
        expect(nz).toBe(1); // Default fallback normal
    });
});
