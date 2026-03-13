import { useState, useEffect, useCallback } from 'react';

/** Supported color mode preferences. */
export type ColorMode = 'light' | 'dark' | 'system';

/** The resolved visual theme after system preference resolution. */
export type ResolvedTheme = 'light' | 'dark';

/** Return type of the useColorMode hook. */
export interface UseColorModeReturn {
  /** Current user preference: 'light', 'dark', or 'system'. */
  colorMode: ColorMode;
  /** Resolved theme after evaluating system preference. Always 'light' or 'dark'. */
  resolvedTheme: ResolvedTheme;
  /** Cycle through modes: system → light → dark → system. */
  cycleColorMode: () => void;
  /** Set color mode directly and persist to localStorage. */
  setColorMode: (mode: ColorMode) => void;
}

const STORAGE_KEY = 'pf2-color-mode';
const CYCLE_ORDER: ColorMode[] = ['system', 'light', 'dark'];
const DARK_MQ = '(prefers-color-scheme: dark)';

function readStoredMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR, iframe sandbox, etc.)
  }
  return 'system';
}

function persistMode(mode: ColorMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Silently ignore storage errors
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia(DARK_MQ).matches ? 'dark' : 'light';
}

/**
 * Manages color mode state with localStorage persistence and
 * system preference tracking.
 *
 * Returns the current mode, the resolved theme ('light' | 'dark'),
 * and a cycle function (system → light → dark → system).
 *
 * **Note**: This hook does NOT imperatively set `data-theme` on the
 * document. The consuming component is responsible for applying
 * `data-theme={resolvedTheme}` via React props.
 */
export function useColorMode(): UseColorModeReturn {
  const [colorMode, setColorMode] = useState<ColorMode>(readStoredMode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  // Listen for OS-level preference changes
  useEffect(() => {
    const mql = window.matchMedia(DARK_MQ);
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: ResolvedTheme =
    colorMode === 'system' ? systemTheme : colorMode;

  const cycleColorMode = useCallback(() => {
    setColorMode((prev) => {
      const idx = CYCLE_ORDER.indexOf(prev);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
      persistMode(next);
      return next;
    });
  }, []);

  const setColorModeDirect = useCallback((mode: ColorMode) => {
    persistMode(mode);
    setColorMode(mode);
  }, []);

  return { colorMode, resolvedTheme, cycleColorMode, setColorMode: setColorModeDirect };
}
