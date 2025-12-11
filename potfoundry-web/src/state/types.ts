/**
 * Type definitions for the application state.
 * 
 * This file defines all interfaces and types used throughout the state
 * management system. It ensures type safety and provides clear contracts
 * for state shape and actions.
 */

// ============================================================================
// Geometry Parameters
// ============================================================================

/**
 * Core geometric parameters for pot generation.
 * All measurements are in millimeters unless otherwise noted.
 */
export interface GeometryParams {
  /** Total height of the pot (20-500mm) */
  H: number;
  /** Top outer diameter (30-400mm) */
  top_od: number;
  /** Bottom outer diameter (30-400mm) */
  bottom_od: number;
  /** Wall thickness (1.5-20mm) */
  t_wall: number;
  /** Bottom thickness (2.0-30mm) */
  t_bottom: number;
  /** Drain hole radius (0-50mm, 0 = no drain) */
  r_drain: number;
  /** Flare exponent controlling curve shape (0.5-4.0) */
  expn: number;
  /** Bulge amplitude: positive=outward bulge, negative=inward dent (-0.5 to 0.5) */
  bellAmp: number;
  /** Bulge center position along height (0-1, 0.5 = middle) */
  bellCenter: number;
  /** Bulge width factor (0.1-1.0, smaller = narrower band) */
  bellWidth: number;
  /** Twist turns from base to rim (positive = counterclockwise) */
  spinTurns: number;
  /** Twist phase offset in degrees */
  spinPhase: number;
  /** Twist curve exponent (1=linear, <1=front-loaded, >1=back-loaded) */
  spinCurve: number;
}

/** Default geometry values for a standard pot */
export const DEFAULT_GEOMETRY: GeometryParams = {
  H: 120,
  top_od: 140,
  bottom_od: 90,
  t_wall: 3.0,
  t_bottom: 3.0,
  r_drain: 10.0,
  expn: 1.1,
  bellAmp: 0.0,
  bellCenter: 0.5,
  bellWidth: 0.22,
  spinTurns: 0.0,
  spinPhase: 0.0,
  spinCurve: 1.0,
};

/** Bounds for geometry parameter validation */
export const GEOMETRY_BOUNDS = {
  H: { min: 20, max: 500, step: 1 },
  top_od: { min: 30, max: 400, step: 1 },
  bottom_od: { min: 30, max: 400, step: 1 },
  t_wall: { min: 1.5, max: 20, step: 0.1 },
  t_bottom: { min: 2.0, max: 30, step: 0.1 },
  r_drain: { min: 0, max: 50, step: 0.5 },
  expn: { min: 0.5, max: 4.0, step: 0.05 },
  bellAmp: { min: -1.0, max: 1.0, step: 0.01 },
  bellCenter: { min: -0.1, max: 1.1, step: 0.05 },
  bellWidth: { min: 0.01, max: 1.0, step: 0.01 },
  spinTurns: { min: -3.0, max: 3.0, step: 0.05 },
  spinPhase: { min: 0, max: 360, step: 5 },
  spinCurve: { min: 0.2, max: 3.0, step: 0.05 },
} as const;

// ============================================================================
// Style Configuration
// ============================================================================

/**
 * Schema definition for a single style parameter.
 * Used to generate UI controls dynamically.
 */
export interface ParamSchema {
  type: 'float' | 'int' | 'bool';
  min?: number;
  max?: number;
  step?: number;
  default: number | boolean;
  label: string;
  description?: string;
  unit?: string;
}

/**
 * Complete schema for a style, including all its parameters.
 */
export interface StyleSchema {
  name: string;
  description: string;
  params: Record<string, ParamSchema>;
  /** Optional advanced parameters shown in collapsible section */
  advancedParams?: Record<string, ParamSchema>;
}

/**
 * Style-specific option values.
 * Keys correspond to param names in the style schema.
 */
export type StyleOpts = Record<string, number | boolean>;

/**
 * Current style configuration state.
 */
export interface StyleState {
  /** Currently selected style name */
  name: string;
  /** Style-specific parameter values */
  opts: StyleOpts;
}

/** Available style names - must match Python STYLES dictionary */
export type StyleName =
  | 'SuperformulaBlossom'
  | 'FourierBloom'
  | 'SpiralRidges'
  | 'SuperellipseMorph'
  | 'HarmonicRipple'
  | 'LowPolyFacet';

/** Default style - uses STYLE_SCHEMAS parameter names */
export const DEFAULT_STYLE: StyleState = {
  name: 'HarmonicRipple',
  opts: {
    hr_petals: 7,
    hr_petal_amp: 0.16,
    hr_ripple_freq: 31,
    hr_ripple_amp: 0.03,
    hr_bell: 0.05,
  },
};

// ============================================================================
// Mesh Quality
// ============================================================================

/**
 * Mesh resolution settings for preview and export.
 */
export interface MeshQuality {
  /** Angular resolution for preview (24-720) */
  preview_n_theta: number;
  /** Vertical resolution for preview (8-360) */
  preview_n_z: number;
  /** Angular resolution for export (48-2048) */
  export_n_theta: number;
  /** Vertical resolution for export (16-1024) */
  export_n_z: number;
}

