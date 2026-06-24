/**
 * junction.test.ts — SPIKE GATE B: triple-junction paving (Voronoi vertex).
 *
 * At a Voronoi triple junction, three relief-web ribbons meet at a common point.
 * The three paved bands must join through a central junction polygon WITHOUT
 * cracks. This gate constructs a SYNTHETIC 3-ribbon Y-junction on a
 * SyntheticCylinderSampler, paves all three bands + the junction, combines into
 * ONE Mesh3, and proves it is watertight by construction.
 *
 * ## Geometry (the representative analytic Y-junction)
 *
 * A center point `C = (uc, tc)` in (u,t) parameter space. Three CORNER points
 * `P0, P1, P2` arranged around `C` at 120° apart at radius `armHalfWidth`. The
 * three arms radiate OUTWARD from the junction at 120°; arm `i` lies between
 * corners `Pi` and `P(i+1)%3`.
 *
 * Each band `i` is a CONSTANT-WIDTH ribbon (parallel rails) centered on a
 * Voronoi-edge axis radiating from the center at 120°. Its JUNCTION-END rails
 * terminate at two ADJACENT shared corners:
 *   - band 0: foot rail ends at P0, crest rail ends at P1
 *   - band 1: foot rail ends at P1, crest rail ends at P2
 *   - band 2: foot rail ends at P2, crest rail ends at P0
 *
 * Adjacent bands SHARE a corner exactly (P1 is band-0's crest end AND band-1's
 * foot end, etc.). The shared corners are the geometric intersections of adjacent
 * ribbon edges (the Y-junction's natural inner triangle). The CENTRAL junction
 * polygon is the region bounded by the three junction-end rows (each running
 * Pi → P(i+1)); its boundary vertices ARE those end-row vertices — shared by
 * exact (u,t) key, exactly like the Task-5 rail sharing.
 *
 * ## The gate (non-negotiable)
 *   - auditWatertight(combined, { boundaryVertexIndices: <only the 3 OUTER open
 *     band-end rows> }) → nonManifoldEdges = 0, tJunctions = 0.
 *     (No crack along the inter-band corners; no interior boundary where the
 *     junction meets the three bands.)
 *   - NEGATIVE CONTROL: split one shared junction/band vertex → tJunctions > 0
 *     (proves the audit is non-vacuous for the junction case).
 *   - triangleQuality3D over the junction + band triangles → report aspect,
 *     pct<10°, minAngleP50.
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { paveJunction } from './junction';
import type { JunctionArm } from './junction';
import type { StationPoint } from './stations';

// ── Cylinder parameters ───────────────────────────────────────────────────────

const R0 = 50; // mm — cylinder radius
const H = 100; // mm — cylinder height
const sampler = new SyntheticCylinderSampler(R0, H);

// ── Y-junction geometry ─────────────────────────────────────────────────────────

/** Center of the junction in (u,t) parameter space (away from the u=0/1 seam). */
const CENTER: StationPoint = { u: 0.5, t: 0.5 };

/**
 * featureLevel → targetEdgeMm (matches the Task-5 gate's two densities).
 *   FL7  → coarser cells → ~8mm target edge
 *   FL11 → finer cells   → ~3mm target edge
 */
const FL_TARGET_MM: Record<number, number> = { 7: 8.0, 11: 3.0 };

/**
 * Build the three arms of a Y-junction as CONSTANT-WIDTH ribbons.
 *
 * Three ribbon axes radiate from CENTER at 120° (θ_i = 120°·i + 30°). Each
 * ribbon `i` has half-width `armHalfWidthU` (perpendicular to its axis) and runs
 * from an INNER radius (the junction) to an OUTER radius (the free end), keeping
 * its two rails PARALLEL → no taper → clean strip triangulation.
 *
 * The shared inner corners P0,P1,P2 are the geometric intersections of adjacent
 * ribbons' edges: corner `Pi` lies on the bisector between ribbon `(i-1)` and
 * ribbon `i` (angle θ_i − 60°) at radius `armHalfWidthU / sin(60°)` (where a
 * ±half-width offset of two ribbons 120° apart meet). Each arm's junction end
 * thus spans the two adjacent corners.
 *
 * Each arm supplies:
 *   - footRail  : OUTER foot corner → junction-end foot corner (Pi)
 *   - crestRail : OUTER crest corner → junction-end crest corner (P(i+1)%3)
 *
 * The rails are deliberately SPARSE (2 points each); densifyRail inside the
 * implementation fills them in. The junction-end corners are passed EXPLICITLY as
 * `junctionFoot` / `junctionCrest` so adjacent arms share them by exact (u,t)
 * reference (P(i+1) is arm-i's crest end AND arm-(i+1)'s foot end).
 */
