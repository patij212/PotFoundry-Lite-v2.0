/**
 * Unit tests for ImportanceMapComputer
 * Tests GPU-computed importance map for style-aware adaptive triangulation
 * 
 * TDD: Tests written before implementation
 */

import { describe, it, expect, vi } from 'vitest';

// ============================================================================
// Mock GPU Device (since WebGPU unavailable in Node.js)
// ============================================================================

interface MockGPUBuffer {
    size: number;
    usage: number;
    label?: string;
    destroy: () => void;
    getMappedRange: () => ArrayBuffer;
    unmap: () => void;
}

interface MockGPUDevice {
    limits: { maxStorageBufferBindingSize: number };
    createBuffer: (desc: { size: number; usage: number; label?: string; mappedAtCreation?: boolean }) => MockGPUBuffer;
    createShaderModule: (desc: { code: string }) => object;
    createComputePipeline: (desc: object) => object;
    createBindGroupLayout: (desc: object) => object;
    createPipelineLayout: (desc: object) => object;
    createBindGroup: (desc: object) => object;
    createCommandEncoder: () => MockGPUCommandEncoder;
    queue: { writeBuffer: (buf: MockGPUBuffer, offset: number, data: ArrayBuffer) => void; submit: (cmds: object[]) => void };
}

interface MockGPUCommandEncoder {
    beginComputePass: () => MockGPUComputePassEncoder;
    copyBufferToBuffer: (src: MockGPUBuffer, srcOffset: number, dst: MockGPUBuffer, dstOffset: number, size: number) => void;
    finish: () => object;
}

interface MockGPUComputePassEncoder {
    setPipeline: (pipeline: object) => void;
    setBindGroup: (index: number, group: object) => void;
    dispatchWorkgroups: (x: number, y?: number, z?: number) => void;
    end: () => void;
}

function createMockDevice(): MockGPUDevice {
    const mockBuffer: MockGPUBuffer = {
        size: 0,
        usage: 0,
        label: '',
        destroy: vi.fn(),
        getMappedRange: () => new ArrayBuffer(4096 * 4), // 64x64 floats
        unmap: vi.fn()
    };

    return {
        limits: { maxStorageBufferBindingSize: 134217728 },
        createBuffer: (desc) => ({ ...mockBuffer, size: desc.size, label: desc.label }),
        createShaderModule: () => ({}),
        createComputePipeline: () => ({}),
        createBindGroupLayout: () => ({}),
        createPipelineLayout: () => ({}),
        createBindGroup: () => ({}),
        createCommandEncoder: () => ({
            beginComputePass: () => ({
                setPipeline: vi.fn(),
                setBindGroup: vi.fn(),
                dispatchWorkgroups: vi.fn(),
                end: vi.fn()
            }),
            copyBufferToBuffer: vi.fn(),
            finish: () => ({})
        }),
        queue: {
            writeBuffer: vi.fn(),
            submit: vi.fn()
        }
    };
}

// ============================================================================
// Test: ImportanceMapComputer Interface Contract
// ============================================================================

