import { describe, it, expect } from 'vitest';
import { scoreOuterSag } from './sagScorer';

// one outer triangle, params (0,0),(1,0),(0,1); vertex 3D positions filled by lift.
function oneTri(lift: (u: number, t: number) => [number, number, number]) {
  const uv = [[0, 0], [1, 0], [0, 1]] as const;
  const paramVerts = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const pos3D = new Float32Array(9);
  uv.forEach(([u, t], i) => { const p = lift(u, t); pos3D[i*3]=p[0]; pos3D[i*3+1]=p[1]; pos3D[i*3+2]=p[2]; });
  return { paramVerts, pos3D, indices: new Uint32Array([0, 1, 2]), outerIndexStart: 0, outerIndexEnd: 3 };
}

describe('scoreOuterSag', () => {
  it('reports ~0 sag for a planar lift', () => {
    const lift = (u: number, t: number): [number, number, number] => [u, t, 0];
    const r = scoreOuterSag(oneTri(lift), lift, 0.01);
    expect(r.maxSagMm).toBeLessThan(1e-9);
    expect(r.overTolCount).toBe(0);
  });

  it('matches the analytic parabola sag 0.25/sqrt(2)', () => {
    const lift = (u: number, t: number): [number, number, number] => [u, t, u * u];
    const r = scoreOuterSag(oneTri(lift), lift, 0.01);
    expect(r.maxSagMm).toBeCloseTo(0.25 / Math.SQRT2, 4);
    expect(r.overTolCount).toBe(1);
    expect(r.worst?.u).toBeCloseTo(0.5, 6);
  });
});
