/**
 * @fileoverview PointerEventRouter — Extracted pointer/touch/wheel event handling
 *
 * Handles all canvas input events and delegates to CameraController.
 * Manages hasLocalCameraControl flag and deferred reset timer.
 *
 * @module PointerEventRouter
 */

import type { CameraController } from './camera_controller';

/** Minimal state slice needed for pointer event handling */
export interface PointerEventStateSlice {
  cameraMode: 'turntable' | 'arcball' | 'free';
  [key: string]: unknown; // Allow additional properties
}

/** Configuration for creating a PointerEventRouter */
export interface PointerEventRouterConfig {
  /** Canvas element to attach listeners to */
  canvas: HTMLCanvasElement;
  /** Optional canvas ID for diagnostics */
  canvasId?: string;
  /** Function to get current state */
  getState: () => PointerEventStateSlice;
  /** Function to get the CameraController (may be undefined during init) */
  getCameraController: () => CameraController | undefined;
  /** Mark interaction and optionally cancel focus tween */
  markInteraction: (shouldCancelFocus?: boolean) => void;
  /** Apply free-look dolly (scroll in free mode) */
  applyFreeLookDolly: (delta: number) => void;
  /** Zoom camera anchored at cursor position */
  zoomCameraAtCursor: (clientX: number, clientY: number, factor: number) => void;
  /** Focus camera at cursor position (double-click) */
  focusCameraAtCursor: (clientX: number, clientY: number) => void;
  /** Schedule camera state emission */
  scheduleCameraEmit: () => void;
  /** Emit diagnostic event with optional data */
  emitDiagnostic?: (event: string, data?: Record<string, unknown>) => void;
  /** Debug flag for verbose logging */
  debugEnabled?: boolean;
  /** Delay before clearing hasLocalCameraControl (ms) */
  localControlResetDelay?: number;
}

/** PointerEventRouter interface */
export interface PointerEventRouter {
  /** Attach all event listeners to canvas/window */
  attach(): void;
  /** Detach all event listeners and clean up timers */
  dispose(): void;
  /** Check if local camera control is active */
  hasLocalControl(): boolean;
  /** Set hasLocalCameraControl flag directly */
  setLocalControl(value: boolean): void;
  /** Clear the local control reset timer */
  clearLocalControlTimer(): void;
}

/**
 * Creates a PointerEventRouter instance.
 *
 * @param config - Configuration object
 * @returns PointerEventRouter instance
 *
 * @example
 * ```ts
 * const router = createPointerEventRouter({
 *   canvas,
 *   getState: () => state,
 *   getCameraController: () => cameraController,
 *   markInteraction,
 *   applyFreeLookDolly,
 *   zoomCameraAtCursor,
 *   focusCameraAtCursor,
 *   scheduleCameraEmit,
 * });
 * router.attach();
 * // ... on cleanup:
 * router.dispose();
 * ```
 */
