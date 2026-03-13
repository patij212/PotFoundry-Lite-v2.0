/**
 * Renderer Abstraction Layer - Shared Types
 * 
 * This module defines the common interface that both WebGPU and WebGL
 * renderers implement. This enables automatic fallback when WebGPU
 * is unavailable or crashes.
 */

import type { MountOptions } from '../types';

/**
 * Export options for STL/OBJ export
 */
export interface ExportOptions {
    quality?: 'draft' | 'standard' | 'high';
    filename?: string;
}

/**
 * Unified controller interface that both WebGPU and WebGL renderers implement.
 * This allows the application to use either renderer interchangeably.
 */
export interface RendererController {
    // === Core Operations ===

    /**
     * Update renderer parameters (geometry, style, appearance, etc.)
     * @param params Key-value pairs to update
     */
    updateParams(params: Record<string, unknown>): void;

    /**
     * Clean up all GPU resources and stop rendering
     */
    dispose(): void;

    // === Export ===

    /**
     * Export current pot as STL binary
     */
    exportSTL(options?: ExportOptions): Blob | null;

    /**
     * Export current pot as OBJ text
     */
    exportOBJ(options?: ExportOptions): string | null;

    // === Camera ===

    /**
     * Focus camera on the pot center
     */
    focusOnPot(): void;

    /**
     * Reset camera to default view
     */
    resetCamera(): void;

    /**
     * Handle camera commands (view presets, mode changes, etc.)
     */
    handleCameraCommand(payload: Record<string, unknown>): void;

    /**
     * Set auto-rotate state
     */
    setAutoRotate(value: boolean): void;

    /**
     * Toggle auto-rotate
     */
    toggleAutoRotate(): void;

    /**
     * Get current auto-rotate state
     */
    getAutoRotate(): boolean;

    /**
     * Set auto-pivot state
     */
    setAutoPivot(value: boolean): void;

    /**
     * Toggle auto-pivot
     */
    toggleAutoPivot(): void;

    /**
     * Get current auto-pivot state
     */
    getAutoPivot(): boolean;

    // === Info ===

    /**
     * Which renderer is being used
     */
    readonly rendererType: 'webgpu' | 'webgl';

    /**
     * True if using fallback mode (WebGL when WebGPU is available but crashed)
     */
    /**
     * Set debug segments to visualize (e.g. feature polylines)
     * @param segments Float32Array of 2D points [u0, v0, u1, v1, ...]
     */
    setDebugSegments(segments: Float32Array): void;

    /**
     * Set debug points to visualize as a green point cloud (e.g. raw peak positions)
     * @param points Float32Array of 2D points [u0, v0, u1, v1, ...]
     */
    setDebugPoints(points: Float32Array): void;

    /**
     * True if using fallback mode (WebGL when WebGPU is available but crashed)
     * @returns boolean
     */
    readonly isCompatibilityMode: boolean;
}

/**
 * Result from attempting to create a renderer
 */
export interface CreateRendererResult {
    controller: RendererController | null;
    error?: Error;
    usedFallback: boolean;
}

/**
 * Options for creating a renderer (extends MountOptions)
 */
export interface CreateRendererOptions extends MountOptions {
    /**
     * Force a specific renderer (for testing)
     */
    forceRenderer?: 'webgpu' | 'webgl';

    /**
     * Callback when fallback is used
     */
    onFallback?: (reason: string) => void;
}
