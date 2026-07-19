import type { ExactDyadicDomainPartitionInput } from './exactDyadicDomainPartition';
import {
  singlePatchAnnularRadialSolidTargetForProof,
  type AnnularRadialSolidPatchId,
  type AnnularRadialSolidTargetProgram,
  type AtlasJunctionCopy,
  type MultiPatchAtlasComplex,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from './singlePatchAnnularRadialSolidTarget';

/**
 * Certification-first reference tessellation of the authenticated six-patch
 * annular radial solid atlas.
 *
 * This is a candidate GENERATOR, not proof machinery: it meshes each patch on
 * a uniform exact-dyadic grid, welds every shared boundary to bitwise-equal
 * coordinates by evaluating each junction row once from its declared owner
 * patch, and emits (a) final binary-STL bytes and (b) the exact dyadic
 * triangle-to-parameter partitions the continuous mapped-distance proof
 * consumes. Whether the result actually meets a tolerance is decided solely
 * by `proveFinalStlMappedGeometryAndStructure` on the serialized bytes.
 *
 * Welding invariants relied on by the topology proof:
 * - per patch, the u=1 column reuses the u=0 column's evaluated coordinates
 *   (periodic identification);
 * - each of the six declared junctions copies the owner patch's boundary row
 *   into the neighbour row, applying the atlas's exact station reversal
 *   (i -> nU - i) where the junction reverses the free parameter;
 * - STL vertex order per triangle equals the CCW parameter-cell vertex order,
 *   which the atlas's baked-in parameter reversals turn into material-outward
 *   winding on every patch.
 */
/**
 * Explicit non-uniform vertical stations for one patch: strictly increasing
 * integer numerators over 2^log2Denominator, starting at 0 and ending at
 * 2^log2Denominator. Lets a patch spend rows where its target needs them
 * (e.g. geometrically refined toward a styled edge) while every station
 * stays exactly dyadic for the partition proof.
 *
 * U3b: a ladder may additionally carry an odd denominator factor q >= 3, in
 * which case numerators run 0..q*2^log2Denominator and stations are the
 * exact rationals numerator / (q * 2^log2Denominator) — so feature stations
 * k/N with N not a power of two sit EXACTLY on cell boundaries. Rational
 * ladders are supported on the shared ANGULAR stations only; the partition
 * proof consumes the factor through its own exact-rational coordinate layer.
 */
export interface VerticalStationLadder {
  readonly log2Denominator: number;
  readonly numerators: readonly number[];
  readonly oddDenominatorFactor?: number;
}

/**
 * One straight conforming feature line a*u + b*v = c with exact integer
 * coefficients (U5 spike). Cells the line strictly crosses are split along
 * the EXACT line so no emitted triangle straddles it — the tessellation-side
 * unlock for diagonal jump/kink lines that axis-aligned station grids can
 * never avoid. Restrictions enforced fail-closed: a and b nonzero (use
 * angular/vertical stations for axis-aligned lines), all lines of one patch
 * pairwise parallel (line-line intersections would leave the exact-rational
 * envelope), boundary-row crossings must land exactly on angular stations
 * (junction welds stay T-junction-free), and periodic-seam interior
 * crossings are refused this slice.
 */
export interface ConformingFeatureLine {
  readonly aNumerator: number;
  readonly bNumerator: number;
  readonly cNumerator: number;
}

export interface ConformingChordPoint {
  readonly uNumerator: string;
  readonly vNumerator: string;
}

/**
 * One exact chord of a curved guide polyline (U5 curved extension). Both
 * endpoints are exact rationals over `denominator` and must lie ON grid
 * lines of the patch (an angular station column or a vertical station row) —
 * chords therefore need no intersection divisions at all: splitting a cell
 * by a chord is a pure boundary walk between two on-boundary points.
 * Conformity across cells comes from the CHAIN: an interior chain vertex is
 * shared verbatim by the two adjacent cells' chords, and the exact partition
 * kernel refuses any inconsistent chain as a T-junction. Endpoints on the
 * v=0/v=1 boundary rows must sit exactly on angular stations (junction
 * safety); endpoints strictly inside the periodic seam columns are refused.
 */
export interface ConformingChord {
  readonly denominator: string;
  readonly start: ConformingChordPoint;
  readonly end: ConformingChordPoint;
}

export interface AnnularSolidReferenceTessellationOptions {
  /** log2 of the shared angular division count (all patches use 2^a cells in u). */
  readonly angularDivisionsLog2: number;
  /** log2 of each patch's uniform vertical division count (2^b cells in v). */
  readonly verticalDivisionsLog2ByPatch: Readonly<
    Record<AnnularRadialSolidPatchId, number>
  >;
  /** Optional per-patch non-uniform station ladders overriding the uniform grid. */
  readonly verticalStationsByPatch?: Readonly<
    Partial<Record<AnnularRadialSolidPatchId, VerticalStationLadder>>
  >;
  /**
   * Optional shared non-uniform ANGULAR stations (overrides the uniform
   * angular grid). The atlas's junction welds reverse the free parameter, so
   * the ladder must be symmetric under numerator -> 2^log2Denominator -
   * numerator; the reversed station of index i is then index count-1-i.
   */
  readonly angularStations?: VerticalStationLadder;
  /** Optional per-patch parallel conforming feature lines (see ConformingFeatureLine). */
  readonly conformingLinesByPatch?: Readonly<
    Partial<Record<AnnularRadialSolidPatchId, readonly ConformingFeatureLine[]>>
  >;
  /** Optional per-patch curved guide-polyline chords (see ConformingChord). */
  readonly conformingChordsByPatch?: Readonly<
    Partial<Record<AnnularRadialSolidPatchId, readonly ConformingChord[]>>
  >;
}

/**
 * Build a shared symmetric angular ladder: a uniform 2^uniformLog2 grid
 * unioned with each feature fraction (e.g. crease angles k/24) snapped to
 * the nearest dyadic station at 2^snapLog2, plus every mirror 1-s so the
 * atlas's reversed junctions weld station-for-station. Snapping error is
 * at most 2^-(snapLog2+1) in u.
 */
export function snappedFeatureAngularLadder(
  uniformLog2: number,
  featureFractions: readonly number[],
  snapLog2: number
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformLog2) ||
    uniformLog2 < 1 ||
    uniformLog2 > MAX_ANGULAR_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(snapLog2) ||
    snapLog2 < uniformLog2 ||
    snapLog2 > MAX_LADDER_LOG2_DENOMINATOR
  ) {
    invalid('snappedFeatureAngularLadder arguments are out of range');
  }
  const denominator = 1 << snapLog2;
  const stationSet = new Set<number>();
  const uniformStep = 1 << (snapLog2 - uniformLog2);
  for (let station = 0; station <= 1 << uniformLog2; station += 1) {
    stationSet.add(station * uniformStep);
  }
  for (const fraction of featureFractions) {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      invalid('feature fractions must lie in [0, 1]');
    }
    const snapped = Math.min(denominator, Math.max(0, Math.round(fraction * denominator)));
    stationSet.add(snapped);
    stationSet.add(denominator - snapped);
  }
  const numerators = [...stationSet].sort((left, right) => left - right);
  return Object.freeze({ log2Denominator: snapLog2, numerators: Object.freeze(numerators) });
}

/**
 * Build a shared symmetric angular ladder whose stations include every jump
 * fraction k/N EXACTLY (U3b). The denominator is q * 2^f with q the odd part
 * of N and f = max(uniformLog2, trailingZeros(N)) + extraDyadicBits, so both
 * the uniform grid and all N+1 feature stations are exact integers over it.
 * The ladder is symmetric under numerator -> denominator - numerator by
 * construction (the mirror of k/N is (N-k)/N), so reversed junction welds
 * stay station-exact.
 */
export function rationalFeatureAngularLadder(
  uniformLog2: number,
  jumpDenominator: number,
  extraDyadicBits = 0
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformLog2) ||
    uniformLog2 < 1 ||
    uniformLog2 > MAX_ANGULAR_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(jumpDenominator) ||
    jumpDenominator < 2 ||
    jumpDenominator > 1 << MAX_ANGULAR_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(extraDyadicBits) ||
    extraDyadicBits < 0
  ) {
    invalid('rationalFeatureAngularLadder arguments are out of range');
  }
  let trailingZeros = 0;
  let oddPart = jumpDenominator;
  while (oddPart % 2 === 0) {
    oddPart /= 2;
    trailingZeros += 1;
  }
  const log2Denominator = Math.max(uniformLog2, trailingZeros) + extraDyadicBits;
  if (log2Denominator > MAX_LADDER_LOG2_DENOMINATOR) {
    invalid('rationalFeatureAngularLadder denominator exceeds the ladder envelope');
  }
  const denominator = oddPart * 2 ** log2Denominator;
  const stationSet = new Set<number>();
  const uniformStep = denominator / 2 ** uniformLog2;
  for (let station = 0; station <= 1 << uniformLog2; station += 1) {
    stationSet.add(station * uniformStep);
  }
  const jumpStep = denominator / jumpDenominator;
  for (let jump = 0; jump <= jumpDenominator; jump += 1) {
    stationSet.add(jump * jumpStep);
  }
  const numerators = [...stationSet].sort((left, right) => left - right);
  if (numerators.length > MAX_LADDER_STATIONS) {
    invalid('rationalFeatureAngularLadder produces too many stations');
  }
  return Object.freeze({
    log2Denominator,
    numerators: Object.freeze(numerators),
    ...(oddPart === 1 ? {} : { oddDenominatorFactor: oddPart }),
  });
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

/** Exact UV point as integer numerators over one patch partition denominator. */
interface ExactUvPoint {
  readonly U: bigint;
  readonly V: bigint;
}

interface NormalizedConformingLine {
  /** Normalized so aNumerator > 0; the line is a*u + b*v = c in unit coords. */
  readonly aNumerator: number;
  readonly bNumerator: number;
  readonly cNumerator: number;
}

const LINE_COEFFICIENT_LIMIT = 1_048_576; // 2^20 — keeps s-values far inside BigInt comfort

