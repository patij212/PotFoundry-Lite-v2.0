import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler, GpuSurfaceSampler } from './SurfaceSampler';

describe('SyntheticCylinderSampler', () => {
  it('maps (u,t) onto a cylinder of radius R0 when amp=0', () => {
    const s = new SyntheticCylinderSampler(50, 120);
    const [x, y, z] = s.position(0, 0.5);
    expect(Math.hypot(x, y)).toBeCloseTo(50, 6);
    expect(z).toBeCloseTo(60, 6);
  });
  it('wraps u periodically (u=0 and u=1 coincide)', () => {
    const s = new SyntheticCylinderSampler(50, 120, 5, 7);
    const a = s.position(0, 0.3);
    const b = s.position(1, 0.3);
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
  });
});

describe('GpuSurfaceSampler', () => {
  // 2x2 grid. Row-major [tRow*resU + uCol]*3 = (x,y,z).
  // Columns: u = col/resU → col0=u0, col1=u0.5.  Rows: t = row/(resT-1) → row0=t0, row1=t1.
  //   node(col0,row0) = (0,0,0)     node(col1,row0) = (10,0,0)
  //   node(col0,row1) = (0,0,100)   node(col1,row1) = (10,0,100)
  const resU = 2;
  const resT = 2;
  const positions = new Float32Array([
    // row0 (t=0): col0, col1
    0, 0, 0, 10, 0, 0,
    // row1 (t=1): col0, col1
    0, 0, 100, 10, 0, 100,
  ]);
  const s = new GpuSurfaceSampler(positions, resU, resT);

  it('returns exact node values at grid nodes', () => {
    expect(Array.from(s.position(0, 0))).toEqual([0, 0, 0]);
    expect(Array.from(s.position(0.5, 0))).toEqual([10, 0, 0]);
    expect(Array.from(s.position(0, 1))).toEqual([0, 0, 100]);
    expect(Array.from(s.position(0.5, 1))).toEqual([10, 0, 100]);
  });

  it('bilinearly interpolates the midpoint between two u-nodes', () => {
    const [x, y, z] = s.position(0.25, 0); // halfway between col0(u0) and col1(u0.5)
    expect(x).toBeCloseTo(5, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it('bilinearly interpolates the midpoint between two t-nodes', () => {
    const [x, y, z] = s.position(0, 0.5); // halfway between row0(t0) and row1(t1)
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(50, 6);
  });

  it('bilinearly interpolates the center node', () => {
    const [x, y, z] = s.position(0.25, 0.5); // center of the cell
    expect(x).toBeCloseTo(5, 6);
    expect(y).toBeCloseTo(0, 6);
    expect(z).toBeCloseTo(50, 6);
  });

  it('wraps u periodically (u=1 coincides with u=0)', () => {
    const a = s.position(0, 0.3);
    const b = s.position(1, 0.3);
    expect(b[0]).toBeCloseTo(a[0], 6);
    expect(b[1]).toBeCloseTo(a[1], 6);
    expect(b[2]).toBeCloseTo(a[2], 6);
  });

  it('interpolates across the u-seam (col resU wraps to col 0)', () => {
    // u=0.75 lies between col1 (u=0.5, value 10) and wrapped col0 (u=1.0 → value 0).
    const [x] = s.position(0.75, 0);
    expect(x).toBeCloseTo(5, 6);
  });

  it('clamps t to [0,1]', () => {
    expect(Array.from(s.position(0, -0.5))).toEqual([0, 0, 0]); // clamp to t=0 node
    expect(Array.from(s.position(0, 2))).toEqual([0, 0, 100]); // clamp to t=1 node
  });
});
