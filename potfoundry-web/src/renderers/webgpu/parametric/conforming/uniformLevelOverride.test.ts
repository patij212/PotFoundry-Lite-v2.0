import { describe, it, expect } from 'vitest';
import { resolveUniformLevelOverride } from './uniformLevelOverride';

describe('resolveUniformLevelOverride', () => {
  it('returns undefined when neither crease-derived level nor override is set', () => {
    expect(resolveUniformLevelOverride(0, 0)).toBeUndefined();
  });
  it('returns the crease-derived level when no override (production byte-identical)', () => {
    expect(resolveUniformLevelOverride(5, 0)).toBe(5);
  });
  it('returns the override when it exceeds the crease-derived level', () => {
    expect(resolveUniformLevelOverride(0, 8)).toBe(8);
    expect(resolveUniformLevelOverride(5, 8)).toBe(8);
  });
  it('never lowers the crease-derived floor', () => {
    expect(resolveUniformLevelOverride(7, 3)).toBe(7);
  });
});
