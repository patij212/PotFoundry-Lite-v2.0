/**
 * useParametricExport — v4.1 Curvature-Adaptive Parametric Pipeline Hook
 *
 * React hook for the parametric export pipeline.
 * Curvature analysis is computed inside ParametricExportComputer itself
 * (via GPU sampling strips), so this hook only needs the vertex evaluator.
 *
 * Returns the same interface shape as useAdaptiveExport for ExportPanel compatibility.
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
import {
    ParametricExportComputer,
    type ParametricExportParams,
    getLastChainDebugData,
    getLastPeakDebugData,
} from '../renderers/webgpu/ParametricExportComputer';
import { STYLE_IDS, STYLE_FUNCTION_MAP, STYLE_REGISTRY } from '../styles/registry';
import { stripShaderCode } from '../utils/shaderStripper';
import { useControllerMaybe } from '../context/ControllerContext';

// Import shader sources
import commonWgsl from '../assets/shaders/common.wgsl?raw';
import stylesWgsl from '../assets/shaders/styles.wgsl?raw';
import adaptiveMeshWgsl from '../assets/shaders/adaptive_mesh.wgsl?raw';

// ============================================================================
// Types
// ============================================================================

export interface ParametricExportProgress {
    status: 'idle' | 'initializing' | 'generating' | 'complete' | 'error';
    progress: number;
    message: string;
}

export interface ParametricExportStats {
    triangleCount: number;
    vertexCount: number;
    fileSize: string;
    fileSizeBytes: number;
    volumeMm3: number;
    volumeMl: number;
    surfaceAreaMm2: number;
    generationTimeMs: number;
    gpuAccelerated: boolean;
    gridDimensions: { nu: number; nt: number };
    adaptiveDensityRatio?: number;
    featurePeaksSnapped?: number;
    /** Validation summary from the pipeline (null if validator didn't run). */
    validationSummary?: import('../renderers/webgpu/parametric/types').ValidationSummary;
    /** Refinement summary from the pipeline (null if refinement didn't run). */
    refinementSummary?: import('../renderers/webgpu/parametric/types').RefinementSummary;
    /** Pipeline diagnostics for the debug tab (null if not collected). */
    pipelineDiagnostics?: import('../renderers/webgpu/parametric/types').PipelineDiagnostics;
}

/** Optional pipeline overrides passed from the ExportDialog. */
export interface ParametricExportOverrides {
    qualityProfile?: import('../renderers/webgpu/parametric/types').QualityProfileName;
    toleranceOverrides?: Partial<import('../renderers/webgpu/parametric/types').ExportTolerances>;
    pipelineFeatureFlags?: Partial<import('../renderers/webgpu/parametric/contracts').PipelineFeatureFlags>;
    pipelineConfig?: Partial<import('../renderers/webgpu/parametric/types').PipelineStageConfig>;
    relaxIterations?: number;
}

export interface UseParametricExportResult {
    progress: ParametricExportProgress;
    stats: ParametricExportStats | null;
    isAvailable: boolean;
    exportSTL: (filename?: string, targetTriangles?: number) => Promise<void>;
    generateMesh: (targetTriangles?: number, overrides?: ParametricExportOverrides) => Promise<MeshData | null>;
    reset: () => void;
    /** v15.0: Toggle chain overlay (magenta lines) on/off */
    setShowChainOverlay: (show: boolean) => void;
    /** v15.0: Toggle peak overlay (green points) on/off */
    setShowPeakOverlay: (show: boolean) => void;
    /** Current state of chain overlay visibility */
    showChainOverlay: boolean;
    /** Current state of peak overlay visibility */
    showPeakOverlay: boolean;
}

// ============================================================================
// Budget Presets
// ============================================================================

/** Maps file size in MB to triangle count */
export function fileSizeToTriangles(fileSizeMB: number): number {
    return Math.floor((fileSizeMB * 1_000_000 - 84) / 50);
}

/** Maps triangle count to file size in MB */
export function trianglesToFileSizeMB(triangles: number): number {
    return (triangles * 50 + 84) / 1_000_000;
}

