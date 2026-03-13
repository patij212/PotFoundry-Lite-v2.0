/**
 * ToolbarButtonSync — UI button state synchronization for WebGPU preview.
 *
 * This module extracts toolbar button handling logic from webgpu_core.ts (Phase 8).
 * It manages the visual state of control buttons (autorotate, grid, axis, projection, etc.)
 * by updating their data-state, aria-pressed, and textContent attributes.
 *
 * @module ToolbarButtonSync
 */

import type { CameraMode } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal state slice required for toolbar button updates.
 * This is a subset of WebGPUState focused on UI-visible properties.
 */
export interface ToolbarStateSlice {
  autoRotate: boolean;
  projectionMode: 'ortho' | 'perspective';
  debugOverlay: boolean;
  showGrid: boolean;
  showAxis: boolean;
  cameraMode: CameraMode;
  autoPivotFromCamera: boolean;
}

/**
 * Configuration for creating a ToolbarButtonSync instance.
 */
export interface ToolbarButtonSyncConfig {
  /** Optional container element to scope button queries. */
  controlsRoot: HTMLElement | null;
  /** Canvas element — its parent is used as secondary query scope. */
  canvas: HTMLCanvasElement;
}

/**
 * Named button types managed by ToolbarButtonSync.
 */
export type ToolbarButtonName =
  | 'autorotate'
  | 'projection'
  | 'debug'
  | 'grid'
  | 'axis'
  | 'arcball'
  | 'free'
  | 'pivot';

/**
 * Public interface for ToolbarButtonSync instances.
 */
export interface ToolbarButtonSync {
  /** Update all buttons to match the provided state. */
  updateAll(state: ToolbarStateSlice): void;

  /** Update a single button by name. */
  updateAutoButton(autoRotate: boolean): void;
  updateProjectionButton(projectionMode: 'ortho' | 'perspective'): void;
  updateDebugButton(debugOverlay: boolean): void;
  updateGridButton(showGrid: boolean): void;
  updateAxisButton(showAxis: boolean): void;
  updateArcballButton(cameraMode: CameraMode): void;
  updateFreeButton(cameraMode: CameraMode): void;
  updatePivotAutoButton(autoPivotFromCamera: boolean): void;
  updateCameraModeButtons(cameraMode: CameraMode): void;

  /** Resolve a button by CSS selector (exposed for external use). */
  resolveButton(selector: string): HTMLButtonElement | null;

