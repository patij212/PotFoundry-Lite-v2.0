// regionMetric.test.ts — FAST src smoke for the ported M=g/h² region kernel (buildMetricOuterWall).
//
// Verifies the PORT is live in src: on a small gently-rippled radial surface the kernel BUILDS a non-empty
// ConformingOuterWallResult and is WATERTIGHT-BY-CONSTRUCTION (zero index-space non-manifold edges — the domain the
// MANDATORY guardManifoldAlways guard closes; the default flip path leaves 228–257 on sharp styles). Also pins the
// D-1 reachability contract (throws flag-off) so the kernel is structurally unreachable in production.
//
// This is the fast/small acceptance gate. The HEAVY DS+GeoStar sliver reproduction (%<20° ~3.1% / ~0.6%) lives in
// the env-gated research probe research/bridge/_msurf_regionKernel.test.ts (PF_MSURFIH_REGION=1) — see that file.
import { describe, it, expect } from 'vitest';
import { buildMetricOuterWall } from './regionMetric';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

type FlagGlobal = { __pfRegionLayer?: boolean };
const TAU = 2 * Math.PI;
const H = 40;

// A small, gently-curved radial surface: enough curvature to drive a few refinement rounds + flips, tiny enough to
// build in milliseconds. Smooth (no discontinuities) so the metric field is well-defined everywhere.
const rippleRA: AnalyticRadiusFn = (theta, z) => 30 + 3 * Math.sin(3 * theta) + 2 * Math.sin((z / H) * TAU * 2);

/** Count index-space non-manifold edges (undirected edges incident to > 2 triangles) — the guard's domain. */
function nonManifoldEdgeCount(indices: ArrayLike<number>): number {
  const count = new Map<number, number>();
  const nTri = indices.length / 3;
  const key = (a: number, b: number): number => (a < b ? a * 100_000_000 + b : b * 100_000_000 + a);
  for (let f = 0; f < nTri; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = key(u, v);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  let nonMan = 0;
  for (const n of count.values()) if (n > 2) nonMan++;
  return nonMan;
}

describe('buildMetricOuterWall — region M=g/h² kernel (src smoke)', () => {
  it('is reachable ONLY under the D-1 flag (throws flag-off)', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    delete g.__pfRegionLayer;
    try {
      expect(() => buildMetricOuterWall(rippleRA, { H }, { tolMm: 0.5, hMin: 0.5, hMax: 8 })).toThrow(/region layer/i);
    } finally {
      g.__pfRegionLayer = prior;
    }
  });

  it('builds a non-empty, watertight-by-construction ConformingOuterWallResult (nonMan 0)', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      const wall = buildMetricOuterWall(rippleRA, { H }, {
        tolMm: 0.5, hMin: 0.5, hMax: 8, sizeRes: 32, seedN: 6, maxPoints: 40_000, optimizeSweeps: 2,
      });

      // Non-empty, well-shaped result.
      const nV = wall.gridVertexCount;
      expect(nV).toBeGreaterThan(10);
      expect(wall.vertices.length).toBe(nV * 3);
      expect(wall.indices.length).toBeGreaterThan(0);
      expect(wall.indices.length % 3).toBe(0);
      expect(wall.seamTriangles.length).toBe(wall.indices.length / 3);

      // Every (u,t) vertex in-range and lifts to a finite 3D position; z=0 packed in slot 3.
      for (let i = 0; i < nV; i++) {
        const u = wall.vertices[3 * i], t = wall.vertices[3 * i + 1];
        expect(wall.vertices[3 * i + 2]).toBe(0);
        expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1);
        expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1);
        const r = rippleRA(u * TAU, t * H);
        expect(Number.isFinite(r * Math.cos(u * TAU))).toBe(true);
      }

      // Indices reference valid vertices.
      for (let k = 0; k < wall.indices.length; k++) {
        expect(wall.indices[k]).toBeLessThan(nV);
      }

      // WATERTIGHT-BY-CONSTRUCTION: the mandatory guard leaves zero index-space non-manifold edges.
      expect(nonManifoldEdgeCount(wall.indices)).toBe(0);

      // Boundary rings present + strictly ordered by u (bottom = t≈0, top = t≈1), for downstream seam/ring assembly.
      expect(wall.bottomRing.length).toBeGreaterThanOrEqual(2);
      expect(wall.topRing.length).toBeGreaterThanOrEqual(2);
      for (const ring of [wall.bottomRing, wall.topRing]) {
        for (let i = 1; i < ring.length; i++) {
          expect(wall.vertices[3 * ring[i]]).toBeGreaterThanOrEqual(wall.vertices[3 * ring[i - 1]]);
        }
      }
    } finally {
      g.__pfRegionLayer = prior;
    }
  });
});
