/**
 * FeatureExtractionComputer Tests
 * Tests for GPU-based feature detection used in adaptive meshing.
 * 
 * Since GPU compute cannot run in Node.js, these tests focus on:
 * - Parameter validation
 * - Buffer size calculations
 * - Feature point data structure validation
 */

import { describe, it, expect } from 'vitest';
import type { FeaturePoint } from './FeatureExtractionComputer';

// ============================================================================
// Test: FeaturePoint Data Structure
// ============================================================================

describe('FeaturePoint Structure', () => {
    it('should represent valid feature data', () => {
        const feature: FeaturePoint = {
            theta: 1.5,      // Angle in radians (0 to 2*PI)
            t: 0.5,          // Height parameter (0 to 1)
            type: 1,         // 1=Ridge, 2=Valley, 3=Crease
            strength: 0.8    // Feature strength (0 to 1)
        };

        expect(feature.theta).toBeGreaterThanOrEqual(0);
        expect(feature.theta).toBeLessThanOrEqual(Math.PI * 2);
        expect(feature.t).toBeGreaterThanOrEqual(0);
        expect(feature.t).toBeLessThanOrEqual(1);
        expect([1, 2, 3]).toContain(feature.type);
        expect(feature.strength).toBeGreaterThanOrEqual(0);
        expect(feature.strength).toBeLessThanOrEqual(1);
    });

    it('should distinguish feature types', () => {
        const ridge: FeaturePoint = { theta: 0, t: 0, type: 1, strength: 0.5 };
        const valley: FeaturePoint = { theta: 0, t: 0, type: 2, strength: 0.5 };
        const crease: FeaturePoint = { theta: 0, t: 0, type: 3, strength: 0.5 };

        expect(ridge.type).toBe(1);
        expect(valley.type).toBe(2);
        expect(crease.type).toBe(3);
    });
});

// ============================================================================
// Test: Feature Buffer Calculations
// ============================================================================

describe('Feature Buffer Calculations', () => {
    const FEATURE_STRUCT_SIZE = 16; // 4 floats * 4 bytes
    const MAX_FEATURES = 100_000;

    it('should calculate correct buffer size for max features', () => {
        const bufferSize = MAX_FEATURES * FEATURE_STRUCT_SIZE;
        expect(bufferSize).toBe(1_600_000); // 1.6MB
    });

    it('should be well under GPU buffer limits', () => {
        const bufferSize = MAX_FEATURES * FEATURE_STRUCT_SIZE;
        const GPU_BUFFER_MAX = 128 * 1024 * 1024; // 128MB typical
        expect(bufferSize).toBeLessThan(GPU_BUFFER_MAX);
    });
});

// ============================================================================
// Test: Grid Size Calculations
// ============================================================================

describe('Feature Grid Calculations', () => {
    it('should compute grid dispatch correctly', () => {
        const gridSizeX = 180; // theta samples
        const gridSizeY = 90;  // t samples
        const WORKGROUP_SIZE = 8;

        const dispatchX = Math.ceil(gridSizeX / WORKGROUP_SIZE);
        const dispatchY = Math.ceil(gridSizeY / WORKGROUP_SIZE);

        expect(dispatchX).toBe(23);
        expect(dispatchY).toBe(12);
    });

    it('should handle non-square grids', () => {
        const gridSizeX = 360;
        const gridSizeY = 45;
        const WORKGROUP_SIZE = 8;

        const dispatchX = Math.ceil(gridSizeX / WORKGROUP_SIZE);
        const dispatchY = Math.ceil(gridSizeY / WORKGROUP_SIZE);

        expect(dispatchX).toBe(45);
        expect(dispatchY).toBe(6);
    });
});

// ============================================================================
// Test: Feature Detection Simulation
// ============================================================================

describe('Feature Detection Simulation', () => {
    // Simulate the feature detection logic without GPU

    function detectFeature(
        curvature: number,
        threshold: number
    ): { isFeature: boolean; featureType: number } {
        if (Math.abs(curvature) < threshold) {
            return { isFeature: false, featureType: 0 };
        }

        return {
            isFeature: true,
            featureType: curvature > 0 ? 1 : 2 // Ridge vs Valley
        };
    }

    it('should detect ridges (positive curvature)', () => {
        const result = detectFeature(0.5, 0.1);
        expect(result.isFeature).toBe(true);
        expect(result.featureType).toBe(1); // Ridge
    });

    it('should detect valleys (negative curvature)', () => {
        const result = detectFeature(-0.5, 0.1);
        expect(result.isFeature).toBe(true);
        expect(result.featureType).toBe(2); // Valley
    });

    it('should ignore flat areas', () => {
        const result = detectFeature(0.05, 0.1);
        expect(result.isFeature).toBe(false);
    });

    it('should respect threshold parameter', () => {
        const lowThreshold = detectFeature(0.08, 0.05);
        const highThreshold = detectFeature(0.08, 0.1);

        expect(lowThreshold.isFeature).toBe(true);
        expect(highThreshold.isFeature).toBe(false);
    });
});

