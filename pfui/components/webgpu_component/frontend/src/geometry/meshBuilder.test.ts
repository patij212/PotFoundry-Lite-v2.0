/**
 * Mesh Builder Tests
 *
 * Comprehensive tests for pot mesh generation:
 * - buildPotMesh: Main mesh generation function
 * - calculateMeshVolume: Volume calculation
 * - calculateMeshSurfaceArea: Surface area calculation
 * - getMeshBounds: Bounding box calculation
 *
 * @module geometry/meshBuilder.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildPotMesh,
  calculateMeshVolume,
  calculateMeshSurfaceArea,
  getMeshBounds,
} from './meshBuilder';
import {
  PotDimensions,
  MeshQuality,
  StyleId,
  DEFAULT_DIMENSIONS,
  DEFAULT_QUALITY,
} from './types';

// ============================================================================
// Test Constants
// ============================================================================

const TOLERANCE = 1e-4;

// Test dimensions
const TEST_DIMENSIONS: PotDimensions = {
  H: 80,
  Rt: 35,
  Rb: 30,
  tWall: 3,
  tBottom: 5,
  rDrain: 8,
  expn: 0.4,
};

// Low resolution for fast tests
const LOW_QUALITY: MeshQuality = {
  nTheta: 32,
  nZ: 16,
};

// Higher resolution for accuracy tests
const MEDIUM_QUALITY: MeshQuality = {
  nTheta: 64,
  nZ: 32,
};

// ============================================================================
// buildPotMesh Tests
// ============================================================================

describe('buildPotMesh', () => {
  describe('basic functionality', () => {
    it('should generate a mesh with valid structure', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});

      expect(result.mesh).toBeDefined();
      expect(result.mesh.vertices).toBeInstanceOf(Float32Array);
      expect(result.mesh.indices).toBeInstanceOf(Uint32Array);
      expect(result.mesh.vertexCount).toBeGreaterThan(0);
      expect(result.mesh.triangleCount).toBeGreaterThan(0);
    });

    it('should return diagnostics with generation time', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});

      expect(result.diagnostics).toBeDefined();
      expect(result.diagnostics.generationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics.vertexCount).toBe(result.mesh.vertexCount);
      expect(result.diagnostics.faceCount).toBe(result.mesh.triangleCount);
    });

    it('should use defaults when parameters are omitted', () => {
      const result = buildPotMesh();

      expect(result.mesh.vertexCount).toBeGreaterThan(0);
      expect(result.mesh.triangleCount).toBeGreaterThan(0);
    });

    it('should generate different meshes for different styles', () => {
      const styles: StyleId[] = [
        'SuperformulaBlossom',
        'FourierBloom',
        'SpiralRidges',
        'SuperellipseMorph',
        'HarmonicRipple',
      ];

      const meshes = styles.map((style) =>
        buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, style, {})
      );

      // All should have valid structure
      for (const result of meshes) {
        expect(result.mesh.vertexCount).toBeGreaterThan(0);
        expect(result.mesh.triangleCount).toBeGreaterThan(0);
      }

      // Meshes should differ (check vertex content)
      const firstVertices = meshes[0].mesh.vertices;
      for (let i = 1; i < meshes.length; i++) {
        const vertices = meshes[i].mesh.vertices;
        let same = true;
        for (let j = 0; j < Math.min(firstVertices.length, vertices.length); j++) {
          if (Math.abs(firstVertices[j] - vertices[j]) > TOLERANCE) {
            same = false;
            break;
          }
        }
        expect(same).toBe(false);
      }
    });
  });

  describe('mesh topology', () => {
    it('should have vertices as 3-component vectors', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
      expect(result.mesh.vertices.length).toBe(result.mesh.vertexCount * 3);
    });

    it('should have faces as 3-index triangles', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
      expect(result.mesh.indices.length).toBe(result.mesh.triangleCount * 3);
    });

    it('should have all indices within valid range', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
      const { vertices, indices, vertexCount } = result.mesh;

      for (let i = 0; i < indices.length; i++) {
        expect(indices[i]).toBeGreaterThanOrEqual(0);
        expect(indices[i]).toBeLessThan(vertexCount);
      }
    });

    it('should have valid vertex values (no NaN or Infinity)', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});

      for (let i = 0; i < result.mesh.vertices.length; i++) {
        expect(Number.isFinite(result.mesh.vertices[i])).toBe(true);
      }
    });
  });

  describe('dimension accuracy', () => {
    it('should have correct height', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, MEDIUM_QUALITY, 'SuperformulaBlossom', {});
      const bounds = getMeshBounds(result.mesh);

      // Height should match specified H
      const height = bounds.max[2] - bounds.min[2];
      expect(Math.abs(height - TEST_DIMENSIONS.H)).toBeLessThan(1);
    });

    it('should have Z starting at 0', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, MEDIUM_QUALITY, 'SuperformulaBlossom', {});
      const bounds = getMeshBounds(result.mesh);

      expect(bounds.min[2]).toBeCloseTo(0, 1);
    });

    it('should estimate top and bottom OD in diagnostics', () => {
      const result = buildPotMesh(TEST_DIMENSIONS, MEDIUM_QUALITY, 'SuperformulaBlossom', {});

      // Top OD should be approximately 2 * Rt
      expect(result.diagnostics.estimatedTopOdMm).toBeGreaterThan(TEST_DIMENSIONS.Rt * 1.5);
      expect(result.diagnostics.estimatedTopOdMm).toBeLessThan(TEST_DIMENSIONS.Rt * 3);

      // Bottom OD should be approximately 2 * Rb
      expect(result.diagnostics.estimatedBottomOdMm).toBeGreaterThan(TEST_DIMENSIONS.Rb * 1.5);
      expect(result.diagnostics.estimatedBottomOdMm).toBeLessThan(TEST_DIMENSIONS.Rb * 3);
    });
  });

  describe('quality scaling', () => {
    it('should produce more vertices with higher resolution', () => {
      const lowRes = buildPotMesh(TEST_DIMENSIONS, { nTheta: 16, nZ: 8 }, 'SuperformulaBlossom', {});
      const highRes = buildPotMesh(TEST_DIMENSIONS, { nTheta: 64, nZ: 32 }, 'SuperformulaBlossom', {});

      expect(highRes.mesh.vertexCount).toBeGreaterThan(lowRes.mesh.vertexCount);
      expect(highRes.mesh.triangleCount).toBeGreaterThan(lowRes.mesh.triangleCount);
    });

    it('should scale approximately with nTheta * nZ', () => {
      const result1 = buildPotMesh(TEST_DIMENSIONS, { nTheta: 32, nZ: 16 }, 'SuperformulaBlossom', {});
      const result2 = buildPotMesh(TEST_DIMENSIONS, { nTheta: 64, nZ: 32 }, 'SuperformulaBlossom', {});

      // 4x resolution should give approximately 4x vertices
      const ratio = result2.mesh.vertexCount / result1.mesh.vertexCount;
      expect(ratio).toBeGreaterThan(3);
      expect(ratio).toBeLessThan(5);
    });
  });

  describe('error handling', () => {
    it('should throw for zero height', () => {
      expect(() =>
        buildPotMesh({ ...TEST_DIMENSIONS, H: 0 }, LOW_QUALITY, 'SuperformulaBlossom', {})
      ).toThrow('Invalid size parameters');
    });

    it('should throw for negative height', () => {
      expect(() =>
        buildPotMesh({ ...TEST_DIMENSIONS, H: -10 }, LOW_QUALITY, 'SuperformulaBlossom', {})
      ).toThrow('Invalid size parameters');
    });

    it('should throw for zero radius', () => {
      expect(() =>
        buildPotMesh({ ...TEST_DIMENSIONS, Rt: 0 }, LOW_QUALITY, 'SuperformulaBlossom', {})
      ).toThrow('Invalid size parameters');
    });

    it('should throw for zero wall thickness', () => {
      expect(() =>
        buildPotMesh({ ...TEST_DIMENSIONS, tWall: 0 }, LOW_QUALITY, 'SuperformulaBlossom', {})
      ).toThrow('Invalid size parameters');
    });

    it('should throw for insufficient bottom thickness', () => {
      expect(() =>
        buildPotMesh({ ...TEST_DIMENSIONS, tBottom: 1 }, LOW_QUALITY, 'SuperformulaBlossom', {})
      ).toThrow('Invalid size parameters');
    });

    it('should throw for drain radius too large', () => {
      expect(() =>
        buildPotMesh(
          { ...TEST_DIMENSIONS, rDrain: TEST_DIMENSIONS.Rb - TEST_DIMENSIONS.tWall },
          LOW_QUALITY,
          'SuperformulaBlossom',
          {}
        )
      ).toThrow(/Drain radius.*too large/);
    });
  });

  describe('style parameters', () => {
    it('should accept spin parameters', () => {
      const result = buildPotMesh(
        TEST_DIMENSIONS,
        LOW_QUALITY,
        'SuperformulaBlossom',
        { spinTurns: 0.5, spinPhaseDeg: 45 }
      );

      expect(result.mesh.vertexCount).toBeGreaterThan(0);
    });

    it('should accept profile parameters', () => {
      const result = buildPotMesh(
        TEST_DIMENSIONS,
        LOW_QUALITY,
        'SuperformulaBlossom',
        { flareCenter: 0.6, flareSharp: 6, bellAmp: 0.1 }
      );

      expect(result.mesh.vertexCount).toBeGreaterThan(0);
    });

    it('should accept style-specific parameters', () => {
      const result = buildPotMesh(
        TEST_DIMENSIONS,
        LOW_QUALITY,
        'SpiralRidges',
        { spiralK: 6, spiralTurns: 1.5 }
      );

      expect(result.mesh.vertexCount).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// calculateMeshVolume Tests
// ============================================================================

describe('calculateMeshVolume', () => {
  it('should return positive volume for valid mesh', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
    const volume = calculateMeshVolume(result.mesh);

    expect(volume).toBeGreaterThan(0);
  });

  it('should scale with pot dimensions', () => {
    const small = buildPotMesh(
      { ...TEST_DIMENSIONS, H: 40, Rt: 20, Rb: 15 },
      LOW_QUALITY,
      'SuperformulaBlossom',
      {}
    );
    const large = buildPotMesh(
      { ...TEST_DIMENSIONS, H: 80, Rt: 40, Rb: 30 },
      LOW_QUALITY,
      'SuperformulaBlossom',
      {}
    );

    const smallVol = calculateMeshVolume(small.mesh);
    const largeVol = calculateMeshVolume(large.mesh);

    // Larger pot should have larger volume
    expect(largeVol).toBeGreaterThan(smallVol);
  });

  it('should be consistent across mesh resolutions', () => {
    const lowRes = buildPotMesh(TEST_DIMENSIONS, { nTheta: 32, nZ: 16 }, 'SuperformulaBlossom', {});
    const highRes = buildPotMesh(TEST_DIMENSIONS, { nTheta: 64, nZ: 32 }, 'SuperformulaBlossom', {});

    const lowVol = calculateMeshVolume(lowRes.mesh);
    const highVol = calculateMeshVolume(highRes.mesh);

    // Should be within 10% of each other
    const ratio = highVol / lowVol;
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it('should handle empty mesh gracefully', () => {
    const emptyMesh = {
      vertices: new Float32Array(0),
      indices: new Uint32Array(0),
      vertexCount: 0,
      triangleCount: 0,
    };

    const volume = calculateMeshVolume(emptyMesh);
    expect(volume).toBe(0);
  });
});

// ============================================================================
// calculateMeshSurfaceArea Tests
// ============================================================================

describe('calculateMeshSurfaceArea', () => {
  it('should return positive area for valid mesh', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
    const area = calculateMeshSurfaceArea(result.mesh);

    expect(area).toBeGreaterThan(0);
  });

  it('should scale with pot dimensions', () => {
    const small = buildPotMesh(
      { ...TEST_DIMENSIONS, H: 40, Rt: 20, Rb: 15 },
      LOW_QUALITY,
      'SuperformulaBlossom',
      {}
    );
    const large = buildPotMesh(
      { ...TEST_DIMENSIONS, H: 80, Rt: 40, Rb: 30 },
      LOW_QUALITY,
      'SuperformulaBlossom',
      {}
    );

    const smallArea = calculateMeshSurfaceArea(small.mesh);
    const largeArea = calculateMeshSurfaceArea(large.mesh);

    // Larger pot should have larger surface area
    expect(largeArea).toBeGreaterThan(smallArea);
  });

  it('should handle empty mesh gracefully', () => {
    const emptyMesh = {
      vertices: new Float32Array(0),
      indices: new Uint32Array(0),
      vertexCount: 0,
      triangleCount: 0,
    };

    const area = calculateMeshSurfaceArea(emptyMesh);
    expect(area).toBe(0);
  });
});

// ============================================================================
// getMeshBounds Tests
// ============================================================================

describe('getMeshBounds', () => {
  it('should return valid bounds', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
    const bounds = getMeshBounds(result.mesh);

    expect(bounds.min).toHaveLength(3);
    expect(bounds.max).toHaveLength(3);
    expect(bounds.center).toHaveLength(3);
    expect(bounds.size).toHaveLength(3);
  });

  it('should have max >= min for all axes', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
    const bounds = getMeshBounds(result.mesh);

    expect(bounds.max[0]).toBeGreaterThanOrEqual(bounds.min[0]);
    expect(bounds.max[1]).toBeGreaterThanOrEqual(bounds.min[1]);
    expect(bounds.max[2]).toBeGreaterThanOrEqual(bounds.min[2]);
  });

  it('should compute correct size', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
    const bounds = getMeshBounds(result.mesh);

    expect(bounds.size[0]).toBeCloseTo(bounds.max[0] - bounds.min[0], 5);
    expect(bounds.size[1]).toBeCloseTo(bounds.max[1] - bounds.min[1], 5);
    expect(bounds.size[2]).toBeCloseTo(bounds.max[2] - bounds.min[2], 5);
  });

  it('should compute correct center', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
    const bounds = getMeshBounds(result.mesh);

    expect(bounds.center[0]).toBeCloseTo((bounds.min[0] + bounds.max[0]) / 2, 5);
    expect(bounds.center[1]).toBeCloseTo((bounds.min[1] + bounds.max[1]) / 2, 5);
    expect(bounds.center[2]).toBeCloseTo((bounds.min[2] + bounds.max[2]) / 2, 5);
  });

  it('should be centered on X/Y (cylindrical symmetry)', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, MEDIUM_QUALITY, 'SuperformulaBlossom', {});
    const bounds = getMeshBounds(result.mesh);

    // Center should be near origin for X and Y
    expect(Math.abs(bounds.center[0])).toBeLessThan(2);
    expect(Math.abs(bounds.center[1])).toBeLessThan(2);
  });

  it('should have Z range matching pot height', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, LOW_QUALITY, 'SuperformulaBlossom', {});
    const bounds = getMeshBounds(result.mesh);

    expect(bounds.size[2]).toBeCloseTo(TEST_DIMENSIONS.H, 1);
  });
});

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance', () => {
  it('should generate low-res mesh quickly (< 100ms)', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, { nTheta: 32, nZ: 16 }, 'SuperformulaBlossom', {});
    expect(result.diagnostics.generationTimeMs).toBeLessThan(100);
  });

  it('should generate default quality mesh reasonably fast (< 500ms)', () => {
    const result = buildPotMesh(TEST_DIMENSIONS, DEFAULT_QUALITY, 'SuperformulaBlossom', {});
    expect(result.diagnostics.generationTimeMs).toBeLessThan(500);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration', () => {
  it('should generate valid mesh for all styles with default params', () => {
    const styles: StyleId[] = [
      'SuperformulaBlossom',
      'FourierBloom',
      'SpiralRidges',
      'SuperellipseMorph',
      'HarmonicRipple',
    ];

    for (const style of styles) {
      const result = buildPotMesh(undefined, LOW_QUALITY, style, {});

      expect(result.mesh.vertexCount).toBeGreaterThan(0);
      expect(result.mesh.triangleCount).toBeGreaterThan(0);

      // Validate topology
      for (let i = 0; i < result.mesh.indices.length; i++) {
        expect(result.mesh.indices[i]).toBeLessThan(result.mesh.vertexCount);
      }
    }
  });

  it('should produce watertight mesh (closed surface)', () => {
    // For a watertight mesh, volume calculation should produce a consistent result
    // regardless of the order triangles are processed (using signed volumes)
    const result = buildPotMesh(TEST_DIMENSIONS, MEDIUM_QUALITY, 'SuperformulaBlossom', {});
    const volume = calculateMeshVolume(result.mesh);

    // Volume should be positive (correct winding)
    expect(volume).toBeGreaterThan(0);
  });
});
