/*
 * WebGPU preview module for PotFoundry.
 *
 * This TypeScript companion is linted with tsc/eslint so the embedded
 * JavaScript stays type-safe. The runtime build that Streamlit loads is
 * generated via `scripts/build_webgpu_assets.py`.
 */
/// <reference lib="es2020" />
/// <reference lib="dom" />
/// <reference types="@webgpu/types" />


// Modular Shader Imports



import { ShaderManager } from './renderers/webgpu/ShaderManager';
import { WebGPURenderer } from './renderers/webgpu/WebGPURenderer';
import { SceneManager } from './renderers/webgpu/SceneManager';
import ThumbnailRenderer from './services/ThumbnailRenderer';
import {
  createAxisOverlay,
  overlayForAxisFromBasis,
  ndcDirBetween,
  mulMat4Vec4,
  type AxisOverlayInstance,
} from './AxisOverlay';
import {
  createInputManager,
  type InputManagerInstance,
  type FreeKeyboardState,
  type ViewPreset,
} from './InputManager';

import {
  buildCameraBasis,
  normalizeCameraBasis as cbNormalizeCameraBasis,
  applyCameraEulerToBasis,
  syncAnglesFromBasis as cbSyncAnglesFromBasis,
  cameraAxisToWorld as cbCameraAxisToWorld,
  Vec3 as HelperVec3,
  CameraBasis as HelperCameraBasis,
  Quaternion as HelperQuaternion,
  quaternionFromBasis,
  basisFromQuaternion,
  quaternionFromAxisAngle,
  slerpQuaternion,
  multiplyQuaternions,
  invertQuaternion,
  axisAngleFromQuaternion,
  quaternionFromEuler,
  vec3Dot,
  vec3Subtract,
  vec3Length,
  vec3Normalize,
  vec3Scale,
} from './camera_basis';
import {
  viewMatrixFromBasis,
  mat4Multiply,
  matrixIsFinite,
  mat4OrthoLH,
  mat4PerspectiveFovLH,
} from './MatrixMath';
import {
  wrapAngle,
  wrapTau,
  clampZoomValue,
  mulMat4Vec4Full,
} from './MathHelpers';
import { createToolbarButtonSync, type ToolbarButtonSync } from './ToolbarButtonSync';
import { createCameraStateBroadcaster, type CameraStateBroadcaster } from './CameraStateBroadcaster';
import { createDebugPipelineFactory, type DebugPipelineFactory } from './DebugPipelineFactory';
import { createBindGroupFactory, type BindGroupFactory } from './BindGroupFactory';
import { createResizeManager, type ResizeManager, type DimensionResult } from './ResizeManager';
import {
  markUniformParityRewriteNeeded,
  isUniformParityRewritePending,
  clearUniformParityRewriteFlag,
} from './UniformParityGuard';
import {
  createCameraModeManager,
  type CameraModeManager,
} from './CameraModeManager';
import {
  createPointerEventRouter,
  type PointerEventRouter,
} from './PointerEventRouter';
import {
  createControlsClickHandler,
  type ControlsClickHandler,
} from './ControlsClickHandler';
import {
  createAxisIndicatorRenderer,
  type AxisIndicatorRendererInstance,
} from './AxisIndicatorRenderer';
import {
  createCameraCommandRouter,
  type CameraCommandRouterInstance,
} from './CameraCommandRouter';
import { cameraPayloadDiffers as sharedCameraPayloadDiffers } from './camera_basis';
import { worldRayFromCanvas, intersectRayZPlane, intersectRayCylinder } from './camera_helpers';
import { CameraController, PointerState, ControllerHelpers } from './camera_controller';
import * as CameraConstants from './camera_constants';
import type { MountOptions, WebGPUController, WebGPUEvent, WebGPUState, WebGPUParams, CameraRig, Ray, CameraMode, MountConfig, CameraSnapshot } from './types';
export type { WebGPUController, WebGPUEvent } from './types';
import { DEBUG_PARAM_FLAG, ALWAYS_ON_DIAGNOSTICS, isCameraMode, lerp, easeOutCubic, clamp, computeSceneExtents } from './types';
import manager from './infra/logging/MessageManager';
import { installConsolePatch } from './infra/logging/ConsolePatch';
import { resolveLoggingPreferences } from './infra/logging/loggingPreferences';
import { createShaderModule } from './infra/logging/WebGpuCapture';

import { createIdleDetector } from './utils/idleDetection';
import { createUniformBlock, clampNumber, resolveStyleId } from './UniformBlock';
import { STYLE_IDS } from './styles/registry';
import { createBufferWriter, type BufferWriteContext, hexToRgbNorm } from './BufferLayout';
import { STYLE_PARAM_CAPACITY } from './utils/styleParams';
import { type StyleId } from './geometry/types';
import type {} from './webgpu_global';  // Activates global Window augmentation


try {
  installConsolePatch();
} catch (err) {
  /* console patch installation is best-effort */
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
// If debug is explicitly enabled (mount will set `debugEnabled` per session),
// attach `manager` to `window` so dev tooling / tests can inspect runtime counters.
try {
  window.__pf_manager = window.__pf_manager ?? manager;
} catch (err) {
  /* ignore attach errors */
}

// WGSL source generation logic moved to ShaderManager



const MAX_VERTS = 0xffffffff;
const {
  DEFAULT_INTERACTIVE_LOD,
  MIN_INTERACTIVE_LOD,
  MIN_THETA_STATIC,
  MIN_Z_STATIC,
  PARAM_UPDATE_TIMEOUT_MS,
  CAMERA_BROADCAST_MS,
  CAMERA_EPSILON,
  CAMERA_STATIC_EPS,
  CAMERA_PADDING,
  CAMERA_PADDING_MIN,
  CAMERA_PADDING_MAX,
  BASE_FOV,
  MIN_FOV,
  MAX_FOV,
  CAMERA_NEAR_EPS,
  CAMERA_DISTANCE_FALLOFF,
  UNIFORM_FLOAT_COUNT,
  CAMERA_EYE_OFFSET,
  CAMERA_MODE_OFFSET,
  VP_MATRIX_OFFSET,
  CAMERA_RIGHT_OFFSET,
  CAMERA_UP_OFFSET,
  CAMERA_FORWARD_OFFSET,
  GRID_FLAG_OFFSET,
  SPECULAR_GAIN_OFFSET,
  ROUGHNESS_OFFSET,

  SHOW_INNER_OFFSET,
  // BELL_WIDTH_OFFSET, // Moved to geometry
  DRAIN_RADIUS_OFFSET,
  INVALID_STATUS_COOLDOWN_MS,
  DEFAULT_CLEAR_COLOR,
  // Professional camera constants
  /*
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_SENSITIVITY,
  PAN_SENSITIVITY,
  PAN_INERTIA_DECAY,
  ROTATION_INERTIA_DECAY,
  ROTATION_INERTIA_MIN,
  */
  AUTOROTATE_SPEED_DEFAULT,
  /*
  AUTOROTATE_RESUME_DELAY_MS,
  */
  PIVOT_LERP_SPEED,
  PIVOT_SNAP_THRESHOLD,
} = CameraConstants;


type CameraBasis = import('./camera_basis').CameraBasis;

// Minimal local types to satisfy TypeScript; the concrete types are defined elsewhere or are runtime shaped.
type WebGPUEmitter = (ev: WebGPUEvent | any) => void;
// WebGPUEvent re-exported from types_shims
type GradientColor = [number, number, number];
type ClearColor = [number, number, number, number];
// CameraMode is imported from './types'
// Matrix math functions extracted to MatrixMath.ts (Phase 5)
// Ray type defined later as { origin: Vec3; dir: Vec3 }
type Vec3 = HelperVec3;
type Quaternion = HelperQuaternion;
let lastLookAtBasis: { xLen: number; yLen: number; zLen: number } | null = null;
let lastCameraRig: CameraRig | null = null;

// UniformParityGuard functions imported from './UniformParityGuard' (Phase 13)
// Type and implementations extracted to maintain module-level exports for tests

// Single module-level controller instance (mounted in `mount`).
var cameraController: CameraController | null = null;

function resolveActiveBasis(state: WebGPUState): CameraBasis {
  const src: CameraBasis = {
    right: state.displayCamRight ?? state.camRight,
    up: state.displayCamUp ?? state.camUp,
    forward: state.displayCamForward ?? state.camForward,
  } as CameraBasis;
  if (src && Number.isFinite(src.forward[0]) && Number.isFinite(src.forward[1]) && Number.isFinite(src.forward[2]) && Math.hypot(src.forward[0], src.forward[1], src.forward[2]) > 1e-6) {
    return src;
  }
  if (typeof cameraController !== 'undefined' && cameraController) {
    return cameraController.resolveActiveBasis();
  }
  return cbNormalizeCameraBasis({ right: [1, 0, 0], up: [0, 0, 1], forward: [0, -1, 0] }) as CameraBasis;
}

const VECTOR_EPS = 1e-6;
function ensureInteractiveBasis(state: WebGPUState): CameraBasis {
  const pickVector = (displayVec?: Vec3 | null, fallbackVec?: Vec3 | null): Vec3 | null => {
    const src = (displayVec ?? fallbackVec) as Vec3 | null | undefined;
    if (!src || src.length !== 3) {
      return null;
    }
    if (!src.every((value) => Number.isFinite(value))) {
      return null;
    }
    return src as Vec3;
  };
  const right = pickVector(state.displayCamRight, state.camRight);
  const up = pickVector(state.displayCamUp, state.camUp);
  const forward = pickVector(state.displayCamForward, state.camForward);
  if (right && up && forward) {
    const magnitude = Math.hypot(forward[0], forward[1], forward[2]);
    if (magnitude > VECTOR_EPS) {
      return { right, up, forward } as CameraBasis;
    }
  }
  const fallback = cbNormalizeCameraBasis({
    right: [1, 0, 0],
    up: [0, 0, 1],
    forward: [0, -1, 0],
  });
  state.displayCamRight = [...fallback.right];
  state.displayCamUp = [...fallback.up];
  state.displayCamForward = [...fallback.forward];
  return fallback as CameraBasis;
}

function resetInertia(state: WebGPUState): void {
  if (typeof cameraController !== 'undefined' && cameraController) {
    return cameraController.resetInertia();
  }
  state.inertiaRotX = 0;
  state.inertiaRotY = 0;
  state.inertiaPanX = 0;
  state.inertiaPanY = 0;
  state.inertiaArcAxis = null;
  state.inertiaArcSpeed = 0;
}



type GeometrySnapshot = {
  nTheta: number;
  nZ: number;
  innerSeg: number;
  bottomRings: number;
  rimRings: number;
  totalVerts: number;
};

type WebGPUErrorCode =
  | 'webgpu:not-supported'
  | 'webgpu:adapter-unavailable'
  | 'webgpu:context-unavailable'
  | 'webgpu:pipeline-failed'
  | 'webgpu:invalid-vertex-count'
  | 'webgpu:index-overflow'
  | 'component:mount-failed'
  | 'component:mount-rejected';

const postToHost = (emit: WebGPUEmitter | null, message: WebGPUEvent): void => {
  try {
    emit?.(message);

  } catch (err) {
    console.warn('WebGPU emit error', err);
    return;
  }
};

// hexToRgbNorm moved to BufferLayout.ts

const mergeParams = (target: WebGPUParams | null, incoming: WebGPUParams): WebGPUParams => {
  if (!target) {
    return { ...incoming };
  }
  for (const key of Object.keys(incoming)) {
    const val = incoming[key];
    if (val !== undefined) {
      target[key] = val;
    }
  }
  return target;
};

// clampZoomValue imported from MathHelpers.ts (Phase 7)

const ensureFreePosition = (state: WebGPUState): Vec3 => {
  if (typeof cameraController !== 'undefined' && cameraController) {
    try {
      return cameraController.ensureFreePosition(state);
    } catch (err) {
      /* fallback below */
    }
  }
  const pos = state.freePosition as Vec3 | null | undefined;
  if (Array.isArray(pos) && pos.length === 3 && pos.every((n) => Number.isFinite(n))) {
    return pos as Vec3;
  }
  const pivotZ = state.pivot?.[2] ?? 0;
  const fallback: Vec3 = [state.panX || 0, (state.panY || 0) - Math.max((state.sceneRadius || 1) * 2.2, 120), pivotZ + Math.max((state.sceneRadius || 1) * 0.25, 30)];
  state.freePosition = fallback;
  return fallback;
};

// wrapAngle, wrapTau imported from MathHelpers.ts (Phase 7)

const parseClearColor = (source: unknown): ClearColor => {
  if (Array.isArray(source) && source.length >= 4) {
    return [
      clampNumber(source[0], 0),
      clampNumber(source[1], 0),
      clampNumber(source[2], 0),
      clampNumber(source[3], 0),
    ];
  }
  return DEFAULT_CLEAR_COLOR;
};

const resolveAlphaMode = (mode: unknown): 'opaque' | 'premultiplied' => {
  const raw = typeof mode === 'string' ? mode.toLowerCase() : '';
  return raw === 'gradient' ? 'premultiplied' : 'opaque';
};

const sanitizeInt = (value: unknown, fallback: number, minimum: number): number => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(parsed, minimum);
};


// Depth format is configurable depending on the pipeline fallback that succeeds.
let depthFormatUsed: GPUTextureFormat | null = 'depth24plus';

const createDepthTexture = (device: GPUDevice, width: number, height: number): GPUTexture | null => {
  if (!depthFormatUsed) return null;
  return device.createTexture({
    label: 'component:depth-texture',
    size: { width, height },
    format: (depthFormatUsed ?? 'depth24plus') as GPUTextureFormat,
    usage:
      (
        (globalThis as Record<string, unknown>).GPUTextureUsage as
        | { RENDER_ATTACHMENT?: number }
        | undefined
      )?.RENDER_ATTACHMENT ?? 0x10,
  });
}


// writeGradient intentionally implemented inside `mount` to allow access
// to per-mount instrumentation and to reuse preallocated scratch buffers
// without allocating in the hot render path.

const sanitizePadding = (value: number): number => {
  const normalized = Math.abs(value) || CAMERA_PADDING;
  return Math.min(Math.max(normalized, CAMERA_PADDING_MIN), CAMERA_PADDING_MAX);
};

// vec3Length, vec3Normalize, vec3Scale imported from camera_basis.ts (Phase 6)

const applyCameraEuler = (state: WebGPUState, rotX: number, rotY: number): void => {
  const basis = applyCameraEulerToBasis(rotX, rotY);
  // Deterministic view construction: DO NOT auto-flip basis here. This
  // preserves a canonical mapping from Euler angles to a camera basis.
  // If an application requires a consistent top-view orientation, prefer
  // explicit presets (applyViewPreset) which set canonical yaw values.
  state.camForward = [...basis.forward];
  state.camUp = [...basis.up];
  state.camRight = [...basis.right];
  state.camQuat = quaternionFromBasis(basis);
  state.rotX = wrapAngle(rotX);
  state.rotY = wrapAngle(rotY);
  state.rotZ = 0;
};


// rotateBasisInPlace is imported from shared helpers and used directly.

const normalizeCameraBasis = cbNormalizeCameraBasis;

// Forward declaration for commitDisplayBasisToState.
// This function is defined inside `mount` to access the camera controller,
// but is used in module-level functions like applyViewPreset.
let commitDisplayBasisToState: (state: WebGPUState) => boolean = (_state: WebGPUState) => false;

// Forward declaration for emitDiagnostic (defined inside mount).
let emitDiagnostic: (message: string, detail?: Record<string, unknown>) => void = () => { };

// Matrix math functions extracted to MatrixMath.ts (Phase 5)
// mulMat4Vec4, ndcDirBetween, and overlayForAxisFromBasis are now imported from ./AxisOverlay

const INTERACTION_TIMEOUT_MS = 240;
const INERTIA_DECAY = 0.92;
// Choose a tight threshold to avoid accidental 180° flips when committing transient
// camera basis into persistent state. The value mirrors the preview asset
// implementation and test expectations (-0.999) so flipping only occurs when
// the new right vector is nearly inverted relative to the previous right.
const BASIS_FLIP_DOT_THRESHOLD = CameraConstants.BASIS_FLIP_DOT_THRESHOLD; // dot threshold used when deciding whether to flip basis

// Convert per-frame decay factor (e.g., 0.92 per 1/60s frame) to an exponential
// decay lambda such that factor(dt) = exp(-INERTIA_LAMBDA * dt)
const INERTIA_LAMBDA = -Math.log(INERTIA_DECAY) * 60; // per-second decay rate

const computePanFactor = (state: WebGPUState, canvas: HTMLCanvasElement): number => {
  if (typeof cameraController !== 'undefined' && cameraController) {
    try {
      return cameraController.computePanFactor(canvas);
    } catch (err) {
      /* fallback to local computation */
    }
  }
  const rect = canvas.getBoundingClientRect();
  const reference = Math.max(rect.width, rect.height, 1);
  const scene = Math.max(state.sceneRadius, 1);
  const zoom = Math.max(state.zoom, 1e-3);
  return (scene / reference) * (2 / zoom);
};

const applyViewPreset = (state: WebGPUState, preset: string): void => {
  switch (preset) {
    case 'top':
      applyCameraEuler(state, Math.PI / 2 - 1e-3, 0);
      // Ensure top view is oriented with positive Y up on screen. If the
      // computed camera up vector points with negative Y, rotate yaw by
      // π so the viewer sees a consistent upright top view.
      if ((state.camUp?.[1] ?? 0) < 0) {
        state.rotY = wrapAngle((state.rotY ?? 0) + Math.PI);
        applyCameraEuler(state, state.rotX, state.rotY);
      }
      break;
    case 'bottom':
      applyCameraEuler(state, -Math.PI / 2 + 1e-3, 0);
      break;
    case 'front':
      applyCameraEuler(state, 0, 0);
      break;
    case 'back':
      applyCameraEuler(state, 0, Math.PI);
      break;
    case 'left':
      applyCameraEuler(state, 0, Math.PI / 2);
      break;
    case 'right':
      applyCameraEuler(state, 0, -Math.PI / 2);
      break;
    case 'iso':
      applyCameraEuler(state, 0.9, -Math.PI / 4);
      break;
    case 'fit':
    default:
      applyCameraEuler(state, 0.35, 0);
      state.zoom = 1.0;
      break;
  }
  state.panX = 0;
  state.panY = 0;
  resetInertia(state);
  const pivotZ = state.pivot?.[2] ?? 0;
  state.pivot = [state.panX, state.panY, pivotZ];
  state.cameraDirty = true;
  // Set display state from the committed cam* values
  // Auto-rotate will use these display values as its starting position
  state.displayCamRight = [...state.camRight];
  state.displayCamUp = [...state.camUp];
  state.displayCamForward = [...state.camForward];
  state.displayCamQuat = [...state.camQuat] as Quaternion;
  state.displayRotX = state.rotX;
  state.displayRotY = state.rotY;
  // Pause auto-rotate briefly so the new preset position takes effect
  state.autoRotateResumeAt = performance.now() + 500; // 500ms delay for visual feedback
};
export { applyViewPreset };
export { buildCameraRig };
export { overlayForAxisFromBasis };
export const __axisParityTestHooks = {
  markUniformParityRewriteNeeded,
  clearUniformParityRewriteFlag,
  isUniformParityRewritePending,
  applyCameraEuler,
  applyCameraEulerToBasis,
};

