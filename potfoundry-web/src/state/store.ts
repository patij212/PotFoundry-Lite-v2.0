/**
 * Combined Zustand store for the application.
 * 
 * This file creates the main store by combining all slices using Zustand's
 * slice pattern. It also sets up middleware for persistence and devtools.
 * 
 * @module state/store
 */

import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { useShallow } from 'zustand/shallow';
import {
  GeometrySlice,
  StyleSlice,
  UISlice,
  MeshSlice,
  AppearanceSlice,
  PerformanceSlice,
  createGeometrySlice,
  createStyleSlice,
  createUISlice,
  createMeshSlice,
  createAppearanceSlice,
  createPerformanceSlice,
} from './slices';

// ============================================================================
// Combined Store Type
// ============================================================================

/**
 * Combined type for the complete store.
 */
export type AppStore = GeometrySlice &
  StyleSlice &
  UISlice &
  MeshSlice &
  AppearanceSlice &
  PerformanceSlice;

// ============================================================================
// Persistence Configuration
// ============================================================================

/**
 * Keys to persist in local storage.
 * We persist user preferences but not transient state.
 */
const PERSISTED_KEYS: (keyof AppStore)[] = [
  'geometry',
  'style',
  'mesh',
  'appearance',
];

// ============================================================================
// Store Creation
// ============================================================================

/**
 * The main application store.
 * 
 * Combines all slices with middleware:
 * - devtools: Redux DevTools integration (dev only)
 * - persist: Local storage persistence for preferences
 * - subscribeWithSelector: Efficient subscription to state slices
 * 
 * @example
 * ```tsx
 * import { useAppStore } from './state/store';
 * 
 * function MyComponent() {
 *   const geometry = useAppStore((state) => state.geometry);
 *   const setGeometryParam = useAppStore((state) => state.setGeometryParam);
 *   
 *   return (
 *     <Slider
 *       value={geometry.H}
 *       onChange={(v) => setGeometryParam('H', v)}
 *     />
 *   );
 * }
 * ```
 */
export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      subscribeWithSelector((...a) => ({
        ...createGeometrySlice(...a),
        ...createStyleSlice(...a),
        ...createUISlice(...a),
        ...createMeshSlice(...a),
        ...createAppearanceSlice(...a),
        ...createPerformanceSlice(...a),
      })),
      {
        name: 'potfoundry-store',
        partialize: (state) => {
          // Only persist specific keys
          const persisted: Partial<AppStore> = {};
          for (const key of PERSISTED_KEYS) {
            (persisted as Record<string, unknown>)[key] = state[key];
          }
          return persisted;
        },
      }
    ),
    {
      name: 'PotFoundry',
      enabled: import.meta.env.DEV,
    }
  )
);

// Expose store globally for save/load functionality
if (typeof window !== 'undefined') {
  window.__POTFOUNDRY_STORE__ = useAppStore;
}

// ============================================================================
// Selector Hooks
// ============================================================================

/**
 * Convenience selectors for common state access patterns.
 * These help prevent unnecessary re-renders by selecting only needed state.
 */

/** Select geometry parameters */
export const useGeometry = () => useAppStore((s) => s.geometry);

/** Select style state */
export const useStyle = () => useAppStore((s) => s.style);

/** Select UI state */
export const useUI = () => useAppStore((s) => s.ui);

/** Select mesh quality */
export const useMesh = () => useAppStore((s) => s.mesh);

/** Select appearance */
export const useAppearance = () => useAppStore((s) => s.appearance);

/** Select performance metrics */
export const usePerformance = () => useAppStore((s) => s.performance);

// ============================================================================
// Action Hooks
// ============================================================================

/**
 * Convenience hooks for accessing actions.
 * Using useShallow to prevent unnecessary re-renders when actions are the same.
 */

/** Get all geometry actions */
export const useGeometryActions = () =>
  useAppStore(
    useShallow((s) => ({
      setGeometryParam: s.setGeometryParam,
      setGeometryParams: s.setGeometryParams,
      resetGeometry: s.resetGeometry,
      validateGeometry: s.validateGeometry,
    }))
  );

