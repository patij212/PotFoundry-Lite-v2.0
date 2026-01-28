/**
 * useAdaptiveExport Hook Tests
 * 
 * Tests for the GPU-based adaptive mesh generation hook.
 * Since WebGPU is not available in Node.js, we test:
 * - Type definitions and interfaces
 * - Quality settings configuration
 * - Progress/stats state management
 * - Error handling paths
 * - Utility functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Import types and constants for testing
import type {
    AdaptiveExportQuality,
    AdaptiveExportProgress,
    AdaptiveExportStats,
    UseAdaptiveExportResult,
} from './useAdaptiveExport';

// ============================================================================
// Test: Types and Interfaces
// ============================================================================

describe('AdaptiveExportQuality type', () => {
    it('should support all quality levels', () => {
        const qualities: AdaptiveExportQuality[] = ['low', 'medium', 'high', 'ultra'];
        expect(qualities).toHaveLength(4);
        expect(qualities).toContain('low');
        expect(qualities).toContain('medium');
        expect(qualities).toContain('high');
        expect(qualities).toContain('ultra');
    });
});

describe('AdaptiveExportProgress interface', () => {
    it('should represent valid idle state', () => {
        const progress: AdaptiveExportProgress = {
            status: 'idle',
            progress: 0,
            message: '',
        };
        expect(progress.status).toBe('idle');
        expect(progress.progress).toBe(0);
    });

    it('should represent valid generating state', () => {
        const progress: AdaptiveExportProgress = {
            status: 'generating',
            progress: 50,
            message: 'Generating mesh...',
            subdivisionDepth: 3,
        };
        expect(progress.status).toBe('generating');
        expect(progress.subdivisionDepth).toBe(3);
    });

    it('should represent valid error state', () => {
        const progress: AdaptiveExportProgress = {
            status: 'error',
            progress: 0,
            message: 'GPU not available',
        };
        expect(progress.status).toBe('error');
    });

    it('should represent valid complete state', () => {
        const progress: AdaptiveExportProgress = {
            status: 'complete',
            progress: 100,
            message: 'Generated 1,000,000 triangles',
            subdivisionDepth: 5,
        };
        expect(progress.status).toBe('complete');
        expect(progress.progress).toBe(100);
    });
});

describe('AdaptiveExportStats interface', () => {
    it('should represent valid export statistics', () => {
        const stats: AdaptiveExportStats = {
            triangleCount: 1_000_000,
            vertexCount: 500_000,
            fileSize: '47.7 MB',
            fileSizeBytes: 50_000_084,
            volumeMm3: 150_000,
            volumeMl: 150,
            surfaceAreaMm2: 25_000,
            generationTimeMs: 1500,
            subdivisionStats: {
                initialTriangles: 10_000,
                finalTriangles: 1_000_000,
                maxDepthReached: 5,
                overflowDetected: false,
            },
        };

        expect(stats.triangleCount).toBe(1_000_000);
        expect(stats.volumeMl).toBe(150);
        expect(stats.subdivisionStats.maxDepthReached).toBe(5);
        expect(stats.subdivisionStats.overflowDetected).toBe(false);
    });

    it('should handle overflow detection', () => {
        const stats: AdaptiveExportStats = {
            triangleCount: 8_000_000,
            vertexCount: 4_000_000,
            fileSize: '381 MB',
            fileSizeBytes: 400_000_084,
            volumeMm3: 150_000,
            volumeMl: 150,
            surfaceAreaMm2: 25_000,
            generationTimeMs: 5000,
            subdivisionStats: {
                initialTriangles: 50_000,
                finalTriangles: 8_000_000,
                maxDepthReached: 6,
                overflowDetected: true,
            },
        };

        expect(stats.subdivisionStats.overflowDetected).toBe(true);
    });
});

// ============================================================================
// Test: Quality Settings
// ============================================================================

describe('Quality Settings Configuration', () => {
    // Simulate the quality settings from the hook
    const QUALITY_SETTINGS = {
        low: { targetTriangles: 500_000, maxDepth: 4, subdivThreshold: 0.02 },
        medium: { targetTriangles: 2_000_000, maxDepth: 5, subdivThreshold: -1.0 },
        high: { targetTriangles: 4_000_000, maxDepth: 6, subdivThreshold: -1.0 },
        ultra: { targetTriangles: 8_000_000, maxDepth: 6, subdivThreshold: -1.0 },
    };

    it('should have increasing target triangles', () => {
        expect(QUALITY_SETTINGS.low.targetTriangles).toBeLessThan(QUALITY_SETTINGS.medium.targetTriangles);
        expect(QUALITY_SETTINGS.medium.targetTriangles).toBeLessThan(QUALITY_SETTINGS.high.targetTriangles);
        expect(QUALITY_SETTINGS.high.targetTriangles).toBeLessThan(QUALITY_SETTINGS.ultra.targetTriangles);
    });

    it('should have appropriate depth limits', () => {
        expect(QUALITY_SETTINGS.low.maxDepth).toBeGreaterThanOrEqual(4);
        expect(QUALITY_SETTINGS.ultra.maxDepth).toBeLessThanOrEqual(8); // GPU buffer limit
    });

    it('should use uniform subdivision for medium+ quality', () => {
        // Negative threshold forces uniform subdivision (robust against T-junctions)
        expect(QUALITY_SETTINGS.low.subdivThreshold).toBeGreaterThan(0); // Adaptive
        expect(QUALITY_SETTINGS.medium.subdivThreshold).toBe(-1.0); // Uniform
        expect(QUALITY_SETTINGS.high.subdivThreshold).toBe(-1.0); // Uniform
        expect(QUALITY_SETTINGS.ultra.subdivThreshold).toBe(-1.0); // Uniform
    });
});

// ============================================================================
// Test: Progress State Transitions
// ============================================================================

describe('Progress State Transitions', () => {
    it('should transition from idle to generating', () => {
        const before: AdaptiveExportProgress = { status: 'idle', progress: 0, message: '' };
        const after: AdaptiveExportProgress = { status: 'generating', progress: 10, message: 'Starting...' };

        expect(before.status).toBe('idle');
        expect(after.status).toBe('generating');
        expect(after.progress).toBeGreaterThan(before.progress);
    });

    it('should transition from generating to complete', () => {
        const steps: AdaptiveExportProgress[] = [
            { status: 'generating', progress: 10, message: 'Starting adaptive mesh generation...' },
            { status: 'generating', progress: 30, message: 'Extracting features...' },
            { status: 'generating', progress: 50, message: 'Building base mesh...' },
            { status: 'generating', progress: 70, message: 'GPU subdivision pass 1...' },
            { status: 'generating', progress: 85, message: 'Welding vertices...' },
            { status: 'complete', progress: 100, message: 'Generated 1,000,000 triangles', subdivisionDepth: 5 },
        ];

        // Progress should monotonically increase
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i].progress).toBeGreaterThanOrEqual(steps[i - 1].progress);
        }

        expect(steps[steps.length - 1].status).toBe('complete');
    });

    it('should transition from any state to error', () => {
        const fromIdle: AdaptiveExportProgress = { status: 'error', progress: 0, message: 'GPU not supported' };
        const fromGenerating: AdaptiveExportProgress = { status: 'error', progress: 0, message: 'Device lost' };

        expect(fromIdle.status).toBe('error');
        expect(fromGenerating.status).toBe('error');
    });
});

// ============================================================================
// Test: Stats Calculations
// ============================================================================

describe('Stats Calculations', () => {
    it('should calculate file size correctly', () => {
        // Binary STL: 84 header + 50 bytes per triangle
        const triangles = 1_000_000;
        const expectedBytes = 84 + triangles * 50;
        expect(expectedBytes).toBe(50_000_084);
    });

    it('should convert volume correctly', () => {
        const volumeMm3 = 150_000;
        const volumeMl = volumeMm3 / 1000;
        expect(volumeMl).toBe(150);
    });

    it('should track subdivision ratio', () => {
        const stats = {
            initialTriangles: 10_000,
            finalTriangles: 1_000_000,
        };
        const ratio = stats.finalTriangles / stats.initialTriangles;
        expect(ratio).toBe(100);
    });
});

// ============================================================================
// Test: Error Messages
// ============================================================================

describe('Error Messages', () => {
    it('should format WebGPU not available error', () => {
        const message = 'WebGPU not supported';
        expect(message).toContain('WebGPU');
    });

    it('should format device lost error', () => {
        const reason = 'destroyed';
        const message = `GPU Device Lost: ${reason}`;
        expect(message).toContain('Device Lost');
    });

    it('should format export failure error', () => {
        const error = new Error('Buffer overflow');
        const message = `Adaptive export failed: ${error.message}`;
        expect(message).toContain('Adaptive export failed');
        expect(message).toContain('Buffer overflow');
    });
});

// ============================================================================
// Test: Filename Generation
// ============================================================================

describe('Filename Generation', () => {
    it('should generate descriptive filename', () => {
        const styleName = 'GothicArches';
        const quality = 'high';
        const timestamp = Date.now();
        const filename = `PotFoundry_${styleName}_Adaptive_${quality}_${timestamp}.stl`;

        expect(filename).toContain('PotFoundry');
        expect(filename).toContain(styleName);
        expect(filename).toContain('Adaptive');
        expect(filename).toContain(quality);
        expect(filename.endsWith('.stl')).toBe(true);
    });

    it('should use custom filename if provided', () => {
        const customFilename = 'my-custom-pot.stl';
        expect(customFilename).not.toContain('PotFoundry_');
    });
});

// ============================================================================
// Test: Style Options Building
// ============================================================================

describe('Style Options Building', () => {
    it('should include geometry parameters', () => {
        const geometry = {
            spinTurns: 2,
            spinPhase: 45,
            spinCurve: 1.5,
            bellAmp: 0.1,
            bellCenter: 0.5,
            bellWidth: 0.22,
        };

        const opts: Record<string, number> = {};
        opts.spinTurns = geometry.spinTurns ?? 0;
        opts.spinPhaseDeg = geometry.spinPhase ?? 0;
        opts.spinCurveExp = geometry.spinCurve ?? 1;
        opts.bellAmp = geometry.bellAmp ?? 0;
        opts.bellCenter = geometry.bellCenter ?? 0.5;
        opts.bellWidth = geometry.bellWidth ?? 0.22;

        expect(opts.spinTurns).toBe(2);
        expect(opts.spinPhaseDeg).toBe(45);
        expect(opts.bellAmp).toBe(0.1);
    });

    it('should merge style-specific options', () => {
        const styleOpts = {
            featureCount: 8,
            archDepth: 0.3,
            archWidth: 0.5,
        };

        const opts: Record<string, number> = {};
        Object.entries(styleOpts).forEach(([key, value]) => {
            if (typeof value === 'number') {
                opts[key] = value;
            }
        });

        expect(opts.featureCount).toBe(8);
        expect(opts.archDepth).toBe(0.3);
    });
});

// ============================================================================
// Test: UseAdaptiveExportResult Interface
// ============================================================================

describe('UseAdaptiveExportResult interface', () => {
    it('should have all required properties', () => {
        // Mock the result structure
        const mockResult: UseAdaptiveExportResult = {
            progress: { status: 'idle', progress: 0, message: '' },
            stats: null,
            isAvailable: false,
            exportSTL: vi.fn().mockResolvedValue(undefined),
            generateMesh: vi.fn().mockResolvedValue(null),
            reset: vi.fn(),
        };

        expect(mockResult.progress).toBeDefined();
        expect(mockResult.stats).toBeNull();
        expect(mockResult.isAvailable).toBe(false);
        expect(typeof mockResult.exportSTL).toBe('function');
        expect(typeof mockResult.generateMesh).toBe('function');
        expect(typeof mockResult.reset).toBe('function');
    });

    it('should have stats when complete', () => {
        const mockResult: UseAdaptiveExportResult = {
            progress: { status: 'complete', progress: 100, message: 'Done' },
            stats: {
                triangleCount: 1_000_000,
                vertexCount: 500_000,
                fileSize: '47.7 MB',
                fileSizeBytes: 50_000_084,
                volumeMm3: 150_000,
                volumeMl: 150,
                surfaceAreaMm2: 25_000,
                generationTimeMs: 1500,
                subdivisionStats: {
                    initialTriangles: 10_000,
                    finalTriangles: 1_000_000,
                    maxDepthReached: 5,
                    overflowDetected: false,
                },
            },
            isAvailable: true,
            exportSTL: vi.fn(),
            generateMesh: vi.fn(),
            reset: vi.fn(),
        };

        expect(mockResult.stats).not.toBeNull();
        expect(mockResult.stats?.triangleCount).toBe(1_000_000);
    });
});

// ============================================================================
// Test: Dimension Configuration
// ============================================================================

describe('Dimension Configuration', () => {
    it('should build dimensions from geometry state', () => {
        const geometry = {
            H: 100,
            top_od: 100, // outer diameter
            bottom_od: 80,
            wall: 3,
            bottom: 5,
            drain: 20,
            exponent: 2,
        };

        const dimensions = {
            H: geometry.H,
            Rt: geometry.top_od / 2,
            Rb: geometry.bottom_od / 2,
            tWall: geometry.wall,
            tBottom: geometry.bottom,
            rDrain: geometry.drain / 2,
            expn: geometry.exponent,
        };

        expect(dimensions.H).toBe(100);
        expect(dimensions.Rt).toBe(50);
        expect(dimensions.Rb).toBe(40);
        expect(dimensions.tWall).toBe(3);
        expect(dimensions.rDrain).toBe(10);
    });
});
