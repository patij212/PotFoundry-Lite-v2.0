import { describe, it, expect, beforeAll } from 'vitest';

let markUniformParityRewriteNeeded: (state: any) => void;
let clearUniformParityRewriteFlag: (state: any) => void;
let isUniformParityRewritePending: (state: any) => boolean;

beforeAll(async () => {
  (globalThis as any).window = globalThis as any;
  const module = await import('../webgpu_core');
  const hooks = module.__axisParityTestHooks;
  markUniformParityRewriteNeeded = hooks.markUniformParityRewriteNeeded;
  clearUniformParityRewriteFlag = hooks.clearUniformParityRewriteFlag;
  isUniformParityRewritePending = hooks.isUniformParityRewritePending;
});

describe('uniform parity rewrite flag helpers', () => {
  it('marks and clears pending uniform rewrites', () => {
    const state: any = { cameraDirty: false };
    expect(isUniformParityRewritePending(state)).toBe(false);
    markUniformParityRewriteNeeded(state);
    expect(state.cameraDirty).toBe(true);
    expect(isUniformParityRewritePending(state)).toBe(true);
    clearUniformParityRewriteFlag(state);
    expect(isUniformParityRewritePending(state)).toBe(false);
    // Clearing twice remains stable
    clearUniformParityRewriteFlag(state);
    expect(isUniformParityRewritePending(state)).toBe(false);
  });
});
