import JSZip from 'jszip';

import { IncrementalSha256, sha256Utf8 } from './incrementalSha256';

export const THREE_MF_ARTIFACT_PARSER_VERSION =
  'potfoundry.3mf-single-mesh-exact-picometre/v2' as const;
export const THREE_MF_PARSED_ARTIFACT_VERSION =
  'potfoundry.parsed-3mf-artifact/v1' as const;
export const THREE_MF_PARSED_TRIANGLE_SET_VERSION =
  'potfoundry.parsed-3mf-triangle-set/v1' as const;
export const THREE_MF_ARTIFACT_PARSER_PROOF_SHA256 = sha256Utf8(
  [
    THREE_MF_ARTIFACT_PARSER_VERSION,
    'source bytes are copied before asynchronous work and hashed exactly',
    'EOCD and every central-directory record are parsed before decompression; multidisk, zip64, encryption, unsafe names, duplicate names, unsupported methods, extra file parts, and declared resource excess refuse',
    'required package profile contains exactly content-types, root relationships, and one 3D/3dmodel.model file plus optional directory entries',
    'XML forbids doctype and entity declarations and must be namespace-well-formed',
    'geometry profile is one build item referencing one model object with one vertices table, one triangle table, and no components or transforms',
    'millimeter, centimeter, and inch coordinates are parsed as exact base-10 rationals and converted to exact integral picometres; sub-picometre coordinates refuse',
    'every triangle index is a canonical unsigned integer inside the exact vertex table',
    'parsed geometry and triangle-set hashes use signed int64 little-endian picometre coordinates in source order',
    'private vertex/index snapshots are exposed only through copy and visitor methods',
    'parser options are snapshotted from an own-data-property record before asynchronous work; inherited, accessor, symbol, and unknown options refuse',
    'cancellation and progress use shared atomic counters without untrusted callbacks',
    'scope is exact final-byte parsing only; topology, target distance, dimensions, and thickness remain separate proofs',
  ].join('\n')
);

export const THREE_MF_FINAL_ARTIFACT_PROOF_SESSION_VERSION =
  'potfoundry.final-3mf-artifact-proof-session/v1' as const;

export type ThreeMfArtifactErrorCode =
  | 'INVALID_SOURCE'
  | 'RESOURCE_LIMIT'
  | 'ZIP_INVALID'
  | 'ZIP_PROFILE_UNSUPPORTED'
  | 'PACKAGE_PART_MISSING'
  | 'PACKAGE_PART_EXTRA'
  | 'XML_INVALID'
  | 'MODEL_PROFILE_UNSUPPORTED'
  | 'UNIT_UNSUPPORTED'
  | 'COORDINATE_INVALID'
  | 'INDEX_INVALID'
  | 'EMPTY_ARTIFACT'
  | 'CANCELLED';

export class ThreeMfArtifactError extends Error {
  readonly code: ThreeMfArtifactErrorCode;
  readonly subject?: string;

  constructor(code: ThreeMfArtifactErrorCode, message: string, subject?: string) {
    super(message);
    this.name = 'ThreeMfArtifactError';
    this.code = code;
    this.subject = subject;
  }
}

export interface ParseThreeMfArtifactOptions {
  readonly maxArchiveBytes?: number;
  readonly maxCentralDirectoryEntries?: number;
  readonly maxTotalDeclaredUncompressedBytes?: number;
  readonly maxModelXmlBytes?: number;
  readonly maxVertices?: number;
  readonly maxTriangles?: number;
  readonly maxParsedGeometryBytes?: number;
  readonly maxAbsoluteCoordinatePm?: bigint;
  readonly cancellationFlag?: Int32Array;
  readonly progressCounter?: Int32Array;
}

