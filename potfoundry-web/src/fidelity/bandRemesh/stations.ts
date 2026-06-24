/**
 * stations.ts — Metric-sized cross-band station grid between foot and crest rails.
 *
 * Given two rail polylines (foot + crest, each an array of (u,t) points) and a
 * SurfaceSampler, builds a grid of cross-band rows between them.  Row positions
 * along the band (s-direction) are spaced ≈ targetEdgeMm in 3D arclength along
 * the foot rail.  Within each row, cross-band points from foot→crest are spaced
 * ≈ targetEdgeMm in 3D arclength along the row.
 *
 * CRITICAL: The foot and crest endpoints of every row are exactly the input rail
 * vertices (anchor preservation).  Interior points are new insertions.
 *
 * @module fidelity/bandRemesh/stations
 */

import type { SurfaceSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';

/** A point in (u,t) parameter space. */
export interface StationPoint {
  u: number;
  t: number;
}

/** One cross-band row of the station grid. */
export interface StationRow {
  /** Cumulative 3D arclength along the foot rail from the first row. */
  s: number;
  /** Exact input foot rail vertex for this row (anchor). */
  footPt: StationPoint;
  /** Exact input crest rail vertex corresponding to this foot vertex (anchor). */
  crestPt: StationPoint;
  /**
   * Cross-band points from foot to crest, inclusive.
   * w[0] === footPt and w[w.length-1] === crestPt (exact references).
   * Interior points are spaced ≈ targetEdgeMm in 3D.
   */
  w: StationPoint[];
}

/** Result of {@link buildStations}. */
export interface StationGrid {
  rows: StationRow[];
}

/**
 * Integrate 3D arclength along a polyline using the sampler.
 *
 * Returns a cumulative-arclength array of length pts.length,
 * where arcLen[0] = 0 and arcLen[i] = 3D distance from pts[0] to pts[i].
 */
function cumulativeArcLen(
  pts: readonly StationPoint[],
  sampler: SurfaceSampler,
): Float64Array {
  const arc = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) {
    const a = sampler.position(pts[i - 1].u, pts[i - 1].t);
    const b = sampler.position(pts[i].u, pts[i].t);
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    arc[i] = arc[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return arc;
}

/**
 * Linearly interpolate (u,t) between two station points at parameter alpha ∈ [0,1].
 */
function lerpPt(a: StationPoint, b: StationPoint, alpha: number): StationPoint {
  return {
    u: a.u + (b.u - a.u) * alpha,
    t: a.t + (b.t - a.t) * alpha,
  };
}

/**
 * Given a polyline with its cumulative arclength, find the (u,t) point at target
 * arclength `s` (clamped to [0, totalLen]).  Returns the rail vertex unchanged when
 * the target falls exactly on a vertex (for anchor preservation).
 */
function sampleAtArcLen(
  pts: readonly StationPoint[],
  arc: Float64Array,
  s: number,
): StationPoint {
  if (s <= arc[0]) return pts[0];
  const last = arc.length - 1;
  if (s >= arc[last]) return pts[last];

  // Binary search for the segment containing s.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] <= s) lo = mid;
    else hi = mid;
  }

  const segLen = arc[hi] - arc[lo];
  if (segLen < 1e-15) return pts[lo];
  const alpha = (s - arc[lo]) / segLen;
  return lerpPt(pts[lo], pts[hi], alpha);
}

/**
 * Correspond each foot rail vertex to the nearest-arclength crest rail vertex.
 *
 * Strategy:
 *   - Compute cumulative arclength of both rails.
 *   - For each foot vertex, find its normalised arc-position (fraction of total
 *     foot length) and map it to the same fraction along the crest arclength,
 *     then snap to the nearest crest vertex.
 *
 * This is robust for parallel rails with matched length and for cases where the
 * rails have different vertex counts (the brief says "nearest-arclength").
 */
function correspondRails(
  foot: readonly StationPoint[],
  crest: readonly StationPoint[],
  footArc: Float64Array,
  crestArc: Float64Array,
): number[] {
  const footTotal = footArc[footArc.length - 1];
  const crestTotal = crestArc[crestArc.length - 1];
  const crestIndices: number[] = [];

  for (let fi = 0; fi < foot.length; fi++) {
    // Normalised position along the foot rail.
    const frac = footTotal > 0 ? footArc[fi] / footTotal : fi / Math.max(1, foot.length - 1);
    // Target arclength on crest.
    const crestTarget = frac * crestTotal;
    // Find nearest crest vertex by arclength.
    let best = 0;
    let bestDist = Math.abs(crestArc[0] - crestTarget);
    for (let ci = 1; ci < crest.length; ci++) {
      const d = Math.abs(crestArc[ci] - crestTarget);
      if (d < bestDist) {
        bestDist = d;
        best = ci;
      }
    }
    crestIndices.push(best);
  }
  return crestIndices;
}

/**
 * Build cross-band (w) points from footPt to crestPt, sampling by 3D arclength
 * at targetEdgeMm intervals.  The first point is footPt and the last is crestPt
 * (exact, for anchor preservation).
 */
function buildCrossBandRow(
  footPt: StationPoint,
  crestPt: StationPoint,
  sampler: SurfaceSampler,
  targetEdgeMm: number,
): StationPoint[] {
  // Build a dense scratch polyline between footPt and crestPt.
  // We interpolate linearly in (u,t) — on a smooth surface this gives a geodesic
  // approximation sufficient for metric sizing.  Specifically, for a band
  // subtending ≤ π/2 in u the under-approximation of true 3D arclength is
  // ≤ ~10%, well within the ±25% budget; wider bands would need geodesic
  // integration.
  const SCRATCH_STEPS = 64;
  const scratch: StationPoint[] = [];
  for (let i = 0; i <= SCRATCH_STEPS; i++) {
    const alpha = i / SCRATCH_STEPS;
    scratch.push(lerpPt(footPt, crestPt, alpha));
  }
  const arc = cumulativeArcLen(scratch, sampler);
  const totalLen = arc[arc.length - 1];

  if (totalLen < 1e-9) {
    // Degenerate row (foot === crest in 3D).
    return [footPt, crestPt];
  }

  // Number of equal-length segments that fit within the cross-band.
  const nSeg = Math.max(1, Math.round(totalLen / targetEdgeMm));

  const w: StationPoint[] = [footPt];
  for (let k = 1; k < nSeg; k++) {
    const s = (k / nSeg) * totalLen;
    w.push(sampleAtArcLen(scratch, arc, s));
  }
  w.push(crestPt);
  return w;
}

/**
 * Build a metric-sized cross-band station grid between foot and crest rail polylines.
 *
 * Rows are placed at foot rail vertices whose 3D arclength spacing along the foot
 * is ≈ targetEdgeMm.  The foot rail vertices are used as row anchors directly —
 * no new points are inserted along the rails.  Cross-band interior points are
 * inserted fresh per row.
 *
 * @param foot         Input foot rail polyline (≥2 points).
 * @param crest        Input crest rail polyline (≥2 points).
 * @param sampler      Surface position evaluator.
 * @param targetEdgeMm Target 3D edge length in mm.
 */
export function buildStations(
  foot: readonly StationPoint[],
  crest: readonly StationPoint[],
  sampler: SurfaceSampler,
  targetEdgeMm: number,
): StationGrid {
  if (foot.length < 2 || crest.length < 2) {
    return { rows: [] };
  }

  // Fail-fast: rail vertex spacing must be ≤ targetEdgeMm/2 so that the
  // nearest-vertex snap stays within the ±25% along-s tolerance.
  // Real DP-simplified rails (long straight segments) will violate this;
  // densify the rail before calling buildStations (Task 5).
  const halfTarget = targetEdgeMm / 2;
  for (const [railName, rail] of [['foot', foot], ['crest', crest]] as const) {
    for (let i = 1; i < rail.length; i++) {
      const a = sampler.position(rail[i - 1].u, rail[i - 1].t);
      const b = sampler.position(rail[i].u, rail[i].t);
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const spacing = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (spacing > halfTarget) {
        throw new Error(
          `bandRemesh.buildStations: ${railName} rail vertex spacing ${spacing.toFixed(3)}mm` +
          ` exceeds targetEdgeMm/2 = ${halfTarget.toFixed(3)}mm` +
          ` — densify the rail before paving`,
        );
      }
    }
  }

  // Compute cumulative arclength along both rails.
  const footArc = cumulativeArcLen(foot, sampler);
  const crestArc = cumulativeArcLen(crest, sampler);

  // Correspond each foot vertex to a crest vertex by nearest arclength fraction.
  const footToCrest = correspondRails(foot, crest, footArc, crestArc);

  // Select foot vertices whose spacing along the foot rail is ≈ targetEdgeMm.
  // Strategy: for each integer multiple of targetEdgeMm along the foot arclength,
  // snap to the nearest actual foot vertex.  Always include the first and last vertices.
  const footTotal = footArc[footArc.length - 1];
  const nSeg = Math.max(1, Math.round(footTotal / targetEdgeMm));

  const selectedFootIndices: number[] = [];
  for (let k = 0; k <= nSeg; k++) {
    const targetS = (k / nSeg) * footTotal;
    // Find the foot vertex nearest to targetS.
    let best = 0;
    let bestDist = Math.abs(footArc[0] - targetS);
    for (let fi = 1; fi < foot.length; fi++) {
      const d = Math.abs(footArc[fi] - targetS);
      if (d < bestDist) {
        bestDist = d;
        best = fi;
      }
    }
    // Avoid duplicates.
    if (selectedFootIndices.length === 0 || selectedFootIndices[selectedFootIndices.length - 1] !== best) {
      selectedFootIndices.push(best);
    }
  }
  // Guarantee first and last are included.
  if (selectedFootIndices[0] !== 0) selectedFootIndices.unshift(0);
  if (selectedFootIndices[selectedFootIndices.length - 1] !== foot.length - 1) {
    selectedFootIndices.push(foot.length - 1);
  }

  // Build rows.
  const rows: StationRow[] = [];
  const firstRowArc = footArc[selectedFootIndices[0]];

  for (const fi of selectedFootIndices) {
    const footPt = foot[fi];
    const ci = footToCrest[fi];
    const crestPt = crest[ci];

    const rowS = footArc[fi] - firstRowArc;

    const w = buildCrossBandRow(footPt, crestPt, sampler, targetEdgeMm);

    rows.push({
      s: rowS,
      footPt,
      crestPt,
      w,
    });
  }

  return { rows };
}