function validateConformingLines(
  patchId: string,
  untrusted: readonly ConformingFeatureLine[]
): readonly NormalizedConformingLine[] {
  if (!Array.isArray(untrusted) || untrusted.length === 0) {
    invalid(`conformingLinesByPatch['${patchId}'] must be a non-empty array when present`);
  }
  if (untrusted.length > 4_096) {
    invalid(`conformingLinesByPatch['${patchId}'] carries too many lines`);
  }
  const lines: NormalizedConformingLine[] = [];
  for (const line of untrusted) {
    const { aNumerator, bNumerator, cNumerator } = line;
    for (const [value, label] of [
      [aNumerator, 'aNumerator'],
      [bNumerator, 'bNumerator'],
      [cNumerator, 'cNumerator'],
    ] as const) {
      if (!Number.isSafeInteger(value) || Math.abs(value) > LINE_COEFFICIENT_LIMIT) {
        invalid(
          `conformingLinesByPatch['${patchId}'].${label} must be an integer within ±${LINE_COEFFICIENT_LIMIT}`
        );
      }
    }
    if (aNumerator === 0 || bNumerator === 0) {
      invalid(
        `conformingLinesByPatch['${patchId}'] lines must be diagonal (a and b nonzero); axis-aligned jump lines belong on angular/vertical stations`
      );
    }
    // Normalize the sign so a > 0; the line itself is unchanged.
    const sign = aNumerator > 0 ? 1 : -1;
    lines.push({
      aNumerator: sign * aNumerator,
      bNumerator: sign * bNumerator,
      cNumerator: sign * cNumerator,
    });
  }
  // Pairwise parallel: line-line intersection points would carry compound
  // denominators outside the exact single-denominator envelope this slice.
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      if (
        BigInt(lines[left].aNumerator) * BigInt(lines[right].bNumerator) !==
        BigInt(lines[right].aNumerator) * BigInt(lines[left].bNumerator)
      ) {
        invalid(`conformingLinesByPatch['${patchId}'] lines must be pairwise parallel`);
      }
    }
  }
  return Object.freeze(lines);
}

function exactEdgeIntersection(
  from: ExactUvPoint,
  to: ExactUvPoint,
  a: bigint,
  b: bigint,
  cScaled: bigint
): ExactUvPoint {
  if (from.U === to.U) {
    const numerator = cScaled - a * from.U;
    if (numerator % b !== 0n) {
      invalid('conforming intersection left the exact single-denominator envelope');
    }
    return { U: from.U, V: numerator / b };
  }
  if (from.V === to.V) {
    const numerator = cScaled - b * from.V;
    if (numerator % a !== 0n) {
      invalid('conforming intersection left the exact single-denominator envelope');
    }
    return { U: numerator / a, V: from.V };
  }
  // Unreachable for pairwise-parallel families: a parallel line is exactly
  // sign-constant along any previous cut edge, so strict crossings only ever
  // happen on axis-aligned grid edges. Refuse fail-closed regardless.
  invalid('conforming line strictly crossed a non-axis-aligned edge');
}

/**
 * Split one convex CCW polygon by the line a*U + b*V = cScaled (exact). When
 * the line does not strictly separate the vertices the polygon is returned
 * unchanged; otherwise the two closed sides are returned, each carrying the
 * exact intersection points, so adjacent cells that compute the same
 * intersection on a shared grid edge stay conforming.
 */
function splitConvexByLine(
  points: readonly ExactUvPoint[],
  a: bigint,
  b: bigint,
  cScaled: bigint
): readonly (readonly ExactUvPoint[])[] {
  const signs = points.map((point) => a * point.U + b * point.V - cScaled);
  let anyPositive = false;
  let anyNegative = false;
  for (const sign of signs) {
    if (sign > 0n) anyPositive = true;
    else if (sign < 0n) anyNegative = true;
  }
  if (!anyPositive || !anyNegative) return [points];
  const positiveSide: ExactUvPoint[] = [];
  const negativeSide: ExactUvPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const sign = signs[index];
    const nextIndex = (index + 1) % points.length;
    if (sign >= 0n) positiveSide.push(point);
    if (sign <= 0n) negativeSide.push(point);
    const nextSign = signs[nextIndex];
    if ((sign > 0n && nextSign < 0n) || (sign < 0n && nextSign > 0n)) {
      const crossing = exactEdgeIntersection(point, points[nextIndex], a, b, cScaled);
      positiveSide.push(crossing);
      negativeSide.push(crossing);
    }
  }
  return [positiveSide, negativeSide].filter((side) => side.length >= 3);
}

function orientationBig(a: ExactUvPoint, b: ExactUvPoint, c: ExactUvPoint): bigint {
  return (b.U - a.U) * (c.V - a.V) - (b.V - a.V) * (c.U - a.U);
}

function pointsEqualUv(left: ExactUvPoint, right: ExactUvPoint): boolean {
  return left.U === right.U && left.V === right.V;
}

function onClosedSegmentUv(
  point: ExactUvPoint,
  from: ExactUvPoint,
  to: ExactUvPoint
): boolean {
  if (orientationBig(from, to, point) !== 0n) return false;
  const minU = from.U < to.U ? from.U : to.U;
  const maxU = from.U > to.U ? from.U : to.U;
  const minV = from.V < to.V ? from.V : to.V;
  const maxV = from.V > to.V ? from.V : to.V;
  return point.U >= minU && point.U <= maxU && point.V >= minV && point.V <= maxV;
}

function conformingPieceTriangles(
  pieces: readonly (readonly ExactUvPoint[])[],
  densePieces?: WeakSet<object>
): readonly (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] {
  const triangles: (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] = [];
  for (const piece of pieces) {
    // Pieces carrying interior-vertex chains triangulate by MAX-MIN-ANGLE
    // (exact-validity Klincsek-style DP): a fan from any single origin —
    // and even a minimal-LENGTH triangulation — emits thin slivers whose
    // three vertices all lie on one dense chain, long diagonals sagging off
    // the bending guide curve (measured 9,519,723 pm on the Gothic +0.002
    // offset curve). Maximizing the minimum angle prefers the fat cross
    // rungs between chains by construction. Legacy pieces keep the fan
    // path bit-for-bit.
    let fanned: (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] | null = null;
    if (densePieces !== undefined && densePieces.has(piece)) {
      fanned = maxMinAngleTriangulation(piece);
    }
    for (let originIndex = 0; originIndex < piece.length && fanned === null; originIndex += 1) {
      const origin = piece[originIndex];
      const candidate: (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] = [];
      let valid = true;
      for (let step = 1; step + 1 < piece.length && valid; step += 1) {
        const middle = piece[(originIndex + step) % piece.length];
        const last = piece[(originIndex + step + 1) % piece.length];
        if (orientationBig(origin, middle, last) <= 0n) {
          valid = false;
          break;
        }
        candidate.push([origin, middle, last]);
      }
      if (valid) fanned = candidate;
    }
    if (fanned === null) {
      // NON-convex pieces (possible since the interior-vertex chain
      // extension: a chain bulging into a piece leaves a reflex boundary
      // run) have no valid fan origin. Ear-clip with exact orientation
      // tests: strictly convex ears only, closed-triangle emptiness against
      // every remaining vertex, so no boundary vertex is ever dropped
      // (dropping one would hang it against the neighbouring piece).
      fanned = earClipSimplePolygon(piece);
    }
    if (fanned === null) {
      invalid('conforming split produced a degenerate or misoriented piece');
    }
    triangles.push(...fanned);
  }
  return triangles;
}

function earClipSimplePolygon(
  piece: readonly ExactUvPoint[]
): (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] | null {
  const working = [...piece];
  const clipped: (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] = [];
  let guard = piece.length * piece.length + 8;
  while (working.length > 3) {
    guard -= 1;
    if (guard <= 0) return null;
    let earIndex = -1;
    for (let index = 0; index < working.length; index += 1) {
      const previous = working[(index - 1 + working.length) % working.length];
      const current = working[index];
      const next = working[(index + 1) % working.length];
      if (orientationBig(previous, current, next) <= 0n) continue;
      let blocked = false;
      for (let other = 0; other < working.length && !blocked; other += 1) {
        if (
          other === index ||
          other === (index - 1 + working.length) % working.length ||
          other === (index + 1) % working.length
        ) {
          continue;
        }
        const point = working[other];
        if (
          orientationBig(previous, current, point) >= 0n &&
          orientationBig(current, next, point) >= 0n &&
          orientationBig(next, previous, point) >= 0n
        ) {
          blocked = true;
        }
      }
      if (blocked) continue;
      earIndex = index;
      break;
    }
    if (earIndex < 0) return null;
    const previous = working[(earIndex - 1 + working.length) % working.length];
    const current = working[earIndex];
    const next = working[(earIndex + 1) % working.length];
    clipped.push([previous, current, next]);
    working.splice(earIndex, 1);
  }
  if (orientationBig(working[0], working[1], working[2]) <= 0n) return null;
  clipped.push([working[0], working[1], working[2]]);
  return clipped;
}

/**
 * MAX-MIN-ANGLE triangulation of a simple CCW polygon (Klincsek-style
 * interval DP — the constrained-Delaunay-equivalent objective). Thin
 * chain-hugging slivers (three near-collinear vertices along one guide
 * curve) carry the measured ~10 um sag class and have tiny minimum angles,
 * so maximizing the minimum angle prefers fat cross rungs by construction —
 * a pure length objective does NOT (a short skip diagonal can beat the rung
 * total). Diagonal validity is EXACT (no strict boundary crossing, no
 * vertex on the open diagonal, doubled-coordinate midpoint strictly
 * inside); only the angle weights use floats, which steer the choice among
 * valid triangulations and cannot break correctness. Returns null when no
 * valid triangulation is found (caller falls back fail-closed).
 */
