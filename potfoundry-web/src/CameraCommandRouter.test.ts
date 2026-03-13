/**
 * @fileoverview Tests for CameraCommandRouter module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCameraCommandRouter,
  type CameraCommandRouterInstance,
  type CameraCommandRouterConfig,
} from './CameraCommandRouter';

describe('CameraCommandRouter', () => {
  let router: CameraCommandRouterInstance;
  let mockConfig: CameraCommandRouterConfig;

  beforeEach(() => {
    mockConfig = {
      onEmitState: vi.fn(),
      onViewPreset: vi.fn(),
      onCameraPayload: vi.fn(),
      onAutoRotate: vi.fn(),
      onProjection: vi.fn(),
      onCameraMode: vi.fn(),
      onGridToggle: vi.fn(),
      onAxisToggle: vi.fn(),
      onMarkInteraction: vi.fn(),
      emitDiagnostic: vi.fn(),
    };

    vi.clearAllMocks();
  });

  afterEach(() => {
    router?.dispose();
  });

  describe('createCameraCommandRouter', () => {
    it('should create a router with all required methods', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(router).toBeDefined();
      expect(typeof router.handleCommand).toBe('function');
      expect(typeof router.parseCommand).toBe('function');
      expect(typeof router.dispose).toBe('function');
    });
  });

  describe('.parseCommand()', () => {
    it('should parse JSON string commands', () => {
      router = createCameraCommandRouter(mockConfig);
      const result = router.parseCommand('{"preset":"top","zoom":1.5}');
      expect(result).toEqual({ preset: 'top', zoom: 1.5 });
    });

    it('should parse object commands', () => {
      router = createCameraCommandRouter(mockConfig);
      const result = router.parseCommand({ preset: 'top', zoom: 1.5 });
      expect(result).toEqual({ preset: 'top', zoom: 1.5 });
    });

    it('should return null for null input', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(router.parseCommand(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(router.parseCommand(undefined)).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(router.parseCommand('{invalid json}')).toBeNull();
    });

    it('should return null for non-object types', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(router.parseCommand(123)).toBeNull();
      expect(router.parseCommand(true)).toBeNull();
    });

    it('should extract all supported fields', () => {
      router = createCameraCommandRouter(mockConfig);
      const result = router.parseCommand({
        request: 'state',
        preset: 'top',
        viewPreset: 'front',
        action: 'fit',
        rotX: 0.5,
        rotY: 1.2,
        zoom: 2.0,
        panX: 10,
        panY: -5,
        force: true,
        autoRotate: true,
        projection: 'ortho',
        projectionMode: 'perspective',
        cameraMode: 'arcball',
        toggleGrid: true,
        toggleAxis: true,
      });

      expect(result).toEqual({
        request: 'state',
        preset: 'top',
        viewPreset: 'front',
        action: 'fit',
        rotX: 0.5,
        rotY: 1.2,
        zoom: 2.0,
        panX: 10,
        panY: -5,
        force: true,
        autoRotate: true,
        projection: 'ortho',
        projectionMode: 'perspective',
        cameraMode: 'arcball',
        toggleGrid: true,
        toggleAxis: true,
      });
    });
  });

  describe('.handleCommand() - state request', () => {
    it('should call onEmitState for request:state', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ request: 'state' });
      expect(mockConfig.onEmitState).toHaveBeenCalledTimes(1);
    });

    it('should call onEmitState for JSON string request:state', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand('{"request":"state"}');
      expect(mockConfig.onEmitState).toHaveBeenCalledTimes(1);
    });

    it('should not call other handlers for request:state', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ request: 'state' });
      expect(mockConfig.onViewPreset).not.toHaveBeenCalled();
      expect(mockConfig.onCameraPayload).not.toHaveBeenCalled();
      expect(mockConfig.onMarkInteraction).not.toHaveBeenCalled();
    });
  });

  describe('.handleCommand() - view presets', () => {
    it('should handle preset field', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ preset: 'top' });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('top');
    });

    it('should handle viewPreset field', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ viewPreset: 'front' });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('front');
    });

    it('should handle action field with valid preset', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ action: 'right' });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('right');
    });

    it('should normalize "reset" action to "fit"', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ action: 'reset' });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('fit');
    });

    it('should normalize "isometric" action to "iso"', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ action: 'isometric' });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('iso');
    });

    it('should normalize preset case', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ preset: 'TOP' });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('top');
    });

    it('should not call onMarkInteraction for presets', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ preset: 'top' });
      expect(mockConfig.onMarkInteraction).not.toHaveBeenCalled();
    });

    it('should ignore invalid presets', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ preset: 'invalid' });
      expect(mockConfig.onViewPreset).not.toHaveBeenCalled();
    });

    it('should prefer preset over action', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ preset: 'top', action: 'front' });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('top');
      expect(mockConfig.onViewPreset).toHaveBeenCalledTimes(1);
    });
  });

  describe('.handleCommand() - camera payload', () => {
    it('should handle rotX', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ rotX: 0.5 });
      expect(mockConfig.onCameraPayload).toHaveBeenCalledWith({ rotX: 0.5 }, false);
    });

    it('should handle rotY', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ rotY: 1.2 });
      expect(mockConfig.onCameraPayload).toHaveBeenCalledWith({ rotY: 1.2 }, false);
    });

    it('should handle zoom', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ zoom: 2.0 });
      expect(mockConfig.onCameraPayload).toHaveBeenCalledWith({ zoom: 2.0 }, false);
    });

    it('should handle panX and panY', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ panX: 10, panY: -5 });
      expect(mockConfig.onCameraPayload).toHaveBeenCalledWith({ panX: 10, panY: -5 }, false);
    });

    it('should handle multiple payload fields', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ rotX: 0.5, rotY: 1.2, zoom: 2.0 });
      expect(mockConfig.onCameraPayload).toHaveBeenCalledWith(
        { rotX: 0.5, rotY: 1.2, zoom: 2.0 },
        false
      );
    });

    it('should pass force flag', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ rotX: 0.5, force: true });
      expect(mockConfig.onCameraPayload).toHaveBeenCalledWith({ rotX: 0.5 }, true);
    });

    it('should call onMarkInteraction for payload updates', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ rotX: 0.5 });
      expect(mockConfig.onMarkInteraction).toHaveBeenCalledTimes(1);
    });

    it('should not call onCameraPayload without payload fields', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ autoRotate: true });
      expect(mockConfig.onCameraPayload).not.toHaveBeenCalled();
    });
  });

  describe('.handleCommand() - auto-rotate', () => {
    it('should handle autoRotate:true', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ autoRotate: true });
      expect(mockConfig.onAutoRotate).toHaveBeenCalledWith(true);
    });

    it('should handle autoRotate:false', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ autoRotate: false });
      expect(mockConfig.onAutoRotate).toHaveBeenCalledWith(false);
    });

    it('should call onMarkInteraction for autoRotate', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ autoRotate: true });
      expect(mockConfig.onMarkInteraction).toHaveBeenCalledTimes(1);
    });
  });

  describe('.handleCommand() - projection', () => {
    it('should handle projection:perspective', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ projection: 'perspective' });
      expect(mockConfig.onProjection).toHaveBeenCalledWith('perspective');
    });

    it('should handle projection:ortho', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ projection: 'ortho' });
      expect(mockConfig.onProjection).toHaveBeenCalledWith('ortho');
    });

    it('should default non-perspective to ortho', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ projection: 'orthographic' });
      expect(mockConfig.onProjection).toHaveBeenCalledWith('ortho');
    });

    it('should handle projectionMode alias', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ projectionMode: 'perspective' });
      expect(mockConfig.onProjection).toHaveBeenCalledWith('perspective');
    });
  });

  describe('.handleCommand() - camera mode', () => {
    it('should handle cameraMode:turntable', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ cameraMode: 'turntable' });
      expect(mockConfig.onCameraMode).toHaveBeenCalledWith('turntable');
    });

    it('should handle cameraMode:arcball', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ cameraMode: 'arcball' });
      expect(mockConfig.onCameraMode).toHaveBeenCalledWith('arcball');
    });

    it('should handle cameraMode:free', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ cameraMode: 'free' });
      expect(mockConfig.onCameraMode).toHaveBeenCalledWith('free');
    });

    it('should ignore invalid camera modes', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ cameraMode: 'invalid' });
      expect(mockConfig.onCameraMode).not.toHaveBeenCalled();
    });
  });

  describe('.handleCommand() - toggles', () => {
    it('should handle toggleGrid:true', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ toggleGrid: true });
      expect(mockConfig.onGridToggle).toHaveBeenCalledTimes(1);
    });

    it('should ignore toggleGrid:false', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ toggleGrid: false });
      expect(mockConfig.onGridToggle).not.toHaveBeenCalled();
    });

    it('should handle toggleAxis:true', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ toggleAxis: true });
      expect(mockConfig.onAxisToggle).toHaveBeenCalledTimes(1);
    });

    it('should ignore toggleAxis:false', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ toggleAxis: false });
      expect(mockConfig.onAxisToggle).not.toHaveBeenCalled();
    });
  });

  describe('.handleCommand() - combined commands', () => {
    it('should handle multiple command types', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({
        rotX: 0.5,
        autoRotate: true,
        projection: 'ortho',
      });
      expect(mockConfig.onCameraPayload).toHaveBeenCalledWith({ rotX: 0.5 }, false);
      expect(mockConfig.onAutoRotate).toHaveBeenCalledWith(true);
      expect(mockConfig.onProjection).toHaveBeenCalledWith('ortho');
    });

    it('should handle preset with other commands', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({
        preset: 'top',
        autoRotate: false,
      });
      expect(mockConfig.onViewPreset).toHaveBeenCalledWith('top');
      expect(mockConfig.onAutoRotate).toHaveBeenCalledWith(false);
      // Should not call markInteraction because preset was applied
      expect(mockConfig.onMarkInteraction).not.toHaveBeenCalled();
    });
  });

  describe('.handleCommand() - error handling', () => {
    it('should handle null gracefully', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(() => router.handleCommand(null)).not.toThrow();
    });

    it('should handle undefined gracefully', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(() => router.handleCommand(undefined)).not.toThrow();
    });

    it('should handle invalid JSON gracefully', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(() => router.handleCommand('{invalid}')).not.toThrow();
    });

    it('should handle callback errors gracefully', () => {
      mockConfig.onViewPreset = vi.fn(() => {
        throw new Error('onViewPreset error');
      });
      router = createCameraCommandRouter(mockConfig);
      expect(() => router.handleCommand({ preset: 'top' })).not.toThrow();
    });

    it('should continue processing after callback error', () => {
      mockConfig.onViewPreset = vi.fn(() => {
        throw new Error('onViewPreset error');
      });
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ preset: 'top', autoRotate: true });
      expect(mockConfig.onAutoRotate).toHaveBeenCalledWith(true);
    });
  });

  describe('.dispose()', () => {
    it('should prevent command handling after dispose', () => {
      router = createCameraCommandRouter(mockConfig);
      router.dispose();
      router.handleCommand({ preset: 'top' });
      expect(mockConfig.onViewPreset).not.toHaveBeenCalled();
    });

    it('should be safe to call multiple times', () => {
      router = createCameraCommandRouter(mockConfig);
      expect(() => {
        router.dispose();
        router.dispose();
        router.dispose();
      }).not.toThrow();
    });
  });

  describe('diagnostic emission', () => {
    it('should emit diagnostic for successful command', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ preset: 'top' });
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith(
        'camera-command:handled',
        expect.objectContaining({
          cameraMutated: true,
          wasPresetApplied: true,
        })
      );
    });

    it('should emit diagnostic for payload command', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand({ rotX: 0.5 });
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith(
        'camera-command:handled',
        expect.objectContaining({
          cameraMutated: true,
          hasPayload: true,
        })
      );
    });

    it('should emit diagnostic for parse failure', () => {
      router = createCameraCommandRouter(mockConfig);
      router.handleCommand('{invalid}');
      expect(mockConfig.emitDiagnostic).toHaveBeenCalledWith(
        'camera-command:parse-failed',
        expect.any(Object)
      );
    });
  });
});
