/**
 * normalDiscontinuity.ts — Normal-discontinuity detector for the feature-graph
 * pipeline.
 *
 * Detects sharp C0/C1 creases (Gothic arches, Crystalline facets, LowPoly edges,
 * GeometricStar strapwork, ArtDeco steps) by flagging grid edges where the surface
 * normal vector turns by more than `minAngleDeg` degrees between the two endpoint
 * samples.
 *
 * ## Algorithm
 *
 * For every interior grid edge (horizontal and vertical):
 *   1. Read the pre-sampled normals n_a and n_b from `fields.nx/ny/nz`.
 *   2. Compute the angle between them: θ = acos(clamp(n_a · n_b, −1, 1)) in degrees.
 *   3. If θ > minAngleDeg, emit a {@link RawSegment} connecting the two endpoint
 *      (u,t) positions with `strength = θ` (the angle jump in degrees).
 *
 * The u axis is periodic (column resU−1 connects to column 0), so the wrap edge
 * IS included for horizontal edges. The t axis is clamped — only interior rows
 * (j=0..resT−2) produce vertical edges.
 *
 * The detector is style-agnostic: it only reads the `Fields` struct produced by
 * {@link sampleFeatureFields}. No per-style branches.
 *
 * @module conforming/featureGraph/normalDiscontinuity
 */

import type { Fields, RawSegments, RawSegment } from './types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for {@link detectNormalDiscontinuity}. */
export interface NormalDiscontinuityOptions {
  /**
   * Minimum normal-angle jump (degrees) for an edge to be flagged as a crease.
   * Edges whose two endpoints' normals differ by less than this are ignored.
   * A value of ~20° is typical — it passes sharp mechanical creases (Gothic,
   * LowPoly, ArtDeco steps) while rejecting the slow normal rotation on smooth
   * curved surfaces.
   */
  minAngleDeg: number;
}

/**
 * Detect normal discontinuities in a pre-sampled field grid.
 *
 * Each flagged grid edge becomes one {@link RawSegment} connecting the two
 * endpoint (u,t) positions. `strength` = the normal angle-jump in degrees
 * (a VALUE, not a clamped [0,1] score).
 *
 * @param fields  Sampled surface-normal + max-principal-curvature grid from
 *                {@link sampleFeatureFields}.
 * @param opts    Detection options — `minAngleDeg` threshold.
 * @returns       {@link RawSegments} with `type: 'normal-discontinuity'` and
 *                per-segment `strength = angle-jump (degrees)`.
 */
export function detectNormalDiscontinuity(
  fields: Fields,
  opts: NormalDiscontinuityOptions,
): RawSegments {
  const { resU, resT, nx, ny, nz, uOf, tOf } = fields;
  const { minAngleDeg } = opts;

  const segs: RawSegment[] = [];

  // -------------------------------------------------------------------------
  // Horizontal edges: node (i,j) — node (i+1 mod resU, j)
  // The u-axis is periodic, so the wrap edge (i = resU−1 → i+1 = 0) is valid.
  // -------------------------------------------------------------------------
  for (let j = 0; j < resT; j++) {
    const tA = tOf(j);
    for (let i = 0; i < resU; i++) {
      const ip = (i + 1) % resU;

      const idxA = j * resU + i;
      const idxB = j * resU + ip;

      const angleDeg = normalAngleDeg(nx, ny, nz, idxA, idxB);
      if (angleDeg > minAngleDeg) {
        segs.push({
          a: { u: uOf(i), t: tA },
          b: { u: uOf(ip), t: tA },
          strength: angleDeg,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Vertical edges: node (i,j) — node (i, j+1)
  // The t-axis is clamped; j ranges 0..resT−2 so j+1 stays inside [0,resT).
  // -------------------------------------------------------------------------
  for (let j = 0; j < resT - 1; j++) {
    const jp = j + 1;
    for (let i = 0; i < resU; i++) {
      const uA = uOf(i);

      const idxA = j * resU + i;
      const idxB = jp * resU + i;

      const angleDeg = normalAngleDeg(nx, ny, nz, idxA, idxB);
      if (angleDeg > minAngleDeg) {
        segs.push({
          a: { u: uA, t: tOf(j) },
          b: { u: uA, t: tOf(jp) },
          strength: angleDeg,
        });
      }
    }
  }

  // `minAngleDeg` is the emission threshold (same unit as strength: degrees).
  // Every emitted edge has angle > minAngleDeg, so strength / minAngleDeg > 1 →
  // normalized saliency is comparable with the other detectors'.
  return { segs, type: 'normal-discontinuity', threshold: minAngleDeg };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the angle in degrees between the unit normals at two grid nodes.
 *
 * Returns 0 when either normal is degenerate (|n| ≈ 0 — set by sampleFields
 * at poles). A degenerate normal carries no orientation information, so the
 * edge is silently passed (not flagged).
 */
function normalAngleDeg(
  nx: Float64Array,
  ny: Float64Array,
  nz: Float64Array,
  idxA: number,
  idxB: number,
): number {
  const ax = nx[idxA];
  const ay = ny[idxA];
  const az = nz[idxA];
  const bx = nx[idxB];
  const by = ny[idxB];
  const bz = nz[idxB];

  // Skip degenerate normals (left as zero by sampleFields at poles).
  const lenA = Math.hypot(ax, ay, az);
  const lenB = Math.hypot(bx, by, bz);
  if (lenA < 1e-15 || lenB < 1e-15) return 0;

  // Dot product of unit normals, clamped to [−1, 1] to guard acos domain.
  const dot = (ax * bx + ay * by + az * bz) / (lenA * lenB);
  const dotClamped = dot < -1 ? -1 : dot > 1 ? 1 : dot;

  return Math.acos(dotClamped) * (180 / Math.PI);
}
