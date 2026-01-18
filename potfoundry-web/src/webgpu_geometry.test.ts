/**
 * WebGPU Geometry Buffer Tests
 * Extended tests for fillGeometryBuffer function covering all style parameters.
 */
import { describe, it, expect } from 'vitest';
import { fillGeometryBuffer } from './webgpu_geometry';
import type { WebGPUParams } from './types';

// Helper to create minimal config
function createConfig(overrides: Partial<WebGPUParams> = {}): WebGPUParams {
    return {
        H: 120,
        Rt: 70,
        Rb: 45,
        expn: 1.0,
        styleId: 0,
        r_drain: 10,
        cells_x: 200,
        cells_outer_y: 100,
        ...overrides,
    } as WebGPUParams;
}

describe('fillGeometryBuffer - Core Geometry', () => {
    describe('Height, Radius, Exponent', () => {
        it('should populate height at index 0', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ H: 150 }), createConfig());
            expect(f32[0]).toBe(150);
        });

        it('should populate radius top at index 1', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ Rt: 80 }), createConfig());
            expect(f32[1]).toBe(80);
        });

        it('should populate radius bottom at index 2', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ Rb: 50 }), createConfig());
            expect(f32[2]).toBe(50);
        });

        it('should populate exponent at index 3', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ expn: 1.5 }), createConfig());
            expect(f32[3]).toBe(1.5);
        });

        it('should use default values for missing params', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, {} as WebGPUParams, {} as WebGPUParams);
            expect(f32[0]).toBe(120); // default height
            expect(f32[1]).toBe(70);  // default Rt
            expect(f32[2]).toBe(45);  // default Rb
            expect(f32[3]).toBe(1.0); // default expn
        });
    });

    describe('Spin/Twist Parameters', () => {
        it('should populate spinTurns at index 4 (camelCase)', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ spinTurns: 2.5 } as any), createConfig());
            expect(f32[4]).toBeCloseTo(2.5);
        });

        it('should populate spin_turns at index 4 (snake_case)', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ spin_turns: 3.0 } as any), createConfig());
            expect(f32[4]).toBeCloseTo(3.0);
        });

        it('should populate spinPhase at index 5', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ spinPhase: 0.5 } as any), createConfig());
            expect(f32[5]).toBeCloseTo(0.5);
        });

        it('should populate spinCurve at index 6', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ spinCurve: 1.2 } as any), createConfig());
            expect(f32[6]).toBeCloseTo(1.2);
        });
    });

    describe('Style ID', () => {
        it('should populate styleId at index 7', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ styleId: 3 }), createConfig());
            expect(f32[7]).toBe(3);
        });

        it('should truncate fractional styleId', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ styleId: 2.9 }), createConfig());
            expect(f32[7]).toBe(2);
        });

        it('should clamp negative styleId to 0', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ styleId: -5 }), createConfig());
            expect(f32[7]).toBe(0);
        });
    });

    describe('Superformula Parameters', () => {
        it('should populate sf_m_base at index 8', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ sf_m_base: 8.0 } as any), createConfig());
            expect(f32[8]).toBe(8.0);
        });

        it('should populate sf_m_top at index 9', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ sf_m_top: 12.0 } as any), createConfig());
            expect(f32[9]).toBe(12.0);
        });

        it('should use sf_m_base as default for sf_m_top if not specified', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ sf_m_base: 7.0 } as any), createConfig());
            expect(f32[9]).toBe(7.0);
        });

        it('should populate sf_n1 at index 10', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ sf_n1: 0.5 } as any), createConfig());
            expect(f32[10]).toBe(0.5);
        });

        it('should populate sf_n2 at index 11', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ sf_n2: 0.9 } as any), createConfig());
            expect(f32[11]).toBeCloseTo(0.9);
        });

        it('should populate sf_n3 at index 12', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ sf_n3: 0.7 } as any), createConfig());
            expect(f32[12]).toBeCloseTo(0.7);
        });
    });

    describe('Drain Radius', () => {
        it('should populate drain radius at DRAIN_RADIUS_OFFSET (13)', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ r_drain: 15 }), createConfig());
            // DRAIN_RADIUS_OFFSET is 13 per camera_constants.ts
            expect(f32[13]).toBe(15);
        });

        it('should enforce minimum drain radius of 0.5', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ r_drain: 0.1 }), createConfig());
            // Min is 0.5 per Math.max(Math.abs(drainRadius), 0.5)
            expect(f32[13]).toBe(0.5);
        });
    });

    describe('Bell/Bulge Parameters', () => {
        it('should populate bellAmp at index 14', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ bellAmp: 0.3 } as any), createConfig());
            expect(f32[14]).toBeCloseTo(0.3);
        });

        it('should populate bellCenter at index 15', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ bellCenter: 0.6 } as any), createConfig());
            expect(f32[15]).toBeCloseTo(0.6);
        });
    });

    describe('Resolution Parameters', () => {
        it('should populate cells_x at index 16', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ cells_x: 300 } as any), createConfig());
            expect(f32[16]).toBe(300);
        });

        it('should populate cells_outer_y at index 17', () => {
            const f32 = new Float32Array(100);
            fillGeometryBuffer(f32, createConfig({ cells_outer_y: 150 } as any), createConfig());
            expect(f32[17]).toBe(150);
        });
    });
});

