import type { ExactPicometreTriangleArtifact } from './exactPicometreArtifactTopology';
import {
  EXACT_PICOMETRE_TRIANGLE_INTERSECTION_PROOF_SHA256,
  exactPicometreTriangleIsDegenerate,
  exactPicometreTrianglesHaveForbiddenIntersection,
} from './exactPicometreTriangleIntersection';
import { sha256Utf8 } from './incrementalSha256';

export const EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_VERSION =
  'potfoundry.parsed-self-intersection-exact-int64-picometre-bvh/v2' as const;
export const EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_SHA256 = sha256Utf8(
  [
    EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_VERSION,
    `narrow-phase=${EXACT_PICOMETRE_TRIANGLE_INTERSECTION_PROOF_SHA256}`,
    'broad phase = median binary AABB hierarchy over every parsed facet',
    'candidate enumeration = self(left), self(right), cross(left,right), exactly once',
    'triangle and node AABBs = exact signed int64 picometre extrema',
    'split centroid comparisons and axis extents = exact unbounded bigint sums/differences',
    'resource bounds = explicit BVH bytes, build work, traversal visits, pair checks, and candidates',
    'diagnostic pairs = preallocated uint32 storage capped at 10,000 pairs',
    'clear verdict requires complete traversal; every resource, degeneracy, or cancellation exit refuses',
    'options are snapshotted from a plain own-data-property record before work begins',
    'every byte/work/deadline option has a non-raiseable hard ceiling',
  ].join('\n')
);

export const DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES = 128 * 1024 * 1024;
export const DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK = 30_000_000;
export const DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS = 20_000_000;
export const DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS = 80_000_000;
export const DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS = 10_000_000;
export const DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_FOUND_PAIRS = 64;
export const DEFAULT_EXACT_PM_SELF_INTERSECTION_LEAF_SIZE = 8;
export const HARD_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES = 192 * 1024 * 1024;
export const HARD_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK = 75_000_000;
export const HARD_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS = 50_000_000;
export const HARD_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS = 200_000_000;
export const HARD_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS = 25_000_000;
export const HARD_EXACT_PM_SELF_INTERSECTION_MAX_FOUND_PAIRS = 10_000;
export const HARD_EXACT_PM_SELF_INTERSECTION_MAX_ELAPSED_MILLISECONDS = 600_000;

export type ExactPicometreSelfIntersectionErrorCode =
  | 'INVALID_ARTIFACT'
  | 'INVALID_OPTIONS'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED'
  | 'DEGENERATE_TRIANGLE';

export class ExactPicometreSelfIntersectionError extends Error {
  readonly code: ExactPicometreSelfIntersectionErrorCode;
  readonly triangleIndex?: number;

  constructor(
    code: ExactPicometreSelfIntersectionErrorCode,
    message: string,
    triangleIndex?: number
  ) {
    super(message);
    this.name = 'ExactPicometreSelfIntersectionError';
    this.code = code;
    this.triangleIndex = triangleIndex;
  }
}

export interface ReadableExactPicometreTriangleArtifact extends ExactPicometreTriangleArtifact {
  readonly readTrianglePicometres: (
    triangleIndex: number,
    target: BigInt64Array,
    offset?: number
  ) => void;
}

