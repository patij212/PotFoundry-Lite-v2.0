import { IncrementalSha256 } from './incrementalSha256';

export const CANONICAL_CERTIFICATION_JSON_VERSION =
  'potfoundry.canonical-certification-json/v1' as const;
export const MAX_CERTIFICATION_JSON_UTF8_BYTES = 1_048_576;
export const MAX_CERTIFICATION_JSON_CODE_UNITS = 1_048_576;
export const MAX_CERTIFICATION_JSON_DEPTH = 64;
export const MAX_CERTIFICATION_JSON_NODES = 100_000;
export const MAX_CERTIFICATION_JSON_ARRAY_LENGTH = 8_192;
export const MAX_CERTIFICATION_JSON_OBJECT_KEYS = 128;
export const MAX_CERTIFICATION_JSON_STRING_CODE_UNITS = 4_096;

export type CanonicalJsonValue =
  | null
  | boolean
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export type CanonicalJsonParseResult =
  | { readonly ok: true; readonly value: CanonicalJsonValue; readonly canonicalJson: string }
  | { readonly ok: false; readonly reason: string };

interface CanonicalizationState {
  nodeCount: number;
  totalStringCodeUnits: number;
}

class CanonicalJsonError extends Error {}

function encodeCanonical(
  value: unknown,
  depth: number,
  state: CanonicalizationState,
  freeze: boolean
): string {
  state.nodeCount += 1;
  if (state.nodeCount > MAX_CERTIFICATION_JSON_NODES) {
    throw new CanonicalJsonError('Canonical JSON exceeds the node limit');
  }
  if (depth > MAX_CERTIFICATION_JSON_DEPTH) {
    throw new CanonicalJsonError('Canonical JSON exceeds the depth limit');
  }
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    if (value.length > MAX_CERTIFICATION_JSON_STRING_CODE_UNITS) {
      throw new CanonicalJsonError('Canonical JSON contains an oversized string');
    }
    state.totalStringCodeUnits += value.length;
    if (state.totalStringCodeUnits > MAX_CERTIFICATION_JSON_CODE_UNITS) {
      throw new CanonicalJsonError('Canonical JSON exceeds the aggregate string limit');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    throw new CanonicalJsonError(
      'JSON numbers are forbidden; exact integers and decimal quantities must be strings'
    );
  }
  if (typeof value !== 'object') {
    throw new CanonicalJsonError('Canonical JSON contains a non-JSON value');
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_CERTIFICATION_JSON_ARRAY_LENGTH) {
      throw new CanonicalJsonError('Canonical JSON contains an oversized array');
    }
    const encoded = value.map((entry) => encodeCanonical(entry, depth + 1, state, freeze));
    if (freeze) Object.freeze(value);
    return `[${encoded.join(',')}]`;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    throw new CanonicalJsonError('Canonical JSON objects must have the ordinary JSON prototype');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > MAX_CERTIFICATION_JSON_OBJECT_KEYS) {
    throw new CanonicalJsonError('Canonical JSON contains an object with too many keys');
  }
  keys.sort();
  const encoded: string[] = [];
  for (const key of keys) {
    if (key.length > MAX_CERTIFICATION_JSON_STRING_CODE_UNITS) {
      throw new CanonicalJsonError('Canonical JSON contains an oversized object key');
    }
    state.totalStringCodeUnits += key.length;
    if (state.totalStringCodeUnits > MAX_CERTIFICATION_JSON_CODE_UNITS) {
      throw new CanonicalJsonError('Canonical JSON exceeds the aggregate string limit');
    }
    encoded.push(
      `${JSON.stringify(key)}:${encodeCanonical(record[key], depth + 1, state, freeze)}`
    );
  }
  if (freeze) Object.freeze(record);
  return `{${encoded.join(',')}}`;
}

/** Canonicalize inert JSON data. JSON numbers are intentionally unsupported. */
export function canonicalizeCertificationJson(value: unknown): string {
  return encodeCanonical(value, 0, { nodeCount: 0, totalStringCodeUnits: 0 }, false);
}

/**
 * Parse only canonical, bounded JSON text. Non-string values are refused using
 * `typeof` alone, so caller-controlled Proxy traps are never inspected.
 */
export function parseCanonicalCertificationJson(source: unknown): CanonicalJsonParseResult {
  if (typeof source !== 'string') {
    return Object.freeze({ ok: false, reason: 'Certification input must be canonical JSON text' });
  }
  if (source.length > MAX_CERTIFICATION_JSON_CODE_UNITS) {
    return Object.freeze({ ok: false, reason: 'Certification JSON exceeds the code-unit limit' });
  }
  const utf8Length = new TextEncoder().encode(source).byteLength;
  if (utf8Length > MAX_CERTIFICATION_JSON_UTF8_BYTES) {
    return Object.freeze({ ok: false, reason: 'Certification JSON exceeds the UTF-8 byte limit' });
  }

  try {
    const value = JSON.parse(source) as unknown;
    const canonicalJson = encodeCanonical(
      value,
      0,
      { nodeCount: 0, totalStringCodeUnits: 0 },
      true
    );
    if (canonicalJson !== source) {
      return Object.freeze({
        ok: false,
        reason: 'Certification JSON is not canonical or contains duplicate object keys',
      });
    }
    return Object.freeze({ ok: true, value: value as CanonicalJsonValue, canonicalJson });
  } catch (error) {
    return Object.freeze({
      ok: false,
      reason: error instanceof CanonicalJsonError ? error.message : 'Certification JSON is invalid',
    });
  }
}

function updateLength(hasher: IncrementalSha256, length: number): void {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, length, false);
  hasher.update(bytes);
}

/** Hash canonical JSON with explicit byte-length framing and domain separation. */
export function domainSeparatedCanonicalJsonSha256(domain: string, value: unknown): string {
  if (!/^[a-z0-9][a-z0-9./:-]{0,127}$/.test(domain)) {
    throw new TypeError('Canonical hash domain must be bounded lowercase ASCII');
  }
  const canonicalJson = canonicalizeCertificationJson(value);
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${CANONICAL_CERTIFICATION_JSON_VERSION}\0`);
  const domainBytes = encoder.encode(domain);
  const payloadBytes = encoder.encode(canonicalJson);
  const hasher = new IncrementalSha256().update(prefix);
  updateLength(hasher, domainBytes.byteLength);
  hasher.update(domainBytes);
  updateLength(hasher, payloadBytes.byteLength);
  hasher.update(payloadBytes);
  return hasher.digestHex();
}
