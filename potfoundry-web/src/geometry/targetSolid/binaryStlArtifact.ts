import { IncrementalSha256, sha256Utf8 } from './incrementalSha256';

export const BINARY_STL_PARSER_VERSION = 'potfoundry.binary-stl-f32-exact/v3' as const;
export const PARSED_ARTIFACT_CANONICAL_VERSION = 'potfoundry.parsed-triangle-artifact/v1' as const;
export const PARSED_TRIANGLE_SET_VERSION = 'potfoundry.parsed-triangle-set/v1' as const;

export const BINARY_STL_PARSER_PROOF_MATERIAL = [
  BINARY_STL_PARSER_VERSION,
  'uint32-le triangle count at byte 80',
  'exact length = 84 + 50 * triangleCount',
  'normal and vertex scalars are finite IEEE-754 binary32 little-endian',
  'triangle vertices retain file order and exact binary32 values',
  'facet-normal telemetry = informational binary64 zero, length-error, dot-sign, and cosine measurements',
  'facet-normal telemetry never supplies a structural or distance-proof verdict',
  'canonical indices are sequential uint32 little-endian',
  'source mutation after parsing cannot mutate the private vertex snapshot',
  'cancellation and progress use shared atomic counters without reentrant callbacks',
].join('\n');

export const BINARY_STL_PARSER_PROOF_SHA256 = sha256Utf8(BINARY_STL_PARSER_PROOF_MATERIAL);

export const DEFAULT_BINARY_STL_MAX_TRIANGLES = 8_000_000;
export const DEFAULT_BINARY_STL_MAX_PARSED_VERTEX_BYTES = 256 * 1024 * 1024;

export type BinaryStlArtifactErrorCode =
  | 'INVALID_SOURCE'
  | 'TRUNCATED_HEADER'
  | 'EMPTY_ARTIFACT'
  | 'LENGTH_MISMATCH'
  | 'RESOURCE_LIMIT'
  | 'NON_FINITE_NORMAL'
  | 'NON_FINITE_VERTEX'
  | 'CANCELLED';

export class BinaryStlArtifactError extends Error {
  readonly code: BinaryStlArtifactErrorCode;
  readonly triangleIndex?: number;

  constructor(code: BinaryStlArtifactErrorCode, message: string, triangleIndex?: number) {
    super(message);
    this.name = 'BinaryStlArtifactError';
    this.code = code;
    this.triangleIndex = triangleIndex;
  }
}

export interface ParseBinaryStlOptions {
  maxTriangles?: number;
  maxParsedVertexBytes?: number;
  /** Nonzero at index 0 requests cancellation without executing untrusted callbacks. */
  cancellationFlag?: Int32Array;
  /** Completed triangle count is stored at index 0. */
  progressCounter?: Int32Array;
}

export interface ParsedBinaryStlArtifact {
  readonly format: 'stl';
  readonly parserMethod: 'binary-stl-f32-exact';
  readonly parserVersion: typeof BINARY_STL_PARSER_VERSION;
  readonly parserProofSha256: string;
  readonly byteLength: number;
  readonly triangleCount: number;
  readonly nonZeroAttributeCount: number;
  readonly zeroFacetNormalCount: number;
  readonly nonPositiveFacetNormalDotCount: number;
  readonly maximumFacetNormalLengthError: number;
  readonly minimumFacetNormalCosine: number | null;
  readonly byteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly bounds: Readonly<{
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
  }>;
  /** Copy one triangle into target[offset..offset+8]; the private snapshot is never exposed. */
  readTriangle(triangleIndex: number, target: Float32Array | Float64Array, offset?: number): void;
  /** Visit every triangle using one reused, callback-scoped Float64Array. */
  forEachTriangle(visitor: (triangle: Float64Array, triangleIndex: number) => void): void;
}

function sourceBytes(source: ArrayBuffer | Uint8Array): Uint8Array {
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (!(source instanceof Uint8Array) || !(source.buffer instanceof ArrayBuffer)) {
    throw new BinaryStlArtifactError(
      'INVALID_SOURCE',
      'Binary STL input must be an ArrayBuffer or a non-shared Uint8Array view'
    );
  }
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

function positiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new BinaryStlArtifactError('RESOURCE_LIMIT', `${label} must be a positive safe integer`);
  }
  return value;
}

function taggedHasher(tag: string): IncrementalSha256 {
  const hasher = new IncrementalSha256();
  hasher.update(new TextEncoder().encode(tag));
  hasher.update(Uint8Array.of(0));
  return hasher;
}

function updateUint32Le(hasher: IncrementalSha256, value: number, scratch: Uint8Array): void {
  scratch[0] = value & 0xff;
  scratch[1] = (value >>> 8) & 0xff;
  scratch[2] = (value >>> 16) & 0xff;
  scratch[3] = (value >>> 24) & 0xff;
  hasher.update(scratch, 0, 4);
}