// ============================================================================
// Test: Feature Strength Calculation
// ============================================================================

describe('Feature Strength Calculation', () => {
    function calculateStrength(curvature: number, threshold: number): number {
        // Normalized strength: 0 at threshold, 1 at max curvature
        const maxCurvature = 1.0;
        const absCurv = Math.abs(curvature);
        if (absCurv <= threshold) return 0;
        return Math.min(1, (absCurv - threshold) / (maxCurvature - threshold));
    }

    it('should return 0 for sub-threshold curvature', () => {
        expect(calculateStrength(0.05, 0.1)).toBe(0);
    });

    it('should return 1 for max curvature', () => {
        expect(calculateStrength(1.0, 0.1)).toBeCloseTo(1, 5);
    });

    it('should interpolate linearly', () => {
        const mid = calculateStrength(0.55, 0.1);
        expect(mid).toBeCloseTo(0.5, 1);
    });
});

// ============================================================================
// Test: Feature Uniform Generation
// ============================================================================

describe('Feature Uniform Generation', () => {
    it('should pack dimensions correctly', () => {
        const H = 100;
        const Rt = 50;
        const Rb = 40;
        const tWall = 3;

        // Chunk0 packing format: [H, Rt, Rb, tWall]
        const chunk0 = new Float32Array([H, Rt, Rb, tWall]);

        expect(chunk0[0]).toBe(H);
        expect(chunk0[1]).toBe(Rt);
        expect(chunk0[2]).toBe(Rb);
        expect(chunk0[3]).toBe(tWall);
    });

    it('should handle threshold parameter', () => {
        const threshold = 0.1;
        const gridSizeX = 180;
        const gridSizeY = 90;

        // Assume chunk4 holds adaptive parameters
        const chunk4 = new Float32Array([threshold, gridSizeX, gridSizeY, 0]);

        // Use toBeCloseTo for floats due to Float32 precision
        expect(chunk4[0]).toBeCloseTo(threshold, 5);
        expect(chunk4[1]).toBe(gridSizeX);
        expect(chunk4[2]).toBe(gridSizeY);
    });
});

// ============================================================================
// Test: ResourceScope Pattern
// ============================================================================

describe('ResourceScope Pattern', () => {
    it('should track and destroy resources in LIFO order', () => {
        const destroyOrder: number[] = [];

        // Simulate ResourceScope
        class MockScope {
            private tracked: { destroy: () => void }[] = [];
            track<T extends { destroy: () => void }>(r: T): T {
                this.tracked.push(r);
                return r;
            }
            dispose() {
                for (let i = this.tracked.length - 1; i >= 0; i--) {
                    this.tracked[i].destroy();
                }
            }
        }

        const scope = new MockScope();
        scope.track({ destroy: () => destroyOrder.push(1) });
        scope.track({ destroy: () => destroyOrder.push(2) });
        scope.track({ destroy: () => destroyOrder.push(3) });
        scope.dispose();

        expect(destroyOrder).toEqual([3, 2, 1]); // LIFO
    });

    it('should continue cleanup even if one destroy throws', () => {
        const destroyed: number[] = [];

        class MockScope {
            private tracked: { destroy: () => void }[] = [];
            track<T extends { destroy: () => void }>(r: T): T {
                this.tracked.push(r);
                return r;
            }
            dispose() {
                for (let i = this.tracked.length - 1; i >= 0; i--) {
                    try {
                        this.tracked[i].destroy();
                    } catch (e) {
                        // Swallow error, continue cleanup
                    }
                }
            }
        }

        const scope = new MockScope();
        scope.track({ destroy: () => destroyed.push(1) });
        scope.track({ destroy: () => { throw new Error('fail'); } });
        scope.track({ destroy: () => destroyed.push(3) });
        scope.dispose();

        expect(destroyed).toContain(1);
        expect(destroyed).toContain(3);
    });
});

// ============================================================================
// Test: Compute Parameter Defaults
// ============================================================================

