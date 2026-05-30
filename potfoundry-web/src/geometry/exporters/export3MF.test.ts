/**
 * 3MF Export Tests
 *
 * Tests for 3MF (3D Manufacturing Format) file generation:
 * - ZIP archive structure validation
 * - Required files presence
 * - Model XML structure
 * - Vertex and triangle counts
 * - Size estimation
 */
import { describe, it, expect } from 'vitest';
import { exportTo3MF, estimate3MFSize } from './export3MF';
import type { MeshData } from '../types';
import JSZip from 'jszip';

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
 * Create a larger test mesh
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

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('exportTo3MF', () => {
  describe('ZIP structure', () => {
    it('creates a valid ZIP blob', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportTo3MF(mesh, { name: 'Test' });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);

      // Verify it can be parsed as ZIP
      const zip = await JSZip.loadAsync(blob);
      expect(zip).toBeDefined();
    });

    it('contains [Content_Types].xml', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportTo3MF(mesh);
      const zip = await JSZip.loadAsync(blob);

      const contentTypes = zip.file('[Content_Types].xml');
      expect(contentTypes).not.toBeNull();

      const content = await contentTypes!.async('string');
      expect(content).toContain('<?xml');
      expect(content).toContain('Types');
    });

    it('contains _rels/.rels', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportTo3MF(mesh);
      const zip = await JSZip.loadAsync(blob);

      const rels = zip.file('_rels/.rels');
      expect(rels).not.toBeNull();

      const content = await rels!.async('string');
      expect(content).toContain('Relationships');
      expect(content).toContain('3dmodel');
    });

    it('contains 3D/3dmodel.model', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportTo3MF(mesh);
      const zip = await JSZip.loadAsync(blob);

      const model = zip.file('3D/3dmodel.model');
      expect(model).not.toBeNull();

      const content = await model!.async('string');
      expect(content).toContain('<?xml');
      expect(content).toContain('<model');
    });

    it('generates deterministic package bytes by default', async () => {
      const mesh = createSingleTriangleMesh();
      const first = await blobToBytes(await exportTo3MF(mesh, { name: 'Stable' }));
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await blobToBytes(await exportTo3MF(mesh, { name: 'Stable' }));

      expect(Array.from(first)).toEqual(Array.from(second));
    });
  });

  describe('model XML', () => {
    it('includes correct vertex count', async () => {
      const mesh = createQuadMesh();
      const blob = await exportTo3MF(mesh);
      const zip = await JSZip.loadAsync(blob);

      const model = zip.file('3D/3dmodel.model');
      const content = await model!.async('string');

      // Count vertex elements
      const vertexMatches = content.match(/<vertex /g);
      expect(vertexMatches).not.toBeNull();
      expect(vertexMatches!.length).toBe(4);
    });

    it('includes correct triangle count', async () => {
      const mesh = createQuadMesh();
      const blob = await exportTo3MF(mesh);
      const zip = await JSZip.loadAsync(blob);

      const model = zip.file('3D/3dmodel.model');
      const content = await model!.async('string');

      // Count triangle elements
      const triangleMatches = content.match(/<triangle /g);
      expect(triangleMatches).not.toBeNull();
      expect(triangleMatches!.length).toBe(2);
    });

    it('includes model name in metadata', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportTo3MF(mesh, { name: 'MyCustomPot' });
      const zip = await JSZip.loadAsync(blob);

      const model = zip.file('3D/3dmodel.model');
      const content = await model!.async('string');

      expect(content).toContain('MyCustomPot');
    });

    it('includes unit specification', async () => {
      const mesh = createSingleTriangleMesh();
      const blob = await exportTo3MF(mesh, { unit: 'millimeter' });
      const zip = await JSZip.loadAsync(blob);

      const model = zip.file('3D/3dmodel.model');
      const content = await model!.async('string');

      expect(content).toContain('unit="millimeter"');
    });

    it('omits creation date unless explicitly requested', async () => {
      const mesh = createSingleTriangleMesh();
      const defaultBlob = await exportTo3MF(mesh);
      const defaultZip = await JSZip.loadAsync(defaultBlob);
      const defaultModel = defaultZip.file('3D/3dmodel.model');
      const defaultContent = await defaultModel!.async('string');

      expect(defaultContent).not.toContain('CreationDate');

      const stampedBlob = await exportTo3MF(mesh, {
        createdAt: '2026-05-25T12:00:00.000Z',
      });
      const stampedZip = await JSZip.loadAsync(stampedBlob);
      const stampedModel = stampedZip.file('3D/3dmodel.model');
      const stampedContent = await stampedModel!.async('string');

      expect(stampedContent).toContain(
        '<metadata name="CreationDate">2026-05-25T12:00:00.000Z</metadata>',
      );
    });
  });

  describe('large meshes', () => {
    it('handles 10K triangle mesh', async () => {
      const mesh = createLargeMesh(10000);
      const blob = await exportTo3MF(mesh);

      expect(blob.size).toBeGreaterThan(0);

      const zip = await JSZip.loadAsync(blob);
      const model = zip.file('3D/3dmodel.model');
      expect(model).not.toBeNull();
    });

    it('produces smaller files than STL due to compression', async () => {
      const mesh = createLargeMesh(1000);
      const blob = await exportTo3MF(mesh);

      // 3MF should be much smaller than raw data due to:
      // 1. Shared vertex indices (vs STL duplicating vertices per triangle)
      // 2. ZIP compression
      // Raw vertex data would be: 3000 vertices * 3 coords * 4 bytes = 36KB
      // Raw index data would be: 1000 * 3 * 4 = 12KB
      // Uncompressed XML might be ~80KB
      // With compression should be ~15-30KB
      expect(blob.size).toBeLessThan(50000); // Less than 50KB
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

      const blob = await exportTo3MF(mesh);
      expect(blob.size).toBeGreaterThan(0);

      // Should still create valid ZIP structure
      const zip = await JSZip.loadAsync(blob);
      expect(zip.file('[Content_Types].xml')).not.toBeNull();
    });
  });
});

describe('estimate3MFSize', () => {
  it('estimates size for small mesh', () => {
    const size = estimate3MFSize({ vertexCount: 100, triangleCount: 50 });
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThan(50000); // Should be < 50KB for small mesh
  });

  it('scales with mesh complexity', () => {
    const size1x = estimate3MFSize({ vertexCount: 1000, triangleCount: 500 });
    const size2x = estimate3MFSize({ vertexCount: 2000, triangleCount: 1000 });

    // 2x mesh should produce larger estimate
    expect(size2x).toBeGreaterThan(size1x);
  });

  it('is smaller than equivalent STL estimate', () => {
    // 3MF should estimate smaller than STL due to:
    // - Shared vertices (STL duplicates vertices per triangle)
    // - ZIP compression
    const mesh = { vertexCount: 10000, triangleCount: 5000 };
    const size3MF = estimate3MFSize(mesh);

    // Binary STL: 84 header + 50 bytes per triangle = 250084 bytes
    const sizeSTL = 84 + mesh.triangleCount * 50;

    expect(size3MF).toBeLessThan(sizeSTL);
  });
});
