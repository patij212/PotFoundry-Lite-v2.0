/**
 * UI state slice for Zustand store.
 * 
 * Manages UI-related state including panel visibility, active tabs,
 * modals, and fullscreen mode.
 * 
 * @module state/slices/ui
 */

import { StateCreator } from 'zustand';
import {
  UIState,
  UITheme,
  V2Tab,
  UIDensity,
  GeometryParams,
  MeshQuality,
  StyleState,
  AppearanceState,
  DEFAULT_UI_STATE,
} from '../types';

// ============================================================================
// localStorage persistence helpers for v2 fields
// ============================================================================

const THEME_KEY = 'pf2-ui-theme';
const DENSITY_KEY = 'pf2-ui-density';
const HAPTICS_KEY = 'pf2-haptics-enabled';
const HISTORY_LIMIT = 50;

interface HistorySnapshot {
  geometry: GeometryParams;
  mesh: MeshQuality;
  style: StyleState;
  appearance: AppearanceState;
}

type HistoryStoreState = UISlice & {
  geometry: GeometryParams;
  mesh: MeshQuality;
  style: StyleState;
  appearance: AppearanceState;
};

function cloneSnapshot(snapshot: HistorySnapshot): HistorySnapshot {
  return {
    geometry: { ...snapshot.geometry },
    mesh: { ...snapshot.mesh },
    style: {
      name: snapshot.style.name,
      opts: { ...snapshot.style.opts },
    },
    appearance: { ...snapshot.appearance },
  };
}

function captureSnapshot(state: {
  geometry: GeometryParams;
  mesh: MeshQuality;
  style: StyleState;
  appearance: AppearanceState;
}): HistorySnapshot {
  return {
    geometry: { ...state.geometry },
    mesh: { ...state.mesh },
    style: {
      name: state.style.name,
      opts: { ...state.style.opts },
    },
    appearance: { ...state.appearance },
  };
}

function snapshotsEqual(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function appendSnapshot(
  stack: HistorySnapshot[],
  snapshot: HistorySnapshot
): HistorySnapshot[] {
  const snapshotClone = cloneSnapshot(snapshot);
  if (stack.length > 0 && snapshotsEqual(stack[stack.length - 1], snapshotClone)) {
    return stack;
  }
  const next = [...stack, snapshotClone];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function readStoredTheme(): UITheme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'v2') return 'v2';
  } catch { /* SSR / private mode */ }
  return 'classic';
}

function readStoredDensity(): UIDensity {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === 'compact' || v === 'comfortable' || v === 'spacious') return v;
  } catch { /* SSR / private mode */ }
  return 'comfortable';
}

function readStoredHaptics(): boolean {
  try {
    const v = localStorage.getItem(HAPTICS_KEY);
    if (v === 'false') return false;
    if (v === 'true') return true;
  } catch {
    // SSR / private mode
  }
  return true;
}

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * UI slice state and actions.
 */
export interface UISlice {
  /** Current UI state */
  ui: UIState;

  /** Undo snapshots stack (oldest -> newest). */
  historyPast: HistorySnapshot[];

  /** Redo snapshots stack (oldest -> newest). */
  historyFuture: HistorySnapshot[];

  /** Pending pre-interaction snapshot. */
  pendingSnapshot: HistorySnapshot | null;

  /**
   * Toggle the control panel visibility.
   */
  togglePanel: () => void;

  /**
   * Set the control panel visibility.
   * 
   * @param open - Whether the panel should be open
   */
  setPanelOpen: (open: boolean) => void;

  /**
   * Change the active tab in the control panel.
   * 
   * @param tab - Tab identifier
   */
  setActiveTab: (tab: UIState['activeTab']) => void;

  /**
   * Open a modal dialog.
   * 
   * @param modal - Modal identifier to open
   */
  openModal: (modal: NonNullable<UIState['modalOpen']>) => void;

  /**
   * Close the currently open modal.
   */
  closeModal: () => void;

  /**
   * Toggle fullscreen mode.
   */
  toggleFullscreen: () => void;