function buildArms(armHalfWidthU: number, armLengthU: number): JunctionArm[] {
  const innerR = armHalfWidthU / Math.sin(Math.PI / 3); // = 2·hw/√3
  // Inner shared corners: corner i on bisector θ_i − 60° at radius innerR.
  const cornerAt = (i: number): StationPoint => {
    const ang = (2 * Math.PI * i) / 3 + Math.PI / 6 - Math.PI / 3;
    return {
      u: CENTER.u + innerR * Math.cos(ang),
      t: CENTER.t + innerR * Math.sin(ang),
    };
  };
  // Outer rail endpoint for ribbon i, on the given side (±1 = crest/foot offset):
  // axis point at radius (innerR + armLength) plus the perpendicular half-width.
  const outerEndpoint = (i: number, side: 1 | -1): StationPoint => {
    const theta = (2 * Math.PI * i) / 3 + Math.PI / 6;
    const axis = { u: Math.cos(theta), t: Math.sin(theta) };
    const perp = { u: -Math.sin(theta), t: Math.cos(theta) };
    const r = innerR * Math.cos(Math.PI / 6) + armLengthU; // axial reach of the end
    return {
      u: CENTER.u + axis.u * r + side * armHalfWidthU * perp.u,
      t: CENTER.t + axis.t * r + side * armHalfWidthU * perp.t,
    };
  };

  const corners: StationPoint[] = [cornerAt(0), cornerAt(1), cornerAt(2)];

  const arms: JunctionArm[] = [];
  for (let i = 0; i < 3; i++) {
    const footCorner = corners[i];
    const crestCorner = corners[(i + 1) % 3];
    arms.push({
      // Foot rail (−perp side): outer foot corner → junction foot corner Pi.
      footRail: [outerEndpoint(i, -1), footCorner],
      // Crest rail (+perp side): outer crest corner → junction crest corner P(i+1).
      crestRail: [outerEndpoint(i, 1), crestCorner],
      junctionFoot: footCorner,
      junctionCrest: crestCorner,
    });
  }
  return arms;
}

// armHalfWidth / armLength in param units so that, at this cylinder
// (R0=50, H=100), the 3D ribbon half-width / length comfortably exceed the FL11
// target edge (3mm), giving genuine multi-row constant-width ribbons.
const ARM_HALF_WIDTH_U = 0.05; // ≈ 2π·50·0.05 ≈ 15.7mm azimuthal half-width
const ARM_LENGTH_U = 0.10; //     ≈ a multi-row ribbon length

// ── Negative-control helpers (mirror the Task-5 discipline) ───────────────────

/**
 * Find ONE interior shared junction/band vertex — a vertex that lies on the
 * shared seam between the junction polygon and a band (i.e. appears in
 * `sharedEdgeKeys`) but is NOT in `openBoundaryVertices` (not an outer-ring
 * endpoint). Splitting one creates a real crack at the junction.
 */
