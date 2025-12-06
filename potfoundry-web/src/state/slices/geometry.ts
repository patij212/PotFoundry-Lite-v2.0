/**
 * Geometry state slice for Zustand store.
 * 
 * Manages all geometric parameters for pot generation including dimensions,
 * wall thickness, drain hole, and profile curve settings.
 * 
 * @module state/slices/geometry
 */

import { StateCreator } from 'zustand';
import {
  GeometryParams,
  DEFAULT_GEOMETRY,
  GEOMETRY_BOUNDS,
} from '../types';

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * Geometry slice state and actions.
 */
export interface GeometrySlice {
  /** Current geometry parameters */
  geometry: GeometryParams;
  
  /**
   * Update a single geometry parameter.
   * Automatically clamps to valid bounds.
   * 
   * @param key - Parameter name to update
   * @param value - New value
   */
  setGeometryParam: <K extends keyof GeometryParams>(
    key: K,
    value: GeometryParams[K]
  ) => void;
  
  /**
   * Update multiple geometry parameters at once.
   * Useful for applying presets or bulk updates.
   * 
   * @param params - Partial geometry params to merge
   */
  setGeometryParams: (params: Partial<GeometryParams>) => void;
  
  /**
   * Reset geometry to default values.
   */
  resetGeometry: () => void;
  
  /**
   * Validate and return any geometry constraint violations.
   * 
   * @returns Array of validation error messages
   */
  validateGeometry: () => string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clamp a numeric value to valid bounds for a parameter.
 * 
 * @param key - Parameter name
 * @param value - Value to clamp
 * @returns Clamped value
 */
function clampParam<K extends keyof typeof GEOMETRY_BOUNDS>(
  key: K,
  value: number
): number {
  const bounds = GEOMETRY_BOUNDS[key];
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

/**
 * Validate that geometry parameters are internally consistent.
 * 
 * @param params - Geometry parameters to validate
 * @returns Array of validation error messages (empty if valid)
 */
function validateParams(params: GeometryParams): string[] {
  const errors: string[] = [];
  
  // Wall thickness constraints
  const minRadius = Math.min(params.top_od, params.bottom_od) / 2;
  if (params.t_wall >= minRadius) {
    errors.push(
      `Wall thickness (${params.t_wall}mm) must be less than half the smallest diameter`
    );
  }
  
  // Drain hole constraint
  const effectiveBottomRadius = params.bottom_od / 2 - params.t_wall;
  if (params.r_drain > 0 && params.r_drain >= effectiveBottomRadius) {
    errors.push(
      `Drain radius (${params.r_drain}mm) must be smaller than inner bottom radius`
    );
  }
  
  // Height constraint
  if (params.H < params.t_bottom + 10) {
    errors.push(
      `Height (${params.H}mm) must be at least ${params.t_bottom + 10}mm for bottom thickness`
    );
  }
  
  return errors;
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the geometry slice.
 * 
 * This is a Zustand slice creator that can be combined with other slices
 * to form the complete store.
 */
export const createGeometrySlice: StateCreator<
  GeometrySlice,
  [],
  [],
  GeometrySlice
> = (set, get) => ({
  geometry: { ...DEFAULT_GEOMETRY },
  
  setGeometryParam: (key, value) => {
    set((state) => {
      // Clamp value to valid bounds
      const clampedValue = typeof value === 'number'
        ? clampParam(key as keyof typeof GEOMETRY_BOUNDS, value)
        : value;
      
      return {
        geometry: {
          ...state.geometry,
          [key]: clampedValue,
        },
      };
    });
  },
  
  setGeometryParams: (params) => {
    set((state) => {
      // Clamp all numeric values to valid bounds
      const clampedParams: Partial<GeometryParams> = {};
      
      for (const [key, value] of Object.entries(params)) {
        const paramKey = key as keyof GeometryParams;
        if (typeof value === 'number' && paramKey in GEOMETRY_BOUNDS) {
          clampedParams[paramKey] = clampParam(
            paramKey as keyof typeof GEOMETRY_BOUNDS,
            value
          );
        }
      }
      
      return {
        geometry: {
          ...state.geometry,
          ...clampedParams,
        },
      };
    });
  },
  
  resetGeometry: () => {
    set({ geometry: { ...DEFAULT_GEOMETRY } });
  },
  
  validateGeometry: () => {
    return validateParams(get().geometry);
  },
});
