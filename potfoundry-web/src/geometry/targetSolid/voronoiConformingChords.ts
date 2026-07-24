import {
  voronoiBisectorSegmentsUv,
  type UvSegment,
  type VoronoiLatticeParams,
} from './voronoiBisectorGuides';
import type { ConformingChord } from './annularSolidReferenceTessellation';

/*
 * STRATA-001 S2 — chord-chain assembly for the Voronoi order-1 bisector graph
 * (the increment `voronoiBisectorGuides.ts` declares as "next": grid-station
 * snapping and chord-chain assembly for conformingChordsByPatch).
 *
 * WHY: measured at S0 (E-2026-07-24-STRATA001-S0-CORRECTION), a UNIFORM
 * reference tessellation cannot certify Voronoi at any legal density — it is
 * still short at the 262,144 tri/patch snapshot cap, because it spends
 * triangles evenly while the residual lives on the bisector graph. The
 * certified exemplars that DO work (GothicArches, WaveInterference at full
 * defaults) all use a COARSE base grid plus stations/chords placed ON the
 * features. This module supplies that placement for Voronoi.
 *
 * AUTHORITY (spec §4): the graph and these chords are heuristic f64 and
 * UNTRUSTED. A missed locus costs triangles; a false locus costs triangles.
 * Neither can produce an unsound bound — the validated screen remains the only
 * authority, and the certificate never cites a chord. That is what licenses the
 * f64 snapping below.
 *
 * CONTRACT satisfied (annularSolidReferenceTessellation:76-92): both endpoints
 * are exact rationals over one `denominator`, and each lies ON a grid line (an
 * angular column or a vertical row) so splitting a cell is a pure boundary
 * walk. Conformity comes from the CHAIN — an interior chain vertex is shared
 * verbatim by both adjacent chords — and the exact partition kernel refuses any
 * inconsistent chain as a T-junction.
 */

export interface VoronoiChordOptions {
  /** log2 of the patch's angular division count (must match the tessellation). */
  readonly angularDivisionsLog2: number;
  /** log2 of the patch's vertical division count (must match the tessellation). */
  readonly verticalDivisionsLog2: number;
  /**
   * log2 of the shared chord denominator. Grid coordinates stay exact because
   * both grids are dyadic and divide 2^chordFractionBits; the FREE coordinate
   * of each endpoint is snapped to this resolution. Keep it well above both
   * grid exponents so the snap is a small fraction of a cell.
   */
  readonly chordFractionBits: number;
}

interface ChainPoint {
  /** Parameter along the source segment, for ordering. */
  readonly t: number;
  readonly uNumerator: number;
  readonly vNumerator: number;
}

const CROSSING_EPSILON = 1e-12;
/** Hard cap on emitted chords (Set-cap discipline); the tessellator's own limit is 4096*64. */
const MAX_CHORDS = 4_096 * 64;

function clampNumerator(value: number, denominator: number): number {
  const rounded = Math.round(value);
  if (rounded < 0) return 0;
  if (rounded > denominator) return denominator;
  return rounded;
}

/**
 * Every crossing of one bisector segment with the patch grid, as exact
 * numerators over `denominator`. The crossed axis is EXACT; the free axis is
 * snapped. Points before the first and after the last crossing are not emitted:
 * a chord endpoint must lie on a grid line, and a raw Voronoi vertex does not.
 */
