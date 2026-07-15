import { IncrementalSha256, sha256Utf8 } from './incrementalSha256';

export const OBJ_ARTIFACT_PARSER_VERSION =
  'potfoundry.obj-triangle-profile-exact-picometre/v1' as const;
export const OBJ_PARSED_ARTIFACT_VERSION = 'potfoundry.parsed-obj-artifact/v1' as const;
export const OBJ_PARSED_TRIANGLE_SET_VERSION =
  'potfoundry.parsed-obj-triangle-set/v1' as const;
export const OBJ_ARTIFACT_PARSER_PROOF_SHA256 = sha256Utf8(
  [
    OBJ_ARTIFACT_PARSER_VERSION,
    'source bytes are copied, decoded as strict UTF-8, and hashed exactly',
    'profile permits comments, blank lines, exactly one object, xyz vertices, optional face normals, and triangular faces in that order',
    'materials, groups, smoothing, texture coordinates, relative indices, polygons, continuation lines, and unknown commands refuse',
    'vertex decimals are canonical base-10 millimetres with at most 9 fractional digits and convert to exact integral picometres',
    'normal-bearing faces must reference one sequential face normal; every vertex index is canonical positive and in range',
    'two bounded text passes validate counts before allocating private signed-int64 vertices and uint32 indices',
    'parsed geometry and triangle-set hashes use signed int64 little-endian picometre coordinates in source order',
    'cancellation/progress are shared atomic counters; options are snapshotted own data properties',
    'scope is exact final-byte parsing only; topology, target distance, dimensions, and thickness remain separate proofs',
  ].join('\n')
);

export const OBJ_FINAL_ARTIFACT_PROOF_SESSION_VERSION =
  'potfoundry.final-obj-artifact-proof-session/v1' as const;

export type ObjArtifactErrorCode =
  | 'INVALID_SOURCE'
  | 'INVALID_OPTIONS'
  | 'RESOURCE_LIMIT'
  | 'TEXT_INVALID'
  | 'PROFILE_UNSUPPORTED'
  | 'COORDINATE_INVALID'
  | 'NORMAL_INVALID'
  | 'INDEX_INVALID'
  | 'EMPTY_ARTIFACT'
  | 'CANCELLED';

export class ObjArtifactError extends Error {
  readonly code: ObjArtifactErrorCode;
  readonly lineNumber?: number;

  constructor(code: ObjArtifactErrorCode, message: string, lineNumber?: number) {
    super(message);
    this.name = 'ObjArtifactError';
    this.code = code;
    this.lineNumber = lineNumber;
  }
}

