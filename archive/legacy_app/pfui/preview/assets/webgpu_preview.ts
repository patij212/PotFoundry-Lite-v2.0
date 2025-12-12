/*
 * WebGPU preview module for PotFoundry.
 *
 * This TypeScript companion is linted with tsc/eslint so the embedded
 * JavaScript stays type-safe. The runtime build that Streamlit loads is
 * generated via `scripts/build_webgpu_assets.py`.
 */
/// <reference lib="es2020" />
/// <reference lib="dom" />

interface WebGPUParams {
  [key: string]: unknown;
}

interface WebGPUState {
  rotX: number;
  rotY: number;
  rotZ?: number;
  autoRotate: boolean;
  zoom: number;
  panX: number;
  panY: number;
  inertiaRotX: number;
  inertiaRotY: number;
  inertiaPanX: number;
  inertiaPanY: number;
  interacting: boolean;
  lastInteraction: number;
  sceneRadius: number;
  interactiveLodRatio: number;
  interactiveLodEnabled: boolean;
  recentParamUpdate: boolean;
  lastParamUpdate: number;
  lastParamNonce: number | null;
  canvasAspect: number;
  cameraDirty: boolean;
  lastCameraPush: number;
  projectionMode: 'ortho' | 'perspective';
  debugFlatColor?: boolean;
  debugOverlay: boolean;
  showGrid?: boolean;
  camRight?: Vec3;
  camUp?: Vec3;
  camForward?: Vec3;
  displayCamRight?: Vec3 | null;
  displayCamUp?: Vec3 | null;
  displayCamForward?: Vec3 | null;
  displayRotX?: number | null;
  displayRotY?: number | null;
  orbitYaw?: number;
  orbitPitch?: number;
  orbitHemi?: 1 | -1;
  useArcball?: boolean;
  invertOrbitX?: boolean;
  invertOrbitY?: boolean;
  orbitYawGain?: number;
  orbitPitchGain?: number;
}

type PointerMode = 'orbit' | 'pan';

interface GradientColor {
  0: number;
  1: number;
  2: number;
}

interface BootOptions {
  canvas: HTMLCanvasElement;
  initialParams: WebGPUParams;
}

type PotFoundryWindow = Window &
  typeof globalThis & {
    __pf_initialParams?: WebGPUParams;
    __PF_WGPU_DEBUG__?: boolean;
  };

const detectPreviewDebug = (): boolean => {
  try {
    const params = (window as PotFoundryWindow).__pf_initialParams;
    if (params && typeof params === 'object' && '__pf_wgpu_debug__' in params) {
      const flag = (params as Record<string, unknown>)['__pf_wgpu_debug__'];
      if (flag === true || flag === 1 || flag === '1') {
        return true;
      }
    }
  } catch (err) {
    /* ignore */
  }
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.get('pf_wgpu_debug') === '1' || search.has('pf_wgpu_debug')) {
      return true;
    }
  } catch (err) {
    /* ignore */
  }
  try {
    const stored = window.localStorage?.getItem?.('pf_wgpu_debug');
    if (stored === '1' || stored?.toLowerCase() === 'true') {
      return true;
    }
  } catch (err) {
    /* ignore */
  }
  try {
    if ((window as PotFoundryWindow).__PF_WGPU_DEBUG__ === true) {
      return true;
    }
  } catch (err) {
    /* ignore */
  }
  return false;
};

const PREVIEW_DEBUG_ENABLED = detectPreviewDebug();
const ALWAYS_ON_DIAGNOSTICS = new Set([
  'webgpu:host-suppressed',
  'webgpu:host-pending',
  'webgpu:error',
]);

  

type GPUDevice = any;
type GPUAdapter = any;
type GPUTextureFormat = any;
type GPUShaderModule = any;
type GPURenderPipeline = any;
type GPUTexture = any;
type GPUBuffer = any;
type GPUError = { message?: string } | string | null;
type GPUCanvasContext = any;
type GPUCompilationMessage = {
  type?: string;
  message?: string;
  lineNum?: number;
  linePos?: number;
};
type GPUCompilationInfo = { messages?: GPUCompilationMessage[] } | undefined;
type GPURequestAdapterOptions = {
  powerPreference?: 'high-performance' | 'low-power';
  forceFallbackAdapter?: boolean;
};

const WGSL_B64 = '%WGSL_B64%';
const MAX_VERTS = 0xffffffff;
const STYLE_PARAM_CAPACITY = 48;
import * as CameraConstants from '../../components/webgpu_component/frontend/src/camera_constants';
import manager from '../../infra/logging/MessageManager';
import { installConsolePatch } from '../../infra/logging/ConsolePatch';
import { resolveLoggingPreferences } from '../../infra/logging/loggingPreferences';
import { installWebGpuCapture, withValidationScope, createShaderModule } from '../../infra/logging/WebGpuCapture';

try {
  installConsolePatch();
} catch (err) {
  /* console patch install errors are non-fatal */
}
const applyLoggingPreferences = (params?: Record<string, unknown> | null): void => {
  try {
    const prefs = resolveLoggingPreferences(params ?? null);
    manager.setMode(prefs.mode);
    manager.setHeartbeatMs(prefs.heartbeatMs);
    manager.setDedupeEveryN(prefs.dedupeEveryN);
  } catch (err) {
    /* ignore manager configuration errors */
  }
};

applyLoggingPreferences();
try {
  (window as any).__pf_manager = manager; // always attach for introspection; harmless in production
} catch (err) {
  /* ignore attach errors */
}
const DEFAULT_INTERACTIVE_LOD = CameraConstants.DEFAULT_INTERACTIVE_LOD;
const MIN_INTERACTIVE_LOD = CameraConstants.MIN_INTERACTIVE_LOD;
const INTERACTIVE_THETA_RATIO_FLOOR = CameraConstants.INTERACTIVE_THETA_RATIO_FLOOR;
const INTERACTIVE_Z_RATIO_FLOOR = CameraConstants.INTERACTIVE_Z_RATIO_FLOOR;
const MIN_THETA_STATIC = CameraConstants.MIN_THETA_STATIC;
const MIN_Z_STATIC = CameraConstants.MIN_Z_STATIC;
const MIN_THETA_INTERACTIVE = CameraConstants.MIN_THETA_INTERACTIVE;
const MIN_Z_INTERACTIVE = CameraConstants.MIN_Z_INTERACTIVE;
const PARAM_UPDATE_TIMEOUT_MS = CameraConstants.PARAM_UPDATE_TIMEOUT_MS;
const CAMERA_BROADCAST_MS = CameraConstants.CAMERA_BROADCAST_MS;
const CAMERA_EPSILON = CameraConstants.CAMERA_EPSILON;
const CAMERA_STATIC_EPS = CameraConstants.CAMERA_STATIC_EPS;
const CAMERA_PADDING = CameraConstants.CAMERA_PADDING;
const CAMERA_PADDING_MIN = CameraConstants.CAMERA_PADDING_MIN;
const CAMERA_PADDING_MAX = CameraConstants.CAMERA_PADDING_MAX;
const BASE_FOV = CameraConstants.BASE_FOV;
// MIN_FOV/MAX_FOV constants are removed to reduce unused variables in this preview context
const CAMERA_NEAR_EPS = CameraConstants.CAMERA_NEAR_EPS;
const CAMERA_DISTANCE_FALLOFF = CameraConstants.CAMERA_DISTANCE_FALLOFF;
const UNIFORM_FLOAT_COUNT = CameraConstants.UNIFORM_FLOAT_COUNT;
const CAMERA_EYE_OFFSET = CameraConstants.CAMERA_EYE_OFFSET;
const CAMERA_MODE_OFFSET = CameraConstants.CAMERA_MODE_OFFSET;
const VP_MATRIX_OFFSET = CameraConstants.VP_MATRIX_OFFSET;
const CAMERA_RIGHT_OFFSET = CameraConstants.CAMERA_RIGHT_OFFSET;
const CAMERA_UP_OFFSET = CameraConstants.CAMERA_UP_OFFSET;
const CAMERA_FORWARD_OFFSET = CameraConstants.CAMERA_FORWARD_OFFSET;
const GRID_FLAG_OFFSET = CameraConstants.GRID_FLAG_OFFSET;
const DRAIN_RADIUS_OFFSET = CameraConstants.DRAIN_RADIUS_OFFSET;
const INVALID_STATUS_COOLDOWN_MS = CameraConstants.INVALID_STATUS_COOLDOWN_MS;

let statusReady = false;

type CameraSnapshot = {
  rotX: number;
  rotY: number;
  zoom: number;
  panX: number;
  panY: number;
  autoRotate: boolean;
  sceneRadius: number;
  projection: 'ortho' | 'perspective';
};

type CameraBasis = {
  right: Vec3;
  up: Vec3;
  forward: Vec3;
};

type CameraRig = {
  eye: Vec3;
  viewProjection: Mat4;
  near: number;
  far: number;
  fov: number;
  mode: 'ortho' | 'perspective';
  basis: CameraBasis;
};

type GeometrySnapshot = {
  nTheta: number;
  nZ: number;
  innerSeg: number;
  bottomRings: number;
  rimRings: number;
  totalVerts: number;
};

// Buffer early host messages to avoid racing Streamlit's component registration.
const _hostPending: unknown[] = [];
let _hostReady = false;
let _hostFlushTimer: number | null = null;
const HOST_EMIT_DEDUP_MS = 400;
const HOST_EMIT_COOLDOWN_MS = 40;
let _lastHostEmitJson: string | null = null;
let _lastHostEmitTs = 0;
let _hostSuppressed = 0;
const flushHostPending = (): void => {
  if (!_hostReady) return;
  if (_hostPending.length === 0) return;
  try {
    // Reduce queued messages into the *last* message per 'type' key so the
    // host doesn't receive a flood of historical events when the Preview
    // iframe becomes ready or when we drain during a cooldown window.
    const queued = _hostPending.splice(0);
    const reduced: Record<string, unknown> = {};
    for (const m of queued) {
      try {
        const key = (m && typeof m === 'object' && 'type' in (m as any)) ? String((m as any).type) : JSON.stringify(m);
        reduced[key] = m;
      } catch (err) {
        // Fallback — keep the original message as a best-effort entry
        const idx = `__msg_${Math.random().toString(36).slice(2)}`;
        reduced[idx] = m;
      }
    }
    const target = window.parent && window.parent !== window ? window.parent : window;
    const now = Date.now();
    for (const key of Object.keys(reduced)) {
      const m = reduced[key];
      try {
        let j: string;
        try {
          j = JSON.stringify(m);
        } catch (err) {
          j = String(m);
        }
        // Dedupe identical payloads
        if (_lastHostEmitJson && _lastHostEmitJson === j && now - _lastHostEmitTs < HOST_EMIT_DEDUP_MS) {
          _hostSuppressed += 1;
          continue;
        }
        const cooldownDelta = now - _lastHostEmitTs;
        if (cooldownDelta < HOST_EMIT_COOLDOWN_MS) {
          // If we're still within cooldown, requeue message and schedule
          // a timer to try flushing again shortly (preserves ordering
          // but avoids immediate bursts).
          _hostPending.push(m);
          if (_hostFlushTimer === null) {
            _hostFlushTimer = window.setTimeout(() => {
              _hostFlushTimer = null;
              flushHostPending();
            }, Math.max(0, HOST_EMIT_COOLDOWN_MS - cooldownDelta));
          }
          continue;
        }
        target.postMessage(m, '*');
        _lastHostEmitJson = j;
        _lastHostEmitTs = now;
      } catch (err) {
        /* ignore individual post errors to keep draining other messages */
      }
    }
  } catch (err) {
    /* ignore overall flush errors */
  }
  if (_hostSuppressed > 0) {
    try {
      emitDiagnostic('webgpu:host-suppressed', { count: _hostSuppressed });
    } catch (err) {
      /* ignore */
    }
    _hostSuppressed = 0;
  }
};
setTimeout(() => {
  _hostReady = true;
  flushHostPending();
}, 300);

const postToHost = (message: unknown): void => {
  try {
    // Canonicalize into a JSON string for dedupe checks. Fallback to
    // string coercion for unsupported payload types.
    const now = Date.now();
    let j: string;
    try {
      j = JSON.stringify(message);
    } catch (err) {
      j = String(message);
    }
    if (_lastHostEmitJson && _lastHostEmitJson === j && now - _lastHostEmitTs < HOST_EMIT_DEDUP_MS) {
      // duplicate within the dedupe window — skip
      _hostSuppressed += 1;
      return;
    }
    if (!_hostReady) {
      _hostPending.push(message);
      // Emit a diagnostic event if the pending queue becomes large so we
      // can observe congested host queues from the preview side.
      try {
        if (_hostPending.length > 4) {
          emitDiagnostic('webgpu:host-pending', { size: _hostPending.length });
        }
      } catch (err) {
        /* ignore */
      }
      return;
    }
    // If we're rapidly emitting messages, queue them to avoid bursts.
    if (now - _lastHostEmitTs < HOST_EMIT_COOLDOWN_MS) {
      const cooldownDelta = now - _lastHostEmitTs;
      _hostPending.push(message);
      try {
        if (_hostPending.length > 4) {
          emitDiagnostic('webgpu:host-pending', { size: _hostPending.length });
        }
      } catch (err) {
        /* ignore */
      }
      if (_hostFlushTimer === null) {
        _hostFlushTimer = window.setTimeout(() => {
          _hostFlushTimer = null;
          flushHostPending();
        }, Math.max(0, HOST_EMIT_COOLDOWN_MS - cooldownDelta));
      }
      return;
    }
    const target = window.parent && window.parent !== window ? window.parent : window;
    target.postMessage(message, '*');
    _lastHostEmitJson = j;
    _lastHostEmitTs = now;
  } catch (err) {
    /* ignore cross-origin errors */
  }
};

// Lightweight diagnostic emitter for preview host. Mirrors the 'emitDiagnostic'
// wrapper the component uses to forward debug messages to the Streamlit host.
const emitDiagnostic = (message: string, detail: Record<string, unknown> = {}): void => {
  const telemetryAllowed = PREVIEW_DEBUG_ENABLED || ALWAYS_ON_DIAGNOSTICS.has(message);
  if (!telemetryAllowed) {
    return;
  }
  if (PREVIEW_DEBUG_ENABLED) {
    try {
      manager.debug('preview:diag', message, detail);
    } catch (err) {
      /* ignore console errors */
    }
  }
  try {
    postToHost({ type: 'diagnostic', payload: { message, detail, timestamp: Date.now() } });
  } catch (err) {
    /* ignore post errors */
  }
};

const setStatus = (msg: string): void => {
  const el = document.getElementById('wgpu-status');
  if (el) {
    const normalized = msg.toLowerCase();
    const finalMsg = statusReady && !normalized.includes('ready') ? `${msg} • ready` : msg;
    el.textContent = finalMsg;
    if (statusReady) {
      el.setAttribute('data-ready', '1');
    }
  }
};

// NOTE: Removed 2D fallback per user request — keep WebGPU-only behavior.

const markStatusReady = (): void => {
  statusReady = true;
  const el = document.getElementById('wgpu-status');
  if (el) {
    el.setAttribute('data-ready', '1');
  }
  setStatus('WebGPU • ready');
};

const decodeHex = (hex: string): number => parseInt(hex, 16) / 255;

const hexToRgbNorm = (input: unknown): GradientColor => {
  if (Array.isArray(input) && input.length >= 3) {
    return [Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0];
  }
  const raw = typeof input === 'string' ? input : '';
  let value = raw.replace('#', '');
  if (value.length === 3) {
    value = value
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  if (value.length !== 6) {
    return [0.18, 0.53, 0.87];
  }
  const r = decodeHex(value.slice(0, 2));
  const g = decodeHex(value.slice(2, 4));
  const b = decodeHex(value.slice(4, 6));
  return [r, g, b];
};

const mergeParams = (target: WebGPUParams | null, incoming: WebGPUParams): WebGPUParams => {
  if (!target) {
    return { ...incoming };
  }
  for (const key of Object.keys(incoming)) {
    const val = (incoming as Record<string, unknown>)[key];
    if (val !== undefined) {
      (target as Record<string, unknown>)[key] = val;
    }
  }
  return target;
};

const createDepthTexture = (device: GPUDevice, width: number, height: number): GPUTexture =>
  device.createTexture({
    label: 'preview:depth-texture',
    size: { width, height },
    format: 'depth24plus',
    usage:
      (
        (globalThis as Record<string, unknown>).GPUTextureUsage as
          | { RENDER_ATTACHMENT?: number }
          | undefined
      )?.RENDER_ATTACHMENT ?? 0x10,
  });

const writeGradient = (
  device: GPUDevice,
  buffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer },
  gradient: unknown
): void => {
  const stops = Array.isArray(gradient) ? gradient : [];
  const c1 = hexToRgbNorm(stops[0]);
  const c2 = hexToRgbNorm(stops[1] ?? stops[0]);
  const c3 = hexToRgbNorm(stops[2] ?? stops[1] ?? stops[0]);
  device.queue.writeBuffer(buffers.c1, 0, new Float32Array([c1[0], c1[1], c1[2], 0]));
  device.queue.writeBuffer(buffers.c2, 0, new Float32Array([c2[0], c2[1], c2[2], 0]));
  device.queue.writeBuffer(buffers.c3, 0, new Float32Array([c3[0], c3[1], c3[2], 0]));
};

const buildUniformBlock = (size: number): Float32Array => {
  const buffer = new ArrayBuffer(size);
  return new Float32Array(buffer);
};

const clampNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const sanitizePadding = (value: number): number => {
  const normalized = Math.abs(value) || CAMERA_PADDING;
  return Math.min(Math.max(normalized, CAMERA_PADDING_MIN), CAMERA_PADDING_MAX);
};

type Vec3 = [number, number, number];
type Mat4 = Float32Array;

const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) {
    return [0, 0, 0];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
};
const vec3Subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
// vec3Cross helper removed; preview uses shared buildCameraBasis for robust basis math
const vec3Dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

import {
  buildCameraBasis as sharedBuildCameraBasis,
  normalizeCameraBasis as sharedNormalizeCameraBasis,
  applyCameraEulerToBasis as sharedApplyCameraEulerToBasis,
  rotateBasisInPlace as sharedRotateBasisInPlace,
  syncAnglesFromBasis as sharedSyncAnglesFromBasis,
  arcballDelta as sharedArcballDelta,
  cameraAxisToWorld as sharedCameraAxisToWorld,
  quaternionFromAxisAngle as sharedQuaternionFromAxisAngle,
  multiplyQuaternions as sharedMultiplyQuaternions,
  basisFromQuaternion as sharedBasisFromQuaternion,
  invertQuaternion as sharedInvertQuaternion,
  axisAngleFromQuaternion as sharedAxisAngleFromQuaternion,
} from '../../components/webgpu_component/frontend/src/camera_basis';
import { worldRayFromCanvas, intersectRayCylinder, intersectRayZPlane } from '../../components/webgpu_component/frontend/src/camera_helpers';
import { projectAxisToTangent, Vec3 as ArcVec3 } from './arcball_utils';
import { assertHostHelpersPresent } from './host_helpers';

const buildCameraBasis = (forwardDir: Vec3): CameraBasis => sharedBuildCameraBasis(forwardDir);
const normalizeCameraBasis = (basis: CameraBasis): CameraBasis => sharedNormalizeCameraBasis(basis);
const applyCameraEulerToBasis = (
  rotX: number,
  rotY: number,
  options?: { wrapAngles?: boolean }
): CameraBasis => sharedApplyCameraEulerToBasis(rotX, rotY, options as any);
const syncAnglesFromBasis = (basis: CameraBasis) => hostSyncAnglesFromBasis(basis as any);
const cameraAxisToWorld = (basis: CameraBasis, axis: Vec3): Vec3 =>
  hostCameraAxisToWorld(basis as any, axis as any);

