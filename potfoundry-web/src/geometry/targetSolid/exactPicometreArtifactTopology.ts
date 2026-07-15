import { sha256Utf8 } from './incrementalSha256';

export const EXACT_PICOMETRE_TOPOLOGY_PROOF_VERSION =
  'potfoundry.parsed-topology-exact-int64-picometre/v2' as const;
export const EXACT_PICOMETRE_TOPOLOGY_PROOF_SHA256 = sha256Utf8(
  [
    EXACT_PICOMETRE_TOPOLOGY_PROOF_VERSION,
    'vertex identity = exact signed int64 xyz picometres',
    'triangle stream must visit every declared triangle exactly once in source order',
    'degeneracy = exact zero bigint cross product',
    'undirected edge key = ordered canonical vertex ids; occurrence = triangle corner id',
    'closed iff every nondegenerate edge has exactly two uses',
    'consistent orientation iff each two-use edge has one use per direction',
    'vertex 2-manifold iff incident triangle corners form one edge-adjacent link component',
    'components = union of vertices connected by nondegenerate triangles',
    'Euler characteristic = V - E + F over the nondegenerate triangle complex',
    'volume sign = exact bigint sum of signed six-volume determinants in pm^3',
    'resource and atomic-control options are snapshotted from a plain own-data-property record',
    'every byte/work/deadline option has a non-raiseable hard ceiling',
  ].join('\n')
);

export const DEFAULT_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES = 500_000;
export const DEFAULT_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES = 96 * 1024 * 1024;
export const DEFAULT_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES = 32 * 1024 * 1024;
export const DEFAULT_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES = 32 * 1024 * 1024;
export const DEFAULT_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS = 20_000_000;
export const HARD_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES = 500_000;
export const HARD_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES = 128 * 1024 * 1024;
export const HARD_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES = 64 * 1024 * 1024;
export const HARD_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES = 64 * 1024 * 1024;
export const HARD_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS = 50_000_000;
export const HARD_EXACT_PM_TOPOLOGY_MAX_ELAPSED_MILLISECONDS = 30_000;

export type ExactPicometreTopologyErrorCode =
  | 'INVALID_ARTIFACT'
  | 'INVALID_OPTIONS'
  | 'RESOURCE_LIMIT'
  | 'CANCELLED';

export class ExactPicometreTopologyError extends Error {
  readonly code: ExactPicometreTopologyErrorCode;

  constructor(code: ExactPicometreTopologyErrorCode, message: string) {
    super(message);
    this.name = 'ExactPicometreTopologyError';
    this.code = code;
  }
}

export interface ExactPicometreTriangleArtifact {
  readonly byteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly triangleCount: number;
  readonly forEachTrianglePicometres: (
    visitor: (triangle: BigInt64Array, triangleIndex: number) => void
  ) => void;
}

export interface ExactPicometreTopologyOptions {
  readonly maxUniqueVertices?: number;
  readonly maxEdgeRecordBytes?: number;
  readonly maxTriangleVertexBytes?: number;
  readonly maxLinkUnionBytes?: number;
  readonly maxWorkUnits?: number;
  readonly deadlineEpochMilliseconds?: number;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export interface ExactPicometreArtifactTopology {
  readonly proofVersion: typeof EXACT_PICOMETRE_TOPOLOGY_PROOF_VERSION;
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
  readonly volumeSign: 'positive-exact' | 'negative-exact' | 'zero-exact';
  readonly signedSixVolumePm3: string;
  readonly signedVolumeMm3: number;
  readonly minimumDoubleAreaMm2: number;
  readonly workUnitCount: number;
}

interface OptionSnapshot {
  readonly maxUniqueVertices?: number;
  readonly maxEdgeRecordBytes?: number;
  readonly maxTriangleVertexBytes?: number;
  readonly maxLinkUnionBytes?: number;
  readonly maxWorkUnits?: number;
  readonly deadlineEpochMilliseconds?: number;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

const OPTION_NAMES = Object.freeze([
  'maxUniqueVertices',
  'maxEdgeRecordBytes',
  'maxTriangleVertexBytes',
  'maxLinkUnionBytes',
  'maxWorkUnits',
  'deadlineEpochMilliseconds',
  'cancellationFlag',
  'progressCounter',
] as const);
const OPTION_NAME_SET = new Set<string>(OPTION_NAMES);
const SHA256_RE = /^[0-9a-f]{64}$/;

function fail(
  code: ExactPicometreTopologyErrorCode,
  message: string
): never {
  throw new ExactPicometreTopologyError(code, message);
}

function snapshotOptions(options: ExactPicometreTopologyOptions): OptionSnapshot {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    fail('INVALID_OPTIONS', 'Topology options must be a plain own-data-property record');
  }
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(options);
    descriptors = Object.getOwnPropertyDescriptors(options) as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    fail('INVALID_OPTIONS', 'Topology options could not be inspected safely');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_OPTIONS', 'Topology options must have Object or null prototype');
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !OPTION_NAME_SET.has(key)) {
      fail('INVALID_OPTIONS', `Unknown topology option '${String(key)}'`);
    }
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) {
      fail('INVALID_OPTIONS', `Topology option '${key}' must be a data property`);
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
    fail('CANCELLED', 'Exact picometre topology assessment was cancelled');
  }
  if (
    deadlineEpochMilliseconds !== undefined &&
    Date.now() > deadlineEpochMilliseconds
  ) {
    fail(
      'RESOURCE_LIMIT',
      'Exact picometre topology assessment exceeded its hard elapsed-time deadline'
    );
  }
}