export interface ParsedThreeMfArtifact {
  readonly format: '3mf';
  readonly parserMethod: '3mf-single-mesh-exact-picometre';
  readonly parserVersion: typeof THREE_MF_ARTIFACT_PARSER_VERSION;
  readonly parserProofSha256: string;
  readonly byteLength: number;
  readonly byteSha256: string;
  readonly modelXmlByteSha256: string;
  readonly modelUnit: 'millimeter' | 'centimeter' | 'inch';
  readonly unitPicometres: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
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

export interface ThreeMfFinalArtifactProofSession {
  readonly version: typeof THREE_MF_FINAL_ARTIFACT_PROOF_SESSION_VERSION;
  readonly format: '3mf';
  readonly byteLength: number;
  readonly triangleCount: number;
  readonly byteSha256: string;
  readonly parsedArtifactSha256: string;
  readonly parsedTriangleSetSha256: string;
  readonly parserVersion: typeof THREE_MF_ARTIFACT_PARSER_VERSION;
  readonly parserProofSha256: string;
}

interface ZipEntry {
  readonly name: string;
  readonly directory: boolean;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
}

interface ResourceLimits {
  readonly maxArchiveBytes: number;
  readonly maxCentralDirectoryEntries: number;
  readonly maxTotalDeclaredUncompressedBytes: number;
  readonly maxModelXmlBytes: number;
  readonly maxVertices: number;
  readonly maxTriangles: number;
  readonly maxParsedGeometryBytes: number;
  readonly maxAbsoluteCoordinatePm: bigint;
}

const REQUIRED_FILES = Object.freeze([
  '3D/3dmodel.model',
  '[Content_Types].xml',
  '_rels/.rels',
]);
const DEFAULT_LIMITS: ResourceLimits = Object.freeze({
  maxArchiveBytes: 512 * 1024 * 1024,
  maxCentralDirectoryEntries: 16,
  maxTotalDeclaredUncompressedBytes: 1024 * 1024 * 1024,
  maxModelXmlBytes: 768 * 1024 * 1024,
  maxVertices: 12_000_000,
  maxTriangles: 8_000_000,
  maxParsedGeometryBytes: 384 * 1024 * 1024,
  maxAbsoluteCoordinatePm: 1_000_000_000_000_000n,
});
const PARSE_OPTION_NAMES = Object.freeze([
  'maxArchiveBytes',
  'maxCentralDirectoryEntries',
  'maxTotalDeclaredUncompressedBytes',
  'maxModelXmlBytes',
  'maxVertices',
  'maxTriangles',
  'maxParsedGeometryBytes',
  'maxAbsoluteCoordinatePm',
  'cancellationFlag',
  'progressCounter',
] as const);
const PARSE_OPTION_NAME_SET = new Set<string>(PARSE_OPTION_NAMES);
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_RE = /^-?(?:0|[1-9][0-9]*)(?:\.([0-9]+))?$/;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const sessions = new WeakMap<ThreeMfFinalArtifactProofSession, ParsedThreeMfArtifact>();

function fail(code: ThreeMfArtifactErrorCode, message: string, subject?: string): never {
  throw new ThreeMfArtifactError(code, message, subject);
}

function positiveSafeInteger(
  value: number | undefined,
  fallback: number,
  label: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    fail('RESOURCE_LIMIT', `${label} must be a positive safe integer`);
  }
  return resolved;
}

