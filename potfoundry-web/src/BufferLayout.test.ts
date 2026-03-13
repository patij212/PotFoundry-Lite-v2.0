/**
 * Tests for BufferLayout module.
 *
 * @module BufferLayout.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createBufferWriter,
  hexToRgbNorm,
  type BufferWriteContext,
  type GradientBuffers,
} from './BufferLayout';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Create a mock GPUBuffer for testing */
function createMockBuffer(label: string): GPUBuffer {
  return {
    label,
    size: 16,
    usage: 0,
    mapState: 'unmapped',
    getMappedRange: vi.fn(),
    unmap: vi.fn(),
    destroy: vi.fn(),
  } as unknown as GPUBuffer;
}

/** Create a mock GPUDevice with spyable writeBuffer */
function createMockDevice() {
  const writes: Array<{ buffer: GPUBuffer; offset: number; data: ArrayBuffer }> = [];
  const writeBufferFn = vi.fn((buffer: GPUBuffer, offset: number, data: ArrayBuffer) => {
    writes.push({ buffer, offset, data: data.slice(0) });
  });
  return {
    queue: {
      writeBuffer: writeBufferFn,
    },
    getWrites: () => writes,
    clearWrites: () => {
      writes.length = 0;
      writeBufferFn.mockClear();
    },
  };
}

/** Create a mock BufferWriteContext */
function createMockContext(disposed = false): BufferWriteContext {
  return {
    isDisposed: vi.fn(() => disposed),
    emitDiagnostic: vi.fn(),
    mountCanvasId: 'test-canvas',
  };
}