describe('ImportanceMapComputer', () => {
    // These tests define the expected interface - implementation comes later

    describe('Interface Contract', () => {
        it('should export ImportanceMapComputer class', async () => {
            // This will fail until we create the class
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            expect(ImportanceMapComputer).toBeDefined();
        });

        it('should have constructor accepting GPUDevice', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            expect(computer).toBeDefined();
        });

        it('should have init() method that returns Promise', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            expect(typeof computer.init).toBe('function');
        });

        it('should have compute() method that returns Promise<ImportanceMapResult>', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            expect(typeof computer.compute).toBe('function');
        });

        it('should have destroy() method', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            expect(typeof computer.destroy).toBe('function');
        });
    });

    // NOTE: These tests require actual WebGPU which is not available in Node.js
    // They are skipped in unit tests and should be run in browser integration tests
    describe.skip('ImportanceMapResult Interface (GPU Required)', () => {
        it('should return importanceMap as Float32Array', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            await computer.init('// mock shader');

            const result = await computer.compute({
                dimensions: { H: 100, Rt: 50, Rb: 40, tWall: 3, tBottom: 5, rDrain: 10, expn: 1.5 },
                styleId: 'plain' as any,
                styleOpts: {},
                styleIndex: 0,
                gridSize: 64
            });

            expect(result.importanceMap).toBeInstanceOf(Float32Array);
        });

        it('should return array of size gridSize * gridSize', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            await computer.init('// mock shader');

            const gridSize = 64;
            const result = await computer.compute({
                dimensions: { H: 100, Rt: 50, Rb: 40, tWall: 3, tBottom: 5, rDrain: 10, expn: 1.5 },
                styleId: 'plain' as any,
                styleOpts: {},
                styleIndex: 0,
                gridSize
            });

            expect(result.importanceMap.length).toBe(gridSize * gridSize);
        });

        it('should return values in range [0, 1]', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            await computer.init('// mock shader');

            const result = await computer.compute({
                dimensions: { H: 100, Rt: 50, Rb: 40, tWall: 3, tBottom: 5, rDrain: 10, expn: 1.5 },
                styleId: 'plain' as any,
                styleOpts: {},
                styleIndex: 0,
                gridSize: 64
            });

            for (let i = 0; i < result.importanceMap.length; i++) {
                expect(result.importanceMap[i]).toBeGreaterThanOrEqual(0);
                expect(result.importanceMap[i]).toBeLessThanOrEqual(1);
            }
        });

        it('should include computeTimeMs in result', async () => {
            const { ImportanceMapComputer } = await import('./ImportanceMapComputer');
            const mockDevice = createMockDevice();
            const computer = new ImportanceMapComputer(mockDevice as unknown as GPUDevice);
            await computer.init('// mock shader');

            const result = await computer.compute({
                dimensions: { H: 100, Rt: 50, Rb: 40, tWall: 3, tBottom: 5, rDrain: 10, expn: 1.5 },
                styleId: 'plain' as any,
                styleOpts: {},
                styleIndex: 0,
                gridSize: 64
            });

            expect(typeof result.computeTimeMs).toBe('number');
            expect(result.computeTimeMs).toBeGreaterThanOrEqual(0);
        });
    });
});

// ============================================================================
// Test: Importance Computation Logic (Math Mirror)
// ============================================================================

describe('Importance Computation Logic', () => {
    // These tests mirror the shader logic for validation

    /**
     * Compute style displacement curvature via finite differences
     * Mirror of what importance_map.wgsl will do
     */
    function computeStyleImportance(
        styleFn: (u: number, t: number) => number,
        u: number,
        t: number,
        eps: number = 0.01
    ): number {
        const c = styleFn(u, t);

        // Second derivative in u direction
        const up = styleFn(u + eps, t);
        const um = styleFn(u - eps, t);
        const curv_u = Math.abs(up - 2 * c + um) / (eps * eps);

        // Second derivative in t direction
        const tp = styleFn(u, Math.min(1, t + eps));
        const tm = styleFn(u, Math.max(0, t - eps));
        const curv_t = Math.abs(tp - 2 * c + tm) / (eps * eps);

        // Normalize to [0, 1] range (sigmoid-ish)
        const rawImportance = Math.max(curv_u, curv_t);
        return Math.min(1, rawImportance / 100); // Scale factor TBD
    }

    it('should return low importance for flat style', () => {
        const flatStyle = (_u: number, _t: number) => 0; // No displacement
        const importance = computeStyleImportance(flatStyle, 0.5, 0.5);
        expect(importance).toBeLessThan(0.1);
    });

    it('should return high importance near style discontinuity', () => {
        // Step function in u - represents a sharp feature line
        const stepStyle = (u: number, _t: number) => u < 0.5 ? 0 : 1;
        const importance = computeStyleImportance(stepStyle, 0.5, 0.5);
        expect(importance).toBeGreaterThan(0.5);
    });

    it('should return medium importance for gradual curves', () => {
        // Smooth sine wave - sample at u=0.125 where sin(4π*0.125)=sin(π/2)=1 (peak)
        // The second derivative is maximum at peaks/troughs, not at zero crossings
        const sineStyle = (u: number, _t: number) => Math.sin(u * Math.PI * 4) * 0.5;
        const importance = computeStyleImportance(sineStyle, 0.125, 0.5);
        expect(importance).toBeGreaterThan(0.1);
        expect(importance).toBeLessThan(0.99);
    });

    it('should detect feature proximity', () => {
        // Mock feature at (0.3, 0.5)
        const featureU = 0.3;
        const featureT = 0.5;

        function importanceWithFeatureProximity(u: number, t: number) {
            const dist = Math.sqrt((u - featureU) ** 2 + (t - featureT) ** 2);
            const featureBoost = Math.max(0, 1 - dist / 0.1); // High importance within 0.1 of feature
            return featureBoost;
        }

        // Near feature
        expect(importanceWithFeatureProximity(0.3, 0.5)).toBeGreaterThan(0.8);
        // Far from feature
        expect(importanceWithFeatureProximity(0.8, 0.8)).toBeLessThan(0.2);
    });
});
