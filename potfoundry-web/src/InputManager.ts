/**
 * InputManager — Extracted from webgpu_core.ts Phase 2 decomposition.
 *
 * Owns keyboard input handling for camera controls:
 * - WASD/QE for free camera movement
 * - Number keys for view presets
 * - Space for auto-rotate toggle
 * - Shift for boost modifier
 *
 * @module InputManager
 */

import type { WebGPUState, WebGPUParams } from './types';

/** View preset type */
export type ViewPreset = 'fit' | 'top' | 'front' | 'right' | 'iso';

/**
 * Keys tracked for free camera movement.
 * Case-insensitive (normalized to lowercase).
 */
export const FREE_MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e', 'r', 'f']);

/**
 * State object tracking currently pressed movement keys and boost modifier.
 * This interface is shared with CameraController via controllerHelpers.
 */
export interface FreeKeyboardState {
  /** Set of currently pressed movement keys (lowercase) */
  activeKeys: Set<string>;
  /** True when Shift is held for boost mode */
  boost: boolean;
}

/**
 * Configuration for InputManager factory.
 */
export interface InputManagerConfig {
  /** State object for camera manipulation */
  state: WebGPUState;

  /**
   * Callback to get merged params (initialParams + current).
   * Used for scene extents calculation on fit view preset.
   */
  getParams: () => WebGPUParams;

  /** Callbacks for parent-scope functions */
  callbacks: {
    /** Mark user interaction (cancels auto-rotate, etc.) */
    markInteraction: (shouldCancel?: boolean) => void;
    /** Emit camera state update */
    emitCameraState: (force?: boolean) => void;
    /** Toggle auto-rotate on/off */
    toggleAutoRotate: () => void;
    /** Apply a camera view preset */
    applyViewPreset: (state: WebGPUState, preset: ViewPreset) => void;
  };

  /**
   * Helper to clamp numbers (imported from types but passed for decoupling).
   * Default: identity function.
   */
  clampNumber?: (value: number, defaultVal: number) => number;
}

/**
 * InputManager instance returned by factory.
 */
export interface InputManagerInstance {
  /**
   * Get the keyboard state object (pass to CameraController).
   * This returns the actual mutable reference, not a copy.
   */
  getKeyboardState: () => FreeKeyboardState;

  /**
   * Clear all pressed keys (call on blur, focus loss).
   */
  clearKeys: () => void;

  /**
   * Dispose the input manager and remove all event listeners.
   * CRITICAL: Must be called on unmount to prevent memory leaks.
   */
  dispose: () => void;
}

/**
 * Creates an InputManager instance that handles keyboard input for camera controls.
 *
 * @example
 * ```typescript
 * const inputManager = createInputManager({
 *   state,
 *   getParams: () => ({ ...initialParams, ...current }),
 *   callbacks: {
 *     markInteraction,
 *     emitCameraState,
 *     toggleAutoRotate,
 *   },
 * });
 *
 * // Pass keyboard state to CameraController
 * const controllerHelpers = {
 *   freeKeyboard: inputManager.getKeyboardState(),
 *   // ...
 * };
 *
 * // On unmount
 * inputManager.dispose();
 * ```
 */
export function createInputManager(config: InputManagerConfig): InputManagerInstance {
  const { state, getParams, callbacks, clampNumber = (v) => v } = config;
  const { markInteraction, emitCameraState, toggleAutoRotate, applyViewPreset } = callbacks;

  // === State ===
  const freeKeyboard: FreeKeyboardState = {
    activeKeys: new Set<string>(),
    boost: false,
  };

  // === Internal helpers ===
  const clearFreeMovementKeys = (): void => {
    freeKeyboard.activeKeys.clear();
    freeKeyboard.boost = false;
  };

  // === Event handlers ===

  /**
   * Handle keydown events for camera controls.
   * - Ignores input when focus is on text input elements
   * - WASD/QE for movement, Shift for boost
   * - Number keys for view presets
   * - Space for auto-rotate toggle
   */
  const handleKeydown = (event: KeyboardEvent): void => {
    const target = event.target;
    // Don't capture keys when user is typing in inputs
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }

    const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    // Shift for boost modifier
    if (normalizedKey === 'shift') {
      freeKeyboard.boost = true;
    }

    // Movement keys (WASD, QE, RF)
    if (FREE_MOVE_KEYS.has(normalizedKey)) {
      freeKeyboard.activeKeys.add(normalizedKey);
      markInteraction();
      event.preventDefault();
      return;
    }

    // View preset and control keys
    switch (event.key) {
      case '0':
        applyViewPreset(state, 'fit');
        // When user explicitly requests fit, compute and set the scene radius
        // to ensure both height and width are visible.
        try {
          const cfg = getParams();
          // Extract numeric values with safe fallbacks
          const rawH = typeof cfg.H === 'number' ? cfg.H : 120;
          const rawRt = typeof cfg.Rt === 'number' ? cfg.Rt : 70;
          const rawRb = typeof cfg.Rb === 'number' ? cfg.Rb : 45;
          const height = clampNumber(rawH, 120.0);
          const radiusTop = clampNumber(rawRt, 70.0);
          const radiusBottom = clampNumber(rawRb, 45.0);
          const safeHeight = Math.max(Math.abs(height), 1);
          const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
          const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
          const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
          state.sceneRadius = computedMaxWithHeight;
          state.cameraDirty = true;
        } catch (err) {
          /* ignore */
        }
        markInteraction();
        emitCameraState(true);
        break;
      case '1':
        applyViewPreset(state, 'top');
        markInteraction();
        emitCameraState(true);
        break;
      case '2':
        applyViewPreset(state, 'front');
        markInteraction();
        emitCameraState(true);
        break;
      case '3':
        applyViewPreset(state, 'right');
        markInteraction();
        emitCameraState(true);
        break;
      case '4':
        applyViewPreset(state, 'iso');
        markInteraction();
        emitCameraState(true);
        break;
      case ' ':
        toggleAutoRotate();
        markInteraction();
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  /**
   * Handle keyup events to release movement keys and boost.
   */
  const handleKeyup = (event: KeyboardEvent): void => {
    const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (normalizedKey === 'shift') {
      freeKeyboard.boost = false;
    }
    if (FREE_MOVE_KEYS.has(normalizedKey)) {
      freeKeyboard.activeKeys.delete(normalizedKey);
      event.preventDefault();
    }
  };

  /**
   * Handle window blur to clear all pressed keys.
   * Prevents stuck keys when user switches windows.
   */
  const handleWindowBlur = (): void => {
    clearFreeMovementKeys();
  };

  // === Attach listeners ===
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('keyup', handleKeyup);
  window.addEventListener('blur', handleWindowBlur);

  // === Return instance ===
  return {
    getKeyboardState: () => freeKeyboard,
    clearKeys: clearFreeMovementKeys,
    dispose: () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('keyup', handleKeyup);
      window.removeEventListener('blur', handleWindowBlur);
      clearFreeMovementKeys();
    },
  };
}
