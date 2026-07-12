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

// one outer triangle straddling the periodic u-seam: ua=0.95, ub=0.05, uc=0.0 — a
// narrow physical arc near angle 0 that a naive linear u-blend would instead
// interpolate across the WIDE side of the pot (through u~1/3, the opposite side).
function seamTri(lift: (u: number, t: number) => [number, number, number]) {
  const uv = [[0.95, 0], [0.05, 0], [0.0, 0.3]] as const;
  const paramVerts = new Float32Array([0.95, 0, 0, 0.05, 0, 0, 0.0, 0.3, 0]);
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

  it('unwraps u across the periodic seam instead of interpolating the long way around', () => {
    // Unit cylinder: u is an angle fraction (periodic), t is height (not periodic).
    const lift = (u: number, t: number): [number, number, number] =>
      [Math.cos(2 * Math.PI * u), Math.sin(2 * Math.PI * u), t];
    const r = scoreOuterSag(seamTri(lift), lift, 0.01);
    // These 3 points sit on a narrow arc spanning angle -18deg..+18deg — true chord
    // sag is tiny. A naive linear u-blend instead interpolates toward u~1/3 (120deg,
    // the opposite side of the unit-radius pot), producing sag on the order of the
    // pot's diameter (~2.0), which this asserts against.
    expect(r.maxSagMm).toBeLessThan(0.1);
  });
});
