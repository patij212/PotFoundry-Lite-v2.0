/**
 * State management module for PotFoundry.
 * 
 * This module provides centralized state management using Zustand.
 * It exports the store, hooks, types, and utilities for state access.
 * 
 * @module state
 * 
 * @example
 * ```tsx
 * import { useAppStore, useGeometry, useGeometryActions } from '@/state';
 * 
 * function GeometryControls() {
 *   const geometry = useGeometry();
 *   const { setGeometryParam } = useGeometryActions();
 *   
 *   return (
 *     <input
 *       type="range"
 *       value={geometry.H}
 *       onChange={(e) => setGeometryParam('H', Number(e.target.value))}
 *     />
 *   );
 * }
 * ```
 */

// Core store and hooks
export {
  useAppStore,
  // State selectors
  useGeometry,
  useStyle,
  useUI,
  useMesh,
  useAppearance,
  usePerformance,
  // Action hooks
  useGeometryActions,
  useStyleActions,
  useUIActions,
  useMeshActions,
  useAppearanceActions,
  usePerformanceActions,
  // Subscriptions
  subscribeToGeometry,
  subscribeToStyle,
  subscribeToAppearance,
  // Types
  type AppStore,
} from './store';

// Types
export {
  // Geometry
  type GeometryParams,
  DEFAULT_GEOMETRY,
  GEOMETRY_BOUNDS,
  // Style
  type StyleState,
  type StyleOpts,
  type StyleSchema,
  type ParamSchema,
  type StyleName,
  DEFAULT_STYLE,
  // Mesh
  type MeshQuality,
  DEFAULT_MESH_QUALITY,
  MESH_QUALITY_BOUNDS,
  // Appearance
  type AppearanceState,
  DEFAULT_APPEARANCE,
  // UI
  type UIState,
  DEFAULT_UI_STATE,
  // Performance
  type PerformanceState,
  DEFAULT_PERFORMANCE,
  // Export
  type ExportStatus,
  type ExportJob,
  type ExportState,
  DEFAULT_EXPORT_STATE,
  // Presets
  type Preset,
  type PresetsState,
  // Combined
  type AppState,
} from './types';

// Slice-specific exports
export {
  // Style schemas and helpers
  STYLE_SCHEMAS,
  getDefaultStyleOpts,
  // Quality presets
  QUALITY_PRESETS,
  type QualityPreset,
  // Appearance options
  COLOR_SCHEMES,
  LIGHTING_PRESETS,
  BACKGROUND_GRADIENTS,
  type ColorScheme,
  type LightingPreset,
  type BackgroundGradient,
} from './slices';
