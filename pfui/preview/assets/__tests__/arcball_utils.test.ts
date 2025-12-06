import { describe, it, expect } from 'vitest';
import { projectAxisToTangent } from '../arcball_utils';

describe('projectAxisToTangent', () => {
  it('projects axis onto tangent plane (dot nearly zero)', () => {
    const axisWorld = [1, 1, 0] as [number, number, number];
    const normal = [1, 0, 0] as [number, number, number];
    const proj = projectAxisToTangent(axisWorld, normal);
    // dot(proj, normal) ≈ 0
    const dot = proj[0] * normal[0] + proj[1] * normal[1] + proj[2] * normal[2];
    expect(Math.abs(dot)).toBeLessThan(1e-6);
    // Also ensure projection is normalized
    const len = Math.hypot(proj[0], proj[1], proj[2]);
    expect(Math.abs(len - 1)).toBeLessThan(1e-6);
  });

  it('returns original axis if normal is null', () => {
    const axisWorld = [0.3, 0.4, 0.5] as [number, number, number];
    const proj = projectAxisToTangent(axisWorld, null);
    expect(proj).toEqual(axisWorld);
  });
});
