import { domainSeparatedCanonicalJsonSha256 } from './canonicalCertificationJson';
import { IncrementalSha256, sha256Utf8 } from './incrementalSha256';

export const EXACT_DYADIC_DOMAIN_PARTITION_VERSION =
  'potfoundry.exact-dyadic-rectangle-partition/v8' as const;
export const EXACT_DYADIC_DOMAIN_PARTITION_PROOF_SHA256 = sha256Utf8(
  [
    EXACT_DYADIC_DOMAIN_PARTITION_VERSION,
    'coordinates = bounded signed integer numerators over one declared positive integer denominator',
    'the denominator is an odd factor times a power of two; the odd factor defaults to one and is declared explicitly otherwise, so every partition has exactly one canonical coordinate encoding',
    'the conformity, containment, and coverage audit is scale-free: it operates on numerators only and never divides by the denominator',
    'triangle orientation, areas, containment, segment incidence, and total area use exact BigInt arithmetic',
    'every parameter triangle is positively oriented and lies inside the declared closed rectangle',
    'pair audit permits only exact common vertices or one complete common edge',
    'proper crossings, containment, duplicates, partial collinear overlap, and T-junctions are rejected',
    'pairwise-disjoint closed triangles plus exact rectangle area equality prove complete domain coverage',
    'artifact triangle count and assignments are unique, strictly sorted, and bounded to the binary-STL uint32 index envelope used by evidence records',
    'complete median-AABB BVH traversal enumerates every exact-overlapping triangle pair once; exact narrow phase uses no sampling',
    'BVH nodes, traversal visits, leaf broad-phase checks, exact candidates, and cancellation are independently bounded',
    'all evidence is derived from one immutable snapshot and the exact BigInt triangles actually audited',
    'large triangle evidence uses domain-separated incremental SHA-256 over fixed 4-byte uint32 indices and 8-byte signed BigInt numerators; no bounded canonical-JSON array contains triangle records',
    'stream hashing reuses fixed records and polls shared cancellation without callbacks',
    'ordinary dense data records are descriptor-snapshotted only after absolute resource ceilings are resolved; accessors, holes, extras, and oversize arrays refuse before bulk allocation',
    'one WeakMap-authenticated immutable partition snapshot is reused by every downstream proof layer instead of cloning the mapping graph repeatedly',
    'snapshot copying polls shared cancellation and every snapshot/build/BVH/traversal/pair option has a non-raiseable hard ceiling',
    'BVH scan, sort-comparator, and copy work is explicitly charged; a hard elapsed-time deadline refuses fail-closed',
  ].join('\n')
);

export const DEFAULT_DYADIC_PARTITION_MAX_TRIANGLES = 262_144;
export const DEFAULT_DYADIC_PARTITION_MAX_BUILD_WORK = 80_000_000;
export const DEFAULT_DYADIC_PARTITION_MAX_BVH_NODES = 1_048_576;
export const DEFAULT_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS = 80_000_000;
export const DEFAULT_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS = 80_000_000;
export const DEFAULT_DYADIC_PARTITION_MAX_PAIR_CHECKS = 40_000_000;
export const DEFAULT_DYADIC_PARTITION_MAX_ELAPSED_MILLISECONDS = 60_000;
// Envelope v5 (2026-07-18): WaveInterference FULL-DEFAULTS walls measured
// ~412k-528k triangles per patch (vertical demand 87 µm at 2^6 rows ⇒ ~194
// rows; angular ≤ 10 µm at 2^10; margin config 2^10 × 2^8 + fade-kink
// stations = 528,384) against the previous 262,144 hard cap. Hard ceilings
// ×4; DEFAULTS unchanged — callers opt in per run via partition options.
export const HARD_DYADIC_PARTITION_MAX_TRIANGLES = 1_048_576;
export const HARD_DYADIC_PARTITION_MAX_BUILD_WORK = 320_000_000;
export const HARD_DYADIC_PARTITION_MAX_BVH_NODES = 4_194_304;
export const HARD_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS = 320_000_000;
export const HARD_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS = 320_000_000;
export const HARD_DYADIC_PARTITION_MAX_PAIR_CHECKS = 160_000_000;
export const HARD_DYADIC_PARTITION_MAX_ELAPSED_MILLISECONDS = 600_000;
export const MAX_DYADIC_FRACTION_BITS = 52;
/**
 * Largest declarable odd denominator factor. Coordinates are
 * numerator / (oddDenominatorFactor * 2^fractionBits); the factor lets
 * feature lines at k/N (N not a power of two) sit EXACTLY on cell
 * boundaries. 2^52-1 keeps numerator*factor products inside the signed
 * 62-bit numerator envelope used by downstream exact converters.
 */
export const MAX_ODD_DENOMINATOR_FACTOR = 4_503_599_627_370_495n;
const PARTITION_BVH_LEAF_SIZE = 8;

export interface ExactDyadicPoint2 {
  readonly uNumerator: string;
  readonly vNumerator: string;
}

export interface ExactDyadicRectangle {
  readonly minUNumerator: string;
  readonly maxUNumerator: string;
  readonly minVNumerator: string;
  readonly maxVNumerator: string;
}

export interface ExactDyadicMappedTriangle {
  readonly artifactTriangleIndex: number;
  readonly vertices: readonly [ExactDyadicPoint2, ExactDyadicPoint2, ExactDyadicPoint2];
}

export interface ExactDyadicDomainPartitionInput {
  readonly patchId: string;
  readonly fractionBits: number;
  /**
   * Optional odd factor of the coordinate denominator (denominator =
   * oddDenominatorFactor * 2^fractionBits). Omit for dyadic partitions;
   * when present it must be an odd integer >= 3, so each partition has
   * exactly one canonical encoding.
   */
  readonly oddDenominatorFactor?: string;
  readonly domain: ExactDyadicRectangle;
  readonly artifactTriangleCount: number;
  readonly triangles: readonly ExactDyadicMappedTriangle[];
}

