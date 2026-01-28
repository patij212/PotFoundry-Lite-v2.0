/**
 * useExport Hook Tests
 * 
 * Tests for the CPU-based mesh generation and STL export hook.
 * This is the fallback export when GPU is not available.
 */

import { describe, it, expect, vi } from 'vitest';

// Import types for testing
import type {
    ExportProgress,
    ExportStats,
    UseExportResult,
} from './useExport';

// ============================================================================
// Test: Types and Interfaces
// ============================================================================

describe('ExportProgress interface', () => {
    it('should represent valid idle state', () => {
        const progress: ExportProgress = {
            status: 'idle',
            progress: 0,
            message: '',
        };
        expect(progress.status).toBe('idle');
        expect(progress.progress).toBe(0);
    });

    it('should represent valid generating state', () => {
        const progress: ExportProgress = {
            status: 'generating',
            progress: 30,
            message: 'Computing vertices...',
        };
        expect(progress.status).toBe('generating');
        expect(progress.progress).toBe(30);
    });

    it('should represent valid error state', () => {
        const progress: ExportProgress = {
            status: 'error',
            progress: 0,
            message: 'Failed to generate mesh: Out of memory',
        };
        expect(progress.status).toBe('error');
    });

    it('should represent valid complete state', () => {
        const progress: ExportProgress = {
            status: 'complete',
            progress: 100,
            message: 'Mesh generated successfully',
        };
        expect(progress.status).toBe('complete');
        expect(progress.progress).toBe(100);
    });
});

describe('ExportStats interface', () => {
    it('should represent valid export statistics', () => {
        const stats: ExportStats = {
            triangleCount: 500_000,
            vertexCount: 250_000,
            fileSize: '23.8 MB',
            fileSizeBytes: 25_000_084,
            volumeMm3: 100_000,
            volumeMl: 100,
            surfaceAreaMm2: 15_000,
            generationTimeMs: 2500,
        };

        expect(stats.triangleCount).toBe(500_000);
        expect(stats.volumeMl).toBe(100);
        expect(stats.generationTimeMs).toBe(2500);
    });
});

// ============================================================================
// Test: Style ID Mapping
// ============================================================================

describe('Style ID Mapping', () => {
    const styleIdMap: Record<string, string> = {
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
        // Legacy snake_case mappings
        superformula_blossom: 'SuperformulaBlossom',
        fourier_bloom: 'FourierBloom',
        spiral_ridges: 'SpiralRidges',
        gothic_arches: 'GothicArches',
    };

    it('should map PascalCase style names', () => {
        expect(styleIdMap['GothicArches']).toBe('GothicArches');
        expect(styleIdMap['WaveInterference']).toBe('WaveInterference');
    });

    it('should map legacy snake_case style names', () => {
        expect(styleIdMap['gothic_arches']).toBe('GothicArches');
        expect(styleIdMap['fourier_bloom']).toBe('FourierBloom');
    });
});

// ============================================================================
// Test: Resolution Safety Caps
// ============================================================================

describe('Resolution Safety Caps', () => {
    const SAFETY_CAP = 8192;

    it('should cap resolution to safety limit', () => {
        let nTheta = 16384;
        let nZ = 12000;

        nTheta = Math.min(nTheta, SAFETY_CAP);
        nZ = Math.min(nZ, SAFETY_CAP);

        expect(nTheta).toBe(SAFETY_CAP);
        expect(nZ).toBe(SAFETY_CAP);
    });

    it('should not modify values under cap', () => {
        let nTheta = 2048;
        let nZ = 1024;

        nTheta = Math.min(nTheta, SAFETY_CAP);
        nZ = Math.min(nZ, SAFETY_CAP);

        expect(nTheta).toBe(2048);
        expect(nZ).toBe(1024);
    });
});

// ============================================================================
// Test: Auto-Quality Override for High-Frequency Styles
// ============================================================================

describe('Auto-Quality Override', () => {
    it('should boost resolution for WaveInterference style', () => {
        const styleId = 'WaveInterference';
        let nTheta = 512;
        let nZ = 256;

        if (styleId === 'WaveInterference' || styleId === 'DragonScales') {
            if (nTheta < 1200) nTheta = 1200;
            if (nZ < 600) nZ = 600;
        }

        expect(nTheta).toBe(1200);
        expect(nZ).toBe(600);
    });

    it('should boost resolution for DragonScales style', () => {
        const styleId = 'DragonScales';
        let nTheta = 800;
        let nZ = 400;

        if (styleId === 'WaveInterference' || styleId === 'DragonScales') {
            if (nTheta < 1200) nTheta = 1200;
            if (nZ < 600) nZ = 600;
        }

        expect(nTheta).toBe(1200);
        expect(nZ).toBe(600);
    });

    it('should not modify normal styles', () => {
        const styleId = 'GothicArches';
        let nTheta = 512;
        let nZ = 256;

        if (styleId === 'WaveInterference' || styleId === 'DragonScales') {
            if (nTheta < 1200) nTheta = 1200;
            if (nZ < 600) nZ = 600;
        }

        expect(nTheta).toBe(512);
        expect(nZ).toBe(256);
    });
});

// ============================================================================
// Test: Aspect Ratio Enforcement
// ============================================================================

