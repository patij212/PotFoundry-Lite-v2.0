import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { buildConformingWall, type ConformingWallOptions } from './ConformingWall';

const OPTS: Omit<ConformingWallOptions, 'nRing' | 'surfaceId'> = {
  maxSagMm: 0.05,
  maxEdgeMm: 60,
  minEdgeMm: 0.5,
  gradeRatio: 2,
  maxLevel: 8,
  resU: 65,
  resT: 17,
};

interface Tri {
  a: number;
  b: number;
  c: number;
}

function tris(indices: Uint32Array): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    out.push({ a: indices[i], b: indices[i + 1], c: indices[i + 2] });
  }
  return out;
}

function eval3D(s: SyntheticCylinderSampler, verts: Float32Array): Float64Array {
  const n = verts.length / 3;
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = s.position(verts[i * 3], verts[i * 3 + 1]);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  }
  return out;
}

function edgeUse(triangles: Tri[]): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (i: number, j: number): void => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const t of triangles) {
    bump(t.a, t.b);
    bump(t.b, t.c);
    bump(t.c, t.a);
  }
  return m;
}

function sub3(a: number[], b: number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a: number[], b: number[]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function len3(a: number[]): number {
  return Math.hypot(a[0], a[1], a[2]);
}
function vget(p: Float64Array, i: number): [number, number, number] {
  return [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
}

describe('buildConformingWall — uniform shared rings (nRing=64, surfaceId=1)', () => {
  const NRING = 64;
  const s = new SyntheticCylinderSampler(50, 120, 3, 8);
  const wall = buildConformingWall(s, { ...OPTS, nRing: NRING, surfaceId: 1 });
  const triangles = tris(wall.indices);
  const p3 = eval3D(s, wall.vertices);

  it('top and bottom rings have exactly nRing vertices', () => {
    expect(wall.bottomRing.length).toBe(NRING);
    expect(wall.topRing.length).toBe(NRING);
  });

  it('ring U is uniform: U=i/nRing, evenly spaced', () => {
    const bottomU = wall.bottomRing.map((v) => wall.vertices[v * 3]).sort((a, b) => a - b);
    const topU = wall.topRing.map((v) => wall.vertices[v * 3]).sort((a, b) => a - b);
    for (let i = 0; i < NRING; i++) {
      expect(Math.abs(bottomU[i] - i / NRING)).toBeLessThan(1e-6);
      expect(Math.abs(topU[i] - i / NRING)).toBeLessThan(1e-6);
    }
  });

  it('ring vertices carry t=0 / t=1 and the requested surfaceId', () => {
    for (const v of wall.bottomRing) {
      expect(wall.vertices[v * 3 + 1]).toBeLessThan(1e-6); // t=0
      expect(wall.vertices[v * 3 + 2]).toBe(1); // surfaceId
    }
    for (const v of wall.topRing) {
      expect(Math.abs(wall.vertices[v * 3 + 1] - 1)).toBeLessThan(1e-6); // t=1
      expect(wall.vertices[v * 3 + 2]).toBe(1);
    }
  });

  it('rings are ordered by increasing U (already sorted as returned)', () => {
    for (let i = 1; i < wall.bottomRing.length; i++) {
      expect(wall.vertices[wall.bottomRing[i] * 3]).toBeGreaterThan(
        wall.vertices[wall.bottomRing[i - 1] * 3],
      );
    }
    for (let i = 1; i < wall.topRing.length; i++) {
      expect(wall.vertices[wall.topRing[i] * 3]).toBeGreaterThan(
        wall.vertices[wall.topRing[i - 1] * 3],
      );
    }
  });

  it('watertight wall: boundary edges only at the two rings; seam closed', () => {
    const eu = edgeUse(triangles);
    const bottomSet = new Set(wall.bottomRing);
    const topSet = new Set(wall.topRing);
    for (const [k, count] of eu) {
      expect(count).toBeLessThanOrEqual(2);
      if (count === 1) {
        const [i, j] = k.split('_').map(Number);
        const bothBottom = bottomSet.has(i) && bottomSet.has(j);
        const bothTop = topSet.has(i) && topSet.has(j);
        expect(bothBottom || bothTop).toBe(true);
      }
    }
  });

  it('3D quality: max aspect < 100', () => {
    let maxAspect = 0;
    for (const t of triangles) {
      const A = vget(p3, t.a);
      const B = vget(p3, t.b);
      const C = vget(p3, t.c);
      const ab = len3(sub3(B, A));
      const bc = len3(sub3(C, B));
      const ca = len3(sub3(A, C));
      const longest = Math.max(ab, bc, ca);
      const area = 0.5 * len3(cross3(sub3(B, A), sub3(C, A)));
      if (area < 1e-12) {
        maxAspect = Infinity;
        break;
      }
      maxAspect = Math.max(maxAspect, (longest * longest) / (2 * area));
    }
    expect(maxAspect).toBeLessThan(100);
  });
});
