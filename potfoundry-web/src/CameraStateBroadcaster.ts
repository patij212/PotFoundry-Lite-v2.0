/**
 * CameraStateBroadcaster — Camera state change emission module
 *
 * Extracted from webgpu_core.ts Phase 9.
 * Handles building camera snapshots, comparing for changes,
 * and emitting state updates to host with debouncing.
 *
 * @module CameraStateBroadcaster
 */

import type { CameraSnapshot, CameraMode, WebGPUEvent } from './types';
import { copyVec3 } from './camera_basis';
import type { Vec3 } from './camera_basis';
import { CAMERA_EPSILON, CAMERA_BROADCAST_MS } from './camera_constants';

// ============================================================================
// Types
// ============================================================================

/** Minimal state slice required for camera state broadcasting */
export interface CameraBroadcastStateSlice {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
  autoRotate: boolean;
  sceneRadius: number;
  projectionMode: 'perspective' | 'ortho';
  cameraMode: CameraMode;
  pivot: Vec3;
  cameraDirty: boolean;
  lastCameraPush: number;
}

/** Configuration for creating a CameraStateBroadcaster */
export interface CameraBroadcasterConfig {
  /**
   * Function to get current state slice.
   * Called each time a snapshot is built or state is checked.
   */
  getState: () => CameraBroadcastStateSlice;

  /**
   * Function to update state after emitting.
   * @param updates - Partial state updates to apply
   */
  updateState: (updates: Partial<Pick<CameraBroadcastStateSlice, 'cameraDirty' | 'lastCameraPush'>>) => void;

  /**
   * Function to get the camera eye position.
   * @returns Current camera eye [x, y, z]
   */
  getEyePosition: () => Vec3;

  /**
   * Emit callback to send events to host.
   * @param message - WebGPU event to emit
   */
  emit: ((message: WebGPUEvent) => void) | null;

  /**
   * Optional diagnostic emitter for debugging.
   * @param message - Diagnostic message type
   * @param detail - Additional detail object
   */
  emitDiagnostic?: (message: string, detail?: Record<string, unknown>) => void;

  /**
   * Canvas ID for diagnostic tagging.
   */
  canvasId?: string;
}

/** CameraStateBroadcaster public interface */
export interface CameraStateBroadcaster {
  /**
   * Build a camera snapshot from current state.
   * @returns Current camera snapshot
   */
  buildSnapshot: () => CameraSnapshot;

  /**
   * Compare two snapshots for equality within epsilon.
   * @param prev - Previous snapshot (or null)
   * @param next - Current snapshot
   * @returns True if snapshots are equal within tolerance
   */
  snapshotsEqual: (prev: CameraSnapshot | null, next: CameraSnapshot) => boolean;

  /**
   * Emit camera state if changed (or forced).
   * Respects debounce timing from lastCameraPush.
   * @param force - If true, emit even if state unchanged
   */
  emit: (force?: boolean) => void;

  /**
   * Cancel any pending scheduled emit.
   */
  cancelScheduledEmit: () => void;

  /**
   * Schedule a camera emit after a delay.
   * Cancels any existing scheduled emit first.
   * @param delay - Delay in ms (default: CAMERA_BROADCAST_MS)
   */
  scheduleEmit: (delay?: number) => void;

  /**
   * Request emit when camera becomes static.
   * Sets pending flag and cancels any scheduled emit.
   */
  requestEmitWhenStatic: () => void;

  /**
   * Check if a static emit is pending.
   * @returns True if emit is pending for when camera stops
   */
  isPendingStaticEmit: () => boolean;

  /**
   * Clear pending static emit flag.
   * Call this after emitting from the render loop.
   */
  clearPendingStaticEmit: () => void;

  /**
   * Get the last emitted snapshot (for comparison).
   * @returns Last snapshot or null if never emitted
   */
  getLastSnapshot: () => CameraSnapshot | null;

  /**
   * Get current camera sequence number.
   * @returns Sequence number incremented on each emit
   */
  getSequence: () => number;

