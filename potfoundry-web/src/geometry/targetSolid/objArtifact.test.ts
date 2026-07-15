import { describe, expect, it } from 'vitest';

import { exportToOBJ } from '../exporters/exportOBJ';
import type { MeshData } from '../types';
import {
  createObjFinalArtifactProofSession,
  ObjArtifactError,
  parseObjArtifact,
  parsedObjArtifactForProofSession,
} from './objArtifact';

function triangleMesh(xMm = 25.4): MeshData {
  return {
    vertices: new Float32Array([0, 0, 0, xMm, 0, 0, 0, 10, 0]),
    indices: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    triangleCount: 1,
  };
}

async function bytes(options: Parameters<typeof exportToOBJ>[1] = {}): Promise<Uint8Array> {
  const blob = await exportToOBJ(triangleMesh(), { name: 'Proof', ...options });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('strict exact final-byte OBJ parser', () => {
  it('parses the exporter profile into exact picometre triangles', async () => {
    const parsed = parseObjArtifact(await bytes());
    expect(parsed).toMatchObject({
      vertexCount: 3,
      triangleCount: 1,
      normalCount: 1,
      hasFaceNormals: true,
      coordinateFractionDigits: 6,
      coordinateStepPm: '1000',
      coordinateQuantizationRadiusPmUpper: '500',
    });
    expect(parsed.boundsPm).toEqual({
      minX: '0',
      minY: '0',
      minZ: '0',
      maxX: '25400000000',
      maxY: '10000000000',
      maxZ: '0',
    });
    const triangle = new BigInt64Array(9);
    parsed.readTrianglePicometres(0, triangle);
    expect([...triangle]).toEqual([
      0n, 0n, 0n,
      25_400_000_000n, 0n, 0n,
      0n, 10_000_000_000n, 0n,
    ]);
  });

  it('binds identical geometry across optional normals and reports exact precision', async () => {
    const withNormals = parseObjArtifact(await bytes({ includeNormals: true }));
    const withoutNormals = parseObjArtifact(await bytes({ includeNormals: false }));
    expect(withNormals.parsedTriangleSetSha256).toBe(withoutNormals.parsedTriangleSetSha256);
    expect(withNormals.byteSha256).not.toBe(withoutNormals.byteSha256);
    expect(withoutNormals.normalCount).toBe(0);

    const precise = parseObjArtifact(await bytes({ includeNormals: false, precision: 9 }));
    expect(precise.coordinateStepPm).toBe('1');
    expect(precise.coordinateQuantizationRadiusPmUpper).toBe('1');
    expect(precise.boundsPm.maxX).toBe('25399999619');
  });

  it('mints an unforgeable proof session over the exact text bytes', async () => {
    const session = createObjFinalArtifactProofSession(await bytes());
    expect(parsedObjArtifactForProofSession(session).triangleCount).toBe(1);
    expect(() => parsedObjArtifactForProofSession({ ...session })).toThrow(/not minted/i);
  });

  it('refuses unsupported commands, polygons, relative indices, and sub-pm decimals', async () => {
    const source = new TextEncoder().encode([
      'o Proof',
      'v 0.000000 0.000000 0.000000',
      'v 1.000000 0.000000 0.000000',
      'v 0.000000 1.000000 0.000000',
      'f 1 2 3',
    ].join('\n'));
    const variants = [
      new TextEncoder().encode(new TextDecoder().decode(source).replace('o Proof', 'g Proof')),
      new TextEncoder().encode(new TextDecoder().decode(source).replace('f 1 2 3', 'f 1 2 3 1')),
      new TextEncoder().encode(new TextDecoder().decode(source).replace('f 1 2 3', 'f -3 -2 -1')),
      new TextEncoder().encode(
        new TextDecoder().decode(source).replace('0.000000 0.000000', '0.0000000001 0.000000')
      ),
    ];
    for (const variant of variants) {
      expect(() => parseObjArtifact(variant)).toThrow(ObjArtifactError);
    }
  });

  it('refuses resource, cancellation, accessor, and malformed normal/index profiles', async () => {
    const source = await bytes();
    expect(() => parseObjArtifact(source, { maxVertices: 2 })).toThrow(/vertex count/i);
    const cancellationFlag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.store(cancellationFlag, 0, 1);
    expect(() => parseObjArtifact(source, { cancellationFlag })).toThrow(/cancelled/i);

    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'maxVertices', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 3;
      },
    });
    expect(() => parseObjArtifact(source, accessor)).toThrow(/data property/i);
    expect(getterCalls).toBe(0);

    const text = new TextDecoder().decode(source);
    expect(() => parseObjArtifact(new TextEncoder().encode(text.replace('//1', '//2'))))
      .toThrow(/outside/i);
    expect(() => parseObjArtifact(new TextEncoder().encode(text.replace('f 1//1', 'f 9//1'))))
      .toThrow(/outside/i);
  });
});
