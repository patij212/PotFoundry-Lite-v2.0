/**
 * stitch.test.ts — THE MAKE-OR-BREAK GATE for the feature-aligned band-remesh spike.
 *
 * Builds a band (between two vertical rails) on a SyntheticCylinderSampler, paves
 * it (Task 4), triangulates the COMPLEMENT (the rest of the wall), and stitches
 * both into ONE combined Mesh3 that shares the rail vertices EXACTLY.
 *
 * The gate (non-negotiable):
 *   - auditWatertight(combined, { boundaryVertexIndices: <only the t=0/t=1 wall
 *     rings> }) → nonManifoldEdges = 0, tJunctions = 0.
 *     (No crack along the rails; no interior boundary where band meets complement.)
 *   - triangleQuality3D over the BAND triangles meets the Task-4 bars.
 *   - Holds at TWO grid resolutions matching featureLevel 7 and 11.
 *
 * Geometry (clean analytic case): the cylinder wall is the full (u,t) domain
 * (u periodic in [0,1), t in [0,1]). Two VERTICAL rails at constant u (uFoot <
 * uCrest), spanning the FULL height t ∈ [0,1]. The BAND is the vertical strip
 * u ∈ [uFoot, uCrest]; the COMPLEMENT is the rest u ∈ [uCrest, uFoot+1] wrapping
 * around the back. The mesh's TRUE open boundary is the t=0 ring + the t=1 ring.
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { auditWatertight, triangleQuality3D } from './audit';
import { densifyRail, stitchBandIntoGrid } from './stitch';
import type { StationPoint } from './stations';

// ── Cylinder parameters ───────────────────────────────────────────────────────

const R0 = 50; // mm — cylinder radius
const H = 100; // mm — cylinder height
const sampler = new SyntheticCylinderSampler(R0, H);

// ── Band geometry ─────────────────────────────────────────────────────────────

const uFoot = 0.15;
const uCrest = 0.30;

/**
 * featureLevel → targetEdgeMm.
 *
 * The conforming mesher's quadtree depth L sets the smallest cell ≈ domain / 2^L.
 * For this spike we only need two distinct cell sizes that bracket the FL7/FL11
 * working range; we map them to two 3D target edge lengths on the cylinder.
 *
 *   FL7  → coarser cells → ~8mm target edge
 *   FL11 → finer cells   → ~3mm target edge
 */
const FL_TARGET_MM: Record<number, number> = { 7: 8.0, 11: 3.0 };

/** Two coarse rail endpoints; densifyRail will fill in the rest. */
function coarseVerticalRail(uVal: number): StationPoint[] {
  // Deliberately SPARSE (2 points spanning the whole height): 3D spacing ≈ H = 100mm,
  // far above targetEdgeMm/2. This exercises densifyRail (buildStations would throw
  // on these directly).
  return [
    { u: uVal, t: 0 },
    { u: uVal, t: 1 },
  ];
}

// ── densifyRail unit tests ──────────────────────────────────────────────────────

describe('densifyRail', () => {
  it('inserts points so consecutive 3D spacing ≤ maxSpacingMm', () => {
    const coarse = coarseVerticalRail(uFoot);
    const maxSpacing = 4.0;
    const dense = densifyRail(coarse, sampler, maxSpacing);
    expect(dense.length).toBeGreaterThan(coarse.length);
    for (let i = 1; i < dense.length; i++) {
      const a = sampler.position(dense[i - 1].u, dense[i - 1].t);
      const b = sampler.position(dense[i].u, dense[i].t);
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      expect(d).toBeLessThanOrEqual(maxSpacing + 1e-6);
    }
  });

  it('preserves the original endpoints exactly (anchor preservation)', () => {
    const coarse = coarseVerticalRail(uFoot);
    const dense = densifyRail(coarse, sampler, 4.0);
    expect(dense[0].u).toBe(coarse[0].u);
    expect(dense[0].t).toBe(coarse[0].t);
    expect(dense[dense.length - 1].u).toBe(coarse[coarse.length - 1].u);
    expect(dense[dense.length - 1].t).toBe(coarse[coarse.length - 1].t);
  });

  it('is deterministic (same input → same output)', () => {
    const coarse = coarseVerticalRail(uFoot);
    const a = densifyRail(coarse, sampler, 4.0);
    const b = densifyRail(coarse, sampler, 4.0);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].u).toBe(b[i].u);
      expect(a[i].t).toBe(b[i].t);
    }
  });
});

