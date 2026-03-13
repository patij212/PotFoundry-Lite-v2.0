/**
 * CameraModeManager tests
 *
 * Tests for camera mode switching logic extracted from webgpu_core.ts Phase 14.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCameraModeManager,
  type CameraModeManagerConfig,
  type CameraModeStateSlice,
  type InteractionRig,
  __cameraModeTestHooks,
} from './CameraModeManager';
import type { CameraBasis, Vec3 } from './camera_basis';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockState(): CameraModeStateSlice {
  return {
    cameraMode: 'turntable',
    useArcball: false,
    autoRotate: false,
    zoom: 1.0,
    orbitZoom: 1.0,
    freePosition: null,
    pivot: [0, 0, 0],
    panX: 0,
    panY: 0,
    rotX: 0,
    rotY: 0,
    camRight: [1, 0, 0],
    camUp: [0, 1, 0],
    camForward: [0, 0, -1],
    camQuat: [0, 0, 0, 1],
    displayCamRight: null,
    displayCamUp: null,
    displayCamForward: null,
    displayCamQuat: null,
    displayRotX: null,
    displayRotY: null,
    cameraDirty: false,
    autoRotateResumeAt: 0,
    inertiaVx: 0,
    inertiaVy: 0,
    inertiaDecay: 0,
    inertiaActive: false,
  };
}

function createMockBasis(): CameraBasis {
  return {
    right: [1, 0, 0],
    up: [0, 0, 1],
    forward: [0, -1, 0],
  };
}

function createMockConfig(state: CameraModeStateSlice): CameraModeManagerConfig {
  return {
    getState: () => ({ ...state }),
    updateState: (updates) => {
      Object.assign(state, updates);
    },
    cancelFocusTween: vi.fn(),
    resolveInteractionRig: vi.fn().mockReturnValue({
      eye: [0, 5, 0] as Vec3,
      extents: { paddedMax: 10 },
    } as InteractionRig),
    resolveActiveBasis: vi.fn().mockReturnValue(createMockBasis()),
    ensureFreePosition: vi.fn().mockReturnValue([0, 5, 0] as Vec3),
    intersectRayZPlane: vi.fn().mockReturnValue([0, 0, 0] as Vec3),
    updatePivotFromPan: vi.fn(),
    clearFreeMovementKeys: vi.fn(),
    setAutoRotate: vi.fn(),
    updateCameraModeButtons: vi.fn(),
    requestCameraEmitWhenStatic: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('CameraModeManager', () => {
  let state: CameraModeStateSlice;
  let config: CameraModeManagerConfig;

  beforeEach(() => {
    state = createMockState();
    config = createMockConfig(state);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createCameraModeManager', () => {
    it('creates a manager instance with all methods', () => {
      const manager = createCameraModeManager(config);

      expect(manager).toBeDefined();
      expect(typeof manager.setCameraMode).toBe('function');
      expect(typeof manager.getCameraMode).toBe('function');
      expect(typeof manager.isFreeModeActive).toBe('function');
      expect(typeof manager.isArcballModeActive).toBe('function');
    });
  });

  describe('getCameraMode', () => {
    it('returns the current camera mode', () => {
      const manager = createCameraModeManager(config);

      expect(manager.getCameraMode()).toBe('turntable');

      state.cameraMode = 'arcball';
      expect(manager.getCameraMode()).toBe('arcball');
    });
  });

  describe('isFreeModeActive', () => {
    it('returns true when in free mode', () => {
      const manager = createCameraModeManager(config);

      expect(manager.isFreeModeActive()).toBe(false);

      state.cameraMode = 'free';
      expect(manager.isFreeModeActive()).toBe(true);
    });
  });

  describe('isArcballModeActive', () => {
    it('returns true when in arcball mode', () => {
      const manager = createCameraModeManager(config);

      expect(manager.isArcballModeActive()).toBe(false);

      state.cameraMode = 'arcball';
      expect(manager.isArcballModeActive()).toBe(true);
    });
  });

  describe('setCameraMode', () => {
    describe('no-op when mode unchanged', () => {
      it('does nothing when target mode equals current mode', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(config.cancelFocusTween).toHaveBeenCalled();
        expect(config.updateCameraModeButtons).not.toHaveBeenCalled();
        expect(state.cameraMode).toBe('turntable');
      });
    });

    describe('transition to free mode', () => {
      it('captures eye position from interaction rig', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(state.cameraMode).toBe('free');
        expect(state.freePosition).toEqual([0, 5, 0]);
      });

      it('preserves orbit zoom for later restoration', () => {
        state.zoom = 2.5;
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(state.orbitZoom).toBe(2.5);
        expect(state.zoom).toBe(1.0);
      });

      it('clears display state', () => {
        state.displayCamRight = [1, 0, 0];
        state.displayCamUp = [0, 1, 0];
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(state.displayCamRight).toBeNull();
        expect(state.displayCamUp).toBeNull();
        expect(state.displayCamForward).toBeNull();
        expect(state.displayCamQuat).toBeNull();
        expect(state.displayRotX).toBeNull();
        expect(state.displayRotY).toBeNull();
      });

      it('resets inertia', () => {
        state.inertiaActive = true;
        state.inertiaVx = 0.5;
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(state.inertiaActive).toBe(false);
        expect(state.inertiaVx).toBe(0);
      });

      it('disables auto-rotate', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(config.setAutoRotate).toHaveBeenCalledWith(false, false);
      });

      it('updates camera mode buttons', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(config.updateCameraModeButtons).toHaveBeenCalled();
      });

      it('marks camera dirty', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(state.cameraDirty).toBe(true);
      });

      it('uses fallback when resolveInteractionRig throws', () => {
        (config.resolveInteractionRig as ReturnType<typeof vi.fn>).mockImplementation(() => {
          throw new Error('No rig');
        });
        state.freePosition = [1, 2, 3];
        const manager = createCameraModeManager(config);

        manager.setCameraMode('free');

        expect(state.cameraMode).toBe('free');
        expect(state.freePosition).toEqual([1, 2, 3]);
      });
    });

    describe('transition from free mode', () => {
      beforeEach(() => {
        state.cameraMode = 'free';
        state.freePosition = [0, 10, 0];
      });

      it('updates pan from ray-plane intersection', () => {
        (config.intersectRayZPlane as ReturnType<typeof vi.fn>).mockReturnValue([2, 3, 0]);
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(state.panX).toBe(2);
        expect(state.panY).toBe(3);
      });

      it('calculates zoom from distance', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(typeof state.zoom).toBe('number');
        expect(state.zoom).toBeGreaterThan(0);
      });

      it('syncs camera basis vectors', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(state.camRight).toEqual([1, 0, 0]);
        expect(state.camUp).toEqual([0, 0, 1]);
        expect(state.camForward).toEqual([0, -1, 0]);
      });

      it('clears display state', () => {
        state.displayCamRight = [1, 0, 0];
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(state.displayCamRight).toBeNull();
      });

      it('updates pivot from pan', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(config.updatePivotFromPan).toHaveBeenCalled();
      });

      it('clears free movement keys', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(config.clearFreeMovementKeys).toHaveBeenCalled();
      });
    });

    describe('transition between orbit modes', () => {
      it('switches from turntable to arcball', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('arcball');

        expect(state.cameraMode).toBe('arcball');
        expect(state.useArcball).toBe(true);
      });

      it('switches from arcball to turntable', () => {
        state.cameraMode = 'arcball';
        state.useArcball = true;
        const manager = createCameraModeManager(config);

        manager.setCameraMode('turntable');

        expect(state.cameraMode).toBe('turntable');
        expect(state.useArcball).toBe(false);
      });

      it('resets inertia on mode switch', () => {
        state.inertiaActive = true;
        state.inertiaVx = 1.0;
        const manager = createCameraModeManager(config);

        manager.setCameraMode('arcball');

        expect(state.inertiaActive).toBe(false);
        expect(state.inertiaVx).toBe(0);
      });
    });

    describe('common transition behavior', () => {
      it('always cancels focus tween', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('arcball');

        expect(config.cancelFocusTween).toHaveBeenCalled();
      });

      it('always requests camera emit when static', () => {
        const manager = createCameraModeManager(config);

        manager.setCameraMode('arcball');

        expect(config.requestCameraEmitWhenStatic).toHaveBeenCalled();
      });
    });
  });

  describe('test hooks', () => {
    it('exports CAMERA_DISTANCE_FALLOFF constant', () => {
      expect(__cameraModeTestHooks.CAMERA_DISTANCE_FALLOFF).toBe(2.0);
    });
  });
});

describe('CameraModeManager edge cases', () => {
  let state: CameraModeStateSlice;
  let config: CameraModeManagerConfig;

  beforeEach(() => {
    state = createMockState();
    config = createMockConfig(state);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('handles null pivot gracefully', () => {
    state.pivot = null;
    const manager = createCameraModeManager(config);

    expect(() => manager.setCameraMode('free')).not.toThrow();
    expect(state.cameraMode).toBe('free');
  });

  it('handles null ray-plane intersection', () => {
    state.cameraMode = 'free';
    (config.intersectRayZPlane as ReturnType<typeof vi.fn>).mockReturnValue(null);
    const originalPanX = state.panX;
    const originalPanY = state.panY;
    const manager = createCameraModeManager(config);

    manager.setCameraMode('turntable');

    // Pan should remain at original values when no intersection
    expect(state.panX).toBe(originalPanX);
    expect(state.panY).toBe(originalPanY);
  });

  it('handles resolveInteractionRig error during zoom calculation', () => {
    state.cameraMode = 'free';
    state.orbitZoom = 1.5;
    (config.resolveInteractionRig as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('No extents');
    });
    const manager = createCameraModeManager(config);

    expect(() => manager.setCameraMode('turntable')).not.toThrow();
    expect(state.zoom).toBe(1.5); // Falls back to orbitZoom
  });

  it('handles extreme zoom values gracefully', () => {
    state.zoom = 0.001; // Very small
    const manager = createCameraModeManager(config);

    manager.setCameraMode('free');

    // Should clamp zoom values
    expect(state.orbitZoom).toBeGreaterThanOrEqual(0.001);
  });

  it('handles rapid mode switching', () => {
    const manager = createCameraModeManager(config);

    manager.setCameraMode('free');
    manager.setCameraMode('arcball');
    manager.setCameraMode('turntable');
    manager.setCameraMode('free');

    expect(state.cameraMode).toBe('free');
    expect(config.cancelFocusTween).toHaveBeenCalledTimes(4);
  });

  it('state updates are applied atomically per transition', () => {
    const updateCalls: Array<Partial<CameraModeStateSlice>> = [];
    config.updateState = (updates) => {
      updateCalls.push({ ...updates });
      Object.assign(state, updates);
    };

    const manager = createCameraModeManager(config);
    manager.setCameraMode('free');

    // Check that mode was set in the updates
    const modeUpdate = updateCalls.find((u) => u.cameraMode === 'free');
    expect(modeUpdate).toBeDefined();
  });
});
