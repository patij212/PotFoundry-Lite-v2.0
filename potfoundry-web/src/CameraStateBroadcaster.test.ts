/**
 * Tests for CameraStateBroadcaster module
 *
 * Validates camera state broadcasting functionality:
 * - Snapshot building
 * - Snapshot comparison with epsilon tolerance
 * - Debounced emission
 * - Timer management
 *
 * @module CameraStateBroadcaster.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCameraStateBroadcaster,
  type CameraBroadcastStateSlice,
  type CameraBroadcasterConfig,
  type CameraStateBroadcaster,
} from './CameraStateBroadcaster';
import { CAMERA_EPSILON, CAMERA_BROADCAST_MS } from './camera_constants';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockState(): CameraBroadcastStateSlice {
  return {
    rotX: 0.5,
    rotY: 1.0,
    zoom: 2.0,
    panX: 0,
    panY: 0,
    autoRotate: false,
    sceneRadius: 50,
    projectionMode: 'perspective',
    cameraMode: 'turntable',
    pivot: [0, 0, 25],
    cameraDirty: true,
    lastCameraPush: 0,
  };
}

function createMockConfig(
  state: CameraBroadcastStateSlice,
  overrides: Partial<CameraBroadcasterConfig> = {}
): CameraBroadcasterConfig {
  return {
    getState: () => state,
    updateState: (updates) => Object.assign(state, updates),
    getEyePosition: () => [0, -100, 25],
    emit: vi.fn(),
    emitDiagnostic: vi.fn(),
    canvasId: 'test-canvas',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('CameraStateBroadcaster', () => {
  let state: CameraBroadcastStateSlice;
  let config: CameraBroadcasterConfig;
  let broadcaster: CameraStateBroadcaster;

  beforeEach(() => {
    vi.useFakeTimers();
    state = createMockState();
    config = createMockConfig(state);
    broadcaster = createCameraStateBroadcaster(config);
  });

  afterEach(() => {
    broadcaster.dispose();
    vi.useRealTimers();
  });

  // --------------------------------------------------------------------------
  // Factory Creation
  // --------------------------------------------------------------------------

  describe('factory creation', () => {
    it('creates broadcaster with required config', () => {
      expect(broadcaster).toBeDefined();
      expect(broadcaster.buildSnapshot).toBeInstanceOf(Function);
      expect(broadcaster.emit).toBeInstanceOf(Function);
      expect(broadcaster.dispose).toBeInstanceOf(Function);
    });

    it('initializes with zero sequence', () => {
      expect(broadcaster.getSequence()).toBe(0);
    });

    it('initializes with null last snapshot', () => {
      expect(broadcaster.getLastSnapshot()).toBeNull();
    });

    it('initializes with no pending static emit', () => {
      expect(broadcaster.isPendingStaticEmit()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Snapshot Building
  // --------------------------------------------------------------------------

  describe('buildSnapshot', () => {
    it('builds snapshot from current state', () => {
      const snapshot = broadcaster.buildSnapshot();

      expect(snapshot.rotX).toBe(0.5);
      expect(snapshot.rotY).toBe(1.0);
      expect(snapshot.zoom).toBe(2.0);
      expect(snapshot.panX).toBe(0);
      expect(snapshot.panY).toBe(0);
      expect(snapshot.autoRotate).toBe(false);
      expect(snapshot.sceneRadius).toBe(50);
      expect(snapshot.projection).toBe('perspective');
      expect(snapshot.cameraMode).toBe('turntable');
      expect(snapshot.pivot).toEqual([0, 0, 25]);
    });

    it('includes eye position from getEyePosition', () => {
      const snapshot = broadcaster.buildSnapshot();
      expect(snapshot.eye).toEqual([0, -100, 25]);
    });

    it('creates new array for pivot (no mutation)', () => {
      const snapshot = broadcaster.buildSnapshot();
      snapshot.pivot[0] = 999;
      expect(state.pivot[0]).toBe(0); // Original unchanged
    });

    it('reflects state changes', () => {
      state.rotX = 1.5;
      state.zoom = 3.0;
      state.projectionMode = 'ortho';

      const snapshot = broadcaster.buildSnapshot();

      expect(snapshot.rotX).toBe(1.5);
      expect(snapshot.zoom).toBe(3.0);
      expect(snapshot.projection).toBe('ortho');
    });
  });

  // --------------------------------------------------------------------------
  // Snapshot Comparison
  // --------------------------------------------------------------------------

  describe('snapshotsEqual', () => {
    it('returns false for null previous snapshot', () => {
      const snapshot = broadcaster.buildSnapshot();
      expect(broadcaster.snapshotsEqual(null, snapshot)).toBe(false);
    });

    it('returns true for identical snapshots', () => {
      const snapshot1 = broadcaster.buildSnapshot();
      const snapshot2 = broadcaster.buildSnapshot();
      expect(broadcaster.snapshotsEqual(snapshot1, snapshot2)).toBe(true);
    });

    it('returns true for snapshots within epsilon', () => {
      const snapshot1 = broadcaster.buildSnapshot();
      state.rotX += CAMERA_EPSILON * 0.5;
      const snapshot2 = broadcaster.buildSnapshot();
      expect(broadcaster.snapshotsEqual(snapshot1, snapshot2)).toBe(true);
    });

    it('returns false for snapshots beyond epsilon', () => {
      const snapshot1 = broadcaster.buildSnapshot();
      state.rotX += CAMERA_EPSILON * 2;
      const snapshot2 = broadcaster.buildSnapshot();
      expect(broadcaster.snapshotsEqual(snapshot1, snapshot2)).toBe(false);
    });

    it('returns false for different autoRotate', () => {
      const snapshot1 = broadcaster.buildSnapshot();
      state.autoRotate = true;
      const snapshot2 = broadcaster.buildSnapshot();
      expect(broadcaster.snapshotsEqual(snapshot1, snapshot2)).toBe(false);
    });

    it('returns false for different projection', () => {
      const snapshot1 = broadcaster.buildSnapshot();
      state.projectionMode = 'ortho';
      const snapshot2 = broadcaster.buildSnapshot();
      expect(broadcaster.snapshotsEqual(snapshot1, snapshot2)).toBe(false);
    });

    it('returns false for different cameraMode', () => {
      const snapshot1 = broadcaster.buildSnapshot();
      state.cameraMode = 'arcball';
      const snapshot2 = broadcaster.buildSnapshot();
      expect(broadcaster.snapshotsEqual(snapshot1, snapshot2)).toBe(false);
    });

    it('checks all numeric fields within epsilon', () => {
      const snapshot1 = broadcaster.buildSnapshot();

      // Test each numeric field independently
      const fields = ['rotX', 'rotY', 'zoom', 'panX', 'panY', 'sceneRadius'] as const;
      for (const field of fields) {
        const s2 = { ...snapshot1 };
        s2[field] = snapshot1[field] + CAMERA_EPSILON * 2;
        expect(broadcaster.snapshotsEqual(snapshot1, s2)).toBe(false);
      }
    });

    it('checks pivot vector elements within epsilon', () => {
      const snapshot1 = broadcaster.buildSnapshot();

      for (let i = 0; i < 3; i++) {
        const s2 = { ...snapshot1, pivot: [...snapshot1.pivot] as [number, number, number] };
        s2.pivot[i] = snapshot1.pivot[i] + CAMERA_EPSILON * 2;
        expect(broadcaster.snapshotsEqual(snapshot1, s2)).toBe(false);
      }
    });

    it('checks eye vector elements within epsilon', () => {
      const snapshot1 = broadcaster.buildSnapshot();

      for (let i = 0; i < 3; i++) {
        const s2 = { ...snapshot1, eye: [...snapshot1.eye] as [number, number, number] };
        s2.eye[i] = snapshot1.eye[i] + CAMERA_EPSILON * 2;
        expect(broadcaster.snapshotsEqual(snapshot1, s2)).toBe(false);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Emission
  // --------------------------------------------------------------------------

  describe('emit', () => {
    it('emits camera state when forced', () => {
      broadcaster.emit(true);

      expect(config.emit).toHaveBeenCalledTimes(1);
      expect(config.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'cameraState',
          payload: expect.objectContaining({
            rotX: 0.5,
            rotY: 1.0,
            zoom: 2.0,
            timestamp: expect.any(Number),
            seq: 1,
          }),
        })
      );
    });

    it('increments sequence on each emit', () => {
      broadcaster.emit(true);
      expect(broadcaster.getSequence()).toBe(1);

      state.rotX = 1.0; // Change state
      broadcaster.emit(true);
      expect(broadcaster.getSequence()).toBe(2);
    });

    it('stores last snapshot after emit', () => {
      broadcaster.emit(true);
      const last = broadcaster.getLastSnapshot();

      expect(last).not.toBeNull();
      expect(last?.rotX).toBe(0.5);
    });

    it('clears cameraDirty after emit', () => {
      state.cameraDirty = true;
      broadcaster.emit(true);
      expect(state.cameraDirty).toBe(false);
    });

    it('updates lastCameraPush after emit', () => {
      const before = state.lastCameraPush;
      vi.advanceTimersByTime(100);
      broadcaster.emit(true);
      expect(state.lastCameraPush).toBeGreaterThan(before);
    });

    it('skips emit when not dirty and not forced', () => {
      state.cameraDirty = false;
      broadcaster.emit(false);
      expect(config.emit).not.toHaveBeenCalled();
    });

    it('skips emit when within debounce window and not forced', () => {
      state.lastCameraPush = performance.now() - 10; // Recent push
      broadcaster.emit(false);
      expect(config.emit).not.toHaveBeenCalled();
    });

    it('skips emit when snapshot unchanged and not forced', () => {
      // First emit to set lastSnapshot
      broadcaster.emit(true);
      expect(config.emit).toHaveBeenCalledTimes(1);

      // Second emit with same state (not forced)
      state.cameraDirty = true;
      state.lastCameraPush = 0; // Clear debounce
      broadcaster.emit(false);

      // Should skip because snapshot unchanged
      expect(config.emit).toHaveBeenCalledTimes(1);
    });

    it('emits when snapshot changed even if not forced', () => {
      // First emit
      broadcaster.emit(true);
      expect(config.emit).toHaveBeenCalledTimes(1);

      // Change state and emit - advance time past debounce window
      state.rotX = 2.0;
      state.cameraDirty = true;
      vi.advanceTimersByTime(CAMERA_BROADCAST_MS + 10);
      broadcaster.emit(false);

      expect(config.emit).toHaveBeenCalledTimes(2);
    });

    it('clears pending static emit flag', () => {
      broadcaster.requestEmitWhenStatic();
      expect(broadcaster.isPendingStaticEmit()).toBe(true);

      broadcaster.emit(true);
      expect(broadcaster.isPendingStaticEmit()).toBe(false);
    });

    it('handles null emit callback gracefully', () => {
      const nullConfig = createMockConfig(state, { emit: null });
      const nullBroadcaster = createCameraStateBroadcaster(nullConfig);

      expect(() => nullBroadcaster.emit(true)).not.toThrow();
      nullBroadcaster.dispose();
    });
  });

  // --------------------------------------------------------------------------
  // Timer Management
  // --------------------------------------------------------------------------

  describe('scheduleEmit', () => {
    it('schedules emit after default delay', () => {
      broadcaster.scheduleEmit();
      expect(config.emit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(CAMERA_BROADCAST_MS);
      expect(config.emit).toHaveBeenCalledTimes(1);
    });

    it('schedules emit after custom delay', () => {
      broadcaster.scheduleEmit(500);
      expect(config.emit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(499);
      expect(config.emit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(config.emit).toHaveBeenCalledTimes(1);
    });

    it('cancels previous scheduled emit', () => {
      broadcaster.scheduleEmit(100);
      broadcaster.scheduleEmit(200); // Should cancel first

      vi.advanceTimersByTime(100);
      expect(config.emit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(config.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelScheduledEmit', () => {
    it('cancels pending scheduled emit', () => {
      broadcaster.scheduleEmit(100);
      broadcaster.cancelScheduledEmit();

      vi.advanceTimersByTime(200);
      expect(config.emit).not.toHaveBeenCalled();
    });

    it('is safe to call when no emit scheduled', () => {
      expect(() => broadcaster.cancelScheduledEmit()).not.toThrow();
    });
  });

  describe('requestEmitWhenStatic', () => {
    it('sets pending static emit flag', () => {
      expect(broadcaster.isPendingStaticEmit()).toBe(false);
      broadcaster.requestEmitWhenStatic();
      expect(broadcaster.isPendingStaticEmit()).toBe(true);
    });

    it('cancels any scheduled emit', () => {
      broadcaster.scheduleEmit(100);
      broadcaster.requestEmitWhenStatic();

      vi.advanceTimersByTime(200);
      expect(config.emit).not.toHaveBeenCalled();
    });
  });

  describe('clearPendingStaticEmit', () => {
    it('clears pending flag', () => {
      broadcaster.requestEmitWhenStatic();
      expect(broadcaster.isPendingStaticEmit()).toBe(true);

      broadcaster.clearPendingStaticEmit();
      expect(broadcaster.isPendingStaticEmit()).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Diagnostics
  // --------------------------------------------------------------------------

  describe('diagnostics', () => {
    it('emits diagnostic on forced emit', () => {
      // Advance time past diagnostic throttle to ensure first emit fires
      vi.advanceTimersByTime(600);
      broadcaster.emit(true);
      expect(config.emitDiagnostic).toHaveBeenCalledWith(
        'component:camera-state',
        expect.objectContaining({
          ts: expect.any(Number),
          seq: 1,
          rotX: 0.5,
          rotY: 1.0,
          zoom: 2.0,
          canvasId: 'test-canvas',
        })
      );
    });

    it('throttles diagnostic emissions', () => {
      // Advance time to allow first diagnostic
      vi.advanceTimersByTime(600);
      broadcaster.emit(true);
      expect(config.emitDiagnostic).toHaveBeenCalledTimes(1);

      // Emit again immediately (within throttle window)
      state.rotX = 1.0;
      broadcaster.emit(true);

      // Diagnostic should be throttled
      expect(config.emitDiagnostic).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // Disposal
  // --------------------------------------------------------------------------

  describe('dispose', () => {
    it('cancels scheduled emit', () => {
      broadcaster.scheduleEmit(100);
      broadcaster.dispose();

      vi.advanceTimersByTime(200);
      expect(config.emit).not.toHaveBeenCalled();
    });

    it('prevents new emissions after dispose', () => {
      broadcaster.dispose();
      broadcaster.emit(true);
      expect(config.emit).not.toHaveBeenCalled();
    });

    it('prevents scheduling after dispose', () => {
      broadcaster.dispose();
      broadcaster.scheduleEmit(100);

      vi.advanceTimersByTime(200);
      expect(config.emit).not.toHaveBeenCalled();
    });

    it('is safe to call multiple times', () => {
      expect(() => {
        broadcaster.dispose();
        broadcaster.dispose();
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases
  // --------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles zero pivot values', () => {
      state.pivot = [0, 0, 0];
      const snapshot = broadcaster.buildSnapshot();
      expect(snapshot.pivot).toEqual([0, 0, 0]);
    });

    it('handles negative values', () => {
      state.rotX = -1.5;
      state.panX = -10;
      state.pivot = [-5, -5, -5];

      const snapshot = broadcaster.buildSnapshot();

      expect(snapshot.rotX).toBe(-1.5);
      expect(snapshot.panX).toBe(-10);
      expect(snapshot.pivot).toEqual([-5, -5, -5]);
    });

    it('handles arcball camera mode', () => {
      state.cameraMode = 'arcball';
      const snapshot = broadcaster.buildSnapshot();
      expect(snapshot.cameraMode).toBe('arcball');
    });

    it('handles free camera mode', () => {
      state.cameraMode = 'free';
      const snapshot = broadcaster.buildSnapshot();
      expect(snapshot.cameraMode).toBe('free');
    });

    it('handles ortho projection', () => {
      state.projectionMode = 'ortho';
      const snapshot = broadcaster.buildSnapshot();
      expect(snapshot.projection).toBe('ortho');
    });

    it('handles emit callback errors gracefully', () => {
      const errorConfig = createMockConfig(state, {
        emit: vi.fn(() => {
          throw new Error('Emit failed');
        }),
      });
      const errorBroadcaster = createCameraStateBroadcaster(errorConfig);

      // Should not throw
      expect(() => errorBroadcaster.emit(true)).not.toThrow();
      errorBroadcaster.dispose();
    });
  });
});