function maxMinAngleTriangulation(
  piece: readonly ExactUvPoint[]
): (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] | null {
  const count = piece.length;
  if (count < 3) return null;
  if (count === 3) {
    if (orientationBig(piece[0], piece[1], piece[2]) <= 0n) return null;
    return [[piece[0], piece[1], piece[2]]];
  }
  const doubled = piece.map((point) => ({ U: point.U * 2n, V: point.V * 2n }));
  const strictlyInsideDoubled = (px: bigint, py: bigint): boolean => {
    let inside = false;
    for (let index = 0; index < doubled.length; index += 1) {
      const from = doubled[index];
      const to = doubled[(index + 1) % doubled.length];
      const fromAbove = from.V > py;
      const toAbove = to.V > py;
      if (fromAbove === toAbove) continue;
      const det =
        (to.U - from.U) * (py - from.V) - (to.V - from.V) * (px - from.U);
      if (det === 0n) return false;
      if (to.V > from.V ? det > 0n : det < 0n) inside = !inside;
    }
    return inside;
  };
  const adjacent = (i: number, j: number): boolean =>
    j === i + 1 || (i === 0 && j === count - 1);
  const usable: boolean[][] = Array.from({ length: count }, () =>
    new Array<boolean>(count).fill(false)
  );
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      if (adjacent(i, j)) {
        usable[i][j] = true;
        continue;
      }
      const a = piece[i];
      const b = piece[j];
      if (pointsEqualUv(a, b)) continue;
      let valid = true;
      for (let edge = 0; edge < count && valid; edge += 1) {
        if (
          segmentsCrossStrictly(a, b, piece[edge], piece[(edge + 1) % count])
        ) {
          valid = false;
        }
      }
      for (let other = 0; other < count && valid; other += 1) {
        if (other === i || other === j) continue;
        if (onClosedSegmentUv(piece[other], a, b)) valid = false;
      }
      if (valid && !strictlyInsideDoubled(a.U + b.U, a.V + b.V)) valid = false;
      usable[i][j] = valid;
    }
  }
  const minAngle = (i: number, k: number, j: number): number => {
    const corner = (
      at: ExactUvPoint,
      left: ExactUvPoint,
      right: ExactUvPoint
    ): number => {
      const leftU = Number(left.U - at.U);
      const leftV = Number(left.V - at.V);
      const rightU = Number(right.U - at.U);
      const rightV = Number(right.V - at.V);
      const cross = leftU * rightV - leftV * rightU;
      const dot = leftU * rightU + leftV * rightV;
      return Math.abs(Math.atan2(cross, dot));
    };
    const a = piece[i];
    const b = piece[k];
    const c = piece[j];
    return Math.min(corner(a, b, c), corner(b, c, a), corner(c, a, b));
  };
  const best: number[][] = Array.from({ length: count }, () =>
    new Array<number>(count).fill(Number.NEGATIVE_INFINITY)
  );
  const choice: number[][] = Array.from({ length: count }, () =>
    new Array<number>(count).fill(-1)
  );
  for (let i = 0; i + 1 < count; i += 1) best[i][i + 1] = Number.POSITIVE_INFINITY;
  for (let span = 2; span < count; span += 1) {
    for (let i = 0; i + span < count; i += 1) {
      const j = i + span;
      if (!usable[i][j]) continue;
      for (let k = i + 1; k < j; k += 1) {
        if (!usable[i][k] || !usable[k][j]) continue;
        if (best[i][k] === Number.NEGATIVE_INFINITY) continue;
        if (best[k][j] === Number.NEGATIVE_INFINITY) continue;
        if (orientationBig(piece[i], piece[k], piece[j]) <= 0n) continue;
        const value = Math.min(best[i][k], best[k][j], minAngle(i, k, j));
        if (value > best[i][j]) {
          best[i][j] = value;
          choice[i][j] = k;
        }
      }
    }
  }
  if (best[0][count - 1] === Number.NEGATIVE_INFINITY) return null;
  const result: (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[] = [];
  const emit = (i: number, j: number): boolean => {
    if (j - i < 2) return true;
    const k = choice[i][j];
    if (k < 0) return false;
    if (orientationBig(piece[i], piece[k], piece[j]) <= 0n) return false;
    result.push([piece[i], piece[k], piece[j]]);
    return emit(i, k) && emit(k, j);
  };
  if (!emit(0, count - 1)) return null;
  return result;
}

/** Strict proper crossing of open segments (all four orientations strict). */
function segmentsCrossStrictly(
  a1: ExactUvPoint,
  a2: ExactUvPoint,
  b1: ExactUvPoint,
  b2: ExactUvPoint
): boolean {
  const o1 = orientationBig(a1, a2, b1);
  const o2 = orientationBig(a1, a2, b2);
  if (!((o1 > 0n && o2 < 0n) || (o1 < 0n && o2 > 0n))) return false;
  const o3 = orientationBig(b1, b2, a1);
  const o4 = orientationBig(b1, b2, a2);
  return (o3 > 0n && o4 < 0n) || (o3 < 0n && o4 > 0n);
}

/**
 * Split one simple CCW polygon by the polyline chain `points[0] .. points[n-1]`.
 * The two extreme points must lie on the polygon's closed boundary; every
 * middle point must lie strictly inside it (interior pass-through vertices —
 * the U5 collar extension). Pure boundary walk — no divisions. Returns null
 * when the chain does not belong to this piece (an extreme point off the
 * boundary, a middle point ON it, or a segment strictly crossing it) so the
 * caller can try other pieces; refuses degenerate splits.
 */
function splitPolygonByChain(
  polygon: readonly ExactUvPoint[],
  points: readonly ExactUvPoint[]
): readonly [readonly ExactUvPoint[], readonly ExactUvPoint[]] | null {
  const start = points[0];
  const end = points[points.length - 1];
  const middles = points.slice(1, points.length - 1);
  interface BoundaryPosition {
    readonly edgeIndex: number;
    readonly isVertex: boolean;
  }
  const locate = (point: ExactUvPoint): BoundaryPosition | null => {
    for (let index = 0; index < polygon.length; index += 1) {
      if (pointsEqualUv(polygon[index], point)) {
        return { edgeIndex: index, isVertex: true };
      }
    }
    for (let index = 0; index < polygon.length; index += 1) {
      const from = polygon[index];
      const to = polygon[(index + 1) % polygon.length];
      if (onClosedSegmentUv(point, from, to)) {
        return { edgeIndex: index, isVertex: false };
      }
    }
    return null;
  };
  const startPosition = locate(start);
  const endPosition = locate(end);
  if (startPosition === null || endPosition === null) return null;
  // Middle (interior pass-through) points must not touch THIS piece's
  // boundary, and no chain segment may strictly cross it — otherwise the
  // chain belongs to a different piece (or to none: the caller refuses
  // fail-closed after trying every piece).
  for (const middle of middles) {
    if (locate(middle) !== null) return null;
  }
  for (let segment = 0; segment + 1 < points.length; segment += 1) {
    for (let edge = 0; edge < polygon.length; edge += 1) {
      if (
        segmentsCrossStrictly(
          points[segment],
          points[segment + 1],
          polygon[edge],
          polygon[(edge + 1) % polygon.length]
        )
      ) {
        return null;
      }
    }
  }
  // Walk the boundary forward from a position: the first vertex strictly
  // after the position along the CCW cycle.
  const nextVertexIndex = (position: BoundaryPosition): number =>
    position.isVertex
      ? (position.edgeIndex + 1) % polygon.length
      : (position.edgeIndex + 1) % polygon.length;
  const collectWalk = (
    fromPoint: ExactUvPoint,
    fromPosition: BoundaryPosition,
    toPoint: ExactUvPoint,
    toPosition: BoundaryPosition
  ): ExactUvPoint[] => {
    const walk: ExactUvPoint[] = [fromPoint];
    let cursor = nextVertexIndex(fromPosition);
    for (let steps = 0; steps <= polygon.length; steps += 1) {
      // Stop when the target lies on the edge we are about to leave from:
      // for a vertex target, stop when the cursor reaches it; for an
      // edge-interior target, stop once the cursor has passed its edge.
      if (toPosition.isVertex && cursor === toPosition.edgeIndex) break;
      if (
        !toPosition.isVertex &&
        cursor === (toPosition.edgeIndex + 1) % polygon.length
      ) {
        break;
      }
      walk.push(polygon[cursor]);
      cursor = (cursor + 1) % polygon.length;
    }
    if (!pointsEqualUv(walk[walk.length - 1], toPoint)) walk.push(toPoint);
    return walk;
  };
  // Each side closes back through the chain so the polyline's interior
  // vertices become boundary vertices of BOTH pieces and every chain
  // segment becomes a shared piece edge.
  const sideA = collectWalk(start, startPosition, end, endPosition);
  for (let index = middles.length - 1; index >= 0; index -= 1) {
    sideA.push(middles[index]);
  }
  const sideB = collectWalk(end, endPosition, start, startPosition);
  for (let index = 0; index < middles.length; index += 1) {
    sideB.push(middles[index]);
  }
  const dedupe = (walk: readonly ExactUvPoint[]): ExactUvPoint[] => {
    const result: ExactUvPoint[] = [];
    for (const point of walk) {
      if (result.length === 0 || !pointsEqualUv(result[result.length - 1], point)) {
        result.push(point);
      }
    }
    while (
      result.length > 1 &&
      pointsEqualUv(result[0], result[result.length - 1])
    ) {
      result.pop();
    }
    return result;
  };
  const pieceA = dedupe(sideA);
  const pieceB = dedupe(sideB);
  if (pieceA.length < 3 || pieceB.length < 3) {
    invalid('conforming chord splits a cell into a degenerate piece');
  }
  return [pieceA, pieceB];
}

/**
 * Per-patch exact partition coordinate frame: the shared denominator
 * oddFactor * 2^fractionBits merging the angular ladder, the vertical ladder,
 * and (when conforming lines are present) the lcm of the line coefficients —
 * so every station AND every line/grid-edge intersection is an exact integer
 * numerator. `pieces` holds the split triangles of strictly-crossed cells;
 * uncrossed cells keep their two standard grid triangles.
 */
interface PatchPartitionFrame {
  readonly fractionBits: number;
  readonly oddFactor: number;
  readonly declaredDenominator: number;
  readonly scaledAngularNumerators: readonly number[];
  readonly scaledVerticalNumerators: readonly number[];
  readonly pieces: ReadonlyMap<
    number,
    readonly (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[]
  >;
  readonly patchTriangleCount: number;
}

function leastCommonMultipleSafe(
  left: number,
  right: number,
  patchId: string
): number {
  const divisor = greatestCommonDivisor(left, right);
  const result = (left / divisor) * right;
  if (!Number.isSafeInteger(result) || result > MAX_LADDER_ODD_FACTOR) {
    invalid(`patch '${patchId}' conforming line coefficients exceed the exact envelope`);
  }
  return result;
}

interface ChordEndpointInterval {
  readonly index: number;
  readonly isStation: boolean;
}

function locateIntervalIndex(
  sorted: readonly bigint[],
  value: bigint
): ChordEndpointInterval | null {
  if (value < sorted[0] || value > sorted[sorted.length - 1]) return null;
  let low = 0;
  let high = sorted.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (sorted[middle] <= value) low = middle;
    else high = middle - 1;
  }
  return { index: low, isStation: sorted[low] === value };
}

