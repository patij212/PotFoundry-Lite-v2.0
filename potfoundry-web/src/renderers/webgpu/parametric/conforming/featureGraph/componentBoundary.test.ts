/**
 * componentBoundary.test.ts — TDD tests for detectComponentBoundary.
 *
 * Two synthetic cases:
 *
 * 1. KIND='zero': f(u,t) = sin(2πu). Zero-crossings at u=0 (=1, periodic) and
 *    u=0.5. With periodicU=true and resU=128, resT=64, the marching-squares
 *    zero-contour should produce segments straddling both u=0.5 and u=1.0 (the
 *    periodic seam). Segment count must be > 0, and all segment endpoints must
 *    satisfy |f(u,t)| < 0.1 (close to the zero-contour, since marching-squares
 *    places crossings by linear interpolation on the exact grid edges).
 *
 * 2. KIND='label': checkerboard label(u,t) = floor(u*4) + floor(t*4), each cell
 *    a different integer. Boundaries between adjacent cells must produce > 0
 *    segments. The returned type must be 'component-boundary'.
 */

import { describe, it, expect } from 'vitest';
import { detectComponentBoundary } from './componentBoundary';

// ---------------------------------------------------------------------------
// Synthetic field helpers
// ---------------------------------------------------------------------------

/** f(u,t) = sin(2π·u) — zero-crossings at u=0 (=1) and u=0.5. */
const sinField = (u: number, _t: number): number => Math.sin(2 * Math.PI * u);

/**
 * Checkerboard label: integer that changes at u = 0.25, 0.5, 0.75 and
 * t = 0.25, 0.5, 0.75 — so every adjacent pair of cells has distinct labels.
 */
const checkerLabel = (u: number, t: number): number =>
  (Math.floor(u * 4) + Math.floor(t * 4)) % 2;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectComponentBoundary — kind: zero', () => {
  const res = detectComponentBoundary(sinField, {
    resU: 128,
    resT: 64,
    periodicU: true,
    kind: 'zero',
  });

  it('returns type "component-boundary"', () => {
    expect(res.type).toBe('component-boundary');
  });

  it('returns at least one segment', () => {
    expect(res.segs.length).toBeGreaterThan(0);
  });

  it('all segment endpoints lie near the zero-contour (|f|<0.1)', () => {
    for (const seg of res.segs) {
      expect(Math.abs(sinField(seg.a.u, seg.a.t))).toBeLessThan(0.1);
      expect(Math.abs(sinField(seg.b.u, seg.b.t))).toBeLessThan(0.1);
    }
  });

  it('strength(seg) is finite and >= 0', () => {
    for (const seg of res.segs) {
      const s = res.strength(seg);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('segments span both zero-contour arms (u≈0.5 and u≈0 or u≈1)', () => {
    // With periodicU, the contour at u=0(=1) is also traced. We expect segments
    // with u close to 0.5 AND segments with u close to 0 or 1.
    const nearHalf = res.segs.some(
      (s) =>
        (Math.abs(s.a.u - 0.5) < 0.05 || Math.abs(s.b.u - 0.5) < 0.05),
    );
    const nearSeam = res.segs.some(
      (s) =>
        s.a.u < 0.05 || s.b.u < 0.05 || s.a.u > 0.95 || s.b.u > 0.95,
    );
    expect(nearHalf).toBe(true);
    expect(nearSeam).toBe(true);
  });
});

describe('detectComponentBoundary — kind: label', () => {
  const res = detectComponentBoundary(checkerLabel, {
    resU: 64,
    resT: 64,
    periodicU: false,
    kind: 'label',
  });

  it('returns type "component-boundary"', () => {
    expect(res.type).toBe('component-boundary');
  });

  it('returns at least one segment', () => {
    expect(res.segs.length).toBeGreaterThan(0);
  });

  it('strength(seg) is finite and >= 0', () => {
    for (const seg of res.segs) {
      const s = res.strength(seg);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });
});