  /**
   * Set fullscreen mode.
   * 
   * @param fullscreen - Whether to enable fullscreen
   */
  setFullscreen: (fullscreen: boolean) => void;

  /**
   * Reset UI to default state.
   */
  resetUI: () => void;

  // --- v2 actions ---

  /**
   * Set the UI theme (classic / v2). Persisted to localStorage.
   */
  setUITheme: (theme: UITheme) => void;

  /**
   * Set the active tab in v2 sidebar.
   */
  setV2ActiveTab: (tab: V2Tab) => void;

  /**
   * Toggle Zen mode (full-screen viewport).
   */
  toggleZenMode: () => void;

  /**
   * Set display density. Persisted to localStorage.
   */
  setDensity: (density: UIDensity) => void;

  /**
   * Enable or disable haptics. Persisted to localStorage.
   */
  setHapticsEnabled: (enabled: boolean) => void;

  /**
   * Set the export format (stl, 3mf, obj).
   */
  setExportFormat: (format: UIState['exportFormat']) => void;

  /**
   * Capture one pre-interaction snapshot for undo history.
   */
  beginHistoryTransaction: () => void;

  /**
   * Commit a pending transaction if state has changed.
   */
  commitHistoryTransaction: () => void;

  /**
   * Undo the most recent committed snapshot.
   */
  undo: () => void;

