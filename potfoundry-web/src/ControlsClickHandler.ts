/**
 * @fileoverview ControlsClickHandler — Extracted controls bar click handling
 *
 * Routes click events on controls bar buttons to appropriate action handlers.
 * Each action (view preset, projection toggle, debug toggle, etc.) is delegated
 * to a callback, keeping the routing logic clean and testable.
 *
 * @module ControlsClickHandler
 */

import type { CameraMode } from './types';

/** Configuration for creating a ControlsClickHandler */
export interface ControlsClickHandlerConfig {
  /** The controls root element to attach listener to */
  controlsRoot: HTMLElement | null;
  /** Optional canvas ID for diagnostics */
  canvasId?: string;
  /** Get current camera mode */
  getCameraMode: () => CameraMode;
  /** Get whether arcball is the preferred orbit mode */
  getUseArcball: () => boolean;
  /** Handle view preset selection (fit, top, front, etc.) */
  onViewPreset: (preset: string) => void;
  /** Handle projection mode toggle */
  onProjectionToggle: () => void;
  /** Handle debug overlay toggle */
  onDebugToggle: () => void;
  /** Handle arcball mode toggle */
  onArcballToggle: () => void;
  /** Handle fly/free camera mode toggle */
  onFlyToggle: () => void;
  /** Handle grid visibility toggle */
  onGridToggle: () => void;
  /** Handle axis visibility toggle */
  onAxisToggle: () => void;
  /** Handle auto-pivot toggle */
  onAutoPivotToggle: () => void;
  /** Handle auto-rotate toggle */
  onAutoRotateToggle: () => void;
  /** Emit diagnostic event with optional data */
  emitDiagnostic?: (event: string, data?: Record<string, unknown>) => void;
  /** Debug flag for verbose logging */
  debugEnabled?: boolean;
}

/** ControlsClickHandler interface */
export interface ControlsClickHandler {
  /** Attach click listener to controls root */
  attach(): void;
  /** Detach click listener */
  dispose(): void;
  /** Handle a click event directly (for testing) */
  handleClick(event: MouseEvent): void;
}

/**
 * Creates a ControlsClickHandler instance.
 *
 * @param config - Configuration with callbacks for each action type
 * @returns ControlsClickHandler instance
 *
 * @example
 * ```ts
 * const handler = createControlsClickHandler({
 *   controlsRoot: document.querySelector('.controls'),
 *   getCameraMode: () => state.cameraMode,
 *   getUseArcball: () => state.useArcball,
 *   onViewPreset: (preset) => applyViewPreset(state, preset),
 *   onProjectionToggle: () => toggleProjection(),
 *   onDebugToggle: () => toggleDebug(),
 *   onArcballToggle: () => toggleArcball(),
 *   onFlyToggle: () => toggleFly(),
 *   onGridToggle: () => toggleGrid(),
 *   onAxisToggle: () => toggleAxis(),
 *   onAutoPivotToggle: () => toggleAutoPivot(),
 *   onAutoRotateToggle: () => toggleAutoRotate(),
 * });
 * handler.attach();
 * ```
 */
export function createControlsClickHandler(
  config: ControlsClickHandlerConfig
): ControlsClickHandler {
  const {
    controlsRoot,
    canvasId,
    onViewPreset,
    onProjectionToggle,
    onDebugToggle,
    onArcballToggle,
    onFlyToggle,
    onGridToggle,
    onAxisToggle,
    onAutoPivotToggle,
    onAutoRotateToggle,
    emitDiagnostic,
    debugEnabled = false,
  } = config;

  let _attached = false;

  /**
   * Handle click event on controls bar
   */
  const handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    // Check for view preset (data-wgpu-view attribute)
    const preset = target.dataset.wgpuView;
    if (preset) {
      if (debugEnabled && emitDiagnostic) {
        emitDiagnostic('controls:view-preset', { preset, canvasId });
      }
      onViewPreset(preset);
      return;
    }

    // Check for action (data-wgpu-action attribute)
    const action = target.dataset.wgpuAction;
    if (action) {
      if (debugEnabled && emitDiagnostic) {
        emitDiagnostic('controls:action', { action, canvasId });
      }

      switch (action) {
        case 'projection':
          onProjectionToggle();
          return;
        case 'debug':
          onDebugToggle();
          return;
        case 'arcball':
          onArcballToggle();
          return;
        case 'fly':
          onFlyToggle();
          return;
        case 'grid':
          onGridToggle();
          return;
        case 'axis':
          onAxisToggle();
          return;
        case 'pivot-auto':
          onAutoPivotToggle();
          return;
        default:
          // Unknown action, fall through to role check
          break;
      }
    }

    // Check for role-based actions (data-role attribute)
    const role = target.dataset.role;
    if (role === 'autorotate') {
      if (debugEnabled && emitDiagnostic) {
        emitDiagnostic('controls:autorotate', { canvasId });
      }
      onAutoRotateToggle();
      return;
    }
  };

  /**
   * Attach click listener to controls root
   */
  const attach = (): void => {
    if (_attached || !controlsRoot) {
      return;
    }
    controlsRoot.addEventListener('click', handleClick);
    _attached = true;
    if (debugEnabled && emitDiagnostic) {
      emitDiagnostic('controls:attached', { canvasId });
    }
  };

  /**
   * Detach click listener from controls root
   */
  const dispose = (): void => {
    if (!_attached || !controlsRoot) {
      return;
    }
    controlsRoot.removeEventListener('click', handleClick);
    _attached = false;
    if (debugEnabled && emitDiagnostic) {
      emitDiagnostic('controls:disposed', { canvasId });
    }
  };

  return {
    attach,
    dispose,
    handleClick,
  };
}
