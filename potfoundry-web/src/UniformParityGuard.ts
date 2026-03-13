/**
 * UniformParityGuard — Camera uniform buffer rewrite state tracking
 *
 * Extracted from webgpu_core.ts Phase 13.
 * Tracks when the uniform buffer needs to be rewritten due to camera parity changes
 * (e.g., when the camera basis flips orientation relative to the overlay projection).
 *
 * @module UniformParityGuard
 */

import type { WebGPUState } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Extended WebGPU state with uniform parity tracking field.
 * Uses optional internal flag to track pending rewrite needs.
 */
export type UniformParityState = WebGPUState & {
  /** Internal flag indicating uniform buffer needs rewrite */
  __pendingUniformParityRewrite?: boolean;
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Mark the uniform buffer as needing a rewrite due to parity change.
 * Also sets cameraDirty to ensure the camera is recalculated.
 *
 * @param state - WebGPU state to mark
 */
export const markUniformParityRewriteNeeded = (state: WebGPUState): void => {
  const target = state as UniformParityState;
  target.__pendingUniformParityRewrite = true;
  state.cameraDirty = true;
};

/**
 * Check if a uniform parity rewrite is pending.
 *
 * @param state - WebGPU state to check
 * @returns true if a rewrite is pending
 */
export const isUniformParityRewritePending = (state: WebGPUState): boolean => {
  return Boolean((state as UniformParityState).__pendingUniformParityRewrite);
};

/**
 * Clear the uniform parity rewrite flag.
 * Call this after the uniform buffer has been rewritten.
 *
 * @param state - WebGPU state to clear
 */
export const clearUniformParityRewriteFlag = (state: WebGPUState): void => {
  const target = state as UniformParityState;
  if (target.__pendingUniformParityRewrite) {
    target.__pendingUniformParityRewrite = false;
  }
};
