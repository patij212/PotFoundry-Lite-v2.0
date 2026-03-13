/**
 * @fileoverview Tests for AxisOverlay module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAxisOverlay, overlayForAxisFromBasis, ndcDirBetween, mulMat4Vec4 } from './AxisOverlay';
import type { CameraRig, CameraBasis, Vec3 } from './types';

describe('AxisOverlay', () => {
  let parent: HTMLDivElement;
  let instance: ReturnType<typeof createAxisOverlay> | null = null;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.appendChild(parent);
    // Clear localStorage to ensure clean state
    localStorage.removeItem('pf-axis-position');
  });

  afterEach(() => {
    instance?.dispose();
    instance = null;
    parent.remove();
  });

  describe('createAxisOverlay', () => {
    it('creates canvas with correct ID', () => {
      instance = createAxisOverlay({ parent });
      const canvas = document.getElementById('wgpu-axis-overlay');
      expect(canvas).not.toBeNull();
      expect(canvas?.tagName).toBe('CANVAS');
    });

    it('creates canvas with custom ID', () => {
      instance = createAxisOverlay({ parent, id: 'custom-axis' });
      expect(document.getElementById('custom-axis')).not.toBeNull();
      expect(document.getElementById('wgpu-axis-overlay')).toBeNull();
    });

    it('creates canvas with default size', () => {
      instance = createAxisOverlay({ parent });
      const canvas = instance.getCanvas();
      expect(canvas?.width).toBe(96);
      expect(canvas?.height).toBe(96);
    });

    it('creates canvas with custom size', () => {
      instance = createAxisOverlay({ parent, size: 128 });
      const canvas = instance.getCanvas();
      expect(canvas?.width).toBe(128);
      expect(canvas?.height).toBe(128);
    });

    it('returns a valid 2D context', () => {
      instance = createAxisOverlay({ parent });
      const ctx = instance.getContext();
      expect(ctx).not.toBeNull();
      // Check for canvas context properties (CanvasRenderingContext2D not available in JSDOM)
      expect(ctx).toHaveProperty('canvas');
      expect(ctx).toHaveProperty('fillStyle');
    });

    it('removes existing canvas with same ID', () => {
      // Create first instance
      const first = createAxisOverlay({ parent });
      const firstCanvas = first.getCanvas();
      expect(document.getElementById('wgpu-axis-overlay')).toBe(firstCanvas);

      // Create second instance - should remove first
      instance = createAxisOverlay({ parent });
      const secondCanvas = instance.getCanvas();
      expect(document.getElementById('wgpu-axis-overlay')).toBe(secondCanvas);
      expect(firstCanvas?.parentElement).toBeNull();
    });
  });

  describe('visibility', () => {
    it('starts visible by default', () => {
      instance = createAxisOverlay({ parent });
      expect(instance.isVisible()).toBe(true);
    });

    it('can be hidden', () => {
      instance = createAxisOverlay({ parent });
      instance.setVisible(false);
      expect(instance.isVisible()).toBe(false);
      expect(instance.getCanvas()?.style.display).toBe('none');
    });

    it('can be shown again', () => {
      instance = createAxisOverlay({ parent });
      instance.setVisible(false);
      instance.setVisible(true);
      expect(instance.isVisible()).toBe(true);
      expect(instance.getCanvas()?.style.display).toBe('block');
    });
  });

  describe('position persistence', () => {
    it('uses default position when no saved position', () => {
      instance = createAxisOverlay({ parent });
      const canvas = instance.getCanvas();
      // Default position depends on viewport width
      const expected = window.innerWidth <= 768 ? '12px' : '360px';
      expect(canvas?.style.left).toBe(expected);
      expect(canvas?.style.top).toBe('12px');
    });

    it('loads saved position from localStorage', () => {
      localStorage.setItem('pf-axis-position', JSON.stringify({ left: 100, top: 200 }));
      instance = createAxisOverlay({ parent });
      const canvas = instance.getCanvas();
      expect(canvas?.style.left).toBe('100px');
      expect(canvas?.style.top).toBe('200px');
    });

    it('resetPosition restores default position', () => {
      localStorage.setItem('pf-axis-position', JSON.stringify({ left: 100, top: 200 }));
      instance = createAxisOverlay({ parent });
      instance.resetPosition();
      const canvas = instance.getCanvas();
      const expected = window.innerWidth <= 768 ? '12px' : '360px';
      expect(canvas?.style.left).toBe(expected);
      expect(canvas?.style.top).toBe('12px');
    });
  });

  describe('dispose', () => {
    it('removes canvas from DOM', () => {
      instance = createAxisOverlay({ parent });
      expect(document.getElementById('wgpu-axis-overlay')).not.toBeNull();
      instance.dispose();
      instance = null;
      expect(document.getElementById('wgpu-axis-overlay')).toBeNull();
    });

    it('removes all document event listeners', () => {
      const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
      instance = createAxisOverlay({ parent });
      instance.dispose();
      instance = null;

      // Must remove ALL 5 document-level listeners
      expect(removeListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
      expect(removeListenerSpy).toHaveBeenCalledWith('touchcancel', expect.any(Function));

      removeListenerSpy.mockRestore();
    });
  });
});

describe('Math utilities', () => {
  describe('mulMat4Vec4', () => {
    it('multiplies identity matrix correctly', () => {
      const identity = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ]);
      const result = mulMat4Vec4(identity, 1, 2, 3);
      expect(result.x).toBeCloseTo(1);
      expect(result.y).toBeCloseTo(2);
      expect(result.w).toBeCloseTo(1);
    });

    it('handles translation', () => {
      const translate = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        10, 20, 30, 1,
      ]);
      const result = mulMat4Vec4(translate, 0, 0, 0);
      expect(result.x).toBeCloseTo(10);
      expect(result.y).toBeCloseTo(20);
      expect(result.w).toBeCloseTo(1);
    });
  });

  describe('ndcDirBetween', () => {
    it('returns normalized direction', () => {
      const a = { x: 0, y: 0, w: 1 };
      const b = { x: 3, y: 4, w: 1 };
      const [dx, dy] = ndcDirBetween(a, b);
      expect(dx).toBeCloseTo(0.6);
      expect(dy).toBeCloseTo(0.8);
    });

    it('returns zero for identical points', () => {
      const a = { x: 1, y: 1, w: 1 };
      const [dx, dy] = ndcDirBetween(a, a);
      expect(dx).toBe(0);
      expect(dy).toBe(0);
    });
  });

  describe('overlayForAxisFromBasis', () => {
    it('handles identity projection', () => {
      const mockRig: CameraRig = {
        viewProjection: new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
        ]),
        basis: { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1] },
        near: 0.1,
        far: 100,
      };
      const mockBasis: CameraBasis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1] };
      const axis: Vec3 = [1, 0, 0];
      const pivot: Vec3 = [0, 0, 0];

      const [dx, dy] = overlayForAxisFromBasis(mockRig, mockBasis, axis, pivot, 1);
      // X axis projects to screen-right, Y flipped gives positive overlay X
      expect(dx).toBeCloseTo(1);
      expect(dy).toBeCloseTo(0);
    });

    it('returns zero for zero-length axis', () => {
      const mockRig: CameraRig = {
        viewProjection: new Float32Array(16),
        basis: { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1] },
        near: 0.1,
        far: 100,
      };
      const mockBasis: CameraBasis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1] };
      const axis: Vec3 = [0, 0, 0];
      const pivot: Vec3 = [0, 0, 0];

      const [dx, dy] = overlayForAxisFromBasis(mockRig, mockBasis, axis, pivot, 1);
      expect(dx).toBe(0);
      expect(dy).toBe(0);
    });
  });
});