function buildPatchPartitionFrame(
  patchId: string,
  angular: ResolvedStations,
  vertical: ResolvedStations,
  lines: readonly NormalizedConformingLine[],
  chords: readonly ConformingChord[]
): PatchPartitionFrame {
  const angularOdd = angular.oddDenominatorFactor;
  const verticalOdd = vertical.oddDenominatorFactor;
  let fractionBits = Math.max(angular.log2Denominator, vertical.log2Denominator);
  let oddFactor =
    (angularOdd / greatestCommonDivisor(angularOdd, verticalOdd)) * verticalOdd;
  if (chords.length > 4_096 * 64) {
    invalid(`conformingChordsByPatch['${patchId}'] carries too many chords`);
  }
  for (const chord of chords) {
    // Fold every chord denominator (odd part and dyadic part) into the frame
    // so all chord coordinates become exact integer numerators.
    const denominator = Number(chord.denominator);
    if (
      !Number.isSafeInteger(denominator) ||
      denominator < 1 ||
      denominator > MAX_LADDER_ODD_FACTOR
    ) {
      invalid(`conformingChordsByPatch['${patchId}'] denominator is out of range`);
    }
    let oddPart = denominator;
    let dyadicBits = 0;
    while (oddPart % 2 === 0) {
      oddPart /= 2;
      dyadicBits += 1;
    }
    oddFactor = leastCommonMultipleSafe(oddFactor, oddPart, patchId);
    fractionBits = Math.max(fractionBits, dyadicBits);
  }
  if (lines.length > 0) {
    // Crossing a horizontal grid edge divides by a, a vertical edge by b, and
    // every existing coordinate is a multiple of this extra factor after the
    // scale-up — so all intersection numerators stay exact integers (parallel
    // families never strictly cross each other's cut edges).
    let extraFactor = 1;
    for (const line of lines) {
      extraFactor = leastCommonMultipleSafe(
        extraFactor,
        Math.abs(line.aNumerator),
        patchId
      );
      extraFactor = leastCommonMultipleSafe(
        extraFactor,
        Math.abs(line.bNumerator),
        patchId
      );
    }
    let extraOdd = extraFactor;
    let extraLog2 = 0;
    while (extraOdd % 2 === 0) {
      extraOdd /= 2;
      extraLog2 += 1;
    }
    fractionBits += extraLog2;
    oddFactor *= extraOdd;
    if (!Number.isSafeInteger(oddFactor) || oddFactor > MAX_LADDER_ODD_FACTOR) {
      invalid(`patch '${patchId}' conforming denominator exceeds the exact envelope`);
    }
  }
  const uNumeratorScale =
    (oddFactor / angularOdd) * 2 ** (fractionBits - angular.log2Denominator);
  const vNumeratorScale =
    (oddFactor / verticalOdd) * 2 ** (fractionBits - vertical.log2Denominator);
  const declaredDenominator = oddFactor * 2 ** fractionBits;
  if (
    !Number.isSafeInteger(uNumeratorScale) ||
    !Number.isSafeInteger(vNumeratorScale) ||
    !Number.isSafeInteger(declaredDenominator) ||
    declaredDenominator > MAX_LADDER_ODD_FACTOR
  ) {
    invalid(`patch '${patchId}' partition denominator exceeds the exact envelope`);
  }
  const scaledAngularNumerators = angular.numerators.map(
    (numerator) => numerator * uNumeratorScale
  );
  const scaledVerticalNumerators = vertical.numerators.map(
    (numerator) => numerator * vNumeratorScale
  );
  const angularDivisions = angular.numerators.length - 1;
  const verticalDivisions = vertical.numerators.length - 1;
  const pieces = new Map<
    number,
    readonly (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[]
  >();
  if (lines.length === 0 && chords.length === 0) {
    return Object.freeze({
      fractionBits,
      oddFactor,
      declaredDenominator,
      scaledAngularNumerators,
      scaledVerticalNumerators,
      pieces,
      patchTriangleCount: 2 * angularDivisions * verticalDivisions,
    });
  }
  const declared = BigInt(declaredDenominator);
  const scaledAngularBig = scaledAngularNumerators.map((numerator) => BigInt(numerator));
  const scaledVerticalBig = scaledVerticalNumerators.map((numerator) => BigInt(numerator));
  const stationSet = new Set<string>(
    scaledAngularNumerators.map((numerator) => numerator.toString())
  );
  const cellCorners = (uCell: number, vCell: number): readonly ExactUvPoint[] => [
    { U: scaledAngularBig[uCell], V: scaledVerticalBig[vCell] },
    { U: scaledAngularBig[uCell + 1], V: scaledVerticalBig[vCell] },
    { U: scaledAngularBig[uCell + 1], V: scaledVerticalBig[vCell + 1] },
    { U: scaledAngularBig[uCell], V: scaledVerticalBig[vCell + 1] },
  ];
  // Phase 1 (straight parallel lines): split crossed cells, store POLYGONS.
  const polygonsByCell = new Map<number, readonly (readonly ExactUvPoint[])[]>();
  // Pieces produced by interior-vertex chain splits (and their descendants)
  // triangulate by minimal weight instead of fanning — see
  // conformingPieceTriangles.
  const densePieces = new WeakSet<object>();
  if (lines.length > 0) {
    const scaledLines = lines.map((line) => ({
      a: BigInt(line.aNumerator),
      b: BigInt(line.bNumerator),
      cScaled: BigInt(line.cNumerator) * declared,
    }));
    for (const line of scaledLines) {
      // Boundary rows: a crossing strictly inside v=0 or v=1 must land
      // EXACTLY on a shared angular station, or the junction weld with the
      // neighbouring patch would carry a T-junction. (a > 0 normalized.)
      for (const rowV of [0n, declared]) {
        const numerator = line.cScaled - line.b * rowV;
        if (numerator > 0n && numerator < line.a * declared) {
          if (
            numerator % line.a !== 0n ||
            !stationSet.has((numerator / line.a).toString())
          ) {
            invalid(
              `patch '${patchId}' conforming line crosses a patch boundary row off-station`
            );
          }
        }
      }
      // Periodic seam: interior crossings are refused this slice (the
      // wrapped continuation would need matched seam subdivisions).
      for (const columnU of [0n, declared]) {
        const numerator = line.cScaled - line.a * columnU;
        const inside =
          line.b > 0n
            ? numerator > 0n && numerator < line.b * declared
            : numerator < 0n && numerator > line.b * declared;
        if (inside) {
          invalid(`patch '${patchId}' conforming line crosses the periodic seam interior`);
        }
      }
    }
    for (let vCell = 0; vCell < verticalDivisions; vCell += 1) {
      for (let uCell = 0; uCell < angularDivisions; uCell += 1) {
        let currentPieces: readonly (readonly ExactUvPoint[])[] = [
          cellCorners(uCell, vCell),
        ];
        let anySplit = false;
        for (const line of scaledLines) {
          const nextPieces: (readonly ExactUvPoint[])[] = [];
          for (const piece of currentPieces) {
            const split = splitConvexByLine(piece, line.a, line.b, line.cScaled);
            if (split.length > 1) anySplit = true;
            for (const part of split) nextPieces.push(part);
          }
          currentPieces = nextPieces;
        }
        if (anySplit) {
          polygonsByCell.set(vCell * angularDivisions + uCell, currentPieces);
        }
      }
    }
  }
  // Phase 2 (curved guide-polyline chords): boundary-walk splits, no division.
  if (chords.length > 0) {
    interface CellChordRecord {
      readonly start: ExactUvPoint;
      readonly end: ExactUvPoint;
      readonly startInterior: boolean;
      readonly endInterior: boolean;
    }
    const chordsByCell = new Map<number, CellChordRecord[]>();
    for (const chord of chords) {
      const denominator = BigInt(chord.denominator);
      if (declared % denominator !== 0n) {
        invalid(`patch '${patchId}' conforming chord denominator does not divide the frame`);
      }
      const scale = declared / denominator;
      const parsePoint = (point: ConformingChordPoint, label: string): ExactUvPoint => {
        const uRaw = BigInt(point.uNumerator);
        const vRaw = BigInt(point.vNumerator);
        const scaled = { U: uRaw * scale, V: vRaw * scale };
        if (scaled.U < 0n || scaled.U > declared || scaled.V < 0n || scaled.V > declared) {
          invalid(`patch '${patchId}' conforming chord ${label} leaves the unit square`);
        }
        return scaled;
      };
      const start = parsePoint(chord.start, 'start');
      const end = parsePoint(chord.end, 'end');
      if (pointsEqualUv(start, end)) {
        invalid(`patch '${patchId}' conforming chord is a single point`);
      }
      const startU = locateIntervalIndex(scaledAngularBig, start.U);
      const startV = locateIntervalIndex(scaledVerticalBig, start.V);
      const endU = locateIntervalIndex(scaledAngularBig, end.U);
      const endV = locateIntervalIndex(scaledVerticalBig, end.V);
      if (startU === null || startV === null || endU === null || endV === null) {
        invalid(`patch '${patchId}' conforming chord endpoint leaves the station range`);
      }
      // Endpoints strictly inside a cell (on NO grid line) are legal as
      // degree-2 chain pass-through vertices — validated after bucketing.
      // On-grid endpoints keep the boundary-row and seam rules below
      // (an interior point can touch neither: rows 0/declared and the seam
      // columns are always stations, so isStation would be true there).
      const startInterior = !startU.isStation && !startV.isStation;
      const endInterior = !endU.isStation && !endV.isStation;
      for (const [point, uInfo, vInfo] of [
        [start, startU, startV],
        [end, endU, endV],
      ] as const) {
        if (
          (point.V === 0n || point.V === declared) &&
          !stationSet.has(point.U.toString())
        ) {
          invalid(
            `patch '${patchId}' conforming chord crosses a patch boundary row off-station`
          );
        }
        // Seam-column endpoints are safe exactly when they are GRID CORNERS
        // (station x station): the periodic weld copies the u=0 column, so a
        // corner on the seam is shared by construction. Any other seam touch
        // would need matched subdivisions on both wrapped columns — refused.
        if (
          (point.U === 0n || point.U === declared) &&
          point.V !== 0n &&
          point.V !== declared &&
          !vInfo.isStation
        ) {
          invalid(`patch '${patchId}' conforming chord touches the periodic seam interior`);
        }
      }
      if (
        (start.U === end.U && startU.isStation && endU.isStation) ||
        (start.V === end.V && startV.isStation && endV.isStation)
      ) {
        invalid(`patch '${patchId}' conforming chord lies along a grid line`);
      }
      const candidateCells = (
        uInfo: ChordEndpointInterval,
        vInfo: ChordEndpointInterval
      ): Set<number> => {
        const uCells = uInfo.isStation
          ? [uInfo.index - 1, uInfo.index]
          : [uInfo.index];
        const vCells = vInfo.isStation
          ? [vInfo.index - 1, vInfo.index]
          : [vInfo.index];
        const cells = new Set<number>();
        for (const uCell of uCells) {
          if (uCell < 0 || uCell >= angularDivisions) continue;
          for (const vCell of vCells) {
            if (vCell < 0 || vCell >= verticalDivisions) continue;
            cells.add(vCell * angularDivisions + uCell);
          }
        }
        return cells;
      };
      const startCells = candidateCells(startU, startV);
      const shared: number[] = [];
      for (const cell of candidateCells(endU, endV)) {
        if (startCells.has(cell)) shared.push(cell);
      }
      if (shared.length !== 1) {
        invalid(`patch '${patchId}' conforming chord endpoints do not bound one common cell`);
      }
      const record: CellChordRecord = { start, end, startInterior, endInterior };
      const bucket = chordsByCell.get(shared[0]);
      if (bucket === undefined) chordsByCell.set(shared[0], [record]);
      else bucket.push(record);
    }
    for (const [cellIndex, cellChords] of chordsByCell) {
      const uCell = cellIndex % angularDivisions;
      const vCell = (cellIndex - uCell) / angularDivisions;
      // Assemble guide-polyline CHAINS: an interior endpoint must be shared
      // by exactly two of the cell's chords (a degree-2 pass-through vertex)
      // and every maximal chain must reach the grid at both extremes.
      const pointKey = (point: ExactUvPoint): string => `${point.U},${point.V}`;
      const interiorLinks = new Map<
        string,
        { chordIndex: number; endIndex: 0 | 1 }[]
      >();
      for (let chordIndex = 0; chordIndex < cellChords.length; chordIndex += 1) {
        const chordRecord = cellChords[chordIndex];
        if (chordRecord.startInterior) {
          const key = pointKey(chordRecord.start);
          const links = interiorLinks.get(key);
          if (links === undefined) {
            interiorLinks.set(key, [{ chordIndex, endIndex: 0 }]);
          } else {
            links.push({ chordIndex, endIndex: 0 });
          }
        }
        if (chordRecord.endInterior) {
          const key = pointKey(chordRecord.end);
          const links = interiorLinks.get(key);
          if (links === undefined) {
            interiorLinks.set(key, [{ chordIndex, endIndex: 1 }]);
          } else {
            links.push({ chordIndex, endIndex: 1 });
          }
        }
      }
      for (const links of interiorLinks.values()) {
        if (links.length !== 2) {
          invalid(
            `patch '${patchId}' conforming chord interior vertex is not a degree-2 chain pass-through`
          );
        }
      }
      const visited: boolean[] = new Array(cellChords.length).fill(false);
      const chains: (readonly ExactUvPoint[])[] = [];
      const extendThroughInterior = (
        chainPoints: ExactUvPoint[],
        head: boolean
      ): void => {
        let guard = cellChords.length + 1;
        for (;;) {
          guard -= 1;
          if (guard <= 0) {
            invalid(
              `patch '${patchId}' conforming chord chain forms a closed loop without grid contact`
            );
          }
          const tip = head ? chainPoints[0] : chainPoints[chainPoints.length - 1];
          const links = interiorLinks.get(pointKey(tip));
          if (links === undefined) return; // tip reached the grid
          const partner = links.find((link) => !visited[link.chordIndex]);
          if (partner === undefined) {
            invalid(
              `patch '${patchId}' conforming chord chain forms a closed loop without grid contact`
            );
          }
          visited[partner.chordIndex] = true;
          const partnerRecord = cellChords[partner.chordIndex];
          const nextPoint =
            partner.endIndex === 0 ? partnerRecord.end : partnerRecord.start;
          const nextInterior =
            partner.endIndex === 0
              ? partnerRecord.endInterior
              : partnerRecord.startInterior;
          if (head) chainPoints.unshift(nextPoint);
          else chainPoints.push(nextPoint);
          if (!nextInterior) return;
        }
      };
      for (let seed = 0; seed < cellChords.length; seed += 1) {
        if (visited[seed]) continue;
        visited[seed] = true;
        const seedRecord = cellChords[seed];
        const chainPoints: ExactUvPoint[] = [seedRecord.start, seedRecord.end];
        if (seedRecord.startInterior) extendThroughInterior(chainPoints, true);
        if (seedRecord.endInterior) extendThroughInterior(chainPoints, false);
        // Fail-closed simplicity: non-adjacent chain segments must not cross.
        for (let left = 0; left + 1 < chainPoints.length; left += 1) {
          for (let right = left + 2; right + 1 < chainPoints.length; right += 1) {
            if (
              segmentsCrossStrictly(
                chainPoints[left],
                chainPoints[left + 1],
                chainPoints[right],
                chainPoints[right + 1]
              )
            ) {
              invalid(`patch '${patchId}' conforming chord chain self-intersects`);
            }
          }
        }
        chains.push(chainPoints);
      }
      let currentPieces: readonly (readonly ExactUvPoint[])[] =
        polygonsByCell.get(cellIndex) ?? [cellCorners(uCell, vCell)];
      for (const chainPoints of chains) {
        const nextPieces: (readonly ExactUvPoint[])[] = [];
        let splitDone = false;
        for (const piece of currentPieces) {
          if (splitDone) {
            nextPieces.push(piece);
            continue;
          }
          const split = splitPolygonByChain(piece, chainPoints);
          if (split === null) {
            nextPieces.push(piece);
            continue;
          }
          if (chainPoints.length > 2 || densePieces.has(piece)) {
            densePieces.add(split[0]);
            densePieces.add(split[1]);
          }
          nextPieces.push(split[0], split[1]);
          splitDone = true;
        }
        if (!splitDone) {
          invalid(
            `patch '${patchId}' conforming chord does not lie on one piece boundary of its cell`
          );
        }
        currentPieces = nextPieces;
      }
      polygonsByCell.set(cellIndex, currentPieces);
    }
  }
  // Fan every touched cell's polygons; untouched cells keep two triangles.
  let patchTriangleCount = 2 * (angularDivisions * verticalDivisions - polygonsByCell.size);
  for (const [cellIndex, cellPolygons] of polygonsByCell) {
    const cellTriangles = conformingPieceTriangles(cellPolygons, densePieces);
    pieces.set(cellIndex, cellTriangles);
    patchTriangleCount += cellTriangles.length;
  }
  return Object.freeze({
    fractionBits,
    oddFactor,
    declaredDenominator,
    scaledAngularNumerators,
    scaledVerticalNumerators,
    pieces,
    patchTriangleCount,
  });
}

/**
 * Build a (not necessarily symmetric) station ladder containing every
 * requested exact rational station p/q PLUS a uniform 2^uniformLog2 grid,
 * over the least common denominator odd(L) * 2^v2(L) (U3b slice 5). Used
 * for VERTICAL feature stations — e.g. an inner wall whose affine source-v
 * remap puts lattice jump lines at (k/8 - c)/s with c, s exact decimals.
 */
export function rationalStationLadder(
  uniformLog2: number,
  stations: readonly (readonly [number, number])[]
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformLog2) ||
    uniformLog2 < 1 ||
    uniformLog2 > MAX_VERTICAL_DIVISIONS_LOG2 ||
    !Array.isArray(stations)
  ) {
    invalid('rationalStationLadder arguments are out of range');
  }
  let commonDenominator = 1 << uniformLog2;
  for (const station of stations) {
    if (
      !Array.isArray(station) ||
      station.length !== 2 ||
      !Number.isSafeInteger(station[0]) ||
      !Number.isSafeInteger(station[1]) ||
      station[1] < 2 ||
      station[0] <= 0 ||
      station[0] >= station[1]
    ) {
      invalid('rationalStationLadder stations must be exact fractions strictly inside (0, 1)');
    }
    const divisor = greatestCommonDivisor(commonDenominator, station[1]);
    commonDenominator = (commonDenominator / divisor) * station[1];
    if (!Number.isSafeInteger(commonDenominator) || commonDenominator > MAX_LADDER_ODD_FACTOR) {
      invalid('rationalStationLadder least common denominator exceeds the exact envelope');
    }
  }
  let log2Denominator = 0;
  let oddPart = commonDenominator;
  while (oddPart % 2 === 0) {
    oddPart /= 2;
    log2Denominator += 1;
  }
  if (log2Denominator > MAX_LADDER_LOG2_DENOMINATOR) {
    invalid('rationalStationLadder dyadic depth exceeds the ladder envelope');
  }
  const stationSet = new Set<number>();
  const uniformStep = commonDenominator / 2 ** uniformLog2;
  for (let station = 0; station <= 1 << uniformLog2; station += 1) {
    stationSet.add(station * uniformStep);
  }
  for (const [numerator, denominator] of stations) {
    stationSet.add((numerator * commonDenominator) / denominator);
  }
  const numerators = [...stationSet].sort((left, right) => left - right);
  if (numerators.length > MAX_LADDER_STATIONS) {
    invalid('rationalStationLadder produces too many stations');
  }
  return Object.freeze({
    log2Denominator,
    numerators: Object.freeze(numerators),
    ...(oddPart === 1 ? {} : { oddDenominatorFactor: oddPart }),
  });
}

