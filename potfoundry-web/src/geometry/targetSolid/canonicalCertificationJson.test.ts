import { describe, expect, it } from 'vitest';
import {
  canonicalizeCertificationJson,
  domainSeparatedCanonicalJsonSha256,
  MAX_CERTIFICATION_JSON_CODE_UNITS,
  parseCanonicalCertificationJson,
} from './canonicalCertificationJson';

describe('canonical certification JSON', () => {
  it('sorts keys, preserves ordered arrays, and deeply freezes parsed data', () => {
    const value = { z: ['2', '1'], a: { y: false, x: '0' } };
    const canonical = canonicalizeCertificationJson(value);
    expect(canonical).toBe('{"a":{"x":"0","y":false},"z":["2","1"]}');
    const parsed = parseCanonicalCertificationJson(canonical);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen((parsed.value as { a: object }).a)).toBe(true);
    expect(Object.isFrozen((parsed.value as { z: unknown[] }).z)).toBe(true);
  });

  it('rejects whitespace, unsorted keys, duplicates, and every JSON number token', () => {
    const candidates = [
      '{ "a":"1"}',
      '{"b":"2","a":"1"}',
      '{"a":"1","a":"1"}',
      '{"a":1}',
      '{"a":0.999999999999999999}',
      '{"a":-0}',
      '{"a":1e0}',
    ];
    for (const candidate of candidates)
      expect(parseCanonicalCertificationJson(candidate).ok).toBe(false);
  });

  it('refuses caller objects and Proxies without executing reflection traps', () => {
    let trapCalls = 0;
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf() {
          trapCalls += 1;
          throw new Error('must not execute');
        },
        ownKeys() {
          trapCalls += 1;
          return [];
        },
      }
    );
    expect(parseCanonicalCertificationJson(hostile).ok).toBe(false);
    expect(trapCalls).toBe(0);
  });

  it('enforces size and structural limits before returning data', () => {
    expect(
      parseCanonicalCertificationJson('x'.repeat(MAX_CERTIFICATION_JSON_CODE_UNITS + 1)).ok
    ).toBe(false);
    const tooDeep = `${'['.repeat(70)}null${']'.repeat(70)}`;
    expect(parseCanonicalCertificationJson(tooDeep).ok).toBe(false);
    expect(() => canonicalizeCertificationJson({ value: Number.NaN })).toThrow(
      /numbers are forbidden/
    );
  });

  it('uses framed domain separation', () => {
    const value = { a: '1' };
    const first = domainSeparatedCanonicalJsonSha256('potfoundry.test/a', value);
    const second = domainSeparatedCanonicalJsonSha256('potfoundry.test/b', value);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(first).toBe(domainSeparatedCanonicalJsonSha256('potfoundry.test/a', { a: '1' }));
  });
});