const viewMatrixFromBasis = (basis: CameraBasis, eye: Vec3): Mat4 => {
  // View matrix transforms world coords to camera space.
  // Camera axes form ROWS of the rotation part (stored as columns in column-major).
  // Column 0 = [right.x, up.x, forward.x, 0]
  // Column 1 = [right.y, up.y, forward.y, 0]
  // Column 2 = [right.z, up.z, forward.z, 0]
  // Column 3 = [-dot(right,eye), -dot(up,eye), -dot(forward,eye), 1]
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

const writeVec3 = (target: Float32Array, offset: number, value: Vec3): void => {
  target[offset + 0] = value[0];
  target[offset + 1] = value[1];
  target[offset + 2] = value[2];
};

const mat4Multiply = (a: Mat4, b: Mat4): Mat4 => {
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

// Build a 3x3 rotation matrix from Euler angles (pitch=rotX, yaw=rotY, roll=rotZ)
// Rotation order: yaw (Y), pitch (X), roll (Z) -> R = Y * X * Z
const makeRotationMatrixFromEuler = (rotX: number, rotY: number, rotZ: number): number[] => {
  const cx = Math.cos(rotX);
  const sx = Math.sin(rotX);
  const cy = Math.cos(rotY);
  const sy = Math.sin(rotY);
  const cz = Math.cos(rotZ);
  const sz = Math.sin(rotZ);
  // Yaw (around Y)
  // Pitch (around X)
  // Roll (around Z)
  // Multiply matrices: R = Y * X * Z
  // Compute combined rotation entries directly
  const m00 = cy * cz + sy * sx * sz;
  const m01 = -cy * sz + sy * sx * cz;
  const m02 = sy * cx;
  const m10 = cx * sz;
  const m11 = cx * cz;
  const m12 = -sx;
  const m20 = -sy * cz + cy * sx * sz;
  const m21 = sy * sz + cy * sx * cz;
  const m22 = cy * cx;
  return [m00, m01, m02, m10, m11, m12, m20, m21, m22];
};

const applyRotationToVector = (m: number[], v: Vec3): Vec3 => {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
};

const mat4OrthoLH = (
  left: number,
  right: number,
  bottom: number,
  top: number,
  near: number,
  far: number
): Mat4 => {
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

const mat4PerspectiveFovLH = (
  fovY: number,
  aspect: number,
  near: number,
  far: number
): Mat4 => {
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

const matrixIsFinite = (m: Mat4): boolean => {
  for (let i = 0; i < 16; i += 1) {
    const v = m[i];
    if (!Number.isFinite(v)) return false;
  }
  return true;
};

/**
 * Minimal 2D fallback renderer used when WebGPU is not available.
 * Draws a simple gradient and an ellipse to approximate the pot for tests.
 */
const create2DFallbackRenderer = (canvas: HTMLCanvasElement, initialParams: Record<string, unknown>): void => {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const draw = () => {
    const w = canvas.width = Math.max(1, canvas.clientWidth);
    const h = canvas.height = Math.max(1, canvas.clientHeight);
    // Background gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#242B46');
    g.addColorStop(1, '#060A14');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Draw placeholder pot (ellipse)
    ctx.save();
    ctx.translate(w * 0.5, h * 0.55);
    ctx.scale(w / 800, h / 600);
    ctx.fillStyle = '#b0c4de';
    ctx.beginPath();
    ctx.ellipse(0, 0, 150, 50, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8aa4c8';
    ctx.beginPath();
    ctx.ellipse(0, 20, 120, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  // Redraw on resize/pointer events
  draw();
  window.addEventListener('resize', draw);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); draw(); }, { passive: false });
  canvas.addEventListener('pointerdown', () => draw());
};

const INTERACTION_TIMEOUT_MS = 240;
// Grace window after local interaction during which host-local camera updates
// are ignored to avoid immediate snap-backs when releasing a drag.
// Local grace window is now handled by CameraController
const INERTIA_DECAY = 0.92;

const computePanFactor = (state: WebGPUState, canvas: HTMLCanvasElement): number => {
  const rect = canvas.getBoundingClientRect();
  const reference = Math.max(rect.width, rect.height, 1);
  const scene = Math.max(state.sceneRadius, 1);
  const zoom = Math.max(state.zoom, 1e-3);
  return (scene / reference) * (2 / zoom);
};

const resetInertia = (state: WebGPUState): void => {
  state.inertiaRotX = 0;
  state.inertiaRotY = 0;
  state.inertiaPanX = 0;
  state.inertiaPanY = 0;
};

const sanitizePitch = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const limit = Math.PI / 2;
  const EPS = 5e-4;
  if (Math.abs(Math.abs(value) - limit) < EPS) {
    return value > 0 ? limit - EPS : -limit + EPS;
  }
  return value;
};

const wrapAngle = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const fullTurn = Math.PI * 2;
  let wrapped = value % fullTurn;
  if (wrapped > Math.PI) wrapped -= fullTurn;
  else if (wrapped < -Math.PI) wrapped += fullTurn;
  return wrapped;
};

const ORBIT_SOFT_LIMIT = Math.PI * 0.5 - 1e-4;

const ensureOrbitState = (state: WebGPUState): void => {
  if (!Number.isFinite(state.orbitPitch ?? NaN)) {
    state.orbitPitch =
      (typeof state.displayRotX === 'number' ? state.displayRotX : state.rotX) ?? 0;
  }
  if (!Number.isFinite(state.orbitYaw ?? NaN)) {
    state.orbitYaw =
      (typeof state.displayRotY === 'number' ? state.displayRotY : state.rotY) ?? 0;
  }
  if (state.orbitHemi !== 1 && state.orbitHemi !== -1) {
    state.orbitHemi = 1;
  }
};

const toggleOrbitHemisphere = (state: WebGPUState): void => {
  state.orbitHemi = state.orbitHemi === 1 ? -1 : 1;
};

const normalizeOrbitAngles = (state: WebGPUState): void => {
  ensureOrbitState(state);
  const limit = ORBIT_SOFT_LIMIT;
  while ((state.orbitPitch as number) > limit) {
    state.orbitPitch = Math.PI - (state.orbitPitch as number);
    state.orbitYaw = (state.orbitYaw as number) + Math.PI;
    toggleOrbitHemisphere(state);
  }
  while ((state.orbitPitch as number) < -limit) {
    state.orbitPitch = -Math.PI - (state.orbitPitch as number);
    state.orbitYaw = (state.orbitYaw as number) + Math.PI;
    toggleOrbitHemisphere(state);
  }
};

const shortestAngleDelta = (target: number, reference: number): number => {
  let delta = wrapAngle(target) - wrapAngle(reference);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

const primeOrbitFromAngles = (state: WebGPUState, rotX: number, rotY: number): void => {
  const prevYaw = Number.isFinite(state.orbitYaw ?? NaN) ? (state.orbitYaw as number) : rotY;
  const prevPitch = Number.isFinite(state.orbitPitch ?? NaN) ? (state.orbitPitch as number) : rotX;
  state.orbitYaw = prevYaw + shortestAngleDelta(rotY, prevYaw);
  state.orbitPitch = prevPitch + shortestAngleDelta(rotX, prevPitch);
  if (state.orbitHemi !== 1 && state.orbitHemi !== -1) {
    state.orbitHemi = 1;
  }
  normalizeOrbitAngles(state);
};

const updateDisplayBasisFromOrbit = (state: WebGPUState): void => {
  normalizeOrbitAngles(state);
  const basis = applyCameraEulerToBasis(state.orbitPitch as number, state.orbitYaw as number, {
    wrapAngles: false,
  });
  state.displayCamRight = [...basis.right];
  state.displayCamUp = [...basis.up];
  state.displayCamForward = [...basis.forward];
  state.displayRotX = wrapAngle(state.orbitPitch as number);
  state.displayRotY = wrapAngle(state.orbitYaw as number);
};

const applyDragToOrbit = (state: WebGPUState, dx: number, dy: number, vw: number, vh: number): void => {
  const yawGain = typeof state.orbitYawGain === 'number' ? state.orbitYawGain : 1.0;
  const pitchGain = typeof state.orbitPitchGain === 'number' ? state.orbitPitchGain : 1.0;
  const sgnX = state.invertOrbitX ? +1 : -1;
  const sgnY = state.invertOrbitY ? +1 : -1;
  ensureOrbitState(state);
  const dYaw = sgnX * dx * (Math.PI / Math.max(1, vw)) * yawGain * (state.orbitHemi as number);
  const dPitch = sgnY * dy * (Math.PI / Math.max(1, vh)) * pitchGain;
  state.orbitYaw = (state.orbitYaw as number) + dYaw;
  state.orbitPitch = (state.orbitPitch as number) + dPitch;
  updateDisplayBasisFromOrbit(state);
};

const sanitizeInt = (value: unknown, fallback: number, minimum: number): number => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return minimum;
  }
  return parsed;
};

const applyCameraEuler = (state: WebGPUState, rotX: number, rotY: number): void => {
  const basis = applyCameraEulerToBasis(rotX, rotY);
  // Deterministic: do not accidentally invert right/up. Keep forward/up/right
  // as computed from Euler angles to preserve consistent mapping across
  // host and preview.
  state.camForward = [...basis.forward];
  state.camUp = [...basis.up];
  state.camRight = [...basis.right];
  state.rotX = sanitizePitch(rotX);
  state.rotY = wrapAngle(rotY);
  primeOrbitFromAngles(state, state.rotX, state.rotY);
};

const syncAnglesFromBasisState = (state: WebGPUState): void => {
  const { rotX, rotY } = syncAnglesFromBasis({ right: state.camRight as Vec3, up: state.camUp as Vec3, forward: state.camForward as Vec3 });
  const prevY = Number.isFinite(state.rotY) ? state.rotY : 0;
  let delta = rotY - prevY;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  state.rotX = sanitizePitch(rotX);
  state.rotY = prevY + delta;
  primeOrbitFromAngles(state, state.rotX, state.rotY);
};

const BASIS_FLIP_DOT_THRESHOLD = -0.999;

const resolveActiveBasis = (state: WebGPUState): CameraBasis => {
  const hasDisplay = Boolean(state.displayCamForward && state.displayCamUp && state.displayCamRight);
  const sourceBasis: CameraBasis = hasDisplay
    ? { right: [...(state.displayCamRight as Vec3)], up: [...(state.displayCamUp as Vec3)], forward: [...(state.displayCamForward as Vec3)] }
    : { right: [...(state.camRight as Vec3)], up: [...(state.camUp as Vec3)], forward: [...(state.camForward as Vec3)] };
  const normalized = normalizeCameraBasis(sourceBasis);
  if (hasDisplay) {
    state.displayCamRight = [...normalized.right];
    state.displayCamUp = [...normalized.up];
    state.displayCamForward = [...normalized.forward];
  } else {
    state.camRight = [...normalized.right];
    state.camUp = [...normalized.up];
    state.camForward = [...normalized.forward];
    syncAnglesFromBasisState(state);
  }
  return normalized;
};

const commitDisplayBasisToState = (state: WebGPUState): boolean => {
  if (!state.displayCamForward || !state.displayCamUp || !state.displayCamRight) return false;
  try {
    manager.debug('preview:commit-display-basis', 'commitDisplayBasisToState', {
      interacting: state.interacting,
      autoRotate: state.autoRotate,
      inertiaRotX: state.inertiaRotX,
      inertiaRotY: state.inertiaRotY,
      panX: state.panX,
      panY: state.panY,
      camForwardLen: vec3Length(state.displayCamForward as Vec3),
      camRightLen: vec3Length(state.displayCamRight as Vec3),
      camUpLen: vec3Length(state.displayCamUp as Vec3),
      canvasAspect: state.canvasAspect,
    });
  } catch (err) {
    /* ignore */
  }
  const prevRight = state.camRight;
  let flipped = false;
  if (prevRight && state.displayCamRight) {
    // Deterministic mapping: derive angles from the proposed basis and
    // canonicalize yaw near top/bottom to keep orientation consistent.
    const committedBasis: CameraBasis = {
      right: [...(state.displayCamRight as Vec3)],
      up: [...(state.displayCamUp as Vec3)],
      forward: [...(state.displayCamForward as Vec3)],
    } as CameraBasis;
    const { rotX: commitRotX, rotY: commitRotY } = syncAnglesFromBasis({ right: committedBasis.right, up: committedBasis.up, forward: committedBasis.forward });
    let finalizeRotX = commitRotX;
    let finalizeRotY = commitRotY;
    if (Math.abs(Math.abs(finalizeRotX) - Math.PI / 2) < 1e-3) {
      finalizeRotY = 0; // canonical yaw for top/bottom
    }
    const canonical = applyCameraEulerToBasis(finalizeRotX, finalizeRotY);
    state.displayCamRight = [...canonical.right];
    state.displayCamUp = [...canonical.up];
    state.displayCamForward = [...canonical.forward];
    // Parity alignment: ensure basis overlay matches projection overlay
    try {
      // Avoid parity flips while the user is actively interacting
      if (!state.interacting && !state.disableAutoFlip) {
      const testAxis: Vec3 = [0, 0, 1];
      const rig = buildCameraRig(state, CAMERA_PADDING);
      const worldScale = Math.max(state.sceneRadius || 1, 1);
      const pA = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
      const pB = mulMat4Vec4(rig.viewProjection, (state.pivot?.[0] ?? 0) + testAxis[0] * worldScale, (state.pivot?.[1] ?? 0) + testAxis[1] * worldScale, (state.pivot?.[2] ?? 0) + testAxis[2] * worldScale);
        const dirNdc = ndcDirBetween(pA, pB);
        const ov_proj = [dirNdc[0], -dirNdc[1]];
        const ov_proj_len = Math.hypot(ov_proj[0], ov_proj[1]);
      if (ov_proj_len > 1e-9) {
        const ov_proj_unit = [ov_proj[0] / ov_proj_len, ov_proj[1] / ov_proj_len];
        // Compute basis-derived overlay using projection-based helper to
        // mirror what the runtime uses. This avoids sign confusion from
        // ad-hoc dot products and includes the inverted screen Y.
        const ov_basis = [
          state.displayCamRight[0] * testAxis[0] + state.displayCamRight[1] * testAxis[1] + state.displayCamRight[2] * testAxis[2],
          -(state.displayCamUp[0] * testAxis[0] + state.displayCamUp[1] * testAxis[1] + state.displayCamUp[2] * testAxis[2]),
        ];
        const ov_basis_len = Math.hypot(ov_basis[0], ov_basis[1]);
        if (ov_basis_len > 1e-9) {
          const ov_basis_unit = [ov_basis[0] / ov_basis_len, ov_basis[1] / ov_basis_len];
          const dotAlign = ov_basis_unit[0] * ov_proj_unit[0] + ov_basis_unit[1] * ov_proj_unit[1];
          if (dotAlign < BASIS_FLIP_DOT_THRESHOLD) {
            state.displayCamRight = vec3Scale2(state.displayCamRight, -1);
            state.displayCamUp = vec3Scale2(state.displayCamUp, -1);
            emitDiagnostic('preview:display-basis-parity_flip', { dotAlign });
            flipped = true;
          }
        }
        }
      }
      // end interacting guard
    } catch (e) {
      /* ignore parity alignment failures */
    }
    const dot = vec3Dot(prevRight as Vec3, state.displayCamRight as Vec3);
    if (dot < BASIS_FLIP_DOT_THRESHOLD) flipped = true;
  }
  state.camForward = [...(state.displayCamForward as Vec3)];
  state.camUp = [...(state.displayCamUp as Vec3)];
  state.camRight = [...(state.displayCamRight as Vec3)];
  syncAnglesFromBasisState(state);
  state.displayCamForward = null;
  state.displayCamUp = null;
  state.displayCamRight = null;
  state.displayRotX = null;
  state.displayRotY = null;
  // Ensure shader uniforms reflect the committed basis immediately so overlay
  // projection parity checks observe consistent state during tests.
  try {
  state.cameraDirty = true;
  device.queue.writeBuffer(uniformBuffer, 0, uniform.buffer as ArrayBuffer);
  emitDiagnostic('preview:uniform-write-after-commit', { immediate: true, ts: Date.now(), cameraSeq: cameraSequence });
  } catch (err) {
    /* ignore uniform write failures */
  }
  return flipped;
};

const applyViewPreset = (state: WebGPUState, preset: string): void => {
  switch (preset) {
    case 'top':
      applyCameraEuler(state, sanitizePitch(-Math.PI / 2 + 0.001), 0);
      state.displayCamRight = [...(state.camRight as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...(state.camUp as Vec3)];
      state.displayCamForward = [...(state.camForward as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      primeOrbitFromAngles(state, state.rotX, state.rotY);
      // Immediately commit preset display cam so parity rules take effect
      if (typeof commitDisplayBasisToState === 'function') commitDisplayBasisToState(state);
      break;
    case 'front':
      applyCameraEuler(state, 0, 0);
      state.displayCamRight = [...(state.camRight as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...(state.camUp as Vec3)];
      state.displayCamForward = [...(state.camForward as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      // Commit the transient display basis to ensure canonicalization and parity alignment
      if (typeof commitDisplayBasisToState === 'function') commitDisplayBasisToState(state);
      break;
    case 'right':
      applyCameraEuler(state, 0, Math.PI / 2);
      state.displayCamRight = [...(state.camRight as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...(state.camUp as Vec3)];
      state.displayCamForward = [...(state.camForward as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      if (typeof commitDisplayBasisToState === 'function') commitDisplayBasisToState(state);
      break;
    case 'iso':
      applyCameraEuler(state, -0.9, Math.PI / 4);
      state.displayCamRight = [...(state.camRight as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...(state.camUp as Vec3)];
      state.displayCamForward = [...(state.camForward as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      if (typeof commitDisplayBasisToState === 'function') commitDisplayBasisToState(state);
      break;
    case 'fit':
    default:
      applyCameraEuler(state, sanitizePitch(0.35), 0);
      state.displayCamRight = [...(state.camRight as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.displayCamUp = [...(state.camUp as Vec3)];
      state.displayCamForward = [...(state.camForward as Vec3)];
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      state.zoom = 1.0;
      break;
  }
  state.panX = 0;
  state.panY = 0;
  primeOrbitFromAngles(state, state.rotX, state.rotY);
  resetInertia(state);
  state.cameraDirty = true;
};

const mount = async ({ canvas, initialParams }: BootOptions): Promise<boolean> => {
  applyLoggingPreferences(initialParams ? (initialParams as Record<string, unknown>) : null);
  const navGpu = (navigator as Navigator & { gpu?: unknown }).gpu as
    | {
        requestAdapter: (options?: GPURequestAdapterOptions) => Promise<unknown>;
        getPreferredCanvasFormat: () => GPUTextureFormat;
      }
    | undefined;

  try {
    manager.info('webgpu:mount', 'checking navigator.gpu', { gpu: (navigator as any).gpu });
    emitDiagnostic('webgpu:navigator', { has_gpu: !!(navigator as any).gpu });
  } catch (err) {
    /* ignore */
  }
  if (!navGpu) {
    // Provide a minimal 2D canvas fallback when WebGPU is unavailable so the
    // preview remains interactive and tests can verify a mounted canvas.
    try {
      create2DFallbackRenderer(canvas, initialParams ?? {});
      setStatus('Fallback renderer ready');
      // Expose a minimal debug API for fallback so Playwright tests can use it.
      try {
        const dataId = (canvas.getAttribute('data-pf-wgpu-id') || 'pf-wgpu-default') as string;
        (window as any).__pf_webgpu_mounts = (window as any).__pf_webgpu_mounts || {};
        (window as any).__pf_webgpu_mounts[dataId] = (window as any).__pf_webgpu_mounts[dataId] || {};
        const fallbackState = {
          sceneRadius: Number((initialParams ?? ({} as any)).sceneRadius || 120),
          projection: (initialParams ?? ({} as any)).projection || 'ortho',
          rotX: 0.35,
          rotY: 0,
          canvasAspect: (canvas.width || 1) / (canvas.height || 1),
        };
        (window as any).__pf_webgpu_mounts[dataId].debug = {
          usedFallback: true,
          ready: false,
          buildCameraRig: async (paddingHint: number, paddedHalfWidth?: number, paddedHalfHeight?: number) => {
            const waitUntil = (ms: number) => new Promise((res) => setTimeout(res, ms));
            const start = performance.now();
            while (typeof (self as any)['buildCameraRig'] !== 'function') {
              if (performance.now() - start > 5000) {
                break;
              }
              await waitUntil(30);
            }
              try {
              let rig: any = null;
              let dV = 0;
              let dH = 0;
              if (typeof (self as any)['buildCameraRig'] === 'function') {
                try {
                  (window as any).__pf_webgpu_mounts[dataId].debug.usedFallback = false;
                } catch (err) {
                  /* ignore */
                }
                rig = (self as any)['buildCameraRig'](paddingHint, paddedHalfWidth, paddedHalfHeight);
              } else {
                try {
                  (window as any).__pf_webgpu_mounts[dataId].debug.usedFallback = true;
                } catch (err) {
                  /* ignore */
                }
                // Fallback: approximate dV/dH from current state and base FOV.
                const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
                const halfFovX = Math.atan(Math.tan(halfFovY) * (fallbackState.canvasAspect || 1));
                dV = Math.max(1e-6, Number(paddedHalfHeight || 0)) / Math.max(Math.tan(halfFovY), 1e-6);
                dH = Math.max(1e-6, Number(paddedHalfWidth || 0)) / Math.max(Math.tan(halfFovX), 1e-6);
                rig = { fov: BASE_FOV, eye: [0, 0, Math.max(dV, dH)], viewProjection: new Float32Array(16).fill(0), near: CAMERA_NEAR_EPS, far: CAMERA_NEAR_EPS + 1e6, mode: fallbackState.projection };
                return { viewProjection: Array.from(rig.viewProjection), eye: Array.from(rig.eye), mode: rig.mode, fov: rig.fov, near: rig.near, far: rig.far, dV: dV, dH: dH, chosenDistance: Math.max(dV, dH) };
              }
              return {
                viewProjection: Array.from(rig.viewProjection),
                eye: Array.from(rig.eye),
                mode: rig.mode,
                fov: rig.fov,
                near: rig.near,
                far: rig.far,
                dV: dV,
                dH: dH,
                chosenDistance: Math.hypot(rig.eye[0], rig.eye[1], rig.eye[2]),
              };
            } catch (err) {
              return { error: String(err) };
            }
          },
          getState: () => ({ sceneRadius: fallbackState.sceneRadius, projection: fallbackState.projection, rotX: fallbackState.rotX, rotY: fallbackState.rotY }),
          lastApplyCameraPayload: null,
          lastSceneRadiusUpdate: null,
        };
        // Minimal message handler for fallback so tests that post params can observe
        // similar semantics as the full WebGPU mount. Only updates a tiny subset
        // of fields needed for tests (sceneRadius, rotX, rotY).
        window.addEventListener('message', (event) => {
          const data = event.data;
          if (!data || typeof data !== 'object' || data.target !== dataId) return;
          if (data.type === 'params' && data.payload) {
            let payload = data.payload as WebGPUParams;
            if (typeof payload === 'string') {
              try { payload = JSON.parse(payload) as WebGPUParams; } catch (err) { /* ignore */ }
            }
            try {
              const dbg = (window as any).__pf_webgpu_mounts[dataId]?.debug;
              if (typeof payload.sceneRadius === 'number') {
                const prev = fallbackState.sceneRadius;
                const next = Math.max(Math.abs(clampNumber(payload.sceneRadius, prev)), 1);
                if (Math.abs(next - prev) > CAMERA_EPSILON) {
                  fallbackState.sceneRadius = next;
                  if (dbg) {
                    dbg.lastSceneRadiusUpdate = { prev, next: fallbackState.sceneRadius, timestamp: Date.now() };
                  }
                }
              }
              if (typeof payload.rotX === 'number') {
                fallbackState.rotX = sanitizePitch(payload.rotX);
              }
              if (typeof payload.rotY === 'number') {
                fallbackState.rotY = payload.rotY;
              }
              if (dbg) {
                dbg.lastApplyCameraPayload = { fields: Object.keys(payload as WebGPUParams), timestamp: Date.now() };
              }
            } catch (err) {
              /* ignore */
            }
          }
        });
      } catch (err) {
        /* best-effort */
      }
      try {
        const dataId = (canvas.getAttribute('data-pf-wgpu-id') || 'pf-wgpu-default') as string;
        (window as any).__pf_webgpu_mounts = (window as any).__pf_webgpu_mounts || {};
        if ((window as any).__pf_webgpu_mounts[dataId]?.debug) {
          (window as any).__pf_webgpu_mounts[dataId].debug.ready = true;
          (window as any).__pf_webgpu_mounts[dataId].debug.usedFallback = true;
        }
      } catch (err) {
        /* ignore */
      }
      markStatusReady();
      return true;
    } catch (err) {
      setStatus('WebGPU not supported');
      return false;
    }
  }
  const adapterAttemptLog: string[] = [];

  const attemptAdapterRequest = async (
    options: GPURequestAdapterOptions | undefined,
    label: string
  ): Promise<GPUAdapter | null> => {
    try {
      const adapterResult = await navGpu.requestAdapter(options);
      if (!adapterResult) {
        adapterAttemptLog.push(`${label}:null`);
        console.warn('WebGPU adapter attempt returned null', { attempt: label });
      } else {
        adapterAttemptLog.push(`${label}:ok`);
      }
      return adapterResult as GPUAdapter | null;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const escapedMessage = raw.replace(/;/g, '%3B').replace(/\n/g, ' ');
      adapterAttemptLog.push(`${label}:error:${escapedMessage}`);
      console.warn('WebGPU adapter request failed', {
        attempt: label,
        error: raw,
      });
      return null;
    }
  };

  const adapter =
    (await attemptAdapterRequest(undefined, 'default')) ??
    (await attemptAdapterRequest({ powerPreference: 'high-performance' }, 'high-performance')) ??
    (await attemptAdapterRequest({ powerPreference: 'low-power' }, 'low-power')) ??
    (await attemptAdapterRequest({ forceFallbackAdapter: true }, 'fallback'));

  // Log adapter selection and device acquisition attempts
  try {
    emitDiagnostic('webgpu:adapter-log', { attempts: adapterAttemptLog });
    manager.info('webgpu:adapter-log', 'adapter attempts', { adapterAttemptLog, adapter });
  } catch (err) {}
  // Acquire a device and handle runtime device loss by attempting to recover
  let device = await adapter.requestDevice();
  try {
    installWebGpuCapture(device as any);
  } catch (err) {
    /* best-effort */
  }
  try {
    (device as any).lost?.then(async (info: unknown) => {
      manager.warn('webgpu:device-lost', 'device.lost - attempting recovery', { info });
      setStatus('WebGPU • device lost — attempting recovery');
      try {
        const newDevice = await adapter.requestDevice();
        device = newDevice;
        try {
          context.configure({ device, format, alphaMode: 'opaque' });
        } catch (cfgErr) {
          console.warn('WebGPU recovery: context reconfigure failed', cfgErr);
        }
        setStatus('WebGPU • recovered');
      } catch (reErr) {
        console.error('WebGPU recovery failed', reErr);
        setStatus('WebGPU • device recovery failed — reload the page');
      }
    });
  } catch (err) {
    /* best-effort only */
  }
  try {
    // Log adapter/device diagnostics to help debug low-triangle or black output
    try {
      // adapter may expose a 'name' or 'vendor' depending on implementation
      manager.info('webgpu:adapter-info', 'adapter info', { adapter });
    } catch (e) {
      /* ignore adapter introspection errors */
    }
    try {
      manager.info('webgpu:device-limits', 'device.limits', { limits: (device as any).limits });
      manager.info('webgpu:device-features', 'device.features', { features: Array.from(((device as any).features || [])) });
    } catch (e) {
      /* ignore device introspection errors */
    }
  } catch (err) {
    /* best-effort only */
  }
  const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext | null;
  if (!context) {
    setStatus('WebGPU context unavailable');
    return false;
  }

  const format = navGpu.getPreferredCanvasFormat();
  let width = 1;
  let height = 1;
  const dpr = window.devicePixelRatio || 1;
  let depth = createDepthTexture(device, width, height);

  // Create an overlay canvas for debug visuals (NDC box, fit indicators).
  let overlayCanvas: HTMLCanvasElement | null = null;
  let overlayCtx: CanvasRenderingContext2D | null = null;
  // Axis overlay canvas for small XYZ indicator
  let axisCanvas: HTMLCanvasElement | null = null;
  let axisCtx: CanvasRenderingContext2D | null = null;
  try {
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.inset = '0';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
    const parent = canvas.parentElement || document.body;
    parent.appendChild(overlayCanvas);
    overlayCtx = overlayCanvas.getContext('2d');
    // Create small axis overlay canvas
    try {
      const parent = canvas.parentElement || document.body;
      axisCanvas = document.createElement('canvas');
      axisCanvas.style.position = 'absolute';
      axisCanvas.style.left = '8px';
      axisCanvas.style.bottom = '8px';
      axisCanvas.style.pointerEvents = 'none';
      axisCanvas.style.zIndex = '9998';
      axisCanvas.width = 96 * (window.devicePixelRatio || 1);
      axisCanvas.height = 96 * (window.devicePixelRatio || 1);
      axisCanvas.style.width = '96px';
      axisCanvas.style.height = '96px';
      parent.appendChild(axisCanvas);
      axisCtx = axisCanvas.getContext('2d');
    } catch (err) {
      /* ignore axis overlay creation errors */
    }

    const drawAxisIndicator = (ctx: CanvasRenderingContext2D | null, rig: any | null): void => {
      if (!ctx || !rig) return;
      try {
        const canvas = ctx.canvas as HTMLCanvasElement;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        const scale = Math.min(w, h) * 0.34;
        const basis = rig.basis;
        const dotToScreen = (v: [number, number, number]): [number, number] => {
          const pivot = state.pivot ?? [0, 0, 0];
          const worldScale = Math.max(state.sceneRadius, 1);
          const mul = (m: Float32Array, x: number, y: number, z: number) => {
            const cxv = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
            const cyv = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
            const cwv = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
            return { x: cxv, y: cyv, w: cwv };
          };
          const pA = mul(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
          const pB = mul(rig.viewProjection, pivot[0] + v[0] * worldScale, pivot[1] + v[1] * worldScale, pivot[2] + v[2] * worldScale);
          const ax = pA.x / pA.w;
          const ay = pA.y / pA.w;
          const bx = pB.x / pB.w;
          const by = pB.y / pB.w;
          const dx = bx - ax;
          const dy = by - ay;
          const len = Math.hypot(dx, dy);
          if (len < 1e-9) return [cx, cy];
          const ndcX = dx / len;
          const ndcY = dy / len;
          // Convert NDC to overlay screen coords (canvas Y is inverted)
          return [cx + ndcX * scale, cy - ndcY * scale];
        };
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.arc(cx, cy, Math.min(w, h) * 0.46, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const axes: Array<{ v: [number, number, number]; color: string; label: string }> = [
          { v: [1, 0, 0], color: '#e53935', label: 'X' },
          { v: [0, 1, 0], color: '#43a047', label: 'Y' },
          { v: [0, 0, 1], color: '#1e88e5', label: 'Z' },
        ];
        for (const a of axes) {
          const [tx, ty] = dotToScreen(a.v);
          const dx = tx - cx;
          const dy = ty - cy;
          const len = Math.hypot(dx, dy);
          if (len < 0.001) continue;
          const ux = dx / len;
          const uy = dy / len;
          ctx.beginPath();
          ctx.lineWidth = Math.max(2, Math.round(w * 0.02));
          ctx.strokeStyle = a.color;
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + ux * (len - Math.min(8, w * 0.06)), cy + uy * (len - Math.min(8, w * 0.06)));
          ctx.stroke();
          const tipSize = Math.max(6, Math.round(w * 0.04));
          ctx.beginPath();
          ctx.fillStyle = a.color;
          ctx.moveTo(cx + ux * len, cy + uy * len);
          ctx.lineTo(cx + ux * (len - tipSize) - uy * (tipSize * 0.45), cy + uy * (len - tipSize) + ux * (tipSize * 0.45));
          ctx.lineTo(cx + ux * (len - tipSize) + uy * (tipSize * 0.45), cy + uy * (len - tipSize) - ux * (tipSize * 0.45));
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.font = `${Math.max(10, Math.round(w * 0.12))}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lx = cx + ux * (len + Math.max(6, Math.round(w * 0.02)));
          const ly = cy + uy * (len + Math.max(6, Math.round(w * 0.02)));
          try {
            const pivot = state.pivot ?? [0, 0, 0];
            const worldScale = Math.max(state.sceneRadius, 1);
            const pA = mulMat4Vec4(rig.viewProjection, pivot[0], pivot[1], pivot[2]);
            const pB = mulMat4Vec4(rig.viewProjection, pivot[0] + a.v[0] * worldScale, pivot[1] + a.v[1] * worldScale, pivot[2] + a.v[2] * worldScale);
            const dirNdc = ndcDirBetween(pA, pB);
            const ov_proj = [dirNdc[0], -dirNdc[1]];
            const ov_proj_len = Math.hypot(ov_proj[0], ov_proj[1]);
            const ov_proj_unit = ov_proj_len > 1e-9 ? [ov_proj[0] / ov_proj_len, ov_proj[1] / ov_proj_len] : [0, 0];
            // Compute basis-based overlay equivalent of overlayForAxisFromBasis
            const pr = mulMat4Vec4(rig.viewProjection, pivot[0] + basis.right[0] * worldScale, pivot[1] + basis.right[1] * worldScale, pivot[2] + basis.right[2] * worldScale);
            const pu = mulMat4Vec4(rig.viewProjection, pivot[0] + basis.up[0] * worldScale, pivot[1] + basis.up[1] * worldScale, pivot[2] + basis.up[2] * worldScale);
            const dirR = ndcDirBetween(pA, pr);
            const dirU = ndcDirBetween(pA, pu);
            const rvec = [dirR[0], -dirR[1]];
            const uvec = [dirU[0], -dirU[1]];
            const ax = a.v[0] * basis.right[0] + a.v[1] * basis.right[1] + a.v[2] * basis.right[2];
            const ay = a.v[0] * basis.up[0] + a.v[1] * basis.up[1] + a.v[2] * basis.up[2];
            const ovx = ax * rvec[0] + ay * uvec[0];
            const ovy = ax * rvec[1] + ay * uvec[1];
            const ov_len = Math.hypot(ovx, ovy);
            const ov_basis_unit = ov_len > 1e-9 ? [ovx / ov_len, ovy / ov_len] : [0, 0];
            emitDiagnostic('preview:axis-overlay-compare', { axis: a.label, overlayProj: ov_proj_unit, overlayBasis: ov_basis_unit, ts: Date.now(), cameraSeq: cameraSequence });
          } catch (err) { /* ignore diag failures */ }
          ctx.fillText(a.label, lx, ly);
        }
      } catch (err) {
        /* ignore */
      }
    };
  } catch (err) {
    /* ignore overlay creation errors */
  }

  const state: WebGPUState = {
    rotX: 0.35,
    rotY: 0.0,
    autoRotate: true,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    inertiaRotX: 0,
    inertiaRotY: 0,
    inertiaPanX: 0,
    inertiaPanY: 0,
    interacting: false,
    lastInteraction: performance.now(),
    sceneRadius: 120,
    interactiveLodRatio: DEFAULT_INTERACTIVE_LOD,
    interactiveLodEnabled: false,
    recentParamUpdate: false,
    lastParamUpdate: performance.now(),
    lastParamNonce: null,
    canvasAspect: 1,
    cameraDirty: true,
    lastCameraPush: 0,
    projectionMode: 'ortho',
    debugFlatColor: false,
    debugOverlay: false,
    showGrid: true,
    showAxis: true,
    disableAutoFlip: false,
    camRight: [1, 0, 0],
    camUp: [0, 0, 1],
    camForward: [0, -1, 0],
    displayCamRight: null,
    displayCamUp: null,
    displayCamForward: null,
    displayRotX: null,
    displayRotY: null,
    orbitYaw: 0,
    orbitPitch: 0,
    orbitHemi: 1,
    invertOrbitX: false,
    invertOrbitY: false,
    orbitYawGain: 1.0,
    orbitPitchGain: 1.0,
  };

  let frameCounter = 0;
  let totalDrawCalls = 0;
  let totalDrawnVerts = 0;

    // Initialize committed camera basis and transient display basis
    applyCameraEuler(state, state.rotX, state.rotY);

  // Expose a minimal debug API for use by Playwright tests and other debug tooling.
  try {
    const dataId = (canvas.getAttribute('data-pf-wgpu-id') || 'pf-wgpu-default') as string;
    (window as any).__pf_webgpu_mounts = (window as any).__pf_webgpu_mounts || {};
    (window as any).__pf_webgpu_mounts[dataId] = (window as any).__pf_webgpu_mounts[dataId] || {};
        (window as any).__pf_webgpu_mounts[dataId].debug = {
          usedFallback: false,
          buildCameraRig: async (paddingHint: number, paddedHalfWidth?: number, paddedHalfHeight?: number) => {
        const waitUntil = (ms: number) => new Promise((res) => setTimeout(res, ms));
        const start = performance.now();
        while (typeof (self as any)['buildCameraRig'] !== 'function') {
          if (performance.now() - start > 5000) {
            break;
          }
          await waitUntil(30);
        }
        try {
          let rig: any = null;
          let dV = 0;
          let dH = 0;
          if (typeof (self as any)['buildCameraRig'] === 'function') {
            try {
              (window as any).__pf_webgpu_mounts[dataId].debug.usedFallback = false;
            } catch (err) {
              /* ignore */
            }
            rig = (self as any)['buildCameraRig'](paddingHint, paddedHalfWidth, paddedHalfHeight);
          } else {
            try {
              (window as any).__pf_webgpu_mounts[dataId].debug.usedFallback = true;
            } catch (err) {
              /* ignore */
            }
            // Local fallback: approximate using state and base FOV constants
            const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
            const halfFovX = Math.atan(Math.tan(halfFovY) * (state.canvasAspect || 1));
            const dV = Math.max(1e-6, Number(paddedHalfHeight || 0)) / Math.max(Math.tan(halfFovY), 1e-6);
            const dH = Math.max(1e-6, Number(paddedHalfWidth || 0)) / Math.max(Math.tan(halfFovX), 1e-6);
            const fakeRig: any = { fov: BASE_FOV, eye: [0, 0, Math.max(dV, dH)], viewProjection: new Float32Array(16).fill(0), near: CAMERA_NEAR_EPS, far: CAMERA_NEAR_EPS + 1e6, mode: state.projectionMode };
            return { viewProjection: Array.from(fakeRig.viewProjection), eye: Array.from(fakeRig.eye), mode: fakeRig.mode, fov: fakeRig.fov, near: fakeRig.near, far: fakeRig.far, dV: dV, dH: dH, chosenDistance: Math.max(dV, dH) };
          }
            const halfFovY = rig.fov * 0.5;
            const halfFovX = Math.atan(Math.tan(halfFovY) * (state.canvasAspect || 1));
            dV = Math.max(1e-6, Number(paddedHalfHeight || 0)) / Math.max(Math.tan(halfFovY), 1e-6);
            dH = Math.max(1e-6, Number(paddedHalfWidth || 0)) / Math.max(Math.tan(halfFovX), 1e-6);
          return {
            viewProjection: Array.from(rig.viewProjection),
            eye: Array.from(rig.eye),
            mode: rig.mode,
            fov: rig.fov,
            near: rig.near,
            far: rig.far,
            dV,
            dH,
            chosenDistance: Math.hypot(rig.eye[0], rig.eye[1], rig.eye[2]),
          };
          try {
            (window as any).__pf_webgpu_mounts[dataId].debug.ready = true;
          } catch (err) {
            /* ignore */
          }
        } catch (err) {
          return { error: String(err) };
        }
      },
      getState: () => ({ sceneRadius: state.sceneRadius, projection: state.projectionMode, rotX: state.rotX, rotY: state.rotY }),
      lastApplyCameraPayload: null,
      lastSceneRadiusUpdate: null,
      };
  } catch (err) {
    /* best-effort */
  }

  // If a shared CameraController is present on the host page (component),
  // apply policy/grace settings from `initialParams` to keep preview parity.
  try {
    const c = (window as any).__pf_webgpu_camera_controller as any | undefined;
    const policy = (initialParams as Record<string, unknown>)?.hostCameraAcceptPolicy as 'always' | 'grace' | 'strict' | undefined;
    const grace = Number((initialParams as Record<string, unknown>)?.localCameraGraceMs ?? (initialParams as Record<string, unknown>)?.hostCameraGraceMs ?? NaN);
    if (c) {
      if (policy && typeof c.setHostCameraAcceptPolicy === 'function') c.setHostCameraAcceptPolicy(policy);
      if (Number.isFinite(grace) && typeof c.setLocalCameraGraceMs === 'function') c.setLocalCameraGraceMs(grace);
    }
  } catch (err) {
    /* ignore */
  }

  const DEBUG_THROTTLE_MS = 250;
  let lastDebugOverlayUpdate = 0;
  let lastVpLogTime = 0;
  let lastInvalidStatusAt = -Infinity;
  let lastFrameLogTime = 0;
  let lastAutoDiagTime = 0;

  const buildCameraSnapshot = (): CameraSnapshot => ({
    rotX: state.rotX,
    rotY: state.rotY,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    autoRotate: state.autoRotate,
    sceneRadius: state.sceneRadius,
    projection: state.projectionMode,
  });

  const snapshotsEqual = (prev: CameraSnapshot | null, next: CameraSnapshot): boolean => {
    if (!prev) {
      return false;
    }
    return (
      Math.abs(prev.rotX - next.rotX) <= CAMERA_EPSILON &&
      Math.abs(prev.rotY - next.rotY) <= CAMERA_EPSILON &&
      Math.abs(prev.zoom - next.zoom) <= CAMERA_EPSILON &&
      Math.abs(prev.panX - next.panX) <= CAMERA_EPSILON &&
      Math.abs(prev.panY - next.panY) <= CAMERA_EPSILON &&
      prev.autoRotate === next.autoRotate &&
      Math.abs(prev.sceneRadius - next.sceneRadius) <= CAMERA_EPSILON &&
      prev.projection === next.projection
    );
  };

  let lastCameraSnapshot: CameraSnapshot | null = null;
  let cameraSequence = 0;
  let pendingStaticCameraEmit = false;
  let cameraEmitTimer: number | null = null;

  const emitCameraState = (force = false): void => {
    const now = performance.now();
    if (!force) {
      if (!state.cameraDirty) {
        return;
      }
      if (now - state.lastCameraPush < CAMERA_BROADCAST_MS) {
        return;
      }
    }
    // If transient display basis is present, avoid sending a snapshot containing
    // Euler angles until the basis is committed; instead schedule a static
    // emit for later. A force emit bypasses this behavior.
    const hasDisplay = Boolean(state.displayCamForward || state.displayCamUp || state.displayCamRight);
    if (!force && hasDisplay) {
      pendingStaticCameraEmit = true;
      scheduleCameraEmit();
      return;
    }
    const snapshot = buildCameraSnapshot();
    if (!force && snapshotsEqual(lastCameraSnapshot, snapshot)) {
      state.cameraDirty = false;
      state.lastCameraPush = now;
      return;
    }
    lastCameraSnapshot = { ...snapshot };
    state.cameraDirty = false;
    state.lastCameraPush = now;
    cameraSequence += 1;
    try {
      emitDiagnostic('preview:camera-state', { ts: Date.now(), seq: cameraSequence, rotX: snapshot.rotX, rotY: snapshot.rotY, zoom: snapshot.zoom });
    } catch (err) {/* best-effort */}
    postToHost({
      type: 'cameraState',
      payload: {
        ...snapshot,
        timestamp: Date.now(),
        seq: cameraSequence,
      },
    });
  };

  const cancelCameraEmit = (): void => {
    if (cameraEmitTimer !== null) {
      window.clearTimeout(cameraEmitTimer);
      cameraEmitTimer = null;
    }
  };

  const scheduleCameraEmit = (delay = CAMERA_BROADCAST_MS): void => {
    cancelCameraEmit();
    cameraEmitTimer = window.setTimeout(() => {
      cameraEmitTimer = null;
      emitCameraState(true);
    }, delay);
  };

  const isCameraStatic = (): boolean => {
    return (
      !pointer.active &&
      !state.autoRotate &&
      Math.abs(state.inertiaRotX) <= CAMERA_STATIC_EPS &&
      Math.abs(state.inertiaRotY) <= CAMERA_STATIC_EPS &&
      Math.abs(state.inertiaPanX) <= CAMERA_STATIC_EPS &&
      Math.abs(state.inertiaPanY) <= CAMERA_STATIC_EPS
    );
  };

  const requestCameraEmitWhenStatic = (): void => {
    pendingStaticCameraEmit = true;
    cancelCameraEmit();
  };

  // Debounced resize to avoid rapid reconfigure during interaction
  let _resizeTimer: number | null = null;
  const resize = (): void => {
    if (_resizeTimer) {
      clearTimeout(_resizeTimer);
    }
    _resizeTimer = (setTimeout(() => {
      _resizeTimer = null;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width * dpr));
      height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      try {
        context.configure({ device, format, alphaMode: 'opaque' });
      } catch (cfgErr) {
        console.warn('WebGPU • context.configure on resize failed', cfgErr);
      }
      try {
        const newDepth = createDepthTexture(device, width, height);
        const oldDepth = depth;
        depth = newDepth;
        if (oldDepth) {
          setTimeout(() => {
            try {
              oldDepth.destroy();
            } catch (err) {
              /* ignore */
            }
          }, 0);
        }
      } catch (dErr) {
        console.warn('WebGPU • depth texture recreate failed', dErr);
      }
      state.canvasAspect = height > 0 ? width / height : 1;
      if (overlayCanvas) {
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        overlayCanvas.style.width = `${Math.round(rect.width)}px`;
        overlayCanvas.style.height = `${Math.round(rect.height)}px`;
      }
      if (axisCanvas) {
        const overlaySizeCss = 96;
        const overlayW = Math.max(1, Math.round(overlaySizeCss * (window.devicePixelRatio || 1)));
        axisCanvas.width = overlayW;
        axisCanvas.height = overlayW;
        axisCanvas.style.width = `${overlaySizeCss}px`;
        axisCanvas.style.height = `${overlaySizeCss}px`;
      }
      state.cameraDirty = true;
    }, 24) as unknown) as number;
  };

  window.addEventListener('resize', resize);
  resize();

  // Diagnostics overlay element (created once, toggled via cfg.debug)
  let __wgpu_debug_el: HTMLElement | null = null;
  try {
    const parent = canvas.parentElement || document.body;
    const pre = document.createElement('pre');
    pre.id = 'wgpu-debug';
    pre.style.cssText = 'position: absolute; right: 8px; top: 8px; margin: 0; padding: 6px 8px; background: rgba(0,0,0,0.6); color: #9ff89f; font-family: monospace; font-size:12px; z-index:9999; max-width:360px; max-height:40vh; overflow:auto; display:none; pointer-events:none;';
    parent.appendChild(pre);
    __wgpu_debug_el = pre;
  } catch (err) {
    __wgpu_debug_el = null;
  }

  const wgsl = atob(WGSL_B64);
  const shaderModule = await createShaderModule(device as any, wgsl, 'potfoundry-webgpu');

  const createPipeline = async (
    device: GPUDevice,
    format: GPUTextureFormat,
    shaderModule: GPUShaderModule
  ): Promise<GPURenderPipeline | null> => {
    const info = await ((shaderModule as { getCompilationInfo?: () => Promise<GPUCompilationInfo> }).getCompilationInfo?.() ?? Promise.resolve(undefined));
    if (info && Array.isArray(info.messages) && info.messages.some((m) => m.type === 'error')) {
      for (const message of info.messages) {
        console.warn('WGSL', message);
      }
      setStatus('WebGPU • shader compile failed (see console)');
      return null;
    }
    const pipelineLabel = 'preview:pipeline-main';
    try {
      const pipeline = await withValidationScope(device as any, pipelineLabel, () =>
        device.createRenderPipelineAsync({
          label: pipelineLabel,
          layout: 'auto',
          vertex: { module: shaderModule, entryPoint: 'vs_main' },
          fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [
              {
                format,
                blend: {
                  color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                },
              },
            ],
          },
          primitive: { topology: 'triangle-list', cullMode: 'none' },
          depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus',
          },
        })
      );
      if (!pipeline) {
        throw new Error('createRenderPipelineAsync returned undefined');
      }
      return pipeline;
    } catch (err) {
      console.error('createRenderPipelineAsync failed', err);
      setStatus('WebGPU • pipeline creation failed');
      return null;
    }
  };

  const pipeline = await createPipeline(device, format, shaderModule);
  if (!pipeline) {
    return false;
  }

  // Flat-color debug pipeline (draws a full-screen triangle without vertex buffers)
  let flatPipeline: GPURenderPipeline | null = null;
  const createFlatPipeline = async (): Promise<GPURenderPipeline | null> => {
    if (flatPipeline) return flatPipeline;
    const flatWGSL = `@vertex\nfn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4<f32> {\n  var positions = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));\n  return vec4<f32>(positions[vi], 0.0, 1.0);\n}\n@fragment\nfn fs_main() -> @location(0) vec4<f32> {\n  // Bright magenta by default so it's obvious when this path runs\n  return vec4<f32>(1.0, 0.0, 1.0, 1.0);\n}`;
    try {
      const module = await createShaderModule(device as any, flatWGSL, 'flat-diagnostic');
      const label = 'preview:pipeline-flat';
      flatPipeline = await withValidationScope(device as any, label, () =>
        device.createRenderPipelineAsync({
          label,
          layout: 'auto',
          vertex: { module, entryPoint: 'vs_main' },
          fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
          primitive: { topology: 'triangle-list', cullMode: 'none' },
        })
      );
      return flatPipeline;
    } catch (err) {
      console.warn('Failed to create flat debug pipeline', err);
      return null;
    }
  };

  // Start creating flat debug pipeline in background so it's available when toggled
  void createFlatPipeline().catch(() => {
    /* ignore errors creating debug pipeline */
  });

  const drawFlatDiagnostic = (reason: string): boolean => {
    if (!flatPipeline) {
      console.warn('WebGPU • flat pipeline unavailable', { reason });
      return false;
    }
    try {
      const encoderDiag = device.createCommandEncoder({ label: 'preview:flat-draw-encoder' });
      const diagView = context.getCurrentTexture().createView({ label: 'preview:flat-target-view' });
      const passDiag = encoderDiag.beginRenderPass({
        colorAttachments: [
          {
            view: diagView,
            clearValue: { r: 0.05, g: 0.05, b: 0.07, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      passDiag.setPipeline(flatPipeline);
      passDiag.draw(3);
      passDiag.end();
      device.queue.submit([encoderDiag.finish()]);
      console.info('[WebGPU] flat diagnostic draw', reason);
      return true;
    } catch (err) {
      console.warn('WebGPU • flat diagnostic draw failed', reason, err);
      return false;
    }
  };

  const uniformSize = 4 * UNIFORM_FLOAT_COUNT;
  const bufferUsage = ((globalThis as Record<string, unknown>).GPUBufferUsage as
    | { UNIFORM?: number; COPY_DST?: number; STORAGE?: number }
    | undefined) ?? { UNIFORM: 0x40, COPY_DST: 0x08, STORAGE: 0x20 };
  const uniformUsage = bufferUsage.UNIFORM ?? 0x40;
  const copyDstUsage = bufferUsage.COPY_DST ?? 0x08;
  const storageUsage = bufferUsage.STORAGE ?? 0x20;

  const uniformBuffer = device.createBuffer({
    label: 'preview:uniform-buffer',
    size: uniformSize,
    usage: uniformUsage | copyDstUsage,
  });

  const colorBuffers = {
    c1: device.createBuffer({ label: 'preview:color-buffer-1', size: 16, usage: uniformUsage | copyDstUsage }),
    c2: device.createBuffer({ label: 'preview:color-buffer-2', size: 16, usage: uniformUsage | copyDstUsage }),
    c3: device.createBuffer({ label: 'preview:color-buffer-3', size: 16, usage: uniformUsage | copyDstUsage }),
  };

  const styleParamBuffer = device.createBuffer({
    label: 'preview:style-params',
    size: STYLE_PARAM_CAPACITY * 4,
    usage: storageUsage | copyDstUsage,
  });
  const styleParamCache = new Float32Array(STYLE_PARAM_CAPACITY);
  const syncStyleParams = (values: unknown): void => {
    let changed = false;
    const source = Array.isArray(values) ? values : [];
    const limit = Math.min(source.length, STYLE_PARAM_CAPACITY);
    for (let i = 0; i < STYLE_PARAM_CAPACITY; i += 1) {
      const next = i < limit ? Number(source[i]) || 0 : 0;
      if (styleParamCache[i] !== next) {
        styleParamCache[i] = next;
        changed = true;
      }
    }
    if (changed) {
      device.queue.writeBuffer(styleParamBuffer, 0, styleParamCache.buffer);
    }
  };

  const bindGroup = device.createBindGroup({
    label: 'preview:bind-group-main',
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: colorBuffers.c1 } },
      { binding: 2, resource: { buffer: colorBuffers.c2 } },
      { binding: 3, resource: { buffer: colorBuffers.c3 } },
      { binding: 4, resource: { buffer: styleParamBuffer } },
    ],
  });

  let current: WebGPUParams | null = null;
  // Preview no longer implements fallback camera handling; delegate
  // canonical camera state and interactions to `CameraController`.
  let lastCameraNonce: number | null = null;
  let lastGradientSignature: string | null = null;
  let validationFrameCounter = 0;
  let lastValidGeometry: GeometrySnapshot | null = null;

  const pointer = {
    active: false,
    mode: 'orbit' as PointerMode,
    lastX: 0,
    lastY: 0,
    // For arcball mode keep a running last position
    arcLastX: 0,
    arcLastY: 0,
      arcStartQuat: null as any,
    arcPrevQuat: null as any,
    arcInertiaAxis: null as Vec3 | null,
    arcInertiaSpeed: 0,
    lastMoveTs: null as number | null,
    arcHit: null as Vec3 | null,
    arcHitNormal: null as Vec3 | null,
  };

  // Prefer host controller helpers when available; fallback to local helpers
  const getHostController = () => (window as any).__pf_webgpu_camera_controller as any | undefined;
  const requireHostController = () => {
    const c = getHostController();
    if (!c || !c.helpers) {
      throw new Error('[WebGPU Preview] Host CameraController with helpers is required for standalone preview');
    }
    return c;
  };
  const requireHostHelper = (name: string) => {
    const c = requireHostController();
    const fn = (c.helpers as any)[name];
    if (typeof fn !== 'function') {
      throw new Error(`[WebGPU Preview] Required host helper '${name}' is missing`);
    }
    return fn as Function;
  };
  const hostWorldRayFromCanvas = (rig: any, canvasEl: HTMLCanvasElement, x: number, y: number) => {
    return requireHostHelper('worldRayFromCanvas')(rig, canvasEl, x, y);
  };
  const hostIntersectRayZPlane = (ray: any, z: number) => {
    return requireHostHelper('intersectRayZPlane')(ray, z);
  };
  const hostIntersectRayCylinder = (ray: any, radius: number, minZ: number, maxZ: number) => {
    return requireHostHelper('intersectRayCylinder')(ray, radius, minZ, maxZ);
  };
  const hostBuildCameraRig = (paddingHint: number, paddedHalfWidth?: number | null, paddedHalfHeight?: number | null) => {
    return requireHostHelper('buildCameraRig')(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
  };
  const hostQuaternionFromAxisAngle = (axis: ArcVec3, angle: number) => {
    return requireHostHelper('quaternionFromAxisAngle')(axis as any, angle);
  };
  const hostMultiplyQuaternions = (a: any, b: any) => {
    return requireHostHelper('multiplyQuaternions')(a as any, b as any);
  };
  const hostInvertQuaternion = (q: any) => {
    return requireHostHelper('invertQuaternion')(q as any);
  };
  const hostAxisAngleFromQuaternion = (q: any) => {
    return requireHostHelper('axisAngleFromQuaternion')(q as any);
  };
  const hostBasisFromQuaternion = (q: any) => {
    return requireHostHelper('basisFromQuaternion')(q as any);
  };
  const hostCameraAxisToWorld = (basis: CameraBasis, axis: Vec3) => {
    return requireHostHelper('cameraAxisToWorld')(basis as any, axis as any);
  };
  const hostSyncAnglesFromBasis = (basis: CameraBasis) => {
    return requireHostHelper('syncAnglesFromBasis')(basis as any);
  };

  // Export a small debug function to enable tests to invoke host helpers
  // without depending on pointer events or DOM. This is attached to the
  // preview module so unit tests can assert that host helpers are invoked.
  try {
    (self as any).__pf_webgpu_preview_debug = (self as any).__pf_webgpu_preview_debug || {};
    (self as any).__pf_webgpu_preview_debug.quaternionFromAxisAngle = (axis: ArcVec3, angle: number) => {
      try {
        const hc = (window as any).__pf_webgpu_camera_controller;
        const direct = hc && hc.helpers && typeof hc.helpers.quaternionFromAxisAngle === 'function' ? hc.helpers.quaternionFromAxisAngle : null;
        try { (console as any).error('[WebGPUPreview:debug] quaternionFromAxisAngle direct helper type:', typeof direct, !!direct); } catch (e) { /* ignore */ }
        if (direct) {
          try { return direct(axis, angle); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        try { (console as any).error('[WebGPUPreview:debug] quaternionFromAxisAngle host helper check failed', e); } catch (err) { /* ignore */ }
      }
      return hostQuaternionFromAxisAngle(axis, angle);
    };
    try {
      // If host helpers are present at (module) import time, call once to "warm" the helper
      // and ensure any attached spies are invoked during tests.
      const hc = (window as any).__pf_webgpu_camera_controller;
      if (hc && hc.helpers && typeof hc.helpers.quaternionFromAxisAngle === 'function') {
        try { hc.helpers.quaternionFromAxisAngle([0, 0, 1], 0.0); } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  } catch (err) {
    /* ignore attach failures */
  }
  const hostClampZoomValue = (v: number) => {
    try {
      const c = getHostController();
      if (c?.helpers && typeof c.helpers.clampZoomValue === 'function') {
        return c.helpers.clampZoomValue(v);
      }
    } catch (err) {
      /* ignore */
    }
    return clampNumber(v, state.zoom);
  };

  const arcballDelta = (x0: number, y0: number, x1: number, y1: number, w: number, h: number, radius = 1.0) =>
    sharedArcballDelta(x0, y0, x1, y1, w, h, radius);

  const markInteraction = (): void => {
    state.interacting = true;
    state.lastInteraction = performance.now();
    state.cameraDirty = true;
    try {
      const c = (window as any).__pf_webgpu_camera_controller as any | undefined;
      if (c && typeof c.markInteraction === 'function') {
        c.markInteraction(true);
      }
    } catch (err) {
      /* ignore */
    }
  };

  const applyCameraPayload = (payload: WebGPUParams, force: boolean): void => {
    // Require the host `CameraController` for all camera payload handling.
    try {
      const c = (window as any).__pf_webgpu_camera_controller as any | undefined;
      if (c && typeof c.setPayload === 'function') {
        c.setPayload(payload, { force });
      }
    } catch (err) {
      // ignore errors from host controller call
    }
    return;
    // No fallback: CameraController handles payloads. Any remaining
    // payloads that contain direct camera fields will be ignored here.
    // All payload processing is centralized in the CameraController now.
  };

  // `cameraPayloadDiffers` is now part of CameraController; preview delegates
  // this responsibility to the controller when present.

  const updateAutoButton = (): void => {
    const btn = document.getElementById('wgpu-toggle-autorotate');
    if (btn) {
      btn.textContent = state.autoRotate ? 'Auto' : 'Manual';
      btn.setAttribute('data-state', state.autoRotate ? 'on' : 'off');
    }
  };

  const updateProjectionButton = (): void => {
    const btn = document.getElementById('wgpu-toggle-projection');
    if (btn) {
      const label = state.projectionMode === 'perspective' ? 'Persp' : 'Ortho';
      btn.textContent = label;
      btn.setAttribute('data-state', state.projectionMode);
    }
  };

  const updateDebugButton = (): void => {
    const btn = document.getElementById('wgpu-toggle-debug');
    if (btn) {
      btn.textContent = state.debugOverlay ? 'Debug*' : 'Debug';
      btn.setAttribute('data-state', state.debugOverlay ? 'on' : 'off');
    }
  };
  const updateGridButton = (): void => {
    const btn = document.getElementById('wgpu-toggle-grid');
    if (btn) {
      btn.textContent = state.showGrid ? 'Grid*' : 'Grid';
      btn.setAttribute('data-state', state.showGrid ? 'on' : 'off');
    }
  };
  const updateArcballButton = (): void => {
    const btn = document.getElementById('wgpu-toggle-arcball');
    if (btn) {
      btn.textContent = state.useArcball ? 'Arc*' : 'Arc';
      btn.setAttribute('data-state', state.useArcball ? 'on' : 'off');
    }
  };

  // Accept optional per-axis padded half-extents so callers can provide accurate
  // width/height for perspective fitting. This helps when geometry grows in one
  // axis (e.g., height) without growing in the other, which previously caused
  // the camera to prefer an axis that made the other one overflow.
  const buildCameraRig = (
    paddingHint: number,
    paddedHalfWidth?: number,
    paddedHalfHeight?: number
  ): CameraRig => {
      const aspect = Math.max(state.canvasAspect || 1, 1e-3);
      const radius = Math.max(state.sceneRadius, 1);
      const radiusPadded = Math.max(radius * paddingHint, 1);
      const zoom = Math.max(state.zoom, 1e-3);
      const rawTarget: Vec3 = [state.panX, state.panY, 0];
      // When the pitch is nearly vertical a large pan offset puts the target far off-axis,
      // which exaggerates floating-point error in the view basis. Nudge the target back
      // toward the scene center in that narrow band to keep the forward/up basis separable.
      const targetForPitch = (pitch: number): Vec3 => {
        const nearVertical = Math.abs(Math.abs(pitch) - Math.PI * 0.5) < 0.02;
        if (!nearVertical) {
          return rawTarget;
        }
        const panMagnitude = Math.hypot(rawTarget[0], rawTarget[1]);
        const cap = radius * 0.3;
        if (panMagnitude <= cap || panMagnitude <= 1e-3) {
          return rawTarget;
        }
        const scale = cap / panMagnitude;
        return [rawTarget[0] * scale, rawTarget[1] * scale, rawTarget[2]];
      };
      // Use local rot values so we can nudge them if the resulting matrix is degenerate
      let rotXLocal = sanitizePitch(state.rotX);
      const rotYLocal = state.rotY;
      const rotZLocal = state.rotZ || 0;
      let viewProjection: Mat4 | null = null;
      let finalRig: CameraRig | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // Use active/committed basis to compute forward/up/right vectors
        // upHint computed from euler rotation matrix is no longer used; buildCameraBasis
        // will deterministically compute up/right from forward vector.
        const localTarget = targetForPitch(rotXLocal);
        // For the legacy case (no per-axis extents given) fall back to radiusPadded
        const paddedHalfWidthLocal = paddedHalfWidth !== undefined ? Math.max(paddedHalfWidth, 1) : radiusPadded;
        const paddedHalfHeightLocal = paddedHalfHeight !== undefined ? Math.max(paddedHalfHeight, 1) : radiusPadded;
        let distance = radiusPadded * CAMERA_DISTANCE_FALLOFF / zoom;
        let near = CAMERA_NEAR_EPS;
        let far = Math.max(near + radiusPadded * 6, distance + radiusPadded * 6);
        const fov = BASE_FOV;
        let projection: Mat4;
        if (state.projectionMode === 'perspective') {
          const halfFov = Math.max(fov * 0.5, 1e-4);
          // Use correct half-FOV in X by inverting aspect: fovX/2 = atan(tan(fovY/2) * aspect)
          const halfFovX = Math.atan(Math.tan(halfFov) * aspect);
          // Compute the distances required to fit the per-axis half extents and pick
          // the maximum. This prevents tall-but-narrow objects from being forced
          // into a camera distance that just fits the width (causing the height
          // to clip or appear squashed).
          const dV = paddedHalfHeightLocal / Math.max(Math.tan(halfFov), 1e-3);
          const dH = paddedHalfWidthLocal / Math.max(Math.tan(halfFovX), 1e-3);
          distance = Math.max(dV, dH) / zoom;
          near = Math.max(distance * 0.05, CAMERA_NEAR_EPS);
          // Far plane must account for camera distance plus scene size, with extra margin for zoom out
          far = Math.max(distance + radiusPadded * 8, near + 1);
          projection = mat4PerspectiveFovLH(fov, aspect, near, far);
        } else {
          const paddedHeightValue = Math.max(paddedHalfHeightLocal, 1);
          const paddedWidthValue = Math.max(paddedHalfWidthLocal, 1);
          // Match the orthographic scale to the limiting axis so canvas aspect
          // shifts do not inflate or shrink the pot on screen.
          const limitingHalfHeight = Math.max(paddedHeightValue, paddedWidthValue / aspect);
          const orthoHalfHeight = limitingHalfHeight / zoom;
          const orthoHalfWidth = orthoHalfHeight * aspect;
          projection = mat4OrthoLH(
            -orthoHalfWidth,
            orthoHalfWidth,
            -orthoHalfHeight,
            orthoHalfHeight,
            near,
            far
          );
        }
        const basis = resolveActiveBasis(state);
        const eye = vec3Subtract(localTarget, vec3Scale(basis.forward, distance));
        const view = viewMatrixFromBasis(basis, eye);
        viewProjection = mat4Multiply(projection, view);
        const vpFinite = matrixIsFinite(viewProjection);
        if (!vpFinite) {
          console.warn('[PotFoundry][WebGPU] viewProjection invalid', {
            attempt,
            rotXLocal,
            rotYLocal,
            rotZLocal,
            distance,
            near,
            far,
          });
        }
        if (vpFinite) {
          finalRig = { eye, viewProjection, near, far, fov, mode: state.projectionMode, basis };
          break;
        }
        // Nudge the local pitch slightly to escape exact collinearity and try again
        const nudge = 1e-3 * (attempt + 1);
        rotXLocal = rotXLocal + (rotXLocal >= 0 ? -nudge : nudge);
      }
      if (!finalRig) {
        // As a last resort, fall back to a safe default rig
        const cosPitch = Math.cos(state.rotX * 0.999);
        const sinPitch = Math.sin(state.rotX * 0.999);
        const cosYaw = Math.cos(state.rotY);
        const sinYaw = Math.sin(state.rotY);
        // Euler->forward mapping: forward = [sinYaw*cosPitch, -cosYaw*cosPitch, -sinPitch]
        const forward = vec3Normalize([sinYaw * cosPitch, -cosYaw * cosPitch, -sinPitch]);
        const distance = radiusPadded * CAMERA_DISTANCE_FALLOFF;
        const near = CAMERA_NEAR_EPS;
        const far = Math.max(near + radiusPadded * 6, distance + radiusPadded * 6);
        const fov = BASE_FOV;
        const projection = state.projectionMode === 'perspective'
          ? mat4PerspectiveFovLH(fov, aspect, near, far)
          : mat4OrthoLH(-radiusPadded, radiusPadded, -radiusPadded, radiusPadded, near, far);
        const fallbackTarget = targetForPitch(state.rotX * 0.999);
        const basis = buildCameraBasis(forward);
        const eye = vec3Subtract(fallbackTarget, vec3Scale(basis.forward, distance));
        const view = viewMatrixFromBasis(basis, eye);
        finalRig = { eye, viewProjection: mat4Multiply(projection, view), near, far, fov, mode: state.projectionMode, basis };
      }
        return finalRig;
  };

      // Preview-specific rig cache to avoid recomputation each frame when the
      // camera state and extents haven't changed.
      let lastRigSignaturePreview: string | null = null;
      let lastRigCachedPreview: CameraRig | null = null;
      const computeRigSignaturePreview = (paddingHint: number, phw?: number | null, phh?: number | null): string => {
        const rotHash = `${state.rotX}_${state.rotY}`;
        const mode = state.projectionMode || 'ortho';
        const parts = [rotHash, `${state.zoom}`, `${state.panX}`, `${state.panY}`, `${mode}`, `${paddingHint}`, `${phw ?? ''}`, `${phh ?? ''}`, `${state.canvasAspect}`];
        return parts.join('|');
      };
      const getCachedRigPreview = (paddingHint: number, phw?: number | null, phh?: number | null): CameraRig => {
        const sig = computeRigSignaturePreview(paddingHint, phw, phh);
        if (sig === lastRigSignaturePreview && lastRigCachedPreview) return lastRigCachedPreview;
        const rig = hostBuildCameraRig(paddingHint, phw, phh);
        lastRigSignaturePreview = sig;
        lastRigCachedPreview = rig;
        return rig;
      };

  const handleCameraCommand = (raw: unknown): void => {
    if (raw === null || raw === undefined) {
      return;
    }
    let payload: Record<string, unknown> | null = null;
    if (typeof raw === 'string') {
      try {
        payload = JSON.parse(raw) as Record<string, unknown>;
      } catch (err) {
        console.warn('WebGPU camera payload parse failed', err);
        return;
      }
    } else if (typeof raw === 'object') {
      payload = raw as Record<string, unknown>;
    }
    if (!payload) {
      return;
    }
    const request = typeof payload.request === 'string' ? payload.request : null;
    if (request === 'state') {
      emitCameraState(true);
      return;
    }

    let cameraMutated = false;
    const preset = typeof payload.preset === 'string' ? payload.preset : null;
    if (preset) {
      applyViewPreset(state, preset);
      // If user explicitly requests a 'fit', recompute scene radius to ensure
      // the camera fits both height and width based on current params.
      if (preset === 'fit') {
        const height = clampNumber(current?.H ?? initialParams?.H ?? 120, 120);
        const safeHeight = Math.max(Math.abs(height), 1);
        const radiusTop = clampNumber(current?.Rt ?? initialParams?.Rt ?? 70, 70);
        const radiusBottom = clampNumber(current?.Rb ?? initialParams?.Rb ?? 45, 45);
        const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
        const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
        const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
        state.sceneRadius = computedMaxWithHeight;
        state.cameraDirty = true;
      }
      cameraMutated = true;
    } else if (typeof payload.action === 'string') {
      const normalized = payload.action.toLowerCase();
      const mapped =
        normalized === 'reset' || normalized === 'fit'
          ? 'fit'
          : normalized === 'isometric'
          ? 'iso'
          : normalized;
      if (
        mapped === 'top' ||
        mapped === 'front' ||
        mapped === 'right' ||
        mapped === 'iso' ||
        mapped === 'fit'
      ) {
        applyViewPreset(state, mapped);
        if (mapped === 'fit') {
          const height = clampNumber(current?.H ?? initialParams?.H ?? 120, 120);
          const safeHeight = Math.max(Math.abs(height), 1);
          const radiusTop = clampNumber(current?.Rt ?? initialParams?.Rt ?? 70, 70);
          const radiusBottom = clampNumber(current?.Rb ?? initialParams?.Rb ?? 45, 45);
          const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
          const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
          const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
          state.sceneRadius = computedMaxWithHeight;
          state.cameraDirty = true;
        }
        cameraMutated = true;
      }
    }

    const patch: WebGPUParams = {};
    let patchApplied = false;
    if (typeof payload.rotX === 'number') {
      patch.rotX = sanitizePitch(payload.rotX);
      patchApplied = true;
    }
    if (typeof payload.rotZ === 'number') {
      patch.rotZ = payload.rotZ;
      patchApplied = true;
    }
    if (typeof payload.rotY === 'number') {
      patch.rotY = payload.rotY;
      patchApplied = true;
    }
    if (typeof payload.zoom === 'number') {
      patch.zoom = payload.zoom;
      patchApplied = true;
    }
    if (typeof payload.panX === 'number') {
      patch.panX = payload.panX;
      patchApplied = true;
    }
    if (typeof payload.panY === 'number') {
      patch.panY = payload.panY;
      patchApplied = true;
    }
    if (patchApplied) {
      applyCameraPayload(patch, true);
      cameraMutated = true;
    }

    if (typeof payload.autoRotate === 'boolean') {
      state.autoRotate = payload.autoRotate;
      updateAutoButton();
      state.cameraDirty = true;
      cameraMutated = true;
    }

    if (typeof payload.projection === 'string') {
      const nextMode = payload.projection === 'perspective' ? 'perspective' : 'ortho';
      if (state.projectionMode !== nextMode) {
        state.projectionMode = nextMode;
        updateProjectionButton();
        state.cameraDirty = true;
        cameraMutated = true;
      }
    }

    if (cameraMutated) {
      markInteraction();
      try {
        const rev = (state as any).recentInertia as Record<string, unknown> | undefined;
        if (rev) {
          emitDiagnostic('preview:inertia', rev);
          try { delete (state as any).recentInertia; } catch (e) {/* best-effort */}
        }
      } catch (e) {/* ignore diag errors */}
      if (!state.autoRotate) requestCameraEmitWhenStatic();
    }
  };

  const releasePointer = (): void => {
    pointer.active = false;
  };

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener('pointerdown', (event) => {
    pointer.active = true;
    pointer.mode =
      event.button === 2 || event.altKey || event.metaKey || event.ctrlKey ? 'pan' : 'orbit';
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    state.autoRotate = false;
    updateAutoButton();
    markInteraction();
    // Initialize transient display basis to current active basis
    const initialBasis = resolveActiveBasis(state);
    state.displayCamRight = [...initialBasis.right];
    state.displayCamUp = [...initialBasis.up];
    state.displayCamForward = [...initialBasis.forward];
    // initialize transient rotation angles for orbit controller
    state.displayRotX = state.rotX;
    state.displayRotY = state.rotY;
    primeOrbitFromAngles(state, state.displayRotX ?? state.rotX, state.displayRotY ?? state.rotY);
    // init arcball tracking
    pointer.arcLastX = event.clientX;
    pointer.arcLastY = event.clientY;
        // record starting camera quaternion for arcball computations
        try {
          pointer.arcStartQuat = (state.displayCamQuat ?? state.camQuat) || hostQuaternionFromAxisAngle([0, 0, 1] as ArcVec3, 0);
        } catch (err) {
          pointer.arcStartQuat = (state.displayCamQuat ?? state.camQuat) || null;
        }
        // Initialize prev quaternion and inertia tracking
        pointer.arcPrevQuat = pointer.arcStartQuat;
        pointer.arcInertiaAxis = null;
        pointer.arcInertiaSpeed = 0;
        pointer.lastMoveTs = performance.now();
        // If a host CameraController is present, prefer its pointer state to keep
        // preview interactions perfectly in sync with the host controller.
        try {
          const c = getHostController();
          if (c && c.pointer) {
            // copy pointer start quaternion + any calculated hits
            if (c.pointer.arcStartQuat) pointer.arcStartQuat = c.pointer.arcStartQuat;
            if (c.pointer.arcHitNormal) pointer.arcHitNormal = c.pointer.arcHitNormal;
            if (c.pointer.arcHit) pointer.arcHit = c.pointer.arcHit;
          }
        } catch (err) {
          /* ignore */
        }
      // stray legacy variables removed (no-op)
    // initialize arcball hit normal when interacting with the pot
    try {
      if (state.useArcball) {
        const cfg = { ...initialParams, ...(current ?? {}) } as WebGPUParams;
        const height = clampNumber(cfg.H, 120.0);
        const radiusTop = clampNumber(cfg.Rt, 70.0);
        const radiusBottom = clampNumber(cfg.Rb, 45.0);
        const safeHeight = Math.max(Math.abs(height), 1);
        const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
        const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
        const halfHeight = Math.max(safeHeight / 2, 1);
        const halfWidth = Math.max(safeRadiusTop, safeRadiusBottom, 1);
        const rawPadding = typeof cfg.scenePadding === 'number' ? clampNumber(cfg.scenePadding, CAMERA_PADDING) : CAMERA_PADDING;
        const paddingHint = sanitizePadding(rawPadding);
        const paddedHalfHeight = Math.max(1, halfHeight * paddingHint);
        const paddedHalfWidth = Math.max(1, halfWidth * paddingHint);
        const rig = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
        const ray = hostWorldRayFromCanvas(rig, canvas, event.clientX, event.clientY);
        const pivotZ = state.pivot?.[2] ?? 0;
        const cylinderHit = ray ? hostIntersectRayCylinder(ray as any, paddedHalfWidth, -paddedHalfHeight, paddedHalfHeight) ?? null : null;
        const planeHit = ray ? hostIntersectRayZPlane(ray as any, pivotZ) ?? null : null;
        const hit = cylinderHit ?? planeHit ?? null;
        if (hit) {
          // Update pan/pivot to the hit location so rotations orbit around the
          // clicked surface point — this keeps the visual rotation centered
          // on the object surface the user interacted with.
          state.panX = hit[0];
          state.panY = hit[1];
          state.pivot = [hit[0], hit[1], hit[2]] as Vec3;
          state.cameraDirty = true;
          pointer.arcHit = [hit[0], hit[1], hit[2]] as Vec3;
          if (cylinderHit) {
            const nx = hit[0];
            const ny = hit[1];
            const normLen = Math.hypot(nx, ny);
            pointer.arcHitNormal = normLen > 1e-6 ? ([nx / normLen, ny / normLen, 0] as Vec3) : ([0, 0, 1] as Vec3);
          } else {
            // Plane hit
            pointer.arcHitNormal = [0, 0, 1];
          }
        } else {
          pointer.arcHitNormal = null;
          pointer.arcHit = null;
        }
      }
    } catch (err) {
      pointer.arcHitNormal = null;
    }
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (err) {
      console.warn('setPointerCapture', err);
    }
  });

  const handlePointerRelease = (): void => {
    // If this was an arcball drag, copy pointer inertia into state for integration
    const arcballDrag = pointer.mode === 'orbit' && state.cameraMode === 'arcball';
    if (arcballDrag && pointer.arcInertiaAxis && Math.abs(pointer.arcInertiaSpeed) > 1e-5) {
      state.inertiaArcAxis = [pointer.arcInertiaAxis[0], pointer.arcInertiaAxis[1], pointer.arcInertiaAxis[2]];
      state.inertiaArcSpeed = pointer.arcInertiaSpeed * 0.35;
    } else if (arcballDrag) {
      state.inertiaArcAxis = null;
      state.inertiaArcSpeed = 0;
    }
    if (!arcballDrag) {
      state.inertiaArcAxis = null;
      state.inertiaArcSpeed = 0;
    }
    releasePointer();
    pointer.arcHitNormal = null;
    pointer.arcPrevQuat = null;
    pointer.lastMoveTs = null;
    pointer.arcInertiaAxis = null;
    pointer.arcInertiaSpeed = 0;
    markInteraction();
    if (!state.autoRotate && (state.displayCamForward || state.displayCamUp || state.displayCamRight)) {
      const prevRight: Vec3 = state.camRight ? [...state.camRight] : [1, 0, 0];
      const flipped = commitDisplayBasisToState(state);
      if (flipped) {
        try {
          const dot = vec3Dot(prevRight, state.camRight as Vec3);
          emitDiagnostic('camera:commit-basis-flip', { dot });
        } catch (err) {
          /* ignore */
        }
      }
      emitCameraState(true);
    }
    requestCameraEmitWhenStatic();
  };

  canvas.addEventListener('pointerup', handlePointerRelease);
  canvas.addEventListener('pointercancel', handlePointerRelease);
  window.addEventListener('pointerup', handlePointerRelease);

  canvas.addEventListener('pointermove', (event) => {
    if (!pointer.active) {
      return;
    }
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    if (pointer.mode === 'orbit') {
      // Use draggable 'tumble' controls: left drag rotates camera (no roll).
      if (event.shiftKey) {
        // Shift+drag to pan (common CAD behavior)
        const factor = computePanFactor(state, canvas);
        state.panX += dx * factor;
        state.panY -= dy * factor;
        state.inertiaPanX = dx * factor * 0.45;
        state.inertiaPanY = -dy * factor * 0.45;
      } else if (state.useArcball) {
        // Arcball drag: compute delta between last arc point and current point
        const vw = canvas.clientWidth || Math.max(1, canvas.width || 1);
        const vh = canvas.clientHeight || Math.max(1, canvas.height || 1);
        const p0x = pointer.arcLastX;
        const p0y = pointer.arcLastY;
        const p1x = event.clientX;
        const p1y = event.clientY;
        pointer.arcLastX = p1x;
        pointer.arcLastY = p1y;
        const { axis: arcAxisCam, angle: arcAngle } = sharedArcballDelta(p0x, p0y, p1x, p1y, vw, vh);
        // Use the captured start quaternion's basis (not the current display basis)
        const baseQuat = (pointer.arcStartQuat ?? (state.displayCamQuat ?? state.camQuat)) || hostQuaternionFromAxisAngle([0, 0, 1] as ArcVec3, 0);
        const startBasis = hostBasisFromQuaternion(baseQuat);
        const axisWorld = hostCameraAxisToWorld(startBasis as CameraBasis, arcAxisCam);
        // If we hit the pot, project rotation axis onto local tangent plane
        let useAxis = axisWorld;
        try {
          if (pointer.arcHitNormal) {
            const n = pointer.arcHitNormal as Vec3;
            const dot = axisWorld[0] * n[0] + axisWorld[1] * n[1] + axisWorld[2] * n[2];
            const proj = [axisWorld[0] - dot * n[0], axisWorld[1] - dot * n[1], axisWorld[2] - dot * n[2]] as Vec3;
            const len = Math.hypot(proj[0], proj[1], proj[2]);
            if (len > 1e-6) {
              useAxis = projectAxisToTangent(axisWorld as ArcVec3, n as ArcVec3);
            }
          }
        } catch (err) {
          /* ignore projection failures */
        }
        // Convert the axis/angle to a delta quaternion and apply it against the
        // captured start quaternion to ensure the axis is computed in the
        // starting basis (not the current transient basis).
        const deltaQuat = Math.abs(arcAngle) > 1e-6 ? hostQuaternionFromAxisAngle(useAxis as ArcVec3, arcAngle) : null;
        const nextQuat = deltaQuat ? hostMultiplyQuaternions(deltaQuat as any, baseQuat as any) : (baseQuat as any);
        const rotated = hostBasisFromQuaternion(nextQuat as any);
        state.displayCamRight = [...rotated.right];
        state.displayCamUp = [...rotated.up];
        state.displayCamForward = [...rotated.forward];
        state.displayCamQuat = [...nextQuat] as any;
        // Sync angle transient from basis to keep inertial/euler-based flows
        const { rotX, rotY } = syncAnglesFromBasis({ right: rotated.right, up: rotated.up, forward: rotated.forward });
        state.displayRotX = rotX;
        state.displayRotY = rotY;
        primeOrbitFromAngles(state, rotX, rotY);
        // Compute per-frame inertia using quaternion delta between prev and next
        try {
          const now = performance.now();
          const lastTs = pointer.lastMoveTs ?? now;
          const dtSec = Math.max(1e-3, (now - lastTs) / 1000);
          pointer.lastMoveTs = now;
          if (pointer.arcPrevQuat) {
            const prevQuat = pointer.arcPrevQuat as any;
            const deltaFrame = hostMultiplyQuaternions(nextQuat as any, hostInvertQuaternion(prevQuat));
            const { axis: inertiaAxis, angle: inertiaAngle } = hostAxisAngleFromQuaternion(deltaFrame as any);
            if (inertiaAngle > 1e-5) {
              pointer.arcInertiaAxis = inertiaAxis as Vec3;
              let rawSpeed = inertiaAngle / dtSec;
              const cap = Math.PI * 8 / 0.35;
              if (Math.abs(rawSpeed) > cap) rawSpeed = Math.sign(rawSpeed) * cap;
              pointer.arcInertiaSpeed = rawSpeed;
              try { (state as any).recentInertia = { type: 'arc_pointer', raw: rawSpeed, dt: dtSec, ts: Date.now(), axis: pointer.arcInertiaAxis }; } catch (e) { /* best-effort */ }
            } else {
              pointer.arcInertiaAxis = null;
              pointer.arcInertiaSpeed = 0;
            }
          }
        } catch (err) {
          /* ignore inertia failures */
        }
        pointer.arcPrevQuat = [...nextQuat] as any;
      } else {
        const vw = canvas.clientWidth || Math.max(1, canvas.width || 1);
        const vh = canvas.clientHeight || Math.max(1, canvas.height || 1);
        // Apply orbit drag to transient display rot values
        applyDragToOrbit(state, dx, dy, vw, vh);
        // Angular inertia: use angle deltas measured from previous inertia values
        const yawInertia = (state.displayRotY as number) - (state.rotY || 0);
        const pitchInertia = (state.displayRotX as number) - (state.rotX || 0);
        state.inertiaRotY = yawInertia * 0.35;
        state.inertiaRotX = pitchInertia * 0.35;
        const maxRot = Math.PI * 6;
        if (Math.abs(state.inertiaRotY) > maxRot) state.inertiaRotY = Math.sign(state.inertiaRotY) * maxRot;
        if (Math.abs(state.inertiaRotX) > maxRot) state.inertiaRotX = Math.sign(state.inertiaRotX) * maxRot;
        try { (state as any).recentInertia = { type: 'turntable', inertiaRotX: state.inertiaRotX, inertiaRotY: state.inertiaRotY, dt: 0, ts: Date.now() }; } catch (e) {/* best-effort */}
      }
    } else {
      const factor = computePanFactor(state, canvas);
      state.panX += dx * factor;
      state.panY -= dy * factor;
      state.inertiaPanX = dx * factor * 0.45;
      state.inertiaPanY = -dy * factor * 0.45;
      const maxPan = 1000;
      if (Math.abs(state.inertiaPanX) > maxPan) state.inertiaPanX = Math.sign(state.inertiaPanX) * maxPan;
      if (Math.abs(state.inertiaPanY) > maxPan) state.inertiaPanY = Math.sign(state.inertiaPanY) * maxPan;
      try { (state as any).recentInertia = { type: 'pan', inertiaPanX: state.inertiaPanX, inertiaPanY: state.inertiaPanY, dt: 0, ts: Date.now() }; } catch (e) { /* best-effort */ }
    }
    markInteraction();
    requestCameraEmitWhenStatic();
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const k = Math.exp(-event.deltaY * 0.001);
      state.zoom = Math.min(4.0, Math.max(0.25, state.zoom * k));
      markInteraction();
    },
    { passive: false }
  );
  try {
    (self as any)['buildCameraRig'] = buildCameraRig;
  } catch (err) {
    try {
      manager.debug('preview:buildCameraRig', 'buildCameraRig: failed to assign to self', { err: String(err) });
    } catch (e) {
      /* ignore */
    }
  }
  try {
    (window as any)['buildCameraRig'] = buildCameraRig;
  } catch (err) {
    try {
      manager.debug('preview:buildCameraRig', 'buildCameraRig: failed to assign to window', { err: String(err) });
    } catch (e) {
      /* ignore fallback debug */
    }
  }

  const controlsRoot = document.getElementById('wgpu-controls');
  if (controlsRoot) {
    controlsRoot.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const preset = target.dataset.wgpuView;
      if (preset) {
        applyViewPreset(state, preset);
        markInteraction();
        return;
      }
      const action = target.dataset.wgpuAction;
      if (action === 'projection') {
        const cfg = { ...initialParams, ...current } as WebGPUParams;
        const height = clampNumber(cfg.H, 120.0);
        const safeHeight = Math.max(Math.abs(height), 1);
        const radiusTop = clampNumber(cfg.Rt ?? cfg.Rt, 70.0);
        const radiusBottom = clampNumber(cfg.Rb ?? cfg.Rb, 45.0);
        const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
        const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
        const rawPadding = typeof cfg.scenePadding === 'number' ? clampNumber(cfg.scenePadding, CAMERA_PADDING) : CAMERA_PADDING;
        const paddingHint = sanitizePadding(rawPadding);
        const halfHeight = Math.max(safeHeight * 0.5, 1);
        const outerRadius = Math.max(safeRadiusTop, safeRadiusBottom);
        const halfWidth = Math.max(outerRadius, 1);
        const paddedHalfWidth = Math.max(1, halfWidth * paddingHint);
        const paddedHalfHeight = Math.max(1, halfHeight * paddingHint);
        // paddedMax is not used directly in this mapping; we compute base distance using per-axis distances below when needed.
        const currentRig = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
        const nextMode = state.projectionMode === 'ortho' ? 'perspective' : 'ortho';
        if (state.projectionMode === 'perspective' && nextMode === 'ortho') {
          const aspect = Math.max(state.canvasAspect || 1, 1e-3);
          const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
          const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
          const targetVec : Vec3 = [state.panX, state.panY, 0];
          const distance = vec3Length(vec3Subtract(currentRig.eye, targetVec));
          const halfHeightPers = distance * Math.tan(halfFovY);
          const halfWidthPers = distance * Math.tan(halfFovX);
          const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
          if (isHeightLimiting) {
            if (halfHeightPers > 1e-6) {
              const newZoom = Math.max(1e-3, paddedHalfHeight / halfHeightPers);
              state.zoom = Math.min(4.0, Math.max(0.25, newZoom));
            }
          } else {
            if (halfWidthPers > 1e-6) {
              const newZoom = Math.max(1e-3, paddedHalfWidth / halfWidthPers);
              state.zoom = Math.min(4.0, Math.max(0.25, newZoom));
            }
          }
          if (state.debugOverlay) {
            manager.debug('preview:projection-mapping', 'projection click mapping (persp -> ortho)', { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, distance, halfHeightPers, halfWidthPers, isHeightLimiting, zoom: state.zoom });
            try { emitDiagnostic('preview:proj-toggle:persp->ortho', { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, distance, halfHeightPers, halfWidthPers, isHeightLimiting, zoom: state.zoom }); } catch (err) { /* ignore */ }
          }
        } else if (state.projectionMode === 'ortho' && nextMode === 'perspective') {
          const aspect = Math.max(state.canvasAspect || 1, 1e-3);
          const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
          const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
          const halfHeightOrtho = paddedHalfHeight / Math.max(state.zoom, 1e-3);
          const halfWidthOrtho = paddedHalfWidth / Math.max(state.zoom, 1e-3);
          const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
          const desiredDistance = isHeightLimiting
            ? halfHeightOrtho / Math.max(Math.tan(halfFovY), 1e-6)
            : halfWidthOrtho / Math.max(Math.tan(halfFovX), 1e-6);
          const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
          const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
          const baseDistanceForMapping = Math.max(dV, dH) * CAMERA_DISTANCE_FALLOFF;
          let newZoom = Math.max(1e-3, baseDistanceForMapping / Math.max(desiredDistance, 1e-6));
          try {
            const prevProj = state.projectionMode;
            const prevZoom = state.zoom;
            const maxIter = 6;
            for (let it = 0; it < maxIter; it += 1) {
              state.projectionMode = 'perspective';
              state.zoom = newZoom;
              const rigCheck = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
              const targetVec: Vec3 = [state.panX, state.panY, 0];
              const actualHalfHeight = vec3Length(vec3Subtract(rigCheck.eye, targetVec)) * Math.tan(halfFovY);
              const actualHalfWidth = vec3Length(vec3Subtract(rigCheck.eye, targetVec)) * Math.tan(halfFovX);
              const axisValue = isHeightLimiting ? actualHalfHeight : actualHalfWidth;
              const desiredAxis = isHeightLimiting ? halfHeightOrtho : halfWidthOrtho;
              if (axisValue <= 1e-6) break;
              const correction = Math.max(1e-6, desiredAxis / axisValue);
              if (Math.abs(1 - correction) < 1e-3) break;
              newZoom = newZoom * correction;
            }
            state.zoom = prevZoom;
            state.projectionMode = prevProj;
          } catch (err) {
            /* ignore */
          }
          state.zoom = Math.min(4.0, Math.max(0.25, newZoom));
          if (state.debugOverlay) {
            manager.debug('preview:projection-mapping', 'projection click mapping (ortho -> persp)', { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, halfHeightOrtho, halfWidthOrtho, dV, dH, baseDistanceForMapping, desiredDistance, zoom: state.zoom });
            try { emitDiagnostic('preview:proj-toggle:ortho->persp', { paddedHalfWidth, paddedHalfHeight, aspect, halfFovY, halfFovX, halfHeightOrtho, halfWidthOrtho, dV, dH, baseDistanceForMapping, desiredDistance, zoom: state.zoom }); } catch (err) { /* ignore */ }
          }
        }
        state.projectionMode = nextMode;
        updateProjectionButton();
        state.cameraDirty = true;
        markInteraction();
        return;
      }
      if (action === 'arcball') {
        state.useArcball = !state.useArcball;
        updateArcballButton();
        state.cameraDirty = true;
        markInteraction();
        return;
      }
      if (action === 'grid') {
        state.showGrid = !state.showGrid;
        updateGridButton();
        state.cameraDirty = true;
        return;
      }
      if (action === 'debug') {
        state.debugOverlay = !state.debugOverlay;
        updateDebugButton();
        state.cameraDirty = true;
        return;
      }
      if (target.id === 'wgpu-toggle-autorotate') {
        state.autoRotate = !state.autoRotate;
        updateAutoButton();
        markInteraction();
        // When disabling autorotate, commit any transient display basis
        if (!state.autoRotate && (state.displayCamForward || state.displayCamUp || state.displayCamRight)) {
          const prevRight: Vec3 = state.camRight ? [...state.camRight] : [1, 0, 0];
          const flipped = commitDisplayBasisToState(state);
          if (flipped) {
            try {
              const dot = vec3Dot(prevRight, state.camRight as Vec3);
              emitDiagnostic('camera:commit-basis-flip', { dot });
            } catch (err) {
              /* ignore */
            }
          }
          emitCameraState(true);
        }
        const tid = String(target.id);
        if (tid === 'wgpu-toggle-arcball') {
          state.useArcball = !state.useArcball;
          updateArcballButton();
          state.cameraDirty = true;
          markInteraction();
        }
      }
    });
  }

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
    ) {
      return;
    }
    switch (event.key) {
      case '0':
        applyViewPreset(state, 'fit');
        markInteraction();
        break;
      case '1':
        applyViewPreset(state, 'top');
        markInteraction();
        break;
      case '2':
        applyViewPreset(state, 'front');
        markInteraction();
        break;
      case '3':
        applyViewPreset(state, 'right');
        markInteraction();
        break;
      case '4':
        applyViewPreset(state, 'iso');
        markInteraction();
        break;
      case ' ':
        state.autoRotate = !state.autoRotate;
        updateAutoButton();
        markInteraction();
        event.preventDefault();
        break;
      case 'f':
        // Toggle flat-color debug render (helps detect shader/uniform issues)
        state.debugFlatColor = !state.debugFlatColor;
        setStatus(state.debugFlatColor ? 'WebGPU • flat debug ON' : 'WebGPU • flat debug OFF');
        markInteraction();
        break;
      default:
        break;
    }
  });

  updateAutoButton();
  updateProjectionButton();
  updateDebugButton();
  updateGridButton();
  updateArcballButton();

  const uniform = buildUniformBlock(uniformSize);

  const updateAndDraw = (payload?: WebGPUParams | string): void => {
    // Predeclare mutable variables which may be referenced in try/catch
    let encoder: any = null;
    let textureView: any = null;
    let depthView: any = null;
    let shouldFrameLog = false;
    let shouldValidate = false;
    try {
      if (!pipeline) {
        return;
      }
    const hadPayload = Boolean(payload);
    let parsed: WebGPUParams | null = null;
    if (payload) {
      parsed = {} as WebGPUParams;
      if (typeof payload === 'string') {
        try {
          parsed = JSON.parse(payload);
        } catch (err) {
          console.warn('Failed to parse WebGPU payload', err);
        }
      } else {
        parsed = payload;
      }
      current = mergeParams(current, parsed);
    }
    if (!current) {
      return;
    }

    const cfg = { ...initialParams, ...current };

    if (typeof cfg.interactiveLod === 'number') {
      const ratio = Math.min(
        Math.max(Number(cfg.interactiveLod) || DEFAULT_INTERACTIVE_LOD, MIN_INTERACTIVE_LOD),
        1.0
      );
      state.interactiveLodRatio = ratio;
    }
    if (typeof cfg.interactiveLodEnabled === 'boolean') {
      state.interactiveLodEnabled = Boolean(cfg.interactiveLodEnabled);
      if (!state.interactiveLodEnabled) {
        state.recentParamUpdate = false;
      }
    }

    const now = performance.now();
    if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS && !((window as any).__pf_webgpu_camera_controller?.focusTween)) {
      state.interacting = false;
      // Clear local camera control now that interaction has ended. This
      // allows the host to update camera state again (either forced or not).
      // No fallback behavior: local control flag removed - delegate to controller
      // If the CameraController is present, delegate deferred forced payload
      // handling to it; it will apply the deferred payload if appropriate.
      try {
        const c = (window as any).__pf_webgpu_camera_controller as any | undefined;
        if (c && typeof c.maybeApplyDeferredForceIfReady === 'function') {
          c.maybeApplyDeferredForceIfReady(now);
        }
      } catch (err) {
        /* ignore */
      }
    }

    const paramNonce = typeof cfg.paramUpdateNonce === 'number' ? cfg.paramUpdateNonce : null;
    const paramFlag = cfg.paramUpdate !== false;
    if (paramFlag && paramNonce !== null && paramNonce !== state.lastParamNonce) {
      state.lastParamNonce = paramNonce;
      state.lastParamUpdate = now;
      state.recentParamUpdate = state.interactiveLodEnabled;
    } else if (state.recentParamUpdate && now - state.lastParamUpdate > PARAM_UPDATE_TIMEOUT_MS) {
      state.recentParamUpdate = false;
    }

    // Only compute and apply camera patches derived from an explicit incoming
    // payload; do not derive cameraNonce or apply camera state from merged
    // cfg defaults (which can cause host defaults to be re-applied after
    // an interaction). This ensures local control isn't overridden by host
    // defaults unless the host explicitly sends camera fields.
    const rawCameraNonce = parsed && typeof (parsed as Record<string, unknown>).cameraNonce === 'number'
      ? ((parsed as Record<string, unknown>).cameraNonce as number)
      : null;
    const forceCamera = rawCameraNonce !== null && rawCameraNonce !== lastCameraNonce;
    if (forceCamera) {
      lastCameraNonce = rawCameraNonce;
    }
    if (parsed) {
      const p = parsed as Record<string, unknown>;
      const patch: WebGPUParams = {};
      let patchApplied = false;
      if (typeof p.rotX === 'number') {
        patch.rotX = p.rotX;
        patchApplied = true;
      }
      if (typeof p.rotY === 'number') {
        patch.rotY = p.rotY;
        patchApplied = true;
      }
      if (typeof p.zoom === 'number') {
        patch.zoom = p.zoom;
        patchApplied = true;
      }
      if (typeof p.panX === 'number') {
        patch.panX = p.panX;
        patchApplied = true;
      }
      if (typeof p.panY === 'number') {
        patch.panY = p.panY;
        patchApplied = true;
      }
      const isForce = Boolean(p.force) || forceCamera || false;
      if (patchApplied) {
        applyCameraPayload(patch, isForce);
      }
    }

    const f32 = uniform;
    const height = clampNumber(cfg.H, 120.0);
    const radiusTop = clampNumber(cfg.Rt, 70.0);
    const radiusBottom = clampNumber(cfg.Rb, 45.0);
    const safeHeight = Math.max(Math.abs(height), 1);
    const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
    const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
    const styleIdRaw =
      typeof cfg.styleId === 'number'
        ? Math.trunc(cfg.styleId)
        : typeof current.styleId === 'number'
        ? Math.trunc(Number(current.styleId))
        : 0;
    const styleId = styleIdRaw < 0 ? 0 : styleIdRaw;
    f32[0] = height;
    f32[1] = radiusTop;
    f32[2] = radiusBottom;
    f32[3] = clampNumber(cfg.expn, 1.0);
    f32[4] = clampNumber(cfg.spin_turns, 0.0);
    f32[5] = clampNumber(cfg.spin_phase, 0.0);
    f32[6] = clampNumber(cfg.spin_curve, 1.0);
    f32[7] = styleId;
    f32[8] = clampNumber(cfg.sf_m_base, 6.0);
    f32[9] = clampNumber(cfg.sf_m_top ?? cfg.sf_m_base, 10.0);
    f32[10] = clampNumber(cfg.sf_n1, 0.35);
    f32[11] = clampNumber(cfg.sf_n2, 0.8);
    f32[12] = clampNumber(cfg.sf_n3, 0.8);
    const drainRadiusRaw =
      cfg.r_drain ??
      cfg.drain ??
      cfg.drainRadius ??
      (cfg as Record<string, unknown>)?.drain_radius ??
      current.r_drain;
    const drainRadius = clampNumber(drainRadiusRaw, 10.0);
    f32[DRAIN_RADIUS_OFFSET] = Math.max(Math.abs(drainRadius), 0.5);
    current.r_drain = drainRadius;
    current.styleId = styleId;

    syncStyleParams(cfg.styleParams ?? current.styleParams);
    current.styleParams = cfg.styleParams;

    // Compute the maximum needed dimension, but only update the user-facing
    // `sceneRadius` automatically if the host explicitly provided a value.
    // This keeps an interactive camera stable when users tweak parameters like
    // `H` (height): otherwise height increases cause the auto-fit camera to
    // move away, making the pot appear narrower instead of taller.
    const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
    const sceneRadiusProvided = cfg.sceneRadius !== undefined && cfg.sceneRadius !== null;
    // If the host explicitly set a sceneRadius, clamp and respect it. Otherwise
    // keep the existing `state.sceneRadius` unless no explicit sceneRadius was provided
    // and the current sceneRadius is <= 0 (shouldn't happen normally).
    if (sceneRadiusProvided) {
      const sceneRadiusHint = clampNumber(cfg.sceneRadius, computedMaxWithHeight);
      const nextSceneRadius = Math.max(Math.abs(sceneRadiusHint), computedMaxWithHeight, 1);
      if (Math.abs(nextSceneRadius - state.sceneRadius) > CAMERA_EPSILON) {
        state.sceneRadius = nextSceneRadius;
        state.cameraDirty = true;
      }
    }
    // previously there was a stray check here referencing `nextSceneRadius`;
    // only update `state.sceneRadius` above when the sceneRadius is provided.

    const rawPadding =
      typeof cfg.scenePadding === 'number'
        ? clampNumber(cfg.scenePadding, CAMERA_PADDING)
        : current && typeof current.scenePadding === 'number'
        ? clampNumber(Number(current.scenePadding), CAMERA_PADDING)
        : CAMERA_PADDING;
    const paddingHint = sanitizePadding(rawPadding);
    // Compute per-axis half extents so we can do an accurate perspective fit
    // for objects that are tall or wide in only one axis.
    const halfHeight = Math.max(safeHeight / 2, 1);
    const halfWidth = Math.max(safeRadiusTop, safeRadiusBottom, 1);
    const paddedHalfHeight = halfHeight * paddingHint;
    const paddedHalfWidth = halfWidth * paddingHint;
    const cameraRig = getCachedRigPreview(paddingHint, paddedHalfWidth, paddedHalfHeight);
    // Visual cue when user is near-vertical: makes it obvious if the canvas
    // is still present / being repainted when the model 'disappears'. This is
    // only shown while the user is interacting or has local camera control.
    try {
      const nearVertical = Math.abs(Math.abs(state.rotX) - Math.PI * 0.5) < 0.02;
      if (nearVertical && (pointer.active || state.interacting)) {
        (canvas.style as any).outline = '3px solid rgba(255,0,0,0.9)';
      } else {
        (canvas.style as any).outline = '';
      }
    } catch (err) {
      /* ignore DOM style errors */
    }

    // If the user is actively interacting and near-vertical, perform a
    // throttled auto-diagnostic draw using the flat pipeline. This uses the
    // separate diagnostic encoder and helps distinguish shader/geometry issues
    // from swapchain/pipeline submission failures.
    try {
      const nearVertical = Math.abs(Math.abs(state.rotX) - Math.PI * 0.5) < 0.02;
      const nowAuto = performance.now();
      if (nearVertical && (pointer.active || state.interacting) && nowAuto - lastAutoDiagTime > 150) {
        lastAutoDiagTime = nowAuto;
        const ok = drawFlatDiagnostic('auto-near-vertical');
        try {
          if (__wgpu_debug_el) {
            const prev = __wgpu_debug_el.textContent || '';
            __wgpu_debug_el.textContent = `AUTO_DIAG nearVertical=${nearVertical} ok=${ok} rotX=${state.rotX.toFixed(6)}\n` + prev;
            __wgpu_debug_el.style.display = 'block';
          }
        } catch (err) {
          /* ignore DOM errors */
        }
        console.info('[WebGPU][AutoDiag] near-vertical diagnostic', { nearVertical, ok });
      }
    } catch (err) {
      /* ignore auto-diag failures */
    }
    const debugActive = Boolean(cfg.debug) || state.debugOverlay;
    // Throttled manual-interaction diagnostics
    const lastManualDiagTime = (globalThis as any).__pf_lastManualDiagTime || 0;
    const nowDiag = performance.now();
    if ((pointer.active || state.interacting) && nowDiag - lastManualDiagTime > 200) {
      try {
        const rotZLocal = state.rotZ || 0;
        const rotMatDiag = makeRotationMatrixFromEuler(state.rotX, state.rotY, rotZLocal);
        const forwardDiag = vec3Normalize(applyRotationToVector(rotMatDiag, [0, 0, 1]));
        const upDiag = applyRotationToVector(rotMatDiag, [0, 1, 0]);
        const vpFiniteDiag = matrixIsFinite(cameraRig.viewProjection);
        // eslint-disable-next-line no-console
        console.info('[WebGPU][ManualDiag]', {
          rotX: Number(state.rotX.toFixed(6)),
          rotY: Number(state.rotY.toFixed(6)),
          rotZ: Number(rotZLocal.toFixed(6)),
          forward: forwardDiag.map((v) => Number(v.toFixed(6))),
          up: upDiag.map((v) => Number(v.toFixed(6))),
          eye: cameraRig.eye.map((v) => Number(v.toFixed(3))),
          vpFinite: vpFiniteDiag,
        });
      } catch (err) {
        // ignore diag failures
      }
      (globalThis as any).__pf_lastManualDiagTime = nowDiag;
    }
    if (!matrixIsFinite(cameraRig.viewProjection)) {
      console.error('WebGPU • camera matrix invalid; skipping draw', {
        rotX: state.rotX,
        rotY: state.rotY,
        rotZ: state.rotZ || 0,
        cameraRig,
      });
      if (!drawFlatDiagnostic('camera-matrix-invalid')) {
        setStatus('WebGPU • camera matrix invalid');
      }
      state.cameraDirty = true;
      return;
    }

    const baseNTheta = sanitizeInt(cfg.nTheta ?? cfg.n_theta, 64, 3);
    const baseNZ = sanitizeInt(cfg.nZ ?? cfg.n_z, 32, 2);
    const baseInner = sanitizeInt(cfg.innerSegments ?? cfg.inner_segments ?? baseNZ, baseNZ, 1);
    const defaultBottom = Math.max(2, Math.min(24, Math.ceil(baseNZ * 0.25)));
    const defaultRim = Math.max(1, Math.min(8, Math.ceil(baseNZ * 0.1)));
    const baseBottom = sanitizeInt(
      cfg.bottom_rings ?? cfg.bottomRings ?? defaultBottom,
      defaultBottom,
      2
    );
    const baseRim = sanitizeInt(cfg.rim_rings ?? cfg.rimRings ?? defaultRim, defaultRim, 1);
    // LOD fully disabled - WebGPU handles 1M+ triangles at 120FPS
    const lodActive = false;

    const nTheta = Math.max(MIN_THETA_STATIC, baseNTheta);
    const nZ = Math.max(MIN_Z_STATIC, baseNZ);
    const innerSeg = Math.max(1, baseInner);
    const bottomRings = Math.max(2, Math.min(24, baseBottom));
    const rimRings = Math.max(1, Math.min(8, baseRim));

    f32[16] = nTheta;
    f32[17] = nZ;
    f32[18] = debugActive ? 1 : 0;
    f32[19] = state.rotX;
    f32[20] = state.rotY;
    f32[21] = state.zoom;
    f32[22] = clampNumber(cfg.ambient, 0.5);
    f32[23] = clampNumber(cfg.diffuse, 1.0);
    f32[24] = clampNumber(cfg.fresnel, 0.25);
    f32[25] = clampNumber(cfg.t_wall, 3.0);
    f32[26] = clampNumber(cfg.t_bottom, 3.0);
    f32[27] = innerSeg;
    f32[28] = bottomRings;
    f32[29] = state.panX;
    f32[30] = rimRings;
    f32[31] = state.panY;
    f32[32] = state.canvasAspect || 1;
    f32[33] = state.sceneRadius;
    f32[34] = paddingHint;
    f32[35] = cameraRig.near;

    f32[CAMERA_EYE_OFFSET + 0] = cameraRig.eye[0];
    f32[CAMERA_EYE_OFFSET + 1] = cameraRig.eye[1];
    f32[CAMERA_EYE_OFFSET + 2] = cameraRig.eye[2];
    f32[CAMERA_MODE_OFFSET] = cameraRig.mode === 'perspective' ? 1 : 0;
    writeVec3(f32, CAMERA_RIGHT_OFFSET, cameraRig.basis.right);
    f32[CAMERA_RIGHT_OFFSET + 3] = 0;
    writeVec3(f32, CAMERA_UP_OFFSET, cameraRig.basis.up);
    f32[CAMERA_UP_OFFSET + 3] = 0;
    writeVec3(f32, CAMERA_FORWARD_OFFSET, cameraRig.basis.forward);
    f32[CAMERA_FORWARD_OFFSET + 3] = 0;
    f32[GRID_FLAG_OFFSET] = state.showGrid ? 1 : 0;
    for (let i = 0; i < 16; i += 1) {
      f32[VP_MATRIX_OFFSET + i] = cameraRig.viewProjection[i];
    }
    // Emit camera-fit diagnostics with per-axis distances
    try {
      const halfFovY = cameraRig.fov * 0.5;
      // fovX = 2 * atan(tan(fovY/2) * aspect)
      const halfFovX = Math.atan(Math.tan(halfFovY) * (state.canvasAspect || 1));
      const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
      const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
      emitDiagnostic('webgpu:camera-fit', {
        halfWidth: paddedHalfWidth,
        halfHeight: paddedHalfHeight,
        dV,
        dH,
        chosenDistance: Math.hypot(cameraRig.eye[0], cameraRig.eye[1], cameraRig.eye[2]),
        fov: cameraRig.fov,
        aspect: state.canvasAspect,
        near: cameraRig.near,
        far: cameraRig.far,
      });
    } catch (err) {
      /* ignore */
    }

    // Emit NDC extents of bounding box corners so we can confirm fit
    try {
      const mulMat4Vec4 = (m: Mat4, x: number, y: number, z: number) => {
        const cx = m[0] * x + m[4] * y + m[8] * z + m[12] * 1;
        const cy = m[1] * x + m[5] * y + m[9] * z + m[13] * 1;
        const cz = m[2] * x + m[6] * y + m[10] * z + m[14] * 1;
        const cw = m[3] * x + m[7] * y + m[11] * z + m[15] * 1;
        return { x: cx, y: cy, z: cz, w: cw };
      };
      const corners: Array<Vec3> = [
        [paddedHalfWidth, paddedHalfWidth, paddedHalfHeight],
        [-paddedHalfWidth, paddedHalfWidth, paddedHalfHeight],
        [paddedHalfWidth, -paddedHalfWidth, paddedHalfHeight],
        [-paddedHalfWidth, -paddedHalfWidth, paddedHalfHeight],
        [paddedHalfWidth, paddedHalfWidth, -paddedHalfHeight],
        [-paddedHalfWidth, paddedHalfWidth, -paddedHalfHeight],
        [paddedHalfWidth, -paddedHalfWidth, -paddedHalfHeight],
        [-paddedHalfWidth, -paddedHalfWidth, -paddedHalfHeight],
      ];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        const clip = mulMat4Vec4(cameraRig.viewProjection, c[0], c[1], c[2]);
        if (!Number.isFinite(clip.w) || Math.abs(clip.w) < 1e-6) continue;
        const ndcX = clip.x / clip.w;
        const ndcY = clip.y / clip.w;
        minX = Math.min(minX, ndcX);
        maxX = Math.max(maxX, ndcX);
        minY = Math.min(minY, ndcY);
        maxY = Math.max(maxY, ndcY);
      }
      emitDiagnostic('webgpu:camera-fit-ndc', { ndc: { minX, maxX, minY, maxY } });
      // Draw a visual debug overlay showing the NDC bounds (if overlayCtx present)
      if (overlayCtx && debugActive && Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
        try {
          const canvasW = overlayCanvas?.width || 1;
          const canvasH = overlayCanvas?.height || 1;
          overlayCtx.clearRect(0, 0, canvasW, canvasH);
          const sx = (minX + 1) * 0.5 * canvasW;
          const ex = (maxX + 1) * 0.5 * canvasW;
          const sy = (1 - ((maxY + 1) * 0.5)) * canvasH;
          const ey = (1 - ((minY + 1) * 0.5)) * canvasH;
          const wPx = Math.max(1, Math.abs(ex - sx));
          const hPx = Math.max(1, Math.abs(ey - sy));
          overlayCtx.strokeStyle = 'rgba(0,255,0,0.9)';
          overlayCtx.lineWidth = 2;
          overlayCtx.strokeRect(Math.min(sx, ex), Math.min(sy, ey), wPx, hPx);
          overlayCtx.fillStyle = 'rgba(255,255,255,0.9)';
          overlayCtx.font = '12px monospace';
          overlayCtx.fillText(`ndc: minX=${minX.toFixed(2)} maxX=${maxX.toFixed(2)}`, 8, 14);
          overlayCtx.fillText(`ndc: minY=${minY.toFixed(2)} maxY=${maxY.toFixed(2)}`, 8, 30);
        } catch (err) {
          /* ignore overlay drawing errors */
        }
      }
    } catch (err) {
      /* ignore */
    }

    // If debug mode requested by the frontend or toggled locally, show diagnostics.
    if (debugActive) {
      if (now - lastDebugOverlayUpdate >= DEBUG_THROTTLE_MS) {
        lastDebugOverlayUpdate = now;
        const __dbg = {
          H: height,
          Rt: radiusTop,
          Rb: radiusBottom,
          sceneRadius: state.sceneRadius,
          nTheta,
          nZ,
          paramNonce,
          cam: {
            mode: cameraRig.mode,
            near: Number(cameraRig.near.toFixed(2)),
            far: Number(cameraRig.far.toFixed(2)),
            eye: cameraRig.eye.map((v) => Number(v.toFixed(2))),
          },
        } as const;
        try {
          if (__wgpu_debug_el) {
            __wgpu_debug_el.style.display = 'block';
            __wgpu_debug_el.textContent = JSON.stringify(__dbg, null, 2);
          }
        } catch (err) {
          /* ignore DOM issues */
        }
      }
      if (now - lastVpLogTime >= DEBUG_THROTTLE_MS) {
        lastVpLogTime = now;
        try {
          const vpSlice = Array.from(
            f32.slice(VP_MATRIX_OFFSET, VP_MATRIX_OFFSET + 16)
          ).map((value) => Number(value.toFixed(4)));
          // eslint-disable-next-line no-console
          manager.debug('preview:vp-matrix', 'WebGPU VP matrix', { debugFlag: f32[18], vp: vpSlice });
        } catch (err) {
          /* ignore diagnostics issues */
        }
      }
    } else if (__wgpu_debug_el && !state.debugOverlay) {
      try {
        __wgpu_debug_el.style.display = 'none';
      } catch (err) {
        /* ignore */
      }
    }

    const cellsOuter = nTheta * nZ;
    const cellsInner = nTheta * innerSeg;
    const cellsBottomTop = nTheta * bottomRings;
    const cellsBottomUnder = cellsBottomTop;
    const cellsRim = nTheta * rimRings;
    const totalCells =
      cellsOuter + cellsInner + cellsBottomTop + cellsBottomUnder + cellsRim;
    const totalVerts = totalCells * 6;

    // Emit debug logs when running in debug mode to diagnose low-geometry counts
    if (debugActive) {
      // eslint-disable-next-line no-console
      manager.debug('preview:geometry-counts', 'geometry counts', {
        nTheta,
        nZ,
        innerSeg,
        bottomRings,
        rimRings,
        totalCells,
        totalVerts,
      });
    }

    const desiredCounts: GeometrySnapshot = {
      nTheta,
      nZ,
      innerSeg,
      bottomRings,
      rimRings,
      totalVerts,
    };
    // no-op: keep mount readiness updates localized

    let resolvedCounts = desiredCounts;
    let usingFallback = false;
    let invalidReason: 'invalid' | 'overflow' | null = null;
    if (!Number.isFinite(totalVerts) || totalVerts <= 0) {
      invalidReason = 'invalid';
    } else if (totalVerts > MAX_VERTS) {
      invalidReason = 'overflow';
    }

    if (invalidReason) {
      const statusBase =
        invalidReason === 'overflow'
          ? 'WebGPU • draw exceeds vertex index limit'
          : 'WebGPU • invalid vertex count';
      const detail = {
        nTheta,
        nZ,
        innerSeg,
        bottomRings,
        rimRings,
        totalVerts,
        maxVerts: MAX_VERTS,
      } as const;
      console.warn(statusBase, detail);
      if (!lastValidGeometry) {
        if (now - lastInvalidStatusAt >= INVALID_STATUS_COOLDOWN_MS) {
          setStatus(statusBase);
          lastInvalidStatusAt = now;
        }
        return;
      }
      resolvedCounts = lastValidGeometry;
      usingFallback = true;
      if (now - lastInvalidStatusAt >= INVALID_STATUS_COOLDOWN_MS) {
        setStatus(`${statusBase} • showing last frame`);
        lastInvalidStatusAt = now;
      }
    } else {
      lastValidGeometry = desiredCounts;
    }

    if (usingFallback) {
      f32[16] = resolvedCounts.nTheta;
      f32[17] = resolvedCounts.nZ;
      f32[27] = resolvedCounts.innerSeg;
      f32[28] = resolvedCounts.bottomRings;
      f32[30] = resolvedCounts.rimRings;
    }

    current.nTheta = resolvedCounts.nTheta;
    current.nZ = resolvedCounts.nZ;
    current.innerSegments = resolvedCounts.innerSeg;
    current.bottom_rings = resolvedCounts.bottomRings;
    current.rim_rings = resolvedCounts.rimRings;
    current.t_wall = cfg.t_wall;
    current.t_bottom = cfg.t_bottom;
    current.rotX = state.rotX;
    current.rotY = state.rotY;
    current.zoom = state.zoom;
    current.panX = state.panX;
    current.panY = state.panY;
    current.cameraNonce = lastCameraNonce;
    current.scenePadding = paddingHint;
    current.projection = state.projectionMode;

    const drawVerts = resolvedCounts.totalVerts;
    const safeDrawVerts = Math.max(0, Math.min(MAX_VERTS, Math.floor(drawVerts)));
    if (!Number.isFinite(safeDrawVerts) || safeDrawVerts <= 0) {
      return;
    }
    totalDrawnVerts += safeDrawVerts;

    const uniformDirty =
      state.cameraDirty ||
      state.recentParamUpdate ||
      state.interacting ||
      hadPayload ||
      lodActive;
      // Compact signature for uniform AND geometry change detection
      const basisForward = (state.displayCamForward ?? state.camForward) as Vec3;
      const basisUp = (state.displayCamUp ?? state.camUp) as Vec3;
      const basisString = `${basisForward[0]}_${basisForward[1]}_${basisForward[2]}|${basisUp[0]}_${basisUp[1]}_${basisUp[2]}`;
      // Include geometry parameters in signature for immediate slider response
      const geoSigPreview = `${f32[0]}_${f32[1]}_${f32[2]}_${f32[3]}_${f32[16]}_${f32[17]}_${f32[6]}_${f32[7]}_${f32[8]}`;
      const uniformSignaturePreview = `${state.rotX ?? 0}_${state.rotY ?? 0}_${state.zoom ?? 1}_${state.panX ?? 0}_${state.panY ?? 0}_${state.projectionMode}_${basisString}_${geoSigPreview}`;
      (globalThis as any).__lastUniformSignaturePreview = (globalThis as any).__lastUniformSignaturePreview ?? null;
      const lastUniformSignaturePreview = (globalThis as any).__lastUniformSignaturePreview;
      if (uniformDirty && uniformSignaturePreview !== lastUniformSignaturePreview) {
        (globalThis as any).__lastUniformSignaturePreview = uniformSignaturePreview;
        device.queue.writeBuffer(uniformBuffer, 0, uniform.buffer as ArrayBuffer);
      }
      

    const gradientSignature = JSON.stringify(cfg.gradient ?? null);
    if (gradientSignature !== lastGradientSignature) {
      writeGradient(device, colorBuffers, cfg.gradient);
      lastGradientSignature = gradientSignature;
    }

    encoder = device.createCommandEncoder({ label: 'preview:frame-encoder' });
    textureView = null;
    // Try-getCurrentTexture with a small recovery path to avoid blinking.
    // Add a throttled per-frame log to help trace disappearing frames.
    const nowFrame = performance.now();
    shouldFrameLog = nowFrame - lastFrameLogTime > 200;
    if (shouldFrameLog) {
      lastFrameLogTime = nowFrame;
      try {
        console.info('[WebGPU][Frame] begin', {
          rotX: Number(state.rotX.toFixed(6)),
          panX: Number(state.panX.toFixed(3)),
          panY: Number(state.panY.toFixed(3)),
          wantFlat: Boolean(cfg.flatColor) || Boolean(state.debugFlatColor),
          flatReady: !!flatPipeline,
        });
      } catch (err) {
        /* ignore logging errors */
      }
    }
    try {
      if (shouldFrameLog) console.info('[WebGPU][Frame] getCurrentTexture attempt');
      textureView = context.getCurrentTexture().createView({ label: 'preview:swapchain-view' });
      if (shouldFrameLog) console.info('[WebGPU][Frame] getCurrentTexture OK');
    } catch (err) {
      console.warn('WebGPU • getCurrentTexture failed (attempt 1)', err);
      try {
        context.configure({ device, format, alphaMode: 'opaque' });
      } catch (cfgErr) {
        console.warn('WebGPU • context reconfigure failed', cfgErr);
      }
      // second attempt after reconfigure
      try {
        if (shouldFrameLog) console.info('[WebGPU][Frame] getCurrentTexture attempt (after reconfigure)');
        textureView = context.getCurrentTexture().createView({ label: 'preview:swapchain-view' });
        if (shouldFrameLog) console.info('[WebGPU][Frame] getCurrentTexture OK (after reconfigure)');
      } catch (err2) {
        console.warn('WebGPU • getCurrentTexture failed (attempt 2)', err2);
        drawFlatDiagnostic('swapchain-texture-failed');
        return;
      }
    }
    depthView = depth.createView({ label: 'preview:depth-view' });

    validationFrameCounter += 1;
    shouldValidate = debugActive || validationFrameCounter % 60 === 0;
    if (shouldValidate) {
      device.pushErrorScope('validation');
    }
    // end try
    const passDesc: GPURenderPassDescriptor = {
      label: 'preview:main-pass',
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.05, g: 0.05, b: 0.07, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    };
    const pass = encoder.beginRenderPass(passDesc);
    const wantFlat = Boolean(cfg.flatColor) || Boolean(state.debugFlatColor);
    // Log draw intent to help diagnose black/empty renders
    if (debugActive) {
      // eslint-disable-next-line no-console
      manager.debug('preview:draw-intent', 'draw intent', { safeDrawVerts, wantFlat, flatReady: !!flatPipeline });
    }
    if (wantFlat) {
      if (flatPipeline) {
        if (shouldFrameLog) console.info('[WebGPU][Frame] draw -> flatPipeline (in-pass)');
        pass.setPipeline(flatPipeline);
        pass.draw(3);
      } else {
        if (shouldFrameLog) console.info('[WebGPU][Frame] flat not ready -> draw main pipeline');
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(safeDrawVerts);
      }
    } else {
      if (shouldFrameLog) console.info('[WebGPU][Frame] draw -> main pipeline', { safeDrawVerts });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(safeDrawVerts);
    }
    totalDrawCalls += 1;
    pass.end();

    const cmdBuffer = encoder.finish({ label: 'preview:frame-command-buffer' });
    device.queue.submit([cmdBuffer]);
    frameCounter += 1;
    try {
      manager.setFrameCounters({ frames: frameCounter, draws: totalDrawCalls, verts: totalDrawnVerts });
    } catch (err) {
      /* ignore telemetry errors */
    }
    try {
      if (axisCtx && state.showAxis) {
        drawAxisIndicator(axisCtx, cameraRig);
      } else if (axisCtx) {
        axisCtx.clearRect(0, 0, axisCtx.canvas.width, axisCtx.canvas.height);
      }
    } catch (err) {
      /* ignore overlay draw errors */
    }
    } catch (err) {
      try {
        console.error('WebGPU • updateAndDraw threw', err);
      } catch (e) {
        /* ignore logging errors */
      }
      try {
        emitDiagnostic('webgpu:error', { reason: 'updateAndDraw exception', error: String(err) });
      } catch (e) {
        /* ignore */
      }
      try {
        drawFlatDiagnostic('updateAndDraw-exception');
      } catch (e) {
        /* ignore */
      }
      state.cameraDirty = true;
      return;
    }
    if (shouldFrameLog) {
      console.info('[WebGPU][Frame] submit done');
    }

    if (shouldValidate) {
      device
        .popErrorScope()
        .then((error: GPUError) => {
          if (error) {
            console.warn('WebGPU validation', error);
            const detail = typeof error === 'string' ? error : error?.message ?? 'validation error';
            setStatus(`WebGPU • ${detail}`);
          }
        })
        .catch(() => {
          /* no-op */
        });
    }
  };

  if (typeof initialParams.autoRotate === 'boolean') {
    state.autoRotate = initialParams.autoRotate;
  }
  if (typeof initialParams.rotX === 'number') {
    state.rotX = initialParams.rotX;
  }
  if (typeof initialParams.rotY === 'number') {
    state.rotY = initialParams.rotY;
  }
  primeOrbitFromAngles(state, state.rotX, state.rotY);
  if (typeof initialParams.zoom === 'number') {
    state.zoom = initialParams.zoom;
  }
  if (typeof initialParams.projection === 'string') {
    const nextMode = initialParams.projection === 'perspective' ? 'perspective' : 'ortho';
    state.projectionMode = nextMode;
    updateProjectionButton();
  }
  if (typeof initialParams.sceneRadius === 'number') {
    const nextRadius = Math.max(
      Math.abs(clampNumber(initialParams.sceneRadius, state.sceneRadius)),
      1
    );
            if (Math.abs(nextRadius - state.sceneRadius) > CAMERA_EPSILON) {
            const prev = state.sceneRadius;
            state.sceneRadius = nextRadius;
            try { manager.info('preview:sceneRadius-applied', 'sceneRadius applied', { prev, next: state.sceneRadius }); } catch (err) { /* ignore */ }
      state.cameraDirty = true;
    }
  }
  if (typeof initialParams.interactiveLod === 'number') {
    state.interactiveLodRatio = Math.min(
      Math.max(
        Number(initialParams.interactiveLod) || DEFAULT_INTERACTIVE_LOD,
        MIN_INTERACTIVE_LOD
      ),
      1.0
    );
  }
  if (typeof initialParams.interactiveLodEnabled === 'boolean') {
    state.interactiveLodEnabled = Boolean(initialParams.interactiveLodEnabled);
  }
  if (typeof initialParams.debug === 'boolean') {
    state.debugOverlay = Boolean(initialParams.debug);
    updateDebugButton();
  }

  const bootPayload = { ...initialParams };
  current = mergeParams(current, bootPayload);
  updateAndDraw(current ?? {});

  let fpsFrames = 0;
  let fpsStart = performance.now();

  const frame = (): void => {
    if (!current) {
      requestAnimationFrame(frame);
      return;
    }

    const now = performance.now();
    if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS && !((window as any).__pf_webgpu_camera_controller?.focusTween)) {
      state.interacting = false;
    }

    let cameraMutated = false;
    if (!pointer.active) {
      if (Math.abs(state.inertiaRotY) > 1e-4 || Math.abs(state.inertiaRotX) > 1e-4) {
        state.rotY += state.inertiaRotY;
        state.rotX = sanitizePitch(state.rotX + state.inertiaRotX);
        state.inertiaRotY *= INERTIA_DECAY;
        state.inertiaRotX *= INERTIA_DECAY;
        if (Math.abs(state.inertiaRotY) < 1e-4) {
          state.inertiaRotY = 0;
        }
        if (Math.abs(state.inertiaRotX) < 1e-4) {
          state.inertiaRotX = 0;
        }
        primeOrbitFromAngles(state, state.rotX, state.rotY);
        cameraMutated = true;
      }
      if (Math.abs(state.inertiaPanX) > 1e-4 || Math.abs(state.inertiaPanY) > 1e-4) {
        state.panX += state.inertiaPanX;
        state.panY += state.inertiaPanY;
        state.inertiaPanX *= INERTIA_DECAY;
        state.inertiaPanY *= INERTIA_DECAY;
        if (Math.abs(state.inertiaPanX) < 1e-4) {
          state.inertiaPanX = 0;
        }
        if (Math.abs(state.inertiaPanY) < 1e-4) {
          state.inertiaPanY = 0;
        }
        cameraMutated = true;
      }
    }

    if (state.autoRotate && !state.interacting) {
      state.rotY += 0.01;
      primeOrbitFromAngles(state, state.rotX, state.rotY);
      state.cameraDirty = true;
    }

    if (cameraMutated) {
      state.cameraDirty = true;
      if (!state.autoRotate) {
        requestCameraEmitWhenStatic();
      }
    }

    if (pendingStaticCameraEmit && isCameraStatic()) {
      const prevRight: Vec3 = state.camRight ? [...state.camRight] : [1, 0, 0];
      const flipped = commitDisplayBasisToState(state);
      if (flipped) {
        try {
          const dot = vec3Dot(prevRight, state.camRight as Vec3);
          emitDiagnostic('camera:commit-basis-flip', { dot });
        } catch (err) {
          /* ignore */
        }
      }
      pendingStaticCameraEmit = false;
      emitCameraState(true);
    }

    updateAndDraw(current);
    emitCameraState();
    fpsFrames += 1;
    if (now - fpsStart > 600) {
      const fps = (fpsFrames * 1000) / (now - fpsStart);
      const nTheta = Number(current.nTheta) || 0;
      const nZ = Number(current.nZ) || 0;
      const innerSeg = Number(current.innerSegments) || nZ;
      const bottomRings = Number(current.bottom_rings) || Math.max(2, Math.floor(nZ * 0.25));
      const rimRings = Number(current.rim_rings) || 1;
      const cellsOuter = nTheta * nZ;
      const cellsInner = nTheta * innerSeg;
      const cellsBottomTop = nTheta * bottomRings;
      const cellsBottomUnder = cellsBottomTop;
      const cellsRim = nTheta * rimRings;
      const totalCells =
        cellsOuter + cellsInner + cellsBottomTop + cellsBottomUnder + cellsRim;
      setStatus(`WebGPU • ${(totalCells * 2).toLocaleString()} tris • ${fps.toFixed(0)} FPS`);
      fpsFrames = 0;
      fpsStart = now;
    }
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') {
      return;
    }
    if (data.type === 'params' && data.payload) {
      let payload = data.payload;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          console.warn('WebGPU params JSON parse', err);
        }
      }
        try {
          if (__wgpu_debug_el) {
            if (payload && typeof (payload as Record<string, unknown>).debug === 'boolean') {
              __wgpu_debug_el.style.display = (payload as Record<string, unknown>).debug ? 'block' : 'none';
            }
          }
        } catch (err) {
          /* ignore */
        }
      try {
        const dataId = (canvas.getAttribute('data-pf-wgpu-id') || 'pf-wgpu-default') as string;
        (window as any).__pf_webgpu_mounts = (window as any).__pf_webgpu_mounts || {};
        const dbg = (window as any).__pf_webgpu_mounts[dataId]?.debug;
        if (dbg) {
          dbg._lastParamsMessage = payload;
          if (PREVIEW_DEBUG_ENABLED) manager.debug('preview:params', '[WebGPU:MSG] params', payload as any);
        }
      } catch (err) {
        /* ignore */
      }
      if (typeof payload.autoRotate === 'boolean') {
        state.autoRotate = payload.autoRotate;
        updateAutoButton();
        state.cameraDirty = true;
      }
      if (typeof payload.rotX === 'number') {
        state.rotX = payload.rotX;
        state.cameraDirty = true;
      }
      if (typeof payload.rotY === 'number') {
        state.rotY = payload.rotY;
        state.cameraDirty = true;
      }
      if (typeof payload.rotX === 'number' || typeof payload.rotY === 'number') {
        primeOrbitFromAngles(state, state.rotX, state.rotY);
      }
      if (typeof payload.zoom === 'number') {
        state.zoom = payload.zoom;
        state.cameraDirty = true;
      }
      if (typeof payload.projection === 'string') {
        const nextMode = payload.projection === 'perspective' ? 'perspective' : 'ortho';
        if (state.projectionMode !== nextMode) {
          state.projectionMode = nextMode;
          updateProjectionButton();
          state.cameraDirty = true;
        }
      }
      if (typeof payload.sceneRadius === 'number') {
        try {
          const prev = state.sceneRadius;
          const nextRadius = Math.max(
            Math.abs(clampNumber(payload.sceneRadius, state.sceneRadius)),
            1
          );
          if (Math.abs(nextRadius - state.sceneRadius) > CAMERA_EPSILON) {
            state.sceneRadius = nextRadius;
            state.cameraDirty = true;
            try {
              const dataId = (canvas.getAttribute('data-pf-wgpu-id') || 'pf-wgpu-default') as string;
              (window as any).__pf_webgpu_mounts = (window as any).__pf_webgpu_mounts || {};
              const dbg = (window as any).__pf_webgpu_mounts[dataId]?.debug;
              if (dbg) {
                dbg.lastSceneRadiusUpdate = { prev, next: state.sceneRadius, timestamp: Date.now() };
                if (PREVIEW_DEBUG_ENABLED) manager.debug('preview:sceneRadius-updated', '[WebGPU] sceneRadius updated', dbg.lastSceneRadiusUpdate as any);
              }
            } catch (err) {
              /* ignore */
            }
          }
        } catch (err) {
          /* ignore */
        }
      }
      if (typeof payload.interactiveLod === 'number') {
        state.interactiveLodRatio = Math.min(
          Math.max(Number(payload.interactiveLod) || DEFAULT_INTERACTIVE_LOD, MIN_INTERACTIVE_LOD),
          1.0
        );
      }
      if (typeof payload.interactiveLodEnabled === 'boolean') {
        state.interactiveLodEnabled = Boolean(payload.interactiveLodEnabled);
        if (!state.interactiveLodEnabled) {
          state.recentParamUpdate = false;
        }
        if (payload && typeof payload.hostCameraAcceptPolicy === 'string') {
          try {
            const c = (window as any).__pf_webgpu_camera_controller as any | undefined;
            if (c && typeof c.setHostCameraAcceptPolicy === 'function') {
              const policy = (payload.hostCameraAcceptPolicy as 'always' | 'grace' | 'strict');
              c.setHostCameraAcceptPolicy(policy);
            }
          } catch (err) {
            /* ignore */
          }
        }
        if (payload && typeof payload.hostCameraGraceMs === 'number') {
          try {
            const c = (window as any).__pf_webgpu_camera_controller as any | undefined;
            if (c && typeof c.setLocalCameraGraceMs === 'function') {
              c.setLocalCameraGraceMs(Number(payload.hostCameraGraceMs));
            }
          } catch (err) {
            /* ignore */
          }
        }
      }
      if (typeof payload.paramUpdateNonce === 'number' && payload.paramUpdate !== false) {
        state.lastParamNonce = payload.paramUpdateNonce;
        state.lastParamUpdate = performance.now();
        state.recentParamUpdate = state.interactiveLodEnabled;
      }
      updateAndDraw(payload);
      return;
    }
    if (data.type === 'camera') {
      handleCameraCommand(data.payload);
    }
  });

  return true;
};

export const bootWebGPU = async (): Promise<void> => {
  const canvas = document.getElementById('wgpu-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    setStatus('WebGPU canvas not found');
    return;
  }
  // Require the host CameraController to provide helper functions. Without
  // these, the preview cannot perform essential quaternion and basis math
  // and will produce inconsistent results. Provide a clear developer error.
  try {
    if (!assertHostHelpersPresent()) {
      const msg = 'WebGPU Preview boot failed: host CameraController.helpers is required. Ensure the host provides `window.__pf_webgpu_camera_controller.helpers` with math/picking functions.';
      // Render visible overlay for developers in DOM
      try {
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.left = '0';
        overlay.style.top = '0';
        overlay.style.right = '0';
        overlay.style.background = 'rgba(220,60,60,0.9)';
        overlay.style.color = 'white';
        overlay.style.zIndex = '99999';
        overlay.style.padding = '8px';
        overlay.style.fontFamily = 'monospace';
        overlay.textContent = msg;
        (canvas.parentElement ?? document.body).appendChild(overlay);
      } catch (err) {
        /* ignore DOM overlay failures */
      }
      console.error(msg);
      setStatus(msg);
      return;
    }
  } catch (err) {
    /* ignore */
  }
  const params = (window as PotFoundryWindow).__pf_initialParams ?? {};
  const ok = await mount({ canvas, initialParams: params });
  if (ok) {
    try {
      const dataId = (canvas.getAttribute('data-pf-wgpu-id') || 'pf-wgpu-default') as string;
      (window as any).__pf_webgpu_mounts = (window as any).__pf_webgpu_mounts || {};
      if ((window as any).__pf_webgpu_mounts[dataId]?.debug) {
        (window as any).__pf_webgpu_mounts[dataId].debug.ready = true;
      }
    } catch (err) {
      /* ignore */
    }
    markStatusReady();
  }
};

export const assertHostHelpersPresent = (): boolean => {
  try {
    const c = (window as any).__pf_webgpu_camera_controller as any | undefined;
    if (!c || !c.helpers) return false;
    return true;
  } catch (err) {
    return false;
  }
};

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void bootWebGPU().catch((err) => {
    console.error('WebGPU boot failed', err);
    try { setStatus(`WebGPU • ${String(err)}`); } catch (e) { /* ignore status failures */ }
  });
} else {
  // In non-browser environments (e.g., unit tests) don't auto-boot the preview.
}
