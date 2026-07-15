import { describe, expect, it } from 'vitest';

import { exportToOBJ } from '../exporters/exportOBJ';
import type { MeshData } from '../types';
import { assessObjStructuralIntegrity } from './objStructuralIntegrity';

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
  const blob = await exportToOBJ(mesh, { name: 'Structural', precision: 9 });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('final-byte OBJ structural integrity', () => {
  it('binds parser, exact topology, and complete embeddedness evidence', async () => {
    const result = assessObjStructuralIntegrity(
      await bytes(),
      { componentCount: 1, genus: 0 }
    );
    expect(result.structurallyValid).toBe(true);
    expect(Object.values(result.checks).every(Boolean)).toBe(true);
    expect(result.topology.outwardFacing).toBe(true);
    expect(result.selfIntersection.selfIntersectionFree).toBe(true);
    expect(result.artifact.byteSha256).toBe(result.topology.artifactByteSha256);
    expect(result.artifact.coordinateQuantizationRadiusPmUpper).toBe('1');
  });

  it('returns a negative verdict for reversed and open artifacts', async () => {
    const reversed = Uint32Array.from(OUTWARD_TETRA_INDICES);
    for (let offset = 0; offset < reversed.length; offset += 3) {
      [reversed[offset + 1], reversed[offset + 2]] = [reversed[offset + 2], reversed[offset + 1]];
    }
    const reversedResult = assessObjStructuralIntegrity(
      await bytes(reversed),
      { componentCount: 1, genus: 0 }
    );
    expect(reversedResult.structurallyValid).toBe(false);
    expect(reversedResult.checks.outwardFacing).toBe(false);

    const openResult = assessObjStructuralIntegrity(
      await bytes(OUTWARD_TETRA_INDICES.slice(0, 9)),
      { componentCount: 1, genus: 0 }
    );
    expect(openResult.structurallyValid).toBe(false);
    expect(openResult.checks.closed).toBe(false);
  });

  it('snapshots nested controls without invoking accessors', async () => {
    const source = await bytes();
    let getterCalls = 0;
    const selfIntersection = Object.defineProperty({}, 'leafSize', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 8;
      },
    });
    expect(() => assessObjStructuralIntegrity(
      source,
      { componentCount: 1, genus: 0 },
      { selfIntersection }
    )).toThrow(/data property/i);
    expect(getterCalls).toBe(0);
  });
});
