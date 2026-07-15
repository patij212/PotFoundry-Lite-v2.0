import { describe, expect, it } from 'vitest';
import { generateBinarySTL } from '../stlExport';
import type { MeshData } from '../types';
import { parseBinaryStlArtifact } from './binaryStlArtifact';
import type { ParsedBinaryStlArtifact } from './binaryStlArtifact';
import {
  assessParsedArtifactTopology,
  HARD_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
  HARD_TOPOLOGY_MAX_LINK_UNION_BYTES,
  HARD_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
  HARD_TOPOLOGY_MAX_UNIQUE_VERTICES,
  HARD_TOPOLOGY_MAX_WORK_UNITS,
  ParsedTopologyError,
} from './parsedArtifactTopology';

const TETRA_VERTICES = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
const TETRA_INDICES = new Uint32Array([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]);

function mesh(indices: number[], vertices = TETRA_VERTICES): MeshData {
  return {
    vertices,
    indices: Uint32Array.from(indices),
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

function topology(source: MeshData) {
  return assessParsedArtifactTopology(parseBinaryStlArtifact(generateBinarySTL(source)));
}

function flipSerializedFacet(buffer: ArrayBuffer, triangleIndex: number): void {
  const bytes = new Uint8Array(buffer);
  const vertexOffset = 84 + triangleIndex * 50 + 12;
  const firstVertex = bytes.slice(vertexOffset, vertexOffset + 12);
  bytes.copyWithin(vertexOffset, vertexOffset + 12, vertexOffset + 24);
  bytes.set(firstVertex, vertexOffset + 12);
}

function caughtCode(action: () => unknown): string | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(ParsedTopologyError);
    return (error as ParsedTopologyError).code;
  }
}

function naiveDisconnectedVertexLinkCount(artifact: ParsedBinaryStlArtifact): number {
  const bitBuffer = new ArrayBuffer(4);
  const bitView = new DataView(bitBuffer);
  const vertexIds = new Map<string, number>();
  const triangles: number[][] = [];
  const idFor = (x: number, y: number, z: number): number => {
    const parts = [x, y, z].map((value) => {
      bitView.setFloat32(0, value === 0 ? 0 : value, true);
      return bitView.getUint32(0, true);
    });
    const key = parts.join(',');
    const existing = vertexIds.get(key);
    if (existing !== undefined) return existing;
    const id = vertexIds.size;
    vertexIds.set(key, id);
    return id;
  };

  artifact.forEachTriangle((triangle) => {
    const abx = triangle[3] - triangle[0];
    const aby = triangle[4] - triangle[1];
    const abz = triangle[5] - triangle[2];
    const acx = triangle[6] - triangle[0];
    const acy = triangle[7] - triangle[1];
    const acz = triangle[8] - triangle[2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    if (Math.hypot(crossX, crossY, crossZ) === 0) return;
    triangles.push([
      idFor(triangle[0], triangle[1], triangle[2]),
      idFor(triangle[3], triangle[4], triangle[5]),
      idFor(triangle[6], triangle[7], triangle[8]),
    ]);
  });

  const incidentTriangles = Array.from({ length: vertexIds.size }, () => [] as number[]);
  for (let triangle = 0; triangle < triangles.length; triangle += 1) {
    for (const vertex of triangles[triangle]) incidentTriangles[vertex].push(triangle);
  }

  let disconnected = 0;
  for (let vertex = 0; vertex < incidentTriangles.length; vertex += 1) {
    const incident = incidentTriangles[vertex];
    if (incident.length < 2) continue;
    const visited = new Set<number>([incident[0]]);
    const queue = [incident[0]];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const currentOther = triangles[current].filter((candidate) => candidate !== vertex);
      for (const candidate of incident) {
        if (visited.has(candidate)) continue;
        const candidateOther = triangles[candidate].filter((other) => other !== vertex);
        if (currentOther.some((other) => candidateOther.includes(other))) {
          visited.add(candidate);
          queue.push(candidate);
        }
      }
    }
    if (visited.size !== incident.length) disconnected += 1;
  }
  return disconnected;
}

