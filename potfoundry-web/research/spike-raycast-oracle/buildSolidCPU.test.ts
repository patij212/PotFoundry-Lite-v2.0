// research/spike-raycast-oracle/buildSolidCPU.test.ts
import { describe, it, expect } from 'vitest';
import { buildSolidCPU } from './buildSolidCPU';

describe('buildSolidCPU', () => {
  it('builds a non-trivial closed solid for the smooth control', () => {
    const s = buildSolidCPU('SuperformulaBlossom', { maxSagMm: 0.1, verdictRefine: false });
    expect(s.indices.length / 3).toBeGreaterThan(1000);
    expect(s.paramVerts.length).toBe(s.pos3D.length);
    // outer range is a valid sub-range of indices
    expect(s.outerIndexStart).toBeGreaterThanOrEqual(0);
    expect(s.outerIndexEnd).toBeLessThanOrEqual(s.indices.length);
    expect(s.outerIndexEnd).toBeGreaterThan(s.outerIndexStart);
    // all 3D positions finite
    expect([...s.pos3D].every(Number.isFinite)).toBe(true);
  }, 60000);

  it('tightening maxSagMm produces more triangles', () => {
    const coarse = buildSolidCPU('GyroidManifold', { maxSagMm: 0.1, verdictRefine: false });
    const fine = buildSolidCPU('GyroidManifold', { maxSagMm: 0.01, verdictRefine: false });
    expect(fine.indices.length).toBeGreaterThan(coarse.indices.length);
  }, 120000);
});
