import type { ParsedBinaryStlArtifact } from './binaryStlArtifact';
import {
  EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256,
  exactTriangleIsDegenerate,
  trianglesHaveForbiddenIntersection,
} from './exactTriangleIntersection';
import { sha256Utf8 } from './incrementalSha256';

export const PARSED_SELF_INTERSECTION_PROOF_VERSION =
  'potfoundry.parsed-self-intersection-bvh/v3' as const;
export const PARSED_SELF_INTERSECTION_PROOF_SHA256 = sha256Utf8(
  [
    PARSED_SELF_INTERSECTION_PROOF_VERSION,
    `narrow-phase=${EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256}`,
    'broad phase = balanced median binary AABB hierarchy over every parsed facet',
    'candidate enumeration = self(left), self(right), cross(left,right), exactly once',
    'AABB overlap = closed exact comparisons of binary32 extrema represented as binary64',
    'resource bounds = explicit BVH bytes, traversal visits, pre-AABB pair checks, and narrow-phase candidates',
    'diagnostic pairs = preallocated uint32 storage capped at 10,000 pairs',
    'clear verdict requires complete traversal; every resource or cancellation exit refuses',
    'plain own-data options are snapshotted; every byte/work/deadline option has a non-raiseable hard ceiling',
  ].join('\n')
);

export const DEFAULT_SELF_INTERSECTION_MAX_BVH_BYTES = 192 * 1024 * 1024;
export const DEFAULT_SELF_INTERSECTION_MAX_BUILD_WORK = 80_000_000;
export const DEFAULT_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS = 80_000_000;
export const DEFAULT_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS = 80_000_000;
export const DEFAULT_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS = 40_000_000;
export const DEFAULT_SELF_INTERSECTION_MAX_FOUND_PAIRS = 64;
export const DEFAULT_SELF_INTERSECTION_LEAF_SIZE = 8;
export const HARD_SELF_INTERSECTION_MAX_BVH_BYTES = 256 * 1024 * 1024;
// Envelope v5 (2026-07-18): WaveInterference full-defaults parses 1,267,712
// triangles (~4.2x the Gothic scan volume); the scan counters double.
export const HARD_SELF_INTERSECTION_MAX_BUILD_WORK = 400_000_000;
export const HARD_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS = 400_000_000;
export const HARD_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS = 400_000_000;
export const HARD_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS = 100_000_000;
export const HARD_SELF_INTERSECTION_MAX_FOUND_PAIRS = 10_000;
export const HARD_SELF_INTERSECTION_MAX_ELAPSED_MILLISECONDS = 600_000;

export type ParsedSelfIntersectionErrorCode =
  | 'INVALID_OPTIONS'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED'
  | 'DEGENERATE_TRIANGLE';

export class ParsedSelfIntersectionError extends Error {
  readonly code: ParsedSelfIntersectionErrorCode;
  readonly triangleIndex?: number;

  constructor(code: ParsedSelfIntersectionErrorCode, message: string, triangleIndex?: number) {
    super(message);
    this.name = 'ParsedSelfIntersectionError';
    this.code = code;
    this.triangleIndex = triangleIndex;
  }
}

export interface ParsedSelfIntersectionOptions {
  /** Maximum bytes occupied by the typed-array BVH and triangle-bound arrays. */
  maxBvhBytes?: number;
  maxBuildWork?: number;
  /** Maximum recursive BVH node visits, counted before each node-overlap decision. */
  maxTraversalVisits?: number;
  /** Maximum triangle-pair AABB checks, counted before the AABB rejection. */
  maxBroadPhasePairChecks?: number;
  /** Maximum AABB-overlapping pairs admitted to the exact narrow phase. */
  maxCandidatePairs?: number;
  maxFoundPairs?: number;
  leafSize?: number;
  readonly deadlineEpochMilliseconds?: number;
  cancellationFlag?: Int32Array;
  progressCounter?: Int32Array;
}

