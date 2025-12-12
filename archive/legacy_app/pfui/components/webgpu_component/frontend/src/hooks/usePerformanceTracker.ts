/**
 * Performance tracking hook for WebGPU renderer metrics.
 * 
 * Listens for performance events from the WebGPU controller and
 * updates the performance slice in the Zustand store.
 * 
 * @module hooks/usePerformanceTracker
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../state';

// ============================================================================
// Types
// ============================================================================

export interface PerformanceMetrics {
  triangleCount: number;
  vertexCount: number;
  generationTime: number;
  renderTime?: number;
  volume?: number;
  surfaceArea?: number;
}

export interface PerformanceTrackerOptions {
  /** Throttle interval for updating store (ms) */
  throttleMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

const DEFAULT_OPTIONS: Required<PerformanceTrackerOptions> = {
  throttleMs: 100,
  debug: false,
};

// ============================================================================
// Hook
// ============================================================================

/**
 * Track performance metrics from WebGPU renderer.
 * 
 * This hook provides a callback that should be invoked from the
 * render loop or mesh generation callback to update metrics.
 * 
 * @param options - Configuration options
 * @returns Object with updateMetrics callback
 * 
 * @example
 * ```tsx
 * function Renderer() {
 *   const { updateMetrics, setGenerating } = usePerformanceTracker();
 *   
 *   useEffect(() => {
 *     // After mesh generation
 *     updateMetrics({
 *       triangleCount: mesh.triangles.length,
 *       vertexCount: mesh.vertices.length,
 *       generationTime: endTime - startTime,
 *     });
 *   }, [mesh]);
 * }
 * ```
 */
export function usePerformanceTracker(options: PerformanceTrackerOptions = {}) {
  // Extract options with defaults to stable values
  const throttleMs = options.throttleMs ?? DEFAULT_OPTIONS.throttleMs;
  const debug = options.debug ?? DEFAULT_OPTIONS.debug;
  
  // Use ref for debug to avoid recreating callbacks
  const debugRef = useRef(debug);
  debugRef.current = debug;
  
  const lastUpdateRef = useRef<number>(0);
  const pendingMetricsRef = useRef<PerformanceMetrics | null>(null);
  const throttleTimerRef = useRef<number | null>(null);
  
  // Get actions from store
  const recordGeneration = useAppStore((s) => s.recordGeneration);
  const setIsGenerating = useAppStore((s) => s.setIsGenerating);
  const setRenderTime = useAppStore((s) => s.setRenderTime);
  
  // Debug logger - uses ref to avoid dependency issues
  const log = useCallback(
    (msg: string, data?: unknown) => {
      if (debugRef.current) {
        console.debug(`[PerformanceTracker] ${msg}`, data);
      }
    },
    [] // Empty deps - uses ref
  );
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
      }
    };
  }, []);
  
  /**
   * Update performance metrics (throttled).
   */
  const updateMetrics = useCallback(
    (metrics: PerformanceMetrics) => {
      const now = Date.now();
      const elapsed = now - lastUpdateRef.current;
      
      // Store pending metrics
      pendingMetricsRef.current = metrics;
      
      // If we're within throttle window, schedule update
      if (elapsed < throttleMs) {
        if (!throttleTimerRef.current) {
          throttleTimerRef.current = window.setTimeout(() => {
            throttleTimerRef.current = null;
            const pending = pendingMetricsRef.current;
            if (pending) {
              lastUpdateRef.current = Date.now();
              log('metrics update (throttled)', pending);
              recordGeneration(pending);
            }
          }, throttleMs - elapsed);
        }
        return;
      }
      
      // Update immediately
      lastUpdateRef.current = now;
      log('metrics update', metrics);
      recordGeneration(metrics);
    },
    [throttleMs, recordGeneration, log]
  );
  
  /**
   * Set generating state.
   */
  const setGenerating = useCallback(
    (isGenerating: boolean) => {
      log('generating', { isGenerating });
      setIsGenerating(isGenerating);
    },
    [setIsGenerating, log]
  );
  
  /**
   * Update render time separately (for frame timing).
   */
  const updateRenderTime = useCallback(
    (time: number) => {
      setRenderTime(time);
    },
    [setRenderTime]
  );
  
  return {
    updateMetrics,
    setGenerating,
    updateRenderTime,
  };
}

/**
 * Parse performance data from WebGPU status string.
 * 
 * The WebGPU renderer outputs status in format:
 * "WebGPU • 123,456 tris • 60 FPS"
 */
export function parseStatusMetrics(status: string): Partial<PerformanceMetrics> | null {
  const triMatch = status.match(/([\d,]+)\s*tris/i);
  const fpsMatch = status.match(/([\d.]+)\s*FPS/i);
  
  if (!triMatch) return null;
  
  const triangleCount = parseInt(triMatch[1].replace(/,/g, ''), 10);
  const fps = fpsMatch ? parseFloat(fpsMatch[1]) : undefined;
  
  return {
    triangleCount,
    renderTime: fps ? 1000 / fps : undefined,
  };
}