const buildCameraRig = (
  state: WebGPUState,
  paddingHint: number,
  paddedHalfWidth?: number | null,
  paddedHalfHeight?: number | null
): CameraRig => {
  const aspect = Math.max(state.canvasAspect || 1, 1e-3);
  if (state.cameraMode === 'free') {
    const basis = resolveActiveBasis(state);
    const eye = ensureFreePosition(state);
    const zoom = clampZoomValue(state.zoom || 1.0);
    const targetFov = Math.min(Math.max(BASE_FOV / zoom, MIN_FOV), MAX_FOV);
    const near = CAMERA_NEAR_EPS;
    const far = Math.max(near + state.sceneRadius * 16, near + 2000);
    const projection = mat4PerspectiveFovLH(targetFov, aspect, near, far);
    const view = viewMatrixFromBasis(basis, eye);
    const viewProjection = mat4Multiply(projection, view);
    const rig: CameraRig = {
      eye,
      viewProjection,
      near,
      far,
      fov: targetFov,
      mode: 'perspective',
      basis,
    };
    // Parity alignment: ensure rig.basis overlay projection matches
    // viewProjection-derived overlay. If mismatch found, flip right/up and
    // recompute viewProjection so the returned rig is consistent.
    try {
      const testAxis: Vec3 = [0, 0, 1];
      const worldScale = Math.max(state.sceneRadius || 1, 1);
      const pA = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
      const pB = mulMat4Vec4(rig.viewProjection, (state.pivot?.[0] ?? 0) + testAxis[0] * worldScale, (state.pivot?.[1] ?? 0) + testAxis[1] * worldScale, (state.pivot?.[2] ?? 0) + testAxis[2] * worldScale);
      const dirNdc = ndcDirBetween(pA, pB);
      const ov_proj = [dirNdc[0], -dirNdc[1]];
      const ov_proj_len = Math.hypot(ov_proj[0], ov_proj[1]);
      if (ov_proj_len > 1e-9) {
        const ov_proj_unit = [ov_proj[0] / ov_proj_len, ov_proj[1] / ov_proj_len];
        const ov_basis_unit = overlayForAxisFromBasis(rig, basis, testAxis, [state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0], worldScale);
        // overlayForAxisFromBasis returns a normalized 2D direction; verify it's valid
        const ov_basis_len = Math.hypot(ov_basis_unit[0], ov_basis_unit[1]);
        if (ov_basis_len > 1e-9) {
          const dotAlign = ov_basis_unit[0] * ov_proj_unit[0] + ov_basis_unit[1] * ov_proj_unit[1];
          // console.log('[WebGPU] buildCameraRig parity_check', { preset: 'free', ov_basis_unit, ov_proj_unit, dotAlign });
          if (dotAlign < BASIS_FLIP_DOT_THRESHOLD && !state.interacting && !state.disableAutoFlip) {
            basis.right = vec3Scale(basis.right, -1);
            basis.up = vec3Scale(basis.up, -1);
            try {
              emitDiagnostic('component:rig-parity_flip', { dotAlign, preset: 'free' });
            } catch (err) {/* best-effort */ }
            // Recompute view/projection with corrected basis
            const correctedView = viewMatrixFromBasis(basis, eye);
            const correctedVP = mat4Multiply(projection, correctedView);
            rig.basis = basis;
            rig.viewProjection = correctedVP;
            markUniformParityRewriteNeeded(state);
          }
        }
      }
      // end interacting guard
    } catch (err) {
      /* best-effort only */
    }
    lastCameraRig = rig;
    return rig;
  }
  // If caller provided separate padded half extents (in world units) use those
  // otherwise fall back to the legacy single-radius approach.
  let paddedWidth = paddedHalfWidth ?? null;
  let paddedHeight = paddedHalfHeight ?? null;
  if (paddedWidth === null || paddedHeight === null) {
    const radius = Math.max(state.sceneRadius, 1);
    const radiusPadded = Math.max(radius * paddingHint, 1);
    paddedWidth = radiusPadded;
    paddedHeight = radiusPadded;
  }
  // Normalize into numeric values and compute a scalar paddedMax for fallbacks.
  const paddedMax = Math.max(Number(paddedWidth), Number(paddedHeight), 1);
  const zoom = Math.max(state.zoom, 1e-3);
  const targetZ = state.pivot?.[2] ?? 0;
  const target: Vec3 = [state.panX, state.panY, targetZ];
  const basis = resolveActiveBasis(state);
  // Treat zoom as a dolly factor in perspective: higher zoom moves the
  // camera closer while keeping FOV near a comfortable base value. This
  // avoids the extreme perspective warping that results from driving zoom
  // purely through FOV.
  let distance = paddedMax * CAMERA_DISTANCE_FALLOFF / zoom;
  let near = CAMERA_NEAR_EPS;
  let far = Math.max(near + paddedMax * 6, distance + paddedMax * 6);
  let fov = BASE_FOV;
  let projection: Float32Array;
  if (state.projectionMode === 'perspective') {
    const halfFov = Math.max(fov * 0.5, 1e-4);
    const halfFovY = halfFov;
    const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
    // paddedWidth/paddedHeight are half-extents (or a legacy radius). Compute
    // the distances required to fit each axis into the frustum and pick the
    // maximum.
    const dV = Math.max(1e-6, Number(paddedHeight)) / Math.max(Math.tan(halfFovY), 1e-6);
    const dH = Math.max(1e-6, Number(paddedWidth)) / Math.max(Math.tan(halfFovX), 1e-6);
    distance = Math.max(dV, dH) * CAMERA_DISTANCE_FALLOFF / zoom;
    near = Math.max(distance * 0.05, CAMERA_NEAR_EPS);
    // Far plane must account for camera distance plus scene size, with extra margin for zoom out
    far = Math.max(distance + Math.max(Number(paddedHeight), Number(paddedWidth)) * 8, near + 1);
    projection = mat4PerspectiveFovLH(fov, aspect, near, far);
  } else {
    const paddedHeightValue = Math.max(Number(paddedHeight), 1);
    const paddedWidthValue = Math.max(Number(paddedWidth), 1);
    // Scale the orthographic frustum based on the limiting axis so the pot
    // keeps a stable on-screen size even as the canvas aspect ratio changes.
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
  const eye = vec3Subtract(target, vec3Scale(basis.forward, distance));
  const view = viewMatrixFromBasis(basis, eye);
  const viewProjection = mat4Multiply(projection, view);
  if (matrixIsFinite(viewProjection)) {
    const rig: CameraRig = { eye, viewProjection, near, far, fov, mode: state.projectionMode, basis };
    try {
      const testAxis: Vec3 = [0, 0, 1];
      const worldScale = Math.max(state.sceneRadius || 1, 1);
      const pA = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
      const pB = mulMat4Vec4(rig.viewProjection, (state.pivot?.[0] ?? 0) + testAxis[0] * worldScale, (state.pivot?.[1] ?? 0) + testAxis[1] * worldScale, (state.pivot?.[2] ?? 0) + testAxis[2] * worldScale);
      const dirNdc = ndcDirBetween(pA, pB);
      const ov_proj = [dirNdc[0], -dirNdc[1]];
      const ov_proj_len = Math.hypot(ov_proj[0], ov_proj[1]);
      if (ov_proj_len > 1e-9) {
        const ov_proj_unit = [ov_proj[0] / ov_proj_len, ov_proj[1] / ov_proj_len];
        const ov_basis_unit = overlayForAxisFromBasis(rig, basis, testAxis, [state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0], worldScale);
        // overlayForAxisFromBasis returns a normalized 2D direction; verify it's valid
        const ov_basis_len = Math.hypot(ov_basis_unit[0], ov_basis_unit[1]);
        if (ov_basis_len > 1e-9) {
          const dotAlign = ov_basis_unit[0] * ov_proj_unit[0] + ov_basis_unit[1] * ov_proj_unit[1];
          // console.log('[WebGPU] buildCameraRig parity_check (non-free)', { ov_basis_unit, ov_proj_unit, dotAlign });
          if (dotAlign < BASIS_FLIP_DOT_THRESHOLD && !state.interacting && !state.disableAutoFlip) {
            basis.right = vec3Scale(basis.right, -1);
            basis.up = vec3Scale(basis.up, -1);
            try {
              emitDiagnostic('component:rig-parity_flip', { dotAlign, preset: 'non-free' });
            } catch (err) {/* best-effort */ }
            const correctedView = viewMatrixFromBasis(basis, eye);
            const correctedVP = mat4Multiply(projection, correctedView);
            rig.basis = basis;
            rig.viewProjection = correctedVP;
            markUniformParityRewriteNeeded(state);
          }
        }
      }
    } catch (err) {
      /* best-effort only */
    }
    lastCameraRig = rig;
    return rig;
  }
  const fallbackBasis = normalizeCameraBasis({ right: [1, 0, 0], up: [0, 0, 1], forward: [0, -1, 0] });
  const fallbackEye = vec3Subtract(target, vec3Scale(fallbackBasis.forward, distance));
  const fallbackView = viewMatrixFromBasis(fallbackBasis, fallbackEye);
  const fallbackViewProjection = mat4Multiply(projection, fallbackView);
  const fallbackRig: CameraRig = {
    eye: fallbackEye,
    viewProjection: fallbackViewProjection,
    near,
    far,
    fov,
    mode: state.projectionMode,
    basis: fallbackBasis,
  };

  // instantiate controller in `mount` instead of here (pointer/canvas are mount-scoped)
  lastCameraRig = fallbackRig;
  return fallbackRig;
};

export const handleDeviceLost = (
  info: GPUDeviceLostInfo,
  context: {
    getInitializationComplete: () => boolean;
    setDeviceLostDuringInit: () => void;
    getLastOperation: () => string;
    emit: MountOptions['emit'];
  }
) => {
  // If usage of 'destroyed', it's intentional (e.g. from destroy()), so ignore it.
  if (info.reason === 'destroyed') return;

  const currentOp = context.getLastOperation();
  console.error(`[CRITICAL] WGPU_DEVICE_LOST — Device lost: ${info.message} | ${JSON.stringify(info)} | lastOp: ${currentOp}`);

  // If not initialized yet, we mark it so mount() can fail gracefully
  if (!context.getInitializationComplete()) {
    context.setDeviceLostDuringInit();
  } else {
    // If runtime crash, we must signal the app to fallback
    // Uses the emit callback passed in mount options
    if (context.emit) {
      context.emit({
        type: 'device-lost',
        reason: info.message || 'Unknown device loss',
        info
      });
    }
  }
};

export const mount = async ({
  canvas,
  canvasId,
  statusEl,
  controlsEl,
  initialParams,
  emit = null,
  debugMode = false,
  onAutoRotateChange,
}: MountOptions): Promise<WebGPUController | null> => {
  // Ensure callers may pass `null`/`undefined` for initialParams — normalize
  // to an empty object so subsequent code can read properties without
  // repeated null-checks. This quiets TypeScript diagnostics and is safe
  // because we only read optional initial params.
  initialParams = initialParams ?? {};

  // Verify Shader Source Integrity (Hot-Patch Check)
  // WGSL validation replaced by ShaderManager checks

  applyLoggingPreferences(initialParams as Record<string, unknown>);
  let statusReady = false;
  // Attach manager to window for debug/test introspection; harmless in production.
  try {
    window.__pf_manager = manager;
  } catch (err) {
    /* ignore */
  }
  const statusElement = statusEl ?? null;
  const debugEnabled = Boolean(debugMode || (initialParams && initialParams[DEBUG_PARAM_FLAG]));
  if (debugEnabled && initialParams && DEBUG_PARAM_FLAG in initialParams) {
    delete (initialParams as Record<string, unknown>)[DEBUG_PARAM_FLAG];
  }
  const mountCanvasId = (canvasId ?? '').trim() || undefined;
  try {
    window.__pf_webgpu_mounts = window.__pf_webgpu_mounts ?? {};
    if (mountCanvasId) {
      window.__pf_webgpu_mounts[mountCanvasId] = window.__pf_webgpu_mounts[mountCanvasId] ?? {};
      const mount = window.__pf_webgpu_mounts[mountCanvasId]!;
      mount.debug = mount.debug ?? {
        ready: false,
        usedFallback: false,
        lastApplyCameraPayload: null,
        lastSceneRadiusUpdate: null,
        lastPayloadIsFullState: false,
        metrics: { uniformWrites: 0, rigRebuilds: 0, styleParamWrites: 0, colorWrites: 0 },
      };
    }
  } catch (err) {
    /* ignore */
  }

  // In-memory buffer of the last diagnostic messages (for overlay/remote inspection)
  const DIAG_BUFFER_MAX = 32;
  const diagBuffer: Array<{ ts: number; message: string; detail?: Record<string, unknown> }> = [];
  let debugOverlayEl: HTMLElement | null = null;
  const addDiagToBuffer = (message: string, detail?: Record<string, unknown>) => {
    diagBuffer.push({ ts: Date.now(), message, detail });
    while (diagBuffer.length > DIAG_BUFFER_MAX) diagBuffer.shift();
    if (debugOverlayEl) {
      try {
        const lines = diagBuffer.slice(-6).map((d) => `${new Date(d.ts).toISOString()} ${d.message} ${d.detail ? JSON.stringify(d.detail) : ''}`);
        debugOverlayEl.textContent = lines.join('\n');
      } catch (e) {
        /* ignore */
      }
    }
  };

  // Assign the real implementation to the forward-declared emitDiagnostic
  emitDiagnostic = (message: string, detail: Record<string, unknown> = {}): void => {
    const telemetryAllowed = debugEnabled || ALWAYS_ON_DIAGNOSTICS.has(message);
    if (!telemetryAllowed) {
      return;
    }
    if (debugEnabled) {
      // Use message as signature to group same-type diagnostics
      // unique details (timestamps) won't prevent grouping, but recent detail will be updated
      if (Object.keys(detail).length) {
        manager.debug('diag:' + message, message, detail, message);
      } else {
        manager.debug('diag:' + message, message, undefined, message);
      }
    }
    postToHost(emit, {
      type: 'diagnostic',
      payload: {
        message,
        detail,
        timestamp: Date.now(),
        canvasId: mountCanvasId,
      },
    });
    addDiagToBuffer(message, detail);
  };

  // Also surface recent diagnostics in the small debug overlay to help
  // diagnose rendering problems on systems where the console is harder
  // to inspect (e.g., remote or embedded hosts). This prints the last
  // diagnostic message and detail to the overlay when present.

  const debugLog = (message: string, detail?: Record<string, unknown>): void => {
    if (!debugEnabled) return;
    if (detail) manager.debug(`webgpu:${message}`, message, detail);
    else manager.debug(`webgpu:${message}`, message);
  };

  if (debugEnabled) {
    debugLog('debug-mode:enabled', { canvasId: mountCanvasId });
    emitDiagnostic('debug-mode:enabled', { canvasId: mountCanvasId });
  }
  emitDiagnostic('mount:start', { userAgent: navigator.userAgent });
  console.info('[WebGPU] mount:start', { canvasId: mountCanvasId, userAgent: navigator.userAgent });

  const setStatus = (msg: string): void => {
    if (!statusElement) {
      console.info('[WebGPU]', msg);
      return;
    }
    const normalized = msg.toLowerCase();
    const finalMsg = statusReady && !normalized.includes('ready') ? `${msg} • ready` : msg;
    statusElement.textContent = finalMsg;
    if (statusReady) {
      statusElement.setAttribute('data-ready', '1');
    }
  };

  const emitErrorEvent = (error: {
    code: WebGPUErrorCode;
    message: string;
    detail?: string;
    fatal?: boolean;
    context?: Record<string, unknown>;
  }): void => {
    debugLog('error', { code: error.code, detail: error.detail, fatal: error.fatal });
    emitDiagnostic('error', {
      code: error.code,
      message: error.message,
      detail: error.detail,
      fatal: error.fatal,
      context: error.context,
    });
    postToHost(emit, {
      type: 'error',
      payload: {
        code: error.code,
        message: error.message,
        detail: error.detail,
        fatal: error.fatal ?? false,
        timestamp: Date.now(),
        canvasId: mountCanvasId,
        context: error.context ?? {},
      },
    });
  };

  const fail = (
    code: WebGPUErrorCode,
    msg: string,
    detail?: string,
    context?: Record<string, unknown>
  ): null => {
    setStatus(msg);
    emitErrorEvent({ code, message: msg, detail, fatal: true, context });
    emitDiagnostic('mount:fail', { code, detail, context });
    console.error('[WebGPU] mount:fail', { code, detail, context });
    return null;
  };

  const markStatusReady = (): void => {
    statusReady = true;
    if (statusElement) {
      statusElement.setAttribute('data-ready', '1');
    }
    setStatus('WebGPU • ready');
    emitDiagnostic('component:status-ready');
    console.info('[WebGPU] component:status-ready', { canvasId: mountCanvasId });
  };
  const baseDiagInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : null,
    protocol: typeof window !== 'undefined' ? window.location?.protocol : null,
    host: typeof window !== 'undefined' ? window.location?.host : null,
  };

  // Check for secure context first - WebGPU requires HTTPS
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    emitDiagnostic('webgpu:insecure-context', { ...baseDiagInfo });
    return fail(
      'webgpu:not-supported',
      'WebGPU requires HTTPS',
      'WebGPU is only available in secure contexts (HTTPS). Please access the app via https:// or localhost.',
      { ...baseDiagInfo, reason: 'insecure-context' }
    );
  }


  const renderer = new WebGPURenderer(canvas);
  if (!await renderer.init()) {
    // Fallback error handling if renderer init fails
    return fail('webgpu:adapter-unavailable', 'WebGPU initialization failed - check console for details');
  }

  const device = renderer.device!;
  const context = renderer.context!;
  const format = renderer.presentationFormat;

  // Create debug pipeline factory (Phase 10 extraction)
  const debugPipelineFactory = createDebugPipelineFactory({
    device,
    format,
    depthFormat: depthFormatUsed ?? 'depth24plus',
  });

  emitDiagnostic('webgpu:adapter-ready');
  emitDiagnostic('webgpu:device-ready');
  emitDiagnostic('webgpu:context-ready');

  // Track device loss during initialization AND runtime
  let deviceLostDuringInit = false;
  let lastOperation = 'init'; // Track last operation for debugging

  // CRITICAL: Defer device.lost handler attachment to allow GPU instance to stabilize.
  setTimeout(() => {
    // We access disposed variable which is defined further down. 
    // In lambda it should be fine as it runs later.
    if (disposed) return;
    device.lost.then((info) => {
      handleDeviceLost(info, {
        getInitializationComplete: () => resizeManager.isInitialized(),
        setDeviceLostDuringInit: () => { deviceLostDuringInit = true; },
        getLastOperation: () => lastOperation,
        emit
      });
    });
  }, 500);

  let width = 1;
  let height = 1;
  let devicePixelRatio = window.devicePixelRatio || 1;

  // Store device limits for mobile-safe canvas sizing
  // Desktop GPUs typically have 16384+, mobile GPUs may be 4096-8192
  // Store device limits for mobile-safe canvas sizing
  // Desktop GPUs typically have 16384+, mobile GPUs may be 4096-8192
  let maxTextureDimension2D = 8192; // Safe default
  let disposed = false; // Declared early to avoid Temporal Dead Zone errors in helper functions
  try {
    maxTextureDimension2D = device.limits?.maxTextureDimension2D ?? 8192;
    if (import.meta.env.DEV) console.log(`[WebGPU] Device maxTextureDimension2D: ${maxTextureDimension2D}`);
  } catch (e) { /* ignore limit query errors */ }

  // CRITICAL: Add stabilization delay before first GPU operation.
  // Windows Dawn WebGPU backend crashes with "Instance reference no longer exists" if GPU
  // operations (like createTexture) happen too soon after device creation.
  // Increased stabilization delay to 200ms based on user reports of crashes at 50ms
  if (import.meta.env.DEV) console.log('[WebGPU] Waiting 200ms for GPU device stabilization...');
  await new Promise(resolve => setTimeout(resolve, 200));
  if (import.meta.env.DEV) console.log('[WebGPU] Device stabilization complete, proceeding with initialization...');

  // Initialize SceneManager
  const sceneManager = new SceneManager(renderer);
  const reqInitStyleId = typeof initialParams.style === 'number' ? initialParams.style : 0;
  try {
    if (!await sceneManager.init(reqInitStyleId)) {
      console.error('[WebGPU] SceneManager.init returned false');
      ThumbnailRenderer.getInstance().rejectDevice();
      return fail('webgpu:pipeline-failed', 'SceneManager initialization failed');
    }
  } catch (err) {
    console.error('[WebGPU] SceneManager.init threw:', err);
    ThumbnailRenderer.getInstance().rejectDevice();
    return fail('webgpu:pipeline-failed', `SceneManager initialization crashed: ${err}`);
  }

  // Share device with ThumbnailRenderer (must be after stabilization + SceneManager init)
  ThumbnailRenderer.getInstance().setDevice(device);

  // Extract buffers for legacy code compatibility
  const uniformBuffer = sceneManager.uniformBuffer!;
  const styleParamBuffer = sceneManager.styleParamBuffer!;

  const colorBuffers = {
    c1: sceneManager.bgBuffers.c1,
    c2: sceneManager.bgBuffers.c2,
    c3: sceneManager.bgBuffers.c3
  };

  // Legacy code maps bgBuffers.c1 to binding 5 (bg1)
  const bgBuffers = {
    c1: sceneManager.bgBuffers.bg1,
    c2: sceneManager.bgBuffers.bg2,
    c3: sceneManager.bgBuffers.bg3
  };

  // Create buffer writer factory (owns pre-allocated scratch buffers)
  const writeContext: BufferWriteContext = {
    isDisposed: () => disposed,
    emitDiagnostic,
    mountCanvasId,
  };
  const bufferWriter = createBufferWriter({ device, context: writeContext });

  let depth = createDepthTexture(device, width, height);

  const initialAutoRotateRaw = (initialParams as Record<string, unknown>).autoRotate;
  const initialAutoRotate =
    typeof initialAutoRotateRaw === 'boolean' ? Boolean(initialAutoRotateRaw) : false;

  const state: WebGPUState = {
    rotX: 0.35,
    rotY: 0.0,
    rotZ: 0,
    autoRotate: initialAutoRotate,
    autoRotateSpeed: AUTOROTATE_SPEED_DEFAULT,
    autoRotateResumeAt: 0,
    cameraMode: 'turntable',
    zoom: 1.0,
    orbitZoom: 1.0,
    panX: 0,
    panY: 0,
    inertiaRotX: 0,
    inertiaRotY: 0,
    inertiaPanX: 0,
    inertiaPanY: 0,
    inertiaArcAxis: null,
    inertiaArcSpeed: 0,
    interacting: false,
    lastInteraction: performance.now(),
    sceneRadius: 120,
    zone: {},
    interactiveLodRatio: DEFAULT_INTERACTIVE_LOD,
    interactiveLodEnabled: false,
    recentParamUpdate: false,
    lastParamUpdate: performance.now(),
    lastParamNonce: null,
    canvasAspect: 1,
    cameraDirty: true,
    lastCameraPush: 0,
    projectionMode: 'ortho',
    debugOverlay: false,
    showGrid: true,
    showAxis: true,
    disableAutoFlip: false,
    autoPivotFromCamera: false,
    camRight: [1, 0, 0],
    camUp: [0, 0, 1],
    camForward: [0, -1, 0],
    camQuat: [0, 0, 0, 1],
    displayCamRight: null,
    displayCamUp: null,
    displayCamForward: null,
    displayCamQuat: null,
    displayRotX: null,
    displayRotY: null,
    displayRotZ: null,
    pivot: [0, 0, 0],
    targetPivot: null,
    useArcball: false,
    freePosition: [0, -240, 80],
    freeSpeed: 1.0,
  };

  applyCameraEuler(state, state.rotX, state.rotY);
  state.orbitZoom = state.zoom;
  try {
    const defaultTarget: Vec3 = [state.panX, state.panY, state.pivot?.[2] ?? 0];
    const defaultDistance = Math.max(state.sceneRadius * CAMERA_DISTANCE_FALLOFF, 120);
    const initialEye = vec3Subtract(defaultTarget, vec3Scale(state.camForward, defaultDistance));
    state.freePosition = initialEye;
  } catch (err) {
    state.freePosition = [0, -240, 80];
  }

  const DEBUG_THROTTLE_MS = 250;
  let lastDebugOverlayUpdate = 0;
  let lastVpLogTime = 0;
  let lastInvalidStatusAt = -Infinity;

  const controlsRoot = controlsEl ?? null;

  // === Toolbar Button Sync (Phase 8 extraction) ===
  const toolbar: ToolbarButtonSync = createToolbarButtonSync({
    controlsRoot,
    canvas,
  });

  // Wrapper functions for backward compatibility with existing call sites
  const resolveControlsButton = (selector: string): HTMLButtonElement | null =>
    toolbar.resolveButton(selector);

  const updateAutoButton = (): void => toolbar.updateAutoButton(state.autoRotate);
  const updateProjectionButton = (): void => toolbar.updateProjectionButton(state.projectionMode);
  const updateDebugButton = (): void => toolbar.updateDebugButton(state.debugOverlay);
  const updateGridButton = (): void => toolbar.updateGridButton(state.showGrid ?? true);
  const updateAxisButton = (): void => toolbar.updateAxisButton(state.showAxis ?? true);
  const updateArcballButton = (): void => toolbar.updateArcballButton(state.cameraMode);
  const updateFreeButton = (): void => toolbar.updateFreeButton(state.cameraMode);
  const updatePivotAutoButton = (): void => toolbar.updatePivotAutoButton(state.autoPivotFromCamera ?? false);
  const updateCameraModeButtons = (): void => toolbar.updateCameraModeButtons(state.cameraMode);

  const notifyAutoRotateChange = (): void => {
    updateAutoButton();
    onAutoRotateChange?.(state.autoRotate);
  };

  // Initial button sync
  notifyAutoRotateChange();
  updateProjectionButton();
  updateDebugButton();
  updateGridButton();
  updateAxisButton();
  updateCameraModeButtons();

  // Camera state broadcasting (Phase 9 extraction)
  const cameraBroadcaster: CameraStateBroadcaster = createCameraStateBroadcaster({
    getState: () => ({
      rotX: state.rotX,
      rotY: state.rotY,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      autoRotate: state.autoRotate,
      sceneRadius: state.sceneRadius,
      projectionMode: state.projectionMode,
      cameraMode: state.cameraMode,
      pivot: state.pivot,
      cameraDirty: state.cameraDirty ?? false,
      lastCameraPush: state.lastCameraPush,
    }),
    updateState: (updates) => {
      if (updates.cameraDirty !== undefined) state.cameraDirty = updates.cameraDirty;
      if (updates.lastCameraPush !== undefined) state.lastCameraPush = updates.lastCameraPush;
    },
    getEyePosition: () => lastCameraRig?.eye ?? ensureFreePosition(state),
    emit: (msg) => emit?.(msg),
    emitDiagnostic,
    canvasId: mountCanvasId,
  });

  // Thin wrapper for backward compatibility
  const buildCameraSnapshot = (): CameraSnapshot => cameraBroadcaster.buildSnapshot();

  // Axis indicator renderer (Phase 17 extraction)
  const axisRenderer: AxisIndicatorRendererInstance = createAxisIndicatorRenderer({
    getPivot: () => state.pivot,
    getSceneRadius: () => state.sceneRadius,
    getSequence: () => cameraBroadcaster.getSequence(),
    emitDiagnostic: debugEnabled ? emitDiagnostic : undefined,
    debugThrottleMs: DEBUG_THROTTLE_MS,
  });

  // Thin wrapper delegating to axisRenderer (Phase 17 backward compatibility)
  const drawAxisIndicator = (ctx: CanvasRenderingContext2D | null, rig: CameraRig | null): void => {
    axisRenderer.draw(ctx, rig);
  };

  // snapshotsEqual replaced by cameraBroadcaster.snapshotsEqual()
  const snapshotsEqual = (prev: CameraSnapshot | null, next: CameraSnapshot): boolean =>
    cameraBroadcaster.snapshotsEqual(prev, next);

  // State tracking variables (some moved to broadcaster, some kept for local diagnostic use)
  // Note: lastAxisEmit moved to AxisIndicatorRenderer (Phase 17)
  let lastDrawEmit = 0;
  let lastUniformEmit = 0;
  let lastCameraEmit = 0;
  let lastFitEmit = 0;

  // Uniform signature tracking (moved from globalThis during P-1 as-any elimination)
  let __lastUniformSignature: string | null = null;
  let __lastUniformEmitMs = 0;

  // Thin wrapper delegating to broadcaster
  const emitCameraState = (force = false): void => cameraBroadcaster.emit(force);

  const setAutoRotate = (value: boolean, emitCamera = true): void => {
    const next = Boolean(value);
    if (state.autoRotate === next) {
      return;
    }
    state.autoRotate = next;
    if (current) {
      current.autoRotate = next;
    }
    state.cameraDirty = true;
    notifyAutoRotateChange();
    // When disabling autorotate, commit any transient display basis to the
    // persistent camera basis so snapshots reflect the current view.
    if (!next && (state.displayCamForward || state.displayCamUp || state.displayCamRight)) {
      const prevRight: Vec3 = [state.camRight[0], state.camRight[1], state.camRight[2]];
      const flipped = commitDisplayBasisToState(state);
      if (flipped) {
        try {
          const dot = vec3Dot(prevRight, state.camRight);
          emitDiagnostic('camera:commit-basis-flip', { dot, canvasId: mountCanvasId });
        } catch (err) {
          /* ignore */
        }
      }
    }
    if (emitCamera) {
      emitCameraState(true);
    }
  };

  const toggleAutoRotate = (): void => {
    setAutoRotate(!state.autoRotate, true);
  };

  const setAutoPivot = (value: boolean, emitCamera = true): void => {
    const next = Boolean(value);
    if (state.autoPivotFromCamera === next) {
      return;
    }
    state.autoPivotFromCamera = next;
    if (current) {
      current.autoPivotFromCamera = next;
    }
    // When enabling auto-pivot, immediately update the pivot to center of view
    if (next && cameraController) {
      try {
        cameraController.updatePivotFromCamera();
      } catch (e) {
        // Fall back to resetting pivot to center of object
        const pivotZ = state.pivot?.[2] ?? 0;
        state.panX = 0;
        state.panY = 0;
        state.pivot = [0, 0, pivotZ];
      }
    }
    state.cameraDirty = true;
    updatePivotAutoButton();
    if (emitCamera) {
      emitCameraState(true);
    }
  };

  const toggleAutoPivot = (): void => {
    setAutoPivot(!Boolean(state.autoPivotFromCamera), true);
  };

  // Timer state variables moved to broadcaster; keep local unrelated state
  let lastGradientSignature: string | null = null;
  let validationFrameCounter = 0;
  let lastValidGeometry: GeometrySnapshot | null = null;

  // Thin wrappers delegating to broadcaster
  const cancelCameraEmit = (): void => cameraBroadcaster.cancelScheduledEmit();
  const scheduleCameraEmit = (delay = CAMERA_BROADCAST_MS): void => cameraBroadcaster.scheduleEmit(delay);

  const initialBgMode = (initialParams as Record<string, unknown>).__pf_bg_mode;
  let currentAlphaMode: 'opaque' | 'premultiplied' = resolveAlphaMode(initialBgMode);

  // Axis overlay canvas reference (set later after axis overlay is created)
  // Forward declaration needed for ResizeManager callback
  let axisCanvas: HTMLCanvasElement | null = null;

  // ResizeManager handles all resize logic, event listeners, and mobile GPU safety
  const resizeManager: ResizeManager = createResizeManager({
    canvas,
    context,
    device,
    format,
    maxTextureDimension2D,
    onResize: (dims: DimensionResult, alphaMode: GPUCanvasAlphaMode) => {
      // Update module-level width/height
      width = dims.width;
      height = dims.height;
      lastOperation = 'resize';

      // Update canvas and reconfigure context
      canvas.width = dims.width;
      canvas.height = dims.height;
      context.configure({ device, format, alphaMode });

      // Recreate depth texture
      const newDepth = createDepthTexture(device, dims.width, dims.height);
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

      // Update state
      state.canvasAspect = dims.height > 0 ? dims.width / dims.height : 1;
      state.cameraDirty = true;
      lastCameraRig = null;

      // Update DPR if changed
      if (Math.abs(dims.dpr - devicePixelRatio) > 1e-3) {
        devicePixelRatio = dims.dpr;
      }

      // Update axis overlay size to be crisp on DPR-scaled devices
      try {
        if (axisCanvas) {
          const overlaySizeCss = 96; // CSS px
          const overlayW = Math.max(1, Math.round(overlaySizeCss * dims.dpr));
          const overlayH = overlayW;
          axisCanvas.width = overlayW;
          axisCanvas.height = overlayH;
          axisCanvas.style.width = `${overlaySizeCss}px`;
          axisCanvas.style.height = `${overlaySizeCss}px`;
        }
      } catch (err) {
        /* ignore overlay resize errors */
      }
    },
    onDprChange: (dpr: number) => {
      devicePixelRatio = dpr;
    },
    emitDiagnostic: debugEnabled ? emitDiagnostic : undefined,
    debugEnabled,
  });

  // Thin wrapper for legacy code that calls resize() directly
  const resize = (): void => resizeManager.resize();

  try {
    const parent = canvas.parentElement || document.body;
    const pre = document.createElement('pre');
    pre.id = 'wgpu-debug';
    pre.style.cssText =
      'position:absolute;right:8px;top:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,0.6);color:#9ff89f;font-family:monospace;font-size:12px;z-index:9999;max-width:360px;max-height:40vh;overflow:auto;display:none;pointer-events:none;';
    parent?.appendChild(pre);
    debugOverlayEl = pre;
  } catch (err) {
    debugOverlayEl = null;
  }

  // Axis overlay using extracted module (Phase 1 decomposition)
  let axisOverlay: AxisOverlayInstance | null = null;
  let axisCtx: CanvasRenderingContext2D | null = null;
  // Note: axisCanvas is declared earlier (forward declaration for ResizeManager callback)
  try {
    const parent = canvas.parentElement || document.body;
    axisOverlay = createAxisOverlay({ parent, size: 96 });
    axisCtx = axisOverlay.getContext();
    axisCanvas = axisOverlay.getCanvas();
  } catch (e) {
    axisOverlay = null;
    axisCtx = null;
    axisCanvas = null;
  }

  let wgsl = ShaderManager.getInstance().getWGSL();
  // Validation logic removed as ShaderManager ensures validity
  const wgslSnippet = (wgsl ?? '').slice(0, 512).replace(/\n/g, ' ');
  const hasVs = wgsl.indexOf('fn vs_main(') >= 0 || wgsl.indexOf('@vertex') >= 0;
  const hasFs = wgsl.indexOf('fn fs_main(') >= 0 || wgsl.indexOf('@fragment') >= 0;
  const hasBinding0 = wgsl.indexOf('@group(0) @binding(0)') >= 0 || wgsl.indexOf('@binding(0)') >= 0;
  const hasBinding1 = wgsl.indexOf('@group(0) @binding(1)') >= 0 || wgsl.indexOf('@binding(1)') >= 0;
  const hasBinding2 = wgsl.indexOf('@group(0) @binding(2)') >= 0 || wgsl.indexOf('@binding(2)') >= 0;
  const hasBinding3 = wgsl.indexOf('@group(0) @binding(3)') >= 0 || wgsl.indexOf('@binding(3)') >= 0;
  const hasBinding4 = wgsl.indexOf('@group(0) @binding(4)') >= 0 || wgsl.indexOf('@binding(4)') >= 0;
  // shader-sniff diagnostic is one-time, no signature needed
  emitDiagnostic('webgpu:shader-sniff', { length: (wgsl ?? '').length, hasVs, hasFs, hasBinding0, hasBinding1, hasBinding2, hasBinding3, hasBinding4, snippet: wgslSnippet, canvasId: mountCanvasId });
  if (wgsl.startsWith('[object Object]') || wgsl.includes('<!DOCTYPE') || wgsl.trim().startsWith('<html')) {
    emitDiagnostic('webgpu:shader-import-looks-like-html', { snippet: wgslSnippet, canvasId: mountCanvasId });
    console.error('[WebGPU] Shader file appears to be HTML or non-text payload; check bundler/asset pipeline', wgslSnippet);
  }
  if (/^\s*export\s+default\s+/i.test(wgsl) || wgsl.includes('module.exports')) {
    emitDiagnostic('webgpu:shader-import-looks-like-js-module', { snippet: wgslSnippet, canvasId: mountCanvasId });
    console.error('[WebGPU] Shader file appears to be a JS module export instead of raw WGSL; check bundler ?raw loader', wgslSnippet);
  }
  if (!wgsl.trim()) {
    emitDiagnostic('webgpu:shader-empty', { message: 'WGSL source empty; check bundler or pot_preview.wgsl import' });
    return fail('webgpu:pipeline-failed', 'WebGPU • pipeline creation failed: shader source empty');
  }
  if (!hasVs || !hasFs) {
    emitDiagnostic('webgpu:shader-entries-missing', { hasVs, hasFs, canvasId: mountCanvasId });
    console.error('[WebGPU] Shader missing vs_main/fs_main or entrypoints; snippet', wgslSnippet);
    // Continue and rely on shaderModule.getCompilationInfo to report errors;
    // do not early return as empty may still be non-empty but malformed.
  }
  if (!hasBinding0 || !hasBinding1 || !hasBinding2 || !hasBinding3 || !hasBinding4) {
    emitDiagnostic('webgpu:shader-bindings-missing', { hasBinding0, hasBinding1, hasBinding2, hasBinding3, hasBinding4, snippet: wgslSnippet, canvasId: mountCanvasId });
    console.error('[WebGPU] Shader missing required @binding(0..4); snippet', wgslSnippet);
  }

  // Parse WGSL to validate the preview uniform block count (array<vec4<f32>, N>) matches runtime constants
  try {
    const match = wgsl.match(/values\s*:\s*array<vec4<\s*f32\s*>,\s*(\d+)\s*>/i);
    if (match) {
      const elemCount = Number(match[1] || 0);
      if (Number.isFinite(elemCount) && elemCount > 0) {
        const floatsInWgsl = elemCount * 4;
        if (floatsInWgsl !== UNIFORM_FLOAT_COUNT) {
          emitDiagnostic('webgpu:shader-uniform-count-mismatch', { floatsInWgsl, UNIFORM_FLOAT_COUNT, elemCount, canvasId: mountCanvasId });
          console.error('[WebGPU] Uniform float count mismatch:', { floatsInWgsl, UNIFORM_FLOAT_COUNT, elemCount });
        }
      }
      // Also ensure the typed offsets used by the WGSL shader fall within UNIFORM_FLOAT_COUNT
      try {
        const offsetsToCheck = [VP_MATRIX_OFFSET + 16, CAMERA_EYE_OFFSET + 3, CAMERA_RIGHT_OFFSET + 3, CAMERA_UP_OFFSET + 3, CAMERA_FORWARD_OFFSET + 3, DRAIN_RADIUS_OFFSET + 1];
        const outOfBounds = offsetsToCheck.filter((o) => o > UNIFORM_FLOAT_COUNT);
        if (outOfBounds.length) {
          emitDiagnostic('webgpu:shader-uniform-count-mismatch', { outOfBounds, UNIFORM_FLOAT_COUNT, canvasId: mountCanvasId });
          console.error('[WebGPU] Uniform offsets exceed UNIFORM_FLOAT_COUNT', { outOfBounds, UNIFORM_FLOAT_COUNT });
        }
      } catch (e) {
        /* ignore */
      }
    }
  } catch (e) {
    /* ignore parse failures */
  }

  // Check for builtin vertex index to ensure shader is procedural
  try {
    const hasVertexBuiltin = wgsl.includes('@builtin(vertex_index)');
    if (!hasVertexBuiltin) {
      emitDiagnostic('webgpu:shader-vertex-builtin-missing', { hasVertexBuiltin, hasVs, snippet: wgslSnippet, canvasId: mountCanvasId });
      console.warn('[WebGPU] Shader does not use @builtin(vertex_index); ensure vertex inputs or set vertex buffers accordingly.');
    }
  } catch (e) {
    /* ignore */
  }
  if (import.meta.env.DEV) console.log('[WebGPU] Creating shader module...');
  const shaderModule = await createShaderModule(device, wgsl, 'potfoundry-webgpu');
  if (import.meta.env.DEV) console.log('[WebGPU] Shader module created:', shaderModule ? 'SUCCESS' : 'null');

  // Lazy Pipeline Cache Implementation
  // Lazy Pipeline Cache Implementation




  // Pipeline Promise Cache to prevent double-compilation race conditions


  const getOrCreatePipeline = async (styleId: number): Promise<GPURenderPipeline | null> => {
    // Call SceneManager to switch pipeline using the optimized per-style shader
    await sceneManager.activateStyle(styleId);
    return sceneManager.pipeline;
  };

  // Create Shared Pipeline Layout ONCE
  // This saves the driver from deducing the layout from the shader every time.
  if (import.meta.env.DEV) console.log('[WebGPU] Creating shared pipeline layout...');
  device.createBindGroupLayout({
    label: 'component:bgl-shared',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // PreviewParams
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // C1
      { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // C2
      { binding: 3, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // C3
      { binding: 4, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // StyleParams
      { binding: 5, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Bg1
      { binding: 6, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Bg2
      { binding: 7, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // Bg3
    ],
  });


  // Background Pipeline Warmup
  // Pre-compiles all style shaders so switching styles later is instant.
  const warmupPipelineCache = async () => {
    // No-op for legacy warmup
  };

  // Trigger warmup MOVED to after initial render to prioritize first frame
  // warmupPipelineCache();

  // Initialize with the requested style from config, or default to 0 if missing
  const mountConfig = (initialParams ?? {}) as MountConfig;
  if (import.meta.env.DEV) console.log('[WebGPU] mount() received style:', mountConfig.style);
  const initialStyleId = resolveStyleId(mountConfig, {});
  if (import.meta.env.DEV) console.log(`[WebGPU] Initializing pipeline for requested style ${initialStyleId}...`);

  // HYBRID APPROACH: Start warmup 2s after dispatching initial style
  // This gives initial a head start while overlapping most compilation
  // Expected: ~10s first frame, ~12s total (best of both worlds)
  setTimeout(() => warmupPipelineCache(), 2000);

  let activePipeline = await getOrCreatePipeline(initialStyleId);
  let activePipelineStyleId = initialStyleId;
  let pendingPipelineStyleId: number | null = null;

  // Keep a reference to the layout validation pipeline (variable renamed to 'pipeline' to minimize diff churn if any)
  // But strictly we use activePipeline for rendering.
  const pipeline = activePipeline;

  if (import.meta.env.DEV) console.log('[WebGPU] Default pipeline result:', activePipeline ? 'SUCCESS' : 'null');
  if (!activePipeline) {
    console.error('[WebGPU] PIPELINE CREATION FAILED - this is why mount() returns null!');
    emitErrorEvent({
      code: 'webgpu:pipeline-failed',
      message: 'WebGPU • pipeline creation failed',
      fatal: true,
    });
    return null;
  }
  emitDiagnostic('webgpu:pipeline-ready');
  if (import.meta.env.DEV) console.log('[WebGPU] Pipeline ready!');

  // Mobile GPU safety: now safe to call context.configure in resize()
  resizeManager.markInitialized();
  // Note: markInitialized() triggers initial resize automatically

  // NOTE: Warmup is now triggered 2s after dispatching initial style (line ~2919)
  // to give initial a head start while overlapping most compilation work.


  // Create wireframe pipeline with line-list topology for triangle edges
  let wireframePipeline: GPURenderPipeline | null = null;

  // NOTE: Disabling wireframe pipeline creation to prevent "Device lost" errors on some drivers.
  // The async compilation of this secondary pipeline seems to trigger a timeout/hang.
  if (false) {
    try {
      wireframePipeline = await device.createRenderPipelineAsync({
        label: 'component:pipeline-wireframe',
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs_wireframe' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_wireframe',
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
        primitive: { topology: 'line-list', cullMode: 'none' },
        depthStencil: {
          depthWriteEnabled: false, // Don't write depth so wireframe doesn't occlude
          depthCompare: 'less-equal', // Use less-equal so lines draw on top of triangles
          format: 'depth24plus',
        },
      });
      emitDiagnostic('webgpu:wireframe-pipeline-ready');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? (err as Error).message : String(err);
      console.warn('Failed to create wireframe pipeline:', errorMsg);
      // emitDiagnostic('webgpu:wireframe-pipeline-failed', { error: errorMsg });

      // CRITICAL: If failure is due to device loss, we must NOT continue.
      // Return null to trigger renderer fallback to WebGL.
      if (errorMsg.includes('Device lost') || errorMsg.includes('Instance reference no longer exists')) {
        return fail('webgpu:adapter-unavailable', 'WebGPU device lost during pipeline creation', undefined, { ...baseDiagInfo });
      }
      // Otherwise continue without wireframe - it's optional
    }
  } else {
    // console.warn('[WebGPU] Wireframe pipeline disabled for stability');
  }

  // Ensure the depth texture matches the pipeline's expected depth format
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
  } catch (err) {
    /* ignore: we'll use whatever depth exists, this is best-effort */
  }

  const uniformSize = 4 * UNIFORM_FLOAT_COUNT;

  // Bind group factory (Phase 11 extraction)
  const bindGroupFactory = createBindGroupFactory({
    device,
    uniformBuffer,
    styleParamBuffer,
    colorBuffers,
    bgBuffers,
  });

  // Thin wrappers delegating to BindGroupFactory (Phase 11 extraction)
  const createMainBindGroup = (p: GPURenderPipeline) => {
    return bindGroupFactory.createMainBindGroup(p);
  };

  const createDebugBindGroup = (p: GPURenderPipeline) => {
    return bindGroupFactory.createDebugBindGroup(p);
  };

  if (!pipeline) return null;
  let bindGroup = createMainBindGroup(pipeline);

  emitDiagnostic('webgpu:bind-group-ready', {
    layoutEntries: pipeline.getBindGroupLayout(0) ? 'ok' : 'missing',
    canvasId: mountCanvasId,
  });
  // Also log to the console for immediate dev feedback
  if (import.meta.env.DEV) console.debug('[WebGPU:diag] bind-group-ready', { layoutEntries: pipeline.getBindGroupLayout(0) });

  // Create wireframe bind group if wireframe pipeline exists
  // Note: The wireframe shader only uses bindings 0 (uniforms) and 4 (style params)
  // It does NOT use the color buffers (bindings 1, 2, 3)
  let wireframeBindGroup: GPUBindGroup | null = null;
  if (wireframePipeline) {
    try {
      wireframeBindGroup = bindGroupFactory.createWireframeBindGroup(wireframePipeline as GPURenderPipeline);
      emitDiagnostic('webgpu:wireframe-bind-group-ready');
    } catch (err) {
      console.warn('Failed to create wireframe bind group:', err);
      wireframePipeline = null; // Disable wireframe if bind group fails
    }
  }

  let current: WebGPUParams | null = null;
  // hasLocalCameraControl and localControlResetTimer now managed by PointerEventRouter
  let pointerRouter: PointerEventRouter | undefined;
  let lastCameraNonce: number | null = null;
  // Focus tween now owned by the CameraController instance

  // Pointer state is defined in camera_controller and imported.

  const pointer: PointerState = {
    active: false,
    mode: 'orbit',
    lastX: 0,
    lastY: 0,
    arcLastX: 0,
    arcLastY: 0,
    arcStartX: 0,
    arcStartY: 0,
    arcStartQuat: null as Quaternion | null,
    arcPrevQuat: null as Quaternion | null,
    arcInertiaAxis: null as Vec3 | null,
    arcInertiaSpeed: 0,
    // Touch/pinch tracking
    activeTouches: new Map(),
    pinchStartDistance: null,
    pinchStartZoom: null,
    pinchCenterX: null,
    pinchCenterY: null,
    isPinching: false,
  };

  // Instantiate controller after pointer and state are created


  // NOTE: FREE_MOVE_KEYS and freeKeyboard moved to InputManager (Phase 2 extraction)
  // This wrapper function is kept for backward compatibility with existing call sites
  const clearFreeMovementKeys = (): void => {
    inputManager.clearKeys();
  };

  // resolveActiveBasis and controller wrappers will be defined after cameraController is instantiated.

  // Cache recently-built camera rigs keyed by a compact signature to avoid
  // recomputing the rig for every frame when the inputs are unchanged.
  let lastRigSignature: string | null = null;
  let lastRigCached: CameraRig | null = null;
  const computeRigSignature = (s: WebGPUState, paddingHint?: number | null, phw?: number | null, phh?: number | null): string => {
    const rotHash = s.displayRotX != null && s.displayRotY != null ? `${s.displayRotX}_${s.displayRotY}` : `${s.rotX}_${s.rotY}`;
    const mode = s.projectionMode || 'ortho';
    const parts = [rotHash, `${s.zoom}`, `${s.panX}`, `${s.panY}`, `${mode}`, `${paddingHint}`, `${phw ?? ''}`, `${phh ?? ''}`, `${s.canvasAspect}`];
    return parts.join('|');
  };
  const getCachedRig = (s: WebGPUState, paddingHint?: number | null, phw?: number | null, phh?: number | null): CameraRig => {
    const sig = computeRigSignature(s, paddingHint, phw, phh);
    if (sig === lastRigSignature && lastRigCached) {
      // Cache hit - don't log every frame, just log when specifically debugging
      return lastRigCached;
    }
    // Rig cache miss logging disabled - too verbose
    // manager.debug('webgpu:rig-cache-miss', 'Rig cache MISS - aspect: ' + s.canvasAspect?.toFixed(3), undefined, 'rig-cache-miss');
    const rig = buildCameraRig(s, paddingHint ?? CAMERA_PADDING, phw, phh);
    try { const m = window.__pf_webgpu_mounts?.[mountCanvasId as string]?.debug?.metrics; if (m) m.rigRebuilds += 1; } catch (e) { /* ignore */ }
    lastRigSignature = sig;
    lastRigCached = rig;
    return rig;
  };


  const getMergedParams = (): WebGPUParams => {
    const merged: WebGPUParams = { ...(initialParams as WebGPUParams) };
    if (current) {
      Object.assign(merged, current);
    }
    return merged;
  };

  let lastExtentsCfgRef: WebGPUParams | null = null;
  let lastExtentsValue: { paddedHalfWidth: number; paddedHalfHeight: number; paddedMax: number; paddingHint?: number } | null = null;
  const resolveInteractionRig = () => {
    const cfg = getMergedParams();
    let extents = lastExtentsValue;
    if (lastExtentsCfgRef !== cfg || !extents) {
      extents = computeSceneExtents(cfg);
      lastExtentsCfgRef = cfg;
      lastExtentsValue = extents;
    }
    const rig = getCachedRig(state, extents.paddingHint, extents.paddedHalfWidth, extents.paddedHalfHeight);
    return { cfg, extents, rig };
  };

  const ensureInteractiveBasisLocal = ensureInteractiveBasis;

  // === InputManager (Phase 2 extraction) ===
  const inputManager = createInputManager({
    state,
    getParams: getMergedParams,
    callbacks: {
      markInteraction,
      emitCameraState,
      toggleAutoRotate,
      applyViewPreset: (s: WebGPUState, preset: ViewPreset) => applyViewPreset(s, preset),
    },
    clampNumber,
  });

  const controllerHelpers: ControllerHelpers = {
    resolveInteractionRig: resolveInteractionRig,
    ensureInteractiveBasis: ensureInteractiveBasisLocal,
    computePanFactor: computePanFactor,
    updatePivotFromPan: () => updatePivotFromPan(),
    requestCameraEmitWhenStatic: () => requestCameraEmitWhenStatic(),
    markInteraction: (shouldCancel?: boolean) => markInteraction(shouldCancel),
    worldRayFromCanvas: (rig: unknown, canvasEl: HTMLCanvasElement, x: number, y: number) => worldRayFromCanvas(rig as CameraRig, canvasEl, x, y),
    intersectRayZPlane: (ray: Ray, z: number) => intersectRayZPlane(ray, z),
    intersectRayCylinder: (ray: Ray, radius: number, minZ: number, maxZ: number) => intersectRayCylinder(ray, radius, minZ, maxZ),
    buildCameraRig: (s: WebGPUState, paddingHint: number, phw?: number | null, phh?: number | null) => getCachedRig(s, paddingHint, phw, phh),
    clampZoomValue: (v: number) => clampZoomValue(v),
    cancelCameraEmit: () => cancelCameraEmit(),
    setAutoRotate: (v: boolean, emit?: boolean) => setAutoRotate(v, emit),
    setCameraMode: (mode: CameraMode) => setCameraMode(mode),
    freeKeyboard: inputManager.getKeyboardState(),
    quaternionFromAxisAngle: (axis: Vec3, angle: number) => quaternionFromAxisAngle(axis, angle),
    multiplyQuaternions: (a: any, b: any) => multiplyQuaternions(a, b),
    invertQuaternion: (q: any) => invertQuaternion(q),
    axisAngleFromQuaternion: (q: any) => axisAngleFromQuaternion(q),
    basisFromQuaternion: (q: any) => basisFromQuaternion(q),
    cameraAxisToWorld: (basis: any, axis: Vec3) => cbCameraAxisToWorld(basis, axis),
    syncAnglesFromBasis: (basis: any) => cbSyncAnglesFromBasis(basis),
    writeUniformsImmediately: (): void => {
      try {
        state.cameraDirty = true;
        device.queue.writeBuffer(uniformBuffer, 0, f32.buffer as ArrayBuffer);
        emitDiagnostic('component:write-uniforms-immediate', { afterCommit: true });
      } catch (err) {
        console.error('[WebGPU] writeUniformsImmediately buffer write failed:', err);
      }
    },
  };

  // Instantiate controller after pointer and helpers are ready
  cameraController = new CameraController(state, pointer, canvas, controllerHelpers);
  // Propagate hostCameraAcceptPolicy from initial params (default 'grace')
  try {
    const policy = mountConfig.hostCameraAcceptPolicy;
    if (policy && cameraController && typeof cameraController.setHostCameraAcceptPolicy === 'function') {
      cameraController.setHostCameraAcceptPolicy(policy);
    }
    const graceMs = Number(mountConfig.localCameraGraceMs ?? mountConfig.hostCameraGraceMs ?? null);
    if (Number.isFinite(graceMs) && cameraController && typeof cameraController.setLocalCameraGraceMs === 'function') {
      cameraController.setLocalCameraGraceMs(graceMs);
    }
  } catch (err) {/* ignore */ }
  try {
    // Expose the controller for embedded previews that may want to reuse
    // the same logic (e.g. the standalone preview page).
    // When tests or external scripts pre-set a stub controller, do not
    // override it — this preserves test-provided spies and avoids race
    // conditions where a test stub gets replaced shortly after being set.
    if (!window.__pf_webgpu_camera_controller) {
      window.__pf_webgpu_camera_controller = cameraController;
    } else {
      try {
        // Helpful debug message for developers: don't clobber an existing controller.
        if (import.meta.env.DEV) console.debug('[WebGPU] window.__pf_webgpu_camera_controller already present — not overriding');
      } catch (e) {
        /* ignore console errors */
      }
    }
  } catch (err) {
    /* ignore attach failures */
  }

  // Assign the real implementation to the forward-declared variable
  commitDisplayBasisToState = function (state: WebGPUState): boolean {
    // console.log('[WebGPU] commitDisplayBasisToState invoked');
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.commitDisplayBasisToState();
    }
    if (!state.displayCamForward || !state.displayCamUp || !state.displayCamRight) return false;
    const prevRight = state.camRight;
    let flipped = false;
    if (prevRight && state.displayCamRight && state.cameraMode !== 'arcball') {
      // Replace heuristic flip: deterministically derive Euler angles from
      // the incoming basis and canonicalize top-view yaw if required.
      const committedBasis: CameraBasis = {
        right: [...state.displayCamRight],
        up: [...state.displayCamUp],
        forward: [...state.displayCamForward],
      } as CameraBasis;
      const { rotX: commitRotX, rotY: commitRotY } = cbSyncAnglesFromBasis(committedBasis);
      let finalizeRotX = commitRotX;
      let finalizeRotY = commitRotY;
      // Canonicalize yaw when pitch is close to ±90° (top-down or bottom-up view)
      if (Math.abs(Math.abs(finalizeRotX) - Math.PI / 2) < 1e-3) {
        // choose canonical yaw=0 for top view so orientation is deterministic
        finalizeRotY = 0;
      }
      // Recompute committed basis from canonicalized Euler to ensure coherence
      const canonical = applyCameraEulerToBasis(finalizeRotX, finalizeRotY);
      state.displayCamRight = [...canonical.right];
      state.displayCamUp = [...canonical.up];
      state.displayCamForward = [...canonical.forward];
      // If the canonicalization changed parity relative to prevRight, mark flipped
      const dot = vec3Dot(prevRight, state.displayCamRight);
      if (dot < BASIS_FLIP_DOT_THRESHOLD) flipped = true;
      // Parity alignment: ensure basis-derived overlay matches projection overlay
      try {
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
          const ov_basis_unit = overlayForAxisFromBasis(rig, {
            right: state.displayCamRight as Vec3,
            up: state.displayCamUp as Vec3,
            forward: state.displayCamForward as Vec3,
          }, testAxis, [state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0], worldScale);
          const ov_basis_len = Math.hypot(ov_basis_unit[0], ov_basis_unit[1]);
          if (ov_basis_len > 1e-9) {
            // ov_basis_unit already normalized by helper
            const dotAlign = ov_basis_unit[0] * ov_proj_unit[0] + ov_basis_unit[1] * ov_proj_unit[1];
            // console.debug('[WebGPU] parity_check pre-commit', { ov_basis_unit, ov_proj_unit, dotAlign });
            if (dotAlign < BASIS_FLIP_DOT_THRESHOLD && !state.interacting && !state.disableAutoFlip) {
              state.displayCamRight = vec3Scale(state.displayCamRight, -1);
              state.displayCamUp = vec3Scale(state.displayCamUp, -1);
              emitDiagnostic('component:display-basis-parity_flip', { dotAlign });
              // console.debug('[WebGPU] display-basis-parity_flip performed', { displayCamRight: state.displayCamRight, displayCamUp: state.displayCamUp });
              flipped = true;
            }
          }
        }
      } catch (e) {
        /* best-effort only — ignore parity alignment failures */
      }
    }
    const committedBasis: CameraBasis = {
      right: [...state.displayCamRight],
      up: [...state.displayCamUp],
      forward: [...state.displayCamForward],
    } as CameraBasis;
    // Instead of flipping on negative up, canonicalize rotational angles and
    // recompute a deterministic basis. This avoids heuristic flips and preserves
    // a consistent mapping from basis -> Euler -> basis.
    const { rotX, rotY } = cbSyncAnglesFromBasis(committedBasis);
    let finalRotX = rotX;
    let finalRotY = rotY;
    if (Math.abs(Math.abs(finalRotX) - Math.PI / 2) < 1e-3) {
      finalRotY = 0;
    }
    const canonicalBasis = applyCameraEulerToBasis(finalRotX, finalRotY);
    committedBasis.right = [...canonicalBasis.right];
    committedBasis.up = [...canonicalBasis.up];
    committedBasis.forward = [...canonicalBasis.forward];
    // Parity alignment on the final committed basis: ensure basis overlay
    // orientation matches projection overlay; flip right/up if they disagree
    try {
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
        const ov_basis_unit = overlayForAxisFromBasis(rig, committedBasis, testAxis, [state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0], worldScale);
        const ov_basis_len = Math.hypot(ov_basis_unit[0], ov_basis_unit[1]);
        if (ov_basis_len > 1e-9) {
          // ov_basis_unit already normalized by helper
          const dotAlign = ov_basis_unit[0] * ov_proj_unit[0] + ov_basis_unit[1] * ov_proj_unit[1];
          // console.debug('[WebGPU] parity_check pre-commit-final', { ov_basis_unit, ov_proj_unit, dotAlign });
          if (dotAlign < BASIS_FLIP_DOT_THRESHOLD && !state.interacting && !state.disableAutoFlip) {
            committedBasis.right = vec3Scale(committedBasis.right, -1);
            committedBasis.up = vec3Scale(committedBasis.up, -1);
            emitDiagnostic('component:committed-basis-parity_flip', { dotAlign });
            // console.debug('[WebGPU] committed-basis-parity_flip performed', { committedBasisRight: committedBasis.right, committedBasisUp: committedBasis.up });
            flipped = true;
          }
        }
      }
    } catch (e) {
      /* ignore parity alignment failures */
    }
    state.camForward = [...committedBasis.forward];
    state.camUp = [...committedBasis.up];
    state.camRight = [...committedBasis.right];
    // Keep quaternion in sync and emit a short diagnostic just like controller
    state.camQuat = quaternionFromBasis(committedBasis);
    state.recentBasisCommit = { right: [...committedBasis.right], up: [...committedBasis.up], forward: [...committedBasis.forward] };
    // Optionally update pivot from camera center if configured
    try {
      if (state.autoPivotFromCamera) {
        const rect = canvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const { rig, extents } = resolveInteractionRig();
        const ray = worldRayFromCanvas(rig, canvas, centerX, centerY);
        if (ray) {
          const pivotZ = state.pivot?.[2] ?? 0;
          const cylinderHit = intersectRayCylinder(ray, extents.paddedHalfWidth, -extents.paddedHalfHeight, extents.paddedHalfHeight) ?? null;
          const hit = cylinderHit ?? intersectRayZPlane(ray, pivotZ) ?? null;
          if (hit) {
            if (state.cameraMode !== 'free') {
              state.panX = hit[0];
              state.panY = hit[1];
              state.pivot = [hit[0], hit[1], hit[2]] as Vec3;
              state.cameraDirty = true;
            }
          }
        }
      }
    } catch (err) {
      /* ignore pivot update errors */
    }
    state.displayCamForward = null;
    state.displayCamUp = null;
    state.displayCamRight = null;
    state.displayCamQuat = null;
    state.displayRotX = null;
    state.displayRotY = null;
    // Ensure shader uniforms reflect the committed basis immediately so
    // overlay projection parity tests observe consistent state.
    try {
      state.cameraDirty = true;
      device.queue.writeBuffer(uniformBuffer, 0, f32.buffer as ArrayBuffer);
      clearUniformParityRewriteFlag(state);
      emitDiagnostic('component:uniform-write-after-commit', { immediate: true, ts: Date.now() });
    } catch (err) {
      /* best-effort: ignore write failures */
    }
    return flipped;
  }
  // resetInertia already defined higher in this scope
  function cancelFocusTween(): void {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.cancelFocusTween();
    }
    return;
  }
  function startFocusTween(targetPanX: number, targetPanY: number, targetZoom: number, hitDepth?: number): any | void {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.startFocusTween(targetPanX, targetPanY, targetZoom, hitDepth);
    }
    return;
  }
  function applyFreeLookDolly(delta: number): void {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.applyFreeLookDolly(delta);
    }
    return;
  }
  function applyFreeKeyboardInput(deltaMs: number): boolean {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.applyFreeKeyboardInput(deltaMs);
    }
    return false;
  }
  function updatePivotFromPan(): void {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.updatePivotFromPan();
    }
    const pivotZ = state.pivot?.[2] ?? 0;
    state.pivot = [state.panX, state.panY, pivotZ];
  }

  // resetInertia is defined at top and delegates to controller.

  function zoomCameraAtCursor(clientX: number, clientY: number, factor: number): void {
    if (!cameraController) return;
    return cameraController.zoomCameraAtCursor(clientX, clientY, factor);
  }

  const focusCameraAtCursor = (clientX: number, clientY: number): void => {
    if (typeof cameraController !== 'undefined' && cameraController) {
      return cameraController.focusCameraAtCursor(clientX, clientY);
    }
    const hit = (() => {
      const { rig, extents } = resolveInteractionRig();
      const ray = worldRayFromCanvas(rig, canvas, clientX, clientY);
      if (!ray) return null;
      const pivotZ = state.pivot?.[2] ?? 0;
      const cylinderHit = intersectRayCylinder(ray, extents.paddedHalfWidth, -extents.paddedHalfHeight, extents.paddedHalfHeight);
      return cylinderHit ?? intersectRayZPlane(ray, pivotZ);
    })();
    if (!hit) {
      return;
    }
    let suppressFocusCancel = false;
    if (state.cameraMode === 'free') {
      state.freePosition = [hit[0], hit[1], hit[2] + Math.max(state.sceneRadius * 0.35, 30)];
      const lookDir = vec3Normalize(vec3Subtract(hit, state.freePosition));
      const newBasis = buildCameraBasis(lookDir);
      state.displayCamRight = [...newBasis.right];
      state.displayCamUp = [...newBasis.up];
      state.displayCamForward = [...newBasis.forward];
      state.displayCamQuat = quaternionFromBasis(newBasis);
      const angles = cbSyncAnglesFromBasis(newBasis);
      state.displayRotX = angles.rotX;
      state.displayRotY = angles.rotY;
    } else {
      cancelFocusTween();
      const targetZoom = clampZoomValue(state.zoom);
      // Pass hit depth for natural framing
      startFocusTween(hit[0], hit[1], targetZoom, hit[2]);
      suppressFocusCancel = true;
    }
    state.cameraDirty = true;
    markInteraction(!suppressFocusCancel);
    requestCameraEmitWhenStatic();
  };

  const isCameraStatic = (): boolean => {
    return (
      !pointer.active &&
      !state.autoRotate &&
      Math.abs(state.inertiaRotX) <= CAMERA_STATIC_EPS &&
      Math.abs(state.inertiaRotY) <= CAMERA_STATIC_EPS &&
      Math.abs(state.inertiaPanX) <= CAMERA_STATIC_EPS &&
      Math.abs(state.inertiaPanY) <= CAMERA_STATIC_EPS &&
      (!state.inertiaArcAxis || Math.abs(state.inertiaArcSpeed) <= CAMERA_STATIC_EPS)
    );
  };

  // Thin wrapper delegating to broadcaster
  const requestCameraEmitWhenStatic = (): void => cameraBroadcaster.requestEmitWhenStatic();

  function markInteraction(shouldCancelFocus = true): void {
    pointerRouter?.setLocalControl(true);
    if (!cameraController) return;
    return cameraController.markInteraction(shouldCancelFocus);
  }

  // PointerEventRouter creation (Phase 15 extraction)
  // Create after markInteraction and other dependencies are defined
  pointerRouter = createPointerEventRouter({
    canvas,
    canvasId: mountCanvasId,
    getState: () => ({
      cameraMode: state.cameraMode,
    }),
    getCameraController: () => cameraController ?? undefined,
    markInteraction,
    applyFreeLookDolly,
    zoomCameraAtCursor,
    focusCameraAtCursor,
    scheduleCameraEmit,
    emitDiagnostic,
    debugEnabled,
    localControlResetDelay: 250,
  });

  // Camera mode management (Phase 14 extraction)
  const modeManager: CameraModeManager = createCameraModeManager({
    getState: () => ({
      cameraMode: state.cameraMode,
      useArcball: Boolean(state.useArcball),
      autoRotate: state.autoRotate,
      zoom: state.zoom,
      orbitZoom: state.orbitZoom,
      freePosition: state.freePosition,
      pivot: state.pivot,
      panX: state.panX,
      panY: state.panY,
      rotX: state.rotX,
      rotY: state.rotY,
      camRight: state.camRight,
      camUp: state.camUp,
      camForward: state.camForward,
      camQuat: state.camQuat,
      displayCamRight: state.displayCamRight,
      displayCamUp: state.displayCamUp,
      displayCamForward: state.displayCamForward,
      displayCamQuat: state.displayCamQuat,
      displayRotX: state.displayRotX,
      displayRotY: state.displayRotY,
      cameraDirty: state.cameraDirty ?? false,
      autoRotateResumeAt: state.autoRotateResumeAt,
      inertiaVx: state.inertiaVx as number | undefined,
      inertiaVy: state.inertiaVy as number | undefined,
      inertiaDecay: state.inertiaDecay as number | undefined,
      inertiaActive: Boolean(state.inertiaActive),
    }),
    updateState: (updates) => {
      if (updates.cameraMode !== undefined) state.cameraMode = updates.cameraMode;
      if (updates.useArcball !== undefined) state.useArcball = updates.useArcball;
      if (updates.autoRotate !== undefined) state.autoRotate = updates.autoRotate;
      if (updates.zoom !== undefined) state.zoom = updates.zoom;
      if (updates.orbitZoom !== undefined) state.orbitZoom = updates.orbitZoom;
      if (updates.freePosition !== undefined) state.freePosition = updates.freePosition;
      if (updates.pivot !== undefined && updates.pivot !== null) state.pivot = updates.pivot;
      if (updates.panX !== undefined) state.panX = updates.panX;
      if (updates.panY !== undefined) state.panY = updates.panY;
      if (updates.rotX !== undefined) state.rotX = updates.rotX;
      if (updates.rotY !== undefined) state.rotY = updates.rotY;
      if (updates.camRight !== undefined) state.camRight = updates.camRight;
      if (updates.camUp !== undefined) state.camUp = updates.camUp;
      if (updates.camForward !== undefined) state.camForward = updates.camForward;
      if (updates.camQuat !== undefined) state.camQuat = updates.camQuat;
      if (updates.displayCamRight !== undefined) state.displayCamRight = updates.displayCamRight;
      if (updates.displayCamUp !== undefined) state.displayCamUp = updates.displayCamUp;
      if (updates.displayCamForward !== undefined) state.displayCamForward = updates.displayCamForward;
      if (updates.displayCamQuat !== undefined) state.displayCamQuat = updates.displayCamQuat;
      if (updates.displayRotX !== undefined) state.displayRotX = updates.displayRotX;
      if (updates.displayRotY !== undefined) state.displayRotY = updates.displayRotY;
      if (updates.cameraDirty !== undefined) state.cameraDirty = updates.cameraDirty;
      if (updates.autoRotateResumeAt !== undefined) state.autoRotateResumeAt = updates.autoRotateResumeAt;
      if (updates.inertiaVx !== undefined) state.inertiaVx = updates.inertiaVx;
      if (updates.inertiaVy !== undefined) state.inertiaVy = updates.inertiaVy;
      if (updates.inertiaDecay !== undefined) state.inertiaDecay = updates.inertiaDecay;
      if (updates.inertiaActive !== undefined) state.inertiaActive = updates.inertiaActive;
    },
    cancelFocusTween: () => cancelFocusTween(),
    resolveInteractionRig: () => {
      const { rig, extents } = resolveInteractionRig();
      return { eye: rig.eye, extents: { paddedMax: extents.paddedMax } };
    },
    resolveActiveBasis: () => resolveActiveBasis(state),
    ensureFreePosition: () => ensureFreePosition(state),
    intersectRayZPlane: (ray, pivotZ) => intersectRayZPlane(ray, pivotZ),
    updatePivotFromPan: () => updatePivotFromPan(),
    clearFreeMovementKeys: () => clearFreeMovementKeys(),
    setAutoRotate: (value, emit) => setAutoRotate(value, emit),
    updateCameraModeButtons: () => updateCameraModeButtons(),
    requestCameraEmitWhenStatic: () => requestCameraEmitWhenStatic(),
  });

  // Thin wrapper delegating to modeManager
  const setCameraMode = (nextMode: CameraMode): void => modeManager.setCameraMode(nextMode);

  const applyCameraPayload = (payload: WebGPUParams | null | undefined, force: boolean): void => {
    // Delegate to CameraController when available. This centralizes payload
    // logic so both preview and component behave consistently.
    if (typeof cameraController !== 'undefined' && cameraController) {
      // update debug mount before delegating
      try {
        const dbg = mountCanvasId ? window.__pf_webgpu_mounts?.[mountCanvasId]?.debug : undefined;
        if (dbg && payload) dbg.lastApplyCameraPayload = { fields: Object.keys(payload as WebGPUParams), timestamp: Date.now() };
      } catch (err) {/* ignore */ }
      cameraController.setPayload(payload, { force });
      return;
    }
    if (!payload) {
      return;
    }
    const allowCamera = force || !pointerRouter?.hasLocalControl();
    // Avoid applying unchanged camera payloads unless forced.
    try {
      if (!force && sharedCameraPayloadDiffers) {
        const differs = sharedCameraPayloadDiffers(state, payload);
        if (!differs) return;
      }
    } catch (err) {
      /* ignore */
    }
    try {
      const dbg = mountCanvasId ? window.__pf_webgpu_mounts?.[mountCanvasId]?.debug : undefined;
      if (dbg && payload) dbg.lastApplyCameraPayload = { fields: Object.keys(payload as WebGPUParams), timestamp: Date.now() };
    } catch (err) {
      /* ignore */
    }
    let cameraMutated = false;
    if (allowCamera) {
      if (typeof payload.rotX === 'number') {
        state.rotX = wrapAngle(payload.rotX);
        cameraMutated = true;
      }
      if (typeof payload.rotY === 'number') {
        state.rotY = wrapAngle(payload.rotY);
        cameraMutated = true;
      }
      if (isCameraMode(payload.cameraMode)) {
        if (payload.cameraMode !== state.cameraMode) {
          setCameraMode(payload.cameraMode);
          cameraMutated = true;
        }
      } else if (typeof payload.useArcball === 'boolean') {
        const targetOrbitMode: CameraMode = payload.useArcball ? 'arcball' : 'turntable';
        if (targetOrbitMode !== state.cameraMode) {
          setCameraMode(targetOrbitMode);
          cameraMutated = true;
        }
      }
      if (typeof payload.zoom === 'number') {
        state.zoom = payload.zoom;
        cameraMutated = true;
      }
      if (typeof payload.panX === 'number') {
        state.panX = payload.panX;
        cameraMutated = true;
      }
      if (typeof payload.panY === 'number') {
        state.panY = payload.panY;
        cameraMutated = true;
      }
      if (typeof payload.autoPivotFromCamera === 'boolean') {
        state.autoPivotFromCamera = Boolean(payload.autoPivotFromCamera);
        cameraMutated = true;
      }
      if (Array.isArray(payload.freePosition) && payload.freePosition.length >= 3) {
        const [fx, fy, fz] = payload.freePosition as number[];
        if ([fx, fy, fz].every((v) => Number.isFinite(v))) {
          state.freePosition = [fx, fy, fz];
          cameraMutated = true;
        }
      }
      if (typeof payload.freeSpeed === 'number' && Number.isFinite(payload.freeSpeed)) {
        state.freeSpeed = Math.max(0.1, payload.freeSpeed);
      }
      if (typeof payload.projection === 'string') {
        const nextMode = payload.projection === 'perspective' ? 'perspective' : 'ortho';
        if (state.projectionMode !== nextMode) {
          // Synchronize zoom between ortho and perspective so toggling keeps a similar
          // on-screen size for the pot. We reuse the same mapping as the click handler.
          try {
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
            const aspect = Math.max(state.canvasAspect || 1, 1e-3);
            const currentRig = getCachedRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
            if (state.projectionMode === 'perspective' && nextMode === 'ortho') {
              const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
              const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
              const targetVec: Vec3 = [state.panX, state.panY, state.pivot?.[2] ?? 0];
              const distance = vec3Length(vec3Subtract(currentRig.eye, targetVec));
              const halfHeightPers = distance * Math.tan(halfFovY);
              const halfWidthPers = distance * Math.tan(halfFovX);
              // Determine limiting axis (true if height is the limiting axis)
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
              if (debugEnabled) {
                console.debug('[WebGPU] projection click mapping (persp -> ortho)', {
                  paddedHalfWidth,
                  paddedHalfHeight,
                  aspect,
                  halfFovY,
                  halfFovX,
                  distance,
                  halfHeightPers,
                  halfWidthPers,
                  isHeightLimiting,
                });
                try {
                  emitDiagnostic('proj-toggle:persp->ortho', {
                    paddedHalfWidth,
                    paddedHalfHeight,
                    aspect,
                    halfFovY,
                    halfFovX,
                    distance,
                    halfHeightPers,
                    halfWidthPers,
                    isHeightLimiting,
                    zoom: state.zoom,
                  });
                } catch (err) {
                  /* ignore */
                }

              }
            } else if (state.projectionMode === 'ortho' && nextMode === 'perspective') {
              const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
              const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
              const halfHeightOrtho = paddedHalfHeight / Math.max(state.zoom, 1e-3);
              const halfWidthOrtho = paddedHalfWidth / Math.max(state.zoom, 1e-3);
              const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
              const desiredDistance = isHeightLimiting
                ? halfHeightOrtho / Math.max(Math.tan(halfFovY), 1e-6)
                : halfWidthOrtho / Math.max(Math.tan(halfFovX), 1e-6);
              // Compute base distance using the perspective per-axis fit so mapping matches real distance
              const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
              const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
              const baseDistanceForMapping = Math.max(dV, dH) * CAMERA_DISTANCE_FALLOFF;
              let newZoom = Math.max(1e-3, baseDistanceForMapping / Math.max(desiredDistance, 1e-6));
              // Apply iterative axis-aware correction by simulating the perspective rig
              try {
                const prevProj = state.projectionMode;
                const prevZoom = state.zoom;
                const maxIter = 6;
                for (let it = 0; it < maxIter; it += 1) {
                  state.projectionMode = 'perspective';
                  state.zoom = newZoom;
                  const rigCheck = getCachedRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
                  const target: Vec3 = [state.panX, state.panY, state.pivot?.[2] ?? 0];
                  const actualHalfHeight = vec3Length(vec3Subtract(rigCheck.eye, target)) * Math.tan(halfFovY);
                  const actualHalfWidth = vec3Length(vec3Subtract(rigCheck.eye, target)) * Math.tan(halfFovX);
                  const axisValue = isHeightLimiting ? actualHalfHeight : actualHalfWidth;
                  const desiredAxis = isHeightLimiting ? halfHeightOrtho : halfWidthOrtho;
                  if (axisValue <= 1e-6) break;
                  const correction = Math.max(1e-6, desiredAxis / axisValue);
                  if (Math.abs(1.0 - correction) < 1e-3) break;
                  newZoom = newZoom * correction;
                }
                state.zoom = prevZoom;
                state.projectionMode = prevProj;
              } catch (err) {
                /* ignore */
              }
              state.zoom = Math.min(4.0, Math.max(0.25, newZoom));
              if (debugEnabled) {
                console.debug('[WebGPU] projection click mapping (ortho -> persp)', {
                  paddedHalfWidth,
                  paddedHalfHeight,
                  aspect,
                  halfFovY,
                  halfFovX,
                  halfHeightOrtho,
                  halfWidthOrtho,
                  dV,
                  dH,
                  baseDistanceForMapping,
                  desiredDistance,
                });
                try {
                  emitDiagnostic('proj-toggle:ortho->persp', {
                    paddedHalfWidth,
                    paddedHalfHeight,
                    aspect,
                    halfFovY,
                    halfFovX,
                    halfHeightOrtho,
                    halfWidthOrtho,
                    dV,
                    dH,
                    baseDistanceForMapping,
                    desiredDistance,
                    zoom: state.zoom,
                  });
                } catch (err) {
                  /* ignore */
                }

              }
            }
          } catch (err) {
            /* ignore mapping errors */
          }
          state.projectionMode = nextMode;
          cameraMutated = true;
          updateProjectionButton();
        }
      }
      if (typeof payload.useArcball === 'boolean') {
        const targetOrbitMode: CameraMode = payload.useArcball ? 'arcball' : 'turntable';
        if (targetOrbitMode !== state.cameraMode) {
          setCameraMode(targetOrbitMode);
          cameraMutated = true;
        }
      }
    }
    if (cameraMutated) {
      // Emit any recent inertia diagnostics provided by CameraController
      try {
        const rev = state.recentInertia;
        if (rev) {
          emitDiagnostic('component:inertia', rev);
          try { state.recentInertia = undefined; } catch (e) {/* best-effort */ }
        }
      } catch (e) {
        /* ignore diag failures */
      }
      // Ensure the committed camera basis matches new Euler angles and
      // initialize the transient display basis to the same orientation.
      applyCameraEuler(state, state.rotX, state.rotY);
      state.displayCamRight = [...state.camRight];
      state.displayCamUp = [...state.camUp];
      state.displayCamForward = [...state.camForward];
      state.displayCamQuat = [...state.camQuat] as Quaternion;
      state.displayRotX = state.rotX;
      state.displayRotY = state.rotY;
      updatePivotFromPan();
      resetInertia(state);
      state.cameraDirty = true;
    }
    if (typeof payload.autoRotate === 'boolean') {
      setAutoRotate(payload.autoRotate, false);
    }
    if (typeof payload.autoPivotFromCamera === 'boolean') {
      state.autoPivotFromCamera = Boolean(payload.autoPivotFromCamera);
      state.cameraDirty = true;
      try {
        updatePivotAutoButton();
      } catch (err) { /* ignore */ }
    }
    if (force) {
      pointerRouter?.setLocalControl(false);
    }
  };

  // Camera command router (Phase 18 extraction)
  const commandRouter: CameraCommandRouterInstance = createCameraCommandRouter({
    onEmitState: () => emitCameraState(true),
    onViewPreset: (preset: string) => applyViewPreset(state, preset),
    onCameraPayload: (patch, force) => applyCameraPayload(patch as WebGPUParams, force),
    onAutoRotate: (value: boolean) => setAutoRotate(value, false),
    onProjection: (mode: 'perspective' | 'ortho') => {
      if (state.projectionMode !== mode) {
        state.projectionMode = mode;
        updateProjectionButton();
      }
    },
    onCameraMode: (mode) => setCameraMode(mode as CameraMode),
    onGridToggle: () => {
      state.showGrid = !state.showGrid;
      updateGridButton();
      state.cameraDirty = true;
    },
    onAxisToggle: () => {
      state.showAxis = !state.showAxis;
      updateAxisButton();
      state.cameraDirty = true;
    },
    onMarkInteraction: () => markInteraction(),
    emitDiagnostic,
  });

  // Thin wrapper delegating to commandRouter (Phase 18 backward compatibility)
  const handleCameraCommand = (raw: unknown): void => {
    commandRouter.handleCommand(raw);
  };


  const preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };
  canvas.addEventListener('contextmenu', preventContextMenu);

  // Pointer, wheel, touch, and double-click event handlers now managed by PointerEventRouter (Phase 15)
  // Attach listeners after all dependencies are available
  pointerRouter.attach();

  // Controls click handler action callbacks (Phase 16)
  const handleViewPreset = (preset: string): void => {
    cancelFocusTween();
    applyViewPreset(state, preset);
    if (preset === 'fit') {
      try {
        const cfg = { ...initialParams, ...current } as WebGPUParams;
        const height = clampNumber(cfg.H, 120.0);
        const radiusTop = clampNumber(cfg.Rt, 70.0);
        const radiusBottom = clampNumber(cfg.Rb, 45.0);
        const safeHeight = Math.max(Math.abs(height), 1);
        const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
        const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);
        const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
        state.sceneRadius = computedMaxWithHeight;
        state.cameraDirty = true;
      } catch (err) {
        /* ignore */
      }
    }
    markInteraction();
    emitCameraState(true);
  };

  const handleProjectionToggle = (): void => {
    // Compute padded extents to compute a stable visual mapping between
    // perspective and orthographic modes so the pot remains similar on screen
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
    const oldMode = state.projectionMode;
    const currentRig = getCachedRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
    const nextMode = oldMode === 'ortho' ? 'perspective' : 'ortho';
    if (oldMode === 'perspective' && nextMode === 'ortho') {
      // Convert perspective -> ortho: keep similar screen size based on limiting axis
      const aspect = Math.max(state.canvasAspect || 1, 1e-3);
      const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
      const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
      const targetVec: Vec3 = [state.panX, state.panY, state.pivot?.[2] ?? 0];
      const distance = vec3Length(vec3Subtract(currentRig.eye, targetVec));
      const halfHeightPers = distance * Math.tan(halfFovY);
      const halfWidthPers = distance * Math.tan(halfFovX);
      const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
      if (isHeightLimiting) {
        if (halfHeightPers > 1e-6) {
          const newZoom = Math.max(1e-3, paddedHalfHeight / halfHeightPers);
          state.zoom = newZoom;
        }
      } else {
        if (halfWidthPers > 1e-6) {
          const newZoom = Math.max(1e-3, paddedHalfWidth / halfWidthPers);
          state.zoom = newZoom;
        }
      }
    } else {
      // Convert ortho -> perspective: pick zoom so perspective fits same limiting axis
      const aspect = Math.max(state.canvasAspect || 1, 1e-3);
      const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
      const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
      const halfHeightOrtho = paddedHalfHeight / Math.max(state.zoom, 1e-3);
      const halfWidthOrtho = paddedHalfWidth / Math.max(state.zoom, 1e-3);
      const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
      const desiredDistance = isHeightLimiting
        ? halfHeightOrtho / Math.max(Math.tan(halfFovY), 1e-6)
        : halfWidthOrtho / Math.max(Math.tan(halfFovX), 1e-6);
      // Compute per-axis distances and base distance similar to the perspective rig
      const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
      const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
      const baseDistanceForMapping = Math.max(dV, dH) * CAMERA_DISTANCE_FALLOFF;
      let newZoom = Math.max(1e-3, baseDistanceForMapping / Math.max(desiredDistance, 1e-6));
      // Apply correction by simulating perspective and checking the resulting half-height
      try {
        const prevProj = state.projectionMode;
        const prevZoom = state.zoom;
        const maxIter = 6;
        for (let it = 0; it < maxIter; it += 1) {
          state.projectionMode = 'perspective';
          state.zoom = newZoom;
          const rigCheck = getCachedRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
          const targetVec: Vec3 = [state.panX, state.panY, state.pivot?.[2] ?? 0];
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
    }
    state.projectionMode = nextMode;
    updateProjectionButton();
    state.cameraDirty = true;
    markInteraction();
    emitCameraState(true);
  };

  const handleDebugToggle = (): void => {
    state.debugOverlay = !state.debugOverlay;
    updateDebugButton();
  };

  const handleArcballToggle = (): void => {
    const targetMode: CameraMode = state.cameraMode === 'arcball' ? 'turntable' : 'arcball';
    setCameraMode(targetMode);
    markInteraction();
    emitCameraState(true);
  };

  const handleFlyToggle = (): void => {
    const fallbackOrbit: CameraMode = state.useArcball ? 'arcball' : 'turntable';
    const targetMode: CameraMode = state.cameraMode === 'free' ? fallbackOrbit : 'free';
    setCameraMode(targetMode);
    markInteraction();
    emitCameraState(true);
  };

  const handleGridToggle = (): void => {
    state.showGrid = !state.showGrid;
    updateGridButton();
    // grid is a visual aid, mark cameraDirty so uniforms are re-written
    state.cameraDirty = true;
  };

  const handleAxisToggle = (): void => {
    state.showAxis = !state.showAxis;
    updateAxisButton();
    // axis is a visual aid, mark cameraDirty so overlay is updated
    state.cameraDirty = true;
  };

  const handleAutoPivotToggle = (): void => {
    toggleAutoPivot();
    markInteraction();
    emitCameraState(true);
  };

  const handleAutoRotateToggle = (): void => {
    toggleAutoRotate();
    markInteraction();
    emitCameraState(true);
  };

  // Controls click handler (Phase 16 extraction)
  const controlsHandler: ControlsClickHandler = createControlsClickHandler({
    controlsRoot,
    canvasId: mountCanvasId,
    getCameraMode: () => state.cameraMode,
    getUseArcball: () => Boolean(state.useArcball),
    onViewPreset: handleViewPreset,
    onProjectionToggle: handleProjectionToggle,
    onDebugToggle: handleDebugToggle,
    onArcballToggle: handleArcballToggle,
    onFlyToggle: handleFlyToggle,
    onGridToggle: handleGridToggle,
    onAxisToggle: handleAxisToggle,
    onAutoPivotToggle: handleAutoPivotToggle,
    onAutoRotateToggle: handleAutoRotateToggle,
    emitDiagnostic,
    debugEnabled,
  });
  controlsHandler.attach();

  // NOTE: Keyboard handlers (handleKeydown, handleKeyup, handleWindowBlur) moved to InputManager
  // (Phase 2 extraction). InputManager is instantiated earlier and manages its own event listeners.

  // Create uniform block instance using the new consolidated module
  const uniformBlock = createUniformBlock(uniformSize);
  // Typed alias for backward compatibility with existing f32[N] writes
  const f32 = uniformBlock.buffer;
  let frameCounter = 0;
  let totalDrawnVerts = 0;
  let totalDrawCalls = 0;

  let lastBgSignature: string | null = null;

  const updateAndDraw = (payload?: WebGPUParams): void => {
    lastOperation = 'draw';
    if (disposed) {
      return;
    }
    try {
      if (!pipeline) {
        return;
      }
      const hadPayload = Boolean(payload);
      if (payload) {
        current = mergeParams(current, payload);
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
      if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS && !(cameraController && cameraController.focusTween)) {
        state.interacting = false;
        // If the CameraController has a pending forced payload, ask it to
        // apply it now that local interaction has finished and the grace
        // window has passed.
        if (typeof cameraController !== 'undefined' && cameraController) {
          cameraController.maybeApplyDeferredForceIfReady(now);
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

      // Compute camera force only from incoming payload to avoid merged
      // defaults causing repeated forced camera updates.
      const rawCameraNonce = payload && typeof (payload as Record<string, unknown>).cameraNonce === 'number'
        ? ((payload as Record<string, unknown>).cameraNonce as number)
        : null;
      const forceCamera = rawCameraNonce !== null && rawCameraNonce !== lastCameraNonce;
      if (forceCamera) {
        lastCameraNonce = rawCameraNonce;
      }

      // Only apply camera patches derived from the raw incoming payload to avoid
      // re-applying host defaults merged into `cfg` each frame.
      if (payload) {
        const p = payload as Record<string, unknown>;
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
        if (patchApplied) {
          const isForce = Boolean(p.force) || forceCamera || false;
          applyCameraPayload(patch, isForce);
        }
      }

      // Resolve drain radius and style id from `cfg`/`current` for local state updates
      const height = clampNumber(cfg.H, 120.0);
      const radiusTop = clampNumber(cfg.Rt ?? cfg.Rt, 70.0);
      const radiusBottom = clampNumber(cfg.Rb ?? cfg.Rb, 45.0);

      const drainRadiusRaw =
        cfg.r_drain ?? cfg.drain ?? cfg.drainRadius ?? (cfg as Record<string, unknown>)?.drain_radius ?? current.r_drain;
      const drainRadius = clampNumber(drainRadiusRaw, 10.0);

      const safeHeight = Math.max(Math.abs(height), 1);
      const safeRadiusTop = Math.max(Math.abs(radiusTop), 1);
      const safeRadiusBottom = Math.max(Math.abs(radiusBottom), 1);

      // Use shared resolveStyleId for consistent style resolution
      const cfgMounted = cfg as MountConfig;
      const styleId = resolveStyleId(cfg, current);

      // Debug: Trace Voronoi Style Resolution (disabled — fires every frame)
      // if (import.meta.env.DEV && (styleId === 13 || cfgMounted.style === 'Voronoi')) {
      //   console.log(`[WebGPU Debug] StyleRes: resolved=${styleId} cfg.style=${cfgMounted.style} inConfig=${cfgMounted.styleId}`);
      // }

      // Populate uniform buffer using UniformBlock (handles geometry, twist, style, seam)
      try {
        uniformBlock.populateGeometry(cfg, current);

        // Debug: Verify buffer content (disabled — fires every frame)
        // if (import.meta.env.DEV && styleId === 13) {
        //   console.log(`[WebGPU Debug] Buffer[7] (StyleID): ${f32[7]}`);
        // }
      } catch (err) {
        console.error('[WebGPU] populateGeometry failed:', err);
        emitDiagnostic('webgpu:fill-geometry-failed', { error: String(err) });
      }

      // Update local tracking state
      current.r_drain = drainRadius;
      current.styleId = styleId;



      bufferWriter.syncStyleParams(styleParamBuffer, cfg.styleParams ?? current.styleParams);
      current.styleParams = cfg.styleParams;

      const computedMaxWithHeight = Math.max(safeHeight, safeRadiusTop, safeRadiusBottom);
      const sceneRadiusProvided = cfg.sceneRadius !== undefined && cfg.sceneRadius !== null;
      if (sceneRadiusProvided) {
        const sceneRadiusHint = clampNumber(cfg.sceneRadius, computedMaxWithHeight);
        const nextSceneRadius = Math.max(Math.abs(sceneRadiusHint), computedMaxWithHeight, 1);
        if (Math.abs(nextSceneRadius - state.sceneRadius) > CAMERA_EPSILON) {
          state.sceneRadius = nextSceneRadius;
          state.cameraDirty = true;
        }
      }
      const rawPadding =
        typeof cfg.scenePadding === 'number'
          ? clampNumber(cfg.scenePadding, CAMERA_PADDING)
          : typeof current.scenePadding === 'number'
            ? clampNumber(Number(current.scenePadding), CAMERA_PADDING)
            : CAMERA_PADDING;
      const paddingHint = sanitizePadding(rawPadding);
      // compute per-axis half-extents in world coordinates
      const halfHeight = Math.max(safeHeight * 0.5, 1);
      const outerRadius = Math.max(safeRadiusTop, safeRadiusBottom);
      const halfWidth = Math.max(outerRadius, 1);
      const paddedHalfWidth = Math.max(1, halfWidth * paddingHint);
      const paddedHalfHeight = Math.max(1, halfHeight * paddingHint);
      const cameraRig = getCachedRig(state, paddingHint, paddedHalfWidth, paddedHalfHeight);
      if (cameraRig && cameraRig.basis) {
        if (state.cameraMode !== 'arcball' && (cameraRig.basis.up[2] ?? 0) < 0) {
          emitDiagnostic('webgpu:camera-up-negative', { up: cameraRig.basis.up, eye: cameraRig.eye, canvasId: mountCanvasId });
          if (import.meta.env.DEV) console.debug('[WebGPU] camera up negative — flipping roll', { up: cameraRig.basis.up, eye: cameraRig.eye });
          // Flip roll: negate right/up so the camera appears upright while
          // preserving forward direction. This avoids upside-down render when
          // the computed basis ends up reversed due to Euler ambiguities.
          cameraRig.basis.right = [-cameraRig.basis.right[0], -cameraRig.basis.right[1], -cameraRig.basis.right[2]];
          cameraRig.basis.up = [-cameraRig.basis.up[0], -cameraRig.basis.up[1], -cameraRig.basis.up[2]];
          // Recompute the viewProjection so it matches the flipped basis. If
          // we don't recompute the projection the shader will render with the
          // old matrix while overlays use the flipped basis, producing a
          // visually upside-down mesh despite the overlay showing the camera
          // correctly oriented.
          try {
            const aspect = state.canvasAspect || 1;
            let projection: Float32Array | null = null;
            if (cameraRig.mode === 'perspective') {
              projection = mat4PerspectiveFovLH(cameraRig.fov, aspect, cameraRig.near, cameraRig.far);
            } else {
              const orthoHalfHeight = Math.max(paddedHalfHeight, paddedHalfWidth / aspect);
              const orthoHalfWidth = orthoHalfHeight * aspect;
              projection = mat4OrthoLH(-orthoHalfWidth, orthoHalfWidth, -orthoHalfHeight, orthoHalfHeight, cameraRig.near, cameraRig.far);
            }
            const view = viewMatrixFromBasis(cameraRig.basis, cameraRig.eye);
            cameraRig.viewProjection = mat4Multiply(projection, view);
            markUniformParityRewriteNeeded(state);
          } catch (err) {
            /* ignore; keep existing viewProjection */
          }
        }
      }
      const debugActive = Boolean(cfg.debug) || state.debugOverlay;



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

      const nTheta = Math.min(1024, Math.max(MIN_THETA_STATIC, baseNTheta));
      const nZ = Math.min(1024, Math.max(MIN_Z_STATIC, baseNZ));

      const innerSeg = Math.max(1, baseInner);
      const bottomRings = Math.max(2, Math.min(24, baseBottom));
      const rimRings = Math.max(1, Math.min(8, baseRim));

      // Resolution params (nTheta, nZ, debugFlag)
      uniformBlock.populateResolution(cfg, state, debugActive);

      // Topology params (innerSegments, bottomRings, rimRings)
      uniformBlock.populateTopology(cfg, nZ);

      // Lighting params (ambient, diffuse, fresnel, t_wall, t_bottom, specular, roughness)
      uniformBlock.populateLighting(cfg);

      // Feature flags (showGrid, showInner)
      uniformBlock.populateFeatureFlags(cfg, state);

      // Camera params (rotation, zoom, pan, eye, basis, viewProjection matrix)
      uniformBlock.populateCamera(state, cameraRig, paddingHint);

      // Sanity check: ensure the viewProjection matrix and camera eye are finite.
      const isFiniteMat = (m: Float32Array) => {
        for (let i = 0; i < 16; i += 1) {
          if (!Number.isFinite(m[i])) return false;
        }
        return true;
      };

      const isFiniteVec3 = (v: Vec3) => Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);

      // If the viewProjection contains non-finite values (common when rotX is near +/-90deg),
      // gently nudge the pitch (rotX) away from the singularity and rebuild the camera rig.
      if (!isFiniteMat(cameraRig.viewProjection) || !isFiniteVec3(cameraRig.eye)) {
        emitDiagnostic('webgpu:invalid-vp-matrix', {
          reason: 'vp-or-eye-nonfinite',
          rotX: state.rotX,
          rotY: state.rotY,
          eye: cameraRig.eye,
          canvasId: mountCanvasId,
        });

        // Nudge rotX slightly away from exact vertical to avoid cosPitch->0 issues.
        const SIGN = Math.sign(state.rotX) || 1;
        const EPS = 1e-3;
        state.rotX = wrapAngle(state.rotX - SIGN * EPS);

        // Rebuild camera rig after nudging
        const rebuilt = getCachedRig(state, paddingHint);
        if (isFiniteMat(rebuilt.viewProjection) && isFiniteVec3(rebuilt.eye)) {
          for (let i = 0; i < 16; i += 1) {
            f32[VP_MATRIX_OFFSET + i] = rebuilt.viewProjection[i];
          }
          f32[CAMERA_EYE_OFFSET + 0] = rebuilt.eye[0];
          f32[CAMERA_EYE_OFFSET + 1] = rebuilt.eye[1];
          f32[CAMERA_EYE_OFFSET + 2] = rebuilt.eye[2];
          // refresh cameraRig for subsequent logic
          cameraRig.viewProjection = rebuilt.viewProjection;
          cameraRig.eye = rebuilt.eye;
        } else {
          // If still invalid, mark for fallback drawing below.
          emitDiagnostic('webgpu:invalid-vp-after-nudge', { rotX: state.rotX, canvasId: mountCanvasId });
        }
      }

      if (debugActive) {
        if (now - lastDebugOverlayUpdate >= DEBUG_THROTTLE_MS) {
          lastDebugOverlayUpdate = now;

          // If debug is active, emit lookAt basis diagnostics so we can inspect
          // whether axes are degenerating near vertical camera orientations.
          if (lastLookAtBasis) {
            emitDiagnostic('webgpu:lookat-basis', {
              basis: lastLookAtBasis,
              rotX: state.rotX,
              rotY: state.rotY,
              eye: cameraRig.eye,
              canvasId: mountCanvasId,
            });
            // Also emit VP column norms so we can detect if projection is collapsing X/Y
            try {
              const colNorms: number[] = [];
              for (let c = 0; c < 3; c += 1) {
                let s = 0;
                for (let r = 0; r < 4; r += 1) {
                  const v = Number(f32[VP_MATRIX_OFFSET + c * 4 + r] ?? 0);
                  s += v * v;
                }
                colNorms.push(Math.sqrt(s));
              }
              emitDiagnostic('webgpu:vp-columns', { norms: colNorms, canvasId: mountCanvasId });
            } catch (err) {
              /* ignore */
            }
          }
          // Emit camera fit diagnostics with per-axis distances
          try {
            const halfFovY = cameraRig.fov * 0.5;
            const halfFovX = Math.atan(Math.tan(halfFovY) * (state.canvasAspect || 1));
            const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
            const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
            emitDiagnostic('webgpu:camera-fit', {
              halfWidth: paddedHalfWidth,
              halfHeight: paddedHalfHeight,
              dV,
              dH,
              chosenDistance: vec3Length(cameraRig.eye),
              fov: cameraRig.fov,
              aspect: state.canvasAspect,
              near: cameraRig.near,
              far: cameraRig.far,
              canvasId: mountCanvasId,
            });
          } catch (err) {
            /* ignore */
          }
          // Emit NDC extents of bounding box corners so we can confirm fit
          try {
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
            if (performance.now() - lastFitEmit >= 1000) {
              lastFitEmit = performance.now();
              emitDiagnostic('webgpu:camera-fit-ndc', { ndc: { minX, maxX, minY, maxY }, canvasId: mountCanvasId });
            }
          } catch (err) {
            /* ignore */
          }
          const debugPayload = {
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
              eye: cameraRig.eye.map((v: number) => Number(v.toFixed(2))),
            },
          } as const;
          try {
            emitDiagnostic('debug-state', { snapshot: debugPayload, canvasId });
          } catch (err) {
            /* ignore */
          }
          if (debugOverlayEl) {
            try {
              debugOverlayEl.style.display = 'block';
              debugOverlayEl.textContent = JSON.stringify(debugPayload, null, 2);
            } catch (err) {
              /* ignore DOM issues */
            }
          }
        }
        if (now - lastVpLogTime >= DEBUG_THROTTLE_MS) {
          lastVpLogTime = now;
          if (import.meta.env.DEV) {
            try {
              const vpSlice = Array.from(
                f32.slice(VP_MATRIX_OFFSET, VP_MATRIX_OFFSET + 16)
              ).map((value) => Number(value.toFixed(4)));
              console.debug('WebGPU VP matrix', {
                canvasId,
                debugFlag: f32[18],
                vp: vpSlice,
              });
            } catch (err) {
              /* ignore diagnostics issues */
            }
          }
        }
      } else if (debugOverlayEl && !state.debugOverlay) {
        try {
          debugOverlayEl.style.display = 'none';
        } catch (err) {
          /* ignore */
        }
      }

      const cellsOuter = nTheta * nZ;
      const cellsInner = nTheta * innerSeg;
      const cellsBottomTop = nTheta * bottomRings;
      const cellsBottomUnder = cellsBottomTop;
      const cellsRim = nTheta * rimRings;
      const cellsDrain = nTheta * bottomRings; // Drain cylinder wall
      const totalCells =
        cellsOuter + cellsInner + cellsBottomTop + cellsBottomUnder + cellsRim + cellsDrain;
      const totalVerts = totalCells * 6;
      const desiredCounts: GeometrySnapshot = {
        nTheta,
        nZ,
        innerSeg,
        bottomRings,
        rimRings,
        totalVerts,
      };

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
        const errorCode: WebGPUErrorCode =
          invalidReason === 'overflow' ? 'webgpu:index-overflow' : 'webgpu:invalid-vertex-count';
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
        emitDiagnostic(errorCode, detail);
        emitErrorEvent({
          code: errorCode,
          message: statusBase,
          detail:
            invalidReason === 'overflow'
              ? `totalVerts=${totalVerts}`
              : 'Computed vertex count was non-finite or zero',
          fatal: invalidReason === 'overflow',
          context: { ...detail, fallbackUsed: Boolean(lastValidGeometry) },
        });
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

      current.nTheta = Math.max(3, Math.min(resolvedCounts.nTheta, 4096));
      current.nZ = Math.max(3, Math.min(resolvedCounts.nZ, 2048));
      current.innerSegments = Math.max(1, Math.min(resolvedCounts.innerSeg, 2048));
      current.bottom_rings = resolvedCounts.bottomRings;
      current.rim_rings = resolvedCounts.rimRings;
      current.t_wall = cfg.t_wall;
      current.t_bottom = cfg.t_bottom;
      current.rotX = state.rotX;
      current.rotY = state.rotY;
      current.zoom = state.zoom;
      current.panX = state.panX;
      current.panY = state.panY;
      current.cameraNonce = lastCameraNonce ?? undefined;
      current.scenePadding = paddingHint;
      current.projection = state.projectionMode;

      const drawVerts = resolvedCounts.totalVerts + 9;
      const safeDrawVerts = Math.max(0, Math.min(MAX_VERTS, Math.floor(drawVerts)));
      if (!Number.isFinite(safeDrawVerts) || safeDrawVerts <= 0) {
        emitDiagnostic('webgpu:skip-draw', {
          reason: 'zero-vertices',
          desiredCounts,
          resolvedCounts,
          canvasId: mountCanvasId,
        });
        if (import.meta.env.DEV) console.debug('[WebGPU:diag] skip-draw', { desiredCounts, resolvedCounts });
        return;
      }
      totalDrawnVerts += safeDrawVerts;

      const uniformDirty =
        state.cameraDirty ||
        state.recentParamUpdate ||
        state.interacting ||
        hadPayload ||
        lodActive;
      // Compute a compact signature of camera AND geometry-relevant fields so we
      // can avoid writing to the GPU uniform buffer if nothing affecting the
      // shader uniforms has changed. Writing buffers is expensive on some
      // drivers; when idle frames or repeated state are encountered, skip the
      // write to reduce CPU / GPU sync.
      // Use display values (if set) for signature so autorotate and drag cause uniform writes
      const sigRotX = state.displayRotX ?? state.rotX ?? 0;
      const sigRotY = state.displayRotY ?? state.rotY ?? 0;
      // Include geometry parameters in signature for immediate slider response
      // CRITICAL: Include canvasAspect so resize during grey mode triggers uniform write
      // CRITICAL: Include spin (f32[4-6]), drain (f32[13]), bell (f32[14-15,72]), wall/bottom (f32[25-26]) for live updates
      const geoSig = `${f32[0]}_${f32[1]}_${f32[2]}_${f32[3]}_${f32[4]}_${f32[5]}_${f32[6]}_${f32[16]}_${f32[17]}_${f32[7]}_${f32[8]}_${f32[13]}_${f32[25]}_${f32[26]}_${f32[14]}_${f32[15]}_${f32[72]}_${f32[73]}`;
      const uniformSignature = `${sigRotX}_${sigRotY}_${state.zoom ?? 1}_${state.panX ?? 0}_${state.panY ?? 0}_${state.projectionMode}_${String(state.displayCamQuat ?? state.camQuat)}_${geoSig}_${state.canvasAspect}`;
      __lastUniformSignature = __lastUniformSignature ?? null;
      const lastUniformSignature = __lastUniformSignature;
      const parityUniformPending = isUniformParityRewritePending(state);
      const shouldWriteUniforms = parityUniformPending || (uniformDirty && uniformSignature !== lastUniformSignature);
      if (shouldWriteUniforms) {
        lastOperation = 'write-uniforms';
        __lastUniformSignature = uniformSignature;
        device.queue.writeBuffer(uniformBuffer, 0, f32.buffer as ArrayBuffer);
        clearUniformParityRewriteFlag(state);
        // Emit a compact diagnostic snapshot of key uniform params for debugging
        const Hval = Number(f32[0]);
        const Rtval = Number(f32[1]);
        const Rbval = Number(f32[2]);
        // Throttle uniform debug emissions to avoid flooding diagnostics
        const __now = performance.now();
        const __lastUniform = __lastUniformEmitMs ?? 0;
        if (__now - __lastUniform > 250) {
          __lastUniformEmitMs = __now;
          // Throttled debug log for uniform writes
          try {
            const now = performance.now();
            if (debugEnabled && now - lastUniformEmit >= 2000) {
              lastUniformEmit = now;
              emitDiagnostic('webgpu:uniform-write', {
                H: height,
                Rt: state.t_wall,
                Rb: state.t_bottom,
                panX: state.panX,
                panY: state.panY,
                zoom: state.zoom,
                canvasId: mountCanvasId,
                cameraSeq: cameraBroadcaster.getSequence(),
              });
            }
          } catch (err) { /* ignore */ }
          if (debugEnabled) console.debug('[WebGPU:diag] uniforms', { H: Hval, Rt: Rtval, Rb: Rbval, panX: state.panX, panY: state.panY, zoom: state.zoom });
        }
      }

      const gradientSignature = JSON.stringify(cfg.gradient ?? null);
      if (gradientSignature !== lastGradientSignature) {
        lastOperation = 'write-gradient';
        bufferWriter.writeGradient(colorBuffers, cfg.gradient);
        lastGradientSignature = gradientSignature;
      }

      const bg = cfg.background_gradient ?? cfg.background ?? cfgMounted.__pf_bg_gradient ?? null;
      const bgAngle = cfg.gradient_angle ?? 0;
      const bgSignature = JSON.stringify(bg) + '_' + bgAngle;
      if (bgSignature !== lastBgSignature) {
        bufferWriter.writeBackgroundGradient(bgBuffers, bg, bgAngle);
        lastBgSignature = bgSignature;
      }

      const desiredAlphaMode = resolveAlphaMode(cfgMounted.__pf_bg_mode);
      if (desiredAlphaMode !== currentAlphaMode) {
        currentAlphaMode = desiredAlphaMode;
        // Update ResizeManager's alpha mode (which also reconfigures context)
        resizeManager.setAlphaMode(currentAlphaMode);
      }

      const clearTuple = parseClearColor((cfg as Record<string, unknown>).__pf_bg_rgba);
      const clearValue = { r: clearTuple[0], g: clearTuple[1], b: clearTuple[2], a: clearTuple[3] };

      lastOperation = 'create-encoder';
      const encoder = device.createCommandEncoder({ label: 'component:frame-encoder' });
      let textureView: GPUTextureView | null = null;
      try {
        textureView = context.getCurrentTexture().createView({ label: 'component:swapchain-view' });
      } catch (err) {
        emitDiagnostic('webgpu:get-current-texture-failed', {
          error: err instanceof Error ? err.message : String(err),
          canvasId: mountCanvasId,
        });
        try {
          context.configure({ device, format, alphaMode: currentAlphaMode });
          textureView = context.getCurrentTexture().createView({ label: 'component:swapchain-view' });
        } catch (cfgErr) {
          emitDiagnostic('webgpu:context-reconfigure-failed', {
            error: cfgErr instanceof Error ? cfgErr.message : String(cfgErr),
            canvasId: mountCanvasId,
          });
          textureView = null;
        }
        if (!textureView) {
          console.error('[WebGPU] textureView creation failed (null view)');
          emitDiagnostic('webgpu:get-current-texture-retry-failed', {
            canvasId: mountCanvasId,
          });
          return;
        }
      }
      const depthView = depth ? depth.createView({ label: 'component:depth-view' }) : null;

      // If the VP matrix or camera eye remained invalid, perform a clear-to-magenta
      // fallback so the user sees a diagnostic frame instead of a blank canvas.
      const vpValid = (() => {
        for (let i = 0; i < 16; i += 1) {
          if (!Number.isFinite(f32[VP_MATRIX_OFFSET + i])) return false;
        }
        return Number.isFinite(f32[CAMERA_EYE_OFFSET + 0]) && Number.isFinite(f32[CAMERA_EYE_OFFSET + 1]) && Number.isFinite(f32[CAMERA_EYE_OFFSET + 2]);
      })();
      if (!vpValid) {
        emitDiagnostic('webgpu:fallback-magenta', { canvasId: mountCanvasId });
        const magentaPassDesc: GPURenderPassDescriptor = {
          label: 'component:magenta-pass',
          colorAttachments: [
            {
              view: textureView!,
              clearValue: { r: 1.0, g: 0.0, b: 1.0, a: 1.0 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
          ...(depthView && {
            depthStencilAttachment: {
              view: depthView,
              depthClearValue: 1.0,
              depthLoadOp: 'clear' as const,
              depthStoreOp: 'store' as const,
            },
          }),
        };
        const pass = encoder.beginRenderPass(magentaPassDesc);
        pass.end();
        device.queue.submit([encoder.finish()]);
        return;
      }

      validationFrameCounter += 1;
      const shouldValidate = debugActive || debugEnabled || validationFrameCounter % 60 === 0;
      if (shouldValidate) {
        device.pushErrorScope('validation');
      }
      const renderPassDesc: GPURenderPassDescriptor = {
        label: 'component:main-pass',
        colorAttachments: [
          {
            view: textureView,
            clearValue,
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        ...(depthView && {
          depthStencilAttachment: {
            view: depthView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear' as const,
            depthStoreOp: 'store' as const,
          },
        }),
      };
      // Throttle verbose diagnostics to avoid flooding the host; only emit when validation
      // triggers (debug mode on) or once every ~60 frames.
      if (shouldValidate) {
        emitDiagnostic('webgpu:draw-call', {
          drawCount: safeDrawVerts,
          canvasId: mountCanvasId,
          cameraEye: cameraRig.eye,
          pivot: state.pivot,
          vpValid,
        });
      }
      // Emit a compact geometry summary to help diagnose missing pot geometry
      if (shouldValidate) {
        try {
          emitDiagnostic('webgpu:geometry-summary', {
            nTheta: Number(f32[16]),
            nZ: Number(f32[17]),
            innerSegments: Number(f32[27]),
            bottomRings: Number(f32[28]),
            rimRings: Number(f32[30]),
            totalVerts: Number(resolvedCounts.totalVerts),
            safeDrawVerts,
            canvasId: mountCanvasId,
          });
        } catch (err) {
          /* ignore */
        }
      }
      // Small summary of render state to help debug invisible frames
      try {
        const renderStateDetail: Record<string, unknown> = {
          clearValue,
          depthFormatUsed,
          pipelineLabel: pipeline.label ?? null,
          bindGroupLayoutPresent: pipeline.getBindGroupLayout(0) ? true : false,
          totalVerts: resolvedCounts.totalVerts,
          nTheta: resolvedCounts.nTheta,
          nZ: resolvedCounts.nZ,
          H: Number(f32[0]),
          Rt: Number(f32[1]),
          Rb: Number(f32[2]),
          sceneRadius: Number(f32[33]),
          cameraNear: cameraRig.near,
          cameraFar: cameraRig.far,
        };
        emitDiagnostic('webgpu:render-state', renderStateDetail);
        if (debugEnabled) console.debug('[WebGPU:diag] render-state', renderStateDetail);
      } catch (err) {
        /* ignore */
      }

      // Frustum check for a few sample points (center / top / bottom) to detect off-screen camera
      if (shouldValidate) {
        try {
          const proj = cameraRig.viewProjection;
          const pivotZ = state.pivot?.[2] ?? 0;
          const toNDC = (world: Vec3): { inside: boolean; ndc: [number, number, number] | null } => {
            const clip = mulMat4Vec4Full(proj, world[0], world[1], world[2]);
            if (!Number.isFinite(clip.w) || Math.abs(clip.w) < 1e-6) return { inside: false, ndc: null };
            const ndc_x = clip.x / clip.w;
            const ndc_y = clip.y / clip.w;
            const ndc_z = clip.z / clip.w;
            const inside = Math.abs(ndc_x) <= 1 && Math.abs(ndc_y) <= 1 && ndc_z >= 0 && ndc_z <= 1;
            return { inside, ndc: [ndc_x, ndc_y, ndc_z] };
          };
          const centerW: Vec3 = [0, 0, pivotZ + Math.max(0, height * 0.5)];
          const topW: Vec3 = [0, 0, pivotZ + Math.max(0, height)];
          const botW: Vec3 = [0, 0, pivotZ];
          const centerCheck = toNDC(centerW);
          const topCheck = toNDC(topW);
          const botCheck = toNDC(botW);
          emitDiagnostic('webgpu:frustum-check', { centerCheck, topCheck, botCheck, canvasId: mountCanvasId });
          if (debugEnabled) console.debug('[WebGPU:diag] frustum-check', { centerCheck, topCheck, botCheck });
        } catch (e) {
          /* ignore */
        }
      }

      // Check wireframe state before starting render pass
      const showWireframe = cfg.showWireframe === true && wireframePipeline && wireframeBindGroup;

      // Emit diagnostic if enabled (throttled)
      try {
        const now = performance.now();
        if (debugEnabled && now - lastDrawEmit >= 2000) {
          lastDrawEmit = now;
          manager.debug('webgpu:draw-call', `Draw call: ${safeDrawVerts} tris`, {
            drawCount: safeDrawVerts,
            cameraEye: cameraRig.eye,
            pivot: state.pivot ?? [0, 0, 0]
          }, 'draw-call');
        }
      } catch (err) {/* ignore */ }

      lastOperation = 'begin-pass';

      // Dynamic Pipeline Update logic
      // CRITICAL FIX: Use current.styleId (updated by React) instead of cfg.style (stale initial config)
      const reqStyleId = typeof current.styleId === 'number' ? current.styleId : (Number(cfg.style) || 0);

      // Debug log only when style changes or is pending
      if (import.meta.env.DEV && (reqStyleId !== activePipelineStyleId || pendingPipelineStyleId !== null)) {
        if (frameCounter % 60 === 0) {
          console.log(`[WebGPU] Pipeline State: req=${reqStyleId}, active=${activePipelineStyleId}, pending=${pendingPipelineStyleId}`);
        }
      }

      if (reqStyleId !== activePipelineStyleId) {
        // If we haven't requested this style yet, start compilation
        if (reqStyleId !== pendingPipelineStyleId) {
          if (import.meta.env.DEV) console.log(`[WebGPU] Style change detected! ${activePipelineStyleId} -> ${reqStyleId}. Initiating compilation...`);
          pendingPipelineStyleId = reqStyleId;
          getOrCreatePipeline(reqStyleId).then((p) => {
            if (p) {
              if (import.meta.env.DEV) console.log(`[WebGPU] Pipeline for style ${reqStyleId} ready. Swapping now.`);
              activePipeline = p;
              activePipelineStyleId = reqStyleId;
              pendingPipelineStyleId = null;
              // CRITICAL: Recreate bind group to match new pipeline layout
              try {
                // Ensure bindGroup is updated to match the new pipeline's layout
                bindGroup = createMainBindGroup(activePipeline);
              } catch (e) { console.error('[WebGPU] Failed to recreate BG', e); }
              // Force a redraw to show new style immediately
              state.cameraDirty = true;
            } else {
              console.error(`[WebGPU] Failed to load pipeline for style ${reqStyleId}. Retaining current.`);
              // Failed? Reset pending so we can retry or fallback
              pendingPipelineStyleId = null;
            }
          });
        }
        // Optimization: Do NOT render this frame if we are mismatched style/pipeline.
        // Rendering style A parameters with style B pipeline produces "jumbled geometry".
        // Just return and wait for next frame (or show loading spinner overlay if needed).
        if (!activePipeline) {
          // Throttle loop if no pipeline is ready to avoid 100% CPU/GPU usage
          // FIX: Do NOT schedule a new frame here; the main frame loop handles it.
          // Just return early.
          return;
        }
        // Optionally, one could continue rendering the OLD style (to avoid flickering black)
        // BUT if the parameters have already updated to the NEW style, it will look broken.
        // Current behavior: State parameters update instantly, pipeline updates async.
        // Fix: Use the ACTIVE pipeline style for parameter synchronization, or skip draw.
        // Here we choose to skip the draw pass to avoid the "broken cylinder" flash.
        // FIX: Do NOT schedule a new frame here.
        return;
      }

      const pass = encoder.beginRenderPass(renderPassDesc);
      pass.setPipeline(activePipeline || pipeline); // Fallback to initial pipeline if active is somehow null
      pass.setBindGroup(0, bindGroup);
      lastOperation = 'draw-main';
      pass.draw(safeDrawVerts);
      totalDrawCalls += 1;

      // Draw wireframe overlay in the SAME render pass if enabled
      if (showWireframe) {
        pass.setPipeline(wireframePipeline!);
        pass.setBindGroup(0, wireframeBindGroup!);
        // Each solid vertex becomes 2 wireframe verts (line endpoints)
        const wireframeVerts = safeDrawVerts * 2;
        lastOperation = 'draw-wireframe';
        pass.draw(wireframeVerts);
        totalDrawCalls += 1;
        pass.draw(wireframeVerts);
        totalDrawCalls += 1;
        if (import.meta.env.DEV) console.debug('[WebGPU:diag] wireframe-draw', { wireframeVerts, solidVerts: safeDrawVerts });
      }

      if (debugSegmentsBuffer && debugSegmentsCount > 0) {
        if (!debugLinePipeline || debugPipelineStyleId !== activePipelineStyleId) {
          if (import.meta.env.DEV) console.log(`[WebGPU] Creating debug pipeline for style ${activePipelineStyleId}...`);
          const styleToLoad = activePipelineStyleId;
          createDebugPipeline(styleToLoad).then(p => {
            if (p && !disposed) {
              debugLinePipeline = p;
              debugPipelineStyleId = styleToLoad;
              // Create bind group with only the bindings used by the debug shader (0 and 4)
              try {
                debugBindGroup = createDebugBindGroup(p);
              } catch (e) { console.warn('[WebGPU] Debug BG failed', e); }
            }
          });
        }

        if (debugLinePipeline && debugBindGroup && debugPipelineStyleId === activePipelineStyleId) {
          /* if (frameCounter % 120 === 0) {
            console.log(`[WebGPU] RENDER: Drawing ${debugSegmentsCount} debug verts (Style: ${debugPipelineStyleId})`);
          } */
          pass.setPipeline(debugLinePipeline);
          pass.setBindGroup(0, debugBindGroup);
          pass.setVertexBuffer(0, debugSegmentsBuffer!);
          pass.draw(debugSegmentsCount);
          totalDrawCalls += 1;
        } else if (import.meta.env.DEV && debugSegmentsCount > 0 && frameCounter % 120 === 0) {
          console.log(`[WebGPU] RENDER SKIP: pipeline=${!!debugLinePipeline}, bg=${!!debugBindGroup}, styleMatch=${debugPipelineStyleId === activePipelineStyleId} (Debug: ${debugPipelineStyleId}, Active: ${activePipelineStyleId})`);
        }
      }

      // --- DEBUG POINTS (green peak point cloud, v15.0) ---
      if (debugPointsBuffer && debugPointsCount > 0) {
        if (!debugPointsPipeline || debugPointsPipelineStyleId !== activePipelineStyleId) {
          const styleToLoad = activePipelineStyleId;
          createDebugPointsPipeline(styleToLoad).then(p => {
            if (p && !disposed) {
              debugPointsPipeline = p;
              debugPointsPipelineStyleId = styleToLoad;
              try {
                debugPointsBindGroup = device.createBindGroup({
                  label: 'component:bind-group-debug-points',
                  layout: p.getBindGroupLayout(0),
                  entries: [
                    { binding: 0, resource: { buffer: uniformBuffer } },
                    { binding: 4, resource: { buffer: styleParamBuffer } },
                  ],
                });
              } catch (e) { console.warn('[WebGPU] Debug points BG failed', e); }
            }
          });
        }

        if (debugPointsPipeline && debugPointsBindGroup && debugPointsPipelineStyleId === activePipelineStyleId) {
          pass.setPipeline(debugPointsPipeline);
          pass.setBindGroup(0, debugPointsBindGroup);
          pass.setVertexBuffer(0, debugPointsBuffer!);
          pass.draw(debugPointsCount);
          totalDrawCalls += 1;
        }
      }

      pass.end();

      const commandBuffer = encoder.finish({ label: 'component:frame-command-buffer' });
      lastOperation = 'submit';
      device.queue.submit([commandBuffer]);
      frameCounter += 1;
      if (frameCounter === 1) {
        console.info(`[WebGPU] First Frame Drawn at ${(performance.now() / 1000).toFixed(3)}s`);
      }
      try {
        manager.setFrameCounters({ frames: frameCounter, draws: totalDrawCalls, verts: totalDrawnVerts });
      } catch (err) {
        /* ignore telemetry errors */
      }

      if (shouldValidate) {
        device
          .popErrorScope()
          .then((error: GPUError | null) => {
            if (error) {
              console.warn('WebGPU validation', error);
              const detail = typeof error === 'string' ? error : error.message ?? 'validation error';
              setStatus(`WebGPU • ${detail}`);
              emitDiagnostic('webgpu:validation-error', { detail });
            }
          })
          .catch(() => {
            /* no-op */
          });
      }
      // Draw axis overlay using camera rig if enabled
      try {
        if (axisCtx && state.showAxis) {
          drawAxisIndicator(axisCtx, cameraRig);
        } else if (axisCtx) {
          // clear if disabled
          const c = axisCtx.canvas as HTMLCanvasElement;
          axisCtx.clearRect(0, 0, c.width, c.height);
        }
      } catch (err) {
        /* ignore overlay draw errors */
      }
    } catch (err) {
      try {
        emitDiagnostic('webgpu:error', { reason: 'updateAndDraw exception', error: String(err), canvasId: mountCanvasId });
      } catch (e) {
        /* ignore */
      }
      try {
        console.error('WebGPU • updateAndDraw threw', err);
      } catch (e) {
        /* ignore */
      }
      state.cameraDirty = true;
      return;
    }
  };

  if (typeof initialParams.autoRotate === 'boolean') {
    setAutoRotate(initialParams.autoRotate, false);
  }
  if (typeof initialParams.autoPivotFromCamera === 'boolean') {
    setAutoPivot(initialParams.autoPivotFromCamera, false);
  }
  if (typeof initialParams.rotX === 'number') {
    state.rotX = wrapAngle(initialParams.rotX);
  }
  if (typeof initialParams.rotY === 'number') {
    state.rotY = wrapAngle(initialParams.rotY);
  }
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
      state.sceneRadius = nextRadius;
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
  if (typeof initialParams.showAxis === 'boolean') {
    state.showAxis = Boolean(initialParams.showAxis);
    updateAxisButton();
  }

  // wheel and dblclick event listeners now managed by PointerEventRouter (Phase 15)
  // Host camera accept policy button (cycles: grace -> always -> strict)
  const updateHostPolicyButton = (): void => {
    const btn = resolveControlsButton('[data-wgpu-action="host-policy"]');
    if (!btn || !cameraController) return;
    btn.dataset.state = cameraController.hostCameraAcceptPolicy;
    btn.textContent = `Host: ${cameraController.hostCameraAcceptPolicy}`;
    btn.setAttribute('aria-pressed', 'false');
  };
  const toggleHostPolicy = (): void => {
    if (!cameraController) return;
    const cur = cameraController.hostCameraAcceptPolicy;
    const next: 'always' | 'grace' | 'strict' = cur === 'grace' ? 'always' : cur === 'always' ? 'strict' : 'grace';
    cameraController.setHostCameraAcceptPolicy(next);
    updateHostPolicyButton();
  };
  const hostBtn = resolveControlsButton('[data-wgpu-action="host-policy"]');
  if (hostBtn) hostBtn.addEventListener('click', toggleHostPolicy);
  updateHostPolicyButton();

  const pivotBtn = resolveControlsButton('[data-wgpu-action="pivot-auto"]') || resolveControlsButton('#wgpu-toggle-pivot');
  const togglePivotUi = (): void => {
    toggleAutoPivot();
    updatePivotAutoButton();
  };
  if (pivotBtn) pivotBtn.addEventListener('click', togglePivotUi);
  updatePivotAutoButton();

  const bootPayload = { ...initialParams };
  current = mergeParams(current, bootPayload);
  // REMOVED: updateAndDraw(current ?? {});
  // This immediate draw call bypasses the 500ms device stabilization delay and 200ms RAF delay,
  // causing device.queue.submit() before the Windows Dawn driver is stable.
  // The first render will happen via requestAnimationFrame after the delays complete.

  let fpsFrames = 0;
  let fpsStart = performance.now();
  let lastFrameTime = performance.now();
  let rafHandle: number | null = null;
  // let disposed = false; // Moved to top of scope

  // --- DEBUG LINES STATE ---
  let debugSegmentsBuffer: GPUBuffer | null = null;
  let debugSegmentsCount: number = 0;
  let debugLinePipeline: GPURenderPipeline | null = null;
  let debugBindGroup: GPUBindGroup | null = null;
  let debugPipelineStyleId: number | null = null;

  // --- DEBUG POINTS STATE (v15.0 — green peak point cloud) ---
  let debugPointsBuffer: GPUBuffer | null = null;
  let debugPointsCount: number = 0;
  let debugPointsPipeline: GPURenderPipeline | null = null;
  let debugPointsBindGroup: GPUBindGroup | null = null;
  let debugPointsPipelineStyleId: number | null = null;

  // Thin wrappers delegating to DebugPipelineFactory (Phase 10 extraction)
  const createDebugPipeline = (styleId: number): Promise<GPURenderPipeline | null> => {
    return debugPipelineFactory.createDebugLinesPipeline(styleId);
  };

  const createDebugPointsPipeline = (styleId: number): Promise<GPURenderPipeline | null> => {
    return debugPipelineFactory.createDebugPointsPipeline(styleId);
  };

  // Idle detection for resource savings
  // DEFER creation until after first animation frame to prevent
  // visibility change events from destabilizing GPU initialization.
  let idleDetector: ReturnType<typeof createIdleDetector> | null = null;
  let idleDetectorInitialized = false;

  const ensureIdleDetector = () => {
    if (idleDetectorInitialized || disposed) return;
    idleDetectorInitialized = true;
    idleDetector = createIdleDetector({
      idleTimeoutMs: 30_000, // 30 seconds of inactivity
      onVisibilityChange: (isVisible) => {
        if (disposed) return;
        if (isVisible) {
          // Resume immediately when tab becomes visible
          if (import.meta.env.DEV) console.debug('[WebGPU] Tab visible, resuming full render rate');
        } else {
          if (import.meta.env.DEV) console.debug('[WebGPU] Tab hidden, pausing render');
        }
      },
    });
  };

  const applyParamPayload = (payload?: WebGPUParams | null): void => {
    if (disposed) {
      return;
    }
    if (!payload) {
      return;
    }
    if (typeof payload.autoRotate === 'boolean') {
      setAutoRotate(payload.autoRotate, false);
    }
    if (isCameraMode(payload.cameraMode)) {
      if (payload.cameraMode !== state.cameraMode) {
        setCameraMode(payload.cameraMode);
      }
    } else if (typeof payload.useArcball === 'boolean') {
      const targetOrbitMode: CameraMode = payload.useArcball ? 'arcball' : 'turntable';
      if (targetOrbitMode !== state.cameraMode) {
        setCameraMode(targetOrbitMode);
      }
    }
    if (typeof payload.rotX === 'number') {
      state.rotX = wrapAngle(payload.rotX);
      state.cameraDirty = true;
    }
    if (typeof payload.rotY === 'number') {
      state.rotY = wrapAngle(payload.rotY);
      state.cameraDirty = true;
    }
    if (typeof payload.zoom === 'number') {
      state.zoom = payload.zoom;
      state.cameraDirty = true;
    }
    if (typeof payload.sceneRadius === 'number') {
      const nextRadius = Math.max(
        Math.abs(clampNumber(payload.sceneRadius, state.sceneRadius)),
        1
      );
      if (Math.abs(nextRadius - state.sceneRadius) > CAMERA_EPSILON) {
        const prev = state.sceneRadius;
        state.sceneRadius = nextRadius;
        try {
          const mounts = typeof window !== 'undefined' ? window.__pf_webgpu_mounts : __pf_webgpu_mounts;
          const dbg = mountCanvasId ? mounts?.[mountCanvasId]?.debug : undefined;
          if (dbg) dbg.lastSceneRadiusUpdate = { prev, next: nextRadius, timestamp: Date.now() };
        } catch (err) { /* ignore */ }
        state.cameraDirty = true;
      }
    }
    if (typeof payload.projection === 'string') {
      const nextMode = payload.projection === 'perspective' ? 'perspective' : 'ortho';
      if (state.projectionMode !== nextMode) {
        state.projectionMode = nextMode;
        state.cameraDirty = true;
        updateProjectionButton();
      }
    }
    if (typeof payload.debug === 'boolean') {
      state.debugOverlay = Boolean(payload.debug);
      updateDebugButton();
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
    }
    if (Array.isArray(payload.freePosition) && payload.freePosition.length >= 3) {
      const [fx, fy, fz] = payload.freePosition as number[];
      if ([fx, fy, fz].every((v) => Number.isFinite(v))) {
        state.freePosition = [fx, fy, fz];
        state.cameraDirty = true;
      }
    }
    if (typeof payload.freeSpeed === 'number' && Number.isFinite(payload.freeSpeed)) {
      state.freeSpeed = Math.max(0.1, payload.freeSpeed);
    }
    if (typeof payload.paramUpdateNonce === 'number' && payload.paramUpdate !== false) {
      state.lastParamNonce = payload.paramUpdateNonce;
      state.lastParamUpdate = performance.now();
      state.recentParamUpdate = state.interactiveLodEnabled;
    }
    updateAndDraw(payload);
    if (payload && typeof payload.hostCameraAcceptPolicy === 'string') {
      try {
        if (cameraController && typeof cameraController.setHostCameraAcceptPolicy === 'function') {
          const policy = (payload.hostCameraAcceptPolicy as 'always' | 'grace' | 'strict');
          cameraController.setHostCameraAcceptPolicy(policy);
        }
      } catch (err) { /* ignore */ }
    }
    if (payload && typeof payload.hostCameraGraceMs === 'number') {
      try {
        if (cameraController && typeof cameraController.setLocalCameraGraceMs === 'function') {
          cameraController.setLocalCameraGraceMs(Number(payload.hostCameraGraceMs));
        }
      } catch (err) {/* ignore */ }
    }
  };

  const frame = (): void => {
    if (disposed) {
      return;
    }

    if (!current) {
      rafHandle = requestAnimationFrame(frame);
      return;
    }

    // Initialize idle detector on first frame (deferred to avoid visibility race during boot)
    ensureIdleDetector();

    // Force active mode when auto-rotate or animations are running
    const hasActiveAnimations = state.autoRotate ||
      (cameraController && cameraController.focusTween) ||
      Math.abs(state.inertiaRotY) > 1e-6 ||
      Math.abs(state.inertiaRotX) > 1e-6 ||
      Math.abs(state.inertiaPanX) > 1e-4 ||
      Math.abs(state.inertiaPanY) > 1e-4 ||
      Math.abs(state.inertiaArcSpeed as number || 0) > 1e-6;

    idleDetector?.setForceActive(Boolean(hasActiveAnimations));

    // Skip frame if idle (throttles to ~2 FPS when user inactive)
    // Only check if idleDetector is initialized; before that, render at full rate
    if (idleDetector && !idleDetector.shouldRenderFrame()) {
      rafHandle = requestAnimationFrame(frame);
      return;
    }

    const now = performance.now();
    const deltaMs = now - lastFrameTime;
    lastFrameTime = now;
    if (state.interacting && now - state.lastInteraction > INTERACTION_TIMEOUT_MS && !(cameraController && cameraController.focusTween)) {
      state.interacting = false;
    }

    let cameraMutated = false;

    // Smooth pivot transitions for professional CAD-like feel
    if (state.targetPivot && state.pivot) {
      const pivotLerp = PIVOT_LERP_SPEED;
      const snapThreshold = PIVOT_SNAP_THRESHOLD;
      const dx = (state.targetPivot as Vec3)[0] - state.pivot[0];
      const dy = (state.targetPivot as Vec3)[1] - state.pivot[1];
      const dz = (state.targetPivot as Vec3)[2] - state.pivot[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < snapThreshold) {
        // Snap to target
        state.pivot = [...state.targetPivot as Vec3] as Vec3;
        state.targetPivot = null;
      } else {
        // Lerp toward target
        state.pivot = [
          state.pivot[0] + dx * pivotLerp,
          state.pivot[1] + dy * pivotLerp,
          state.pivot[2] + dz * pivotLerp,
        ] as Vec3;
        cameraMutated = true;
      }
    }

    if (cameraController && cameraController.focusTween) {
      const ft = cameraController.focusTween;
      const elapsed = now - ft.startTime;
      const t = Math.min(1, Math.max(0, elapsed / Math.max(1, ft.duration)));
      const eased = easeOutCubic(t);
      state.panX = lerp(ft.startPanX, ft.targetPanX, eased);
      state.panY = lerp(ft.startPanY, ft.targetPanY, eased);
      state.zoom = clampZoomValue(lerp(ft.startZoom, ft.targetZoom, eased));
      // Slerp orientation if focusTween contains quaternion targets
      if (ft.startQuat && ft.targetQuat) {
        const q = slerpQuaternion(ft.startQuat, ft.targetQuat, eased);
        const rotated = basisFromQuaternion(q);
        state.displayCamQuat = [...q] as Quaternion;
        state.displayCamRight = [...rotated.right];
        state.displayCamUp = [...rotated.up];
        state.displayCamForward = [...rotated.forward];
        const angles = cbSyncAnglesFromBasis(rotated);
        state.displayRotX = angles.rotX;
        state.displayRotY = angles.rotY;
      }
      updatePivotFromPan();
      cameraMutated = true;
      if (t >= 0.999) {
        cameraController.cancelFocusTween();
        requestCameraEmitWhenStatic();
      }
    }
    if (applyFreeKeyboardInput(deltaMs)) {
      cameraMutated = true;
      markInteraction();
      requestCameraEmitWhenStatic();
    }
    if (!pointer.active) {
      if (
        state.cameraMode === 'arcball' &&
        state.inertiaArcAxis &&
        Math.abs(state.inertiaArcSpeed) > 1e-6
      ) {
        const baseQuat = (state.displayCamQuat ?? state.camQuat) as Quaternion;
        // integrate angular speed (rad/sec) over the frame delta
        const deltaAngle = (state.inertiaArcSpeed as number) * (deltaMs / 1000);
        const deltaQuat = quaternionFromAxisAngle(state.inertiaArcAxis, deltaAngle);
        const nextQuat = multiplyQuaternions(deltaQuat, baseQuat);
        const rotated = basisFromQuaternion(nextQuat);
        state.displayCamQuat = [...nextQuat] as Quaternion;
        state.displayCamRight = [...rotated.right];
        state.displayCamUp = [...rotated.up];
        state.displayCamForward = [...rotated.forward];
        const { rotX, rotY } = cbSyncAnglesFromBasis({
          right: rotated.right,
          up: rotated.up,
          forward: rotated.forward,
        } as HelperCameraBasis);
        state.displayRotX = rotX;
        state.displayRotY = rotY;
        // Apply exponential decay over delta time
        const decayFactor = Math.exp(-INERTIA_LAMBDA * (deltaMs / 1000));
        state.inertiaArcSpeed *= decayFactor;
        if (Math.abs(state.inertiaArcSpeed) < 1e-3) {
          state.inertiaArcSpeed = 0;
          state.inertiaArcAxis = null;
        }
        cameraMutated = true;
      }
      if (Math.abs(state.inertiaRotY) > 1e-6 || Math.abs(state.inertiaRotX) > 1e-6) {
        // Ensure we have transient rotation angles
        if (state.displayRotX === null || state.displayRotY === null) {
          state.displayRotX = state.rotX;
          state.displayRotY = state.rotY;
        }
        // Apply angular inertia scaled by delta time (in rad/sec)
        state.displayRotY = wrapTau((state.displayRotY as number) + (state.inertiaRotY as number) * (deltaMs / 1000));
        const pitchLimit = Math.PI * 0.5 - 0.009;
        state.displayRotX = clamp((state.displayRotX as number) + (state.inertiaRotX as number) * (deltaMs / 1000), -pitchLimit, pitchLimit);
        const inertiaBasis = applyCameraEulerToBasis(state.displayRotX as number, state.displayRotY as number);
        state.displayCamRight = [...inertiaBasis.right];
        state.displayCamUp = [...inertiaBasis.up];
        state.displayCamForward = [...inertiaBasis.forward];
        // Decay angular velocities over delta time
        const decayFactorRot = Math.exp(-INERTIA_LAMBDA * (deltaMs / 1000));
        state.inertiaRotY *= decayFactorRot;
        state.inertiaRotX *= decayFactorRot;
        if (Math.abs(state.inertiaRotY) < 1e-6) {
          state.inertiaRotY = 0;
        }
        if (Math.abs(state.inertiaRotX) < 1e-6) {
          state.inertiaRotX = 0;
        }
        cameraMutated = true;
      }
      if (Math.abs(state.inertiaPanX) > 1e-4 || Math.abs(state.inertiaPanY) > 1e-4) {
        // Integrate per-second pan velocity over delta time
        state.panX += (state.inertiaPanX as number) * (deltaMs / 1000);
        state.panY += (state.inertiaPanY as number) * (deltaMs / 1000);
        const decayFactorPan = Math.exp(-INERTIA_LAMBDA * (deltaMs / 1000));
        state.inertiaPanX *= decayFactorPan;
        state.inertiaPanY *= decayFactorPan;
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
      // Professional autorotate: orbits camera around the pot at user's current view angle
      const now = performance.now();
      const shouldRotate = !state.autoRotateResumeAt || now >= state.autoRotateResumeAt;

      if (shouldRotate) {
        // Use configurable speed (radians per second) and delta time
        const rotationSpeed = state.autoRotateSpeed ?? AUTOROTATE_SPEED_DEFAULT;
        const deltaRotation = rotationSpeed * (deltaMs / 1000);

        // For arcball mode: use pure quaternion rotation around world Z axis
        // This preserves full rotation freedom without Euler angle limitations
        if (state.cameraMode === 'arcball') {
          // Get current quaternion (display or committed)
          const currentQuat: Quaternion = state.displayCamQuat ?? state.camQuat ?? [0, 0, 0, 1];

          // Create rotation delta around world Z axis (vertical)
          const WORLD_UP: Vec3 = [0, 0, 1];
          const deltaQuat = quaternionFromAxisAngle(WORLD_UP, deltaRotation);

          // Apply rotation: deltaQuat * currentQuat (pre-multiply for world-space rotation)
          const nextQuat = multiplyQuaternions(deltaQuat, currentQuat);
          const autoBasis = basisFromQuaternion(nextQuat);

          state.displayCamRight = autoBasis.right;
          state.displayCamUp = autoBasis.up;
          state.displayCamForward = autoBasis.forward;
          state.displayCamQuat = nextQuat;

          // Sync Euler angles for UI compatibility (but don't use them for rotation)
          const { rotX, rotY } = cbSyncAnglesFromBasis(autoBasis);
          state.displayRotX = rotX;
          state.displayRotY = rotY;
        } else {
          // Turntable/free mode: use Euler angles for predictable orbit
          const currentBasis = resolveActiveBasis(state);
          const currentAngles = cbSyncAnglesFromBasis(currentBasis);

          // Initialize display angles from current basis if not present
          if (state.displayRotX === null || state.displayRotY === null) {
            state.displayRotX = currentAngles.rotX;
            state.displayRotY = currentAngles.rotY;
          }

          // Orbit around the vertical axis (yaw only), keeping pitch and roll constant
          state.displayRotY = wrapTau((state.displayRotY as number) + deltaRotation);

          // Preserve rotZ (tilt) during autorotation
          const currentRotZ = state.displayRotZ ?? state.rotZ ?? 0;
          const autoQuat = quaternionFromEuler(state.displayRotX as number, state.displayRotY as number, currentRotZ);
          const autoBasis = basisFromQuaternion(autoQuat);
          state.displayCamRight = autoBasis.right;
          state.displayCamUp = autoBasis.up;
          state.displayCamForward = autoBasis.forward;
          state.displayCamQuat = autoQuat;
        }
        cameraMutated = true;
      }
    }

    if (cameraMutated) {
      state.cameraDirty = true;
      if (!state.autoRotate) {
        requestCameraEmitWhenStatic();
      }
    }

    if (cameraBroadcaster.isPendingStaticEmit() && isCameraStatic()) {
      // Before committing transient basis, ensure the camera is upright
      // when near vertical pitch: if the yaw orientation has the up vector
      // pointing screen-down, rotate yaw by π to preserve expected
      // top-down orientation for the user (prevents upside-down pot visuals).
      const currentPitch = (state.displayRotX ?? state.rotX) as number;
      const currentUpY = (state.camUp && Array.isArray(state.camUp)) ? state.camUp[1] : 0;
      const NEAR_VERTICAL_EPS = 0.04; // ~2.2° tolerance to consider 'vertical'
      if (Math.abs(Math.abs(currentPitch) - Math.PI / 2) < NEAR_VERTICAL_EPS && currentUpY < 0) {
        state.rotY = wrapAngle((state.rotY ?? 0) + Math.PI);
        applyCameraEuler(state, state.rotX, state.rotY);
        state.displayCamRight = [...state.camRight];
        state.displayCamUp = [...state.camUp];
        state.displayCamForward = [...state.camForward];
        state.displayCamQuat = [...state.camQuat] as Quaternion;
      }
      // Commit transient display basis to the persistent camera basis
      const prevRight: Vec3 = [state.camRight[0], state.camRight[1], state.camRight[2]];
      const flipped = commitDisplayBasisToState(state);
      if (flipped) {
        try {
          const dot = vec3Dot(prevRight, state.camRight);
          emitDiagnostic('camera:commit-basis-flip', { dot, canvasId: mountCanvasId });
        } catch (err) {
          /* ignore */
        }
      }
      // Emit a brief diagnostic containing the committed basis to aid
      // debugging in the host or overlay when debug is active.
      try {
        if (debugEnabled) {
          emitDiagnostic('webgpu:committed-basis', { basis: { right: state.camRight, up: state.camUp, forward: state.camForward }, canvasId: mountCanvasId });
        }
      } catch (err) {
        /* ignore */
      }
      cameraBroadcaster.clearPendingStaticEmit();
      emitCameraState(true);
    }

    updateAndDraw(current);
    fpsFrames += 1;
    if (now - fpsStart > 30000) {
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
    rafHandle = requestAnimationFrame(frame);
  };
  // CRITICAL: Delay the first frame to allow GPU driver to stabilize after device creation.
  // Without this delay, some Windows drivers crash with "Instance reference no longer exists".
  // The 200ms delay is conservative; may be reduced on stable systems.
  // Reduced first-frame delay
  setTimeout(() => {
    if (!disposed) {
      rafHandle = requestAnimationFrame(frame);
    }
  }, 10);

  markStatusReady();
  emitDiagnostic('component:ready');
  console.info('[WebGPU] component:ready', { canvasId: mountCanvasId });
  postToHost(emit, { type: 'ready', payload: { timestamp: Date.now(), canvasId: mountCanvasId } });

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    emitDiagnostic('component:dispose');
    // Note: ResizeManager.dispose() handles window resize and fullscreen event cleanup
    canvas.removeEventListener('contextmenu', preventContextMenu);
    // Pointer, wheel, touch, and double-click event listeners cleaned up by PointerEventRouter (Phase 15)
    try {
      pointerRouter?.dispose();
    } catch (e) { /* ignore cleanup errors */ }
    // Controls click handler cleaned up (Phase 16)
    try {
      controlsHandler?.dispose();
    } catch (e) { /* ignore cleanup errors */ }
    // Axis indicator renderer cleaned up (Phase 17)
    try {
      axisRenderer?.dispose();
    } catch (e) { /* ignore cleanup errors */ }
    // Clean up axis overlay (Phase 1 decomposition: single dispose() call)
    try {
      axisOverlay?.dispose();
    } catch (e) { /* ignore cleanup errors */ }
    // Clean up input manager (Phase 2 decomposition)
    try {
      inputManager?.dispose();
    } catch (e) { /* ignore cleanup errors */ }
    // Clean up toolbar button sync (Phase 8 decomposition)
    try {
      toolbar?.dispose();
    } catch (e) { /* ignore cleanup errors */ }
    // Clean up camera state broadcaster (Phase 9 decomposition)
    try {
      cameraBroadcaster?.dispose();
    } catch (e) { /* ignore cleanup errors */ }
    // NOTE: Keyboard event listeners now cleaned up by inputManager.dispose() above
    cancelCameraEmit();
    if (debugOverlayEl?.parentElement) {
      debugOverlayEl.parentElement.removeChild(debugOverlayEl);
    }
    if (rafHandle !== null) {
      cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }

    // CRITICAL: Set disposed flag BEFORE destroying buffers to prevent race conditions
    // where pending writes might try to access destroyed buffers.
    disposed = true;

    // Clean up idle detector
    try {
      if (idleDetector) {
        idleDetector.dispose();
      }
    } catch (e) { /* ignore cleanup errors */ }

    // Clean up CameraCommandRouter (Phase 18)
    try {
      commandRouter.dispose();
    } catch (e) { /* ignore cleanup errors */ }

    // Clean up ResizeManager (removes event listeners and ResizeObserver)
    try {
      resizeManager.dispose();
    } catch (e) { /* ignore */ }

    try { if (depth) depth.destroy(); } catch (e) { /* ignore */ }
    try { if (uniformBuffer) uniformBuffer.destroy(); } catch (e) { /* ignore */ }
    try { if (colorBuffers?.c1) colorBuffers.c1.destroy(); } catch (e) { /* ignore */ }
    try { if (colorBuffers?.c2) colorBuffers.c2.destroy(); } catch (e) { /* ignore */ }
    try { if (colorBuffers?.c3) colorBuffers.c3.destroy(); } catch (e) { /* ignore */ }
    try { if (bgBuffers?.c1) bgBuffers.c1.destroy(); } catch (e) { /* ignore */ }
    try { if (bgBuffers?.c2) bgBuffers.c2.destroy(); } catch (e) { /* ignore */ }
    try { if (bgBuffers?.c3) bgBuffers.c3.destroy(); } catch (e) { /* ignore */ }
    try { if (styleParamBuffer) styleParamBuffer.destroy(); } catch (e) { /* ignore */ }
    // localControlResetTimer cleanup now handled by PointerEventRouter.dispose (Phase 15)
    try { if (device) device.destroy(); } catch (e) { /* ignore */ }
  };


  if (deviceLostDuringInit) {
    dispose();
    return fail('webgpu:adapter-unavailable', 'WebGPU device lost during initialization (final check)', undefined, { ...baseDiagInfo });
  }

  let paramUpdateCount = 0;
  let paramUpdateLastFn = performance.now();

  const controller: WebGPUController = {
    updateParams: (payload?: WebGPUParams | null) => {
      // Loop detection: warn if updates exceed 60Hz
      paramUpdateCount++;
      const now = performance.now();
      if (now - paramUpdateLastFn > 1000) {
        if (paramUpdateCount > 60) {
          console.warn(`[WebGPU] High frequency param updates detected: ${paramUpdateCount}/sec. work=applyParamPayload`);
        }
        paramUpdateCount = 0;
        paramUpdateLastFn = now;
      }
      applyParamPayload(payload);
    },
    handleCameraCommand: (payload: unknown) => {
      handleCameraCommand(payload);
    },
    setAutoRotate: (value: boolean) => {
      setAutoRotate(value, true);
    },
    toggleAutoRotate: () => {
      toggleAutoRotate();
    },
    getAutoRotate: () => state.autoRotate,
    setAutoPivot: (v: boolean) => setAutoPivot(v, true),
    toggleAutoPivot: () => toggleAutoPivot(),
    getAutoPivot: () => Boolean(state.autoPivotFromCamera),
    dispose,
    setDebugSegments: (segments: Float32Array) => {
      if (disposed) return;
      if (import.meta.env.DEV) console.log(`[WebGPU] setDebugSegments: ${segments.length} floats (${segments.length / 4} segments)`);
      if (debugSegmentsBuffer) {
        debugSegmentsBuffer.destroy();
        debugSegmentsBuffer = null;
      }
      debugSegmentsCount = segments.length / 2;
      if (debugSegmentsCount > 0) {
        debugSegmentsBuffer = device.createBuffer({
          size: segments.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
          label: 'debug-segments'
        });
        new Float32Array(debugSegmentsBuffer.getMappedRange()).set(segments);
        debugSegmentsBuffer.unmap();
      }
      state.cameraDirty = true;
    },
    setDebugPoints: (points: Float32Array) => {
      if (disposed) return;
      if (import.meta.env.DEV) console.log(`[WebGPU] setDebugPoints: ${points.length} floats (${points.length / 3} points)`);
      if (debugPointsBuffer) {
        debugPointsBuffer.destroy();
        debugPointsBuffer = null;
      }
      debugPointsCount = points.length / 3; // 3 floats per point: u, t, kind
      if (debugPointsCount > 0) {
        debugPointsBuffer = device.createBuffer({
          size: points.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          mappedAtCreation: true,
          label: 'debug-points'
        });
        new Float32Array(debugPointsBuffer.getMappedRange()).set(points);
        debugPointsBuffer.unmap();
      }
      state.cameraDirty = true;
    },
  };

  return controller;
};
