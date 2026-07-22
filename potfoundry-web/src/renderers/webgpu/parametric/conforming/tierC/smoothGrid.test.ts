// smoothGrid.test.ts — the smooth-style structured-grid emitter (E-2026-07-22 certifiable-production-mesh campaign).
// For C∞ smooth styles a uniform (u,t) grid at the sag-derived density closes true-3D ≤0.01mm AND is judge-certifiable
// (dyadic columns) — unlike the free-Delaunay conforming mesher. This pins the emitter invariants: watertight by
// construction, lift-exact, valid ConformingOuterWallResult packing, and a sag-based density that closes the chord.
import { describe, it, expect } from 'vitest';
import { buildSmoothGridWall, smoothGridWallToOuterWall, deriveSmoothGridDensity } from './smoothGrid';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const H = 120;
/** Synthetic C∞ smooth radius: base + angular ripple (6 petals) + a vertical bell — genuinely curved both ways. */
const smoothRA: AnalyticRadiusFn = (theta: number, z: number): number => {
  const t = z / H;
  return 55 + 3 * Math.sin(6 * theta) + 2 * Math.sin(Math.PI * t);
};

function manifoldCensus(indices: Uint32Array): { nonManifold: number; boundary: number } {
  const count = new Map<string, number>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f], b = indices[f + 1], c = indices[f + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) count.set(key(p, q), (count.get(key(p, q)) ?? 0) + 1);
  }
  let nonManifold = 0, boundary = 0;
  for (const m of count.values()) { if (m > 2) nonManifold++; else if (m === 1) boundary++; }
  return { nonManifold, boundary };
}

describe('smoothGrid — uniform structured periodic grid emitter', () => {
  it('watertight BY CONSTRUCTION (0 non-manifold, boundary = 2·nU rims) with correct counts', () => {
    const nU = 64, nT = 32;
    const wall = buildSmoothGridWall(smoothRA, H, nU, nT);
    expect(wall.vertices.length / 3).toBe(nU * nT);
    expect(wall.indices.length / 3).toBe((nT - 1) * nU * 2);
    const c = manifoldCensus(wall.indices);
    expect(c.nonManifold).toBe(0);
    expect(c.boundary).toBe(2 * nU); // u-seam welds by index ⇒ only the two t-rims are open
    expect(wall.bottomRing.length).toBe(nU);
    expect(wall.topRing.length).toBe(nU);
    expect(wall.nU).toBe(nU);
  });

  it('every triangle is CCW in (u,t) (outward) and the lift reproduces the analytic surface exactly', () => {
    const nU = 48, nT = 24;
    const wall = buildSmoothGridWall(smoothRA, H, nU, nT);
    let maxDelta = 0;
    for (let v = 0; v < wall.ut.length / 2; v++) {
      const u = wall.ut[2 * v], t = wall.ut[2 * v + 1], th = TAU * u, z = t * H, r = smoothRA(th, z);
      maxDelta = Math.max(maxDelta, Math.abs(r * Math.cos(th) - wall.vertices[3 * v]), Math.abs(r * Math.sin(th) - wall.vertices[3 * v + 1]), Math.abs(z - wall.vertices[3 * v + 2]));
    }
    expect(maxDelta).toBeLessThan(1e-4);
    // CCW in (u,t): every grid triangle positive signed area (unwrapped at the seam)
    const nF = wall.indices.length / 3;
    let nCW = 0;
    for (let f = 0; f < nF; f++) {
      const a = wall.indices[3 * f], b = wall.indices[3 * f + 1], c = wall.indices[3 * f + 2];
      const ua = wall.ut[2 * a], ta = wall.ut[2 * a + 1];
      let ub = wall.ut[2 * b]; const tb = wall.ut[2 * b + 1];
      let uc = wall.ut[2 * c]; const tc = wall.ut[2 * c + 1];
      if (ub - ua > 0.5) ub -= 1; else if (ua - ub > 0.5) ub += 1;
      if (uc - ua > 0.5) uc -= 1; else if (ua - uc > 0.5) uc += 1;
      if ((ub - ua) * (tc - ta) - (uc - ua) * (tb - ta) <= 0) nCW++;
    }
    expect(nCW).toBe(0);
  });

  it('smoothGridWallToOuterWall packs a valid (u,t,0) ConformingOuterWallResult with seam flags + rims', () => {
    const nU = 32, nT = 16;
    const wall = buildSmoothGridWall(smoothRA, H, nU, nT);
    const res = smoothGridWallToOuterWall(wall);
    expect(res.gridVertexCount).toBe(nU * nT);
    expect(manifoldCensus(res.indices).nonManifold).toBe(0);
    for (let i = 0; i < res.gridVertexCount; i++) expect(res.vertices[3 * i + 2]).toBe(0);
    expect(res.seamTriangles.some((f) => f === 1)).toBe(true);
    expect(res.bottomRing.length).toBe(nU);
    expect(res.topRing.length).toBe(nU);
  });

  it('deriveSmoothGridDensity picks a density that closes the whole-mesh chord sag ≤ tol', () => {
    const tol = 0.01;
    const { nU, nT } = deriveSmoothGridDensity(smoothRA, H, tol);
    expect(nU).toBeGreaterThanOrEqual(64);
    expect((nU & (nU - 1))).toBe(0); // power of two (exact dyadic columns for judge-cert)
    const wall = buildSmoothGridWall(smoothRA, H, nU, nT);
    // measure chord sag = distance from each facet centroid to the surface at the centroid's (u,t)
    const nF = wall.indices.length / 3;
    let maxSag = 0;
    for (let f = 0; f < nF; f++) {
      const a = wall.indices[3 * f], b = wall.indices[3 * f + 1], c = wall.indices[3 * f + 2];
      const cx = (wall.vertices[3 * a] + wall.vertices[3 * b] + wall.vertices[3 * c]) / 3;
      const cy = (wall.vertices[3 * a + 1] + wall.vertices[3 * b + 1] + wall.vertices[3 * c + 1]) / 3;
      const cz = (wall.vertices[3 * a + 2] + wall.vertices[3 * b + 2] + wall.vertices[3 * c + 2]) / 3;
      // centroid u — unwrap the corners at the seam, then mod back into [0,1)
      const ua = wall.ut[2 * a];
      let ub2 = wall.ut[2 * b]; let uc2 = wall.ut[2 * c];
      if (ub2 - ua > 0.5) ub2 -= 1; else if (ua - ub2 > 0.5) ub2 += 1;
      if (uc2 - ua > 0.5) uc2 -= 1; else if (ua - uc2 > 0.5) uc2 += 1;
      let ucen = (ua + ub2 + uc2) / 3; ucen -= Math.floor(ucen);
      const tcen = (wall.ut[2 * a + 1] + wall.ut[2 * b + 1] + wall.ut[2 * c + 1]) / 3;
      const th = TAU * ucen, z = tcen * H, r = smoothRA(th, z);
      const d = Math.hypot(r * Math.cos(th) - cx, r * Math.sin(th) - cy, z - cz);
      if (d > maxSag) maxSag = d;
    }
    expect(maxSag).toBeLessThanOrEqual(tol);
  });
});
