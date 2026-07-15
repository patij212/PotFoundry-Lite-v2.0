import { orient2d, orient3d } from 'robust-predicates';
import { sha256Utf8 } from './incrementalSha256';

export const ROBUST_PREDICATES_VERSION = '3.0.2' as const;
export const ROBUST_PREDICATES_NPM_INTEGRITY =
  'sha512-IXgzBWvWQwE6PrDI05OvmXUIruQTcoMDzRsOd5CDvHCVLcLHMTSYvOK5Cm46kWqlV3yAbuSpBZdJ5oP5OUoStg==' as const;
export const ROBUST_PREDICATES_BUNDLED_SOURCE_SHA256 =
  '5d3b3bec452361e91ecf2e9804e1b01faf03322b6e0a42f7df3ea6233963ed12' as const;
export const EXACT_TRIANGLE_INTERSECTION_VERSION =
  'potfoundry.exact-f32-triangle-intersection/v4' as const;
export const EXACT_TRIANGLE_INTERSECTION_PROOF_MATERIAL = [
  EXACT_TRIANGLE_INTERSECTION_VERSION,
  'input coordinates = finite IEEE-754 binary32 values exactly represented as binary64',
  `orientation dependency = robust-predicates@${ROBUST_PREDICATES_VERSION}; npm-integrity=${ROBUST_PREDICATES_NPM_INTEGRITY}; bundled-source-sha256=${ROBUST_PREDICATES_BUNDLED_SOURCE_SHA256}`,
  'plane and projected orientation signs = adaptive exact predicates from the bound dependency',
  'projection axis = first coordinate plane with a robustly proven nonzero projected orientation',
  'non-coplanar overlap = six closed segment/triangle tests',
  'coplanar overlap = robustly nondegenerate projection with exact-orientation segment and containment tests',
  'allowed contact = only the exact common vertex or exact common edge simplex',
].join('\n');
export const EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256 = sha256Utf8(
  EXACT_TRIANGLE_INTERSECTION_PROOF_MATERIAL
);

export type ExactTriangleCoordinates = Float32Array | Float64Array;

export function exactTriangleIsDegenerate(triangle: ExactTriangleCoordinates): boolean {
  const xy = orient2d(triangle[0], triangle[1], triangle[3], triangle[4], triangle[6], triangle[7]);
  const yz = orient2d(triangle[1], triangle[2], triangle[4], triangle[5], triangle[7], triangle[8]);
  const zx = orient2d(triangle[2], triangle[0], triangle[5], triangle[3], triangle[8], triangle[6]);
  return xy === 0 && yz === 0 && zx === 0;
}

function samePoint(
  first: ExactTriangleCoordinates,
  firstOffset: number,
  second: ExactTriangleCoordinates,
  secondOffset: number
): boolean {
  return (
    first[firstOffset] === second[secondOffset] &&
    first[firstOffset + 1] === second[secondOffset + 1] &&
    first[firstOffset + 2] === second[secondOffset + 2]
  );
}

