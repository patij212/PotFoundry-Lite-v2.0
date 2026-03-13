/**
 * MatrixMath — Pure matrix mathematics utilities for WebGPU camera system.
 *
 * Extracted from webgpu_core.ts Phase 5 decomposition.
 * All functions are pure (no state, no closures) and easily unit-testable.
 *
 * Note: Functions return concrete Float32Array (not Mat4 union type) because
 * the camera system expects Float32Array specifically. The broader Mat4 type
 * (Float32Array | readonly tuple) is for uniform block interop only.
 *
 * @module MatrixMath
 */

import type { Vec3, CameraBasis } from './camera_basis';
import { vec3Dot } from './camera_basis';

// Accept broader Mat4 union as input, return concrete Float32Array
import type { Mat4 } from './UniformBlock';

/**
 * Build a view matrix from camera basis vectors and eye position.
 *
 * View matrix transforms world coords to camera space.
 * Camera axes form ROWS of the rotation part (stored as columns in column-major).
 * - Column 0 = [right.x, up.x, forward.x, 0]
 * - Column 1 = [right.y, up.y, forward.y, 0]
 * - Column 2 = [right.z, up.z, forward.z, 0]
 * - Column 3 = [-dot(right,eye), -dot(up,eye), -dot(forward,eye), 1]
 *
 * @param basis Camera basis vectors (right, up, forward)
 * @param eye Camera position in world space
 * @returns 4x4 view matrix as Float32Array
 */
export const viewMatrixFromBasis = (basis: CameraBasis, eye: Vec3): Float32Array => {
  const out = new Float32Array(16);
  out[0] = basis.right[0];
  out[1] = basis.up[0];
  out[2] = basis.forward[0];
  out[3] = 0;
  out[4] = basis.right[1];
  out[5] = basis.up[1];
  out[6] = basis.forward[1];
  out[7] = 0;
  out[8] = basis.right[2];
  out[9] = basis.up[2];
  out[10] = basis.forward[2];
  out[11] = 0;
  out[12] = -vec3Dot(basis.right, eye);
  out[13] = -vec3Dot(basis.up, eye);
  out[14] = -vec3Dot(basis.forward, eye);
  out[15] = 1;
  return out;
};

/**
 * Multiply two 4x4 matrices (column-major order).
 *
 * @param a Left matrix
 * @param b Right matrix
 * @returns Result matrix (a × b)
 */
export const mat4Multiply = (a: Mat4, b: Mat4): Float32Array => {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col += 1) {
    const bo = col * 4;
    const b0 = b[bo + 0];
    const b1 = b[bo + 1];
    const b2 = b[bo + 2];
    const b3 = b[bo + 3];
    out[bo + 0] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[bo + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[bo + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[bo + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
};

/**
 * Check if all 16 elements of a matrix are finite numbers.
 *
 * @param m Matrix to check
 * @returns true if all elements are finite, false if any NaN or Infinity
 */
export const matrixIsFinite = (m: Mat4): boolean => {
  for (let i = 0; i < 16; i += 1) {
    if (!Number.isFinite(m[i])) {
      return false;
    }
  }
  return true;
};

/**
 * Create a left-handed orthographic projection matrix.
 *
 * @param left Left clipping plane
 * @param right Right clipping plane
 * @param bottom Bottom clipping plane
 * @param top Top clipping plane
 * @param near Near clipping plane
 * @param far Far clipping plane
 * @returns 4x4 orthographic projection matrix
 */
export const mat4OrthoLH = (
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): Float32Array => {
  const out = new Float32Array(16);
  const lr = 1 / (right - left || 1);
  const bt = 1 / (top - bottom || 1);
  const nf = 1 / (far - near || 1);
  out[0] = 2 * lr;
  out[5] = 2 * bt;
  out[10] = nf;
  out[12] = -(right + left) * lr;
  out[13] = -(top + bottom) * bt;
  out[14] = -near * nf;
  out[15] = 1;
  return out;
};

/**
 * Create a left-handed perspective projection matrix from vertical FOV.
 *
 * @param fovY Vertical field of view in radians
 * @param aspect Aspect ratio (width / height)
 * @param near Near clipping plane
 * @param far Far clipping plane
 * @returns 4x4 perspective projection matrix
 */
export const mat4PerspectiveFovLH = (
  fovY: number,
  aspect: number,
  near: number,
  far: number
): Float32Array => {
  const out = new Float32Array(16);
  const f = 1 / Math.tan(Math.max(fovY * 0.5, 1e-4));
  const range = 1 / (far - near || 1);
  out[0] = f / Math.max(aspect, 1e-4);
  out[5] = f;
  out[10] = far * range;
  out[11] = 1;
  out[14] = -near * far * range;
  return out;
};
