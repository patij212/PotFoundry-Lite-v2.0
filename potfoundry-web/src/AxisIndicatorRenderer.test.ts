/**
 * @fileoverview Tests for AxisIndicatorRenderer module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAxisIndicatorRenderer,
  type AxisIndicatorRendererInstance,
  type AxisIndicatorRendererConfig,
} from './AxisIndicatorRenderer';
import type { CameraRig } from './types';
import type { CameraBasis, Vec3 } from './camera_basis';

// Mock the AxisOverlay module
vi.mock('./AxisOverlay', () => ({
  overlayForAxisFromBasis: vi.fn(() => [1, 0]),
  ndcDirBetween: vi.fn(() => [1, 0, 0]),
  mulMat4Vec4: vi.fn(() => [0, 0, 0, 1]),
}));

/**
 * Create a mock CameraBasis for testing
 */
function createMockBasis(): CameraBasis {
  return {
    right: [1, 0, 0] as Vec3,
    up: [0, 1, 0] as Vec3,
    forward: [0, 0, 1] as Vec3,
  };
}

/**
 * Create a mock CameraRig for testing
 */
function createMockRig(overrides: Partial<CameraRig> = {}): CameraRig {
  return {
    eye: [0, -100, 50] as Vec3,
    viewProjection: new Float32Array(16),
    near: 0.1,
    far: 1000,
    fov: 45,
    mode: 'perspective',
    basis: createMockBasis(),
    ...overrides,
  };
}

/**
 * Create a mock CanvasRenderingContext2D for testing
 */
function createMockContext(width = 100, height = 100): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = {
    canvas,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
    lineWidth: 2,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textAlign: 'left' as CanvasTextAlign,
    textBaseline: 'top' as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D;

  return ctx;
}

