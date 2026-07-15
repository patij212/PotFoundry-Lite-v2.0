import { sha256Utf8 } from './incrementalSha256';

export const EXACT_PICOMETRE_TRIANGLE_INTERSECTION_VERSION =
  'potfoundry.exact-int64-picometre-triangle-intersection/v1' as const;
export const EXACT_PICOMETRE_TRIANGLE_INTERSECTION_PROOF_SHA256 = sha256Utf8(
  [
    EXACT_PICOMETRE_TRIANGLE_INTERSECTION_VERSION,
    'input coordinates = exact signed int64 picometres',
    'all 2D and 3D orientation determinants = unbounded bigint arithmetic',
    'projection axis = first coordinate plane with an exactly nonzero projected orientation',
    'non-coplanar overlap = six closed segment/triangle tests',
    'coplanar overlap = exactly nondegenerate projection with exact segment and containment tests',
    'allowed contact = only the exact common vertex or exact common edge simplex',
  ].join('\n')
);

export type ExactPicometreTriangle = BigInt64Array;

function validateTriangle(triangle: ExactPicometreTriangle, label: string): void {
  if (!(triangle instanceof BigInt64Array) || triangle.length < 9) {
    throw new TypeError(`${label} must be a BigInt64Array containing three xyz vertices`);
  }
}

function minimum(first: bigint, second: bigint): bigint {
  return first < second ? first : second;
}

