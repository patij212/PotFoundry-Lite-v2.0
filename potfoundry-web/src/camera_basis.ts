/* Shared camera basis helpers for WebGPU preview
 * Exports deterministic WORLD_UP-first basis math, rotation helpers,
 * and Euler-to-basis conversions so preview and component share logic.
 *
 * Developer note — yaw wrapping choices:
 * - Euler yaw is represented both as a wrapped 0..2π value for
 *   display continuity (used during transient user interactions) and as
 *   a canonical -π..π angle for committing/serializing state. The
 *   preview and component code use `wrapTau` for display continuity
 *   (preserving full-rotation continuity) and `wrapAngle` to map
 *   rotations into the -π..π range when comparing/committing.
 */

export type Vec3 = [number, number, number];
export type Quaternion = [number, number, number, number]; // x, y, z, w (vector, scalar)
export type CameraBasis = { right: Vec3; up: Vec3; forward: Vec3 };

export const WORLD_UP: Vec3 = [0, 0, 1];
export const PITCH_SOFT_LIMIT = Math.PI * 0.5 - 1e-3;
const EPS = 1e-6;
const QUAT_EPS = 1e-8;
export const QUAT_IDENTITY: Quaternion = [0, 0, 0, 1];

/** Type-safe Vec3 construction — eliminates `as Vec3` casts on array literals */
export const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

/** Type-safe Vec3 copy — eliminates `as Vec3` casts on spread copies */
export const copyVec3 = (v: Vec3): Vec3 => [v[0], v[1], v[2]];

/** Type-safe Quaternion copy — eliminates `as Quaternion` casts on spread copies */
export const copyQuat = (q: Quaternion): Quaternion => [q[0], q[1], q[2], q[3]];

export const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
export const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};
/** Dot product of two Vec3 vectors */
export const vec3Dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Subtract two Vec3 vectors: a - b */
export const vec3Subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vec3Cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const vec3Add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const wrapToPi = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const fullTurn = Math.PI * 2;
  let wrapped = value % fullTurn;
  if (wrapped > Math.PI) wrapped -= fullTurn;
  else if (wrapped < -Math.PI) wrapped += fullTurn;
  return wrapped;
};

// Quaternion helpers keep orientation math centralized for both preview targets.

export const normalizeQuaternion = (q: Quaternion): Quaternion => {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!Number.isFinite(len) || len < QUAT_EPS) {
    return [0, 0, 0, 1];
  }
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
};