/**
 * Build a dyadic ladder that is uniform at 2^uniformDivisionsLog2 rows and
 * then halves the row adjacent to the chosen edge `refinements` times, so
 * row widths shrink geometrically into the edge. Total rows =
 * 2^uniformDivisionsLog2 + refinements.
 */
export function dyadicEdgeLadder(
  uniformDivisionsLog2: number,
  refinements: number,
  edge: 'v0' | 'v1'
): VerticalStationLadder {
  if (
    !Number.isSafeInteger(uniformDivisionsLog2) ||
    uniformDivisionsLog2 < 0 ||
    uniformDivisionsLog2 > MAX_VERTICAL_DIVISIONS_LOG2 ||
    !Number.isSafeInteger(refinements) ||
    refinements < 0 ||
    uniformDivisionsLog2 + refinements > MAX_LADDER_LOG2_DENOMINATOR
  ) {
    invalid('dyadicEdgeLadder arguments are out of range');
  }
  const log2Denominator = uniformDivisionsLog2 + refinements;
  const denominator = 1 << log2Denominator;
  const uniformStep = 1 << refinements;
  const numerators: number[] = [];
  for (let station = 0; station <= 1 << uniformDivisionsLog2; station += 1) {
    numerators.push(station * uniformStep);
  }
  for (let step = 1; step <= refinements; step += 1) {
    const offset = uniformStep >> step;
    // Insert immediately inside the edge terminus so the stations stay
    // strictly increasing and each new row halves the previous edge row.
    if (edge === 'v1') numerators.splice(numerators.length - 1, 0, denominator - offset);
    else numerators.splice(1, 0, offset);
  }
  return Object.freeze({ log2Denominator, numerators: Object.freeze(numerators) });
}