  /** Clear cached button references and release resources. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Button Selectors
// ---------------------------------------------------------------------------

/** CSS selectors for toolbar buttons. */
const BUTTON_SELECTORS = {
  autorotate: '[data-role="autorotate"]',
  projection: '[data-wgpu-action="projection"]',
  debug: '[data-wgpu-action="debug"]',
  grid: '[data-wgpu-action="grid"]',
  axis: '[data-wgpu-action="axis"]',
  axisAlt: '#wgpu-toggle-axis',
  arcball: '[data-wgpu-action="arcball"]',
  arcballAlt: '#wgpu-toggle-arcball',
  free: '[data-wgpu-action="fly"]',
  freeAlt: '#wgpu-toggle-fly',
  pivot: '[data-wgpu-action="pivot-auto"]',
  pivotAlt: '#wgpu-toggle-pivot',
} as const;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a ToolbarButtonSync instance for managing toolbar button states.
 *
 * @param config - Configuration with controlsRoot and canvas references
 * @returns ToolbarButtonSync instance
 *
 * @example
 * ```ts
 * const toolbar = createToolbarButtonSync({
 *   controlsRoot: document.getElementById('controls'),
 *   canvas: canvasElement,
 * });
 *
 * toolbar.updateAll(state);
 * toolbar.updateAutoButton(true);
 * toolbar.dispose();
 * ```
 */
export function createToolbarButtonSync(config: ToolbarButtonSyncConfig): ToolbarButtonSync {
  const { controlsRoot, canvas } = config;

  // Cached button references
  let autorotateButton: HTMLButtonElement | null = null;
  let projectionButton: HTMLButtonElement | null = null;
  let debugButton: HTMLButtonElement | null = null;
  let gridButton: HTMLButtonElement | null = null;
  let axisButton: HTMLButtonElement | null = null;
  let pivotAutoButton: HTMLButtonElement | null = null;

  // ---------------------------------------------------------------------------
  // Button Resolution
  // ---------------------------------------------------------------------------

  /**
   * Resolve a button element by CSS selector.
   * Searches in order: controlsRoot > canvas parent > document.
   */
  const resolveButton = (selector: string): HTMLButtonElement | null => {
    if (controlsRoot) {
      const candidate = controlsRoot.querySelector<HTMLButtonElement>(selector);
      if (candidate) {
        return candidate;
      }
    }
    const shell = canvas.parentElement;
    if (shell instanceof HTMLElement) {
      const scoped = shell.querySelector<HTMLButtonElement>(selector);
      if (scoped) {
        return scoped;
      }
    }
    return document.querySelector<HTMLButtonElement>(selector);
  };

  /**
   * Resolve with fallback selector (for buttons with alternative selectors).
   */
  const resolveButtonWithFallback = (
    primary: string,
    fallback: string
  ): HTMLButtonElement | null => {
    return resolveButton(primary) || resolveButton(fallback);
  };

  // ---------------------------------------------------------------------------
  // Cached Resolvers
  // ---------------------------------------------------------------------------

  const resolveAutorotateButton = (): HTMLButtonElement | null => {
    if (autorotateButton && autorotateButton.isConnected) {
      return autorotateButton;
    }
    autorotateButton = resolveButton(BUTTON_SELECTORS.autorotate);
    return autorotateButton;
  };

  const resolveProjectionButton = (): HTMLButtonElement | null => {
    if (projectionButton && projectionButton.isConnected) {
      return projectionButton;
    }
    projectionButton = resolveButton(BUTTON_SELECTORS.projection);
    return projectionButton;
  };

  const resolveDebugButton = (): HTMLButtonElement | null => {
    if (debugButton && debugButton.isConnected) {
      return debugButton;
    }
    debugButton = resolveButton(BUTTON_SELECTORS.debug);
    return debugButton;
  };

  const resolveGridButton = (): HTMLButtonElement | null => {
    if (gridButton && gridButton.isConnected) {
      return gridButton;
    }
    gridButton = resolveButton(BUTTON_SELECTORS.grid);
    return gridButton;
  };

  const resolveAxisButton = (): HTMLButtonElement | null => {
    if (axisButton && axisButton.isConnected) {
      return axisButton;
    }
    axisButton = resolveButtonWithFallback(BUTTON_SELECTORS.axis, BUTTON_SELECTORS.axisAlt);
    return axisButton;
  };

  const resolvePivotButton = (): HTMLButtonElement | null => {
    if (pivotAutoButton && pivotAutoButton.isConnected) {
      return pivotAutoButton;
    }
    pivotAutoButton = resolveButtonWithFallback(BUTTON_SELECTORS.pivot, BUTTON_SELECTORS.pivotAlt);
    return pivotAutoButton;
  };

  // ---------------------------------------------------------------------------
  // Update Functions
  // ---------------------------------------------------------------------------

  const updateAutoButton = (autoRotate: boolean): void => {
    const button = resolveAutorotateButton();
    if (!button) {
      return;
    }
    button.dataset.state = autoRotate ? 'on' : 'off';
    button.setAttribute('aria-pressed', autoRotate ? 'true' : 'false');
    const label = autoRotate ? 'Auto' : 'Manual';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };

  const updateProjectionButton = (projectionMode: 'ortho' | 'perspective'): void => {
    const button = resolveProjectionButton();
    if (!button) {
      return;
    }
    const isPerspective = projectionMode === 'perspective';
    button.dataset.state = projectionMode;
    button.setAttribute('aria-pressed', isPerspective ? 'true' : 'false');
    const label = isPerspective ? 'Persp' : 'Ortho';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };

  const updateDebugButton = (debugOverlay: boolean): void => {
    const button = resolveDebugButton();
    if (!button) {
      return;
    }
    button.dataset.state = debugOverlay ? 'on' : 'off';
    button.textContent = debugOverlay ? 'Debug*' : 'Debug';
    button.setAttribute('aria-pressed', debugOverlay ? 'true' : 'false');
  };

  const updateGridButton = (showGrid: boolean): void => {
    const button = resolveGridButton();
    if (!button) {
      return;
    }
    button.dataset.state = showGrid ? 'on' : 'off';
    button.setAttribute('aria-pressed', showGrid ? 'true' : 'false');
    const label = showGrid ? 'Grid*' : 'Grid';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };

  const updateAxisButton = (showAxis: boolean): void => {
    const button = resolveAxisButton();
    if (!button) {
      return;
    }
    button.dataset.state = showAxis ? 'on' : 'off';
    button.setAttribute('aria-pressed', showAxis ? 'true' : 'false');
    const label = showAxis ? 'Axis*' : 'Axis';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };

  const updateArcballButton = (cameraMode: CameraMode): void => {
    const btn = resolveButtonWithFallback(BUTTON_SELECTORS.arcball, BUTTON_SELECTORS.arcballAlt);
    if (!btn) {
      return;
    }
    const active = cameraMode === 'arcball';
    const label = active ? 'Arc*' : 'Arc';
    btn.textContent = label;
    btn.setAttribute('data-state', active ? 'on' : 'off');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  };

  const updateFreeButton = (cameraMode: CameraMode): void => {
    const btn = resolveButtonWithFallback(BUTTON_SELECTORS.free, BUTTON_SELECTORS.freeAlt);
    if (!btn) {
      return;
    }
    const active = cameraMode === 'free';
    btn.textContent = active ? 'Free*' : 'Free';
    btn.setAttribute('data-state', active ? 'on' : 'off');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  };

  const updatePivotAutoButton = (autoPivotFromCamera: boolean): void => {
    const button = resolvePivotButton();
    if (!button) {
      return;
    }
    const active = Boolean(autoPivotFromCamera);
    button.dataset.state = active ? 'on' : 'off';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    const label = active ? 'Pivot*' : 'Pivot';
    if (button.textContent !== label) {
      button.textContent = label;
    }
  };

  const updateCameraModeButtons = (cameraMode: CameraMode): void => {
    updateArcballButton(cameraMode);
    updateFreeButton(cameraMode);
  };

  const updateAll = (state: ToolbarStateSlice): void => {
    updateAutoButton(state.autoRotate);
    updateProjectionButton(state.projectionMode);
    updateDebugButton(state.debugOverlay);
    updateGridButton(state.showGrid);
    updateAxisButton(state.showAxis);
    updateCameraModeButtons(state.cameraMode);
    updatePivotAutoButton(state.autoPivotFromCamera);
  };

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  const dispose = (): void => {
    autorotateButton = null;
    projectionButton = null;
    debugButton = null;
    gridButton = null;
    axisButton = null;
    pivotAutoButton = null;
  };

  // ---------------------------------------------------------------------------
  // Return Public Interface
  // ---------------------------------------------------------------------------

  return {
    updateAll,
    updateAutoButton,
    updateProjectionButton,
    updateDebugButton,
    updateGridButton,
    updateAxisButton,
    updateArcballButton,
    updateFreeButton,
    updatePivotAutoButton,
    updateCameraModeButtons,
    resolveButton,
    dispose,
  };
}