describe('fillGeometryBuffer - Gothic Arches Style', () => {
    const gothicConfig = (overrides: any = {}) => createConfig({
        styleId: 5,
        ...overrides,
    });

    it('should populate gaCounts at index 37', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaCounts: 8 }), createConfig());
        expect(f32[37]).toBe(8);
    });

    it('should populate gaRelief at index 38', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaRelief: 2.0 }), createConfig());
        expect(f32[38]).toBe(2.0);
    });

    it('should populate gaPointiness at index 39', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaPointiness: 1.5 }), createConfig());
        expect(f32[39]).toBe(1.5);
    });

    it('should populate gaDiamond at index 40', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaDiamond: 0.7 }), createConfig());
        expect(f32[40]).toBeCloseTo(0.7);
    });

    it('should populate gaSpring at index 42', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaSpring: 0.2 }), createConfig());
        expect(f32[42]).toBeCloseTo(0.2);
    });

    it('should populate gaArchHeight at index 43', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaArchHeight: 0.8 }), createConfig());
        expect(f32[43]).toBeCloseTo(0.8);
    });

    it('should use defaults for missing Gothic Arch parameters', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig(), createConfig());
        expect(f32[37]).toBe(12.0); // default gaCounts
        expect(f32[38]).toBe(1.5);  // default gaRelief
    });

    it('should not populate Gothic params for non-Gothic styles', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ styleId: 0, gaCounts: 20 } as any), createConfig());
        expect(f32[37]).toBe(0); // Should be 0 for non-Gothic styles
    });
});

describe('fillGeometryBuffer - Z-Seam Blending', () => {
    it('should convert seamAngle degrees to radians at index 73', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ seamAngle: 90 } as any), createConfig());
        expect(f32[73]).toBeCloseTo(Math.PI / 2);
    });

    it('should handle zero seam angle', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ seamAngle: 0 } as any), createConfig());
        expect(f32[73]).toBe(0);
    });

    it('should accept seamAngleDegrees alias', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ seamAngleDegrees: 45 } as any), createConfig());
        expect(f32[73]).toBeCloseTo(Math.PI / 4);
    });
});

describe('fillGeometryBuffer - Edge Cases', () => {
    it('should handle NaN height by using fallback', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ H: NaN }), createConfig());
        // clampNumber returns fallback (120) for NaN
        expect(f32[0]).toBe(120);
    });

    it('should accept string numeric values and convert', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ H: '150' } as any), createConfig());
        expect(f32[0]).toBe(150);
    });

    it('should handle Infinity by using fallback', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ H: Infinity }), createConfig());
        expect(f32[0]).toBe(120);
    });

    it('should handle negative Infinity by using fallback', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ H: -Infinity }), createConfig());
        expect(f32[0]).toBe(120);
    });

    it('should handle undefined values by using fallback', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ H: undefined }), createConfig());
        expect(f32[0]).toBe(120);
    });
});

describe('fillGeometryBuffer - Bell/Bulge Extended', () => {
    it('should populate bellWidth at BELL_WIDTH_OFFSET (72)', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ bellWidth: 0.35 } as any), createConfig());
        expect(f32[72]).toBeCloseTo(0.35);
    });

    it('should use default bellWidth of 0.22', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig(), createConfig());
        expect(f32[72]).toBeCloseTo(0.22);
    });

    it('should use default bellAmp of 0', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig(), createConfig());
        expect(f32[14]).toBe(0);
    });

    it('should use default bellCenter of 0.5', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig(), createConfig());
        expect(f32[15]).toBeCloseTo(0.5);
    });
});

