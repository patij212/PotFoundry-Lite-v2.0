import { describe, expect, it } from 'vitest';
import {
  exactTriangleIsDegenerate,
  trianglesHaveForbiddenIntersection,
} from './exactTriangleIntersection';

const triangle = (...coordinates: number[]): Float64Array => Float64Array.from(coordinates);

const BASE = triangle(0, 0, 0, 2, 0, 0, 0, 2, 0);

function rotate(source: Float64Array, corners: number): Float64Array {
  const result = new Float64Array(9);
  for (let corner = 0; corner < 3; corner += 1) {
    const sourceCorner = ((corner + corners) % 3) * 3;
    result.set(source.subarray(sourceCorner, sourceCorner + 3), corner * 3);
  }
  return result;
}

describe('trianglesHaveForbiddenIntersection', () => {
  it('classifies degeneracy with exact predicates across the binary32 exponent range', () => {
    const maximumF32 = new Float32Array(new Uint32Array([0x7f7f_ffff]).buffer)[0];
    const minimumPositiveF32 = new Float32Array(new Uint32Array([1]).buffer)[0];
    expect(
      exactTriangleIsDegenerate(triangle(maximumF32, 0, 0, 0, 0, 0, minimumPositiveF32, 0, 0))
    ).toBe(true);
    expect(
      exactTriangleIsDegenerate(
        triangle(0, 0, 0, maximumF32, 0, 0, minimumPositiveF32, minimumPositiveF32, 0)
      )
    ).toBe(false);
  });

  it('rejects a proper non-coplanar piercing and is symmetric under cyclic permutations', () => {
    const piercing = triangle(0.5, 0.5, -1, 0.5, 0.5, 1, 0.5, 2, 0);
    for (let firstRotation = 0; firstRotation < 3; firstRotation += 1) {
      for (let secondRotation = 0; secondRotation < 3; secondRotation += 1) {
        const first = rotate(BASE, firstRotation);
        const second = rotate(piercing, secondRotation);
        expect(trianglesHaveForbiddenIntersection(first, second)).toBe(true);
        expect(trianglesHaveForbiddenIntersection(second, first)).toBe(true);
      }
    }
  });

  it('allows disjoint triangles and a one-binary32-ULP plane separation', () => {
    expect(trianglesHaveForbiddenIntersection(BASE, triangle(3, 0, 0, 4, 0, 0, 3, 1, 0))).toBe(
      false
    );
    const minimumPositiveF32 = new Float32Array(new Uint32Array([1]).buffer)[0];
    expect(
      trianglesHaveForbiddenIntersection(
        BASE,
        triangle(0, 0, minimumPositiveF32, 2, 0, minimumPositiveF32, 0, 2, minimumPositiveF32)
      )
    ).toBe(false);
  });

  it('allows only the exact shared edge of non-coplanar adjacent triangles', () => {
    const adjacent = triangle(0, 0, 0, 2, 0, 0, 0, 0, 2);
    expect(trianglesHaveForbiddenIntersection(BASE, adjacent)).toBe(false);
  });

  it('allows an isolated exact shared vertex but rejects overlap extending from it', () => {
    const vertexOnly = triangle(0, 0, 0, -1, 0, 1, 0, -1, 1);
    const sharedRay = triangle(0, 0, 0, 1, 0, -1, 1, 0, 1);
    expect(trianglesHaveForbiddenIntersection(BASE, vertexOnly)).toBe(false);
    expect(trianglesHaveForbiddenIntersection(BASE, sharedRay)).toBe(true);
  });

  it('never chooses an exactly singular projection from an inexact normal magnitude', () => {
    const minimumScale = 2 ** -48;
    const first = triangle(0, minimumScale, 3 * minimumScale, minimumScale, 40, 120, 0, 0, 0);
    const second = Float64Array.from(first, (value) => -value);
    expect(exactTriangleIsDegenerate(first)).toBe(false);
    expect(exactTriangleIsDegenerate(second)).toBe(false);
    expect(trianglesHaveForbiddenIntersection(first, second)).toBe(false);
    expect(trianglesHaveForbiddenIntersection(second, first)).toBe(false);
  });

  it('allows a coplanar shared edge only when interiors lie on opposite sides', () => {
    const adjacent = triangle(0, 0, 0, 2, 0, 0, 0, -2, 0);
    const overlapping = triangle(0, 0, 0, 2, 0, 0, 1, 1, 0);
    expect(trianglesHaveForbiddenIntersection(BASE, adjacent)).toBe(false);
    expect(trianglesHaveForbiddenIntersection(BASE, overlapping)).toBe(true);
  });

  it('rejects duplicate faces and coplanar T-junction contact', () => {
    const tJunction = triangle(1, 0, 0, 2, -1, 0, 0, -1, 0);
    expect(trianglesHaveForbiddenIntersection(BASE, BASE.slice())).toBe(true);
    expect(trianglesHaveForbiddenIntersection(BASE, tJunction)).toBe(true);
  });
});
