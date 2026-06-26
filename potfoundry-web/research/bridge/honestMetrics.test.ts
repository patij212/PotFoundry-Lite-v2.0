import { describe, it, expect } from 'vitest';
import { honestGate } from './honestMetrics';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

function grid(n: number): { ut2: number[]; tris: number[] } {
  const ut2: number[] = [], tris: number[] = [], nv = n + 1;
  for (let it = 0; it <= n; it++) for (let iu = 0; iu <= n; iu++) ut2.push(iu / n, it / n);
  for (let it = 0; it < n; it++) for (let iu = 0; iu < n; iu++) {
    const a = it * nv + iu, b = a + 1, c = a + nv, d = c + 1;
    tris.push(a, b, d, a, d, c);
  }
  return { ut2, tris };
}

describe('honestGate', () => {
  const fluted: AnalyticRadiusFn = (theta) => 50 + 3 * Math.cos(8 * theta); // relief in θ

  it('RMS fidelity responds to tessellation density (coarse > fine) — the under-tessellation signal p99 can miss', () => {
    const coarse = grid(8), fine = grid(48);
    const c = honestGate(coarse.ut2, coarse.tris, fluted, 120, { denseN: 6 });
    const f = honestGate(fine.ut2, fine.tris, fluted, 120, { denseN: 6 });
    expect(f.rmsFidelityMm).toBeLessThan(c.rmsFidelityMm); // denser mesh → lower mean chord (captures the relief)
    expect(f.rmsFidelityMm).toBeGreaterThan(0);
    expect(f.triCount).toBe(48 * 48 * 2);
  });

  it('reports minAngle (the depth-invariant sliver signal) + RMS, both finite', () => {
    const g = grid(16);
    const h = honestGate(g.ut2, g.tris, fluted, 120, { denseN: 6 });
    expect(Number.isFinite(h.minAngleDeg)).toBe(true);
    expect(h.minAngleDeg).toBeGreaterThan(0);
    expect(Number.isFinite(h.rmsFidelityMm)).toBe(true);
    expect(Number.isFinite(h.p99Mm)).toBe(true);
  });
});
