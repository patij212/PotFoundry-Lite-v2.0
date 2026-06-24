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

  /**
   * Local-contrast gate (optional, additive). When provided, an edge ALSO
   * qualifies as a crease — even if its angle is below the absolute
   * `minAngleDeg` floor — if it is a clear LOCAL PEAK: its angle exceeds the
   * minimum angle in a local window (running PARALLEL to the edge, the direction
   * along which a real crease stays roughly constant) by at least
   * `factor × (localMax − localMin)`, with the local span itself required to
   * exceed `absFloorDeg`. This catches gentle/rounded-but-distinct creases
   * (LowPolyFacet's smin-rounded facet edges, GeometricStar's soft sector folds)
   * that sit below the absolute floor, WITHOUT firing on a uniformly-smooth wall
   * (whose edge-angle field is a flat plateau → localMax−localMin ≈ 0 < absFloor,
   * so the contrast gate stays silent). Derived purely from the sampled field —
   * no per-style knowledge. Omit to use the absolute floor only.
   */
  contrast?: LocalContrastOptions;
}

/**
 * Parameters for the additive local-contrast gate (see
 * {@link NormalDiscontinuityOptions.contrast}). All values are GLOBAL constants
 * (no per-style tuning); they describe a relative-prominence test on the
 * edge-angle field.
 */
export interface LocalContrastOptions {
  /** Half-width (in edges) of the local window scanned for the peak test. */
  windowRadius: number;
  /**
   * Fraction of the local dynamic range (localMax − localMin) the candidate must
   * rise above the local minimum to count as a peak. e.g. 0.6 ⇒ the candidate
   * must sit in the top 40% of its window's angle range.
   */
  factor: number;
  /**
   * Absolute noise floor in degrees. Both the candidate angle AND the local span
   * (localMax − localMin) must exceed this for the contrast gate to fire. Keeps a
   * smooth wall (uniform tiny angle jumps, span ≈ 0) silent.
   */
  absFloorDeg: number;
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
  const { minAngleDeg, contrast } = opts;

  const segs: RawSegment[] = [];

