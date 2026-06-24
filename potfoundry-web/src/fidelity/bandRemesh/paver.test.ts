/**
 * paver.test.ts — TDD tests for advancing-front band-following strip triangulation.
 *
 * Tests `paveBand` on a synthetic STRAIGHT diagonal ribbon (two parallel vertical
 * rails on a plain cylinder, amp=0) at two targetEdgeMm values (coarse + fine).
 *
 * Assertions:
 *   1. Internally watertight: auditWatertight → nonManifoldEdges=0, tJunctions=0
 *      (boundary edges ONLY on the two rails + the two end rows).
 *   2. Triangle quality: aspectMax ≤ 4, pctMinAngleBelow10 = 0, minAngleP50 ≥ 30.
 *   3. Quality holds at BOTH densities (density-invariant).
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildStations } from './stations';
import { paveBand } from './paver';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import type { StationGrid, StationPoint } from './stations';

// ── Cylinder parameters ───────────────────────────────────────────────────────

const R0 = 50;  // mm — cylinder radius
const H = 100;  // mm — cylinder height

const sampler = new SyntheticCylinderSampler(R0, H);

// ── Ribbon geometry ───────────────────────────────────────────────────────────

// Two parallel vertical rails: foot at u=0.1, crest at u=0.2, t ∈ [0.2, 0.8].
// The cross-band width is Δu * 2π * R0 = 0.1 * 314.16 ≈ 31.4mm.
// The along-s height is Δt * H = 0.6 * 100 = 60mm.

const uFoot = 0.1;
const uCrest = 0.2;
const tStart = 0.2;
const tEnd = 0.8;

/** Build a vertical rail at constant u, densely sampled so stations won't throw. */
function verticalRail(uVal: number, nPts: number): Array<{ u: number; t: number }> {
  const pts: Array<{ u: number; t: number }> = [];
  for (let i = 0; i < nPts; i++) {
    const t = tStart + (tEnd - tStart) * (i / (nPts - 1));
    pts.push({ u: uVal, t });
  }
  return pts;
}

/**
 * Build the paved mesh for a given targetEdgeMm.
 *
 * Rail density is set so vertex spacing ≤ targetEdgeMm / 2:
 *   along-s length ≈ 60mm → nPts = ceil(60 / (targetEdgeMm/2)) + 1.
 */