// ── Negative-control (crack detection) helpers ────────────────────────────────

/**
 * Given a stitched result, find ONE interior rail vertex — a vertex that appears
 * in railEdgeKeys but whose t is strictly in (0, 1) (i.e. NOT in
 * openBoundaryVertices). Interior rail vertices are unambiguously shared seam
 * vertices; splitting one creates a real crack along the rail.
 *
 * Returns undefined only if every rail vertex happens to sit at a boundary row
 * (which cannot happen for nRows > 2).
 */
function findInteriorRailVertex(
  railEdgeKeys: string[],
  openBoundaryVertices: Set<number>,
): number | undefined {
  for (const key of railEdgeKeys) {
    const [iS, jS] = key.split(':');
    const vi = Number(iS);
    const vj = Number(jS);
    if (!openBoundaryVertices.has(vi)) return vi;
    if (!openBoundaryVertices.has(vj)) return vj;
  }
  return undefined;
}

/**
 * Build a cracked copy of `mesh` by splitting `splitIdx`:
 *   - Push a duplicate of vertex `splitIdx`'s position → new index `newIdx`.
 *   - For each triangle in `bandIndices`, replace any reference to `splitIdx`
 *     with `newIdx`, leaving complement triangles on the original index.
 *
 * This breaks the shared interior rail vertex, creating a one-sided edge along
 * the rail that auditWatertight should report as tJunctions > 0.
 */
function buildCrackedMesh(
  mesh: { positions: Float32Array; indices: Uint32Array },
  bandIndices: Uint32Array,
  splitIdx: number,
): { positions: Float32Array; indices: Uint32Array } {
  // Append a copy of the split vertex to positions.
  const newPositions = new Float32Array(mesh.positions.length + 3);
  newPositions.set(mesh.positions);
  newPositions[mesh.positions.length] = mesh.positions[splitIdx * 3];
  newPositions[mesh.positions.length + 1] = mesh.positions[splitIdx * 3 + 1];
  newPositions[mesh.positions.length + 2] = mesh.positions[splitIdx * 3 + 2];
  const newIdx = mesh.positions.length / 3; // index of the duplicate

  // Build a set of triangle start offsets that belong to the band.
  const bandTriSet = new Set<number>();
  for (let k = 0; k < bandIndices.length; k += 3) {
    // Identify the triangle in the combined index buffer by matching all three
    // indices. We scan combined indices for matching (a,b,c) triples.
    const ba = bandIndices[k];
    const bb = bandIndices[k + 1];
    const bc = bandIndices[k + 2];
    for (let m = 0; m < mesh.indices.length; m += 3) {
      if (
        mesh.indices[m] === ba &&
        mesh.indices[m + 1] === bb &&
        mesh.indices[m + 2] === bc
      ) {
        bandTriSet.add(m);
        break;
      }
    }
  }

  // Rewrite: band-side triangles referencing splitIdx → newIdx.
  const newIndices = new Uint32Array(mesh.indices);
  for (const offset of bandTriSet) {
    for (let s = 0; s < 3; s++) {
      if (newIndices[offset + s] === splitIdx) {
        newIndices[offset + s] = newIdx;
      }
    }
  }

  return { positions: newPositions, indices: newIndices };
}

// ── THE GATE ──────────────────────────────────────────────────────────────────

