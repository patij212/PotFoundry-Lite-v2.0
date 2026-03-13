/**
 * Tests for UniformParityGuard module
 * @module UniformParityGuard.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  markUniformParityRewriteNeeded,
  isUniformParityRewritePending,
  clearUniformParityRewriteFlag,
  type UniformParityState,
} from './UniformParityGuard';
import type { WebGPUState } from './types';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create minimal mock WebGPU state for testing */
function createMockState(): WebGPUState {
  return {
    panX: 0,
    panY: 0,
    zoom: 1,
    orbitZoom: 1,
    autoRotate: false,
    autoRotateSpeed: 0.5,
    autoRotateResumeAt: 0,
    cameraMode: 'turntable',
    camRight: [1, 0, 0],
    camUp: [0, 0, 1],
    camForward: [0, -1, 0],
    camQuat: [0, 0, 0, 1],
    rotX: 0,
    rotY: 0,
    sceneRadius: 1,
    inertiaArcAxis: null,
    inertiaArcSpeed: 0,
    inertiaRotX: 0,
    inertiaRotY: 0,
    inertiaPanX: 0,
    inertiaPanY: 0,
    pivot: [0, 0, 0],
    freePosition: [0, 2, 0],
    freeSpeed: 1,
    interacting: false,
    lastInteraction: 0,
    cameraDirty: false,
    projectionMode: 'perspective',
    lastCameraPush: 0,
    lastParamUpdate: 0,
    lastParamNonce: null,
    recentParamUpdate: false,
    interactiveLodRatio: 1,
    canvasAspect: 1,
  } as WebGPUState;
}

// ============================================================================
// Tests
// ============================================================================

describe('UniformParityGuard', () => {
  let state: WebGPUState;

  beforeEach(() => {
    state = createMockState();
  });

  describe('markUniformParityRewriteNeeded', () => {
    it('sets the pending rewrite flag', () => {
      expect(isUniformParityRewritePending(state)).toBe(false);
      
      markUniformParityRewriteNeeded(state);
      
      expect(isUniformParityRewritePending(state)).toBe(true);
    });

    it('sets cameraDirty to true', () => {
      state.cameraDirty = false;
      
      markUniformParityRewriteNeeded(state);
      
      expect(state.cameraDirty).toBe(true);
    });

    it('can be called multiple times safely', () => {
      markUniformParityRewriteNeeded(state);
      markUniformParityRewriteNeeded(state);
      markUniformParityRewriteNeeded(state);
      
      expect(isUniformParityRewritePending(state)).toBe(true);
      expect(state.cameraDirty).toBe(true);
    });
  });

  describe('isUniformParityRewritePending', () => {
    it('returns false for fresh state', () => {
      expect(isUniformParityRewritePending(state)).toBe(false);
    });

    it('returns true after marking', () => {
      markUniformParityRewriteNeeded(state);
      expect(isUniformParityRewritePending(state)).toBe(true);
    });

    it('returns false after clearing', () => {
      markUniformParityRewriteNeeded(state);
      clearUniformParityRewriteFlag(state);
      expect(isUniformParityRewritePending(state)).toBe(false);
    });

    it('handles undefined internal flag gracefully', () => {
      // State without the internal field
      const plainState = { ...state };
      expect(isUniformParityRewritePending(plainState)).toBe(false);
    });
  });

  describe('clearUniformParityRewriteFlag', () => {
    it('clears the pending rewrite flag', () => {
      markUniformParityRewriteNeeded(state);
      expect(isUniformParityRewritePending(state)).toBe(true);
      
      clearUniformParityRewriteFlag(state);
      
      expect(isUniformParityRewritePending(state)).toBe(false);
    });

    it('can be called when flag is not set', () => {
      expect(() => clearUniformParityRewriteFlag(state)).not.toThrow();
      expect(isUniformParityRewritePending(state)).toBe(false);
    });

    it('can be called multiple times safely', () => {
      markUniformParityRewriteNeeded(state);
      clearUniformParityRewriteFlag(state);
      clearUniformParityRewriteFlag(state);
      clearUniformParityRewriteFlag(state);
      
      expect(isUniformParityRewritePending(state)).toBe(false);
    });

    it('does not affect cameraDirty', () => {
      markUniformParityRewriteNeeded(state);
      expect(state.cameraDirty).toBe(true);
      
      clearUniformParityRewriteFlag(state);
      
      // cameraDirty is set by mark, but clear does not reset it
      // (that's intentional - cameraDirty has broader scope)
      expect(state.cameraDirty).toBe(true);
    });
  });

  describe('state isolation', () => {
    it('operates independently on different state objects', () => {
      const state1 = createMockState();
      const state2 = createMockState();
      
      markUniformParityRewriteNeeded(state1);
      
      expect(isUniformParityRewritePending(state1)).toBe(true);
      expect(isUniformParityRewritePending(state2)).toBe(false);
    });

    it('marks internal property on the state object', () => {
      markUniformParityRewriteNeeded(state);
      
      const parityState = state as UniformParityState;
      expect(parityState.__pendingUniformParityRewrite).toBe(true);
    });
  });
});
