/**
 * @fileoverview Tests for PointerEventRouter module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPointerEventRouter,
  type PointerEventRouterConfig,
  type PointerEventStateSlice,
} from './PointerEventRouter';

/** Create a mock canvas element */
function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  return canvas;
}

/** Create a mock controller */
function createMockCameraController() {
  return {
    onPointerDown: vi.fn(),
    onPointerRelease: vi.fn(),
    onPointerMove: vi.fn(),
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    pointer: {
      isPinching: false,
    },
  };
}

/** Create a mock config */
function createMockConfig(
  overrides: Partial<PointerEventRouterConfig> = {}
): PointerEventRouterConfig {
  const canvas = createMockCanvas();
  const state: PointerEventStateSlice = { cameraMode: 'turntable' };

  return {
    canvas,
    canvasId: 'test-canvas',
    getState: () => state,
    getCameraController: () => createMockCameraController() as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
    markInteraction: vi.fn(),
    applyFreeLookDolly: vi.fn(),
    zoomCameraAtCursor: vi.fn(),
    focusCameraAtCursor: vi.fn(),
    scheduleCameraEmit: vi.fn(),
    emitDiagnostic: vi.fn(),
    debugEnabled: false,
    ...overrides,
  };
}

describe('PointerEventRouter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createPointerEventRouter', () => {
    it('should create a router with all required methods', () => {
      const config = createMockConfig();
      const router = createPointerEventRouter(config);

      expect(router).toBeDefined();
      expect(typeof router.attach).toBe('function');
      expect(typeof router.dispose).toBe('function');
      expect(typeof router.hasLocalControl).toBe('function');
      expect(typeof router.setLocalControl).toBe('function');
      expect(typeof router.clearLocalControlTimer).toBe('function');
    });

    it('should initialize with hasLocalControl = false', () => {
      const config = createMockConfig();
      const router = createPointerEventRouter(config);

      expect(router.hasLocalControl()).toBe(false);
    });
  });

  describe('.attach()', () => {
    it('should add event listeners to canvas', () => {
      const config = createMockConfig();
      const addSpy = vi.spyOn(config.canvas, 'addEventListener');

      const router = createPointerEventRouter(config);
      router.attach();

      // Should add pointer, touch, wheel, and dblclick listeners
      expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: false });
      expect(addSpy).toHaveBeenCalledWith('touchmove', expect.any(Function), { passive: false });
      expect(addSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('touchcancel', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
      expect(addSpy).toHaveBeenCalledWith('dblclick', expect.any(Function));
    });

    it('should add window listener for pointerup', () => {
      const config = createMockConfig();
      const windowAddSpy = vi.spyOn(window, 'addEventListener');

      const router = createPointerEventRouter(config);
      router.attach();

      expect(windowAddSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    });

    it('should emit diagnostic on attach', () => {
      const config = createMockConfig();
      const router = createPointerEventRouter(config);
      router.attach();

      expect(config.emitDiagnostic).toHaveBeenCalledWith('pointer-router:attached');
    });

    it('should not attach twice', () => {
      const config = createMockConfig();
      const addSpy = vi.spyOn(config.canvas, 'addEventListener');

      const router = createPointerEventRouter(config);
      router.attach();
      const callCount = addSpy.mock.calls.length;

      router.attach(); // Second attach should be no-op
      expect(addSpy.mock.calls.length).toBe(callCount);
    });
  });

  describe('.dispose()', () => {
    it('should remove event listeners from canvas', () => {
      const config = createMockConfig();
      const removeSpy = vi.spyOn(config.canvas, 'removeEventListener');

      const router = createPointerEventRouter(config);
      router.attach();
      router.dispose();

      expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointercancel', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchstart', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchmove', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchend', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('touchcancel', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
      expect(removeSpy).toHaveBeenCalledWith('dblclick', expect.any(Function));
    });

    it('should remove window listener for pointerup', () => {
      const config = createMockConfig();
      const windowRemoveSpy = vi.spyOn(window, 'removeEventListener');

      const router = createPointerEventRouter(config);
      router.attach();
      router.dispose();

      expect(windowRemoveSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
    });

    it('should emit diagnostic on dispose', () => {
      const config = createMockConfig();
      const router = createPointerEventRouter(config);
      router.attach();
      router.dispose();

      expect(config.emitDiagnostic).toHaveBeenCalledWith('pointer-router:disposed');
    });

    it('should not dispose if not attached', () => {
      const config = createMockConfig();
      const removeSpy = vi.spyOn(config.canvas, 'removeEventListener');

      const router = createPointerEventRouter(config);
      router.dispose(); // Dispose without attach should be no-op

      expect(removeSpy).not.toHaveBeenCalled();
    });
  });

  describe('pointer events', () => {
    it('should set hasLocalControl on pointerdown', () => {
      const mockController = createMockCameraController();
      const config = createMockConfig({
        getCameraController: () => mockController as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      const event = new PointerEvent('pointerdown', { clientX: 100, clientY: 200 });
      config.canvas.dispatchEvent(event);

      expect(router.hasLocalControl()).toBe(true);
      expect(mockController.onPointerDown).toHaveBeenCalled();
    });

    it('should delegate pointerup to controller and defer local control reset', () => {
      const mockController = createMockCameraController();
      const config = createMockConfig({
        getCameraController: () => mockController as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
        localControlResetDelay: 100,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      // First set local control
      router.setLocalControl(true);
      expect(router.hasLocalControl()).toBe(true);

      // Dispatch pointerup
      const event = new PointerEvent('pointerup');
      config.canvas.dispatchEvent(event);

      expect(mockController.onPointerRelease).toHaveBeenCalled();

      // Local control should still be true (deferred)
      expect(router.hasLocalControl()).toBe(true);

      // Advance timer
      vi.advanceTimersByTime(100);
      expect(router.hasLocalControl()).toBe(false);
    });

    it('should delegate pointermove to controller', () => {
      const mockController = createMockCameraController();
      const config = createMockConfig({
        getCameraController: () => mockController as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      const event = new PointerEvent('pointermove', { clientX: 150, clientY: 250 });
      config.canvas.dispatchEvent(event);

      expect(mockController.onPointerMove).toHaveBeenCalled();
    });
  });

  describe('wheel events', () => {
    it('should call applyFreeLookDolly in free mode', () => {
      const state: PointerEventStateSlice = { cameraMode: 'free' };
      const config = createMockConfig({
        getState: () => state,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      const event = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
      config.canvas.dispatchEvent(event);

      expect(config.applyFreeLookDolly).toHaveBeenCalledWith(-100); // -deltaY
      expect(config.markInteraction).toHaveBeenCalled();
      expect(config.scheduleCameraEmit).toHaveBeenCalled();
    });

    it('should call zoomCameraAtCursor in turntable mode with exponential factor', () => {
      const state: PointerEventStateSlice = { cameraMode: 'turntable' };
      const config = createMockConfig({
        getState: () => state,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      const event = new WheelEvent('wheel', {
        deltaY: 100,
        clientX: 400,
        clientY: 300,
        cancelable: true,
      });
      config.canvas.dispatchEvent(event);

      // k = Math.exp(-100 * 0.001) ≈ 0.9048
      expect(config.zoomCameraAtCursor).toHaveBeenCalledWith(400, 300, expect.closeTo(0.9048, 3));
      expect(config.markInteraction).toHaveBeenCalled();
    });

    it('should zoom in on negative deltaY', () => {
      const state: PointerEventStateSlice = { cameraMode: 'arcball' };
      const config = createMockConfig({
        getState: () => state,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      const event = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 200,
        clientY: 150,
        cancelable: true,
      });
      config.canvas.dispatchEvent(event);

      // k = Math.exp(-(-100) * 0.001) ≈ 1.1052
      expect(config.zoomCameraAtCursor).toHaveBeenCalledWith(200, 150, expect.closeTo(1.1052, 3));
    });
  });

  describe('double-click events', () => {
    it('should call focusCameraAtCursor on left-button dblclick', () => {
      const config = createMockConfig();

      const router = createPointerEventRouter(config);
      router.attach();

      const event = new MouseEvent('dblclick', { clientX: 300, clientY: 400, button: 0 });
      config.canvas.dispatchEvent(event);

      expect(config.focusCameraAtCursor).toHaveBeenCalledWith(300, 400);
    });

    it('should ignore non-left-button double-clicks', () => {
      const config = createMockConfig();

      const router = createPointerEventRouter(config);
      router.attach();

      // Right-click double-click
      const event = new MouseEvent('dblclick', { clientX: 300, clientY: 400, button: 2 });
      config.canvas.dispatchEvent(event);

      expect(config.focusCameraAtCursor).not.toHaveBeenCalled();
    });
  });

  describe('touch events', () => {
    it('should delegate touchstart to controller for 2+ fingers', () => {
      const mockController = createMockCameraController();
      const config = createMockConfig({
        getCameraController: () => mockController as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      // Create a 2-finger touch event
      const touch1 = { clientX: 100, clientY: 200, identifier: 0 } as Touch;
      const touch2 = { clientX: 200, clientY: 200, identifier: 1 } as Touch;
      const touchList = {
        0: touch1,
        1: touch2,
        length: 2,
        item: (i: number) => (i === 0 ? touch1 : touch2),
        [Symbol.iterator]: function* () {
          yield touch1;
          yield touch2;
        },
      } as unknown as TouchList;

      const event = new TouchEvent('touchstart', {
        touches: touchList,
        cancelable: true,
      });
      config.canvas.dispatchEvent(event);

      expect(mockController.onTouchStart).toHaveBeenCalled();
    });

    it('should delegate touchmove to controller when isPinching', () => {
      const mockController = createMockCameraController();
      mockController.pointer.isPinching = true;
      const config = createMockConfig({
        getCameraController: () => mockController as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      const touch1 = { clientX: 100, clientY: 200, identifier: 0 } as Touch;
      const touch2 = { clientX: 200, clientY: 200, identifier: 1 } as Touch;
      const touchList = {
        0: touch1,
        1: touch2,
        length: 2,
        item: (i: number) => (i === 0 ? touch1 : touch2),
        [Symbol.iterator]: function* () {
          yield touch1;
          yield touch2;
        },
      } as unknown as TouchList;

      const event = new TouchEvent('touchmove', {
        touches: touchList,
        cancelable: true,
      });
      config.canvas.dispatchEvent(event);

      expect(mockController.onTouchMove).toHaveBeenCalled();
    });

    it('should delegate touchend to controller', () => {
      const mockController = createMockCameraController();
      const config = createMockConfig({
        getCameraController: () => mockController as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      const event = new TouchEvent('touchend');
      config.canvas.dispatchEvent(event);

      expect(mockController.onTouchEnd).toHaveBeenCalled();
    });
  });

  describe('hasLocalControl / setLocalControl', () => {
    it('should allow setting and getting local control state', () => {
      const config = createMockConfig();
      const router = createPointerEventRouter(config);

      expect(router.hasLocalControl()).toBe(false);

      router.setLocalControl(true);
      expect(router.hasLocalControl()).toBe(true);

      router.setLocalControl(false);
      expect(router.hasLocalControl()).toBe(false);
    });
  });

  describe('clearLocalControlTimer', () => {
    it('should clear pending reset timer', () => {
      const mockController = createMockCameraController();
      const config = createMockConfig({
        getCameraController: () => mockController as unknown as ReturnType<PointerEventRouterConfig['getCameraController']>,
        localControlResetDelay: 500,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      // Set local control and trigger release to start timer
      router.setLocalControl(true);
      const event = new PointerEvent('pointerup');
      config.canvas.dispatchEvent(event);

      // Timer is pending, local control still true
      expect(router.hasLocalControl()).toBe(true);

      // Clear the timer
      router.clearLocalControlTimer();

      // Advance time past the delay
      vi.advanceTimersByTime(600);

      // Local control should still be true (timer was cleared)
      expect(router.hasLocalControl()).toBe(true);
    });
  });

  describe('controller not available', () => {
    it('should handle missing controller gracefully on pointerdown', () => {
      const config = createMockConfig({
        getCameraController: () => undefined,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      // Should not throw
      const event = new PointerEvent('pointerdown', { clientX: 100, clientY: 200 });
      expect(() => config.canvas.dispatchEvent(event)).not.toThrow();

      // hasLocalControl should still be set
      expect(router.hasLocalControl()).toBe(true);
    });

    it('should handle missing controller gracefully on pointermove', () => {
      const config = createMockConfig({
        getCameraController: () => undefined,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      // Should not throw
      const event = new PointerEvent('pointermove', { clientX: 150, clientY: 250 });
      expect(() => config.canvas.dispatchEvent(event)).not.toThrow();
    });
  });

  describe('debug mode', () => {
    it('should emit diagnostics when debugEnabled is true', () => {
      const state: PointerEventStateSlice = { cameraMode: 'turntable' };
      const emitDiagnostic = vi.fn();
      const config = createMockConfig({
        getState: () => state,
        debugEnabled: true,
        emitDiagnostic,
      });

      const router = createPointerEventRouter(config);
      router.attach();

      // Trigger a pointer down
      const event = new PointerEvent('pointerdown', { clientX: 300, clientY: 400 });
      config.canvas.dispatchEvent(event);

      expect(emitDiagnostic).toHaveBeenCalledWith(
        'webgpu:pointer-down',
        expect.objectContaining({ x: 300, y: 400 })
      );
    });
  });
});