export interface ExactPicometreSelfIntersectionOptions {
  readonly maxBvhBytes?: number;
  readonly maxBuildWork?: number;
  readonly maxTraversalVisits?: number;
  readonly maxBroadPhasePairChecks?: number;
  readonly maxCandidatePairs?: number;
  readonly maxFoundPairs?: number;
  readonly leafSize?: number;
  readonly deadlineEpochMilliseconds?: number;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export interface ExactPicometreArtifactSelfIntersectionResult {
  readonly proofVersion: typeof EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly narrowPhaseProofSha256: string;
  readonly artifactByteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly triangleCount: number;
  readonly bvhBytes: number;
  readonly buildWorkCount: number;
  readonly traversalVisitCount: number;
  readonly broadPhasePairCheckCount: number;
  readonly candidatePairCount: number;
  readonly intersectionPairCountLowerBound: number;
  readonly scanComplete: boolean;
  readonly selfIntersectionFree: boolean;
  readonly samplePairs: readonly (readonly [number, number])[];
}

interface OptionSnapshot extends ExactPicometreSelfIntersectionOptions {}

const OPTION_NAMES = Object.freeze([
  'maxBvhBytes',
  'maxBuildWork',
  'maxTraversalVisits',
  'maxBroadPhasePairChecks',
  'maxCandidatePairs',
  'maxFoundPairs',
  'leafSize',
  'deadlineEpochMilliseconds',
  'cancellationFlag',
  'progressCounter',
] as const);
const OPTION_NAME_SET = new Set<string>(OPTION_NAMES);
const SHA256_RE = /^[0-9a-f]{64}$/;
const LEAF_SENTINEL = 0xffff_ffff;

function fail(
  code: ExactPicometreSelfIntersectionErrorCode,
  message: string,
  triangleIndex?: number
): never {
  throw new ExactPicometreSelfIntersectionError(code, message, triangleIndex);
}

function snapshotOptions(
  options: ExactPicometreSelfIntersectionOptions
): OptionSnapshot {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    fail('INVALID_OPTIONS', 'Self-intersection options must be a plain own-data-property record');
  }
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(options);
    descriptors = Object.getOwnPropertyDescriptors(options) as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    fail('INVALID_OPTIONS', 'Self-intersection options could not be inspected safely');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_OPTIONS', 'Self-intersection options must have Object or null prototype');
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !OPTION_NAME_SET.has(key)) {
      fail('INVALID_OPTIONS', `Unknown self-intersection option '${String(key)}'`);
    }
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) {
      fail('INVALID_OPTIONS', `Self-intersection option '${key}' must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as OptionSnapshot;
}

function boundedPositiveSafeInteger(
  value: number | undefined,
  fallback: number,
  hardMaximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    fail('INVALID_OPTIONS', `${label} must be a positive safe integer`);
  }
  if (resolved > hardMaximum) {
    fail('RESOURCE_LIMIT', `${label} exceeds hard limit ${hardMaximum}`);
  }
  return resolved;
}

function validateCounter(counter: Int32Array | undefined, label: string): void {
  if (counter === undefined) return;
  if (
    !(counter instanceof Int32Array) ||
    counter.length < 1 ||
    typeof SharedArrayBuffer === 'undefined' ||
    !(counter.buffer instanceof SharedArrayBuffer)
  ) {
    fail('INVALID_OPTIONS', `${label} must be a shared Int32Array containing index 0`);
  }
}

function checkCancelled(
  flag: Int32Array | undefined,
  deadlineEpochMilliseconds?: number
): void {
  if (flag !== undefined && Atomics.load(flag, 0) !== 0) {
    fail('CANCELLED', 'Exact picometre self-intersection proof was cancelled');
  }
  if (
    deadlineEpochMilliseconds !== undefined &&
    Date.now() > deadlineEpochMilliseconds
  ) {
    fail(
      'RESOURCE_LIMIT',
      'Exact picometre self-intersection proof exceeded its hard elapsed-time deadline'
    );
  }
}

function validateArtifact(artifact: ReadableExactPicometreTriangleArtifact): void {
  if (
    typeof artifact !== 'object' ||
    artifact === null ||
    !SHA256_RE.test(artifact.byteSha256) ||
    !SHA256_RE.test(artifact.parsedArtifactSha256) ||
    !SHA256_RE.test(artifact.parsedTriangleSetSha256) ||
    !Number.isSafeInteger(artifact.triangleCount) ||
    artifact.triangleCount <= 0 ||
    typeof artifact.readTrianglePicometres !== 'function'
  ) {
    fail('INVALID_ARTIFACT', 'Readable exact picometre triangle artifact is malformed');
  }
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function minimum3(first: bigint, second: bigint, third: bigint): bigint {
  return first < second ? (first < third ? first : third) : second < third ? second : third;
}

function maximum3(first: bigint, second: bigint, third: bigint): bigint {
  return first > second ? (first > third ? first : third) : second > third ? second : third;
}

function boundsOverlap(bounds: BigInt64Array, first: number, second: number): boolean {
  const firstOffset = first * 6;
  const secondOffset = second * 6;
  return !(
    bounds[firstOffset] > bounds[secondOffset + 3] ||
    bounds[firstOffset + 3] < bounds[secondOffset] ||
    bounds[firstOffset + 1] > bounds[secondOffset + 4] ||
    bounds[firstOffset + 4] < bounds[secondOffset + 1] ||
    bounds[firstOffset + 2] > bounds[secondOffset + 5] ||
    bounds[firstOffset + 5] < bounds[secondOffset + 2]
  );
}

/** Complete bounded BVH scan over exact integer-picometre artifact triangles. */
export function assessExactPicometreArtifactSelfIntersections(
  artifact: ReadableExactPicometreTriangleArtifact,
  options: ExactPicometreSelfIntersectionOptions = {}
): ExactPicometreArtifactSelfIntersectionResult {
  validateArtifact(artifact);
  const optionSnapshot = snapshotOptions(options);
  const maxBvhBytes = boundedPositiveSafeInteger(
    optionSnapshot.maxBvhBytes,
    DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES,
    HARD_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES,
    'maxBvhBytes'
  );
  const maxBuildWork = boundedPositiveSafeInteger(
    optionSnapshot.maxBuildWork,
    DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK,
    HARD_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK,
    'maxBuildWork'
  );
  const maxTraversalVisits = boundedPositiveSafeInteger(
    optionSnapshot.maxTraversalVisits,
    DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
    HARD_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
    'maxTraversalVisits'
  );
  const maxBroadPhasePairChecks = boundedPositiveSafeInteger(
    optionSnapshot.maxBroadPhasePairChecks,
    DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
    HARD_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
    'maxBroadPhasePairChecks'
  );
  const maxCandidatePairs = boundedPositiveSafeInteger(
    optionSnapshot.maxCandidatePairs,
    DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
    HARD_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
    'maxCandidatePairs'
  );
  const maxFoundPairs = boundedPositiveSafeInteger(
    optionSnapshot.maxFoundPairs,
    DEFAULT_EXACT_PM_SELF_INTERSECTION_MAX_FOUND_PAIRS,
    HARD_EXACT_PM_SELF_INTERSECTION_MAX_FOUND_PAIRS,
    'maxFoundPairs'
  );
  const leafSize = boundedPositiveSafeInteger(
    optionSnapshot.leafSize,
    DEFAULT_EXACT_PM_SELF_INTERSECTION_LEAF_SIZE,
    64,
    'leafSize'
  );
  const requestedDeadline = optionSnapshot.deadlineEpochMilliseconds;
  if (
    requestedDeadline !== undefined &&
    (!Number.isSafeInteger(requestedDeadline) || !Number.isFinite(requestedDeadline))
  ) {
    fail('INVALID_OPTIONS', 'deadlineEpochMilliseconds must be a finite safe integer');
  }
  const deadlineEpochMilliseconds = Math.min(
    requestedDeadline ?? Number.MAX_SAFE_INTEGER,
    Date.now() + HARD_EXACT_PM_SELF_INTERSECTION_MAX_ELAPSED_MILLISECONDS
  );
  const cancellationFlag = optionSnapshot.cancellationFlag;
  const progressCounter = optionSnapshot.progressCounter;
  validateCounter(cancellationFlag, 'cancellationFlag');
  validateCounter(progressCounter, 'progressCounter');
  if (progressCounter) Atomics.store(progressCounter, 0, 0);
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);

  const triangleCount = artifact.triangleCount;
  const maximumLeaves = nextPowerOfTwo(Math.ceil(triangleCount / leafSize));
  const maximumNodes = maximumLeaves * 2 - 1;
  const triangleBoundsBytes = triangleCount * 6 * BigInt64Array.BYTES_PER_ELEMENT;
  const triangleOrderBytes = triangleCount * Uint32Array.BYTES_PER_ELEMENT;
  const nodeBytes =
    maximumNodes * (6 * BigInt64Array.BYTES_PER_ELEMENT + 4 * Uint32Array.BYTES_PER_ELEMENT);
  const bvhBytes = triangleBoundsBytes + triangleOrderBytes + nodeBytes;
  if (!Number.isSafeInteger(bvhBytes) || bvhBytes > maxBvhBytes) {
    fail('RESOURCE_LIMIT', `Exact picometre self-intersection BVH needs ${bvhBytes} bytes`);
  }

  let triangleBounds: BigInt64Array;
  let triangleOrder: Uint32Array;
  let nodeBounds: BigInt64Array;
  let nodeLeft: Uint32Array;
  let nodeRight: Uint32Array;
  let nodeStart: Uint32Array;
  let nodeCountByIndex: Uint32Array;
  try {
    triangleBounds = new BigInt64Array(triangleCount * 6);
    triangleOrder = new Uint32Array(triangleCount);
    nodeBounds = new BigInt64Array(maximumNodes * 6);
    nodeLeft = new Uint32Array(maximumNodes);
    nodeRight = new Uint32Array(maximumNodes);
    nodeStart = new Uint32Array(maximumNodes);
    nodeCountByIndex = new Uint32Array(maximumNodes);
  } catch {
    fail('RESOURCE_LIMIT', `Could not allocate ${bvhBytes} exact picometre BVH bytes`);
  }

  const triangle = new BigInt64Array(9);
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    if ((triangleIndex & 0xfff) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
      if (progressCounter) Atomics.store(progressCounter, 0, triangleIndex);
    }
    artifact.readTrianglePicometres(triangleIndex, triangle);
    if (exactPicometreTriangleIsDegenerate(triangle)) {
      fail(
        'DEGENERATE_TRIANGLE',
        `Parsed triangle ${triangleIndex} is exactly degenerate`,
        triangleIndex
      );
    }
    const offset = triangleIndex * 6;
    triangleBounds[offset] = minimum3(triangle[0], triangle[3], triangle[6]);
    triangleBounds[offset + 1] = minimum3(triangle[1], triangle[4], triangle[7]);
    triangleBounds[offset + 2] = minimum3(triangle[2], triangle[5], triangle[8]);
    triangleBounds[offset + 3] = maximum3(triangle[0], triangle[3], triangle[6]);
    triangleBounds[offset + 4] = maximum3(triangle[1], triangle[4], triangle[7]);
    triangleBounds[offset + 5] = maximum3(triangle[2], triangle[5], triangle[8]);
    triangleOrder[triangleIndex] = triangleIndex;
  }
  if (progressCounter) Atomics.store(progressCounter, 0, triangleCount);

  let buildWorkCount = triangleCount;
  if (buildWorkCount > maxBuildWork) {
    fail('RESOURCE_LIMIT', `Self-intersection proof exceeded ${maxBuildWork} BVH build work`);
  }
  const countBuildWork = (): void => {
    if (buildWorkCount >= maxBuildWork) {
      fail('RESOURCE_LIMIT', `Self-intersection proof exceeded ${maxBuildWork} BVH build work`);
    }
    buildWorkCount += 1;
    if ((buildWorkCount & 0x3ffff) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
  };
  const centroid = (triangleIndex: number, axis: number): bigint => {
    countBuildWork();
    const offset = triangleIndex * 6;
    return triangleBounds[offset + axis] + triangleBounds[offset + axis + 3];
  };
  const swapOrder = (first: number, second: number): void => {
    countBuildWork();
    const held = triangleOrder[first];
    triangleOrder[first] = triangleOrder[second];
    triangleOrder[second] = held;
  };
  const selectMedian = (start: number, end: number, median: number, axis: number): void => {
    let low = start;
    let high = end - 1;
    while (low < high) {
      const pivot = centroid(triangleOrder[(low + high) >>> 1], axis);
      let left = low;
      let right = high;
      while (left <= right) {
        while (centroid(triangleOrder[left], axis) < pivot) left += 1;
        while (centroid(triangleOrder[right], axis) > pivot) right -= 1;
        if (left <= right) {
          swapOrder(left, right);
          left += 1;
          right -= 1;
        }
      }
      if (median <= right) high = right;
      else if (median >= left) low = left;
      else return;
    }
  };

  let builtNodeCount = 0;
  const buildNode = (start: number, end: number): number => {
    if (builtNodeCount >= maximumNodes) {
      fail('RESOURCE_LIMIT', 'Exact picometre BVH node capacity was exhausted');
    }
    const node = builtNodeCount;
    builtNodeCount += 1;
    const firstOffset = triangleOrder[start] * 6;
    let minX = triangleBounds[firstOffset];
    let minY = triangleBounds[firstOffset + 1];
    let minZ = triangleBounds[firstOffset + 2];
    let maxX = triangleBounds[firstOffset + 3];
    let maxY = triangleBounds[firstOffset + 4];
    let maxZ = triangleBounds[firstOffset + 5];
    let centroidMinX = minX + maxX;
    let centroidMinY = minY + maxY;
    let centroidMinZ = minZ + maxZ;
    let centroidMaxX = centroidMinX;
    let centroidMaxY = centroidMinY;
    let centroidMaxZ = centroidMinZ;
    for (let orderIndex = start; orderIndex < end; orderIndex += 1) {
      countBuildWork();
      const offset = triangleOrder[orderIndex] * 6;
      const triangleMinX = triangleBounds[offset];
      const triangleMinY = triangleBounds[offset + 1];
      const triangleMinZ = triangleBounds[offset + 2];
      const triangleMaxX = triangleBounds[offset + 3];
      const triangleMaxY = triangleBounds[offset + 4];
      const triangleMaxZ = triangleBounds[offset + 5];
      if (triangleMinX < minX) minX = triangleMinX;
      if (triangleMinY < minY) minY = triangleMinY;
      if (triangleMinZ < minZ) minZ = triangleMinZ;
      if (triangleMaxX > maxX) maxX = triangleMaxX;
      if (triangleMaxY > maxY) maxY = triangleMaxY;
      if (triangleMaxZ > maxZ) maxZ = triangleMaxZ;
      const centerX = triangleMinX + triangleMaxX;
      const centerY = triangleMinY + triangleMaxY;
      const centerZ = triangleMinZ + triangleMaxZ;
      if (centerX < centroidMinX) centroidMinX = centerX;
      if (centerY < centroidMinY) centroidMinY = centerY;
      if (centerZ < centroidMinZ) centroidMinZ = centerZ;
      if (centerX > centroidMaxX) centroidMaxX = centerX;
      if (centerY > centroidMaxY) centroidMaxY = centerY;
      if (centerZ > centroidMaxZ) centroidMaxZ = centerZ;
    }
    const nodeOffset = node * 6;
    nodeBounds[nodeOffset] = minX;
    nodeBounds[nodeOffset + 1] = minY;
    nodeBounds[nodeOffset + 2] = minZ;
    nodeBounds[nodeOffset + 3] = maxX;
    nodeBounds[nodeOffset + 4] = maxY;
    nodeBounds[nodeOffset + 5] = maxZ;
    nodeStart[node] = start;
    nodeCountByIndex[node] = end - start;
    if (end - start <= leafSize) {
      nodeLeft[node] = LEAF_SENTINEL;
      nodeRight[node] = LEAF_SENTINEL;
      return node;
    }
    const extentX = centroidMaxX - centroidMinX;
    const extentY = centroidMaxY - centroidMinY;
    const extentZ = centroidMaxZ - centroidMinZ;
    const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
    const median = (start + end) >>> 1;
    selectMedian(start, end, median, axis);
    nodeLeft[node] = buildNode(start, median);
    nodeRight[node] = buildNode(median, end);
    return node;
  };

  const root = buildNode(0, triangleCount);
  const nodeBoundsOverlap = (first: number, second: number): boolean =>
    boundsOverlap(nodeBounds, first, second);
  const firstTriangle = new BigInt64Array(9);
  const secondTriangle = new BigInt64Array(9);
  const samplePairStorage = new Uint32Array(maxFoundPairs * 2);
  let storedSamplePairCount = 0;
  let broadPhasePairCheckCount = 0;
  let candidatePairCount = 0;
  let intersectionPairCountLowerBound = 0;
  let traversalComplete = true;
  let stopTraversal = false;
  let traversalVisits = 0;

  const countTraversalVisit = (): void => {
    if (traversalVisits >= maxTraversalVisits) {
      fail('RESOURCE_LIMIT', `Self-intersection proof exceeded ${maxTraversalVisits} traversal visits`);
    }
    traversalVisits += 1;
    if ((traversalVisits & 0x3fff) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
  };
  const testPair = (first: number, second: number): void => {
    if (stopTraversal) return;
    if (broadPhasePairCheckCount >= maxBroadPhasePairChecks) {
      fail(
        'RESOURCE_LIMIT',
        `Self-intersection proof exceeded ${maxBroadPhasePairChecks} broad-phase pair checks`
      );
    }
    broadPhasePairCheckCount += 1;
    if (!boundsOverlap(triangleBounds, first, second)) return;
    if (candidatePairCount >= maxCandidatePairs) {
      fail('RESOURCE_LIMIT', `Self-intersection proof exceeded ${maxCandidatePairs} candidate pairs`);
    }
    candidatePairCount += 1;
    artifact.readTrianglePicometres(first, firstTriangle);
    artifact.readTrianglePicometres(second, secondTriangle);
    if (!exactPicometreTrianglesHaveForbiddenIntersection(firstTriangle, secondTriangle)) return;
    intersectionPairCountLowerBound += 1;
    if (storedSamplePairCount < maxFoundPairs) {
      const offset = storedSamplePairCount * 2;
      samplePairStorage[offset] = Math.min(first, second);
      samplePairStorage[offset + 1] = Math.max(first, second);
      storedSamplePairCount += 1;
    }
    if (intersectionPairCountLowerBound >= maxFoundPairs) {
      traversalComplete = false;
      stopTraversal = true;
    }
  };
  const visitLeafPair = (firstNode: number, secondNode: number, sameLeaf: boolean): void => {
    const firstStart = nodeStart[firstNode];
    const firstEnd = firstStart + nodeCountByIndex[firstNode];
    const secondStart = nodeStart[secondNode];
    const secondEnd = secondStart + nodeCountByIndex[secondNode];
    for (let firstOrder = firstStart; firstOrder < firstEnd && !stopTraversal; firstOrder += 1) {
      const secondOrderStart = sameLeaf ? firstOrder + 1 : secondStart;
      for (
        let secondOrder = secondOrderStart;
        secondOrder < secondEnd && !stopTraversal;
        secondOrder += 1
      ) {
        testPair(triangleOrder[firstOrder], triangleOrder[secondOrder]);
      }
    }
  };
  const visitPair = (firstNode: number, secondNode: number): void => {
    if (stopTraversal) return;
    countTraversalVisit();
    if (!nodeBoundsOverlap(firstNode, secondNode)) return;
    const firstLeaf = nodeLeft[firstNode] === LEAF_SENTINEL;
    const secondLeaf = nodeLeft[secondNode] === LEAF_SENTINEL;
    if (firstLeaf && secondLeaf) {
      visitLeafPair(firstNode, secondNode, false);
      return;
    }
    if (!firstLeaf && (secondLeaf || nodeCountByIndex[firstNode] >= nodeCountByIndex[secondNode])) {
      visitPair(nodeLeft[firstNode], secondNode);
      visitPair(nodeRight[firstNode], secondNode);
    } else {
      visitPair(firstNode, nodeLeft[secondNode]);
      visitPair(firstNode, nodeRight[secondNode]);
    }
  };
  const visitSelf = (node: number): void => {
    if (stopTraversal) return;
    countTraversalVisit();
    if (nodeLeft[node] === LEAF_SENTINEL) {
      visitLeafPair(node, node, true);
      return;
    }
    visitSelf(nodeLeft[node]);
    visitSelf(nodeRight[node]);
    visitPair(nodeLeft[node], nodeRight[node]);
  };
  visitSelf(root);

  const selfIntersectionFree = traversalComplete && intersectionPairCountLowerBound === 0;
  const samplePairs = Object.freeze(
    Array.from({ length: storedSamplePairCount }, (_, pairIndex) =>
      Object.freeze([
        samplePairStorage[pairIndex * 2],
        samplePairStorage[pairIndex * 2 + 1],
      ] as const)
    )
  );
  const evidenceSha256 = sha256Utf8(
    JSON.stringify([
      EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_VERSION,
      EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_SHA256,
      EXACT_PICOMETRE_TRIANGLE_INTERSECTION_PROOF_SHA256,
      artifact.byteSha256,
      artifact.parsedArtifactSha256,
      artifact.parsedTriangleSetSha256,
      triangleCount,
      bvhBytes,
      buildWorkCount,
      traversalVisits,
      broadPhasePairCheckCount,
      candidatePairCount,
      intersectionPairCountLowerBound,
      traversalComplete,
      selfIntersectionFree,
      samplePairs,
    ])
  );
  if (progressCounter) Atomics.store(progressCounter, 0, triangleCount + traversalVisits);
  return Object.freeze({
    proofVersion: EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_VERSION,
    proofMethodSha256: EXACT_PICOMETRE_SELF_INTERSECTION_PROOF_SHA256,
    evidenceSha256,
    narrowPhaseProofSha256: EXACT_PICOMETRE_TRIANGLE_INTERSECTION_PROOF_SHA256,
    artifactByteSha256: artifact.byteSha256,
    parsedArtifactSha256: artifact.parsedArtifactSha256,
    parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
    triangleCount,
    bvhBytes,
    buildWorkCount,
    traversalVisitCount: traversalVisits,
    broadPhasePairCheckCount,
    candidatePairCount,
    intersectionPairCountLowerBound,
    scanComplete: traversalComplete,
    selfIntersectionFree,
    samplePairs,
  });
}
