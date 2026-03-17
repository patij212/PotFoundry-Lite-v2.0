/**
 * useConfidence — Progressive disclosure confidence tracker.
 *
 * Tracks user confidence level (0–3) based on interaction triggers.
 * Uses `useSyncExternalStore` for shared state across all consumers
 * without requiring a Context provider.
 *
 * Persists to localStorage under `pf2-user-confidence`.
 *
 * @module ui/v2/onboarding/useConfidence
 */

import { useCallback, useSyncExternalStore } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ConfidenceTrigger =
  | 'preset-load'
  | 'style-change'
  | 'dimension-change'
  | 'first-export'
  | 'deep-link'
  | 'library-load'
  | 'auto-unlock';

export interface UseConfidenceReturn {
  level: 0 | 1 | 2 | 3;
  unlock: (trigger: ConfidenceTrigger) => void;
  resetAll: () => void;
  isVisible: (sectionId: string) => boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'pf2-user-confidence';

/** Maps triggers to the confidence level they grant */
const TRIGGER_LEVELS: Record<ConfidenceTrigger, 0 | 1 | 2 | 3> = {
  'preset-load': 1,
  'style-change': 1,
  'dimension-change': 2,
  'first-export': 3,
  'deep-link': 3,
  'library-load': 3,
  'auto-unlock': 3,
};

/** Maps section IDs to the minimum confidence level required */
const SECTION_LEVELS: Record<string, number> = {
  // ShapeTab
  'shape:size': 0,
  'shape:thickness': 2,
  'shape:features': 2,
  'shape:bell-twist': 3,
  // StyleTab
  'style:style': 0,
  'style:colors': 2,
  'style:display': 2,
  'style:lighting': 3,
  'style:background': 3,
  // ExportTab
  'export:quality': 0,
  'export:format': 0, // Always show format selector (STL/3MF/OBJ)
  'export:advanced': 3,
};

// ============================================================================
// External store (shared across all hook instances)
// ============================================================================

type ConfidenceState = {
  level: 0 | 1 | 2 | 3;
  triggers: Set<ConfidenceTrigger>;
};

let listeners: Array<() => void> = [];
let state: ConfidenceState = loadState();

function loadState(): ConfidenceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { level: 0, triggers: new Set() };
    const parsed = JSON.parse(raw) as { level?: number; triggers?: string[] };
    const triggers = new Set<ConfidenceTrigger>(
      (parsed.triggers ?? []) as ConfidenceTrigger[]
    );
    const level = Math.max(
      0,
      Math.min(3, parsed.level ?? 0)
    ) as 0 | 1 | 2 | 3;
    return { level, triggers };
  } catch {
    return { level: 0, triggers: new Set() };
  }
}

function saveState(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        level: state.level,
        triggers: Array.from(state.triggers),
      })
    );
  } catch {
    // localStorage quota exceeded or blocked — silently fail
  }
}

function emitChange(): void {
  for (const fn of listeners) fn();
}

function getSnapshot(): ConfidenceState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

// ============================================================================
// Hook
// ============================================================================

export function useConfidence(): UseConfidenceReturn {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // C11 fix: Read from module-level `state` to avoid stale closure.
  // If two triggers fire in the same synchronous event cycle before
  // React re-renders, both are preserved.
  const unlock = useCallback((trigger: ConfidenceTrigger) => {
    if (state.triggers.has(trigger)) return;
    const prevLevel = state.level;
    const newTriggers = new Set(state.triggers);
    newTriggers.add(trigger);

    let newLevel: 0 | 1 | 2 | 3 = 0;
    for (const t of newTriggers) {
      const tLevel = TRIGGER_LEVELS[t];
      if (tLevel > newLevel) newLevel = tLevel as 0 | 1 | 2 | 3;
    }

    state = { level: newLevel, triggers: newTriggers };
    saveState();
    emitChange();

    // Dispatch event for toast/celebration when level increases
    if (newLevel > prevLevel) {
      window.dispatchEvent(
        new CustomEvent('pf2:confidence-unlock', {
          detail: { from: prevLevel, to: newLevel },
        })
      );
    }
  }, []);

  const resetAll = useCallback(() => {
    state = { level: 0, triggers: new Set() };
    saveState();
    emitChange();
  }, []);

  const isVisible = useCallback(
    (sectionId: string): boolean => {
      const required = SECTION_LEVELS[sectionId];
      if (required === undefined) return true;
      return current.level >= required;
    },
    [current.level]
  );

  return {
    level: current.level,
    unlock,
    resetAll,
    isVisible,
  };
}
