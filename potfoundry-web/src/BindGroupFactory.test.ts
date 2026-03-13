/**
 * BindGroupFactory.test.ts
 * Unit tests for bind group factory functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBindGroupFactory,
  type BindGroupFactoryConfig,
  type BindGroupFactory,
  type GradientBuffers,
} from './BindGroupFactory';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a mock GPUBuffer */
function createMockBuffer(label: string): GPUBuffer {
  return { label } as unknown as GPUBuffer;
}

/** Create mock gradient buffers */
function createMockGradientBuffers(prefix: string): GradientBuffers {
  return {
    c1: createMockBuffer(`${prefix}-c1`),
    c2: createMockBuffer(`${prefix}-c2`),
    c3: createMockBuffer(`${prefix}-c3`),
  };
}

/** Create a mock bind group layout */
function createMockBindGroupLayout(): GPUBindGroupLayout {
  return { label: 'mock-layout' } as unknown as GPUBindGroupLayout;
}

/** Create a mock bind group */
function createMockBindGroup(label: string): GPUBindGroup {
  return { label } as unknown as GPUBindGroup;
}

/** Create a mock render pipeline */
function createMockPipeline(label: string) {
  const layout = createMockBindGroupLayout();
  return {
    label,
    getBindGroupLayout: vi.fn(() => layout),
  };
}

