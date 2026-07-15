import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateBinarySTL } from '../stlExport';
import type { MeshData } from '../types';
import {
  BINARY_STL_PARSER_PROOF_MATERIAL,
  BINARY_STL_PARSER_PROOF_SHA256,
  BINARY_STL_PARSER_VERSION,
  BinaryStlArtifactError,
  PARSED_ARTIFACT_CANONICAL_VERSION,
  PARSED_TRIANGLE_SET_VERSION,
  parseBinaryStlArtifact,
} from './binaryStlArtifact';

function quadMesh(): MeshData {
  return {
    vertices: new Float32Array([0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    vertexCount: 4,
    triangleCount: 2,
  };
}

function nodeCanonicalHash(buffer: ArrayBuffer, tag: string): string {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const count = new Uint8Array(4);
  new DataView(count.buffer).setUint32(0, triangleCount, true);
  const index = new Uint8Array(4);
  const hash = createHash('sha256').update(tag).update(Uint8Array.of(0)).update(count);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const recordOffset = 84 + triangle * 50;
    hash.update(bytes.subarray(recordOffset + 12, recordOffset + 48));
    for (let corner = 0; corner < 3; corner += 1) {
      new DataView(index.buffer).setUint32(0, triangle * 3 + corner, true);
      hash.update(index);
    }
  }
  return hash.digest('hex');
}

function caughtCode(action: () => unknown): string | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(BinaryStlArtifactError);
    return (error as BinaryStlArtifactError).code;
  }
}

