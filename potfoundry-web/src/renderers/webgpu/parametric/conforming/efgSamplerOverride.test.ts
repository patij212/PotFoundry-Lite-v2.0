import { describe, it, expect } from 'vitest';
import { resolveEfgSampler } from './efgSamplerOverride';

const A = { position: () => [0, 0, 0] as const } as unknown as never;
const B = { position: () => [1, 1, 1] as const } as unknown as never;

describe('resolveEfgSampler', () => {
  it('returns undefined when no opts sampler and flag off (production byte-identical)', () => {
    expect(resolveEfgSampler(undefined, B, false)).toBeUndefined();
  });
  it('injects the surface sampler when the flag is on and none was provided', () => {
    expect(resolveEfgSampler(undefined, B, true)).toBe(B);
  });
  it('always prefers an explicitly-provided opts sampler', () => {
    expect(resolveEfgSampler(A, B, true)).toBe(A);
    expect(resolveEfgSampler(A, B, false)).toBe(A);
  });
});