export const PARAMETRIC_PRESETS = {
    draft: { triangles: 500_000, label: 'Draft', fileSizeMB: 25 },
    standard: { triangles: 2_000_000, label: 'Standard', fileSizeMB: 100 },
    high: { triangles: 4_000_000, label: 'High', fileSizeMB: 200 },
    ultra: { triangles: 8_000_000, label: 'Ultra', fileSizeMB: 400 },
    maximum: { triangles: 20_000_000, label: 'Maximum', fileSizeMB: 1000 },
} as const;

export type ParametricQuality = keyof typeof PARAMETRIC_PRESETS;

// ============================================================================
// Hook Implementation
// ============================================================================

const DEFAULT_PROGRESS: ParametricExportProgress = {
    status: 'idle',
    progress: 0,
    message: '',
};

export function useParametricExport(): UseParametricExportResult {
    const [progress, setProgress] = useState<ParametricExportProgress>(DEFAULT_PROGRESS);
    const [stats, setStats] = useState<ParametricExportStats | null>(null);
    const [isAvailable, setIsAvailable] = useState<boolean>(false);
    const [showChainOverlay, setShowChainOverlayState] = useState<boolean>(true);
    const [showPeakOverlay, setShowPeakOverlayState] = useState<boolean>(true);

    // Keep last debug data refs so we can toggle overlays without re-exporting
    const lastChainSegsRef = useRef<Float32Array | null>(null);
    const lastPeakPointsRef = useRef<Float32Array | null>(null);

    const computerRef = useRef<ParametricExportComputer | null>(null);
    const deviceRef = useRef<GPUDevice | null>(null);

    const geometry = useAppStore((state) => state.geometry);
    const style = useAppStore((state) => state.style);
    const mesh = useAppStore((state) => state.mesh);
    const ctrl = useControllerMaybe();

    // Initialize GPU — just the evaluate_vertices pipeline
    // (curvature sampling is handled inside ParametricExportComputer.compute())
    useEffect(() => {
        console.log('[useParametricExport] Mounting and initializing GPU...');
        let isMounted = true;
        let device: GPUDevice | null = null;
        let computer: ParametricExportComputer | null = null;

        const initGPU = async () => {
            try {
                if (!navigator.gpu) {
                    console.warn('[useParametricExport] WebGPU not supported');
                    if (isMounted) setIsAvailable(false);
                    return;
                }

                const adapter = await navigator.gpu.requestAdapter();
                if (!adapter) {
                    console.warn('[useParametricExport] No GPU adapter');
                    if (isMounted) setIsAvailable(false);
                    return;
                }

                device = await adapter.requestDevice({
                    requiredLimits: {
                        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                        maxBufferSize: adapter.limits.maxBufferSize,
                        maxStorageBuffersPerShaderStage: 10,
                    },
                });

                device.lost.then((info) => {
                    if (info.reason === 'destroyed') return;
                    console.error(`[useParametricExport] Device lost: ${info.reason}`);
                    if (isMounted) {
                        setIsAvailable(false);
                        setProgress(p => ({
                            ...p,
                            status: 'error',
                            message: 'GPU Device Lost. Please reload.',
                        }));
                    }
                });

                // Build shader
                const styleIdVal = (style.name as StyleId) ?? 'SuperformulaBlossom';
                const styleIndex = STYLE_IDS[styleIdVal] ?? 0;
                const functionName = (STYLE_FUNCTION_MAP as Record<number, string>)[styleIndex] || 'sf_radius';
                const strippedStyles = stripShaderCode(stylesWgsl, functionName);

                const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}
`;

                computer = new ParametricExportComputer(device);
                const fullShaderSource = [commonWgsl, strippedStyles, dispatchCode, adaptiveMeshWgsl].join('\n');
                await computer.init(fullShaderSource);

                if (isMounted) {
                    computerRef.current = computer;
                    deviceRef.current = device;
                    setIsAvailable(true);
                    console.log('[useParametricExport] Parametric export ready (with curvature sampling).');
                } else {
                    computer.destroy();
                    device.destroy();
                }
            } catch (error) {
                console.error('[useParametricExport] Init failed:', error);
                if (isMounted) setIsAvailable(false);
                computer?.destroy();
                device?.destroy();
            }
        };

        initGPU();

        return () => {
            isMounted = false;
            computerRef.current?.destroy();
            computerRef.current = null;
            if (deviceRef.current) {
                deviceRef.current.destroy();
                deviceRef.current = null;
            }
        };
    }, [style.name]);

    const buildStyleOptions = useCallback(() => {
        const opts: Record<string, number> = {};
        opts.spinTurns = geometry.spinTurns ?? 0;
        opts.spinPhaseDeg = geometry.spinPhase ?? 0;
        opts.spinCurveExp = geometry.spinCurve ?? 1;
        opts.seamAngle = mesh.seamAngle ?? 0;
        opts.bellAmp = geometry.bellAmp ?? 0;
        opts.bellCenter = geometry.bellCenter ?? 0.5;
        opts.bellWidth = geometry.bellWidth ?? 0.22;

        const styleOpts = style.opts;
        if (styleOpts) {
            Object.entries(styleOpts).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    opts[key] = value;
                }
            });
        }

        return opts;
    }, [style, geometry, mesh]);

    const generateMesh = useCallback(async (targetTriangles?: number, overrides?: ParametricExportOverrides): Promise<MeshData | null> => {
        if (!computerRef.current?.isReady()) {
            setProgress({
                status: 'error',
                progress: 0,
                message: 'Parametric export not available (WebGPU required)',
            });
            return null;
        }

        try {
            const tris = targetTriangles ?? 2_000_000;
            const estSizeMB = trianglesToFileSizeMB(tris);

            setProgress({
                status: 'generating',
                progress: 10,
                message: `Generating curvature-adaptive mesh (~${estSizeMB.toFixed(0)}MB, ${(tris / 1_000_000).toFixed(1)}M tris)...`,
            });
            await new Promise(r => setTimeout(r, 0));

            const dimensions = {
                H: geometry.H,
                Rt: geometry.top_od / 2,
                Rb: geometry.bottom_od / 2,
                tWall: geometry.t_wall,
                tBottom: geometry.t_bottom,
                rDrain: geometry.r_drain,
                expn: geometry.expn,
            };

            let styleId = style.name as StyleId;
            let styleIndex = STYLE_IDS[styleId];
            if (styleIndex === undefined) {
                const foundEntry = Object.entries(STYLE_REGISTRY).find(
                    ([_, config]) => config.name === style.name
                );
                if (foundEntry) {
                    styleId = foundEntry[0] as StyleId;
                    styleIndex = foundEntry[1].id;
                } else {
                    styleIndex = 0;
                    styleId = 'SuperformulaBlossom';
                }
            }

            const styleOpts = buildStyleOptions();

            const params: ParametricExportParams = {
                dimensions,
                styleId,
                styleOpts,
                styleIndex,
                targetTriangles: tris,
                qualityProfile: overrides?.qualityProfile,
                toleranceOverrides: overrides?.toleranceOverrides,
                pipelineFeatureFlags: overrides?.pipelineFeatureFlags,
                pipelineConfig: overrides?.pipelineConfig,
                relaxIterations: overrides?.relaxIterations,
            };

            const result = await computerRef.current.compute(params);

            // Compute statistics
            const volume = calculateMeshVolume(result.mesh);
            const surfaceArea = calculateMeshSurfaceArea(result.mesh);
            const fileSizeBytes = estimateSTLSize(result.mesh.triangleCount, true);

            const exportStats: ParametricExportStats = {
                triangleCount: result.mesh.triangleCount,
                vertexCount: result.mesh.vertexCount,
                fileSize: formatFileSize(fileSizeBytes),
                fileSizeBytes,
                volumeMm3: volume,
                volumeMl: volume / 1000,
                surfaceAreaMm2: surfaceArea,
                generationTimeMs: result.computeTimeMs,
                gpuAccelerated: true,
                gridDimensions: result.gridDimensions,
                adaptiveDensityRatio: result.adaptiveStats?.densityRatio,
                featurePeaksSnapped: result.adaptiveStats?.featurePeaksSnapped,
                validationSummary: result.validationSummary,
                refinementSummary: result.refinementSummary,
                pipelineDiagnostics: result.pipelineDiagnostics,
            };

            setStats(exportStats);

            const adaptiveMsg = result.adaptiveStats
                ? ` (${result.adaptiveStats.densityRatio.toFixed(0)}× density, ${result.adaptiveStats.featurePeaksSnapped} peaks)`
                : '';

            setProgress({
                status: 'complete',
                progress: 100,
                message: `Generated ${result.mesh.triangleCount.toLocaleString()} tris in ${result.computeTimeMs.toFixed(0)}ms${adaptiveMsg}`,
            });

            // Broadcast chain debug lines for preview overlay diagnostics.
            const chainDebug = getLastChainDebugData();
            if (chainDebug && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('pf:chain-debug', { detail: chainDebug }));
            }

            // Broadcast peak debug data for preview overlay diagnostics.
            const peakDebug = getLastPeakDebugData();
            if (peakDebug && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('pf:peak-debug', { detail: peakDebug }));
            }

            // Render chain lines ON the preview surface using existing renderer
            // debug segment projection (u,t segments -> 3D surface overlay).
            if (chainDebug && ctrl?.controllerRef.current?.setDebugSegments) {
                const segs: number[] = [];
                for (const line of chainDebug.lines) {
                    const pts = line.points;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const p0 = pts[i];
                        const p1 = pts[i + 1];
                        if (Math.abs(p1[0] - p0[0]) > 0.5) continue; // skip seam-crossing debug segments
                        segs.push(p0[0], p0[1], p1[0], p1[1]);
                    }
                }
                const segsArray = new Float32Array(segs);
                lastChainSegsRef.current = segsArray;
                if (showChainOverlay) {
                    ctrl.controllerRef.current.setDebugSegments(segsArray);
                }
                console.log(`[useParametricExport] DebugVis: projected ${segs.length / 4} chain segments on preview surface`);
            }

            // v15.0: Render raw peak positions as green point cloud on preview surface.
            if (peakDebug && ctrl?.controllerRef.current?.setDebugPoints) {
                lastPeakPointsRef.current = peakDebug.points;
                if (showPeakOverlay) {
                    ctrl.controllerRef.current.setDebugPoints(peakDebug.points);
                }
                console.log(`[useParametricExport] DebugVis: projected ${peakDebug.totalPeaks} peak points on preview surface (row=${peakDebug.rowPeaks}, col=${peakDebug.colPeaks})`);
            }

            return result.mesh;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('[useParametricExport] Generation failed:', error);
            setProgress({
                status: 'error',
                progress: 0,
                message: `Parametric export failed: ${message}`,
            });
            return null;
        }
    }, [geometry, style, mesh, buildStyleOptions, ctrl]);

    const exportSTL = useCallback(async (
        filename: string = 'pot.stl',
        targetTriangles?: number
    ): Promise<void> => {
        const meshData = await generateMesh(targetTriangles);
        if (!meshData) return;

        setProgress({
            status: 'generating',
            progress: 90,
            message: 'Preparing download...',
        });

        const styleName = style.name ?? 'Pot';
        const finalFilename = filename === 'pot.stl'
            ? `PotFoundry_${styleName}_Parametric_${Date.now()}.stl`
            : filename;

        downloadSTL(meshData, finalFilename, {
            name: `PotFoundry ${style.name} (Parametric v4.1 Adaptive)`,
            binary: true,
        });

        setProgress({
            status: 'complete',
            progress: 100,
            message: `Downloaded ${finalFilename}`,
        });
    }, [generateMesh, style.name]);

    const reset = useCallback(() => {
        setProgress(DEFAULT_PROGRESS);
        setStats(null);
    }, []);

    // v15.0: Toggle overlay visibility without re-exporting
    const setShowChainOverlay = useCallback((show: boolean) => {
        setShowChainOverlayState(show);
        if (ctrl?.controllerRef.current?.setDebugSegments) {
            if (show && lastChainSegsRef.current) {
                ctrl.controllerRef.current.setDebugSegments(lastChainSegsRef.current);
            } else {
                ctrl.controllerRef.current.setDebugSegments(new Float32Array(0));
            }
        }
    }, [ctrl]);

    const setShowPeakOverlay = useCallback((show: boolean) => {
        setShowPeakOverlayState(show);
        if (ctrl?.controllerRef.current?.setDebugPoints) {
            if (show && lastPeakPointsRef.current) {
                ctrl.controllerRef.current.setDebugPoints(lastPeakPointsRef.current);
            } else {
                ctrl.controllerRef.current.setDebugPoints(new Float32Array(0));
            }
        }
    }, [ctrl]);

    return {
        progress,
        stats,
        isAvailable,
        exportSTL,
        generateMesh,
        reset,
        setShowChainOverlay,
        setShowPeakOverlay,
        showChainOverlay,
        showPeakOverlay,
    };
}

export default useParametricExport;
