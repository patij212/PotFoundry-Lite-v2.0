/**
 * Tests for shared slicer-oriented mesh export validation.
 */
import { describe, expect, it } from 'vitest';
import type { MeshData } from './types';
import {
  HARD_MAX_EXPORT_BYTES,
  assertMeshExportable,
  estimateMeshExportBytes,
  validateMeshForExport,
} from './exportValidation';

function makeClosedCube(): MeshData {
  return {
    vertices: new Float32Array([
      -1, -1, -1,
      1, -1, -1,
      1, 1, -1,
      -1, 1, -1,
      -1, -1, 1,
      1, -1, 1,
      1, 1, 1,
      -1, 1, 1,
    ]),
    indices: new Uint32Array([
      0, 2, 1,
      0, 3, 2,
      4, 5, 6,
      4, 6, 7,
      0, 1, 5,
      0, 5, 4,
      1, 2, 6,
      1, 6, 5,
      2, 3, 7,
      2, 7, 6,
      3, 0, 4,
      3, 4, 7,
    ]),
    vertexCount: 8,
    triangleCount: 12,
  };
}

function makeOpenQuad(): MeshData {
  return {
    vertices: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 1, 0,
      0, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    vertexCount: 4,
    triangleCount: 2,
  };
}

function makeFaceSplitCube(): MeshData {
  const base = makeClosedCube();
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let t = 0; t < base.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const source = base.indices[t + k];
      const next = vertices.length / 3;
      vertices.push(
        base.vertices[source * 3],
        base.vertices[source * 3 + 1],
        base.vertices[source * 3 + 2],
      );
      indices.push(next);
    }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

describe('validateMeshForExport', () => {
  it('accepts a closed oriented cube and estimates STL size exactly', () => {
    const mesh = makeClosedCube();
    const report = validateMeshForExport(mesh, { format: 'stl' });

    expect(report.ok).toBe(true);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.degenerateTriangles).toBe(0);
    expect(report.orientationMismatches).toBe(0);
    expect(report.estimatedSizeBytes).toBe(84 + mesh.triangleCount * 50);
  });

  it('rejects open meshes instead of treating boundary edges as harmless', () => {
    const report = validateMeshForExport(makeOpenQuad(), { format: 'stl' });

    expect(report.ok).toBe(false);
    expect(report.boundaryEdges).toBeGreaterThan(0);
    expect(report.errors.join('\n')).toMatch(/boundary edges/i);
    expect(() => assertMeshExportable(makeOpenQuad(), { format: 'stl' }))
      .toThrow(/boundary edges/i);
  });

  it('accepts geometrically closed triangle soup with duplicated seam vertices', () => {
    const report = validateMeshForExport(makeFaceSplitCube(), { format: 'stl' });

    expect(report.ok).toBe(true);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.orientationMismatches).toBe(0);
  });

  it('can disable geometric welding for strict raw-index topology checks', () => {
    const report = validateMeshForExport(makeFaceSplitCube(), {
      format: 'stl',
      topologyWeldToleranceMm: 0,
    });

    expect(report.ok).toBe(false);
    expect(report.boundaryEdges).toBeGreaterThan(0);
  });

  it('rejects invalid indices and degenerate triangles', () => {
    const mesh = makeClosedCube();
    mesh.indices = new Uint32Array([0, 1, 2, 0, 0, 1, 999, 1, 2]);
    mesh.triangleCount = 3;

    const report = validateMeshForExport(mesh, { format: 'obj' });

    expect(report.ok).toBe(false);
    expect(report.invalidIndices).toBe(1);
    expect(report.degenerateTriangles).toBe(1);
    expect(report.errors.join('\n')).toMatch(/invalid vertex indices/i);
    expect(report.errors.join('\n')).toMatch(/degenerate/i);
  });

  it('rejects non-finite vertex coordinates before any format writer can sanitize them', () => {
    const mesh = makeClosedCube();
    mesh.vertices[0] = Number.NaN;
    mesh.vertices[7] = Number.POSITIVE_INFINITY;

    const report = validateMeshForExport(mesh, { format: '3mf' });

    expect(report.ok).toBe(false);
    expect(report.invalidVertexScalars).toBe(2);
    expect(report.errors.join('\n')).toMatch(/non-finite/i);
  });

  it('detects incoherent face winding through directed shared-edge mismatches', () => {
    const mesh = makeClosedCube();
    const flipped = new Uint32Array(mesh.indices);
    flipped[3] = 0;
    flipped[4] = 2;
    flipped[5] = 3;
    mesh.indices = flipped;

    const report = validateMeshForExport(mesh, { format: 'stl' });

    expect(report.ok).toBe(false);
    expect(report.orientationMismatches).toBeGreaterThan(0);
    expect(report.errors.join('\n')).toMatch(/orientation/i);
  });

  it('can report winding mismatches as warnings for STL triangle soup downloads', () => {
    const mesh = makeClosedCube();
    const flipped = new Uint32Array(mesh.indices);
    flipped[3] = 0;
    flipped[4] = 2;
    flipped[5] = 3;
    mesh.indices = flipped;

    const report = validateMeshForExport(mesh, {
      format: 'stl',
      requireConsistentOrientation: false,
    });

    expect(report.ok).toBe(true);
    expect(report.orientationMismatches).toBeGreaterThan(0);
    expect(report.warnings.join('\n')).toMatch(/orientation/i);
  });

  it('rejects estimated files over the hard 1 GiB slicer-safety limit', () => {
    const mesh = makeClosedCube();
    const oversizedBytes = HARD_MAX_EXPORT_BYTES + 1;
    const report = validateMeshForExport(mesh, {
      format: 'stl',
      estimatedSizeBytes: oversizedBytes,
    });

    expect(report.ok).toBe(false);
    expect(report.estimatedSizeBytes).toBe(oversizedBytes);
    expect(report.errors.join('\n')).toMatch(/1 GiB/i);
  });
});

describe('estimateMeshExportBytes', () => {
  it('keeps format estimates monotonic with triangle count', () => {
    const small = estimateMeshExportBytes({ vertexCount: 8, triangleCount: 12 }, 'obj');
    const large = estimateMeshExportBytes({ vertexCount: 16, triangleCount: 24 }, 'obj');

    expect(large).toBeGreaterThan(small);
  });
});