export const multiplyQuaternions = (a: Quaternion, b: Quaternion): Quaternion => {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  const result: Quaternion = [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
  return normalizeQuaternion(result);
};

export const invertQuaternion = (quat: Quaternion): Quaternion => {
  const q = normalizeQuaternion(quat);
  return [-q[0], -q[1], -q[2], q[3]];
};

export const axisAngleFromQuaternion = (quat: Quaternion): { axis: Vec3; angle: number } => {
  const q = normalizeQuaternion(quat);
  const clampedW = Math.max(-1, Math.min(1, q[3]));
  const angle = 2 * Math.acos(clampedW);
  const sinHalf = Math.sqrt(Math.max(0, 1 - clampedW * clampedW));
  if (sinHalf < QUAT_EPS) {
    return { axis: [0, 0, 1], angle: 0 };
  }
  const axis: Vec3 = [q[0] / sinHalf, q[1] / sinHalf, q[2] / sinHalf];
  return { axis: vec3Normalize(axis), angle };
};

export const quaternionFromAxisAngle = (axis: Vec3, angle: number): Quaternion => {
  const normAxis = vec3Normalize(axis);
  if (vec3Length(normAxis) < EPS || Math.abs(angle) < 1e-8) {
    return [0, 0, 0, 1];
  }
  const half = angle * 0.5;
  const s = Math.sin(half);
  return normalizeQuaternion([normAxis[0] * s, normAxis[1] * s, normAxis[2] * s, Math.cos(half)]);
};

export const rotateVectorWithQuaternion = (quat: Quaternion, vec: Vec3): Vec3 => {
  const q = normalizeQuaternion(quat);
  const u: Vec3 = [q[0], q[1], q[2]];
  const s = q[3];
  const crossUV = vec3Cross(u, vec);
  const crossUUv = vec3Cross(u, crossUV);
  const term1 = vec3Scale(crossUV, 2 * s);
  const term2 = vec3Scale(crossUUv, 2);
  return vec3Add(vec, vec3Add(term1, term2));
};

export const basisFromQuaternion = (quat: Quaternion): CameraBasis => {
  const q = normalizeQuaternion(quat);
  const x = q[0];
  const y = q[1];
  const z = q[2];
  const w = q[3];
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;
  const m00 = 1 - 2 * (yy + zz);
  const m01 = 2 * (xy - wz);
  const m02 = 2 * (xz + wy);
  const m10 = 2 * (xy + wz);
  const m11 = 1 - 2 * (xx + zz);
  const m12 = 2 * (yz - wx);
  const m20 = 2 * (xz - wy);
  const m21 = 2 * (yz + wx);
  const m22 = 1 - 2 * (xx + yy);
  const right: Vec3 = vec3Normalize([m00, m10, m20]);
  const up: Vec3 = vec3Normalize([m01, m11, m21]);
  let forward: Vec3 = vec3Normalize([m02, m12, m22]);
  if (vec3Length(forward) < EPS) {
    forward = [0, -1, 0];
  }
  return { right, up, forward };
};

export const quaternionFromBasis = (basis: CameraBasis): Quaternion => {
  const r = basis.right;
  const u = basis.up;
  const f = basis.forward;
  const m00 = r[0];
  const m01 = u[0];
  const m02 = f[0];
  const m10 = r[1];
  const m11 = u[1];
  const m12 = f[1];
  const m20 = r[2];
  const m21 = u[2];
  const m22 = f[2];
  const trace = m00 + m11 + m22;
  let q: Quaternion;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1.0) * 2;
    q = [
      (m21 - m12) / s,
      (m02 - m20) / s,
      (m10 - m01) / s,
      0.25 * s,
    ];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1.0 + m00 - m11 - m22) * 2;
    q = [
      0.25 * s,
      (m01 + m10) / s,
      (m02 + m20) / s,
      (m21 - m12) / s,
    ];
  } else if (m11 > m22) {
    const s = Math.sqrt(1.0 + m11 - m00 - m22) * 2;
    q = [
      (m01 + m10) / s,
      0.25 * s,
      (m12 + m21) / s,
      (m02 - m20) / s,
    ];
  } else {
    const s = Math.sqrt(1.0 + m22 - m00 - m11) * 2;
    q = [
      (m02 + m20) / s,
      (m12 + m21) / s,
      0.25 * s,
      (m10 - m01) / s,
    ];
  }
  return normalizeQuaternion(q);
};

export const rotateVectorAroundAxis = (v: Vec3, axis: Vec3, angle: number): Vec3 => {
  const normalized = vec3Normalize(axis);
  if (vec3Length(normalized) < EPS || Math.abs(angle) < 1e-6) return [...v];
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const dotVA = vec3Dot(normalized, v);
  const crossVA = vec3Cross(normalized, v);
  return [
    v[0] * cosA + crossVA[0] * sinA + normalized[0] * dotVA * (1 - cosA),
    v[1] * cosA + crossVA[1] * sinA + normalized[1] * dotVA * (1 - cosA),
    v[2] * cosA + crossVA[2] * sinA + normalized[2] * dotVA * (1 - cosA),
  ];
};

/**
 * Rotate a vector `v` around `axis` by `angle` radians (right-hand rule).
 * Returns a new vector. Inputs are not mutated.
 * Args:
 *   v: Vec3 the vector to rotate
 *   axis: Vec3 the axis to rotate around
 *   angle: rotation angle in radians
 */

/**
 * Map two screen-space points to an arcball rotation axis and angle.
 *
 * The mapping follows the standard arcball mapping: project screen coordinates
 * to a unit sphere centered in the canvas; if the point is outside the
 * unit circle, project to the nearest point on the circle on the sphere's
 * equator (z=0). The returned axis is camera-space (right, up, forward)
 * coordinates and the angle is in radians.
 *
 * Args:
 *   x0,y0: start screen-space coordinates (pixels)
 *   x1,y1: end screen-space coordinates (pixels)
 *   w,h: canvas width/height in pixels
 *   radius: optional arcball radius in normalized screen units (default 1.0)
 *
 * Returns:
 *   { axis: Vec3, angle: number }
 */
export const arcballDelta = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  h: number,
  radius = 1.0
): { axis: Vec3; angle: number } => {
  const map = (x: number, y: number): Vec3 => projectToSphere(x, y, w, h, radius);
  const p0 = map(x0, y0);
  const p1 = map(x1, y1);
  const cross: Vec3 = [p0[1] * p1[2] - p0[2] * p1[1], p0[2] * p1[0] - p0[0] * p1[2], p0[0] * p1[1] - p0[1] * p1[0]];
  const dot = Math.max(-1, Math.min(1, p0[0] * p1[0] + p0[1] * p1[1] + p0[2] * p1[2]));
  const angle = Math.acos(dot);
  const len = vec3Length(cross);
  const axis: Vec3 = len < 1e-6 ? [0, 0, 1] : vec3Scale(cross, 1 / len);
  return { axis, angle };
};

