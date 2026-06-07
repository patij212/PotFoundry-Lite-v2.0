import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';

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
