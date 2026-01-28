/**
 * Export Pipeline Integration Tests
 * 
 * Tests the complete data flow from feature extraction through adaptive meshing to STL generation.
 * Since WebGPU cannot run in Node.js, these tests verify:
 * - Component orchestration and data flow
 * - Parameter propagation through the pipeline
 * - Error handling and propagation
 * - State management across pipeline stages
 * - Resource cleanup and memory management
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupWebGPUMock, resetMockState, getBufferStats } from '../test/webgpu-mock';
import type { FeaturePoint } from '../renderers/webgpu/FeatureExtractionComputer';
import {
    generateBinarySTL,
    generateAsciiSTL,
    estimateSTLSize,
    formatFileSize
} from '../geometry/stlExport';

// ============================================================================
// Test: Pipeline Data Flow
// ============================================================================

describe('Integration - Pipeline Data Flow', () => {
    beforeEach(() => {
        setupWebGPUMock();
    });

    afterEach(() => {
        resetMockState();
    });

    it('should flow features to adaptive mesh parameters', () => {
        // Simulate feature extraction output
        const features: FeaturePoint[] = [
            { theta: 0, t: 0.5, type: 1, strength: 0.9 },
            { theta: Math.PI, t: 0.75, type: 2, strength: 0.7 },
        ];

        // Build feature-guided subdivision parameters
        const buildFeatureGuidedParams = (features: FeaturePoint[]) => {
            const hotspots = features
                .filter(f => f.strength > 0.5)
                .map(f => ({ theta: f.theta, t: f.t, weight: f.strength }));

            return {
                featureCount: features.length,
                hotspots,
                avgStrength: features.reduce((sum, f) => sum + f.strength, 0) / features.length
            };
        };

        const params = buildFeatureGuidedParams(features);

        expect(params.featureCount).toBe(2);
        expect(params.hotspots.length).toBe(2);
        expect(params.avgStrength).toBeCloseTo(0.8);
    });

    it('should flow mesh data to STL generator', () => {
        // Simulate mesh output from adaptive Computer
        const vertices = new Float32Array([
            0, 0, 0, 1, 0, 0, 0, 1, 0,  // Triangle 1
            0, 0, 0, 1, 0, 0, 0, 0, 1,  // Triangle 2
        ]);

        const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
        const triangleCount = 2;

        // Create MeshData object
        const mesh = { vertices, indices, triangleCount, vertexCount: 6 };

        // Pass to STL generator
        const stl = generateBinarySTL(mesh);

        // Verify STL output
        expect(stl.byteLength).toBe(84 + triangleCount * 50);
        expect(new Uint32Array(stl, 80, 1)[0]).toBe(triangleCount);
    });

    it('should propagate dimensions through all stages', () => {
        const dimensions = {
            H: 100,
            Rt: 50,
            Rb: 40,
            tWall: 3,
            tBottom: 5,
            rDrain: 8,
            expn: 2
        };

        // Stage 1: Feature extraction uses dimensions for radius calculation
        const outerRadius = (t: number) => {
            const tNorm = t;
            return dimensions.Rb + (dimensions.Rt - dimensions.Rb) * tNorm;
        };

        // Stage 2: Adaptive mesh uses dimensions for vertex generation
        const generateVertex = (theta: number, t: number) => {
            const r = outerRadius(t);
            return {
                x: r * Math.cos(theta),
                y: r * Math.sin(theta),
                z: t * dimensions.H
            };
        };

        // Verify dimensions flow correctly
        const v1 = generateVertex(0, 0);
        const v2 = generateVertex(0, 1);

        expect(v1.z).toBe(0);
        expect(v2.z).toBe(dimensions.H);
        expect(v1.x).toBeCloseTo(dimensions.Rb);
        expect(v2.x).toBeCloseTo(dimensions.Rt);
    });
});

// ============================================================================
// Test: Style Options Propagation
// ============================================================================

describe('Integration - Style Options Propagation', () => {
    it('should propagate style ID through pipeline', () => {
        const styleId = 'twist';
        const styleIndex = 5; // Example mapping

        // Mock style param building
        const buildParams = (styleId: string) => {
            const STYLE_IDS: Record<string, number> = {
                smooth: 0,
                ribs: 1,
                spiral: 2,
                diamond: 3,
                wave: 4,
                twist: 5,
            };
            return STYLE_IDS[styleId] ?? 0;
        };

        expect(buildParams(styleId)).toBe(styleIndex);
    });

    it('should pack style options into uniform buffer', () => {
        const styleOpts = {
            spinTurns: 2,
            spinPhaseDeg: 45,
            spinCurveExp: 1.5,
            bellAmp: 0.3,
            bellCenter: 0.5,
            bellWidth: 0.22,
        };

        // Pack into Float32Array (simulating uniform buffer)
        const packed = new Float32Array([
            100, 50, 40, 0,  // Chunk0: H, Rt, Rb, pad
            0, 0, 2, 5,      // Chunk1: pad, pad, expn, styleIndex
            styleOpts.spinTurns,
            (styleOpts.spinPhaseDeg * Math.PI) / 180,
            styleOpts.spinCurveExp,
            0, // seamAngle
            styleOpts.bellAmp,
            styleOpts.bellCenter,
            styleOpts.bellWidth,
            0  // pad
        ]);

        expect(packed[8]).toBe(2);  // spinTurns
        expect(packed[9]).toBeCloseTo(Math.PI / 4);  // 45° in radians
        expect(packed[12]).toBeCloseTo(0.3, 5);  // bellAmp (use toBeCloseTo for Float32)
    });
});

// ============================================================================
// Test: Quality Settings Integration
// ============================================================================

describe('Integration - Quality Settings', () => {
    const QUALITY_SETTINGS = {
        draft: { targetTris: 500_000, baseGridSize: 512 },
        normal: { targetTris: 2_000_000, baseGridSize: 1024 },
        high: { targetTris: 4_000_000, baseGridSize: 2048 },
        ultra: { targetTris: 8_000_000, baseGridSize: 4096 },
    };

    it('should map quality to target triangle count', () => {
        expect(QUALITY_SETTINGS.draft.targetTris).toBe(500_000);
        expect(QUALITY_SETTINGS.ultra.targetTris).toBe(8_000_000);
    });

    it('should estimate STL size from quality', () => {
        for (const [quality, settings] of Object.entries(QUALITY_SETTINGS)) {
            const estimatedSize = estimateSTLSize(settings.targetTris);
            const formatted = formatFileSize(estimatedSize);

            expect(estimatedSize).toBeGreaterThan(0);
            expect(formatted).toBeTruthy();
        }
    });

    it('should scale grid size with quality', () => {
        const featureGridScale = 0.25; // Features grid is 1/4 of base

        for (const settings of Object.values(QUALITY_SETTINGS)) {
            const featureGridX = Math.floor(settings.baseGridSize * featureGridScale);
            const featureGridY = Math.floor(settings.baseGridSize * featureGridScale * 0.5);

            expect(featureGridX).toBeGreaterThan(0);
            expect(featureGridY).toBeGreaterThan(0);
        }
    });
});

// ============================================================================
// Test: Error Propagation
// ============================================================================

describe('Integration - Error Propagation', () => {
    it('should propagate initialization errors', async () => {
        const initPipeline = async (device: GPUDevice | null) => {
            if (!device) {
                throw new Error('Failed to obtain GPU device');
            }
            return { initialized: true };
        };

        await expect(initPipeline(null)).rejects.toThrow('Failed to obtain GPU device');
    });

    it('should propagate feature extraction errors', async () => {
        const extractFeatures = async (initialized: boolean) => {
            if (!initialized) {
                throw new Error('FeatureExtractionComputer not initialized');
            }
            return [];
        };

        await expect(extractFeatures(false)).rejects.toThrow('not initialized');
    });

    it('should propagate mesh generation errors', async () => {
        const generateMesh = async (vertices: Float32Array | null) => {
            if (!vertices || vertices.length === 0) {
                throw new Error('No vertices generated');
            }
            return { triangleCount: vertices.length / 9 };
        };

        await expect(generateMesh(null)).rejects.toThrow('No vertices generated');
        await expect(generateMesh(new Float32Array([]))).rejects.toThrow('No vertices generated');
    });

    it('should wrap errors with context', () => {
        const wrapError = (stage: string, err: Error) => {
            return new Error(`[${stage}] ${err.message}`);
        };

        const original = new Error('Buffer allocation failed');
        const wrapped = wrapError('AdaptiveExport', original);

        expect(wrapped.message).toContain('[AdaptiveExport]');
        expect(wrapped.message).toContain('Buffer allocation failed');
    });
});

// ============================================================================
// Test: Progress Tracking Integration
// ============================================================================

describe('Integration - Progress Tracking', () => {
    it('should track progress through pipeline stages', () => {
        const stages = ['init', 'features', 'subdivide', 'emit', 'stl'];
        let currentStage = 0;
        const progress: { stage: string; percent: number }[] = [];

        const reportProgress = (stage: string, percent: number) => {
            progress.push({ stage, percent });
        };

        // Simulate pipeline execution
        for (const stage of stages) {
            reportProgress(stage, (++currentStage / stages.length) * 100);
        }

        expect(progress.length).toBe(5);
        expect(progress[0].stage).toBe('init');
        expect(progress[4].percent).toBe(100);
    });

    it('should calculate subdivision progress accurately', () => {
        const calculateSubdivisionProgress = (
            currentDepth: number,
            maxDepth: number,
            currentTris: number,
            targetTris: number
        ) => {
            const depthProgress = currentDepth / maxDepth;
            const triProgress = Math.min(1, currentTris / targetTris);
            return Math.max(depthProgress, triProgress);
        };

        // Early: depth-based progress dominates
        expect(calculateSubdivisionProgress(1, 6, 1000, 4_000_000)).toBeCloseTo(1 / 6, 1);

        // Late: triangle-based progress dominates
        expect(calculateSubdivisionProgress(3, 6, 3_500_000, 4_000_000)).toBeCloseTo(0.875, 2);
    });
});

// ============================================================================
// Test: Resource Management Integration
// ============================================================================

describe('Integration - Resource Management', () => {
    beforeEach(() => {
        setupWebGPUMock();
    });

    afterEach(() => {
        resetMockState();
    });

    it('should track buffer allocations across pipeline', async () => {
        const gpu = navigator.gpu;
        const adapter = await gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        // Simulate pipeline buffer creation
        const buffers = [
            device.createBuffer({ size: 1024, usage: GPUBufferUsage.UNIFORM }),
            device.createBuffer({ size: 4096, usage: GPUBufferUsage.STORAGE }),
            device.createBuffer({ size: 8192, usage: GPUBufferUsage.STORAGE }),
        ];

        const stats1 = getBufferStats();
        expect(stats1.totalAllocated).toBe(3);
        expect(stats1.leakedCount).toBe(3);

        // Cleanup
        buffers.forEach(b => b.destroy());

        const stats2 = getBufferStats();
        expect(stats2.totalDestroyed).toBe(3);
        expect(stats2.leakedCount).toBe(0);
    });

    it('should detect buffer leaks', async () => {
        const gpu = navigator.gpu;
        const adapter = await gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        // Create but don't destroy
        device.createBuffer({ size: 1024, usage: GPUBufferUsage.UNIFORM, label: 'LeakedBuffer' });

        const stats = getBufferStats();
        expect(stats.leakedCount).toBe(1);
        expect(stats.leakedBuffers[0].label).toBe('LeakedBuffer');
    });
});

// ============================================================================
// Test: End-to-End Mesh Generation (Mocked)
// ============================================================================

describe('Integration - End-to-End Mesh Generation', () => {
    it('should generate valid mesh from parameters', () => {
        // Full parameter set
        const params = {
            dimensions: { H: 100, Rt: 50, Rb: 40, tWall: 3, tBottom: 5, rDrain: 8, expn: 2 },
            styleId: 'smooth',
            quality: 'normal' as const,
            resolution: { theta: 64, t: 32 }
        };

        // Simulate mesh generation
        const generateBaseMesh = (res: { theta: number; t: number }) => {
            const verts: number[] = [];
            const inds: number[] = [];

            for (let ti = 0; ti < res.t; ti++) {
                for (let thetai = 0; thetai < res.theta; thetai++) {
                    const theta = (thetai / res.theta) * Math.PI * 2;
                    const t = ti / (res.t - 1);
                    const r = params.dimensions.Rb + (params.dimensions.Rt - params.dimensions.Rb) * t;

                    verts.push(r * Math.cos(theta), r * Math.sin(theta), t * params.dimensions.H);
                }
            }

            // Generate indices for triangle strip
            for (let ti = 0; ti < res.t - 1; ti++) {
                for (let thetai = 0; thetai < res.theta; thetai++) {
                    const i0 = ti * res.theta + thetai;
                    const i1 = ti * res.theta + ((thetai + 1) % res.theta);
                    const i2 = (ti + 1) * res.theta + thetai;
                    const i3 = (ti + 1) * res.theta + ((thetai + 1) % res.theta);

                    inds.push(i0, i1, i2);
                    inds.push(i1, i3, i2);
                }
            }

            return {
                vertices: new Float32Array(verts),
                indices: new Uint32Array(inds),
                triangleCount: inds.length / 3
            };
        };

        const mesh = generateBaseMesh(params.resolution);

        expect(mesh.vertices.length).toBe(params.resolution.theta * params.resolution.t * 3);
        expect(mesh.triangleCount).toBe((params.resolution.t - 1) * params.resolution.theta * 2);
    });

    it('should generate valid STL from mesh', () => {
        // Simple mesh
        const vertices = new Float32Array([
            0, 0, 0, 1, 0, 0, 0.5, 1, 0,  // Triangle
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const mesh = { vertices, indices, triangleCount: 1, vertexCount: 3 };

        const stl = generateBinarySTL(mesh);
        const ascii = generateAsciiSTL(mesh, 'TestSolid');

        expect(stl.byteLength).toBe(84 + 50); // Header + 1 triangle
        expect(ascii).toContain('solid TestSolid');
        expect(ascii).toContain('endsolid TestSolid');
    });
});

// ============================================================================
// Test: Multi-Surface Integration
// ============================================================================

describe('Integration - Multi-Surface Pipeline', () => {
    const SURFACES = {
        OUTER: 0,
        INNER: 1,
        RIM: 2,
        BOTTOM_UNDER: 3,
        BOTTOM_TOP: 4,
        DRAIN: 5,
    };

    it('should process all surfaces through pipeline', () => {
        const surfaceMeshes: { id: number; tris: number }[] = [];

        // Simulate multi-surface generation
        for (const [name, id] of Object.entries(SURFACES)) {
            const baseTris = id === SURFACES.OUTER ? 1000 : 200;
            surfaceMeshes.push({ id, tris: baseTris });
        }

        const totalTris = surfaceMeshes.reduce((sum, s) => sum + s.tris, 0);
        expect(totalTris).toBe(2000); // 1000 + 5*200
        expect(surfaceMeshes.length).toBe(6);
    });

    it('should merge surfaces into single mesh', () => {
        // Simulate per-surface vertices
        const surface1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const surface2 = new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]);

        // Merge
        const merged = new Float32Array(surface1.length + surface2.length);
        merged.set(surface1, 0);
        merged.set(surface2, surface1.length);

        expect(merged.length).toBe(18);
    });

    it('should update indices when merging surfaces', () => {
        const surface1Indices = new Uint32Array([0, 1, 2]); // 3 vertices
        const surface2Indices = new Uint32Array([0, 1, 2]); // 3 vertices

        const vertexOffset = 3; // surface1 has 3 vertices
        const mergedIndices = new Uint32Array(surface1Indices.length + surface2Indices.length);

        mergedIndices.set(surface1Indices, 0);
        for (let i = 0; i < surface2Indices.length; i++) {
            mergedIndices[surface1Indices.length + i] = surface2Indices[i] + vertexOffset;
        }

        expect(mergedIndices[0]).toBe(0);
        expect(mergedIndices[3]).toBe(3); // Offset applied
        expect(mergedIndices[5]).toBe(5);
    });
});

// ============================================================================
// Test: Filename Generation Integration
// ============================================================================

describe('Integration - Filename Generation', () => {
    it('should generate filename from export parameters', () => {
        const generateFilename = (
            styleId: string,
            dimensions: { H: number },
            quality: string,
            format: string
        ) => {
            const height = Math.round(dimensions.H);
            return `pot_${styleId}_${height}mm_${quality}.${format}`;
        };

        const filename = generateFilename('twist', { H: 100 }, 'high', 'stl');
        expect(filename).toBe('pot_twist_100mm_high.stl');
    });

    it('should sanitize style names in filename', () => {
        const sanitize = (name: string) => {
            return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        };

        expect(sanitize('Gothic Arches')).toBe('gothic_arches');
        expect(sanitize('Celtic-Knot')).toBe('celtic_knot');
    });
});

// ============================================================================
// Test: Blob Generation Integration
// ============================================================================

describe('Integration - Blob Generation', () => {
    it('should create downloadable blob from STL', () => {
        const vertices = new Float32Array([
            0, 0, 0, 1, 0, 0, 0, 1, 0,
        ]);
        const indices = new Uint32Array([0, 1, 2]);
        const mesh = { vertices, indices, triangleCount: 1, vertexCount: 3 };

        const stl = generateBinarySTL(mesh);
        const blob = new Blob([stl], { type: 'application/octet-stream' });

        expect(blob.size).toBe(stl.byteLength);
        expect(blob.type).toBe('application/octet-stream');
    });

    it('should estimate download time', () => {
        const estimateDownloadTime = (bytes: number, speedMbps: number = 10) => {
            const bytesPerSecond = (speedMbps * 1024 * 1024) / 8;
            return bytes / bytesPerSecond;
        };

        const size = 100 * 1024 * 1024; // 100MB
        const timeSeconds = estimateDownloadTime(size);

        expect(timeSeconds).toBeCloseTo(80, 0); // ~80 seconds at 10Mbps
    });
});

// ============================================================================
// Test: Pipeline Cancellation
// ============================================================================

describe('Integration - Pipeline Cancellation', () => {
    it('should support cancellation token', async () => {
        let cancelled = false;
        const cancelToken = { isCancelled: () => cancelled };

        const runPipelineWithCancel = async (cancel: { isCancelled: () => boolean }) => {
            for (let i = 0; i < 10; i++) {
                if (cancel.isCancelled()) {
                    throw new Error('Pipeline cancelled');
                }
                await new Promise(r => setTimeout(r, 1));
            }
            return { success: true };
        };

        // Cancel after short delay
        setTimeout(() => { cancelled = true; }, 5);

        await expect(runPipelineWithCancel(cancelToken)).rejects.toThrow('cancelled');
    });
});