  /**
   * Redo the most recently undone snapshot.
   */
  redo: () => void;
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the UI slice.
 */
export const createUISlice: StateCreator<
  HistoryStoreState,
  [],
  [],
  UISlice
> = (set, get) => ({
  ui: {
    ...DEFAULT_UI_STATE,
    uiTheme: readStoredTheme(),
    density: readStoredDensity(),
    hapticsEnabled: readStoredHaptics(),
  },
  historyPast: [],
  historyFuture: [],
  pendingSnapshot: null,

  togglePanel: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        panelOpen: !state.ui.panelOpen,
      },
    }));
  },

  setPanelOpen: (open) => {
    set((state) => ({
      ui: {
        ...state.ui,
        panelOpen: open,
      },
    }));
  },

  setActiveTab: (tab) => {
    set((state) => ({
      ui: {
        ...state.ui,
        activeTab: tab,
      },
    }));
  },

  openModal: (modal) => {
    set((state) => ({
      ui: {
        ...state.ui,
        modalOpen: modal,
      },
    }));
  },

  closeModal: () => {
    set((state) => ({
      ui: {
        ...state.ui,
        modalOpen: null,
      },
    }));
  },

  toggleFullscreen: () => {
    // IMPORTANT: Call fullscreen API SYNCHRONOUSLY before set() to preserve user gesture context.
    // Use document.fullscreenElement to check current state instead of React state.
    const isCurrentlyFullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
    const newFullscreen = !isCurrentlyFullscreen;

    console.log('[Fullscreen] Toggle called, current:', isCurrentlyFullscreen, 'new:', newFullscreen);

    // Helper to force canvas resize - call multiple times with delays to handle browser timing
    const forceCanvasResize = () => {
      console.log('[Fullscreen] Forcing canvas resize via window event');
      window.dispatchEvent(new Event('resize'));
    };

    // Call browser fullscreen API FIRST (synchronously)
    if (typeof document !== 'undefined') {
      try {
        if (newFullscreen) {
          const elem = document.documentElement;
          console.log('[Fullscreen] Requesting fullscreen on:', elem.tagName);
          if (elem.requestFullscreen) {
            elem.requestFullscreen().then(() => {
              console.log('[Fullscreen] Entered fullscreen successfully');
              // Force resize after entering fullscreen with multiple delays
              setTimeout(forceCanvasResize, 100);
              setTimeout(forceCanvasResize, 200);
              setTimeout(forceCanvasResize, 500);
            }).catch((err) => {
              console.warn('[Fullscreen] Request failed:', err);
            });
          } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
            console.log('[Fullscreen] Using webkit prefix');
            setTimeout(forceCanvasResize, 100);
            setTimeout(forceCanvasResize, 200);
            setTimeout(forceCanvasResize, 500);
          } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
            console.log('[Fullscreen] Using ms prefix');
            setTimeout(forceCanvasResize, 100);
            setTimeout(forceCanvasResize, 200);
            setTimeout(forceCanvasResize, 500);
          } else {
            console.warn('[Fullscreen] No fullscreen API available');
          }
        } else {
          console.log('[Fullscreen] Exiting fullscreen');
          if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
              console.log('[Fullscreen] Exited fullscreen successfully');
              setTimeout(forceCanvasResize, 100);
              setTimeout(forceCanvasResize, 200);
            }).catch((err) => {
              console.warn('[Fullscreen] Exit failed:', err);
            });
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
            setTimeout(forceCanvasResize, 100);
            setTimeout(forceCanvasResize, 200);
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
            setTimeout(forceCanvasResize, 100);
            setTimeout(forceCanvasResize, 200);
          }
        }
      } catch (err) {
        console.warn('[Fullscreen] Error:', err);
      }
    }

    // THEN update React state
    set((state) => ({
      ui: {
        ...state.ui,
        fullscreen: newFullscreen,
      },
    }));
  },

  setFullscreen: (fullscreen) => {
    set((state) => ({
      ui: {
        ...state.ui,
        fullscreen,
      },
    }));
  },

  resetUI: () => {
    set({ ui: { ...DEFAULT_UI_STATE } });
  },

  setUITheme: (theme) => {
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* noop */ }
    set((state) => ({
      ui: { ...state.ui, uiTheme: theme },
    }));
  },

  setV2ActiveTab: (tab) => {
    set((state) => ({
      ui: { ...state.ui, v2ActiveTab: tab },
    }));
  },

  toggleZenMode: () => {
    set((state) => ({
      ui: { ...state.ui, zenMode: !state.ui.zenMode },
    }));
  },

  setDensity: (density) => {
    try { localStorage.setItem(DENSITY_KEY, density); } catch { /* noop */ }
    set((state) => ({
      ui: { ...state.ui, density },
    }));
  },

  setHapticsEnabled: (enabled) => {
    try { localStorage.setItem(HAPTICS_KEY, String(enabled)); } catch { /* noop */ }
    set((state) => ({
      ui: { ...state.ui, hapticsEnabled: enabled },
    }));
  },

  setExportFormat: (format) => {
    set((state) => ({
      ui: { ...state.ui, exportFormat: format },
    }));
  },

  beginHistoryTransaction: () => {
    const state = get();
    if (state.pendingSnapshot) return;
    set({ pendingSnapshot: captureSnapshot(state) });
  },

  commitHistoryTransaction: () => {
    const state = get();
    if (!state.pendingSnapshot) return;

    const current = captureSnapshot(state);
    if (snapshotsEqual(state.pendingSnapshot, current)) {
      set({ pendingSnapshot: null });
      return;
    }

    set({
      historyPast: appendSnapshot(state.historyPast, state.pendingSnapshot),
      historyFuture: [],
      pendingSnapshot: null,
    });
  },

  undo: () => {
    const state = get();
    if (state.historyPast.length === 0) return;

    const previous = state.historyPast[state.historyPast.length - 1];
    const current = captureSnapshot(state);

    set({
      geometry: { ...previous.geometry },
      mesh: { ...previous.mesh },
      style: {
        name: previous.style.name,
        opts: { ...previous.style.opts },
      },
      appearance: { ...previous.appearance },
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: appendSnapshot(state.historyFuture, current),
      pendingSnapshot: null,
    });
  },

  redo: () => {
    const state = get();
    if (state.historyFuture.length === 0) return;

    const next = state.historyFuture[state.historyFuture.length - 1];
    const current = captureSnapshot(state);

    set({
      geometry: { ...next.geometry },
      mesh: { ...next.mesh },
      style: {
        name: next.style.name,
        opts: { ...next.style.opts },
      },
      appearance: { ...next.appearance },
      historyPast: appendSnapshot(state.historyPast, current),
      historyFuture: state.historyFuture.slice(0, -1),
      pendingSnapshot: null,
    });
  },
});