export interface AnnularSolidReferenceTessellation {
  readonly stlBytes: Uint8Array;
  readonly triangleCount: number;
  /** One exact dyadic partition per patch, in the atlas's program order. */
  readonly partitions: readonly ExactDyadicDomainPartitionInput[];
}

const PATCH_IDS: readonly AnnularRadialSolidPatchId[] = Object.freeze([
  'outer-wall',
  'inner-wall',
  'top-rim',
  'bottom-top',
  'bottom-under',
  'drain-wall',
]);
const MIN_DIVISIONS_LOG2 = 0;
const MAX_ANGULAR_DIVISIONS_LOG2 = 12;
const MAX_VERTICAL_DIVISIONS_LOG2 = 10;
const MAX_LADDER_LOG2_DENOMINATOR = 20;
const MAX_LADDER_STATIONS = 4_097;
// Envelope v5b (2026-07-19): the Gyroid gentle-soft cap-point probe (walls
// 2 x 1,048,576 at the per-patch hard cap + laddered bottoms) totals
// 2,410,496 reference triangles; x2 keeps the usual headroom.
const MAX_REFERENCE_TRIANGLES = 4_194_304;

interface ResolvedStations {
  readonly log2Denominator: number;
  /** Odd part of the station denominator (1 for purely dyadic ladders). */
  readonly oddDenominatorFactor: number;
  readonly numerators: readonly number[];
  /** Station values numerator / (oddDenominatorFactor * 2^log2Denominator). */
  readonly values: Float64Array;
}

const MAX_LADDER_ODD_FACTOR = 4_503_599_627_370_495; // 2^52 - 1 (kernel envelope)

function resolveStations(
  patchId: string,
  uniformLog2: number,
  ladder: VerticalStationLadder | undefined
): ResolvedStations {
  if (ladder === undefined) {
    const divisions = 1 << uniformLog2;
    const numerators: number[] = [];
    const values = new Float64Array(divisions + 1);
    for (let station = 0; station <= divisions; station += 1) {
      numerators.push(station);
      values[station] = station / divisions;
    }
    return { log2Denominator: uniformLog2, oddDenominatorFactor: 1, numerators, values };
  }
  const log2Denominator = ladder.log2Denominator;
  if (
    !Number.isSafeInteger(log2Denominator) ||
    log2Denominator < 1 ||
    log2Denominator > MAX_LADDER_LOG2_DENOMINATOR
  ) {
    invalid(`verticalStationsByPatch['${patchId}'].log2Denominator out of range`);
  }
  const rawOddFactor = ladder.oddDenominatorFactor;
  let oddDenominatorFactor = 1;
  if (rawOddFactor !== undefined) {
    if (
      !Number.isSafeInteger(rawOddFactor) ||
      rawOddFactor < 3 ||
      rawOddFactor % 2 !== 1 ||
      rawOddFactor > MAX_LADDER_ODD_FACTOR
    ) {
      invalid(`verticalStationsByPatch['${patchId}'].oddDenominatorFactor must be an odd integer >= 3`);
    }
    oddDenominatorFactor = rawOddFactor;
  }
  const numerators = ladder.numerators;
  const denominator = oddDenominatorFactor * 2 ** log2Denominator;
  if (!Number.isSafeInteger(denominator)) {
    invalid(`verticalStationsByPatch['${patchId}'] denominator exceeds the exact envelope`);
  }
  if (
    !Array.isArray(numerators) ||
    numerators.length < 2 ||
    numerators.length > MAX_LADDER_STATIONS ||
    numerators[0] !== 0 ||
    numerators[numerators.length - 1] !== denominator
  ) {
    invalid(
      `verticalStationsByPatch['${patchId}'] must run 0..${oddDenominatorFactor}*2^${log2Denominator}`
    );
  }
  const values = new Float64Array(numerators.length);
  for (let station = 0; station < numerators.length; station += 1) {
    const numerator = numerators[station];
    if (
      !Number.isSafeInteger(numerator) ||
      (station > 0 && numerator <= numerators[station - 1])
    ) {
      invalid(`verticalStationsByPatch['${patchId}'] must be strictly increasing integers`);
    }
    values[station] = numerator / denominator;
  }
  return { log2Denominator, oddDenominatorFactor, numerators, values };
}

interface PatchGrid {
  readonly patchId: string;
  readonly verticalDivisions: number;
  /** (nV+1) x (nU+1) x 3 float64 coordinates, row-major by v station. */
  readonly coordinates: Float64Array;
}

function invalid(message: string): never {
  throw new RangeError(`Annular reference tessellation: ${message}`);
}

function divisionsLog2(value: unknown, maximum: number, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < MIN_DIVISIONS_LOG2 ||
    value > maximum
  ) {
    invalid(`${label} must be an integer in [${MIN_DIVISIONS_LOG2}, ${maximum}]`);
  }
  return value;
}

function gridIndex(angularDivisions: number, uStation: number, vStation: number): number {
  return (vStation * (angularDivisions + 1) + uStation) * 3;
}

function evaluatePatchGrid(
  patchId: string,
  evaluateFloat64: (u: number, v: number) => readonly [number, number, number],
  angularValues: Float64Array,
  stationValues: Float64Array
): PatchGrid {
  const angularDivisions = angularValues.length - 1;
  const verticalDivisions = stationValues.length - 1;
  const coordinates = new Float64Array((verticalDivisions + 1) * (angularDivisions + 1) * 3);
  for (let vStation = 0; vStation <= verticalDivisions; vStation += 1) {
    const v = stationValues[vStation];
    for (let uStation = 0; uStation < angularDivisions; uStation += 1) {
      const point = evaluateFloat64(angularValues[uStation], v);
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(point[2])) {
        invalid(`patch '${patchId}' evaluated a non-finite coordinate`);
      }
      const base = gridIndex(angularDivisions, uStation, vStation);
      coordinates[base] = point[0];
      coordinates[base + 1] = point[1];
      coordinates[base + 2] = point[2];
    }
    // Periodic identification: the u=1 column reuses the u=0 column verbatim
    // so the seam is welded by construction regardless of evaluator rounding.
    const seamTarget = gridIndex(angularDivisions, angularDivisions, vStation);
    const seamSource = gridIndex(angularDivisions, 0, vStation);
    coordinates[seamTarget] = coordinates[seamSource];
    coordinates[seamTarget + 1] = coordinates[seamSource + 1];
    coordinates[seamTarget + 2] = coordinates[seamSource + 2];
  }
  return { patchId, verticalDivisions, coordinates };
}

interface JunctionCopy {
  readonly receiver: AnnularRadialSolidPatchId;
  readonly receiverRow: 'v0' | 'v1';
  readonly owner: AnnularRadialSolidPatchId;
  readonly ownerRow: 'v0' | 'v1';
  readonly reverseFreeParameter: boolean;
}

// Receiver-centric restatement of the atlas's six non-periodic junctions with
// their declared owners (lexicographically smaller patch/side pair) and exact
// free-parameter reversals, as pinned by singlePatchAnnularRadialSolidTarget's
// junction-identity proofs.
const JUNCTION_COPIES: readonly JunctionCopy[] = Object.freeze([
  { receiver: 'top-rim', receiverRow: 'v1', owner: 'outer-wall', ownerRow: 'v1', reverseFreeParameter: true },
  { receiver: 'top-rim', receiverRow: 'v0', owner: 'inner-wall', ownerRow: 'v1', reverseFreeParameter: false },
  { receiver: 'inner-wall', receiverRow: 'v0', owner: 'bottom-top', ownerRow: 'v1', reverseFreeParameter: false },
  { receiver: 'drain-wall', receiverRow: 'v1', owner: 'bottom-top', ownerRow: 'v0', reverseFreeParameter: false },
  { receiver: 'drain-wall', receiverRow: 'v0', owner: 'bottom-under', ownerRow: 'v0', reverseFreeParameter: true },
  { receiver: 'outer-wall', receiverRow: 'v0', owner: 'bottom-under', ownerRow: 'v1', reverseFreeParameter: false },
]);

function rowStation(grid: PatchGrid, row: 'v0' | 'v1'): number {
  return row === 'v0' ? 0 : grid.verticalDivisions;
}

function applyJunctionWelds(
  grids: ReadonlyMap<string, PatchGrid>,
  angularDivisions: number
): void {
  for (const copy of JUNCTION_COPIES) {
    const receiver = grids.get(copy.receiver);
    const owner = grids.get(copy.owner);
    if (receiver === undefined || owner === undefined) {
      invalid(`junction weld references missing patch '${copy.receiver}'/'${copy.owner}'`);
    }
    const receiverRow = rowStation(receiver, copy.receiverRow);
    const ownerRow = rowStation(owner, copy.ownerRow);
    for (let uStation = 0; uStation <= angularDivisions; uStation += 1) {
      const ownerStation = copy.reverseFreeParameter ? angularDivisions - uStation : uStation;
      const source = gridIndex(angularDivisions, ownerStation, ownerRow);
      const target = gridIndex(angularDivisions, uStation, receiverRow);
      receiver.coordinates[target] = owner.coordinates[source];
      receiver.coordinates[target + 1] = owner.coordinates[source + 1];
      receiver.coordinates[target + 2] = owner.coordinates[source + 2];
    }
  }
}

