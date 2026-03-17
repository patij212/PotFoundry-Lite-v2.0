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
  downloadMesh,
  calculateMeshVolume,
  calculateMeshSurfaceArea,
  estimateSTLSize,
  formatFileSize,
  StyleId,
  StyleOptions,
  MeshResult,
  ExportFormat,
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
  /** Generate and download file in the specified format (defaults to store format) */
  exportSTL: (filename?: string, format?: ExportFormat) => Promise<void>;
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

    // Add spin parameters from geometry state
    opts.spinTurns = geometry.spinTurns;
    opts.spinPhaseDeg = geometry.spinPhase;
    opts.spinCurveExp = geometry.spinCurve;

    // Add profile parameters from geometry state
    // Note: profile params like flareCenter might be available in styles but not currently in geometry state
    // We use defaults for now if not in state, or map if available.
    // Based on types.ts, GeometryParams has bellAmp/Center/Width but not flareCenter/Sharp.
    opts.bellAmp = geometry.bellAmp;
    opts.bellCenter = geometry.bellCenter;
    opts.bellWidth = geometry.bellWidth;

    // Use defaults for non-state profile params
    opts.flareCenter = 0.5;
    opts.flareSharp = 6.0;

    // Add style-specific parameters from current style state
    const styleOpts = style.opts;
    if (styleOpts) {
      // Copy all style parameters to options, converting snake_case to camelCase
      // The geometry functions expect camelCase (e.g. wiFeatureCount), but state has snake_case (wi_feature_count)
      const toCamel = (s: string) => {
        return s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      };

      Object.entries(styleOpts).forEach(([key, value]) => {
        if (typeof value === 'number') {
          opts[key] = value;
          // Also set the camelCase version
          const camelKey = toCamel(key);
          if (camelKey !== key) {
            opts[camelKey] = value;
          }
        }
      });
    }

    return opts;
  }, [style, geometry]);

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

      // Quality will be built separately with safety caps applied
      // const quality = { nTheta, nZ, seamAngle } is in baseQuality below

      // Map style name to StyleId
      const styleIdMap: Record<string, StyleId> = {
        HarmonicRipple: 'HarmonicRipple',
        SuperformulaBlossom: 'SuperformulaBlossom',
        FourierBloom: 'FourierBloom',
        SpiralRidges: 'SpiralRidges',
        SuperellipseMorph: 'SuperellipseMorph',
        GothicArches: 'GothicArches',
        WaveInterference: 'WaveInterference',
        Crystalline: 'Crystalline',
        ArtDeco: 'ArtDeco',
        DragonScales: 'DragonScales',
        BambooSegments: 'BambooSegments',
        RippleInterference: 'RippleInterference',
        LowPolyFacet: 'LowPolyFacet',
        GyroidManifold: 'GyroidManifold',
        Voronoi: 'Voronoi',
        BasketWeave: 'BasketWeave',
        GeometricStar: 'GeometricStar',
        HexagonalHive: 'HexagonalHive',
        CelticKnot: 'CelticKnot',
        CelticTriquetra: 'CelticTriquetra',
        // Legacy snake_case mappings
        superformula_blossom: 'SuperformulaBlossom',
        fourier_bloom: 'FourierBloom',
        spiral_ridges: 'SpiralRidges',
        superellipse_morph: 'SuperellipseMorph',
        harmonic_ripple: 'HarmonicRipple',
        gothic_arches: 'GothicArches',
        wave_interference: 'WaveInterference',
        crystalline: 'Crystalline',
        art_deco: 'ArtDeco',
        dragon_scales: 'DragonScales',
        bamboo_segments: 'BambooSegments',
        ripple_interference: 'RippleInterference',
      };

      // Try exact match, then legacy map, then name itself if it's a valid ID (as a fallback cast)
      const mappedId = styleIdMap[style.name];
      const styleId = mappedId ?? (style.name as StyleId);

      // Build style options
      const styleOpts = buildStyleOptions();

      setProgress({
        status: 'generating',
        progress: 30,
        message: 'Computing vertices...',
      });

      // Map state-specific mesh quality to geometry-expected format
      // CRITICAL FIX: state uses export_n_theta, geometry expects nTheta
      // CRITICAL FIX: state uses export_n_theta, geometry expects nTheta
      const baseQuality = {
        nTheta: mesh.export_n_theta,
        nZ: mesh.export_n_z,
        seamAngle: mesh.seamAngle,
      };

      // Auto-Quality Override:
      // High-frequency styles (like Wave Interference with featureCount=3) need drastically higher resolution
      // to avoid aliasing and "Model Errors" (self-intersection) in slicers.
      // Nyquist limit: Freq 100 needs >200 samples. For smooth curvature, we need >1000 samples.
      if (styleId === 'WaveInterference' || styleId === 'DragonScales') {
        // Boost resolution if default is too low
        if (baseQuality.nTheta < 1200) {
          baseQuality.nTheta = 1200;
        }
        if (baseQuality.nZ < 600) {
          baseQuality.nZ = 600;
        }
      }

      // Safety caps: Limit CPU export resolution
      // With streaming STL export, we can handle up to 8192 resolution
      // 8192×4096 = ~134M triangles = ~6.7GB STL (handled via streaming chunks)
      const SAFETY_CAP = 8192;
      if (baseQuality.nTheta > SAFETY_CAP) {
        console.warn(`[useExport] Clamping nTheta from ${baseQuality.nTheta} to ${SAFETY_CAP}`);
        baseQuality.nTheta = SAFETY_CAP;
      }
      if (baseQuality.nZ > SAFETY_CAP) {
        console.warn(`[useExport] Clamping nZ from ${baseQuality.nZ} to ${SAFETY_CAP}`);
        baseQuality.nZ = SAFETY_CAP;
      }

      // Aspect Ratio Enforcement
      // Ensure nZ is sufficient relative to nTheta to avoid tall "sliver" triangles 
      // which can become "bowtie" self-intersections when twisted.
      const minZ = Math.floor(baseQuality.nTheta * 0.5);
      if (baseQuality.nZ < minZ) {
        baseQuality.nZ = minZ;
      }

      // Generate mesh
      const result = buildPotMesh(dimensions, baseQuality, styleId, styleOpts);

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
   * Generate and download file in the specified format
   */
  const exportSTL = useCallback(async (
    filename?: string,
    format?: ExportFormat
  ): Promise<void> => {
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

      // Determine export format: parameter > store > default 'stl'
      const storeFormat = useAppStore.getState().ui.exportFormat;
      const effectiveFormat = format ?? storeFormat;

      // Generate filename with style name and correct extension
      const styleName = style.name ?? 'Pot';
      const ext = effectiveFormat;
      const defaultFilename = `PotFoundry_${styleName}_${Date.now()}.${ext}`;
      const finalFilename = filename ?? defaultFilename;

      // Grab appearance colors for 3MF color embedding
      const appearance = useAppStore.getState().appearance;
      const exportColors = effectiveFormat === '3mf' ? {
        primaryColor: appearance.primaryColor,
        midColor: appearance.midColor,
        secondaryColor: appearance.secondaryColor,
      } : undefined;

      // Download using the appropriate exporter
      await downloadMesh(result.mesh, finalFilename, {
        format: effectiveFormat,
        name: `PotFoundry ${style.name}`,
        colors: exportColors,
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
