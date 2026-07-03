import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFavorites,
  toggleFavorite,
  isFavorite,
  getRecents,
  pushRecent,
} from './workingSet';

describe('workingSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── favorites ──────────────────────────────────────────────────────────────

  describe('favorites', () => {
    it('starts empty', () => {
      expect(getFavorites()).toEqual([]);
    });

    it('isFavorite returns false when not favorited', () => {
      expect(isFavorite('HarmonicRipple')).toBe(false);
    });

    it('toggleFavorite adds a style and isFavorite returns true', () => {
      const result = toggleFavorite('HarmonicRipple');
      expect(result).toEqual(['HarmonicRipple']);
      expect(isFavorite('HarmonicRipple')).toBe(true);
    });

    it('toggleFavorite removes a style (round-trip)', () => {
      toggleFavorite('HarmonicRipple');
      const result = toggleFavorite('HarmonicRipple');
      expect(result).toEqual([]);
      expect(isFavorite('HarmonicRipple')).toBe(false);
    });

    it('toggleFavorite prepends new favorites', () => {
      toggleFavorite('HarmonicRipple');
      const result = toggleFavorite('GothicArches');
      expect(result).toEqual(['GothicArches', 'HarmonicRipple']);
    });

    it('toggleFavorite removing middle entry preserves order', () => {
      toggleFavorite('A');
      toggleFavorite('B');
      toggleFavorite('C');
      // list is now ['C', 'B', 'A']
      const result = toggleFavorite('B');
      expect(result).toEqual(['C', 'A']);
    });

    it('corrupted JSON in favorites key → getFavorites returns []', () => {
      localStorage.setItem('pf3-favorites', '{ not json [');
      expect(getFavorites()).toEqual([]);
    });

    it('non-array JSON in favorites key → getFavorites returns []', () => {
      localStorage.setItem('pf3-favorites', '{"style": "HarmonicRipple"}');
      expect(getFavorites()).toEqual([]);
    });
  });

  // ── recents ───────────────────────────────────────────────────────────────

  describe('recents', () => {
    it('starts empty', () => {
      expect(getRecents()).toEqual([]);
    });

    it('pushRecent adds a style at the front', () => {
      const result = pushRecent('HarmonicRipple');
      expect(result).toEqual(['HarmonicRipple']);
      expect(getRecents()[0]).toBe('HarmonicRipple');
    });

    it('pushRecent dedupes — existing entry is moved to front', () => {
      pushRecent('A');
      pushRecent('B');
      pushRecent('C');
      const result = pushRecent('A');
      expect(result[0]).toBe('A');
      expect(result.filter((r) => r === 'A').length).toBe(1);
    });

    it('pushRecent caps at 8 entries (overflow is dropped from tail)', () => {
      for (let i = 0; i < 10; i++) {
        pushRecent(`Style${i}`);
      }
      const recents = getRecents();
      expect(recents.length).toBe(8);
      // Most-recent entry was Style9
      expect(recents[0]).toBe('Style9');
    });

    it('corrupted JSON in recents key → getRecents returns []', () => {
      localStorage.setItem('pf3-recents', '[ bad json }');
      expect(getRecents()).toEqual([]);
    });

    it('non-array JSON in recents key → getRecents returns []', () => {
      localStorage.setItem('pf3-recents', '"just a string"');
      expect(getRecents()).toEqual([]);
    });
  });
});
