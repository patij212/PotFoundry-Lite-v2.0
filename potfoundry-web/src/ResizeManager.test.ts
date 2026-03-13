/**
 * Tests for ResizeManager module
 * @module ResizeManager.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createResizeManager,
  isMobileDevice,
  getSafeMaxDimension,
  type ResizeManager,
  type ResizeManagerConfig,
  type DimensionResult,
} from './ResizeManager';

// ============================================================================
// Helper Functions
// ============================================================================

/** Create a mock canvas element */
function createMockCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 100;
  // Create a mock parent with dimensions
  const parent = document.createElement('div');
  parent.style.width = '800px';
  parent.style.height = '600px';
  // Mock getBoundingClientRect on parent
  parent.getBoundingClientRect = vi.fn(() => ({
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    toJSON: () => ({}),
  }));
  parent.appendChild(canvas);
  return canvas;
}

/** Create a mock GPUCanvasContext */
function createMockContext(): GPUCanvasContext {
  return {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: vi.fn(() => ({
      width: 100,
      height: 100,
      depthOrArrayLayers: 1,
      dimension: '2d',
      format: 'bgra8unorm',
      usage: 0,
      label: undefined,
      mipLevelCount: 1,
      sampleCount: 1,
      createView: vi.fn(),
      destroy: vi.fn(),
    })),
    canvas: {} as HTMLCanvasElement,
  } as unknown as GPUCanvasContext;
}

/** Create a mock GPUDevice */
function createMockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({
      width: 100,
      height: 100,
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
    lost: Promise.resolve({ reason: 'destroyed', message: 'test' }),
    limits: { maxTextureDimension2D: 8192 },
  } as unknown as GPUDevice;
}

/** Create a minimal config for ResizeManager */
function createMockConfig(
  overrides: Partial<ResizeManagerConfig> = {}
): ResizeManagerConfig {
  const canvas = createMockCanvas();
  return {
    canvas,
    context: createMockContext(),
    device: createMockDevice(),
    format: 'bgra8unorm',
    maxTextureDimension2D: 8192,
    onResize: vi.fn(),
    ...overrides,
  };
}

// ============================================================================
// Tests: Utility Functions
// ============================================================================

describe('isMobileDevice', () => {
  const originalUserAgent = navigator.userAgent;
  const originalMaxTouchPoints = navigator.maxTouchPoints;
  const originalScreenWidth = window.screen.width;

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      configurable: true,
    });
    Object.defineProperty(window.screen, 'width', {
      value: originalScreenWidth,
      configurable: true,
    });
    // Clear VITE_MOBILE override
    delete (import.meta.env as Record<string, unknown>).VITE_MOBILE;
  });

  it('returns false for desktop user agents', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(false);
  });

  it('returns true for Android user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36',
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true for iPhone user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1',
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true for iPad user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1',
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true for touch device with small screen (Request Desktop Site)', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });
    Object.defineProperty(window.screen, 'width', {
      value: 412,
      configurable: true,
    });
    expect(isMobileDevice()).toBe(true);
  });

  it('returns true when VITE_MOBILE env var is set', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
      configurable: true,
    });
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 0,
      configurable: true,
    });
    (import.meta.env as Record<string, unknown>).VITE_MOBILE = '1';
    expect(isMobileDevice()).toBe(true);
  });
});

describe('getSafeMaxDimension', () => {
  it('returns GPU limit for desktop when under limit', () => {
    expect(getSafeMaxDimension(8192, false)).toBe(8192);
  });

  it('returns GPU limit for desktop when high', () => {
    expect(getSafeMaxDimension(16384, false)).toBe(16384);
  });

  it('returns mobile limit (4096) for mobile even when GPU reports higher', () => {
    expect(getSafeMaxDimension(8192, true)).toBe(4096);
  });

  it('returns GPU limit for mobile when GPU reports less than 4096', () => {
    expect(getSafeMaxDimension(2048, true)).toBe(2048);
  });
});

// ============================================================================
// Tests: ResizeManager Factory
// ============================================================================