function segmentCrossings(
  segment: UvSegment,
  denominator: number,
  angularCells: number,
  verticalCells: number,
  uStep: number,
  vStep: number
): ChainPoint[] {
  const [u0, v0] = segment.a;
  const [u1, v1] = segment.b;
  const du = u1 - u0;
  const dv = v1 - v0;
  const points: ChainPoint[] = [];

  if (du !== 0) {
    const lo = Math.ceil(Math.min(u0, u1) * angularCells - CROSSING_EPSILON);
    const hi = Math.floor(Math.max(u0, u1) * angularCells + CROSSING_EPSILON);
    for (let k = lo; k <= hi; k += 1) {
      if (k < 0 || k > angularCells) continue;
      const t = (k / angularCells - u0) / du;
      if (t < 0 || t > 1) continue;
      points.push({
        t,
        uNumerator: k * uStep,
        vNumerator: clampNumerator((v0 + t * dv) * denominator, denominator),
      });
    }
  }
  if (dv !== 0) {
    const lo = Math.ceil(Math.min(v0, v1) * verticalCells - CROSSING_EPSILON);
    const hi = Math.floor(Math.max(v0, v1) * verticalCells + CROSSING_EPSILON);
    for (let m = lo; m <= hi; m += 1) {
      if (m < 0 || m > verticalCells) continue;
      const t = (m / verticalCells - v0) / dv;
      if (t < 0 || t > 1) continue;
      points.push({
        t,
        uNumerator: clampNumerator((u0 + t * du) * denominator, denominator),
        vNumerator: m * vStep,
      });
    }
  }

  points.sort((a, b) => a.t - b.t);
  // A segment through a grid CORNER is found by both loops; they agree exactly
  // (each snaps the other's exact coordinate back to itself), so dedupe on the
  // numerator pair rather than on t.
  const deduped: ChainPoint[] = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (
      previous !== undefined &&
      previous.uNumerator === point.uNumerator &&
      previous.vNumerator === point.vNumerator
    ) {
      continue;
    }
    deduped.push(point);
  }
  return deduped;
}

/**
 * Merge runs of consecutive points that share a column or a row into a single
 * representative, so the chain steps strictly diagonally. Without this a
 * near-axis-aligned stretch emits chords that lie along a grid line; those are
 * dropped as redundant and would leave a hole in the chain.
 */
function collapseRuns(points: readonly ChainPoint[]): ChainPoint[] {
  const result: ChainPoint[] = [];
  let index = 0;
  while (index < points.length) {
    let runEnd = index;
    while (
      runEnd + 1 < points.length &&
      (points[runEnd + 1].uNumerator === points[index].uNumerator ||
        points[runEnd + 1].vNumerator === points[index].vNumerator)
    ) {
      runEnd += 1;
    }
    result.push(points[runEnd]);
    index = runEnd + 1;
  }
  return result;
}

/**
 * Assemble `conformingChordsByPatch` chords tracking the exact order-1 Voronoi
 * bisector graph over the outer wall's (u,v) domain.
 */
export function assembleVoronoiConformingChords(
  params: VoronoiLatticeParams,
  options: VoronoiChordOptions
): ConformingChord[] {
  const { angularDivisionsLog2, verticalDivisionsLog2, chordFractionBits } = options;
  if (
    chordFractionBits < angularDivisionsLog2 ||
    chordFractionBits < verticalDivisionsLog2
  ) {
    throw new RangeError(
      'chordFractionBits must be at least as large as both grid exponents so grid lines stay exact'
    );
  }
  const denominator = 2 ** chordFractionBits;
  const angularCells = 2 ** angularDivisionsLog2;
  const verticalCells = 2 ** verticalDivisionsLog2;
  const uStep = denominator / angularCells;
  const vStep = denominator / verticalCells;

  // Seam rule: an endpoint strictly inside the first or last angular column is
  // refused by the exact partition kernel. Such a point breaks its chain.
  const seamRefused = (uNumerator: number): boolean =>
    (uNumerator > 0 && uNumerator < uStep) ||
    (uNumerator > denominator - uStep && uNumerator < denominator);

  const chords: ConformingChord[] = [];
  let truncated = false;

  for (const segment of voronoiBisectorSegmentsUv(params)) {
    const crossings = collapseRuns(
      segmentCrossings(segment, denominator, angularCells, verticalCells, uStep, vStep)
    );
    for (let index = 0; index + 1 < crossings.length; index += 1) {
      const start = crossings[index];
      const end = crossings[index + 1];
      if (seamRefused(start.uNumerator) || seamRefused(end.uNumerator)) continue;
      // Degenerate, or lying along a grid line: already a grid edge, no cut needed.
      if (start.uNumerator === end.uNumerator || start.vNumerator === end.vNumerator) {
        continue;
      }
      if (chords.length >= MAX_CHORDS) {
        truncated = true;
        break;
      }
      chords.push({
        denominator: String(denominator),
        start: {
          uNumerator: String(start.uNumerator),
          vNumerator: String(start.vNumerator),
        },
        end: { uNumerator: String(end.uNumerator), vNumerator: String(end.vNumerator) },
      });
    }
    if (truncated) break;
  }
  if (truncated) {
    throw new RangeError(
      `Voronoi conforming chords exceeded the ${MAX_CHORDS} cap — coarsen the grid or the lattice`
    );
  }
  return chords;
}
