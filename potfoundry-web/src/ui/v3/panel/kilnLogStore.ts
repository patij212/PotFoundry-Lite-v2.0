/**
 * Kiln log: persists the last 10 successful export firings.
 *
 * Storage key: `pf3-kiln-log` (localStorage via safeStorage).
 * Corrupted or non-array JSON silently returns an empty list.
 *
 * @module ui/v3/panel/kilnLogStore
 */

import { safeStorage } from '../utils/safeStorage';
import type { ExportFormat } from '../../../geometry/stlExport';

const LOG_KEY = 'pf3-kiln-log';
const MAX_ENTRIES = 10;

/** One entry in the kiln log, recorded at the moment of a successful export. */
export interface KilnEntry {
  filename: string;
  /** Export format used for this firing. Legacy entries without a format read as STL. */
  format: ExportFormat;
  sizeLabel: string;
  triangles: number;
  /** Active fidelity preset key at fire time; 'custom' if no preset matched. */
  fidelity: string;
  /** `Date.now()` at the moment `recordFiring` was called. */
  firedAt: number;
  /** `true` unless `validationSummary.valid === false`. */
  ok: boolean;
}

function normalizeFormat(format: unknown): ExportFormat {
  return format === '3mf' || format === 'obj' || format === 'stl' ? format : 'stl';
}

function normalizeEntry(entry: KilnEntry): KilnEntry {
  return {
    ...entry,
    format: normalizeFormat(entry.format),
  };
}

/** Returns the stored kiln log, most recent first. Returns `[]` on error or empty storage. */
export function getKilnLog(): KilnEntry[] {
  const raw = safeStorage.get(LOG_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as KilnEntry[]).map(normalizeEntry) : [];
  } catch {
    return [];
  }
}

/**
 * Prepends `entry` to the kiln log, caps at 10 entries, and persists.
 * @returns The new log (most recent first).
 */
export function recordFiring(entry: KilnEntry): KilnEntry[] {
  const next = [entry, ...getKilnLog()].slice(0, MAX_ENTRIES);
  safeStorage.set(LOG_KEY, JSON.stringify(next));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pf3:kiln-updated'));
  }
  return next;
}