/** Default mesh quality settings */
export const DEFAULT_MESH_QUALITY: MeshQuality = {
  preview_n_theta: 168,
  preview_n_z: 84,
  export_n_theta: 336,
  export_n_z: 168,
};

/** Bounds for mesh quality parameters */
export const MESH_QUALITY_BOUNDS = {
  preview_n_theta: { min: 24, max: 720, step: 12 },
  preview_n_z: { min: 8, max: 360, step: 4 },
  export_n_theta: { min: 48, max: 2048, step: 24 },
  export_n_z: { min: 16, max: 1024, step: 8 },
} as const;

// ============================================================================
// Appearance Settings
// ============================================================================

/**
 * Visual appearance configuration.
 */
export interface AppearanceState {
  /** Color scheme identifier */
  colorScheme: string;
  /** Primary mesh color (hex) - bottom of pot gradient */
  primaryColor: string;
  /** Mid mesh color (hex) - middle of pot gradient */
  midColor: string;
  /** Secondary/accent color (hex) - top of pot gradient */
  secondaryColor: string;
  /** Whether to show inner surface */
  showInner: boolean;
  /** Whether to show wireframe overlay */
  showWireframe: boolean;
  /** Background color (solid) - first color used */
  gradient: [string, string];
  /** Lighting preset name */
  lightingPreset: string;
}

/** Default appearance settings */
export const DEFAULT_APPEARANCE: AppearanceState = {
  colorScheme: 'terracotta',
  primaryColor: '#c75b39',
  midColor: '#cf7a5c',
  secondaryColor: '#d4a574',
  showInner: true,
  showWireframe: false,
  gradient: ['#1a1a2e', '#16213e'],
  lightingPreset: 'studio',
};

// ============================================================================
// UI State
// ============================================================================

/**
 * UI panel and modal state.
 */
export interface UIState {
  /** Whether the control panel is open */
  panelOpen: boolean;
  /** Currently active tab in the panel */
  activeTab: 'controls' | 'presets' | 'export' | 'metrics';
  /** Currently open modal, if any */
  modalOpen: 'export' | 'presets' | 'settings' | 'about' | null;
  /** Whether the app is in fullscreen mode */
  fullscreen: boolean;
}

/** Default UI state */
export const DEFAULT_UI_STATE: UIState = {
  panelOpen: true,
  activeTab: 'controls',
  modalOpen: null,
  fullscreen: false,
};

// ============================================================================
// Performance Metrics
// ============================================================================

/**
 * Performance and mesh statistics.
 */
export interface PerformanceState {
  /** Last mesh generation time in ms */
  generationTime: number;
  /** Last render time in ms */
  renderTime: number;
  /** Number of triangles in current mesh */
  triangleCount: number;
  /** Number of vertices in current mesh */
  vertexCount: number;
  /** Estimated volume in mm³ */
  volume: number;
  /** Estimated surface area in mm² */
  surfaceArea: number;
  /** Whether mesh generation is in progress */
  isGenerating: boolean;
}

/** Default performance state */
export const DEFAULT_PERFORMANCE: PerformanceState = {
  generationTime: 0,
  renderTime: 0,
  triangleCount: 0,
  vertexCount: 0,
  volume: 0,
  surfaceArea: 0,
  isGenerating: false,
};

// ============================================================================
// Presets
// ============================================================================

/**
 * A saved preset configuration.
 */
export interface Preset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Style name */
  style: string;
  /** Geometry parameters */
  geometry: GeometryParams;
  /** Style-specific options */
  opts: StyleOpts;
  /** Creation timestamp */
  createdAt: number;
  /** Whether this is a built-in preset */
  isBuiltIn: boolean;
}

/**
 * Preset management state.
 */
export interface PresetsState {
  /** Built-in presets organized by style */
  builtIn: Record<string, Preset[]>;
  /** User-created presets */
  user: Preset[];
  /** Currently applied preset, if any */
  activePreset: Preset | null;
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export job status.
 */
export type ExportStatus = 'pending' | 'generating' | 'complete' | 'error';

/**
 * A single export job.
 */
export interface ExportJob {
  /** Unique job ID */
  id: string;
  /** Output filename */
  filename: string;
  /** Export format */
  format: 'stl' | 'obj';
  /** Current status */
  status: ExportStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp when job was created */
  createdAt: number;
  /** Timestamp when job completed */
  completedAt?: number;
}

/**
 * Export queue state.
 */
export interface ExportState {
  /** Jobs waiting to be processed */
  queue: ExportJob[];
  /** Currently processing job */
  current: ExportJob | null;
  /** Completed jobs (recent history) */
  history: ExportJob[];
}

/** Default export state */
export const DEFAULT_EXPORT_STATE: ExportState = {
  queue: [],
  current: null,
  history: [],
};

// ============================================================================
// Combined Store Type
// ============================================================================

/**
 * Complete application state shape.
 */
export interface AppState {
  geometry: GeometryParams;
  style: StyleState;
  mesh: MeshQuality;
  appearance: AppearanceState;
  ui: UIState;
  performance: PerformanceState;
  presets: PresetsState;
  export: ExportState;
}
