/**
 * useGPUExport - Hook for GPU-based mesh generation and export
 * 
 * This hook uses the ExportComputer class to generate meshes on the GPU,
 * ensuring the exported mesh exactly matches the visual rendering.
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import { useAppStore } from '../state';
import {
    downloadSTL,
    calculateMeshVolume,
    calculateMeshSurfaceArea,
    estimateSTLSize,
    formatFileSize,
    StyleId,
    MeshData,
} from '../geometry';
import { ExportComputer, type ExportParams, type ExportResult } from '../renderers/webgpu/ExportComputer';
import { STYLE_IDS, STYLE_FUNCTION_MAP, STYLE_REGISTRY } from '../styles/registry';
import { stripShaderCode } from '../utils/shaderStripper';

// Import shader sources
import commonWgsl from '../assets/shaders/common.wgsl?raw';
import stylesWgsl from '../assets/shaders/styles.wgsl?raw';
import potExportWgsl from '../assets/shaders/pot_export.wgsl?raw';
import scanProfileWgsl from '../assets/shaders/scan_profile.wgsl?raw';
import { isMobileDevice } from '../ResizeManager';

// ============================================================================
// Types
// ============================================================================

export interface GPUExportProgress {
    status: 'idle' | 'initializing' | 'generating' | 'complete' | 'error';
    progress: number; // 0-100
    message: string;
}

export interface GPUExportStats {
    triangleCount: number;
    vertexCount: number;
    fileSize: string;
    fileSizeBytes: number;
    volumeMm3: number;
    volumeMl: number;
    surfaceAreaMm2: number;
    generationTimeMs: number;
    gpuAccelerated: boolean;
}

export interface UseGPUExportResult {
    /** Current export progress */
    progress: GPUExportProgress;
    /** Stats from last successful export */
    stats: GPUExportStats | null;
    /** Whether GPU export is available */
    isGPUAvailable: boolean;
    /** Generate and download STL file using GPU */
    exportSTL: (filename?: string) => Promise<void>;
    /** Generate mesh using GPU for preview/stats */
    generateMesh: () => Promise<MeshData | null>;
    /** Reset export state */
    reset: () => void;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_PROGRESS: GPUExportProgress = {
    status: 'idle',
    progress: 0,
    message: '',
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGPUExport(): UseGPUExportResult {
    const [progress, setProgress] = useState<GPUExportProgress>(DEFAULT_PROGRESS);
    const [stats, setStats] = useState<GPUExportStats | null>(null);
    const [isGPUAvailable, setIsGPUAvailable] = useState<boolean>(false);

    const computerRef = useRef<ExportComputer | null>(null);
    const deviceRef = useRef<GPUDevice | null>(null);

    // Get current parameters from store
    const geometry = useAppStore((state) => state.geometry);
    const style = useAppStore((state) => state.style);
    const mesh = useAppStore((state) => state.mesh);

    /**
     * Initialize and Update GPU Pipeline
     * Re-runs when style name changes to re-compile shader with correct dispatch.
     */
    useEffect(() => {
        let isMounted = true;

        // Availability must reflect the NEW style's pipeline, not the previous
        // one. During a style switch this effect re-runs and destroys/re-inits
        // the computer asynchronously; without flipping the flag false up front,
        // isGPUAvailable stays stale-true and consumers (e.g. the SP0 fidelity
        // harness's setStyle gate) proceed against a destroyed/re-initializing
        // computer → null mesh. Reset here so readiness is honest mid-rebuild.
        setIsGPUAvailable(false);

        const initOrUpdateGPU = async () => {
            try {
                // On mobile, defer GPU export init to avoid multi-device crash.
                // The main renderer needs the sole GPUDevice during boot.
                if (isMobileDevice()) {
                    if (import.meta.env.DEV) console.log('[useGPUExport] Skipping eager GPU init on mobile');
                    return;
                }

                if (!navigator.gpu) {
                    console.warn('[useGPUExport] WebGPU not supported');
                    if (isMounted) setIsGPUAvailable(false);
                    return;
                }

                // 1. Initialize Device & Computer if needed
                if (!deviceRef.current) {
                    const adapter = await navigator.gpu.requestAdapter();
                    if (!adapter) {
                        console.warn('[useGPUExport] No GPU adapter available');
                        if (isMounted) setIsGPUAvailable(false);
                        return;
                    }
                    const device = await adapter.requestDevice({
                        requiredLimits: {
                            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                            maxBufferSize: adapter.limits.maxBufferSize,
                        },
                    });
                    deviceRef.current = device;
                    computerRef.current = new ExportComputer(device);
                }

                if (!computerRef.current) return;

                // 2. Identify active style function
                const styleIdVal = (style.name as StyleId) ?? 'SuperformulaBlossom';
                const styleIndex = STYLE_IDS[styleIdVal] ?? 0;
                // Import map dynamically or assume it's available? 
                // We need to import STYLE_FUNCTION_MAP.
                // Assuming it's imported at top (I will add import in next step if missed, but assume I add it)
                const functionName = STYLE_FUNCTION_MAP[styleIndex] ?? 'sf_radius';

                // 3. Strip unused styles to reduce bloat/conflicts and generate dispatch
                const strippedStyles = stripShaderCode(stylesWgsl, functionName);

                const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}
`;

                // 4. Concatenate shader
                // Order: Common -> Styles (stripped) -> Dispatch (calls style) -> Export (calls dispatch, defines getf)
                const fullShaderSource = [commonWgsl, strippedStyles, dispatchCode, potExportWgsl].join('\n');
                const scanShaderSource = [commonWgsl, strippedStyles, dispatchCode, scanProfileWgsl].join('\n');

                if (import.meta.env.DEV) console.log(`[useGPUExport] Compiling shader for style ${styleIndex} (${functionName})...`);

                // Force cleanup of previous shader pipelines to allow re-init with new source
                if (computerRef.current.isReady()) {
                    computerRef.current.destroy();
                }

                await computerRef.current.init(fullShaderSource, scanShaderSource);

                if (isMounted) {
                    setIsGPUAvailable(true);
                    if (import.meta.env.DEV) console.log('[useGPUExport] GPU pipeline ready');
                }
            } catch (error) {
                console.error('[useGPUExport] GPU initialization failed:', error);
                if (isMounted) setIsGPUAvailable(false);
            }
        };

        initOrUpdateGPU();

        // Cleanup only on unmount (device destruction)
        return () => {
            isMounted = false;
            // We don't destroy device on every style change, only on unmount provided by parent? 
            // Actually useEffect cleanup runs on re-run.
            // We do NOT want to destroy device on re-run.
            // So we need a separate effect for lifecycle or careful management.
            // But here we just set isMounted=false.
            // Real cleanup should be in a separate [] effect or logic.
        };
    }, [style.name]); // Re-run on style change

    // Separate cleanup effect
    useEffect(() => {
        return () => {
            computerRef.current?.destroy();
            deviceRef.current?.destroy();
            computerRef.current = null;
            deviceRef.current = null;
        };
    }, []);

    /**
     * Build style options from current state
     */
    const buildStyleOptions = useCallback(() => {
        const opts: Record<string, number> = {};

        // Add spin parameters
        opts.spinTurns = geometry.spinTurns ?? 0;
        opts.spinPhaseDeg = geometry.spinPhase ?? 0;
        opts.spinCurveExp = geometry.spinCurve ?? 1;

        // Add seam angle
        opts.seamAngle = mesh.seamAngle ?? 0;

        // Add profile parameters
        opts.bellAmp = geometry.bellAmp ?? 0;
        opts.bellCenter = geometry.bellCenter ?? 0.5;
        opts.bellWidth = geometry.bellWidth ?? 0.22;
        opts.flareCenter = 0.5;
        opts.flareSharp = 6.0;

        // Add style-specific parameters
        const styleOpts = style.opts;
        if (styleOpts) {
            Object.entries(styleOpts).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    opts[key] = value;
                }
            });
        }

        return opts;
    }, [style, geometry]);

    /**
     * Generate mesh using GPU compute
     */
    const generateMesh = useCallback(async (): Promise<MeshData | null> => {
        if (!computerRef.current || !computerRef.current.isReady()) {
            setProgress({
                status: 'error',
                progress: 0,
                message: 'GPU compute not available. Use CPU export instead.',
            });
            return null;
        }

        try {
            setProgress({
                status: 'generating',
                progress: 10,
                message: 'Preparing GPU compute...',
            });

            // Build dimensions
            const dimensions = {
                H: geometry.H,
                Rt: geometry.top_od / 2,
                Rb: geometry.bottom_od / 2,
                tWall: geometry.t_wall,
                tBottom: geometry.t_bottom,
                rDrain: geometry.r_drain,
                expn: geometry.expn,
            };

            // Build quality
            let nTheta = mesh.export_n_theta;
            let nZ = mesh.export_n_z;

            // Safety caps: Raised to 8192 with tiled export support
            // Tiled export automatically splits large meshes into GPU-sized chunks
            const SAFETY_CAP = 8192;
            if (nTheta > SAFETY_CAP) {
                console.warn(`[useGPUExport] Clamping nTheta from ${nTheta} to ${SAFETY_CAP}`);
                nTheta = SAFETY_CAP;
            }
            if (nZ > SAFETY_CAP) {
                console.warn(`[useGPUExport] Clamping nZ from ${nZ} to ${SAFETY_CAP}`);
                nZ = SAFETY_CAP;
            }

            // Check if tiled export is needed
            const needsTiling = computerRef.current.needsTiling(nTheta, nZ);
            if (needsTiling) {
                const tileCount = computerRef.current.getTileCount(nTheta, nZ);
                if (import.meta.env.DEV) console.log(`[useGPUExport] High resolution (${nTheta}x${nZ}) - using ${tileCount}-tile export`);
            }

            const quality = { nTheta, nZ };

            // Map style name to ID with robust fallback
            let styleId = (style.name as StyleId);
            let styleIndex = STYLE_IDS[styleId];

            if (styleIndex === undefined) {
                // Try to find by Display Name (e.g. "Celtic Knot" -> "CelticKnot")
                const foundEntry = Object.entries(STYLE_REGISTRY).find(([_, config]) => config.name === style.name);

                if (foundEntry) {
                    styleId = foundEntry[0] as StyleId;
                    styleIndex = foundEntry[1].id;
                    if (import.meta.env.DEV) console.log(`[useGPUExport] Mapped display name "${style.name}" to key "${styleId}" (ID: ${styleIndex})`);
                } else {
                    console.warn(`[useGPUExport] Style ID not found for "${style.name}". Defaulting to 0 (Superformula).`);
                    styleIndex = 0;
                    styleId = 'SuperformulaBlossom';
                }
            }

            // Build style options
            const styleOpts = buildStyleOptions();

            setProgress({
                status: 'generating',
                progress: 30,
                message: `GPU Export: Sty="${styleId}"(${styleIndex}), Q=${quality.nTheta}x${quality.nZ}...`,
            });

            // Build params
            const params: ExportParams = {
                dimensions,
                quality,
                styleId, // Now guaranteed to be defined and valid Key
                styleOpts,
                styleIndex,
                optimize: mesh.optimize ?? false,
            };

            // Run GPU compute (uses tiled export automatically for large meshes)
            const result: ExportResult = await computerRef.current.computeTiled(
                params,
                (tile, totalTiles, message) => {
                    // Progress callback for tiled export
                    const tileProgress = 30 + (tile / totalTiles) * 40;
                    setProgress({
                        status: 'generating',
                        progress: tileProgress,
                        message,
                    });
                }
            );

            setProgress({
                status: 'generating',
                progress: 70,
                message: 'Calculating statistics...',
            });

            // Calculate stats
            const volume = calculateMeshVolume(result.mesh);
            const surfaceArea = calculateMeshSurfaceArea(result.mesh);
            const fileSizeBytes = estimateSTLSize(result.mesh.triangleCount, true);

            const exportStats: GPUExportStats = {
                triangleCount: result.mesh.triangleCount,
                vertexCount: result.mesh.vertexCount,
                fileSize: formatFileSize(fileSizeBytes),
                fileSizeBytes,
                volumeMm3: volume,
                volumeMl: volume / 1000,
                surfaceAreaMm2: surfaceArea,
                generationTimeMs: result.computeTimeMs,
                gpuAccelerated: true,
            };

            setStats(exportStats);

            setProgress({
                status: 'complete',
                progress: 100,
                message: 'GPU mesh generated successfully',
            });

            return result.mesh;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setProgress({
                status: 'error',
                progress: 0,
                message: `GPU compute failed: ${message}`,
            });
            return null;
        }
    }, [geometry, style, mesh, buildStyleOptions]);

    /**
     * Generate and download STL file
     */
    const exportSTL = useCallback(async (filename: string = 'pot.stl'): Promise<void> => {
        const meshData = await generateMesh();
        if (!meshData) {
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
            ? `PotFoundry_${styleName}_GPU_${Date.now()}.stl`
            : filename;

        // Download STL
        downloadSTL(meshData, finalFilename, {
            name: `PotFoundry ${style.name} (GPU)`,
            binary: true,
        });

        setProgress({
            status: 'complete',
            progress: 100,
            message: `Downloaded ${finalFilename}`,
        });
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
        isGPUAvailable,
        exportSTL,
        generateMesh,
        reset,
    };
}

export default useGPUExport;
