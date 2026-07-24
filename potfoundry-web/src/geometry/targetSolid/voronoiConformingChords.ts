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
  /**
   * δ-merge radius in chord numerator units. Chain vertices closer than this on
   * the same grid line collapse to one shared vertex (Voronoi junctions landing
   * near a grid line). Defaults to denominator / 4096 ≈ 2.4e-4 in UV at 2^16 —
   * far below a lattice cell, far above a snap collision.
   */
  readonly deltaMergeNumerators?: number;
  /**
   * Keep at most one chord per grid cell (default true). Where three Voronoi
   * cells meet, the junction sits INSIDE a cell and the incident bisectors cross
   * there; the tessellator's per-cell boundary walk then produces overlapping
   * sub-polygons and the partition verifier rejects the patch
   * ("Parameter triangles overlap, cross, contain, partially share an edge, or
   * form a T-junction"). Proper handling emits all incident chords terminating
   * at ONE shared interior chain vertex — the tessellator supports interior
   * endpoints — which is the next increment. Until then a junction cell keeps
   * one branch and the other branches go unconformed there.
   */
  readonly oneChordPerCell?: boolean;
  /** Diagnostic: assemble only the first N bisector segments. */
  readonly segmentLimit?: number;
}

export interface VoronoiChordAssembly {
  readonly chords: readonly ConformingChord[];
  /** Chords dropped because their cell already held one (junction cells). */
  readonly droppedToJunctions: number;
  /** Cells that wanted more than one chord — the junction-cell census. */
  readonly contestedCells: number;
}