function validateArtifact(artifact: ExactPicometreTriangleArtifact): void {
  if (
    typeof artifact !== 'object' ||
    artifact === null ||
    !SHA256_RE.test(artifact.byteSha256) ||
    !SHA256_RE.test(artifact.parsedArtifactSha256) ||
    !SHA256_RE.test(artifact.parsedTriangleSetSha256) ||
    !Number.isSafeInteger(artifact.triangleCount) ||
    artifact.triangleCount <= 0 ||
    typeof artifact.forEachTrianglePicometres !== 'function'
  ) {
    fail('INVALID_ARTIFACT', 'Exact picometre triangle artifact is malformed');
  }
}

function nextPowerOfTwo(value: number): number {
  let result = 16;
  while (result < value) result *= 2;
  return result;
}

function mixInt64Coordinates(x: bigint, y: bigint, z: bigint): number {
  const ux = BigInt.asUintN(64, x);
  const uy = BigInt.asUintN(64, y);
  const uz = BigInt.asUintN(64, z);
  const xLo = Number(ux & 0xffff_ffffn);
  const xHi = Number(ux >> 32n);
  const yLo = Number(uy & 0xffff_ffffn);
  const yHi = Number(uy >> 32n);
  const zLo = Number(uz & 0xffff_ffffn);
  const zHi = Number(uz >> 32n);
  let hash = Math.imul(xLo ^ yHi, 0x9e37_79b1);
  hash ^= Math.imul(yLo ^ zHi, 0x85eb_ca6b);
  hash ^= Math.imul(zLo ^ xHi, 0xc2b2_ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

class ExactInt64VertexInterner {
  private x: BigInt64Array;
  private y: BigInt64Array;
  private z: BigInt64Array;
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
    this.x = new BigInt64Array(capacity);
    this.y = new BigInt64Array(capacity);
    this.z = new BigInt64Array(capacity);
    this.idsPlusOne = new Uint32Array(capacity);
    this.mask = capacity - 1;
    const unionCapacity = Math.min(Math.max(16, initialCapacity), maxUniqueVertices);
    this.parent = new Uint32Array(unionCapacity);
    this.rank = new Uint8Array(unionCapacity);
  }

  get size(): number {
    return this.count;
  }

  intern(x: bigint, y: bigint, z: bigint): number {
    if ((this.count + 1) * 10 >= this.idsPlusOne.length * 7) this.growTable();
    let slot = mixInt64Coordinates(x, y, z) & this.mask;
    while (this.idsPlusOne[slot] !== 0) {
      if (this.x[slot] === x && this.y[slot] === y && this.z[slot] === z) {
        return this.idsPlusOne[slot] - 1;
      }
      slot = (slot + 1) & this.mask;
    }
    if (this.count >= this.maxUniqueVertices) {
      fail('RESOURCE_LIMIT', `Artifact exceeds ${this.maxUniqueVertices} unique vertices`);
    }
    const id = this.count;
    this.count += 1;
    this.ensureUnionCapacity(this.count);
    this.parent[id] = id;
    this.x[slot] = x;
    this.y[slot] = y;
    this.z[slot] = z;
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
      fail('RESOURCE_LIMIT', 'Exact picometre vertex hash table is exhausted');
    }
    const newCapacity = Math.min(oldCapacity * 2, maximumCapacity);
    let nextX: BigInt64Array;
    let nextY: BigInt64Array;
    let nextZ: BigInt64Array;
    let nextIds: Uint32Array;
    try {
      nextX = new BigInt64Array(newCapacity);
      nextY = new BigInt64Array(newCapacity);
      nextZ = new BigInt64Array(newCapacity);
      nextIds = new Uint32Array(newCapacity);
    } catch {
      fail('RESOURCE_LIMIT', 'Could not grow exact picometre vertex hash table');
    }
    const nextMask = newCapacity - 1;
    for (let slot = 0; slot < oldCapacity; slot += 1) {
      const idPlusOne = this.idsPlusOne[slot];
      if (idPlusOne === 0) continue;
      const x = this.x[slot];
      const y = this.y[slot];
      const z = this.z[slot];
      let nextSlot = mixInt64Coordinates(x, y, z) & nextMask;
      while (nextIds[nextSlot] !== 0) nextSlot = (nextSlot + 1) & nextMask;
      nextX[nextSlot] = x;
      nextY[nextSlot] = y;
      nextZ[nextSlot] = z;
      nextIds[nextSlot] = idPlusOne;
    }
    this.x = nextX;
    this.y = nextY;
    this.z = nextZ;
    this.idsPlusOne = nextIds;
    this.mask = nextMask;
  }

  private ensureUnionCapacity(required: number): void {
    if (required <= this.parent.length) return;
    const nextLength = Math.min(
      this.maxUniqueVertices,
      Math.max(required, this.parent.length * 2)
    );
    try {
      const nextParent = new Uint32Array(nextLength);
      nextParent.set(this.parent);
      this.parent = nextParent;
      const nextRank = new Uint8Array(nextLength);
      nextRank.set(this.rank);
      this.rank = nextRank;
    } catch {
      fail('RESOURCE_LIMIT', 'Could not grow exact picometre component storage');
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
      fail('RESOURCE_LIMIT', 'Could not allocate exact picometre vertex-link storage');
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

function exactCross(triangle: BigInt64Array): readonly [bigint, bigint, bigint] {
  const abx = triangle[3] - triangle[0];
  const aby = triangle[4] - triangle[1];
  const abz = triangle[5] - triangle[2];
  const acx = triangle[6] - triangle[0];
  const acy = triangle[7] - triangle[1];
  const acz = triangle[8] - triangle[2];
  return [
    aby * acz - abz * acy,
    abz * acx - abx * acz,
    abx * acy - aby * acx,
  ];
}

function signedSixVolumePm3(triangle: BigInt64Array): bigint {
  return (
    triangle[0] * triangle[4] * triangle[8] -
    triangle[0] * triangle[5] * triangle[7] -
    triangle[1] * triangle[3] * triangle[8] +
    triangle[1] * triangle[5] * triangle[6] +
    triangle[2] * triangle[3] * triangle[7] -
    triangle[2] * triangle[4] * triangle[6]
  );
}

/** Exact combinatorial topology over a final artifact's integer-picometre triangles. */
export function assessExactPicometreArtifactTopology(
  artifact: ExactPicometreTriangleArtifact,
  options: ExactPicometreTopologyOptions = {}
): ExactPicometreArtifactTopology {
  validateArtifact(artifact);
  const optionSnapshot = snapshotOptions(options);
  const maxUniqueVertices = boundedPositiveSafeInteger(
    optionSnapshot.maxUniqueVertices,
    DEFAULT_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES,
    HARD_EXACT_PM_TOPOLOGY_MAX_UNIQUE_VERTICES,
    'maxUniqueVertices'
  );
  const maxEdgeRecordBytes = boundedPositiveSafeInteger(
    optionSnapshot.maxEdgeRecordBytes,
    DEFAULT_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
    HARD_EXACT_PM_TOPOLOGY_MAX_EDGE_RECORD_BYTES,
    'maxEdgeRecordBytes'
  );
  const maxTriangleVertexBytes = boundedPositiveSafeInteger(
    optionSnapshot.maxTriangleVertexBytes,
    DEFAULT_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
    HARD_EXACT_PM_TOPOLOGY_MAX_TRIANGLE_VERTEX_BYTES,
    'maxTriangleVertexBytes'
  );
  const maxLinkUnionBytes = boundedPositiveSafeInteger(
    optionSnapshot.maxLinkUnionBytes,
    DEFAULT_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES,
    HARD_EXACT_PM_TOPOLOGY_MAX_LINK_UNION_BYTES,
    'maxLinkUnionBytes'
  );
  const maxWorkUnits = boundedPositiveSafeInteger(
    optionSnapshot.maxWorkUnits,
    DEFAULT_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS,
    HARD_EXACT_PM_TOPOLOGY_MAX_WORK_UNITS,
    'maxWorkUnits'
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
    Date.now() + HARD_EXACT_PM_TOPOLOGY_MAX_ELAPSED_MILLISECONDS
  );
  const cancellationFlag = optionSnapshot.cancellationFlag;
  const progressCounter = optionSnapshot.progressCounter;
  validateCounter(cancellationFlag, 'cancellationFlag');
  validateCounter(progressCounter, 'progressCounter');
  if (progressCounter) Atomics.store(progressCounter, 0, 0);
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  let workUnitCount = 0;
  const chargeWork = (amount = 1): void => {
    workUnitCount += amount;
    if (workUnitCount > maxWorkUnits) {
      fail(
        'RESOURCE_LIMIT',
        `Exact picometre topology assessment exceeded maxWorkUnits=${maxWorkUnits}`
      );
    }
    if ((workUnitCount & 4095) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
    }
  };

  const maximumCornerCount = artifact.triangleCount * 3;
  const triangleVertexBytes = maximumCornerCount * Uint32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(triangleVertexBytes) || triangleVertexBytes > maxTriangleVertexBytes) {
    fail('RESOURCE_LIMIT', `Topology needs ${triangleVertexBytes} triangle-vertex bytes`);
  }
  let triangleVertexIds: Uint32Array;
  try {
    triangleVertexIds = new Uint32Array(maximumCornerCount);
  } catch {
    fail('RESOURCE_LIMIT', 'Could not allocate exact picometre triangle-vertex storage');
  }
  const initialVertexCapacity = Math.min(
    maxUniqueVertices,
    Math.max(16, Math.min(262_144, artifact.triangleCount))
  );
  let interner: ExactInt64VertexInterner;
  try {
    interner = new ExactInt64VertexInterner(maxUniqueVertices, initialVertexCapacity);
  } catch (error) {
    if (error instanceof ExactPicometreTopologyError) throw error;
    fail('RESOURCE_LIMIT', 'Could not allocate exact picometre vertex storage');
  }

  const vertexIds = new Uint32Array(3);
  let visitedTriangleCount = 0;
  let validTriangleCount = 0;
  let degenerateTriangleCount = 0;
  let exactSignedSixVolume = 0n;
  let minimumDoubleAreaMm2 = Number.POSITIVE_INFINITY;
  artifact.forEachTrianglePicometres((triangle, triangleIndex) => {
    chargeWork();
    if (
      !(triangle instanceof BigInt64Array) ||
      triangle.length < 9 ||
      triangleIndex !== visitedTriangleCount ||
      triangleIndex >= artifact.triangleCount
    ) {
      fail('INVALID_ARTIFACT', 'Artifact triangle stream is not exact and sequential');
    }
    visitedTriangleCount += 1;
    if ((triangleIndex & 0xfff) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
      if (progressCounter) Atomics.store(progressCounter, 0, triangleIndex);
    }
    const [crossX, crossY, crossZ] = exactCross(triangle);
    const degenerate = crossX === 0n && crossY === 0n && crossZ === 0n;
    const doubleAreaMm2 = degenerate
      ? 0
      : Math.hypot(Number(crossX), Number(crossY), Number(crossZ)) / 1e18;
    minimumDoubleAreaMm2 = Math.min(minimumDoubleAreaMm2, doubleAreaMm2);
    if (degenerate) {
      degenerateTriangleCount += 1;
      return;
    }
    for (let corner = 0; corner < 3; corner += 1) {
      const offset = corner * 3;
      vertexIds[corner] = interner.intern(
        triangle[offset],
        triangle[offset + 1],
        triangle[offset + 2]
      );
    }
    const triangleOffset = validTriangleCount * 3;
    triangleVertexIds[triangleOffset] = vertexIds[0];
    triangleVertexIds[triangleOffset + 1] = vertexIds[1];
    triangleVertexIds[triangleOffset + 2] = vertexIds[2];
    validTriangleCount += 1;
    interner.union(vertexIds[0], vertexIds[1]);
    interner.union(vertexIds[1], vertexIds[2]);
    exactSignedSixVolume += signedSixVolumePm3(triangle);
  });
  if (visitedTriangleCount !== artifact.triangleCount) {
    fail('INVALID_ARTIFACT', 'Artifact triangle stream ended before its declared triangle count');
  }
  if (progressCounter) Atomics.store(progressCounter, 0, artifact.triangleCount);

  const cornerCount = validTriangleCount * 3;
  const edgeRecordBytes = cornerCount * BigUint64Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(edgeRecordBytes) || edgeRecordBytes > maxEdgeRecordBytes) {
    fail('RESOURCE_LIMIT', `Topology needs ${edgeRecordBytes} edge-record bytes`);
  }
  const linkUnionBytes =
    cornerCount * (Uint32Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT) +
    interner.size * (Uint32Array.BYTES_PER_ELEMENT + Uint8Array.BYTES_PER_ELEMENT);
  if (!Number.isSafeInteger(linkUnionBytes) || linkUnionBytes > maxLinkUnionBytes) {
    fail('RESOURCE_LIMIT', `Topology needs ${linkUnionBytes} vertex-link bytes`);
  }
  const vertexBitWidth = requiredUnsignedBits(interner.size);
  const occurrenceBitWidth = requiredUnsignedBits(cornerCount);
  if (vertexBitWidth * 2 + occurrenceBitWidth > 64) {
    fail('RESOURCE_LIMIT', 'Exact edge/corner records exceed the sortable uint64 key domain');
  }

  let edgeRecords: BigUint64Array;
  try {
    edgeRecords = new BigUint64Array(cornerCount);
  } catch {
    fail('RESOURCE_LIMIT', 'Could not allocate exact picometre edge records');
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
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);

  chargeWork(cornerCount);
  const linkUnion = new LinkUnionFind(cornerCount);
  let uniqueEdgeCount = 0;
  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  let orientationMismatches = 0;
  let cursor = 0;
  while (cursor < edgeRecords.length) {
    chargeWork();
    if ((cursor & 0x3ffff) === 0) {
      checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
      if (progressCounter) Atomics.store(progressCounter, 0, artifact.triangleCount + cursor);
    }
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
    fail('RESOURCE_LIMIT', 'Could not allocate exact picometre vertex-link audit storage');
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
  const volumeSign =
    exactSignedSixVolume > 0n
      ? 'positive-exact'
      : exactSignedSixVolume < 0n
        ? 'negative-exact'
        : 'zero-exact';
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
    volumeSign === 'positive-exact';
  const signedVolumeMm3 = Number(exactSignedSixVolume) / 6e27;
  checkCancelled(cancellationFlag, deadlineEpochMilliseconds);
  const evidenceSha256 = sha256Utf8(
    JSON.stringify([
      EXACT_PICOMETRE_TOPOLOGY_PROOF_VERSION,
      EXACT_PICOMETRE_TOPOLOGY_PROOF_SHA256,
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
      exactSignedSixVolume.toString(),
      signedVolumeMm3,
      minimumDoubleAreaMm2,
      workUnitCount,
    ])
  );
  if (progressCounter) Atomics.store(progressCounter, 0, artifact.triangleCount + cornerCount);

  return Object.freeze({
    proofVersion: EXACT_PICOMETRE_TOPOLOGY_PROOF_VERSION,
    proofMethodSha256: EXACT_PICOMETRE_TOPOLOGY_PROOF_SHA256,
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
    signedSixVolumePm3: exactSignedSixVolume.toString(),
    signedVolumeMm3,
    minimumDoubleAreaMm2,
    workUnitCount,
  });
}
