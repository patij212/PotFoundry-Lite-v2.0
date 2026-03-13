/**
 * CameraModeManager — Camera mode switching logic
 *
 * Extracted from webgpu_core.ts Phase 14.
 * Handles camera mode transitions (turntable/arcball/free),
 * auto-rotation state, and mode button synchronization.
 *
 * @module CameraModeManager
 */

import type { CameraMode, Ray } from './types';
import type { Vec3, CameraBasis, Quaternion } from './camera_basis';
import {
  vec3Normalize,
  vec3Subtract,
  vec3Length,
  quaternionFromBasis,
  syncAnglesFromBasis,
} from './camera_basis';
import { clampZoomValue, wrapTau } from './MathHelpers';

// ============================================================================
// Constants
// ============================================================================

/** Falloff factor for camera distance to zoom conversion */
export const CAMERA_DISTANCE_FALLOFF = 2.0;

// ============================================================================
// Types
// ============================================================================

/** Interaction rig data returned by resolveInteractionRig callback */
export interface InteractionRig {
  eye: Vec3;
  extents: { paddedMax: number };
}

/** Camera extents used for zoom calculations */
export interface CameraExtents {
  paddedMax: number;
}

/** Minimal state slice required for camera mode management */
export interface CameraModeStateSlice {
  cameraMode: CameraMode;
  useArcball: boolean;
  autoRotate: boolean;
  zoom: number;
  orbitZoom: number;
  freePosition: Vec3;
  pivot: Vec3 | null;
  panX: number;
  panY: number;
  rotX: number;
  rotY: number;
  camRight: Vec3;
  camUp: Vec3;
  camForward: Vec3;
  camQuat: Quaternion;
  displayCamRight: Vec3 | null | undefined;
  displayCamUp: Vec3 | null | undefined;
  displayCamForward: Vec3 | null | undefined;
  displayCamQuat: Quaternion | null | undefined;
  displayRotX: number | null | undefined;
  displayRotY: number | null | undefined;
  cameraDirty: boolean;
  autoRotateResumeAt: number;

  // Inertia state (optional dynamic properties)
  inertiaVx?: number;
  inertiaVy?: number;
  inertiaDecay?: number;
  inertiaActive?: boolean;

  // Index signature for any additional state properties
  [key: string]: unknown;
}

/** Configuration for creating a CameraModeManager */
export interface CameraModeManagerConfig {
  /**
   * Function to get current state slice.
   * Called when mode transitions need current state.
   */
  getState: () => CameraModeStateSlice;

  /**
   * Function to update state after mode changes.
   * @param updates - Partial state updates to apply
   */
  updateState: (updates: Partial<CameraModeStateSlice>) => void;

  /**
   * Cancel any active focus tween animation.
   */
  cancelFocusTween: () => void;

  /**
   * Resolve the current interaction rig (eye position, extents).
   * May throw if rig cannot be resolved.
   */
  resolveInteractionRig: () => InteractionRig;

  /**
   * Resolve the active camera basis.
   */
  resolveActiveBasis: () => CameraBasis;

  /**
   * Ensure free position is valid, returning a fallback if needed.
   */
  ensureFreePosition: () => Vec3;

  /**
   * Intersect a ray with the pivot Z-plane.
   * @param ray - Ray to intersect
   * @param pivotZ - Z coordinate of the plane
   * @returns Intersection point [x, y, z] or null
   */
  intersectRayZPlane: (ray: Ray, pivotZ: number) => Vec3 | null;

  /**
   * Update pivot position from current pan values.
   */
  updatePivotFromPan: () => void;

  /**
   * Clear free movement key state.
   */
  clearFreeMovementKeys: () => void;

  /**
   * Set auto-rotate state.
   * @param value - Whether auto-rotate should be enabled
   * @param emit - Whether to emit camera state
   */
  setAutoRotate: (value: boolean, emit: boolean) => void;

  /**
   * Update camera mode buttons in toolbar.
   */
  updateCameraModeButtons: () => void;

  /**
   * Request camera state emission when camera becomes static.
   */
  requestCameraEmitWhenStatic: () => void;
}

/** CameraModeManager public interface */
export interface CameraModeManager {
  /**
   * Set the camera mode.
   * Handles all state transitions between turntable, arcball, and free modes.
   * @param nextMode - Target camera mode
   */
  setCameraMode: (nextMode: CameraMode) => void;

  /**
   * Get the current camera mode.
   * @returns Current camera mode
   */
  getCameraMode: () => CameraMode;

  /**
   * Check if camera is in free mode.
   * @returns True if in free camera mode
   */
  isFreeModeActive: () => boolean;

