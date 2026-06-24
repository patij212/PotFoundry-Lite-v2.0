/**
 * stations.test.ts — TDD tests for metric-sized cross-band station grid.
 *
 * Tests a synthetic straight diagonal ribbon on a plain cylinder (amp=0).
 * The cylinder has R0=50mm, H=100mm so parameter→3D is clean:
 *   u-direction arc length: 2π·R0 = ~314mm per full turn
 *   t-direction arc length: H = 100mm
 *
 * Two parallel rails are created as vertical strips at constant u offsets,
 * spanning t ∈ [0.2, 0.8].  With amp=0 the surface is perfectly cylindrical,
 * giving an analytic ground truth for 3D arclength.
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildStations } from './stations';

/** Rail point type — matches FeatureLinePoint */
interface P {
  u: number;
  t: number;
}

/** Cylinder parameters for tests */
const R0 = 50;  // mm
const H = 100;  // mm

/**
 * Build a vertical rail at constant u = uVal, t from tStart to tEnd in nPts steps.
 */
function verticalRail(uVal: number, tStart: number, tEnd: number, nPts: number): P[] {
  const pts: P[] = [];
  for (let i = 0; i < nPts; i++) {
    const t = tStart + (tEnd - tStart) * (i / (nPts - 1));
    pts.push({ u: uVal, t });
  }
  return pts;
}

/**
 * 3D Euclidean distance.
 */