describe('createResizeManager', () => {
  let manager: ResizeManager | null = null;

  afterEach(() => {
    manager?.dispose();
    manager = null;
  });

  describe('initialization', () => {
    it('creates a manager with required methods', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      expect(manager).toBeDefined();
      expect(typeof manager.calculateDimensions).toBe('function');
      expect(typeof manager.resize).toBe('function');
      expect(typeof manager.markInitialized).toBe('function');
      expect(typeof manager.isInitialized).toBe('function');
      expect(typeof manager.getAlphaMode).toBe('function');
      expect(typeof manager.setAlphaMode).toBe('function');
      expect(typeof manager.getLastDimensions).toBe('function');
      expect(typeof manager.dispose).toBe('function');
    });

    it('starts uninitialized', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      expect(manager.isInitialized()).toBe(false);
    });

    it('configures context on creation', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      expect(config.context.configure).toHaveBeenCalled();
    });

    it('sets canvas to 1x1 initially for mobile safety', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      expect(config.canvas.width).toBe(1);
      expect(config.canvas.height).toBe(1);
    });
  });

  describe('calculateDimensions', () => {
    it('returns dimension result with expected properties', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      const dims = manager.calculateDimensions();

      expect(dims).toHaveProperty('width');
      expect(dims).toHaveProperty('height');
      expect(dims).toHaveProperty('dpr');
      expect(dims).toHaveProperty('cssWidth');
      expect(dims).toHaveProperty('cssHeight');
      expect(dims).toHaveProperty('wasClamped');
      expect(dims).toHaveProperty('isFullscreen');
    });

    it('respects parent container dimensions', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      const dims = manager.calculateDimensions();

      // Parent is 800x600, DPR is 1 in test environment
      expect(dims.cssWidth).toBe(800);
      expect(dims.cssHeight).toBe(600);
    });
  });

  describe('resize', () => {
    it('is no-op before initialization', () => {
      const onResize = vi.fn();
      const config = createMockConfig({ onResize });
      manager = createResizeManager(config);

      manager.resize();

      // onResize should not be called before markInitialized
      expect(onResize).not.toHaveBeenCalled();
    });

    it('calls onResize after initialization', () => {
      const onResize = vi.fn();
      const config = createMockConfig({ onResize });
      manager = createResizeManager(config);

      manager.markInitialized();

      expect(onResize).toHaveBeenCalled();
    });

    it('deduplicates consecutive resize calls with same dimensions', () => {
      const onResize = vi.fn();
      const config = createMockConfig({ onResize });
      manager = createResizeManager(config);

      manager.markInitialized();
      const callCount = onResize.mock.calls.length;

      // Second resize with same dimensions should be skipped
      manager.resize();
      expect(onResize.mock.calls.length).toBe(callCount);
    });
  });

  describe('markInitialized', () => {
    it('sets initialized state', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      expect(manager.isInitialized()).toBe(false);
      manager.markInitialized();
      expect(manager.isInitialized()).toBe(true);
    });

    it('triggers initial resize', () => {
      const onResize = vi.fn();
      const config = createMockConfig({ onResize });
      manager = createResizeManager(config);

      expect(onResize).not.toHaveBeenCalled();
      manager.markInitialized();
      expect(onResize).toHaveBeenCalled();
    });
  });

  describe('alpha mode', () => {
    it('defaults to opaque', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      expect(manager.getAlphaMode()).toBe('opaque');
    });

    it('can change alpha mode', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);
      manager.markInitialized();

      manager.setAlphaMode('premultiplied');
      expect(manager.getAlphaMode()).toBe('premultiplied');
    });

    it('reconfigures context when alpha mode changes', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);
      manager.markInitialized();

      const callsBefore = (config.context.configure as ReturnType<typeof vi.fn>).mock.calls.length;
      manager.setAlphaMode('premultiplied');
      const callsAfter = (config.context.configure as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  describe('getLastDimensions', () => {
    it('returns 0x0 before any resize', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      const dims = manager.getLastDimensions();
      expect(dims.width).toBe(0);
      expect(dims.height).toBe(0);
    });

    it('returns actual dimensions after resize', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);
      manager.markInitialized();

      const dims = manager.getLastDimensions();
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
    });
  });

  describe('dispose', () => {
    it('can be called multiple times safely', () => {
      const config = createMockConfig();
      manager = createResizeManager(config);

      expect(() => {
        manager!.dispose();
        manager!.dispose();
      }).not.toThrow();
    });

    it('makes resize no-op after disposal', () => {
      const onResize = vi.fn();
      const config = createMockConfig({ onResize });
      manager = createResizeManager(config);
      manager.markInitialized();

      const callCount = onResize.mock.calls.length;
      manager.dispose();

      // Parent resize mock to trigger different dimensions
      const parent = config.canvas.parentElement;
      if (parent) {
        parent.getBoundingClientRect = vi.fn(() => ({
          width: 1200,
          height: 900,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 900,
          right: 1200,
          toJSON: () => ({}),
        }));
      }

      manager.resize();
      expect(onResize.mock.calls.length).toBe(callCount);
    });
  });
});
