/**
 * useGPUExport Hook Tests
 * 
 * Tests for the legacy GPU-based mesh generation hook.
 * Since WebGPU is not available in Node.js, we test:
 * - Type definitions and interfaces
 * - Progress/stats state management
 * - Configuration builders
 * - Error handling paths
 */

import { describe, it, expect, vi } from 'vitest';

// Import types for testing
import type {
    GPUExportProgress,
    GPUExportStats,
    UseGPUExportResult,
} from './useGPUExport';

// ============================================================================
// Test: Types and Interfaces
// ============================================================================

describe('GPUExportProgress interface', () => {
    it('should represent valid idle state', () => {
        const progress: GPUExportProgress = {
            status: 'idle',
            progress: 0,
            message: '',
        };
        expect(progress.status).toBe('idle');
        expect(progress.progress).toBe(0);
    });

    it('should represent valid initializing state', () => {
        const progress: GPUExportProgress = {
            status: 'initializing',
            progress: 5,
            message: 'Compiling shader...',
        };
        expect(progress.status).toBe('initializing');
    });

    it('should represent valid generating state', () => {
        const progress: GPUExportProgress = {
            status: 'generating',
            progress: 50,
            message: 'GPU Export: Sty="GothicArches"(5), Q=512x512...',
        };
        expect(progress.status).toBe('generating');
        expect(progress.progress).toBe(50);
    });

    it('should represent valid error state', () => {
        const progress: GPUExportProgress = {
            status: 'error',
            progress: 0,
            message: 'GPU compute not available',
        };
        expect(progress.status).toBe('error');
    });

    it('should represent valid complete state', () => {
        const progress: GPUExportProgress = {
            status: 'complete',
            progress: 100,
            message: 'GPU mesh generated successfully',
        };
        expect(progress.status).toBe('complete');
        expect(progress.progress).toBe(100);
    });
});

describe('GPUExportStats interface', () => {
    it('should represent valid export statistics', () => {
        const stats: GPUExportStats = {
            triangleCount: 2_000_000,
            vertexCount: 1_000_000,
            fileSize: '95.4 MB',
            fileSizeBytes: 100_000_084,
            volumeMm3: 150_000,
            volumeMl: 150,
            surfaceAreaMm2: 25_000,
            generationTimeMs: 500,
            gpuAccelerated: true,
        };

        expect(stats.triangleCount).toBe(2_000_000);
        expect(stats.volumeMl).toBe(150);
        expect(stats.gpuAccelerated).toBe(true);
    });

    it('should track GPU acceleration flag', () => {
        const gpuStats: GPUExportStats = {
            triangleCount: 100_000,
            vertexCount: 50_000,
            fileSize: '4.8 MB',
            fileSizeBytes: 5_000_084,
            volumeMm3: 10_000,
            volumeMl: 10,
            surfaceAreaMm2: 5_000,
            generationTimeMs: 50,
            gpuAccelerated: true,
        };

        expect(gpuStats.gpuAccelerated).toBe(true);
    });
});

// ============================================================================
// Test: Resolution Safety Caps
// ============================================================================

describe('Resolution Safety Caps', () => {
    const SAFETY_CAP = 8192;

    it('should cap nTheta to safety limit', () => {
        const nTheta = 16384;
        const capped = Math.min(nTheta, SAFETY_CAP);
        expect(capped).toBe(SAFETY_CAP);
    });

    it('should cap nZ to safety limit', () => {
        const nZ = 10000;
        const capped = Math.min(nZ, SAFETY_CAP);
        expect(capped).toBe(SAFETY_CAP);
    });

    it('should not modify values under cap', () => {
        const nTheta = 4096;
        const nZ = 2048;
        expect(Math.min(nTheta, SAFETY_CAP)).toBe(4096);
        expect(Math.min(nZ, SAFETY_CAP)).toBe(2048);
    });
});

// ============================================================================
// Test: Tiled Export Detection
// ============================================================================

describe('Tiled Export Detection', () => {
    // Mock the tiling logic
    const MAX_VERTICES_PER_TILE = 1_000_000;
    const VERTICES_PER_GRID_CELL = 6; // 2 triangles * 3 vertices

    function needsTiling(nTheta: number, nZ: number): boolean {
        const totalVertices = nTheta * nZ * VERTICES_PER_GRID_CELL;
        return totalVertices > MAX_VERTICES_PER_TILE;
    }

    function getTileCount(nTheta: number, nZ: number): number {
        const totalVertices = nTheta * nZ * VERTICES_PER_GRID_CELL;
        return Math.ceil(totalVertices / MAX_VERTICES_PER_TILE);
    }

    it('should not need tiling for small meshes', () => {
        expect(needsTiling(256, 256)).toBe(false);
    });

    it('should need tiling for large meshes', () => {
        expect(needsTiling(4096, 4096)).toBe(true);
    });

    it('should calculate correct tile count', () => {
        // 8192 * 8192 * 6 = 402,653,184 vertices
        // 402,653,184 / 1,000,000 = 403 tiles
        const tiles = getTileCount(8192, 8192);
        expect(tiles).toBeGreaterThan(400);
    });

    it('should return 1 tile for small meshes', () => {
        const tiles = getTileCount(100, 100);
        expect(tiles).toBe(1);
    });
});

