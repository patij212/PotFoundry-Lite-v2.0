/**
 * MathHelpers — Pure math utilities for WebGPU core.
 *
 * Extracted from webgpu_core.ts Phase 7 decomposition.
 * All functions are pure (no state, no closures) and easily unit-testable.
 *
 * @module MathHelpers
 */

// ============================================================================
// Zoom Constants
// ============================================================================

/**
 * Minimum zoom value for UI zoom clamping.
 * Note: Different from camera_constants.ts MIN_ZOOM (0.1) which is an absolute camera limit.
 */
export const ZOOM_CLAMP_MIN = 0.25;

/**
 * Maximum zoom value for UI zoom clamping.
 * Note: Different from camera_constants.ts MAX_ZOOM (50.0) which is an absolute camera limit.
 */
export const ZOOM_CLAMP_MAX = 4.0;

// ============================================================================
// Angle Normalization
// ============================================================================

/**
 * Normalize an angle to the range (-π, π].
 *
 * @param v - Angle in radians
 * @returns Normalized angle in (-π, π]
 */
export const wrapAngle = (v: number): number => {
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v <= -Math.PI) v += 2 * Math.PI;
  return v;
};

/**
 * Normalize an angle to the range (-π, π] using modulo.
 *
 * Similar to wrapAngle but uses modulo for potentially large values.
 *
 * @param v - Angle in radians
 * @returns Normalized angle in (-π, π]
 */
export const wrapTau = (v: number): number => {
  const twoPi = 2 * Math.PI;
  let r = v % twoPi;
  if (r > Math.PI) r -= twoPi;
  if (r <= -Math.PI) r += twoPi;
  return r;
};

// ============================================================================
// Zoom Utilities
// ============================================================================

/**
 * Clamp a zoom value to valid bounds.
 *
 * @param v - Raw zoom value
 * @returns Clamped zoom in [ZOOM_CLAMP_MIN, ZOOM_CLAMP_MAX], or 1.0 if invalid
 */
export const clampZoomValue = (v: number): number => {
  if (!Number.isFinite(v)) return 1.0;
  return Math.max(ZOOM_CLAMP_MIN, Math.min(ZOOM_CLAMP_MAX, v));
};

// ============================================================================
// Matrix Utilities
// ============================================================================

/**
 * Multiply a 4x4 matrix by a vec3 (with w=1), returning all 4 clip-space components.
 *
 * This is the "full" version that returns {x, y, z, w} for NDC conversion.
 * Distinct from AxisOverlay's version which returns only {x, y, w}.
 *
 * @param m - 4x4 column-major matrix as Float32Array
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns Clip-space coordinates {x, y, z, w}
 */
export const mulMat4Vec4Full = (
  m: Float32Array,
  x: number,
  y: number,
  z: number
): { x: number; y: number; z: number; w: number } => {
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
  const cz = m[2] * x + m[6] * y + m[10] * z + m[14] * 1;
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
  return { x: cx, y: cy, z: cz, w: cw };
};