describe('AxisIndicatorRenderer', () => {
  let renderer: AxisIndicatorRendererInstance;
  let mockConfig: AxisIndicatorRendererConfig;
  let mockCtx: CanvasRenderingContext2D;
  let mockRig: CameraRig;

  beforeEach(() => {
    mockCtx = createMockContext();
    mockRig = createMockRig();

    mockConfig = {
      getPivot: vi.fn(() => [0, 0, 0] as Vec3),
      getSceneRadius: vi.fn(() => 50),
      getSequence: vi.fn(() => 1),
      emitDiagnostic: vi.fn(),
      debugThrottleMs: 250,
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    renderer?.dispose();
  });

  describe('createAxisIndicatorRenderer', () => {
    it('should create a renderer with all required methods', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(renderer).toBeDefined();
      expect(typeof renderer.draw).toBe('function');
      expect(typeof renderer.reset).toBe('function');
      expect(typeof renderer.dispose).toBe('function');
    });

    it('should work with minimal config (no optional callbacks)', () => {
      const minimalConfig: AxisIndicatorRendererConfig = {
        getPivot: () => null,
        getSceneRadius: () => 1,
      };
      renderer = createAxisIndicatorRenderer(minimalConfig);
      expect(renderer).toBeDefined();
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });
  });

  describe('.draw()', () => {
    it('should clear the canvas before drawing', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
    });

    it('should draw background circle', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      expect(mockCtx.arc).toHaveBeenCalled();
      expect(mockCtx.fill).toHaveBeenCalled();
    });

    it('should draw all three axes (X, Y, Z)', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      // Called for: background circle + 3 arrows + 3 lines
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.stroke).toHaveBeenCalled();
    });

    it('should draw axis labels', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      expect(mockCtx.fillText).toHaveBeenCalled();
    });

    it('should handle null context gracefully', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(null, mockRig)).not.toThrow();
    });

    it('should handle null rig gracefully', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(mockCtx, null)).not.toThrow();
    });

    it('should handle both null context and rig gracefully', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(null, null)).not.toThrow();
    });

    it('should not draw after dispose', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.dispose();
      renderer.draw(mockCtx, mockRig);
      expect(mockCtx.clearRect).not.toHaveBeenCalled();
    });

    it('should handle null pivot by using default [0,0,0]', () => {
      mockConfig.getPivot = vi.fn(() => null);
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });

    it('should handle undefined pivot by using default [0,0,0]', () => {
      mockConfig.getPivot = vi.fn(() => undefined);
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });

    it('should enforce minimum scene radius of 1', () => {
      mockConfig.getSceneRadius = vi.fn(() => 0.1);
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });

    it('should scale line width based on canvas size', () => {
      const largeCtx = createMockContext(500, 500);
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(largeCtx, mockRig);
      // Line width should be scaled: Math.max(2, Math.round(500 * 0.02)) = 10
      expect(largeCtx.beginPath).toHaveBeenCalled();
    });
  });

  describe('diagnostic emission', () => {
    it('should emit diagnostic when emitDiagnostic is provided', async () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith(
        'component:axis-overlay-compare',
        expect.objectContaining({
          axes: expect.any(Object),
          ts: expect.any(Number),
          camSeq: 1,
        })
      );
    });

    it('should throttle diagnostic emissions', async () => {
      mockConfig.debugThrottleMs = 100;
      renderer = createAxisIndicatorRenderer(mockConfig);

      // First draw should emit
      renderer.draw(mockCtx, mockRig);
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledTimes(1);

      // Immediate second draw should be throttled
      renderer.draw(mockCtx, mockRig);
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledTimes(1);
    });

    it('should not emit diagnostic when emitDiagnostic is undefined', () => {
      const configNoEmit: AxisIndicatorRendererConfig = {
        getPivot: () => [0, 0, 0],
        getSceneRadius: () => 50,
      };
      renderer = createAxisIndicatorRenderer(configNoEmit);
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });

    it('should use provided sequence number in diagnostic', () => {
      mockConfig.getSequence = vi.fn(() => 42);
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith(
        'component:axis-overlay-compare',
        expect.objectContaining({ camSeq: 42 })
      );
    });

    it('should use 0 for sequence when getSequence is undefined', () => {
      delete mockConfig.getSequence;
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith(
        'component:axis-overlay-compare',
        expect.objectContaining({ camSeq: 0 })
      );
    });
  });

  describe('.reset()', () => {
    it('should reset the diagnostic throttle timer', async () => {
      // Create fresh config and renderer for this test
      const freshEmit = vi.fn();
      const freshConfig: AxisIndicatorRendererConfig = {
        getPivot: () => [0, 0, 0],
        getSceneRadius: () => 50,
        getSequence: () => 1,
        emitDiagnostic: freshEmit,
        debugThrottleMs: 10000, // Long throttle (10 seconds)
      };
      renderer = createAxisIndicatorRenderer(freshConfig);

      // First draw emits (because initial lastAxisEmit is 0, so now - 0 >= 10000)
      renderer.draw(mockCtx, mockRig);
      expect(freshEmit).toHaveBeenCalledTimes(1);

      // Second draw is throttled (within 10 second window)
      renderer.draw(mockCtx, mockRig);
      expect(freshEmit).toHaveBeenCalledTimes(1);

      // Reset clears throttle (sets lastAxisEmit to -Infinity)
      renderer.reset();

      // Third draw should emit again (because now - (-Infinity) >= 10000)
      renderer.draw(mockCtx, mockRig);
      expect(freshEmit).toHaveBeenCalledTimes(2);
    });
  });

  describe('.dispose()', () => {
    it('should prevent further drawing', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      expect(mockCtx.clearRect).toHaveBeenCalledTimes(1);

      renderer.dispose();
      renderer.draw(mockCtx, mockRig);
      expect(mockCtx.clearRect).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should be safe to call multiple times', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => {
        renderer.dispose();
        renderer.dispose();
        renderer.dispose();
      }).not.toThrow();
    });

    it('should clear internal state', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);
      renderer.dispose();

      // After dispose, even reset should be safe
      expect(() => renderer.reset()).not.toThrow();
    });
  });

  describe('axis projection', () => {
    it('should project axes using camera basis vectors', () => {
      renderer = createAxisIndicatorRenderer(mockConfig);
      renderer.draw(mockCtx, mockRig);

      // With identity basis, X axis should project to the right
      // Y axis should project up, Z axis should project forward (toward viewer)
      // The drawing calls should include moveTo/lineTo for axis lines
      expect(mockCtx.moveTo).toHaveBeenCalled();
      expect(mockCtx.lineTo).toHaveBeenCalled();
    });

    it('should handle rotated camera basis', () => {
      const rotatedBasis: CameraBasis = {
        right: [0, 1, 0] as Vec3,
        up: [0, 0, 1] as Vec3,
        forward: [1, 0, 0] as Vec3,
      };
      const rotatedRig = createMockRig({ basis: rotatedBasis });

      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(mockCtx, rotatedRig)).not.toThrow();
    });

    it('should handle small canvas gracefully', () => {
      const smallCtx = createMockContext(10, 10);
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(smallCtx, mockRig)).not.toThrow();
    });

    it('should handle non-square canvas', () => {
      const wideCtx = createMockContext(200, 50);
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(wideCtx, mockRig)).not.toThrow();

      const tallCtx = createMockContext(50, 200);
      expect(() => renderer.draw(tallCtx, mockRig)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle errors in getPivot gracefully', () => {
      mockConfig.getPivot = vi.fn(() => {
        throw new Error('getPivot error');
      });
      renderer = createAxisIndicatorRenderer(mockConfig);
      // Should not throw even if getPivot throws
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });

    it('should handle errors in getSceneRadius gracefully', () => {
      mockConfig.getSceneRadius = vi.fn(() => {
        throw new Error('getSceneRadius error');
      });
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });

    it('should handle errors in emitDiagnostic gracefully', () => {
      mockConfig.emitDiagnostic = vi.fn(() => {
        throw new Error('emitDiagnostic error');
      });
      renderer = createAxisIndicatorRenderer(mockConfig);
      expect(() => renderer.draw(mockCtx, mockRig)).not.toThrow();
    });
  });
});
