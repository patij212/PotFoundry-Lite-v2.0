/**
 * stlRoundTrip.test.ts — Plan Task 3.3 (A): binary STL write → parse round-trip.
 *
 * Builds a real pot (`buildPotMesh`), writes it to binary STL via the production
 * writer (`generateBinarySTL` in `stlExport.ts`), then parses the raw 84 + 50·n
 * byte stream straight back from the `ArrayBuffer` — independently of the writer —
 * and asserts three invariants:
 *
 *   1. COUNT — the uint32 LE triangle count at byte offset 80 equals the mesh's
 *      `triangleCount`, and the buffer is exactly `84 + 50·count` bytes long.
 *   2. CHECKSUM — a coordinate checksum over every parsed facet vertex is stable
 *      across two independent exports of the same pot (the writer is deterministic
 *      for a fixed mesh, so the bytes — and therefore the checksum — must match).
 *   3. BBOX — the bounding box recovered from the parsed facet vertices, in mm,
 *      matches the input `PotDimensions`: the Z extent equals `H`, and the radial
 *      (X/Y) half-extent sits in a band around `max(Rt, Rb)` that accommodates the
 *      style displacement but rules out a unit-scale error (e.g. cm instead of mm).
 *
 * The parser here is deliberately a from-scratch re-implementation of the binary
 * STL layout (NOT a call back into the writer) so the test genuinely round-trips
 * the on-disk byte format rather than re-checking the writer against itself.
 *
 * Reference: `src/geometry/stlExport.ts` (`generateBinarySTL`, layout doc),
 * `src/geometry/meshBuilder.ts` (`buildPotMesh`),
 * `src/geometry/types.ts` (`PotDimensions`, `DEFAULT_DIMENSIONS`).
 */
import { describe, it, expect } from 'vitest';
import { buildPotMesh } from './meshBuilder';
import { generateBinarySTL } from './stlExport';
import { DEFAULT_DIMENSIONS } from './types';
import type { PotDimensions, StyleId } from './types';

// ---------------------------------------------------------------------------
// Binary STL parser (independent re-implementation of the on-disk layout).
// Layout: 80-byte header, uint32 LE triangle count @ offset 80, then per facet
// 50 bytes = 12 (normal: 3×f32) + 36 (3 verts: 9×f32) + 2 (attr byte count).
// ---------------------------------------------------------------------------
interface ParsedSTL {
  triangleCount: number;
  /** Flat parsed vertex coords [x,y,z,...] in facet order (9 floats/facet). */
  coords: number[];
  /** Flat parsed facet normals [nx,ny,nz,...] (3 floats/facet). */
  normals: number[];
}

function parseBinarySTL(buffer: ArrayBuffer): ParsedSTL {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);

  // The buffer length MUST equal the declared layout exactly.
  if (buffer.byteLength !== 84 + triangleCount * 50) {
    throw new Error(
      `STL byte length ${buffer.byteLength} != 84 + 50*${triangleCount}`,
    );
  }

  const coords: number[] = [];
  const normals: number[] = [];
  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    normals.push(view.getFloat32(offset, true)); offset += 4;
    normals.push(view.getFloat32(offset, true)); offset += 4;
    normals.push(view.getFloat32(offset, true)); offset += 4;
    for (let v = 0; v < 9; v++) {
      coords.push(view.getFloat32(offset, true));
      offset += 4;
    }
    offset += 2; // attribute byte count (skipped)
  }
  return { triangleCount, coords, normals };
}

/** Order-independent, overflow-safe coordinate checksum over parsed facets. */
function coordChecksum(parsed: ParsedSTL): number {
  // Sum with a small per-index mix so a transposition changes the result, while
  // staying numerically stable (FNV-style folding kept in the float range).
  let acc = 0;
  const { coords } = parsed;
  for (let i = 0; i < coords.length; i++) {
    // round to micron to neutralise pure f32 representation noise across runs
    const q = Math.round(coords[i] * 1000) / 1000;
    acc = (acc + q * (1 + (i % 9))) % 1e9;
  }
  return Math.round(acc * 1000) / 1000;
}

function bboxFromCoords(coords: number[]): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < coords.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const c = coords[i + a];
      if (c < min[a]) min[a] = c;
      if (c > max[a]) max[a] = c;
    }
  }
  return { min, max };
}

const STYLE: StyleId = 'SuperellipseMorph';
const DIMS: PotDimensions = { ...DEFAULT_DIMENSIONS };

describe('stlRoundTrip — binary STL write → independent parse', () => {
  it('declared triangle count matches the mesh and the byte length is exact', () => {
    const { mesh } = buildPotMesh(DIMS, {}, STYLE, {});
    const buffer = generateBinarySTL(mesh, 'roundtrip');
    const parsed = parseBinarySTL(buffer);

    expect(parsed.triangleCount).toBe(mesh.triangleCount);
    // parseBinarySTL throws if the length is wrong, but assert explicitly too.
    expect(buffer.byteLength).toBe(84 + mesh.triangleCount * 50);
    // A real pot has many thousands of facets — guard against a vacuous pass.
    expect(parsed.triangleCount).toBeGreaterThan(1000);
    expect(parsed.coords.length).toBe(mesh.triangleCount * 9);
  });

  it('coordinate checksum is stable across two deterministic exports', () => {
    const a = buildPotMesh(DIMS, {}, STYLE, {});
    const b = buildPotMesh(DIMS, {}, STYLE, {});
    const sumA = coordChecksum(parseBinarySTL(generateBinarySTL(a.mesh, 'rt')));
    const sumB = coordChecksum(parseBinarySTL(generateBinarySTL(b.mesh, 'rt')));

    expect(Number.isFinite(sumA)).toBe(true);
    expect(sumA).not.toBe(0);
    expect(sumB).toBe(sumA);
  });

  it('parsed bounding box (mm) matches the input PotDimensions', () => {
    const { mesh } = buildPotMesh(DIMS, {}, STYLE, {});
    const parsed = parseBinarySTL(generateBinarySTL(mesh, 'rt'));
    const { min, max } = bboxFromCoords(parsed.coords);

    // Z spans 0..H (meshBuilder samples zOuter[i] = (i/nZ)*H). The exported Z
    // extent must equal the pot height to sub-millimetre precision.
    const zExtent = max[2] - min[2];
    expect(zExtent).toBeCloseTo(DIMS.H, 1); // within 0.05mm
    expect(min[2]).toBeCloseTo(0, 1);

    // Radial (X/Y) half-extent: dominated by the outer wall at radius
    // max(Rt, Rb), plus the style displacement. A band rules out a unit error
    // (a cm/mm mixup would land ~10x outside this band) without over-pinning
    // the exact style amplitude.
    const radial = Math.max(
      Math.abs(min[0]), Math.abs(max[0]),
      Math.abs(min[1]), Math.abs(max[1]),
    );
    const baseRadius = Math.max(DIMS.Rt, DIMS.Rb);
    expect(radial).toBeGreaterThan(baseRadius * 0.7);
    expect(radial).toBeLessThan(baseRadius * 1.6);
  });
});