function maximum(first: bigint, second: bigint): bigint {
  return first > second ? first : second;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function samePoint(
  first: ExactPicometreTriangle,
  firstOffset: number,
  second: ExactPicometreTriangle,
  secondOffset: number
): boolean {
  return (
    first[firstOffset] === second[secondOffset] &&
    first[firstOffset + 1] === second[secondOffset + 1] &&
    first[firstOffset + 2] === second[secondOffset + 2]
  );
}

function orient2d(
  first: ExactPicometreTriangle,
  firstOffset: number,
  second: ExactPicometreTriangle,
  secondOffset: number,
  third: ExactPicometreTriangle,
  thirdOffset: number,
  axis0: number,
  axis1: number
): bigint {
  const ab0 = second[secondOffset + axis0] - first[firstOffset + axis0];
  const ab1 = second[secondOffset + axis1] - first[firstOffset + axis1];
  const ac0 = third[thirdOffset + axis0] - first[firstOffset + axis0];
  const ac1 = third[thirdOffset + axis1] - first[firstOffset + axis1];
  return ab0 * ac1 - ab1 * ac0;
}

function orient3d(
  first: ExactPicometreTriangle,
  firstOffset: number,
  second: ExactPicometreTriangle,
  secondOffset: number,
  third: ExactPicometreTriangle,
  thirdOffset: number,
  fourth: ExactPicometreTriangle,
  fourthOffset: number
): bigint {
  const ax = first[firstOffset] - fourth[fourthOffset];
  const ay = first[firstOffset + 1] - fourth[fourthOffset + 1];
  const az = first[firstOffset + 2] - fourth[fourthOffset + 2];
  const bx = second[secondOffset] - fourth[fourthOffset];
  const by = second[secondOffset + 1] - fourth[fourthOffset + 1];
  const bz = second[secondOffset + 2] - fourth[fourthOffset + 2];
  const cx = third[thirdOffset] - fourth[fourthOffset];
  const cy = third[thirdOffset + 1] - fourth[fourthOffset + 1];
  const cz = third[thirdOffset + 2] - fourth[fourthOffset + 2];
  return (
    ax * (by * cz - bz * cy) -
    ay * (bx * cz - bz * cx) +
    az * (bx * cy - by * cx)
  );
}

/** Exact zero-area classification over signed int64 picometre vertices. */
export function exactPicometreTriangleIsDegenerate(
  triangle: ExactPicometreTriangle
): boolean {
  validateTriangle(triangle, 'triangle');
  return (
    orient2d(triangle, 0, triangle, 3, triangle, 6, 0, 1) === 0n &&
    orient2d(triangle, 0, triangle, 3, triangle, 6, 0, 2) === 0n &&
    orient2d(triangle, 0, triangle, 3, triangle, 6, 1, 2) === 0n
  );
}

function isSharedPoint(
  point: ExactPicometreTriangle,
  pointOffset: number,
  first: ExactPicometreTriangle,
  second: ExactPicometreTriangle
): boolean {
  let inFirst = false;
  let inSecond = false;
  for (let offset = 0; offset < 9; offset += 3) {
    inFirst ||= samePoint(point, pointOffset, first, offset);
    inSecond ||= samePoint(point, pointOffset, second, offset);
  }
  return inFirst && inSecond;
}

function sharedPointCount(
  first: ExactPicometreTriangle,
  second: ExactPicometreTriangle
): number {
  let count = 0;
  for (let firstOffset = 0; firstOffset < 9; firstOffset += 3) {
    for (let secondOffset = 0; secondOffset < 9; secondOffset += 3) {
      if (samePoint(first, firstOffset, second, secondOffset)) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

function projectedAxes(triangle: ExactPicometreTriangle): readonly [number, number] {
  if (orient2d(triangle, 0, triangle, 3, triangle, 6, 0, 1) !== 0n) return [0, 1];
  if (orient2d(triangle, 0, triangle, 3, triangle, 6, 0, 2) !== 0n) return [0, 2];
  if (orient2d(triangle, 0, triangle, 3, triangle, 6, 1, 2) !== 0n) return [1, 2];
  throw new RangeError('Cannot project an exactly degenerate picometre triangle');
}

function onProjectedSegment(
  point: ExactPicometreTriangle,
  pointOffset: number,
  start: ExactPicometreTriangle,
  startOffset: number,
  end: ExactPicometreTriangle,
  endOffset: number,
  axis0: number,
  axis1: number
): boolean {
  const point0 = point[pointOffset + axis0];
  const point1 = point[pointOffset + axis1];
  return (
    point0 >= minimum(start[startOffset + axis0], end[endOffset + axis0]) &&
    point0 <= maximum(start[startOffset + axis0], end[endOffset + axis0]) &&
    point1 >= minimum(start[startOffset + axis1], end[endOffset + axis1]) &&
    point1 <= maximum(start[startOffset + axis1], end[endOffset + axis1])
  );
}

function sameExactEdge(
  firstStart: ExactPicometreTriangle,
  firstStartOffset: number,
  firstEnd: ExactPicometreTriangle,
  firstEndOffset: number,
  secondStart: ExactPicometreTriangle,
  secondStartOffset: number,
  secondEnd: ExactPicometreTriangle,
  secondEndOffset: number
): boolean {
  return (
    (samePoint(firstStart, firstStartOffset, secondStart, secondStartOffset) &&
      samePoint(firstEnd, firstEndOffset, secondEnd, secondEndOffset)) ||
    (samePoint(firstStart, firstStartOffset, secondEnd, secondEndOffset) &&
      samePoint(firstEnd, firstEndOffset, secondStart, secondStartOffset))
  );
}

function pointInProjectedTriangle(
  point: ExactPicometreTriangle,
  pointOffset: number,
  triangle: ExactPicometreTriangle,
  axis0: number,
  axis1: number
): boolean {
  const side0 = orient2d(triangle, 0, triangle, 3, point, pointOffset, axis0, axis1);
  const side1 = orient2d(triangle, 3, triangle, 6, point, pointOffset, axis0, axis1);
  const side2 = orient2d(triangle, 6, triangle, 0, point, pointOffset, axis0, axis1);
  return (
    (side0 >= 0n && side1 >= 0n && side2 >= 0n) ||
    (side0 <= 0n && side1 <= 0n && side2 <= 0n)
  );
}

function projectedSegmentsHaveForbiddenContact(
  firstStart: ExactPicometreTriangle,
  firstStartOffset: number,
  firstEnd: ExactPicometreTriangle,
  firstEndOffset: number,
  secondStart: ExactPicometreTriangle,
  secondStartOffset: number,
  secondEnd: ExactPicometreTriangle,
  secondEndOffset: number,
  firstTriangle: ExactPicometreTriangle,
  secondTriangle: ExactPicometreTriangle,
  axis0: number,
  axis1: number
): boolean {
  const side0 = orient2d(
    firstStart, firstStartOffset, firstEnd, firstEndOffset,
    secondStart, secondStartOffset, axis0, axis1
  );
  const side1 = orient2d(
    firstStart, firstStartOffset, firstEnd, firstEndOffset,
    secondEnd, secondEndOffset, axis0, axis1
  );
  const side2 = orient2d(
    secondStart, secondStartOffset, secondEnd, secondEndOffset,
    firstStart, firstStartOffset, axis0, axis1
  );
  const side3 = orient2d(
    secondStart, secondStartOffset, secondEnd, secondEndOffset,
    firstEnd, firstEndOffset, axis0, axis1
  );

  if (
    ((side0 > 0n && side1 < 0n) || (side0 < 0n && side1 > 0n)) &&
    ((side2 > 0n && side3 < 0n) || (side2 < 0n && side3 > 0n))
  ) {
    return true;
  }

  if (side0 === 0n && side1 === 0n && side2 === 0n && side3 === 0n) {
    const firstDelta0 = absolute(
      firstEnd[firstEndOffset + axis0] - firstStart[firstStartOffset + axis0]
    );
    const firstDelta1 = absolute(
      firstEnd[firstEndOffset + axis1] - firstStart[firstStartOffset + axis1]
    );
    const overlapAxis = firstDelta0 >= firstDelta1 ? axis0 : axis1;
    const overlapLow = maximum(
      minimum(firstStart[firstStartOffset + overlapAxis], firstEnd[firstEndOffset + overlapAxis]),
      minimum(secondStart[secondStartOffset + overlapAxis], secondEnd[secondEndOffset + overlapAxis])
    );
    const overlapHigh = minimum(
      maximum(firstStart[firstStartOffset + overlapAxis], firstEnd[firstEndOffset + overlapAxis]),
      maximum(secondStart[secondStartOffset + overlapAxis], secondEnd[secondEndOffset + overlapAxis])
    );
    if (overlapLow < overlapHigh) {
      return !sameExactEdge(
        firstStart,
        firstStartOffset,
        firstEnd,
        firstEndOffset,
        secondStart,
        secondStartOffset,
        secondEnd,
        secondEndOffset
      );
    }
  }

  const contacts: ReadonlyArray<
    readonly [
      ExactPicometreTriangle,
      number,
      ExactPicometreTriangle,
      number,
      ExactPicometreTriangle,
      number,
      bigint,
    ]
  > = [
    [secondStart, secondStartOffset, firstStart, firstStartOffset, firstEnd, firstEndOffset, side0],
    [secondEnd, secondEndOffset, firstStart, firstStartOffset, firstEnd, firstEndOffset, side1],
    [firstStart, firstStartOffset, secondStart, secondStartOffset, secondEnd, secondEndOffset, side2],
    [firstEnd, firstEndOffset, secondStart, secondStartOffset, secondEnd, secondEndOffset, side3],
  ];
  for (const [point, pointOffset, start, startOffset, end, endOffset, side] of contacts) {
    if (
      side === 0n &&
      onProjectedSegment(point, pointOffset, start, startOffset, end, endOffset, axis0, axis1) &&
      !isSharedPoint(point, pointOffset, firstTriangle, secondTriangle)
    ) {
      return true;
    }
  }
  return false;
}

function coplanarSegmentHasForbiddenContact(
  start: ExactPicometreTriangle,
  startOffset: number,
  end: ExactPicometreTriangle,
  endOffset: number,
  triangle: ExactPicometreTriangle,
  firstTriangle: ExactPicometreTriangle,
  secondTriangle: ExactPicometreTriangle
): boolean {
  const [axis0, axis1] = projectedAxes(triangle);
  for (let edge = 0; edge < 3; edge += 1) {
    const edgeOffset = edge * 3;
    const nextOffset = ((edge + 1) % 3) * 3;
    if (
      projectedSegmentsHaveForbiddenContact(
        start,
        startOffset,
        end,
        endOffset,
        triangle,
        edgeOffset,
        triangle,
        nextOffset,
        firstTriangle,
        secondTriangle,
        axis0,
        axis1
      )
    ) {
      return true;
    }
  }
  return (
    (!isSharedPoint(start, startOffset, firstTriangle, secondTriangle) &&
      pointInProjectedTriangle(start, startOffset, triangle, axis0, axis1)) ||
    (!isSharedPoint(end, endOffset, firstTriangle, secondTriangle) &&
      pointInProjectedTriangle(end, endOffset, triangle, axis0, axis1))
  );
}

function coplanarTrianglesHaveForbiddenContact(
  first: ExactPicometreTriangle,
  second: ExactPicometreTriangle
): boolean {
  if (sharedPointCount(first, second) === 3) return true;
  const [axis0, axis1] = projectedAxes(first);
  for (let firstEdge = 0; firstEdge < 3; firstEdge += 1) {
    const firstOffset = firstEdge * 3;
    const firstNext = ((firstEdge + 1) % 3) * 3;
    for (let secondEdge = 0; secondEdge < 3; secondEdge += 1) {
      const secondOffset = secondEdge * 3;
      const secondNext = ((secondEdge + 1) % 3) * 3;
      if (
        projectedSegmentsHaveForbiddenContact(
          first,
          firstOffset,
          first,
          firstNext,
          second,
          secondOffset,
          second,
          secondNext,
          first,
          second,
          axis0,
          axis1
        )
      ) {
        return true;
      }
    }
  }
  for (let offset = 0; offset < 9; offset += 3) {
    if (
      !isSharedPoint(first, offset, first, second) &&
      pointInProjectedTriangle(first, offset, second, axis0, axis1)
    ) {
      return true;
    }
    if (
      !isSharedPoint(second, offset, first, second) &&
      pointInProjectedTriangle(second, offset, first, axis0, axis1)
    ) {
      return true;
    }
  }
  return false;
}

function planeSide(
  triangle: ExactPicometreTriangle,
  point: ExactPicometreTriangle,
  pointOffset: number
): bigint {
  return orient3d(triangle, 0, triangle, 3, triangle, 6, point, pointOffset);
}

function lineSide(
  start: ExactPicometreTriangle,
  startOffset: number,
  end: ExactPicometreTriangle,
  endOffset: number,
  first: ExactPicometreTriangle,
  firstOffset: number,
  second: ExactPicometreTriangle,
  secondOffset: number
): bigint {
  return orient3d(
    start,
    startOffset,
    end,
    endOffset,
    first,
    firstOffset,
    second,
    secondOffset
  );
}

function segmentHasForbiddenTriangleContact(
  start: ExactPicometreTriangle,
  startOffset: number,
  end: ExactPicometreTriangle,
  endOffset: number,
  triangle: ExactPicometreTriangle,
  firstTriangle: ExactPicometreTriangle,
  secondTriangle: ExactPicometreTriangle
): boolean {
  const startSide = planeSide(triangle, start, startOffset);
  const endSide = planeSide(triangle, end, endOffset);
  if ((startSide > 0n && endSide > 0n) || (startSide < 0n && endSide < 0n)) return false;
  if (startSide === 0n && endSide === 0n) {
    return coplanarSegmentHasForbiddenContact(
      start,
      startOffset,
      end,
      endOffset,
      triangle,
      firstTriangle,
      secondTriangle
    );
  }
  const [axis0, axis1] = projectedAxes(triangle);
  if (startSide === 0n) {
    return (
      pointInProjectedTriangle(start, startOffset, triangle, axis0, axis1) &&
      !isSharedPoint(start, startOffset, firstTriangle, secondTriangle)
    );
  }
  if (endSide === 0n) {
    return (
      pointInProjectedTriangle(end, endOffset, triangle, axis0, axis1) &&
      !isSharedPoint(end, endOffset, firstTriangle, secondTriangle)
    );
  }
  const edgeSide0 = lineSide(start, startOffset, end, endOffset, triangle, 0, triangle, 3);
  const edgeSide1 = lineSide(start, startOffset, end, endOffset, triangle, 3, triangle, 6);
  const edgeSide2 = lineSide(start, startOffset, end, endOffset, triangle, 6, triangle, 0);
  return (
    (edgeSide0 >= 0n && edgeSide1 >= 0n && edgeSide2 >= 0n) ||
    (edgeSide0 <= 0n && edgeSide1 <= 0n && edgeSide2 <= 0n)
  );
}

function allStrictlySameSide(first: bigint, second: bigint, third: bigint): boolean {
  return (
    (first > 0n && second > 0n && third > 0n) ||
    (first < 0n && second < 0n && third < 0n)
  );
}

/**
 * Return true only when two nondegenerate integer-picometre triangles meet
 * beyond their legitimate exact common vertex or exact common edge.
 */
export function exactPicometreTrianglesHaveForbiddenIntersection(
  first: ExactPicometreTriangle,
  second: ExactPicometreTriangle
): boolean {
  validateTriangle(first, 'first triangle');
  validateTriangle(second, 'second triangle');
  const firstSide0 = planeSide(second, first, 0);
  const firstSide1 = planeSide(second, first, 3);
  const firstSide2 = planeSide(second, first, 6);
  if (allStrictlySameSide(firstSide0, firstSide1, firstSide2)) return false;

  const secondSide0 = planeSide(first, second, 0);
  const secondSide1 = planeSide(first, second, 3);
  const secondSide2 = planeSide(first, second, 6);
  if (allStrictlySameSide(secondSide0, secondSide1, secondSide2)) return false;

  if (firstSide0 === 0n && firstSide1 === 0n && firstSide2 === 0n) {
    return coplanarTrianglesHaveForbiddenContact(first, second);
  }
  for (let edge = 0; edge < 3; edge += 1) {
    const offset = edge * 3;
    const nextOffset = ((edge + 1) % 3) * 3;
    if (
      segmentHasForbiddenTriangleContact(first, offset, first, nextOffset, second, first, second) ||
      segmentHasForbiddenTriangleContact(second, offset, second, nextOffset, first, first, second)
    ) {
      return true;
    }
  }
  return false;
}
