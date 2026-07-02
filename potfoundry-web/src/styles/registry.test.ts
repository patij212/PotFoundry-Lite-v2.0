import { describe, it, expect } from 'vitest';
import { STYLE_REGISTRY, STYLE_CATEGORIES } from './registry';

describe('registry categories', () => {
  it('every style has a category and at least two tags', () => {
    for (const [key, cfg] of Object.entries(STYLE_REGISTRY)) {
      expect(cfg.category, key).toMatch(/^(organic|geometric|woven|architectural)$/);
      expect(cfg.tags?.length ?? 0, key).toBeGreaterThanOrEqual(2);
    }
  });
  it('exports the category chip list with All first', () => {
    expect(STYLE_CATEGORIES[0]).toEqual({ key: 'all', label: 'All' });
    expect(STYLE_CATEGORIES.length).toBe(5);
  });
  it('ids remain permanent (0-19, unique)', () => {
    const ids = Object.values(STYLE_REGISTRY).map((c) => c.id).sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});
