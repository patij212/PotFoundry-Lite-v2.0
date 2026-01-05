/**
 * useExport - Hook for generating and downloading pot meshes
 * 
 * This hook connects the Zustand state to the geometry module,
 * allowing users to export their current pot design as an STL file.
 */

import { useCallback, useState } from 'react';
import { useAppStore } from '../state';
import {
  buildPotMesh,
  downloadSTL,
  calculateMeshVolume,
  calculateMeshSurfaceArea,
  getMeshBounds,
  estimateSTLSize,
  formatFileSize,
  StyleId,
  StyleOptions,
  MeshResult,
} from '../geometry';

// ============================================================================
// Types
// ============================================================================

export interface ExportProgress {
  status: 'idle' | 'generating' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
}

export interface ExportStats {
  triangleCount: number;
  vertexCount: number;
  fileSize: string;
  fileSizeBytes: number;
  volumeMm3: number;
  volumeMl: number;
  surfaceAreaMm2: number;
  generationTimeMs: number;
}

export interface UseExportResult {
  /** Current export progress */
  progress: ExportProgress;
  /** Stats from last successful export */
  stats: ExportStats | null;
  /** Generate and download STL file */
  exportSTL: (filename?: string) => Promise<void>;
  /** Generate mesh for preview/stats without downloading */
  generateMesh: () => Promise<MeshResult | null>;
  /** Reset export state */
  reset: () => void;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_PROGRESS: ExportProgress = {
  status: 'idle',
  progress: 0,
  message: '',
};

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for mesh generation and STL export
 * 
 * Usage:
 * ```tsx
 * const { exportSTL, progress, stats } = useExport();
 * 
 * // Trigger export
 * await exportSTL('my-pot.stl');
 * 
 * // Show progress
 * if (progress.status === 'generating') {
 *   return <div>Generating... {progress.progress}%</div>;
 * }
 * ```
 */
export function useExport(): UseExportResult {
  const [progress, setProgress] = useState<ExportProgress>(DEFAULT_PROGRESS);
  const [stats, setStats] = useState<ExportStats | null>(null);

  // Get current parameters from store
  const geometry = useAppStore((state) => state.geometry);
  const style = useAppStore((state) => state.style);
  const mesh = useAppStore((state) => state.mesh);

  /**
   * Build style options from current state
   */
  const buildStyleOptions = useCallback((): StyleOptions => {
    const opts: StyleOptions = {};

    // Add spin parameters
    opts.spinTurns = 0; // Default, could be added to geometry state
    opts.spinPhaseDeg = 0;
    opts.spinCurveExp = 1.0;

    // Add profile parameters
    opts.flareCenter = 0.5;
    opts.flareSharp = 6.0;
    opts.bellAmp = 0;
    opts.bellCenter = 0.5;
    opts.bellWidth = 0.22;

    // Add style-specific parameters from current style state
    const styleOpts = style.opts;
    if (styleOpts) {
      // Copy all style parameters to options
      Object.entries(styleOpts).forEach(([key, value]) => {
        if (typeof value === 'number') {
          opts[key] = value;
        }
      });
    }

    return opts;
  }, [style]);

  /**
   * Generate mesh from current parameters
   */
  const generateMesh = useCallback(async (): Promise<MeshResult | null> => {
    try {
      setProgress({
        status: 'generating',
        progress: 10,
        message: 'Building mesh...',
      });

      // Convert geometry state to dimensions (use correct property names from store)
      const dimensions = {
        H: geometry.H,
        Rt: geometry.top_od / 2,  // Convert diameter to radius
        Rb: geometry.bottom_od / 2,  // Convert diameter to radius
        tWall: geometry.t_wall,
        tBottom: geometry.t_bottom,
        rDrain: geometry.r_drain,
        expn: geometry.expn,
      };

      // Get mesh quality (use correct property names)
      const quality = {
        nTheta: mesh.export_n_theta,  // Use export quality for STL
        nZ: mesh.export_n_z,
        seamAngle: mesh.seamAngle,  // Include seam blending
      };

      // Map style name to StyleId
      const styleIdMap: Record<string, StyleId> = {
        HarmonicRipple: 'HarmonicRipple',
        SuperformulaBlossom: 'SuperformulaBlossom',
        FourierBloom: 'FourierBloom',
        SpiralRidges: 'SpiralRidges',
        SuperellipseMorph: 'SuperellipseMorph',
        // Legacy snake_case mappings
        superformula_blossom: 'SuperformulaBlossom',
        fourier_bloom: 'FourierBloom',
        spiral_ridges: 'SpiralRidges',
        superellipse_morph: 'SuperellipseMorph',
        harmonic_ripple: 'HarmonicRipple',
      };
      const styleId = styleIdMap[style.name] ?? 'SuperformulaBlossom';

      // Build style options
      const styleOpts = buildStyleOptions();

      setProgress({
        status: 'generating',
        progress: 30,
        message: 'Computing vertices...',
      });

      // Generate mesh
      const result = buildPotMesh(dimensions, quality, styleId, styleOpts);

      setProgress({
        status: 'generating',
        progress: 70,
        message: 'Calculating statistics...',
      });

      // Calculate stats
      const volume = calculateMeshVolume(result.mesh);
      const surfaceArea = calculateMeshSurfaceArea(result.mesh);
      const fileSizeBytes = estimateSTLSize(result.mesh.triangleCount, true);

      const exportStats: ExportStats = {
        triangleCount: result.mesh.triangleCount,
        vertexCount: result.mesh.vertexCount,
        fileSize: formatFileSize(fileSizeBytes),
        fileSizeBytes,
        volumeMm3: volume,
        volumeMl: volume / 1000, // Convert mm³ to mL
        surfaceAreaMm2: surfaceArea,
        generationTimeMs: result.diagnostics.generationTimeMs ?? 0,
      };

      setStats(exportStats);

      setProgress({
        status: 'complete',
        progress: 100,
        message: 'Mesh generated successfully',
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setProgress({
        status: 'error',
        progress: 0,
        message: `Failed to generate mesh: ${message}`,
      });
      return null;
    }
  }, [geometry, style, mesh, buildStyleOptions]);

  /**
   * Generate and download STL file
   */
  const exportSTL = useCallback(async (filename: string = 'pot.stl'): Promise<void> => {
    try {
      const result = await generateMesh();
      if (!result) {
        return; // Error already handled
      }

      setProgress({
        status: 'generating',
        progress: 90,
        message: 'Preparing download...',
      });

      // Generate filename with style name
      const styleName = style.name ?? 'Pot';
      const finalFilename = filename === 'pot.stl'
        ? `PotFoundry_${styleName}_${Date.now()}.stl`
        : filename;

      // Download STL
      downloadSTL(result.mesh, finalFilename, {
        name: `PotFoundry ${style.name}`,
        binary: true,
      });

      setProgress({
        status: 'complete',
        progress: 100,
        message: `Downloaded ${finalFilename}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setProgress({
        status: 'error',
        progress: 0,
        message: `Export failed: ${message}`,
      });
    }
  }, [generateMesh, style.name]);

  /**
   * Reset export state
   */
  const reset = useCallback(() => {
    setProgress(DEFAULT_PROGRESS);
    setStats(null);
  }, []);

  return {
    progress,
    stats,
    exportSTL,
    generateMesh,
    reset,
  };
}

export default useExport;
