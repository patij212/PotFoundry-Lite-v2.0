import type { ParsedBinaryStlArtifact } from './binaryStlArtifact';
import { exactTriangleIsDegenerate } from './exactTriangleIntersection';
import { sha256Utf8 } from './incrementalSha256';

export const PARSED_TOPOLOGY_PROOF_VERSION =
  'potfoundry.parsed-topology-exact-binary32/v4' as const;
export const PARSED_TOPOLOGY_PROOF_SHA256 = sha256Utf8(
  [
    PARSED_TOPOLOGY_PROOF_VERSION,
    'vertex identity = exact finite binary32 xyz bits with signed zero canonicalized',
    'triangle stream = parsed binary STL facet order; vertices = little-endian xyz f32',
    'undirected edge key = ordered canonical vertex ids; occurrence = triangle corner id',
    'closed iff every nondegenerate edge has exactly two uses',
    'consistent orientation iff each two-use edge has one use per direction',
    'vertex 2-manifold iff incident triangle corners form one edge-adjacent link component',
    'components = union of vertices connected by nondegenerate triangles',
    'Euler characteristic = V - E + F over nondegenerate triangle complex',
    'volume sign = six f32 triple products per facet with a gamma-n binary64 error enclosure',
    'plain own-data options are snapshotted and every byte/work/deadline option has a non-raiseable hard ceiling',
  ].join('\n')
);

export const DEFAULT_TOPOLOGY_MAX_UNIQUE_VERTICES = 1_000_000;
export const DEFAULT_TOPOLOGY_MAX_EDGE_RECORD_BYTES = 96 * 1024 * 1024;
export const DEFAULT_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_TOPOLOGY_MAX_LINK_UNION_BYTES = 32 * 1024 * 1024;
export const DEFAULT_TOPOLOGY_MAX_WORK_UNITS = 80_000_000;
export const HARD_TOPOLOGY_MAX_UNIQUE_VERTICES = 1_000_000;
export const HARD_TOPOLOGY_MAX_EDGE_RECORD_BYTES = 128 * 1024 * 1024;
export const HARD_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES = 64 * 1024 * 1024;
export const HARD_TOPOLOGY_MAX_LINK_UNION_BYTES = 64 * 1024 * 1024;
export const HARD_TOPOLOGY_MAX_WORK_UNITS = 200_000_000;
export const HARD_TOPOLOGY_MAX_ELAPSED_MILLISECONDS = 240_000;

export type ParsedTopologyErrorCode = 'RESOURCE_LIMIT' | 'INVALID_OPTIONS' | 'CANCELLED';

export class ParsedTopologyError extends Error {
  readonly code: ParsedTopologyErrorCode;

  constructor(code: ParsedTopologyErrorCode, message: string) {
    super(message);
    this.name = 'ParsedTopologyError';
    this.code = code;
  }
}

export interface ParsedTopologyOptions {
  maxUniqueVertices?: number;
  maxEdgeRecordBytes?: number;
  maxTriangleVertexBytes?: number;
  maxLinkUnionBytes?: number;
  maxWorkUnits?: number;
  deadlineEpochMilliseconds?: number;
  cancellationFlag?: Int32Array;
  progressCounter?: Int32Array;
}

export interface ParsedArtifactTopology {
  readonly proofVersion: typeof PARSED_TOPOLOGY_PROOF_VERSION;
  readonly proofMethodSha256: string;
  readonly evidenceSha256: string;
  readonly artifactByteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly triangleCount: number;
  readonly validTriangleCount: number;
  readonly uniqueVertexCount: number;
  readonly uniqueEdgeCount: number;
  readonly componentCount: number;
  readonly eulerCharacteristic: number;
  readonly genus: number | null;
  readonly boundaryEdges: number;
  readonly nonManifoldEdges: number;
  readonly nonManifoldVertices: number;
  readonly orientationMismatches: number;
  readonly degenerateTriangleCount: number;
  readonly closed: boolean;
  readonly manifold: boolean;
  readonly consistentlyOriented: boolean;
  readonly outwardFacing: boolean;
  readonly volumeSign: 'positive-proven' | 'negative-proven' | 'indeterminate';
  readonly signedVolumeMm3: number;
  readonly signedVolumeErrorBoundMm3: number;
  readonly minimumDoubleAreaMm2: number;
  readonly workUnitCount: number;
}