/** Get all style actions */
export const useStyleActions = () =>
  useAppStore(
    useShallow((s) => ({
      setStyle: s.setStyle,
      setStyleOpt: s.setStyleOpt,
      setStyleOpts: s.setStyleOpts,
      resetStyleOpts: s.resetStyleOpts,
      getStyleSchema: s.getStyleSchema,
    }))
  );

/** Get all UI actions */
export const useUIActions = () =>
  useAppStore(
    useShallow((s) => ({
      togglePanel: s.togglePanel,
      setPanelOpen: s.setPanelOpen,
      setActiveTab: s.setActiveTab,
      openModal: s.openModal,
      closeModal: s.closeModal,
      toggleFullscreen: s.toggleFullscreen,
      setFullscreen: s.setFullscreen,
      resetUI: s.resetUI,
      setUITheme: s.setUITheme,
      setV2ActiveTab: s.setV2ActiveTab,
      toggleZenMode: s.toggleZenMode,
      setDensity: s.setDensity,
      setHapticsEnabled: s.setHapticsEnabled,
      beginHistoryTransaction: s.beginHistoryTransaction,
      commitHistoryTransaction: s.commitHistoryTransaction,
      undo: s.undo,
      redo: s.redo,
    }))
  );

/** Get all mesh actions */
export const useMeshActions = () =>
  useAppStore(
    useShallow((s) => ({
      setMeshParam: s.setMeshParam,
      setMeshParams: s.setMeshParams,
      setQualityPreset: s.setQualityPreset,
      resetMeshQuality: s.resetMeshQuality,
      estimateTriangles: s.estimateTriangles,
    }))
  );

/** Get all appearance actions */
export const useAppearanceActions = () =>
  useAppStore(
    useShallow((s) => ({
      setColorScheme: s.setColorScheme,
      setPrimaryColor: s.setPrimaryColor,
      setMidColor: s.setMidColor,
      setSecondaryColor: s.setSecondaryColor,
      toggleWireframe: s.toggleWireframe,
      setShowWireframe: s.setShowWireframe,
      toggleInner: s.toggleInner,
      setShowInner: s.setShowInner,
      setBackgroundGradient: s.setBackgroundGradient,
      setCustomGradient: s.setCustomGradient,
      setGradientAngle: s.setGradientAngle,
      setLightingPreset: s.setLightingPreset,
      resetAppearance: s.resetAppearance,
    }))
  );

/** Get all performance actions */
export const usePerformanceActions = () =>
  useAppStore(
    useShallow((s) => ({
      setGenerationTime: s.setGenerationTime,
      setRenderTime: s.setRenderTime,
      setMeshStats: s.setMeshStats,
      setIsGenerating: s.setIsGenerating,
      recordGeneration: s.recordGeneration,
      resetPerformance: s.resetPerformance,
    }))
  );

// ============================================================================
// Store Subscriptions
// ============================================================================

/**
 * Subscribe to geometry changes for mesh regeneration.
 * Returns unsubscribe function.
 * 
 * @param callback - Function to call when geometry changes
 * @returns Unsubscribe function
 */
export function subscribeToGeometry(
  callback: (geometry: AppStore['geometry']) => void
) {
  return useAppStore.subscribe(
    (state) => state.geometry,
    callback,
    { equalityFn: Object.is }
  );
}

/**
 * Subscribe to style changes for mesh regeneration.
 * Returns unsubscribe function.
 * 
 * @param callback - Function to call when style changes
 * @returns Unsubscribe function
 */
export function subscribeToStyle(
  callback: (style: AppStore['style']) => void
) {
  return useAppStore.subscribe(
    (state) => state.style,
    callback,
    { equalityFn: Object.is }
  );
}

/**
 * Subscribe to appearance changes for rendering updates.
 * Returns unsubscribe function.
 * 
 * @param callback - Function to call when appearance changes
 * @returns Unsubscribe function
 */
export function subscribeToAppearance(
  callback: (appearance: AppStore['appearance']) => void
) {
  return useAppStore.subscribe(
    (state) => state.appearance,
    callback,
    { equalityFn: Object.is }
  );
}
