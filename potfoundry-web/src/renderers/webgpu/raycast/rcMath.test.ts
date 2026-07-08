import { describe, it, expect } from 'vitest';
import { invertMat4, halton, decodeF16Array } from './rcMath';

describe('invertMat4', () => {
  it('inverts identity to identity', () => {
    const I = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    expect(Array.from(invertMat4(I)!)).toEqual(Array.from(I));
  });
  it('M * inv(M) = I for a perspective-like matrix', () => {
    // column-major: scale + translate + w-coupling (perspective-ish, invertible)
    const M = new Float32Array([
      1.2, 0,   0,    0,
      0,   2.1, 0,    0,
      0,   0,  -1.02, -1,
      0.3, -0.5, -2.02, 0,
    ]);
    const inv = invertMat4(M)!;
    // multiply column-major: (M*inv)[col j][row i] = sum_k M[k*4+i]*inv[j*4+k]
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < 4; i++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += M[k * 4 + i] * inv[j * 4 + k];
        expect(s).toBeCloseTo(i === j ? 1 : 0, 4);
      }
    }
  });
  it('returns null for singular matrix', () => {
    expect(invertMat4(new Float32Array(16))).toBeNull();
  });
});

describe('halton', () => {
  it('produces the base-2 radical inverse', () => {
    expect(halton(1, 2)).toBeCloseTo(0.5);
    expect(halton(2, 2)).toBeCloseTo(0.25);
    expect(halton(3, 2)).toBeCloseTo(0.75);
    expect(halton(4, 2)).toBeCloseTo(0.125);
  });
  it('produces the base-3 radical inverse', () => {
    expect(halton(1, 3)).toBeCloseTo(1 / 3);
    expect(halton(2, 3)).toBeCloseTo(2 / 3);
    expect(halton(3, 3)).toBeCloseTo(1 / 9);
  });
  it('index 0 is 0', () => {
    expect(halton(0, 2)).toBe(0);
  });
});

describe('decodeF16Array', () => {
  it('decodes known half-float bit patterns', () => {
    // 0x3C00 = 1.0, 0xC000 = -2.0, 0x0000 = 0, 0x3800 = 0.5
    const out = decodeF16Array(new Uint16Array([0x3c00, 0xc000, 0x0000, 0x3800]));
    expect(Array.from(out)).toEqual([1, -2, 0, 0.5]);
  });
  it('decodes subnormals and infinity', () => {
    const out = decodeF16Array(new Uint16Array([0x0001, 0x7c00]));
    expect(out[0]).toBeCloseTo(5.960464477539063e-8);
    expect(out[1]).toBe(Infinity);
  });
});
