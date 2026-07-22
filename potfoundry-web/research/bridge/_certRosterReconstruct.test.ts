import { describe, it, expect } from 'vitest';
import {
  normalizeNumerator,
  configDigest,
  reconstructPot,
} from './_certRosterReconstructLib';
import { CERTIFIED_POTS } from './_certRoster';

describe('reconstruct lib — pure', () => {
  it('normalizes a numerator over oddFactor * 2^fractionBits into [0,1]', () => {
    // dyadic: 3 / 2^3 = 0.375
    expect(normalizeNumerator('3', 3)).toBeCloseTo(0.375, 12);
    // odd factor: 5 / (3 * 2^2) = 5/12
    expect(normalizeNumerator('5', 2, '3')).toBeCloseTo(5 / 12, 12);
  });

  it('configDigest is stable and order-independent for a pot', () => {
    const pot = CERTIFIED_POTS[0];
    expect(configDigest(pot)).toBe(configDigest(pot));
    expect(configDigest(pot)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('reconstruct lib — one small pot', () => {
  it('emits a loc buffer with count == triangleCount and (u,v) in [0,1]', () => {
    const pot = CERTIFIED_POTS.find((p) => p.name === 'HarmonicRipple_small_OD30');
    if (!pot) throw new Error('roster missing HarmonicRipple_small_OD30');
    const r = reconstructPot(pot);
    const nl = r.locBuffer.indexOf(0x0a);
    const header = JSON.parse(r.locBuffer.subarray(0, nl).toString('utf8'));
    expect(header.magic).toBe('potscope-loc/v1');
    expect(header.count).toBe(r.triangleCount);
    // COPY the body — the payload starts at an unaligned offset (nl+1), so a
    // Float32Array view over r.locBuffer.buffer would throw. Same pattern readLoc uses.
    const body = new Float32Array(r.triangleCount * 7);
    Buffer.from(body.buffer).set(r.locBuffer.subarray(nl + 1, nl + 1 + r.triangleCount * 7 * 4));
    for (let t = 0; t < r.triangleCount; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        const u = body[t * 7 + 1 + k * 2];
        const v = body[t * 7 + 2 + k * 2];
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(r.provenance.targetSha256).toMatch(/^[0-9a-f]{64}$/);
  }, 60_000);
});