function snapshotOptions(options: ParseThreeMfArtifactOptions): ParseThreeMfArtifactOptions {
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    fail('INVALID_SOURCE', '3MF parser options must be an own-data-property record');
  }
  let prototype: object | null;
  let descriptors: Record<PropertyKey, PropertyDescriptor>;
  try {
    prototype = Object.getPrototypeOf(options);
    descriptors = Object.getOwnPropertyDescriptors(options) as Record<PropertyKey, PropertyDescriptor>;
  } catch {
    fail('INVALID_SOURCE', '3MF parser options could not be inspected safely');
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_SOURCE', '3MF parser options must have Object or null prototype');
  }
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !PARSE_OPTION_NAME_SET.has(key)) {
      fail('INVALID_SOURCE', `Unknown 3MF parser option '${String(key)}'`);
    }
    const descriptor = descriptors[key];
    if (!('value' in descriptor)) {
      fail('INVALID_SOURCE', `3MF parser option '${key}' must be a data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot) as ParseThreeMfArtifactOptions;
}

function limits(options: ParseThreeMfArtifactOptions): ResourceLimits {
  const maxAbsoluteCoordinatePm =
    options.maxAbsoluteCoordinatePm ?? DEFAULT_LIMITS.maxAbsoluteCoordinatePm;
  if (typeof maxAbsoluteCoordinatePm !== 'bigint' || maxAbsoluteCoordinatePm <= 0n) {
    fail('RESOURCE_LIMIT', 'maxAbsoluteCoordinatePm must be a positive bigint');
  }
  return Object.freeze({
    maxArchiveBytes: positiveSafeInteger(
      options.maxArchiveBytes,
      DEFAULT_LIMITS.maxArchiveBytes,
      'maxArchiveBytes'
    ),
    maxCentralDirectoryEntries: positiveSafeInteger(
      options.maxCentralDirectoryEntries,
      DEFAULT_LIMITS.maxCentralDirectoryEntries,
      'maxCentralDirectoryEntries'
    ),
    maxTotalDeclaredUncompressedBytes: positiveSafeInteger(
      options.maxTotalDeclaredUncompressedBytes,
      DEFAULT_LIMITS.maxTotalDeclaredUncompressedBytes,
      'maxTotalDeclaredUncompressedBytes'
    ),
    maxModelXmlBytes: positiveSafeInteger(
      options.maxModelXmlBytes,
      DEFAULT_LIMITS.maxModelXmlBytes,
      'maxModelXmlBytes'
    ),
    maxVertices: positiveSafeInteger(
      options.maxVertices,
      DEFAULT_LIMITS.maxVertices,
      'maxVertices'
    ),
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
    fail('INVALID_SOURCE', `${label} must contain index 0 and use SharedArrayBuffer`);
  }
}

function checkCancelled(flag: Int32Array | undefined): void {
  if (flag !== undefined && Atomics.load(flag, 0) !== 0) {
    fail('CANCELLED', '3MF parsing was cancelled');
  }
}

function snapshotSource(source: ArrayBuffer | Uint8Array, maxBytes: number): Uint8Array {
  let view: Uint8Array;
  if (source instanceof ArrayBuffer) {
    view = new Uint8Array(source);
  } else if (ArrayBuffer.isView(source)) {
    const buffer = source.buffer;
    if (
      (typeof SharedArrayBuffer !== 'undefined' && buffer instanceof SharedArrayBuffer) ||
      Object.prototype.toString.call(buffer) !== '[object ArrayBuffer]'
    ) {
      fail('INVALID_SOURCE', '3MF source may not use shared memory');
    }
    view = new Uint8Array(buffer, source.byteOffset, source.byteLength);
  } else {
    fail('INVALID_SOURCE', '3MF source must be an ArrayBuffer or non-shared byte view');
  }
  if (view.byteLength === 0 || view.byteLength > maxBytes) {
    fail('RESOURCE_LIMIT', `3MF archive byte length ${view.byteLength} exceeds the limit`);
  }
  return Uint8Array.from(view);
}

function decodeName(bytes: Uint8Array): string {
  let name: string;
  try {
    name = utf8Decoder.decode(bytes);
  } catch {
    fail('ZIP_INVALID', 'ZIP entry name is not valid UTF-8');
  }
  if (
    name.length === 0 ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.startsWith('/') ||
    name.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    fail('ZIP_INVALID', `ZIP entry name '${name}' is unsafe`, name);
  }
  return name;
}

function findEocd(bytes: Uint8Array, view: DataView): number {
  const minimum = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH);
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) !== EOCD_SIGNATURE) continue;
    const commentLength = view.getUint16(offset + 20, true);
    if (offset + 22 + commentLength === bytes.byteLength) return offset;
  }
  fail('ZIP_INVALID', 'ZIP end-of-central-directory record is missing');
}

function preflightZip(bytes: Uint8Array, resourceLimits: ResourceLimits): readonly ZipEntry[] {
  if (bytes.byteLength < 22) fail('ZIP_INVALID', 'ZIP archive is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEocd(bytes, view);
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDisk = view.getUint16(eocdOffset + 6, true);
  const diskEntries = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    fail('ZIP_PROFILE_UNSUPPORTED', 'Multidisk and ZIP64 3MF archives are unsupported');
  }
  if (totalEntries > resourceLimits.maxCentralDirectoryEntries) {
    fail('RESOURCE_LIMIT', `ZIP declares ${totalEntries} central-directory entries`);
  }
  if (
    centralOffset + centralSize > eocdOffset ||
    centralOffset < 0 ||
    centralSize < 0
  ) {
    fail('ZIP_INVALID', 'ZIP central-directory bounds are invalid');
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (cursor + 46 > centralOffset + centralSize || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      fail('ZIP_INVALID', `ZIP central-directory entry ${entryIndex} is invalid`);
    }
    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (
      recordEnd > centralOffset + centralSize ||
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      fail('ZIP_PROFILE_UNSUPPORTED', 'ZIP64 or truncated central entry is unsupported');
    }
    if ((flags & 1) !== 0) fail('ZIP_PROFILE_UNSUPPORTED', 'Encrypted ZIP entries refuse');
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      fail('ZIP_PROFILE_UNSUPPORTED', `ZIP compression method ${compressionMethod} is unsupported`);
    }
    if (diskStart !== 0 || localOffset + 30 > centralOffset) {
      fail('ZIP_INVALID', 'ZIP local-header location is invalid');
    }
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      fail('ZIP_INVALID', 'ZIP local-header signature is invalid');
    }
    const name = decodeName(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (names.has(name)) fail('ZIP_INVALID', `Duplicate ZIP entry '${name}'`, name);
    names.add(name);
    const directory = name.endsWith('/');
    totalUncompressed += uncompressedSize;
    if (!Number.isSafeInteger(totalUncompressed) || totalUncompressed > resourceLimits.maxTotalDeclaredUncompressedBytes) {
      fail('RESOURCE_LIMIT', 'ZIP declared uncompressed size exceeds the limit');
    }
    if (name === '3D/3dmodel.model' && uncompressedSize > resourceLimits.maxModelXmlBytes) {
      fail('RESOURCE_LIMIT', '3MF model XML declared size exceeds the limit');
    }
    entries.push(Object.freeze({
      name,
      directory,
      compressionMethod,
      compressedSize,
      uncompressedSize,
    }));
    cursor = recordEnd;
  }
  if (cursor !== centralOffset + centralSize) {
    fail('ZIP_INVALID', 'ZIP central-directory length is inconsistent');
  }
  const files = entries.filter((entry) => !entry.directory).map((entry) => entry.name).sort();
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) fail('PACKAGE_PART_MISSING', `Required 3MF part '${required}' is missing`, required);
  }
  const extra = files.filter((name) => !REQUIRED_FILES.includes(name));
  if (extra.length > 0) {
    fail('PACKAGE_PART_EXTRA', `Unsupported extra 3MF file part '${extra[0]}'`, extra[0]);
  }
  return Object.freeze(entries);
}

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function oneDirectChild(parent: Element, localName: string): Element {
  const matches = directChildren(parent, localName);
  if (matches.length !== 1) {
    fail('MODEL_PROFILE_UNSUPPORTED', `Expected one direct <${localName}> element`);
  }
  return matches[0];
}

function allowedAttributes(element: Element, allowed: readonly string[]): void {
  const set = new Set(allowed);
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name === 'xmlns' || attribute.name.startsWith('xmlns:')) continue;
    if (!set.has(attribute.localName)) {
      fail(
        'MODEL_PROFILE_UNSUPPORTED',
        `Unsupported attribute '${attribute.name}' on <${element.localName}>`
      );
    }
  }
}

function unitPicometres(unit: string | null): Readonly<{
  unit: ParsedThreeMfArtifact['modelUnit'];
  picometres: bigint;
}> {
  switch (unit) {
    case 'millimeter': return Object.freeze({ unit, picometres: 1_000_000_000n });
    case 'centimeter': return Object.freeze({ unit, picometres: 10_000_000_000n });
    case 'inch': return Object.freeze({ unit, picometres: 25_400_000_000n });
    default: return fail('UNIT_UNSUPPORTED', `Unsupported 3MF model unit '${String(unit)}'`);
  }
}

function decimalCoordinatePicometres(
  raw: string | null,
  perUnitPm: bigint,
  coordinateLimit: bigint,
  subject: string
): bigint {
  if (raw === null || !DECIMAL_RE.test(raw)) {
    fail('COORDINATE_INVALID', `Coordinate '${String(raw)}' is not a canonical decimal`, subject);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [integer, fraction = ''] = unsigned.split('.');
  const denominator = 10n ** BigInt(fraction.length);
  const magnitude = BigInt(`${integer}${fraction}`) * perUnitPm;
  if (magnitude % denominator !== 0n) {
    fail('COORDINATE_INVALID', '3MF coordinate is not exactly representable in picometres', subject);
  }
  const value = (negative ? -1n : 1n) * (magnitude / denominator);
  const absolute = value < 0n ? -value : value;
  if (absolute > coordinateLimit || value < INT64_MIN || value > INT64_MAX) {
    fail('RESOURCE_LIMIT', `3MF coordinate '${raw}' exceeds the configured range`, subject);
  }
  return value === 0n ? 0n : value;
}

function unsignedIndex(raw: string | null, vertexCount: number, subject: string): number {
  if (raw === null || !UINT_RE.test(raw)) {
    fail('INDEX_INVALID', `Triangle index '${String(raw)}' is not canonical`, subject);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value >= vertexCount) {
    fail('INDEX_INVALID', `Triangle index '${raw}' is outside [0,${vertexCount})`, subject);
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
  const view = new DataView(scratch.buffer, scratch.byteOffset, scratch.byteLength);
  view.setUint32(0, value, true);
  hasher.update(scratch, 0, 4);
}

function updateInt64Le(hasher: IncrementalSha256, value: bigint, scratch: Uint8Array): void {
  const view = new DataView(scratch.buffer, scratch.byteOffset, scratch.byteLength);
  view.setBigInt64(0, value, true);
  hasher.update(scratch, 0, 8);
}

function parseXml(xml: string): XMLDocument {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    fail('XML_INVALID', 'DOCTYPE and ENTITY declarations are forbidden');
  }
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = document.querySelector('parsererror');
  if (parserError !== null) {
    fail('XML_INVALID', parserError.textContent ?? '3MF model XML is malformed');
  }
  return document;
}

/** Parse and snapshot one strict, single-mesh final-byte 3MF package. */
export async function parseThreeMfArtifact(
  source: ArrayBuffer | Uint8Array,
  options: ParseThreeMfArtifactOptions = {}
): Promise<ParsedThreeMfArtifact> {
  const optionSnapshot = snapshotOptions(options);
  const resourceLimits = limits(optionSnapshot);
  const cancellationFlag = optionSnapshot.cancellationFlag;
  const progressCounter = optionSnapshot.progressCounter;
  validateCounter(cancellationFlag, 'cancellationFlag');
  validateCounter(progressCounter, 'progressCounter');
  if (progressCounter) Atomics.store(progressCounter, 0, 0);
  checkCancelled(cancellationFlag);
  const bytes = snapshotSource(source, resourceLimits.maxArchiveBytes);
  preflightZip(bytes, resourceLimits);
  if (progressCounter) Atomics.store(progressCounter, 0, 1);
  checkCancelled(cancellationFlag);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
  } catch (error) {
    fail('ZIP_INVALID', error instanceof Error ? error.message : '3MF ZIP decompression failed');
  }
  checkCancelled(cancellationFlag);
  const modelFile = zip.file('3D/3dmodel.model');
  if (modelFile === null) fail('PACKAGE_PART_MISSING', '3MF model part is missing after load');
  let modelBytes: Uint8Array;
  try {
    modelBytes = await modelFile.async('uint8array');
  } catch (error) {
    fail('ZIP_INVALID', error instanceof Error ? error.message : '3MF model part could not be read');
  }
  if (modelBytes.byteLength === 0 || modelBytes.byteLength > resourceLimits.maxModelXmlBytes) {
    fail('RESOURCE_LIMIT', '3MF model XML actual size exceeds the limit');
  }
  if (progressCounter) Atomics.store(progressCounter, 0, 2);
  checkCancelled(cancellationFlag);

  let xml: string;
  try {
    xml = utf8Decoder.decode(modelBytes);
  } catch {
    fail('XML_INVALID', '3MF model XML is not valid UTF-8');
  }
  const document = parseXml(xml);
  const model = document.documentElement;
  if (model.localName !== 'model') fail('MODEL_PROFILE_UNSUPPORTED', 'Root element must be <model>');
  allowedAttributes(model, ['unit', 'lang']);
  const unit = unitPicometres(model.getAttribute('unit'));
  const resources = oneDirectChild(model, 'resources');
  const build = oneDirectChild(model, 'build');
  if (document.getElementsByTagNameNS('*', 'components').length !== 0) {
    fail('MODEL_PROFILE_UNSUPPORTED', '3MF component graphs are unsupported');
  }
  const objects = document.getElementsByTagNameNS('*', 'object');
  if (objects.length !== 1) fail('MODEL_PROFILE_UNSUPPORTED', 'Exactly one 3MF object is required');
  const object = objects[0];
  if (object.parentElement !== resources) {
    fail('MODEL_PROFILE_UNSUPPORTED', '3MF object must be a direct resources child');
  }
  allowedAttributes(object, ['id', 'name', 'type']);
  const objectId = object.getAttribute('id');
  if (objectId === null || !UINT_RE.test(objectId) || object.getAttribute('type') !== 'model') {
    fail('MODEL_PROFILE_UNSUPPORTED', '3MF object id/type is unsupported');
  }
  const mesh = oneDirectChild(object, 'mesh');
  allowedAttributes(mesh, []);
  const verticesElement = oneDirectChild(mesh, 'vertices');
  const trianglesElement = oneDirectChild(mesh, 'triangles');
  if (mesh.children.length !== 2) {
    fail('MODEL_PROFILE_UNSUPPORTED', '3MF mesh may contain only vertices and triangles');
  }
  const vertexElements = Array.from(verticesElement.children);
  const triangleElements = Array.from(trianglesElement.children);
  if (
    vertexElements.some((element) => element.localName !== 'vertex') ||
    triangleElements.some((element) => element.localName !== 'triangle')
  ) {
    fail('MODEL_PROFILE_UNSUPPORTED', '3MF mesh tables contain unsupported children');
  }
  if (vertexElements.length === 0 || triangleElements.length === 0) {
    fail('EMPTY_ARTIFACT', '3MF mesh must contain vertices and triangles');
  }
  if (vertexElements.length > resourceLimits.maxVertices || triangleElements.length > resourceLimits.maxTriangles) {
    fail('RESOURCE_LIMIT', '3MF vertex or triangle count exceeds the configured limit');
  }
  const parsedBytes =
    vertexElements.length * 3 * BigInt64Array.BYTES_PER_ELEMENT +
    triangleElements.length * 3 * Uint32Array.BYTES_PER_ELEMENT;
  if (!Number.isSafeInteger(parsedBytes) || parsedBytes > resourceLimits.maxParsedGeometryBytes) {
    fail('RESOURCE_LIMIT', `3MF parsed geometry needs ${parsedBytes} bytes`);
  }

  let vertices: BigInt64Array;
  let indices: Uint32Array;
  try {
    vertices = new BigInt64Array(vertexElements.length * 3);
    indices = new Uint32Array(triangleElements.length * 3);
  } catch {
    fail('RESOURCE_LIMIT', `Could not allocate ${parsedBytes} parsed geometry bytes`);
  }
  let minX = INT64_MAX;
  let minY = INT64_MAX;
  let minZ = INT64_MAX;
  let maxX = INT64_MIN;
  let maxY = INT64_MIN;
  let maxZ = INT64_MIN;
  for (let index = 0; index < vertexElements.length; index += 1) {
    if ((index & 0xfff) === 0) {
      checkCancelled(cancellationFlag);
      if (progressCounter) Atomics.store(progressCounter, 0, 3 + index);
    }
    const vertex = vertexElements[index];
    allowedAttributes(vertex, ['x', 'y', 'z']);
    const x = decimalCoordinatePicometres(
      vertex.getAttribute('x'), unit.picometres, resourceLimits.maxAbsoluteCoordinatePm, `vertex/${index}/x`
    );
    const y = decimalCoordinatePicometres(
      vertex.getAttribute('y'), unit.picometres, resourceLimits.maxAbsoluteCoordinatePm, `vertex/${index}/y`
    );
    const z = decimalCoordinatePicometres(
      vertex.getAttribute('z'), unit.picometres, resourceLimits.maxAbsoluteCoordinatePm, `vertex/${index}/z`
    );
    vertices[index * 3] = x;
    vertices[index * 3 + 1] = y;
    vertices[index * 3 + 2] = z;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  for (let index = 0; index < triangleElements.length; index += 1) {
    if ((index & 0xfff) === 0) {
      checkCancelled(cancellationFlag);
      if (progressCounter) {
        Atomics.store(progressCounter, 0, 3 + vertexElements.length + index);
      }
    }
    const triangle = triangleElements[index];
    allowedAttributes(triangle, ['v1', 'v2', 'v3', 'pid', 'p1', 'p2', 'p3']);
    indices[index * 3] = unsignedIndex(
      triangle.getAttribute('v1'), vertexElements.length, `triangle/${index}/v1`
    );
    indices[index * 3 + 1] = unsignedIndex(
      triangle.getAttribute('v2'), vertexElements.length, `triangle/${index}/v2`
    );
    indices[index * 3 + 2] = unsignedIndex(
      triangle.getAttribute('v3'), vertexElements.length, `triangle/${index}/v3`
    );
  }
  const items = directChildren(build, 'item');
  if (items.length !== 1 || build.children.length !== 1) {
    fail('MODEL_PROFILE_UNSUPPORTED', 'Exactly one 3MF build item is required');
  }
  allowedAttributes(items[0], ['objectid']);
  if (items[0].getAttribute('objectid') !== objectId || items[0].hasAttribute('transform')) {
    fail('MODEL_PROFILE_UNSUPPORTED', '3MF build item must reference the object without a transform');
  }

  const artifactHasher = taggedHasher(THREE_MF_PARSED_ARTIFACT_VERSION);
  const triangleHasher = taggedHasher(THREE_MF_PARSED_TRIANGLE_SET_VERSION);
  const scratch = new Uint8Array(8);
  updateUint32Le(artifactHasher, vertexElements.length, scratch);
  updateUint32Le(artifactHasher, triangleElements.length, scratch);
  updateUint32Le(triangleHasher, triangleElements.length, scratch);
  for (const coordinate of vertices) updateInt64Le(artifactHasher, coordinate, scratch);
  const triangleScratch = new BigInt64Array(9);
  for (let triangleIndex = 0; triangleIndex < triangleElements.length; triangleIndex += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = indices[triangleIndex * 3 + corner];
      updateUint32Le(artifactHasher, vertexIndex, scratch);
      for (let component = 0; component < 3; component += 1) {
        const coordinate = vertices[vertexIndex * 3 + component];
        triangleScratch[corner * 3 + component] = coordinate;
        updateInt64Le(triangleHasher, coordinate, scratch);
      }
    }
  }
  const byteSha256 = new IncrementalSha256().update(bytes).digestHex();
  const modelXmlByteSha256 = new IncrementalSha256().update(modelBytes).digestHex();
  const parsedArtifactSha256 = artifactHasher.digestHex();
  const parsedTriangleSetSha256 = triangleHasher.digestHex();
  const readTrianglePicometres = (
    triangleIndex: number,
    target: BigInt64Array,
    offset = 0
  ): void => {
    if (
      !Number.isSafeInteger(triangleIndex) ||
      triangleIndex < 0 ||
      triangleIndex >= triangleElements.length ||
      !(target instanceof BigInt64Array) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset + 9 > target.length
    ) {
      throw new RangeError('3MF triangle read request is out of range');
    }
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIndex = indices[triangleIndex * 3 + corner];
      target.set(vertices.subarray(vertexIndex * 3, vertexIndex * 3 + 3), offset + corner * 3);
    }
  };
  const forEachTrianglePicometres = (
    visitor: (triangle: BigInt64Array, triangleIndex: number) => void
  ): void => {
    if (typeof visitor !== 'function') throw new TypeError('Triangle visitor must be callable');
    const triangle = new BigInt64Array(9);
    for (let triangleIndex = 0; triangleIndex < triangleElements.length; triangleIndex += 1) {
      readTrianglePicometres(triangleIndex, triangle);
      visitor(triangle, triangleIndex);
    }
  };
  if (progressCounter) {
    Atomics.store(
      progressCounter,
      0,
      3 + vertexElements.length + triangleElements.length
    );
  }
  return Object.freeze({
    format: '3mf',
    parserMethod: '3mf-single-mesh-exact-picometre',
    parserVersion: THREE_MF_ARTIFACT_PARSER_VERSION,
    parserProofSha256: THREE_MF_ARTIFACT_PARSER_PROOF_SHA256,
    byteLength: bytes.byteLength,
    byteSha256,
    modelXmlByteSha256,
    modelUnit: unit.unit,
    unitPicometres: unit.picometres.toString(),
    vertexCount: vertexElements.length,
    triangleCount: triangleElements.length,
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

/** Parse exact final bytes and mint an unforgeable in-process 3MF proof session. */
export async function createThreeMfFinalArtifactProofSession(
  source: ArrayBuffer | Uint8Array,
  options: ParseThreeMfArtifactOptions = {}
): Promise<ThreeMfFinalArtifactProofSession> {
  const parsed = await parseThreeMfArtifact(source, options);
  const session = Object.freeze({
    version: THREE_MF_FINAL_ARTIFACT_PROOF_SESSION_VERSION,
    format: '3mf' as const,
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

export function parsedThreeMfArtifactForProofSession(
  session: ThreeMfFinalArtifactProofSession
): ParsedThreeMfArtifact {
  if (typeof session !== 'object' || session === null) {
    throw new TypeError('Final 3MF proof session is invalid');
  }
  const parsed = sessions.get(session);
  if (parsed === undefined) {
    throw new TypeError('Final 3MF proof session was not minted by the exact parser');
  }
  return parsed;
}