/**
 * Mesh the authenticated annular atlas into final STL bytes plus the exact
 * dyadic patch partitions required by the continuous mapped-distance proof.
 */
export function tessellateAnnularRadialSolidTargetForCertification(
  binding: SinglePatchAnnularRadialSolidTargetBinding,
  options: AnnularSolidReferenceTessellationOptions
): AnnularSolidReferenceTessellation {
  const authenticated = singlePatchAnnularRadialSolidTargetForProof(binding);
  if (typeof options !== 'object' || options === null) {
    invalid('options must be a record');
  }
  if (authenticated.atlasComplex !== undefined) {
    return tessellateLayeredAtlas(authenticated, authenticated.atlasComplex, options);
  }
  const angularLog2 = divisionsLog2(
    options.angularDivisionsLog2,
    MAX_ANGULAR_DIVISIONS_LOG2,
    'angularDivisionsLog2'
  );
  const verticalByPatch = options.verticalDivisionsLog2ByPatch;
  if (typeof verticalByPatch !== 'object' || verticalByPatch === null) {
    invalid('verticalDivisionsLog2ByPatch must be a record');
  }
  const angularResolved = resolveStations(
    'outer-wall',
    angularLog2,
    options.angularStations
  );
  if (options.angularStations !== undefined) {
    // Reversed junction welds mirror station indices, which is only exact
    // when the ladder itself is symmetric under s -> 1 - s.
    const numerators = angularResolved.numerators;
    const denominator =
      angularResolved.oddDenominatorFactor * 2 ** angularResolved.log2Denominator;
    for (let station = 0; station < numerators.length; station += 1) {
      if (
        numerators[station] !==
        denominator - numerators[numerators.length - 1 - station]
      ) {
        invalid('angularStations must be symmetric under reversal (s -> 1 - s)');
      }
    }
  }
  const angularDivisions = angularResolved.numerators.length - 1;
  const ladders = options.verticalStationsByPatch ?? {};
  if (typeof ladders !== 'object' || ladders === null) {
    invalid('verticalStationsByPatch must be a record when present');
  }
  const stationsByPatch: Map<string, ResolvedStations> = new Map();
  for (const patchId of PATCH_IDS) {
    const uniformLog2 = divisionsLog2(
      verticalByPatch[patchId],
      MAX_VERTICAL_DIVISIONS_LOG2,
      `verticalDivisionsLog2ByPatch['${patchId}']`
    );
    stationsByPatch.set(patchId, resolveStations(patchId, uniformLog2, ladders[patchId]));
  }

  const programs = authenticated.programs;
  if (programs.length !== PATCH_IDS.length) {
    invalid(`atlas must carry exactly ${PATCH_IDS.length} patch programs`);
  }
  const conformingByPatch = options.conformingLinesByPatch ?? {};
  if (typeof conformingByPatch !== 'object' || conformingByPatch === null) {
    invalid('conformingLinesByPatch must be a record when present');
  }
  const chordsByPatch = options.conformingChordsByPatch ?? {};
  if (typeof chordsByPatch !== 'object' || chordsByPatch === null) {
    invalid('conformingChordsByPatch must be a record when present');
  }
  const frames = new Map<string, PatchPartitionFrame>();
  let triangleCount = 0;
  for (const program of programs) {
    const stations = stationsByPatch.get(program.patchId);
    if (stations === undefined) invalid(`unknown atlas patch '${program.patchId}'`);
    const rawLines = conformingByPatch[program.patchId as AnnularRadialSolidPatchId];
    const lines =
      rawLines === undefined ? [] : validateConformingLines(program.patchId, rawLines);
    const rawChords = chordsByPatch[program.patchId as AnnularRadialSolidPatchId];
    if (rawChords !== undefined && (!Array.isArray(rawChords) || rawChords.length === 0)) {
      invalid(
        `conformingChordsByPatch['${program.patchId}'] must be a non-empty array when present`
      );
    }
    const frame = buildPatchPartitionFrame(
      program.patchId,
      angularResolved,
      stations,
      lines,
      rawChords ?? []
    );
    frames.set(program.patchId, frame);
    triangleCount += frame.patchTriangleCount;
  }
  if (triangleCount > MAX_REFERENCE_TRIANGLES) {
    invalid(`requested grid needs ${triangleCount} triangles > ${MAX_REFERENCE_TRIANGLES}`);
  }

  const grids = new Map<string, PatchGrid>();
  for (const program of programs) {
    const stations = stationsByPatch.get(program.patchId);
    if (stations === undefined) invalid(`unknown atlas patch '${program.patchId}'`);
    grids.set(
      program.patchId,
      evaluatePatchGrid(
        program.patchId,
        program.backends.evaluateFloat64,
        angularResolved.values,
        stations.values
      )
    );
  }
  applyJunctionWelds(grids, angularDivisions);

  const { stlBytes, partitions } = buildAtlasStlAndPartitions(
    programs,
    grids,
    frames,
    angularDivisions,
    triangleCount
  );

  return Object.freeze({
    stlBytes,
    triangleCount,
    partitions: Object.freeze(partitions),
  });
}

/**
 * Emit final binary-STL bytes plus one exact dyadic partition per patch, in
 * program order. Shared by the single-patch and the layered multi-patch paths;
 * the per-triangle vertex ordering is unchanged, so single-patch output stays
 * byte-for-byte identical.
 */
function buildAtlasStlAndPartitions(
  programs: readonly AnnularRadialSolidTargetProgram[],
  grids: ReadonlyMap<string, PatchGrid>,
  frames: ReadonlyMap<string, PatchPartitionFrame>,
  angularDivisions: number,
  triangleCount: number
): { readonly stlBytes: Uint8Array; readonly partitions: ExactDyadicDomainPartitionInput[] } {
  const stlBytes = new Uint8Array(84 + triangleCount * 50);
  const view = new DataView(stlBytes.buffer);
  view.setUint32(80, triangleCount, true);
  const partitions: ExactDyadicDomainPartitionInput[] = [];
  let artifactTriangleIndex = 0;
  for (const program of programs) {
    const grid = grids.get(program.patchId);
    const frame = frames.get(program.patchId);
    if (grid === undefined || frame === undefined) {
      invalid(`unknown atlas patch '${program.patchId}'`);
    }
    const verticalDivisions = grid.verticalDivisions;
    const declaredDenominator = frame.declaredDenominator;
    const maxNumerator = declaredDenominator.toString();
    // Grid corners resolve to the pre-evaluated (junction-welded, seam-copied)
    // grid coordinates; conforming intersection vertices are strictly interior
    // (boundary/seam crossings are refused or forced onto stations), so they
    // evaluate directly and memoize so shared edges reuse bit-identical floats.
    const angularIndexByNumerator = new Map<number, number>();
    frame.scaledAngularNumerators.forEach((numerator, index) => {
      angularIndexByNumerator.set(numerator, index);
    });
    const verticalIndexByNumerator = new Map<number, number>();
    frame.scaledVerticalNumerators.forEach((numerator, index) => {
      verticalIndexByNumerator.set(numerator, index);
    });
    const extraCoordinateMemo = new Map<string, readonly [number, number, number]>();
    const vertexCoordinates = (point: ExactUvPoint): readonly [number, number, number] => {
      const uNumerator = Number(point.U);
      const vNumerator = Number(point.V);
      const uIndex = angularIndexByNumerator.get(uNumerator);
      const vIndex = verticalIndexByNumerator.get(vNumerator);
      if (uIndex !== undefined && vIndex !== undefined) {
        const source = gridIndex(angularDivisions, uIndex, vIndex);
        return [
          grid.coordinates[source],
          grid.coordinates[source + 1],
          grid.coordinates[source + 2],
        ];
      }
      const key = `${uNumerator},${vNumerator}`;
      const memoized = extraCoordinateMemo.get(key);
      if (memoized !== undefined) return memoized;
      const evaluated = program.backends.evaluateFloat64(
        uNumerator / declaredDenominator,
        vNumerator / declaredDenominator
      );
      if (
        !Number.isFinite(evaluated[0]) ||
        !Number.isFinite(evaluated[1]) ||
        !Number.isFinite(evaluated[2])
      ) {
        invalid(`patch '${program.patchId}' evaluated a non-finite coordinate`);
      }
      const frozen = Object.freeze([evaluated[0], evaluated[1], evaluated[2]] as const);
      extraCoordinateMemo.set(key, frozen);
      return frozen;
    };
    const triangles: {
      artifactTriangleIndex: number;
      vertices: readonly [
        { uNumerator: string; vNumerator: string },
        { uNumerator: string; vNumerator: string },
        { uNumerator: string; vNumerator: string },
      ];
    }[] = [];
    for (let vCell = 0; vCell < verticalDivisions; vCell += 1) {
      for (let uCell = 0; uCell < angularDivisions; uCell += 1) {
        // Two CCW parameter triangles per uncrossed cell (exactly the plain
        // grid emission), or the conforming piece fan for cells split along
        // feature lines; STL vertices reuse the exact station/intersection
        // order so the proof's vertex-wise correspondence holds.
        const conforming = frame.pieces.get(vCell * angularDivisions + uCell);
        let cellTriangles: readonly (readonly [ExactUvPoint, ExactUvPoint, ExactUvPoint])[];
        if (conforming === undefined) {
          const U0 = BigInt(frame.scaledAngularNumerators[uCell]);
          const U1 = BigInt(frame.scaledAngularNumerators[uCell + 1]);
          const V0 = BigInt(frame.scaledVerticalNumerators[vCell]);
          const V1 = BigInt(frame.scaledVerticalNumerators[vCell + 1]);
          const corner0 = { U: U0, V: V0 };
          const corner1 = { U: U1, V: V0 };
          const corner2 = { U: U1, V: V1 };
          const corner3 = { U: U0, V: V1 };
          cellTriangles = [
            [corner0, corner1, corner2],
            [corner0, corner2, corner3],
          ];
        } else {
          cellTriangles = conforming;
        }
        for (const cellTriangle of cellTriangles) {
          const byteBase = 84 + artifactTriangleIndex * 50;
          cellTriangle.forEach((point, vertexIndex) => {
            const coordinates = vertexCoordinates(point);
            const vertexBase = byteBase + 12 + vertexIndex * 12;
            view.setFloat32(vertexBase, coordinates[0], true);
            view.setFloat32(vertexBase + 4, coordinates[1], true);
            view.setFloat32(vertexBase + 8, coordinates[2], true);
          });
          triangles.push({
            artifactTriangleIndex,
            vertices: [
              {
                uNumerator: cellTriangle[0].U.toString(),
                vNumerator: cellTriangle[0].V.toString(),
              },
              {
                uNumerator: cellTriangle[1].U.toString(),
                vNumerator: cellTriangle[1].V.toString(),
              },
              {
                uNumerator: cellTriangle[2].U.toString(),
                vNumerator: cellTriangle[2].V.toString(),
              },
            ],
          });
          artifactTriangleIndex += 1;
        }
      }
    }
    partitions.push({
      patchId: program.patchId,
      fractionBits: frame.fractionBits,
      ...(frame.oddFactor === 1
        ? {}
        : { oddDenominatorFactor: frame.oddFactor.toString() }),
      domain: {
        minUNumerator: '0',
        maxUNumerator: maxNumerator,
        minVNumerator: '0',
        maxVNumerator: maxNumerator,
      },
      artifactTriangleCount: triangleCount,
      triangles,
    });
  }

  return { stlBytes, partitions };
}

