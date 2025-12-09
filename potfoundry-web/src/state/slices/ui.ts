/**
 * UI state slice for Zustand store.
 * 
 * Manages UI-related state including panel visibility, active tabs,
 * modals, and fullscreen mode.
 * 
 * @module state/slices/ui
 */

import { StateCreator } from 'zustand';
import { UIState, DEFAULT_UI_STATE } from '../types';

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * UI slice state and actions.
 */
export interface UISlice {
  /** Current UI state */
  ui: UIState;

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
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the UI slice.
 */
export const createUISlice: StateCreator<
  UISlice,
  [],
  [],
  UISlice
> = (set) => ({
  ui: { ...DEFAULT_UI_STATE },

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
          } else if ((elem as any).webkitRequestFullscreen) {
            (elem as any).webkitRequestFullscreen();
            console.log('[Fullscreen] Using webkit prefix');
            setTimeout(forceCanvasResize, 100);
            setTimeout(forceCanvasResize, 200);
            setTimeout(forceCanvasResize, 500);
          } else if ((elem as any).msRequestFullscreen) {
            (elem as any).msRequestFullscreen();
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
          } else if ((document as any).webkitExitFullscreen) {
            (document as any).webkitExitFullscreen();
            setTimeout(forceCanvasResize, 100);
            setTimeout(forceCanvasResize, 200);
          } else if ((document as any).msExitFullscreen) {
            (document as any).msExitFullscreen();
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
});