  // -------------------------------------------------------------------------
  // Horizontal edges: node (i,j) — node (i+1 mod resU, j)
  // The u-axis is periodic, so the wrap edge (i = resU−1 → i+1 = 0) is valid.
  // A horizontal crease edge runs along u; the contrast window therefore scans
  // along u (the parallel direction, periodic).
  // -------------------------------------------------------------------------
  for (let j = 0; j < resT; j++) {
    const tA = tOf(j);

    // Precompute this row's horizontal-edge angles once (reused by the contrast
    // window so we don't recompute acos for every window position).
    const rowAngle = contrast ? new Float64Array(resU) : null;
    if (rowAngle) {
      for (let i = 0; i < resU; i++) {
        rowAngle[i] = normalAngleDeg(nx, ny, nz, j * resU + i, j * resU + ((i + 1) % resU));
      }
    }

    for (let i = 0; i < resU; i++) {
      const ip = (i + 1) % resU;

      const idxA = j * resU + i;
      const idxB = j * resU + ip;

      const angleDeg = rowAngle ? rowAngle[i] : normalAngleDeg(nx, ny, nz, idxA, idxB);
      const passAbs = angleDeg > minAngleDeg;
      const passContrast =
        !passAbs &&
        rowAngle !== null &&
        isLocalPeak(rowAngle, i, resU, true, angleDeg, contrast as LocalContrastOptions);
      if (passAbs || passContrast) {
        segs.push({
          a: { u: uOf(i), t: tA },
          b: { u: uOf(ip), t: tA },
          // Contrast-only edges are below the absolute floor; floor their reported
          // strength at minAngleDeg so their unifier saliency (=strength/threshold)
          // is ≥1 and they survive the minStrength drop as bona-fide creases.
          strength: passAbs ? angleDeg : Math.max(angleDeg, minAngleDeg),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Vertical edges: node (i,j) — node (i, j+1)
  // The t-axis is clamped; j ranges 0..resT−2 so j+1 stays inside [0,resT).
  // A vertical crease edge runs along t; the contrast window scans along t
  // (the parallel direction, clamped — windows truncate at the t-boundaries).
  // -------------------------------------------------------------------------
  // Precompute the full vertical-edge angle grid when contrast is on (a column
  // window needs neighbours in j, so a per-column scratch is cleanest).
  const vertAngle = contrast ? new Float64Array(resU * (resT - 1)) : null;
  if (vertAngle) {
    for (let j = 0; j < resT - 1; j++) {
      for (let i = 0; i < resU; i++) {
        vertAngle[j * resU + i] = normalAngleDeg(nx, ny, nz, j * resU + i, (j + 1) * resU + i);
      }
    }
  }

  for (let j = 0; j < resT - 1; j++) {
    const jp = j + 1;
    for (let i = 0; i < resU; i++) {
      const uA = uOf(i);

      const idxA = j * resU + i;
      const idxB = jp * resU + i;

      const angleDeg = vertAngle ? vertAngle[j * resU + i] : normalAngleDeg(nx, ny, nz, idxA, idxB);
      const passAbs = angleDeg > minAngleDeg;
      const passContrast =
        !passAbs &&
        vertAngle !== null &&
        isColumnPeak(vertAngle, i, j, resU, resT - 1, angleDeg, contrast as LocalContrastOptions);
      if (passAbs || passContrast) {
        segs.push({
          a: { u: uA, t: tOf(j) },
          b: { u: uA, t: tOf(jp) },
          // See horizontal block: floor contrast-only strength at minAngleDeg.
          strength: passAbs ? angleDeg : Math.max(angleDeg, minAngleDeg),
        });
      }
    }
  }

  // `minAngleDeg` is the emission threshold (same unit as strength: degrees).
  // Every absolute-floor edge has angle > minAngleDeg; contrast-gate edges may be
  // below it but are real local-peak creases. The threshold is kept at
  // minAngleDeg so the unifier's saliency normalization (strength / threshold)
  // remains stable; a sub-floor contrast edge gets saliency < 1, which the
  // unifier's minStrength filter would normally drop — so we floor the reported
  // strength of any kept edge at minAngleDeg to mark it a bona-fide crease.
  return { segs, type: 'normal-discontinuity', threshold: minAngleDeg };
}

/**
 * Local-peak test along a PERIODIC 1-D angle array (used for horizontal edges,
 * whose parallel axis is the periodic u). The candidate at index `i` qualifies
 * when (a) its angle and the local span both exceed `absFloorDeg`, and (b) it
 * rises above the window minimum by ≥ `factor × (localMax − localMin)` and is the
 * window maximum. A flat plateau (span ≈ 0) never qualifies.
 */
function isLocalPeak(
  arr: Float64Array,
  i: number,
  n: number,
  periodic: boolean,
  value: number,
  c: LocalContrastOptions,
): boolean {
  if (value <= c.absFloorDeg) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (let d = -c.windowRadius; d <= c.windowRadius; d++) {
    let idx = i + d;
    if (periodic) idx = (idx + n) % n;
    else if (idx < 0 || idx >= n) continue;
    const v = arr[idx];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo;
  if (span <= c.absFloorDeg) return false;
  // Must be (within fp tolerance) the window maximum AND clear the relative margin.
  return value >= hi - 1e-9 && value - lo >= c.factor * span;
}

/**
 * Local-peak test for a vertical edge at (i, j) over its CLAMPED column (the
 * parallel axis is t). Same prominence logic as {@link isLocalPeak} but over a
 * non-periodic window in j (truncated at the column ends).
 */
function isColumnPeak(
  grid: Float64Array,
  i: number,
  j: number,
  resU: number,
  rows: number,
  value: number,
  c: LocalContrastOptions,
): boolean {
  if (value <= c.absFloorDeg) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (let d = -c.windowRadius; d <= c.windowRadius; d++) {
    const jj = j + d;
    if (jj < 0 || jj >= rows) continue;
    const v = grid[jj * resU + i];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo;
  if (span <= c.absFloorDeg) return false;
  return value >= hi - 1e-9 && value - lo >= c.factor * span;
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
