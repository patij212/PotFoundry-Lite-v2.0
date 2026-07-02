/**
 * Safe wrapper around localStorage and sessionStorage.
 * All methods catch exceptions (private mode, quota exceeded, etc.) and
 * fail silently rather than throwing.
 *
 * @module ui/v3/utils/safeStorage
 */

/**
 * Safe storage operations that catch and suppress exceptions.
 */
export const safeStorage = {
  /**
   * Get a value from localStorage.
   * @param key - The key to retrieve
   * @returns The stored value, or null if not found or on error
   */
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      // SSR, private mode, quota exceeded, etc.
      return null;
    }
  },

  /**
   * Set a value in localStorage.
   * @param key - The key to set
   * @param value - The value to store
   */
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // SSR, private mode, quota exceeded, etc. — no-op
    }
  },

  /**
   * Remove a value from localStorage.
   * @param key - The key to remove
   */
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // SSR, private mode, etc. — no-op
    }
  },

  /**
   * Get a value from sessionStorage.
   * @param key - The key to retrieve
   * @returns The stored value, or null if not found or on error
   */
  getSession(key: string): string | null {
    try {
      return sessionStorage.getItem(key);
    } catch {
      // SSR, private mode, quota exceeded, etc.
      return null;
    }
  },

  /**
   * Set a value in sessionStorage.
   * @param key - The key to set
   * @param value - The value to store
   */
  setSession(key: string, value: string): void {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      // SSR, private mode, quota exceeded, etc. — no-op
    }
  },
};