interface ChainPoint {
  /** Parameter along the source segment, for ordering. */
  readonly t: number;
  uNumerator: number;
  vNumerator: number;
  /** Which axis is EXACT (on a grid line); the other is snapped. */
  exact: 'u' | 'v' | 'both';
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
      const vNumerator = clampNumerator((v0 + t * dv) * denominator, denominator);
      points.push({
        t,
        uNumerator: k * uStep,
        vNumerator,
        exact: vNumerator % vStep === 0 ? 'both' : 'u',
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
      const uNumerator = clampNumerator((u0 + t * du) * denominator, denominator);
      points.push({
        t,
        uNumerator,
        vNumerator: m * vStep,
        exact: uNumerator % uStep === 0 ? 'both' : 'v',
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
 * δ-merge (spec failure-mode #4). Where three Voronoi cells meet, the junction
 * can land within a hair of a grid line, and the two incident bisectors then
 * snap to chain vertices a few numerator units apart. The exact partition
 * kernel sees those as two distinct cut points on one cell edge — a micro-sliver
 * and a T-junction risk. Merging is done PER GRID INTERVAL so no point can be
 * pushed across a grid line (which would change which cell it bounds), and it
 * prefers an exact grid CORNER as the representative when one is present.
 */
function mergeChainVertices(
  groups: readonly ChainPoint[][],
  delta: number,
  uStep: number,
  vStep: number
): void {
  // Pass 1 — CORNER CAPTURE. A bisector passing within δ of a grid corner snaps
  // onto it. Corners are the strongest attractors: a second bisector crossing
  // the same line at the corner is already exact there, and interval-bucketed
  // clustering alone would never compare the two (they fall either side of the
  // line). This is the case that actually fires on the default lattice.
  for (const group of groups) {
    for (const point of group) {
      if (point.exact === 'u') {
        const nearest = Math.round(point.vNumerator / vStep) * vStep;
        if (Math.abs(point.vNumerator - nearest) <= delta) {
          point.vNumerator = nearest;
          point.exact = 'both';
        }
      } else if (point.exact === 'v') {
        const nearest = Math.round(point.uNumerator / uStep) * uStep;
        if (Math.abs(point.uNumerator - nearest) <= delta) {
          point.uNumerator = nearest;
          point.exact = 'both';
        }
      }
    }
  }

  // Pass 2 — cluster the remaining non-corner vertices per grid line.
  const byLine = new Map<string, ChainPoint[]>();
  for (const group of groups) {
    for (const point of group) {
      if (point.exact === 'both') continue;
      // Key: the exact grid line PLUS the interval index on the free axis, so a
      // cluster can never straddle a grid line.
      const key =
        point.exact === 'u'
          ? `u:${point.uNumerator}:${Math.floor(point.vNumerator / vStep)}`
          : `v:${point.vNumerator}:${Math.floor(point.uNumerator / uStep)}`;
      const bucket = byLine.get(key);
      if (bucket === undefined) byLine.set(key, [point]);
      else bucket.push(point);
    }
  }
  for (const bucket of byLine.values()) {
    if (bucket.length < 2) continue;
    const freeOf = (p: ChainPoint): number =>
      p.exact === 'u' ? p.vNumerator : p.uNumerator;
    bucket.sort((a, b) => freeOf(a) - freeOf(b));
    let clusterStart = 0;
    const flush = (endExclusive: number): void => {
      if (endExclusive - clusterStart < 2) return;
      let sum = 0;
      for (let i = clusterStart; i < endExclusive; i += 1) sum += freeOf(bucket[i]);
      const representative = Math.round(sum / (endExclusive - clusterStart));
      for (let i = clusterStart; i < endExclusive; i += 1) {
        if (bucket[i].exact === 'u') bucket[i].vNumerator = representative;
        else bucket[i].uNumerator = representative;
      }
    };
    for (let i = 1; i < bucket.length; i += 1) {
      if (freeOf(bucket[i]) - freeOf(bucket[i - 1]) > delta) {
        flush(i);
        clusterStart = i;
      }
    }
    flush(bucket.length);
  }
}

/**
 * Assemble `conformingChordsByPatch` chords tracking the exact order-1 Voronoi
 * bisector graph over the outer wall's (u,v) domain.
 */
export function assembleVoronoiConformingChords(
  params: VoronoiLatticeParams,
  options: VoronoiChordOptions
): VoronoiChordAssembly {
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
  const deltaMerge = options.deltaMergeNumerators ?? Math.max(1, denominator / 4_096);

  const onColumn = (uNumerator: number): boolean => uNumerator % uStep === 0;
  const onRow = (vNumerator: number): boolean => vNumerator % vStep === 0;
  /*
   * Two kernel rules make an endpoint illegal (annularSolidReferenceTessellation
   * :1024-1043), and BOTH bite here because a snapped coordinate is almost never
   * a station:
   *  - boundary row (v=0 or v=1): u must be exactly an angular station, else the
   *    junction weld with the neighbouring patch carries a T-junction;
   *  - seam column (u=0 or u=1): the point must be a GRID CORNER — the periodic
   *    weld copies the u=0 column, so only a corner is shared by construction.
   * A refused point does not merely get dropped: it SPLITS its chain, so the
   * remaining chords still lie on the bisector.
   */
  const endpointRefused = (uNumerator: number, vNumerator: number): boolean => {
    const onBoundaryRow = vNumerator === 0 || vNumerator === denominator;
    const onSeamColumn = uNumerator === 0 || uNumerator === denominator;
    if (onBoundaryRow && !onColumn(uNumerator)) return true;
    if (onSeamColumn && !onBoundaryRow && !onRow(vNumerator)) return true;
    return false;
  };

  const chords: ConformingChord[] = [];
  let truncated = false;
  let droppedToJunctions = 0;
  const claimedCells = new Set<number>();
  const oneChordPerCell = options.oneChordPerCell ?? true;

  /*
   * The single grid cell a chord cuts, taken from its MIDPOINT. Endpoint-set
   * intersection is ambiguous when both ends sit on grid lines (a corner belongs
   * to four cells), and picking the wrong candidate silently lets two chords
   * share a cell. The midpoint of a chord lies strictly inside the cell it cuts,
   * so it names that cell uniquely.
   */
  const cellOfChord = (start: ChainPoint, end: ChainPoint): number | null => {
    const midU = (start.uNumerator + end.uNumerator) / 2;
    const midV = (start.vNumerator + end.vNumerator) / 2;
    const uCell = Math.floor(midU / uStep);
    const vCell = Math.floor(midV / vStep);
    if (uCell < 0 || uCell >= angularCells || vCell < 0 || vCell >= verticalCells) {
      return null;
    }
    return vCell * angularCells + uCell;
  };

  // CONSECUTIVE crossings only: two successive crossings of a straight segment
  // lie on the boundary of exactly ONE cell — the one the segment traverses
  // between them — which is precisely the kernel's "endpoints bound one common
  // cell" requirement. Skipping any intermediate crossing would span several
  // cells and be refused.
  const sourceSegments = voronoiBisectorSegmentsUv(params);
  const perSegment = (
    options.segmentLimit === undefined
      ? sourceSegments
      : sourceSegments.slice(0, options.segmentLimit)
  ).map((segment) =>
    segmentCrossings(segment, denominator, angularCells, verticalCells, uStep, vStep)
  );
  mergeChainVertices(perSegment, deltaMerge, uStep, vStep);

  /*
   * ANCHOR THE CHAIN ENDS (kernel :1087-1089 — "every maximal chain must reach
   * the grid at both extremes", and interior vertices must be degree-2).
   *
   * Interior crossings are safe: chord i ends where chord i+1 begins, so both
   * cells sharing that edge carry the vertex. The two chain EXTREMES are not —
   * the cell on the far side of that edge has no matching vertex, which is
   * exactly the "T-junction" the partition verifier rejects (measured: a single
   * segment's 3-chord chain already fails).
   *
   * A grid CORNER is already a vertex of all four cells around it, so anchoring
   * each extreme to the nearest corner OF THE CELL THAT CHORD ALREADY BOUNDS
   * introduces no new vertex and keeps the chord inside its cell. Cost: the
   * first and last chord of each chain leave the exact bisector by up to half a
   * cell. Chains are ~32 columns long at scale 8 / angular 2^8, so this is a few
   * percent of the crease length — and it is a BUDGET lever, never soundness.
   *
   * (Terminating instead at the true Voronoi vertex is impossible here: three
   * bisectors meet there, and the kernel requires degree-2 interior vertices.)
   */
  const cornerOfCell = (
    cell: number,
    point: ChainPoint,
    neighbour: ChainPoint
  ): ChainPoint => {
    const uCell = cell % angularCells;
    const vCell = (cell - uCell) / angularCells;
    const candidates: Array<readonly [number, number]> = [];
    for (const u of [uCell * uStep, (uCell + 1) * uStep]) {
      for (const v of [vCell * vStep, (vCell + 1) * vStep]) candidates.push([u, v]);
    }
    // A corner sharing a coordinate with the neighbouring chain point would make
    // the end chord run ALONG a grid line; that chord is redundant and gets
    // skipped, which orphans the neighbour and reintroduces the T-junction.
    // Every corner of the cell bounds it, so simply prefer one that does not.
    const safe = candidates.filter(
      ([u, v]) => u !== neighbour.uNumerator && v !== neighbour.vNumerator
    );
    const pool = safe.length > 0 ? safe : candidates;
    let best = pool[0];
    let bestDistance = Infinity;
    for (const candidate of pool) {
      const du = candidate[0] - point.uNumerator;
      const dv = candidate[1] - point.vNumerator;
      const distance = du * du + dv * dv;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return { t: point.t, uNumerator: best[0], vNumerator: best[1], exact: 'both' };
  };

  /*
   * Emit ONE run of consecutive crossings as a chain, or report the chord index
   * that made it impossible. A chain is all-or-nothing: dropping a single chord
   * re-orphans the vertex it shared with its neighbour — the very T-junction the
   * corner anchoring exists to prevent. Works on a COPY so a failed attempt
   * leaves the source crossings untouched for the retry.
   */
  const emitRun = (source: readonly ChainPoint[]): { emitted: boolean; failedAt: number } => {
    if (source.length < 3) return { emitted: false, failedAt: 0 };
    const points = source.map((point) => ({ ...point }));
    const firstCell = cellOfChord(points[0], points[1]);
    if (firstCell !== null) points[0] = cornerOfCell(firstCell, points[0], points[1]);
    const last = points.length - 1;
    const lastCell = cellOfChord(points[last - 1], points[last]);
    if (lastCell !== null) {
      points[last] = cornerOfCell(lastCell, points[last], points[last - 1]);
    }

    const pending: ConformingChord[] = [];
    const pendingCells: number[] = [];
    for (let index = 0; index + 1 < points.length; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (
        endpointRefused(start.uNumerator, start.vNumerator) ||
        endpointRefused(end.uNumerator, end.vNumerator)
      ) {
        return { emitted: false, failedAt: index };
      }
      if (start.uNumerator === end.uNumerator && start.vNumerator === end.vNumerator) {
        continue;
      }
      // Along a grid line: refused by the kernel (:1045-1050) and unskippable
      // (skipping orphans both endpoints). Corner selection avoids creating one.
      if (
        (start.uNumerator === end.uNumerator &&
          onColumn(start.uNumerator) &&
          onColumn(end.uNumerator)) ||
        (start.vNumerator === end.vNumerator && onRow(start.vNumerator) && onRow(end.vNumerator))
      ) {
        return { emitted: false, failedAt: index };
      }
      const cell = cellOfChord(start, end);
      // The run's OWN cells count too: corner anchoring can pull an end chord
      // into the cell its neighbour already cuts.
      if (
        cell === null ||
        (oneChordPerCell && (claimedCells.has(cell) || pendingCells.includes(cell)))
      ) {
        return { emitted: false, failedAt: index };
      }
      pendingCells.push(cell);
      pending.push({
        denominator: String(denominator),
        start: {
          uNumerator: String(start.uNumerator),
          vNumerator: String(start.vNumerator),
        },
        end: { uNumerator: String(end.uNumerator), vNumerator: String(end.vNumerator) },
      });
    }
    if (pending.length === 0) return { emitted: false, failedAt: 0 };
    if (chords.length + pending.length > MAX_CHORDS) {
      truncated = true;
      return { emitted: false, failedAt: -1 };
    }
    for (const cell of pendingCells) claimedCells.add(cell);
    chords.push(...pending);
    return { emitted: true, failedAt: -1 };
  };

  for (const crossings of perSegment) {
    /*
     * SPLIT, DON'T DISCARD. Chains collide near Voronoi junctions, where three
     * bisectors crowd into neighbouring cells. Rejecting the whole chain on the
     * first collision threw away 38% of chords at (8,7) and 59% at (9,8) — and
     * measurably left the crease beside the failing cell unconformed. Instead,
     * cut the chain at the offending chord and keep both sides: each surviving
     * run is re-anchored to grid corners at its own new ends, so it is a valid
     * standalone chain. Only the junction neighbourhood is lost.
     */
    let startIndex = 0;
    let guard = crossings.length + 2;
    while (startIndex + 2 < crossings.length && guard > 0 && !truncated) {
      guard -= 1;
      const result = emitRun(crossings.slice(startIndex));
      if (result.emitted || result.failedAt < 0) break;
      if (result.failedAt > 0) {
        // The prefix up to (not including) the bad chord is a chain of its own.
        const prefix = crossings.slice(startIndex, startIndex + result.failedAt + 1);
        if (!emitRun(prefix).emitted) droppedToJunctions += prefix.length - 1;
      }
      // Resume after the offending chord.
      startIndex += result.failedAt + 1;
    }
    if (truncated) break;
  }
  if (truncated) {
    throw new RangeError(
      `Voronoi conforming chords exceeded the ${MAX_CHORDS} cap — coarsen the grid or the lattice`
    );
  }
  return {
    chords,
    droppedToJunctions,
    contestedCells: droppedToJunctions === 0 ? 0 : claimedCells.size,
  };
}