/** Create mock gradient buffers */
function createMockGradientBuffers(): GradientBuffers {
  return {
    c1: createMockBuffer('color1'),
    c2: createMockBuffer('color2'),
    c3: createMockBuffer('color3'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// hexToRgbNorm Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('hexToRgbNorm', () => {
  it('converts red hex #ff0000 to [1, 0, 0]', () => {
    const result = hexToRgbNorm('#ff0000');
    expect(result[0]).toBeCloseTo(1, 5);
    expect(result[1]).toBeCloseTo(0, 5);
    expect(result[2]).toBeCloseTo(0, 5);
  });

  it('expands short hex #abc to full form', () => {
    const result = hexToRgbNorm('#abc');
    // #abc -> #aabbcc -> [170/255, 187/255, 204/255]
    expect(result[0]).toBeCloseTo(170 / 255, 5);
    expect(result[1]).toBeCloseTo(187 / 255, 5);
    expect(result[2]).toBeCloseTo(204 / 255, 5);
  });

  it('passes through array values', () => {
    const result = hexToRgbNorm([0.5, 0.5, 0.5]);
    expect(result).toEqual([0.5, 0.5, 0.5]);
  });

  it('returns default blue for empty string', () => {
    const result = hexToRgbNorm('');
    expect(result).toEqual([0.18, 0.53, 0.87]);
  });

  it('returns default blue for null', () => {
    const result = hexToRgbNorm(null);
    expect(result).toEqual([0.18, 0.53, 0.87]);
  });

  it('returns default blue for undefined', () => {
    const result = hexToRgbNorm(undefined);
    expect(result).toEqual([0.18, 0.53, 0.87]);
  });

  it('handles hex without # prefix', () => {
    const result = hexToRgbNorm('00ff00');
    expect(result[0]).toBeCloseTo(0, 5);
    expect(result[1]).toBeCloseTo(1, 5);
    expect(result[2]).toBeCloseTo(0, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Factory Creation Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createBufferWriter', () => {
  it('returns object with all required methods', () => {
    const mockDevice = createMockDevice();
    const mockContext = createMockContext();
    const writer = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: mockContext,
    });

    expect(typeof writer.writeGradient).toBe('function');
    expect(typeof writer.writeBackgroundGradient).toBe('function');
    expect(typeof writer.syncStyleParams).toBe('function');
    expect(typeof writer.getMetrics).toBe('function');
    expect(typeof writer.resetMetrics).toBe('function');
    expect(typeof writer.resetStyleParamCache).toBe('function');
  });

  it('initializes with zero metrics', () => {
    const mockDevice = createMockDevice();
    const mockContext = createMockContext();
    const writer = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: mockContext,
    });

    const metrics = writer.getMetrics();
    expect(metrics.colorWrites).toBe(0);
    expect(metrics.bgWrites).toBe(0);
    expect(metrics.styleParamWrites).toBe(0);
    expect(metrics.styleParamSkips).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// writeGradient Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('writeGradient', () => {
  let mockDevice: ReturnType<typeof createMockDevice>;
  let mockContext: BufferWriteContext;
  let mockBuffers: GradientBuffers;
  let writer: ReturnType<typeof createBufferWriter>;

  beforeEach(() => {
    mockDevice = createMockDevice();
    mockContext = createMockContext(false);
    mockBuffers = createMockGradientBuffers();
    writer = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: mockContext,
    });
  });

  it('writes 3 buffers on valid gradient', () => {
    writer.writeGradient(mockBuffers, ['#ff0000', '#00ff00', '#0000ff']);

    expect(mockDevice.queue.writeBuffer).toHaveBeenCalledTimes(3);
    const metrics = writer.getMetrics();
    expect(metrics.colorWrites).toBe(3);
  });

  it('skips writes when disposed', () => {
    const disposedContext = createMockContext(true);
    const disposedWriter = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: disposedContext,
    });

    disposedWriter.writeGradient(mockBuffers, ['#ff0000', '#00ff00', '#0000ff']);

    expect(mockDevice.queue.writeBuffer).not.toHaveBeenCalled();
    expect(disposedWriter.getMetrics().colorWrites).toBe(0);
  });

  it('handles single-stop gradient by duplicating', () => {
    writer.writeGradient(mockBuffers, ['#ff0000']);

    expect(mockDevice.queue.writeBuffer).toHaveBeenCalledTimes(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// writeBackgroundGradient Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('writeBackgroundGradient', () => {
  let mockDevice: ReturnType<typeof createMockDevice>;
  let mockContext: BufferWriteContext;
  let mockBuffers: GradientBuffers;
  let writer: ReturnType<typeof createBufferWriter>;

  beforeEach(() => {
    mockDevice = createMockDevice();
    mockContext = createMockContext(false);
    mockBuffers = createMockGradientBuffers();
    writer = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: mockContext,
    });
  });

  it('interpolates middle stop for 2-stop gradient', () => {
    writer.writeBackgroundGradient(mockBuffers, ['#000000', '#ffffff'], 0);

    expect(mockDevice.queue.writeBuffer).toHaveBeenCalledTimes(3);

    // Check that middle buffer has interpolated values
    const writes = mockDevice.getWrites();
    expect(writes.length).toBe(3);

    // c2 should be the middle interpolated value
    const c2Data = new Float32Array(writes[1].data);
    expect(c2Data[0]).toBeCloseTo(0.5, 5);
    expect(c2Data[1]).toBeCloseTo(0.5, 5);
    expect(c2Data[2]).toBeCloseTo(0.5, 5);
  });

  it('encodes angle in C1 alpha channel', () => {
    const testAngle = 45;
    writer.writeBackgroundGradient(mockBuffers, ['#ff0000', '#00ff00', '#0000ff'], testAngle);

    const writes = mockDevice.getWrites();
    const c1Data = new Float32Array(writes[0].data);
    expect(c1Data[3]).toBe(testAngle);
  });

  it('skips writes when disposed', () => {
    const disposedContext = createMockContext(true);
    const disposedWriter = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: disposedContext,
    });

    disposedWriter.writeBackgroundGradient(mockBuffers, ['#ff0000', '#00ff00', '#0000ff'], 0);

    expect(mockDevice.queue.writeBuffer).not.toHaveBeenCalled();
    expect(disposedWriter.getMetrics().bgWrites).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// syncStyleParams Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('syncStyleParams', () => {
  let mockDevice: ReturnType<typeof createMockDevice>;
  let mockContext: BufferWriteContext;
  let mockBuffer: GPUBuffer;
  let writer: ReturnType<typeof createBufferWriter>;

  beforeEach(() => {
    mockDevice = createMockDevice();
    mockContext = createMockContext(false);
    mockBuffer = createMockBuffer('styleParams');
    writer = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: mockContext,
    });
  });

  it('writes buffer when values change', () => {
    writer.syncStyleParams(mockBuffer, [1.0, 2.0, 3.0]);

    expect(mockDevice.queue.writeBuffer).toHaveBeenCalledTimes(1);
    expect(writer.getMetrics().styleParamWrites).toBe(1);
  });

  it('skips write when values unchanged within epsilon', () => {
    // First call to establish cache
    writer.syncStyleParams(mockBuffer, [1.0, 2.0, 3.0]);
    mockDevice.clearWrites();

    // Second call with same values
    writer.syncStyleParams(mockBuffer, [1.0, 2.0, 3.0]);

    expect(mockDevice.queue.writeBuffer).not.toHaveBeenCalled();
  });

  it('enforces sentinel at index 47 when zero', () => {
    // Create array with 48 elements, last one is 0
    const values = new Array(48).fill(0);
    values[0] = 1.0; // Some non-zero data

    writer.syncStyleParams(mockBuffer, values);

    const writes = mockDevice.getWrites();
    const data = new Float32Array(writes[0].data);
    expect(data[47]).toBe(1.0); // Sentinel should be forced to 1.0
  });

  it('respects non-zero sentinel from source', () => {
    // Create array with 48 elements, last one is already set
    const values = new Array(48).fill(0);
    values[47] = 5.0; // Non-zero sentinel

    writer.syncStyleParams(mockBuffer, values);

    const writes = mockDevice.getWrites();
    const data = new Float32Array(writes[0].data);
    expect(data[47]).toBe(5.0); // Should preserve source value
  });

  it('skips write and tracks skip when disposed', () => {
    const disposedContext = createMockContext(true);
    const disposedWriter = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: disposedContext,
    });

    disposedWriter.syncStyleParams(mockBuffer, [1.0, 2.0, 3.0]);

    expect(mockDevice.queue.writeBuffer).not.toHaveBeenCalled();
    expect(disposedWriter.getMetrics().styleParamSkips).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('metrics', () => {
  it('resetMetrics clears all counters', () => {
    const mockDevice = createMockDevice();
    const mockContext = createMockContext(false);
    const mockBuffers = createMockGradientBuffers();
    const mockStyleBuffer = createMockBuffer('styleParams');
    const writer = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: mockContext,
    });

    // Accumulate some metrics
    writer.writeGradient(mockBuffers, ['#ff0000']);
    writer.writeBackgroundGradient(mockBuffers, ['#ff0000'], 0);
    writer.syncStyleParams(mockStyleBuffer, [1.0]);

    // Verify metrics accumulated
    let metrics = writer.getMetrics();
    expect(metrics.colorWrites).toBeGreaterThan(0);

    // Reset and verify
    writer.resetMetrics();
    metrics = writer.getMetrics();
    expect(metrics.colorWrites).toBe(0);
    expect(metrics.bgWrites).toBe(0);
    expect(metrics.styleParamWrites).toBe(0);
    expect(metrics.styleParamSkips).toBe(0);
  });

  it('resetStyleParamCache forces re-sync', () => {
    const mockDevice = createMockDevice();
    const mockContext = createMockContext(false);
    const mockBuffer = createMockBuffer('styleParams');
    const writer = createBufferWriter({
      device: mockDevice as unknown as GPUDevice,
      context: mockContext,
    });

    // First sync
    writer.syncStyleParams(mockBuffer, [1.0, 2.0, 3.0]);
    mockDevice.clearWrites();

    // Same values - should skip
    writer.syncStyleParams(mockBuffer, [1.0, 2.0, 3.0]);
    expect(mockDevice.queue.writeBuffer).not.toHaveBeenCalled();

    // Reset cache
    writer.resetStyleParamCache();

    // Same values - should now write
    writer.syncStyleParams(mockBuffer, [1.0, 2.0, 3.0]);
    expect(mockDevice.queue.writeBuffer).toHaveBeenCalledTimes(1);
  });
});