function isSharedPoint(
  point: ExactTriangleCoordinates,
  pointOffset: number,
  first: ExactTriangleCoordinates,
  second: ExactTriangleCoordinates
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
  first: ExactTriangleCoordinates,
  second: ExactTriangleCoordinates
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

function projectedAxes(triangle: ExactTriangleCoordinates): readonly [number, number] {
  const yzArea = orient2d(
    triangle[1],
    triangle[2],
    triangle[4],
    triangle[5],
    triangle[7],
    triangle[8]
  );
  const xzArea = orient2d(
    triangle[0],
    triangle[2],
    triangle[3],
    triangle[5],
    triangle[6],
    triangle[8]
  );
  const xyArea = orient2d(
    triangle[0],
    triangle[1],
    triangle[3],
    triangle[4],
    triangle[6],
    triangle[7]
  );
  if (xyArea !== 0) return [0, 1];
  if (xzArea !== 0) return [0, 2];
  if (yzArea !== 0) return [1, 2];
  throw new RangeError('Cannot project an exactly degenerate triangle');
}

function projectedOrientation(
  first: ExactTriangleCoordinates,
  firstOffset: number,
  second: ExactTriangleCoordinates,
  secondOffset: number,
  third: ExactTriangleCoordinates,
  thirdOffset: number,
  axis0: number,
  axis1: number
): number {
  return orient2d(
    first[firstOffset + axis0],
    first[firstOffset + axis1],
    second[secondOffset + axis0],
    second[secondOffset + axis1],
    third[thirdOffset + axis0],
    third[thirdOffset + axis1]
  );
}

function onProjectedSegment(
  point: ExactTriangleCoordinates,
  pointOffset: number,
  start: ExactTriangleCoordinates,
  startOffset: number,
  end: ExactTriangleCoordinates,
  endOffset: number,
  axis0: number,
  axis1: number
): boolean {
  const point0 = point[pointOffset + axis0];
  const point1 = point[pointOffset + axis1];
  return (
    point0 >= Math.min(start[startOffset + axis0], end[endOffset + axis0]) &&
    point0 <= Math.max(start[startOffset + axis0], end[endOffset + axis0]) &&
    point1 >= Math.min(start[startOffset + axis1], end[endOffset + axis1]) &&
    point1 <= Math.max(start[startOffset + axis1], end[endOffset + axis1])
  );
}

function sameExactEdge(
  firstStart: ExactTriangleCoordinates,
  firstStartOffset: number,
  firstEnd: ExactTriangleCoordinates,
  firstEndOffset: number,
  secondStart: ExactTriangleCoordinates,
  secondStartOffset: number,
  secondEnd: ExactTriangleCoordinates,
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
  point: ExactTriangleCoordinates,
  pointOffset: number,
  triangle: ExactTriangleCoordinates,
  axis0: number,
  axis1: number
): boolean {
  const side0 = projectedOrientation(triangle, 0, triangle, 3, point, pointOffset, axis0, axis1);
  const side1 = projectedOrientation(triangle, 3, triangle, 6, point, pointOffset, axis0, axis1);
  const side2 = projectedOrientation(triangle, 6, triangle, 0, point, pointOffset, axis0, axis1);
  return (side0 >= 0 && side1 >= 0 && side2 >= 0) || (side0 <= 0 && side1 <= 0 && side2 <= 0);
}

function projectedSegmentsHaveForbiddenContact(
  firstStart: ExactTriangleCoordinates,
  firstStartOffset: number,
  firstEnd: ExactTriangleCoordinates,
  firstEndOffset: number,
  secondStart: ExactTriangleCoordinates,
  secondStartOffset: number,
  secondEnd: ExactTriangleCoordinates,
  secondEndOffset: number,
  firstTriangle: ExactTriangleCoordinates,
  secondTriangle: ExactTriangleCoordinates,
  axis0: number,
  axis1: number
): boolean {
  const side0 = projectedOrientation(
    firstStart,
    firstStartOffset,
    firstEnd,
    firstEndOffset,
    secondStart,
    secondStartOffset,
    axis0,
    axis1
  );
  const side1 = projectedOrientation(
    firstStart,
    firstStartOffset,
    firstEnd,
    firstEndOffset,
    secondEnd,
    secondEndOffset,
    axis0,
    axis1
  );
  const side2 = projectedOrientation(
    secondStart,
    secondStartOffset,
    secondEnd,
    secondEndOffset,
    firstStart,
    firstStartOffset,
    axis0,
    axis1
  );
  const side3 = projectedOrientation(
    secondStart,
    secondStartOffset,
    secondEnd,
    secondEndOffset,
    firstEnd,
    firstEndOffset,
    axis0,
    axis1
  );

  if (
    ((side0 > 0 && side1 < 0) || (side0 < 0 && side1 > 0)) &&
    ((side2 > 0 && side3 < 0) || (side2 < 0 && side3 > 0))
  ) {
    return true;
  }

  if (side0 === 0 && side1 === 0 && side2 === 0 && side3 === 0) {
    const firstDelta0 = Math.abs(
      firstEnd[firstEndOffset + axis0] - firstStart[firstStartOffset + axis0]
    );
    const firstDelta1 = Math.abs(
      firstEnd[firstEndOffset + axis1] - firstStart[firstStartOffset + axis1]
    );
    const overlapAxis = firstDelta0 >= firstDelta1 ? axis0 : axis1;
    const overlapLow = Math.max(
      Math.min(firstStart[firstStartOffset + overlapAxis], firstEnd[firstEndOffset + overlapAxis]),
      Math.min(
        secondStart[secondStartOffset + overlapAxis],
        secondEnd[secondEndOffset + overlapAxis]
      )
    );
    const overlapHigh = Math.min(
      Math.max(firstStart[firstStartOffset + overlapAxis], firstEnd[firstEndOffset + overlapAxis]),
      Math.max(
        secondStart[secondStartOffset + overlapAxis],
        secondEnd[secondEndOffset + overlapAxis]
      )
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
      ExactTriangleCoordinates,
      number,
      ExactTriangleCoordinates,
      number,
      ExactTriangleCoordinates,
      number,
      number,
    ]
  > = [
    [secondStart, secondStartOffset, firstStart, firstStartOffset, firstEnd, firstEndOffset, side0],
    [secondEnd, secondEndOffset, firstStart, firstStartOffset, firstEnd, firstEndOffset, side1],
    [
      firstStart,
      firstStartOffset,
      secondStart,
      secondStartOffset,
      secondEnd,
      secondEndOffset,
      side2,
    ],
    [firstEnd, firstEndOffset, secondStart, secondStartOffset, secondEnd, secondEndOffset, side3],
  ];
  for (const [point, pointOffset, start, startOffset, end, endOffset, side] of contacts) {
    if (
      side === 0 &&
      onProjectedSegment(point, pointOffset, start, startOffset, end, endOffset, axis0, axis1) &&
      !isSharedPoint(point, pointOffset, firstTriangle, secondTriangle)
    ) {
      return true;
    }
  }
  return false;
}

function coplanarSegmentHasForbiddenContact(
  start: ExactTriangleCoordinates,
  startOffset: number,
  end: ExactTriangleCoordinates,
  endOffset: number,
  triangle: ExactTriangleCoordinates,
  firstTriangle: ExactTriangleCoordinates,
  secondTriangle: ExactTriangleCoordinates
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
  first: ExactTriangleCoordinates,
  second: ExactTriangleCoordinates
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
  triangle: ExactTriangleCoordinates,
  point: ExactTriangleCoordinates,
  pointOffset: number
): number {
  return orient3d(
    triangle[0],
    triangle[1],
    triangle[2],
    triangle[3],
    triangle[4],
    triangle[5],
    triangle[6],
    triangle[7],
    triangle[8],
    point[pointOffset],
    point[pointOffset + 1],
    point[pointOffset + 2]
  );
}

function lineSide(
  start: ExactTriangleCoordinates,
  startOffset: number,
  end: ExactTriangleCoordinates,
  endOffset: number,
  first: ExactTriangleCoordinates,
  firstOffset: number,
  second: ExactTriangleCoordinates,
  secondOffset: number
): number {
  return orient3d(
    start[startOffset],
    start[startOffset + 1],
    start[startOffset + 2],
    end[endOffset],
    end[endOffset + 1],
    end[endOffset + 2],
    first[firstOffset],
    first[firstOffset + 1],
    first[firstOffset + 2],
    second[secondOffset],
    second[secondOffset + 1],
    second[secondOffset + 2]
  );
}

function segmentHasForbiddenTriangleContact(
  start: ExactTriangleCoordinates,
  startOffset: number,
  end: ExactTriangleCoordinates,
  endOffset: number,
  triangle: ExactTriangleCoordinates,
  firstTriangle: ExactTriangleCoordinates,
  secondTriangle: ExactTriangleCoordinates
): boolean {
  const startSide = planeSide(triangle, start, startOffset);
  const endSide = planeSide(triangle, end, endOffset);
  if ((startSide > 0 && endSide > 0) || (startSide < 0 && endSide < 0)) return false;
  if (startSide === 0 && endSide === 0) {
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
  if (startSide === 0) {
    return (
      pointInProjectedTriangle(start, startOffset, triangle, axis0, axis1) &&
      !isSharedPoint(start, startOffset, firstTriangle, secondTriangle)
    );
  }
  if (endSide === 0) {
    return (
      pointInProjectedTriangle(end, endOffset, triangle, axis0, axis1) &&
      !isSharedPoint(end, endOffset, firstTriangle, secondTriangle)
    );
  }

  const edgeSide0 = lineSide(start, startOffset, end, endOffset, triangle, 0, triangle, 3);
  const edgeSide1 = lineSide(start, startOffset, end, endOffset, triangle, 3, triangle, 6);
  const edgeSide2 = lineSide(start, startOffset, end, endOffset, triangle, 6, triangle, 0);
  return (
    (edgeSide0 >= 0 && edgeSide1 >= 0 && edgeSide2 >= 0) ||
    (edgeSide0 <= 0 && edgeSide1 <= 0 && edgeSide2 <= 0)
  );
}

function allStrictlySameSide(first: number, second: number, third: number): boolean {
  return (first > 0 && second > 0 && third > 0) || (first < 0 && second < 0 && third < 0);
}

/**
 * Return true only when two nondegenerate exact-binary32 triangles meet beyond
 * their legitimate exact common vertex or edge. This is a narrow-phase test;
 * callers should apply exact AABB rejection first.
 */
export function trianglesHaveForbiddenIntersection(
  first: ExactTriangleCoordinates,
  second: ExactTriangleCoordinates
): boolean {
  const firstSide0 = planeSide(second, first, 0);
  const firstSide1 = planeSide(second, first, 3);
  const firstSide2 = planeSide(second, first, 6);
  if (allStrictlySameSide(firstSide0, firstSide1, firstSide2)) return false;

  const secondSide0 = planeSide(first, second, 0);
  const secondSide1 = planeSide(first, second, 3);
  const secondSide2 = planeSide(first, second, 6);
  if (allStrictlySameSide(secondSide0, secondSide1, secondSide2)) return false;

  if (firstSide0 === 0 && firstSide1 === 0 && firstSide2 === 0) {
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