  /**
   * Check if camera is using arcball controls.
   * @returns True if arcball mode is active
   */
  isArcballModeActive: () => boolean;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a CameraModeManager instance.
 *
 * @param config - Configuration callbacks for state access and side effects
 * @returns CameraModeManager instance
 *
 * @example
 * ```ts
 * const modeManager = createCameraModeManager({
 *   getState: () => ({ cameraMode: 'turntable', ... }),
 *   updateState: (updates) => { ... },
 *   cancelFocusTween: () => { ... },
 *   // ... other callbacks
 * });
 *
 * modeManager.setCameraMode('free');
 * ```
 */
export function createCameraModeManager(config: CameraModeManagerConfig): CameraModeManager {
  const {
    getState,
    updateState,
    cancelFocusTween,
    resolveInteractionRig,
    resolveActiveBasis,
    ensureFreePosition,
    intersectRayZPlane,
    updatePivotFromPan,
    clearFreeMovementKeys,
    setAutoRotate,
    updateCameraModeButtons,
    requestCameraEmitWhenStatic,
  } = config;

  /**
   * Reset inertia state.
   */
  const resetInertia = (): void => {
    updateState({
      inertiaVx: 0,
      inertiaVy: 0,
      inertiaDecay: 0,
      inertiaActive: false,
    });
  };

  /**
   * Transition to free camera mode.
   * Captures current eye position and resets display state.
   */
  const transitionToFreeMode = (): void => {
    const state = getState();

    // Capture current eye position for free mode
    let freePosition: Vec3 = [...(state.freePosition ?? [0, 0, 5])];
    try {
      const { eye } = resolveInteractionRig();
      freePosition = [...eye];
    } catch {
      // Use existing or default position
    }

    const orbitZoom = clampZoomValue(state.zoom || state.orbitZoom || 1.0);

    updateState({
      freePosition,
      orbitZoom,
      cameraMode: 'free',
      zoom: 1.0,
      displayCamRight: null,
      displayCamUp: null,
      displayCamForward: null,
      displayCamQuat: null,
      displayRotX: null,
      displayRotY: null,
      cameraDirty: true,
    });

    resetInertia();
    clearFreeMovementKeys();
    setAutoRotate(false, false);
    updateCameraModeButtons();
    requestCameraEmitWhenStatic();
  };

  /**
   * Transition from free mode to orbit mode (turntable or arcball).
   * Calculates orbit parameters from current free position.
   * @param targetMode - Target orbit mode
   */
  const transitionFromFreeMode = (targetMode: CameraMode): void => {
    const state = getState();
    const basis = resolveActiveBasis();
    const eye = ensureFreePosition();
    const pivotZ = state.pivot?.[2] ?? 0;

    // Intersect view ray with pivot plane to determine pan position
    const ray: Ray = { origin: eye, dir: vec3Normalize(basis.forward) };
    const hit = intersectRayZPlane(ray, pivotZ);

    let panX = state.panX;
    let panY = state.panY;

    if (hit) {
      panX = hit[0];
      panY = hit[1];
    }

    // Calculate zoom from distance to target
    let zoom = clampZoomValue(state.orbitZoom || state.zoom || 1.0);
    try {
      const { extents } = resolveInteractionRig();
      const target: Vec3 = [panX, panY, pivotZ];
      const distance = vec3Length(vec3Subtract(target, eye));
      if (Number.isFinite(distance) && distance > 1e-3) {
        const zoomFromDistance =
          (extents.paddedMax * CAMERA_DISTANCE_FALLOFF) / Math.max(distance, 1e-3);
        zoom = clampZoomValue(zoomFromDistance);
      }
    } catch {
      // Use existing zoom
    }

    // Sync angles from basis
    const { rotX, rotY } = syncAnglesFromBasis(basis);

    updateState({
      panX,
      panY,
      zoom,
      orbitZoom: zoom,
      camRight: [...basis.right],
      camUp: [...basis.up],
      camForward: [...basis.forward],
      camQuat: quaternionFromBasis(basis),
      rotX,
      rotY: wrapTau(rotY),
      displayCamRight: null,
      displayCamUp: null,
      displayCamForward: null,
      displayCamQuat: null,
      displayRotX: null,
      displayRotY: null,
    });

    updatePivotFromPan();
    clearFreeMovementKeys();
  };

  /**
   * Set the camera mode.
   * Handles all state transitions between turntable, arcball, and free modes.
   */
  const setCameraMode = (nextMode: CameraMode): void => {
    cancelFocusTween();

    const state = getState();
    if (state.cameraMode === nextMode) {
      return;
    }

    const prevMode = state.cameraMode;

    // Handle transition TO free mode
    if (nextMode === 'free') {
      transitionToFreeMode();
      return;
    }

    // Handle transition FROM free mode to orbit modes
    if (prevMode === 'free') {
      transitionFromFreeMode(nextMode);
    }

    // Finalize mode switch
    updateState({
      cameraMode: nextMode,
      useArcball: nextMode === 'arcball',
      cameraDirty: true,
    });

    resetInertia();
    updateCameraModeButtons();
    requestCameraEmitWhenStatic();
  };

  /**
   * Get the current camera mode.
   */
  const getCameraMode = (): CameraMode => {
    return getState().cameraMode;
  };

  /**
   * Check if camera is in free mode.
   */
  const isFreeModeActive = (): boolean => {
    return getState().cameraMode === 'free';
  };

  /**
   * Check if camera is using arcball controls.
   */
  const isArcballModeActive = (): boolean => {
    return getState().cameraMode === 'arcball';
  };

  return {
    setCameraMode,
    getCameraMode,
    isFreeModeActive,
    isArcballModeActive,
  };
}

// ============================================================================
// Test Hooks
// ============================================================================

/** Test hooks for unit testing (exported for testing only) */
export const __cameraModeTestHooks = {
  CAMERA_DISTANCE_FALLOFF,
};
