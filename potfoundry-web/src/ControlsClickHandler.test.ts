/**
 * @fileoverview Tests for ControlsClickHandler module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createControlsClickHandler,
  type ControlsClickHandler,
  type ControlsClickHandlerConfig,
} from './ControlsClickHandler';

describe('ControlsClickHandler', () => {
  let controlsRoot: HTMLDivElement;
  let handler: ControlsClickHandler;
  let mockConfig: ControlsClickHandlerConfig;

  beforeEach(() => {
    // Create a mock controls root element
    controlsRoot = document.createElement('div');
    controlsRoot.className = 'controls';
    document.body.appendChild(controlsRoot);

    // Create mock config with all callbacks
    mockConfig = {
      controlsRoot,
      canvasId: 'test-canvas',
      getCameraMode: vi.fn(() => 'turntable'),
      getUseArcball: vi.fn(() => false),
      onViewPreset: vi.fn(),
      onProjectionToggle: vi.fn(),
      onDebugToggle: vi.fn(),
      onArcballToggle: vi.fn(),
      onFlyToggle: vi.fn(),
      onGridToggle: vi.fn(),
      onAxisToggle: vi.fn(),
      onAutoPivotToggle: vi.fn(),
      onAutoRotateToggle: vi.fn(),
      emitDiagnostic: vi.fn(),
      debugEnabled: false,
    };
  });

  afterEach(() => {
    handler?.dispose();
    document.body.removeChild(controlsRoot);
    vi.clearAllMocks();
  });

  describe('createControlsClickHandler', () => {
    it('should create a handler with all required methods', () => {
      handler = createControlsClickHandler(mockConfig);
      expect(handler).toBeDefined();
      expect(typeof handler.attach).toBe('function');
      expect(typeof handler.dispose).toBe('function');
      expect(typeof handler.handleClick).toBe('function');
    });

    it('should handle null controlsRoot gracefully', () => {
      const configWithNull = { ...mockConfig, controlsRoot: null };
      handler = createControlsClickHandler(configWithNull);
      expect(() => handler.attach()).not.toThrow();
      expect(() => handler.dispose()).not.toThrow();
    });
  });

  describe('.attach()', () => {
    it('should add event listener to controlsRoot', () => {
      const addSpy = vi.spyOn(controlsRoot, 'addEventListener');
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
      expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should not attach twice', () => {
      const addSpy = vi.spyOn(controlsRoot, 'addEventListener');
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
      handler.attach();
      expect(addSpy).toHaveBeenCalledTimes(1);
    });

    it('should emit diagnostic on attach when debugEnabled', () => {
      mockConfig.debugEnabled = true;
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith('controls:attached', { canvasId: 'test-canvas' });
    });
  });

  describe('.dispose()', () => {
    it('should remove event listener from controlsRoot', () => {
      const removeSpy = vi.spyOn(controlsRoot, 'removeEventListener');
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
      handler.dispose();
      expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should not dispose if not attached', () => {
      const removeSpy = vi.spyOn(controlsRoot, 'removeEventListener');
      handler = createControlsClickHandler(mockConfig);
      handler.dispose();
      expect(removeSpy).not.toHaveBeenCalled();
    });

    it('should emit diagnostic on dispose when debugEnabled', () => {
      mockConfig.debugEnabled = true;
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
      handler.dispose();
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith('controls:disposed', { canvasId: 'test-canvas' });
    });
  });

  describe('view preset handling', () => {
    beforeEach(() => {
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
    });

    it('should call onViewPreset for data-wgpu-view="fit"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuView = 'fit';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('fit');
    });

    it('should call onViewPreset for data-wgpu-view="top"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuView = 'top';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('top');
    });

    it('should call onViewPreset for data-wgpu-view="front"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuView = 'front';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('front');
    });

    it('should emit diagnostic for view preset when debugEnabled', () => {
      handler.dispose();
      mockConfig.debugEnabled = true;
      handler = createControlsClickHandler(mockConfig);
      handler.attach();

      const button = document.createElement('button');
      button.dataset.wgpuView = 'fit';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith('controls:view-preset', { preset: 'fit', canvasId: 'test-canvas' });
    });
  });

  describe('action handling', () => {
    beforeEach(() => {
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
    });

    it('should call onProjectionToggle for action="projection"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'projection';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onProjectionToggle).toHaveBeenCalled();
    });

    it('should call onDebugToggle for action="debug"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'debug';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onDebugToggle).toHaveBeenCalled();
    });

    it('should call onArcballToggle for action="arcball"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'arcball';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onArcballToggle).toHaveBeenCalled();
    });

    it('should call onFlyToggle for action="fly"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'fly';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onFlyToggle).toHaveBeenCalled();
    });

    it('should call onGridToggle for action="grid"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'grid';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onGridToggle).toHaveBeenCalled();
    });

    it('should call onAxisToggle for action="axis"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'axis';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onAxisToggle).toHaveBeenCalled();
    });

    it('should call onAutoPivotToggle for action="pivot-auto"', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'pivot-auto';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onAutoPivotToggle).toHaveBeenCalled();
    });

    it('should emit diagnostic for actions when debugEnabled', () => {
      handler.dispose();
      mockConfig.debugEnabled = true;
      handler = createControlsClickHandler(mockConfig);
      handler.attach();

      const button = document.createElement('button');
      button.dataset.wgpuAction = 'projection';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith('controls:action', { action: 'projection', canvasId: 'test-canvas' });
    });
  });

  describe('role-based handling', () => {
    beforeEach(() => {
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
    });

    it('should call onAutoRotateToggle for role="autorotate"', () => {
      const button = document.createElement('button');
      button.dataset.role = 'autorotate';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onAutoRotateToggle).toHaveBeenCalled();
    });

    it('should emit diagnostic for autorotate when debugEnabled', () => {
      handler.dispose();
      mockConfig.debugEnabled = true;
      handler = createControlsClickHandler(mockConfig);
      handler.attach();

      const button = document.createElement('button');
      button.dataset.role = 'autorotate';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith('controls:autorotate', { canvasId: 'test-canvas' });
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      handler = createControlsClickHandler(mockConfig);
      handler.attach();
    });

    it('should ignore clicks on non-HTMLElement targets', () => {
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: null });
      handler.handleClick(event);

      expect(mockConfig.onViewPreset).not.toHaveBeenCalled();
      expect(mockConfig.onProjectionToggle).not.toHaveBeenCalled();
    });

    it('should ignore clicks on elements without relevant data attributes', () => {
      const div = document.createElement('div');
      controlsRoot.appendChild(div);

      div.click();
      expect(mockConfig.onViewPreset).not.toHaveBeenCalled();
      expect(mockConfig.onProjectionToggle).not.toHaveBeenCalled();
      expect(mockConfig.onDebugToggle).not.toHaveBeenCalled();
    });

    it('should ignore unknown actions', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'unknown-action';
      controlsRoot.appendChild(button);

      button.click();
      expect(mockConfig.onProjectionToggle).not.toHaveBeenCalled();
      expect(mockConfig.onDebugToggle).not.toHaveBeenCalled();
      expect(mockConfig.onArcballToggle).not.toHaveBeenCalled();
    });

    it('should handle direct handleClick call', () => {
      const button = document.createElement('button');
      button.dataset.wgpuAction = 'debug';
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: button });

      handler.handleClick(event);
      expect(mockConfig.onDebugToggle).toHaveBeenCalled();
    });
  });
});
