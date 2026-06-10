import { describe, it, expect } from 'vitest';
import {
  triangulateConstrainedCell,
  type CellPoint,
  type ConstrainedCellInput,
  type ConstrainedCellResult,
} from './ConstrainedCellTriangulator';
import { refineCellInterior, ON_EDGE_EPS } from './CellQualityRefinement';

/** Signed area of triangle p,q,r in (u,t); positive ⇒ CCW. */
function signedArea(p: CellPoint, q: CellPoint, r: CellPoint): number {
  return 0.5 * ((q.u - p.u) * (r.t - p.t) - (r.u - p.u) * (q.t - p.t));
}

/**
 * An anisotropic 3D map: u is stretched ANISO_SX× relative to t (z flat). A
 * triangle that is well-shaped in (u,t) becomes a needle in 3D, so the seed
 * constrained CDT (which inserts NO interior Steiner points) produces sub-20°
 * triangles in the surface metric — the exact failure Tier 2 must fix. The
 * map is affine, so the 3D circumcenter back-maps to (u,t) exactly.
 */
const ANISO_SX = 2;
function anisoSampler(u: number, t: number): readonly [number, number, number] {
  return [ANISO_SX * u, t, 0];
}

/** Smallest interior 3D angle of a triangle (degrees) under a sampler closure. */
function minAngle3D(
  res: ConstrainedCellResult,
  tri: [number, number, number],
  sampler: (u: number, t: number) => readonly [number, number, number],
): number {
  const [ia, ib, ic] = tri;
  const A = sampler(res.points[ia].u, res.points[ia].t);
  const B = sampler(res.points[ib].u, res.points[ib].t);
  const C = sampler(res.points[ic].u, res.points[ic].t);
  const d2 = (p: readonly number[], q: readonly number[]): number =>
    (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const a = Math.sqrt(d2(B, C));
  const b = Math.sqrt(d2(C, A));
  const c = Math.sqrt(d2(A, B));
  const ang = (adj1: number, adj2: number, opp: number): number => {
    if (adj1 <= 0 || adj2 <= 0) return 0;
    let cos = (adj1 * adj1 + adj2 * adj2 - opp * opp) / (2 * adj1 * adj2);
    if (cos > 1) cos = 1;
    if (cos < -1) cos = -1;
    return (Math.acos(cos) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}

/** 3D area of a triangle under a sampler closure (for degeneracy + aspect). */
function area3D(
  res: ConstrainedCellResult,
  tri: [number, number, number],
  sampler: (u: number, t: number) => readonly [number, number, number],
): number {
  const A = sampler(res.points[tri[0]].u, res.points[tri[0]].t);
  const B = sampler(res.points[tri[1]].u, res.points[tri[1]].t);
  const C = sampler(res.points[tri[2]].u, res.points[tri[2]].t);
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
  const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  return 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/** 3D aspect ratio (longest edge² / (2·area)) per triangle. */
function aspect3D(
  res: ConstrainedCellResult,
  tri: [number, number, number],
  sampler: (u: number, t: number) => readonly [number, number, number],
): number {
  const A = sampler(res.points[tri[0]].u, res.points[tri[0]].t);
  const B = sampler(res.points[tri[1]].u, res.points[tri[1]].t);
  const C = sampler(res.points[tri[2]].u, res.points[tri[2]].t);
  const d2 = (p: readonly number[], q: readonly number[]): number =>
    (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const longest2 = Math.max(d2(A, B), d2(B, C), d2(C, A));
  const ar = area3D(res, tri, sampler);
  if (ar <= 0) return Infinity;
  return longest2 / (2 * ar);
}

/** Build the seed cell (input + its seed CDT result) the kernel refines. */
function seedCell(input: ConstrainedCellInput): {
  input: ConstrainedCellInput;
  result: ConstrainedCellResult;
} {
  return { input, result: triangulateConstrainedCell(input) };
}

/**
 * A unit cell whose perimeter is already densified into `n` segments per side
 * (CCW), modelling a cell AFTER Tier 1a / PASS A2 have run: the boundary nodes
 * are fixed, so all remaining quality work is strictly interior. Under
 * {@link anisoSampler} the seed triangulation still slivers (the default
 * SW→NE-style diagonals are u-long needles in 3D) — interior off-center
 * insertion is what raises them to the bar without touching the perimeter.
 */
function densifiedCell(n: number): CellPoint[] {
  const b: CellPoint[] = [];
  for (let i = 0; i < n; i++) b.push({ u: i / n, t: 0 }); // south  L→R
  for (let i = 0; i < n; i++) b.push({ u: 1, t: i / n }); // east   ↑
  for (let i = n; i > 0; i--) b.push({ u: i / n, t: 1 }); // north  R→L
  for (let i = n; i > 0; i--) b.push({ u: 0, t: i / n }); // west   ↓
  return b;
}

/** The shared seed fixture: a 4-per-side densified cell, no constraint chord. */
function seedFixture(): {
  input: ConstrainedCellInput;
  result: ConstrainedCellResult;
} {
  return seedCell({ boundary: densifiedCell(4), interior: [], constraints: [] });
}

describe('refineCellInterior (Tier 2 kernel, single isolated cell)', () => {
  it('seed fixture has at least one sub-20° triangle in the 3D metric (red baseline)', () => {
    const seed = seedFixture();
    const worst = Math.min(
      ...seed.result.triangles.map((tri) => minAngle3D(seed.result, tri, anisoSampler)),
    );
    expect(worst).toBeLessThan(20);
  });

  it('raises every non-corner triangle to ≥ angleBar in the 3D metric', () => {
    const seed = seedFixture();
    const refined = refineCellInterior(seed, anisoSampler, { angleBar: 20, cap: 32 });

    const worst = Math.min(...refined.triangles.map((tri) => minAngle3D(refined, tri, anisoSampler)));
    expect(worst).toBeGreaterThanOrEqual(20);

    // It actually had to do work (the seed was below the bar) AND it inserted.
    const seedWorst = Math.min(
      ...seed.result.triangles.map((tri) => minAngle3D(seed.result, tri, anisoSampler)),
    );
    expect(seedWorst).toBeLessThan(20);
    expect(refined.points.length).toBeGreaterThan(seed.result.points.length);
  });

  it('inserts ONLY interior points — no inserted point on or near a cell side', () => {
    const seed = seedFixture();
    const refined = refineCellInterior(seed, anisoSampler, { angleBar: 20, cap: 32 });

    expect(refined.points.length).toBeGreaterThan(seed.result.points.length);
    for (let i = seed.result.points.length; i < refined.points.length; i++) {
      const p = refined.points[i];
      const onSide =
        Math.abs(p.u - 0) <= ON_EDGE_EPS ||
        Math.abs(p.u - 1) <= ON_EDGE_EPS ||
        Math.abs(p.t - 0) <= ON_EDGE_EPS ||
        Math.abs(p.t - 1) <= ON_EDGE_EPS;
      expect(onSide).toBe(false);
      // strictly inside the unit box
      expect(p.u).toBeGreaterThan(ON_EDGE_EPS);
      expect(p.u).toBeLessThan(1 - ON_EDGE_EPS);
      expect(p.t).toBeGreaterThan(ON_EDGE_EPS);
      expect(p.t).toBeLessThan(1 - ON_EDGE_EPS);
    }
  });

  it('leaves the cell perimeter (boundary vertices + edges) untouched', () => {
    const seed = seedFixture();
    const nB = seed.input.boundary.length;
    const refined = refineCellInterior(seed, anisoSampler, { angleBar: 20, cap: 32 });

    // Every boundary vertex keeps its identical (u,t) and index 0..nB-1.
    for (let i = 0; i < nB; i++) {
      expect(refined.points[i]).toEqual(seed.result.points[i]);
    }
    // Each perimeter segment is still a real mesh edge used by exactly one triangle.
    const countEdge = (a: number, b: number): number => {
      let n = 0;
      for (const tri of refined.triangles) {
        const s = new Set(tri);
        if (s.has(a) && s.has(b)) n++;
      }
      return n;
    };
    for (let i = 0; i < nB; i++) expect(countEdge(i, (i + 1) % nB)).toBe(1);
  });

  it('produces no degenerate triangles, stays CCW, and lowers aspect3D p95', () => {
    const seed = seedFixture();
    const refined = refineCellInterior(seed, anisoSampler, { angleBar: 20, cap: 32 });

    for (const tri of refined.triangles) {
      expect(area3D(refined, tri, anisoSampler)).toBeGreaterThan(1e-12);
      expect(signedArea(refined.points[tri[0]], refined.points[tri[1]], refined.points[tri[2]])).toBeGreaterThan(0);
    }

    const p95 = (res: ConstrainedCellResult): number => {
      const vals = res.triangles.map((tri) => aspect3D(res, tri, anisoSampler)).sort((a, b) => a - b);
      return vals[Math.min(vals.length - 1, Math.floor(0.95 * vals.length))];
    };
    expect(p95(refined)).toBeLessThanOrEqual(p95(seed.result));
  });

  it('preserves an interior feature constraint edge while refining (no on-edge insertion)', () => {
    // A fully-interior feature chord (bend vertices inside the cell). Refinement
    // must keep the chord as a real mesh edge and never insert on the perimeter.
    // (Residual sub-20° triangles pinned by the un-splittable chord segment are
    // the segment-encroachment case deferred to the PASS A2 densifier / sharp-
    // corner protection — Tasks 5/6 — not this isolated interior kernel.)
    const boundary = densifiedCell(4);
    const nB = boundary.length;
    const seed = seedCell({
      boundary,
      interior: [
        { u: 0.4, t: 0.45 },
        { u: 0.6, t: 0.55 },
      ],
      constraints: [[nB, nB + 1]],
    });
    const refined = refineCellInterior(seed, anisoSampler, { angleBar: 20, cap: 32 });

    // The constraint chord (between the two interior bend vertices) survives as a
    // real interior edge (shared by exactly two triangles).
    const countEdge = (a: number, b: number): number => {
      let n = 0;
      for (const tri of refined.triangles) {
        const s = new Set(tri);
        if (s.has(a) && s.has(b)) n++;
      }
      return n;
    };
    expect(countEdge(nB, nB + 1)).toBe(2);

    // No inserted point lands on a cell side.
    for (let i = seed.result.points.length; i < refined.points.length; i++) {
      const p = refined.points[i];
      const onSide =
        Math.abs(p.u) <= ON_EDGE_EPS ||
        Math.abs(p.u - 1) <= ON_EDGE_EPS ||
        Math.abs(p.t) <= ON_EDGE_EPS ||
        Math.abs(p.t - 1) <= ON_EDGE_EPS;
      expect(onSide).toBe(false);
    }
    // Quality does not regress (worst angle is no lower than the seed's).
    const seedWorst = Math.min(
      ...seed.result.triangles.map((tri) => minAngle3D(seed.result, tri, anisoSampler)),
    );
    const refWorst = Math.min(...refined.triangles.map((tri) => minAngle3D(refined, tri, anisoSampler)));
    expect(refWorst).toBeGreaterThanOrEqual(seedWorst);
  });

  it('is a no-op when the seed is already isotropic-clean (no bad triangles)', () => {
    // Plain square, identity 3D map ⇒ both triangles are 45-45-90, already ≥20°.
    const seed = seedCell({
      boundary: [
        { u: 0, t: 0 },
        { u: 1, t: 0 },
        { u: 1, t: 1 },
        { u: 0, t: 1 },
      ],
      interior: [],
      constraints: [],
    });
    const identity = (u: number, t: number): readonly [number, number, number] => [u, t, 0];
    const refined = refineCellInterior(seed, identity, { angleBar: 20, cap: 32 });
    expect(refined.points.length).toBe(seed.result.points.length);
    expect(refined.triangles.length).toBe(seed.result.triangles.length);
  });

  it('honors the per-cell insertion cap (terminates on an adversarial bar)', () => {
    const seed = seedFixture();
    // An impossibly high bar forces refinement to exhaust the cap and still
    // return a valid triangulation (best-effort) rather than hang.
    const refined = refineCellInterior(seed, anisoSampler, { angleBar: 59.9, cap: 8 });
    // At most `cap` interior points were inserted.
    expect(refined.points.length - seed.result.points.length).toBeLessThanOrEqual(8);
    // Still a valid CCW triangulation with no degenerates.
    for (const tri of refined.triangles) {
      expect(signedArea(refined.points[tri[0]], refined.points[tri[1]], refined.points[tri[2]])).toBeGreaterThan(0);
    }
  });
});