describe('assessParsedArtifactTopology', () => {
  it('proves the exact combinatorics, component, Euler characteristic, genus, and volume of a tetrahedron', () => {
    const result = topology(mesh([...TETRA_INDICES]));
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
      orientationMismatches: 0,
      degenerateTriangleCount: 0,
      closed: true,
      manifold: true,
      consistentlyOriented: true,
      outwardFacing: true,
      volumeSign: 'positive-proven',
    });
    expect(result.signedVolumeMm3).toBeCloseTo(1 / 6, 12);
    expect(result.signedVolumeErrorBoundMm3).toBeGreaterThan(0);
    expect(result.signedVolumeErrorBoundMm3).toBeLessThan(1e-12);
    expect(result.artifactByteSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('detects an open boundary from the final serialized triangle set', () => {
    const result = topology(mesh([...TETRA_INDICES.slice(0, 9)]));
    expect(result.boundaryEdges).toBe(3);
    expect(result.closed).toBe(false);
    expect(result.genus).toBeNull();
  });

  it('detects non-manifold triple-use edges independently of source indices', () => {
    const indices = [...TETRA_INDICES, 0, 2, 1];
    const result = topology(mesh(indices));
    expect(result.nonManifoldEdges).toBe(3);
    expect(result.closed).toBe(false);
    expect(result.manifold).toBe(false);
    expect(result.consistentlyOriented).toBe(false);
    expect(result.outwardFacing).toBe(false);
    expect(result.genus).toBeNull();
  });

  it('rejects two closed tetrahedra pinched at one exact vertex', () => {
    const vertices = new Float32Array([...TETRA_VERTICES, -1, 0, 0, 0, -1, 0, 0, 0, -1]);
    const second = [...TETRA_INDICES].map((index) => (index === 0 ? 0 : index + 3));
    const result = topology(mesh([...TETRA_INDICES, ...second], vertices));
    expect(result).toMatchObject({
      componentCount: 1,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      nonManifoldVertices: 1,
      closed: true,
      manifold: false,
      consistentlyOriented: false,
      outwardFacing: false,
      genus: null,
    });
  });

  it('rejects a genus-zero false pass with two disconnected link cycles at each pole', () => {
    const vertices = new Float32Array([
      0, 0, 1, 0, 0, -1, 1, 0, 0, 0, 1, 0, -1, 0, 0, 0, -1, 0, 2, 2, 0, -2, 2, 0, -2, -2, 0, 2, -2,
      0,
    ]);
    const octahedronFaces = (equator: number[]): number[] => {
      const faces: number[] = [];
      for (let index = 0; index < 4; index += 1) {
        const current = equator[index];
        const next = equator[(index + 1) % 4];
        faces.push(0, current, next, 1, next, current);
      }
      return faces;
    };
    const result = topology(
      mesh([...octahedronFaces([2, 3, 4, 5]), ...octahedronFaces([6, 7, 8, 9])], vertices)
    );
    expect(result.eulerCharacteristic).toBe(2);
    expect(result.boundaryEdges).toBe(0);
    expect(result.nonManifoldEdges).toBe(0);
    expect(result.nonManifoldVertices).toBe(2);
    expect(result.manifold).toBe(false);
    expect(result.genus).toBeNull();
  });

  it('canonicalizes signed-zero pinches but distinguishes a one-ULP separation', () => {
    const sharedVertices = new Float32Array([
      ...TETRA_VERTICES,
      -0,
      -0,
      -0,
      -1,
      0,
      0,
      0,
      -1,
      0,
      0,
      0,
      -1,
    ]);
    const second = [...TETRA_INDICES].map((index) => index + 4);
    const pinched = topology(mesh([...TETRA_INDICES, ...second], sharedVertices));
    expect(pinched.componentCount).toBe(1);
    expect(pinched.nonManifoldVertices).toBe(1);

    const separatedVertices = sharedVertices.slice();
    separatedVertices[12] = new Float32Array(new Uint32Array([1]).buffer)[0];
    const separated = topology(mesh([...TETRA_INDICES, ...second], separatedVertices));
    expect(separated.componentCount).toBe(2);
    expect(separated.nonManifoldVertices).toBe(0);
    expect(separated.manifold).toBe(true);
  });

  it('matches an independent naive vertex-link oracle over deterministic small complexes', () => {
    const vertices: number[] = [];
    for (let value = 1; value <= 9; value += 1) {
      vertices.push(value, value * value, value * value * value);
    }
    let state = 0x5eed_1234;
    const random = (): number => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state;
    };
    for (let fixture = 0; fixture < 48; fixture += 1) {
      const indices: number[] = [];
      const triangleCount = 4 + (random() % 10);
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const a = random() % 9;
        let b = random() % 9;
        let c = random() % 9;
        while (b === a) b = random() % 9;
        while (c === a || c === b) c = random() % 9;
        indices.push(a, b, c);
      }
      const artifact = parseBinaryStlArtifact(
        generateBinarySTL(mesh(indices, Float32Array.from(vertices)))
      );
      const result = assessParsedArtifactTopology(artifact);
      expect(result.nonManifoldVertices, `fixture ${fixture}`).toBe(
        naiveDisconnectedVertexLinkCount(artifact)
      );
    }
  });

  it('detects a flipped face through exact directed edge pairing', () => {
    const buffer = generateBinarySTL(mesh([...TETRA_INDICES]));
    flipSerializedFacet(buffer, 0);
    const result = assessParsedArtifactTopology(parseBinaryStlArtifact(buffer));
    expect(result.orientationMismatches).toBe(3);
    expect(result.consistentlyOriented).toBe(false);
    expect(result.genus).toBeNull();
  });

  it('proves a consistently inverted closed shell has negative volume', () => {
    const buffer = generateBinarySTL(mesh([...TETRA_INDICES]));
    for (let triangle = 0; triangle < 4; triangle += 1) {
      flipSerializedFacet(buffer, triangle);
    }
    const result = assessParsedArtifactTopology(parseBinaryStlArtifact(buffer));
    expect(result.closed).toBe(true);
    expect(result.manifold).toBe(true);
    expect(result.consistentlyOriented).toBe(true);
    expect(result.volumeSign).toBe('negative-proven');
    expect(result.outwardFacing).toBe(false);
    expect(result.signedVolumeMm3).toBeCloseTo(-1 / 6, 12);
  });

  it('refuses to infer a volume sign when disjoint shell volumes exactly cancel', () => {
    const translated = new Float32Array([...TETRA_VERTICES, 3, 0, 0, 4, 0, 0, 3, 1, 0, 3, 0, 1]);
    const second = [...TETRA_INDICES].map((index) => index + 4);
    const buffer = generateBinarySTL(mesh([...TETRA_INDICES, ...second], translated));
    for (let triangle = 4; triangle < 8; triangle += 1) {
      flipSerializedFacet(buffer, triangle);
    }
    const result = assessParsedArtifactTopology(parseBinaryStlArtifact(buffer));
    expect(result.componentCount).toBe(2);
    expect(result.closed).toBe(true);
    expect(result.manifold).toBe(true);
    expect(result.consistentlyOriented).toBe(true);
    expect(result.volumeSign).toBe('indeterminate');
    expect(result.outwardFacing).toBe(false);
  });

  it('counts two disconnected closed components and their total genus', () => {
    const translated = new Float32Array([...TETRA_VERTICES, 3, 0, 0, 4, 0, 0, 3, 1, 0, 3, 0, 1]);
    const second = [...TETRA_INDICES].map((index) => index + 4);
    const result = topology(mesh([...TETRA_INDICES, ...second], translated));
    expect(result.componentCount).toBe(2);
    expect(result.eulerCharacteristic).toBe(4);
    expect(result.genus).toBe(0);
    expect(result.closed).toBe(true);
  });

  it('canonicalizes signed zero but rejects exact zero-area triangles as degenerate', () => {
    const vertices = new Float32Array([-0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0]);
    const result = topology(mesh([0, 1, 2, 3, 1, 2, 0, 0, 1], vertices));
    expect(result.uniqueVertexCount).toBe(3);
    expect(result.degenerateTriangleCount).toBe(1);
    expect(result.manifold).toBe(false);
  });

  it('fails closed on memory and cancellation limits', () => {
    const artifact = parseBinaryStlArtifact(generateBinarySTL(mesh([...TETRA_INDICES])));
    expect(caughtCode(() => assessParsedArtifactTopology(artifact, { maxUniqueVertices: 3 }))).toBe(
      'RESOURCE_LIMIT'
    );
    expect(
      caughtCode(() => assessParsedArtifactTopology(artifact, { maxEdgeRecordBytes: 95 }))
    ).toBe('RESOURCE_LIMIT');
    expect(
      caughtCode(() => assessParsedArtifactTopology(artifact, { maxTriangleVertexBytes: 47 }))
    ).toBe('RESOURCE_LIMIT');
    expect(
      caughtCode(() => assessParsedArtifactTopology(artifact, { maxLinkUnionBytes: 79 }))
    ).toBe('RESOURCE_LIMIT');

    const cancellationFlag = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(cancellationFlag, 0, 1);
    expect(caughtCode(() => assessParsedArtifactTopology(artifact, { cancellationFlag }))).toBe(
      'CANCELLED'
    );

    for (const options of [
      { maxUniqueVertices: HARD_TOPOLOGY_MAX_UNIQUE_VERTICES + 1 },
      { maxEdgeRecordBytes: HARD_TOPOLOGY_MAX_EDGE_RECORD_BYTES + 1 },
      { maxTriangleVertexBytes: HARD_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES + 1 },
      { maxLinkUnionBytes: HARD_TOPOLOGY_MAX_LINK_UNION_BYTES + 1 },
      { maxWorkUnits: HARD_TOPOLOGY_MAX_WORK_UNITS + 1 },
    ]) {
      expect(caughtCode(() => assessParsedArtifactTopology(artifact, options))).toBe(
        'RESOURCE_LIMIT'
      );
    }
  });
});