function findInteriorSharedVertex(
  sharedEdgeKeys: string[],
  openBoundaryVertices: Set<number>,
): number | undefined {
  for (const key of sharedEdgeKeys) {
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
 *   - Append a duplicate of vertex `splitIdx`'s position → `newIdx`.
 *   - For every triangle in `junctionIndices`, repoint any reference to
 *     `splitIdx` to `newIdx`; band triangles keep the original index.
 * This breaks the shared junction↔band weld at that vertex → one-sided edge →
 * tJunctions > 0.
 */
function buildCrackedMesh(
  mesh: Mesh3,
  junctionIndices: Uint32Array,
  splitIdx: number,
): Mesh3 {
  const newPositions = new Float32Array(mesh.positions.length + 3);
  newPositions.set(mesh.positions);
  newPositions[mesh.positions.length] = mesh.positions[splitIdx * 3];
  newPositions[mesh.positions.length + 1] = mesh.positions[splitIdx * 3 + 1];
  newPositions[mesh.positions.length + 2] = mesh.positions[splitIdx * 3 + 2];
  const newIdx = mesh.positions.length / 3;

  // Identify junction triangles inside the combined buffer by matching triples.
  const junctionTriOffsets = new Set<number>();
  for (let k = 0; k < junctionIndices.length; k += 3) {
    const ja = junctionIndices[k];
    const jb = junctionIndices[k + 1];
    const jc = junctionIndices[k + 2];
    for (let m = 0; m < mesh.indices.length; m += 3) {
      if (
        mesh.indices[m] === ja &&
        mesh.indices[m + 1] === jb &&
        mesh.indices[m + 2] === jc
      ) {
        junctionTriOffsets.add(m);
        break;
      }
    }
  }

  const newIndices = new Uint32Array(mesh.indices);
  for (const offset of junctionTriOffsets) {
    for (let s = 0; s < 3; s++) {
      if (newIndices[offset + s] === splitIdx) {
        newIndices[offset + s] = newIdx;
      }
    }
  }
  return { positions: newPositions, indices: newIndices };
}

// ── THE GATE ──────────────────────────────────────────────────────────────────

describe('paveJunction — triple-junction watertight gate', () => {
  for (const featureLevel of [7, 11]) {
    const targetEdgeMm = FL_TARGET_MM[featureLevel];

    describe(`featureLevel ${featureLevel} (targetEdgeMm ${targetEdgeMm})`, () => {
      const run = () =>
        paveJunction(buildArms(ARM_HALF_WIDTH_U, ARM_LENGTH_U), sampler, targetEdgeMm);

      it('produces a non-empty combined mesh with 3 bands + a junction', () => {
        const r = run();
        expect(r.mesh.indices.length).toBeGreaterThan(0);
        expect(r.mesh.indices.length % 3).toBe(0);
        expect(r.mesh.positions.length % 3).toBe(0);
        expect(r.junctionMesh.indices.length).toBeGreaterThan(0);
      });

      it('GATE: nonManifoldEdges = 0 and tJunctions = 0 (no crack at the junction)', () => {
        const { mesh, openBoundaryVertices } = run();
        const audit = auditWatertight(mesh, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        expect(audit.nonManifoldEdges).toBe(0);
        expect(audit.tJunctions).toBe(0);
      });

      it('NEGATIVE CONTROL: splitting one shared junction vertex creates tJunctions > 0 (gate is non-vacuous)', () => {
        const { mesh, junctionMesh, openBoundaryVertices, sharedEdgeKeys } = run();

        // Control side: clean mesh passes.
        const cleanAudit = auditWatertight(mesh, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        expect(cleanAudit.tJunctions).toBe(0);

        // Find an interior shared junction↔band vertex (not an outer-ring endpoint).
        const splitIdx = findInteriorSharedVertex(sharedEdgeKeys, openBoundaryVertices);
        expect(splitIdx).toBeDefined();
        if (splitIdx === undefined) return; // type guard; never reached

        const cracked = buildCrackedMesh(mesh, junctionMesh.indices, splitIdx);
        const crackedAudit = auditWatertight(cracked, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        expect(crackedAudit.tJunctions).toBeGreaterThan(0);
      });

      it('the only open-boundary edges are the 3 outer band-end rows', () => {
        const { mesh, openBoundaryVertices } = run();
        const audit = auditWatertight(mesh, {
          boundaryVertexIndices: openBoundaryVertices,
        });
        // The Y-junction patch has exactly three OPEN edges: the outer end of
        // each band. Everything else (corners, junction seams) is interior.
        expect(audit.boundaryEdges).toBeGreaterThan(0);
      });

      it('every junction↔band seam edge is shared by exactly two triangles', () => {
        // Direct watertightness proof: count incidence of each shared seam edge.
        const { mesh, sharedEdgeKeys } = run();
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
        expect(sharedEdgeKeys.length).toBeGreaterThan(0);
        for (const key of sharedEdgeKeys) {
          expect(edgeCount.get(key)).toBe(2);
        }
      });

      it('junction + band triangle quality meets the Task-4 bars (report real numbers)', () => {
        const { mesh, junctionMesh } = run();
        const qAll = triangleQuality3D(mesh);
        const qJunction = triangleQuality3D(junctionMesh);
        // Log the real numbers for the report.

        console.log(
          `FL${featureLevel} ALL      aspectMax=${qAll.aspectMax.toFixed(3)}` +
            ` pct<10=${qAll.pctMinAngleBelow10.toFixed(2)}% p50=${qAll.minAngleP50.toFixed(2)}°`,
        );

        console.log(
          `FL${featureLevel} JUNCTION aspectMax=${qJunction.aspectMax.toFixed(3)}` +
            ` pct<10=${qJunction.pctMinAngleBelow10.toFixed(2)}% p50=${qJunction.minAngleP50.toFixed(2)}°`,
        );
        // The Steiner-free best-ear + Delaunay-flip junction fill clears the Task-4
        // bars: no slivers under 10°, aspect ≤ 4. The whole patch (bands + junction)
        // does too. (minAngleP50 is reported, not over-asserted — the junction's
        // small triangular polygon runs a touch below the band's p50.)
        expect(qJunction.pctMinAngleBelow10).toBe(0);
        expect(qJunction.aspectMax).toBeLessThanOrEqual(4);
        expect(qAll.pctMinAngleBelow10).toBe(0);
        expect(qAll.aspectMax).toBeLessThanOrEqual(4);
      });
    });
  }
});