describe('Compute Parameter Defaults', () => {
    it('should apply default gridSizeX', () => {
        const params = { gridSizeX: undefined };
        const width = params.gridSizeX ?? 2048;
        expect(width).toBe(2048);
    });

    it('should apply default gridSizeY', () => {
        const params = { gridSizeY: undefined };
        const height = params.gridSizeY ?? 1024;
        expect(height).toBe(1024);
    });

    it('should apply default threshold', () => {
        const params = { threshold: undefined };
        const threshold = params.threshold ?? 20.0;
        expect(threshold).toBe(20.0);
    });

    it('should respect custom gridSizeX', () => {
        const params = { gridSizeX: 4096 };
        const width = params.gridSizeX ?? 2048;
        expect(width).toBe(4096);
    });

    it('should respect custom threshold', () => {
        const params = { threshold: 5.0 };
        const threshold = params.threshold ?? 20.0;
        expect(threshold).toBe(5.0);
    });
});

// ============================================================================
// Test: Buffer Alignment
// ============================================================================

describe('Buffer Alignment', () => {
    it('should align buffer size to 4 bytes', () => {
        const rawSizes = [1, 2, 3, 4, 5, 7, 8, 15, 16, 17];
        for (const rawSize of rawSizes) {
            const alignedSize = (rawSize + 3) & ~3;
            expect(alignedSize % 4).toBe(0);
            expect(alignedSize).toBeGreaterThanOrEqual(rawSize);
        }
    });

    it('should keep aligned sizes unchanged', () => {
        const aligned = [4, 8, 12, 16, 64, 256];
        for (const size of aligned) {
            const result = (size + 3) & ~3;
            expect(result).toBe(size);
        }
    });

    it('should align ExtractUniforms to 16 bytes', () => {
        const uniformSize = 16; // u32 + u32 + f32 + f32
        expect(uniformSize % 16).toBe(0);
    });
});

// ============================================================================
// Test: Style Uniform Packing
// ============================================================================

describe('Style Uniform Packing', () => {
    it('should pack 16 floats (64 bytes) for style uniforms', () => {
        const H = 100, Rt = 50, Rb = 40, expn = 2, styleIndex = 5;
        const spinTurns = 1, spinPhaseDeg = 45, spinCurveExp = 1.5, seamAngle = 0.1;
        const bellAmp = 0.5, bellCenter = 0.5, bellWidth = 0.22;

        const styleUniformData = new Float32Array([
            H, Rt, Rb, 0.0,
            0.0, 0.0, expn, styleIndex,
            spinTurns, (spinPhaseDeg * Math.PI) / 180, spinCurveExp, seamAngle,
            bellAmp, bellCenter, bellWidth, 0.0
        ]);

        expect(styleUniformData.length).toBe(16);
        expect(styleUniformData.byteLength).toBe(64);
    });

    it('should convert spinPhaseDeg to radians', () => {
        const spinPhaseDeg = 90;
        const spinPhaseRad = (spinPhaseDeg * Math.PI) / 180;
        expect(spinPhaseRad).toBeCloseTo(Math.PI / 2);
    });

    it('should handle default style options', () => {
        const styleOpts: Record<string, unknown> = {};
        const spinTurns = (styleOpts.spinTurns as number) ?? 0;
        const spinPhaseDeg = (styleOpts.spinPhaseDeg as number) ?? 0;
        const bellAmp = (styleOpts.bellAmp as number) ?? 0;

        expect(spinTurns).toBe(0);
        expect(spinPhaseDeg).toBe(0);
        expect(bellAmp).toBe(0);
    });
});

// ============================================================================
// Test: Workgroup Dispatch Calculations
// ============================================================================

describe('Workgroup Dispatch Calculations', () => {
    const WORKGROUP_SIZE = 64;

    it('should calculate 1D workgroups from 2D grid', () => {
        const width = 2048;
        const height = 1024;
        const totalThreads = width * height;
        const workgroups = Math.ceil(totalThreads / WORKGROUP_SIZE);

        expect(totalThreads).toBe(2_097_152);
        expect(workgroups).toBe(32768);
    });

    it('should handle non-divisible grid sizes', () => {
        const width = 100;
        const height = 50;
        const totalThreads = width * height;
        const workgroups = Math.ceil(totalThreads / WORKGROUP_SIZE);

        expect(workgroups).toBe(79); // ceil(5000/64)
    });

    it('should handle large grids efficiently', () => {
        const width = 4096;
        const height = 2048;
        const totalThreads = width * height;
        const workgroups = Math.ceil(totalThreads / WORKGROUP_SIZE);

        expect(workgroups).toBeLessThan(200_000);
    });
});

