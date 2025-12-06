/**
 * Re-exports for all state slices.
 * 
 * @module state/slices
 */

export { createGeometrySlice, type GeometrySlice } from './geometry';
export { 
  createStyleSlice, 
  type StyleSlice,
  STYLE_SCHEMAS,
  getDefaultStyleOpts,
} from './style';
export { createUISlice, type UISlice } from './ui';
export { 
  createMeshSlice, 
  type MeshSlice,
  QUALITY_PRESETS,
  type QualityPreset,
} from './mesh';
export { 
  createAppearanceSlice, 
  type AppearanceSlice,
  COLOR_SCHEMES,
  LIGHTING_PRESETS,
  BACKGROUND_GRADIENTS,
  type ColorScheme,
  type LightingPreset,
  type BackgroundGradient,
} from './appearance';
export { createPerformanceSlice, type PerformanceSlice } from './performance';