/** Create a mock GPUDevice */
function createMockDevice() {
  const createBindGroup = vi.fn(
    (descriptor: GPUBindGroupDescriptor) => {
      return createMockBindGroup(descriptor.label ?? 'unknown');
    }
  );

  return {
    createBindGroup,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────────────────────

describe('BindGroupFactory', () => {
  let mockDevice: ReturnType<typeof createMockDevice>;
  let mockUniformBuffer: GPUBuffer;
  let mockStyleParamBuffer: GPUBuffer;
  let mockColorBuffers: GradientBuffers;
  let mockBgBuffers: GradientBuffers;
  let factory: BindGroupFactory;

  beforeEach(() => {
    mockDevice = createMockDevice();
    mockUniformBuffer = createMockBuffer('uniform');
    mockStyleParamBuffer = createMockBuffer('styleParam');
    mockColorBuffers = createMockGradientBuffers('color');
    mockBgBuffers = createMockGradientBuffers('bg');

    const config: BindGroupFactoryConfig = {
      device: mockDevice as unknown as GPUDevice,
      uniformBuffer: mockUniformBuffer,
      styleParamBuffer: mockStyleParamBuffer,
      colorBuffers: mockColorBuffers,
      bgBuffers: mockBgBuffers,
    };

    factory = createBindGroupFactory(config);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Factory Creation Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('factory creation', () => {
    it('creates factory with all methods', () => {
      expect(factory).toBeDefined();
      expect(factory.createMainBindGroup).toBeInstanceOf(Function);
      expect(factory.createDebugBindGroup).toBeInstanceOf(Function);
      expect(factory.createWireframeBindGroup).toBeInstanceOf(Function);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Bind Group Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('createMainBindGroup', () => {
    it('creates main bind group with correct label', () => {
      const pipeline = createMockPipeline('main-pipeline');

      const bindGroup = factory.createMainBindGroup(
        pipeline as unknown as GPURenderPipeline
      );

      expect(bindGroup.label).toBe('component:bind-group-main');
    });

    it('queries pipeline for bind group layout', () => {
      const pipeline = createMockPipeline('main-pipeline');

      factory.createMainBindGroup(pipeline as unknown as GPURenderPipeline);

      expect(pipeline.getBindGroupLayout).toHaveBeenCalledWith(0);
    });

    it('includes all 8 bindings (0-7)', () => {
      const pipeline = createMockPipeline('main-pipeline');

      factory.createMainBindGroup(pipeline as unknown as GPURenderPipeline);

      expect(mockDevice.createBindGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ binding: 0 }),
            expect.objectContaining({ binding: 1 }),
            expect.objectContaining({ binding: 2 }),
            expect.objectContaining({ binding: 3 }),
            expect.objectContaining({ binding: 4 }),
            expect.objectContaining({ binding: 5 }),
            expect.objectContaining({ binding: 6 }),
            expect.objectContaining({ binding: 7 }),
          ]),
        })
      );
    });

    it('binds uniform buffer to binding 0', () => {
      const pipeline = createMockPipeline('main-pipeline');

      factory.createMainBindGroup(pipeline as unknown as GPURenderPipeline);

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      const entry0 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 0
      );
      expect(entry0?.resource).toEqual({ buffer: mockUniformBuffer });
    });

    it('binds color gradient buffers to bindings 1-3', () => {
      const pipeline = createMockPipeline('main-pipeline');

      factory.createMainBindGroup(pipeline as unknown as GPURenderPipeline);

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      const entry1 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 1
      );
      const entry2 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 2
      );
      const entry3 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 3
      );

      expect(entry1?.resource).toEqual({ buffer: mockColorBuffers.c1 });
      expect(entry2?.resource).toEqual({ buffer: mockColorBuffers.c2 });
      expect(entry3?.resource).toEqual({ buffer: mockColorBuffers.c3 });
    });

    it('binds style param buffer to binding 4', () => {
      const pipeline = createMockPipeline('main-pipeline');

      factory.createMainBindGroup(pipeline as unknown as GPURenderPipeline);

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      const entry4 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 4
      );
      expect(entry4?.resource).toEqual({ buffer: mockStyleParamBuffer });
    });

    it('binds background gradient buffers to bindings 5-7', () => {
      const pipeline = createMockPipeline('main-pipeline');

      factory.createMainBindGroup(pipeline as unknown as GPURenderPipeline);

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      const entry5 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 5
      );
      const entry6 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 6
      );
      const entry7 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 7
      );

      expect(entry5?.resource).toEqual({ buffer: mockBgBuffers.c1 });
      expect(entry6?.resource).toEqual({ buffer: mockBgBuffers.c2 });
      expect(entry7?.resource).toEqual({ buffer: mockBgBuffers.c3 });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Debug Bind Group Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('createDebugBindGroup', () => {
    it('creates debug bind group with correct label', () => {
      const pipeline = createMockPipeline('debug-pipeline');

      const bindGroup = factory.createDebugBindGroup(
        pipeline as unknown as GPURenderPipeline
      );

      expect(bindGroup.label).toBe('component:bind-group-debug');
    });

    it('queries pipeline for bind group layout', () => {
      const pipeline = createMockPipeline('debug-pipeline');

      factory.createDebugBindGroup(pipeline as unknown as GPURenderPipeline);

      expect(pipeline.getBindGroupLayout).toHaveBeenCalledWith(0);
    });

    it('includes only 2 bindings (0 and 4)', () => {
      const pipeline = createMockPipeline('debug-pipeline');

      factory.createDebugBindGroup(pipeline as unknown as GPURenderPipeline);

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      expect(call.entries).toHaveLength(2);
      expect(call.entries[0].binding).toBe(0);
      expect(call.entries[1].binding).toBe(4);
    });

    it('binds uniform buffer to binding 0', () => {
      const pipeline = createMockPipeline('debug-pipeline');

      factory.createDebugBindGroup(pipeline as unknown as GPURenderPipeline);

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      const entry0 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 0
      );
      expect(entry0?.resource).toEqual({ buffer: mockUniformBuffer });
    });

    it('binds style param buffer to binding 4', () => {
      const pipeline = createMockPipeline('debug-pipeline');

      factory.createDebugBindGroup(pipeline as unknown as GPURenderPipeline);

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      const entry4 = call.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 4
      );
      expect(entry4?.resource).toEqual({ buffer: mockStyleParamBuffer });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Wireframe Bind Group Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('createWireframeBindGroup', () => {
    it('creates wireframe bind group with correct label', () => {
      const pipeline = createMockPipeline('wireframe-pipeline');

      const bindGroup = factory.createWireframeBindGroup(
        pipeline as unknown as GPURenderPipeline
      );

      expect(bindGroup.label).toBe('component:bind-group-wireframe');
    });

    it('queries pipeline for bind group layout', () => {
      const pipeline = createMockPipeline('wireframe-pipeline');

      factory.createWireframeBindGroup(
        pipeline as unknown as GPURenderPipeline
      );

      expect(pipeline.getBindGroupLayout).toHaveBeenCalledWith(0);
    });

    it('includes only 2 bindings (0 and 4) like debug', () => {
      const pipeline = createMockPipeline('wireframe-pipeline');

      factory.createWireframeBindGroup(
        pipeline as unknown as GPURenderPipeline
      );

      const call = mockDevice.createBindGroup.mock.calls[0][0];
      expect(call.entries).toHaveLength(2);
      expect(call.entries[0].binding).toBe(0);
      expect(call.entries[1].binding).toBe(4);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Integration Tests
  // ─────────────────────────────────────────────────────────────────────────────

  describe('integration', () => {
    it('can create multiple bind groups from same factory', () => {
      const mainPipeline = createMockPipeline('main');
      const debugPipeline = createMockPipeline('debug');
      const wireframePipeline = createMockPipeline('wireframe');

      const mainBg = factory.createMainBindGroup(
        mainPipeline as unknown as GPURenderPipeline
      );
      const debugBg = factory.createDebugBindGroup(
        debugPipeline as unknown as GPURenderPipeline
      );
      const wireframeBg = factory.createWireframeBindGroup(
        wireframePipeline as unknown as GPURenderPipeline
      );

      expect(mainBg).toBeDefined();
      expect(debugBg).toBeDefined();
      expect(wireframeBg).toBeDefined();
      expect(mockDevice.createBindGroup).toHaveBeenCalledTimes(3);
    });

    it('uses same buffers across all bind groups', () => {
      const mainPipeline = createMockPipeline('main');
      const debugPipeline = createMockPipeline('debug');

      factory.createMainBindGroup(mainPipeline as unknown as GPURenderPipeline);
      factory.createDebugBindGroup(
        debugPipeline as unknown as GPURenderPipeline
      );

      // Both calls should use the same uniform buffer reference
      const mainCall = mockDevice.createBindGroup.mock.calls[0][0];
      const debugCall = mockDevice.createBindGroup.mock.calls[1][0];

      const mainUniform = mainCall.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 0
      );
      const debugUniform = debugCall.entries.find(
        (e: GPUBindGroupEntry) => e.binding === 0
      );

      expect(mainUniform?.resource).toEqual(debugUniform?.resource);
    });
  });
});