export interface ExactDyadicDomainPartitionOptions {
  readonly maxTriangles?: number;
  readonly maxBuildWork?: number;
  readonly maxBvhNodes?: number;
  readonly maxTraversalVisits?: number;
  readonly maxBroadPhasePairChecks?: number;
  readonly maxPairChecks?: number;
  /** Absolute wall-clock deadline. Values beyond the hard horizon are clamped. */
  readonly deadlineEpochMilliseconds?: number;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export type ExactDyadicDomainPartitionErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_PARTITION'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED';

export class ExactDyadicDomainPartitionError extends Error {
  readonly code: ExactDyadicDomainPartitionErrorCode;
  readonly triangleA?: number;
  readonly triangleB?: number;

  constructor(
    code: ExactDyadicDomainPartitionErrorCode,
    message: string,
    triangleA?: number,
    triangleB?: number
  ) {
    super(message);
    this.name = 'ExactDyadicDomainPartitionError';
    this.code = code;
    this.triangleA = triangleA;
    this.triangleB = triangleB;
  }
}

export interface ExactDyadicDomainPartitionResult {
  readonly proofVersion: typeof EXACT_DYADIC_DOMAIN_PARTITION_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly patchId: string;
  readonly fractionBits: number;
  /** Resolved odd denominator factor ('1' for dyadic partitions). */
  readonly oddDenominatorFactor: string;
  readonly triangleCount: number;
  readonly buildWorkCount: number;
  readonly bvhNodeCount: number;
  readonly traversalVisitCount: number;
  readonly broadPhasePairCheckCount: number;
  readonly pairCheckCount: number;
  readonly doubledDomainAreaNumerator: string;
  readonly doubledTriangleAreaSumNumerator: string;
  readonly artifactTriangleAssignmentSha256: string;
  readonly triangleEvidenceSha256: string;
  readonly scanComplete: true;
  readonly exactPartition: true;
}

interface Point {
  readonly u: bigint;
  readonly v: bigint;
}

interface Triangle {
  readonly artifactTriangleIndex: number;
  readonly vertices: readonly [Point, Point, Point];
  readonly doubledArea: bigint;
  readonly minU: bigint;
  readonly maxU: bigint;
  readonly minV: bigint;
  readonly maxV: bigint;
}

interface PartitionBvhNode {
  readonly minU: bigint;
  readonly maxU: bigint;
  readonly minV: bigint;
  readonly maxV: bigint;
  readonly start: number;
  readonly end: number;
  readonly left: number;
  readonly right: number;
}

type SegmentRelation =
  | { readonly kind: 'disjoint' }
  | { readonly kind: 'proper-crossing' }
  | { readonly kind: 'point'; readonly point: Point }
  | { readonly kind: 'collinear-overlap' };

const ID_RE = /^[a-z0-9](?:[a-z0-9._:/-]{0,127})$/;
const INTEGER_RE = /^(?:0|-?[1-9][0-9]*)$/;
const MAX_ABSOLUTE_NUMERATOR = (1n << 62n) - 1n;
const MAX_UINT32 = 0xffff_ffff;
const STREAM_EVIDENCE_VERSION = 'potfoundry.exact-dyadic-domain/stream-evidence/v2';
const textEncoder = new TextEncoder();
const authenticatedPartitionSnapshots = new WeakMap<
  object,
  Readonly<{ triangleCount: number }>
>();

function inputError(message: string): never {
  throw new ExactDyadicDomainPartitionError('INVALID_INPUT', message);
}

function updateFramedText(hasher: IncrementalSha256, value: string): void {
  const bytes = textEncoder.encode(value);
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, bytes.byteLength, false);
  hasher.update(length).update(bytes);
}

function createStreamEvidenceHasher(domain: string, triangleCount: number): IncrementalSha256 {
  const hasher = new IncrementalSha256();
  updateFramedText(hasher, STREAM_EVIDENCE_VERSION);
  updateFramedText(hasher, domain);
  updateFramedText(hasher, triangleCount.toString());
  return hasher;
}

function streamTriangleEvidence(
  triangles: readonly Triangle[],
  cancellationFlag: Int32Array | undefined,
  deadlineEpochMilliseconds?: number
): {
  readonly artifactTriangleAssignmentSha256: string;
  readonly triangleEvidenceSha256: string;
} {
  const assignmentHasher = createStreamEvidenceHasher(
    'artifact-triangle-assignments',
    triangles.length
  );
  const triangleHasher = createStreamEvidenceHasher('mapped-triangles', triangles.length);
  const assignmentRecord = new Uint8Array(4);
  const assignmentView = new DataView(assignmentRecord.buffer);
  const triangleRecord = new Uint8Array(4 + 6 * 8);
  const triangleView = new DataView(triangleRecord.buffer);
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
    if ((triangleIndex & 1023) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
    const triangle = triangles[triangleIndex];
    assignmentView.setUint32(0, triangle.artifactTriangleIndex, false);
    assignmentHasher.update(assignmentRecord);
    triangleView.setUint32(0, triangle.artifactTriangleIndex, false);
    let offset = 4;
    for (const vertex of triangle.vertices) {
      triangleView.setBigInt64(offset, vertex.u, false);
      triangleView.setBigInt64(offset + 8, vertex.v, false);
      offset += 16;
    }
    triangleHasher.update(triangleRecord);
  }
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  return Object.freeze({
    artifactTriangleAssignmentSha256: assignmentHasher.digestHex(),
    triangleEvidenceSha256: triangleHasher.digestHex(),
  });
}

function boundedPositiveSafeInteger(
  value: number | undefined,
  fallback: number,
  hardMaximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    inputError(`${label} must be a positive safe integer`);
  }
  if (resolved > hardMaximum) {
    throw new ExactDyadicDomainPartitionError(
      'RESOURCE_LIMIT',
      `${label} exceeds hard limit ${hardMaximum}`
    );
  }
  return resolved;
}