const nextPowerOfTwo = (value: number): number => {
  let result = 16;
  while (result < value) result *= 2;
  return result;
};

const mixVertexBits = (x: number, y: number, z: number): number => {
  let hash = Math.imul(x ^ (y >>> 16), 0x9e3779b1);
  hash ^= Math.imul(y ^ (z >>> 15), 0x85ebca6b);
  hash ^= Math.imul(z ^ (x >>> 13), 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
};

class ExactVertexInterner {
  private xBits: Uint32Array;
  private yBits: Uint32Array;
  private zBits: Uint32Array;
  private idsPlusOne: Uint32Array;
  private parent: Uint32Array;
  private rank: Uint8Array;
  private mask: number;
  private count = 0;

  constructor(
    private readonly maxUniqueVertices: number,
    initialCapacity: number
  ) {
    const capacity = nextPowerOfTwo(Math.max(16, initialCapacity));
    this.xBits = new Uint32Array(capacity);
    this.yBits = new Uint32Array(capacity);
    this.zBits = new Uint32Array(capacity);
    this.idsPlusOne = new Uint32Array(capacity);
    this.mask = capacity - 1;
    this.parent = new Uint32Array(Math.min(Math.max(16, initialCapacity), maxUniqueVertices));
    this.rank = new Uint8Array(this.parent.length);
  }

  get size(): number {
    return this.count;
  }

  intern(x: number, y: number, z: number): number {
    if ((this.count + 1) * 10 >= this.idsPlusOne.length * 7) this.growTable();
    let slot = mixVertexBits(x, y, z) & this.mask;
    while (this.idsPlusOne[slot] !== 0) {
      if (this.xBits[slot] === x && this.yBits[slot] === y && this.zBits[slot] === z) {
        return this.idsPlusOne[slot] - 1;
      }
      slot = (slot + 1) & this.mask;
    }
    if (this.count >= this.maxUniqueVertices) {
      throw new ParsedTopologyError(
        'RESOURCE_LIMIT',
        `Parsed artifact exceeds ${this.maxUniqueVertices} unique exact vertices`
      );
    }
    const id = this.count;
    this.count += 1;
    this.ensureUnionCapacity(this.count);
    this.parent[id] = id;
    this.xBits[slot] = x;
    this.yBits[slot] = y;
    this.zBits[slot] = z;
    this.idsPlusOne[slot] = id + 1;
    return id;
  }

  union(a: number, b: number): void {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA] += 1;
  }

  componentCount(): number {
    let components = 0;
    for (let id = 0; id < this.count; id += 1) {
      if (this.find(id) === id) components += 1;
    }
    return components;
  }

  private find(id: number): number {
    let root = id;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[id] !== id) {
      const next = this.parent[id];
      this.parent[id] = root;
      id = next;
    }
    return root;
  }

  private growTable(): void {
    const oldCapacity = this.idsPlusOne.length;
    const maximumCapacity = nextPowerOfTwo(Math.ceil(this.maxUniqueVertices / 0.7));
    if (oldCapacity >= maximumCapacity) {
      throw new ParsedTopologyError('RESOURCE_LIMIT', 'Exact vertex hash table is exhausted');
    }
    const newCapacity = Math.min(oldCapacity * 2, maximumCapacity);
    let nextX: Uint32Array;
    let nextY: Uint32Array;
    let nextZ: Uint32Array;
    let nextIds: Uint32Array;
    try {
      nextX = new Uint32Array(newCapacity);
      nextY = new Uint32Array(newCapacity);
      nextZ = new Uint32Array(newCapacity);
      nextIds = new Uint32Array(newCapacity);
    } catch {
      throw new ParsedTopologyError('RESOURCE_LIMIT', 'Could not grow exact vertex hash table');
    }
    const nextMask = newCapacity - 1;
    for (let slot = 0; slot < oldCapacity; slot += 1) {
      const idPlusOne = this.idsPlusOne[slot];
      if (idPlusOne === 0) continue;
      const x = this.xBits[slot];
      const y = this.yBits[slot];
      const z = this.zBits[slot];
      let nextSlot = mixVertexBits(x, y, z) & nextMask;
      while (nextIds[nextSlot] !== 0) nextSlot = (nextSlot + 1) & nextMask;
      nextX[nextSlot] = x;
      nextY[nextSlot] = y;
      nextZ[nextSlot] = z;
      nextIds[nextSlot] = idPlusOne;
    }
    this.xBits = nextX;
    this.yBits = nextY;
    this.zBits = nextZ;
    this.idsPlusOne = nextIds;
    this.mask = nextMask;
  }

  private ensureUnionCapacity(required: number): void {
    if (required <= this.parent.length) return;
    const nextLength = Math.min(this.maxUniqueVertices, Math.max(required, this.parent.length * 2));
    try {
      const nextParent = new Uint32Array(nextLength);
      nextParent.set(this.parent);
      this.parent = nextParent;
      const nextRank = new Uint8Array(nextLength);
      nextRank.set(this.rank);
      this.rank = nextRank;
    } catch {
      throw new ParsedTopologyError('RESOURCE_LIMIT', 'Could not grow component union storage');
    }
  }
}

