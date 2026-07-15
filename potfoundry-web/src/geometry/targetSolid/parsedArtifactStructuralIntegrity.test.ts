import { describe, expect, it } from 'vitest';
import { generateBinarySTL } from '../stlExport';
import type { MeshData } from '../types';
import {
  assessBinaryStlStructuralIntegrity,
  PARSED_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS,
} from './parsedArtifactStructuralIntegrity';

function mesh(vertices: number[], indices: number[]): MeshData {
  return {
    vertices: Float32Array.from(vertices),
    indices: Uint32Array.from(indices),
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

const TETRAHEDRON = mesh(
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]
);

describe('assessBinaryStlStructuralIntegrity', () => {
  it('binds a complete final-byte structural proof for the expected tetrahedron topology', () => {
    const buffer = generateBinarySTL(TETRAHEDRON);
    const result = assessBinaryStlStructuralIntegrity(buffer, {
      componentCount: 1,
      genus: 0,
    });
    expect(result.structurallyValid).toBe(true);
    expect(Object.values(result.checks)).toEqual(new Array(9).fill(true));
    expect(result.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.topology.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.selfIntersection.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.implementationStatus).toBe(PARSED_STRUCTURAL_INTEGRITY_IMPLEMENTATION_STATUS);
    expect(result.artifact.zeroFacetNormalCount).toBe(0);
    expect(result.artifact.nonPositiveFacetNormalDotCount).toBe(0);
  });

  it('fails a target-topology mismatch without weakening the measured artifact facts', () => {
    const result = assessBinaryStlStructuralIntegrity(generateBinarySTL(TETRAHEDRON), {
      componentCount: 1,
      genus: 1,
    });
    expect(result.topology.genus).toBe(0);
    expect(result.checks.genusMatches).toBe(false);
    expect(result.structurallyValid).toBe(false);
  });

  it('binds evidence to every final artifact byte, including a header-only mutation', () => {
    const original = generateBinarySTL(TETRAHEDRON);
    const mutated = original.slice(0);
    new Uint8Array(mutated)[0] ^= 1;
    const expected = { componentCount: 1 as const, genus: 0 as const };
    const first = assessBinaryStlStructuralIntegrity(original, expected);
    const second = assessBinaryStlStructuralIntegrity(mutated, expected);
    expect(second.artifact.parsedTriangleSetSha256).toBe(first.artifact.parsedTriangleSetSha256);
    expect(second.artifact.byteSha256).not.toBe(first.artifact.byteSha256);
    expect(second.evidenceSha256).not.toBe(first.evidenceSha256);
  });

  it('reports both topology and embeddedness failures for a piercing triangle soup', () => {
    const source = mesh(
      [0, 0, 0, 2, 0, 0, 0, 2, 0, 0.5, 0.5, -1, 0.5, 0.5, 1, 0.5, 2, 0],
      [0, 1, 2, 3, 4, 5]
    );
    const result = assessBinaryStlStructuralIntegrity(generateBinarySTL(source), {
      componentCount: 1,
      genus: 0,
    });
    expect(result.checks.closed).toBe(false);
    expect(result.checks.noSelfIntersections).toBe(false);
    expect(result.structurallyValid).toBe(false);
  });

  it('rejects runtime topology declarations outside the target-solid contract', () => {
    expect(() =>
      assessBinaryStlStructuralIntegrity(generateBinarySTL(TETRAHEDRON), {
        componentCount: 2 as 1,
        genus: 0,
      })
    ).toThrow(/componentCount 1/);
  });
});
