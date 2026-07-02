import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { safeStorage } from './safeStorage';

describe('safeStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('should return a stored value', () => {
      localStorage.setItem('test-key', 'test-value');
      expect(safeStorage.get('test-key')).toBe('test-value');
    });

    it('should return null for missing key', () => {
      expect(safeStorage.get('missing-key')).toBeNull();
    });

    it('should return null when localStorage.getItem throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Access denied');
      });
      expect(safeStorage.get('any-key')).toBeNull();
    });
  });

  describe('set', () => {
    it('should store a value', () => {
      safeStorage.set('test-key', 'test-value');
      expect(localStorage.getItem('test-key')).toBe('test-value');
    });

    it('should not throw when localStorage.setItem fails', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => safeStorage.set('test-key', 'test-value')).not.toThrow();
    });
  });

  describe('remove', () => {
    it('should remove a stored value', () => {
      localStorage.setItem('test-key', 'test-value');
      safeStorage.remove('test-key');
      expect(localStorage.getItem('test-key')).toBeNull();
    });

    it('should not throw when localStorage.removeItem fails', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Access denied');
      });
      expect(() => safeStorage.remove('test-key')).not.toThrow();
    });
  });

  describe('getSession', () => {
    it('should return a stored session value', () => {
      sessionStorage.setItem('session-key', 'session-value');
      expect(safeStorage.getSession('session-key')).toBe('session-value');
    });

    it('should return null for missing session key', () => {
      expect(safeStorage.getSession('missing-key')).toBeNull();
    });

    it('should return null when sessionStorage.getItem throws', () => {
      const mockSpy = vi.spyOn(Storage.prototype, 'getItem');
      mockSpy.mockImplementation(function (this: Storage) {
        if (this === sessionStorage) {
          throw new Error('Access denied');
        }
        return localStorage.getItem(this as any);
      });
      expect(safeStorage.getSession('any-key')).toBeNull();
      mockSpy.mockRestore();
    });
  });

  describe('setSession', () => {
    it('should store a session value', () => {
      safeStorage.setSession('session-key', 'session-value');
      expect(sessionStorage.getItem('session-key')).toBe('session-value');
    });

    it('should not throw when sessionStorage.setItem fails', () => {
      const mockSpy = vi.spyOn(Storage.prototype, 'setItem');
      mockSpy.mockImplementation(function (this: Storage) {
        if (this === sessionStorage) {
          throw new Error('QuotaExceededError');
        }
        return localStorage.setItem(this as any);
      });
      expect(() => safeStorage.setSession('session-key', 'session-value')).not.toThrow();
      mockSpy.mockRestore();
    });
  });

  describe('round-trip', () => {
    it('should round-trip a value through localStorage', () => {
      const value = 'round-trip-value';
      safeStorage.set('trip-key', value);
      expect(safeStorage.get('trip-key')).toBe(value);
    });

    it('should round-trip a value through sessionStorage', () => {
      const value = 'session-trip-value';
      safeStorage.setSession('session-trip-key', value);
      expect(safeStorage.getSession('session-trip-key')).toBe(value);
    });
  });
});
