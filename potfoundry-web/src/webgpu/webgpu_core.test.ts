/**
 * WebGPU Core Tests
 * Tests for the WebGPU rendering core, focusing on:
 * - Device initialization
 * - Buffer management
 * - Device loss handling
 * - Style switching without resource leaks
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    setupWebGPUMock,
    resetMockState,
    getBufferStats,
    simulateDeviceLoss,
} from '../test/webgpu-mock';

describe('WebGPU Mock Infrastructure', () => {
    beforeEach(() => {
        setupWebGPUMock();
    });

    afterEach(() => {
        resetMockState();
    });

    it('should provide a mock GPU adapter', async () => {
        expect(navigator.gpu).toBeDefined();
        const adapter = await navigator.gpu.requestAdapter();
        expect(adapter).not.toBeNull();
    });

    it('should provide a mock GPU device', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();
        expect(device).toBeDefined();
        expect(device.queue).toBeDefined();
    });

    it('should create and track buffers', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        const buffer1 = device.createBuffer({
            size: 1024,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'test-buffer-1',
        });

        const buffer2 = device.createBuffer({
            size: 2048,
            usage: GPUBufferUsage.VERTEX,
            label: 'test-buffer-2',
        });

        const stats = getBufferStats();
        expect(stats.totalAllocated).toBe(2);
        expect(stats.totalDestroyed).toBe(0);
        expect(stats.leakedCount).toBe(2);

        // Destroy one buffer
        buffer1.destroy();

        const statsAfter = getBufferStats();
        expect(statsAfter.totalDestroyed).toBe(1);
        expect(statsAfter.leakedCount).toBe(1);
        expect(statsAfter.leakedBuffers[0].label).toBe('test-buffer-2');
    });

    it('should handle device loss simulation', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        let deviceLostCalled = false;
        device.lost.then((info) => {
            deviceLostCalled = true;
            expect(info.reason).toBe('destroyed');
        });

        // Create a buffer before loss
        const buffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM,
        });

        // Destroy the device
        device.destroy();

        // Wait for the promise to resolve
        await device.lost;
        expect(deviceLostCalled).toBe(true);

        // Attempting to create a buffer after loss should throw
        expect(() => {
            device.createBuffer({
                size: 256,
                usage: GPUBufferUsage.UNIFORM,
            });
        }).toThrow('Device is lost');
    });

    it('should detect buffer used after destruction', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        const buffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'destroyed-buffer',
        });

        // Destroy the buffer
        buffer.destroy();

        // Attempting to write to a destroyed buffer should throw
        expect(() => {
            device.queue.writeBuffer(buffer, 0, new Float32Array([1, 2, 3, 4]));
        }).toThrow('Buffer used in submit while destroyed');
    });

    it('should create shader modules', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        const shaderModule = device.createShaderModule({
            code: `
                @vertex
                fn vs_main() -> @builtin(position) vec4f {
                    return vec4f(0.0, 0.0, 0.0, 1.0);
                }

                @fragment
                fn fs_main() -> @location(0) vec4f {
                    return vec4f(1.0, 0.0, 0.0, 1.0);
                }
            `,
        });

        expect(shaderModule).toBeDefined();
        const compilationInfo = await shaderModule.getCompilationInfo();
        expect(compilationInfo.messages).toHaveLength(0);
    });

    it('should create render pipeline', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        const shaderModule = device.createShaderModule({ code: '' });

        const pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: 'bgra8unorm' }],
            },
        });

        expect(pipeline).toBeDefined();
        expect(pipeline.getBindGroupLayout).toBeDefined();
    });

    it('should create command encoder and render pass', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        const texture = device.createTexture({
            size: { width: 800, height: 600 },
            format: 'bgra8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: texture.createView(),
                    loadOp: 'clear',
                    storeOp: 'store',
                    clearValue: { r: 0, g: 0, b: 0, a: 1 },
                },
            ],
        });

        pass.end();
        const commandBuffer = encoder.finish();

        // Submit should work
        expect(() => {
            device.queue.submit([commandBuffer]);
        }).not.toThrow();
    });
});

describe('WebGPU Device Loss Scenarios', () => {
    beforeEach(() => {
        setupWebGPUMock();
    });

    afterEach(() => {
        resetMockState();
    });

    it('should reproduce device loss when switching styles rapidly', async () => {
        // This simulates the real-world scenario where switching styles
        // creates new buffers without properly disposing old ones
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        // Simulate style switching - each style creates new buffers
        const buffers: GPUBuffer[] = [];
        for (let i = 0; i < 5; i++) {
            // Create buffers for "new style"
            const geometryBuffer = device.createBuffer({
                size: 4096,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: `style-${i}-geometry`,
            });
            const paramBuffer = device.createBuffer({
                size: 1024,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                label: `style-${i}-params`,
            });

            // Old style cleanup (should destroy previous buffers)
            if (buffers.length > 0) {
                buffers.forEach((b) => b.destroy());
                buffers.length = 0;
            }

            buffers.push(geometryBuffer, paramBuffer);
        }

        // Verify no buffer leaks
        const stats = getBufferStats();
        expect(stats.leakedCount).toBe(2); // Only the last style's buffers
        expect(stats.totalDestroyed).toBe(8); // 4 styles worth destroyed

        // Cleanup
        buffers.forEach((b) => b.destroy());
    });

    it('should handle device loss during style switch gracefully', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        // Create initial style buffers
        const buffer = device.createBuffer({
            size: 1024,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'style-buffer',
        });

        // Write to buffer - should work
        device.queue.writeBuffer(buffer, 0, new Float32Array([1, 2, 3, 4]));

        // Simulate device loss mid-operation
        simulateDeviceLoss(device, 'unknown', 'GPU hung during style switch');

        // Wait for device lost promise
        await device.lost;

        // Attempting to create new buffers should fail
        expect(() => {
            device.createBuffer({
                size: 512,
                usage: GPUBufferUsage.UNIFORM,
            });
        }).toThrow('Device is lost');
    });

    it('should track buffer lifecycle for memory leak detection', async () => {
        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        // Simulate what happens in a poorly managed style switch
        const leakyBuffers: GPUBuffer[] = [];

        for (let i = 0; i < 3; i++) {
            // Bug: Not destroying old buffers before creating new ones
            leakyBuffers.push(
                device.createBuffer({
                    size: 2048,
                    usage: GPUBufferUsage.UNIFORM,
                    label: `leaked-buffer-${i}`,
                })
            );
        }

        // All buffers are leaked
        let stats = getBufferStats();
        expect(stats.leakedCount).toBe(3);
        expect(stats.leakedBuffers.map((b) => b.label)).toEqual([
            'leaked-buffer-0',
            'leaked-buffer-1',
            'leaked-buffer-2',
        ]);

        // Fix: Properly destroy old buffers
        leakyBuffers.forEach((b) => b.destroy());

        stats = getBufferStats();
        expect(stats.leakedCount).toBe(0);
    });
});

describe('WebGPU Resource Management', () => {
    beforeEach(() => {
        setupWebGPUMock();
    });

    afterEach(() => {
        resetMockState();
    });

    it('should warn when destroying already destroyed buffer', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

        const adapter = await navigator.gpu.requestAdapter();
        const device = await adapter!.requestDevice();

        const buffer = device.createBuffer({
            size: 256,
            usage: GPUBufferUsage.UNIFORM,
            label: 'double-destroy-buffer',
        });

        buffer.destroy();
        buffer.destroy(); // Should warn

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Attempting to destroy already destroyed buffer')
        );

        warnSpy.mockRestore();
    });
});
