import { describe, expect, it } from 'vitest';

import {
  exactPicometreTriangleIsDegenerate,
  exactPicometreTrianglesHaveForbiddenIntersection,
} from './exactPicometreTriangleIntersection';

const triangle = (...coordinates: bigint[]): BigInt64Array => BigInt64Array.from(coordinates);
const BASE = triangle(0n, 0n, 0n, 2n, 0n, 0n, 0n, 2n, 0n);

function rotate(source: BigInt64Array, corners: number): BigInt64Array {
  const result = new BigInt64Array(9);
  for (let corner = 0; corner < 3; corner += 1) {
    const sourceCorner = ((corner + corners) % 3) * 3;
    result.set(source.subarray(sourceCorner, sourceCorner + 3), corner * 3);
  }
  return result;
}

describe('exact integer-picometre triangle intersection', () => {
  it('classifies exact degeneracy across the signed int64 domain', () => {
    const maximum = (1n << 63n) - 1n;
    const minimum = -(1n << 63n);
    expect(exactPicometreTriangleIsDegenerate(
      triangle(maximum, 0n, 0n, 0n, 0n, 0n, minimum, 0n, 0n)
    )).toBe(true);
    expect(exactPicometreTriangleIsDegenerate(
      triangle(0n, 0n, 0n, maximum, 0n, 0n, minimum, 1n, 0n)
    )).toBe(false);
  });

  it('rejects a proper piercing symmetrically under cyclic permutations', () => {
    const piercing = triangle(1n, 1n, -2n, 1n, 1n, 2n, 1n, 4n, 0n);
    const scaledBase = triangle(0n, 0n, 0n, 4n, 0n, 0n, 0n, 4n, 0n);
    for (let firstRotation = 0; firstRotation < 3; firstRotation += 1) {
      for (let secondRotation = 0; secondRotation < 3; secondRotation += 1) {
        const first = rotate(scaledBase, firstRotation);
        const second = rotate(piercing, secondRotation);
        expect(exactPicometreTrianglesHaveForbiddenIntersection(first, second)).toBe(true);
        expect(exactPicometreTrianglesHaveForbiddenIntersection(second, first)).toBe(true);
      }
    }
  });

  it('allows disjoint triangles, one-picometre separation, and legitimate adjacency', () => {
    expect(exactPicometreTrianglesHaveForbiddenIntersection(
      BASE,
      triangle(3n, 0n, 0n, 4n, 0n, 0n, 3n, 1n, 0n)
    )).toBe(false);
    expect(exactPicometreTrianglesHaveForbiddenIntersection(
      BASE,
      triangle(0n, 0n, 1n, 2n, 0n, 1n, 0n, 2n, 1n)
    )).toBe(false);
    expect(exactPicometreTrianglesHaveForbiddenIntersection(
      BASE,
      triangle(0n, 0n, 0n, 2n, 0n, 0n, 0n, 0n, 2n)
    )).toBe(false);
    expect(exactPicometreTrianglesHaveForbiddenIntersection(
      BASE,
      triangle(0n, 0n, 0n, -1n, 0n, 1n, 0n, -1n, 1n)
    )).toBe(false);
  });

  it('rejects overlap from a vertex, duplicate faces, T-junctions, and coplanar overlap', () => {
    expect(exactPicometreTrianglesHaveForbiddenIntersection(
      BASE,
      triangle(0n, 0n, 0n, 1n, 0n, -1n, 1n, 0n, 1n)
    )).toBe(true);
    expect(exactPicometreTrianglesHaveForbiddenIntersection(BASE, BASE.slice())).toBe(true);
    expect(exactPicometreTrianglesHaveForbiddenIntersection(
      BASE,
      triangle(1n, 0n, 0n, 2n, -1n, 0n, 0n, -1n, 0n)
    )).toBe(true);
    expect(exactPicometreTrianglesHaveForbiddenIntersection(
      BASE,
      triangle(0n, 0n, 0n, 2n, 0n, 0n, 1n, 1n, 0n)
    )).toBe(true);
  });
});