export interface ParsedArtifactSelfIntersectionResult {
  readonly proofVersion: typeof PARSED_SELF_INTERSECTION_PROOF_VERSION;
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

const LEAF_SENTINEL = 0xffff_ffff;
const OPTION_KEYS = new Set([
  'cancellationFlag',
  'deadlineEpochMilliseconds',
  'leafSize',
  'maxBroadPhasePairChecks',
  'maxBuildWork',
  'maxBvhBytes',
  'maxCandidatePairs',
  'maxFoundPairs',
  'maxTraversalVisits',
  'progressCounter',
]);

function snapshotOptions(options: ParsedSelfIntersectionOptions): ParsedSelfIntersectionOptions {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new ParsedSelfIntersectionError(
      'INVALID_OPTIONS',
      'Self-intersection options must be a plain own-data-property record'
    );
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ParsedSelfIntersectionError(
      'INVALID_OPTIONS',
      'Self-intersection options must have Object or null prototype'
    );
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== 'string' || !OPTION_KEYS.has(key)) {
      throw new ParsedSelfIntersectionError(
        'INVALID_OPTIONS',
        `Unknown self-intersection option '${String(key)}'`
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      throw new ParsedSelfIntersectionError(
        'INVALID_OPTIONS',
        `Self-intersection option '${key}' must be an enumerable data property`
      );
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as ParsedSelfIntersectionOptions;
}

function boundedPositiveSafeInteger(
  value: number | undefined,
  fallback: number,
  hardMaximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new ParsedSelfIntersectionError(
      'INVALID_OPTIONS',
      `${label} must be a positive safe integer`
    );
  }
  if (resolved > hardMaximum) {
    throw new ParsedSelfIntersectionError(
      'RESOURCE_LIMIT',
      `${label} exceeds hard limit ${hardMaximum}`
    );
  }
  return resolved;
}

function validateAtomicCounter(counter: Int32Array | undefined, label: string): void {
  if (!counter) return;
  if (
    counter.length < 1 ||
    typeof SharedArrayBuffer === 'undefined' ||
    !(counter.buffer instanceof SharedArrayBuffer)
  ) {
    throw new ParsedSelfIntersectionError(
      'INVALID_OPTIONS',
      `${label} must contain index 0 and be backed by SharedArrayBuffer`
    );
  }
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function triangleBoundsOverlap(bounds: Float32Array, first: number, second: number): boolean {
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

/** Complete parsed-facet self-intersection proof; no sampling or tolerant welding. */
export function assessParsedArtifactSelfIntersections(
  artifact: ParsedBinaryStlArtifact,
  untrustedOptions: ParsedSelfIntersectionOptions = {}
): ParsedArtifactSelfIntersectionResult {
  const options = snapshotOptions(untrustedOptions);
  const maxBvhBytes = boundedPositiveSafeInteger(
    options.maxBvhBytes,
    DEFAULT_SELF_INTERSECTION_MAX_BVH_BYTES,
    HARD_SELF_INTERSECTION_MAX_BVH_BYTES,
    'maxBvhBytes'
  );
  const maxBuildWork = boundedPositiveSafeInteger(
    options.maxBuildWork,
    DEFAULT_SELF_INTERSECTION_MAX_BUILD_WORK,
    HARD_SELF_INTERSECTION_MAX_BUILD_WORK,
    'maxBuildWork'
  );
  const maxTraversalVisits = boundedPositiveSafeInteger(
    options.maxTraversalVisits,
    DEFAULT_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
    HARD_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
    'maxTraversalVisits'
  );
  const maxBroadPhasePairChecks = boundedPositiveSafeInteger(
    options.maxBroadPhasePairChecks,
    DEFAULT_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
    HARD_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
    'maxBroadPhasePairChecks'
  );
  const maxCandidatePairs = boundedPositiveSafeInteger(
    options.maxCandidatePairs,
    DEFAULT_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
    HARD_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
    'maxCandidatePairs'
  );
  const maxFoundPairs = boundedPositiveSafeInteger(
    options.maxFoundPairs,
    DEFAULT_SELF_INTERSECTION_MAX_FOUND_PAIRS,
    HARD_SELF_INTERSECTION_MAX_FOUND_PAIRS,
    'maxFoundPairs'
  );
  const leafSize = boundedPositiveSafeInteger(
    options.leafSize,
    DEFAULT_SELF_INTERSECTION_LEAF_SIZE,
    64,
    'leafSize'
  );
  const requestedDeadline = options.deadlineEpochMilliseconds;
  if (
    requestedDeadline !== undefined &&
    (!Number.isSafeInteger(requestedDeadline) || !Number.isFinite(requestedDeadline))
  ) {
    throw new ParsedSelfIntersectionError(
      'INVALID_OPTIONS',
      'deadlineEpochMilliseconds must be a finite safe integer'
    );
  }
  const deadlineEpochMilliseconds = Math.min(
    requestedDeadline ?? Number.MAX_SAFE_INTEGER,
    Date.now() + HARD_SELF_INTERSECTION_MAX_ELAPSED_MILLISECONDS
  );
  const checkResources = (): void => {
    if (options.cancellationFlag && Atomics.load(options.cancellationFlag, 0) !== 0) {
      throw new ParsedSelfIntersectionError('CANCELLED', 'Self-intersection proof was cancelled');
    }
    if (Date.now() > deadlineEpochMilliseconds) {
      throw new ParsedSelfIntersectionError(
        'RESOURCE_LIMIT',
        'Self-intersection proof exceeded its hard elapsed-time deadline'
      );
    }
  };
  validateAtomicCounter(options.cancellationFlag, 'cancellationFlag');
  validateAtomicCounter(options.progressCounter, 'progressCounter');
  checkResources();
  if (options.progressCounter) Atomics.store(options.progressCounter, 0, 0);

  const triangleCount = artifact.triangleCount;
  const maximumLeaves = nextPowerOfTwo(Math.ceil(triangleCount / leafSize));
  const maximumNodes = maximumLeaves * 2 - 1;
  const triangleBoundsBytes = triangleCount * 6 * Float32Array.BYTES_PER_ELEMENT;
  const triangleOrderBytes = triangleCount * Uint32Array.BYTES_PER_ELEMENT;
  const nodeBytes =
    maximumNodes * (6 * Float32Array.BYTES_PER_ELEMENT + 4 * Uint32Array.BYTES_PER_ELEMENT);
  const bvhBytes = triangleBoundsBytes + triangleOrderBytes + nodeBytes;
  if (!Number.isSafeInteger(bvhBytes) || bvhBytes > maxBvhBytes) {
    throw new ParsedSelfIntersectionError(
      'RESOURCE_LIMIT',
      `Self-intersection BVH needs ${bvhBytes} bytes`
    );
  }

  let triangleBounds: Float32Array;
  let triangleOrder: Uint32Array;
  let nodeBounds: Float32Array;
  let nodeLeft: Uint32Array;
  let nodeRight: Uint32Array;
  let nodeStart: Uint32Array;
  let nodeCountByIndex: Uint32Array;
  try {
    triangleBounds = new Float32Array(triangleCount * 6);
    triangleOrder = new Uint32Array(triangleCount);
    nodeBounds = new Float32Array(maximumNodes * 6);
    nodeLeft = new Uint32Array(maximumNodes);
    nodeRight = new Uint32Array(maximumNodes);
    nodeStart = new Uint32Array(maximumNodes);
    nodeCountByIndex = new Uint32Array(maximumNodes);
  } catch {
    throw new ParsedSelfIntersectionError(
      'RESOURCE_LIMIT',
      `Could not allocate ${bvhBytes} self-intersection BVH bytes`
    );
  }

  let buildWorkCount = 0;
  const chargeBuildWork = (amount = 1): void => {
    buildWorkCount += amount;
    if (buildWorkCount > maxBuildWork) {
      throw new ParsedSelfIntersectionError(
        'RESOURCE_LIMIT',
        `BVH construction exceeds maxBuildWork=${maxBuildWork}`
      );
    }
    if ((buildWorkCount & 4095) === 0) checkResources();
  };
  const triangle = new Float64Array(9);
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    chargeBuildWork();
    if ((triangleIndex & 0xfff) === 0) {
      checkResources();
      if (options.progressCounter) Atomics.store(options.progressCounter, 0, triangleIndex);
    }
    artifact.readTriangle(triangleIndex, triangle);
    if (exactTriangleIsDegenerate(triangle)) {
      throw new ParsedSelfIntersectionError(
        'DEGENERATE_TRIANGLE',
        `Parsed triangle ${triangleIndex} is exactly degenerate`,
        triangleIndex
      );
    }
    const offset = triangleIndex * 6;
    triangleBounds[offset] = Math.min(triangle[0], triangle[3], triangle[6]);
    triangleBounds[offset + 1] = Math.min(triangle[1], triangle[4], triangle[7]);
    triangleBounds[offset + 2] = Math.min(triangle[2], triangle[5], triangle[8]);
    triangleBounds[offset + 3] = Math.max(triangle[0], triangle[3], triangle[6]);
    triangleBounds[offset + 4] = Math.max(triangle[1], triangle[4], triangle[7]);
    triangleBounds[offset + 5] = Math.max(triangle[2], triangle[5], triangle[8]);
    triangleOrder[triangleIndex] = triangleIndex;
  }
  if (options.progressCounter) Atomics.store(options.progressCounter, 0, triangleCount);

  const centroid = (triangleIndex: number, axis: number): number => {
    chargeBuildWork();
    const offset = triangleIndex * 6;
    return triangleBounds[offset + axis] + triangleBounds[offset + axis + 3];
  };
  const swapOrder = (first: number, second: number): void => {
    chargeBuildWork();
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
    chargeBuildWork();
    if (builtNodeCount >= maximumNodes) {
      throw new ParsedSelfIntersectionError('RESOURCE_LIMIT', 'BVH node capacity was exhausted');
    }
    const node = builtNodeCount;
    builtNodeCount += 1;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let centroidMinX = Number.POSITIVE_INFINITY;
    let centroidMinY = Number.POSITIVE_INFINITY;
    let centroidMinZ = Number.POSITIVE_INFINITY;
    let centroidMaxX = Number.NEGATIVE_INFINITY;
    let centroidMaxY = Number.NEGATIVE_INFINITY;
    let centroidMaxZ = Number.NEGATIVE_INFINITY;
    for (let orderIndex = start; orderIndex < end; orderIndex += 1) {
      chargeBuildWork();
      const triangleIndex = triangleOrder[orderIndex];
      const offset = triangleIndex * 6;
      minX = Math.min(minX, triangleBounds[offset]);
      minY = Math.min(minY, triangleBounds[offset + 1]);
      minZ = Math.min(minZ, triangleBounds[offset + 2]);
      maxX = Math.max(maxX, triangleBounds[offset + 3]);
      maxY = Math.max(maxY, triangleBounds[offset + 4]);
      maxZ = Math.max(maxZ, triangleBounds[offset + 5]);
      const centerX = triangleBounds[offset] + triangleBounds[offset + 3];
      const centerY = triangleBounds[offset + 1] + triangleBounds[offset + 4];
      const centerZ = triangleBounds[offset + 2] + triangleBounds[offset + 5];
      centroidMinX = Math.min(centroidMinX, centerX);
      centroidMinY = Math.min(centroidMinY, centerY);
      centroidMinZ = Math.min(centroidMinZ, centerZ);
      centroidMaxX = Math.max(centroidMaxX, centerX);
      centroidMaxY = Math.max(centroidMaxY, centerY);
      centroidMaxZ = Math.max(centroidMaxZ, centerZ);
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
  checkResources();
  const nodeBoundsOverlap = (first: number, second: number): boolean => {
    const firstOffset = first * 6;
    const secondOffset = second * 6;
    return !(
      nodeBounds[firstOffset] > nodeBounds[secondOffset + 3] ||
      nodeBounds[firstOffset + 3] < nodeBounds[secondOffset] ||
      nodeBounds[firstOffset + 1] > nodeBounds[secondOffset + 4] ||
      nodeBounds[firstOffset + 4] < nodeBounds[secondOffset + 1] ||
      nodeBounds[firstOffset + 2] > nodeBounds[secondOffset + 5] ||
      nodeBounds[firstOffset + 5] < nodeBounds[secondOffset + 2]
    );
  };

  const firstTriangle = new Float64Array(9);
  const secondTriangle = new Float64Array(9);
  const samplePairStorage = new Uint32Array(maxFoundPairs * 2);
  let storedSamplePairCount = 0;
  let broadPhasePairCheckCount = 0;
  let candidatePairCount = 0;
  let intersectionPairCountLowerBound = 0;
  let traversalComplete = true;
  let stopTraversal = false;
  let traversalVisits = 0;

  const checkCancellation = (): void => {
    if (traversalVisits >= maxTraversalVisits) {
      throw new ParsedSelfIntersectionError(
        'RESOURCE_LIMIT',
        `Self-intersection proof exceeded ${maxTraversalVisits} BVH traversal visits`
      );
    }
    traversalVisits += 1;
    if ((traversalVisits & 0x3fff) === 0) checkResources();
  };
  const testPair = (first: number, second: number): void => {
    if (stopTraversal) return;
    if (broadPhasePairCheckCount >= maxBroadPhasePairChecks) {
      throw new ParsedSelfIntersectionError(
        'RESOURCE_LIMIT',
        `Self-intersection proof exceeded ${maxBroadPhasePairChecks} broad-phase pair checks`
      );
    }
    broadPhasePairCheckCount += 1;
    if ((broadPhasePairCheckCount & 0x3fff) === 0) checkResources();
    if (!triangleBoundsOverlap(triangleBounds, first, second)) return;
    if (candidatePairCount >= maxCandidatePairs) {
      throw new ParsedSelfIntersectionError(
        'RESOURCE_LIMIT',
        `Self-intersection proof exceeded ${maxCandidatePairs} candidate pairs`
      );
    }
    candidatePairCount += 1;
    artifact.readTriangle(first, firstTriangle);
    artifact.readTriangle(second, secondTriangle);
    if (!trianglesHaveForbiddenIntersection(firstTriangle, secondTriangle)) return;
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
    checkCancellation();
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
    checkCancellation();
    if (nodeLeft[node] === LEAF_SENTINEL) {
      visitLeafPair(node, node, true);
      return;
    }
    visitSelf(nodeLeft[node]);
    visitSelf(nodeRight[node]);
    visitPair(nodeLeft[node], nodeRight[node]);
  };
  visitSelf(root);
  checkResources();

  const selfIntersectionFree = traversalComplete && intersectionPairCountLowerBound === 0;
  const frozenSamples = Object.freeze(
    Array.from({ length: storedSamplePairCount }, (_, pairIndex) =>
      Object.freeze([
        samplePairStorage[pairIndex * 2],
        samplePairStorage[pairIndex * 2 + 1],
      ] as const)
    )
  );
  const evidenceSha256 = sha256Utf8(
    JSON.stringify([
      PARSED_SELF_INTERSECTION_PROOF_VERSION,
      PARSED_SELF_INTERSECTION_PROOF_SHA256,
      EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256,
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
      frozenSamples,
    ])
  );
  return Object.freeze({
    proofVersion: PARSED_SELF_INTERSECTION_PROOF_VERSION,
    proofMethodSha256: PARSED_SELF_INTERSECTION_PROOF_SHA256,
    evidenceSha256,
    narrowPhaseProofSha256: EXACT_TRIANGLE_INTERSECTION_PROOF_SHA256,
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
    samplePairs: frozenSamples,
  });
}