class LinkUnionFind {
  private readonly parent: Uint32Array;
  private readonly rank: Uint8Array;

  constructor(size: number) {
    try {
      this.parent = new Uint32Array(size);
      this.rank = new Uint8Array(size);
    } catch {
      throw new ParsedTopologyError('RESOURCE_LIMIT', 'Could not allocate vertex-link storage');
    }
    for (let id = 0; id < size; id += 1) this.parent[id] = id;
  }

  find(id: number): number {
    let root = id;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[id] !== id) {
      const next = this.parent[id];
      this.parent[id] = root;
      id = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;
    if (this.rank[rootA] < this.rank[rootB]) [rootA, rootB] = [rootB, rootA];
    this.parent[rootB] = rootA;
    if (this.rank[rootA] === this.rank[rootB]) this.rank[rootA] += 1;
  }
}

function requiredUnsignedBits(count: number): number {
  if (count <= 1) return 1;
  return 32 - Math.clz32(count - 1);
}

const nextUpBuffer = new ArrayBuffer(8);
const nextUpFloat = new Float64Array(nextUpBuffer);
const nextUpBits = new BigUint64Array(nextUpBuffer);

function nextUpNonNegative(value: number): number {
  if (value === Number.POSITIVE_INFINITY) return value;
  if (!Number.isFinite(value) || value < 0) {
    throw new ParsedTopologyError('RESOURCE_LIMIT', 'Volume error enclosure overflowed');
  }
  if (value === 0) return Number.MIN_VALUE;
  nextUpFloat[0] = value;
  nextUpBits[0] += 1n;
  return nextUpFloat[0];
}

function boundSignedSixVolumeError(absoluteComputedTermSum: number, termCount: number): number {
  if (termCount === 0) return 0;
  const unitRoundoff = Number.EPSILON / 2;
  const additionFactor = (termCount - 1) * unitRoundoff;
  if (additionFactor >= 1 || !Number.isFinite(absoluteComputedTermSum)) {
    return Number.POSITIVE_INFINITY;
  }
  const gamma = nextUpNonNegative(additionFactor / (1 - additionFactor));
  const computedTermSumUpper = nextUpNonNegative(absoluteComputedTermSum / (1 - gamma));
  const exactTermSumUpper = nextUpNonNegative(computedTermSumUpper / (1 - unitRoundoff));
  const additionError = nextUpNonNegative(gamma * computedTermSumUpper);
  const multiplicationError = nextUpNonNegative(unitRoundoff * exactTermSumUpper);
  return nextUpNonNegative(additionError + multiplicationError);
}