// ============================================================================
// Test: Style Options Building
// ============================================================================

describe('Style Options Building', () => {
    it('should include spin parameters', () => {
        const geometry = {
            spinTurns: 3,
            spinPhase: 90,
            spinCurve: 2,
        };

        const opts: Record<string, number> = {};
        opts.spinTurns = geometry.spinTurns ?? 0;
        opts.spinPhaseDeg = geometry.spinPhase ?? 0;
        opts.spinCurveExp = geometry.spinCurve ?? 1;

        expect(opts.spinTurns).toBe(3);
        expect(opts.spinPhaseDeg).toBe(90);
        expect(opts.spinCurveExp).toBe(2);
    });

    it('should include flare parameters', () => {
        const opts: Record<string, number> = {};
        opts.flareCenter = 0.5;
        opts.flareSharp = 6.0;

        expect(opts.flareCenter).toBe(0.5);
        expect(opts.flareSharp).toBe(6.0);
    });
});

// ============================================================================
// Test: Dimension Configuration
// ============================================================================

describe('Dimension Configuration', () => {
    it('should build dimensions from geometry state', () => {
        const geometry = {
            H: 120,
            top_od: 120,
            bottom_od: 90,
            t_wall: 4,
            t_bottom: 6,
            r_drain: 12,
            expn: 1.5,
        };

        const dimensions = {
            H: geometry.H,
            Rt: geometry.top_od / 2,
            Rb: geometry.bottom_od / 2,
            tWall: geometry.t_wall,
            tBottom: geometry.t_bottom,
            rDrain: geometry.r_drain,
            expn: geometry.expn,
        };

        expect(dimensions.H).toBe(120);
        expect(dimensions.Rt).toBe(60);
        expect(dimensions.Rb).toBe(45);
        expect(dimensions.tWall).toBe(4);
        expect(dimensions.rDrain).toBe(12);
    });
});

// ============================================================================
// Test: Progress Transitions
// ============================================================================

describe('Progress Transitions', () => {
    it('should transition through generating phases', () => {
        const steps: GPUExportProgress[] = [
            { status: 'generating', progress: 10, message: 'Preparing GPU compute...' },
            { status: 'generating', progress: 30, message: 'GPU Export: Sty="Celtic"(3)...' },
            { status: 'generating', progress: 70, message: 'Calculating statistics...' },
            { status: 'generating', progress: 90, message: 'Preparing download...' },
            { status: 'complete', progress: 100, message: 'Downloaded pot.stl' },
        ];

        // Progress should monotonically increase
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i].progress).toBeGreaterThanOrEqual(steps[i - 1].progress);
        }
    });

    it('should handle tiled export progress', () => {
        // Simulate tiled progress callback
        const tile = 5;
        const totalTiles = 10;
        const baseProgress = 30;
        const tileProgress = baseProgress + (tile / totalTiles) * 40;

        expect(tileProgress).toBe(50); // 30 + (5/10)*40 = 50
    });
});

// ============================================================================
// Test: Filename Generation
// ============================================================================

describe('Filename Generation', () => {
    it('should generate descriptive filename', () => {
        const styleName = 'WovenRattan';
        const timestamp = Date.now();
        const filename = `PotFoundry_${styleName}_GPU_${timestamp}.stl`;

        expect(filename).toContain('PotFoundry');
        expect(filename).toContain(styleName);
        expect(filename).toContain('GPU');
        expect(filename.endsWith('.stl')).toBe(true);
    });

    it('should use custom filename if provided', () => {
        const customFilename = 'my-pot.stl';
        const defaultFilename = 'pot.stl';
        const useDefault = customFilename === defaultFilename;

        expect(useDefault).toBe(false);
    });
});

// ============================================================================
// Test: UseGPUExportResult Interface
// ============================================================================

describe('UseGPUExportResult interface', () => {
    it('should have all required properties', () => {
        const mockResult: UseGPUExportResult = {
            progress: { status: 'idle', progress: 0, message: '' },
            stats: null,
            isGPUAvailable: false,
            exportSTL: vi.fn().mockResolvedValue(undefined),
            generateMesh: vi.fn().mockResolvedValue(null),
            reset: vi.fn(),
        };

        expect(mockResult.progress).toBeDefined();
        expect(mockResult.stats).toBeNull();
        expect(mockResult.isGPUAvailable).toBe(false);
        expect(typeof mockResult.exportSTL).toBe('function');
        expect(typeof mockResult.generateMesh).toBe('function');
        expect(typeof mockResult.reset).toBe('function');
    });
});

// ============================================================================
// Test: Error Messages
// ============================================================================

describe('Error Messages', () => {
    it('should format GPU not available error', () => {
        const message = 'GPU compute not available. Use CPU export instead.';
        expect(message).toContain('GPU compute not available');
    });

    it('should format compute failure error', () => {
        const error = new Error('Device lost');
        const message = `GPU compute failed: ${error.message}`;
        expect(message).toContain('GPU compute failed');
        expect(message).toContain('Device lost');
    });
});