function parseNumerator(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || value.length > 20 || !INTEGER_RE.test(value)) {
    inputError(`${label} must be a canonical bounded integer string`);
  }
  const parsed = BigInt(value);
  if (parsed < -MAX_ABSOLUTE_NUMERATOR || parsed > MAX_ABSOLUTE_NUMERATOR) {
    inputError(`${label} exceeds the exact numerator envelope`);
  }
  return parsed;
}

function validateAtomicCounter(counter: Int32Array | undefined, label: string): void {
  if (counter === undefined) return;
  if (
    counter.length < 1 ||
    typeof SharedArrayBuffer === 'undefined' ||
    !(counter.buffer instanceof SharedArrayBuffer)
  ) {
    inputError(`${label} must contain index 0 and be backed by SharedArrayBuffer`);
  }
}

function pointsEqual(left: Point, right: Point): boolean {
  return left.u === right.u && left.v === right.v;
}

function orientation(a: Point, b: Point, c: Point): bigint {
  return (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
}

function between(value: bigint, a: bigint, b: bigint): boolean {
  return value >= (a < b ? a : b) && value <= (a > b ? a : b);
}

function onClosedSegment(point: Point, start: Point, end: Point): boolean {
  return (
    orientation(start, end, point) === 0n &&
    between(point.u, start.u, end.u) &&
    between(point.v, start.v, end.v)
  );
}

function oppositeSigns(left: bigint, right: bigint): boolean {
  return (left < 0n && right > 0n) || (left > 0n && right < 0n);
}

function uniquePoints(points: readonly Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    if (!result.some((candidate) => pointsEqual(candidate, point))) result.push(point);
  }
  return result;
}

function segmentRelation(a: Point, b: Point, c: Point, d: Point): SegmentRelation {
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  if (oppositeSigns(abc, abd) && oppositeSigns(cda, cdb)) {
    return { kind: 'proper-crossing' };
  }

  const contacts = uniquePoints(
    [
      abc === 0n && onClosedSegment(c, a, b) ? c : null,
      abd === 0n && onClosedSegment(d, a, b) ? d : null,
      cda === 0n && onClosedSegment(a, c, d) ? a : null,
      cdb === 0n && onClosedSegment(b, c, d) ? b : null,
    ].filter((point): point is Point => point !== null)
  );
  if (contacts.length === 0) return { kind: 'disjoint' };
  if (contacts.length === 1) return { kind: 'point', point: contacts[0] };
  return { kind: 'collinear-overlap' };
}

function edgeEquals(a: Point, b: Point, c: Point, d: Point): boolean {
  return (
    (pointsEqual(a, c) && pointsEqual(b, d)) ||
    (pointsEqual(a, d) && pointsEqual(b, c))
  );
}

function isCommonTriangleVertex(point: Point, left: Triangle, right: Triangle): boolean {
  return (
    left.vertices.some((candidate) => pointsEqual(candidate, point)) &&
    right.vertices.some((candidate) => pointsEqual(candidate, point))
  );
}

function thirdVertexForEdge(triangle: Triangle, edgeStart: Point, edgeEnd: Point): Point | undefined {
  return triangle.vertices.find(
    (point) => !pointsEqual(point, edgeStart) && !pointsEqual(point, edgeEnd)
  );
}

/**
 * A complete common edge is conforming only when the two open triangle
 * interiors lie on opposite sides. Same-side triangles overlap with positive
 * area; identical triangles are the three-edge special case of that defect.
 */
function commonEdgeSeparatesInteriors(
  edgeStart: Point,
  edgeEnd: Point,
  left: Triangle,
  right: Triangle
): boolean {
  const leftThird = thirdVertexForEdge(left, edgeStart, edgeEnd);
  const rightThird = thirdVertexForEdge(right, edgeStart, edgeEnd);
  if (leftThird === undefined || rightThird === undefined) return false;
  return oppositeSigns(
    orientation(edgeStart, edgeEnd, leftThird),
    orientation(edgeStart, edgeEnd, rightThird)
  );
}

function pointStrictlyInsidePositiveTriangle(point: Point, triangle: Triangle): boolean {
  const [a, b, c] = triangle.vertices;
  return (
    orientation(a, b, point) > 0n &&
    orientation(b, c, point) > 0n &&
    orientation(c, a, point) > 0n
  );
}

function aabbsDisjoint(left: Triangle, right: Triangle): boolean {
  return (
    left.maxU < right.minU ||
    right.maxU < left.minU ||
    left.maxV < right.minV ||
    right.maxV < left.minV
  );
}

function bvhNodeAabbsDisjoint(left: PartitionBvhNode, right: PartitionBvhNode): boolean {
  return (
    left.maxU < right.minU ||
    right.maxU < left.minU ||
    left.maxV < right.minV ||
    right.maxV < left.minV
  );
}

