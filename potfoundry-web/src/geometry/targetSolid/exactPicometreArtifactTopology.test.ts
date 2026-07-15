import { describe, expect, it } from 'vitest';

import { exportTo3MF } from '../exporters/export3MF';
import type { MeshData } from '../types';
import {
  assessExactPicometreArtifactTopology,
  ExactPicometreTopologyError,
  HARD_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
  HARD_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES,
  HARD_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
  HARD_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES,
  HARD_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS,
} from './exactPicometreArtifactTopology';
import { parseThreeMfArtifact } from './threeMfArtifact';

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

function mesh(indices: Uint32Array): MeshData {
  return {
    vertices: TETRA_VERTICES,
    indices,
    vertexCount: TETRA_VERTICES.length / 3,
    triangleCount: indices.length / 3,
  };
}

async function parsed(indices: Uint32Array) {
  const blob = await exportTo3MF(mesh(indices), { name: 'Exact topology' });
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return parseThreeMfArtifact(bytes);
}

describe('exact integer-picometre artifact topology', () => {
  it('proves the closed outward tetrahedron with exact volume sign', async () => {
    const result = assessExactPicometreArtifactTopology(await parsed(OUTWARD_TETRA_INDICES));
    expect(result).toMatchObject({
      triangleCount: 4,
      validTriangleCount: 4,
      uniqueVertexCount: 4,
      uniqueEdgeCount: 6,
      componentCount: 1,
      eulerCharacteristic: 2,
      genus: 0,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      nonManifoldVertices: 0,
      orientationMismatches: 0,
      degenerateTriangleCount: 0,
      closed: true,
      manifold: true,
      consistentlyOriented: true,
      outwardFacing: true,
      volumeSign: 'positive-exact',
      signedSixVolumePm3: '1000000000000000000000000000',
    });
    expect(result.signedVolumeMm3).toBeCloseTo(1 / 6, 15);
    expect(result.minimumDoubleAreaMm2).toBe(1);
  });

  it('distinguishes reversed orientation, boundary, non-manifold edges, and degeneracy', async () => {
    const reversed = Uint32Array.from(OUTWARD_TETRA_INDICES);
    for (let offset = 0; offset < reversed.length; offset += 3) {
      [reversed[offset + 1], reversed[offset + 2]] = [reversed[offset + 2], reversed[offset + 1]];
    }
    const reversedResult = assessExactPicometreArtifactTopology(await parsed(reversed));
    expect(reversedResult.volumeSign).toBe('negative-exact');
    expect(reversedResult.outwardFacing).toBe(false);
    expect(reversedResult.consistentlyOriented).toBe(true);

    const openResult = assessExactPicometreArtifactTopology(
      await parsed(OUTWARD_TETRA_INDICES.slice(0, 9))
    );
    expect(openResult.boundaryEdges).toBe(3);
    expect(openResult.closed).toBe(false);
    expect(openResult.genus).toBeNull();

    const duplicateResult = assessExactPicometreArtifactTopology(
      await parsed(Uint32Array.from([...OUTWARD_TETRA_INDICES, 0, 2, 1]))
    );
    expect(duplicateResult.nonManifoldEdges).toBe(3);
    expect(duplicateResult.manifold).toBe(false);

    const degenerateResult = assessExactPicometreArtifactTopology(
      await parsed(Uint32Array.from([...OUTWARD_TETRA_INDICES, 0, 0, 1]))
    );
    expect(degenerateResult.degenerateTriangleCount).toBe(1);
    expect(degenerateResult.manifold).toBe(false);
    expect(degenerateResult.minimumDoubleAreaMm2).toBe(0);
  });

  it('refuses resource, cancellation, accessor, and malformed-stream controls', async () => {
    const artifact = await parsed(OUTWARD_TETRA_INDICES);
    expect(() =>
      assessExactPicometreArtifactTopology(artifact, { maxUniqueVertices: 3 })
    ).toThrow(ExactPicometreTopologyError);

    const cancellationFlag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.store(cancellationFlag, 0, 1);
    expect(() =>
      assessExactPicometreArtifactTopology(artifact, { cancellationFlag })
    ).toThrow(/cancelled/i);

    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'maxUniqueVertices', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 4;
      },
    });
    expect(() =>
      assessExactPicometreArtifactTopology(artifact, accessor)
    ).toThrow(/data property/i);
    expect(getterCalls).toBe(0);

    for (const options of [
      { maxUniqueVertices: HARD_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES + 1 },
      { maxEdgeRecordBytes: HARD_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES + 1 },
      {
        maxTriangleVertexBytes:
          HARD_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES + 1,
      },
      { maxLinkUnionBytes: HARD_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES + 1 },
      { maxWorkUnits: HARD_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS + 1 },
    ]) {
      expect(() => assessExactPicometreArtifactTopology(artifact, options)).toThrow(
        ExactPicometreTopologyError
      );
    }

    const malformed = {
      ...artifact,
      triangleCount: artifact.triangleCount + 1,
    };
    expect(() => assessExactPicometreArtifactTopology(malformed)).toThrow(/ended before/i);
  });
});
