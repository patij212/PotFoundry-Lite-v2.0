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

/** A CLOSED, consistently-wound torus grid (both u and v wrap) — a watertight manifold with
 *  `nu·nv·2` triangles and `nu·nv·3` edge uses. Used to exercise the edge-accounting path at
 *  volume (the string-keyed Map version was O(edges) heap strings and crashed past ~16.7M
 *  edges — see the numeric-key fix). */
function makeClosedTorus(nu: number, nv: number): MeshData {
  const R = 30, r = 10;
  const vertices = new Float32Array(nu * nv * 3);
  for (let i = 0; i < nu; i++) {
    const a = (i / nu) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let j = 0; j < nv; j++) {
      const b = (j / nv) * Math.PI * 2, cb = Math.cos(b);
      const o = (i * nv + j) * 3;
      vertices[o] = (R + r * cb) * ca;
      vertices[o + 1] = (R + r * cb) * sa;
      vertices[o + 2] = r * Math.sin(b);
    }
  }
  const at = (i: number, j: number): number => (i % nu) * nv + (j % nv);
  const indices = new Uint32Array(nu * nv * 6);
  let k = 0;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      indices[k++] = a; indices[k++] = b; indices[k++] = c;
      indices[k++] = a; indices[k++] = c; indices[k++] = d;
    }
  }
  return { vertices, indices, vertexCount: nu * nv, triangleCount: nu * nv * 2 };
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

  it('rejects globally inverted closed solids even when local edge winding is coherent', () => {
    const mesh = makeClosedCube();
    const inverted = new Uint32Array(mesh.indices);
    for (let i = 0; i < inverted.length; i += 3) {
      const tmp = inverted[i + 1];
      inverted[i + 1] = inverted[i + 2];
      inverted[i + 2] = tmp;
    }
    mesh.indices = inverted;

    const report = validateMeshForExport(mesh, { format: '3mf' });

    expect(report.ok).toBe(false);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.orientationMismatches).toBe(0);
    expect(report.errors.join('\n')).toMatch(/outward|inside-out|signed volume/i);
    expect(() => assertMeshExportable(mesh, { format: '3mf' }))
      .toThrow(/outward|inside-out|signed volume/i);
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

  it('accounts edges without a per-edge string Map on a large closed mesh (R6 scale path)', () => {
    // ~590k triangles / ~885k edge uses. The old string-keyed edgeUses Map allocated a heap
    // string + object per unique edge and crashed with "Map maximum size exceeded" past ~16.7M
    // edges (8.7M-tri artifacts); the numeric sort+count path handles the same accounting flat.
    const mesh = makeClosedTorus(512, 384);
    const report = validateMeshForExport(mesh, { format: 'stl', estimatedSizeBytes: 1024 });
    // A watertight, consistently-wound manifold: zero boundary / non-manifold / orientation defects.
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.orientationMismatches).toBe(0);
    expect(report.degenerateTriangles).toBe(0);
  });
});

describe('estimateMeshExportBytes', () => {
  it('keeps format estimates monotonic with triangle count', () => {
    const small = estimateMeshExportBytes({ vertexCount: 8, triangleCount: 12 }, 'obj');
    const large = estimateMeshExportBytes({ vertexCount: 16, triangleCount: 24 }, 'obj');

    expect(large).toBeGreaterThan(small);
  });
});
