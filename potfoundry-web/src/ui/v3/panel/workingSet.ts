/**
 * Working set: favorites and recents persistence.
 *
 * All state is stored in localStorage via safeStorage (keys `pf3-favorites` /
 * `pf3-recents`). Corrupted or non-array JSON silently returns an empty list.
 *
 * @module ui/v3/panel/workingSet
 */

import { safeStorage } from '../utils/safeStorage';

const FAV_KEY = 'pf3-favorites';
const REC_KEY = 'pf3-recents';
const MAX_RECENTS = 8;

function readList(key: string): string[] {
  const raw = safeStorage.get(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/** Returns the current favorites list, most recently added first. */
export function getFavorites(): string[] {
  return readList(FAV_KEY);
}

/**
 * Toggles a style in favorites.
 * Adds to the front if absent; removes if present.
 * @returns The new favorites list.
 */
export function toggleFavorite(name: string): string[] {
  const favs = getFavorites();
  const next = favs.includes(name)
    ? favs.filter((f) => f !== name)
    : [name, ...favs];
  safeStorage.set(FAV_KEY, JSON.stringify(next));
  return next;
}

/** Returns true if the style is currently favorited. */
export function isFavorite(name: string): boolean {
  return getFavorites().includes(name);
}

/** Returns the recent styles list, most recent first. Max 8, deduped. */
export function getRecents(): string[] {
  return readList(REC_KEY);
}

/**
 * Adds a style to the front of the recents list.
 * Dedupes (moves existing entry to front) and caps at 8.
 * @returns The new recents list.
 */
export function pushRecent(name: string): string[] {
  const recents = getRecents().filter((r) => r !== name);
  const next = [name, ...recents].slice(0, MAX_RECENTS);
  safeStorage.set(REC_KEY, JSON.stringify(next));
  return next;
}