/**
 * Project a screen-space point to an arcball sphere fed to `arcballDelta`.
 * Returns a camera-space 3D point mapped to unit radius scaled by `radius`.
 */
export const projectToSphere = (x: number, y: number, w: number, h: number, radius = 1.0): Vec3 => {
  const nx = (2 * x - w) / Math.max(1, w);
  const ny = (h - 2 * y) / Math.max(1, h);
  const r2 = nx * nx + ny * ny;
  if (r2 <= radius * radius) {
    return [nx, ny, Math.sqrt(Math.max(0, radius * radius - r2))];
  }
  const inv = 1 / Math.sqrt(r2);
  return [nx * inv * radius, ny * inv * radius, 0];
};

export const buildCameraBasis = (forwardDir: Vec3): CameraBasis => {
  let forward = vec3Normalize(forwardDir);
  if (!Number.isFinite(forward[0]) || !Number.isFinite(forward[1]) || !Number.isFinite(forward[2])) {
    forward = [0, -1, 0];
  }
  let right = vec3Normalize(vec3Cross(WORLD_UP, forward));
  if (vec3Length(right) < EPS) {
    const candidates: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let best = candidates[0];
    let bestScore = Math.abs(vec3Dot(best, forward));
    for (let i = 1; i < candidates.length; i += 1) {
      const cand = candidates[i];
      const score = Math.abs(vec3Dot(cand, forward));
      if (score < bestScore) {
        best = cand;
        bestScore = score;
      }
    }
    right = vec3Normalize(vec3Cross(best, forward));
  }
  if (vec3Length(right) < EPS) {
    right = [1, 0, 0];
  }
  let up = vec3Normalize(vec3Cross(forward, right));
  if (vec3Length(up) < EPS) {
    up = WORLD_UP;
  }
  return { right, up, forward };
};

/**
 * Deterministically orthonormalize a forward direction into a camera
 * basis following a WORLD_UP-first rule. This ensures consistent right/up
 * axes even when forward is nearly collinear with world-up.
 * Args:
 *   forwardDir: Vec3 forward vector in world space
 * Returns:
 *   A CameraBasis with right, up, forward as unit vectors.
 */

export const normalizeCameraBasis = (basis: CameraBasis): CameraBasis => buildCameraBasis(basis.forward);

/**
 * Create a deterministic CameraBasis from Euler angles (rotX, rotY).
 * rotX is pitch (rotation about camera right axis), rotY is yaw
 * (rotation about WORLD_UP; yaw=0 looks down -Y). Wrapping can be
 * disabled (wrapAngles=false) to preserve unbounded yaw/pitch values
 * during interactive drags where continuity matters.
 */
export const applyCameraEulerToBasis = (
  rotX: number,
  rotY: number,
  options?: { wrapAngles?: boolean }
): CameraBasis => {
  const shouldWrap = options?.wrapAngles ?? true;
  const pitch = shouldWrap ? wrapToPi(rotX) : rotX;
  const yaw = shouldWrap ? wrapToPi(rotY) : rotY;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  // Forward convention: same as webgpu_core — yaw=0 looks down -Y
  const forward: Vec3 = [sinYaw * cosPitch, -cosYaw * cosPitch, -sinPitch];
  return buildCameraBasis(forward);
};

export const quaternionFromEuler = (rotX: number, rotY: number, rotZ = 0): Quaternion => {
  const baseBasis = applyCameraEulerToBasis(rotX, rotY, { wrapAngles: false });
  let quat = quaternionFromBasis(baseBasis);
  if (Math.abs(rotZ) > 1e-6) {
    const roll = quaternionFromAxisAngle(baseBasis.forward, rotZ);
    quat = multiplyQuaternions(roll, quat);
  }
  return quat;
};

/**
 * Sync Euler angles from a CameraBasis. Converts a forward vector
 * to pitch (rotX) and yaw (rotY) values in radians.
 */
export const syncAnglesFromBasis = (basis: CameraBasis): { rotX: number; rotY: number } => {
  const forward = vec3Normalize(basis.forward);
  const clampedPitch = Math.max(-1, Math.min(1, -forward[2]));
  const rotX = Math.asin(clampedPitch);
  let rotY = Math.atan2(forward[0], -forward[1]);
  return { rotX, rotY };
};

