/**
 * STL Export Tests
 *
 * Comprehensive tests for STL file generation:
 * - generateBinarySTL: Binary format export
 * - generateAsciiSTL: ASCII format export
 * - downloadSTL: Browser download trigger
 * - generateSTLBlob: Blob generation
 * - estimateSTLSize: File size estimation
 * - formatFileSize: Human-readable formatting
 *
 * @module geometry/stlExport.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateBinarySTL,
  generateAsciiSTL,
  generateSTLBlob,
  estimateSTLSize,
  formatFileSize,
} from './stlExport';
import { MeshData } from './types';
import { buildPotMesh } from './meshBuilder';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Create a simple cube mesh for testing
 * 8 vertices, 12 triangles (2 per face)
 */
function createCubeMesh(): MeshData {
  const vertices = new Float32Array([
    // Front face
    0, 0, 0, // 0
    10, 0, 0, // 1
    10, 10, 0, // 2
    0, 10, 0, // 3
    // Back face
    0, 0, 10, // 4
    10, 0, 10, // 5
    10, 10, 10, // 6
    0, 10, 10, // 7
  ]);

  const indices = new Uint32Array([
    // Front
    0, 1, 2, 0, 2, 3,
    // Back
    4, 6, 5, 4, 7, 6,
    // Left
    0, 3, 7, 0, 7, 4,
    // Right
    1, 5, 6, 1, 6, 2,
    // Bottom
    0, 4, 5, 0, 5, 1,
    // Top
    3, 2, 6, 3, 6, 7,
  ]);

  return {
    vertices,
    indices,
    vertexCount: 8,
    triangleCount: 12,
  };
}

/**
 * Create a simple triangle mesh for testing
 */
function createTriangleMesh(): MeshData {
  const vertices = new Float32Array([
    0, 0, 0, // 0
    10, 0, 0, // 1
    5, 10, 0, // 2
  ]);

  const indices = new Uint32Array([0, 1, 2]);

  return {
    vertices,
    indices,
    vertexCount: 3,
    triangleCount: 1,
  };
}

// ============================================================================
// generateBinarySTL Tests
// ============================================================================

describe('generateBinarySTL', () => {
  describe('basic functionality', () => {
    it('should return an ArrayBuffer', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh);

      expect(buffer).toBeInstanceOf(ArrayBuffer);
    });

    it('should have correct size for header + count + triangles', () => {
      const mesh = createCubeMesh();
      const buffer = generateBinarySTL(mesh);

      // 80 header + 4 count + 50 * triangleCount
      const expectedSize = 84 + 50 * mesh.triangleCount;
      expect(buffer.byteLength).toBe(expectedSize);
    });

    it('should have correct size for single triangle', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh);

      // 80 header + 4 count + 50 * 1
      expect(buffer.byteLength).toBe(134);
    });
  });

  describe('header structure', () => {
    it('should have 80-byte header starting with model name', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh, 'TestModel');
      const view = new DataView(buffer);

      // Read header as ASCII
      let header = '';
      for (let i = 0; i < 80; i++) {
        header += String.fromCharCode(view.getUint8(i));
      }

      expect(header).toContain('TestModel');
    });

    it('should use default name if not provided', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh);
      const view = new DataView(buffer);

      let header = '';
      for (let i = 0; i < 80; i++) {
        header += String.fromCharCode(view.getUint8(i));
      }

      expect(header).toContain('PotFoundry');
    });
  });

  describe('triangle count', () => {
    it('should store correct triangle count after header', () => {
      const mesh = createCubeMesh();
      const buffer = generateBinarySTL(mesh);
      const view = new DataView(buffer);

      const count = view.getUint32(80, true); // little-endian
      expect(count).toBe(mesh.triangleCount);
    });

    it('should store count in little-endian format', () => {
      const mesh = createCubeMesh();
      const buffer = generateBinarySTL(mesh);
      const view = new DataView(buffer);

      // Read both ways to verify endianness
      const littleEndian = view.getUint32(80, true);
      const bigEndian = view.getUint32(80, false);

      expect(littleEndian).toBe(12);
      expect(bigEndian).not.toBe(12); // Should differ
    });
  });

  describe('triangle data', () => {
    it('should store 50 bytes per triangle', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh);

      // Total: 84 + 50 = 134 bytes
      expect(buffer.byteLength).toBe(134);
    });

    it('should store normal + 3 vertices + attribute per triangle', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh);
      const view = new DataView(buffer);

      // First triangle starts at offset 84
      // Normal: 3 x float32 = 12 bytes
      // Vertices: 3 x 3 x float32 = 36 bytes
      // Attribute: uint16 = 2 bytes
      // Total: 50 bytes

      // Read normal
      const nx = view.getFloat32(84, true);
      const ny = view.getFloat32(88, true);
      const nz = view.getFloat32(92, true);

      // For a triangle in XY plane (z=0), normal should point in Z direction
      expect(Math.abs(nx)).toBeLessThan(0.01);
      expect(Math.abs(ny)).toBeLessThan(0.01);
      expect(Math.abs(nz)).toBeCloseTo(1, 1);
    });

    it('should have zero attribute bytes', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh);
      const view = new DataView(buffer);

      // Attribute bytes at end of first triangle (offset 84 + 48)
      const attr = view.getUint16(132, true);
      expect(attr).toBe(0);
    });
  });

  describe('vertex data accuracy', () => {
    it('should preserve vertex coordinates', () => {
      const mesh = createTriangleMesh();
      const buffer = generateBinarySTL(mesh);
      const view = new DataView(buffer);

      // First vertex starts at offset 96 (84 + 12 for normal)
      const v0x = view.getFloat32(96, true);
      const v0y = view.getFloat32(100, true);
      const v0z = view.getFloat32(104, true);

      expect(v0x).toBeCloseTo(0, 5);
      expect(v0y).toBeCloseTo(0, 5);
      expect(v0z).toBeCloseTo(0, 5);

      // Second vertex at offset 108
      const v1x = view.getFloat32(108, true);
      const v1y = view.getFloat32(112, true);
      const v1z = view.getFloat32(116, true);

      expect(v1x).toBeCloseTo(10, 5);
      expect(v1y).toBeCloseTo(0, 5);
      expect(v1z).toBeCloseTo(0, 5);
    });
  });

  describe('pot mesh export', () => {
    it('should export real pot mesh without errors', () => {
      const result = buildPotMesh(
        { H: 50, Rt: 25, Rb: 20, tWall: 2, tBottom: 3, rDrain: 5, expn: 0.4 },
        { nTheta: 32, nZ: 16 },
        'SuperformulaBlossom',
        {}
      );

      const buffer = generateBinarySTL(result.mesh);

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(84 + 50 * result.mesh.triangleCount);
    });
  });
});