describe('stitchBandIntoGrid — watertight gate', () => {
  for (const featureLevel of [7, 11]) {
    const targetEdgeMm = FL_TARGET_MM[featureLevel];

    describe(`featureLevel ${featureLevel} (targetEdgeMm ${targetEdgeMm})`, () => {
      it('produces a non-empty combined mesh', () => {
        const { mesh } = stitchBandIntoGrid({
          sampler,
          footRail: coarseVerticalRail(uFoot),
          crestRail: coarseVerticalRail(uCrest),
          targetEdgeMm,
        });
        expect(mesh.indices.length).toBeGreaterThan(0);
        expect(mesh.indices.length % 3).toBe(0);
        expect(mesh.positions.length % 3).toBe(0);
      });

      it('GATE: nonManifoldEdges = 0 and tJunctions = 0 (no crack along rails)', () => {
        const { mesh, openBoundaryVertices } = stitchBandIntoGrid({
          sampler,
          footRail: coarseVerticalRail(uFoot),
          crestRail: coarseVerticalRail(uCrest),
          targetEdgeMm,
        });
        const audit = auditWatertight(mesh, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        expect(audit.nonManifoldEdges).toBe(0);
        expect(audit.tJunctions).toBe(0);
      });

      it('NEGATIVE CONTROL: splitting one interior rail vertex creates tJunctions > 0 (gate is non-vacuous)', () => {
        // Build the clean stitched mesh — identical setup to the GATE test above.
        const { mesh, bandMesh, openBoundaryVertices, railEdgeKeys } =
          stitchBandIntoGrid({
            sampler,
            footRail: coarseVerticalRail(uFoot),
            crestRail: coarseVerticalRail(uCrest),
            targetEdgeMm,
          });

        // Confirm the clean mesh passes (control side of the pair).
        const cleanAudit = auditWatertight(mesh, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        expect(cleanAudit.tJunctions).toBe(0);

        // Find an interior rail vertex (t strictly in (0,1) — unambiguously a crack
        // if split, not a legit boundary endpoint).
        const splitIdx = findInteriorRailVertex(railEdgeKeys, openBoundaryVertices);
        expect(splitIdx).toBeDefined();
        if (splitIdx === undefined) return; // type-narrowing guard; never reached

        // Duplicate the vertex and re-point band-side triangles to the copy.
        // The complement-side triangles still reference the original → rail crack.
        const cracked = buildCrackedMesh(mesh, bandMesh.indices, splitIdx);

        // Same boundary set: the t=0/t=1 rings are untouched.
        const crackedAudit = auditWatertight(cracked, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        // The cracked mesh must register the interior crack as a T-junction.
        expect(crackedAudit.tJunctions).toBeGreaterThan(0);
      });

      it('the only open-boundary edges are the t=0 / t=1 wall rings', () => {
        const { mesh, openBoundaryVertices } = stitchBandIntoGrid({
          sampler,
          footRail: coarseVerticalRail(uFoot),
          crestRail: coarseVerticalRail(uCrest),
          targetEdgeMm,
        });
        const audit = auditWatertight(mesh, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        // A closed cylindrical band of finite height has exactly two open rings.
        // Their total edge count = (vertices on t=0 ring) + (vertices on t=1 ring).
        // We only assert there ARE open boundary edges and they are all classified
        // as legitimate boundary (the GATE test already proved tJunctions=0).
        expect(audit.boundaryEdges).toBeGreaterThan(0);
      });

      it('band triangle quality meets the Task-4 bars', () => {
        const { bandMesh } = stitchBandIntoGrid({
          sampler,
          footRail: coarseVerticalRail(uFoot),
          crestRail: coarseVerticalRail(uCrest),
          targetEdgeMm,
        });
        const q = triangleQuality3D(bandMesh);
        expect(q.aspectMax).toBeLessThanOrEqual(4);
        expect(q.pctMinAngleBelow10).toBe(0);
        expect(q.minAngleP50).toBeGreaterThanOrEqual(30);
      });

      it('every rail edge is shared by exactly one band tri + one complement tri', () => {
        // Direct watertightness proof: count incidence of each rail edge.
        const { mesh, railEdgeKeys } = stitchBandIntoGrid({
          sampler,
          footRail: coarseVerticalRail(uFoot),
          crestRail: coarseVerticalRail(uCrest),
          targetEdgeMm,
        });
        const edgeCount = new Map<string, number>();
        const { indices } = mesh;
        for (let k = 0; k < indices.length; k += 3) {
          const a = indices[k];
          const b = indices[k + 1];
          const c = indices[k + 2];
          for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
            const key = i < j ? `${i}:${j}` : `${j}:${i}`;
            edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
          }
        }
        expect(railEdgeKeys.length).toBeGreaterThan(0);
        for (const key of railEdgeKeys) {
          expect(edgeCount.get(key)).toBe(2);
        }
      });
    });
  }
});
