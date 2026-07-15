import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import type { MeshData } from '../types';
import { exportTo3MF } from '../exporters/export3MF';
import {
  createThreeMfFinalArtifactProofSession,
  parseThreeMfArtifact,
  parsedThreeMfArtifactForProofSession,
  type ParseThreeMfArtifactOptions,
  ThreeMfArtifactError,
} from './threeMfArtifact';

function triangleMesh(xMm = 25.4): MeshData {
  return {
    vertices: new Float32Array([0, 0, 0, xMm, 0, 0, 0, 10, 0]),
    indices: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    triangleCount: 1,
  };
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function exportedBytes(
  unit: 'millimeter' | 'centimeter' | 'inch' = 'millimeter'
): Promise<Uint8Array> {
  return blobBytes(await exportTo3MF(triangleMesh(), { name: 'Proof', unit }));
}

describe('strict exact final-byte 3MF parser', () => {
  it('parses the exporter profile into exact picometre triangles', async () => {
    const parsed = await parseThreeMfArtifact(await exportedBytes());
    expect(parsed.modelUnit).toBe('millimeter');
    expect(parsed.vertexCount).toBe(3);
    expect(parsed.triangleCount).toBe(1);
    expect(parsed.boundsPm).toEqual({
      minX: '0',
      minY: '0',
      minZ: '0',
      maxX: '25399999619',
      maxY: '10000000000',
      maxZ: '0',
    });
    const triangle = new BigInt64Array(9);
    parsed.readTrianglePicometres(0, triangle);
    expect([...triangle]).toEqual([
      0n, 0n, 0n,
      25_399_999_619n, 0n, 0n,
      0n, 10_000_000_000n, 0n,
    ]);
    expect(parsed.byteSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.parsedTriangleSetSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes all units to picometres within the exporter quantization budget', async () => {
    const parsed = await Promise.all(
      (['millimeter', 'centimeter', 'inch'] as const).map(async (unit) =>
        parseThreeMfArtifact(await exportedBytes(unit))
      )
    );
    const triangles = parsed.map((artifact) => {
      const triangle = new BigInt64Array(9);
      artifact.readTrianglePicometres(0, triangle);
      return triangle;
    });
    for (let coordinate = 0; coordinate < 9; coordinate += 1) {
      const values = triangles.map((triangle) => triangle[coordinate]);
      const spread = values.reduce((maximum, value) => value > maximum ? value : maximum) -
        values.reduce((minimum, value) => value < minimum ? value : minimum);
      // One 1e-8-inch output step is 254 pm; mm/cm are finer.
      expect(spread).toBeLessThanOrEqual(254n);
    }
    expect(new Set(parsed.map((artifact) => artifact.byteSha256)).size).toBe(3);
  });

  it('mints an unforgeable proof session over the exact archive bytes', async () => {
    const session = await createThreeMfFinalArtifactProofSession(await exportedBytes());
    expect(parsedThreeMfArtifactForProofSession(session).triangleCount).toBe(1);
    expect(() => parsedThreeMfArtifactForProofSession({ ...session })).toThrow(/not minted/i);
  });

  it('refuses extra file parts and out-of-range triangle indices', async () => {
    const source = await exportedBytes();
    const extraZip = await JSZip.loadAsync(source);
    extraZip.file('evil.txt', 'not part of the certified profile');
    const extraBytes = await extraZip.generateAsync({ type: 'uint8array' });
    await expect(parseThreeMfArtifact(extraBytes)).rejects.toMatchObject({
      code: 'PACKAGE_PART_EXTRA',
    });

    const indexZip = await JSZip.loadAsync(source);
    const model = indexZip.file('3D/3dmodel.model');
    const xml = (await model!.async('string')).replace('v3="2"', 'v3="99"');
    indexZip.file('3D/3dmodel.model', xml);
    const indexBytes = await indexZip.generateAsync({ type: 'uint8array' });
    await expect(parseThreeMfArtifact(indexBytes)).rejects.toMatchObject({
      code: 'INDEX_INVALID',
    });
  });

  it('refuses sub-picometre decimals, resource overruns, and cancellation', async () => {
    const source = await exportedBytes();
    const coordinateZip = await JSZip.loadAsync(source);
    const model = coordinateZip.file('3D/3dmodel.model');
    const xml = (await model!.async('string')).replace('x="0.000000000"', 'x="0.0000000001"');
    coordinateZip.file('3D/3dmodel.model', xml);
    const coordinateBytes = await coordinateZip.generateAsync({ type: 'uint8array' });
    await expect(parseThreeMfArtifact(coordinateBytes)).rejects.toMatchObject({
      code: 'COORDINATE_INVALID',
    });
    await expect(parseThreeMfArtifact(source, { maxTriangles: 1, maxVertices: 2 })).rejects.toBeInstanceOf(
      ThreeMfArtifactError
    );

    if (typeof SharedArrayBuffer !== 'undefined') {
      const cancellationFlag = new Int32Array(new SharedArrayBuffer(4));
      Atomics.store(cancellationFlag, 0, 1);
      await expect(parseThreeMfArtifact(source, { cancellationFlag })).rejects.toMatchObject({
        code: 'CANCELLED',
      });
    }
  });

  it('snapshots only plain own data options before asynchronous work', async () => {
    const source = await exportedBytes();
    let getterCalls = 0;
    const accessorOptions = Object.defineProperty({}, 'maxTriangles', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 1;
      },
    });
    await expect(parseThreeMfArtifact(source, accessorOptions)).rejects.toMatchObject({
      code: 'INVALID_SOURCE',
    });
    expect(getterCalls).toBe(0);

    await expect(parseThreeMfArtifact(source, { unexpected: 1 } as never)).rejects.toMatchObject({
      code: 'INVALID_SOURCE',
    });
    await expect(
      parseThreeMfArtifact(source, Object.create({ maxTriangles: 1 }) as ParseThreeMfArtifactOptions)
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE' });

    const wrongCounter = new Uint32Array(new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT));
    await expect(
      parseThreeMfArtifact(source, { cancellationFlag: wrongCounter as never })
    ).rejects.toMatchObject({ code: 'INVALID_SOURCE' });
  });
});
