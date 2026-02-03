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
import { useControllerMaybe } from '../context/ControllerContext';

// Import shader sources
import commonWgsl from '../assets/shaders/common.wgsl?raw';
import stylesWgsl from '../assets/shaders/styles.wgsl?raw';
import adaptiveMeshWgsl from '../assets/shaders/adaptive_mesh.wgsl?raw';
import featureExtractWgsl from '../assets/shaders/feature_extract.wgsl?raw';


// ============================================================================
// Types
// ============================================================================

export type AdaptiveExportQuality = 'low' | 'medium' | 'high' | 'ultra';

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
        initialTriangles: number;
        finalTriangles: number;
        maxDepthReached: number;
        overflowDetected: boolean;
    };
}

export interface UseAdaptiveExportResult {
    progress: AdaptiveExportProgress;
    stats: AdaptiveExportStats | null;
    isAvailable: boolean;
    exportSTL: (filename?: string, quality?: AdaptiveExportQuality) => Promise<void>;
    generateMesh: (quality?: AdaptiveExportQuality) => Promise<MeshData | null>;
    reset: () => void;
}

const QUALITY_SETTINGS: Record<AdaptiveExportQuality, Partial<AdaptiveExportParams>> = {
    // Negative threshold forces uniform subdivision (robust against T-junction cracks)
    // We now switch to Adaptive (Positive) to prevent overflow on complex pots.
    // Cracks are handled by the new ConstrainedTriangulator topology.
    low: { targetTriangles: 500_000, maxDepth: 4, subdivThreshold: 0.05 },
    medium: { targetTriangles: 3_000_000, maxDepth: 5, subdivThreshold: 0.02 },
    high: { targetTriangles: 6_000_000, maxDepth: 6, subdivThreshold: 0.01 },
    ultra: { targetTriangles: 10_000_000, maxDepth: 7, subdivThreshold: 0.01 }, // Stabilized
};

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
    const ctrl = useControllerMaybe();

    // Initialize GPU
    useEffect(() => {
        console.log('[useAdaptiveExport] Mounting and initializing GPU...');
        let isMounted = true;
        let device: GPUDevice | null = null;
        let computer: AdaptiveExportComputer | null = null;
        let featureComputer: FeatureExtractionComputer | null = null;

        const initGPU = async () => {
            try {
                if (!navigator.gpu) {
                    console.warn('[useAdaptiveExport] WebGPU not supported');
                    if (isMounted) setIsAvailable(false);
                    return;
                }

                const adapter = await navigator.gpu.requestAdapter();
                if (!adapter) {
                    console.warn('[useAdaptiveExport] No GPU adapter');
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
                    console.error(`[useAdaptiveExport] Device lost: ${info.reason}`);
                    if (isMounted) {
                        setIsAvailable(false);
                        setProgress(p => ({ ...p, status: 'error', message: 'GPU Device Lost. Please reload.' }));
                    }
                });

                computer = new AdaptiveExportComputer(device);
                featureComputer = new FeatureExtractionComputer(device);

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

                const fullShaderSource = [commonWgsl, strippedStyles, dispatchCode, adaptiveMeshWgsl].join('\n');
                await computer.init(fullShaderSource);

                const featureShaderSource = [commonWgsl, strippedStyles, dispatchCode, featureExtractWgsl].join('\n');
                await featureComputer.init(featureShaderSource);

                if (isMounted) {
                    computerRef.current = computer;
                    featureComputerRef.current = featureComputer;
                    deviceRef.current = device;
                    setIsAvailable(true);
                    console.log('[useAdaptiveExport] Adaptive export ready');
                } else {
                    // Cleanup if unmounted during init
                    computer.destroy();
                    featureComputer.destroy();
                    device.destroy();
                }
            } catch (error) {
                console.error('[useAdaptiveExport] Init failed:', error);
                if (isMounted) setIsAvailable(false);
                // Cleanup partial
                computer?.destroy();
                featureComputer?.destroy();
                device?.destroy();
            }
        };

        initGPU();

        return () => {
            isMounted = false;
            // Cleanup on unmount or re-effect
            computerRef.current?.destroy();
            featureComputerRef.current?.destroy();
            deviceRef.current?.destroy();
            computerRef.current = null;
            featureComputerRef.current = null;
            deviceRef.current = null;
        };
    }, [style.name]); // Re-init when style (shader) changes

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

    // Helper to calculate twist (matches WGSL)
    const twistTheta = (theta: number, t: number, opts: Record<string, number>): number => {
        const turns = opts.spinTurns ?? 0;
        const phase = (opts.spinPhaseDeg ?? 0) * (Math.PI / 180);
        const curve = Math.max(opts.spinCurveExp ?? 1, 0.0001);
        return theta + 2 * Math.PI * turns * Math.pow(t, curve) + phase;
    };

    const generateMesh = useCallback(async (quality: AdaptiveExportQuality = 'high'): Promise<MeshData | null> => {
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
                message: `Starting adaptive mesh generation (${quality})...`,
            });

            // Wait for next frame to update UI
            await new Promise(r => setTimeout(r, 0));

            // --- FEATURE EXTRACTION & TOPOLOGY ---
            let baseMesh: { vertices: Float32Array, indices: Uint32Array } | undefined = undefined;
            let features: FeaturePoint[] = []; // Sparse for params (Legacy view)
            let featureSegments: Float32Array | undefined = undefined;
            let featureGridOffsets: Uint32Array | undefined = undefined;

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
                setProgress({ status: 'generating', progress: 20, message: 'Analyzing features...' });

                // Sensitivity adjustments based on quality? Use robust defaults for now.
                // Sensitivity adjustments: moderately sensitive to filter out surface ripple noise
                const extractionThreshold = quality === 'ultra' ? 0.02 :
                    quality === 'high' ? 0.03 : 0.06;

                console.log(`[useAdaptiveExport] 1. Extraction: quality=${quality}, threshold=${extractionThreshold}`);
                try {
                    const rawFeatures = await featureComputerRef.current.compute({
                        styleId,
                        styleOpts,
                        styleIndex,
                        dimensions,
                        gridSizeX: 1024,
                        gridSizeY: 512,
                        threshold: extractionThreshold
                    });

                    console.log(`[useAdaptiveExport] 2. Analysis: Found ${rawFeatures.length} raw candidates.`);

                    // FIX: CPU-side filtering to remove noise but keep significant features
                    // Sort by strength descending
                    rawFeatures.sort((a, b) => b.strength - a.strength);

                    // 1. Sparse List for CPU Triangulation (Limit 5k to prevent crash)
                    const triangulationFeatures = rawFeatures.filter(f => f.strength > extractionThreshold).slice(0, 5000);

                    // 2. Dense List for GPU Snapping (Limit 50k for performance, but much higher fidelity)
                    const snappingFeatures = rawFeatures.filter(f => f.strength > extractionThreshold).slice(0, 50000);

                    // CRITICAL FIX: Assign features so params are valid
                    features = triangulationFeatures;

                    console.log(`[useAdaptiveExport]    - Triangulation Features: ${triangulationFeatures.length}`);
                    console.log(`[useAdaptiveExport]    - Snapping Features: ${snappingFeatures.length} (feeding GPU)`);

                    // --- TOPOLOGY GENERATION (CPU) ---
                    setProgress({ status: 'generating', progress: 30, message: 'Generating base topology...' });
                    await new Promise(r => setTimeout(r, 0));

                    console.log('[useAdaptiveExport] 3. Topology: Generating Constrained Mesh...');
                    baseMesh = ConstrainedTriangulator.generateFullPot(triangulationFeatures);
                    console.log(`[useAdaptiveExport]    - Base Mesh: ${baseMesh.vertices.length / 3} verts, ${baseMesh.indices.length / 3} tris.`);

                    // --- GENERATE GPU SNAPPING DATA (Segments + Grid) ---
                    try {
                        // Extract chains from the HIGH FIDELITY set
                        const { chains } = ConstrainedTriangulator.extractChains(snappingFeatures);
                        console.log(`[useAdaptiveExport]    - Extracted Chains: ${chains.length}. First Chain Length: ${chains[0]?.length || 0}`);

                        // Binning Config
                        const GRID_BINS = 64;
                        const binLists: number[][] = Array.from({ length: GRID_BINS }, () => []);
                        const allSegments: number[] = []; // [p1x, p1y, p2x, p2y]

                        // Flatten Chains -> Segments & Bin
                        let totalPoints = 0;
                        chains.forEach((chain, cIdx) => {
                            if (!chain || chain.length < 2) return;
                            for (let i = 0; i < chain.length - 1; i++) {
                                const p1 = chain[i];
                                const p2 = chain[i + 1];
                                if (!p1 || !p2) continue;

                                // Store raw segment (x,y are 0..1 normalized)
                                const segIdx = allSegments.length / 4;
                                allSegments.push(p1.x, p1.y, p2.x, p2.y);
                                totalPoints += 2;

                                // Binning
                                const b1 = Math.max(0, Math.min(GRID_BINS - 1, Math.floor(p1.x * GRID_BINS)));
                                const b2 = Math.max(0, Math.min(GRID_BINS - 1, Math.floor(p2.x * GRID_BINS)));

                                const dx = Math.abs(p1.x - p2.x);
                                // Detect Wrap (e.g. 0.99 -> 0.01)
                                if (dx > 0.5) {
                                    const minB = Math.min(b1, b2);
                                    const maxB = Math.max(b1, b2);
                                    for (let b = maxB; b < GRID_BINS; b++) binLists[b]?.push(segIdx);
                                    for (let b = 0; b <= minB; b++) binLists[b]?.push(segIdx);
                                } else {
                                    const minB = Math.min(b1, b2);
                                    const maxB = Math.max(b1, b2);
                                    for (let b = minB; b <= maxB; b++) binLists[b]?.push(segIdx);
                                }
                            }
                        });

                        // --- DEBUG VISUALIZATION ---
                        console.log(`[useAdaptiveExport] DebugVis: Segments=${allSegments.length}, Ctrl=${!!ctrl}, Ref=${!!ctrl?.controllerRef.current}`);
                        if (ctrl?.controllerRef.current) {
                            const renderer = ctrl.controllerRef.current;
                            console.log(`[useAdaptiveExport] DebugVis: Renderer found. setDebugSegments=${typeof renderer.setDebugSegments}`);
                            if (renderer.setDebugSegments) {
                                console.log(`[useAdaptiveExport] Calling setDebugSegments with ${allSegments.length} floats.`);
                                renderer.setDebugSegments(new Float32Array(allSegments));
                            } else {
                                console.warn('[useAdaptiveExport] DebugVis: Wrapper has no setDebugSegments method!');
                            }
                        } else {
                            console.warn('[useAdaptiveExport] DebugVis: Controller Ref is missing! Cannot visualize.');
                        }

                        // Build Final Sorted Buffers
                        const sortedSegments: number[] = [];
                        const gridOffsets = new Uint32Array(GRID_BINS + 1);
                        let offset = 0;

                        for (let b = 0; b < GRID_BINS; b++) {
                            gridOffsets[b] = offset;
                            const indices = binLists[b];
                            for (const idx of indices) {
                                const base = idx * 4;
                                // Copy segment (4 floats)
                                sortedSegments.push(allSegments[base], allSegments[base + 1], allSegments[base + 2], allSegments[base + 3]);
                                offset++;
                            }
                        }
                        gridOffsets[GRID_BINS] = offset;

                        // Assign to variables for params
                        featureSegments = new Float32Array(sortedSegments);
                        featureGridOffsets = gridOffsets;

                        console.log(`[useAdaptiveExport]    - Generated ${allSegments.length / 4} unique segments.`);
                        console.log(`[useAdaptiveExport]    - Binned into ${sortedSegments.length / 4} GPU references.`);

                    } catch (err) {
                        console.error('[useAdaptiveExport] CRITICAL ERROR IN SEGMENTATION LOOP:', err);
                    }

                } catch (e) {
                    console.error('Feature extraction root failure:', e);
                }
            }

            // Fallback if extraction failed or returned no features
            if (!baseMesh) {
                console.warn('[useAdaptiveExport] Using unconstrained fallback mesh.');
                baseMesh = ConstrainedTriangulator.generateFullPot([]);
            }

            const qSettings = QUALITY_SETTINGS[quality];

            const params: AdaptiveExportParams = {
                dimensions,
                styleId,
                styleOpts,
                styleIndex,
                targetTriangles: qSettings.targetTriangles,
                subdivThreshold: qSettings.subdivThreshold,
                maxDepth: qSettings.maxDepth,
                baseMesh: baseMesh,
                features: features,
                featureSegments: featureSegments,
                featureGridOffsets: featureGridOffsets
            };

            setProgress({
                status: 'generating',
                progress: 40,
                message: 'Refining mesh on GPU...',
            });

            const result = await computerRef.current.compute(params);

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
                message: `Generated ${result.mesh.triangleCount.toLocaleString()} triangles` +
                    (result.subdivisionStats.overflowDetected ? ' (Capacity Limit)' : ''),
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
    }, [geometry, style, mesh, buildStyleOptions, ctrl]);

    const exportSTL = useCallback(async (filename: string = 'pot.stl', quality: AdaptiveExportQuality = 'high'): Promise<void> => {
        const meshData = await generateMesh(quality);
        if (!meshData) return;

        setProgress({
            status: 'generating',
            progress: 90,
            message: 'Preparing download...',
        });

        const styleName = style.name ?? 'Pot';
        const finalFilename = filename === 'pot.stl'
            ? `PotFoundry_${styleName}_Adaptive_${quality}_${Date.now()}.stl`
            : filename;

        downloadSTL(meshData, finalFilename, {
            name: `PotFoundry ${style.name} (Adaptive ${quality})`,
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