function dist3(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

describe('buildStations', () => {
  const sampler = new SyntheticCylinderSampler(R0, H);

  // Two parallel vertical rails at u=0.1 and u=0.2, t ∈ [0.2, 0.8]
  // Arc separation across-w (at fixed t): Δu * 2π * R0 = 0.1 * 314.16 ≈ 31.4mm
  const uFoot = 0.1;
  const uCrest = 0.2;
  const tStart = 0.2;
  const tEnd = 0.8;
  // 40 points → vertex spacing ≈ 60/39 ≈ 1.54mm, well below targetEdgeMm/2 = 2.5mm,
  // so nearest-vertex snap stays within ±25% of targetEdgeMm.
  const nRailPts = 40;

  const foot = verticalRail(uFoot, tStart, tEnd, nRailPts);
  const crest = verticalRail(uCrest, tStart, tEnd, nRailPts);

  it('returns rows with correct structure', () => {
    const { rows } = buildStations(foot, crest, sampler, 5.0);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.s).toBeGreaterThanOrEqual(0);
      expect(row.footPt).toBeDefined();
      expect(row.crestPt).toBeDefined();
      expect(row.w).toBeDefined();
      expect(Array.isArray(row.w)).toBe(true);
      // w array must contain at least foot and crest points
      expect(row.w.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('anchor preservation: each row footPt equals an input foot rail vertex (exact)', () => {
    const { rows } = buildStations(foot, crest, sampler, 5.0);
    for (const row of rows) {
      // The footPt must be exactly one of the input foot rail vertices
      const matched = foot.some((fp) => fp.u === row.footPt.u && fp.t === row.footPt.t);
      expect(matched).toBe(true);
    }
  });

  it('anchor preservation: each row crestPt equals an input crest rail vertex (exact)', () => {
    const { rows } = buildStations(foot, crest, sampler, 5.0);
    for (const row of rows) {
      // The crestPt must be exactly one of the input crest rail vertices
      const matched = crest.some((cp) => cp.u === row.crestPt.u && cp.t === row.crestPt.t);
      expect(matched).toBe(true);
    }
  });

  it('along-s spacing: adjacent rows are within ±25% of targetEdgeMm in 3D', () => {
    const targetEdgeMm = 5.0;
    const { rows } = buildStations(foot, crest, sampler, targetEdgeMm);
    // Need at least 2 rows to check spacing
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const tol = 0.25; // ±25%
    const lo = targetEdgeMm * (1 - tol);
    const hi = targetEdgeMm * (1 + tol);

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const curr = rows[i];
      // Measure 3D distance between foot endpoints of adjacent rows
      const p0 = sampler.position(prev.footPt.u, prev.footPt.t);
      const p1 = sampler.position(curr.footPt.u, curr.footPt.t);
      const d = dist3(p0, p1);
      expect(d).toBeGreaterThanOrEqual(lo);
      expect(d).toBeLessThanOrEqual(hi);
    }
  });

  it('across-w spacing: interior points in each row are within ±25% of targetEdgeMm in 3D', () => {
    const targetEdgeMm = 5.0;
    const { rows } = buildStations(foot, crest, sampler, targetEdgeMm);

    const tol = 0.25; // ±25%
    const lo = targetEdgeMm * (1 - tol);
    const hi = targetEdgeMm * (1 + tol);

    for (const row of rows) {
      const pts = row.w;
      // Skip rows with only foot+crest (no interior), but most should have interior
      if (pts.length < 3) continue;
      for (let j = 1; j < pts.length; j++) {
        const p0 = sampler.position(pts[j - 1].u, pts[j - 1].t);
        const p1 = sampler.position(pts[j].u, pts[j].t);
        const d = dist3(p0, p1);
        expect(d).toBeGreaterThanOrEqual(lo);
        expect(d).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('row.w first point matches footPt and last matches crestPt', () => {
    const { rows } = buildStations(foot, crest, sampler, 5.0);
    for (const row of rows) {
      const first = row.w[0];
      const last = row.w[row.w.length - 1];
      expect(first.u).toBe(row.footPt.u);
      expect(first.t).toBe(row.footPt.t);
      expect(last.u).toBe(row.crestPt.u);
      expect(last.t).toBe(row.crestPt.t);
    }
  });

  it('density-invariant: spacing ratios are similar at two targetEdgeMm values', () => {
    // Test with two different target sizes: 5mm and 10mm.
    // Both should produce rows whose along-s spacing is within ±25% of their respective target.
    for (const targetEdgeMm of [5.0, 10.0]) {
      const { rows } = buildStations(foot, crest, sampler, targetEdgeMm);
      expect(rows.length).toBeGreaterThanOrEqual(2);

      const tol = 0.25;
      const lo = targetEdgeMm * (1 - tol);
      const hi = targetEdgeMm * (1 + tol);

      for (let i = 1; i < rows.length; i++) {
        const p0 = sampler.position(rows[i - 1].footPt.u, rows[i - 1].footPt.t);
        const p1 = sampler.position(rows[i].footPt.u, rows[i].footPt.t);
        const d = dist3(p0, p1);
        expect(d).toBeGreaterThanOrEqual(lo);
        expect(d).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('endpoint anchors: first row footPt/crestPt are rail[0], last row are rail[last] (reference equality)', () => {
    const { rows } = buildStations(foot, crest, sampler, 5.0);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // First row must reference exactly the first rail vertex objects.
    expect(rows[0].footPt).toBe(foot[0]);
    expect(rows[0].crestPt).toBe(crest[0]);
    // Last row must reference exactly the last rail vertex objects.
    expect(rows[rows.length - 1].footPt).toBe(foot[foot.length - 1]);
    expect(rows[rows.length - 1].crestPt).toBe(crest[crest.length - 1]);
  });

  it('sparse rail (spacing > targetEdgeMm/2) throws with a clear precondition message', () => {
    // One long straight segment: two points only, 3D spacing = 60mm on foot rail (H=100, Δt=0.6).
    // targetEdgeMm = 5mm → halfTarget = 2.5mm; 60mm >> 2.5mm → must throw.
    const sparseFoot = verticalRail(uFoot, tStart, tEnd, 2);   // 2 pts → 1 segment ≈ 60mm
    const sparseCrest = verticalRail(uCrest, tStart, tEnd, 2);
    expect(() => buildStations(sparseFoot, sparseCrest, sampler, 5.0)).toThrow(
      /bandRemesh\.buildStations:.*rail vertex spacing.*exceeds.*targetEdgeMm\/2.*densify/,
    );
  });

  it('dense enough rail (spacing ≤ targetEdgeMm/2) does not throw', () => {
    // 40 points over 60mm → spacing ≈ 1.54mm < 5.0/2 = 2.5mm → no throw.
    expect(() => buildStations(foot, crest, sampler, 5.0)).not.toThrow();
  });
});