export interface ParseObjArtifactOptions {
  readonly maxSourceBytes?: number;
  readonly maxLineLength?: number;
  readonly maxVertices?: number;
  readonly maxTriangles?: number;
  readonly maxParsedGeometryBytes?: number;
  readonly maxAbsoluteCoordinatePm?: bigint;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export interface ParsedObjArtifact {
  readonly format: 'obj';
  readonly parserMethod: 'obj-triangle-profile-exact-picometre';
  readonly parserVersion: typeof OBJ_ARTIFACT_PARSER_VERSION;
  readonly parserProofSha256: string;
  readonly byteLength: number;
  readonly byteSha256: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly normalCount: number;
  readonly hasFaceNormals: boolean;
  readonly coordinateFractionDigits: number;
  readonly coordinateStepPm: string;
  readonly coordinateQuantizationRadiusPmUpper: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly boundsPm: Readonly<{
    minX: string;
    minY: string;
    minZ: string;
    maxX: string;
    maxY: string;
    maxZ: string;
  }>;
  readonly readTrianglePicometres: (
    triangleIndex: number,
    target: BigInt64Array,
    offset?: number
  ) => void;
  readonly forEachTrianglePicometres: (
    visitor: (triangle: BigInt64Array, triangleIndex: number) => void
  ) => void;
}

export interface ObjFinalArtifactProofSession {
  readonly version: typeof OBJ_FINAL_ARTIFACT_PROOF_SESSION_VERSION;
  readonly format: 'obj';
  readonly byteLength: number;
  readonly triangleCount: number;
  readonly byteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly parserVersion: typeof OBJ_ARTIFACT_PARSER_VERSION;
  readonly parserProofSha256: string;
}

interface Limits {
  readonly maxSourceBytes: number;
  readonly maxLineLength: number;
  readonly maxVertices: number;
  readonly maxTriangles: number;
  readonly maxParsedGeometryBytes: number;
  readonly maxAbsoluteCoordinatePm: bigint;
}

interface ProfileCounts {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly normalCount: number;
  readonly hasFaceNormals: boolean;
  readonly coordinateFractionDigits: number;
}

const DEFAULT_LIMITS: Limits = Object.freeze({
  maxSourceBytes: 256 * 1024 * 1024,
  maxLineLength: 4096,
  maxVertices: 12_000_000,
  maxTriangles: 8_000_000,
  maxParsedGeometryBytes: 384 * 1024 * 1024,
  maxAbsoluteCoordinatePm: 1_000_000_000_000_000n,
});
const OPTION_NAMES = Object.freeze([
  'maxSourceBytes',
  'maxLineLength',
  'maxVertices',
  'maxTriangles',
  'maxParsedGeometryBytes',
  'maxAbsoluteCoordinatePm',
  'cancellationFlag',
  'progressCounter',
] as const);
const OPTION_NAME_SET = new Set<string>(OPTION_NAMES);
const POSITIVE_UINT_RE = /^[1-9][0-9]*$/;
const DECIMAL_RE = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const sessions = new WeakMap<ObjFinalArtifactProofSession, ParsedObjArtifact>();

function fail(
  code: ObjArtifactErrorCode,
  message: string,
  lineNumber?: number
): never {
  throw new ObjArtifactError(code, message, lineNumber);
}

function snapshotOptions(options: ParseObjArtifactOptions): Readonly<ParseObjArtifactOptions> {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    fail('INVALID_OPTIONS', 'OBJ parser options must be a plain own-data-property record');
  }
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(options);
    descriptors = Object.getOwnPropertyDescriptors(options) as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    fail('INVALID_OPTIONS', 'OBJ parser options could not be inspected safely');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_OPTIONS', 'OBJ parser options must have Object or null prototype');
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !OPTION_NAME_SET.has(key)) {
      fail('INVALID_OPTIONS', `Unknown OBJ parser option '${String(key)}'`);
    }
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) {
      fail('INVALID_OPTIONS', `OBJ parser option '${key}' must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as Readonly<ParseObjArtifactOptions>;
}

function positiveSafeInteger(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    fail('INVALID_OPTIONS', `${label} must be a positive safe integer`);
  }
  return resolved;
}

function resolveLimits(options: Readonly<ParseObjArtifactOptions>): Limits {
  const maxAbsoluteCoordinatePm =
    options.maxAbsoluteCoordinatePm ?? DEFAULT_LIMITS.maxAbsoluteCoordinatePm;
  if (
    typeof maxAbsoluteCoordinatePm !== 'bigint' ||
    maxAbsoluteCoordinatePm <= 0n ||
    maxAbsoluteCoordinatePm > INT64_MAX
  ) {
    fail('INVALID_OPTIONS', 'maxAbsoluteCoordinatePm must be a positive signed-int64 bigint');
  }
  return Object.freeze({
    maxSourceBytes: positiveSafeInteger(
      options.maxSourceBytes,
      DEFAULT_LIMITS.maxSourceBytes,
      'maxSourceBytes'
    ),
    maxLineLength: positiveSafeInteger(
      options.maxLineLength,
      DEFAULT_LIMITS.maxLineLength,
      'maxLineLength'
    ),
    maxVertices: positiveSafeInteger(options.maxVertices, DEFAULT_LIMITS.maxVertices, 'maxVertices'),
    maxTriangles: positiveSafeInteger(
      options.maxTriangles,
      DEFAULT_LIMITS.maxTriangles,
      'maxTriangles'
    ),
    maxParsedGeometryBytes: positiveSafeInteger(
      options.maxParsedGeometryBytes,
      DEFAULT_LIMITS.maxParsedGeometryBytes,
      'maxParsedGeometryBytes'
    ),
    maxAbsoluteCoordinatePm,
  });
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

function checkCancelled(flag: Int32Array | undefined): void {
  if (flag !== undefined && Atomics.load(flag, 0) !== 0) {
    fail('CANCELLED', 'OBJ parsing was cancelled');
  }
}

function snapshotSource(source: ArrayBuffer | Uint8Array, maxSourceBytes: number): Uint8Array {
  let view: Uint8Array;
  if (source instanceof ArrayBuffer) {
    view = new Uint8Array(source);
  } else if (ArrayBuffer.isView(source)) {
    const buffer = source.buffer;
    if (
      (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) ||
      Object.prototype.toString.call(buffer) !== '[object ArrayBuffer]'
    ) {
      fail('INVALID_SOURCE', 'OBJ source may not use shared memory');
    }
    view = new Uint8Array(buffer, source.byteOffset, source.byteLength);
  } else {
    fail('INVALID_SOURCE', 'OBJ source must be an ArrayBuffer or non-shared byte view');
  }
  if (view.byteLength === 0 || view.byteLength > maxSourceBytes) {
    fail('RESOURCE_LIMIT', `OBJ source byte length ${view.byteLength} exceeds the limit`);
  }
  return Uint8Array.from(view);
}

function forEachLine(
  text: string,
  maxLineLength: number,
  visitor: (line: string, lineNumber: number, characterOffset: number) => void
): void {
  let start = 0;
  let lineNumber = 1;
  while (start < text.length) {
    const nextBreak = text.indexOf('\n', start);
    const end = nextBreak < 0 ? text.length : nextBreak;
    if (end - start > maxLineLength) {
      fail('RESOURCE_LIMIT', `OBJ line ${lineNumber} exceeds ${maxLineLength} characters`, lineNumber);
    }
    visitor(text.slice(start, end), lineNumber, start);
    if (nextBreak < 0) break;
    start = nextBreak + 1;
    lineNumber += 1;
  }
}

function parseDecimalPicometres(
  token: string,
  maxAbsoluteCoordinatePm: bigint,
  lineNumber: number
): { readonly value: bigint; readonly fractionDigits: number } {
  const match = DECIMAL_RE.exec(token);
  if (match === null) {
    fail('COORDINATE_INVALID', `OBJ coordinate '${token}' is not canonical decimal`, lineNumber);
  }
  const fraction = match[3] ?? '';
  if (fraction.length > 9) {
    fail('COORDINATE_INVALID', 'OBJ coordinates may not use sub-picometre decimals', lineNumber);
  }
  const magnitude = BigInt(match[2]) * 1_000_000_000n +
    BigInt(fraction.padEnd(9, '0') || '0');
  const signed = match[1] === '-' && magnitude !== 0n ? -magnitude : magnitude;
  if (
    signed < INT64_MIN ||
    signed > INT64_MAX ||
    signed < -maxAbsoluteCoordinatePm ||
    signed > maxAbsoluteCoordinatePm
  ) {
    fail('COORDINATE_INVALID', `OBJ coordinate '${token}' exceeds the exact domain`, lineNumber);
  }
  return Object.freeze({ value: signed, fractionDigits: fraction.length });
}

function validateNormalToken(token: string, lineNumber: number): void {
  const match = DECIMAL_RE.exec(token);
  if (match === null || (match[3]?.length ?? 0) > 9) {
    fail('NORMAL_INVALID', `OBJ normal '${token}' is not a bounded canonical decimal`, lineNumber);
  }
  const fraction = match[3] ?? '';
  const magnitude = BigInt(match[2]) * 1_000_000_000n +
    BigInt(fraction.padEnd(9, '0') || '0');
  if (magnitude > 1_000_000_000n) {
    fail('NORMAL_INVALID', `OBJ normal '${token}' is outside [-1, 1]`, lineNumber);
  }
}

function parsePositiveIndex(token: string, upperExclusive: number, lineNumber: number): number {
  if (!POSITIVE_UINT_RE.test(token)) {
    fail('INDEX_INVALID', `OBJ index '${token}' is not canonical positive`, lineNumber);
  }
  const oneBased = BigInt(token);
  if (oneBased > BigInt(upperExclusive)) {
    fail('INDEX_INVALID', `OBJ index '${token}' is outside its table`, lineNumber);
  }
  return Number(oneBased - 1n);
}

function validateFace(
  tokens: readonly string[],
  vertexCount: number,
  normalCount: number,
  faceIndex: number,
  lineNumber: number
): boolean {
  if (tokens.length !== 4) {
    fail('PROFILE_UNSUPPORTED', 'OBJ certification profile accepts triangles only', lineNumber);
  }
  const hasNormals = tokens[1].includes('//');
  for (let corner = 1; corner < 4; corner += 1) {
    if (hasNormals) {
      const fields = tokens[corner].split('//');
      if (fields.length !== 2 || fields[0].length === 0 || fields[1].length === 0) {
        fail('INDEX_INVALID', `OBJ face corner '${tokens[corner]}' is unsupported`, lineNumber);
      }
      parsePositiveIndex(fields[0], vertexCount, lineNumber);
      const normalIndex = parsePositiveIndex(fields[1], normalCount, lineNumber);
      if (normalIndex !== faceIndex) {
        fail('INDEX_INVALID', 'OBJ face must reference its one sequential face normal', lineNumber);
      }
    } else {
      if (tokens[corner].includes('/')) {
        fail('PROFILE_UNSUPPORTED', 'OBJ texture-coordinate face syntax is unsupported', lineNumber);
      }
      parsePositiveIndex(tokens[corner], vertexCount, lineNumber);
    }
  }
  return hasNormals;
}

function inspectProfile(
  text: string,
  limits: Limits,
  cancellationFlag: Int32Array | undefined,
  progressCounter: Int32Array | undefined
): ProfileCounts {
  let phase: 'header' | 'vertices' | 'normals' | 'faces' = 'header';
  let objectCount = 0;
  let vertexCount = 0;
  let normalCount = 0;
  let triangleCount = 0;
  let faceNormalMode: boolean | undefined;
  let coordinateFractionDigits: number | undefined;
  let visitedLines = 0;
  forEachLine(text, limits.maxLineLength, (line, lineNumber, characterOffset) => {
    visitedLines += 1;
    if ((visitedLines & 0xfff) === 0) {
      checkCancelled(cancellationFlag);
      if (progressCounter) Atomics.store(progressCounter, 0, characterOffset);
    }
    if (line.length === 0) return;
    if (line.includes('\0') || /[\t\f\v]/.test(line)) {
      fail('TEXT_INVALID', 'OBJ profile forbids NUL and non-space horizontal whitespace', lineNumber);
    }
    if (line.startsWith('#')) {
      if (phase !== 'header') fail('PROFILE_UNSUPPORTED', 'OBJ comments are header-only', lineNumber);
      return;
    }
    if (line.startsWith('o ')) {
      if (phase !== 'header' || objectCount !== 0 || line.length === 2 || /\s/.test(line.slice(2))) {
        fail('PROFILE_UNSUPPORTED', 'OBJ profile requires exactly one single-token object', lineNumber);
      }
      objectCount += 1;
      return;
    }
    if (line.startsWith('vn ')) {
      if (objectCount !== 1 || (phase !== 'vertices' && phase !== 'normals')) {
        fail('PROFILE_UNSUPPORTED', 'OBJ normals must follow the complete vertex table', lineNumber);
      }
      phase = 'normals';
      const tokens = line.split(' ');
      if (tokens.length !== 4 || tokens.some((token) => token.length === 0)) {
        fail('NORMAL_INVALID', 'OBJ normal must contain exactly three decimals', lineNumber);
      }
      validateNormalToken(tokens[1], lineNumber);
      validateNormalToken(tokens[2], lineNumber);
      validateNormalToken(tokens[3], lineNumber);
      normalCount += 1;
      if (normalCount > limits.maxTriangles) fail('RESOURCE_LIMIT', 'OBJ normal count exceeds limit');
      return;
    }
    if (line.startsWith('v ')) {
      if (objectCount !== 1 || (phase !== 'header' && phase !== 'vertices')) {
        fail('PROFILE_UNSUPPORTED', 'OBJ vertices must be one contiguous table', lineNumber);
      }
      phase = 'vertices';
      const tokens = line.split(' ');
      if (tokens.length !== 4 || tokens.some((token) => token.length === 0)) {
        fail('COORDINATE_INVALID', 'OBJ vertex must contain exactly three decimals', lineNumber);
      }
      for (let component = 1; component < 4; component += 1) {
        const parsed = parseDecimalPicometres(
          tokens[component],
          limits.maxAbsoluteCoordinatePm,
          lineNumber
        );
        if (coordinateFractionDigits === undefined) {
          coordinateFractionDigits = parsed.fractionDigits;
        } else if (coordinateFractionDigits !== parsed.fractionDigits) {
          fail('PROFILE_UNSUPPORTED', 'OBJ vertex precision must be uniform', lineNumber);
        }
      }
      vertexCount += 1;
      if (vertexCount > limits.maxVertices) fail('RESOURCE_LIMIT', 'OBJ vertex count exceeds limit');
      return;
    }
    if (line.startsWith('f ')) {
      if (
        objectCount !== 1 ||
        vertexCount === 0 ||
        (phase !== 'vertices' && phase !== 'normals' && phase !== 'faces')
      ) {
        fail('PROFILE_UNSUPPORTED', 'OBJ faces must follow vertices and optional normals', lineNumber);
      }
      phase = 'faces';
      const tokens = line.split(' ');
      if (tokens.some((token) => token.length === 0)) {
        fail('INDEX_INVALID', 'OBJ faces use exactly one space between corners', lineNumber);
      }
      const hasNormals = validateFace(tokens, vertexCount, normalCount, triangleCount, lineNumber);
      if (faceNormalMode === undefined) faceNormalMode = hasNormals;
      else if (faceNormalMode !== hasNormals) {
        fail('PROFILE_UNSUPPORTED', 'OBJ face-normal syntax must be uniform', lineNumber);
      }
      triangleCount += 1;
      if (triangleCount > limits.maxTriangles) fail('RESOURCE_LIMIT', 'OBJ triangle count exceeds limit');
      return;
    }
    fail('PROFILE_UNSUPPORTED', `OBJ command on line ${lineNumber} is unsupported`, lineNumber);
  });
  if (objectCount !== 1 || vertexCount === 0 || triangleCount === 0) {
    fail('EMPTY_ARTIFACT', 'OBJ profile requires one object with vertices and triangular faces');
  }
  const hasFaceNormals = faceNormalMode === true;
  if ((hasFaceNormals && normalCount !== triangleCount) || (!hasFaceNormals && normalCount !== 0)) {
    fail('PROFILE_UNSUPPORTED', 'OBJ normal table must be absent or contain exactly one normal per face');
  }
  if (coordinateFractionDigits === undefined) fail('EMPTY_ARTIFACT', 'OBJ vertex table is empty');
  return Object.freeze({
    vertexCount,
    triangleCount,
    normalCount,
    hasFaceNormals,
    coordinateFractionDigits,
  });
}

function taggedHasher(tag: string): IncrementalSha256 {
  const hasher = new IncrementalSha256();
  hasher.update(new TextEncoder().encode(tag));
  hasher.update(Uint8Array.of(0));
  return hasher;
}

function updateUint32Le(
  hasher: IncrementalSha256,
  value: number,
  scratch: Uint8Array,
  scratchView: DataView
): void {
  scratchView.setUint32(0, value, true);
  hasher.update(scratch, 0, 4);
}

function updateInt64Le(
  hasher: IncrementalSha256,
  value: bigint,
  scratch: Uint8Array,
  scratchView: DataView
): void {
  scratchView.setBigInt64(0, value, true);
  hasher.update(scratch, 0, 8);
}

/** Parse and snapshot one strict final-byte PotFoundry triangular OBJ. */
export function parseObjArtifact(
  source: ArrayBuffer | Uint8Array,
  options: ParseObjArtifactOptions = {}
): ParsedObjArtifact {
  const optionSnapshot = snapshotOptions(options);
  const limits = resolveLimits(optionSnapshot);
  const cancellationFlag = optionSnapshot.cancellationFlag;
  const progressCounter = optionSnapshot.progressCounter;
  validateCounter(cancellationFlag, 'cancellationFlag');
  validateCounter(progressCounter, 'progressCounter');
  if (progressCounter) Atomics.store(progressCounter, 0, 0);
  checkCancelled(cancellationFlag);
  const bytes = snapshotSource(source, limits.maxSourceBytes);
  let text: string;
  try {
    text = utf8Decoder.decode(bytes);
  } catch {
    fail('TEXT_INVALID', 'OBJ source is not strict UTF-8');
  }
  if (text.includes('\r') || text.charCodeAt(0) === 0xfeff) {
    fail('TEXT_INVALID', 'OBJ profile requires LF-only UTF-8 without BOM');
  }
  const profile = inspectProfile(text, limits, cancellationFlag, progressCounter);
  const parsedBytes =
    profile.vertexCount * 3 * BigInt64Array.BYTES_PER_ELEMENT +
    profile.triangleCount * 3 * Uint32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(parsedBytes) || parsedBytes > limits.maxParsedGeometryBytes) {
    fail('RESOURCE_LIMIT', `OBJ parsed geometry needs ${parsedBytes} bytes`);
  }
  let vertices: BigInt64Array;
  let indices: Uint32Array;
  try {
    vertices = new BigInt64Array(profile.vertexCount * 3);
    indices = new Uint32Array(profile.triangleCount * 3);
  } catch {
    fail('RESOURCE_LIMIT', `Could not allocate ${parsedBytes} OBJ geometry bytes`);
  }
  let vertexIndex = 0;
  let triangleIndex = 0;
  let minX = INT64_MAX;
  let minY = INT64_MAX;
  let minZ = INT64_MAX;
  let maxX = INT64_MIN;
  let maxY = INT64_MIN;
  let maxZ = INT64_MIN;
  forEachLine(text, limits.maxLineLength, (line, lineNumber, characterOffset) => {
    if (((vertexIndex + triangleIndex) & 0xfff) === 0) {
      checkCancelled(cancellationFlag);
      if (progressCounter) Atomics.store(progressCounter, 0, bytes.byteLength + characterOffset);
    }
    if (line.startsWith('v ')) {
      const tokens = line.split(' ');
      const x = parseDecimalPicometres(tokens[1], limits.maxAbsoluteCoordinatePm, lineNumber).value;
      const y = parseDecimalPicometres(tokens[2], limits.maxAbsoluteCoordinatePm, lineNumber).value;
      const z = parseDecimalPicometres(tokens[3], limits.maxAbsoluteCoordinatePm, lineNumber).value;
      vertices[vertexIndex * 3] = x;
      vertices[vertexIndex * 3 + 1] = y;
      vertices[vertexIndex * 3 + 2] = z;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      vertexIndex += 1;
    } else if (line.startsWith('f ')) {
      const tokens = line.split(' ');
      for (let corner = 0; corner < 3; corner += 1) {
        const token = tokens[corner + 1];
        const vertexToken = profile.hasFaceNormals ? token.split('//')[0] : token;
        indices[triangleIndex * 3 + corner] = parsePositiveIndex(
          vertexToken,
          profile.vertexCount,
          lineNumber
        );
      }
      triangleIndex += 1;
    }
  });
  if (vertexIndex !== profile.vertexCount || triangleIndex !== profile.triangleCount) {
    fail('INVALID_SOURCE', 'OBJ changed between validation and materialization');
  }

  const artifactHasher = taggedHasher(OBJ_PARSED_ARTIFACT_VERSION);
  const triangleHasher = taggedHasher(OBJ_PARSED_TRIANGLE_SET_VERSION);
  const scratch = new Uint8Array(8);
  const scratchView = new DataView(scratch.buffer, scratch.byteOffset, scratch.byteLength);
  updateUint32Le(artifactHasher, profile.vertexCount, scratch, scratchView);
  updateUint32Le(artifactHasher, profile.triangleCount, scratch, scratchView);
  updateUint32Le(triangleHasher, profile.triangleCount, scratch, scratchView);
  for (const coordinate of vertices) updateInt64Le(artifactHasher, coordinate, scratch, scratchView);
  for (let face = 0; face < profile.triangleCount; face += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const index = indices[face * 3 + corner];
      updateUint32Le(artifactHasher, index, scratch, scratchView);
      for (let component = 0; component < 3; component += 1) {
        updateInt64Le(
          triangleHasher,
          vertices[index * 3 + component],
          scratch,
          scratchView
        );
      }
    }
  }
  const byteSha256 = new IncrementalSha256().update(bytes).digestHex();
  const parsedArtifactSha256 = artifactHasher.digestHex();
  const parsedTriangleSetSha256 = triangleHasher.digestHex();
  const readTrianglePicometres = (
    requestedTriangle: number,
    target: BigInt64Array,
    offset = 0
  ): void => {
    if (
      !Number.isSafeInteger(requestedTriangle) ||
      requestedTriangle < 0 ||
      requestedTriangle >= profile.triangleCount ||
      !(target instanceof BigInt64Array) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset + 9 > target.length
    ) {
      throw new RangeError('OBJ triangle read request is out of range');
    }
    for (let corner = 0; corner < 3; corner += 1) {
      const index = indices[requestedTriangle * 3 + corner];
      target.set(vertices.subarray(index * 3, index * 3 + 3), offset + corner * 3);
    }
  };
  const forEachTrianglePicometres = (
    visitor: (triangle: BigInt64Array, triangleIndex: number) => void
  ): void => {
    if (typeof visitor !== 'function') throw new TypeError('Triangle visitor must be callable');
    const triangle = new BigInt64Array(9);
    for (let face = 0; face < profile.triangleCount; face += 1) {
      readTrianglePicometres(face, triangle);
      visitor(triangle, face);
    }
  };
  const coordinateStepPm = 10n ** BigInt(9 - profile.coordinateFractionDigits);
  const coordinateQuantizationRadiusPmUpper = (coordinateStepPm + 1n) / 2n;
  if (progressCounter) Atomics.store(progressCounter, 0, bytes.byteLength * 2);
  return Object.freeze({
    format: 'obj',
    parserMethod: 'obj-triangle-profile-exact-picometre',
    parserVersion: OBJ_ARTIFACT_PARSER_VERSION,
    parserProofSha256: OBJ_ARTIFACT_PARSER_PROOF_SHA256,
    byteLength: bytes.byteLength,
    byteSha256,
    vertexCount: profile.vertexCount,
    triangleCount: profile.triangleCount,
    normalCount: profile.normalCount,
    hasFaceNormals: profile.hasFaceNormals,
    coordinateFractionDigits: profile.coordinateFractionDigits,
    coordinateStepPm: coordinateStepPm.toString(),
    coordinateQuantizationRadiusPmUpper: coordinateQuantizationRadiusPmUpper.toString(),
    parsedArtifactSha256,
    parsedTriangleSetSha256,
    boundsPm: Object.freeze({
      minX: minX.toString(),
      minY: minY.toString(),
      minZ: minZ.toString(),
      maxX: maxX.toString(),
      maxY: maxY.toString(),
      maxZ: maxZ.toString(),
    }),
    readTrianglePicometres,
    forEachTrianglePicometres,
  });
}

/** Parse exact final bytes and mint an unforgeable in-process OBJ proof session. */
export function createObjFinalArtifactProofSession(
  source: ArrayBuffer | Uint8Array,
  options: ParseObjArtifactOptions = {}
): ObjFinalArtifactProofSession {
  const parsed = parseObjArtifact(source, options);
  const session = Object.freeze({
    version: OBJ_FINAL_ARTIFACT_PROOF_SESSION_VERSION,
    format: 'obj' as const,
    byteLength: parsed.byteLength,
    triangleCount: parsed.triangleCount,
    byteSha256: parsed.byteSha256,
    parsedArtifactSha256: parsed.parsedArtifactSha256,
    parsedTriangleSetSha256: parsed.parsedTriangleSetSha256,
    parserVersion: parsed.parserVersion,
    parserProofSha256: parsed.parserProofSha256,
  });
  sessions.set(session, parsed);
  return session;
}

export function parsedObjArtifactForProofSession(
  session: ObjFinalArtifactProofSession
): ParsedObjArtifact {
  if (typeof session !== 'object' || session === null) {
    throw new TypeError('Final OBJ proof session is invalid');
  }
  const parsed = sessions.get(session);
  if (parsed === undefined) {
    throw new TypeError('Final OBJ proof session was not minted by the exact parser');
  }
  return parsed;
}
