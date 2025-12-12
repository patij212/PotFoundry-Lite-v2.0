/**
 * Performance metrics state slice for Zustand store.
 * 
 * Tracks mesh generation time, render performance, and mesh statistics.
 * 
 * @module state/slices/performance
 */

import { StateCreator } from 'zustand';
import { PerformanceState, DEFAULT_PERFORMANCE } from '../types';

// ============================================================================
// Slice Interface
// ============================================================================

/**
 * Performance slice state and actions.
 */
export interface PerformanceSlice {
  /** Current performance metrics */
  performance: PerformanceState;
  
  /**
   * Update mesh generation time.
   * 
   * @param time - Generation time in milliseconds
   */
  setGenerationTime: (time: number) => void;
  
  /**
   * Update render time.
   * 
   * @param time - Render time in milliseconds
   */
  setRenderTime: (time: number) => void;
  
  /**
   * Update mesh statistics.
   * 
   * @param stats - Mesh statistics object
   */
  setMeshStats: (stats: {
    triangleCount: number;
    vertexCount: number;
    volume?: number;
    surfaceArea?: number;
  }) => void;
  
  /**
   * Set the generating state.
   * 
   * @param isGenerating - Whether mesh generation is in progress
   */
  setIsGenerating: (isGenerating: boolean) => void;
  
  /**
   * Record a complete generation cycle with all metrics.
   * 
   * @param metrics - All performance metrics from a generation
   */
  recordGeneration: (metrics: {
    generationTime: number;
    triangleCount: number;
    vertexCount: number;
    volume?: number;
    surfaceArea?: number;
  }) => void;
  
  /**
   * Reset performance metrics to defaults.
   */
  resetPerformance: () => void;
}

// ============================================================================
// Slice Creator
// ============================================================================

/**
 * Create the performance slice.
 */
export const createPerformanceSlice: StateCreator<
  PerformanceSlice,
  [],
  [],
  PerformanceSlice
> = (set) => ({
  performance: { ...DEFAULT_PERFORMANCE },
  
  setGenerationTime: (time) => {
    set((state) => ({
      performance: {
        ...state.performance,
        generationTime: time,
      },
    }));
  },
  
  setRenderTime: (time) => {
    set((state) => ({
      performance: {
        ...state.performance,
        renderTime: time,
      },
    }));
  },
  
  setMeshStats: (stats) => {
    set((state) => ({
      performance: {
        ...state.performance,
        triangleCount: stats.triangleCount,
        vertexCount: stats.vertexCount,
        volume: stats.volume ?? state.performance.volume,
        surfaceArea: stats.surfaceArea ?? state.performance.surfaceArea,
      },
    }));
  },
  
  setIsGenerating: (isGenerating) => {
    set((state) => ({
      performance: {
        ...state.performance,
        isGenerating,
      },
    }));
  },
  
  recordGeneration: (metrics) => {
    set((state) => ({
      performance: {
        ...state.performance,
        generationTime: metrics.generationTime,
        triangleCount: metrics.triangleCount,
        vertexCount: metrics.vertexCount,
        volume: metrics.volume ?? state.performance.volume,
        surfaceArea: metrics.surfaceArea ?? state.performance.surfaceArea,
        isGenerating: false,
      },
    }));
  },
  
  resetPerformance: () => {
    set({ performance: { ...DEFAULT_PERFORMANCE } });
  },
});
