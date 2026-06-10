import { describe, it, expect } from 'vitest';
import { triangleQualityDistribution } from './metrics';

// An equilateral triangle (min interior angle = 60°).
const EQ = (ox: number): number[] => [ox + 0, 0, 0, ox + 1, 0, 0, ox + 0.5, 0.8660254, 0];
// A near-degenerate thin triangle (base 10, height 0.2 → min angle ≈ 2.3°).
const THIN = (ox: number): number[] => [ox + 0, 0, 0, ox + 10, 0, 0, ox + 5, 0.2, 0];

function meshOf(triCoords: number[][]): { vertices: Float32Array; indices: Uint32Array } {
  const verts: number[] = [];
  const idx: number[] = [];
  for (const tri of triCoords) {
    const base = verts.length / 3;
    verts.push(...tri);
    idx.push(base, base + 1, base + 2);
  }
  return { vertices: new Float32Array(verts), indices: new Uint32Array(idx) };
}

describe('triangleQualityDistribution', () => {
  it('rates an equilateral triangle as ~60° with nothing below the bar', () => {
    const d = triangleQualityDistribution(meshOf([EQ(0)]));
    expect(d.triangleCount).toBe(1);
    expect(d.degenerateCount).toBe(0);
    expect(d.minAngleDeg).toBeGreaterThan(59);
    expect(d.medianMinAngleDeg).toBeGreaterThanOrEqual(59);
    expect(d.pctBelow20).toBe(0);
    expect(d.pctBelow30).toBe(0);
  });

  it('flags a thin triangle as below every quality bar', () => {
    const d = triangleQualityDistribution(meshOf([THIN(0)]));
    expect(d.triangleCount).toBe(1);
    expect(d.minAngleDeg).toBeLessThan(5);
    expect(d.pctBelow10).toBe(100);
    expect(d.pctBelow20).toBe(100);
  });

  it('computes the below-bar percentage across a mixed mesh (1 thin of 5)', () => {
    const d = triangleQualityDistribution(meshOf([EQ(0), EQ(3), EQ(6), EQ(9), THIN(20)]));
    expect(d.triangleCount).toBe(5);
    expect(d.pctBelow20).toBeCloseTo(20, 5);
    expect(d.pctBelow10).toBeCloseTo(20, 5);
    // median is the 50th-percentile triangle → one of the equilaterals.
    expect(d.medianMinAngleDeg).toBeGreaterThanOrEqual(59);
  });

  it('excludes degenerate (zero-area) triangles from the angle stats without NaN', () => {
    const collinear = [0, 0, 0, 1, 0, 0, 2, 0, 0];
    const d = triangleQualityDistribution(meshOf([collinear, EQ(10)]));
    expect(d.degenerateCount).toBe(1);
    expect(d.triangleCount).toBe(1);
    expect(Number.isFinite(d.minAngleDeg)).toBe(true);
    expect(Number.isFinite(d.medianMinAngleDeg)).toBe(true);
    expect(d.minAngleDeg).toBeGreaterThan(59);
  });

  it('returns all-zero (no NaN) for an empty mesh', () => {
    const d = triangleQualityDistribution({ vertices: new Float32Array(), indices: new Uint32Array() });
    expect(d.triangleCount).toBe(0);
    expect(d.pctBelow20).toBe(0);
    expect(d.minAngleDeg).toBe(0);
  });
});