// ============================================================================
// generateAsciiSTL Tests
// ============================================================================

describe('generateAsciiSTL', () => {
  describe('basic functionality', () => {
    it('should return a string', () => {
      const mesh = createTriangleMesh();
      const stl = generateAsciiSTL(mesh);

      expect(typeof stl).toBe('string');
    });

    it('should start with "solid" and model name', () => {
      const mesh = createTriangleMesh();
      const stl = generateAsciiSTL(mesh, 'TestModel');

      expect(stl.startsWith('solid TestModel')).toBe(true);
    });

    it('should end with "endsolid" and model name', () => {
      const mesh = createTriangleMesh();
      const stl = generateAsciiSTL(mesh, 'TestModel');

      expect(stl).toContain('endsolid TestModel');
    });
  });

  describe('structure', () => {
    it('should have correct facet structure', () => {
      const mesh = createTriangleMesh();
      const stl = generateAsciiSTL(mesh);

      expect(stl).toContain('facet normal');
      expect(stl).toContain('outer loop');
      expect(stl).toContain('vertex');
      expect(stl).toContain('endloop');
      expect(stl).toContain('endfacet');
    });

    it('should have 3 vertices per facet', () => {
      const mesh = createTriangleMesh();
      const stl = generateAsciiSTL(mesh);

      const vertexCount = (stl.match(/vertex/g) || []).length;
      expect(vertexCount).toBe(3 * mesh.triangleCount);
    });

    it('should have one facet per triangle', () => {
      const mesh = createCubeMesh();
      const stl = generateAsciiSTL(mesh);

      const facetCount = (stl.match(/facet normal/g) || []).length;
      expect(facetCount).toBe(mesh.triangleCount);
    });
  });

  describe('formatting', () => {
    it('should use exponential notation for coordinates', () => {
      const mesh = createTriangleMesh();
      const stl = generateAsciiSTL(mesh);

      // Should contain exponential notation (e.g., 1.000000e+01)
      expect(stl).toMatch(/\d+\.\d+e[+-]\d+/i);
    });
  });

  describe('compatibility', () => {
    it('should produce parseable ASCII STL for pot mesh', () => {
      const result = buildPotMesh(
        { H: 50, Rt: 25, Rb: 20, tWall: 2, tBottom: 3, rDrain: 5, expn: 0.4 },
        { nTheta: 16, nZ: 8 },
        'SuperformulaBlossom',
        {}
      );

      const stl = generateAsciiSTL(result.mesh);

      // Basic structure checks
      expect(stl).toContain('solid');
      expect(stl).toContain('endsolid');

      const facetCount = (stl.match(/facet normal/g) || []).length;
      expect(facetCount).toBe(result.mesh.triangleCount);
    });
  });
});

// ============================================================================
// generateSTLBlob Tests
// ============================================================================