describe('parseBinaryStlArtifact', () => {
  it('binds exact final bytes and the independently reconstructed parsed triangle stream', () => {
    const buffer = generateBinarySTL(quadMesh(), 'G2-fixture');
    const parsed = parseBinaryStlArtifact(buffer);

    expect(parsed.triangleCount).toBe(2);
    expect(parsed.byteLength).toBe(184);
    expect(parsed.byteSha256).toBe(
      createHash('sha256').update(new Uint8Array(buffer)).digest('hex')
    );
    expect(parsed.parsedArtifactSha256).toBe(
      nodeCanonicalHash(
        buffer,
        `${PARSED_ARTIFACT_CANONICAL_VERSION}\n${BINARY_STL_PARSER_VERSION}`
      )
    );
    expect(parsed.parsedTriangleSetSha256).toBe(
      nodeCanonicalHash(buffer, PARSED_TRIANGLE_SET_VERSION)
    );
    expect(parsed.parserProofSha256).toBe(
      createHash('sha256').update(BINARY_STL_PARSER_PROOF_MATERIAL).digest('hex')
    );
    expect(parsed.parserProofSha256).toBe(BINARY_STL_PARSER_PROOF_SHA256);
    expect(parsed.bounds).toEqual({ minX: 0, minY: 0, minZ: 0, maxX: 2, maxY: 3, maxZ: 0 });
    expect(parsed.zeroFacetNormalCount).toBe(0);
    expect(parsed.nonPositiveFacetNormalDotCount).toBe(0);
    expect(parsed.maximumFacetNormalLengthError).toBe(0);
    expect(parsed.minimumFacetNormalCosine).toBe(1);
  });

  it('snapshots triangle values so later source and destination mutations cannot alter proof input', () => {
    const buffer = generateBinarySTL(quadMesh(), 'mutation-fixture');
    const parsed = parseBinaryStlArtifact(buffer);
    const before = new Float64Array(9);
    parsed.readTriangle(0, before);

    new DataView(buffer).setFloat32(96, 999, true);
    before[0] = -999;
    const after = new Float64Array(9);
    parsed.readTriangle(0, after);
    expect(after[0]).toBe(0);
    expect(after).toEqual(new Float64Array([0, 0, 0, 2, 0, 0, 2, 3, 0]));
  });

  it('makes byte identity header-sensitive while parsed geometry identity ignores header and normals', () => {
    const first = generateBinarySTL(quadMesh(), 'first-name');
    const second = generateBinarySTL(quadMesh(), 'second-name');
    new DataView(second).setFloat32(84, 0.125, true);

    const a = parseBinaryStlArtifact(first);
    const b = parseBinaryStlArtifact(second);
    expect(a.byteSha256).not.toBe(b.byteSha256);
    expect(a.parsedArtifactSha256).toBe(b.parsedArtifactSha256);
    expect(a.parsedTriangleSetSha256).toBe(b.parsedTriangleSetSha256);
    expect(a.maximumFacetNormalLengthError).not.toBe(b.maximumFacetNormalLengthError);
  });

  it('reports final-byte facet-normal conformance as informational telemetry', () => {
    const zero = generateBinarySTL(quadMesh());
    const zeroView = new DataView(zero);
    zeroView.setFloat32(84, 0, true);
    zeroView.setFloat32(88, 0, true);
    zeroView.setFloat32(92, 0, true);
    const parsedZero = parseBinaryStlArtifact(zero);
    expect(parsedZero.zeroFacetNormalCount).toBe(1);
    expect(parsedZero.nonPositiveFacetNormalDotCount).toBe(0);

    const reversed = generateBinarySTL(quadMesh());
    new DataView(reversed).setFloat32(92, -1, true);
    const parsedReversed = parseBinaryStlArtifact(reversed);
    expect(parsedReversed.zeroFacetNormalCount).toBe(0);
    expect(parsedReversed.nonPositiveFacetNormalDotCount).toBe(1);
    expect(parsedReversed.minimumFacetNormalCosine).toBe(-1);

    const nonUnit = generateBinarySTL(quadMesh());
    new DataView(nonUnit).setFloat32(92, 2, true);
    const parsedNonUnit = parseBinaryStlArtifact(nonUnit);
    expect(parsedNonUnit.maximumFacetNormalLengthError).toBe(1);
    expect(parsedNonUnit.minimumFacetNormalCosine).toBe(1);
  });

  it('respects a Uint8Array view instead of hashing adjacent backing bytes', () => {
    const artifact = new Uint8Array(generateBinarySTL(quadMesh(), 'view-fixture'));
    const backing = new Uint8Array(artifact.length + 17);
    backing.fill(0xa5);
    backing.set(artifact, 9);
    const view = backing.subarray(9, 9 + artifact.length);
    const parsed = parseBinaryStlArtifact(view);
    expect(parsed.byteSha256).toBe(createHash('sha256').update(artifact).digest('hex'));
  });

  it('rejects empty, truncated, trailing, and count-mismatched artifacts', () => {
    expect(caughtCode(() => parseBinaryStlArtifact(new ArrayBuffer(83)))).toBe('TRUNCATED_HEADER');

    const empty = new ArrayBuffer(84);
    expect(caughtCode(() => parseBinaryStlArtifact(empty))).toBe('EMPTY_ARTIFACT');

    const valid = new Uint8Array(generateBinarySTL(quadMesh()));
    const trailing = new Uint8Array(valid.length + 1);
    trailing.set(valid);
    expect(caughtCode(() => parseBinaryStlArtifact(trailing))).toBe('LENGTH_MISMATCH');

    const mismatched = valid.slice();
    new DataView(mismatched.buffer).setUint32(80, 3, true);
    expect(caughtCode(() => parseBinaryStlArtifact(mismatched))).toBe('LENGTH_MISMATCH');
  });

  it('rejects non-finite normals and vertices before returning parsed evidence', () => {
    const badNormal = generateBinarySTL(quadMesh());
    new DataView(badNormal).setFloat32(84, Number.NaN, true);
    expect(caughtCode(() => parseBinaryStlArtifact(badNormal))).toBe('NON_FINITE_NORMAL');

    const badVertex = generateBinarySTL(quadMesh());
    new DataView(badVertex).setFloat32(96, Number.POSITIVE_INFINITY, true);
    expect(caughtCode(() => parseBinaryStlArtifact(badVertex))).toBe('NON_FINITE_VERTEX');
  });

  it('fails closed on triangle, memory, and cancellation limits', () => {
    const buffer = generateBinarySTL(quadMesh());
    expect(caughtCode(() => parseBinaryStlArtifact(buffer, { maxTriangles: 1 }))).toBe(
      'RESOURCE_LIMIT'
    );
    expect(caughtCode(() => parseBinaryStlArtifact(buffer, { maxParsedVertexBytes: 71 }))).toBe(
      'RESOURCE_LIMIT'
    );
    const cancellationFlag = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(cancellationFlag, 0, 1);
    expect(caughtCode(() => parseBinaryStlArtifact(buffer, { cancellationFlag }))).toBe(
      'CANCELLED'
    );
    expect(
      caughtCode(() => parseBinaryStlArtifact(buffer, { cancellationFlag: new Int32Array(1) }))
    ).toBe('INVALID_SOURCE');
  });

  it('reports deterministic progress and validates triangle-reader ranges', () => {
    const progressCounter = new Int32Array(new SharedArrayBuffer(4));
    const parsed = parseBinaryStlArtifact(generateBinarySTL(quadMesh()), {
      progressCounter,
    });
    expect(Atomics.load(progressCounter, 0)).toBe(2);
    expect(() => parsed.readTriangle(2, new Float64Array(9))).toThrow(/outside/);
    expect(() => parsed.readTriangle(0, new Float64Array(8))).toThrow(/nine writable/);

    const visited: number[] = [];
    parsed.forEachTriangle((_triangle, index) => visited.push(index));
    expect(visited).toEqual([0, 1]);
  });
});