function compareBigInts(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function buildPartitionBvh(
  triangles: readonly Triangle[],
  maxBuildWork: number,
  maxBvhNodes: number,
  cancellationFlag: Int32Array | undefined,
  deadlineEpochMilliseconds?: number
): {
  readonly nodes: readonly PartitionBvhNode[];
  readonly order: readonly number[];
  readonly buildWorkCount: number;
} {
  let buildWorkCount = 0;
  const chargeBuildWork = (amount = 1): void => {
    buildWorkCount += amount;
    if (buildWorkCount > maxBuildWork) {
      throw new ExactDyadicDomainPartitionError(
        'RESOURCE_LIMIT',
        `Partition BVH build exceeds maxBuildWork=${maxBuildWork}`
      );
    }
    if ((buildWorkCount & 4095) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
  };
  chargeBuildWork(triangles.length);
  const order = Array.from({ length: triangles.length }, (_, index) => index);
  const nodes: PartitionBvhNode[] = [];

  const build = (start: number, end: number): number => {
    chargeBuildWork();
    checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    if (nodes.length >= maxBvhNodes) {
      throw new ExactDyadicDomainPartitionError(
        'RESOURCE_LIMIT',
        `Partition BVH exceeds maxBvhNodes=${maxBvhNodes}`
      );
    }
    let minU = triangles[order[start]].minU;
    let maxU = triangles[order[start]].maxU;
    let minV = triangles[order[start]].minV;
    let maxV = triangles[order[start]].maxV;
    for (let offset = start + 1; offset < end; offset += 1) {
      chargeBuildWork();
      const triangle = triangles[order[offset]];
      if (triangle.minU < minU) minU = triangle.minU;
      if (triangle.maxU > maxU) maxU = triangle.maxU;
      if (triangle.minV < minV) minV = triangle.minV;
      if (triangle.maxV > maxV) maxV = triangle.maxV;
    }
    const nodeIndex = nodes.length;
    nodes.push({ minU, maxU, minV, maxV, start, end, left: -1, right: -1 });
    if (end - start <= PARTITION_BVH_LEAF_SIZE) return nodeIndex;

    const splitOnU = maxU - minU >= maxV - minV;
    const sorted = order.slice(start, end).sort((leftIndex, rightIndex) => {
      chargeBuildWork();
      const left = triangles[leftIndex];
      const right = triangles[rightIndex];
      const primary = splitOnU
        ? compareBigInts(left.minU + left.maxU, right.minU + right.maxU)
        : compareBigInts(left.minV + left.maxV, right.minV + right.maxV);
      if (primary !== 0) return primary;
      const secondary = splitOnU
        ? compareBigInts(left.minV + left.maxV, right.minV + right.maxV)
        : compareBigInts(left.minU + left.maxU, right.minU + right.maxU);
      return secondary || left.artifactTriangleIndex - right.artifactTriangleIndex;
    });
    for (let offset = 0; offset < sorted.length; offset += 1) {
      chargeBuildWork();
      order[start + offset] = sorted[offset];
    }
    const middle = start + Math.floor((end - start) / 2);
    const left = build(start, middle);
    const right = build(middle, end);
    nodes[nodeIndex] = { minU, maxU, minV, maxV, start, end, left, right };
    return nodeIndex;
  };

  build(0, triangles.length);
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  return { nodes, order, buildWorkCount };
}

interface PartitionPairAuditResult {
  readonly buildWorkCount: number;
  readonly bvhNodeCount: number;
  readonly traversalVisitCount: number;
  readonly broadPhasePairCheckCount: number;
  readonly pairCheckCount: number;
}

function auditPartitionPairs(
  triangles: readonly Triangle[],
  options: {
    readonly maxBuildWork: number;
    readonly maxBvhNodes: number;
    readonly maxTraversalVisits: number;
    readonly maxBroadPhasePairChecks: number;
    readonly maxPairChecks: number;
    readonly cancellationFlag?: Int32Array;
    readonly deadlineEpochMilliseconds?: number;
  }
): PartitionPairAuditResult {
  const { nodes, order, buildWorkCount } = buildPartitionBvh(
    triangles,
    options.maxBuildWork,
    options.maxBvhNodes,
    options.cancellationFlag,
    options.deadlineEpochMilliseconds
  );
  const stack: Array<readonly [number, number]> = [[0, 0]];
  let traversalVisitCount = 0;
  let broadPhasePairCheckCount = 0;
  let pairCheckCount = 0;

  const auditPair = (leftIndex: number, rightIndex: number): void => {
    broadPhasePairCheckCount += 1;
    if (broadPhasePairCheckCount > options.maxBroadPhasePairChecks) {
      throw new ExactDyadicDomainPartitionError(
        'RESOURCE_LIMIT',
        `Partition leaf audit exceeds maxBroadPhasePairChecks=${options.maxBroadPhasePairChecks}`
      );
    }
    const left = triangles[leftIndex];
    const right = triangles[rightIndex];
    if (aabbsDisjoint(left, right)) return;
    pairCheckCount += 1;
    if (pairCheckCount > options.maxPairChecks) {
      throw new ExactDyadicDomainPartitionError(
        'RESOURCE_LIMIT',
        `Complete exact candidate audit exceeds maxPairChecks=${options.maxPairChecks}`
      );
    }
    if (trianglesHaveForbiddenDomainIntersection(left, right)) {
      throw new ExactDyadicDomainPartitionError(
        'INVALID_PARTITION',
        'Parameter triangles overlap, cross, contain, partially share an edge, or form a T-junction',
        left.artifactTriangleIndex,
        right.artifactTriangleIndex
      );
    }
  };

  while (stack.length > 0) {
    checkCancelled(options.cancellationFlag, options.deadlineEpochMilliseconds);
    const pair = stack.pop();
    if (pair === undefined) break;
    traversalVisitCount += 1;
    if (traversalVisitCount > options.maxTraversalVisits) {
      throw new ExactDyadicDomainPartitionError(
        'RESOURCE_LIMIT',
        `Partition BVH traversal exceeds maxTraversalVisits=${options.maxTraversalVisits}`
      );
    }
    const [leftNodeIndex, rightNodeIndex] = pair;
    const leftNode = nodes[leftNodeIndex];
    const rightNode = nodes[rightNodeIndex];
    if (leftNodeIndex !== rightNodeIndex && bvhNodeAabbsDisjoint(leftNode, rightNode)) {
      continue;
    }
    const leftLeaf = leftNode.left < 0;
    const rightLeaf = rightNode.left < 0;
    if (leftLeaf && rightLeaf) {
      if (leftNodeIndex === rightNodeIndex) {
        for (let leftOffset = leftNode.start; leftOffset < leftNode.end; leftOffset += 1) {
          for (let rightOffset = leftOffset + 1; rightOffset < leftNode.end; rightOffset += 1) {
            auditPair(order[leftOffset], order[rightOffset]);
          }
        }
      } else {
        for (let leftOffset = leftNode.start; leftOffset < leftNode.end; leftOffset += 1) {
          for (let rightOffset = rightNode.start; rightOffset < rightNode.end; rightOffset += 1) {
            auditPair(order[leftOffset], order[rightOffset]);
          }
        }
      }
      continue;
    }
    if (leftNodeIndex === rightNodeIndex) {
      stack.push(
        [leftNode.left, leftNode.left],
        [leftNode.left, leftNode.right],
        [leftNode.right, leftNode.right]
      );
    } else if (!leftLeaf && (rightLeaf || leftNode.end - leftNode.start >= rightNode.end - rightNode.start)) {
      stack.push([leftNode.left, rightNodeIndex], [leftNode.right, rightNodeIndex]);
    } else {
      stack.push([leftNodeIndex, rightNode.left], [leftNodeIndex, rightNode.right]);
    }
  }

  return {
    buildWorkCount,
    bvhNodeCount: nodes.length,
    traversalVisitCount,
    broadPhasePairCheckCount,
    pairCheckCount,
  };
}

function trianglesHaveForbiddenDomainIntersection(left: Triangle, right: Triangle): boolean {
  const leftEdges = [
    [left.vertices[0], left.vertices[1]],
    [left.vertices[1], left.vertices[2]],
    [left.vertices[2], left.vertices[0]],
  ] as const;
  const rightEdges = [
    [right.vertices[0], right.vertices[1]],
    [right.vertices[1], right.vertices[2]],
    [right.vertices[2], right.vertices[0]],
  ] as const;

  for (const [a, b] of leftEdges) {
    for (const [c, d] of rightEdges) {
      const relation = segmentRelation(a, b, c, d);
      if (relation.kind === 'proper-crossing') return true;
      if (relation.kind === 'collinear-overlap') {
        if (!edgeEquals(a, b, c, d)) return true;
        if (!commonEdgeSeparatesInteriors(a, b, left, right)) return true;
      }
      if (
        relation.kind === 'point' &&
        !isCommonTriangleVertex(relation.point, left, right)
      ) {
        return true;
      }
    }
  }

  return (
    left.vertices.some((point) => pointStrictlyInsidePositiveTriangle(point, right)) ||
    right.vertices.some((point) => pointStrictlyInsidePositiveTriangle(point, left))
  );
}

function readPoint(value: ExactDyadicPoint2, label: string): Point {
  if (typeof value !== 'object' || value === null) inputError(`${label} must be a point record`);
  return {
    u: parseNumerator(value.uNumerator, `${label}.uNumerator`),
    v: parseNumerator(value.vNumerator, `${label}.vNumerator`),
  };
}

function makeTriangle(
  value: ExactDyadicMappedTriangle,
  inputIndex: number,
  artifactTriangleCount: number,
  domain: { minU: bigint; maxU: bigint; minV: bigint; maxV: bigint }
): Triangle {
  if (
    !Number.isSafeInteger(value.artifactTriangleIndex) ||
    value.artifactTriangleIndex < 0 ||
    value.artifactTriangleIndex >= artifactTriangleCount
  ) {
    inputError(`triangles[${inputIndex}].artifactTriangleIndex is outside the artifact`);
  }
  if (!Array.isArray(value.vertices) || value.vertices.length !== 3) {
    inputError(`triangles[${inputIndex}].vertices must contain exactly three points`);
  }
  const vertices = value.vertices.map((point, vertexIndex) =>
    readPoint(point, `triangles[${inputIndex}].vertices[${vertexIndex}]`)
  ) as [Point, Point, Point];
  for (const point of vertices) {
    if (
      point.u < domain.minU ||
      point.u > domain.maxU ||
      point.v < domain.minV ||
      point.v > domain.maxV
    ) {
      throw new ExactDyadicDomainPartitionError(
        'INVALID_PARTITION',
        `Triangle ${value.artifactTriangleIndex} leaves the declared parameter rectangle`,
        value.artifactTriangleIndex
      );
    }
  }
  const doubledArea = orientation(vertices[0], vertices[1], vertices[2]);
  if (doubledArea <= 0n) {
    throw new ExactDyadicDomainPartitionError(
      'INVALID_PARTITION',
      `Triangle ${value.artifactTriangleIndex} is degenerate or not positively oriented`,
      value.artifactTriangleIndex
    );
  }
  return {
    artifactTriangleIndex: value.artifactTriangleIndex,
    vertices,
    doubledArea,
    minU: vertices.reduce((result, point) => (point.u < result ? point.u : result), vertices[0].u),
    maxU: vertices.reduce((result, point) => (point.u > result ? point.u : result), vertices[0].u),
    minV: vertices.reduce((result, point) => (point.v < result ? point.v : result), vertices[0].v),
    maxV: vertices.reduce((result, point) => (point.v > result ? point.v : result), vertices[0].v),
  };
}

function checkCancelled(
  flag: Int32Array | undefined,
  deadlineEpochMilliseconds?: number
): void {
  if (flag !== undefined && Atomics.load(flag, 0) !== 0) {
    throw new ExactDyadicDomainPartitionError('CANCELLED', 'Domain partition audit cancelled');
  }
  if (
    deadlineEpochMilliseconds !== undefined &&
    Date.now() > deadlineEpochMilliseconds
  ) {
    throw new ExactDyadicDomainPartitionError(
      'RESOURCE_LIMIT',
      'Domain partition audit exceeded its hard elapsed-time deadline'
    );
  }
}

type DataRecordSnapshot = Readonly<Record<string, unknown>>;

function snapshotDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string
): DataRecordSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an ordinary data record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have an ordinary prototype`);
  }
  const allowed = new Set(allowedKeys);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string' || !allowed.has(key))) {
    throw new TypeError(`${label} has unknown fields`);
  }
  for (const key of requiredKeys) {
    if (!ownKeys.includes(key)) throw new TypeError(`${label}.${key} is required`);
  }
  const result: Record<string, unknown> = {};
  for (const key of ownKeys) {
    if (typeof key !== 'string') throw new TypeError(`${label} has a symbol field`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}

function snapshotDenseArray(
  value: unknown,
  maximumLength: number,
  cancellationFlag: Int32Array | undefined,
  label: string,
  deadlineEpochMilliseconds?: number
): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be an ordinary array`);
  }
  const length = value.length;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new TypeError(`${label}.length is invalid`);
  }
  if (length > maximumLength) {
    throw new ExactDyadicDomainPartitionError(
      'RESOURCE_LIMIT',
      `${label} has ${length} entries; hard snapshot limit is ${maximumLength}`
    );
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== length + 1 ||
    !ownKeys.includes('length') ||
    ownKeys.some(
      (key) =>
        typeof key !== 'string' ||
        (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(key))
    )
  ) {
    throw new TypeError(`${label} must be dense and have no extra properties`);
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    if ((index & 1023) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, index.toString());
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      throw new TypeError(`${label}[${index}] must be an enumerable data property`);
    }
    result.push(descriptor.value);
  }
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  return Object.freeze(result);
}