export const slerpQuaternion = (a: Quaternion, b: Quaternion, t: number): Quaternion => {
  const qa = normalizeQuaternion(a);
  const qb = normalizeQuaternion(b);
  let dot = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (dot < 0) {
    qb[0] = -qb[0]; qb[1] = -qb[1]; qb[2] = -qb[2]; qb[3] = -qb[3];
    dot = -dot;
  }
  const DOT_THRESHOLD = 0.9995;
  if (dot > DOT_THRESHOLD) {
    const res: Quaternion = [
      qa[0] + t * (qb[0] - qa[0]),
      qa[1] + t * (qb[1] - qa[1]),
      qa[2] + t * (qb[2] - qa[2]),
      qa[3] + t * (qb[3] - qa[3]),
    ];
    return normalizeQuaternion(res);
  }
  const theta0 = Math.acos(Math.max(-1, Math.min(1, dot)));
  const theta = theta0 * t;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * (sinTheta / sinTheta0);
  const s1 = sinTheta / sinTheta0;
  const res: Quaternion = [
    qa[0] * s0 + qb[0] * s1,
    qa[1] * s0 + qb[1] * s1,
    qa[2] * s0 + qb[2] * s1,
    qa[3] * s0 + qb[3] * s1,
  ];
  return normalizeQuaternion(res);
};

/**
 * Apply a CAD-style turntable step by yawing about WORLD_UP and pitching
 * about the camera's right axis. Pitch is clamped near +/- 90° to avoid
 * gimbal singularities. Roll (rotZ) is preserved if provided.
 * 
 * IMPORTANT: Near the poles (high pitch), we preserve the input yaw rather
 * than extracting it from the basis, since atan2 becomes numerically unstable.
 */
export const turntableStep = (
  basis: CameraBasis,
  dYaw: number,
  dPitch: number,
  rotZ: number = 0
): { basis: CameraBasis; rotX: number; rotY: number } => {
  // Get current angles from the basis
  const currentAngles = syncAnglesFromBasis(basis);
  
  // First apply yaw (always around WORLD_UP)
  const yawed = rotateBasisAboutAxisFull(basis, WORLD_UP, dYaw) ?? basis;
  
  // Calculate the desired new pitch
  const desiredPitch = currentAngles.rotX + dPitch;
  
  // Use a softer limit (85°) to avoid instability near poles
  const SAFE_PITCH_LIMIT = Math.PI * 0.47; // ~84.6 degrees
  
  // Clamp the pitch to safe limits
  const clampedPitch = Math.max(-SAFE_PITCH_LIMIT, Math.min(SAFE_PITCH_LIMIT, desiredPitch));
  
  // Calculate the actual pitch delta to apply (may be less than requested if clamped)
  const actualPitchDelta = clampedPitch - currentAngles.rotX;
  
  // Apply the (potentially clamped) pitch around the yawed right axis
  const pitched = Math.abs(actualPitchDelta) > 1e-6
    ? rotateBasisAboutAxisFull(yawed, yawed.right, actualPitchDelta) ?? yawed
    : yawed;
  
  // Calculate the new yaw - add the delta to the PREVIOUS yaw rather than
  // extracting from the basis (which is unstable near poles)
  const newYaw = currentAngles.rotY + dYaw;
  
  // Return the pitched basis with correct angles
  // Re-build basis from Euler angles including roll for numerical stability
  const stableQuat = quaternionFromEuler(clampedPitch, newYaw, rotZ);
  const stableBasis = basisFromQuaternion(stableQuat);
  
  return { basis: stableBasis, rotX: clampedPitch, rotY: newYaw };
};

/**
 * Rotate a camera basis in-place (conceptually) by rotating the forward
 * vector by `angle` around `axis`, then rebuild a deterministic basis
 * using WORLD_UP-first orthonormalization. Returns a new CameraBasis or
 * null when input is invalid.
 */
export const rotateBasisInPlace = (basis: CameraBasis | null, axis: Vec3, angle: number): CameraBasis | null => {
  if (!basis || Math.abs(angle) < 1e-6) return basis;
  const normAxis = vec3Normalize(axis);
  if (vec3Length(normAxis) < 1e-6) return basis;
  const forwardRot = rotateVectorAroundAxis(basis.forward, normAxis, angle);
  const newForward = vec3Normalize(forwardRot);
  // Derive right/up deterministically from WORLD_UP-first rule
  const newBasis = buildCameraBasis(newForward);
  return newBasis;
};