export function createPointerEventRouter(
  config: PointerEventRouterConfig
): PointerEventRouter {
  const {
    canvas,
    canvasId,
    getState,
    getCameraController,
    markInteraction,
    applyFreeLookDolly,
    zoomCameraAtCursor,
    focusCameraAtCursor,
    scheduleCameraEmit,
    emitDiagnostic,
    debugEnabled = false,
    localControlResetDelay = 250,
  } = config;

  let hasLocalCameraControl = false;
  let localControlResetTimer: number | null = null;
  let attached = false;

  // Wheel options for non-passive handling
  const wheelOptions: AddEventListenerOptions = { passive: false };

  /**
   * Handle pointer down — start camera interaction
   */
  const handlePointerDown = (event: PointerEvent): void => {
    try {
      if (debugEnabled) {
        emitDiagnostic?.('webgpu:pointer-down', {
          x: event.clientX,
          y: event.clientY,
          button: event.button,
          canvasId,
        });
      }
    } catch {
      /* ignore */
    }
    if (localControlResetTimer !== null) {
      window.clearTimeout(localControlResetTimer);
      localControlResetTimer = null;
    }
    hasLocalCameraControl = true;
    getCameraController()?.onPointerDown?.(event);
  };

  /**
   * Handle pointer release — end camera interaction with deferred local control reset
   */
  const handlePointerRelease = (): void => {
    try {
      if (debugEnabled) {
        emitDiagnostic?.('webgpu:pointer-up', { canvasId });
      }
    } catch {
      /* ignore */
    }
    if (localControlResetTimer !== null) {
      window.clearTimeout(localControlResetTimer);
      localControlResetTimer = null;
    }
    // Defer clearing local camera control briefly to avoid immediate
    // remote updates overriding the user's local camera changes.
    localControlResetTimer = window.setTimeout(() => {
      localControlResetTimer = null;
      hasLocalCameraControl = false;
    }, localControlResetDelay);
    getCameraController()?.onPointerRelease?.();
  };

  /**
   * Handle pointer move — delegate to camera controller
   */
  const handlePointerMove = (event: PointerEvent): void => {
    try {
      if (debugEnabled) {
        emitDiagnostic?.('webgpu:pointer-move', {
          x: event.clientX,
          y: event.clientY,
          canvasId,
        });
      }
    } catch {
      /* ignore */
    }
    getCameraController()?.onPointerMove?.(event);
  };

  /**
   * Handle wheel event — free mode dolly or cursor-anchored zoom
   */
  const handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const state = getState();
    if (state.cameraMode === 'free') {
      applyFreeLookDolly(-event.deltaY);
    } else {
      const k = Math.exp(-event.deltaY * 0.001);
      zoomCameraAtCursor(event.clientX, event.clientY, k);
    }
    markInteraction();
    scheduleCameraEmit();
  };

  /**
   * Handle double-click — focus camera at cursor position
   */
  const handleDoubleClick = (event: MouseEvent): void => {
    // Only respond to left-button double-clicks
    if (event.button !== 0) return;
    event.preventDefault();
    focusCameraAtCursor(event.clientX, event.clientY);
  };

  /**
   * Handle touch start — for pinch-to-zoom via camera controller
   */
  const handleTouchStart = (event: TouchEvent): void => {
    // For single touch, let pointer events handle it
    // For multi-touch (2+ fingers), handle as pinch gesture
    if (event.touches.length >= 2) {
      event.preventDefault(); // Prevent browser zoom
      getCameraController()?.onTouchStart?.(event);
    } else if (event.touches.length === 1) {
      // Track single touches for potential pinch gesture
      getCameraController()?.onTouchStart?.(event);
    }
  };

  /**
   * Handle touch move — pinch-to-zoom via camera controller
   */
  const handleTouchMove = (event: TouchEvent): void => {
    const controller = getCameraController();
    // Only handle multi-touch (pinch) moves
    if (controller?.pointer?.isPinching) {
      event.preventDefault(); // Prevent browser scroll/zoom
      controller?.onTouchMove?.(event);
    }
  };

  /**
   * Handle touch end — cleanup via camera controller
   */
  const handleTouchEnd = (event: TouchEvent): void => {
    getCameraController()?.onTouchEnd?.(event);
  };

  /** Attach all event listeners */
  const attach = (): void => {
    if (attached) {
      return;
    }

    // Pointer events
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerRelease);
    canvas.addEventListener('pointercancel', handlePointerRelease);
    window.addEventListener('pointerup', handlePointerRelease);
    canvas.addEventListener('pointermove', handlePointerMove);

    // Touch events for pinch-to-zoom (passive:false to allow preventDefault)
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);

    // Wheel and double-click
    canvas.addEventListener('wheel', handleWheel, wheelOptions);
    canvas.addEventListener('dblclick', handleDoubleClick);

    attached = true;
    emitDiagnostic?.('pointer-router:attached');
  };

  /** Detach all event listeners and clean up timers */
  const dispose = (): void => {
    if (!attached) {
      return;
    }

    // Pointer events
    canvas.removeEventListener('pointerdown', handlePointerDown);
    canvas.removeEventListener('pointerup', handlePointerRelease);
    canvas.removeEventListener('pointercancel', handlePointerRelease);
    window.removeEventListener('pointerup', handlePointerRelease);
    canvas.removeEventListener('pointermove', handlePointerMove);

    // Touch events
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleTouchEnd);
    canvas.removeEventListener('touchcancel', handleTouchEnd);

    // Wheel and double-click
    canvas.removeEventListener('wheel', handleWheel, wheelOptions);
    canvas.removeEventListener('dblclick', handleDoubleClick);

    // Clean up timer
    if (localControlResetTimer !== null) {
      window.clearTimeout(localControlResetTimer);
      localControlResetTimer = null;
    }

    attached = false;
    emitDiagnostic?.('pointer-router:disposed');
  };

  return {
    attach,
    dispose,
    hasLocalControl: () => hasLocalCameraControl,
    setLocalControl: (value: boolean) => {
      hasLocalCameraControl = value;
    },
    clearLocalControlTimer: () => {
      if (localControlResetTimer !== null) {
        window.clearTimeout(localControlResetTimer);
        localControlResetTimer = null;
      }
    },
  };
}
