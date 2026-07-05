/**
 * Test-only helpers for the Tier-C perfect-mesher staging module.
 *
 * `hashMesh` is the byte-identical oracle for the flag-off zero-regression
 * guarantee: FNV-1a over the exact bytes of every field of a
 * `ConformingOuterWallResult`, with field lengths mixed in as separators so
 * differently-partitioned outputs cannot collide by concatenation.
 */

import type { ConformingOuterWallResult } from '../ConformingOuterWall';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1aBytes(hash: number, bytes: Uint8Array): number {
  let h = hash;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

function fnv1aNumber(hash: number, value: number): number {
  const buf = new DataView(new ArrayBuffer(8));
  buf.setFloat64(0, value, true);
  return fnv1aBytes(hash, new Uint8Array(buf.buffer));
}

/** Order-sensitive byte hash of a full conforming outer-wall result. */
export function hashMesh(mesh: ConformingOuterWallResult): string {
  let h = FNV_OFFSET;
  h = fnv1aNumber(h, mesh.vertices.length);
  h = fnv1aBytes(
    h,
    new Uint8Array(
      mesh.vertices.buffer,
      mesh.vertices.byteOffset,
      mesh.vertices.byteLength,
    ),
  );
  h = fnv1aNumber(h, mesh.indices.length);
  h = fnv1aBytes(
    h,
    new Uint8Array(
      mesh.indices.buffer,
      mesh.indices.byteOffset,
      mesh.indices.byteLength,
    ),
  );
  h = fnv1aNumber(h, mesh.seamTriangles.length);
  h = fnv1aBytes(
    h,
    new Uint8Array(
      mesh.seamTriangles.buffer,
      mesh.seamTriangles.byteOffset,
      mesh.seamTriangles.byteLength,
    ),
  );
  h = fnv1aNumber(h, mesh.gridVertexCount);
  h = fnv1aNumber(h, mesh.bottomRing.length);
  for (const i of mesh.bottomRing) h = fnv1aNumber(h, i);
  h = fnv1aNumber(h, mesh.topRing.length);
  for (const i of mesh.topRing) h = fnv1aNumber(h, i);
  return h.toString(16).padStart(8, '0');
}
