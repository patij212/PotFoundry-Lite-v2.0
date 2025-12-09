/**
 * Context for WebGPU controller access.
 * 
 * Provides the WebGPU controller reference to child components,
 * enabling camera controls, grid toggles, and other renderer operations.
 * 
 * @module context/ControllerContext
 */

import React, { createContext, useContext, useCallback, useMemo, RefObject, useState, useEffect } from 'react';
import type { WebGPUController } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Camera state for UI display.
 */
export interface CameraState {
  mode: 'turntable' | 'arcball' | 'free';
  projection: 'perspective' | 'ortho';
  autoRotate: boolean;
  showGrid: boolean;
  showAxis: boolean;
}

/**
 * Controller context value with camera controls and state.
 */
export interface ControllerContextValue {
  /** Reference to the WebGPU controller */
  controllerRef: RefObject<WebGPUController | null>;
  /** Whether the controller is ready */
  isReady: boolean;

  // Camera state getters
  /** Current camera state for UI display */
  cameraState: CameraState;

  // Camera controls
  /** Reset camera to default isometric view */
  resetCamera: () => void;
  /** Set camera mode (turntable/arcball/free) */
  setCameraMode: (mode: 'turntable' | 'arcball') => void;
  /** Toggle between turntable and arcball */
  toggleCameraMode: () => void;
  /** Set projection mode (perspective/ortho) */
  setProjection: (mode: 'perspective' | 'ortho') => void;
  /** Toggle projection mode */
  toggleProjection: () => void;
  /** Set auto-rotate */
  setAutoRotate: (enabled: boolean) => void;
  /** Toggle auto-rotate */
  toggleAutoRotate: () => void;
  /** Toggle grid visibility */
  toggleGrid: () => void;
  /** Toggle axis visibility */
  toggleAxis: () => void;
  /** Take a screenshot */
  takeScreenshot: () => Promise<Blob | null>;
  /** Apply a view preset */
  applyViewPreset: (preset: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso') => void;
  /** Update renderer parameters directly (for library design loading) */
  updateParams: (params: Record<string, unknown>) => void;
  /** 
   * Set a local params lock to prevent Python params from overwriting locally-loaded designs.
   * The lock lasts for the specified duration in milliseconds.
   */
  setLocalParamsLock: (durationMs: number) => void;
}

// ============================================================================
// Context
// ============================================================================

const ControllerContext = createContext<ControllerContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the WebGPU controller.
 * 
 * @returns Controller context value
 * @throws Error if used outside of ControllerProvider
 * 
 * @example
 * ```tsx
 * function CameraControls() {
 *   const { resetCamera, toggleAutoRotate, isReady } = useController();
 *   
 *   if (!isReady) return <Spinner />;
 *   
 *   return (
 *     <button onClick={resetCamera}>Reset View</button>
 *     <button onClick={toggleAutoRotate}>Toggle Auto-Rotate</button>
 *   );
 * }
 * ```
 */
export function useController(): ControllerContextValue {
  const context = useContext(ControllerContext);
  if (!context) {
    throw new Error('useController must be used within a ControllerProvider');
  }
  return context;
}

/**
 * Hook to optionally access the controller (returns null if not available).
 */
export function useControllerMaybe(): ControllerContextValue | null {
  return useContext(ControllerContext);
}

// ============================================================================
// Provider Props
// ============================================================================

export interface ControllerProviderProps {
  /** Reference to the WebGPU controller */
  controllerRef: RefObject<WebGPUController | null>;
  /** Whether the controller is ready */
  isReady: boolean;
  /** Canvas element reference for screenshots */
  canvasRef?: RefObject<HTMLCanvasElement | null>;
  /** Reference to local params lock timestamp (used to prevent Python params from overwriting library-loaded designs) */
  localParamsLockRef?: React.MutableRefObject<number>;
  /** Child components */
  children: React.ReactNode;
}

// ============================================================================
// Provider
// ============================================================================

/**
 * Provider for WebGPU controller access.
 * 
 * Wraps child components to provide camera controls and renderer operations.
 * 
 * @example
 * ```tsx
 * <ControllerProvider controllerRef={controllerRef} isReady={isReady}>
 *   <AppUI />
 * </ControllerProvider>
 * ```
 */
export const ControllerProvider: React.FC<ControllerProviderProps> = ({
  controllerRef,
  isReady,
  canvasRef,
  localParamsLockRef,
  children,
}) => {
  // Camera state for UI display - tracks the current state of camera settings
  const [cameraState, setCameraState] = useState<CameraState>({
    mode: 'turntable',
    projection: 'ortho',
    autoRotate: false,
    showGrid: true,
    showAxis: true,
  });

  // Helper to read current state from window.__pf_webgpu_camera_controller
  // NOTE: Returns a NEW state object, NOT derived from previous state to avoid circular deps
  const readCameraState = useCallback((): CameraState => {
    const cc = (window as unknown as { __pf_webgpu_camera_controller?: { state?: Record<string, unknown> } }).__pf_webgpu_camera_controller;
    const state = cc?.state;
    if (!state) {
      return {
        mode: 'turntable',
        projection: 'ortho',
        autoRotate: false,
        showGrid: true,
        showAxis: true,
      };
    }

    return {
      mode: (state.cameraMode as CameraState['mode']) ?? 'turntable',
      projection: (state.projectionMode as CameraState['projection']) ?? 'ortho',
      autoRotate: Boolean(state.autoRotate),
      showGrid: state.showGrid !== false,
      showAxis: state.showAxis !== false,
    };
  }, []); // No dependencies - reads from window, not React state

  // Sync state on mount and when isReady changes
  useEffect(() => {
    if (isReady) {
      // Initial sync
      setCameraState(readCameraState());

      // Set up polling interval to sync state (simple approach)
      const interval = setInterval(() => {
        const newState = readCameraState();
        setCameraState(prev => {
          // Only update if state actually changed to avoid unnecessary renders
          if (
            prev.mode === newState.mode &&
            prev.projection === newState.projection &&
            prev.autoRotate === newState.autoRotate &&
            prev.showGrid === newState.showGrid &&
            prev.showAxis === newState.showAxis
          ) {
            return prev;
          }
          return newState;
        });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [isReady, readCameraState]);

  // Camera controls
  const resetCamera = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    // Send camera command to reset to isometric view
    if (typeof ctrl.handleCameraCommand === 'function') {
      ctrl.handleCameraCommand({
        viewPreset: 'iso',
        zoom: 1,
        panX: 0,
        panY: 0,
      });
    }
  }, [controllerRef]);

  const setCameraMode = useCallback((mode: 'turntable' | 'arcball') => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    if (typeof ctrl.handleCameraCommand === 'function') {
      ctrl.handleCameraCommand({ cameraMode: mode });
    }
  }, [controllerRef]);

  const toggleCameraMode = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl?.handleCameraCommand) return;

    // Read directly from window state since controller owns the truth
    const cc = (window as any).__pf_webgpu_camera_controller;
    const current = cc?.state?.cameraMode ?? 'turntable';
    const next = current === 'turntable' ? 'arcball' : 'turntable';
    ctrl.handleCameraCommand({ cameraMode: next });
  }, [controllerRef]);

  const setProjection = useCallback((mode: 'perspective' | 'ortho') => {
    const ctrl = controllerRef.current;
    if (!ctrl?.handleCameraCommand) return;
    ctrl.handleCameraCommand({ projectionMode: mode });
  }, [controllerRef]);

  const toggleProjection = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl?.handleCameraCommand) return;

    // Read directly from window state
    const cc = (window as any).__pf_webgpu_camera_controller;
    const current = cc?.state?.projectionMode ?? 'ortho';
    const next = current === 'perspective' ? 'ortho' : 'perspective';
    ctrl.handleCameraCommand({ projectionMode: next });
  }, [controllerRef]);

  const setAutoRotate = useCallback((enabled: boolean) => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    if (typeof ctrl.setAutoRotate === 'function') {
      ctrl.setAutoRotate(enabled);
    }
  }, [controllerRef]);

  const toggleAutoRotate = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    // Use controller's toggle method directly
    if (typeof ctrl.toggleAutoRotate === 'function') {
      ctrl.toggleAutoRotate();
    } else if (typeof ctrl.getAutoRotate === 'function' && typeof ctrl.setAutoRotate === 'function') {
      ctrl.setAutoRotate(!ctrl.getAutoRotate());
    }
  }, [controllerRef]);

  const toggleGrid = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl?.handleCameraCommand) return;
    // WebGPU expects toggleGrid: true, not showGrid: value
    ctrl.handleCameraCommand({ toggleGrid: true });
  }, [controllerRef]);

  const toggleAxis = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl?.handleCameraCommand) return;
    // WebGPU expects toggleAxis: true, not showAxis: value
    ctrl.handleCameraCommand({ toggleAxis: true });
  }, [controllerRef]);

  const takeScreenshot = useCallback(async (): Promise<Blob | null> => {
    const canvas = canvasRef?.current;
    if (!canvas) return null;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  }, [canvasRef]);

  const applyViewPreset = useCallback((preset: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'iso') => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;

    if (typeof ctrl.handleCameraCommand === 'function') {
      ctrl.handleCameraCommand({ viewPreset: preset });
    }
  }, [controllerRef]);

  const updateParams = useCallback((params: Record<string, unknown>) => {
    const ctrl = controllerRef.current;
    if (!ctrl) {
      console.warn('[ControllerContext] updateParams called but controller not ready');
      return;
    }

    if (typeof ctrl.updateParams === 'function') {
      console.log('[ControllerContext] updateParams:', params);
      ctrl.updateParams(params);
    } else {
      console.warn('[ControllerContext] controller.updateParams not available');
    }
  }, [controllerRef]);

  // Set local params lock to prevent Python params from overwriting locally-loaded designs
  const setLocalParamsLock = useCallback((durationMs: number) => {
    if (localParamsLockRef) {
      localParamsLockRef.current = Date.now() + durationMs;
      console.debug('[ControllerContext] Local params lock set for', durationMs, 'ms');
    }
  }, [localParamsLockRef]);

  // Memoize context value
  const value = useMemo<ControllerContextValue>(
    () => ({
      controllerRef,
      isReady,
      cameraState,
      resetCamera,
      setCameraMode,
      toggleCameraMode,
      setProjection,
      toggleProjection,
      setAutoRotate,
      toggleAutoRotate,
      toggleGrid,
      toggleAxis,
      takeScreenshot,
      applyViewPreset,
      updateParams,
      setLocalParamsLock,
    }),
    [
      controllerRef,
      isReady,
      cameraState,
      resetCamera,
      setCameraMode,
      toggleCameraMode,
      setProjection,
      toggleProjection,
      setAutoRotate,
      toggleAutoRotate,
      toggleGrid,
      toggleAxis,
      takeScreenshot,
      applyViewPreset,
      updateParams,
      setLocalParamsLock,
    ]
  );

  return (
    <ControllerContext.Provider value={value}>
      {children}
    </ControllerContext.Provider>
  );
};