/** Bounded, cancellation-aware inert snapshot shared by every partition proof entry point. */
export function snapshotExactDyadicDomainPartitionInputForProof(
  untrusted: ExactDyadicDomainPartitionInput,
  maxTriangles: number,
  cancellationFlag?: Int32Array,
  deadlineEpochMilliseconds?: number
): ExactDyadicDomainPartitionInput {
  if (
    !Number.isSafeInteger(maxTriangles) ||
    maxTriangles <= 0 ||
    maxTriangles > HARD_DYADIC_PARTITION_MAX_TRIANGLES
  ) {
    throw new ExactDyadicDomainPartitionError(
      'RESOURCE_LIMIT',
      `Snapshot maxTriangles must be in [1, ${HARD_DYADIC_PARTITION_MAX_TRIANGLES}]`
    );
  }
  validateAtomicCounter(cancellationFlag, 'cancellationFlag');
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  const authenticated = authenticatedPartitionSnapshots.get(untrusted as object);
  if (authenticated !== undefined) {
    if (authenticated.triangleCount > maxTriangles) {
      throw new ExactDyadicDomainPartitionError(
        'RESOURCE_LIMIT',
        `Authenticated partition has ${authenticated.triangleCount} triangles; limit is ${maxTriangles}`
      );
    }
    return untrusted;
  }
  const root = snapshotDataRecord(
    untrusted,
    [
      'artifactTriangleCount',
      'domain',
      'fractionBits',
      'oddDenominatorFactor',
      'patchId',
      'triangles',
    ],
    ['artifactTriangleCount', 'domain', 'fractionBits', 'patchId', 'triangles'],
    'partition input'
  );
  const domainValue = snapshotDataRecord(
    root.domain,
    ['maxUNumerator', 'maxVNumerator', 'minUNumerator', 'minVNumerator'],
    ['maxUNumerator', 'maxVNumerator', 'minUNumerator', 'minVNumerator'],
    'domain'
  );
  const triangleValues = snapshotDenseArray(
    root.triangles,
    maxTriangles,
    cancellationFlag,
    'triangles',
    deadlineEpochMilliseconds
  );
  const triangles: ExactDyadicMappedTriangle[] = [];
  for (let triangleIndex = 0; triangleIndex < triangleValues.length; triangleIndex += 1) {
    if ((triangleIndex & 1023) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
    const triangleValue = snapshotDataRecord(
      triangleValues[triangleIndex],
      ['artifactTriangleIndex', 'vertices'],
      ['artifactTriangleIndex', 'vertices'],
      `triangles[${triangleIndex}]`
    );
    const vertexValues = snapshotDenseArray(
      triangleValue.vertices,
      3,
      cancellationFlag,
      `triangles[${triangleIndex}].vertices`,
      deadlineEpochMilliseconds
    );
    if (vertexValues.length !== 3) {
      throw new TypeError(`triangles[${triangleIndex}].vertices must contain three points`);
    }
    const vertices = vertexValues.map((pointValue, vertexIndex) => {
      const point = snapshotDataRecord(
        pointValue,
        ['uNumerator', 'vNumerator'],
        ['uNumerator', 'vNumerator'],
        `triangles[${triangleIndex}].vertices[${vertexIndex}]`
      );
      return Object.freeze({
        uNumerator: point.uNumerator as string,
        vNumerator: point.vNumerator as string,
      });
    }) as unknown as ExactDyadicMappedTriangle['vertices'];
    triangles.push(
      Object.freeze({
        artifactTriangleIndex: triangleValue.artifactTriangleIndex as number,
        vertices: Object.freeze(vertices),
      })
    );
  }
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  const snapshot = Object.freeze({
    patchId: root.patchId as string,
    fractionBits: root.fractionBits as number,
    ...(Object.prototype.hasOwnProperty.call(root, 'oddDenominatorFactor')
      ? { oddDenominatorFactor: root.oddDenominatorFactor as string }
      : {}),
    domain: Object.freeze({
      minUNumerator: domainValue.minUNumerator as string,
      maxUNumerator: domainValue.maxUNumerator as string,
      minVNumerator: domainValue.minVNumerator as string,
      maxVNumerator: domainValue.maxVNumerator as string,
    }),
    artifactTriangleCount: root.artifactTriangleCount as number,
    triangles: Object.freeze(triangles),
  });
  authenticatedPartitionSnapshots.set(snapshot, Object.freeze({ triangleCount: triangles.length }));
  return snapshot;
}

function snapshotPartitionOptions(
  value: ExactDyadicDomainPartitionOptions
): ExactDyadicDomainPartitionOptions {
  const snapshot = snapshotDataRecord(
    value,
    [
      'cancellationFlag',
      'deadlineEpochMilliseconds',
      'maxBroadPhasePairChecks',
      'maxBuildWork',
      'maxBvhNodes',
      'maxPairChecks',
      'maxTraversalVisits',
      'maxTriangles',
      'progressCounter',
    ],
    [],
    'partition options'
  );
  return Object.freeze({
    maxTriangles: snapshot.maxTriangles as number | undefined,
    maxBuildWork: snapshot.maxBuildWork as number | undefined,
    maxBvhNodes: snapshot.maxBvhNodes as number | undefined,
    maxTraversalVisits: snapshot.maxTraversalVisits as number | undefined,
    maxBroadPhasePairChecks: snapshot.maxBroadPhasePairChecks as number | undefined,
    maxPairChecks: snapshot.maxPairChecks as number | undefined,
    deadlineEpochMilliseconds: snapshot.deadlineEpochMilliseconds as number | undefined,
    cancellationFlag: snapshot.cancellationFlag as Int32Array | undefined,
    progressCounter: snapshot.progressCounter as Int32Array | undefined,
  });
}

/**
 * Prove that exact dyadic UV triangles form a complete conforming partition of
 * a closed rectangle. This establishes correspondence coverage only; it does
 * not evaluate the 3D target or issue a geometric certificate.
 */
export function verifyExactDyadicRectanglePartition(
  untrustedInput: ExactDyadicDomainPartitionInput,
  options: ExactDyadicDomainPartitionOptions = {}
): ExactDyadicDomainPartitionResult {
  if (typeof untrustedInput !== 'object' || untrustedInput === null) {
    inputError('Input must be a record');
  }
  let optionSnapshot: ExactDyadicDomainPartitionOptions;
  try {
    optionSnapshot = snapshotPartitionOptions(options);
  } catch (error) {
    if (error instanceof ExactDyadicDomainPartitionError) throw error;
    inputError(
      error instanceof Error
        ? `Option snapshot refused: ${error.message}`
        : 'Option snapshot refused'
    );
  }
  validateAtomicCounter(optionSnapshot.cancellationFlag, 'cancellationFlag');
  validateAtomicCounter(optionSnapshot.progressCounter, 'progressCounter');
  const maxTriangles = boundedPositiveSafeInteger(
    optionSnapshot.maxTriangles,
    DEFAULT_DYADIC_PARTITION_MAX_TRIANGLES,
    HARD_DYADIC_PARTITION_MAX_TRIANGLES,
    'maxTriangles'
  );
  const maxBuildWork = boundedPositiveSafeInteger(
    optionSnapshot.maxBuildWork,
    DEFAULT_DYADIC_PARTITION_MAX_BUILD_WORK,
    HARD_DYADIC_PARTITION_MAX_BUILD_WORK,
    'maxBuildWork'
  );
  const maxBvhNodes = boundedPositiveSafeInteger(
    optionSnapshot.maxBvhNodes,
    DEFAULT_DYADIC_PARTITION_MAX_BVH_NODES,
    HARD_DYADIC_PARTITION_MAX_BVH_NODES,
    'maxBvhNodes'
  );
  const maxTraversalVisits = boundedPositiveSafeInteger(
    optionSnapshot.maxTraversalVisits,
    DEFAULT_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
    HARD_DYADIC_PARTITION_MAX_TRAVERSAL_VISITS,
    'maxTraversalVisits'
  );
  const maxBroadPhasePairChecks = boundedPositiveSafeInteger(
    optionSnapshot.maxBroadPhasePairChecks,
    DEFAULT_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
    HARD_DYADIC_PARTITION_MAX_BROAD_PHASE_PAIR_CHECKS,
    'maxBroadPhasePairChecks'
  );
  const maxPairChecks = boundedPositiveSafeInteger(
    optionSnapshot.maxPairChecks,
    DEFAULT_DYADIC_PARTITION_MAX_PAIR_CHECKS,
    HARD_DYADIC_PARTITION_MAX_PAIR_CHECKS,
    'maxPairChecks'
  );
  const requestedDeadline = optionSnapshot.deadlineEpochMilliseconds;
  if (
    requestedDeadline !== undefined &&
    (!Number.isFinite(requestedDeadline) || !Number.isSafeInteger(requestedDeadline))
  ) {
    inputError('deadlineEpochMilliseconds must be a finite safe integer');
  }
  const deadlineEpochMilliseconds = Math.min(
    requestedDeadline ?? Number.MAX_SAFE_INTEGER,
    Date.now() + HARD_DYADIC_PARTITION_MAX_ELAPSED_MILLISECONDS
  );
  checkCancelled(optionSnapshot.cancellationFlag, deadlineEpochMilliseconds);
  let input: ExactDyadicDomainPartitionInput;
  try {
    input = snapshotExactDyadicDomainPartitionInputForProof(
      untrustedInput,
      maxTriangles,
      optionSnapshot.cancellationFlag,
      deadlineEpochMilliseconds
    );
  } catch (error) {
    if (error instanceof ExactDyadicDomainPartitionError) throw error;
    inputError(error instanceof Error ? `Input snapshot refused: ${error.message}` : 'Input snapshot refused');
  }
  if (typeof input.patchId !== 'string' || !ID_RE.test(input.patchId)) {
    inputError('patchId must be a bounded lowercase ASCII id');
  }
  if (
    !Number.isSafeInteger(input.fractionBits) ||
    input.fractionBits < 0 ||
    input.fractionBits > MAX_DYADIC_FRACTION_BITS
  ) {
    inputError(`fractionBits must be an integer in [0, ${MAX_DYADIC_FRACTION_BITS}]`);
  }
  let oddDenominatorFactor = 1n;
  if (input.oddDenominatorFactor !== undefined) {
    oddDenominatorFactor = parseNumerator(
      input.oddDenominatorFactor,
      'oddDenominatorFactor'
    );
    if (
      oddDenominatorFactor < 3n ||
      (oddDenominatorFactor & 1n) !== 1n ||
      oddDenominatorFactor > MAX_ODD_DENOMINATOR_FACTOR
    ) {
      inputError(
        `oddDenominatorFactor must be an odd integer in [3, ${MAX_ODD_DENOMINATOR_FACTOR}]; omit it for dyadic partitions`
      );
    }
  }
  if (
    !Number.isSafeInteger(input.artifactTriangleCount) ||
    input.artifactTriangleCount <= 0 ||
    input.artifactTriangleCount > MAX_UINT32
  ) {
    inputError('artifactTriangleCount must be a positive uint32 integer');
  }
  if (!Array.isArray(input.triangles) || input.triangles.length === 0) {
    inputError('triangles must be a non-empty array');
  }
  if (input.triangles.length > maxTriangles) {
    throw new ExactDyadicDomainPartitionError(
      'RESOURCE_LIMIT',
      `Domain partition has ${input.triangles.length} triangles; limit is ${maxTriangles}`
    );
  }
  const minU = parseNumerator(input.domain.minUNumerator, 'domain.minUNumerator');
  const maxU = parseNumerator(input.domain.maxUNumerator, 'domain.maxUNumerator');
  const minV = parseNumerator(input.domain.minVNumerator, 'domain.minVNumerator');
  const maxV = parseNumerator(input.domain.maxVNumerator, 'domain.maxVNumerator');
  if (minU >= maxU || minV >= maxV) inputError('Domain rectangle must have positive exact area');
  const domain = { minU, maxU, minV, maxV };
  const doubledDomainArea = 2n * (maxU - minU) * (maxV - minV);

  const triangles: Triangle[] = [];
  let previousArtifactTriangleIndex = -1;
  let doubledTriangleAreaSum = 0n;
  for (let index = 0; index < input.triangles.length; index += 1) {
    checkCancelled(optionSnapshot.cancellationFlag, deadlineEpochMilliseconds);
    const triangle = makeTriangle(
      input.triangles[index],
      index,
      input.artifactTriangleCount,
      domain
    );
    if (triangle.artifactTriangleIndex <= previousArtifactTriangleIndex) {
      inputError('Artifact triangle assignments must be unique and strictly sorted');
    }
    previousArtifactTriangleIndex = triangle.artifactTriangleIndex;
    doubledTriangleAreaSum += triangle.doubledArea;
    triangles.push(triangle);
    if (optionSnapshot.progressCounter !== undefined) {
      Atomics.store(optionSnapshot.progressCounter, 0, index + 1);
    }
  }

  const pairAudit = auditPartitionPairs(triangles, {
    maxBuildWork,
    maxBvhNodes,
    maxTraversalVisits,
    maxBroadPhasePairChecks,
    maxPairChecks,
    cancellationFlag: optionSnapshot.cancellationFlag,
    deadlineEpochMilliseconds,
  });

  if (doubledTriangleAreaSum !== doubledDomainArea) {
    throw new ExactDyadicDomainPartitionError(
      'INVALID_PARTITION',
      'Exact triangle area sum does not equal the declared rectangle area'
    );
  }

  const { artifactTriangleAssignmentSha256, triangleEvidenceSha256 } =
    streamTriangleEvidence(
      triangles,
      optionSnapshot.cancellationFlag,
      deadlineEpochMilliseconds
    );
  const evidenceSha256 = domainSeparatedCanonicalJsonSha256(
    'potfoundry.exact-dyadic-domain/partition-evidence/v2',
    {
      artifactTriangleAssignmentSha256,
      artifactTriangleCount: input.artifactTriangleCount.toString(),
      broadPhasePairCheckCount: pairAudit.broadPhasePairCheckCount.toString(),
      buildWorkCount: pairAudit.buildWorkCount.toString(),
      bvhNodeCount: pairAudit.bvhNodeCount.toString(),
      domain: {
        maxUNumerator: maxU.toString(),
        maxVNumerator: maxV.toString(),
        minUNumerator: minU.toString(),
        minVNumerator: minV.toString(),
      },
      doubledDomainAreaNumerator: doubledDomainArea.toString(),
      doubledTriangleAreaSumNumerator: doubledTriangleAreaSum.toString(),
      fractionBits: input.fractionBits.toString(),
      oddDenominatorFactor: oddDenominatorFactor.toString(),
      pairCheckCount: pairAudit.pairCheckCount.toString(),
      patchId: input.patchId,
      proofMethodSha256: EXACT_DYADIC_DOMAIN_PARTITION_PROOF_SHA256,
      proofVersion: EXACT_DYADIC_DOMAIN_PARTITION_VERSION,
      triangleCount: triangles.length.toString(),
      triangleEvidenceSha256,
      traversalVisitCount: pairAudit.traversalVisitCount.toString(),
    }
  );

  return Object.freeze({
    proofVersion: EXACT_DYADIC_DOMAIN_PARTITION_VERSION,
    proofMethodSha256: EXACT_DYADIC_DOMAIN_PARTITION_PROOF_SHA256,
    evidenceSha256,
    patchId: input.patchId,
    fractionBits: input.fractionBits,
    oddDenominatorFactor: oddDenominatorFactor.toString(),
    triangleCount: triangles.length,
    buildWorkCount: pairAudit.buildWorkCount,
    bvhNodeCount: pairAudit.bvhNodeCount,
    traversalVisitCount: pairAudit.traversalVisitCount,
    broadPhasePairCheckCount: pairAudit.broadPhasePairCheckCount,
    pairCheckCount: pairAudit.pairCheckCount,
    doubledDomainAreaNumerator: doubledDomainArea.toString(),
    doubledTriangleAreaSumNumerator: doubledTriangleAreaSum.toString(),
    artifactTriangleAssignmentSha256,
    triangleEvidenceSha256,
    scanComplete: true,
    exactPartition: true,
  });
}