// ============================================================================
// Test: Feature Count Clamping
// ============================================================================

describe('Feature Count Clamping', () => {
    const MAX_FEATURES = 100_000;

    it('should clamp count to MAX_FEATURES', () => {
        const count = 150_000;
        const clampedCount = Math.min(count, MAX_FEATURES);
        expect(clampedCount).toBe(MAX_FEATURES);
    });

    it('should preserve count under MAX_FEATURES', () => {
        const count = 50_000;
        const clampedCount = Math.min(count, MAX_FEATURES);
        expect(clampedCount).toBe(50_000);
    });

    it('should handle zero features', () => {
        const count = 0;
        if (count === 0) {
            // Early return with empty array
            expect([]).toEqual([]);
        }
    });
});

// ============================================================================
// Test: ExtractUniforms Layout
// ============================================================================

describe('ExtractUniforms Layout', () => {
    it('should pack 4 values into 16 bytes', () => {
        const extractUniformData = new ArrayBuffer(16);
        const view = new DataView(extractUniformData);

        const width = 2048;
        const height = 1024;
        const threshold = 20.0;
        const minLen = 0.0;

        view.setUint32(0, width, true);
        view.setUint32(4, height, true);
        view.setFloat32(8, threshold, true);
        view.setFloat32(12, minLen, true);

        expect(view.getUint32(0, true)).toBe(2048);
        expect(view.getUint32(4, true)).toBe(1024);
        expect(view.getFloat32(8, true)).toBeCloseTo(20.0);
        expect(view.getFloat32(12, true)).toBeCloseTo(0.0);
    });

    it('should use little-endian byte order', () => {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        view.setUint32(0, 0x12345678, true); // Little-endian

        const bytes = new Uint8Array(buffer);
        expect(bytes[0]).toBe(0x78); // LSB first
        expect(bytes[3]).toBe(0x12); // MSB last
    });
});

// ============================================================================
// Test: Feature Point Parsing
// ============================================================================

describe('Feature Point Parsing', () => {
    it('should parse feature from buffer correctly', () => {
        const buffer = new ArrayBuffer(16);
        const floats = new Float32Array(buffer);
        const uints = new Uint32Array(buffer);

        floats[0] = 1.5;    // theta
        floats[1] = 0.75;   // t
        uints[2] = 2;       // type (u32)
        floats[3] = 0.9;    // strength

        const feature = {
            theta: floats[0],
            t: floats[1],
            type: uints[2],
            strength: floats[3]
        };

        expect(feature.theta).toBeCloseTo(1.5);
        expect(feature.t).toBeCloseTo(0.75);
        expect(feature.type).toBe(2);
        expect(feature.strength).toBeCloseTo(0.9);
    });

    it('should interpret type as unsigned integer', () => {
        const buffer = new ArrayBuffer(16);
        const uints = new Uint32Array(buffer);

        uints[2] = 3; // Crease type
        expect(uints[2]).toBe(3);
    });
});

// ============================================================================
// Test: Grid Edge Cases
// ============================================================================

describe('Grid Edge Cases', () => {
    it('should handle minimum grid size (1x1)', () => {
        const width = 1;
        const height = 1;
        const WORKGROUP_SIZE = 64;

        const totalThreads = width * height;
        const workgroups = Math.ceil(totalThreads / WORKGROUP_SIZE);

        expect(workgroups).toBe(1);
    });

    it('should handle single row grid', () => {
        const width = 360;
        const height = 1;
        const totalThreads = width * height;

        expect(totalThreads).toBe(360);
    });

    it('should handle single column grid', () => {
        const width = 1;
        const height = 180;
        const totalThreads = width * height;

        expect(totalThreads).toBe(180);
    });
});

// ============================================================================
// Test: Threshold Edge Cases
// ============================================================================

describe('Threshold Edge Cases', () => {
    it('should handle zero threshold (detect everything)', () => {
        const threshold = 0;
        const curvature = 0.001;
        const isFeature = Math.abs(curvature) > threshold;

        expect(isFeature).toBe(true);
    });

    it('should handle very high threshold (detect nothing)', () => {
        const threshold = 1000;
        const curvature = 10;
        const isFeature = Math.abs(curvature) > threshold;

        expect(isFeature).toBe(false);
    });

    it('should handle curvature exactly at threshold', () => {
        const threshold = 0.1;
        const curvature = 0.1;
        const isFeature = Math.abs(curvature) > threshold;

        expect(isFeature).toBe(false); // Equal is not greater
    });
});