const TOPOLOGY_OPTION_KEYS = new Set([
  'cancellationFlag',
  'deadlineEpochMilliseconds',
  'maxEdgeRecordBytes',
  'maxLinkUnionBytes',
  'maxTriangleVertexBytes',
  'maxUniqueVertices',
  'maxWorkUnits',
  'progressCounter',
]);

function snapshotOptions(options: ParsedTopologyOptions): ParsedTopologyOptions {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new ParsedTopologyError(
      'INVALID_OPTIONS',
      'Topology options must be a plain own-data-property record'
    );
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ParsedTopologyError(
      'INVALID_OPTIONS',
      'Topology options must have Object or null prototype'
    );
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(options)) {
    if (typeof key !== 'string' || !TOPOLOGY_OPTION_KEYS.has(key)) {
      throw new ParsedTopologyError('INVALID_OPTIONS', `Unknown topology option '${String(key)}'`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (descriptor?.enumerable !== true || !('value' in descriptor)) {
      throw new ParsedTopologyError(
        'INVALID_OPTIONS',
        `Topology option '${key}' must be an enumerable data property`
      );
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as ParsedTopologyOptions;
}

function boundedPositiveSafeInteger(
  value: number | undefined,
  fallback: number,
  hardMaximum: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new ParsedTopologyError('INVALID_OPTIONS', `${label} must be a positive safe integer`);
  }
  if (resolved > hardMaximum) {
    throw new ParsedTopologyError(
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
    throw new ParsedTopologyError(
      'INVALID_OPTIONS',
      `${label} must contain index 0 and be backed by SharedArrayBuffer`
    );
  }
}

/** Independent exact-combinatorial topology over the parsed artifact triangle soup. */
export function assessParsedArtifactTopology(
  artifact: ParsedBinaryStlArtifact,
  untrustedOptions: ParsedTopologyOptions = {}
): ParsedArtifactTopology {
  const options = snapshotOptions(untrustedOptions);
  const maxUniqueVertices = boundedPositiveSafeInteger(
    options.maxUniqueVertices,
    DEFAULT_TOPOLOGY_MAX_UNIQUE_VERTICES,
    HARD_TOPOLOGY_MAX_UNIQUE_VERTICES,
    'maxUniqueVertices'
  );
  const maxEdgeRecordBytes = boundedPositiveSafeInteger(
    options.maxEdgeRecordBytes,
    DEFAULT_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
    HARD_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
    'maxEdgeRecordBytes'
  );
  const maxTriangleVertexBytes = boundedPositiveSafeInteger(
    options.maxTriangleVertexBytes,
    DEFAULT_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
    HARD_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
    'maxTriangleVertexBytes'
  );
  const maxLinkUnionBytes = boundedPositiveSafeInteger(
    options.maxLinkUnionBytes,
    DEFAULT_TOPOLOGY_MAX_LINK_UNION_BYTES,
    HARD_TOPOLOGY_MAX_LINK_UNION_BYTES,
    'maxLinkUnionBytes'
  );
  const maxWorkUnits = boundedPositiveSafeInteger(
    options.maxWorkUnits,
    DEFAULT_TOPOLOGY_MAX_WORK_UNITS,
    HARD_TOPOLOGY_MAX_WORK_UNITS,
    'maxWorkUnits'
  );
  const requestedDeadline = options.deadlineEpochMilliseconds;
  if (
    requestedDeadline !== undefined &&
    (!Number.isSafeInteger(requestedDeadline) || !Number.isFinite(requestedDeadline))
  ) {
    throw new ParsedTopologyError(
      'INVALID_OPTIONS',
      'deadlineEpochMilliseconds must be a finite safe integer'
    );
  }
  const deadlineEpochMilliseconds = Math.min(
    requestedDeadline ?? Number.MAX_SAFE_INTEGER,
    Date.now() + HARD_TOPOLOGY_MAX_ELAPSED_MILLISECONDS
  );
  validateAtomicCounter(options.cancellationFlag, 'cancellationFlag');
  validateAtomicCounter(options.progressCounter, 'progressCounter');
  const checkResources = (): void => {
    if (options.cancellationFlag && Atomics.load(options.cancellationFlag, 0) !== 0) {
      throw new ParsedTopologyError('CANCELLED', 'Parsed topology assessment was cancelled');
    }
    if (Date.now() > deadlineEpochMilliseconds) {
      throw new ParsedTopologyError(
        'RESOURCE_LIMIT',
        'Parsed topology assessment exceeded its hard elapsed-time deadline'
      );
    }
  };
  let workUnitCount = 0;
  const chargeWork = (amount = 1): void => {
    workUnitCount += amount;
    if (workUnitCount > maxWorkUnits) {
      throw new ParsedTopologyError(
        'RESOURCE_LIMIT',
        `Parsed topology assessment exceeded maxWorkUnits=${maxWorkUnits}`
      );
    }
    if ((workUnitCount & 4095) === 0) checkResources();
  };
  checkResources();

  const maximumCornerCount = artifact.triangleCount * 3;
  const triangleVertexBytes = maximumCornerCount * Uint32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(triangleVertexBytes) || triangleVertexBytes > maxTriangleVertexBytes) {
    throw new ParsedTopologyError(
      'RESOURCE_LIMIT',
      `Parsed topology needs ${triangleVertexBytes} triangle-vertex bytes`
    );
  }

  let triangleVertexIds: Uint32Array;
  try {
    triangleVertexIds = new Uint32Array(maximumCornerCount);
  } catch {
    throw new ParsedTopologyError('RESOURCE_LIMIT', 'Could not allocate triangle-vertex storage');
  }

  const initialVertexCapacity = Math.min(
    maxUniqueVertices,
    Math.max(16, Math.min(262_144, artifact.triangleCount))
  );
  let interner: ExactVertexInterner;
  try {
    interner = new ExactVertexInterner(maxUniqueVertices, initialVertexCapacity);
  } catch (error) {
    if (error instanceof ParsedTopologyError) throw error;
    throw new ParsedTopologyError('RESOURCE_LIMIT', 'Could not allocate exact vertex storage');
  }
  const f32 = new Float32Array(1);
  const bits = new Uint32Array(f32.buffer);
  const vertexBits = new Uint32Array(9);
  const vertexIds = new Uint32Array(3);
  const coordinateBits = (value: number): number => {
    f32[0] = value === 0 ? 0 : value;
    return bits[0];
  };

  let validTriangleCount = 0;
  let degenerateTriangleCount = 0;
  let signedSixVolumeMm3 = 0;
  let absoluteVolumeTermSumMm3 = 0;
  let minimumDoubleAreaMm2 = Number.POSITIVE_INFINITY;

  artifact.forEachTriangle((triangle, triangleIndex) => {
    chargeWork();
    if ((triangleIndex & 0xfff) === 0) {
      checkResources();
      if (options.progressCounter) Atomics.store(options.progressCounter, 0, triangleIndex);
    }

    for (let corner = 0; corner < 3; corner += 1) {
      const offset = corner * 3;
      vertexBits[offset] = coordinateBits(triangle[offset]);
      vertexBits[offset + 1] = coordinateBits(triangle[offset + 1]);
      vertexBits[offset + 2] = coordinateBits(triangle[offset + 2]);
    }

    const abx = triangle[3] - triangle[0];
    const aby = triangle[4] - triangle[1];
    const abz = triangle[5] - triangle[2];
    const acx = triangle[6] - triangle[0];
    const acy = triangle[7] - triangle[1];
    const acz = triangle[8] - triangle[2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const doubleAreaMm2 = Math.hypot(crossX, crossY, crossZ);
    const isDegenerate = exactTriangleIsDegenerate(triangle);
    minimumDoubleAreaMm2 = Math.min(minimumDoubleAreaMm2, isDegenerate ? 0 : doubleAreaMm2);

    if (isDegenerate) {
      degenerateTriangleCount += 1;
      return;
    }

    vertexIds[0] = interner.intern(vertexBits[0], vertexBits[1], vertexBits[2]);
    vertexIds[1] = interner.intern(vertexBits[3], vertexBits[4], vertexBits[5]);
    vertexIds[2] = interner.intern(vertexBits[6], vertexBits[7], vertexBits[8]);
    const triangleOffset = validTriangleCount * 3;
    triangleVertexIds[triangleOffset] = vertexIds[0];
    triangleVertexIds[triangleOffset + 1] = vertexIds[1];
    triangleVertexIds[triangleOffset + 2] = vertexIds[2];
    validTriangleCount += 1;
    interner.union(vertexIds[0], vertexIds[1]);
    interner.union(vertexIds[1], vertexIds[2]);
    const volumeTerm0 = triangle[0] * triangle[4] * triangle[8];
    const volumeTerm1 = -(triangle[0] * triangle[5] * triangle[7]);
    const volumeTerm2 = -(triangle[1] * triangle[3] * triangle[8]);
    const volumeTerm3 = triangle[1] * triangle[5] * triangle[6];
    const volumeTerm4 = triangle[2] * triangle[3] * triangle[7];
    const volumeTerm5 = -(triangle[2] * triangle[4] * triangle[6]);
    signedSixVolumeMm3 += volumeTerm0;
    signedSixVolumeMm3 += volumeTerm1;
    signedSixVolumeMm3 += volumeTerm2;
    signedSixVolumeMm3 += volumeTerm3;
    signedSixVolumeMm3 += volumeTerm4;
    signedSixVolumeMm3 += volumeTerm5;
    absoluteVolumeTermSumMm3 += Math.abs(volumeTerm0);
    absoluteVolumeTermSumMm3 += Math.abs(volumeTerm1);
    absoluteVolumeTermSumMm3 += Math.abs(volumeTerm2);
    absoluteVolumeTermSumMm3 += Math.abs(volumeTerm3);
    absoluteVolumeTermSumMm3 += Math.abs(volumeTerm4);
    absoluteVolumeTermSumMm3 += Math.abs(volumeTerm5);
  });
  if (options.progressCounter) Atomics.store(options.progressCounter, 0, artifact.triangleCount);

  const cornerCount = validTriangleCount * 3;
  const edgeRecordBytes = cornerCount * BigUint64Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(edgeRecordBytes) || edgeRecordBytes > maxEdgeRecordBytes) {
    throw new ParsedTopologyError(
      'RESOURCE_LIMIT',
      `Parsed topology needs ${edgeRecordBytes} edge-record bytes`
    );
  }
  const linkUnionBytes =
    cornerCount * (Uint32Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT) +
    interner.size * (Uint32Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT);
  if (!Number.isSafeInteger(linkUnionBytes) || linkUnionBytes > maxLinkUnionBytes) {
    throw new ParsedTopologyError(
      'RESOURCE_LIMIT',
      `Parsed topology needs ${linkUnionBytes} vertex-link bytes`
    );
  }

  const vertexBitWidth = requiredUnsignedBits(interner.size);
  const occurrenceBitWidth = requiredUnsignedBits(cornerCount);
  if (vertexBitWidth * 2 + occurrenceBitWidth > 64) {
    throw new ParsedTopologyError(
      'RESOURCE_LIMIT',
      'Exact edge/corner records exceed the 64-bit sortable key domain'
    );
  }

  let edgeRecords: BigUint64Array;
  try {
    edgeRecords = new BigUint64Array(cornerCount);
  } catch {
    throw new ParsedTopologyError('RESOURCE_LIMIT', 'Could not allocate parsed edge records');
  }
  const occurrenceShift = BigInt(occurrenceBitWidth);
  const vertexShift = BigInt(vertexBitWidth + occurrenceBitWidth);
  const occurrenceMask = (1n << occurrenceShift) - 1n;
  for (let occurrence = 0; occurrence < cornerCount; occurrence += 1) {
    chargeWork();
    const edge = occurrence % 3;
    const triangleOffset = occurrence - edge;
    const nextCorner = triangleOffset + ((edge + 1) % 3);
    const a = triangleVertexIds[occurrence];
    const b = triangleVertexIds[nextCorner];
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    edgeRecords[occurrence] =
      (BigInt(lo) << vertexShift) | (BigInt(hi) << occurrenceShift) | BigInt(occurrence);
  }
  edgeRecords.sort((left, right) => {
    chargeWork();
    return left < right ? -1 : left > right ? 1 : 0;
  });
  checkResources();

  chargeWork(cornerCount);
  const linkUnion = new LinkUnionFind(cornerCount);
  let uniqueEdgeCount = 0;
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let orientationMismatches = 0;
  let cursor = 0;
  while (cursor < edgeRecords.length) {
    chargeWork();
    if ((cursor & 0x3ffff) === 0) checkResources();
    const key = edgeRecords[cursor] >> occurrenceShift;
    let end = cursor;
    let reverseCount = 0;
    let firstLoCorner = -1;
    let firstHiCorner = -1;
    while (end < edgeRecords.length && edgeRecords[end] >> occurrenceShift === key) {
      chargeWork();
      const occurrence = Number(edgeRecords[end] & occurrenceMask);
      const edge = occurrence % 3;
      const triangleOffset = occurrence - edge;
      const nextCorner = triangleOffset + ((edge + 1) % 3);
      const a = triangleVertexIds[occurrence];
      const b = triangleVertexIds[nextCorner];
      const lo = Math.min(a, b);
      const loCorner = a === lo ? occurrence : nextCorner;
      const hiCorner = a === lo ? nextCorner : occurrence;
      reverseCount += a === lo ? 0 : 1;
      if (firstLoCorner < 0) {
        firstLoCorner = loCorner;
        firstHiCorner = hiCorner;
      } else {
        linkUnion.union(firstLoCorner, loCorner);
        linkUnion.union(firstHiCorner, hiCorner);
      }
      end += 1;
    }
    const uses = end - cursor;
    uniqueEdgeCount += 1;
    if (uses === 1) boundaryEdges += 1;
    else if (uses > 2) nonManifoldEdges += 1;
    else if (reverseCount !== 1) orientationMismatches += 1;
    cursor = end;
  }

  let vertexLinkRoots: Uint32Array;
  let nonManifoldVertexFlags: Uint8Array;
  try {
    vertexLinkRoots = new Uint32Array(interner.size);
    vertexLinkRoots.fill(0xffff_ffff);
    nonManifoldVertexFlags = new Uint8Array(interner.size);
  } catch {
    throw new ParsedTopologyError('RESOURCE_LIMIT', 'Could not allocate vertex-link audit storage');
  }
  let nonManifoldVertices = 0;
  for (let corner = 0; corner < cornerCount; corner += 1) {
    chargeWork();
    const vertex = triangleVertexIds[corner];
    const root = linkUnion.find(corner);
    const previousRoot = vertexLinkRoots[vertex];
    if (previousRoot === 0xffff_ffff) vertexLinkRoots[vertex] = root;
    else if (previousRoot !== root && nonManifoldVertexFlags[vertex] === 0) {
      nonManifoldVertexFlags[vertex] = 1;
      nonManifoldVertices += 1;
    }
  }

  chargeWork(interner.size);
  const componentCount = interner.componentCount();
  const eulerCharacteristic = interner.size - uniqueEdgeCount + validTriangleCount;
  const genusNumerator = 2 * componentCount - eulerCharacteristic;
  const hasValidSurface = validTriangleCount > 0;
  const closed = hasValidSurface && boundaryEdges === 0 && nonManifoldEdges === 0;
  const manifold =
    hasValidSurface &&
    degenerateTriangleCount === 0 &&
    nonManifoldEdges === 0 &&
    nonManifoldVertices === 0;
  const consistentlyOriented = hasValidSurface && manifold && orientationMismatches === 0;
  const signedSixVolumeErrorBoundMm3 = boundSignedSixVolumeError(
    absoluteVolumeTermSumMm3,
    validTriangleCount * 6
  );
  const volumeSign =
    signedSixVolumeMm3 > signedSixVolumeErrorBoundMm3
      ? 'positive-proven'
      : signedSixVolumeMm3 < -signedSixVolumeErrorBoundMm3
        ? 'negative-proven'
        : 'indeterminate';
  const signedVolumeMm3 = signedSixVolumeMm3 / 6;
  const signedVolumeErrorBoundMm3 =
    signedSixVolumeErrorBoundMm3 === 0 ? 0 : nextUpNonNegative(signedSixVolumeErrorBoundMm3 / 6);
  const genus =
    closed &&
    manifold &&
    consistentlyOriented &&
    genusNumerator >= 0 &&
    Number.isSafeInteger(genusNumerator) &&
    genusNumerator % 2 === 0
      ? genusNumerator / 2
      : null;
  const outwardFacing =
    closed &&
    manifold &&
    consistentlyOriented &&
    componentCount === 1 &&
    volumeSign === 'positive-proven';
  checkResources();
  const evidenceSha256 = sha256Utf8(
    JSON.stringify([
      PARSED_TOPOLOGY_PROOF_VERSION,
      PARSED_TOPOLOGY_PROOF_SHA256,
      artifact.byteSha256,
      artifact.parsedArtifactSha256,
      artifact.parsedTriangleSetSha256,
      artifact.triangleCount,
      validTriangleCount,
      interner.size,
      uniqueEdgeCount,
      componentCount,
      eulerCharacteristic,
      genus,
      boundaryEdges,
      nonManifoldEdges,
      nonManifoldVertices,
      orientationMismatches,
      degenerateTriangleCount,
      closed,
      manifold,
      consistentlyOriented,
      outwardFacing,
      volumeSign,
      signedVolumeMm3,
      signedVolumeErrorBoundMm3,
      minimumDoubleAreaMm2,
      workUnitCount,
    ])
  );

  return Object.freeze({
    proofVersion: PARSED_TOPOLOGY_PROOF_VERSION,
    proofMethodSha256: PARSED_TOPOLOGY_PROOF_SHA256,
    evidenceSha256,
    artifactByteSha256: artifact.byteSha256,
    parsedArtifactSha256: artifact.parsedArtifactSha256,
    parsedTriangleSetSha256: artifact.parsedTriangleSetSha256,
    triangleCount: artifact.triangleCount,
    validTriangleCount,
    uniqueVertexCount: interner.size,
    uniqueEdgeCount,
    componentCount,
    eulerCharacteristic,
    genus,
    boundaryEdges,
    nonManifoldEdges,
    nonManifoldVertices,
    orientationMismatches,
    degenerateTriangleCount,
    closed,
    manifold,
    consistentlyOriented,
    outwardFacing,
    volumeSign,
    signedVolumeMm3,
    signedVolumeErrorBoundMm3,
    minimumDoubleAreaMm2,
    workUnitCount,
  });
}
