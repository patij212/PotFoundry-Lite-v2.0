import { describe, it, expect } from 'vitest';
import type { MeshData } from '../../../../geometry/types';
import { validateMeshForExport } from '../../../../geometry/exportValidation';
import { decimateConforming, isConformingDecimationAvailable } from './decimateConforming';

/**
 * Build a closed, outward-oriented icosphere (subdivided icosahedron).
 *
 * Unlike a UV-sphere, an icosphere is a true welded 2-manifold: no duplicate
 * seam vertices, no pole-collapse degenerate triangles. Every interior edge is
 * shared by exactly two triangles, winding is consistent, signed volume is
 * positive — a clean synthetic stand-in for the conforming pot mesh that
 * `decimateConforming` must shrink without breaking watertightness. Each
 * subdivision level quadruples the triangle count (20·4^level), so the test can
 * make it deliberately over-budget.
 */
function buildIcosphere(subdivisions: number, radius = 50): MeshData {
  type V = [number, number, number];
  const t = (1 + Math.sqrt(5)) / 2;
  const baseVerts: V[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const verts: V[] = baseVerts.map((v) => [...v] as V);
  const midCache = new Map<string, number>();
  const midpoint = (a: number, b: number): number => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const cached = midCache.get(key);
    if (cached !== undefined) return cached;
    const va = verts[a];
    const vb = verts[b];
    const mid: V = [
      (va[0] + vb[0]) / 2,
      (va[1] + vb[1]) / 2,
      (va[2] + vb[2]) / 2,
    ];
    const idx = verts.length;
    verts.push(mid);
    midCache.set(key, idx);
    return idx;
  };
  for (let s = 0; s < subdivisions; s++) {
    const next: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      // Keep the parent winding so orientation stays outward-consistent.
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  // Project onto the sphere of the requested radius (positive signed volume).
  const vertices = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const [x, y, z] = verts[i];
    const len = Math.hypot(x, y, z) || 1;
    vertices[i * 3] = (x / len) * radius;
    vertices[i * 3 + 1] = (y / len) * radius;
    vertices[i * 3 + 2] = (z / len) * radius;
  }
  const indices = new Uint32Array(faces.length * 3);
  for (let i = 0; i < faces.length; i++) {
    indices[i * 3] = faces[i][0];
    indices[i * 3 + 1] = faces[i][1];
    indices[i * 3 + 2] = faces[i][2];
  }
  return {
    vertices,
    indices,
    vertexCount: verts.length,
    triangleCount: faces.length,
  };
}

describe('decimateConforming', () => {
  it('builds a watertight synthetic icosphere (test-fixture sanity)', () => {
    const mesh = buildIcosphere(4); // 20·4^4 = 5120 triangles
    const report = validateMeshForExport(mesh);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.orientationMismatches).toBe(0);
    expect(report.ok).toBe(true);
  });

  it('is a no-op when the mesh is already under target', async () => {
    const mesh = buildIcosphere(3); // 1280 triangles, well under target
    const target = 1_000_000;
    const out = await decimateConforming(mesh, { target });
    expect(out.triangleCount).toBe(mesh.triangleCount);
    expect(out.vertices).toBe(mesh.vertices);
    expect(out.indices).toBe(mesh.indices);
  });

  it('decimates an over-budget closed mesh to <= target while staying watertight', async () => {
    if (!(await isConformingDecimationAvailable())) {
      // meshoptimizer WASM unavailable in this environment — skip gracefully
      // (documented in followups). The no-op-under-budget contract above still
      // guards the module + wiring.
      console.warn('[decimateConforming.test] meshoptimizer unavailable, skipping decimation assertion');
      return;
    }
    const mesh = buildIcosphere(6); // 20·4^6 = 81,920 triangles
    expect(mesh.triangleCount).toBeGreaterThan(20_000);

    const target = 5_000;
    const out = await decimateConforming(mesh, { target });

    expect(out.triangleCount).toBeLessThanOrEqual(target);
    expect(out.triangleCount).toBeGreaterThan(0);

    const report = validateMeshForExport(out);
    expect(report.boundaryEdges).toBe(0);
    expect(report.nonManifoldEdges).toBe(0);
    expect(report.ok).toBe(true);
  });
});