describe('generateSTLBlob', () => {
  it('should return a Blob', () => {
    const mesh = createTriangleMesh();
    const blob = generateSTLBlob(mesh);

    expect(blob).toBeInstanceOf(Blob);
  });

  it('should create binary blob by default', () => {
    const mesh = createCubeMesh();
    const blob = generateSTLBlob(mesh);

    // Binary: 84 + 50 * triangles
    const expectedSize = 84 + 50 * mesh.triangleCount;
    expect(blob.size).toBe(expectedSize);
  });

  it('should create binary blob with binary: true', () => {
    const mesh = createCubeMesh();
    const blob = generateSTLBlob(mesh, { binary: true });

    expect(blob.type).toBe('application/octet-stream');
  });

  it('should create ASCII blob with binary: false', () => {
    const mesh = createCubeMesh();
    const blob = generateSTLBlob(mesh, { binary: false });

    expect(blob.type).toBe('text/plain');
  });

  it('should accept name option', () => {
    const mesh = createTriangleMesh();
    const blob = generateSTLBlob(mesh, { name: 'CustomName' });

    expect(blob.size).toBeGreaterThan(0);
  });
});

// ============================================================================
// estimateSTLSize Tests
// ============================================================================

describe('estimateSTLSize', () => {
  it('should calculate correct binary size', () => {
    const triangleCount = 100;
    const size = estimateSTLSize(triangleCount, true);

    // 84 + 50 * 100 = 5084
    expect(size).toBe(5084);
  });

  it('should calculate approximate ASCII size', () => {
    const triangleCount = 100;
    const size = estimateSTLSize(triangleCount, false);

    // Approximately 220 bytes per triangle
    expect(size).toBe(22000);
  });

  it('should default to binary calculation', () => {
    const triangleCount = 50;
    const size = estimateSTLSize(triangleCount);

    // 84 + 50 * 50 = 2584
    expect(size).toBe(2584);
  });

  it('should handle zero triangles', () => {
    expect(estimateSTLSize(0, true)).toBe(84);
    expect(estimateSTLSize(0, false)).toBe(0);
  });

  it('should handle large triangle counts', () => {
    const size = estimateSTLSize(1000000, true);

    // 84 + 50 * 1000000 = 50000084
    expect(size).toBe(50000084);
  });
});

// ============================================================================
// formatFileSize Tests
// ============================================================================

describe('formatFileSize', () => {
  it('should format bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('should format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(10240)).toBe('10.0 KB');
  });

  it('should format megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.00 MB');
  });

  it('should handle edge cases at unit boundaries', () => {
    expect(formatFileSize(1023)).toBe('1023 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1024 * 1024 - 1)).toContain('KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
  });
});

// ============================================================================
// Binary vs ASCII Comparison Tests
// ============================================================================

describe('Binary vs ASCII comparison', () => {
  it('binary should be smaller than ASCII', () => {
    const mesh = createCubeMesh();
    const binaryBlob = generateSTLBlob(mesh, { binary: true });
    const asciiBlob = generateSTLBlob(mesh, { binary: false });

    expect(binaryBlob.size).toBeLessThan(asciiBlob.size);
  });

  it('binary/ASCII size ratio should be approximately 4-5x', () => {
    const result = buildPotMesh(
      { H: 50, Rt: 25, Rb: 20, tWall: 2, tBottom: 3, rDrain: 5, expn: 0.4 },
      { nTheta: 32, nZ: 16 },
      'SuperformulaBlossom',
      {}
    );

    const binaryBlob = generateSTLBlob(result.mesh, { binary: true });
    const asciiBlob = generateSTLBlob(result.mesh, { binary: false });

    const ratio = asciiBlob.size / binaryBlob.size;
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(6);
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge cases', () => {
  it('should handle mesh with large coordinates', () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        1000000, 1000000, 1000000,
        1000001, 1000000, 1000000,
        1000000, 1000001, 1000000,
      ]),
      indices: new Uint32Array([0, 1, 2]),
      vertexCount: 3,
      triangleCount: 1,
    };

    const buffer = generateBinarySTL(mesh);
    expect(buffer.byteLength).toBe(134);

    const stl = generateAsciiSTL(mesh);
    // Check the ASCII output contains large values (either as 1e+06 or 1000000 format)
    expect(stl).toMatch(/1\.0+e\+0*6|1000000/);
  });

  it('should handle mesh with very small coordinates', () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        0.000001, 0.000001, 0.000001,
        0.000002, 0.000001, 0.000001,
        0.000001, 0.000002, 0.000001,
      ]),
      indices: new Uint32Array([0, 1, 2]),
      vertexCount: 3,
      triangleCount: 1,
    };

    const buffer = generateBinarySTL(mesh);
    expect(buffer.byteLength).toBe(134);
  });

  it('should handle degenerate triangles (zero area)', () => {
    const mesh: MeshData = {
      vertices: new Float32Array([
        0, 0, 0,
        10, 0, 0,
        5, 0, 0, // Collinear point
      ]),
      indices: new Uint32Array([0, 1, 2]),
      vertexCount: 3,
      triangleCount: 1,
    };

    // Should not throw
    const buffer = generateBinarySTL(mesh);
    expect(buffer.byteLength).toBe(134);

    // Normal should be zero for degenerate triangle
    const view = new DataView(buffer);
    const nx = view.getFloat32(84, true);
    const ny = view.getFloat32(88, true);
    const nz = view.getFloat32(92, true);

    expect(nx).toBe(0);
    expect(ny).toBe(0);
    expect(nz).toBe(0);
  });
});