/**
 * Rotate the entire camera basis about an arbitrary world-space axis
 * while preserving roll. Applies the rotation to right, up, and forward
 * then re-orthonormalizes with a right-handed Gram-Schmidt step.
 */
export const rotateBasisAboutAxisFull = (
  basis: CameraBasis | null,
  axis: Vec3,
  angle: number
): CameraBasis | null => {
  if (!basis || Math.abs(angle) < 1e-6) return basis;
  const normAxis = vec3Normalize(axis);
  if (vec3Length(normAxis) < 1e-6) return basis;

  const rotatedRight = rotateVectorAroundAxis(basis.right, normAxis, angle);
  const rotatedUp = rotateVectorAroundAxis(basis.up, normAxis, angle);
  const rotatedForward = rotateVectorAroundAxis(basis.forward, normAxis, angle);

  const forward = vec3Normalize(rotatedForward);
  let right = vec3Cross(rotatedUp, forward);
  if (vec3Length(right) < EPS) {
    right = vec3Cross(basis.up, forward);
  }
  if (vec3Length(right) < EPS) {
    right = vec3Cross(WORLD_UP, forward);
  }
  right = vec3Normalize(right);

  let up = vec3Cross(forward, right);
  let upLen = vec3Length(up);
  if (upLen < EPS) {
    const fallback = vec3Cross(forward, [1, 0, 0]);
    up = vec3Length(fallback) < EPS ? [0, 1, 0] : vec3Normalize(fallback);
    upLen = vec3Length(up);
  }
  if (upLen < EPS) {
    up = WORLD_UP;
  } else {
    up = vec3Scale(up, 1 / upLen);
  }

  return {
    right,
    up,
    forward,
  };
};

/**
 * Compare two camera payload-like objects and return true when they differ
 * by more than `epsilon` for numeric fields or when non-numeric fields differ.
 * This is tolerant to small numeric noise and treats missing fields as differing.
 */
export const cameraPayloadDiffers = (prev: Record<string, unknown> | null | undefined, next: Record<string, unknown>, epsilon = 1e-6): boolean => {
  if (!prev) return true;
  const keysToCheck = ['rotX', 'rotY', 'zoom', 'panX', 'panY', 'sceneRadius', 'pivot'];
  for (const k of keysToCheck) {
    const a = prev[k];
    const b = next[k];
    if (a === undefined && b === undefined) continue;
    if (typeof a === 'number' || typeof b === 'number') {
      const an = Number(a ?? 0);
      const bn = Number(b ?? 0);
      if (!Number.isFinite(an) || !Number.isFinite(bn)) return true;
      if (Math.abs(an - bn) > epsilon) return true;
      continue;
    }
    if (k === 'pivot') {
      const pa = Array.isArray(a) ? a : null;
      const pb = Array.isArray(b) ? b : null;
      if (!pa && !pb) continue;
      if (!pa || !pb) return true;
      for (let i = 0; i < 3; i += 1) {
        if (!Number.isFinite(Number(pa[i])) || !Number.isFinite(Number(pb[i]))) return true;
        if (Math.abs(Number(pa[i]) - Number(pb[i])) > epsilon) return true;
      }
      continue;
    }
    // fallback: strict inequality for strings/bools
    if (a !== b) return true;
  }
  return false;
};

/**
 * Rotate camera's stored basis (in `state`) around `axis` by `angle`.
 * This updates the state's forward/right/up vectors.
 */
export const rotateCameraBasisForState = (state: { camForward: Vec3; camRight: Vec3; camUp: Vec3 }, axis: Vec3, angle: number): void => {
  if (Math.abs(angle) < 1e-6) return;
  const newBasis = rotateBasisInPlace({ forward: state.camForward, right: state.camRight, up: state.camUp }, axis, angle);
  if (!newBasis) return;
  state.camForward = [...newBasis.forward];
  state.camRight = [...newBasis.right];
  state.camUp = [...newBasis.up];
};

/**
 * Convert a camera-space axis (expressed in basis coordinates) into
 * a normalized world-space axis. Useful when arcball math returns
 * camera-frame axes but rotations need to happen in world space.
 */
export const cameraAxisToWorld = (basis: CameraBasis, axis: Vec3): Vec3 => {
  const world: Vec3 = [
    axis[0] * basis.right[0] + axis[1] * basis.up[0] + axis[2] * basis.forward[0],
    axis[0] * basis.right[1] + axis[1] * basis.up[1] + axis[2] * basis.forward[1],
    axis[0] * basis.right[2] + axis[1] * basis.up[2] + axis[2] * basis.forward[2],
  ];
  return vec3Normalize(world);
};