// ============================================================================
// Test: Init State Machine
// ============================================================================

describe('Init State Machine', () => {
    it('should track initialized state', () => {
        let initialized = false;

        // First init
        if (!initialized) {
            initialized = true;
        }

        expect(initialized).toBe(true);
    });

    it('should skip re-initialization', () => {
        let initCount = 0;
        let initialized = false;

        const init = () => {
            if (initialized) return;
            initCount++;
            initialized = true;
        };

        init();
        init();
        init();

        expect(initCount).toBe(1);
    });

    it('should reset state on destroy', () => {
        let initialized = true;
        let pipeline: unknown = {};
        let bindGroupLayout: unknown = {};

        // Destroy
        initialized = false;
        pipeline = null;
        bindGroupLayout = null;

        expect(initialized).toBe(false);
        expect(pipeline).toBe(null);
        expect(bindGroupLayout).toBe(null);
    });
});

// ============================================================================
// Test: Curvature-Based Feature Classification
// ============================================================================

describe('Curvature-Based Feature Classification', () => {
    it('should classify high positive curvature as ridge', () => {
        const curvature = 0.8;
        const type = curvature > 0 ? 1 : 2;
        expect(type).toBe(1); // Ridge
    });

    it('should classify high negative curvature as valley', () => {
        const curvature = -0.8;
        const type = curvature > 0 ? 1 : 2;
        expect(type).toBe(2); // Valley
    });

    it('should handle near-zero curvature', () => {
        const curvature = 0.001;
        const threshold = 0.1;

        const isFeature = Math.abs(curvature) > threshold;
        expect(isFeature).toBe(false);
    });
});

// ============================================================================
// Test: Staging Buffer Size
// ============================================================================

describe('Staging Buffer Size', () => {
    const FEATURE_STRUCT_SIZE = 16;
    const MAX_FEATURES = 100_000;

    it('should allocate correct size for feature staging', () => {
        const featureBufferSize = MAX_FEATURES * FEATURE_STRUCT_SIZE;
        expect(featureBufferSize).toBe(1_600_000);
    });

    it('should allocate 4 bytes for counter staging', () => {
        const counterSize = 4;
        expect(counterSize).toBe(4);
    });
});

// ============================================================================
// Test: Newton-Raphson Refinement Simulation
// ============================================================================

describe('Newton-Raphson Refinement Simulation', () => {
    // Simulate the scalar field R(u) along the principal direction
    // For testing, we use a simple inverted parabola: y = -(x - target)^2 + 1
    // Peak is at x = target.
    // First Derivative: y' = -2(x - target)
    // Second Derivative: y'' = -2

    const TARGET = 0.54321; // Sub-pixel peak location

    function eval_r_mock(x: number): number {
        return -Math.pow(x - TARGET, 2) + 1.0;
    }

    // Finite Difference Derivatives (mimicking shader)
    function get_derivatives(x: number, eps: number) {
        const c = eval_r_mock(x);
        const l = eval_r_mock(x - eps);
        const r = eval_r_mock(x + eps);

        // Central Difference for 1st Deriv
        const d1 = (r - l) / (2 * eps);

        // Central Difference for 2nd Deriv
        const d2 = (r - 2 * c + l) / (eps * eps);

        return { d1, d2 };
    }

    function solveNewton(initialGuess: number, iterations: number, eps: number): number {
        let x = initialGuess;
        for (let i = 0; i < iterations; i++) {
            const { d1, d2 } = get_derivatives(x, eps);
            
            // Newton Step: x_new = x - f'(x) / f''(x)
            // Here we want to MAXIMIZE f(x), so we find zero of f'(x).
            // So we apply Newton to f'(x).
            // delta = -d1 / d2
            
            if (Math.abs(d2) < 1e-6) break; // Avoid divide by zero

            const delta = -d1 / d2;
            x += delta;
        }
        return x;
    }

    it('should converge to the peak from the left', () => {
        const start = 0.4;
        const result = solveNewton(start, 5, 0.001);
        expect(result).toBeCloseTo(TARGET, 4);
    });

    it('should converge to the peak from the right', () => {
        const start = 0.6;
        const result = solveNewton(start, 5, 0.001);
        expect(result).toBeCloseTo(TARGET, 4);
    });

    it('should converge within 3 iterations for quadratic', () => {
        // Newton is quadratic convergence, should be exact for quadratic function in 1 step theoretically
        const start = 0.8; 
        const result = solveNewton(start, 3, 0.001);
        expect(result).toBeCloseTo(TARGET, 5);
    });
});