function validateAtomicCounter(counter: Int32Array | undefined, label: string): void {
  if (!counter) return;
  if (
    counter.length < 1 ||
    typeof SharedArrayBuffer === 'undefined' ||
    !(counter.buffer instanceof SharedArrayBuffer)
  ) {
    throw new BinaryStlArtifactError(
      'INVALID_SOURCE',
      `${label} must contain index 0 and be backed by SharedArrayBuffer`
    );
  }
}

/**
 * Parse and snapshot the exact triangle geometry from final binary-STL bytes.
 * This establishes byte/parsed identity only; it performs no geometric tolerance proof.
 */
export function parseBinaryStlArtifact(
  source: ArrayBuffer | Uint8Array,
  options: ParseBinaryStlOptions = {}
): ParsedBinaryStlArtifact {
  const bytes = sourceBytes(source);
  if (bytes.byteLength < 84) {
    throw new BinaryStlArtifactError('TRUNCATED_HEADER', 'Binary STL is shorter than 84 bytes');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(80, true);
  if (triangleCount === 0) {
    throw new BinaryStlArtifactError('EMPTY_ARTIFACT', 'Binary STL contains no triangles');
  }

  const expectedByteLength = 84 + triangleCount * 50;
  if (!Number.isSafeInteger(expectedByteLength) || expectedByteLength !== bytes.byteLength) {
    throw new BinaryStlArtifactError(
      'LENGTH_MISMATCH',
      `Binary STL length ${bytes.byteLength} does not equal 84 + 50 * ${triangleCount}`
    );
  }

  const maxTriangles = positiveSafeInteger(
    options.maxTriangles ?? DEFAULT_BINARY_STL_MAX_TRIANGLES,
    'maxTriangles'
  );
  const maxParsedVertexBytes = positiveSafeInteger(
    options.maxParsedVertexBytes ?? DEFAULT_BINARY_STL_MAX_PARSED_VERTEX_BYTES,
    'maxParsedVertexBytes'
  );
  const parsedVertexBytes = triangleCount * 9 * Float32Array.BYTES_PER_ELEMENT;
  if (triangleCount > maxTriangles || parsedVertexBytes > maxParsedVertexBytes) {
    throw new BinaryStlArtifactError(
      'RESOURCE_LIMIT',
      `Binary STL requires ${triangleCount} triangles and ${parsedVertexBytes} parsed vertex bytes`
    );
  }
  validateAtomicCounter(options.cancellationFlag, 'cancellationFlag');
  validateAtomicCounter(options.progressCounter, 'progressCounter');
  if (options.cancellationFlag && Atomics.load(options.cancellationFlag, 0) !== 0) {
    throw new BinaryStlArtifactError('CANCELLED', 'Binary STL parsing was cancelled');
  }
  if (options.progressCounter) Atomics.store(options.progressCounter, 0, 0);

  let vertices: Float32Array;
  try {
    vertices = new Float32Array(triangleCount * 9);
  } catch {
    throw new BinaryStlArtifactError(
      'RESOURCE_LIMIT',
      `Could not allocate ${parsedVertexBytes} parsed vertex bytes`
    );
  }

  const byteSha256 = new IncrementalSha256().update(bytes).digestHex();
  const parsedHasher = taggedHasher(
    `${PARSED_ARTIFACT_CANONICAL_VERSION}\n${BINARY_STL_PARSER_VERSION}`
  );
  const triangleSetHasher = taggedHasher(PARSED_TRIANGLE_SET_VERSION);
  const scratch = new Uint8Array(12);
  updateUint32Le(parsedHasher, triangleCount, scratch);
  updateUint32Le(triangleSetHasher, triangleCount, scratch);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let nonZeroAttributeCount = 0;
  let zeroFacetNormalCount = 0;
  let nonPositiveFacetNormalDotCount = 0;
  let maximumFacetNormalLengthError = 0;
  let minimumFacetNormalCosine = Number.POSITIVE_INFINITY;
  let comparableFacetNormalCount = 0;

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    if ((triangleIndex & 0xfff) === 0) {
      if (options.cancellationFlag && Atomics.load(options.cancellationFlag, 0) !== 0) {
        throw new BinaryStlArtifactError(
          'CANCELLED',
          'Binary STL parsing was cancelled',
          triangleIndex
        );
      }
      if (options.progressCounter) Atomics.store(options.progressCounter, 0, triangleIndex);
    }

    const recordOffset = 84 + triangleIndex * 50;
    const normalX = view.getFloat32(recordOffset, true);
    const normalY = view.getFloat32(recordOffset + 4, true);
    const normalZ = view.getFloat32(recordOffset + 8, true);
    if (!Number.isFinite(normalX) || !Number.isFinite(normalY) || !Number.isFinite(normalZ)) {
      throw new BinaryStlArtifactError(
        'NON_FINITE_NORMAL',
        `Triangle ${triangleIndex} contains a non-finite normal`,
        triangleIndex
      );
    }

    const vertexOffset = recordOffset + 12;
    for (let component = 0; component < 9; component += 1) {
      const value = view.getFloat32(vertexOffset + component * 4, true);
      if (!Number.isFinite(value)) {
        throw new BinaryStlArtifactError(
          'NON_FINITE_VERTEX',
          `Triangle ${triangleIndex} contains a non-finite vertex`,
          triangleIndex
        );
      }
      vertices[triangleIndex * 9 + component] = value;
      if (component % 3 === 0) {
        minX = Math.min(minX, value);
        maxX = Math.max(maxX, value);
      } else if (component % 3 === 1) {
        minY = Math.min(minY, value);
        maxY = Math.max(maxY, value);
      } else {
        minZ = Math.min(minZ, value);
        maxZ = Math.max(maxZ, value);
      }
    }

    const triangleOffset = triangleIndex * 9;
    const abx = vertices[triangleOffset + 3] - vertices[triangleOffset];
    const aby = vertices[triangleOffset + 4] - vertices[triangleOffset + 1];
    const abz = vertices[triangleOffset + 5] - vertices[triangleOffset + 2];
    const acx = vertices[triangleOffset + 6] - vertices[triangleOffset];
    const acy = vertices[triangleOffset + 7] - vertices[triangleOffset + 1];
    const acz = vertices[triangleOffset + 8] - vertices[triangleOffset + 2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    const normalLength = Math.hypot(normalX, normalY, normalZ);
    const crossLength = Math.hypot(crossX, crossY, crossZ);
    if (normalLength === 0) zeroFacetNormalCount += 1;
    else {
      maximumFacetNormalLengthError = Math.max(
        maximumFacetNormalLengthError,
        Math.abs(normalLength - 1)
      );
      if (crossLength > 0) {
        const dot = normalX * crossX + normalY * crossY + normalZ * crossZ;
        if (!(dot > 0)) nonPositiveFacetNormalDotCount += 1;
        minimumFacetNormalCosine = Math.min(
          minimumFacetNormalCosine,
          Math.max(-1, Math.min(1, dot / (normalLength * crossLength)))
        );
        comparableFacetNormalCount += 1;
      }
    }

    parsedHasher.update(bytes, vertexOffset, 36);
    triangleSetHasher.update(bytes, vertexOffset, 36);
    for (let corner = 0; corner < 3; corner += 1) {
      const index = triangleIndex * 3 + corner;
      updateUint32Le(parsedHasher, index, scratch);
      updateUint32Le(triangleSetHasher, index, scratch);
    }
    if (view.getUint16(recordOffset + 48, true) !== 0) nonZeroAttributeCount += 1;
  }
  if (options.progressCounter) Atomics.store(options.progressCounter, 0, triangleCount);

  const readTriangle = (
    triangleIndex: number,
    target: Float32Array | Float64Array,
    offset = 0
  ): void => {
    if (
      !Number.isSafeInteger(triangleIndex) ||
      triangleIndex < 0 ||
      triangleIndex >= triangleCount
    ) {
      throw new RangeError(`Triangle index ${triangleIndex} is outside [0, ${triangleCount})`);
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset + 9 > target.length) {
      throw new RangeError('Triangle target does not have nine writable coordinates');
    }
    const sourceOffset = triangleIndex * 9;
    for (let component = 0; component < 9; component += 1) {
      target[offset + component] = vertices[sourceOffset + component];
    }
  };

  const artifact: ParsedBinaryStlArtifact = {
    format: 'stl',
    parserMethod: 'binary-stl-f32-exact',
    parserVersion: BINARY_STL_PARSER_VERSION,
    parserProofSha256: BINARY_STL_PARSER_PROOF_SHA256,
    byteLength: bytes.byteLength,
    triangleCount,
    nonZeroAttributeCount,
    zeroFacetNormalCount,
    nonPositiveFacetNormalDotCount,
    maximumFacetNormalLengthError,
    minimumFacetNormalCosine: comparableFacetNormalCount === 0 ? null : minimumFacetNormalCosine,
    byteSha256,
    parsedArtifactSha256: parsedHasher.digestHex(),
    parsedTriangleSetSha256: triangleSetHasher.digestHex(),
    bounds: Object.freeze({ minX, minY, minZ, maxX, maxY, maxZ }),
    readTriangle,
    forEachTriangle(visitor) {
      const triangle = new Float64Array(9);
      for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
        readTriangle(triangleIndex, triangle);
        visitor(triangle, triangleIndex);
      }
    },
  };
  return Object.freeze(artifact);
}