describe('fillGeometryBuffer - Topology Counts', () => {
    it('should populate inner_y at index 27', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ inner_y: 150 } as any), createConfig());
        expect(f32[27]).toBe(150);
    });

    it('should populate innerY (camelCase) at index 27', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ innerY: 120 } as any), createConfig());
        expect(f32[27]).toBe(120);
    });

    it('should populate bottom_rings at index 28', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ bottom_rings: 30 } as any), createConfig());
        expect(f32[28]).toBe(30);
    });

    it('should populate rim_rings at index 30', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ rim_rings: 15 } as any), createConfig());
        expect(f32[30]).toBe(15);
    });

    it('should use default inner_y of 100', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig(), createConfig());
        expect(f32[27]).toBe(100);
    });

    it('should use default bottom_rings of 20', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig(), createConfig());
        expect(f32[28]).toBe(20);
    });
});

describe('fillGeometryBuffer - Scene Radius', () => {
    it('should populate sceneRadius at index 33', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ sceneRadius: 300 } as any), createConfig());
        expect(f32[33]).toBe(300);
    });

    it('should use default sceneRadius of 200', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig(), createConfig());
        expect(f32[33]).toBe(200);
    });
});

describe('fillGeometryBuffer - Drain Radius Aliases', () => {
    it('should accept drain alias without r_drain', () => {
        const f32 = new Float32Array(100);
        const cfg = { H: 120, Rt: 70, Rb: 45, expn: 1.0, styleId: 0, drain: 18 } as any;
        fillGeometryBuffer(f32, cfg, createConfig());
        expect(f32[13]).toBe(18);
    });

    it('should accept drainRadius alias without r_drain', () => {
        const f32 = new Float32Array(100);
        const cfg = { H: 120, Rt: 70, Rb: 45, expn: 1.0, styleId: 0, drainRadius: 20 } as any;
        fillGeometryBuffer(f32, cfg, createConfig());
        expect(f32[13]).toBe(20);
    });

    it('should prioritize r_drain over aliases', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig({ r_drain: 15, drain: 20 } as any), createConfig());
        expect(f32[13]).toBe(15); // r_drain takes precedence
    });

    it('should use default drain radius of 10', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, createConfig(), createConfig());
        expect(f32[13]).toBe(10);
    });
});

describe('fillGeometryBuffer - Gothic Arches Extended', () => {
    const gothicConfig = (overrides: any = {}) => createConfig({
        styleId: 5,
        ...overrides,
    });

    it('should populate gaX at index 41', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaX: 0.5 }), createConfig());
        expect(f32[41]).toBeCloseTo(0.5);
    });

    it('should populate gaRib at index 44', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaRib: 0.06 }), createConfig());
        expect(f32[44]).toBeCloseTo(0.06);
    });

    it('should populate gaCol at index 45', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaCol: 0.2 }), createConfig());
        expect(f32[45]).toBeCloseTo(0.2);
    });

    it('should populate gaSharp at index 46', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaSharp: 5.0 }), createConfig());
        expect(f32[46]).toBe(5.0);
    });

    it('should populate gaBands at index 47', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaBands: 3.0 }), createConfig());
        expect(f32[47]).toBe(3.0);
    });

    it('should populate gaBandW at index 48', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig({ gaBandW: 0.08 }), createConfig());
        expect(f32[48]).toBeCloseTo(0.08);
    });

    it('should use default gaX of 0.0', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig(), createConfig());
        expect(f32[41]).toBe(0.0);
    });

    it('should use default gaRib of 0.04', () => {
        const f32 = new Float32Array(100);
        fillGeometryBuffer(f32, gothicConfig(), createConfig());
        expect(f32[44]).toBeCloseTo(0.04);
    });
});

describe('fillGeometryBuffer - Style Param Clearing', () => {
    it('should clear style param indices 37-52 before populating', () => {
        const f32 = new Float32Array(100);
        // Pre-populate with garbage
        for (let i = 37; i <= 52; i++) f32[i] = 999;
        // Use non-Gothic style
        fillGeometryBuffer(f32, createConfig({ styleId: 0 }), createConfig());
        // Should all be 0 for non-Gothic styles
        for (let i = 37; i <= 52; i++) {
            expect(f32[i]).toBe(0);
        }
    });
});

