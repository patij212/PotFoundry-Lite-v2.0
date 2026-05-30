/**
 * OBJ Export Tests
 *
 * Tests for Wavefront OBJ file generation:
 * - Basic mesh export
 * - Vertex output (1-indexed)
 * - Normal output
 * - Face format validation
 * - Large mesh streaming
 */
import { describe, it, expect } from 'vitest';
import { exportToOBJ, estimateOBJSize } from './exportOBJ';
import type { MeshData } from '../types';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a simple test mesh (single triangle)
 */
function createSingleTriangleMesh(): MeshData {
  return {
    vertices: new Float32Array([
      0, 0, 0, // v0
      1, 0, 0, // v1
      0, 1, 0, // v2
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
      0, 0, 0, // v0 - bottom left
      1, 0, 0, // v1 - bottom right
      1, 1, 0, // v2 - top right
      0, 1, 0, // v3 - top left
    ]),
    indices: new Uint32Array([
      0, 1, 2, // first triangle
      0, 2, 3, // second triangle
    ]),
    vertexCount: 4,
    triangleCount: 2,
  };
}

/**
 * Create a larger test mesh for streaming tests
 */
function createLargeMesh(triangleCount: number): MeshData {
  const vertexCount = triangleCount * 3;
  const vertices = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);

  for (let i = 0; i < triangleCount; i++) {
    const base = i * 9;
    const t = i / triangleCount;

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
 * Read blob as text using FileReader-compatible approach
 */
async function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('exportToOBJ', () => {
  describe('basic export', () => {
    it('exports single triangle mesh', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh, { name: 'Test' });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);

      const text = await blobToText(blob);
      expect(text).toContain('# Wavefront OBJ');
      expect(text).toContain('o Test');
    });

    it('exports quad mesh with correct vertex count', async () => {
      const mesh = createQuadMesh();
      const blob = await exportToOBJ(mesh);
      const text = await blobToText(blob);

      // Count vertex lines
      const vertexLines = text.split('\n').filter((l) => l.startsWith('v '));
      expect(vertexLines.length).toBe(4);
    });

    it('exports quad mesh with correct face count', async () => {
      const mesh = createQuadMesh();
      const blob = await exportToOBJ(mesh);
      const text = await blobToText(blob);

      // Count face lines
      const faceLines = text.split('\n').filter((l) => l.startsWith('f '));
      expect(faceLines.length).toBe(2);
    });
  });

  describe('deterministic output', () => {
    it('omits wall-clock metadata by default', async () => {
      const mesh = createSingleTriangleMesh();
      const first = await exportToOBJ(mesh, { name: 'Stable' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await exportToOBJ(mesh, { name: 'Stable' });

      const firstText = await blobToText(first);
      const secondText = await blobToText(second);

      expect(firstText).toBe(secondText);
      expect(firstText).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('includes creation metadata only when explicitly requested', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh, {
        name: 'Stamped',
        createdAt: '2026-05-25T12:00:00.000Z',
      });

      const text = await blobToText(blob);
      expect(text).toContain('# Created: 2026-05-25T12:00:00.000Z');
    });
  });

  describe('1-based indexing', () => {
    it('uses 1-based vertex indices in faces', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh, { includeNormals: false });
      const text = await blobToText(blob);

      // Face should reference vertices 1, 2, 3 (not 0, 1, 2)
      const faceLines = text.split('\n').filter((l) => l.startsWith('f '));
      expect(faceLines.length).toBe(1);
      expect(faceLines[0]).toBe('f 1 2 3');
    });

    it('uses 1-based indices with normals', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh, { includeNormals: true });
      const text = await blobToText(blob);

      const faceLines = text.split('\n').filter((l) => l.startsWith('f '));
      expect(faceLines.length).toBe(1);
      // Format: f v1//n1 v2//n2 v3//n3
      expect(faceLines[0]).toMatch(/^f 1\/\/1 2\/\/1 3\/\/1$/);
    });
  });

  describe('normals', () => {
    it('includes normals by default', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh);
      const text = await blobToText(blob);

      const normalLines = text.split('\n').filter((l) => l.startsWith('vn '));
      expect(normalLines.length).toBe(1); // One normal per face
    });

    it('excludes normals when requested', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh, { includeNormals: false });
      const text = await blobToText(blob);

      const normalLines = text.split('\n').filter((l) => l.startsWith('vn '));
      expect(normalLines.length).toBe(0);
    });

    it('computes correct normal for upward-facing triangle', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh);
      const text = await blobToText(blob);

      const normalLines = text.split('\n').filter((l) => l.startsWith('vn '));
      expect(normalLines.length).toBe(1);

      // Triangle in XY plane, CCW order should have normal pointing +Z
      const parts = normalLines[0].split(' ');
      const nz = parseFloat(parts[3]);
      expect(nz).toBeCloseTo(1.0, 5);
    });
  });

  describe('header', () => {
    it('includes model name in header', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportToOBJ(mesh, { name: 'MyPot' });
      const text = await blobToText(blob);

      expect(text).toContain('# Wavefront OBJ - MyPot');
      expect(text).toContain('o MyPot');
    });

    it('includes vertex and triangle counts in header', async () => {
      const mesh = createQuadMesh();
      const blob = await exportToOBJ(mesh);
      const text = await blobToText(blob);

      expect(text).toContain('Vertices: 4');
      expect(text).toContain('Triangles: 2');
    });
  });

  describe('large mesh', () => {
    it('handles 10K triangle mesh', async () => {
      const mesh = createLargeMesh(10000);
      const blob = await exportToOBJ(mesh);

      expect(blob.size).toBeGreaterThan(0);

      const text = await blobToText(blob);
      const faceLines = text.split('\n').filter((l) => l.startsWith('f '));
      expect(faceLines.length).toBe(10000);
    });

    it('streams large meshes to avoid memory issues', { timeout: 30000 }, async () => {
      // 600K triangles should trigger streaming (threshold is 500K)
      const mesh = createLargeMesh(600000);
      const blob = await exportToOBJ(mesh);

      expect(blob.size).toBeGreaterThan(0);
      // Just verify it doesn't crash - streaming is internal detail
    });
  });

  describe('edge cases', () => {
    it('handles empty mesh', async () => {
      const mesh: MeshData = {
        vertices: new Float32Array([]),
        indices: new Uint32Array([]),
        vertexCount: 0,
        triangleCount: 0,
      };
      const blob = await exportToOBJ(mesh);
      const text = await blobToText(blob);

      // Should still have header but no geometry
      expect(text).toContain('# Wavefront OBJ');
      const vertexLines = text.split('\n').filter((l) => l.startsWith('v '));
      expect(vertexLines.length).toBe(0);
    });

    it('sanitizes non-finite vertex values', async () => {
      const mesh: MeshData = {
        vertices: new Float32Array([NaN, Infinity, -Infinity]),
        indices: new Uint32Array([0, 0, 0]),
        vertexCount: 1,
        triangleCount: 1,
      };
      const blob = await exportToOBJ(mesh, { includeNormals: false });
      const text = await blobToText(blob);

      // Should output zeros for non-finite values
      const vertexLines = text.split('\n').filter((l) => l.startsWith('v '));
      expect(vertexLines[0]).toBe('v 0 0 0');
    });
  });
});

describe('estimateOBJSize', () => {
  it('estimates size for small mesh', () => {
    const size = estimateOBJSize({ vertexCount: 100, triangleCount: 50 });
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(100000); // Should be < 100KB for small mesh
  });

  it('estimates larger size with normals', () => {
    const withNormals = estimateOBJSize({ vertexCount: 100, triangleCount: 50 }, true);
    const withoutNormals = estimateOBJSize(
      { vertexCount: 100, triangleCount: 50 },
      false
    );

    expect(withNormals).toBeGreaterThan(withoutNormals);
  });

  it('scales linearly with mesh size', () => {
    const size1x = estimateOBJSize({ vertexCount: 1000, triangleCount: 500 });
    const size2x = estimateOBJSize({ vertexCount: 2000, triangleCount: 1000 });

    // 2x mesh should be roughly 2x size
    expect(size2x / size1x).toBeCloseTo(2, 0);
  });
});