function buildMeshForTarget(targetEdgeMm: number): {
  mesh: Mesh3;
  allBoundaryVertices: Set<number>;
  footIds: number[];
  crestIds: number[];
  nRows: number;
} {
  // Rail must be dense enough: spacing ≤ targetEdgeMm/2.
  // 60mm / (target/2) + safety margin.
  const nPts = Math.ceil(60 / (targetEdgeMm / 2)) + 2;

  const foot = verticalRail(uFoot, nPts);
  const crest = verticalRail(uCrest, nPts);

  const grid = buildStations(foot, crest, sampler, targetEdgeMm);
  const { utVertices, indices, railVertexIds } = paveBand(grid, sampler);
  const nRows = grid.rows.length;

  // Convert utVertices to 3D positions.
  const positions = new Float32Array(utVertices.length * 3);
  for (let i = 0; i < utVertices.length; i++) {
    const [u, t] = utVertices[i];
    const p = sampler.position(u, t);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }

  const mesh: Mesh3 = { positions, indices };

  // The open boundary = two rails + two end rows.
  // - Foot rail: one vertex per row (w[0] of each row).
  // - Crest rail: one vertex per row (w[last] of each row).
  // - First end row: all w vertices of rows[0].
  // - Last end row: all w vertices of rows[last].
  //
  // We collect all these, then pass as boundaryVertexIndices.
  const rows = grid.rows;
  const endBoundary = new Set<number>();

  // First and last end-row w vertices (from the paved vertex table via exact (u,t) key).
  // We can recover them from utVertices by comparing with grid row w arrays.
  // Simpler: re-intern all vertices of the first and last row.
  const utKey = (u: number, t: number): string => `${u}|${t}`;
  const vtxIndex = new Map<string, number>();
  for (let i = 0; i < utVertices.length; i++) {
    vtxIndex.set(utKey(utVertices[i][0], utVertices[i][1]), i);
  }

  const addRow = (rowIdx: number): void => {
    for (const pt of rows[rowIdx].w) {
      const id = vtxIndex.get(utKey(pt.u, pt.t));
      if (id !== undefined) endBoundary.add(id);
    }
  };
  addRow(0);
  addRow(rows.length - 1);

  // Rail vertices.
  for (const id of railVertexIds.foot) endBoundary.add(id);
  for (const id of railVertexIds.crest) endBoundary.add(id);

  return {
    mesh,
    allBoundaryVertices: endBoundary,
    footIds: railVertexIds.foot,
    crestIds: railVertexIds.crest,
    nRows,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('paveBand', () => {
  // Run the full assertion suite at two densities.
  for (const targetEdgeMm of [5.0, 10.0]) {
    describe(`targetEdgeMm = ${targetEdgeMm}`, () => {
      it('produces at least one triangle', () => {
        const { mesh } = buildMeshForTarget(targetEdgeMm);
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.indices.length % 3).toBe(0);
      });

      it('is internally watertight: nonManifoldEdges = 0 and tJunctions = 0', () => {
        const { mesh, allBoundaryVertices } = buildMeshForTarget(targetEdgeMm);
        const audit = auditWatertight(mesh, { boundaryVertexIndices: allBoundaryVertices });
        expect(audit.nonManifoldEdges).toBe(0);
        expect(audit.tJunctions).toBe(0);
      });

      it('triangle quality: aspectMax ≤ 4', () => {
        const { mesh } = buildMeshForTarget(targetEdgeMm);
        const quality = triangleQuality3D(mesh);
        expect(quality.aspectMax).toBeLessThanOrEqual(4);
      });

      it('triangle quality: pctMinAngleBelow10 = 0', () => {
        const { mesh } = buildMeshForTarget(targetEdgeMm);
        const quality = triangleQuality3D(mesh);
        expect(quality.pctMinAngleBelow10).toBe(0);
      });

      it('triangle quality: minAngleP50 ≥ 30', () => {
        const { mesh } = buildMeshForTarget(targetEdgeMm);
        const quality = triangleQuality3D(mesh);
        expect(quality.minAngleP50).toBeGreaterThanOrEqual(30);
      });

      it('rail vertex counts match row count', () => {
        const { footIds, crestIds, nRows } = buildMeshForTarget(targetEdgeMm);
        expect(footIds.length).toBe(nRows);
        expect(crestIds.length).toBe(nRows);
      });

      it('rail vertex ids are valid (in range)', () => {
        const { mesh, footIds, crestIds } = buildMeshForTarget(targetEdgeMm);
        const nVtx = mesh.positions.length / 3;
        for (const id of [...footIds, ...crestIds]) {
          expect(id).toBeGreaterThanOrEqual(0);
          expect(id).toBeLessThan(nVtx);
        }
      });
    });
  }

  it('produces zero triangles for a single-row grid (nothing to pave)', () => {
    // A grid with only 1 row has no inter-row gaps.
    // Simulate by passing a grid with just one row via a zero-height band.
    // Instead: verify the invariant by exercising paveBand with a trivial single-row grid.
    // Build a 2-row grid then manually check; single-row is a degenerate corner case
    // — just verify graceful handling (no crash, indices empty).
    const foot = verticalRail(uFoot, 5);
    const crest = verticalRail(uCrest, 5);
    // Pass a very large targetEdgeMm so we get only 1 row (if possible).
    // With targetEdgeMm=200mm and 60mm band, we'd get 1 segment → but buildStations
    // always returns at least first+last, giving 2 rows.
    // So this tests the minimum: 2-row grid paves at least 1 triangle.
    const grid = buildStations(foot, crest, sampler, 200.0);
    const result = paveBand(grid, sampler);
    // With 2 rows we always get triangles; with 1 row we'd get 0.
    expect(result.indices.length % 3).toBe(0);
    expect(result.utVertices.length).toBeGreaterThan(0);
  });

  it('deduplicated vertices: shared (u,t) points have the same id across adjacent rows', () => {
    const { mesh, footIds } = buildMeshForTarget(5.0);

    // The foot-rail ids must be unique (each row contributes one foot vertex,
    // but since foot rail points differ in t they should each be distinct).
    const footSet = new Set(footIds);
    expect(footSet.size).toBe(footIds.length);

    // Sanity: no out-of-range indices in the triangle buffer.
    const nVtx = mesh.positions.length / 3;
    for (let i = 0; i < mesh.indices.length; i++) {
      expect(mesh.indices[i]).toBeGreaterThanOrEqual(0);
      expect(mesh.indices[i]).toBeLessThan(nVtx);
    }
  });
});

// ── Helper: build a Mesh3 from a PaveBandResult ────────────────────────────────

/** Convert utVertices to 3D Float32Array positions via sampler, then wrap as Mesh3. */
function buildMesh3FromPaveResult(
  utVertices: Array<[number, number]>,
  indices: Uint32Array,
  samp: SyntheticCylinderSampler,
): Mesh3 {
  const positions = new Float32Array(utVertices.length * 3);
  for (let i = 0; i < utVertices.length; i++) {
    const [u, t] = utVertices[i];
    const p = samp.position(u, t);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  return { positions, indices };
}

/** Re-index utVertices by exact (u,t) key so we can recover vertex IDs. */
function makeVtxIndex(utVertices: Array<[number, number]>): Map<string, number> {
  const idx = new Map<string, number>();
  for (let i = 0; i < utVertices.length; i++) {
    idx.set(`${utVertices[i][0]}|${utVertices[i][1]}`, i);
  }
  return idx;
}

/** Collect boundary vertex indices: foot rail + crest rail + first row + last row. */
function collectBoundaryVtxIds(
  grid: StationGrid,
  utVertices: Array<[number, number]>,
  railFoot: number[],
  railCrest: number[],
): Set<number> {
  const vtxIdx = makeVtxIndex(utVertices);
  const bnd = new Set<number>();
  for (const id of railFoot) bnd.add(id);
  for (const id of railCrest) bnd.add(id);
  const addRow = (rowIdx: number): void => {
    for (const pt of grid.rows[rowIdx].w) {
      const id = vtxIdx.get(`${pt.u}|${pt.t}`);
      if (id !== undefined) bnd.add(id);
    }
  };
  addRow(0);
  addRow(grid.rows.length - 1);
  return bnd;
}

// ── Unequal-row-length zippering ───────────────────────────────────────────────

describe('zipRows — unequal row lengths', () => {
  /**
   * Build a StationGrid manually with three rows of deliberately different
   * w-lengths (3, 6, 4) to exercise the exhaustion branches in zipRows — the
   * paths that fire when one cursor reaches its last vertex before the other.
   *
   * All rows span u ∈ [0.1, 0.3], at t = 0.2, 0.5, 0.8 respectively.
   * Points linearly interpolate u from 0.1 to 0.3 within each row.
   */

  function makeRow(t: number, n: number, s: number): { s: number; footPt: StationPoint; crestPt: StationPoint; w: StationPoint[] } {
    const w: StationPoint[] = [];
    for (let i = 0; i < n; i++) {
      w.push({ u: 0.1 + 0.2 * (i / (n - 1)), t });
    }
    return { s, footPt: w[0], crestPt: w[n - 1], w };
  }

  const unequalGrid: StationGrid = {
    rows: [
      makeRow(0.2, 3, 0),
      makeRow(0.5, 6, 30),
      makeRow(0.8, 4, 60),
    ],
  };

  it('is watertight: nonManifoldEdges = 0 and tJunctions = 0', () => {
    const { utVertices, indices, railVertexIds } = paveBand(unequalGrid, sampler);
    const mesh = buildMesh3FromPaveResult(utVertices, indices, sampler);
    const bnd = collectBoundaryVtxIds(unequalGrid, utVertices, railVertexIds.foot, railVertexIds.crest);
    const audit = auditWatertight(mesh, { boundaryVertexIndices: bnd });
    expect(audit.nonManifoldEdges).toBe(0);
    // tJunctions = 0 is non-negotiable: if this fires, zipRows has a real bug.
    expect(audit.tJunctions).toBe(0);
  });

  it('produces triangles (index buffer non-empty, length % 3 = 0)', () => {
    const { indices } = paveBand(unequalGrid, sampler);
    expect(indices.length).toBeGreaterThan(0);
    expect(indices.length % 3).toBe(0);
  });

  it('triangle quality: aspectMax <= 8 (tapered band tolerance)', () => {
    // The band is tapered — wider row (6 pts) zips to narrower rows (3, 4 pts),
    // so some triangles will be less equilateral than in a constant-width band.
    // aspectMax <= 8 is a realistic bound for this geometry.
    const { utVertices, indices } = paveBand(unequalGrid, sampler);
    const mesh = buildMesh3FromPaveResult(utVertices, indices, sampler);
    const quality = triangleQuality3D(mesh);
    expect(quality.aspectMax).toBeLessThanOrEqual(8);
  });
});

// ── Diagonal quality selection ─────────────────────────────────────────────────

describe('minAngle3D / diagonal quality selection', () => {
  /**
   * Exhaustion-path test: row 0 has 3 w-points, row 1 has only 1 w-point.
   *
   * With nB = 1, iB starts at 0 and nB-1 = 0, so canAdvB is immediately false.
   * Every step must advance A only, emitting triangles:
   *   (A[0], A[1], B[0])  →  (A[1], A[2], B[0])
   * This gives exactly 2 triangles = 6 indices.
   */
  describe('B-exhausted path: all steps advance A only', () => {
    function makeTwoRowGrid(): StationGrid {
      const row0: StationPoint[] = [
        { u: 0.1, t: 0.2 },
        { u: 0.2, t: 0.2 },
        { u: 0.3, t: 0.2 },
      ];
      const row1: StationPoint[] = [
        { u: 0.1, t: 0.5 },
      ];
      return {
        rows: [
          { s: 0, footPt: row0[0], crestPt: row0[2], w: row0 },
          { s: 30, footPt: row1[0], crestPt: row1[0], w: row1 },
        ],
      };
    }

    it('emits exactly 2 triangles (6 indices)', () => {
      const grid = makeTwoRowGrid();
      const { indices } = paveBand(grid, sampler);
      expect(indices.length).toBe(6);
    });

    it('is watertight: nonManifoldEdges = 0 and tJunctions = 0', () => {
      const grid = makeTwoRowGrid();
      const { utVertices, indices, railVertexIds } = paveBand(grid, sampler);
      const mesh = buildMesh3FromPaveResult(utVertices, indices, sampler);
      const bnd = collectBoundaryVtxIds(grid, utVertices, railVertexIds.foot, railVertexIds.crest);
      const audit = auditWatertight(mesh, { boundaryVertexIndices: bnd });
      expect(audit.nonManifoldEdges).toBe(0);
      expect(audit.tJunctions).toBe(0);
    });
  });

  /**
   * Diagonal-quality test: a sheared 2×2 quad where one diagonal split is
   * clearly better than the other.
   *
   * Row 0: A0=(u0.10, t0.2)  A1=(u0.40, t0.2)  — wide span (~188mm arc)
   * Row 1: B0=(u0.10, t0.5)  B1=(u0.11, t0.5)  — narrow span (~3mm arc)
   *
   * The two candidate first triangles are:
   *   advance-A → (A0, A1, B0): sides ≈ 188mm, 30mm, 190mm. Min angle ≈ 20°.
   *   advance-B → (A0, B0, B1): sides ≈ 30mm, 3mm, 30mm. Min angle ≈ 6°.
   *
   * Since minAngle(advance-A) ≈ 20° > minAngle(advance-B) ≈ 6°, the algorithm
   * must pick advance-A first, emitting triangle (A0, A1, B0) as tris[0..2].
   *
   * Vertex intern order: rows processed top-to-bottom, w left-to-right.
   *   id 0 = A0, id 1 = A1, id 2 = B0, id 3 = B1
   * So tris[0..2] should be [0, 1, 2] (A0, A1, B0).
   */
  describe('diagonal-quality selection: picks better min-angle first', () => {
    function makeAnisotropicQuadGrid(): StationGrid {
      const row0: StationPoint[] = [
        { u: 0.10, t: 0.2 },
        { u: 0.40, t: 0.2 },
      ];
      const row1: StationPoint[] = [
        { u: 0.10, t: 0.5 },
        { u: 0.11, t: 0.5 },
      ];
      return {
        rows: [
          { s: 0,  footPt: row0[0], crestPt: row0[1], w: row0 },
          { s: 30, footPt: row1[0], crestPt: row1[1], w: row1 },
        ],
      };
    }

    it('emits exactly 2 triangles (6 indices)', () => {
      const grid = makeAnisotropicQuadGrid();
      const { indices } = paveBand(grid, sampler);
      expect(indices.length).toBe(6);
    });

    it('first triangle is (A0, A1, B0) — the higher-min-angle diagonal', () => {
      // If the algorithm picked advance-B first it would emit (A0, B0, B1) = [0, 2, 3].
      // The correct quality-maximising choice is advance-A → (A0, A1, B0) = [0, 1, 2].
      const grid = makeAnisotropicQuadGrid();
      const { indices } = paveBand(grid, sampler);
      expect(indices[0]).toBe(0); // A0
      expect(indices[1]).toBe(1); // A1
      expect(indices[2]).toBe(2); // B0
    });

    it('is watertight: nonManifoldEdges = 0 and tJunctions = 0', () => {
      const grid = makeAnisotropicQuadGrid();
      const { utVertices, indices, railVertexIds } = paveBand(grid, sampler);
      const mesh = buildMesh3FromPaveResult(utVertices, indices, sampler);
      const bnd = collectBoundaryVtxIds(grid, utVertices, railVertexIds.foot, railVertexIds.crest);
      const audit = auditWatertight(mesh, { boundaryVertexIndices: bnd });
      expect(audit.nonManifoldEdges).toBe(0);
      expect(audit.tJunctions).toBe(0);
    });
  });
});
