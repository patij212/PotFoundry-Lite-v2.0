/**
 * selfIntersection.test.ts — Plan Task 4.2: geometric self-intersection check.
 *
 * `detectSelfIntersections(mesh)` reports whether any two NON-adjacent triangles
 * of a `MeshData` cross each other in 3D. This is a non-blocking WARNING-level
 * capability (twisted / high-flare pots are the printability risk) — it is NOT
 * wired into the blocking export gate. See `selfIntersection.ts` for where it
 * would be surfaced (export warning).
 *
 * Tests:
 *   1. A hand-built CLOSED octahedron with one face deliberately punched through
 *      the opposite side of the hull → `intersects: true`, `count >= 1`, and the
 *      reported `samplePairs` reference real triangle indices.
 *   2. A clean convex octahedron (no piercing) → `intersects: false`, `count: 0`.
 *   3. A clean tessellated cylinder "pot" wall (radial, like the real export
 *      geometry) → `intersects: false` — adjacent triangles sharing edges/verts
 *      must NOT be flagged as self-intersections.
 *
 * Reference: `src/geometry/types.ts` (`MeshData`),
 * `src/geometry/exportValidation.ts` (sibling format-agnostic mesh gate).
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from './types';
import { detectSelfIntersections } from './selfIntersection';

/** Pack flat vertex/index arrays into a `MeshData`. */
function makeMesh(verts: number[], tris: number[]): MeshData {
  const vertices = new Float32Array(verts);
  const indices = new Uint32Array(tris);
  return {
    vertices,
    indices,
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

/**
 * A clean convex octahedron: 6 poles, 8 triangular faces, all outward-wound.
 * No two faces cross.
 */
function cleanOctahedron(): MeshData {
  // +X, -X, +Y, -Y, +Z, -Z
  const v = [
    1, 0, 0, // 0
    -1, 0, 0, // 1
    0, 1, 0, // 2
    0, -1, 0, // 3
    0, 0, 1, // 4
    0, 0, -1, // 5
  ];
  const f = [
    0, 2, 4,
    2, 1, 4,
    1, 3, 4,
    3, 0, 4,
    2, 0, 5,
    1, 2, 5,
    3, 1, 5,
    0, 3, 5,
  ];
  return makeMesh(v, f);
}

/**
 * A closed mesh that self-intersects: a long thin "needle" tetrahedron whose
 * apex is pushed straight through a separate, well-separated flat quad so the
 * needle's side faces pierce the quad's faces. Both pieces are closed so the
 * combined mesh is a valid (if non-manifold-by-union) closed triangle soup; the
 * point is purely that some triangle pair crosses.
 */
function selfIntersectingMesh(): MeshData {
  const v = [
    // tetra: a tall spike centered on origin, apex at +z, base at z=2
    0, 0, -3, // 0 apex below the quad
    1, 0, 3, // 1 base ring (above the quad plane at z=1)
    -0.5, 0.87, 3, // 2
    -0.5, -0.87, 3, // 3
    // a flat quad lying in the z=1 plane that the spike passes through
    -4, -4, 1, // 4
    4, -4, 1, // 5
    4, 4, 1, // 6
    -4, 4, 1, // 7
  ];
  const f = [
    // closed tetra (4 faces)
    0, 1, 2,
    0, 2, 3,
    0, 3, 1,
    1, 3, 2,
    // closed quad shell as two triangles, doubled (back face) so it is closed
    4, 5, 6,
    4, 6, 7,
    6, 5, 4,
    7, 6, 4,
  ];
  return makeMesh(v, f);
}

/**
 * A clean, properly tessellated cylinder side wall (radial like the real pot
 * export). Adjacent quads share edges; nothing crosses. This guards against the
 * detector falsely flagging legitimate edge/vertex-sharing neighbours.
 */
function cleanCylinder(nTheta: number, nZ: number, radius: number, height: number): MeshData {
  const verts: number[] = [];
  for (let zi = 0; zi <= nZ; zi++) {
    const z = (zi / nZ) * height;
    for (let ti = 0; ti < nTheta; ti++) {
      const a = (ti / nTheta) * 2 * Math.PI;
      verts.push(radius * Math.cos(a), radius * Math.sin(a), z);
    }
  }
  const tris: number[] = [];
  const idx = (zi: number, ti: number): number => zi * nTheta + (ti % nTheta);
  for (let zi = 0; zi < nZ; zi++) {
    for (let ti = 0; ti < nTheta; ti++) {
      const a = idx(zi, ti);
      const b = idx(zi, ti + 1);
      const c = idx(zi + 1, ti);
      const d = idx(zi + 1, ti + 1);
      tris.push(a, b, d, a, d, c);
    }
  }
  return makeMesh(verts, tris);
}

describe('detectSelfIntersections', () => {
  it('flags a closed mesh whose triangles pierce each other', () => {
    const result = detectSelfIntersections(selfIntersectingMesh());
    expect(result.intersects).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(1);
    // sample pairs (if returned) must reference valid, distinct triangle indices
    if (result.samplePairs) {
      expect(result.samplePairs.length).toBeGreaterThan(0);
      for (const [a, b] of result.samplePairs) {
        expect(a).not.toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(8);
        expect(b).toBeLessThan(8);
      }
    }
  });

  it('passes a clean convex octahedron (no self-intersection)', () => {
    const result = detectSelfIntersections(cleanOctahedron());
    expect(result.intersects).toBe(false);
    expect(result.count).toBe(0);
  });

  it('passes a clean tessellated cylinder wall (adjacent triangles are not crossings)', () => {
    const result = detectSelfIntersections(cleanCylinder(48, 24, 50, 120));
    expect(result.intersects).toBe(false);
    expect(result.count).toBe(0);
  });
});