  /**
   * Dispose resources (clear timers).
   */
  dispose: () => void;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a CameraStateBroadcaster instance.
 *
 * @param config - Configuration object with state access and emit callbacks
 * @returns CameraStateBroadcaster instance
 *
 * @example
 * ```typescript
 * const broadcaster = createCameraStateBroadcaster({
 *   getState: () => state,
 *   updateState: (updates) => Object.assign(state, updates),
 *   getEyePosition: () => lastCameraRig?.eye ?? state.freePosition,
 *   emit: (msg) => emit?.(msg),
 *   emitDiagnostic,
 *   canvasId: mountCanvasId,
 * });
 *
 * // On camera change:
 * broadcaster.emit(true);
 *
 * // After user interaction:
 * broadcaster.requestEmitWhenStatic();
 *
 * // Cleanup:
 * broadcaster.dispose();
 * ```
 */
export function createCameraStateBroadcaster(config: CameraBroadcasterConfig): CameraStateBroadcaster {
  const {
    getState,
    updateState,
    getEyePosition,
    emit,
    emitDiagnostic,
    canvasId,
  } = config;

  // Internal state
  let lastSnapshot: CameraSnapshot | null = null;
  let cameraSequence = 0;
  let pendingStaticEmit = false;
  let emitTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  // Throttle tracking for diagnostics
  let lastDiagnosticEmit = 0;
  const DIAGNOSTIC_THROTTLE_MS = 500;

  /**
   * Build camera snapshot from current state.
   */
  const buildSnapshot = (): CameraSnapshot => {
    const state = getState();
    const eye = getEyePosition();
    return {
      rotX: state.rotX,
      rotY: state.rotY,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      autoRotate: state.autoRotate,
      sceneRadius: state.sceneRadius,
      projection: state.projectionMode,
      cameraMode: state.cameraMode,
      pivot: copyVec3(state.pivot),
      eye: copyVec3(eye),
    };
  };

  /**
   * Compare two snapshots for equality within CAMERA_EPSILON.
   */
  const snapshotsEqual = (prev: CameraSnapshot | null, next: CameraSnapshot): boolean => {
    if (!prev) return false;
    return (
      Math.abs(prev.rotX - next.rotX) <= CAMERA_EPSILON &&
      Math.abs(prev.rotY - next.rotY) <= CAMERA_EPSILON &&
      Math.abs(prev.zoom - next.zoom) <= CAMERA_EPSILON &&
      Math.abs(prev.panX - next.panX) <= CAMERA_EPSILON &&
      Math.abs(prev.panY - next.panY) <= CAMERA_EPSILON &&
      prev.autoRotate === next.autoRotate &&
      Math.abs(prev.sceneRadius - next.sceneRadius) <= CAMERA_EPSILON &&
      prev.projection === next.projection &&
      prev.cameraMode === next.cameraMode &&
      Math.abs(prev.pivot[0] - next.pivot[0]) <= CAMERA_EPSILON &&
      Math.abs(prev.pivot[1] - next.pivot[1]) <= CAMERA_EPSILON &&
      Math.abs(prev.pivot[2] - next.pivot[2]) <= CAMERA_EPSILON &&
      Math.abs(prev.eye[0] - next.eye[0]) <= CAMERA_EPSILON &&
      Math.abs(prev.eye[1] - next.eye[1]) <= CAMERA_EPSILON &&
      Math.abs(prev.eye[2] - next.eye[2]) <= CAMERA_EPSILON
    );
  };

  /**
   * Post event to host via emit callback.
   */
  const postToHost = (message: WebGPUEvent): void => {
    try {
      emit?.(message);
    } catch (err) {
      console.warn('[CameraStateBroadcaster] emit error', err);
    }
  };

  /**
   * Emit camera state if changed or forced.
   */
  const emitCameraState = (force = false): void => {
    if (disposed) return;

    const state = getState();
    const now = performance.now();

    if (!force) {
      if (!state.cameraDirty) return;
      if (now - state.lastCameraPush < CAMERA_BROADCAST_MS) return;
    }

    const snapshot = buildSnapshot();
    if (!force && snapshotsEqual(lastSnapshot, snapshot)) {
      updateState({ cameraDirty: false, lastCameraPush: now });
      return;
    }

    lastSnapshot = { ...snapshot };
    updateState({ cameraDirty: false, lastCameraPush: now });
    cameraSequence += 1;

    // Emit throttled diagnostic
    if (emitDiagnostic && now - lastDiagnosticEmit >= DIAGNOSTIC_THROTTLE_MS) {
      lastDiagnosticEmit = now;
      emitDiagnostic('component:camera-state', {
        ts: Date.now(),
        seq: cameraSequence,
        rotX: snapshot.rotX,
        rotY: snapshot.rotY,
        zoom: snapshot.zoom,
        canvasId,
      });
    }

    pendingStaticEmit = false;
    postToHost({
      type: 'cameraState',
      payload: {
        ...snapshot,
        timestamp: Date.now(),
        seq: cameraSequence,
      },
    });
  };

  /**
   * Cancel any scheduled emit.
   */
  const cancelScheduledEmit = (): void => {
    if (emitTimer !== null) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
  };

  /**
   * Schedule an emit after delay.
   */
  const scheduleEmit = (delay = CAMERA_BROADCAST_MS): void => {
    if (disposed) return;
    cancelScheduledEmit();
    emitTimer = setTimeout(() => {
      emitTimer = null;
      emitCameraState(true);
    }, delay);
  };

  /**
   * Request emit when camera becomes static.
   */
  const requestEmitWhenStatic = (): void => {
    pendingStaticEmit = true;
    cancelScheduledEmit();
  };

  /**
   * Dispose — clear timers.
   */
  const dispose = (): void => {
    disposed = true;
    cancelScheduledEmit();
  };

  return {
    buildSnapshot,
    snapshotsEqual,
    emit: emitCameraState,
    cancelScheduledEmit,
    scheduleEmit,
    requestEmitWhenStatic,
    isPendingStaticEmit: () => pendingStaticEmit,
    clearPendingStaticEmit: () => { pendingStaticEmit = false; },
    getLastSnapshot: () => lastSnapshot,
    getSequence: () => cameraSequence,
    dispose,
  };
}
