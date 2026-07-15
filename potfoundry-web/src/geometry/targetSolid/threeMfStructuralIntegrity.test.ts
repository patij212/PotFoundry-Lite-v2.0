import { describe, expect, it } from 'vitest';

import { exportTo3MF } from '../exporters/export3MF';
import type { MeshData } from '../types';
import { assessThreeMfStructuralIntegrity } from './threeMfStructuralIntegrity';

const TETRA_VERTICES = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
]);
const OUTWARD_TETRA_INDICES = new Uint32Array([
  0, 2, 1,
  0, 1, 3,
  0, 3, 2,
  1, 2, 3,
]);

async function bytes(indices = OUTWARD_TETRA_INDICES): Promise<Uint8Array> {
  const mesh: MeshData = {
    vertices: TETRA_VERTICES,
    indices,
    vertexCount: 4,
    triangleCount: indices.length / 3,
  };
  const blob = await exportTo3MF(mesh, { name: 'Structural proof' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('final-byte 3MF structural integrity', () => {
  it('binds parser, exact topology, and complete embeddedness evidence', async () => {
    const result = await assessThreeMfStructuralIntegrity(
      await bytes(),
      { componentCount: 1, genus: 0 }
    );
    expect(result.structurallyValid).toBe(true);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
    expect(result.topology.outwardFacing).toBe(true);
    expect(result.selfIntersection.selfIntersectionFree).toBe(true);
    expect(result.artifact.byteSha256).toBe(result.topology.artifactByteSha256);
    expect(result.artifact.byteSha256).toBe(result.selfIntersection.artifactByteSha256);
    expect(result.implementationStatus).toMatch(/no-thickness-feature-target-distance/i);
  });

  it('returns a negative structural verdict for a reversed or open artifact', async () => {
    const reversed = Uint32Array.from(OUTWARD_TETRA_INDICES);
    for (let offset = 0; offset < reversed.length; offset += 3) {
      [reversed[offset + 1], reversed[offset + 2]] = [reversed[offset + 2], reversed[offset + 1]];
    }
    const reversedResult = await assessThreeMfStructuralIntegrity(
      await bytes(reversed),
      { componentCount: 1, genus: 0 }
    );
    expect(reversedResult.structurallyValid).toBe(false);
    expect(reversedResult.checks.outwardFacing).toBe(false);

    const openResult = await assessThreeMfStructuralIntegrity(
      await bytes(OUTWARD_TETRA_INDICES.slice(0, 9)),
      { componentCount: 1, genus: 0 }
    );
    expect(openResult.structurallyValid).toBe(false);
    expect(openResult.checks.closed).toBe(false);
  });

  it('snapshots nested options before asynchronous parsing without invoking getters', async () => {
    let getterCalls = 0;
    const topology = Object.defineProperty({}, 'maxUniqueVertices', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 4;
      },
    });
    await expect(
      assessThreeMfStructuralIntegrity(
        await bytes(),
        { componentCount: 1, genus: 0 },
        { topology }
      )
    ).rejects.toThrow(/data property/i);
    expect(getterCalls).toBe(0);
  });
});
