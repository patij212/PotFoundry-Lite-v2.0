import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import {
  buildConformingOuterWall,
  type ConformingOuterWallOptions,
} from './ConformingOuterWall';

const OPTS: ConformingOuterWallOptions = {
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

/** 3D positions of every (u,t,0) vertex via the sampler. */
function eval3D(
  s: SyntheticCylinderSampler,
  verts: Float32Array,
): Float64Array {
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

function vget(p: Float64Array, i: number): [number, number, number] {
  return [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
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
function dot3(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

describe('buildConformingOuterWall — rippled cylinder (50,120,amp=3,k=8)', () => {
  const s = new SyntheticCylinderSampler(50, 120, 3, 8);
  const result = buildConformingOuterWall(s, OPTS);
  const triangles = tris(result.indices);
  const p3 = eval3D(s, result.vertices);

  it('produces a non-trivial mesh with shared seam (vertex count > grid count)', () => {
    expect(triangles.length).toBeGreaterThan(100);
    expect(result.gridVertexCount).toBe(result.vertices.length / 3);
    expect(result.bottomRing.length).toBeGreaterThan(2);
    expect(result.topRing.length).toBeGreaterThan(2);
  });

  it('watertight cylinder: boundary edges only at t=0/t=1 rings; seam closed', () => {
    const eu = edgeUse(triangles);
    for (const [k, count] of eu) {
      // No non-manifold edges.
      expect(count).toBeLessThanOrEqual(2);
      if (count === 1) {
        const [i, j] = k.split('_').map(Number);
        const ti = result.vertices[i * 3 + 1];
        const tj = result.vertices[j * 3 + 1];
        const bothBottom = ti < 1e-6 && tj < 1e-6;
        const bothTop = ti > 1 - 1e-6 && tj > 1 - 1e-6;
        // Boundary edges occur only on the t=0 or t=1 rings — never the u-seam.
        expect(bothBottom || bothTop).toBe(true);
      }
    }
  });

  it('3D quality: max aspect < 100, min angle > 1°', () => {
    let maxAspect = 0;
    let minAngle = Infinity;
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
        minAngle = 0;
        break;
      }
      // aspect ≈ longest edge / (2*area/longest) = longest^2 / (2*area)
      const aspect = (longest * longest) / (2 * area);
      maxAspect = Math.max(maxAspect, aspect);
      // angles via law of cosines
      const angAt = (o1: number, o2: number, opp: number): number => {
        const c = Math.acos(
          Math.min(1, Math.max(-1, (o1 * o1 + o2 * o2 - opp * opp) / (2 * o1 * o2))),
        );
        return (c * 180) / Math.PI;
      };
      minAngle = Math.min(minAngle, angAt(ab, ca, bc), angAt(ab, bc, ca), angAt(bc, ca, ab));
    }
    expect(maxAspect).toBeLessThan(100);
    expect(minAngle).toBeGreaterThan(1);
  });

  it('sag: every triangle centroid within 0.12 mm of the surface', () => {
    let maxSag = 0;
    for (let ti = 0; ti < triangles.length; ti++) {
      const t = triangles[ti];
      // (u,t) centroid — seam-unwrapped so the param midpoint is meaningful.
      let ua = result.vertices[t.a * 3];
      let ub = result.vertices[t.b * 3];
      let uc = result.vertices[t.c * 3];
      if (result.seamTriangles[ti] === 1) {
        if (ua < 1e-6) ua += 1;
        if (ub < 1e-6) ub += 1;
        if (uc < 1e-6) uc += 1;
      }
      const uC = (ua + ub + uc) / 3;
      const tC =
        (result.vertices[t.a * 3 + 1] +
          result.vertices[t.b * 3 + 1] +
          result.vertices[t.c * 3 + 1]) /
        3;
      const surf = s.position(uC, tC);
      // plane of the triangle in 3D
      const A = vget(p3, t.a);
      const B = vget(p3, t.b);
      const C = vget(p3, t.c);
      const n = cross3(sub3(B, A), sub3(C, A));
      const nl = len3(n);
      if (nl < 1e-12) continue;
      const nn = [n[0] / nl, n[1] / nl, n[2] / nl];
      const sag = Math.abs(dot3(sub3([...surf], A), nn));
      maxSag = Math.max(maxSag, sag);
    }
    expect(maxSag).toBeLessThan(0.12);
  });
});
