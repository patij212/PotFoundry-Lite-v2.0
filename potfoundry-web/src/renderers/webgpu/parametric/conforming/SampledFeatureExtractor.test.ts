import { describe, it, expect } from 'vitest';
import { marchingSquaresZero, segmentsToPolylines } from './SampledFeatureExtractor';

describe('marchingSquaresZero', () => {
  it('traces a circle zero-set with crossings on the circle', () => {
    const cu = 0.5;
    const cv = 0.5;
    const r = 0.25;
    const field = (u: number, t: number): number => (u - cu) ** 2 + (t - cv) ** 2 - r * r;
    const segs = marchingSquaresZero(field, 128, 128);
    expect(segs.length).toBeGreaterThan(40);
    // Every contour vertex lies on the circle (within one cell).
    for (const s of segs) {
      for (const p of [s.a, s.b]) {
        const d = Math.hypot(p.u - cu, p.t - cv);
        expect(Math.abs(d - r)).toBeLessThan(0.02);
      }
    }
  });

  it('finds nothing when the field has no zero crossing', () => {
    const segs = marchingSquaresZero(() => 1, 32, 32);
    expect(segs.length).toBe(0);
  });

  it('traces a seam-crossing vertical band as periodic contours', () => {
    // Two vertical zero lines at u≈0.2 and u≈0.7: field = (u-0.2)(u-0.7) over t.
    const field = (u: number): number => (u - 0.2) * (u - 0.7);
    const segs = marchingSquaresZero(field, 64, 16);
    // Crossings cluster at u≈0.2 and u≈0.7.
    const us = segs.flatMap((s) => [s.a.u, s.b.u]);
    expect(us.some((u) => Math.abs(u - 0.2) < 0.02)).toBe(true);
    expect(us.some((u) => Math.abs(u - 0.7) < 0.02)).toBe(true);
  });
});

describe('segmentsToPolylines', () => {
  it('welds a circle contour into one closed loop', () => {
    const cu = 0.5;
    const cv = 0.5;
    const r = 0.25;
    const field = (u: number, t: number): number => (u - cu) ** 2 + (t - cv) ** 2 - r * r;
    const segs = marchingSquaresZero(field, 96, 96);
    const lines = segmentsToPolylines(segs, 'circle');
    // One dominant closed loop.
    const big = lines.filter((l) => l.points.length > 20);
    expect(big.length).toBeGreaterThanOrEqual(1);
    const loop = big.sort((a, b) => b.points.length - a.points.length)[0];
    // Closed: first ≈ last.
    const f = loop.points[0];
    const e = loop.points[loop.points.length - 1];
    expect(Math.hypot(f.u - e.u, f.t - e.t)).toBeLessThan(0.05);
    // All points on the circle.
    for (const p of loop.points) {
      expect(Math.abs(Math.hypot(p.u - cu, p.t - cv) - r)).toBeLessThan(0.02);
    }
    expect(loop.kind).toBe('general-curve');
  });
});