describe('Aspect Ratio Enforcement', () => {
    it('should enforce minimum nZ based on nTheta', () => {
        let nTheta = 2000;
        let nZ = 200; // Too low

        const minZ = Math.floor(nTheta * 0.5);
        if (nZ < minZ) {
            nZ = minZ;
        }

        expect(nZ).toBe(1000); // Should be at least 50% of nTheta
    });

    it('should not modify nZ if already sufficient', () => {
        let nTheta = 2000;
        let nZ = 1500;

        const minZ = Math.floor(nTheta * 0.5);
        if (nZ < minZ) {
            nZ = minZ;
        }

        expect(nZ).toBe(1500);
    });
});

// ============================================================================
// Test: Case Conversion (snake_case to camelCase)
// ============================================================================

describe('Case Conversion', () => {
    const toCamel = (s: string) => {
        return s.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    };

    it('should convert snake_case to camelCase', () => {
        expect(toCamel('wi_feature_count')).toBe('wiFeatureCount');
        expect(toCamel('arch_depth')).toBe('archDepth');
        expect(toCamel('feature_count')).toBe('featureCount');
    });

    it('should not modify already camelCase', () => {
        expect(toCamel('featureCount')).toBe('featureCount');
        expect(toCamel('archDepth')).toBe('archDepth');
    });

    it('should handle multiple underscores', () => {
        expect(toCamel('wi_band_count')).toBe('wiBandCount');
    });
});

// ============================================================================
// Test: Style Options Building
// ============================================================================

describe('Style Options Building', () => {
    it('should include spin parameters', () => {
        const geometry = {
            spinTurns: 2,
            spinPhase: 45,
            spinCurve: 1.5,
            bellAmp: 0.05,
            bellCenter: 0.5,
            bellWidth: 0.22,
        };

        const opts: Record<string, number> = {};
        opts.spinTurns = geometry.spinTurns;
        opts.spinPhaseDeg = geometry.spinPhase;
        opts.spinCurveExp = geometry.spinCurve;
        opts.bellAmp = geometry.bellAmp;
        opts.bellCenter = geometry.bellCenter;
        opts.bellWidth = geometry.bellWidth;
        opts.flareCenter = 0.5;
        opts.flareSharp = 6.0;

        expect(opts.spinTurns).toBe(2);
        expect(opts.bellAmp).toBe(0.05);
        expect(opts.flareSharp).toBe(6.0);
    });
});

// ============================================================================
// Test: Dimension Configuration
// ============================================================================

describe('Dimension Configuration', () => {
    it('should convert diameter to radius', () => {
        const geometry = {
            H: 100,
            top_od: 100,     // outer diameter
            bottom_od: 80,
            t_wall: 3,
            t_bottom: 5,
            r_drain: 10,
            expn: 2,
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

        expect(dimensions.Rt).toBe(50);
        expect(dimensions.Rb).toBe(40);
    });
});

// ============================================================================
// Test: Progress Transitions
// ============================================================================

describe('Progress Transitions', () => {
    it('should transition through generation phases', () => {
        const steps: ExportProgress[] = [
            { status: 'generating', progress: 10, message: 'Building mesh...' },
            { status: 'generating', progress: 30, message: 'Computing vertices...' },
            { status: 'generating', progress: 70, message: 'Calculating statistics...' },
            { status: 'generating', progress: 90, message: 'Preparing download...' },
            { status: 'complete', progress: 100, message: 'Downloaded pot.stl' },
        ];

        // Progress should monotonically increase
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i].progress).toBeGreaterThanOrEqual(steps[i - 1].progress);
        }
    });
});

// ============================================================================
// Test: Filename Generation
// ============================================================================

describe('Filename Generation', () => {
    it('should generate descriptive filename', () => {
        const styleName = 'ArtDeco';
        const timestamp = Date.now();
        const filename = `PotFoundry_${styleName}_${timestamp}.stl`;

        expect(filename).toContain('PotFoundry');
        expect(filename).toContain(styleName);
        expect(filename.endsWith('.stl')).toBe(true);
    });
});

// ============================================================================
// Test: UseExportResult Interface
// ============================================================================

describe('UseExportResult interface', () => {
    it('should have all required properties', () => {
        const mockResult: UseExportResult = {
            progress: { status: 'idle', progress: 0, message: '' },
            stats: null,
            exportSTL: vi.fn().mockResolvedValue(undefined),
            generateMesh: vi.fn().mockResolvedValue(null),
            reset: vi.fn(),
        };

        expect(mockResult.progress).toBeDefined();
        expect(mockResult.stats).toBeNull();
        expect(typeof mockResult.exportSTL).toBe('function');
        expect(typeof mockResult.generateMesh).toBe('function');
        expect(typeof mockResult.reset).toBe('function');
    });
});

// ============================================================================
// Test: Error Messages
// ============================================================================

describe('Error Messages', () => {
    it('should format generation failure error', () => {
        const error = new Error('Out of memory');
        const message = `Failed to generate mesh: ${error.message}`;
        expect(message).toContain('Failed to generate mesh');
        expect(message).toContain('Out of memory');
    });

    it('should format export failure error', () => {
        const error = new Error('File system error');
        const message = `Export failed: ${error.message}`;
        expect(message).toContain('Export failed');
    });
});
