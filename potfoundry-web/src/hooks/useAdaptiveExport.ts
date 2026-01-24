/**
 * useAdaptiveExport - Hook for GPU-based Adaptive Mesh Generation
 * 
 * Uses runtime curvature-based subdivision to generate meshes with
 * variable density - more triangles where detail matters.
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
import { ConstrainedTriangulator } from '../utils/geometry/ConstrainedTriangulator';
import { AdaptiveExportComputer, type AdaptiveExportParams } from '../renderers/webgpu/AdaptiveExportComputer';
import { FeatureExtractionComputer, type FeaturePoint } from '../renderers/webgpu/FeatureExtractionComputer';
import { STYLE_IDS, STYLE_FUNCTION_MAP, STYLE_REGISTRY } from '../styles/registry';
import { stripShaderCode } from '../utils/shaderStripper';

// Import shader sources
import commonWgsl from '../assets/shaders/common.wgsl?raw';
import stylesWgsl from '../assets/shaders/styles.wgsl?raw';
import adaptiveMeshWgsl from '../assets/shaders/adaptive_mesh.wgsl?raw';
import featureExtractWgsl from '../assets/shaders/feature_extract.wgsl?raw';

// ============================================================================
// Types
// ============================================================================

export interface AdaptiveExportProgress {
    status: 'idle' | 'initializing' | 'generating' | 'complete' | 'error';
    progress: number;
    message: string;
    subdivisionDepth?: number;
}

export interface AdaptiveExportStats {
    triangleCount: number;
    vertexCount: number;
    fileSize: string;
    fileSizeBytes: number;
    volumeMm3: number;
    volumeMl: number;
    surfaceAreaMm2: number;
    generationTimeMs: number;
    subdivisionStats: {
        initialQuads: number;
        finalQuads: number;
        maxDepthReached: number;
    };
}

export interface UseAdaptiveExportResult {
    progress: AdaptiveExportProgress;
    stats: AdaptiveExportStats | null;
    isAvailable: boolean;
    exportSTL: (filename?: string) => Promise<void>;
    generateMesh: () => Promise<MeshData | null>;
    reset: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

const DEFAULT_PROGRESS: AdaptiveExportProgress = {
    status: 'idle',
    progress: 0,
    message: '',
};

export function useAdaptiveExport(): UseAdaptiveExportResult {
    const [progress, setProgress] = useState<AdaptiveExportProgress>(DEFAULT_PROGRESS);
    const [stats, setStats] = useState<AdaptiveExportStats | null>(null);
    const [isAvailable, setIsAvailable] = useState<boolean>(false);

    const computerRef = useRef<AdaptiveExportComputer | null>(null);
    const featureComputerRef = useRef<FeatureExtractionComputer | null>(null);
    const deviceRef = useRef<GPUDevice | null>(null);

    const geometry = useAppStore((state) => state.geometry);
    const style = useAppStore((state) => state.style);
    const mesh = useAppStore((state) => state.mesh);

    // Initialize GPU
    useEffect(() => {
        let isMounted = true;

        const initGPU = async () => {
            try {
                if (!navigator.gpu) {
                    console.warn('[useAdaptiveExport] WebGPU not supported');
                    if (isMounted) setIsAvailable(false);
                    return;
                }

                if (!deviceRef.current) {
                    const adapter = await navigator.gpu.requestAdapter();
                    if (!adapter) {
                        console.warn('[useAdaptiveExport] No GPU adapter');
                        if (isMounted) setIsAvailable(false);
                        return;
                    }

                    const device = await adapter.requestDevice({
                        requiredLimits: {
                            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
                            maxBufferSize: adapter.limits.maxBufferSize,
                            maxStorageBuffersPerShaderStage: 10,
                        },
                    });

                    deviceRef.current = device;
                    deviceRef.current = device;
                    computerRef.current = new AdaptiveExportComputer(device);
                    featureComputerRef.current = new FeatureExtractionComputer(device);
                }

                if (!computerRef.current || !featureComputerRef.current) return;

                // Build shader with style dispatch - same pattern as useGPUExport
                const styleIdVal = (style.name as StyleId) ?? 'SuperformulaBlossom';
                const styleIndex = STYLE_IDS[styleIdVal] ?? 0;
                const functionName = (STYLE_FUNCTION_MAP as any)[styleIndex] || 'sf_radius';

                // Strip unused style functions to reduce shader size
                const strippedStyles = stripShaderCode(stylesWgsl, functionName);

                // Generate style dispatch function
                const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}
`;

                // Concatenate shaders in proper order:
                // 1. common.wgsl - math helpers, constants
                // 2. strippedStyles - style functions that use getf(), style_param()
                // 3. dispatchCode - style_radius dispatch
                // 4. adaptive_mesh.wgsl - defines bindings, getf(), style_param() overrides, kernels
                // Note: adaptive_mesh.wgsl's getf()/style_param() override common.wgsl's versions
                const fullShaderSource = [commonWgsl, strippedStyles, dispatchCode, adaptiveMeshWgsl].join('\n');

                console.log(`[useAdaptiveExport] Compiling adaptive shader for style ${styleIndex} (${functionName})...`);
                await computerRef.current.init(fullShaderSource);

                // Initialize Feature Extraction Computer (reusing same shader concatenation logic)
                // We need common + styles + feature_extract
                // But feature_extract needs the SAME 'style_radius' dispatch function.
                const featureShaderSource = [commonWgsl, strippedStyles, dispatchCode, featureExtractWgsl].join('\n');
                await featureComputerRef.current.init(featureShaderSource);

                if (isMounted) {
                    setIsAvailable(true);
                    console.log('[useAdaptiveExport] Adaptive export ready');
                }
            } catch (error) {
                console.error('[useAdaptiveExport] Init failed:', error);
                if (isMounted) setIsAvailable(false);
            }
        };

        initGPU();

        return () => { isMounted = false; };
    }, [style.name]);

    // Cleanup
    useEffect(() => {
        return () => {
            computerRef.current?.destroy();
            featureComputerRef.current?.destroy();
            deviceRef.current?.destroy();
            computerRef.current = null;
            featureComputerRef.current = null;
            deviceRef.current = null;
        };
    }, []);

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

    const generateMesh = useCallback(async (): Promise<MeshData | null> => {
        if (!computerRef.current?.isReady()) {
            setProgress({
                status: 'error',
                progress: 0,
                message: 'Adaptive export not available',
            });
            return null;
        }

        try {
            setProgress({
                status: 'generating',
                progress: 10,
                message: 'Starting adaptive mesh generation...',
            });

            // --- FEATURE EXTRACTION & TOPOLOGY ---
            let baseMesh: { vertices: Float32Array, indices: Uint32Array } | undefined = undefined;
            let features: FeaturePoint[] = [];

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

            if (featureComputerRef.current) {
                console.log('[useAdaptiveExport] 1. Extraction: Running...');
                try {
                    features = await featureComputerRef.current.compute({
                        styleId,
                        styleOpts,
                        styleIndex,
                        dimensions,
                        gridSizeX: 1024,
                        gridSizeY: 512,
                        threshold: 1.0 // Very sensitive to catch all ridges
                    });

                    console.log(`[useAdaptiveExport] 2. Analysis: Found ${features.length} features.`);

                    // --- TOPOLOGY GENERATION (CPU) ---
                    console.log('[useAdaptiveExport] 3. Topology: Generating Constrained Mesh...');
                    baseMesh = ConstrainedTriangulator.generateFullPot(features);
                    console.log(`[useAdaptiveExport]    - Base Mesh: ${baseMesh.vertices.length / 3} verts, ${baseMesh.indices.length / 3} tris.`);

                } catch (e) {
                    console.warn('Feature extraction failure:', e);
                }
            }

            // Fallback if extraction failed
            if (!baseMesh) {
                baseMesh = ConstrainedTriangulator.generateFullPot([]);
            }

            const params: AdaptiveExportParams = {
                dimensions,
                styleId,
                styleOpts,
                styleIndex,
                targetTriangles: 2_000_000,
                subdivThreshold: 0.05,
                maxDepth: 0,
                baseMesh: baseMesh,
                features: features
            };

            setProgress({
                status: 'generating',
                progress: 30,
                message: 'Running adaptive subdivision...',
            });

            const result = await computerRef.current.compute(params);

            // Cleanup feature buffer if we created it (Removed)

            const volume = calculateMeshVolume(result.mesh);
            const surfaceArea = calculateMeshSurfaceArea(result.mesh);
            const fileSizeBytes = estimateSTLSize(result.mesh.triangleCount, true);

            const exportStats: AdaptiveExportStats = {
                triangleCount: result.mesh.triangleCount,
                vertexCount: result.mesh.vertexCount,
                fileSize: formatFileSize(fileSizeBytes),
                fileSizeBytes,
                volumeMm3: volume,
                volumeMl: volume / 1000,
                surfaceAreaMm2: surfaceArea,
                generationTimeMs: result.computeTimeMs,
                subdivisionStats: result.subdivisionStats,
            };

            setStats(exportStats);

            setProgress({
                status: 'complete',
                progress: 100,
                message: `Generated ${result.mesh.triangleCount.toLocaleString()} triangles`,
                subdivisionDepth: result.subdivisionStats.maxDepthReached,
            });

            return result.mesh;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setProgress({
                status: 'error',
                progress: 0,
                message: `Adaptive export failed: ${message}`,
            });
            return null;
        }
    }, [geometry, style, mesh, buildStyleOptions]);

    const exportSTL = useCallback(async (filename: string = 'pot.stl'): Promise<void> => {
        const meshData = await generateMesh();
        if (!meshData) return;

        setProgress({
            status: 'generating',
            progress: 90,
            message: 'Preparing download...',
        });

        const styleName = style.name ?? 'Pot';
        const finalFilename = filename === 'pot.stl'
            ? `PotFoundry_${styleName}_Adaptive_${Date.now()}.stl`
            : filename;

        downloadSTL(meshData, finalFilename, {
            name: `PotFoundry ${style.name} (Adaptive)`,
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

    return {
        progress,
        stats,
        isAvailable,
        exportSTL,
        generateMesh,
        reset,
    };
}

export default useAdaptiveExport;
