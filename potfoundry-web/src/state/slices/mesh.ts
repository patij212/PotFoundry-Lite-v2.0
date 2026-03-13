/**
 * Mesh quality state slice for Zustand store.
 * 
 * Manages mesh resolution settings for both preview and export.
 * 
 * @module state/slices/mesh
 */

import { StateCreator } from 'zustand';
import {
  MeshQuality,
  DEFAULT_MESH_QUALITY,
  MESH_QUALITY_BOUNDS,
} from '../types';

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * Mesh quality slice state and actions.
 */
export interface MeshSlice {
  /** Current mesh quality settings */
  mesh: MeshQuality;

  /**
   * Update a single mesh quality parameter.
   * 
   * @param key - Parameter name
   * @param value - New value
   */
  setMeshParam: <K extends keyof MeshQuality>(
    key: K,
    value: MeshQuality[K]
  ) => void;

  /**
   * Update multiple mesh quality parameters.
   * 
   * @param params - Parameters to update
   */
  setMeshParams: (params: Partial<MeshQuality>) => void;

  /**
   * Apply a preset quality level.
   * 
   * @param level - Quality preset ('draft', 'standard', 'high', 'ultra')
   */
  setQualityPreset: (level: QualityPreset) => void;

  /**
   * Reset mesh quality to defaults.
   */
  resetMeshQuality: () => void;

  /**
   * Estimate triangle count for current quality settings.
   * 
   * @returns Approximate triangle count
   */
  estimateTriangles: () => number;
}

// ============================================================================
// Quality Presets
// ============================================================================

export type QualityPreset = 'draft' | 'standard' | 'high' | 'ultra';

/**
 * Predefined quality presets for common use cases.
 */
export const QUALITY_PRESETS: Record<QualityPreset, MeshQuality> = {
  draft: {
    preview_n_theta: 256,
    preview_n_z: 128,
    export_n_theta: 512,
    export_n_z: 256,
    seamAngle: 0,
    optimize: false,
  },
  standard: {
    preview_n_theta: 512,
    preview_n_z: 256,
    export_n_theta: 1024,
    export_n_z: 512,
    seamAngle: 0,
    optimize: false,
  },
  high: {
    preview_n_theta: 1024,
    preview_n_z: 512,
    export_n_theta: 2048,
    export_n_z: 1024,
    seamAngle: 0,
    optimize: true, // Default high to optimized?
  },
  ultra: {
    preview_n_theta: 2048,
    preview_n_z: 1024,
    export_n_theta: 2048,
    export_n_z: 1024,
    seamAngle: 0,
    optimize: true,
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clamp a mesh quality parameter to valid bounds.
 * 
 * @param key - Parameter name
 * @param value - Value to clamp
 * @returns Clamped value
 */
function clampMeshParam<K extends keyof typeof MESH_QUALITY_BOUNDS>(
  key: K,
  value: number
): number {
  const bounds = MESH_QUALITY_BOUNDS[key];
  return Math.max(bounds.min, Math.min(bounds.max, value));
}

/**
 * Estimate approximate triangle count for mesh parameters.
 * 
 * The mesh consists of:
 * - Outer wall: n_theta * n_z * 2 triangles
 * - Inner wall: n_theta * n_z * 2 triangles
 * - Bottom: ~n_theta * 4 triangles
 * - Rim: n_theta * 2 triangles
 * - Drain: ~n_theta triangles
 * 
 * @param params - Mesh quality parameters
 * @returns Approximate triangle count for preview
 */
function estimateTriangleCount(params: MeshQuality): number {
  const { preview_n_theta, preview_n_z } = params;

  // Walls (outer + inner)
  const wallTriangles = preview_n_theta * preview_n_z * 2 * 2;

  // Bottom and top surfaces
  const endTriangles = preview_n_theta * 6;

  return wallTriangles + endTriangles;
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the mesh quality slice.
 */
export const createMeshSlice: StateCreator<
  MeshSlice,
  [],
  [],
  MeshSlice
> = (set, get) => ({
  mesh: { ...DEFAULT_MESH_QUALITY },

  setMeshParam: (key, value) => {
    set((state) => ({
      mesh: {
        ...state.mesh,
        [key]: typeof value === 'number' && key in MESH_QUALITY_BOUNDS
          ? clampMeshParam(key as keyof typeof MESH_QUALITY_BOUNDS, value)
          : value,
      },
    }));
  },

  setMeshParams: (params) => {
    set((state) => {
      const clampedParams: Partial<MeshQuality> = {};

      for (const [key, value] of Object.entries(params)) {
        const paramKey = key as keyof MeshQuality;
        // Only clamp numeric values that have bounds defined
        if (typeof value === 'number' && paramKey in MESH_QUALITY_BOUNDS) {
          (clampedParams as Record<string, number>)[paramKey] = clampMeshParam(paramKey as keyof typeof MESH_QUALITY_BOUNDS, value);
        } else {
          // Pass through boolean/other values unchanged
          (clampedParams as Record<string, unknown>)[paramKey] = value;
        }
      }

      return {
        mesh: {
          ...state.mesh,
          ...clampedParams,
        },
      };
    });
  },

  setQualityPreset: (level) => {
    set({ mesh: { ...QUALITY_PRESETS[level] } });
  },

  resetMeshQuality: () => {
    set({ mesh: { ...DEFAULT_MESH_QUALITY } });
  },

  estimateTriangles: () => {
    return estimateTriangleCount(get().mesh);
  },
});
