import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IncrementalSha256, sha256Hex, sha256Utf8 } from './incrementalSha256';

const utf8 = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('IncrementalSha256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('matches the NIST vector for %j', (message, expected) => {
    expect(sha256Utf8(message)).toBe(expected);
  });

  it('is invariant to every chunk boundary around the 64-byte block size', () => {
    const bytes = Uint8Array.from({ length: 513 }, (_unused, index) => (index * 73 + 19) & 0xff);
    const expected = createHash('sha256').update(bytes).digest('hex');

    for (const chunkSize of [1, 2, 3, 7, 31, 55, 56, 63, 64, 65, 127, 128, 255]) {
      const hasher = new IncrementalSha256();
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        hasher.update(bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
      }
      expect(hasher.digestHex(), `chunkSize=${chunkSize}`).toBe(expected);
    }
  });

  it('matches Node for a million-byte stream and refuses reuse after finalization', () => {
    const chunk = utf8('a'.repeat(1000));
    const hasher = new IncrementalSha256();
    for (let index = 0; index < 1000; index += 1) hasher.update(chunk);
    expect(hasher.digestHex()).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
    );
    expect(() => hasher.update(chunk)).toThrow(/already finalized/);
    expect(() => hasher.digest()).toThrow(/already finalized/);
  });

  it('hashes Uint8Array views without reading outside their byte range', () => {
    const backing = utf8('prefix-payload-suffix');
    const payload = backing.subarray(7, 14);
    expect(sha256Hex(payload)).toBe(createHash('sha256').update('payload').digest('hex'));

    const ranged = new IncrementalSha256().update(backing, 7, 7).digestHex();
    expect(ranged).toBe(createHash('sha256').update('payload').digest('hex'));
    expect(() => new IncrementalSha256().update(backing, 7, 999)).toThrow(/outside/);
  });
});