/**
 * Copy each owner boundary row into its receiver row (with the declared exact
 * angular-station reversal) so the shared row is bit-identical by index. The
 * layered atlas guarantees no owner row is also a receiver row, so welds are
 * order-independent.
 */
function applyAtlasJunctionWelds(
  grids: ReadonlyMap<string, PatchGrid>,
  copies: readonly AtlasJunctionCopy[],
  angularDivisions: number
): void {
  for (const copy of copies) {
    const receiver = grids.get(copy.receiverPatchId);
    const owner = grids.get(copy.ownerPatchId);
    if (receiver === undefined || owner === undefined) {
      invalid(
        `layered weld references missing patch '${copy.receiverPatchId}'/'${copy.ownerPatchId}'`
      );
    }
    const receiverRow = copy.receiverRow === 'v0' ? 0 : receiver.verticalDivisions;
    const ownerRow = copy.ownerRow === 'v0' ? 0 : owner.verticalDivisions;
    for (let uStation = 0; uStation <= angularDivisions; uStation += 1) {
      const ownerStation = copy.reverseFreeParameter ? angularDivisions - uStation : uStation;
      const source = gridIndex(angularDivisions, ownerStation, ownerRow);
      const target = gridIndex(angularDivisions, uStation, receiverRow);
      receiver.coordinates[target] = owner.coordinates[source];
      receiver.coordinates[target + 1] = owner.coordinates[source + 1];
      receiver.coordinates[target + 2] = owner.coordinates[source + 2];
    }
  }
}

/**
 * EXACT AUDIT (riser weld). After all welds, every receiver boundary vertex must
 * be bit-identical to its owner vertex at the reversed index — proving each riser
 * is watertight by shared index with no T-junction and that no later weld silently
 * broke an earlier one. Fail-closed.
 */
function auditAtlasJunctionWelds(
  grids: ReadonlyMap<string, PatchGrid>,
  copies: readonly AtlasJunctionCopy[],
  angularDivisions: number
): void {
  for (const copy of copies) {
    const receiver = grids.get(copy.receiverPatchId);
    const owner = grids.get(copy.ownerPatchId);
    if (receiver === undefined || owner === undefined) {
      invalid('layered weld audit references a missing patch');
    }
    const receiverRow = copy.receiverRow === 'v0' ? 0 : receiver.verticalDivisions;
    const ownerRow = copy.ownerRow === 'v0' ? 0 : owner.verticalDivisions;
    for (let uStation = 0; uStation <= angularDivisions; uStation += 1) {
      const ownerStation = copy.reverseFreeParameter ? angularDivisions - uStation : uStation;
      const source = gridIndex(angularDivisions, ownerStation, ownerRow);
      const target = gridIndex(angularDivisions, uStation, receiverRow);
      if (
        receiver.coordinates[target] !== owner.coordinates[source] ||
        receiver.coordinates[target + 1] !== owner.coordinates[source + 1] ||
        receiver.coordinates[target + 2] !== owner.coordinates[source + 2]
      ) {
        invalid(
          `layered riser weld not watertight by index at '${copy.receiverPatchId}':${copy.receiverRow} station ${uStation}`
        );
      }
    }
  }
}

/**
 * EXACT AUDIT (global assignment). Every STL triangle is assigned to exactly one
 * patch partition and the union covers every triangle — the disjoint + complete
 * property the per-patch exact-BigInt kernel does not itself check across
 * patches. Pure integer indices; fail-closed.
 */
function auditGlobalTriangleAssignment(
  partitions: readonly ExactDyadicDomainPartitionInput[],
  triangleCount: number
): void {
  const seen = new Uint8Array(triangleCount);
  let assigned = 0;
  for (const partition of partitions) {
    if (partition.artifactTriangleCount !== triangleCount) {
      invalid('layered partition artifactTriangleCount disagrees with the global triangle count');
    }
    for (const triangle of partition.triangles) {
      const index = triangle.artifactTriangleIndex;
      if (!Number.isInteger(index) || index < 0 || index >= triangleCount) {
        invalid(`layered artifact triangle index ${index} is out of range`);
      }
      if (seen[index] !== 0) {
        invalid(`layered artifact triangle index ${index} is assigned to more than one patch`);
      }
      seen[index] = 1;
      assigned += 1;
    }
  }
  if (assigned !== triangleCount) {
    invalid(`layered atlas assigned ${assigned} triangles but expected ${triangleCount}`);
  }
}

/**
 * Mesh the layered multi-patch atlas (R bands + R-1 curtains + 5 base patches)
 * into final STL bytes plus one exact dyadic partition per patch. Bands use the
 * `outer-wall` vertical division count; the five base patches use their own; the
 * ruled curtains use their fixed count. Two exact audits (riser weld by index,
 * global triangle assignment) run before the bytes are returned; the final
 * structural proof is the watertight/manifold/genus backstop.
 */
function tessellateLayeredAtlas(
  authenticated: SinglePatchAnnularRadialSolidTargetBinding,
  atlas: MultiPatchAtlasComplex,
  options: AnnularSolidReferenceTessellationOptions
): AnnularSolidReferenceTessellation {
  const angularLog2 = divisionsLog2(
    options.angularDivisionsLog2,
    MAX_ANGULAR_DIVISIONS_LOG2,
    'angularDivisionsLog2'
  );
  const verticalByPatch = options.verticalDivisionsLog2ByPatch;
  if (typeof verticalByPatch !== 'object' || verticalByPatch === null) {
    invalid('verticalDivisionsLog2ByPatch must be a record');
  }
  const angularResolved = resolveStations('outer-wall', angularLog2, options.angularStations);
  if (options.angularStations !== undefined) {
    const numerators = angularResolved.numerators;
    const denominator =
      angularResolved.oddDenominatorFactor * 2 ** angularResolved.log2Denominator;
    for (let station = 0; station < numerators.length; station += 1) {
      if (
        numerators[station] !==
        denominator - numerators[numerators.length - 1 - station]
      ) {
        invalid('angularStations must be symmetric under reversal (s -> 1 - s)');
      }
    }
  }
  const angularDivisions = angularResolved.numerators.length - 1;

  const programs = authenticated.programs;
  const programByPatch = new Map(programs.map((program) => [program.patchId, program]));
  if (
    programByPatch.size !== programs.length ||
    programs.length !== atlas.patchLayouts.length
  ) {
    invalid('layered atlas program list disagrees with the patch layout');
  }

  const stationsByPatch = new Map<string, ResolvedStations>();
  for (const layout of atlas.patchLayouts) {
    const uniformLog2 =
      layout.verticalDivisions.kind === 'role'
        ? divisionsLog2(
            verticalByPatch[layout.verticalDivisions.role],
            MAX_VERTICAL_DIVISIONS_LOG2,
            `verticalDivisionsLog2ByPatch['${layout.verticalDivisions.role}']`
          )
        : divisionsLog2(
            layout.verticalDivisions.log2,
            MAX_VERTICAL_DIVISIONS_LOG2,
            `atlas fixed divisions for '${layout.patchId}'`
          );
    stationsByPatch.set(
      layout.patchId,
      resolveStations(layout.patchId, uniformLog2, undefined)
    );
  }

  const frames = new Map<string, PatchPartitionFrame>();
  let triangleCount = 0;
  for (const layout of atlas.patchLayouts) {
    const stations = stationsByPatch.get(layout.patchId);
    if (stations === undefined) invalid(`unknown atlas patch '${layout.patchId}'`);
    // Layered atlas patches are plain grids: no conforming lines or chords.
    const frame = buildPatchPartitionFrame(layout.patchId, angularResolved, stations, [], []);
    frames.set(layout.patchId, frame);
    triangleCount += frame.patchTriangleCount;
  }
  if (triangleCount > MAX_REFERENCE_TRIANGLES) {
    invalid(`layered atlas needs ${triangleCount} triangles > ${MAX_REFERENCE_TRIANGLES}`);
  }

  const grids = new Map<string, PatchGrid>();
  for (const layout of atlas.patchLayouts) {
    const program = programByPatch.get(layout.patchId);
    if (program === undefined) invalid(`layered atlas patch '${layout.patchId}' has no program`);
    const stations = stationsByPatch.get(layout.patchId);
    if (stations === undefined) invalid(`unknown atlas patch '${layout.patchId}'`);
    grids.set(
      layout.patchId,
      evaluatePatchGrid(
        layout.patchId,
        program.backends.evaluateFloat64,
        angularResolved.values,
        stations.values
      )
    );
  }
  applyAtlasJunctionWelds(grids, atlas.junctionCopies, angularDivisions);
  auditAtlasJunctionWelds(grids, atlas.junctionCopies, angularDivisions);

  const { stlBytes, partitions } = buildAtlasStlAndPartitions(
    programs,
    grids,
    frames,
    angularDivisions,
    triangleCount
  );
  auditGlobalTriangleAssignment(partitions, triangleCount);

  return Object.freeze({
    stlBytes,
    triangleCount,
    partitions: Object.freeze(partitions),
  });
}
