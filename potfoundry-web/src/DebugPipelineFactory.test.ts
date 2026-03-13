/**
 * DebugPipelineFactory.test.ts
 * Unit tests for debug pipeline factory functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createDebugPipelineFactory,
  type DebugPipelineConfig,
  type DebugPipelineFactory,
} from './DebugPipelineFactory';
import { ShaderManager } from './renderers/webgpu/ShaderManager';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Mock shader module for testing */
function createMockShaderModule(label: string): GPUShaderModule {
  return { label } as unknown as GPUShaderModule;
}

/** Mock render pipeline for testing */
function createMockRenderPipeline(label: string): GPURenderPipeline {
  return { label } as unknown as GPURenderPipeline;
}

/** Create a mock GPUDevice that returns mock pipelines */
function createMockDevice() {
  const createRenderPipelineAsync = vi.fn(
    async (descriptor: GPURenderPipelineDescriptor) => {
      return createMockRenderPipeline(descriptor.label ?? 'unknown');
    }
  );

  return {
    createRenderPipelineAsync,
  };
}

/** Create mock shader module creator for injection */
function createMockShaderModuleCreator(shouldSucceed = true) {
  return vi.fn(async (device: GPUDevice, code: string, label: string) => {
    if (!shouldSucceed) return null;
    return createMockShaderModule(label);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────────────────────

describe('DebugPipelineFactory', () => {
  let mockDevice: ReturnType<typeof createMockDevice>;
  let mockCreateShaderModule: ReturnType<typeof createMockShaderModuleCreator>;
  let factory: DebugPipelineFactory;
  let shaderManagerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockDevice = createMockDevice();
    mockCreateShaderModule = createMockShaderModuleCreator();

    // Spy on ShaderManager methods
    const manager = ShaderManager.getInstance();
    vi.spyOn(manager, 'getDebugLinesWGSL').mockReturnValue('// mock lines WGSL');
    vi.spyOn(manager, 'getDebugPointsWGSL').mockReturnValue('// mock points WGSL');
    shaderManagerSpy = vi.spyOn(manager, 'getDebugLinesWGSL');

    const config: DebugPipelineConfig = {
      device: mockDevice as unknown as GPUDevice,
      format: 'bgra8unorm',
      depthFormat: 'depth24plus',
      createShaderModule: mockCreateShaderModule,
    };

    factory = createDebugPipelineFactory(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Factory Creation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('factory creation', () => {
    it('creates factory with required config', () => {
      const minimalConfig: DebugPipelineConfig = {
        device: mockDevice as unknown as GPUDevice,
        format: 'bgra8unorm',
      };

      const minimalFactory = createDebugPipelineFactory(minimalConfig);

      expect(minimalFactory).toBeDefined();
      expect(minimalFactory.createDebugLinesPipeline).toBeInstanceOf(Function);
      expect(minimalFactory.createDebugPointsPipeline).toBeInstanceOf(Function);
    });

    it('uses default depth format when not specified', async () => {
      const minimalConfig: DebugPipelineConfig = {
        device: mockDevice as unknown as GPUDevice,
        format: 'bgra8unorm',
        createShaderModule: mockCreateShaderModule,
      };

      const minimalFactory = createDebugPipelineFactory(minimalConfig);
      await minimalFactory.createDebugLinesPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          depthStencil: expect.objectContaining({
            format: 'depth24plus',
          }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Debug Lines Pipeline Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('createDebugLinesPipeline', () => {
    it('creates debug lines pipeline successfully', async () => {
      const pipeline = await factory.createDebugLinesPipeline(1);

      expect(pipeline).not.toBeNull();
      expect(pipeline?.label).toBe('debug-lines');
    });

    it('fetches WGSL from ShaderManager with style ID', async () => {
      const manager = ShaderManager.getInstance();

      await factory.createDebugLinesPipeline(42);

      expect(manager.getDebugLinesWGSL).toHaveBeenCalledWith(42);
    });

    it('calls createShaderModule with correct parameters', async () => {
      await factory.createDebugLinesPipeline(1);

      expect(mockCreateShaderModule).toHaveBeenCalledWith(
        mockDevice,
        '// mock lines WGSL',
        'debug-lines'
      );
    });

    it('creates pipeline with line-list topology', async () => {
      await factory.createDebugLinesPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          primitive: { topology: 'line-list' },
        })
      );
    });

    it('creates pipeline with correct vertex buffer layout', async () => {
      await factory.createDebugLinesPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          vertex: expect.objectContaining({
            buffers: [
              {
                arrayStride: 8, // 2 floats (u, v)
                attributes: [
                  { shaderLocation: 0, offset: 0, format: 'float32x2' },
                ],
              },
            ],
          }),
        })
      );
    });

    it('creates pipeline with alpha blending', async () => {
      await factory.createDebugLinesPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          fragment: expect.objectContaining({
            targets: [
              expect.objectContaining({
                blend: {
                  color: {
                    srcFactor: 'src-alpha',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                  },
                  alpha: {
                    srcFactor: 'one',
                    dstFactor: 'one-minus-src-alpha',
                    operation: 'add',
                  },
                },
              }),
            ],
          }),
        })
      );
    });

    it('creates pipeline with depth stencil settings', async () => {
      await factory.createDebugLinesPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less-equal',
            format: 'depth24plus',
          },
        })
      );
    });

    it('returns null when shader module creation fails', async () => {
      const failingFactory = createDebugPipelineFactory({
        device: mockDevice as unknown as GPUDevice,
        format: 'bgra8unorm',
        createShaderModule: createMockShaderModuleCreator(false),
      });

      const pipeline = await failingFactory.createDebugLinesPipeline(1);

      expect(pipeline).toBeNull();
    });

    it('returns null when pipeline creation throws', async () => {
      mockDevice.createRenderPipelineAsync.mockRejectedValueOnce(
        new Error('Pipeline creation failed')
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const pipeline = await factory.createDebugLinesPipeline(1);

      expect(pipeline).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WebGPU] Failed to create debug lines pipeline',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Debug Points Pipeline Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('createDebugPointsPipeline', () => {
    it('creates debug points pipeline successfully', async () => {
      const pipeline = await factory.createDebugPointsPipeline(1);

      expect(pipeline).not.toBeNull();
      expect(pipeline?.label).toBe('debug-points');
    });

    it('fetches WGSL from ShaderManager with style ID', async () => {
      const manager = ShaderManager.getInstance();

      await factory.createDebugPointsPipeline(99);

      expect(manager.getDebugPointsWGSL).toHaveBeenCalledWith(99);
    });

    it('calls createShaderModule with correct parameters', async () => {
      await factory.createDebugPointsPipeline(1);

      expect(mockCreateShaderModule).toHaveBeenCalledWith(
        mockDevice,
        '// mock points WGSL',
        'debug-points'
      );
    });

    it('creates pipeline with point-list topology', async () => {
      await factory.createDebugPointsPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          primitive: { topology: 'point-list' },
        })
      );
    });

    it('creates pipeline with correct vertex buffer layout for points', async () => {
      await factory.createDebugPointsPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          vertex: expect.objectContaining({
            buffers: [
              {
                arrayStride: 12, // 3 floats (u, t, kind)
                attributes: [
                  { shaderLocation: 0, offset: 0, format: 'float32x3' },
                ],
              },
            ],
          }),
        })
      );
    });

    it('returns null when shader module creation fails', async () => {
      const failingFactory = createDebugPipelineFactory({
        device: mockDevice as unknown as GPUDevice,
        format: 'bgra8unorm',
        createShaderModule: createMockShaderModuleCreator(false),
      });

      const pipeline = await failingFactory.createDebugPointsPipeline(1);

      expect(pipeline).toBeNull();
    });

    it('returns null when pipeline creation throws', async () => {
      mockDevice.createRenderPipelineAsync.mockRejectedValueOnce(
        new Error('Pipeline creation failed')
      );

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const pipeline = await factory.createDebugPointsPipeline(1);

      expect(pipeline).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[WebGPU] Failed to create debug points pipeline',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Integration Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('integration', () => {
    it('can create multiple pipelines from same factory', async () => {
      const lines1 = await factory.createDebugLinesPipeline(1);
      const lines2 = await factory.createDebugLinesPipeline(2);
      const points = await factory.createDebugPointsPipeline(1);

      expect(lines1).not.toBeNull();
      expect(lines2).not.toBeNull();
      expect(points).not.toBeNull();
      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledTimes(3);
    });

    it('uses configured depth format', async () => {
      const customConfig: DebugPipelineConfig = {
        device: mockDevice as unknown as GPUDevice,
        format: 'rgba8unorm',
        depthFormat: 'depth32float',
        createShaderModule: mockCreateShaderModule,
      };

      const customFactory = createDebugPipelineFactory(customConfig);
      await customFactory.createDebugLinesPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          depthStencil: expect.objectContaining({
            format: 'depth32float',
          }),
        })
      );
    });

    it('uses configured render format', async () => {
      const customConfig: DebugPipelineConfig = {
        device: mockDevice as unknown as GPUDevice,
        format: 'rgba16float',
        createShaderModule: mockCreateShaderModule,
      };

      const customFactory = createDebugPipelineFactory(customConfig);
      await customFactory.createDebugLinesPipeline(1);

      expect(mockDevice.createRenderPipelineAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          fragment: expect.objectContaining({
            targets: [
              expect.objectContaining({
                format: 'rgba16float',
              }),
            ],
          }),
        })
      );
    });
  });
});
